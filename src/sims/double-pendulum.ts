import { fillBackground, type Palette } from "../core/canvas.ts";
import { drawDisc, lerpAngle } from "../core/draw.ts";
import { drawPlot, RingSeries } from "../core/plot.ts";
import { Trail2D } from "../core/trail.ts";
import {
  DOUBLE_PENDULUM_DEFAULTS,
  doublePendulumCartesian,
  doublePendulumEnergy,
  doublePendulumSystem,
  type DoublePendulumParams,
} from "../physics/double-pendulum.ts";
import { Integrable } from "./common.ts";
import { num, type ParamValue, type SimFrame, type SimMeta, type Simulation } from "./types.ts";

export class DoublePendulumSim implements Simulation {
  readonly meta: SimMeta = META;
  private pal!: Palette;
  private reduced = false;
  private p: DoublePendulumParams = { ...DOUBLE_PENDULUM_DEFAULTS };
  private a!: Integrable;
  private b!: Integrable;
  private trailA!: Trail2D;
  private trailB!: Trail2D;
  private energySeries!: RingSeries;
  private sep!: RingSeries;
  private E0 = 0;
  private plot: "sep" | "energy" = "sep";

  reset(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.apply(params, frame);
  }

  apply(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.pal = frame.palette;
    this.reduced = frame.reducedMotion;
    this.plot = params.plot === "energy" ? "energy" : "sep";
    this.p = {
      g: 9.8,
      m1: num(params, "m1", 1),
      m2: num(params, "m2", 1),
      l1: num(params, "l1", 1),
      l2: num(params, "l2", 1),
    };
    const th1 = num(params, "th1", 2.0);
    const th2 = num(params, "th2", 2.0);
    const dth = num(params, "dth", 1e-3);
    this.a = new Integrable(doublePendulumSystem(this.p), frame.method);
    this.b = new Integrable(doublePendulumSystem(this.p), frame.method);
    this.a.seed([th1, th2], [0, 0], 0);
    this.b.seed([th1, th2 + dth], [0, 0], 0);
    this.trailA = new Trail2D(this.reduced ? 40 : 220);
    this.trailB = new Trail2D(this.reduced ? 40 : 220);
    this.energySeries = new RingSeries(800, this.pal.brass, "E");
    this.sep = new RingSeries(800, this.pal.rose, "|Δθ|");
    this.E0 = doublePendulumEnergy(this.p, this.a.curr.q, this.a.curr.v);
    this.sample();
  }

  advance(steps: number, dt: number): void {
    this.a.advance(steps, dt);
    this.b.advance(steps, dt);
    this.sample();
  }

  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
    fillBackground(ctx, this.pal, w, h);
    this.a.interpolate(alpha);
    this.b.interpolate(alpha);
    const scale = (0.28 * Math.min(w, h)) / Math.max(this.p.l1 + this.p.l2, 0.5);
    const px = w / 2;
    const py = h * 0.22;
    this.drawOne(ctx, this.a, alpha, px, py, scale, this.pal.brass, this.trailA);
    this.drawOne(ctx, this.b, alpha, px, py, scale, this.pal.sky, this.trailB);
    drawDisc(ctx, px, py, 4, this.pal.paper, this.pal.muted);
  }

  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.plot === "energy") {
      drawPlot(ctx, w, h, this.pal, [this.energySeries], {
        title: "Relative energy error of pendulum A",
        xLabel: "t",
        yLabel: "(E − E₀)/|E₀|",
      });
    } else {
      drawPlot(ctx, w, h, this.pal, [this.sep], {
        title: "Separation of twins  |Δθ|",
        xLabel: "t",
        yLabel: "|θᴬ − θᴮ|",
      });
    }
  }

  plotCaption(): string {
    return this.plot === "energy" ? "Relative energy error" : "Sensitivity |Δθ|";
  }

  energy(): number {
    return doublePendulumEnergy(this.p, this.a.curr.q, this.a.curr.v);
  }

  readout(): string {
    const s = this.a.curr;
    const d = Math.hypot(s.q[0] - this.b.curr.q[0], s.q[1] - this.b.curr.q[1]);
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    return `t = ${s.t.toFixed(2)}  ·  |Δθ| = ${d.toFixed(3)}  ·  ΔE/E = ${dE.toExponential(1)}`;
  }

  private drawOne(
    ctx: CanvasRenderingContext2D,
    body: Integrable,
    alpha: number,
    px: number,
    py: number,
    scale: number,
    color: string,
    trail: Trail2D,
  ): void {
    const th1 = lerpAngle(body.prev.q[0], body.curr.q[0], alpha);
    const th2 = lerpAngle(body.prev.q[1], body.curr.q[1], alpha);
    const c = doublePendulumCartesian(this.p, th1, th2);
    const x1 = px + c.x1 * scale;
    const y1 = py - c.y1 * scale;
    const x2 = px + c.x2 * scale;
    const y2 = py - c.y2 * scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    drawDisc(ctx, x1, y1, 8, this.pal.paper, color);
    drawDisc(ctx, x2, y2, 11, color, this.pal.ink);
    trail.push(x2, y2);
    trail.stroke(ctx, color, 1.3, !this.reduced);
  }

  private sample(): void {
    const s = this.a.curr;
    const E = doublePendulumEnergy(this.p, s.q, s.v);
    this.energySeries.push(s.t, this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0);
    const d = Math.hypot(s.q[0] - this.b.curr.q[0], s.q[1] - this.b.curr.q[1]);
    this.sep.push(s.t, d);
  }
}

