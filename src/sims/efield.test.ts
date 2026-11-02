import { describe, expect, it } from "vitest";
import { equipotentialLevels, zeroContourAnchor } from "./efield.ts";

describe("equipotential levels", () => {
  it("includes V = 0 for a sign-changing dipole range", () => {
    const levels = equipotentialLevels(-2, 2, 11);
    expect(levels.some((l) => l === 0)).toBe(true);
    expect(levels.some((l) => Math.abs(l) < 1e-12)).toBe(true);
  });

  it("does not invent a zero when V never crosses it", () => {
    const levels = equipotentialLevels(1, 4, 11);
    expect(levels.some((l) => Math.abs(l) < 1e-12)).toBe(false);
    expect(levels).toHaveLength(10);
  });

  it("anchors the V = 0 label on a mid-plane crossing", () => {
    const nx = 5;
    const ny = 5;
    const V = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) V[j * nx + i] = i - 2;
    }
    const p = zeroContourAnchor(V, nx, ny, 400, 300);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(200, 5);
    expect(p!.y).toBeLessThan(300 * 0.35);
  });
});
