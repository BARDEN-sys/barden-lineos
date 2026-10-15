import { describe, expect, it } from "vitest";
import { acceptFix, distanceM, pathFt, type GpsFix } from "@/lib/geo";

describe("run measuring", () => {
  it("measures distance along a tapped line", () => {
    // 0.001° of latitude ≈ 111.2 m ≈ 365 ft.
    const a = { lat: 28.0, lng: -82.5 };
    const b = { lat: 28.001, lng: -82.5 };
    expect(distanceM(a, b)).toBeCloseTo(111.2, 0);
    expect(pathFt([a, b])).toBe(365);
    expect(pathFt([a, b, a])).toBe(730);
    expect(pathFt([a])).toBe(0);
  });

  it("walking: ignores fuzzy readings, standing-still jitter and jumps", () => {
    const start: GpsFix = { lat: 28, lng: -82.5, accuracyM: 5, at: 0 };
    expect(acceptFix([], start)).toBe(true);
    expect(acceptFix([], { ...start, accuracyM: 50 })).toBe(false);
    // 1 m away: jitter
    expect(acceptFix([start], { lat: 28.000009, lng: -82.5, accuracyM: 5, at: 5000 })).toBe(false);
    // ~11 m in 8 s: walking
    expect(acceptFix([start], { lat: 28.0001, lng: -82.5, accuracyM: 5, at: 8000 })).toBe(true);
    // ~111 m in 2 s: bad reading
    expect(acceptFix([start], { lat: 28.001, lng: -82.5, accuracyM: 5, at: 2000 })).toBe(false);
  });
});
