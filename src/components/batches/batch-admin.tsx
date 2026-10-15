"use client";

import Link from "@/components/ui/link";
import { useState } from "react";
import { Archive, ArrowRightLeft, CheckCircle2, Pencil, Plus, RotateCcw, Trash2, Upload, UserMinus, UserPlus } from "lucide-react";
import {
  activateBatchAction,
  archiveBatchAction,
  assignByteAction,
  createByteAction,
  createCadetAction,
  deleteByteAction,
  reopenBatchAction,
  setCadetStatusAction,
  transferCadetAction,
  updateBatchAction,
  updateByteAction,
  updateCadetAction,
} from "@/app/actions/data";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, SectionTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/common/reason-dialog";
import type { ActionResult } from "@/server/action";
import { pluralize } from "@/lib/utils";

type Byte = { id: string; name: string; status: "ACTIVE" | "INACTIVE"; cadetCount: number };
type CadetRow = { id: string; name: string; byteId: string | null; byteName: string | null; notes: string | null; status: string };
type Checklist = { outstanding: number; notSubmitted: number; pendingReview: number; rewriteRequired: number; unassignedCadets: number };

function useRun() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function run<T>(fn: () => Promise<ActionResult<T>>, ok: string): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return false;
      }
      setFieldErrors({});
      toast("success", ok);
      return true;
    } catch {
      setError("Could not reach the server. Nothing was changed.");
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, fieldErrors, setError };
}

