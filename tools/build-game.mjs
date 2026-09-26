// Build the game into a single standalone HTML file (game/index.html) and,
// optionally, a body-only artifact file: node tools/build-game.mjs [artifactOut]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const SPECIES = ['spheal', 'sealeo', 'walrein', 'corphish', 'luvdisc', 'pelipper', 'wailord', 'kyogre', 'dialga', 'palkia', 'minior', 'deoxys'];
const files = [
  'src/px.js', 'src/scenery.js', 'src/actors.js', 'src/creature.js', 'src/mudkip.js', 'src/ball.js', 'src/beach.js', 'src/paintings.js', 'src/paintings2.js',
  ...SPECIES.map((s) => `src/species/${s}.js`).filter((p) => existsSync(join(root, p))),
  'src/game/world.js', 'src/game/waves.js', 'src/game/render.js', 'src/game/props.js', 'src/game/scene.js', 'src/game/fx.js',
  'src/game/critters.js', 'src/game/life.js', 'src/game/audio.js', 'src/game/main.js',
  ...['src/game/friends.js', 'src/game/deep.js', 'src/game/magic.js', 'src/game/space.js', 'src/game/fun.js', 'src/game/gallery.js'].filter((p) => existsSync(join(root, p))),
];
const js = files.map((f) => `/* ==== ${f} ==== */\n${read(f)}`).join('\n') + '\nGame.boot();\n';
// worker: the renderer + species models + a tiny message handler
const wfiles = ['src/px.js', 'src/creature.js', 'src/mudkip.js', ...SPECIES.map((s) => `src/species/${s}.js`).filter((p) => existsSync(join(root, p)))];
const names = ['Mudkip', ...SPECIES.filter((s) => existsSync(join(root, `src/species/${s}.js`))).map((s) => s[0].toUpperCase() + s.slice(1))];
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
const css = read('game/style.css');
const page = read('game/page.html');
const title = (page.match(/<title>(.*?)<\/title>/) || [, 'Mudkip Beach Game'])[1];
const bodyPage = page.replace(/<title>.*?<\/title>\s*/, '');
if (js.includes('</script')) throw new Error('script contains a closing tag');
const wtag = `<script type="text/js-worker" id="wk-src">\n${worker}</script>\n`;
const body = `<title>${title}</title>\n<style>\n${css}</style>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${title}</title>\n<style>\n${css}</style>\n</head>\n<body>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n</body>\n</html>\n`;
writeFileSync(join(root, 'game/index.html'), full);
console.log('game/index.html', (full.length / 1024).toFixed(0) + ' KB', files.length, 'scripts');
if (process.argv[2]) { writeFileSync(process.argv[2], body); console.log('artifact body →', process.argv[2]); }
