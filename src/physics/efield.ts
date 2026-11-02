import { hypot2, invR3, SOFT_FLOOR } from "../core/math.ts";
import type { System } from "../integrators/types.ts";

export interface PointCharge {
  x: number;
  y: number;
  q: number;
}

export interface EFieldParams {
  /** Coulomb constant. Default 1. */
  k: number;
  softening2: number;
  testCharge: number;
  testMass: number;
  charges: PointCharge[];
}

export const EFIELD_DEFAULTS: Omit<EFieldParams, "charges"> = {
  k: 1,
  softening2: 0.0025,
  testCharge: 1,
  testMass: 1,
};

/**
 * Electric field and potential at (x, y). Writes into `out` to avoid allocation.
 * E = k Σ qᵢ (r − rᵢ) / |r − rᵢ|³,  V = k Σ qᵢ / |r − rᵢ|.
 */
export function fieldAt(
  x: number,
  y: number,
  charges: readonly PointCharge[],
  k: number,
  softening2: number,
  out: { ex: number; ey: number; v: number },
): void {
  let ex = 0;
  let ey = 0;
  let v = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = hypot2(dx, dy);
    const ir3 = invR3(r2, softening2);
    const ir = 1 / Math.sqrt(Math.max(r2 + Math.max(softening2, 0), SOFT_FLOOR));
    const kq = k * c.q;
    ex += kq * dx * ir3;
    ey += kq * dy * ir3;
    v += kq * ir;
  }
  out.ex = ex;
  out.ey = ey;
  out.v = v;
}

/**
 * Test-particle motion in a static Coulomb field of fixed point charges.
 * q = [x, y]. The charge list is closed over; mutate it in place to drag sources.
 */
export function efieldParticleSystem(p: EFieldParams): System {
  const tmp = { ex: 0, ey: 0, v: 0 };
  return {
    nq: 2,
    accel(_t, q, _v, out) {
      fieldAt(q[0], q[1], p.charges, p.k, p.softening2, tmp);
      const qom = p.testCharge / p.testMass;
      out[0] = qom * tmp.ex;
      out[1] = qom * tmp.ey;
    },
  };
}

export function efieldParticleEnergy(p: EFieldParams, q: ArrayLike<number>, v: ArrayLike<number>): number {
  const tmp = { ex: 0, ey: 0, v: 0 };
  fieldAt(q[0], q[1], p.charges, p.k, p.softening2, tmp);
  return 0.5 * p.testMass * (v[0] * v[0] + v[1] * v[1]) + p.testCharge * tmp.v;
}
