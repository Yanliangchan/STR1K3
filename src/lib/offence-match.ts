/**
 * Keyword matching for repeat offences — no AI, fully explainable.
 *
 * A description is reduced to "terms":
 *   1. lower-case words, punctuation removed
 *   2. each word reduced to a stem so word forms match (late / lateness / latecomer,
 *      eat / eating / ate, boot / boots)
 *   3. instructor-defined synonym groups (incl. phrases like "not punctual") map to one term
 *   4. filler words (to, into, and, the, cadet, was…) and instructor-ignored words are dropped
 * Batch-level helpers then fold 1-letter typos into the common spelling and
 * mark words used across a large share of the batch as "common" (they only
 * count when two of them match together).
 */

const STOPWORDS = new Set(
  `a about above across after afterwards again against all almost along already also although always am among an and another any anyone
  anything anyway anywhere are around as at back be became because become been before being below beside besides between both but by
  can cannot could did do does doing done down due during each either else enough etc even ever every few for from further get gets
  got had has have having he her here hers herself him himself his how however i if in inside instead into is it its itself just last
  least less made many may me might more most mostly much must my myself near neither never no nobody none nor not nothing now of off
  often on once one only onto or other others otherwise our ours out over own per perhaps please quite rather really same several
  shall she should since so some somehow someone something sometimes still such than that the their theirs them themselves then
  there these they this those though through throughout thus to together too toward towards under until up upon us very via was
  we well were what whatever when whenever where whether which while who whoever whole whom whose why will with within without would
  yet you your yours yourself
  cadet cadets cdt instructor instructors sir maam mam officer was were found seen observed noted caught reported spotted
  today yesterday tomorrow tonight hrs hr hours hour min mins minutes minute day days week weeks time times am pm
  again twice once first second third repeated repeatedly also another other`.split(/\s+/).filter(Boolean),
);

/** Short words that still carry meaning. */
const KEEP_SHORT = new Set(["pt", "hp", "ic"]);

/** Irregular forms mapped to their base word (then stemmed like any other). */
const IRREGULAR: Record<string, string> = {
  ate: "eat", eaten: "eat", slept: "sleep", woke: "wake", woken: "wake", forgot: "forget", forgotten: "forget",
  ran: "run", spoke: "speak", spoken: "speak", broke: "break", broken: "break", lost: "lose", wore: "wear", worn: "wear",
  stole: "steal", stolen: "steal", fought: "fight", brought: "bring", took: "take", taken: "take", went: "go", gone: "go",
  came: "come", hid: "hide", hidden: "hide", threw: "throw", thrown: "throw", drank: "drink", drunk: "drink", sat: "sit",
  fell: "fall", fallen: "fall", caught: "catch", bought: "buy", kept: "keep", swore: "swear", sworn: "swear",
  shouted: "shout", latecomer: "late", latecomers: "late", lateness: "late", tardiness: "tardy",
};

const SUFFIXES: [string, string?][] = [
  ["iness", "y"], ["ily", "y"], ["ies", "y"], ["ied", "y"], ["ness"], ["ingly"], ["edly"], ["ment"], ["fully"], ["ful"],
  ["ality", "al"], ["ence", "ent"], ["ance", "ant"], ["ing"], ["ly"], ["ed"],
];

function isConsonant(c: string | undefined) {
  return !!c && /[b-df-hj-np-tv-z]/.test(c);
}

