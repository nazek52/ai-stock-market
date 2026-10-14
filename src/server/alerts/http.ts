import "server-only";
import { priceAlertCreateSchema, priceAlertUpdateSchema } from "@/contracts";
import { requireSession } from "@/server/auth/session";
import { apiHandler, assertSameOrigin, jsonSuccess, parseJson, AppError } from "@/server/http";
import { createRule, deleteRule, listRules, updateRule, type StockResolver } from "./repository";
import { consumeQuota } from "@/server/rate-limit";

export const unconfiguredStockResolver: StockResolver = async () => {
  throw new AppError("SERVICE_UNAVAILABLE", "Alert stock validation is not configured", 503);
};

export function createAlertCollectionHandlers(resolveStock: StockResolver) {
  return {
    GET(request: Request) {
      return apiHandler(async () => {
        const { user } = await requireSession(request.headers);
        return jsonSuccess(await listRules(user.id));
      });
    },
    POST(request: Request) {
      return apiHandler(async () => {
        assertSameOrigin(request);
        const { user } = await requireSession(request.headers);
        const input = await parseJson(request, priceAlertCreateSchema);
        await consumeQuota(`alerts-write:${user.id}`, 60, 60_000);
        return jsonSuccess(await createRule(user.id, input, resolveStock), 201);
      });
    },
  };
}

export interface AlertRouteContext { params: Promise<{ id: string }> }

export function PATCH(request: Request, context: AlertRouteContext) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const { id } = await context.params;
    const input = await parseJson(request, priceAlertUpdateSchema);
    await consumeQuota(`alerts-write:${user.id}`, 60, 60_000);
    return jsonSuccess(await updateRule(user.id, id, input));
  });
}

export function DELETE(request: Request, context: AlertRouteContext) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const { id } = await context.params;
    await consumeQuota(`alerts-write:${user.id}`, 60, 60_000);
    return jsonSuccess(await deleteRule(user.id, id));
  });
}
