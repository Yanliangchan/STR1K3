import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { SESSION_COOKIE, validateSessionToken, type ValidatedSession } from "./session";

export const getSession = cache(async (): Promise<ValidatedSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/** For pages: redirect to sign-in when there is no valid session. */
export async function requireSession(opts: { allowPasswordChange?: boolean } = {}) {
  const session = await getSession();
  if (!session) redirect("/login?expired=1");
  if (session.user.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return session;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireActor(): Promise<{ actor: Actor; session: ValidatedSession }> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHENTICATED", "Your session has expired. Sign in again to continue.");
  if (session.user.mustChangePassword) throw new AppError("FORBIDDEN", "Change your password before continuing.");
  const { id, name, isAdmin } = session.user;
  return { actor: { id, name, isAdmin }, session };
}

export function actorFrom(session: ValidatedSession): Actor {
  return { id: session.user.id, name: session.user.name, isAdmin: session.user.isAdmin };
}
