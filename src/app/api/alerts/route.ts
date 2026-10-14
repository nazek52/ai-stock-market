import { createAlertCollectionHandlers, unconfiguredStockResolver } from "@/server/alerts/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Root wires the actual market resolver after the independent stage-3 adapter is integrated.
export const { GET, POST } = createAlertCollectionHandlers(unconfiguredStockResolver);
