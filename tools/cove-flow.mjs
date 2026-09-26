// node tools/cove-flow.mjs outDir — plays the orb → summon → time warp → space warp flow and screenshots it
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import { pathToFileURL } from 'url';
import { resolve } from 'path';
const out = process.argv[2] || '/tmp/cove';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto(pathToFileURL(resolve('game/index.html')).href + '?autostart');
await page.waitForTimeout(1200);
const box = await page.locator('#cv').boundingBox();
const k = box.width / 384;
const click = (x, y) => page.mouse.click(box.x + x * k, box.y + y * k);
const shot = (n) => page.locator('#cv').screenshot({ path: `${out}/${n}.png` });
const rocks = await page.evaluate(() => __cove.cur.rocks.map((r) => [r.x, r.y - 8]));
for (const [x, y] of rocks) { await click(x, y); await page.waitForTimeout(150); await click(x, y); await page.waitForTimeout(150); }
await page.waitForTimeout(900);
await shot('f1-orb');
const orb = await page.evaluate(() => [__cove.cur.orb.x, __cove.cur.orb.y]);
await click(orb[0], orb[1]);
for (const [ms, n] of [[700, 'f2'], [700, 'f3'], [600, 'f4'], [900, 'f5'], [1500, 'f6']]) { await page.waitForTimeout(ms); await shot(n); }
const d = await page.evaluate(() => { const d = __cove.G.dia; return d ? [d.x, d.y - 14, d.state] : null; });
console.log('dialga', d);
if (d) {
  await click(d[0], d[1]);
  for (const [ms, n] of [[800, 't1'], [500, 't2'], [500, 't3'], [900, 't4']]) { await page.waitForTimeout(ms); await shot(n); }
  await page.click('#scenes .hb[data-id="reef"]');
  for (const [ms, n] of [[700, 's1'], [500, 's2'], [500, 's3'], [600, 's4'], [900, 's5']]) { await page.waitForTimeout(ms); await shot(n); }
}
console.log(await page.evaluate(() => __cove.cur.id), errs.length ? errs.slice(0, 5).join('\n') : 'no errors');
await browser.close();
