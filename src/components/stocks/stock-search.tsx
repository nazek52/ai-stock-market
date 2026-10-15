"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Check, LoaderCircle, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApiError, ApiResult, StockSearchResult, WatchlistItem } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; results: StockSearchResult[]; mode: "fixture" | "finnhub" | "unknown" }
  | { status: "error"; query: string; error: ApiError | { code: "NETWORK_ERROR" } };
type WatchlistState =
  | { status: "loading" }
  | { status: "ready"; symbols: ReadonlySet<string> }
  | { status: "unauthenticated" }
  | { status: "error" };

function watchlistErrorMessage(error: ApiError): string {
  switch (error.code) {
    case "CONFLICT": return "Список заполнен: можно сохранить не более 50 акций.";
    case "RATE_LIMITED": return "Слишком много изменений списка. Повторите позже.";
    case "UPSTREAM_UNAVAILABLE": return "Не удалось проверить акцию у поставщика данных. Повторите позже.";
    case "INVALID_INPUT": return "Сервер не принял тикер этой акции.";
    default: return "Не удалось изменить список. Попробуйте ещё раз.";
  }
}

export function StockSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const actionFeedback = useRef<HTMLParagraphElement>(null);
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [watchlist, setWatchlist] = useState<WatchlistState>({ status: "loading" });
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ symbol: string; message: string } | null>(null);
  const [actionNotice, setActionNotice] = useState<{ symbol: string; message: string } | null>(null);
  const search = query.trim();

  useEffect(() => {
    if (pendingSymbol || !actionButton.current) return;
    const button = actionButton.current;
    actionButton.current = null;
    if (document.activeElement !== document.body && document.activeElement !== button) return;
    if (button.isConnected && !button.disabled) button.focus();
    else actionFeedback.current?.focus();
  }, [pendingSymbol]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadWatchlist() {
      try {
        const response = await fetch("/api/watchlist", { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as ApiResult<WatchlistItem[]>;
        if (controller.signal.aborted) return;
        if (!payload.ok) {
          setWatchlist({ status: payload.error.code === "UNAUTHENTICATED" ? "unauthenticated" : "error" });
        } else if (Array.isArray(payload.data)) {
          setWatchlist({ status: "ready", symbols: new Set(payload.data.map((item) => item.symbol)) });
        } else {
          setWatchlist({ status: "error" });
        }
      } catch {
        if (!controller.signal.aborted) setWatchlist({ status: "error" });
      }
    }
    void loadWatchlist();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!search) return;

    const controller = new AbortController();
    let current = true;
    const timeout = window.setTimeout(async () => {
      setState({ status: "loading", query: search });
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json() as ApiResult<StockSearchResult[]>;
        if (!current) return;
        if (!payload.ok) {
          setState({ status: "error", query: search, error: payload.error });
          return;
        }
        if (!Array.isArray(payload.data)) throw new Error("Unexpected search response");
        const source = response.headers.get("X-Market-Data-Mode");
        const mode = source === "fixture" || source === "finnhub" ? source : "unknown";
        setState({ status: "ready", query: search, results: payload.data, mode });
      } catch {
        if (current && !controller.signal.aborted) {
          setState({ status: "error", query: search, error: { code: "NETWORK_ERROR" } });
        }
      }
    }, 350);

    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [search, retry]);

  const display = state.status !== "idle" && state.query === search ? state : { status: "idle" } as const;

  async function toggleWatchlist(symbol: string, button: HTMLButtonElement) {
    if (watchlist.status !== "ready" || pendingSymbol) return;
    actionButton.current = button;
    const wasSaved = watchlist.symbols.has(symbol);
    setPendingSymbol(symbol);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(wasSaved ? `/api/watchlist/${encodeURIComponent(symbol)}` : "/api/watchlist", {
        method: wasSaved ? "DELETE" : "POST",
        cache: "no-store",
        ...(wasSaved ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) }),
      });
      const payload = await response.json() as ApiResult<WatchlistItem | { deleted: boolean }>;
      if (!payload.ok) {
        if (payload.error.code === "UNAUTHENTICATED") {
          setWatchlist({ status: "unauthenticated" });
          setActionError({ symbol, message: "Сессия истекла. Войдите снова, чтобы управлять списком." });
        } else {
          setActionError({ symbol, message: watchlistErrorMessage(payload.error) });
        }
        return;
      }
      if (!response.ok || typeof payload.data !== "object" || payload.data === null ||
        (wasSaved ? !("deleted" in payload.data && typeof payload.data.deleted === "boolean")
          : !("symbol" in payload.data && payload.data.symbol === symbol))) {
        throw new Error("Unexpected watchlist mutation response");
      }
      setWatchlist((current) => {
        if (current.status !== "ready") return current;
        const symbols = new Set(current.symbols);
        if (wasSaved) symbols.delete(symbol);
        else symbols.add(symbol);
        return { status: "ready", symbols };
      });
      setActionNotice({ symbol, message: wasSaved ? `${symbol} удалён из списка.` : `${symbol} добавлен в список.` });
    } catch {
      setWatchlist({ status: "error" });
      setActionError({ symbol, message: "Изменение могло сохраниться. Обновите страницу, чтобы проверить список перед следующей попыткой." });
    } finally {
      setPendingSymbol(null);
    }
  }

  return (
    <div className="motion-enter grid min-w-0 max-w-5xl gap-6">
      <Card className="min-w-0 [overflow-wrap:anywhere]">
        <CardHeader>
          <span className="section-kicker">КАТАЛОГ ИНСТРУМЕНТОВ</span>
          <CardTitle><h2 className="m-0 text-xl">Какую компанию ищем?</h2></CardTitle>
          <CardDescription>Поиск акций США по тикеру или названию. Результаты предоставляет серверный рыночный источник.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="stock-search" className="text-sm font-medium">Тикер или название компании</label>
              <div className="relative mt-2"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input
                id="stock-search"
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActionError(null); }}
                maxLength={80}
                autoComplete="off"
                placeholder="Например, AAPL или Apple"
                aria-controls="stock-search-results"
                className="min-h-14 w-full rounded-xl border border-input bg-background py-3 pl-12 pr-4 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              /></div>
            </div>
            {query && <Button type="button" variant="outline" size="lg" onClick={() => { setQuery(""); setActionError(null); inputRef.current?.focus(); }}>Очистить</Button>}
          </div>
        </CardContent>
      </Card>

      <p id="stock-search-action-feedback" ref={actionFeedback} tabIndex={-1} role={actionError ? "alert" : "status"} className={`text-sm ${actionError ? "text-destructive" : "text-muted-foreground"}`}>{actionError?.message ?? actionNotice?.message}</p>

      <section id="stock-search-results" aria-labelledby="stock-search-results-title" className="min-w-0 [overflow-wrap:anywhere]" aria-busy={!!search && (display.status === "idle" || display.status === "loading")}>
        <h2 id="stock-search-results-title" className="mb-3 text-lg font-semibold">Результаты поиска</h2>
        {watchlist.status === "loading" && <p role="status" className="mb-3 text-sm text-muted-foreground">Загружаем ваш список отслеживания…</p>}
        {watchlist.status === "unauthenticated" && <p role="status" className="mb-3 text-sm text-muted-foreground">Чтобы сохранять акции, <Link href="/login" className="font-semibold text-accent-foreground underline">войдите в аккаунт</Link>.</p>}
        {watchlist.status === "error" && <p role="alert" className="mb-3 text-sm text-destructive">Не удалось загрузить список отслеживания. Обновите страницу, чтобы повторить.</p>}
        {!search ? (
          <Card><CardContent><div className="empty-state"><Search aria-hidden="true" className="mb-1 size-8 text-accent-foreground" /><h3 className="text-base font-semibold text-foreground">Найдите следующий инструмент</h3><p className="mt-2">Начните с тикера или названия: например, AAPL или Apple.</p></div></CardContent></Card>
        ) : display.status === "idle" || display.status === "loading" ? (
          <Card><CardContent><div role="status" className="flex items-center gap-3 py-8 text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />Ищем акции…</div><div aria-hidden="true" className="grid gap-3"><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /></div></CardContent></Card>
        ) : display.status === "error" ? (
          <Card><CardContent className="grid gap-3">
            <p role="alert">{display.error.code === "UNAUTHENTICATED"
              ? "Чтобы искать акции, войдите в аккаунт."
              : display.error.code === "RATE_LIMITED"
                ? `Лимит запросов исчерпан. Повторите поиск позже${display.error.retryAfterSeconds ? ` (примерно через ${display.error.retryAfterSeconds} с)` : ""}.`
                : display.error.code === "INVALID_INPUT"
                  ? "Проверьте запрос: введите от 1 до 80 символов."
                  : "Сейчас поиск недоступен. Попробуйте позже."}</p>
            {display.error.code === "UNAUTHENTICATED" ? (
              <Link className="text-sm font-semibold text-accent-foreground underline" href="/login">Войти</Link>
            ) : (
              <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить поиск</Button>
            )}
          </CardContent></Card>
        ) : (
          <>
            <p role="status" className="mb-3 text-sm text-muted-foreground">
              {display.mode === "fixture" ? "Демонстрационные данные · " : display.mode === "finnhub" ? "Источник: Finnhub · " : "Источник не указан · "}
              Найдено: {display.results.length}
            </p>
            {display.results.length === 0 ? (
              <Card><CardContent><div className="empty-state"><SearchX aria-hidden="true" className="mb-1 size-8 text-muted-foreground" /><h3 className="text-base font-semibold text-foreground">Совпадений пока нет</h3><p className="mt-2">По запросу «{search}» ничего не найдено. Проверьте тикер или название компании.</p></div></CardContent></Card>
            ) : (
              <ul className="grid gap-3">
                {display.results.map((stock) => (
                  <li key={stock.symbol}>
                    <div className="data-row flex items-center gap-2 rounded-2xl border border-border bg-card p-2 sm:gap-3 sm:p-3">
                      <Link href={`/stocks/${encodeURIComponent(stock.symbol)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <span aria-hidden="true" className="hidden shrink-0 min-[380px]:block"><span className="symbol-avatar">{stock.symbol.slice(0, 2)}</span></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-base font-semibold tracking-wide text-foreground">{stock.symbol}</span><span className="text-xs text-muted-foreground">{stock.exchange ?? "Биржа не указана"} · Акция</span></span>
                          <span className="mt-1 block break-words text-sm text-muted-foreground">{stock.companyName}</span>
                          <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent-foreground">Открыть карточку <ArrowUpRight aria-hidden="true" className="size-3.5" /></span>
                        </span>
                      </Link>
                      <Button
                        type="button"
                        variant={watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? "secondary" : "outline"}
                        size="icon-lg"
                        disabled={watchlist.status !== "ready" || pendingSymbol !== null}
                        aria-pressed={watchlist.status === "ready" ? watchlist.symbols.has(stock.symbol) : undefined}
                        aria-label={pendingSymbol === stock.symbol ? `Обновляем список для ${stock.symbol}` : watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? `Удалить ${stock.symbol} из списка` : `Добавить ${stock.symbol} в список`}
                        aria-busy={pendingSymbol === stock.symbol}
                        aria-describedby={actionError?.symbol === stock.symbol || actionNotice?.symbol === stock.symbol ? "stock-search-action-feedback" : undefined}
                        onClick={(event) => void toggleWatchlist(stock.symbol, event.currentTarget)}
                        className="shrink-0 text-lg"
                      >
                        {pendingSymbol === stock.symbol ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? <Check aria-hidden="true" className="size-4" /> : <Bookmark aria-hidden="true" className="size-4" />}
                      </Button>
                    </div>
                    {pendingSymbol === stock.symbol && <p role="status" className="mt-2 text-sm text-muted-foreground">Обновляем список для {stock.symbol}…</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
