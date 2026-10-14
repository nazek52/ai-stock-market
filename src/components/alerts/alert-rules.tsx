"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { priceAlertCreateSchema, priceAlertUpdateSchema, type ApiError, type ApiResult, type PriceAlertRule } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type List = { state: "loading" } | { state: "ready"; rules: PriceAlertRule[] } | { state: "error"; error: unknown };
type Notice = { kind: "success" | "error"; text: string; login?: boolean } | null;
type Form = { symbol: string; type: "price_above" | "price_below"; threshold: string; cooldownMinutes: string };
const blank: Form = { symbol: "", type: "price_above", threshold: "", cooldownMinutes: "60" };
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD" });
const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

class ApiFailure extends Error {
  constructor(public detail: ApiError) { super(detail.message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("ok" in body) || typeof body.ok !== "boolean") throw new Error("Invalid API response");
  const result = body as ApiResult<T>;
  if (!result.ok) throw new ApiFailure(result.error);
  if (!response.ok) throw new Error("Unexpected API status");
  return result.data;
}

async function readRules(signal?: AbortSignal): Promise<PriceAlertRule[]> {
  const rules = await request<PriceAlertRule[]>("/api/alerts", { signal });
  if (!Array.isArray(rules)) throw new Error("Invalid alert list");
  return rules;
}

function explain(error: unknown): Notice {
  if (error instanceof ApiFailure) {
    switch (error.detail.code) {
      case "UNAUTHENTICATED": return { kind: "error", text: "Сессия истекла. Войдите снова, чтобы управлять правилами.", login: true };
      case "INVALID_INPUT": return { kind: "error", text: "Проверьте заполненные поля." };
      case "CONFLICT": return { kind: "error", text: "Правило уже существует или достигнут лимит правил." };
      case "NOT_FOUND": return { kind: "error", text: "Правило больше не найдено. Обновите список." };
      case "RATE_LIMITED": return { kind: "error", text: `Лимит запросов исчерпан. ${error.detail.retryAfterSeconds ? `Повторите примерно через ${error.detail.retryAfterSeconds} с.` : "Попробуйте позже."}` };
      case "SERVICE_UNAVAILABLE":
      case "UPSTREAM_UNAVAILABLE": return { kind: "error", text: "Сервис временно недоступен. Попробуйте позже." };
      default: return { kind: "error", text: "Не удалось выполнить запрос. Попробуйте ещё раз." };
    }
  }
  return { kind: "error", text: "Не удалось связаться с сервером. Проверьте соединение и повторите попытку." };
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div role={notice.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${notice.kind === "error" ? "border-destructive text-destructive" : "border-border bg-muted text-foreground"}`}>
    {notice.text} {notice.login && <Link href="/login" className="font-semibold underline">Войти</Link>}
  </div>;
}

function displayDate(value: string | null) {
  if (!value) return "Пока не срабатывало";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Время неизвестно" : dateTime.format(date);
}

function fieldError(field: string) {
  switch (field) {
    case "symbol": return "Укажите тикер акции США, например AAPL или BRK.B.";
    case "threshold": return "Укажите цену больше 0 и не выше 1 000 000 USD.";
    case "cooldownMinutes": return "Укажите целое число минут от 5 до 10 080.";
    case "type": return "Выберите условие изменения цены.";
    default: return "Проверьте значение поля.";
  }
}

export function AlertRules() {
  const [list, setList] = useState<List>({ state: "loading" });
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    readRules(controller.signal)
      .then((rules) => { if (!controller.signal.aborted) setList({ state: "ready", rules }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setList({ state: "error", error }); });
    return () => controller.abort();
  }, [revision]);

  function refresh() {
    if (pending) return;
    setNotice(null);
    setList({ state: "loading" });
    setRevision((value) => value + 1);
  }

  function change(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setNotice(null);
  }

  function edit(rule: PriceAlertRule) {
    if (pending) return;
    setEditing(rule.id);
    setForm({ symbol: rule.symbol, type: rule.type, threshold: String(rule.threshold), cooldownMinutes: String(rule.cooldownMinutes) });
    setErrors({});
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLSelectElement>("[name=type]")?.focus());
  }

  function cancelEdit() {
    if (pending) return;
    setEditing(null);
    setForm(blank);
    setErrors({});
  }

  async function mutate<T>(action: () => Promise<T>, success: string, confirmed: (result: T, rules: PriceAlertRule[]) => boolean): Promise<boolean> {
    let accepted = false;
    try {
      const result = await action();
      accepted = true;
      const rules = await readRules();
      if (!confirmed(result, rules)) throw new Error("Mutation not reflected in alert list");
      setList({ state: "ready", rules });
      setNotice({ kind: "success", text: success });
      return true;
    } catch (error) {
      if (accepted) {
        setList({ state: "error", error });
        setNotice({ kind: "error", text: "Изменение принято, но текущее состояние не подтверждено. Обновите список." });
      } else {
        setNotice(explain(error));
        if (error instanceof ApiFailure && error.detail.code === "INVALID_INPUT") {
          setErrors(Object.fromEntries(Object.keys(error.detail.fields ?? {}).map((field) => [field, fieldError(field)])));
        }
      }
      return false;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || list.state !== "ready") return;
    const threshold = form.threshold.trim() === "" ? NaN : Number(form.threshold);
    const cooldownMinutes = form.cooldownMinutes.trim() === "" ? NaN : Number(form.cooldownMinutes);
    const parsed = editing
      ? priceAlertUpdateSchema.safeParse({ type: form.type, threshold, cooldownMinutes })
      : priceAlertCreateSchema.safeParse({ symbol: form.symbol.trim().toUpperCase(), type: form.type, threshold, currency: "USD", cooldownMinutes });
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? "form");
        return [field, fieldError(field)];
      }));
      setErrors(fieldErrors);
      setNotice({ kind: "error", text: "Проверьте поля правила." });
      const first = Object.keys(fieldErrors)[0];
      if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setPending(editing ?? "new");
    setNotice(null);
    const url = editing ? `/api/alerts/${encodeURIComponent(editing)}` : "/api/alerts";
    const succeeded = await mutate(
      () => request<PriceAlertRule>(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }),
      editing ? "Правило обновлено." : "Правило создано.",
      (result, rules) => typeof result.id === "string" && rules.some((rule) => rule.id === result.id && rule.type === parsed.data.type && rule.threshold === parsed.data.threshold && rule.cooldownMinutes === parsed.data.cooldownMinutes),
    );
    if (succeeded) {
      setEditing(null);
      setForm(blank);
      setErrors({});
    }
    setPending(null);
  }

  async function toggle(rule: PriceAlertRule) {
    if (pending || list.state !== "ready") return;
    const next = rule.status === "active" ? "paused" : "active";
    setPending(rule.id);
    setNotice(null);
    await mutate(
      () => request<PriceAlertRule>(`/api/alerts/${encodeURIComponent(rule.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }),
      `${rule.symbol}: правило ${next === "paused" ? "приостановлено" : "возобновлено"}.`,
      (_result, rules) => rules.some((item) => item.id === rule.id && item.status === next),
    );
    setPending(null);
  }

