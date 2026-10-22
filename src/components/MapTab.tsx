"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { canAssign, DRAWN_SOURCE, drawnRun, exportKml, importRuns, isMismatch, kmlText, lineFt, mergeRuns, MISMATCH_LIMIT, parseKml, parseTypedCallouts, runMark, runTotals, toLatLng } from "@/lib/kml";
import { newId } from "@/lib/job";
import { currentUser } from "@/lib/user";
import type { KmlRun, RunGroup } from "@/lib/types";
import { download } from "./ExportTab";
import { useJob } from "./JobProvider";

const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const SAT_CREDIT = "Imagery &copy; Esri, Maxar, Earthstar Geographics";

const COLOR: Record<RunGroup, string> = { PPX: "#ec4899", PPR: "#94a3b8", OTHER: "#38bdf8" };
const fmt = (n: number) => n.toLocaleString("en-US");

/** Google Earth runs: import .kml/.kmz, see them on the map, assign PPX runs to sheets, export. */
/** `onPlace`: open the run's sheet to tap where it goes on the print. */
export function MapTab({ onPlace }: { onPlace?: (markId: string) => void } = {}) {
  const { job, result, dispatch } = useJob();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Points of a run being traced by hand ([lng, lat]); null when not drawing.
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const runs = useMemo(() => job?.kmlRuns ?? [], [job?.kmlRuns]);
  if (!job) return null;

  const totals = runTotals(runs);
  const flagged = runs.filter((r) => r.mismatch).length;
  const markedRuns = job.marks.filter((m) => m.kind === "run" && m.geo).length;
  const wo = job.header.woNumber || "job";

  async function onFiles(files: FileList | null) {
    setError(null);
    setNotice(null);
    // Runs as they will be after each file, so a second file in the same pick is checked against the first.
    let have = runs;
    const notes: string[] = [];
    for (const f of Array.from(files ?? [])) {
      try {
        const parsed = parseKml(kmlText(new Uint8Array(await f.arrayBuffer())));
        if (!parsed.length) throw new Error("no lines (LineString Placemarks) found");
        const added = importRuns(job!, parsed, f.name, currentUser(), newId);
        const merged = mergeRuns(have, added);
        have = merged.runs;
        dispatch({ type: "add-kml-runs", runs: added });
        const t = runTotals(added);
        const onSheet = merged.updatedIds.filter((id) => job!.marks.some((m) => m.geo?.kmlRunId === id)).length;
        notes.push(
          `${f.name}: ${added.length} runs · PPX ${fmt(t.PPX)} ft · PPR ${fmt(t.PPR)} ft (reference)` +
            (t.counts.OTHER ? ` · other ${fmt(t.OTHER)} ft` : "") +
            (merged.unchanged || merged.updated
              ? ` · ${merged.added} new, ${merged.updated} changed, ${merged.unchanged} already here (not added twice)`
              : "") +
            (onSheet ? ` · ${onSheet} changed run${onSheet > 1 ? "s are" : " is"} already on a sheet: take off and put back to bill the new footage` : ""),
        );
        setNotice(notes.join("\n"));
      } catch (e) {
        setError(`Couldn't read ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const sources = [...new Set(runs.map((r) => r.sourceFile))];

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Google Earth runs</h2>
          <label className="btn-primary ml-auto cursor-pointer">
            Upload .kml / .kmz
            <input type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button className="btn-ghost" disabled={draft !== null} onClick={() => { setDraft([]); setNotice(null); setError(null); }}>
            Draw a run
          </button>
          <button className="btn-ghost" disabled={!markedRuns} onClick={() => download(exportKml(job), `WO-${wo}-runs.kml`, "application/vnd.google-earth.kml+xml")}>
            Export marked runs (.kml)
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Each line in the file is a run. Footage for the codes is the <b>printed callout total</b> in the line&apos;s description; the map length is a
          check only. PPR is reference only and never added to PPX. No file? <b>Draw a run</b>: trace it on the map and type the callout feet from
          the print.
        </p>
        {draft && (
          <DrawPanel
            points={draft}
            onUndo={() => setDraft(draft.slice(0, -1))}
            onCancel={() => setDraft(null)}
            onSave={(run) => {
              dispatch({ type: "add-kml-runs", runs: [run] });
              setDraft(null);
              setSelected(run.id);
              setNotice(`${run.name}: ${fmt(run.printedFt)} ft printed (${run.group})${run.mismatch ? " · ⚠ map length is off the printed footage" : ""}`);
            }}
          />
        )}
        {notice && <p className="whitespace-pre-line rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{notice}</p>}
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {runs.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={`PPX · ${totals.counts.PPX} runs`} value={`${fmt(totals.PPX)} ft`} strong />
            <Stat label={`PPR · ${totals.counts.PPR} (reference)`} value={`${fmt(totals.PPR)} ft`} />
            <Stat label="Combined (info)" value={`${fmt(totals.combined)} ft`} />
            <Stat label={`Map vs printed > ${MISMATCH_LIMIT * 100}%`} value={`${flagged} flagged`} warn={flagged > 0} />
          </div>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1 text-xs text-slate-500">
            {sources.map((s) => (
              <span key={s} className="chip border-slate-300">
                {s}
                <button
                  className="ml-1 text-red-600"
                  aria-label={`Remove ${s}`}
                  onClick={() => {
                    if (confirm(`Remove the runs from ${s}? Runs already on a sheet stay there.`))
                      dispatch({ type: "delete-kml-runs", ids: runs.filter((r) => r.sourceFile === s).map((r) => r.id) });
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {(runs.length > 0 || draft) && (
        <RunsMap runs={runs} selected={selected} onSelect={setSelected} draft={draft} onAddPoint={(p) => setDraft((d) => (d ? [...d, p] : d))} />
      )}

      {(["PPX", "OTHER", "PPR"] as RunGroup[]).map((g) => {
        const list = runs.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="card flex flex-col gap-2">
            <h3 className="font-bold">
              {g === "OTHER" ? "Other lines" : g} · {fmt(totals[g])} ft
              {g === "PPR" && <span className="ml-2 text-sm font-normal text-slate-500">reference only — not billed</span>}
            </h3>
            {list.map((r) => (
              <RunRow key={r.id} run={r} selected={selected === r.id} onSelect={() => setSelected(r.id)} onPlace={onPlace} />
            ))}
          </section>
        );
      })}

      {runs.length === 0 && markedRuns === 0 && !draft && <p className="text-sm text-slate-500">No Google Earth file yet. Upload one or draw a run.</p>}
      {result && runs.length > 0 && <p className="text-xs text-slate-500">Assigned runs go through the same allocation as hand-marked runs: never over master.</p>}
    </div>
  );
}

function DrawPanel({ points, onUndo, onCancel, onSave }: { points: [number, number][]; onUndo: () => void; onCancel: () => void; onSave: (run: KmlRun) => void }) {
  const { job } = useJob();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<RunGroup>("PPX");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mapFt = points.length >= 2 ? lineFt([points]) : 0;
  const { callouts, total } = parseTypedCallouts(text);
  const printedFt = total ?? callouts.reduce((a, c) => a + c.ft, 0);
  const off = printedFt > 0 && mapFt > 0 && isMismatch(printedFt, mapFt);

  function save() {
    try {
      onSave(drawnRun(job!, { name, group, line: points, calloutText: text }, currentUser(), newId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-pink-300 bg-pink-50 p-3 text-sm">
      <p className="font-semibold">Draw a run: tap the map along the route, then type the callouts from the print.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-h-9 w-auto flex-1" placeholder="Run name (e.g. Sapphire)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Run name" />
        <select className="input min-h-9 w-auto" value={group} onChange={(e) => setGroup(e.target.value as RunGroup)} aria-label="PPX or PPR">
          <option value="PPX">PPX (billed)</option>
          <option value="PPR">PPR (reference only)</option>
        </select>
      </div>
      <textarea
        className="input min-h-24 font-mono"
        placeholder={"One callout per line:\nPPX callout 1 = 230\nPPX callout 2 = 116\nor just 300\nTotal 894 (optional)"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Callouts"
      />
      <p className="tabular-nums">
        {points.length} points · map ~{fmt(mapFt)} ft · printed <b>{fmt(printedFt)} ft</b> from {callouts.length} callouts
        {total !== null && " (total line)"}
        {off && <span className="ml-2 chip border-amber-300 bg-amber-400 text-amber-950">⚠ more than {MISMATCH_LIMIT * 100}% off</span>}
      </p>
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary min-h-9" onClick={save}>Save run</button>
        <button className="btn-ghost min-h-9" disabled={!points.length} onClick={onUndo}>Undo point</button>
        <button className="btn-ghost min-h-9" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Stat({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`tabular-nums ${strong ? "text-xl font-bold" : "text-lg font-semibold"}`}>{value}</p>
    </div>
  );
}

function RunRow({ run, selected, onSelect, onPlace }: { run: KmlRun; selected: boolean; onSelect: () => void; onPlace?: (markId: string) => void }) {
  const { job, dispatch } = useJob();
  // Run footage only bills under FOOTAGE codes (never pairs / each).
  const codes = job!.master.filter((m) => job!.glossary.find((g) => g.code === m.code)?.unitType === "FOOTAGE");
  const [sheetId, setSheetId] = useState(job!.sheets[0]?.id ?? "");
  const [code, setCode] = useState(codes[0]?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const mark = job!.marks.find((m) => m.geo?.kmlRunId === run.id);
  const sheetLabel = (id: string) => job!.sheets.find((s) => s.id === id)?.label ?? "?";
  const diff = run.printedFt ? Math.round(((run.mapFt - run.printedFt) / run.printedFt) * 100) : null;
  const needsConfirm = run.mismatch && !run.confirmedBy;

  function assign() {
    const check = canAssign(job!, run, code);
    if (!check.ok) return setError(check.error);
    if (!sheetId) return setError("This job has no sheets to put the run on.");
    setError(null);
    dispatch({ type: "add-mark", mark: runMark(run, sheetId, code, currentUser(), newId("mark")) });
  }

  return (
    <div className={`rounded-lg border p-2 ${selected ? "border-pink-500 ring-2 ring-pink-200" : "border-slate-200"}`} onClick={onSelect}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: COLOR[run.group] }} />
        <button className="font-semibold underline-offset-2 hover:underline" onClick={() => setOpen((o) => !o)}>{run.name}</button>
        <span className="tabular-nums">{fmt(run.printedFt)} ft printed</span>
        {run.lines.length ? (
          <span className="text-sm text-slate-500 tabular-nums">map ~{fmt(run.mapFt)} ft{diff !== null && ` (${diff > 0 ? "+" : ""}${diff}%)`}</span>
        ) : (
          <span className="text-sm text-slate-500">folder table · no map line</span>
        )}
        {needsConfirm && (
          <span className="chip border-amber-300 bg-amber-400 text-amber-950" title={`Map length is more than ${MISMATCH_LIMIT * 100}% off the printed footage`}>
            ⚠ check footage
          </span>
        )}
        {run.mismatch && run.confirmedBy && (
          <span className="chip border-emerald-300 bg-emerald-50 text-emerald-800" title={run.confirmedAt}>
            ✓ printed footage checked · {run.confirmedBy}
          </span>
        )}
        {!run.callouts.length && <span className="chip border-red-300 bg-red-50 text-red-700">no callout table</span>}
        {run.sourceFile === DRAWN_SOURCE && (
          <button
            className="ml-auto text-sm text-red-600"
            onClick={() => {
              if (confirm(`Delete the drawn run ${run.name}? If it is on a sheet it stays there.`)) dispatch({ type: "delete-kml-runs", ids: [run.id] });
            }}
          >
            Delete
          </button>
        )}
      </div>
      {open && (
        <table className="mt-2 text-sm">
          <tbody>
            {run.callouts.map((c, i) => (
              <tr key={i}>
                <td className="pr-4">{c.label}</td>
                <td className="text-right tabular-nums">{fmt(c.ft)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="pr-4">Total</td>
              <td className="text-right tabular-nums">{fmt(run.printedFt)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {run.group !== "PPR" && run.lines.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {mark ? (
            <>
              <span className="chip border-emerald-300 bg-emerald-50 text-emerald-800">
                On sheet {sheetLabel(mark.sheetId)} · {mark.items.map((i) => `${i.code} ${fmt(i.qty)}`).join(", ")}
              </span>
              {onPlace && (
                <button className={`${mark.geo?.placed ? "btn-ghost" : "btn-primary"} min-h-9`} onClick={() => onPlace(mark.id)}>
                  📍 {mark.geo?.placed ? "Move on print" : "Place on print"}
                </button>
              )}
              {!mark.geo?.placed && <span className="text-amber-800">not placed on the print yet</span>}
              <button className="btn-ghost min-h-9" onClick={() => dispatch({ type: "delete-mark", id: mark.id })}>Take off sheet</button>
            </>
          ) : (
            <>
              <select className="input min-h-9 w-auto" value={sheetId} onChange={(e) => setSheetId(e.target.value)} aria-label="Sheet">
                {job!.sheets.map((s) => (
                  <option key={s.id} value={s.id}>Sheet {s.label}</option>
                ))}
              </select>
              <select className="input min-h-9 w-auto" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Unit code">
                {codes.map((m) => (
                  <option key={m.code} value={m.code}>{m.code}</option>
                ))}
              </select>
              {needsConfirm ? (
                <button
                  className="btn-primary min-h-9"
                  onClick={(e) => {
                    e.stopPropagation();
                    setError(null);
                    dispatch({ type: "confirm-kml-run", id: run.id, confirmed: true });
                  }}
                >
                  Printed {fmt(run.printedFt)} ft matches the print
                </button>
              ) : (
                <button className="btn-primary min-h-9" disabled={!codes.length || !job!.sheets.length} onClick={assign}>Put on sheet</button>
              )}
              {run.mismatch && run.confirmedBy && (
                <button className="btn-ghost min-h-9" onClick={() => dispatch({ type: "confirm-kml-run", id: run.id, confirmed: false })}>Undo check</button>
              )}
              {needsConfirm && <span className="text-slate-500">Map line is {diff! > 0 ? "longer" : "shorter"} by {Math.abs(diff!)}%. Check the callouts on the print, then confirm.</span>}
              {!codes.length && <span className="text-slate-500">Add the footage code (unit type FOOTAGE) in Codes and on the Master list first.</span>}
            </>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function RunsMap({
  runs,
  selected,
  onSelect,
  draft,
  onAddPoint,
}: {
  runs: KmlRun[];
  selected: string | null;
  onSelect: (id: string) => void;
  draft: [number, number][] | null;
  onAddPoint: (p: [number, number]) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef("");
  const draftRef = useRef<LayerGroup | null>(null);
  // The click handler is bound once; read the latest drawing state through refs.
  const drawing = useRef(false);
  drawing.current = draft !== null;
  const addPoint = useRef(onAddPoint);
  addPoint.current = onAddPoint;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    import("leaflet").then((L) => {
      if (cancelled || !divRef.current) return;
      map = L.map(divRef.current, { maxZoom: 20, zoomAnimation: false }).setView({ lat: 27.95, lng: -82.46 }, 15);
      L.tileLayer(SATELLITE, { maxZoom: 20, maxNativeZoom: 19, attribution: SAT_CREDIT }).addTo(map);
      L.tileLayer(SAT_LABELS, { maxZoom: 20, maxNativeZoom: 19 }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      draftRef.current = L.layerGroup().addTo(map);
      map.on("click", (e) => {
        if (drawing.current) addPoint.current([e.latlng.lng, e.latlng.lat]);
      });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void import("leaflet").then((L) => {
      const layer = layerRef.current;
      if (!layer || !mapRef.current) return;
      layer.clearLayers();
      const all: L.LatLngExpression[] = [];
      for (const r of runs) {
        for (const l of r.lines) {
          const pts = toLatLng(l);
          all.push(...pts);
          const line = L.polyline(pts, {
            color: COLOR[r.group],
            weight: r.id === selected ? 9 : 5,
            opacity: r.group === "PPR" ? 0.7 : 0.95,
            dashArray: r.group === "PPR" ? "8 8" : undefined,
          });
          line.bindTooltip(`${r.group} · ${r.name} · ${fmt(r.printedFt)} ft${r.mismatch ? " ⚠" : ""}`);
          line.on("click", (e) => {
            if (drawing.current) return; // let the click reach the map as a new point
            L.DomEvent.stopPropagation(e);
            onSelect(r.id);
          });
          line.addTo(layer);
        }
      }
      // Table-only runs (e.g. PPR footage written on its folder) have no line: label them at the job's corner.
      const tables = runs.filter((r) => !r.lines.length);
      if (all.length && tables.length) {
        const b = L.latLngBounds(all);
        const top = L.latLng(b.getNorth(), b.getCenter().lng);
        tables.forEach((r, i) => {
          const icon = L.divIcon({
            className: "",
            iconSize: undefined,
            iconAnchor: [0, 8 + i * 30],
            html: `<div style="position:absolute;transform:translate(-50%,-100%);white-space:nowrap;border:2px dashed ${COLOR[r.group]};background:rgba(255,255,255,.92);color:#334155;border-radius:6px;padding:2px 6px;font:600 12px system-ui;${r.id === selected ? "outline:3px solid #ec4899;" : ""}">${r.group} ref · ${fmt(r.printedFt)} ft <span style="font-weight:400">(table, not drawn)</span></div>`,
          });
          L.marker(top, { icon, keyboard: false }).on("click", () => onSelect(r.id)).addTo(layer);
        });
      }
      const key = runs.map((r) => r.id).join();
      if (all.length && fitted.current !== key) {
        fitted.current = key;
        // No animation: leaving the tab mid-zoom would crash Leaflet (_leaflet_pos).
        const labels = runs.filter((r) => !r.lines.length).length;
        mapRef.current?.fitBounds(L.latLngBounds(all), { paddingTopLeft: [24, 24 + labels * 30], paddingBottomRight: [24, 24], maxZoom: 19, animate: false });
      }
    });
  }, [runs, selected, ready, onSelect]);

  useEffect(() => {
    if (!ready) return;
    void import("leaflet").then((L) => {
      const layer = draftRef.current;
      if (!layer) return;
      layer.clearLayers();
      if (!draft) return;
      const pts = toLatLng(draft);
      if (pts.length >= 2) L.polyline(pts, { color: COLOR.PPX, weight: 5, dashArray: "4 6", interactive: false }).addTo(layer);
      for (const p of pts) L.circleMarker(p, { radius: 5, color: "#fff", weight: 2, fillColor: COLOR.PPX, fillOpacity: 1, interactive: false }).addTo(layer);
    });
  }, [draft, ready]);

  // Starting a drawing with nothing on the map: centre on where the crew is standing.
  const startedEmpty = draft !== null && draft.length === 0 && runs.length === 0;
  useEffect(() => {
    if (!ready || !startedEmpty || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => mapRef.current?.setView({ lat: p.coords.latitude, lng: p.coords.longitude }, 18, { animate: false }), () => {}, { timeout: 8000 });
  }, [ready, startedEmpty]);

  return (
    // isolate: Leaflet's panes and zoom buttons use z-index up to 1000; keep them under the sticky header.
    <div className="relative isolate h-[55vh] min-h-72 overflow-hidden rounded-xl border border-slate-200">
      <div ref={divRef} className="absolute inset-0 bg-slate-200" />
      <div className="absolute bottom-7 left-2 z-[500] flex gap-2 rounded bg-white/90 px-2 py-1 text-xs shadow">
        <span style={{ color: COLOR.PPX }}>━ PPX</span>
        <span style={{ color: COLOR.PPR }}>┅ PPR (ref, not billed)</span>
      </div>
    </div>
  );
}
