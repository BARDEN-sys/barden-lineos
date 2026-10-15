import { buildDemoMarks, buildDemoPdf, DEMO_WO } from "./demo";
import { DEMO_MASTER, SEED_GLOSSARY } from "./glossary";
import { extractPrint } from "./pdfText";
import { DEMO_USER, type Job, type Sheet } from "./types";

export const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

export async function jobFromPrint(bytes: Uint8Array, pdfName: string, user = DEMO_USER): Promise<Job> {
  const jobId = newId("job");
  const { header, pages } = await extractPrint(bytes);
  const sheets: Sheet[] = pages.map((p) => ({
    id: `${jobId}-s${p.pageIndex + 1}`,
    jobId,
    pageIndex: p.pageIndex,
    label: p.label ?? String(p.pageIndex + 1),
    widthPt: p.widthPt,
    heightPt: p.heightPt,
    streets: p.streets,
    cableLabels: p.cableLabels,
    footages: p.footages,
    tags: p.tags,
    notes: p.notes,
    codesFound: p.codesFound,
    unitsBlock: p.unitsBlock,
  }));
  return {
    id: jobId,
    header,
    pdfName,
    pdfBytes: bytes,
    sheets,
    master: [],
    glossary: SEED_GLOSSARY.map((g) => ({ ...g })),
    marks: [],
    overrides: [],
    createdBy: user,
    createdAt: new Date().toISOString(),
  };
}

export async function demoJob(): Promise<Job> {
  const bytes = await buildDemoPdf();
  const job = await jobFromPrint(bytes, `WO-${DEMO_WO}-demo.pdf`);
  job.master = DEMO_MASTER.map((m) => ({ ...m }));
  job.marks = buildDemoMarks(job.id, job.sheets.map((s) => s.id));
  return job;
}
