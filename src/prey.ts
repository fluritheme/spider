import { clamp, type Box, type Point } from './geometry.js';
import type { Resident, SilkThread } from './resident.js';
import { curvePoint } from './weaving.js';
import { silkWhite, strokeSilk } from './silk-paint.js';

export type FlyState = 'flying' | 'trapped' | 'wrapping' | 'eating';
export interface HuntGoal {
  point: Point;
  feeding: boolean;
}
export interface Fly extends Point {
  state: FlyState;
  age: number;
  phaseAge: number;
  destination: Point;
  vx: number;
  vy: number;
  heading: number;
  owner: Resident | null;
  trap: { thread: SilkThread; t: number } | null;
}
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const delta = (a: Point, b: Point): Point => ({ x: b.x - a.x, y: b.y - a.y });
const projection = (p: Point, a: Point, b: Point): number => {
  const d = delta(a, b);
  return clamp(
    ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / Math.max(0.001, d.x * d.x + d.y * d.y),
    0,
    1,
  );
};
/** Swept motion against the part of a curved capture strand that actually exists. */
export function catchThread(
  from: Point,
  to: Point,
  threads: readonly SilkThread[],
): { thread: SilkThread; t: number } | null {
  for (const thread of threads) {
    if (thread.kind !== 'capture' || thread.laid <= 0) continue;
    if (
      Math.max(from.x, to.x) + 4 < Math.min(thread.from.x, thread.to.x) ||
      Math.min(from.x, to.x) - 4 > Math.max(thread.from.x, thread.to.x) ||
      Math.max(from.y, to.y) + 4 < Math.min(thread.from.y, thread.to.y) + Math.min(0, thread.sag) ||
      Math.min(from.y, to.y) - 4 > Math.max(thread.from.y, thread.to.y) + Math.max(0, thread.sag)
    )
      continue;
    const count = Math.min(
      40,
      Math.max(
        4,
        Math.ceil(
          (Math.hypot(thread.to.x - thread.from.x, thread.to.y - thread.from.y) * thread.laid) / 8,
        ),
      ),
    );
    let a = thread.from;
    for (let i = 1; i <= count; i++) {
      const t = (thread.laid * i) / count,
        b = curvePoint(thread.from, thread.to, thread.sag, t);
      const r = delta(from, to),
        s = delta(a, b),
        d = delta(from, a),
        denominator = cross(r, s);
      if (Math.abs(denominator) > 0.0001) {
        const flight = cross(d, s) / denominator,
          strand = cross(d, r) / denominator;
        if (flight >= 0 && flight <= 1 && strand >= 0 && strand <= 1)
          return { thread, t: (thread.laid * (i - 1 + strand)) / count };
      }
      for (const p of [from, to]) {
        const u = projection(p, a, b),
          q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        if (Math.hypot(p.x - q.x, p.y - q.y) <= 3)
          return { thread, t: (thread.laid * (i - 1 + u)) / count };
      }
      for (const [p, u] of [
        [a, 0],
        [b, 1],
      ] as const) {
        const v = projection(p, from, to),
          q = { x: from.x + (to.x - from.x) * v, y: from.y + (to.y - from.y) * v };
        if (Math.hypot(p.x - q.x, p.y - q.y) <= 3)
          return { thread, t: (thread.laid * (i - 1 + u)) / count };
      }
      a = b;
    }
  }
  return null;
}
const within = (p: Point, box: Box, margin = 0): boolean =>
  p.x >= box.x - margin &&
  p.x <= box.x + box.width + margin &&
  p.y >= box.y - margin &&
  p.y <= box.y + box.height + margin;
export function mouth(resident: Resident, size: number): Point {
  return {
    x: resident.x + Math.sin(resident.angle) * 19 * size,
    y: resident.y - Math.cos(resident.angle) * 19 * size,
  };
}

