"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileText,
  FolderCog,
  Home,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Download,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, Wordmark } from "./logo";

const primary = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/cadets", label: "Cadets", Icon: Users },
  { href: "/records", label: "Records", Icon: ClipboardList },
  { href: "/statements", label: "Statements", Icon: FileText },
];
const secondary = [
  { href: "/stats", label: "Statistics", Icon: BarChart3 },
  { href: "/batches", label: "Batch management", Icon: FolderCog },
  { href: "/activity", label: "Activity history", Icon: Activity },
  { href: "/export", label: "Import / export", Icon: Download },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  activeBatchName,
  userName,
}: {
  children: ReactNode;
  activeBatchName: string | null;
  userName: string;
}) {
  const pathname = usePathname();
  // Count in-app page views so "Back" links can safely use browser history.
  useEffect(() => {
    const w = window as unknown as { __str1k3Navs?: number };
    w.__str1k3Navs = (w.__str1k3Navs ?? 0) + 1;
  }, [pathname]);
  const moreActive = pathname === "/more" || secondary.some((s) => isActive(pathname, s.href)) || pathname.startsWith("/account");

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
          <Logo />
          <Wordmark />
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {[...primary, ...secondary].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium",
                isActive(pathname, href) ? "bg-navy-50 text-navy-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <Link href="/account" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-800">
              {userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{userName}</span>
          </Link>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="STR1K3 home">
            <Logo className="h-7 w-7" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase leading-none tracking-wide text-slate-500">Active batch</p>
            <p className="truncate text-base font-semibold leading-tight text-navy-900" data-testid="active-batch-name">
              {activeBatchName ?? "None set"}
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/records/new"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-navy-800 px-3 text-sm font-medium text-white hover:bg-navy-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span>New<span className="hidden sm:inline"> record</span></span>
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:pb-12">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe lg:hidden" aria-label="Main navigation">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {[...primary, { href: "/more", label: "More", Icon: MoreHorizontal }].map(({ href, label, Icon }) => {
            const active = href === "/more" ? moreActive : isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-navy-800" : "text-slate-500",
                  )}
                >
                  <Icon className={cn("h-6 w-6", active && "stroke-[2.4]")} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
