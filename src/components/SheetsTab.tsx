"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workPerformed } from "@/lib/allocation";
import { downscalePhoto } from "@/lib/image";
import { newId } from "@/lib/job";
import { placeRun } from "@/lib/kml";
import { parseSpokenCodes } from "@/lib/voice";
import { DEFAULT_WORK_BOX } from "@/lib/output";
import { currentUser } from "@/lib/user";
import { activeStep, clampView, pinchView, viewerToPage, zoomAt, ZOOM_STEPS, type View } from "@/lib/zoom";
import { type Mark, type MarkItem, type Photo, type Point, type Sheet } from "@/lib/types";
import { CameraButtons } from "./CameraButtons";
import { MeasureRun } from "./MeasureRun";
import { VoiceButton } from "./VoiceButton";
import { useJob } from "./JobProvider";
import { PdfPageCanvas } from "./PdfPageCanvas";

type Tool = "view" | "run" | "spot" | "box" | "place";

const RUN_STROKE = "rgba(250, 204, 21, 0.7)"; // yellow highlighter
const SPOT_FILL = "rgba(236, 72, 153, 0.75)"; // pink removal spot

/** `placeMarkId`: a Google Earth run to put on the print (from the Map tab); `onPlaceTaken` clears it. */
export function SheetsTab({ placeMarkId = null, onPlaceTaken }: { placeMarkId?: string | null; onPlaceTaken?: () => void } = {}) {
  const { job, result } = useJob();
  const [sheetIdx, setSheetIdx] = useState(0);
  const [placing, setPlacing] = useState<string | null>(null);
  // Open the run's sheet and start placing it.
  useEffect(() => {
    if (!placeMarkId || !job) return;
    const i = job.sheets.findIndex((s) => s.id === job.marks.find((m) => m.id === placeMarkId)?.sheetId);
    if (i >= 0) {
      setSheetIdx(i);
      setPlacing(placeMarkId);
    }
    onPlaceTaken?.();
  }, [placeMarkId, job, onPlaceTaken]);
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
      {sheet && <SheetView key={sheet.id} sheet={sheet} placeMarkId={placing} onPlaceStarted={() => setPlacing(null)} />}
    </div>
  );
}

type Gesture = {
  pts: Map<number, Point>;
  /** tap: one finger, not moved yet · pan: one-finger drag in Select · drag: one-finger drag in a marking tool (does nothing) · pinch: two fingers · done: ignore until all fingers lift */
  mode: "none" | "tap" | "pan" | "drag" | "pinch" | "done";
  start: View;
  p0: Point;
  m0: Point;
  d0: number;
  target: Element | null;
};

