import type { Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/dates";

type E = { id: string; action: string; createdAt: Date; changes: Prisma.JsonValue; actor: { name: string } | null };

const LABELS: Record<string, string> = {
  date: "Date",
  time: "Time",
  category: "Category",
  description: "Description",
  notes: "Notes",
  referenceNo: "Reference",
  title: "Description",
  instructions: "Instructions",
  requestedOn: "Date requested",
};

/** Shows before/after values for correction events (field-level audit detail). */
export function AuditChanges({ events }: { events: E[] }) {
  const corrections = events.filter((e) => e.action.endsWith(".corrected") && e.changes && typeof e.changes === "object");
  if (!corrections.length) return null;
  return (
    <details className="border-t border-slate-100 px-3 py-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-slate-700">Show previous values</summary>
      <ul className="space-y-3 pb-2">
        {corrections.map((e) => (
          <li key={e.id}>
            <p className="text-xs text-slate-500">
              {e.actor?.name ?? "System"} · {formatDateTime(e.createdAt)}
            </p>
            <dl className="mt-1 space-y-1">
              {Object.entries(e.changes as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => (
                <div key={k} className="rounded bg-slate-50 px-2 py-1">
                  <dt className="text-xs font-medium text-slate-600">{LABELS[k] ?? k}</dt>
                  <dd className="text-slate-700">
                    <span className="line-through decoration-slate-400">{String(v?.from ?? "—")}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span>{String(v?.to ?? "—")}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}
