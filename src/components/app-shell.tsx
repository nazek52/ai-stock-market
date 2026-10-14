import Link from "next/link";
import { SessionActions } from "@/components/auth/session-actions";

const items = [
  { label: "Обзор", href: "/", icon: "▦" },
  { label: "Поиск", href: "/search", icon: "⌕" },
  { label: "Мой список", href: "/watchlist", icon: "☆" },
  { label: "Уведомления", href: "/alerts", icon: "♧" },
  { label: "Настройки", href: "/settings", icon: "⚙" },
] as const;

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  return <div className="app">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">↗</span><span>Stock Market</span></Link>
      <span className="nav-caption">РАБОЧАЯ ОБЛАСТЬ</span>
      <nav className="nav" aria-label="Основная навигация">
        {items.map((item) => <Link key={item.href} href={item.href} className="nav-link" aria-current={active === item.label ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
      </nav>
      <p className="sidebar-note">Информационный сервис. Не является инвестиционной рекомендацией.</p>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb">Рабочая область <span aria-hidden="true"> / </span> <strong>{active}</strong></div><SessionActions /></header>
      <main id="main" className="content">{children}</main>
    </div>
  </div>;
}
