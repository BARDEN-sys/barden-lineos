import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Mark, MarkItem, Point } from "./types";
import { DEMO_USER } from "./types";

/**
 * Sample WO 4222352, laid out after the crew's marked-up paper prints (photos 10/8/2026).
 * The print itself is generated so the repo ships no customer documents; names and most
 * detail are placeholders. What matters is copied from the photos:
 *
 *   Sheet 2 (Tarpon Dr):      splice 1  P22K1, S10B 50     splice 2  P22K1, S10B 50
 *                             3rd St E / 4th St E aerial copper, terminals removed (pink)
 *   Sheet 3 (Dolphin Dr):     splice 3  P22K1, S10B 100    splice 4  P22K1, S10B 25
 *                             Dolphin Dr cable highlighted yellow (retire in place)
 *   Sheet 5 (Haven Point Dr): splice 5  S16A 1800, S10A 1800, S10B 3600
 *                             "South Beach Golf" S16A 1800
 *
 *   S10B 50 + 50 + 100 + 25 + 3600 = 3825   S16A 1800 + 1800 = 3600   (= master)
 *   S10A and P22K1 are on the markups but not in the master -> flagged, get 0.
 *   S63A (master 5) is not written on any photographed sheet -> left unmarked.
 *   Sheets 1 and 4 were not photographed.
 */

export const DEMO_WO = "4222352";
export const PAGE_W = 1224; // 17 x 11 in, landscape
export const PAGE_H = 792;

type DemoSpot = { at: Point; items: MarkItem[]; note: string };
type DemoRun = { path: Point[]; footage: number; label: string };
type DemoPage = {
  title: string;
  streets: { name: string; from: Point; to: Point }[];
  cables: { label: string; footage: number; at: Point }[];
  poles: { tag: string; at: Point }[];
  splices: { n: number; at: Point }[];
  notes: string[];
  runs: DemoRun[];
  spots: DemoSpot[];
  /** Pink removal marks (terminals/drops) with no unit code written next to them. */
  removals: Point[];
};

