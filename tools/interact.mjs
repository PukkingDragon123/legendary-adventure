// Scripted walkthrough: node tools/interact.mjs <html> <outdir> [width] [height] [scheme]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, file, outdir, w = '1440', h = '900', scheme = 'light'] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: +w < 700 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, async (route) => {
  try {
    const req = route.request();
    const r = await fetch(req.url(), { headers: { 'user-agent': req.headers()['user-agent'] || 'Mozilla/5.0' } });
    await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  } catch { await route.abort(); }
});
await page.goto('file://' + file);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outdir}/i1-top.png` });
await page.click('#work-noon .frame-btn', { position: { x: 300, y: 200 } });
await page.waitForTimeout(250);
await page.screenshot({ path: `${outdir}/i2-opening.png` });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${outdir}/i3-viewer.png` });
// tap the water in the painting
const box = await page.locator('#v-canvas').boundingBox();
await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.78);
await page.waitForTimeout(160);
await page.screenshot({ path: `${outdir}/i4-tap.png` });
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${outdir}/i5-next.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.screenshot({ path: `${outdir}/i6-closed.png` });
console.log(logs.join('\n'));
await browser.close();
