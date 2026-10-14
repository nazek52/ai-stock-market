import type { EmailPayload, RenderedEmail } from "./types";
import { emailPayloadSchema } from "./types";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Only this renderer creates HTML. Provider and AI strings are always escaped. */
export function renderEmail(input: EmailPayload): RenderedEmail {
  const payload = emailPayloadSchema.parse(input);
  const label = payload.fixture ? "[ТЕСТОВЫЕ ДАННЫЕ] " : "";
  return {
    subject: label + payload.subject,
    html: `<!doctype html><html lang="ru"><body><h1>${escapeHtml(label + payload.title)}</h1>${payload.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}<ul>${payload.links.map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></li>`).join("")}</ul></body></html>`,
    text: [label + payload.title, ...payload.paragraphs, ...payload.links.map((link) => `${link.label}: ${link.url}`)].join("\n\n"),
  };
}
