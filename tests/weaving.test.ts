import { describe, expect, it, vi } from 'vitest';
import { buildWeb, curvePoint, distance, taskPoint, type WeaveTask } from '../src/weaving';
import { makeResident, stepResident, threadBudget } from '../src/resident';
import type { SilkAnchor } from '../src/silk';
import type { Point } from '../src/geometry';
import { silkWhite, strokeSilk } from '../src/silk-paint';
const element = { isConnected: true } as HTMLElement;
const anchors: SilkAnchor[] = Array.from({ length: 10 }, (_, index) => ({
  id: String(index),
  element,
  ink: '#ddd',
  x: 30 + (index % 5) * 100,
  y: index < 5 ? 60 + (index % 3) * 7 : 235 + (index % 3) * 9,
  glyph: index % 5,
  side: index < 5 ? 'top' : 'bottom',
}));
const origin = { x: 45, y: 80 };

describe('white outlined silk', () => {
  it('draws a subtle neutral outline then white silk without borrowing the body palette', () => {
    const strokes: { ink: string; width: number; alpha: number }[] = [];
    const context = {
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      stroke(this: { strokeStyle: string; lineWidth: number; globalAlpha: number }) {
        strokes.push({ ink: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha });
      },
    } as unknown as CanvasRenderingContext2D;
    strokeSilk(context, silkWhite, 0.7, 0.6);
    expect(strokes).toEqual([
      { ink: '#242424', width: 1.5, alpha: 0.6 * 0.28 },
      { ink: '#ffffff', width: 0.7, alpha: 0.6 },
    ]);
    expect(context.globalAlpha).toBe(1);
    strokeSilk(context, silkWhite, 0.7, 0);
    expect(strokes).toHaveLength(2);
  });
  it('keeps automatic silk white before arrival and throughout construction', () => {
    const resident = makeResident(anchors[0]!, 0, true);
    expect(resident.silkInk).toBe('#ffffff');
    resident.behavior = 'weaving';
    resident.x = anchors[0]!.x;
    resident.y = anchors[0]!.y;
    stepResident(
      resident,
      0.02,
      1,
      null,
      0,
      1,
      { x: 0, y: 0, width: 800, height: 800 },
      [],
      0,
      anchors,
    );
    expect(resident.activeThread?.ink).toBe('#ffffff');
    expect(resident.ink).toBe('#6c5140');
  });
});

