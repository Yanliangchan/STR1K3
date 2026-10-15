"use client";

import * as D from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlarmClock,
  BarChart3,
  ClipboardList,
  CornerDownLeft,
  Download,
  FileText,
  FolderCog,
  Home,
  Plus,
  Search,
  Settings,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { quickSearchAction } from "@/app/actions/data";
import type { QuickResult } from "@/server/services/quicksearch";
import { cn } from "@/lib/utils";

type Item = { key: string; href: string; label: string; hint?: string; Icon: typeof Home; keywords?: string };

const ACTIONS: Item[] = [
  { key: "a-nor", href: "/records/new?type=NOR", label: "New NOR", Icon: Plus, keywords: "record nor negative observation add create" },
  { key: "a-crow", href: "/records/new?type=CROW", label: "New CROW", Icon: Plus, keywords: "record crow add create" },
  { key: "a-stmt", href: "/records/new?type=STATEMENT", label: "Request statements", Icon: FileText, keywords: "statement request new ask" },
  { key: "a-review", href: "/statements?status=PENDING_REVIEW", label: "Review handed-in statements", Icon: ClipboardList, keywords: "review accept pending statements" },
  { key: "a-overdue", href: "/statements?status=OVERDUE", label: "Overdue statements", Icon: AlarmClock, keywords: "overdue late chase deadline statements" },
];
const PAGES: Item[] = [
  { key: "p-home", href: "/", label: "Home", Icon: Home, keywords: "dashboard home overview" },
  { key: "p-cadets", href: "/cadets", label: "Cadets (roster)", Icon: Users, keywords: "cadets roster list people" },
  { key: "p-records", href: "/records", label: "All records", Icon: ClipboardList, keywords: "records nor crow list history" },
  { key: "p-statements", href: "/statements", label: "Statement queue", Icon: FileText, keywords: "statements queue outstanding" },
  { key: "p-stats", href: "/stats", label: "Statistics", Icon: BarChart3, keywords: "statistics stats charts graphs trends recurring" },
  { key: "p-batches", href: "/batches", label: "Batch management", Icon: FolderCog, keywords: "batch batches bytes archive activate roster manage add cadet" },
  { key: "p-activity", href: "/activity", label: "Activity history", Icon: Activity, keywords: "activity audit history log changes" },
  { key: "p-export", href: "/export", label: "Export CSV", Icon: Download, keywords: "export csv download spreadsheet" },
  { key: "p-import", href: "/export", label: "Import roster (CSV)", Icon: Upload, keywords: "import csv upload roster" },
  { key: "p-settings", href: "/settings", label: "Settings", Icon: Settings, keywords: "settings categories thresholds flags instructors users accounts" },
  { key: "p-account", href: "/account", label: "My account / password", Icon: User, keywords: "account password sign out logout devices" },
];

export type RecentCadet = { id: string; name: string; byteName: string | null };
const RECENT_KEY = "str1k3:recentCadets";

export function rememberCadet(c: RecentCadet) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentCadet[]).filter((x) => x.id !== c.id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...list].slice(0, 6)));
  } catch {}
}

