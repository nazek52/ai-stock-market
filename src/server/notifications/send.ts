import "server-only";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getAuthConfig, getServerEnvironment } from "@/server/config";
import { getDatabase } from "@/server/db";
import { AppError } from "@/server/errors";
import { getRecipient, initializeDelivery, type DigestPreferenceDocument } from "./repository";
import { renderEmail } from "./render";
import { emailPayloadSchema, type DeliveryResult, type NotificationRequest, type RenderedEmail } from "./types";

export interface MailTransport {
  send(input: RenderedEmail & { to: string; from: string; messageId: string }): Promise<void>;
}
// BetterAuth's callback user also includes name/timestamps; retain only these fields.
const authRecipientSchema = z.object({ id: z.string().min(1).max(128), email: z.email(), emailVerified: z.boolean() });
type TrustedAuthRecipient = z.infer<typeof authRecipientSchema>;

function smtpTransport(): MailTransport {
  const env = getServerEnvironment();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    requireTLS: !["127.0.0.1", "localhost", "::1"].includes(env.SMTP_HOST) && !env.SMTP_SECURE,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return { async send(input) {
    const result = await transport.sendMail(input);
    if (!result.accepted?.length || result.rejected?.length) throw new Error("SMTP did not confirm recipient acceptance");
  } };
}

async function deliverTransactionalEmail(request: NotificationRequest, transport?: MailTransport, trustedAuthRecipient?: TrustedAuthRecipient): Promise<DeliveryResult> {
  z.string().min(1).max(400).regex(/^[A-Za-z0-9:_.@-]+$/).parse(request.idempotencyKey);
  z.string().min(1).max(128).parse(request.userId);
  const payload = emailPayloadSchema.parse(request.payload);
  const env = getServerEnvironment();
  const preview = request.previewOnly === true || env.EMAIL_TRANSPORT === "stream";
  if (env.NODE_ENV === "production" && !preview && (payload.fixture || env.MARKET_DATA_MODE === "fixture" && ["digest", "price_alert"].includes(request.type))) {
    throw new AppError("SERVICE_UNAVAILABLE", "Fixture messages cannot be delivered in production", 503);
  }
  if (env.NODE_ENV === "production" && !preview && ["127.0.0.1", "localhost", "::1"].includes(env.SMTP_HOST)) {
    throw new AppError("SERVICE_UNAVAILABLE", "Production email requires an external SMTP provider", 503);
  }
  // Verification/reset links must never leak their bearer credentials to another origin.
  if (["verify_email", "reset_password"].includes(request.type)) {
    const origin = getAuthConfig().baseURL;
    if (payload.links.length !== 1 || new URL(payload.links[0]!.url).origin !== origin) {
      throw new AppError("INVALID_INPUT", "Authentication email link must use the application origin", 400);
    }
  }
  const rendered = renderEmail(payload);
  const { deliveries, eventKey, record } = await initializeDelivery(request, preview);
  if (record.status !== "pending") return {
    status: record.status, reason: record.reason, replayed: true,
    ...(preview && record.status === "skipped" && record.reason === "preview" ? { preview: rendered } : {}),
  };
  const claimed = await deliveries.findOneAndUpdate({ eventKey, status: "pending" }, {
    $set: { status: "sending", claimedAt: new Date(), updatedAt: new Date() },
  }, { returnDocument: "after" });
  if (!claimed) return { status: (await deliveries.findOne({ eventKey }))?.status ?? "uncertain", replayed: true };

  let sendingStarted = false;
  try {
    const db = await getDatabase();
    // Read recipient and consent after claiming, immediately before the side effect.
    let recipient = await getRecipient(request.userId, db);
    // BetterAuth may send verification inside the signup transaction, before its
    // newly created user is visible to this separate DB read. Only its internal
    // callback can provide this validated fallback; HTTP requests never can.
    if (!recipient && trustedAuthRecipient && ["verify_email", "reset_password"].includes(request.type)) {
      recipient = { _id: trustedAuthRecipient.id, email: trustedAuthRecipient.email, emailVerified: trustedAuthRecipient.emailVerified };
    }
    let reason: string | undefined;
    if (!recipient || !z.email().safeParse(recipient.email).success) reason = "recipient_unavailable";
    else if (!["verify_email", "reset_password"].includes(request.type) && recipient.emailVerified !== true) reason = "email_unverified";
    else if (request.type === "digest" && !(await db.collection<DigestPreferenceDocument>("digest_preferences").findOne({ userId: request.userId, enabled: true }))) reason = "digest_opted_out";
    if (!reason && !preview && !env.EMAIL_ENABLED) reason = "delivery_disabled";
    if (reason) {
      await deliveries.updateOne({ eventKey, status: "sending" }, { $set: { status: "skipped", reason, updatedAt: new Date() } });
      return { status: "skipped", reason };
    }
    if (preview) {
      const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, disableFileAccess: true, disableUrlAccess: true });
      await stream.sendMail({ ...rendered, from: env.EMAIL_FROM, to: recipient!.email });
      await deliveries.updateOne({ eventKey, status: "sending" }, { $set: { status: "skipped", reason: "preview", updatedAt: new Date() } });
      return { status: "skipped", reason: "preview", preview: rendered };
    }
    sendingStarted = true;
    await (transport ?? smtpTransport()).send({ ...rendered, to: recipient!.email, from: env.EMAIL_FROM, messageId: `<${Buffer.from(eventKey).toString("base64url")}@notifications.local>` });
    const acknowledged = await deliveries.updateOne({ eventKey, status: "sending" }, { $set: { status: "sent", updatedAt: new Date() } });
    if (!acknowledged.matchedCount) return { status: "uncertain", reason: "delivery_state_changed" };
    return { status: "sent" };
  } catch {
    if (!sendingStarted) {
      // We know no SMTP side effect occurred. Release the claim for a safe retry.
      // If MongoDB is unavailable, leave sending orphaned for manual recovery.
      try {
        await deliveries.updateOne({ eventKey, status: "sending" }, {
          $set: { status: "pending", reason: "pre_send_failure", updatedAt: new Date() }, $unset: { claimedAt: "" },
        });
      } catch { /* Never expose provider/DB error text or force-reset a possibly active send. */ }
      throw new AppError("SERVICE_UNAVAILABLE", "Email preparation is temporarily unavailable", 503);
    }
    // SMTP may have accepted the email before a connection/DB write failed.
    // Do not turn this back into pending: a retry could send the same mail twice.
    const reason = "send_outcome_unknown";
    try {
      await deliveries.updateOne({ eventKey, status: "sending" }, { $set: { status: "uncertain", reason, updatedAt: new Date() } });
    } catch {
      throw new AppError("SERVICE_UNAVAILABLE", "Email outcome requires recovery after a storage failure", 503);
    }
    console.error("notification.delivery.failed", { type: request.type, reason });
    return { status: "uncertain", reason };
  }
}

