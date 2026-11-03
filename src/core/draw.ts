import { lerp, wrapPi } from "./math.ts";

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapPi(b - a) * t;
}

export function worldToScreen(
  x: number,
  y: number,
  cx: number,
  cy: number,
  scale: number,
): { x: number; y: number } {
  return { x: cx + x * scale, y: cy - y * scale };
}

export function screenToWorld(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  scale: number,
): { x: number; y: number } {
  return { x: (sx - cx) / scale, y: (cy - sy) / scale };
}

export function drawDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/** Coil spring from (x1,y1) to (x2,y2). */
export function drawSpring(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  coils: number,
  amp: number,
  color: string,
  width: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const end = Math.min(12, len * 0.2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * end, y1 + uy * end);
  const usable = len - 2 * end;
  const n = Math.max(3, coils * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const along = end + t * usable;
    const side = i === 0 || i === n ? 0 : i % 2 === 0 ? amp : -amp;
    ctx.lineTo(x1 + ux * along + px * side, y1 + uy * along + py * side);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  width: number,
): void {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  const ah = Math.min(6, len * 0.35);
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - ux * ah + uy * ah * 0.45, y + dy - uy * ah - ux * ah * 0.45);
  ctx.lineTo(x + dx - ux * ah - uy * ah * 0.45, y + dy - uy * ah + ux * ah * 0.45);
  ctx.closePath();
  ctx.fill();
}

export function lerpPacked(out: Float64Array, a: Float64Array, b: Float64Array, t: number): void {
  const n = out.length;
  for (let i = 0; i < n; i++) out[i] = lerp(a[i], b[i], t);
}
