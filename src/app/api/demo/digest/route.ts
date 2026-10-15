import { handleDemoDigest } from "@/server/demo/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDemoDigest(request);
}
