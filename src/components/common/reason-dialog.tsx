"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action";

/** A confirm dialog that requires a written reason before calling an action. */
export function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  successMessage,
  onConfirm,
  reasonLabel = "Reason",
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  successMessage: string;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<ActionResult<unknown>>;
  children?: ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setPending(true);
    try {
      const res = await onConfirm(reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast("success", successMessage);
      setOpen(false);
      setReason("");
      setError(null);
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
        if (!pending) {
          setOpen(o);
          setError(null);
        }
      }}
      trigger={trigger}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={confirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={reasonLabel} required>
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
      </div>
    </Dialog>
  );
}
