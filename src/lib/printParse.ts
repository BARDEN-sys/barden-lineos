import type { JobHeader, PdfRect } from "./types";

/** A positioned text run from the PDF text layer (PDF user space, origin bottom-left). */
export type TextItem = { str: string; x: number; y: number; w: number; h: number };

export type ParsedPage = {
  label: string | null;
  streets: string[];
  cableLabels: string[];
  footages: number[];
  tags: string[];
  notes: string[];
  codesFound: string[];
  unitsBlock?: PdfRect;
  header: Partial<JobHeader>;
};

/** Join text items that sit on the same baseline into lines, top to bottom. */
export function toLines(items: TextItem[]): { text: string; x: number; y: number }[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { parts: TextItem[]; y: number }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < 2);
    if (line) line.parts.push(it);
    else lines.push({ parts: [it], y: it.y });
  }
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    return { text: parts.map((p) => p.str.trim()).join(" "), x: parts[0].x, y: l.y };
  });
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

const STREET = /\b((?:[NSEW]\.?\s)?[A-Z0-9][A-Z0-9.']*(?:\s[A-Z0-9][A-Z0-9.']*){0,3}\s(?:ST|RD|AVE|DR|LN|HWY|BLVD|CT|WAY|PL|PKWY|CIR|TRL|PIKE|ROAD|STREET|AVENUE|LANE|DRIVE))\b/g;
const CABLE = /\b([A-Z]{2,4}\s\d{1,4}\s\d{1,4})\b/g;
const FOOTAGE = /(?<![\w.])(\d{1,5})\s?['’]/g;
const TAG = /\bPP[RX](?:[\s#-]*\d+)?\b/g;
const CODE = /\b([A-Z]\d{2}[A-Z]\d?)\b/g;
const NOTE = /\b(SPLICER|LINE CREW|CREW NOTE|NOTE)\b/;
const WO = /\bW\.?O\.?\s*(?:#|NO\.?)?\s*:?\s*(\d{6,9})\b/;
// "PROJECT#4222058", "PROJECT # CR-26-0187", "PROJECT NUMBER: 4222058"
const PROJECT = /\bPROJ(?:ECT)?\.?\s*(?:#|NO\.?|NUMBER)?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})\b/;
// Needs the colon so notes like "SEE ENGINEER" are not read as the engineer field.
// Real prints use "KCI ENG: …" / "FTR ENG: …"; the name ends at "PH#" / "PHONE".
const ENGINEER = /\b(?:(?:[A-Z]{2,4}\s)?ENG(?:INEER)?S?)\s*:\s*(.+?)(?:\s+(?:PH(?:ONE)?\s*#?:?).*)?$/;
const SHEET = /\b(?:SHEET|SHT)\s*:?\s*(\d+)(?:\s*OF\s*(\d+))?\b/;
const UNITS = /\bUNITS\b|\bACCT\.?\s*CODES?\b/;

export function parsePage(items: TextItem[], pageWidth: number): ParsedPage {
  const lines = toLines(items);
  const upper = lines.map((l) => ({ ...l, text: l.text.toUpperCase() }));
  const out: ParsedPage = {
    label: null,
    streets: [],
    cableLabels: [],
    footages: [],
    tags: [],
    notes: [],
    codesFound: [],
    header: {},
  };

  for (const { text } of upper) {
    const wo = text.match(WO);
    if (wo && !out.header.woNumber) out.header.woNumber = wo[1];
    const pj = text.match(PROJECT);
    if (pj && !out.header.projectNumber) out.header.projectNumber = pj[1];
    const en = text.match(ENGINEER);
    if (en) out.header.engineers = uniq([...(out.header.engineers ?? []), ...en[1].split(/\s*[,/&]\s*/).filter(Boolean)]);
    const sh = text.match(SHEET);
    if (sh && !out.label) out.label = sh[2] ? `${sh[1]} of ${sh[2]}` : sh[1];

    if (NOTE.test(text)) out.notes.push(text);
    // Header lines (WO / PROJECT / ENGINEER) contain digits that look like other fields.
    if (wo || pj || en) continue;
    for (const m of text.matchAll(STREET)) out.streets.push(m[1].trim());
    for (const m of text.matchAll(CABLE)) out.cableLabels.push(m[1]);
    for (const m of text.matchAll(FOOTAGE)) out.footages.push(Number(m[1]));
    for (const m of text.matchAll(TAG)) out.tags.push(m[0].replace(/\s+/g, " "));
    for (const m of text.matchAll(CODE)) out.codesFound.push(m[1]);
  }

  const unitsLine = upper.find((l) => UNITS.test(l.text));
  if (unitsLine) {
    const w = Math.min(220, pageWidth - unitsLine.x - 8);
    out.unitsBlock = { x: unitsLine.x, y: Math.max(8, unitsLine.y - 84), w, h: 76 };
  }

  out.streets = uniq(out.streets);
  out.cableLabels = uniq(out.cableLabels);
  out.footages = uniq(out.footages);
  out.tags = uniq(out.tags);
  out.notes = uniq(out.notes);
  out.codesFound = uniq(out.codesFound).sort();
  return out;
}

/** Merge the first-seen header values across every page. */
export function mergeHeaders(pages: ParsedPage[]): JobHeader {
  const h: JobHeader = { woNumber: "", projectNumber: "", engineers: [] };
  for (const p of pages) {
    h.woNumber ||= p.header.woNumber ?? "";
    h.projectNumber ||= p.header.projectNumber ?? "";
    h.engineers = uniq([...h.engineers, ...(p.header.engineers ?? [])]);
  }
  return h;
}
