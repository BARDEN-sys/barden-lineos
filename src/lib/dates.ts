/** Local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-09-29" -> "9/29/2026" */
export const dayLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${m}/${d}/${y}`;
};
