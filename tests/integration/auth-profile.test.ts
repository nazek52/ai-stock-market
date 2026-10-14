import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/profile/route";
import { GET as preferenceGet, PUT as preferencePut } from "@/app/api/preferences/digest/route";
import { closeDatabase, getDatabase } from "@/server/db";

const origin = "http://localhost:3000";
const password = "Test-account-password-42!";
let replica: MongoMemoryReplSet;
let firstCookie = "";
let secondCookie = "";
let firstUserId = "";

function request(path: string, method = "GET", body?: unknown, cookie?: string, requestOrigin = origin) {
  const headers = new Headers({ origin: requestOrigin });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function responseCookie(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

async function register(email: string, name: string) {
  const response = await authPost(request("/api/auth/sign-up/email", "POST", { email, name, password }));
  expect(response.status).toBe(200);
  return { body: await response.json(), cookie: responseCookie(response) };
}

describe("P2.1/P2.3 real MongoDB auth, ownership and preferences", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: { version: "8.0.16" },
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    process.env.MONGODB_URI = replica.getUri();
    process.env.MONGODB_DATABASE = "auth_profile_integration";
    process.env.BETTER_AUTH_URL = origin;
    process.env.BETTER_AUTH_SECRET = "test-only-secret-with-at-least-32-characters";
    const first = await register("first@example.test", "First Test User");
    firstCookie = first.cookie;
    firstUserId = first.body.user.id;
    const second = await register("second@example.test", "Second Test User");
    secondCookie = second.cookie;
  });

  afterAll(async () => {
    await closeDatabase();
    await replica?.stop();
  });

  it("registers with HttpOnly cookie, hashes password and persists server session", async () => {
    expect(firstCookie).toContain("session_token=");
    const sessionResponse = await authGet(request("/api/auth/get-session", "GET", undefined, firstCookie));
    expect(sessionResponse.status).toBe(200);
    expect((await sessionResponse.json()).user.id).toBe(firstUserId);
    const db = await getDatabase();
    const account = await db.collection("account").findOne({ providerId: "credential" });
    expect(account?.password).toBeTypeOf("string");
    expect(account?.password).not.toBe(password);
    const sessionIndex = await db.collection("session").indexes();
    expect(sessionIndex.find((index) => index.name === "session_token_unique")?.unique).toBe(true);
    const login = await authPost(request("/api/auth/sign-in/email", "POST", { email: "first@example.test", password }));
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toMatch(/httponly/i);
  });

  it("rejects duplicate emails, incorrect passwords and short passwords", async () => {
    const duplicate = await authPost(request("/api/auth/sign-up/email", "POST", {
      email: "first@example.test", name: "Duplicate User", password,
    }));
    expect(duplicate.status).toBeGreaterThanOrEqual(400);
    const badLogin = await authPost(request("/api/auth/sign-in/email", "POST", {
      email: "first@example.test", password: "incorrect-password",
    }));
    expect(badLogin.status).toBe(401);
    const weak = await authPost(request("/api/auth/sign-up/email", "POST", {
      email: "weak@example.test", name: "Weak User", password: "short",
    }));
    expect(weak.status).toBe(400);
  });

  it("requires a validated session and never accepts a forged cookie", async () => {
    expect((await profileGet(request("/api/profile"))).status).toBe(401);
    expect((await profileGet(request("/api/profile", "GET", undefined, "better-auth.session_token=forged"))).status).toBe(401);
    expect((await preferenceGet(request("/api/preferences/digest"))).status).toBe(401);
  });

  it("keeps onboarding absent and digest consent disabled by default", async () => {
    const profile = await (await profileGet(request("/api/profile", "GET", undefined, firstCookie))).json();
    expect(profile).toMatchObject({ ok: true, data: { name: null, countryCode: null, timezone: "UTC" } });
    expect(profile.data).not.toHaveProperty("userId");
    const preference = await (await preferenceGet(request("/api/preferences/digest", "GET", undefined, firstCookie))).json();
    expect(preference.data).toEqual({ enabled: false, frequency: "daily", timezone: "UTC", localTime: "09:00", lastSentAt: null });
  });

  it("creates only one default record during concurrent first access", async () => {
    const profiles = await Promise.all(Array.from({ length: 20 }, () => profileGet(request("/api/profile", "GET", undefined, secondCookie))));
    const preferences = await Promise.all(Array.from({ length: 20 }, () => preferenceGet(request("/api/preferences/digest", "GET", undefined, secondCookie))));
    expect(profiles.every((response) => response.status === 200)).toBe(true);
    expect(preferences.every((response) => response.status === 200)).toBe(true);
    const db = await getDatabase();
    expect(await db.collection("profiles").countDocuments()).toBe(2);
    expect(await db.collection("digest_preferences").countDocuments()).toBe(2);
  });

  it("persists validated profile and preferences, isolates users and rejects owner substitution", async () => {
    const patch = await profilePatch(request("/api/profile", "PATCH", {
      name: "Updated First", countryCode: "KZ", investmentGoal: "growth", riskTolerance: "moderate", timezone: "Asia/Qyzylorda",
    }, firstCookie));
    expect(patch.status).toBe(200);
    const reloaded = await (await profileGet(request("/api/profile", "GET", undefined, firstCookie))).json();
    expect(reloaded.data).toMatchObject({ name: "Updated First", countryCode: "KZ", timezone: "Asia/Qyzylorda" });
    const other = await (await profileGet(request(`/api/profile?userId=${firstUserId}`, "GET", undefined, secondCookie))).json();
    expect(other.data.name).toBeNull();
    expect((await profilePatch(request("/api/profile", "PATCH", { userId: firstUserId, name: "Intruder" }, secondCookie))).status).toBe(400);
    const updatedPreferences = await preferencePut(request("/api/preferences/digest", "PUT", {
      enabled: true, timezone: "Asia/Qyzylorda", localTime: "08:30",
    }, firstCookie));
    expect(updatedPreferences.status).toBe(200);
    const ownPreferences = await (await preferenceGet(request("/api/preferences/digest", "GET", undefined, firstCookie))).json();
    expect(ownPreferences.data).toMatchObject({ enabled: true, localTime: "08:30" });
    const otherPreferences = await (await preferenceGet(request("/api/preferences/digest", "GET", undefined, secondCookie))).json();
    expect(otherPreferences.data.enabled).toBe(false);
    expect((await (await getDatabase()).collection("digest_preferences").findOne({ userId: firstUserId }))?.consentUpdatedAt).toBeInstanceOf(Date);
  });

  it("rejects CSRF and invalid profile/preferences requests", async () => {
    expect((await profilePatch(request("/api/profile", "PATCH", { name: "CSRF" }, firstCookie, "https://attacker.test"))).status).toBe(403);
    expect((await preferencePut(request("/api/preferences/digest", "PUT", { enabled: true, timezone: "UTC", localTime: "09:00" }, firstCookie, "https://attacker.test"))).status).toBe(403);
    expect((await profilePatch(request("/api/profile", "PATCH", {}, firstCookie))).status).toBe(400);
    expect((await profilePatch(request("/api/profile", "PATCH", { timezone: "Invalid/Zone" }, firstCookie))).status).toBe(400);
    expect((await preferencePut(request("/api/preferences/digest", "PUT", { enabled: true, timezone: "UTC", localTime: "25:00" }, firstCookie))).status).toBe(400);
    const csrfAuth = await authPost(request("/api/auth/sign-in/email", "POST", { email: "first@example.test", password }, undefined, "https://attacker.test"));
    expect(csrfAuth.status).toBe(403);
    const missingOrigin = request("/api/profile", "PATCH", { name: "Missing origin" }, firstCookie);
    missingOrigin.headers.delete("origin");
    expect((await profilePatch(missingOrigin)).status).toBe(403);
  });

  it("logout revokes the server session and expired sessions are rejected", async () => {
    const signedOut = await authPost(request("/api/auth/sign-out", "POST", {}, firstCookie));
    expect(signedOut.status).toBe(200);
    expect((await profileGet(request("/api/profile", "GET", undefined, firstCookie))).status).toBe(401);
    const db = await getDatabase();
    await db.collection("session").updateMany({}, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await profileGet(request("/api/profile", "GET", undefined, secondCookie))).status).toBe(401);
  });
});
