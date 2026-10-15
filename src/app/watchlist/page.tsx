import { AppShell } from "@/components/app-shell";
import { Watchlist } from "@/components/watchlist/watchlist";
import Link from "next/link";
import { Plus } from "lucide-react";

export const metadata = { title: "Избранные акции | AI Stock Market" };

export default function WatchlistPage() {
  return (
    <AppShell active="Мой список">
      <div className="page-heading motion-enter">
        <div>
          <span className="section-kicker">ВАШ ФОКУС · ЛИЧНЫЙ СПИСОК</span>
          <h1>Избранные акции</h1>
          <p>Следите за выбранными компаниями. Цена и изменение могут быть недоступны, если источник данных не отвечает.</p>
        </div>
        <Link href="/search" className="button button-primary"><Plus aria-hidden="true" className="size-4" />Добавить акцию</Link>
      </div>
      <Watchlist />
    </AppShell>
  );
}
