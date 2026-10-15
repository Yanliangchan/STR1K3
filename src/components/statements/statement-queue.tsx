"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatementStatus } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { bulkStatementAction, reviewStatementAction } from "@/app/actions/data";
import { StatementQuickActions } from "./statement-quick-actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { OverdueBadge, StatusBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { DeadlineInput } from "./deadline-input";
import { cn, pluralize, truncate } from "@/lib/utils";
import type { ActionResult } from "@/server/action";

export type QueueRow = {
  id: string;
  cadetName: string;
  byteName: string | null;
  title: string;
  status: StatementStatus;
  issuedOn: string;
  dueLabel: string;
  dueRelative: string;
  overdue: boolean;
  receivedAt: string | null;
  lastLate: boolean;
  versions: number;
  voided: boolean;
};

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type BulkAction = "RECEIVE" | "ACCEPT" | "REWRITE";
type RewriteTarget = { ids: string[]; names: string[] } | null;

export function StatementQueue({ rows, batchId, readOnly, today }: { rows: QueueRow[]; batchId: string; readOnly: boolean; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | Exclude<BulkAction, "REWRITE">>(null);
  const [rewrite, setRewrite] = useState<RewriteTarget>(null);
  const [deadline, setDeadline] = useState({ date: addDays(today, 1), time: "23:59" });
  const [feedback, setFeedback] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const selectable = rows.filter((r) => !r.voided);
  const chosen = selectable.filter((r) => selected.has(r.id));
  const allSelected = selectable.length > 0 && chosen.length === selectable.length;
  const canReceive = chosen.length > 0 && chosen.every((r) => r.status === "NOT_SUBMITTED" || r.status === "REWRITE_REQUIRED");
  const canReview = chosen.length > 0 && chosen.every((r) => r.status === "PENDING_REVIEW");

  async function run(key: string, fn: () => Promise<ActionResult<unknown>>, ok: string) {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        if (!rewrite && !bulk) toast("error", res.error);
        return false;
      }
      toast("success", ok);
      router.refresh();
      return true;
    } catch {
      const msg = "Could not reach the server. Nothing was changed.";
      setError(msg);
      toast("error", msg);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function openRewrite(target: NonNullable<RewriteTarget>) {
    setDeadline({ date: addDays(today, 1), time: "23:59" });
    setFeedback("");
    setError(null);
    setRewrite(target);
  }

  async function confirmRewrite() {
    if (!rewrite) return;
    const ok =
      rewrite.ids.length === 1 && !selected.size
        ? await run(
            "rewrite",
            () => reviewStatementAction({ statementId: rewrite.ids[0]!, outcome: "REWRITE_REQUIRED", feedback, newDueDate: deadline.date, newDueTime: deadline.time }),
            `Rewrite required from ${rewrite.names[0]}.`,
          )
        : await run(
            "rewrite",
            () =>
              bulkStatementAction({
                batchId,
                statementIds: rewrite.ids,
                action: "REWRITE",
                confirmCount: rewrite.ids.length,
                feedback,
                newDueDate: deadline.date,
                newDueTime: deadline.time,
              }),
            `Rewrite required from ${pluralize(rewrite.ids.length, "cadet")}.`,
          );
    if (ok) {
      setRewrite(null);
      setSelected(new Set());
    }
  }

  async function confirmBulk() {
    if (!bulk) return;
    if (bulk === "ACCEPT" && !ack) {
      setError("Confirm that you have reviewed each statement.");
      return;
    }
    const ok = await run(
      "bulk",
      () => bulkStatementAction({ batchId, statementIds: chosen.map((r) => r.id), action: bulk, confirmCount: chosen.length }),
      `${pluralize(chosen.length, "statement")} ${bulk === "RECEIVE" ? "marked handed in" : "accepted"}.`,
    );
    if (ok) {
      setBulk(null);
      setSelected(new Set());
      setAck(false);
    }
  }

  return (
    <div className={cn(selected.size > 0 && "pb-28")}>
      {!readOnly && selectable.length > 1 && (
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
          <li key={r.id} className={cn("flex items-stretch", r.overdue && "bg-red-50/40")}>
            {!readOnly && (
              <label className="flex w-12 shrink-0 cursor-pointer items-start justify-center pt-4">
                <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={r.voided} aria-label={`Select statement for ${r.cadetName}`} />
              </label>
            )}
            <div className={cn("min-w-0 flex-1 py-3 pr-3", readOnly && "pl-3")}>
              <Link href={`/statements/${r.id}`} className="group flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-900 group-hover:underline">{r.cadetName}</span>
                    <span className="text-sm text-slate-500">{r.byteName ?? "No byte"}</span>
                  </div>
                  <p className="text-sm text-slate-700">{truncate(r.title, 90)}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    {r.voided ? <span className="font-medium text-red-700">Voided</span> : <StatusBadge status={r.status} />}
                    {r.overdue && <OverdueBadge />}
                    {!r.voided && (r.status === "NOT_SUBMITTED" || r.status === "REWRITE_REQUIRED") && (
                      <span className={cn(r.overdue ? "font-semibold text-red-800" : "font-medium text-slate-700")}>
                        Due {r.dueLabel} · {r.dueRelative}
                      </span>
                    )}
                    {r.status === "PENDING_REVIEW" && r.receivedAt && (
                      <span>
                        Handed in {r.receivedAt}
                        {r.lastLate && <span className="font-medium text-red-800"> (late)</span>}
                      </span>
                    )}
                    {r.versions > 1 && <span>Rewrite {r.versions - 1}</span>}
                  </div>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
              {!readOnly && !r.voided && r.status !== "ACCEPTED" && (
                <div className="mt-2">
                  <StatementQuickActions id={r.id} status={r.status} versions={r.versions} cadetName={r.cadetName} today={today} />
                </div>
              )}
            </div>
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
            {canReceive && (
              <Button variant="secondary" size="sm" onClick={() => (setError(null), setBulk("RECEIVE"))}>
                Handed in
              </Button>
            )}
            {canReview && (
              <>
                <Button variant="outline" size="sm" onClick={() => openRewrite({ ids: chosen.map((r) => r.id), names: chosen.map((r) => r.cadetName) })}>
                  Rewrite
                </Button>
                <Button size="sm" onClick={() => (setError(null), setBulk("ACCEPT"))}>
                  Accept
                </Button>
              </>
            )}
            {!canReceive && !canReview && <span className="text-xs text-slate-500">Select statements with the same status to act on them together.</span>}
          </div>
        </div>
      )}

      <Dialog
        open={rewrite !== null}
        onOpenChange={(o) => !o && !busy && setRewrite(null)}
        title={rewrite && rewrite.ids.length === 1 ? `Rewrite required — ${rewrite.names[0]}` : `Rewrite required — ${pluralize(rewrite?.ids.length ?? 0, "cadet")}`}
        description="Set the new deadline for the rewritten statement."
        footer={
          <>
            <Button variant="outline" onClick={() => setRewrite(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button onClick={confirmRewrite} loading={busy === "rewrite"} data-testid="confirm-rewrite">
              Require rewrite
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <DeadlineInput label="New deadline" today={today} min={today} date={deadline.date} time={deadline.time} onChange={setDeadline} />
          <Field label="Feedback" hint="Optional — e.g. “No timings given”.">
            {(p) => <Input {...p} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} />}
          </Field>
          {rewrite && rewrite.ids.length > 1 && <p className="text-sm text-slate-600">{rewrite.names.join(", ")}</p>}
        </div>
      </Dialog>

      <Dialog
        open={bulk !== null}
        onOpenChange={(o) => !o && !busy && setBulk(null)}
        title={bulk === "ACCEPT" ? `Accept ${pluralize(chosen.length, "statement")}?` : `Mark ${pluralize(chosen.length, "statement")} as handed in?`}
        description={bulk === "ACCEPT" ? "Each latest submission will be marked Accepted." : "Each will move to Pending review, timed now."}
        footer={
          <>
            <Button variant="outline" onClick={() => setBulk(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button onClick={confirmBulk} loading={busy === "bulk"} disabled={bulk === "ACCEPT" && !ack}>
              {bulk === "ACCEPT" ? `Accept ${chosen.length}` : `Mark ${chosen.length} handed in`}
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
          {bulk === "ACCEPT" && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-amber-50 p-3 text-amber-950">
              <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span>I have reviewed each of these statements individually and confirm they are acceptable.</span>
            </label>
          )}
        </div>
      </Dialog>
    </div>
  );
}
