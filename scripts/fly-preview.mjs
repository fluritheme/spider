import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() => {
    let seed = 38;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  });
  await page.clock.install();
  await page.goto('http://127.0.0.1:5198/');
  await page.waitForFunction(() => window.__fluriSpider?.getState().spiders.length === 1);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
  await page.evaluate(() => window.__fluriSpider.update({ flies: false, fearRadius: 0, size: 2 }));
  await page.clock.runFor(10000);
  await page.evaluate(() => {
    window.__fluriSpider.update({ flies: true });
    window.__fluriSpider.releaseFly();
  });
  const shots = [];
  for (const desired of ['flying', 'hunting', 'wrapping', 'eating']) {
    let found = false;
    for (let i = 0; i < 150; i++) {
      await page.clock.runFor(80);
      const s = await page.evaluate(() => window.__fluriSpider.getState());
      const f = s.flies[0],
        r = s.spiders[0];
      if (!f || !r) continue;
      const distance = Math.hypot(f.x - r.x, f.y - r.y);
      const match =
        desired === 'hunting'
          ? r.behavior === 'hunting' && f.state === 'flying' && distance < 115
          : desired === f.state;
      if (!match) continue;
      await page.clock.runFor(desired === 'flying' ? 180 : desired === 'hunting' ? 0 : 260);
      await page.evaluate(() => window.__fluriSpider.pause());
      const state = await page.evaluate(() => window.__fluriSpider.getState());
      const fly = state.flies[0],
        spider = state.spiders[0];
      const cx = (fly.x + spider.x) / 2,
        cy = (fly.y + spider.y) / 2;
      const bytes = await page.screenshot({
        clip: {
          x: Math.max(0, Math.min(1080, cx - 180)),
          y: Math.max(0, Math.min(700, cy - 150)),
          width: 360,
          height: 300,
        },
      });
      shots.push({ desired, url: 'data:image/png;base64,' + bytes.toString('base64') });
      await page.evaluate(() => window.__fluriSpider.resume());
      found = true;
      break;
    }
    if (!found) throw Error('Could not capture actual ' + desired + ' state');
  }
  const figure = await browser.newPage({
    viewport: { width: 1440, height: 760 },
    deviceScaleFactor: 1.5,
  });
  await figure.setContent(
    `<style>*{box-sizing:border-box}body{margin:0;padding:48px;background:#f76b35;color:#251b16;font-family:Arial,sans-serif}header{display:flex;justify-content:space-between;border-bottom:1px solid #251b1660;padding-bottom:20px;font:13px monospace;letter-spacing:2px}h1{font-size:68px;letter-spacing:-3px;margin:28px 0 12px;line-height:1}p{font-size:22px;margin:0 0 30px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{background:#2b1c17;border:1px solid #38231c;color:#fff4de;padding:12px}.card span{font:12px monospace;letter-spacing:1px;display:block;margin-bottom:12px}.card img{width:100%;display:block;height:280px;object-fit:cover}footer{display:flex;justify-content:space-between;margin-top:28px;border-top:1px solid #251b1660;padding-top:22px;font:14px monospace}</style><header><span>FLURI / SPIDER 0.2</span><span>A LITTLE LIFE. A LITTLE APPETITE.</span></header><h1>A visitor. A chase. A little snack.</h1><p>Real woven silk. Fluttering wings. One hungry little resident.</p><div class="grid">${shots.map((s, i) => `<div class="card"><span>0${i + 1} / ${['THE VISITOR', 'THE PURSUIT', 'THE SILK WRAP', 'THE LITTLE SNACK'][i]}</span><img src="${s.url}"/></div>`).join('')}</div><footer><span>npm i @fluritheme/spider</span><span>spider.fluri.xyz</span></footer>`,
  );
  await figure
    .locator('img')
    .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  await mkdir('assets/readme', { recursive: true });
  await mkdir('demo/public/readme', { recursive: true });
  const bytes = await figure.screenshot({ fullPage: true });
  await writeFile('assets/readme/fly-lifecycle.png', bytes);
  await writeFile('demo/public/readme/fly-lifecycle.png', bytes);
  console.log('Captured actual flying, hunting, wrapping and eating states.');
} finally {
  await browser.close();
}
