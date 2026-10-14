import type { EmailPayload, RenderedEmail } from "./types";
import { emailPayloadSchema } from "./types";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Only this renderer creates HTML. Provider and AI strings are always escaped. */
export function renderEmail(input: EmailPayload): RenderedEmail {
  const payload = emailPayloadSchema.parse(input);
  const label = payload.fixture ? "[ТЕСТОВЫЕ ДАННЫЕ] " : "";
  const paragraphs = payload.paragraphs.map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph)}</p>`).join("");
  const links = payload.links.map((link) => `<li style="margin:0 0 12px;line-height:1.5"><a href="${escapeHtml(link.url)}" style="color:#1759a6;text-decoration:underline">${escapeHtml(link.label)}</a></li>`).join("");
  const fixtureNotice = payload.fixture ? `<p role="note" style="margin:0 0 20px;padding:12px 16px;background:#fff3cd;border:1px solid #a96900;color:#633c00;font-weight:700">ТЕСТОВЫЕ ДАННЫЕ: это демонстрационная сводка. Она не описывает реальные события рынка.</p>` : "";
  return {
    subject: label + payload.subject,
    html: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f5f7fa;color:#17212d;font-family:Arial,sans-serif"><main style="max-width:640px;margin:0 auto;padding:24px;background:#fff;border:1px solid #dce3ea;border-radius:12px">${fixtureNotice}<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3">${escapeHtml(payload.title)}</h1>${paragraphs}${links ? `<section aria-label="Ссылки и источники"><h2 style="margin:24px 0 12px;font-size:18px">Ссылки и источники</h2><ul style="margin:0;padding-left:20px">${links}</ul></section>` : ""}</main></body></html>`,
    text: [payload.fixture ? "ТЕСТОВЫЕ ДАННЫЕ: это демонстрационное письмо, не реальные события рынка." : "", payload.title, ...payload.paragraphs, ...(payload.links.length ? ["Ссылки и источники:", ...payload.links.map((link) => `${link.label}: ${link.url}`)] : [])].filter(Boolean).join("\n\n"),
  };
}
