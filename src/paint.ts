import { clamp, cornerPoint, webLines, type Point } from './geometry.js';
import type { Surface } from './layers.js';
const geometry = new Map<number, Point[][]>();
export function paintWeb(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  progress: number,
  opacity: number,
): void {
  let lines = geometry.get(surface.span);
  if (!lines) {
    lines = webLines(surface.span);
    if (geometry.size > 32) geometry.clear();
    geometry.set(surface.span, lines);
  }
  ctx.strokeStyle = surface.ink;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < lines.length; i++) {
    const reveal = clamp(progress * lines.length - i, 0, 1);
    if (reveal <= 0) break;
    const points = lines[i]!;
    ctx.beginPath();
    for (let j = 0; j < points.length; j++) {
      const p = points[j]!,
        q = cornerPoint(surface.box, surface.corner, p.x, p.y);
      if (j === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.globalAlpha = opacity * reveal;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/** A small jumping spider, built from vector geometry: no sprite downloads or image assets. */
export function paintSpider(
  ctx: CanvasRenderingContext2D,
  position: Point,
  anchor: Point | null,
  ink: string,
  size: number,
  time: number,
  gaze: Point | null,
  fear: number,
  reduced: boolean,
  angle = 0,
  gait = 0,
  walking = false,
): void {
  if (anchor) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.quadraticCurveTo(
      anchor.x + (position.x - anchor.x) * 0.25,
      position.y - 18 * size,
      position.x,
      position.y - 12 * size,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.scale(size, size);
  ctx.rotate(angle);
  const dark = '#302823',
    middle = ink === '#29282b' || ink === '#f2eee6' ? '#6c5140' : ink,
    cream = '#dfc5a0';
  const lift = reduced ? 0 : Math.sin(gait * 2) * (walking ? 0.7 : 0.15);
  ctx.translate(0, lift);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Alternating diagonal footfalls: each foot plants, pushes, then lifts forward.
  for (const side of [-1, 1])
    for (let leg = 0; leg < 4; leg++) {
      const phase = gait + leg * Math.PI * 0.82 + (side < 0 ? Math.PI : 0);
      const stride = reduced ? 0 : Math.sin(phase) * (walking ? 5 : 0.8);
      const step = reduced ? 0 : Math.max(0, Math.cos(phase)) * (walking ? 3 : 0.5);
      const root = { x: side * 7, y: -7 + leg * 4.2 };
      const knee = { x: side * (20 + Math.sin(leg * 1.1) * 3), y: -22 + leg * 12 + stride * 0.5 };
      const foot = { x: side * (31 - leg * 1.3 - step), y: -28 + leg * 18 + stride };
      // Three rounded segments, with restrained sand-colored banding.
      ctx.strokeStyle = '#eedcc3';
      ctx.lineWidth = leg === 0 ? 4.2 : 3.8;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
      ctx.strokeStyle = dark;
      ctx.lineWidth = leg === 0 ? 3.4 : 3;
      ctx.stroke();
      for (const [a, b] of [
        [root, knee],
        [knee, foot],
      ] as const) {
        ctx.strokeStyle = cream;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(a.x + (b.x - a.x) * 0.42, a.y + (b.y - a.y) * 0.42);
        ctx.lineTo(a.x + (b.x - a.x) * 0.63, a.y + (b.y - a.y) * 0.63);
        ctx.stroke();
        ctx.strokeStyle = middle;
        ctx.lineWidth = 0.55;
        for (let hair = 0; hair < 4; hair++) {
          const t = 0.2 + hair * 0.19,
            x = a.x + (b.x - a.x) * t,
            y = a.y + (b.y - a.y) * t;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + side * 1.8, y - 1.6);
          ctx.stroke();
        }
      }
    }
  ctx.shadowColor = '#17100c30';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  const abdomen = ctx.createRadialGradient(-4, 7, 1, 0, 11, 17);
  abdomen.addColorStop(0, '#927052');
  abdomen.addColorStop(0.55, middle);
  abdomen.addColorStop(1, dark);
  ctx.fillStyle = abdomen;
  ctx.beginPath();
  ctx.ellipse(0, 11, 12.3, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e3c9a7';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // Original chevron markings, following the volume of the abdomen.
  ctx.strokeStyle = cream;
  ctx.lineWidth = 2.4;
  for (let stripe = 0; stripe < 3; stripe++) {
    const y = 3 + stripe * 7,
      width = stripe === 0 ? 7.5 : stripe === 1 ? 9.5 : 6;
    ctx.beginPath();
    ctx.moveTo(-width, y);
    ctx.quadraticCurveTo(-3, y - 1, 0, y + 2.4);
    ctx.quadraticCurveTo(3, y - 1, width, y);
    ctx.stroke();
  }
  const head = ctx.createRadialGradient(-3, -10, 1, 0, -5, 13);
  head.addColorStop(0, '#9a7654');
  head.addColorStop(0.7, middle);
  head.addColorStop(1, dark);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(0, -6, 11, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d5b68e';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  // Fine, deterministic fuzz stays crisp even at small sizes.
  ctx.strokeStyle = cream;
  ctx.lineWidth = 0.55;
  ctx.globalAlpha = 0.65;
  for (let hair = 0; hair < 48; hair++) {
    const a = (hair * Math.PI * 2) / 48,
      back = Math.sin(a) > 0;
    const rx = back ? 12.3 : 10.4,
      ry = back ? 15 : 10.5,
      cy = back ? 11 : -6;
    const x = Math.cos(a) * rx,
      y = cy + Math.sin(a) * ry;
    ctx.beginPath();
    ctx.moveTo(x * 0.94, cy + (y - cy) * 0.94);
    ctx.lineTo(x + Math.cos(a) * (1.2 + Math.sin(hair * 7) * 0.6), y + Math.sin(a) * 1.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const blinkPhase = time % 5.3,
    blink = reduced ? 1 : blinkPhase > 4.94 && blinkPhase < 5.08 ? 0.15 : 1;
  // Two large forward eyes plus two smaller side eyes, with glass-like catchlights.
  const gazeX = gaze ? clamp((gaze.x - position.x) / 200, -1, 1) * 0.7 : 0;
  for (const side of [-1, 1]) {
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.ellipse(side * 4.2, -10.3, 4.2, 4.8 * blink, side * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#130f11';
    ctx.beginPath();
    ctx.ellipse(side * 4.2 + gazeX, -10.6, 3.3 + fear * 0.15, 3.9 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.ellipse(side * 4.2 - 1 + gazeX, -12, 1.1, 1.3 * blink, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(side * 4.2 + 1.2, -9.2, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#171218';
    ctx.beginPath();
    ctx.arc(side * 8.8, -7.4, 1.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e1c6a2';
    ctx.beginPath();
    ctx.ellipse(side * 3.7, -17, 2.5, 3, side * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
