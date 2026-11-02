/// <reference lib="webworker" />

import { STEPPERS, isMethodId, PhaseState, Scratch } from "./integrators/index.ts";
import { createSystem, type PhysicsSpec } from "./physics/factory.ts";
import type { MethodId } from "./integrators/types.ts";

interface InitMsg {
  type: "init";
  spec: PhysicsSpec;
  method: MethodId;
  y: number[];
  t: number;
  tol: number;
}

interface StepsMsg {
  type: "steps";
  n: number;
  dt: number;
}

interface MethodMsg {
  type: "method";
  method: MethodId;
  tol?: number;
}

interface ResetMsg {
  type: "reset";
  y: number[];
  t: number;
}

type InMsg = InitMsg | StepsMsg | MethodMsg | ResetMsg;

const scratch = new Scratch();
let state: PhaseState | null = null;
let sys = createSystem({
  kind: "pendulum",
  params: { g: 1, L: 1, gamma: 0, driveAmp: 0, driveFreq: 1, linear: false },
});
let method: MethodId = "verlet";
let tol = 1e-8;

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    sys = createSystem(msg.spec);
    scratch.ensure(sys.nq);
    scratch.resetAdaptive();
    state = new PhaseState(sys.nq);
    state.y.set(msg.y);
    state.t = msg.t;
    method = isMethodId(msg.method) ? msg.method : "verlet";
    tol = msg.tol;
    postState();
    return;
  }
  if (!state) return;
  if (msg.type === "method") {
    method = isMethodId(msg.method) ? msg.method : method;
    if (msg.tol !== undefined) tol = msg.tol;
    scratch.resetAdaptive();
    return;
  }
  if (msg.type === "reset") {
    state.y.set(msg.y);
    state.t = msg.t;
    scratch.resetAdaptive();
    postState();
    return;
  }
  if (msg.type === "steps") {
    const stepper = STEPPERS[method];
    for (let i = 0; i < msg.n; i++) stepper.step(sys, state, msg.dt, scratch, tol);
    postState();
  }
};

function postState(): void {
  if (!state) return;
  self.postMessage({
    type: "state",
    t: state.t,
    y: Array.from(state.y),
  });
}
