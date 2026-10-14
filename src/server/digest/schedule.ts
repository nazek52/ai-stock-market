import { localTimeSchema, timezoneSchema } from "@/contracts";

export function localClock(now: Date, timezone: string): { date: string; time: string } {
  timezoneSchema.parse(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (part: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === part)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

export function dueDigestDate(preference: { enabled: boolean; timezone: string; localTime: string; lastSentAt: Date | null }, now: Date): string | null {
  if (!preference.enabled) return null;
  localTimeSchema.parse(preference.localTime);
  const local = localClock(now, preference.timezone);
  if (local.time < preference.localTime) return null;
  if (preference.lastSentAt && localClock(preference.lastSentAt, preference.timezone).date === local.date) return null;
  // Catch up in this local day only. A skipped DST clock time runs at the first later tick.
  return local.date;
}
