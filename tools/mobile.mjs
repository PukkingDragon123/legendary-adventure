import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, file, outdir, scheme = 'light'] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, async (route) => {
  try {
    const req = route.request();
    const r = await fetch(req.url(), { headers: { 'user-agent': req.headers()['user-agent'] || 'Mozilla/5.0' } });
    await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  } catch { await route.abort(); }
});
await page.goto('file://' + file);
await page.waitForTimeout(3000);
const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
console.log('scrollWidth/innerWidth', sw.join('/'));
await page.screenshot({ path: `${outdir}/m1-${scheme}.png` });
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/m2-${scheme}.png` });
await page.evaluate(() => window.scrollTo(0, 0));
await page.tap('#work-noon .frame-btn');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outdir}/m3-${scheme}.png` });
console.log(logs.join('\n'));
await browser.close();
