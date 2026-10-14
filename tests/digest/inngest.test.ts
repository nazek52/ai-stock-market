import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/inngest/route";

afterEach(() => vi.unstubAllEnvs());
describe("production background endpoint", () => {
  it("rejects development bypass and missing signing credentials in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_DEV", "1");
    expect((await POST(new NextRequest("https://example.test/api/inngest", { method: "POST", body: "{}" }), {})).status).toBe(503);
    vi.stubEnv("INNGEST_DEV", "0");
    vi.stubEnv("INNGEST_EVENT_KEY", "");
    vi.stubEnv("INNGEST_SIGNING_KEY", "");
    expect((await POST(new NextRequest("https://example.test/api/inngest", { method: "POST", body: "{}" }), {})).status).toBe(503);
  });
  it("does not execute an unsigned production request even when keys are configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_DEV", "0");
    vi.stubEnv("INNGEST_EVENT_KEY", "test-only-event-key");
    vi.stubEnv("INNGEST_SIGNING_KEY", "signkey-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const response = await POST(new NextRequest("https://example.test/api/inngest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), {});
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
