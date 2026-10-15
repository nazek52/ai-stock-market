"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, ChartNoAxesCombined, RotateCcw, TriangleAlert } from "lucide-react";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="dark" /><title>Ошибка — AI Stock Market</title>
        <style>{`
          *{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#07090e;color:#edf2fa;font:16px/1.65 "Segoe UI",Arial,sans-serif;overflow-wrap:anywhere}
          .fallback{display:grid;align-content:center;gap:32px;min-height:100svh;max-width:760px;margin:0 auto;padding:clamp(20px,5vw,48px)}
          .fallback-brand{display:inline-flex;align-items:center;gap:12px;width:fit-content;max-width:100%;color:#edf2fa;font-size:19px;font-weight:650;letter-spacing:-.6px;text-decoration:none}
          .fallback-brand-mark,.fallback-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#14233d;border:1px solid #273247;color:#9ab9e8}
          .fallback-brand-mark{width:40px;height:40px;border-radius:12px}.fallback-brand small{font:inherit;color:#a2adbe}
          .fallback-panel{min-width:0;padding:clamp(24px,5vw,44px);border:1px solid #273247;border-radius:22px;background:linear-gradient(145deg,#111a29,#0e131d 65%);box-shadow:0 24px 80px #0005}
          .fallback-icon{width:64px;height:64px;margin-bottom:28px;border-radius:18px}.fallback-eyebrow{font-size:11px;font-weight:650;letter-spacing:1.8px;color:#a2adbe}
          .fallback h1{margin:12px 0 16px;font-size:clamp(26px,5vw,34px);line-height:1.25;font-weight:600;letter-spacing:-1px}.fallback p{margin:0;max-width:48ch;color:#a2adbe;font-size:15px}
          .fallback-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}.fallback-action{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:46px;max-width:100%;padding:12px 18px;border:1px solid #273247;border-radius:11px;background:#0e131d;color:#edf2fa;font:600 14px/1.5 "Segoe UI",Arial,sans-serif;text-align:center;text-decoration:none;white-space:normal;cursor:pointer}
          .fallback-action-primary{background:#3d66a8;border-color:#3d66a8}.fallback-action:hover{filter:brightness(1.15)}.fallback :focus-visible{outline:3px solid #9ab9e8;outline-offset:5px}
          @media(max-width:380px){.fallback-actions>*{width:100%}}
        `}</style>
      </head>
      <body>
        <main className="fallback" aria-labelledby="global-error-title">
          <Link className="fallback-brand" href="/" prefetch={false} aria-label="Stock Market — обзор"><span className="fallback-brand-mark" aria-hidden="true"><ChartNoAxesCombined size={21} strokeWidth={1.8} /></span><span>Stock<small>Market</small>.</span></Link>
          <section className="fallback-panel" aria-labelledby="global-error-title">
            <div className="fallback-icon" aria-hidden="true"><TriangleAlert size={28} strokeWidth={1.5} /></div>
            <span className="fallback-eyebrow">ПРИЛОЖЕНИЕ НЕДОСТУПНО</span>
            <h1 id="global-error-title" ref={headingRef} tabIndex={-1}>Не удалось открыть приложение</h1>
            <p>Попробуйте ещё раз. Если ошибка повторится, вернитесь к обзору и продолжите оттуда.</p>
            <div className="fallback-actions">
              <button type="button" onClick={retry} className="fallback-action fallback-action-primary"><RotateCcw aria-hidden="true" size={17} />Повторить</button>
              <Link href="/" prefetch={false} className="fallback-action"><ArrowLeft aria-hidden="true" size={17} />К обзору</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
