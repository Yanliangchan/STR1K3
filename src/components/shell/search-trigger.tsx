"use client";

import { Search } from "lucide-react";

/** A search-box-looking button that opens the command palette. */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("str1k3:open-search"))}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-300 bg-surface px-4 text-left text-slate-500 hover:border-navy-300 lg:hidden"
      data-testid="home-search"
    >
      <Search className="h-5 w-5" aria-hidden />
      <span className="flex-1">Search a cadet, record or page…</span>
    </button>
  );
}
