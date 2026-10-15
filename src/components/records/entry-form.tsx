"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { createEntriesAction } from "@/app/actions/data";
import { addToOutbox } from "@/lib/outbox";
import type { CreateEntriesInput } from "@/server/services/entries";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CadetCombobox } from "@/components/cadets/cadet-combobox";
import { DeadlineInput } from "@/components/statements/deadline-input";
import { Alert, Card } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { TypeBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { cn, pluralize } from "@/lib/utils";

type Kind = "NOR" | "CROW" | "STATEMENT";
type Cadet = { id: string; name: string; byteName: string | null };
type Override = { description?: string; notes?: string };

type FormState = {
  kind: Kind;
  cadetIds: string[];
  date: string;
  time: string;
  categoryId: string;
  description: string;
  dueDate: string;
  dueTime: string;
  notes: string;
  referenceNo: string;
  occurrenceMode: "none" | "new" | "existing";
  occurrenceTitle: string;
  occurrenceId: string;
  overrides: Record<string, Override>;
  idempotencyKey: string;
};

type Success = {
  kind: Kind;
  created: { id: string; cadetId: string; cadetName: string }[];
  replayed: boolean;
  description: string;
  occurrenceId: string | null;
};
type QuickPick = { description: string; categoryId: string | null };
const lastCatKey = (kind: Kind) => `str1k3:lastCategory:${kind}`;

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
    descLabel: "Subject",
    descHint: "What the statement is about, e.g. “Missing food from instructors’ pantry”. A statement request is not a finding of wrongdoing.",
    unit: "statement request",
  },
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function blank(kind: Kind, cadetIds: string[], today: string): FormState {
  return {
    kind,
    cadetIds,
    date: today,
    time: "",
    categoryId: "",
    description: "",
    dueDate: addDays(today, 1),
    dueTime: "23:59",
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
  recent,
  initialKind,
  initialCadetIds,
  fromParams,
  today,
}: {
  batch: { id: string; name: string };
  roster: Cadet[];
  categories: { id: string; name: string; recordType: "NOR" | "CROW" }[];
  occurrences: { id: string; title: string; date: string | null; count: number }[];
  recent: Record<Kind, QuickPick[]>;
  initialKind: Kind;
  initialCadetIds: string[];
  fromParams: boolean;
  today: string;
}) {
  const toast = useToast();
  const draftKey = `str1k3:draft:v2:${batch.id}`;
  const [s, setS] = useState<FormState>(() => blank(initialKind, initialCadetIds, today));
  const [dirty, setDirty] = useState(false);
  const [draftNotice, setDraftNotice] = useState<null | "restored" | "available">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; code?: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const submittingRef = useRef(false);

  const byId = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const selected = s.cadetIds.map((id) => byId.get(id)).filter((c): c is Cadet => !!c);
  const kindCategories = categories.filter((c) => c.recordType === s.kind);
  // Pre-select the category used last time for this record type (per device).
  function rememberedCategory(kind: Kind) {
    if (kind === "STATEMENT") return "";
    try {
      const id = localStorage.getItem(lastCatKey(kind));
      return id && categories.some((c) => c.id === id && c.recordType === kind) ? id : "";
    } catch {
      return "";
    }
  }
  useEffect(() => {
    if (!s.categoryId && s.kind !== "STATEMENT") {
      const id = rememberedCategory(s.kind);
      if (id) setS((prev) => ({ ...prev, categoryId: prev.categoryId || id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      if (patch.kind && patch.kind !== prev.kind) next.categoryId = patch.categoryId ?? rememberedCategory(patch.kind);
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
    if (s.kind === "STATEMENT") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.dueDate)) e.dueDate = "Set a submission deadline.";
      else if (s.dueDate < s.date) e.dueDate = "The deadline cannot be before the issue date.";
    }
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
    // One cadet: create straight away. Several cadets: confirm the bulk action first.
    if (selected.length === 1) void submit();
    else setReviewOpen(true);
  }

  async function submit() {
    if (submittingRef.current) return; // guards against double taps
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
    const overrides: Record<string, Override> = {};
    for (const [id, o] of Object.entries(s.overrides)) {
      const c = { description: clean(o.description), notes: clean(o.notes) };
      if (c.description || c.notes) overrides[id] = c;
    }
    const payload: CreateEntriesInput = {
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
        dueDate: s.kind === "STATEMENT" ? s.dueDate : null,
        dueTime: s.kind === "STATEMENT" ? s.dueTime : null,
        occurrence:
          s.occurrenceMode === "new"
            ? { mode: "new", title: s.occurrenceTitle }
            : s.occurrenceMode === "existing"
              ? { mode: "existing", occurrenceId: s.occurrenceId }
              : { mode: "none" },
        overrides,
      };
    const names = selected.map((c) => c.name);
    const summary = `${pluralize(selected.length, KIND_COPY[s.kind].unit)} for ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}`;
    const queueOffline = () => {
      addToOutbox({ key: s.idempotencyKey, payload, summary });
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      setReviewOpen(false);
      setDirty(false);
      setQueued(summary);
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queueOffline();
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    try {
      const res = await createEntriesAction(payload);
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
      try {
        if (s.kind !== "STATEMENT" && s.categoryId) localStorage.setItem(lastCatKey(s.kind), s.categoryId);
      } catch {}
      setSuccess({
        kind: s.kind,
        created: res.data.created,
        replayed: res.data.replayed,
        description: s.description.trim(),
        occurrenceId: res.data.occurrenceId,
      });
      toast("success", `${pluralize(res.data.created.length, KIND_COPY[s.kind].unit)} saved.`);
    } catch {
      // Network failure: the request may or may not have reached the server.
      // Queue it with the same idempotency key; resending can never duplicate.
      queueOffline();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (queued) {
    return (
      <Card className="p-5" data-testid="entry-queued">
        <h2 className="text-lg font-semibold text-slate-900">Saved on this device</h2>
        <p className="mt-1 text-sm text-slate-600">
          No connection right now. <strong>{queued}</strong> will be sent automatically as soon as you&apos;re back online — you don&apos;t need to do anything.
          It can never be saved twice.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setQueued(null);
              setS({ ...blank(s.kind, [], today), categoryId: rememberedCategory(s.kind) });
            }}
          >
            Record another
          </Button>
        </div>
      </Card>
    );
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
            <p className="mt-4 text-sm font-medium text-slate-800">What next?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!isStatement && (
                <Button
                  onClick={() => {
                    const ids = success.created.map((c) => c.cadetId);
                    setSuccess(null);
                    setDraftNotice(null);
                    setS({
                      ...blank("STATEMENT", ids, today),
                      description: success.description.slice(0, 500),
                      occurrenceMode: success.occurrenceId ? "existing" : ids.length > 1 ? "new" : "none",
                      occurrenceId: success.occurrenceId ?? "",
                    });
                    setDirty(true);
                    window.scrollTo({ top: 0 });
                  }}
                  data-testid="followup-statements"
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Request statement{success.created.length === 1 ? "" : "s"} from {success.created.length === 1 ? success.created[0]!.cadetName : `these ${success.created.length} cadets`}
                </Button>
              )}
              <Button
                variant={isStatement ? "primary" : "secondary"}
                onClick={() => {
                  const ids = success.created.map((c) => c.cadetId);
                  setSuccess(null);
                  setDraftNotice(null);
                  setS({ ...blank(isStatement ? "NOR" : success.kind, ids, today), categoryId: rememberedCategory(isStatement ? "NOR" : success.kind) });
                  window.scrollTo({ top: 0 });
                }}
              >
                Another record for the same cadet{success.created.length === 1 ? "" : "s"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(null);
                  setS({ ...blank(success.kind, [], today), categoryId: rememberedCategory(success.kind) });
                  setDraftNotice(null);
                  window.scrollTo({ top: 0 });
                }}
              >
                New {KIND_COPY[success.kind].title}, other cadets
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
                s.kind === k ? "border-primary bg-primary text-white" : "border-slate-300 bg-surface text-slate-700 hover:bg-slate-50",
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
        <h2 id="cadets-h" className="text-sm font-medium text-slate-800">
          Cadets <span className="text-red-700" aria-hidden>*</span>
          <span className="ml-2 font-normal text-slate-500">{selected.length} selected</span>
        </h2>
        <CadetCombobox roster={roster} selected={s.cadetIds} onChange={(ids) => update({ cadetIds: ids })} error={errors.cadetIds} />
        {errors.cadetIds && (
          <p className="text-sm font-medium text-red-700" role="alert">
            {errors.cadetIds}
          </p>
        )}
      </section>

      {/* Shared details */}
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={s.kind === "STATEMENT" ? "Issue date" : "Date of occurrence"} required error={errors.date}>
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

        {recent[s.kind].length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Recently used — tap to fill</p>
            <div className="-mx-1 flex flex-wrap gap-1.5" data-testid="quick-picks">
              {recent[s.kind].map((r) => (
                <button
                  key={r.description}
                  type="button"
                  onClick={() =>
                    update({
                      description: r.description,
                      ...(r.categoryId && kindCategories.some((c) => c.id === r.categoryId) ? { categoryId: r.categoryId } : {}),
                    })
                  }
                  className={cn(
                    "max-w-full truncate rounded-full px-3 py-2 text-left text-sm ring-1 ring-inset",
                    s.description === r.description ? "bg-primary text-white ring-primary" : "bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50",
                  )}
                >
                  {r.description}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label={copy.descLabel} required hint={copy.descHint} error={errors.description}>
          {(p) => <Textarea {...p} rows={3} value={s.description} onChange={(e) => update({ description: e.target.value })} maxLength={4000} />}
        </Field>

        {s.kind === "STATEMENT" && (
          <DeadlineInput
            label="Submission deadline"
            today={today}
            min={s.date}
            date={s.dueDate}
            time={s.dueTime}
            error={errors.dueDate}
            onChange={(v) => update({ dueDate: v.date, dueTime: v.time })}
          />
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
                  className="h-5 w-5 accent-primary"
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
                {Object.values(s.overrides).filter((o) => o.description || o.notes).length || "none"} adjusted
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
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            <strong>{selected.length}</strong> {selected.length === 1 ? "cadet" : "cadets"} · {copy.title}
          </p>
          <Button type="submit" size="lg" loading={submitting && !reviewOpen} data-testid="review-entries">
            {selected.length === 1 ? `Create ${copy.unit}` : "Review"}
          </Button>
        </div>
      </div>

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
          {s.kind === "STATEMENT" && (
            <p>
              <span className="font-medium text-slate-800">Deadline:</span> {s.dueDate} {s.dueTime || "23:59"}
            </p>
          )}
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
