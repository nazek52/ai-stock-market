import "server-only";
import { getAuth, type Auth } from "./index";
import { AppError } from "@/server/errors";

export type Session = Auth["$Infer"]["Session"];

export async function getSession(headers: Headers): Promise<Session | null> {
  // Never authorize using cookie presence: check the persisted session, including revocation/expiry.
  return (await getAuth()).api.getSession({ headers, query: { disableCookieCache: true } });
}

export async function requireSession(headers: Headers): Promise<Session> {
  const session = await getSession(headers);
  if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue", 401);
  return session;
}
