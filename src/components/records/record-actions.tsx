"use client";

import { useState } from "react";
import { Ban, Pencil } from "lucide-react";
import { correctRecordAction, voidRecordAction } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/common/reason-dialog";

type Rec = {
  id: string;
  type: "NOR" | "CROW";
  date: string;
  time: string | null;
  categoryId: string | null;
  description: string;
  notes: string | null;
  referenceNo: string | null;
  updatedAt: string;
};

export function RecordActions({ rec, categories }: { rec: Rec; categories: { id: string; name: string; active: boolean }[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    date: rec.date,
    time: rec.time ?? "",
    categoryId: rec.categoryId ?? "",
    description: rec.description,
    notes: rec.notes ?? "",
    referenceNo: rec.referenceNo ?? "",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const res = await correctRecordAction({ recordId: rec.id, ...v, expectedUpdatedAt: rec.updatedAt });
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast("success", "Correction saved. The previous values are kept in the history.");
      setOpen(false);
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        trigger={
          <Button variant="outline">
            <Pencil className="h-4 w-4" aria-hidden /> Correct
          </Button>
        }
        title={`Correct ${rec.type}`}
        description="The original values are preserved in the audit history."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              Save correction
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required error={errors.date}>
              {(p) => <Input {...p} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}
            </Field>
            <Field label="Time" error={errors.time}>
              {(p) => <Input {...p} type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />}
            </Field>
          </div>
          <Field label="Category" error={errors.categoryId}>
            {(p) => (
              <Select {...p} value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
                <option value="">No category</option>
                {categories
                  .filter((c) => c.active || c.id === rec.categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Description" required error={errors.description}>
            {(p) => <Textarea {...p} rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}
          </Field>
          <Field label="Instructor notes" error={errors.notes}>
            {(p) => <Textarea {...p} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}
          </Field>
          <Field label="Reference number" error={errors.referenceNo}>
            {(p) => <Input {...p} value={v.referenceNo} onChange={(e) => setV({ ...v, referenceNo: e.target.value })} />}
          </Field>
          <Field label="Reason for correction" required error={errors.reason}>
            {(p) => <Textarea {...p} rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />}
          </Field>
        </div>
      </Dialog>

      <ReasonDialog
        trigger={
          <Button variant="ghost" className="text-red-700 hover:bg-red-50">
            <Ban className="h-4 w-4" aria-hidden /> Void
          </Button>
        }
        title={`Void this ${rec.type}?`}
        description="The record is kept for the audit trail but excluded from counts and statistics. This cannot be undone through the app."
        confirmLabel="Void record"
        confirmVariant="danger"
        successMessage="Record voided."
        onConfirm={(reason) => voidRecordAction({ recordId: rec.id, reason })}
      />
    </div>
  );
}
