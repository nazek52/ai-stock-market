import "server-only";
import { AppError } from "../errors";

export interface TransportOptions {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  requestsPerMinute?: number;
  timeoutMs?: number;
  /** Must atomically consume the application-wide provider budget, or throw. */
  consumeSharedBudget?: () => Promise<(() => Promise<void>) | void>;
}

const unavailable = () => new AppError("UPSTREAM_UNAVAILABLE", "Market data is temporarily unavailable", 502);

export function createFinnhubTransport(options: TransportOptions) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const limit = Math.min(30, Math.max(1, options.requestsPerMinute ?? 30));
  const timeoutMs = options.timeoutMs ?? 5_000;
  const starts: number[] = [];
  let tail: Promise<void> = Promise.resolve();
  let queued = 0;
  let blockedUntil = 0;

  return async function request(path: "/quote" | "/search" | "/stock/profile2" | "/company-news" | "/news", params: Record<string, string>): Promise<unknown> {
    if (queued >= 32) throw new AppError("RATE_LIMITED", "Market request queue is full", 429, 1);
    queued++;
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let releaseShared: (() => Promise<void>) | void = undefined;
    const controller = new AbortController();
    try {
      const current = now();
      while (starts.length && starts[0]! <= current - 60_000) starts.shift();
      if (blockedUntil > current || starts.length >= limit) {
        const retry = Math.max(blockedUntil, starts.length >= limit ? starts[0]! + 60_000 : current);
        throw new AppError("RATE_LIMITED", "Market request budget is exhausted", 429, Math.max(1, Math.ceil((retry - current) / 1_000)));
      }
      releaseShared = await options.consumeSharedBudget?.();
      starts.push(now());
      const url = new URL(`https://finnhub.io/api/v1${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const network = async () => {
        const response = await fetcher(url, {
          method: "GET", headers: { "X-Finnhub-Token": options.apiKey, Accept: "application/json" },
          signal: controller.signal, redirect: "error", cache: "no-store",
        });
        if (response.status === 429) {
          const raw = response.headers.get("retry-after");
          const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - now()) / 1_000) : 60;
          const retry = Number.isFinite(seconds) ? Math.min(3_600, Math.max(1, seconds)) : 60;
          blockedUntil = now() + retry * 1_000;
          await response.body?.cancel();
          throw new AppError("RATE_LIMITED", "Market provider rate limit reached", 429, retry);
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 404) throw new AppError("NOT_FOUND", "Stock was not found", 404);
          if (response.status === 401 || response.status === 403) throw new AppError("SERVICE_UNAVAILABLE", "Market provider access is not configured", 503);
          throw unavailable();
        }
        const reader = response.body?.getReader();
        if (!reader) throw unavailable();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1_048_576) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(value);
        }
        try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
        catch { throw unavailable(); }
      };
      return await Promise.race([
        network(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable();
    } finally {
      if (timer) clearTimeout(timer);
      try { await releaseShared?.(); }
      finally { queued--; release(); }
    }
  };
}
