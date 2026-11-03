import { fillBackground, type Palette } from "../core/canvas.ts";
import { drawDisc, drawSpring } from "../core/draw.ts";
import { drawPlot, RingSeries } from "../core/plot.ts";
import {
  COUPLED_DEFAULTS,
  coupledAntisymmetricMode,
  coupledEnergy,
  coupledNormalFrequencies,
  coupledSymmetricMode,
  coupledSystem,
  type CoupledParams,
} from "../physics/coupled.ts";
import { Integrable } from "./common.ts";
import { num, str, type Hud, type ParamValue, type SimFrame, type SimMeta, type Simulation } from "./types.ts";

export class CoupledSim implements Simulation {
  readonly meta: SimMeta = META;
  private pal!: Palette;
  private p: CoupledParams = { ...COUPLED_DEFAULTS };
  private body!: Integrable;
  private x1!: RingSeries;
  private x2!: RingSeries;
  private E0 = 0;
  private mode = "beat";

  reset(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.pal = frame.palette;
    this.rebuild(params, frame);
  }

  apply(_params: Record<string, ParamValue>, frame: SimFrame): void {
    this.pal = frame.palette;
    if (this.x1) {
      this.x1.color = this.pal.brass;
      this.x2.color = this.pal.sky;
    }
  }

  private rebuild(params: Record<string, ParamValue>, frame: SimFrame): void {
    this.p = {
      m1: num(params, "m1", 1),
      m2: num(params, "m2", 1),
      kLeft: num(params, "k", 1),
      kRight: num(params, "k", 1),
      kCoupling: num(params, "kc", 1),
    };
    this.mode = str(params, "mode", "beat");
    this.body = new Integrable(coupledSystem(this.p), frame.method);
    if (this.mode === "sym") coupledSymmetricMode(this.p, 0.45, this.body.curr);
    else if (this.mode === "anti") coupledAntisymmetricMode(this.p, 0.45, this.body.curr);
    else this.body.curr.set([0.5, 0], [0, 0], 0);
    this.body.prev.copyFrom(this.body.curr);
    this.body.draw.copyFrom(this.body.curr);
    this.x1 = new RingSeries(900, this.pal.brass, "x₁");
    this.x2 = new RingSeries(900, this.pal.sky, "x₂");
    this.E0 = coupledEnergy(this.p, this.body.curr.q, this.body.curr.v);
    this.sample();
  }

  advance(steps: number, dt: number): void {
    this.body.advance(steps, dt, () => this.sample());
  }

  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
    fillBackground(ctx, this.pal, w, h);
    this.body.interpolate(alpha);
    const q = this.body.draw.q;
    const y = h * 0.55;
    const wallL = w * 0.1;
    const wallR = w * 0.9;
    const rest1 = w * 0.37;
    const rest2 = w * 0.63;
    const scale = Math.min(w, h) * 0.22;
    const x1 = rest1 + q[0] * scale;
    const x2 = rest2 + q[1] * scale;

    ctx.strokeStyle = this.pal.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wallL, y - 28);
    ctx.lineTo(wallL, y + 28);
    ctx.moveTo(wallR, y - 28);
    ctx.lineTo(wallR, y + 28);
    ctx.stroke();

    ctx.strokeStyle = this.pal.muted;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(wallL, y);
    ctx.lineTo(wallR, y);
    ctx.stroke();
    ctx.setLineDash([]);

    drawSpring(ctx, wallL, y, x1 - 16, y, 8, 7, this.pal.muted, 1.4);
    drawSpring(ctx, x1 + 16, y, x2 - 16, y, 7, 7, this.pal.brass, 1.4);
    drawSpring(ctx, x2 + 16, y, wallR, y, 8, 7, this.pal.muted, 1.4);
    drawDisc(ctx, x1, y, 16, this.pal.paper, this.pal.brass);
    drawDisc(ctx, x2, y, 16, this.pal.paper, this.pal.sky);
    ctx.fillStyle = this.pal.muted;
    ctx.font = "500 11px 'Source Sans 3', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("m₁", x1, y);
    ctx.fillText("m₂", x2, y);
  }

  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    drawPlot(ctx, w, h, this.pal, [this.x1, this.x2], {
      title: "Displacements from equilibrium",
      xLabel: "t",
      yLabel: "x",
    });
  }

  plotCaption(): string {
    return "x₁(t), x₂(t)";
  }

  energy(): number {
    return coupledEnergy(this.p, this.body.curr.q, this.body.curr.v);
  }

  readout(): string {
    const s = this.body.curr;
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    const { slow, fast } = coupledNormalFrequencies(this.p);
    return `t = ${s.t.toFixed(2)}  ·  ΔE/E = ${dE.toExponential(1)}  ·  T₋ = ${(2 * Math.PI / slow).toFixed(2)}  ·  T₊ = ${(2 * Math.PI / fast).toFixed(2)}`;
  }

  hud(): Hud {
    const s = this.body.curr;
    const E = this.energy();
    const dE = this.E0 !== 0 ? (E - this.E0) / Math.abs(this.E0) : 0;
    const { slow, fast } = coupledNormalFrequencies(this.p);
    return {
      primary: [
        { label: "T₋", value: ((2 * Math.PI) / slow).toFixed(2) },
        { label: "T₊", value: ((2 * Math.PI) / fast).toFixed(2) },
      ],
      extra: [
        { label: "t", value: s.t.toFixed(2) },
        { label: "ΔE/E", value: dE.toExponential(1) },
      ],
    };
  }

  private sample(): void {
    const s = this.body.curr;
    this.x1.push(s.t, s.q[0]);
    this.x2.push(s.t, s.q[1]);
  }
}

