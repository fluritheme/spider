import type { Database } from './types';

const day = 86400000;
const paths = new Set(['/', '/privacy/']);
const sources: [string, string[]][] = [
  ['GitHub', ['github.com']],
  ['npm', ['npmjs.com', 'npmjs.org']],
  ['LinkedIn', ['linkedin.com', 'lnkd.in']],
  [
    'Google',
    [
      'google.com',
      'google.sk',
      'google.cz',
      'google.de',
      'google.co.uk',
      'google.fr',
      'google.ca',
      'google.com.br',
      'google.co.in',
    ],
  ],
  ['Bing', ['bing.com']],
  ['DuckDuckGo', ['duckduckgo.com']],
  ['Yahoo', ['yahoo.com']],
  ['X / Twitter', ['x.com', 'twitter.com', 't.co']],
  ['Reddit', ['reddit.com', 'redd.it']],
  ['Facebook', ['facebook.com', 'fb.com']],
  ['Instagram', ['instagram.com']],
  ['YouTube', ['youtube.com', 'youtu.be']],
  ['Framer', ['framer.com']],
  ['Webflow', ['webflow.com']],
  ['Product Hunt', ['producthunt.com']],
  ['Hacker News', ['news.ycombinator.com']],
  ['DEV Community', ['dev.to']],
  ['ChatGPT', ['chatgpt.com', 'chat.openai.com']],
  ['Perplexity', ['perplexity.ai']],
  ['Claude', ['claude.ai']],
];

export function referralSource(value: string | null): string {
  if (!value || value.length > 2048) return 'Direct / unknown';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return 'Direct / unknown';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'fluri.xyz' || host.endsWith('.fluri.xyz')) return 'Internal navigation';
    return (
      sources.find(([, domains]) =>
        domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
      )?.[0] ?? 'Other websites'
    );
  } catch {
    return 'Direct / unknown';
  }
}

export function pageObservation(request: Request, response: Response) {
  const url = new URL(request.url);
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const agent = request.headers.get('user-agent') ?? '';
  if (
    url.hostname !== 'spider.fluri.xyz' ||
    url.protocol !== 'https:' ||
    request.method !== 'GET' ||
    !paths.has(path) ||
    response.status !== 200 ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html') ||
    !request.headers.get('accept')?.includes('text/html') ||
    !agent ||
    agent.length > 2048 ||
    /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|uptime|monitor/i.test(
      agent,
    ) ||
    /prefetch|prerender/i.test(
      `${request.headers.get('purpose')} ${request.headers.get('sec-purpose')}`,
    ) ||
    (request.headers.has('sec-fetch-dest') &&
      request.headers.get('sec-fetch-dest') !== 'document') ||
    request.headers.get('dnt') === '1' ||
    request.headers.get('sec-gpc') === '1'
  )
    return null;
  return { path, source: referralSource(request.headers.get('referer')) };
}

export async function recordPageView(
  db: Database,
  observation: { path: string; source: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        'INSERT INTO website_analytics_state (id, started_at) VALUES (1, ?) ON CONFLICT(id) DO NOTHING',
      )
      .bind(now),
    db
      .prepare(
        `INSERT INTO website_daily (date,path,source,views,updated_at) VALUES (?,?,?,1,?)
      ON CONFLICT(date,path,source) DO UPDATE SET views=website_daily.views+1, updated_at=excluded.updated_at`,
      )
      .bind(now.slice(0, 10), observation.path, observation.source, now),
  ]);
}

const packageNames = ['@fluritheme/spider'] as const;
export interface PackageStatistics {
  package: string;
  status: 'available' | 'pending' | 'unpublished' | 'unavailable';
  checkedAt: string;
  start: string | null;
  end: string | null;
  downloads30d: number | null;
  downloads7d: number | null;
  latestDay: number | null;
  daily: { date: string; downloads: number }[];
}
function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function parseRange(value: unknown, packageName: string) {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.package !== packageName ||
    !validDate(data.start) ||
    !validDate(data.end) ||
    data.end > new Date().toISOString().slice(0, 10) ||
    !Array.isArray(data.downloads)
  )
    return null;
  const days = (Date.parse(data.end) - Date.parse(data.start)) / day + 1;
  if (days !== 30 || data.downloads.length !== days) return null;
  const daily: { date: string; downloads: number }[] = [];
  for (const [index, item] of data.downloads.entries()) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (
      !validDate(row.day) ||
      Date.parse(row.day) !== Date.parse(data.start) + index * day ||
      typeof row.downloads !== 'number' ||
      !Number.isSafeInteger(row.downloads) ||
      row.downloads < 0
    )
      return null;
    daily.push({ date: row.day, downloads: row.downloads });
  }
  const total = daily.reduce((sum, row) => sum + row.downloads, 0);
  if (!Number.isSafeInteger(total)) return null;
  return { start: data.start, end: data.end, daily, total };
}

