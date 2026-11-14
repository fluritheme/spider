import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const policy = JSON.parse(await readFile(new URL('licensing.json', root), 'utf8'));
const license = await readFile(new URL('LICENSE', root), 'utf8');
assert.ok(license.startsWith('FLURI THEMES COMMERCIAL LICENSE 1.0'));
assert.ok(license.includes('all current and future Fluri Themes'));
assert.ok(license.includes('unlimited personal, business and client websites'));
assert.ok(license.includes('does not replace, revoke or restrict the MIT license'));
const legacy = await readFile(new URL('LICENSE-MIT-LEGACY', root), 'utf8');
assert.ok(legacy.includes('MIT License'));
assert.ok(legacy.includes('does not license the current commercial release'));
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const parts =
  manifest.name === 'fluri-workspace'
    ? ['packages/core/', 'packages/react/']
    : manifest.private
      ? []
      : ['./'];
for (const part of parts) {
  const base = new URL(part, root);
  const pkg = JSON.parse(await readFile(new URL('package.json', base), 'utf8'));
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  assert.equal(pkg.homepage, 'https://fluri.xyz/');
  const boundary = policy.packages[pkg.name]?.firstCommercial ?? '0.1.0';
  const number = (v) =>
    v
      .split('.')
      .map(Number)
      .reduce((n, x) => n * 10000 + x, 0);
  assert.ok(
    number(pkg.version) >= number(boundary),
    'Do not overwrite the historical MIT release boundary',
  );
  assert.equal(
    await readFile(new URL('LICENSE', base), 'utf8'),
    license,
    'Commercial terms must match the canonical repository terms',
  );
  for (const f of ['LICENSE', 'LICENSE-MIT-LEGACY', 'LICENSING.md', 'licensing.json']) {
    await access(new URL(f, base));
    assert.ok(pkg.files.includes(f), 'Missing packaged licensing file: ' + f);
  }
}
console.log('Commercial licensing and legacy MIT boundaries verified.');
