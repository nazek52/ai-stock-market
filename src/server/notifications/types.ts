import { z } from "zod";

export const emailLinkSchema = z.strictObject({
  label: z.string().trim().min(1).max(200),
  url: z.url({ protocol: /^https?$/ }).max(4096).refine((value) => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  }),
});
export const emailPayloadSchema = z.strictObject({
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  title: z.string().trim().min(1).max(300),
  paragraphs: z.array(z.string().max(3000)).max(12),
  links: z.array(emailLinkSchema).max(12),
  fixture: z.boolean().default(false),
});
export type EmailPayload = z.input<typeof emailPayloadSchema>;
export type NotificationType = "digest" | "welcome" | "price_alert" | "verify_email" | "reset_password";
export type DeliveryStatus = "pending" | "sending" | "sent" | "skipped" | "uncertain";
export interface NotificationRequest {
  idempotencyKey: string;
  type: NotificationType;
  userId: string;
  payload: EmailPayload;
  previewOnly?: boolean;
}
export interface RenderedEmail { subject: string; html: string; text: string }
export interface DeliveryResult {
  status: DeliveryStatus;
  reason?: string;
  preview?: RenderedEmail;
}
