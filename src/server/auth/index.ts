import "server-only";
import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { getAuthConfig, getServerEnvironment } from "@/server/config";
import { getDatabase, getMongoClient } from "@/server/db";
import { sendAuthenticationEmail } from "@/server/notifications/send";
import { enqueueVerifiedUser } from "@/server/notifications/welcome-outbox";

const accountNameSchema = z.string().trim().min(1).max(100);
function accountName(value: unknown): string {
  const result = accountNameSchema.safeParse(value);
  if (!result.success) throw APIError.fromStatus("BAD_REQUEST", {
    code: "INVALID_NAME", message: "Name must contain between 1 and 100 characters",
  });
  return result.data;
}

async function createAuth() {
  const config = getAuthConfig();
  const env = getServerEnvironment();
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
    databaseHooks: {
      user: {
        create: { async before(user) { return { data: { ...user, name: accountName(user.name) } }; } },
        update: { async before(user) {
          return { data: user.name === undefined ? user : { ...user, name: accountName(user.name) } };
        } },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: env.NODE_ENV === "production",
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url, token }) {
        await sendAuthenticationEmail({ userId: user.id, user, url, tokenId: token, type: "reset_password" });
      },
    },
    emailVerification: {
      sendOnSignUp: env.EMAIL_ENABLED && env.EMAIL_TRANSPORT === "smtp",
      expiresIn: 3600,
      async sendVerificationEmail({ user, url, token }) {
        await sendAuthenticationEmail({ userId: user.id, user, url, tokenId: token, type: "verify_email" });
      },
      async afterEmailVerification(user) {
        // A durable DB event survives a worker outage; verification itself never calls Inngest.
        await enqueueVerifiedUser(user.id);
      },
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
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
        "/send-verification-email": { window: 300, max: 3 },
        "/verify-email": { window: 60, max: 10 },
      },
    },
    advanced: {
      // Better Auth otherwise skips these checks under NODE_ENV=test; exercise the real boundary.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
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
