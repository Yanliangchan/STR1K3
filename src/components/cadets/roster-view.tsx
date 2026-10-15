"use client";

import Link from "@/components/ui/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronRight, Search, Users, X } from "lucide-react";
import type { RosterRow } from "@/server/services/cadets";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { Button, buttonClasses } from "@/components/ui/button";
import { batchHref, cn, pluralize } from "@/lib/utils";

const FILTERS = [
  { value: "", label: "All cadets" },
  { value: "nor", label: "With NORs" },
  { value: "crow", label: "With CROWs" },
  { value: "outstanding", label: "Outstanding statements" },
  { value: "rewrite", label: "Rewrite required" },
  { value: "none", label: "No records" },
];

export function RosterView({
  rows,
  bytes,
  batchId,
  contextParam,
  readOnly,
}: {
  rows: RosterRow[];
  bytes: { id: string; name: string }[];
  batchId: string;
  contextParam: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const storageKey = `str1k3:selection:${batchId}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Restore selection for this batch (per-device convenience only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setSelected(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...selected]));
    } catch {}
  }, [selected, storageKey]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Debounced search: keeps the query in the URL so it survives navigating back.
  useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => setParam("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const visibleIds = useMemo(() => rows.filter((r) => r.status === "ACTIVE").map((r) => r.id), [rows]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const hiddenSelected = [...selected].filter((id) => !visibleIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  }

  const createHref = (type?: string) =>
    `/records/new?${new URLSearchParams({ cadets: [...selected].join(","), ...(type ? { type } : {}) }).toString()}`;

  const filterActive = !!(sp.get("filter") || sp.get("byte") || sp.get("q"));

  return (
    <div className={cn(selected.size > 0 && "pb-24")}>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, byte or record details"
            aria-label="Search cadets"
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Filter by byte" value={sp.get("byte") ?? ""} onChange={(e) => setParam("byte", e.target.value)}>
            <option value="">All bytes</option>
            {bytes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="none">No byte</option>
          </Select>
          <Select aria-label="Filter cadets" value={sp.get("filter") ?? ""} onChange={(e) => setParam("filter", e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={allVisibleSelected} onChange={toggleAllVisible} disabled={readOnly || visibleIds.length === 0} aria-label="Select all visible cadets" />
          Select all {visibleIds.length > 0 ? `${visibleIds.length} shown` : ""}
        </label>
        <p className="text-sm text-slate-500" aria-live="polite">
          {pending ? "Updating…" : `${pluralize(rows.length, "cadet")}${filterActive ? " match" : ""}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={filterActive ? "No cadets match" : "No cadets on this roster yet"}
          action={
            filterActive ? (
              <Button variant="outline" onClick={() => { setQ(""); router.replace(pathname + (contextParam ? `?b=${contextParam}` : "")); }}>
                Clear search and filters
              </Button>
            ) : (
              <Link href={`/batches/${batchId}`} className={buttonClasses("primary")}>
                Add cadets
              </Link>
            )
          }
        >
          {filterActive ? "Try a different name or filter." : "Add cadets individually or import a CSV roster in batch management."}
        </EmptyState>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className={cn("flex items-stretch rounded-xl border bg-surface", selected.has(r.id) ? "border-navy-400 ring-1 ring-navy-300" : "border-slate-200")}>
                <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center">
                  <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={readOnly || r.status !== "ACTIVE"} aria-label={`Select ${r.name}`} />
                </label>
                <Link href={batchHref(`/cadets/${r.id}`, contextParam)} className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {r.name}
                      {r.status !== "ACTIVE" && <Badge className="ml-2">{r.status === "REMOVED" ? "Removed" : "Transferred"}</Badge>}
                    </p>
                    <p className="text-sm text-slate-500">{r.byteName ?? "No byte"}</p>
                    <CountsLine r={r} />
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 px-3 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2">Cadet</th>
                  <th className="px-3 py-2">Byte</th>
                  <th className="px-3 py-2 text-right">NORs</th>
                  <th className="px-3 py-2 text-right">CROWs</th>
                  <th className="px-3 py-2 text-right">Statements</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-slate-50", selected.has(r.id) && "bg-navy-50/60")}>
                    <td className="px-3 py-1">
                      <label className="flex h-11 w-8 cursor-pointer items-center justify-center">
                        <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={readOnly || r.status !== "ACTIVE"} aria-label={`Select ${r.name}`} />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={batchHref(`/cadets/${r.id}`, contextParam)} className="font-medium text-navy-900 hover:underline">
                        {r.name}
                      </Link>
                      {r.status !== "ACTIVE" && <Badge className="ml-2">{r.status === "REMOVED" ? "Removed" : "Transferred"}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.byteName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.nor}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.crow}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.statements}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.outstanding > 0 ? <Badge tone={r.rewrite > 0 ? "amber" : "navy"}>{r.outstanding}</Badge> : <span className="text-slate-400">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected.size > 0 && !readOnly && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-surface/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:bottom-0 lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium text-slate-800" aria-live="polite">
              {pluralize(selected.size, "cadet")} selected
              {hiddenSelected > 0 && <span className="font-normal text-slate-500"> ({hiddenSelected} not shown by the current filter)</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" aria-hidden /> Clear
            </Button>
            <span className="flex gap-1.5" role="group" aria-label="Create for selected cadets">
              {(["NOR", "CROW", "STATEMENT"] as const).map((t) => (
                <Link
                  key={t}
                  href={createHref(t)}
                  className={buttonClasses(t === "STATEMENT" ? "secondary" : "primary", "md", "px-3")}
                  data-testid={`create-${t.toLowerCase()}-for-selected`}
                >
                  {t === "STATEMENT" ? "Statement" : `+ ${t}`}
                </Link>
              ))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CountsLine({ r }: { r: RosterRow }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
      <span>NOR {r.nor}</span>
      <span>CROW {r.crow}</span>
      <span>Stmt {r.statements}</span>
      {r.outstanding > 0 && <span className={cn("font-medium", r.rewrite ? "text-amber-800" : "text-navy-700")}>{r.outstanding} outstanding</span>}
    </p>
  );
}
