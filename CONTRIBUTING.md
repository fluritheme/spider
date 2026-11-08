# Contributing

Use Node 22.12+ and pnpm 10.33.2. Run `pnpm install`, then `pnpm exec playwright install --with-deps chromium firefox webkit`.

`pnpm dev` serves the playground. Runtime code lives in `src/`; the site lives in `demo/`. Keep the runtime dependency-free and safe to import without browser globals.

Before opening a pull request, run `pnpm check`, `pnpm format:check`, and `pnpm release:check`. Add focused tests for changes to movement, cleanup, occlusion, and accessibility behavior. Avoid nondeterministic assertions: browser fixtures can seed `Math.random` before creating an instance.

The public API is exported from `src/index.ts` and `src/types.ts`. Document behavior changes and geometry limitations in the README. Keep artwork original, and retain any third-party asset licenses.

Publishing is a maintainer operation. `pnpm deploy` publishes the site to the separate `fluri-spider` Cloudflare Worker; it does not affect the main Fluri Worker. The release workflow publishes only this npm package and verifies checks first.
