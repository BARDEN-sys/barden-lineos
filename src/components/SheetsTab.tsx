"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { workPerformed } from "@/lib/allocation";
import { downscalePhoto } from "@/lib/image";
import { newId } from "@/lib/job";
import { parseSpokenCodes } from "@/lib/voice";
import { DEFAULT_WORK_BOX } from "@/lib/output";
import { DEMO_USER, type Mark, type MarkItem, type Photo, type Point, type Sheet } from "@/lib/types";
import { CameraButtons } from "./CameraButtons";
import { VoiceButton } from "./VoiceButton";
import { useJob } from "./JobProvider";
import { PdfPageCanvas } from "./PdfPageCanvas";

type Tool = "view" | "run" | "spot" | "box";

const RUN_STROKE = "rgba(250, 204, 21, 0.7)"; // yellow highlighter
const SPOT_FILL = "rgba(236, 72, 153, 0.75)"; // pink removal spot

export function SheetsTab() {
  const { job, result } = useJob();
  const [sheetIdx, setSheetIdx] = useState(0);
  if (!job) return null;
  const sheet = job.sheets[Math.min(sheetIdx, job.sheets.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Sheets">
        {job.sheets.map((s, i) => {
          const qty = result?.codes.reduce((a, c) => a + (c.sheets.find((x) => x.sheetId === s.id)?.qty ? 1 : 0), 0) ?? 0;
          const active = i === sheetIdx;
          return (
            <button
              key={s.id}
              onClick={() => setSheetIdx(i)}
              className={`btn shrink-0 border ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}
            >
              Sheet {s.label}
              {qty > 0 && <span className={`chip ${active ? "border-white/40" : "border-slate-300"}`}>{qty} codes</span>}
            </button>
          );
        })}
      </nav>
      {sheet && <SheetView key={sheet.id} sheet={sheet} />}
    </div>
  );
}

function SheetView({ sheet }: { sheet: Sheet }) {
  const { job, result, dispatch } = useJob();
  const [tool, setTool] = useState<Tool>("view");
  const [draft, setDraft] = useState<Point[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBaseWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marks = useMemo(() => job?.marks.filter((m) => m.sheetId === sheet.id) ?? [], [job, sheet.id]);
  if (!job) return null;
  const width = baseWidth * zoom;
  const height = (width * sheet.heightPt) / sheet.widthPt;
  const selectedMark = marks.find((m) => m.id === selected) ?? null;

  function addMark(kind: Mark["kind"], points: Point[]) {
    const mark: Mark = {
      id: newId("mark"),
      jobId: job!.id,
      sheetId: sheet.id,
      kind,
      points,
      lengthFt: kind === "run" ? sheet.footages[0] : undefined,
      items: [],
      createdBy: DEMO_USER,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: "add-mark", mark });
    setSelected(mark.id);
  }

  function onTap(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "view") return;
    const r = e.currentTarget.getBoundingClientRect();
    const pt: Point = [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
    if (tool === "box") {
      dispatch({ type: "work-box", sheetId: sheet.id, at: pt });
      setTool("view");
    } else if (tool === "spot") {
      addMark("spot", [pt]);
      setTool("view");
    } else setDraft((d) => [...d, pt]);
  }

  function finishRun() {
    if (draft.length >= 2) addMark("run", draft);
    setDraft([]);
    setTool("view");
  }

  const toPx = (p: Point) => `${p[0] * width},${p[1] * height}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <ToolButton active={tool === "view"} onClick={() => { setTool("view"); setDraft([]); }}>Select</ToolButton>
        <ToolButton active={tool === "run"} onClick={() => { setTool("run"); setDraft([]); setSelected(null); }}>
          <span className="inline-block h-2 w-5 rounded" style={{ background: RUN_STROKE }} /> Run
        </ToolButton>
        <ToolButton active={tool === "spot"} onClick={() => { setTool("spot"); setDraft([]); setSelected(null); }}>
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: SPOT_FILL }} /> Spot
        </ToolButton>
        <ToolButton active={tool === "box"} onClick={() => { setTool("box"); setDraft([]); setSelected(null); }}>
          <span className="inline-block h-3 w-4 rounded-sm bg-blue-600" /> Box
        </ToolButton>
        <div className="ml-auto flex items-center gap-1">
          {[1, 1.5, 2, 3].map((z) => (
            <button key={z} onClick={() => setZoom(z)} className={`btn min-h-9 px-2 ${zoom === z ? "bg-slate-200" : ""}`}>
              {z}×
            </button>
          ))}
        </div>
        {tool === "run" && (
          <div className="flex w-full items-center gap-2 text-sm">
            <span className="text-slate-600">Tap along the highlighted run ({draft.length} points).</span>
            <button className="btn-ghost ml-auto" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length}>Undo</button>
            <button className="btn-primary" onClick={finishRun} disabled={draft.length < 2}>Finish run</button>
          </div>
        )}
        {tool === "spot" && <p className="w-full text-sm text-slate-600">Tap the cut / splice / removal location.</p>}
        {tool === "box" && <p className="w-full text-sm text-slate-600">Tap an empty spot for the top-left corner of the WORK PERFORMED box.</p>}
      </div>

      <div ref={wrapRef} className="w-full">
        <div className="overflow-auto rounded-xl border border-slate-300 bg-white" style={{ maxHeight: "70dvh" }}>
          <div className="relative" style={{ width, height }}>
            {job.pdfBytes && baseWidth > 0 && <PdfPageCanvas bytes={job.pdfBytes} pageIndex={sheet.pageIndex} width={width} />}
            <svg
              className={`absolute inset-0 ${tool === "view" ? "" : "cursor-crosshair"}`}
              width={width}
              height={height}
              onPointerUp={onTap}
              style={{ touchAction: tool === "view" ? "auto" : "pinch-zoom" }}
            >
              {marks.map((m) =>
                m.kind === "run" ? (
                  <polyline
                    key={m.id}
                    points={m.points.map(toPx).join(" ")}
                    fill="none"
                    stroke={RUN_STROKE}
                    strokeWidth={selected === m.id ? 18 : 12}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onPointerUp={(e) => { if (tool === "view") { e.stopPropagation(); setSelected(m.id); } }}
                  />
                ) : (
                  <circle
                    key={m.id}
                    cx={m.points[0][0] * width}
                    cy={m.points[0][1] * height}
                    r={selected === m.id ? 13 : 9}
                    fill={SPOT_FILL}
                    stroke={selected === m.id ? "#0f172a" : "white"}
                    strokeWidth={2}
                    onPointerUp={(e) => { if (tool === "view") { e.stopPropagation(); setSelected(m.id); } }}
                  />
                ),
              )}
              {(() => {
                const at = sheet.workBoxAt ?? DEFAULT_WORK_BOX;
                const rows = result ? workPerformed(result, sheet.id).length : 0;
                const bw = (200 / sheet.widthPt) * width;
                const bh = ((22 + (Math.max(1, rows) + 1) * 17) / sheet.heightPt) * height;
                return (
                  <g pointerEvents="none">
                    <rect x={at[0] * width} y={at[1] * height} width={bw} height={bh} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeDasharray="5 4" strokeWidth={1.5} />
                    <text x={at[0] * width + 4} y={at[1] * height + 12} fontSize={10} fill="#2563eb" fontWeight={700}>WORK PERFORMED</text>
                  </g>
                );
              })()}
              {draft.length > 0 && (
                <polyline points={draft.map(toPx).join(" ")} fill="none" stroke={RUN_STROKE} strokeWidth={10} strokeDasharray="6 6" />
              )}
            </svg>
          </div>
        </div>
      </div>

      <SheetPhotos sheet={sheet} />
      <SheetTaskCodes sheet={sheet} />
      {selectedMark ? (
        <MarkEditor key={selectedMark.id} mark={selectedMark} sheet={sheet} onClose={() => setSelected(null)} />
      ) : (
        <MarkList marks={marks} onPick={setSelected} />
      )}
      <SheetInfo sheet={sheet} />
    </div>
  );
}

function ToolButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`btn border ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
      {children}
    </button>
  );
}

function MarkList({ marks, onPick }: { marks: Mark[]; onPick: (id: string) => void }) {
  if (!marks.length) {
    return <p className="card text-sm text-slate-600">No marks on this sheet. Use Run or Spot to mark the highlighted work.</p>;
  }
  return (
    <ul className="card divide-y divide-slate-100 p-0">
      {marks.map((m) => (
        <li key={m.id}>
          <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => onPick(m.id)}>
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: m.kind === "run" ? RUN_STROKE : SPOT_FILL }} />
            <span className="flex-1 text-sm">
              <span className="font-semibold">{m.kind === "run" ? `Run ${m.lengthFt ?? "?"}′` : "Spot"}</span>
              {m.items.length > 0 && <span className="text-slate-600"> · {m.items.map((i) => `${i.code} ${i.qty}`).join(", ")}</span>}
              {m.note && <span className="block text-xs text-slate-500">{m.note}</span>}
            </span>
            <span className="text-xs text-slate-400">{m.createdBy}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MarkEditor({ mark, sheet, onClose }: { mark: Mark; sheet: Sheet; onClose: () => void }) {
  const { job, dispatch } = useJob();
  const [m, setM] = useState<Mark>(mark);
  if (!job) return null;
  const masterCodes = new Set(job.master.map((x) => x.code));
  const codeOptions = [
    ...job.master.map((x) => x.code),
    ...job.glossary.map((g) => g.code).filter((c) => !masterCodes.has(c)),
  ];
  const save = (next: Mark) => {
    setM(next);
    dispatch({ type: "update-mark", mark: next });
  };
  const setItem = (i: number, patch: Partial<MarkItem>) => save({ ...m, items: m.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-bold">{m.kind === "run" ? "Highlighted run" : "Spot"}</h3>
        <span className="text-xs text-slate-500">
          by {m.createdBy}
          {m.updatedAt ? ` · edited ${new Date(m.updatedAt).toLocaleTimeString()}` : ""}
        </span>
        <button className="btn-ghost ml-auto min-h-9" onClick={onClose}>Done</button>
      </div>

      {m.kind === "run" && (
        <label className="flex flex-col gap-1 text-sm">
          Length (ft)
          <input
            className="input"
            inputMode="numeric"
            value={m.lengthFt ?? ""}
            onChange={(e) => save({ ...m, lengthFt: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
          />
          {sheet.footages.length > 0 && (
            <span className="flex flex-wrap gap-1">
              <span className="text-xs text-slate-500">On sheet:</span>
              {sheet.footages.map((f) => (
                <button key={f} className="chip border-slate-300" onClick={() => save({ ...m, lengthFt: f })}>{f}′</button>
              ))}
            </span>
          )}
          <span className="text-xs text-slate-500">Map and GPS measuring arrive in Milestone 3.</span>
        </label>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Codes at this {m.kind}</span>
        <VoiceButton
          label='Speak codes ("S10B 50, P22K1 1")'
          onText={(text) => {
            const spoken = parseSpokenCodes(text, codeOptions);
            if (!spoken.length) return save({ ...m, note: [m.note, text].filter(Boolean).join(" · ") });
            const items = [...m.items];
            for (const it of spoken) {
              const k = items.findIndex((x) => x.code === it.code);
              if (k >= 0) items[k] = it;
              else items.push(it);
            }
            save({ ...m, items });
          }}
        />
        {m.items.map((it, i) => {
          const g = job.glossary.find((x) => x.code === it.code);
          return (
            <div key={i} className="flex items-center gap-2">
              <select className="input w-32" value={it.code} onChange={(e) => setItem(i, { code: e.target.value })}>
                {codeOptions.map((c) => (
                  <option key={c} value={c}>{c}{masterCodes.has(c) ? "" : " (not in master)"}</option>
                ))}
              </select>
              <input
                className="input w-28"
                inputMode="numeric"
                aria-label="Quantity"
                value={it.qty}
                onChange={(e) => setItem(i, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
              <span className="text-xs text-slate-500">{g?.unitType === "FOOTAGE" ? "ft" : g?.unitType === "PAIRS" ? "pairs" : "each"}</span>
              <button className="btn ml-auto min-h-9 px-2 text-red-700" onClick={() => save({ ...m, items: m.items.filter((_, k) => k !== i) })} aria-label="Remove code">✕</button>
            </div>
          );
        })}
        <button
          className="btn-ghost self-start"
          onClick={() => {
            const code = codeOptions[0] ?? "S10B";
            const unit = job.glossary.find((g) => g.code === code)?.unitType;
            save({ ...m, items: [...m.items, { code, qty: unit === "FOOTAGE" ? Math.round(m.lengthFt ?? 0) : unit === "EACH" ? 1 : 0 }] });
          }}
        >
          + Add code
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input className="input" value={m.note ?? ""} onChange={(e) => save({ ...m, note: e.target.value || undefined })} />
      </label>
      <VoiceButton label="Dictate note" onText={(text) => save({ ...m, note: [m.note, text].filter(Boolean).join(" ") })} />

      <button className="btn-danger self-start" onClick={() => { dispatch({ type: "delete-mark", id: m.id }); onClose(); }}>
        Delete mark
      </button>
    </section>
  );
}

function SheetInfo({ sheet }: { sheet: Sheet }) {
  const { job } = useJob();
  const masterCodes = new Set(job?.master.map((m) => m.code));
  const rows: [string, string[]][] = [
    ["Streets", sheet.streets],
    ["Cables", sheet.cableLabels],
    ["Footage", sheet.footages.map((f) => `${f}′`)],
    ["PPR / PPX", sheet.tags],
  ];
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">From the print (sheet {sheet.label})</summary>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd>{v.length ? v.join(", ") : "—"}</dd>
          </div>
        ))}
        <dt className="text-slate-500">Codes</dt>
        <dd className="flex flex-wrap gap-1">
          {sheet.codesFound.length
            ? sheet.codesFound.map((c) => (
                <span key={c} className={`chip ${masterCodes.has(c) ? "border-slate-300" : "border-red-300 bg-red-50 text-red-700"}`}>
                  {c}{masterCodes.has(c) ? "" : " · not in master"}
                </span>
              ))
            : "—"}
        </dd>
        <dt className="text-slate-500">Notes</dt>
        <dd>{sheet.notes.length ? sheet.notes.map((n) => <p key={n}>{n}</p>) : "—"}</dd>
      </dl>
    </details>
  );
}

function SheetPhotos({ sheet }: { sheet: Sheet }) {
  const { job, dispatch } = useJob();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  if (!job) return null;
  const photos = job.photos.filter((p) => p.sheetId === sheet.id);

  async function add(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const { blob, width, height } = await downscalePhoto(f);
        dispatch({
          type: "add-photo",
          photo: {
            id: newId("photo"),
            jobId: job!.id,
            sheetId: sheet.id,
            kind: "markup",
            blob,
            url: URL.createObjectURL(blob),
            width,
            height,
            takenAt: new Date().toISOString(),
            createdBy: DEMO_USER,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">Photos · sheet {sheet.label}</h3>
        <p className="text-xs text-slate-500">
          Snap the marked-up paper sheet (or the work). Open it here while you mark the PDF. Milestone 2 reads the
          highlights from these photos automatically.
        </p>
      </div>
      <CameraButtons multiple onFiles={add} disabled={busy} />
      {busy && <p className="text-sm text-slate-600">Saving photo…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <li key={p.id} className="shrink-0">
              <button onClick={() => setOpen(p)} className="block overflow-hidden rounded-lg border border-slate-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Sheet ${sheet.label} photo`} className="h-24 w-32 object-cover" />
              </button>
              <span className="block text-[11px] text-slate-500">
                {p.kind === "markup" ? "Marked-up print" : "Field"} · {new Date(p.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-label="Photo">
          <div className="flex items-center gap-2 p-3 text-white">
            <select
              className="input w-44 text-slate-900"
              value={open.kind}
              onChange={(e) => {
                const kind = e.target.value as Photo["kind"];
                dispatch({ type: "update-photo", id: open.id, patch: { kind } });
                setOpen({ ...open, kind });
              }}
            >
              <option value="markup">Marked-up print</option>
              <option value="field">Field photo</option>
            </select>
            <button className="btn-danger ml-auto" onClick={() => { dispatch({ type: "delete-photo", id: open.id }); setOpen(null); }}>Delete</button>
            <button className="btn-ghost" onClick={() => setOpen(null)}>Close</button>
          </div>
          <div className="flex-1 overflow-auto" style={{ touchAction: "pinch-zoom pan-x pan-y" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt="" className="mx-auto max-w-none" style={{ width: "min(200%, 2400px)" }} />
          </div>
        </div>
      )}
    </section>
  );
}

function SheetTaskCodes({ sheet }: { sheet: Sheet }) {
  const { job, dispatch } = useJob();
  if (!job || !job.master.length) return null;
  const changed = Object.keys(sheet.taskCodes ?? {}).length;
  return (
    <details className="card" open={changed > 0}>
      <summary className="cursor-pointer font-semibold">
        Task codes on this sheet {changed > 0 && <span className="chip ml-1 border-blue-300 bg-blue-50 text-blue-800">{changed} changed</span>}
      </summary>
      <p className="mt-2 text-xs text-slate-500">Leave blank to use the task code from the Master list. Type a code to change it for this sheet only.</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {job.master.map((m) => {
          const own = sheet.taskCodes?.[m.code] ?? "";
          return (
            <li key={m.code} className="flex items-center gap-3 py-2">
              <span className="w-14 font-mono font-semibold">{m.code}</span>
              <input
                className={`input min-h-9 w-36 font-mono ${own ? "border-blue-400" : ""}`}
                aria-label={`${m.code} task code on sheet ${sheet.label}`}
                placeholder={m.taskCode || "no master code"}
                value={own}
                onChange={(e) => dispatch({ type: "sheet-task-code", sheetId: sheet.id, unitCode: m.code, taskCode: e.target.value })}
              />
              <span className="text-xs text-slate-500">{own ? "this sheet" : m.taskCode ? "from master" : "missing"}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
