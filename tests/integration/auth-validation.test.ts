import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId } from "mongodb";
import { POST } from "@/app/api/auth/[...all]/route";
import { closeDatabase, getDatabase } from "@/server/db";

const origin = "http://localhost:3000";
let replica: MongoMemoryReplSet;
let cookie = "";
let userId = "";
const request = (path: string, body: unknown, sessionCookie?: string) => new Request(`${origin}/api/auth${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json", ...(sessionCookie ? { cookie: sessionCookie } : {}) },
  body: JSON.stringify(body),
});

describe("P2.1 server name validation across native auth mutations", () => {
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1 } });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MONGODB_URI", replica.getUri());
    vi.stubEnv("MONGODB_DATABASE", "auth_validation_integration");
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-name-validation-secret-with-32-characters");
    vi.stubEnv("EMAIL_ENABLED", "false");
    const response = await POST(request("/sign-up/email", {
      email: "name-validation@example.test", name: "  Server Validation  ", password: "Test-password-only-42!",
    }));
    expect(response.status).toBe(200);
    userId = (await response.json()).user.id;
    cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  });
  afterAll(async () => { await closeDatabase(); await replica?.stop(); vi.unstubAllEnvs(); });

  it("rejects blank or oversized signup names without leaving partial auth records", async () => {
    for (const [index, name] of ["   ", "x".repeat(101)].entries()) {
      const response = await POST(request("/sign-up/email", { email: `invalid-name-${index}@example.test`, name, password: "Test-password-only-42!" }));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("INVALID_NAME");
    }
    const db = await getDatabase();
    expect(await db.collection("user").countDocuments()).toBe(1);
    expect(await db.collection("account").countDocuments()).toBe(1);
    expect(await db.collection("session").countDocuments()).toBe(1);
  });

  it("normalizes a valid signup name on the server", async () => {
    const stored = await (await getDatabase()).collection("user").findOne({ _id: new ObjectId(userId) });
    expect(stored?.name).toBe("Server Validation");
  });

  it("rejects invalid native update-user names and trims a valid name without changing email", async () => {
    for (const name of ["   ", "x".repeat(101)]) {
      const response = await POST(request("/update-user", { name }, cookie));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("INVALID_NAME");
    }
    expect((await POST(request("/update-user", { name: "  Updated User  " }, cookie))).status).toBe(200);
    const stored = await (await getDatabase()).collection("user").findOne({ _id: new ObjectId(userId) });
    expect(stored).toMatchObject({ name: "Updated User", email: "name-validation@example.test" });
  });
});
