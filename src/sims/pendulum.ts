import { fillBackground, type Palette } from "../core/canvas.ts";
import { drawDisc, lerpAngle } from "../core/draw.ts";
import { wrapPi, wrapTwoPi } from "../core/math.ts";
import { drawPlot, RingSeries } from "../core/plot.ts";
import { interpolateSection } from "../core/strobe.ts";
import { Trail2D } from "../core/trail.ts";
import {
  PENDULUM_CHAOS,
  pendulumEnergy,
  pendulumSystem,
  type PendulumParams,
} from "../physics/pendulum.ts";
import { Integrable } from "./common.ts";
import { bool, num, type ParamValue, type SimFrame, type SimMeta, type Simulation } from "./types.ts";

export class PendulumSim implements Simulation {
  readonly meta: SimMeta = META;
  private pal!: Palette;
  private reduced = false;
  private p: PendulumParams = { ...PENDULUM_CHAOS, driveAmp: 0, gamma: 0 };
  private body!: Integrable;
  private trail!: Trail2D;
  private energySeries!: RingSeries;
  private phase!: RingSeries;
  private poincare!: RingSeries;
  private prevT = 0;
  private prevTh = 0;
  private prevOm = 0;
  private hasPrev = false;
  private plot: "energy" | "phase" | "poincare" = "phase";
  private E0 = 0;

  reset(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(params, frame);
    this.p = {
      g: 1,
      L: num(params, "L", 1),
      gamma: num(params, "gamma", 0.15),
      driveAmp: num(params, "A", 0),
      driveFreq: num(params, "w", 2 / 3),
      linear: bool(params, "linear", false),
    };
    const th0 = num(params, "th0", 1.2);
    this.body = new Integrable(pendulumSystem(this.p), frame.method);
    this.body.seed([th0], [0], 0);
    this.trail = new Trail2D(this.reduced ? 40 : 180);
    this.energySeries = new RingSeries(this.reduced ? 200 : 800, this.pal.brass, "E");
    this.phase = new RingSeries(this.reduced ? 300 : 1400, this.pal.sky, "phase");
    this.poincare = new RingSeries(2000, this.pal.rose, "Poincaré");
    this.E0 = pendulumEnergy(this.p, th0, 0);
    this.hasPrev = false;
    this.sample(this.body.curr.q[0], this.body.curr.v[0], 0);
  }

  apply(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.applyView(params, frame);
    this.recolor();
  }

  private applyView(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.pal = frame.palette;
    this.reduced = frame.reducedMotion;
    this.plot = parsePlot(params.plot);
  }

  private recolor(): void {
    if (!this.energySeries) return;
    this.energySeries.color = this.pal.brass;
    this.phase.color = this.pal.sky;
    this.poincare.color = this.pal.rose;
  }

  advance(steps: number, dt: number): void {
    this.body.advance(steps, dt, (s) => {
      this.sample(s.q[0], s.v[0], s.t);
    });
  }

  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
    fillBackground(ctx, this.pal, w, h);
    this.body.interpolate(alpha);
    const th = lerpAngle(this.body.prev.q[0], this.body.curr.q[0], alpha);
    const L = this.p.L;
    const scale = (0.36 * Math.min(w, h)) / Math.max(L, 0.4);
    const px = w / 2;
    const py = h * 0.28;
    const bobX = px + scale * L * Math.sin(th);
    const bobY = py + scale * L * Math.cos(th);

    if (this.p.driveAmp > 0) {
      const phase = wrapTwoPi(this.p.driveFreq * this.body.draw.t);
      ctx.strokeStyle = this.pal.line;
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = this.pal.rose;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 16 * Math.cos(phase), py + 16 * Math.sin(phase));
      ctx.stroke();
    }

    ctx.strokeStyle = this.pal.muted;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();
    drawDisc(ctx, px, py, 4, this.pal.brass);
    drawDisc(ctx, bobX, bobY, 14, this.pal.paper, this.pal.brass);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    this.trail.stroke(ctx, this.pal.sky, 1.5 / scale, !this.reduced);
    ctx.restore();
  }

  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.plot === "energy") {
      drawPlot(ctx, w, h, this.pal, [this.energySeries], {
        title: "Relative energy error",
        xLabel: "t",
        yLabel: "(E − E₀)/|E₀|",
      });
    } else if (this.plot === "poincare") {
      drawPlot(ctx, w, h, this.pal, [this.poincare], {
        title: "Poincaré section  (θ, ω) at drive period",
        xLabel: "θ",
        yLabel: "ω",
        scatter: true,
      });
    } else {
      drawPlot(ctx, w, h, this.pal, [this.phase], {
        title: "Phase portrait  (θ, ω)",
        xLabel: "θ",
        yLabel: "ω",
        xWrap: Math.PI * 2,
      });
    }
  }

  plotCaption(): string {
    return this.plot === "poincare"
      ? "Poincaré section"
      : this.plot === "energy"
        ? "Relative energy error"
        : "Phase portrait";
  }

  energy(): number {
    return pendulumEnergy(this.p, this.body.curr.q[0], this.body.curr.v[0]);
  }

  readout(): string {
    const s = this.body.curr;
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    return `t = ${s.t.toFixed(2)}  ·  θ = ${s.q[0].toFixed(2)}  ·  ω = ${s.v[0].toFixed(2)}  ·  E = ${E.toFixed(3)}  ·  ΔE/E = ${dE.toExponential(1)}`;
  }

  private sample(th: number, om: number, t: number): void {
    this.phase.push(wrapPi(th), om);
    this.trail.push(this.p.L * Math.sin(th), this.p.L * Math.cos(th));
    const E = pendulumEnergy(this.p, th, om);
    this.energySeries.push(t, this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0);
    if (this.p.driveAmp > 0 && this.p.driveFreq > 0) {
      const T = (2 * Math.PI) / this.p.driveFreq;
      if (this.hasPrev) {
        for (const hit of interpolateSection(this.prevT, this.prevTh, this.prevOm, t, th, om, T)) {
          this.poincare.push(wrapPi(hit.th), hit.om);
        }
      }
      this.prevT = t;
      this.prevTh = th;
      this.prevOm = om;
      this.hasPrev = true;
    }
  }
}

