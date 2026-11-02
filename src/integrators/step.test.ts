import { describe, expect, it } from "vitest";
import { harmonicEnergy, harmonicExact, harmonicSystem } from "../physics/harmonic.ts";
import { PhaseState } from "./types.ts";
import { Scratch } from "./scratch.ts";
import { STEPPERS, advance, rk45FixedStep, velocityVerlet } from "./step.ts";
import type { MethodId, Stepper, System } from "./types.ts";

function integrate(
  stepper: Stepper,
  sys: System,
  q0: number[],
  v0: number[],
  tEnd: number,
  dt: number,
  tol?: number,
): PhaseState {
  const state = new PhaseState(sys.nq);
  state.set(q0, v0, 0);
  const scratch = new Scratch();
  scratch.ensure(sys.nq);
  const r = advance(stepper, sys, state, tEnd, dt, scratch, tol);
  expect(r.ok).toBe(true);
  return state;
}

function shoError(stepper: Stepper, dt: number, tEnd = 1.7): number {
  const sys = harmonicSystem(1);
  const state = integrate(stepper, sys, [1], [0], tEnd, dt);
  const exact = harmonicExact(state.t, 1, 0, 1);
  return Math.hypot(state.q[0] - exact.q, state.v[0] - exact.v);
}

function observedOrder(coarse: number, fine: number, ratio = 2): number {
  return Math.log(coarse / fine) / Math.log(ratio);
}

describe("integrator convergence on the harmonic oscillator", () => {
  it("explicit Euler is first order", () => {
    const e1 = shoError(STEPPERS.euler, 0.05);
    const e2 = shoError(STEPPERS.euler, 0.025);
    const p = observedOrder(e1, e2);
    expect(p).toBeGreaterThan(0.7);
    expect(p).toBeLessThan(1.4);
  });

  it("symplectic Euler is first order", () => {
    const e1 = shoError(STEPPERS["symplectic-euler"], 0.05);
    const e2 = shoError(STEPPERS["symplectic-euler"], 0.025);
    const p = observedOrder(e1, e2);
    expect(p).toBeGreaterThan(0.7);
    expect(p).toBeLessThan(1.4);
  });

  it("velocity Verlet is second order", () => {
    const e1 = shoError(STEPPERS.verlet, 0.05);
    const e2 = shoError(STEPPERS.verlet, 0.025);
    const p = observedOrder(e1, e2);
    expect(p).toBeGreaterThan(1.7);
    expect(p).toBeLessThan(2.4);
  });

  it("RK4 is fourth order", () => {
    const e1 = shoError(STEPPERS.rk4, 0.1);
    const e2 = shoError(STEPPERS.rk4, 0.05);
    const p = observedOrder(e1, e2);
    expect(p).toBeGreaterThan(3.5);
    expect(p).toBeLessThan(4.6);
    expect(e2).toBeLessThan(1e-5);
  });

  it("fixed-step Dormand–Prince is fifth order", () => {
    const sys = harmonicSystem(1);
    const tEnd = 2 * Math.PI;
    const err = (n: number) => {
      const dt = tEnd / n;
      const state = new PhaseState(1);
      state.set([1], [0], 0);
      const scratch = new Scratch();
      scratch.ensure(1);
      for (let i = 0; i < n; i++) rk45FixedStep(sys, state, dt, scratch);
      const exact = harmonicExact(tEnd, 1, 0, 1);
      return Math.hypot(state.q[0] - exact.q, state.v[0] - exact.v);
    };
    const e1 = err(20);
    const e2 = err(40);
    const p = observedOrder(e1, e2);
    expect(p).toBeGreaterThan(4.7);
    expect(p).toBeLessThan(5.4);
  });

  it("adaptive RK45 meets a tight tolerance over one period", () => {
    const sys = harmonicSystem(1);
    const state = new PhaseState(1);
    state.set([1], [0], 0);
    const scratch = new Scratch();
    const r = advance(STEPPERS.rk45, sys, state, 2 * Math.PI, 0.5, scratch, 1e-10);
    expect(r.ok).toBe(true);
    const exact = harmonicExact(state.t, 1, 0, 1);
    expect(Math.abs(state.q[0] - exact.q)).toBeLessThan(1e-7);
    expect(Math.abs(state.v[0] - exact.v)).toBeLessThan(1e-7);
  });
});

