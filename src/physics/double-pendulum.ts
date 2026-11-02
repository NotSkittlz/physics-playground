import type { System } from "../integrators/types.ts";

export interface DoublePendulumParams {
  g: number;
  m1: number;
  m2: number;
  l1: number;
  l2: number;
}

export const DOUBLE_PENDULUM_DEFAULTS: DoublePendulumParams = {
  g: 9.8,
  m1: 1,
  m2: 1,
  l1: 1,
  l2: 1,
};

/**
 * Planar double pendulum, angles from the downward vertical.
 * q = [θ1, θ2], v = [ω1, ω2].
 *
 * Equations match the standard form in Taylor, *Classical Mechanics*,
 * and the widely used Wikipedia reduction (equal to the Lagrangian EOM).
 */
export function doublePendulumSystem(p: DoublePendulumParams): System {
  const { g, m1, m2, l1, l2 } = p;
  return {
    nq: 2,
    accel(_t, q, v, out) {
      const th1 = q[0];
      const th2 = q[1];
      const w1 = v[0];
      const w2 = v[1];
      const delta = th1 - th2;
      const den = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
      const sD = Math.sin(delta);
      out[0] =
        (-g * (2 * m1 + m2) * Math.sin(th1) -
          m2 * g * Math.sin(th1 - 2 * th2) -
          2 * sD * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta))) /
        (l1 * den);
      out[1] =
        (2 *
          sD *
          (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(th1) + w2 * w2 * l2 * m2 * Math.cos(delta))) /
        (l2 * den);
    },
  };
}

/** Kinetic + potential, V = 0 when both bobs are at the height of the pivot. */
export function doublePendulumEnergy(
  p: DoublePendulumParams,
  q: ArrayLike<number>,
  v: ArrayLike<number>,
): number {
  const { g, m1, m2, l1, l2 } = p;
  const th1 = q[0];
  const th2 = q[1];
  const w1 = v[0];
  const w2 = v[1];
  const delta = th1 - th2;
  const v1sq = (l1 * w1) ** 2;
  const v2sq = (l1 * w1) ** 2 + (l2 * w2) ** 2 + 2 * l1 * l2 * w1 * w2 * Math.cos(delta);
  const T = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq;
  const V = -(m1 + m2) * g * l1 * Math.cos(th1) - m2 * g * l2 * Math.cos(th2);
  return T + V;
}

export function doublePendulumCartesian(
  p: DoublePendulumParams,
  th1: number,
  th2: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = p.l1 * Math.sin(th1);
  const y1 = -p.l1 * Math.cos(th1);
  const x2 = x1 + p.l2 * Math.sin(th2);
  const y2 = y1 - p.l2 * Math.cos(th2);
  return { x1, y1, x2, y2 };
}
