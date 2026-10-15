import "server-only";
import { AppError, type ErrorCode, translateDbError } from "./errors";
import type { Actor } from "./actor";
import type { ValidatedSession } from "./auth/session";
import { requireActor } from "./auth/current";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode | "SERVER"; error: string; fieldErrors?: Record<string, string> };

export function toActionError(e: unknown): Extract<ActionResult<never>, { ok: false }> {
  const err = translateDbError(e);
  if (err instanceof AppError) return { ok: false, code: err.code, error: err.message, fieldErrors: err.fieldErrors };
  // Log without request payloads (which may contain statement content).
  console.error("[str1k3] action failed:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
  return { ok: false, code: "SERVER", error: "Something went wrong and nothing was saved. Please try again." };
}

/** Run an authenticated server action and convert errors into a serialisable result. */
export async function authed<T>(
  fn: (ctx: { actor: Actor; session: ValidatedSession }) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireActor();
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    return toActionError(e);
  }
}
