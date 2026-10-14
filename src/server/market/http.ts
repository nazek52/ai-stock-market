import "server-only";
import { requireSession } from "@/server/auth/session";
import { getServerEnvironment } from "@/server/config";
import { apiHandler, jsonSuccess } from "@/server/http";
import { consumeQuota } from "@/server/rate-limit";
import { getMarketClient, type MarketClient } from "./index";

export function marketResponse<T>(request: Request, operation: (client: MarketClient) => Promise<T>) {
  return apiHandler(async () => {
    const { user } = await requireSession(request.headers);
    await consumeQuota(`market-read:${user.id}`, 60, 60000);
    const response = jsonSuccess(await operation(getMarketClient()));
    response.headers.set("X-Market-Data-Mode", getServerEnvironment().MARKET_DATA_MODE);
    return response;
  });
}
