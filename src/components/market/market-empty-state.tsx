import Link from "next/link";

type MarketEmptyStateProps = {
  kind: "empty" | "unavailable" | "error";
  title: string;
  description: string;
  action?: { href: string; label: string };
};

const statusLabels = {
  empty: "Пока нет данных",
  unavailable: "Источник не подключён",
  error: "Источник временно недоступен",
} as const;

export function MarketEmptyState({ kind, title, description, action }: MarketEmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 sm:p-6">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statusLabels[kind]}</span>
      <h3 className="mt-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
      {action && <Link className="mt-4 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline" href={action.href}>{action.label} <span aria-hidden="true">→</span></Link>}
    </div>
  );
}
