import "server-only";
import { z } from "zod";
import type { StockNewsItem } from "@/contracts";
import { getServerEnvironment } from "@/server/config";
import { AppError } from "@/server/errors";

const articleSchema = z.strictObject({
  id: z.string().min(1).max(200), headline: z.string().min(1).max(500), summary: z.string().max(3000),
  url: z.url({ protocol: /^https?$/ }).max(2048).refine((value) => { const url = new URL(value); return !url.username && !url.password; }),
  source: z.string().min(1).max(100), publishedAt: z.iso.datetime({ offset: true }), relatedSymbols: z.array(z.string()).max(50),
});
export interface NewsBatch { articles: StockNewsItem[]; source: "fixture" | "finnhub" }
export type NewsProvider = (symbols: string[], now: Date) => Promise<NewsBatch>;

export function selectDigestNews(input: unknown[], now: Date): StockNewsItem[] {
  const earliest = now.getTime() - 24 * 60 * 60 * 1000;
  const unique = new Map<string, StockNewsItem>();
  for (const raw of input) {
    const result = articleSchema.safeParse(raw);
    if (!result.success) continue;
    const timestamp = Date.parse(result.data.publishedAt);
    if (timestamp < earliest || timestamp > now.getTime() || unique.has(result.data.id)) continue;
    unique.set(result.data.id, result.data);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 6);
}

/** Dependency injection boundary. Replace with market.getNews in the integration handoff. */
export const defaultNewsProvider: NewsProvider = async (_symbols, now) => {
  if (getServerEnvironment().MARKET_DATA_MODE !== "fixture") throw new AppError("SERVICE_UNAVAILABLE", "Live news provider must be connected", 503);
  return { source: "fixture", articles: [{
    id: "fixture:market-news", headline: "Синтетическая новость для проверки рассылки", summary: "Тестовый источник не описывает реальные компании или события.",
    url: "https://example.com/synthetic-market-news", source: "Fixture", publishedAt: now.toISOString(), relatedSymbols: [],
  }] };
};
