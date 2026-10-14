import "server-only";
import { getServerEnvironment } from "@/server/config";
import { getMarketClient } from "@/server/market";
import { symbolSchema } from "@/contracts";
import { fixtureNews } from "@/server/market/fixtures";
import type { NewsProvider } from "./news";

/** Sequential calls share the same provider budget as interactive requests and alerts. */
export const marketNewsProvider: NewsProvider = async (symbols, now) => {
  const unique = [...new Set(symbols.map((symbol) => symbolSchema.parse(symbol)))].sort();
  if (getServerEnvironment().MARKET_DATA_MODE === "fixture") {
    return { source: "fixture", articles: (unique.length ? unique : ["AAPL"]).flatMap((symbol) => fixtureNews(symbol, now.getTime())) };
  }
  const client = getMarketClient();
  const articles = [];
  if (!unique.length) articles.push(...await client.marketNews());
  else for (const symbol of unique) articles.push(...await client.news(symbol));
  return { source: getServerEnvironment().MARKET_DATA_MODE, articles };
};
