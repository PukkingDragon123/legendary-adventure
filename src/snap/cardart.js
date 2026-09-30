/* ------------------------------------------------------------------
   CardArt — Slay-the-Spire style faces for the Cards battle:
    · a frame coloured by type (attack red, skill blue, power gold,
      silly purple) with an art window shaped by type (attack: pointed
      shield, skill: plain, power: oval), rarity trim (stone / silver /
      teal / gold), a cost orb, a name ribbon, a type plaque and the
      rules text (keywords in gold, upgraded numbers in green)
    · real illustrated art: the actual Mudkip model (with the player's
      cosmetics) posed doing the move, rendered on the spot and painted
      over with pixel effects (water, bubbles, ice, rocks, sun, rain...)
   Faces are cached per card, size and look.
   CardArt.face(card, w, h) → {w,h,d}; CardArt.back(w, h); CardArt.blit(...)
------------------------------------------------------------------- */
const CardArt = (() => {
  const { clamp, lerp, hex, mix } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const buf = (w, h) => ({ w, h, d: new Uint32Array(w * h) });
  const put = (b, x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < b.w && y < b.h) b.d[y * b.w + x] = c; };
  const get = (b, x, y) => (x >= 0 && y >= 0 && x < b.w && y < b.h ? b.d[y * b.w + x] : 0);
  const bl = (b, x, y, c, a) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= b.w || y >= b.h || a <= 0) return; const i = y * b.w + x; b.d[i] = b.d[i] ? mix(b.d[i], c, Math.min(1, a)) : c; };
  const dith = (x, y) => PX.bayer4(x, y);

  /* ---------- frame palettes ---------- */
  const KIND = {
    atk: { base: hex('#b8352c'), light: hex('#ec6a52'), dark: hex('#6c161a'), band: hex('#861f20'), art: hex('#3a0c10'), txt: hex('#2a0a0e'), lab: 'ATTACK' },
    skill: { base: hex('#2f67c0'), light: hex('#6aa2f0'), dark: hex('#15336e'), band: hex('#1c478a'), art: hex('#0c1e44'), txt: hex('#0c1a3a'), lab: 'SKILL' },
    power: { base: hex('#c89a22'), light: hex('#f8d864'), dark: hex('#6e4c0a'), band: hex('#946412'), art: hex('#3a2606'), txt: hex('#2a1c04'), lab: 'POWER' },
    silly: { base: hex('#8c3cc2'), light: hex('#c880f0'), dark: hex('#42146a'), band: hex('#5e2288'), art: hex('#220a38'), txt: hex('#1c0830'), lab: 'SILLY' },
    item: { base: hex('#3a9a58'), light: hex('#7ad890'), dark: hex('#185a2c'), band: hex('#227040'), art: hex('#0c2a16'), txt: hex('#0a2012'), lab: 'TREAT' },
  };
  // rarity trim: 0 starter (stone), 1 common (silver), 2 uncommon (teal), 3 rare (gold)
  const TRIM = [hex('#9a8a78'), hex('#d8e0ec'), hex('#6ae8e0'), hex('#ffd84a')];
  const GOLD = hex('#ffd070'), GREEN = hex('#8aff8a');

  /* ---------- painting helpers (all on a {w,h,d} buffer) ---------- */
  function grad(b, y0, y1, c0, c1, x0 = 0, x1 = b.w) {
    for (let y = y0; y < y1; y++) {
      const k = (y - y0) / Math.max(1, y1 - y0 - 1);
      for (let x = x0; x < x1; x++) { const q = k * 6, s = Math.floor(q), f = q - s; put(b, x, y, mix(c0, c1, (s + (f > dith(x, y) ? 1 : 0)) / 6)); }
    }
  }
  function rgrad(b, cx, cy, R, c0, c1) { // radial glow: c0 at the centre fading to whatever is there
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy) / R; if (d > 1) continue;
      const k = 1 - d; if (k * k > dith(x, y) * 0.9) bl(b, x, y, d < 0.35 ? c0 : c1, 0.35 + k * 0.6);
    }
  }
  const disc = (b, x, y, r, c) => UI.disc(b, Math.round(x), Math.round(y), r, c);
  function ring(b, x, y, r, c, th = 1) { UI.ring(b, Math.round(x), Math.round(y), r, c, th); }
  const line = (b, x0, y0, x1, y1, c) => UI.line(b, x0, y0, x1, y1, c);
  function thick(b, x0, y0, x1, y1, r, c) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let i = 0; i <= n; i++) disc(b, lerp(x0, x1, i / n), lerp(y0, y1, i / n), r, c); }
  function star4(b, x, y, r, c, core = WHITE) { for (let i = -r; i <= r; i++) { put(b, x + i, y, c); put(b, x, y + i, c); } for (let i = -Math.floor(r / 2); i <= Math.floor(r / 2); i++) { put(b, x + i, y + i, c); put(b, x + i, y - i, c); } put(b, x, y, core); }
  function burst(b, x, y, r0, r1, n, c, ph = 0) { for (let k = 0; k < n; k++) { const a = ph + (k / n) * Math.PI * 2, rr = k % 2 ? r1 * 0.7 : r1; line(b, Math.round(x + Math.cos(a) * r0), Math.round(y + Math.sin(a) * r0), Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), c); } }
  function spiky(b, x, y, r, c, ol) { // comic impact star
    const pts = 14;
    for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
      const a = Math.atan2(yy, xx), k = ((a / (Math.PI * 2)) * pts + pts) % 1, R = r * (0.55 + 0.45 * Math.abs(k - 0.5) * 2), d = Math.hypot(xx, yy);
      if (d <= R - 1) put(b, x + xx, y + yy, c); else if (d <= R) put(b, x + xx, y + yy, ol);
    }
  }
  function bubble(b, x, y, r) { if (r <= 1) { put(b, x, y, hex('#e8fbff')); return; } ring(b, x, y, r, hex('#e8fbff')); bl(b, x, y, hex('#9adcff'), 0.25); put(b, x - Math.ceil(r / 2), y - Math.ceil(r / 2), WHITE); }
  function cloud(b, x, y, w, c, c2) { const n = Math.max(2, Math.round(w / 6)); for (let i = 0; i < n; i++) { const cx = x + (i / (n - 1) - 0.5) * w, r = Math.round(w / n * (i % 2 ? 0.9 : 1.2)); disc(b, cx, y - (i % 2 ? 1 : 2), r, c); } if (c2) for (let i = 0; i < w; i++) put(b, x - w / 2 + i, y + Math.round(w / n * 0.8), c2); }
  function drop(b, x, y, c) { put(b, x, y, c); put(b, x, y + 1, c); put(b, x, y - 1, mix(c, WHITE, 0.5)); }
  function rock(b, x, y, r, c, seed = 1) {
    for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
      const a = Math.atan2(yy, xx), R = r * (0.78 + 0.22 * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed)), d = Math.hypot(xx, yy);
      if (d > R) continue;
      put(b, x + xx, y + yy, d > R - 1 ? INK : xx + yy < -r * 0.3 ? U.tweak(c, 0, 1, 0.12) : xx + yy > r * 0.5 ? U.tweak(c, 0, 1, -0.12) : c);
    }
  }
  function speed(b, x0, x1, y, c, gap = 0) { for (let x = x0; x <= x1; x++) if (!gap || (x % gap) < gap - 2) put(b, x, y, c); }
  function ground(b, y, c, c2) { for (let yy = y; yy < b.h; yy++) for (let x = 0; x < b.w; x++) put(b, x, yy, yy === y ? U.tweak(c, 0, 1, 0.1) : (dith(x, yy) < 0.25 && c2 ? c2 : c)); }

  /* ---------- Mudkip, rendered from the real model ---------- */
  let noon = null;
  const pal = () => { if (!noon) { try { noon = Times.compile('noon').gradePal(Mudkip.PAL, 'mudkip-card'); } catch (e) { noon = { pal: Mudkip.PAL, light: undefined }; } } return noon; };
  const lookOf = () => { try { return Save.look(); } catch (e) { return {}; } };
  const lookKey = () => JSON.stringify(lookOf());
  // draw Mudkip with its feet at (fx, fy); returns the anchor points in buffer coords
  function kip(b, pose, fx, fy, sc, o = {}) {
    const yaw = o.yaw ?? 0.62;
    const W = Math.ceil(112 * sc) + 6, H = Math.ceil(112 * sc) + 6, ox = Math.floor(W / 2), oy = Math.floor(H * 0.86);
    const P = Object.assign({}, o.plain ? {} : lookOf(), pose, { side: clamp(3 * Math.cos(yaw), -1, 1) });
    let r;
    try { const g = pal(); r = Mudkip.render(Mudkip.build(P), { yaw, pitch: o.pitch ?? 0.14, scale: sc, W, H, ox, oy, pal: g.pal, light: g.light }); } catch (e) { return {}; }
    const s = r.buf, X0 = Math.round(fx - ox), Y0 = Math.round(fy - oy);
    const rot = o.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot), pcx = ox, pcy = oy - 28 * sc;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sx = x, sy = y;
      if (rot) { const dx = x - pcx, dy = y - pcy; sx = Math.round(pcx + dx * ca + dy * sa); sy = Math.round(pcy - dx * sa + dy * ca); }
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      let c = s.d[sy * W + sx]; if (!c) continue;
      const X = X0 + x, Y = Y0 + y;
      if (o.clipY !== undefined && Y > o.clipY) continue;
      if (o.tint !== undefined) c = mix(c, o.tint, o.tintK ?? 0.5);
      if (o.alpha !== undefined) bl(b, X, Y, c, o.alpha); else put(b, X, Y, c);
    }
    const an = {};
    for (const k in r.anchors) { const a = r.anchors[k]; an[k] = [a[0] + X0, a[1] + Y0]; }
    return an;
  }

  /* ---------- the illustrations ---------- */
  // each painter gets (b, W, H, s) where s = Mudkip scale for this size
  const SAND = hex('#f0d49a'), SAND2 = hex('#d8b474');
  const ART = {
    tackle(b, W, H, s) {
      grad(b, 0, H, hex('#7ac8f8'), hex('#fff0c8'));
      cloud(b, W * 0.2, H * 0.22, W * 0.3, hex('#ffffff'));
      const gy = Math.round(H * 0.8); ground(b, gy, SAND, SAND2);
      for (let k = 0; k < 6; k++) speed(b, 2, Math.round(W * 0.28) - k * 3, Math.round(H * 0.38 + k * H * 0.08), 0xccffffff);
      const an = kip(b, { lean: 0.28, headPitch: 0.34, legF: -0.95, legB: 0.95, eyes: 'open', mouth: 0.15, tailLift: 0.45, finSway: -0.3, squash: -0.06 }, W * 0.42, gy + 1, s);
      const hx = Math.round(W * 0.82), hy = Math.round(H * 0.5);
      spiky(b, hx, hy, Math.round(H * 0.24), hex('#ffe050'), hex('#e06a1a'));
      spiky(b, hx, hy, Math.round(H * 0.13), WHITE, hex('#ffe050'));
      for (let k = 0; k < 3; k++) disc(b, W * 0.3 - k * 5, gy - 1 - (k % 2), 2 - (k > 1 ? 1 : 0), hex('#fff4d8'));
      void an;
    },
    block(b, W, H, s) {
      grad(b, 0, H, hex('#1a3a7a'), hex('#4a8ae0'));
      for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) put(b, x, y, hex('#6aa8f0'));
      const gy = Math.round(H * 0.84); ground(b, gy, hex('#6a7aa0'), hex('#56668a'));
      kip(b, { bodyDip: 1.6, headPitch: 0.28, squash: 0.08, eyes: 'blink', mouth: 0.1, legSplay: 0.3, finSway: -0.1 }, W * 0.36, gy + 1, s);
      // the shield: a glassy arc in front
      const cx = Math.round(W * 0.62), cy = Math.round(H * 0.52), R = Math.round(H * 0.4);
      for (let y = -R; y <= R; y++) for (let x = 0; x <= R * 0.5; x++) {
        const ex = x / (R * 0.5), ey = y / R, d = ex * ex + ey * ey; if (d > 1) continue;
        bl(b, cx + x, cy + y, hex('#a8e0ff'), d > 0.72 ? 0.9 : 0.35);
      }
      for (let y = -R; y <= R; y++) { const x = Math.round(Math.sqrt(Math.max(0, 1 - (y / R) ** 2)) * R * 0.5); put(b, cx + x, cy + y, WHITE); put(b, cx + x - 1, cy + y, hex('#c8f0ff')); }
      star4(b, cx + Math.round(R * 0.3), cy - Math.round(R * 0.55), 2, WHITE); star4(b, cx + 2, cy + Math.round(R * 0.5), 1, WHITE);
    },
    splash(b, W, H, s) {
      grad(b, 0, Math.round(H * 0.7), hex('#ff9a6a'), hex('#ffd8a0'));
      disc(b, W * 0.78, H * 0.42, Math.round(H * 0.16), hex('#fff0b0'));
      const sea = Math.round(H * 0.7); grad(b, sea, H, hex('#3a8ad8'), hex('#1a4a98'));
      for (let x = 0; x < W; x += 3) put(b, x, sea, hex('#bfe8ff'));
      kip(b, { eyes: 'happy', mouth: 1, legF: -0.7, legB: 0.8, tailLift: 0.6, headPitch: -0.2, squash: -0.1 }, W * 0.45, sea - Math.round(H * 0.18), s, { rot: -0.25 });
      for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI, r = H * 0.32; drop(b, Math.round(W * 0.45 + Math.cos(a) * r * 0.9), Math.round(sea + Math.sin(a) * r * 0.55), hex('#8ad0ff')); }
      star4(b, Math.round(W * 0.18), Math.round(H * 0.2), 2, hex('#ffe070')); star4(b, Math.round(W * 0.7), Math.round(H * 0.14), 1, WHITE); star4(b, Math.round(W * 0.3), Math.round(H * 0.5), 1, hex('#ff8ad8'));
    },
    bubble(b, W, H, s) {
      grad(b, 0, H, hex('#3aa8e8'), hex('#0e3a88'));
      for (let k = 0; k < 3; k++) for (let y = 0; y < H; y++) { const x = Math.round(W * (0.15 + k * 0.3) + y * 0.4); if (dith(x, y) < 0.35) bl(b, x, y, WHITE, 0.25); }
      const gy = Math.round(H * 0.88); ground(b, gy, hex('#d8c08a'), hex('#b8a070'));
      const an = kip(b, { mouth: 1, headPitch: -0.12, eyes: 'happy', finSway: 0.1, tailWag: 0.3 }, W * 0.3, gy + 1, s);
      const m = an.mouth || [W * 0.4, H * 0.5];
      for (let k = 0; k < 7; k++) { const t = k / 6; bubble(b, Math.round(m[0] + 3 + t * W * 0.55), Math.round(m[1] - 2 - Math.sin(t * 2.6) * H * 0.28), Math.round(1 + t * H * 0.1)); }
    },
    growl(b, W, H, s) {
      grad(b, 0, H, hex('#8a3ac8'), hex('#ff7ab0'));
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#5a2a7a'), hex('#4a1a6a'));
      const an = kip(b, { mouth: 1, headPitch: -0.38, eyes: 'blink', legF: 0.35, squash: -0.1, finSway: -0.25, tailLift: 0.3 }, W * 0.3, gy + 1, s);
      const m = an.mouth || [W * 0.4, H * 0.45];
      for (let k = 1; k <= 4; k++) { const R = k * H * 0.12; for (let a = -0.9; a <= 0.5; a += 0.03) put(b, Math.round(m[0] + Math.cos(a) * R), Math.round(m[1] + Math.sin(a) * R), k % 2 ? WHITE : hex('#ffe070')); }
      Font.draw(b, '!!', Math.round(W * 0.84), Math.round(H * 0.18), hex('#ffe070'), { font: 'small', outline: INK, align: 'center' });
    },
    dig(b, W, H, s) {
      grad(b, 0, Math.round(H * 0.45), hex('#8ad0f8'), hex('#d8f0ff'));
      const gy = Math.round(H * 0.6);
      for (let y = gy; y < H; y++) for (let x = 0; x < W; x++) put(b, x, y, dith(x, y) < 0.2 ? hex('#6a3a1a') : y === gy ? hex('#a8703a') : hex('#8a5428'));
      kip(b, { eyes: 'happy', mouth: 1, headPitch: 0.1, legF: -0.8 }, W * 0.45, gy + Math.round(H * 0.22), s, { clipY: gy });
      for (let x = -8; x <= 8; x++) { const h = Math.round(3 * (1 - (x / 9) ** 2)); for (let y = 0; y < h; y++) put(b, Math.round(W * 0.45) + x + (x > 0 ? 6 : -6), gy - y, y === h - 1 ? hex('#b07a40') : hex('#8a5428')); }
      for (let k = 0; k < 7; k++) { const a = -Math.PI * (0.15 + k * 0.1); rock(b, Math.round(W * 0.45 + Math.cos(a) * H * 0.35 * (k % 2 ? 1 : 0.7)), Math.round(gy - 4 + Math.sin(a) * H * 0.4 * (k % 2 ? 0.7 : 1)), 1 + (k % 3 === 0 ? 1 : 0), hex('#8a5428'), k); }
    },
    smash(b, W, H, s) {
      grad(b, 0, H, hex('#f8a060'), hex('#ffe0a0'));
      for (let x = 0; x < W; x++) { const h = Math.round(H * 0.25 + Math.sin(x * 0.2) * 3 + Math.sin(x * 0.07) * 4); for (let y = H - h; y < H; y++) put(b, x, y - Math.round(H * 0.15), hex('#c8704a')); }
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#a86a3a'), hex('#8a5428'));
      kip(b, { lean: 0.3, headPitch: 0.5, legB: 0.95, legF: -0.3, eyes: 'blink', mouth: 0.2, finSway: -0.3 }, W * 0.34, gy + 1, s);
      const rx = Math.round(W * 0.74), ry = gy - Math.round(H * 0.2), R = Math.round(H * 0.24);
      rock(b, rx, ry, R, hex('#9a9aa8'), 3);
      line(b, rx - R + 2, ry - 2, rx, ry + 1, INK); line(b, rx, ry + 1, rx + 3, ry - R + 3, INK); line(b, rx, ry + 1, rx + 2, ry + R - 2, INK);
      for (let k = 0; k < 4; k++) rock(b, rx + Math.round((k - 1.5) * R * 0.8), ry - R - 2 - (k % 2) * 3, 1 + (k % 2), hex('#b8b8c4'), k);
      spiky(b, rx - R - 1, ry, Math.round(H * 0.14), WHITE, hex('#ffb040'));
    },
    ice(b, W, H, s) {
      grad(b, 0, H, hex('#a8e8ff'), hex('#3a8ac8'));
      for (let k = 0; k < 10; k++) put(b, (k * 37) % W, (k * 23) % Math.round(H * 0.7), WHITE);
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#e0f8ff'), hex('#b8e0f0'));
      const an = kip(b, { mouth: 1, headPitch: -0.06, eyes: 'open', finSway: -0.1, lean: -0.05 }, W * 0.26, gy + 1, s);
      const m = an.mouth || [W * 0.36, H * 0.5], x1 = W - 3;
      thick(b, m[0] + 1, m[1], x1, m[1] - 2, 2, hex('#6ad8ff')); thick(b, m[0] + 1, m[1], x1, m[1] - 2, 1, hex('#e8fbff'));
      for (let x = Math.round(m[0]) + 5; x < x1; x += 5) { star4(b, x, Math.round(m[1] - 1 + ((x / 5) % 2 ? -3 : 3)), 1, WHITE); }
      // an ice block forming at the end
      const bx = Math.round(W * 0.86), by = Math.round(m[1]) - 5;
      UI.rect(b, bx - 5, by - 3, 10, 12, hex('#c8f4ff')); UI.rect(b, bx - 5, by - 3, 10, 1, WHITE); UI.rect(b, bx - 5, by - 3, 1, 12, WHITE); UI.rect(b, bx + 4, by - 3, 1, 12, hex('#6ab8e0'));
    },
    flash(b, W, H, s) {
      grad(b, 0, H, hex('#fff8c0'), hex('#ffc84a'));
      burst(b, Math.round(W * 0.5), Math.round(H * 0.45), 4, Math.max(W, H), 22, WHITE, 0.1);
      rgrad(b, W * 0.5, H * 0.45, H * 0.55, WHITE, hex('#fff4b0'));
      const gy = Math.round(H * 0.88); ground(b, gy, hex('#f0d890'), hex('#e0c070'));
      kip(b, { eyes: 'happy', mouth: 1, headPitch: -0.15, squash: -0.08, tailLift: 0.4 }, W * 0.5, gy + 1, s, { yaw: 0.2 });
      star4(b, Math.round(W * 0.2), Math.round(H * 0.25), 3, WHITE, hex('#fff070')); star4(b, Math.round(W * 0.8), Math.round(H * 0.3), 2, WHITE);
    },
    rain(b, W, H, s) {
      grad(b, 0, H, hex('#4a5a7a'), hex('#8aa0c0'));
      cloud(b, W * 0.5, H * 0.14, W * 0.8, hex('#6a7890'), hex('#4a566e'));
      cloud(b, W * 0.5, H * 0.1, W * 0.55, hex('#8a98b0'));
      for (let k = 0; k < 26; k++) { const x = (k * 29 + 5) % W, y = Math.round(H * 0.3) + ((k * 17) % Math.round(H * 0.55)); put(b, x, y, hex('#bfe0ff')); put(b, x - 1, y + 1, hex('#8ac0f0')); }
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#5a7a5a'), hex('#4a6a4a'));
      for (let k = 0; k < 3; k++) { const px0 = Math.round(W * (0.2 + k * 0.3)); for (let x = -3; x <= 3; x++) put(b, px0 + x, gy + 2, hex('#8ac0f0')); }
      kip(b, { eyes: 'happy', mouth: 1, legF: -0.85, legB: 0.4, headRoll: 0.25, tailWag: 0.5, headPitch: -0.2 }, W * 0.5, gy, s, { rot: 0.18 });
    },
    sunny(b, W, H, s) {
      grad(b, 0, H, hex('#ffb040'), hex('#fff0a0'));
      const sx = Math.round(W * 0.76), sy = Math.round(H * 0.28), R = Math.round(H * 0.18);
      burst(b, sx, sy, R + 2, R + Math.round(H * 0.2), 12, hex('#fff4a0'), 0.2);
      disc(b, sx, sy, R, hex('#ffe050')); disc(b, sx - 1, sy - 1, R - 2, hex('#fff49a'));
      const gy = Math.round(H * 0.84); ground(b, gy, SAND, SAND2);
      kip(b, { eyes: 'happy', mouth: 0.8, headPitch: -0.22, glasses: 'star', lean: -0.08, legF: 0.25, tailWag: 0.2 }, W * 0.34, gy + 1, s);
    },
    quick(b, W, H, s) {
      grad(b, 0, H, hex('#e8f0ff'), hex('#a8b8e0'));
      for (let k = 0; k < 9; k++) speed(b, 0, W, Math.round(H * 0.12 + k * H * 0.09), k % 2 ? 0xffffffff : hex('#c8d4f0'), 7 + k);
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#8a98b8'), hex('#7a88a8'));
      const P = { lean: 0.32, headPitch: 0.3, legF: -1, legB: 1, eyes: 'blink', mouth: 0.3, finSway: -0.35, tailLift: 0.5 };
      kip(b, P, W * 0.3, gy + 1, s, { alpha: 0.22, tint: WHITE, tintK: 0.6 });
      kip(b, P, W * 0.46, gy + 1, s, { alpha: 0.45, tint: WHITE, tintK: 0.35 });
      kip(b, P, W * 0.64, gy + 1, s);
    },
    whirl(b, W, H, s) {
      grad(b, 0, H, hex('#2a6ac8'), hex('#0a1a58'));
      const cx = W * 0.5, cy = H * 0.55;
      for (let a = 0; a < 26; a += 0.05) { const r = a * H * 0.024, x = Math.round(cx + Math.cos(a) * r * 1.4), y = Math.round(cy + Math.sin(a) * r * 0.7); put(b, x, y, a % 6.28 < 3 ? hex('#8ad0ff') : WHITE); }
      kip(b, { eyes: 'happy', mouth: 1, legF: -0.7, legB: 0.7, tailWag: 0.6, headRoll: 0.3 }, cx, cy + Math.round(H * 0.28), s, { rot: 0.55 });
      for (let k = 0; k < 6; k++) drop(b, Math.round(cx + Math.cos(k) * W * 0.4), Math.round(cy + Math.sin(k * 2) * H * 0.3), hex('#bfe8ff'));
    },
    generic(b, W, H, s) {
      grad(b, 0, H, hex('#4ad0c0'), hex('#1a5a7a'));
      const gy = Math.round(H * 0.86); ground(b, gy, hex('#2a7a6a'), hex('#1a6a5a'));
      kip(b, { eyes: 'happy', mouth: 0.8, headPitch: -0.2 }, W * 0.34, gy + 1, s);
      const dx = Math.round(W * 0.72), dy = Math.round(H * 0.42), R = Math.round(H * 0.22);
      disc(b, dx, dy, R, INK); disc(b, dx, dy, R - 1, hex('#c8d0e0')); disc(b, dx, dy, Math.round(R * 0.6), hex('#8a98b8')); disc(b, dx, dy, 2, INK);
      star4(b, dx - R + 2, dy - R + 2, 2, WHITE);
    },
    berry(b, W, H) {
      grad(b, 0, H, hex('#8ae0a0'), hex('#2a8a4a'));
      burst(b, Math.round(W / 2), Math.round(H / 2), 3, W, 16, hex('#b0f0c0'));
      const cx = Math.round(W / 2), cy = Math.round(H * 0.55), R = Math.round(H * 0.3);
      disc(b, cx, cy, R + 1, INK); disc(b, cx, cy, R, hex('#3a6ae0')); disc(b, cx - 2, cy - 2, R - 3, hex('#5a8aff')); disc(b, cx - Math.round(R * 0.4), cy - Math.round(R * 0.4), 2, WHITE);
      UI.rect(b, cx - 1, cy - R - 4, 2, 4, hex('#3a2a1a')); disc(b, cx + 4, cy - R - 3, 2, hex('#4ac050'));
    },
  };

  /* ---------- the frame ---------- */
  // art window shape per type (x, y in 0..aw-1 / 0..ah-1)
  function inArt(kind, x, y, aw, ah) {
    if (kind === 'atk') { const tip = Math.min(5, Math.round(ah * 0.16)); if (y >= ah - tip) { const k = (y - (ah - tip) + 1) / tip; return Math.abs(x - (aw - 1) / 2) <= (aw / 2) * (1 - k * 0.9); } return true; }
    if (kind === 'power') { const u = (x - (aw - 1) / 2) / (aw / 2), v = (y - (ah - 1) / 2) / (ah / 2); return u * u * 0.55 + v * v * v * v * 0.0 + v * v <= 1.02 && (u * u + v * v * 0.6 <= 1.05); }
    if (kind === 'silly') { if (y >= ah - 3) return (y - (ah - 3)) < 2 + Math.round(Math.sin(x * 0.8)); return true; }
    return !((x === 0 || x === aw - 1) && (y === 0 || y === ah - 1));
  }
  const cache = new Map();
  function face(c, w, h) {
    const key = c.key + '|' + w + 'x' + h + '|' + (c.art === 'berry' ? '' : lookKey());
    let b = cache.get(key); if (b) return b;
    if (cache.size > 160) cache.clear();
    b = buf(w, h);
    const K = KIND[c.kind] || KIND.skill, trim = TRIM[clamp(c.r | 0, 0, 3)];
    // silhouette, trim, body with bevel
    UI.rrect(b, 0, 0, w, h, 5, INK);
    UI.rrect(b, 1, 1, w - 2, h - 2, 4, trim);
    UI.rrect(b, 2, 2, w - 4, h - 4, 3, K.base);
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) if (((x + y * 3) & 7) === 0) put(b, x, y, U.tweak(K.base, 0, 1, 0.035));
    UI.hline(b, 4, w - 5, 2, K.light); UI.vline(b, 2, 4, h - 5, K.light);
    UI.hline(b, 4, w - 5, h - 3, K.dark); UI.vline(b, w - 3, 4, h - 5, K.dark);
    if (c.r >= 3) for (const [x, y] of [[3, h - 4], [w - 4, h - 4], [w - 4, 3]]) put(b, x, y, WHITE);
    // art window
    const ax = 5, ay = 15, aw = w - 10, ah = Math.round(h * 0.4);
    const art = buf(aw, ah);
    const s = clamp(ah * 0.0098, 0.22, 0.6);
    try { (ART[c.art] || ART.generic)(art, aw, ah, s); } catch (e) { console.error(e); }
    if (c.up) for (const [x, y] of [[3, 3], [aw - 4, 4], [aw - 6, ah - 5]]) star4(art, x, y, 1, hex('#fff6a0'));
    const A = (x, y) => x >= 0 && y >= 0 && x < aw && y < ah && inArt(c.kind, x, y, aw, ah);
    for (let y = -1; y <= ah; y++) for (let x = -1; x <= aw; x++) {
      if (A(x, y)) { put(b, ax + x, ay + y, art.d[y * aw + x]); continue; }
      if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) put(b, ax + x, ay + y, INK);
      else if (A(x - 2, y) || A(x + 2, y) || A(x, y - 2) || A(x, y + 2)) put(b, ax + x, ay + y, K.dark);
    }
    // inner glint along the art's top edge
    for (let x = 1; x < aw - 1; x++) if (A(x, 0)) bl(b, ax + x, ay, WHITE, 0.35);
    // name ribbon with notched tails
    const ry = 3, rh = 10, rx0 = 9, rx1 = w - 4;
    for (let y = 0; y < rh; y++) for (let x = rx0; x <= rx1; x++) {
      const edge = x === rx0 || x === rx1 || y === 0 || y === rh - 1;
      const notch = x > rx1 - 3 && Math.abs(y - (rh - 1) / 2) < (x - (rx1 - 3)) * 1.3 - 0.5;
      if (notch) continue;
      put(b, x, ry + y, edge ? INK : y === 1 ? U.tweak(K.band, 0, 1, 0.12) : K.band);
    }
    let nm = c.name;
    const maxN = rx1 - rx0 - 8;
    if (Font.measure(nm, 'small') > maxN && c.short) nm = c.short;
    Font.draw(b, nm, Math.round((rx0 + 4 + rx1 - 3) / 2), ry + 3, c.up ? GREEN : WHITE, { font: 'small', align: 'center', outline: INK });
    // cost orb
    const ox = 7, oy = 7;
    UI.disc(b, ox, oy, 7, INK); UI.disc(b, ox, oy, 6, c.cost === 0 ? hex('#8ab8d8') : hex('#e87a1a'));
    UI.disc(b, ox - 1, oy - 1, 4, c.cost === 0 ? hex('#b8e0f8') : hex('#ffa83a')); UI.put(b, ox - 3, oy - 3, WHITE); UI.put(b, ox - 2, oy - 4, WHITE);
    Font.draw(b, String(c.cost), ox + 1, oy - 2, c.costUp ? GREEN : WHITE, { font: 'body', align: 'center', outline: INK });
    // type plaque straddling the bottom of the art
    const lab = K.lab, lw = Font.measure(lab, 'small') + 6, lx = Math.round(w / 2 - lw / 2), ly = ay + ah - 3;
    UI.rrect(b, lx, ly, lw, 8, 2, INK); UI.rrect(b, lx + 1, ly + 1, lw - 2, 6, 1, U.tweak(K.dark, 0, 1, 0.05));
    Font.draw(b, lab, Math.round(w / 2), ly + 2, U.mix(K.light, WHITE, 0.4), { font: 'small', align: 'center' });
    // rules text
    const ty = ly + 10, th = h - 4 - ty;
    UI.rrect(b, 4, ty - 1, w - 8, th, 2, U.mix(K.dark, INK, 0.35));
    const lines = Font.wrap(c.desc, 'small', w - 11);
    const lh = 8, n = Math.min(lines.length, Math.max(1, Math.floor((th + 1) / lh)));
    const y0 = Math.round(ty + (th - n * lh) / 2) + 1;
    for (let i = 0; i < n; i++) Font.draw(b, lines[i], Math.round(w / 2), y0 + i * lh, WHITE, { font: 'small', align: 'center' });
    // TM badge + "once" mark
    if (c.tm) { const t = c.tm, tw = Font.measure(t, 'small') + 4; UI.rect(b, ax + aw - tw - 1, ay + 1, tw, 7, 0xcc10182a); Font.draw(b, t, ax + aw - tw / 2 - 1, ay + 2, GOLD, { font: 'small', align: 'center' }); }
    if (c.exhaust) { UI.rect(b, ax + 1, ay + 1, Font.measure('ONCE', 'small') + 4, 7, 0xcc10182a); Font.draw(b, 'ONCE', ax + 3, ay + 2, hex('#ffb0a0'), { font: 'small' }); }
    // rarity gem on the bottom rim
    if (c.r >= 1) { const gx = Math.round(w / 2), gy = h - 2; UI.disc(b, gx, gy, 2, INK); UI.put(b, gx, gy, trim); UI.put(b, gx - 1, gy, trim); UI.put(b, gx, gy - 1, WHITE); }
    cache.set(key, b);
    return b;
  }
  // the card back (draw pile)
  function back(w, h) {
    const key = 'back|' + w + 'x' + h; let b = cache.get(key); if (b) return b;
    b = buf(w, h);
    UI.rrect(b, 0, 0, w, h, Math.min(5, Math.floor(w / 4)), INK);
    UI.rrect(b, 1, 1, w - 2, h - 2, Math.min(4, Math.floor(w / 4) - 1), hex('#d8e0ec'));
    UI.rrect(b, 2, 2, w - 4, h - 4, Math.min(3, Math.floor(w / 4) - 1), hex('#2a4a8a'));
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) if ((x + y) % 4 === 0) put(b, x, y, hex('#34589e'));
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2), R = Math.max(2, Math.floor(Math.min(w, h) * 0.26));
    UI.disc(b, cx, cy, R + 1, INK); UI.disc(b, cx, cy, R, hex('#f28a2a')); UI.disc(b, cx, cy, Math.max(1, R - 2), hex('#56bcf0')); if (R > 3) UI.disc(b, cx, cy, 1, WHITE);
    cache.set(key, b);
    return b;
  }
  // blit a face into the UI: scaled (nearest), optionally dimmed / faded / white-flashed
  function blit(fb, src, x, y, w, h, o = {}) {
    x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const a = o.alpha ?? 1, dim = o.dim || 0, fl = o.flash || 0;
    if (a <= 0.01) return;
    const sw = src.w, sh = src.h, fx = sw / w, fy = sh / h;
    const y0 = Math.max(0, -y), y1 = Math.min(h, fb.h - y), x0 = Math.max(0, -x), x1 = Math.min(w, fb.w - x);
    for (let yy = y0; yy < y1; yy++) {
      const sy = Math.min(sh - 1, Math.floor(yy * fy)), row = (y + yy) * fb.w, srow = sy * sw;
      for (let xx = x0; xx < x1; xx++) {
        let c = src.d[srow + Math.min(sw - 1, Math.floor(xx * fx))]; if (!c) continue;
        if (dim) c = mix(c, 0xff20242e, dim);
        if (fl) c = mix(c, WHITE, fl);
        const i = row + x + xx;
        if (a >= 0.99) fb.d[i] = c;
        else fb.d[i] = fb.d[i] ? mix(fb.d[i], c, a) : (((Math.round(a * 255) << 24) | (c & 0xffffff)) >>> 0);
      }
    }
  }
  return { face, back, blit, KIND, TRIM, ART, kip, cache };
})();
