import { clamp, intersect, cornerPoint, type Box, type Point } from './geometry.js';
import type { Corner } from './types.js';
export interface Surface {
  element: HTMLElement;
  box: Box;
  corner: Corner;
  span: number;
  ink: string;
  clip: Path2D;
  anchor: Point;
  home: Point;
  born: number;
  radius: number;
}
const corners: readonly Corner[] = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
const boxOf = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};
export function inkFor(element: HTMLElement, win: Window): string {
  let current: Element | null = element;
  while (current) {
    const background = win.getComputedStyle(current).backgroundColor;
    const parts = background.match(/[\d.]+/g)?.map(Number);
    if (parts && parts.length >= 3 && (parts[3] ?? 1) > 0.8) {
      return parts[0]! * 0.2126 + parts[1]! * 0.7152 + parts[2]! * 0.0722 > 145
        ? '#29282b'
        : '#f2eee6';
    }
    current = current.parentElement;
  }
  return win.matchMedia('(prefers-color-scheme: dark)').matches ? '#f2eee6' : '#29282b';
}
export function isVisible(element: HTMLElement, point: Point, doc: Document): boolean {
  const top = doc.elementFromPoint(point.x, point.y);
  return top !== null && (element === top || element.contains(top));
}
export function measureSurface(
  element: HTMLElement,
  index: number,
  span: number,
  color: string,
  born: number,
  doc: Document,
  win: Window,
): Surface | null {
  if (!element.isConnected || element.closest('[data-spider-ignore]')) return null;
  const style = win.getComputedStyle(element);
  if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0)
    return null;
  const box = boxOf(element);
  let visible = intersect(box, { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight });
  if (box.width < 64 || box.height < 64 || visible.width < 2 || visible.height < 2) return null;
  let parent = element.parentElement;
  const ancestorClips: { box: Box; radius: number }[] = [];
  while (parent) {
    const s = win.getComputedStyle(parent);
    if (s.visibility !== 'visible' || Number(s.opacity) === 0) return null;
    const b = boxOf(parent);
    const clipsX = /hidden|clip|auto|scroll/.test(s.overflowX),
      clipsY = /hidden|clip|auto|scroll/.test(s.overflowY);
    if (clipsX || clipsY) {
      visible = intersect(visible, {
        x: clipsX ? b.x : visible.x,
        y: clipsY ? b.y : visible.y,
        width: clipsX ? b.width : visible.width,
        height: clipsY ? b.height : visible.height,
      });
      if (clipsX && clipsY) ancestorClips.push({ box: b, radius: parseFloat(s.borderRadius) || 0 });
    }
    parent = parent.parentElement;
  }
  if (visible.width <= 0 || visible.height <= 0) return null;
  const attr = element.getAttribute('data-spider-web');
  const corner = corners.includes(attr as Corner) ? (attr as Corner) : corners[index % 2]!;
  const radius = clamp(parseFloat(style.borderRadius) || 0, 0, Math.min(box.width, box.height) / 2);
  const size = Math.min(
    span,
    box.width * 0.48,
    box.height * 0.48,
    win.innerWidth < 600 ? 88 : span,
  );
  const inset = Math.max(3, radius * 0.32);
  const webBox = {
    x: box.x + inset,
    y: box.y + inset,
    width: box.width - inset * 2,
    height: box.height - inset * 2,
  };
  const anchor = cornerPoint(webBox, corner, size * 0.39, size * 0.39);
  const home = {
    x: anchor.x + (corner.endsWith('right') ? -10 : 10),
    y: anchor.y + (corner.startsWith('bottom') ? -35 : 40),
  };
  // Cache a coarse visibility mask from actual browser paint order. No z-index arithmetic:
  // nested stacking contexts, transforms, sticky layers, and foreground siblings all participate.
  // The exact rounded target/overflow boundaries are applied separately during painting.
  const clip = new Path2D();
  const region = intersect(visible, {
    x: corner.endsWith('right') ? box.x + box.width - size - 115 : box.x,
    y: corner.startsWith('bottom') ? box.y + box.height - size - 115 : box.y,
    width: size + 115,
    height: size + 115,
  });
  const step = 12;
  for (let y = region.y; y < region.y + region.height; y += step) {
    for (let x = region.x; x < region.x + region.width; x += step) {
      const w = Math.min(step, region.x + region.width - x),
        h = Math.min(step, region.y + region.height - y);
      const p = { x: x + w / 2, y: y + h / 2 };
      if (
        isVisible(element, p, doc) &&
        ancestorClips.every((c) => roundedContains(c.box, c.radius, p))
      )
        clip.rect(x, y, w, h);
    }
  }
  return {
    element,
    box: webBox,
    corner,
    span: size,
    ink: color === 'auto' ? inkFor(element, win) : color,
    clip,
    anchor,
    home,
    born,
    radius: Math.max(0, radius - inset),
  };
}
function roundedContains(b: Box, radius: number, p: Point): boolean {
  const r = Math.min(radius, b.width / 2, b.height / 2);
  const cx = clamp(p.x, b.x + r, b.x + b.width - r),
    cy = clamp(p.y, b.y + r, b.y + b.height - r);
  return Math.hypot(p.x - cx, p.y - cy) <= r;
}
