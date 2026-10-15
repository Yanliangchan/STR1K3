"use client";

import { useState } from "react";
import type { StatementStatus } from "@prisma/client";
import { AlarmClock, Ban, CheckCircle2, Inbox, PenLine, Pencil, RotateCcw } from "lucide-react";
import {
  recordReceiptAction,
  reopenStatementAction,
  reviewStatementAction,
  updateStatementDetailsAction,
  voidStatementAction,
} from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/common/reason-dialog";
import { DeadlineInput } from "./deadline-input";
import type { ActionResult } from "@/server/action";
import type { UndoRef } from "@/server/services/statements";
import { useUndoToast } from "./use-undoable";
import { cn } from "@/lib/utils";

export type WorkflowStatement = {
  id: string;
  status: StatementStatus;
  title: string;
  notes: string | null;
  issuedOn: string;
  dueDate: string;
  dueTime: string;
  dueLabel: string;
  dueRelative: string;
  overdue: boolean;
  latestVersion: number | null;
};

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function StatementWorkflow({ statement: s, today, nowTime }: { statement: WorkflowStatement; today: string; nowTime: string }) {
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState(false);
  const [received, setReceived] = useState({ date: today, time: nowTime });
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [deadline, setDeadline] = useState({ date: addDays(today, 1), time: "23:59" });
  const [feedback, setFeedback] = useState("");

  const undoToast = useUndoToast();
  async function run(key: string, fn: () => Promise<ActionResult<{ undo?: UndoRef } | unknown>>, ok: string) {
    if (pending) return;
    setPending(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      setErrors({});
      setFeedback("");
      setRewriteOpen(false);
      setCustomTime(false);
      undoToast(ok, s.id, (res.data as { undo?: UndoRef } | undefined)?.undo);
    } catch {
      setError("Could not reach the server. The statement keeps its previous status.");
    } finally {
      setPending(null);
    }
  }

  const waiting = s.status === "NOT_SUBMITTED" || s.status === "REWRITE_REQUIRED";

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {waiting && (
        <Card className={cn("space-y-3 p-4", s.overdue && "border-red-300")}>
          <div className="flex items-start gap-3">
            <AlarmClock className={cn("mt-0.5 h-5 w-5 shrink-0", s.overdue ? "text-red-700" : "text-navy-600")} aria-hidden />
            <div>
              <h2 className="font-semibold text-slate-900">
                {s.status === "REWRITE_REQUIRED" ? "Waiting for rewrite" : "Waiting for hand-in"}
              </h2>
              <p className={cn("text-sm", s.overdue ? "font-medium text-red-800" : "text-slate-600")}>
                Deadline {s.dueLabel} · {s.dueRelative}
              </p>
            </div>
          </div>
          {customTime ? (
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <Field label="Date handed in" error={errors.receivedOn}>
                {(p) => <Input {...p} type="date" value={received.date} max={today} onChange={(e) => setReceived({ ...received, date: e.target.value })} />}
              </Field>
              <Field label="Time" error={errors.receivedTime}>
                {(p) => <Input {...p} type="time" value={received.time} onChange={(e) => setReceived({ ...received, time: e.target.value })} />}
              </Field>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              onClick={() =>
                run(
                  "receive",
                  () =>
                    recordReceiptAction({
                      statementId: s.id,
                      expectedStatus: s.status,
                      ...(customTime ? { receivedOn: received.date, receivedTime: received.time } : {}),
                    }),
                  "Marked as handed in — now Pending review.",
                )
              }
              loading={pending === "receive"}
              data-testid="record-receipt"
            >
              <Inbox className="h-4 w-4" aria-hidden />
              {customTime ? "Record hand-in" : "Mark handed in now"}
            </Button>
            <button type="button" className="min-h-11 px-2 text-sm text-navy-700 underline" onClick={() => setCustomTime((v) => !v)}>
              {customTime ? "Use current time" : "Handed in earlier?"}
            </button>
          </div>
        </Card>
      )}

      {s.status === "PENDING_REVIEW" && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold text-slate-900">Review submission {s.latestVersion}</h2>
          {!rewriteOpen ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={() => setRewriteOpen(true)} data-testid="request-rewrite">
                <PenLine className="h-4 w-4" aria-hidden /> Rewrite
              </Button>
              <Button
                size="lg"
                onClick={() =>
                  run(
                    "accept",
                    () => reviewStatementAction({ statementId: s.id, outcome: "ACCEPTED", expectedVersion: s.latestVersion ?? undefined }),
                    "Statement accepted.",
                  )
                }
                loading={pending === "accept"}
                data-testid="accept-statement"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Accept
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
              <DeadlineInput label="New deadline" today={today} min={today} date={deadline.date} time={deadline.time} onChange={setDeadline} error={errors.newDueDate} />
              <Field label="Feedback" hint="Optional — e.g. “No timings given”." error={errors.feedback}>
                {(p) => <Input {...p} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} />}
              </Field>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setRewriteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    run(
                      "rewrite",
                      () =>
                        reviewStatementAction({
                          statementId: s.id,
                          outcome: "REWRITE_REQUIRED",
                          feedback,
                          newDueDate: deadline.date,
                          newDueTime: deadline.time,
                          expectedVersion: s.latestVersion ?? undefined,
                        }),
                      "Rewrite required — new deadline set.",
                    )
                  }
                  loading={pending === "rewrite"}
                  data-testid="confirm-rewrite"
                >
                  Require rewrite
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {s.status === "ACCEPTED" && <ReopenDialog statementId={s.id} today={today} />}
        <EditDetailsDialog s={s} today={today} />
        <ReasonDialog
          trigger={
            <Button variant="ghost" className="text-red-700 hover:bg-red-50">
              <Ban className="h-4 w-4" aria-hidden /> Void
            </Button>
          }
          title="Void this statement?"
          description="Use this if it was created in error. It is kept for the audit trail but excluded from counts."
          confirmLabel="Void statement"
          confirmVariant="danger"
          successMessage="Statement voided."
          onConfirm={(reason) => voidStatementAction({ statementId: s.id, reason })}
        />
      </div>
    </div>
  );
}

function ReopenDialog({ statementId, today }: { statementId: string; today: string }) {
  const [to, setTo] = useState<"PENDING_REVIEW" | "REWRITE_REQUIRED">("PENDING_REVIEW");
  const [feedback, setFeedback] = useState("");
  const [deadline, setDeadline] = useState({ date: addDays(today, 1), time: "23:59" });
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline">
          <RotateCcw className="h-4 w-4" aria-hidden /> Reopen
        </Button>
      }
      title="Reopen accepted statement"
      description="Reopening is recorded in the audit history with your reason."
      confirmLabel="Reopen"
      successMessage="Statement reopened."
      reasonLabel="Reason for reopening"
      onConfirm={(reason) => reopenStatementAction({ statementId, to, reason, feedback, newDueDate: deadline.date, newDueTime: deadline.time })}
    >
      <Field label="Move to">
        {(p) => (
          <Select {...p} value={to} onChange={(e) => setTo(e.target.value as typeof to)}>
            <option value="PENDING_REVIEW">Pending review (review again)</option>
            <option value="REWRITE_REQUIRED">Rewrite required</option>
          </Select>
        )}
      </Field>
      {to === "REWRITE_REQUIRED" && (
        <>
          <DeadlineInput label="New deadline" today={today} min={today} date={deadline.date} time={deadline.time} onChange={setDeadline} />
          <Field label="Feedback (optional)">{(p) => <Input {...p} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}</Field>
        </>
      )}
    </ReasonDialog>
  );
}

