"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "+2 days", days: 2 },
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
];

/** Deadline = date + time, with one-tap presets relative to today. */
export function DeadlineInput({
  label = "Deadline",
  today,
  date,
  time,
  onChange,
  error,
  min,
}: {
  label?: string;
  today: string;
  date: string;
  time: string;
  onChange: (v: { date: string; time: string }) => void;
  error?: string;
  min?: string;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800">
        {label} <span className="text-red-700" aria-hidden>*</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick deadline">
        {PRESETS.map((p) => {
          const d = addDays(today, p.days);
          const on = date === d;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ date: d, time: time || "23:59" })}
              className={cn(
                "min-h-10 rounded-full px-3 text-sm font-medium ring-1 ring-inset",
                on ? "bg-primary text-white ring-primary" : "bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <div>
          <label htmlFor={`${id}-d`} className="sr-only">
            {label} date
          </label>
          <input
            id={`${id}-d`}
            type="date"
            value={date}
            min={min}
            onChange={(e) => onChange({ date: e.target.value, time })}
            aria-invalid={error ? true : undefined}
            className="block min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-base focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 aria-[invalid=true]:border-red-600"
          />
        </div>
        <div>
          <label htmlFor={`${id}-t`} className="sr-only">
            {label} time
          </label>
          <input
            id={`${id}-t`}
            type="time"
            value={time}
            onChange={(e) => onChange({ date, time: e.target.value })}
            className="block min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-base focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
        </div>
      </div>
      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
