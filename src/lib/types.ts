import { z } from "zod";

// Every record that a crew member can create carries jobId + createdBy + createdAt
// so M4 (Supabase, crew logins, audit trail) can persist it without reshaping data.

export const UnitType = z.enum(["FOOTAGE", "PAIRS", "EACH"]);
export type UnitType = z.infer<typeof UnitType>;

export const CODE_PATTERN = /^[A-Z]\d{2}[A-Z]\d?$/;
export const UnitCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CODE_PATTERN, "Code looks like S10B or P22K1");

export const GlossaryEntry = z.object({
  code: UnitCode,
  description: z.string().trim().min(1),
  unitType: UnitType,
});
export type GlossaryEntry = z.infer<typeof GlossaryEntry>;

export const MasterItem = z.object({
  code: UnitCode,
  description: z.string().trim(),
  estQty: z.number().int().nonnegative(),
  /** Billing task code for this unit code; a sheet can override it. */
  taskCode: z.string().trim().optional(),
});
export type MasterItem = z.infer<typeof MasterItem>;

/** Normalised page coordinates: 0..1 from the top-left of the page. */
export const Point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export type Point = z.infer<typeof Point>;

/** One code and quantity claimed at a marked location (e.g. S10B, 50 pairs). */
export const MarkItem = z.object({
  code: UnitCode,
  qty: z.number().int().nonnegative(),
});
export type MarkItem = z.infer<typeof MarkItem>;

export const MarkKind = z.enum(["run", "spot"]);
export type MarkKind = z.infer<typeof MarkKind>;

export const Mark = z.object({
  id: z.string(),
  jobId: z.string(),
  sheetId: z.string(),
  kind: MarkKind,
  /** run: polyline (>= 2 points); spot: exactly 1 point. */
  points: z.array(Point).min(1),
  lengthFt: z.number().nonnegative().optional(),
  pairCount: z.number().int().nonnegative().optional(),
  items: z.array(MarkItem),
  note: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Mark = z.infer<typeof Mark>;

/** A crew override of the engine's number for one code on one sheet. */
export const Override = z.object({
  jobId: z.string(),
  sheetId: z.string(),
  code: UnitCode,
  qty: z.number().int().nonnegative(),
  locked: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type Override = z.infer<typeof Override>;

/** Rectangle in PDF user space (points, origin bottom-left) — matches pdf-lib. */
export const PdfRect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type PdfRect = z.infer<typeof PdfRect>;

export const Sheet = z.object({
  id: z.string(),
  jobId: z.string(),
  pageIndex: z.number().int().nonnegative(),
  label: z.string(),
  widthPt: z.number().positive(),
  heightPt: z.number().positive(),
  streets: z.array(z.string()),
  cableLabels: z.array(z.string()),
  footages: z.array(z.number()),
  tags: z.array(z.string()),
  notes: z.array(z.string()),
  codesFound: z.array(z.string()),
  unitsBlock: PdfRect.optional(),
  /** Top-left of the WORK PERFORMED box (normalised); crew taps an empty spot on the map. */
  workBoxAt: Point.optional(),
  /** Per-sheet billing task code overrides, by unit code. Blank = master task code. */
  taskCodes: z.record(z.string(), z.string()).optional(),
});
export type Sheet = z.infer<typeof Sheet>;

export const JobHeader = z.object({
  woNumber: z.string(),
  projectNumber: z.string(),
  engineers: z.array(z.string()),
});
export type JobHeader = z.infer<typeof JobHeader>;

/** A photo taken on the job: the marked-up paper sheet, or the work in the field. */
export type PhotoKind = "markup" | "field";
export type Photo = {
  id: string;
  jobId: string;
  /** null = job-level photo not tied to a sheet. */
  sheetId: string | null;
  kind: PhotoKind;
  /** Downscaled JPEG; M4 uploads this to Supabase storage. */
  blob: Blob;
  url: string;
  width: number;
  height: number;
  takenAt: string;
  createdBy: string;
};

/** One billing row of daily input: what was done that day, under which task code. */
export const DailyEntry = z.object({
  id: z.string(),
  jobId: z.string(),
  /** Local work day, YYYY-MM-DD. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sheetId: z.string().nullable(),
  unitCode: UnitCode,
  taskCode: z.string().trim(),
  qty: z.number().int().nonnegative(),
  note: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type DailyEntry = z.infer<typeof DailyEntry>;

export type Job = {
  id: string;
  header: JobHeader;
  pdfName: string;
  pdfBytes: Uint8Array | null;
  sheets: Sheet[];
  master: MasterItem[];
  glossary: GlossaryEntry[];
  marks: Mark[];
  overrides: Override[];
  photos: Photo[];
  daily: DailyEntry[];
  createdBy: string;
  createdAt: string;
};

/** Demo mode has no auth; M4 replaces this with the signed-in user id. */
export const DEMO_USER = "demo-foreman";
