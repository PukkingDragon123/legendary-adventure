/* ------------------------------------------------------------------
   Font — crisp bitmap text for the Pokédex, camera and HUD.
   Glyph atlases are pre-rasterised pixel fonts (fontdata.js). Inline
   icons: "{star}", "{heart}", "{note}", ... Colour runs: "[#ffcc00]gold[]".
------------------------------------------------------------------- */
const Font = (() => {
  const FONTS = {};
  for (const id in FONTDATA) {
    const f = FONTDATA[id], g = {};
    for (const k in f.g) {
      const [adv, w, h, dx, dy, b64] = f.g[k];
      const bits = b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : new Uint8Array(0);
      const a = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) a[i] = (bits[i >> 3] >> (i & 7)) & 1;
      g[k] = { adv, w, h, dx, dy, a };
    }
    FONTS[id] = { asc: f.asc, desc: f.desc, size: f.size, g, lh: f.asc + f.desc };
  }
  // per-font vertical metrics tuned for layout (top of caps sits near y)
  const TOP = { body: 5, title: 5, small: 3 };

  /* ---- inline pixel icons ---- */
  const IC = {
    star: { c: { y: '#ffd83a', o: '#e08a1a', w: '#fff6c0' }, m: ['...o...', '..oyo..', 'ooyyyoo', 'oyywyyo', '.oyyyo.', '.oyoyo.', 'oo...oo'] },
    star0: { c: { g: '#7a86a8' }, m: ['...g...', '..g.g..', 'gg...gg', 'g.....g', '.g...g.', '.g.g.g.', 'gg...gg'] },
    heart: { c: { r: '#ff4f78', l: '#ffc2d2', d: '#b8204a' }, m: ['.rr.rr.', 'rlrrrrr', 'rrrrrrr', 'drrrrrd', '.drrrd.', '..drd..', '...d...'] },
    note: { c: { k: '#ffffff' }, m: ['..kkkk', '..k..k', '..k..k', '.kk.kk', 'kkkkkk', '.k..k.'] },
    lock: { c: { k: '#1b2240', y: '#ffd83a', o: '#c07a10' }, m: ['.kkk.', 'k...k', 'k...k', 'kkkkk', 'kyyyk', 'kyoyk', 'kyyyk', 'kkkkk'] },
    cam: { c: { k: '#1b2240', r: '#ee3b45', w: '#ffffff', b: '#5ab8ff' }, m: ['..kkk...', 'kkkkkkkk', 'krrrrrrk', 'krkkkkrk', 'krkbbkrk', 'krkbwkrk', 'krkkkkrk', 'kkkkkkkk'] },
    check: { c: { g: '#4fd66a', d: '#1f7a3a' }, m: ['......g', '.....gd', 'g...gd.', 'dg.gd..', '.dgd...', '..d....'] },
    cross: { c: { r: '#ff5a6a' }, m: ['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'] },
    right: { c: { k: '#ffffff' }, m: ['k...', 'kk..', 'kkk.', 'kkkk', 'kkk.', 'kk..', 'k...'] },
    left: { c: { k: '#ffffff' }, m: ['...k', '..kk', '.kkk', 'kkkk', '.kkk', '..kk', '...k'] },
    up: { c: { k: '#ffffff' }, m: ['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk'] },
    down: { c: { k: '#ffffff' }, m: ['kkkkkkk', '.kkkkk.', '..kkk..', '...k...'] },
    pb: { c: { k: '#1b2240', r: '#ee3b45', w: '#f4f7fb', l: '#ff9a9a' }, m: ['.kkkkk.', 'krlrrrk', 'krrrrrk', 'kkkwkkk', 'kwwwwwk', 'kwwwwwk', '.kkkkk.'] },
    coin: { c: { y: '#ffd83a', o: '#c8801a', w: '#fff6c0' }, m: ['.ooo.', 'oywyo', 'oyyyo', 'oyyyo', '.ooo.'] },
    spark: { c: { w: '#ffffff' }, m: ['..w..', '..w..', 'wwwww', '..w..', '..w..'] },
    drop: { c: { b: '#5ab8ff', c: '#d8f4ff' }, m: ['..b..', '.bbb.', 'bcbbb', 'bcbbb', '.bbb.'] },
    sun: { c: { y: '#ffd83a', o: '#ff9a2a' }, m: ['y..y..y', '.yoooy.', '.oyyyo.', 'yoyyyoy', '.oyyyo.', '.yoooy.', 'y..y..y'] },
    moon: { c: { y: '#fff0b0', o: '#d8c070' }, m: ['..yyy.', '.yy...', 'yy....', 'yy....', 'yy....', '.yy..o', '..yyy.'] },
    rain: { c: { b: '#5ab8ff', w: '#ffffff' }, m: ['.www..', 'wwwwww', '......', 'b.b.b.', '.b.b.b'] },
    bag: { c: { k: '#1b2240', o: '#e08a3a', y: '#ffc070' }, m: ['.kkk.', 'k...k', 'kkkkk', 'kyyyk', 'koook', 'kkkkk'] },
    shirt: { c: { k: '#1b2240', p: '#ff7aa8', r: '#ff3a6a' }, m: ['kk.kk', 'kpkpk', '.prp.', '.ppp.', '.kkk.'] },
    warn: { c: { y: '#ffd23a', k: '#1b2240', o: '#c07a10' }, m: ['...o...', '..oyo..', '..oko..', '.oykyo.', '.oyyyo.', 'oyykyyo', 'ooooooo'] },
    disk: { c: { k: '#1b2240', b: '#3a78e8', s: '#d8e0ee', w: '#f4f7fb' }, m: ['kkkkkk.', 'kbsksbk', 'kbsssbk', 'kbbbbbk', 'kbwwwbk', 'kbwwwbk', 'kkkkkkk'] },
    new: { c: { r: '#ff3a4a', w: '#ffffff' }, m: ['rrrrrrrrrrr', 'rwrrwrwwwrr', 'rwwrwrwrrrr', 'rwrwwrwwrrr', 'rwrrwrwwwrr', 'rrrrrrrrrrr'] },
  };
  const ICONS = {};
  for (const k in IC) {
    const { c, m } = IC[k];
    const cols = {}; for (const ch in c) cols[ch] = PX.hex(c[ch]);
    ICONS[k] = { w: m[0].length, h: m.length, m, cols };
  }

  // stray symbols the bitmap fonts lack are drawn as pixel icons (or plain ASCII) instead of '?'
  const SUB = { '★': '{star}', '☆': '{star0}', '♥': '{heart}', '❤': '{heart}', '♪': '{note}', '♫': '{note}', '✓': '{check}', '✔': '{check}', '✗': '{cross}', '✕': '{cross}', '✖': '{cross}',
    '→': '{right}', '▶': '{right}', '►': '{right}', '←': '{left}', '◀': '{left}', '◄': '{left}', '↑': '{up}', '▲': '{up}', '↓': '{down}', '▼': '{down}', '⚠': '{warn}', '\u{1F4BE}': '{disk}', '✨': '{spark}', '☀': '{sun}', '☾': '{moon}', '•': '·', '–': '-', '‘': "'", '═': '=' };
  const SUBRE = new RegExp('[' + Object.keys(SUB).filter((k) => k.length === 1).join('') + ']|\u{1F4BE}|\uFE0F', 'gu');
  function parse(str) {
    if (/[^\x00-\x7e]/.test(str)) str = str.replace(SUBRE, (c) => SUB[c] ?? '');
    // → tokens: {t:'c', ch}, {t:'i', icon}, {t:'col', c}
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') { const j = str.indexOf('}', i); if (j > i && ICONS[str.slice(i + 1, j)]) { out.push({ t: 'i', icon: str.slice(i + 1, j) }); i = j; continue; } }
      if (ch === '[') {
        if (str[i + 1] === ']') { out.push({ t: 'col', c: null }); i++; continue; }
        if (str[i + 1] === '#') { const j = str.indexOf(']', i); if (j > i) { out.push({ t: 'col', c: PX.hex(str.slice(i + 1, j)) }); i = j; continue; } }
      }
      out.push({ t: 'c', ch });
    }
    return out;
  }
  function glyph(F, ch) { return F.g[ch.charCodeAt(0)] || F.g[63]; }
  function tokW(F, tk, sc) {
    if (tk.t === 'i') return (ICONS[tk.icon].w + 1) * sc;
    if (tk.t === 'col') return 0;
    return glyph(F, tk.ch).adv * sc;
  }
  function measure(str, font = 'body', sc = 1) {
    const F = FONTS[font];
    let w = 0;
    for (const tk of parse(String(str))) w += tokW(F, tk, sc);
    return w;
  }
  // greedy word wrap
  function wrap(str, font, maxW, sc = 1) {
    const lines = [];
    for (const para of String(str).split('\n')) {
      const words = para.split(' ');
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (measure(t, font, sc) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
      }
      lines.push(cur);
    }
    return lines;
  }
  function put(fb, x, y, c) { if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = c; }
  function block(fb, x, y, s, c) { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) put(fb, x + i, y + j, c); }

  /**
   * draw(fb, str, x, y, color, opts) → width drawn
   * opts: font, sc (integer scale), shadow (colour), outline (colour), align ('left'|'center'|'right'),
   *       maxW + lh (wrapping), clip {x0,y0,x1,y1}
   */
  function draw(fb, str, x, y, col, o = {}) {
    const font = o.font || 'body', F = FONTS[font], sc = o.sc || 1;
    str = String(str);
    if (o.maxW) {
      const lines = wrap(str, font, o.maxW, sc), lh = o.lh || (F.lh - 2) * sc;
      let w = 0;
      lines.forEach((ln, i) => { w = Math.max(w, draw(fb, ln, x, y + i * lh, col, Object.assign({}, o, { maxW: 0 }))); });
      return w;
    }
    const toks = parse(str);
    let W = 0; for (const tk of toks) W += tokW(F, tk, sc);
    let cx = Math.round(o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x);
    const top = Math.round(y - TOP[font] * sc);
    const clip = o.clip;
    const plot = (px, py, c) => {
      if (clip && (px < clip.x0 || py < clip.y0 || px >= clip.x1 || py >= clip.y1)) return;
      if (sc === 1) put(fb, px, py, c); else block(fb, px, py, sc, c);
    };
    let cur = col;
    const passes = [];
    if (o.outline !== undefined) passes.push([o.outline, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]]);
    if (o.shadow !== undefined) passes.push([o.shadow, [[1, 1]]]);
    passes.push([null, [[0, 0]]]);
    for (const [pc, offs] of passes) {
      let px = cx; cur = col;
      for (const tk of toks) {
        if (tk.t === 'col') { cur = tk.c === null ? col : tk.c; continue; }
        if (tk.t === 'i') {
          const ic = ICONS[tk.icon];
          const iy = top + Math.round((F.asc - ic.h) * sc) - (font === 'small' ? 0 : sc);
          for (let r = 0; r < ic.h; r++) for (let c = 0; c < ic.w; c++) {
            const ch = ic.m[r][c];
            if (ch === '.') continue;
            for (const [ox, oy] of offs) plot(px + c * sc + ox * sc, iy + r * sc + oy * sc, pc !== null ? pc : ic.cols[ch]);
          }
          px += (ic.w + 1) * sc;
          continue;
        }
        const g = glyph(F, tk.ch);
        if (g.w) {
          const gx = px + g.dx * sc, gy = top + g.dy * sc;
          for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) {
            if (!g.a[r * g.w + c]) continue;
            for (const [ox, oy] of offs) plot(gx + c * sc + ox * sc, gy + r * sc + oy * sc, pc !== null ? pc : cur);
          }
        }
        px += g.adv * sc;
      }
    }
    return W;
  }
  function icon(fb, name, x, y, sc = 1, tint = null) {
    const ic = ICONS[name];
    if (!ic) return;
    for (let r = 0; r < ic.h; r++) for (let c = 0; c < ic.w; c++) {
      const ch = ic.m[r][c];
      if (ch !== '.') block(fb, Math.round(x) + c * sc, Math.round(y) + r * sc, sc, tint !== null ? tint : ic.cols[ch]);
    }
  }
  return { draw, measure, wrap, icon, ICONS, FONTS, lh: (f = 'body') => FONTS[f].lh };
})();
