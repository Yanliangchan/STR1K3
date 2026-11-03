/**
 * Repeat offences: the same cadet doing the same thing more than once, found by
 * keyword matching on what was recorded (plus a shared category), with the next
 * step on the escalation ladder suggested:
 *
 *   IPS -> Statement -> NOR -> CROW -> beyond CROW (refer up)
 *
 * When a cadet has `escalationRepeats` (default 2) at their highest level for
 * the same offence, the next level is suggested. Suggestions are prompts for
 * instructor judgement, never automatic.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { conflict, invalid, notFound, readOnly } from "@/server/errors";
import { id, parse } from "@/server/validation";
import { addDaysISO, dateOnlyISO, parseISODate, todayISO } from "@/lib/dates";
import { commonTerms, createMatcher, typoMap, type Term } from "@/lib/offence-match";
import { getAppConfig } from "./config";

export const LADDER = ["IPS", "STATEMENT", "NOR", "CROW"] as const;
export type LadderKind = (typeof LADDER)[number];
export type Suggestion = { level: number; kind: LadderKind | "BEYOND"; label: string; reason: string };

export const ladderLabel = (level: number, plural = false) =>
  level >= LADDER.length
    ? "action beyond CROW"
    : LADDER[level] === "STATEMENT"
      ? `statement${plural ? "s" : ""}`
      : LADDER[level] === "IPS"
        ? "IPS"
        : `${LADDER[level]}${plural ? "s" : ""}`;

const article = (level: number) => (LADDER[level] === "NOR" ? "an" : "a");
const ladderTitle = (level: number) => (LADDER[level] === "STATEMENT" ? "Statement" : LADDER[level]!);

export type RepeatEntry = {
  key: string; // "R:<id>" | "S:<id>"
  id: string;
  kind: LadderKind;
  date: string;
  text: string;
  punishment: string | null;
};

export type RepeatGroup = {
  id: string;
  cadetId: string;
  cadetName: string;
  byteName: string | null;
  /** Term keys this group matched on (first is the one stored on dismissal). */
  keys: string[];
  /** What the entries share, ready to show: “late”, “eat + lab”, category “Punctuality”. */
  matchedOn: string[];
  entries: RepeatEntry[];
  /** Distinct occurrences (entries linked to one shared occurrence count once). */
  occurrences: number;
  suggestion: Suggestion;
  latest: string;
};

type Entry = RepeatEntry & {
  cadetId: string;
  cadetName: string;
  byteName: string | null;
  unit: string;
  level: number;
  terms: Term[];
};

export async function getRepeatConfig() {
  const [cfg, synonyms] = await Promise.all([getAppConfig(), prisma.synonymGroup.findMany({ orderBy: { createdAt: "asc" } })]);
  return {
    repeats: cfg?.escalationRepeats ?? 2,
    windowDays: cfg?.recurringWindowDays ?? null,
    ignoredWords: cfg?.ignoredWords ?? [],
    synonyms: synonyms.map((s) => ({ id: s.id, terms: s.terms })),
  };
}

function suggest(levels: number[], repeats: number): Suggestion {
  const top = Math.max(...levels);
  const atTop = levels.filter((l) => l === top).length;
  if (atTop >= repeats) {
    const next = top + 1;
    return {
      level: next,
      kind: next >= LADDER.length ? "BEYOND" : LADDER[next]!,
      label: next >= LADDER.length ? "Refer beyond CROW" : `Next: ${ladderTitle(next)}`,
      reason: `${atTop} ${ladderLabel(top, atTop !== 1)} already for this — the ladder steps up to ${next >= LADDER.length ? "action beyond a CROW (e.g. refer to the OC)" : `${article(next)} ${ladderLabel(next)}`}.`,
    };
  }
  return {
    level: top,
    kind: LADDER[top]!,
    label: `Next: ${ladderTitle(top)}`,
    reason: `${atTop} of ${repeats} ${ladderLabel(top, true)} before stepping up to ${top + 1 >= LADDER.length ? "action beyond a CROW" : `${article(top + 1)} ${ladderLabel(top + 1)}`}.`,
  };
}

