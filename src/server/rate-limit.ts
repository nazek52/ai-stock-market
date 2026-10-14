import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { getDatabase } from "@/server/db";
import { AppError } from "./errors";

interface QuotaBucket { _id: string; count: number; expiresAt: Date }
interface Lease { _id: string; owner: string; expiresAt: Date }
interface RequestWindow { _id: string; timestamps: Date[]; granted: boolean; expiresAt: Date }
let indexes: Promise<void> | undefined;

async function collections() {
  const db = await getDatabase();
  const quotas = db.collection<QuotaBucket>("request_quotas");
  const leases = db.collection<Lease>("worker_leases");
  const windows = db.collection<RequestWindow>("request_windows");
  indexes ??= Promise.all([
    quotas.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    leases.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    windows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => undefined).catch((error: unknown) => { indexes = undefined; throw error; });
  await indexes;
  return { quotas, leases, windows };
}

/** Fixed-window quota shared by all Node processes; counters are not an authorization boundary. */
export async function consumeQuota(key: string, limit: number, windowMs: number, now = Date.now()) {
  const { quotas } = await collections();
  const bucket = Math.floor(now / windowMs);
  const id = createHash("sha256").update(`${key}:${bucket}`).digest("hex");
  const increment = () => quotas.findOneAndUpdate({ _id: id }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) },
  }, { upsert: true, returnDocument: "after" });
  let document: QuotaBucket | null;
  try {
    document = await increment();
  } catch (error) {
    // Two cold workers may both try to insert the same bucket.
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    document = await increment();
  }
  if (!document || document.count > limit) {
    throw new AppError("RATE_LIMITED", "Request budget exhausted", 429, Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)));
  }
}

/** A bounded lease prevents concurrent provider calls across multiple server instances. */
export async function acquireLease(key: string, durationMs: number, now?: number) {
  const { leases } = await collections();
  const acquiredAt = now ?? Date.now();
  const expiresAt = new Date(acquiredAt + durationMs);
  const owner = randomUUID();
  try {
    await leases.findOneAndUpdate({ _id: key, expiresAt: { $lte: new Date(acquiredAt) } }, {
      $set: { owner, expiresAt },
    }, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    throw new AppError("RATE_LIMITED", "Provider is processing another request", 429, 1);
  }
  return Object.assign(async () => { await leases.deleteOne({ _id: key, owner }); }, { expiresAt });
}

export async function acquireMarketPermit(requestsPerMinute: number, now = Date.now()) {
  const release = await acquireLease("finnhub-global", 15000, now);
  try {
    const { windows } = await collections();
    const document = await windows.findOneAndUpdate({ _id: "finnhub-global" }, [
      { $set: { timestamps: { $filter: {
        input: { $ifNull: ["$timestamps", []] }, as: "stamp", cond: { $gt: ["$$stamp", new Date(now - 60000)] },
      } } } },
      { $set: { granted: { $lt: [{ $size: "$timestamps" }, requestsPerMinute] } } },
      { $set: {
        timestamps: { $cond: ["$granted", { $concatArrays: ["$timestamps", [new Date(now)]] }, "$timestamps"] },
        expiresAt: new Date(now + 120000),
      } },
    ], { upsert: true, returnDocument: "after" });
    if (!document?.granted) {
      const first = document?.timestamps[0]?.getTime() ?? now;
      throw new AppError("RATE_LIMITED", "Market request budget exhausted", 429, Math.max(1, Math.ceil((first + 60000 - now) / 1000)));
    }
    // Slow DB responses must not return a permit whose lease expires during the 5s fetch.
    if (release.expiresAt.getTime() < Date.now() + 6500) {
      throw new AppError("RATE_LIMITED", "Market permit expired before the request could start", 429, 1);
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}
