import { digestPreferenceUpdateSchema } from "@/contracts";
import { requireSession } from "@/server/auth/session";
import { apiHandler, assertSameOrigin, jsonSuccess, parseJson } from "@/server/http";
import { getPreferences, updatePreferences } from "@/server/profile/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler(async () => {
    const { user } = await requireSession(request.headers);
    return jsonSuccess(await getPreferences(user.id));
  });
}

export function PUT(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const input = await parseJson(request, digestPreferenceUpdateSchema);
    return jsonSuccess(await updatePreferences(user.id, input));
  });
}
