"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiError, ApiResult, StockQuote, WatchlistItem } from "@/contracts";

type ListState = { kind: "loading" } | { kind: "ready"; items: WatchlistItem[] } | { kind: "error"; error: ApiError };
type QuoteState = { kind: "ready"; quote: StockQuote; fixture: boolean } | { kind: "error"; error: ApiError };
type SortOrder = "newest" | "oldest" | "symbol" | "company";
type Message = { kind: "success" | "error"; text: string } | null;
const PAGE_SIZE = 10;

const networkError: ApiError = { code: "UPSTREAM_UNAVAILABLE", message: "Network request failed" };
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD" });
const signedMoney = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", signDisplay: "always" });
const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, signDisplay: "always" });
const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

function safeDate(value: string, withTime = false) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Время неизвестно" : (withTime ? dateTime : date).format(parsed);
}

async function readResult<T>(response: Response): Promise<ApiResult<T>> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("ok" in body) || typeof body.ok !== "boolean") throw new Error("Invalid API response");
  return body as ApiResult<T>;
}

async function readWatchlist(signal?: AbortSignal): Promise<WatchlistItem[]> {
  const response = await fetch("/api/watchlist", { cache: "no-store", credentials: "same-origin", signal });
  const result = await readResult<WatchlistItem[]>(response);
  if (!result.ok) throw result.error;
  if (!response.ok || !Array.isArray(result.data)) throw new Error("Invalid watchlist response");
  return result.data;
}

