import { fillBackground, type Palette } from "../core/canvas.ts";
import { drawArrow, drawDisc, screenToWorld, worldToScreen } from "../core/draw.ts";
import {
  FIELD_LODS,
  initialFieldLodState,
  nextFieldLod,
  type FieldLodState,
} from "../core/lod.ts";
import { hypot2 } from "../core/math.ts";
import { drawPlot, RingSeries } from "../core/plot.ts";
import { Trail2D, withAlpha } from "../core/trail.ts";
import {
  EFIELD_DEFAULTS,
  efieldParticleEnergy,
  efieldParticleSystem,
  fieldAt,
  type PointCharge,
} from "../physics/efield.ts";
import { Integrable } from "./common.ts";
import { bool, num, str, type Hud, type ParamValue, type SimFrame, type SimMeta, type Simulation } from "./types.ts";

const FINE = FIELD_LODS[0]!;

const PRESETS: Record<string, PointCharge[]> = {
  dipole: [
    { x: -0.7, y: 0, q: 1 },
    { x: 0.7, y: 0, q: -1 },
  ],
  twoplus: [
    { x: -0.65, y: 0, q: 1 },
    { x: 0.65, y: 0, q: 1 },
  ],
  quadrupole: [
    { x: -0.55, y: -0.55, q: 1 },
    { x: 0.55, y: -0.55, q: -1 },
    { x: 0.55, y: 0.55, q: 1 },
    { x: -0.55, y: 0.55, q: -1 },
  ],
  ion: [
    { x: 0, y: 0, q: 2 },
    { x: 0.9, y: 0.2, q: -1 },
    { x: -0.7, y: -0.5, q: -1 },
  ],
};

export class EFieldSim implements Simulation {
  readonly meta: SimMeta = META;
  private pal!: Palette;
  private reduced = false;
  private charges: PointCharge[] = PRESETS.dipole.map((c) => ({ ...c }));
  private k = 1;
  private softening2 = 0.0025;
  private testQ = 0.4;
  private testM = 1;
  private body!: Integrable;
  private trail!: Trail2D;
  private energySeries!: RingSeries;
  private nx = FINE.nx;
  private ny = FINE.ny;
  private arrowX = FINE.arrowX;
  private arrowY = FINE.arrowY;
  private levels = FINE.levels;
  private V = new Float64Array(FINE.nx * FINE.ny);
  private lodState: FieldLodState = initialFieldLodState();
  private fieldDirty = true;
  private showEq = true;
  private showField = true;
  private showWash = true;
  private image: ImageData | null = null;
  private off: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private overlayW = 0;
  private overlayH = 0;
  private drag = -1;
  private world = { cx: 0, cy: 0, scale: 1, w: 1, h: 1 };
  private tmp = { ex: 0, ey: 0, v: 0 };
  private E0 = 0;
  private live: {
    k: number;
    softening2: number;
    testCharge: number;
    testMass: number;
    charges: PointCharge[];
  } = { ...EFIELD_DEFAULTS, charges: [] };

  reset(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(params, frame);
    this.rebuild(params, frame);
  }

  apply(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(params, frame);
    if (this.energySeries)     this.energySeries.color = this.pal.brass;
    this.fieldDirty = true;
  }

  private applyView(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.pal = frame.palette;
    this.reduced = frame.reducedMotion;
    this.showEq = bool(params, "eq", true);
    this.showField = bool(params, "field", true);
    this.showWash = bool(params, "wash", true);
  }

  private rebuild(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.testQ = num(params, "tq", 0.4);
    this.softening2 = num(params, "soft", 0.05) ** 2;
    const encoded = str(params, "c", "");
    const preset = str(params, "preset", "dipole");
    this.charges = encoded ? parseCharges(encoded) : PRESETS[preset]?.map((c) => ({ ...c })) ?? PRESETS.dipole.map((c) => ({ ...c }));
    this.live.k = this.k;
    this.live.softening2 = this.softening2;
    this.live.testCharge = this.testQ;
    this.live.testMass = this.testM;
    this.live.charges = this.charges;
    this.body = new Integrable(efieldParticleSystem(this.live), frame.method);
    this.body.seed([0, 0.85], [0.35, 0], 0);
    this.trail = new Trail2D(this.reduced ? 40 : 280);
    this.energySeries = new RingSeries(700, this.pal.brass, "E");
    this.E0 = efieldParticleEnergy(this.live, this.body.curr.q, this.body.curr.v);
    this.fieldDirty = true;
    this.sample();
  }

