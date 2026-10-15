import type { Prisma, RecordType, StatementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysISO, dateOnlyISO, parseISODate, startOfDayInTz, todayISO, toISODateInTz } from "@/lib/dates";
import { OUTSTANDING_STATUSES, STATEMENT_STATUSES } from "@/lib/labels";

export async function dashboardCounts(batchId: string) {
  const [cadets, records, statements] = await Promise.all([
    prisma.cadet.count({ where: { batchId, status: "ACTIVE" } }),
    prisma.record.groupBy({ by: ["type"], where: { batchId, status: "ACTIVE" }, _count: true }),
    prisma.statement.groupBy({ by: ["status"], where: { batchId, voided: false }, _count: true }),
  ]);
  const byType = Object.fromEntries(records.map((r) => [r.type, r._count])) as Partial<Record<RecordType, number>>;
  const byStatus = Object.fromEntries(statements.map((s) => [s.status, s._count])) as Partial<Record<StatementStatus, number>>;
  const totalStatements = statements.reduce((n, s) => n + s._count, 0);
  return {
    cadets,
    nor: byType.NOR ?? 0,
    crow: byType.CROW ?? 0,
    statements: totalStatements,
    notSubmitted: byStatus.NOT_SUBMITTED ?? 0,
    pendingReview: byStatus.PENDING_REVIEW ?? 0,
    rewriteRequired: byStatus.REWRITE_REQUIRED ?? 0,
    accepted: byStatus.ACCEPTED ?? 0,
    outstanding: OUTSTANDING_STATUSES.reduce((n, st) => n + (byStatus[st] ?? 0), 0),
  };
}

export type StatsFilters = {
  byteId?: string;
  type?: "NOR" | "CROW" | "STATEMENT";
  categoryId?: string;
  status?: StatementStatus;
  from?: string;
  to?: string;
};

function dateRange(field: "occurredOn" | "requestedOn", f: StatsFilters) {
  if (!f.from && !f.to) return {};
  return {
    [field]: {
      ...(f.from ? { gte: parseISODate(f.from) } : {}),
      ...(f.to ? { lte: parseISODate(f.to) } : {}),
    },
  };
}

