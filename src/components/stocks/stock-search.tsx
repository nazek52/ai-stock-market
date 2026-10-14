"use client";

import Link from "next/link";
import { useState } from "react";
import { demoStocks } from "@/lib/demo-stocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StockSearch() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase("ru");
  const results = search
    ? demoStocks.filter((stock) => stock.symbol.toLowerCase().includes(search) || stock.name.toLocaleLowerCase("ru").includes(search))
    : [];

  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader>
          <CardTitle><h2 className="m-0 text-lg">Найти акцию</h2></CardTitle>
          <CardDescription>Сейчас поиск работает только по четырём демонстрационным записям: AAPL, MSFT, NVDA и KO. Рыночный API ещё не подключён.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="stock-search" className="text-sm font-medium">Тикер или название компании</label>
              <input
                id="stock-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                placeholder="Например, AAPL или Apple"
                aria-controls="stock-search-results"
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
            {query && <Button type="button" variant="outline" size="lg" onClick={() => setQuery("")}>Очистить</Button>}
          </div>
        </CardContent>
      </Card>

      <section id="stock-search-results" aria-labelledby="stock-search-results-title">
        <h2 id="stock-search-results-title" className="mb-3 text-lg font-semibold">Результаты поиска</h2>
        {!search ? (
          <Card><CardContent><p>Введите тикер или название компании, чтобы увидеть совпадения в демонстрационном наборе.</p></CardContent></Card>
        ) : results.length === 0 ? (
          <Card><CardContent><p role="status">В демонстрационном наборе нет совпадений для «{query.trim()}». Это не означает, что акции нет на рынке.</p></CardContent></Card>
        ) : (
          <>
            <p role="status" className="mb-3 text-sm text-muted-foreground">Найдено в демонстрационном наборе: {results.length}</p>
            <ul className="grid gap-3">
              {results.map((stock) => (
                <li key={stock.symbol}>
                  <Link href={`/stocks/${encodeURIComponent(stock.symbol)}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base font-semibold text-foreground">{stock.symbol} <span className="text-sm font-normal text-muted-foreground">· {stock.name}</span></span>
                      <span className="text-xs font-medium text-muted-foreground">{stock.exchange}</span>
                    </span>
                    <span className="mt-2 block text-xs text-primary">Открыть карточку <span aria-hidden="true">→</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
