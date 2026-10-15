import { FlaskConical } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AlertScenario } from "@/components/demo/alert-scenario";
import { DigestScenario } from "@/components/demo/digest-scenario";
import { getSession } from "@/server/auth/session";

export const metadata = { title: "Демонстрация архитектуры | AI Stock Market" };

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  if (process.env.LOCAL_DEMO !== "true" || process.env.NODE_ENV === "production") notFound();
  if (!await getSession(await headers())) redirect("/login");
  return <AppShell active="Демонстрация">
    <div className="page-heading"><div><span className="eyebrow">ЛОКАЛЬНЫЙ СЦЕНАРИЙ</span><h1>Демонстрация архитектуры</h1><p>Контролируемые синтетические данные, MongoDB и Mailpit без облачных аккаунтов.</p></div><span className="status-pill"><FlaskConical size={13} aria-hidden="true" />Локальная версия</span></div>
    <div className="demo-layout motion-enter"><DigestScenario /><AlertScenario /></div>
  </AppShell>;
}