export async function statistics(batchId: string, f: StatsFilters = {}) {
  const includeRecords = f.type !== "STATEMENT";
  const includeStatements = f.type === undefined || f.type === "STATEMENT";
  const recordWhere: Prisma.RecordWhereInput = {
    batchId,
    status: "ACTIVE",
    ...(f.type === "NOR" || f.type === "CROW" ? { type: f.type } : {}),
    ...(f.byteId ? { cadet: { byteId: f.byteId === "none" ? null : f.byteId } } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...dateRange("occurredOn", f),
  };
  const statementWhere: Prisma.StatementWhereInput = {
    batchId,
    voided: false,
    ...(f.byteId ? { cadet: { byteId: f.byteId === "none" ? null : f.byteId } } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...dateRange("requestedOn", f),
  };

  const [records, statements, bytes, categories] = await Promise.all([
    includeRecords
      ? prisma.record.findMany({
          where: recordWhere,
          select: { type: true, occurredOn: true, categoryId: true, cadet: { select: { byteId: true } } },
        })
      : Promise.resolve([]),
    includeStatements
      ? prisma.statement.findMany({
          where: statementWhere,
          select: { id: true, status: true, requestedOn: true, cadet: { select: { byteId: true } } },
        })
      : Promise.resolve([]),
    prisma.byte.findMany({ where: { batchId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.category.findMany(),
  ]);

  const distribution = {
    nor: records.filter((r) => r.type === "NOR").length,
    crow: records.filter((r) => r.type === "CROW").length,
    statements: statements.length,
  };

  const statusCounts = STATEMENT_STATUSES.map((status) => ({
    status,
    count: statements.filter((s) => s.status === status).length,
  }));

  const byteRows = [...bytes.map((b) => ({ id: b.id, name: b.name })), { id: null as string | null, name: "Unassigned" }];
  const byByte = byteRows
    .map((b) => ({
      byteId: b.id,
      byte: b.name,
      nor: records.filter((r) => r.type === "NOR" && r.cadet.byteId === b.id).length,
      crow: records.filter((r) => r.type === "CROW" && r.cadet.byteId === b.id).length,
      statements: statements.filter((s) => s.cadet.byteId === b.id).length,
    }))
    .filter((r) => r.byteId !== null || r.nor + r.crow + r.statements > 0);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catCounts = new Map<string, { type: RecordType; categoryId: string | null; category: string; count: number }>();
  for (const r of records) {
    const key = `${r.type}:${r.categoryId ?? "none"}`;
    const cur = catCounts.get(key) ?? {
      type: r.type,
      categoryId: r.categoryId,
      category: r.categoryId ? (catName.get(r.categoryId) ?? "Unknown") : "Uncategorised",
      count: 0,
    };
    cur.count++;
    catCounts.set(key, cur);
  }
  const byCategory = [...catCounts.values()].sort((a, b) => b.count - a.count);

  // Activity over time (by occurrence / request date).
  const allDates = [
    ...records.map((r) => dateOnlyISO(r.occurredOn)),
    ...statements.map((s) => dateOnlyISO(s.requestedOn)),
  ].sort();
  const end = f.to ?? todayISO();
  const start = f.from ?? (allDates[0] && allDates[0] < addDaysISO(end, -29) ? allDates[0] : addDaysISO(end, -29));
  const days = enumerateDays(start, end);
  const weekly = days.length > 62;
  const bucketOf = (iso: string) => (weekly ? weekStart(iso) : iso);
  const buckets = new Map<string, { date: string; nor: number; crow: number; statements: number }>();
  for (const d of days) {
    const b = bucketOf(d);
    if (!buckets.has(b)) buckets.set(b, { date: b, nor: 0, crow: 0, statements: 0 });
  }
  for (const r of records) {
    const b = buckets.get(bucketOf(dateOnlyISO(r.occurredOn)));
    if (b) b[r.type === "NOR" ? "nor" : "crow"]++;
  }
  for (const s of statements) {
    const b = buckets.get(bucketOf(dateOnlyISO(s.requestedOn)));
    if (b) b.statements++;
  }
  const activity = { granularity: weekly ? ("week" as const) : ("day" as const), points: [...buckets.values()] };

  const outstanding = includeStatements
    ? await outstandingOverTime(new Set(statements.map((s) => s.id)), batchId, start, end)
    : [];

  return { distribution, statusCounts, byByte, byCategory, activity, outstanding, filtersApplied: f };
}

function enumerateDays(start: string, end: string) {
  const out: string[] = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard++ < 1000) {
    out.push(d);
    d = addDaysISO(d, 1);
  }
  return out;
}

function weekStart(iso: string) {
  const d = parseISODate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDaysISO(iso, -dow);
}

const STATUS_EVENTS = [
  "statement.created",
  "statement.received",
  "statement.resubmitted",
  "statement.accepted",
  "statement.rewrite_requested",
  "statement.reopened",
  "statement.voided",
];

/**
 * Outstanding statements at the end of each day, reconstructed from the
 * append-only audit trail of status changes.
 */
async function outstandingOverTime(ids: Set<string>, batchId: string, start: string, end: string) {
  if (ids.size === 0) return enumerateDays(start, end).map((date) => ({ date, outstanding: 0 }));
  const events = await prisma.auditEvent.findMany({
    where: { batchId, entityType: "Statement", action: { in: STATUS_EVENTS }, entityId: { in: [...ids] } },
    select: { entityId: true, action: true, createdAt: true, changes: true },
    orderBy: { createdAt: "asc" },
  });
  const timelines = new Map<string, { at: number; outstanding: boolean }[]>();
  for (const e of events) {
    const changes = (e.changes ?? {}) as { status?: { to?: string } };
    let outstanding: boolean;
    if (e.action === "statement.voided") outstanding = false;
    else {
      const to = changes.status?.to;
      if (!to) continue;
      outstanding = (OUTSTANDING_STATUSES as string[]).includes(to);
    }
    const list = timelines.get(e.entityId!) ?? [];
    list.push({ at: e.createdAt.getTime(), outstanding });
    timelines.set(e.entityId!, list);
  }
  const days = enumerateDays(start, end);
  const step = days.length > 62 ? 7 : 1;
  const points: { date: string; outstanding: number }[] = [];
  for (let i = 0; i < days.length; i += step) {
    const date = days[Math.min(i + step - 1, days.length - 1)]!;
    const endOfDay = startOfDayInTz(addDaysISO(date, 1)).getTime() - 1;
    let n = 0;
    for (const tl of timelines.values()) {
      let state = false;
      for (const ev of tl) {
        if (ev.at > endOfDay) break;
        state = ev.outstanding;
      }
      if (state) n++;
    }
    points.push({ date, outstanding: n });
  }
  return points;
}

export async function recentActivity(batchId: string, take = 12) {
  const rows = await prisma.auditEvent.findMany({
    where: { batchId, action: { notIn: ["auth.login", "auth.logout"] } },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: take * 8,
  });
  // Hide the per-cadet rows of a bulk operation; the bulk summary row represents them.
  return rows
    .filter((e) => !(e.changes && typeof e.changes === "object" && !Array.isArray(e.changes) && (e.changes as { bulk?: boolean }).bulk === true))
    .slice(0, take);
}

export { toISODateInTz };
