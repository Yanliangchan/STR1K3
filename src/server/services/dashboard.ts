/**
 * Dashboard read models. Everything here answers "what needs doing, and why"
 * rather than listing raw numbers. All values come from saved records.
 */
import type { StatementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppConfig } from "./config";
import { addDaysISO, parseISODate, todayISO } from "@/lib/dates";
import { recurringFlags } from "./recurring";

const HOUR = 3600_000;

export type OutstandingItem = {
  id: string;
  title: string;
  status: StatementStatus;
  dueAt: Date;
  lastReceivedAt: Date | null;
  versions: number;
  overdue: boolean;
  dueSoon: boolean;
};

export type OutstandingCadet = {
  cadetId: string;
  name: string;
  byteName: string | null;
  items: OutstandingItem[];
  /** 0 = overdue, 1 = due within 24 h, 2 = waiting on instructor review, 3 = other */
  urgency: number;
};

/** Cadets with outstanding statements, most urgent first. */
export async function outstandingByCadet(batchId: string, now = new Date()) {
  const rows = await prisma.statement.findMany({
    where: { batchId, voided: false, status: { in: ["NOT_SUBMITTED", "PENDING_REVIEW", "REWRITE_REQUIRED"] } },
    include: { cadet: { include: { byte: true } }, _count: { select: { versions: { where: { retractedAt: null } } } } },
  });
  const byCadet = new Map<string, OutstandingCadet>();
  for (const s of rows) {
    const waiting = s.status !== "PENDING_REVIEW";
    const overdue = waiting && s.dueAt < now;
    const dueSoon = waiting && !overdue && s.dueAt.getTime() - now.getTime() < 24 * HOUR;
    const item: OutstandingItem = { id: s.id, title: s.title, status: s.status, dueAt: s.dueAt, lastReceivedAt: s.lastReceivedAt, versions: s._count.versions, overdue, dueSoon };
    const c = byCadet.get(s.cadetId) ?? { cadetId: s.cadetId, name: s.cadet.name, byteName: s.cadet.byte?.name ?? null, items: [], urgency: 3 };
    c.items.push(item);
    c.urgency = Math.min(c.urgency, overdue ? 0 : dueSoon ? 1 : s.status === "PENDING_REVIEW" ? 2 : 3);
    byCadet.set(s.cadetId, c);
  }
  const rank = (i: OutstandingItem) => (i.overdue ? 0 : i.dueSoon ? 1 : i.status === "PENDING_REVIEW" ? 2 : 3);
  const cadets = [...byCadet.values()];
  for (const c of cadets) c.items.sort((a, b) => rank(a) - rank(b) || a.dueAt.getTime() - b.dueAt.getTime());
  cadets.sort((a, b) => a.urgency - b.urgency || a.items[0]!.dueAt.getTime() - b.items[0]!.dueAt.getTime() || a.name.localeCompare(b.name));
  const items = cadets.flatMap((c) => c.items);
  return {
    cadets,
    totals: {
      outstanding: items.length,
      overdue: items.filter((i) => i.overdue).length,
      dueSoon: items.filter((i) => i.dueSoon).length,
      awaitingReview: items.filter((i) => i.status === "PENDING_REVIEW").length,
    },
  };
}

export type FlaggedCadet = {
  cadetId: string;
  name: string;
  byteName: string | null;
  reasons: string[];
  lastActivity: Date;
};

/**
 * Cadets who meet a review threshold: many distinct NOR/CROW occurrences,
 * many statements requested, or the same category repeating. Ordered by most
 * recent activity (not by count) so the list is a review queue, not a ranking.
 */
