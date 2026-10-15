import Link from "@/components/ui/link";
import { ClipboardList, Plus } from "lucide-react";
import { resolveBatchContext } from "@/server/context";
import { listRecords } from "@/server/services/records";
import { listBytes } from "@/server/services/bytes";
import { listCategories } from "@/server/services/categories";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { FilterBar, FilterField, filterControl } from "@/components/common/filter-bar";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { HistoryItem } from "@/components/records/history-item";
import { batchHref, cn, pluralize } from "@/lib/utils";

export const metadata = { title: "Records" };

type SP = { b?: string; type?: string; byte?: string; category?: string; from?: string; to?: string; q?: string; voided?: string; occurrence?: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RecordsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const type = sp.type === "NOR" || sp.type === "CROW" ? sp.type : undefined;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const [{ rows, total }, bytes, categories] = await Promise.all([
    listRecords(ctx.batch.id, {
      type,
      byteId: sp.byte || undefined,
      categoryId: sp.category || undefined,
      from,
      to,
      q: sp.q?.trim() || undefined,
      includeVoided: sp.voided === "1",
      occurrenceId: sp.occurrence || undefined,
    }),
    listBytes(ctx.batch.id),
    listCategories({ includeInactive: true }),
  ]);
  const activeCount = [sp.byte, sp.category, from, to, sp.q, sp.voided].filter(Boolean).length;
  const tabs = [
    { label: "All", value: undefined },
    { label: "NOR", value: "NOR" },
    { label: "CROW", value: "CROW" },
  ];
  const keep = { b: ctx.contextParam ?? undefined, byte: sp.byte, category: sp.category, from, to, q: sp.q, voided: sp.voided };

  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader
        title="Records"
        description="NOR and CROW records. Statements are managed in the Statements tab."
        actions={
          !ctx.readOnly && ctx.isActive ? (
            <Link href={`/records/new${type ? `?type=${type}` : ""}`} className={buttonClasses("primary")}>
              <Plus className="h-4 w-4" aria-hidden /> New
            </Link>
          ) : undefined
        }
      />
      <nav className="mb-3 flex gap-1" aria-label="Record type">
        {tabs.map((t) => {
          const active = type === t.value;
          const params = new URLSearchParams(Object.entries({ ...keep, type: t.value }).filter(([, v]) => v) as [string, string][]);
          return (
            <Link
              key={t.label}
              href={`/records${params.size ? `?${params}` : ""}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium",
                active ? "bg-primary text-white" : "bg-surface text-slate-700 ring-1 ring-inset ring-slate-200",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <FilterBar hidden={{ b: ctx.contextParam, type }} resetHref={batchHref("/records", ctx.contextParam, { type })} activeCount={activeCount}>
        <FilterField label="Search">
          <input name="q" type="search" defaultValue={sp.q} className={filterControl} placeholder="Description, cadet, reference" />
        </FilterField>
        <FilterField label="Byte">
          <select name="byte" defaultValue={sp.byte ?? ""} className={filterControl}>
            <option value="">All bytes</option>
            {bytes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Category">
          <select name="category" defaultValue={sp.category ?? ""} className={filterControl}>
            <option value="">All categories</option>
            {categories
              .filter((c) => !type || c.recordType === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.recordType} · {c.name}
                </option>
              ))}
            <option value="none">Uncategorised</option>
          </select>
        </FilterField>
        <div className="grid grid-cols-2 gap-2">
          <FilterField label="From">
            <input name="from" type="date" defaultValue={from} className={filterControl} />
          </FilterField>
          <FilterField label="To">
            <input name="to" type="date" defaultValue={to} className={filterControl} />
          </FilterField>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" name="voided" value="1" defaultChecked={sp.voided === "1"} className="h-5 w-5 accent-primary" />
          Include voided records
        </label>
      </FilterBar>

      {sp.occurrence && (
        <p className="mb-3 text-sm text-slate-600">
          Showing records linked to one occurrence.{" "}
          <Link href={batchHref("/records", ctx.contextParam)} className="underline">
            Show all
          </Link>
        </p>
      )}

      <p className="mb-2 text-sm text-slate-500" aria-live="polite">
        {pluralize(total, "record")}
        {rows.length < total ? ` (showing newest ${rows.length})` : ""}
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No records found">
          {activeCount ? "Try changing the filters." : "NORs and CROWs you create will be listed here."}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id}>
                <HistoryItem
                  showCadet
                  e={{
                    kind: r.type,
                    id: r.id,
                    date: r.occurredOn,
                    category: r.category?.name ?? null,
                    description: r.description,
                    status: null,
                    voided: r.status === "VOIDED",
                    createdBy: r.createdBy.name,
                    updatedAt: r.updatedAt,
                    cadetName: r.cadet.name,
                    byteName: r.cadet.byte?.name,
                  }}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
