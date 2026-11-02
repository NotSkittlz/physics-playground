const MAX_DPR = 2;

/**
 * Device-pixel-ratio-aware canvas. Drawing code uses CSS pixels;
 * `resize()` maps the backing store and sets the transform once.
 */
export class HiDpiCanvas {
  readonly el: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  private readonly maxDpr: number;

  constructor(el: HTMLCanvasElement, maxDpr = MAX_DPR) {
    this.el = el;
    this.maxDpr = maxDpr;
    const ctx = el.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
  }

  resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const rect = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return false;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.el.width = Math.round(w * dpr);
    this.el.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
}

export function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface Palette {
  bg: string;
  elev: string;
  ink: string;
  muted: string;
  line: string;
  brass: string;
  sky: string;
  rose: string;
  sage: string;
  paper: string;
}

export function readPalette(): Palette {
  return {
    bg: cssColor("--bg", "#0b0d11"),
    elev: cssColor("--bg-elev", "#141821"),
    ink: cssColor("--ink", "#ece7dc"),
    muted: cssColor("--muted", "#9a9588"),
    line: cssColor("--line", "rgba(212,160,86,0.25)"),
    brass: cssColor("--brass", "#d4a056"),
    sky: cssColor("--sky", "#7eb3d9"),
    rose: cssColor("--rose", "#e08b7a"),
    sage: cssColor("--sage", "#8fbf9a"),
    paper: cssColor("--paper", "#ece7dc"),
  };
}

export function fillBackground(ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
}
