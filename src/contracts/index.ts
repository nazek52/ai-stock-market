import { z } from "zod";

/** Browser-safe contracts. All resource ownership is resolved from the server session. */
export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/, "Use a US equity ticker such as AAPL or BRK.B");

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const timezoneSchema = z.string().min(1).max(100).regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Use a supported IANA time zone");
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (00:00–23:59)");
export const investmentGoalSchema = z.enum(["capital_preservation", "income", "growth"]);
export const riskToleranceSchema = z.enum(["conservative", "moderate", "aggressive"]);
export const sectorSchema = z.enum([
  "technology", "healthcare", "financials", "consumer_discretionary", "consumer_staples",
  "industrials", "energy", "materials", "utilities", "real_estate", "communication_services",
]);

export const profileUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "Use an ISO 3166-1 alpha-2 country code"),
  investmentGoal: investmentGoalSchema,
  riskTolerance: riskToleranceSchema,
  preferredSector: sectorSchema.nullable().optional(),
  timezone: timezoneSchema,
}).partial().refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one profile field");

export const digestPreferenceUpdateSchema = z.strictObject({
  enabled: z.boolean(),
  timezone: timezoneSchema,
  localTime: localTimeSchema,
});

export const watchlistAddSchema = z.strictObject({ symbol: symbolSchema });
export const stockSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(80),
});
export const priceAlertTypeSchema = z.enum(["price_above", "price_below"]);
const thresholdSchema = z.number().finite().positive().max(1_000_000);
const cooldownMinutesSchema = z.number().int().min(5).max(10_080);
export const priceAlertCreateSchema = z.strictObject({
  symbol: symbolSchema,
  type: priceAlertTypeSchema,
  threshold: thresholdSchema,
  currency: z.literal("USD"),
  cooldownMinutes: cooldownMinutesSchema.default(60),
});
export const priceAlertUpdateSchema = z.strictObject({
  type: priceAlertTypeSchema.optional(),
  threshold: thresholdSchema.optional(),
  status: z.enum(["active", "paused"]).optional(),
  cooldownMinutes: cooldownMinutesSchema.optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one rule field");

export type Symbol = z.infer<typeof symbolSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type DigestPreferenceUpdate = z.infer<typeof digestPreferenceUpdateSchema>;
export type WatchlistAdd = z.infer<typeof watchlistAddSchema>;
export type PriceAlertCreate = z.infer<typeof priceAlertCreateSchema>;
export type PriceAlertUpdate = z.infer<typeof priceAlertUpdateSchema>;

export interface Profile {
  name: string | null;
  countryCode: string | null;
  investmentGoal: z.infer<typeof investmentGoalSchema> | null;
  riskTolerance: z.infer<typeof riskToleranceSchema> | null;
  preferredSector: z.infer<typeof sectorSchema> | null;
  timezone: string;
  updatedAt: string;
}

export interface DigestPreference extends DigestPreferenceUpdate {
  frequency: "daily";
  lastSentAt: string | null;
}

export interface WatchlistItem {
  id: string;
  symbol: Symbol;
  companyName: string;
  createdAt: string;
}

export interface PriceAlertRule extends PriceAlertCreate {
  id: string;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
}

/** Null means unavailable, never an invented zero. observedAt is provider time. */
export interface StockQuote {
  symbol: Symbol;
  currency: "USD";
  price: number;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  observedAt: string;
  fetchedAt: string;
  source: "finnhub" | "fixture";
}

export interface StockSearchResult {
  symbol: Symbol;
  companyName: string;
  exchange: string | null;
  instrumentType: "equity";
}

export interface StockNewsItem {
  id: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  relatedSymbols: Symbol[];
}

export type ApiError =
  | { code: "INVALID_INPUT"; message: string; fields?: Record<string, string[]> }
  | { code: "UNAUTHENTICATED"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "NOT_FOUND"; message: string }
  | { code: "CONFLICT"; message: string }
  | { code: "RATE_LIMITED"; message: string; retryAfterSeconds?: number }
  | { code: "UPSTREAM_UNAVAILABLE"; message: string }
  | { code: "SERVICE_UNAVAILABLE"; message: string }
  | { code: "INTERNAL_ERROR"; message: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
