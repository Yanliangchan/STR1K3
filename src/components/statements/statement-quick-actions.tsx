"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatementStatus } from "@prisma/client";
import { CheckCircle2, Inbox, PenLine } from "lucide-react";
import { recordReceiptAction, reviewStatementAction } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DeadlineInput } from "./deadline-input";
import type { ActionResult } from "@/server/action";

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The next step for a statement, as one-tap buttons:
 * waiting on cadet -> "Handed in"; handed in -> "Accept" / "Rewrite" (asks for a new deadline).
 */
export function StatementQuickActions({
  id,
  status,
  versions,
  cadetName,
  today,
}: {
  id: string;
  status: StatementStatus;
  versions: number;
  cadetName: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState({ date: addDays(today, 1), time: "23:59" });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<ActionResult<unknown>>, ok: string) {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        if (open) setError(res.error);
        else toast("error", res.error);
        return false;
      }
      toast("success", ok);
      router.refresh();
      return true;
    } catch {
      toast("error", "Could not reach the server. Nothing was changed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (status === "ACCEPTED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "NOT_SUBMITTED" || status === "REWRITE_REQUIRED") && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "rcv"}
          onClick={() => run("rcv", () => recordReceiptAction({ statementId: id, expectedStatus: status }), `${cadetName}: handed in.`)}
          data-testid="quick-receive"
        >
          <Inbox className="h-4 w-4" aria-hidden /> Handed in
        </Button>
      )}
      {status === "PENDING_REVIEW" && (
        <>
          <Button
            size="sm"
            loading={busy === "acc"}
            onClick={() => run("acc", () => reviewStatementAction({ statementId: id, outcome: "ACCEPTED", expectedVersion: versions || undefined }), `${cadetName}: accepted.`)}
            data-testid="quick-accept"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDeadline({ date: addDays(today, 1), time: "23:59" });
              setFeedback("");
              setError(null);
              setOpen(true);
            }}
            data-testid="quick-rewrite"
          >
            <PenLine className="h-4 w-4" aria-hidden /> Rewrite
          </Button>
          <Dialog
            open={open}
            onOpenChange={(o) => !busy && setOpen(o)}
            title={`Rewrite required — ${cadetName}`}
            description="Set the new deadline for the rewritten statement."
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={!!busy}>
                  Cancel
                </Button>
                <Button
                  loading={busy === "rw"}
                  data-testid="confirm-rewrite"
                  onClick={async () => {
                    const ok = await run(
                      "rw",
                      () =>
                        reviewStatementAction({
                          statementId: id,
                          outcome: "REWRITE_REQUIRED",
                          feedback,
                          newDueDate: deadline.date,
                          newDueTime: deadline.time,
                          expectedVersion: versions || undefined,
                        }),
                      `Rewrite required from ${cadetName}.`,
                    );
                    if (ok) setOpen(false);
                  }}
                >
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
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}
