import { fillBackground, type Palette } from "../core/canvas.ts";
import { drawDisc, worldToScreen } from "../core/draw.ts";
import { drawPlot, RingSeries } from "../core/plot.ts";
import { Trail2D } from "../core/trail.ts";
import { METHOD_LIST } from "../integrators/step.ts";
import type { MethodId } from "../integrators/types.ts";
import {
  KEPLER_DEFAULTS,
  keplerAngularMomentum,
  keplerEnergy,
  keplerInitialState,
  keplerInnerSteps,
  keplerPeriod,
  keplerSystem,
  type KeplerParams,
} from "../physics/kepler.ts";
import { Integrable, massRadius } from "./common.ts";
import {
  bool,
  num,
  type SimFrame,
  type SimMeta,
  type Simulation,
  type ParamValue,
  type Hud,
} from "./types.ts";

const COMPARE_IDS: MethodId[] = ["euler", "symplectic-euler", "verlet", "rk4"];
const COMPARE_COLORS: Record<string, keyof Palette> = {
  euler: "rose",
  "symplectic-euler": "brass",
  verlet: "sage",
  rk4: "sky",
};

export class KeplerSim implements Simulation {
  readonly meta: SimMeta = META;
  private pal!: Palette;
  private reduced = false;
  private compare = true;
  private params: KeplerParams = { ...KEPLER_DEFAULTS };
  private bodies: Integrable[] = [];
  private ids: MethodId[] = ["verlet"];
  private trails: Trail2D[] = [];
  private series: RingSeries[] = [];
  private E0 = 0;
  private L0 = 0;
  private sampleAcc = 0;

  reset(p: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(frame);
    this.rebuild(p, frame);
  }

  apply(_p: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(frame);
    this.recolor();
  }

  private applyView(frame: SimFrame): void {
    this.pal = frame.palette;
    this.reduced = frame.reducedMotion;
  }

  private rebuild(p: Record<string, ParamValue>, frame: SimFrame): void {
    this.compare = bool(p, "cmp", true);
    this.params = {
      G: 1,
      m1: num(p, "m1", 1),
      m2: num(p, "m2", 1),
      a: num(p, "a", 1),
      e: num(p, "e", 0.6),
      softening2: 1e-12,
    };
    this.ids = this.compare ? COMPARE_IDS : [frame.method];
    this.bodies = this.ids.map((id) => {
      const b = new Integrable(keplerSystem(this.params), id);
      keplerInitialState(this.params, b.curr);
      b.prev.copyFrom(b.curr);
      b.draw.copyFrom(b.curr);
      return b;
    });
    const cap = this.reduced ? 80 : 500;
    this.trails = this.ids.map(() => new Trail2D(cap));
    this.series = this.ids.map((id) => {
      const key = COMPARE_COLORS[id] ?? "brass";
      const color = this.pal[key];
      const label = METHOD_LIST.find((m) => m.id === id)?.shortName ?? id;
      return new RingSeries(this.reduced ? 200 : 700, color, label);
    });
    const y = this.bodies[0].curr;
    this.E0 = keplerEnergy(this.params, y.q, y.v);
    this.L0 = keplerAngularMomentum(this.params, y.q, y.v);
    this.sampleAcc = 0;
    this.pushTrails();
    this.sampleEnergies();
  }

  private recolor(): void {
    for (let i = 0; i < this.series.length; i++) {
      const id = this.ids[i];
      const key = COMPARE_COLORS[id] ?? "brass";
      this.series[i].color = this.pal[key];
    }
  }

