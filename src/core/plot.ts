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

const PAD_R = 16;
const PAD_T = 16;
const PAD_T_LEGEND = 28;
/** Tick row + gap + x-label + bottom margin. */
const PAD_B = 48;
const TICK_FONT = "11px 'IBM Plex Mono', monospace";
const LABEL_H = 12;
/** Fallback advance for IBM Plex Mono 11px when no canvas is available. */
export const MONO_ADVANCE = 7;

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

export interface PlacedTick {
  value: number;
  label: string;
  pos: number;
}

export interface TickLayout {
  padL: number;
  padT: number;
  padR: number;
  padB: number;
  innerW: number;
  innerH: number;
  xTicks: PlacedTick[];
  yTicks: PlacedTick[];
}

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

  const hasLegend = series.length > 1;
  if (hasLegend) {
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
    ctx.fillText("waiting for samples…", 16, h / 2);
    return;
  }

  const xPad = paddedSpan(xmin, xmax, xmin >= 0 ? { floor: 0 } : undefined);
  xmin = xPad.min;
  xmax = xPad.max;
  const yPad = paddedSpan(ymin, ymax);
  ymin = yPad.min;
  ymax = yPad.max;

  ctx.font = TICK_FONT;
  const layout = layoutPlotTicks({
    xmin,
    xmax,
    ymin,
    ymax,
    width: w,
    height: h,
    hasLegend,
    measure: (s) => ctx.measureText(s).width,
  });
  if (layout.innerW < 20 || layout.innerH < 20) return;

  const { padL, padT, innerW, innerH, xTicks, yTicks } = layout;
  const xTo = (x: number) => padL + ((x - xmin) / (xmax - xmin)) * innerW;
  const yTo = (y: number) => padT + ((ymax - y) / (ymax - ymin)) * innerH;

  ctx.strokeStyle = withAlpha(pal.ink, 0.08);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  if (ymin < 0 && ymax > 0) {
    const y0 = yTo(0);
    if (y0 > padT + 4 && y0 < padT + innerH - 4) {
      ctx.strokeStyle = withAlpha(pal.ink, 0.1);
      ctx.beginPath();
      ctx.moveTo(padL, y0);
      ctx.lineTo(padL + innerW, y0);
      ctx.stroke();
    }
  }

  ctx.fillStyle = pal.muted;
  ctx.font = TICK_FONT;
  ctx.textAlign = "right";
  for (const t of yTicks) {
    const py = padT + t.pos;
    ctx.textBaseline = t.pos <= 6 ? "top" : t.pos >= innerH - 6 ? "bottom" : "middle";
    ctx.fillText(t.label, padL - 8, py);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const tickRow = padT + innerH + 6;
  for (const t of xTicks) {
    ctx.fillText(t.label, padL + t.pos, tickRow);
  }

  ctx.fillStyle = withAlpha(pal.muted, 0.85);
  ctx.font = "11px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(opts.xLabel, padL + innerW / 2, h - 8);

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
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, Number.MIN_VALUE)));
  const err = raw / mag;
  return (err < 1.5 ? 1 : err < 3.5 ? 2 : err < 7.5 ? 5 : 10) * mag;
}

/**
 * Nice tick values on [min, max]. Includes 0 when the range contains it.
 * `maxCount` caps how many candidates are generated (small plots pass 2).
 */
