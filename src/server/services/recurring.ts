import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAppConfig } from "./config";
import { writeAudit } from "@/server/audit";
import { parse } from "@/server/validation";
import { addDaysISO, dateOnlyISO, parseISODate, todayISO } from "@/lib/dates";

export type RecurringFlag = {
  cadetId: string;
  cadetName: string;
  byteName: string | null;
  recordType: "NOR" | "CROW";
  categoryId: string;
  category: string;
  /** Distinct occurrences, counting unlinked records on the same date once. */
  distinctOccurrences: number;
  /** Total qualifying records (may include several documents about one occurrence). */
  recordCount: number;
  /** True when distinct occurrences cannot be determined with confidence. */
  needsManualReview: boolean;
  recordIds: string[];
};

export async function getRecurringConfig() {
  const cfg = await getAppConfig();
  return {
    threshold: cfg?.recurringThreshold ?? 3,
    windowDays: cfg?.recurringWindowDays ?? null,
    flagRecordThreshold: cfg?.flagRecordThreshold ?? 3,
    flagStatementThreshold: cfg?.flagStatementThreshold ?? 3,
  };
}

/**
 * Flag possible recurring issues: the same cadet with several records in the
 * same category. Only NOR/CROW records count — a statement request is never
 * treated as evidence. Records sharing an occurrence reference count once.
 * These flags are prompts for instructor review, not decisions.
 */
export async function recurringFlags(batchId: string, opts?: { cadetId?: string }): Promise<RecurringFlag[]> {
  const { threshold, windowDays } = await getRecurringConfig();
  const since = windowDays ? parseISODate(addDaysISO(todayISO(), -windowDays + 1)) : undefined;
  const records = await prisma.record.findMany({
    where: {
      batchId,
      status: "ACTIVE",
      categoryId: { not: null },
      ...(opts?.cadetId ? { cadetId: opts.cadetId } : {}),
      ...(since ? { occurredOn: { gte: since } } : {}),
    },
    select: {
      id: true,
      type: true,
      occurredOn: true,
      occurrenceId: true,
      categoryId: true,
      category: { select: { name: true } },
      cadet: { select: { id: true, name: true, byte: { select: { name: true } } } },
    },
  });

  const groups = new Map<string, typeof records>();
  for (const r of records) {
    const key = `${r.cadet.id}|${r.categoryId}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const flags: RecurringFlag[] = [];
  for (const list of groups.values()) {
    // Optimistic count: every unlinked record is its own occurrence.
    const upper = new Set(list.map((r) => r.occurrenceId ?? `rec:${r.id}`)).size;
    if (upper < threshold) continue;
    // Conservative count: unlinked records on the same date may be one occurrence.
    const lower = new Set(list.map((r) => r.occurrenceId ?? `date:${dateOnlyISO(r.occurredOn)}`)).size;
    const first = list[0]!;
    flags.push({
      cadetId: first.cadet.id,
      cadetName: first.cadet.name,
      byteName: first.cadet.byte?.name ?? null,
      recordType: first.type,
      categoryId: first.categoryId!,
      category: first.category?.name ?? "Unknown",
      distinctOccurrences: lower,
      recordCount: list.length,
      needsManualReview: lower < threshold,
      recordIds: list.map((r) => r.id),
    });
  }
  return flags.sort((a, b) => Number(a.needsManualReview) - Number(b.needsManualReview) || a.cadetName.localeCompare(b.cadetName));
}

export async function updateRecurringConfig(
  actor: { id: string },
  input: { threshold: number; windowDays: number | null; flagRecordThreshold?: number; flagStatementThreshold?: number },
) {
  const data = parse(
    z.object({
      threshold: z.coerce.number().int().min(2, "Minimum is 2.").max(50),
      windowDays: z.coerce.number().int().min(1).max(3650).nullable(),
      flagRecordThreshold: z.coerce.number().int().min(1, "Minimum is 1.").max(100).optional(),
      flagStatementThreshold: z.coerce.number().int().min(1, "Minimum is 1.").max(100).optional(),
    }),
    input,
  );
  const before = await getRecurringConfig();
  await prisma.$transaction(async (tx) => {
    await tx.appConfig.upsert({
      where: { id: 1 },
      update: {
        recurringThreshold: data.threshold,
        recurringWindowDays: data.windowDays,
        ...(data.flagRecordThreshold ? { flagRecordThreshold: data.flagRecordThreshold } : {}),
        ...(data.flagStatementThreshold ? { flagStatementThreshold: data.flagStatementThreshold } : {}),
      },
      create: { id: 1, recurringThreshold: data.threshold, recurringWindowDays: data.windowDays },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "settings.recurring_updated",
      entityType: "AppConfig",
      summary: "Changed review flag thresholds",
      changes: {
        threshold: { from: before.threshold, to: data.threshold },
        windowDays: { from: before.windowDays, to: data.windowDays },
        flagRecordThreshold: { from: before.flagRecordThreshold, to: data.flagRecordThreshold ?? before.flagRecordThreshold },
        flagStatementThreshold: { from: before.flagStatementThreshold, to: data.flagStatementThreshold ?? before.flagStatementThreshold },
      },
    });
  });
}
