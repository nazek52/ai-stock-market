import { describe, expect, it } from "vitest";
import { dueDigestDate, localClock } from "@/server/digest/schedule";

const preference = { enabled: true, timezone: "Asia/Qyzylorda", localTime: "09:00", lastSentAt: null };
describe("local digest scheduling", () => {
  it("uses local calendar dates and catches up only after the chosen time", () => {
    expect(dueDigestDate(preference, new Date("2026-10-14T03:59:00Z"))).toBeNull();
    expect(dueDigestDate(preference, new Date("2026-10-14T04:00:00Z"))).toBe("2026-10-14");
    expect(dueDigestDate({ ...preference, enabled: false }, new Date("2026-10-14T05:00:00Z"))).toBeNull();
    expect(dueDigestDate({ ...preference, lastSentAt: new Date("2026-10-14T04:00:00Z") }, new Date("2026-10-14T10:00:00Z"))).toBeNull();
    expect(localClock(new Date("2026-10-14T23:30:00Z"), "Asia/Qyzylorda").date).toBe("2026-10-15");
  });
  it("handles the spring DST gap and does not duplicate in the repeated fall hour", () => {
    const spring = { ...preference, timezone: "America/New_York", localTime: "02:30" };
    expect(dueDigestDate(spring, new Date("2026-03-08T06:55:00Z"))).toBeNull();
    expect(dueDigestDate(spring, new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    const fall = { ...spring, localTime: "01:30" };
    expect(dueDigestDate(fall, new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
    expect(dueDigestDate({ ...fall, lastSentAt: new Date("2026-11-01T05:30:00Z") }, new Date("2026-11-01T06:30:00Z"))).toBeNull();
  });
});
