import type { PhaseState, System } from "../integrators/types.ts";

export interface CoupledParams {
  m1: number;
  m2: number;
  /** Wall–mass springs. */
  kLeft: number;
  kRight: number;
  /** Coupling spring between the masses. */
  kCoupling: number;
}

export const COUPLED_DEFAULTS: CoupledParams = {
  m1: 1,
  m2: 1,
  kLeft: 1,
  kRight: 1,
  kCoupling: 1,
};

export interface NormalMode {
  /** Angular frequency ω = √λ. */
  omega: number;
  /** Shape (v1, v2) of M-normalised eigenvector, max |component| = 1. */
  v: readonly [number, number];
}

/**
 * Two masses, three springs (wall–m1–m2–wall).
 * q = [x1, x2] measured from each mass's equilibrium.
 */
export function coupledSystem(p: CoupledParams): System {
  return {
    nq: 2,
    accel(_t, q, _v, out) {
      const x1 = q[0];
      const x2 = q[1];
      const f1 = -p.kLeft * x1 - p.kCoupling * (x1 - x2);
      const f2 = -p.kRight * x2 - p.kCoupling * (x2 - x1);
      out[0] = f1 / p.m1;
      out[1] = f2 / p.m2;
    },
  };
}

export function coupledEnergy(p: CoupledParams, q: ArrayLike<number>, v: ArrayLike<number>): number {
  return (
    0.5 * p.m1 * v[0] * v[0] +
    0.5 * p.m2 * v[1] * v[1] +
    0.5 * p.kLeft * q[0] * q[0] +
    0.5 * p.kRight * q[1] * q[1] +
    0.5 * p.kCoupling * (q[0] - q[1]) * (q[0] - q[1])
  );
}

/**
 * Normal modes of the 2×2 generalized eigenproblem (K − ω² M) v = 0.
 *
 * M = diag(m1, m2),
 * K = [[kL+kc, −kc], [−kc, kR+kc]].
 *
 * For m1 = m2 and kL = kR the slow mode is symmetric (v1 = v2, ω = √(k/m))
 * and the fast mode is antisymmetric (v1 = −v2, ω = √((k+2kc)/m)).
 */
export function coupledEigenmodes(p: CoupledParams): { slow: NormalMode; fast: NormalMode } {
  const a = (p.kLeft + p.kCoupling) / p.m1;
  const b = p.kCoupling / p.m1;
  const c = p.kCoupling / p.m2;
  const d = (p.kRight + p.kCoupling) / p.m2;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = Math.max(0, tr * tr - 4 * det);
  const root = Math.sqrt(disc);
  const lambdaSlow = 0.5 * (tr - root);
  const lambdaFast = 0.5 * (tr + root);
  return {
    slow: { omega: Math.sqrt(Math.max(lambdaSlow, 0)), v: eigenvector(a, b, c, d, lambdaSlow) },
    fast: { omega: Math.sqrt(Math.max(lambdaFast, 0)), v: eigenvector(a, b, c, d, lambdaFast) },
  };
}

function eigenvector(
  a: number,
  b: number,
  c: number,
  d: number,
  lambda: number,
): readonly [number, number] {
  let v1 = 1;
  let v2: number;
  if (Math.abs(b) >= Math.abs(c) && Math.abs(b) > 1e-18) {
    v2 = (a - lambda) / b;
  } else if (Math.abs(c) > 1e-18) {
    v2 = 1;
    v1 = (d - lambda) / c;
  } else {
    v2 = Math.abs(a - lambda) <= Math.abs(d - lambda) ? 1 : 0;
  }
  const mag = Math.max(Math.abs(v1), Math.abs(v2), 1e-18);
  return [v1 / mag, v2 / mag];
}

/** Slow and fast frequencies. Equal-mass equal-k closed form is a special case. */
export function coupledNormalFrequencies(p: CoupledParams): { slow: number; fast: number } {
  const { slow, fast } = coupledEigenmodes(p);
  return { slow: slow.omega, fast: fast.omega };
}

export function coupledModeState(
  p: CoupledParams,
  which: "slow" | "fast",
  amplitude: number,
  state: PhaseState,
): void {
  const mode = coupledEigenmodes(p)[which];
  state.set([mode.v[0] * amplitude, mode.v[1] * amplitude], [0, 0], 0);
}

/** Slow eigenmode. Symmetric when m1 = m2 and kLeft = kRight. */
export function coupledSymmetricMode(p: CoupledParams, amplitude: number, state: PhaseState): void {
  coupledModeState(p, "slow", amplitude, state);
}

/** Fast eigenmode. Antisymmetric when m1 = m2 and kLeft = kRight. */
export function coupledAntisymmetricMode(
  p: CoupledParams,
  amplitude: number,
  state: PhaseState,
): void {
  coupledModeState(p, "fast", amplitude, state);
}
