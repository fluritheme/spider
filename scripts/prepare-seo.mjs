import { format, resolveConfig } from 'prettier';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const decode = (s) =>
  s
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
const mode = process.argv[2] ?? 'hub';
const settings = {
  hub: {
    origin: 'https://fluri.xyz',
    public: 'public',
    files: ['index.html', 'founder/index.html', 'privacy/index.html'],
    name: 'Fluri Themes',
    image: 'https://fluri.xyz/social.png',
    keywords: [
      'interactive website effects',
      'JavaScript website animations',
      'React website effects',
      'František Gejdoš',
      'Fluri Themes',
    ],
  },
  spider: {
    origin: 'https://spider.fluri.xyz',
    public: 'demo/public',
    files: [
      'demo/index.html',
      'demo/privacy/index.html',
      'demo/public/framer/index.html',
      'demo/public/framer/guide.html',
    ],
    name: 'Spider by Fluri',
    image: 'https://spider.fluri.xyz/social.png',
    keywords: [
      'animated website spider',
      'JavaScript spider animation',
      'realistic spider webs',
      'Halloween website effects',
      'Framer spider component',
    ],
  },
  winter: {
    origin: 'https://winter.fluri.xyz',
    public: 'dist',
    files: [],
    name: 'Winter by Fluri',
    image: 'https://winter.fluri.xyz/art/social-card.png',
    keywords: [
      'JavaScript snow animation',
      'React snowfall effect',
      'DOM snow accumulation',
      'Christmas website effects',
      'interactive snow physics',
      'Framer snow component',
    ],
  },
  grinch: {
    origin: 'https://grinch.fluri.xyz',
    public: 'demo/public',
    files: ['demo/index.html'],
    name: 'Grinch by Fluri',
    image: 'https://grinch.fluri.xyz/social.png',
    keywords: [
      'Grinch website animation',
      'Christmas website character',
      'holiday website effects',
      'animated holiday presents',
    ],
  },
}[mode];
if (!settings) throw Error('Unknown site');
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
async function htmlFiles(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await htmlFiles(f)));
    else if (f.endsWith('.html')) files.push(f);
  }
  return files;
}
if (mode === 'winter')
  settings.files = (await htmlFiles('dist')).filter(
    (f) => !f.includes('/dashboard/') && !f.endsWith('/404.html'),
  );
