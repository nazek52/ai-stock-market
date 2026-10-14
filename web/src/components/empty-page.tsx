import Link from "next/link";
import { AppShell } from "./app-shell";

export function EmptyPage({ title, description, icon, label }: { title: string; description: string; icon: string; label: string }) {
  return <AppShell active={label}>
    <div className="page-heading"><div><span className="eyebrow">{label.toUpperCase()}</span><h1>{title}</h1><p>{description}</p></div></div>
    <section className="card empty-page" aria-labelledby="empty-title"><div className="empty-icon" aria-hidden="true">{icon}</div><h2 id="empty-title">Раздел готов к подключению</h2><p>Пока здесь нет пользовательских данных. Функция появится после согласования серверного контракта и подключения соответствующего этапа плана.</p><Link href="/" className="button button-outline">Вернуться к обзору <span aria-hidden="true">→</span></Link></section>
  </AppShell>;
}
