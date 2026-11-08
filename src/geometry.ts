import type { Corner } from './types.js';
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
export function cornerPoint(box: Box, corner: Corner, x: number, y: number): Point {
  return {
    x: box.x + (corner.endsWith('right') ? box.width - x : x),
    y: box.y + (corner.startsWith('bottom') ? box.height - y : y),
  };
}
/** Fan geometry with tensioned, gently scalloped cross threads. */
export function webLines(span: number): Point[][] {
  const count = 7;
  const rays = Array.from({ length: count }, (_, i) => ({
    x: span * Math.cos(((i / (count - 1)) * Math.PI) / 2),
    y: span * Math.sin(((i / (count - 1)) * Math.PI) / 2),
  }));
  const lines: Point[][] = rays.map((p) => [{ x: 0, y: 0 }, p]);
  for (let ring = 1; ring <= 7; ring++) {
    const radius = ring / 7;
    for (let i = 0; i < count - 1; i++) {
      const a = rays[i]!,
        b = rays[i + 1]!;
      const points: Point[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8,
          sag = 1 - Math.sin(t * Math.PI) * 0.045;
        points.push({
          x: (a.x * (1 - t) + b.x * t) * radius * sag,
          y: (a.y * (1 - t) + b.y * t) * radius * sag,
        });
      }
      lines.push(points);
    }
  }
  return lines;
}
export function escapeOffset(
  home: Point,
  pointer: Point,
  radius: number,
): Point & { scared: boolean } {
  const dx = home.x - pointer.x,
    dy = home.y - pointer.y;
  const distance = Math.hypot(dx, dy);
  const force = radius > 0 ? clamp(1 - distance / radius, 0, 1) : 0;
  if (force === 0) return { x: 0, y: 0, scared: false };
  return {
    x: (dx / (distance || 1)) * force * 78,
    y: (distance ? dy / distance : -1) * force * 78,
    scared: force > 0,
  };
}
