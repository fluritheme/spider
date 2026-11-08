import { npmStatistics } from './growth';

export function badge(label: string, value: string): string {
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
    );
  const left = label.length * 7 + 20,
    right = value.length * 7 + 20,
    width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${escape(label)}: ${escape(value)}"><title>${escape(label)}: ${escape(value)}</title><rect width="${width}" height="24" rx="4" fill="#281f1a"/><path d="M${left} 0h${right}v24H${left}z" fill="#b94323"/><g fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle"><text x="${left / 2}" y="16">${escape(label)}</text><text x="${left + right / 2}" y="16">${escape(value)}</text></g></svg>`;
}
export async function downloadsBadge(request: Request): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const stats = await npmStatistics('@fluritheme/spider');
  const value =
    stats.status === 'available' && stats.downloads30d !== null
      ? `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.downloads30d)} / 30d`
      : stats.status === 'pending'
        ? 'pending'
        : 'unavailable';
  return new Response(request.method === 'HEAD' ? null : badge('npm downloads', value), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${stats.status === 'available' ? 3600 : 60}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
