import "server-only";
import { ObjectId, MongoServerError } from "mongodb";
import type { StockCompany, WatchlistItem } from "@/contracts";
import { getDatabase, getMongoClient } from "@/server/db";
import { AppError } from "@/server/errors";

interface ItemDocument { userId: string; symbol: string; companyName: string; createdAt: Date }
interface CounterDocument { _id: string; count: number }
export const WATCHLIST_LIMIT = 50;
let indexes: Promise<void> | undefined;
async function collections() {
  const db = await getDatabase();
  const items = db.collection<ItemDocument>("watchlist_items");
  const counters = db.collection<CounterDocument>("watchlist_counters");
  indexes ??= items.createIndex({ userId: 1, symbol: 1 }, { unique: true, name: "watchlist_owner_symbol_unique" })
    .then(() => undefined).catch((error: unknown) => { indexes = undefined; throw error; });
  await indexes;
  return { items, counters };
}
const dto = (document: ItemDocument & { _id: ObjectId }): WatchlistItem => ({
  id: document._id.toHexString(), symbol: document.symbol, companyName: document.companyName,
  createdAt: document.createdAt.toISOString(),
});

export async function listWatchlistItems(userId: string): Promise<WatchlistItem[]> {
  const { items } = await collections();
  return (await items.find({ userId }).sort({ createdAt: 1, _id: 1 }).limit(WATCHLIST_LIMIT).toArray()).map(dto);
}

/** company must come from the server market adapter, never the request body. */
export async function addWatchlistItem(userId: string, company: StockCompany): Promise<{ item: WatchlistItem; created: boolean }> {
  const { items, counters } = await collections();
  try { await counters.updateOne({ _id: userId }, { $setOnInsert: { count: 0 } }, { upsert: true }); }
  catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; }
  const client = await getMongoClient();
  try {
    return await client.withSession((session) => session.withTransaction(async () => {
      const existing = await items.findOne({ userId, symbol: company.symbol }, { session });
      if (existing) return { item: dto(existing), created: false };
      const counter = await counters.findOneAndUpdate({ _id: userId, count: { $lt: WATCHLIST_LIMIT } }, { $inc: { count: 1 } }, { session, returnDocument: "after" });
      if (!counter) throw new AppError("CONFLICT", `Watchlist is limited to ${WATCHLIST_LIMIT} stocks`, 409);
      const document = { _id: new ObjectId(), userId, symbol: company.symbol, companyName: company.companyName, createdAt: new Date() };
      await items.insertOne(document, { session });
      return { item: dto(document), created: true };
    }));
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await items.findOne({ userId, symbol: company.symbol });
      if (existing) return { item: dto(existing), created: false };
    }
    throw error;
  }
}

export async function deleteWatchlistItem(userId: string, symbol: string): Promise<boolean> {
  const { items, counters } = await collections();
  const client = await getMongoClient();
  return client.withSession((session) => session.withTransaction(async () => {
    const result = await items.deleteOne({ userId, symbol }, { session });
    if (result.deletedCount) await counters.updateOne({ _id: userId, count: { $gt: 0 } }, { $inc: { count: -1 } }, { session });
    return result.deletedCount === 1;
  }));
}
