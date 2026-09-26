// Inline src/ into two builds:
//   index.html                      standalone page (GitHub Pages / open locally)
//   <scratch>/artifact/mudkip-museum.html   body-only page for the Artifact wrapper
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'src', f), 'utf8');
const JS = ['px.js', 'mudkip.js', 'ball.js', 'scenery.js', 'actors.js', 'beach.js', 'paintings.js', 'paintings2.js', 'app.js'];
const js = JS.map((f) => `// ---- ${f}\n` + src(f)).join('\n');
const css = src('style.css');
let page = src('page.html').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
if (page.includes('</script') && js.includes('</script')) throw new Error('script tag inside JS');
const cut = page.indexOf('</style>') + '</style>'.length;
const head = page.slice(0, cut), body = page.slice(cut);
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>${body}</body>
</html>
`;
writeFileSync(join(root, 'index.html'), standalone);
const out = process.argv[2];
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, page); }
console.log('index.html', (standalone.length / 1024).toFixed(1) + ' KB', out ? `+ ${out}` : '');
