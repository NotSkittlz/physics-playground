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
  /** Kept for call-site captions; the HTML `.plot-caption` is the visible y-axis name. */
  yLabel: string;
  scatter?: boolean;
  xWrap?: number;
}

/** Inner plot inset. Left is wide enough for superscript scientific ticks. */
const PAD = { l: 64, r: 20, t: 22, b: 36 };

const SUPER: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
  "+": "⁺",
};

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

  const padT = series.length > 1 ? 30 : PAD.t;
  if (series.length > 1) {
    ctx.font = "500 11px 'Source Sans 3', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let lx = PAD.l;
    const ly = 8;
    const gap = 12;
    for (const s of series) {
      const tw = ctx.measureText(s.label).width;
      if (lx + tw > w - PAD.r) break;
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
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("waiting for samples…", PAD.l, padT + innerH / 2);
    return;
  }

  const xPad = paddedSpan(xmin, xmax, xmin >= 0 ? { floor: 0 } : undefined);
  xmin = xPad.min;
  xmax = xPad.max;
  const yPad = paddedSpan(ymin, ymax);
  ymin = yPad.min;
  ymax = yPad.max;
  const ySpan = ymax - ymin;
  const xSpan = xmax - xmin;

  const xTo = (x: number) => PAD.l + ((x - xmin) / xSpan) * innerW;
  const yTo = (y: number) => padT + ((ymax - y) / ySpan) * innerH;

  ctx.strokeStyle = withAlpha(pal.ink, 0.08);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, padT);
  ctx.lineTo(PAD.l, padT + innerH);
  ctx.lineTo(PAD.l + innerW, padT + innerH);
  ctx.stroke();

  if (ymin < 0 && ymax > 0) {
    const y0 = yTo(0);
    ctx.strokeStyle = withAlpha(pal.ink, 0.1);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y0);
    ctx.lineTo(PAD.l + innerW, y0);
    ctx.stroke();
  }

  const yTicks = axisTicks(ymin, ymax, 3);
  const xTicks = axisTicks(xmin, xmax, 3);

  ctx.fillStyle = pal.muted;
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "right";
  for (const t of yTicks) {
    const py = yTo(t);
    ctx.textBaseline = py <= padT + 6 ? "top" : py >= padT + innerH - 6 ? "bottom" : "middle";
    ctx.fillText(formatTick(t, ySpan), PAD.l - 8, py);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of xTicks) {
    const px = xTo(t);
    const label = formatTick(t, xSpan);
    const offset = t === xmin ? Math.min(12, innerW * 0.08) : t === xmax ? -Math.min(12, innerW * 0.08) : 0;
    ctx.fillText(label, px + offset, padT + innerH + 8);
  }

  ctx.fillStyle = withAlpha(pal.muted, 0.85);
  ctx.font = "11px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(opts.xLabel, PAD.l + innerW / 2, h - 10);

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

export interface SpanOptions {
  /** Do not pad below this value when the data already sits on or above it. */
  floor?: number;
}

/** Axis padding. Degenerate spans get a relative bump so the scale is defined. */
export function paddedSpan(min: number, max: number, opts?: SpanOptions): { min: number; max: number } {
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
  lo -= pad;
  hi += pad;
  if (opts?.floor !== undefined && min >= opts.floor) lo = opts.floor;
  return { min: lo, max: hi };
}

function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  return (err < 1.5 ? 1 : err < 3.5 ? 2 : err < 7.5 ? 5 : 10) * mag;
}

/** ~`count` nice ticks on [min, max], always including 0 when the range crosses it. */
export function axisTicks(min: number, max: number, count = 3): number[] {
  if (!(max > min) || count < 2) return [min];
  const span = max - min;
  const step = niceStep(span / (count - 1));
  const k0 = Math.ceil((min - step * 1e-9) / step);
  const k1 = Math.floor((max + step * 1e-9) / step);
  const ticks: number[] = [];
  for (let k = k0; k <= k1; k++) ticks.push(k === 0 ? 0 : k * step);
  if (min < 0 && max > 0) {
    if (!ticks.some((t) => t === 0)) {
      ticks.push(0);
      ticks.sort((a, b) => a - b);
    }
    if (ticks.length === 0 || ticks[0] >= 0) ticks.unshift(min);
    if (ticks[ticks.length - 1] <= 0) ticks.push(max);
  }
  if (min === 0 && ticks[0] !== 0) ticks.unshift(0);
  return ticks.length > 0 ? thinTicks(ticks, 4) : [min, max];
}

function thinTicks(ticks: number[], max: number): number[] {
  if (ticks.length <= max) return ticks;
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (t: number): void => {
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(ticks[0]);
  const zero = ticks.find((t) => t === 0);
  const step = (ticks.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) push(ticks[Math.round(i * step)]);
  if (zero !== undefined) push(zero);
  push(ticks[ticks.length - 1]);
  out.sort((a, b) => a - b);
  return out;
}

function superScript(n: number): string {
  return String(n).replace(/[0-9+-]/g, (c) => SUPER[c] ?? c);
}

function formatSci(v: number): string {
  if (v === 0) return "0";
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  let exp = Math.floor(Math.log10(a));
  let mant = a / 10 ** exp;
  mant = Math.round(mant * 10) / 10;
  if (mant >= 10) {
    mant /= 10;
    exp += 1;
  }
  if (mant === 0) return "0";
  if (mant === 1) return `${sign}10${superScript(exp)}`;
  return `${sign}${mant.toFixed(1)}×10${superScript(exp)}`;
}

/** Tick label. Tiny spans and extreme magnitudes use superscript scientific notation. */
export function formatTick(v: number, span = 1): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a === 0) return "0";
  const sign = v < 0 ? "−" : "";
  if ((span > 0 && span < 0.01) || a >= 1e4 || a < 1e-3) return formatSci(v);
  if (a >= 10) return sign + a.toFixed(1);
  return sign + a.toFixed(2);
}
