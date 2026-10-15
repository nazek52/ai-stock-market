import "server-only";
import { createHash } from "node:crypto";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import type { StockQuote } from "@/contracts";
import { getServerEnvironment } from "@/server/config";
import { getDatabase } from "@/server/db";
import { AppError, apiHandler, assertSameOrigin, jsonSuccess, parseJson } from "@/server/http";
import { requireSession } from "@/server/auth/session";
import { getMarketClient } from "@/server/market";
import { consumeQuota } from "@/server/rate-limit";
import { createRule, deleteRule, isEventDeliverable, markEventDelivered, processRule, type AlertEvent, type StockResolver } from "@/server/alerts/repository";
import { alertEmailRequest } from "@/server/alerts/worker";
import { getRecipient } from "@/server/notifications/repository";
import { sendTransactionalEmail, type MailTransport } from "@/server/notifications/send";
import type { DeliveryStatus } from "@/server/notifications/types";

export const demoRequestSchema = z.strictObject({ requestId: z.uuid() });
export interface DemoScenarioResult {
  source: "fixture";
  symbol: "AAPL";
  currency: "USD";
  fromPrice: 99;
  toPrice: 101;
  threshold: 100;
  rulesCreated: 1;
  eventsCreated: 1;
  temporaryRuleDeleted: true;
  status: DeliveryStatus;
}
interface ScenarioDocument {
  _id: string;
  userId: string;
  status: "processing" | "complete" | "failed";
  createdAt: Date;
  updatedAt: Date;
  ruleId?: string;
  eventKey?: string;
  result?: DemoScenarioResult;
}
export interface ScenarioDependencies {
  transport?: MailTransport;
  resolveStock?: StockResolver;
}

/** Fail closed before authentication/DB access outside the isolated local showcase. */
export function assertLocalDemo() {
  if (process.env.LOCAL_DEMO !== "true" || process.env.NODE_ENV === "production") {
    throw new AppError("NOT_FOUND", "Demo is unavailable", 404);
  }
  const env = getServerEnvironment();
  if (env.MARKET_DATA_MODE !== "fixture" || env.AI_MODE !== "fixture"
    || !env.EMAIL_ENABLED || env.EMAIL_TRANSPORT !== "smtp"
    || !["127.0.0.1", "localhost", "::1"].includes(env.SMTP_HOST)
    || env.SMTP_PORT !== 1025 || env.SMTP_SECURE || env.SMTP_USER || env.SMTP_PASSWORD
    || env.DIGEST_SCHEDULE_ENABLED || env.ALERT_SCHEDULE_ENABLED
    || !env.MONGODB_DATABASE.endsWith("_demo")) {
    throw new AppError("FORBIDDEN", "Demo requires isolated fixture data and local Mailpit with schedules disabled", 403);
  }
  return env;
}

function syntheticQuote(price: number, observedAt: Date): StockQuote {
  return { symbol: "AAPL", currency: "USD", price, change: null, changePercent: null, previousClose: null,
    observedAt: observedAt.toISOString(), fetchedAt: observedAt.toISOString(), source: "fixture" };
}

/** Internal API: userId must come from the server session, never a request body. */
export async function runAlertScenario(userId: string, requestId: string, dependencies: ScenarioDependencies = {}): Promise<DemoScenarioResult> {
  const env = assertLocalDemo();
  demoRequestSchema.parse({ requestId });
  const recipient = await getRecipient(userId);
  if (!recipient?.emailVerified) throw new AppError("FORBIDDEN", "Confirm your email in Mailpit before running the demo", 403);
  const db = await getDatabase();
  const scenarios = db.collection<ScenarioDocument>("demo_scenarios");
  const _id = createHash("sha256").update(`${userId}:${requestId}`).digest("hex");
  try {
    await scenarios.insertOne({ _id, userId, status: "processing", createdAt: new Date(), updatedAt: new Date() });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    const previous = await scenarios.findOne({ _id, userId });
    if (previous?.status === "complete" && previous.result) return previous.result;
    throw new AppError("CONFLICT", "This scenario is processing or needs manual review; it will not resend email", 409);
  }
  let ruleId: string | undefined;
  try {
    await consumeQuota(`demo-scenario:${userId}`, 1, 60_000);
    const rule = await createRule(userId, {
      symbol: "AAPL", type: "price_above", threshold: 100, currency: "USD", cooldownMinutes: 5,
    }, dependencies.resolveStock ?? (async (symbol) => { await getMarketClient().company(symbol); }));
    ruleId = rule.id;
    await scenarios.updateOne({ _id }, { $set: { ruleId, updatedAt: new Date() } });
    const now = new Date();
    const baseline = await processRule(ruleId, syntheticQuote(99, new Date(now.getTime() - 1000)), now,
      { expectedVersion: 1, maxAgeSeconds: env.MARKET_STALE_SECONDS });
    const crossing = await processRule(ruleId, syntheticQuote(101, now), now,
      { expectedVersion: 1, maxAgeSeconds: env.MARKET_STALE_SECONDS });
    if (baseline.action !== "baseline" || crossing.action !== "trigger" || !("eventKey" in crossing)) {
      throw new Error("Synthetic crossing was not persisted");
    }
    await scenarios.updateOne({ _id }, { $set: { eventKey: crossing.eventKey, updatedAt: new Date() } });
    const event = await db.collection<AlertEvent>("alert_events").findOne({ _id: crossing.eventKey, userId });
    if (!event || !await isEventDeliverable(event)) throw new Error("Synthetic event is no longer deliverable");
    const delivery = await sendTransactionalEmail(alertEmailRequest(event), dependencies.transport);
    if (delivery.status === "sent") await markEventDelivered(event._id);
    // Deletion transactionally cancels any pending/uncertain event, preserving both journals.
    await deleteRule(userId, ruleId);
    ruleId = undefined;
    const result: DemoScenarioResult = {
      source: "fixture", symbol: "AAPL", currency: "USD", fromPrice: 99, toPrice: 101, threshold: 100,
      rulesCreated: 1, eventsCreated: 1, temporaryRuleDeleted: true, status: delivery.status,
    };
    await scenarios.updateOne({ _id, status: "processing" }, { $set: { status: "complete", result, updatedAt: new Date() } });
    return result;
  } catch (error) {
    // Failed/uncertain requests never become retryable: SMTP may already have accepted a message.
    try { await scenarios.updateOne({ _id, status: "processing" }, { $set: { status: "failed", updatedAt: new Date() } }); } catch { /* Keep processing claim if DB is unavailable. */ }
    if (error instanceof AppError && error.code === "RATE_LIMITED") throw error;
    throw new AppError("SERVICE_UNAVAILABLE", "Demo could not finish; review the local journal before starting another scenario", 503);
  } finally {
    if (ruleId) {
      try { await deleteRule(userId, ruleId); } catch { console.error("demo.cleanup.failed", { reason: "manual_review_required" }); }
    }
  }
}

export function handleAlertScenario(request: Request, dependencies: ScenarioDependencies = {}) {
  return apiHandler(async () => {
    assertLocalDemo();
    assertSameOrigin(request);
    const session = await requireSession(request.headers);
    const { requestId } = await parseJson(request, demoRequestSchema);
    return jsonSuccess(await runAlertScenario(session.user.id, requestId, dependencies));
  });
}
