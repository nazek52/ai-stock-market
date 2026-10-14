import { describe, expect, it, vi } from "vitest";
import { createMarketClient } from "@/server/market";
import { normalizeCompany, normalizeNews } from "@/server/market/normalization";

const instant = Date.parse("2026-10-14T12:00:00Z");

describe("P4.2 normalized US equity contract", () => {
  it("enriches at most five companies and consumes at most six cold search requests", async () => {
    const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "GOOG"];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) return Response.json({ result: symbols.map((symbol) => ({ symbol, description: `Test ${symbol}`, type: "Common Stock" })) });
      return Response.json({ ticker: url.searchParams.get("symbol"), name: "Example", currency: "USD", exchange: "NASDAQ" });
    });
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => instant });
    const results = await client.search("test");
    expect(results).toHaveLength(5);
    expect(results.every((item) => item.exchange === "NASDAQ" && item.instrumentType === "equity")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(6);
    await client.search("TEST");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("preserves stock class punctuation and never merges distinct symbols", async () => {
    const client = createMarketClient({ mode: "fixture", now: () => instant });
    expect((await client.company(" brk.b ")).symbol).toBe("BRK.B");
    await expect(client.company("BRK-B")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects query whitespace and large query strings before network activity", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher });
    await expect(client.search(" ")).rejects.toThrow();
    await expect(client.search("x".repeat(81))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose unsafe company URLs or confuse headquarters with listing market", () => {
    const result = normalizeCompany({ ticker: "AAPL", name: "Example", country: "GB", currency: "USD", exchange: "NYSE", weburl: "https://user:secret@example.com", logo: "javascript:bad" }, "AAPL");
    expect(result).toMatchObject({ exchange: "NYSE", currency: "USD", website: null, logoUrl: null, marketCapitalization: null });
  });

  it("drops malformed individual news records and rejects a malformed response envelope", () => {
    expect(normalizeNews([{ id: 1, datetime: 0, headline: "Bad date" }], "AAPL", instant)).toEqual([]);
    expect(() => normalizeNews({ error: "provider private details" }, "AAPL", instant)).toThrow("invalid data");
  });

  it("does not misreport a malformed company array as a missing instrument", () => {
    expect(() => normalizeCompany([], "AAPL")).toThrow("invalid data");
    expect(() => normalizeCompany({}, "AAPL")).toThrow("not found");
  });
});