export function niceTickValues(min: number, max: number, maxCount = 3): number[] {
  if (!(max > min)) return [snapZero(min, max - min)];
  const count = Math.max(2, maxCount);
  const step = niceStep((max - min) / (count - 1));
  const k0 = Math.ceil((min - step * 1e-9) / step);
  const k1 = Math.floor((max + step * 1e-9) / step);
  const ticks: number[] = [];
  for (let k = k0; k <= k1; k++) ticks.push(snapZero(k * step, step));
  if (min <= 0 && max >= 0 && !ticks.some((t) => t === 0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  if (min === 0 && ticks[0] !== 0) ticks.unshift(0);
  return ticks.length > 0 ? uniqueSorted(ticks) : [min, max];
}

/** @deprecated Use niceTickValues + placeTicks. Kept for existing tests. */
export function axisTicks(min: number, max: number, count = 3): number[] {
  return niceTickValues(min, max, count);
}

export function placeTicks(
  values: number[],
  min: number,
  max: number,
  length: number,
  span: number,
  measure: (label: string) => number,
  minGap: number,
  reverse: boolean,
): PlacedTick[] {
  const range = max - min;
  if (!(range > 0) || length <= 0) return [];
  const raw: PlacedTick[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const value = snapZero(v, span);
    const label = formatTick(value, span);
    if (seen.has(label)) continue;
    seen.add(label);
    const pos = reverse ? ((max - value) / range) * length : ((value - min) / range) * length;
    raw.push({ value, label, pos });
  }
  const rank = (p: PlacedTick): number => {
    let s = 0;
    if (p.label === "0") s += 100;
    if (p === raw[0] || p === raw[raw.length - 1]) s += 10;
    return s;
  };
  const preferred = raw.slice().sort((a, b) => rank(b) - rank(a));
  const kept: PlacedTick[] = [];
  for (const p of preferred) {
    const size = measure(p.label);
    const hits = kept.some((k) => Math.abs(p.pos - k.pos) < (size + measure(k.label)) / 2 + minGap);
    if (!hits) kept.push(p);
  }
  kept.sort((a, b) => a.pos - b.pos);
  return kept;
}

export function layoutPlotTicks(opts: {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  width: number;
  height: number;
  hasLegend?: boolean;
  measure?: (label: string) => number;
}): TickLayout {
  const measure = opts.measure ?? ((s) => s.length * MONO_ADVANCE);
  const padT = opts.hasLegend ? PAD_T_LEGEND : PAD_T;
  const padR = PAD_R;
  const padB = PAD_B;
  const xSpan = opts.xmax - opts.xmin;
  const ySpan = opts.ymax - opts.ymin;
  const innerH = opts.height - padT - padB;
  const yCount = innerH < 70 ? 2 : innerH < 130 ? 3 : 4;
  const yValues = niceTickValues(opts.ymin, opts.ymax, yCount);
  let yTicks = placeTicks(yValues, opts.ymin, opts.ymax, innerH, ySpan, () => LABEL_H, 6, true);

  let widest = 0;
  for (const t of yTicks) widest = Math.max(widest, measure(t.label));
  const padL = Math.max(40, Math.ceil(widest + 14));
  const innerW = opts.width - padL - padR;
  const xCount = innerW < 110 ? 2 : innerW < 200 ? 3 : 4;
  const xValues = niceTickValues(opts.xmin, opts.xmax, xCount);
  const xTicks = placeTicks(xValues, opts.xmin, opts.xmax, innerW, xSpan, measure, 10, false);

  const yAtOrigin = yTicks.find((t) => t.label === "0" && t.pos > innerH - LABEL_H - 4);
  const xAtOrigin = xTicks.find((t) => t.label === "0" && t.pos < measure(t.label) + 4);
  if (yAtOrigin && xAtOrigin) yTicks = yTicks.filter((t) => t !== yAtOrigin);

  return { padL, padT, padR, padB, innerW, innerH, xTicks, yTicks };
}

function snapZero(v: number, scale: number): number {
  if (!Number.isFinite(v)) return v;
  const eps = Math.max(Math.abs(scale) * 1e-12, Number.EPSILON);
  return Math.abs(v) <= eps ? 0 : v;
}

function uniqueSorted(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
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

/** Tick label. Never prints −0 / −0.00. Tiny spans use superscript scientific notation. */
export function formatTick(v: number, span = 1): string {
  if (!Number.isFinite(v)) return "–";
  const snapped = snapZero(v, span);
  if (snapped === 0) return "0";
  const a = Math.abs(snapped);
  const sign = snapped < 0 ? "−" : "";
  if ((span > 0 && span < 0.01) || a >= 1e4 || a < 1e-3) {
    const s = formatSci(snapped);
    return s.replace(/^−0$/, "0");
  }
  const digits = a >= 10 ? 1 : 2;
  const body = a.toFixed(digits);
  if (Number(body) === 0) return "0";
  return sign + body;
}
