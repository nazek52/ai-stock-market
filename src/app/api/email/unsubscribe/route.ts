import { randomBytes } from "node:crypto";
import { escapeHtml } from "@/server/notifications/render";
import { unsubscribeDigest, verifyUnsubscribeToken } from "@/server/digest/unsubscribe";
import { apiHandler, jsonSuccess, AppError } from "@/server/http";

export const runtime = "nodejs";

function htmlPage(title: string, content: string, status = 200) {
  const nonce = randomBytes(18).toString("base64");
  const icon = status >= 400
    ? '<path d="m10.3 3.8-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>'
    : title === "Ежедневная сводка отключена"
      ? '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
      : '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>';
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} — AI Stock Market</title><style nonce="${nonce}">
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;padding:clamp(20px,5vw,48px);background:#07090e;color:#edf2fa;font:1rem/1.7 "Segoe UI",Arial,sans-serif;overflow-wrap:anywhere}
main{max-width:42rem;margin:clamp(1rem,8vh,6rem) auto}.brand{display:inline-flex;align-items:center;gap:12px;margin-bottom:32px;color:#edf2fa;font-size:19px;font-weight:650;letter-spacing:-.5px;text-decoration:none}.brand small{font:inherit;color:#a2adbe}.brand-mark,.status-mark{display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#14233d;border:1px solid #273247;color:#9ab9e8}.brand-mark{width:40px;height:40px;border-radius:12px}
.panel{min-width:0;padding:clamp(24px,5vw,44px);border:1px solid #273247;border-radius:22px;background:linear-gradient(145deg,#111a29,#0e131d 65%);box-shadow:0 24px 80px #0005}.status-mark{width:64px;height:64px;margin-bottom:28px;border-radius:18px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:1.5px;color:#a2adbe}h1{margin:12px 0 18px;font-size:clamp(1.6rem,5vw,2.1rem);line-height:1.25;font-weight:600;letter-spacing:-.8px}p{margin:16px 0;color:#a2adbe;font-size:15px}form{margin:28px 0 12px}
button,a{font:inherit}button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;max-width:100%;padding:12px 18px;white-space:normal;background:#3d66a8;color:#edf2fa;border:1px solid #3d66a8;border-radius:11px;font-size:14px;font-weight:600;line-height:1.5;cursor:pointer}a{display:inline-block;min-height:44px;max-width:100%;padding:9px 0;color:#9ab9e8;font-size:14px;text-underline-offset:4px}button:hover{background:#486fac}button:focus-visible,a:focus-visible{outline:3px solid #9ab9e8;outline-offset:5px}.footer{margin-top:24px;font-size:12px;color:#a2adbe}
@media(max-width:380px){form button{width:100%}}
</style></head><body><main aria-labelledby="unsubscribe-title"><a class="brand" href="/" aria-label="Stock Market — обзор"><span class="brand-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M3 3v18h18M7 14l4-4 4 3 6-7"/></svg></span><span>Stock<small>Market</small>.</span></a><section class="panel"><div class="status-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">${icon}</svg></div><span class="eyebrow">НАСТРОЙКИ РАССЫЛКИ</span><h1 id="unsubscribe-title">${escapeHtml(title)}</h1>${content}</section><p class="footer">Stock Market · Управление уведомлениями</p></main></body></html>`, {
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
