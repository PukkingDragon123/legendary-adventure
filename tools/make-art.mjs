// Render the GIF thumbnail + banner frames headlessly: node tools/make-art.mjs outDir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/art';
mkdirSync(out, { recursive: true });
const files = ['src/px.js', 'src/scenery.js', 'src/actors.js', 'src/creature.js', 'src/mudkip.js', 'src/ball.js',
  'src/game/world.js', 'src/game/render.js', 'src/game/props.js', 'src/game/scene.js', 'src/game/fx.js', 'src/game/critters.js'];
// Life is only needed for the shiny palette: stub the game globals it touches
const js = files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n') + `
const Game = { t: 0, systems: [], mons: [], sfx() {}, pal: () => Times.compile('noon') };
` + readFileSync(join(root, 'src/game/life.js'), 'utf8') + '\nScene.init();\n' + readFileSync(join(root, 'tools/art/poster.js'), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><body><script>${js}</script>`;
const page0 = join(out, 'poster.html');
writeFileSync(page0, html);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + page0);
for (const [kind, n] of [['thumb', await page.evaluate(() => Poster.TN)], ['banner', await page.evaluate(() => Poster.BN)]]) {
  for (let f = 0; f < n; f++) {
    const url = await page.evaluate(([k, i]) => Poster.toURL(Poster[k](i)), [kind, f]);
    writeFileSync(join(out, `${kind}-${String(f).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(kind, n, 'frames');
}
await browser.close();
