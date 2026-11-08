import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const output = new URL('../assets/readme/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:5198');
  await page.waitForTimeout(22000);
  await page.screenshot({ path: new URL('woven-page.png', output).pathname });
  await page.locator('#playground').scrollIntoViewIfNeeded();
  await page.locator('#reset').click();
  await page.waitForTimeout(16000);
  await page
    .locator('#playground')
    .screenshot({ path: new URL('playground.png', output).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5198');
  await page.waitForTimeout(20000);
  await page.screenshot({ path: new URL('mobile.png', output).pathname });
  // Draw directly with the production painter so the character detail preview uses identical geometry.
  await page.setViewportSize({ width: 1000, height: 390 });
  await page.goto('http://127.0.0.1:5198/preview.html');
  await page.evaluate(async () => {
    window.spider.destroy();
    const paintSpider = window.paintSpider;
    document.body.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 390;
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f2eb';
    ctx.fillRect(0, 0, 500, 390);
    ctx.fillStyle = '#302d34';
    ctx.fillRect(500, 0, 500, 390);
    for (const x of [250, 750])
      paintSpider(ctx, { x, y: 180 }, null, '#6c5140', 4, 1, null, 0, true);
    ctx.textAlign = 'center';
    ctx.font = '12px DM, system-ui';
    ctx.fillStyle = '#8a7c6d';
    ctx.fillText('ONE LITTLE SPIDER.', 250, 331);
    ctx.fillStyle = '#d7c7b2';
    ctx.fillText('THE SAME COLORS. EVERYWHERE.', 750, 331);
  });
  await page.screenshot({ path: new URL('character.png', output).pathname });
  await page.close();
  const context = await browser.newContext({
    viewport: { width: 900, height: 540 },
    deviceScaleFactor: 1,
    recordVideo: { dir: 'preview-recordings', size: { width: 900, height: 540 } },
  });
  const animated = await context.newPage();
  await animated.goto('http://127.0.0.1:5198/preview.html');
  await animated.waitForTimeout(18000);
  await animated
    .screenshot({ path: new URL('../demo/public/social.png', import.meta.url).pathname })
    .catch(() => {});
  const video = animated.video();
  await context.close();
  const videoPath = await video.path();
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-vf',
      'fps=15,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop',
      '0',
      new URL('spider.gif', output).pathname,
    ],
    { stdio: 'ignore' },
  );
  console.log(
    'Captured playground, phone, character, and animated runtime previews in assets/readme/.',
  );
} finally {
  await browser.close();
}
