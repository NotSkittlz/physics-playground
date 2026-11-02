import { lerpPacked } from "../core/draw.ts";
import { STEPPERS } from "../integrators/step.ts";
import { Scratch } from "../integrators/scratch.ts";
import { PhaseState, type MethodId, type Stepper, type System } from "../integrators/types.ts";

export class Integrable {
  readonly curr: PhaseState;
  readonly prev: PhaseState;
  readonly draw: PhaseState;
  readonly scratch: Scratch;
  sys: System;
  stepper: Stepper;
  tol = 1e-8;

  constructor(sys: System, method: MethodId) {
    this.sys = sys;
    this.stepper = STEPPERS[method];
    this.curr = new PhaseState(sys.nq);
    this.prev = new PhaseState(sys.nq);
    this.draw = new PhaseState(sys.nq);
    this.scratch = new Scratch();
    this.scratch.ensure(sys.nq);
  }

  setMethod(method: MethodId): void {
    this.stepper = STEPPERS[method];
    this.scratch.resetAdaptive();
  }

  seed(q: ArrayLike<number>, v: ArrayLike<number>, t = 0): void {
    this.curr.set(q, v, t);
    this.prev.copyFrom(this.curr);
    this.draw.copyFrom(this.curr);
    this.scratch.resetAdaptive();
  }

  advance(steps: number, dt: number, onStep?: (s: PhaseState) => void): void {
    if (steps <= 0) return;
    for (let i = 0; i < steps - 1; i++) {
      this.stepper.step(this.sys, this.curr, dt, this.scratch, this.tol);
      onStep?.(this.curr);
    }
    this.prev.copyFrom(this.curr);
    this.stepper.step(this.sys, this.curr, dt, this.scratch, this.tol);
    onStep?.(this.curr);
  }

  interpolate(alpha: number): void {
    lerpPacked(this.draw.y, this.prev.y, this.curr.y, alpha);
    this.draw.t = this.prev.t + (this.curr.t - this.prev.t) * alpha;
  }
}

export function massRadius(m: number, mRef: number, base = 8): number {
  return base * Math.cbrt(Math.max(m, 0.05) / Math.max(mRef, 0.05));
}