const META: SimMeta = {
  id: "double-pendulum",
  number: "04",
  title: "Double pendulum",
  kicker: "Sensitive dependence",
  tagline: "Two twins, a hair of a difference, and exponential goodbye.",
  dt: 0.002,
  defaults: { th1: 2, th2: 2, dth: 0.001, l1: 1, l2: 1, m1: 1, m2: 1, plot: "sep" },
  controls: [
    { key: "th1", kind: "range", label: "θ₁ (from down)", min: 0, max: 3.14, step: 0.01, unit: "rad" },
    { key: "th2", kind: "range", label: "θ₂ (from down)", min: 0, max: 3.14, step: 0.01, unit: "rad" },
    { key: "dth", kind: "range", label: "Twin offset Δθ", min: 0.0001, max: 0.05, step: 0.0001 },
    { key: "l1", kind: "range", label: "Length ℓ₁", min: 0.4, max: 1.6, step: 0.05 },
    { key: "l2", kind: "range", label: "Length ℓ₂", min: 0.4, max: 1.6, step: 0.05 },
    {
      key: "plot",
      kind: "select",
      label: "Plot",
      options: [
        { value: "sep", label: "Separation |Δθ|" },
        { value: "energy", label: "Energy" },
      ],
    },
  ],
  writeup: `## Two rods, one Lagrangian

A planar double pendulum with angles measured from the *downward* vertical has kinetic energy

$$
T = \\tfrac12(m_1+m_2)\\ell_1^2\\dot\\theta_1^2 + \\tfrac12 m_2\\ell_2^2\\dot\\theta_2^2 + m_2\\ell_1\\ell_2\\dot\\theta_1\\dot\\theta_2\\cos(\\theta_1-\\theta_2)
$$

and potential $V = -(m_1+m_2)g\\ell_1\\cos\\theta_1 - m_2 g\\ell_2\\cos\\theta_2$. The Euler–Lagrange equations are a coupled, nonlinear, conservative system (Taylor, Ch. 11; Goldstein, Ch. 1). Energy $E=T+V$ is an integral of the motion, and a numerical method that cannot hold $E$ is not to be trusted on the chaos that follows.

For small angles the system linearises to two normal modes. At large angles it is a textbook chaotic Hamiltonian system: nearby trajectories diverge exponentially until they are as far apart as the compact phase space allows. The rate is a Lyapunov exponent. This page simply *shows* it — two copies, identical except for a tiny $\\Delta\\theta$ on the lower bob.

### What to try

- Start near $\\theta_1=\\theta_2=0.4$. The twins stay together; the motion is quasi-periodic.
- Set both angles near $2$ rad and $\\Delta\\theta = 10^{-3}$. Watch $|\\Delta\\theta|$ in the plot. It stays tiny, then explodes.
- Switch the plot to energy. Verlet should hold $E$; Euler will not, and a dishonest energy is a dishonest Lyapunov story.
- Shrink $\\Delta t$. If the moment of divergence jumps around, the integrator was the chaos.

### What the integrator changes

This is a stiff-ish, nonlinear, conservative system. Verlet is the default. RK4 is accurate over short windows but will drift in $E$. Explicit Euler both drifts and can blow up when the bobs whip through the bottom. Adaptive RK45 will take tiny steps at those whip points — honest, but not symplectic.

### References

- Taylor, J. R. *Classical Mechanics*. Ch. 11.
- Goldstein, H., Poole, C. & Safko, J. *Classical Mechanics*. 3rd ed. Ch. 1, 11.
- Shinbrot, T. et al. “Chaos in a double pendulum.” *Am. J. Phys.* 60 (1992) 491.
`,
};