/** A light, predictable English stemmer. Both sides of a comparison go through it, so consistency matters more than correctness. */
export function stem(word: string): string {
  let w = IRREGULAR[word] ?? word;
  if (w.length <= 3) return w;
  const strip = (suffix: string, repl = "") => {
    if (w.endsWith(suffix) && w.length - suffix.length + repl.length >= 3) {
      w = w.slice(0, -suffix.length) + repl;
      return true;
    }
    return false;
  };
  // Order matters: longest / most specific suffixes first; only the first that applies is removed.
  const stripped = SUFFIXES.some(([suffix, repl]) => strip(suffix, repl));
  if (!stripped) {
    if (/(ss|x|z|ch|sh)es$/.test(w)) strip("es");
    else if (!/(ss|us|is)$/.test(w)) strip("s");
  }
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  // running -> runn -> run, stopped -> stopp -> stop
  if (w.length > 3 && w.at(-1) === w.at(-2) && isConsonant(w.at(-1))) w = w.slice(0, -1);
  return w;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isNoise(raw: string, ignored: Set<string>) {
  if (/^\d/.test(raw)) return true; // numbers, "0600hrs"
  if (raw.length < 3 && !KEEP_SHORT.has(raw)) return true;
  return STOPWORDS.has(raw) || ignored.has(raw) || ignored.has(stem(raw));
}

export type MatcherOptions = {
  /** Each group: words or short phrases that mean the same thing. The first is used as the label. */
  synonyms?: string[][];
  /** Extra words to ignore. */
  ignored?: string[];
};

export type Term = { key: string; label: string };

export type Matcher = {
  /** Terms found in a piece of text, de-duplicated. */
  terms(text: string): Term[];
};

export function createMatcher(opts: MatcherOptions = {}): Matcher {
  const ignored = new Set<string>();
  for (const w of opts.ignored ?? []) for (const t of words(w)) ignored.add(t).add(stem(t));

  // Phrase (as stems joined by spaces) -> synonym term.
  const phrases = new Map<string, Term>();
  let longest = 1;
  for (const group of opts.synonyms ?? []) {
    const clean = group.map((g) => g.trim()).filter(Boolean);
    if (clean.length < 2) continue;
    const term: Term = { key: `syn:${words(clean[0]!).map(stem).join(" ")}`, label: clean[0]! };
    for (const g of clean) {
      const seq = words(g).map(stem);
      if (!seq.length) continue;
      phrases.set(seq.join(" "), term);
      longest = Math.max(longest, seq.length);
    }
  }

  return {
    terms(text) {
      const raw = words(text);
      const stems = raw.map(stem);
      const out = new Map<string, Term>();
      for (let i = 0; i < raw.length; ) {
        let matched = 0;
        // Longest synonym phrase first, so "not punctual" wins over "punctual".
        for (let n = Math.min(longest, raw.length - i); n >= 1 && !matched; n--) {
          const hit = phrases.get(stems.slice(i, i + n).join(" "));
          if (hit && !(n === 1 && isNoise(raw[i]!, ignored))) {
            out.set(hit.key, hit);
            matched = n;
          }
        }
        if (matched) {
          i += matched;
          continue;
        }
        const w = raw[i]!;
        if (!isNoise(w, ignored)) {
          const key = stems[i]!;
          if (!out.has(key)) out.set(key, { key, label: w });
        }
        i++;
      }
      return [...out.values()];
    },
  };
}

/** True when a and b differ by one insertion, deletion, substitution or swap of adjacent letters. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Minimum word length for typo folding: shorter words are too often different real words (shout / short). */
export const TYPO_MIN_LENGTH = 6;

/**
 * Fold rare misspellings into the more common spelling used in the batch,
 * e.g. "unifrom" -> "uniform". Returns a map of term key -> replacement key.
 */
export function typoMap(counts: Map<string, number>): Map<string, string> {
  const keys = [...counts.keys()].filter((k) => !k.includes(":") && k.length >= TYPO_MIN_LENGTH);
  // Most frequent first; ties broken alphabetically so the result is stable.
  keys.sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const map = new Map<string, string>();
  for (let i = 0; i < keys.length; i++) {
    const src = keys[i]!;
    for (let j = 0; j < i; j++) {
      const target = keys[j]!;
      if (map.has(target)) continue;
      if (withinOneEdit(src, target)) {
        map.set(src, target);
        break;
      }
    }
  }
  return map;
}

/** Over-common words: used in at least this share of a batch's entries… */
export const COMMON_SHARE = 0.3;
/** …once the batch has enough entries for the share to mean something. */
export const COMMON_MIN_ENTRIES = 15;

/** Terms used in so many of the batch's entries that on their own they don't identify an offence. */
export function commonTerms(docFreq: Map<string, number>, totalEntries: number): Set<string> {
  const out = new Set<string>();
  if (totalEntries < COMMON_MIN_ENTRIES) return out;
  for (const [k, n] of docFreq) if (!k.startsWith("cat:") && n / totalEntries >= COMMON_SHARE) out.add(k);
  return out;
}
