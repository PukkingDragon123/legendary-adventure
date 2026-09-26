// Usage: node tools/shot.mjs <html> <out.png> [width] [height] [selector] [waitMs]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, file, out, w = '1400', h = '900', sel = '', wait = '300'] = process.argv;
const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
// Serve Google Fonts through Node's fetch (verifies TLS against the sandbox CA bundle)
await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, async (route) => {
  try {
    const req = route.request();
    const r = await fetch(req.url(), { headers: { 'user-agent': req.headers()['user-agent'] || 'Mozilla/5.0' } });
    const body = Buffer.from(await r.arrayBuffer());
    await route.fulfill({ status: r.status, body, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  } catch (e) { await route.abort(); }
});
await page.goto('file://' + file);
await page.waitForTimeout(+wait);
if (sel) await (await page.$(sel)).screenshot({ path: out });
else await page.screenshot({ path: out, fullPage: false });
if (logs.length) console.log(logs.join('\n'));
await browser.close();
