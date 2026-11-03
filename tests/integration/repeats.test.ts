import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEntries, type CreateEntriesInput } from "@/server/services/entries";
import { correctRecord } from "@/server/services/records";
import { createCategory } from "@/server/services/categories";
import { flaggedCadets } from "@/server/services/dashboard";
import { dismissRepeat, repeatOffences, saveSynonymGroup, undoDismissRepeat, updateMatchingConfig } from "@/server/services/repeats";
import type { Actor } from "@/server/actor";
import { key, makeBatch, makeUser, resetDb } from "../helpers";

type Kind = CreateEntriesInput["kind"];

function give(u: Actor, batchId: string, cadetId: string, kind: Kind, description: string, date = "2026-10-01", extra: Partial<CreateEntriesInput> = {}) {
  return createEntries(u, {
    idempotencyKey: key(),
    batchId,
    kind,
    cadetIds: [cadetId],
    date,
    description,
    ...(kind === "IPS" ? { punishment: "20 push-ups" } : {}),
    ...(kind === "STATEMENT" ? { dueDate: "2099-01-01" } : {}),
    ...extra,
  });
}

describe("IPS records", () => {
  beforeEach(resetDb);

  it("requires the punishment given, and keeps it through corrections", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const c = cadets[0]!;
    await expect(createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "IPS", cadetIds: [c.id], date: "2026-10-01", description: "Late" })).rejects.toMatchObject({
      fieldErrors: { punishment: "Enter the punishment given." },
    });
    const res = await give(u, batch.id, c.id, "IPS", "Late for parade");
    const rec = await prisma.record.findUniqueOrThrow({ where: { id: res.created[0]!.id } });
    expect(rec).toMatchObject({ type: "IPS", punishment: "20 push-ups" });

    await correctRecord(u, { recordId: rec.id, date: "2026-10-01", description: "Late for parade", punishment: "Extra guard duty", reason: "Wrong punishment noted" });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: rec.id, action: "record.corrected" } });
    expect(audit.changes).toMatchObject({ punishment: { from: "20 push-ups", to: "Extra guard duty" } });
    await expect(correctRecord(u, { recordId: rec.id, date: "2026-10-01", description: "x", punishment: "", reason: "test" })).rejects.toThrow(/punishment/);
  });

  it("the database refuses an IPS without a punishment, or a punishment on a NOR", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const base = { batchId: batch.id, cadetId: cadets[0]!.id, description: "x", occurredOn: new Date("2026-10-01"), createdById: u.id };
    await expect(prisma.record.create({ data: { ...base, type: "IPS" } })).rejects.toThrow();
    await expect(prisma.record.create({ data: { ...base, type: "NOR", punishment: "push-ups" } })).rejects.toThrow();
  });

  it("IPS has its own review-flag threshold, separate from NOR/CROW", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const c = cadets[0]!;
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) await give(u, batch.id, c.id, "IPS", `Thing ${d}`, d);
    const res = await flaggedCadets(batch.id);
    expect(res.cadets[0]!.reasons).toEqual(["3 separate IPS given"]); // not counted as NOR/CROW occurrences
  });
});

