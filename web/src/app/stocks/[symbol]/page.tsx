import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MarketEmptyState } from "@/components/market/market-empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findDemoStock } from "@/lib/demo-stocks";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const stock = findDemoStock(symbol);

  if (!stock) {
    return (
      <AppShell active="Акция">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ДЕМОНСТРАЦИОННЫЙ СПИСОК</span>
            <h1>Символ не найден</h1>
            <p>Этого тикера пока нет в демонстрационном списке. Полный поиск станет доступен после подключения рыночного API.</p>
          </div>
        </div>
        <Card className="max-w-2xl">
          <CardContent>
            <MarketEmptyState
              kind="empty"
              title="Попробуйте другой тикер"
              description="Проверьте написание символа или вернитесь к поиску. Отсутствие в демонстрационном списке не означает, что такой акции нет на рынке."
              action={{ href: "/search", label: "Вернуться к поиску" }}
            />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell active={stock.symbol}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ДЕМОНСТРАЦИОННАЯ КАРТОЧКА · {stock.exchange}</span>
          <h1>{stock.name}</h1>
          <p>Тикер {stock.symbol}. Сейчас доступны только название и биржа из демонстрационного списка.</p>
        </div>
        <Link className="button button-outline" href="/search">← К поиску</Link>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-muted px-5 py-4 text-sm text-foreground" role="status">
        Рыночные данные для этой акции пока не подключены. Цены, изменение и время обновления появятся только после получения данных от серверного источника.
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section aria-labelledby="price-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle><h2 id="price-heading" className="m-0 text-base">Цена и изменение</h2></CardTitle>
              <CardDescription>Источник котировки: ожидается Finnhub</CardDescription>
            </CardHeader>
            <CardContent>
              <MarketEmptyState kind="unavailable" title="Котировка недоступна" description="Мы не показываем цену или изменение без подтверждённых данных и времени их обновления." />
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="chart-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle><h2 id="chart-heading" className="m-0 text-base">График</h2></CardTitle>
              <CardDescription>Историческое движение цены</CardDescription>
            </CardHeader>
            <CardContent>
              <MarketEmptyState kind="unavailable" title="График не подключён" description="График появится после согласования источника и интеграции виджета для отдельной акции." />
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="company-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle><h2 id="company-heading" className="m-0 text-base">О компании и показатели</h2></CardTitle>
              <CardDescription>Профиль компании и финансовые данные</CardDescription>
            </CardHeader>
            <CardContent>
              <MarketEmptyState kind="unavailable" title="Данные компании недоступны" description="Описание и основные показатели появятся после подключения проверенного источника." />
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="news-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle><h2 id="news-heading" className="m-0 text-base">Новости</h2></CardTitle>
              <CardDescription>Публикации о компании</CardDescription>
            </CardHeader>
            <CardContent>
              <MarketEmptyState kind="unavailable" title="Новости недоступны" description="Когда новости будут подключены, здесь появятся даты публикаций и ссылки на первоисточники." />
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="mt-5" aria-labelledby="watchlist-heading">
        <Card>
          <CardHeader>
            <CardTitle><h2 id="watchlist-heading" className="m-0 text-base">Мой список</h2></CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-prose text-sm text-muted-foreground">Добавление этой акции станет доступно после подключения защищённого списка отслеживания.</p>
            <Link className="button button-outline" href="/watchlist">Открыть раздел списка</Link>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
