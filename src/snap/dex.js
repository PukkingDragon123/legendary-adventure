/* ------------------------------------------------------------------
   Dex — the Snap-Dex: the same device as the camera, opened like the
   anime Pokédex (the lid swings open, screens boot with a Poké Ball
   logo). Pages: Pokémon grid → entries (a photo for each star tier,
   behaviours with clues, objectives + rewards), Album, Requests,
   Style (dress Mudkip, device skins, banners, keychains, frames),
   Discoveries and Settings. Slide transitions, bleeps and a charm
   that swings from the hinge.
------------------------------------------------------------------- */
const Dex = (() => {
  const { clamp, lerp, hex, mix } = U;
  const INK = 0xff1b2240;
  const D = {
    open: false, t: 0, phase: 'closed', closing: 0, page: 'grid', prev: null, trans: 1, dir: 1,
    sel: null, star: 0, scroll: {}, btns: [], press: null, drag: null, keyAng: 0, keyV: 0,
    thumbs: new Map(), imgs: new Map(), confirm: null, album: 0, styleSlot: 'hat', mudYaw: 1.1,
  };
  const TABS = [['grid', 'Pokémon', 'pb'], ['prog', 'Progress', 'star'], ['album', 'Album', 'cam'], ['quests', 'Requests', 'check'], ['style', 'Style', 'shirt'], ['shop', 'Shop', 'bag'], ['disc', 'Secrets', 'spark'], ['settings', 'Options', 'coin']];
  const RANKS = [[0, 'Rookie'], [2000, 'Novice'], [6000, 'Pro'], [15000, 'Expert'], [30000, 'Master'], [60000, 'Legend']];
  const rank = () => { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (Save.data.points >= n) r = name; return r; };

  function open() {
    if (Game.mode === 'dex') return;
    if (Game.mode === 'camera') Photo.close();
    D.back = Game.mode;
    Game.mode = 'dex'; D.open = true; D.t = 0; D.closing = 0; D.phase = 'opening';
    D.page = D.page || 'grid'; D.trans = 1;
    Quests.seen();
    SFX.dexOpen();
  }
  function close() { if (D.closing) return; D.closing = 0.001; SFX.dexClose(); }
  function go(page, o = {}) {
    if (page === D.page && !o.force) return;
    D.prev = D.page; D.page = page; D.trans = 0; D.dir = o.dir ?? 1;
    if (o.sel !== undefined) D.sel = o.sel;
    SFX.page();
  }
  function update(dt) {
    D.t += dt;
    if (D.closing) { D.closing += dt; if (D.closing > 0.55) { D.open = false; Game.mode = 'explore'; D.closing = 0; } }
    D.trans = Math.min(1, D.trans + dt * 4.5);
    // keychain pendulum
    D.keyV += (-Math.sin(D.keyAng) * 18 - D.keyV * 2.2) * dt; D.keyAng += D.keyV * dt;
    D.mudYaw += dt * 0.9;
  }
  /* ---------- input ---------- */
  function btn(id, x, y, w, h, fn, o = {}) { D.btns.push(Object.assign({ id, x, y, w, h, fn }, o)); }
  function hit(ux, uy) { for (let i = D.btns.length - 1; i >= 0; i--) { const b = D.btns[i]; if (ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) return b; } return null; }
  function down(ux, uy) {
    // close buttons react on touch-down (some mobile browsers cancel the touch before it ends)
    const hb = hit(ux, uy);
    if (hb && (hb.id === 'x' || hb.id === 'closebar' || hb.id === 'close')) { D.press = null; SFX.blip(); close(); return; }
    D.press = { b: hb, x: ux, y: uy, sy: 0, moved: false }; const s = scrollArea(ux, uy); if (s) D.press.scroll = s, D.press.s0 = D.scroll[s] || 0; }
  function move(ux, uy) {
    const p = D.press; if (!p) return;
    if (Math.abs(uy - p.y) > 4 || Math.abs(ux - p.x) > 6) p.moved = true;
    if (p.moved && p.scroll) D.scroll[p.scroll] = Math.max(0, p.s0 - (uy - p.y));
  }
  function up(ux, uy) {
    const p = D.press; D.press = null;
    if (!p || (p.moved && p.scroll)) return;
    const b = hit(ux, uy);
    if (b && b === p.b && b.fn) { b.fn(ux, uy); if (!b.silent) SFX.blip(); return; }
    // tap outside the device closes it (mobile friendly)
    const R = D.dev;
    if (!b && !p.b && R && !(ux >= R.x && ux < R.x + R.w && uy >= R.y && uy < R.y + R.h) && !(p.x >= R.x && p.x < R.x + R.w && p.y >= R.y && p.y < R.y + R.h)) close();
  }
  function wheel(dy) { const s = D.page === 'entry' ? 'entry' : D.page; D.scroll[s] = Math.max(0, (D.scroll[s] || 0) + dy * 0.3); }
  function key(k) {
    if (k === 'Escape' || k === 'Backspace' || k === 'p' || k === 'Tab') { if (D.page === 'entry') go('grid', { dir: -1 }); else close(); return; }
    const L = DexData.ORDER;
    if (D.page === 'entry' && D.sel) {
      const i = L.indexOf(D.sel);
      if (k === 'ArrowRight') { D.sel = L[(i + 1) % L.length]; D.star = 0; D.trans = 0.5; SFX.page(); }
      if (k === 'ArrowLeft') { D.sel = L[(i - 1 + L.length) % L.length]; D.star = 0; D.trans = 0.5; SFX.page(); }
      if (k === 'ArrowUp') D.star = (D.star + 3) % 4; if (k === 'ArrowDown') D.star = (D.star + 1) % 4;
    } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      const ti = TABS.findIndex((x) => x[0] === D.page);
      go(TABS[(ti + (k === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0], { dir: k === 'ArrowRight' ? 1 : -1 });
    }
  }
  const areas = {};
  function scrollArea(ux, uy) { for (const k in areas) { const a = areas[k]; if (ux >= a.x && uy >= a.y && ux < a.x + a.w && uy < a.y + a.h) return k; } return null; }

  /* ---------- helpers: sprites, photos ---------- */
  function thumb(sp, size = 30, sil = false) {
    const key = sp + '|' + size + '|' + (sil ? 1 : 0);
    if (D.thumbs.has(key)) return D.thumbs.get(key);
    const g = (() => { try { return (0, eval)(sp[0].toUpperCase() + sp.slice(1)); } catch (e) { return null; } })();
    if (!g) { D.thumbs.set(key, null); return null; }
    if (D.budget <= 0) return undefined; // render later
    const t0 = performance.now();
    const m = g.meta;
    const pose = { eyes: 'open' };
    if (sp === 'castform') pose.form = 'normal';
    const yaw = sp === 'wailord' || sp === 'kyogre' || sp === 'milotic' ? 0.5 : 1.1;
    let sc = 0.4;
    const r0 = g.render(g.build(Object.assign({ side: Math.cos(yaw) }, pose)), { yaw, pitch: 0.16, scale: sc, W: Math.ceil(m.bw * sc), H: Math.ceil(m.bh * sc), ox: Math.ceil(m.bw * sc) >> 1, oy: Math.floor(Math.ceil(m.bh * sc) * m.oy), pal: g.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const bb = Creature.bounds(r0);
    // fit into size×size by re-rendering at the right scale
    // supersample: render SS× bigger then shrink, so fixed-size eye stamps and outlines end up
    // in proportion (small direct renders made every Pokémon look big-eyed)
    const SS = 3;
    const k = Math.min(size / Math.max(1, bb.w), size / Math.max(1, bb.h)) * sc * SS;
    const W = Math.ceil(m.bw * k) + 4, H = Math.ceil(m.bh * k) + 4;
    const r = g.render(g.build(Object.assign({ side: Math.cos(yaw) }, pose)), { yaw, pitch: 0.16, scale: k, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: g.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const b2 = Creature.bounds(r);
    const out = new PX.Buf(Math.max(1, Math.ceil(b2.w / SS)), Math.max(1, Math.ceil(b2.h / SS)));
    const lum = (c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
      // mode of the SS×SS block (ties → darker, keeps outlines); mostly-empty blocks stay empty
      const cnt = new Map(); let n = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        const X = b2.x0 + x * SS + i, Y = b2.y0 + y * SS + j;
        if (X >= b2.x0 + b2.w || Y >= b2.y0 + b2.h) continue;
        const v = r.buf.d[Y * r.buf.w + X]; if (!v) continue;
        n++; cnt.set(v, (cnt.get(v) || 0) + 1);
      }
      let best = 0, bc = -1;
      for (const [c, m] of cnt) if (m > bc || (m === bc && lum(c) < lum(best))) { best = c; bc = m; }
      out.d[y * out.w + x] = n >= Math.ceil(SS * SS * 0.34) ? (sil ? 0xff1a1e30 : best) : 0;
    }
    D.thumbs.set(key, out);
    D.budget -= performance.now() - t0;
    return out;
  }
  function photo(url) {
    if (!url) return null;
    if (D.imgs.has(url)) return D.imgs.get(url);
    D.imgs.set(url, undefined);
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, im.width, im.height);
        const b = new PX.Buf(im.width, im.height); b.d = new Uint32Array(d.data.buffer.slice(0));
        D.imgs.set(url, b);
      } catch (e) { D.imgs.set(url, null); }
    };
    im.onerror = () => D.imgs.set(url, null);
    im.src = url;
    return undefined;
  }
  function stars(fb, n, x, y, max = 4) { for (let i = 0; i < max; i++) Font.icon(fb, i < n ? 'star' : 'star0', x + i * 8, y, 1); }
  function medal(fb, m, x, y) { const mc = [0, 0xffc07a3a, 0xffb8c0d0, 0xffffc83a, 0xff9af0ff][m] || 0xff808080; UI.disc(fb, x, y, 4, INK); UI.disc(fb, x, y, 3, mc); UI.put(fb, x - 1, y - 1, 0xffffffff); }
  function speciesDone(sp) {
    const d = DexData.S[sp], ph = Save.data.photos[sp] || {};
    const beh = Object.keys(d.beh).length, got = Object.keys(Save.data.beh[sp] || {}).length;
    const objs = d.obj.length, oDone = d.obj.filter((o) => Save.data.obj[o.id]).length;
    const st = [1, 2, 3, 4].filter((k) => ph['s' + k]).length;
    return { beh, got, objs, oDone, st, best: Math.max(0, ...[1, 2, 3, 4].filter((k) => ph['s' + k]).map((k) => k)), pct: (got + oDone + st) / Math.max(1, beh + objs + 4) };
  }

  /* ---------- drawing ---------- */
  function draw(fb, t) {
    D.btns.length = 0; for (const k in areas) delete areas[k];
    D.budget = 12;
    const S = UI.skin(), W = fb.w, H = fb.h;
    // dim the world
    const dimK = clamp(D.t / 0.3, 0, 1) * (D.closing ? 1 - D.closing / 0.55 : 1);
    UI.rectA(fb, 0, 0, W, H, 0xff0a0e20, 0.55 * dimK);
    // device geometry
    const DW = Math.min(W - 8, 470), DH = Math.min(H - 8, 316);
    const two = DW >= 400;
    const ox = Math.round((W - DW) / 2), oy0 = Math.round((H - DH) / 2);
    const tOpen = D.t;
    const rise = D.closing ? U.ease.inCubic(D.closing / 0.55) : 1 - U.ease.outBack(clamp(tOpen / 0.35, 0, 1));
    const oy = Math.round(oy0 + rise * (H - oy0 + 20) + Math.sin(t * 2.2) * 2);
    const unfold = D.closing ? clamp(1 - D.closing / 0.3, 0, 1) : U.ease.outCubic(clamp((tOpen - 0.3) / 0.35, 0, 1));
    const half = two ? Math.round(DW / 2) : DW;
    // right half (the lid you see first) + the left half unfolding from the hinge
    const lw = Math.round(half * unfold);
    const hingeX = two ? ox + half : ox;
    if (two) {
      if (lw > 2) { UI.body(fb, hingeX - lw, oy, lw, DH, S, { r: 7, screws: lw > 40 }); }
      UI.body(fb, hingeX - 2, oy, half + 2, DH, S, { r: 7, screws: true });
      // hinge
      UI.rect(fb, hingeX - 3, oy + 10, 6, DH - 20, S.bodyD); UI.rect(fb, hingeX - 1, oy + 12, 2, DH - 24, S.bodyL);
      for (let y = oy + 16; y < oy + DH - 16; y += 18) UI.rect(fb, hingeX - 4, y, 8, 3, S.ink);
    } else UI.body(fb, ox, oy, DW, DH, S, { r: 7, screws: true });
    // keychain from the hinge
    if (Save.data.equip.key) Rewards.drawKey(fb, Save.data.equip.key, hingeX, oy + DH - 4, D.keyAng, t);
    if (unfold < 1 && !D.closing) { drawLid(fb, S, hingeX, oy, half, DH, t); return; }
    if (D.closing && unfold < 1) return;
    // boot sequence
    const boot = clamp((tOpen - 0.65) / 0.55, 0, 1);
    const L = two ? { x: ox + 10, y: oy + 34, w: half - 22, h: DH - 78 } : null;
    const R = two ? { x: hingeX + 10, y: oy + 30, w: half - 20, h: DH - 44 } : { x: ox + 10, y: oy + 30, w: DW - 20, h: DH - 44 };
    // left half decorations: big lens, LEDs, speaker, d-pad and buttons
    if (two) {
      rotomFace(fb, ox + 30, oy + 16, t, boot);
      UI.led(fb, ox + 38, oy + 10, 0xffff4a4a, Math.sin(t * 3) > 0); UI.led(fb, ox + 46, oy + 10, 0xffffd23a, true); UI.led(fb, ox + 54, oy + 10, 0xff4ade6a, Math.sin(t * 3 + 1.5) > 0);
      // speaker grille + page title
      for (let k = 0; k < 4; k++) UI.hline(fb, ox + half - 40, ox + half - 20, oy + 10 + k * 3, S.bodyD);
      const pt = D.page === 'entry' ? 'ENTRY' : (TABS.find((x) => x[0] === D.page) || ['', ''])[1].toUpperCase();
      Font.draw(fb, 'ROTOM DEX · ' + pt, ox + 64, oy + 8, S.trim, { font: 'small' });
      // bottom controls
      const by = oy + DH - 36;
      UI.disc(fb, ox + 24, by + 16, 9, S.btn); UI.rect(fb, ox + 18, by + 14, 13, 5, 0xff2a3040); UI.rect(fb, ox + 22, by + 10, 5, 13, 0xff2a3040);
      UI.orb(fb, ox + half - 40, by + 18, 6, 0xff2a3040, { ol: S.ink }); UI.orb(fb, ox + half - 24, by + 12, 6, S.accent, { ol: S.ink });
      UI.rrect(fb, ox + 50, by + 10, 26, 6, 3, S.accent); UI.rrect(fb, ox + 82, by + 10, 26, 6, 3, 0xff2f8ae8);
      UI.screen(fb, ox + 50, by + 20, 58, 12, { fill: 0xff3adf6a, rim: S.ink, glare: false });
      Font.draw(fb, rank().toUpperCase(), ox + 79, by + 24, 0xff0a3a18, { font: 'small', align: 'center' });
      btn('back', ox + half - 48, by + 10, 16, 16, () => { if (D.page === 'entry') go('grid', { dir: -1 }); else close(); });
      btn('close', ox + half - 32, by + 4, 16, 16, () => close());
    }
    // screens
    if (L) UI.screen(fb, L.x - 3, L.y - 3, L.w + 6, L.h + 6, { fill: S.screen, rim: S.ink, glare: false });
    UI.screen(fb, R.x - 2, R.y - 2, R.w + 4, R.h + 4, { fill: S.screen, rim: S.ink, glare: false });
    // close X on the right half (generous touch target)
    UI.panel(fb, R.x + R.w - 14, oy + 8, 16, 14, { r: 3, ol: S.ink, fill: S.btn });
    Font.icon(fb, 'cross', R.x + R.w - 9, oy + 12, 1);
    btn('x', R.x + R.w - 24, oy - 4, 34, 32, () => close());
    D.dev = { x: ox, y: oy, w: DW, h: DH };
    // big close bar under the device when there is room (portrait phones)
    if (H - (oy + DH) > 34 && !D.closing) {
      const cw = Math.min(DW, 150), cx = Math.round((W - cw) / 2), cy = oy + DH + 10;
      UI.panel(fb, cx, cy, cw, 22, { r: 6, ol: S.ink, fill: S.body });
      Font.draw(fb, 'CLOSE', cx + cw / 2, cy + 7, 0xffffffff, { font: 'small', align: 'center' });
      btn('closebar', cx, cy, cw, 22, () => close());
    }
    rotomBits(fb, ox, oy, DW, DH, t);
    if (boot < 1) { drawBoot(fb, S, L || R, R, boot, t); return; }
    // tabs along the top of the right half
    let tx = R.x - 2;
    const tabW = Math.floor((R.w - 18) / TABS.length);
    TABS.forEach(([id, label, ic], i) => {
      const on = D.page === id || (D.page === 'entry' && id === 'grid');
      UI.panel(fb, tx, oy + 8, tabW - 1, 16, { r: 3, ol: S.ink, fill: on ? S.screen : S.btn, hi: on ? 0xffffffff : null, sh: null });
      Font.icon(fb, ic, tx + 3, oy + 12, 1);
      if (tabW > 40) Font.draw(fb, label, tx + 13, oy + 13, on ? S.screenText : 0xffffffff, { font: 'small' });
      btn('tab-' + id, tx, oy + 6, tabW, 20, () => go(id, { dir: i > TABS.findIndex((x) => x[0] === D.page) ? 1 : -1 }));
      tx += tabW;
    });
    // page contents with a slide transition
    const k = U.ease.outCubic(D.trans);
    const slide = Math.round((1 - k) * 40 * D.dir);
    drawPage(fb, S, D.page, L, R, slide, t);
    // scanline sweep on page change
    if (D.trans < 1) { const sy = Math.round(R.y + R.h * D.trans); UI.rectA(fb, R.x, sy, R.w, 2, 0xffffffff, 0.35); if (L) UI.rectA(fb, L.x, Math.round(L.y + L.h * D.trans), L.w, 2, 0xffffffff, 0.35); }
    // subtle LCD scanlines
    for (const Q of L ? [L, R] : [R]) for (let y = Q.y; y < Q.y + Q.h; y += 2) for (let x = Q.x; x < Q.x + Q.w; x++) { const i = y * fb.w + x; if (i >= 0 && i < fb.d.length && fb.d[i]) fb.d[i] = U.mix(fb.d[i], 0xff000000, 0.04); }
  }
  /* ---------- Rotom lives in here: big blue eyes, lightning antennae, floating arms, chatter ---------- */
  const ROTOM = { grid: ['Bzzt! Who do you want to see?', 'So many Pokémon! Zzt!', 'Tap a card, I will tell you everything!'], entry: ['Ooh, this one! Bzzt!', 'Snap its secret moves for stars!', 'I love this Pokémon! Zzzt!'], quests: ['Jobs to do! Bzzt!', 'Go go go! Zzt!'], album: ['Nice shots! Bzzzt!', 'You are a real pro!'], def: ['Bzzt! Rotom Dex at your service!', 'Zzzt! What are we researching today?'] };
  const RT = { line: '', t: 0, page: '' };
  function rotomFace(fb, cx, cy, t, boot) {
    const blink = (t % 3.7) < 0.12 || boot < 1 && Math.sin(t * 20) > 0.6, look = Math.sin(t * 0.7) * 2;
    for (const ex of [-11, 11]) {
      UI.disc(fb, cx + ex, cy, 8, 0xff1a0a0a);
      if (blink) { UI.hline(fb, cx + ex - 6, cx + ex + 6, cy, 0xffbfe8ff); continue; }
      UI.disc(fb, cx + ex, cy, 7, 0xffffffff); UI.disc(fb, cx + ex + look, cy + 1, 5, 0xff4ab0ff); UI.disc(fb, cx + ex + look, cy + 1, 3, 0xff1a4ad8);
      UI.put(fb, cx + ex + look - 2, cy - 2, 0xffffffff); UI.put(fb, cx + ex + look - 1, cy - 2, 0xffffffff);
    }
  }
  function rotomBits(fb, ox, oy, DW, DH, t) {
    // lightning-bolt antennae above the device
    const Y = 0xff3ad8ff, Yd = 0xff1a9ad8;
    for (const [bx, dir] of [[ox + DW * 0.3, -1], [ox + DW * 0.7, 1]]) {
      const x0 = Math.round(bx), y0 = oy - 2 + Math.round(Math.sin(t * 3 + dir) * 1.5);
      const pts = [[0, 0], [dir * 4, -6], [dir * 1, -7], [dir * 6, -15]];
      for (let i = 0; i < 3; i++) UI.line(fb, x0 + pts[i][0], y0 + pts[i][1], x0 + pts[i + 1][0], y0 + pts[i + 1][1], i % 2 ? Yd : Y);
      if (Math.sin(t * 9 + bx) > 0.8) UI.put(fb, x0 + dir * 7, y0 - 17, 0xffffffff);
    }
    // floating electric hands at the sides
    for (const [hx, s] of [[ox - 7, -1], [ox + DW + 6, 1]]) { const hy = Math.round(oy + DH * 0.55 + Math.sin(t * 2.5 + s) * 4); UI.disc(fb, hx, hy, 4, 0xff1a0a0a); UI.disc(fb, hx, hy, 3, 0xffff9a5a); if (Math.random() < 0.3) UI.put(fb, hx + s * 5, hy + ((Math.random() * 6) | 0) - 3, Y); }
    // chatter
    const page = D.page || 'grid';
    RT.t -= 1 / 60;
    if (RT.page !== page || RT.t <= 0) { const L = ROTOM[page] || ROTOM.def; RT.line = L[(Math.random() * L.length) | 0]; RT.t = 7; if (RT.page !== page) Game.sfx('blip', null, 0.3); RT.page = page; }
    const w = Font.measure(RT.line, 'small') + 10, bx = Math.round(ox + 62), by = oy + 20;
    if (w < DW / 2 - 70) { UI.panel(fb, bx, by, w, 13, { r: 4, ol: 0xff1a0a0a, fill: 0xffffffff }); UI.put(fb, bx + w / 2, by + 13, 0xff1a0a0a); Font.draw(fb, RT.line, bx + 5, by + 4, 0xff2a0a0a, { font: 'small' }); }
  }
  function drawLid(fb, S, hx, oy, half, DH, t) {
    // closed Pokédex front: big lens, LEDs, a Poké Ball emblem, the lid edge
    const x = hx - 2, w = half + 2;
    UI.lens(fb, x + 26, oy + 24, 14, S, 0.4 + 0.3 * Math.sin(t * 8), t);
    UI.led(fb, x + 52, oy + 14, 0xffff4a4a, true); UI.led(fb, x + 61, oy + 14, 0xffffd23a, Math.sin(t * 9) > 0); UI.led(fb, x + 70, oy + 14, 0xff4ade6a, true);
    UI.hline(fb, x + 6, x + w - 8, oy + 48, S.bodyD); UI.hline(fb, x + 6, x + w - 8, oy + 49, S.bodyL);
    rotomFace(fb, x + w / 2, oy + DH / 2 - 30, t, 1); Font.draw(fb, 'ROTOM DEX', x + w / 2, oy + DH / 2 - 6, S.trim, { font: 'title', align: 'center', sc: 2, outline: S.ink });
    Font.draw(fb, 'Hoenn Photo Edition', x + w / 2, oy + DH / 2 + 30, S.trim, { font: 'small', align: 'center' });
    Font.icon(fb, 'pb', x + w / 2 - 7, oy + DH - 40, 2);
  }
  function drawBoot(fb, S, A, R, k, t) {
    // Poké Ball spins in, the logo flashes, lines of "system text" type out
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    const r = Math.round(4 + k * 20);
    const ang = k * 12;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y); if (d > r) continue;
      const a = Math.atan2(y, x) + ang;
      const yy = Math.sin(a) * d;
      let c = yy < -1 ? 0xffee3b45 : yy > 1 ? 0xfff4f7fb : INK;
      if (d > r - 1.2) c = INK;
      if (d < r * 0.3) c = d > r * 0.2 ? INK : 0xfff4f7fb;
      UI.put(fb, Math.round(cx + x), Math.round(cy + y), c);
    }
    if (k > 0.5) Font.draw(fb, 'POKéDEX', cx, cy + r + 8, S.screenText, { font: 'title', align: 'center' });
    const lines = ['SNAP-DEX v3.0 ... OK', 'LENS CALIBRATED', 'PHOTOS: ' + Save.data.shots, 'SEEN: ' + Object.keys(Save.data.seen).length + ' / ' + DexData.ORDER.length];
    const n = Math.floor(k * 5);
    lines.slice(0, n).forEach((s, i) => Font.draw(fb, s, R.x + 6, R.y + 8 + i * 12, S.screenText, { font: 'small' }));
    if (Math.floor(t * 4) % 2 && n < 5) UI.rect(fb, R.x + 6 + Font.measure(lines[Math.min(n, 3)] || '', 'small'), R.y + 6 + n * 12, 4, 7, S.screenText);
  }
  function header(fb, S, R, slide) {
    // profile banner + points + rank
    const bh = 18;
    Rewards.drawBanner(fb, Save.data.equip.banner || 'banner.rookie', R.x + 4 + slide, R.y + 4, R.w - 8, bh);
    return bh + 8;
  }
  function drawPage(fb, S, page, L, R, slide, t) {
    const clipR = { x0: R.x, y0: R.y, x1: R.x + R.w, y1: R.y + R.h };
    if (page === 'grid') pageGrid(fb, S, L, R, slide, t);
    else if (page === 'entry') pageEntry(fb, S, L, R, slide, t);
    else if (page === 'album') pageAlbum(fb, S, L, R, slide, t);
    else if (page === 'quests') pageQuests(fb, S, L, R, slide, t);
    else if (page === 'style') pageStyle(fb, S, L, R, slide, t);
    else if (page === 'shop') pageShop(fb, S, L, R, slide, t);
    else if (page === 'disc') pageDisc(fb, S, L, R, slide, t);
    else if (page === 'prog' && typeof Progress !== 'undefined') Progress.dexPage(fb, S, L, R, slide, t, { btn, clipTo, areas, D, thumb });
    else if (page === 'settings') pageSettings(fb, S, L, R, slide, t);
  }
  function clipTo(fb, Q, fn) {
    // draw into a temp buffer then copy the clipped region (keeps scrolling lists inside their screen)
    const tmp = D.tmp && D.tmp.w === fb.w && D.tmp.h === fb.h ? D.tmp : (D.tmp = new PX.Buf(fb.w, fb.h));
    tmp.d.fill(0);
    fn(tmp);
    for (let y = Math.max(0, Q.y); y < Math.min(fb.h, Q.y + Q.h); y++) for (let x = Math.max(0, Q.x); x < Math.min(fb.w, Q.x + Q.w); x++) { const v = tmp.d[y * fb.w + x]; if (v) fb.d[y * fb.w + x] = v; }
  }

  /* ---- Pokémon grid ---- */
  function pageGrid(fb, S, L, R, slide, t) {
    const list = DexData.ORDER;
    const seenN = list.filter((k) => Save.data.seen[k]).length;
    // left screen: summary + the selected Pokémon large
    if (L) {
      const sp = D.sel && DexData.S[D.sel] ? D.sel : null;
      Font.draw(fb, 'Seen ' + seenN + ' / ' + list.length, L.x + 6 + slide, L.y + 8, S.screenText, { font: 'title' });
      Font.draw(fb, '{coin} ' + Save.data.points + '   ' + rank(), L.x + 6 + slide, L.y + 26, S.screenText, { font: 'small' });
      const bar = L.w - 12;
      UI.rect(fb, L.x + 6, L.y + 36, bar, 5, S.screenD); UI.rect(fb, L.x + 6, L.y + 36, Math.round((bar * seenN) / list.length), 5, S.accent);
      if (sp) {
        const d = DexData.S[sp], seen = Save.data.seen[sp];
        const th = thumb(sp, 64, !seen);
        if (th) UI.img(fb, th, L.x + L.w / 2 - th.w + slide, L.y + 50 + (64 - th.h * 2) / 2 + 60 - th.h, 2);
        Font.draw(fb, '#' + String(d.no).padStart(3, '0') + ' ' + (seen ? d.name : '???'), L.x + L.w / 2 + slide, L.y + L.h - 22, S.screenText, { font: 'title', align: 'center' });
        if (seen) Font.draw(fb, 'Tap again to open', L.x + L.w / 2, L.y + L.h - 8, U.mix(S.screenText, S.screen, 0.4), { font: 'small', align: 'center' });
      } else {
        Font.draw(fb, 'Choose a Pokémon', L.x + L.w / 2, L.y + L.h / 2, U.mix(S.screenText, S.screen, 0.35), { font: 'body', align: 'center' });
        Font.draw(fb, 'Photograph Pokémon to fill', L.x + L.w / 2, L.y + L.h / 2 + 14, U.mix(S.screenText, S.screen, 0.35), { font: 'small', align: 'center' });
        Font.draw(fb, 'every page of the Pokédex!', L.x + L.w / 2, L.y + L.h / 2 + 24, U.mix(S.screenText, S.screen, 0.35), { font: 'small', align: 'center' });
      }
    }
    // right: scrolling grid of cards
    const top = R.y + 4, cw = 50, ch = 56, cols = Math.max(2, Math.floor((R.w - 8) / cw));
    const gx = R.x + Math.floor((R.w - cols * cw) / 2);
    const rows = Math.ceil(list.length / cols);
    const maxS = Math.max(0, rows * ch - R.h + 8);
    D.scroll.grid = clamp(D.scroll.grid || 0, 0, maxS);
    areas.grid = { x: R.x, y: R.y, w: R.w, h: R.h };
    clipTo(fb, R, (b) => {
      list.forEach((sp, i) => {
        const cx = gx + (i % cols) * cw + slide, cy = top + Math.floor(i / cols) * ch - D.scroll.grid;
        if (cy + ch < R.y || cy > R.y + R.h) return;
        const d = DexData.S[sp], seen = !!Save.data.seen[sp], sel = D.sel === sp;
        UI.panel(b, cx + 1, cy + 1, cw - 3, ch - 3, { r: 3, ol: sel ? S.accent : U.mix(S.screenText, S.screen, 0.6), fill: sel ? U.mix(S.screen, 0xffffffff, 0.35) : U.mix(S.screen, 0xffffffff, 0.15), hi: null, sh: null });
        const th = thumb(sp, 30, !seen);
        if (th) UI.img(b, th, cx + Math.round((cw - th.w) / 2), cy + 4 + Math.round((30 - th.h) / 2));
        else if (th === undefined) Font.draw(b, '...', cx + cw / 2, cy + 16, S.screenText, { font: 'small', align: 'center' });
        Font.draw(b, String(d.no).padStart(3, '0'), cx + 4, cy + 4, U.mix(S.screenText, S.screen, 0.4), { font: 'small' });
        Font.draw(b, seen ? d.name : '???', cx + cw / 2, cy + 38, S.screenText, { font: 'small', align: 'center' });
        if (seen) { const dn = speciesDone(sp); for (let s = 0; s < 4; s++) Font.icon(b, s < dn.st ? 'star' : 'star0', cx + 5 + s * 10, cy + 46, 1); }
        if (d.legendary && !seen) Font.icon(b, 'spark', cx + cw - 9, cy + 4, 1);
      });
    });
    list.forEach((sp, i) => {
      const cx = gx + (i % cols) * cw, cy = top + Math.floor(i / cols) * ch - D.scroll.grid;
      if (cy + ch < R.y || cy > R.y + R.h - 6) return;
      btn('c-' + sp, cx, Math.max(R.y, cy), cw, ch, () => { if (D.sel === sp && Save.data.seen[sp]) { go('entry', { sel: sp }); D.star = bestTier(sp); } else { D.sel = sp; if (!L && Save.data.seen[sp]) { go('entry', { sel: sp }); D.star = bestTier(sp); } } });
    });
    // scrollbar
    if (maxS > 0) { const h = Math.max(12, (R.h * R.h) / (rows * ch)), y = R.y + ((R.h - h) * D.scroll.grid) / maxS; UI.rect(fb, R.x + R.w - 3, Math.round(y), 2, Math.round(h), S.accent); }
  }
  function bestTier(sp) { const p = Save.data.photos[sp] || {}; for (let k = 4; k >= 1; k--) if (p['s' + k]) return k - 1; return 0; }

  /* ---- species entry ---- */
  function pageEntry(fb, S, L, R, slide, t) {
    const sp = D.sel, d = DexData.S[sp];
    if (!d) { go('grid'); return; }
    const ph = Save.data.photos[sp] || {};
    const P = L || { x: R.x, y: R.y, w: R.w, h: Math.round(R.h * 0.45) };
    // photo for the chosen star tier
    const tier = D.star + 1, rec = ph['s' + tier];
    const pw = P.w - 8, phh = Math.round(pw * 0.72);
    const px = P.x + 4 + slide, py = P.y + 4;
    UI.rect(fb, px - 1, py - 1, pw + 2, phh + 2, INK);
    if (rec && rec.img) {
      const b = photo(rec.img);
      if (b) UI.imgFit(fb, b, px, py, pw, phh);
      else for (let y = 0; y < phh; y++) for (let x = 0; x < pw; x++) UI.put(fb, px + x, py + y, U.hash(x, y, Math.floor(t * 10)) > 0.5 ? 0xff3a4058 : 0xff262a3a);
    } else {
      UI.rect(fb, px, py, pw, phh, U.mix(S.screen, 0xff000000, 0.25));
      const th = thumb(sp, 40, true);
      if (th) UI.img(fb, th, px + Math.round((pw - th.w) / 2), py + Math.round((phh - th.h) / 2) - 6);
      Font.draw(fb, 'No ' + '{star}'.repeat(tier) + ' photo yet', px + pw / 2, py + phh - 12, 0xffffffff, { font: 'small', align: 'center', outline: INK });
    }
    // tier selector
    const ty = py + phh + 4;
    for (let k = 0; k < 4; k++) {
      const on = D.star === k, has = !!ph['s' + (k + 1)];
      const bx = px + k * Math.floor(pw / 4);
      UI.panel(fb, bx, ty, Math.floor(pw / 4) - 2, 14, { r: 3, ol: S.ink, fill: on ? S.accent : has ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xff000000, 0.15), hi: null, sh: null });
      for (let s = 0; s <= k; s++) Font.icon(fb, has ? 'star' : 'star0', bx + 4 + s * 7, ty + 4, 1);
      btn('tier' + k, bx, ty, Math.floor(pw / 4) - 2, 14, () => { D.star = k; SFX.page(); }, { silent: true });
    }
    if (rec) {
      const bd = d.beh[rec.beh];
      medal(fb, rec.medal, px + 5, ty + 23);
      Font.draw(fb, DexData.MEDALS[rec.medal] + '  ' + rec.score + ' pts', px + 12, ty + 20, S.screenText, { font: 'small' });
      if (bd) Font.draw(fb, bd.n, px + pw, ty + 20, S.screenText, { font: 'small', align: 'right' });
    }
    // info column
    const I = L ? R : { x: R.x, y: P.y + P.h + 6, w: R.w, h: R.h - P.h - 6 };
    areas.entry = { x: I.x, y: I.y, w: I.w, h: I.h };
    const lines = [];
    clipTo(fb, I, (b) => {
      let y = I.y + 6 - (D.scroll.entry || 0);
      const x = I.x + 6 + slide;
      Font.draw(b, '#' + String(d.no).padStart(3, '0'), x, y, U.mix(S.screenText, S.screen, 0.35), { font: 'small' });
      Font.draw(b, d.name, x + 28, y - 3, S.screenText, { font: 'title' });
      let tx = I.x + I.w - 6;
      for (const ty2 of d.type.slice().reverse()) { const w = Font.measure(ty2.toUpperCase(), 'small') + 8; tx -= w; UI.rrect(b, tx, y - 2, w - 2, 10, 2, hex(DexData.TYPES[ty2] || '#888888')); Font.draw(b, ty2.toUpperCase(), tx + (w - 2) / 2, y + 1, 0xffffffff, { font: 'small', align: 'center' }); tx -= 2; }
      y += 16;
      Font.draw(b, 'HT ' + d.h + ' m   ' + (d.area || []).map((a) => DexData.AREAS[a] ? DexData.AREAS[a].name : a).join(', '), x, y, U.mix(S.screenText, S.screen, 0.3), { font: 'small' });
      y += 12;
      Font.draw(b, d.blurb, x, y, S.screenText, { font: 'small', maxW: I.w - 12, lh: 10 });
      y += Font.wrap(d.blurb, 'small', I.w - 12).length * 10 + 8;
      // behaviours
      Font.draw(b, 'BEHAVIOURS', x, y, S.accent === 0xffdc2a3a ? S.body : U.tweak(S.accent, 0, 1, -0.15), { font: 'small' });
      y += 11;
      const seenB = Save.data.beh[sp] || {};
      for (const k in d.beh) {
        const bh = d.beh[k], got = k in seenB;
        UI.rrect(b, x - 2, y - 3, I.w - 8, got ? 12 : 13 + Font.wrap('Clue: ' + bh.hint, 'small', I.w - 26).length * 9, 2, got ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xff000000, 0.12));
        Font.draw(b, got ? '{check}' : '{lock}', x, y - 1, 0, { font: 'small' });
        Font.draw(b, got ? bh.n : '???', x + 10, y, S.screenText, { font: 'small' });
        for (let s = 0; s < bh.tier; s++) Font.icon(b, got ? 'star' : 'star0', I.x + I.w - 14 - (bh.tier - 1 - s) * 7, y - 1, 1);
        if (!got) { const cl = Font.wrap('Clue: ' + bh.hint, 'small', I.w - 26); cl.forEach((ln, j) => Font.draw(b, ln, x + 10, y + 10 + j * 9, U.mix(S.screenText, S.screen, 0.3), { font: 'small' })); y += cl.length * 9; }
        y += 13;
      }
      y += 4;
      Font.draw(b, 'PHOTO OBJECTIVES', x, y, S.accent === 0xffdc2a3a ? S.body : U.tweak(S.accent, 0, 1, -0.15), { font: 'small' });
      y += 11;
      for (const o of d.obj) {
        const done = !!Save.data.obj[o.id];
        Font.draw(b, (done ? '{check} ' : '{star0} ') + o.t, x, y, done ? U.mix(S.screenText, S.screen, 0.35) : S.screenText, { font: 'small' });
        y += 10;
        Font.draw(b, '   Reward: ' + (o.reward.startsWith('pts:') ? o.reward.slice(4) + ' pts' : Rewards.name(o.reward)), x, y, U.mix(S.screenText, S.screen, 0.4), { font: 'small' });
        y += 12;
      }
      D.entryH = y + (D.scroll.entry || 0) - I.y;
    });
    D.scroll.entry = clamp(D.scroll.entry || 0, 0, Math.max(0, (D.entryH || 0) - I.h + 8));
    // prev / next species arrows
    const nav = (dir) => { const Ls = DexData.ORDER.filter((k) => Save.data.seen[k]); const i = Ls.indexOf(sp); if (Ls.length) { D.sel = Ls[(i + dir + Ls.length) % Ls.length]; D.star = bestTier(D.sel); D.scroll.entry = 0; D.trans = 0.4; D.dir = dir; SFX.page(); } };
    const ay = (L ? L.y + L.h : P.y + P.h) + 8;
    const ax = L ? L.x : R.x;
    UI.panel(fb, ax, ay, 18, 14, { r: 3, ol: S.ink, fill: S.btn }); Font.icon(fb, 'left', ax + 7, ay + 4, 1); btn('prev', ax, ay, 18, 14, () => nav(-1), { silent: true });
    UI.panel(fb, ax + 22, ay, 18, 14, { r: 3, ol: S.ink, fill: S.btn }); Font.icon(fb, 'right', ax + 29, ay + 4, 1); btn('next', ax + 22, ay, 18, 14, () => nav(1), { silent: true });
  }

  /* ---- album ---- */
  function pageAlbum(fb, S, L, R, slide, t) {
    const al = Save.data.album;
    const sel = al[D.album] || null;
    if (L) {
      if (sel && sel.img) { const b = photo(sel.img); if (b) UI.imgFit(fb, b, L.x + 4 + slide, L.y + 4, L.w - 8, Math.round((L.w - 8) * 0.72)); }
      else Font.draw(fb, al.length ? 'Photo not saved' : 'No photos yet — go snap!', L.x + L.w / 2, L.y + L.h / 2, S.screenText, { font: 'body', align: 'center' });
      if (sel) {
        const y = L.y + 8 + Math.round((L.w - 8) * 0.72);
        if (sel.sp) { Font.draw(fb, DexData.S[sel.sp].name + (DexData.S[sel.sp].beh[sel.beh] ? ' — ' + DexData.S[sel.sp].beh[sel.beh].n : ''), L.x + 6, y + 4, S.screenText, { font: 'small' }); stars(fb, sel.stars, L.x + 6, y + 14); medal(fb, sel.medal, L.x + 46, y + 17); Font.draw(fb, sel.score + ' pts', L.x + 54, y + 15, S.screenText, { font: 'small' }); }
      }
    }
    const cw = 58, chh = 50, cols = Math.max(2, Math.floor((R.w - 6) / cw));
    const gx = R.x + Math.floor((R.w - cols * cw) / 2);
    const rows = Math.ceil(al.length / cols);
    D.scroll.album = clamp(D.scroll.album || 0, 0, Math.max(0, rows * chh - R.h + 8));
    areas.album = { x: R.x, y: R.y, w: R.w, h: R.h };
    if (!al.length) Font.draw(fb, 'Your last 24 photos appear here.', R.x + R.w / 2, R.y + R.h / 2, S.screenText, { font: 'small', align: 'center' });
    clipTo(fb, R, (b) => {
      al.forEach((a, i) => {
        const x = gx + (i % cols) * cw + slide, y = R.y + 4 + Math.floor(i / cols) * chh - D.scroll.album;
        UI.rect(b, x + 2, y + 2, cw - 6, chh - 12, i === D.album ? S.accent : INK);
        const im = a.img ? photo(a.img) : null;
        if (im) UI.imgFit(b, im, x + 3, y + 3, cw - 8, chh - 14); else UI.rect(b, x + 3, y + 3, cw - 8, chh - 14, 0xff2a3040);
        if (a.stars) stars(b, a.stars, x + 3, y + chh - 9, a.stars);
        if (a.medal) medal(b, a.medal, x + cw - 8, y + chh - 6);
      });
    });
    al.forEach((a, i) => { const x = gx + (i % cols) * cw, y = R.y + 4 + Math.floor(i / cols) * chh - D.scroll.album; if (y + chh > R.y && y < R.y + R.h - 4) btn('al' + i, x, Math.max(R.y, y), cw, chh, () => { D.album = i; }); });
  }

  /* ---- requests & progress ---- */
  function pageQuests(fb, S, L, R, slide, t) {
    const n = Quests.stamps();
    if (L) {
      Font.draw(fb, 'Research stamps', L.x + 6 + slide, L.y + 8, S.screenText, { font: 'title' });
      Font.draw(fb, String(n), L.x + L.w - 10, L.y + 8, S.accent === 0xffdc2a3a ? S.body : S.accent, { font: 'title', align: 'right' });
      let y = L.y + 30;
      for (const id in DexData.AREAS) {
        const a = DexData.AREAS[id], un = Save.unlocked(id);
        UI.panel(fb, L.x + 4 + slide, y, L.w - 8, 26, { r: 3, ol: S.ink, fill: un ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xff000000, 0.15), hi: null, sh: null });
        Font.draw(fb, (un ? '{check} ' : '{lock} ') + a.name, L.x + 10 + slide, y + 6, S.screenText, { font: 'body' });
        Font.draw(fb, un ? a.sub : id === 'stage' ? 'Needs Meloetta\'s band' : 'Needs ' + a.need + ' stamps', L.x + 10 + slide, y + 17, U.mix(S.screenText, S.screen, 0.35), { font: 'small' });
        y += 30;
      }
      UI.panel(fb, L.x + 4, L.y + L.h - 22, L.w - 8, 18, { r: 3, ol: S.ink, fill: S.accent });
      Font.draw(fb, '{spark} Open the world map', L.x + L.w / 2, L.y + L.h - 16, 0xffffffff, { font: 'small', align: 'center' });
      btn('map', L.x + 4, L.y + L.h - 22, L.w - 8, 18, () => { close(); setTimeout(() => WorldMap.open(), 560); });
    }
    areas.quests = { x: R.x, y: R.y, w: R.w, h: R.h };
    clipTo(fb, R, (b) => {
      let y = R.y + 6 - (D.scroll.quests || 0);
      const x = R.x + 6 + slide;
      Font.draw(b, 'Prof. Birch\'s requests', x, y, S.screenText, { font: 'title' });
      y += 20;
      for (const q of Quests.BIRCH) {
        const done = !!Save.data.quests[q.id];
        UI.rrect(b, x - 3, y - 3, R.w - 8, done ? 14 : 24, 2, done ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xff000000, 0.1));
        Font.draw(b, (done ? '{check} ' : '{star0} ') + q.t, x, y, S.screenText, { font: 'small' });
        if (!done) { Font.draw(b, q.hint, x + 8, y + 10, U.mix(S.screenText, S.screen, 0.35), { font: 'small' }); y += 10; }
        y += 16;
      }
      D.questH = y + (D.scroll.quests || 0) - R.y;
    });
    D.scroll.quests = clamp(D.scroll.quests || 0, 0, Math.max(0, (D.questH || 0) - R.h + 8));
  }

  /* ---- style: Mudkip's wardrobe + device customisation ---- */
  const mudCache = new Map();
  function mudSprite(look, yaw) {
    const key = JSON.stringify(look) + '|' + yaw.toFixed(2);
    if (mudCache.has(key)) return mudCache.get(key);
    const m = Mudkip.meta, sc = 1.0, W = Math.ceil(m.bw * sc), H = Math.ceil(m.bh * sc);
    const r = Mudkip.render(Mudkip.build(Object.assign({ side: Math.cos(yaw), eyes: 'happy', mouth: 1 }, look)), { yaw, pitch: 0.16, scale: sc, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: Mudkip.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const b = r.buf; b.ox = W >> 1; b.oy = Math.floor(H * m.oy);
    if (mudCache.size > 60) mudCache.delete(mudCache.keys().next().value);
    mudCache.set(key, b);
    return b;
  }
  function pageStyle(fb, S, L, R, slide, t) {
    const look = Save.look();
    if (L) {
      const yaw = Math.round((0.6 + Math.sin(D.mudYaw * 0.7) * 0.9) * 10) / 10;
      const b = mudSprite(look, yaw);
      UI.img(fb, b, L.x + L.w / 2 - b.ox * 2 + slide, L.y + L.h - 40 - b.oy * 2, 2);
      UI.rrect(fb, L.x + L.w / 2 - 40, L.y + L.h - 40, 80, 6, 3, U.mix(S.screen, 0xff000000, 0.2));
      Font.draw(fb, 'Mudkip\'s look', L.x + 6, L.y + 8, S.screenText, { font: 'title' });
      Font.draw(fb, UI.skin().name + ' skin', L.x + 6, L.y + L.h - 16, U.mix(S.screenText, S.screen, 0.3), { font: 'small' });
    }
    // slot tabs
    let x = R.x + 4;
    const sw = Math.floor((R.w - 8) / 4);
    Rewards.SLOTS.forEach(([slot, label], i) => {
      const bx = R.x + 4 + (i % 4) * sw, by = R.y + 4 + Math.floor(i / 4) * 16;
      const on = D.styleSlot === slot;
      UI.panel(fb, bx, by, sw - 2, 14, { r: 3, ol: S.ink, fill: on ? S.accent : U.mix(S.screen, 0xff000000, 0.12), hi: null, sh: null });
      Font.draw(fb, label, bx + (sw - 2) / 2, by + 4, on ? 0xffffffff : S.screenText, { font: 'small', align: 'center' });
      btn('slot-' + slot, bx, by, sw - 2, 14, () => { D.styleSlot = slot; });
    });
    const items = Object.keys(Rewards.C).filter((id) => Rewards.C[id].slot === D.styleSlot);
    let y = R.y + 42;
    const eq = Save.data.equip[D.styleSlot];
    const canNone = ['hat', 'shirt', 'glasses', 'key'].includes(D.styleSlot);
    const rows = canNone ? [null, ...items] : items;
    for (const id of rows) {
      const own = id === null || Save.has(id);
      const on = eq === id || (id === null && !eq);
      UI.panel(fb, R.x + 4 + slide, y, R.w - 8, 18, { r: 3, ol: on ? S.accent : S.ink, fill: on ? U.mix(S.screen, 0xffffffff, 0.35) : own ? U.mix(S.screen, 0xffffffff, 0.12) : U.mix(S.screen, 0xff000000, 0.18), hi: null, sh: null });
      const nm = id === null ? 'None' : own ? Rewards.C[id].name : '???';
      Font.draw(fb, (on ? '{check} ' : own ? '' : '{lock} ') + nm, R.x + 10 + slide, y + 6, S.screenText, { font: 'body' });
      if (id && own && Rewards.C[id].desc) Font.draw(fb, Rewards.C[id].desc, R.x + R.w - 8, y + 7, U.mix(S.screenText, S.screen, 0.4), { font: 'small', align: 'right', clip: { x0: R.x + 90, y0: y, x1: R.x + R.w - 4, y1: y + 18 } });
      if (own) btn('eq-' + (id || 'none'), R.x + 4, y, R.w - 8, 18, () => { Save.equip(D.styleSlot, id); SFX.select(); if (D.styleSlot === 'key') D.keyV = 4; });
      y += 20;
      if (y > R.y + R.h - 20) break;
    }
  }

  /* ---- shop: spend research points on items, outfits and device styles ---- */
  const PRICE = { hat: 900, shirt: 800, glasses: 600, neck: 500, skin: 1500, banner: 700, key: 400, deco: 600 };
  const GOODS = [
    { id: 'item.berry5', name: '5 Oran Berries', desc: 'Throw them to lure hungry Pokémon.', price: 150, buy() { Save.addItem('berry', 5); } },
    { id: 'item.lure', name: 'Sweet Lure', desc: 'For 90 s Pokémon come closer and rare ones show up.', price: 400, buy() { Game.lureT = 90; HUD.toast('The Sweet Lure fills the air... Pokémon are drawn to you!', { life: 3 }); } },
    { id: 'item.film', name: 'Photo Album Page', desc: '+6 album slots for your favourite shots.', price: 300, buy() { Save.data.albumMax = (Save.data.albumMax || 24) + 6; Save.save(); } },
  ];
  let exclusiveSet = null;
  function exclusive() {
    if (exclusiveSet) return exclusiveSet;
    exclusiveSet = new Set();
    for (const k in DexData.S) for (const o of DexData.S[k].obj || []) if (o.reward) exclusiveSet.add(o.reward);
    for (const q of Quests.BIRCH || []) if (q.reward) exclusiveSet.add(q.reward);
    return exclusiveSet;
  }
  function pageShop(fb, S, L, R, slide, t) {
    const pts = Save.data.points;
    if (L) {
      Font.draw(fb, 'Pokédex Shop', L.x + 6, L.y + 8, S.screenText, { font: 'title' });
      Font.draw(fb, '{coin} ' + pts + ' points', L.x + 6, L.y + 30, S.screenText, { font: 'body' });
      Font.draw(fb, 'Earn points by taking great photos and finishing requests. Some prizes can only be won from Pokédex quests!', L.x + 6, L.y + 48, U.mix(S.screenText, S.screen, 0.3), { font: 'small', maxW: L.w - 12, lh: 10 });
      const look = Save.look(); const yaw = Math.round((0.6 + Math.sin(D.mudYaw * 0.7) * 0.9) * 10) / 10;
      const b = mudSprite(look, yaw);
      UI.img(fb, b, L.x + L.w / 2 - b.ox * 2 + slide, L.y + L.h - 30 - b.oy * 2, 2);
    }
    const cats = [['items', 'Items'], ['outfit', 'Outfits'], ['device', 'Device']];
    D.shopCat = D.shopCat || 'items';
    const cw = Math.floor((R.w - 8) / 3);
    cats.forEach(([id, label], i) => {
      const bx = R.x + 4 + i * cw, on = D.shopCat === id;
      UI.panel(fb, bx, R.y + 4, cw - 2, 14, { r: 3, ol: S.ink, fill: on ? S.accent : U.mix(S.screen, 0xff000000, 0.12), hi: null, sh: null });
      Font.draw(fb, label, bx + (cw - 2) / 2, R.y + 8, on ? 0xffffffff : S.screenText, { font: 'small', align: 'center' });
      btn('shopcat-' + id, bx, R.y + 4, cw - 2, 14, () => { D.shopCat = id; D.scroll.shop = 0; });
    });
    let rows;
    if (D.shopCat === 'items') rows = GOODS.map((g) => ({ id: g.id, name: g.name, desc: g.desc, price: g.price, owned: false, buy: g.buy }));
    else {
      const slots = D.shopCat === 'outfit' ? ['hat', 'shirt', 'glasses', 'neck'] : ['skin', 'banner', 'key', 'deco'];
      // quest prizes can be won for free, or bought here for a premium
      rows = Object.keys(Rewards.C).filter((id) => slots.includes(Rewards.C[id].slot) && !id.endsWith('.none'))
        .map((id) => { const ex = exclusive().has(id); return { id, name: Rewards.C[id].name + (ex ? ' {star}' : ''), desc: (ex ? 'Quest prize — or buy it now! ' : '') + (Rewards.C[id].desc || ''), price: (PRICE[Rewards.C[id].slot] || 500) * (ex ? 3 : 1), owned: Save.has(id), buy() { Save.own(id); Save.equip(Rewards.C[id].slot, id); } }; })
        .sort((a, b) => (a.owned - b.owned) || (a.price - b.price));
    }
    const Q = { x: R.x, y: R.y + 22, w: R.w, h: R.h - 24 };
    areas.shop = Q;
    const sc = D.scroll.shop || 0;
    clipTo(fb, Q, (g) => {
      let y = Q.y - sc;
      for (const r of rows) {
        if (y + 24 > Q.y && y < Q.y + Q.h) {
          const afford = pts >= r.price;
          UI.panel(g, R.x + 4 + slide, y, R.w - 8, 24, { r: 3, ol: S.ink, fill: r.owned ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xffffffff, 0.12), hi: null, sh: null });
          Font.draw(g, r.name, R.x + 10 + slide, y + 4, S.screenText, { font: 'body' });
          Font.draw(g, r.desc || '', R.x + 10 + slide, y + 15, U.mix(S.screenText, S.screen, 0.35), { font: 'small', clip: { x0: R.x, y0: y, x1: R.x + R.w - 60, y1: y + 24 } });
          const bw = 48, bx = R.x + R.w - 8 - bw;
          UI.panel(g, bx, y + 5, bw, 14, { r: 3, ol: S.ink, fill: r.owned ? 0xff7a8a80 : afford ? S.accent : 0xff5a5a6a, hi: null, sh: null });
          Font.draw(g, r.owned ? 'OWNED' : '{coin}' + r.price, bx + bw / 2, y + 9, 0xffffffff, { font: 'small', align: 'center' });
          if (!r.owned && y + 5 >= Q.y && y + 19 <= Q.y + Q.h) btn('buy-' + r.id, bx, y + 5, bw, 14, () => {
            if (Save.data.points < r.price) { SFX.error(); HUD.toast('Not enough points — take more great photos!', { life: 2 }); return; }
            Save.data.points -= r.price; Save.save(); r.buy(); SFX.reward(); HUD.toast('Bought ' + r.name + '!', { life: 2 });
          }, { silent: true });
        }
        y += 27;
      }
      D.shopMax = Math.max(0, rows.length * 27 - Q.h + 4);
    });
    D.scroll.shop = Math.min(D.scroll.shop || 0, D.shopMax || 0);
  }

  /* ---- discoveries ---- */
  const SECRETS = [
    ['beach.chest', 'The sunken treasure chest', 'Something glints on the seabed past the reef.'],
    ['dialga.met', 'A crystal humming with time', 'A beach rock sounds hollow...'],
    ['orb.taken', 'The Lustrous Orb', 'One of the moored boats hides a pearly glow.'],
    ['wailord.song', 'The song that calls the giant', 'Wailord listen from far out at sea.'],
    ['kyogre.woke', 'The legend of the trench', 'The Blue Orb, the deep, the night...'],
    ['meloetta.record', 'The Pokémon inside the music', 'Tap the spinning record.'],
    ['forest.institute', 'The Weather Institute switch', 'The Institute can make any weather.'],
    ['forest.feebas', 'The quiet pool', 'Under the bridge, the ripples look different.'],
    ['forest.rainbow', 'A rainbow after rain', 'Rain, then sun...'],
    ['forest.lever', 'The old bridge lever', 'Something by the river could lower a bridge.'],
    ['forest.ludicolo', 'The dancing duck', 'Ludicolo cannot resist a good beat.'],
    ['forest.milotic', 'The most beautiful Pokémon', 'Look after the quiet fish and it may blossom.'],
    ['kecleon.found', 'The invisible one', 'Leaves that move with no wind...'],
    ['tropius.ride', 'A ride on Tropius', 'Feed Tropius enough fruit and it may give you a lift.'],
    ['zigzagoon.pickup', 'Zigzagoon\'s treasure hunt', 'Follow a Zigzagoon when it starts sniffing.'],
    ['seedot.gloss', 'A glossy acorn', 'Some acorns in the fruit tree look thirsty.'],
    ['slakoth.yawn', 'A catching yawn', 'Keep a lazy Pokémon company for a while.'],
    ['forest.cheer', 'Plus and Minus', 'Have fun where the cheer squad can see you.'],
    ['wailmer.leap', 'The Wailmer leap', 'Sing at the end of the dock on a sunny day.'],
    ['tentacool.rescue', 'Back to the sea', 'Something has washed up by the water line.'],
    ['staryu.stars', 'The starry shore', 'On the beach at night, the stars come down to the sand.'],
    ['chinchou.escort', 'Lights in the deep', 'The trench at night is not as dark as it looks.'],
    ['relicanth.rose', 'The living fossil', 'When both old friends are home, watch the trench at dawn.'],
    ['trapinch.found', 'The sand pit', 'A funnel in the sand by the cliffs.'],
    ['nincada.found', 'The Pokémon under the roots', 'Dry roots on the cliff top... maybe they need water.'],
    ['fossil.lileep', 'The Root Fossil revived', 'Dig at the cliffs, then visit the altar.'],
    ['fossil.anorith', 'The Claw Fossil revived', 'A second fossil lies deeper along the cliffs.'],
    ['toy.umbrella', 'Umbrella trampoline', 'That beach umbrella looks bouncy.'],
    ['toy.castle', 'A sandcastle masterpiece', 'Keep building by the tide line.'],
    ['toy.hammock', 'A nap in the hammock', 'Two palms, one hammock.'],
    ['toy.bell', 'The dock bell', 'Ring it and see who flies in.'],
    ['toy.vine', 'Vine swing', 'A long vine hangs over the forest river.'],
    ['toy.mushroom', 'Mushroom trampoline', 'The giant mushroom in the forest looks springy.'],
    ['canopy.stage', 'The treetop stage', 'A stage waiting for music.'],
    ['canopy.chimes', 'The wind chime tune', 'Chatot might whistle the right order.'],
    ['canopy.feeder', 'The feeder feast', 'Hang a berry, then chase off the thief.'],
    ['canopy.choir', 'The Altaria choir', 'Sing at the lookout when the sun goes down.'],
    ['canopy.clean', 'Squeaky clean', 'Stand still under a Swablu for a while.'],
    ['palkia.met', 'The Pokémon that rules space', 'Dialga is not the only one...'],
    ['falls.meteorite', 'The meteorite heart', 'Deep in the cave, a rock hums with space.'],
    ['falls.shower', 'A meteor shower', 'Starfall Cave lives up to its name at night.'],
    ['falls.chimes', 'The singing crystals', 'Listen to the drips — they know the tune.'],
    ['falls.flight', 'Bagon\'s first flight', 'A leaping Bagon needs a lift from below.'],
    ['falls.wish', 'Jirachi\'s wish', 'Sing by the crystal nest while stars are falling.'],
    ['falls.deoxys', 'The visitor from space', 'Wake the meteorite, then crack Minior of many colours.'],
    ['toy.geyser', 'Geyser launch', 'Swim over the vent in the glowing pool.'],
    ['toy.slide', 'Waterfall slide', 'The stream off the high ledge looks slippery.'],
    ['regi.puzzle', 'The Braille Wall', 'Deep in Starfall Cave, dots on a wall name three stones.'],
    ['volcano.vent', 'Steam Rider', 'Lavaridge\'s steam vents are stronger than they look.'],
    ['volcano.stones', 'The Magma Stones', 'Four carved stones ring Mt. Chimney\'s crater. Watch the lava.'],
    ['groudon.woke', 'The Land Awakens', 'Something enormous sleeps in the magma.'],
    ['volcano.flute', 'Glass Flute', 'The glassblower on the ash slopes wants volcanic ash.'],
    ['shoal.skate', 'Ice Skater', 'Shoal Cave\'s floor is slippery. Very slippery.'],
    ['regice.woke', 'The Iceberg Giant', 'Stand in the circle. Be still. Then sing.'],
    ['rayquaza.seen', 'Sky High', 'Once a great Pokémon wakes, watch the sky over Treetop Town.'],
    ['forest.windmill', 'The Old Windmill', 'Past the stump, Weather Woods opens into a flower meadow.'],
    ['arcade.battle', 'Type Champion', 'Beat Budew at Type Battle in Weather Woods.'],
    ['arcade.rope', 'Skip Star', 'Ten jumps in a row at Spinda\'s jump rope.'],
    ['arcade.seek', 'Seeker', 'Find Marill in Hide & Seek on the boardwalk.'],
    ['arcade.tag', 'Tag Master', 'Catch Linoone at Tag... and escape.'],
    ['arcade.bar', 'Star Mixer', 'Serve 5 drinks in one shift at the Sunset Bar.'],
  ];
  function pageDisc(fb, S, L, R, slide, t) {
    const got = SECRETS.filter((s) => Save.found(s[0])).length;
    if (L) {
      Font.draw(fb, 'Secrets found', L.x + 6 + slide, L.y + 8, S.screenText, { font: 'title' });
      Font.draw(fb, got + ' / ' + SECRETS.length, L.x + 6 + slide, L.y + 28, S.screenText, { font: 'title', sc: 2 });
      Font.draw(fb, 'Use Scan (4) near anything', L.x + 6, L.y + 70, U.mix(S.screenText, S.screen, 0.3), { font: 'small' });
      Font.draw(fb, 'suspicious. Pokémon clues', L.x + 6, L.y + 80, U.mix(S.screenText, S.screen, 0.3), { font: 'small' });
      Font.draw(fb, 'point the way too!', L.x + 6, L.y + 90, U.mix(S.screenText, S.screen, 0.3), { font: 'small' });
    }
    areas.disc = { x: R.x, y: R.y, w: R.w, h: R.h };
    clipTo(fb, R, (b) => {
      let y = R.y + 6 - (D.scroll.disc || 0);
      for (const [id, name, hint] of SECRETS) {
        const f = Save.found(id);
        UI.rrect(b, R.x + 3 + slide, y - 3, R.w - 6, 22, 2, f ? U.mix(S.screen, 0xffffffff, 0.3) : U.mix(S.screen, 0xff000000, 0.12));
        Font.draw(b, (f ? '{spark} ' : '{lock} ') + (f ? name : '???'), R.x + 7 + slide, y, S.screenText, { font: 'small' });
        Font.draw(b, f ? 'Discovered!' : hint, R.x + 15 + slide, y + 10, U.mix(S.screenText, S.screen, 0.35), { font: 'small' });
        y += 25;
      }
      D.discH = y + (D.scroll.disc || 0) - R.y;
    });
    D.scroll.disc = clamp(D.scroll.disc || 0, 0, Math.max(0, (D.discH || 0) - R.h + 8));
  }

  /* ---- settings ---- */
  function pageSettings(fb, S, L, R, slide, t) {
    let y = R.y + 8;
    const row = (label, val, fn) => {
      UI.panel(fb, R.x + 4 + slide, y, R.w - 8, 20, { r: 3, ol: S.ink, fill: U.mix(S.screen, 0xffffffff, 0.2), hi: null, sh: null });
      Font.draw(fb, label, R.x + 10 + slide, y + 7, S.screenText, { font: 'body' });
      Font.draw(fb, val, R.x + R.w - 10, y + 7, S.screenText, { font: 'body', align: 'right' });
      btn('set-' + label, R.x + 4, y, R.w - 8, 20, fn);
      y += 24;
    };
    row('Sound', Sound.on ? 'ON' : 'OFF', () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); });
    row('Song', Music.cur ? Music.TRACKS[Music.cur].title : '—', () => Music.next());
    row('Camera grid', Photo.grid ? 'ON' : 'OFF', () => { Photo.grid = !Photo.grid; });
    row('Time of day', Game.hour() + (Game.canTime() ? '' : ' (locked)'), () => Game.tryTime());
    row('Reset journal', D.confirm ? 'Tap again!' : '...', () => { if (D.confirm) { Save.reset(); D.confirm = null; HUD.toast('Journal reset.'); } else { D.confirm = true; setTimeout(() => { D.confirm = null; }, 2500); } });
    if (L) {
      Font.draw(fb, 'How to play', L.x + 6, L.y + 8, S.screenText, { font: 'title' });
      const tips = ['Tap to walk, swim or interact.', 'SNAP opens the camera: drag to', 'aim, pinch or slide to zoom,', 'tap a Pokémon to focus.', 'Moves: 1 Water Gun  2 Song', '3 Berry  4 Scan.', 'Rare behaviours = more stars.', 'Big, centred, facing you, in', 'focus = better medals.', 'Keys: arrows, C camera,', 'Space shutter, P Pokédex, M map.'];
      tips.forEach((s, i) => Font.draw(fb, s, L.x + 6, L.y + 28 + i * 11, S.screenText, { font: 'small' }));
    }
  }
  function cancel() { D.press = null; }
  return Object.assign(D, { cancel, open, close, go, update, draw, down, move, up, wheel, key, thumb });
})();
