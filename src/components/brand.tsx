import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand${compact ? " brand-compact" : ""}`} href="/" aria-label="Stock Market — обзор">
    <span className="brand-mark" aria-hidden="true"><ChartNoAxesCombined size={21} strokeWidth={1.8} /></span>
    <span>Stock<span className="brand-secondary">Market</span><span className="brand-dot" aria-hidden="true">.</span></span>
  </Link>;
}
