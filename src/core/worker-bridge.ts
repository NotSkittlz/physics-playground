import type { MethodId } from "../integrators/types.ts";
import type { PhysicsSpec } from "../physics/factory.ts";

export interface WorkerState {
  t: number;
  y: number[];
}

/**
 * Optional off-thread stepper. The live render loop stays on the main thread
 * by default; enable this when a sim needs a large catch-up burst.
 */
export class PhysicsWorker {
  private worker: Worker | null = null;
  private pending = false;
  onState: ((s: WorkerState) => void) | null = null;

  get enabled(): boolean {
    return this.worker !== null;
  }

  get busy(): boolean {
    return this.pending;
  }

  start(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL("../physics.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerState & { type: string }>) => {
      this.pending = false;
      if (ev.data?.type === "state") this.onState?.(ev.data);
    };
    this.worker.onerror = () => {
      this.pending = false;
    };
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending = false;
  }

  init(spec: PhysicsSpec, method: MethodId, y: ArrayLike<number>, t: number, tol: number): void {
    this.worker?.postMessage({ type: "init", spec, method, y: Array.from(y), t, tol });
  }

  requestSteps(n: number, dt: number): void {
    if (!this.worker || this.pending || n <= 0) return;
    this.pending = true;
    this.worker.postMessage({ type: "steps", n, dt });
  }

  reset(y: ArrayLike<number>, t: number): void {
    this.worker?.postMessage({ type: "reset", y: Array.from(y), t });
  }
}
