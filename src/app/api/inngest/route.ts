import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { getServerEnvironment } from "@/server/config";
import { inngest } from "@/server/inngest/client";
import { createDigestFunctions } from "@/server/inngest/functions";
import { marketNewsProvider } from "@/server/digest/market-news";
import { createAlertFunctions } from "@/server/inngest/alerts";

export const runtime = "nodejs";
const functions = [...createDigestFunctions(marketNewsProvider), ...createAlertFunctions()];

async function handler(method: "GET" | "POST" | "PUT", request: NextRequest, context: unknown) {
  const env = getServerEnvironment();
  if (env.NODE_ENV === "production" && (env.INNGEST_DEV === "1" || !env.INNGEST_SIGNING_KEY || !env.INNGEST_EVENT_KEY)) {
    return Response.json({ error: "Production Inngest requires cloud credentials and signature verification" }, { status: 503 });
  }
  // The SDK validates signatures in cloud mode; never accept the local bypass in production.
  return serve({ client: inngest, functions })[method](request, context);
}
export async function GET(request: NextRequest, context: unknown) { return handler("GET", request, context); }
export async function POST(request: NextRequest, context: unknown) { return handler("POST", request, context); }
export async function PUT(request: NextRequest, context: unknown) { return handler("PUT", request, context); }