export const DEMO_PAGES: DemoPage[] = [
  {
    title: "KEY MAP",
    streets: [
      { name: "TARPON DR", from: [0.05, 0.3], to: [0.7, 0.3] },
      { name: "HAVEN POINT DR", from: [0.05, 0.6], to: [0.7, 0.6] },
    ],
    cables: [],
    poles: [],
    splices: [],
    notes: ["LINE CREW NOTES: PLEASE MAKE SURE YOU HAVE ALL ACCESS NUMBERS FOR YOUR P58 FORM."],
    runs: [],
    spots: [],
    removals: [],
  },
  {
    title: "TARPON DR",
    streets: [
      { name: "TARPON DR", from: [0.05, 0.22], to: [0.72, 0.22] },
      { name: "3RD ST E", from: [0.3, 0.22], to: [0.22, 0.88] },
      { name: "4TH ST E", from: [0.5, 0.22], to: [0.42, 0.88] },
    ],
    cables: [
      { label: "AKF 50 24", footage: 312, at: [0.31, 0.32] },
      { label: "AKF 50 24", footage: 287, at: [0.51, 0.32] },
    ],
    poles: [
      { tag: "PPR", at: [0.12, 0.22] },
      { tag: "PPX TRANSDUCER", at: [0.44, 0.84] },
    ],
    splices: [
      { n: 1, at: [0.3, 0.22] },
      { n: 2, at: [0.5, 0.22] },
    ],
    notes: [
      "SPLICER NOTE: AERIAL COPPER WITH FIBER LASHED TO IT ON 3RD ST E & 4TH ST E. REMOVE ALL TERMINALS & DROPS.",
      "SPLICER NOTE: CUT TERM TAILS BELOW GRADE AND REMOVE PEDS",
    ],
    runs: [],
    spots: [
      { at: [0.3, 0.22], items: [{ code: "P22K1", qty: 1 }, { code: "S10B", qty: 50 }], note: "Splice 1" },
      { at: [0.5, 0.22], items: [{ code: "P22K1", qty: 1 }, { code: "S10B", qty: 50 }], note: "Splice 2" },
    ],
    removals: [
      [0.29, 0.33], [0.28, 0.45], [0.27, 0.57], [0.26, 0.69], [0.49, 0.36], [0.48, 0.5], [0.47, 0.64], [0.46, 0.76],
    ],
  },
  {
    title: "DOLPHIN DR",
    streets: [
      { name: "TREASURE ISLAND CSWY", from: [0.25, 0.18], to: [0.72, 0.18] },
      { name: "DOLPHIN DR", from: [0.08, 0.62], to: [0.68, 0.62] },
    ],
    cables: [
      { label: "AKF 100 24", footage: 406, at: [0.1, 0.72] },
      { label: "AKF 200 24", footage: 103, at: [0.58, 0.48] },
    ],
    poles: [
      { tag: "PPR", at: [0.22, 0.6] },
      { tag: "PPX RISER", at: [0.6, 0.55] },
    ],
    splices: [
      { n: 3, at: [0.64, 0.6] },
      { n: 4, at: [0.34, 0.62] },
    ],
    notes: [
      "SPLICER NOTE: ON DOLPHIN DR ALL TERMINALS & DROPS HAVE BEEN REMOVED. RETIRE IN PLACE AERIAL COPPER CABLE.",
      "SPLICER NOTE: CUT RISER BELOW GRADE",
    ],
    runs: [
      { path: [[0.22, 0.55], [0.12, 0.62], [0.16, 0.76], [0.34, 0.68], [0.66, 0.66]], footage: 406, label: "AKF 100 24 retire in place" },
      { path: [[0.22, 0.55], [0.32, 0.52], [0.42, 0.58]], footage: 246, label: "AEF 25 24 retire in place" },
    ],
    spots: [
      { at: [0.64, 0.6], items: [{ code: "P22K1", qty: 1 }, { code: "S10B", qty: 100 }], note: "Splice 3 (PPX riser)" },
      { at: [0.34, 0.62], items: [{ code: "P22K1", qty: 1 }, { code: "S10B", qty: 25 }], note: "Splice 4" },
    ],
    removals: [[0.3, 0.55], [0.4, 0.18], [0.52, 0.2], [0.63, 0.22], [0.7, 0.3], [0.72, 0.38], [0.71, 0.46]],
  },
  {
    title: "PARADISE BLVD",
    streets: [{ name: "PARADISE BLVD", from: [0.3, 0.08], to: [0.3, 0.85] }],
    cables: [],
    poles: [],
    splices: [],
    notes: ["LINE CREW NOTES: REMOVE CABLE AND POLES THAT APPLY"],
    runs: [],
    spots: [],
    removals: [],
  },
  {
    title: "HAVEN POINT DR",
    streets: [
      { name: "HAVEN POINT DR", from: [0.08, 0.32], to: [0.62, 0.62] },
      { name: "SANDY HOOK RD", from: [0.2, 0.25], to: [0.7, 0.45] },
    ],
    cables: [
      { label: "ASP 1800 26", footage: 30, at: [0.2, 0.5] },
      { label: "AKF 1200 26", footage: 25, at: [0.13, 0.66] },
      { label: "AKF 100 24", footage: 255, at: [0.2, 0.42] },
    ],
    poles: [
      { tag: "PPX", at: [0.21, 0.24] },
      { tag: "PPX TRANSDUCER", at: [0.1, 0.58] },
    ],
    splices: [{ n: 5, at: [0.18, 0.36] }],
    notes: ["SPLICER NOTE: CUT CABLES BELOW GRADE AND REMOVE XBOX AND PAD", "SPLICER NOTE: REMOVE TRANSDUCER"],
    runs: [],
    spots: [
      {
        at: [0.15, 0.36],
        items: [
          { code: "S16A", qty: 1800 },
          { code: "S10A", qty: 1800 },
          { code: "S10B", qty: 3600 },
        ],
        note: "Splice 5: cut & cap main cable",
      },
      { at: [0.66, 0.24], items: [{ code: "S16A", qty: 1800 }], note: "South Beach Golf" },
    ],
    removals: [[0.08, 0.42], [0.58, 0.72]],
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
      page.drawLine({ start: a, end: b, thickness: 14, color: rgb(0.9, 0.9, 0.9) });
      page.drawLine({ start: a, end: b, thickness: 1.2, color: ink });
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      page.drawText(s.name, { x: mid.x + 8, y: mid.y + 10, size: 10, font: bold, color: grey });
    }
    for (const c of pg.cables) {
      const at = P(c.at);
      page.drawText("PPR", { x: at.x, y: at.y + 14, size: 9, font: bold, color: ink });
      page.drawText("2423.101 06.1990", { x: at.x, y: at.y + 3, size: 7, font, color: ink });
      page.drawText(c.label, { x: at.x, y: at.y - 7, size: 7, font, color: ink });
      page.drawText(`${c.footage}'`, { x: at.x, y: at.y - 17, size: 7, font, color: ink });
    }
    for (const pole of pg.poles) {
      const c = P(pole.at);
      page.drawCircle({ x: c.x, y: c.y, size: 4, borderColor: ink, borderWidth: 1 });
      page.drawText(pole.tag, { x: c.x + 7, y: c.y - 3, size: 8, font, color: ink });
    }
    for (const s of pg.splices) {
      const c = P(s.at);
      page.drawLine({ start: { x: c.x - 6, y: c.y - 6 }, end: { x: c.x + 6, y: c.y + 6 }, thickness: 2, color: ink });
      page.drawLine({ start: { x: c.x - 2, y: c.y - 8 }, end: { x: c.x + 8, y: c.y + 2 }, thickness: 2, color: ink });
      page.drawCircle({ x: c.x + 18, y: c.y - 16, size: 9, borderColor: ink, borderWidth: 1 });
      page.drawText(String(s.n), { x: c.x + 15, y: c.y - 20, size: 9, font: bold, color: ink });
    }
    for (const r of pg.removals) {
      const c = P(r);
      page.drawText("X", { x: c.x - 3, y: c.y - 4, size: 10, font, color: ink });
    }
    pg.notes.forEach((n, k) => {
      const y = PAGE_H - 40 - k * 26;
      page.drawRectangle({ x: 26, y: y - 6, width: font.widthOfTextAtSize(n, 9) + 12, height: 20, borderColor: ink, borderWidth: 0.8 });
      page.drawText(n, { x: 32, y, size: 9, font, color: ink });
    });

    // Title block (bottom right), laid out like the real prints.
    const tb = { x: 920, y: 24, w: 280, h: 190 };
    page.drawRectangle({ x: tb.x, y: tb.y, width: tb.w, height: tb.h, borderColor: ink, borderWidth: 1 });
    const lines = [
      `70330 WO #${DEMO_WO}`,
      "KCI ENG: A. SAMPLE PHONE: 000-000-0000",
      "FTR ENG: B. SAMPLE PHONE: 000-000-0000",
      "PROJECT NUMBER: 4222352",
      `SHT: ${i + 1} OF ${total}  ${pg.title}`,
    ];
    lines.forEach((t, k) => page.drawText(t, { x: tb.x + 10, y: tb.y + tb.h - 18 - k * 14, size: 9, font: k ? font : bold, color: ink }));
    page.drawText("UNITS / ACCT CODES", { x: tb.x + 10, y: tb.y + 96, size: 9, font: bold, color: ink });
    page.drawRectangle({ x: tb.x + 8, y: tb.y + 8, width: tb.w - 16, height: 82, borderColor: grey, borderWidth: 0.8 });
  });

  return doc.save();
}