export function BatchAdmin({
  batch,
  isActive,
  bytes,
  cadets,
  checklist,
  otherBatches,
}: {
  batch: { id: string; name: string; description: string | null; expectedSize: number | null; status: "OPEN" | "ARCHIVED"; archiveNote: string | null };
  isActive: boolean;
  bytes: Byte[];
  cadets: CadetRow[];
  checklist: Checklist;
  otherBatches: { id: string; name: string; bytes: { id: string; name: string }[] }[];
}) {
  const readOnly = batch.status === "ARCHIVED";
  return (
    <div className="space-y-6">
      <BatchControls batch={batch} isActive={isActive} checklist={checklist} />
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          {batch.archiveNote ? `Carry-over note: ${batch.archiveNote}` : "Reopen the batch to make changes."}
        </Alert>
      ) : (
        <>
          <BytesSection batchId={batch.id} bytes={bytes} />
          <RosterSection batchId={batch.id} bytes={bytes} cadets={cadets} otherBatches={otherBatches} />
        </>
      )}
      {readOnly && (
        <section>
          <SectionTitle>Roster ({cadets.length})</SectionTitle>
          <Card>
            <ul className="divide-y divide-slate-100">
              {cadets.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link href={`/cadets/${c.id}`} className="text-navy-800 hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-slate-500">{c.byteName ?? "No byte"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function BatchControls({ batch, isActive, checklist }: { batch: Parameters<typeof BatchAdmin>[0]["batch"]; isActive: boolean; checklist: Checklist }) {
  const { run, pending, error, fieldErrors } = useRun();
  const [editOpen, setEditOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [v, setV] = useState({ name: batch.name, description: batch.description ?? "", expectedSize: batch.expectedSize?.toString() ?? "" });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{batch.name}</h1>
        {isActive && <Badge tone="green">Active batch</Badge>}
        {batch.status === "ARCHIVED" && <Badge>Archived</Badge>}
      </div>
      {batch.description && <p className="mt-1 text-sm text-slate-600">{batch.description}</p>}
      {error && !editOpen && !activateOpen && !archiveOpen && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {batch.status === "OPEN" && !isActive && (
          <Button onClick={() => setActivateOpen(true)} data-testid="activate-batch">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Set as active batch
          </Button>
        )}
        {batch.status === "OPEN" && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit details
          </Button>
        )}
        {batch.status === "OPEN" && !isActive && (
          <Button variant="outline" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden /> Archive
          </Button>
        )}
        {batch.status === "ARCHIVED" && (
          <ReasonDialog
            trigger={
              <Button variant="outline">
                <RotateCcw className="h-4 w-4" aria-hidden /> Reopen batch
              </Button>
            }
            title={`Reopen ${batch.name}?`}
            description="The batch becomes editable again. Your reason is recorded in the audit history."
            confirmLabel="Reopen"
            successMessage="Batch reopened."
            onConfirm={(reason) => reopenBatchAction({ batchId: batch.id, reason })}
          />
        )}
        <Link href={`/?b=${batch.id}`} className={buttonClasses("ghost")}>
          View dashboard
        </Link>
      </div>
      {isActive && <p className="mt-3 text-sm text-slate-500">To archive this batch, first set another batch as active.</p>}

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit batch details"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                const ok = await run(
                  () => updateBatchAction(batch.id, { name: v.name, description: v.description, expectedSize: v.expectedSize ? Number(v.expectedSize) : null }),
                  "Batch updated.",
                );
                if (ok) setEditOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Batch name" required error={fieldErrors.name}>
            {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
          </Field>
          <Field label="Description">
            {(p) => <Textarea {...p} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}
          </Field>
          <Field label="Expected number of cadets" error={fieldErrors.expectedSize}>
            {(p) => <Input {...p} type="number" value={v.expectedSize} onChange={(e) => setV({ ...v, expectedSize: e.target.value })} />}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        title="Change the active batch"
        description="Everyone using STR1K3 will open into this batch. Records stay with the batch they belong to."
        footer={
          <>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={confirmName.trim() !== batch.name}
              data-testid="confirm-activate"
              onClick={async () => {
                const ok = await run(() => activateBatchAction({ batchId: batch.id, confirmName }), `${batch.name} is now the active batch.`);
                if (ok) setActivateOpen(false);
              }}
            >
              Activate {batch.name}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Alert tone="warning">
            You are about to make <strong>{batch.name}</strong> the active batch.
          </Alert>
          <Field label={`Type "${batch.name}" to confirm`} error={fieldErrors.confirmName}>
            {(p) => <Input {...p} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${batch.name}`}
        description="Archived batches become read-only. Nothing is deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!ack || (checklist.outstanding > 0 && !note.trim())}
              onClick={async () => {
                const ok = await run(() => archiveBatchAction({ batchId: batch.id, acknowledged: ack, carryOverNote: note }), "Batch archived.");
                if (ok) setArchiveOpen(false);
              }}
            >
              Archive batch
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {error && <Alert tone="error">{error}</Alert>}
          <p className="font-medium text-slate-800">Pre-archive checklist</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <CheckRow ok={checklist.notSubmitted === 0} label={`${checklist.notSubmitted} statements not submitted`} />
            <CheckRow ok={checklist.pendingReview === 0} label={`${checklist.pendingReview} statements pending review`} />
            <CheckRow ok={checklist.rewriteRequired === 0} label={`${checklist.rewriteRequired} statements awaiting rewrite`} />
            <CheckRow ok={checklist.unassignedCadets === 0} label={`${checklist.unassignedCadets} active cadets without a byte`} />
          </ul>
          {checklist.outstanding > 0 && (
            <Field label="Approved carry-over arrangement" required hint="Required because statements are still outstanding." error={fieldErrors.carryOverNote}>
              {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          )}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
            <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
            <span>I have reviewed the checklist and confirm this batch can be archived.</span>
          </label>
        </div>
      </Dialog>
    </Card>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <span>{label}</span>
      {ok ? <Badge tone="green">Clear</Badge> : <Badge tone="amber">Review</Badge>}
    </li>
  );
}

function BytesSection({ batchId, bytes }: { batchId: string; bytes: Byte[] }) {
  const { run, pending, error } = useRun();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Byte | null>(null);
  const [editName, setEditName] = useState("");
  return (
    <section>
      <SectionTitle>Bytes ({bytes.length})</SectionTitle>
      <Card>
        {error && (
          <div className="p-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {bytes.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-4 py-2">
              <span className="flex-1 text-sm">
                <span className="font-medium text-slate-900">{b.name}</span>
                <span className="text-slate-500"> · {pluralize(b.cadetCount, "cadet")}</span>
                {b.status === "INACTIVE" && <Badge className="ml-2">Inactive</Badge>}
              </span>
              <Button variant="ghost" size="icon" aria-label={`Rename ${b.name}`} onClick={() => (setEditing(b), setEditName(b.name))}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run(() => updateByteAction({ byteId: b.id, name: b.name, status: b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }), "Byte updated.")}
              >
                {b.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
              {b.cadetCount === 0 && (
                <Button variant="ghost" size="icon" aria-label={`Delete ${b.name}`} onClick={() => run(() => deleteByteAction({ byteId: b.id }), "Byte deleted.")}>
                  <Trash2 className="h-4 w-4 text-red-700" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => createByteAction({ batchId, name }), "Byte added.");
            if (ok) setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New byte name" aria-label="New byte name" maxLength={40} />
          <Button type="submit" variant="secondary" loading={pending} disabled={!name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> Add
          </Button>
        </form>
      </Card>
      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Rename byte"
        footer={
          <Button
            loading={pending}
            onClick={async () => {
              if (!editing) return;
              const ok = await run(() => updateByteAction({ byteId: editing.id, name: editName, status: editing.status }), "Byte renamed.");
              if (ok) setEditing(null);
            }}
          >
            Save
          </Button>
        }
      >
        <Field label="Byte name">{(p) => <Input {...p} value={editName} onChange={(e) => setEditName(e.target.value)} />}</Field>
      </Dialog>
    </section>
  );
}

function RosterSection({
  batchId,
  bytes,
  cadets,
  otherBatches,
}: {
  batchId: string;
  bytes: Byte[];
  cadets: CadetRow[];
  otherBatches: { id: string; name: string; bytes: { id: string; name: string }[] }[];
}) {
  const { run, pending, error, fieldErrors } = useRun();
  const [newCadet, setNewCadet] = useState({ name: "", byteId: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkByte, setBulkByte] = useState("");
  const [editing, setEditing] = useState<CadetRow | null>(null);
  const [editV, setEditV] = useState({ name: "", byteId: "", notes: "" });
  const [transfer, setTransfer] = useState({ targetBatchId: "", targetByteId: "" });
  const activeBytes = bytes.filter((b) => b.status === "ACTIVE");
  const active = cadets.filter((c) => c.status === "ACTIVE");
  const inactive = cadets.filter((c) => c.status !== "ACTIVE");
  const targetBatch = otherBatches.find((b) => b.id === transfer.targetBatchId);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Roster ({active.length} active)</h2>
        <Link href={`/batches/${batchId}/import`} className={buttonClasses("outline", "sm")}>
          <Upload className="h-4 w-4" aria-hidden /> Import CSV
        </Link>
      </div>
      {error && !editing && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      <Card>
        <form
          className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-[1fr_200px_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => createCadetAction(batchId, newCadet), `${newCadet.name} added.`);
            if (ok) setNewCadet({ name: "", byteId: newCadet.byteId });
          }}
        >
          <Input value={newCadet.name} onChange={(e) => setNewCadet({ ...newCadet, name: e.target.value })} placeholder="Cadet name" aria-label="New cadet name" maxLength={120} />
          <Select value={newCadet.byteId} onChange={(e) => setNewCadet({ ...newCadet, byteId: e.target.value })} aria-label="Byte for new cadet">
            <option value="">No byte</option>
            {activeBytes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" loading={pending} disabled={!newCadet.name.trim()}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add cadet
          </Button>
        </form>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-navy-50 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Select value={bulkByte} onChange={(e) => setBulkByte(e.target.value)} aria-label="Assign byte" className="w-auto">
              <option value="">Choose byte…</option>
              {activeBytes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="__none">No byte</option>
            </Select>
            <Button
              size="sm"
              disabled={!bulkByte}
              loading={pending}
              onClick={async () => {
                const ok = await run(
                  () => assignByteAction({ batchId, cadetIds: [...selected], byteId: bulkByte === "__none" ? null : bulkByte }),
                  "Byte assignments saved.",
                );
                if (ok) setSelected(new Set());
              }}
            >
              Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {active.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2 py-1">
              <label className="flex h-11 w-10 cursor-pointer items-center justify-center">
                <Checkbox
                  checked={selected.has(c.id)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                  aria-label={`Select ${c.name}`}
                />
              </label>
              <Link href={`/cadets/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:underline">
                {c.name}
              </Link>
              <span className="hidden text-sm text-slate-500 sm:inline">{c.byteName ?? "No byte"}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${c.name}`}
                onClick={() => {
                  setEditing(c);
                  setEditV({ name: c.name, byteId: c.byteId ?? "", notes: c.notes ?? "" });
                  setTransfer({ targetBatchId: "", targetByteId: "" });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {active.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No cadets yet. Add them above or import a CSV.</li>}
        </ul>
        {inactive.length > 0 && (
          <details className="border-t border-slate-100 px-4 py-2 text-sm">
            <summary className="min-h-10 cursor-pointer py-2 font-medium text-slate-700">Removed or transferred ({inactive.length})</summary>
            <ul className="space-y-1 pb-2">
              {inactive.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <Link href={`/cadets/${c.id}`} className="hover:underline">
                    {c.name} <Badge>{c.status === "REMOVED" ? "Removed" : "Transferred"}</Badge>
                  </Link>
                  {c.status === "REMOVED" && (
                    <ReasonDialog
                      trigger={<Button size="sm" variant="ghost">Restore</Button>}
                      title={`Restore ${c.name} to the roster?`}
                      confirmLabel="Restore"
                      successMessage="Cadet restored."
                      onConfirm={(reason) => setCadetStatusAction({ cadetId: c.id, status: "ACTIVE", reason })}
                    />
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Edit ${editing.name}` : ""}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Close
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!editing) return;
                const ok = await run(() => updateCadetAction(editing.id, editV), "Cadet updated.");
                if (ok) setEditing(null);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Name" required error={fieldErrors.name}>
              {(p) => <Input {...p} value={editV.name} onChange={(e) => setEditV({ ...editV, name: e.target.value })} />}
            </Field>
            <Field label="Byte" error={fieldErrors.byteId}>
              {(p) => (
                <Select {...p} value={editV.byteId} onChange={(e) => setEditV({ ...editV, byteId: e.target.value })}>
                  <option value="">No byte</option>
                  {bytes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.status === "INACTIVE" ? " (inactive)" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Notes">{(p) => <Textarea {...p} rows={2} value={editV.notes} onChange={(e) => setEditV({ ...editV, notes: e.target.value })} />}</Field>

            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ArrowRightLeft className="h-4 w-4" aria-hidden /> Transfer to another batch
              </p>
              <p className="text-sm text-slate-600">Existing records stay with this batch. A new roster entry is created in the target batch.</p>
              {otherBatches.length === 0 ? (
                <p className="text-sm text-slate-500">No other open batches.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={transfer.targetBatchId} onChange={(e) => setTransfer({ targetBatchId: e.target.value, targetByteId: "" })} aria-label="Target batch">
                      <option value="">Target batch…</option>
                      {otherBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                    <Select value={transfer.targetByteId} onChange={(e) => setTransfer({ ...transfer, targetByteId: e.target.value })} aria-label="Target byte" disabled={!targetBatch}>
                      <option value="">No byte</option>
                      {targetBatch?.bytes.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ReasonDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={!transfer.targetBatchId}>
                        Transfer…
                      </Button>
                    }
                    title={`Transfer ${editing.name} to ${targetBatch?.name ?? ""}?`}
                    confirmLabel="Transfer"
                    successMessage="Cadet transferred."
                    onConfirm={async (reason) => {
                      const r = await transferCadetAction({ cadetId: editing.id, targetBatchId: transfer.targetBatchId, targetByteId: transfer.targetByteId || null, reason });
                      if (r.ok) setEditing(null);
                      return r;
                    }}
                  />
                </>
              )}
            </div>

            <ReasonDialog
              trigger={
                <Button variant="ghost" className="text-red-700 hover:bg-red-50">
                  <UserMinus className="h-4 w-4" aria-hidden /> Remove from roster
                </Button>
              }
              title={`Remove ${editing.name} from the roster?`}
              description="Their records are kept. You can restore them later."
              confirmLabel="Remove"
              confirmVariant="danger"
              successMessage="Cadet removed from the roster."
              onConfirm={async (reason) => {
                const r = await setCadetStatusAction({ cadetId: editing.id, status: "REMOVED", reason });
                if (r.ok) setEditing(null);
                return r;
              }}
            />
          </div>
        )}
      </Dialog>
    </section>
  );
}
