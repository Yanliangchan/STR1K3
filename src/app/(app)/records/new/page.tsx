import { resolveBatchContext } from "@/server/context";
import { listRoster } from "@/server/services/cadets";
import { listCategories } from "@/server/services/categories";
import { listOccurrences } from "@/server/services/records";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { Alert, PageHeader } from "@/components/ui/misc";
import { EntryForm } from "@/components/records/entry-form";
import { dateOnlyISO, todayISO } from "@/lib/dates";

export const metadata = { title: "New record" };

export default async function NewRecordPage({ searchParams }: { searchParams: Promise<{ type?: string; cadets?: string }> }) {
  const sp = await searchParams;
  // Records are always created in the active batch.
  const ctx = await resolveBatchContext(null);
  if (!ctx) return <NoActiveBatch />;
  if (ctx.readOnly) return <Alert tone="warning">The active batch is archived and read-only.</Alert>;
  const [roster, categories, occurrences] = await Promise.all([
    listRoster(ctx.batch.id),
    listCategories(),
    listOccurrences(ctx.batch.id),
  ]);
  const kind = sp.type === "CROW" || sp.type === "STATEMENT" ? sp.type : "NOR";
  const rosterIds = new Set(roster.map((r) => r.id));
  const requested = (sp.cadets ?? "").split(",").filter(Boolean);
  const initialCadetIds = requested.filter((id) => rosterIds.has(id));
  const dropped = requested.length - initialCadetIds.length;
  return (
    <>
      <PageHeader title="New record" description={`Creating in ${ctx.batch.name}`} />
      {dropped > 0 && (
        <Alert tone="warning" className="mb-4">
          {dropped} selected cadet{dropped === 1 ? " is" : "s are"} not on the active roster and {dropped === 1 ? "was" : "were"} left out.
        </Alert>
      )}
      <EntryForm
        batch={{ id: ctx.batch.id, name: ctx.batch.name }}
        roster={roster.map((r) => ({ id: r.id, name: r.name, byteName: r.byteName }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, recordType: c.recordType }))}
        occurrences={occurrences.map((o) => ({
          id: o.id,
          title: o.title,
          date: o.occurredOn ? dateOnlyISO(o.occurredOn) : null,
          count: o._count.records + o._count.statements,
        }))}
        initialKind={kind}
        initialCadetIds={initialCadetIds}
        fromParams={!!sp.cadets || !!sp.type}
        today={todayISO()}
      />
    </>
  );
}
