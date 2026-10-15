import "server-only";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getDatabase } from "@/server/db";
import { processDigest, type DigestDependencies } from "@/server/digest/processor";
import { marketNewsProvider } from "@/server/digest/market-news";
import { localClock } from "@/server/digest/schedule";
import { apiHandler, assertSameOrigin, jsonSuccess, parseJson } from "@/server/http";
import type { DigestPreferenceDocument } from "@/server/notifications/repository";
import { consumeQuota } from "@/server/rate-limit";
import { assertLocalDemo } from "./guard";

export interface DemoDigestResult {
  source: "fixture";
  localDate: string | null;
  status: "sent" | "duplicate" | "skipped" | "uncertain" | "processing";
  reason?: string;
}
// Only trusted server callers can inject dependencies. No date, transport or owner in HTTP input.
type Dependencies = Pick<DigestDependencies, "transport" | "newsProvider" | "summaryGenerator" | "now">;

export async function runOwnDemoDigest(userId: string, dependencies: Dependencies = {}): Promise<DemoDigestResult> {
  assertLocalDemo();
  const preference = await (await getDatabase()).collection<DigestPreferenceDocument>("digest_preferences").findOne({ userId });
  if (!preference) return { source: "fixture", localDate: null, status: "skipped", reason: "preferences_missing" };
  const localDate = localClock(dependencies.now ?? new Date(), preference.timezone).date;
  const result = await processDigest(userId, localDate, {
    ...dependencies, manualLocalDemo: true, newsProvider: dependencies.newsProvider ?? marketNewsProvider,
  });
  return { source: "fixture", localDate,
    status: result.status === "sent" ? result.replayed ? "duplicate" : "sent"
      : result.status === "pending" || result.status === "sending" ? "processing" : result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

export function handleDemoDigest(request: Request, dependencies: Dependencies = {}) {
  return apiHandler(async () => {
    assertLocalDemo();
    assertSameOrigin(request);
    const session = await requireSession(request.headers);
    await parseJson(request, z.strictObject({}));
    await consumeQuota(`demo-digest:${session.user.id}`, 10, 300_000);
    return jsonSuccess(await runOwnDemoDigest(session.user.id, dependencies));
  });
}
