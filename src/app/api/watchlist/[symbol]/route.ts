import { symbolSchema } from "@/contracts";
import { requireSession } from "@/server/auth/session";
import { apiHandler, assertSameOrigin, jsonSuccess } from "@/server/http";
import { consumeQuota } from "@/server/rate-limit";
import { deleteWatchlistItem } from "@/server/watchlist/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function DELETE(request: Request, context: { params: Promise<{ symbol: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const symbol = symbolSchema.parse((await context.params).symbol);
    await consumeQuota(`watchlist-write:${user.id}`, 60, 60_000);
    return jsonSuccess({ deleted: await deleteWatchlistItem(user.id, symbol) });
  });
}
