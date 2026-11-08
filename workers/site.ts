import { growthStatistics, pageObservation, recordPageView } from './growth';
import type { Database, Environment } from './types';

const origin = 'https://spider.fluri.xyz';
const cookieName = '__Host-spider_session';
const now = () => new Date().toISOString();
export async function hash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
function equal(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers,
    },
  });
}
function token(request: Request): string {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ''
  );
}
export async function cleanup(db: Database): Promise<void> {
  await db.batch([
    db
      .prepare('DELETE FROM website_daily WHERE date < ?')
      .bind(new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10)),
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now()),
  ]);
}
async function api(request: Request, env: Environment): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!env.ANALYTICS_DB || !env.API_LIMIT || !env.LOGIN_LIMIT)
    return json({ error: 'Analytics is temporarily unavailable.' }, 503);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const requestOrigin = request.headers.get('origin');
  if (
    (requestOrigin && requestOrigin !== origin) ||
    (request.method === 'POST' && path !== '/api/maintenance/cleanup' && requestOrigin !== origin)
  )
    return json({ error: 'A same-origin request is required.' }, 403);
  const limiter = path === '/api/dashboard/login' ? env.LOGIN_LIMIT : env.API_LIMIT;
  // Only a daily digest enters the rate limiter; no address enters analytics storage.
  const limitKey = await hash(
    `${now().slice(0, 10)}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`,
  );
  if (!(await limiter.limit({ key: limitKey })).success)
    return json({ error: 'Too many requests. Try again shortly.' }, 429, { 'Retry-After': '60' });
  if (path === '/api/maintenance/cleanup' && request.method === 'POST') {
    const key = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!key || !env.MAINTENANCE_KEY_HASH || !equal(await hash(key), env.MAINTENANCE_KEY_HASH))
      return json({ error: 'Invalid maintenance key.' }, 401);
    await cleanup(env.ANALYTICS_DB);
    return json({ ok: true });
  }
  if (path === '/api/dashboard/login' && request.method === 'POST') {
    if (!env.DASHBOARD_PASSWORD_HASH)
      return json({ error: 'Dashboard access is not configured.' }, 503);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return json({ error: 'Expected JSON.' }, 415);
    // Bound streamed input, including requests without Content-Length.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1024) {
          await reader.cancel();
          return json({ error: 'Request too large.' }, 413);
        }
        chunks.push(part.value);
      }
    }
    let data: unknown;
    try {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      data = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('password' in data) ||
      typeof data.password !== 'string' ||
      !data.password.length ||
      data.password.length > 256
    )
      return json({ error: 'Enter a valid dashboard access key.' }, 400);
    if (!equal(await hash(data.password), env.DASHBOARD_PASSWORD_HASH))
      return json({ error: 'Invalid dashboard access key.' }, 401);
    const session = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    await env.ANALYTICS_DB.prepare(
      'INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?,?)',
    )
      .bind(await hash(session), new Date(Date.now() + 8 * 3600000).toISOString())
      .run();
    return json({ ok: true }, 200, {
      'Set-Cookie': `${cookieName}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
    });
  }
  if (!path.startsWith('/api/dashboard')) return json({ error: 'Not found.' }, 404);
  const session = token(request);
  if (
    !/^[a-f0-9]{64}$/.test(session) ||
    !(await env.ANALYTICS_DB.prepare(
      'SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?',
    )
      .bind(await hash(session), now())
      .first())
  )
    return json({ error: 'Sign in to the dashboard.' }, 401);
  if (path === '/api/dashboard/logout' && request.method === 'POST') {
    await env.ANALYTICS_DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(await hash(session))
      .run();
    return json({ ok: true }, 200, {
      'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    });
  }
  if (['/api/dashboard/growth', '/api/dashboard/export'].includes(path) && request.method === 'GET')
    return json(
      await growthStatistics(env.ANALYTICS_DB),
      200,
      path.endsWith('/export')
        ? { 'Content-Disposition': 'attachment; filename="spider-analytics.json"' }
        : {},
    );
  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(
    request: Request,
    env: Environment,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== origin) return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env);
      } catch {
        return json({ error: 'Analytics is temporarily unavailable. Please retry.' }, 503);
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
      const protectedResponse = new Response(response.body, response);
      protectedResponse.headers.set('Cache-Control', 'no-store');
      protectedResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return protectedResponse;
    }
    const observation = pageObservation(request, response);
    if (observation && env.ANALYTICS_DB)
      context.waitUntil(
        recordPageView(env.ANALYTICS_DB, observation).catch(() => {
          console.error('Traffic aggregation failed.');
        }),
      );
    return response;
  },
};