const TAP_SLOP = 8; // px a finger may wander and still count as a tap
const DOUBLE_TAP_MS = 300;
const RENDER_DEBOUNCE_MS = 250;

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function SheetView({ sheet, placeMarkId, onPlaceStarted }: { sheet: Sheet; placeMarkId: string | null; onPlaceStarted: () => void }) {
  const { job, result, dispatch } = useJob();
  const [tool, setTool] = useState<Tool>("view");
  const [draft, setDraft] = useState<Point[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /** The Google Earth run being put on the print (tool "place"). */
  const [placingId, setPlacingId] = useState<string | null>(null);
  const startPlacing = useCallback((id: string) => {
    setPlacingId(id);
    setDraft([]);
    setSelected(null);
    setTool("place");
  }, []);
  useEffect(() => {
    if (!placeMarkId) return;
    startPlacing(placeMarkId);
    onPlaceStarted();
  }, [placeMarkId, startPlacing, onPlaceStarted]);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }); // viewer box
  const sizeRef = useRef(size);
  const [view, setViewState] = useState<View>({ z: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  // The PDF bitmap's zoom; catches up with `view.z` once a gesture settles.
  const [renderZoom, setRenderZoom] = useState(1);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<Gesture>({ pts: new Map(), mode: "none", start: view, p0: [0, 0], m0: [0, 0], d0: 0, target: null });
  const lastTap = useRef<{ t: number; p: Point; undo?: () => void } | null>(null);
  const aspect = sheet.heightPt / sheet.widthPt;

  const applyView = useCallback(
    (v: View) => {
      const { w, h } = sizeRef.current;
      const next = clampView(v, w, w * aspect, w, h);
      viewRef.current = next;
      setViewState(next);
      if (renderTimer.current) clearTimeout(renderTimer.current);
      const settle = () => {
        if (gesture.current.pts.size) renderTimer.current = setTimeout(settle, RENDER_DEBOUNCE_MS);
        else setRenderZoom(viewRef.current.z);
      };
      renderTimer.current = setTimeout(settle, RENDER_DEBOUNCE_MS);
    },
    [aspect],
  );

  useEffect(() => () => { if (renderTimer.current) clearTimeout(renderTimer.current); }, []);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      const h = Math.floor(e.contentRect.height);
      const old = sizeRef.current.w;
      sizeRef.current = { w, h };
      setSize({ w, h });
      const v = viewRef.current;
      applyView(old > 0 ? { ...v, tx: (v.tx * w) / old, ty: (v.ty * w) / old } : v);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyView]);

  // Keep the browser's own pinch / double-tap zoom off the drawing (iOS Safari ignores touch-action
  // for page zoom unless the gesture events are cancelled). Trackpad pinch and wheel arrive as wheel.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const block = (e: Event) => e.preventDefault();
    const multiTouch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const wheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      const { w, h } = sizeRef.current;
      if (e.ctrlKey) {
        e.preventDefault();
        applyView(zoomAt(v, v.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top));
      } else if (w * v.z > w || w * aspect * v.z > h) {
        e.preventDefault();
        applyView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    const opts = { passive: false } as const;
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) el.addEventListener(t, block, opts);
    el.addEventListener("touchmove", multiTouch, opts);
    el.addEventListener("wheel", wheel, opts);
    return () => {
      for (const t of ["gesturestart", "gesturechange", "gestureend"]) el.removeEventListener(t, block);
      el.removeEventListener("touchmove", multiTouch);
      el.removeEventListener("wheel", wheel);
    };
  }, [applyView, aspect]);

  const marks = useMemo(() => job?.marks.filter((m) => m.sheetId === sheet.id) ?? [], [job, sheet.id]);
  if (!job) return null;
  const baseWidth = size.w;
  const width = baseWidth * view.z;
  const height = width * aspect;
  const selectedMark = marks.find((m) => m.id === selected) ?? null;
  const step = activeStep(view.z);

  function addMark(kind: Mark["kind"], points: Point[]) {
    const mark: Mark = {
      id: newId("mark"),
      jobId: job!.id,
      sheetId: sheet.id,
      kind,
      points,
      lengthFt: kind === "run" ? sheet.footages[0] : undefined,
      items: [],
      createdBy: currentUser(),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: "add-mark", mark });
    setSelected(mark.id);
    return mark.id;
  }

  /** A tap at viewer pixel `p`; returns how to take it back if it turns out to be half a double-tap. */
  function onTap(p: Point, target: Element | null): (() => void) | undefined {
    const pt = viewerToPage(viewRef.current, baseWidth, baseWidth * aspect, p[0], p[1]);
    if (tool === "view") {
      const id = target?.closest("[data-mark-id]")?.getAttribute("data-mark-id");
      if (id) setSelected(id);
    } else if (tool === "box") {
      const prev = sheet.workBoxAt ?? DEFAULT_WORK_BOX;
      dispatch({ type: "work-box", sheetId: sheet.id, at: pt });
      setTool("view");
      return () => { dispatch({ type: "work-box", sheetId: sheet.id, at: prev }); setTool("box"); };
    } else if (tool === "spot") {
      const id = addMark("spot", [pt]);
      setTool("view");
      return () => { dispatch({ type: "delete-mark", id }); setSelected(null); setTool("spot"); };
    } else {
      setDraft((d) => [...d, pt]);
      return () => setDraft((d) => d.slice(0, -1));
    }
  }

  function tapped(p: Point, target: Element | null) {
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && dist(last.p, p) < 30) {
      last.undo?.();
      lastTap.current = null;
      applyView({ z: 1, tx: 0, ty: 0 });
      return;
    }
    lastTap.current = { t: now, p, undo: onTap(p, target) };
  }

  const local = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left - e.currentTarget.clientLeft, e.clientY - r.top - e.currentTarget.clientTop];
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const g = gesture.current;
    if (g.pts.size >= 2) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    g.pts.set(e.pointerId, local(e));
    const [a, b] = [...g.pts.values()];
    if (g.pts.size === 1) {
      Object.assign(g, { mode: "tap", start: viewRef.current, p0: a, target: e.target as Element });
    } else {
      Object.assign(g, { mode: "pinch", start: viewRef.current, m0: mid(a, b), d0: dist(a, b) });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.pts.has(e.pointerId)) return;
    const p = local(e);
    g.pts.set(e.pointerId, p);
    if (g.mode === "pinch" && g.pts.size >= 2) {
      const [a, b] = [...g.pts.values()];
      applyView(pinchView(g.start, g.m0, g.d0, mid(a, b), dist(a, b)));
    } else if (g.mode === "tap" && dist(p, g.p0) > TAP_SLOP) {
      g.mode = tool === "view" ? "pan" : "drag";
    }
    if (g.mode === "pan") applyView({ ...g.start, tx: g.start.tx + p[0] - g.p0[0], ty: g.start.ty + p[1] - g.p0[1] });
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.pts.delete(e.pointerId)) return;
    if (g.pts.size) {
      g.mode = "done"; // one finger of a pinch lifted: wait for the other
      return;
    }
    if (g.mode === "tap" && e.type === "pointerup") tapped(local(e), g.target);
    g.mode = "none";
  }

  const placingMark = marks.find((m) => m.id === placingId) ?? null;
  function finishPlace() {
    if (placingMark && draft.length >= 2) {
      dispatch({ type: "update-mark", mark: placeRun(placingMark, draft, sheet.widthPt, sheet.heightPt) });
      setSelected(placingMark.id);
    }
    setDraft([]);
    setPlacingId(null);
    setTool("view");
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
        <ToolButton active={tool === "view"} onClick={() => { setTool("view"); setDraft([]); setPlacingId(null); }}>Select</ToolButton>
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
          {ZOOM_STEPS.map((z) => (
            <button
              key={z}
              onClick={() => applyView(zoomAt(viewRef.current, z, size.w / 2, size.h / 2))}
              className={`btn min-h-9 px-2 ${step === z ? "bg-slate-200" : ""}`}
              aria-pressed={step === z}
            >
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
        {tool === "place" && placingMark && (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">
              📍 <b>{placingMark.geo?.name ?? "Run"}</b>: tap where the run <b>starts</b> on the print, then where it <b>ends</b> — its Google Earth shape is
              fitted between them. Tap more points to trace it instead ({draft.length} {draft.length === 1 ? "point" : "points"}).
            </span>
            <button className="btn-ghost ml-auto" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length}>Undo</button>
            <button className="btn-ghost" onClick={() => { setDraft([]); setPlacingId(null); setTool("view"); }}>Cancel</button>
            <button className="btn-primary" onClick={finishPlace} disabled={draft.length < 2}>Place run</button>
          </div>
        )}
        {tool === "spot" && <p className="w-full text-sm text-slate-600">Tap the cut / splice / removal location.</p>}
        {tool === "box" && <p className="w-full text-sm text-slate-600">Tap an empty spot for the top-left corner of the WORK PERFORMED box.</p>}
      </div>

      <div
        ref={viewerRef}
        data-testid="sheet-viewer"
        className={`relative w-full select-none overflow-hidden rounded-xl border border-slate-300 bg-white ${tool === "view" ? "cursor-grab" : "cursor-crosshair"}`}
        style={{ height: size.w ? size.w * aspect : "50dvh", maxHeight: "70dvh", touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width, height, transform: `translate3d(${view.tx}px, ${view.ty}px, 0)` }}
        >
          {job.pdfBytes && baseWidth > 0 && (
            <PdfPageCanvas bytes={job.pdfBytes} pageIndex={sheet.pageIndex} width={width} renderWidth={baseWidth * renderZoom} />
          )}
          <svg className="absolute inset-0" width={width} height={height}>
            {marks.map((m) =>
              m.kind === "run" ? (
                <polyline
                  key={m.id}
                  data-mark-id={m.id}
                  points={m.points.map(toPx).join(" ")}
                  fill="none"
                  stroke={RUN_STROKE}
                  strokeWidth={selected === m.id ? 18 : 12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={m.geo && !m.geo.placed ? "14 12" : undefined}
                  opacity={m.id === placingId ? 0.25 : 1}
                />
              ) : (
                <circle
                  key={m.id}
                  data-mark-id={m.id}
                  cx={m.points[0][0] * width}
                  cy={m.points[0][1] * height}
                  r={selected === m.id ? 13 : 9}
                  fill={SPOT_FILL}
                  stroke={selected === m.id ? "#0f172a" : "white"}
                  strokeWidth={2}
                />
              ),
            )}
            {(() => {
              const at = sheet.workBoxAt ?? DEFAULT_WORK_BOX;
              const rows = result ? workPerformed(result, sheet.id).length : 0;
              const bw = (200 / sheet.widthPt) * width;
              const bh = ((22 + (Math.max(1, rows) + 1) * 17) / sheet.heightPt) * height;
              return (
                <g pointerEvents="none" data-testid="work-box">
                  <rect x={at[0] * width} y={at[1] * height} width={bw} height={bh} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeDasharray="5 4" strokeWidth={1.5} />
                  <text x={at[0] * width + 4} y={at[1] * height + 12} fontSize={10} fill="#2563eb" fontWeight={700}>WORK PERFORMED</text>
                </g>
              );
            })()}
            {draft.length > 0 && (
              <polyline
                points={(tool === "place" && placingMark ? placeRun(placingMark, draft, sheet.widthPt, sheet.heightPt).points : draft).map(toPx).join(" ")}
                fill="none"
                stroke={RUN_STROKE}
                strokeWidth={10}
                strokeDasharray="6 6"
              />
            )}
            {tool === "place" &&
              draft.map((p, i) => (
                <circle key={i} cx={p[0] * width} cy={p[1] * height} r={7} fill={i === 0 ? "#16a34a" : "#0f172a"} stroke="white" strokeWidth={2} pointerEvents="none" />
              ))}
          </svg>
        </div>
      </div>

      <SheetPhotos sheet={sheet} />
      <SheetTaskCodes sheet={sheet} />
      {selectedMark ? (
        <MarkEditor key={selectedMark.id} mark={selectedMark} sheet={sheet} onClose={() => setSelected(null)} onPlace={() => startPlacing(selectedMark.id)} />
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
              {m.geo && !m.geo.placed && <span className="chip ml-2 border-amber-300 bg-amber-50 text-amber-800">not placed on print</span>}
              {m.note && <span className="block text-xs text-slate-500">{m.note}</span>}
            </span>
            <span className="text-xs text-slate-400">{m.createdBy}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MarkEditor({ mark, sheet, onClose, onPlace }: { mark: Mark; sheet: Sheet; onClose: () => void; onPlace: () => void }) {
  const { job, dispatch } = useJob();
  const [m, setM] = useState<Mark>(mark);
  const [measuring, setMeasuring] = useState(false);
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

      {m.geo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-pink-50 p-2 text-sm">
          <span className="flex-1">
            Google Earth run <b>{m.geo.name}</b> · {m.geo.printedFt.toLocaleString("en-US")} ft printed
            {!m.geo.placed && <span className="block text-amber-800">Not placed yet — it sits mid-page until you place it.</span>}
          </span>
          <button className="btn-primary min-h-9" onClick={onPlace}>📍 {m.geo.placed ? "Move on print" : "Place on print"}</button>
        </div>
      )}

      {m.kind === "run" && !m.geo && (
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
          <button type="button" className="btn-primary mt-1 self-start" onClick={() => setMeasuring(true)}>
            📏 Measure on map / walk it
          </button>
        </label>
      )}
      {measuring && (
        <MeasureRun
          streets={sheet.streets}
          onClose={() => setMeasuring(false)}
          onUse={(ft, how) => {
            setMeasuring(false);
            const stamp = how === "map" ? `Measured on map: ${ft} ft` : `Walked with GPS: ${ft} ft`;
            const note = [m.note?.replace(/(Measured on map|Walked with GPS): \d+ ft( · )?/g, "").trim(), stamp].filter(Boolean).join(" · ");
            // FOOTAGE codes on this run follow the measured length.
            const items = m.items.map((it) =>
              job.glossary.find((g) => g.code === it.code)?.unitType === "FOOTAGE" ? { ...it, qty: ft } : it,
            );
            save({ ...m, lengthFt: ft, items, note });
          }}
        />
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
            createdBy: currentUser(),
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
  const { job, dispatch, isForeman } = useJob();
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
                disabled={!isForeman}
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
