import "server-only";
import { z } from "zod";
import { getServerEnvironment } from "@/server/config";
import { collectDueDigestEvents, processDigest } from "@/server/digest/processor";
import { defaultNewsProvider, type NewsProvider } from "@/server/digest/news";
import { sendTransactionalEmail } from "@/server/notifications/send";
import { inngest } from "./client";

const digestEventSchema = z.strictObject({ userId: z.string().min(1).max(128), localDate: z.iso.date() });

export function createDigestFunctions(newsProvider: NewsProvider = defaultNewsProvider) {
  const dispatcher = inngest.createFunction({ id: "digest-dispatch", retries: 3, triggers: [{ cron: "*/5 * * * *" }] }, async ({ step }) => {
    if (!getServerEnvironment().DIGEST_SCHEDULE_ENABLED) return { disabled: true };
    const snapshot = await step.run("select-due-users", () => collectDueDigestEvents(new Date()));
    for (let index = 0; index < snapshot.events.length; index += 100) {
      await step.sendEvent(`digest-batch-${index / 100}`, snapshot.events.slice(index, index + 100));
    }
    return { dispatched: snapshot.events.length, errors: snapshot.errors, skipped: snapshot.skipped };
  });
  const digest = inngest.createFunction({
    id: "digest-user", retries: 3, concurrency: { limit: 5 }, triggers: [{ event: "stock/digest.requested" }],
  }, async ({ event, step }) => {
    if (!getServerEnvironment().DIGEST_SCHEDULE_ENABLED) return { disabled: true };
    const data = digestEventSchema.parse(event.data);
    return step.run("build-and-send-digest", async () => {
      const { status, reason } = await processDigest(data.userId, data.localDate, { newsProvider });
      // Do not store rendered mail or unsubscribe bearer tokens in workflow outputs.
      return { status, reason };
    });
  });
  const welcome = inngest.createFunction({ id: "welcome-user", retries: 3, triggers: [{ event: "stock/user.verified" }] }, async ({ event, step }) => {
    const userId = z.string().min(1).max(128).parse(event.data.userId);
    return step.run("send-welcome", async () => {
      const { status, reason } = await sendTransactionalEmail({
        userId, type: "welcome", idempotencyKey: `welcome:${userId}`, payload: { subject: "Добро пожаловать", title: "AI Stock Market",
          paragraphs: ["Аккаунт готов. Ежедневную сводку можно включить в настройках; она выключена по умолчанию."], links: [] },
      });
      return { status, reason };
    });
  });
  return [dispatcher, digest, welcome];
}
