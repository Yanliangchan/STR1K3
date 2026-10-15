"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatementStatus } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { bulkStatementAction } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { cn, pluralize, truncate } from "@/lib/utils";

export type QueueRow = {
  id: string;
  cadetName: string;
  byteName: string | null;
  title: string;
  status: StatementStatus;
  requestedOn: string;
  receivedAt: string | null;
  updatedAt: string;
  versions: number;
  voided: boolean;
};

export function StatementQueue({ rows, batchId, readOnly }: { rows: QueueRow[]; batchId: string; readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<null | "RECEIVE" | "ACCEPT">(null);
  const [ack, setAck] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectable = rows.filter((r) => !r.voided);
  const chosen = selectable.filter((r) => selected.has(r.id));
  const allSelected = selectable.length > 0 && chosen.length === selectable.length;
  const canReceive = chosen.length > 0 && chosen.every((r) => r.status === "NOT_SUBMITTED" || r.status === "REWRITE_REQUIRED");
  const canAccept = chosen.length > 0 && chosen.every((r) => r.status === "PENDING_REVIEW");

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function run() {
    if (!action) return;
    if (action === "ACCEPT" && !ack) {
      setError("Confirm that you have reviewed each statement.");
      return;
    }
    setPending(true);
    try {
      const res = await bulkStatementAction({
        batchId,
        statementIds: chosen.map((r) => r.id),
        action,
        confirmCount: chosen.length,
        feedback: action === "ACCEPT" ? feedback : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast("success", `${pluralize(res.data, "statement")} ${action === "RECEIVE" ? "marked Pending review" : "accepted"}.`);
      setAction(null);
      setSelected(new Set());
      setAck(false);
      setFeedback("");
      setError(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn(selected.size > 0 && "pb-28")}>
      {!readOnly && selectable.length > 0 && (
        <label className="mb-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
          <Checkbox
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))}
            aria-label="Select all statements shown"
          />
          Select all {selectable.length} shown
        </label>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white" data-testid="statement-queue">
        {rows.map((r) => (
          <li key={r.id} className="flex items-stretch">
            {!readOnly && (
              <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center">
                <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={r.voided} aria-label={`Select statement for ${r.cadetName}`} />
              </label>
            )}
            <Link href={`/statements/${r.id}`} className={cn("flex min-w-0 flex-1 items-center gap-2 py-3 pr-3 hover:bg-slate-50", readOnly && "pl-3")}>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{r.cadetName}</span>
                  <span className="text-sm text-slate-500">{r.byteName ?? "No byte"}</span>
                </div>
                <p className="text-sm text-slate-700">{truncate(r.title, 110)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {r.voided ? <span className="font-medium text-red-700">Voided</span> : <StatusBadge status={r.status} />}
                  <span>Requested {r.requestedOn}</span>
                  {r.receivedAt && <span>Received {r.receivedAt}</span>}
                  {r.versions > 1 && <span>v{r.versions}</span>}
                  <span>Updated {r.updatedAt}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {selected.size > 0 && !readOnly && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium text-slate-800">{pluralize(chosen.length, "statement")} selected</p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button variant="secondary" size="sm" disabled={!canReceive} onClick={() => setAction("RECEIVE")} title="Only for Not submitted / Rewrite required">
              Record receipt
            </Button>
            <Button size="sm" disabled={!canAccept} onClick={() => setAction("ACCEPT")} title="Only for Pending review">
              Accept
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={action !== null}
        onOpenChange={(o) => !o && !pending && (setAction(null), setError(null))}
        title={action === "ACCEPT" ? `Accept ${pluralize(chosen.length, "statement")}?` : `Record receipt of ${pluralize(chosen.length, "statement")}?`}
        description={
          action === "ACCEPT"
            ? "Each statement's latest version will be marked Accepted."
            : "Each statement will move to Pending review. Add content later from each statement if needed."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={action === "ACCEPT" && !ack}>
              {action === "ACCEPT" ? `Accept ${chosen.length}` : `Mark ${chosen.length} received`}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {error && <Alert tone="error">{error}</Alert>}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {chosen.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>{r.cadetName}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
          {action === "ACCEPT" && (
            <>
              <Field label="Feedback (optional, applied to all)">
                {(p) => <Textarea {...p} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
              </Field>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-amber-50 p-3 text-amber-950">
                <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                <span>I have reviewed each of these statements individually and confirm they are acceptable.</span>
              </label>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
