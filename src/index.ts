import { clamp, escapeOffset, type Point } from './geometry.js';
import { isVisible, measureSurface, type Surface } from './layers.js';
import { resolveOptions } from './options.js';
import { paintSpider, paintWeb } from './paint.js';
import type { SpiderController, SpiderOptions, SpiderSnapshot, SpiderTuning } from './types.js';
export type {
  Corner,
  SpiderController,
  SpiderOptions,
  SpiderSnapshot,
  SpiderTuning,
} from './types.js';
import { pageObjects, outsideObjects, type PageObject } from './objects.js';
import { makeResident, stepResident, paintThreads, type Resident as Roamer } from './resident.js';
import { measureNetwork, type SilkNetwork } from './silk.js';
import { silkWhite, strokeSilk } from './silk-paint.js';
interface Resident {
  element: HTMLElement;
  x: number;
  y: number;
  scared: boolean;
  visible: boolean;
}

/** Create a decorative, non-interactive overlay. Importing and calling in SSR are safe no-ops. */
export function createSpider(input: SpiderOptions = {}): SpiderController {
  const options = resolveOptions(input);
  let state: SpiderSnapshot['state'] = 'idle';
  let reduced = options.motion === 'none';
  let surfaces: Surface[] = [],
    residents: Resident[] = [];
  let roamers: Roamer[] = [],
    objects: PageObject[] = [],
    network: SilkNetwork = { anchors: [], retained: new Map() };
  let worldObjects: PageObject[] = [];
  const snapshot = (): SpiderSnapshot => ({
    state,
    reducedMotion: reduced,
    webs: surfaces.length,
    spiders: options.roam
      ? roamers.map(({ x, y, scared, visible, behavior, threads }) => ({
          x,
          y,
          scared,
          visible,
          behavior,
          threads: threads.length,
        }))
      : residents.map(({ x, y, scared, visible }) => ({
          x,
          y,
          scared,
          visible,
          behavior: 'hanging' as const,
          threads: 0,
        })),
  });
  const noop: SpiderController = {
    refresh() {},
    clearWebs() {},
    update(patch) {
      resolveOptions({ ...options, ...patch });
    },
    pause() {},
    resume() {},
    destroy() {
      state = 'destroyed';
    },
    getState: snapshot,
  };
  if (typeof window === 'undefined' || typeof document === 'undefined') return noop;
  const win = window,
    doc = document;
  const root = input.root ?? doc;
  if (root !== doc && (root.nodeType !== 1 || root.ownerDocument !== doc))
    throw new TypeError('Spider: root must belong to the current document.');
  if (
    input.targets !== undefined &&
    typeof input.targets !== 'string' &&
    !Array.isArray(input.targets)
  )
    throw new TypeError('Spider: targets must be a selector or an array of elements.');
  doc.querySelector(options.objects);
  if (typeof input.targets === 'string') root.querySelector(input.targets); // Fail before installing listeners for an invalid selector.
  if (options.color !== 'auto' && !CSS.supports('color', options.color))
    throw new TypeError('Spider: color must be a valid CSS color.');
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return noop;
  canvas.setAttribute('data-fluri-spider', '');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none!important;z-index:${options.zIndex};display:block;contain:strict;`;
  (doc.body ?? doc.documentElement).append(canvas);
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = options.motion === 'none' || (options.motion === 'system' && media.matches);
  let frame: number | null = null,
    dirty = true,
    lastTime = 0,
    clock = 0,
    width = 0,
    height = 0,
    dpr = 1;
  let lastMeasure = -Infinity;
  let silkCleared = false;
  let pointer: Point | null = null,
    pointerUntil = Infinity;
  const birth = new WeakMap<HTMLElement, number>();
  const cleanup: (() => void)[] = [];
  let resizeObserver: ResizeObserver | undefined;
  let observed: HTMLElement[] = [];
  const select = (): HTMLElement[] => {
    let elements: Element[];
    if (typeof input.targets === 'string') elements = [...root.querySelectorAll(input.targets)];
    else if (input.targets) elements = [...input.targets];
    else {
      elements = [...root.querySelectorAll('[data-spider-web]')];
      if (!elements.length) elements = [...root.querySelectorAll('article, aside, section')];
    }
    return elements
      .filter(
        (el): el is HTMLElement =>
          el instanceof win.HTMLElement && root.contains(el) && !el.closest('[data-spider-ignore]'),
      )
      .slice(0, options.maxWebs);
  };
  function measure(): void {
    dirty = false;
    width = win.innerWidth;
    height = win.innerHeight;
    // Bound backing-store memory on large/high-DPI displays (at most six million pixels).
    dpr = Math.min(
      win.devicePixelRatio || 1,
      2,
      Math.sqrt(6_000_000 / Math.max(1, width * height)),
    );
    const pixelWidth = Math.max(1, Math.round(width * dpr)),
      pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const targets = select();
    if (
      resizeObserver &&
      (targets.length !== observed.length || targets.some((el, i) => el !== observed[i]))
    ) {
      resizeObserver.disconnect();
      resizeObserver.observe(doc.documentElement);
      targets.forEach((el) => resizeObserver?.observe(el));
      observed = targets;
    }
    const oldSurfaces = new Map(surfaces.map((s) => [s.element, s]));
    surfaces = targets.flatMap((el, index) => {
      if (!birth.has(el)) birth.set(el, clock);
      const surface = measureSurface(
        el,
        index,
        options.webSize,
        options.color,
        birth.get(el)!,
        doc,
        win,
      );
      return surface ? [surface] : [];
    });
    const previous = new Map(residents.map((r) => [r.element, r]));
    residents = surfaces.slice(0, options.spiders).map((s) => {
      const resident = previous.get(s.element);
      const old = oldSurfaces.get(s.element);
      if (resident && old) {
        resident.x += s.home.x - old.home.x;
        resident.y += s.home.y - old.home.y;
        return resident;
      }
      return { element: s.element, x: s.home.x, y: s.home.y, scared: false, visible: true };
    });
    if (options.roam) {
      objects = pageObjects(doc, win, options.objects);
      network = measureNetwork(root, targets, network);
      worldObjects = objects.map((o) => ({
        ...o,
        box: { ...o.box, x: o.box.x + win.scrollX, y: o.box.y + win.scrollY },
        center: { x: o.center.x + win.scrollX, y: o.center.y + win.scrollY },
      }));
      if (!roamers.length)
        roamers = Array.from({ length: options.spiders }, (_, index) => {
          const first = surfaces[index];
          const r = 'getBoundingClientRect' in root ? root.getBoundingClientRect() : null;
          const point =
            options.territory === 'root' && r
              ? {
                  x: r.left + r.width * 0.6 + win.scrollX,
                  y: r.top + Math.min(r.height * 0.4, 220) + win.scrollY,
                }
              : first && !root.querySelector('h1')
                ? { x: first.home.x + win.scrollX, y: first.home.y + win.scrollY }
                : {
                    x: width * (0.73 - index * 0.12) + win.scrollX,
                    y: Math.min(height * 0.35, 280) + win.scrollY,
                  };
          const nearby = network.anchors.filter(
            (a) =>
              a.y >= win.scrollY + 90 &&
              a.y <= win.scrollY + height * 0.7 &&
              a.x >= 35 &&
              a.x <= width - 35,
          );
          const landing =
            nearby.sort(
              (a, b) =>
                Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y),
            )[index] ?? point;
          return makeResident(
            landing,
            index,
            !reduced && options.entrance === 'silk',
            options.territory === 'root' && r ? r.top + win.scrollY : 0,
          );
        });
    }
    lastMeasure = win.performance.now();
  }
  function draw(dt: number): void {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (win.performance.now() > pointerUntil) pointer = null;
    surfaces.forEach((surface, index) => {
      ctx.save();
      ctx.clip(surface.clip);
      ctx.beginPath();
      ctx.roundRect(
        surface.box.x,
        surface.box.y,
        surface.box.width,
        surface.box.height,
        surface.radius,
      );
      ctx.clip();
      const progress = reduced || !options.weave ? 1 : clamp((clock - surface.born) / 1.8, 0, 1);
      if (!options.roam && !silkCleared) paintWeb(ctx, surface, progress, options.webOpacity);
      const resident = options.roam ? undefined : residents[index];
      if (resident) {
        const fear =
          !reduced && pointer
            ? escapeOffset(surface.home, pointer, options.fearRadius)
            : { x: 0, y: 0, scared: false };
        const sway = reduced ? 0 : Math.sin(clock * 1.1 + index * 2) * 4;
        const x = clamp(
          surface.home.x + fear.x + sway,
          surface.box.x + 22 * options.size,
          surface.box.x + surface.box.width - 22 * options.size,
        );
        const y = clamp(
          surface.home.y + fear.y + (reduced ? 0 : Math.sin(clock * 1.6 + index) * 3),
          surface.box.y + 18 * options.size,
          surface.box.y + surface.box.height - 20 * options.size,
        );
        const ease =
          reduced || dt === 0 ? 1 : 1 - Math.exp(-dt * (fear.scared ? 13 : 3) * options.speed);
        resident.x += (x - resident.x) * ease;
        resident.y += (y - resident.y) * ease;
        resident.scared = fear.scared;
        resident.visible = isVisible(surface.element, resident, doc);
        if (resident.visible) {
          ctx.globalAlpha =
            reduced || !options.weave ? 1 : clamp((clock - surface.born - 0.8) / 0.5, 0, 1);
          paintSpider(
            ctx,
            resident,
            surface.anchor,
            options.color === 'auto' ? '#6c5140' : surface.ink,
            options.size,
            clock + index * 1.7,
            reduced ? null : pointer,
            fear.scared ? 1 : 0,
            reduced,
            0,
            0,
            false,
            surface.ink,
            options.webOpacity,
          );
        }
      }
      ctx.restore();
    });
    if (options.roam) {
      const scroll = { x: win.scrollX, y: win.scrollY };
      ctx.save();
      ctx.translate(-scroll.x, -scroll.y);
      // Webs are laid only by the resident's actual construction itinerary.
      ctx.restore();
      const r = 'getBoundingClientRect' in root ? root.getBoundingClientRect() : null;
      const territory =
        options.territory === 'root' && r
          ? { x: r.left + scroll.x, y: r.top + scroll.y, width: r.width, height: r.height }
          : {
              x: 0,
              y: 0,
              width: Math.max(width, doc.documentElement.scrollWidth),
              height: Math.max(height, doc.documentElement.scrollHeight),
            };
      roamers.forEach((resident, index) => {
        if (
          !reduced &&
          state === 'running' &&
          dt > 0 &&
          territory.width > 80 &&
          territory.height > 80
        )
          stepResident(
            resident,
            dt,
            clock,
            pointer ? { x: pointer.x + scroll.x, y: pointer.y + scroll.y } : null,
            options.fearRadius,
            options.speed,
            territory,
            worldObjects,
            index,
            network.anchors,
            options.webDensity,
            options.webSize,
            options.color,
          );
        const ink = options.color === 'auto' ? '#6c5140' : options.color;
        resident.ink = ink;
        resident.silkInk = options.color === 'auto' ? silkWhite : options.color;
        const screen = { x: resident.x - scroll.x, y: resident.y - scroll.y };
        ctx.save();
        ctx.translate(-scroll.x, -scroll.y);
        paintThreads(ctx, resident.threads, options.webOpacity);
        if (
          resident.dragFrom &&
          resident.behavior !== 'descending' &&
          !resident.activeThread &&
          !resident.task &&
          options.webOpacity > 0
        ) {
          const distance = Math.hypot(
            resident.x - resident.dragFrom.x,
            resident.y - resident.dragFrom.y,
          );
          if (distance > 3) {
            ctx.strokeStyle = resident.silkInk;
            ctx.lineWidth = 0.65;
            ctx.globalAlpha = options.webOpacity * 0.7;
            ctx.beginPath();
            ctx.moveTo(resident.dragFrom.x, resident.dragFrom.y);
            ctx.quadraticCurveTo(
              (resident.dragFrom.x + resident.x) / 2,
              (resident.dragFrom.y + resident.y) / 2 + Math.min(26, distance * 0.06),
              resident.x,
              resident.y,
            );
            strokeSilk(ctx, resident.silkInk, 0.65, options.webOpacity * 0.7);
          }
        }

        if (resident.tether && options.webOpacity > 0 && resident.behavior !== 'descending') {
          ctx.strokeStyle = resident.silkInk;
          ctx.lineWidth = 0.7;
          ctx.globalAlpha = options.webOpacity;
          ctx.beginPath();
          ctx.moveTo(resident.tether.x, resident.tether.y);
          ctx.quadraticCurveTo(
            resident.tether.x - 8,
            (resident.tether.y + resident.landing.y) / 2,
            resident.landing.x,
            resident.landing.y,
          );
          strokeSilk(ctx, resident.silkInk, 0.7, options.webOpacity);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.save();
        if (options.territory === 'root' && r) {
          ctx.beginPath();
          ctx.rect(
            territory.x - scroll.x,
            territory.y - scroll.y,
            Math.max(0, territory.width),
            Math.max(0, territory.height),
          );
          ctx.clip();
        }
        if (resident.behind) outsideObjects(ctx, objects, width, height);
        resident.visible =
          screen.x >= 0 &&
          screen.x <= width &&
          screen.y >= 0 &&
          screen.y <= height &&
          (!resident.behind ||
            !objects.some((object) =>
              ctx.isPointInPath(object.path, screen.x * dpr, screen.y * dpr),
            ));
        paintSpider(
          ctx,
          screen,
          resident.behavior === 'descending' && resident.tether && options.webOpacity > 0
            ? { x: resident.tether.x - scroll.x, y: resident.tether.y - scroll.y }
            : null,
          ink,
          options.size,
          clock + index * 1.7,
          reduced ? null : pointer,
          resident.scared ? 1 : 0,
          reduced,
          resident.angle,
          resident.gait,
          resident.velocity > 4,
          resident.silkInk,
          options.webOpacity,
        );
        ctx.restore();
      });
    }
  }
  function schedule(): void {
    if (frame === null && state !== 'destroyed' && !doc.hidden)
      frame = win.requestAnimationFrame(tick);
  }
  function invalidate(): void {
    dirty = true;
    schedule();
  }
  function tick(time: number): void {
    frame = null;
    if (state === 'destroyed' || doc.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (state === 'running' && !reduced) clock += dt * options.speed;
    if (dirty || (options.observe && state === 'running' && !reduced && time - lastMeasure > 750))
      measure();
    draw(state === 'running' ? dt : 0);
    if (state === 'running' && !reduced) schedule();
  }
  function listen(
    target: EventTarget,
    name: string,
    handler: EventListener,
    capture = false,
  ): void {
    target.addEventListener(name, handler, { passive: true, capture });
    cleanup.push(() => target.removeEventListener(name, handler, capture));
  }
  function clearSilk(): void {
    silkCleared = true;
    roamers.forEach((r) => {
      r.threads = [];
      r.tasks = [];
      r.task = null;
      r.activeThread = null;
      r.tether = null;
      r.dragFrom = null;
      r.tip = null;
      r.behavior = 'resting';
      r.until = clock + 1.5;
      r.velocity = 0;
    });
    schedule();
  }
  listen(win, 'resize', invalidate);
  listen(
    doc,
    'scroll',
    () => {
      pointer = null;
      invalidate();
    },
    true,
  );
  listen(doc, 'pointermove', (event) => {
    if (state !== 'running' || reduced) return;
    const e = event as PointerEvent;
    pointer = { x: e.clientX, y: e.clientY };
    pointerUntil = e.pointerType === 'touch' ? win.performance.now() + 900 : Infinity;
  });
  listen(doc, 'pointerdown', (event) => {
    if (state !== 'running' || reduced) return;
    const e = event as PointerEvent;
    pointer = { x: e.clientX, y: e.clientY };
    pointerUntil = win.performance.now() + 900;
  });
  listen(doc, 'pointerleave', () => {
    pointer = null;
  });
  listen(win, 'blur', () => {
    pointer = null;
  });
  listen(doc, 'visibilitychange', () => {
    lastTime = 0;
    if (doc.hidden && frame !== null) {
      win.cancelAnimationFrame(frame);
      frame = null;
    } else invalidate();
  });
  listen(media, 'change', () => {
    reduced = options.motion === 'none' || (options.motion === 'system' && media.matches);
    pointer = null;
    if (reduced)
      roamers.forEach((r) => {
        if (r.behavior === 'descending') {
          r.x = r.landing.x;
          r.y = r.landing.y;
          r.behavior = 'resting';
          r.until = clock + 1;
        }
        r.scared = false;
      });
    lastTime = 0;
    invalidate();
  });
  if (options.observe) {
    const mutation = new MutationObserver((records) => {
      if (
        records.some((r) => {
          const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
          return (
            r.target !== canvas && !canvas.contains(r.target) && !el?.closest('[data-spider-ui]')
          );
        })
      )
        invalidate();
    });
    mutation.observe(root === doc ? doc.documentElement : root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'hidden',
        'open',
        'data-spider-web',
        'data-spider-ignore',
      ],
    });
    cleanup.push(() => mutation.disconnect());
    resizeObserver = new ResizeObserver(invalidate);
    cleanup.push(() => resizeObserver?.disconnect());
  }
  void doc.fonts.ready.then(() => {
    if (state !== 'destroyed') invalidate();
  });
  state = 'running';
  measure();
  draw(0);
  if (!reduced) schedule();
  return {
    update(patch: SpiderTuning) {
      if (state === 'destroyed') return;
      const allowed = [
        'size',
        'speed',
        'fearRadius',
        'webOpacity',
        'webDensity',
        'webSize',
        'color',
      ];
      if (Object.keys(patch).some((key) => !allowed.includes(key)))
        throw new TypeError('Spider: update accepts appearance and behavior options only.');
      const next = resolveOptions({ ...options, ...patch });
      if (next.color !== 'auto' && !CSS.supports('color', next.color))
        throw new TypeError('Spider: color must be a valid CSS color.');
      Object.assign(options, next);
      invalidate();
    },
    clearWebs() {
      if (state !== 'destroyed') clearSilk();
    },
    refresh() {
      if (state !== 'destroyed') invalidate();
    },
    pause() {
      if (state === 'running') {
        state = 'paused';
        pointer = null;
        if (frame !== null) win.cancelAnimationFrame(frame);
        frame = null;
      }
    },
    resume() {
      if (state === 'paused') {
        state = 'running';
        lastTime = 0;
        invalidate();
      }
    },
    destroy() {
      if (state === 'destroyed') return;
      state = 'destroyed';
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      cleanup.forEach((fn) => fn());
      canvas.remove();
      surfaces = [];
      residents = [];
      observed = [];
      roamers = [];
      objects = [];
      network = { anchors: [], retained: new Map() };
      worldObjects = [];
    },
    getState: snapshot,
  };
}
