import Link from "next/link";
import { ArrowUpRight, Bookmark, ChartNoAxesCombined, Globe2, LayoutGrid, ListFilter, Newspaper, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DashboardNews, DashboardQuotes } from "@/components/market/dashboard-data";
import { DashboardWatchlist } from "@/components/market/dashboard-watchlist";
import { TradingViewMarketOverview, TradingViewStockHeatmap } from "@/components/market/tradingview-widgets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Обзор рынка | AI Stock Market" };

export default function Home() {
  return <AppShell active="Обзор">
    <div className="page-heading dashboard-heading">
      <div>
        <span className="eyebrow">ВАШ ВЗГЛЯД НА РЫНОК</span>
        <h1>Обзор рынка</h1>
        <p>Акции США, новости компаний и ваш список наблюдения.<br className="hidden sm:block" /> Всё, к чему вы хотите вернуться.</p>
        <div className="heading-meta"><span><Globe2 size={13} aria-hidden="true" />США · USD</span><span className="meta-separator" aria-hidden="true" /><span>Источники данных указаны отдельно</span></div>
      </div>
      <div className="flex max-w-full flex-wrap gap-3">
        <Link className="button button-outline" href="/watchlist"><Bookmark size={15} aria-hidden="true" />Мой список</Link>
        <Link className="button button-primary" href="/search"><Search size={15} aria-hidden="true" />Найти акцию<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
    <div className="dashboard-grid">
      <section className="motion-enter min-w-0" aria-labelledby="quotes-heading">
        <div className="dashboard-section-heading"><div><h2 id="quotes-heading">Акции в фокусе</h2><p>Котировки приложения · источник и время для каждой цены</p></div><span className="section-kicker hidden sm:inline-flex">AAPL / MSFT / NVDA</span></div>
        <DashboardQuotes />
      </section>
      <section className="motion-enter grid min-w-0 gap-4" aria-labelledby="widgets-heading">
        <div className="dashboard-section-heading"><div><h2 id="widgets-heading">Рыночная картина</h2><p>Независимые виджеты TradingView</p></div><span className="status-pill"><Globe2 size={11} aria-hidden="true" />Внешний источник</span></div>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader><div className="widget-heading"><span className="widget-icon"><ChartNoAxesCombined size={17} strokeWidth={1.6} aria-hidden="true" /></span><CardTitle><h3>Индикаторы рынка</h3></CardTitle><span className="status-pill ml-auto">CFD</span></div><CardDescription>CFD FOREX.com · S&amp;P 500, Dow Jones, Nasdaq 100</CardDescription></CardHeader>
            <CardContent><TradingViewMarketOverview /><details className="widget-disclosure"><summary>Об источнике и инструментах</summary><p className="mt-2 text-xs">CFD FOREX.com через TradingView — производные инструменты, цены которых могут отличаться от индексов. Nasdaq 100 не является Nasdaq Composite. Это отдельные данные от котировок приложения.</p></details></CardContent>
          </Card>
          <Card>
            <CardHeader><div className="widget-heading"><span className="widget-icon"><LayoutGrid size={16} strokeWidth={1.6} aria-hidden="true" /></span><CardTitle><h3>Карта рынка</h3></CardTitle></div><CardDescription>Компании S&amp;P 500 · по секторам</CardDescription></CardHeader>
            <CardContent><TradingViewStockHeatmap height={440} /></CardContent>
          </Card>
        </div>
      </section>
      <div className="dashboard-secondary motion-enter">
        <section aria-labelledby="watchlist-heading"><Card className="h-full"><CardHeader><div className="widget-heading"><span className="widget-icon"><ListFilter size={16} strokeWidth={1.6} aria-hidden="true" /></span><CardTitle><h2 id="watchlist-heading">Мой список</h2></CardTitle></div><CardDescription>Компании, за которыми вы следите</CardDescription></CardHeader><CardContent><DashboardWatchlist /></CardContent></Card></section>
        <section aria-labelledby="news-heading"><Card className="h-full"><CardHeader><div className="widget-heading"><span className="widget-icon"><Newspaper size={16} strokeWidth={1.6} aria-hidden="true" /></span><CardTitle><h2 id="news-heading">Новости компаний</h2></CardTitle></div><CardDescription>Заголовки, источники и время публикации</CardDescription></CardHeader><CardContent><DashboardNews /></CardContent></Card></section>
      </div>
    </div>
  </AppShell>;
}
