import type { MarkItem } from "./types";

// Turns dictated text like "S10B 50, P22K1 one" or "s ten b fifty" into code/qty items.
// Speech engines return a mix of digits and words, and split codes oddly ("S 10 B"),
// so codes are matched by gluing neighbouring tokens and checking the known code list.

const SMALL: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1000 };
// Letter names a recogniser may spell out.
const LETTER: Record<string, string> = { es: "s", ess: "s", bee: "b", be: "b", see: "c", sea: "c", dee: "d", pee: "p", kay: "k", eh: "a" };
// Words that sit between a code and its quantity and can be skipped.
const FILLER = new Set(["cut", "test", "tested", "verify", "verified", "placed", "place", "of", "qty", "quantity", "pairs", "pair", "feet", "foot", "ft", "each", "x", "times", "and", "is", "at"]);
// Number-ish words that are only numbers when they follow a code ("to"/"for" are usually words).
const AMBIGUOUS = new Set(["to", "too", "for", "oh"]);

/** Collapse runs of number words into digit tokens: "eighteen hundred" -> "1800". */
function numberize(tokens: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  let current = 0;
  let inNum = false;
  const flush = () => {
    if (inNum) out.push(String(total + current));
    total = current = 0;
    inNum = false;
  };
  for (const t of tokens) {
    if (t in SMALL && !(AMBIGUOUS.has(t) && !inNum && !/^[a-z]$/.test(out[out.length - 1] ?? ""))) {
      // A unit after a unit ("one one") starts a new number; "twenty two" continues.
      const v = SMALL[t];
      if (inNum && current % 10 !== 0 && v < 10) flush();
      if (inNum && current >= 10 && current < 20 && v < 100) flush();
      current += v;
      inNum = true;
    } else if (t in SCALE && inNum) {
      if (SCALE[t] === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * 1000;
        current = 0;
      }
    } else {
      flush();
      out.push(t);
    }
  }
  flush();
  return out;
}

export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => LETTER[t] ?? t);
  return numberize(raw);
}

export function parseSpokenCodes(text: string, knownCodes: string[]): MarkItem[] {
  const known = new Map(knownCodes.map((c) => [c.toLowerCase(), c]));
  const toks = tokenize(text);
  const items: MarkItem[] = [];
  let i = 0;
  while (i < toks.length) {
    // Longest run of up to 4 tokens that glues into a known code.
    let match: { code: string; end: number } | null = null;
    let glued = "";
    for (let j = i; j < Math.min(toks.length, i + 4); j++) {
      glued += toks[j];
      const code = known.get(glued);
      if (code) match = { code, end: j + 1 };
    }
    if (!match) {
      i++;
      continue;
    }
    let k = match.end;
    while (k < toks.length && FILLER.has(toks[k])) k++;
    let qty = 1;
    if (k < toks.length && /^\d+$/.test(toks[k])) {
      qty = Number(toks[k]);
      k++;
    }
    const existing = items.find((it) => it.code === match!.code);
    if (existing) existing.qty += qty;
    else items.push({ code: match.code, qty });
    i = k;
  }
  return items;
}
