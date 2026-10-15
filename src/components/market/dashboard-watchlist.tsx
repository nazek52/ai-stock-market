"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError, ApiResult, WatchlistItem } from "@/contracts";

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: WatchlistItem[] }
  | { kind: "error"; error: ApiError };

const networkError: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Request failed" };

export function DashboardWatchlist() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/watchlist", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as ApiResult<WatchlistItem[]>;
        if (!result || typeof result !== "object" || typeof result.ok !== "boolean") throw networkError;
        if (!result.ok) return { kind: "error" as const, error: result.error };
        if (!response.ok || !Array.isArray(result.data)) throw networkError;
        return { kind: "ready" as const, items: result.data };
      })
      .then((next) => { if (!controller.signal.aborted) setState(next); })
      .catch(() => { if (!controller.signal.aborted) setState({ kind: "error", error: networkError }); });
    return () => controller.abort();
  }, [revision]);

  function retry() {
    setState({ kind: "loading" });
    setRevision((value) => value + 1);
  }

  const newest = state.kind === "ready"
    ? [...state.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
    : [];

  return (
    <div className="grid gap-4">
      {state.kind === "loading" && <p role="status" className="text-sm text-muted-foreground">Загружаем ваш список…</p>}
      {state.kind === "error" && <div role="alert" className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>{state.error.code === "UNAUTHENTICATED" ? "Войдите, чтобы увидеть ваш список." : state.error.code === "RATE_LIMITED" ? "Лимит запросов исчерпан. Попробуйте позже." : "Не удалось загрузить список. Попробуйте ещё раз."}</p>
        <div className="flex flex-wrap gap-3">
          {state.error.code === "UNAUTHENTICATED" && <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Войти</Link>}
          <Button type="button" variant="outline" size="sm" onClick={retry}>Повторить</Button>
        </div>
      </div>}
      {state.kind === "ready" && state.items.length === 0 && <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm">
        <p>В списке пока нет акций.</p>
        <Link href="/search" className="mt-3 inline-flex font-semibold text-primary underline-offset-4 hover:underline">Найти акцию →</Link>
      </div>}
      {newest.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">
        {newest.map((item) => <li key={item.id} className="min-w-0 px-4 py-3">
          <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm hover:underline">
            <span className="font-semibold text-primary">{item.symbol}</span>
            <span className="min-w-0 break-words text-foreground">{item.companyName}</span>
          </Link>
        </li>)}
      </ul>}
      <Link href="/watchlist" className="w-fit text-sm font-semibold text-primary underline-offset-4 hover:underline">Открыть полный список →</Link>
    </div>
  );
}
