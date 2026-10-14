import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { acquireLease, acquireMarketPermit, consumeQuota } from "@/server/rate-limit";
import { closeDatabase, getDatabase } from "@/server/db";

let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: "8.0.16" }, replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DATABASE = "rate_limit_test";
});
afterAll(async () => { await closeDatabase(); await mongo?.stop(); });

describe("shared MongoDB limits", () => {
  it("grants exactly the configured budget under concurrent requests", async () => {
    const now = Math.floor(Date.now() / 60000) * 60000;
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => consumeQuota("concurrent", 5, 60000, now)));
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(5);
    expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(15);
    await expect(consumeQuota("concurrent", 5, 60000, now + 60000)).resolves.toBeUndefined();
  });

  it("releases only its own lease and recovers after bounded expiry", async () => {
    const now = Date.now();
    const first = await acquireLease("provider-test", 1000, now);
    await expect(acquireLease("provider-test", 1000, now + 1)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const second = await acquireLease("provider-test", 1000, now + 1001);
    await first(); // An expired owner must never release a newer worker's lease.
    await expect(acquireLease("provider-test", 1000, now + 1002)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await second();
    const third = await acquireLease("provider-test", 1000, now + 1003);
    await third();
  });

  it("does not reset the market budget at a wall-clock minute boundary", async () => {
    const now = Date.now();
    const first = await acquireMarketPermit(2, now);
    await first();
    const second = await acquireMarketPermit(2, now + 500);
    await second();
    await expect(acquireMarketPermit(2, now + 1000)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const renewed = await acquireMarketPermit(2, now + 60001);
    await renewed();
  });

  it("never returns a permit with an already consumed lease lifetime", async () => {
    await (await getDatabase()).collection<{ _id: string }>("request_windows").deleteOne({ _id: "finnhub-global" });
    await expect(acquireMarketPermit(30, Date.now() - 20000)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const release = await acquireMarketPermit(30);
    await release();
  });
});
