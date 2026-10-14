import { AppShell } from "@/components/app-shell";
import { StockSearch } from "@/components/stocks/stock-search";

export default function SearchPage() {
  return (
    <AppShell active="Поиск">
      <div className="page-heading">
        <div>
          <span className="eyebrow">АКЦИИ США</span>
          <h1>Поиск компании</h1>
          <p>Найдите акцию по тикеру или названию и откройте её карточку.</p>
        </div>
      </div>
      <StockSearch />
    </AppShell>
  );
}
