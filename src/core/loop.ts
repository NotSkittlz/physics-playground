export interface LoopStats {
  fps: number;
  stepsPerSec: number;
  frameMs: number;
  stepsLastFrame: number;
}

export interface LoopConfig {
  dt: number;
  speed: number;
  maxSubsteps: number;
  paused: boolean;
  /** Called once per frame with the number of physics steps to take. */
  onAdvance: (steps: number, dt: number) => void;
  onFrame: (alpha: number, stats: LoopStats) => void;
}

/**
 * Fixed-timestep simulation loop decoupled from rendering.
 * Pauses stepping while the tab is hidden. Caps catch-up so a hitch
 * cannot freeze the page (important on a machine already running a local LLM).
 */
export class SimLoop {
  dt: number;
  speed: number;
  maxSubsteps: number;
  paused: boolean;
  onAdvance: (steps: number, dt: number) => void;
  onFrame: (alpha: number, stats: LoopStats) => void;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private frameTimes = new Float64Array(60);
  private frameCursor = 0;
  private frameFilled = 0;
  private stepWindow = 0;
  private stepWindowT = 0;
  private stepsLastFrame = 0;
  private readonly vis = (): void => {
    if (document.hidden) this.last = 0;
  };

  constructor(cfg: LoopConfig) {
    this.dt = cfg.dt;
    this.speed = cfg.speed;
    this.maxSubsteps = cfg.maxSubsteps;
    this.paused = cfg.paused;
    this.onAdvance = cfg.onAdvance;
    this.onFrame = cfg.onFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    document.addEventListener("visibilitychange", this.vis);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.vis);
  }

  resetAccumulator(): void {
    this.acc = 0;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    if (!this.last) {
      this.last = now;
      this.onFrame(1, this.stats(0));
      return;
    }

    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > 0.08) frame = 0.08;
    if (frame < 0) frame = 0;

    this.frameTimes[this.frameCursor] = frame;
    this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length;
    if (this.frameFilled < this.frameTimes.length) this.frameFilled++;

    let steps = 0;
    if (!this.paused && !document.hidden) {
      this.acc += frame * this.speed;
      const dt = Math.max(this.dt, 1e-6);
      while (this.acc >= dt && steps < this.maxSubsteps) {
        this.acc -= dt;
        steps++;
      }
      if (steps === this.maxSubsteps) this.acc = 0;
      if (steps > 0) this.onAdvance(steps, dt);
    } else {
      this.acc = 0;
    }

    this.stepsLastFrame = steps;
    this.stepWindow += steps;
    this.stepWindowT += frame;
    if (this.stepWindowT > 0.5) {
      this.stepWindowT = 0.25;
      this.stepWindow = Math.round(this.stepWindow / 2);
    }

    const alpha = this.paused || this.dt <= 0 ? 1 : Math.min(1, this.acc / this.dt);
    this.onFrame(alpha, this.stats(frame * 1000));
  };

  private stats(frameMs: number): LoopStats {
    let sum = 0;
    for (let i = 0; i < this.frameFilled; i++) sum += this.frameTimes[i];
    const mean = this.frameFilled ? sum / this.frameFilled : 0;
    const fps = mean > 0 ? 1 / mean : 0;
    const sps = this.stepWindowT > 0 ? this.stepWindow / this.stepWindowT : 0;
    return { fps, stepsPerSec: sps, frameMs, stepsLastFrame: this.stepsLastFrame };
  }
}
