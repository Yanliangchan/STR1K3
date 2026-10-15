import Link from "next/link";
import { Upload } from "lucide-react";
import { resolveBatchContext } from "@/server/context";
import { listBatches } from "@/server/services/batches";
import { listBytes } from "@/server/services/bytes";
import { listCategories } from "@/server/services/categories";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { FilterField, filterControl } from "@/components/common/filter-bar";
import { Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { statementStatusLabel, STATEMENT_STATUSES } from "@/lib/labels";

export const metadata = { title: "Import / export" };

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const ctx = await resolveBatchContext((await searchParams).b);
  if (!ctx) return <NoActiveBatch />;
  const [batches, bytes, categories] = await Promise.all([listBatches(), listBytes(ctx.batch.id), listCategories({ includeInactive: true })]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Import / export" />
      <section>
        <SectionTitle>Import roster</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-slate-700">Import cadets into a batch from a CSV file, with a preview before anything is saved.</p>
          <Link href={`/batches/${ctx.batch.id}/import`} className={buttonClasses("secondary")}>
            <Upload className="h-4 w-4" aria-hidden /> Import into {ctx.batch.name}
          </Link>
        </Card>
      </section>

      <section>
        <SectionTitle>Export CSV</SectionTitle>
        <Card className="p-4">
          <form method="get" className="mb-4 flex items-end gap-2 border-b border-slate-100 pb-4">
            <FilterField label="Batch">
              <select name="b" defaultValue={ctx.isActive ? "" : ctx.batch.id} className={filterControl}>
                {batches.map((x) => (
                  <option key={x.id} value={x.isActive ? "" : x.id}>
                    {x.name}
                    {x.isActive ? " (active)" : x.status === "ARCHIVED" ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </FilterField>
            <button className={buttonClasses("outline")}>Switch</button>
          </form>
          <form method="post" action="/api/export" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="batchId" value={ctx.batch.id} />
            <FilterField label="Dataset">
              <select name="dataset" className={filterControl} defaultValue="records">
                <option value="records">NOR / CROW records</option>
                <option value="statements">Statements</option>
                <option value="roster">Roster with counts</option>
              </select>
            </FilterField>
            <FilterField label="Record type (records only)">
              <select name="type" className={filterControl}>
                <option value="">NOR and CROW</option>
                <option value="NOR">NOR</option>
                <option value="CROW">CROW</option>
              </select>
            </FilterField>
            <FilterField label="Byte">
              <select name="byteId" className={filterControl}>
                <option value="">All bytes</option>
                {bytes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Category (records only)">
              <select name="categoryId" className={filterControl}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.recordType} · {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Statement status (statements only)">
              <select name="status" className={filterControl}>
                <option value="">All statuses</option>
                <option value="OUTSTANDING">Outstanding</option>
                {STATEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statementStatusLabel[s]}
                  </option>
                ))}
              </select>
            </FilterField>
            <div className="grid grid-cols-2 gap-2">
              <FilterField label="From">
                <input type="date" name="from" className={filterControl} />
              </FilterField>
              <FilterField label="To">
                <input type="date" name="to" className={filterControl} />
              </FilterField>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="includeVoided" value="1" className="h-5 w-5 accent-primary" /> Include voided entries
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClasses("primary")}>
                Download CSV
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Exports are recorded in the activity history. Values that spreadsheets could treat as formulas are neutralised.
              </p>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
