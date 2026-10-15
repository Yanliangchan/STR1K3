import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Build a URL keeping a non-active batch context (?b=) when present. */
export function batchHref(path: string, batchId?: string | null, params?: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  if (batchId) sp.set("b", batchId);
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}