async function fetchPackageStatistics(packageName: string): Promise<PackageStatistics> {
  const result: PackageStatistics = {
    package: packageName,
    status: 'unavailable',
    checkedAt: new Date().toISOString(),
    start: null,
    end: null,
    downloads30d: null,
    downloads7d: null,
    latestDay: null,
    daily: [],
  };
  const options = () => ({
    signal: AbortSignal.timeout(4000),
    redirect: 'manual' as const,
    headers: { Accept: 'application/json' },
  });
  try {
    const response = await fetch(
      `https://api.npmjs.org/downloads/range/last-month/${packageName}`,
      options(),
    );
    if (response.status === 404) {
      await response.body?.cancel();
      const registry = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        options(),
      );
      await registry.body?.cancel();
      result.status =
        registry.status === 404 ? 'unpublished' : registry.ok ? 'pending' : 'unavailable';
      return result;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return result;
    }
    const text = await response.text();
    if (text.length > 65536) return result;
    const parsed = parseRange(JSON.parse(text) as unknown, packageName);
    if (!parsed) return result;
    return {
      ...result,
      status: 'available',
      start: parsed.start,
      end: parsed.end,
      downloads30d: parsed.total,
      downloads7d: parsed.daily.slice(-7).reduce((sum, row) => sum + row.downloads, 0),
      latestDay: parsed.daily.at(-1)?.downloads ?? null,
      daily: parsed.daily,
    };
  } catch {
    return result;
  }
}

export async function npmStatistics(packageName: string): Promise<PackageStatistics> {
  if (!packageNames.some((name) => name === packageName)) throw new Error('Unsupported package.');
  let cache: Cache | undefined;
  const key = new Request(
    `https://spider.fluri.xyz/internal/npm-statistics/${encodeURIComponent(packageName)}`,
  );
  try {
    cache = await caches.open('spider-npm-statistics-v1');
    const response = await cache.match(key);
    if (response) return await response.json();
  } catch {
    /* Cache API is optional in local development. */
  }
  const result = await fetchPackageStatistics(packageName);
  const ttl = result.status === 'available' ? 3600 : result.status === 'unavailable' ? 60 : 300;
  await cache
    ?.put(key, Response.json(result, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }))
    .catch(() => undefined);
  return result;
}

export async function growthStatistics(db: Database) {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(today) - 29 * day).toISOString().slice(0, 10);
  const week = new Date(Date.parse(today) - 6 * day).toISOString().slice(0, 10);
  const [daily, pages, referrers, state, packages] = await Promise.all([
    db
      .prepare(
        'SELECT date, SUM(views) AS views FROM website_daily WHERE date >= ? GROUP BY date ORDER BY date',
      )
      .bind(from)
      .all<{ date: string; views: number }>(),
    db
      .prepare(
        'SELECT path, SUM(views) AS views FROM website_daily WHERE date >= ? GROUP BY path ORDER BY views DESC, path',
      )
      .bind(from)
      .all<{ path: string; views: number }>(),
    db
      .prepare(
        'SELECT source, SUM(views) AS views FROM website_daily WHERE date >= ? GROUP BY source ORDER BY views DESC, source',
      )
      .bind(from)
      .all<{ source: string; views: number }>(),
    db
      .prepare(
        'SELECT started_at, (SELECT MAX(updated_at) FROM website_daily) AS last_received_at FROM website_analytics_state WHERE id=1',
      )
      .first<{ started_at: string; last_received_at: string | null }>(),
    Promise.all(packageNames.map(npmStatistics)),
  ]);
  return {
    updatedAt: new Date().toISOString(),
    packages,
    website: {
      start: from,
      end: today,
      startedAt: state?.started_at ?? null,
      lastReceivedAt: state?.last_received_at ?? null,
      viewsToday: daily.results.find((row) => row.date === today)?.views ?? 0,
      views7d: daily.results
        .filter((row) => row.date >= week)
        .reduce((sum, row) => sum + row.views, 0),
      views30d: daily.results.reduce((sum, row) => sum + row.views, 0),
      daily: daily.results,
      pages: pages.results,
      referrers: referrers.results,
    },
  };
}
