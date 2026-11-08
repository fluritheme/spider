import { clamp, type Box, type Point } from './geometry.js';
import type { PageObject } from './objects.js';
import type { SilkAnchor } from './silk.js';
export type Behavior = 'descending' | 'exploring' | 'weaving' | 'hiding' | 'resting' | 'fleeing';
export interface SilkThread {
  from: Point;
  to: Point;
  group: number;
  sag: number;
  laid: number;
  born: number;
  ink: string;
}
interface Task {
  from: Point;
  to: Point;
  sag: number;
  lay: boolean;
  length: number;
}
export interface Resident extends Point {
  destination: Point;
  dragFrom: Point | null;
  tip: Point | null;
  angle: number;
  gait: number;
  velocity: number;
  behavior: Behavior;
  behind: boolean;
  until: number;
  target: PageObject | null;
  scared: boolean;
  visible: boolean;
  threads: SilkThread[];
  tasks: Task[];
  task: Task | null;
  activeThread: SilkThread | null;
  attachment: SilkAnchor | null;
  nextAttachment: SilkAnchor | null;
  route: number;
  tether: Point | null;
  landing: Point;
  ink: string;
  woven: number;
}
export function curvePoint(from: Point, to: Point, sag: number, t: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t + 4 * sag * t * (1 - t),
  };
}
export function makeResident(point: Point, index: number, descend = false, top = 0): Resident {
  return {
    ...point,
    y: descend ? top - 55 : point.y,
    destination: { ...point },
    dragFrom: point,
    tip: point,
    angle: descend ? Math.PI : 0,
    gait: index * 2,
    velocity: 0,
    behavior: descend ? 'descending' : 'weaving',
    behind: false,
    until: 0,
    target: null,
    scared: false,
    visible: true,
    threads: [],
    tasks: [],
    task: null,
    activeThread: null,
    attachment: 'id' in point ? (point as SilkAnchor) : null,
    nextAttachment: null,
    route: 0,
    tether: descend ? { x: point.x, y: top } : null,
    landing: { ...point },
    ink: '#6c5140',
    woven: 0,
  };
}
const task = (from: Point, to: Point, sag: number, lay = true): Task => ({
  from,
  to,
  sag,
  lay,
  length: Math.hypot(to.x - from.x, to.y - from.y) + Math.abs(sag) * 0.5,
});
/** An uninterrupted itinerary: every visible strand is traversed by the spider, never pre-spawned. */
function planWeb(r: Resident, anchors: readonly SilkAnchor[], density: number, span: number): void {
  const available = anchors.filter(
    (a) =>
      a.element.isConnected &&
      Math.hypot(a.x - r.x, a.y - r.y) > 15 &&
      Math.hypot(a.x - r.x, a.y - r.y) < 480,
  );
  available.sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y));
  if (available.length < 2) return;
  // Choose a small, well-supported pocket; different letter edges give naturally irregular shapes.
  const a: Point =
    r.tip && Math.hypot(r.tip.x - r.x, r.tip.y - r.y) < 8 ? r.tip : { x: r.x, y: r.y };
  const b = available.find((p) => Math.hypot(p.x - a.x, p.y - a.y) > span * 0.85) ?? available[0]!;
  const candidates = available.filter(
    (p) => p.id !== b.id && Math.hypot(p.x - a.x, p.y - a.y) < span * 2.5,
  );
  const c =
    candidates.find(
      (p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) > 1700,
    ) ?? candidates.at(-1);
  if (!c) return;
  const abSag = Math.min(30, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
  const acSag = Math.min(23, Math.hypot(c.x - a.x, c.y - a.y) * 0.09);
  // Three foundation cables, then alternate between their edges to stitch a hanging sheet of silk.
  r.tasks = [
    task(a, b, abSag),
    task(b, c, Math.min(38, Math.hypot(c.x - b.x, c.y - b.y) * 0.15)),
    task(c, a, acSag),
  ];
  const bound = (from: Point, to: Point, sag: number, t: number): Point => ({
    get x() {
      return curvePoint(from, to, sag, t).x;
    },
    get y() {
      return curvePoint(from, to, sag, t).y;
    },
  });
  let last: Point = a;
  const rows = Math.round(5 + density * 8);
  for (let row = 1; row <= rows; row++) {
    const t = row / (rows + 1);
    const onB = bound(a, b, abSag, clamp(t + Math.sin(row * 2.3) * 0.028, 0, 1));
    const onC = bound(a, c, acSag, clamp(t + Math.cos(row * 1.7) * 0.038, 0, 1));
    const first = row % 2 ? onB : onC,
      second = row % 2 ? onC : onB;
    r.tasks.push(task(last, first, 0, false));
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    r.tasks.push(task(first, second, Math.min(35, distance * (0.14 + Math.sin(row * 3.4) * 0.04))));
    // A short branching repair every few rows makes small irregular junctions instead of a perfect grid.
    if (row % 3 === 0) {
      const junction = curvePoint(first, second, distance * 0.15, 0.46);
      const next = curvePoint(
        a,
        row % 2 ? b : c,
        row % 2 ? abSag : acSag,
        Math.min(0.98, t + 0.12),
      );
      r.tasks.push(
        task(second, junction, 0, false),
        task(junction, next, Math.min(12, distance * 0.06)),
        task(next, second, 0, false),
      );
    }
    last = second;
  }
  r.woven++;
  r.behavior = 'weaving';
}
function moveHeading(r: Resident, dx: number, dy: number, dt: number): void {
  const heading = Math.atan2(dy, dx) + Math.PI / 2;
  const turn = Math.atan2(Math.sin(heading - r.angle), Math.cos(heading - r.angle));
  r.angle += turn * (1 - Math.exp(-dt * 10));
}
function cancelWeave(r: Resident): void {
  if (r.activeThread) {
    r.activeThread.to = { x: r.x, y: r.y };
    r.activeThread.sag *= r.activeThread.laid * r.activeThread.laid;
    r.activeThread.laid = 1;
  }
  r.task = null;
  r.activeThread = null;
  r.tasks = [];
}
function chooseDestination(
  r: Resident,
  box: Box,
  objects: readonly PageObject[],
  anchors: readonly SilkAnchor[],
  time: number,
): void {
  const shelter = objects.filter(
    (o) =>
      o.box.width > 45 && o.box.height > 40 && Math.hypot(o.center.x - r.x, o.center.y - r.y) < 650,
  );
  if ((r.woven > 0 || !r.threads.length) && shelter.length && Math.random() < 0.32) {
    const object = shelter[Math.floor(Math.random() * shelter.length)]!;
    r.target = object;
    r.behind = true;
    r.behavior = 'hiding';
    r.destination = {
      x: object.box.x + Math.min(28, object.box.width / 3),
      y: object.box.y + object.box.height * 0.48,
    };
  } else {
    const near = anchors.filter(
      (a) => Math.hypot(a.x - r.x, a.y - r.y) > 55 && Math.hypot(a.x - r.x, a.y - r.y) < 650,
    );
    const next = near[Math.floor(Math.random() * near.length)];
    r.nextAttachment = next ?? null;
    r.destination = next
      ? { x: next.x, y: next.y }
      : {
          x: clamp(r.x + (Math.random() - 0.5) * 450, box.x + 30, box.x + box.width - 30),
          y: clamp(r.y + (Math.random() - 0.5) * 350, box.y + 30, box.y + box.height - 30),
        };
    r.behavior = 'exploring';
    r.target = null;
  }
  r.until = time + Math.hypot(r.destination.x - r.x, r.destination.y - r.y) / 60 + 4;
}
export function stepResident(
  r: Resident,
  dt: number,
  time: number,
  pointer: Point | null,
  fearRadius: number,
  speed: number,
  box: Box,
  objects: readonly PageObject[],
  index: number,
  anchors: readonly SilkAnchor[] = [],
  density = 0.7,
  span = 112,
): void {
  if (r.behavior === 'descending') {
    const dy = r.landing.y - r.y;
    r.y += Math.min(Math.max(0, dy), dt * 140 * speed);
    r.x = r.landing.x + Math.sin(time * 2.1) * Math.min(7, Math.max(0, dy) * 0.05);
    r.angle = Math.PI + Math.sin(time * 1.8) * 0.09;
    r.gait += dt;
    if (dy < 1) {
      r.x = r.landing.x;
      r.behavior = 'weaving';
      r.until = time + 0.15;
    }
    return;
  }
  r.scared =
    pointer !== null && fearRadius > 0 && Math.hypot(r.x - pointer.x, r.y - pointer.y) < fearRadius;
  if (r.scared && pointer) {
    cancelWeave(r);
    const dx = r.x - pointer.x,
      dy = r.y - pointer.y,
      length = Math.hypot(dx, dy) || 1;
    r.destination = {
      x: clamp(r.x + ((dx || 1) / length) * 160, box.x + 25, box.x + box.width - 25),
      y: clamp(r.y + ((dy || -0.3) / length) * 160, box.y + 25, box.y + box.height - 25),
    };
    r.behavior = 'fleeing';
    r.until = time + 0.8;
    if (
      objects.some(
        (o) =>
          r.x > o.box.x - 40 &&
          r.x < o.box.x + o.box.width + 40 &&
          r.y > o.box.y - 40 &&
          r.y < o.box.y + o.box.height + 40,
      )
    )
      r.behind = true;
  }
  if (r.behavior === 'weaving' && !r.scared) {
    if (!r.task && !r.tasks.length && time >= r.until) {
      if (r.woven === 0 || Math.random() < 0.65) planWeb(r, anchors, density, span);
      if (!r.tasks.length) {
        chooseDestination(r, box, objects, anchors, time);
      }
    }
    if (!r.task && r.tasks.length) {
      r.task = r.tasks.shift()!;
      r.dragFrom = r.task.from;
      r.route = 0;
      if (r.task.lay) {
        r.activeThread = {
          group: r.woven,
          from: r.task.from,
          to: r.task.to,
          sag: r.task.sag,
          laid: 0,
          born: time,
          ink: '#6f6255',
        };
        r.threads.push(r.activeThread);
        r.threads = r.threads.filter((t) => t.group > r.woven - 12);
      }
    }
    if (r.task) {
      const previous = { x: r.x, y: r.y };
      r.route = Math.min(
        1,
        r.route + (dt * (r.task.lay ? 112 : 150) * speed) / Math.max(1, r.task.length),
      );
      const p = curvePoint(r.task.from, r.task.to, r.task.sag, r.route);
      r.x = p.x;
      r.y = p.y;
      const moved = Math.hypot(r.x - previous.x, r.y - previous.y);
      r.gait += moved * 0.085;
      r.velocity = moved / Math.max(dt, 0.001);
      if (moved > 0.01) moveHeading(r, r.x - previous.x, r.y - previous.y, dt);
      if (r.activeThread) r.activeThread.laid = r.route;
      if (r.route === 1) {
        r.tip = r.task.to;
        r.dragFrom = r.task.to;
        r.task = null;
        r.activeThread = null;
        if (!r.tasks.length) {
          r.behavior = 'resting';
          r.until = time + 0.8 + index * 0.1;
        }
      }
      return;
    }
  }
  const distance = Math.hypot(r.destination.x - r.x, r.destination.y - r.y);
  if (
    distance < 5 &&
    (r.behavior === 'hiding' || r.behavior === 'exploring' || r.behavior === 'fleeing')
  ) {
    if (r.behavior === 'exploring') {
      r.attachment = r.nextAttachment;
      r.tip = r.nextAttachment;
    }
    r.behavior = r.behavior === 'hiding' ? 'resting' : 'weaving';
    r.until = time + (r.behind ? 1.6 : 0.2);
    r.velocity = 0;
  }
  if (time > r.until && r.behavior === 'resting') {
    if (r.target) {
      const o = r.target.box;
      const exits = [
        { x: o.x - 45, y: r.y },
        { x: o.x + o.width + 45, y: r.y },
        { x: r.x, y: o.y - 45 },
        { x: r.x, y: o.y + o.height + 45 },
      ].filter(
        (p) =>
          p.x > box.x + 24 &&
          p.x < box.x + box.width - 24 &&
          p.y > box.y + 24 &&
          p.y < box.y + box.height - 24,
      );
      r.destination = exits.sort(
        (a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y),
      )[0] ?? { x: box.x + 30, y: box.y + 30 };
      r.behavior = 'exploring';
      r.target = null;
      r.until = time + Math.hypot(r.destination.x - r.x, r.destination.y - r.y) / 60 + 4;
    } else chooseDestination(r, box, objects, anchors, time);
  } else if (
    time > r.until &&
    (r.behavior === 'exploring' || r.behavior === 'fleeing' || r.behavior === 'hiding')
  )
    chooseDestination(r, box, objects, anchors, time);
  const waiting = r.behavior === 'resting' || r.behavior === 'weaving';
  const targetSpeed = waiting ? 0 : (r.scared ? 200 : 68) * speed;
  r.velocity += (targetSpeed - r.velocity) * (1 - Math.exp(-dt * 8));
  const dx = r.destination.x - r.x,
    dy = r.destination.y - r.y,
    length = Math.hypot(dx, dy),
    travel = Math.min(r.velocity * dt, length);
  if (length > 0.5 && travel > 0.01) {
    r.x += (dx / length) * travel;
    r.y += (dy / length) * travel;
    moveHeading(r, dx, dy, dt);
    r.gait += travel * 0.085;
  }
  if (
    r.behind &&
    r.behavior !== 'hiding' &&
    r.behavior !== 'resting' &&
    !objects.some(
      (o) =>
        r.x > o.box.x - 30 &&
        r.x < o.box.x + o.box.width + 30 &&
        r.y > o.box.y - 30 &&
        r.y < o.box.y + o.box.height + 30,
    )
  )
    r.behind = false;
}
export function paintThreads(
  ctx: CanvasRenderingContext2D,
  threads: readonly SilkThread[],
  opacity: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let index = 0; index < threads.length; index++) {
    const t = threads[index]!;
    if (t.laid <= 0) continue;
    ctx.strokeStyle = t.ink;
    ctx.globalAlpha = opacity * (0.65 + Math.sin(index * 2.7) * 0.12);
    ctx.lineWidth = 0.65 + (index % 5 === 0 ? 0.22 : 0);
    ctx.beginPath();
    ctx.moveTo(t.from.x, t.from.y);
    const count = Math.max(2, Math.ceil(Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y) / 8));
    for (let segment = 1; segment <= count; segment++) {
      const p = curvePoint(t.from, t.to, t.sag, (segment / count) * t.laid);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
