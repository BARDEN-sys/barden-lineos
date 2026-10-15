import type { MasterItem } from "./types";

// OCR commonly confuses these inside a code: S1OB -> S10B, 5IOB -> S10B.
function cleanCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 4) return s;
  const head = s[0] === "5" ? "S" : s[0] === "8" ? "B" : s[0];
  const digits = s.slice(1, 3).replace(/O/g, "0").replace(/[IL]/g, "1");
  return head + digits + s.slice(3);
}

const ROW = /^\s*([A-Z5][0-9OIL]{2}[A-Z][0-9]?)\s+(.*?)\s+([\d,.]+)\s*$/i;

/**
 * Parse "Unit Code / Description / Est Qty" rows from OCR or pasted text.
 * Header lines and anything that does not end in a number are skipped.
 */
export function parseMasterText(text: string): MasterItem[] {
  const out: MasterItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ");
    const m = cells.match(ROW);
    if (!m) continue;
    const code = cleanCode(m[1]);
    if (!/^[A-Z]\d{2}[A-Z]\d?$/.test(code)) continue;
    const qty = Number(m[3].replace(/,/g, "").replace(/\.0+$/, ""));
    if (!Number.isInteger(qty)) continue;
    const existing = out.find((r) => r.code === code);
    if (existing) existing.estQty += qty;
    else out.push({ code, description: m[2].trim(), estQty: qty });
  }
  return out;
}
