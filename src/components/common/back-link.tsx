"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Goes back in history when the user came from inside the app, so list pages
 * keep their search, filters and scroll position. Falls back to `href`.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        try {
          const navs = (window as unknown as { __str1k3Navs?: number }).__str1k3Navs ?? 0;
          if (navs > 1) {
            e.preventDefault();
            router.back();
          }
        } catch {}
      }}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {children}
    </Link>
  );
}