describe('physical web construction', () => {
  it('produces distinct footprints, spacing, tension and branching across all three structures', () => {
    const styles = new Set<string>(),
      shapes = new Set<string>();
    const totals: number[] = [];
    for (let seed = 0; seed < 48; seed++) {
      const plan = buildWeb(origin, anchors, 0.8, 130, seed)!;
      expect(plan).not.toBeNull();
      styles.add(plan.style);
      const laid = plan.tasks.filter((task) => task.lay);
      totals.push(laid.length);
      shapes.add(
        JSON.stringify(
          laid.map((task) => [task.from.x.toFixed(2), task.to.y.toFixed(2), task.sag.toFixed(2)]),
        ),
      );
      expect(laid.length).toBeLessThan(80);
      expect(plan.tasks.length).toBeLessThan(500);
      for (const task of plan.tasks) {
        for (const t of [0, 0.5, 1]) {
          const point = taskPoint(task, t);
          expect(Number.isFinite(point.x + point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThan(500);
          expect(point.y).toBeGreaterThan(0);
          expect(point.y).toBeLessThan(400);
        }
      }
    }
    expect([...styles].sort()).toEqual(['bridge', 'drape', 'fan']);
    expect(shapes.size).toBe(48);
    expect(new Set(totals).size).toBeGreaterThan(10);
  });

  it('never jumps or returns across empty space between stitches', () => {
    for (let seed = 0; seed < 18; seed++) {
      const tasks = buildWeb(origin, anchors, 1, 130, seed)!.tasks;
      const laid: WeaveTask[] = [];
      let cursor: Point = origin;
      for (const task of tasks) {
        expect(distance(taskPoint(task, 0), cursor)).toBeLessThan(0.00001);
        if (task.lay) laid.push(task);
        else {
          expect(task.route).toBeDefined();
          const curve = task.route!.curve;
          expect(
            laid.some(
              (prior) =>
                prior.from === curve.from && prior.to === curve.to && prior.sag === curve.sag,
            ),
          ).toBe(true);
        }
        cursor = taskPoint(task, 1);
      }
    }
  });

  it('keeps nested junctions attached after supports move during reflow', () => {
    const supports = anchors.map((anchor) => ({ ...anchor }));
    const plan = buildWeb(supports[0]!, supports, 1, 130, 6)!;
    const before = plan.tasks.map((task) => taskPoint(task, 0.5));
    for (const support of supports) {
      support.x += 37;
      support.y -= 22;
    }
    plan.tasks.forEach((task, index) => {
      const after = taskPoint(task, 0.5);
      expect(after.x).toBeCloseTo(before[index]!.x + 37, 6);
      expect(after.y).toBeCloseTo(before[index]!.y - 22, 6);
    });
  });

  it('preserves interrupted silk and its live knot when startled', () => {
    const r = makeResident(anchors[0]!, 0);
    let time = 0;
    for (let i = 0; i < 1000 && (!r.activeThread || r.route < 0.25); i++) {
      time += 0.02;
      stepResident(
        r,
        0.02,
        time,
        null,
        100,
        1,
        { x: 0, y: 0, width: 800, height: 800 },
        [],
        0,
        anchors,
      );
    }
    const active = r.activeThread!;
    expect(active).toBeTruthy();
    const fraction = active.laid,
      count = r.threads.length;
    stepResident(
      r,
      0.02,
      time + 0.02,
      { x: r.x + 2, y: r.y },
      100,
      1,
      { x: 0, y: 0, width: 800, height: 800 },
      [],
      0,
      anchors,
    );
    expect(r.threads).toContain(active);
    expect(active.laid).toBe(fraction);
    expect(r.threads.length).toBe(count);
    expect(r.dragFrom!.x).toBeCloseTo(curvePoint(active.from, active.to, active.sag, fraction).x);
    expect(r.dragFrom!.y).toBeCloseTo(curvePoint(active.from, active.to, active.sag, fraction).y);
  });

  it('keeps completed exploration draglines and does not reset an interrupted knot each frame', () => {
    const r = makeResident({ x: 45, y: 80 }, 0);
    r.behavior = 'exploring';
    r.destination = anchors[1]!;
    r.nextAttachment = anchors[1]!;
    r.x = anchors[1]!.x;
    r.y = anchors[1]!.y;
    stepResident(r, 0.02, 0, null, 0, 1, { x: 0, y: 0, width: 800, height: 800 }, [], 0, anchors);
    expect(r.threads).toHaveLength(1);
    expect(r.threads[0]!.from).toEqual({ x: 45, y: 80 });
    expect(r.threads[0]!.to).toBe(anchors[1]);
    expect(r.threads[0]!.laid).toBe(1);
    r.behavior = 'fleeing';
    r.dragFrom = anchors[1]!;
    for (let i = 0; i < 8; i++)
      stepResident(
        r,
        0.02,
        i * 0.02,
        { x: r.x + 2, y: r.y },
        100,
        1,
        { x: 0, y: 0, width: 800, height: 800 },
        [],
        0,
        anchors,
      );
    expect(r.dragFrom).toBe(anchors[1]);
    expect(r.threads).toHaveLength(1);
  });

  it('retains old construction groups and stops adding at the resource ceiling', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    try {
      const r = makeResident(anchors[0]!, 0);
      r.woven = 20;
      const thread = {
        from: anchors[0]!,
        to: anchors[1]!,
        sag: 5,
        laid: 1,
        born: 0,
        group: 0,
        ink: '#fff',
        kind: 'frame' as const,
        grain: 0.5,
      };
      r.threads.push(thread);
      stepResident(r, 0.02, 1, null, 0, 1, { x: 0, y: 0, width: 800, height: 800 }, [], 0, anchors);
      expect(r.threads).toContain(thread);
      r.task = null;
      r.tasks = [];
      r.behavior = 'weaving';
      r.until = 0;
      r.threads = Array.from({ length: threadBudget }, () => ({ ...thread }));
      const oldest = r.threads[0];
      stepResident(r, 0.02, 2, null, 0, 1, { x: 0, y: 0, width: 800, height: 800 }, [], 0, anchors);
      expect(r.threads.length).toBe(threadBudget);
      expect(r.threads[0]).toBe(oldest);
    } finally {
      random.mockRestore();
    }
  });
});