  advance(steps: number, dt: number): void {
    this.body.advance(steps, dt, () => this.sample());
  }

  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number, frameMs = 0): void {
    fillBackground(ctx, this.pal, w, h);
    const scale = (0.42 * Math.min(w, h));
    const cx = w / 2;
    const cy = h / 2;
    this.world = { cx, cy, scale, w, h };

    const next = nextFieldLod(this.lodState, frameMs, Math.min(w, h), this.reduced);
    if (next.lod !== this.lodState.lod) this.applyLod(next.lod);
    this.lodState = next;
    if (w !== this.overlayW || h !== this.overlayH) {
      this.overlayW = w;
      this.overlayH = h;
      this.fieldDirty = true;
    }

    if (this.fieldDirty) {
      this.computeGrid();
      this.paintOverlay();
      this.fieldDirty = false;
    }

    if (this.showWash && this.off) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.off, 0, 0, w, h);
      ctx.restore();
    }

    if ((this.showEq || this.showField) && this.overlay) {
      ctx.drawImage(this.overlay, 0, 0, w, h);
    }

    this.body.interpolate(alpha);
    const q = this.body.draw.q;
    const p = worldToScreen(q[0], q[1], cx, cy, scale);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, -scale);
    this.trail.stroke(ctx, this.pal.sage, 1.2 / scale, !this.reduced);
    ctx.restore();
    drawDisc(ctx, p.x, p.y, 6, this.pal.sage, this.pal.ink);

    for (const c of this.charges) {
      const s = worldToScreen(c.x, c.y, cx, cy, scale);
      const color = c.q >= 0 ? this.pal.rose : this.pal.sky;
      const r = 10 + 4 * Math.min(2, Math.abs(c.q));
      drawDisc(ctx, s.x, s.y, r, color, this.pal.paper);
      ctx.fillStyle = this.pal.bg;
      ctx.font = "600 13px 'Source Sans 3', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.q >= 0 ? "+" : "−", s.x, s.y + 0.5);
    }
  }

  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    drawPlot(ctx, w, h, this.pal, [this.energySeries], {
      title: "Relative energy error  (T + qV)",
      xLabel: "t",
      yLabel: "(E − E₀)/|E₀|",
    });
  }

  plotCaption(): string {
    return "Relative energy error";
  }

  energy(): number {
    return efieldParticleEnergy(this.spec(), this.body.curr.q, this.body.curr.v);
  }

  readout(): string {
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    return `t = ${this.body.curr.t.toFixed(2)}  ·  E = ${E.toFixed(3)}  ·  ΔE/E = ${dE.toExponential(1)}  ·  N = ${this.charges.length}`;
  }

  hud(): Hud {
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    return {
      primary: [
        { label: "ΔE/E", value: dE.toExponential(1) },
        { label: "t", value: this.body.curr.t.toFixed(2) },
      ],
      extra: [
        { label: "E", value: E.toFixed(3) },
        { label: "N", value: String(this.charges.length) },
      ],
    };
  }

  pointerDown(sx: number, sy: number, w: number, h: number): boolean {
    this.syncWorld(w, h);
    this.drag = this.hit(sx, sy);
    return this.drag >= 0;
  }

  pointerMove(sx: number, sy: number, w: number, h: number): void {
    if (this.drag < 0) return;
    this.syncWorld(w, h);
    const p = screenToWorld(sx, sy, this.world.cx, this.world.cy, this.world.scale);
    const c = this.charges[this.drag];
    c.x = Math.max(-1.8, Math.min(1.8, p.x));
    c.y = Math.max(-1.8, Math.min(1.8, p.y));
    this.fieldDirty = true;
  }

  pointerUp(): void {
    this.drag = -1;
  }

  encodedCharges(): string {
    return this.charges.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.q}`).join(";");
  }

  urlExtras(): Record<string, string> {
    return { c: this.encodedCharges() };
  }

  private spec() {
    return this.live;
  }

  private sample(): void {
    const s = this.body.curr;
    const E = efieldParticleEnergy(this.spec(), s.q, s.v);
    this.energySeries.push(s.t, this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0);
    this.trail.push(s.q[0], s.q[1]);
  }

  private syncWorld(w: number, h: number): void {
    this.world = { cx: w / 2, cy: h / 2, scale: 0.42 * Math.min(w, h), w, h };
  }

  private hit(sx: number, sy: number): number {
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      const p = worldToScreen(c.x, c.y, this.world.cx, this.world.cy, this.world.scale);
      const r = 14 + 4 * Math.min(2, Math.abs(c.q));
      if (hypot2(sx - p.x, sy - p.y) <= r * r) return i;
    }
    return -1;
  }

  private applyLod(lod: number): void {
    const spec = FIELD_LODS[lod] ?? FINE;
    if (
      spec.nx === this.nx &&
      spec.ny === this.ny &&
      spec.arrowX === this.arrowX &&
      spec.arrowY === this.arrowY &&
      spec.levels === this.levels
    ) {
      return;
    }
    this.nx = spec.nx;
    this.ny = spec.ny;
    this.arrowX = spec.arrowX;
    this.arrowY = spec.arrowY;
    this.levels = spec.levels;
    this.V = new Float64Array(this.nx * this.ny);
    this.off = null;
    this.image = null;
    this.fieldDirty = true;
  }

  private computeGrid(): void {
    const { cx, cy, scale, w, h } = this.world;
    const nx = this.nx;
    const ny = this.ny;
    if (w < 2 || h < 2) return;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const sx = (i / (nx - 1)) * w;
        const sy = (j / (ny - 1)) * h;
        const p = screenToWorld(sx, sy, cx, cy, scale);
        fieldAt(p.x, p.y, this.charges, this.k, this.softening2, this.tmp);
        const v = this.tmp.v;
        this.V[j * nx + i] = v;
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
    }
    if (!this.off || this.off.width !== nx || this.off.height !== ny) {
      this.off = document.createElement("canvas");
      this.off.width = nx;
      this.off.height = ny;
      this.image = this.off.getContext("2d")!.createImageData(nx, ny);
    }
    const img = this.image!;
    const span = Math.max(vmax - vmin, 1e-9);
    for (let n = 0; n < nx * ny; n++) {
      const t = (this.V[n] - vmin) / span;
      const [r, g, b] = wash(t, this.pal);
      const o = n * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
    this.off.getContext("2d")!.putImageData(img, 0, 0);
  }

  private paintOverlay(): void {
    const { w, h } = this.world;
    if (w < 2 || h < 2) return;
    if (!this.overlay || this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay = document.createElement("canvas");
      this.overlay.width = w;
      this.overlay.height = h;
    }
    const ctx = this.overlay.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    if (this.showEq) this.drawEquipotentials(ctx, w, h);
    if (this.showField) this.drawArrows(ctx);
  }

  private drawEquipotentials(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let n = 0; n < this.V.length; n++) {
      const v = this.V[n];
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
    const span = vmax - vmin;
    if (span < 1e-12) return;
    const levels = equipotentialLevels(vmin, vmax, this.levels);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const level of levels) {
      if (level === 0) continue;
      ctx.strokeStyle = withAlpha(this.pal.ink, 0.14);
      march(ctx, this.V, this.nx, this.ny, w, h, level);
    }
    if (levels.some((l) => l === 0)) {
      const lines = contourPolylines(this.V, this.nx, this.ny, w, h, 0);
      const inset = Math.min(w, h) * 0.08;
      ctx.save();
      ctx.beginPath();
      ctx.rect(inset, inset, w - 2 * inset, h - 2 * inset);
      ctx.clip();
      ctx.setLineDash([2, 12]);
      ctx.strokeStyle = withAlpha(this.pal.ink, 0.1);
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (const line of lines) {
        if (line.length < 2) continue;
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      }
      ctx.stroke();
      ctx.restore();
      labelZeroContour(ctx, this.V, this.nx, this.ny, w, h, withAlpha(this.pal.ink, 0.62), this.pal.bg);
    }
  }

  private drawArrows(ctx: CanvasRenderingContext2D): void {
    const { cx, cy, scale, w, h } = this.world;
    for (let j = 0; j < this.arrowY; j++) {
      for (let i = 0; i < this.arrowX; i++) {
        const sx = ((i + 0.5) / this.arrowX) * w;
        const sy = ((j + 0.5) / this.arrowY) * h;
        const p = screenToWorld(sx, sy, cx, cy, scale);
        if (tooClose(p.x, p.y, this.charges, 0.18)) continue;
        fieldAt(p.x, p.y, this.charges, this.k, this.softening2, this.tmp);
        const mag = Math.hypot(this.tmp.ex, this.tmp.ey);
        if (mag < 1e-8) continue;
        const len = 7 * Math.log10(1 + mag);
        const ux = this.tmp.ex / mag;
        const uy = -this.tmp.ey / mag;
        drawArrow(ctx, sx, sy, ux * len, uy * len, withAlpha(this.pal.sky, 0.32), 1);
      }
    }
  }
}

/**
 * Marching-squares levels across [vmin, vmax]. Includes V = 0 when the
 * potential changes sign (the dipole mid-plane), which a uniform partition
 * of 11 bins otherwise skips.
 */
export function equipotentialLevels(vmin: number, vmax: number, count: number): number[] {
  const span = vmax - vmin;
  if (!(span > 0) || count < 2) return [];
  const levels: number[] = [];
  for (let i = 1; i < count; i++) levels.push(vmin + (span * i) / count);
  if (vmin < 0 && vmax > 0 && !levels.some((l) => l === 0)) {
    levels.push(0);
    levels.sort((a, b) => a - b);
  }
  return levels;
}

/** Screen position of a V = 0 crossing, preferring the upper third of the canvas. */
export function zeroContourAnchor(
  V: Float64Array,
  nx: number,
  ny: number,
  w: number,
  h: number,
): { x: number; y: number } | null {
  const rows = [
    Math.round(0.16 * (ny - 1)),
    Math.round(0.28 * (ny - 1)),
    Math.round(0.5 * (ny - 1)),
    Math.round(0.82 * (ny - 1)),
  ];
  for (const j of rows) {
    const jj = Math.max(0, Math.min(ny - 1, j));
    for (let i = 0; i < nx - 1; i++) {
      const a = V[jj * nx + i];
      const b = V[jj * nx + i + 1];
      if (a === 0 || a * b < 0) {
        const t = a === 0 ? 0 : a / (a - b);
        return { x: ((i + t) / (nx - 1)) * w, y: (jj / (ny - 1)) * h };
      }
    }
  }
  return null;
}

function labelZeroContour(
  ctx: CanvasRenderingContext2D,
  V: Float64Array,
  nx: number,
  ny: number,
  w: number,
  h: number,
  color: string,
  bg: string,
): void {
  const p = zeroContourAnchor(V, nx, ny, w, h);
  if (!p) return;
  ctx.font = "500 11px 'Source Sans 3', sans-serif";
  ctx.textAlign = p.x > w * 0.7 ? "right" : "left";
  ctx.textBaseline = "bottom";
  const dx = p.x > w * 0.7 ? -7 : 7;
  const text = "V = 0";
  const tw = ctx.measureText(text).width;
  const x = p.x + dx;
  const y = p.y - 4;
  const left = ctx.textAlign === "right" ? x - tw - 3 : x - 3;
  ctx.fillStyle = withAlpha(bg, 0.78);
  ctx.fillRect(left, y - 12, tw + 6, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function tooClose(x: number, y: number, charges: PointCharge[], d: number): boolean {
  const d2 = d * d;
  for (const c of charges) if (hypot2(x - c.x, y - c.y) < d2) return true;
  return false;
}

function parseCharges(raw: string): PointCharge[] {
  const out: PointCharge[] = [];
  for (const part of raw.split(";")) {
    const bits = part.split(",").map(Number);
    if (bits.length >= 3 && bits.every(Number.isFinite)) out.push({ x: bits[0], y: bits[1], q: bits[2] });
  }
  return out.length ? out : PRESETS.dipole.map((c) => ({ ...c }));
}

function wash(t: number, pal: Palette): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  const rose = hex(pal.rose);
  const mid = hex(pal.bg);
  const sky = hex(pal.sky);
  if (u < 0.5) return mix(sky, mid, u * 2);
  return mix(mid, rose, (u - 0.5) * 2);
}

function hex(c: string): [number, number, number] {
  if (c.startsWith("#") && c.length >= 7) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  return [180, 180, 180];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

type Pt = { x: number; y: number };

function march(
  ctx: CanvasRenderingContext2D,
  V: Float64Array,
  nx: number,
  ny: number,
  w: number,
  h: number,
  level: number,
): void {
  ctx.beginPath();
  for (const [p, q] of marchSegments(V, nx, ny, w, h, level)) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}

function marchSegments(
  V: Float64Array,
  nx: number,
  ny: number,
  w: number,
  h: number,
  level: number,
): [Pt, Pt][] {
  const dx = w / (nx - 1);
  const dy = h / (ny - 1);
  const segs: [Pt, Pt][] = [];
  const pair = (p: Pt, q: Pt): void => {
    segs.push([p, q]);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = V[j * nx + i];
      const v10 = V[j * nx + i + 1];
      const v01 = V[(j + 1) * nx + i];
      const v11 = V[(j + 1) * nx + i + 1];
      let code = 0;
      if (v00 > level) code |= 1;
      if (v10 > level) code |= 2;
      if (v11 > level) code |= 4;
      if (v01 > level) code |= 8;
      if (code === 0 || code === 15) continue;
      const x = i * dx;
      const y = j * dy;
      const lerpE = (a: number, b: number) => (level - a) / (b - a + 1e-15);
      const btm = { x: x + dx * lerpE(v00, v10), y };
      const rgt = { x: x + dx, y: y + dy * lerpE(v10, v11) };
      const top = { x: x + dx * lerpE(v01, v11), y: y + dy };
      const lft = { x, y: y + dy * lerpE(v00, v01) };
      switch (code) {
        case 1:
        case 14:
          pair(lft, btm);
          break;
        case 2:
        case 13:
          pair(btm, rgt);
          break;
        case 3:
        case 12:
          pair(lft, rgt);
          break;
        case 4:
        case 11:
          pair(rgt, top);
          break;
        case 6:
        case 9:
          pair(btm, top);
          break;
        case 7:
        case 8:
          pair(lft, top);
          break;
        case 5:
          pair(lft, btm);
          pair(rgt, top);
          break;
        case 10:
          pair(btm, rgt);
          pair(lft, top);
          break;
        default:
          break;
      }
    }
  }
  return segs;
}

/**
 * Stitch marching-squares edge segments into polylines so a canvas dash
 * pattern can run along the contour instead of restarting on every cell.
 */
export function contourPolylines(
  V: Float64Array,
  nx: number,
  ny: number,
  w: number,
  h: number,
  level: number,
): Pt[][] {
  return stitchPolylines(marchSegments(V, nx, ny, w, h, level));
}

function stitchPolylines(segments: [Pt, Pt][]): Pt[][] {
  const used = new Uint8Array(segments.length);
  const eq = (a: Pt, b: Pt): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 0.75;
  const lines: Pt[][] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: Pt[] = [segments[i][0], segments[i][1]];
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const a = segments[j][0];
        const b = segments[j][1];
        const head = line[0];
        const tail = line[line.length - 1];
        if (eq(tail, a)) {
          line.push(b);
          used[j] = 1;
          grew = true;
        } else if (eq(tail, b)) {
          line.push(a);
          used[j] = 1;
          grew = true;
        } else if (eq(head, a)) {
          line.unshift(b);
          used[j] = 1;
          grew = true;
        } else if (eq(head, b)) {
          line.unshift(a);
          used[j] = 1;
          grew = true;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

const META: SimMeta = {
  id: "efield",
  number: "05",
  title: "Electric field",
  kicker: "Electrostatics",
  tagline: "Point charges, equipotentials, and a test mass that believes in Coulomb.",
  dt: 0.004,
  defaults: { preset: "dipole", tq: 0.4, soft: 0.05, eq: true, field: true, wash: true },
  controls: [
    {
      key: "preset",
      kind: "select",
      label: "Arrangement",
      options: [
        { value: "dipole", label: "Dipole  + −" },
        { value: "twoplus", label: "Two positives" },
        { value: "quadrupole", label: "Quadrupole" },
        { value: "ion", label: "Helium-like" },
      ],
    },
    { key: "tq", kind: "range", label: "Test charge q", min: -2, max: 2, step: 0.05 },
    { key: "soft", kind: "range", label: "Softening", min: 0.02, max: 0.18, step: 0.005 },
    { key: "eq", kind: "toggle", cosmetic: true, label: "Equipotentials" },
    { key: "field", kind: "toggle", cosmetic: true, label: "Field arrows" },
    { key: "wash", kind: "toggle", cosmetic: true, label: "Potential wash" },
  ],
  writeup: `## Coulomb's law in the plane

