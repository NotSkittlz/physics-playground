import { describe, expect, it } from "vitest";
import { interpolateSection, sectionTimes } from "./strobe.ts";

describe("Poincaré section sampling", () => {
  it("interpolates onto t = nT rather than the first step after the crossing", () => {
    const hits = interpolateSection(0.9, 0, 1, 1.1, 0.2, 1.2, 1);
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBeCloseTo(1, 12);
    expect(hits[0].th).toBeCloseTo(0.1, 12);
    expect(hits[0].om).toBeCloseTo(1.1, 12);
  });

  it("emits every skipped period when dt > T", () => {
    expect(sectionTimes(0.5, 3.2, 1)).toEqual([1, 2, 3]);
    const hits = interpolateSection(0, 0, 0, 2.5, 1, 2, 1);
    expect(hits.map((h) => h.t)).toEqual([1, 2]);
    expect(hits[0].th).toBeCloseTo(0.4, 12);
    expect(hits[1].th).toBeCloseTo(0.8, 12);
  });

  it("does not sample t = 0", () => {
    expect(sectionTimes(0, 0.3, 1)).toEqual([]);
  });
});
