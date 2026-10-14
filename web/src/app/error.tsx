"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" className="content">
      <section className="card empty-page" aria-labelledby="page-error-title">
        <span className="eyebrow">ОШИБКА</span>
        <h1 id="page-error-title" ref={headingRef} tabIndex={-1}>Не удалось открыть страницу</h1>
        <p>Попробуйте ещё раз. Если ошибка повторится, вернитесь к обзору.</p>
        <button type="button" onClick={retry} className="button button-primary">Повторить</button>{" "}
        <Link href="/" className="button button-outline">К обзору</Link>
      </section>
    </main>
  );
}
