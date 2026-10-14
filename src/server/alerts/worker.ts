import "server-only";
import { ObjectId } from "mongodb";
import type { StockQuote } from "@/contracts";
import { getServerEnvironment } from "@/server/config";
import { getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";
import { getMarketClient } from "@/server/market";
import { acquireLease } from "@/server/rate-limit";
import { sendTransactionalEmail, type MailTransport } from "@/server/notifications/send";
import { deliveryCollection } from "@/server/notifications/repository";
import {
  isEventDeliverable, listPendingEvents, markEventDelivered, processRule,
  type AlertEvent, type AlertRuleDocument,
} from "./repository";

interface SymbolPollState {
  _id: string;
  lastAttemptAt?: Date;
  lastVisitedAt?: Date;
  nextAttemptAt?: Date;
  cursor: ObjectId | null;
  activePass: boolean;
  quote: StockQuote | null;
  reason?: string;
}
interface WorkerDependencies {
  clock?: () => Date;
  /** Test-only bound may be shorter; production always caps a run at 60 seconds. */
  maxRunMs?: number;
}
export interface PollDependencies extends WorkerDependencies {
  quoteProvider?: (symbol: string) => Promise<StockQuote>;
}
export interface DeliveryDependencies extends WorkerDependencies { transport?: MailTransport }

function budget(dependencies: WorkerDependencies) {
  const clock = dependencies.clock ?? (() => new Date());
  const startedAt = clock().getTime();
  const wallStartedAt = Date.now();
  const maximum = Math.max(1, Math.min(60_000, dependencies.maxRunMs ?? 60_000));
  const remaining = () => maximum - Math.max(clock().getTime() - startedAt, Date.now() - wallStartedAt);
  return { clock, remaining };
}

async function bounded<T>(operation: Promise<T>, remaining: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppError("SERVICE_UNAVAILABLE", "Alert worker deadline reached", 503)), Math.max(1, remaining)); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function lease(key: string, clock: () => Date) {
  try { return await acquireLease(key, 90_000, clock().getTime()); }
  catch (error) { if (error instanceof AppError && error.code === "RATE_LIMITED") return null; throw error; }
}

function usableStoredQuote(quote: StockQuote | null | undefined, now: Date, maxAgeSeconds: number): quote is StockQuote {
  if (!quote) return false;
  const observed = Date.parse(quote.observedAt);
  const fetched = Date.parse(quote.fetchedAt);
  return Number.isFinite(observed) && Number.isFinite(fetched) && observed <= fetched && fetched <= now.getTime()
    && now.getTime() - observed <= maxAgeSeconds * 1000;
}

