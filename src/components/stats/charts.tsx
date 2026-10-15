"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

// Validated categorical slots (CVD-safe adjacent pairs); single-series charts use navy.
const SERIES = { nor: "#2a78d6", crow: "#eb6834", statements: "#1baf7a" };
const SINGLE = "#2f4a73";
const AXIS = { fontSize: 12, fill: "#52514e" };
const GRID = "#e5e7eb";
const withB = (href: string, b?: string | null) => (b ? `${href}${href.includes("?") ? "&" : "?"}b=${b}` : href);

function ChartCard({
  title,
  summary,
  children,
  table,
  actions,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  actions?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      <p className="mb-3 text-sm text-slate-600">{summary}</p>
      <div aria-hidden className="h-64 w-full">
        {children}
      </div>
      <details className="mt-2 text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-medium text-navy-700">Show data table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {table.head.map((h) => (
                  <th key={h} scope="col" className="py-1.5 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {r.map((c, j) => (
                    <td key={j} className={cn("py-1.5 pr-3", j > 0 && "tabular-nums")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 },
  cursor: { fill: "rgba(47,74,115,0.06)" },
};

function SimpleBars({
  data,
  onSelect,
}: {
  data: { label: string; value: number; href?: string }[];
  onSelect?: (href: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={120} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Count"]} />
        <Bar isAnimationActive={false}
          dataKey="value"
          fill={SINGLE}
          radius={[0, 4, 4, 0]}
          maxBarSize={28}
          label={{ position: "right", fontSize: 12, fill: "#0b0b0b" }}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(d: { href?: string }) => d.href && onSelect?.(d.href)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data, b }: { data: { nor: number; crow: number; statements: number }; b?: string | null }) {
  const router = useRouter();
  const rows = [
    { label: "NOR", value: data.nor, href: "/records?type=NOR" },
    { label: "CROW", value: data.crow, href: "/records?type=CROW" },
    { label: "Statement requests", value: data.statements, href: "/statements?status=ALL" },
  ];
  return (
    <ChartCard
      title="Record distribution"
      summary={`${data.nor} NORs and ${data.crow} CROWs recorded. ${data.statements} statement requests are tracked separately — a request is not a disciplinary record.`}
      table={{ head: ["Type", "Count"], rows: rows.map((r) => [r.label, r.value]) }}
    >
      <SimpleBars data={rows} onSelect={(h) => router.push(withB(h, b))} />
    </ChartCard>
  );
}

export function StatusChart({ data, b }: { data: { label: string; value: number; status: string }[]; b?: string | null }) {
  const router = useRouter();
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <ChartCard
      title="Statement status"
      summary={total === 0 ? "No statements in this view." : data.map((d) => `${d.label}: ${d.value}`).join(" · ")}
      table={{ head: ["Status", "Statements"], rows: data.map((d) => [d.label, d.value]) }}
    >
      <SimpleBars data={data.map((d) => ({ ...d, href: `/statements?status=${d.status}` }))} onSelect={(h) => router.push(withB(h, b))} />
    </ChartCard>
  );
}

export function ByteChart({ data, b }: { data: { byteId: string | null; byte: string; nor: number; crow: number }[]; b?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"both" | "nor" | "crow">("both");
  const series = mode === "both" ? (["nor", "crow"] as const) : ([mode] as const);
  return (
    <ChartCard
      title="Records by byte"
      summary={data.length ? data.map((d) => `${d.byte}: ${d.nor} NOR, ${d.crow} CROW`).join(" · ") : "No bytes in this batch."}
      table={{ head: ["Byte", "NOR", "CROW"], rows: data.map((d) => [d.byte, d.nor, d.crow]) }}
      actions={
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="group" aria-label="Record type">
          {(["both", "nor", "crow"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn("min-h-9 rounded-md px-3", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
            >
              {m === "both" ? "Both" : m.toUpperCase()}
            </button>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 4 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="byte" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((k) => (
            <Bar isAnimationActive={false}
              key={k}
              dataKey={k}
              name={k.toUpperCase()}
              fill={SERIES[k]}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              cursor="pointer"
              onClick={(d: { byteId?: string | null }) => router.push(withB(`/cadets?byte=${d.byteId ?? "none"}&filter=${k}`, b))}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryChart({ data, b }: { data: { type: string; category: string; categoryId: string | null; count: number }[]; b?: string | null }) {
  const router = useRouter();
  const rows = data.slice(0, 10).map((d) => ({
    label: `${d.type} · ${d.category}`,
    value: d.count,
    href: `/records?type=${d.type}&category=${d.categoryId ?? "none"}`,
  }));
  return (
    <ChartCard
      title="Record categories"
      summary={data.length ? `Most frequent: ${rows.slice(0, 3).map((r) => `${r.label} (${r.value})`).join(", ")}.` : "No NOR or CROW records in this view."}
      table={{ head: ["Category", "Records"], rows: data.map((d) => [`${d.type} · ${d.category}`, d.count]) }}
    >
      <SimpleBars data={rows} onSelect={(h) => router.push(withB(h, b))} />
    </ChartCard>
  );
}

export function ActivityChart({
  data,
  granularity,
}: {
  data: { date: string; nor: number; crow: number; statements: number }[];
  granularity: "day" | "week";
}) {
  const totals = data.reduce((a, d) => ({ nor: a.nor + d.nor, crow: a.crow + d.crow, statements: a.statements + d.statements }), { nor: 0, crow: 0, statements: 0 });
  return (
    <ChartCard
      title="Record activity over time"
      summary={`Per ${granularity}, by date of occurrence / request. Totals in range: ${totals.nor} NOR, ${totals.crow} CROW, ${totals.statements} statement requests.`}
      table={{ head: [granularity === "week" ? "Week starting" : "Date", "NOR", "CROW", "Statements"], rows: data.map((d) => [d.date, d.nor, d.crow, d.statements]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle.contentStyle} cursor={{ stroke: "#94a3b8" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line isAnimationActive={false} type="linear" dataKey="nor" name="NOR" stroke={SERIES.nor} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line isAnimationActive={false} type="linear" dataKey="crow" name="CROW" stroke={SERIES.crow} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line isAnimationActive={false} type="linear" dataKey="statements" name="Statements" stroke={SERIES.statements} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function OutstandingChart({ data }: { data: { date: string; outstanding: number }[] }) {
  const last = data[data.length - 1];
  const peak = data.reduce((m, d) => Math.max(m, d.outstanding), 0);
  return (
    <ChartCard
      title="Outstanding statements over time"
      summary={`Reconstructed from recorded status changes. ${last ? `${last.outstanding} outstanding at ${last.date}` : ""}; peak ${peak}.`}
      table={{ head: ["Date", "Outstanding"], rows: data.map((d) => [d.date, d.outstanding]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle.contentStyle} cursor={{ stroke: "#94a3b8" }} formatter={(v: number) => [v, "Outstanding"]} />
          <Area isAnimationActive={false} type="stepAfter" dataKey="outstanding" stroke={SINGLE} strokeWidth={2} fill={SINGLE} fillOpacity={0.12} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