  advance(steps: number, dt: number): void {
    if (steps <= 0) return;
    for (let s = 0; s < steps; s++) {
      const last = s === steps - 1;
      for (const body of this.bodies) {
        const q = body.curr.q;
        const r = Math.hypot(q[2] - q[0], q[3] - q[1]);
        const n = keplerInnerSteps(this.params, r, dt);
        const h = dt / n;
        if (last) body.prev.copyFrom(body.curr);
        body.stepMany(n, h);
      }
    }
    this.sampleAcc += steps;
    if (this.sampleAcc >= 2) {
      this.sampleEnergies();
      this.sampleAcc = 0;
    }
    this.pushTrails();
  }

  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
    fillBackground(ctx, this.pal, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const span = this.params.a * (1 + this.params.e) * 2.5;
    const scale = (0.46 * Math.min(w, h)) / Math.max(span, 0.4);

    drawDisc(ctx, cx, cy, 2.4, this.pal.muted);

    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].interpolate(alpha);
      const q = this.bodies[i].draw.q;
      const color = this.series[i].color;
      const trail = this.trails[i];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, -scale);
      ctx.lineCap = "round";
      const focus = !this.compare || i === this.readoutIndex();
      ctx.globalAlpha = this.compare ? (focus ? 0.7 : 0.32) : 1;
      trail.stroke(ctx, color, (this.compare ? (focus ? 1.1 : 0.7) : 1.4) / scale, !this.reduced && !this.compare);
      ctx.restore();

      const p1 = worldToScreen(q[0], q[1], cx, cy, scale);
      const p2 = worldToScreen(q[2], q[3], cx, cy, scale);
      const r1 = massRadius(this.params.m1, 1, 9);
      const r2 = massRadius(this.params.m2, 1, 9);
      if (!this.compare || i === this.bodies.length - 1) {
        drawDisc(ctx, p1.x, p1.y, r1, this.pal.paper, this.pal.brass);
        drawDisc(ctx, p2.x, p2.y, r2, color, this.pal.ink);
      } else {
        drawDisc(ctx, p2.x, p2.y, 3.2, color);
      }
    }
  }

  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    drawPlot(ctx, w, h, this.pal, this.series, {
      title: this.plotCaption(),
      xLabel: "t",
      yLabel: "(E − E₀)/|E₀|",
    });
  }

  plotCaption(): string {
    return this.compare ? "Relative energy error by integrator" : "Relative energy error";
  }

  energy(): number {
    const s = this.bodies[this.readoutIndex()].curr;
    return keplerEnergy(this.params, s.q, s.v);
  }

  readout(): string {
    const T = keplerPeriod(this.params);
    const t = this.bodies[0]?.curr.t ?? 0;
    const parts = [`t = ${t.toFixed(2)}`, `T = ${T.toFixed(2)}`];
    if (this.compare) {
      for (const id of ["verlet", "euler"] as const) {
        const i = this.ids.indexOf(id);
        if (i < 0) continue;
        const dE = this.relEnergy(i);
        const name = id === "verlet" ? "Verlet" : "Euler";
        parts.push(`${name} ΔE/E = ${fmt(dE)}`);
      }
    } else {
      const dE = this.relEnergy(0);
      const dL = this.relAngular(0);
      parts.push(`ΔE/E = ${fmt(dE)}`, `ΔL/L = ${fmt(dL)}`);
    }
    return parts.join("  ·  ");
  }

  hud(): Hud {
    const t = this.bodies[0]?.curr.t ?? 0;
    const extra = [
      { label: "t", value: t.toFixed(2) },
      { label: "T", value: keplerPeriod(this.params).toFixed(2) },
    ];
    if (this.compare) {
      const primary: Hud["primary"] = [];
      const vi = this.ids.indexOf("verlet");
      const ei = this.ids.indexOf("euler");
      if (vi >= 0) primary.push({ label: "Verlet ΔE/E", value: fmt(this.relEnergy(vi)) });
      if (ei >= 0) primary.push({ label: "Euler ΔE/E", value: fmt(this.relEnergy(ei)) });
      return { primary, extra };
    }
    return {
      primary: [
        { label: "ΔE/E", value: fmt(this.relEnergy(0)) },
        { label: "ΔL/L", value: fmt(this.relAngular(0)) },
      ],
      extra,
    };
  }

  private readoutIndex(): number {
    const i = this.ids.indexOf("verlet");
    return i >= 0 ? i : 0;
  }

  private relEnergy(i: number): number {
    const s = this.bodies[i].curr;
    const E = keplerEnergy(this.params, s.q, s.v);
    return this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
  }

  private relAngular(i: number): number {
    const s = this.bodies[i].curr;
    const L = keplerAngularMomentum(this.params, s.q, s.v);
    return this.L0 !== 0 ? (L - this.L0) / Math.abs(this.L0) : 0;
  }

  private pushTrails(): void {
    for (let i = 0; i < this.bodies.length; i++) {
      const q = this.bodies[i].curr.q;
      this.trails[i].push(q[2], q[3]);
    }
  }

  private sampleEnergies(): void {
    for (let i = 0; i < this.bodies.length; i++) {
      const s = this.bodies[i].curr;
      const E = keplerEnergy(this.params, s.q, s.v);
      const rel = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
      this.series[i].push(s.t, rel);
    }
  }
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a > 0 && a < 1e-3) return x.toExponential(1);
  return x.toFixed(4);
}

