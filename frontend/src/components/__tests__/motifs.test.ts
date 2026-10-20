import { describe, expect, it } from "vitest";
import { cuspedArchPath, cuspedArchPoints, pointedArchPoints } from "../motifs";

describe("arch geometry", () => {
  it("a pointed arch is symmetric and peaks at the centre", () => {
    const pts = pointedArchPoints(10, 6, 8);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[0][1]).toBeCloseTo(0);
    expect(pts[8][0]).toBeCloseTo(10);
    expect(pts[4][0]).toBeCloseTo(5);
    expect(pts[4][1]).toBeCloseTo(-6);
    for (let i = 0; i <= 8; i++) expect(pts[i][0] + pts[8 - i][0]).toBeCloseTo(10);
  });

  it("the cusped outline stays within the opening's width and height and starts and ends on the ground", () => {
    const pts = cuspedArchPoints(12, 19, { lobes: 9, riseRatio: 0.62 });
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([12, 0]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThan(-1.5);
    expect(Math.max(...xs)).toBeLessThan(13.5);
    expect(Math.max(...ys)).toBeLessThan(20.5);
    expect(Math.max(...ys)).toBeGreaterThan(17);
  });

  it("produces a closed SVG path", () => {
    const d = cuspedArchPath(90, 150, { lobes: 7 });
    expect(d.startsWith("M0 150")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).not.toMatch(/NaN/);
  });
});
