import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { splitAcrossMarks, workPerformed, type AllocationResult } from "./allocation";
import type { Job, Mark, Point, Sheet } from "./types";

const INK = rgb(0.05, 0.15, 0.55);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
// Colours taken from a finished crew sheet: blue WORK PERFORMED table, yellow code tags.
const BOX_BLUE = rgb(0.11, 0.42, 0.87);
const BOX_TINT = rgb(0.86, 0.93, 0.99);
const TAG_YELLOW = rgb(1, 0.93, 0.2);

/** Default WORK PERFORMED position (normalised top-left) when the crew has not placed it. */
export const DEFAULT_WORK_BOX: Point = [0.03, 0.2];

export type ExportOptions = { date: string };

function callouts(result: AllocationResult, sheet: Sheet, marks: Mark[]): Map<string, string[]> {
  const byMark = new Map<string, string[]>();
  const sheetMarks = marks.filter((m) => m.sheetId === sheet.id);
  for (const c of result.codes) {
    const qty = c.sheets.find((s) => s.sheetId === sheet.id)?.qty ?? 0;
    if (!qty) continue;
    // A locked qty on a sheet with no marks for the code still shows in the work box.
    for (const p of splitAcrossMarks(qty, sheetMarks, c.code)) {
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
  const boxW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size))) + 14;
  const boxH = lines.length * (size + 3) + 8;
  // Up-left of the point like the hand-drawn tags, flipped inward near the page edges.
  let bx = ax - 40 - boxW;
  let by = ay + 26;
  if (bx < 16) bx = ax + 40;
  if (by + boxH > height - 16) by = ay - 26 - boxH;
  const tx = bx < ax ? bx + boxW : bx;
  const ty = by > ay ? by : by + boxH;
  page.drawLine({ start: { x: tx, y: ty }, end: { x: ax, y: ay }, thickness: 1.4, color: BLACK });
  // Arrowhead at the marked location.
  const ang = Math.atan2(ay - ty, ax - tx);
  for (const d of [0.45, -0.45]) {
    page.drawLine({
      start: { x: ax, y: ay },
      end: { x: ax - 9 * Math.cos(ang + d), y: ay - 9 * Math.sin(ang + d) },
      thickness: 1.4,
      color: BLACK,
    });
  }
  page.drawRectangle({ x: bx, y: by, width: boxW, height: boxH, color: TAG_YELLOW, borderColor: BLACK, borderWidth: 1 });
  lines.forEach((l, i) => {
    const w = font.widthOfTextAtSize(l, size);
    page.drawText(l, { x: bx + (boxW - w) / 2, y: by + boxH - 5 - (i + 1) * (size + 3) + 3, size, font, color: BLACK });
  });
}

function drawWorkBox(page: PDFPage, font: PDFFont, bold: PDFFont, sheet: Sheet, rows: { code: string; qty: number }[], date: string) {
  const { width, height } = page.getSize();
  const w = 200;
  const headH = 22;
  const rowH = 17;
  const body = Math.max(1, rows.length) + 1; // + column header row
  const h = headH + body * rowH;
  const at = sheet.workBoxAt ?? DEFAULT_WORK_BOX;
  const x = Math.min(Math.max(8, at[0] * width), width - w - 8);
  const top = Math.min(Math.max(h + 8, (1 - at[1]) * height), height - 8);
  const y = top - h;
  const mid = x + w / 2;
  const center = (t: string, f: PDFFont, size: number, cx: number, cy: number, color = BOX_BLUE) =>
    page.drawText(t, { x: cx - f.widthOfTextAtSize(t, size) / 2, y: cy, size, font: f, color });

  page.drawRectangle({ x, y, width: w, height: h, color: WHITE, borderColor: BOX_BLUE, borderWidth: 1.5 });
  page.drawRectangle({ x, y: top - headH, width: w, height: headH, color: BOX_BLUE });
  center(`WORK PERFORMED: ${date}`, bold, 10, mid, top - headH + 7, WHITE);
  page.drawRectangle({ x, y: top - headH - rowH, width: w, height: rowH, color: BOX_TINT });
  center("CODE", bold, 10, x + w / 4, top - headH - rowH + 5);
  center("QTY", bold, 10, x + (3 * w) / 4, top - headH - rowH + 5);
  for (let r = 1; r <= body; r++) {
    const ly = top - headH - r * rowH;
    page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 0.6, color: BOX_BLUE });
  }
  page.drawLine({ start: { x: mid, y }, end: { x: mid, y: top - headH }, thickness: 0.6, color: BOX_BLUE });
  if (!rows.length) center("No work on this sheet", font, 9, mid, y + 5);
  rows.forEach((r, i) => {
    const ry = top - headH - (i + 2) * rowH + 5;
    center(r.code, bold, 10, x + w / 4, ry);
    center(r.qty.toLocaleString("en-US"), bold, 10, x + (3 * w) / 4, ry);
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
    drawWorkBox(page, font, bold, sheet, rows, opts.date);
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
