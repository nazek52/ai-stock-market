"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" className="content grid min-h-[90vh] content-center gap-8">
      <div className="mx-auto w-full max-w-2xl"><Brand /></div>
      <section className="card relative mx-auto w-full min-w-0 max-w-2xl overflow-hidden p-6 sm:p-10" aria-labelledby="page-error-title">
        <div aria-hidden="true" className="mb-7 flex size-16 items-center justify-center rounded-2xl border border-[#273247] bg-[#14233d] text-[#9ab9e8]"><TriangleAlert size={27} strokeWidth={1.5} /></div>
        <span className="eyebrow">СТРАНИЦА НЕДОСТУПНА</span>
        <h1 id="page-error-title" ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Не удалось открыть страницу</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">Попробуйте загрузить её ещё раз. Если ошибка повторится, вернитесь к обзору и продолжите оттуда.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={retry}><RotateCcw aria-hidden="true" size={17} />Повторить</Button>
          <Link href="/" className="button button-outline"><ArrowLeft aria-hidden="true" size={17} />К обзору</Link>
        </div>
      </section>
    </main>
  );
}
