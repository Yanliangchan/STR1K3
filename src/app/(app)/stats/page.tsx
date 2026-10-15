import Link from "@/components/ui/link";
import { AlertTriangle } from "lucide-react";
import { resolveBatchContext } from "@/server/context";
import { statistics, type StatsFilters } from "@/server/services/stats";
import { recurringFlags, getRecurringConfig } from "@/server/services/recurring";
import { listBytes } from "@/server/services/bytes";
import { listCategories } from "@/server/services/categories";
import { listBatches } from "@/server/services/batches";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { FilterBar, FilterField, filterControl } from "@/components/common/filter-bar";
import { Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { ActivityChart, ByteChart, CategoryChart, DistributionChart, OutstandingChart, StatusChart } from "@/components/stats/charts";
import { batchHref } from "@/lib/utils";
import { isStatementStatus, statementStatusLabel, STATEMENT_STATUSES } from "@/lib/labels";

export const metadata = { title: "Statistics" };

type SP = { b?: string; byte?: string; type?: string; category?: string; status?: string; from?: string; to?: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const f: StatsFilters = {
    byteId: sp.byte || undefined,
    type: sp.type === "NOR" || sp.type === "CROW" || sp.type === "STATEMENT" ? sp.type : undefined,
    categoryId: sp.category || undefined,
    status: isStatementStatus(sp.status) ? sp.status : undefined,
    from: sp.from && DATE_RE.test(sp.from) ? sp.from : undefined,
    to: sp.to && DATE_RE.test(sp.to) ? sp.to : undefined,
  };
  const [stats, flags, cfg, bytes, categories, batches] = await Promise.all([
    statistics(ctx.batch.id, f),
    recurringFlags(ctx.batch.id),
    getRecurringConfig(),
    listBytes(ctx.batch.id),
    listCategories({ includeInactive: true }),
    listBatches(),
  ]);
  const activeCount = [f.byteId, f.type, f.categoryId, f.status, f.from, f.to].filter(Boolean).length;
  const b = ctx.contextParam;

  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader title="Statistics" description={`${ctx.batch.name} — counts come directly from saved records.`} />

      <FilterBar resetHref={batchHref("/stats", b)} activeCount={activeCount}>
        <FilterField label="Batch">
          <select name="b" defaultValue={ctx.batch.id} className={filterControl}>
            {batches.map((x) => (
              <option key={x.id} value={x.isActive ? "" : x.id}>
                {x.name}
                {x.isActive ? " (active)" : x.status === "ARCHIVED" ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Byte">
          <select name="byte" defaultValue={f.byteId ?? ""} className={filterControl}>
            <option value="">All bytes</option>
            {bytes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Record type">
          <select name="type" defaultValue={f.type ?? ""} className={filterControl}>
            <option value="">All types</option>
            <option value="NOR">NOR</option>
            <option value="CROW">CROW</option>
            <option value="STATEMENT">Statements</option>
          </select>
        </FilterField>
        <FilterField label="Category">
          <select name="category" defaultValue={f.categoryId ?? ""} className={filterControl}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.recordType} · {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Statement status">
          <select name="status" defaultValue={f.status ?? ""} className={filterControl}>
            <option value="">All statuses</option>
            {STATEMENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {statementStatusLabel[st]}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="grid grid-cols-2 gap-2">
          <FilterField label="From">
            <input type="date" name="from" defaultValue={f.from} className={filterControl} />
          </FilterField>
          <FilterField label="To">
            <input type="date" name="to" defaultValue={f.to} className={filterControl} />
          </FilterField>
        </div>
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionChart data={stats.distribution} b={b} />
        {(f.type === undefined || f.type === "STATEMENT") && (
          <StatusChart b={b} data={stats.statusCounts.map((x) => ({ label: statementStatusLabel[x.status], value: x.count, status: x.status }))} />
        )}
        {f.type !== "STATEMENT" && <ByteChart b={b} data={stats.byByte} />}
        {f.type !== "STATEMENT" && <CategoryChart b={b} data={stats.byCategory} />}
        <ActivityChart data={stats.activity.points} granularity={stats.activity.granularity} />
        {(f.type === undefined || f.type === "STATEMENT") && <OutstandingChart data={stats.outstanding} />}
      </div>

      <section id="recurring" className="mt-6 scroll-mt-20">
        <SectionTitle>Possible recurring issues</SectionTitle>
        <p className="mb-3 text-sm text-slate-600">
          Flags a cadet with {cfg.threshold} or more distinct occurrences in the same NOR/CROW category
          {cfg.windowDays ? ` within ${cfg.windowDays} days` : " in this batch"}. Records linked to one shared occurrence count once;
          statement requests never count. These are prompts for review, not findings.{" "}
          <Link href="/settings" className="underline">
            Change threshold
          </Link>
        </p>
        {flags.length === 0 ? (
          <Card className="px-3 py-6 text-center text-sm text-slate-500">No repeated records reach the review threshold.</Card>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {flags.map((x) => (
                <li key={`${x.cadetId}-${x.categoryId}`}>
                  <Link href={batchHref(`/records`, b, { occurrence: undefined, type: x.recordType, category: x.categoryId, q: x.cadetName })} className="flex items-start gap-3 px-3 py-3 hover:bg-slate-50">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {x.cadetName} <span className="font-normal text-slate-500">· {x.byteName ?? "No byte"}</span>
                      </p>
                      <p className="text-sm text-slate-700">
                        {x.recordType} · {x.category}: {x.distinctOccurrences} distinct occurrence{x.distinctOccurrences === 1 ? "" : "s"} ({x.recordCount} record
                        {x.recordCount === 1 ? "" : "s"})
                      </p>
                    </div>
                    {x.needsManualReview ? <Badge tone="amber">Manual review</Badge> : <Badge tone="navy">Review recommended</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
