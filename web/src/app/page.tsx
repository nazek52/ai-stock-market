import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function Home() {
  return <AppShell active="Обзор">
    <div className="page-heading"><div><span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>Рынок под вашим взглядом.</h1><p>Соберите интересующие компании в одном месте. Данные рынка появятся после подключения поставщика.</p></div><Link className="button button-primary" href="/search">Найти акцию <span aria-hidden="true">↗</span></Link></div>
    <div className="overview-grid">
      <section className="card feature-card" aria-labelledby="market-title"><div className="card-topline"><span className="eyebrow">ОБЗОР РЫНКА</span><span className="status-pill">Ожидает данные</span></div><div className="feature-content"><div className="chart-mark" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div><h2 id="market-title">Рыночные данные пока не подключены</h2><p>Здесь будут индексы, графики и время последнего обновления. Мы покажем источник каждой котировки.</p></div></section>
      <section className="card side-card" aria-labelledby="watchlist-title"><div className="card-topline"><span className="eyebrow">МОЙ СПИСОК</span></div><div className="empty-icon" aria-hidden="true">☆</div><h2 id="watchlist-title">Пока пусто</h2><p>Добавленные акции будут здесь. Список станет доступен после подключения учётных записей.</p><Link className="text-link" href="/watchlist">Открыть список <span aria-hidden="true">→</span></Link></section>
    </div>
    <section className="card next-card" aria-labelledby="next-title"><div><span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h2 id="next-title">Следите за тем, что важно вам</h2><p>Поиск, личный список и уведомления появятся по мере подключения серверных функций.</p></div><Link className="button button-outline" href="/search">Перейти к поиску <span aria-hidden="true">→</span></Link></section>
  </AppShell>;
}
