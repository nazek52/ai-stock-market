import "server-only";
import { getServerEnvironment } from "@/server/config";
import { AppError } from "@/server/errors";

/** Shared by local HTTP entry points and the internal manual delivery mode. */
export function assertLocalDemo() {
  if (process.env.LOCAL_DEMO !== "true" || process.env.NODE_ENV === "production") {
    throw new AppError("NOT_FOUND", "Demo is unavailable", 404);
  }
  const env = getServerEnvironment();
  if (env.MARKET_DATA_MODE !== "fixture" || env.AI_MODE !== "fixture"
    || !env.EMAIL_ENABLED || env.EMAIL_TRANSPORT !== "smtp"
    || !["127.0.0.1", "localhost", "::1"].includes(env.SMTP_HOST)
    || env.SMTP_PORT !== 1025 || env.SMTP_SECURE || env.SMTP_USER || env.SMTP_PASSWORD
    || env.DIGEST_SCHEDULE_ENABLED || env.ALERT_SCHEDULE_ENABLED
    || !env.MONGODB_DATABASE.endsWith("_demo")) {
    throw new AppError("FORBIDDEN", "Demo requires isolated fixture data and local Mailpit with schedules disabled", 403);
  }
  return env;
}
