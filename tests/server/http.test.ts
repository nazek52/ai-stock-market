import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiHandler, assertSameOrigin, parseJson } from "@/server/http";

afterEach(() => vi.unstubAllEnvs());

describe("API boundary", () => {
  it("rejects cross-origin mutations even with a session cookie", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/profile", {
      headers: { origin: "https://attacker.example", cookie: "session=valid" },
    }))).toThrow("origin");
  });

  it("rejects an oversized streamed JSON body", async () => {
    const response = await apiHandler(async () => {
      await parseJson(new Request("http://localhost/api", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(17000) }),
      }), z.object({ value: z.string() }));
      return new Response();
    });
    expect(response.status).toBe(413);
  });

  it("does not disclose arbitrary exception messages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await apiHandler(async () => { throw new Error("mongodb://secret-password@host"); });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-password");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-password");
  });
});
