import { describe, expect, it } from "vitest";
import { commonTerms, createMatcher, stem, typoMap, withinOneEdit } from "@/lib/offence-match";

const keys = (text: string, opts?: Parameters<typeof createMatcher>[0]) => createMatcher(opts).terms(text).map((t) => t.key);

describe("offence keyword matching", () => {
  it("ignores filler words like to, into, and", () => {
    expect(keys("Walked into the lab and talked to the cadet")).toEqual(["walk", "lab", "talk"]);
    expect(keys("to into and the was")).toEqual([]);
  });

  it("matches word forms", () => {
    expect(stem("late")).toBe(stem("lateness"));
    expect(stem("late")).toBe(stem("latecomer"));
    expect(stem("eat")).toBe(stem("eating"));
    expect(stem("eat")).toBe(stem("ate"));
    expect(stem("boots")).toBe(stem("boot"));
    expect(stem("running")).toBe(stem("ran"));
    expect(stem("absence")).toBe(stem("absent"));
    expect(stem("punctuality")).toBe(stem("punctual"));
    expect(stem("tardiness")).toBe(stem("tardy"));
    expect(keys("Eating in lab")).toEqual(keys("ate food in the labs").filter((k) => k !== stem("food")));
  });

  it("drops numbers and times", () => {
    expect(keys("Late for 0600 parade, 5 mins")).toEqual([stem("late"), stem("parade")]);
  });

  it("applies synonym groups, including phrases", () => {
    const opts = { synonyms: [["late", "tardy", "not punctual"], ["phone", "handphone", "hp"]] };
    const a = keys("Was not punctual for lesson", opts);
    const b = keys("Tardy for lesson", opts);
    expect(a).toEqual(b);
    expect(keys("Using HP during lecture", opts)).toEqual(keys("using handphone during lecture", opts));
  });

  it("ignores instructor-chosen words in any form", () => {
    expect(keys("Late for parades", { ignored: ["parade"] })).toEqual([stem("late")]);
  });

  it("folds one-letter typos on longer words into the common spelling", () => {
    expect(withinOneEdit("unifrom", "uniform")).toBe(true);
    expect(withinOneEdit("shout", "short")).toBe(true);
    const counts = new Map([["uniform", 5], ["unifrom", 1], ["shout", 2], ["short", 3]]);
    const map = typoMap(counts);
    expect(map.get("unifrom")).toBe("uniform");
    expect(map.has("shout")).toBe(false); // too short to risk
  });

  it("marks words used across much of the batch as common", () => {
    const df = new Map([["parad", 10], ["lat", 4], ["cat:x", 20]]);
    expect([...commonTerms(df, 20)]).toEqual(["parad"]);
    expect(commonTerms(df, 10).size).toBe(0); // too few entries to judge
  });
});
