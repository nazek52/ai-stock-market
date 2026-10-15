import { AppShell } from "@/components/app-shell";
import { StockSearch } from "@/components/stocks/stock-search";

export const metadata = { title: "Поиск компании | AI Stock Market" };

export default function SearchPage() {
  return (
    <AppShell active="Поиск">
      <div className="page-heading motion-enter">
        <div>
          <span className="section-kicker">ИССЛЕДУЙТЕ РЫНОК · АКЦИИ США</span>
          <h1>Поиск компании</h1>
          <p>Нужные инструменты — в одном поиске. Найдите компанию, изучите данные и сохраните в свой список.</p>
        </div>
      </div>
      <StockSearch />
    </AppShell>
  );
}
