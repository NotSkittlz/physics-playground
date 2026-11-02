import { lerp } from "./math.ts";
import { lerpAngle } from "./draw.ts";

/** Drive-period times nT in (tPrev, t], including every skipped period when dt > T. */
export function sectionTimes(tPrev: number, t: number, period: number): number[] {
  if (!(period > 0) || !(t > tPrev)) return [];
  const n0 = Math.floor(tPrev / period + 1e-15) + 1;
  const n1 = Math.floor(t / period + 1e-15);
  const out: number[] = [];
  for (let n = Math.max(n0, 1); n <= n1; n++) out.push(n * period);
  return out;
}

/** Linear interpolate (θ, ω) onto each section time. θ is unwrapped via the shortest arc. */
export function interpolateSection(
  tPrev: number,
  thPrev: number,
  omPrev: number,
  t: number,
  th: number,
  om: number,
  period: number,
): { t: number; th: number; om: number }[] {
  const times = sectionTimes(tPrev, t, period);
  if (times.length === 0 || t === tPrev) return [];
  const dt = t - tPrev;
  return times.map((ts) => {
    const frac = (ts - tPrev) / dt;
    return { t: ts, th: lerpAngle(thPrev, th, frac), om: lerp(omPrev, om, frac) };
  });
}
