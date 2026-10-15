import { beforeAll, describe, expect, it } from "vitest";
import { allocate } from "@/lib/allocation";
import { billedTotals, billingCsv, byTaskCode, checkDailyEntry, resolveTaskCode, rowsFromMarks } from "@/lib/billing";
import { buildDailyReport } from "@/lib/daily";
import { DEMO_WORK_DAY } from "@/lib/demo";
import { demoJob } from "@/lib/job";
import type { DailyEntry, Job } from "@/lib/types";
import { pdfText } from "./pdfTextHelper";

let base: Job;
beforeAll(async () => {
  base = await demoJob();
});

/** Demo job with master task codes and a sheet-5 override for S16A. */
function withTaskCodes(): Job {
  return {
    ...base,
    master: base.master.map((m) => ({ ...m, taskCode: `TC-${m.code}` })),
    sheets: base.sheets.map((s, i) => (i === 4 ? { ...s, taskCodes: { S16A: "TC-GOLF" } } : s)),
    daily: [],
  };
}

let seq = 0;
const id = () => `d${++seq}`;
const row = (job: Job, p: Partial<DailyEntry>): DailyEntry => ({
  id: id(),
  jobId: job.id,
  day: DEMO_WORK_DAY,
  sheetId: job.sheets[1].id,
  unitCode: "S10B",
  taskCode: "TC-S10B",
  qty: 0,
  createdBy: "u",
  createdAt: "2026-09-29T12:00:00Z",
  ...p,
});

describe("task codes", () => {
  it("uses the master task code, unless the sheet changes it", () => {
    const job = withTaskCodes();
    expect(resolveTaskCode(job, job.sheets[1].id, "S10B")).toBe("TC-S10B");
    expect(resolveTaskCode(job, job.sheets[4].id, "S16A")).toBe("TC-GOLF");
    expect(resolveTaskCode(job, job.sheets[4].id, "S10B")).toBe("TC-S10B");
    expect(resolveTaskCode(job, null, "S63A")).toBe("TC-S63A");
    expect(resolveTaskCode(base, base.sheets[1].id, "S10B")).toBe("");
  });
});

describe("daily input rows", () => {
  it("blocks a row that pushes a unit code over master", () => {
    const job = withTaskCodes();
    job.daily = [row(job, { unitCode: "S10B", qty: 3800 })];
    const r = checkDailyEntry(job, row(job, { unitCode: "S10B", qty: 26 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Max on this row is 25/);
    expect(checkDailyEntry(job, row(job, { unitCode: "S10B", qty: 25 })).ok).toBe(true);
    // Editing the existing row does not count it twice.
    expect(checkDailyEntry(job, { ...job.daily[0], qty: 3825 }).ok).toBe(true);
    expect(checkDailyEntry(job, row(job, { unitCode: "S10A", qty: 1 })).ok).toBe(false);
  });

  it("fills rows from the day's marks with task codes, skipping codes not in master", () => {
    const job = withTaskCodes();
    const { rows, skipped, trimmed } = rowsFromMarks(job, DEMO_WORK_DAY, "u", id);
    expect(rows.map((r) => [job.sheets.findIndex((s) => s.id === r.sheetId) + 1, r.unitCode, r.taskCode, r.qty])).toEqual([
      [2, "S10B", "TC-S10B", 100],
      [3, "S10B", "TC-S10B", 125],
      [5, "S16A", "TC-GOLF", 3600],
      [5, "S10B", "TC-S10B", 3600],
    ]);
    expect(skipped).toEqual(["P22K1", "S10A"]);
    expect(trimmed).toEqual([]);
    expect(billedTotals({ ...job, daily: rows }).map((t) => [t.code, t.billed, t.remaining])).toEqual([
      ["S10B", 3825, 0],
      ["S16A", 3600, 0],
      ["S63A", 0, 5],
    ]);
  });

  it("trims rows built from marks to what is left under master", () => {
    const job = withTaskCodes();
    job.daily = [row(job, { unitCode: "S10B", qty: 3800, day: "2026-09-28" })];
    const { rows, trimmed } = rowsFromMarks(job, DEMO_WORK_DAY, "u", id);
    expect(rows.filter((r) => r.unitCode === "S10B").reduce((a, r) => a + r.qty, 0)).toBe(25);
    expect(trimmed).toContain("S10B");
  });

  it("totals by task code and writes a billing CSV", () => {
    const job = withTaskCodes();
    job.daily = rowsFromMarks(job, DEMO_WORK_DAY, "u", id).rows;
    expect(byTaskCode(job.daily)).toEqual([
      { taskCode: "TC-GOLF", unitCode: "S16A", qty: 3600 },
      { taskCode: "TC-S10B", unitCode: "S10B", qty: 3825 },
    ]);
    const csv = billingCsv(job, DEMO_WORK_DAY);
    expect(csv.split("\n")[0]).toBe("wo,day,task_code,unit_code,description,sheet,qty,note,entered_by");
    expect(csv).toContain("4222352,2026-09-29,TC-GOLF,S16A,Test/Verify Pairs,5 of 5,3600,,u");
  });

  it("puts the billing rows on the daily report", async () => {
    const job = withTaskCodes();
    job.daily = [...rowsFromMarks(job, DEMO_WORK_DAY, "u", id).rows, row(job, { unitCode: "S63A", taskCode: "", qty: 2 })];
    const pdf = await buildDailyReport(job, allocate(job), { day: DEMO_WORK_DAY, preparedBy: "x" });
    const text = [1, 2, 3].map(async (n) => pdfText(pdf, n).catch(() => ""));
    const all = (await Promise.all(text)).join(" ");
    expect(all).toContain("Billing (daily input)");
    expect(all).toContain("TC-GOLF");
    expect(all).toContain("1 row(s) have no task code.");
  });
});
