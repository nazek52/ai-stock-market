import { expect, it } from "vitest";
import { demoEnvironment } from "../../scripts/demo.mjs";

it("isolates the demo from inherited cloud services and preserves unrelated process settings", () => {
  const env = demoEnvironment("test-only-secret-of-at-least-32-characters", 3100, {
    PATH: "test-tool-path", NODE_ENV: "production", MONGODB_URI: "mongodb+srv://private.invalid/real",
    MONGODB_DATABASE: "real", FINNHUB_API_KEY: "private-key", GEMINI_API_KEY: "private-ai",
    INNGEST_EVENT_KEY: "private-event", INNGEST_SIGNING_KEY: "private-signing",
    SMTP_HOST: "external.invalid", SMTP_USER: "private-user", SMTP_PASSWORD: "private-password",
    MARKET_DATA_MODE: "finnhub", AI_MODE: "gemini", DIGEST_SCHEDULE_ENABLED: "true", ALERT_SCHEDULE_ENABLED: "true",
  });
  expect(env).toMatchObject({ NODE_ENV: "development", LOCAL_DEMO: "true", MONGODB_DATABASE: "ai_stock_market_demo",
    BETTER_AUTH_URL: "http://localhost:3100", INNGEST_APP_PORT: "3100", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025",
    SMTP_PASSWORD: "", SMTP_USER: "", FINNHUB_API_KEY: "", GEMINI_API_KEY: "", INNGEST_EVENT_KEY: "", INNGEST_SIGNING_KEY: "",
    MARKET_DATA_MODE: "fixture", AI_MODE: "fixture", EMAIL_ENABLED: "true", EMAIL_TRANSPORT: "smtp",
    DIGEST_SCHEDULE_ENABLED: "false", ALERT_SCHEDULE_ENABLED: "false", PATH: "test-tool-path" });
  expect(env.MONGODB_URI).toContain("127.0.0.1:27017/ai_stock_market_demo");
});

it("rejects unsafe application ports and a missing persistent auth secret", () => {
  const secret = "test-only-secret-of-at-least-32-characters";
  for (const port of [0, 443, 1025, 8025, 8288, 27017, 65536, 3100.5]) expect(() => demoEnvironment(secret, port)).toThrow();
  expect(() => demoEnvironment("", 3000)).toThrow();
});
