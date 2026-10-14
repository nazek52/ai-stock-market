import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getAuthConfig } from "@/server/config";
import { getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";

const tokenSchema = z.strictObject({ userId: z.string().min(1).max(128), scope: z.literal("digest:unsubscribe"), expiresAt: z.number().int().positive() });
function signature(body: string) { return createHmac("sha256", getAuthConfig().secret).update(`digest-unsubscribe:v1:${body}`).digest("base64url"); }

export function createUnsubscribeToken(userId: string, now = new Date()) {
  const body = Buffer.from(JSON.stringify(tokenSchema.parse({ userId, scope: "digest:unsubscribe", expiresAt: Math.floor(now.getTime() / 1000) + 90 * 86400 }))).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function verifyUnsubscribeToken(token: string, now = new Date()): string {
  try {
    if (token.length > 1024) throw new Error("Invalid token length");
    const [body, supplied, extra] = token.split(".");
    if (!body || !supplied || extra !== undefined) throw new Error("Invalid token shape");
    const expected = signature(body);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new Error("Invalid signature");
    const parsed = tokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (parsed.expiresAt <= Math.floor(now.getTime() / 1000)) throw new Error("Expired token");
    return parsed.userId;
  } catch {
    throw new AppError("INVALID_INPUT", "Unsubscribe link is invalid or expired", 400);
  }
}

export function unsubscribeUrl(userId: string, now = new Date()) {
  const url = new URL("/api/email/unsubscribe", getAuthConfig().baseURL);
  url.searchParams.set("token", createUnsubscribeToken(userId, now));
  return url.toString();
}

export async function unsubscribeDigest(token: string) {
  const userId = verifyUnsubscribeToken(token);
  await (await getDatabase()).collection("digest_preferences").updateOne({ userId }, {
    $set: { enabled: false, consentUpdatedAt: new Date(), updatedAt: new Date() },
  });
  // Do not reveal whether a user/preference exists.
  return { unsubscribed: true };
}
