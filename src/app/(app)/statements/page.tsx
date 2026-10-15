import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { StatementStatus } from "@prisma/client";
import { resolveBatchContext } from "@/server/context";
import { listStatements } from "@/server/services/statements";
import { listBytes } from "@/server/services/bytes";
import { dashboardCounts } from "@/server/services/stats";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { FilterBar, FilterField, filterControl } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { StatementQueue } from "@/components/statements/statement-queue";
import { batchHref, cn, pluralize } from "@/lib/utils";
import { dueRelative, formatDateOnly, formatDateTime, formatDeadline, todayISO } from "@/lib/dates";
import { isOverdue } from "@/lib/statement-utils";
import { isStatementStatus } from "@/lib/labels";

export const metadata = { title: "Statements" };

type SP = { b?: string; status?: string; byte?: string; from?: string; to?: string; q?: string; voided?: string; cadet?: string; occurrence?: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const statusParam = sp.status ?? "OUTSTANDING";
  const status: StatementStatus | "OUTSTANDING" | "OVERDUE" | undefined =
    statusParam === "ALL"
      ? undefined
      : statusParam === "OUTSTANDING" || statusParam === "OVERDUE"
        ? statusParam
        : isStatementStatus(statusParam)
          ? statusParam
          : "OUTSTANDING";
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const [{ rows, total }, bytes, counts] = await Promise.all([
    listStatements(ctx.batch.id, {
      status,
      byteId: sp.byte || undefined,
      from,
      to,
      q: sp.q?.trim() || undefined,
      includeVoided: sp.voided === "1",
      cadetId: sp.cadet || undefined,
      occurrenceId: sp.occurrence || undefined,
    }),
    listBytes(ctx.batch.id),
    dashboardCounts(ctx.batch.id),
  ]);

  const now = new Date();
  const tabs = [
    { value: "OUTSTANDING", label: "Outstanding", n: counts.outstanding },
    { value: "OVERDUE", label: "Overdue", n: counts.overdue },
    { value: "PENDING_REVIEW", label: "Pending review", n: counts.pendingReview },
    { value: "REWRITE_REQUIRED", label: "Rewrite required", n: counts.rewriteRequired },
    { value: "NOT_SUBMITTED", label: "Not submitted", n: counts.notSubmitted },
    { value: "ACCEPTED", label: "Accepted", n: counts.accepted },
    { value: "ALL", label: "All", n: counts.statements },
  ];
  const activeCount = [sp.byte, from, to, sp.q, sp.voided].filter(Boolean).length;
  const keep = { b: ctx.contextParam ?? undefined, byte: sp.byte, from, to, q: sp.q, voided: sp.voided };

  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader
        title="Statements"
        description="Track each cadet's statement from request to acceptance."
        actions={
          !ctx.readOnly && ctx.isActive ? (
            <Link href="/records/new?type=STATEMENT" className={buttonClasses("primary")}>
              <Plus className="h-4 w-4" aria-hidden /> Request
            </Link>
          ) : undefined
        }
      />
      <nav className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Statement status">
        {tabs.map((t) => {
          const active = (status ?? "ALL") === t.value;
          const params = new URLSearchParams(Object.entries({ ...keep, status: t.value }).filter(([, v]) => v) as [string, string][]);
          return (
            <Link
              key={t.value}
              href={`/statements?${params}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
                active ? "bg-primary text-white" : "bg-surface text-slate-700 ring-1 ring-inset ring-slate-200",
              )}
            >
              {t.label}
              <span className={cn("tabular-nums", active ? "text-on-primary-muted" : "text-slate-500")}>{t.n}</span>
            </Link>
          );
        })}
      </nav>

      <FilterBar hidden={{ b: ctx.contextParam, status: statusParam }} resetHref={batchHref("/statements", ctx.contextParam, { status: statusParam })} activeCount={activeCount}>
        <FilterField label="Search">
          <input name="q" type="search" defaultValue={sp.q} className={filterControl} placeholder="Cadet or description" />
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
        <div className="grid grid-cols-2 gap-2">
          <FilterField label="Issued from">
            <input name="from" type="date" defaultValue={from} className={filterControl} />
          </FilterField>
          <FilterField label="To">
            <input name="to" type="date" defaultValue={to} className={filterControl} />
          </FilterField>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" name="voided" value="1" defaultChecked={sp.voided === "1"} className="h-5 w-5 accent-primary" />
          Include voided
        </label>
      </FilterBar>

      <p className="mb-1 text-sm text-slate-500" aria-live="polite">
        {pluralize(total, "statement")}
        {rows.length < total ? ` (showing ${rows.length})` : ""}
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText className="h-10 w-10" />} title="No statements here">
          {status === "OUTSTANDING" ? "There are no outstanding statements." : status === "OVERDUE" ? "Nothing is overdue." : "Try another status or filter."}
        </EmptyState>
      ) : (
        <StatementQueue
          batchId={ctx.batch.id}
          readOnly={ctx.readOnly}
          today={todayISO()}
          rows={rows.map((s) => ({
            id: s.id,
            cadetName: s.cadet.name,
            byteName: s.cadet.byte?.name ?? null,
            title: s.title,
            status: s.status,
            issuedOn: formatDateOnly(s.issuedOn),
            dueLabel: formatDeadline(s.dueAt),
            dueRelative: dueRelative(s.dueAt, now),
            overdue: isOverdue(s, now),
            receivedAt: s.lastReceivedAt ? formatDateTime(s.lastReceivedAt) : null,
            lastLate: !!(s.versions[0]?.dueAt && s.versions[0].receivedAt > s.versions[0].dueAt),
            versions: s._count.versions,
            voided: s.voided,
          }))}
        />
      )}
    </>
  );
}

