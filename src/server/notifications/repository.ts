import "server-only";
import { MongoServerError, ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/server/db";
import type { DeliveryStatus, NotificationRequest } from "./types";

export interface DeliveryDocument {
  eventKey: string;
  userId: string;
  type: NotificationRequest["type"];
  status: DeliveryStatus;
  preview: boolean;
  createdAt: Date;
  updatedAt: Date;
  claimedAt?: Date;
  reason?: string;
}
export interface RecipientDocument { _id: ObjectId | string; email: string; emailVerified: boolean }
export interface DigestPreferenceDocument {
  userId: string;
  enabled: boolean;
  timezone: string;
  localTime: string;
  lastSentAt: Date | null;
  updatedAt: Date;
}

const indexed = new WeakMap<Db, Promise<unknown>>();
export async function deliveryCollection(inputDb?: Db) {
  const db = inputDb ?? await getDatabase();
  let index = indexed.get(db);
  if (!index) {
    index = db.collection("notification_deliveries").createIndex({ eventKey: 1 }, { unique: true, name: "notification_event_unique" });
    indexed.set(db, index);
    void index.catch(() => indexed.delete(db));
  }
  await index;
  return db.collection<DeliveryDocument>("notification_deliveries");
}

export async function getRecipient(userId: string, inputDb?: Db) {
  const db = inputDb ?? await getDatabase();
  return db.collection<RecipientDocument>("user").findOne({ _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId });
}

export async function initializeDelivery(request: NotificationRequest, preview: boolean) {
  const deliveries = await deliveryCollection();
  const eventKey = `${preview ? "preview:" : "delivery:"}${request.idempotencyKey}`;
  const now = new Date();
  try {
    await deliveries.updateOne({ eventKey }, { $setOnInsert: {
      eventKey, userId: request.userId, type: request.type, preview, status: "pending", createdAt: now, updatedAt: now,
    } }, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
  }
  const record = await deliveries.findOne({ eventKey });
  if (!record || record.userId !== request.userId || record.type !== request.type) throw new Error("Delivery key conflicts with its owner or type");
  return { deliveries, eventKey, record };
}

/** An orphan sending state is never eligible for automatic resend. */
export async function markAbandonedDeliveriesUncertain(before: Date) {
  const deliveries = await deliveryCollection();
  return deliveries.updateMany({ status: "sending", claimedAt: { $lt: before } }, {
    $set: { status: "uncertain", reason: "interrupted_send", updatedAt: new Date() },
  });
}
