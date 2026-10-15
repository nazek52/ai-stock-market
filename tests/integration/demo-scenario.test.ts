import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST } from "@/app/api/demo/scenario/route";
import { createRule, listRules } from "@/server/alerts/repository";
import { closeDatabase, getDatabase } from "@/server/db";
import { assertLocalDemo, handleAlertScenario, runAlertScenario } from "@/server/demo/scenario";
import { getMarketClient } from "@/server/market";
import type { MailTransport } from "@/server/notifications/send";

const origin = "http://localhost:3000";
let replica: MongoMemoryReplSet;
let userA: string;
let userB: string;
let cookieA: string;
let cookieB: string;
const captured: Parameters<MailTransport["send"]>[0][] = [];
const transport: MailTransport = { async send(message) { captured.push(message); } };
const resolveStock = async (symbol: string) => { await getMarketClient().company(symbol); };
const ruleInput = { symbol: "AAPL", type: "price_above" as const, threshold: 100, currency: "USD" as const, cooldownMinutes: 5 };

function request(body: unknown, cookie = cookieA, requestOrigin = origin) {
  const headers = new Headers({ origin: requestOrigin, "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${origin}/api/demo/scenario`, { method: "POST", headers, body: JSON.stringify(body) });
}
async function register(email: string) {
  const response = await authPost(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Demo test user", email, password: "Test-password-42!!" }),
  }));
  expect(response.status).toBe(200);
  return { userId: (await response.json()).user.id as string,
    cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}
function demoEnvironment() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LOCAL_DEMO", "true");
  vi.stubEnv("MARKET_DATA_MODE", "fixture");
  vi.stubEnv("AI_MODE", "fixture");
  vi.stubEnv("EMAIL_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "smtp");
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", "1025");
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
  vi.stubEnv("DIGEST_SCHEDULE_ENABLED", "false");
  vi.stubEnv("ALERT_SCHEDULE_ENABLED", "false");
  vi.stubEnv("MONGODB_DATABASE", "scenario_integration_demo");
}

describe("P8 isolated local alert scenario", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "scenario_integration_demo");
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-with-at-least-32-characters");
    vi.stubEnv("EMAIL_ENABLED", "false");
    vi.stubEnv("EMAIL_TRANSPORT", "stream");
    const a = await register("local-demo-a@example.test");
    const b = await register("local-demo-b@example.test");
    userA = a.userId; cookieA = a.cookie; userB = b.userId; cookieB = b.cookie;
  });
  beforeEach(async () => {
    demoEnvironment();
    captured.length = 0;
    const db = await getDatabase();
    await Promise.all(["demo_scenarios", "alert_rules", "alert_rule_owners", "alert_events", "notification_deliveries", "request_quotas"]
      .map((name) => db.collection(name).deleteMany({})));
    await db.collection("user").updateMany({}, { $set: { emailVerified: true } });
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("fails closed without opt-in, in production, and with nonlocal or incompatible configuration", async () => {
    vi.stubEnv("LOCAL_DEMO", "false");
    expect((await POST(request({ requestId: randomUUID() }))).status).toBe(404);
    vi.stubEnv("LOCAL_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request({ requestId: randomUUID() }))).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    const invalid = [
      ["SMTP_HOST", "smtp.example.test"], ["SMTP_PORT", "25"], ["SMTP_SECURE", "true"], ["SMTP_USER", "relay-user"],
      ["EMAIL_ENABLED", "false"], ["EMAIL_TRANSPORT", "stream"], ["AI_MODE", "gemini"], ["MARKET_DATA_MODE", "finnhub"],
      ["DIGEST_SCHEDULE_ENABLED", "true"], ["ALERT_SCHEDULE_ENABLED", "true"], ["MONGODB_DATABASE", "shared_database"],
    ];
    for (const [key, value] of invalid) {
      demoEnvironment();
      vi.stubEnv(key!, value!);
      expect(() => assertLocalDemo(), key).toThrow();
    }
    expect(captured).toHaveLength(0);
  });

  it("requires the persisted session, same origin, strict input and fresh verification", async () => {
    expect((await handleAlertScenario(request({ requestId: randomUUID() }, ""), { transport })).status).toBe(401);
    expect((await handleAlertScenario(request({ requestId: randomUUID() }, cookieA, "https://attacker.test"), { transport })).status).toBe(403);
    expect((await handleAlertScenario(request({ requestId: randomUUID(), userId: userB }), { transport })).status).toBe(400);
    expect((await handleAlertScenario(request({ requestId: "invalid" }), { transport })).status).toBe(400);
    await (await getDatabase()).collection("user").updateOne({ _id: new ObjectId(userA) }, { $set: { emailVerified: false } });
    expect((await handleAlertScenario(request({ requestId: randomUUID() }), { transport })).status).toBe(403);
    expect(await (await getDatabase()).collection("demo_scenarios").countDocuments()).toBe(0);
    expect(captured).toHaveLength(0);
  });

  it("uses the server owner and real fixture resolver, sends one persisted event and removes only its temporary rule", async () => {
    const a = await createRule(userA, ruleInput, resolveStock);
    const b = await createRule(userB, ruleInput, resolveStock);
    const response = await handleAlertScenario(request({ requestId: randomUUID() }), { transport });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ source: "fixture", fromPrice: 99, toPrice: 101, rulesCreated: 1, eventsCreated: 1, status: "sent", temporaryRuleDeleted: true });
    expect(JSON.stringify(body)).not.toContain("local-demo-a@example.test");
    expect(JSON.stringify(body)).not.toContain("eventKey");
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ to: "local-demo-a@example.test" });
    expect(captured[0]!.text).toContain("101 USD");
    expect(captured[0]!.text).toContain("fixture");
    expect((await listRules(userA)).map((rule) => rule.id)).toEqual([a.id]);
    expect((await listRules(userB)).map((rule) => rule.id)).toEqual([b.id]);
    const db = await getDatabase();
    expect(await db.collection("alert_events").findOne({ userId: userA })).toMatchObject({ status: "delivered", price: 101, threshold: 100 });
    expect(await db.collection("alert_events").countDocuments({ userId: userB })).toBe(0);
    expect(await db.collection<{ _id: string; ruleCount: number }>("alert_rule_owners").findOne({ _id: userA })).toMatchObject({ ruleCount: 1 });
  });

  it("atomically claims concurrent requests and returns the same result on replay without another send or quota charge", async () => {
    let started!: () => void;
    let release!: () => void;
    const sending = new Promise<void>((resolve) => { started = resolve; });
    const finish = new Promise<void>((resolve) => { release = resolve; });
    let sends = 0;
    const slowTransport: MailTransport = { async send() { sends++; started(); await finish; } };
    const requestId = randomUUID();
    const first = handleAlertScenario(request({ requestId }), { transport: slowTransport });
    await sending;
    const duplicate = await handleAlertScenario(request({ requestId }), { transport: slowTransport });
    expect(duplicate.status).toBe(409);
    release();
    const initial = await (await first).json();
    const replays = await Promise.all(Array.from({ length: 5 }, () => handleAlertScenario(request({ requestId }), { transport: slowTransport })));
    for (const response of replays) expect(await response.json()).toEqual(initial);
    expect(sends).toBe(1);
    const db = await getDatabase();
    expect(await db.collection("demo_scenarios").countDocuments()).toBe(1);
    expect(await db.collection("notification_deliveries").countDocuments({ status: "sent" })).toBe(1);
    expect(await listRules(userA)).toEqual([]);
    // Same UUID for another signed-in owner is independently scoped, with its own recipient/quota.
    expect((await handleAlertScenario(request({ requestId }, cookieB), { transport })).status).toBe(200);
    expect(captured[0]!.to).toBe("local-demo-b@example.test");
  });

  it("limits new runs per owner and preserves the successful request for safe replay", async () => {
    const requestId = randomUUID();
    await runAlertScenario(userA, requestId, { transport });
    const blockedId = randomUUID();
    expect((await handleAlertScenario(request({ requestId: blockedId }), { transport })).status).toBe(429);
    expect((await handleAlertScenario(request({ requestId: blockedId }), { transport })).status).toBe(409);
    expect((await runAlertScenario(userA, requestId, { transport })).status).toBe("sent");
    expect(captured).toHaveLength(1);
  });

  it("keeps uncertain SMTP outcomes terminal, cancels the pending event and preserves the journal", async () => {
    let sends = 0;
    const uncertain: MailTransport = { async send() { sends++; throw new Error("Connection outcome unknown"); } };
    const requestId = randomUUID();
    const result = await runAlertScenario(userA, requestId, { transport: uncertain });
    expect(result.status).toBe("uncertain");
    expect(await runAlertScenario(userA, requestId, { transport: uncertain })).toEqual(result);
    expect(sends).toBe(1);
    expect(await listRules(userA)).toEqual([]);
    const db = await getDatabase();
    expect(await db.collection("alert_events").findOne({ userId: userA })).toMatchObject({ status: "cancelled" });
    expect(await db.collection("notification_deliveries").findOne({ userId: userA })).toMatchObject({ status: "uncertain" });
  });

  it("rechecks recipient verification at send time and cancels a blocked event", async () => {
    const result = await runAlertScenario(userA, randomUUID(), { transport, resolveStock: async (symbol) => {
      await resolveStock(symbol);
      await (await getDatabase()).collection("user").updateOne({ _id: new ObjectId(userA) }, { $set: { emailVerified: false } });
    } });
    expect(result.status).toBe("skipped");
    expect(captured).toHaveLength(0);
    expect(await listRules(userA)).toEqual([]);
    expect(await (await getDatabase()).collection("alert_events").findOne({ userId: userA })).toMatchObject({ status: "cancelled" });
  });

  it("does not automatically retry a failed scenario or expose internal failure details", async () => {
    const requestId = randomUUID();
    const failed = await handleAlertScenario(request({ requestId }), { transport, resolveStock: async () => { throw new Error("private-provider-details"); } });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private-provider-details");
    expect((await handleAlertScenario(request({ requestId }), { transport })).status).toBe(409);
    expect(captured).toHaveLength(0);
    expect(await listRules(userA)).toEqual([]);
    const stored = await (await getDatabase()).collection("demo_scenarios").findOne({ userId: userA });
    expect(stored).toMatchObject({ status: "failed" });
    expect(stored).not.toHaveProperty("error");
  });
});
