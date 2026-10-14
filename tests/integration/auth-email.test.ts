import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId } from "mongodb";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { GET as profileGet } from "@/app/api/profile/route";
import { closeDatabase, getDatabase } from "@/server/db";

interface CapturedMail { to: string; subject: string; html: string; text: string }
const { captured, smtpSend } = vi.hoisted(() => {
  const captured: CapturedMail[] = [];
  return {
    captured,
    smtpSend: vi.fn(async (message: CapturedMail) => {
      captured.push(message);
      return { accepted: [message.to], rejected: [] };
    }),
  };
});

// Keep the production sender and MongoDB journal real; replace only the external SMTP boundary.
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: smtpSend }) } }));

const origin = "http://localhost:3000";
const email = "auth-email@example.test";
const oldPassword = "Old-test-password-42!";
const newPassword = "New-test-password-84!";
let replica: MongoMemoryReplSet;
let userId = "";
let originalCookie = "";
let verificationLink: URL;
let resetLink: URL;

function request(path: string, method = "GET", body?: unknown, cookie?: string) {
  const headers = new Headers({ origin });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function mailLink(message: CapturedMail): URL {
  const match = message.text.match(/https?:\/\/[^\s]+/);
  if (!match?.[0]) throw new Error("Authentication email did not contain a link");
  return new URL(match[0]);
}

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

describe("P2/P6 actual verification and password recovery with captured SMTP", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "auth_email_integration");
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-with-at-least-32-characters");
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", "1025");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("MARKET_DATA_MODE", "fixture");
    vi.stubEnv("INNGEST_EVENT_KEY", "");
  });

  afterAll(async () => {
    await closeDatabase();
    await replica?.stop();
    vi.unstubAllEnvs();
  });

  it("sends signup verification before the user transaction commits, with a one-hour token", async () => {
    const response = await authPost(request("/api/auth/sign-up/email", "POST", { email, name: "Email test user", password: oldPassword }));
    expect(response.status).toBe(200);
    userId = (await response.json()).user.id;
    originalCookie = cookie(response);
    expect(captured.length).toBe(1);
    const message = captured[0]!;
    expect(message.to).toBe(email);
    expect(message.subject).toBe("Подтверждение адреса");
    verificationLink = mailLink(message);
    expect(verificationLink.origin === origin).toBe(true);
    expect(verificationLink.pathname).toBe("/api/auth/verify-email");
    const token = verificationLink.searchParams.get("token")!;
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(payload.exp - payload.iat).toBe(3600);
    const db = await getDatabase();
    expect((await db.collection("user").findOne({ _id: new ObjectId(userId) }))?.emailVerified).toBe(false);
    const deliveries = await db.collection("notification_deliveries").find({ userId }).toArray();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ type: "verify_email", status: "sent", preview: false });
    // Assert booleans to avoid printing a bearer token in a failed assertion.
    expect(JSON.stringify(deliveries).includes(token)).toBe(false);
    expect(JSON.stringify(deliveries).includes(verificationLink.href)).toBe(false);
  });

  it("verifies using the emailed link and persists one welcome outbox event without Inngest", async () => {
    const verified = await authGet(new Request(verificationLink.href));
    expect(verified.status).toBe(302);
    const db = await getDatabase();
    expect((await db.collection("user").findOne({ _id: new ObjectId(userId) }))?.emailVerified).toBe(true);
    const queued = await db.collection("welcome_outbox").find({ userId }).toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.status).toBe("pending");
    // The same valid verification link must not enqueue a second welcome message.
    expect((await authGet(new Request(verificationLink.href))).status).toBe(302);
    expect(await db.collection("welcome_outbox").countDocuments({ userId })).toBe(1);
    expect(captured.length).toBe(1);
  });

  it("sends a reset email with a one-hour persisted token and no bearer URL in the delivery journal", async () => {
    const response = await authPost(request("/api/auth/request-password-reset", "POST", { email, redirectTo: `${origin}/reset-password` }));
    expect(response.status).toBe(200);
    expect(captured.length).toBe(2);
    const message = captured[1]!;
    expect(message.subject).toBe("Восстановление доступа");
    resetLink = mailLink(message);
    expect(resetLink.origin === origin).toBe(true);
    expect(resetLink.pathname.startsWith("/api/auth/reset-password/")).toBe(true);
    const db = await getDatabase();
    const verification = await db.collection("verification").findOne({ value: userId });
    const remaining = verification?.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(3_500_000);
    expect(remaining).toBeLessThanOrEqual(3_600_000);
    const delivery = await db.collection("notification_deliveries").findOne({ userId, type: "reset_password" });
    expect(delivery?.status).toBe("sent");
    const token = resetLink.pathname.split("/").at(-1)!;
    expect(JSON.stringify(delivery).includes(token)).toBe(false);
    expect(JSON.stringify(delivery).includes(resetLink.href)).toBe(false);
  });

  it("resets the password once, revokes old sessions and requires the new password", async () => {
    const token = resetLink.pathname.split("/").at(-1)!;
    const weak = await authPost(request("/api/auth/reset-password", "POST", { token, newPassword: "short" }));
    expect(weak.status).toBe(400);
    const reset = await authPost(request("/api/auth/reset-password", "POST", { token, newPassword }));
    expect(reset.status).toBe(200);
    expect((await profileGet(request("/api/profile", "GET", undefined, originalCookie))).status).toBe(401);
    const db = await getDatabase();
    expect(await db.collection("session").countDocuments({ userId: new ObjectId(userId) })).toBe(0);
    expect((await authPost(request("/api/auth/reset-password", "POST", { token, newPassword }))).status).toBe(400);
    expect((await authPost(request("/api/auth/sign-in/email", "POST", { email, password: oldPassword }))).status).toBe(401);
    const signedIn = await authPost(request("/api/auth/sign-in/email", "POST", { email, password: newPassword }));
    expect(signedIn.status).toBe(200);
    expect((await profileGet(request("/api/profile", "GET", undefined, cookie(signedIn)))).status).toBe(200);
  });

  it("rejects an expired recovery token while preserving the current password", async () => {
    const response = await authPost(request("/api/auth/request-password-reset", "POST", { email, redirectTo: `${origin}/reset-password` }));
    expect(response.status).toBe(200);
    const expiredLink = mailLink(captured.at(-1)!);
    const token = expiredLink.pathname.split("/").at(-1)!;
    const db = await getDatabase();
    await db.collection("verification").updateMany({ value: userId }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    const reset = await authPost(request("/api/auth/reset-password", "POST", { token, newPassword: "Never-accepted-password-42!" }));
    expect(reset.status).toBe(400);
    expect((await authPost(request("/api/auth/sign-in/email", "POST", { email, password: newPassword }))).status).toBe(200);
  });

  it("does not send to unknown accounts or allow authentication mail links to leave this origin", async () => {
    const before = captured.length;
    const unknown = await authPost(request("/api/auth/request-password-reset", "POST", { email: "unknown-auth@example.test" }));
    expect(unknown.status).toBe(200);
    expect(captured.length).toBe(before);
    // Already verified accounts intentionally receive a generic success without another email.
    const noResend = await authPost(request("/api/auth/send-verification-email", "POST", { email }));
    expect(noResend.status).toBe(200);
    expect(captured.length).toBe(before);
    const poisonedCallback = new URL(verificationLink);
    poisonedCallback.searchParams.set("callbackURL", "https://attacker.test/steal");
    expect((await authGet(new Request(poisonedCallback.href))).status).toBe(403);
  });
});
