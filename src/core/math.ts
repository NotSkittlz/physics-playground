/** Clamp `x` to `[lo, hi]`. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear interpolation. `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wrap an angle to `(−π, π]`. */
export function wrapPi(theta: number): number {
  const twoPi = Math.PI * 2;
  let t = (theta + Math.PI) % twoPi;
  if (t < 0) t += twoPi;
  t -= Math.PI;
  if (t <= -Math.PI) return Math.PI;
  return t;
}

/** Wrap an angle to `[0, 2π)`. */
export function wrapTwoPi(theta: number): number {
  const twoPi = Math.PI * 2;
  let t = theta % twoPi;
  if (t < 0) t += twoPi;
  return t;
}

/** Squared Euclidean norm of a 2-vector. */
export function hypot2(x: number, y: number): number {
  return x * x + y * y;
}

/** Floor on r²+ε² so coincidence is a huge force, not a vanishing one. */
export const SOFT_FLOOR = 1e-18;

/**
 * Inverse-cube factor `1 / r^3` with optional Plummer softening.
 * Softening keeps forces finite at coincidence without allocating.
 * Exact r=0 with ε=0 used to return 0 (and V=∞); we clamp instead.
 */
export function invR3(r2: number, softening2 = 0): number {
  const s = Math.max(r2 + Math.max(softening2, 0), SOFT_FLOOR);
  return s ** -1.5;
}

export function almostEqual(a: number, b: number, rel = 1e-9, abs = 1e-12): boolean {
  return Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b));
}

/** RMS of a packed vector. */
export function rms(y: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) s += y[i] * y[i];
  return Math.sqrt(s / y.length);
}

/** Copy `src` into `dst` (same length). */
export function copy(dst: Float64Array, src: ArrayLike<number>): void {
  dst.set(src);
}

/** `out[i] = y[i] + scale * k[i]` */
export function axpy(
  out: Float64Array,
  y: ArrayLike<number>,
  k: ArrayLike<number>,
  scale: number,
): void {
  const n = y.length;
  for (let i = 0; i < n; i++) out[i] = y[i] + scale * k[i];
}

/** `out[i] = y[i] + Σ_j coeff[j] * ks[j][i]` */
export function combine(
  out: Float64Array,
  y: ArrayLike<number>,
  ks: readonly Float64Array[],
  coeff: readonly number[],
  scale: number,
): void {
  const n = y.length;
  const m = coeff.length;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < m; j++) acc += coeff[j] * ks[j][i];
    out[i] = y[i] + scale * acc;
  }
}
