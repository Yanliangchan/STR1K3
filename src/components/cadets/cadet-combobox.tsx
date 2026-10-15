"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn, pluralize } from "@/lib/utils";

export type PickCadet = { id: string; name: string; byteName: string | null };

/** Case-insensitive match where every typed word must appear in the name or byte. */
function matches(c: PickCadet, q: string) {
  const hay = `${c.name} ${c.byteName ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

function Highlight({ text, q }: { text: string; q: string }) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const t of tokens) {
    let i = lower.indexOf(t);
    while (i >= 0) {
      for (let j = i; j < i + t.length; j++) marks[j] = true;
      i = lower.indexOf(t, i + t.length);
    }
  }
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const m = marks[i];
    let j = i;
    while (j < text.length && marks[j] === m) j++;
    out.push(m ? <strong key={i} className="font-semibold text-navy-900">{text.slice(i, j)}</strong> : text.slice(i, j));
    i = j;
  }
  return <>{out}</>;
}

/**
 * Type-ahead multi-select for cadets. Type part of a name (or byte), pick with
 * tap / arrow keys + Enter. The list stays open so several cadets can be added
 * quickly. Backspace on an empty box removes the last chip.
 */
export function CadetCombobox({
  roster,
  selected,
  onChange,
  error,
  autoFocus,
}: {
  roster: PickCadet[];
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const set = useMemo(() => new Set(selected), [selected]);
  const byId = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const chosen = selected.map((x) => byId.get(x)).filter((c): c is PickCadet => !!c);

  const results = useMemo(() => (q.trim() ? roster.filter((c) => matches(c, q)) : roster), [roster, q]);
  const unselectedResults = results.filter((c) => !set.has(c.id));
  const showAddAll = q.trim() !== "" && unselectedResults.length > 1;
  // Option list: cadets, then an optional "add all" row at the end (so Enter
  // on a typed name never adds every match by accident).
  const optionCount = results.length + (showAddAll ? 1 : 0);
  const addAllIndex = results.length;

  const bytes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of roster) if (c.byteName) m.set(c.byteName, (m.get(c.byteName) ?? 0) + 1);
    return [...m.entries()];
  }, [roster]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const emit = (ids: Set<string>) => onChange(roster.filter((c) => ids.has(c.id)).map((c) => c.id));
  function toggle(cid: string) {
    const n = new Set(set);
    if (n.has(cid)) n.delete(cid);
    else n.add(cid);
    emit(n);
    // After picking a typed match, close the list so the form underneath is
    // usable; typing again reopens it. When browsing the full list, stay open.
    if (q.trim()) setOpen(false);
    setQ("");
    inputRef.current?.focus();
  }
  function addMany(ids: string[]) {
    const n = new Set(set);
    ids.forEach((x) => n.add(x));
    emit(n);
    setQ("");
    setOpen(false);
  }
  function choose(index: number) {
    if (showAddAll && index === addAllIndex) return addMany(unselectedResults.map((c) => c.id));
    const c = results[index];
    if (c) toggle(c.id);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && optionCount > 0) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && q === "" && chosen.length) {
      emit(new Set(selected.slice(0, -1)));
    }
  }

  return (
    <div ref={wrapRef} className="space-y-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul className="contents" data-testid="selected-cadets" aria-label="Selected cadets">
            {chosen.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm text-navy-900 ring-1 ring-inset ring-navy-100">
                <span>
                  {c.name}
                  {c.byteName && <span className="text-navy-600"> · {c.byteName}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-navy-100"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {chosen.length > 1 && (
            <button type="button" className="min-h-8 px-1 text-sm text-slate-600 underline" onClick={() => emit(new Set())}>
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && optionCount ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-label="Type a cadet's name to add them"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={q}
          placeholder={chosen.length ? "Add another cadet…" : "Type a name or byte…"}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "block min-h-12 w-full rounded-lg border bg-surface pl-10 pr-10 text-base text-slate-900 placeholder:text-slate-400",
            "focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200",
            error ? "border-red-600" : "border-slate-300",
          )}
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Matching cadets"
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-[min(50dvh,22rem)] overflow-y-auto rounded-xl border border-slate-200 bg-surface py-1 shadow-lg"
          >
            {results.map((c, i) => {
              const idx = i;
              const isSel = set.has(c.id);
              return (
                <li
                  key={c.id}
                  id={`${id}-opt-${idx}`}
                  role="option"
                  aria-selected={isSel}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(idx)}
                  onMouseEnter={() => setActive(idx)}
                  className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-3 text-sm", active === idx && "bg-navy-50")}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", isSel ? "border-primary bg-primary text-white" : "border-slate-400")}>
                    {isSel && <Check className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <span className="flex-1 text-slate-900">
                    <Highlight text={c.name} q={q} />
                  </span>
                  <span className="text-xs text-slate-500">{c.byteName ?? "No byte"}</span>
                </li>
              );
            })}
            {showAddAll && (
              <li
                id={`${id}-opt-${addAllIndex}`}
                role="option"
                aria-selected={false}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(addAllIndex)}
                onMouseEnter={() => setActive(addAllIndex)}
                className={cn("flex min-h-12 cursor-pointer items-center gap-3 border-t border-slate-100 px-3 text-sm font-medium text-navy-800", active === addAllIndex && "bg-navy-50")}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add all {unselectedResults.length} matches
              </li>
            )}
            {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">No cadet matches “{q}”.</li>}
            <li role="presentation" className="sticky bottom-0 border-t border-slate-100 bg-surface p-2">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  inputRef.current?.blur();
                }}
                className="min-h-11 w-full rounded-lg bg-primary text-sm font-medium text-white"
              >
                Done{chosen.length ? ` · ${chosen.length} selected` : ""}
              </button>
            </li>
          </ul>
        )}
      </div>

      {bytes.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Add a whole byte">
          {bytes.map(([name, n]) => {
            const ids = roster.filter((c) => c.byteName === name).map((c) => c.id);
            const all = ids.every((x) => set.has(x));
            return (
              <button
                key={name}
                type="button"
                disabled={all}
                onClick={() => addMany(ids)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> {name} ({n})
              </button>
            );
          })}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {pluralize(chosen.length, "cadet")} selected
      </p>
    </div>
  );
}