export async function flaggedCadets(batchId: string): Promise<{ cadets: FlaggedCadet[]; recordThreshold: number; statementThreshold: number }> {
  const cfg = await getAppConfig();
  const recordThreshold = cfg?.flagRecordThreshold ?? 3;
  const statementThreshold = cfg?.flagStatementThreshold ?? 3;
  const [records, statements, repeat] = await Promise.all([
    prisma.record.findMany({
      where: { batchId, status: "ACTIVE", cadet: { status: "ACTIVE" } },
      select: { id: true, type: true, occurrenceId: true, createdAt: true, cadet: { select: { id: true, name: true, byte: { select: { name: true } } } } },
    }),
    prisma.statement.findMany({
      where: { batchId, voided: false, cadet: { status: "ACTIVE" } },
      select: { status: true, dueAt: true, createdAt: true, cadet: { select: { id: true, name: true, byte: { select: { name: true } } } } },
    }),
    recurringFlags(batchId),
  ]);

  type Acc = { name: string; byteName: string | null; occ: Set<string>; nor: number; crow: number; stmts: number; overdue: number; last: Date };
  const acc = new Map<string, Acc>();
  const get = (c: { id: string; name: string; byte: { name: string } | null }) => {
    let a = acc.get(c.id);
    if (!a) acc.set(c.id, (a = { name: c.name, byteName: c.byte?.name ?? null, occ: new Set(), nor: 0, crow: 0, stmts: 0, overdue: 0, last: new Date(0) }));
    return a;
  };
  const now = new Date();
  for (const r of records) {
    const a = get(r.cadet);
    a.occ.add(r.occurrenceId ?? `rec:${r.id}`);
    if (r.type === "NOR") a.nor++;
    else a.crow++;
    if (r.createdAt > a.last) a.last = r.createdAt;
  }
  for (const s of statements) {
    const a = get(s.cadet);
    a.stmts++;
    if ((s.status === "NOT_SUBMITTED" || s.status === "REWRITE_REQUIRED") && s.dueAt < now) a.overdue++;
    if (s.createdAt > a.last) a.last = s.createdAt;
  }
  const repeatBy = new Map<string, string[]>();
  for (const f of repeat) {
    const list = repeatBy.get(f.cadetId) ?? [];
    list.push(`${f.category} (${f.recordType}) repeated ${f.distinctOccurrences}×${f.needsManualReview ? " — check for duplicates" : ""}`);
    repeatBy.set(f.cadetId, list);
  }

  const cadets: FlaggedCadet[] = [];
  for (const [cadetId, a] of acc) {
    const reasons: string[] = [];
    if (a.occ.size >= recordThreshold) {
      const parts = [a.nor && `${a.nor} NOR`, a.crow && `${a.crow} CROW`].filter(Boolean).join(", ");
      reasons.push(`${a.occ.size} separate occurrences recorded (${parts})`);
    }
    if (a.stmts >= statementThreshold) reasons.push(`${a.stmts} statements requested${a.overdue ? `, ${a.overdue} overdue` : ""}`);
    reasons.push(...(repeatBy.get(cadetId) ?? []));
    if (reasons.length) cadets.push({ cadetId, name: a.name, byteName: a.byteName, reasons, lastActivity: a.last });
  }
  cadets.sort((x, y) => y.lastActivity.getTime() - x.lastActivity.getTime());
  return { cadets, recordThreshold, statementThreshold };
}

export type Insight = {
  key: string;
  headline: string;
  why: string;
  tone: "attention" | "info" | "good";
  href?: string;
};

/**
 * A handful of findings, each with the reason it matters. An insight is only
 * shown when there is enough data for it to mean something.
 */
