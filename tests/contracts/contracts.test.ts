import { describe, expect, it } from "vitest";
import {
  digestPreferenceUpdateSchema, isoDateTimeSchema, localTimeSchema, priceAlertCreateSchema,
  priceAlertUpdateSchema, profileUpdateSchema, stockSearchQuerySchema, symbolSchema,
  timezoneSchema, watchlistAddSchema,
} from "../../src/contracts";

describe("US equity symbol boundary", () => {
  it.each([[" aapl ", "AAPL"], ["brk.b", "BRK.B"], ["brk-b", "BRK-B"]])("normalizes %s", (input, output) => {
    expect(symbolSchema.parse(input)).toBe(output);
  });
  it.each(["", "NASDAQ:AAPL", "../AAPL", "AAPL/USD", "TOOLONG", "AAPL?token=x", "АAPL", "1AAPL"]) (
    "rejects unsupported symbol %s", (value) => expect(symbolSchema.safeParse(value).success).toBe(false),
  );
  it("does not accept client-supplied ownership", () => {
    expect(watchlistAddSchema.safeParse({ symbol: "AAPL", userId: "someone-else" }).success).toBe(false);
  });
});

describe("profile and digest preferences", () => {
  it("accepts partial onboarding and an explicit cleared sector", () => {
    expect(profileUpdateSchema.parse({ name: " Example ", preferredSector: null })).toEqual({ name: "Example", preferredSector: null });
  });
  it.each([{}, { name: " " }, { countryCode: "USA" }, { riskTolerance: "unlimited" }, { userId: "other" }])(
    "rejects invalid or overposted profiles %j", (value) => expect(profileUpdateSchema.safeParse(value).success).toBe(false),
  );
  it.each(["Asia/Qyzylorda", "America/New_York", "UTC"])("accepts supported timezone %s", (value) => {
    expect(timezoneSchema.safeParse(value).success).toBe(true);
  });
  it.each(["Mars/Olympus", "+05:00", "", " UTC "])("rejects invalid timezone %s", (value) => {
    expect(timezoneSchema.safeParse(value).success).toBe(false);
  });
  it.each(["0:00", "24:00", "09:60", "09:30:00"])("rejects ambiguous local time %s", (value) => {
    expect(localTimeSchema.safeParse(value).success).toBe(false);
  });
  it("saves consent and a local delivery time together", () => {
    expect(digestPreferenceUpdateSchema.parse({ enabled: false, timezone: "Asia/Qyzylorda", localTime: "00:00" }).enabled).toBe(false);
    expect(digestPreferenceUpdateSchema.safeParse({ enabled: "true", timezone: "UTC", localTime: "09:00" }).success).toBe(false);
  });
});

describe("price alert boundaries", () => {
  const valid = { symbol: "aapl", type: "price_above", threshold: 200, currency: "USD" };
  it("normalizes the ticker and sets a bounded default cooldown", () => {
    expect(priceAlertCreateSchema.parse(valid)).toMatchObject({ symbol: "AAPL", cooldownMinutes: 60 });
  });
  it.each([
    { threshold: 0 }, { threshold: -1 }, { threshold: Number.NaN }, { threshold: Infinity },
    { threshold: 1_000_001 }, { threshold: "200" }, { cooldownMinutes: 0 }, { cooldownMinutes: 10_081 },
    { cooldownMinutes: 5.5 }, { type: "volume_above" }, { currency: "EUR" }, { userId: "other" },
  ])("rejects invalid rule overrides %j", (override) => {
    expect(priceAlertCreateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
  it("allows pausing, rejects empty updates and immutable field changes", () => {
    expect(priceAlertUpdateSchema.parse({ status: "paused" })).toEqual({ status: "paused" });
    expect(priceAlertUpdateSchema.safeParse({}).success).toBe(false);
    expect(priceAlertUpdateSchema.safeParse({ symbol: "MSFT" }).success).toBe(false);
    expect(priceAlertUpdateSchema.safeParse({ lastTriggeredAt: null }).success).toBe(false);
  });
});

describe("transport values", () => {
  it("requires dated ISO timestamps with timezone offsets", () => {
    expect(isoDateTimeSchema.safeParse("2026-10-14T12:00:00Z").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-14T17:00:00+05:00").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-14T12:00:00").success).toBe(false);
  });
  it("limits search input before calling a provider", () => {
    expect(stockSearchQuerySchema.parse({ q: " Apple " })).toEqual({ q: "Apple" });
    expect(stockSearchQuerySchema.safeParse({ q: " " }).success).toBe(false);
    expect(stockSearchQuerySchema.safeParse({ q: "x".repeat(81) }).success).toBe(false);
  });
});
