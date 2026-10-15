import { dayKey } from "./dates";
import type { DailyEntry, Job } from "./types";

// Billing task codes and daily input rows.
// Task code for a unit code on a sheet = the sheet's override, else the master's task code.
// Daily rows are the billing log; their per-code total may never exceed the master.
// A row may be saved without a task code (filled in later) but is flagged until it has one.

type BillingJob = Pick<Job, "master" | "sheets" | "daily">;

export function resolveTaskCode(job: Pick<Job, "master" | "sheets">, sheetId: string | null, unitCode: string): string {
  const sheet = sheetId ? job.sheets.find((s) => s.id === sheetId) : undefined;
  const override = sheet?.taskCodes?.[unitCode]?.trim();
  if (override) return override;
  return job.master.find((m) => m.code === unitCode)?.taskCode?.trim() ?? "";
}

export type BilledTotal = { code: string; description: string; master: number; billed: number; remaining: number };

/** Billed-to-date per master code across every daily row. */
export function billedTotals(job: BillingJob): BilledTotal[] {
  return job.master.map((m) => {
    const billed = job.daily.filter((e) => e.unitCode === m.code).reduce((a, e) => a + e.qty, 0);
    return { code: m.code, description: m.description, master: m.estQty, billed, remaining: m.estQty - billed };
  });
}

export type EntryCheck = { ok: true } | { ok: false; error: string };

/** Validate a new or edited row (pass the row as it would be saved). Over-master rows are blocked. */
export function checkDailyEntry(job: BillingJob, entry: Pick<DailyEntry, "id" | "unitCode" | "qty" | "taskCode">): EntryCheck {
  if (!Number.isInteger(entry.qty) || entry.qty < 0) return { ok: false, error: "Qty must be a whole number, 0 or more." };
  const master = job.master.find((m) => m.code === entry.unitCode);
  if (!master) return { ok: false, error: `${entry.unitCode} is not on the master list.` };
  const others = job.daily.filter((e) => e.unitCode === entry.unitCode && e.id !== entry.id).reduce((a, e) => a + e.qty, 0);
  const max = master.estQty - others;
  if (entry.qty > max) {
    return {
      ok: false,
      error: `Blocked: ${entry.unitCode} billed would be ${others + entry.qty} vs master ${master.estQty}. Max on this row is ${Math.max(0, max)}.`,
    };
  }
  return { ok: true };
}

/**
 * Rows for one day built from that day's marks (one row per sheet + unit code), with
 * task codes filled in. Codes not on the master are skipped and reported back.
 * Quantities that would go over master are trimmed to what is left.
 */
export function rowsFromMarks(
  job: Pick<Job, "id" | "master" | "sheets" | "marks" | "daily">,
  day: string,
  user: string,
  newId: () => string,
): { rows: DailyEntry[]; skipped: string[]; trimmed: string[] } {
  const now = new Date().toISOString();
  const sums = new Map<string, { sheetId: string; unitCode: string; qty: number }>();
  for (const m of job.marks) {
    if (dayKey(m.createdAt) !== day) continue;
    for (const it of m.items) {
      const k = `${m.sheetId}|${it.code}`;
      const row = sums.get(k) ?? { sheetId: m.sheetId, unitCode: it.code, qty: 0 };
      row.qty += it.qty;
      sums.set(k, row);
    }
  }
  const inMaster = new Set(job.master.map((m) => m.code));
  const skipped = new Set<string>();
  const trimmed: string[] = [];
  const rows: DailyEntry[] = [];
  const order = (sheetId: string) => job.sheets.findIndex((s) => s.id === sheetId);
  for (const r of [...sums.values()].sort((a, b) => order(a.sheetId) - order(b.sheetId))) {
    if (!inMaster.has(r.unitCode)) {
      skipped.add(r.unitCode);
      continue;
    }
    const left = billedTotals({ ...job, daily: [...job.daily, ...rows] }).find((t) => t.code === r.unitCode)!.remaining;
    const qty = Math.max(0, Math.min(r.qty, left));
    if (qty < r.qty) trimmed.push(r.unitCode);
    if (!qty) continue;
    rows.push({
      id: newId(),
      jobId: job.id,
      day,
      sheetId: r.sheetId,
      unitCode: r.unitCode,
      taskCode: resolveTaskCode(job, r.sheetId, r.unitCode),
      qty,
      createdBy: user,
      createdAt: now,
    });
  }
  return { rows, skipped: [...skipped].sort(), trimmed };
}

/** Totals by task code + unit code for a set of rows. */
export function byTaskCode(rows: DailyEntry[]): { taskCode: string; unitCode: string; qty: number }[] {
  const out: { taskCode: string; unitCode: string; qty: number }[] = [];
  for (const r of rows) {
    const t = out.find((x) => x.taskCode === r.taskCode && x.unitCode === r.unitCode);
    if (t) t.qty += r.qty;
    else out.push({ taskCode: r.taskCode, unitCode: r.unitCode, qty: r.qty });
  }
  return out.sort((a, b) => a.taskCode.localeCompare(b.taskCode) || a.unitCode.localeCompare(b.unitCode));
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Billing CSV of daily rows (all days, or one day). */
export function billingCsv(job: Pick<Job, "header" | "sheets" | "master" | "daily">, day?: string): string {
  const rows = job.daily.filter((e) => !day || e.day === day).sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  const out: (string | number)[][] = [["wo", "day", "task_code", "unit_code", "description", "sheet", "qty", "note", "entered_by"]];
  for (const r of rows) {
    out.push([
      job.header.woNumber,
      r.day,
      r.taskCode,
      r.unitCode,
      job.master.find((m) => m.code === r.unitCode)?.description ?? "",
      job.sheets.find((s) => s.id === r.sheetId)?.label ?? "",
      r.qty,
      r.note ?? "",
      r.updatedBy ?? r.createdBy,
    ]);
  }
  return out.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
