import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateProductionEnvironment } from "@/server/production";

const base = {
  NODE_ENV: "production", BETTER_AUTH_URL: "https://stocks.example.com",
  BETTER_AUTH_SECRET: "synthetic-secret-do-not-print-this-value-1234567890",
  MONGODB_URI: "mongodb://db.internal:27017/stocks?replicaSet=rs0", MONGODB_DATABASE: "stocks",
  EMAIL_ENABLED: "true", EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587",
  SMTP_SECURE: "false", EMAIL_FROM: "Stock Market <sender@stocks.example.com>",
  INNGEST_EVENT_KEY: "synthetic-event-key", INNGEST_SIGNING_KEY: "synthetic-signing-key",
  DIGEST_SCHEDULE_ENABLED: "false", ALERT_SCHEDULE_ENABLED: "false", INNGEST_DEV: "0",
} as const;
const mail = {
  EMAIL_ENABLED: "true", EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587",
  SMTP_SECURE: "false", EMAIL_FROM: "Stock Market <sender@stocks.example.com>",
  INNGEST_EVENT_KEY: "synthetic-event-key", INNGEST_SIGNING_KEY: "synthetic-signing-key",
};
const fields = (env: Record<string, string>) => validateProductionEnvironment(env).issues.map((issue) => issue.field);

describe("production deployment preflight", () => {
  it("permits disabled market/AI jobs without unrelated provider keys while verification mail remains configured", () => {
    expect(validateProductionEnvironment(base)).toEqual({ ok: true, issues: [] });
  });
  it("blocks production registration without a working email-verification path", () => {
    expect(fields({ ...base, EMAIL_ENABLED: "false" })).toContain("EMAIL_ENABLED");
  });
  it.each(["http://stocks.example.com", "https://localhost", "https://127.0.0.1", "https://stocks.example.com/path", "https://user:password@stocks.example.com"])(
    "rejects an unsafe or ambiguous application origin %s", (url) => {
      expect(fields({ ...base, BETTER_AUTH_URL: url })).toContain("BETTER_AUTH_URL");
    },
  );
  it("requires transactional MongoDB topology without exposing credentials", () => {
    const result = validateProductionEnvironment({ ...base, MONGODB_URI: "mongodb://user:private-marker@db.internal/stocks" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-marker");
    expect(fields({ ...base, MONGODB_URI: "mongodb+srv://db.example.com/stocks" })).not.toContain("MONGODB_URI");
    expect(fields({ ...base, MONGODB_URI: "mongodb://?replicaSet=rs0" })).toContain("MONGODB_URI");
  });
  it("rejects development event-signature bypass even when schedules are disabled", () => {
    expect(fields({ ...base, INNGEST_DEV: "1" })).toContain("INNGEST_DEV");
  });
  it("requires live market, AI, mail and authenticated workflows for enabled digest jobs", () => {
    const bad = fields({ ...base, DIGEST_SCHEDULE_ENABLED: "true", EMAIL_ENABLED: "false", INNGEST_SIGNING_KEY: "" });
    expect(bad).toEqual(expect.arrayContaining(["MARKET_DATA_MODE", "AI_MODE", "EMAIL_ENABLED", "GEMINI_API_KEY", "INNGEST_SIGNING_KEY"]));
    expect(validateProductionEnvironment({ ...base, ...mail, DIGEST_SCHEDULE_ENABLED: "true", MARKET_DATA_MODE: "finnhub", FINNHUB_API_KEY: "synthetic-provider-key", AI_MODE: "gemini", GEMINI_API_KEY: "synthetic-ai-key", GEMINI_MODEL: "approved-model" }).ok).toBe(true);
  });
  it("does not require AI keys for price-alert jobs", () => {
    expect(validateProductionEnvironment({ ...base, ...mail, ALERT_SCHEDULE_ENABLED: "true", MARKET_DATA_MODE: "finnhub", FINNHUB_API_KEY: "synthetic-provider-key" }).ok).toBe(true);
  });
  it.each(["localhost", "127.0.0.1", "0177.0.0.1", "[::1]", "::ffff:127.0.0.1", "mailpit", "mail.smtp.test"])(
    "rejects local/test SMTP hosts for real delivery %s", (host) => {
      expect(fields({ ...base, ...mail, SMTP_HOST: host })).toContain("SMTP_HOST");
    },
  );
  it("does not accept preview transport, incomplete credentials or a test sender as real delivery", () => {
    expect(fields({ ...base, ...mail, EMAIL_TRANSPORT: "stream" })).toContain("EMAIL_TRANSPORT");
    expect(fields({ ...base, ...mail, SMTP_USER: "synthetic-user" })).toContain("SMTP_USER/SMTP_PASSWORD");
    expect(fields({ ...base, ...mail, EMAIL_FROM: "Demo <no-reply@localhost.test>" })).toContain("EMAIL_FROM");
  });
  it("rejects invalid feature flags rather than silently disabling them", () => {
    expect(fields({ ...base, ALERT_SCHEDULE_ENABLED: "TRUE" })).toContain("ALERT_SCHEDULE_ENABLED");
  });
  it("rejects provider budgets above the application cap and unsupported polling intervals", () => {
    expect(fields({ ...base, FINNHUB_REQUESTS_PER_MINUTE: "600" })).toContain("FINNHUB_REQUESTS_PER_MINUTE");
    expect(fields({ ...base, ALERT_POLL_SECONDS: "60" })).toContain("ALERT_POLL_SECONDS");
  });
  it("CLI exits nonzero for a bad deployment and prints field names without secret values", () => {
    const result = spawnSync(process.execPath, ["scripts/validate-production.mjs"], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8",
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...base, BETTER_AUTH_URL: "https://private-user:private-password@stocks.example.com" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BETTER_AUTH_URL");
    expect(result.stderr).not.toContain("private-password");
    expect(result.stderr).not.toContain(base.BETTER_AUTH_SECRET);
  });
  it("runs the shared validator with Node 24 optional env-file support", () => {
    const result = spawnSync(process.execPath, ["--env-file-if-exists=.env.deployment-test-absent", "scripts/validate-production.mjs"], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8",
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...base },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("preflight passed");
  });
});
