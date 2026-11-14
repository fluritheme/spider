import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const packages = manifest.private ? ['packages/core', 'packages/react'] : ['.'];
for (const relative of packages) {
  const source = join(root, relative);
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  assert.equal(
    pkg.license,
    'MIT',
    'Commercial editions are distributed through npm and Fluri. Existing JSR MIT releases are preserved.',
  );
  const name = pkg.name.split('/')[1];
  const destination = join(root, '.wrangler', 'jsr', name);
  await mkdir(destination, { recursive: true });
  await cp(join(source, 'src'), join(destination, 'src'), { recursive: true });
  for (const file of ['README.md', 'LICENSE'])
    await cp(join(source, file), join(destination, file));
  // JSR imports TypeScript directly; keep npm's .js import paths in the original source.
  async function rewrite(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await rewrite(file);
      else if (/\.tsx?$/.test(file)) {
        let text = await readFile(file, 'utf8');
        text = text.replace(
          /(from\s+|import\s*\()(['"])(\.[^'"]+)\2/g,
          (_all, prefix, quote, specifier) => {
            let next = specifier.replace(/\.js$/, '.ts');
            if (!/\.tsx?$/.test(next)) next += '.ts';
            return `${prefix}${quote}${next}${quote}`;
          },
        );
        text = text.replace(/(from\s+)(['"])(@fluritheme\/fluri)\2/g, '$1$2npm:$3@^0.1.1$2');
        await writeFile(file, text);
      }
    }
  }
  await rewrite(join(destination, 'src'));
  const imports = {};
  for (const [dependency, version] of Object.entries(pkg.dependencies ?? {}))
    imports[dependency] = `npm:${dependency}@${version}`;
  if (name === 'fluri-react') imports.react = 'npm:react@^19.3.1';
  const config = {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    exports: {
      '.': './src/index.ts',
      ...(name === 'fluri' ? { './christmas': './src/christmas.ts' } : {}),
    },
    compilerOptions: { lib: ['dom', 'dom.iterable', 'esnext'] },
    publish: { include: ['src', 'README.md', 'LICENSE'] },
    ...(Object.keys(imports).length ? { imports } : {}),
  };
  await writeFile(join(destination, 'jsr.json'), JSON.stringify(config, null, 2) + '\n');
  console.log(
    `Prepared ${pkg.name}@${pkg.version}. Run deno publish --dry-run from ${destination}, then deno publish.`,
  );
}
