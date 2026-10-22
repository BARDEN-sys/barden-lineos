import { unzipSync, strFromU8 } from "fflate";
import { pathFt, type LatLng } from "./geo";
import type { Job, KmlRun, Mark, Point, RunGroup } from "./types";

// Google Earth runs (.kml / .kmz). Each Placemark with a LineString is one run. The footage
// that feeds the unit codes is the printed callout total from the Placemark's description
// table; the length of the line on the map is only a cross-check.
// A Folder can also carry the table itself with no lines in it (the real WO 4222528 file does
// this for PPR); that becomes a table-only run: reference footage, no map line, never billed.

/** Map length vs printed footage beyond this fraction flags the run. */
export const MISMATCH_LIMIT = 0.15;

export type Callout = { label: string; ft: number };

export type ParsedRun = {
  name: string;
  /** Folder names from the outermost down to the Placemark. */
  folders: string[];
  group: RunGroup;
  /** One or more line pieces (MultiGeometry); [lng, lat] like KML. */
  lines: [number, number][][];
  description: string;
  callouts: Callout[];
  /** Total row printed in the table, when there is one. */
  printedTotal: number | null;
  /** Footage used for the codes: the printed total, else the sum of the callouts. */
  printedFt: number;
  mapFt: number;
  mismatch: boolean;
};

// ---------- File reading ----------

/** Text of a .kml, or the main .kml inside a .kmz (zip). */
export function kmlText(bytes: Uint8Array): string {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes, { filter: (f) => /\.kml$/i.test(f.name) });
    const names = Object.keys(files);
    if (!names.length) throw new Error("This .kmz has no .kml inside.");
    // Google Earth names the main file doc.kml; otherwise take the top-most one.
    const main = names.find((n) => /(^|\/)doc\.kml$/i.test(n)) ?? names.sort((a, b) => a.split("/").length - b.split("/").length)[0];
    return strFromU8(files[main]);
  }
  return strFromU8(bytes);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text content of an XML element body: CDATA kept as-is, otherwise entities decoded. */
function elementText(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

const childText = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return m ? elementText(m[1]).trim() : "";
};