export async function insights(batchId: string, now = new Date()): Promise<Insight[]> {
  const today = todayISO(now);
  const weekStart = parseISODate(addDaysISO(today, -6));
  const prevStart = parseISODate(addDaysISO(today, -13));
  const [statements, versions, reviews, recentRecords, allRecords, cadets] = await Promise.all([
    prisma.statement.findMany({ where: { batchId, voided: false }, select: { status: true, dueAt: true, lastReceivedAt: true } }),
    prisma.statementVersion.findMany({ where: { retractedAt: null, statement: { batchId, voided: false } }, select: { receivedAt: true, dueAt: true } }),
    prisma.statementReview.findMany({ where: { retractedAt: null, statement: { batchId, voided: false } }, select: { outcome: true } }),
    prisma.record.findMany({ where: { batchId, status: "ACTIVE", occurredOn: { gte: prevStart } }, select: { occurredOn: true } }),
    prisma.record.findMany({ where: { batchId, status: "ACTIVE" }, select: { category: { select: { name: true } }, type: true, cadet: { select: { byteId: true, byte: { select: { name: true } } } } } }),
    prisma.cadet.groupBy({ by: ["byteId"], where: { batchId, status: "ACTIVE" }, _count: true }),
  ]);
  const out: Insight[] = [];
  const pct = (a: number, b: number) => Math.round((a / b) * 100);

  // 1. Overdue statements.
  const waiting = statements.filter((s) => s.status === "NOT_SUBMITTED" || s.status === "REWRITE_REQUIRED");
  const overdue = waiting.filter((s) => s.dueAt < now);
  if (overdue.length) {
    out.push({
      key: "overdue",
      tone: "attention",
      headline: `${overdue.length} of ${waiting.length} statements still owed by cadets are past their deadline`,
      why: "Chase these first — the longer a statement is outstanding, the harder it is to close out the occurrence it relates to.",
      href: "/statements?status=OVERDUE",
    });
  } else if (waiting.length) {
    out.push({ key: "ontrack", tone: "good", headline: `All ${waiting.length} statements owed by cadets are within their deadline`, why: "No chasing needed right now." });
  }

  // 2. Review backlog (waiting on the instructor).
  const pending = statements.filter((s) => s.status === "PENDING_REVIEW");
  if (pending.length) {
    const oldest = Math.min(...pending.map((s) => s.lastReceivedAt?.getTime() ?? now.getTime()));
    const days = Math.floor((now.getTime() - oldest) / (24 * HOUR));
    out.push({
      key: "backlog",
      tone: days >= 2 ? "attention" : "info",
      headline: `${pending.length} handed-in statement${pending.length === 1 ? " is" : "s are"} waiting for your review${days >= 1 ? ` — the oldest for ${days} day${days === 1 ? "" : "s"}` : ""}`,
      why: "Cadets can't act on feedback until you review, and rewrites can't start.",
      href: "/statements?status=PENDING_REVIEW",
    });
  }

  // 3. Late hand-ins.
  const judged = versions.filter((v) => v.dueAt);
  if (judged.length >= 3) {
    const late = judged.filter((v) => v.receivedAt > v.dueAt!).length;
    if (late > 0) {
      out.push({
        key: "late",
        tone: pct(late, judged.length) >= 30 ? "attention" : "info",
        headline: `${late} of ${judged.length} hand-ins (${pct(late, judged.length)}%) came in after the deadline`,
        why: "A high late rate may mean deadlines are too tight or not being passed on clearly.",
      });
    }
  }

  // 4. Rewrite rate.
  if (reviews.length >= 3) {
    const rewrites = reviews.filter((r) => r.outcome === "REWRITE_REQUIRED").length;
    if (rewrites > 0) {
      out.push({
        key: "rewrites",
        tone: pct(rewrites, reviews.length) >= 40 ? "attention" : "info",
        headline: `${pct(rewrites, reviews.length)}% of reviewed statements needed a rewrite (${rewrites} of ${reviews.length})`,
        why: "Frequent rewrites suggest cadets are unsure what a good statement needs — a short brief on expectations can save repeat work.",
      });
    }
  }

  // 5. Week-on-week trend in NOR/CROW records (by occurrence date).
  const thisWeek = recentRecords.filter((r) => r.occurredOn >= weekStart).length;
  const lastWeek = recentRecords.length - thisWeek;
  if (thisWeek + lastWeek >= 3) {
    const rising = thisWeek > lastWeek;
    const change = lastWeek === 0 ? null : pct(Math.abs(thisWeek - lastWeek), lastWeek);
    out.push({
      key: "trend",
      tone: rising && thisWeek >= lastWeek * 1.5 ? "attention" : thisWeek < lastWeek ? "good" : "info",
      headline:
        thisWeek === lastWeek
          ? `${thisWeek} NOR/CROW records in the last 7 days — the same as the week before`
          : `${thisWeek} NOR/CROW records in the last 7 days, ${rising ? "up" : "down"} from ${lastWeek}${change !== null ? ` (${rising ? "+" : "−"}${change}%)` : ""}`,
      why: rising
        ? "A rise across the batch can point to a shared cause (schedule, fatigue, a rule not understood) worth addressing at a briefing."
        : "Fewer records than last week — recent corrective guidance may be working.",
      href: "/stats",
    });
  }

  // 6. A dominant category.
  if (allRecords.length >= 5) {
    const counts = new Map<string, number>();
    for (const r of allRecords) if (r.category) counts.set(`${r.type} · ${r.category.name}`, (counts.get(`${r.type} · ${r.category.name}`) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && pct(top[1], allRecords.length) >= 30) {
      out.push({
        key: "category",
        tone: "info",
        headline: `${top[0]} makes up ${pct(top[1], allRecords.length)}% of all records (${top[1]} of ${allRecords.length})`,
        why: "When one issue dominates, a batch-wide reminder is often more effective than recording it cadet by cadet.",
        href: "/stats",
      });
    }
  }

  // 7. A byte with a noticeably higher rate per cadet.
  const sizes = new Map(cadets.map((c) => [c.byteId, c._count]));
  const totalCadets = cadets.reduce((n, c) => n + c._count, 0);
  if (allRecords.length >= 6 && totalCadets > 0 && sizes.size > 1) {
    const perByte = new Map<string, { name: string; n: number }>();
    for (const r of allRecords) {
      if (!r.cadet.byteId || !r.cadet.byte) continue;
      const cur = perByte.get(r.cadet.byteId) ?? { name: r.cadet.byte.name, n: 0 };
      cur.n++;
      perByte.set(r.cadet.byteId, cur);
    }
    const avg = allRecords.length / totalCadets;
    const hot = [...perByte.entries()]
      .map(([id, v]) => ({ ...v, rate: v.n / (sizes.get(id) ?? 1) }))
      .sort((a, b) => b.rate - a.rate)[0];
    if (hot && hot.rate >= avg * 1.5 && hot.n >= 3) {
      out.push({
        key: "byte",
        tone: "info",
        headline: `${hot.name} averages ${hot.rate.toFixed(1)} records per cadet, against ${avg.toFixed(1)} across the batch`,
        why: "Worth a word with that byte's leadership to understand whether something specific is going on.",
        href: "/stats",
      });
    }
  }

  return out;
}
