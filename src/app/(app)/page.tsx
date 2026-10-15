import Link from "next/link";
import { AlertTriangle, ClipboardList, FileText, Plus, Search, Users } from "lucide-react";
import { resolveBatchContext } from "@/server/context";
import { dashboardCounts, recentActivity } from "@/server/services/stats";
import { recurringFlags } from "@/server/services/recurring";
import { listStatements } from "@/server/services/statements";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { ActivityList } from "@/components/common/activity-list";
import { Card, EmptyState, SectionTitle } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badges";
import { batchHref, cn, pluralize } from "@/lib/utils";
import { formatRelative } from "@/lib/dates";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const ctx = await resolveBatchContext((await searchParams).b);
  if (!ctx) return <NoActiveBatch />;
  const b = ctx.contextParam;
  const [counts, activity, flags, attention] = await Promise.all([
    dashboardCounts(ctx.batch.id),
    recentActivity(ctx.batch.id, 10),
    recurringFlags(ctx.batch.id),
    listStatements(ctx.batch.id, { status: "PENDING_REVIEW" }, 5),
  ]);

  const cards = [
    { label: "Cadets", value: counts.cadets, href: batchHref("/cadets", b), testid: "count-cadets" },
    { label: "NORs", value: counts.nor, href: batchHref("/records", b, { type: "NOR" }), testid: "count-nor" },
    { label: "CROWs", value: counts.crow, href: batchHref("/records", b, { type: "CROW" }), testid: "count-crow" },
    { label: "Statements", value: counts.statements, href: batchHref("/statements", b, { status: "ALL" }), testid: "count-statements" },
    { label: "Pending review", value: counts.pendingReview, href: batchHref("/statements", b, { status: "PENDING_REVIEW" }), testid: "count-pending", tone: "sky" },
    { label: "Rewrite required", value: counts.rewriteRequired, href: batchHref("/statements", b, { status: "REWRITE_REQUIRED" }), testid: "count-rewrite", tone: "amber" },
    { label: "Not submitted", value: counts.notSubmitted, href: batchHref("/statements", b, { status: "NOT_SUBMITTED" }), testid: "count-not-submitted" },
    { label: "Accepted", value: counts.accepted, href: batchHref("/statements", b, { status: "ACCEPTED" }), testid: "count-accepted" },
  ];

  const quick = [
    { label: "New NOR", href: "/records/new?type=NOR", Icon: Plus },
    { label: "New CROW", href: "/records/new?type=CROW", Icon: Plus },
    { label: "Request statements", href: "/records/new?type=STATEMENT", Icon: FileText },
    { label: "Search cadets", href: "/cadets", Icon: Search },
    { label: "Review statements", href: "/statements?status=PENDING_REVIEW", Icon: ClipboardList },
    { label: "All records", href: "/records", Icon: Users },
  ];

  return (
    <div className="space-y-6">
      <BatchBanner ctx={ctx} />
      <section aria-labelledby="summary-h">
        <h1 id="summary-h" className="sr-only">
          {ctx.batch.name} dashboard
        </h1>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              data-testid={c.testid}
              className={cn(
                "rounded-xl border bg-white px-3 py-3 transition-colors hover:border-navy-300",
                c.tone === "sky" && c.value > 0 ? "border-sky-200" : c.tone === "amber" && c.value > 0 ? "border-amber-300" : "border-slate-200",
              )}
            >
              <p className="text-sm text-slate-600">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900" data-value={c.value}>
                {c.value}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {!ctx.readOnly && ctx.isActive && (
        <section aria-labelledby="quick-h">
          <SectionTitle id="quick-h">Quick actions</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {quick.map(({ label, href, Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy-900 hover:border-navy-300 hover:bg-navy-50"
              >
                <Icon className="h-4 w-4 shrink-0 text-navy-600" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="attention-h">
          <SectionTitle
            id="attention-h"
            action={
              <Link href={batchHref("/statements", b, { status: "OUTSTANDING" })} className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline">
                {pluralize(counts.outstanding, "outstanding statement")}
              </Link>
            }
          >
            Needs attention
          </SectionTitle>
          <Card>
            {attention.rows.length === 0 && flags.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing is waiting for review.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.rows.map((s) => (
                  <li key={s.id}>
                    <Link href={`/statements/${s.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{s.cadet.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {s.cadet.byte?.name ?? "No byte"} · received {s.lastReceivedAt ? formatRelative(s.lastReceivedAt) : "—"}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
                {flags.length > 0 && (
                  <li>
                    <Link href={batchHref("/stats", b) + "#recurring"} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <p className="flex-1 text-sm text-slate-800">
                        {pluralize(flags.length, "possible recurring issue")} flagged for review
                      </p>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="activity-h">
          <SectionTitle
            id="activity-h"
            action={
              <Link href={batchHref("/activity", b)} className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline">
                View all
              </Link>
            }
          >
            Recent activity
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
    </div>
  );
}
