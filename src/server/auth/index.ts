import "server-only";
import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getAuthConfig } from "@/server/config";
import { getDatabase, getMongoClient } from "@/server/db";

async function createAuth() {
  const config = getAuthConfig();
  const [db, client] = await Promise.all([getDatabase(), getMongoClient()]);
  // MongoDB has no generated migration; indexes enforce invariants even under concurrent requests.
  await Promise.all([
    db.collection("user").createIndex({ email: 1 }, { unique: true, name: "user_email_unique" }),
    db.collection("session").createIndex({ token: 1 }, { unique: true, name: "session_token_unique" }),
    db.collection("session").createIndex({ userId: 1 }, { name: "session_user" }),
    db.collection("session").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry" }),
    db.collection("account").createIndex({ providerId: 1, accountId: 1 }, { unique: true, name: "account_provider_unique" }),
    db.collection("verification").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "verification_expiry" }),
    db.collection("rateLimit").createIndex({ key: 1 }, { unique: true, name: "rate_limit_key_unique" }),
  ]);

  return betterAuth({
    appName: "AI Stock Market",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: mongodbAdapter(db, { client }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Verification and reset are enabled only when a real mail transport is configured.
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: { defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    // Provider exceptions can include connection credentials. Log metadata only at our boundary.
    logger: { disabled: true },
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
let authPromise: Promise<Auth> | undefined;

export function getAuth(): Promise<Auth> {
  authPromise ??= createAuth().catch((error: unknown) => {
    authPromise = undefined;
    throw error;
  });
  return authPromise;
}
