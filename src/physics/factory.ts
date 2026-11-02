import type { System } from "../integrators/types.ts";
import { coupledSystem, type CoupledParams } from "./coupled.ts";
import { doublePendulumSystem, type DoublePendulumParams } from "./double-pendulum.ts";
import { efieldParticleSystem, type EFieldParams } from "./efield.ts";
import { keplerSystem, type KeplerParams } from "./kepler.ts";
import { pendulumSystem, type PendulumParams } from "./pendulum.ts";

export type PhysicsKind = "kepler" | "pendulum" | "coupled" | "double-pendulum" | "efield";

export type PhysicsSpec =
  | { kind: "kepler"; params: KeplerParams }
  | { kind: "pendulum"; params: PendulumParams }
  | { kind: "coupled"; params: CoupledParams }
  | { kind: "double-pendulum"; params: DoublePendulumParams }
  | { kind: "efield"; params: EFieldParams };

export function createSystem(spec: PhysicsSpec): System {
  switch (spec.kind) {
    case "kepler":
      return keplerSystem(spec.params);
    case "pendulum":
      return pendulumSystem(spec.params);
    case "coupled":
      return coupledSystem(spec.params);
    case "double-pendulum":
      return doublePendulumSystem(spec.params);
    case "efield":
      return efieldParticleSystem(spec.params);
  }
}

