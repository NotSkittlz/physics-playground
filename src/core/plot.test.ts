import { describe, expect, it } from "vitest";
import { wrapPi } from "./math.ts";
import { wrappedSegment } from "./plot.ts";

describe("phase-portrait wrap breaks", () => {
  it("breaks a polyline when wrapPi jumps across ±π", () => {
    const wrap = 2 * Math.PI;
    expect(wrappedSegment(wrapPi(Math.PI - 0.05), wrapPi(Math.PI + 0.05), wrap)).toBe(true);
    expect(wrappedSegment(-3.1, 3.1, wrap)).toBe(true);
    expect(wrappedSegment(0.2, 0.3, wrap)).toBe(false);
  });
});
