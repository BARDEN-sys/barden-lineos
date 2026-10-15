import { describe, expect, it } from "vitest";
import { allocate, allocateCode, checkOverride, largestRemainder, splitAcrossMarks } from "@/lib/allocation";
import { SEED_GLOSSARY } from "@/lib/glossary";
import type { GlossaryEntry, Mark, MasterItem, Override } from "@/lib/types";

const glossary: GlossaryEntry[] = [
  ...SEED_GLOSSARY,
  { code: "X10F", description: "Footage test code", unitType: "FOOTAGE" },
];

let n = 0;
const spot = (sheetId: string, code: string, qty: number): Mark => ({
  id: `m${++n}`,
  jobId: "j",
  sheetId,
  kind: "spot",
  points: [[0.5, 0.5]],
  items: [{ code, qty }],
  createdBy: "u",
  createdAt: "2026-10-15T00:00:00Z",
});
const lock = (sheetId: string, code: string, qty: number, by = "foreman"): Override => ({
  jobId: "j",
  sheetId,
  code,
  qty,
  locked: true,
  createdBy: by,
  createdAt: "2026-10-15T00:00:00Z",
});
const job = (master: MasterItem[], marks: Mark[], overrides: Override[] = [], sheets = ["a", "b", "c", "d"]) => ({
  sheets: sheets.map((id, i) => ({
    id,
    jobId: "j",
    pageIndex: i,
    label: String(i + 1),
    widthPt: 100,
    heightPt: 100,
    streets: [],
    cableLabels: [],
    footages: [],
    tags: [],
    notes: [],
    codesFound: [] as string[],
  })),
  master,
  glossary,
  marks,
  overrides,
});

describe("largestRemainder", () => {
  it("sums exactly to the total", () => {
    for (const [total, weights] of [
      [100, [1, 1, 1]],
      [7, [0.3, 0.3, 0.4]],
      [3825, [449, 312, 588, 726, 1040]],
      [1, [5, 5]],
    ] as [number, number[]][]) {
      expect(largestRemainder(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("gives the leftover units to the largest remainders", () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(largestRemainder(10, [1, 2, 3])).toEqual([2, 3, 5]);
  });
  it("gives zero-weight entries nothing", () => {
    expect(largestRemainder(10, [0, 3, 0, 1])).toEqual([0, 8, 0, 2]);
    expect(largestRemainder(10, [0, 0])).toEqual([0, 0]);
  });
  it("rejects bad totals", () => {
    expect(() => largestRemainder(-1, [1])).toThrow();
    expect(() => largestRemainder(1.5, [1])).toThrow();
  });
});

describe("allocateCode", () => {
  it("FOOTAGE splits the full master by measured feet; unhighlighted sheets get 0", () => {
    const marks: Mark[] = [
      { ...spot("a", "X10F", 0), kind: "run", items: [{ code: "X10F", qty: 300 }] },
      { ...spot("b", "X10F", 0), kind: "run", items: [{ code: "X10F", qty: 100 }] },
    ];
    const c = allocateCode({ code: "X10F", description: "", estQty: 1000 }, ["a", "b", "c"], marks, [], glossary);
    expect(c.mode).toBe("distribute");
    expect(c.sheets.map((s) => s.qty)).toEqual([750, 250, 0]);
    expect(c.total).toBe(1000);
    expect(c.remaining).toBe(0);
  });

  it("PAIRS uses marked pair counts and shows remaining", () => {
    const c = allocateCode(
      { code: "S10B", description: "", estQty: 3825 },
      ["a", "b"],
      [spot("a", "S10B", 50), spot("b", "S10B", 100)],
      [],
      glossary,
    );
    expect(c.sheets.map((s) => s.qty)).toEqual([50, 100]);
    expect(c.remaining).toBe(3675);
    expect(c.status).toBe("under");
  });

  it("PAIRS marked over master is scaled down and never exceeds master", () => {
    const c = allocateCode(
      { code: "S10B", description: "", estQty: 100 },
      ["a", "b", "c"],
      [spot("a", "S10B", 50), spot("b", "S10B", 50), spot("c", "S10B", 50)],
      [],
      glossary,
    );
    expect(c.total).toBe(100);
    expect(c.sheets.map((s) => s.qty)).toEqual([34, 33, 33]);
    expect(c.status).toBe("ok");
  });

  it("locked overrides hold and unlocked sheets rebalance", () => {
    const marks: Mark[] = [
      { ...spot("a", "X10F", 0), kind: "run", items: [{ code: "X10F", qty: 100 }] },
      { ...spot("b", "X10F", 0), kind: "run", items: [{ code: "X10F", qty: 100 }] },
      { ...spot("c", "X10F", 0), kind: "run", items: [{ code: "X10F", qty: 200 }] },
    ];
    const c = allocateCode(
      { code: "X10F", description: "", estQty: 1000 },
      ["a", "b", "c"],
      marks,
      [lock("a", "X10F", 400)],
      glossary,
    );
    expect(c.sheets.map((s) => s.qty)).toEqual([400, 200, 400]);
    expect(c.sheets[0].locked).toBe(true);
    expect(c.total).toBe(1000);
  });

  it("reports who is over when locked numbers exceed master", () => {
    const c = allocateCode(
      { code: "S10B", description: "", estQty: 100 },
      ["a", "b"],
      [],
      [lock("a", "S10B", 80, "crew-1"), lock("b", "S10B", 40, "crew-2")],
      glossary,
    );
    expect(c.status).toBe("over");
    expect(c.overBy.sort()).toEqual(["crew-1", "crew-2"]);
  });
});

describe("over-master guard", () => {
  const master = [{ code: "S10B", description: "Cut Pairs Dead", estQty: 3825 }];

  it("blocks an override that pushes a code over master", () => {
    const r = checkOverride({ master, overrides: [lock("a", "S10B", 3800)] }, "b", "S10B", 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Max on this sheet is 25/);
  });
  it("allows an override up to the master", () => {
    expect(checkOverride({ master, overrides: [lock("a", "S10B", 3800)] }, "b", "S10B", 25).ok).toBe(true);
  });
  it("replacing a sheet's own lock does not count it twice", () => {
    expect(checkOverride({ master, overrides: [lock("a", "S10B", 3800)] }, "a", "S10B", 3825).ok).toBe(true);
  });
  it("rejects codes not on the master", () => {
    expect(checkOverride({ master, overrides: [] }, "a", "S10A", 1).ok).toBe(false);
  });
  it("blocks export when any code is over master", () => {
    const r = allocate(job(master, [], [lock("a", "S10B", 3000), lock("b", "S10B", 1000)]));
    expect(r.canExport).toBe(false);
    expect(r.blockers[0]).toMatch(/S10B is 175 over master/);
  });
});

describe("flags", () => {
  it("flags codes on the print or marks that are not in the master", () => {
    const j = job([{ code: "S10B", description: "", estQty: 10 }], [spot("b", "P73A", 1)]);
    j.sheets[0].codesFound = ["S10A", "S10B"];
    const r = allocate(j);
    expect(r.flags.map((f) => [f.code, f.reason, f.sheetIds])).toEqual([
      ["P73A", "not-in-master", ["b"]],
      ["S10A", "not-in-master", ["a"]],
    ]);
  });
});

describe("splitAcrossMarks", () => {
  it("splits a sheet's qty across its marks by marked qty", () => {
    const marks = [spot("a", "S10B", 30), spot("a", "S10B", 10), spot("a", "S16A", 5)];
    expect(splitAcrossMarks(20, marks, "S10B").map((p) => p.qty)).toEqual([15, 5]);
  });
});