function EditDetailsDialog({ s, today }: { s: WorkflowStatement; today: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const initial = { title: s.title, notes: s.notes ?? "", issuedOn: s.issuedOn, dueDate: s.dueDate, dueTime: s.dueTime, reason: "" };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    try {
      const res = await updateStatementDetailsAction({ statementId: s.id, ...v });
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast("success", "Statement updated.");
      setOpen(false);
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setV(initial);
          setError(null);
          setErrors({});
        }
      }}
      trigger={
        <Button variant="outline">
          <Pencil className="h-4 w-4" aria-hidden /> Edit / extend deadline
        </Button>
      }
      title="Edit statement"
      description="Changes are recorded with the previous values."
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <DeadlineInput label="Deadline" today={today} min={v.issuedOn} date={v.dueDate} time={v.dueTime} onChange={(d) => setV({ ...v, dueDate: d.date, dueTime: d.time })} error={errors.dueDate} />
        <Field label="Subject" required error={errors.title}>
          {(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}
        </Field>
        <Field label="Issue date" required error={errors.issuedOn}>
          {(p) => <Input {...p} type="date" value={v.issuedOn} onChange={(e) => setV({ ...v, issuedOn: e.target.value })} />}
        </Field>
        <Field label="Instructor notes" error={errors.notes}>
          {(p) => <Textarea {...p} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}
        </Field>
        <Field label="Reason for change" required hint="E.g. “Extension granted — on duty”." error={errors.reason}>
          {(p) => <Input {...p} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
