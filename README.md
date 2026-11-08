<div align="center">

# Spider by Fluri

**A little life for your website.**

A tiny jumping spider that explores your page, spins delicate silk, blinks, startles at your cursor, and slips behind real objects.

[Live playground](https://spider.fluri.xyz/) · [npm](https://www.npmjs.com/package/@fluritheme/spider) · [API](#options) · [Contributing](https://github.com/fluritheme/spider/blob/main/CONTRIBUTING.md)

[![npm version](https://img.shields.io/npm/v/@fluritheme/spider.svg?color=bd4b29)](https://www.npmjs.com/package/@fluritheme/spider)
[![MIT license](https://img.shields.io/badge/license-MIT-74716d.svg)](https://github.com/fluritheme/spider/blob/main/LICENSE)
[![Quality](https://github.com/fluritheme/spider/actions/workflows/ci.yml/badge.svg)](https://github.com/fluritheme/spider/actions/workflows/ci.yml)

</div>

![The real Spider package exploring, weaving, and hiding in the live demo](https://raw.githubusercontent.com/fluritheme/spider/main/assets/readme/spider.gif)

## Meet your smallest resident

- **A whole document to explore.** It walks beyond its web, rests, weaves, and takes shelter behind cards and other objects. Scrolling moves the spider and its silk with the document.
- **A carefully drawn jumping spider.** Eight articulated legs, alternating footfalls, fine fuzz, sand-colored markings, glossy eyes, and a quiet blink. Its palette stays stable as it crosses light and dark content; a fine outline provides contrast.
- **Silk it actually makes.** The spider descends on a thread, attaches to real letter and object edges, traverses support cables, then stitches curved cross-threads. Roaming mode never spawns a complete net. Finished sections stay until erased or the bounded history fills.
- **Aware of layers.** Web anchors follow DOM geometry; hiding uses rounded object silhouettes, including ordinary nested 2D transforms. The optional hanging mode also clips corner-web visibility using browser hit-testing.
- **A good guest.** Zero runtime dependencies, no CSS imports, no network requests, no telemetry, and no changes to your elements' styles or markup.
- **Ready for real websites.** Touch reactions, responsive webs, reduced-motion support, high-DPI rendering with a bounded backing store, SSR-safe imports, and complete cleanup.

### Previews

**Silk woven around actual page lettering.**

![Spider weaving around the live page heading](https://raw.githubusercontent.com/fluritheme/spider/main/assets/readme/woven-page.png)

**The playground — real canvas rendering, real DOM elements.**

![Spider playground with delicately woven cards and customization controls](https://raw.githubusercontent.com/fluritheme/spider/main/assets/readme/playground.png)

**A closer look — the original procedural jumping-spider design.**

![Detailed jumping spider with articulated striped legs and glossy eyes on light and dark surfaces](https://raw.githubusercontent.com/fluritheme/spider/main/assets/readme/character.png)

**Small screens, thoughtfully handled.**

<img src="https://raw.githubusercontent.com/fluritheme/spider/main/assets/readme/mobile.png" alt="Spider's responsive playground on a phone" width="390" />

## Install

```sh
npm install @fluritheme/spider
```

```html
<article data-spider-web="top-right">A little room for a little resident.</article>
```

```ts
import { createSpider } from '@fluritheme/spider';

// Call after your page's elements have mounted.
const spider = createSpider();

// It descends on silk, then explores the document and weaves each strand.
// It uses cards, buttons, images, and marked objects as shelter.

// On navigation or component unmount:
spider.destroy();
```

No required stylesheet, wrapper, asset download, or framework adapter. The package draws its own vector spider and silk.

### Plain HTML / CDN

```html
<article data-spider-web="top-left">Hello, little friend.</article>
<script type="module">
  import { createSpider } from 'https://cdn.jsdelivr.net/npm/@fluritheme/spider@0.1.0/dist/index.js';
  const spider = createSpider();
</script>
```

Pin the version when using a CDN. The CDN request is your chosen delivery mechanism; the library itself makes no network requests.

### React / Next.js

Mount one controller per page or use a shared layout. Cleanup is safe under React Strict Mode. Next.js App Router components need `'use client'`.

```tsx
'use client';

import { useEffect } from 'react';
import { createSpider } from '@fluritheme/spider';

export function SpiderResident() {
  useEffect(() => {
    const spider = createSpider({ size: 1, fearRadius: 110 });
    return () => spider.destroy();
  }, []);
  return null;
}

// Elsewhere in your page:
// <article data-spider-web="top-right">...</article>
```

### Vue

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { createSpider, type SpiderController } from '@fluritheme/spider';

let spider: SpiderController | undefined;
onMounted(() => {
  spider = createSpider();
});
onUnmounted(() => spider?.destroy());
</script>

<template>
  <article data-spider-web="bottom-right">A little company.</article>
</template>
```

Svelte, Astro, and other frameworks can use the same `createSpider()` / `destroy()` pair in their client lifecycle. Calling during SSR returns an idle controller; create a new one after client mount to start the effect.

## Choose its world

```ts
const spider = createSpider({
  targets: '.card, [data-spider-web]',
  objects: '.card, button, img, [data-spider-object]',
  maxWebs: 6,
  spiders: 1,
  size: 1.1,
  webSize: 120,
  fearRadius: 130,
  speed: 1,
});
```

`targets` controls where webs attach. **It does not confine the roaming spider.** By default, roaming covers the document. Its coordinates stay attached to the page as you scroll; it does not follow the screen.

To keep it in a specific area:

```ts
const spider = createSpider({
  root: document.querySelector<HTMLElement>('#playground')!,
  territory: 'root',
});
```

For an explicitly decorative corner-web mode instead of exploration and physical weaving:

```ts
const spider = createSpider({ roam: false });
```

### HTML attributes

| Attribute            | Purpose                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-spider-web`    | Attach a corner web. Optional value: `top-left`, `top-right`, `bottom-left`, `bottom-right`.                                                |
| `data-spider-object` | Treat this element as an object the spider can hide behind.                                                                                 |
| `data-spider-text`   | Use this element's letter rectangles as silk attachment points, alongside `h1` and `h2`.                                                    |
| `data-spider-ignore` | Exclude this element and its descendants from web selection, text silk, and shelter selection. It does not create a roaming exclusion zone. |

Without explicit `targets`, the library uses `[data-spider-web]` elements. If none exist, it falls back to a bounded set of `article`, `aside`, and `section` elements. A bare page still gets a roaming spider. Rich webs need enough non-collinear letter or object anchors.

Webs use the first `maxWebs` selected elements in document order, including offscreen targets. Add explicit attributes or selectors for large pages. Heading silk is limited to the first four headings/marked text elements and 48 letters per heading, with two edge anchors per letter. No text nodes are wrapped, split, or replaced.

## Options

All options are optional. Values outside the documented bounds throw before installing the effect.

| Option       | Default    | Description                                                                                                                                 |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`       | `document` | Current document or an `HTMLElement` in it. Scopes web and heading discovery.                                                               |
| `targets`    | automatic  | CSS selector or readonly array of elements for corner webs.                                                                                 |
| `roam`       | `true`     | Explore, weave short trails, and hide. `false` hangs from a web.                                                                            |
| `territory`  | `'page'`   | `'page'` explores the visible viewport; `'root'` uses the root element's visible rectangle.                                                 |
| `objects`    | see below  | Selector for shelter objects, selected from the current document.                                                                           |
| `maxWebs`    | `6`        | Integer, 1–24.                                                                                                                              |
| `spiders`    | `1`        | Integer, 1–8. Hanging mode also needs enough visible web targets.                                                                           |
| `webSize`    | `112`      | 40–240 CSS px. Controls the preferred woven pocket size; hanging-mode corner webs are also capped by their element.                         |
| `size`       | `1`        | Spider scale, 0.5–2.                                                                                                                        |
| `speed`      | `1`        | Movement and behavior speed, 0.25–3.                                                                                                        |
| `fearRadius` | `110`      | 0–300 CSS px; `0` disables pointer fear.                                                                                                    |
| `color`      | `'auto'`   | A CSS color for silk and the spider's middle tones. Auto keeps a fixed sable spider palette and adapts corner silk to each host background. |
| `webOpacity` | `0.4`      | Silk opacity, 0–1. `0` removes decorative silk while keeping the spider.                                                                    |
| `zIndex`     | `100`      | Canvas stacking level, signed 32-bit integer. Native top-layer dialogs stay above it.                                                       |
| `motion`     | `'system'` | `'system'`, `'full'`, or `'none'`. System follows `prefers-reduced-motion`, including changes while mounted.                                |
| `weave`      | `true`     | Progressive decorative corner webs in hanging mode. Roaming always physically lays its strands, even when false.                            |
| `observe`    | `true`     | Observe DOM/element changes and periodically refresh moving geometry while animating.                                                       |

The default `objects` selector is:

```css
[data-spider-object], [data-spider-web], article, aside, button,
input, select, textarea, img, video, pre, .code-panel
```

Shelter discovery inspects at most 100 matches, ignores very large surfaces and invisible objects, and supports ordinary nested 2D transforms. Marking a semitransparent object as shelter treats its silhouette as opaque while hiding.

## Controller

```ts
spider.pause(); // Freeze the resident and stop its animation loop.
spider.resume(); // Continue from the current state.
spider.refresh(); // Queue geometry, clipping, object, and background remeasurement.
spider.getState(); // Read a copied snapshot, including laid thread counts.
spider.clearWebs(); // Remove all silk; the spider can begin weaving again.
spider.update({ size: 1.2, webOpacity: 0.5 }); // Keep existing webs.
spider.destroy(); // Cancel frames, remove listeners/observers, and remove the canvas.
```

**Erase a whole woven section:** hold **Shift + the primary mouse button**, then sweep across its silk. A 24px brush removes the whole construction group, rather than cutting a few pixels. Ordinary clicks pass through; only a successful Shift erasure suppresses its associated click. Touch users can call `clearWebs()` from a normal button, as the demo does.

`getState()` returns a state (`running`, `paused`, `destroyed`, or SSR `idle`), `reducedMotion`, the visible web-target count, and resident coordinates/visibility/behavior/laid-thread counts. Behavior is `descending`, `exploring`, `weaving`, `hiding`, `resting`, `fleeing`, or `hanging`. Roaming coordinates are CSS pixels in the document; subtract `scrollX`/`scrollY` for viewport coordinates. Hanging-mode coordinates are viewport-relative. `visible` describes whether the resident's center is onscreen and unoccluded; a few legs may still peek out.

`destroy()` is idempotent. After destruction, the controller stays destroyed; create a new controller to restart. `update()` changes size, speed, fear radius, color, web opacity, web density, or web size without destroying silk. Structural options require a new instance. Multiple independent controllers are supported, but one page-wide instance usually looks best.

## Layers, performance, and honest limits

Roaming silk uses document coordinates. Letter and edge anchors retain their identities across remeasurement, so completed supports follow ordinary layout changes. Each construction plan builds foundation cables, traverses them, and stitches sagging, slightly irregular cross-threads. Only the portion physically laid by the spider is drawn. A dragline keeps it connected while exploring or fleeing.

The overlay never sets `position`, `z-index`, or other styles on your content. Corner webs combine target rectangles, rounded corners, overflow bounds, and a **12px browser hit-test visibility grid**. In optional hanging mode, a cached mask accounts for ordinary foreground siblings, nested stacking contexts, and clipped scrolling containers. Roaming residents can deliberately enter a rear plane; their body and legs are clipped against cached shelter silhouettes, then emerge past the edge.

This is decorative geometry, not a complete CSS compositor:

- Corner webs use axis-aligned bounding rectangles. Rotated card boundaries are sampled; large rotations, perspective, irregular `clip-path`, transparent cutouts, masks, and asymmetric/percentage corner radii are approximated.
- Shelter silhouettes handle affine 2D transforms, but not perspective, per-pixel image transparency, or every nested overflow combination. Overlapping shelters are clipped as a union.
- Pointer-transparent foreground layers are not fully represented by browser hit-testing. Shadow DOM interiors, cross-document iframes, canvas contents, and individual glyph outlines are not traversed.
- Heading attachments use letter rectangles, not exact font outlines. Roaming woven strands are foreground silk; the hanging-mode corner-web occlusion mask does not apply to them. Decorative silk can cross text.
- Auto web contrast samples the nearest mostly opaque ancestor background. Image/gradient backgrounds and translucent compositing can need an explicit `color`.
- The resident and silk stay in document space. Scrolling can take the spider out of view; it is not teleported back to the viewport. Shelter discovery is limited to currently visible objects, so offscreen hiding is approximate.
- For correct fixed positioning, avoid a transformed/filter-containing `body` or `html`. Use `zIndex` to keep your app's custom dialogs above the effect.

Geometry refreshes on scroll, resize, observed changes, and approximately every 750ms while animating. The backing store is capped at two device pixels per CSS pixel and six million pixels total. Completed silk does not fade on a timer. Each resident keeps at most 12 construction groups; the oldest whole groups are removed as new groups exceed that limit. Each thread is a small vector record. There is no frame loop in reduced-motion mode or while paused/hidden. A paused controller can still redraw after layout invalidation.

Browsers: modern Chrome/Edge, Firefox, Safari, and their mobile versions supporting Canvas 2D, `Path2D`, `roundRect`, `DOMMatrix`, `ResizeObserver`, and pointer events. The test suite exercises Chromium, Firefox, WebKit, and an iPhone-sized touch context. These checks are not a guarantee for every physical device.

## Accessibility and privacy

The canvas is `aria-hidden` and `pointer-events: none`; content remains clickable and selectable. Touch listeners are passive and do not prevent native scrolling. Reduced motion stops walking, blinking, weaving, and pointer reactions, leaving a still spider and any silk already made. A new reduced-motion instance creates no automatic roaming nets. Native dialogs and other browser top-layer UI are above the effect. Offer a visible off switch if the decoration is prominent in your product.

The npm runtime has no dependencies, trackers, storage, network calls, or remote assets. The demo self-hosts its fonts and assets. If your Content Security Policy restricts inline style attributes, allow the canvas positioning style through your policy or adapt those styles in a local integration.

## Development

```sh
pnpm install
pnpm dev                 # http://127.0.0.1:5198
pnpm check               # types, unit tests, build, site build, browser tests
pnpm format:check
pnpm release:check       # SSR import, archive allowlist, dependency and size checks
pnpm deploy              # Cloudflare Worker: spider.fluri.xyz
```

Install test browsers once with `pnpm exec playwright install --with-deps chromium firefox webkit`. See [CONTRIBUTING.md](https://github.com/fluritheme/spider/blob/main/CONTRIBUTING.md) and [SECURITY.md](https://github.com/fluritheme/spider/blob/main/SECURITY.md). Readme previews are captured from the real package with `node scripts/capture-previews.mjs` while the dev server is running (FFmpeg is required for the GIF).

## License

[MIT](https://github.com/fluritheme/spider/blob/main/LICENSE). Made by [Fluri](https://fluri.xyz/). Original procedural character artwork is included under the same license. Self-hosted demo fonts retain their SIL Open Font Licenses in `demo/public/fonts/`.
