import Link from "@/components/ui/link";
import { ArrowUpRight, Repeat } from "lucide-react";
import type { RepeatGroup } from "@/server/services/repeats";
import { Card } from "@/components/ui/misc";
import { TypeBadge } from "@/components/ui/badges";
import { buttonClasses } from "@/components/ui/button";
import { formatDateOnly, parseISODate } from "@/lib/dates";
import { batchHref, cn, truncate } from "@/lib/utils";
import { NotSameButton } from "./not-same-button";

const CREATE_LABEL = { IPS: "Give IPS", STATEMENT: "Request statement", NOR: "Give NOR", CROW: "Give CROW" } as const;

/** Repeat offences with the suggested next step on the escalation ladder. */
export function RepeatList({
  groups,
  batchId,
  contextParam,
  showCadet = true,
  readOnly,
}: {
  groups: RepeatGroup[];
  batchId: string;
  contextParam?: string | null;
  showCadet?: boolean;
  readOnly: boolean;
}) {
  return (
    <Card>
      <ul className="divide-y divide-slate-100" data-testid="repeat-list">
        {groups.map((g) => {
          const beyond = g.suggestion.kind === "BEYOND";
          const stepUp = g.suggestion.level > Math.max(...g.entries.map((e) => ["IPS", "STATEMENT", "NOR", "CROW"].indexOf(e.kind)));
          const latest = g.entries.at(-1)!;
          return (
            <li key={g.id} className="space-y-2 px-4 py-3" data-testid="repeat-group">
              {showCadet && (
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={batchHref(`/cadets/${g.cadetId}`, contextParam ?? null)} className="font-medium text-slate-900 hover:underline">
                    {g.cadetName}
                  </Link>
                  <span className="text-xs text-slate-500">{g.byteName ?? "No byte"}</span>
                </div>
              )}
              <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-slate-700">
                <Repeat className="h-4 w-4 text-amber-600" aria-hidden />
                <span className="font-medium text-slate-900">Same offence ×{g.occurrences}</span>
                <span>· matched on {g.matchedOn.join(", ")}</span>
              </p>
              <ul className="space-y-1 border-l-2 border-slate-200 pl-3">
                {g.entries.map((e) => (
                  <li key={e.key}>
                    <Link href={e.kind === "STATEMENT" ? `/statements/${e.id}` : `/records/${e.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm hover:underline">
                      <span className="w-14 shrink-0 text-xs text-slate-500">{formatDateOnly(parseISODate(e.date)).replace(/ \d{4}$/, "")}</span>
                      <TypeBadge type={e.kind} />
                      <span className="min-w-0 text-slate-800">{truncate(e.text, 70)}</span>
                      {e.punishment && <span className="text-xs text-slate-500">— {truncate(e.punishment, 40)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className={cn("rounded-lg px-3 py-2 text-sm", stepUp ? "bg-amber-50 text-amber-950" : "bg-slate-50 text-slate-800")} data-testid="repeat-suggestion">
                <p className="flex items-center gap-1.5 font-semibold">
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  {g.suggestion.label}
                </p>
                <p className="mt-0.5">{g.suggestion.reason}</p>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {!beyond && (
                    <Link
                      href={`/records/new?type=${g.suggestion.kind}&cadets=${g.cadetId}&d=${encodeURIComponent(latest.text.slice(0, 300))}`}
                      className={buttonClasses(stepUp ? "primary" : "secondary", "sm")}
                      data-testid="repeat-create"
                    >
                      {CREATE_LABEL[g.suggestion.kind as keyof typeof CREATE_LABEL]}
                    </Link>
                  )}
                  <NotSameButton batchId={batchId} cadetId={g.cadetId} term={g.keys[0]!} entryKeys={g.entries.map((e) => e.key)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
