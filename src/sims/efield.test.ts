import { describe, expect, it } from "vitest";
import { equipotentialLevels } from "./efield.ts";

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
});
