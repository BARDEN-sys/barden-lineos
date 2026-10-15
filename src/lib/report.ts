import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { workPerformed, type AllocationResult } from "./allocation";
import type { Job, Photo } from "./types";

// Job report: one PDF a foreman can send with the sheets — header, units vs master,
// flags, work by sheet, crew notes (who / when) and the job photos.

const PAGE: [number, number] = [612, 792]; // US Letter portrait
export const M = 40;
export const INK = rgb(0.1, 0.1, 0.12);
export const MUTED = rgb(0.4, 0.42, 0.47);
export const BLUE = rgb(0.12, 0.27, 0.56); // BARDEN logo blue
export const RED = rgb(0.75, 0.1, 0.1);
export const AMBER = rgb(0.65, 0.4, 0.0);
export const GREEN = rgb(0.05, 0.5, 0.25);
const RULE = rgb(0.85, 0.86, 0.88);

export type ReportOptions = {
  date: string;
  preparedBy: string;
  /** BARDEN logo, PNG or JPEG bytes (public/barden-logo.png in the app). Text wordmark if absent. */
  logo?: Uint8Array;
};

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

export class Cursor {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly footer: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(PAGE);
    this.pageNo++;
    this.y = PAGE[1] - M;
    this.page.drawText(`${this.footer} · page ${this.pageNo}`, { x: M, y: 20, size: 8, font: this.font, color: MUTED });
  }
  need(h: number) {
    if (this.y - h < M) this.newPage();
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const f = o.bold ? this.bold : this.font;
    const x = o.x ?? M;
    for (const line of wrap(t, f, size, PAGE[0] - M - x)) {
      this.need(size + 4);
      this.page.drawText(line, { x, y: this.y - size, size, font: f, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 0;
  }
  heading(t: string, keepWith = 40) {
    this.need(keepWith);
    this.y -= 10;
    this.text(t, { size: 13, bold: true, color: BLUE });
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE[0] - M, y: this.y }, thickness: 1, color: BLUE });
    this.y -= 8;
  }
  /** A table row: cells at x offsets; right-aligned when align[i] === "r". */
  row(cells: string[], xs: number[], o: { bold?: boolean; align?: ("l" | "r")[]; colors?: (ReturnType<typeof rgb> | undefined)[] } = {}) {
    const size = 9;
    this.need(size + 8);
    const f = o.bold ? this.bold : this.font;
    cells.forEach((c, i) => {
      const right = o.align?.[i] === "r";
      const nextX = xs[i + 1] ?? PAGE[0] - M;
      const maxW = nextX - xs[i] - 6;
      let s = c;
      while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -2) + "…";
      const x = right ? nextX - 6 - f.widthOfTextAtSize(s, size) : xs[i];
      this.page.drawText(s, { x, y: this.y - size, size, font: f, color: o.colors?.[i] ?? INK });
    });
    this.y -= size + 5;
    this.page.drawLine({ start: { x: M, y: this.y + 1 }, end: { x: PAGE[0] - M, y: this.y + 1 }, thickness: 0.5, color: RULE });
    this.y -= 2;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export const fmt = (n: number) => n.toLocaleString("en-US");
export const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};

/** New report document with the BARDEN header and a title block of facts. */
export async function startReport(job: Job, title: string, footer: string, facts: [string, string][], logoBytes?: Uint8Array) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  const c = new Cursor(doc, font, bold, footer);

  // Header: logo (or wordmark) top-left, app name top-right.
  let logo: PDFImage | null = null;
  if (logoBytes?.length) {
    try {
      logo = isPng(logoBytes) ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
    } catch {
      logo = null;
    }
  }
  const logoH = 40;
  if (logo) {
    const w = Math.min(200, (logoH * logo.width) / logo.height);
    const h = (w * logo.height) / logo.width;
    c.page.drawImage(logo, { x: M, y: c.y - h, width: w, height: h });
  } else {
    c.page.drawText("BARDEN", { x: M, y: c.y - 26, size: 26, font: bold, color: INK });
    c.page.drawRectangle({ x: M, y: c.y - 34, width: bold.widthOfTextAtSize("BARDEN", 26), height: 3, color: BLUE });
  }
  const app = "LineOS";
  c.page.drawText(app, { x: PAGE[0] - M - bold.widthOfTextAtSize(app, 11), y: c.y - 14, size: 11, font: bold, color: MUTED });
  c.y -= logoH + 14;
  c.text(title, { size: 20, bold: true, gap: 4 });
  for (const [k, v] of facts) c.row([k, v], [M, M + 90]);
  c.y -= 6;
  return { doc, c, font, bold };
}

export const sheetLabel = (job: Job) => (id: string | null) => job.sheets.find((s) => s.id === id)?.label ?? "—";

