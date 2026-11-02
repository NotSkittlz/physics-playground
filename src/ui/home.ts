import { HiDpiCanvas, readPalette } from "../core/canvas.ts";
import { reducedMotion } from "../core/theme.ts";
import { SIM_METAS, createSim } from "../sims/registry.ts";
import type { MethodId } from "../integrators/types.ts";

export function renderHome(root: HTMLElement): void {
  root.innerHTML = `
    <section class="home">
      <header class="masthead">
        <div class="kicker">v0.1 · classical mechanics</div>
        <h1>Physics <em>Playground</em></h1>
        <p class="lede">
          Interactive simulations in the browser, sitting on a small library of
          numerical integrators that we actually test. Built to be played with,
          and to be read.
        </p>
        <div class="byline">
          <span><strong>Lucas Guerra</strong></span>
          <span>UC Berkeley · Physics</span>
          <span>MIT License</span>
        </div>
      </header>
      <div class="card-grid" id="cards"></div>
      <footer class="home-foot">
        <span>Explicit Euler · symplectic Euler · velocity Verlet · RK4 · adaptive RK45</span>
        <span>No tracking, no backend, no paid APIs.</span>
      </footer>
    </section>
  `;

  const grid = root.querySelector("#cards") as HTMLElement;
  const pal = readPalette();
  const frame = {
    palette: pal,
    reducedMotion: reducedMotion(),
    method: "verlet" as MethodId,
    dt: 0.01,
  };

  for (const meta of SIM_METAS) {
    const a = document.createElement("a");
    a.className = "sim-card";
    a.href = `#/${meta.id}`;
    a.innerHTML = `
      <canvas width="640" height="264" aria-hidden="true"></canvas>
      <div class="body">
        <div class="num">${meta.number} / ${meta.kicker}</div>
        <h2>${meta.title}</h2>
        <p>${meta.tagline}</p>
      </div>
    `;
    grid.append(a);
    const canvas = a.querySelector("canvas")!;
    const view = new HiDpiCanvas(canvas);
    view.resize();
    const sim = createSim(meta.id);
    if (!sim) continue;
    sim.reset({ ...meta.defaults }, frame);
    if (!reducedMotion()) {
      sim.advance(40, 0.016);
    }
    sim.drawWorld(view.ctx, view.width, view.height, 1);
  }
}
