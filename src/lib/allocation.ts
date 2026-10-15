import type { GlossaryEntry, Job, Mark, MasterItem, Override, UnitType } from "./types";

/**
 * How a master quantity is spread across sheets.
 * - distribute: the whole master qty is split in proportion to the marked weights
 *   (FOOTAGE: master footage split by measured highlighted feet).
 * - as-marked: each sheet gets what was marked there, scaled down only if the marks
 *   add up to more than the master (PAIRS / EACH: pair counts at cut points).
 */
export type AllocationMode = "distribute" | "as-marked";

export function modeFor(unitType: UnitType): AllocationMode {
  return unitType === "FOOTAGE" ? "distribute" : "as-marked";
}

/**
 * Largest-remainder (Hamilton) apportionment of an integer total across weights.
 * The result always sums to exactly `total` (or 0 when every weight is 0), and a
 * zero weight always gets 0.
 */
export function largestRemainder(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error(`total must be a non-negative integer, got ${total}`);
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * Math.max(0, w)) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .filter((o) => o.w > 0)
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

export type SheetAllocation = {
  sheetId: string;
  weight: number;
  qty: number;
  locked: boolean;
  lockedBy?: string;
};

export type CodeStatus = "ok" | "under" | "over" | "unmarked";

export type CodeAllocation = {
  code: string;
  description: string;
  unitType: UnitType;
  mode: AllocationMode;
  master: number;
  marked: number;
  sheets: SheetAllocation[];
  total: number;
  remaining: number;
  status: CodeStatus;
  /** Who holds the locked numbers when the code is over master. */
  overBy: string[];
};

export type CodeFlag = {
  code: string;
  reason: "not-in-master" | "not-in-glossary";
  sheetIds: string[];
};

export type AllocationResult = {
  codes: CodeAllocation[];
  flags: CodeFlag[];
  canExport: boolean;
  blockers: string[];
};

export function weightOnSheet(marks: Mark[], sheetId: string, code: string): number {
  let w = 0;
  for (const m of marks) {
    if (m.sheetId !== sheetId) continue;
    for (const it of m.items) if (it.code === code) w += it.qty;
  }
  return w;
}

function unitTypeOf(code: string, glossary: GlossaryEntry[]): UnitType {
  return glossary.find((g) => g.code === code)?.unitType ?? "EACH";
}

export function allocateCode(
  item: MasterItem,
  sheetIds: string[],
  marks: Mark[],
  overrides: Override[],
  glossary: GlossaryEntry[],
): CodeAllocation {
  const unitType = unitTypeOf(item.code, glossary);
  const mode = modeFor(unitType);
  const locked = new Map<string, Override>();
  for (const o of overrides) if (o.code === item.code && o.locked && sheetIds.includes(o.sheetId)) locked.set(o.sheetId, o);

  const weights = sheetIds.map((id) => weightOnSheet(marks, id, item.code));
  const marked = weights.reduce((a, b) => a + b, 0);
  const lockedSum = [...locked.values()].reduce((a, o) => a + o.qty, 0);

  const free = sheetIds.map((id, i) => (locked.has(id) ? 0 : weights[i]));
  const freeSum = free.reduce((a, b) => a + b, 0);
  const room = Math.max(0, item.estQty - lockedSum);
  const target = mode === "distribute" ? room : Math.min(room, freeSum);
  const auto = largestRemainder(target, free);

  const sheets = sheetIds.map((id, i) => {
    const o = locked.get(id);
    return o
      ? { sheetId: id, weight: weights[i], qty: o.qty, locked: true, lockedBy: o.createdBy }
      : { sheetId: id, weight: weights[i], qty: auto[i], locked: false };
  });
  const total = sheets.reduce((a, s) => a + s.qty, 0);
  const remaining = item.estQty - total;
  const status: CodeStatus =
    total > item.estQty ? "over" : marked === 0 && lockedSum === 0 ? "unmarked" : remaining > 0 ? "under" : "ok";
  const overBy = status === "over" ? [...new Set([...locked.values()].map((o) => o.createdBy))] : [];

  return {
    code: item.code,
    description: item.description,
    unitType,
    mode,
    master: item.estQty,
    marked,
    sheets,
    total,
    remaining,
    status,
    overBy,
  };
}

