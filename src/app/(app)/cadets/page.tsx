import { resolveBatchContext } from "@/server/context";
import { listRoster, ROSTER_FILTERS, type RosterFilter } from "@/server/services/cadets";
import { listBytes } from "@/server/services/bytes";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { PageHeader } from "@/components/ui/misc";
import { RosterView } from "@/components/cadets/roster-view";

export const metadata = { title: "Cadets" };

type SP = { b?: string; q?: string; byte?: string; filter?: string; inactive?: string };

export default async function CadetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await resolveBatchContext(sp.b);
  if (!ctx) return <NoActiveBatch />;
  const filter = (ROSTER_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as RosterFilter) : undefined;
  const [rows, bytes] = await Promise.all([
    listRoster(ctx.batch.id, { q: sp.q, byteId: sp.byte, filter, includeInactive: sp.inactive === "1" }),
    listBytes(ctx.batch.id),
  ]);
  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader title="Cadets" description={`${ctx.batch.name} roster`} />
      <RosterView rows={rows} bytes={bytes} batchId={ctx.batch.id} contextParam={ctx.contextParam} readOnly={ctx.readOnly} />
    </>
  );
}
