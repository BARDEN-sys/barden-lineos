import type { Point } from "./types";

/** Pan/zoom of the sheet viewer. `tx`/`ty` put the page's top-left corner in viewer pixels. */
export type View = { z: number; tx: number; ty: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const ZOOM_STEPS = [1, 1.5, 2, 3];

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Keep the page covering the viewer. `pw`/`ph` are the page size at 1×, `vw`/`vh` the viewer size.
 * A page smaller than the viewer on an axis is centred on that axis.
 */
export function clampView(v: View, pw: number, ph: number, vw: number, vh: number): View {
  const z = clampZoom(v.z);
  const fit = (t: number, size: number, box: number) => (size <= box ? (box - size) / 2 : Math.min(0, Math.max(box - size, t)));
  return { z, tx: fit(v.tx, pw * z, vw), ty: fit(v.ty, ph * z, vh) };
}

/** Zoom to `z`, keeping the page point under viewer pixel (px, py) fixed. */
export function zoomAt(v: View, z: number, px: number, py: number): View {
  const nz = clampZoom(z);
  return { z: nz, tx: px - ((px - v.tx) / v.z) * nz, ty: py - ((py - v.ty) / v.z) * nz };
}

/**
 * Two-finger gesture: `start` is the view when both fingers landed, `m0`/`d0` their midpoint and
 * distance then, `m`/`d` now. Pinch zooms around the fingers and moving them together pans.
 */
export function pinchView(start: View, m0: Point, d0: number, m: Point, d: number): View {
  const z = clampZoom(start.z * (d0 > 0 ? d / d0 : 1));
  const ux = (m0[0] - start.tx) / start.z;
  const uy = (m0[1] - start.ty) / start.z;
  return { z, tx: m[0] - ux * z, ty: m[1] - uy * z };
}

/** Viewer pixel → page point (0..1 of page width/height), the same space marks are stored in. */
export function viewerToPage(v: View, pw: number, ph: number, px: number, py: number): Point {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  return [c((px - v.tx) / (pw * v.z)), c((py - v.ty) / (ph * v.z))];
}

/** Page point → viewer pixel. */
export function pageToViewer(v: View, pw: number, ph: number, p: Point): Point {
  return [v.tx + p[0] * pw * v.z, v.ty + p[1] * ph * v.z];
}

/** The zoom button to highlight: the nearest step if zoom is within 5% of it, else none. */
export function activeStep(z: number, steps = ZOOM_STEPS): number | null {
  let best: number | null = null;
  for (const s of steps) if (Math.abs(z - s) <= s * 0.05 && (best === null || Math.abs(z - s) < Math.abs(z - best))) best = s;
  return best;
}
