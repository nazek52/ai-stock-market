import "server-only";
import { z } from "zod";
import { AppError } from "./errors";

const integer = (min: number, max: number, fallback: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const flag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//).optional(),
  MONGODB_DATABASE: z.string().regex(/^[a-zA-Z0-9_-]{1,63}$/).default("ai_stock_market"),
  MARKET_DATA_MODE: z.enum(["fixture", "finnhub"]).default("fixture"),
  FINNHUB_API_KEY: z.string().optional(),
  FINNHUB_REQUESTS_PER_MINUTE: integer(1, 30, 30),
  MARKET_CACHE_SECONDS: integer(1, 3600, 60),
  MARKET_STALE_SECONDS: integer(60, 86400, 900),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_DEV: z.enum(["0", "1"]).optional(),
  AI_MODE: z.enum(["fixture", "gemini"]).default("fixture"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  EMAIL_TRANSPORT: z.enum(["stream", "smtp"]).default("stream"),
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: integer(1, 65535, 1025),
  SMTP_SECURE: flag,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default("AI Stock Market <no-reply@localhost.test>"),
  EMAIL_ENABLED: flag,
  DIGEST_SCHEDULE_ENABLED: flag,
  ALERT_SCHEDULE_ENABLED: flag,
  ALERT_POLL_SECONDS: integer(300, 3600, 300),
});

/** Read lazily: a build and liveness check must not connect to services. */
export function getServerEnvironment() {
  const input = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value]));
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))].join(", ");
    throw new AppError("SERVICE_UNAVAILABLE", `Invalid server configuration: ${fields}`, 503);
  }
  return result.data;
}

export function getDatabaseConfig() {
  const env = getServerEnvironment();
  if (!env.MONGODB_URI) throw new AppError("SERVICE_UNAVAILABLE", "Database is not configured", 503);
  return { uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE };
}

export function getAuthConfig() {
  const env = getServerEnvironment();
  if (!env.BETTER_AUTH_SECRET) throw new AppError("SERVICE_UNAVAILABLE", "Authentication is not configured", 503);
  const url = new URL(env.BETTER_AUTH_URL);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new AppError("SERVICE_UNAVAILABLE", "BETTER_AUTH_URL must be an origin", 503);
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new AppError("SERVICE_UNAVAILABLE", "Production authentication requires HTTPS", 503);
  }
  return { baseURL: url.origin, secret: env.BETTER_AUTH_SECRET, trustedOrigins: [url.origin] };
}
