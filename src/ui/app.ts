import { applyTheme, preferredTheme, toggleTheme } from "../core/theme.ts";
import { parseHash } from "../core/url.ts";
import { PhysicsWorker } from "../core/worker-bridge.ts";
import { metaById } from "../sims/registry.ts";
import { renderHome } from "./home.ts";
import { mountSimPage, type SimPageHandle } from "./sim-page.ts";

export function startApp(root: HTMLElement): void {
  applyTheme(preferredTheme());

  root.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <header class="topbar">
      <a class="brand" href="#/" aria-label="Physics Playground home">
        <span class="brand-mark">Physics <em>Playground</em></span>
        <span class="brand-ver">v0.1</span>
      </a>
      <div class="top-actions">
        <button type="button" class="icon-btn" data-perf title="Performance readout" aria-pressed="false" aria-label="Toggle performance readout">P</button>
        <button type="button" class="icon-btn" data-theme title="Toggle theme" aria-label="Toggle dark and light theme">◐</button>
        <button type="button" class="icon-btn" data-help title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
      </div>
    </header>
    <main id="main"></main>
    <div class="perf" hidden>
      <div><strong data-fps>0</strong> fps</div>
      <div><span data-sps>0</span> steps/s</div>
      <div><span data-ms>0</span> ms/frame</div>
      <div>physics on main · batched</div>
      <div data-worker>worker: idle</div>
    </div>
    <div class="help" hidden role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="help-card">
        <div class="help-head">
          <h2 id="help-title">Keyboard</h2>
          <button type="button" class="icon-btn" data-help-close aria-label="Close help">×</button>
        </div>
        <dl>
          <dt>Space</dt><dd>Play / pause</dd>
          <dt>R</dt><dd>Reset</dd>
          <dt>[ ]</dt><dd>Slower / faster</dd>
          <dt>1–5</dt><dd>Open a simulation</dd>
          <dt>0</dt><dd>Home</dd>
          <dt>T</dt><dd>Theme</dd>
          <dt>P</dt><dd>Performance readout</dd>
          <dt>?</dt><dd>This card</dd>
          <dt>Esc</dt><dd>Close</dd>
        </dl>
      </div>
    </div>
    <div class="sr-only" aria-live="polite" aria-atomic="true" data-live-readout></div>
  `;

  const main = root.querySelector("#main") as HTMLElement;
  const perf = root.querySelector(".perf") as HTMLElement;
  const help = root.querySelector(".help") as HTMLElement;
  const helpClose = root.querySelector("[data-help-close]") as HTMLButtonElement;
  const liveReadout = root.querySelector("[data-live-readout]") as HTMLElement;
  let page: SimPageHandle | null = null;
  let perfOn = false;
  let helpPrev: HTMLElement | null = null;
  let liveAt = 0;
  const worker = new PhysicsWorker();

  const helpFocusables = (): HTMLElement[] =>
    Array.from(help.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

  const setHelpOpen = (open: boolean): void => {
    if (open) {
      helpPrev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      help.hidden = false;
      (helpFocusables()[0] ?? helpClose).focus();
    } else {
      help.hidden = true;
      helpPrev?.focus();
      helpPrev = null;
    }
  };

  const route = (): void => {
    page?.destroy();
    page = null;
    const { simId, params } = parseHash();
    if (!simId) {
      renderHome(main);
      return;
    }
    const meta = metaById(simId);
    if (!meta) {
      renderHome(main);
      return;
    }
    page = mountSimPage(main, meta, params);
  };

  window.addEventListener("hashchange", route);
  route();

  root.querySelector("[data-theme]")!.addEventListener("click", () => {
    toggleTheme();
    if (page) page.recolor();
    else route();
  });
  root.querySelector("[data-help]")!.addEventListener("click", () => {
    setHelpOpen(help.hidden);
  });
  helpClose.addEventListener("click", () => setHelpOpen(false));
  help.addEventListener("click", (ev) => {
    if (ev.target === help) setHelpOpen(false);
  });
  help.addEventListener("keydown", (ev) => {
    if (help.hidden || ev.key !== "Tab") return;
    const nodes = helpFocusables();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      last.focus();
      ev.preventDefault();
    } else if (!ev.shiftKey && document.activeElement === last) {
      first.focus();
      ev.preventDefault();
    }
  });
  const perfBtn = root.querySelector("[data-perf]") as HTMLButtonElement;
  perfBtn.addEventListener("click", () => {
    perfOn = !perfOn;
    perf.hidden = !perfOn;
    perfBtn.setAttribute("aria-pressed", String(perfOn));
    const wlabel = perf.querySelector("[data-worker]") as HTMLElement;
    wlabel.textContent =
      typeof Worker !== "undefined" ? "worker: available (idle)" : "worker: n/a";
    void worker;
  });

  window.addEventListener("keydown", (ev) => {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      if (ev.key === "Escape") (ev.target as HTMLElement).blur();
      return;
    }
    if (ev.key === "?" || (ev.key === "/" && ev.shiftKey)) {
      setHelpOpen(help.hidden);
      ev.preventDefault();
      return;
    }
    if (ev.key === "Escape") {
      if (!help.hidden) {
        setHelpOpen(false);
        ev.preventDefault();
      }
      return;
    }
    if (ev.key === "t" || ev.key === "T") {
      toggleTheme();
      if (page) page.recolor();
      else route();
      return;
    }
    if (ev.key === "p" || ev.key === "P") {
      perfBtn.click();
      return;
    }
    if (ev.key === "0") {
      window.location.hash = "#/";
      return;
    }
    const ids = ["kepler", "pendulum", "coupled", "double-pendulum", "efield"];
    const n = Number(ev.key);
    if (n >= 1 && n <= 5) {
      window.location.hash = `#/${ids[n - 1]}`;
      return;
    }
    if (!page) return;
    if (ev.key === " " || ev.code === "Space") {
      ev.preventDefault();
      page.togglePlay();
    } else if (ev.key === "r" || ev.key === "R") {
      page.reset();
    } else if (ev.key === "[") {
      page.setSpeed(0.7);
    } else if (ev.key === "]") {
      page.setSpeed(1.4);
    }
  });

  const fps = perf.querySelector("[data-fps]") as HTMLElement;
  const sps = perf.querySelector("[data-sps]") as HTMLElement;
  const ms = perf.querySelector("[data-ms]") as HTMLElement;
  const pump = (now: number): void => {
    const s = page?.stats();
    if (s && perfOn) {
      fps.textContent = s.fps.toFixed(0);
      sps.textContent = s.stepsPerSec.toFixed(0);
      ms.textContent = s.frameMs.toFixed(2);
    }
    if (page && now - liveAt > 1000) {
      liveAt = now;
      const world = document.getElementById("world-readout");
      if (world) liveReadout.textContent = world.textContent ?? "";
    }
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
}
