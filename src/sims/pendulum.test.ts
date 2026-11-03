import { describe, expect, it } from "vitest";
import type { Palette } from "../core/canvas.ts";
import { PendulumSim } from "./pendulum.ts";
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

const light: Palette = { ...pal, brass: "#960", sky: "#258" };

function frame(): SimFrame {
  return { palette: pal, reducedMotion: true, method: "rk4", dt: 0.01 };
}

function tOf(sim: PendulumSim): number {
  const m = sim.readout().match(/t = ([-\d.]+)/);
  return Number(m?.[1] ?? NaN);
}

describe("pendulum view updates do not reset physics", () => {
  it("keeps t and energy when only the plot dropdown changes", () => {
    const sim = new PendulumSim();
    sim.reset({ L: 1, gamma: 0, A: 0, w: 0.667, th0: 1.2, linear: false, plot: "phase" }, frame());
    sim.advance(80, 0.01);
    const t = tOf(sim);
    const E = sim.energy();
    expect(t).toBeGreaterThan(0.5);
    sim.apply({ L: 1, gamma: 0, A: 0, w: 0.667, th0: 1.2, linear: false, plot: "energy" }, frame());
    expect(tOf(sim)).toBeCloseTo(t, 8);
    expect(sim.energy()).toBeCloseTo(E, 12);
    expect(sim.plotCaption()).toMatch(/energy/i);
  });

  it("recolors in place on a palette change", () => {
    const sim = new PendulumSim();
    sim.reset({ L: 1, gamma: 0, A: 0, plot: "phase" }, frame());
    sim.advance(10, 0.01);
    const t = tOf(sim);
    sim.apply({ L: 1, gamma: 0, A: 0, plot: "phase" }, { ...frame(), palette: light });
    expect(tOf(sim)).toBeCloseTo(t, 8);
  });
});