/** One quote per symbol/pass, durable per-symbol cooldown, and resumable rule pages. */
export async function pollPriceAlerts(dependencies: PollDependencies = {}) {
  const env = getServerEnvironment();
  const result = { symbols: 0, rules: 0, triggered: 0, errors: 0, rateLimited: false, deadline: false, skipped: false };
  if (!env.ALERT_SCHEDULE_ENABLED) return { ...result, skipped: true };
  const { clock, remaining } = budget(dependencies);
  const release = await lease("alerts:poll", clock);
  if (!release) return { ...result, skipped: true };
  try {
    const db = await getDatabase();
    const states = db.collection<SymbolPollState>("alert_symbol_poll_state");
    const rules = db.collection<AlertRuleDocument>("alert_rules");
    if (remaining() <= 0) return { ...result, deadline: true };
    // Missing symbols sort first; previously visited symbols rotate by durable visit time.
    const candidates = await rules.aggregate<{ _id: string }>([
      { $match: { status: "active" } }, { $group: { _id: "$symbol" } },
      { $lookup: { from: "alert_symbol_poll_state", localField: "_id", foreignField: "_id", as: "poll" } },
      { $set: { poll: { $arrayElemAt: ["$poll", 0] } } },
      { $match: { $or: [{ "poll.activePass": true }, { "poll.nextAttemptAt": { $lte: clock() } }, { "poll.nextAttemptAt": { $exists: false } }] } },
      { $set: { lastVisit: { $ifNull: ["$poll.lastVisitedAt", new Date(0)] } } },
      { $sort: { lastVisit: 1, _id: 1 } }, { $limit: 5 }, { $project: { _id: 1 } },
    ], { maxTimeMS: Math.max(1, Math.min(5000, remaining())) }).toArray();
    for (const candidate of candidates) {
      if (remaining() <= 0) { result.deadline = true; break; }
      const symbol = candidate._id;
      const state = await states.findOne({ _id: symbol });
      let cursor = state?.cursor ?? null;
      try {
        // Capture the first page/version before the asynchronous quote fetch.
        let page = await rules.find({ status: "active", symbol, ...(cursor ? { _id: { $gt: cursor } } : {}) }).sort({ _id: 1 }).limit(100).toArray();
        if (!page.length) {
          await states.updateOne({ _id: symbol }, { $set: { cursor: null, activePass: false, quote: null, lastVisitedAt: clock() } }, { upsert: true });
          continue;
        }
        if (remaining() <= 0) { result.deadline = true; break; }
        let quote = state?.quote;
        if (!state?.activePass || !usableStoredQuote(quote, clock(), env.MARKET_STALE_SECONDS)) {
          if (state?.nextAttemptAt && state.nextAttemptAt > clock()) {
            await states.updateOne({ _id: symbol }, { $set: { activePass: false, quote: null, lastVisitedAt: clock() } });
            continue;
          }
          const attemptAt = clock();
          await states.updateOne({ _id: symbol }, { $set: {
            lastAttemptAt: attemptAt, lastVisitedAt: attemptAt, nextAttemptAt: new Date(attemptAt.getTime() + env.ALERT_POLL_SECONDS * 1000),
            cursor, activePass: false, quote: null,
          } }, { upsert: true });
          quote = await bounded((dependencies.quoteProvider ?? ((input) => getMarketClient().quote(input)))(symbol), Math.min(15_000, remaining()));
          result.symbols++;
          await states.updateOne({ _id: symbol }, { $set: { quote, activePass: true, lastVisitedAt: clock() }, $unset: { reason: "" } });
        } else {
          await states.updateOne({ _id: symbol }, { $set: { lastVisitedAt: clock() } });
        }
        while (page.length) {
          for (const snapshot of page) {
            if (remaining() <= 0) { result.deadline = true; break; }
            const checkedAt = clock(); // Must be after fetch: a new fetchedAt is not future data.
            const evaluated = await bounded(processRule(snapshot._id.toHexString(), quote!, checkedAt, {
              expectedVersion: snapshot.version, maxAgeSeconds: env.MARKET_STALE_SECONDS,
            }), remaining());
            result.rules++;
            if (evaluated.action === "trigger") result.triggered++;
            cursor = snapshot._id;
            await states.updateOne({ _id: symbol }, { $set: { cursor } });
          }
          if (result.deadline) break;
          page = await rules.find({ status: "active", symbol, _id: { $gt: cursor! } }).sort({ _id: 1 }).limit(100).toArray();
        }
        if (!result.deadline) await states.updateOne({ _id: symbol }, { $set: { cursor: null, activePass: false, quote: null } });
      } catch (error) {
        result.errors++;
        const rateLimited = error instanceof AppError && error.code === "RATE_LIMITED";
        await states.updateOne({ _id: symbol }, { $set: { reason: rateLimited ? "rate_limited" : "poll_failed", lastVisitedAt: clock() } }, { upsert: true });
        if (rateLimited) { result.rateLimited = true; break; }
        console.error("alert.poll.failed", { reason: "symbol_failed" });
      }
      if (result.deadline || remaining() <= 0) { result.deadline = true; break; }
    }
    return result;
  } finally { await release(); }
}

