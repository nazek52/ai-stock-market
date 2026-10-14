import "server-only";
import { ObjectId, type ClientSession } from "mongodb";
import {
  priceAlertCreateSchema, priceAlertUpdateSchema,
  type PriceAlertCreate, type PriceAlertRule, type PriceAlertUpdate, type StockQuote,
} from "@/contracts";
import { getDatabase, getMongoClient } from "@/server/db";
import { getServerEnvironment } from "@/server/config";
import { AppError } from "@/server/errors";
import { evaluateQuote, type EvaluationState, type EvaluationResult } from "./evaluate";

export const MAX_RULES_PER_USER = 50;
export type StockResolver = (symbol: string) => Promise<void>;

export interface AlertRuleDocument extends PriceAlertCreate, EvaluationState {
  _id: ObjectId;
  userId: string;
  status: "active" | "paused";
  version: number;
  evaluationRevision: number;
  createdAt: Date;
  updatedAt: Date;
  lastPrice: number | null;
  lastCheckedAt: Date | null;
}

export interface AlertEvent {
  _id: string;
  ruleId: string;
  ruleVersion: number;
  userId: string;
  symbol: string;
  type: PriceAlertCreate["type"];
  threshold: number;
  price: number;
  currency: "USD";
  source: StockQuote["source"];
  observedAt: Date;
  checkedAt: Date;
  status: "pending" | "delivered" | "cancelled";
  deliveredAt: Date | null;
}

let indexSetup: Promise<unknown> | undefined;
async function collections() {
  const db = await getDatabase();
  const rules = db.collection<AlertRuleDocument>("alert_rules");
  const events = db.collection<AlertEvent>("alert_events");
  const owners = db.collection<{ _id: string; ruleCount: number }>("alert_rule_owners");
  indexSetup ??= Promise.all([
    rules.createIndex({ userId: 1, createdAt: -1 }, { name: "alert_rule_owner_created" }),
    rules.createIndex({ status: 1, symbol: 1 }, { name: "alert_rule_poll" }),
    events.createIndex({ status: 1, checkedAt: 1 }, { name: "alert_event_pending" }),
    events.createIndex({ ruleId: 1, ruleVersion: 1 }, { name: "alert_event_rule_version" }),
  ]).catch((error: unknown) => { indexSetup = undefined; throw error; });
  await indexSetup;
  return { rules, events, owners };
}

function parseId(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError("NOT_FOUND", "Alert rule was not found", 404);
  return new ObjectId(id);
}

function dto(rule: AlertRuleDocument): PriceAlertRule {
  return {
    id: rule._id.toHexString(), symbol: rule.symbol, type: rule.type,
    threshold: rule.threshold, currency: rule.currency, cooldownMinutes: rule.cooldownMinutes,
    status: rule.status, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString(),
    lastTriggeredAt: rule.lastTriggeredAt?.toISOString() ?? null,
  };
}

async function transaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  return client.withSession((session) => session.withTransaction(() => operation(session), {
    readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
  }));
}

export async function listRules(userId: string): Promise<PriceAlertRule[]> {
  const { rules } = await collections();
  return (await rules.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(MAX_RULES_PER_USER).toArray()).map(dto);
}

export async function createRule(userId: string, input: PriceAlertCreate, resolveStock: StockResolver): Promise<PriceAlertRule> {
  const validated = priceAlertCreateSchema.parse(input);
  await resolveStock(validated.symbol);
  const { rules, owners } = await collections();
  // The per-owner document serializes concurrent creates; countDocuments alone permits write skew.
  await owners.updateOne({ _id: userId }, { $setOnInsert: { ruleCount: 0 } }, { upsert: true });
  const now = new Date();
  const document: AlertRuleDocument = {
    _id: new ObjectId(), userId, ...validated, status: "active", version: 1, evaluationRevision: 0,
    createdAt: now, updatedAt: now, lastObservedAt: null, lastMatched: null, lastSource: null,
    lastTriggeredAt: null, lastPrice: null, lastCheckedAt: null,
  };
  await transaction(async (session) => {
    const owner = await owners.findOneAndUpdate({ _id: userId, ruleCount: { $lt: MAX_RULES_PER_USER } }, {
      $inc: { ruleCount: 1 },
    }, { session, returnDocument: "after" });
    if (!owner) throw new AppError("CONFLICT", `At most ${MAX_RULES_PER_USER} alert rules are allowed`, 409);
    await rules.insertOne(document, { session });
  });
  return dto(document);
}

