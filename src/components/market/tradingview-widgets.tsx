"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const EMBED_ORIGIN = "https://s3.tradingview.com/external-embedding";
const DEFAULT_SYMBOLS = ["NASDAQ:AAPL", "NASDAQ:MSFT", "NASDAQ:NVDA"] as const;
const US_SYMBOL = /^(NASDAQ|NYSE):[A-Z][A-Z0-9.-]{0,14}$/;

type Theme = "light" | "dark";
type WidgetProps = { theme?: Theme; height?: number; className?: string };
type MarketOverviewProps = WidgetProps & { symbols?: readonly string[] };
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
  scriptName: "market-overview" | "stock-heatmap";
  config: EmbedConfig;
  height: number;
  className?: string;
}) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

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
    <section className={className} aria-label={title}>
      <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card" style={{ height }} aria-busy={state === "loading"}>
        <div ref={widgetRef} className="tradingview-widget-container h-full w-full" style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
        {state === "loading" && <p role="status" className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">Загружается виджет TradingView…</p>}
        {state === "error" && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center">
            <p className="text-sm text-foreground">Виджет TradingView сейчас недоступен.</p>
            <Button type="button" variant="outline" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>Повторить загрузку</Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Источник данных виджета: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">TradingView</a>. Время обновления определяет TradingView.
      </p>
    </section>
  );
}

export function TradingViewMarketOverview({ symbols = DEFAULT_SYMBOLS, theme, height, className }: MarketOverviewProps) {
  const colorTheme = useWidgetTheme(theme);
  const validSymbols = symbols.filter((symbol) => US_SYMBOL.test(symbol)).slice(0, 12);
  const symbolKey = validSymbols.length ? validSymbols.join(",") : DEFAULT_SYMBOLS.join(",");
  const widgetHeight = safeHeight(height, 440);
  const config = useMemo(() => ({
    colorTheme,
    locale: "ru",
    isTransparent: true,
    showSymbolLogo: true,
    showChart: true,
    width: "100%",
    height: widgetHeight,
    tabs: [{ title: "Акции США", symbols: symbolKey.split(",").map((symbol) => ({ s: symbol })) }],
  }), [colorTheme, widgetHeight, symbolKey]);

  return <TradingViewEmbed key={`${symbolKey}-${colorTheme}-${widgetHeight}`} title="Обзор акций США, TradingView" scriptName="market-overview" config={config} height={widgetHeight} className={className} />;
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
