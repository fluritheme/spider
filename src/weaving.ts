import { clamp, type Point } from './geometry.js';
import type { SilkAnchor } from './silk.js';

export type SilkKind = 'frame' | 'capture' | 'tie';
export interface SilkCurve {
  from: Point;
  to: Point;
  sag: number;
}
export interface WeaveTask extends SilkCurve {
  lay: boolean;
  length: number;
  kind: SilkKind;
  grain: number;
  route?: { curve: SilkCurve; start: number; end: number };
}
export interface WebPlan {
  tasks: WeaveTask[];
  style: 'drape' | 'fan' | 'bridge';
  ink: string;
}
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export function curvePoint(from: Point, to: Point, sag: number, t: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y:
      from.y +
      (to.y - from.y) * t +
      (sag * (Math.cosh(1.2) - Math.cosh(2.4 * (t - 0.5)))) / (Math.cosh(1.2) - 1),
  };
}
export function taskPoint(task: WeaveTask, t: number): Point {
  const route = task.route;
  return route
    ? curvePoint(
        route.curve.from,
        route.curve.to,
        route.curve.sag,
        route.start + (route.end - route.start) * t,
      )
    : curvePoint(task.from, task.to, task.sag, t);
}
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
interface Cable extends SilkCurve {
  knots: { point: Point; t: number }[];
}
/** Knots share live curve references. Return trips use only silk already laid. */
class Loom {
  readonly tasks: WeaveTask[] = [];
  readonly cables: Cable[] = [];
  cursor: Point;
  constructor(
    origin: Point,
    readonly random: () => number,
  ) {
    this.cursor = origin;
  }
  knot(cable: Cable, t: number): Point {
    if (t <= 0) return cable.from;
    if (t >= 1) return cable.to;
    const point: Point = {
      get x() {
        return curvePoint(cable.from, cable.to, cable.sag, t).x;
      },
      get y() {
        return curvePoint(cable.from, cable.to, cable.sag, t).y;
      },
    };
    cable.knots.push({ point, t });
    return point;
  }
  private add(to: Point, sag: number, kind: SilkKind): Cable {
    const from = this.cursor;
    const cable: Cable = {
      from,
      to,
      sag,
      knots: [
        { point: from, t: 0 },
        { point: to, t: 1 },
      ],
    };
    this.tasks.push({
      from,
      to,
      sag,
      lay: true,
      kind,
      grain: this.random(),
      length: distance(from, to) + Math.abs(sag) * 1.2,
    });
    this.cables.push(cable);
    this.cursor = to;
    return cable;
  }
  walk(to: Point): void {
    if (to === this.cursor) return;
    type Edge = { to: Point; curve: Cable; start: number; end: number; length: number };
    const graph = new Map<Point, Edge[]>();
    for (const curve of this.cables) {
      const knots = curve.knots.slice().sort((a, b) => a.t - b.t);
      for (let i = 1; i < knots.length; i++) {
        const a = knots[i - 1]!,
          b = knots[i]!;
        const length =
          Math.abs(b.t - a.t) * (distance(curve.from, curve.to) + Math.abs(curve.sag) * 1.2);
        for (const [from, target] of [
          [a, b],
          [b, a],
        ] as const) {
          if (!graph.has(from.point)) graph.set(from.point, []);
          graph
            .get(from.point)!
            .push({ to: target.point, curve, start: from.t, end: target.t, length });
        }
      }
    }
    const costs = new Map<Point, number>([[this.cursor, 0]]);
    const previous = new Map<Point, { from: Point; edge: Edge }>();
    const pending = new Set<Point>([this.cursor]);
    while (pending.size) {
      const point = [...pending].reduce((a, b) => (costs.get(a)! < costs.get(b)! ? a : b));
      pending.delete(point);
      if (point === to) break;
      for (const edge of graph.get(point) ?? []) {
        const cost = costs.get(point)! + edge.length;
        if (cost < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, cost);
          previous.set(edge.to, { from: point, edge });
          pending.add(edge.to);
        }
      }
    }
    if (!previous.has(to)) {
      // A new real-world support needs a guy line, not a jump through empty space.
      this.add(to, Math.min(22, distance(this.cursor, to) * 0.055), 'frame');
      return;
    }
    const route: { from: Point; edge: Edge }[] = [];
    for (let point = to; point !== this.cursor;) {
      const step = previous.get(point)!;
      route.unshift(step);
      point = step.from;
    }
    for (const { from, edge } of route)
      this.tasks.push({
        from,
        to: edge.to,
        sag: 0,
        lay: false,
        kind: 'tie',
        grain: 0,
        length: edge.length,
        route: { curve: edge.curve, start: edge.start, end: edge.end },
      });
    this.cursor = to;
  }
  connect(from: Point, to: Point, sag: number, kind: SilkKind): Cable {
    this.walk(from);
    return this.add(to, sag, kind);
  }
}

