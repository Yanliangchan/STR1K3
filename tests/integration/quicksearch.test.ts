import { beforeEach, describe, expect, it } from "vitest";
import { createEntries } from "@/server/services/entries";
import { quickSearch, recentDescriptions } from "@/server/services/quicksearch";
import { key, makeBatch, makeUser, resetDb, today } from "../helpers";

describe("quick search", () => {
  beforeEach(resetDb);

  it("finds cadets by name/byte words within the batch only, with outstanding counts", async () => {
    const u = await makeUser();
    const a = await makeBatch(u, { name: "A", cadets: 3 });
    const b = await makeBatch(u, { name: "B", cadets: 3 });
    await createEntries(u, { idempotencyKey: key(), batchId: a.batch.id, kind: "STATEMENT", cadetIds: [a.cadets[0]!.id], date: today(), dueDate: "2099-01-01", description: "Pantry" });
    const res = await quickSearch(a.batch.id, "cadet 01");
    expect(res.cadets.map((c) => c.id)).toEqual([a.cadets[0]!.id]);
    expect(res.cadets[0]!.outstanding).toBe(1);
    expect((await quickSearch(a.batch.id, "byte 2")).cadets.every((c) => c.byteName === "Byte 2")).toBe(true);
    expect((await quickSearch(a.batch.id, "pantry")).statements).toHaveLength(1);
    expect((await quickSearch(b.batch.id, "pantry")).statements).toHaveLength(0);
    expect(await quickSearch(a.batch.id, "  ")).toEqual({ cadets: [], statements: [], records: [] });
  });

  it("offers the most used recent descriptions per type", async () => {
    const u = await makeUser();
    const { batch, cadets } = await makeBatch(u, { cadets: 3 });
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: cadets.map((c) => c.id), date: today(), description: "Late for muster" });
    await createEntries(u, { idempotencyKey: key(), batchId: batch.id, kind: "NOR", cadetIds: [cadets[0]!.id], date: today(), description: "Untidy bunk" });
    const r = await recentDescriptions(batch.id);
    expect(r.NOR.map((x) => x.description)).toEqual(["Late for muster", "Untidy bunk"]);
    expect(r.CROW).toEqual([]);
  });
});
