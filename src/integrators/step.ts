import { axpy, clamp, combine } from "../core/math.ts";
import { writeDeriv, type Scratch } from "./scratch.ts";
import type { MethodId, MethodInfo, PhaseState, Stepper, StepResult, System } from "./types.ts";

const OK: Pick<StepResult, "ok"> = { ok: true };

function evals(n: number, hNext: number): StepResult {
  return { evals: n, hNext, ...OK };
}

function packedDeriv(
  sys: System,
  t: number,
  y: Float64Array,
  scratch: Scratch,
  ydot: Float64Array,
): void {
  const nq = sys.nq;
  const q = scratch.qWork;
  const v = scratch.vWork;
  for (let i = 0; i < nq; i++) {
    q[i] = y[i];
    v[i] = y[nq + i];
  }
  writeDeriv(sys, t, q, v, ydot, scratch.as[0]);
}

export const EULER_INFO: MethodInfo = {
  id: "euler",
  name: "Explicit Euler",
  shortName: "Euler",
  order: 1,
  symplectic: false,
  adaptive: false,
  description:
    "Forward Euler: q ← q + v Δt, v ← v + a(q) Δt. First-order, not symplectic; energy typically grows on oscillatory problems.",
};

export const euler: Stepper = {
  info: EULER_INFO,
  step(sys, state, dt, scratch) {
    scratch.ensure(sys.nq);
    const { q, v } = state;
    const a = scratch.as[0];
    sys.accel(state.t, q, v, a);
    const nq = sys.nq;
    for (let i = 0; i < nq; i++) q[i] += v[i] * dt;
    for (let i = 0; i < nq; i++) v[i] += a[i] * dt;
    state.t += dt;
    return evals(1, dt);
  },
};

export const SYMPLECTIC_EULER_INFO: MethodInfo = {
  id: "symplectic-euler",
  name: "Semi-implicit (symplectic) Euler",
  shortName: "Symp. Euler",
  order: 1,
  symplectic: true,
  adaptive: false,
  description:
    "Kick then drift: v ← v + a(q) Δt, q ← q + v Δt. First-order but symplectic; energy error is bounded and oscillatory on Hamiltonian problems.",
};

export const symplecticEuler: Stepper = {
  info: SYMPLECTIC_EULER_INFO,
  step(sys, state, dt, scratch) {
    scratch.ensure(sys.nq);
    const { q, v } = state;
    const a = scratch.as[0];
    sys.accel(state.t, q, v, a);
    const nq = sys.nq;
    for (let i = 0; i < nq; i++) v[i] += a[i] * dt;
    for (let i = 0; i < nq; i++) q[i] += v[i] * dt;
    state.t += dt;
    return evals(1, dt);
  },
};

export const VERLET_INFO: MethodInfo = {
  id: "verlet",
  name: "Velocity Verlet / leapfrog",
  shortName: "Verlet",
  order: 2,
  symplectic: true,
  adaptive: false,
  description:
    "Velocity Verlet (kick–drift–kick). Second-order, symplectic for a = a(q); excellent long-term energy behaviour on conservative systems.",
};

export const velocityVerlet: Stepper = {
  info: VERLET_INFO,
  step(sys, state, dt, scratch) {
    scratch.ensure(sys.nq);
    const { q, v } = state;
    const a0 = scratch.as[0];
    const a1 = scratch.as[1];
    const nq = sys.nq;
    const dt2 = dt * dt;
    sys.accel(state.t, q, v, a0);
    for (let i = 0; i < nq; i++) {
      q[i] += v[i] * dt + 0.5 * a0[i] * dt2;
      v[i] += 0.5 * a0[i] * dt;
    }
    sys.accel(state.t + dt, q, v, a1);
    for (let i = 0; i < nq; i++) v[i] += 0.5 * a1[i] * dt;
    state.t += dt;
    return evals(2, dt);
  },
};

