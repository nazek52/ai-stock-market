import "server-only";
import { createHash } from "node:crypto";
import { MongoServerError, type Db } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";
import { getRecipient } from "./repository";

interface WelcomeOutboxDocument {
  _id: string;
  userId: string;
  status: "pending" | "dispatched";
  createdAt: Date;
  dispatchedAt?: Date;
}
export interface VerifiedUserEvent { name: "stock/user.verified"; id: string; data: { userId: string } }

const indexes = new WeakMap<Db, Promise<unknown>>();
async function welcomeCollection() {
  const db = await getDatabase();
  let index = indexes.get(db);
  if (!index) {
    index = db.collection("welcome_outbox").createIndex({ userId: 1 }, { unique: true, name: "welcome_owner_unique" });
    indexes.set(db, index);
    void index.catch(() => indexes.delete(db));
  }
  await index;
  return db.collection<WelcomeOutboxDocument>("welcome_outbox");
}

/** Auth's verification callback persists intent; it never waits for an Inngest network call. */
export async function enqueueVerifiedUser(userId: string) {
  z.string().min(1).max(128).parse(userId);
  const db = await getDatabase();
  if (!(await getRecipient(userId, db))?.emailVerified) throw new AppError("FORBIDDEN", "Account email must be verified before welcome is queued", 403);
  const id = createHash("sha256").update(`welcome:v1:${userId}`).digest("hex");
  try {
    await (await welcomeCollection()).updateOne({ _id: id }, {
      $setOnInsert: { userId, status: "pending", createdAt: new Date() },
    }, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
  }
  return { queued: true };
}

export async function collectWelcomeEvents(): Promise<VerifiedUserEvent[]> {
  const entries = await (await welcomeCollection())
    .find({ status: "pending" }).sort({ createdAt: 1, _id: 1 }).limit(100).toArray();
  return entries.map((entry) => ({ name: "stock/user.verified", id: entry._id, data: { userId: entry.userId } }));
}

/** Invoke only after durable event send acknowledges this exact snapshot. */
export async function acknowledgeWelcomeEvents(events: VerifiedUserEvent[]) {
  if (!events.length) return;
  await (await welcomeCollection()).updateMany({
    _id: { $in: events.map((event) => event.id) }, status: "pending",
  }, { $set: { status: "dispatched", dispatchedAt: new Date() } });
}

/** Repair a committed verification whose callback could not persist its intent.
 * Apply the bound AFTER the missing-intent lookup so existing users cannot starve newer ones.
 */
export async function reconcileVerifiedWelcomeUsers() {
  await welcomeCollection();
  const missing = await (await getDatabase()).collection("user").aggregate<{ userId: string }>([
    { $match: { emailVerified: true } },
    { $set: { welcomeUserId: { $toString: "$_id" } } },
    { $lookup: { from: "welcome_outbox", localField: "welcomeUserId", foreignField: "userId", as: "welcomeIntent" } },
    { $match: { "welcomeIntent.0": { $exists: false } } },
    { $limit: 100 },
    { $project: { _id: 0, userId: "$welcomeUserId" } },
  ]).toArray();
  let queued = 0;
  for (const { userId } of missing) {
    await enqueueVerifiedUser(userId);
    queued++;
  }
  return { queued };
}