/** One occasional visitor shared by the instance. Uses the existing simulation clock and canvas. */
export class Prey {
  fly: Fly | null = null;
  eaten = 0;
  private nextAt = 12;
  private requested = false;
  private turnAt = 0;
  constructor(private readonly random: () => number = Math.random) {}
  request(): void {
    if (!this.fly) this.requested = true;
  }
  clear(time: number, interval: number): void {
    if (this.fly?.owner && ['hunting', 'eating'].includes(this.fly.owner.behavior)) {
      this.fly.owner.behavior = 'resting';
      this.fly.owner.until = time + 0.6;
      this.fly.owner.velocity = 0;
    }
    this.fly = null;
    this.requested = false;
    this.nextAt = time + interval;
  }
  releaseWeb(): void {
    if (this.fly?.state === 'trapped') this.escape();
  }
  private escape(): void {
    const f = this.fly;
    if (!f) return;
    f.state = 'flying';
    f.trap = null;
    f.owner = null;
    f.phaseAge = 0;
    f.destination = { x: f.x + 110, y: f.y - 90 };
    this.turnAt = f.age + 1;
  }
  goal(resident: Resident): HuntGoal | undefined {
    const f = this.fly;
    return f?.owner === resident
      ? { point: f, feeding: f.state === 'wrapping' || f.state === 'eating' }
      : undefined;
  }
  feeding(resident: Resident): number {
    return this.fly?.owner === resident && ['wrapping', 'eating'].includes(this.fly.state) ? 1 : 0;
  }
  update(
    dt: number,
    time: number,
    box: Box,
    residents: readonly Resident[],
    opacity: number,
    interval: number,
    size: number,
    open: (point: Point) => boolean,
  ): void {
    const available = residents.filter(
      (r) => within(r, box, 15) && r.visible && !r.behind && r.behavior !== 'descending',
    );
    if (!this.fly) {
      if (
        (!this.requested && time < this.nextAt) ||
        !available.length ||
        box.width < 80 ||
        box.height < 80
      )
        return;
      const focus = available[Math.floor(this.random() * available.length)]!;
      const x = clamp(
        focus.x + (this.random() < 0.5 ? -1 : 1) * 150,
        box.x + 15,
        box.x + box.width - 15,
      );
      const y = clamp(focus.y - 60 - this.random() * 70, box.y + 15, box.y + box.height - 15);
      this.fly = {
        x,
        y,
        state: 'flying',
        age: 0,
        phaseAge: 0,
        destination: { x: focus.x + 25, y: focus.y - 15 },
        vx: 0,
        vy: 0,
        heading: 0,
        owner: null,
        trap: null,
      };
      this.requested = false;
      this.turnAt = 1.6;
      return;
    }
    const f = this.fly;
    f.age += dt;
    f.phaseAge += dt;
    if (
      f.owner &&
      (!residents.includes(f.owner) ||
        f.owner.scared ||
        f.owner.behind ||
        !within(f.owner, box, 120))
    )
      this.escape();
    if (
      f.state === 'trapped' &&
      (!f.trap || !residents.some((r) => r.threads.includes(f.trap!.thread)) || opacity <= 0)
    )
      this.escape();
    if (f.state === 'flying') {
      if (f.age > 18 || !within(f, box, 130)) {
        this.clear(time, interval * (0.8 + this.random() * 0.4));
        return;
      }
      if (f.age >= this.turnAt || Math.hypot(f.destination.x - f.x, f.destination.y - f.y) < 15) {
        const focus = available[Math.floor(this.random() * available.length)];
        const thread = focus?.threads.filter((t) => t.kind === 'capture' && t.laid > 0.6)[
          Math.floor(
            this.random() *
              Math.max(
                1,
                focus?.threads.filter((t) => t.kind === 'capture' && t.laid > 0.6).length ?? 0,
              ),
          )
        ];
        const target =
          thread && this.random() < 0.55
            ? curvePoint(thread.from, thread.to, thread.sag, 0.35 + this.random() * 0.3)
            : (focus ?? f);
        f.destination = {
          x: clamp(target.x + (this.random() - 0.5) * 130, box.x + 12, box.x + box.width - 12),
          y: clamp(target.y + (this.random() - 0.5) * 100, box.y + 12, box.y + box.height - 12),
        };
        this.turnAt = f.age + 0.8 + this.random() * 1.7;
      }
      const from = { x: f.x, y: f.y },
        dx = f.destination.x - f.x,
        dy = f.destination.y - f.y,
        d = Math.hypot(dx, dy) || 1;
      const speed = 65 + Math.sin(f.age * 2.4) * 15;
      f.vx += ((dx / d) * speed - f.vx) * (1 - Math.exp(-dt * 5));
      f.vy += ((dy / d) * speed - f.vy) * (1 - Math.exp(-dt * 5));
      f.x += f.vx * dt + Math.sin(f.age * 19) * dt * 12;
      f.y += f.vy * dt + Math.cos(f.age * 23) * dt * 10;
      f.heading = Math.atan2(f.vy, f.vx) + Math.PI / 2;
      if (opacity > 0 && open(f))
        for (const r of residents) {
          const trap = catchThread(from, f, r.threads);
          if (trap) {
            f.trap = trap;
            f.state = 'trapped';
            f.phaseAge = 0;
            f.owner = r;
            break;
          }
        }
      if (!f.owner || f.owner.scared)
        f.owner =
          available
            .filter((r) => !r.scared && Math.hypot(r.x - f.x, r.y - f.y) < 320 * size)
            .sort(
              (a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y),
            )[0] ?? null;
    } else if (f.state === 'trapped' && f.trap) {
      const p = curvePoint(f.trap.thread.from, f.trap.thread.to, f.trap.thread.sag, f.trap.t);
      f.x = p.x + Math.sin(f.phaseAge * 27) * 1.4;
      f.y = p.y + Math.sin(f.phaseAge * 21) * 1.3;
      if (f.phaseAge > 12) this.escape();
    } else if (f.owner) {
      Object.assign(f, mouth(f.owner, size));
      if (f.state === 'wrapping' && f.phaseAge > 1.15) {
        f.state = 'eating';
        f.phaseAge = 0;
      } else if (f.state === 'eating' && f.phaseAge > 1.8) {
        this.eaten++;
        this.clear(time, interval * (0.8 + this.random() * 0.4));
      }
    }
  }
  contact(resident: Resident, size: number): void {
    const f = this.fly;
    if (!f || f.owner !== resident) return;
    if (resident.scared) {
      this.escape();
      return;
    }
    if (
      (f.state === 'flying' || f.state === 'trapped') &&
      Math.hypot(resident.x - f.x, resident.y - f.y) < 24 * size
    ) {
      f.state = 'wrapping';
      f.phaseAge = 0;
      f.trap = null;
      resident.behavior = 'eating';
      resident.velocity = 0;
      Object.assign(f, mouth(resident, size));
    }
  }
  paint(ctx: CanvasRenderingContext2D, time: number, size: number): void {
    const f = this.fly;
    if (!f) return;
    ctx.save();
    ctx.globalAlpha = f.state === 'flying' ? clamp(f.age / 0.25, 0, 1) : 1;
    paintFly(ctx, f, time, size);
    ctx.restore();
  }
}

