import { escapeHtml } from "@/server/notifications/render";
import { unsubscribeDigest, verifyUnsubscribeToken } from "@/server/digest/unsubscribe";
import { apiHandler, jsonSuccess, AppError } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    verifyUnsubscribeToken(token);
    // GET is deliberately read-only: link scanners cannot change consent.
    return new Response(`<!doctype html><html lang="ru"><meta name="referrer" content="no-referrer"><title>Отключение сводки</title><body><h1>Отключить ежедневную сводку?</h1><form method="post" action="/api/email/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Отключить</button></form></body></html>`, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'" },
    });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    let token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token && request.headers.get("content-type")?.split(";")[0] === "application/x-www-form-urlencoded") {
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
}
