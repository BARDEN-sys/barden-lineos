"use client";

import { useState } from "react";
import { GlossaryEntry, UnitType } from "@/lib/types";
import { useJob } from "./JobProvider";

export function GlossaryTab() {
  const { job, dispatch, isForeman } = useJob();
  const [draft, setDraft] = useState({ code: "", description: "", unitType: "PAIRS" as UnitType });
  const [error, setError] = useState<string | null>(null);
  if (!job) return null;
  const set = (glossary: GlossaryEntry[]) => dispatch({ type: "glossary", glossary });

  return (
    <fieldset disabled={!isForeman} className="card flex min-w-0 flex-col gap-3">
      {!isForeman && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">🔒 Only the foreman can change this. You can see it.</p>
      )}

      <div>
        <h2 className="font-bold">Code glossary</h2>
        <p className="text-sm text-slate-600">
          Unit type sets how a code is split: FOOTAGE splits the master by highlighted feet; PAIRS and EACH use the
          counts marked at each location.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {job.glossary.map((g, i) => (
          <li key={g.code} className="grid grid-cols-[4.5rem_1fr_7.5rem_2.5rem] items-center gap-2 py-2">
            <span className="font-mono font-semibold">{g.code}</span>
            <input
              className="input"
              aria-label={`${g.code} description`}
              value={g.description}
              onChange={(e) => set(job.glossary.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
            />
            <select
              className="input"
              aria-label={`${g.code} unit type`}
              value={g.unitType}
              onChange={(e) => set(job.glossary.map((x, k) => (k === i ? { ...x, unitType: e.target.value as UnitType } : x)))}
            >
              {UnitType.options.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button className="btn min-h-9 px-2 text-red-700" aria-label={`Remove ${g.code}`} onClick={() => set(job.glossary.filter((_, k) => k !== i))}>✕</button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[4.5rem_1fr_7.5rem] gap-2">
        <input className="input font-mono uppercase" placeholder="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        <input className="input" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <select className="input" value={draft.unitType} onChange={(e) => setDraft({ ...draft, unitType: e.target.value as UnitType })}>
          {UnitType.options.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      <button
        className="btn-primary self-start"
        onClick={() => {
          const p = GlossaryEntry.safeParse(draft);
          if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the code.");
          if (job.glossary.some((g) => g.code === p.data.code)) return setError(`${p.data.code} is already in the glossary.`);
          setError(null);
          set([...job.glossary, p.data]);
          setDraft({ code: "", description: "", unitType: "PAIRS" });
        }}
      >
        Add code
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
