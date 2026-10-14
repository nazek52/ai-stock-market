"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MarketEmptyState } from "@/components/market/market-empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiError, ApiResult, StockCompany, StockNewsItem, StockQuote } from "@/contracts";

type ReadResult<T> = { data: T; fixture: boolean } | { error: ApiError; fixture: boolean };
type Detail = {
  company: ReadResult<StockCompany>;
  quote: ReadResult<StockQuote>;
  news: ReadResult<StockNewsItem[]>;
};

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const formatTime = (value: string) => `${dateTime.format(new Date(value))} UTC`;

async function read<T>(symbol: string, resource: "company" | "quote" | "news", signal: AbortSignal): Promise<ReadResult<T>> {
  try {
    const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/${resource}`, { signal, cache: "no-store" });
    const fixture = response.headers.get("X-Market-Data-Mode") === "fixture";
    const result = await response.json() as ApiResult<T>;
    if (result.ok) return { data: result.data, fixture };
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
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      read<StockCompany>(symbol, "company", controller.signal),
      read<StockQuote>(symbol, "quote", controller.signal),
      read<StockNewsItem[]>(symbol, "news", controller.signal),
    ]).then(([company, quote, news]) => { if (!controller.signal.aborted) setDetail({ company, quote, news }); });
    return () => controller.abort();
  }, [symbol]);

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
        <div>
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
                {company.website && safeUrl(company.website) && <a href={safeUrl(company.website)!} target="_blank" rel="noopener noreferrer" className="inline-block underline underline-offset-2">Сайт компании</a>}
              </div> : stateFor(detail.company, "Данные компании")}</CardContent>
            </Card>
          </section>
          <section aria-labelledby="news-heading" className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle><h2 id="news-heading" className="m-0 text-base">Новости</h2></CardTitle><CardDescription>{news === null ? "Источник новостей: нет данных" : `Публикации из ${fixture ? "синтетической фикстуры" : "серверного источника Finnhub"}`}</CardDescription></CardHeader>
              <CardContent>{news === null ? stateFor(detail.news, "Новости") : news.length === 0 ? <MarketEmptyState kind="empty" title="Новостей нет" description="За доступный период источник не вернул публикаций." /> : <ul>{news.map((item) => <li key={item.id} className="border-b border-border py-3 last:border-b-0">
                <p className="font-semibold">{safeUrl(item.url) ? <a href={safeUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{item.headline}</a> : item.headline}</p>
                {item.summary && <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{item.source} · {formatTime(item.publishedAt)}</p>
              </li>)}</ul>}</CardContent>
            </Card>
          </section>
        </div>
        <section className="mt-5" aria-labelledby="watchlist-heading"><Card><CardHeader><CardTitle><h2 id="watchlist-heading" className="m-0 text-base">Мой список</h2></CardTitle></CardHeader><CardContent><Link className="button button-outline" href="/watchlist">Открыть раздел списка</Link></CardContent></Card></section>
      </>}
    </AppShell>
  );
}
