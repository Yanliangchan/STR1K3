import Link from "@/components/ui/link";
import {
  CheckCircle2,
  ClipboardPlus,
  FilePen,
  FileText,
  FolderCog,
  History,
  PenLine,
  Ban,
  UserPlus,
  Clock3,
} from "lucide-react";
import { formatDateTime, formatRelative } from "@/lib/dates";

type Event = {
  id: string;
  action: string;
  summary: string;
  entityType: string;
  entityId: string | null;
  cadetId: string | null;
  createdAt: Date;
  reason?: string | null;
  actor: { name: string } | null;
};

function iconFor(action: string) {
  if (action.endsWith(".accepted") || action === "statement.bulk_accept") return CheckCircle2;
  if (action.endsWith("rewrite_requested") || action.endsWith("bulk_rewrite")) return PenLine;
  if (action.endsWith(".received") || action.endsWith(".resubmitted") || action.endsWith("bulk_receive")) return Clock3;
  if (action.endsWith(".voided")) return Ban;
  if (action.endsWith(".corrected") || action.endsWith(".updated")) return FilePen;
  if (action.startsWith("statement.")) return FileText;
  if (action.startsWith("record.") || action === "bulk.created") return ClipboardPlus;
  if (action.startsWith("cadet.") || action === "roster.imported") return UserPlus;
  if (action.startsWith("batch.")) return FolderCog;
  return History;
}

export function hrefForEvent(e: Pick<Event, "entityType" | "entityId" | "cadetId">) {
  if (e.entityType === "Record" && e.entityId) return `/records/${e.entityId}`;
  if (e.entityType === "Statement" && e.entityId) return `/statements/${e.entityId}`;
  if (e.entityType === "Cadet" && e.entityId) return `/cadets/${e.entityId}`;
  if (e.entityType === "Batch" && e.entityId) return `/batches/${e.entityId}`;
  return null;
}

export function ActivityList({ events, relative = true, showReason = false }: { events: Event[]; relative?: boolean; showReason?: boolean }) {
  return (
    <ol className="divide-y divide-slate-100">
      {events.map((e) => {
        const Icon = iconFor(e.action);
        const href = hrefForEvent(e);
        const body = (
          <>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800">{e.summary}</p>
              {showReason && e.reason && <p className="mt-0.5 text-sm text-slate-600">Reason: {e.reason}</p>}
              <p className="mt-0.5 text-xs text-slate-500">
                {e.actor?.name ?? "System"} ·{" "}
                <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)}>
                  {relative ? formatRelative(e.createdAt) : formatDateTime(e.createdAt)}
                </time>
              </p>
            </div>
          </>
        );
        return (
          <li key={e.id}>
            {href ? (
              <Link href={href} className="flex gap-3 px-3 py-3 hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3 px-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
