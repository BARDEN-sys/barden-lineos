import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Mark, MarkItem, Point } from "./types";
import { DEMO_USER } from "./types";

/**
 * Sample WO 4222352. The print is generated (not a real Frontier print) so the repo
 * ships no customer documents; its text layer carries the same kinds of fields a real
 * print has. The marks reproduce the crew's paper markups:
 *   S10B 50 + 50 + 100 + 25 + 3600 = 3825   S16A 1800 + 1800 = 3600   S63A 1 x 5 = 5
 */

export const DEMO_WO = "4222352";
export const PAGE_W = 1224; // 17 x 11 in, landscape
export const PAGE_H = 792;

type DemoSpot = { at: Point; items: MarkItem[]; note: string };
type DemoPage = {
  streets: { name: string; from: Point; to: Point }[];
  cable?: { label: string; path: Point[]; footage: number };
  poles: { tag: string; at: Point }[];
  note?: string;
  spots: DemoSpot[];
};

export const DEMO_PAGES: DemoPage[] = [
  // Sheet 1: cover / key map — nothing highlighted, gets 0 of every code.
  {
    streets: [
      { name: "MAIN ST", from: [0.05, 0.4], to: [0.7, 0.4] },
      { name: "OAK RD", from: [0.35, 0.08], to: [0.35, 0.72] },
    ],
    poles: [],
    note: "KEY MAP - SEE SHEETS 2 THRU 6. SPLICER: VERIFY DEAD PAIRS BEFORE CUT.",
    spots: [],
  },
  {
    streets: [{ name: "MAIN ST", from: [0.04, 0.45], to: [0.72, 0.45] }],
    cable: { label: "AKF 50 24", path: [[0.08, 0.4], [0.4, 0.4], [0.66, 0.4]], footage: 449 },
    poles: [{ tag: "PPR 12", at: [0.08, 0.4] }, { tag: "PPX 14", at: [0.66, 0.4] }],
    note: "SPLICER NOTE: CUT DEAD 50 PR AT PPX 14. PLACE AIR PLUG.",
    spots: [
      { at: [0.66, 0.4], items: [{ code: "S10B", qty: 50 }], note: "Cut dead at PPX 14" },
      { at: [0.4, 0.4], items: [{ code: "S63A", qty: 1 }], note: "Air plug" },
    ],
  },
  {
    streets: [
      { name: "MAIN ST", from: [0.04, 0.3], to: [0.72, 0.3] },
      { name: "ELM AVE", from: [0.45, 0.08], to: [0.45, 0.75] },
    ],
    cable: { label: "AKF 50 24", path: [[0.1, 0.35], [0.45, 0.35], [0.45, 0.65]], footage: 312 },
    poles: [{ tag: "PPR 15", at: [0.1, 0.35] }, { tag: "PPX 18", at: [0.45, 0.65] }],
    note: "LINE CREW NOTE: REMOVE DROP AT PPX 18.",
    spots: [
      { at: [0.45, 0.65], items: [{ code: "S10B", qty: 50 }], note: "Cut dead at PPX 18" },
      { at: [0.45, 0.35], items: [{ code: "S63A", qty: 1 }], note: "Air plug" },
    ],
  },
  {
    streets: [{ name: "ELM AVE", from: [0.3, 0.06], to: [0.3, 0.78] }],
    cable: { label: "AKF 100 24", path: [[0.34, 0.1], [0.34, 0.7]], footage: 588 },
    poles: [{ tag: "PPR 22", at: [0.34, 0.1] }, { tag: "PPX 25", at: [0.34, 0.7] }],
    note: "LINE CREW NOTE: S10A LIVE CUT AT PPR 22 - SEE ENGINEER.",
    spots: [
      { at: [0.34, 0.7], items: [{ code: "S10B", qty: 100 }], note: "Cut dead at PPX 25" },
      { at: [0.34, 0.4], items: [{ code: "S63A", qty: 1 }], note: "Air plug" },
    ],
  },
  {
    streets: [
      { name: "ELM AVE", from: [0.04, 0.5], to: [0.72, 0.5] },
      { name: "RIVER RD", from: [0.6, 0.06], to: [0.6, 0.78] },
    ],
    cable: { label: "AKF 3600 26", path: [[0.06, 0.45], [0.6, 0.45], [0.6, 0.15]], footage: 726 },
    poles: [{ tag: "PPR 30", at: [0.25, 0.45] }, { tag: "PPX 31", at: [0.6, 0.15] }],
    note: "SPLICER NOTE: CUT 25 PR TAP AT PPR 30. TEST/VERIFY 1800 PR AT SPLICE.",
    spots: [
      { at: [0.25, 0.45], items: [{ code: "S10B", qty: 25 }], note: "Cut 25 pr tap at PPR 30" },
      { at: [0.6, 0.45], items: [{ code: "S16A", qty: 1800 }], note: "Test/verify at splice" },
      { at: [0.6, 0.25], items: [{ code: "S63A", qty: 1 }], note: "Air pressure device" },
    ],
  },
  {
    streets: [{ name: "RIVER RD", from: [0.08, 0.35], to: [0.72, 0.35] }],
    cable: { label: "AKF 3600 26", path: [[0.1, 0.4], [0.68, 0.4]], footage: 1040 },
    poles: [{ tag: "PPR 33", at: [0.1, 0.4] }, { tag: "PPX 36", at: [0.68, 0.4] }],
    note: "SPLICER NOTE: CUT DEAD 3600 PR FEEDER AT PPX 36. TEST/VERIFY 1800 PR.",
    spots: [
      {
        at: [0.68, 0.4],
        items: [
          { code: "S10B", qty: 3600 },
          { code: "S16A", qty: 1800 },
        ],
        note: "Cut dead feeder + test/verify",
      },
      { at: [0.4, 0.4], items: [{ code: "S63A", qty: 1 }], note: "Air pressure device" },
    ],
  },
];

