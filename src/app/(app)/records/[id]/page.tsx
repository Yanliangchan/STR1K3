import Link from "@/components/ui/link";
import { BackLink } from "@/components/common/back-link";
import { prisma } from "@/lib/db";
import { getAppConfig } from "@/server/services/config";
import { getRecord } from "@/server/services/records";
import { listCategories } from "@/server/services/categories";
import { orNotFound } from "@/server/context";
import { Alert, Card, SectionTitle } from "@/components/ui/misc";
import { Badge, TypeBadge } from "@/components/ui/badges";
import { ActivityList } from "@/components/common/activity-list";
import { RecordActions } from "@/components/records/record-actions";
import { dateOnlyISO, formatDateOnly, formatDateTime } from "@/lib/dates";
import { AuditChanges } from "@/components/common/audit-changes";

export const metadata = { title: "Record" };

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await orNotFound(getRecord(id));
  const [categories, history] = await Promise.all([
    listCategories({ type: rec.type, includeInactive: true }),
    prisma.auditEvent.findMany({
      where: { entityType: "Record", entityId: rec.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const editable = rec.batch.status === "OPEN" && rec.status === "ACTIVE";
  const cfg = await getAppConfig();
  const bParam = cfg?.activeBatchId === rec.batchId ? "" : `&b=${rec.batchId}`;

  return (
    <div className="space-y-5">
      <BackLink href={`/cadets/${rec.cadetId}`}>
        {rec.cadet.name}
      </BackLink>

      {rec.status === "VOIDED" && (
        <Alert tone="error" title="This record has been voided">
          Voided by {rec.voidedBy?.name ?? "—"} on {formatDateTime(rec.voidedAt)}. Reason: {rec.voidReason}
        </Alert>
      )}
      {rec.batch.status === "ARCHIVED" && <Alert tone="warning">{rec.batch.name} is archived. This record is read-only.</Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={rec.type} />
          {rec.status === "VOIDED" && <Badge tone="red">Voided</Badge>}
          <span className="text-sm text-slate-500">{rec.batch.name}</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          {rec.type} for {rec.cadet.name}
        </h1>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Item label="Cadet">
            <Link href={`/cadets/${rec.cadetId}`} className="text-navy-700 underline">
              {rec.cadet.name}
            </Link>
            {rec.cadet.byte && <span className="text-slate-500"> · {rec.cadet.byte.name}</span>}
          </Item>
          <Item label="Date of occurrence">
            {formatDateOnly(rec.occurredOn)}
            {rec.occurredTime && ` at ${rec.occurredTime}`}
          </Item>
          <Item label="Category">{rec.category?.name ?? "Uncategorised"}</Item>
          <Item label="Reference">{rec.referenceNo ?? "—"}</Item>
          <Item label="Description" wide>
            <p className="whitespace-pre-wrap">{rec.description}</p>
          </Item>
          {rec.notes && (
            <Item label="Instructor notes" wide>
              <p className="whitespace-pre-wrap">{rec.notes}</p>
            </Item>
          )}
          {rec.occurrence && (
            <Item label="Shared occurrence" wide>
              <Link href={`/records?occurrence=${rec.occurrence.id}${bParam}`} className="text-navy-700 underline">
                {rec.occurrence.title}
              </Link>
            </Item>
          )}
          <Item label="Created">
            {rec.createdBy.name} · {formatDateTime(rec.createdAt)}
          </Item>
          <Item label="Last updated">
            {rec.updatedBy?.name ?? rec.createdBy.name} · {formatDateTime(rec.updatedAt)}
          </Item>
        </dl>
        {editable && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <RecordActions
              rec={{
                id: rec.id,
                type: rec.type,
                date: dateOnlyISO(rec.occurredOn),
                time: rec.occurredTime,
                categoryId: rec.categoryId,
                description: rec.description,
                notes: rec.notes,
                referenceNo: rec.referenceNo,
                updatedAt: rec.updatedAt.toISOString(),
              }}
              categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
            />
          </div>
        )}
      </Card>

      <section>
        <SectionTitle>History</SectionTitle>
        <Card>
          <ActivityList events={history} relative={false} showReason />
          <AuditChanges events={history} />
        </Card>
      </section>
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}