export function codeFlags(job: Pick<Job, "sheets" | "marks" | "master" | "glossary">): CodeFlag[] {
  const inMaster = new Set(job.master.map((m) => m.code));
  const inGlossary = new Set(job.glossary.map((g) => g.code));
  const seen = new Map<string, Set<string>>();
  const note = (code: string, sheetId: string) => {
    if (!seen.has(code)) seen.set(code, new Set());
    seen.get(code)!.add(sheetId);
  };
  for (const s of job.sheets) for (const c of s.codesFound) note(c, s.id);
  for (const m of job.marks) for (const it of m.items) note(it.code, m.sheetId);

  const flags: CodeFlag[] = [];
  for (const [code, sheets] of [...seen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!inMaster.has(code)) flags.push({ code, reason: "not-in-master", sheetIds: [...sheets] });
  }
  for (const m of job.master) {
    if (!inGlossary.has(m.code)) flags.push({ code: m.code, reason: "not-in-glossary", sheetIds: [] });
  }
  return flags;
}

export function allocate(job: Pick<Job, "sheets" | "marks" | "master" | "glossary" | "overrides">): AllocationResult {
  const sheetIds = job.sheets.map((s) => s.id);
  const codes = job.master.map((m) => allocateCode(m, sheetIds, job.marks, job.overrides, job.glossary));
  const flags = codeFlags(job);
  const blockers = codes
    .filter((c) => c.status === "over")
    .map((c) => `${c.code} is ${c.total - c.master} over master (${c.total} > ${c.master})`);
  return { codes, flags, canExport: blockers.length === 0, blockers };
}

/** Result of trying to set a locked override. Over-master entries are rejected. */
export type OverrideCheck = { ok: true } | { ok: false; error: string };

export function checkOverride(
  job: Pick<Job, "master" | "overrides">,
  sheetId: string,
  code: string,
  qty: number,
): OverrideCheck {
  if (!Number.isInteger(qty) || qty < 0) return { ok: false, error: "Quantity must be a whole number, 0 or more." };
  const master = job.master.find((m) => m.code === code);
  if (!master) return { ok: false, error: `${code} is not on the master list.` };
  const otherLocked = job.overrides
    .filter((o) => o.code === code && o.locked && o.sheetId !== sheetId)
    .reduce((a, o) => a + o.qty, 0);
  const max = master.estQty - otherLocked;
  if (qty > max) {
    return {
      ok: false,
      error: `Blocked: ${code} would be ${otherLocked + qty} vs master ${master.estQty}. Max on this sheet is ${Math.max(0, max)}.`,
    };
  }
  return { ok: true };
}

/** Split one sheet's qty for a code across that sheet's marks (for map callouts). */
export function splitAcrossMarks(sheetQty: number, marks: Mark[], code: string): { markId: string; qty: number }[] {
  const relevant = marks.filter((m) => m.items.some((it) => it.code === code));
  const weights = relevant.map((m) => m.items.filter((it) => it.code === code).reduce((a, it) => a + it.qty, 0));
  const qtys = largestRemainder(sheetQty, weights);
  return relevant.map((m, i) => ({ markId: m.id, qty: qtys[i] }));
}

/** Per-sheet WORK PERFORMED rows: codes with qty > 0, master order. */
export function workPerformed(result: AllocationResult, sheetId: string): { code: string; qty: number }[] {
  const rows: { code: string; qty: number }[] = [];
  for (const c of result.codes) {
    const s = c.sheets.find((x) => x.sheetId === sheetId);
    if (s && s.qty > 0) rows.push({ code: c.code, qty: s.qty });
  }
  return rows;
}
