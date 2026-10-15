import type { StatementStatus } from "@prisma/client";
import { AlarmClock, CheckCircle2, CircleDashed, Clock3, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { statementStatusLabel } from "@/lib/labels";

const statusStyle: Record<StatementStatus, { cls: string; Icon: typeof Clock3 }> = {
  NOT_SUBMITTED: { cls: "bg-slate-100 text-slate-700 ring-slate-300", Icon: CircleDashed },
  PENDING_REVIEW: { cls: "bg-sky-50 text-sky-800 ring-sky-200", Icon: Clock3 },
  REWRITE_REQUIRED: { cls: "bg-amber-50 text-amber-900 ring-amber-300", Icon: PenLine },
  ACCEPTED: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", Icon: CheckCircle2 },
};

export function StatusBadge({ status, className }: { status: StatementStatus; className?: string }) {
  const { cls, Icon } = statusStyle[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {statementStatusLabel[status]}
    </span>
  );
}

const typeStyle = {
  NOR: "bg-primary text-white",
  CROW: "bg-crow text-white",
  STATEMENT: "bg-surface text-slate-700 ring-1 ring-inset ring-slate-300",
};

export function TypeBadge({ type, className }: { type: "NOR" | "CROW" | "STATEMENT"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", typeStyle[type], className)}>
      {type === "STATEMENT" ? "Statement" : type}
    </span>
  );
}

export function Badge({ children, tone = "slate", className }: { children: React.ReactNode; tone?: "slate" | "amber" | "red" | "navy" | "green"; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
    navy: "bg-navy-100 text-navy-800",
    green: "bg-emerald-100 text-emerald-800",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-300", className)}>
      <AlarmClock className="h-3.5 w-3.5" aria-hidden />
      Overdue
    </span>
  );
}
