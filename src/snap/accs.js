/* ------------------------------------------------------------------
   Accs — some wild Pokémon wear their own little accessories: party
   hats, bows, flower crowns, sunglasses, and woolly beanies in winter.
   Each Pokémon keeps the same look (picked from its seed).
------------------------------------------------------------------- */
const Accs = (() => {
  const { hex } = U;
  const INK = 0xff1b2240;
  const KINDS = ['party', 'bow', 'flower', 'shades', 'leaf', 'crown', 'sailor', 'straw', 'chef', 'pirate', 'bucket', 'phones', 'star'];
  const ART = {
    party: { m: ['...y...', '..rrr..', '..rwr..', '.rrrrr.', '.wrrrw.', 'rrrrrrr'], c: { r: '#ff4a8a', w: '#ffffff', y: '#ffe040' }, dy: -5 },
    bow: { m: ['rr...rr', 'rrr.rrr', 'rrrkrrr', 'rrr.rrr', 'rr...rr'], c: { r: '#ff5a7a', k: '#c02a4a' }, dy: -2 },
    flower: { m: ['.p.y.p.', 'pppgppp', '.p.g.p.'], c: { p: '#ffb0d8', y: '#ffe040', g: '#4ac860' }, dy: -1 },
    shades: { m: ['kkkkkkkkk', 'kbbk.kbbk', '.kk...kk.'], c: { k: '#101018', b: '#3a5aa8' }, dy: 7 },
    leaf: { m: ['...gg', '..ggg', '.ggg.', 'gg...', 'b....'], c: { g: '#5ad04a', b: '#6a4a2a' }, dy: -3 },
    crown: { m: ['y.y.y', 'yyyyy', 'yryby'], c: { y: '#ffd23a', r: '#ff4a4a', b: '#4a8aff' }, dy: -2 },
    beanie: { m: ['...w...', '.bbbbb.', 'bbbbbbb', 'wwwwwww'], c: { b: '#4a8aff', w: '#ffffff' }, dy: -2 },
  };
  function kindOf(m) {
    if (m === Game.mudkip || m.layer || m.kind === 'mailman' || (DexData.S[m.dex] || {}).legendary) return null;
    if (m.acc === undefined) { const h = U.hash(Math.floor(m.seed * 1000), 7, 3); m.acc = h < 0.38 ? KINDS[Math.floor(h / 0.38 * KINDS.length)] : null; }
    if (m.acc && typeof Pal !== 'undefined' && Pal.season === 'winter' && m.acc !== 'shades' && Game.area && !Game.area.def.noSeason) return 'beanie';
    return m.acc;
  }
  // the same real 3D pieces Mudkip wears (built by Mudkip.accModel, rendered on the fly and cached per angle and size)
  const TD = { party: { hat: 'party' }, bow: { hat: 'bow' }, flower: { hat: 'flower' }, shades: { glasses: 'round' }, crown: { hat: 'crown' }, beanie: { hat: 'beanie' },
    sailor: { hat: 'sailor' }, straw: { hat: 'straw' }, chef: { hat: 'chef' }, pirate: { hat: 'pirate' }, bucket: { hat: 'bucket' }, phones: { hat: 'headphones' }, star: { glasses: 'star' },
    mail: { hat: 'mail' }, topknot: { hat: 'topknot' }, tiki: { hat: 'straw', glasses: 'star' } };
  const cache = new Map();
  function sprite3D(look, px, yaw) {
    const yb = Math.round(yaw / (Math.PI / 8)), key = JSON.stringify(look) + '|' + px + '|' + yb;
    let b = cache.get(key);
    if (b !== undefined) return b;
    b = null;
    try {
      const sc = px / 34, W = Math.ceil(64 * sc) + 6, H = Math.ceil(52 * sc) + 6;
      const r = Mudkip.render(Mudkip.accModel(look), { yaw: yb * Math.PI / 8, pitch: 0.22, scale: sc, W, H, ox: W >> 1, oy: Math.round(H * 0.72), pal: Mudkip.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
      const s = r.buf; let y1 = -1, x0 = W, x1 = -1, y0 = H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (s.d[y * W + x]) { if (y > y1) y1 = y; if (y < y0) y0 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
      if (y1 >= 0) b = { s, W, H, y1, cxo: (x0 + x1) / 2, y0 };
    } catch (e) { b = null; }
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, b);
    return b;
  }
  function put(fb, x, y, c) { if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) return; const i = y * fb.w + x; fb.d[i] = c; const idb = Stage.S.idOn ? Stage.S.idb : null; if (idb) idb[i] = 0; }
  function draw(fb, cx, cy) {
    for (const m of Mons.all) {
      if (!m.alive || !m.visible || !m.spr || m.hideK > 0.5 || m.mode === 'swim') continue;
      const k = m.acc3 ? 'x' : kindOf(m); if (!k) continue;
      let p; try { p = m.at('top'); } catch (e) { continue; }
      if (!p) continue;
      const look = m.acc3 || TD[k];
      if (look) {
        const sw = m.spr.w || 40, px = Math.max(9, Math.min(26, Math.round(sw * (m.accK || 0.4))));
        const b = sprite3D(look, px, m.yaw || 0);
        if (b) {
          const hr = Stage.S.hour, nk = hr === 'night' ? 0.55 : hr === 'dusk' ? 0.28 : hr === 'dawn' ? 0.15 : 0, nt = hr === 'dusk' ? 0xff503048 : 0xff3a2012;
          const sink = look.glasses && !look.hat ? -Math.round(px * 0.55) : Math.round(px * (m.accSink ?? 0.18));
          const X = Math.round(p[0] - cx - (m.flip ? b.W - 1 - b.cxo : b.cxo)), Y = Math.round(p[1] - cy - b.y1 + sink + (m.jy || 0));
          for (let y = b.y0; y <= b.y1; y++) for (let x = 0; x < b.W; x++) { const c = b.s.d[y * b.W + (m.flip ? b.W - 1 - x : x)]; if (c) put(fb, X + x, Y + y, nk ? U.mix(c, nt, nk) : c); }
          continue;
        }
      }
      const A = ART[k]; if (!A) continue;
      const w = A.m[0].length, X = Math.round(p[0] - cx - w / 2 + (m.jy ? 0 : 0)), Y = Math.round(p[1] - cy - A.m.length + A.dy + (m.jy || 0));
      A.m.forEach((row, y) => { for (let x = 0; x < w; x++) { const ch = row[x]; if (ch === '.') continue; put(fb, X + x, Y + y, hex(A.c[ch])); } });
      // a dark outline so it reads on any background
      for (let y = -1; y <= A.m.length; y++) for (let x = -1; x <= w; x++) {
        const at = (xx, yy) => yy >= 0 && yy < A.m.length && xx >= 0 && xx < w && A.m[yy][xx] !== '.';
        if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) put(fb, X + x, Y + y, INK);
      }
    }
  }
  return { draw };
})();
