import { afterAll, beforeAll, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { POST as signUp } from "@/app/api/auth/[...all]/route";
import { GET as search } from "@/app/api/stocks/search/route";
import { GET as quote } from "@/app/api/stocks/[symbol]/quote/route";
import { GET as company } from "@/app/api/stocks/[symbol]/company/route";
import { GET as news } from "@/app/api/stocks/[symbol]/news/route";
import { closeDatabase } from "@/server/db";

const origin = "http://localhost:3000";
let mongo: MongoMemoryReplSet;
let cookie: string;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DATABASE = "stock_api_test";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = "test-only-stock-api-secret-with-32-characters";
  process.env.MARKET_DATA_MODE = "fixture";
  const response = await signUp(new Request(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "Test User", email: "stock@example.test", password: "test-only-password-42" }),
  }));
  expect(response.status).toBe(200);
  cookie = response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
});
afterAll(async () => { await closeDatabase(); await mongo?.stop(); });
const request = (path: string, authenticated = true) => new Request(`${origin}${path}`, { headers: authenticated ? { cookie } : {} });
const context = (symbol: string) => ({ params: Promise.resolve({ symbol }) });

it("protects market endpoints with a persisted session", async () => {
  expect((await search(request("/api/stocks/search?q=AAPL", false))).status).toBe(401);
  expect((await quote(request("/api/stocks/AAPL/quote", false), context("AAPL"))).status).toBe(401);
});

it("returns validated synthetic quotes, profiles, news and search results", async () => {
  const found = await search(request("/api/stocks/search?q=synthetic%20aapl"));
  expect(found.headers.get("X-Market-Data-Mode")).toBe("fixture");
  expect((await found.json()).data[0].symbol).toBe("AAPL");
  const result = await quote(request("/api/stocks/aapl/quote"), context("aapl"));
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect((await result.json()).data).toMatchObject({ symbol: "AAPL", source: "fixture", currency: "USD" });
  const profile = await company(request("/api/stocks/AAPL/company"), context("AAPL"));
  expect((await profile.json()).data).toMatchObject({ symbol: "AAPL", source: "fixture" });
  const articles = await news(request("/api/stocks/AAPL/news"), context("AAPL"));
  expect((await articles.json()).data.length).toBeGreaterThan(0);
});

it("distinguishes invalid input from an unknown symbol without upstream calls", async () => {
  expect((await search(request("/api/stocks/search?q="))).status).toBe(400);
  expect((await quote(request("/api/stocks/unknown/quote"), context("UNKNOWN"))).status).toBe(400);
  expect((await quote(request("/api/stocks/ZZZZ/quote"), context("ZZZZ"))).status).toBe(404);
});
