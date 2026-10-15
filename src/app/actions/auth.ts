"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { login } from "@/server/auth/login";
import { SESSION_COOKIE, revokeAllSessions, revokeSession } from "@/server/auth/session";
import { getSession, requireSession, actorFrom } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { toActionError, type ActionResult } from "@/server/action";
import { changeOwnPassword } from "@/server/services/users";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/lib/db";

export type LoginState = { error?: string; email?: string } | undefined;

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

async function clientMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  let next: string;
  try {
    const result = await login(email, password, await clientMeta());
    const jar = await cookies();
    // Replace any previous session cookie (prevents session fixation).
    jar.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + env.sessionMaxDays * 86400_000),
    });
    next = result.user.mustChangePassword ? "/change-password" : safeNext(form.get("next"));
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, email };
    console.error("[str1k3] login failed:", e instanceof Error ? e.message : e);
    return { error: "Sign-in is temporarily unavailable. Try again shortly.", email };
  }
  redirect(next);
}

export async function logoutAction() {
  const session = await getSession();
  const jar = await cookies();
  if (session) {
    await revokeSession(session.sessionId);
    await writeAudit(prisma, {
      actorId: session.user.id,
      action: "auth.logout",
      entityType: "User",
      entityId: session.user.id,
      summary: `${session.user.name} signed out`,
    });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login?signedout=1");
}

export async function signOutOtherDevicesAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireSession();
    await revokeAllSessions(session.user.id, session.sessionId);
    await writeAudit(prisma, {
      actorId: session.user.id,
      action: "auth.sessions_revoked",
      entityType: "User",
      entityId: session.user.id,
      summary: `${session.user.name} signed out of all other devices`,
    });
    return { ok: true, data: null };
  } catch (e) {
    return toActionError(e);
  }
}

export async function changePasswordAction(input: { current: string; next: string; confirm: string }): Promise<ActionResult<null>> {
  try {
    const session = await requireSession({ allowPasswordChange: true });
    await changeOwnPassword(actorFrom(session), session.sessionId, input);
    return { ok: true, data: null };
  } catch (e) {
    return toActionError(e);
  }
}
