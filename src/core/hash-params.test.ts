import { describe, expect, it } from "vitest";
import { clampDt, clampMethod, clampSimParams, clampSpeed } from "./hash-params.ts";
import { SIM_METAS } from "../sims/registry.ts";

function meta(id: string) {
  const m = SIM_METAS.find((s) => s.id === id);
  if (!m) throw new Error(id);
  return m;
}

describe("hash param clamping", () => {
  it("clamps Kepler e=1.5 onto the slider and keeps e < 1", () => {
    const p = clampSimParams({ e: "1.5", cmp: "0" }, meta("kepler"));
    expect(p.e).toBe(0.92);
    expect(p.e as number).toBeLessThan(1);
    expect(p.cmp).toBe(false);
  });

  it("clamps pendulum L=0 to the slider minimum", () => {
    const p = clampSimParams({ L: "0" }, meta("pendulum"));
    expect(p.L).toBe(0.4);
  });

  it("clamps Kepler dt=5 to the transport slider max", () => {
    expect(clampDt("5", 0.008)).toBe(0.04);
  });

  it("clamps e-field soft=0 to the slider minimum", () => {
    const p = clampSimParams({ soft: "0" }, meta("efield"));
    expect(p.soft).toBe(0.02);
  });

  it("rejects non-finite numbers in favour of the control default", () => {
    const p = clampSimParams({ m1: "nope", L: "NaN" }, meta("pendulum"));
    expect(p.L).toBe(1);
  });

  it("falls back to the sim default integrator when int is unknown", () => {
    expect(clampMethod("not-a-method", "rk4")).toBe("rk4");
    expect(clampMethod("verlet", "rk4")).toBe("verlet");
  });

  it("clamps speed to the transport slider", () => {
    expect(clampSpeed("99", 1)).toBe(4);
    expect(clampSpeed("-1", 1)).toBe(0.1);
  });
});
