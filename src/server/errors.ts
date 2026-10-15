export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "READ_ONLY"
  | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Item") => new AppError("NOT_FOUND", `${what} not found.`);
export const forbidden = (msg = "You do not have permission to do that.") => new AppError("FORBIDDEN", msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) =>
  new AppError("VALIDATION", msg, fieldErrors);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const readOnly = (msg = "This batch is archived and read-only.") => new AppError("READ_ONLY", msg);

/** Map database trigger errors raised in migrations to friendly AppErrors. */
export function translateDbError(e: unknown): unknown {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("STR1K3: batch is archived")) return readOnly();
  if (msg.includes("STR1K3: the active batch cannot be archived"))
    return conflict("The active batch cannot be archived. Activate another batch first.");
  if (msg.includes("STR1K3: an archived batch cannot be the active batch"))
    return conflict("An archived batch cannot be made active. Reopen it first.");
  if (msg.includes("STR1K3:")) return conflict(msg.slice(msg.indexOf("STR1K3:") + 8).split("\n")[0] ?? msg);
  return e;
}
