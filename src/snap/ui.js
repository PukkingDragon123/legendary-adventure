/* ------------------------------------------------------------------
   UI — pixel drawing kit for the device-style interface (camera,
   Pokédex, HUD, map): bevelled panels, round buttons, icons, skins.
   Everything draws into a PX.Buf at the UI canvas resolution.
------------------------------------------------------------------- */
const UI = (() => {
  const { clamp, mix, hex, bayer4 } = U;
  const put = (fb, x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = c; };
  const blend = (fb, x, y, c, a) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = U.mix(fb.d[y * fb.w + x] || 0xff000000, c, a); };
  function rect(fb, x, y, w, h, c) { x |= 0; y |= 0; for (let yy = Math.max(0, y); yy < Math.min(fb.h, y + h); yy++) fb.d.fill(c, yy * fb.w + Math.max(0, x), yy * fb.w + Math.min(fb.w, x + w)); }
  // translucent fill: over empty (transparent) UI pixels it writes the colour with alpha so the world shows through
  function rectA(fb, x, y, w, h, c, a) {
    const al = Math.round(a * 255) << 24, rgb = c & 0xffffff;
    for (let yy = Math.max(0, y | 0); yy < Math.min(fb.h, (y | 0) + h); yy++) for (let xx = Math.max(0, x | 0); xx < Math.min(fb.w, (x | 0) + w); xx++) {
      const i = yy * fb.w + xx, v = fb.d[i];
      fb.d[i] = v ? U.mix(v, c, a) : (al | rgb) >>> 0;
    }
  }
  function hline(fb, x0, x1, y, c) { for (let x = x0; x <= x1; x++) put(fb, x, y, c); }
  function vline(fb, x, y0, y1, c) { for (let y = y0; y <= y1; y++) put(fb, x, y, c); }
  function line(fb, x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 4000; g++) { put(fb, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // rounded rectangle with radius r (1..4) — filled
  function rrect(fb, x, y, w, h, r, c) {
    x |= 0; y |= 0;
    for (let yy = 0; yy < h; yy++) {
      let inset = 0;
      if (yy < r) inset = r - Math.round(Math.sqrt(r * r - (r - yy - 0.5) ** 2));
      else if (yy >= h - r) inset = r - Math.round(Math.sqrt(r * r - (yy - (h - r) + 0.5) ** 2));
      hline(fb, x + inset, x + w - 1 - inset, y + yy, c);
    }
  }
  // bevelled panel: outline, body, top-left highlight, bottom-right shade
  function panel(fb, x, y, w, h, s = {}) {
    const r = s.r ?? 3;
    rrect(fb, x, y, w, h, r, s.ol ?? 0xff1b2240);
    rrect(fb, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), s.fill ?? 0xffe8ecf6);
    if (s.hi !== null) { hline(fb, x + r, x + w - 1 - r, y + 1, s.hi ?? U.tweak(s.fill ?? 0xffe8ecf6, 0, 1, 0.12)); vline(fb, x + 1, y + r, y + h - 1 - r, s.hi ?? U.tweak(s.fill ?? 0xffe8ecf6, 0, 1, 0.12)); }
    if (s.sh !== null) { hline(fb, x + r, x + w - 1 - r, y + h - 2, s.sh ?? U.tweak(s.fill ?? 0xffe8ecf6, 0, 1, -0.14)); vline(fb, x + w - 2, y + r, y + h - 1 - r, s.sh ?? U.tweak(s.fill ?? 0xffe8ecf6, 0, 1, -0.14)); }
  }
  // inset screen (dark rim, glassy fill)
  function screen(fb, x, y, w, h, s = {}) {
    rrect(fb, x, y, w, h, s.r ?? 2, s.rim ?? 0xff101626);
    rrect(fb, x + 1, y + 1, w - 2, h - 2, Math.max(0, (s.r ?? 2) - 1), s.fill ?? 0xff9fd8a8);
    if (s.glare !== false) for (let k = 0; k < Math.min(w, h) * 0.5; k++) put(fb, x + 3 + k, y + 2 + ((k * 0.0) | 0), U.mix(s.fill ?? 0xff9fd8a8, 0xffffffff, 0.25));
  }
  function disc(fb, cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) put(fb, cx + x, cy + y, c); }
  function ring(fb, cx, cy, r, c, th = 1) { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.sqrt(x * x + y * y); if (d <= r + 0.5 && d > r - th + 0.5) put(fb, cx + x, cy + y, c); } }
  // shaded sphere button
  function orb(fb, cx, cy, r, c, o = {}) {
    const ol = o.ol ?? 0xff1b2240;
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > r + 0.5) continue;
      if (d > r - 0.5) { put(fb, cx + x, cy + y, ol); continue; }
      const l = (-x - y) / (r * 1.6) + 0.35;
      let col = l > 0.62 ? U.tweak(c, 0, 1, 0.16) : l < -0.05 ? U.tweak(c, 0, 1, -0.12) : c;
      if (Math.hypot(x + r * 0.38, y + r * 0.42) < r * 0.22) col = 0xffffffff;
      put(fb, cx + x, cy + y, col);
    }
  }
  // stamp a pixel map with a colour table
  function pix(fb, map, x, y, cols, sc = 1) {
    for (let r = 0; r < map.length; r++) for (let c = 0; c < map[r].length; c++) {
      const ch = map[r][c]; if (ch === '.' || !(ch in cols)) continue;
      for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) put(fb, x + c * sc + i, y + r * sc + j, cols[ch]);
    }
  }
  // blit a colour PX.Buf (0 = transparent) scaled by integer sc
  function img(fb, src, x, y, sc = 1, o = {}) {
    x |= 0; y |= 0;
    const W = src.w, H = src.h, d = src.d;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const v = d[yy * W + (o.flip ? W - 1 - xx : xx)];
      if (!v && !o.opaque) continue;
      if (o.clip && (x + xx * sc < o.clip.x0 || y + yy * sc < o.clip.y0 || x + xx * sc >= o.clip.x1 || y + yy * sc >= o.clip.y1)) continue;
      const c = o.tint ? U.mix(v, o.tint, o.tintK ?? 0.5) : v;
      if (sc === 1) put(fb, x + xx, y + yy, c); else rect(fb, x + xx * sc, y + yy * sc, sc, sc, c);
    }
  }
  // image scaled to fit a box (nearest neighbour, any factor)
  function imgFit(fb, src, x, y, w, h) {
    for (let yy = 0; yy < h; yy++) {
      const sy = Math.floor((yy / h) * src.h);
      for (let xx = 0; xx < w; xx++) { const v = src.d[sy * src.w + Math.floor((xx / w) * src.w)]; if (v) put(fb, x + xx, y + yy, v); }
    }
  }
  const text = (fb, s, x, y, c, o) => Font.draw(fb, s, x, y, c, o);

  /* ---- device skins (Pokédex + camera share them) ---- */
  const SKINS = {
    'skin.classic': { name: 'Rotom Dex', body: '#e8502a', bodyL: '#ff9a5a', bodyD: '#a8321a', ink: '#2a0a0a', screen: '#c8ecff', screenD: '#4a8ac8', accent: '#2f7ae8', lens: '#4ab8ff', trim: '#f4f4f8', btn: '#26303e' },
    'skin.sapphire': { name: 'Sapphire Blue', body: '#2a5ad8', bodyL: '#5a8aff', bodyD: '#16318a', ink: '#0a1034', screen: '#a8e4f0', screenD: '#3a7a9a', accent: '#ffd23a', lens: '#8ae0ff', trim: '#f0f4ff', btn: '#1c2448' },
    'skin.emerald': { name: 'Emerald', body: '#1f9a52', bodyL: '#4ad07a', bodyD: '#0e5a2e', ink: '#062414', screen: '#d8f4b0', screenD: '#6a9a3a', accent: '#ffcc30', lens: '#7affc0', trim: '#f0fff4', btn: '#12301f' },
    'skin.luvdisc': { name: 'Luvdisc Pink', body: '#f06c9a', bodyL: '#ffa0c0', bodyD: '#b03a64', ink: '#3a0a1e', screen: '#ffe2ec', screenD: '#c07a92', accent: '#ff3a6a', lens: '#ffd0e0', trim: '#fff4f8', btn: '#4a1a2e', heart: 1 },
    'skin.mudkip': { name: 'Mudkip', body: '#3a92d8', bodyL: '#8ad7fa', bodyD: '#2356a0', ink: '#0e2448', screen: '#dff6ff', screenD: '#5a9ac8', accent: '#f28a2a', lens: '#ffae45', trim: '#ffffff', btn: '#15336b' },
    'skin.coral': { name: 'Coral Reef', body: '#ff7a6a', bodyL: '#ffb09a', bodyD: '#c0443a', ink: '#3a0e0a', screen: '#b8f4ee', screenD: '#3a9a92', accent: '#2ad0c0', lens: '#6af0e0', trim: '#fff8f0', btn: '#3a1c1a' },
    'skin.cosmic': { name: 'Cosmic', body: '#2a1a5a', bodyL: '#5a3aa8', bodyD: '#120a30', ink: '#06020e', screen: '#1a1040', screenD: '#6a4ac0', accent: '#ff7ad8', lens: '#9af0ff', trim: '#d0c0ff', btn: '#0a0620', stars: 1, dark: 1 },
    'skin.melody': { name: 'Melody', body: '#e8f4d8', bodyL: '#ffffff', bodyD: '#a8c890', ink: '#1a2a18', screen: '#1a3a3a', screenD: '#4ac0b0', accent: '#ff7ab8', lens: '#5ae0c8', trim: '#6ad8a8', btn: '#2a3a28', notes: 1, dark: 1 },
    'skin.gold': { name: 'Champion Gold', body: '#e0b030', bodyL: '#ffe07a', bodyD: '#9a7010', ink: '#2a1a04', screen: '#fff4c8', screenD: '#b08a3a', accent: '#ff4a3a', lens: '#ffe8a0', trim: '#fffbe8', btn: '#3a2a08' },
  };
  const skinCache = {};
  function skin(id) {
    id = id || (Save.data && Save.data.equip.skin) || 'skin.classic';
    if (skinCache[id]) return skinCache[id];
    const s = SKINS[id] || SKINS['skin.classic'], o = {};
    for (const k in s) o[k] = typeof s[k] === 'string' ? hex(s[k]) : s[k];
    o.id = id; o.name = s.name;
    o.text = o.dark ? 0xfff0f4ff : 0xff1b2240;
    o.screenText = o.dark ? 0xffe8fff8 : 0xff14281c;
    return (skinCache[id] = o);
  }
  // the red (skin) device body with shading & screws
  function body(fb, x, y, w, h, S, o = {}) {
    rrect(fb, x, y, w, h, o.r ?? 6, S.ink);
    rrect(fb, x + 1, y + 1, w - 2, h - 2, (o.r ?? 6) - 1, S.bodyD);
    rrect(fb, x + 1, y + 1, w - 3, h - 4, (o.r ?? 6) - 1, S.body);
    hline(fb, x + (o.r ?? 6), x + w - (o.r ?? 6) - 1, y + 2, S.bodyL);
    vline(fb, x + 2, y + (o.r ?? 6), y + h - (o.r ?? 6) - 1, S.bodyL);
    if (S.stars) for (let k = 0; k < w * h * 0.004; k++) { const px = x + 4 + ((k * 73) % (w - 8)), py = y + 4 + ((k * 151) % (h - 8)); put(fb, px, py, 0xffd8d0ff); }
    if (S.heart) for (let k = 0; k < 6; k++) Font.icon(fb, 'heart', x + 8 + ((k * 97) % (w - 20)), y + 6 + ((k * 61) % (h - 16)), 1, U.mix(S.body, S.bodyL, 0.6));
    if (S.notes) for (let k = 0; k < 8; k++) Font.icon(fb, 'note', x + 6 + ((k * 89) % (w - 14)), y + 6 + ((k * 53) % (h - 14)), 1, S.bodyD);
    if (o.screws) for (const [sx, sy] of [[x + 4, y + 4], [x + w - 6, y + 4], [x + 4, y + h - 7], [x + w - 6, y + h - 7]]) { put(fb, sx, sy, S.bodyD); put(fb, sx + 1, sy, S.bodyL); put(fb, sx, sy + 1, S.bodyL); put(fb, sx + 1, sy + 1, S.bodyD); }
  }
  // the big blue lens with a glint (the Pokédex's eye / the camera's sensor light)
  function lens(fb, cx, cy, r, S, glow = 0, t = 0) {
    disc(fb, cx, cy, r + 2, 0xfff4f4f8); ring(fb, cx, cy, r + 2, S.ink);
    disc(fb, cx, cy, r, U.tweak(S.lens, 0, 1, -0.2));
    disc(fb, cx - 1, cy - 1, r - 2, S.lens);
    disc(fb, cx - r * 0.35, cy - r * 0.35, Math.max(1, r * 0.3), 0xffffffff);
    if (glow > 0) for (let y = -r * 3; y <= r * 3; y++) for (let x = -r * 3; x <= r * 3; x++) { const d = Math.hypot(x, y); if (d > r + 2 && d < r * 3) blend(fb, cx + x, cy + y, S.lens, glow * (1 - d / (r * 3)) * 0.5); }
  }
  function led(fb, x, y, c, on = true) { disc(fb, x, y, 2, 0xff1b2240); disc(fb, x, y, 1, on ? c : U.mix(c, 0xff000000, 0.6)); if (on) put(fb, x - 1, y - 1, 0xffffffff); }

  return { put, blend, rect, rectA, hline, vline, line, rrect, panel, screen, disc, ring, orb, pix, img, imgFit, text, skin, SKINS, body, lens, led };
})();
