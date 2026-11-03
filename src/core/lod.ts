/** Resolution ladder for the e-field wash, marching-squares, and arrows. */
export interface FieldLod {
  nx: number;
  ny: number;
  arrowX: number;
  arrowY: number;
  levels: number;
}

export const FIELD_LODS: readonly FieldLod[] = [
  { nx: 140, ny: 90, arrowX: 19, arrowY: 13, levels: 11 },
  { nx: 96, ny: 62, arrowX: 14, arrowY: 10, levels: 9 },
  { nx: 64, ny: 42, arrowX: 10, arrowY: 7, levels: 7 },
  { nx: 40, ny: 28, arrowX: 7, arrowY: 5, levels: 5 },
];

/** Drop a level if a frame stays slower than this for `LOD_SLOW_FRAMES`. */
export const LOD_SLOW_MS = 19;
/** Recover a level if a frame stays faster than this for `LOD_FAST_FRAMES`. */
export const LOD_FAST_MS = 14;
export const LOD_SLOW_FRAMES = 6;
export const LOD_FAST_FRAMES = 24;

export interface FieldLodState {
  lod: number;
  slowStreak: number;
  fastStreak: number;
}

export function initialFieldLodState(): FieldLodState {
  return { lod: 0, slowStreak: 0, fastStreak: 0 };
}

/**
 * Coarsest LOD the current view is allowed to sit at.
 * Phone-sized canvases start one or two rungs down; reduced-motion
 * never stays on the full 140×90 grid.
 */
export function fieldLodFloor(minDim: number, reduced: boolean): number {
  let floor = 0;
  if (minDim < 280) floor = 2;
  else if (minDim < 420) floor = 1;
  if (reduced) floor = Math.max(floor, 1);
  return Math.min(floor, FIELD_LODS.length - 1);
}

/**
 * Frame-time hysteresis around 60 fps. A single hitch does not drop
 * resolution; recovering quality takes a longer fast streak so the
 * grid does not flicker. `frameMs <= 0` (the first rAF) only applies
 * the size floor.
 */
export function nextFieldLod(
  state: FieldLodState,
  frameMs: number,
  minDim: number,
  reduced: boolean,
): FieldLodState {
  const floor = fieldLodFloor(minDim, reduced);
  const max = FIELD_LODS.length - 1;
  if (!(frameMs > 0)) {
    return { lod: floor, slowStreak: 0, fastStreak: 0 };
  }

  let lod = Math.min(max, Math.max(state.lod, floor));
  let slow = state.slowStreak;
  let fast = state.fastStreak;

  if (frameMs > LOD_SLOW_MS) {
    slow += 1;
    fast = 0;
  } else if (frameMs < LOD_FAST_MS) {
    fast += 1;
    slow = 0;
  } else {
    slow = 0;
    fast = 0;
  }

  if (slow >= LOD_SLOW_FRAMES && lod < max) {
    lod += 1;
    slow = 0;
    fast = 0;
  } else if (fast >= LOD_FAST_FRAMES && lod > floor) {
    lod -= 1;
    slow = 0;
    fast = 0;
  }

  lod = Math.min(max, Math.max(lod, floor));
  return { lod, slowStreak: slow, fastStreak: fast };
}
