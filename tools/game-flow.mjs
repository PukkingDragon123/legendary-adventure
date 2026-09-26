// Scripted flow test: node tools/game-flow.mjs outPrefix [w] [h] [steps json]
// steps: [[ms, "js expression evaluated in page" | "shot"], ...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, out = '/tmp/f', w = '1280', h = '720', steps = '[]', query = 'debug&autostart'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('file://' + process.cwd() + '/game/index.html?' + query);
let now = 0, i = 0;
for (const [t, what] of JSON.parse(steps)) {
  if (t > now) { await page.waitForTimeout(t - now); now = t; }
  if (what === 'shot') { await page.screenshot({ path: `${out}-${i++}.png` }); continue; }
  try { const r = await page.evaluate(what); if (r !== undefined) console.log('>', JSON.stringify(r)); } catch (e) { console.log('EVAL ERR', e.message); }
}
const dbg = await page.evaluate(() => { const d = document.getElementById('dbg'); return d ? d.textContent : ''; });
if (dbg) console.log('DBG', dbg);
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
