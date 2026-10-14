import "server-only";
import { inngest } from "./client";
import { deliverPendingAlerts, pollPriceAlerts } from "@/server/alerts/worker";

/** Root adds these functions to the signed /api/inngest serve list. */
export function createAlertFunctions() {
  return [
    inngest.createFunction({ id: "alert-poll", retries: 2, triggers: [{ cron: "* * * * *" }] }, async ({ step }) =>
      step.run("poll-eligible-symbols", () => pollPriceAlerts())),
    inngest.createFunction({ id: "alert-delivery", retries: 3, triggers: [{ cron: "* * * * *" }] }, async ({ step }) =>
      step.run("deliver-pending-alerts", () => deliverPendingAlerts())),
  ];
}
