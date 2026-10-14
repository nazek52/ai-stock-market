import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { PriceAlertCreate, StockQuote } from "@/contracts";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as alertPost } from "@/app/api/alerts/route";
import { createAlertCollectionHandlers, DELETE, PATCH } from "@/server/alerts/http";
import {
  createRule, deleteRule, isEventDeliverable, listActiveRules, listPendingEvents, listRules,
  markEventDelivered, processRule, updateRule,
} from "@/server/alerts/repository";
import { closeDatabase, getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";

const origin = "http://localhost:3000";
const input: PriceAlertCreate = { symbol: "AAPL", type: "price_above", threshold: 100, currency: "USD", cooldownMinutes: 5 };
const resolveStock = async (symbol: string) => {
  if (symbol !== "AAPL") throw new AppError("NOT_FOUND", "Stock was not found", 404);
};
const handlers = createAlertCollectionHandlers(resolveStock);
let replica: MongoMemoryReplSet;
let userA = "";
let userB = "";
let cookieA = "";
let cookieB = "";
const base = new Date("2030-01-01T12:00:00.000Z");
const time = (seconds: number) => new Date(base.getTime() + seconds * 1000);
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function quote(price: number, seconds: number): StockQuote {
  return {
    symbol: "AAPL", currency: "USD", price, change: null, changePercent: null, previousClose: null,
    observedAt: time(seconds).toISOString(), fetchedAt: time(seconds).toISOString(), source: "fixture",
  };
}

function request(path: string, method = "GET", body?: unknown, cookie?: string, requestOrigin = origin) {
  const headers = new Headers({ origin: requestOrigin });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function register(email: string) {
  const response = await authPost(request("/api/auth/sign-up/email", "POST", { name: "Alert test user", email, password: "Test-password-42!!" }));
  expect(response.status).toBe(200);
  return {
    userId: (await response.json()).user.id as string,
    cookie: response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; "),
  };
}

describe("P7.2–P7.4 alert CRUD and durable crossing outbox", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    process.env.MONGODB_URI = replica.getUri();
    process.env.MONGODB_DATABASE = "alerts_integration";
    process.env.BETTER_AUTH_URL = origin;
    process.env.BETTER_AUTH_SECRET = "test-only-secret-with-at-least-32-characters";
    process.env.MARKET_DATA_MODE = "fixture";
    const a = await register("alerts-a@example.test");
    const b = await register("alerts-b@example.test");
    userA = a.userId; cookieA = a.cookie; userB = b.userId; cookieB = b.cookie;
  });
  beforeEach(async () => {
    const db = await getDatabase();
    await Promise.all(["alert_rules", "alert_rule_owners", "alert_events"].map((name) => db.collection(name).deleteMany({})));
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); });

  it("validates symbols and ownership, rejects CSRF and unsupported volume rules", async () => {
    expect((await handlers.GET(request("/api/alerts"))).status).toBe(401);
    expect((await handlers.POST(request("/api/alerts", "POST", input, cookieA, "https://attacker.test"))).status).toBe(403);
    expect((await handlers.POST(request("/api/alerts", "POST", { ...input, userId: userB }, cookieA))).status).toBe(400);
    expect((await handlers.POST(request("/api/alerts", "POST", { ...input, type: "volume_above" }, cookieA))).status).toBe(400);
    expect((await handlers.POST(request("/api/alerts", "POST", { ...input, symbol: "ZZZZZ" }, cookieA))).status).toBe(404);
    const response = await handlers.POST(request("/api/alerts", "POST", input, cookieA));
    expect(response.status).toBe(201);
    const created = (await response.json()).data;
    expect(created).not.toHaveProperty("userId");
    expect((await (await handlers.GET(request(`/api/alerts?userId=${userA}`, "GET", undefined, cookieB))).json()).data).toEqual([]);
    expect((await PATCH(request(`/api/alerts/${created.id}`, "PATCH", { threshold: 1 }, cookieB), context(created.id))).status).toBe(404);
    expect((await (await DELETE(request(`/api/alerts/${created.id}`, "DELETE", undefined, cookieB), context(created.id))).json()).data.deleted).toBe(false);
    expect((await listRules(userA))).toHaveLength(1);
    expect((await PATCH(request(`/api/alerts/${created.id}`, "PATCH", { symbol: "MSFT" }, cookieA), context(created.id))).status).toBe(400);
    expect((await PATCH(request("/api/alerts/not-an-id", "PATCH", { threshold: 1 }, cookieA), context("not-an-id"))).status).toBe(404);
    expect((await DELETE(request(`/api/alerts/${created.id}`, "DELETE", undefined, cookieA), context(created.id))).status).toBe(200);
    expect((await listRules(userA))).toEqual([]);
  });

  it("connects the public route to actual server market validation", async () => {
    expect((await alertPost(request("/api/alerts", "POST", { ...input, symbol: "ZZZZZ" }, cookieA))).status).toBe(404);
    const response = await alertPost(request("/api/alerts", "POST", { ...input, symbol: " msft " }, cookieA));
    expect(response.status).toBe(201);
    expect((await response.json()).data.symbol).toBe("MSFT");
  });

  it("enforces 50 rules per owner across concurrent creates and releases capacity on delete", async () => {
    for (let index = 0; index < 49; index++) await createRule(userA, input, resolveStock);
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => createRule(userA, input, resolveStock)));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(3);
    for (const attempt of attempts) if (attempt.status === "rejected") expect(attempt.reason).toMatchObject({ code: "CONFLICT", status: 409 });
    const rules = await listRules(userA);
    expect(rules).toHaveLength(50);
    await deleteRule(userA, rules[0]!.id);
    await createRule(userA, input, resolveStock);
    expect(await listRules(userA)).toHaveLength(50);
    expect(await createRule(userB, input, resolveStock)).toHaveProperty("id");
  });

  it("atomically records one event for concurrent crossing checks and survives a delivery retry", async () => {
    const rule = await createRule(userA, input, resolveStock);
    expect((await processRule(rule.id, quote(90, 0), time(0))).action).toBe("baseline");
    const results = await Promise.all(Array.from({ length: 15 }, () => processRule(rule.id, quote(110, 10), time(10))));
    expect(results.filter((result) => result.action === "trigger")).toHaveLength(1);
    const events = await listPendingEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event).toMatchObject({ status: "pending", symbol: "AAPL", price: 110, source: "fixture", threshold: 100 });
    expect(event._id).toBe(`${rule.id}:1:${time(10).toISOString()}`);
    expect(await isEventDeliverable(event)).toBe(true);
    expect((await processRule(rule.id, quote(110, 10), time(11))).action).toBe("ignore");
    expect(await listPendingEvents()).toHaveLength(1);
    expect((await listRules(userA))[0]!.lastTriggeredAt).toBe(time(10).toISOString());
    expect(await markEventDelivered(event._id, time(12))).toBe(true);
    expect(await markEventDelivered(event._id, time(13))).toBe(false);
    expect(await listPendingEvents()).toHaveLength(0);
  });

  it("rolls back rule claim when durable outbox insertion fails", async () => {
    const rule = await createRule(userA, input, resolveStock);
    await processRule(rule.id, quote(90, 0), time(0));
    const key = `${rule.id}:1:${time(10).toISOString()}`;
    const db = await getDatabase();
    await db.collection<{ _id: string }>("alert_events").insertOne({ _id: key });
    await expect(processRule(rule.id, quote(110, 10), time(10))).rejects.toMatchObject({ code: 11000 });
    expect((await listRules(userA))[0]!.lastTriggeredAt).toBeNull();
    await db.collection<{ _id: string }>("alert_events").deleteOne({ _id: key });
    expect((await processRule(rule.id, quote(110, 10), time(10))).action).toBe("trigger");
    expect(await listPendingEvents()).toHaveLength(1);
  });

  it("consumes cooldown crossings and requires a later crossing after rearming", async () => {
    const rule = await createRule(userA, input, resolveStock);
    await processRule(rule.id, quote(90, 0), time(0));
    await processRule(rule.id, quote(110, 10), time(10));
    await processRule(rule.id, quote(90, 20), time(20));
    expect((await processRule(rule.id, quote(110, 30), time(30))).action).toBe("observe");
    expect((await processRule(rule.id, quote(111, 320), time(320))).action).toBe("observe");
    await processRule(rule.id, quote(100, 330), time(330));
    expect((await processRule(rule.id, quote(110, 340), time(340))).action).toBe("trigger");
    expect(await listPendingEvents()).toHaveLength(2);
  });

  it("ignores stale/future/out-of-order data and resets stale or switched-source baseline", async () => {
    const rule = await createRule(userA, input, resolveStock);
    await processRule(rule.id, quote(90, 0), time(0));
    expect(await processRule(rule.id, quote(110, 0), time(1))).toMatchObject({ action: "ignore", reason: "out_of_order" });
    expect(await processRule(rule.id, quote(110, 1), time(902))).toMatchObject({ action: "ignore", reason: "stale" });
    expect(await processRule(rule.id, quote(110, 1000), time(999))).toMatchObject({ action: "ignore", reason: "future" });
    expect((await processRule(rule.id, quote(110, 1000), time(1000))).action).toBe("baseline");
    expect((await processRule(rule.id, { ...quote(90, 1010), source: "finnhub" }, time(1010))).action).toBe("baseline");
    expect(await listPendingEvents()).toHaveLength(0);
  });

  it("edits and pauses reset baseline/version and cancel pending events; deleted rules do not fire", async () => {
    const rule = await createRule(userA, input, resolveStock);
    const snapshot = (await listActiveRules())[0]!;
    await processRule(rule.id, quote(90, 0), time(0), { expectedVersion: snapshot.version });
    await processRule(rule.id, quote(110, 10), time(10), { expectedVersion: snapshot.version });
    const event = (await listPendingEvents())[0]!;
    await updateRule(userA, rule.id.toUpperCase(), { threshold: 120 });
    expect(await listPendingEvents()).toHaveLength(0);
    expect(await isEventDeliverable(event)).toBe(false);
    expect((await processRule(rule.id, quote(130, 20), time(20), { expectedVersion: snapshot.version })).action).toBe("changed");
    expect((await processRule(rule.id, quote(130, 20), time(20))).action).toBe("baseline");
    await updateRule(userA, rule.id, { status: "paused" });
    expect((await processRule(rule.id, quote(140, 30), time(30))).action).toBe("unavailable");
    expect(await listActiveRules()).toHaveLength(0);
    await updateRule(userA, rule.id, { status: "active" });
    expect((await processRule(rule.id, quote(140, 40), time(40))).action).toBe("baseline");
    await deleteRule(userA, rule.id);
    expect((await processRule(rule.id, quote(150, 50), time(50))).action).toBe("unavailable");
  });

  it("paginates active rules so each poll can visit every owner", async () => {
    for (let index = 0; index < 3; index++) await createRule(userA, input, resolveStock);
    const first = await listActiveRules(2);
    const second = await listActiveRules(2, first[1]!._id.toHexString());
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((rule) => rule._id.toHexString())).size).toBe(3);
  });

  it("a simultaneous pause or delete cannot leave a pending crossing event", async () => {
    const paused = await createRule(userA, input, resolveStock);
    await processRule(paused.id, quote(90, 0), time(0));
    await Promise.all([
      processRule(paused.id, quote(110, 10), time(10), { expectedVersion: 1 }),
      updateRule(userA, paused.id, { status: "paused" }),
    ]);
    expect(await listPendingEvents()).toHaveLength(0);
    const deleted = await createRule(userA, input, resolveStock);
    await processRule(deleted.id, quote(90, 0), time(0));
    await Promise.all([
      processRule(deleted.id, quote(110, 10), time(10), { expectedVersion: 1 }),
      deleteRule(userA, deleted.id),
    ]);
    expect(await listPendingEvents()).toHaveLength(0);
  });
});