/** Original tiny fly, translucent beating wings and a silk parcel during feeding. */
export function paintFly(
  ctx: CanvasRenderingContext2D,
  f: Pick<Fly, 'x' | 'y' | 'state' | 'heading' | 'phaseAge'>,
  time: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(size, size);
  ctx.rotate(f.heading);
  const wrapped = f.state === 'wrapping' || f.state === 'eating';
  if (f.state === 'eating') {
    const shrink = clamp(1 - f.phaseAge / 1.8, 0, 1);
    ctx.scale(0.4 + shrink * 0.6, 0.4 + shrink * 0.6);
    ctx.globalAlpha = shrink;
  }
  const wing = wrapped
    ? 0.3
    : 0.55 + Math.abs(Math.sin(time * (f.state === 'trapped' ? 58 : 85))) * 0.65;
  ctx.fillStyle = '#e7eff5b0';
  ctx.strokeStyle = '#59656e';
  ctx.lineWidth = 0.65;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 4, 1, 3.7, 6.7 * wing, side * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 2, 0);
    ctx.lineTo(side * 5, 7 * wing);
    ctx.stroke();
  }
  ctx.strokeStyle = '#33343b';
  ctx.lineWidth = 0.7;
  for (const side of [-1, 1])
    for (let leg = 0; leg < 3; leg++) {
      ctx.beginPath();
      ctx.moveTo(side * 1.8, 1 + leg);
      ctx.lineTo(side * (4 + Math.sin(time * 15 + leg) * 0.6), 3 + leg * 1.3);
      ctx.stroke();
    }
  ctx.fillStyle = '#505b61';
  ctx.beginPath();
  ctx.ellipse(0, 2.6, 2.8, 4.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8c6ca';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, 2);
  ctx.moveTo(-2, 4);
  ctx.lineTo(2, 4);
  ctx.stroke();
  ctx.fillStyle = '#34383f';
  ctx.beginPath();
  ctx.ellipse(0, -1.4, 3.1, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a5b18b';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 2, -2.1, 1.4, 1.8, side * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (wrapped) {
    const progress = f.state === 'eating' ? 1 : clamp(f.phaseAge / 1.15, 0, 1);
    for (let i = 0; i < Math.ceil(progress * 7); i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0.7, 4 - i * 0.15, 6, (i % 2 ? 1 : -1) * (0.2 + i * 0.16), 0, Math.PI * 2);
      strokeSilk(ctx, silkWhite, 0.65, 0.65);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