async function cancelEvent(event: AlertEvent, reason: string, now: Date) {
  await (await getDatabase()).collection<AlertEvent & { cancellationReason?: string; cancelledAt?: Date }>("alert_events")
    .updateOne({ _id: event._id, status: "pending" }, { $set: { status: "cancelled", cancellationReason: reason, cancelledAt: now } });
}

/** Delivery is a separate job so polling never holds a quote/provider lease for SMTP. */
export async function deliverPendingAlerts(dependencies: DeliveryDependencies = {}) {
  const env = getServerEnvironment();
  const result = { delivered: 0, cancelled: 0, pending: 0, errors: 0, skipped: false };
  if (!env.ALERT_SCHEDULE_ENABLED || !env.EMAIL_ENABLED || env.EMAIL_TRANSPORT !== "smtp") return { ...result, skipped: true };
  const { clock, remaining } = budget(dependencies);
  const release = await lease("alerts:delivery", clock);
  if (!release) return { ...result, skipped: true };
  let retry = false;
  try {
    // An orphan SMTP claim is never resent. Retire its pending alert after preserving uncertainty.
    const journal = await deliveryCollection();
    await journal.updateMany({ type: "price_alert", status: "sending", claimedAt: { $lt: new Date(clock().getTime() - 5 * 60_000) } }, {
      $set: { status: "uncertain", reason: "interrupted_send", updatedAt: clock() },
    });
    const events = await listPendingEvents(100);
    for (const event of events) {
      // Reserve the configured SMTP socket timeout plus DB bookkeeping time.
      if (remaining() < 25_000) break;
      try {
        const now = clock();
        const observedAge = now.getTime() - event.observedAt.getTime();
        const checkedAge = now.getTime() - event.checkedAt.getTime();
        if (!Number.isFinite(observedAge) || !Number.isFinite(checkedAge) || observedAge < 0 || checkedAge < 0
          || observedAge > env.MARKET_STALE_SECONDS * 1000 || checkedAge > env.MARKET_STALE_SECONDS * 1000) {
          await cancelEvent(event, "event_stale_or_invalid", now); result.cancelled++; continue;
        }
        if (env.NODE_ENV === "production" && event.source === "fixture") {
          await cancelEvent(event, "fixture_production", now); result.cancelled++; continue;
        }
        // Last domain check immediately before the generic sender's recipient/claim checks.
        if (!await isEventDeliverable(event)) {
          await cancelEvent(event, "rule_changed", now); result.cancelled++; continue;
        }
        const delivery = await bounded(sendTransactionalEmail({
          userId: event.userId, type: "price_alert", idempotencyKey: `alert:${event._id}`,
          payload: {
            subject: `Уведомление цены ${event.symbol}`, title: `Условие цены ${event.symbol} выполнено`, fixture: event.source === "fixture",
            paragraphs: [
              `Цена: ${event.price} ${event.currency}; порог ${event.type === "price_above" ? "выше" : "ниже"} ${event.threshold} ${event.currency}.`,
              `Источник: ${event.source}. Время котировки: ${event.observedAt.toISOString()}. Время проверки: ${event.checkedAt.toISOString()}.`,
            ], links: [],
          },
        }, dependencies.transport), remaining());
        if (delivery.status === "sent") { await markEventDelivered(event._id, clock()); result.delivered++; }
        else if (delivery.status === "skipped" || delivery.status === "uncertain") {
          await cancelEvent(event, `delivery_${delivery.status}:${delivery.reason ?? "terminal"}`, clock()); result.cancelled++;
        } else result.pending++;
      } catch {
        // Before SMTP, generic delivery resets its claim safely; keep the outbox event for retry.
        result.errors++; retry = true;
        console.error("alert.delivery.failed", { reason: "retry_required" });
      }
    }
    if (retry) throw new AppError("SERVICE_UNAVAILABLE", "Some alert deliveries require retry", 503);
    return result;
  } finally { await release(); }
}
