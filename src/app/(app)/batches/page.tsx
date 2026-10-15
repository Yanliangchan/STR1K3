import Link from "@/components/ui/link";
import { ChevronRight, FolderCog, Plus } from "lucide-react";
import { listBatches } from "@/server/services/batches";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { buttonClasses } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Batch management" };

export default async function BatchesPage() {
  const batches = await listBatches();
  const open = batches.filter((b) => b.status === "OPEN");
  const archived = batches.filter((b) => b.status === "ARCHIVED");
  const Row = ({ b }: { b: (typeof batches)[number] }) => (
    <li>
      <Link href={`/batches/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            {b.name}
            {b.isActive && <Badge tone="green">Active</Badge>}
            {b.status === "ARCHIVED" && <Badge>Archived</Badge>}
          </p>
          <p className="text-sm text-slate-500">
            {b.cadetCount} cadets · {b.bytes.length} bytes · created {formatDateTime(b.createdAt)}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader
        title="Batch management"
        description="Only one batch is active at a time. STR1K3 opens straight into it."
        actions={
          <Link href="/batches/new" className={buttonClasses("primary")}>
            <Plus className="h-4 w-4" aria-hidden /> New batch
          </Link>
        }
      />
      {batches.length === 0 ? (
        <EmptyState icon={<FolderCog className="h-10 w-10" />} title="No batches yet" action={<Link href="/batches/new" className={buttonClasses("primary")}>Create the first batch</Link>}>
          Create a batch, add its bytes and cadets, then set it as active.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <section>
            <SectionTitle>Open batches</SectionTitle>
            <Card>
              <ul className="divide-y divide-slate-100">{open.length ? open.map((b) => <Row key={b.id} b={b} />) : <li className="px-4 py-4 text-sm text-slate-500">None.</li>}</ul>
            </Card>
          </section>
          {archived.length > 0 && (
            <section>
              <SectionTitle>Archived batches</SectionTitle>
              <Card>
                <ul className="divide-y divide-slate-100">{archived.map((b) => <Row key={b.id} b={b} />)}</ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  );
}
