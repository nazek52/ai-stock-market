import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ArrowLeft, Search, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <AppShell active="Страница не найдена">
      <section className="card relative mx-auto w-full min-w-0 max-w-2xl overflow-hidden p-6 sm:p-10" aria-labelledby="not-found-title">
        <span aria-hidden="true" className="absolute right-6 top-5 text-7xl font-semibold tracking-tighter text-[#273247]/70 sm:right-10 sm:text-8xl">404</span>
        <div aria-hidden="true" className="relative mb-8 flex size-16 items-center justify-center rounded-2xl border border-[#273247] bg-[#14233d] text-[#9ab9e8]"><SearchX size={28} strokeWidth={1.5} /></div>
        <span className="eyebrow">НЕИЗВЕСТНЫЙ АДРЕС</span>
        <h1 id="not-found-title" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Страница не найдена</h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">Возможно, адрес изменился или в нём опечатка. Вернитесь к обзору или найдите нужную акцию через поиск.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="button button-primary"><ArrowLeft aria-hidden="true" size={17} />К обзору</Link>
          <Link href="/search" className="button button-outline"><Search aria-hidden="true" size={17} />Найти акцию</Link>
        </div>
      </section>
    </AppShell>
  );
}
