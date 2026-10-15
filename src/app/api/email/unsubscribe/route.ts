import { randomBytes } from "node:crypto";
import { escapeHtml } from "@/server/notifications/render";
import { unsubscribeDigest, verifyUnsubscribeToken } from "@/server/digest/unsubscribe";
import { apiHandler, jsonSuccess, AppError } from "@/server/http";

export const runtime = "nodejs";

function htmlPage(title: string, content: string, status = 200) {
  const nonce = randomBytes(18).toString("base64");
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} — AI Stock Market</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;padding:1rem;background:#f5f7fa;color:#17212d;font:1rem/1.6 Arial,sans-serif;overflow-wrap:anywhere}main{max-width:40rem;margin:5vh auto;padding:clamp(1rem,4vw,2rem);background:white;border:1px solid #dce3ea;border-radius:12px}h1{font-size:clamp(1.5rem,5vw,2rem);line-height:1.3}button,a{font:inherit}button{min-height:44px;max-width:100%;padding:.75rem 1rem;white-space:normal;background:#1759a6;color:white;border:2px solid #1759a6;border-radius:8px;cursor:pointer}a{display:inline-block;min-height:44px;padding:.6rem 0;color:#1759a6;text-underline-offset:3px}button:focus-visible,a:focus-visible{outline:3px solid #17212d;outline-offset:4px}</style></head><body><main aria-labelledby="unsubscribe-title"><h1 id="unsubscribe-title">${escapeHtml(title)}</h1>${content}</main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` },
  });
}

function browserError(status: number) {
  return htmlPage("Не удалось отключить сводку", "<p>Ссылка недействительна или истекла. Откройте ссылку из последнего письма или измените согласие в настройках.</p><a href=\"/settings\">Открыть настройки рассылки</a>", status);
}
const wantsHtml = (request: Request) => request.headers.get("accept")?.toLowerCase().includes("text/html") === true;

export async function GET(request: Request) {
  const response = await apiHandler(async () => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    verifyUnsubscribeToken(token);
    // GET is deliberately read-only: link scanners cannot change consent.
    return htmlPage("Отключить ежедневную сводку?", `<p>Рассылка останется включённой, пока вы не подтвердите отключение кнопкой ниже.</p><form method="post" action="/api/email/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Отключить ежедневную сводку</button></form><p><a href="/settings">Вернуться к настройкам</a></p>`);
  });
  return !response.ok && wantsHtml(request) ? browserError(response.status) : response;
}
export async function POST(request: Request) {
  const form = request.headers.get("content-type")?.split(";")[0] === "application/x-www-form-urlencoded";
  const response = await apiHandler(async () => {
    let token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token && form) {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); throw new AppError("INVALID_INPUT", "Unsubscribe request is too large", 413); }
        chunks.push(value);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      token = new URLSearchParams(body).get("token") ?? undefined;
    }
    return jsonSuccess(await unsubscribeDigest(token ?? ""));
  });
  if (form && wantsHtml(request)) {
    return response.ok
      ? htmlPage("Ежедневная сводка отключена", "<p>Вы больше не подписаны на ежедневную сводку. При необходимости её можно снова включить в настройках.</p><a href=\"/settings\">Открыть настройки рассылки</a>")
      : browserError(response.status);
  }
  return response;
}
