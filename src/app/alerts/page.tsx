import { AppShell } from "@/components/app-shell";
import { AlertRules } from "@/components/alerts/alert-rules";
import { getServerEnvironment } from "@/server/config";
import Link from "next/link";
import { Settings2 } from "lucide-react";

export const metadata = { title: "Правила уведомлений | AI Stock Market" };

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  const env = getServerEnvironment();
  return <AppShell active="Уведомления">
    <div className="page-heading motion-enter"><div>
      <span className="section-kicker">НАБЛЮДЕНИЕ · ЦЕНОВЫЕ УРОВНИ</span>
      <h1>Правила уведомлений</h1>
      <p>Задайте ценовой порог для акции и управляйте письмами о его пересечении.</p>
    </div><Link href="/settings" className="button button-outline"><Settings2 aria-hidden="true" className="size-4" />Настройки писем</Link></div>
    <AlertRules pollSeconds={env.ALERT_POLL_SECONDS} scheduleEnabled={env.ALERT_SCHEDULE_ENABLED} marketMode={env.MARKET_DATA_MODE} />
  </AppShell>;
}