/** Day the crew dated the marked-up sheets ("4222352 9/29/2026"). */
export const DEMO_WORK_DAY = "2026-09-29";

/** Crew markups for the demo job; sheetIds must be in page order. Timed through the work day. */
export function buildDemoMarks(jobId: string, sheetIds: string[], day = DEMO_WORK_DAY): Mark[] {
  const marks: Mark[] = [];
  const start = new Date(`${day}T07:30:00`).getTime(); // local time
  let n = 0;
  // Each mark is stamped 12 minutes after the previous one.
  const base = () => ({ jobId, createdBy: DEMO_USER, createdAt: new Date(start + n++ * 12 * 60_000).toISOString() });
  DEMO_PAGES.forEach((pg, i) => {
    const sheetId = sheetIds[i];
    pg.runs.forEach((r, k) =>
      marks.push({
        ...base(),
        id: `demo-run-${i + 1}-${k + 1}`,
        sheetId,
        kind: "run",
        points: r.path,
        lengthFt: r.footage,
        pairCount: Number(r.label.split(" ")[1]) || undefined,
        items: [],
        note: r.label,
      }),
    );
    pg.spots.forEach((s, k) =>
      marks.push({ ...base(), id: `demo-spot-${i + 1}-${k + 1}`, sheetId, kind: "spot", points: [s.at], items: s.items, note: s.note }),
    );
    pg.removals.forEach((at, k) =>
      marks.push({ ...base(), id: `demo-rm-${i + 1}-${k + 1}`, sheetId, kind: "spot", points: [at], items: [], note: "Removal" }),
    );
  });
  return marks;
}
