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

/**
 * Distance from the CM to the farther mass at apoapsis — the bounding
 * radius of the two-body system in the CM frame.
 */
export function keplerApoapsisReach(p: KeplerParams): number {
  const mtot = p.m1 + p.m2;
  if (!(mtot > 0)) return p.a * (1 + p.e);
  return (Math.max(p.m1, p.m2) / mtot) * p.a * (1 + p.e);
}

/** Axis-aligned CM-frame box of both mass-1 and mass-2 ellipses. */
export function keplerOrbitBox(p: KeplerParams): { cx: number; cy: number; hw: number; hh: number } {
  const mtot = p.m1 + p.m2;
  if (!(mtot > 0)) {
    const reach = p.a * (1 + p.e);
    return { cx: 0, cy: 0, hw: reach, hh: reach };
  }
  const rP = p.a * (1 - p.e);
  const rA = p.a * (1 + p.e);
  const x1p = (-p.m2 / mtot) * rP;
  const x1a = (p.m2 / mtot) * rA;
  const x2p = (p.m1 / mtot) * rP;
  const x2a = (-p.m1 / mtot) * rA;
  const xmin = Math.min(x1p, x1a, x2p, x2a);
  const xmax = Math.max(x1p, x1a, x2p, x2a);
  const bRel = p.a * Math.sqrt(Math.max(0, 1 - p.e * p.e));
  const hh = Math.max((p.m1 / mtot) * bRel, (p.m2 / mtot) * bRel);
  return { cx: (xmin + xmax) / 2, cy: 0, hw: (xmax - xmin) / 2, hh };
}

/** Relative separation at true anomaly ν, with periapsis at ν = 0. */
export function keplerRadiusAtTrueAnomaly(p: KeplerParams, nu: number): number {
  return (p.a * (1 - p.e * p.e)) / (1 + p.e * Math.cos(nu));
}

const INNER_STEPS_MAX = 24;
/** Inner step ≲ local dynamical time / this, so periapsis stays resolved. */
const INNER_TAU_DIVISOR = 16;

/**
 * How many equal inner steps to take for one outer `dt`, given the current
 * separation. Near periapsis of a high-e ellipse the local time
 * τ = √(r³/μ) collapses; a fixed 0.008 step is then a large fraction of τ.
 * Equal inner steps keep Verlet symplectic on each substep. Apoapsis and
 * low-e orbits return 1.
 */
export function keplerInnerSteps(p: KeplerParams, r: number, dt: number): number {
  if (!(dt > 0)) return 1;
  const mu = p.G * (p.m1 + p.m2);
  if (!(mu > 0)) return 1;
  const sep = Math.max(r, 1e-8);
  const tau = Math.sqrt((sep * sep * sep) / mu);
  const h = tau / INNER_TAU_DIVISOR;
  const n = Math.ceil(dt / Math.max(h, 1e-12));
  if (n <= 1) return 1;
  return n > INNER_STEPS_MAX ? INNER_STEPS_MAX : n;
}
