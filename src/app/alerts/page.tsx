import { AppShell } from "@/components/app-shell";
import { AlertRules } from "@/components/alerts/alert-rules";

export default function AlertsPage() {
  return <AppShell active="Уведомления">
    <div className="page-heading"><div>
      <span className="eyebrow">ЦЕНОВЫЕ УВЕДОМЛЕНИЯ</span>
      <h1>Правила уведомлений</h1>
      <p>Задайте ценовой порог для акции и управляйте письмами о его пересечении.</p>
    </div></div>
    <AlertRules />
  </AppShell>;
}
