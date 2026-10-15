import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketClient } from "@/server/market";
import { createFinnhubTransport } from "@/server/market/transport";
import { AppError } from "@/server/errors";

const instant = Date.parse("2026-10-14T12:00:00Z");
const company = { ticker: "AAPL", name: "Example Corporation", currency: "USD", exchange: "NASDAQ/NMS (GLOBAL MARKET)", marketCapitalization: 123 };
const lookup = { result: [{ symbol: "AAPL", description: "Example Corporation", type: "Common Stock" }] };
const quote = { c: 101, t: instant / 1_000 - 30, d: 1, dp: 1, pc: 100 };

function stubFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const body = overrides[url.pathname] ?? ({
      "/api/v1/search": lookup,
      "/api/v1/stock/profile2": company,
      "/api/v1/quote": quote,
      "/api/v1/company-news": [],
    } as Record<string, unknown>)[url.pathname];
    return Response.json(body);
  });
}
afterEach(() => vi.useRealTimers());

describe("market client", () => {
  it("normalizes US company and quote without sending its token in a URL", async () => {
    const fetcher = stubFetch();
    const client = createMarketClient({ mode: "finnhub", apiKey: "test-only-token", fetch: fetcher, now: () => instant });
    expect(await client.quote(" aapl ")).toMatchObject({
      symbol: "AAPL", price: 101, currency: "USD", source: "finnhub",
      observedAt: "2026-10-14T11:59:30.000Z", fetchedAt: "2026-10-14T12:00:00.000Z",
    });
    expect((await client.company("AAPL")).marketCapitalization).toBe(123_000_000);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/finnhub.io\/api\/v1\//);
      expect(String(url)).not.toContain("test-only-token");
      expect(init?.headers).toMatchObject({ "X-Finnhub-Token": "test-only-token" });
      expect(init?.redirect).toBe("error");
    }
  });

  it("coalesces concurrent requests, copies results and expires quote cache", async () => {
    let now = instant;
    const fetcher = stubFetch();
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => now });
    const [first, second] = await Promise.all([client.quote("AAPL"), client.quote("aapl")]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    first.price = 9;
    expect(second.price).toBe(101);
    expect((await client.quote("AAPL")).price).toBe(101);
    now += 60_001;
    await client.quote("AAPL");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not fabricate absent indicators", async () => {
    const fetcher = stubFetch({ "/api/v1/quote": { c: 100, t: instant / 1_000 } });
    const result = await createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => instant }).quote("AAPL");
    expect(result).toMatchObject({ change: null, changePercent: null, previousClose: null });
  });

  it.each([{ c: 100, t: 0 }, { c: 100 }, { c: 100, t: instant / 1_000 + 120 }, { c: "100", t: instant / 1_000 }])(
    "rejects invalid quotes without replacing the provider timestamp %j", async (value) => {
      const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: stubFetch({ "/api/v1/quote": value }), now: () => instant });
      await expect(client.quote("AAPL")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    },
  );

  it("returns typed 404 for unavailable symbols and zero/zero quotes", async () => {
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: stubFetch({ "/api/v1/stock/profile2": {} }), now: () => instant });
    await expect(client.quote("AAPL")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    const noQuote = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: stubFetch({ "/api/v1/quote": { c: 0, t: 0 } }), now: () => instant });
    await expect(noQuote.quote("AAPL")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([{ currency: "EUR" }, { exchange: "LONDON" }, { ticker: "MSFT" }])("validates the quoted instrument %j", async (override) => {
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: stubFetch({ "/api/v1/stock/profile2": { ...company, ...override } }), now: () => instant });
    await expect(client.quote("AAPL")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects invalid symbols before any provider request", async () => {
    const fetcher = stubFetch();
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher });
    await expect(client.quote("../secret")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("filters search results to verified US common stocks and listing exchange", async () => {
    const fetcher = stubFetch({ "/api/v1/search": { result: [
      ...lookup.result, ...lookup.result,
      { symbol: "BTC", description: "Coin", type: "Crypto" },
      { symbol: "FOREIGN.L", description: "Foreign", type: "Common Stock" },
      { symbol: "SPY", description: "ETF", type: "ETP" },
    ] } });
    const result = await createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => instant }).search("example");
    expect(result).toEqual([{ symbol: "AAPL", companyName: company.name, exchange: company.exchange, instrumentType: "equity" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not treat ETF lookup data as an equity company", async () => {
    const fetcher = stubFetch({ "/api/v1/search": { result: [{ symbol: "AAPL", description: "ETF", type: "ETP" }] } });
    await expect(createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher }).company("AAPL")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("drops unsafe news links, invalid dates and duplicate items", async () => {
    const news = { id: 1, headline: "Synthetic news", summary: "Text", source: "Test", datetime: instant / 1_000 - 60, related: "AAPL,MSFT,../bad", url: "https://example.com/news" };
    const fetcher = stubFetch({ "/api/v1/company-news": [news, news, { ...news, id: 2, url: "javascript:alert(1)" }, { ...news, id: 3, datetime: 99_999_999_999_999 }] });
    const result = await createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => instant }).news("AAPL");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", relatedSymbols: ["AAPL", "MSFT"], publishedAt: "2026-10-14T11:59:00.000Z" });
    const url = new URL(String(fetcher.mock.calls.at(-1)?.[0]));
    expect(url.searchParams.get("from")).toBe("2026-10-07");
    expect(url.searchParams.get("to")).toBe("2026-10-14");
  });

  it("uses explicit synthetic fixtures without any network calls", async () => {
    const fetcher = stubFetch();
    const client = createMarketClient({ mode: "fixture", fetch: fetcher, now: () => instant });
    expect((await client.quote("AAPL")).source).toBe("fixture");
    expect((await client.news("AAPL"))[0]!.source).toBe("fixture");
    await expect(client.quote("ZZZZZ")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => createMarketClient({ mode: "finnhub" })).toThrow("not configured");
  });

  it.each([
    ["Apple", "AAPL"], ["Microsoft", "MSFT"], ["Nvidia", "NVDA"], ["Amazon", "AMZN"],
    ["Tesla", "TSLA"], ["Berkshire", "BRK.B"], ["Coca-Cola", "KO"], ["Coca Cola", "KO"],
    [" aapl ", "AAPL"], ["msft", "MSFT"], ["NVDA", "NVDA"], ["AMZN", "AMZN"],
    ["tsla", "TSLA"], ["brk.b", "BRK.B"], ["KO", "KO"],
  ])("finds fixture %s by company alias or symbol without claiming live data", async (query, symbol) => {
    const fetcher = stubFetch();
    const client = createMarketClient({ mode: "fixture", fetch: fetcher, now: () => instant });
    const results = await client.search(query);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol, companyName: `Synthetic ${symbol} Company`, source: "fixture" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads and caches general market news without inventing related tickers", async () => {
    const fetcher = stubFetch({ "/api/v1/news": [{ id: 10, headline: "General market test", source: "Test", datetime: instant / 1_000, url: "https://example.com/general" }] });
    const client = createMarketClient({ mode: "finnhub", apiKey: "test", fetch: fetcher, now: () => instant });
    expect((await client.marketNews())[0]!.relatedSymbols).toEqual([]);
    await client.marketNews();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v1/news");
    expect(url.searchParams.get("category")).toBe("general");
  });
});

