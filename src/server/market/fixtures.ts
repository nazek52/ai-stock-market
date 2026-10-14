import "server-only";
import type { StockCompany, StockNewsItem, StockQuote } from "@/contracts";
import { AppError } from "../errors";

const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "BRK.B", "KO"];
export function fixtureCompanies(): StockCompany[] {
  return symbols.map((symbol) => ({
    symbol, companyName: `Synthetic ${symbol} Company`, currency: "USD", exchange: "SYNTHETIC US MARKET",
    instrumentType: "equity", industry: null, website: null, logoUrl: null, marketCapitalization: null, source: "fixture",
  }));
}

export function fixtureCompany(symbol: string): StockCompany {
  const company = fixtureCompanies().find((item) => item.symbol === symbol);
  if (!company) throw new AppError("NOT_FOUND", "Stock was not found in the synthetic dataset", 404);
  return company;
}

export function fixtureQuote(symbol: string, now: number): StockQuote {
  fixtureCompany(symbol);
  const previousClose = 99 + symbols.indexOf(symbol) * 10;
  return {
    symbol, currency: "USD", price: previousClose + 1, change: 1, changePercent: 100 / previousClose,
    previousClose,
    observedAt: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString(), source: "fixture",
  };
}

export function fixtureNews(symbol: string, now: number): StockNewsItem[] {
  fixtureCompany(symbol);
  return [{
    id: `fixture-${symbol}`, headline: `Synthetic ${symbol} test headline`,
    summary: "Synthetic test data. This item does not describe a real market event.",
    url: `https://example.com/fixture/${symbol}`, source: "fixture", publishedAt: new Date(now).toISOString(), relatedSymbols: [symbol],
  }];
}
