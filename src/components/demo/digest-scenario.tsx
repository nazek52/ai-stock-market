"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiResult, DigestPreference } from "@/contracts";
import type { DemoDigestResult } from "@/server/demo/digest";

const reasons: Record<string, string> = {
  email_unverified: "Сначала подтвердите email по ссылке из Mailpit.",
  digest_opted_out: "Рассылка отключена. Письмо не отправлено.",
  preferences_missing: "Сначала сохраните настройки ежедневной сводки.",
};

export function DigestScenario() {
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DemoDigestResult | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (pending || !actionButton.current) return;
    const button = actionButton.current;
    actionButton.current = null;
    if (document.activeElement === document.body || document.activeElement === button) button.focus();
  }, [pending]);

  async function send(button: HTMLButtonElement) {
    if (pending) return;
    actionButton.current = button;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/demo/digest", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json() as ApiResult<DemoDigestResult>;
      if (!body.ok || !response.ok) {
        setError(!body.ok && body.error.code === "UNAUTHENTICATED" ? "Войдите в аккаунт снова."
          : !body.ok && body.error.code === "RATE_LIMITED" ? "Лимит ручных проверок: 10 за 5 минут. Повторите позже."
            : "Не удалось проверить выпуск. Проверьте локальные сервисы и параметры демо.");
        return;
      }
      setResult(body.data);
    } catch { setError("Ответ не получен. Повторная проверка использует тот же дневной выпуск и не создаёт дубликат."); }
    finally { setPending(false); }
  }

  async function optOut(button: HTMLButtonElement) {
    if (pending) return;
    actionButton.current = button;
    setPending(true); setError(""); setNotice("");
    try {
      const currentResponse = await fetch("/api/preferences/digest", { credentials: "same-origin", cache: "no-store" });
      const current = await currentResponse.json() as ApiResult<DigestPreference>;
      if (!currentResponse.ok || !current.ok) throw new Error("Preferences unavailable");
      const response = await fetch("/api/preferences/digest", { method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false, timezone: current.data.timezone, localTime: current.data.localTime }) });
      const body = await response.json() as ApiResult<DigestPreference>;
      if (!response.ok || !body.ok || body.data.enabled) throw new Error("Opt-out was not confirmed");
      setResult(null);
      setNotice("Рассылка отключена. Нажмите отправку ещё раз: результат должен быть «пропущено», без нового письма.");
    } catch { setError("Не удалось подтвердить отключение. Проверьте настройки рассылки."); }
    finally { setPending(false); }
  }

  function resultText(value: DemoDigestResult) {
    if (value.status === "sent") return "Mailpit принял сегодняшний выпуск. Это отправка письма, а не preview.";
    if (value.status === "duplicate") return "Сегодняшний выпуск уже отправлен. Повтор не создаёт нового письма.";
    if (value.status === "skipped") return `Выпуск пропущен. ${reasons[value.reason ?? ""] ?? "Письмо не отправлено."}`;
    if (value.status === "processing") return "Выпуск обрабатывается. Повторите проверку состояния; второго письма не будет.";
    return "Результат SMTP не определён. Автоматической повторной отправки нет; проверьте Mailpit и локальный журнал.";
  }

  return <Card className="min-w-0 h-full [overflow-wrap:anywhere]">
    <CardHeader><div className="widget-heading"><span className="widget-icon"><Mail size={17} strokeWidth={1.6} aria-hidden="true" /></span><CardTitle><h2 className="m-0 text-base">Ежедневная сводка в Mailpit</h2></CardTitle></div>
      <CardDescription>Синтетические новости и детерминированная сводка без обращения к LLM. Один выпуск на вашу локальную дату; повтор не создаёт второго письма. Глобальное расписание остаётся выключенным.</CardDescription>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-4">
      <p className="text-sm">Подтвердите email и явно включите согласие в <Link href="/settings" className="underline">настройках рассылки</Link>. Ручной запуск пропускает ожидание выбранного времени, сохраняя согласие и дневной ключ.</p>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Button onClick={(event) => void send(event.currentTarget)} disabled={pending} aria-describedby="digest-scenario-feedback">{pending ? "Проверяем…" : "Отправить ежедневную сводку в Mailpit"}</Button>
        <Button variant="outline" onClick={(event) => void optOut(event.currentTarget)} disabled={pending} aria-describedby="digest-scenario-feedback">Отключить ежедневную сводку</Button>
      </div>
      <div id="digest-scenario-feedback" className="grid min-w-0 gap-3">
      {pending && <p role="status" className="text-sm">Обрабатываем запрос…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {result && <div role="status" className="rounded-lg border border-border p-4 text-sm"><p>{resultText(result)}</p><p className="mt-2">Источник: fixture. Дата выпуска: {result.localDate ?? "не определена"}. Статус: {result.status}.</p></div>}
      </div>
      <p className="text-sm">Проверьте также ссылку «Отключить ежедневную сводку» внутри письма: открытие показывает подтверждение, а кнопка на этой странице отключает рассылку.</p>
      <a href="http://127.0.0.1:8025" target="_blank" rel="noopener noreferrer" className="w-fit text-sm underline">Открыть локальный Mailpit</a>
    </CardContent>
  </Card>;
}
