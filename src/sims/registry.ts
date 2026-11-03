import { CoupledSim } from "./coupled.ts";
import { DoublePendulumSim } from "./double-pendulum.ts";
import { EFieldSim } from "./efield.ts";
import { KeplerSim } from "./kepler.ts";
import { PendulumSim } from "./pendulum.ts";
import type { SimMeta, Simulation } from "./types.ts";

export function createSim(id: string): Simulation | null {
  switch (id) {
    case "kepler":
      return new KeplerSim();
    case "pendulum":
      return new PendulumSim();
    case "coupled":
      return new CoupledSim();
    case "double-pendulum":
      return new DoublePendulumSim();
    case "efield":
      return new EFieldSim();
    default:
      return null;
  }
}

export const SIM_METAS: readonly SimMeta[] = [
  new KeplerSim().meta,
  new PendulumSim().meta,
  new CoupledSim().meta,
  new DoublePendulumSim().meta,
  new EFieldSim().meta,
];

export function metaById(id: string): SimMeta | undefined {
  return SIM_METAS.find((m) => m.id === id);
}
