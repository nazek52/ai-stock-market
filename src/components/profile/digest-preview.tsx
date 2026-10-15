"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiError, ApiResult } from "@/contracts";
import type { DeliveryResult } from "@/server/notifications/types";

type PreviewState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; result: DeliveryResult }
  | { kind: "error"; error: ApiError };

const skipReasons: Record<string, string> = {
  email_unverified: "Адрес email ещё не подтверждён.",
  digest_opted_out: "Ежедневная рассылка выключена в настройках.",
  preferences_missing: "Настройки рассылки ещё не созданы.",
  not_due: "Сегодня время отправки ещё не наступило.",
  wrong_local_date: "Дата не совпадает с локальной датой настроенного часового пояса.",
  preview: "Предпросмотр сформирован; письмо не отправлено.",
};

function errorText(error: ApiError) {
  switch (error.code) {
    case "UNAUTHENTICATED": return "Сессия истекла. Войдите снова, чтобы открыть предпросмотр.";
    case "RATE_LIMITED": return `Лимит предпросмотров исчерпан. ${error.retryAfterSeconds ? `Повторите примерно через ${error.retryAfterSeconds} с.` : "Попробуйте через несколько минут."}`;
    case "FORBIDDEN": return "Предпросмотр недоступен в этой среде.";
    case "SERVICE_UNAVAILABLE":
    case "UPSTREAM_UNAVAILABLE": return "Сервис сводки временно недоступен. Попробуйте позже.";
    default: return "Не удалось сформировать предпросмотр. Попробуйте ещё раз.";
  }
}

export function DigestPreview() {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);

  async function preview() {
    if (state.kind === "pending") return;
    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/email/digest/preview", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json() as ApiResult<DeliveryResult>;
      if (!body || typeof body !== "object" || typeof body.ok !== "boolean") throw new Error("Invalid preview response");
      if (!body.ok) {
        setState({ kind: "error", error: body.error });
        return;
      }
      if (!response.ok || !body.data || typeof body.data.status !== "string") throw new Error("Invalid preview result");
      setState({ kind: "ready", result: body.data });
    } catch {
      setState({ kind: "error", error: { code: "SERVICE_UNAVAILABLE", message: "Preview request failed" } });
    } finally {
      requestAnimationFrame(() => resultRef.current?.focus());
    }
  }

  return (
    <Card className="motion-enter min-w-0">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-accent-foreground" aria-hidden="true"><Eye size={20} strokeWidth={1.6} /></span><CardTitle><h2 className="m-0 text-lg">Предпросмотр сводки</h2></CardTitle></div>
        <CardDescription>Посмотрите письмо до отправки. Сначала сохраните согласие на рассылку выше. Предпросмотр ничего не отправляет; доступен в локальной разработке. Лимит: 3 попытки за 5 минут.</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <Button type="button" className="w-fit" onClick={() => void preview()} disabled={state.kind === "pending"}>
          {state.kind === "pending" ? "Формируем…" : "Сформировать предпросмотр"}
        </Button>
        {state.kind === "pending" && <p role="status" className="text-sm text-muted-foreground">Получаем новости и составляем сводку…</p>}
        {state.kind === "error" && <div ref={resultRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive"><p>{errorText(state.error)}</p>{state.error.code === "UNAUTHENTICATED" && <Link href="/login" className="mt-2 inline-flex font-semibold underline">Войти</Link>}</div>}
        {state.kind === "ready" && state.result.preview && <div ref={resultRef} tabIndex={-1} role="status" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold">Письмо не отправлено. Ниже текст предпросмотра.</p>
          <div className="min-w-0"><h3 className="text-sm font-semibold">Тема</h3><p className="mt-1 text-sm text-foreground [overflow-wrap:anywhere]">{state.result.preview.subject}</p></div>
          <div className="min-w-0"><h3 id="digest-preview-text-title" className="text-sm font-semibold">Текст письма</h3><pre role="region" tabIndex={0} aria-labelledby="digest-preview-text-title" className="mt-1 max-h-96 min-w-0 w-full max-w-full overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-sans text-sm text-foreground [overflow-wrap:anywhere]">{state.result.preview.text}</pre></div>
        </div>}
        {state.kind === "ready" && !state.result.preview && <div ref={resultRef} tabIndex={-1} role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{state.result.status === "skipped" ? `Предпросмотр пропущен. ${skipReasons[state.result.reason ?? ""] ?? `Причина: ${state.result.reason ?? "не указана"}.`}` : `Предпросмотр не сформирован. Статус: ${state.result.status}. Письмо не подтверждено как отправленное.`}</div>}
      </CardContent>
    </Card>
  );
}
