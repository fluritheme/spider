import type { Box, Point } from './geometry.js';
export interface PageObject {
  element: HTMLElement;
  box: Box;
  path: Path2D;
  center: Point;
}
export function elementMatrix(element: HTMLElement, win: Window): DOMMatrix {
  const r = element.getBoundingClientRect(),
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  let matrix = new DOMMatrix(),
    ancestor: Element | null = element;
  while (ancestor) {
    const transform = win.getComputedStyle(ancestor).transform;
    if (transform !== 'none') {
      const m = new DOMMatrix(transform);
      if (!m.is2D) {
        matrix = new DOMMatrix();
        break;
      }
      matrix = new DOMMatrix([m.a, m.b, m.c, m.d, 0, 0]).multiply(matrix);
    }
    ancestor = ancestor.parentElement;
  }
  const width = element.offsetWidth || r.width,
    height = element.offsetHeight || r.height;
  matrix.e = center.x - (matrix.a * width) / 2 - (matrix.c * height) / 2;
  matrix.f = center.y - (matrix.b * width) / 2 - (matrix.d * height) / 2;
  return matrix;
}
/** Cache geometry, including 2D rotations inherited through nested stacking contexts. */
export function pageObjects(doc: Document, win: Window, selector: string): PageObject[] {
  return [...doc.querySelectorAll<HTMLElement>(selector)].slice(0, 100).flatMap((element) => {
    if (element.closest('[data-spider-ignore]') || !element.isConnected) return [];
    const style = win.getComputedStyle(element),
      r = element.getBoundingClientRect();
    if (
      style.visibility !== 'visible' ||
      Number(style.opacity) < 0.1 ||
      r.width < 18 ||
      r.height < 14 ||
      r.bottom < 0 ||
      r.top > win.innerHeight ||
      r.right < 0 ||
      r.left > win.innerWidth ||
      r.width * r.height > win.innerWidth * win.innerHeight * 0.85
    )
      return [];
    const box = { x: r.left, y: r.top, width: r.width, height: r.height };
    const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const matrix = elementMatrix(element, win);
    const width = element.offsetWidth || r.width,
      height = element.offsetHeight || r.height;
    const local = new Path2D();
    const radius = Math.min(parseFloat(style.borderRadius) || 0, width / 2, height / 2);
    local.roundRect(0, 0, width, height, radius);
    const path = new Path2D();
    path.addPath(local, matrix);
    return [{ element, box, path, center }];
  });
}
export function outsideObjects(
  ctx: CanvasRenderingContext2D,
  objects: readonly PageObject[],
  width: number,
  height: number,
): void {
  // Separate clipping operations preserve union semantics when opaque objects overlap.
  for (const object of objects) {
    const clip = new Path2D();
    clip.rect(-200, -200, width + 400, height + 400);
    clip.addPath(object.path);
    ctx.clip(clip, 'evenodd');
  }
}
