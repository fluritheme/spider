import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../workers/site';
import { cleanup } from '../workers/site';
import type { Database, Statement, Environment } from '../workers/types';
import {
  growthStatistics,
  npmStatistics,
  pageObservation,
  recordPageView,
  referralSource,
} from '../workers/growth';

let sql: DatabaseSync;
let db: Database;
const html = () =>
  new Response('<h1>Fluri</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const browser = (path = '/', headers: Record<string, string> = {}) =>
  new Request(`https://spider.fluri.xyz${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 Safari/605.1.15', Accept: 'text/html', ...headers },
  });
function statement(query: string, values: (string | number | null)[] = []): Statement {
  return {
    bind: (...next) => statement(query, next),
    first: async <T>() => (sql.prepare(query).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sql.prepare(query).all(...values) as T[] }),
    run: async () => sql.prepare(query).run(...values),
  };
}
const range = () => ({
  package: '@fluritheme/spider',
  start: '2026-10-08',
  end: '2026-11-06',
  downloads: Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.parse('2026-10-08') + i * 86400000).toISOString().slice(0, 10),
    downloads: i,
  })),
});
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  for (const name of ['0001_analytics'])
    sql.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  db = {
    prepare: statement,
    batch: async (statements) => {
      sql.exec('BEGIN');
      try {
        for (const item of statements) await item.run();
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
});
afterEach(() => {
  sql.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('first-party traffic privacy and aggregation', () => {
  it('keeps only known public pages and broad source categories, stripping private URL data', async () => {
    const observation = pageObservation(
      browser('/privacy/?email=private@example.org', {
        Referer: 'https://www.linkedin.com/in/private-person?token=private',
        Cookie: 'visitor=secret',
        'CF-Connecting-IP': '192.0.2.100',
      }),
      html(),
    );
    expect(observation).toEqual({ path: '/privacy/', source: 'LinkedIn' });
    await recordPageView(db, observation!);
    await recordPageView(db, observation!);
    const rows = sql.prepare('SELECT * FROM website_daily').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.views).toBe(2);
    expect(JSON.stringify(rows)).not.toMatch(/private|secret|192\.0\.2|token|email/);
    expect(
      sql
        .prepare('PRAGMA table_info(website_daily)')
        .all()
        .map((row) => row.name),
    ).toEqual(['date', 'path', 'source', 'views', 'updated_at']);
  });

  it.each([
    ['/dashboard/', {}],
    ['/api/dashboard/', {}],
    ['/assets/main.js', {}],
    ['/', { DNT: '1' }],
    ['/', { 'Sec-GPC': '1' }],
    ['/', { 'User-Agent': 'Googlebot' }],
    ['/', { 'User-Agent': 'Slackbot-LinkExpanding' }],
    ['/', { 'Sec-Purpose': 'prefetch;prerender' }],
    ['/', { Purpose: 'prefetch' }],
    ['/', { 'Sec-Fetch-Dest': 'iframe' }],
  ])('excludes private pages, assets, opt-outs and automated requests: %s %j', (path, headers) => {
    expect(pageObservation(browser(path, headers), html())).toBeNull();
  });

  it('excludes failed responses, redirects, HEAD, non-HTML and non-production hosts', () => {
    expect(pageObservation(browser(), new Response('missing', { status: 404 }))).toBeNull();
    expect(
      pageObservation(browser(), Response.redirect('https://spider.fluri.xyz/docs/')),
    ).toBeNull();
    expect(
      pageObservation(
        browser(),
        new Response('image', { headers: { 'Content-Type': 'image/svg+xml' } }),
      ),
    ).toBeNull();
    expect(pageObservation(new Request(browser(), { method: 'HEAD' }), html())).toBeNull();
    expect(
      pageObservation(new Request('https://preview.example.org/', browser()), html()),
    ).toBeNull();
  });

  it.each([
    [null, 'Direct / unknown'],
    ['not a url', 'Direct / unknown'],
    ['https://spider.fluri.xyz/playground/?private=yes', 'Internal navigation'],
    ['https://personal-name.example.org/private/path', 'Other websites'],
    ['https://linkedin.com.attacker.org/', 'Other websites'],
    ['javascript:alert(1)', 'Direct / unknown'],
    ['https://www.google.sk/search?q=snow', 'Google'],
    ['https://github.com/fluritheme/fluri', 'GitHub'],
  ])('categorises referrers without retaining arbitrary domains: %s', (value, expected) => {
    expect(referralSource(value)).toBe(expected);
  });

  it('reports daily counts, popular pages and referrals independently from participation', async () => {
    await recordPageView(db, { path: '/', source: 'GitHub' });
    await recordPageView(db, { path: '/', source: 'GitHub' });
    await recordPageView(db, { path: '/privacy/', source: 'Internal navigation' });
    const growth = await growthStatistics(db);
    expect(growth.website.viewsToday).toBe(3);
    expect(growth.website.views7d).toBe(3);
    expect(growth.website.views30d).toBe(3);
    expect(growth.website.pages[0]).toEqual({ path: '/', views: 2 });
    expect(growth.website.referrers[0]).toEqual({ source: 'GitHub', views: 2 });
    expect(growth.website.startedAt).toBeTruthy();
    expect(growth.packages.every((item) => item.status === 'unavailable')).toBe(true);
  });

  it('enforces 90-calendar-day retention without deleting recent totals', async () => {
    await recordPageView(db, { path: '/', source: 'GitHub' });
    sql
      .prepare(
        "INSERT INTO website_daily VALUES ('2020-01-01','/','Direct / unknown',8,'2020-01-01T00:00:00.000Z')",
      )
      .run();
    await cleanup(db);
    expect(sql.prepare('SELECT SUM(views) AS total FROM website_daily').get()?.total).toBe(1);
  });

  it('records after asset delivery and keeps the page working when storage fails', async () => {
    const pending: Promise<unknown>[] = [];
    const env: Environment = {
      ASSETS: { fetch: async () => html() },
      ANALYTICS_DB: db,
      API_LIMIT: { limit: async () => ({ success: true }) },
      LOGIN_LIMIT: { limit: async () => ({ success: true }) },
    };
    expect(
      (await worker.fetch(browser(), env, { waitUntil: (promise) => pending.push(promise) }))
        .status,
    ).toBe(200);
    await Promise.all(pending);
    expect(sql.prepare('SELECT SUM(views) AS total FROM website_daily').get()?.total).toBe(1);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = {
      ...env,
      ANALYTICS_DB: {
        ...db,
        batch: async () => {
          throw new Error('private storage error');
        },
      },
    };
    expect(
      (await worker.fetch(browser(), failed, { waitUntil: (promise) => pending.push(promise) }))
        .status,
    ).toBe(200);
    await Promise.all(pending);
    expect(console.error).toHaveBeenCalledWith('Traffic aggregation failed.');
  });
});

describe('npm dashboard statistics', () => {
  it('shows genuine totals and a reporting window, including a real zero day', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(range())));
    const stats = await npmStatistics('@fluritheme/spider');
    expect(stats.status).toBe('available');
    expect(stats.downloads30d).toBe(435);
    expect(stats.downloads7d).toBe(182);
    expect(stats.latestDay).toBe(29);
    expect(stats.daily[0]?.downloads).toBe(0);
    expect(stats.end).toBe('2026-11-06');
  });

  it('distinguishes published packages awaiting reports from unpublished packages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async (url: string) =>
          new Response(null, {
            status: url.startsWith('https://registry.npmjs.org/') ? 200 : 404,
          }),
      ),
    );
    const stats = await npmStatistics('@fluritheme/spider');
    expect(stats.status).toBe('pending');
    expect(stats.downloads30d).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect((await npmStatistics('@fluritheme/spider')).status).toBe('unpublished');
  });

  it.each([
    null,
    { ...range(), package: 'wrong' },
    { ...range(), start: '2026-02-31' },
    { ...range(), downloads: [{ day: '2026-10-08', downloads: -1 }] },
    {
      ...range(),
      downloads: range().downloads.map((row, i) => ({ ...row, downloads: i === 2 ? '9' : 0 })),
    },
    { ...range(), downloads: range().downloads.map((row) => ({ ...row, day: '2026-10-08' })) },
  ])('rejects incomplete, invalid and malicious upstream reports: %j', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    const stats = await npmStatistics('@fluritheme/spider');
    expect(stats.status).toBe('unavailable');
    expect(stats.downloads30d).toBeNull();
  });

  it('caches public npm data for one hour and cannot fetch an arbitrary package', async () => {
    const store = new Map<string, Response>();
    const put = vi.fn(async (key: Request, value: Response) => {
      store.set(key.url, value);
    });
    vi.stubGlobal('caches', {
      open: async () => ({ match: async (key: Request) => store.get(key.url)?.clone(), put }),
    });
    const fetcher = vi.fn().mockResolvedValue(Response.json(range()));
    vi.stubGlobal('fetch', fetcher);
    await npmStatistics('@fluritheme/spider');
    await npmStatistics('@fluritheme/spider');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[1].headers.get('Cache-Control')).toBe('public, max-age=3600');
    await expect(npmStatistics('https://private.example/')).rejects.toThrow('Unsupported package');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