const META: SimMeta = {
  id: "coupled",
  number: "03",
  title: "Coupled oscillators",
  kicker: "Normal modes",
  tagline: "Two masses, three springs, and the frequencies you can hear.",
  dt: 0.008,
  defaults: { m1: 1, m2: 1, k: 1, kc: 1, mode: "beat" },
  controls: [
    { key: "k", kind: "range", label: "Wall spring k", min: 0.2, max: 4, step: 0.05 },
    { key: "kc", kind: "range", label: "Coupling kc", min: 0.05, max: 4, step: 0.05 },
    { key: "m1", kind: "range", label: "Mass m₁", min: 0.4, max: 3, step: 0.1 },
    { key: "m2", kind: "range", label: "Mass m₂", min: 0.4, max: 3, step: 0.1 },
    {
      key: "mode",
      kind: "select",
      label: "Initial condition",
      options: [
        { value: "beat", label: "Beat (only m₁ displaced)" },
        { value: "sym", label: "Slow eigenmode" },
        { value: "anti", label: "Fast eigenmode" },
      ],
    },
  ],
  writeup: `## Normal modes of a linear chain

Two equal masses $m$ and three springs — wall, coupling $k_c$, wall, with wall constants $k$ — have equations

$$
m\\ddot x_1 = -(k+k_c)x_1 + k_c x_2,
\\qquad
m\\ddot x_2 = k_c x_1 - (k+k_c)x_2,
$$

where $x_i$ is the displacement from equilibrium. Superposition of the two normal modes solves the system exactly (Taylor, Ch. 1; any first course in coupled oscillations).

The **symmetric** mode $x_1=x_2$ stretches only the wall springs:

$$
\\omega_- = \\sqrt{k/m}.
$$

The **antisymmetric** mode $x_1=-x_2$ also squeezes the coupler:

$$
\\omega_+ = \\sqrt{(k+2k_c)/m}.
$$

Displace only the left mass and you excite both modes at once. The visible motion is a *beat*: energy sloshes from one mass to the other at $|\\omega_+-\\omega_-|$.

The quadratic energy

$$
E = \\tfrac12 m(\\dot x_1^2+\\dot x_2^2) + \\tfrac12 k(x_1^2+x_2^2) + \\tfrac12 k_c(x_1-x_2)^2
$$

is conserved by the true flow and is a sharp test of the integrator.

### What to try

- Choose **slow eigenmode**. For equal masses the coupling spring never changes length.
- Choose **fast eigenmode**. For equal masses they oppose at $\\omega_+$.
- Choose **beat** and lower $k_c$. The transfer of motion becomes slow and obvious.
- Mismatch $m_1$ and $m_2$: the HUD still shows the true $\\omega_\\pm$ from $\\det(K-\\omega^2 M)=0$, and the mode presets use those eigenvectors, so each mass still locks to a single frequency.

### What the integrator changes

This is a linear Hamiltonian system, so Verlet and symplectic Euler should hold $E$ for a very long time even with a coarse $\\Delta t$. Explicit Euler will make the oscillations grow. Stiff springs (large $k$) force a smaller step — or an adaptive RK45 — because the highest frequency is $\\omega_+$.

### References

- Taylor, J. R. *Classical Mechanics*. University Science Books. Ch. 1.
- French, A. P. *Vibrations and Waves*. Norton. Ch. 5.
`,
};
