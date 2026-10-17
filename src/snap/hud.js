/* ------------------------------------------------------------------
   HUD — the explore-mode interface on the UI canvas: the big camera
   button (pulses when a rare moment is happening nearby), field moves
   (Water Gun, Song, Berry, Scan), Pokédex + map buttons, clock, area
   banners and toasts. Other modes (camera, Pokédex, map) draw their
   own screens; the HUD routes input to them.
------------------------------------------------------------------- */
const HUD = (() => {
  const { clamp, lerp } = U;
  const H = { btns: [], press: null, armed: null, toasts: [], ban: null, hoverId: null, opT: 0, scanT: 0, tip: null };
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  function btn(id, x, y, w, h, fn, o = {}) { H.btns.push(Object.assign({ id, x, y, w, h, fn }, o)); }
  function down(ux, uy, pid) {
    for (let i = H.btns.length - 1; i >= 0; i--) { const b = H.btns[i]; if (ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) { H.press = { b, pid, x: ux, y: uy }; if (b.drag) b.drag(ux, uy, 'down'); return true; } }
    return false;
  }
  function move(ux, uy) { if (H.press && H.press.b.drag) H.press.b.drag(ux, uy, 'move'); }
  function up(ux, uy) {
    const p = H.press; H.press = null;
    if (!p) return;
    const b = p.b;
    if (b.drag) b.drag(ux, uy, 'up');
    if (ux >= b.x - 6 && uy >= b.y - 6 && ux < b.x + b.w + 6 && uy < b.y + b.h + 6 && b.fn) b.fn(ux, uy);
  }
  function hover(ux, uy) { H.hoverId = null; H.mouse = [ux, uy]; if (typeof Talk !== 'undefined') Talk.mouse = H.mouse; for (const b of H.btns) if (ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) H.hoverId = b.id; }
  const pressed = (id) => H.press && H.press.b.id === id;

  // (a note belongs to the screen it was made on: notes from the world wait while a menu is open)
  function toast(msg, o = {}) { H.toasts.push(Object.assign({ msg, t: 0, life: o.life || 2.8, icon: o.icon || null, col: o.col || null, mode: Game.mode === 'title' ? 'explore' : Game.mode }, o)); if (H.toasts.length > 4) H.toasts.shift(); }
  const MENUS = { bag: 1, style: 1, dex: 1, map: 1 };
  const toastHere = (tt) => tt.mode === Game.mode || Game.mode === 'explore' || Game.mode === 'camera' || (tt.t > 0.3 && !MENUS[Game.mode]);
  function banner(name, sub) { H.ban = { name, sub, t: 0 }; }
  function tool(id) {
    const mk = Game.mudkip;
    if (Game.mode !== 'explore' || !mk) return;
    if (id === 'song') { if (!mk.busy(1)) mk.doTask(mk.song(), 2); return; }
    if (id === 'scan') { scan(); return; }
    if (id === 'berry' && Save.itemN('berry') <= 0) { toast('Out of berries — shake a berry bush!'); Game.sfx('error'); return; }
    H.armed = H.armed === id ? null : id;
    Game.sfx('blip');
    if (H.armed) toast(id === 'water' ? 'Tap where to spray Water Gun' : 'Tap where to throw the berry', { life: 1.8 });
  }
  function scan() {
    H.scanT = 1.6; Game.sfx('scan');
    let found = 0;
    const A = Game.area;
    for (const m of Mons.all) if (m !== Game.mudkip && Math.abs(m.x - Game.mudkip.x) < Game.VW * 0.7) { if (m.onScan) { const r = m.onScan(); if (r) found++; } }
    for (const h of A.hot) if (h.onScan && Math.abs(((h.x0 + h.x1) / 2) - Game.mudkip.x) < Game.VW * 0.7) { if (h.onScan()) found++; }
    if (A.def.onScan) found += A.def.onScan(A) || 0;
    if (!found) setTimeout(() => toast('Scan: nothing unusual nearby.', { life: 1.8 }), 900);
  }
  // look through a telescope: a round vignette while the camera director pans far away
  function scope(dur = 4) { H.scopeV = { t: 0, dur }; }
  function drawScope(fb, t) {
    const V = H.scopeV; if (!V) return;
    const W = fb.w, Hh = fb.h, k = Math.min(1, V.t / 0.35, (V.dur - V.t) / 0.35);
    if (k <= 0) return;
    const R0 = Math.hypot(W, Hh) * 0.55, R = R0 + (Math.min(W, Hh) * 0.46 - R0) * U.ease.outCubic(k), cx = W / 2, cy = Hh / 2, R2 = R * R;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 > R2) fb.d[y * W + x] = 0xff08060a;
      else if (d2 > (R - 2) * (R - 2)) fb.d[y * W + x] = 0xff40302a;
      else if (d2 > (R - 5) * (R - 5)) fb.d[y * W + x] = fb.d[y * W + x] ? U.mix(fb.d[y * W + x], 0xff000000, 0.5) : 0x80000000;
    }
    // a little glare arc on the lens
    for (let a = -2.4; a < -1.5; a += 0.02) UI.put(fb, Math.round(cx + Math.cos(a) * (R - 12)), Math.round(cy + Math.sin(a) * (R - 12)), 0x60ffffff);
  }
  function update(dt) {
    if (H.scopeV) { H.scopeV.t += dt; if (H.scopeV.t > H.scopeV.dur) H.scopeV = null; }
    const hold = Game.mode === 'explore' && (banUp() || (typeof Progress !== 'undefined' && Progress.celebrating && Progress.celebrating()));
    if (!hold) for (const t of H.toasts) if (toastHere(t)) t.t += dt;
    H.toasts = H.toasts.filter((t) => t.t < t.life);
    if (H.ban) { H.ban.t += dt; if (H.ban.t > 4) H.ban = null; }
    H.scanT = Math.max(0, H.scanT - dt);
    // photo-op sense: a 3★+ moment on screen makes the camera button pulse
    H.op = 0;
    if (Game.mode === 'explore' && Game.mons) for (const m of Game.mons) {
      if (m === Game.mudkip || !m.alive || !m.visible) continue;
      const d = DexData.S[m.dex]; if (!d) continue;
      const b = d.beh[m.act.id];
      if (b && b.tier >= 3 && Math.abs(m.x - (Game.cam.x + Game.VW / 2)) < Game.VW * 0.6) H.op = Math.max(H.op, b.tier);
    }
    H.opT += dt;
  }

  /* ---------- drawing ---------- */
  const TOOLS = [
    { id: 'water', icon: 'drop', key: '1' },
    { id: 'song', icon: 'note', key: '2' },
    { id: 'berry', icon: 'berry', key: '3' },
    { id: 'scan', icon: 'scan', key: '4' },
  ];
  const ICONS = {
    berry: { m: ['..g..', '.kgk.', 'kbbbk', 'kbwbk', 'kbbbk', '.kkk.'], c: { k: INK, b: U.hex('#3a7ce8'), w: U.hex('#bfe2ff'), g: U.hex('#3aa84a') } },
    scan: { m: ['..kkk..', '.k...k.', 'k..w..k', 'k.www.k', 'k..w..k', '.k...kk', '..kkk.kk'], c: { k: WHITE, w: U.hex('#7affc0') } },
    dexIcon: { m: ['kkkkkkkk', 'krrrrrrk', 'krbbrrrk', 'krbbryrk', 'krrrrrrk', 'kkkkkkkk', 'krwwwwrk', 'krwwwwrk', 'krrrrrrk', 'kkkkkkkk'], c: { k: INK, r: U.hex('#dc2a3a'), b: U.hex('#4ab8ff'), y: U.hex('#ffd23a'), w: U.hex('#9fd8a8') } },
    map: { m: ['kkkkkkkkk', 'kbbgbbbbk', 'kbgggbbbk', 'kbbgbbybk', 'kbbbbyyyk', 'kbrbbbybk', 'kbbbbbbbk', 'kkkkkkkkk'], c: { k: INK, b: U.hex('#4a90e8'), g: U.hex('#4ac060'), y: U.hex('#f0d070'), r: U.hex('#ff4a5a') } },
    snd: { m: ['...k.....', '..kk...k.', 'kkwk.k..k', 'kwwk..k.k', 'kwwk..k.k', 'kkwk.k..k', '..kk...k.', '...k.....'], c: { k: WHITE, w: WHITE } },
    mute: { m: ['...k.....', '..kk.....', 'kkwk.r.r.', 'kwwk..r..', 'kwwk.r.r.', 'kkwk.....', '..kk.....', '...k.....'], c: { k: WHITE, w: WHITE, r: U.hex('#ff5a6a') } },
  };
  function iconAt(fb, name, x, y, sc = 1) {
    if (ICONS[name]) { const I = ICONS[name]; UI.pix(fb, I.m, x, y, I.c, sc); return; }
    Font.icon(fb, name, x, y, sc);
  }
  function roundBtn(fb, id, cx, cy, r, S, fn, o = {}) {
    const p = pressed(id) ? 1 : 0;
    UI.disc(fb, cx, cy + 1, r, U.mix(S.ink, 0xff000000, 0.3));
    UI.orb(fb, cx, cy + p, r, o.col ?? S.body, { ol: S.ink });
    btn(id, cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4, fn);
    return p;
  }
  function drawCameraButton(fb, S, t) {
    const L = typeof Pad !== 'undefined' && Pad.L ? Pad.L : null;
    const R = 15, cx = L ? Math.round(L.camX) : fb.w - R - 10, cy = L ? Math.round(L.camY) : fb.h - R - 16;
    const p = pressed('cam') ? 1 : 0;
    // pulse ring when something special is happening
    if (H.op >= 3) { const k = (H.opT * 1.6) % 1; UI.ring(fb, cx, cy, R + 3 + Math.round(k * 8), H.op >= 4 ? 0xff3ad2ff : 0xffffffff, 1); if (Math.sin(H.opT * 8) > 0) Font.draw(fb, '!', cx + R - 2, cy - R - 6, 0xff3ad2ff, { font: 'title', outline: INK }); }
    UI.disc(fb, cx, cy + 2, R + 1, 0xff0a0e1a);
    UI.disc(fb, cx, cy + p, R + 1, S.ink);
    // Poké Ball-style camera: skin-coloured top, white bottom, black band, lens button
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y); if (d > R) continue;
      let c = y < -1 ? (x + y < -R * 0.9 ? S.bodyL : S.body) : 0xfff2f4fa;
      if (y >= 1 && x - y > R * 0.6) c = 0xffc9d3e3;
      if (Math.abs(y) <= 1) c = S.ink;
      UI.put(fb, cx + x, cy + y + p, c);
    }
    UI.disc(fb, cx, cy + p, 7, S.ink); UI.disc(fb, cx, cy + p, 5, 0xfff2f4fa); UI.disc(fb, cx, cy + p, 3, 0xff2a3a5a); UI.disc(fb, cx - 1, cy - 1 + p, 1, 0xff8ad0ff);
    Font.draw(fb, 'SNAP', cx, cy + R + 3 + p, 0xffffffff, { font: 'small', align: 'center', outline: INK });
    btn('cam', cx - R - 4, cy - R - 4, R * 2 + 8, R * 2 + 8, () => Photo.open());
  }
  function drawTools(fb, S, t) {
    const sz = 22, gap = 4, x0 = 6, y0 = fb.h - sz - 8;
    TOOLS.forEach((tl, i) => {
      const x = x0 + i * (sz + gap), y = y0;
      const on = H.armed === tl.id || (tl.id === 'scan' && H.scanT > 0);
      const p = pressed('t-' + tl.id) ? 1 : 0;
      UI.rrect(fb, x, y + 2, sz, sz, 4, 0xff0a0e1a);
      UI.panel(fb, x, y + p, sz, sz, { r: 4, ol: S.ink, fill: on ? S.accent : S.btn, hi: on ? U.tweak(S.accent, 0, 1, 0.15) : U.tweak(S.btn, 0, 1, 0.12), sh: U.tweak(S.btn, 0, 1, -0.1) });
      const ic = tl.icon === 'drop' ? 'drop' : tl.icon === 'note' ? 'note' : tl.icon;
      if (ICONS[ic]) iconAt(fb, ic, x + Math.floor((sz - ICONS[ic].m[0].length * 2) / 2), y + p + Math.floor((sz - ICONS[ic].m.length * 2) / 2), 2);
      else { const I = Font.ICONS[ic]; Font.icon(fb, ic, x + Math.floor((sz - I.w * 2) / 2), y + p + Math.floor((sz - I.h * 2) / 2), 2); }
      if (tl.id === 'berry') Font.draw(fb, String(Save.itemN('berry')), x + sz - 2, y + sz - 6 + p, 0xffffffff, { font: 'small', align: 'right', outline: INK });
      Font.draw(fb, tl.key, x + 3, y + 3 + p, U.mix(S.trim, S.btn, 0.4), { font: 'small' });
      btn('t-' + tl.id, x - 1, y - 1, sz + 2, sz + 4, () => tool(tl.id));
    });
  }
  /* ---- pixel-art icons for the top bar (drawn from primitives so they stay crisp) ---- */
  const IC = { ink: INK, w: WHITE };
  function icoDex(fb, cx, cy, S) {
    UI.rrect(fb, cx - 6, cy - 7, 12, 15, 3, INK); UI.rrect(fb, cx - 5, cy - 6, 10, 13, 2, U.hex('#e8384a'));
    UI.hline(fb, cx - 3, cx + 3, cy - 5, U.hex('#ff7a84'));
    UI.disc(fb, cx - 2, cy - 3, 2, INK); UI.disc(fb, cx - 2, cy - 3, 1, U.hex('#5ac8ff')); UI.put(fb, cx - 3, cy - 4, WHITE);
    UI.put(fb, cx + 2, cy - 4, U.hex('#ffd23a')); UI.put(fb, cx + 4, cy - 4, U.hex('#6aff8a'));
    UI.rect(fb, cx - 4, cy + 1, 8, 4, INK); UI.rect(fb, cx - 3, cy + 2, 6, 2, U.hex('#9fe8b0'));
    UI.hline(fb, cx - 5, cx + 4, cy - 1, U.hex('#a8182a'));
  }
  function icoMap(fb, cx, cy) {
    const c = [U.hex('#f4e2b0'), U.hex('#e2cc92'), U.hex('#f4e2b0')];
    for (let i = 0; i < 3; i++) { const x0 = cx - 7 + i * 5, dy = i % 2 ? 1 : 0; UI.rect(fb, x0, cy - 5 + dy, 5, 10, INK); UI.rect(fb, x0 + 1, cy - 4 + dy, 3, 8, c[i]); }
    UI.rect(fb, cx - 5, cy - 2, 2, 2, U.hex('#4ab860')); UI.rect(fb, cx + 1, cy + 1, 3, 2, U.hex('#4a90e8'));
    // dotted route and a red X
    UI.put(fb, cx - 3, cy + 1, U.hex('#b06a3a')); UI.put(fb, cx - 1, cy, U.hex('#b06a3a')); UI.put(fb, cx + 1, cy - 1, U.hex('#b06a3a'));
    const r = U.hex('#e8384a'); UI.put(fb, cx + 3, cy - 4, r); UI.put(fb, cx + 5, cy - 4, r); UI.put(fb, cx + 4, cy - 3, r); UI.put(fb, cx + 3, cy - 2, r); UI.put(fb, cx + 5, cy - 2, r);
  }
  function icoBag(fb, cx, cy) {
    const o = U.hex('#f28a3a'), oD = U.hex('#c8602a'), oL = U.hex('#ffb872'), fl = U.hex('#dc6e2e');
    // handle loop
    UI.hline(fb, cx - 2, cx + 1, cy - 8, INK); UI.put(fb, cx - 3, cy - 7, INK); UI.put(fb, cx + 2, cy - 7, INK);
    UI.rrect(fb, cx - 6, cy - 6, 12, 14, 3, INK); UI.rrect(fb, cx - 5, cy - 5, 10, 12, 2, o);
    UI.hline(fb, cx - 3, cx + 2, cy - 5, oL); UI.vline(fb, cx - 5, cy - 3, cy + 4, oL);
    UI.hline(fb, cx - 3, cx + 2, cy + 6, oD); UI.vline(fb, cx + 4, cy - 3, cy + 4, oD);
    // flap with a buckle
    UI.rrect(fb, cx - 5, cy - 5, 10, 5, 2, fl); UI.hline(fb, cx - 5, cx + 4, cy, INK);
    UI.rect(fb, cx - 1, cy - 1, 2, 3, U.hex('#ffd23a')); UI.put(fb, cx - 1, cy - 1, WHITE);
    // front pocket
    UI.rect(fb, cx - 3, cy + 2, 6, 4, INK); UI.rect(fb, cx - 2, cy + 3, 4, 2, U.hex('#e27a36'));
  }
  function icoHat(fb, cx, cy, t) {
    const st = U.hex('#f2cc66'), stD = U.hex('#c89c40'), rb = U.hex('#e8384a');
    // crown
    UI.rrect(fb, cx - 5, cy - 6, 10, 9, 3, INK); UI.rrect(fb, cx - 4, cy - 5, 8, 7, 2, st);
    UI.hline(fb, cx - 3, cx + 1, cy - 5, U.hex('#fff0b8'));
    UI.rect(fb, cx - 4, cy - 1, 8, 2, rb); UI.put(fb, cx + 2, cy - 1, U.hex('#ff8a8a'));
    // brim
    for (let x = -8; x <= 8; x++) { const h = x * x > 49 ? 1 : 2; for (let y = 0; y < h; y++) UI.put(fb, cx + x, cy + 2 + y, st); UI.put(fb, cx + x, cy + 2 + h, INK); UI.put(fb, cx + x, cy + 1, x > -6 && x < 6 ? stD : INK); }
    UI.put(fb, cx - 9, cy + 3, INK); UI.put(fb, cx + 9, cy + 3, INK);
    // twinkle
    const k = Math.sin(t * 3) > 0 ? 1 : 0, sx = cx + 7, sy = cy - 6;
    UI.put(fb, sx, sy, WHITE); UI.put(fb, sx - 1, sy, WHITE); UI.put(fb, sx + 1, sy, WHITE); UI.put(fb, sx, sy - 1, WHITE); UI.put(fb, sx, sy + 1, WHITE);
    if (k) { UI.put(fb, sx - 2, sy, U.hex('#fff4a0')); UI.put(fb, sx + 2, sy, U.hex('#fff4a0')); UI.put(fb, sx, sy - 2, U.hex('#fff4a0')); UI.put(fb, sx, sy + 2, U.hex('#fff4a0')); }
  }
  function icoSound(fb, cx, cy, on) {
    UI.rect(fb, cx - 6, cy - 2, 3, 5, WHITE); for (let i = 0; i < 4; i++) UI.vline(fb, cx - 3 + i, cy - 2 - i, cy + 2 + i, WHITE);
    if (on) { for (const r of [3, 6]) for (let a = -0.9; a <= 0.9; a += 0.12) UI.put(fb, Math.round(cx + 2 + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), WHITE); }
    else { const r = U.hex('#ff5a6a'); for (let i = -2; i <= 2; i++) { UI.put(fb, cx + 4 + i, cy + i, r); UI.put(fb, cx + 4 + i, cy - i, r); } }
  }
  const TOPI = { dex: (fb, x, y, S, t) => icoDex(fb, x, y, S), map: (fb, x, y) => icoMap(fb, x, y), bag: (fb, x, y) => icoBag(fb, x, y), style: (fb, x, y, S, t) => icoHat(fb, x, y, t), snd: (fb, x, y) => icoSound(fb, x, y, Sound.on), games: (fb, x, y, S, t) => { UI.disc(fb, x, y + 1, 7, INK); UI.disc(fb, x, y, 6, U.hex('#ff5a4a')); UI.rect(fb, x - 6, y, 13, 1, INK); UI.disc(fb, x, y, 2, 0xffffffff); UI.put(fb, x - 3, y - 3, 0xffffc0c0); } };
  const TIP = { dex: 'Pokédex  P', map: 'Map  M', bag: 'Bag  B', style: 'Wardrobe  V', snd: 'Sound', games: 'Playground  H', quests: 'Quests  L', clock: 'Time of day  T' };
  // a hover tooltip: a small plate under (or over) a button, kept on screen
  function tipAt(fb, label, cx, y) {
    const w = Font.measure(label, 'small') + 10, x = U.clamp(Math.round(cx - w / 2), 3, fb.w - w - 3);
    UI.chip(fb, x, y, label, { w: w, h: 10, bg: UI.C.navy });
  }
  const BADGE = [U.hex('#ff4a5a'), U.hex('#b81e30')];
  // a square icon button of the top bar (raised face, sinks when pressed, gold rim on hover)
  function topBtn(fb, S, id, x, y, sz, fill, fn, drawIcon, badge, t) {
    const dn = pressed(id), hov = H.hoverId === id;
    UI.button(fb, x, y, sz, sz, { r: 6, fill, hover: hov, down: dn, ol: S.ink });
    drawIcon(x + sz / 2, y + sz / 2 + (dn ? 1 : 0));
    btn(id, x - 1, y - 1, sz + 2, sz + 4, () => { UI.pop(x + sz / 2, y + sz / 2, sz / 2 + 2); fn(); });
    if (badge) {
      const bx = x + sz - 2, by = y + 2 - (Math.sin(t * 5 + x) > 0.85 ? 1 : 0), ph = (t * 0.8 + x * 0.01) % 1;
      if (ph < 0.35) UI.ring(fb, bx, by, 3 + Math.round(ph * 10), U.mix(BADGE[0], 0xffffffff, ph * 2), 1);
      UI.disc(fb, bx, by + 1, 3, UI.C.shadow); UI.disc(fb, bx, by, 3, BADGE[1]); UI.disc(fb, bx, by, 2, BADGE[0]); UI.put(fb, bx - 1, by - 1, 0xffffffff);
    }
    return hov;
  }
  // the points counter rolls up to the real value (and the coin spins while it does)
  function coinChip(fb, S, x, y, t) {
    const real = Save.data.points | 0;
    if (H.coin === undefined || H.coin > real) H.coin = real;
    if (H.coin < real) { const was = H.coin; H.coin = Math.min(real, H.coin + Math.max(1, Math.ceil((real - H.coin) * 0.12))); if ((H.coin / 25 | 0) !== (was / 25 | 0)) { H.coinBump = 1; } H.coinT = 0.6; }
    H.coinT = Math.max(0, (H.coinT || 0) - 1 / 60); H.coinBump = Math.max(0, (H.coinBump || 0) - 0.12);
    const txt = String(H.coin), w = Math.max(44, Font.measure(txt, 'small') + 22), bump = H.coinBump > 0 ? -1 : 0;
    UI.plate(fb, x, y + 4, w, 16, { r: 5, fill: U.mix(S.btn, 0xff000000, 0.25), ol: S.ink, hi: null });
    // the coin: a little gold disc that spins (squashes) while counting
    const cx = x + 9, cy = y + 12 + bump, sq = H.coinT > 0 ? Math.abs(Math.cos(t * 14)) : 1, rw = Math.max(1, Math.round(4 * sq));
    for (let yy = -4; yy <= 4; yy++) for (let xx = -rw; xx <= rw; xx++) { const q = (xx / rw) ** 2 + (yy / 4) ** 2; if (q > 1.05) continue; UI.put(fb, cx + xx, cy + yy, q > 0.6 ? 0xff1a80c8 : xx + yy < -1 ? 0xffc0f6ff : 0xff3ad2ff); }
    Font.draw(fb, txt, x + 17, y + 9 + bump, H.coinT > 0 ? UI.C.goldL : 0xffffffff, { font: 'small', shadow: UI.C.ink });
    return w;
  }
  function drawTop(fb, S, t) {
    // right: quest log, Pokédex, map, bag, wardrobe, sound — icon buttons, no words
    const bw = 24, y = 6;
    const items = [
      { id: 'dex', fn: () => (Game.mode === 'dex' ? Dex.close() : Dex.open()), badge: Quests.unseen() },
      { id: 'map', fn: () => (Game.mode === 'map' ? WorldMap.close() : WorldMap.open()) },
      { id: 'bag', fn: () => Bag.open(), badge: typeof Bag !== 'undefined' && Bag.fresh && Bag.fresh() },
      { id: 'style', fn: () => Style.open(), badge: typeof Style !== 'undefined' && Style.fresh && Style.fresh() },
      { id: 'snd', fn: () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); } },
    ].filter((it) => typeof Progress === 'undefined' || Progress.hudOk(it.id));
    if (typeof Progress !== 'undefined') items.unshift({ id: 'quests', fn: () => Progress.openLog(), badge: Progress.logBadge() });
    H.rightX = fb.w - 6 - items.length * (bw + 3);
    let tip = null;
    items.forEach((it, i) => {
      const x = fb.w - 6 - (items.length - i) * (bw + 3);
      const fill = it.id === 'dex' ? S.body : S.btn;
      const hov = topBtn(fb, S, it.id, x, y, bw, fill, it.fn, (cx, cy) => { if (TOPI[it.id]) TOPI[it.id](fb, cx, cy, S, t); else if (it.id === 'quests') Progress.icon(fb, cx, cy, t); }, it.badge, t);
      if (hov) tip = [TIP[it.id], x + bw / 2];
    });
    // left: clock (tap = let time pass), points, season
    const hr = Game.hour(), x = 6;
    if (topBtn(fb, S, 'clock', x, y, 24, S.btn, () => Game.tryTime(), (cx, cy) => Font.icon(fb, hr === 'night' || hr === 'dusk' ? 'moon' : 'sun', cx - 7, cy - 7, 2), false, t)) tip = [TIP.clock, x + 12];
    const cw = coinChip(fb, S, x + 28, y, t);
    let lx = x + 28 + cw + 4;
    if (typeof Seasons !== 'undefined' && (typeof Progress === 'undefined' || Progress.has('season'))) {
      const sn = Seasons.cur, sc = U.mix(S.btn, U.hex({ spring: '#ff9ec4', summer: '#4ab860', autumn: '#e2741c', winter: '#9ad8ff' }[sn]), 0.3);
      if (topBtn(fb, S, 'season', lx, y, 24, sc, () => Seasons.next(), (cx, cy) => Seasons.icon(fb, cx, cy, sn, t), false, t)) tip = [Seasons.NAME[sn] + '  N', lx + 12];
      lx += 28;
    }
    H.leftX = lx;
    if (tip) tipAt(fb, tip[0], tip[1], y + bw + 5);
  }
  // throw a berry at the nearest Pokémon in front (or just ahead)
  function throwBerry() {
    const mk = Game.mudkip; if (!mk || Game.mode !== 'explore') return;
    const kind = (typeof Bag !== 'undefined' && Bag.lure) || 'oran', B = Harvest.BERRY[kind] || Harvest.BERRY.oran;
    if (!Save.useItem(B.inv)) { toast('No ' + B.name + 's left — pick some from a berry bush (E)!'); Game.sfx('error'); return; }
    const d = Math.cos(mk.yaw) >= 0 ? 1 : -1;
    let best = null, bd = 1e9;
    for (const m of Mons.all) { if (m === mk || !m.alive || !m.visible) continue; const dx = (m.x - mk.x) * d; if (dx < 8 || dx > 160) continue; const q = dx + Math.abs(m.y - mk.y); if (q < bd) { bd = q; best = m; } }
    const tx = best ? best.x - d * 10 : mk.x + d * 60, ty = best ? best.y - 4 : World.standY(mk.x + d * 60);
    mk.wakeUp(); mk.doTask(mk.throwBerry(tx, ty, kind), 2);
  }
  // the area name card: unrolls sideways in place under the top bar (never sweeps over the
  // buttons), a shine runs across it, then it rolls back up
  const banUp = () => !!H.ban && H.ban.t < 3.9;
  function drawBanner(fb, S, t) {
    const b = H.ban; if (!b) return;
    const kin = b.t < 0.4 ? U.ease.outBack(b.t / 0.4) : 1, kout = b.t > 3.4 ? 1 - U.ease.inCubic(Math.min(1, (b.t - 3.4) / 0.45)) : 1, k = Math.max(0, Math.min(kin, kout));
    if (k <= 0.03) return;
    const C = UI.C, w = Math.max(Font.measure(b.name, 'title') + 36, Font.measure(b.sub || '', 'small') + 30, 120), h = 38;
    const ww = Math.max(14, Math.round(w * k)), x = Math.round(fb.w / 2 - ww / 2), y = 36;
    UI.shadow(fb, x, y, ww, h, 6, 3, 0.5);
    UI.body(fb, x, y, ww, h, S, { r: 6 });
    if (ww < w * 0.8) return;
    const sx = x + 6, sw = ww - 12, clip = { x0: sx + 1, y0: y + 6, x1: sx + sw - 1, y1: y + h - 6 };
    UI.screen(fb, sx, y + 5, sw, h - 10, { fill: S.screen, rim: S.ink, glare: false });
    Font.draw(fb, b.name, fb.w / 2, y + 9, S.screenText, { font: 'title', align: 'center', clip });
    if (b.sub) Font.draw(fb, b.sub, fb.w / 2, y + 24, U.mix(S.screenText, S.screen, 0.35), { font: 'small', align: 'center', clip });
    // shine sweep
    const ph = (b.t - 0.35) / 0.7;
    if (ph > 0 && ph < 1) { const gx = sx + Math.round(ph * (sw + 30)) - 15; for (let yy = y + 6; yy < y + h - 6; yy++) for (let d = 0; d < 4; d++) { const xx = gx + d - (yy - y) * 0.6; if (xx > sx && xx < sx + sw - 1) UI.blend(fb, Math.round(xx), yy, 0xffffffff, d === 1 || d === 2 ? 0.55 : 0.25); } }
    if (!b.fired && b.t > 0.3) { b.fired = 1; UI.burst(x + 8, y + 6, 5, { speed: 30, c: C.goldL }); UI.burst(x + ww - 8, y + 6, 5, { speed: 30, c: C.goldL }); }
  }
  // notifications: a quiet stack of glassy notes sliding in at the top-left (bottom-left over
  // full-screen menus); they wait while the area name card is up
  function toastLayout(fb, list) {
    const maxW = Math.min(200, Math.round(fb.w * 0.44));
    return list.map((tt) => {
      const ic = tt.icon && Font.ICONS[tt.icon] ? tt.icon : null, iw = ic ? Font.ICONS[ic].w + 4 : 0;
      const lines = Font.wrap(tt.msg, 'small', maxW - 14 - iw).slice(0, 4);
      return { tt, ic, iw, lines, w: Math.max(...lines.map((l) => Font.measure(l, 'small'))) + 14 + iw, h: lines.length * 9 + 6 };
    });
  }
  function drawToasts(fb, S, t, bottom = false, top = 34) {
    if (!bottom && (banUp() || (typeof Progress !== 'undefined' && Progress.celebrating && Progress.celebrating()))) return;
    const C = UI.C, L = toastLayout(fb, H.toasts.filter(toastHere).slice(-3));
    // over full-screen menus the notes rise from the bottom centre like a snackbar
    let y = bottom ? fb.h - 4 - L.reduce((s, q) => s + q.h + 3, 0) : top;
    for (const q of L) {
      const tt = q.tt, kin = Math.min(1, tt.t / 0.28), kout = Math.min(1, (tt.life - tt.t) / 0.35);
      if (kout <= 0) continue;
      const e = U.ease.outBack(kin), col = tt.col ?? S.accent;
      const x = bottom ? Math.round(fb.w / 2 - q.w / 2) : Math.round(6 - (1 - e) * (q.w + 12) - (1 - kout) * 14);
      if (bottom) y += Math.round((1 - e) * 14 + (1 - kout) * 8);
      UI.plate(fb, x, y, q.w, q.h, { r: 3, fill: C.navy, a: 0.8 * kout, sa: 0.25 * kout, hi: null });
      UI.rect(fb, x + 2, y + 2, 2, q.h - 4, col);
      if (q.ic) Font.icon(fb, q.ic, x + 7, y + Math.round((q.h - Font.ICONS[q.ic].h) / 2), 1);
      q.lines.forEach((l, i) => Font.draw(fb, l, x + 8 + q.iw, y + 3 + i * 9, 0xffffffff, { font: 'small', shadow: C.ink }));
      // the time left, as a hairline along the bottom
      const lw = Math.round((q.w - 8) * Math.max(0, 1 - tt.t / tt.life));
      if (lw > 0) UI.hline(fb, x + 5, x + 5 + lw, y + q.h - 2, U.mix(col, C.navy, 0.45));
      if (bottom) y -= Math.round((1 - e) * 14 + (1 - kout) * 8);
      y += q.h + 3;
    }
  }
  function drawScan(fb, S, t) {
    if (H.scanT <= 0) return;
    const k = 1 - H.scanT / 1.6, r = Math.round(k * fb.w * 0.8);
    const cx = Math.round((Game.mudkip.x - Game.cam.x) * Game.zoom / Game.US), cy = Math.round((Game.mudkip.y - 14 - Game.cam.y) * Game.zoom / Game.US);
    UI.ring(fb, cx, cy, r, 0xff7affc0, 1);
    UI.ring(fb, cx, cy, Math.max(0, r - 6), U.mix(0xff7affc0, 0xff000000, 0.5), 1);
  }
  function drawTitle(fb, t) {
    const S = UI.skin();
    // dim + logo
    UI.rectA(fb, 0, 0, fb.w, fb.h, 0xff0a1030, 0.35);
    const w = 250, h = 96, x = Math.round(fb.w / 2 - w / 2), y = Math.round(fb.h * 0.28 - h / 2 + Math.sin(t * 1.5) * 2);
    UI.body(fb, x, y, w, h, S, { r: 8, screws: true });
    UI.lens(fb, x + 22, y + 22, 9, S, 0.5 + 0.5 * Math.sin(t * 3), t);
    UI.led(fb, x + 42, y + 12, 0xffff4a4a, Math.sin(t * 4) > 0); UI.led(fb, x + 50, y + 12, 0xff3ad2ff, true); UI.led(fb, x + 58, y + 12, 0xff4ade6a, Math.sin(t * 4 + 2) > 0);
    UI.screen(fb, x + 40, y + 24, w - 56, h - 38, { fill: S.screen, rim: S.ink });
    Font.draw(fb, 'MUDKIP', x + w / 2 + 12, y + 30, S.screenText, { font: 'title', align: 'center', sc: 2 });
    Font.draw(fb, 'S N A P', x + w / 2 + 12, y + 68, S.accent, { font: 'title', align: 'center' });
    Font.draw(fb, 'A Pokémon photo journey', fb.w / 2, y + h + 8, 0xffffffff, { font: 'body', align: 'center', outline: INK });
    // a big friendly start button that breathes
    const lab = typeof Pad !== 'undefined' && Pad.touch ? 'TAP TO START' : 'CLICK OR PRESS ENTER', bw = Font.measure(lab, 'small') + 30, by = Math.round(fb.h * 0.7) + (Math.sin(t * 3) > 0.6 ? -1 : 0);
    UI.button(fb, Math.round(fb.w / 2 - bw / 2), by, bw, 18, { label: lab, fill: S.accent, hover: Math.sin(t * 3) > 0, r: 6 });
    if ((t * 0.7) % 1 < 0.25) UI.twinkle(fb, fb.w / 2 + bw / 2 - 3, by + 2, 2);
    const feat = '{cam} Snap Pokémon  ·  {pb} Fill the Pokédex  ·  {note} Solve photo puzzles', fl = Font.measure(feat, 'small') <= fb.w - 12 ? [feat] : ['{cam} Snap Pokémon  ·  {pb} Fill the Pokédex', '{note} Solve photo puzzles'];
    fl.forEach((l, i) => Font.draw(fb, l, fb.w / 2, fb.h - 12 - (fl.length - i) * 10, 0xffffffff, { font: 'small', align: 'center', outline: INK }));
    btn('start', 0, 0, fb.w, fb.h, () => Game.start());
  }
  // every frame: the screen for the current mode, then the UI sparkles on top of everything
  function draw(fb, t) { drawMode(fb, t); UI.drawFx(fb); }
  function drawMode(fb, t) {
    H.btns.length = 0;
    const S = UI.skin();
    if (Game.mode === 'title') { drawTitle(fb, t); return; }
    if (Game.mode === 'dex') { Dex.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'map') { WorldMap.draw(fb, t); if (typeof Mailman !== 'undefined') Mailman.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'bag') { Bag.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'style') { Style.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'memory') { Memories.draw(fb, t); return; }
    if (Game.mode === 'rhythm') { Rhythm.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'camera') { Photo.drawUI(fb, t); Music.drawUI(fb, t, 'camera'); Talk.drawBubbles(fb, t); drawToasts(fb, S, t, false, Music.rect ? 60 : 34); Photo.drawCard && Photo.drawCard(fb, t); return; }
    const play = typeof Arcade !== 'undefined' && (Arcade.live || Arcade.bars > 0);
    if (play) {
      Arcade.drawUI(fb, t);
      Talk.drawBubbles(fb, t);
      if (typeof Pad !== 'undefined') Pad.draw(fb, S, t);
      drawToasts(fb, S, t, false, 40);
      Talk.drawDialog(fb, t);
      return;
    }
    drawScan(fb, S, t);
    Talk.drawBubbles(fb, t);
    if (typeof Boardwalk !== 'undefined' && Boardwalk.drawUI) Boardwalk.drawUI(fb, t);
    if (typeof Hosts !== 'undefined' && Hosts.drawUI) Hosts.drawUI(fb, t);
    if (typeof Harvest !== 'undefined' && !Talk.busy()) Harvest.drawPrompt(fb, t);
    // (the move wheel is modal: the top bar, the area card and notes step aside while it is open)
    const wheel = typeof Moves !== 'undefined' && !!Moves.wheel;
    if (!wheel) drawTop(fb, S, t);
    if (typeof Pad !== 'undefined') Pad.draw(fb, S, t);
    if (!Talk.busy()) drawCameraButton(fb, S, t);
    Music.drawUI(fb, t, 'explore');
    // a bigger moment (a new move, a level-up) folds the area card away early
    if (H.ban && H.ban.t < 3.4 && ((typeof Moves !== 'undefined' && Moves.learnFx) || (typeof Progress !== 'undefined' && Progress.lvUp && Progress.lvUp.t >= 0))) H.ban.t = 3.4;
    if (!wheel) drawBanner(fb, S, t);
    drawScope(fb, t);
    if (!wheel) { drawToasts(fb, S, t, false, typeof Progress !== 'undefined' ? Progress.toastTop(fb) : 34); Quests.drawPop(fb, t); }
    if (WorldMap.reveal) WorldMap.drawReveal(fb, t);
    if (typeof Moves !== 'undefined') { if (Moves.drawChip && !Talk.busy()) Moves.drawChip(fb, S, t); Moves.drawWheel(fb, S, t); Moves.drawLearn(fb, S, t); }
    Talk.drawDialog(fb, t);
    if (Photo.drawCard) Photo.drawCard(fb, t);
  }
  return Object.assign(H, { btn, down, move, up, hover, pressed, toast, banner, banUp, tool, update, draw, iconAt, ICONS, scope, throwBerry, icoBag, icoHat, icoDex, icoMap });
})();