const P = (pt: Point) => ({ x: pt[0] * PAGE_W, y: (1 - pt[1]) * PAGE_H });

export async function buildDemoPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`WO ${DEMO_WO} work print (demo)`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.6, 0.6, 0.6);
  const total = DEMO_PAGES.length;

  DEMO_PAGES.forEach((pg, i) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 12, y: 12, width: PAGE_W - 24, height: PAGE_H - 24, borderColor: ink, borderWidth: 1.5 });

    for (const s of pg.streets) {
      const a = P(s.from);
      const b = P(s.to);
      page.drawLine({ start: a, end: b, thickness: 14, color: rgb(0.88, 0.88, 0.88) });
      const horiz = Math.abs(a.y - b.y) < 1;
      page.drawText(s.name, {
        x: horiz ? (a.x + b.x) / 2 - 30 : a.x + 12,
        y: horiz ? a.y + 12 : (a.y + b.y) / 2,
        size: 11,
        font: bold,
        color: grey,
      });
    }
    if (pg.cable) {
      const pts = pg.cable.path.map(P);
      for (let k = 1; k < pts.length; k++) page.drawLine({ start: pts[k - 1], end: pts[k], thickness: 2, color: ink });
      const mid = pts[Math.floor(pts.length / 2) - 1] ?? pts[0];
      page.drawText(pg.cable.label, { x: mid.x + 8, y: mid.y - 16, size: 10, font, color: ink });
      page.drawText(`${pg.cable.footage}'`, { x: mid.x + 8, y: mid.y - 29, size: 10, font, color: ink });
    }
    for (const pole of pg.poles) {
      const c = P(pole.at);
      page.drawCircle({ x: c.x, y: c.y, size: 5, borderColor: ink, borderWidth: 1.2 });
      page.drawText(pole.tag, { x: c.x - 16, y: c.y + 10, size: 9, font, color: ink });
    }
    if (pg.note) page.drawText(pg.note, { x: 28, y: PAGE_H - 44, size: 10, font: bold, color: ink });

    // Title block (bottom right)
    const tb = { x: 890, y: 24, w: 310, h: 200 };
    page.drawRectangle({ x: tb.x, y: tb.y, width: tb.w, height: tb.h, borderColor: ink, borderWidth: 1 });
    const lines = [
      "COPPER RETIREMENT WORK PRINT (DEMO)",
      `W.O. # ${DEMO_WO}`,
      "PROJECT # CR-26-0187",
      "ENGINEER: J. SAMPLE / R. DEMO",
      `SHEET ${i + 1} OF ${total}`,
    ];
    lines.forEach((t, k) => page.drawText(t, { x: tb.x + 10, y: tb.y + tb.h - 18 - k * 15, size: 10, font: k ? font : bold, color: ink }));
    page.drawText("UNITS / ACCT CODES:", { x: tb.x + 10, y: tb.y + 96, size: 9, font: bold, color: ink });
    page.drawRectangle({ x: tb.x + 8, y: tb.y + 8, width: tb.w - 16, height: 82, borderColor: grey, borderWidth: 0.8 });
  });

  return doc.save();
}

/** Crew markups for the demo job; sheetIds must be in page order. */
export function buildDemoMarks(jobId: string, sheetIds: string[], now = new Date().toISOString()): Mark[] {
  const marks: Mark[] = [];
  DEMO_PAGES.forEach((pg, i) => {
    const sheetId = sheetIds[i];
    if (pg.cable && pg.spots.length) {
      marks.push({
        id: `demo-run-${i + 1}`,
        jobId,
        sheetId,
        kind: "run",
        points: pg.cable.path,
        lengthFt: pg.cable.footage,
        pairCount: Number(pg.cable.label.split(" ")[1]),
        items: [],
        note: `Highlighted ${pg.cable.label}`,
        createdBy: DEMO_USER,
        createdAt: now,
      });
    }
    pg.spots.forEach((s, k) =>
      marks.push({
        id: `demo-spot-${i + 1}-${k + 1}`,
        jobId,
        sheetId,
        kind: "spot",
        points: [s.at],
        items: s.items,
        note: s.note,
        createdBy: DEMO_USER,
        createdAt: now,
      }),
    );
  });
  return marks;
}
