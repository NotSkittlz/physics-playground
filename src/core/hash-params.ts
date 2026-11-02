import { clamp } from "./math.ts";
import { coerceBool, coerceNumber } from "./url.ts";
import { isMethodId, type MethodId } from "../integrators/types.ts";
import type { ParamValue, SimMeta } from "../sims/types.ts";

export const DT_RANGE = { min: 0.0005, max: 0.04 } as const;
export const SPEED_RANGE = { min: 0.1, max: 4 } as const;

/**
 * Parse a hash query into sim params, clamped to each control's slider
 * range so the URL, the slider, and the ODE agree.
 */
export function clampSimParams(
  url: Record<string, string>,
  meta: SimMeta,
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const c of meta.controls) {
    if (!(c.key in url)) continue;
    if (c.kind === "range") {
      const n = Number(url[c.key]);
      const fallback = typeof meta.defaults[c.key] === "number" ? (meta.defaults[c.key] as number) : c.min;
      out[c.key] = finiteClamp(n, c.min, c.max, fallback);
    } else if (c.kind === "toggle") {
      out[c.key] = url[c.key] === "1" || url[c.key] === "true";
    } else {
      const allowed = new Set(c.options.map((o) => o.value));
      out[c.key] = allowed.has(url[c.key]) ? url[c.key] : String(meta.defaults[c.key] ?? c.options[0]?.value ?? "");
    }
  }
  if (url.c) out.c = url.c;
  return out;
}

export function clampDt(raw: string | undefined, fallback: number): number {
  return finiteClamp(coerceNumber(raw, fallback), DT_RANGE.min, DT_RANGE.max, fallback);
}

export function clampSpeed(raw: string | undefined, fallback: number): number {
  return finiteClamp(coerceNumber(raw, fallback), SPEED_RANGE.min, SPEED_RANGE.max, fallback);
}

export function clampMethod(raw: string | undefined, fallback: MethodId): MethodId {
  return raw !== undefined && isMethodId(raw) ? raw : fallback;
}

export function clampPlay(raw: string | undefined, fallback: boolean): boolean {
  return coerceBool(raw, fallback);
}

function finiteClamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}
