import { describe, expect, it } from "vitest";
import type { PriceAlertCreate, StockQuote } from "@/contracts";
import { evaluateQuote, type EvaluationState } from "@/server/alerts/evaluate";

const now = new Date("2030-01-01T12:00:00.000Z");
const observedAt = new Date(now.getTime() - 10_000);
const rule: PriceAlertCreate & EvaluationState = {
  symbol: "AAPL", type: "price_above", threshold: 100, currency: "USD", cooldownMinutes: 5,
  lastObservedAt: new Date(now.getTime() - 20_000), lastMatched: false, lastSource: "fixture", lastTriggeredAt: null,
};
const quote: StockQuote = {
  symbol: "AAPL", price: 101, currency: "USD", change: null, changePercent: null, previousClose: null,
  observedAt: observedAt.toISOString(), fetchedAt: now.toISOString(), source: "fixture",
};

describe("P7.2/P7.4 crossing evaluation", () => {
  it("establishes a baseline, including an initially satisfied condition", () => {
    expect(evaluateQuote({ ...rule, lastMatched: null }, quote, now).action).toBe("baseline");
    expect(evaluateQuote({ ...rule, lastSource: "finnhub" }, quote, now).action).toBe("baseline");
    expect(evaluateQuote({ ...rule, lastObservedAt: new Date(now.getTime() - 901_000) }, quote, now).action).toBe("baseline");
  });

  it("triggers only the strict transition into the condition", () => {
    expect(evaluateQuote(rule, quote, now).action).toBe("trigger");
    expect(evaluateQuote({ ...rule, lastMatched: true }, quote, now).action).toBe("observe");
    expect(evaluateQuote(rule, { ...quote, price: 100 }, now)).toMatchObject({ action: "observe", matched: false });
    expect(evaluateQuote({ ...rule, type: "price_below" }, { ...quote, price: 99 }, now).action).toBe("trigger");
    expect(evaluateQuote({ ...rule, type: "price_below" }, { ...quote, price: 100 }, now)).toMatchObject({ action: "observe", matched: false });
  });

  it("consumes a crossing during cooldown rather than sending it later", () => {
    const recent = { ...rule, lastTriggeredAt: new Date(now.getTime() - 299_999) };
    expect(evaluateQuote(recent, quote, now)).toMatchObject({ action: "observe", matched: true });
    expect(evaluateQuote({ ...recent, lastMatched: true }, quote, new Date(now.getTime() + 10)).action).toBe("observe");
    expect(evaluateQuote({ ...rule, lastTriggeredAt: new Date(now.getTime() - 300_000) }, quote, now).action).toBe("trigger");
  });

  it.each([
    [{ ...quote, price: Number.NaN }, "invalid"],
    [{ ...quote, price: 0 }, "invalid"],
    [{ ...quote, observedAt: "invalid" }, "invalid"],
    [{ ...quote, fetchedAt: "invalid" }, "invalid"],
    [{ ...quote, symbol: "MSFT" }, "symbol"],
    [{ ...quote, currency: "EUR" } as unknown as StockQuote, "currency"],
    [{ ...quote, observedAt: new Date(now.getTime() - 900_001).toISOString() }, "stale"],
    [{ ...quote, observedAt: new Date(now.getTime() + 1).toISOString() }, "future"],
    [{ ...quote, fetchedAt: new Date(now.getTime() + 1).toISOString() }, "future"],
    [{ ...quote, observedAt: rule.lastObservedAt!.toISOString() }, "out_of_order"],
    [{ ...quote, observedAt: new Date(rule.lastObservedAt!.getTime() - 1).toISOString() }, "out_of_order"],
  ])("ignores unsafe or repeated data", (input, reason) => {
    expect(evaluateQuote(rule, input, now)).toEqual({ action: "ignore", reason });
  });
});
