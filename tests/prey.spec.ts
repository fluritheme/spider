import { test, expect } from '@playwright/test';
// Linux WebKit paints Canvas in software; preserve the full virtual timeline with ample headroom.
test.setTimeout(90_000);
async function start(page: import('@playwright/test').Page, reduced = false) {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.addInitScript(() => {
    let seed = 38;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/fixture.html');
  await page.evaluate(() => {
    window.spider.destroy();
    window.spider = window.createSpider({
      root: document.querySelector<HTMLElement>('#root')!,
      territory: 'root',
      entrance: 'appear',
      fearRadius: 0,
      objects: '[data-spider-object]',
      size: 1.3,
      flies: true,
      speed: 1.8,
      webDensity: 0.25,
    });
    window.spider.releaseFly();
  });
}
test('a fly visits, is pursued, wrapped and eaten without losing existing silk', async ({
  page,
}) => {
  await start(page);
  let seenFly = false,
    seenHunt = false,
    seenWrap = false;
  for (let i = 0; i < 90; i++) {
    await page.clock.runFor(180);
    const state = await page.evaluate(() => window.spider.getState());
    expect(state.flies.length).toBeLessThanOrEqual(1);
    seenFly ||= state.flies.length === 1;
    seenHunt ||= state.spiders.some((s) => s.behavior === 'hunting');
    seenWrap ||= state.flies.some((f) => f.state === 'wrapping' || f.state === 'eating');
    if (state.fliesEaten > 0) break;
  }
  expect(seenFly && seenHunt && seenWrap).toBe(true);
  expect((await page.evaluate(() => window.spider.getState())).fliesEaten).toBe(1);
  await page.evaluate(() => window.spider.pause());
  const paused = await page.evaluate(() => window.spider.getState());
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.spider.getState())).toEqual(paused);
  await page.evaluate(() => {
    window.spider.update({ flies: false });
    window.spider.releaseFly();
    window.spider.resume();
  });
  await page.clock.runFor(1000);
  expect((await page.evaluate(() => window.spider.getState())).flies).toHaveLength(0);
  await page.evaluate(() => window.spider.destroy());
  await expect(page.locator('[data-fluri-spider]')).toHaveCount(0);
});
test('flies stay in document coordinates through scrolling while paused and respect reduced motion', async ({
  page,
}) => {
  await start(page);
  await page.clock.runFor(400);
  await page.evaluate(() => window.spider.pause());
  const before = await page.evaluate(() => window.spider.getState());
  expect(before.flies).toHaveLength(1);
  await page.evaluate(() => scrollTo(0, 80));
  await page.clock.runFor(30);
  expect((await page.evaluate(() => window.spider.getState())).flies).toEqual(before.flies);
  await page.evaluate(() => window.spider.destroy());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.spider = window.createSpider({ flies: true });
    window.spider.releaseFly();
  });
  await page.clock.runFor(30000);
  expect((await page.evaluate(() => window.spider.getState())).flies).toHaveLength(0);
});
