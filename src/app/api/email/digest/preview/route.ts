import { requireSession } from "@/server/auth/session";
import { previewOwnDigest } from "@/server/digest/processor";
import { apiHandler, assertSameOrigin, jsonSuccess } from "@/server/http";
import { getServerEnvironment } from "@/server/config";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return apiHandler(async () => {
    if (getServerEnvironment().NODE_ENV === "production") throw new AppError("FORBIDDEN", "Manual preview is available only in development", 403);
    assertSameOrigin(request);
    const session = await requireSession(request.headers);
    return jsonSuccess(await previewOwnDigest(session.user.id));
  });
}