export const RK4_INFO: MethodInfo = {
  id: "rk4",
  name: "Classical Runge–Kutta (RK4)",
  shortName: "RK4",
  order: 4,
  symplectic: false,
  adaptive: false,
  description:
    "The classical 4th-order Runge–Kutta method on the first-order form (q̇, v̇) = (v, a). Accurate, but not symplectic: energy drifts secularly over long times.",
};

export const rk4: Stepper = {
  info: RK4_INFO,
  step(sys, state, dt, scratch) {
    scratch.ensure(sys.nq);
    const y = state.y;
    const k1 = scratch.ydots[0];
    const k2 = scratch.ydots[1];
    const k3 = scratch.ydots[2];
    const k4 = scratch.ydots[3];
    const ytmp = scratch.ys[0];
    packedDeriv(sys, state.t, y, scratch, k1);
    axpy(ytmp, y, k1, dt * 0.5);
    packedDeriv(sys, state.t + dt * 0.5, ytmp, scratch, k2);
    axpy(ytmp, y, k2, dt * 0.5);
    packedDeriv(sys, state.t + dt * 0.5, ytmp, scratch, k3);
    axpy(ytmp, y, k3, dt);
    packedDeriv(sys, state.t + dt, ytmp, scratch, k4);
    const n = y.length;
    const s = dt / 6;
    for (let i = 0; i < n; i++) {
      y[i] += s * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    state.t += dt;
    return evals(4, dt);
  },
};

/**
 * Dormand–Prince 5(4) coefficients (DOPRI5).
 * Hairer, Nørsett & Wanner, Solving Ordinary Differential Equations I.
 */
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1] as const;

const A1 = 1 / 5;
const A2 = [3 / 40, 9 / 40] as const;
const A3 = [44 / 45, -56 / 15, 32 / 9] as const;
const A4 = [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729] as const;
const A5 = [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656] as const;
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0] as const;
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40] as const;

export const RK45_INFO: MethodInfo = {
  id: "rk45",
  name: "Adaptive Dormand–Prince RK5(4)",
  shortName: "RK45",
  order: 5,
  symplectic: false,
  adaptive: true,
  description:
    "Embedded Runge–Kutta of orders 5 and 4 (Dormand–Prince). Step size adapts to a local error tolerance. Not symplectic.",
};

const RK45_MAX_SUBSTEPS = 200_000;
const RK45_MIN_H = 1e-16;

function dopri5Attempt(
  sys: System,
  t: number,
  y: Float64Array,
  h: number,
  scratch: Scratch,
  ks: Float64Array[],
  ytmp: Float64Array,
  y5: Float64Array,
  y4: Float64Array,
): void {
  packedDeriv(sys, t, y, scratch, ks[0]);
  axpy(ytmp, y, ks[0], h * A1);
  packedDeriv(sys, t + C[1] * h, ytmp, scratch, ks[1]);
  combine(ytmp, y, [ks[0], ks[1]], A2, h);
  packedDeriv(sys, t + C[2] * h, ytmp, scratch, ks[2]);
  combine(ytmp, y, [ks[0], ks[1], ks[2]], A3, h);
  packedDeriv(sys, t + C[3] * h, ytmp, scratch, ks[3]);
  combine(ytmp, y, [ks[0], ks[1], ks[2], ks[3]], A4, h);
  packedDeriv(sys, t + C[4] * h, ytmp, scratch, ks[4]);
  combine(ytmp, y, [ks[0], ks[1], ks[2], ks[3], ks[4]], A5, h);
  packedDeriv(sys, t + C[5] * h, ytmp, scratch, ks[5]);
  combine(ytmp, y, ks, B5, h);
  y5.set(ytmp);
  packedDeriv(sys, t + h, y5, scratch, ks[6]);
  combine(y4, y, ks, B4, h);
}

