import { clamp, type Box, type Point } from './geometry.js';
import type { PageObject } from './objects.js';
import type { SilkAnchor } from './silk.js';
import { silkWhite, strokeSilk } from './silk-paint.js';
import { buildWeb, curvePoint, taskPoint, type WeaveTask, type SilkKind } from './weaving.js';
export { curvePoint } from './weaving.js';
export type Behavior = 'descending' | 'exploring' | 'weaving' | 'hiding' | 'resting' | 'fleeing';
export interface SilkThread {
  from: Point;
  to: Point;
  group: number;
  sag: number;
  laid: number;
  born: number;
  ink: string;
  kind: SilkKind;
  grain: number;
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
  tasks: WeaveTask[];
  task: WeaveTask | null;
  activeThread: SilkThread | null;
  attachment: SilkAnchor | null;
  nextAttachment: SilkAnchor | null;
  route: number;
  tether: Point | null;
  landing: Point;
  ink: string;
  woven: number;
  silkInk: string;
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
    landing: point,
    ink: '#6c5140',
    woven: 0,
    silkInk: silkWhite,
  };
}
/** Keep completed silk. At the resource ceiling the resident explores until explicitly cleared. */
export const threadBudget = 2048;
function planWeb(
  r: Resident,
  anchors: readonly SilkAnchor[],
  density: number,
  span: number,
  color: string,
): void {
  if (r.threads.length >= threadBudget - 80) return;
  if (!r.task && r.dragFrom) settleDragline(r, { x: r.x, y: r.y }, 0);
  const origin = r.tip && Math.hypot(r.tip.x - r.x, r.tip.y - r.y) < 1 ? r.tip : { x: r.x, y: r.y };
  const plan = buildWeb(origin, anchors, density, span, Math.floor(Math.random() * 4294967296));
  if (!plan || r.threads.length + plan.tasks.filter((t) => t.lay).length > threadBudget) return;
  r.tasks = plan.tasks;
  r.silkInk = color === 'auto' ? silkWhite : color;
  r.woven++;
  r.behavior = 'weaving';
}
function moveHeading(r: Resident, dx: number, dy: number, dt: number): void {
  const heading = Math.atan2(dy, dx) + Math.PI / 2;
  const turn = Math.atan2(Math.sin(heading - r.angle), Math.cos(heading - r.angle));
  r.angle += turn * (1 - Math.exp(-dt * 10));
}
function settleDragline(r: Resident, to: Point, time: number): void {
  const from = r.dragFrom;
  if (from && Math.hypot(to.x - from.x, to.y - from.y) > 4 && r.threads.length < threadBudget) {
    r.threads.push({
      from,
      to,
      sag: Math.min(13, Math.hypot(to.x - from.x, to.y - from.y) * 0.03),
      laid: 1,
      born: time,
      group: r.woven,
      ink: r.silkInk,
      kind: 'frame',
      grain: Math.random(),
    });
  }
  r.dragFrom = to;
}
function cancelWeave(r: Resident): void {
  // Keep a live attachment at the exact interruption point, including after reflow.
  const active = r.activeThread,
    travel = r.task,
    progress = r.route;
  if (active || travel)
    r.dragFrom = {
      get x() {
        return active
          ? curvePoint(active.from, active.to, active.sag, active.laid).x
          : taskPoint(travel!, progress).x;
      },
      get y() {
        return active
          ? curvePoint(active.from, active.to, active.sag, active.laid).y
          : taskPoint(travel!, progress).y;
      },
    };
  r.tip = null;
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
  color = 'auto',
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
    if (r.behavior !== 'fleeing') cancelWeave(r);
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
      if (r.woven === 0 || Math.random() < 0.65) planWeb(r, anchors, density, span, color);
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
          ink: r.silkInk,
          kind: r.task.kind,
          grain: r.task.grain,
        };
        r.threads.push(r.activeThread);
      }
    }
    if (r.task) {
      const previous = { x: r.x, y: r.y };
      r.route = Math.min(
        1,
        r.route + (dt * (r.task.lay ? 112 : 150) * speed) / Math.max(1, r.task.length),
      );
      const p = taskPoint(r.task, r.route);
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
    settleDragline(
      r,
      r.nextAttachment && r.behavior === 'exploring' ? r.nextAttachment : { x: r.x, y: r.y },
      time,
    );
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
  const transform = ctx.getTransform();
  for (const t of threads) {
    if (t.laid <= 0) continue;
    const minX = Math.min(t.from.x, t.to.x),
      maxX = Math.max(t.from.x, t.to.x);
    const minY = Math.min(t.from.y, t.to.y) + Math.min(0, t.sag),
      maxY = Math.max(t.from.y, t.to.y) + Math.max(0, t.sag);
    // Keep offscreen silk in memory; cull drawing instead of deleting whole webs.
    if (
      maxX * transform.a + transform.e < -2 ||
      minX * transform.a + transform.e > ctx.canvas.width + 2 ||
      maxY * transform.d + transform.f < -2 ||
      minY * transform.d + transform.f > ctx.canvas.height + 2
    )
      continue;
    const strength = t.kind === 'frame' ? 0.76 : t.kind === 'capture' ? 0.58 : 0.39;
    const alpha = opacity * (0.52 + t.grain * 0.36);
    const weight = strength * (0.8 + t.grain * 0.4);
    const count = Math.max(
      3,
      Math.min(90, Math.ceil(Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y) / 7)),
    );
    ctx.beginPath();
    ctx.moveTo(t.from.x, t.from.y);
    for (let segment = 1; segment <= count; segment++) {
      const p = curvePoint(t.from, t.to, t.sag, (segment / count) * t.laid);
      ctx.lineTo(p.x, p.y);
    }
    strokeSilk(ctx, t.ink, weight, alpha);
    // A small, stable variation in reflectance makes thick support silk less like a vector wire.
    if (t.kind === 'frame' && t.grain > 0.3) {
      ctx.beginPath();
      const start = 0.18 + t.grain * 0.35,
        end = Math.min(t.laid, start + 0.09);
      if (end > start) {
        const p = curvePoint(t.from, t.to, t.sag, start);
        ctx.moveTo(p.x, p.y);
        for (let j = 1; j <= 4; j++) {
          const q = curvePoint(t.from, t.to, t.sag, start + ((end - start) * j) / 4);
          ctx.lineTo(q.x, q.y);
        }
        strokeSilk(ctx, t.ink, 1.15, opacity * 0.23);
      }
    }
  }
  ctx.globalAlpha = 1;
}
