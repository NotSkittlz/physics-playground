import type { Scratch } from "./scratch.ts";

/**
 * Second-order dynamical system: `q̈ = a(t, q, q̇)`.
 *
 * Packed first-order state is `y = [q_0..q_{n-1}, v_0..v_{n-1}]`.
 * Implementations must not allocate; `out` is pre-sized to `nq`.
 */
export interface System {
  readonly nq: number;
  accel(t: number, q: Float64Array, v: Float64Array, out: Float64Array): void;
}

export const METHOD_IDS = [
  "euler",
  "symplectic-euler",
  "verlet",
  "rk4",
  "rk45",
] as const;

export type MethodId = (typeof METHOD_IDS)[number];

export function isMethodId(value: string): value is MethodId {
  return (METHOD_IDS as readonly string[]).includes(value);
}

export interface MethodInfo {
  readonly id: MethodId;
  readonly name: string;
  readonly shortName: string;
  /** Global error order for a smooth problem with a fixed step. */
  readonly order: number;
  readonly symplectic: boolean;
  readonly adaptive: boolean;
  readonly description: string;
}

/**
 * Packed phase-space state with durable typed-array views.
 * Views are created once; never slice these in a hot loop.
 */
export class PhaseState {
  readonly nq: number;
  readonly y: Float64Array;
  readonly q: Float64Array;
  readonly v: Float64Array;
  t = 0;

  constructor(nq: number, y?: Float64Array) {
    this.nq = nq;
    this.y = y ?? new Float64Array(2 * nq);
    this.q = this.y.subarray(0, nq);
    this.v = this.y.subarray(nq, 2 * nq);
  }

  clone(): PhaseState {
    const s = new PhaseState(this.nq);
    s.copyFrom(this);
    return s;
  }

  copyFrom(src: PhaseState): void {
    this.y.set(src.y);
    this.t = src.t;
  }

  set(q: ArrayLike<number>, v: ArrayLike<number>, t = 0): void {
    this.q.set(q);
    this.v.set(v);
    this.t = t;
  }
}

export interface StepResult {
  /** Number of acceleration evaluations consumed. */
  evals: number;
  /** Adaptive methods: suggested next step. Fixed-step methods: `dt`. */
  hNext: number;
  /** True if the interval was covered. Adaptive methods may reject internally. */
  ok: boolean;
}

export interface Stepper {
  readonly info: MethodInfo;
  /**
   * Advance `state` in place by `dt`.
   * Adaptive RK45 may take many internal substeps to cover `dt` within `tol`.
   * Must not allocate when `scratch` is already sized for `sys.nq`.
   */
  step(
    sys: System,
    state: PhaseState,
    dt: number,
    scratch: Scratch,
    tol?: number,
  ): StepResult;
}