export function parseCoordinates(s: string): [number, number][] {
  const out: [number, number][] = [];
  for (const tuple of s.trim().split(/\s+/)) {
    const [lng, lat] = tuple.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

export function groupOf(folders: string[], name: string): RunGroup {
  for (const f of [...folders].reverse()) {
    if (/\bPPX\b/i.test(f)) return "PPX";
    if (/\bPPR\b/i.test(f)) return "PPR";
  }
  if (/\bPPX\b/i.test(name)) return "PPX";
  if (/\bPPR\b/i.test(name)) return "PPR";
  return "OTHER";
}

// ---------- Callout table in the description ----------

/** Description HTML (or plain text) as rows of cell text. */
export function descriptionRows(desc: string): string[][] {
  const html = desc.replace(/<!--[\s\S]*?-->/g, "");
  const strip = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const rows: string[][] = [];
  if (/<tr\b/i.test(html)) {
    for (const tr of html.match(/<tr\b[\s\S]*?(?=<tr\b|<\/table>|$)/gi) ?? []) {
      const cells = (tr.match(/<t[dh]\b[^>]*>[\s\S]*?(?=<t[dh]\b|<\/tr>|$)/gi) ?? []).map(strip).filter((c) => c !== "");
      if (cells.length) rows.push(cells);
    }
    // Text outside the table (e.g. "Total 894 ft" under it) still counts.
    const rest = html.replace(/<table\b[\s\S]*?<\/table>/gi, "\n");
    rows.push(...descriptionRows(rest.replace(/<tr\b/gi, "")).filter((r) => r.length));
    return rows;
  }
  for (const line of html.split(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|\r?\n/i)) {
    const t = strip(line);
    if (t) rows.push([t]);
  }
  return rows;
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+|\d+`;
const FEET_AT_END = new RegExp(String.raw`(${NUM})(?:\.\d+)?\s*(?:ft\.?|feet|foot|'|′|’)?\s*$`, "i");
const toNum = (s: string) => Number(s.replace(/,/g, ""));

/**
 * Reads the callout/feet table: rows like "PPX callout 2 | 116 ft", "2 = 116'", "Callout 2: 116".
 * A row whose label says Total sets the printed total. Header rows (no number) are skipped.
 */
export function parseCallouts(desc: string): { callouts: Callout[]; total: number | null } {
  const callouts: Callout[] = [];
  let total: number | null = null;
  for (const cells of descriptionRows(desc)) {
    const text = cells.join(" | ");
    // One cell per row from plain text: split "label = 116 ft" / "label: 116'" / "label - 116".
    let label: string;
    let ftText: string;
    if (cells.length > 1) {
      ftText = cells[cells.length - 1];
      label = cells.slice(0, -1).join(" ");
    } else {
      const m = text.match(FEET_AT_END);
      if (!m || m.index === undefined) continue;
      ftText = m[0];
      label = text.slice(0, m.index).replace(/[\s=:–—|-]+$/, "").trim();
    }
    const ft = ftText.match(new RegExp(String.raw`^\s*(${NUM})(?:\.\d+)?\s*(?:ft\.?|feet|foot|'|′|’)?\s*$`, "i"));
    if (!ft) continue;
    const value = toNum(ft[1]);
    if (/\btotal\b/i.test(label)) {
      total = value;
      continue;
    }
    // Pair counts, cable sizes and the like are not footage.
    if (/\b(pairs?|count|qty|cable|gauge|ga|splice|wo|job|sheet|map|code)\b/i.test(label)) continue;
    // A bare number with no label and no unit (e.g. a stray count) is not a callout.
    if (!label && !/ft|feet|foot|'|′|’/i.test(ftText)) continue;
    if (!label || /^(callout|ftg|feet|footage|ft|length)$/i.test(label)) label = `Callout ${callouts.length + 1}`;
    callouts.push({ label, ft: value });
  }
  return { callouts, total };
}

// ---------- Whole file ----------

export function lineFt(lines: [number, number][][]): number {
  return lines.reduce((a, l) => a + pathFt(l.map(([lng, lat]) => ({ lat, lng }))), 0);
}

export function isMismatch(printedFt: number, mapFt: number): boolean {
  if (printedFt <= 0) return mapFt > 0;
  return Math.abs(mapFt - printedFt) / printedFt > MISMATCH_LIMIT;
}

// Overlays, styles and data blocks have their own <name>/<description>; never read those as the
// container's. GroundOverlay images (files/plan_1.jpg…) are not fetched, so missing ones are fine.
const NOT_OWN = /<(?:\w+:)?(GroundOverlay|ScreenOverlay|PhotoOverlay|NetworkLink|ExtendedData|Style|StyleMap)\b[\s\S]*?<\/(?:\w+:)?\1>/gi;

export function parseKml(text: string): ParsedRun[] {
  const runs: ParsedRun[] = [];
  // Walk container tags in order so each Placemark knows its folder path.
  const stack: { tag: string; name: string | null; description: string; runsAt: number }[] = [];
  const folderPath = () => stack.filter((s) => s.tag === "folder" && s.name).map((s) => s.name!);
  const re = /<(\/?)(?:\w+:)?(Folder|Document|Placemark)\b[^>]*?(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, close, tagRaw, selfClose] = m;
    const tag = tagRaw.toLowerCase();
    if (selfClose) continue;
    if (tag === "placemark") {
      if (close) continue;
      const endRe = /<\/(?:\w+:)?Placemark>/gi;
      endRe.lastIndex = re.lastIndex;
      const em = endRe.exec(text);
      const body = text.slice(re.lastIndex, em ? em.index : text.length);
      re.lastIndex = em ? endRe.lastIndex : text.length;
      const run = placemark(body, folderPath());
      if (run) runs.push(run);
      continue;
    }
    if (close) {
      // A folder with its own callout table and no drawn runs under it: a table-only run.
      if (stack[stack.length - 1]?.tag === "folder") {
        const top = stack[stack.length - 1];
        const table = top.description && runs.length === top.runsAt ? folderTable(top.name, top.description, folderPath()) : null;
        if (table) runs.push(table);
      }
      stack.pop();
      continue;
    }
    // The container's own <name>/<description> come before any nested container.
    const rest = text.slice(re.lastIndex);
    const nextChild = rest.search(/<(?:\w+:)?(Folder|Document|Placemark)\b/i);
    const head = (nextChild < 0 ? rest : rest.slice(0, nextChild)).replace(NOT_OWN, "");
    const name = head.match(/<(?:\w+:)?name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?name>/i);
    stack.push({ tag, name: name ? elementText(name[1]).trim() : null, description: childText(head, "description"), runsAt: runs.length });
  }
  return runs;
}

function folderTable(name: string | null, description: string, folders: string[]): ParsedRun | null {
  const { callouts, total } = parseCallouts(description);
  if (!callouts.length && total === null) return null;
  const tableName = (name && runName(name)) || "Folder table";
  return {
    name: tableName,
    folders,
    group: groupOf(folders, tableName),
    lines: [],
    description,
    callouts,
    printedTotal: total,
    printedFt: total ?? callouts.reduce((a, c) => a + c.ft, 0),
    mapFt: 0,
    // No line on the map to check against.
    mismatch: false,
  };
}

/** "Sapphire rear span — 894 ft" → "Sapphire rear span": the footage is shown from the table. */
export function runName(name: string): string {
  return name.replace(/\s*[—–-]\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:ft\.?|feet|')\s*$/i, "").trim();
}

function placemark(body: string, folders: string[]): ParsedRun | null {
  const lines = [...body.matchAll(/<(?:\w+:)?LineString\b[\s\S]*?<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/gi)]
    .map((x) => parseCoordinates(x[1]))
    .filter((l) => l.length >= 2);
  if (!lines.length) return null;
  // The Placemark's own name/description, not those of an ExtendedData field.
  const own = body.replace(NOT_OWN, "");
  const name = runName(childText(own, "name")) || "Unnamed run";
  const description = childText(own, "description");
  let { callouts, total } = parseCallouts(description);
  // Some exports (ArcGIS, My Maps) keep the callouts in data fields instead of the description.
  if (!callouts.length && total === null) ({ callouts, total } = parseCallouts(dataFieldLines(body)));
  const sum = callouts.reduce((a, c) => a + c.ft, 0);
  const printedFt = total ?? sum;
  const mapFt = lineFt(lines);
  return {
    name,
    folders,
    group: groupOf(folders, name),
    lines,
    description,
    callouts,
    printedTotal: total,
    printedFt,
    mapFt,
    mismatch: isMismatch(printedFt, mapFt),
  };
}

// Only fields named like footage; GIS exports also carry OBJECTID, Shape_Length and the like.
const FOOTAGE_FIELD = /callout|ftg|feet|footage|\bft\b|total/i;

/** Footage-like ExtendedData <Data name><value> and <SimpleData name> fields as "name = value" lines. */
export function dataFieldLines(body: string): string {
  const ext = body.match(/<(?:\w+:)?ExtendedData\b[\s\S]*?<\/(?:\w+:)?ExtendedData>/i)?.[0] ?? "";
  const out: string[] = [];
  for (const m of ext.matchAll(/<(?:\w+:)?Data\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/gi)) {
    const value = childText(m[2], "value");
    const label = (childText(m[2], "displayName") || decodeEntities(m[1])).replace(/_/g, " ");
    if (value && FOOTAGE_FIELD.test(label)) out.push(`${label} = ${value}`);
  }
  for (const m of ext.matchAll(/<(?:\w+:)?SimpleData\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?SimpleData>/gi)) {
    const value = elementText(m[2]).trim();
    const label = decodeEntities(m[1]).replace(/_/g, " ");
    if (value && FOOTAGE_FIELD.test(label)) out.push(`${label} = ${value}`);
  }
  return out.join("\n");
}

export type RunTotals = { PPX: number; PPR: number; OTHER: number; combined: number; counts: Record<RunGroup, number> };

/** Footage by folder group. PPR is reference only and never added into PPX. */
export function runTotals(runs: Pick<KmlRun, "group" | "printedFt">[]): RunTotals {
  const t: RunTotals = { PPX: 0, PPR: 0, OTHER: 0, combined: 0, counts: { PPX: 0, PPR: 0, OTHER: 0 } };
  for (const r of runs) {
    t[r.group] += r.printedFt;
    t.counts[r.group]++;
    t.combined += r.printedFt;
  }
  return t;
}

export function importRuns(job: Pick<Job, "id">, parsed: ParsedRun[], sourceFile: string, user: string, newId: (p: string) => string): KmlRun[] {
  const at = new Date().toISOString();
  return parsed.map((p) => ({
    id: newId("kml"),
    jobId: job.id,
    name: p.name,
    folder: p.folders.join(" / "),
    group: p.group,
    lines: p.lines,
    callouts: p.callouts,
    printedFt: p.printedFt,
    mapFt: p.mapFt,
    mismatch: p.mismatch,
    sourceFile,
    createdBy: user,
    createdAt: at,
  }));
}

export type MergeResult = { runs: KmlRun[]; added: number; updated: number; unchanged: number; updatedIds: string[] };

const runKey = (r: Pick<KmlRun, "group" | "folder" | "name">) => `${r.group}\u0000${r.folder}\u0000${r.name}`;
const sameRun = (a: KmlRun, b: KmlRun) =>
  a.printedFt === b.printedFt && a.mapFt === b.mapFt && JSON.stringify([a.lines, a.callouts]) === JSON.stringify([b.lines, b.callouts]);

/**
 * Importing a file again (or a newer copy) must not double the runs. A run with the same group,
 * folder and name as one already on the job is the same run: identical → kept as is; changed →
 * replaced in place under the old id (so sheet marks still point at it) and its sign-off cleared.
 */
export function mergeRuns(existing: KmlRun[], incoming: KmlRun[]): MergeResult {
  const runs = [...existing];
  const index = new Map(existing.map((r, i) => [runKey(r), i]));
  const out: MergeResult = { runs, added: 0, updated: 0, unchanged: 0, updatedIds: [] };
  for (const r of incoming) {
    const i = index.get(runKey(r));
    if (i === undefined) {
      index.set(runKey(r), runs.push(r) - 1);
      out.added++;
    } else if (sameRun(runs[i], r)) {
      out.unchanged++;
    } else {
      runs[i] = { ...r, id: runs[i].id };
      out.updated++;
      out.updatedIds.push(runs[i].id);
    }
  }
  return out;
}

// ---------- Runs drawn in LineOS (no Google Earth file) ----------

/** sourceFile for runs traced on the map by hand. */
export const DRAWN_SOURCE = "Drawn in LineOS";

/**
 * Callouts typed by the crew, one per line: "PPX callout 2 = 116 ft", "2: 116", or just "116".
 * A "Total" line sets the printed total, the same as a Google Earth table.
 */
export function parseTypedCallouts(text: string): { callouts: Callout[]; total: number | null } {
  const lines = text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    // A bare number is a callout's feet.
    .map((l) => (/^[\d,]+(?:\.\d+)?$/.test(l) ? `${l} ft` : l));
  return parseCallouts(lines.join("\n"));
}

export type DrawnRunInput = { name: string; group: RunGroup; line: [number, number][]; calloutText: string };

/**
 * A run traced on the map with its typed callouts, checked the same way as an imported one.
 * Names must be new within the group: mergeRuns treats the same group / folder / name as the same run.
 */
export function drawnRun(job: Pick<Job, "id" | "kmlRuns">, input: DrawnRunInput, user: string, newId: (p: string) => string): KmlRun {
  if (input.line.length < 2) throw new Error("Tap at least two points on the map.");
  const { callouts, total } = parseTypedCallouts(input.calloutText);
  if (!callouts.length && total === null) throw new Error("Type the callout feet from the print, one per line.");
  const name = input.name.trim() || `Drawn run ${(job.kmlRuns ?? []).filter((r) => r.sourceFile === DRAWN_SOURCE).length + 1}`;
  const folder = `${DRAWN_SOURCE} / ${input.group}`;
  if ((job.kmlRuns ?? []).some((r) => r.folder === folder && r.name === name)) throw new Error(`There is already a drawn ${input.group} run called ${name}.`);
  const printedFt = total ?? callouts.reduce((a, c) => a + c.ft, 0);
  const mapFt = lineFt([input.line]);
  return {
    id: newId("kml"),
    jobId: job.id,
    name,
    folder,
    group: input.group,
    lines: [input.line],
    callouts,
    printedFt,
    mapFt,
    mismatch: isMismatch(printedFt, mapFt),
    sourceFile: DRAWN_SOURCE,
    createdBy: user,
    createdAt: new Date().toISOString(),
  };
}

// ---------- Assigning a run to a sheet ----------

export type AssignCheck = { ok: true } | { ok: false; error: string };

/** PPR is reference only; the code must be on the master and not pushed over it by locks. */
export function canAssign(job: Pick<Job, "master" | "glossary">, run: KmlRun, code: string): AssignCheck {
  if (run.group === "PPR") return { ok: false, error: `${run.name} is PPR (reference only) and is not billed.` };
  if (!run.lines.length) return { ok: false, error: `${run.name} is a folder footage table with no drawn line (reference only) and is not billed.` };
  if (run.printedFt <= 0) return { ok: false, error: `${run.name} has no printed callout footage to bill.` };
  if (run.mismatch && !run.confirmedBy)
    return { ok: false, error: `${run.name}: the map line is more than ${MISMATCH_LIMIT * 100}% off the printed footage. Check it against the print and confirm first.` };
  if (!job.master.some((m) => m.code === code)) return { ok: false, error: `${code} is not on the master list.` };
  if (job.glossary.find((g) => g.code === code)?.unitType !== "FOOTAGE") return { ok: false, error: `${code} is not a FOOTAGE code; run feet only bill under footage codes.` };
  return { ok: true };
}

/**
 * Where the run sits on the print page: the run's shape, scaled into a box in the middle
 * of the sheet. The crew can move the callout later; the footage is what matters.
 */
export function pagePoints(lines: [number, number][][]): Point[] {
  const all = lines.flat();
  const lat0 = all.reduce((a, p) => a + p[1], 0) / all.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p[0] * kx);
  const ys = all.map((p) => -p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const box = { x: 0.35, y: 0.4, size: 0.3 };
  const pts = all.map((_, i): Point => [
    clamp01(box.x + ((xs[i] - minX) / span) * box.size),
    clamp01(box.y + ((ys[i] - minY) / span) * box.size),
  ]);
  return pts.length >= 2 ? pts : [pts[0], pts[0]];
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Fits the run's Google Earth shape onto the print between two taps: the run's first point
 * lands on `a`, its last on `b` (turned and scaled to match, never mirrored). Worked in page
 * points so the shape keeps its proportions on a non-square page. Null when the run starts
 * and ends at the same place (a loop has no direction to fit); trace it instead.
 */
export function fitShape(lines: [number, number][][], a: Point, b: Point, widthPt: number, heightPt: number): Point[] | null {
  const all = lines.flat();
  if (all.length < 2) return null;
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  // Geo as a flat plane with y down, like the page.
  const g = all.map(([lng, lat]) => [lng * kx, -lat] as const);
  const [g0, gN] = [g[0], g[g.length - 1]];
  const gd = [gN[0] - g0[0], gN[1] - g0[1]];
  const gLen2 = gd[0] ** 2 + gd[1] ** 2;
  const A = [a[0] * widthPt, a[1] * heightPt];
  const B = [b[0] * widthPt, b[1] * heightPt];
  const pd = [B[0] - A[0], B[1] - A[1]];
  if (gLen2 === 0 || (pd[0] === 0 && pd[1] === 0)) return null;
  // Complex ratio (B - A) / (gN - g0): rotation + scale.
  const re = (pd[0] * gd[0] + pd[1] * gd[1]) / gLen2;
  const im = (pd[1] * gd[0] - pd[0] * gd[1]) / gLen2;
  return g.map(([x, y]): Point => {
    const dx = x - g0[0];
    const dy = y - g0[1];
    return [clamp01((A[0] + dx * re - dy * im) / widthPt), clamp01((A[1] + dx * im + dy * re) / heightPt)];
  });
}

/** New page points for a Google Earth run from the crew's taps on the print. */
export function placeRun(mark: Mark, taps: Point[], widthPt: number, heightPt: number): Mark {
  if (!mark.geo || taps.length < 2) return mark;
  const points = (taps.length === 2 && fitShape(mark.geo.lines, taps[0], taps[1], widthPt, heightPt)) || taps;
  return { ...mark, points, geo: { ...mark.geo, placed: true } };
}

/** The run mark that bills a KML run's printed footage under `code` on `sheetId`. */
export function runMark(run: KmlRun, sheetId: string, code: string, user: string, id: string): Mark {
  return {
    id,
    jobId: run.jobId,
    sheetId,
    kind: "run",
    points: pagePoints(run.lines),
    lengthFt: run.printedFt,
    items: [{ code, qty: run.printedFt }],
    note:
      `Google Earth: ${run.name} (${run.group}) · printed ${run.printedFt.toLocaleString("en-US")} ft · map ${run.mapFt.toLocaleString("en-US")} ft` +
      (run.confirmedBy ? ` · printed footage confirmed by ${run.confirmedBy}` : ""),
    geo: { kmlRunId: run.id, name: run.name, group: run.group, lines: run.lines, callouts: run.callouts, printedFt: run.printedFt, mapFt: run.mapFt },
    createdBy: user,
    createdAt: new Date().toISOString(),
  };
}

// ---------- Export ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
// KML colours are aabbggrr: opaque pink (#ec4899).
const PINK = "ff9948ec";

export function calloutTableHtml(callouts: Callout[], printedFt: number, extra: [string, string][] = []): string {
  const row = (a: string, b: string, bold = false) =>
    `<tr><td${bold ? ' style="font-weight:bold"' : ""}>${esc(a)}</td><td align="right"${bold ? ' style="font-weight:bold"' : ""}>${esc(b)}</td></tr>`;
  return [
    '<table border="1" cellpadding="3" cellspacing="0">',
    "<tr><th>Callout</th><th>Feet</th></tr>",
    ...callouts.map((c) => row(c.label, c.ft.toLocaleString("en-US"))),
    row("Total", printedFt.toLocaleString("en-US"), true),
    "</table>",
    // Billing details go in their own table so re-importing the file reads only the callouts.
    ...(extra.length ? ['<br/><table border="0" cellpadding="2">', ...extra.map(([a, b]) => row(a, b)), "</table>"] : []),
  ].join("");
}

/** The job's marked runs (runs on a sheet that came from Google Earth) as one .kml file. */
export function exportKml(job: Pick<Job, "header" | "marks" | "sheets">): string {
  const wo = job.header.woNumber || "—";
  const label = (id: string) => job.sheets.find((s) => s.id === id)?.label ?? "?";
  const runs = job.marks.filter((m) => m.kind === "run" && m.geo);
  const placemarks = runs.map((m) => {
    const g = m.geo!;
    const extra: [string, string][] = [
      ["Sheet", label(m.sheetId)],
      ...m.items.map((it): [string, string] => [`Code ${it.code}`, it.qty.toLocaleString("en-US")]),
      ["Map length (check)", `${g.mapFt.toLocaleString("en-US")} ft`],
    ];
    const geom = g.lines.map((l) => `<LineString><tessellate>1</tessellate><coordinates>${l.map(([x, y]) => `${x},${y},0`).join(" ")}</coordinates></LineString>`);
    return [
      "<Placemark>",
      `<name>${esc(`WO ${wo} · ${g.name}`)}</name>`,
      `<description>${cdata(calloutTableHtml(g.callouts, g.printedFt, extra))}</description>`,
      "<styleUrl>#lineos-run</styleUrl>",
      geom.length > 1 ? `<MultiGeometry>${geom.join("")}</MultiGeometry>` : geom[0],
      "</Placemark>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "<Document>",
    `<name>${esc(`WO ${wo}${job.header.name ? ` · ${job.header.name}` : ""} · LineOS runs`)}</name>`,
    `<Style id="lineos-run"><LineStyle><color>${PINK}</color><width>5</width></LineStyle></Style>`,
    ...placemarks,
    "</Document>",
    "</kml>",
    "",
  ].join("\n");
}

export const toLatLng = (l: [number, number][]): LatLng[] => l.map(([lng, lat]) => ({ lat, lng }));
