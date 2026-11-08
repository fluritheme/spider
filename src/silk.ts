import { type Point } from './geometry.js';
export interface SilkAnchor extends Point {
  id: string;
  element: HTMLElement;
}
export interface SilkNetwork {
  anchors: SilkAnchor[];
}
const ids = new WeakMap<Element, number>();
let nextId = 1;
function identity(element: Element): number {
  if (!ids.has(element)) ids.set(element, nextId++);
  return ids.get(element)!;
}
/** Build an anchored web graph from DOM letter ranges and object edges, in document coordinates. */
export function measureNetwork(
  root: Document | HTMLElement,
  targets: readonly HTMLElement[],
  previous: SilkNetwork,
): SilkNetwork {
  const anchors: SilkAnchor[] = [];
  const doc = root.ownerDocument ?? (root as Document),
    win = doc.defaultView!;
  for (const heading of [...root.querySelectorAll<HTMLElement>('h1, h2, [data-spider-text]')].slice(
    0,
    4,
  )) {
    if (
      heading.closest('[data-spider-ignore]') ||
      win.getComputedStyle(heading).visibility !== 'visible'
    )
      continue;
    const walker = doc.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const letters: { top: SilkAnchor; bottom: SilkAnchor }[] = [];
    let node: Node | null,
      count = 0;
    while ((node = walker.nextNode()) && count < 48) {
      const text = node.textContent ?? '';
      for (let i = 0; i < text.length && count < 48; i++) {
        if (/\s/.test(text[i]!)) continue;
        const range = doc.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 2 || r.height < 20) continue;
        const id = `t${identity(heading)}:${count}`;
        const top = {
          id: `${id}a`,
          element: heading,
          x: r.left + r.width * 0.42 + win.scrollX,
          y: r.top + r.height * 0.2 + win.scrollY,
        };
        const bottom = {
          id: `${id}b`,
          element: heading,
          x: r.left + r.width * 0.62 + win.scrollX,
          y: r.top + r.height * 0.84 + win.scrollY,
        };
        letters.push({ top, bottom });
        anchors.push(top, bottom);
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
    const inset = Math.max(4, (parseFloat(style.borderRadius) || 0) * 0.5);
    const points = [
      [r.left + inset, r.top + inset],
      [r.right - inset, r.top + inset],
      [r.right - inset, r.bottom - inset],
      [r.left + inset, r.bottom - inset],
    ].map(([x, y], i) => ({
      id: `o${identity(element)}:${i}`,
      element,
      x: x! + win.scrollX,
      y: y! + win.scrollY,
    }));
    anchors.push(...points);
  }
  const old = new Map(previous.anchors.map((a) => [a.id, a]));
  return {
    anchors: anchors.slice(0, 220).map((a) => {
      const same = old.get(a.id);
      if (same) {
        same.x = a.x;
        same.y = a.y;
        return same;
      }
      return a;
    }),
  };
}
