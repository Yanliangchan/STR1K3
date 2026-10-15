import Link from "next/link";
import { BackLink } from "@/components/common/back-link";
import { prisma } from "@/lib/db";
import { getStatement } from "@/server/services/statements";
import { orNotFound } from "@/server/context";
import { Alert, Card, SectionTitle } from "@/components/ui/misc";
import { Badge, OverdueBadge, StatusBadge } from "@/components/ui/badges";
import { ActivityList } from "@/components/common/activity-list";
import { AuditChanges } from "@/components/common/audit-changes";
import { StatementWorkflow } from "@/components/statements/statement-workflow";
import { dateOnlyISO, dueRelative, formatDateOnly, formatDateTime, formatDeadline, todayISO, toISODateInTz, toTimeInTz } from "@/lib/dates";
import { awaitingCadet, isOverdue } from "@/lib/statement-utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Statement" };

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await orNotFound(getStatement(id));
  const history = await prisma.auditEvent.findMany({
    where: { entityType: "Statement", entityId: s.id },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const editable = s.batch.status === "OPEN" && !s.voided;
  const latest = s.versions.find((v) => !v.retractedAt) ?? null;
  const overdue = isOverdue(s);
  const now = new Date();
  const orphanReviews = s.reviews.filter((r) => !r.versionId);

  return (
    <div className="space-y-5">
      <BackLink href={`/cadets/${s.cadetId}`}>
        {s.cadet.name}
      </BackLink>

      {s.voided && (
        <Alert tone="error" title="This statement has been voided">
          Voided by {s.voidedBy?.name ?? "—"} on {formatDateTime(s.voidedAt)}. Reason: {s.voidReason}
        </Alert>
      )}
      {s.batch.status === "ARCHIVED" && <Alert tone="warning">{s.batch.name} is archived. This statement is read-only.</Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Statement</Badge>
          {!s.voided && <StatusBadge status={s.status} className="text-sm" />}
          {overdue && <OverdueBadge />}
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          <span data-testid="statement-cadet">{s.cadet.name}</span>
          <span className="font-normal text-slate-500"> · {s.cadet.byte?.name ?? "No byte"}</span>
        </h1>
        <p className="mt-1 text-slate-800">{s.title}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Deadline">
            <span className={cn(overdue && "font-semibold text-red-800")}>{formatDeadline(s.dueAt)}</span>
            {!s.voided && awaitingCadet(s.status) && <span className="text-slate-500"> · {dueRelative(s.dueAt, now)}</span>}
          </Item>
          <Item label="Issued">
            {formatDateOnly(s.issuedOn)} by {s.createdBy.name}
          </Item>
          <Item label="Last handed in">{s.lastReceivedAt ? formatDateTime(s.lastReceivedAt) : "Not yet"}</Item>
          <Item label="Last updated">
            {formatDateTime(s.updatedAt)}
            {s.updatedBy && ` by ${s.updatedBy.name}`}
          </Item>
          {s.notes && (
            <Item label="Instructor notes" wide>
              <p className="whitespace-pre-wrap">{s.notes}</p>
            </Item>
          )}
          {s.occurrence && (
            <Item label="Shared occurrence" wide>
              <Link className="text-navy-700 underline" href={`/statements?status=ALL&occurrence=${s.occurrence.id}`}>
                {s.occurrence.title}
              </Link>
            </Item>
          )}
        </dl>
      </Card>

      {editable && (
        <StatementWorkflow
          today={todayISO()}
          nowTime={toTimeInTz(now)}
          statement={{
            id: s.id,
            status: s.status,
            title: s.title,
            notes: s.notes,
            issuedOn: dateOnlyISO(s.issuedOn),
            dueDate: toISODateInTz(s.dueAt),
            dueTime: toTimeInTz(s.dueAt),
            dueLabel: formatDeadline(s.dueAt),
            dueRelative: dueRelative(s.dueAt, now),
            overdue,
            latestVersion: latest?.versionNumber ?? null,
          }}
        />
      )}

      <section aria-labelledby="versions-h">
        <SectionTitle id="versions-h">Submissions and reviews</SectionTitle>
        {s.versions.length === 0 ? (
          <Card className="px-3 py-6 text-center text-sm text-slate-500">Nothing handed in yet.</Card>
        ) : (
          <ol className="space-y-3" data-testid="versions">
            {s.versions.map((v, i) => {
              const late = v.dueAt ? v.receivedAt > v.dueAt : false;
              const activeIdx = s.versions.filter((x) => !x.retractedAt).findIndex((x) => x.id === v.id);
              const label = v.retractedAt ? "Hand-in recorded in error" : activeIdx === s.versions.filter((x) => !x.retractedAt).length - 1 ? "Original statement" : `Rewrite ${s.versions.filter((x) => !x.retractedAt).length - 1 - activeIdx}`;
              return (
                <li key={v.id}>
                  <Card className={cn("p-4", (i > 0 || v.retractedAt) && "bg-slate-50", v.retractedAt && "opacity-70")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("font-semibold text-slate-900", v.retractedAt && "line-through")}>{label}</p>
                      {v.retractedAt ? <Badge>Undone</Badge> : v.dueAt && (late ? <Badge tone="red">Late</Badge> : <Badge tone="green">On time</Badge>)}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Handed in {formatDateTime(v.receivedAt)}
                      {v.dueAt && <> · deadline {formatDeadline(v.dueAt)}</>} · recorded by {v.recordedBy.name}
                    </p>
                    {v.reviews.map((r) => (
                      <div key={r.id} className={cn("mt-3 rounded-lg border-l-4 px-3 py-2 text-sm", r.retractedAt ? "border-slate-300 bg-slate-100 opacity-70" : r.outcome === "ACCEPTED" ? "border-emerald-500 bg-emerald-50" : "border-amber-500 bg-amber-50")}>
                        <p className={cn("font-medium", r.retractedAt && "line-through")}>
                          {r.outcome === "ACCEPTED" ? "Accepted" : "Rewrite required"} · {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}
                        </p>
                        {r.retractedAt && <p className="text-xs text-slate-600">Undone {formatDateTime(r.retractedAt)}</p>}
                        {r.newDueAt && <p className="mt-0.5 text-slate-800">New deadline {formatDeadline(r.newDueAt)}</p>}
                        {r.feedback && <p className="mt-0.5 whitespace-pre-wrap text-slate-800">Feedback: {r.feedback}</p>}
                      </div>
                    ))}
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
        {orphanReviews.length > 0 && (
          <Card className="mt-3 p-4 text-sm">
            {orphanReviews.map((r) => (
              <p key={r.id}>
                {r.outcome === "ACCEPTED" ? "Accepted" : "Rewrite required"} · {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}
                {r.newDueAt && ` · new deadline ${formatDeadline(r.newDueAt)}`}
                {r.feedback && ` — ${r.feedback}`}
              </p>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Status history</SectionTitle>
        <Card>
          <ActivityList events={history} relative={false} showReason />
          <AuditChanges events={history} />
        </Card>
      </section>
    </div>
  );
}
