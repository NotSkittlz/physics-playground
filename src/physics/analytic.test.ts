import { describe, expect, it } from "vitest";
import { PhaseState } from "../integrators/types.ts";
import { Scratch } from "../integrators/scratch.ts";
import { STEPPERS, advance } from "../integrators/step.ts";
import {
  COUPLED_DEFAULTS,
  coupledAntisymmetricMode,
  coupledEnergy,
  coupledNormalFrequencies,
  coupledSymmetricMode,
  coupledSystem,
} from "./coupled.ts";
import {
  DOUBLE_PENDULUM_DEFAULTS,
  doublePendulumEnergy,
  doublePendulumSystem,
} from "./double-pendulum.ts";
import { EFIELD_DEFAULTS, efieldParticleEnergy, efieldParticleSystem, fieldAt } from "./efield.ts";
import {
  KEPLER_DEFAULTS,
  keplerAngularMomentum,
  keplerEnergy,
  keplerInitialState,
  keplerPeriod,
  keplerSemiMajorFromEnergy,
  keplerSystem,
} from "./kepler.ts";
import {
  pendulumEnergy,
  pendulumSmallAnglePeriod,
  pendulumSystem,
} from "./pendulum.ts";

function periodFromZeroCrossings(times: number[], values: number[]): number {
  const crossings: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] >= 0 && values[i] < 0) {
      const frac = values[i - 1] / (values[i - 1] - values[i]);
      crossings.push(times[i - 1] + frac * (times[i] - times[i - 1]));
      if (crossings.length === 2) break;
    }
  }
  if (crossings.length < 2) throw new Error("not enough zero crossings");
  return crossings[1] - crossings[0];
}

describe("Kepler two-body analytics", () => {
  const circular = { ...KEPLER_DEFAULTS, e: 0, a: 1, m1: 1, m2: 1, G: 1 };
  const ellipse = { ...KEPLER_DEFAULTS, e: 0.5, a: 1, m1: 2, m2: 1, G: 1 };

  it("matches the vis-viva semi-major axis from energy", () => {
    const sys = keplerSystem(ellipse);
    const state = new PhaseState(4);
    keplerInitialState(ellipse, state);
    const E = keplerEnergy(ellipse, state.q, state.v);
    expect(keplerSemiMajorFromEnergy(ellipse, E)).toBeCloseTo(ellipse.a, 10);
    expect(E).toBeLessThan(0);
    void sys;
  });

  it("returns to periapsis after one circular period (Verlet)", () => {
    const sys = keplerSystem(circular);
    const state = new PhaseState(4);
    keplerInitialState(circular, state);
    const q0 = Array.from(state.q);
    const T = keplerPeriod(circular);
    expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(0.5), 10);
    const scratch = new Scratch();
    const r = advance(STEPPERS.verlet, sys, state, T, 0.002, scratch);
    expect(r.ok).toBe(true);
    const dr = Math.hypot(state.q[0] - q0[0], state.q[1] - q0[1]);
    expect(dr).toBeLessThan(3e-3);
  });

  it("conserves energy and angular momentum with Verlet on an ellipse", () => {
    const sys = keplerSystem(ellipse);
    const state = new PhaseState(4);
    keplerInitialState(ellipse, state);
    const E0 = keplerEnergy(ellipse, state.q, state.v);
    const L0 = keplerAngularMomentum(ellipse, state.q, state.v);
    const scratch = new Scratch();
    advance(STEPPERS.verlet, sys, state, keplerPeriod(ellipse), 0.002, scratch);
    const E1 = keplerEnergy(ellipse, state.q, state.v);
    const L1 = keplerAngularMomentum(ellipse, state.q, state.v);
    expect(Math.abs(E1 - E0) / Math.abs(E0)).toBeLessThan(2e-4);
    expect(Math.abs(L1 - L0) / Math.abs(L0)).toBeLessThan(2e-4);
  });

  it("keeps the centre of mass at the origin", () => {
    const sys = keplerSystem(ellipse);
    const state = new PhaseState(4);
    keplerInitialState(ellipse, state);
    const scratch = new Scratch();
    advance(STEPPERS.rk4, sys, state, 1.5, 0.005, scratch);
    const m1 = ellipse.m1;
    const m2 = ellipse.m2;
    const cx = (m1 * state.q[0] + m2 * state.q[2]) / (m1 + m2);
    const cy = (m1 * state.q[1] + m2 * state.q[3]) / (m1 + m2);
    expect(Math.hypot(cx, cy)).toBeLessThan(1e-10);
  });

  it("explicit Euler spirals: radius and energy drift far more than Verlet", () => {
    const sys = keplerSystem(circular);
    const dt = 0.02;
    const T = keplerPeriod(circular);
    const run = (id: "euler" | "verlet") => {
      const state = new PhaseState(4);
      keplerInitialState(circular, state);
      const E0 = keplerEnergy(circular, state.q, state.v);
      const scratch = new Scratch();
      advance(STEPPERS[id], sys, state, T, dt, scratch);
      const r = Math.hypot(state.q[2] - state.q[0], state.q[3] - state.q[1]);
      const E = keplerEnergy(circular, state.q, state.v);
      return { r, dE: Math.abs(E - E0) };
    };
    const euler = run("euler");
    const verlet = run("verlet");
    expect(euler.dE).toBeGreaterThan(verlet.dE * 20);
    expect(Math.abs(euler.r - 1)).toBeGreaterThan(Math.abs(verlet.r - 1) * 5);
  });
});

