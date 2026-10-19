import { describe, expect, it } from "vitest";
import { activeStep, clampView, pageToViewer, pinchView, viewerToPage, zoomAt, type View } from "@/lib/zoom";

// A 17×11 sheet in a 390 px wide viewer, as on an iPhone.
const W = 390;
const H = (W * 11) / 17;
const ONE: View = { z: 1, tx: 0, ty: 0 };

describe("sheet viewer zoom", () => {
  it("zooms around the point between the fingers", () => {
    const at: [number, number] = [300, 100];
    const before = viewerToPage(ONE, W, H, ...at);
    const v = pinchView(ONE, at, 100, at, 300);
    expect(v.z).toBe(3);
    const after = viewerToPage(v, W, H, ...at);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("keeps zoom between 1× and 5×", () => {
    expect(pinchView(ONE, [0, 0], 100, [0, 0], 10_000).z).toBe(5);
    expect(pinchView({ z: 2, tx: 0, ty: 0 }, [0, 0], 100, [0, 0], 1).z).toBe(1);
    expect(zoomAt(ONE, 0.2, 10, 10).z).toBe(1);
  });

  it("pans with two fingers moving together", () => {
    const start: View = { z: 2, tx: -100, ty: -50 };
    const v = pinchView(start, [100, 100], 200, [130, 80], 200);
    expect(v).toEqual({ z: 2, tx: -70, ty: -70 });
  });

  it("never pans the sheet away from the viewer edges", () => {
    expect(clampView({ z: 1, tx: 40, ty: -40 }, W, H, W, H)).toEqual({ z: 1, tx: 0, ty: 0 });
    const v = clampView({ z: 2, tx: -10_000, ty: 50 }, W, H, W, H);
    expect(v.tx).toBe(W - W * 2);
    expect(v.ty).toBe(0);
  });

  it("a spot placed at 3× lands on the same sheet spot at 1×", () => {
    const zoomed = clampView(zoomAt(ONE, 3, 250, 120), W, H, W, H);
    const tap: [number, number] = [180, 90];
    const spot = viewerToPage(zoomed, W, H, ...tap); // stored on the mark
    expect(pageToViewer(zoomed, W, H, spot)).toEqual([expect.closeTo(180), expect.closeTo(90)]);
    // Back at 1× the spot sits at the same fraction of the sheet.
    const [x, y] = pageToViewer(ONE, W, H, spot);
    expect(x / W).toBeCloseTo(spot[0]);
    expect(y / H).toBeCloseTo(spot[1]);
    // And that is the sheet point that was under the finger at 3×.
    expect(spot[0]).toBeCloseTo((tap[0] - zoomed.tx) / (W * 3));
  });

  it("highlights the nearest zoom button, or none in between", () => {
    expect(activeStep(1)).toBe(1);
    expect(activeStep(1.52)).toBe(1.5);
    expect(activeStep(2.96)).toBe(3);
    expect(activeStep(2.5)).toBeNull();
    expect(activeStep(4.5)).toBeNull();
  });
});
