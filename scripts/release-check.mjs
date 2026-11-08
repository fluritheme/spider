import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.name, '@fluritheme/spider');
assert.equal(manifest.publishConfig.access, 'public');
assert.ok(!manifest.dependencies && !manifest.peerDependencies);
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  }),
)[0];
for (const name of ['dist/index.js', 'dist/index.d.ts', 'README.md', 'LICENSE', 'CHANGELOG.md'])
  assert.ok(
    packed.files.some((f) => f.path === name),
    `Missing ${name}`,
  );
assert.ok(
  packed.files.every((f) =>
    /^(dist\/|README.md$|LICENSE$|CHANGELOG.md$|package.json$)/.test(f.path),
  ),
);
let bytes = 0;
for (const f of packed.files.filter((f) => f.path.endsWith('.js')))
  bytes += gzipSync(await readFile(new URL(`../${f.path}`, import.meta.url))).length;
assert.ok(
  bytes < 24000,
  'Runtime gzip budget exceeded (24 kB across individually compressed modules)',
);
const { createSpider } = await import('../dist/index.js');
const controller = createSpider();
assert.equal(controller.getState().state, 'idle');
controller.destroy();
console.log(
  `Verified ${manifest.name}@${manifest.version}: ${packed.entryCount} files, ${packed.size} archive bytes, ${bytes} gzip JS bytes (individual modules). SSR import passed.`,
);
