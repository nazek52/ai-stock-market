import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId } from "mongodb";
import type { StockQuote } from "@/contracts";
import { closeDatabase, getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";
import { pollPriceAlerts, deliverPendingAlerts } from "@/server/alerts/worker";
import { createRule, listActiveRules, listPendingEvents, processRule, updateRule, type AlertEvent, type AlertRuleDocument } from "@/server/alerts/repository";
import * as alerts from "@/server/alerts/repository";
import * as notificationRepository from "@/server/notifications/repository";

let replica: MongoMemoryReplSet;
const base = Date.parse("2030-01-01T12:00:00Z");
let current = base;
const clock = () => new Date(current);
const resolve = async () => {};
const input = { symbol: "AAPL", type: "price_above" as const, currency: "USD" as const, threshold: 100, cooldownMinutes: 5 };
function quote(symbol = "AAPL", price = 90, observedAt = current): StockQuote {
  return { symbol, price, currency: "USD", change: null, changePercent: null, previousClose: null,
    observedAt: new Date(observedAt).toISOString(), fetchedAt: clock().toISOString(), source: "fixture" };
}
async function event(userId = "owner", symbol = "AAPL") {
  const rule = await createRule(userId, { ...input, symbol }, resolve);
  await processRule(rule.id, quote(symbol, 90, current - 1000), clock());
  await processRule(rule.id, quote(symbol, 110), clock());
  return (await listPendingEvents()).find((entry) => entry.ruleId === rule.id)!;
}

describe("bounded alert polling and durable mail delivery", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "alert_worker_integration");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ALERT_SCHEDULE_ENABLED", "true");
    vi.stubEnv("ALERT_POLL_SECONDS", "300");
    vi.stubEnv("MARKET_STALE_SECONDS", "900");
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
  });
  beforeEach(async () => {
    current = base;
    const db = await getDatabase();
    await Promise.all(["alert_rules", "alert_rule_owners", "alert_events", "alert_symbol_poll_state", "worker_leases", "notification_deliveries", "user"].map((name) => db.collection(name).deleteMany({})));
    await db.collection<{ _id: string; email: string; emailVerified: boolean }>("user").insertMany([
      { _id: "owner", email: "owner@example.test", emailVerified: true },
      { _id: "other", email: "other@example.test", emailVerified: true },
      { _id: "unverified", email: "unverified@example.test", emailVerified: false },
    ]);
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("fetches one grouped quote per symbol and enforces the durable 300-second interval", async () => {
    await createRule("owner", input, resolve);
    await createRule("other", input, resolve);
    const provider = vi.fn(async (symbol: string) => { current += 1000; return quote(symbol); });
    const first = await pollPriceAlerts({ clock, quoteProvider: provider });
    expect(first).toMatchObject({ symbols: 1, rules: 2, errors: 0 });
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await listActiveRules()).every((rule) => rule.lastCheckedAt?.getTime() === current)).toBe(true);
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).symbols).toBe(0);
    current = base + 300_000;
    await pollPriceAlerts({ clock, quoteProvider: provider });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("shares a 90-second polling lease between concurrent workers", async () => {
    await createRule("owner", input, resolve);
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((done) => { release = done; });
    const entered = new Promise<void>((done) => { started = done; });
    const provider = vi.fn(async () => { started(); await pending; return quote(); });
    const first = pollPriceAlerts({ clock, quoteProvider: provider });
    await entered;
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).skipped).toBe(true);
    release();
    await first;
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("uses the captured rule version when a user edits during the quote fetch", async () => {
    const rule = await createRule("owner", input, resolve);
    await pollPriceAlerts({ clock, quoteProvider: async () => {
      await updateRule("owner", rule.id, { threshold: 120 });
      current += 1000;
      return quote("AAPL", 130);
    } });
    const updated = (await listActiveRules())[0]!;
    expect(updated.version).toBe(2);
    expect(updated.lastObservedAt).toBeNull();
    expect(await listPendingEvents()).toEqual([]);
  });

  it("ignores stale quotes and isolates one failed symbol; rate-limit stops the batch", async () => {
    await createRule("owner", input, resolve);
    await pollPriceAlerts({ clock, quoteProvider: async () => quote("AAPL", 110, current - 901_000) });
    expect((await listActiveRules())[0]?.lastObservedAt).toBeNull();
    await createRule("owner", { ...input, symbol: "MSFT" }, resolve);
    await createRule("owner", { ...input, symbol: "NVDA" }, resolve);
    current += 300_000;
    const provider = vi.fn(async (symbol: string) => {
      if (symbol === "MSFT") throw new Error("private-provider-details");
      return quote(symbol);
    });
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).errors).toBe(1);
    expect((await listActiveRules()).find((rule) => rule.symbol === "NVDA")?.lastObservedAt).not.toBeNull();
    current += 300_000;
    const throttled = vi.fn(async () => { throw new AppError("RATE_LIMITED", "quota", 429, 60); });
    expect((await pollPriceAlerts({ clock, quoteProvider: throttled })).rateLimited).toBe(true);
    expect(throttled).toHaveBeenCalledTimes(1);
  });

  it("chooses at most five distinct oldest symbols and rotates omitted symbols to the next tick", async () => {
    for (const symbol of ["AAPL", "AMZN", "GOOG", "META", "MSFT", "NVDA"]) await createRule("owner", { ...input, symbol }, resolve);
    const provider = vi.fn(async (symbol: string) => quote(symbol));
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).symbols).toBe(5);
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).symbols).toBe(1);
    expect(new Set(provider.mock.calls.map(([symbol]) => symbol)).size).toBe(6);
  });

  it("persists cursor progress across the deadline and resumes a cached quote without refetch", async () => {
    const db = await getDatabase();
    const template = await createRule("owner", input, resolve);
    const original = await db.collection<AlertRuleDocument>("alert_rules").findOne({ _id: new ObjectId(template.id) });
    await db.collection<AlertRuleDocument>("alert_rules").insertMany(Array.from({ length: 110 }, (_, index) => ({ ...original!, _id: new ObjectId(), userId: `synthetic-${index}` })));
    const implementation = alerts.processRule;
    const process = vi.spyOn(alerts, "processRule");
    let calls = 0;
    process.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (++calls === 15) current += 2000;
      return result;
    });
    const provider = vi.fn(async () => quote());
    try {
      expect((await pollPriceAlerts({ clock, quoteProvider: provider, maxRunMs: 1000 })).deadline).toBe(true);
    } finally { process.mockRestore(); }
    const saved = await db.collection<{ _id: string; cursor: ObjectId | null; activePass: boolean }>("alert_symbol_poll_state").findOne({ _id: "AAPL" });
    expect(saved?.cursor).toBeInstanceOf(ObjectId);
    expect(saved?.activePass).toBe(true);
    expect((await pollPriceAlerts({ clock, quoteProvider: provider })).rules).toBe(96);
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await db.collection<{ _id: string; activePass: boolean }>("alert_symbol_poll_state").findOne({ _id: "AAPL" }))?.activePass).toBe(false);
  });

  it("delivers a persisted event once across replay and concurrent runs, recording source timestamps", async () => {
    const pending = await event();
    const sent: string[] = [];
    const send = vi.fn(async (message: { text: string }) => { sent.push(message.text); });
    await Promise.all([deliverPendingAlerts({ clock, transport: { send } }), deliverPendingAlerts({ clock, transport: { send } })]);
    await deliverPendingAlerts({ clock, transport: { send } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await listPendingEvents()).toEqual([]);
    expect(await (await getDatabase()).collection<{ _id: string }>("alert_events").findOne({ _id: pending._id })).toMatchObject({ status: "delivered" });
    expect(sent[0]).toContain("fixture");
    expect(sent[0]).toContain("110 USD");
    expect(sent[0]).toContain(pending.observedAt.toISOString());
    expect(sent[0]).toContain(pending.checkedAt.toISOString());
  });

  it("does not send paused rules or stale events", async () => {
    const paused = await event();
    await updateRule("owner", paused.ruleId, { status: "paused" });
    await event("other", "MSFT");
    current += 901_000;
    const send = vi.fn(async () => {});
    expect((await deliverPendingAlerts({ clock, transport: { send } })).cancelled).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await listPendingEvents()).toEqual([]);
  });

  it("cancels terminal outcomes so a hundred bad first events cannot starve the next valid user", async () => {
    const first = await event("unverified");
    const db = await getDatabase();
    const outbox = db.collection<AlertEvent>("alert_events");
    await outbox.deleteOne({ _id: first._id });
    await outbox.insertMany(Array.from({ length: 100 }, (_, index) => ({ ...first, _id: `synthetic-bad-${String(index).padStart(3, "0")}`, checkedAt: new Date(current - 1000) })));
    await event("owner", "MSFT");
    const send = vi.fn(async () => {});
    expect((await deliverPendingAlerts({ clock, transport: { send } })).cancelled).toBe(100);
    expect(send).not.toHaveBeenCalled();
    expect((await deliverPendingAlerts({ clock, transport: { send } })).delivered).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.collection("notification_deliveries").countDocuments()).toBe(101);
  });

  it("retires unknown SMTP outcomes without an automatic duplicate retry", async () => {
    const pending = await event();
    const send = vi.fn(async () => { throw new Error("unknown smtp outcome"); });
    expect((await deliverPendingAlerts({ clock, transport: { send } })).cancelled).toBe(1);
    expect(await listPendingEvents()).toEqual([]);
    await deliverPendingAlerts({ clock, transport: { send } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await (await getDatabase()).collection<{ _id: string }>("alert_events").findOne({ _id: pending._id })).toMatchObject({ status: "cancelled" });
  });

  it("keeps known pre-SMTP failures pending and retries the same event once", async () => {
    const pending = await event();
    const send = vi.fn(async () => {});
    const lookup = vi.spyOn(notificationRepository, "getRecipient").mockRejectedValueOnce(new Error("private-storage-error"));
    try {
      await expect(deliverPendingAlerts({ clock, transport: { send } })).rejects.toThrow("require retry");
      expect(send).not.toHaveBeenCalled();
      expect(await listPendingEvents()).toMatchObject([{ _id: pending._id }]);
    } finally { lookup.mockRestore(); }
    expect((await deliverPendingAlerts({ clock, transport: { send } })).delivered).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("leaves polling and mail disabled unless their explicit flags and SMTP transport allow them", async () => {
    await createRule("owner", input, resolve);
    const provider = vi.fn(async () => quote());
    vi.stubEnv("ALERT_SCHEDULE_ENABLED", "false");
    try { expect((await pollPriceAlerts({ clock, quoteProvider: provider })).skipped).toBe(true); }
    finally { vi.stubEnv("ALERT_SCHEDULE_ENABLED", "true"); }
    expect(provider).not.toHaveBeenCalled();
    await event("other", "MSFT");
    const send = vi.fn(async () => {});
    vi.stubEnv("EMAIL_TRANSPORT", "stream");
    try { expect((await deliverPendingAlerts({ clock, transport: { send } })).skipped).toBe(true); }
    finally { vi.stubEnv("EMAIL_TRANSPORT", "smtp"); }
    expect(send).not.toHaveBeenCalled();
    expect(await listPendingEvents()).toHaveLength(1);
  });

  it("revalidates a pause after queue selection immediately before calling the email sender", async () => {
    const pending = await event();
    const original = alerts.isEventDeliverable;
    const check = vi.spyOn(alerts, "isEventDeliverable").mockImplementation(async (entry) => {
      await updateRule("owner", entry.ruleId, { status: "paused" });
      return original(entry);
    });
    const send = vi.fn(async () => {});
    try { expect((await deliverPendingAlerts({ clock, transport: { send } })).cancelled).toBe(1); }
    finally { check.mockRestore(); }
    expect(send).not.toHaveBeenCalled();
    expect(await (await getDatabase()).collection<{ _id: string }>("alert_events").findOne({ _id: pending._id })).toMatchObject({ status: "cancelled" });
  });
});