describe("Finnhub transport", () => {
  it("serializes requests and releases every shared permit", async () => {
    let active = 0;
    let maximum = 0;
    const releases = vi.fn(async () => {});
    const budget = vi.fn(async () => releases);
    const fetcher = vi.fn<typeof fetch>(async () => {
      active++; maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return Response.json({});
    });
    const transport = createFinnhubTransport({ apiKey: "test", fetch: fetcher, consumeSharedBudget: budget });
    await Promise.all([transport("/quote", { symbol: "AAPL" }), transport("/quote", { symbol: "MSFT" })]);
    expect(maximum).toBe(1);
    expect(budget).toHaveBeenCalledTimes(2);
    expect(releases).toHaveBeenCalledTimes(2);
  });

  it("enforces the local minute budget and resets after its window", async () => {
    let now = instant;
    const transport = createFinnhubTransport({ apiKey: "test", fetch: stubFetch(), requestsPerMinute: 1, now: () => now });
    await transport("/quote", { symbol: "AAPL" });
    await expect(transport("/quote", { symbol: "MSFT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 60 });
    now += 60_000;
    await expect(transport("/quote", { symbol: "MSFT" })).resolves.toMatchObject({ c: 101 });
  });

  it("honors shared quota rejection before calling fetch", async () => {
    const fetcher = stubFetch();
    const transport = createFinnhubTransport({ apiKey: "test", fetch: fetcher, consumeSharedBudget: async () => { throw new AppError("RATE_LIMITED", "Shared quota exhausted", 429, 30); } });
    await expect(transport("/quote", { symbol: "AAPL" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates bounded provider retry and blocks immediate new requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("private upstream details", { status: 429, headers: { "retry-after": "120" } }));
    const transport = createFinnhubTransport({ apiKey: "test", fetch: fetcher, now: () => instant });
    await expect(transport("/quote", { symbol: "AAPL" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 120 });
    await expect(transport("/quote", { symbol: "MSFT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 120 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels timed-out fetches and releases the shared permit", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const release = vi.fn(async () => {});
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { signal = init?.signal; return new Promise<Response>(() => {}); });
    const transport = createFinnhubTransport({ apiKey: "test", fetch: fetcher, consumeSharedBudget: async () => release });
    const assertion = expect(transport("/quote", { symbol: "AAPL" })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500, 503])("sanitizes upstream status %s without fallback or body leakage", async (status) => {
    const transport = createFinnhubTransport({ apiKey: "test", fetch: async () => new Response("secret-provider-token", { status }) });
    await expect(transport("/quote", { symbol: "AAPL" })).rejects.not.toThrow("secret-provider-token");
  });

  it("rejects malformed JSON and oversized responses", async () => {
    const malformed = createFinnhubTransport({ apiKey: "test", fetch: async () => new Response("not-json") });
    await expect(malformed("/quote", { symbol: "AAPL" })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    const oversized = createFinnhubTransport({ apiKey: "test", fetch: async () => new Response("x".repeat(1_048_577)) });
    await expect(oversized("/quote", { symbol: "AAPL" })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});
