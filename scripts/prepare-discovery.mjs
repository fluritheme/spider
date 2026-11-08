import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
await mkdir(new URL('demo/public/readme/', root), { recursive: true });
await writeFile(
  new URL('demo/public/readme/npm-version.svg', root),
  `<svg xmlns="http://www.w3.org/2000/svg" width="118" height="24" role="img" aria-label="npm version: ${version}"><title>npm version: ${version}</title><rect width="118" height="24" rx="4" fill="#281f1a"/><path d="M45 0h73v24H45z" fill="#b94323"/><g fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle"><text x="22" y="16">npm</text><text x="81" y="16">v${version}</text></g></svg>`,
);
