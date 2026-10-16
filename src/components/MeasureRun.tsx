"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Polyline, LayerGroup, TileLayer } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { acceptFix, MAX_ACCURACY_M, pathFt, type GpsFix, type LatLng } from "@/lib/geo";

// Free maps, no key or account: OpenStreetMap streets, Esri satellite photos, OpenStreetMap search.
const STREETS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREETS_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const SAT_CREDIT = "Imagery &copy; Esri, Maxar, Earthstar Geographics";

const LAST_VIEW = "lineos-map-view";

/** Full-screen measuring: tap along the street on the map, or walk the run with GPS. */
export function MeasureRun({ streets, onUse, onClose }: { streets: string[]; onUse: (ft: number, how: "map" | "gps") => void; onClose: () => void }) {
  const [mode, setMode] = useState<"map" | "walk">("map");
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-white" role="dialog" aria-label="Measure run">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <h2 className="font-bold">📏 Measure run</h2>
        <div className="ml-2 flex gap-1">
          <button className={`btn border ${mode === "map" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`} onClick={() => setMode("map")}>
            🗺️ Map
          </button>
          <button className={`btn border ${mode === "walk" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`} onClick={() => setMode("walk")}>
            🚶 Walk it
          </button>
        </div>
        <button className="btn-ghost ml-auto" onClick={onClose}>Cancel</button>
      </div>
      {mode === "map" ? <MapMeasure streets={streets} onUse={(ft) => onUse(ft, "map")} /> : <WalkMeasure onUse={(ft) => onUse(ft, "gps")} />}
    </div>
  );
}

