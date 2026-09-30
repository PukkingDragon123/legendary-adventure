// Build Mudkip Snap into one standalone HTML file (game/index.html) and, optionally,
// a body-only artifact file: node tools/build-game.mjs [artifactOut]
// Music (git-ignored, see tools/prep-music.py) is referenced as music/*.mp3 next to the page.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const has = (p) => existsSync(join(root, p));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// every species model in src/species (global name = capitalised file name)
// (files that do not parse — e.g. a model still being written — are skipped with a warning)
const SPECIES = readdirSync(join(root, 'src/species')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort().filter((s) => {
  try { new vm.Script(readFileSync(join(root, `src/species/${s}.js`), 'utf8')); return true; } catch (e) { console.warn('skipping species', s, '-', e.message); return false; }
});
const speciesFiles = SPECIES.map((s) => `src/species/${s}.js`);
const opt = (list) => list.filter(has);
const AREAS = ['beach', 'forest', 'canopy', 'falls', 'stage', 'volcano', 'shoal'];
const AI = ['base', 'eco', 'beach', 'fossil', 'sea', 'forest', 'grove', 'canopy', 'falls', 'stage', 'volcano', 'shoal', 'legends'];
const files = [
  'src/px.js', 'src/scenery.js', 'src/actors.js', 'src/creature.js', 'src/mudkip.js', 'src/ball.js',
  ...speciesFiles,
  'src/snap/times.js', 'src/snap/util.js', 'src/snap/fontdata.js', 'src/snap/font.js', 'src/snap/pal.js', 'src/snap/paint.js',
  'src/snap/world.js', 'src/game/waves.js', 'src/game/fx.js', 'src/game/critters.js', 'src/game/audio.js',
  'src/snap/terrain.js', 'src/snap/stage.js', 'src/snap/props.js', 'src/snap/props2.js', 'src/snap/shaders.js',
  'src/snap/sfx.js', 'src/snap/save.js', 'src/snap/dexdata.js', 'src/snap/cries.js', 'src/snap/ui.js', 'src/snap/mons.js', 'src/snap/player.js',
  'src/snap/items.js', 'src/snap/weather.js', 'src/snap/moves.js', ...opt(['src/snap/tmfx.js']), 'src/snap/pad.js', 'src/snap/talk.js', 'src/snap/hud.js', 'src/snap/photo.js', 'src/snap/toys.js',
  ...opt(['src/snap/rewards.js', 'src/snap/quests.js', 'src/snap/music.js', 'src/snap/dex.js', 'src/snap/worldmap.js']),
  'src/snap/social.js', 'src/snap/harvest.js', 'src/snap/bag.js', 'src/beach.js', 'src/paintings.js', 'src/snap/style.js', 'src/snap/memories.js', 'src/snap/seasons.js',
  ...opt(['src/snap/stubs.js']),
  'src/snap/areas/index.js',
  ...opt(AI.map((a) => `src/snap/ai/${a}.js`)),
  ...opt(AREAS.map((a) => `src/snap/areas/${a}.js`)),
  ...opt(['src/snap/gallery.js']),
  'src/snap/mailman.js', 'src/snap/rhythm.js', 'src/snap/expand.js', 'src/snap/wild.js', 'src/snap/bite.js', 'src/snap/arcade.js', ...opt(['src/snap/cardart.js', 'src/snap/cards.js', 'src/snap/arena.js', 'src/snap/territory.js']), 'src/snap/boardwalk.js', 'src/snap/lighthouse.js', ...opt(['src/snap/bar.js', 'src/snap/hosts.js']), 'src/snap/backmons.js', 'src/snap/accs.js', 'src/snap/regi.js',
  ...opt(['src/snap/quests2.js', 'src/snap/progress.js', 'src/snap/bosses.js', 'src/snap/punks.js', 'src/snap/rotom.js']),
  'src/snap/main.js',
];
const names = ['Mudkip', ...SPECIES.map(cap)];
const js = `const SPECIES_LIST = ${JSON.stringify(names)};\n` + files.map((f) => `/* ==== ${f} ==== */\n${read(f)}`).join('\n') + '\nGame.boot();\n';
// worker: the renderer + species models + a tiny message handler
const wfiles = ['src/px.js', 'src/creature.js', 'src/mudkip.js', ...speciesFiles];
const worker = wfiles.map((f) => read(f)).join('\n') + `
const SP = { ${names.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : null`).join(', ')} };
function crop(r) {
  const { buf } = r; const W = buf.w, H = buf.h, d = buf.d;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) if (d[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) out.set(d.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
  return { d: out, w, h, x0, y0, anchors: r.anchors };
}
onmessage = (e) => {
  const j = e.data;
  try { const S = SP[j.sp]; const c = crop(S.render(S.build(j.pose), j.opt)); postMessage({ key: j.key, time: j.time, d: c.d, w: c.w, h: c.h, x0: c.x0, y0: c.y0, anchors: c.anchors }, [c.d.buffer]); }
  catch (err) { postMessage({ key: j.key, err: String(err) }); }
};
postMessage({ ready: true });
`;
if (worker.includes('</script')) throw new Error('worker contains a closing tag');
if (js.includes('</script')) throw new Error('script contains a closing tag');
const css = read('game/style.css');
const page = read('game/page.html');
const title = (page.match(/<title>(.*?)<\/title>/) || [, 'Mudkip Snap'])[1];
const bodyPage = page.replace(/<title>.*?<\/title>\s*/, '');
const wtag = `<script type="text/js-worker" id="wk-src">\n${worker}</script>\n`;
const body = `<title>${title}</title>\n<style>\n${css}</style>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${title}</title>\n<style>\n${css}</style>\n</head>\n<body>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n</body>\n</html>\n`;
writeFileSync(join(root, 'game/index.html'), full);
console.log('game/index.html', (full.length / 1024).toFixed(0) + ' KB', files.length, 'scripts,', SPECIES.length, 'species');
if (process.argv[2]) { writeFileSync(process.argv[2], body); console.log('artifact body →', process.argv[2]); }
