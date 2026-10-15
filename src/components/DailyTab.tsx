"use client";

import { useState } from "react";
import { billedTotals, billingCsv, byTaskCode, checkDailyEntry, resolveTaskCode, rowsFromMarks } from "@/lib/billing";
import { activityDays, dayKey, dayLabel } from "@/lib/daily";
import { newId } from "@/lib/job";
import { DEMO_USER, type DailyEntry } from "@/lib/types";
import { useJob } from "./JobProvider";
import { VoiceButton } from "./VoiceButton";

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DailyTab() {
  const { job, dispatch } = useJob();
  const [day, setDay] = useState(() => dayKey(new Date().toISOString()));
  const [msg, setMsg] = useState<string | null>(null);
  if (!job) return null;
  if (!job.master.length) return <p className="card text-sm text-slate-600">Add the master unit list first (Master tab).</p>;

  const days = [...new Set([dayKey(new Date().toISOString()), ...activityDays(job)])].sort().reverse();
  const rows = job.daily.filter((r) => r.day === day);
  const totals = billedTotals(job);
  const wo = job.header.woNumber || "job";

  function addRow() {
    const unitCode = job!.master[0].code;
    const sheetId = job!.sheets.find((s) => job!.marks.some((m) => m.sheetId === s.id && m.items.length))?.id ?? job!.sheets[0]?.id ?? null;
    dispatch({
      type: "add-daily",
      rows: [
        {
          id: newId("day"),
          jobId: job!.id,
          day,
          sheetId,
          unitCode,
          taskCode: resolveTaskCode(job!, sheetId, unitCode),
          qty: 0,
          createdBy: DEMO_USER,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setMsg(null);
  }

  function fillFromMarks() {
    const { rows: add, skipped, trimmed } = rowsFromMarks(job!, day, DEMO_USER, () => newId("day"));
    if (add.length) dispatch({ type: "add-daily", rows: add });
    const parts = [
      add.length ? `Added ${add.length} row${add.length > 1 ? "s" : ""} from the marks made on ${dayLabel(day)}.` : `No marks with master codes on ${dayLabel(day)}.`,
      skipped.length ? `Skipped ${skipped.join(", ")} (not in master).` : "",
      trimmed.length ? `Cut ${[...new Set(trimmed)].join(", ")} down to what is left under master.` : "",
    ];
    setMsg(parts.filter(Boolean).join(" "));
  }

  const missingTask = rows.filter((r) => !r.taskCode.trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Daily input</h2>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button key={d} onClick={() => { setDay(d); setMsg(null); }} className={`chip min-h-9 px-3 ${d === day ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
              {d === dayKey(new Date().toISOString()) ? `Today ${dayLabel(d)}` : dayLabel(d)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Work date
          <input type="date" className="input w-48" value={day} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setMsg(null); } }} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={addRow}>+ Add row</button>
          <button className="btn-ghost" onClick={fillFromMarks}>Fill from marks on {dayLabel(day)}</button>
        </div>
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
      </section>

      {rows.length === 0 ? (
        <p className="card text-sm text-slate-600">No rows for {dayLabel(day)} yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => <RowEditor key={r.id} row={r} n={i + 1} />)}
        </ul>
      )}

      {rows.length > 0 && (
        <section className="card">
          <h3 className="mb-2 font-semibold">{dayLabel(day)} by task code</h3>
          {missingTask > 0 && <p className="mb-2 text-sm font-semibold text-amber-800">{missingTask} row(s) have no task code.</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1">Task code</th>
                <th className="pb-1">Unit code</th>
                <th className="pb-1 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byTaskCode(rows).map((t) => (
                <tr key={t.taskCode + t.unitCode}>
                  <td className={`py-1.5 font-mono ${t.taskCode ? "" : "text-amber-700"}`}>{t.taskCode || "(none)"}</td>
                  <td className="py-1.5 font-mono">{t.unitCode}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.qty.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h3 className="mb-2 font-semibold">Billed to date (all days)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1">Code</th>
              <th className="pb-1 text-right">Billed</th>
              <th className="pb-1 text-right">Master</th>
              <th className="pb-1 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {totals.map((t) => (
              <tr key={t.code}>
                <td className="py-1.5 font-mono font-semibold">{t.code}</td>
                <td className="py-1.5 text-right tabular-nums">{t.billed.toLocaleString("en-US")}</td>
                <td className="py-1.5 text-right tabular-nums">{t.master.toLocaleString("en-US")}</td>
                <td className={`py-1.5 text-right tabular-nums ${t.remaining === 0 ? "text-emerald-700" : t.remaining < 0 ? "text-red-700" : ""}`}>
                  {t.remaining.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!rows.length} onClick={() => download(billingCsv(job, day), `WO-${wo}-billing-${day}.csv`)}>
            Billing CSV · {dayLabel(day)}
          </button>
          <button className="btn-ghost" disabled={!job.daily.length} onClick={() => download(billingCsv(job), `WO-${wo}-billing-all.csv`)}>
            Billing CSV · all days
          </button>
        </div>
      </section>
    </div>
  );
}

function RowEditor({ row, n }: { row: DailyEntry; n: number }) {
  const { job, dispatch } = useJob();
  const [qty, setQty] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!job) return null;
  const save = (next: DailyEntry) => dispatch({ type: "update-daily", row: next });
  const auto = resolveTaskCode(job, row.sheetId, row.unitCode);

  function commitQty() {
    if (qty === null) return;
    const q = Number(qty);
    const next = { ...row, qty: Number.isFinite(q) ? Math.floor(q) : -1 };
    const check = checkDailyEntry(job!, next);
    if (check.ok) {
      save(next);
      setError(null);
    } else setError(check.error);
    setQty(null);
  }

  return (
    <li className={`card flex flex-col gap-2 ${error ? "border-red-400" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500">ROW {n}</span>
        <span className="text-xs text-slate-400">
          {row.updatedBy ?? row.createdBy} · {new Date(row.updatedAt ?? row.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <button className="btn ml-auto min-h-9 px-2 text-red-700" aria-label={`Delete row ${n}`} onClick={() => dispatch({ type: "delete-daily", id: row.id })}>
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Sheet
          <select
            className="input"
            value={row.sheetId ?? ""}
            onChange={(e) => {
              const sheetId = e.target.value || null;
              save({ ...row, sheetId, taskCode: resolveTaskCode(job, sheetId, row.unitCode) });
            }}
          >
            <option value="">No sheet</option>
            {job.sheets.map((s) => <option key={s.id} value={s.id}>Sheet {s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Unit code
          <select
            className="input font-mono"
            value={row.unitCode}
            onChange={(e) => {
              const next = { ...row, unitCode: e.target.value, taskCode: resolveTaskCode(job, row.sheetId, e.target.value) };
              const check = checkDailyEntry(job, next);
              if (check.ok) {
                save(next);
                setError(null);
              } else setError(check.error);
            }}
          >
            {job.master.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.description}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Task code
          <input
            className={`input font-mono ${row.taskCode.trim() ? (row.taskCode !== auto ? "border-blue-400" : "") : "border-amber-400"}`}
            placeholder="Task code"
            value={row.taskCode}
            onChange={(e) => save({ ...row, taskCode: e.target.value })}
          />
          {row.taskCode !== auto && auto && (
            <button className="self-start text-[11px] text-blue-700 underline" onClick={() => save({ ...row, taskCode: auto })}>
              Use {auto}
            </button>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Qty
          <input
            className="input text-right tabular-nums"
            inputMode="numeric"
            value={qty ?? row.qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Note
        <input className="input" value={row.note ?? ""} onChange={(e) => save({ ...row, note: e.target.value || undefined })} />
      </label>
      <VoiceButton label="Dictate note" onText={(t) => save({ ...row, note: [row.note, t].filter(Boolean).join(" ") })} />
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </li>
  );
}
