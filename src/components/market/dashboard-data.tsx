"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiError, ApiResult, StockNewsItem, StockQuote } from "@/contracts";
import { Button } from "@/components/ui/button";

const DASHBOARD_SYMBOLS = ["AAPL", "MSFT", "NVDA"] as const;
type DashboardSymbol = (typeof DASHBOARD_SYMBOLS)[number];
type LoadError = ApiError | { code: "NETWORK_ERROR" };
type QuoteState = { status: "loading" } | { status: "ready"; quote: StockQuote } | { status: "error"; error: LoadError };
type NewsState =
  | { status: "loading" }
  | { status: "ready"; news: StockNewsItem[]; mode: "fixture" | "finnhub" | "unknown" }
  | { status: "error"; error: LoadError };

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "время не указано";
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

function safeNewsUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function DataError({ error, retry }: { error: LoadError; retry: () => void }) {
  const message = error.code === "UNAUTHENTICATED"
    ? "Войдите в аккаунт, чтобы увидеть данные рынка."
    : error.code === "RATE_LIMITED"
      ? `Лимит запросов исчерпан. Повторите позже${error.retryAfterSeconds ? ` (примерно через ${error.retryAfterSeconds} с)` : ""}.`
      : "Сейчас источник недоступен. Попробуйте позже.";
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p role="alert" className="text-sm text-foreground">{message}</p>
      {error.code === "UNAUTHENTICATED"
        ? <Link href="/login" className="w-fit text-sm font-semibold text-primary underline">Войти</Link>
        : <Button type="button" variant="outline" onClick={retry} className="w-fit">Повторить</Button>}
    </div>
  );
}

function QuoteRow({ symbol }: { symbol: DashboardSymbol }) {
  const [state, setState] = useState<QuoteState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/stocks/${symbol}/quote`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as ApiResult<StockQuote>;
        if (controller.signal.aborted) return;
        if (!payload.ok) {
          setState({ status: "error", error: payload.error });
        } else if (payload.data?.symbol === symbol && Number.isFinite(payload.data.price) &&
          payload.data.currency === "USD" && (payload.data.source === "fixture" || payload.data.source === "finnhub") &&
          typeof payload.data.observedAt === "string" && !Number.isNaN(new Date(payload.data.observedAt).getTime())) {
          setState({ status: "ready", quote: payload.data });
        } else {
          setState({ status: "error", error: { code: "NETWORK_ERROR" } });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", error: { code: "NETWORK_ERROR" } });
      }
    }
    void load();
    return () => controller.abort();
  }, [symbol, retry]);

  return (
    <li className="border-b border-border py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={`/stocks/${symbol}`} className="font-semibold text-primary underline-offset-4 hover:underline">{symbol}</Link>
        {state.status === "ready" && <span className="font-semibold tabular-nums text-foreground">{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(state.quote.price)} {state.quote.currency}</span>}
      </div>
      {state.status === "loading" && <p role="status" className="mt-2 text-sm text-muted-foreground">Загружаем котировку {symbol}…</p>}
      {state.status === "error" && <div className="mt-2"><DataError error={state.error} retry={() => { setState({ status: "loading" }); setRetry((value) => value + 1); }} /></div>}
      {state.status === "ready" && (
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
          <p>Источник: {state.quote.source === "fixture" ? "синтетические данные (fixture)" : "Finnhub"}.</p>
          <p>Время котировки по источнику: {formatTime(state.quote.observedAt)}.</p>
        </div>
      )}
    </li>
  );
}

export function DashboardQuotes() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Котировки AAPL, MSFT и NVDA загружаются отдельно. Источник и время указаны для каждой цены.</p>
      <ul className="mt-2">
        {DASHBOARD_SYMBOLS.map((symbol) => <QuoteRow key={symbol} symbol={symbol} />)}
      </ul>
    </div>
  );
}

export function DashboardNews() {
  const [state, setState] = useState<NewsState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/stocks/AAPL/news", { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as ApiResult<StockNewsItem[]>;
        if (controller.signal.aborted) return;
        if (!payload.ok) {
          setState({ status: "error", error: payload.error });
        } else if (Array.isArray(payload.data)) {
          const source = response.headers.get("X-Market-Data-Mode");
          const mode = source === "fixture" || source === "finnhub" ? source : "unknown";
          setState({ status: "ready", news: payload.data.slice(0, 5), mode });
        } else {
          setState({ status: "error", error: { code: "NETWORK_ERROR" } });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", error: { code: "NETWORK_ERROR" } });
      }
    }
    void load();
    return () => controller.abort();
  }, [retry]);

  return (
    <div>
      {state.status === "loading" && <p role="status" className="text-sm text-muted-foreground">Загружаем новости AAPL…</p>}
      {state.status === "error" && <DataError error={state.error} retry={() => { setState({ status: "loading" }); setRetry((value) => value + 1); }} />}
      {state.status === "ready" && (
        <>
          <p className="text-sm text-muted-foreground">
            {state.mode === "fixture" ? "Синтетические новости для демонстрации — не фактические события." : state.mode === "finnhub" ? "Новости AAPL получены через Finnhub." : "Источник набора новостей не указан."}
          </p>
          {state.news.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Сейчас публикаций по AAPL нет.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {state.news.map((item) => {
                const url = state.mode === "fixture" ? null : safeNewsUrl(item.url);
                return (
                  <li key={item.id} className="rounded-lg border border-border p-3">
                    {url
                      ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">{item.headline}</a>
                      : <span className="font-semibold text-foreground">{item.headline}</span>}
                    <p className="mt-1 text-xs text-muted-foreground">{state.mode === "fixture" ? "Синтетика · " : ""}{item.source} · {formatTime(item.publishedAt)}</p>
                    {!url && state.mode !== "fixture" && <p className="mt-1 text-xs text-muted-foreground">Ссылка на публикацию недоступна.</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
