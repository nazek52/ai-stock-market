import type { PriceAlertCreate, StockQuote } from "@/contracts";

export interface EvaluationState {
  lastObservedAt: Date | null;
  lastMatched: boolean | null;
  lastSource: StockQuote["source"] | null;
  lastTriggeredAt: Date | null;
}

export type EvaluationResult =
  | { action: "ignore"; reason: "invalid" | "symbol" | "currency" | "stale" | "future" | "out_of_order" }
  | { action: "baseline" | "observe" | "trigger"; matched: boolean; observedAt: Date };

/** Source time, not fetch time, orders observations. Equality is outside both strict conditions. */
export function evaluateQuote(
  rule: PriceAlertCreate & EvaluationState,
  quote: StockQuote,
  now: Date,
  maxAgeSeconds = 900,
): EvaluationResult {
  const observedMs = Date.parse(quote.observedAt);
  const fetchedMs = Date.parse(quote.fetchedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs) || !Number.isFinite(fetchedMs)
    || !Number.isFinite(quote.price) || quote.price <= 0
    || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0
    || !["fixture", "finnhub"].includes(quote.source)) return { action: "ignore", reason: "invalid" };
  if (rule.symbol !== quote.symbol) return { action: "ignore", reason: "symbol" };
  if (rule.currency !== quote.currency) return { action: "ignore", reason: "currency" };
  if (observedMs > nowMs || fetchedMs > nowMs || observedMs > fetchedMs) return { action: "ignore", reason: "future" };
  if (nowMs - observedMs > maxAgeSeconds * 1000) return { action: "ignore", reason: "stale" };
  if (rule.lastObservedAt && observedMs <= rule.lastObservedAt.getTime()) return { action: "ignore", reason: "out_of_order" };
  const matched = rule.type === "price_above" ? quote.price > rule.threshold : quote.price < rule.threshold;
  const observedAt = new Date(observedMs);
  // A new rule/source establishes a baseline; being already above a threshold is not a crossing.
  if (rule.lastMatched === null || rule.lastSource !== quote.source || !rule.lastObservedAt
    || nowMs - rule.lastObservedAt.getTime() > maxAgeSeconds * 1000) return { action: "baseline", matched, observedAt };
  const crossed = !rule.lastMatched && matched;
  const cooledDown = !rule.lastTriggeredAt || nowMs - rule.lastTriggeredAt.getTime() >= rule.cooldownMinutes * 60_000;
  return { action: crossed && cooledDown ? "trigger" : "observe", matched, observedAt };
}
