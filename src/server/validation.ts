import { z } from "zod";
import { invalid } from "./errors";

export const id = z.string().min(1).max(64);
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Enter a valid date.");
export const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));
export const requiredText = (max: number, msg = "This field is required.") =>
  z
    .string({ required_error: msg })
    .transform((v) => v.trim())
    .pipe(z.string().min(1, msg).max(max, `Must be ${max} characters or fewer.`));
export const reason = requiredText(500, "A reason is required.");

/** Parse input with a zod schema, throwing a VALIDATION AppError with per-field messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  throw invalid("Please correct the highlighted fields.", fieldErrors);
}
