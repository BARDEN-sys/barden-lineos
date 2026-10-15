"use client";

import { useRef, useState } from "react";
import { jobFromPrint } from "@/lib/job";
import type { Job } from "@/lib/types";

/**
 * "+ New project": name, WO # and project # plus the work print PDF. The numbers are read
 * from the print's title block and can be corrected before the project is created.
 */
export function NewProject({ busy, onCreate }: { busy: boolean; onCreate: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wo, setWo] = useState("");
  const [project, setProject] = useState("");
  const [draft, setDraft] = useState<Job | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setOpen(false);
    setName("");
    setWo("");
    setProject("");
    setDraft(null);
    setError(null);
  }

  async function readPrint(f: File) {
    setReading(true);
    setError(null);
    try {
      const job = await jobFromPrint(new Uint8Array(await f.arrayBuffer()), f.name);
      setDraft(job);
      // Fill blanks from the print; keep anything already typed.
      setWo((v) => v || job.header.woNumber);
      setProject((v) => v || job.header.projectNumber);
    } catch (e) {
      setError(`Could not read that PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setReading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary min-h-14 text-base" disabled={busy} onClick={() => setOpen(true)}>
        + New project
      </button>
    );
  }

  return (
    <section className="card flex flex-col gap-3 border-slate-900">
      <h2 className="text-lg font-bold">New project</h2>
      <label className="flex flex-col gap-1 text-sm">
        Project name <span className="text-xs text-slate-500">(optional, e.g. Haven Point)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Haven Point" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          WO #
          <input className="input font-mono" inputMode="numeric" value={wo} onChange={(e) => setWo(e.target.value)} placeholder="4222352" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Project #
          <input className="input font-mono" value={project} onChange={(e) => setProject(e.target.value)} placeholder="4222058" />
        </label>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readPrint(f);
          e.target.value = "";
        }}
      />
      <button className={draft ? "btn-ghost" : "btn-primary"} disabled={reading} onClick={() => fileRef.current?.click()}>
        {reading ? "Reading print…" : draft ? "Choose a different print" : "Choose work print PDF"}
      </button>
      {draft && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ {draft.pdfName}: {draft.sheets.length} sheet{draft.sheets.length === 1 ? "" : "s"}
          {draft.header.woNumber ? ` · WO ${draft.header.woNumber} found on the print` : " · no WO # found — type it above"}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={!draft || busy}
          onClick={() => {
            if (!draft) return;
            onCreate({
              ...draft,
              header: { ...draft.header, name: name.trim() || undefined, woNumber: wo.trim(), projectNumber: project.trim() },
            });
            reset();
          }}
        >
          Create project
        </button>
        <button className="btn-ghost" onClick={reset}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-500">Next: add the master unit list and task codes on the Master tab.</p>
    </section>
  );
}
