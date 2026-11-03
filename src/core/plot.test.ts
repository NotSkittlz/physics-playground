import { describe, expect, it } from "vitest";
import { wrapPi } from "./math.ts";
import {
  axisTicks,
  formatTick,
  layoutPlotTicks,
  MONO_ADVANCE,
  paddedSpan,
  type PlacedTick,
  wrappedSegment,
} from "./plot.ts";

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

  it("never prints −0 or −0.00", () => {
    expect(formatTick(-0, 1)).toBe("0");
    expect(formatTick(-0.004, 0.28)).toBe("0");
    expect(formatTick(-0.001, 0.25)).toBe("0");
    expect(formatTick(-1e-16, 1)).toBe("0");
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
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0);
  });

  it("does not flood a lopsided ΔE/E range with 1e-8 ticks", () => {
    const ticks = axisTicks(-2.6e-7, 2.0e-8, 3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.some((t) => t === 0)).toBe(true);
  });

  it("starts a non-negative axis on 0", () => {
    const ticks = axisTicks(0, 1.08, 3);
    expect(ticks[0]).toBe(0);
  });
});

const DESKTOP = { width: 304, height: 172 };
const MOBILE = { width: 358, height: 180 };
const measure = (s: string) => s.length * MONO_ADVANCE;

function assertNoMinusZero(ticks: PlacedTick[]): void {
  for (const t of ticks) {
    expect(t.label).not.toMatch(/^−0(\.0+)?$/);
    expect(t.label).not.toBe("-0.00");
    expect(t.label).not.toBe("-0");
  }
}

function assertNoOverlap(ticks: PlacedTick[], along: (s: string) => number, gap: number): void {
  const sorted = ticks.slice().sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    expect(b.pos - a.pos).toBeGreaterThanOrEqual((along(a.label) + along(b.label)) / 2 + gap - 0.5);
  }
}

describe("tick layout at the plot sizes we ship", () => {
  it("keeps Kepler ΔE/E ticks from colliding at 304×172", () => {
    const y = paddedSpan(-0.004, 0.26);
    const x = paddedSpan(0, 1.08, { floor: 0 });
    const layout = layoutPlotTicks({
      xmin: x.min,
      xmax: x.max,
      ymin: y.min,
      ymax: y.max,
      ...DESKTOP,
      hasLegend: true,
      measure,
    });
    assertNoMinusZero(layout.xTicks);
    assertNoMinusZero(layout.yTicks);
    assertNoOverlap(layout.yTicks, () => 12, 6);
    assertNoOverlap(layout.xTicks, measure, 10);
    const yZero = layout.yTicks.filter((t) => t.label === "0");
    const xZero = layout.xTicks.filter((t) => t.label === "0");
    expect(yZero.length + xZero.length).toBeGreaterThanOrEqual(1);
    if (yZero[0] && xZero[0]) {
      expect(yZero[0].pos).toBeLessThan(layout.innerH - 12);
    }
  });

  it("sizes the e-field gutter to the widest scientific label", () => {
    const y = paddedSpan(-2.6e-7, 2.1e-8);
    const x = paddedSpan(0, 1.7, { floor: 0 });
    const layout = layoutPlotTicks({
      xmin: x.min,
      xmax: x.max,
      ymin: y.min,
      ymax: y.max,
      ...DESKTOP,
      measure,
    });
    assertNoMinusZero(layout.yTicks);
    assertNoOverlap(layout.yTicks, () => 12, 6);
    assertNoOverlap(layout.xTicks, measure, 10);
    let widest = 0;
    for (const t of layout.yTicks) widest = Math.max(widest, measure(t.label));
    expect(layout.padL).toBeGreaterThanOrEqual(widest + 14);
    expect(layout.padL - 8 - widest).toBeGreaterThanOrEqual(4);
    for (const t of layout.yTicks) {
      expect(t.pos).toBeGreaterThanOrEqual(0);
      expect(t.pos).toBeLessThanOrEqual(layout.innerH);
    }
  });

  it("uses fewer ticks on a short mobile plot", () => {
    const y = paddedSpan(-0.004, 0.26);
    const x = paddedSpan(0, 1.08, { floor: 0 });
    const layout = layoutPlotTicks({
      xmin: x.min,
      xmax: x.max,
      ymin: y.min,
      ymax: y.max,
      ...MOBILE,
      hasLegend: true,
      measure,
    });
    expect(layout.yTicks.length).toBeLessThanOrEqual(4);
    expect(layout.xTicks.length).toBeLessThanOrEqual(4);
    assertNoMinusZero(layout.xTicks);
    assertNoMinusZero(layout.yTicks);
    assertNoOverlap(layout.yTicks, () => 12, 6);
    assertNoOverlap(layout.xTicks, measure, 10);
  });
});