function MapMeasure({ streets: fromSheet, onUse }: { streets: string[]; onUse: (ft: number) => void }) {
  // Skip print text that isn't a street name ("2 OF 5 TARPON DR", "TO IT ON 3RD ST").
  const streets = fromSheet.filter((s) => !/\bOF\b|^TO\b|\bON\b/.test(s));
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const lineRef = useRef<Polyline | null>(null);
  const dotsRef = useRef<LayerGroup | null>(null);
  const layersRef = useRef<{ streets: TileLayer; sat: TileLayer; labels: TileLayer } | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [satellite, setSatellite] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    import("leaflet").then((L) => {
      if (cancelled || !divRef.current) return;
      let view = { center: { lat: 27.95, lng: -82.46 }, zoom: 17 };
      let saved = false;
      try {
        const v = localStorage.getItem(LAST_VIEW);
        if (v) {
          view = JSON.parse(v);
          saved = true;
        }
      } catch {}
      map = L.map(divRef.current, { zoomControl: true, maxZoom: 20 }).setView(view.center, view.zoom);
      mapRef.current = map;
      layersRef.current = {
        streets: L.tileLayer(STREETS, { maxZoom: 20, maxNativeZoom: 19, attribution: STREETS_CREDIT }),
        sat: L.tileLayer(SATELLITE, { maxZoom: 20, maxNativeZoom: 19, attribution: SAT_CREDIT }),
        labels: L.tileLayer(SAT_LABELS, { maxZoom: 20, maxNativeZoom: 19 }),
      };
      layersRef.current.sat.addTo(map);
      layersRef.current.labels.addTo(map);
      lineRef.current = L.polyline([], { color: "#facc15", weight: 7, opacity: 0.9, interactive: false }).addTo(map);
      dotsRef.current = L.layerGroup().addTo(map);
      map.on("click", (e) => setPath((p) => [...p, { lat: e.latlng.lat, lng: e.latlng.lng }]));
      map.on("moveend", () => {
        try {
          const c = map!.getCenter();
          localStorage.setItem(LAST_VIEW, JSON.stringify({ center: { lat: c.lat, lng: c.lng }, zoom: map!.getZoom() }));
        } catch {}
      });
      setReady(true);
      // First time: start where the phone is.
      if (!saved) goToMe();
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the yellow line and the tap points.
  useEffect(() => {
    if (!ready) return;
    void import("leaflet").then((L) => {
      lineRef.current?.setLatLngs(path);
      dotsRef.current?.clearLayers();
      for (const p of path) {
        L.circleMarker(p, { radius: 6, color: "#0f172a", weight: 2, fillColor: "#facc15", fillOpacity: 1, interactive: false }).addTo(dotsRef.current!);
      }
    });
  }, [path, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const l = layersRef.current;
    if (!map || !l) return;
    if (satellite) {
      l.streets.remove();
      l.sat.addTo(map);
      l.labels.addTo(map);
    } else {
      l.sat.remove();
      l.labels.remove();
      l.streets.addTo(map);
    }
  }, [satellite, ready]);

  function goToMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => mapRef.current?.setView({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 19),
      () => setError("Couldn't get your location. Search for the street instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function find(q: string) {
    const map = mapRef.current;
    if (!map || !q.trim()) return;
    setError(null);
    try {
      const b = map.getBounds().pad(20);
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us" +
        `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const [hit] = (await res.json()) as { lat: string; lon: string; boundingbox?: string[] }[];
      if (!hit) return setError(`Couldn't find “${q}”. Add the town, e.g. “${q}, Tampa FL”.`);
      if (hit.boundingbox) {
        const [s, n, w, e] = hit.boundingbox.map(Number);
        map.fitBounds([[s, w], [n, e]], { maxZoom: 19 });
      } else map.setView({ lat: Number(hit.lat), lng: Number(hit.lon) }, 18);
    } catch {
      setError("Search needs signal. Tap 📍 Me or move the map by hand.");
    }
  }

  const ft = pathFt(path);
  return (
    <div className="flex flex-1 flex-col">
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void find(search);
        }}
      >
        <input className="input flex-1" placeholder="Street or address" value={search} onChange={(e) => setSearch(e.target.value)} enterKeyHint="search" />
        <button className="btn-ghost" type="submit">Find</button>
        <button className="btn-ghost" type="button" onClick={goToMe} aria-label="Go to my location">📍 Me</button>
      </form>
      {streets.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2">
          <span className="shrink-0 text-xs text-slate-500">On sheet:</span>
          {streets.map((s) => (
            <button key={s} className="chip shrink-0 border-slate-300" onClick={() => { setSearch(s); void find(s); }}>{s}</button>
          ))}
        </div>
      )}
      {error && <p className="mx-3 mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="relative flex-1">
        <div ref={divRef} className="absolute inset-0 bg-slate-200" />
        <button className="btn absolute top-2 right-2 z-[500] border border-slate-300 bg-white shadow" onClick={() => setSatellite((v) => !v)}>
          {satellite ? "Street map" : "Satellite"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
        <span className="text-sm text-slate-600">{path.length < 2 ? "Tap along the street where the cable runs." : `${path.length} points`}</span>
        <span className="text-2xl font-bold">{ft.toLocaleString()}′</span>
        <button className="btn-ghost ml-auto" disabled={!path.length} onClick={() => setPath((p) => p.slice(0, -1))}>Undo</button>
        <button className="btn-ghost" disabled={!path.length} onClick={() => setPath([])}>Clear</button>
        <button className="btn-primary" disabled={path.length < 2} onClick={() => onUse(ft)}>Use {ft.toLocaleString()} ft</button>
      </div>
    </div>
  );
}

function WalkMeasure({ onUse }: { onUse: (ft: number) => void }) {
  const [state, setState] = useState<"ready" | "walking" | "paused">("ready");
  const [path, setPath] = useState<GpsFix[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lockRef = useRef<any>(null);

  function stop() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    lockRef.current?.release?.().catch(() => {});
    lockRef.current = null;
  }
  useEffect(() => stop, []);

  async function start() {
    if (!navigator.geolocation) return setError("This device has no GPS.");
    setError(null);
    try {
      // Keep the screen on while walking.
      lockRef.current = await (navigator as any).wakeLock?.request("screen");
    } catch {}
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GpsFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, at: pos.timestamp };
        setAccuracy(Math.round(pos.coords.accuracy));
        setPath((p) => (acceptFix(p, fix) ? [...p, fix] : p));
      },
      (e) => {
        setError(e.code === 1 ? "Location is blocked. Allow location for this site in Settings → Safari → Location." : "Lost the GPS. Step into the open and try again.");
        stop();
        setState("paused");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    setState("walking");
  }

  const ft = pathFt(path);
  const good = accuracy != null && accuracy <= MAX_ACCURACY_M;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="max-w-md text-sm text-slate-600">
        Stand at the start of the run, tap <b>Start</b>, and walk along the cable route. Keep this screen open. Tap{" "}
        <b>Pause</b> if you need to stop or cross back.
      </p>
      <div className="text-6xl font-bold tabular-nums">{ft.toLocaleString()}′</div>
      <p className={`text-sm ${accuracy == null ? "text-slate-500" : good ? "text-emerald-700" : "text-amber-700"}`}>
        {accuracy == null ? "GPS not started" : good ? `GPS good (±${Math.round(accuracy * 3.28)} ft)` : `GPS weak (±${Math.round(accuracy * 3.28)} ft) — waiting for a better fix`}
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {state !== "walking" ? (
          <button className="btn-primary min-h-14 px-8 text-lg" onClick={() => void start()}>
            {state === "ready" ? "Start" : "Keep walking"}
          </button>
        ) : (
          <button className="btn-ghost min-h-14 px-8 text-lg" onClick={() => { stop(); setState("paused"); }}>Pause</button>
        )}
        {path.length > 0 && state !== "walking" && (
          <button className="btn-ghost min-h-14" onClick={() => { setPath([]); setState("ready"); }}>Start over</button>
        )}
      </div>
      <button className="btn-primary" disabled={path.length < 2} onClick={() => { stop(); onUse(ft); }}>
        Use {ft.toLocaleString()} ft
      </button>
    </div>
  );
}
