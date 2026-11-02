import { describe, expect, it } from "vitest";
import type { Palette } from "../core/canvas.ts";
import { KeplerSim } from "./kepler.ts";
import type { SimFrame } from "./types.ts";

const pal: Palette = {
  bg: "#000",
  elev: "#111",
  ink: "#fff",
  muted: "#aaa",
  line: "#333",
  brass: "#c80",
  sky: "#8bf",
  rose: "#e88",
  sage: "#8c8",
  paper: "#eee",
};

function frame(method: SimFrame["method"] = "verlet"): SimFrame {
  return { palette: pal, reducedMotion: true, method, dt: 0.02 };
}

describe("Kepler compare readout", () => {
  it("reports Verlet and Euler ΔE/E, not a single Euler figure", () => {
    const sim = new KeplerSim();
    sim.reset({ e: 0.6, m1: 1, m2: 1, a: 1, cmp: true }, frame());
    sim.advance(800, 0.02);
    const text = sim.readout();
    expect(text).toMatch(/Verlet ΔE\/E = /);
    expect(text).toMatch(/Euler ΔE\/E = /);
    expect(text).not.toMatch(/ΔL\/L/);
    const verlet = Number(text.match(/Verlet ΔE\/E = ([^\s]+)/)?.[1]);
    const euler = Number(text.match(/Euler ΔE\/E = ([^\s]+)/)?.[1]);
    expect(Number.isFinite(verlet)).toBe(true);
    expect(Number.isFinite(euler)).toBe(true);
    expect(Math.abs(euler)).toBeGreaterThan(Math.abs(verlet) * 20);
  });

  it("reports the selected method when not comparing", () => {
    const sim = new KeplerSim();
    sim.reset({ e: 0.6, m1: 1, m2: 1, a: 1, cmp: false }, frame("rk4"));
    sim.advance(200, 0.01);
    const text = sim.readout();
    expect(text).toMatch(/ΔE\/E = /);
    expect(text).toMatch(/ΔL\/L = /);
    expect(text).not.toMatch(/Euler ΔE/);
  });
});
