/* ------------------------------------------------------------------
   Accs — some wild Pokémon wear their own little accessories: party
   hats, bows, flower crowns, sunglasses, and woolly beanies in winter.
   Each Pokémon keeps the same look (picked from its seed).
------------------------------------------------------------------- */
const Accs = (() => {
  const { hex } = U;
  const INK = 0xff1b2240;
  const KINDS = ['party', 'bow', 'flower', 'shades', 'leaf', 'crown'];
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
  function put(fb, x, y, c) { if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) return; const i = y * fb.w + x; fb.d[i] = c; const idb = Stage.S.idOn ? Stage.S.idb : null; if (idb) idb[i] = 0; }
  function draw(fb, cx, cy) {
    for (const m of Mons.all) {
      if (!m.alive || !m.visible || !m.spr || m.hideK > 0.5 || m.mode === 'swim') continue;
      const k = kindOf(m); if (!k) continue;
      const A = ART[k]; let p; try { p = m.at('top'); } catch (e) { continue; }
      if (!p) continue;
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
