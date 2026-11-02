import type { Palette } from "./canvas.ts";
import { withAlpha } from "./trail.ts";

export class RingSeries {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly cap: number;
  length = 0;
  head = 0;
  color: string;
  readonly label: string;

  constructor(cap: number, color: string, label: string) {
    this.cap = cap;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.color = color;
    this.label = label;
  }

  clear(): void {
    this.length = 0;
    this.head = 0;
  }

  push(x: number, y: number): void {
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.head = (this.head + 1) % this.cap;
    if (this.length < this.cap) this.length++;
  }

  extrema(): { xmin: number; xmax: number; ymin: number; ymax: number } {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    const start = this.length === this.cap ? this.head : 0;
    for (let k = 0; k < this.length; k++) {
      const j = (start + k) % this.cap;
      const xv = this.x[j];
      const yv = this.y[j];
      if (xv < xmin) xmin = xv;
      if (xv > xmax) xmax = xv;
      if (yv < ymin) ymin = yv;
      if (yv > ymax) ymax = yv;
    }
    return { xmin, xmax, ymin, ymax };
  }
}

export interface PlotOptions {
  title: string;
  xLabel: string;
  yLabel: string;
  scatter?: boolean;
  xWrap?: number;
}

const PAD = { l: 44, r: 12, t: 16, b: 26 };

export function drawPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: Palette,
  series: readonly RingSeries[],
  opts: PlotOptions,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  const padT = series.length > 1 ? 28 : PAD.t;
  if (series.length > 1) {
    ctx.font = "500 11px 'Source Sans 3', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let lx = 12;
    const ly = 8;
    const gap = 12;
    for (const s of series) {
      const tw = ctx.measureText(s.label).width;
      if (lx + tw > w - 8) break;
      ctx.fillStyle = withAlpha(s.color, 0.9);
      ctx.fillText(s.label, lx, ly);
      lx += tw + gap;
    }
  }

  const innerW = w - PAD.l - PAD.r;
  const innerH = h - padT - PAD.b;
  if (innerW < 20 || innerH < 20) return;

  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const s of series) {
    if (s.length === 0) continue;
    const e = s.extrema();
    xmin = Math.min(xmin, e.xmin);
    xmax = Math.max(xmax, e.xmax);
    ymin = Math.min(ymin, e.ymin);
    ymax = Math.max(ymax, e.ymax);
  }
  if (!Number.isFinite(xmin)) {
    ctx.fillStyle = pal.muted;
    ctx.font = "13px 'Source Sans 3', sans-serif";
    ctx.fillText("waiting for samples…", PAD.l, padT + innerH / 2);
    return;
  }
  const xPad = paddedSpan(xmin, xmax);
  xmin = xPad.min;
  xmax = xPad.max;
  const yPad = paddedSpan(ymin, ymax);
  ymin = yPad.min;
  ymax = yPad.max;
  const ySpan = ymax - ymin;

  const xTo = (x: number) => PAD.l + ((x - xmin) / (xmax - xmin)) * innerW;
  const yTo = (y: number) => padT + ((ymax - y) / (ymax - ymin)) * innerH;

  ctx.strokeStyle = withAlpha(pal.ink, 0.08);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, padT);
  ctx.lineTo(PAD.l, padT + innerH);
  ctx.lineTo(PAD.l + innerW, padT + innerH);
  ctx.stroke();

  ctx.fillStyle = pal.muted;
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(formatTick(ymax, ySpan), PAD.l - 6, padT);
  ctx.fillText(formatTick(ymin, ySpan), PAD.l - 6, padT + innerH);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(formatTick(xmin, xmax - xmin), PAD.l, padT + innerH + 6);
  ctx.fillText(formatTick(xmax, xmax - xmin), PAD.l + innerW, padT + innerH + 6);

  ctx.fillStyle = withAlpha(pal.muted, 0.85);
  ctx.font = "11px 'Source Sans 3', sans-serif";
  ctx.fillText(opts.xLabel, PAD.l + innerW / 2, h - 12);
  ctx.save();
  ctx.translate(12, padT + innerH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "middle";
  ctx.fillText(opts.yLabel, 0, 0);
  ctx.restore();

  for (const s of series) {
    if (s.length === 0) continue;
    const start = s.length === s.cap ? s.head : 0;
    if (opts.scatter) {
      ctx.fillStyle = s.color;
      for (let k = 0; k < s.length; k++) {
        const j = (start + k) % s.cap;
        ctx.beginPath();
        ctx.arc(xTo(s.x[j]), yTo(s.y[j]), 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      let moved = false;
      let prevX = s.x[start];
      for (let k = 0; k < s.length; k++) {
        const j = (start + k) % s.cap;
        const xv = s.x[j];
        if (opts.xWrap && k > 0 && wrappedSegment(prevX, xv, opts.xWrap)) {
          moved = false;
        }
        prevX = xv;
        const px = xTo(xv);
        const py = yTo(s.y[j]);
        if (!moved) {
          ctx.moveTo(px, py);
          moved = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

/** True when a periodic coordinate jumped across the branch cut. */
export function wrappedSegment(prev: number, curr: number, wrap: number): boolean {
  return Math.abs(curr - prev) > wrap * 0.5;
}

/** Axis padding. Degenerate spans get a relative bump so the scale is defined. */
export function paddedSpan(min: number, max: number): { min: number; max: number } {
  let lo = min;
  let hi = max;
  let span = hi - lo;
  if (!(span > 0)) {
    const mag = Math.max(Math.abs(lo), Math.abs(hi), 1);
    lo -= mag * 1e-3;
    hi += mag * 1e-3;
    span = hi - lo;
  }
  const pad = 0.08 * span;
  return { min: lo - pad, max: hi + pad };
}

/** Tick label. Uses scientific notation when the axis span is tiny. */
export function formatTick(v: number, span = 1): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (span > 0 && span < 0.01) return v.toExponential(1);
  if (a !== 0 && (a >= 1e4 || a < 1e-3)) return v.toExponential(1);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
