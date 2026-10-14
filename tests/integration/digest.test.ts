import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { closeDatabase, getDatabase } from "@/server/db";
import { sendTransactionalEmail, sendAuthenticationEmail } from "@/server/notifications/send";
import { deliveryCollection, markAbandonedDeliveriesUncertain } from "@/server/notifications/repository";
import { processDigest, dispatchDueDigests, type DigestEvent } from "@/server/digest/processor";
import { createUnsubscribeToken } from "@/server/digest/unsubscribe";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/email/unsubscribe/route";
import type { NewsProvider } from "@/server/digest/news";

let replica: MongoMemoryReplSet;
const now = new Date("2026-10-14T09:00:00Z");
const payload = { subject: "Synthetic test", title: "Synthetic test", paragraphs: ["Synthetic only"], links: [] };
const newsProvider: NewsProvider = async () => ({ source: "fixture", articles: [{
  id: "article-1", headline: "Synthetic headline", summary: "Synthetic summary", url: "https://example.com/news", source: "Fixture", publishedAt: now.toISOString(), relatedSymbols: [],
}] });

describe("durable delivery and isolated digest runs", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "digest_integration");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("DIGEST_SCHEDULE_ENABLED", "true");
    vi.stubEnv("MARKET_DATA_MODE", "fixture");
    vi.stubEnv("AI_MODE", "fixture");
  });
  beforeEach(async () => {
    const db = await getDatabase();
    await Promise.all(["user", "digest_preferences", "notification_deliveries", "watchlist_items"].map((name) => db.collection(name).deleteMany({})));
    await db.collection<{ _id: string; email: string; emailVerified: boolean }>("user").insertMany([
      { _id: "user-one", email: "one@example.test", emailVerified: true },
      { _id: "user-two", email: "two@example.test", emailVerified: true },
      { _id: "unverified", email: "unverified@example.test", emailVerified: false },
    ]);
    await db.collection("digest_preferences").insertMany(["user-one", "user-two", "unverified"].map((userId) => ({ userId, enabled: true, timezone: "UTC", localTime: "09:00", lastSentAt: null, updatedAt: now })));
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("claims one stable key atomically across concurrent and replayed jobs", async () => {
    const send = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const input = { idempotencyKey: "welcome:user-one", type: "welcome" as const, userId: "user-one", payload };
    await Promise.all(Array.from({ length: 30 }, () => sendTransactionalEmail(input, { send })));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await sendTransactionalEmail(input, { send })).status).toBe("sent");
    const record = await (await deliveryCollection()).findOne({ eventKey: "delivery:welcome:user-one" });
    expect(record?.status).toBe("sent");
    expect(await (await deliveryCollection()).countDocuments()).toBe(1);
  });
  it("blocks current opt-out and unverified recipients before transport", async () => {
    const db = await getDatabase();
    await db.collection("digest_preferences").updateOne({ userId: "user-one" }, { $set: { enabled: false } });
    const send = vi.fn(async () => {});
    expect(await sendTransactionalEmail({ idempotencyKey: "digest:optout", type: "digest", userId: "user-one", payload }, { send })).toMatchObject({ status: "skipped", reason: "digest_opted_out" });
    expect(await sendTransactionalEmail({ idempotencyKey: "digest:unverified", type: "digest", userId: "unverified", payload }, { send })).toMatchObject({ status: "skipped", reason: "email_unverified" });
    expect(send).not.toHaveBeenCalled();
  });
  it("does not automatically retry uncertain SMTP outcomes or interrupted claims", async () => {
    const send = vi.fn(async () => { throw new Error("Sensitive provider error must not be persisted"); });
    const request = { idempotencyKey: "digest:uncertain", type: "digest" as const, userId: "user-one", payload };
    expect((await sendTransactionalEmail(request, { send })).status).toBe("uncertain");
    expect((await sendTransactionalEmail(request, { send })).status).toBe("uncertain");
    expect(send).toHaveBeenCalledTimes(1);
    const deliveries = await deliveryCollection();
    await deliveries.insertOne({ eventKey: "delivery:digest:crashed", userId: "user-one", type: "digest", status: "sending", preview: false, claimedAt: new Date(0), createdAt: now, updatedAt: now });
    await markAbandonedDeliveriesUncertain(now);
    expect((await deliveries.findOne({ eventKey: "delivery:digest:crashed" }))?.status).toBe("uncertain");
    expect(JSON.stringify(await deliveries.find({}).toArray())).not.toContain("Sensitive");
  });
  it("builds a labelled stream preview without marking delivery sent or updating lastSentAt", async () => {
    const send = vi.fn(async () => {});
    const result = await processDigest("user-one", "2026-10-14", { now, newsProvider, previewOnly: true, transport: { send } });
    expect(result).toMatchObject({ status: "skipped", reason: "preview" });
    expect(result.preview?.subject).toContain("ТЕСТОВЫЕ ДАННЫЕ");
    expect(send).not.toHaveBeenCalled();
    expect((await (await getDatabase()).collection("digest_preferences").findOne({ userId: "user-one" }))?.lastSentAt).toBeNull();
  });
  it("persists one sent local-date issue and rereads consent changed during AI preparation", async () => {
    const db = await getDatabase();
    const send = vi.fn(async () => {});
    const generator = async () => {
      await db.collection("digest_preferences").updateOne({ userId: "user-one" }, { $set: { enabled: false } });
      return { summary: { items: [{ text: "Synthetic", articleIds: ["article-1"] }] }, fixture: true };
    };
    expect((await processDigest("user-one", "2026-10-14", { now, newsProvider, summaryGenerator: generator, transport: { send } })).reason).toBe("digest_opted_out");
    expect(send).not.toHaveBeenCalled();
    expect((await processDigest("user-two", "2026-10-14", { now, newsProvider, transport: { send } })).status).toBe("sent");
    expect((await processDigest("user-two", "2026-10-14", { now, newsProvider, transport: { send } })).reason).toBe("not_due");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await db.collection("digest_preferences").findOne({ userId: "user-two" }))?.lastSentAt).toEqual(now);
  });
  it("isolates bad recipient preferences while dispatching valid users", async () => {
    const db = await getDatabase();
    await db.collection("digest_preferences").updateOne({ userId: "user-one" }, { $set: { timezone: "Invalid/Timezone" } });
    let dispatched: DigestEvent[] = [];
    const dispatch = vi.fn(async (events: DigestEvent[]) => { dispatched = events; });
    expect(await dispatchDueDigests(now, dispatch)).toEqual({ dispatched: 1, skipped: 1, errors: 1 });
    expect(dispatched).toMatchObject([{ data: { userId: "user-two", localDate: "2026-10-14" } }]);
  });
  it("isolates a provider failure and keeps pre-send failures safely retriable", async () => {
    const send = vi.fn(async () => {});
    const outcomes = await Promise.allSettled([
      processDigest("user-one", "2026-10-14", { now, newsProvider: async () => { throw new Error("private-api-key-must-not-leak"); }, transport: { send } }),
      processDigest("user-two", "2026-10-14", { now, newsProvider, transport: { send } }),
    ]);
    expect(outcomes[0]?.status).toBe("rejected");
    if (outcomes[0]?.status === "rejected") expect(outcomes[0].reason.message).toBe("Digest news is temporarily unavailable");
    expect(outcomes[1]).toMatchObject({ status: "fulfilled", value: { status: "sent" } });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await processDigest("user-one", "2026-10-14", { now, newsProvider, transport: { send } })).status).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("requires POST to unsubscribe and never reveals an email or changes another user", async () => {
    const token = createUnsubscribeToken("user-one");
    const get = await unsubscribeGet(new Request(`http://localhost:3000/api/email/unsubscribe?token=${token}`));
    expect(get.status).toBe(200);
    expect(await get.text()).not.toContain("one@example.test");
    const db = await getDatabase();
    expect((await db.collection("digest_preferences").findOne({ userId: "user-one" }))?.enabled).toBe(true);
    expect((await unsubscribePost(new Request("http://localhost:3000/api/email/unsubscribe", { method: "POST", headers: { authorization: `Bearer ${token}` } }))).status).toBe(200);
    expect((await db.collection("digest_preferences").findOne({ userId: "user-one" }))?.enabled).toBe(false);
    expect((await db.collection("digest_preferences").findOne({ userId: "user-two" }))?.enabled).toBe(true);
    expect((await unsubscribePost(new Request("http://localhost:3000/api/email/unsubscribe", { method: "POST", headers: { authorization: "Bearer invalid" } }))).status).toBe(400);
  });
  it("restricts auth links to the app origin and never persists raw token IDs", async () => {
    await expect(sendAuthenticationEmail({ userId: "unverified", type: "verify_email", url: "https://attacker.test/token", tokenId: "secret-token" })).rejects.toThrow("application origin");
    process.env.EMAIL_TRANSPORT = "stream";
    try {
      expect((await sendAuthenticationEmail({ userId: "unverified", type: "verify_email", url: "http://localhost:3000/api/auth/verify-email?token=secret-token", tokenId: "secret-token" })).reason).toBe("preview");
      expect(JSON.stringify(await (await deliveryCollection()).find({}).toArray())).not.toContain("secret-token");
    } finally { process.env.EMAIL_TRANSPORT = "smtp"; }
  });

  it("rejects fixture production delivery before claiming or calling SMTP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const send = vi.fn(async () => {});
    try {
      await expect(sendTransactionalEmail({ idempotencyKey: "digest:production-fixture", type: "digest", userId: "user-one", payload: { ...payload, fixture: true } }, { send })).rejects.toThrow("Fixture messages");
      expect(send).not.toHaveBeenCalled();
      expect(await (await deliveryCollection()).countDocuments()).toBe(0);
    } finally { vi.stubEnv("NODE_ENV", "test"); }
  });
});
