import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
const mode = process.argv[2];
const text = await readFile('LICENSE', 'utf8');
const publicDir =
  mode === 'hub' ? 'public' : mode === 'winter' ? 'apps/website/public' : 'demo/public';
await mkdir(publicDir, { recursive: true });
for (const [src, dst] of [
  ['LICENSE', 'license.txt'],
  ['LICENSE-MIT-LEGACY', 'license-mit-legacy.txt'],
  ['LICENSING.md', 'licensing.md'],
  ['licensing.json', 'licensing.json'],
])
  await copyFile(src, publicDir + '/' + dst);
if (mode === 'winter') {
  let source = await readFile('apps/website/src/legal.ts', 'utf8');
  const declaration = 'export const commercialLicenseText = ' + JSON.stringify(text) + ';';
  source = source.replace(
    /export const commercialLicenseText\s*=[\s\S]*?(?=export const mitLicenseText)/,
    '',
  );
  source = source.replace(
    'export const mitLicenseText',
    declaration + '\n\nexport const mitLicenseText',
  );
  await writeFile(
    'apps/website/src/legal.ts',
    await format(source, { ...(await resolveConfig('package.json')), parser: 'typescript' }),
  );
}
if (mode === 'hub') {
  const escape = (s) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const blocks = text
    .trim()
    .split(/\n\n/)
    .map((p) =>
      /^\d+\. /.test(p)
        ? '<h2>' + escape(p) + '</h2>'
        : '<p>' + escape(p).replaceAll('\n', '<br>') + '</p>',
    )
    .join('\n');
  await mkdir('license', { recursive: true });
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commercial licence — Fluri Themes</title><meta name="description" content="One €19 lifetime licence for all current and future Fluri themes on unlimited personal and client websites. Read the commercial terms and legacy MIT boundaries."><meta name="theme-color" content="#ff784f"><link rel="icon" href="/brand-mark-128.png"><link rel="stylesheet" href="/src/style.css"></head><body><a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="/" aria-label="Fluri Themes home"><img src="/brand-mark-128.png" width="42" height="42" alt=""><span>fluri<span>THEMES</span></span></a><nav aria-label="Main navigation"><a href="/#themes">THE THEMES ↗</a><a href="/">HOME ↗</a></nav></header><main id="main" class="license-page"><section class="license-hero"><span class="section-id">FLURI LIFETIME / €19 ONCE</span><h1>MAKE IT<br>YOUR WORLD.</h1><p>All current and future themes. Unlimited personal and client websites. One payment, lifetime use.</p><a class="license-contact" href="mailto:fluritheme@gmail.com?subject=Fluri%20Lifetime%20License">REQUEST YOUR LICENCE ↗</a><p class="license-note">Contact us to arrange your licence. Automated checkout is not available yet. Viewing the demos and private evaluation are free; production deployment requires a licence.</p></section><section class="license-details" aria-label="Full commercial licence"><a href="/license.txt" download>Download the full licence ↓</a>${blocks}<p><a href="/license-mit-legacy.txt">Historical MIT notice ↗</a> · <a href="/licensing.json">Version boundaries ↗</a></p></section></main><footer class="site-footer"><a href="/">FLURI THEMES</a><a href="/privacy/">PRIVACY</a></footer><script type="module" src="/src/main.ts"></script></body></html>`;
  await writeFile(
    'license/index.html',
    await format(html, { ...(await resolveConfig('package.json')), parser: 'html' }),
  );
}
