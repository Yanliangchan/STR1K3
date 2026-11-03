import Link from "@/components/ui/link";
import { resolveBatchContext } from "@/server/context";
import { repeatOffences } from "@/server/services/repeats";
import { NoActiveBatch } from "@/components/common/no-active-batch";
import { BatchBanner } from "@/components/common/batch-banner";
import { Card, PageHeader } from "@/components/ui/misc";
import { RepeatList } from "@/components/repeats/repeat-list";

export const metadata = { title: "Repeat offences" };

export default async function RepeatsPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const ctx = await resolveBatchContext((await searchParams).b);
  if (!ctx) return <NoActiveBatch />;
  const { groups, repeats } = await repeatOffences(ctx.batch.id);
  return (
    <>
      <BatchBanner ctx={ctx} />
      <PageHeader
        title={`Repeat offences (${groups.length})`}
        description={`Cadets who did the same thing more than once, matched on the words recorded. ${repeats} at one level suggests the next: IPS → Statement → NOR → CROW → beyond CROW. Suggestions only — use your judgement.`}
      />
      <p className="mb-3 text-sm text-slate-600">
        Wrong match? Use <strong>Not the same offence</strong>, or teach the matcher in{" "}
        <Link href="/settings#matching" className="underline">
          Settings
        </Link>{" "}
        (words to ignore, words that mean the same).
      </p>
      {groups.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-slate-600">No cadet has repeated an offence.</Card>
      ) : (
        <RepeatList groups={groups} batchId={ctx.batch.id} contextParam={ctx.contextParam} readOnly={ctx.readOnly} />
      )}
    </>
  );
}
