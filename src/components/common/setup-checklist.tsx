import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActiveBatch } from "@/server/services/batches";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * First-run guide. Shown until there is an active batch with cadets, so a new
 * instructor never needs to be told where to go.
 */
export async function SetupChecklist() {
  const [batchCount, active, categories] = await Promise.all([prisma.batch.count(), getActiveBatch(), prisma.category.count({ where: { active: true } })]);
  const firstBatch = active ?? (await prisma.batch.findFirst({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } }));
  const cadets = firstBatch ? await prisma.cadet.count({ where: { batchId: firstBatch.id, status: "ACTIVE" } }) : 0;
  if (active && cadets > 0) return null;

  const steps = [
    { done: batchCount > 0, label: "Create a batch", detail: "E.g. “14/26 MDST”, with its bytes.", href: "/batches/new" },
    {
      done: cadets > 0,
      label: "Add cadets",
      detail: "Type them in or import a CSV roster.",
      href: firstBatch ? `/batches/${firstBatch.id}` : "/batches/new",
    },
    { done: !!active, label: "Set it as the active batch", detail: "STR1K3 then always opens straight into it.", href: firstBatch ? `/batches/${firstBatch.id}` : "/batches" },
    { done: categories > 0, label: "Add NOR / CROW categories (optional)", detail: "E.g. Punctuality, Turnout. Makes statistics more useful.", href: "/settings" },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <Card className="p-4" data-testid="setup-checklist">
      <h2 className="text-lg font-semibold text-slate-900">Set up STR1K3</h2>
      <p className="mt-0.5 text-sm text-slate-600">A few steps before you can start recording. Tap the next step.</p>
      <ol className="mt-3 space-y-1">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-lg px-3 py-2",
                i === next ? "bg-navy-800 text-white" : "hover:bg-slate-50",
              )}
            >
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Done" /> : <Circle className={cn("h-5 w-5 shrink-0", i === next ? "text-white" : "text-slate-400")} aria-label="Not done" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block font-medium", s.done && "text-slate-500 line-through")}>{s.label}</span>
                <span className={cn("block text-sm", i === next ? "text-navy-100" : "text-slate-500")}>{s.detail}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
