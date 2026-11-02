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
  const k =
    0.5 * p.m1 * v[0] * v[0] +
    0.5 * p.m2 * v[1] * v[1] +
    0.5 * p.kLeft * q[0] * q[0] +
    0.5 * p.kRight * q[1] * q[1] +
    0.5 * p.kCoupling * (q[0] - q[1]) * (q[0] - q[1]);
  return k;
}

/**
 * Normal frequencies for equal masses m = m1 = m2 and equal wall springs k = kLeft = kRight.
 * Symmetric: ω₋ = √(k/m). Antisymmetric: ω₊ = √((k + 2 kc)/m).
 */
export function coupledNormalFrequencies(p: CoupledParams): { slow: number; fast: number } {
  const m = p.m1;
  const k = p.kLeft;
  const kc = p.kCoupling;
  return {
    slow: Math.sqrt(k / m),
    fast: Math.sqrt((k + 2 * kc) / m),
  };
}

export function coupledSymmetricMode(_p: CoupledParams, amplitude: number, state: PhaseState): void {
  state.set([amplitude, amplitude], [0, 0], 0);
}

export function coupledAntisymmetricMode(
  _p: CoupledParams,
  amplitude: number,
  state: PhaseState,
): void {
  state.set([amplitude, -amplitude], [0, 0], 0);
}
