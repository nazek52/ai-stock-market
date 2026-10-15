"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiResult } from "@/contracts";
import type { DemoScenarioResult } from "@/server/demo/scenario";

export function AlertScenario() {
  const requestId = useRef<string | null>(null);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DemoScenarioResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pending || !actionButton.current) return;
    const button = actionButton.current;
    actionButton.current = null;
    // Native disabled buttons can move focus to body. Respect a user who has
    // already moved to another control while the request was in flight.
    if (document.activeElement === document.body || document.activeElement === button) button.focus();
  }, [pending]);

  async function run(button: HTMLButtonElement) {
    if (pending || result) return;
    actionButton.current = button;
    requestId.current ??= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/demo/scenario", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current }) });
      const body = await response.json() as ApiResult<DemoScenarioResult>;
      if (!body.ok) {
        const messages: Record<string, string> = {
          FORBIDDEN: "Подтвердите email в Mailpit и проверьте параметры локального демо.",
          UNAUTHENTICATED: "Войдите в аккаунт, чтобы запустить сценарий.",
          CONFLICT: "Запуск ещё обрабатывается или требует проверки журнала. Повтор не отправляет новое письмо.",
          RATE_LIMITED: "Можно запускать не чаще одного нового сценария в минуту.",
        };
        setError(messages[body.error.code] ?? "Сценарий не завершён. Проверьте локальный журнал перед новым запуском.");
        return;
      }
      if (!response.ok || body.data.source !== "fixture") throw new Error("Invalid scenario result");
      setResult(body.data);
    } catch {
      setError("Ответ не получен. Повторить проверку можно с тем же идентификатором: новое письмо не создаётся.");
    } finally { setPending(false); }
  }

  return <Card className="min-w-0 max-w-3xl [overflow-wrap:anywhere]">
    <CardHeader>
      <CardTitle><h2 className="m-0 text-lg">Синтетическое пересечение порога</h2></CardTitle>
      <CardDescription>Только локальная демонстрация: временное правило AAPL «выше 100 USD», наблюдение 99 → 101 USD и одно письмо в Mailpit. Эти цены вымышлены. Ваши существующие правила не изменяются.</CardDescription>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-4">
      <p className="text-sm">Сначала подтвердите email по ссылке в Mailpit. Сценарий использует обычный движок правил, журнал событий и почтовый адаптер. Временное правило удаляется после обработки; история сохраняется.</p>
      <Button className="w-fit max-w-full" onClick={(event) => void run(event.currentTarget)} disabled={pending} aria-disabled={!!result} aria-describedby={error ? "alert-scenario-error" : result ? "alert-scenario-result" : undefined}>{pending ? "Выполняем…" : result ? "Сценарий завершён" : error ? "Проверить тот же запуск" : "Запустить 99 → 101 и отправить в Mailpit"}</Button>
      {pending && <p role="status">Проверяем переход и записываем результат доставки…</p>}
      {error && <p id="alert-scenario-error" role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <div id="alert-scenario-result" role="status" className="min-w-0 rounded-lg border border-border p-4 text-sm">
        <p>Источник: fixture. Цена: {result.fromPrice} → {result.toPrice} USD. Создано событий: {result.eventsCreated}. Временное правило удалено.</p>
        <p className="mt-2">{result.status === "sent" ? "Mailpit принял письмо. Внешнему адресату оно не доставляется." : `Статус доставки: ${result.status}. Успешная отправка не подтверждена; автоматического повтора нет.`}</p>
      </div>}
      <a href="http://127.0.0.1:8025" target="_blank" rel="noopener noreferrer" className="w-fit text-sm underline">Открыть локальный Mailpit</a>
    </CardContent>
  </Card>;
}
