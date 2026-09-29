// Standalone species preview (no game build needed):
//   node tools/species-preview.mjs out.png Name[,Name2] [poses-json] [yaws]
// poses-json: JSON array of pose objects (default [{}] = each species' DEFAULT); yaws: comma list (default 1.1,0.4,2.2)
// Renders every species × pose × yaw at a readable scale on a grid, with the in-game noon palette.
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, out, names = 'Mudkip', posesArg = '[{}]', yawsArg = '1.1,0.4,2.2', px = '150'] = process.argv;
const list = names.split(',');
const files = ['src/px.js', 'src/scenery.js', 'src/creature.js', 'src/mudkip.js', 'src/snap/times.js', ...list.filter((n) => n !== 'Mudkip').map((n) => `src/species/${n.toLowerCase()}.js`)];
const js = files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n;\n');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
p.on('console', (m) => console.log('LOG', m.text()));
await p.setContent('<html><body style="margin:0;background:#9cc4ac"></body></html>');
await p.addScriptTag({ content: js + '\nwindow.__ok = true;' });
const size = await p.evaluate(({ list, poses, yaws, px }) => {
  if (!window.__ok) return null;
  const P = Times.compile('noon');
  const cols = poses.length * yaws.length, cell = px + 20;
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = list.length * (cell + 14);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#9cc4ac'; g.fillRect(0, 0, c.width, c.height);
  list.forEach((n, row) => {
    const S = (0, eval)(n); if (!S) { console.log('missing global ' + n); return; }
    const m = S.meta || { bw: 128, bh: 128, oy: 0.86 };
    const sc = Math.min(2, px / Math.max(m.bw, m.bh));
    const W = Math.ceil(m.bw * sc), H = Math.ceil(m.bh * sc);
    const gp = P.gradePal(S.PAL || S.BASE_PAL, n.toLowerCase());
    let col = 0;
    for (const po of poses) for (const yaw of yaws) {
      try {
        const pose = Object.assign({}, S.DEFAULT || {}, po, { side: Math.max(-1, Math.min(1, 3 * Math.cos(yaw))) });
        const r = S.render(S.build(pose), { yaw, pitch: 0.16, scale: sc, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: gp.pal, light: gp.light });
        const id = new ImageData(new Uint8ClampedArray(r.buf.d.buffer.slice(0)), r.buf.w, r.buf.h);
        const tc = document.createElement('canvas'); tc.width = r.buf.w; tc.height = r.buf.h; tc.getContext('2d').putImageData(id, 0, 0);
        const x = col * cell + (cell - W) / 2, y = row * (cell + 14) + (cell - H) / 2;
        g.drawImage(tc, x, y);
      } catch (e) { console.log(n + ' render error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
      col++;
    }
    g.fillStyle = '#000'; g.font = '12px monospace'; g.fillText(n + '  (meta ' + m.bw + 'x' + m.bh + ', h ' + m.heightM + 'm)', 4, row * (cell + 14) + cell + 10);
  });
  document.body.appendChild(c); window.__c = c;
  return [c.width, c.height];
}, { list, poses: JSON.parse(posesArg), yaws: yawsArg.split(',').map(Number), px: +px });
if (!size) { console.log('script failed to load (see PAGE ERROR above)'); await b.close(); process.exit(1); }
await p.setViewportSize({ width: Math.min(size[0], 4000), height: Math.min(size[1], 4000) });
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: Math.min(size[0], 4000), height: Math.min(size[1], 4000) } });
await b.close();
console.log('wrote', out, size);
