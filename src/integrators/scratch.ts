/**
 * Preallocated workspace for integrators.
 * Call `ensure(nq)` once when the system dimension is known (or changes).
 */
export class Scratch {
  nq = 0;
  /** Suggested RK45 step persisted across calls (FSAL-style continuation). */
  rk45h = 0;
  rk45Tol = 1e-8;

  readonly ys: Float64Array[] = [];
  readonly qs: Float64Array[] = [];
  readonly vs: Float64Array[] = [];
  readonly ydots: Float64Array[] = [];
  readonly as: Float64Array[] = [];
  qWork = new Float64Array(0);
  vWork = new Float64Array(0);

  ensure(nq: number, ySlots = 10, aSlots = 4): void {
    if (this.nq === nq && this.ys.length >= ySlots && this.as.length >= aSlots) return;
    this.nq = nq;
    this.ys.length = 0;
    this.qs.length = 0;
    this.vs.length = 0;
    this.ydots.length = 0;
    this.as.length = 0;
    this.qWork = new Float64Array(nq);
    this.vWork = new Float64Array(nq);
    for (let i = 0; i < ySlots; i++) {
      const y = new Float64Array(2 * nq);
      this.ys.push(y);
      this.qs.push(y.subarray(0, nq));
      this.vs.push(y.subarray(nq, 2 * nq));
      this.ydots.push(new Float64Array(2 * nq));
    }
    for (let i = 0; i < aSlots; i++) this.as.push(new Float64Array(nq));
  }

  resetAdaptive(): void {
    this.rk45h = 0;
  }
}

export function writeDeriv(
  sys: { nq: number; accel: (t: number, q: Float64Array, v: Float64Array, out: Float64Array) => void },
  t: number,
  q: Float64Array,
  v: Float64Array,
  ydot: Float64Array,
  aTmp: Float64Array,
): void {
  ydot.set(v);
  sys.accel(t, q, v, aTmp);
  ydot.set(aTmp, sys.nq);
}
