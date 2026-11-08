import type { growthStatistics, PackageStatistics } from '../workers/growth';

type Growth = Awaited<ReturnType<typeof growthStatistics>>;
const escape = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const number = (value: number) => new Intl.NumberFormat('en').format(value);
const timestamp = (value: string | null) =>
  value ? `${new Date(value).toLocaleString()} (local time)` : 'Awaiting the first counted visit';

function chart(
  rows: { date: string; value: number }[],
  start: string,
  label: string,
  observedFrom = start,
): string {
  const values = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10);
    return {
      date,
      value: date < observedFrom ? null : (rows.find((row) => row.date === date)?.value ?? 0),
    };
  });
  const max = Math.max(1, ...values.map((row) => row.value ?? 0));
  const points = values
    .flatMap((row, i) =>
      row.value === null ? [] : [`${20 + (i * 560) / 29},${150 - (row.value * 130) / max}`],
    )
    .join(' ');
  const singlePoint = points && !points.includes(' ') ? points.split(',') : null;
  return `<svg class="impression-chart" viewBox="0 0 600 170" role="img" aria-label="${escape(label)}; exact counts in the daily table"><path class="chart-rule" d="M20 150H580"/><polyline class="chart-line" points="${points}"/>${singlePoint ? `<circle cx="${singlePoint[0]}" cy="${singlePoint[1]}" r="3" fill="var(--pumpkin)"/>` : ''}</svg><details class="service-details growth-daily" data-chart="${escape(label)}"><summary>Daily counts</summary><div class="service-table-wrap"><table class="service-table"><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Count</th></tr></thead><tbody>${values
    .slice()
    .reverse()
    .map(
      (row) =>
        `<tr><td>${row.date}</td><td>${row.value === null ? 'Not collected' : number(row.value)}</td></tr>`,
    )
    .join('')}</tbody></table></div></details>`;
}

function metric(label: string, value: number, help: string): string {
  return `<article class="metric-card"><p>${escape(label)}</p><strong>${number(value)}</strong><small>${escape(help)}</small></article>`;
}

function breakdown(rows: { label: string; views: number }[], total: number, title: string): string {
  return rows.length
    ? `<div class="service-table-wrap"><table class="service-table"><caption>${escape(title)} · last 30 days</caption><thead><tr><th scope="col">${escape(title)}</th><th scope="col">Requests</th><th scope="col">Share</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escape(row.label)}</td><td>${number(row.views)}</td><td>${total ? ((100 * row.views) / total).toFixed(1) : '0.0'}%</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="service-empty">Counts will appear after visitors open the public website.</p>';
}

function npmCard(stats: PackageStatistics): string {
  const statuses = {
    available: 'Reported by npm',
    pending: 'Stats pending',
    unpublished: 'Not published',
    unavailable: 'Temporarily unavailable',
  };
  return `<article class="service-card npm-stat-card"><div class="service-toolbar"><h3><a href="https://www.npmjs.com/package/${escape(stats.package)}" target="_blank" rel="noopener noreferrer">${escape(stats.package)} ↗</a></h3><span class="service-badge ${stats.status === 'available' ? 'is-verified' : 'is-pending'}">${statuses[stats.status]}</span></div>${
    stats.status === 'available'
      ? `<dl class="npm-totals"><div><dt>30 available days</dt><dd>${number(stats.downloads30d!)}</dd></div><div><dt>7 available days</dt><dd>${number(stats.downloads7d!)}</dd></div><div><dt>Latest reported day</dt><dd>${number(stats.latestDay!)}</dd></div></dl><p class="fine-print">Reported period: ${escape(stats.start!)} – ${escape(stats.end!)} (UTC).</p>${chart(
          stats.daily.map((row) => ({ date: row.date, value: row.downloads })),
          stats.start!,
          `Daily npm downloads for ${stats.package}`,
        )}`
      : `<p class="service-empty">${stats.status === 'pending' ? 'The package is published. npm has not produced its first download report yet. Usually available after its next daily processing cycle.' : stats.status === 'unpublished' ? 'The public npm registry did not find this package.' : 'npm statistics could not be retrieved. They will be retried automatically; missing data is not zero downloads.'}</p>`
  }<p class="fine-print">Last checked: ${escape(timestamp(stats.checkedAt))}.</p></article>`;
}

export function renderGrowth(result: Growth): string {
  const site = result.website;
  return `<div class="growth-heading"><span class="eyebrow">GROWTH & DISCOVERY</span><h2>A little spider. A growing web.</h2><p>Website traffic and package downloads, with a clear source for every number.</p></div><div class="dashboard-metrics">${metric('Website requests · today', site.viewsToday, 'Public HTML pages · UTC today')}${metric('Website requests · 7 days', site.views7d, 'Includes repeat page opens')}${metric('Website requests · 30 days', site.views30d, 'Approximate traffic, not unique people')}</div><div class="dashboard-grid growth-traffic"><section class="service-card"><h3>Daily website traffic</h3><p>Successful public page requests on spider.fluri.xyz. Common bots and prefetches are filtered; some automated traffic can remain.</p>${
    site.startedAt
      ? chart(
          site.daily.map((row) => ({ date: row.date, value: row.views })),
          site.start,
          'Daily website page requests',
          site.startedAt.slice(0, 10),
        )
      : '<p class="service-empty"><strong>A fresh start.</strong>Traffic collection begins with this deployment. Earlier visits are not available.</p>'
  }<p class="fine-print">Collection started: ${escape(timestamp(site.startedAt))}.<br/>Last counted request: ${escape(timestamp(site.lastReceivedAt))}.</p></section><section class="service-card"><h3>Where requests came from</h3>${breakdown(
    site.referrers.map((row) => ({ label: row.source, views: row.views })),
    site.views30d,
    'Referral source',
  )}<p class="fine-print">Based on the HTTP referrer when supplied. Direct / unknown includes bookmarks, apps, private browsing and stripped referrers. Internal navigation counts clicks between our own pages. Other websites groups unrecognised sources; full referrer URLs are never stored.</p></section></div><section class="service-card dashboard-sites"><h3>Popular pages</h3>${breakdown(
    site.pages.map((row) => ({ label: row.path, views: row.views })),
    site.views30d,
    'Public page',
  )}<p class="fine-print">No cookies, visitor identifiers or cross-site profiles. Requests with Do Not Track or Global Privacy Control enabled are excluded. Only daily counts by fixed public page and broad source category are retained, for up to 90 days.</p></section><div class="growth-heading"><span class="eyebrow">PACKAGE DISCOVERY</span><h2>npm downloads</h2><p>Official download totals for each package. These include CI and repeat installations, and are not npm page views, unique people or website installations.</p></div><div class="npm-stat-grid">${result.packages.map(npmCard).join('')}</div><p class="fine-print growth-note">npm publishes statistics daily, usually after UTC midnight. Available reports are cached for one hour; pending reports are retried after five minutes. Opening an npm package page does not increment downloads.</p><section class="service-card github-traffic"><h3>GitHub repository traffic</h3><p>GitHub provides repository views, unique visitors, clones and referral sources for a rolling 14-day window. View and clone data update hourly; referrals update daily. These private figures are available to repository collaborators on GitHub.</p><a class="text-link" href="https://github.com/fluritheme/spider/graphs/traffic" target="_blank" rel="noopener noreferrer">Open GitHub traffic report ↗</a></section>`;
}
