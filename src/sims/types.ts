import type { Palette } from "../core/canvas.ts";
import type { MethodId } from "../integrators/types.ts";

export type ParamValue = number | string | boolean;

export interface RangeControl {
  key: string;
  kind: "range";
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface SelectControl {
  key: string;
  kind: "select";
  label: string;
  options: { value: string; label: string }[];
}

export interface ToggleControl {
  key: string;
  kind: "toggle";
  label: string;
}

export type Control = RangeControl | SelectControl | ToggleControl;

export interface SimMeta {
  id: string;
  number: string;
  title: string;
  kicker: string;
  tagline: string;
  writeup: string;
  controls: Control[];
  defaults: Record<string, ParamValue>;
  /** Suggested physics step; the app uses this unless the URL overrides. */
  dt?: number;
}

export interface SimFrame {
  palette: Palette;
  reducedMotion: boolean;
  method: MethodId;
  dt: number;
}

export interface Simulation {
  readonly meta: SimMeta;
  reset(params: Record<string, ParamValue>, frame: SimFrame): void;
  apply(params: Record<string, ParamValue>, frame: SimFrame): void;
  advance(steps: number, dt: number): void;
  drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void;
  drawPlot(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  plotCaption(): string;
  energy(): number;
  readout(): string;
  pointerDown?(sx: number, sy: number, w: number, h: number): boolean;
  pointerMove?(sx: number, sy: number, w: number, h: number): void;
  pointerUp?(): void;
  urlExtras?(): Record<string, string>;
}

export function num(params: Record<string, ParamValue>, key: string, fallback: number): number {
  const v = params[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function bool(params: Record<string, ParamValue>, key: string, fallback: boolean): boolean {
  const v = params[key];
  if (typeof v === "boolean") return v;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

export function str(params: Record<string, ParamValue>, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}
