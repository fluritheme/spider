import type { Box, Point } from './geometry.js';
import { elementMatrix } from './objects.js';
import { inkFor } from './layers.js';
export interface SilkAnchor extends Point {
  id: string;
  element: HTMLElement;
  ink: string;
  glyph?: number;
  side?: 'top' | 'bottom';
  box?: Box;
}
export interface SilkNetwork {
  anchors: SilkAnchor[];
}
const ids = new WeakMap<Element, number>();
let nextId = 1;
const identity = (el: Element): number => {
  if (!ids.has(el)) ids.set(el, nextId++);
  return ids.get(el)!;
};
const outlines = new Map<string, { x: number; y: number; side: 'top' | 'bottom' }[]>();
/** Sample the actual font's ink contour rather than attaching to an empty text bounding box. */
function letterContour(
  doc: Document,
  letter: string,
  width: number,
  height: number,
  style: CSSStyleDeclaration,
): { x: number; y: number; side: 'top' | 'bottom' }[] {
  const key = [
    letter,
    width.toFixed(1),
    height.toFixed(1),
    style.fontFamily,
    style.fontWeight,
    style.fontStyle,
    style.fontSize,
    doc.fonts.status,
  ].join('|');
  const cached = outlines.get(key);
  if (cached) return cached;
  const scale = Math.min(1, 84 / height),
    canvas = doc.createElement('canvas');
  canvas.width = Math.max(4, Math.ceil(width * scale) + 4);
  canvas.height = Math.max(4, Math.ceil(height * scale) + 4);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const result: { x: number; y: number; side: 'top' | 'bottom' }[] = [];
  if (ctx) {
    const size = parseFloat(style.fontSize) * scale;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(letter);
    const ascent = metrics.fontBoundingBoxAscent || size * 0.8,
      descent = metrics.fontBoundingBoxDescent || size * 0.2;
    const baseline = (height * scale - ascent - descent) / 2 + ascent + 2;
    const advance = metrics.width || width * scale;
    ctx.save();
    ctx.translate(2, 0);
    ctx.scale((width * scale) / advance, 1);
    ctx.fillText(letter, 0, baseline);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const ink = (x: number, y: number): boolean =>
      (pixels[(y * canvas.width + x) * 4 + 3] ?? 0) > 110;
    for (const fraction of [0.22, 0.5, 0.78]) {
      const x = Math.min(canvas.width - 2, Math.max(1, Math.round(2 + width * scale * fraction)));
      let top = -1,
        bottom = -1;
      for (let y = 1; y < canvas.height - 1; y++)
        if (ink(x, y)) {
          top = y;
          break;
        }
      for (let y = canvas.height - 2; y > 0; y--)
        if (ink(x, y)) {
          bottom = y;
          break;
        }
      if (top >= 0) result.push({ x: (x - 2) / scale, y: (top - 2) / scale, side: 'top' });
      if (bottom >= 0 && bottom - top > 3)
        result.push({ x: (x - 2) / scale, y: (bottom - 2) / scale, side: 'bottom' });
    }
  }
  if (result.length < 2)
    result.push(
      { x: width * 0.5, y: height * 0.2, side: 'top' },
      { x: width * 0.5, y: height * 0.82, side: 'bottom' },
    );
  if (outlines.size > 160) outlines.clear();
  outlines.set(key, result);
  return result;
}
export function measureNetwork(
  root: Document | HTMLElement,
  targets: readonly HTMLElement[],
  previous: SilkNetwork,
): SilkNetwork {
  const anchors: SilkAnchor[] = [],
    doc = root.ownerDocument ?? (root as Document),
    win = doc.defaultView!;
  for (const heading of [...root.querySelectorAll<HTMLElement>('h1,h2,[data-spider-text]')].slice(
    0,
    4,
  )) {
    if (
      heading.closest('[data-spider-ignore]') ||
      win.getComputedStyle(heading).visibility !== 'visible'
    )
      continue;
    const walker = doc.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let node: Node | null,
      count = 0;
    while ((node = walker.nextNode()) && count < 48) {
      const text = node.textContent ?? '',
        style = win.getComputedStyle(node.parentElement ?? heading);
      for (let i = 0; i < text.length && count < 48; i++) {
        const letter = text[i]!;
        if (/\s/.test(letter)) continue;
        const range = doc.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 2 || r.height < 20) continue;
        const box = {
            x: r.left + win.scrollX,
            y: r.top + win.scrollY,
            width: r.width,
            height: r.height,
          },
          ink = inkFor(heading, win);
        letterContour(doc, letter, r.width, r.height, style).forEach((p, index) =>
          anchors.push({
            id: `t${identity(heading)}:${count}:${index}`,
            element: heading,
            glyph: count,
            side: p.side,
            box,
            ink,
            x: box.x + p.x,
            y: box.y + p.y,
          }),
        );
        count++;
      }
    }
  }
  for (const element of targets.slice(0, 12)) {
    if (!element.isConnected || element.closest('[data-spider-ignore]')) continue;
    const r = element.getBoundingClientRect(),
      style = win.getComputedStyle(element);
    if (r.width < 40 || r.height < 40 || style.visibility !== 'visible' || style.display === 'none')
      continue;
    const inset = Math.max(4, (parseFloat(style.borderRadius) || 0) * 0.5),
      ink = inkFor(element, win);
    const matrix = elementMatrix(element, win),
      width = element.offsetWidth || r.width,
      height = element.offsetHeight || r.height;
    [
      [inset, inset],
      [width - inset, inset],
      [width - inset, height - inset],
      [inset, height - inset],
    ].forEach(([x, y], index) => {
      const p = new DOMPoint(x!, y!).matrixTransform(matrix);
      anchors.push({
        id: `o${identity(element)}:${index}`,
        element,
        ink,
        x: p.x + win.scrollX,
        y: p.y + win.scrollY,
      });
    });
  }
  const old = new Map(previous.anchors.map((a) => [a.id, a]));
  return {
    anchors: anchors.slice(0, 640).map((a) => {
      const same = old.get(a.id);
      if (same) {
        Object.assign(same, a);
        return same;
      }
      return a;
    }),
  };
}