/** Repeat offences in a batch (optionally one cadet), most serious suggestion first. */
export async function repeatOffences(batchId: string, opts: { cadetId?: string } = {}): Promise<{ groups: RepeatGroup[]; repeats: number }> {
  const cfg = await getRepeatConfig();
  const since = cfg.windowDays ? parseISODate(addDaysISO(todayISO(), -cfg.windowDays + 1)) : undefined;
  // The whole batch is always loaded: typo folding and "common word" detection need batch-wide counts.
  const [records, statements, dismissals] = await Promise.all([
    prisma.record.findMany({
      where: { batchId, status: "ACTIVE", cadet: { status: "ACTIVE" }, ...(since ? { occurredOn: { gte: since } } : {}) },
      select: {
        id: true, type: true, description: true, punishment: true, occurredOn: true, occurrenceId: true, categoryId: true,
        category: { select: { name: true } },
        cadet: { select: { id: true, name: true, byte: { select: { name: true } } } },
      },
    }),
    prisma.statement.findMany({
      where: { batchId, voided: false, cadet: { status: "ACTIVE" }, ...(since ? { issuedOn: { gte: since } } : {}) },
      select: { id: true, title: true, issuedOn: true, occurrenceId: true, cadet: { select: { id: true, name: true, byte: { select: { name: true } } } } },
    }),
    prisma.repeatDismissal.findMany({ where: { batchId, revokedAt: null, ...(opts.cadetId ? { cadetId: opts.cadetId } : {}) } }),
  ]);

  const matcher = createMatcher({ synonyms: cfg.synonyms.map((s) => s.terms), ignored: cfg.ignoredWords });
  const entries: Entry[] = [
    ...records.map((r) => {
      const terms = matcher.terms(r.description);
      if (r.categoryId) terms.push({ key: `cat:${r.categoryId}`, label: `category “${r.category?.name ?? "?"}”` });
      return {
        key: `R:${r.id}`, id: r.id, kind: r.type as LadderKind, level: LADDER.indexOf(r.type as LadderKind),
        date: dateOnlyISO(r.occurredOn), text: r.description, punishment: r.punishment,
        cadetId: r.cadet.id, cadetName: r.cadet.name, byteName: r.cadet.byte?.name ?? null,
        unit: r.occurrenceId ? `O:${r.occurrenceId}` : `R:${r.id}`, terms,
      };
    }),
    ...statements.map((s) => ({
      key: `S:${s.id}`, id: s.id, kind: "STATEMENT" as const, level: 1,
      date: dateOnlyISO(s.issuedOn), text: s.title, punishment: null,
      cadetId: s.cadet.id, cadetName: s.cadet.name, byteName: s.cadet.byte?.name ?? null,
      unit: s.occurrenceId ? `O:${s.occurrenceId}` : `S:${s.id}`, terms: matcher.terms(s.title),
    })),
  ];

  // Batch-wide: fold typos into the common spelling, then find over-common words.
  const count = (list: Entry[]) => {
    const m = new Map<string, number>();
    for (const e of list) for (const t of e.terms) m.set(t.key, (m.get(t.key) ?? 0) + 1);
    return m;
  };
  const typos = typoMap(count(entries));
  const labels = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const seen = new Map<string, Term>();
    for (const t of e.terms) {
      const key = typos.get(t.key) ?? t.key;
      if (!seen.has(key)) seen.set(key, { key, label: t.label });
      if (key === t.key) {
        const l = labels.get(key) ?? new Map<string, number>();
        l.set(t.label, (l.get(t.label) ?? 0) + 1);
        labels.set(key, l);
      }
    }
    e.terms = [...seen.values()];
  }
  const labelOf = (key: string) => [...(labels.get(key)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
  const common = commonTerms(count(entries), entries.length);

  // Candidate match keys per entry: each distinctive term, and pairs of common terms
  // (a common word only counts when a second one matches with it).
  const byCadet = new Map<string, Map<string, Entry[]>>();
  for (const e of entries) {
    if (opts.cadetId && e.cadetId !== opts.cadetId) continue;
    const keys = e.terms.filter((t) => !common.has(t.key)).map((t) => t.key);
    const commons = e.terms.filter((t) => common.has(t.key)).map((t) => t.key).sort();
    for (let i = 0; i < commons.length; i++) for (let j = i + 1; j < commons.length; j++) keys.push(`${commons[i]}+${commons[j]}`);
    const m = byCadet.get(e.cadetId) ?? new Map<string, Entry[]>();
    for (const k of keys) m.set(k, [...(m.get(k) ?? []), e]);
    byCadet.set(e.cadetId, m);
  }

  const dismissedBy = new Map<string, { term: string; keys: Set<string> }[]>();
  for (const d of dismissals) dismissedBy.set(d.cadetId, [...(dismissedBy.get(d.cadetId) ?? []), { term: d.term, keys: new Set(d.entryKeys) }]);

  const groups: RepeatGroup[] = [];
  for (const [cadetId, m] of byCadet) {
    // Keys with 2+ separate occurrences; keys covering the same entries merge into one group.
    const merged = new Map<string, { keys: string[]; list: Entry[] }>();
    for (const [k, list] of m) {
      if (new Set(list.map((e) => e.unit)).size < 2) continue;
      const sig = list.map((e) => e.key).sort().join(",");
      const g = merged.get(sig) ?? { keys: [], list };
      g.keys.push(k);
      merged.set(sig, g);
    }
    const all = [...merged.values()];
    const kept = all.filter((g) => {
      const mine = new Set(g.list.map((e) => e.key));
      // Drop a group whose entries are all inside a bigger group.
      if (all.some((o) => o !== g && o.list.length > g.list.length && g.list.every((e) => o.list.some((x) => x.key === e.key)))) return false;
      const ds = dismissedBy.get(cadetId) ?? [];
      return !ds.some((d) => g.keys.includes(d.term) && [...mine].every((k) => d.keys.has(k)));
    });
    for (const g of kept) {
      // Category matches read best last; distinctive words first.
      g.keys.sort((a, b) => Number(a.startsWith("cat:")) - Number(b.startsWith("cat:")) || a.localeCompare(b));
      const units = new Map<string, number>();
      for (const e of g.list) units.set(e.unit, Math.max(units.get(e.unit) ?? 0, e.level));
      const list = [...g.list].sort((a, b) => a.date.localeCompare(b.date));
      const first = list[0]!;
      const catLabel = (k: string) => g.list.flatMap((e) => e.terms).find((t) => t.key === k)?.label ?? k;
      groups.push({
        id: `${cadetId}|${g.keys[0]}`,
        cadetId,
        cadetName: first.cadetName,
        byteName: first.byteName,
        keys: g.keys,
        matchedOn: g.keys.map((k) =>
          k.startsWith("cat:") ? catLabel(k) : `“${k.startsWith("syn:") ? catLabel(k) : k.split("+").map(labelOf).join(" + ")}”`,
        ),
        entries: list.map(({ key, id, kind, date, text, punishment }) => ({ key, id, kind, date, text, punishment })),
        occurrences: units.size,
        suggestion: suggest([...units.values()], cfg.repeats),
        latest: list.at(-1)!.date,
      });
    }
  }
  groups.sort(
    (a, b) => b.suggestion.level - a.suggestion.level || b.occurrences - a.occurrences || b.latest.localeCompare(a.latest) || a.cadetName.localeCompare(b.cadetName),
  );
  return { groups, repeats: cfg.repeats };
}

// ---------------------------------------------------------------------------
// "Not the same offence"
// ---------------------------------------------------------------------------

const dismissSchema = z.object({
  batchId: id,
  cadetId: id,
  term: z.string().min(1).max(300),
  entryKeys: z.array(z.string().regex(/^[RS]:[\w-]+$/)).min(2).max(200),
});

export async function dismissRepeat(actor: Actor, input: z.input<typeof dismissSchema>) {
  const data = parse(dismissSchema, input);
  const cadet = await prisma.cadet.findFirst({ where: { id: data.cadetId, batchId: data.batchId }, include: { batch: true } });
  if (!cadet) throw notFound("Cadet");
  if (cadet.batch.status !== "OPEN") throw readOnly();
  return prisma.$transaction(async (tx) => {
    const d = await tx.repeatDismissal.create({
      data: { batchId: data.batchId, cadetId: data.cadetId, term: data.term, entryKeys: data.entryKeys, createdById: actor.id },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "repeat.dismissed",
      entityType: "RepeatDismissal",
      entityId: d.id,
      batchId: data.batchId,
      cadetId: data.cadetId,
      summary: `Marked a suggested repeat offence for ${cadet.name} as not the same offence`,
      changes: { term: data.term, entries: data.entryKeys.length },
    });
    return d;
  });
}

export async function undoDismissRepeat(actor: Actor, input: { dismissalId: string }) {
  const data = parse(z.object({ dismissalId: id }), input);
  const d = await prisma.repeatDismissal.findUnique({ where: { id: data.dismissalId }, include: { cadet: true } });
  if (!d) throw notFound("Dismissal");
  if (d.revokedAt) throw conflict("This has already been undone.");
  if (d.createdById !== actor.id) throw invalid("Only the instructor who dismissed it can undo it.");
  return prisma.$transaction(async (tx) => {
    await tx.repeatDismissal.update({ where: { id: d.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "repeat.dismiss_undone",
      entityType: "RepeatDismissal",
      entityId: d.id,
      batchId: d.batchId,
      cadetId: d.cadetId,
      summary: `Undid "not the same offence" for ${d.cadet.name}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Settings: ladder size, ignored words, synonym groups
// ---------------------------------------------------------------------------

const wordList = z
  .string()
  .max(2000)
  .transform((s) => [...new Set(s.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean))]);

export async function updateMatchingConfig(actor: Actor, input: { escalationRepeats: number | string; ignoredWords: string }) {
  const data = parse(z.object({ escalationRepeats: z.coerce.number().int().min(2, "Minimum is 2.").max(10, "Maximum is 10."), ignoredWords: wordList }), input);
  const before = await getRepeatConfig();
  await prisma.$transaction(async (tx) => {
    await tx.appConfig.upsert({
      where: { id: 1 },
      update: { escalationRepeats: data.escalationRepeats, ignoredWords: data.ignoredWords },
      create: { id: 1, escalationRepeats: data.escalationRepeats, ignoredWords: data.ignoredWords },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "settings.matching_updated",
      entityType: "AppConfig",
      summary: "Changed repeat-offence matching",
      changes: {
        escalationRepeats: { from: before.repeats, to: data.escalationRepeats },
        ignoredWords: { from: before.ignoredWords.join(", "), to: data.ignoredWords.join(", ") },
      },
    });
  });
}

export async function saveSynonymGroup(actor: Actor, input: { id?: string | null; terms: string }) {
  const data = parse(
    z.object({
      id: z.string().max(64).optional().nullable(),
      terms: wordList.refine((t) => t.length >= 2, "Enter at least two words or phrases, separated by commas.").refine((t) => t.every((x) => x.length <= 60), "Keep each word or phrase under 60 characters."),
    }),
    input,
  );
  return prisma.$transaction(async (tx) => {
    const before = data.id ? await tx.synonymGroup.findUnique({ where: { id: data.id } }) : null;
    if (data.id && !before) throw notFound("Synonym group");
    const g = before
      ? await tx.synonymGroup.update({ where: { id: before.id }, data: { terms: data.terms } })
      : await tx.synonymGroup.create({ data: { terms: data.terms, createdById: actor.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: before ? "settings.synonyms_updated" : "settings.synonyms_added",
      entityType: "SynonymGroup",
      entityId: g.id,
      summary: `${before ? "Changed" : "Added"} synonyms: ${data.terms.join(" = ")}`,
      changes: { terms: { from: before?.terms.join(", ") ?? null, to: data.terms.join(", ") } },
    });
    return g;
  });
}

export async function deleteSynonymGroup(actor: Actor, input: { id: string }) {
  const data = parse(z.object({ id }), input);
  await prisma.$transaction(async (tx) => {
    const g = await tx.synonymGroup.findUnique({ where: { id: data.id } });
    if (!g) throw notFound("Synonym group");
    await tx.synonymGroup.delete({ where: { id: g.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "settings.synonyms_removed",
      entityType: "SynonymGroup",
      entityId: g.id,
      summary: `Removed synonyms: ${g.terms.join(" = ")}`,
    });
  });
}