describe("repeat offences", () => {
  beforeEach(resetDb);

  it("follows the ladder: 2 IPS → statement, 2 statements → NOR, 2 NOR → CROW, 2 CROW → beyond", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 4 });
    const [peter, john, mary, sam] = cadets as [(typeof cadets)[0], (typeof cadets)[0], (typeof cadets)[0], (typeof cadets)[0]];
    await give(u, batch.id, peter.id, "IPS", "Late for parade", "2026-10-01");
    await give(u, batch.id, peter.id, "IPS", "Lateness to lesson", "2026-10-03");
    await give(u, batch.id, john.id, "STATEMENT", "Eating in lab", "2026-10-01");
    await give(u, batch.id, john.id, "STATEMENT", "Caught eating food in the lab again", "2026-10-04");
    await give(u, batch.id, mary.id, "NOR", "Uniform not ironed", "2026-10-01");
    await give(u, batch.id, mary.id, "NOR", "Unironed uniform at inspection", "2026-10-02");
    await give(u, batch.id, sam.id, "CROW", "Insubordination to platoon sergeant", "2026-10-01");
    await give(u, batch.id, sam.id, "CROW", "Insubordination again", "2026-10-02");

    const { groups } = await repeatOffences(batch.id);
    const by = (id: string) => groups.find((g) => g.cadetId === id)!;
    expect(by(peter.id)).toMatchObject({ occurrences: 2, matchedOn: ["“late”"], suggestion: { kind: "STATEMENT" } });
    expect(by(john.id).suggestion.kind).toBe("NOR");
    expect(by(john.id).matchedOn).toEqual(expect.arrayContaining(["“eating”", "“lab”"]));
    expect(by(mary.id).suggestion.kind).toBe("CROW");
    expect(by(sam.id).suggestion).toMatchObject({ kind: "BEYOND", label: "Refer beyond CROW" });
    // Most serious suggestion first.
    expect(groups[0]!.cadetId).toBe(sam.id);
  });

  it("mixed levels: suggests staying at the highest level until it repeats", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const c = cadets[0]!;
    await give(u, batch.id, c.id, "IPS", "Late for parade", "2026-10-01");
    await give(u, batch.id, c.id, "STATEMENT", "Late again", "2026-10-02");
    const { groups } = await repeatOffences(batch.id);
    expect(groups[0]!.suggestion).toMatchObject({ kind: "STATEMENT", reason: expect.stringContaining("1 of 2 statements") });
  });

  it("does not match on filler words, and counts a shared occurrence once", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 2 });
    const [a, b] = cadets as [(typeof cadets)[0], (typeof cadets)[0]];
    await give(u, batch.id, a.id, "IPS", "Walked into the office", "2026-10-01");
    await give(u, batch.id, a.id, "IPS", "Talked to the cadet and laughed", "2026-10-02");
    // A NOR and a statement about one shared occurrence are one offence, not a repeat.
    const nor = await give(u, batch.id, b.id, "NOR", "Damaged rifle", "2026-10-01", { occurrence: { mode: "new" } });
    await give(u, batch.id, b.id, "STATEMENT", "Damaged rifle", "2026-10-01", { occurrence: { mode: "existing", occurrenceId: nor.occurrenceId! } });
    expect((await repeatOffences(batch.id)).groups).toEqual([]);
  });

  it("a statement and a NOR for the same incident (same wording, unlinked) are one offence", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 2 });
    const [a, b] = cadets as [(typeof cadets)[0], (typeof cadets)[0]];
    const text = "Taking out Orca shirt right outside of SAFTI MI Side Gate";
    await give(u, batch.id, a.id, "STATEMENT", text, "2026-10-14");
    await give(u, batch.id, a.id, "NOR", text, "2026-10-16");
    expect((await repeatOffences(batch.id)).groups).toEqual([]);

    // The same wording on separate days, at the same level, is a genuine repeat.
    await give(u, batch.id, b.id, "IPS", "Late for parade", "2026-10-01");
    await give(u, batch.id, b.id, "IPS", "Late for parade", "2026-10-09");
    const { groups } = await repeatOffences(batch.id);
    expect(groups.map((g) => g.cadetId)).toEqual([b.id]);

    // …and a later incident joins the merged one as a second offence.
    await give(u, batch.id, a.id, "IPS", "Orca shirt worn outside the gate", "2026-10-25");
    const again = (await repeatOffences(batch.id, { cadetId: a.id })).groups[0]!;
    expect(again.occurrences).toBe(2);
    expect(again.entries).toHaveLength(3);
    expect(again.suggestion.kind).toBe("NOR"); // highest level so far is one NOR
  });

  it("matches on a shared category even with different wording", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const cat = await createCategory(u, { recordType: "NOR", name: "Turnout" });
    await give(u, batch.id, cadets[0]!.id, "NOR", "Hair too long", "2026-10-01", { categoryId: cat.id });
    await give(u, batch.id, cadets[0]!.id, "NOR", "Unshaven", "2026-10-02", { categoryId: cat.id });
    const { groups } = await repeatOffences(batch.id);
    expect(groups[0]!.matchedOn).toEqual(["category “Turnout”"]);
  });

  it("uses synonyms and ignored words from settings", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 2 });
    const [a, b] = cadets as [(typeof cadets)[0], (typeof cadets)[0]];
    await give(u, batch.id, a.id, "IPS", "Using handphone in class", "2026-10-01");
    await give(u, batch.id, a.id, "IPS", "Mobile out during briefing", "2026-10-02");
    await give(u, batch.id, b.id, "IPS", "Late for parade", "2026-10-01");
    await give(u, batch.id, b.id, "IPS", "Dirty boots at parade", "2026-10-02");
    expect((await repeatOffences(batch.id)).groups.map((g) => g.cadetId)).toEqual([b.id]); // matched on "parade" only

    await saveSynonymGroup(u, { terms: "phone, handphone, mobile" });
    await updateMatchingConfig(u, { escalationRepeats: 2, ignoredWords: "parade" });
    const { groups } = await repeatOffences(batch.id);
    expect(groups.map((g) => g.cadetId)).toEqual([a.id]);
    expect(groups[0]!.matchedOn).toEqual(["“phone”"]);
  });

  it("over-common words only count in pairs", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 16 });
    const [peter, ...rest] = cadets;
    for (const c of rest) await give(u, batch.id, c.id, "IPS", `Slow at parade ${c.name}`); // "parade" in 15+ entries
    await give(u, batch.id, peter!.id, "IPS", "Dirty boots at parade", "2026-10-01");
    await give(u, batch.id, peter!.id, "IPS", "Talking during parade", "2026-10-02");
    expect((await repeatOffences(batch.id, { cadetId: peter!.id })).groups).toEqual([]);
  });

  it("'not the same offence' hides a suggestion until a new matching entry, and can be undone", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    const c = cadets[0]!;
    await give(u, batch.id, c.id, "IPS", "Late for parade", "2026-10-01");
    await give(u, batch.id, c.id, "IPS", "Late for lesson", "2026-10-02");
    const [g] = (await repeatOffences(batch.id)).groups;
    const d = await dismissRepeat(u, { batchId: batch.id, cadetId: c.id, term: g!.keys[0]!, entryKeys: g!.entries.map((e) => e.key) });
    expect((await repeatOffences(batch.id)).groups).toEqual([]);

    await undoDismissRepeat(u, { dismissalId: d.id });
    expect((await repeatOffences(batch.id)).groups).toHaveLength(1);

    await dismissRepeat(u, { batchId: batch.id, cadetId: c.id, term: g!.keys[0]!, entryKeys: g!.entries.map((e) => e.key) });
    await give(u, batch.id, c.id, "IPS", "Late for meal", "2026-10-05");
    expect((await repeatOffences(batch.id)).groups[0]!.occurrences).toBe(3);
    expect(await prisma.auditEvent.count({ where: { action: { startsWith: "repeat." } } })).toBe(3);
  });

  it("the ladder size is configurable", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 1 });
    await give(u, batch.id, cadets[0]!.id, "IPS", "Late", "2026-10-01");
    await give(u, batch.id, cadets[0]!.id, "IPS", "Late", "2026-10-02");
    await updateMatchingConfig(u, { escalationRepeats: 3, ignoredWords: "" });
    expect((await repeatOffences(batch.id)).groups[0]!.suggestion.kind).toBe("IPS");
    await expect(updateMatchingConfig(u, { escalationRepeats: 1, ignoredWords: "" })).rejects.toMatchObject({ fieldErrors: { escalationRepeats: "Minimum is 2." } });
  });
});
