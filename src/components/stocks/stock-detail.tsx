"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MarketEmptyState } from "@/components/market/market-empty-state";
import { TradingViewStockChart } from "@/components/market/tradingview-widgets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiError, ApiResult, StockCompany, StockNewsItem, StockQuote, WatchlistItem } from "@/contracts";

type ReadResult<T> = { data: T; fixture: boolean } | { error: ApiError; fixture: boolean };
type Detail = {
  company: ReadResult<StockCompany>;
  quote: ReadResult<StockQuote>;
  news: ReadResult<StockNewsItem[]>;
};
type WatchlistState = { status: "loading" | "ready" | "error" | "unauthenticated"; included: boolean; message?: string };

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const formatTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "время неизвестно" : `${dateTime.format(parsed)} UTC`;
};

async function read<T>(symbol: string, resource: "company" | "quote" | "news", signal: AbortSignal): Promise<ReadResult<T>> {
  try {
    const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/${resource}`, { signal, cache: "no-store" });
    const fixture = response.headers.get("X-Market-Data-Mode") === "fixture";
    const result = await response.json() as ApiResult<T>;
    if (!result || typeof result !== "object" || typeof result.ok !== "boolean") throw new Error("Invalid market response");
    if (result.ok) {
      if (!response.ok) throw new Error("Unexpected market status");
      return { data: result.data, fixture };
    }
    return { error: result.error, fixture };
  } catch {
    return { error: { code: "UPSTREAM_UNAVAILABLE", message: "Network request failed" }, fixture: false };
  }
}

function stateFor<T>(result: ReadResult<T>, subject: string) {
  if ("data" in result) return null;
  if (result.error.code === "RATE_LIMITED") return <MarketEmptyState kind="error" title="Лимит запросов исчерпан" description={`${subject} временно недоступны. Попробуйте позже.`} />;
  return <MarketEmptyState kind="unavailable" title={`${subject} недоступны`} description="Источник данных сейчас не отвечает. Попробуйте обновить страницу позже." />;
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function StockDetail({ symbol }: { symbol: string }) {
  return <StockDetailForSymbol key={symbol} symbol={symbol} />;
}

function StockDetailForSymbol({ symbol }: { symbol: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistState>({ status: "loading", included: false });
  const [watchlistPending, setWatchlistPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      read<StockCompany>(symbol, "company", controller.signal),
      read<StockQuote>(symbol, "quote", controller.signal),
      read<StockNewsItem[]>(symbol, "news", controller.signal),
    ]).then(([company, quote, news]) => { if (!controller.signal.aborted) setDetail({ company, quote, news }); });
    return () => controller.abort();
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/watchlist", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => await response.json() as ApiResult<WatchlistItem[]>)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) setWatchlist({ status: "ready", included: result.data.some((item) => item.symbol === symbol) });
        else setWatchlist({ status: result.error.code === "UNAUTHENTICATED" ? "unauthenticated" : "error", included: false, message: "Не удалось загрузить список. Обновите страницу и попробуйте снова." });
      })
      .catch(() => { if (!controller.signal.aborted) setWatchlist({ status: "error", included: false, message: "Не удалось загрузить список. Обновите страницу и попробуйте снова." }); });
    return () => controller.abort();
  }, [symbol]);

  async function changeWatchlist() {
    if (watchlist.status !== "ready" || watchlistPending) return;
    setWatchlistPending(true);
    setWatchlist((current) => ({ ...current, message: undefined }));
    try {
      const response = await fetch(watchlist.included ? `/api/watchlist/${encodeURIComponent(symbol)}` : "/api/watchlist", {
        method: watchlist.included ? "DELETE" : "POST",
        ...(watchlist.included ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) }),
      });
      if (watchlist.included) {
        const result = await response.json() as ApiResult<{ deleted: boolean }>;
        if (result.ok) {
          if (!response.ok || typeof result.data?.deleted !== "boolean") throw new Error("Invalid delete response");
          setWatchlist({ status: "ready", included: false });
        }
        else if (result.error.code === "UNAUTHENTICATED") setWatchlist((current) => ({ ...current, status: "unauthenticated", message: "Сессия истекла. Войдите снова." }));
        else setWatchlist((current) => ({ ...current, message: "Не удалось удалить акцию. Попробуйте снова." }));
      } else {
        const result = await response.json() as ApiResult<WatchlistItem>;
        if (result.ok) {
          if (!response.ok || result.data?.symbol !== symbol) throw new Error("Invalid watchlist response");
          setWatchlist({ status: "ready", included: true });
        }
        else if (result.error.code === "UNAUTHENTICATED") setWatchlist((current) => ({ ...current, status: "unauthenticated", message: "Сессия истекла. Войдите снова." }));
        else setWatchlist((current) => ({ ...current, message: result.error.code === "CONFLICT" ? "Список заполнен: можно сохранить не более 50 акций." : "Не удалось добавить акцию. Попробуйте снова." }));
      }
    } catch {
      setWatchlist((current) => ({ ...current, status: "error", message: "Изменение могло сохраниться. Обновите страницу или откройте список, чтобы проверить текущее состояние." }));
    } finally {
      setWatchlistPending(false);
    }
  }

  const company = detail?.company && "data" in detail.company ? detail.company.data : null;
  const quote = detail?.quote && "data" in detail.quote ? detail.quote.data : null;
  const news = detail?.news && "data" in detail.news ? detail.news.data : null;
  const fixture = detail ? Object.values(detail).some((item) => item.fixture) || company?.source === "fixture" || quote?.source === "fixture" : false;
  const authRequired = detail && Object.values(detail).some((item) => "error" in item && item.error.code === "UNAUTHENTICATED");
  const missing = detail && !company && !quote && Object.values(detail).some((item) => "error" in item && item.error.code === "NOT_FOUND");
  const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: quote?.currency ?? company?.currency ?? "USD" });
  const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  return (
    <AppShell active={symbol}>
      <div className="page-heading">
        <div className="min-w-0 break-words">
          <span className="eyebrow">{fixture ? "СИНТЕТИЧЕСКИЕ ДАННЫЕ · FIXTURE" : "АКЦИИ США"}{company?.exchange ? ` · ${company.exchange}` : ""}</span>
          <h1>{company?.companyName ?? symbol}</h1>
          <p>Тикер {symbol}. {company?.industry ? `Отрасль: ${company.industry}.` : ""}</p>
        </div>
        <Link className="button button-outline" href="/search">← К поиску</Link>
      </div>

      {!detail && <p role="status">Загружаем данные акции…</p>}
      {authRequired && <MarketEmptyState kind="error" title="Войдите в аккаунт" description="Для просмотра данных акции требуется вход." action={{ href: "/login", label: "Войти" }} />}
      {!authRequired && missing && <MarketEmptyState kind="empty" title="Символ не найден" description="Проверьте тикер или вернитесь к поиску." action={{ href: "/search", label: "К поиску" }} />}
      {!authRequired && !missing && detail && <>
        {fixture && <p className="mb-5 rounded-xl border border-border bg-muted px-5 py-4 text-sm" role="status">Это синтетические тестовые данные. Цены и новости не отражают реальные события рынка.</p>}
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <section aria-labelledby="price-heading">
            <Card className="h-full">
              <CardHeader><CardTitle><h2 id="price-heading" className="m-0 text-base">Цена и изменение</h2></CardTitle><CardDescription>Источник: {quote?.source === "fixture" ? "синтетическая фикстура" : quote?.source === "finnhub" ? "Finnhub" : "нет данных"}</CardDescription></CardHeader>
              <CardContent>{quote ? <div>
                <p className="text-3xl font-semibold">{money.format(quote.price)}</p>
                <p className="mt-2 text-sm">Изменение: {quote.change === null ? "нет данных" : money.format(quote.change)}{quote.changePercent === null ? "" : ` (${number.format(quote.changePercent)} %)`}</p>
                <p className="mt-4 text-xs text-muted-foreground">Время котировки: {formatTime(quote.observedAt)}. Получено приложением: {formatTime(quote.fetchedAt)}.</p>
              </div> : stateFor(detail.quote, "Котировка")}</CardContent>
            </Card>
          </section>
          <section aria-labelledby="company-heading">
            <Card className="h-full">
              <CardHeader><CardTitle><h2 id="company-heading" className="m-0 text-base">О компании</h2></CardTitle><CardDescription>Источник: {company?.source === "fixture" ? "синтетическая фикстура" : company?.source === "finnhub" ? "Finnhub" : "нет данных"}</CardDescription></CardHeader>
              <CardContent>{company ? <div className="space-y-2 text-sm">
                <p>Биржа: {company.exchange ?? "нет данных"}</p><p>Отрасль: {company.industry ?? "нет данных"}</p>
                <p>Капитализация: {company.marketCapitalization === null ? "нет данных" : money.format(company.marketCapitalization)}</p>
                {company.source !== "fixture" && company.website && safeUrl(company.website) && <a href={safeUrl(company.website)!} target="_blank" rel="noopener noreferrer" className="inline-block underline underline-offset-2">Сайт компании</a>}
              </div> : stateFor(detail.company, "Данные компании")}</CardContent>
            </Card>
          </section>
          <section aria-labelledby="chart-heading" className="min-w-0 lg:col-span-2">
            <Card className="min-w-0">
              <CardHeader><CardTitle><h2 id="chart-heading" className="m-0 text-base">График акции</h2></CardTitle><CardDescription>Отдельный внешний источник: TradingView</CardDescription></CardHeader>
              <CardContent className="min-w-0">{company
                ? <TradingViewStockChart symbol={company.symbol} exchange={company.exchange} source={company.source} />
                : <p role="status" className="text-sm">Для графика нужны данные компании и её биржа. Попробуйте обновить страницу позже.</p>}</CardContent>
            </Card>
          </section>
          <section aria-labelledby="news-heading" className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle><h2 id="news-heading" className="m-0 text-base">Новости</h2></CardTitle><CardDescription>{news === null ? "Источник новостей: нет данных" : `Публикации из ${fixture ? "синтетической фикстуры" : "серверного источника Finnhub"}`}</CardDescription></CardHeader>
              <CardContent>{news === null ? stateFor(detail.news, "Новости") : news.length === 0 ? <MarketEmptyState kind="empty" title="Новостей нет" description="За доступный период источник не вернул публикаций." /> : <ul>{news.map((item) => <li key={item.id} className="border-b border-border py-3 last:border-b-0">
                <p className="break-words font-semibold">{!fixture && safeUrl(item.url) ? <a href={safeUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{item.headline}</a> : item.headline}</p>
                {item.summary && <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{item.source} · {formatTime(item.publishedAt)}</p>
              </li>)}</ul>}</CardContent>
            </Card>
          </section>
        </div>
        <section className="mt-5" aria-labelledby="watchlist-heading"><Card><CardHeader><CardTitle><h2 id="watchlist-heading" className="m-0 text-base">Мой список</h2></CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-3">
          {watchlist.status === "ready" && <button type="button" className="button button-primary" disabled={watchlistPending} onClick={changeWatchlist}>{watchlistPending ? "Сохраняем…" : watchlist.included ? "Убрать из списка" : "Добавить в список"}</button>}
          {watchlist.status === "loading" && <p role="status" className="text-sm">Проверяем список…</p>}
          {watchlist.status === "unauthenticated" && <Link className="button button-primary" href="/login">Войти, чтобы управлять списком</Link>}
          <Link className="button button-outline" href="/watchlist">Открыть раздел списка</Link>
          {watchlist.message && <p role="alert" className="w-full text-sm text-destructive">{watchlist.message}</p>}
        </CardContent></Card></section>
      </>}
    </AppShell>
  );
}
