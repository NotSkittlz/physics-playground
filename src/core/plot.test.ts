import { describe, expect, it } from "vitest";
import { wrapPi } from "./math.ts";
import { formatTick, paddedSpan, wrappedSegment } from "./plot.ts";

describe("phase-portrait wrap breaks", () => {
  it("breaks a polyline when wrapPi jumps across ±π", () => {
    const wrap = 2 * Math.PI;
    expect(wrappedSegment(wrapPi(Math.PI - 0.05), wrapPi(Math.PI + 0.05), wrap)).toBe(true);
    expect(wrappedSegment(-3.1, 3.1, wrap)).toBe(true);
    expect(wrappedSegment(0.2, 0.3, wrap)).toBe(false);
  });
});

describe("plot ticks for tiny energy ranges", () => {
  it("uses scientific notation when the span is smaller than 0.01", () => {
    expect(formatTick(0.06001, 1e-5)).toMatch(/e/i);
    expect(formatTick(-1.8e-6, 4e-6)).toMatch(/e/i);
    expect(formatTick(2.5, 3)).toBe("2.50");
  });

  it("does not collapse a genuine relative-error trace to ±1", () => {
    const r = paddedSpan(-1.8e-6, 2.1e-6);
    expect(r.max - r.min).toBeLessThan(1e-5);
    expect(r.max - r.min).toBeGreaterThan(0);
  });
});
