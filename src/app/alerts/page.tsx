import { AppShell } from "@/components/app-shell";
import { AlertRules } from "@/components/alerts/alert-rules";
import { getServerEnvironment } from "@/server/config";

export const metadata = { title: "Правила уведомлений | AI Stock Market" };

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  const env = getServerEnvironment();
  return <AppShell active="Уведомления">
    <div className="page-heading"><div>
      <span className="eyebrow">ЦЕНОВЫЕ УВЕДОМЛЕНИЯ</span>
      <h1>Правила уведомлений</h1>
      <p>Задайте ценовой порог для акции и управляйте письмами о его пересечении.</p>
    </div></div>
    <AlertRules pollSeconds={env.ALERT_POLL_SECONDS} scheduleEnabled={env.ALERT_SCHEDULE_ENABLED} marketMode={env.MARKET_DATA_MODE} />
  </AppShell>;
}
