// Build the game into a single standalone HTML file (game/index.html) and,
// optionally, a body-only artifact file: node tools/build-game.mjs [artifactOut]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const files = [
  'src/px.js', 'src/creature.js', 'src/mudkip.js', 'src/ball.js', 'src/scenery.js', 'src/actors.js', 'src/beach.js',
  'src/paintings.js', 'src/paintings2.js', 'src/game/audio.js',
  'src/cove/pix.js', 'src/cove/fx.js', 'src/cove/cast.js', 'src/cove/scenes.js', 'src/cove/main.js',
];
const js = files.map((f) => `/* ==== ${f} ==== */\n${read(f)}`).join('\n') + '\nCove.boot();\n';
const css = read('game/style.css');
const page = read('game/page.html');
const title = (page.match(/<title>(.*?)<\/title>/) || [, 'Mudkip Beach Game'])[1];
const bodyPage = page.replace(/<title>.*?<\/title>\s*/, '');
if (js.includes('</script')) throw new Error('script contains a closing tag');
const wtag = '';
const body = `<title>${title}</title>\n<style>\n${css}</style>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${title}</title>\n<style>\n${css}</style>\n</head>\n<body>\n${bodyPage}\n${wtag}<script>\n${js}</script>\n</body>\n</html>\n`;
writeFileSync(join(root, 'game/index.html'), full);
console.log('game/index.html', (full.length / 1024).toFixed(0) + ' KB', files.length, 'scripts');
if (process.argv[2]) { writeFileSync(process.argv[2], body); console.log('artifact body →', process.argv[2]); }
