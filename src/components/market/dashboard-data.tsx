"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, Newspaper } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

function DataError({ error, retry, subject }: { error: LoadError; retry: () => void; subject: string }) {
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
        : <Button type="button" variant="outline" onClick={retry} aria-label={`Повторить: ${subject}`} className="w-fit">Повторить</Button>}
    </div>
  );
}

function QuoteRow({ symbol }: { symbol: DashboardSymbol }) {
  const [state, setState] = useState<QuoteState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const rowRef = useRef<HTMLLIElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (state.status === "loading" || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) rowRef.current?.focus();
  }, [state]);

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
    <li ref={rowRef} tabIndex={-1} className="quote-tile">
      <div className="quote-tile-head"><Link href={`/stocks/${symbol}`} className="quote-symbol inline-flex items-center gap-3 hover:text-primary"><span className="symbol-avatar !size-8 !rounded-lg !text-[10px]" aria-hidden="true">{symbol.slice(0,2)}</span>{symbol}</Link><Link className="quote-arrow" href={`/stocks/${symbol}`} aria-label={`Открыть ${symbol}`}><ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      {state.status === "ready" && <span className="quote-price">{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(state.quote.price)}<span className="quote-currency">{state.quote.currency}</span></span>}
      {state.status === "loading" && <div className="mt-5 grid gap-3"><p role="status" className="sr-only">Загружаем котировку {symbol}…</p><span aria-hidden="true" className="skeleton h-9 w-32 max-w-full" /><span aria-hidden="true" className="skeleton h-3 w-40 max-w-full" /></div>}
      {state.status === "error" && <div className="mt-4"><DataError error={state.error} subject={`котировка ${symbol}`} retry={() => { restoreFocus.current = true; setState({ status: "loading" }); setRetry((value) => value + 1); }} /></div>}
      {state.status === "ready" && <div className="quote-source"><p>{state.quote.source === "fixture" ? "Синтетические данные · fixture" : "Источник: Finnhub"}</p><p className="inline-flex items-start gap-1.5"><Clock3 size={11} className="mt-0.5 shrink-0" aria-hidden="true" /><span>По источнику: {formatTime(state.quote.observedAt)}</span></p></div>}
    </li>
  );
}

export function DashboardQuotes() {
  return (
    <ul className="quotes-grid">
      {DASHBOARD_SYMBOLS.map((symbol) => <QuoteRow key={symbol} symbol={symbol} />)}
    </ul>
  );
}

export function DashboardNews() {
  const [state, setState] = useState<NewsState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const newsRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (state.status === "loading" || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) newsRef.current?.focus();
  }, [state]);

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
    <div ref={newsRef} tabIndex={-1}>
      {state.status === "loading" && <div className="grid gap-3"><p role="status" className="sr-only">Загружаем новости AAPL…</p><span aria-hidden="true" className="skeleton h-4 w-3/4" /><span aria-hidden="true" className="skeleton h-3 w-full" /><span aria-hidden="true" className="skeleton h-3 w-2/3" /></div>}
      {state.status === "error" && <DataError error={state.error} subject="новости AAPL" retry={() => { restoreFocus.current = true; setState({ status: "loading" }); setRetry((value) => value + 1); }} />}
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
                  <li key={item.id} className="data-row rounded-xl border border-border bg-background/40 p-4">
                    <span className="news-source mb-3"><Newspaper size={12} aria-hidden="true" />{item.source}</span>
                    {url
                      ? <a href={url} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium leading-relaxed text-primary underline-offset-4 hover:underline">{item.headline}</a>
                      : <span className="block text-sm font-medium leading-relaxed text-foreground">{item.headline}</span>}
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
