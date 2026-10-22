"use client";

import { useState } from "react";
import { renderSheets, summaryCsv } from "@/lib/output";
import { activityDays, buildDailyReport, dayKey, dayLabel } from "@/lib/daily";
import { buildJobReport } from "@/lib/report";
import { currentUser } from "@/lib/user";
import { Flags } from "./AllocationTab";
import { useJob } from "./JobProvider";

export function download(data: Uint8Array | string, name: string, type: string) {
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
  const { job, result, isForeman } = useJob();
  const [date, setDate] = useState(today);
  const [preparedBy, setPreparedBy] = useState(currentUser);
  const [day, setDay] = useState<string | null>(null);
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

  const days = activityDays(job);
  const reportDay = day ?? days[0] ?? dayKey(new Date().toISOString());

  async function report(kind: "job" | "daily") {
    setBusy(kind);
    setError(null);
    try {
      const logoBuf = await fetch("/barden-logo.png")
        .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("image/") ? r.arrayBuffer() : null))
        .catch(() => null);
      const logo = logoBuf ? new Uint8Array(logoBuf) : undefined;
      if (kind === "job") {
        download(await buildJobReport(job!, result!, { date, preparedBy, logo }), `WO-${wo}-job-report.pdf`, "application/pdf");
      } else {
        download(await buildDailyReport(job!, result!, { day: reportDay, preparedBy, logo }), `WO-${wo}-daily-${reportDay}.pdf`, "application/pdf");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Approving the final export is the foreman's job (crew can still make reports).
  const blocked = !result.canExport || !job.master.length || !isForeman;

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
        {!isForeman && <p className="text-sm text-slate-700">🔒 Only the foreman approves and exports the final sheets.</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Job report</h2>
        <p className="text-sm text-slate-600">
          One PDF to send with the sheets: units vs master, flags, work by sheet, crew marks and changes (who and when),
          and the job photos. Works even when export is blocked, so you can show what is over.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Prepared by
          <input className="input w-64" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
        </label>
        <button className="btn-primary self-start" disabled={!!busy} onClick={() => report("job")}>
          {busy === "job" ? "Building…" : "Job report PDF"}
        </button>
      </section>
      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Daily report</h2>
        <p className="text-sm text-slate-600">
          One day&apos;s work: units marked that day vs job to date and master, each crew member&apos;s marks with
          times, changes and overrides, and that day&apos;s photos.
        </p>
        {days.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <button key={d} onClick={() => setDay(d)} className={`chip min-h-9 px-3 ${d === reportDay ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
                {dayLabel(d)}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Work date
          <input type="date" className="input w-48" value={reportDay} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <button className="btn-primary self-start" disabled={!!busy} onClick={() => report("daily")}>
          {busy === "daily" ? "Building…" : `Daily report PDF · ${dayLabel(reportDay)}`}
        </button>
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
