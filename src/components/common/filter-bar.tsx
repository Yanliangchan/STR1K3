import type { ReactNode } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Server-rendered GET filter form: works without JavaScript and keeps filters
 * in the URL so they survive navigation.
 */
export function FilterBar({
  children,
  hidden,
  resetHref,
  activeCount,
}: {
  children: ReactNode;
  hidden?: Record<string, string | undefined | null>;
  resetHref: string;
  activeCount: number;
}) {
  return (
    <details className="group mb-4 rounded-xl border border-slate-200 bg-white" open={activeCount > 0 ? true : undefined}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-slate-800">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filters
        {activeCount > 0 && <span className="rounded-full bg-navy-800 px-2 text-xs text-white">{activeCount}</span>}
        <span className="ml-auto text-xs text-slate-500 group-open:hidden">Show</span>
      </summary>
      <form method="get" className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        {children}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonClasses("primary")}>
            Apply
          </button>
          <Link href={resetHref} className={buttonClasses("ghost")}>
            Reset
          </Link>
        </div>
      </form>
    </details>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const filterControl =
  "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200";
