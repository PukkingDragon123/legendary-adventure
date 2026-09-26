import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, file, outdir] = process.argv;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
await page.goto('file://' + file);
await page.waitForTimeout(2500);
await page.click('#work-dusk .enter');
await page.waitForTimeout(1500);
await page.click('#v-sound');           // sound on
await page.waitForTimeout(300);
const box = await page.locator('#v-canvas').boundingBox();
for (const [fx, fy] of [[0.62, 0.3], [0.7, 0.62], [0.5, 0.75], [0.2, 0.2]]) { await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(250); }
await page.click('#v-loupe');
await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.55);
await page.waitForTimeout(300);
await page.screenshot({ path: `${outdir}/c1-loupe.png` });
await page.keyboard.press('Space');     // pause (focus is on a button → handled by button)
await page.click('#v-play');
await page.waitForTimeout(200);
for (let i = 0; i < 5; i++) { await page.click('#v-next'); await page.waitForTimeout(700); }
await page.click('#v-sound');
// frame timing inside the viewer
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('viewer rAF fps (headless):', fps);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
console.log(logs.filter((l) => !l.includes('EHPA')).join('\n') || 'no console output');
await browser.close();
