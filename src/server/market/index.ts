import "server-only";
import { z } from "zod";
import { stockSearchQuerySchema, symbolSchema, type StockCompany, type StockNewsItem, type StockQuote, type StockSearchResult } from "@/contracts";
import { getServerEnvironment } from "../config";
import { AppError } from "../errors";
import { acquireMarketPermit } from "../rate-limit";
import { MarketCache } from "./cache";
import { fixtureCompany, fixtureNews, fixtureQuote, searchFixtureCompanies } from "./fixtures";
import { marketInvalid, normalizeCompany, normalizeNews, normalizeQuote } from "./normalization";
import { createFinnhubTransport, type TransportOptions } from "./transport";

export interface MarketClient {
  quote(symbol: string): Promise<StockQuote>;
  company(symbol: string): Promise<StockCompany>;
  search(query: string): Promise<StockSearchResult[]>;
  news(symbol: string): Promise<StockNewsItem[]>;
  marketNews(): Promise<StockNewsItem[]>;
}

export interface MarketClientOptions extends Omit<TransportOptions, "apiKey"> {
  mode: "fixture" | "finnhub";
  apiKey?: string;
  cacheSeconds?: number;
}

const lookupSchema = z.object({ result: z.array(z.unknown()).max(2_000) });
const lookupItemSchema = z.object({ symbol: z.string(), description: z.string().max(500), type: z.string() });

export function createMarketClient(options: MarketClientOptions): MarketClient {
  const now = options.now ?? Date.now;
  if (options.mode === "finnhub" && !options.apiKey?.trim()) throw new AppError("SERVICE_UNAVAILABLE", "Finnhub API key is not configured", 503);
  const request = createFinnhubTransport({ ...options, apiKey: options.apiKey ?? "" });
  const cache = new MarketCache(now);
  const ttl = Math.min(3_600, Math.max(1, options.cacheSeconds ?? 60)) * 1_000;

  const company = async (input: string, listedEquity = false): Promise<StockCompany> => {
    const symbol = symbolSchema.parse(input);
    return cache.read(`company:${symbol}`, 3_600_000, async () => {
      if (options.mode === "fixture") return fixtureCompany(symbol);
      if (!listedEquity) {
        const listing = lookupSchema.safeParse(await request("/search", { q: symbol, exchange: "US" }));
        if (!listing.success) return marketInvalid();
        const equity = listing.data.result.some((raw) => {
          const row = lookupItemSchema.safeParse(raw);
          return row.success && row.data.type === "Common Stock" && row.data.symbol.toUpperCase() === symbol;
        });
        if (!equity) throw new AppError("NOT_FOUND", "Stock is outside the supported US equity market", 404);
      }
      return normalizeCompany(await request("/stock/profile2", { symbol }), symbol);
    });
  };

  return {
    company,
    async quote(input) {
      const symbol = symbolSchema.parse(input);
      return cache.read(`quote:${symbol}`, ttl, async () => {
        if (options.mode === "fixture") return fixtureQuote(symbol, now());
        await company(symbol);
        return normalizeQuote(await request("/quote", { symbol }), symbol, now());
      });
    },
    async search(input) {
      const { q } = stockSearchQuerySchema.parse({ q: input });
      return cache.read(`search:${q.toUpperCase()}`, ttl, async () => {
        if (options.mode === "fixture") return searchFixtureCompanies(q);
        const parsed = lookupSchema.safeParse(await request("/search", { q, exchange: "US" }));
        if (!parsed.success) return marketInvalid();
        const candidates = [...new Set(parsed.data.result.flatMap((raw) => {
          const row = lookupItemSchema.safeParse(raw);
          if (!row.success || row.data.type !== "Common Stock") return [];
          const symbol = symbolSchema.safeParse(row.data.symbol);
          return symbol.success ? [symbol.data] : [];
        }))].slice(0, 5);
        const results: StockSearchResult[] = [];
        for (const symbol of candidates) {
          try {
            const data = await company(symbol, true);
            results.push({ symbol: data.symbol, companyName: data.companyName, exchange: data.exchange, instrumentType: "equity" });
          } catch (error) {
            if (error instanceof AppError && error.code === "NOT_FOUND") continue;
            throw error;
          }
        }
        return results;
      });
    },
    async news(input) {
      const symbol = symbolSchema.parse(input);
      return cache.read(`news:${symbol}`, ttl, async () => {
        if (options.mode === "fixture") return fixtureNews(symbol, now());
        await company(symbol);
        const end = now();
        const from = new Date(end - 7 * 86_400_000).toISOString().slice(0, 10);
        const to = new Date(end).toISOString().slice(0, 10);
        return normalizeNews(await request("/company-news", { symbol, from, to }), symbol, now());
      });
    },
    async marketNews() {
      return cache.read("news:general", ttl, async () => {
        if (options.mode === "fixture") return fixtureNews("AAPL", now());
        return normalizeNews(await request("/news", { category: "general" }), undefined, now());
      });
    },
  };
}

let instance: MarketClient | undefined;
let sharedBudget: TransportOptions["consumeSharedBudget"];

/** Root installs its atomic shared quota consumer once, before serving live requests. */
export function setMarketSharedBudget(consume: NonNullable<TransportOptions["consumeSharedBudget"]>) {
  if (instance) throw new Error("Install the shared market budget before creating the client");
  sharedBudget = consume;
}

export function getMarketClient(): MarketClient {
  if (!instance) {
    const env = getServerEnvironment();
    instance = createMarketClient({
      mode: env.MARKET_DATA_MODE, apiKey: env.FINNHUB_API_KEY, cacheSeconds: env.MARKET_CACHE_SECONDS,
      requestsPerMinute: env.FINNHUB_REQUESTS_PER_MINUTE,
      consumeSharedBudget: sharedBudget ?? (() => acquireMarketPermit(env.FINNHUB_REQUESTS_PER_MINUTE)),
    });
  }
  return instance;
}
