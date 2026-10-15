"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [watchlist, setWatchlist] = useState<WatchlistState>({ status: "loading" });
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ symbol: string; message: string } | null>(null);
  const search = query.trim();

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

  async function toggleWatchlist(symbol: string) {
    if (watchlist.status !== "ready" || pendingSymbol) return;
    const wasSaved = watchlist.symbols.has(symbol);
    setPendingSymbol(symbol);
    setActionError(null);
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
        } else {
          setActionError({ symbol, message: watchlistErrorMessage(payload.error) });
        }
        return;
      }
      if (typeof payload.data !== "object" || payload.data === null ||
        (wasSaved ? !("deleted" in payload.data && typeof payload.data.deleted === "boolean")
          : !("symbol" in payload.data && payload.data.symbol === symbol))) {
        setActionError({ symbol, message: "Сервер вернул неожиданный ответ. Обновите страницу перед повторной попыткой." });
        return;
      }
      setWatchlist((current) => {
        if (current.status !== "ready") return current;
        const symbols = new Set(current.symbols);
        if (wasSaved) symbols.delete(symbol);
        else symbols.add(symbol);
        return { status: "ready", symbols };
      });
    } catch {
      setActionError({ symbol, message: "Не удалось связаться с сервером. Список не изменён." });
    } finally {
      setPendingSymbol(null);
    }
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader>
          <CardTitle><h2 className="m-0 text-lg">Найти акцию</h2></CardTitle>
          <CardDescription>Поиск акций США по тикеру или названию. Результаты предоставляет серверный рыночный источник.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="stock-search" className="text-sm font-medium">Тикер или название компании</label>
              <input
                id="stock-search"
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActionError(null); }}
                maxLength={80}
                autoComplete="off"
                placeholder="Например, AAPL или Apple"
                aria-controls="stock-search-results"
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
            {query && <Button type="button" variant="outline" size="lg" onClick={() => { setQuery(""); setActionError(null); }}>Очистить</Button>}
          </div>
        </CardContent>
      </Card>

      <section id="stock-search-results" aria-labelledby="stock-search-results-title">
        <h2 id="stock-search-results-title" className="mb-3 text-lg font-semibold">Результаты поиска</h2>
        {watchlist.status === "loading" && <p role="status" className="mb-3 text-sm text-muted-foreground">Загружаем ваш список отслеживания…</p>}
        {watchlist.status === "unauthenticated" && <p role="status" className="mb-3 text-sm text-muted-foreground">Чтобы сохранять акции, <Link href="/login" className="font-semibold text-primary underline">войдите в аккаунт</Link>.</p>}
        {watchlist.status === "error" && <p role="alert" className="mb-3 text-sm text-destructive">Не удалось загрузить список отслеживания. Обновите страницу, чтобы повторить.</p>}
        {!search ? (
          <Card><CardContent><p>Введите тикер или название компании.</p></CardContent></Card>
        ) : display.status === "idle" || display.status === "loading" ? (
          <Card><CardContent><p role="status">Ищем акции…</p></CardContent></Card>
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
              <Link className="text-sm font-semibold text-primary underline" href="/login">Войти</Link>
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
              <Card><CardContent><p>По запросу «{search}» ничего не найдено. Проверьте тикер или название компании.</p></CardContent></Card>
            ) : (
              <ul className="grid gap-3">
                {display.results.map((stock) => (
                  <li key={stock.symbol}>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 sm:gap-3">
                      <Link href={`/stocks/${encodeURIComponent(stock.symbol)}`} className="min-w-0 flex-1 rounded-lg p-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-base font-semibold text-foreground">{stock.symbol} <span className="text-sm font-normal text-muted-foreground">· {stock.companyName}</span></span>
                          <span className="text-xs font-medium text-muted-foreground">{stock.exchange ?? "Биржа не указана"} · Акция</span>
                        </span>
                        <span className="mt-2 block text-xs text-primary">Открыть карточку <span aria-hidden="true">→</span></span>
                      </Link>
                      <Button
                        type="button"
                        variant={watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? "secondary" : "outline"}
                        size="icon-lg"
                        disabled={watchlist.status !== "ready" || pendingSymbol !== null}
                        aria-pressed={watchlist.status === "ready" ? watchlist.symbols.has(stock.symbol) : undefined}
                        aria-label={pendingSymbol === stock.symbol ? `Обновляем список для ${stock.symbol}` : watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? `Удалить ${stock.symbol} из списка` : `Добавить ${stock.symbol} в список`}
                        aria-busy={pendingSymbol === stock.symbol}
                        onClick={() => void toggleWatchlist(stock.symbol)}
                        className="shrink-0 text-lg"
                      >
                        <span aria-hidden="true">{pendingSymbol === stock.symbol ? "…" : watchlist.status === "ready" && watchlist.symbols.has(stock.symbol) ? "★" : "☆"}</span>
                      </Button>
                    </div>
                    {pendingSymbol === stock.symbol && <p role="status" className="mt-2 text-sm text-muted-foreground">Обновляем список для {stock.symbol}…</p>}
                    {actionError?.symbol === stock.symbol && <p role="alert" className="mt-2 text-sm text-destructive">{actionError.message}</p>}
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
