import { beforeAll, describe, expect, it } from "vitest";
import { allocate, checkOverride, splitAcrossMarks } from "@/lib/allocation";
import { demoJob } from "@/lib/job";
import { renderSheets, summaryCsv } from "@/lib/output";
import { extractPrint, openPdf } from "@/lib/pdfText";
import { pdfText } from "./pdfTextHelper";
import type { Job } from "@/lib/types";

// End-to-end: generated WO 4222352 print -> pdf.js text extraction -> crew marks ->
// allocation -> clean output PDF. This is the M1 acceptance check.
let job: Job;
beforeAll(async () => {
  job = await demoJob();
});

const code = (c: string) => allocate(job).codes.find((x) => x.code === c)!;
const perSheet = (c: string) => code(c).sheets.map((s) => s.qty);

/** Qty the callout at each marked spot gets for a code, in sheet/mark order. */
function perMark(c: string): number[] {
  const out: number[] = [];
  for (const s of code(c).sheets) {
    const marks = job.marks.filter((m) => m.sheetId === s.sheetId);
    for (const p of splitAcrossMarks(s.qty, marks, c)) if (p.qty) out.push(p.qty);
  }
  return out;
}

describe("WO 4222352 demo (laid out after the crew's marked-up prints)", () => {
  it("extracts the job header and sheets from the PDF text layer", () => {
    expect(job.header).toEqual({ woNumber: "4222352", projectNumber: "4222352", engineers: ["A. SAMPLE", "B. SAMPLE"] });
    expect(job.sheets).toHaveLength(5);
    expect(job.sheets[1]).toMatchObject({ label: "2 of 5", cableLabels: ["AKF 50 24"], footages: [312, 287] });
    expect(job.sheets[1].streets).toEqual(expect.arrayContaining(["TARPON DR"]));
    expect(job.sheets[4].cableLabels).toEqual(expect.arrayContaining(["ASP 1800 26"]));
    expect(job.sheets[1].unitsBlock).toBeDefined();
  });

  it("reproduces the crew's markups and matches master", () => {
    expect(perMark("S10B")).toEqual([50, 50, 100, 25, 3600]);
    expect(perMark("S16A")).toEqual([1800, 1800]);
    expect(perSheet("S10B")).toEqual([0, 100, 125, 0, 3600]);
    expect(perSheet("S16A")).toEqual([0, 0, 0, 0, 3600]);
    for (const c of ["S10B", "S16A"]) {
      expect(code(c).total).toBe(code(c).master);
      expect(code(c).status).toBe("ok");
    }
    expect(allocate(job).canExport).toBe(true);
  });

  it("leaves S63A unmarked (not written on any photographed sheet)", () => {
    expect(code("S63A")).toMatchObject({ total: 0, remaining: 5, status: "unmarked" });
  });

  it("gives sheets with no highlights 0 of every code", () => {
    for (const c of allocate(job).codes) {
      expect(c.sheets[0].qty).toBe(0);
      expect(c.sheets[3].qty).toBe(0);
    }
  });

  it("flags S10A and P22K1 as marked but not in master", () => {
    const flags = allocate(job).flags;
    expect(flags.find((f) => f.code === "S10A")).toMatchObject({ reason: "not-in-master", sheetIds: [job.sheets[4].id] });
    expect(flags.find((f) => f.code === "P22K1")).toMatchObject({
      reason: "not-in-master",
      sheetIds: [job.sheets[1].id, job.sheets[2].id],
    });
  });

  it("blocks an over-master entry", () => {
    expect(checkOverride(job, job.sheets[1].id, "S10B", 3826).ok).toBe(false);
  });

  it("renders clean output sheets with callouts and the WORK PERFORMED box", async () => {
    const r = allocate(job);
    const pdf = await renderSheets(job, r, job.sheets.map((s) => s.id), { date: "10/15/2026" });
    const { pages } = await extractPrint(pdf);
    expect(pages).toHaveLength(5);
    const haven = await pdfText(pdf, 5);
    expect(haven).toContain("WORK PERFORMED: 10/15/2026");
    expect(haven).toContain("S10B 3,600");
    expect(haven).toContain("S16A 1,800");
    expect(haven).not.toContain("S10A 1,800");
    const tarpon = await pdfText(pdf, 2);
    expect(tarpon.match(/S10B 50\b/g)).toHaveLength(2);
    expect(await pdfText(pdf, 1)).toContain("No work on this sheet");
  });

  it("places the WORK PERFORMED box where the crew put it", async () => {
    const moved = { ...job, sheets: job.sheets.map((s, i) => (i === 4 ? { ...s, workBoxAt: [0.6, 0.7] as [number, number] } : s)) };
    const pdf = await renderSheets(moved, allocate(moved), [moved.sheets[4].id], { date: "x" });
    const doc = await openPdf(pdf);
    const items = (await (await doc.getPage(1)).getTextContent()).items;
    const head = items.find((i) => "str" in i && i.str.startsWith("WORK PERFORMED"));
    await doc.destroy();
    expect(head && "transform" in head ? head.transform[4] : 0).toBeGreaterThan(0.6 * 1224);
  });

  it("refuses to render when a code is over master", async () => {
    const over = { ...job, overrides: [{ jobId: job.id, sheetId: job.sheets[1].id, code: "S63A", qty: 9, locked: true, createdBy: "x", createdAt: "" }] };
    await expect(renderSheets(over, allocate(over), [job.sheets[1].id], { date: "" })).rejects.toThrow(/Export blocked/);
  });

  it("writes a summary CSV with totals vs master", () => {
    const csv = summaryCsv(job, allocate(job));
    expect(csv).toContain("4222352,S10B,Cut Pairs Dead,TOTAL,3825,3825,0,ok");
    expect(csv).toContain("4222352,S16A,Test/Verify Pairs,TOTAL,3600,3600,0,ok");
    expect(csv).toContain("4222352,S63A,Place Air Pressure Devices,TOTAL,0,5,5,unmarked");
    expect(csv).toContain("4222352,S10A,not-in-master,,,,,FLAG");
  });
});