/** All callers must supply a stable key derived from a persisted event, never a retry UUID. */
export async function sendTransactionalEmail(request: NotificationRequest, transport?: MailTransport): Promise<DeliveryResult> {
  return deliverTransactionalEmail(request, transport);
}

/** `user` is accepted only from the trusted BetterAuth callback, never from an HTTP body. */
export async function sendAuthenticationEmail(input: {
  userId: string; url: string; tokenId: string; type: "verify_email" | "reset_password"; user?: TrustedAuthRecipient;
}, transport?: MailTransport) {
  const user = input.user ? authRecipientSchema.parse(input.user) : undefined;
  if (user && user.id !== input.userId) throw new AppError("INVALID_INPUT", "Authentication recipient must match the callback user", 400);
  return deliverTransactionalEmail({
    userId: input.userId, type: input.type, idempotencyKey: `${input.type}:${input.userId}:${createHash("sha256").update(input.tokenId).digest("hex")}`,
    payload: { subject: input.type === "verify_email" ? "Подтверждение адреса" : "Восстановление доступа", title: "AI Stock Market",
      paragraphs: ["Для продолжения откройте ссылку. Если вы не запрашивали это действие, проигнорируйте письмо."],
      links: [{ label: "Продолжить", url: input.url }] },
  }, transport, user);
}
