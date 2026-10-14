import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn(), environment: vi.fn() }));
vi.mock("@/server/db", () => ({ getDatabase: mocks.database }));
vi.mock("@/server/config", () => ({ getServerEnvironment: mocks.environment }));

beforeEach(() => {
  vi.resetModules();
  mocks.database.mockReset();
  mocks.environment.mockReturnValue({ NODE_ENV: "production" });
  for (const [name, value] of Object.entries({
    NODE_ENV: "production", BETTER_AUTH_URL: "https://stocks.example.com", BETTER_AUTH_SECRET: "synthetic-readiness-secret-longer-than-32-characters",
    MONGODB_URI: "mongodb://db.internal/stocks?replicaSet=rs0", EMAIL_ENABLED: "true", EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", EMAIL_FROM: "sender@stocks.example.com",
    INNGEST_EVENT_KEY: "synthetic-event-key", INNGEST_SIGNING_KEY: "synthetic-signing-key",
    DIGEST_SCHEDULE_ENABLED: "false", ALERT_SCHEDULE_ENABLED: "false", INNGEST_DEV: "0", MARKET_DATA_MODE: "fixture", AI_MODE: "fixture",
  })) vi.stubEnv(name, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("unauthenticated readiness probe", () => {
  it("coalesces probes and returns only a generic status for a writable replica set", async () => {
    const ping = vi.fn(async () => ({ ok: 1 }));
    const hello = vi.fn(async () => ({ ok: 1, isWritablePrimary: true, setName: "private-replica-name" }));
    mocks.database.mockResolvedValue({ command: ping, admin: () => ({ command: hello }) });
    const { GET } = await import("@/app/api/readiness/route");
    const responses = await Promise.all([GET(), GET(), GET()]);
    expect(mocks.database).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "ready" });
    }
  });
  it("does not expose credentials or topology details when the database fails", async () => {
    mocks.database.mockRejectedValue(new Error("mongodb://private-user:private-password@internal-host"));
    const { GET } = await import("@/app/api/readiness/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("refuses a standalone or read-only database even if ping works", async () => {
    mocks.database.mockResolvedValue({ command: async () => ({ ok: 1 }), admin: () => ({ command: async () => ({ ok: 1, isWritablePrimary: true }) }) });
    const { GET } = await import("@/app/api/readiness/route");
    expect((await GET()).status).toBe(503);
  });
  it("fails closed on invalid production settings without opening a DB connection", async () => {
    vi.stubEnv("INNGEST_DEV", "1");
    const { GET } = await import("@/app/api/readiness/route");
    expect((await GET()).status).toBe(503);
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("bounds a hung DB check and returns 503", async () => {
    vi.useFakeTimers();
    mocks.database.mockReturnValue(new Promise(() => {}));
    const { GET } = await import("@/app/api/readiness/route");
    const response = GET();
    await vi.advanceTimersByTimeAsync(4_001);
    expect((await response).status).toBe(503);
  });
});
