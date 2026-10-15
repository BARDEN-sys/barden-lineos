import { describe, expect, it } from "vitest";
import { SEED_GLOSSARY } from "@/lib/glossary";
import { parseSpokenCodes, tokenize } from "@/lib/voice";

const codes = SEED_GLOSSARY.map((g) => g.code);
const parse = (t: string) => parseSpokenCodes(t, codes);

describe("tokenize", () => {
  it("turns number words into digits", () => {
    expect(tokenize("eighteen hundred")).toEqual(["1800"]);
    expect(tokenize("three thousand six hundred")).toEqual(["3600"]);
    expect(tokenize("twenty five")).toEqual(["25"]);
    expect(tokenize("3,825")).toEqual(["3825"]);
  });
});

describe("parseSpokenCodes", () => {
  it("reads codes the way speech engines usually write them", () => {
    expect(parse("S10B 50")).toEqual([{ code: "S10B", qty: 50 }]);
    expect(parse("S 10 B 3600 and S16A 1800")).toEqual([
      { code: "S10B", qty: 3600 },
      { code: "S16A", qty: 1800 },
    ]);
  });
  it("reads fully spoken codes and numbers", () => {
    expect(parse("s ten b fifty")).toEqual([{ code: "S10B", qty: 50 }]);
    expect(parse("es sixteen a eighteen hundred")).toEqual([{ code: "S16A", qty: 1800 }]);
    expect(parse("p twenty two k one, s ten b one hundred")).toEqual([
      { code: "P22K1", qty: 1 },
      { code: "S10B", qty: 100 },
    ]);
  });
  it("defaults to 1 when no quantity is said, and skips filler words", () => {
    expect(parse("P73A splice pit")).toEqual([{ code: "P73A", qty: 1 }]);
    expect(parse("S10B cut 25 pairs")).toEqual([{ code: "S10B", qty: 25 }]);
    expect(parse("S10B quantity 25 pairs")).toEqual([{ code: "S10B", qty: 25 }]);
  });
  it("ignores codes that are not in the glossary", () => {
    expect(parse("Z99Z 10")).toEqual([]);
  });
});