const urls = [];
for (const file of settings.files) {
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  if (/name="robots"[^>]*noindex/.test(html)) continue;
  let relative =
    mode === 'winter'
      ? file.replace(/^dist\//, '')
      : mode === 'spider'
        ? file.replace(/^demo\/(?:public\/)?/, '')
        : file.replace(/^demo\//, '');
  relative = relative.replace(/index\.html$/, '');
  const canonical = new URL(relative.replace(/\.html$/, ''), settings.origin + '/').href;
  let title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? settings.name;
  let description = html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]+)"/)?.[1];
  if (!description)
    description = file.includes('guide.html')
      ? `Set up ${settings.name} in Framer. Add the component, tune the effect, and respect visitor motion preferences.`
      : `Explore ${settings.name}: interactive website effects created by František Gejdoš, founder of Fluri Themes.`;
  title = decode(title);
  description = decode(description);
  function meta(name, value, property = false) {
    const attr = property ? 'property' : 'name',
      rx = new RegExp(`<meta\\b[^>]*${attr}="${name}"[^>]*>`, 'g');
    html = html.replace(rx, '');
    html = html.replace('</head>', `<meta ${attr}="${name}" content="${escape(value)}"/>\n</head>`);
  }
  html = html.replace(/<link\b[^>]*rel="canonical"[^>]*>/g, '');
  html = html.replace('</head>', `<link rel="canonical" href="${escape(canonical)}"/>\n</head>`);

  meta('description', description);
  meta('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  meta('author', 'František Gejdoš');
  meta('msvalidate.01', '2DA9F1E4496B9F72E22C73EBF6FEA09A');
  meta('og:site_name', settings.name, true);
  meta('og:title', title, true);
  meta('og:description', description, true);
  meta('og:url', canonical, true);
  const image =
    html.match(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? settings.image;
  meta('og:image', image, true);
  meta('og:image:width', '1200', true);
  meta('og:image:height', '630', true);
  meta('og:image:alt', `${settings.name} — interactive website effects by Fluri Themes`, true);
  meta('twitter:card', 'summary_large_image');
  meta('twitter:title', title);
  meta('twitter:description', description);
  meta('twitter:image', image);
  if (!html.includes('property="og:type"')) meta('og:type', 'website', true);
  const page = {
    '@context': 'https://schema.org',
    '@type': file.includes('guide') ? 'TechArticle' : 'WebPage',
    '@id': canonical + '#page',
    url: canonical,
    name: title,
    description,
    inLanguage: 'en',
    isPartOf: { '@id': settings.origin + '/#website' },
    publisher: { '@id': 'https://fluri.xyz/#organization' },
    about: { '@id': settings.origin + '/#software' },
  };
  if (!html.includes('application/ld+json'))
    html = html.replace(
      '</head>',
      `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', '@id': settings.origin + '/#website', name: settings.name, url: settings.origin + '/' }, page, { '@type': 'Person', '@id': 'https://fluri.xyz/#founder', name: 'František Gejdoš', alternateName: 'Frantisek Gejdos', url: 'https://fluri.xyz/founder/', jobTitle: 'Founder of Fluri Themes' }] }).replaceAll('<', '\\u003c')}</script>\n</head>`,
    );
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (all, body) => {
    const graph = JSON.parse(body);
    const entities = graph['@graph'] ?? [graph];
    for (const e of entities) {
      if (['SoftwareSourceCode', 'SoftwareApplication', 'WebSite'].includes(e['@type']))
        e.keywords = settings.keywords;
      if (e['@type'] === 'SoftwareApplication') delete e.programmingLanguage;
      if (e['@type'] === 'Person' && e['@id'] === 'https://fluri.xyz/#founder') {
        e.name = 'František Gejdoš';
        e.alternateName = 'Frantisek Gejdos';
        e.jobTitle = 'Founder of Fluri Themes';
        e.worksFor = { '@id': 'https://fluri.xyz/#organization' };
      }
    }
    return `<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<', '\\u003c')}</script>`;
  });
  if (/<div id="(?:root|app)"><\/div>/.test(html) && !html.includes('<noscript>')) {
    html = html.replace(
      '</body>',
      `<noscript><main><h1>${escape(title)}</h1><p>${escape(description)}</p><p>The interactive demo needs JavaScript. Read the <a href="${settings.origin}/docs/">documentation</a> or return to <a href="${settings.origin}/">${settings.name}</a>.</p></main></noscript></body>`,
    );
  }
  await writeFile(
    file,
    await format(html, { ...(await resolveConfig('package.json')), parser: 'html' }),
  );
  urls.push(canonical);
}
await mkdir(settings.public, { recursive: true });
await writeFile(
  path.join(settings.public, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api/\nDisallow: /internal/\nSitemap: ${settings.origin}/sitemap.xml\n`,
);
await writeFile(
  path.join(settings.public, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map((url) => `<url><loc>${escape(url)}</loc></url>`).join('')}</urlset>\n`,
);
const candidates = (await readdir(settings.public)).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));
let key = candidates[0]?.slice(0, -4);
if (!key) {
  key = randomBytes(16).toString('hex');
  await writeFile(path.join(settings.public, key + '.txt'), key);
}
await writeFile(
  path.join(settings.public, 'indexnow.json'),
  JSON.stringify(
    {
      host: new URL(settings.origin).host,
      key,
      keyLocation: `${settings.origin}/${key}.txt`,
      urlList: [...new Set(urls)],
    },
    null,
    2,
  ) + '\n',
);
if (mode === 'hub')
  await writeFile(
    path.join(settings.public, 'sitemap-index.xml'),
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['fluri.xyz', 'winter.fluri.xyz', 'spider.fluri.xyz', 'grinch.fluri.xyz'].map((h) => `<sitemap><loc>https://${h}/sitemap.xml</loc></sitemap>`).join('')}</sitemapindex>`,
  );
const manifestPath = path.join(settings.public, 'indexnow.json');
await writeFile(
  manifestPath,
  await format(await readFile(manifestPath, 'utf8'), {
    ...(await resolveConfig('package.json')),
    parser: 'json',
  }),
);
console.log(
  `Prepared ${urls.length} canonical pages, crawler access and IndexNow for ${settings.origin}.`,
);
