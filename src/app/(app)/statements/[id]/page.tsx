import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getStatement } from "@/server/services/statements";
import { orNotFound } from "@/server/context";
import { Alert, Card, SectionTitle } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { ActivityList } from "@/components/common/activity-list";
import { AuditChanges } from "@/components/common/audit-changes";
import { StatementWorkflow } from "@/components/statements/statement-workflow";
import { dateOnlyISO, formatDateOnly, formatDateTime, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Statement" };

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await orNotFound(getStatement(id));
  const history = await prisma.auditEvent.findMany({
    where: { entityType: "Statement", entityId: s.id },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const editable = s.batch.status === "OPEN" && !s.voided;
  const latest = s.versions[0] ?? null;
  // Reviews made during a reopen with no version (edge case) are listed separately.
  const orphanReviews = s.reviews.filter((r) => !r.versionId);

  return (
    <div className="space-y-5">
      <Link href={`/cadets/${s.cadetId}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {s.cadet.name}
      </Link>

      {s.voided && (
        <Alert tone="error" title="This statement request has been voided">
          Voided by {s.voidedBy?.name ?? "—"} on {formatDateTime(s.voidedAt)}. Reason: {s.voidReason}
        </Alert>
      )}
      {s.batch.status === "ARCHIVED" && <Alert tone="warning">{s.batch.name} is archived. This statement is read-only.</Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Statement</Badge>
          {!s.voided && <StatusBadge status={s.status} className="text-sm" />}
          <span className="text-sm text-slate-500">{s.batch.name}</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          Statement from <span data-testid="statement-cadet">{s.cadet.name}</span>
        </h1>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Required for</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{s.title}</dd>
          </div>
          {s.instructions && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Instructions</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{s.instructions}</dd>
            </div>
          )}
          {s.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Instructor notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{s.notes}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cadet</dt>
            <dd className="mt-0.5">
              <Link className="text-navy-700 underline" href={`/cadets/${s.cadetId}`}>
                {s.cadet.name}
              </Link>
              <span className="text-slate-500"> · {s.cadet.byte?.name ?? "No byte"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Requested</dt>
            <dd className="mt-0.5">
              {formatDateOnly(s.requestedOn)} by {s.createdBy.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last received</dt>
            <dd className="mt-0.5">{formatDateTime(s.lastReceivedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last updated</dt>
            <dd className="mt-0.5">
              {formatDateTime(s.updatedAt)}
              {s.updatedBy && ` by ${s.updatedBy.name}`}
            </dd>
          </div>
          {s.occurrence && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Shared occurrence</dt>
              <dd className="mt-0.5">
                <Link className="text-navy-700 underline" href={`/statements?status=ALL&occurrence=${s.occurrence.id}`}>
                  {s.occurrence.title}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {editable && (
        <StatementWorkflow
          today={todayISO()}
          statement={{
            id: s.id,
            status: s.status,
            title: s.title,
            instructions: s.instructions,
            notes: s.notes,
            requestedOn: dateOnlyISO(s.requestedOn),
            latestVersion: latest?.versionNumber ?? null,
          }}
        />
      )}

      <section aria-labelledby="versions-h">
        <SectionTitle id="versions-h">Versions and feedback</SectionTitle>
        {s.versions.length === 0 ? (
          <Card className="px-3 py-6 text-center text-sm text-slate-500">No submission recorded yet.</Card>
        ) : (
          <ol className="space-y-3" data-testid="versions">
            {s.versions.map((v, i) => (
              <li key={v.id}>
                <Card className={cn("p-4", i > 0 && "bg-slate-50")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      Version {v.versionNumber}
                      {i === 0 && <span className="ml-2 text-xs font-medium text-navy-700">Current</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Received {formatDateTime(v.receivedAt)} · recorded by {v.recordedBy.name}
                    </p>
                  </div>
                  {v.content ? (
                    <details className="mt-2" open={i === 0}>
                      <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-navy-700">Statement content</summary>
                      <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">{v.content}</p>
                    </details>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No content entered (paper copy or receipt only).</p>
                  )}
                  {v.reviews.map((r) => (
                    <div key={r.id} className={cn("mt-3 rounded-lg border-l-4 px-3 py-2 text-sm", r.outcome === "ACCEPTED" ? "border-emerald-500 bg-emerald-50" : "border-amber-500 bg-amber-50")}>
                      <p className="font-medium">
                        {r.outcome === "ACCEPTED" ? "Accepted" : "Rewrite required"} · {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}
                      </p>
                      {r.feedback && <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.feedback}</p>}
                    </div>
                  ))}
                </Card>
              </li>
            ))}
          </ol>
        )}
        {orphanReviews.length > 0 && (
          <Card className="mt-3 p-4 text-sm">
            {orphanReviews.map((r) => (
              <p key={r.id}>
                {r.outcome === "ACCEPTED" ? "Accepted" : "Rewrite required"} · {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}
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
