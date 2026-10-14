import { ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/server/db";
import { processDigest } from "@/server/digest/processor";
import { marketNewsProvider } from "@/server/digest/market-news";
import { updatePreferences } from "@/server/profile/repository";
import { addWatchlistItem } from "@/server/watchlist/repository";
import { fixtureCompany } from "@/server/market/fixtures";

let mongo: MongoMemoryReplSet;
const userId = new ObjectId().toHexString();
const otherUserId = new ObjectId().toHexString();
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1 } });
  Object.assign(process.env, {
    MONGODB_URI: mongo.getUri(), MONGODB_DATABASE: "digest_market_test", BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-only-digest-market-secret-at-least-32", MARKET_DATA_MODE: "fixture", AI_MODE: "fixture",
    EMAIL_TRANSPORT: "smtp", EMAIL_ENABLED: "true",
  });
  await (await getDatabase()).collection("user").insertMany([
    { _id: new ObjectId(userId), email: "market-digest@example.test", emailVerified: true },
    { _id: new ObjectId(otherUserId), email: "other-digest@example.test", emailVerified: true },
  ]);
  for (const id of [userId, otherUserId]) await updatePreferences(id, { enabled: true, timezone: "UTC", localTime: "00:00" });
});
afterAll(async () => { await closeDatabase(); await mongo?.stop(); });

it("builds a once-per-day digest from only its owner's persisted watchlist", async () => {
  await addWatchlistItem(userId, fixtureCompany("AAPL"));
  await addWatchlistItem(userId, fixtureCompany("MSFT"));
  await addWatchlistItem(otherUserId, fixtureCompany("TSLA"));
  const now = new Date();
  const sent: string[] = [];
  const dependencies = { newsProvider: marketNewsProvider, now, transport: { async send(input: { text: string }) { sent.push(input.text); } } };
  const date = now.toISOString().slice(0, 10);
  expect((await processDigest(userId, date, dependencies)).status).toBe("sent");
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain("AAPL");
  expect(sent[0]).toContain("MSFT");
  expect(sent[0]).not.toContain("TSLA");
  expect(sent[0]).toContain("ТЕСТОВЫЕ ДАННЫЕ");
  expect(await processDigest(userId, date, dependencies)).toMatchObject({ status: "skipped", reason: "not_due" });
  expect(sent).toHaveLength(1);
});

it("uses synthetic general market news at the supplied clock when the watchlist is empty", async () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const result = await marketNewsProvider([], now);
  expect(result.source).toBe("fixture");
  expect(result.articles).toHaveLength(1);
  expect(result.articles[0]?.publishedAt).toBe(now.toISOString());
});
