import { beforeAll, describe, expect, it } from "vitest";
import { allocate, checkOverride } from "@/lib/allocation";
import { demoJob } from "@/lib/job";
import { renderSheets, summaryCsv } from "@/lib/output";
import { extractPrint } from "@/lib/pdfText";
import type { Job } from "@/lib/types";

// End-to-end: generated WO 4222352 print -> pdf.js text extraction -> crew marks ->
// allocation -> clean output PDF. This is the M1 acceptance check.
let job: Job;
beforeAll(async () => {
  job = await demoJob();
});

const perSheet = (code: string) =>
  allocate(job)
    .codes.find((c) => c.code === code)!
    .sheets.map((s) => s.qty)
    .filter((q) => q > 0);

describe("WO 4222352 demo", () => {
  it("extracts the job header and sheets from the PDF text layer", () => {
    expect(job.header.woNumber).toBe("4222352");
    expect(job.header.projectNumber).toBe("CR-26-0187");
    expect(job.sheets).toHaveLength(6);
    expect(job.sheets[1]).toMatchObject({ label: "2 of 6", cableLabels: ["AKF 50 24"], footages: [449] });
    expect(job.sheets[1].tags).toEqual(expect.arrayContaining(["PPR 12", "PPX 14"]));
    expect(job.sheets[1].unitsBlock).toBeDefined();
  });

  it("reproduces the crew's markups and matches master", () => {
    expect(perSheet("S10B")).toEqual([50, 50, 100, 25, 3600]);
    expect(perSheet("S16A")).toEqual([1800, 1800]);
    expect(perSheet("S63A")).toEqual([1, 1, 1, 1, 1]);
    const r = allocate(job);
    for (const c of r.codes) {
      expect(c.total).toBe(c.master);
      expect(c.status).toBe("ok");
    }
    expect(r.canExport).toBe(true);
  });

  it("gives the cover sheet (no highlights) 0 of every code", () => {
    for (const c of allocate(job).codes) expect(c.sheets[0].qty).toBe(0);
  });

  it("flags S10A as on the print but not in master", () => {
    const flag = allocate(job).flags.find((f) => f.code === "S10A");
    expect(flag).toMatchObject({ reason: "not-in-master", sheetIds: [job.sheets[3].id] });
  });

  it("blocks an over-master entry", () => {
    const r = checkOverride(job, job.sheets[1].id, "S10B", 3826);
    expect(r.ok).toBe(false);
  });

  it("renders clean output sheets with the WORK PERFORMED box and units", async () => {
    const r = allocate(job);
    const pdf = await renderSheets(job, r, job.sheets.map((s) => s.id), { date: "10/15/2026" });
    const { pages } = await extractPrint(pdf);
    expect(pages).toHaveLength(6);
    const { pdfText } = await import("./pdfTextHelper");
    const last = await pdfText(pdf, 6);
    expect(last).toContain("WORK PERFORMED: 10/15/2026");
    expect(last).toContain("S10B 3,600");
    expect(last).toContain("S16A 1,800");
    const cover = await pdfText(pdf, 1);
    expect(cover).toContain("No work on this sheet");
  });

  it("refuses to render when a code is over master", async () => {
    const over = { ...job, overrides: [{ jobId: job.id, sheetId: job.sheets[1].id, code: "S63A", qty: 9, locked: true, createdBy: "x", createdAt: "" }] };
    await expect(renderSheets(over, allocate(over), [job.sheets[1].id], { date: "" })).rejects.toThrow(/Export blocked/);
  });

  it("writes a summary CSV with totals vs master", () => {
    const csv = summaryCsv(job, allocate(job));
    expect(csv).toContain("4222352,S10B,Cut Pairs Dead,TOTAL,3825,3825,0,ok");
    expect(csv).toContain("4222352,S16A,Test/Verify Pairs,TOTAL,3600,3600,0,ok");
    expect(csv).toContain("4222352,S10A,not-in-master,,,,,FLAG");
  });
});
