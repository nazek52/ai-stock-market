import { getDatabase } from "@/server/db";
import { getServerEnvironment } from "@/server/config";
import { validateProductionEnvironment } from "@/server/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: { ready: boolean; expiresAt: number } | undefined;
let inFlight: Promise<boolean> | undefined;

async function inspectReadiness(): Promise<boolean> {
  try {
    const env = getServerEnvironment();
    if (env.NODE_ENV === "production" && !validateProductionEnvironment(process.env).ok) return false;
    const db = await getDatabase();
    const [, topology] = await Promise.all([
      db.command({ ping: 1 }, { timeoutMS: 2_000 }),
      db.admin().command({ hello: 1 }, { timeoutMS: 2_000 }),
    ]);
    return topology.ok === 1 && topology.isWritablePrimary === true && typeof topology.setName === "string";
  } catch { return false; }
}

async function ready() {
  if (cached && cached.expiresAt > Date.now()) return cached.ready;
  if (!inFlight) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    inFlight = Promise.race([
      inspectReadiness(),
      new Promise<boolean>((resolve) => { timeout = setTimeout(() => resolve(false), 4_000); }),
    ]).then((result) => {
      cached = { ready: result, expiresAt: Date.now() + 5_000 };
      return result;
    }).finally(() => { if (timeout) clearTimeout(timeout); inFlight = undefined; });
  }
  return inFlight;
}

export async function GET() {
  const healthy = await ready();
  return Response.json({ status: healthy ? "ready" : "unavailable" }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
