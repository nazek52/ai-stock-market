"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, Bookmark, ChevronRight, FlaskConical, Layers3, LayoutDashboard, Search, Settings2 } from "lucide-react";
import { SessionActions } from "@/components/auth/session-actions";
import { useDemoMode } from "@/components/demo-mode";
import { Brand } from "@/components/brand";

const items = [
  { label: "Обзор", href: "/", icon: LayoutDashboard },
  { label: "Поиск", href: "/search", icon: Search },
  { label: "Мой список", href: "/watchlist", icon: Bookmark },
  { label: "Уведомления", href: "/alerts", icon: Bell },
  { label: "Настройки", href: "/settings", icon: Settings2 },
] as const;

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const demoMode = useDemoMode();
  return <div className="app">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <aside className="sidebar">
      <div className="sidebar-brand-row"><Brand /><span className="workspace-label">WORKSPACE</span></div>
      <span className="nav-caption">ВАШЕ ПРОСТРАНСТВО</span>
      <nav className="nav" aria-label="Основная навигация">
        {items.map(({ icon: Icon, ...item }) => <Link key={item.href} href={item.href} className="nav-link" aria-current={active === item.label ? "page" : undefined}><Icon className="nav-icon" size={18} strokeWidth={1.6} aria-hidden="true" /><span>{item.label}</span>{active === item.label && <span className="nav-active-dot" aria-hidden="true" />}</Link>)}
        {demoMode && <Link href="/demo" className="nav-link" aria-current={active === "Демонстрация" ? "page" : undefined}><FlaskConical className="nav-icon" size={18} strokeWidth={1.6} aria-hidden="true" /><span>Демонстрация</span>{active === "Демонстрация" && <span className="nav-active-dot" aria-hidden="true" />}</Link>}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-context"><Layers3 size={20} strokeWidth={1.5} aria-hidden="true" /><strong>Всё важное — рядом</strong><p>Акции, новости и ваши списки в одном пространстве.</p><Link href="/watchlist">Открыть мой список <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        <p className="sidebar-note">Информационный сервис.<br />Не является инвестиционной рекомендацией.</p>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb"><span>Платформа</span><ChevronRight size={13} aria-hidden="true" /><strong>{active}</strong></div><div className="topbar-actions"><Link href="/search" className="header-search" aria-label="Найти акцию"><Search size={16} aria-hidden="true" /><span>Найти акцию</span></Link><span className="topbar-divider" aria-hidden="true" /><SessionActions /></div></header>
      <main id="main" tabIndex={-1} className="content">{children}</main>
    </div>
  </div>;
}
