import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, FileText, Info, Plus, TrendingUp } from "lucide-react";
import { resolveBatchContext } from "@/server/context";
import { dashboardCounts, recentActivity } from "@/server/services/stats";
import { flaggedCadets, insights, outstandingByCadet, type OutstandingItem } from "@/server/services/dashboard";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { SetupChecklist } from "@/components/common/setup-checklist";
import { SearchTrigger } from "@/components/shell/search-trigger";
import { BatchBanner } from "@/components/common/batch-banner";
import { ActivityList } from "@/components/common/activity-list";
import { Card, EmptyState, SectionTitle } from "@/components/ui/misc";
import { OverdueBadge, StatusBadge } from "@/components/ui/badges";
import { batchHref, cn, pluralize, truncate } from "@/lib/utils";
import { dueRelative, formatDeadline, formatRelative, todayISO } from "@/lib/dates";
import { StatementQuickActions } from "@/components/statements/statement-quick-actions";

export const metadata = { title: "Home" };

function itemLine(i: OutstandingItem, now: Date) {
  if (i.status === "PENDING_REVIEW") return `Handed in ${i.lastReceivedAt ? formatRelative(i.lastReceivedAt, now) : ""} — waiting for your review`;
  const what = i.status === "REWRITE_REQUIRED" ? "Rewrite" : "Statement";
  return `${what} ${i.overdue ? dueRelative(i.dueAt, now) : `due ${formatDeadline(i.dueAt)} (${dueRelative(i.dueAt, now).replace("due ", "")})`}`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const ctx = await resolveBatchContext((await searchParams).b);
  if (!ctx) return <NoActiveBatch />;
  const b = ctx.contextParam;
  const now = new Date();
  const [outstanding, flagged, findings, counts, activity] = await Promise.all([
    outstandingByCadet(ctx.batch.id, now),
    flaggedCadets(ctx.batch.id),
    insights(ctx.batch.id, now),
    dashboardCounts(ctx.batch.id),
    recentActivity(ctx.batch.id, 6),
  ]);
  const t = outstanding.totals;
  const today = todayISO(now);
  const SHOWN = 8;

  const summary =
    t.outstanding === 0
      ? "No statements are outstanding."
      : [
          t.overdue && `${t.overdue} overdue`,
          t.dueSoon && `${t.dueSoon} due within 24 h`,
          t.awaitingReview && `${t.awaitingReview} waiting for your review`,
        ]
          .filter(Boolean)
          .join(" · ") || `${pluralize(t.outstanding, "statement")} outstanding, all on track`;

  const cards = [
    { label: "Cadets", value: counts.cadets, href: batchHref("/cadets", b), testid: "count-cadets" },
    { label: "NORs", value: counts.nor, href: batchHref("/records", b, { type: "NOR" }), testid: "count-nor" },
    { label: "CROWs", value: counts.crow, href: batchHref("/records", b, { type: "CROW" }), testid: "count-crow" },
    { label: "Statements", value: counts.statements, href: batchHref("/statements", b, { status: "ALL" }), testid: "count-statements" },
    { label: "Overdue", value: counts.overdue, href: batchHref("/statements", b, { status: "OVERDUE" }), testid: "count-overdue", tone: "red" },
    { label: "Not submitted", value: counts.notSubmitted, href: batchHref("/statements", b, { status: "NOT_SUBMITTED" }), testid: "count-not-submitted" },
    { label: "Pending review", value: counts.pendingReview, href: batchHref("/statements", b, { status: "PENDING_REVIEW" }), testid: "count-pending" },
    { label: "Rewrite required", value: counts.rewriteRequired, href: batchHref("/statements", b, { status: "REWRITE_REQUIRED" }), testid: "count-rewrite" },
    { label: "Accepted", value: counts.accepted, href: batchHref("/statements", b, { status: "ACCEPTED" }), testid: "count-accepted" },
  ];

  const quick = [
    { label: "New NOR", href: "/records/new?type=NOR", Icon: Plus },
    { label: "New CROW", href: "/records/new?type=CROW", Icon: Plus },
    { label: "Request statements", href: "/records/new?type=STATEMENT", Icon: FileText },
    { label: "Review statements", href: "/statements?status=PENDING_REVIEW", Icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <BatchBanner ctx={ctx} />
      {ctx.isActive && <SetupChecklist />}
      <h1 className="sr-only">{ctx.batch.name} dashboard</h1>
      <SearchTrigger />

      <p className={cn("rounded-xl px-4 py-3 text-sm font-medium", t.overdue ? "bg-red-50 text-red-900" : t.outstanding ? "bg-navy-50 text-navy-900" : "bg-emerald-50 text-emerald-900")} data-testid="today-summary">
        {summary}
      </p>

      {!ctx.readOnly && ctx.isActive && (
        <nav aria-label="Quick actions" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {quick.map(({ label, href, Icon }) => (
            <Link
              key={label}
              href={href}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-navy-900 hover:border-navy-300 hover:bg-navy-50"
            >
              <Icon className="h-4 w-4 text-navy-600" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      )}

      {/* 1. Outstanding statements, by cadet */}
      <section aria-labelledby="outstanding-h">
        <SectionTitle
          id="outstanding-h"
          action={
            t.outstanding > 0 ? (
              <Link href={batchHref("/statements", b, { status: "OUTSTANDING" })} className="text-sm font-medium text-navy-700 hover:underline">
                Open queue
              </Link>
            ) : undefined
          }
        >
          Outstanding statements ({t.outstanding})
        </SectionTitle>
        {outstanding.cadets.length === 0 ? (
          <Card className="flex items-center gap-3 px-4 py-4 text-sm text-slate-600">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> Every statement has been handed in and reviewed.
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100" data-testid="outstanding-list">
              {outstanding.cadets.slice(0, SHOWN).map((c) => (
                <li key={c.cadetId} className={cn("px-4 py-3", c.urgency === 0 && "bg-red-50/40")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={batchHref(`/cadets/${c.cadetId}`, b)} className="font-medium text-slate-900 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-xs text-slate-500">{c.byteName ?? "No byte"}</span>
                  </div>
                  <ul className="mt-1 space-y-3">
                    {c.items.map((i) => (
                      <li key={i.id} className="space-y-1.5">
                        <Link href={`/statements/${i.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm hover:underline">
                          {i.overdue ? <OverdueBadge /> : <StatusBadge status={i.status} />}
                          <span className={cn(i.overdue ? "font-medium text-red-900" : i.dueSoon ? "font-medium text-amber-900" : "text-slate-700")}>{itemLine(i, now)}</span>
                          <span className="w-full text-xs text-slate-500 sm:w-auto">· {truncate(i.title, 60)}</span>
                        </Link>
                        {!ctx.readOnly && <StatementQuickActions id={i.id} status={i.status} versions={i.versions} cadetName={c.name} today={today} />}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {outstanding.cadets.length > SHOWN && (
              <Link href={batchHref("/statements", b, { status: "OUTSTANDING" })} className="flex min-h-11 items-center justify-center border-t border-slate-100 text-sm font-medium text-navy-700">
                + {pluralize(outstanding.cadets.length - SHOWN, "more cadet")} with outstanding statements
              </Link>
            )}
          </Card>
        )}
      </section>

      {/* 2. Flagged cadets */}
      <section aria-labelledby="flagged-h">
        <SectionTitle id="flagged-h">Cadets flagged for review ({flagged.cadets.length})</SectionTitle>
        <p className="-mt-1 mb-2 text-sm text-slate-600">
          Flagged at {flagged.recordThreshold}+ separate NOR/CROW occurrences, {flagged.statementThreshold}+ statements, or the same issue repeating.
          A prompt to check in with the cadet — not a finding.{" "}
          <Link href="/settings" className="underline">
            Adjust
          </Link>
        </p>
        {flagged.cadets.length === 0 ? (
          <Card className="px-4 py-4 text-sm text-slate-600">No cadet has reached a review threshold.</Card>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100" data-testid="flagged-list">
              {flagged.cadets.map((c) => (
                <li key={c.cadetId}>
                  <Link href={batchHref(`/cadets/${c.cadetId}`, b)} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {c.name} <span className="text-sm font-normal text-slate-500">· {c.byteName ?? "No byte"}</span>
                      </p>
                      <ul className="mt-0.5 space-y-0.5 text-sm text-slate-700">
                        {c.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <p className="mt-0.5 text-xs text-slate-500">Latest entry {formatRelative(c.lastActivity, now)}</p>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* 3. What the data says */}
      {findings.length > 0 && (
        <section aria-labelledby="insights-h">
          <SectionTitle id="insights-h">What the data says</SectionTitle>
          <ul className="grid gap-2 lg:grid-cols-2" data-testid="insights">
            {findings.map((f) => {
              const Icon = f.tone === "attention" ? AlertTriangle : f.tone === "good" ? CheckCircle2 : f.key === "trend" ? TrendingUp : Info;
              const body = (
                <>
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", f.tone === "attention" ? "text-amber-600" : f.tone === "good" ? "text-emerald-600" : "text-navy-600")} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{f.headline}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Why it matters: </span>
                      {f.why}
                    </p>
                  </div>
                </>
              );
              return (
                <li key={f.key}>
                  {f.href ? (
                    <Link href={batchHref(f.href.split("?")[0]!, b, Object.fromEntries(new URLSearchParams(f.href.split("?")[1] ?? "")))} className="flex h-full gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-navy-300">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex h-full gap-3 rounded-xl border border-slate-200 bg-white p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 4. Totals */}
      <section aria-labelledby="totals-h">
        <SectionTitle id="totals-h">Batch totals</SectionTitle>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              data-testid={c.testid}
              className={cn("rounded-xl border bg-white px-3 py-2 hover:border-navy-300", c.tone === "red" && c.value > 0 ? "border-red-300" : "border-slate-200")}
            >
              <p className="truncate text-xs text-slate-600">{c.label}</p>
              <p className={cn("text-xl font-semibold tabular-nums", c.tone === "red" && c.value > 0 ? "text-red-800" : "text-slate-900")} data-value={c.value}>
                {c.value}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Latest changes */}
      <section aria-labelledby="activity-h">
        <SectionTitle
          id="activity-h"
          action={
            <Link href={batchHref("/activity", b)} className="text-sm font-medium text-navy-700 hover:underline">
              Full history
            </Link>
          }
        >
          Latest changes
        </SectionTitle>
        {activity.length === 0 ? (
          <EmptyState title="No activity yet">Records you create will appear here.</EmptyState>
        ) : (
          <Card>
            <ActivityList events={activity} />
          </Card>
        )}
      </section>
    </div>
  );
}
