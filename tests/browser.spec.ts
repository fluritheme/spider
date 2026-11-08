import { expect, test, type Page } from '@playwright/test';
import type { SpiderController, SpiderOptions } from '../src';
declare global {
  interface Window {
    spider: SpiderController;
    createSpider: (options?: SpiderOptions) => SpiderController;
  }
}
async function ready(page: Page): Promise<void> {
  await page.goto('/fixture.html');
  await expect.poll(() => page.evaluate(() => window.spider?.getState().webs)).toBe(1);
}
async function pixels(page: Page, x: number, y: number, w: number, h: number): Promise<number> {
  return page.evaluate(
    ({ x, y, w, h }) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-fluri-spider]')!;
      const scale = c.width / innerWidth;
      const data = c
        .getContext('2d')!
        .getImageData(
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(w * scale),
          Math.round(h * scale),
        ).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i]!;
      return sum;
    },
    { x, y, w, h },
  );
}
test('draws visible silk, ignores clicks, and leaves host styles alone', async ({ page }) => {
  await ready(page);
  expect(await pixels(page, 28, 74, 80, 100)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Clickable content' }).click();
  await expect(page.getByRole('button', { name: 'Clicked', exact: true })).toBeVisible();
  await expect(page.locator('#target')).not.toHaveAttribute('style');
  await expect(page.locator('[data-fluri-spider]')).toHaveAttribute('aria-hidden', 'true');
});
test('foreground siblings occlude webs, including nested stacking contexts', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#cover')!.style.display = 'block';
  });
  await expect.poll(() => pixels(page, 28, 74, 65, 115)).toBe(0);
  await page.evaluate(() => {
    const cover = document.querySelector<HTMLElement>('#cover')!;
    const nested = document.createElement('div');
    nested.id = 'nested';
    document.querySelector('#root')!.append(nested);
    nested.append(cover);
    cover.style.pointerEvents = 'auto';
    cover.style.zIndex = '1';
    window.spider.refresh();
  });
  await expect.poll(() => pixels(page, 28, 74, 65, 115)).toBe(0);
  await page.evaluate(() => {
    document.querySelector('#cover')!.remove();
  });
  await expect.poll(() => pixels(page, 28, 74, 65, 115)).toBeGreaterThan(100);
});
test('tracks layout, nested clipping, removal, and new targets', async ({ page }) => {
  await ready(page);
  const before = await page.evaluate(() => window.spider.getState().spiders[0]!.y);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#root')!.style.marginTop = '120px';
  });
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.y))
    .toBeGreaterThan(before + 30);
  await page.evaluate(() => {
    document.querySelector('#root')!.classList.add('clipped');
  });
  await expect.poll(() => pixels(page, 24, 264, 200, 80)).toBe(0);
  await page.evaluate(() => {
    document.querySelector('#target')!.remove();
  });
  await expect.poll(() => page.evaluate(() => window.spider.getState().webs)).toBe(0);
  await page.evaluate(() => {
    document.querySelector('#root')!.classList.remove('clipped');
    const el = document.createElement('article');
    el.id = 'added';
    el.setAttribute('data-spider-web', 'top-left');
    document.querySelector('#root')!.append(el);
  });
  await expect.poll(() => page.evaluate(() => window.spider.getState().webs)).toBe(1);
});
test('flees the pointer and pause/resume/destroy cleanly control it', async ({
  page,
  isMobile,
}) => {
  await ready(page);
  const before = await page.evaluate(() => window.spider.getState().spiders[0]!);
  if (isMobile) await page.touchscreen.tap(before.x + 8, before.y);
  else await page.mouse.move(before.x + 8, before.y);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.scared))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.x))
    .toBeLessThan(before.x - 8);
  await page.evaluate(() => window.spider.pause());
  const paused = await page.evaluate(() => window.spider.getState());
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.spider.getState())).toEqual(paused);
  await page.evaluate(() => window.spider.resume());
  expect(await page.evaluate(() => window.spider.getState().state)).toBe('running');
  await page.evaluate(() => {
    window.spider.destroy();
    window.spider.destroy();
    window.spider.resume();
    window.spider.refresh();
  });
  await expect(page.locator('[data-fluri-spider]')).toHaveCount(0);
  expect(await page.evaluate(() => window.spider.getState().state)).toBe('destroyed');
});
test('reduced motion is a still illustration and responds to preference changes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await pixels(page, 28, 74, 80, 120)).toBeGreaterThan(100);
  const first = await page.evaluate(() => window.spider.getState());
  expect(first.reducedMotion).toBe(true);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.spider.getState())).toEqual(first);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.spider.getState().reducedMotion)).toBe(false);
});
test('validates browser configuration without leaking a canvas', async ({ page }) => {
  await ready(page);
  expect(
    await page.evaluate(() => {
      let rejected = 0;
      for (const options of [{ targets: '[' }, { color: 'definitely-not-a-color' }])
        try {
          window.createSpider(options);
        } catch {
          rejected++;
        }
      return rejected;
    }),
  ).toBe(2);
  await expect(page.locator('[data-fluri-spider]')).toHaveCount(1);
});
test('marketing page controls, code tabs, and responsive layout work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('spider.');
  await expect(page.locator('[data-fluri-spider]')).toHaveCount(1);
  await page.getByRole('button', { name: 'After dark', exact: true }).click();
  await expect(page.locator('#playground')).toHaveClass(/dark/);
  await page.getByRole('button', { name: /Pause resident/ }).click();
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'React', exact: true }).click();
  await expect(page.locator('#code')).toContainText('useEffect');
  await page.getByRole('tab', { name: 'React', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Vue', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Clear silk', exact: false }).click();
  await page.getByRole('button', { name: 'Restart the descent' }).click();
  await expect(page.locator('#playground')).toHaveClass(/electric/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('roaming spider travels beyond its web and really disappears behind an object', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.1;
  });
  await ready(page);
  await page.evaluate(() => {
    window.spider.destroy();
    window.spider = window.createSpider({
      targets: [],
      objects: '#target',
      entrance: 'appear',
      roam: true,
      speed: 3,
      fearRadius: 0,
      weave: false,
    });
  });
  const start = await page.evaluate(() => window.spider.getState().spiders[0]!);
  await expect
    .poll(
      () =>
        page.evaluate(({ x, y }) => {
          const s = window.spider.getState().spiders[0]!;
          return Math.hypot(s.x - x, s.y - y);
        }, start),
      { timeout: 8000 },
    )
    .toBeGreaterThan(30);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.visible), {
      timeout: 12000,
    })
    .toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.visible), {
      timeout: 12000,
    })
    .toBe(true);
});
test('roaming works on a bare page and can cross the initial card boundary', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
  });
  await ready(page);
  await page.evaluate(() => {
    window.spider.destroy();
    document.querySelector('#root')!.remove();
    window.spider = window.createSpider({
      speed: 3,
      fearRadius: 0,
      weave: false,
      entrance: 'appear',
    });
  });
  expect(await page.evaluate(() => window.spider.getState().webs)).toBe(0);
  expect(await page.evaluate(() => window.spider.getState().spiders.length)).toBe(1);
  const start = await page.evaluate(() => window.spider.getState().spiders[0]!);
  await expect
    .poll(
      () =>
        page.evaluate(({ x, y }) => {
          const s = window.spider.getState().spiders[0]!;
          return Math.hypot(s.x - x, s.y - y);
        }, start),
      { timeout: 6000 },
    )
    .toBeGreaterThan(70);
});
test('the spider palette stays stable over a dark button', async ({ page }) => {
  await ready(page);
  const changedPixels = await page.evaluate(async () => {
    window.spider.destroy();
    document.querySelector('#root')!.remove();
    window.spider = window.createSpider({ motion: 'none', weave: false });
    window.spider.pause();
    const settle = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    await settle();
    const c = document.querySelector<HTMLCanvasElement>('[data-fluri-spider]')!;
    const ctx = c.getContext('2d')!,
      scale = c.width / innerWidth;
    const resident = window.spider.getState().spiders[0]!;
    const read = () =>
      ctx.getImageData(
        Math.round((resident.x - 40) * scale),
        Math.round((resident.y - 40) * scale),
        Math.round(80 * scale),
        Math.round(80 * scale),
      ).data;
    const before = read();
    const button = document.createElement('button');
    button.textContent = 'Dark surface';
    button.style.cssText = `position:fixed;left:${resident.x - 45}px;top:${resident.y - 45}px;width:90px;height:90px;background:#08080a;color:white;`;
    document.body.append(button);
    window.spider.refresh();
    await settle();
    const after = read();
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (
        Math.max(before[i + 3]!, after[i + 3]!) > 50 &&
        Math.max(...[0, 1, 2].map((offset) => Math.abs(before[i + offset]! - after[i + offset]!))) >
          20
      )
        changed++;
    }
    return changed;
  });
  // WebKit can vary a handful of antialiased boundary pixels between identical redraws.
  expect(changedPixels).toBeLessThan(20);
});
async function startLoom(page: Page): Promise<void> {
  await ready(page);
  await page.evaluate(() => {
    window.spider.destroy();
    const heading = document.createElement('h1');
    heading.textContent = 'a little web';
    heading.style.cssText =
      'position:absolute;left:40px;top:120px;width:430px;font:72px Georgia;margin:0;color:#29282b';
    document.body.append(heading);
    window.spider = window.createSpider({
      targets: 'h1',
      speed: 3,
      fearRadius: 0,
      entrance: 'silk',
      webDensity: 0,
    });
  });
}
test('descends from silk and builds threads sequentially instead of spawning a net', async ({
  page,
}) => {
  await startLoom(page);
  const first = await page.evaluate(() => window.spider.getState().spiders[0]!);
  expect(first.behavior).toBe('descending');
  expect(first.y).toBeLessThan(0);
  expect(first.threads).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.threads), {
      timeout: 10000,
    })
    .toBeGreaterThan(4);
  await page.evaluate(() => window.spider.pause());
  const before = await page.evaluate(() => window.spider.getState().spiders[0]!);
  await page.evaluate(() => window.spider.update({ size: 1.4, webOpacity: 0.6 }));
  await page.waitForTimeout(80);
  expect((await page.evaluate(() => window.spider.getState().spiders[0]!)).threads).toBe(
    before.threads,
  );
});
test('scrolling preserves document position and completed silk', async ({ page }) => {
  await startLoom(page);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.threads), {
      timeout: 10000,
    })
    .toBeGreaterThan(2);
  await page.evaluate(() => window.spider.pause());
  const before = await page.evaluate(() => window.spider.getState().spiders[0]!);
  await page.evaluate(() => window.scrollTo(0, 180));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(180);
  const after = await page.evaluate(() => window.spider.getState().spiders[0]!);
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.threads).toBe(before.threads);
});
test('clicks and Shift-drag preserve silk; clearWebs removes it explicitly', async ({ page }) => {
  await startLoom(page);
  await expect
    .poll(() => page.evaluate(() => window.spider.getState().spiders[0]!.threads), {
      timeout: 10000,
    })
    .toBeGreaterThan(4);
  await page.evaluate(() => window.spider.pause());
  const point = { x: 180, y: 155 };
  const count = await page.evaluate(() => window.spider.getState().spiders[0]!.threads);
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => window.spider.getState().spiders[0]!.threads)).toBe(count);
  await page.keyboard.down('Shift');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 6, point.y + 4);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => window.spider.getState().spiders[0]!.threads)).toBe(count);
  await page.evaluate(() => window.spider.clearWebs());
  expect(await page.evaluate(() => window.spider.getState().spiders[0]!.threads)).toBe(0);
  expect(await page.evaluate(() => window.spider.getState().state)).toBe('paused');
});