A point charge $q_i$ at $\\mathbf{r}_i$ produces

$$
\\mathbf{E}(\\mathbf{r}) = k \\sum_i q_i \\frac{\\mathbf{r}-\\mathbf{r}_i}{|\\mathbf{r}-\\mathbf{r}_i|^3},
\\qquad
V(\\mathbf{r}) = k \\sum_i \\frac{q_i}{|\\mathbf{r}-\\mathbf{r}_i|},
$$

with $\\mathbf{E} = -\\nabla V$ (Griffiths, *Introduction to Electrodynamics*, Ch. 2 and 3). Superposition is linear, which is why the dipole, the quadrupole, and the “two positives” preset are all the same code with different $q_i$.

Equipotentials are the level sets of $V$. Field lines (here sampled as arrows) are everywhere orthogonal to them, and they emanate from positive charge and terminate on negative charge. We plot $k=1$ units — the shape of the field does not care about $1/(4\\pi\\varepsilon_0)$.

A test particle of charge $q$ and mass $m$ obeys $m\\ddot{\\mathbf{r}} = q\\,\\mathbf{E}(\\mathbf{r})$. In a *static* field its energy $E = \\tfrac12 m v^2 + q V$ is conserved, which is why the plot on the right is a verdict on the integrator. Softening replaces $r^2$ with $r^2 + \\varepsilon^2$ so the force stays finite if you drag a source onto the particle; it is a numerical courtesy, not physics.

### What to try

- Drag the charges. Equipotentials recompute; the wash is $V$ itself, sage → parchment → rose.
- The dipole: far away the field should fall faster than a monopole (like $1/r^3$). The quadrupole falls faster still.
- Two positives: a saddle appears on the midline. Park the test mass near it and watch it decide.
- Flip the test charge $q$. Trajectories reverse their attitude toward each source.

### What the integrator changes

Near a source the field is stiff. Explicit Euler will typically blow the particle out; Verlet and RK4 hold energy much longer. RK45 will drop $\\Delta t$ automatically as you graze a charge — that is what adaptive means. Softening is doing some of the same job: it caps the stiffness.

### References

- Griffiths, D. J. *Introduction to Electrodynamics*. 4th ed. Cambridge. Ch. 2–3.
- Purcell, E. M. & Morin, D. J. *Electricity and Magnetism*. 3rd ed. Cambridge. Ch. 1–3.
`,
};
