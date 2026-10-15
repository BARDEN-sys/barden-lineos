"use client";

import { useState } from "react";
import type { CodeAllocation, CodeStatus } from "@/lib/allocation";
import { useJob } from "./JobProvider";

const STATUS: Record<CodeStatus, { label: string; cls: string }> = {
  ok: { label: "Matches master", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  under: { label: "Under master", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  over: { label: "OVER MASTER", cls: "border-red-400 bg-red-100 text-red-800" },
  unmarked: { label: "Not marked", cls: "border-slate-300 bg-slate-50 text-slate-600" },
};

export function Flags() {
  const { job, result } = useJob();
  if (!job || !result || (!result.flags.length && result.canExport)) return null;
  const label = (id: string) => job.sheets.find((s) => s.id === id)?.label ?? id;
  return (
    <section className="flex flex-col gap-2">
      {result.blockers.map((b) => (
        <p key={b} className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">Export blocked: {b}</p>
      ))}
      {result.flags.map((f) => (
        <p key={f.code + f.reason} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-mono font-bold">{f.code}</span>{" "}
          {f.reason === "not-in-master"
            ? `is on the print / marks but not in the master list${f.sheetIds.length ? ` (sheet ${f.sheetIds.map(label).join(", ")})` : ""}. It gets no quantity.`
            : "is in the master but not in the glossary — treated as EACH until added."}
        </p>
      ))}
    </section>
  );
}

export function AllocationTab() {
  const { job, result } = useJob();
  if (!job || !result) return null;
  if (!job.master.length) return <p className="card text-sm text-slate-600">Add the master unit list first (Master tab).</p>;
  return (
    <div className="flex flex-col gap-4">
      <Flags />
      {result.codes.map((c) => <CodeCard key={c.code} c={c} />)}
    </div>
  );
}

function CodeCard({ c }: { c: CodeAllocation }) {
  const { job } = useJob();
  const s = STATUS[c.status];
  return (
    <section className={`card ${c.status === "over" ? "border-red-400" : ""}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-lg font-black">{c.code}</h3>
        <span className="text-sm text-slate-600">{c.description}</span>
        <span className={`chip ml-auto ${s.cls}`}>{s.label}</span>
      </header>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
        {[
          ["Master", c.master],
          ["Placed", c.total],
          ["Remaining", c.remaining],
          ["Marked", c.marked],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2">
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className={`font-bold tabular-nums ${k === "Remaining" && Number(v) < 0 ? "text-red-700" : ""}`}>{Number(v).toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {c.unitType} · {c.mode === "distribute" ? "master split by highlighted feet" : "as marked, capped at master"}
        {c.overBy.length > 0 && <span className="font-semibold text-red-700"> · over because of locks by {c.overBy.join(", ")}</span>}
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-1">Sheet</th>
            <th className="pb-1 text-right">Marked</th>
            <th className="pb-1 text-right">Qty</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {c.sheets.map((row) => (
            <SheetRow key={row.sheetId} code={c.code} row={row} label={job?.sheets.find((x) => x.id === row.sheetId)?.label ?? ""} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SheetRow({ code, row, label }: { code: string; row: CodeAllocation["sheets"][number]; label: string }) {
  const { setOverride, dispatch } = useJob();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (value === null) return;
    const qty = Number(value);
    const r = setOverride(row.sheetId, code, Number.isFinite(qty) ? Math.floor(qty) : -1);
    setError(r.ok ? null : r.error);
    setValue(null);
  }

  return (
    <>
      <tr className={row.locked ? "bg-sky-50" : ""}>
        <td className="py-1.5">{label}</td>
        <td className="py-1.5 text-right tabular-nums text-slate-500">{row.weight ? row.weight.toLocaleString("en-US") : "—"}</td>
        <td className="py-1.5 text-right">
          <input
            className={`input ml-auto min-h-9 w-24 text-right tabular-nums ${row.locked ? "border-sky-400" : ""}`}
            inputMode="numeric"
            aria-label={`${code} on sheet ${label}`}
            value={value ?? row.qty}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </td>
        <td className="w-20 py-1.5 pl-2 text-right">
          {row.locked ? (
            <button className="btn min-h-9 px-2 text-xs text-sky-800" onClick={() => dispatch({ type: "clear-override", sheetId: row.sheetId, code })} title={`Locked by ${row.lockedBy}`}>
              🔒 Unlock
            </button>
          ) : (
            <button className="btn min-h-9 px-2 text-xs text-slate-500" onClick={() => { const r = setOverride(row.sheetId, code, row.qty); setError(r.ok ? null : r.error); }}>
              Lock
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="pb-2 text-xs font-semibold text-red-700">{error}</td>
        </tr>
      )}
    </>
  );
}