/** Site geometry sets the footprint; a private seed varies tension, branching, gaps and spacing. */
export function buildWeb(
  origin: Point,
  anchors: readonly SilkAnchor[],
  density: number,
  span: number,
  seed: number,
): WebPlan | null {
  const random = randomSource(seed),
    between = (a: number, b: number) => a + (b - a) * random();
  const near = anchors
    .filter((a) => a.element.isConnected && distance(a, origin) < Math.min(640, span * 3.5 + 100))
    .sort((a, b) => distance(a, origin) - distance(b, origin));
  if (near.length < 3) return null;
  const starts = near.filter((p) => p.side !== 'bottom');
  const choices = starts.length ? starts : near;
  const a = choices[Math.floor(random() * Math.min(5, choices.length))]!;
  const preferred = span * between(0.85, 1.9);
  const partners = near
    .filter(
      (p) =>
        distance(p, a) > span * 0.65 &&
        p.side !== 'bottom' &&
        (p.element !== a.element || p.glyph !== a.glyph || p.glyph === undefined),
    )
    .sort((p, q) => Math.abs(distance(p, a) - preferred) - Math.abs(distance(q, a) - preferred));
  const b = partners[Math.floor(random() * Math.min(4, partners.length))];
  if (!b) return null;
  const cross = (p: Point) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  const thirds = near
    .filter((p) => distance(p, a) > 20 && distance(p, b) > 20 && cross(p) > distance(a, b) * 24)
    .sort((p, q) => distance(p, b) - distance(q, b));
  const c = thirds[Math.floor(random() * Math.min(8, thirds.length))];
  if (!c) return null;
  const fourths = near
    .filter(
      (p) =>
        p !== a &&
        p !== b &&
        p !== c &&
        distance(p, c) > span * 0.35 &&
        cross(p) > distance(a, b) * 18,
    )
    .sort((p, q) => distance(p, a) - distance(q, a));
  const d = fourths[Math.floor(random() * Math.min(5, fourths.length))] ?? c;
  const loom = new Loom(origin, random);
  const sag = (from: Point, to: Point, low = 0.06, high = 0.2) =>
    Math.min(70, distance(from, to) * between(low, high));
  const top = loom.connect(a, b, sag(a, b), 'frame');
  const style = (['drape', 'fan', 'bridge'] as const)[Math.floor(random() * 3)]!;
  if (style === 'drape') {
    const right = loom.connect(b, c, sag(b, c, 0.025, 0.08), 'frame');
    const bottom = loom.connect(c, d, sag(c, d), 'frame');
    const left = loom.connect(d, a, sag(d, a, 0.025, 0.08), 'frame');
    const rows: Cable[] = [];
    const count = Math.round(between(4, 7) + density * 5);
    let level = 0;
    const intervals = Array.from({ length: count + 1 }, () => between(0.45, 1.7));
    const total = intervals.reduce((sum, n) => sum + n, 0);
    for (let i = 0; i < count; i++) {
      level += intervals[i]! / total;
      const p = loom.knot(left, clamp(1 - level + between(-0.035, 0.035), 0.03, 0.97));
      const q = loom.knot(right, clamp(level + between(-0.055, 0.055), 0.03, 0.97));
      const row = loom.connect(i % 2 ? q : p, i % 2 ? p : q, sag(p, q, 0.08, 0.23), 'capture');
      rows.push(row);
      if (i && random() > 0.2) {
        const prior = rows[i - 1]!,
          fraction = between(0.1, 0.86);
        const knot = loom.knot(row, fraction);
        const other = loom.knot(prior, clamp(1 - fraction + between(-0.14, 0.14), 0.06, 0.94));
        loom.connect(knot, other, sag(knot, other, 0.03, 0.12), 'tie');
      }
    }
    // Sparse diagonal lacing leaves open pockets instead of filling a uniform grid.
    for (let i = 0; i < Math.round(2 + density * 4); i++) {
      const first = rows[Math.floor(random() * Math.max(1, rows.length - 2))]!;
      const second = rows[Math.min(rows.length - 1, rows.indexOf(first) + 2)]!;
      const p = loom.knot(first, between(0.12, 0.88)),
        q = loom.knot(second, between(0.12, 0.88));
      loom.connect(p, q, sag(p, q, 0.02, 0.09), 'tie');
    }
    // An uneven secondary hem ties into the lower foundation.
    const p = loom.knot(bottom, between(0.18, 0.8));
    loom.connect(p, loom.knot(rows.at(-1)!, between(0.2, 0.8)), sag(p, c, 0.015, 0.035), 'tie');
  } else if (style === 'fan') {
    const side = loom.connect(b, c, sag(b, c, 0.025, 0.09), 'frame');
    const base = loom.connect(c, a, sag(c, a, 0.03, 0.1), 'frame');
    const hub = loom.knot(top, between(0.16, 0.48));
    const spokes: Cable[] = [];
    const count = Math.round(between(5, 7) + density * 3);
    for (let i = 0; i < count; i++) {
      const t = (i + between(0.1, 0.75)) / count;
      const end = t < 0.5 ? loom.knot(side, t * 2) : loom.knot(base, (t - 0.5) * 2);
      spokes.push(loom.connect(hub, end, sag(hub, end, 0.015, 0.07), 'frame'));
    }
    const rings = Math.round(between(2, 3) + density * 2);
    for (let ring = 0; ring < rings; ring++) {
      const level = (ring + between(0.5, 0.9)) / (rings + 0.3);
      for (let i = 1; i < spokes.length; i++) {
        // A missing sector and offset junctions avoid a stamped, perfect orb.
        if (random() < 0.12 + (ring === 0 ? 0.1 : 0)) continue;
        const p = loom.knot(spokes[i - 1]!, clamp(level + between(-0.05, 0.05), 0.08, 0.96));
        const q = loom.knot(spokes[i]!, clamp(level + between(-0.06, 0.06), 0.08, 0.96));
        loom.connect(p, q, sag(p, q, 0.12, 0.3), 'capture');
      }
    }
  } else {
    const lower = loom.connect(b, c, sag(b, c, 0.1, 0.22), 'frame');
    const returnLine = loom.connect(c, a, sag(c, a, 0.035, 0.14), 'frame');
    const braces: Cable[] = [];
    const count = Math.round(between(3, 5) + density * 3);
    for (let i = 0; i < count; i++) {
      const p = loom.knot(top, between(0.08, 0.92));
      const q = loom.knot(i % 3 ? lower : returnLine, between(0.1, 0.9));
      braces.push(loom.connect(p, q, sag(p, q, 0.07, 0.22), i % 3 ? 'capture' : 'frame'));
    }
    const countTies = Math.round(between(4, 7) + density * 7);
    for (let i = 0; i < countTies; i++) {
      const index = Math.floor(random() * (braces.length - 1));
      const p = loom.knot(braces[index]!, between(0.12, 0.88));
      const q = loom.knot(braces[index + 1]!, between(0.12, 0.88));
      loom.connect(p, q, sag(p, q, 0.025, 0.11), 'tie');
    }
  }
  return { tasks: loom.tasks, style, ink: a.ink };
}
