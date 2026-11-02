import { describe, expect, it } from "vitest";
import {
  FIELD_LODS,
  LOD_FAST_FRAMES,
  LOD_FAST_MS,
  LOD_SLOW_FRAMES,
  LOD_SLOW_MS,
  fieldLodFloor,
  initialFieldLodState,
  nextFieldLod,
} from "./lod.ts";

describe("e-field LOD hysteresis", () => {
  it("keeps a desktop canvas on the finest grid", () => {
    expect(fieldLodFloor(720, false)).toBe(0);
    expect(FIELD_LODS[0]).toMatchObject({ nx: 140, ny: 90, levels: 11 });
  });

  it("floors phone-sized and reduced-motion views", () => {
    expect(fieldLodFloor(390, false)).toBe(1);
    expect(fieldLodFloor(240, false)).toBe(2);
    expect(fieldLodFloor(720, true)).toBe(1);
    expect(fieldLodFloor(240, true)).toBe(2);
  });

  it("applies the size floor on the first frame without a timing sample", () => {
    const next = nextFieldLod(initialFieldLodState(), 0, 240, false);
    expect(next.lod).toBe(2);
    expect(next.slowStreak).toBe(0);
  });

  it("does not drop resolution on a single slow frame", () => {
    let state = nextFieldLod(initialFieldLodState(), 16, 800, false);
    state = nextFieldLod(state, LOD_SLOW_MS + 8, 800, false);
    expect(state.lod).toBe(0);
    expect(state.slowStreak).toBe(1);
  });

  it("raises lod after a sustained slow streak", () => {
    let state = nextFieldLod(initialFieldLodState(), 16, 800, false);
    for (let i = 0; i < LOD_SLOW_FRAMES; i++) {
      state = nextFieldLod(state, LOD_SLOW_MS + 6, 800, false);
    }
    expect(state.lod).toBe(1);
    expect(state.slowStreak).toBe(0);
  });

  it("drops lod only after a long fast streak, and never below the size floor", () => {
    let state = { lod: 2, slowStreak: 0, fastStreak: 0 };
    for (let i = 0; i < LOD_FAST_FRAMES; i++) {
      state = nextFieldLod(state, LOD_FAST_MS - 2, 390, false);
    }
    expect(state.lod).toBe(fieldLodFloor(390, false));
    expect(state.lod).toBe(1);
  });
});
