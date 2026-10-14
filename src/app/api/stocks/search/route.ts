import { stockSearchQuerySchema } from "@/contracts";
import { marketResponse } from "@/server/market/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return marketResponse(request, async (client) => {
    const { q } = stockSearchQuerySchema.parse({ q: new URL(request.url).searchParams.get("q") });
    return client.search(q);
  });
}
