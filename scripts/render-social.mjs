import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir(new URL('../assets/social/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:5198/social-card.html');
  await page.waitForFunction(() => window.cardReady === true);
  await page.screenshot({
    path: new URL('../assets/social/github-preview.png', import.meta.url).pathname,
  });
  console.log('Rendered assets/social/github-preview.png (1280 × 640).');
} finally {
  await browser.close();
}
