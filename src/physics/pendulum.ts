import type { System } from "../integrators/types.ts";

export interface PendulumParams {
  g: number;
  L: number;
  /** Linear damping coefficient γ in θ̈ + γ θ̇ + (g/L) sin θ = A cos(ω t). */
  gamma: number;
  driveAmp: number;
  driveFreq: number;
  /** If true, replace sin θ with θ (small-angle test system). */
  linear: boolean;
}

export const PENDULUM_DEFAULTS: PendulumParams = {
  g: 1,
  L: 1,
  gamma: 0.15,
  driveAmp: 0,
  driveFreq: 2 / 3,
  linear: false,
};

/** Classic chaotic drive (dimensionless, g/L = 1): γ = 1/2, A = 1.15, ω = 2/3. */
export const PENDULUM_CHAOS: PendulumParams = {
  g: 1,
  L: 1,
  gamma: 0.5,
  driveAmp: 1.15,
  driveFreq: 2 / 3,
  linear: false,
};

export function pendulumSystem(p: PendulumParams): System {
  const omega02 = p.g / p.L;
  return {
    nq: 1,
    accel(t, q, v, out) {
      const restore = p.linear ? omega02 * q[0] : omega02 * Math.sin(q[0]);
      out[0] = -restore - p.gamma * v[0] + p.driveAmp * Math.cos(p.driveFreq * t);
    },
  };
}

/** Small-angle period T = 2π √(L/g). */
export function pendulumSmallAnglePeriod(p: Pick<PendulumParams, "g" | "L">): number {
  return 2 * Math.PI * Math.sqrt(p.L / p.g);
}

/**
 * Mechanical energy per unit mass, with V = 0 at the hanging-down rest point.
 * Uses ½ g L θ² when `linear` so the energy matches the oscillator being
 * integrated. Not conserved once damping or driving is on.
 */
export function pendulumEnergy(p: PendulumParams, theta: number, omega: number): number {
  const kinetic = 0.5 * (p.L * omega) ** 2;
  const potential = p.linear ? 0.5 * p.g * p.L * theta * theta : p.g * p.L * (1 - Math.cos(theta));
  return kinetic + potential;
}
