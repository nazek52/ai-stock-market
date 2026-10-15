import { AppShell } from "@/components/app-shell";

export default function Loading() {
  return <AppShell active="Загрузка">
    <section className="card empty-page" role="status" aria-live="polite">
      <span className="eyebrow">ЗАГРУЗКА</span>
      <h1>Загружаем страницу</h1>
      <p>Подождите немного.</p>
    </section>
  </AppShell>;
}
