import { ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST } from "@/app/api/demo/digest/route";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/email/unsubscribe/route";
import { closeDatabase, getDatabase } from "@/server/db";
import { handleDemoDigest, runOwnDemoDigest } from "@/server/demo/digest";
import { processDigest } from "@/server/digest/processor";
import type { MailTransport } from "@/server/notifications/send";
import { getPreferences } from "@/server/profile/repository";

const origin = "http://localhost:3000";
const now = new Date("2026-10-15T12:00:00Z");
let replica: MongoMemoryReplSet;
let userA: string;
let userB: string;
let cookieA: string;
let cookieB: string;
const captured: Parameters<MailTransport["send"]>[0][] = [];
const transport: MailTransport = { async send(message) { captured.push(message); } };

function request(body: unknown = {}, cookie = cookieA, requestOrigin = origin) {
  const headers = new Headers({ origin: requestOrigin, "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${origin}/api/demo/digest`, { method: "POST", headers, body: JSON.stringify(body) });
}
async function register(email: string) {
  const response = await authPost(new Request(`${origin}/api/auth/sign-up/email`, { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "Digest demo user", email, password: "Test-password-42!!" }) }));
  expect(response.status).toBe(200);
  return { userId: (await response.json()).user.id as string,
    cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}

describe("P6.6/P8 own local digest delivery and unsubscribe", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "digest_scenario_demo");
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-with-at-least-32-characters");
    vi.stubEnv("EMAIL_ENABLED", "false");
    vi.stubEnv("EMAIL_TRANSPORT", "stream");
    const a = await register("digest-demo-a@example.test");
    const b = await register("digest-demo-b@example.test");
    userA = a.userId; cookieA = a.cookie; userB = b.userId; cookieB = b.cookie;
  });
  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("LOCAL_DEMO", "true");
    vi.stubEnv("MARKET_DATA_MODE", "fixture"); vi.stubEnv("AI_MODE", "fixture");
    vi.stubEnv("EMAIL_ENABLED", "true"); vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("SMTP_HOST", "127.0.0.1"); vi.stubEnv("SMTP_PORT", "1025"); vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_USER", ""); vi.stubEnv("SMTP_PASSWORD", "");
    vi.stubEnv("DIGEST_SCHEDULE_ENABLED", "false"); vi.stubEnv("ALERT_SCHEDULE_ENABLED", "false");
    captured.length = 0;
    const db = await getDatabase();
    await Promise.all(["notification_deliveries", "watchlist_items", "request_quotas"].map((name) => db.collection(name).deleteMany({})));
    await db.collection("user").updateMany({}, { $set: { emailVerified: true } });
    await Promise.all([getPreferences(userA), getPreferences(userB)]);
    await db.collection("digest_preferences").updateMany({}, { $set: {
      enabled: true, timezone: "Asia/Qyzylorda", localTime: "23:59", lastSentAt: null,
    } });
    await db.collection("watchlist_items").insertMany([{ userId: userA, symbol: "AAPL" }, { userId: userB, symbol: "MSFT" }]);
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("guards the public route and internal manual mode against disabled/production/nonlocal use", async () => {
    vi.stubEnv("LOCAL_DEMO", "false");
    expect((await POST(request())).status).toBe(404);
    await expect(processDigest(userA, "2026-10-15", { manualLocalDemo: true })).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("LOCAL_DEMO", "true"); vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("SMTP_HOST", "smtp.example.test");
    expect((await POST(request())).status).toBe(403);
    expect(captured).toHaveLength(0);
  });

  it("requires a persisted own session, same origin and an empty strict body", async () => {
    expect((await handleDemoDigest(request({}, ""), { transport, now })).status).toBe(401);
    expect((await handleDemoDigest(request({}, cookieA, "https://attacker.test"), { transport, now })).status).toBe(403);
    for (const body of [{ userId: userB }, { localDate: "2026-10-16" }, { enabled: true }, { manualLocalDemo: true }]) {
      expect((await handleDemoDigest(request(body), { transport, now })).status).toBe(400);
    }
    const own = await handleDemoDigest(request({}, cookieB), { transport, now });
    expect((await own.json()).data.status).toBe("sent");
    expect(captured[0]!.to).toBe("digest-demo-b@example.test");
    expect(captured[0]!.text).toContain("MSFT");
    expect(captured[0]!.text).not.toContain("AAPL");
  });

  it("delivers before the selected time and replays the same daily journal without moving lastSentAt", async () => {
    const first = await handleDemoDigest(request(), { transport, now });
    expect((await first.json()).data).toEqual({ source: "fixture", localDate: "2026-10-15", status: "sent" });
    const repeat = await handleDemoDigest(request(), { transport, now: new Date(now.getTime() + 60_000) });
    expect((await repeat.json()).data.status).toBe("duplicate");
    expect(captured).toHaveLength(1);
    expect(captured[0]!.subject).toContain("ТЕСТОВЫЕ ДАННЫЕ");
    expect(captured[0]!.text).toContain("Synthetic AAPL");
    const db = await getDatabase();
    expect(await db.collection("notification_deliveries").findOne({ userId: userA })).toMatchObject({
      eventKey: `delivery:digest:${userA}:2026-10-15`, preview: false, status: "sent",
    });
    expect((await db.collection("digest_preferences").findOne({ userId: userA }))?.lastSentAt).toEqual(now);
    expect(process.env.DIGEST_SCHEDULE_ENABLED).toBe("false");
  });

  it("keeps concurrent delivery to one SMTP attempt and exposes processing then duplicate", async () => {
    let started!: () => void; let release!: () => void;
    const sending = new Promise<void>((resolve) => { started = resolve; });
    const finish = new Promise<void>((resolve) => { release = resolve; });
    let sends = 0;
    const slow: MailTransport = { async send() { sends++; started(); await finish; } };
    const first = runOwnDemoDigest(userA, { transport: slow, now });
    await sending;
    expect((await runOwnDemoDigest(userA, { transport: slow, now })).status).toBe("processing");
    release();
    expect((await first).status).toBe("sent");
    expect((await runOwnDemoDigest(userA, { transport: slow, now })).status).toBe("duplicate");
    expect(sends).toBe(1);
  });

  it("repairs a missing preference acknowledgement from the sent journal without sending again", async () => {
    await runOwnDemoDigest(userA, { transport, now });
    const db = await getDatabase();
    // Model the persisted sent journal followed by a failed lastSentAt write.
    await db.collection("digest_preferences").updateOne({ userId: userA }, { $set: { lastSentAt: null } });
    const retryAt = new Date(now.getTime() + 60_000);
    expect((await runOwnDemoDigest(userA, { transport, now: retryAt })).status).toBe("duplicate");
    expect((await db.collection("digest_preferences").findOne({ userId: userA }))?.lastSentAt).toEqual(retryAt);
    expect(captured).toHaveLength(1);
  });

  it("uses the signed email link for GET confirmation and POST opt-out, then skips without another email", async () => {
    await runOwnDemoDigest(userA, { transport, now: new Date() });
    const match = captured[0]!.text.match(/http:\/\/localhost:3000\/api\/email\/unsubscribe\?token=[A-Za-z0-9_.-]+/);
    expect(match?.[0]).toBeDefined();
    const url = new URL(match![0]);
    const db = await getDatabase();
    const confirmation = await unsubscribeGet(new Request(url));
    expect(confirmation.status).toBe(200);
    expect(await confirmation.text()).not.toContain("digest-demo-a@example.test");
    expect((await db.collection("digest_preferences").findOne({ userId: userA }))?.enabled).toBe(true);
    const unsubscribed = await unsubscribePost(new Request(`${origin}/api/email/unsubscribe`, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: url.searchParams.get("token")! }) }));
    expect(unsubscribed.status).toBe(200);
    const skipped = await handleDemoDigest(request(), { transport });
    expect((await skipped.json()).data).toMatchObject({ status: "skipped", reason: "digest_opted_out" });
    expect(captured).toHaveLength(1);
    expect((await db.collection("digest_preferences").findOne({ userId: userB }))?.enabled).toBe(true);
  });

  it("blocks unverified and opted-out accounts without creating a sent journal", async () => {
    const db = await getDatabase();
    await db.collection("user").updateOne({ _id: new ObjectId(userA) }, { $set: { emailVerified: false } });
    expect(await runOwnDemoDigest(userA, { transport, now })).toMatchObject({ status: "skipped", reason: "email_unverified" });
    await db.collection("digest_preferences").updateOne({ userId: userB }, { $set: { enabled: false } });
    expect(await runOwnDemoDigest(userB, { transport, now })).toMatchObject({ status: "skipped", reason: "digest_opted_out" });
    expect(captured).toHaveLength(0);
    expect(await db.collection("notification_deliveries").countDocuments()).toBe(0);
  });

  it("rereads consent changed during preparation and never retries an uncertain SMTP outcome", async () => {
    const db = await getDatabase();
    const changed = await runOwnDemoDigest(userA, { transport, now, summaryGenerator: async (articles) => {
      await db.collection("digest_preferences").updateOne({ userId: userA }, { $set: { enabled: false } });
      return { fixture: true, summary: { items: [{ text: "Synthetic only", articleIds: [articles[0]!.id] }] } };
    } });
    expect(changed).toMatchObject({ status: "skipped", reason: "digest_opted_out" });
    expect(captured).toHaveLength(0);
    let sends = 0;
    const uncertain: MailTransport = { async send() { sends++; throw new Error("private SMTP detail"); } };
    const first = await runOwnDemoDigest(userB, { transport: uncertain, now });
    expect(first.status).toBe("uncertain");
    expect((await runOwnDemoDigest(userB, { transport: uncertain, now })).status).toBe("uncertain");
    expect(sends).toBe(1);
    expect(JSON.stringify(first)).not.toContain("private SMTP detail");
  });
});