export async function buildJobReport(job: Job, result: AllocationResult, opts: ReportOptions): Promise<Uint8Array> {
  const wo = job.header.woNumber || "—";
  const { doc, c } = await startReport(
    job,
    `Job Report — WO ${wo}`,
    `BARDEN LineOS · WO ${wo} job report · ${opts.date}`,
    [
      ["Project", [job.header.name, job.header.projectNumber && `#${job.header.projectNumber}`].filter(Boolean).join(" ") || "—"],
      ["Engineers", job.header.engineers.join(", ") || "—"],
      ["Print", `${job.pdfName} (${job.sheets.length} sheets)`],
      ["Report date", opts.date],
      ["Prepared by", opts.preparedBy],
    ],
    opts.logo,
  );
  const label = sheetLabel(job);
  if (result.canExport) c.text("Status: ready to export — no code is over master.", { bold: true, color: GREEN });
  else for (const b of result.blockers) c.text(`Status: EXPORT BLOCKED — ${b}`, { bold: true, color: RED });

  // Units vs master
  c.heading("Units vs master");
  const ux = [M, M + 45, M + 195, M + 270, M + 330, M + 390, M + 455];
  c.row(["Code", "Description", "Task code", "Master", "Placed", "Remaining", "Status"], ux, { bold: true, align: ["l", "l", "l", "r", "r", "r", "l"] });
  for (const u of result.codes) {
    const color = u.status === "over" ? RED : u.status === "ok" ? GREEN : AMBER;
    const task = job.master.find((m) => m.code === u.code)?.taskCode ?? "—";
    c.row([u.code, u.description, task, fmt(u.master), fmt(u.total), fmt(u.remaining), u.status.toUpperCase()], ux, {
      align: ["l", "l", "l", "r", "r", "r", "l"],
      colors: [undefined, undefined, BLUE, undefined, undefined, u.remaining < 0 ? RED : undefined, color],
    });
  }
  const sheetOverrides = job.sheets.flatMap((s) => Object.entries(s.taskCodes ?? {}).map(([code, t]) => `Sheet ${s.label}: ${code} → ${t}`));
  if (sheetOverrides.length) c.text(`Task codes changed by sheet — ${sheetOverrides.join(" · ")}`, { size: 8, color: MUTED });
  if (job.daily.length) {
    const billed = job.master.map((m) => `${m.code} ${fmt(job.daily.filter((e) => e.unitCode === m.code).reduce((a, e) => a + e.qty, 0))}`);
    c.text(`Billed in daily input to date: ${billed.join(" · ")}`, { size: 8, color: MUTED });
  }

  if (result.flags.length) {
    c.heading("Flags");
    for (const f of result.flags) {
      const where = f.sheetIds.length ? ` (sheet ${f.sheetIds.map(label).join(", ")})` : "";
      c.text(
        f.reason === "not-in-master"
          ? `${f.code} — marked or on the print${where} but not in the master list. Not counted.`
          : `${f.code} — in the master but not in the code glossary.`,
        { color: AMBER },
      );
    }
  }

  // Work by sheet
  c.heading("Work by sheet");
  const sx = [M, M + 70, M + 380, M + 450];
  c.row(["Sheet", "Work performed", "Marks", "Photos"], sx, { bold: true, align: ["l", "l", "r", "r"] });
  for (const s of job.sheets) {
    const rows = workPerformed(result, s.id);
    const marks = job.marks.filter((m) => m.sheetId === s.id);
    const photos = job.photos.filter((p) => p.sheetId === s.id);
    c.row(
      [s.label, rows.length ? rows.map((r) => `${r.code} ${fmt(r.qty)}`).join(" · ") : "No work", String(marks.length), String(photos.length)],
      sx,
      { align: ["l", "l", "r", "r"] },
    );
  }

  // Crew notes and edits (audit trail)
  const noted = job.marks.filter((m) => m.items.length || (m.note && m.note !== "Removal"));
  if (noted.length || job.overrides.length) {
    c.heading("Crew marks and changes");
    const nx = [M, M + 40, M + 220, M + 385, M + 460];
    c.row(["Sheet", "Codes", "Note", "By", "When"], nx, { bold: true });
    for (const m of noted) {
      c.row(
        [label(m.sheetId), m.items.map((i) => `${i.code} ${fmt(i.qty)}`).join(", ") || (m.kind === "run" ? `Run ${m.lengthFt ?? "?"}'` : "—"), m.note ?? "", m.updatedBy ?? m.createdBy, when(m.updatedAt ?? m.createdAt)],
        nx,
      );
    }
    for (const o of job.overrides) {
      c.row([label(o.sheetId), `${o.code} ${fmt(o.qty)} (locked)`, "Manual override", o.createdBy, when(o.createdAt)], nx, {
        colors: [undefined, BLUE],
      });
    }
    const removals = job.marks.filter((m) => m.kind === "spot" && !m.items.length).length;
    if (removals) c.text(`Plus ${removals} removal spot(s) marked without unit codes.`, { size: 9, color: MUTED });
  }

  await drawPhotos(c, job.photos, label);
  return doc.save();
}

/** Photos two per row with a caption line. */
export async function drawPhotos(c: Cursor, photos: Photo[], label: (id: string | null) => string, heading = "Photos") {
  if (!photos.length) return;
  c.heading(heading, 280);
  const colW = (PAGE[0] - 2 * M - 12) / 2;
  let col = 0;
  let rowH = 0;
  for (const p of photos) {
    let img: PDFImage;
    try {
      img = await c.doc.embedJpg(new Uint8Array(await p.blob.arrayBuffer()));
    } catch {
      continue;
    }
    const h = Math.min(220, (colW * img.height) / img.width);
    const w = (h * img.width) / img.height;
    if (col === 0) {
      c.need(h + 24);
      rowH = 0;
    }
    const x = M + col * (colW + 12);
    c.page.drawImage(img, { x, y: c.y - h, width: w, height: h });
    c.page.drawText(`Sheet ${label(p.sheetId)} · ${p.kind === "markup" ? "marked-up print" : "field"} · ${p.createdBy} · ${when(p.takenAt)}`, {
      x,
      y: c.y - h - 11,
      size: 8,
      font: c.font,
      color: MUTED,
    });
    rowH = Math.max(rowH, h + 20);
    col = (col + 1) % 2;
    if (col === 0) c.y -= rowH;
  }
  if (col === 1) c.y -= rowH;
}
