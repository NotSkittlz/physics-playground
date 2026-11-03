import { describe, expect, it } from "vitest";
import { almostEqual, axpy, clamp, combine, hypot2, invR3, lerp, wrapPi, wrapTwoPi } from "./math.ts";

describe("math helpers", () => {
  it("clamps and lerps", () => {
    expect(clamp(3, 0, 2)).toBe(2);
    expect(clamp(-1, 0, 2)).toBe(0);
    expect(lerp(0, 10, 0.3)).toBeCloseTo(3, 12);
  });

  it("wraps angles onto principal branches", () => {
    expect(wrapPi(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapPi(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapTwoPi(-0.1)).toBeCloseTo(2 * Math.PI - 0.1, 12);
    expect(wrapTwoPi(2 * Math.PI + 0.2)).toBeCloseTo(0.2, 12);
  });

  it("computes inverse-cube with softening", () => {
    expect(hypot2(3, 4)).toBe(25);
    expect(invR3(1)).toBeCloseTo(1, 12);
    expect(invR3(8)).toBeCloseTo(1 / (8 * Math.sqrt(8)), 12);
    expect(invR3(0, 1e-4)).toBeGreaterThan(0);
    expect(Number.isFinite(invR3(0, 1e-8))).toBe(true);
  });

  it("clamps r=0, ε=0 to a huge finite force instead of zero", () => {
    const f = invR3(0, 0);
    expect(f).toBeGreaterThan(1e8);
    expect(Number.isFinite(f)).toBe(true);
  });

  it("performs in-place saxpy / linear combinations", () => {
    const y = new Float64Array([1, 2]);
    const k = new Float64Array([3, 4]);
    const out = new Float64Array(2);
    axpy(out, y, k, 0.5);
    expect(out[0]).toBeCloseTo(2.5, 12);
    expect(out[1]).toBeCloseTo(4, 12);
    combine(out, y, [k, new Float64Array([1, 1])], [2, -1], 1);
    expect(out[0]).toBeCloseTo(1 + 6 - 1, 12);
    expect(almostEqual(1, 1 + 1e-12, 1e-9, 1e-9)).toBe(true);
  });
});
