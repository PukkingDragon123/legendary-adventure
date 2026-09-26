// node tools/cove-shot.mjs outDir [ms] [scenes comma] [extra query]
// Screenshots the canvas of each scene of the built game and prints console errors.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import { pathToFileURL } from 'url';
import { resolve } from 'path';
const [,, out = '/tmp/cove', ms = '2500', list = 'noon,dusk,night,dawn,surf,reef', extra = ''] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const url = pathToFileURL(resolve('game/index.html')).href;
for (const s of list.split(',')) {
  await page.goto(`${url}?autostart&orb=1&scene=${s}${extra}`);
  await page.waitForTimeout(+ms);
  await page.locator('#cv').screenshot({ path: `${out}/${s}.png` });
}
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no errors');
await browser.close();
