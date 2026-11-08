import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker, { hash } from '../workers/site';
import type { Environment, Statement } from '../workers/types';

let sql: DatabaseSync;
let env: Environment;
const key = 'test-only-high-entropy-operator-key-not-used-in-production';
function statement(query: string, values: (string | number | null)[] = []): Statement {
  return {
    bind: (...next) => statement(query, next),
    first: async <T>() => (sql.prepare(query).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sql.prepare(query).all(...values) as T[] }),
    run: async () => sql.prepare(query).run(...values),
  };
}
function request(
  path: string,
  method = 'GET',
  body?: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://spider.fluri.xyz${path}`, {
    method,
    ...(body === undefined ? {} : { body }),
    headers: { Origin: 'https://spider.fluri.xyz', 'Content-Type': 'application/json', ...headers },
  });
}
const call = (r: Request) => worker.fetch(r, env, { waitUntil: () => undefined });
beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_analytics.sql', import.meta.url), 'utf8'));
  env = {
    ASSETS: {
      fetch: async () => new Response('Login shell', { headers: { 'Content-Type': 'text/html' } }),
    },
    ANALYTICS_DB: {
      prepare: statement,
      batch: async (items) => {
        for (const item of items) await item.run();
      },
    },
    API_LIMIT: { limit: async () => ({ success: true }) },
    LOGIN_LIMIT: { limit: async () => ({ success: true }) },
    DASHBOARD_PASSWORD_HASH: await hash(key),
    MAINTENANCE_KEY_HASH: await hash('a'.repeat(64)),
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
});
afterEach(() => {
  sql.close();
  vi.unstubAllGlobals();
});

it('protects statistics and export, stores hashed sessions, and revokes on logout', async () => {
  for (const path of ['/api/dashboard/growth', '/api/dashboard/export']) {
    const response = await call(request(path));
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  const login = await call(
    request('/api/dashboard/login', 'POST', JSON.stringify({ password: key })),
  );
  expect(login.status).toBe(200);
  const cookie = login.headers.get('Set-Cookie')!;
  expect(cookie).toMatch(
    /^__Host-spider_session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/,
  );
  const session = cookie.split(';')[0]!;
  const row = sql.prepare('SELECT * FROM admin_sessions').get()!;
  expect(row.token_hash).toBe(await hash(session.split('=')[1]!));
  expect(JSON.stringify(row)).not.toContain(key);
  const stats = await call(request('/api/dashboard/growth', 'GET', undefined, { Cookie: session }));
  expect(stats.status).toBe(200);
  expect(((await stats.json()) as { website: { viewsToday: number } }).website.viewsToday).toBe(0);
  const exported = await call(
    request('/api/dashboard/export', 'GET', undefined, { Cookie: session }),
  );
  expect(exported.headers.get('Content-Disposition')).toContain('spider-analytics.json');
  expect(exported.headers.get('Cache-Control')).toBe('no-store');
  expect(
    (
      await call(request('/api/dashboard/logout', 'POST', undefined, { Cookie: session }))
    ).headers.get('Set-Cookie'),
  ).toContain('Max-Age=0');
  expect(
    (await call(request('/api/dashboard/growth', 'GET', undefined, { Cookie: session }))).status,
  ).toBe(401);
});

it('rejects expired sessions and wrong credentials without creating sessions', async () => {
  expect(
    (await call(request('/api/dashboard/login', 'POST', JSON.stringify({ password: 'wrong' }))))
      .status,
  ).toBe(401);
  const expired = 'e'.repeat(64);
  sql.prepare('INSERT INTO admin_sessions VALUES (?,?)').run(await hash(expired), '2020-01-01');
  expect(
    (
      await call(
        request('/api/dashboard/growth', 'GET', undefined, {
          Cookie: `__Host-spider_session=${expired}`,
        }),
      )
    ).status,
  ).toBe(401);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get()?.n).toBe(1);
});

it('rejects cross-site login/logout and malformed, oversized, or non-JSON bodies', async () => {
  for (const path of ['/api/dashboard/login', '/api/dashboard/logout'])
    expect(
      (await call(request(path, 'POST', '{}', { Origin: 'https://attacker.example' }))).status,
    ).toBe(403);
  expect(
    (
      await call(
        new Request('https://spider.fluri.xyz/api/dashboard/login', { method: 'POST', body: '{}' }),
      )
    ).status,
  ).toBe(403);
  expect((await call(request('/api/dashboard/login', 'POST', '{'))).status).toBe(400);
  expect((await call(request('/api/dashboard/login', 'POST', '{}'))).status).toBe(400);
  expect((await call(request('/api/dashboard/login', 'POST', 'x'.repeat(1025)))).status).toBe(413);
  expect(
    (await call(request('/api/dashboard/login', 'POST', '{}', { 'Content-Type': 'text/plain' })))
      .status,
  ).toBe(415);
});

it('rate limits and fails closed when credentials or storage are missing', async () => {
  env.LOGIN_LIMIT = { limit: async () => ({ success: false }) };
  expect((await call(request('/api/dashboard/login', 'POST', '{}'))).status).toBe(429);
  env.LOGIN_LIMIT = { limit: async () => ({ success: true }) };
  delete env.DASHBOARD_PASSWORD_HASH;
  expect((await call(request('/api/dashboard/login', 'POST', '{}'))).status).toBe(503);
  env.API_LIMIT = { limit: async () => ({ success: false }) };
  expect((await call(request('/api/dashboard/growth'))).status).toBe(429);
});

it('keeps dashboard shell private, uncounted, and outside other origins', async () => {
  for (const path of ['/dashboard', '/dashboard/']) {
    const response = await call(request(path));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  }
  expect(sql.prepare('SELECT COUNT(*) AS n FROM website_daily').get()?.n).toBe(0);
  expect((await call(new Request('https://other.example/api/dashboard/growth'))).status).toBe(404);
});

it('maintenance authorizes only cleanup and preserves recent aggregates', async () => {
  sql.exec("INSERT INTO website_daily VALUES ('2020-01-01','/','GitHub',3,'2020-01-01')");
  expect((await call(request('/api/maintenance/cleanup', 'POST'))).status).toBe(401);
  const response = await call(
    request('/api/maintenance/cleanup', 'POST', undefined, {
      Authorization: `Bearer ${'a'.repeat(64)}`,
    }),
  );
  expect(response.status).toBe(200);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM website_daily').get()?.n).toBe(0);
  expect(
    (
      await call(
        request('/api/dashboard/export', 'GET', undefined, {
          Authorization: `Bearer ${'a'.repeat(64)}`,
        }),
      )
    ).status,
  ).toBe(401);
});
