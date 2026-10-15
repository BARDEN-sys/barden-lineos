// Run measuring (M3): distance along a line tapped on Google Maps, or walked with GPS.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
export const FT_PER_M = 3.280839895;

/** Great-circle distance in meters (haversine; plenty accurate for a few miles). */
export function distanceM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length of a path in whole feet. */
export function pathFt(path: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1], path[i]);
  return Math.round(m * FT_PER_M);
}

export type GpsFix = LatLng & { accuracyM: number; at: number };

/** GPS readings worse than this are ignored (meters). */
export const MAX_ACCURACY_M = 20;

/**
 * Walking measure: decides whether a new GPS reading extends the walked path.
 * Drops fuzzy readings and the jitter of standing still (a step must be bigger than the
 * reading's own error, and at least 2 m), and impossible jumps (faster than ~25 mph).
 */
export function acceptFix(path: GpsFix[], fix: GpsFix): boolean {
  if (fix.accuracyM > MAX_ACCURACY_M) return false;
  const last = path[path.length - 1];
  if (!last) return true;
  const d = distanceM(last, fix);
  if (d < Math.max(2, fix.accuracyM * 0.6)) return false;
  const secs = Math.max(1, (fix.at - last.at) / 1000);
  return d / secs <= 11;
}
