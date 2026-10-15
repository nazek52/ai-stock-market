import { handleAlertScenario } from "@/server/demo/scenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAlertScenario(request);
}
