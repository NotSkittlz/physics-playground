/** Circular trail of 2D points. No allocation after construction. */
export class Trail2D {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly cap: number;
  length = 0;
  private i = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.xs = new Float64Array(cap);
    this.ys = new Float64Array(cap);
  }

  clear(): void {
    this.length = 0;
    this.i = 0;
  }

  push(x: number, y: number): void {
    this.xs[this.i] = x;
    this.ys[this.i] = y;
    this.i = (this.i + 1) % this.cap;
    if (this.length < this.cap) this.length++;
  }

  /** Oldest → newest. `idx` 0 is oldest. */
  at(idx: number): { x: number; y: number } {
    const start = this.length === this.cap ? this.i : 0;
    const j = (start + idx) % this.cap;
    return { x: this.xs[j], y: this.ys[j] };
  }

  stroke(
    ctx: CanvasRenderingContext2D,
    color: string,
    width: number,
    fade: boolean,
  ): void {
    const n = this.length;
    if (n < 2) return;
    const start = n === this.cap ? this.i : 0;
    if (!fade) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(this.xs[start], this.ys[start]);
      for (let k = 1; k < n; k++) {
        const j = (start + k) % this.cap;
        ctx.lineTo(this.xs[j], this.ys[j]);
      }
      ctx.stroke();
      return;
    }
    ctx.lineWidth = width;
    for (let k = 1; k < n; k++) {
      const j0 = (start + k - 1) % this.cap;
      const j1 = (start + k) % this.cap;
      const a = k / n;
      ctx.strokeStyle = withAlpha(color, a * a);
      ctx.beginPath();
      ctx.moveTo(this.xs[j0], this.ys[j0]);
      ctx.lineTo(this.xs[j1], this.ys[j1]);
      ctx.stroke();
    }
  }
}

export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `,${a})`);
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}