describe("small-angle pendulum", () => {
  it("matches T = 2π √(L/g) for a tiny amplitude", () => {
    const p = { g: 9.8, L: 1, gamma: 0, driveAmp: 0, driveFreq: 0, linear: false };
    const sys = pendulumSystem(p);
    const state = new PhaseState(1);
    state.set([0.01], [0], 0);
    const scratch = new Scratch();
    const dt = 0.002;
    const times: number[] = [];
    const vals: number[] = [];
    const tEnd = pendulumSmallAnglePeriod(p) * 2.2;
    while (state.t < tEnd) {
      STEPPERS.rk4.step(sys, state, dt, scratch);
      times.push(state.t);
      vals.push(state.q[0]);
    }
    const T = periodFromZeroCrossings(times, vals);
    expect(T).toBeCloseTo(pendulumSmallAnglePeriod(p), 2);
  });

  it("linearised pendulum is exact SHO with ω = √(g/L)", () => {
    const p = { g: 4, L: 1, gamma: 0, driveAmp: 0, driveFreq: 0, linear: true };
    const sys = pendulumSystem(p);
    const state = new PhaseState(1);
    state.set([0.3], [0], 0);
    const scratch = new Scratch();
    const T = pendulumSmallAnglePeriod(p);
    advance(STEPPERS.rk4, sys, state, T, 0.002, scratch);
    expect(state.q[0]).toBeCloseTo(0.3, 3);
    expect(state.v[0]).toBeCloseTo(0, 3);
    expect(pendulumEnergy(p, 0, 0)).toBe(0);
  });
});

