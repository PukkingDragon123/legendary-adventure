// Interaction test: start the game, poke a list of world targets, report errors.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp/pk';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('file://' + process.cwd() + '/game/index.html?debug');
await page.waitForTimeout(1200);
await page.click('#b-start', { force: true });
await page.waitForTimeout(900);
const toCss = (wx, wy) => page.evaluate(([x, y]) => [(x - Game.cam.x) * Game.zoom / devicePixelRatio, (y - Game.cam.y) * Game.zoom / devicePixelRatio], [wx, wy]);
const look = (x, y) => page.evaluate(([x, y]) => { Game.follow = false; Game.cam.x = x - Game.VW / 2; Game.cam.y = y - Game.VH / 2; Game.cam.vx = Game.cam.vy = 0; Game.clampCam(); }, [x, y]);
async function poke(label, wxy, shot = false) {
  const [wx, wy] = await page.evaluate(wxy);
  await look(wx, wy - 40);
  await page.waitForTimeout(150);
  const [x, y] = await toCss(wx, wy);
  await page.mouse.click(x, y);
  await page.waitForTimeout(700);
  if (shot) await page.screenshot({ path: `${out}-${label}.png` });
  console.log('poked', label, Math.round(wx), Math.round(wy));
}
await poke('palm', '(() => { const p = Scene.S.palms[1]; return [p.gx + p.m.crownX - p.m.bx, p.gy + p.m.crownY - p.m.by + 20]; })()', true);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-palm2.png` });
await poke('rock', '(() => { const r = Scene.S.rocks[1]; return [r.x0 + r.spr.w / 2, r.y0 + r.spr.h / 2]; })()');
await poke('castle', '[Scene.S.castle.x, Scene.S.castle.y0 + 40]', true);
await poke('castle2', '[Scene.S.castle.x, Scene.S.castle.y0 + 50]');
await poke('umbrella', '[Scene.S.umbrella.x - 30, Scene.S.umbrella.y0 + 16]');
await poke('water', '[1600, WorldRender.surfaceAt(1600, Game.t)]', true);
await poke('under', '[1700, 700]');
await poke('sky', '[900, 300]');
await poke('sand', '[500, World.groundAt(500) + 30]');
await poke('mudkip', '(() => { const m = Game.mudkip; return m.center(); })()', true);
await poke('ball', '[Game.ball.x, Game.ball.y]');
for (const k of ['spheal', 'sealeo', 'walrein', 'corphish', 'pelipper', 'luvdisc']) {
  await poke(k, `(() => { const m = Game.mons.find((q) => q.kind === '${k}'); return m ? m.center() : [100, 100]; })()`, k === 'walrein' || k === 'pelipper');
}
await poke('chest', '[Scene.S.chest.x, Scene.S.chest.y0 + 30]', true);
await poke('kelp', '(() => { const k = Scene.S.kelp[3]; return [k.x, World.groundAt(k.x) - 20]; })()');
await poke('fossil', '(() => { const b = Scene.S.buried.find((q) => q.kind === "helix"); return [b.x, b.y]; })()');
// HUD buttons
for (const id of ['#b-zin', '#b-zout', '#b-zout', '#b-follow', '#b-sound', '#b-sound', '#b-orb', '#b-clock']) { await page.click(id, { force: true }); await page.waitForTimeout(250); }
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-hud.png` });
const st = await page.evaluate(() => ({ nuts: Scene.S.coconuts.map((c) => c.state).join(','), castle: Scene.S.castleHP, chest: Scene.S.chestOpen, sound: Sound.on, fx: FX.list.length, mons: Game.mons.length, dbg: document.getElementById('dbg').textContent }));
console.log(JSON.stringify(st));
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
