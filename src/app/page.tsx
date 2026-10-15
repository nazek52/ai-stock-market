import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardNews, DashboardQuotes } from "@/components/market/dashboard-data";
import { DashboardWatchlist } from "@/components/market/dashboard-watchlist";
import {
  TradingViewMarketOverview,
  TradingViewStockHeatmap,
} from "@/components/market/tradingview-widgets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <AppShell active="Обзор">
      <div className="page-heading">
        <div>
          <span className="eyebrow">РЫНОК США</span>
          <h1>Обзор рынка</h1>
          <p>Следите за акциями США, новостями и собственным списком. Данные каждого источника показаны отдельно.</p>
        </div>
        <Link className="button button-primary" href="/search">Найти акцию <span aria-hidden="true">↗</span></Link>
      </div>

      <div className="grid min-w-0 gap-5">
        <section aria-labelledby="widgets-heading" className="grid min-w-0 gap-5">
          <div>
            <h2 id="widgets-heading">Виджеты рынка</h2>
            <p>Данные в этих блоках предоставляет TradingView. Частота обновления зависит от TradingView и доступности его сервиса.</p>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle><h3>Индексы рынка</h3></CardTitle>
                <CardDescription>S&amp;P 500, Dow Jones, Nasdaq Composite · Источник: TradingView</CardDescription>
              </CardHeader>
              <CardContent className="min-w-0">
                <TradingViewMarketOverview />
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle><h3>Карта рынка</h3></CardTitle>
                <CardDescription>Источник: TradingView</CardDescription>
              </CardHeader>
              <CardContent className="min-w-0">
                <TradingViewStockHeatmap />
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="quotes-heading">
          <Card>
            <CardHeader>
              <CardTitle><h2 id="quotes-heading" className="m-0 text-base">Котировки</h2></CardTitle>
              <CardDescription>Собственные рыночные данные приложения</CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardQuotes />
            </CardContent>
          </Card>
        </section>

        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <section aria-labelledby="watchlist-heading">
            <Card className="h-full">
              <CardHeader>
                <CardTitle><h2 id="watchlist-heading" className="m-0 text-base">Мой список</h2></CardTitle>
                <CardDescription>Личные акции для отслеживания</CardDescription>
              </CardHeader>
              <CardContent>
                <DashboardWatchlist />
              </CardContent>
            </Card>
          </section>
          <section aria-labelledby="news-heading">
            <Card className="h-full">
              <CardHeader>
                <CardTitle><h2 id="news-heading" className="m-0 text-base">Новости компаний</h2></CardTitle>
                <CardDescription>Публикации из серверного источника</CardDescription>
              </CardHeader>
              <CardContent>
                <DashboardNews />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
