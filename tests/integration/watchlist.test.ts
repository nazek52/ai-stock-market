import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { StockCompany } from "@/contracts";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { GET, POST } from "@/app/api/watchlist/route";
import { DELETE } from "@/app/api/watchlist/[symbol]/route";
import { closeDatabase, getDatabase } from "@/server/db";
import { getMarketClient } from "@/server/market";
import { AppError } from "@/server/errors";
import {
  addWatchlistItem, deleteWatchlistItem, listWatchlistItems, WATCHLIST_LIMIT,
} from "@/server/watchlist/repository";

const origin = "http://localhost:3000";
const password = "Watchlist-test-password-42!";
let replica: MongoMemoryReplSet;
let cookieA = "";
let cookieB = "";
let userA = "";
let userB = "";

function request(path: string, method = "GET", body?: unknown, cookie?: string, requestOrigin = origin) {
  const headers = new Headers({ origin: requestOrigin });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const context = (symbol: string) => ({ params: Promise.resolve({ symbol }) });
function cookies(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

/** Synthetic server DTOs exercise persistence/caps without expanding the public fixture market. */
function company(index: number): StockCompany {
  const symbol = `S${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`;
  return {
    symbol, companyName: `Synthetic persistence company ${index}`, exchange: "SYNTHETIC US MARKET",
    instrumentType: "equity", currency: "USD", industry: null, website: null,
    logoUrl: null, marketCapitalization: null, source: "fixture",
  };
}

async function register(email: string) {
  const response = await authPost(request("/api/auth/sign-up/email", "POST", { email, name: "Watchlist test user", password }));
  expect(response.status).toBe(200);
  return { userId: (await response.json()).user.id as string, cookie: cookies(response) };
}

describe("P5.1/P5.2 MongoDB watchlist ownership, uniqueness and limits", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    process.env.MONGODB_URI = replica.getUri();
    process.env.MONGODB_DATABASE = "watchlist_integration";
    process.env.BETTER_AUTH_URL = origin;
    process.env.BETTER_AUTH_SECRET = "test-only-secret-with-at-least-32-characters";
    process.env.MARKET_DATA_MODE = "fixture";
    const a = await register("watchlist-a@example.test");
    const b = await register("watchlist-b@example.test");
    userA = a.userId; cookieA = a.cookie;
    userB = b.userId; cookieB = b.cookie;
  });

  beforeEach(async () => {
    const db = await getDatabase();
    await Promise.all(["watchlist_items", "watchlist_counters", "request_quotas"].map((name) => db.collection(name).deleteMany({})));
  });

  afterAll(async () => {
    await closeDatabase();
    await replica?.stop();
  });

  it("requires a persisted session for GET, POST and DELETE, including forged cookies", async () => {
    for (const cookie of [undefined, "better-auth.session_token=forged"]) {
      expect((await GET(request("/api/watchlist", "GET", undefined, cookie))).status).toBe(401);
      expect((await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookie))).status).toBe(401);
      expect((await DELETE(request("/api/watchlist/AAPL", "DELETE", undefined, cookie), context("AAPL"))).status).toBe(401);
    }
    expect(await listWatchlistItems(userA)).toEqual([]);
  });

  it("reads and deletes only the session owner's records even with a substituted userId", async () => {
    const added = await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieA));
    expect(added.status).toBe(201);
    const dto = (await added.json()).data;
    expect(dto).not.toHaveProperty("userId");
    const otherList = await GET(request(`/api/watchlist?userId=${userA}`, "GET", undefined, cookieB));
    expect((await otherList.json()).data).toEqual([]);
    const removeOther = await DELETE(request(`/api/watchlist/AAPL?userId=${userA}`, "DELETE", undefined, cookieB), context("AAPL"));
    expect((await removeOther.json()).data).toEqual({ deleted: false });
    expect(await listWatchlistItems(userA)).toHaveLength(1);
    expect((await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieB))).status).toBe(201);
    expect(await listWatchlistItems(userB)).toHaveLength(1);
    await DELETE(request("/api/watchlist/AAPL", "DELETE", undefined, cookieB), context("AAPL"));
    expect(await listWatchlistItems(userB)).toHaveLength(0);
    expect(await listWatchlistItems(userA)).toHaveLength(1);
  });

  it("rejects foreign or absent Origin for mutations", async () => {
    await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieA));
    expect((await POST(request("/api/watchlist", "POST", { symbol: "MSFT" }, cookieA, "https://attacker.test"))).status).toBe(403);
    expect((await DELETE(request("/api/watchlist/AAPL", "DELETE", undefined, cookieA, "https://attacker.test"), context("AAPL"))).status).toBe(403);
    const absent = request("/api/watchlist", "POST", { symbol: "MSFT" }, cookieA);
    absent.headers.delete("origin");
    expect((await POST(absent)).status).toBe(403);
    expect(await listWatchlistItems(userA)).toHaveLength(1);
  });

  it("rejects client ownership/company fields and unknown stocks before persistence", async () => {
    for (const body of [
      { symbol: "AAPL", userId: userB },
      { symbol: "AAPL", companyName: "Spoofed company" },
      { symbol: "AAPL", currency: "USD" },
      { symbol: "../AAPL" },
    ]) expect((await POST(request("/api/watchlist", "POST", body, cookieA))).status).toBe(400);
    const unknown = await POST(request("/api/watchlist", "POST", { symbol: "ZZZZZ" }, cookieA));
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.code).toBe("NOT_FOUND");
    expect(await listWatchlistItems(userA)).toHaveLength(0);
  });

  it("normalizes lowercase input and returns the same persisted item on repeated POST", async () => {
    const first = await POST(request("/api/watchlist", "POST", { symbol: " aapl " }, cookieA));
    expect(first.status).toBe(201);
    const created = (await first.json()).data;
    expect(created).toMatchObject({ symbol: "AAPL", companyName: "Synthetic AAPL Company" });
    expect(created.createdAt).toBeTypeOf("string");
    const repeated = await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieA));
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).data).toEqual(created);
    const loaded = await GET(request("/api/watchlist", "GET", undefined, cookieA));
    expect((await loaded.json()).data).toEqual([created]);
  });

  it("returns an existing item during a provider outage while a new symbol still needs the provider", async () => {
    const first = await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieA));
    expect(first.status).toBe(201);
    const persisted = (await first.json()).data;
    const provider = vi.spyOn(getMarketClient(), "company").mockRejectedValue(
      new AppError("UPSTREAM_UNAVAILABLE", "Market provider is temporarily unavailable", 502),
    );
    try {
      const repeated = await POST(request("/api/watchlist", "POST", { symbol: " aapl " }, cookieA));
      expect(repeated.status).toBe(200);
      expect((await repeated.json()).data).toEqual(persisted);
      expect(provider).not.toHaveBeenCalled();
      const newSymbol = await POST(request("/api/watchlist", "POST", { symbol: "MSFT" }, cookieA));
      expect(newSymbol.status).toBe(502);
      expect((await newSymbol.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(provider).toHaveBeenCalledExactlyOnceWith("MSFT");
      expect(await listWatchlistItems(userA)).toEqual([persisted]);
    } finally {
      provider.mockRestore();
    }
  });

  it("15 simultaneous adds create one row, one counter increment and one created result", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => addWatchlistItem(userA, company(0))));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.item.id)).size).toBe(1);
    expect(await listWatchlistItems(userA)).toHaveLength(1);
    const db = await getDatabase();
    expect(await db.collection("watchlist_items").countDocuments({ userId: userA })).toBe(1);
    expect((await db.collection<{ _id: string; count: number }>("watchlist_counters").findOne({ _id: userA }))?.count).toBe(1);
    const index = (await db.collection("watchlist_items").indexes()).find((entry) => entry.name === "watchlist_owner_symbol_unique");
    expect(index?.unique).toBe(true);
  });

  it("enforces the 50-item cap under concurrent unique adds and frees a slot on deletion", async () => {
    for (let index = 0; index < WATCHLIST_LIMIT - 1; index++) await addWatchlistItem(userA, company(index));
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, (_, index) => addWatchlistItem(userA, company(WATCHLIST_LIMIT - 1 + index))));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    expect(failures).toHaveLength(3);
    for (const failure of failures) if (failure.status === "rejected") expect(failure.reason).toMatchObject({ code: "CONFLICT", status: 409 });
    expect(await listWatchlistItems(userA)).toHaveLength(WATCHLIST_LIMIT);
    expect((await addWatchlistItem(userA, company(0))).created).toBe(false);
    expect(await deleteWatchlistItem(userA, company(0).symbol)).toBe(true);
    expect((await addWatchlistItem(userA, company(100))).created).toBe(true);
    expect(await listWatchlistItems(userA)).toHaveLength(WATCHLIST_LIMIT);
    expect((await addWatchlistItem(userB, company(100))).created).toBe(true);
  });

  it("normalizes deletion and keeps repeated or invalid deletion from corrupting capacity", async () => {
    await POST(request("/api/watchlist", "POST", { symbol: "AAPL" }, cookieA));
    const first = await DELETE(request("/api/watchlist/aapl", "DELETE", undefined, cookieA), context("aapl"));
    expect((await first.json()).data).toEqual({ deleted: true });
    const repeated = await DELETE(request("/api/watchlist/AAPL", "DELETE", undefined, cookieA), context("AAPL"));
    expect((await repeated.json()).data).toEqual({ deleted: false });
    const invalid = await DELETE(request("/api/watchlist/invalid", "DELETE", undefined, cookieA), context("../AAPL"));
    expect(invalid.status).toBe(400);
    const db = await getDatabase();
    expect((await db.collection<{ _id: string; count: number }>("watchlist_counters").findOne({ _id: userA }))?.count).toBe(0);
  });

  it("retains persisted items across logout and a new login", async () => {
    await POST(request("/api/watchlist", "POST", { symbol: "MSFT" }, cookieA));
    expect((await authPost(request("/api/auth/sign-out", "POST", {}, cookieA))).status).toBe(200);
    expect((await GET(request("/api/watchlist", "GET", undefined, cookieA))).status).toBe(401);
    const login = await authPost(request("/api/auth/sign-in/email", "POST", { email: "watchlist-a@example.test", password }));
    expect(login.status).toBe(200);
    cookieA = cookies(login);
    const loaded = (await (await GET(request("/api/watchlist", "GET", undefined, cookieA))).json()).data;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ symbol: "MSFT", companyName: "Synthetic MSFT Company" });
  });
});
