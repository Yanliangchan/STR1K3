"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatementStatus } from "@prisma/client";
import { Ban, CheckCircle2, Inbox, PenLine, Pencil, RotateCcw } from "lucide-react";
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
import type { ActionResult } from "@/server/action";

type Props = {
  statement: {
    id: string;
    status: StatementStatus;
    title: string;
    instructions: string | null;
    notes: string | null;
    requestedOn: string;
    latestVersion: number | null;
  };
  today: string;
};

export function StatementWorkflow({ statement: s, today }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [content, setContent] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [feedback, setFeedback] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<ActionResult<unknown>>, ok: string) {
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
      setContent("");
      setFeedback("");
      toast("success", ok);
      router.refresh();
    } catch {
      setError("Could not reach the server. The statement keeps its previous status.");
    } finally {
      setPending(null);
    }
  }

  const isRewrite = s.status === "REWRITE_REQUIRED";

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {(s.status === "NOT_SUBMITTED" || isRewrite) && (
        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Inbox className="h-5 w-5 text-navy-600" aria-hidden />
            {isRewrite ? "Record rewritten statement" : "Record statement received"}
          </h2>
          <p className="text-sm text-slate-600">
            {isRewrite
              ? `This creates version ${(s.latestVersion ?? 0) + 1}. Earlier versions and feedback are kept.`
              : "Moves the statement to Pending review."}
          </p>
          <Field label="Date received" error={errors.receivedOn}>
            {(p) => <Input {...p} type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} />}
          </Field>
          <Field label="Statement content" hint="Optional. Type or paste the cadet's statement." error={errors.content}>
            {(p) => <Textarea {...p} rows={6} value={content} onChange={(e) => setContent(e.target.value)} maxLength={50000} />}
          </Field>
          <Button
            onClick={() =>
              run(
                "receive",
                () => recordReceiptAction({ statementId: s.id, content, receivedOn, expectedStatus: s.status }),
                "Statement marked Pending review.",
              )
            }
            loading={pending === "receive"}
            data-testid="record-receipt"
          >
            Record receipt — mark Pending review
          </Button>
        </Card>
      )}

      {s.status === "PENDING_REVIEW" && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold text-slate-900">Review version {s.latestVersion}</h2>
          <Field
            label="Feedback to cadet"
            hint="Required when requesting a rewrite."
            error={errors.feedback}
          >
            {(p) => <Textarea {...p} rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={10000} />}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() =>
                run(
                  "rewrite",
                  () => reviewStatementAction({ statementId: s.id, outcome: "REWRITE_REQUIRED", feedback, expectedVersion: s.latestVersion ?? undefined }),
                  "Rewrite requested.",
                )
              }
              loading={pending === "rewrite"}
              data-testid="request-rewrite"
            >
              <PenLine className="h-4 w-4" aria-hidden /> Rewrite required
            </Button>
            <Button
              onClick={() =>
                run(
                  "accept",
                  () => reviewStatementAction({ statementId: s.id, outcome: "ACCEPTED", feedback, expectedVersion: s.latestVersion ?? undefined }),
                  "Statement accepted.",
                )
              }
              loading={pending === "accept"}
              data-testid="accept-statement"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Accept
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {s.status === "ACCEPTED" && <ReopenDialog statementId={s.id} />}
        <EditDetailsDialog s={s} />
        <ReasonDialog
          trigger={
            <Button variant="ghost" className="text-red-700 hover:bg-red-50">
              <Ban className="h-4 w-4" aria-hidden /> Void
            </Button>
          }
          title="Void this statement request?"
          description="Use this if the request was created in error. It is kept for the audit trail but excluded from counts."
          confirmLabel="Void statement"
          confirmVariant="danger"
          successMessage="Statement voided."
          onConfirm={(reason) => voidStatementAction({ statementId: s.id, reason })}
        />
      </div>
    </div>
  );
}

function ReopenDialog({ statementId }: { statementId: string }) {
  const [to, setTo] = useState<"PENDING_REVIEW" | "REWRITE_REQUIRED">("PENDING_REVIEW");
  const [feedback, setFeedback] = useState("");
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
      onConfirm={(reason) => reopenStatementAction({ statementId, to, reason, feedback })}
    >
      <Field label="Move to">
        {(p) => (
          <Select {...p} value={to} onChange={(e) => setTo(e.target.value as typeof to)}>
            <option value="PENDING_REVIEW">Pending review (review the current version again)</option>
            <option value="REWRITE_REQUIRED">Rewrite required</option>
          </Select>
        )}
      </Field>
      {to === "REWRITE_REQUIRED" && (
        <Field label="Feedback to cadet" required>
          {(p) => <Textarea {...p} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
        </Field>
      )}
    </ReasonDialog>
  );
}

function EditDetailsDialog({ s }: { s: Props["statement"] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: s.title, instructions: s.instructions ?? "", notes: s.notes ?? "", requestedOn: s.requestedOn, reason: "" });
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
      toast("success", "Details corrected.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !pending && setOpen(o)}
      trigger={
        <Button variant="outline">
          <Pencil className="h-4 w-4" aria-hidden /> Edit request
        </Button>
      }
      title="Correct statement request"
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
        <Field label="Statement required for" required error={errors.title}>
          {(p) => <Textarea {...p} rows={3} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}
        </Field>
        <Field label="Instructions" error={errors.instructions}>
          {(p) => <Textarea {...p} rows={2} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />}
        </Field>
        <Field label="Instructor notes" error={errors.notes}>
          {(p) => <Textarea {...p} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}
        </Field>
        <Field label="Date requested" required error={errors.requestedOn}>
          {(p) => <Input {...p} type="date" value={v.requestedOn} onChange={(e) => setV({ ...v, requestedOn: e.target.value })} />}
        </Field>
        <Field label="Reason for correction" required error={errors.reason}>
          {(p) => <Textarea {...p} rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
