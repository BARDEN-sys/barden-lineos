"use client";

import { useState } from "react";
import { renderSheets, summaryCsv } from "@/lib/output";
import { Flags } from "./AllocationTab";
import { useJob } from "./JobProvider";

function download(data: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const today = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

export function ExportTab() {
  const { job, result } = useJob();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!job || !result) return null;
  const wo = job.header.woNumber || "job";

  async function pdf(sheetIds: string[], name: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      download(await renderSheets(job!, result!, sheetIds, { date }), name, "application/pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const blocked = !result.canExport || !job.master.length;

  return (
    <div className="flex flex-col gap-4">
      <Flags />
      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Export clean sheets</h2>
        <p className="text-sm text-slate-600">
          Uses the original print pages (no highlighter), adds code callouts at each mark, a WORK PERFORMED box, and
          fills the UNITS / ACCT CODES block.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Work performed date
          <input className="input w-48" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={blocked || !!busy} onClick={() => pdf(job.sheets.map((s) => s.id), `WO-${wo}-sheets.pdf`, "all")}>
            {busy === "all" ? "Building…" : "Combined PDF"}
          </button>
          <button className="btn-ghost" disabled={!job.master.length} onClick={() => download(summaryCsv(job, result), `WO-${wo}-summary.csv`, "text/csv")}>
            Summary CSV
          </button>
        </div>
        {!job.master.length && <p className="text-sm text-amber-800">Add the master unit list before exporting.</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
      <section className="card">
        <h3 className="mb-2 font-semibold">Per-sheet PDFs</h3>
        <ul className="divide-y divide-slate-100">
          {job.sheets.map((s) => {
            const rows = result.codes.filter((c) => c.sheets.find((x) => x.sheetId === s.id)?.qty);
            return (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-16 font-semibold">Sheet {s.label}</span>
                <span className="flex-1 text-xs text-slate-600">
                  {rows.length ? rows.map((c) => `${c.code} ${c.sheets.find((x) => x.sheetId === s.id)!.qty}`).join(" · ") : "No work"}
                </span>
                <button className="btn-ghost min-h-9" disabled={blocked || !!busy} onClick={() => pdf([s.id], `WO-${wo}-sheet-${s.label.replace(/\s+/g, "")}.pdf`, s.id)}>
                  {busy === s.id ? "…" : "PDF"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