async function readQuote(symbol: string, signal: AbortSignal): Promise<QuoteState> {
  try {
    const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/quote`, { cache: "no-store", credentials: "same-origin", signal });
    const fixture = response.headers.get("X-Market-Data-Mode") === "fixture";
    const result = await readResult<StockQuote>(response);
    if (!result.ok) return { kind: "error", error: result.error };
    if (!response.ok || !result.data || typeof result.data.price !== "number") throw new Error("Invalid quote response");
    return { kind: "ready", quote: result.data, fixture: fixture || result.data.source === "fixture" };
  } catch {
    return { kind: "error", error: networkError };
  }
}

function apiError(error: unknown): ApiError {
  return error && typeof error === "object" && "code" in error ? error as ApiError : networkError;
}

function errorText(error: ApiError, subject: string) {
  switch (error.code) {
    case "UNAUTHENTICATED": return `Сессия истекла. Войдите снова, чтобы ${subject}.`;
    case "RATE_LIMITED": return `Лимит запросов исчерпан. ${error.retryAfterSeconds ? `Повторите примерно через ${error.retryAfterSeconds} с.` : "Попробуйте позже."}`;
    case "SERVICE_UNAVAILABLE":
    case "UPSTREAM_UNAVAILABLE": return "Сервис временно недоступен. Попробуйте позже.";
    default: return "Не удалось выполнить запрос. Попробуйте ещё раз.";
  }
}

function QuoteCell({ state }: { state?: QuoteState }) {
  if (!state) return <p role="status" className="text-sm text-muted-foreground">Загружаем котировку…</p>;
  if (state.kind === "error") {
    return <div className="text-sm text-muted-foreground"><p>{state.error.code === "RATE_LIMITED" ? "Лимит котировок исчерпан" : state.error.code === "UNAUTHENTICATED" ? "Нужен повторный вход" : "Котировка недоступна"}</p><p>Цена и изменение не показаны.</p></div>;
  }
  const { quote, fixture } = state;
  return <div className="text-sm">
    <p className="text-lg font-semibold text-foreground">{money.format(quote.price)}</p>
    <p className="text-muted-foreground">Изменение: {quote.change === null ? "нет данных" : signedMoney.format(quote.change)}{quote.changePercent === null ? "" : ` (${percent.format(quote.changePercent)} %)`}</p>
    <p className="mt-1 text-xs text-muted-foreground">{fixture ? "Синтетические тестовые данные" : "Источник: Finnhub"} · время котировки: {safeDate(quote.observedAt, true)} · получено: {safeDate(quote.fetchedAt, true)}</p>
  </div>;
}

export function Watchlist() {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [sort, setSort] = useState<SortOrder>("newest");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    const controller = new AbortController();
    readWatchlist(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setPage((current) => Math.min(current, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1)));
        setList({ kind: "ready", items });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setList({ kind: "error", error: apiError(error) }); });
    return () => controller.abort();
  }, [revision]);

  const sortedItems = useMemo(() => {
    if (list.kind !== "ready") return [];
    return [...list.items].sort((a, b) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt) || a.symbol.localeCompare(b.symbol);
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt) || a.symbol.localeCompare(b.symbol);
      if (sort === "company") return a.companyName.localeCompare(b.companyName, "ru") || a.symbol.localeCompare(b.symbol);
      return a.symbol.localeCompare(b.symbol);
    });
  }, [list, sort]);
  const visibleItems = useMemo(() => sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sortedItems, page]);
  const pageCount = Math.ceil(sortedItems.length / PAGE_SIZE);

  useEffect(() => {
    if (list.kind !== "ready") return;
    const controller = new AbortController();
    // Only the visible page requests quotes. The market API has a shared app-wide quota.
    const missing = visibleItems.filter((item) => !quotes[item.symbol]);
    let cursor = 0;
    async function worker() {
      while (!controller.signal.aborted && cursor < missing.length) {
        const item = missing[cursor++];
        if (!item) break;
        const quote = await readQuote(item.symbol, controller.signal);
        if (!controller.signal.aborted) setQuotes((current) => ({ ...current, [item.symbol]: quote }));
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => controller.abort();
    // Quotes are retained across sorting and deletion; a manual refresh clears them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, visibleItems]);

  function refresh() {
    if (pendingDelete) return;
    setMessage(null);
    setQuotes({});
    setList({ kind: "loading" });
    setRevision((value) => value + 1);
  }

  async function remove(symbol: string) {
    if (pendingDelete || list.kind !== "ready") return;
    setPendingDelete(symbol);
    setMessage(null);
    let deleteAccepted = false;
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
      const result = await readResult<{ deleted: boolean }>(response);
      if (!result.ok) throw result.error;
      if (!response.ok || typeof result.data.deleted !== "boolean") throw new Error("Invalid delete response");
      deleteAccepted = true;
      // The DELETE response alone does not update the screen; confirm the list from the server.
      const items = await readWatchlist();
      setList({ kind: "ready", items });
      setPage((current) => Math.min(current, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1)));
      setQuotes((current) => Object.fromEntries(Object.entries(current).filter(([key]) => items.some((item) => item.symbol === key))));
      setMessage({ kind: "success", text: result.data.deleted ? `${symbol} удалён из списка.` : `${symbol} уже отсутствует в списке.` });
    } catch (error) {
      setMessage({ kind: "error", text: errorText(apiError(error), "изменить список") });
      // A failed DELETE leaves the confirmed list intact. A failed confirmation GET does not.
      if (deleteAccepted) setList({ kind: "error", error: apiError(error) });
    } finally {
      setPendingDelete(null);
    }
  }

  return <div className="grid gap-5">
    {message && <div role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-4 text-sm ${message.kind === "error" ? "border-destructive text-destructive" : "border-border bg-muted text-foreground"}`}>{message.text}</div>}
    {list.kind === "loading" && <p role="status">Загружаем список…</p>}
    {list.kind === "error" && <Card><CardContent className="grid gap-4"><p role="alert" className="text-sm">{errorText(list.error, "открыть список")}</p><div className="flex flex-wrap gap-3">{list.error.code === "UNAUTHENTICATED" && <Link className="button button-primary" href="/login">Войти</Link>}<Button type="button" variant="outline" onClick={refresh}>Повторить</Button></div></CardContent></Card>}
    {list.kind === "ready" && list.items.length === 0 && <Card><CardContent className="grid gap-4"><p>В вашем списке пока нет акций.</p><Link className="button button-primary w-fit" href="/search">Найти акцию</Link></CardContent></Card>}
    {list.kind === "ready" && list.items.length > 0 && <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">Акций в списке: {list.items.length}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="watchlist-sort" className="block text-sm font-medium">Сортировка</label><select id="watchlist-sort" value={sort} onChange={(event) => { setSort(event.target.value as SortOrder); setPage(0); }} className="mt-1 min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="symbol">По тикеру</option><option value="company">По компании</option></select></div>
          <Button type="button" variant="outline" onClick={refresh} disabled={!!pendingDelete}>Обновить котировки</Button>
        </div>
      </div>
      <ul className="grid gap-4">
        {visibleItems.map((item) => <li key={item.id}>
          <Card>
            <CardHeader className="gap-1">
              <CardTitle><h2 className="m-0 text-base"><Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="text-primary underline-offset-4 hover:underline">{item.symbol}</Link> · {item.companyName}</h2></CardTitle>
              <p className="text-xs text-muted-foreground">Добавлено <time dateTime={item.createdAt}>{safeDate(item.createdAt)}</time></p>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <QuoteCell state={quotes[item.symbol]} />
              <Button type="button" variant="outline" disabled={!!pendingDelete} onClick={() => void remove(item.symbol)} aria-label={`Удалить ${item.symbol} из списка`}>{pendingDelete === item.symbol ? "Удаляем…" : "Удалить"}</Button>
            </CardContent>
          </Card>
        </li>)}
      </ul>
      {pageCount > 1 && <nav aria-label="Страницы списка" className="flex items-center justify-between gap-3"><Button type="button" variant="outline" disabled={page === 0 || !!pendingDelete} onClick={() => setPage((value) => value - 1)}>Назад</Button><span className="text-sm text-muted-foreground">Страница {page + 1} из {pageCount}</span><Button type="button" variant="outline" disabled={page + 1 >= pageCount || !!pendingDelete} onClick={() => setPage((value) => value + 1)}>Вперёд</Button></nav>}
    </>}
  </div>;
}