function parsePlot(v: ParamValue | undefined): "energy" | "phase" | "poincare" {
  if (v === "energy" || v === "poincare" || v === "phase") return v;
  return "phase";
}

const META: SimMeta = {
  id: "pendulum",
  number: "02",
  title: "Damped driven pendulum",
  kicker: "Phase space & chaos",
  tagline: "Limit cycles, strange attractors, and a Poincaré section.",
  dt: 0.01,
  method: "rk4",
  defaults: { L: 1, gamma: 0.15, A: 0, w: 0.6667, th0: 1.2, linear: false, plot: "phase" },
  controls: [
    { key: "th0", kind: "range", label: "Initial angle", min: 0, max: 3.14, step: 0.01, unit: "rad" },
    { key: "L", kind: "range", label: "Length", min: 0.4, max: 2, step: 0.05 },
    { key: "gamma", kind: "range", label: "Damping γ", min: 0, max: 1.2, step: 0.01 },
    { key: "A", kind: "range", label: "Drive amplitude", min: 0, max: 1.8, step: 0.01 },
    { key: "w", kind: "range", label: "Drive ω", min: 0.2, max: 2, step: 0.01 },
    { key: "linear", kind: "toggle", label: "Small-angle (sin θ → θ)" },
    {
      key: "plot",
      kind: "select",
      cosmetic: true,
      label: "Plot",
      options: [
        { value: "phase", label: "Phase portrait" },
        { value: "energy", label: "Energy" },
        { value: "poincare", label: "Poincaré section" },
      ],
    },
  ],
  writeup: `## A pendulum that is not simple

Measuring θ from the downward vertical, the driven damped pendulum is

$$
\\ddot\\theta + \\gamma\\dot\\theta + \\frac{g}{L}\\sin\\theta = A\\cos(\\omega_d t).
$$

With $A=\\gamma=0$ the system is Hamiltonian. The energy

$$
E = \\tfrac12 (L\\dot\\theta)^2 + g L\\,(1-\\cos\\theta)
$$

is conserved, and the phase plane $(\\theta,\\omega)$ is foliated by closed curves around the origin (libration) and wavy lines (rotation over the top). The small-angle replacement $\\sin\\theta\\to\\theta$ recovers simple harmonic motion with period $T=2\\pi\\sqrt{L/g}$ (Taylor, Ch. 1 and 4).

Damping $\\gamma>0$ dissipates energy: trajectories spiral into the hanging rest point. A periodic drive can balance that loss. Then one finds **limit cycles** — isolated periodic orbits that attract a basin of initial conditions.

Turn the drive up further and the attractor can become chaotic. A standard dimensionless example is $g/L=1$, $\\gamma=1/2$, $A=1.15$, $\\omega_d=2/3$ (see Baker & Gollub, or Strogatz, *Nonlinear Dynamics and Chaos*). The Poincaré section samples $(\\theta,\\omega)$ once per drive period; a periodic orbit collapses to a finite set of points, a chaotic attractor fills a fractal cloud.

### What to try

- Start with $A=0$, $\\gamma=0$: a closed loop in the phase portrait, flat energy.
- Add a little damping: the loop spirals in and $E$ decays.
- Set $\\gamma=0.5$, $A=1.15$, $\\omega_d\\approx 0.667$ and switch the plot to the Poincaré section. Let it run. The cloud is the attractor.
- Toggle **small-angle**. Chaos disappears — the linear pendulum cannot fold phase space.

### What the integrator changes

Velocity-dependent damping means Verlet is no longer strictly symplectic (it assumes $a=a(q)$). RK4 or RK45 are the honest choices here. A step that is a noticeable fraction of the drive period will smear the Poincaré section; drop $\\Delta t$ until the cloud is stable.

### References

- Taylor, J. R. *Classical Mechanics*. Ch. 4, 12.
- Strogatz, S. H. *Nonlinear Dynamics and Chaos*. Westview.
- Baker, G. L. & Gollub, J. P. *Chaotic Dynamics: An Introduction*. Cambridge.
`,
};
