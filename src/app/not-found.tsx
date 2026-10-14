import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  return (
    <AppShell active="Страница не найдена">
      <section className="card empty-page" aria-labelledby="not-found-title">
        <span className="eyebrow">404</span>
        <h1 id="not-found-title">Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь к обзору.</p>
        <Link href="/" className="button button-primary">К обзору</Link>
      </section>
    </AppShell>
  );
}
