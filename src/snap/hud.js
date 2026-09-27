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
  function hover(ux, uy) { H.hoverId = null; for (const b of H.btns) if (ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) H.hoverId = b.id; }
  const pressed = (id) => H.press && H.press.b.id === id;

  function toast(msg, o = {}) { H.toasts.push(Object.assign({ msg, t: 0, life: o.life || 2.8, icon: o.icon || null, col: o.col || null }, o)); if (H.toasts.length > 3) H.toasts.shift(); }
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
  function update(dt) {
    for (const t of H.toasts) t.t += dt;
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
    const R = 17, cx = fb.w - R - 10, cy = fb.h - R - 16;
    const p = pressed('cam') ? 1 : 0;
    // pulse ring when something special is happening
    if (H.op >= 3) { const k = (H.opT * 1.6) % 1; UI.ring(fb, cx, cy, R + 3 + Math.round(k * 8), H.op >= 4 ? 0xffffd23a : 0xffffffff, 1); if (Math.sin(H.opT * 8) > 0) Font.draw(fb, '!', cx + R - 2, cy - R - 6, 0xffffd23a, { font: 'title', outline: INK }); }
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
  function drawTop(fb, S, t) {
    // right: Pokédex, map, sound
    const bw = 22, y = 6;
    const items = [
      { id: 'dex', icon: 'dexIcon', fn: () => (Game.mode === 'dex' ? Dex.close() : Dex.open()) },
      { id: 'map', icon: 'map', fn: () => (Game.mode === 'map' ? WorldMap.close() : WorldMap.open()) },
      { id: 'snd', icon: Sound.on ? 'snd' : 'mute', fn: () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); } },
    ];
    items.forEach((it, i) => {
      const x = fb.w - 6 - (items.length - i) * (bw + 4);
      const p = pressed(it.id) ? 1 : 0;
      UI.rrect(fb, x, y + 2, bw, bw, 4, 0xff0a0e1a);
      UI.panel(fb, x, y + p, bw, bw, { r: 4, ol: S.ink, fill: it.id === 'dex' ? S.body : S.btn, hi: U.tweak(it.id === 'dex' ? S.body : S.btn, 0, 1, 0.14) });
      const I = ICONS[it.icon];
      iconAt(fb, it.icon, x + Math.floor((bw - I.m[0].length * (it.id === 'dex' ? 1 : 1)) / 2), y + p + Math.floor((bw - I.m.length) / 2), 1);
      btn(it.id, x - 1, y - 1, bw + 2, bw + 4, it.fn);
      if (it.id === 'dex' && Quests.unseen()) { UI.disc(fb, x + bw - 2, y + 2, 3, 0xffff3a4a); UI.put(fb, x + bw - 2, y + 2, 0xffffffff); }
    });
    // left: clock (tap = let time pass) + points
    const hr = Game.hour();
    const x = 6;
    const p = pressed('clock') ? 1 : 0;
    UI.rrect(fb, x, y + 2, 22, 22, 4, 0xff0a0e1a);
    UI.panel(fb, x, y + p, 22, 22, { r: 4, ol: S.ink, fill: S.btn });
    Font.icon(fb, hr === 'night' || hr === 'dusk' ? 'moon' : 'sun', x + 4, y + 4 + p, 2);
    btn('clock', x - 1, y - 1, 24, 26, () => Game.tryTime());
    UI.panel(fb, x + 26, y + 3 + p * 0, 64, 16, { r: 3, ol: S.ink, fill: U.mix(S.btn, 0xff000000, 0.2), hi: null, sh: null });
    Font.draw(fb, '{coin}' + Save.data.points, x + 30, y + 8, 0xffffffff, { font: 'small' });
  }
  function drawBanner(fb, S, t) {
    const b = H.ban; if (!b) return;
    const k = b.t < 0.4 ? U.ease.outBack(b.t / 0.4) : b.t > 3.4 ? 1 - U.ease.inCubic((b.t - 3.4) / 0.6) : 1;
    const w = Math.max(Font.measure(b.name, 'title') + 40, Font.measure(b.sub, 'small') + 40), h = 34;
    const x = Math.round(fb.w / 2 - w / 2), y = Math.round(-h + (h + 34) * k);
    UI.body(fb, x, y, w, h, S, { r: 5 });
    UI.screen(fb, x + 6, y + 5, w - 12, h - 10, { fill: S.screen, rim: S.ink, glare: false });
    Font.draw(fb, b.name, fb.w / 2, y + 10, S.screenText, { font: 'title', align: 'center' });
    Font.draw(fb, b.sub, fb.w / 2, y + h + 4, 0xffffffff, { font: 'small', align: 'center', outline: INK });
  }
  // notifications: a quiet feed that slides in at the top-left (no pop-up boxes)
  function drawToasts(fb, S, t, bottom = false) {
    const maxW = Math.min(190, Math.round(fb.w * 0.42));
    let y = bottom ? fb.h - 18 - 14 * H.toasts.length : 34;
    for (const tt of H.toasts) {
      const k = Math.min(1, tt.t / 0.25, (tt.life - tt.t) / 0.4);
      if (k <= 0) continue;
      const lines = Font.wrap ? Font.wrap(tt.msg, 'small', maxW) : [tt.msg];
      const w = Math.max(...lines.map((l) => Font.measure(l, 'small'))) + 14, h = lines.length * 9 + 5;
      const x = Math.round(6 - (1 - k) * (w + 10));
      UI.rectA(fb, x, y, w, h, 0xff0a0e20, 0.45 * k);
      UI.rect(fb, x, y, 2, h, tt.col ?? S.accent);
      lines.forEach((l, i) => Font.draw(fb, l, x + 8, y + 3 + i * 9, 0xffffffff, { font: 'small', shadow: 0xff0a0e20 }));
      y += h + 3;
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
    UI.led(fb, x + 42, y + 12, 0xffff4a4a, Math.sin(t * 4) > 0); UI.led(fb, x + 50, y + 12, 0xffffd23a, true); UI.led(fb, x + 58, y + 12, 0xff4ade6a, Math.sin(t * 4 + 2) > 0);
    UI.screen(fb, x + 40, y + 24, w - 56, h - 38, { fill: S.screen, rim: S.ink });
    Font.draw(fb, 'MUDKIP', x + w / 2 + 12, y + 30, S.screenText, { font: 'title', align: 'center', sc: 2 });
    Font.draw(fb, 'S N A P', x + w / 2 + 12, y + 68, S.accent, { font: 'title', align: 'center' });
    Font.draw(fb, 'A Pokémon photo journey', fb.w / 2, y + h + 8, 0xffffffff, { font: 'body', align: 'center', outline: INK });
    if (Math.sin(t * 3) > -0.3) Font.draw(fb, 'Tap to start', fb.w / 2, fb.h * 0.72, 0xffffd23a, { font: 'title', align: 'center', outline: INK });
    Font.draw(fb, '{cam} Snap Pokémon  ·  {pb} Fill the Pokédex  ·  {note} Solve photo puzzles', fb.w / 2, fb.h - 22, 0xffffffff, { font: 'small', align: 'center', outline: INK });
    btn('start', 0, 0, fb.w, fb.h, () => Game.start());
  }
  function draw(fb, t) {
    H.btns.length = 0;
    const S = UI.skin();
    if (Game.mode === 'title') { drawTitle(fb, t); return; }
    if (Game.mode === 'dex') { Dex.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'map') { WorldMap.draw(fb, t); drawToasts(fb, S, t, true); return; }
    if (Game.mode === 'camera') { Photo.drawUI(fb, t); Music.drawUI(fb, t, 'camera'); drawToasts(fb, S, t); return; }
    drawScan(fb, S, t);
    drawTop(fb, S, t);
    drawTools(fb, S, t);
    drawCameraButton(fb, S, t);
    Music.drawUI(fb, t, 'explore');
    Photo.drawRecent(fb, t);
    drawBanner(fb, S, t);
    drawToasts(fb, S, t);
    Quests.drawPop(fb, t);
    if (WorldMap.reveal) WorldMap.drawReveal(fb, t);
  }
  return Object.assign(H, { btn, down, move, up, hover, pressed, toast, banner, tool, update, draw, iconAt, ICONS });
})();
