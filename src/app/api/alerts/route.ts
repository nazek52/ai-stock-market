import { createAlertCollectionHandlers } from "@/server/alerts/http";
import { getMarketClient } from "@/server/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = createAlertCollectionHandlers(async (symbol) => { await getMarketClient().company(symbol); });