const META: SimMeta = {
  id: "kepler",
  number: "01",
  title: "Kepler orbits",
  kicker: "Two-body gravity",
  tagline: "Ellipses, energy drift, and why symplectic integrators exist.",
  dt: 0.008,
  defaults: { e: 0.6, m1: 1, m2: 1, a: 1, cmp: true },
  controls: [
    { key: "e", kind: "range", label: "Eccentricity", min: 0, max: 0.92, step: 0.01 },
    { key: "m1", kind: "range", label: "Mass m₁", min: 0.3, max: 4, step: 0.1 },
    { key: "m2", kind: "range", label: "Mass m₂", min: 0.3, max: 4, step: 0.1 },
    { key: "a", kind: "range", label: "Semi-major axis", min: 0.5, max: 1.8, step: 0.05 },
    { key: "cmp", kind: "toggle", label: "Compare integrators" },
  ],
  writeup: `## Two-body gravity

Newton's inverse-square law for two point masses is

$$
\\mathbf{a}_1 = G m_2 \\frac{\\mathbf{r}_2-\\mathbf{r}_1}{|\\mathbf{r}_2-\\mathbf{r}_1|^3},
\\qquad
\\mathbf{a}_2 = G m_1 \\frac{\\mathbf{r}_1-\\mathbf{r}_2}{|\\mathbf{r}_2-\\mathbf{r}_1|^3}.
$$

The centre of mass moves uniformly. In the CM frame the relative vector $\\mathbf{r} = \\mathbf{r}_2-\\mathbf{r}_1$ obeys the Kepler problem

$$
\\ddot{\\mathbf{r}} = -G(m_1+m_2)\\frac{\\mathbf{r}}{r^3},
$$

with conserved energy $E = \\tfrac12 \\mu |\\dot{\\mathbf{r}}|^2 - G m_1 m_2 / r$ and angular momentum $\\mathbf{L} = \\mu \\, \\mathbf{r}\\times\\dot{\\mathbf{r}}$, where $\\mu = m_1 m_2 / (m_1+m_2)$ is the reduced mass. Bound orbits ($E<0$) are ellipses with the CM at the barycentre — equivalent to a focus of the relative ellipse (Taylor, *Classical Mechanics*, Ch. 8).

The vis-viva relation $v^2 = G(m_1+m_2)\\,(2/r - 1/a)$ and Kepler's third law $T = 2\\pi\\sqrt{a^3 / G(m_1+m_2)}$ are identities of the exact flow. A numerical method that does not respect the Hamiltonian will violate them secularly.

### What to try

- Turn **Compare integrators** on and let one period elapse. Explicit Euler (rose) walks off the ellipse; Verlet (sage) and RK4 (sky) hold it.
- Raise the eccentricity toward $0.92$. Periapsis is a stiff moment: the force spikes, and a fixed step that looked fine on a circle starts to lie. The playground splits $\\Delta t$ into equal inner steps while $r$ is small, so Verlet stays honest at the default step.
- Watch $\\Delta E/E$ in the plot, not just the picture. Geometry can look plausible while the energy is already ruined.

### What the integrator changes

- **Explicit Euler** is first-order and not symplectic. On this problem it typically *pumps* energy; the orbit spirals out.
- **Semi-implicit Euler** is still first-order, but symplectic: the energy error oscillates instead of running away, and the orbit stays near a nearby ellipse.
- **Velocity Verlet** is the workhorse of gravitational N-body. Second-order, symplectic for $a=a(q)$, outstanding long-term energy behaviour.
- **RK4** is accurate over short times (global error $\\mathcal{O}(\\Delta t^4)$) but dissipates or pumps energy slowly — a secular drift.
- **RK45** (Dormand–Prince) adapts $\\Delta t$ to a local error tolerance. Useful at high $e$, not structure-preserving.

Geometric integration is the name of this distinction: see Hairer, Lubich & Wanner, *Geometric Numerical Integration*.

### References

- Taylor, J. R. *Classical Mechanics*. University Science Books, 2005. Ch. 8.
- Goldstein, H., Poole, C. & Safko, J. *Classical Mechanics*. 3rd ed. Ch. 3.
- Hairer, E., Lubich, C. & Wanner, G. *Geometric Numerical Integration*. Springer.
`,
};
