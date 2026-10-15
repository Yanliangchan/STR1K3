import Link from "next/link";
import type { StatementStatus } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { Badge, OverdueBadge, StatusBadge, TypeBadge } from "@/components/ui/badges";
import { awaitingCadet, isOverdue } from "@/lib/statement-utils";
import { formatDateOnly, formatDateTime, formatDeadline } from "@/lib/dates";
import { truncate } from "@/lib/utils";

export type HistoryEntry = {
  kind: "NOR" | "CROW" | "STATEMENT";
  id: string;
  date: Date;
  category: string | null;
  description: string;
  status: StatementStatus | null;
  /** Statements only: current deadline. */
  dueAt?: Date;
  voided: boolean;
  createdBy: string;
  updatedAt: Date;
  cadetName?: string;
  byteName?: string | null;
};

export function HistoryItem({ e, showCadet = false }: { e: HistoryEntry; showCadet?: boolean }) {
  const href = e.kind === "STATEMENT" ? `/statements/${e.id}` : `/records/${e.id}`;
  return (
    <Link href={href} className="flex items-start gap-3 px-3 py-3 hover:bg-slate-50">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={e.kind} />
          <span className="text-sm font-medium text-slate-800">{formatDateOnly(e.date)}</span>
          {e.category && <span className="text-sm text-slate-600">· {e.category}</span>}
          {e.voided && <Badge tone="red">Voided</Badge>}
          {e.status && !e.voided && <StatusBadge status={e.status} />}
          {e.status && e.dueAt && isOverdue({ status: e.status, voided: e.voided, dueAt: e.dueAt }) && <OverdueBadge />}
        </div>
        {showCadet && (
          <p className="text-sm font-medium text-slate-900">
            {e.cadetName}
            {e.byteName && <span className="font-normal text-slate-500"> · {e.byteName}</span>}
          </p>
        )}
        <p className={e.voided ? "text-sm text-slate-500 line-through" : "text-sm text-slate-700"}>{truncate(e.description, 160)}</p>
        {e.status && e.dueAt && !e.voided && awaitingCadet(e.status) && (
          <p className="text-xs font-medium text-slate-700">Deadline {formatDeadline(e.dueAt)}</p>
        )}
        <p className="text-xs text-slate-500">
          By {e.createdBy} · updated {formatDateTime(e.updatedAt)}
        </p>
      </div>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}
