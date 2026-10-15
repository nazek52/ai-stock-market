"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { StockCompany } from "@/contracts";

const EMBED_ORIGIN = "https://s3.tradingview.com/external-embedding";
// TradingView's official free Market Overview preset uses these CFD feeds.
// Canonical exchange indices may exist on tradingview.com but be unavailable in embeds.
const MARKET_INDICATORS = [
  { s: "FOREXCOM:SPXUSD", d: "S&P 500 (CFD)" },
  { s: "FOREXCOM:DJI", d: "Dow Jones (CFD)" },
  { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100 (CFD)" },
] as const;
const US_SYMBOL = /^(NASDAQ|NYSE):[A-Z][A-Z0-9.-]{0,14}$/;

type Theme = "light" | "dark";
type WidgetProps = { theme?: Theme; height?: number; className?: string };
type EmbedConfig = Record<string, unknown>;

function currentTheme(): Theme {
  const classes = document.documentElement.classList;
  if (classes.contains("dark")) return "dark";
  if (classes.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  preference.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    preference.removeEventListener("change", onChange);
  };
}

function useWidgetTheme(override?: Theme): Theme {
  const selected = useSyncExternalStore(subscribeTheme, currentTheme, (): Theme => "light");
  return override ?? selected;
}

function safeHeight(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.min(900, Math.max(320, Math.round(value!))) : fallback;
}

function TradingViewEmbed({
  title,
  scriptName,
  config,
  height,
  className,
}: {
  title: string;
  scriptName: "market-overview" | "stock-heatmap" | "symbol-overview";
  config: EmbedConfig;
  height: number;
  className?: string;
}) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (state === "loading" || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) sectionRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    widget.replaceChildren();
    const widgetTarget = document.createElement("div");
    widgetTarget.className = "tradingview-widget-container__widget";
    widgetTarget.style.height = "100%";
    widgetTarget.style.width = "100%";
    widget.appendChild(widgetTarget);
    let active = true;
    let frame: HTMLIFrameElement | null = null;
    const timeout = window.setTimeout(() => { if (active) setState("error"); }, 15000);

    const onFrameLoad = () => {
      if (active) {
        window.clearTimeout(timeout);
        setState("ready");
      }
    };
    const onFrameError = () => {
      if (active) {
        window.clearTimeout(timeout);
        setState("error");
      }
    };
    const observer = new MutationObserver(() => {
      const found = widget.querySelector("iframe");
      if (found && found !== frame) {
        frame?.removeEventListener("load", onFrameLoad);
        frame?.removeEventListener("error", onFrameError);
        frame = found;
        frame.title = title;
        frame.addEventListener("load", onFrameLoad);
        frame.addEventListener("error", onFrameError);
      }
    });
    observer.observe(widget, { childList: true, subtree: true });

    const script = document.createElement("script");
    script.src = `${EMBED_ORIGIN}/embed-widget-${scriptName}.js`;
    script.async = true;
    script.textContent = JSON.stringify(config);
    script.onerror = () => {
      if (active) {
        window.clearTimeout(timeout);
        setState("error");
      }
    };
    widget.appendChild(script);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      observer.disconnect();
      frame?.removeEventListener("load", onFrameLoad);
      frame?.removeEventListener("error", onFrameError);
      script.onerror = null;
      widget.replaceChildren();
    };
  }, [attempt, config, scriptName, title]);

  return (
    <section ref={sectionRef} tabIndex={-1} className={className} aria-label={title}>
      <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card" style={{ height }} aria-busy={state === "loading"}>
        <div ref={widgetRef} className="tradingview-widget-container h-full w-full" style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
        {state === "loading" && <p role="status" className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">Загружается виджет TradingView…</p>}
        {state === "error" && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center">
            <p className="text-sm text-foreground">Виджет TradingView сейчас недоступен.</p>
            <Button type="button" variant="outline" aria-label={`Повторить загрузку: ${title}`} onClick={() => { restoreFocus.current = true; setState("loading"); setAttempt((value) => value + 1); }}>Повторить загрузку</Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Источник данных виджета: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">TradingView</a>. Время обновления определяет TradingView.
      </p>
    </section>
  );
}

export function TradingViewMarketOverview({ theme, height, className }: WidgetProps) {
  const colorTheme = useWidgetTheme(theme);
  const widgetHeight = safeHeight(height, 440);
  const config = useMemo(() => ({
    colorTheme,
    locale: "ru",
    isTransparent: true,
    showSymbolLogo: true,
    showChart: true,
    width: "100%",
    height: widgetHeight,
    tabs: [{ title: "Индикаторы рынка (CFD)", symbols: MARKET_INDICATORS, originalTitle: "Indices" }],
  }), [colorTheme, widgetHeight]);

  return <TradingViewEmbed key={`${colorTheme}-${widgetHeight}`} title="Индикаторы рынка (CFD): S&P 500, Dow Jones, Nasdaq 100, FOREX.com через TradingView" scriptName="market-overview" config={config} height={widgetHeight} className={className} />;
}

export function TradingViewStockHeatmap({ theme, height, className }: WidgetProps) {
  const colorTheme = useWidgetTheme(theme);
  const widgetHeight = safeHeight(height, 520);
  const config = useMemo(() => ({
    colorTheme,
    locale: "ru",
    isTransparent: true,
    dataSource: "SPX500",
    grouping: "sector",
    blockSize: "market_cap_basic",
    blockColor: "change",
    hasTopBar: false,
    width: "100%",
    height: widgetHeight,
  }), [colorTheme, widgetHeight]);

  return <TradingViewEmbed key={`${colorTheme}-${widgetHeight}`} title="Карта акций индекса S&P 500, TradingView" scriptName="stock-heatmap" config={config} height={widgetHeight} className={className} />;
}

// Fixture records intentionally have a synthetic exchange. These aliases identify
// only the independent external chart; they never supply prices to the app.
const FIXTURE_EXCHANGES: Readonly<Record<string, "NASDAQ" | "NYSE">> = {
  AAPL: "NASDAQ", MSFT: "NASDAQ", NVDA: "NASDAQ", AMZN: "NASDAQ", TSLA: "NASDAQ", "BRK.B": "NYSE", KO: "NYSE",
};

type StockChartProps = WidgetProps & Pick<StockCompany, "symbol" | "exchange" | "source">;

export function TradingViewStockChart({ symbol, exchange, source, theme, height, className }: StockChartProps) {
  const colorTheme = useWidgetTheme(theme);
  const widgetHeight = safeHeight(height, 440);
  const venue = source === "fixture" ? FIXTURE_EXCHANGES[symbol]
    : /^NASDAQ(?:\b|\/)/i.test(exchange ?? "") ? "NASDAQ"
      : /^(?:NYSE(?:\b|\/)|NEW YORK STOCK EXCHANGE\b)/i.test(exchange ?? "") ? "NYSE" : undefined;
  const chartSymbol = venue && US_SYMBOL.test(`${venue}:${symbol}`) ? `${venue}:${symbol}` : null;
  const config = useMemo(() => ({
    colorTheme,
    locale: "ru",
    isTransparent: true,
    chartOnly: false,
    chartType: "area",
    autosize: true,
    width: "100%",
    height: "100%",
    symbols: chartSymbol ? [[`${chartSymbol}|1D`]] : [],
    dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
  }), [chartSymbol, colorTheme]);

  if (!chartSymbol) return <p role="status" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">График недоступен: для этой акции не удалось определить биржу NASDAQ или NYSE. Цена и новости приложения доступны отдельно.</p>;

  return <div className={className}>
    <p className="mb-3 text-sm text-muted-foreground">{source === "fixture"
      ? "Это внешний график реального рынка TradingView. Он не связан с синтетической ценой приложения и может показывать другие значения."
      : "Это независимый график TradingView. Его цена и время обновления могут отличаться от котировки приложения."} Для загрузки нужен интернет.</p>
    <TradingViewEmbed key={`${chartSymbol}-${colorTheme}-${widgetHeight}`} title={`График ${chartSymbol}, TradingView`} scriptName="symbol-overview" config={config} height={widgetHeight} />
  </div>;
}
