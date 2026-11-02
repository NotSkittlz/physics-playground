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
    bg: cssColor("--bg", "#0c0d10"),
    elev: cssColor("--bg-elev", "#14151b"),
    ink: cssColor("--ink", "#ece8df"),
    muted: cssColor("--muted", "#9b968c"),
    line: cssColor("--line", "rgba(236,232,223,0.10)"),
    brass: cssColor("--brass", "#d4a056"),
    sky: cssColor("--sky", "#7aa6c4"),
    rose: cssColor("--rose", "#d9897a"),
    sage: cssColor("--sage", "#7eae8c"),
    paper: cssColor("--paper", "#ece8df"),
  };
}

export function fillBackground(ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
}
