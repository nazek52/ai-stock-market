import { symbolSchema } from "@/contracts";
import { marketResponse } from "@/server/market/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  return marketResponse(request, async (client) => client.quote(symbolSchema.parse((await context.params).symbol)));
}