function matchItem(i: Item, q: string) {
  const hay = `${i.label} ${i.keywords ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<QuickResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentCadet[]>([]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setRes(null);
    setActive(0);
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentCadet[]);
    } catch {
      setRecent([]);
    }
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setRes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await quickSearchAction(query);
        if (!cancelled && r.ok) setRes(r.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => setActive(0), [q, res]);

  const query = q.trim();
  const cadets = query ? (res?.cadets ?? []) : recent.map((c) => ({ ...c, status: "ACTIVE", outstanding: 0 }));
  const actions = query ? ACTIONS.filter((a) => matchItem(a, query)) : ACTIONS;
  const pages = query ? PAGES.filter((p) => matchItem(p, query)) : [];

  // Flat list for keyboard navigation (Enter opens the highlighted item).
  const flat = (() => {
    const out: { key: string; href: string }[] = [];
    cadets.forEach((c) => out.push({ key: `c-${c.id}`, href: `/cadets/${c.id}` }));
    actions.forEach((a) => out.push({ key: a.key, href: a.href }));
    pages.forEach((p) => out.push({ key: p.key, href: p.href }));
    (res && query ? res.statements : []).forEach((s) => out.push({ key: `s-${s.id}`, href: `/statements/${s.id}` }));
    (res && query ? res.records : []).forEach((r) => out.push({ key: `r-${r.id}`, href: `/records/${r.id}` }));
    return out;
  })();
  const indexOf = (key: string) => flat.findIndex((f) => f.key === key);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active]!.href);
    }
  }

  useEffect(() => {
    document.querySelector(`[data-palette-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const rowCls = (key: string) =>
    cn("flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm", indexOf(key) === active ? "bg-navy-50" : "hover:bg-slate-50");

  const nothing = query && !loading && res && cadets.length + actions.length + pages.length + res.statements.length + res.records.length === 0;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-surface outline-none sm:inset-x-auto sm:left-1/2 sm:top-[10vh] sm:bottom-auto sm:max-h-[75vh] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:shadow-2xl"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Search and go</D.Title>
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 pt-safe">
            <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search cadets, statements, records or pages…"
              aria-label="Search"
              autoComplete="off"
              spellCheck={false}
              className="min-h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
              data-testid="palette-input"
            />
            <D.Close className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="h-5 w-5" />
            </D.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-safe" role="listbox" aria-label="Results">
            {loading && !res && <p className="px-3 py-3 text-sm text-slate-500">Searching…</p>}
            {nothing && <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing matches “{query}”.</p>}

            {cadets.length > 0 && (
              <Group title={query ? "Cadets" : "Recently viewed cadets"}>
                {cadets.map((c) => {
                  const key = `c-${c.id}`;
                  return (
                    <div key={key} data-palette-index={indexOf(key)} className={cn(rowCls(key), "pr-1")} role="option" aria-selected={indexOf(key) === active}>
                      <button type="button" onClick={() => go(`/cadets/${c.id}`)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
                        <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">{c.name}</span>
                          <span className="block text-xs text-slate-500">
                            {c.byteName ?? "No byte"}
                            {c.outstanding > 0 && ` · ${c.outstanding} outstanding statement${c.outstanding === 1 ? "" : "s"}`}
                            {c.status !== "ACTIVE" && " · not on roster"}
                          </span>
                        </span>
                      </button>
                      {c.status === "ACTIVE" && (
                        <span className="flex shrink-0 gap-1">
                          {(["NOR", "CROW", "STATEMENT"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => go(`/records/new?type=${t}&cadets=${c.id}`)}
                              className="min-h-10 rounded-md bg-surface px-2 text-xs font-semibold text-navy-800 ring-1 ring-inset ring-slate-300 hover:bg-navy-50"
                              aria-label={`New ${t === "STATEMENT" ? "statement request" : t} for ${c.name}`}
                            >
                              {t === "STATEMENT" ? "Stmt" : t}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Group>
            )}

            {actions.length > 0 && (
              <Group title="Actions">
                {actions.map((a) => (
                  <button key={a.key} type="button" data-palette-index={indexOf(a.key)} onClick={() => go(a.href)} className={rowCls(a.key)} role="option" aria-selected={indexOf(a.key) === active}>
                    <a.Icon className="h-4 w-4 text-navy-600" aria-hidden />
                    <span className="flex-1 font-medium text-slate-900">{a.label}</span>
                    {indexOf(a.key) === active && <CornerDownLeft className="h-4 w-4 text-slate-400" aria-hidden />}
                  </button>
                ))}
              </Group>
            )}

            {pages.length > 0 && (
              <Group title="Go to">
                {pages.map((p) => (
                  <button key={p.key} type="button" data-palette-index={indexOf(p.key)} onClick={() => go(p.href)} className={rowCls(p.key)} role="option" aria-selected={indexOf(p.key) === active}>
                    <p.Icon className="h-4 w-4 text-slate-500" aria-hidden />
                    <span className="flex-1 text-slate-900">{p.label}</span>
                  </button>
                ))}
              </Group>
            )}

            {query && res && res.statements.length > 0 && (
              <Group title="Statements">
                {res.statements.map((s) => {
                  const key = `s-${s.id}`;
                  return (
                    <button key={key} type="button" data-palette-index={indexOf(key)} onClick={() => go(`/statements/${s.id}`)} className={rowCls(key)} role="option" aria-selected={indexOf(key) === active}>
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-900">{s.title}</span>
                        <span className="block text-xs text-slate-500">{s.cadetName}</span>
                      </span>
                    </button>
                  );
                })}
              </Group>
            )}

            {query && res && res.records.length > 0 && (
              <Group title="Records">
                {res.records.map((r) => {
                  const key = `r-${r.id}`;
                  return (
                    <button key={key} type="button" data-palette-index={indexOf(key)} onClick={() => go(`/records/${r.id}`)} className={rowCls(key)} role="option" aria-selected={indexOf(key) === active}>
                      <ClipboardList className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-900">
                          {r.type} · {r.description}
                        </span>
                        <span className="block text-xs text-slate-500">{r.cadetName}</span>
                      </span>
                    </button>
                  );
                })}
              </Group>
            )}

            {!query && (
              <p className="px-3 py-3 text-xs text-slate-500">
                Tip: type a cadet&apos;s name to jump to them or start a record for them. Type a page name like “stats” or “export” to go there.
              </p>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}
