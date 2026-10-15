import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveBatchContext } from "@/server/context";
import { listRoster } from "@/server/services/cadets";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/misc";
import { HistoryItem } from "@/components/records/history-item";
import { filterControl } from "@/components/common/filter-bar";
import { batchHref } from "@/lib/utils";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; b?: string }> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const q = sp.q?.trim() ?? "";
  const [cadets, records, statements] = q
    ? await Promise.all([
        listRoster(ctx.batch.id, { q, includeInactive: true }),
        prisma.record.findMany({
          where: {
            batchId: ctx.batch.id,
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { referenceNo: { contains: q, mode: "insensitive" } },
              { category: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          include: { cadet: { include: { byte: true } }, category: true, createdBy: { select: { name: true } } },
          orderBy: { occurredOn: "desc" },
          take: 20,
        }),
        prisma.statement.findMany({
          where: { batchId: ctx.batch.id, title: { contains: q, mode: "insensitive" } },
          include: { cadet: { include: { byte: true } }, createdBy: { select: { name: true } } },
          orderBy: { requestedOn: "desc" },
          take: 20,
        }),
      ])
    : [[], [], []];

  return (
    <div className="space-y-5">
      <PageHeader title="Search" description={`Searching ${ctx.batch.name}`} />
      <form method="get" role="search" className="flex gap-2">
        {ctx.contextParam && <input type="hidden" name="b" value={ctx.contextParam} />}
        <input name="q" type="search" defaultValue={q} autoFocus className={filterControl} placeholder="Cadet name, byte, description, reference…" aria-label="Search" />
        <button className="inline-flex min-h-11 items-center rounded-lg bg-navy-800 px-4 text-white" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
      </form>
      {q && cadets.length + records.length + statements.length === 0 && <EmptyState title="No results">Nothing in this batch matches “{q}”.</EmptyState>}
      {cadets.length > 0 && (
        <section>
          <SectionTitle>Cadets ({cadets.length})</SectionTitle>
          <Card>
            <ul className="divide-y divide-slate-100">
              {cadets.map((c) => (
                <li key={c.id}>
                  <Link href={batchHref(`/cadets/${c.id}`, ctx.contextParam)} className="flex min-h-12 items-center justify-between px-3 py-2 hover:bg-slate-50">
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <span className="text-sm text-slate-500">
                      {c.byteName ?? "No byte"} · NOR {c.nor} · CROW {c.crow} · Stmt {c.statements}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {records.length > 0 && (
        <section>
          <SectionTitle>Records ({records.length})</SectionTitle>
          <Card>
            <ul className="divide-y divide-slate-100">
              {records.map((r) => (
                <li key={r.id}>
                  <HistoryItem showCadet e={{ kind: r.type, id: r.id, date: r.occurredOn, category: r.category?.name ?? null, description: r.description, status: null, voided: r.status === "VOIDED", createdBy: r.createdBy.name, updatedAt: r.updatedAt, cadetName: r.cadet.name, byteName: r.cadet.byte?.name }} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {statements.length > 0 && (
        <section>
          <SectionTitle>Statements ({statements.length})</SectionTitle>
          <Card>
            <ul className="divide-y divide-slate-100">
              {statements.map((s) => (
                <li key={s.id}>
                  <HistoryItem showCadet e={{ kind: "STATEMENT", id: s.id, date: s.requestedOn, category: null, description: s.title, status: s.status, voided: s.voided, createdBy: s.createdBy.name, updatedAt: s.updatedAt, cadetName: s.cadet.name, byteName: s.cadet.byte?.name }} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
