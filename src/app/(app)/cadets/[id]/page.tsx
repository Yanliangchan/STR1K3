import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileText, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { orNotFound } from "@/server/context";
import { getCadet, cadetCounts } from "@/server/services/cadets";
import { recurringFlags } from "@/server/services/recurring";
import { Alert, Card, EmptyState, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { buttonClasses } from "@/components/ui/button";
import { HistoryItem, type HistoryEntry } from "@/components/records/history-item";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cadet" };

const TABS = [
  { value: "", label: "All" },
  { value: "NOR", label: "NOR" },
  { value: "CROW", label: "CROW" },
  { value: "STATEMENT", label: "Statements" },
];

export default async function CadetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; b?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const cadet = await orNotFound(getCadet(id));
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const isActiveBatch = cfg?.activeBatchId === cadet.batchId;
  const readOnly = cadet.batch.status !== "OPEN";
  const ctxParam = isActiveBatch ? "" : `&b=${cadet.batchId}`;

  const [records, statements, countsMap, flags] = await Promise.all([
    prisma.record.findMany({
      where: { cadetId: cadet.id, batchId: cadet.batchId },
      include: { category: true, createdBy: { select: { name: true } } },
    }),
    prisma.statement.findMany({
      where: { cadetId: cadet.id, batchId: cadet.batchId },
      include: { createdBy: { select: { name: true } } },
    }),
    cadetCounts(cadet.batchId, [cadet.id]),
    recurringFlags(cadet.batchId, { cadetId: cadet.id }),
  ]);
  const counts = countsMap.get(cadet.id) ?? { nor: 0, crow: 0, statements: 0, outstanding: 0, rewrite: 0 };

  const history: HistoryEntry[] = [
    ...records.map((r) => ({
      kind: r.type,
      id: r.id,
      date: r.occurredOn,
      category: r.category?.name ?? null,
      description: r.description,
      status: null,
      voided: r.status === "VOIDED",
      createdBy: r.createdBy.name,
      updatedAt: r.updatedAt,
      sortAt: r.createdAt,
    })),
    ...statements.map((s) => ({
      kind: "STATEMENT" as const,
      id: s.id,
      date: s.requestedOn,
      category: null,
      description: s.title,
      status: s.status,
      voided: s.voided,
      createdBy: s.createdBy.name,
      updatedAt: s.updatedAt,
      sortAt: s.createdAt,
    })),
  ]
    .filter((e) => !sp.type || e.kind === sp.type)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.sortAt.getTime() - a.sortAt.getTime());

  const newHref = (type: string) => `/records/new?type=${type}&cadets=${cadet.id}`;

  return (
    <div className="space-y-5">
      <Link href={`/cadets${isActiveBatch ? "" : `?b=${cadet.batchId}`}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Roster
      </Link>

      {!isActiveBatch && (
        <Alert tone="warning">
          This cadet belongs to <strong>{cadet.batch.name}</strong>
          {readOnly ? " (archived, read-only)" : ", which is not the active batch"}.
        </Alert>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900" data-testid="cadet-name">
              {cadet.name}
            </h1>
            <p className="text-sm text-slate-600">
              {cadet.batch.name} · {cadet.byte?.name ?? "No byte assigned"}
            </p>
          </div>
          {cadet.status !== "ACTIVE" && <Badge tone="amber">{cadet.status === "REMOVED" ? "Removed from roster" : "Transferred"}</Badge>}
        </div>
        {cadet.transferredFrom && (
          <p className="mt-2 text-sm text-slate-600">
            Transferred from{" "}
            <Link className="underline" href={`/cadets/${cadet.transferredFrom.id}`}>
              {cadet.transferredFrom.batch.name}
            </Link>
            . Earlier records remain with that batch.
          </p>
        )}
        {cadet.transferredTo && (
          <p className="mt-2 text-sm text-slate-600">
            Transferred to{" "}
            <Link className="underline" href={`/cadets/${cadet.transferredTo.id}`}>
              {cadet.transferredTo.batch.name}
            </Link>
            .
          </p>
        )}
        <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3" data-testid="cadet-counts">
          <Stat label="NORs" value={counts.nor} />
          <Stat label="CROWs" value={counts.crow} />
          <Stat label="Statements" value={counts.statements} />
          <Stat label="Outstanding" value={counts.outstanding} />
        </dl>
      </Card>

      {!readOnly && cadet.status === "ACTIVE" && (
        <div className="grid grid-cols-3 gap-2">
          <Link href={newHref("NOR")} className={buttonClasses("secondary", "md", "px-2")}>
            <Plus className="h-4 w-4" aria-hidden /> NOR
          </Link>
          <Link href={newHref("CROW")} className={buttonClasses("secondary", "md", "px-2")}>
            <Plus className="h-4 w-4" aria-hidden /> CROW
          </Link>
          <Link href={newHref("STATEMENT")} className={buttonClasses("secondary", "md", "px-2")}>
            <FileText className="h-4 w-4" aria-hidden /> Statement
          </Link>
        </div>
      )}

      {flags.map((f) => (
        <Alert key={f.categoryId} tone="warning" title={f.needsManualReview ? "Possible repeated records — manual review needed" : "Repeated records in this category — review recommended"}>
          {f.recordType} · {f.category}: {f.distinctOccurrences} distinct occurrence{f.distinctOccurrences === 1 ? "" : "s"} across {f.recordCount} record
          {f.recordCount === 1 ? "" : "s"}. This is a prompt for review only — not a finding.
        </Alert>
      ))}

      <section aria-labelledby="history-h">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="history-h" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Record history
          </h2>
        </div>
        <nav className="mb-2 flex gap-1 overflow-x-auto" aria-label="Filter history by type">
          {TABS.map((t) => {
            const active = (sp.type ?? "") === t.value;
            return (
              <Link
                key={t.value}
                href={`/cadets/${cadet.id}?${t.value ? `type=${t.value}` : ""}${ctxParam}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium",
                  active ? "bg-navy-800 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {history.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="No records">
            {sp.type ? "No records of this type for this cadet." : "Nothing has been recorded for this cadet in this batch."}
          </EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100" data-testid="cadet-history">
              {history.map((e) => (
                <li key={`${e.kind}-${e.id}`}>
                  <HistoryItem e={e} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
