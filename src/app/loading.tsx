import { AppShell } from "@/components/app-shell";
import { ChartNoAxesCombined } from "lucide-react";

export default function Loading() {
  return <AppShell active="Загрузка">
    <section className="grid min-w-0 gap-6" role="status" aria-live="polite">
      <div className="flex min-w-0 items-start gap-4">
        <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[#273247] bg-[#14233d] text-[#9ab9e8]"><ChartNoAxesCombined size={23} strokeWidth={1.5} /></div>
        <div className="min-w-0"><span className="eyebrow">РАБОЧАЯ ОБЛАСТЬ</span><h1 className="mt-2 text-2xl font-semibold tracking-tight">Загружаем страницу</h1><p className="mt-2 text-sm text-muted-foreground">Готовим данные для вашего следующего шага.</p></div>
      </div>
      <div aria-hidden="true" className="grid min-w-0 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="card min-w-0 space-y-5 p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-[#273247] motion-reduce:animate-none" />
          <div className="h-7 w-32 max-w-full animate-pulse rounded bg-[#273247] motion-reduce:animate-none" />
          <div className="h-2 w-3/4 animate-pulse rounded bg-[#14233d] motion-reduce:animate-none" />
        </div>)}
        <div className="card min-w-0 p-5 md:col-span-3 sm:p-7">
          <div className="mb-7 h-4 w-40 max-w-full animate-pulse rounded bg-[#273247] motion-reduce:animate-none" />
          <div className="flex h-48 items-end gap-3 border-b border-[#273247] pb-3 sm:h-64 sm:gap-5">
            {["h-2/5", "h-3/5", "h-1/2", "h-4/5", "h-3/5", "h-full", "h-4/5"].map((height, index) => <div key={index} className={`${height} min-w-0 flex-1 animate-pulse rounded-t bg-[#14233d] motion-reduce:animate-none`} />)}
          </div>
        </div>
      </div>
    </section>
  </AppShell>;
}
