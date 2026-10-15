"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps is loaded at runtime, untyped. */

import { useEffect, useRef, useState } from "react";
import { acceptFix, MAX_ACCURACY_M, pathFt, type GpsFix, type LatLng } from "@/lib/geo";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

declare global {
  interface Window {
    google?: any;
    __lineosMapsReady?: () => void;
  }
}

let mapsLoading: Promise<any> | null = null;
function loadGoogleMaps(): Promise<any> {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise((resolve, reject) => {
    window.__lineosMapsReady = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&callback=__lineosMapsReady`;
    s.async = true;
    s.onerror = () => {
      mapsLoading = null;
      s.remove();
      reject(new Error("Google Maps didn't load. Check the signal and try again."));
    };
    document.head.appendChild(s);
  });
  return mapsLoading;
}

const LAST_VIEW = "lineos-map-view";

/** Full-screen measuring: tap along the street on Google Maps, or walk the run with GPS. */
export function MeasureRun({ streets, onUse, onClose }: { streets: string[]; onUse: (ft: number, how: "map" | "gps") => void; onClose: () => void }) {
  const [mode, setMode] = useState<"map" | "walk">(MAPS_KEY ? "map" : "walk");
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-label="Measure run">
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

function MapMeasure({ streets, onUse }: { streets: string[]; onUse: (ft: number) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const dotsRef = useRef<any[]>([]);
  const [path, setPath] = useState<LatLng[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [satellite, setSatellite] = useState(true);

  useEffect(() => {
    if (!MAPS_KEY) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !divRef.current) return;
        let view = { center: { lat: 27.95, lng: -82.46 }, zoom: 17 };
        try {
          const saved = localStorage.getItem(LAST_VIEW);
          if (saved) view = JSON.parse(saved);
        } catch {}
        const map = new maps.Map(divRef.current, {
          ...view,
          mapTypeId: "hybrid",
          gestureHandling: "greedy",
          clickableIcons: false,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          tilt: 0,
        });
        mapRef.current = map;
        lineRef.current = new maps.Polyline({ map, strokeColor: "#facc15", strokeOpacity: 0.9, strokeWeight: 7, clickable: false });
        map.addListener("click", (e: any) => setPath((p) => [...p, { lat: e.latLng.lat(), lng: e.latLng.lng() }]));
        map.addListener("idle", () => {
          try {
            const c = map.getCenter();
            localStorage.setItem(LAST_VIEW, JSON.stringify({ center: { lat: c.lat(), lng: c.lng() }, zoom: map.getZoom() }));
          } catch {}
        });
        // First time: start where the phone is.
        if (!localStorage.getItem(LAST_VIEW)) goToMe();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the yellow line and the tap points.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current || !lineRef.current) return;
    lineRef.current.setPath(path);
    dotsRef.current.forEach((d) => d.setMap(null));
    dotsRef.current = path.map(
      (p) =>
        new maps.Circle({
          map: mapRef.current,
          center: p,
          radius: 0.8,
          strokeColor: "#0f172a",
          strokeWeight: 2,
          fillColor: "#facc15",
          fillOpacity: 1,
          clickable: false,
        }),
    );
  }, [path]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(satellite ? "hybrid" : "roadmap");
  }, [satellite]);

  function goToMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        mapRef.current?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(18);
      },
      () => setError("Couldn't get your location. Search for the street instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function find(q: string) {
    const maps = window.google?.maps;
    if (!maps || !q.trim()) return;
    setError(null);
    new maps.Geocoder().geocode({ address: q, bounds: mapRef.current?.getBounds() }, (results: any[], status: string) => {
      if (status === "OK" && results[0]) {
        const g = results[0].geometry;
        if (g.viewport) mapRef.current.fitBounds(g.viewport);
        else mapRef.current.setCenter(g.location);
      } else setError(`Couldn't find “${q}”. Add the town, e.g. “${q}, Tampa FL”.`);
    });
  }

  if (!MAPS_KEY) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          The Google map isn&apos;t switched on yet (it needs the Google Maps key). Use <b>🚶 Walk it</b> for now.
        </p>
      </div>
    );
  }

  const ft = pathFt(path);
  return (
    <div className="flex flex-1 flex-col">
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          find(search);
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
            <button key={s} className="chip shrink-0 border-slate-300" onClick={() => { setSearch(s); find(s); }}>{s}</button>
          ))}
        </div>
      )}
      {error && <p className="mx-3 mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="relative flex-1">
        <div ref={divRef} className="absolute inset-0 bg-slate-200" />
        <button
          className="btn absolute top-2 right-2 border border-slate-300 bg-white shadow"
          onClick={() => setSatellite((v) => !v)}
        >
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
