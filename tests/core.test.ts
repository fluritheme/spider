import { describe, expect, it } from 'vitest';
import { createSpider } from '../src/index';
import { cornerPoint, escapeOffset, intersect, webLines } from '../src/geometry';
import { resolveOptions } from '../src/options';
describe('public API in server environments', () => {
  it('imports and has an idempotent lifecycle without window or document', () => {
    const spider = createSpider();
    expect(spider.getState().state).toBe('idle');
    spider.refresh();
    spider.pause();
    spider.resume();
    spider.destroy();
    spider.destroy();
    expect(spider.getState()).toEqual({
      state: 'destroyed',
      reducedMotion: false,
      webs: 0,
      spiders: [],
    });
  });
  it('rejects values that would exhaust rendering resources or poison physics', () => {
    for (const value of [NaN, Infinity, -1, 25])
      expect(() => resolveOptions({ maxWebs: value })).toThrow();
    expect(() => resolveOptions({ spiders: 1.5 })).toThrow();
    expect(() => resolveOptions({ size: Infinity })).toThrow();
    expect(() => resolveOptions({ webOpacity: 1.1 })).toThrow();
    expect(() => resolveOptions({ motion: 'invalid' as 'none' })).toThrow();
    expect(resolveOptions({ fearRadius: 0, webOpacity: 0 }).fearRadius).toBe(0);
  });
});
describe('geometry and movement', () => {
  it('clips disjoint and partially intersecting overflow boxes', () => {
    const box = { x: 10, y: 20, width: 100, height: 80 };
    expect(intersect(box, { x: 50, y: 0, width: 100, height: 50 })).toEqual({
      x: 50,
      y: 20,
      width: 60,
      height: 30,
    });
    expect(intersect(box, { x: 200, y: 200, width: 1, height: 1 }).width).toBe(0);
    expect(cornerPoint(box, 'bottom-right', 10, 15)).toEqual({ x: 100, y: 85 });
  });
  it('builds bounded, finite silk geometry', () => {
    const lines = webLines(100);
    expect(lines.length).toBe(49);
    for (const line of lines)
      for (const p of line) {
        expect(Number.isFinite(p.x + p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
  });
  it('flees away, handles exact pointer overlap, and disables fear at zero', () => {
    expect(escapeOffset({ x: 50, y: 50 }, { x: 55, y: 50 }, 100).x).toBeLessThan(0);
    const overlap = escapeOffset({ x: 50, y: 50 }, { x: 50, y: 50 }, 100);
    expect(overlap.y).toBeLessThan(0);
    expect(Number.isFinite(overlap.x)).toBe(true);
    expect(escapeOffset({ x: 50, y: 50 }, { x: 55, y: 50 }, 0)).toEqual({
      x: 0,
      y: 0,
      scared: false,
    });
  });
});
