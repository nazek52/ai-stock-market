import { AppShell } from "@/components/app-shell";
import { Watchlist } from "@/components/watchlist/watchlist";

export default function WatchlistPage() {
  return (
    <AppShell active="Мой список">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ЛИЧНЫЙ СПИСОК</span>
          <h1>Избранные акции</h1>
          <p>Следите за выбранными компаниями. Цена и изменение могут быть недоступны, если источник данных не отвечает.</p>
        </div>
      </div>
      <Watchlist />
    </AppShell>
  );
}
