import { it, expect, vi } from 'vitest';
import worker from '../workers/site';
import type { Environment } from '../workers/types';
const env = {
  ASSETS: {
    fetch: vi.fn(async () => new Response('public', { headers: { 'Content-Type': 'text/html' } })),
  },
} as unknown as Environment;
it.each(['/dashboard', '/dashboard/', '/dashboard/old'])(
  'moves the former dashboard to the main domain: %s',
  async (path) => {
    const r = await worker.fetch(new Request('https://spider.fluri.xyz' + path), env, {
      waitUntil: () => {},
    });
    expect(r.status).toBe(308);
    expect(r.headers.get('Location')).toBe('https://fluri.xyz/dashboard/');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
  },
);
it.each([
  '/api/dashboard/login',
  '/api/dashboard/growth',
  '/api/dashboard/export',
  '/api/dashboard/logout',
])('retires the old private API: %s', async (path) => {
  const r = await worker.fetch(new Request('https://spider.fluri.xyz' + path), env, {
    waitUntil: () => {},
  });
  expect(r.status).toBe(410);
  expect(r.headers.get('Set-Cookie')).toBeNull();
  expect(await r.text()).not.toContain('packages');
});
