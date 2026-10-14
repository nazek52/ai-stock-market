import { watchlistAddSchema } from "@/contracts";
import { requireSession } from "@/server/auth/session";
import { apiHandler, assertSameOrigin, jsonSuccess, parseJson } from "@/server/http";
import { getMarketClient } from "@/server/market";
import { consumeQuota } from "@/server/rate-limit";
import { addWatchlistItem, listWatchlistItems } from "@/server/watchlist/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return apiHandler(async () => {
    const { user } = await requireSession(request.headers);
    return jsonSuccess(await listWatchlistItems(user.id));
  });
}
export function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const input = await parseJson(request, watchlistAddSchema);
    await consumeQuota(`watchlist-write:${user.id}`, 60, 60_000);
    const company = await getMarketClient().company(input.symbol);
    const result = await addWatchlistItem(user.id, company);
    return jsonSuccess(result.item, result.created ? 201 : 200);
  });
}
