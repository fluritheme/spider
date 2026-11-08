import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const output = new URL('../assets/readme/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  // Capture the actual public demo: no pre-seeded webs or substitute artwork.
  const context = await browser.newContext({
    viewport: { width: 1080, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: 'preview-recordings', size: { width: 1080, height: 900 } },
  });
  const animated = await context.newPage();
  await animated.goto('http://127.0.0.1:5198');
  await animated.waitForTimeout(30000);
  const video = animated.video();
  await context.close();
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      await video.path(),
      '-vf',
      'fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
      '-loop',
      '0',
      new URL('spider.gif', output).pathname,
    ],
    { stdio: 'ignore' },
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  await page.goto('http://127.0.0.1:5198');
  await page.waitForFunction(
    () =>
      Number(document.querySelector('#thread-count')?.textContent) >= 18 &&
      document.querySelector('#activity')?.textContent?.includes('WEAVING'),
    null,
    { timeout: 45000 },
  );
  await page
    .locator('#playground')
    .screenshot({ path: new URL('playground.png', output).pathname });
  await page.screenshot({
    path: new URL('woven-page.png', output).pathname,
    clip: { x: 0, y: 110, width: 1440, height: 650 },
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: new URL('../demo/public/social.png', import.meta.url).pathname,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5198');
  await page.waitForTimeout(25000);
  await page.screenshot({ path: new URL('mobile.png', output).pathname });
  // The character study also uses the production vector painter.
  await page.setViewportSize({ width: 1200, height: 440 });
  await page.goto('http://127.0.0.1:5198/preview.html');
  await page.evaluate(() => {
    window.spider.destroy();
    document.body.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 440;
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b94323';
    ctx.fillRect(0, 0, 600, 440);
    ctx.fillStyle = '#15110f';
    ctx.fillRect(600, 0, 600, 440);
    for (const x of [300, 900])
      window.paintSpider(ctx, { x, y: 206 }, null, '#6c5140', 4, 1, null, 0, true);
    ctx.font = '11px DM,Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4e6d3';
    ctx.fillText('ONE LITTLE RESIDENT.', 300, 373);
    ctx.fillStyle = '#ffca7a';
    ctx.fillText('THE SAME PALETTE. EVERYWHERE.', 900, 373);
  });
  await page.screenshot({ path: new URL('character.png', output).pathname });
  await page.close();
  console.log(
    'Captured 30s of actual weaving, the working habitat, a close web study, mobile, the original character, and the social card.',
  );
} finally {
  await browser.close();
}
