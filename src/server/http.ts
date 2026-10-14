import "server-only";
import { z } from "zod";
import type { ApiError, ApiResult } from "@/contracts";
import { getServerEnvironment } from "./config";
import { AppError } from "./errors";

export { AppError } from "./errors";

export function jsonSuccess<T>(data: T, status = 200) {
  return Response.json({ ok: true, data } satisfies ApiResult<T>, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function assertSameOrigin(request: Request) {
  const expected = new URL(getServerEnvironment().BETTER_AUTH_URL).origin;
  if (request.headers.get("origin") !== expected) {
    throw new AppError("FORBIDDEN", "Request origin is not allowed", 403);
  }
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new AppError("INVALID_INPUT", "Use application/json", 400);
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new AppError("INVALID_INPUT", "Request body is too large", 413);
      }
      chunks.push(value);
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("INVALID_INPUT", "Request body must be valid JSON", 400);
  }
  return schema.parse(parsed);
}

export async function apiHandler(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    let body: ApiError;
    let status: number;
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (error instanceof z.ZodError) {
      body = { code: "INVALID_INPUT", message: "Request validation failed" };
      status = 400;
    } else if (error instanceof AppError) {
      body = { code: error.code, message: error.message } as ApiError;
      status = error.status;
      if (error.retryAfterSeconds) {
        headers["Retry-After"] = String(error.retryAfterSeconds);
        if (body.code === "RATE_LIMITED") body.retryAfterSeconds = error.retryAfterSeconds;
      }
    } else {
      // Error messages may contain MongoDB credentials or provider tokens.
      console.error("api.request.failed", { name: error instanceof Error ? error.name : "Unknown" });
      body = { code: "INTERNAL_ERROR", message: "An unexpected error occurred" };
      status = 500;
    }
    return Response.json({ ok: false, error: body } satisfies ApiResult<never>, { status, headers });
  }
}
