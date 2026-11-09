import { describe, expect, it } from 'vitest';
import { Prey, catchThread, type Fly } from '../src/prey';
import { makeResident, stepResident, type SilkThread } from '../src/resident';
import { resolveOptions } from '../src/options';
const box = { x: 0, y: 0, width: 600, height: 400 };
const strand = (patch: Partial<SilkThread> = {}): SilkThread => ({
  from: { x: 100, y: 100 },
  to: { x: 300, y: 100 },
  sag: 30,
  laid: 1,
  born: 0,
  group: 1,
  ink: '#fff',
  kind: 'capture',
  grain: 0.5,
  ...patch,
});
const fly = (patch: Partial<Fly> = {}): Fly => ({
  x: 200,
  y: 130,
  state: 'flying',
  age: 0,
  phaseAge: 0,
  destination: { x: 200, y: 200 },
  vx: 0,
  vy: 0,
  heading: 0,
  owner: null,
  trap: null,
  ...patch,
});
describe('occasional fly visits', () => {
  it('collides with real curved, laid capture silk rather than the straight chord or future strand', () => {
    const t = strand();
    expect(catchThread({ x: 200, y: 115 }, { x: 200, y: 145 }, [t])?.thread).toBe(t);
    expect(catchThread({ x: 200, y: 94 }, { x: 200, y: 104 }, [t])).toBeNull();
    expect(catchThread({ x: 270, y: 70 }, { x: 270, y: 150 }, [strand({ laid: 0.4 })])).toBeNull();
    expect(
      catchThread({ x: 200, y: 90 }, { x: 200, y: 140 }, [strand({ kind: 'frame' })]),
    ).toBeNull();
    expect(catchThread({ x: 0, y: 102 }, { x: 400, y: 102 }, [strand({ sag: 0 })])).not.toBeNull();
  });
  it('walks to catch a moving fly, wraps and eats it, and keeps the original partial web', () => {
    const r = makeResident({ x: 140, y: 160 }, 0);
    const t = strand({ from: { x: 100, y: 160 }, to: { x: 200, y: 160 }, laid: 0.4 });
    r.threads.push(t);
    r.activeThread = t;
    const p = new Prey(() => 0.5);
    p.request();
    let sawHunt = false,
      sawWrap = false,
      sawEat = false;
    for (let i = 0; i < 1200 && p.eaten === 0; i++) {
      const previous = { x: r.x, y: r.y },
        time = i / 60;
      p.update(1 / 60, time, box, [r], 0.5, 35, 1, () => true);
      stepResident(r, 1 / 60, time, null, 0, 1, box, [], 0, [], 0.7, 112, 'auto', p.goal(r));
      p.contact(r, 1);
      sawHunt ||= r.behavior === 'hunting';
      sawWrap ||= p.fly?.state === 'wrapping';
      sawEat ||= p.fly?.state === 'eating';
      expect(Math.hypot(r.x - previous.x, r.y - previous.y)).toBeLessThanOrEqual(2.1);
    }
    expect(sawHunt && sawWrap && sawEat).toBe(true);
    expect(p.eaten).toBe(1);
    expect(p.fly).toBeNull();
    expect(r.threads).toContain(t);
    expect(t.laid).toBe(0.4);
  });
  it('traps a moving fly through the live update path only when it touches a laid capture strand', () => {
    const r = makeResident({ x: 200, y: 170 }, 0),
      t = strand();
    r.threads = [t];
    const p = new Prey(() => 0.5);
    p.fly = fly({ x: 200, y: 123, destination: { x: 200, y: 200 }, vy: 100 });
    p.update(0.05, 1, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly?.state).toBe('trapped');
    expect(p.fly?.trap?.thread).toBe(t);
    expect(t.laid).toBe(1);
    p.releaseWeb();
    expect(p.fly?.state).toBe('flying');
    expect(p.eaten).toBe(0);
  });
  it('keeps a trapped fly attached to live silk and frees it when that web is cleared', () => {
    const r = makeResident({ x: 120, y: 140 }, 0),
      t = strand();
    r.threads = [t];
    const p = new Prey();
    p.fly = fly({ state: 'trapped', trap: { thread: t, t: 0.5 }, owner: r });
    p.update(0, 1, box, [r], 0.5, 35, 1, () => true);
    const before = { x: p.fly!.x, y: p.fly!.y };
    t.from.x += 23;
    t.to.x += 23;
    t.from.y -= 55;
    t.to.y -= 55;
    p.update(0, 1, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly!.x - before.x).toBeCloseTo(23);
    expect(p.fly!.y - before.y).toBeCloseTo(-55);
    r.threads = [];
    p.update(0, 1, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly?.state).toBe('flying');
    expect(p.eaten).toBe(0);
  });
  it('lets prey escape if the spider is frightened instead of finishing a meal on a timer', () => {
    const r = makeResident({ x: 200, y: 150 }, 0),
      p = new Prey();
    p.fly = fly({ owner: r, state: 'eating' });
    r.scared = true;
    p.update(0.02, 1, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly?.state).toBe('flying');
    expect(p.eaten).toBe(0);
  });
  it('bounds invitations, prevents offscreen spawning, and clears hunt ownership', () => {
    const r = makeResident({ x: 200, y: 150 }, 0),
      p = new Prey(() => 0.5);
    for (let i = 0; i < 100; i++) p.request();
    p.update(0.01, 0, box, [r], 0.5, 35, 1, () => true);
    const first = p.fly;
    p.request();
    p.update(0.01, 0, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly).toBe(first);
    p.clear(1, 35);
    p.request();
    r.x = 1000;
    p.update(0.01, 2, box, [r], 0.5, 35, 1, () => true);
    expect(p.fly).toBeNull();
  });
  it('validates bounded, optional fly settings', () => {
    expect(resolveOptions({ flies: false }).flies).toBe(false);
    for (const flyInterval of [NaN, Infinity, 0, 181])
      expect(() => resolveOptions({ flyInterval })).toThrow();
    expect(() => resolveOptions({ flies: 1 as unknown as boolean })).toThrow();
  });
});
