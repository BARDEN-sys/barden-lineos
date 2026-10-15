"use client";

import { useState } from "react";
import { parseMasterText } from "@/lib/masterParse";
import { parseSpokenCodes } from "@/lib/voice";
import { MasterItem, type MasterItem as MasterRow } from "@/lib/types";
import { CameraButtons } from "./CameraButtons";
import { useJob } from "./JobProvider";
import { VoiceButton } from "./VoiceButton";

export function MasterTab() {
  const { job, dispatch } = useJob();
  const [draft, setDraft] = useState<{ code: string; description: string; estQty: string }>({ code: "", description: "", estQty: "" });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MasterRow[] | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  if (!job) return null;

  const setMaster = (master: MasterRow[]) => dispatch({ type: "master", master });

  function addRow() {
    const parsed = MasterItem.safeParse({ code: draft.code, description: draft.description, estQty: Number(draft.estQty) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the row.");
    if (job!.master.some((m) => m.code === parsed.data.code)) return setError(`${parsed.data.code} is already on the list.`);
    setError(null);
    setMaster([...job!.master, parsed.data]);
    setDraft({ code: "", description: "", estQty: "" });
  }

  async function ocr(file: Blob) {
    setOcrStatus("Reading screenshot…");
    setPreview(null);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", undefined, {
        logger: (m: { status: string; progress: number }) =>
          setOcrStatus(`${m.status} ${Math.round((m.progress || 0) * 100)}%`),
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const rows = parseMasterText(data.text);
      setPreview(rows);
      setOcrStatus(rows.length ? `Found ${rows.length} rows. Check them, then apply.` : "No rows found. Try a sharper, straight-on screenshot or type them in.");
    } catch (e) {
      setOcrStatus(`OCR failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="mb-3 font-bold">Master unit list {job.header.woNumber && <span className="text-slate-500">· WO {job.header.woNumber}</span>}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2">Code</th>
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">Est qty</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {job.master.map((m, i) => (
              <tr key={m.code}>
                <td className="py-2 font-mono font-semibold">{m.code}</td>
                <td className="py-2">{m.description}</td>
                <td className="py-2 text-right">
                  <input
                    className="input ml-auto w-24 text-right"
                    inputMode="numeric"
                    aria-label={`${m.code} est qty`}
                    value={m.estQty}
                    onChange={(e) => {
                      const q = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      setMaster(job.master.map((x, k) => (k === i ? { ...x, estQty: q } : x)));
                    }}
                  />
                </td>
                <td className="py-2 pl-2 text-right">
                  <button className="btn min-h-9 px-2 text-red-700" aria-label={`Remove ${m.code}`} onClick={() => setMaster(job.master.filter((_, k) => k !== i))}>✕</button>
                </td>
              </tr>
            ))}
            {!job.master.length && (
              <tr><td colSpan={4} className="py-3 text-slate-500">No master codes yet.</td></tr>
            )}
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-[6rem_1fr_6rem] gap-2">
          <input className="input font-mono uppercase" placeholder="S10B" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <input className="input" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <input className="input text-right" placeholder="Qty" inputMode="numeric" value={draft.estQty} onChange={(e) => setDraft({ ...draft, estQty: e.target.value })} />
        </div>
        <button className="btn-primary mt-2" onClick={addRow}>Add row</button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Import from a photo, screenshot, voice or text</h2>
        <CameraButtons onFiles={(f) => ocr(f[0])} takeLabel="Photo of master list" chooseLabel="Choose screenshot" />
        <VoiceButton
          label='Speak rows ("S10B 3825")'
          onText={(text) => {
            const rows = parseSpokenCodes(text, job.glossary.map((g) => g.code)).map((it) => ({
              code: it.code,
              description: job.glossary.find((g) => g.code === it.code)?.description ?? "",
              estQty: it.qty,
            }));
            setPreview(rows);
            setOcrStatus(rows.length ? `Heard ${rows.length} rows. Check them, then apply.` : `No codes heard in "${text}". Codes must be in the Codes tab first.`);
          }}
        />
        <textarea
          className="input min-h-28 py-2 font-mono text-sm"
          placeholder={"Or paste rows:\nS10B  Cut Pairs Dead  3825"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <button className="btn-ghost self-start" disabled={!paste.trim()} onClick={() => { const rows = parseMasterText(paste); setPreview(rows); setOcrStatus(`Found ${rows.length} rows.`); }}>
          Read pasted rows
        </button>
        {ocrStatus && <p className="text-sm text-slate-600">{ocrStatus}</p>}
        {preview && preview.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <ul className="mb-3 text-sm">
              {preview.map((r) => (
                <li key={r.code} className="font-mono">{r.code} · {r.description} · {r.estQty}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => { setMaster(preview); setPreview(null); setOcrStatus(null); }}>Replace list</button>
              <button
                className="btn-ghost"
                onClick={() => {
                  const have = new Set(job.master.map((m) => m.code));
                  setMaster([...job.master, ...preview.filter((r) => !have.has(r.code))]);
                  setPreview(null);
                  setOcrStatus(null);
                }}
              >
                Add new codes
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
