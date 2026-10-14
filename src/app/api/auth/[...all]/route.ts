import { getAuth } from "@/server/auth";
import { apiHandler, assertSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return apiHandler(async () => {
    // Explicitly reject login CSRF too, even before a browser has any session cookie.
    if (request.method !== "GET") assertSameOrigin(request);
    const response = await (await getAuth()).handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}

export const GET = handle;
export const POST = handle;
