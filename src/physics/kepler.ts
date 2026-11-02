import { hypot2, invR3 } from "../core/math.ts";
import type { PhaseState, System } from "../integrators/types.ts";

export interface KeplerParams {
  /** Newton's constant. Default 1 in simulation units. */
  G: number;
  m1: number;
  m2: number;
  /** Semi-major axis of the relative orbit. */
  a: number;
  /** Eccentricity, 0 ≤ e < 1. */
  e: number;
  /** Plummer softening² to keep forces finite at collision. */
  softening2: number;
}

export const KEPLER_DEFAULTS: KeplerParams = {
  G: 1,
  m1: 1,
  m2: 1,
  a: 1,
  e: 0.6,
  softening2: 1e-12,
};

/** Two-body gravity in 2D. Packed q = [x1, y1, x2, y2]. */
export function keplerSystem(p: KeplerParams): System {
  const { G, m1, m2, softening2 } = p;
  return {
    nq: 4,
    accel(_t, q, _v, out) {
      const dx = q[2] - q[0];
      const dy = q[3] - q[1];
      const ir3 = invR3(hypot2(dx, dy), softening2);
      const f = G * ir3;
      const ax = f * dx;
      const ay = f * dy;
      out[0] = m2 * ax;
      out[1] = m2 * ay;
      out[2] = -m1 * ax;
      out[3] = -m1 * ay;
    },
  };
}

export function keplerPeriod(p: KeplerParams): number {
  const mu = p.G * (p.m1 + p.m2);
  return 2 * Math.PI * Math.sqrt((p.a * p.a * p.a) / mu);
}

/** Relative vis-viva speed at periapsis. */
export function keplerPeriapsisSpeed(p: KeplerParams): number {
  const mu = p.G * (p.m1 + p.m2);
  return Math.sqrt((mu * (1 + p.e)) / (p.a * (1 - p.e)));
}

/**
 * Place both masses on the x-axis at periapsis, CM at the origin,
 * with a purely tangential relative velocity.
 */
export function keplerInitialState(p: KeplerParams, state: PhaseState): void {
  const r = p.a * (1 - p.e);
  const vRel = keplerPeriapsisSpeed(p);
  const m1 = p.m1;
  const m2 = p.m2;
  const mtot = m1 + m2;
  const x1 = (-m2 / mtot) * r;
  const x2 = (m1 / mtot) * r;
  const v1y = (-m2 / mtot) * vRel;
  const v2y = (m1 / mtot) * vRel;
  state.set([x1, 0, x2, 0], [0, v1y, 0, v2y], 0);
}

export function keplerEnergy(p: KeplerParams, q: ArrayLike<number>, v: ArrayLike<number>): number {
  const r = Math.hypot(q[2] - q[0], q[3] - q[1]);
  const k =
    0.5 * p.m1 * (v[0] * v[0] + v[1] * v[1]) + 0.5 * p.m2 * (v[2] * v[2] + v[3] * v[3]);
  return k - (p.G * p.m1 * p.m2) / r;
}

/** Angular momentum of the relative orbit, L = μ (r × v). */
export function keplerAngularMomentum(
  p: KeplerParams,
  q: ArrayLike<number>,
  v: ArrayLike<number>,
): number {
  const rx = q[2] - q[0];
  const ry = q[3] - q[1];
  const vx = v[2] - v[0];
  const vy = v[3] - v[1];
  const mu = (p.m1 * p.m2) / (p.m1 + p.m2);
  return mu * (rx * vy - ry * vx);
}

/** Semi-major axis implied by vis-viva / energy: a = −G m1 m2 / (2E). */
export function keplerSemiMajorFromEnergy(p: KeplerParams, energy: number): number {
  return -(p.G * p.m1 * p.m2) / (2 * energy);
}
