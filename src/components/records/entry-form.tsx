"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Search, UserPlus, X } from "lucide-react";
import { createEntriesAction } from "@/app/actions/data";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { TypeBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { cn, pluralize } from "@/lib/utils";

type Kind = "NOR" | "CROW" | "STATEMENT";
type Cadet = { id: string; name: string; byteName: string | null };
type Override = { description?: string; notes?: string; instructions?: string };

type FormState = {
  kind: Kind;
  cadetIds: string[];
  date: string;
  time: string;
  categoryId: string;
  description: string;
  instructions: string;
  notes: string;
  referenceNo: string;
  occurrenceMode: "none" | "new" | "existing";
  occurrenceTitle: string;
  occurrenceId: string;
  overrides: Record<string, Override>;
  idempotencyKey: string;
};

type Success = { kind: Kind; created: { id: string; cadetId: string; cadetName: string }[]; replayed: boolean };

const KIND_COPY: Record<Kind, { title: string; descLabel: string; descHint: string; unit: string }> = {
  NOR: {
    title: "NOR",
    descLabel: "Observation",
    descHint: "What was observed. Shared by every selected cadet unless adjusted individually.",
    unit: "NOR",
  },
  CROW: {
    title: "CROW",
    descLabel: "Description",
    descHint: "What happened. Shared by every selected cadet unless adjusted individually.",
    unit: "CROW",
  },
  STATEMENT: {
    title: "Statement",
    descLabel: "Statement required for",
    descHint: "E.g. “Explain your whereabouts at 1900h on 14 Oct.” A statement request is not a finding of wrongdoing.",
    unit: "statement request",
  },
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blank(kind: Kind, cadetIds: string[], today: string): FormState {
  return {
    kind,
    cadetIds,
    date: today,
    time: "",
    categoryId: "",
    description: "",
    instructions: "",
    notes: "",
    referenceNo: "",
    occurrenceMode: cadetIds.length > 1 ? "new" : "none",
    occurrenceTitle: "",
    occurrenceId: "",
    overrides: {},
    idempotencyKey: newKey(),
  };
}

export function EntryForm({
  batch,
  roster,
  categories,
  occurrences,
  initialKind,
  initialCadetIds,
  fromParams,
  today,
}: {
  batch: { id: string; name: string };
  roster: Cadet[];
  categories: { id: string; name: string; recordType: "NOR" | "CROW" }[];
  occurrences: { id: string; title: string; date: string | null; count: number }[];
  initialKind: Kind;
  initialCadetIds: string[];
  fromParams: boolean;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const draftKey = `str1k3:draft:${batch.id}`;
  const [s, setS] = useState<FormState>(() => blank(initialKind, initialCadetIds, today));
  const [dirty, setDirty] = useState(false);
  const [draftNotice, setDraftNotice] = useState<null | "restored" | "available">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; code?: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const submittingRef = useRef(false);

  const byId = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const selected = s.cadetIds.map((id) => byId.get(id)).filter((c): c is Cadet => !!c);
  const kindCategories = categories.filter((c) => c.recordType === s.kind);
  const copy = KIND_COPY[s.kind];

  // Draft handling (per-device convenience; the server is the source of truth).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as FormState;
      if (fromParams) setDraftNotice("available");
      else {
        setS({ ...draft, cadetIds: draft.cadetIds.filter((id) => byId.has(id)) });
        setDirty(true);
        setDraftNotice("restored");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty || success) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(s));
    } catch {}
  }, [s, dirty, success, draftKey]);

  useEffect(() => {
    if (!dirty || success) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, success]);

  function update(patch: Partial<FormState>) {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.cadetIds) {
        // Default to linking multi-cadet entries as one occurrence.
        if (prev.occurrenceMode === "none" && patch.cadetIds.length > 1 && prev.cadetIds.length <= 1) next.occurrenceMode = "new";
        if (prev.occurrenceMode === "new" && patch.cadetIds.length <= 1) next.occurrenceMode = "none";
        next.overrides = Object.fromEntries(Object.entries(prev.overrides).filter(([id]) => patch.cadetIds!.includes(id)));
      }
      if (patch.kind && patch.kind !== prev.kind) next.categoryId = "";
      return next;
    });
    setDirty(true);
    const touched = Object.keys(patch).filter((k) => errors[k]);
    if (touched.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !touched.includes(k))));
  }

  function setOverride(cadetId: string, field: keyof Override, value: string) {
    setS((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [cadetId]: { ...prev.overrides[cadetId], [field]: value } },
    }));
    setDirty(true);
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setS(blank(initialKind, initialCadetIds, today));
    setDirty(false);
    setDraftNotice(null);
    setErrors({});
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as FormState;
        setS({ ...draft, cadetIds: draft.cadetIds.filter((id) => byId.has(id)) });
        setDirty(true);
      }
    } catch {}
    setDraftNotice("restored");
  }

  function clientValidate() {
    const e: Record<string, string> = {};
    if (s.cadetIds.length === 0) e.cadetIds = "Select at least one cadet.";
    if (!s.description.trim()) e.description = "Enter a description.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) e.date = "Enter a valid date.";
    if (s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) e.time = "Use HH:MM (24-hour).";
    if (s.occurrenceMode === "existing" && !s.occurrenceId) e.occurrence = "Choose an occurrence.";
    return e;
  }

  const missing = clientValidate();

  function openReview(e: React.FormEvent) {
    e.preventDefault();
    const v = clientValidate();
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) {
      setFormError({ message: "Please correct the highlighted fields." });
      return;
    }
    setReviewOpen(true);
  }

  async function submit() {
    if (submittingRef.current) return; // guards against double taps
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
    const overrides: Record<string, Override> = {};
    for (const [id, o] of Object.entries(s.overrides)) {
      const c = { description: clean(o.description), notes: clean(o.notes), instructions: clean(o.instructions) };
      if (c.description || c.notes || c.instructions) overrides[id] = c;
    }
    try {
      const res = await createEntriesAction({
        idempotencyKey: s.idempotencyKey,
        batchId: batch.id,
        kind: s.kind,
        cadetIds: s.cadetIds,
        date: s.date,
        time: s.kind === "STATEMENT" ? null : s.time || null,
        categoryId: s.kind === "STATEMENT" ? null : s.categoryId || null,
        description: s.description,
        notes: s.notes,
        referenceNo: s.kind === "STATEMENT" ? null : s.referenceNo,
        instructions: s.kind === "STATEMENT" ? s.instructions : null,
        occurrence:
          s.occurrenceMode === "new"
            ? { mode: "new", title: s.occurrenceTitle }
            : s.occurrenceMode === "existing"
              ? { mode: "existing", occurrenceId: s.occurrenceId }
              : { mode: "none" },
        overrides,
      });
      if (!res.ok) {
        setReviewOpen(false);
        setErrors(res.fieldErrors ?? {});
        setFormError({ message: res.error, code: res.code });
        return;
      }
      try {
        localStorage.removeItem(draftKey);
        sessionStorage.removeItem(`str1k3:selection:${batch.id}`);
      } catch {}
      setReviewOpen(false);
      setDirty(false);
      setSuccess({ kind: s.kind, created: res.data.created, replayed: res.data.replayed });
      toast("success", `${pluralize(res.data.created.length, KIND_COPY[s.kind].unit)} saved.`);
      router.refresh();
    } catch {
      // Network failure: the request may or may not have reached the server.
      // Keeping the same idempotency key makes a retry safe.
      setReviewOpen(false);
      setFormError({
        message:
          "Could not reach the server. Your entry is kept on this device — check your connection and press Create again. It will not be duplicated.",
        code: "NETWORK",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (success) {
    const isStatement = success.kind === "STATEMENT";
    return (
      <Card className="p-5" data-testid="entry-success">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {pluralize(success.created.length, KIND_COPY[success.kind].unit)} created
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {success.replayed
                ? "These were already saved by an earlier attempt — nothing was duplicated."
                : `Saved to ${batch.name}. Each cadet has their own ${isStatement ? "statement workflow" : "record"}.`}
            </p>
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {success.created.map((c) => (
                <li key={c.id}>
                  <Link
                    href={isStatement ? `/statements/${c.id}` : `/records/${c.id}`}
                    className="flex min-h-11 items-center justify-between px-3 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{c.cadetName}</span>
                    <span className="text-navy-700">View</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setSuccess(null);
                  setS(blank(success.kind, [], today));
                  setDraftNotice(null);
                }}
              >
                Create another
              </Button>
              <Link href={isStatement ? "/statements" : "/records"} className={buttonClasses("outline")}>
                {isStatement ? "Statement queue" : "All records"}
              </Link>
              <Link href="/cadets" className={buttonClasses("ghost")}>
                Back to roster
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={openReview} className="space-y-5 pb-28 lg:pb-20" noValidate>
      {draftNotice === "restored" && (
        <Alert tone="info">
          <span>Unsaved draft restored. </span>
          <button type="button" className="font-medium underline" onClick={discardDraft}>
            Discard draft
          </button>
        </Alert>
      )}
      {draftNotice === "available" && (
        <Alert tone="info">
          <span>You have an unsaved draft. </span>
          <button type="button" className="font-medium underline" onClick={restoreDraft}>
            Restore it
          </button>
          <span> or continue with the new selection.</span>
        </Alert>
      )}
      {formError && (
        <Alert tone="error" title={formError.code === "UNAUTHENTICATED" ? "Session expired" : "Not saved"}>
          {formError.message}
          {formError.code === "UNAUTHENTICATED" && (
            <span>
              {" "}
              Your entry is saved on this device.{" "}
              <a href="/login" target="_blank" rel="noopener" className="font-medium underline">
                Sign in in a new tab
              </a>
              , then return here and press Create again.
            </span>
          )}
        </Alert>
      )}

      {/* Record type */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Record type</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(["NOR", "CROW", "STATEMENT"] as Kind[]).map((k) => (
            <label
              key={k}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold",
                s.kind === k ? "border-navy-700 bg-navy-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <input type="radio" name="kind" value={k} checked={s.kind === k} onChange={() => update({ kind: k })} className="sr-only" />
              {k === "STATEMENT" ? "Statement" : k}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Cadets */}
      <section aria-labelledby="cadets-h" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="cadets-h" className="text-sm font-medium text-slate-800">
            Cadets <span className="text-red-700" aria-hidden>*</span>
            <span className="ml-2 font-normal text-slate-500">{selected.length} selected</span>
          </h2>
          <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> {selected.length ? "Change" : "Select cadets"}
          </Button>
        </div>
        {selected.length > 0 ? (
          <ul className="flex flex-wrap gap-2" data-testid="selected-cadets">
            {selected.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm text-navy-900 ring-1 ring-inset ring-navy-100">
                <span>
                  {c.name}
                  {c.byteName && <span className="text-navy-600"> · {c.byteName}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => update({ cadetIds: s.cadetIds.filter((x) => x !== c.id) })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-navy-100"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex min-h-14 w-full items-center justify-center rounded-xl border border-dashed text-sm",
              errors.cadetIds ? "border-red-400 text-red-700" : "border-slate-300 text-slate-600 hover:bg-white",
            )}
          >
            Tap to select one or more cadets
          </button>
        )}
        {errors.cadetIds && (
          <p className="text-sm font-medium text-red-700" role="alert">
            {errors.cadetIds}
          </p>
        )}
      </section>

      {/* Shared details */}
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={s.kind === "STATEMENT" ? "Date requested" : "Date of occurrence"} required error={errors.date}>
            {(p) => <Input {...p} type="date" value={s.date} max={today} onChange={(e) => update({ date: e.target.value })} />}
          </Field>
          {s.kind !== "STATEMENT" ? (
            <Field label="Time" hint="If known" error={errors.time}>
              {(p) => <Input {...p} type="time" value={s.time} onChange={(e) => update({ time: e.target.value })} />}
            </Field>
          ) : (
            <div />
          )}
        </div>

        {s.kind !== "STATEMENT" && (
          <Field
            label="Category"
            error={errors.categoryId}
            hint={kindCategories.length === 0 ? (
              <span>
                No {s.kind} categories yet — add them in <Link href="/settings" className="underline">Settings</Link>.
              </span>
            ) : undefined}
          >
            {(p) => (
              <Select {...p} value={s.categoryId} onChange={(e) => update({ categoryId: e.target.value })} disabled={kindCategories.length === 0}>
                <option value="">No category</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label={copy.descLabel} required hint={copy.descHint} error={errors.description}>
          {(p) => <Textarea {...p} rows={3} value={s.description} onChange={(e) => update({ description: e.target.value })} maxLength={4000} />}
        </Field>

        {s.kind === "STATEMENT" && (
          <Field label="Instructions to cadets" hint="Format, deadline or what to cover. Optional." error={errors.instructions}>
            {(p) => <Textarea {...p} rows={2} value={s.instructions} onChange={(e) => update({ instructions: e.target.value })} maxLength={4000} />}
          </Field>
        )}

        <Field label="Instructor notes" hint="Optional. Internal notes." error={errors.notes}>
          {(p) => <Textarea {...p} rows={2} value={s.notes} onChange={(e) => update({ notes: e.target.value })} maxLength={4000} />}
        </Field>

        {s.kind !== "STATEMENT" && (
          <Field label="Reference number" hint="Optional." error={errors.referenceNo}>
            {(p) => <Input {...p} value={s.referenceNo} onChange={(e) => update({ referenceNo: e.target.value })} maxLength={100} />}
          </Field>
        )}
      </Card>

      {/* Shared occurrence */}
      <Card className="space-y-3 p-4">
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Shared occurrence</legend>
          <p className="mt-0.5 text-sm text-slate-500">
            Optional. Links entries that came from the same event so reports do not count it more than once.
          </p>
          <div className="mt-3 space-y-1">
            {[
              { v: "none", label: "Don't link" },
              { v: "new", label: selected.length > 1 ? "Link these entries as one occurrence" : "Start a new occurrence" },
              ...(occurrences.length ? [{ v: "existing", label: "Add to an existing occurrence" }] : []),
            ].map((o) => (
              <label key={o.v} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="radio"
                  name="occ"
                  className="h-5 w-5 accent-navy-700"
                  checked={s.occurrenceMode === o.v}
                  onChange={() => update({ occurrenceMode: o.v as FormState["occurrenceMode"] })}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {s.occurrenceMode === "new" && (
          <Field label="Occurrence title" hint="Optional — defaults to the start of the description.">
            {(p) => <Input {...p} value={s.occurrenceTitle} onChange={(e) => update({ occurrenceTitle: e.target.value })} maxLength={200} />}
          </Field>
        )}
        {s.occurrenceMode === "existing" && (
          <Field label="Occurrence" required error={errors.occurrence}>
            {(p) => (
              <Select {...p} value={s.occurrenceId} onChange={(e) => update({ occurrenceId: e.target.value })}>
                <option value="">Choose…</option>
                {occurrences.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                    {o.date ? ` (${o.date})` : ""} — {o.count} linked
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </Card>

      {/* Individual adjustments */}
      {selected.length > 1 && (
        <Card>
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-medium text-slate-800"
            aria-expanded={showOverrides}
            onClick={() => setShowOverrides((v) => !v)}
          >
            <span>
              Adjust individual cadets
              <span className="ml-2 font-normal text-slate-500">
                {Object.values(s.overrides).filter((o) => o.description || o.notes || o.instructions).length || "none"} adjusted
              </span>
            </span>
            <ChevronDown className={cn("h-5 w-5 transition-transform", showOverrides && "rotate-180")} aria-hidden />
          </button>
          {showOverrides && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {selected.map((c) => (
                <li key={c.id} className="space-y-2 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                  <Field label={`${copy.descLabel} (leave blank to use shared)`}>
                    {(p) => <Textarea {...p} rows={2} value={s.overrides[c.id]?.description ?? ""} onChange={(e) => setOverride(c.id, "description", e.target.value)} placeholder={s.description} />}
                  </Field>
                  {s.kind === "STATEMENT" && (
                    <Field label="Individual instructions">
                      {(p) => <Textarea {...p} rows={2} value={s.overrides[c.id]?.instructions ?? ""} onChange={(e) => setOverride(c.id, "instructions", e.target.value)} placeholder={s.instructions} />}
                    </Field>
                  )}
                  <Field label="Individual notes">
                    {(p) => <Textarea {...p} rows={2} value={s.overrides[c.id]?.notes ?? ""} onChange={(e) => setOverride(c.id, "notes", e.target.value)} placeholder={s.notes} />}
                  </Field>
                  <Button variant="ghost" size="sm" onClick={() => update({ cadetIds: s.cadetIds.filter((x) => x !== c.id) })}>
                    Exclude {c.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            <strong>{selected.length}</strong> {selected.length === 1 ? "cadet" : "cadets"} · {copy.title}
          </p>
          <Button type="submit" size="lg" data-testid="review-entries">
            Review
          </Button>
        </div>
      </div>

      <CadetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        roster={roster}
        selected={s.cadetIds}
        onChange={(ids) => update({ cadetIds: ids })}
      />

      <Dialog
        open={reviewOpen}
        onOpenChange={(o) => !submitting && setReviewOpen(o)}
        title="Confirm creation"
        description={`${batch.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={submitting}>
              Back
            </Button>
            <Button onClick={submit} loading={submitting} disabled={Object.keys(missing).length > 0} data-testid="confirm-create">
              Create {pluralize(selected.length, copy.unit)}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm" data-testid="review-summary">
          <ul className="space-y-1 rounded-lg bg-slate-50 p-3">
            <li>
              <strong>{selected.length}</strong> {selected.length === 1 ? "cadet" : "cadets"} selected.
            </li>
            <li className="flex items-center gap-2">
              Record type: <TypeBadge type={s.kind} />
            </li>
            <li>
              <strong>{selected.length}</strong> individual {copy.unit}
              {selected.length === 1 ? "" : "s"} will be created.
            </li>
          </ul>
          <div>
            <p className="font-medium text-slate-800">{copy.descLabel}</p>
            <p className="whitespace-pre-wrap text-slate-700">{s.description}</p>
          </div>
          {Object.keys(missing).length > 0 && (
            <Alert tone="error" title="Missing information">
              <ul className="list-disc pl-4">
                {Object.values(missing).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Alert>
          )}
          <div>
            <p className="mb-1 font-medium text-slate-800">Cadets</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {selected.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2">
                  <span>{c.name}</span>
                  <span className="text-xs text-slate-500">
                    {c.byteName ?? "No byte"}
                    {s.overrides[c.id] && Object.values(s.overrides[c.id]!).some((v) => v?.trim()) ? " · adjusted" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Dialog>
    </form>
  );
}

function CadetPicker({
  open,
  onOpenChange,
  roster,
  selected,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roster: Cadet[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [byte, setByte] = useState("");
  const bytes = [...new Set(roster.map((c) => c.byteName).filter(Boolean))] as string[];
  const shown = roster.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.byteName ?? "").toLowerCase().includes(q.toLowerCase())) &&
      (!byte || c.byteName === byte),
  );
  const set = new Set(selected);
  const allShown = shown.length > 0 && shown.every((c) => set.has(c.id));
  function toggle(id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(roster.filter((c) => n.has(c.id)).map((c) => c.id));
  }
  function toggleShown() {
    const n = new Set(set);
    shown.forEach((c) => (allShown ? n.delete(c.id) : n.add(c.id)));
    onChange(roster.filter((c) => n.has(c.id)).map((c) => c.id));
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Select cadets"
      description={`${selected.length} selected`}
      footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
    >
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or byte" aria-label="Search cadets" className="pl-10" />
        </div>
        {bytes.length > 0 && (
          <Select aria-label="Filter by byte" value={byte} onChange={(e) => setByte(e.target.value)}>
            <option value="">All bytes</option>
            {bytes.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 text-sm font-medium text-slate-700">
          <Checkbox checked={allShown} onChange={toggleShown} disabled={shown.length === 0} />
          {allShown ? "Clear" : "Select"} all {shown.length} shown
        </label>
        <ul className="max-h-[50dvh] overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-slate-50">
                <Checkbox checked={set.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="flex-1 text-sm text-slate-900">{c.name}</span>
                <span className="text-xs text-slate-500">{c.byteName ?? "No byte"}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No cadets match.</li>}
        </ul>
      </div>
    </Dialog>
  );
}
