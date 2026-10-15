"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "@/lib/job";
import { DEMO_USER, type Mark, type MarkItem, type Point, type Sheet } from "@/lib/types";
import { useJob } from "./JobProvider";
import { PdfPageCanvas } from "./PdfPageCanvas";

type Tool = "view" | "run" | "spot";

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
  const { job, dispatch } = useJob();
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
    if (tool === "spot") {
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
              {draft.length > 0 && (
                <polyline points={draft.map(toPx).join(" ")} fill="none" stroke={RUN_STROKE} strokeWidth={10} strokeDasharray="6 6" />
              )}
            </svg>
          </div>
        </div>
      </div>

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
