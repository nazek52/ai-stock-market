import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/email/unsubscribe/route";
import { closeDatabase, getDatabase } from "@/server/db";
import { createUnsubscribeToken } from "@/server/digest/unsubscribe";

let replica: MongoMemoryReplSet;
const origin = "http://localhost:3000";
const preference = async (userId = "user-one") => (await getDatabase()).collection("digest_preferences").findOne({ userId });
function form(token: string, accept?: string) {
  return new Request(`${origin}/api/email/unsubscribe`, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(accept ? { accept } : {}) },
    body: new URLSearchParams({ token }),
  });
}
async function accessibleHtml(response: Response, title: string) {
  expect(response.headers.get("content-type")).toContain("text/html");
  const body = await response.text();
  expect(body).toContain('<html lang="ru">');
  expect(body).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  expect(body).toContain('<main aria-labelledby="unsubscribe-title">');
  expect(body).toContain(`<h1 id="unsubscribe-title">${title}</h1>`);
  const nonce = body.match(/<style nonce="([^"]+)">/)?.[1];
  expect(nonce).toBeDefined();
  expect(response.headers.get("content-security-policy")).toContain(`style-src 'nonce-${nonce}'`);
  expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
  expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(body).not.toContain("<script");
  expect(body).not.toContain("example.test");
  return body;
}

describe("P8.3 standalone unsubscribe keyboard and mobile document contract", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "unsubscribe_accessibility");
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-with-at-least-32-characters");
  });
  beforeEach(async () => {
    const collection = (await getDatabase()).collection("digest_preferences");
    await collection.deleteMany({});
    await collection.insertMany([{ userId: "user-one", enabled: true }, { userId: "user-two", enabled: true }]);
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("renders named native controls in a mobile document without mutating consent on GET", async () => {
    const token = createUnsubscribeToken("user-one");
    const response = await GET(new Request(`${origin}/api/email/unsubscribe?token=${token}`, { headers: { accept: "text/html" } }));
    expect(response.status).toBe(200);
    const body = await accessibleHtml(response, "Отключить ежедневную сводку?");
    expect(body).toContain('<form method="post" action="/api/email/unsubscribe">');
    expect(body).toContain('<button type="submit">Отключить ежедневную сводку</button>');
    expect(body).toContain('href="/settings"');
    expect((await preference())?.enabled).toBe(true);
  });

  it("preserves the JSON API for default form clients and repeated opt-out", async () => {
    const token = createUnsubscribeToken("user-one");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(form(token));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ ok: true, data: { unsubscribed: true } });
    }
    expect((await preference())?.enabled).toBe(false);
    expect((await preference("user-two"))?.enabled).toBe(true);
  });

  it("returns a named success page for browser form POST, keeping repeat submission idempotent", async () => {
    const token = createUnsubscribeToken("user-one");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(form(token, "text/html,application/xhtml+xml"));
      expect(response.status).toBe(200);
      await accessibleHtml(response, "Ежедневная сводка отключена");
    }
    expect((await preference())?.enabled).toBe(false);
    expect((await preference("user-two"))?.enabled).toBe(true);
  });

  it("keeps invalid-token status codes and gives browsers a readable error without changing consent", async () => {
    const json = await GET(new Request(`${origin}/api/email/unsubscribe?token=invalid`));
    expect(json.status).toBe(400);
    expect((await json.json()).error.code).toBe("INVALID_INPUT");
    const get = await GET(new Request(`${origin}/api/email/unsubscribe?token=invalid`, { headers: { accept: "text/html" } }));
    expect(get.status).toBe(400);
    await accessibleHtml(get, "Не удалось отключить сводку");
    const post = await POST(form("invalid", "text/html"));
    expect(post.status).toBe(400);
    await accessibleHtml(post, "Не удалось отключить сводку");
    expect((await preference())?.enabled).toBe(true);
  });

  it("does not change bearer API response type when a client also accepts HTML", async () => {
    const token = createUnsubscribeToken("user-one");
    const response = await POST(new Request(`${origin}/api/email/unsubscribe`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, accept: "text/html" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, data: { unsubscribed: true } });
  });
});
