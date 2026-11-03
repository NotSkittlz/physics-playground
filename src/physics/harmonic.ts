import type { System } from "../integrators/types.ts";

/** Simple harmonic oscillator: q̈ = −ω² q. */
export function harmonicSystem(omega = 1): System {
  const w2 = omega * omega;
  return {
    nq: 1,
    accel(_t, q, _v, out) {
      out[0] = -w2 * q[0];
    },
  };
}

export function harmonicEnergy(q: ArrayLike<number>, v: ArrayLike<number>, omega = 1): number {
  return 0.5 * v[0] * v[0] + 0.5 * omega * omega * q[0] * q[0];
}

export function harmonicExact(t: number, q0: number, v0: number, omega = 1): { q: number; v: number } {
  const c = Math.cos(omega * t);
  const s = Math.sin(omega * t);
  return {
    q: q0 * c + (v0 / omega) * s,
    v: -q0 * omega * s + v0 * c,
  };
}
