import "server-only";
import { z } from "zod";
import { symbolSchema, type StockCompany, type StockNewsItem, type StockQuote } from "@/contracts";
import { AppError } from "../errors";

const finite = z.number().finite();
const text = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().max(2_000).nullish();
const profileSchema = z.object({
  ticker: text, name: text, currency: text, exchange: text,
  country: optionalText, finnhubIndustry: optionalText, weburl: optionalText, logo: optionalText,
  marketCapitalization: finite.nonnegative().nullish(),
});
const quoteSchema = z.object({
  c: finite.nonnegative(), t: z.number().int().nonnegative(),
  d: finite.nullish(), dp: finite.nullish(), pc: finite.nonnegative().nullish(),
});
const newsSchema = z.object({
  id: z.union([z.number().int().nonnegative(), text]), headline: text,
  summary: z.string().max(20_000).nullish(), url: z.string().max(4_096), source: text,
  datetime: z.number().int().positive(), related: z.string().max(2_000).nullish(),
});

export function marketInvalid(): never {
  throw new AppError("UPSTREAM_UNAVAILABLE", "Market provider returned invalid data", 502);
}

export function safeWebUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeCompany(input: unknown, symbol: string): StockCompany {
  if (input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) throw new AppError("NOT_FOUND", "Stock was not found", 404);
  const result = profileSchema.safeParse(input);
  if (!result.success) return marketInvalid();
  const data = result.data;
  const ticker = symbolSchema.safeParse(data.ticker);
  if (!ticker.success || ticker.data !== symbol) return marketInvalid();
  // Headquarters country is not the listing market: US-listed ADRs may have foreign headquarters.
  if (data.currency !== "USD" || !/^(NASDAQ(?:\/|\b)|NYSE(?:\b|\/)|NEW YORK STOCK EXCHANGE\b|CBOE\b|IEX\b)/i.test(data.exchange)) {
    throw new AppError("NOT_FOUND", "Stock is outside the supported US equity market", 404);
  }
  const capitalization = data.marketCapitalization == null ? null : data.marketCapitalization * 1_000_000;
  if (capitalization !== null && !Number.isFinite(capitalization)) return marketInvalid();
  return {
    symbol, companyName: data.name, exchange: data.exchange, instrumentType: "equity", currency: "USD",
    industry: data.finnhubIndustry || null, website: safeWebUrl(data.weburl), logoUrl: safeWebUrl(data.logo),
    marketCapitalization: capitalization, source: "finnhub",
  };
}

export function normalizeQuote(input: unknown, symbol: string, now: number): StockQuote {
  const result = quoteSchema.safeParse(input);
  if (!result.success) return marketInvalid();
  const data = result.data;
  if (data.c === 0 && data.t === 0) throw new AppError("NOT_FOUND", "A quote is not available for this stock", 404);
  if (data.c <= 0 || data.t <= 0 || data.t * 1_000 > now + 60_000) return marketInvalid();
  const date = new Date(data.t * 1_000);
  if (!Number.isFinite(date.getTime())) return marketInvalid();
  return {
    symbol, currency: "USD", price: data.c, change: data.d ?? null, changePercent: data.dp ?? null,
    previousClose: data.pc && data.pc > 0 ? data.pc : null, observedAt: date.toISOString(),
    fetchedAt: new Date(now).toISOString(), source: "finnhub",
  };
}

export function normalizeNews(input: unknown, symbol: string | undefined, now: number): StockNewsItem[] {
  if (!Array.isArray(input) || input.length > 2_000) return marketInvalid();
  const unique = new Map<string, StockNewsItem>();
  for (const item of input) {
    const result = newsSchema.safeParse(item);
    if (!result.success) continue;
    const data = result.data;
    const url = safeWebUrl(data.url);
    if (!url || data.datetime * 1_000 > now + 60_000) continue;
    const published = new Date(data.datetime * 1_000);
    if (!Number.isFinite(published.getTime())) continue;
    const relatedSymbols = [...new Set((data.related || symbol || "").split(",").flatMap((value) => {
      const parsed = symbolSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }))];
    unique.set(String(data.id), {
      id: String(data.id), headline: data.headline, summary: data.summary ?? "", url,
      source: data.source, publishedAt: published.toISOString(), relatedSymbols,
    });
  }
  return [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 20);
}