describe("energy behaviour on the harmonic oscillator", () => {
  const sys = harmonicSystem(1);
  const e0 = 0.5;

  function energyTrace(id: MethodId, dt: number, tEnd: number, tol?: number) {
    const state = new PhaseState(1);
    state.set([1], [0], 0);
    const scratch = new Scratch();
    scratch.ensure(1);
    const stepper = STEPPERS[id];
    let maxRel = 0;
    let eFinal = e0;
    const n = Math.ceil(tEnd / dt);
    for (let i = 0; i < n; i++) {
      stepper.step(sys, state, dt, scratch, tol);
      eFinal = harmonicEnergy(state.q, state.v, 1);
      maxRel = Math.max(maxRel, Math.abs(eFinal - e0) / e0);
    }
    return { eFinal, maxRel, t: state.t };
  }

  it("explicit Euler pumps energy", () => {
    const { eFinal, maxRel } = energyTrace("euler", 0.05, 40);
    expect(eFinal).toBeGreaterThan(e0 * 1.2);
    expect(maxRel).toBeGreaterThan(0.2);
  });

  it("symplectic Euler keeps a bounded oscillatory energy error", () => {
    const { eFinal, maxRel } = energyTrace("symplectic-euler", 0.05, 80);
    expect(maxRel).toBeLessThan(0.08);
    expect(eFinal).toBeGreaterThan(e0 * 0.9);
    expect(eFinal).toBeLessThan(e0 * 1.1);
  });

  it("velocity Verlet nearly conserves energy over many periods", () => {
    const { maxRel } = energyTrace("verlet", 0.02, 100);
    expect(maxRel).toBeLessThan(5e-4);
  });

  it("RK4 has very small energy error on moderate intervals", () => {
    const { maxRel } = energyTrace("rk4", 0.02, 40);
    expect(maxRel).toBeLessThan(1e-6);
  });

  it("adaptive RK45 conserves SHO energy to the requested tolerance", () => {
    const { maxRel } = energyTrace("rk45", 0.2, 20, 1e-10);
    expect(maxRel).toBeLessThan(1e-7);
  });
});

describe("adaptive RK45 on stiff vs non-stiff oscillators", () => {
  it("takes more evaluations when ω is large", () => {
    const soft = harmonicSystem(1);
    const stiff = harmonicSystem(80);
    const scratch = new Scratch();
    const a = new PhaseState(1);
    const b = new PhaseState(1);
    a.set([1], [0], 0);
    b.set([1], [0], 0);
    const ra = advance(STEPPERS.rk45, soft, a, 1, 1, scratch, 1e-7);
    scratch.resetAdaptive();
    const rb = advance(STEPPERS.rk45, stiff, b, 1, 1, scratch, 1e-7);
    expect(rb.evals).toBeGreaterThan(ra.evals * 4);
    const exactB = harmonicExact(b.t, 1, 0, 80);
    expect(Math.abs(b.q[0] - exactB.q)).toBeLessThan(1e-4);
  });
});

describe("velocity-dependent damping", () => {
  const gamma = 0.3;
  const damped: System = {
    nq: 1,
    accel(_t, q, v, out) {
      out[0] = -q[0] - gamma * v[0];
    },
  };

  function exact(t: number): { q: number; v: number } {
    const g = gamma / 2;
    const w = Math.sqrt(1 - g * g);
    const A = 1;
    const B = g / w;
    const e = Math.exp(-g * t);
    const q = e * (A * Math.cos(w * t) + B * Math.sin(w * t));
    const v = -g * q + e * (-A * w * Math.sin(w * t) + B * w * Math.cos(w * t));
    return { q, v };
  }

  function err(stepper: Stepper, dt: number, tEnd = 1.7): number {
    const state = integrate(stepper, damped, [1], [0], tEnd, dt);
    const e = exact(state.t);
    return Math.hypot(state.q[0] - e.q, state.v[0] - e.v);
  }

  it("drops Verlet to first order when a depends on v", () => {
    const p = observedOrder(err(STEPPERS.verlet, 0.05), err(STEPPERS.verlet, 0.025));
    expect(p).toBeGreaterThan(0.7);
    expect(p).toBeLessThan(1.4);
  });

  it("keeps RK4 fourth order with linear damping", () => {
    const p = observedOrder(err(STEPPERS.rk4, 0.1), err(STEPPERS.rk4, 0.05));
    expect(p).toBeGreaterThan(3.5);
    expect(p).toBeLessThan(4.6);
  });
});

describe("steppers do not allocate in the hot path", () => {
  function countFloat64Allocs(fn: () => void): number {
    const Orig = globalThis.Float64Array;
    let n = 0;
    globalThis.Float64Array = new Proxy(Orig, {
      construct(target, args) {
        n += 1;
        return Reflect.construct(target, args);
      },
    });
    try {
      fn();
    } finally {
      globalThis.Float64Array = Orig;
    }
    return n;
  }

  it("does not construct Float64Array during Verlet or RK4 steps", () => {
    const sys = harmonicSystem(1);
    const state = new PhaseState(1);
    state.set([1], [0], 0);
    const scratch = new Scratch();
    scratch.ensure(1);
    const y0 = scratch.ys[0];
    const a0 = scratch.as[0];
    const extra = countFloat64Allocs(() => {
      for (let i = 0; i < 2000; i++) velocityVerlet.step(sys, state, 0.01, scratch);
      for (let i = 0; i < 500; i++) STEPPERS.rk4.step(sys, state, 0.01, scratch);
    });
    expect(scratch.ys[0]).toBe(y0);
    expect(scratch.as[0]).toBe(a0);
    expect(extra).toBe(0);
  });
});