export async function updateRule(userId: string, id: string, input: PriceAlertUpdate): Promise<PriceAlertRule> {
  const _id = parseId(id);
  const validated = priceAlertUpdateSchema.parse(input);
  const { rules, events } = await collections();
  return transaction(async (session) => {
    const document = await rules.findOneAndUpdate({ _id, userId }, {
      $set: {
        ...validated, updatedAt: new Date(), lastObservedAt: null, lastMatched: null,
        lastSource: null, lastPrice: null, lastCheckedAt: null,
      },
      $inc: { version: 1, evaluationRevision: 1 },
    }, { returnDocument: "after", session });
    if (!document) throw new AppError("NOT_FOUND", "Alert rule was not found", 404);
    await events.updateMany({ ruleId: _id.toHexString(), status: "pending" }, { $set: { status: "cancelled" } }, { session });
    return dto(document);
  });
}

export async function deleteRule(userId: string, id: string): Promise<{ deleted: boolean }> {
  const _id = parseId(id);
  const { rules, events, owners } = await collections();
  return transaction(async (session) => {
    const deleted = await rules.deleteOne({ _id, userId }, { session });
    if (!deleted.deletedCount) return { deleted: false };
    await owners.updateOne({ _id: userId, ruleCount: { $gt: 0 } }, { $inc: { ruleCount: -1 } }, { session });
    await events.updateMany({ ruleId: _id.toHexString(), status: "pending" }, { $set: { status: "cancelled" } }, { session });
    return { deleted: true };
  });
}

/** Internal worker API. expectedVersion from the polling snapshot guards edits during quote fetch. */
export async function listActiveRules(limit = 200, afterId?: string): Promise<AlertRuleDocument[]> {
  const { rules } = await collections();
  return rules.find({ status: "active", ...(afterId ? { _id: { $gt: parseId(afterId) } } : {}) })
    .sort({ _id: 1 }).limit(Math.min(1000, Math.max(1, limit))).toArray();
}

export type ProcessResult =
  | { action: "unavailable" | "changed" }
  | EvaluationResult
  | { action: "trigger"; eventKey: string; matched: boolean; observedAt: Date };

export async function processRule(
  id: string, quote: StockQuote, now = new Date(), options: { expectedVersion?: number; maxAgeSeconds?: number } = {},
): Promise<ProcessResult> {
  const _id = parseId(id);
  const { rules, events } = await collections();
  const maxAge = options.maxAgeSeconds ?? getServerEnvironment().MARKET_STALE_SECONDS;
  return transaction(async (session): Promise<ProcessResult> => {
    const rule = await rules.findOne({ _id, status: "active" }, { session });
    if (!rule) return { action: "unavailable" };
    if (options.expectedVersion !== undefined && options.expectedVersion !== rule.version) return { action: "changed" };
    const result = evaluateQuote(rule, quote, now, maxAge);
    if (result.action === "ignore") return result;
    const update = await rules.updateOne({
      _id, status: "active", version: rule.version, evaluationRevision: rule.evaluationRevision,
    }, {
      $set: {
        lastObservedAt: result.observedAt, lastMatched: result.matched, lastPrice: quote.price,
        lastSource: quote.source, lastCheckedAt: now,
        ...(result.action === "trigger" ? { lastTriggeredAt: now } : {}),
      },
      $inc: { evaluationRevision: 1 },
    }, { session });
    if (!update.modifiedCount) return { action: "changed" };
    if (result.action !== "trigger") return result;
    const ruleId = _id.toHexString();
    const eventKey = `${ruleId}:${rule.version}:${result.observedAt.toISOString()}`;
    await events.insertOne({
      _id: eventKey, ruleId, ruleVersion: rule.version, userId: rule.userId,
      symbol: rule.symbol, type: rule.type, threshold: rule.threshold, price: quote.price,
      currency: rule.currency, source: quote.source, observedAt: result.observedAt, checkedAt: now,
      status: "pending", deliveredAt: null,
    }, { session });
    return { ...result, eventKey };
  });
}

/** The delivery worker must reuse _id as its provider idempotency key. */
export async function listPendingEvents(limit = 100): Promise<AlertEvent[]> {
  const { events } = await collections();
  return events.find({ status: "pending" }).sort({ checkedAt: 1, _id: 1 }).limit(Math.min(1000, Math.max(1, limit))).toArray();
}

export async function markEventDelivered(eventKey: string, now = new Date()): Promise<boolean> {
  const { events } = await collections();
  const update = await events.updateOne({ _id: eventKey, status: "pending" }, { $set: { status: "delivered", deliveredAt: now } });
  return update.modifiedCount === 1;
}

/** Revalidate immediately before delivery; edit/pause/delete cancels pending events transactionally. */
export async function isEventDeliverable(event: AlertEvent): Promise<boolean> {
  const { rules, events } = await collections();
  const [current, pending] = await Promise.all([
    rules.findOne({ _id: parseId(event.ruleId), userId: event.userId, version: event.ruleVersion, status: "active" }),
    events.findOne({ _id: event._id, status: "pending" }),
  ]);
  return !!current && !!pending;
}
