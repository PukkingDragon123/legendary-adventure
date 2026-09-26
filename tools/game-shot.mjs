// node tools/game-shot.mjs "<query>" outPrefix [w] [h] [dpr] [times ms comma] [clicks json]
// Takes screenshots of the built game at the given times; clicks = [[ms, x, y], ...] in CSS px
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, query = '', out = '/tmp/g', w = '1280', h = '720', dpr = '1', times = '1500', clicks = '[]'] = process.argv;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('file://' + process.cwd() + '/game/index.html?' + query);
const T = times.split(',').map(Number);
const C = JSON.parse(clicks);
let now = 0;
const evs = [...T.map((t) => ({ t, kind: 'shot' })), ...C.map(([t, x, y]) => ({ t, kind: 'click', x, y }))].sort((a, b) => a.t - b.t);
let i = 0;
for (const e of evs) {
  if (e.t > now) { await page.waitForTimeout(e.t - now); now = e.t; }
  if (e.kind === 'click') await page.mouse.click(e.x, e.y);
  else { await page.screenshot({ path: `${out}-${i}.png` }); i++; }
}
const dbg = await page.evaluate(() => { const d = document.getElementById('dbg'); return d ? d.textContent : ''; });
if (dbg) console.log('DBG', dbg);
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