describe("coupled-oscillator normal modes", () => {
  const p = { ...COUPLED_DEFAULTS };
  const { slow, fast } = coupledNormalFrequencies(p);

  it("has ω₋ = √(k/m) and ω₊ = √((k + 2kc)/m) for the equal-mass chain", () => {
    expect(slow).toBeCloseTo(1, 12);
    expect(fast).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("stays on the symmetric mode at the slow frequency", () => {
    const sys = coupledSystem(p);
    const state = new PhaseState(2);
    coupledSymmetricMode(p, 0.4, state);
    const scratch = new Scratch();
    const T = (2 * Math.PI) / slow;
    const dt = 0.002;
    while (state.t < T) {
      STEPPERS.rk4.step(sys, state, Math.min(dt, T - state.t), scratch);
      expect(Math.abs(state.q[0] - state.q[1])).toBeLessThan(1e-8);
    }
    expect(state.q[0]).toBeCloseTo(0.4, 3);
    expect(state.v[0]).toBeCloseTo(0, 3);
  });

  it("stays on the antisymmetric mode at the fast frequency", () => {
    const sys = coupledSystem(p);
    const state = new PhaseState(2);
    coupledAntisymmetricMode(p, 0.4, state);
    const scratch = new Scratch();
    const T = (2 * Math.PI) / fast;
    const dt = 0.002;
    while (state.t < T) {
      STEPPERS.rk4.step(sys, state, Math.min(dt, T - state.t), scratch);
      expect(Math.abs(state.q[0] + state.q[1])).toBeLessThan(1e-8);
    }
    expect(state.q[0]).toBeCloseTo(0.4, 3);
    expect(state.q[1]).toBeCloseTo(-0.4, 3);
    expect(state.v[0]).toBeCloseTo(0, 3);
  });

  it("conserves energy with Verlet", () => {
    const sys = coupledSystem(p);
    const state = new PhaseState(2);
    state.set([0.5, 0.1], [0, 0.2], 0);
    const E0 = coupledEnergy(p, state.q, state.v);
    const scratch = new Scratch();
    advance(STEPPERS.verlet, sys, state, 40, 0.01, scratch);
    const E1 = coupledEnergy(p, state.q, state.v);
    expect(Math.abs(E1 - E0) / E0).toBeLessThan(1e-3);
  });
});

describe("double pendulum", () => {
  it("conserves energy with Verlet on a conservative trajectory", () => {
    const p = DOUBLE_PENDULUM_DEFAULTS;
    const sys = doublePendulumSystem(p);
    const state = new PhaseState(2);
    state.set([0.8, 0.4], [0, 0], 0);
    const E0 = doublePendulumEnergy(p, state.q, state.v);
    const scratch = new Scratch();
    advance(STEPPERS.verlet, sys, state, 8, 0.0005, scratch);
    const E1 = doublePendulumEnergy(p, state.q, state.v);
    expect(Math.abs(E1 - E0) / Math.abs(E0)).toBeLessThan(5e-4);
  });

  it("nearby trajectories diverge (sensitivity to initial conditions)", () => {
    const p = { ...DOUBLE_PENDULUM_DEFAULTS, g: 9.8 };
    const sys = doublePendulumSystem(p);
    const a = new PhaseState(2);
    const b = new PhaseState(2);
    a.set([2.0, 2.0], [0, 0], 0);
    b.set([2.0, 2.0 + 1e-4], [0, 0], 0);
    const scratch = new Scratch();
    const dt = 0.0005;
    const tEnd = 8;
    while (a.t < tEnd) {
      STEPPERS.rk4.step(sys, a, dt, scratch);
      STEPPERS.rk4.step(sys, b, dt, scratch);
    }
    const dtheta = Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]);
    expect(dtheta).toBeGreaterThan(0.05);
  });
});

describe("electrostatics", () => {
  it("matches Coulomb's law for a single charge", () => {
    const charges = [{ x: 0, y: 0, q: 2 }];
    const out = { ex: 0, ey: 0, v: 0 };
    fieldAt(1, 0, charges, 1, 0, out);
    expect(out.ex).toBeCloseTo(2, 10);
    expect(out.ey).toBeCloseTo(0, 10);
    expect(out.v).toBeCloseTo(2, 10);
  });

  it("superposes two charges and is odd under q → −q", () => {
    const charges = [
      { x: -1, y: 0, q: 1 },
      { x: 1, y: 0, q: -1 },
    ];
    const out = { ex: 0, ey: 0, v: 0 };
    fieldAt(0, 0, charges, 1, 0, out);
    expect(out.ex).toBeCloseTo(2, 8);
    expect(out.ey).toBeCloseTo(0, 8);
    expect(out.v).toBeCloseTo(0, 8);
    fieldAt(0, 0, charges.map((c) => ({ ...c, q: -c.q })), 1, 0, out);
    expect(out.ex).toBeCloseTo(-2, 8);
  });

  it("conserves test-particle energy in a static Coulomb field (RK4)", () => {
    const params = {
      ...EFIELD_DEFAULTS,
      charges: [
        { x: -0.6, y: 0, q: 1 },
        { x: 0.6, y: 0, q: 1 },
      ],
    };
    const sys = efieldParticleSystem(params);
    const state = new PhaseState(2);
    state.set([0, 0.7], [0.4, 0], 0);
    const E0 = efieldParticleEnergy(params, state.q, state.v);
    const scratch = new Scratch();
    advance(STEPPERS.rk4, sys, state, 4, 0.002, scratch);
    const E1 = efieldParticleEnergy(params, state.q, state.v);
    expect(Math.abs(E1 - E0) / Math.abs(E0)).toBeLessThan(2e-3);
  });
});
