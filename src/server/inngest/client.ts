import "server-only";
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ai-stock-market",
  isDev: process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
