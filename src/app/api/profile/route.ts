import { profileUpdateSchema } from "@/contracts";
import { requireSession } from "@/server/auth/session";
import { apiHandler, assertSameOrigin, jsonSuccess, parseJson } from "@/server/http";
import { getProfile, updateProfile } from "@/server/profile/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler(async () => {
    const { user } = await requireSession(request.headers);
    return jsonSuccess(await getProfile(user.id));
  });
}

export function PATCH(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user } = await requireSession(request.headers);
    const input = await parseJson(request, profileUpdateSchema);
    return jsonSuccess(await updateProfile(user.id, input));
  });
}
