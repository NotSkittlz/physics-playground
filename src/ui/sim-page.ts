import { HiDpiCanvas, readPalette } from "../core/canvas.ts";
import { SimLoop, type LoopStats } from "../core/loop.ts";
import { coerceBool, coerceNumber, replaceHash } from "../core/url.ts";
import { renderWriteup } from "../core/writeup.ts";
import { reducedMotion } from "../core/theme.ts";
import { METHOD_LIST } from "../integrators/step.ts";
import { isMethodId, type MethodId } from "../integrators/types.ts";
import { createSim } from "../sims/registry.ts";
import type { ParamValue, SimMeta, Simulation } from "../sims/types.ts";

export interface SimPageHandle {
  destroy(): void;
  togglePlay(): void;
  reset(): void;
  setSpeed(mult: number): void;
  stats(): LoopStats | null;
}

const DEFAULT_DT = 0.008;
const DEFAULT_SPEED = 1;

export function mountSimPage(
  root: HTMLElement,
  meta: SimMeta,
  urlParams: Record<string, string>,
): SimPageHandle {
  const params: Record<string, ParamValue> = { ...meta.defaults, ...castParams(urlParams, meta) };
  let method: MethodId = isMethodId(urlParams.int ?? "")
    ? (urlParams.int as MethodId)
    : (meta.method ?? "verlet");
  let dt = coerceNumber(urlParams.dt, meta.dt ?? DEFAULT_DT);
  let speed = coerceNumber(urlParams.speed, DEFAULT_SPEED);
  let playing = coerceBool(urlParams.play, true);
  let latestStats: LoopStats | null = null;

  root.innerHTML = `
    <article class="sim-page">
      <header class="sim-head">
        <div>
          <a class="crumb" href="#/">← Playground</a>
          <h1>${meta.title}</h1>
          <p class="tag">${meta.tagline}</p>
        </div>
        <button type="button" class="btn" data-share>Copy link</button>
      </header>
      <div class="transport" id="transport"></div>
      <div class="stage">
        <div class="viewport">
          <canvas id="world" aria-label="${meta.title} animation"></canvas>
          <div class="readout" id="world-readout"></div>
        </div>
        <div class="plot-wrap">
          <canvas id="plot" aria-label="Live plot"></canvas>
          <div class="readout" id="plot-readout"></div>
        </div>
      </div>
      <div class="controls" id="controls"></div>
      <section class="writeup" id="writeup">${renderWriteup(meta.writeup)}</section>
    </article>
  `;

  const worldCanvas = new HiDpiCanvas(root.querySelector("#world") as HTMLCanvasElement);
  const plotCanvas = new HiDpiCanvas(root.querySelector("#plot") as HTMLCanvasElement);
  const worldReadout = root.querySelector("#world-readout") as HTMLElement;
  const plotReadout = root.querySelector("#plot-readout") as HTMLElement;
  const transport = root.querySelector("#transport") as HTMLElement;
  const controlsEl = root.querySelector("#controls") as HTMLElement;

  transport.innerHTML = `
    <button type="button" class="btn primary" data-play aria-pressed="${playing}">Pause</button>
    <button type="button" class="btn" data-reset>Reset</button>
    <div class="control" style="min-width:180px">
      <label for="int">Integrator</label>
      <select id="int">${METHOD_LIST.map(
        (m) => `<option value="${m.id}" ${m.id === method ? "selected" : ""}>${m.name}</option>`,
      ).join("")}</select>
    </div>
    <div class="control" style="min-width:160px">
      <label for="dt">Δt <span class="value" data-dt-val>${dt.toFixed(4)}</span></label>
      <input id="dt" type="range" min="0.0005" max="0.04" step="0.0005" value="${dt}" />
    </div>
    <div class="control" style="min-width:160px">
      <label for="speed">Speed <span class="value" data-speed-val>${speed.toFixed(2)}×</span></label>
      <input id="speed" type="range" min="0.1" max="4" step="0.1" value="${speed}" />
    </div>
  `;

  controlsEl.innerHTML = meta.controls
    .map((c) => {
      if (c.kind === "range") {
        const v = Number(params[c.key]);
        return `<div class="control">
          <label for="c-${c.key}">${c.label}${c.unit ? ` (${c.unit})` : ""}
            <span class="value" data-val="${c.key}">${formatVal(v)}</span>
          </label>
          <input id="c-${c.key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" data-key="${c.key}" />
        </div>`;
      }
      if (c.kind === "select") {
        const v = String(params[c.key]);
        return `<div class="control">
          <label for="c-${c.key}">${c.label}</label>
          <select id="c-${c.key}" data-key="${c.key}">${c.options
            .map((o) => `<option value="${o.value}" ${o.value === v ? "selected" : ""}>${o.label}</option>`)
            .join("")}</select>
        </div>`;
      }
      const on = Boolean(params[c.key] === true || params[c.key] === "true" || params[c.key] === "1");
      return `<div class="control toggle">
        <label><input type="checkbox" data-key="${c.key}" ${on ? "checked" : ""} /> ${c.label}</label>
      </div>`;
    })
    .join("");

  const sim: Simulation = createSim(meta.id)!;
  const frameOf = () => ({
    palette: readPalette(),
    reducedMotion: reducedMotion(),
    method,
    dt,
  });
  sim.reset(params, frameOf());

  const playBtn = transport.querySelector("[data-play]") as HTMLButtonElement;
  const loop = new SimLoop({
    dt,
    speed,
    maxSubsteps: 48,
    paused: !playing,
    onAdvance: (steps, stepDt) => sim.advance(steps, stepDt),
    onFrame: (alpha, stats) => {
      latestStats = stats;
      worldCanvas.resize();
      plotCanvas.resize();
      sim.drawWorld(worldCanvas.ctx, worldCanvas.width, worldCanvas.height, alpha);
      sim.drawPlot(plotCanvas.ctx, plotCanvas.width, plotCanvas.height);
      worldReadout.textContent = sim.readout();
      plotReadout.textContent = `${sim.plotCaption()}  ·  ${stats.fps.toFixed(0)} fps`;
    },
  });
  loop.start();

  const syncUrl = (): void => {
    const extras = sim.urlExtras?.() ?? {};
    const bag: Record<string, string> = {
      int: method,
      dt: String(dt),
      speed: String(speed),
      play: playing ? "1" : "0",
      ...objectify(params),
      ...extras,
    };
    replaceHash(meta.id, bag);
  };

  const setPlaying = (next: boolean): void => {
    playing = next;
    loop.paused = !next;
    playBtn.textContent = next ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", String(next));
    syncUrl();
  };

  const intSelect = transport.querySelector("#int") as HTMLSelectElement;
  const syncCompareUi = (): void => {
    const cmp = params.cmp === true || params.cmp === "true" || params.cmp === "1";
    intSelect.disabled = Boolean(cmp);
    intSelect.title = cmp ? "Disabled while four integrators are compared side by side" : "";
  };
  syncCompareUi();

  playBtn.addEventListener("click", () => setPlaying(!playing));
  transport.querySelector("[data-reset]")!.addEventListener("click", () => {
    sim.reset(params, frameOf());
    loop.resetAccumulator();
  });
  transport.querySelector("#int")!.addEventListener("change", (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (!isMethodId(v)) return;
    method = v;
    sim.reset(params, frameOf());
    syncUrl();
  });
  transport.querySelector("#dt")!.addEventListener("input", (ev) => {
    dt = Number((ev.target as HTMLInputElement).value);
    loop.dt = dt;
    (transport.querySelector("[data-dt-val]") as HTMLElement).textContent = dt.toFixed(4);
    syncUrl();
  });
  transport.querySelector("#speed")!.addEventListener("input", (ev) => {
    speed = Number((ev.target as HTMLInputElement).value);
    loop.speed = speed;
    (transport.querySelector("[data-speed-val]") as HTMLElement).textContent = `${speed.toFixed(2)}×`;
    syncUrl();
  });

  controlsEl.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement | HTMLSelectElement;
    const key = t.dataset.key;
    if (!key) return;
    if (t instanceof HTMLInputElement && t.type === "checkbox") params[key] = t.checked;
    else if (t instanceof HTMLInputElement && t.type === "range") {
      params[key] = Number(t.value);
      const label = controlsEl.querySelector(`[data-val="${key}"]`);
      if (label) label.textContent = formatVal(Number(t.value));
    } else params[key] = t.value;
    sim.reset(params, frameOf());
    loop.resetAccumulator();
    syncCompareUi();
    syncUrl();
  });

  root.querySelector("[data-share]")!.addEventListener("click", async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied");
    } catch {
      toast("Copy the URL from the address bar");
    }
  });

  const worldEl = worldCanvas.el;
  const toLocal = (ev: PointerEvent) => {
    const r = worldEl.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  };
  worldEl.addEventListener("pointerdown", (ev) => {
    if (!sim.pointerDown) return;
    const p = toLocal(ev);
    if (sim.pointerDown(p.x, p.y, p.w, p.h)) {
      worldEl.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }
  });
  worldEl.addEventListener("pointermove", (ev) => {
    if (!sim.pointerMove) return;
    const p = toLocal(ev);
    sim.pointerMove(p.x, p.y, p.w, p.h);
  });
  worldEl.addEventListener("pointerup", () => {
    sim.pointerUp?.();
    syncUrl();
  });

  const onResize = (): void => {
    worldCanvas.resize();
    plotCanvas.resize();
  };
  window.addEventListener("resize", onResize);

  syncUrl();

  return {
    destroy() {
      loop.stop();
      window.removeEventListener("resize", onResize);
    },
    togglePlay() {
      setPlaying(!playing);
    },
    reset() {
      sim.reset(params, frameOf());
      loop.resetAccumulator();
    },
    setSpeed(mult: number) {
      speed = Math.min(4, Math.max(0.1, speed * mult));
      loop.speed = speed;
      const slider = transport.querySelector("#speed") as HTMLInputElement;
      slider.value = String(speed);
      (transport.querySelector("[data-speed-val]") as HTMLElement).textContent = `${speed.toFixed(2)}×`;
      syncUrl();
    },
    stats() {
      return latestStats;
    },
  };
}

function castParams(url: Record<string, string>, meta: SimMeta): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const c of meta.controls) {
    if (!(c.key in url)) continue;
    if (c.kind === "range") out[c.key] = Number(url[c.key]);
    else if (c.kind === "toggle") out[c.key] = url[c.key] === "1" || url[c.key] === "true";
    else out[c.key] = url[c.key];
  }
  if (url.c) out.c = url.c;
  return out;
}

function objectify(params: Record<string, ParamValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "boolean") out[k] = v ? "1" : "0";
    else out[k] = String(v);
  }
  return out;
}

function formatVal(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a !== 0 && a < 0.001) return v.toExponential(1);
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1000) / 1000);
}

function toast(msg: string): void {
  let el = document.querySelector(".toast") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 1600);
}
