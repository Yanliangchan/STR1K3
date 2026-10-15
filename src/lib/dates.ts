import { env } from "./env";

/** Today's calendar date (YYYY-MM-DD) in the configured app time zone. */
export function todayISO(now = new Date()): string {
  return toISODateInTz(now);
}

export function toISODateInTz(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Parse a YYYY-MM-DD string into a UTC-midnight Date (for @db.Date columns). */
export function parseISODate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date");
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error("Invalid date");
  return d;
}

/** Format a @db.Date value (UTC midnight) as YYYY-MM-DD. */
export function dateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human date for a @db.Date column, e.g. "14 Oct 2026". */
export function formatDateOnly(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Human date-time for a timestamp in the app time zone. */
export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: env.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatRelative(d: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(d);
}

/** Start of the given calendar day (app TZ) as an absolute instant. */
export function startOfDayInTz(iso: string): Date {
  // Find the offset of the time zone at that date by formatting a UTC guess.
  const guess = new Date(`${iso}T00:00:00.000Z`);
  const tzDate = new Date(guess.toLocaleString("en-US", { timeZone: env.timezone }));
  const utcDate = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = tzDate.getTime() - utcDate.getTime();
  return new Date(guess.getTime() - offsetMs);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnlyISO(d);
}
