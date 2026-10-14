"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang="ru">
      <head><title>Ошибка — AI Stock Market</title></head>
      <body style={{ margin: 0, background: "#f5f7fb", color: "#15243c", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <main style={{ maxWidth: 680, margin: "10vh auto", padding: 24 }}>
          <h1 ref={headingRef} tabIndex={-1}>Не удалось открыть приложение</h1>
          <p>Попробуйте ещё раз. Если ошибка повторится, вернитесь к обзору.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 24 }}>
            <button type="button" onClick={retry} style={{ font: "inherit", padding: "12px 18px", cursor: "pointer" }}>Повторить</button>
            <Link href="/" style={{ padding: "12px 18px", color: "#1746c8" }}>К обзору</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
