import { describe, expect, it } from "vitest";
import { wrapPi } from "./math.ts";
import { axisTicks, formatTick, paddedSpan, wrappedSegment } from "./plot.ts";

describe("phase-portrait wrap breaks", () => {
  it("breaks a polyline when wrapPi jumps across ±π", () => {
    const wrap = 2 * Math.PI;
    expect(wrappedSegment(wrapPi(Math.PI - 0.05), wrapPi(Math.PI + 0.05), wrap)).toBe(true);
    expect(wrappedSegment(-3.1, 3.1, wrap)).toBe(true);
    expect(wrappedSegment(0.2, 0.3, wrap)).toBe(false);
  });
});

describe("plot ticks for tiny energy ranges", () => {
  it("uses superscript scientific notation when the span is smaller than 0.01", () => {
    expect(formatTick(0.06001, 1e-5)).toMatch(/10[⁻0-9]+/);
    expect(formatTick(0.06001, 1e-5)).not.toMatch(/e/i);
    expect(formatTick(-1.8e-6, 4e-6)).toMatch(/^−/);
    expect(formatTick(-1.8e-6, 4e-6)).toMatch(/10⁻⁶/);
    expect(formatTick(-1.8e-6, 4e-6)).not.toMatch(/e/i);
    expect(formatTick(7.3e-8, 1e-6)).toMatch(/10⁻⁸/);
    expect(formatTick(2.5, 3)).toBe("2.50");
    expect(formatTick(0, 1e-6)).toBe("0");
  });

  it("keeps the leading minus visible on a negative scientific tick", () => {
    const label = formatTick(-9.9e-7, 1.1e-6);
    expect(label.startsWith("−")).toBe(true);
    expect(label).toMatch(/9\.9×10⁻⁷/);
    expect(label.length).toBeGreaterThan(4);
  });

  it("does not collapse a genuine relative-error trace to ±1", () => {
    const r = paddedSpan(-1.8e-6, 2.1e-6);
    expect(r.max - r.min).toBeLessThan(1e-5);
    expect(r.max - r.min).toBeGreaterThan(0);
    expect(r.min).toBeLessThan(0);
    expect(r.max).toBeGreaterThan(0);
  });

  it("starts a t-series at 0 instead of padding into negative time", () => {
    const r = paddedSpan(0, 0.8, { floor: 0 });
    expect(r.min).toBe(0);
    expect(r.max).toBeGreaterThan(0.8);
  });
});

describe("axis ticks", () => {
  it("includes 0 when a relative-error range crosses zero", () => {
    const ticks = axisTicks(-1.1e-6, 2.2e-6, 3);
    expect(ticks.some((t) => t === 0)).toBe(true);
    expect(ticks[0]).toBeLessThan(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0);
  });

  it("does not flood a lopsided ΔE/E range with 1e-8 ticks", () => {
    const ticks = axisTicks(-2.6e-7, 2.0e-8, 3);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks.some((t) => t === 0)).toBe(true);
    expect(ticks[0]).toBeLessThan(0);
  });

  it("starts a non-negative axis on 0", () => {
    const ticks = axisTicks(0, 1.08, 3);
    expect(ticks[0]).toBe(0);
  });
});