  async function remove(rule: PriceAlertRule) {
    if (pending || list.state !== "ready" || confirmDelete !== rule.id) return;
    setPending(rule.id);
    setNotice(null);
    const succeeded = await mutate(async () => {
      const result = await request<{ deleted: boolean }>(`/api/alerts/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      if (result.deleted !== true) throw new Error("Alert deletion was not confirmed");
      return result;
    }, `${rule.symbol}: правило удалено.`, (_result, rules) => !rules.some((item) => item.id === rule.id));
    if (succeeded) {
      setConfirmDelete(null);
      if (editing === rule.id) {
        setEditing(null);
        setForm(blank);
      }
    }
    setPending(null);
  }

  return <div className="grid gap-6">
    <Card><CardContent className="grid gap-2 text-sm text-muted-foreground">
      <p>Проверка цены выполняется периодически. Частота и задержка зависят от источника данных; до их подтверждения время доставки письма неизвестно.</p>
      <p>Пауза между письмами ограничивает повторы и не задаёт частоту проверки.</p>
    </CardContent></Card>
    <NoticeBox notice={notice} />
    {list.state === "loading" && <p role="status">Загружаем правила…</p>}
    {list.state === "error" && <Card><CardContent className="grid gap-3"><NoticeBox notice={explain(list.error)} /><Button type="button" variant="outline" className="w-fit" onClick={refresh}>Повторить загрузку</Button></CardContent></Card>}
    {list.state === "ready" && <>
      <Card><CardHeader><CardTitle><h2 className="m-0 text-lg">{editing ? "Изменить правило" : "Создать правило"}</h2></CardTitle></CardHeader><CardContent>
        <form ref={formRef} onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div><label htmlFor="alert-symbol" className="text-sm font-medium">Тикер акции</label><input id="alert-symbol" name="symbol" className={fieldClass} value={form.symbol} onChange={(event) => change("symbol", event.target.value)} placeholder="AAPL" autoComplete="off" disabled={!!editing || !!pending} aria-invalid={!!errors.symbol} aria-describedby={errors.symbol ? "alert-symbol-error" : undefined} />{errors.symbol && <p id="alert-symbol-error" className="mt-1 text-sm text-destructive">{errors.symbol}</p>}</div>
          <div><label htmlFor="alert-type" className="text-sm font-medium">Условие</label><select id="alert-type" name="type" className={fieldClass} value={form.type} onChange={(event) => change("type", event.target.value)} disabled={!!pending}><option value="price_above">Цена выше порога</option><option value="price_below">Цена ниже порога</option></select></div>
          <div><label htmlFor="alert-threshold" className="text-sm font-medium">Цена, USD</label><input id="alert-threshold" name="threshold" type="number" min="0.000001" max="1000000" step="any" inputMode="decimal" className={fieldClass} value={form.threshold} onChange={(event) => change("threshold", event.target.value)} disabled={!!pending} aria-invalid={!!errors.threshold} aria-describedby={errors.threshold ? "alert-threshold-error" : undefined} />{errors.threshold && <p id="alert-threshold-error" className="mt-1 text-sm text-destructive">{errors.threshold}</p>}</div>
          <div><label htmlFor="alert-cooldown" className="text-sm font-medium">Пауза между письмами, минут</label><input id="alert-cooldown" name="cooldownMinutes" type="number" min="5" max="10080" step="1" className={fieldClass} value={form.cooldownMinutes} onChange={(event) => change("cooldownMinutes", event.target.value)} disabled={!!pending} aria-invalid={!!errors.cooldownMinutes} aria-describedby={errors.cooldownMinutes ? "alert-cooldown-error" : "alert-cooldown-help"} /><p id="alert-cooldown-help" className="mt-1 text-xs text-muted-foreground">От 5 минут до 7 дней; по умолчанию 60 минут.</p>{errors.cooldownMinutes && <p id="alert-cooldown-error" className="mt-1 text-sm text-destructive">{errors.cooldownMinutes}</p>}</div>
          <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={!!pending}>{pending === (editing ?? "new") ? "Сохраняем…" : editing ? "Сохранить изменения" : "Создать правило"}</Button>{editing && <Button type="button" variant="outline" onClick={cancelEdit} disabled={!!pending}>Отмена</Button>}</div>
        </form>
      </CardContent></Card>
      <section aria-labelledby="alerts-list-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="alerts-list-heading" className="font-heading text-xl">Мои правила ({list.rules.length})</h2><Button type="button" variant="outline" onClick={refresh} disabled={!!pending}>Обновить</Button></div>
        {list.rules.length === 0 && <Card><CardContent><p>Правил пока нет. Создайте первое правило выше.</p></CardContent></Card>}
        <ul className="grid gap-4">{list.rules.map((rule) => <li key={rule.id}><Card>
          <CardHeader><CardTitle><h3 className="m-0 text-base"><Link href={`/stocks/${encodeURIComponent(rule.symbol)}`} className="text-primary underline-offset-4 hover:underline">{rule.symbol}</Link> · {rule.type === "price_above" ? "выше" : "ниже"} {money.format(rule.threshold)}</h3></CardTitle><p className="text-sm text-muted-foreground">{rule.status === "active" ? "Включено" : "Приостановлено"} · повторное письмо не раньше чем через {rule.cooldownMinutes} мин.</p></CardHeader>
          <CardContent className="grid gap-3"><p className="text-xs text-muted-foreground">Последнее срабатывание: {displayDate(rule.lastTriggeredAt)}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => edit(rule)} disabled={!!pending}>Изменить</Button><Button type="button" variant="outline" onClick={() => void toggle(rule)} disabled={!!pending}>{pending === rule.id ? "Сохраняем…" : rule.status === "active" ? "Приостановить" : "Возобновить"}</Button><Button type="button" variant="destructive" onClick={() => setConfirmDelete(rule.id)} disabled={!!pending}>Удалить</Button></div>
            {confirmDelete === rule.id && <div className="grid gap-2 rounded-lg border border-destructive p-3"><p>Удалить правило для {rule.symbol}? Это действие нельзя отменить.</p><div className="flex gap-2"><Button type="button" variant="destructive" onClick={() => void remove(rule)} disabled={!!pending}>{pending === rule.id ? "Удаляем…" : "Подтвердить удаление"}</Button><Button type="button" variant="outline" onClick={() => setConfirmDelete(null)} disabled={!!pending}>Отмена</Button></div></div>}
          </CardContent>
        </Card></li>)}</ul>
      </section>
    </>}
  </div>;
}
