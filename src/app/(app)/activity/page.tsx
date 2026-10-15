import Link from "@/components/ui/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveBatchContext } from "@/server/context";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { ActivityList } from "@/components/common/activity-list";
import { FilterBar, FilterField, filterControl } from "@/components/common/filter-bar";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { batchHref } from "@/lib/utils";

export const metadata = { title: "Activity history" };
const PAGE = 50;

const GROUPS: Record<string, { label: string; where: Prisma.AuditEventWhereInput }> = {
  records: { label: "NOR / CROW", where: { OR: [{ entityType: "Record" }, { action: "bulk.created" }] } },
  statements: { label: "Statements", where: { entityType: "Statement" } },
  roster: { label: "Roster & bytes", where: { entityType: { in: ["Cadet", "Byte"] } } },
  batch: { label: "Batch changes", where: { entityType: "Batch" } },
  corrections: { label: "Corrections & voids", where: { OR: [{ action: { endsWith: ".corrected" } }, { action: { endsWith: ".voided" } }, { action: "statement.reopened" }] } },
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ b?: string; group?: string; actor?: string; scope?: string; before?: string }> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const system = sp.scope === "system";
  const where: Prisma.AuditEventWhereInput = {
    ...(system ? { batchId: null } : { batchId: ctx.batch.id }),
    ...(sp.group && GROUPS[sp.group] ? GROUPS[sp.group]!.where : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.before ? { createdAt: { lt: new Date(sp.before) } } : {}),
  };
  const [events, users] = await Promise.all([
    prisma.auditEvent.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: PAGE + 1 }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const more = events.length > PAGE;
  const shown = events.slice(0, PAGE);
  const last = shown[shown.length - 1];
  const keep = { group: sp.group, actor: sp.actor, scope: sp.scope };

  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader title="Activity history" description="Append-only audit trail. Entries cannot be edited or deleted." />
      <FilterBar hidden={{ b: ctx.contextParam }} resetHref={batchHref("/activity", ctx.contextParam)} activeCount={[sp.group, sp.actor, sp.scope].filter(Boolean).length}>
        <FilterField label="Scope">
          <select name="scope" defaultValue={sp.scope ?? ""} className={filterControl}>
            <option value="">{ctx.batch.name}</option>
            <option value="system">Accounts & settings (not batch-specific)</option>
          </select>
        </FilterField>
        <FilterField label="Type">
          <select name="group" defaultValue={sp.group ?? ""} className={filterControl}>
            <option value="">All activity</option>
            {Object.entries(GROUPS).map(([k, g]) => (
              <option key={k} value={k}>
                {g.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Instructor">
          <select name="actor" defaultValue={sp.actor ?? ""} className={filterControl}>
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>
      {shown.length === 0 ? (
        <EmptyState title="No activity found" />
      ) : (
        <Card>
          <ActivityList events={shown} relative={false} showReason />
        </Card>
      )}
      {more && last && (
        <div className="mt-4 text-center">
          <Link href={batchHref("/activity", ctx.contextParam, { ...keep, before: last.createdAt.toISOString() })} className="inline-flex min-h-11 items-center px-4 text-sm font-medium text-navy-700 underline">
            Older activity
          </Link>
        </div>
      )}
    </>
  );
}
