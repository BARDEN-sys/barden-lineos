import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { splitAcrossMarks, workPerformed, type AllocationResult } from "./allocation";
import type { Job, Mark, Sheet } from "./types";

const INK = rgb(0.05, 0.15, 0.55);
const WHITE = rgb(1, 1, 1);

export type ExportOptions = { date: string };

function callouts(result: AllocationResult, sheet: Sheet, marks: Mark[]): Map<string, string[]> {
  const byMark = new Map<string, string[]>();
  const sheetMarks = marks.filter((m) => m.sheetId === sheet.id);
  for (const c of result.codes) {
    const qty = c.sheets.find((s) => s.sheetId === sheet.id)?.qty ?? 0;
    if (!qty) continue;
    const parts = splitAcrossMarks(qty, sheetMarks, c.code);
    if (!parts.length) {
      // Locked qty on a sheet with no marks for the code: it still shows in the box.
      continue;
    }
    for (const p of parts) {
      if (!p.qty) continue;
      const list = byMark.get(p.markId) ?? [];
      list.push(`${c.code} ${p.qty.toLocaleString("en-US")}`);
      byMark.set(p.markId, list);
    }
  }
  return byMark;
}

function drawCallout(page: PDFPage, font: PDFFont, mark: Mark, lines: string[]) {
  const { width, height } = page.getSize();
  const anchor = mark.points[Math.floor((mark.points.length - 1) / 2)];
  const ax = anchor[0] * width;
  const ay = (1 - anchor[1]) * height;
  const size = 10;
  const boxW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size))) + 10;
  const boxH = lines.length * (size + 3) + 6;
  // Place up-right of the point, flipped inward near the page edges.
  let bx = ax + 18;
  let by = ay + 14;
  if (bx + boxW > width - 16) bx = ax - 18 - boxW;
  if (by + boxH > height - 16) by = ay - 14 - boxH;
  page.drawLine({ start: { x: ax, y: ay }, end: { x: bx < ax ? bx + boxW : bx, y: by < ay ? by + boxH : by }, thickness: 1, color: INK });
  page.drawCircle({ x: ax, y: ay, size: 3, color: INK });
  page.drawRectangle({ x: bx, y: by, width: boxW, height: boxH, color: WHITE, borderColor: INK, borderWidth: 1.2 });
  lines.forEach((l, i) => page.drawText(l, { x: bx + 5, y: by + boxH - 4 - (i + 1) * (size + 3) + 3, size, font, color: INK }));
}

function drawWorkBox(page: PDFPage, font: PDFFont, bold: PDFFont, rows: { code: string; qty: number }[], date: string) {
  const { height } = page.getSize();
  const w = 210;
  const rowH = 15;
  const h = 42 + Math.max(1, rows.length) * rowH;
  const x = 28;
  const y = height - 70 - h;
  page.drawRectangle({ x, y, width: w, height: h, color: WHITE, borderColor: INK, borderWidth: 1.5 });
  page.drawText(`WORK PERFORMED: ${date}`, { x: x + 8, y: y + h - 16, size: 10, font: bold, color: INK });
  page.drawText("CODE", { x: x + 8, y: y + h - 31, size: 8, font: bold, color: INK });
  page.drawText("QTY", { x: x + w - 60, y: y + h - 31, size: 8, font: bold, color: INK });
  page.drawLine({ start: { x: x + 6, y: y + h - 35 }, end: { x: x + w - 6, y: y + h - 35 }, thickness: 0.6, color: INK });
  if (!rows.length) page.drawText("No work on this sheet", { x: x + 8, y: y + 8, size: 9, font, color: INK });
  rows.forEach((r, i) => {
    const ry = y + h - 49 - i * rowH;
    page.drawText(r.code, { x: x + 8, y: ry, size: 10, font, color: INK });
    page.drawText(r.qty.toLocaleString("en-US"), { x: x + w - 60, y: ry, size: 10, font, color: INK });
  });
}

function fillUnitsBlock(page: PDFPage, font: PDFFont, sheet: Sheet, rows: { code: string; qty: number }[]) {
  if (!sheet.unitsBlock || !rows.length) return;
  const b = sheet.unitsBlock;
  const size = 9;
  const perCol = Math.max(1, Math.floor((b.h - 6) / (size + 3)));
  rows.forEach((r, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    page.drawText(`${r.code}  ${r.qty.toLocaleString("en-US")}`, {
      x: b.x + 6 + col * 100,
      y: b.y + b.h - (row + 1) * (size + 3),
      size,
      font,
      color: INK,
    });
  });
}

/** Clean sheets: the ORIGINAL pages (no highlighter) plus code callouts and the work box. */
export async function renderSheets(
  job: Pick<Job, "pdfBytes" | "sheets" | "marks">,
  result: AllocationResult,
  sheetIds: string[],
  opts: ExportOptions,
): Promise<Uint8Array> {
  if (!job.pdfBytes) throw new Error("No work print loaded.");
  if (!result.canExport) throw new Error(`Export blocked: ${result.blockers.join("; ")}`);
  const src = await PDFDocument.load(job.pdfBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const sheets = sheetIds.map((id) => job.sheets.find((s) => s.id === id)).filter((s): s is Sheet => !!s);
  const copied = await out.copyPages(src, sheets.map((s) => s.pageIndex));
  sheets.forEach((sheet, i) => {
    const page = out.addPage(copied[i]);
    const rows = workPerformed(result, sheet.id);
    const byMark = callouts(result, sheet, job.marks);
    for (const m of job.marks) {
      const lines = byMark.get(m.id);
      if (m.sheetId === sheet.id && lines?.length) drawCallout(page, bold, m, lines);
    }
    drawWorkBox(page, font, bold, rows, opts.date);
    fillUnitsBlock(page, font, sheet, rows);
  });
  return out.save();
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function summaryCsv(job: Pick<Job, "header" | "sheets">, result: AllocationResult): string {
  const rows: (string | number)[][] = [["wo", "code", "description", "sheet", "qty", "master", "remaining", "status"]];
  for (const c of result.codes) {
    for (const s of c.sheets) {
      if (!s.qty) continue;
      const sheet = job.sheets.find((x) => x.id === s.sheetId);
      rows.push([job.header.woNumber, c.code, c.description, sheet?.label ?? s.sheetId, s.qty, "", "", s.locked ? "locked" : ""]);
    }
    rows.push([job.header.woNumber, c.code, c.description, "TOTAL", c.total, c.master, c.remaining, c.status]);
  }
  for (const f of result.flags) rows.push([job.header.woNumber, f.code, f.reason, "", "", "", "", "FLAG"]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
