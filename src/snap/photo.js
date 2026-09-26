/* ------------------------------------------------------------------
   Photo — Mudkip's camera (part of the Pokédex device).
   Viewfinder with optical zoom, tap / auto focus with depth-of-field
   blur, and a shutter that renders an id-buffer frame to judge every
   Pokémon in shot: behaviour (stars) and timing (peak), size, facing,
   placement, how much is hidden behind foreground things, focus.
   Pokémon can splash, freeze, crack or lick the lens.
------------------------------------------------------------------- */
const Photo = (() => {
  const { clamp, lerp, rnd, mix } = U;
  const P = {
    on: false, anim: 0, zoom: 1, zs: 1, aim: { x: 0, y: 0 }, aimV: { x: 0, y: 0 }, keyV: { x: 0, y: 0 },
    focus: null, focusK: 0, focusMode: 'auto', focusPt: null, focusT: 0, lastAimT: 0,
    cool: 0, flash: 0, recent: null, lens: { wet: [], frost: 0, crack: null, smear: 0, stat: 0, blur: 0 }, grid: true, shots: 0,
  };
  const cv = () => document.getElementById('cv');

  /* ---------- open / close ---------- */
  function open() {
    if (Game.mode !== 'explore' || !Game.mudkip) return;
    const mk = Game.mudkip;
    mk.stop(); mk.holdCam = 1;
    Game.mode = 'camera';
    P.on = true; P.anim = 0; P.zoom = Math.max(1, P.zoom); P.zs = 1;
    P.aim.x = Game.cam.x + Game.VW / 2 + Math.cos(mk.yaw) * 30; P.aim.y = Game.cam.y + Game.VH / 2;
    P.focus = null; P.focusK = 0; P.focusT = 0.2;
    HUD.armed = null;
    Game.sfx('hinge'); setTimeout(() => Game.sfx('boot', null, 0.6), 120);
    U.emit('camera', true);
  }
  function close() {
    if (!P.on) return;
    P.on = false; Game.mode = 'explore';
    if (Game.mudkip) Game.mudkip.holdCam = 0;
    const c = cv(); c.style.transition = 'transform 160ms ease-out'; c.style.transform = 'scale(1)';
    Game.cam.lookX = 0; Game.cam.lookY = 0;
    Game.sfx('back');
    U.emit('camera', false);
  }
  function setZoom(z) { const nz = clamp(z, 1, 4); if (Math.abs(nz - P.zoom) > 0.05 && Math.floor(nz * 4) !== Math.floor(P.zoom * 4)) Game.sfx('zoom'); P.zoom = nz; P.lastAimT = Game.rt; }

  /* ---------- aiming ---------- */
  let dragAim = null;
  function aimDrag(dx, dy, drag) {
    if (!dragAim || dragAim.drag !== drag) dragAim = { drag, x: P.aim.x, y: P.aim.y };
    P.aim.x = dragAim.x - dx / P.zs; P.aim.y = dragAim.y - dy / P.zs;
    clampAim(); P.lastAimT = Game.rt;
    if (P.focusMode !== 'lock') { P.focusK = Math.min(P.focusK, 0.4); }
  }
  function aimEnd() { dragAim = null; P.focusT = 0.15; }
  function keyAim(x, y) { P.keyV.x = x; P.keyV.y = y; }
  function clampAim() {
    const mk = Game.mudkip, A = Game.area;
    const rx = Game.VW * 0.95, ry = Game.VH * 0.8;
    P.aim.x = clamp(P.aim.x, mk.x - rx, mk.x + rx); P.aim.y = clamp(P.aim.y, mk.y - ry - 20, mk.y + ry);
    P.aim.x = clamp(P.aim.x, Game.VW / 2, A.W - Game.VW / 2);
  }
  function updateCam(dt) {
    if (P.keyV.x || P.keyV.y) { P.aim.x += P.keyV.x * dt * 160 / P.zs; P.aim.y += P.keyV.y * dt * 160 / P.zs; clampAim(); P.lastAimT = Game.rt; }
    // keep a locked subject framed gently
    const c = Game.cam;
    const tx = P.aim.x - Game.VW / 2, ty = P.aim.y - Game.VH / 2;
    const k = 1 - Math.exp(-dt * 10);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    Game.clampCam();
  }
  function tapFocus(wx, wy) {
    const hits = Game.hitsAt(wx, wy, 14).filter((h) => h instanceof Mons.Mon);
    if (hits.length) { P.focus = hits[0]; P.focusMode = 'lock'; }
    else { P.focus = null; P.focusMode = 'point'; P.focusPt = { x: wx, y: wy, far: wy < World.groundAt(wx) - 90 && World.waterAt(wx) === null }; }
    P.focusK = 0; P.focusT = 0.01;
  }
  // crop (visible part of the frame buffer) in fb pixels
  function crop() { const w = Math.round(Game.VW / P.zs), h = Math.round(Game.VH / P.zs); return { x: Math.round((Game.VW - w) / 2), y: Math.round((Game.VH - h) / 2), w, h }; }
  function inView(m) {
    if (!P.on) return false;
    const c = crop(), sx = m.x - Game.cam.x, sy = m.y - 10 - Game.cam.y;
    return sx > c.x && sx < c.x + c.w && sy > c.y && sy < c.y + c.h + 10;
  }
  function autoFocus() {
    const c = crop();
    let best = null, bd = 1e9;
    for (const m of Game.mons) {
      if (m === Game.mudkip || !m.alive || !m.visible || m.hideK > 0.8) continue;
      const [mx, my] = m.center ? m.center() : [m.x, m.y];
      const sx = mx - Game.cam.x - (c.x + c.w / 2), sy = my - Game.cam.y - (c.y + c.h / 2);
      if (Math.abs(sx) > c.w / 2 || Math.abs(sy) > c.h / 2) continue;
      const d = Math.hypot(sx, sy * 1.2) - Math.min(40, m.width() * 0.4);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function update(dt, t) {
    P.cool = Math.max(0, P.cool - dt); P.flash = Math.max(0, P.flash - dt * 4);
    // smooth optical zoom (applied as a CSS scale of the world canvas: pixels grow like a real zoom)
    const zs0 = P.zs;
    P.zs = lerp(P.zs, P.on ? P.zoom : 1, 1 - Math.exp(-dt * 12));
    if (P.on) P.anim = Math.min(1, P.anim + dt * 4);
    if (Math.abs(P.zs - zs0) > 0.0005 || P.on) { const c = cv(); c.style.transition = 'none'; c.style.transformOrigin = '50% 50%'; c.style.transform = `scale(${P.zs.toFixed(4)})`; }
    // lens effects decay
    const L = P.lens;
    for (const d of L.wet) { d.y += d.v * dt; d.life -= dt; }
    L.wet = L.wet.filter((d) => d.life > 0);
    L.frost = Math.max(0, L.frost - dt * 0.18); L.smear = Math.max(0, L.smear - dt * 0.22); L.stat = Math.max(0, L.stat - dt * 0.8); L.blur = Math.max(0, L.blur - dt * 1.5);
    if (L.crack) { L.crack.t -= dt; if (L.crack.t <= 0) L.crack = null; }
    if (P.recent) { P.recent.t += dt; if (P.recent.t > (P.on ? 3.4 : 3.8)) P.recent = null; }
    if (!P.on) return;
    // focus: auto-focus after aiming settles; locked subjects are tracked
    if (P.focusMode === 'lock' && (!P.focus || !P.focus.alive || !inView(P.focus))) { P.focusMode = 'auto'; P.focus = null; }
    if (P.focusMode === 'auto' && Game.rt - P.lastAimT > 0.12) {
      const f = autoFocus();
      if (f !== P.focus) { P.focus = f; P.focusK = 0; P.focusT = 0.01; }
    }
    if (P.focusT > 0) { P.focusT -= dt; if (P.focusT <= 0) P.focusK = 0.01; }
    if (P.focusK > 0 && P.focusK < 1) { P.focusK = Math.min(1, P.focusK + dt * 4.5); if (P.focusK >= 1 && (P.focus || P.focusPt)) Game.sfx('focus'); }
  }
  // depth of field for this frame: blur radii for the background and the foreground layer
  function dof() {
    if (!P.on) return null;
    const far = P.focusMode === 'point' && P.focusPt && P.focusPt.far;
    const z = P.zs;
    const back = far ? 0 : Math.round(clamp((z - 1) * 1.1 + (P.focus ? 0.8 : 0.3), 0, 3));
    const fore = Math.round(clamp(2 + z * 1.2 + (far ? 2 : 0), 2, 7));
    return { back, fore };
  }

  /* ---------- the shutter ---------- */
  function shoot() {
    if (!P.on || P.cool > 0) return;
    P.cool = 0.45; P.flash = 1; P.shots++;
    Game.sfx('shutter');
    for (const m of Mons.all) if (m !== Game.mudkip) m.hear('shutter', m.x, 0.5);
    // render a judging frame with object ids
    const cx = Math.round(Game.cam.x), cy = Math.round(Game.cam.y);
    const pid = new Map();
    let n = 1;
    for (const m of Game.mons) if (m !== Game.mudkip && m.alive) { m.pid = n; pid.set(n, m); n++; }
    Game.drawWorld(cx, cy, Game.t, { ids: true });
    const fb = Game.fb(), idb = Game.idb(), W = fb.w;
    const c = crop();
    const vis = new Map(), box = new Map();
    for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
      const id = idb[y * W + x];
      if (!id) continue;
      vis.set(id, (vis.get(id) || 0) + 1);
      let b = box.get(id); if (!b) { b = { x0: x, y0: y, x1: x, y1: y }; box.set(id, b); }
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    }
    const L = P.lens;
    const lensK = Math.max(0, 1 - L.wet.length * 0.025 - L.frost * 0.5 - L.smear * 0.4 - (L.crack ? 0.25 : 0) - L.stat * 0.5);
    const subs = [];
    for (const [id, v] of vis) {
      const m = pid.get(id); if (!m) continue;
      const d = DexData.S[m.dex]; if (!d || d.player) continue;
      const tot = spritePx(m);
      if (v < 18) continue;
      const b = box.get(id);
      const size = ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) / (c.w * c.h);
      const mx = (b.x0 + b.x1) / 2 - (c.x + c.w / 2), my = (b.y0 + b.y1) / 2 - (c.y + c.h / 2);
      const off = Math.hypot(mx / c.w, my / c.h);
      const beh = d.beh[m.act.id] ? m.act.id : Object.keys(d.beh)[0];
      const tier = d.beh[beh] ? d.beh[beh].tier : 1;
      const peak = clamp(m.peak, 0, 1);
      const visK = clamp(v / Math.max(1, tot), 0, 1);
      const sharp = P.focus === m && P.focusK >= 1 ? 1 : P.focusMode === 'point' && P.focusPt && P.focusPt.far ? 0.45 : P.focusK >= 1 ? 0.8 : 0.6;
      const sizeF = size < 0.16 ? size / 0.16 : size < 0.5 ? 1 : Math.max(0.35, 1 - (size - 0.5) * 1.6);
      const thirds = Math.min(Math.hypot(Math.abs(mx / c.w) - 1 / 6, my / c.h), Math.hypot(mx / c.w, my / c.h));
      const place = clamp(1 - thirds / 0.42, 0, 1);
      const face = m.facing ? m.facing() : 0.5;
      const pose = [0, 420, 950, 1650, 2450][tier] * (0.62 + 0.38 * peak);
      const parts = { pose: Math.round(pose), size: Math.round(1800 * sizeF), dir: Math.round(1150 * face), place: Math.round(1000 * place) };
      const visMul = visK < 0.3 ? visK * 1.4 : Math.pow(visK, 0.8);
      const focusMul = 0.35 + 0.65 * sharp;
      const lensMul = m.act.id === 'attack' ? Math.max(lensK, 0.85) : lensK;
      const base = (parts.pose + parts.size + parts.dir + parts.place) * visMul * focusMul * lensMul;
      subs.push({ m, sp: m.dex, beh, tier, peak, size, visK, sharp, face, parts, base, visMul, focusMul, lensMul, off });
    }
    let res;
    if (!subs.length) res = { species: null, score: 0, stars: 0, medal: 0 };
    else {
      subs.sort((a, b) => b.base - a.base);
      const main = subs[0];
      const others = [...new Set(subs.slice(1).filter((s) => s.visK > 0.35 && s.size > 0.01).map((s) => s.sp))];
      let bonus = Math.min(3, others.length) * 380;
      // interactions: two creatures sharing the same behaviour (duels, duets, schools)
      const same = subs.filter((s) => s !== main && s.beh === main.beh && s.visK > 0.4).length;
      if (same) bonus += Math.min(3, same) * 260;
      let special = 0, specialName = '';
      const A = Game.area;
      if (A.def.photoBonus) { const sb = A.def.photoBonus(A, c, subs, main); if (sb) { special = sb.pts; specialName = sb.name; } }
      const score = Math.round(main.base + bonus + special);
      const medal = score >= 6000 ? 4 : score >= 4000 ? 3 : score >= 2200 ? 2 : 1;
      res = { species: main.sp, beh: main.beh, stars: main.tier, score, medal, parts: Object.assign({}, main.parts, { vis: main.visMul, focus: main.focusMul, lens: main.lensMul, others: bonus, special, specialName }), others, area: Game.areaId, mon: main.m };
    }
    // thumbnail from the visible crop
    const shot = cropBuf(fb, c);
    res.buf = shot.thumb;
    res.img = shot.url;
    // registration
    let rec = null;
    if (res.species) {
      rec = Save.recordPhoto(res);
      Save.addPoints(Math.round(res.score / 10));
      Quests.checkPhoto(res, rec);
      if (res.mon && res.mon.onPhoto) res.mon.onPhoto(res);
    } else Save.recordPhoto(res);
    P.recent = { res, rec, t: 0, name: res.species ? DexData.S[res.species].name : '', bname: res.species && DexData.S[res.species].beh[res.beh] ? DexData.S[res.species].beh[res.beh].n : '' };
    setTimeout(() => { if (res.species) { Game.sfx('stamp'); setTimeout(() => SFX.rank(0, 1, res.medal), 150); if (rec && rec.newSpecies) setTimeout(() => Game.sfx('newEntry'), 700); } }, 250);
    U.emit('photo', res);
    return res;
  }
  function spritePx(m) {
    const s = m.spr; if (!s) return 1;
    if (s.px) return s.px;
    let n = 0; for (let i = 0; i < s.d.length; i++) if (s.d[i]) n++;
    return (s.px = Math.max(1, n));
  }
  function cropBuf(fb, c) {
    const k = Math.max(1, Math.ceil(c.w / 180));
    const w = Math.floor(c.w / k), h = Math.floor(c.h / k);
    const b = new PX.Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (k === 1) { b.d[y * w + x] = fb.d[(c.y + y) * fb.w + c.x + x]; continue; }
      let r = 0, g = 0, bl = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const v = fb.d[(c.y + y * k + j) * fb.w + c.x + x * k + i]; r += v & 255; g += (v >>> 8) & 255; bl += (v >>> 16) & 255; }
      const q = k * k; b.d[y * w + x] = U.pack(r / q, g / q, bl / q);
    }
    let url = null;
    try {
      const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
      const x2 = cvs.getContext('2d'), im = x2.createImageData(w, h);
      new Uint32Array(im.data.buffer).set(b.d); x2.putImageData(im, 0, 0);
      url = cvs.toDataURL('image/png');
      if (url.length > 26000) url = cvs.toDataURL('image/jpeg', 0.9);
    } catch (e) { /* headless or tainted: keep the in-memory copy only */ }
    return { thumb: b, url };
  }

  /* ---------- lens attacks ---------- */
  function hitLens(kind, o = {}) {
    const L = P.lens;
    Game.shake(kind === 'crack' ? 4 : 2.5);
    if (kind === 'splash') { for (let i = 0; i < 22; i++) L.wet.push({ x: Math.random(), y: Math.random() * 0.9, r: rnd(2, 6), v: rnd(0.004, 0.02), life: rnd(3, 6) }); L.blur = 1; Game.sfx('lensSplash'); }
    else if (kind === 'frost') { L.frost = 1; Game.sfx('lensFrost'); }
    else if (kind === 'crack') { L.crack = { x: o.x ?? rnd(0.3, 0.7), y: o.y ?? rnd(0.3, 0.7), t: 3.5, seed: Math.random() * 999 }; Game.sfx('lensCrack'); }
    else if (kind === 'smear') { L.smear = 1; Game.sfx('lensSplash', 0, 0.5); }
    else if (kind === 'static') { L.stat = 1; Game.sfx('staticBuzz'); }
    else if (kind === 'bump') { Game.shake(3); Game.sfx('bonk', null, 0.5); }
    if (!P.on) HUD.toast(kind === 'splash' ? 'Splash! Your lens got wet.' : kind === 'frost' ? 'Brrr! The lens froze over.' : kind === 'crack' ? 'Crack! (It will heal in a moment.)' : kind === 'smear' ? 'Eww, a lick on the lens!' : 'Bzzt!', { life: 2 });
  }
  // lens effects drawn over the world frame (world-canvas pixels)
  function drawLens(fb, t) {
    const L = P.lens, W = fb.w, H = fb.h, d = fb.d;
    if (L.wet.length) {
      const src = d.slice();
      for (const dr of L.wet) {
        const cx = Math.round(dr.x * W), cy = Math.round(dr.y * H), r = dr.r;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          const dd = Math.hypot(x, y); if (dd > r) continue;
          const X = cx + x, Y = cy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          // droplet lens: sample from a flipped, magnified spot
          const sx = clamp(cx - Math.round(x * 0.6), 0, W - 1), sy = clamp(cy - Math.round(y * 0.6), 0, H - 1);
          let c = src[sy * W + sx];
          if (dd > r - 1) c = mix(c, 0xff1a2030, 0.35);
          if (x < 0 && y < 0 && dd < r * 0.4 && dd > r * 0.15) c = mix(c, 0xffffffff, 0.7);
          d[Y * W + X] = c;
        }
      }
    }
    if (L.frost > 0) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H, e = Math.min(ex, ey * 1.3);
        const n = U.hash(x >> 1, y >> 1, 7) * 0.12 + U.vnoise(x * 0.12, y * 0.12, 3) * 0.2;
        const k = clamp((L.frost * 0.34 - e + n) * 5, 0, 1);
        if (k > 0.02) d[y * W + x] = mix(d[y * W + x], U.hash(x, y, 1) > 0.9 ? 0xffffffff : 0xfff0dcc8, k * 0.85);
      }
    }
    if (L.smear > 0) {
      for (let y = 0; y < H; y++) { const band = Math.abs((y - H * 0.55) / H - (0.2 - 0.0)) ; for (let x = 0; x < W; x++) { const q = Math.abs((x / W) - (y / H) * 0.6 - 0.2); if (q < 0.18) { const i = y * W + x, j = y * W + clamp(x + 3, 0, W - 1); d[i] = mix(mix(d[i], d[j], 0.5), 0xffb8a0ff, L.smear * 0.25 * (1 - q / 0.18)); } } }
    }
    if (L.crack) {
      const cr = L.crack, r = U.rng(cr.seed), cx = cr.x * W, cy = cr.y * H;
      for (let k = 0; k < 9; k++) {
        let a = (k / 9) * Math.PI * 2 + r() * 0.5, x = cx, y = cy;
        const len = 40 + r() * 120;
        for (let j = 0; j < len; j++) { const X = Math.round(x), Y = Math.round(y); if (X >= 0 && Y >= 0 && X < W && Y < H) { d[Y * W + X] = j % 7 ? 0xfff8fcff : 0xff5a6070; } x += Math.cos(a); y += Math.sin(a); if (r() < 0.08) a += (r() - 0.5) * 1.2; }
      }
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const X = Math.round(cx + x), Y = Math.round(cy + y); if (X >= 0 && Y >= 0 && X < W && Y < H) d[Y * W + X] = mix(d[Y * W + X], 0xffffffff, 0.6); }
    }
    if (L.stat > 0) {
      for (let y = 0; y < H; y++) {
        const tear = Math.sin(y * 0.3 + t * 40) > 0.95 ? Math.round((Math.random() - 0.5) * 12 * L.stat) : 0;
        for (let x = 0; x < W; x++) { const i = y * W + x; if (tear) d[i] = d[y * W + clamp(x + tear, 0, W - 1)]; if (Math.random() < L.stat * 0.25) d[i] = mix(d[i], Math.random() < 0.5 ? 0xffffffff : 0xff101018, 0.6); }
      }
    }
    if (P.flash > 0) { const k = Math.round(P.flash * 200); for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xffffffff, k); }
  }

  /* ---------- viewfinder UI (UI canvas) ---------- */
  function drawUI(fb, t) {
    const S = UI.skin(), W = fb.w, H = fb.h;
    const a = U.ease.outCubic(P.anim);
    const bw = Math.round(14 * a) + 2; // device frame thickness
    // frame: device body around the viewfinder
    const inset = Math.round((1 - a) * 30);
    const x0 = bw + inset, y0 = bw + 8 + inset, x1 = W - bw - 34 - inset, y1 = H - bw - inset;
    // outer body
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      // rounded inner corners
      fb.d[y * W + x] = S.body;
    }
    // inner rounded corner masks + dark rim
    for (let k = 0; k < 4; k++) { const cx = k & 1 ? x1 - 1 : x0, cy = k & 2 ? y1 - 1 : y0; for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) { if (Math.hypot(4 - dx, 4 - dy) > 4.5) UI.put(fb, k & 1 ? cx - dx + 4 - 4 + (4 - dx) - (4 - dx) : cx + dx, k & 2 ? cy - dy : cy + dy, S.body); } }
    UI.rrect(fb, x0 - 2, y0 - 2, x1 - x0 + 4, 2, 0, S.ink);
    UI.rect(fb, x0 - 2, y1, x1 - x0 + 4, 2, S.ink); UI.rect(fb, x0 - 2, y0 - 2, 2, y1 - y0 + 4, S.ink); UI.rect(fb, x1, y0 - 2, 2, y1 - y0 + 4, S.ink);
    UI.hline(fb, 0, W - 1, 0, S.ink); UI.hline(fb, 1, W - 2, 1, S.bodyL); UI.hline(fb, 0, W - 1, H - 1, S.ink); UI.vline(fb, 0, 0, H - 1, S.ink); UI.vline(fb, W - 1, 0, H - 1, S.ink);
    if (S.stars) for (let k = 0; k < 40; k++) UI.put(fb, (k * 97) % W, (k * 53) % H, 0xffd8d0ff);
    // decorations on the frame
    Rewards.drawDeco(fb, S, x0, y0, x1, y1, t);
    // top strip: lens light + LEDs + label
    const fk = P.focusK >= 1 && (P.focus || P.focusPt);
    UI.lens(fb, 10, 8, 4, S, fk ? 0.8 : 0.2, t);
    UI.led(fb, 22, 6, 0xffff4a4a, P.cool > 0.2 || Math.sin(t * 5) > 0.3); UI.led(fb, 28, 6, 0xffffd23a, P.focusK > 0 && P.focusK < 1); UI.led(fb, 34, 6, 0xff4ade6a, !!fk);
    Font.draw(fb, 'SNAP-DEX CAMERA', 42, 5, S.trim, { font: 'small' });
    Font.draw(fb, 'PHOTOS ' + String(Save.data.shots).padStart(3, '0'), x1 - 2, 5, S.trim, { font: 'small', align: 'right' });
    // thirds grid
    const cw = x1 - x0, ch = y1 - y0;
    if (P.grid) for (let k = 1; k < 3; k++) {
      for (let y = y0; y < y1; y += 3) UI.blend(fb, x0 + Math.round((cw * k) / 3), y, 0xffffffff, 0.35);
      for (let x = x0; x < x1; x += 3) UI.blend(fb, x, y0 + Math.round((ch * k) / 3), 0xffffffff, 0.35);
    }
    // focus brackets: on the subject (or centre), shrinking while focusing
    let fx = (x0 + x1) / 2, fy = (y0 + y1) / 2, fw = 44, fh = 34;
    const toUI = (wx, wy) => { const sx = (wx - Game.cam.x - Game.VW / 2) * P.zs + Game.VW / 2, sy = (wy - Game.cam.y - Game.VH / 2) * P.zs + Game.VH / 2; return [sx * Game.zoom / Game.US, sy * Game.zoom / Game.US]; };
    if (P.focus && P.focus.spr) {
      const b = P.focus.bounds();
      const [ax, ay] = toUI(b.x0, b.y0), [bx, by] = toUI(b.x1, b.y1);
      fx = (ax + bx) / 2; fy = (ay + by) / 2; fw = Math.max(18, bx - ax + 6); fh = Math.max(16, by - ay + 6);
    } else if (P.focusPt) { const [ax, ay] = toUI(P.focusPt.x, P.focusPt.y); if (P.focusMode === 'point') { fx = ax; fy = ay; fw = 26; fh = 22; } }
    const grow = (1 - Math.min(1, P.focusK)) * 14;
    fw += grow; fh += grow;
    const col = fk ? 0xff5aff7a : P.focusK > 0 ? 0xffffe066 : 0xffffffff;
    const bl = 6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = Math.round(fx + (sx * fw) / 2), cy = Math.round(fy + (sy * fh) / 2);
      for (let k = 0; k < bl; k++) { UI.put(fb, cx - sx * k, cy, col); UI.put(fb, cx, cy - sy * k, col); UI.put(fb, cx - sx * k, cy + sy, 0xff0a0e1a); }
    }
    // subject label
    if (P.focus && fk) {
      const d = DexData.S[P.focus.dex];
      const known = d && Save.data.seen[P.focus.dex];
      const nm = d ? (known ? d.name : '???') : '';
      const bn = d && d.beh[P.focus.act.id] ? d.beh[P.focus.act.id] : null;
      const lbl = nm + (bn && known ? '  ' + '{star}'.repeat(bn.tier) : '');
      Font.draw(fb, lbl, Math.round(fx), Math.round(fy - fh / 2 - 12), 0xffffffff, { font: 'small', align: 'center', outline: 0xff0a0e1a });
    }
    // right rail: zoom slider + shutter
    const rx = W - 30;
    UI.panel(fb, rx, y0, 24, y1 - y0 - 58, { r: 4, ol: S.ink, fill: S.bodyD, hi: null, sh: null });
    const sy0 = y0 + 14, sy1 = y1 - 70;
    UI.rect(fb, rx + 11, sy0, 2, sy1 - sy0, S.ink);
    for (let k = 0; k <= 6; k++) UI.hline(fb, rx + 7, rx + 16, Math.round(sy1 - ((sy1 - sy0) * k) / 6), U.mix(S.ink, S.bodyD, 0.3));
    const ky = Math.round(sy1 - ((sy1 - sy0) * (P.zoom - 1)) / 3);
    UI.panel(fb, rx + 4, ky - 4, 16, 9, { r: 2, ol: S.ink, fill: S.trim });
    Font.draw(fb, 'x' + P.zoom.toFixed(1), rx + 12, y0 + 4, S.trim, { font: 'small', align: 'center' });
    Font.draw(fb, '+', rx + 12, sy0 - 1, S.trim, { font: 'small', align: 'center' }); Font.draw(fb, '-', rx + 12, sy1 + 3, S.trim, { font: 'small', align: 'center' });
    HUD.btn('zoom', rx, y0, 24, y1 - y0 - 58, null, { drag: (ux, uy) => { setZoom(1 + clamp((sy1 - uy) / (sy1 - sy0), 0, 1) * 3); } });
    // shutter
    const scx = W - 18, scy = H - 26, sr = 13;
    const pr = HUD.pressed('shutter') ? 1 : 0;
    UI.disc(fb, scx, scy + 2, sr + 1, 0xff0a0e1a);
    UI.orb(fb, scx, scy + pr, sr, 0xfff2f4fa, { ol: S.ink });
    UI.orb(fb, scx, scy + pr, sr - 4, P.cool > 0 ? U.tweak(S.accent, 0, 1, -0.2) : S.accent, { ol: S.ink });
    Font.icon(fb, 'cam', scx - 4, scy - 3 + pr, 1);
    HUD.btn('shutter', scx - sr - 3, scy - sr - 3, sr * 2 + 6, sr * 2 + 6, () => shoot());
    // close + grid toggles (top-left of frame)
    const cb = HUD.pressed('camx') ? 1 : 0;
    UI.panel(fb, 4, H - 22 - cb * 0, 20, 18, { r: 3, ol: S.ink, fill: S.btn });
    Font.icon(fb, 'cross', 11, H - 16, 1);
    HUD.btn('camx', 2, H - 24, 24, 22, () => close());
    UI.panel(fb, 28, H - 22, 20, 18, { r: 3, ol: S.ink, fill: P.grid ? S.accent : S.btn });
    Font.draw(fb, '#', 38, H - 17, 0xffffffff, { font: 'small', align: 'center' });
    HUD.btn('grid', 26, H - 24, 24, 22, () => { P.grid = !P.grid; Game.sfx('blip'); });
    // quick berry throw while aiming
    UI.panel(fb, 52, H - 22, 30, 18, { r: 3, ol: S.ink, fill: S.btn });
    HUD.iconAt(fb, 'berry', 56, H - 19, 1);
    Font.draw(fb, String(Save.itemN('berry')), 76, H - 17, 0xffffffff, { font: 'small', align: 'right' });
    HUD.btn('cberry', 50, H - 24, 34, 22, () => { if (Save.useItem('berry')) { const mk = Game.mudkip, [mx, my] = mk.at('mouth'); Items.throwBerry(mx, my - 4, P.aim.x, World.standY(P.aim.x)); Game.sfx('whoosh'); } else { Game.sfx('error'); HUD.toast('No berries left.'); } });
    // recent shot polaroid
    drawRecent(fb, t, x0 + 4, y1 - 4);
    // awareness hint: the focused Pokémon noticed you
    if (P.focus && P.focus.aware > 0.55 && fk) Font.draw(fb, P.focus.persona === 'shy' ? 'It looks nervous...' : P.focus.persona === 'grumpy' ? 'It looks annoyed!' : 'It noticed you!', (x0 + x1) / 2, y1 - 12, 0xffffffff, { font: 'small', align: 'center', outline: 0xff0a0e1a });
  }
  function drawRecent(fb, t, ox = 8, oy = null) {
    const r = P.recent; if (!r) return;
    const res = r.res;
    const k = r.t < 0.35 ? U.ease.outBack(r.t / 0.35) : r.t > 3 ? 1 - (r.t - 3) / 0.4 : 1;
    if (k <= 0) return;
    const tb = res.buf, sc = 1;
    const tw = Math.min(96, tb.w), th = Math.round(tb.h * (tw / tb.w));
    const w = tw + 8, h = th + 30;
    const x = Math.round(ox - (1 - k) * 60), y = Math.round((oy ?? fb.h - 40) - h);
    UI.panel(fb, x, y, w, h, { r: 2, ol: 0xff1b2240, fill: 0xfffbfaf4 });
    UI.imgFit(fb, tb, x + 4, y + 4, tw, th);
    UI.rect(fb, x + 4, y + 4 + th, tw, 1, 0xff1b2240);
    if (res.species) {
      Font.draw(fb, '{star}'.repeat(res.stars), x + 4, y + th + 9, 0, { font: 'small' });
      Font.draw(fb, r.name, x + w - 4, y + th + 9, 0xff1b2240, { font: 'small', align: 'right' });
      const shown = Math.round(res.score * Math.min(1, r.t / 0.8));
      const mc = [0, 0xffc07a3a, 0xffb8c0d0, 0xffffc83a, 0xff9af0ff][res.medal];
      UI.disc(fb, x + 9, y + th + 20, 4, 0xff1b2240); UI.disc(fb, x + 9, y + th + 20, 3, mc);
      Font.draw(fb, String(shown), x + 16, y + th + 18, 0xff1b2240, { font: 'small' });
      Font.draw(fb, DexData.MEDALS[res.medal], x + w - 4, y + th + 18, U.tweak(mc, 0, 1, -0.25), { font: 'small', align: 'right' });
      if (r.rec && (r.rec.newSpecies || r.rec.newBeh) && Math.sin(r.t * 10) > -0.4) Font.icon(fb, 'new', x + w - 13, y + 1, 1);
    } else Font.draw(fb, 'No Pokémon', x + w / 2, y + th + 12, 0xff6a7088, { font: 'small', align: 'center' });
  }
  return Object.assign(P, { open, close, setZoom, aimDrag, aimEnd, keyAim, updateCam, tapFocus, update, dof, shoot, hitLens, drawLens, drawUI, drawRecent, inView, crop });
})();
