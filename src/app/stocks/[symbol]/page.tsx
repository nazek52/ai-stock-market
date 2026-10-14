import { notFound } from "next/navigation";
import { symbolSchema } from "@/contracts";
import { StockDetail } from "@/components/stocks/stock-detail";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const parsed = symbolSchema.safeParse((await params).symbol);
  if (!parsed.success) notFound();
  return <StockDetail symbol={parsed.data} />;
}
