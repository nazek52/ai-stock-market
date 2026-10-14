import "server-only";
import { createHash } from "node:crypto";
import type { StockNewsItem } from "@/contracts";
import { getDatabase } from "@/server/db";
import { getServerEnvironment } from "@/server/config";
import { AppError } from "@/server/errors";
import { getRecipient, type DigestPreferenceDocument } from "@/server/notifications/repository";
import { sendTransactionalEmail, type MailTransport } from "@/server/notifications/send";
import type { DeliveryResult } from "@/server/notifications/types";
import { dueDigestDate, localClock } from "./schedule";
import { defaultNewsProvider, selectDigestNews, type NewsProvider, type NewsBatch } from "./news";
import { generateDigestSummary, validateSummary, type SummaryGenerator, type DigestSummary } from "./summary";
import { unsubscribeUrl } from "./unsubscribe";

export interface DigestDependencies {
  newsProvider?: NewsProvider;
  summaryGenerator?: SummaryGenerator;
  transport?: MailTransport;
  now?: Date;
  previewOnly?: boolean;
}
export interface DigestEvent { name: "stock/digest.requested"; id: string; data: { userId: string; localDate: string } }

export function digestEvent(userId: string, localDate: string): DigestEvent {
  return { name: "stock/digest.requested", id: createHash("sha256").update(`digest:${userId}:${localDate}`).digest("hex"), data: { userId, localDate } };
}

/** Preparation failures are retriable: the send claim has not been acquired yet. */
export async function processDigest(userId: string, localDate: string, dependencies: DigestDependencies = {}): Promise<DeliveryResult> {
  const now = dependencies.now ?? new Date();
  const db = await getDatabase();
  const [preference, recipient] = await Promise.all([
    db.collection<DigestPreferenceDocument>("digest_preferences").findOne({ userId }), getRecipient(userId, db),
  ]);
  if (!recipient?.emailVerified) return { status: "skipped", reason: "email_unverified" };
  if (!preference?.enabled) return { status: "skipped", reason: "digest_opted_out" };
  if (dependencies.previewOnly) {
    if (localClock(now, preference.timezone).date !== localDate) return { status: "skipped", reason: "wrong_local_date" };
  } else if (dueDigestDate(preference, now) !== localDate) return { status: "skipped", reason: "not_due" };
  const symbols = (await db.collection<{ userId: string; symbol: string }>("watchlist_items").find({ userId }).project<{ symbol: string }>({ _id: 0, symbol: 1 }).limit(100).toArray()).map((item) => item.symbol);
  let batch: NewsBatch;
  let articles: StockNewsItem[];
  try {
    batch = await (dependencies.newsProvider ?? defaultNewsProvider)(symbols, now);
    articles = selectDigestNews(batch.articles, now);
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "Digest news is temporarily unavailable", 502);
  }
  let generated: Awaited<ReturnType<SummaryGenerator>>;
  let summary: DigestSummary;
  try {
    generated = await (dependencies.summaryGenerator ?? generateDigestSummary)(articles);
    summary = validateSummary(generated.summary, articles);
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "Digest summary is temporarily unavailable", 502);
  }
  const linkedIds = new Set(summary.items.flatMap((item) => item.articleIds));
  const result = await sendTransactionalEmail({
    type: "digest", userId, idempotencyKey: `digest:${userId}:${localDate}`, previewOnly: dependencies.previewOnly,
    payload: {
      subject: `Новости рынка за ${localDate}`, title: `Ежедневная сводка — ${localDate}`,
      fixture: batch.source === "fixture" || generated.fixture,
      paragraphs: summary.items.length ? summary.items.map((item) => item.text) : ["За последние 24 часа подходящих новостей нет."],
      links: [
        ...articles.filter((article) => linkedIds.has(article.id)).map((article) => ({ label: `${article.source}: ${article.headline}`, url: article.url })),
        { label: "Отключить ежедневную сводку", url: unsubscribeUrl(userId, now) },
      ],
    },
  }, dependencies.transport);
  if (result.status === "sent") {
    await db.collection<DigestPreferenceDocument>("digest_preferences").updateOne({ userId }, { $set: { lastSentAt: now, updatedAt: new Date() } });
  }
  return result;
}

/** Snapshot first: durable step replay must not recalculate changing recipient batches. */
export async function collectDueDigestEvents(now: Date) {
  if (!getServerEnvironment().DIGEST_SCHEDULE_ENABLED) return { events: [] as DigestEvent[], skipped: 0, errors: 0 };
  const db = await getDatabase();
  const cursor = db.collection<DigestPreferenceDocument>("digest_preferences").find({ enabled: true }).batchSize(100);
  const events: DigestEvent[] = [];
  let skipped = 0;
  let errors = 0;
  for await (const preference of cursor) {
    try {
      const localDate = dueDigestDate(preference, now);
      if (!localDate || !(await getRecipient(preference.userId, db))?.emailVerified) { skipped++; continue; }
      events.push(digestEvent(preference.userId, localDate));
    } catch {
      errors++;
      console.error("digest.recipient.invalid", { reason: "preference_invalid" });
    }
    // Bound the durable snapshot. Further users are picked up by a later cron.
    if (events.length >= 1000) break;
  }
  await cursor.close();
  return { events, skipped, errors };
}

/** Batch fan-out isolates malformed preferences and per-user errors without exposing emails. */
export async function dispatchDueDigests(now: Date, dispatch: (events: DigestEvent[]) => Promise<unknown>) {
  const { events, skipped, errors } = await collectDueDigestEvents(now);
  for (let index = 0; index < events.length; index += 100) await dispatch(events.slice(index, index + 100));
  return { dispatched: events.length, skipped, errors };
}

/** Useful for a single-account local run; no global batch mutation or another user's ID. */
export async function previewOwnDigest(userId: string) {
  const preference = await (await getDatabase()).collection<DigestPreferenceDocument>("digest_preferences").findOne({ userId });
  if (!preference) return { status: "skipped" as const, reason: "preferences_missing" };
  return processDigest(userId, localClock(new Date(), preference.timezone).date, { previewOnly: true });
}