function scaledError(y: Float64Array, y5: Float64Array, y4: Float64Array, tol: number): number {
  const n = y.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const sc = tol + tol * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
    const d = (y5[i] - y4[i]) / sc;
    acc += d * d;
  }
  return Math.sqrt(acc / n);
}

function stepFactor(err: number): number {
  if (!(err > 0) || !Number.isFinite(err)) return 5;
  const fac = 0.9 * err ** -0.2;
  return clamp(fac, 0.2, 5);
}

/**
 * Take a single fixed-size Dormand–Prince step (5th-order solution).
 * Used for convergence tests; production code uses the adaptive stepper.
 */
export function rk45FixedStep(
  sys: System,
  state: PhaseState,
  dt: number,
  scratch: Scratch,
): StepResult {
  scratch.ensure(sys.nq);
  const ks = scratch.ydots;
  const ytmp = scratch.ys[0];
  const y5 = scratch.ys[1];
  const y4 = scratch.ys[2];
  dopri5Attempt(sys, state.t, state.y, dt, scratch, ks, ytmp, y5, y4);
  state.y.set(y5);
  state.t += dt;
  return evals(7, dt);
}

export const rk45: Stepper = {
  info: RK45_INFO,
  step(sys, state, dt, scratch, tol = scratch.rk45Tol) {
    scratch.ensure(sys.nq);
    const y = state.y;
    const ks = scratch.ydots;
    const ytmp = scratch.ys[0];
    const y5 = scratch.ys[1];
    const y4 = scratch.ys[2];
    const tEnd = state.t + dt;
    let t = state.t;
    let h = scratch.rk45h > 0 ? Math.min(scratch.rk45h, dt) : dt;
    let nEvals = 0;
    let sub = 0;
    const absTol = Math.max(tol, 1e-15);

    while (t < tEnd) {
      if (++sub > RK45_MAX_SUBSTEPS) {
        state.t = t;
        scratch.rk45h = h;
        return { evals: nEvals, hNext: h, ok: false };
      }
      const remaining = tEnd - t;
      if (h > remaining) h = remaining;
      if (h < RK45_MIN_H) {
        t = tEnd;
        break;
      }
      dopri5Attempt(sys, t, y, h, scratch, ks, ytmp, y5, y4);
      nEvals += 7;
      const err = scaledError(y, y5, y4, absTol);
      const fac = stepFactor(err);
      if (err <= 1 || h <= RK45_MIN_H * 2) {
        y.set(y5);
        t += h;
        h = Math.max(h * fac, RK45_MIN_H);
      } else {
        h = Math.max(h * fac, RK45_MIN_H);
      }
    }
    state.t = t;
    scratch.rk45h = h;
    return evals(nEvals, h);
  },
};

export const STEPPERS: Record<MethodId, Stepper> = {
  euler,
  "symplectic-euler": symplecticEuler,
  verlet: velocityVerlet,
  rk4,
  rk45,
};

export const METHOD_LIST: readonly MethodInfo[] = [
  EULER_INFO,
  SYMPLECTIC_EULER_INFO,
  VERLET_INFO,
  RK4_INFO,
  RK45_INFO,
];

/** Integrate a duration with a fixed outer step (RK45 substeps internally). */
export function advance(
  stepper: Stepper,
  sys: System,
  state: PhaseState,
  duration: number,
  dt: number,
  scratch: Scratch,
  tol?: number,
): StepResult {
  scratch.ensure(sys.nq);
  let evalsTotal = 0;
  const tTarget = state.t + duration;
  let ok = true;
  let hNext = dt;
  const endEps = 1e-14 * (1 + Math.abs(tTarget));
  while (state.t < tTarget - endEps) {
    const h = Math.min(dt, tTarget - state.t);
    const r = stepper.step(sys, state, h, scratch, tol);
    evalsTotal += r.evals;
    hNext = r.hNext;
    if (!r.ok) {
      ok = false;
      break;
    }
  }
  return { evals: evalsTotal, hNext, ok };
}
