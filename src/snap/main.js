/* ------------------------------------------------------------------
   Game — Mudkip Snap's shell: world canvas at an integer zoom, a pixel
   UI canvas on top, input routing (tap-to-move, drag-to-look, pinch,
   wheel, keys), game modes (explore / camera / dex / map / travel) and
   the frame pipeline.
------------------------------------------------------------------- */
const Game = (() => {
  const { clamp, lerp } = U;
  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.has('debug');
  const $ = (s) => document.querySelector(s);

  const G = {
    t: 0, rt: 0, mode: 'title', area: null, areaId: null, mudkip: null, mons: [], P: null, hourIdx: 1,
    cam: { x: 0, y: 0, lookX: 0, lookY: 0 }, zoom: 4, VW: 320, VH: 180, started: false, shakeA: 0,
    held: null, fps: 60, lowFx: false, items: [],
  };
  G.hour = () => Pal.HOURS[G.hourIdx];
  G.pal = () => G.P;

  /* ---------- canvases ---------- */
  const wrap = $('#game'), cv = $('#cv'), ui = $('#ui');
  const ctx = cv.getContext('2d', { alpha: false }), uctx = ui.getContext('2d');
  let fb = null, img = null, occ = null, idb = null, uimg = null, ufb = null, hb = null, rawb = null, pre = null;
  // HD pass: the world is drawn at the pixel-art resolution, then Pokémon are re-drawn at twice the
  // resolution on top (3D models rendered at 2× scale), so creatures look smooth and detailed
  G.hd = !qs.has('lowres');
  let dpr = 1, devW = 0, devH = 0, zBase = 4, US = 3;
  function layout() {
    dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    devW = Math.max(200, Math.round(r.width * dpr)); devH = Math.max(150, Math.round(r.height * dpr));
    const step = 1; // (the HD canvas is scaled by z/2; fine at any zoom on high-DPI screens)
    zBase = Math.max(step, Math.round(devH / 330 / step) * step);
    while ((devW / zBase) * (devH / zBase) > 300000) zBase += step;
    G.zStep = step;
    if (!G.zoomSet) { G.zoom = zBase; G.zoomSet = true; }
    G.zMin = Math.max(step, zBase - step); G.zMax = zBase + 2 * step;
    G.zoom = clamp(Math.round(G.zoom / step) * step, G.zMin, G.zMax);
    const z = G.zoom;
    G.VW = Math.ceil(devW / z); G.VH = Math.ceil(devH / z);
    const HK = G.hd ? 2 : 1;
    cv.width = G.VW * HK; cv.height = G.VH * HK;
    cv.style.width = (G.VW * z) / dpr + 'px'; cv.style.height = (G.VH * z) / dpr + 'px';
    img = ctx.createImageData(G.VW * HK, G.VH * HK);
    fb = new PX.Buf(G.VW, G.VH);
    if (G.hd) { hb = new Uint32Array(img.data.buffer); pre = new Uint32Array(G.VW * G.VH); } else fb.d = new Uint32Array(img.data.buffer);
    occ = new Uint8Array(G.VW * G.VH); idb = new Uint16Array(G.VW * G.VH); rawb = new Uint32Array(G.VW * G.VH);
    Stage.S.occ = occ; Stage.S.idb = idb; Stage.S.rawb = rawb;
    // UI canvas: its own integer scale so the device art stays crisp
    US = Math.max(2, Math.round(devH / 340));
    if (devW / US < 360) US = Math.max(1, Math.floor(devW / 360));
    G.UW = Math.ceil(devW / US); G.UH = Math.ceil(devH / US); G.US = US;
    ui.width = G.UW; ui.height = G.UH;
    ui.style.width = (G.UW * US) / dpr + 'px'; ui.style.height = (G.UH * US) / dpr + 'px';
    uimg = uctx.createImageData(G.UW, G.UH);
    ufb = new PX.Buf(G.UW, G.UH); ufb.d = new Uint32Array(uimg.data.buffer);
    G.ufb = ufb;
    clampCam();
  }
  function setZoom(nz, sx = devW / 2, sy = devH / 2) {
    if (G.zStep > 1) nz = G.zoom + Math.sign(nz - G.zoom) * G.zStep;
    nz = clamp(nz, G.zMin, G.zMax);
    if (nz === G.zoom) return;
    const oz = G.zoom, wx = G.cam.x + sx / oz, wy = G.cam.y + sy / oz;
    G.zoom = nz; layout();
    G.cam.x = wx - sx / nz; G.cam.y = wy - sy / nz; clampCam();
    cv.style.transition = 'none'; cv.style.transformOrigin = `${sx / dpr}px ${sy / dpr}px`; cv.style.transform = `scale(${oz / nz})`;
    void cv.offsetWidth;
    cv.style.transition = 'transform 180ms cubic-bezier(.2,.8,.3,1)'; cv.style.transform = 'scale(1)';
  }
  G.setZoom = setZoom;
  function clampCam() {
    const A = G.area, c = G.cam;
    if (!A) return;
    c.x = G.VW >= A.W ? (A.W - G.VW) / 2 : clamp(c.x, 0, A.W - G.VW);
    const y0 = A.camY ? A.camY[0] : -100, y1 = A.camY ? A.camY[1] : A.H - G.VH;
    c.y = clamp(c.y, y0, Math.max(y0, y1 - G.VH));
  }
  G.clampCam = clampCam;

  /* ---------- sound helper ---------- */
  function sfx(name, x = null, vol = 1) {
    if (!Sound.on) return;
    let pan = 0, v = vol;
    if (x !== null && x !== undefined) {
      const mid = G.cam.x + G.VW / 2, d = (x - mid) / (G.VW * 0.5);
      pan = clamp(d * 0.7, -0.9, 0.9); v = vol / (1 + Math.max(0, Math.abs(d) - 1) * 1.6);
    }
    if (SFX[name]) SFX[name](pan, v); else Sound.play(name, pan, v);
  }
  G.sfx = sfx;
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  G.shake = (a) => { if (!calm) G.shakeA = Math.max(G.shakeA, a); };

  /* ---------- time of day ---------- */
  function setHour(i, instant = false) {
    G.hourIdx = (i + Pal.HOURS.length) % Pal.HOURS.length;
    G.P = Times.compile(G.hour());
    Critters.setShadowColor(G.P.shadowTint);
    Sound.setHour(G.hour());
    Stage.setHour(G.hour(), instant);
    U.emit('hour', G.hour());
  }
  G.setHour = setHour;
  G.nextHour = () => { setHour(G.hourIdx + 1); sfx('timewave', null, 0.6); G.hourT = 0; };
  // the player may only bend time once they have met Dialga; otherwise time flows by itself
  G.canTime = () => Save.found('dialga.met') || qs.has('debug');
  G.tryTime = () => {
    if (G.canTime()) { G.nextHour(); HUD.toast(G.hour()[0].toUpperCase() + G.hour().slice(1), { life: 1.4 }); return true; }
    sfx('error'); HUD.toast('Time will not budge... Only the Pokémon that rules time could change it. (Something hums under a rock on the beach.)', { life: 3.4 });
    return false;
  };
  G.hourT = 0; G.HOUR_LEN = 180;

  /* ---------- areas ---------- */
  function enterArea(id, o = {}) {
    const def = Areas[id];
    if (!def) return;
    Mons.all.length = 0;
    FX.list.length = 0;
    G.items.length = 0;
    const A = Stage.load(def);
    G.area = A; G.areaId = id;
    G.mons = [];
    const sx = o.x ?? A.start ?? 200;
    G.mudkip = new Player.MudkipP(sx);
    G.mudkip.setLook(Save.look());
    G.mons.push(G.mudkip);
    if (def.spawn) def.spawn(A, G);
    if (def.weather) Weather.set(def.weather(G.hour()), true); else Weather.set({ rain: 0, fog: 0 }, true);
    Stage.setHour(G.hour(), true);
    G.cam.x = G.mudkip.x - G.VW * 0.45; G.cam.y = G.mudkip.y - G.VH * (A.frameY ?? 0.7); clampCam();
    Save.visit(id);
    Music.areaTrack(def.music);
    U.emit('area', id);
    HUD.banner(def.name, def.sub || '');
  }
  G.enterArea = enterArea;
  G.addMon = (m) => { G.mons.push(m); return m; };

  /* ---------- update ---------- */
  function updateCamera(dt) {
    const c = G.cam, mk = G.mudkip;
    if (!mk) return;
    if (G.mode === 'camera') { Photo.updateCam(dt); return; }
    const lead = mk.moving ? Math.cos(mk.yaw) * 36 : 0;
    // cinematic framing: lean toward a rare moment happening nearby, drift gently when idle
    let fx = 0, fy = 0;
    let best = null, bd = 260;
    for (const m of G.mons) {
      if (m === mk || !m.alive || !m.visible || m.peak < 0.75 || m.hideK > 0.5) continue;
      const d = DexData.S[m.dex], tier = d && d.beh[m.act.id] ? d.beh[m.act.id].tier : 1;
      if (tier < 3) continue;
      const dd = Math.hypot(m.x - mk.x, m.y - mk.y);
      if (dd < bd) { bd = dd; best = m; }
    }
    if (best) { fx = (best.x - mk.x) * 0.4; fy = (best.y - 20 - mk.y) * 0.3; }
    if ((mk.idleT || 0) > 4) { fx += Math.sin(G.rt * 0.25) * 14; fy += Math.sin(G.rt * 0.19) * 6; }
    G.camF = G.camF || { x: 0, y: 0 };
    const kf = 1 - Math.exp(-dt * 1.2);
    G.camF.x += (fx - G.camF.x) * kf; G.camF.y += (fy - G.camF.y) * kf;
    const tx = mk.x - G.VW * 0.5 + lead + c.lookX + G.camF.x, ty = mk.y - G.VH * (mk.inWater ? 0.5 : (G.area.frameY ?? 0.7)) + c.lookY + G.camF.y;
    const k = 1 - Math.exp(-dt * 3.2);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    if (!drag) { c.lookX *= Math.exp(-dt * 1.2); c.lookY *= Math.exp(-dt * 1.2); }
    clampCam();
  }
  function update(dt) {
    G.rt += dt;
    if (G.mode === 'dex' || G.mode === 'map') { if (G.mode === 'dex') Dex.update(dt); if (G.mode === 'map') WorldMap.update(dt); HUD.update(dt); Music.update(dt); return; }
    G.t += dt;
    const t = G.t;
    G.hourT += dt; if (G.hourT > G.HOUR_LEN) G.nextHour();
    if (G.lureT > 0) { G.lureT -= dt; if (G.lureT <= 0) HUD.toast('The Sweet Lure has worn off.', { life: 2 }); }
    Wind.update(dt); Ripples.step(dt);
    Stage.update(dt, t);
    Weather.update(dt, t);
    Items.update(dt, t);
    for (const m of G.mons) if (m.alive) m.update(dt, t);
    G.mons = G.mons.filter((m) => m.alive);
    if (G.area.def.update) G.area.def.update(G.area, dt, t, G);
    FX.update(dt);
    updateCamera(dt);
    G.shakeA = Math.max(0, G.shakeA - dt * 6);
    Photo.update(dt, t);
    HUD.update(dt);
    Music.update(dt);
    Quests.tick(dt);
    // muffle the ambience underwater
    Sound.setUnder(G.mudkip && G.mudkip.inWater && G.cam.y + G.VH * 0.5 > World.SEA + 30 ? 1 : 0);
  }

  /* ---------- render ---------- */
  const prof = {}; let pt = 0;
  const mark = DEBUG ? (k) => { const n = performance.now(); prof[k] = (prof[k] || 0) * 0.9 + (n - pt) * 0.1; pt = n; } : () => {};
  G.prof = prof;
  function onScreen(m, cx, cy, pad) { return m.x + m.SW > cx - pad && m.x - m.SW < cx + G.VW + pad && m.y + m.SH > cy - pad && m.y - m.SH < cy + G.VH + pad; }
  // draws the world into fb (used for the screen and for photos)
  function drawWorld(cx, cy, t, o = {}) {
    const A = G.area, P = G.P;
    pt = performance.now();
    occ.fill(0);
    Stage.S.idOn = true;
    idb.fill(0);
    if (!o.ids) { let n = 1; for (const m of G.mons) m.pid = m === G.mudkip ? 999 : n++; }
    if (A.def.drawBack) A.def.drawBack(A, fb, cx, cy, t); else { Stage.drawSky(fb, cx, cy, t); Stage.drawLayers(fb, cx, cy, t); }
    mark('back');
    const dof = G.mode === 'camera' ? Photo.dof() : null;
    if (dof && dof.back > 0) Stage.blurFrame(fb, dof.back);
    for (const m of G.mons) if (m.visible && m.alive && (m.always || onScreen(m, cx, cy, 160))) m.sprite(P);
    mark('sprites');
    for (const m of G.mons) if (m.layer === 'far' && m.visible && m.alive) m.draw(fb, cx, cy, occ);
    Stage.drawTerrain(fb, cx, cy, t);
    if (A.def.drawLane) A.def.drawLane(A, fb, cx, cy, t);
    Stage.drawProps(fb, cx, cy, t, false);
    mark('terrain');
    // contact shadows
    for (const m of G.mons) {
      if (!m.visible || !m.alive || m.layer === 'far' || m.mode === 'swim' || m.hideK > 0.9 || m.noShadow) continue;
      const base = m.plat ? World.platY(m.plat, m.x) : World.groundAt(m.x);
      const h = base - (m.y - m.zd);
      if (h > 160 || h < -4) continue;
      Critters.shadow(fb, cx, cy, m.x, base + 1 + m.zd, m.width() * 0.36 * (1 - h / 400), 2.6, 0.85 * (1 - h / 160));
    }
    Items.drawBack(fb, cx, cy, t);
    const mids = G.mons.filter((m) => !m.layer && m.visible && m.alive).sort((a, b) => (a.zd - b.zd) || (a.z - b.z));
    for (const m of mids) { m.draw(fb, cx, cy, occ); if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ); }
    Items.draw(fb, cx, cy, t);
    if (!o.ids) drawPin(fb, cx, cy);
    Stage.drawProps(fb, cx, cy, t, true);
    Stage.drawLate(fb, cx, cy, t);
    if (A.def.drawFront) A.def.drawFront(A, fb, cx, cy, t);
    // big creatures nearer than the lane's front props (e.g. Milotic in front of the bridge)
    for (const m of G.mons) if (m.layer === 'near' && m.visible && m.alive) { m.draw(fb, cx, cy, occ); if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ); }
    mark('scene');
    Stage.drawWater(fb, cx, cy, t);
    mark('water');
    FX.draw(fb, cx, cy, 1, t); FX.draw(fb, cx, cy, 2, t);
    Weather.draw(fb, cx, cy, t);
    FX.draw(fb, cx, cy, 3, t);
    Stage.drawGlows(fb, cx, cy, t);
    Stage.drawFore(fb, cx, cy, t, dof ? dof.fore : 1);
    FX.draw(fb, cx, cy, 4, t);
    if (!G.lowFx) Stage.bloom(fb, G.hour() === 'night' ? 0.9 : 0.4, G.hour() === 'night' ? 150 : 222);
    if (A.def.post) A.def.post(A, fb, cx, cy, t);
    Stage.vignette(fb, 0.25);
    mark('post');
  }
  G.drawWorld = drawWorld;
  G.fb = () => fb; G.idb = () => idb; G.occ = () => occ;
  function render() {
    if (G.area) {
      const sh = G.shakeA > 0 ? G.shakeA : 0;
      const cx = Math.round(G.cam.x + (sh ? (Math.random() - 0.5) * sh * 2 : 0)), cy = Math.round(G.cam.y + (sh ? (Math.random() - 0.5) * sh * 2 : 0));
      G.cx = cx; G.cy = cy;
      if (G.mode !== 'dex' && G.mode !== 'map' || !G.frozenFrame) {
        drawWorld(cx, cy, G.t);
        if (G.hd) pre.set(fb.d);
        if (G.mode === 'camera') Photo.drawLens(fb, G.t);
        if (G.hd) composeHD(cx, cy);
        if (G.mode === 'dex' || G.mode === 'map') G.frozenFrame = true;
      }
      ctx.putImageData(img, 0, 0);
    }
    if (G.mode !== 'dex' && G.mode !== 'map') G.frozenFrame = false;
    // UI
    ufb.d.fill(0);
    HUD.draw(ufb, G.rt);
    uctx.putImageData(uimg, 0, 0);
    mark('put');
  }

  // upscale the pixel-art frame 2× and re-draw every visible Pokémon from its 2× sprite, keeping the
  // low-res frame's occlusion (idb) and all later colour changes (water tint, fog, light, bloom) via
  // a per-pixel colour ratio between the final frame and the raw sprite colour
  function composeHD(cx, cy) {
    const W = fb.w, H = fb.h, d = fb.d, W2 = W * 2;
    for (let y = 0; y < H; y++) {
      const r0 = y * W, o0 = y * 2 * W2;
      for (let x = 0; x < W; x++) { const c = d[r0 + x], o = o0 + x * 2; hb[o] = c; hb[o + 1] = c; hb[o + W2] = c; hb[o + W2 + 1] = c; }
    }
    const P = G.P;
    for (const m of G.mons) {
      if (!m.visible || !m.alive || !m.spr || m.hideK >= 0.999 || !m.pid || m.layer === 'sea') continue;
      if (m.x + m.SW < cx - 20 || m.x - m.SW > cx + W + 20) continue;
      const h2 = m.sprite2(P);
      if (!h2) continue;
      const s = h2.s, pid = m.pid;
      const bury2 = m.bury ? Math.round(s.h * m.bury) : 0;
      const X0 = m.flip ? Math.round(m.x) * 2 + h2.OX - s.x0 - s.w + 1 - cx * 2 : Math.round(m.x) * 2 - h2.OX + s.x0 - cx * 2;
      const Y0 = Math.round(m.y) * 2 - h2.OY + s.y0 - cy * 2 + bury2;
      const tint = m.tint || 0, tk = m.tintK || 0;
      for (let sy = 0; sy < s.h; sy++) {
        const Y = Y0 + sy; if (Y < 0 || Y >= H * 2) continue;
        const ly = Y >> 1, row = sy * s.w;
        for (let sx = 0; sx < s.w; sx++) {
          let c = s.d[row + (m.flip ? s.w - 1 - sx : sx)]; if (!c) continue;
          const X = X0 + sx; if (X < 0 || X >= W2) continue;
          const li = ly * W + (X >> 1);
          if (idb[li] !== pid || d[li] !== pre[li]) continue;
          const raw = rawb[li], fin = d[li];
          if (tk) c = U.mix(c, tint, tk);
          let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
          if (raw !== fin) {
            const rr = raw & 255, rg = (raw >>> 8) & 255, rb = (raw >>> 16) & 255;
            // colour transform raw → final: scale plus offset (handles tints that brighten dark pixels)
            r = r + ((fin & 255) - rr); g = g + (((fin >>> 8) & 255) - rg); b = b + (((fin >>> 16) & 255) - rb);
            r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
          }
          hb[Y * W2 + X] = 0xff000000 | (b << 16) | (g << 8) | r;
        }
      }
    }
  }

  /* ---------- world taps ---------- */
  G.devToWorld = (x, y) => [G.cam.x + x / G.zoom, G.cam.y + y / G.zoom];
  G.hitsAt = (wx, wy, r = 10) => {
    const out = [];
    for (const m of G.mons) if (m !== G.mudkip && m.visible && m.alive && (m.hit(wx, wy, 3) || Math.hypot(m.x - wx, m.y - 12 - wy) < r)) out.push(m);
    for (const h of G.area.hot) if (!h.off && wx > h.x0 && wx < h.x1 && wy > h.y0 && wy < h.y1) out.push(h);
    return out;
  };
  function tapWorld(wx, wy) {
    const mk = G.mudkip, A = G.area;
    FX.add({ type: 'ring', x: wx, y: wy, r0: 1, r1: 6, life: 0.3, c: 0xffffffff, layer: 4 });
    // tools armed from the action bar
    if (HUD.armed) {
      const tool = HUD.armed; HUD.armed = null;
      if (tool === 'water') mk.doTask(mk.waterGun(wx, wy), 2);
      else if (tool === 'berry') { if (Save.useItem('berry')) mk.doTask(mk.throwBerry(wx, wy), 2); else HUD.toast('No berries left! Shake a berry bush.'); }
      return;
    }
    // tap Mudkip itself: a happy hop (or wake it from a nap)
    if (mk.hit(wx, wy, 3)) { mk.wakeUp(); if (mk.mode === 'land') mk.idleTask(mk.joyHop(1)); else if (mk.mode === 'swim') mk.idleTask(mk.surfaceSplash()); return; }
    // Pokémon / hotspots first
    const hits = G.hitsAt(wx, wy, 8);
    if (hits.length) {
      const h = hits[0];
      if (h instanceof Mons.Mon) {
        const side = mk.x < h.x ? -1 : 1;
        const reach = h.width() * 0.5 + 26;
        if (Math.abs(mk.x - h.x) < reach + 30 && (mk.mode === h.mode || h.mode !== 'swim')) { h.onPoke(mk); mk.happyT = 0.3; }
        else if (h.mode === 'swim' || h.mode === 'fly') { mk.goTo(targetFor(h.x + side * reach, h.y)); }
        else mk.goTo(Object.assign(targetFor(h.x + side * reach, h.y - 4), { then: () => { if (h.alive) { h.onPoke(mk); } } }));
        return;
      }
      if (h.tap) {
        const near = Math.abs(mk.x - (h.x ?? (h.x0 + h.x1) / 2)) < (h.reach ?? 40);
        if (near || h.remote) { h.tap(wx, wy); return; }
        const hx = h.x ?? (h.x0 + h.x1) / 2;
        mk.goTo(Object.assign(targetFor(hx + (mk.x < hx ? -(h.reach ?? 30) * 0.7 : (h.reach ?? 30) * 0.7), h.stand ?? wy), { then: () => h.tap(wx, wy) }));
        return;
      }
    }
    const tg = targetFor(wx, wy);
    mk.goTo(tg);
    G.pin = { x: tg.x, y: tg.y, t: 0, done: false, kind: tg.kind };
  }
  // the destination pin: drops in, bounces, fades when Mudkip arrives
  function drawPin(fb, cx, cy) {
    const p = G.pin; if (!p) return;
    p.t += 1 / 60;
    if (p.done || !G.mudkip.target) { p.fade = (p.fade || 0) + 0.08; if (p.fade >= 1) { G.pin = null; return; } }
    const fade = p.fade || 0;
    const drop = Math.max(0, 1 - p.t * 5), bob = Math.abs(Math.sin(p.t * 5)) * 3 * (1 - drop);
    const X = Math.round(p.x - cx), Y = Math.round(p.y - cy - 1 - drop * 30 - bob);
    const d = fb.d, W = fb.w, H = fb.h;
    const put = (x, y, c, a = 1) => { if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = a >= 1 && !fade ? c : U.mix(d[y * W + x], c, a * (1 - fade)); };
    // ground ring
    const gx = Math.round(p.x - cx), gy = Math.round(p.y - cy);
    const rr = 4 + (1 - drop) * 2 + Math.sin(p.t * 5) * 0.8;
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; put(Math.round(gx + Math.cos(t) * rr), Math.round(gy + Math.sin(t) * rr * 0.35), 0xffffffff, 0.7); }
    // pin: red head with a white glint and a dark outline, thin stem
    const col = p.kind === 'swim' ? 0xffe8a02f : 0xff3a3ae8;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const r = x * x + y * y; if (r <= 12) put(X + x, Y - 9 + y, r > 7 ? 0xff201018 : col); }
    put(X - 1, Y - 10, 0xffffffff); put(X, Y - 11, 0xffffffff);
    for (let y = -5; y <= 0; y++) put(X, Y + y, y === 0 ? 0xff201018 : 0xff5a5a6a);
  }
  // classify a tap: water (swim), a platform (dock/bridge) or plain ground
  function targetFor(wx, wy) {
    const lvl = World.waterAt(wx);
    const p = World.platAt(wx);
    if (p && Math.abs(wy - World.platY(p, wx)) < 26) return { kind: 'plat', x: wx, y: World.platY(p, wx), plat: p };
    if (lvl !== null) {
      const s = WorldRender.surfaceAt(wx, G.t);
      if (wy > s - 6) return { kind: 'swim', x: wx, y: clamp(wy, s + 12, World.groundAt(wx) - 10) };
      if (p) return { kind: 'plat', x: wx, y: World.platY(p, wx), plat: p };
      return { kind: 'swim', x: wx, y: s + 14 };
    }
    return { kind: 'walk', x: wx, y: World.groundAt(wx) };
  }
  G.targetFor = targetFor;

  /* ---------- input ---------- */
  const ptrs = new Map();
  let drag = null, pinch = null;
  const devXY = (e) => { const r = ui.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  ui.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init && Music.unlock();
    ui.setPointerCapture(e.pointerId);
    const [x, y] = devXY(e);
    ptrs.set(e.pointerId, { x, y });
    const ux = x / US, uy = y / US;
    if (ptrs.size === 1 && HUD.down(ux, uy, e.pointerId)) { ptrs.get(e.pointerId).ui = true; return; }
    if (G.mode === 'dex') { Dex.down(ux, uy); ptrs.get(e.pointerId).ui = true; return; }
    if (G.mode === 'map') { ptrs.get(e.pointerId).ui = true; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), m0: WorldMap.dist }; } return; }
    if (G.mode === 'title') return;
    if (ptrs.size === 1) drag = { x0: x, y0: y, lx: G.cam.lookX, ly: G.cam.lookY, moved: false, t0: performance.now() };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: Photo.zoom }; drag = null; }
  });
  ui.addEventListener('pointermove', (e) => {
    const [x, y] = devXY(e);
    if (!ptrs.has(e.pointerId)) { HUD.hover(x / US, y / US); return; }
    const p = ptrs.get(e.pointerId);
    p.x = x; p.y = y;
    if (p.ui) { if (G.mode === 'dex') Dex.move(x / US, y / US); else HUD.move(x / US, y / US, e.pointerId); return; }
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), k = d / pinch.d0;
      if (G.mode === 'map') { WorldMap.dist = U.clamp(pinch.m0 / k, 0.55, 1.6); return; }
      if (G.mode === 'camera') Photo.setZoom(pinch.z0 * k);
      else if (k > 1.3) { setZoom(G.zoom + 1); pinch.d0 = d; } else if (k < 0.77) { setZoom(G.zoom - 1); pinch.d0 = d; }
      return;
    }
    if (!drag) return;
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 10 * dpr) drag.moved = true;
    if (drag.moved) {
      if (G.mode === 'camera') Photo.aimDrag(dx / G.zoom, dy / G.zoom, drag);
      else { G.cam.lookX = clamp(drag.lx - dx / G.zoom, -G.VW * 0.9, G.VW * 0.9); G.cam.lookY = clamp(drag.ly - dy / G.zoom, -G.VH * 0.8, G.VH * 0.8); }
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId);
    const [x, y] = devXY(e);
    ptrs.delete(e.pointerId);
    if (p.ui) { if (G.mode === 'dex') { if (e.type === 'pointercancel') Dex.cancel && Dex.cancel(); else Dex.up(x / US, y / US); } else HUD.up(x / US, y / US, e.pointerId); return; }
    if (pinch) { if (ptrs.size < 2) { pinch = null; drag = null; } return; }
    if (drag) {
      if (!drag.moved && e.type === 'pointerup') {
        const [wx, wy] = G.devToWorld(x, y);
        if (G.mode === 'camera') Photo.tapFocus(wx, wy); else if (G.mode === 'explore') tapWorld(wx, wy);
      } else if (drag.moved && G.mode === 'camera') Photo.aimEnd();
      drag = null;
    }
  };
  ui.addEventListener('pointerup', end);
  ui.addEventListener('pointercancel', end);
  let wheelAcc = 0;
  ui.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (G.mode === 'dex') { Dex.wheel(e.deltaY); return; }
    if (G.mode === 'map') { WorldMap.wheel(e.deltaY); return; }
    if (G.mode === 'camera') { Photo.setZoom(Photo.zoom * Math.exp(-e.deltaY * 0.0015)); return; }
    wheelAcc += e.deltaY;
    const [x, y] = devXY(e);
    if (wheelAcc > 90) { setZoom(G.zoom - 1, x, y); wheelAcc = 0; } else if (wheelAcc < -90) { setZoom(G.zoom + 1, x, y); wheelAcc = 0; }
  }, { passive: false });
  const keysDown = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (G.mode === 'title') { if (k === 'Enter' || k === ' ') { start(); e.preventDefault(); } return; }
    if (G.mode === 'dex') { Dex.key(k); e.preventDefault(); return; }
    if (G.mode === 'map') { WorldMap.key(k); e.preventDefault(); return; }
    keysDown.add(k);
    if (k === 'c') { G.mode === 'camera' ? Photo.close() : Photo.open(); }
    else if (k === ' ' || k === 'Enter') { if (G.mode === 'camera') Photo.shoot(); else Photo.open(); e.preventDefault(); }
    else if (k === 'p' || k === 'Tab') { Dex.open(); e.preventDefault(); }
    else if (k === 'm') WorldMap.open();
    else if (k === 'Escape') { if (G.mode === 'camera') Photo.close(); }
    else if (k === 't') G.tryTime();
    else if (k === '+' || k === '=') G.mode === 'camera' ? Photo.setZoom(Photo.zoom * 1.25) : setZoom(G.zoom + 1);
    else if (k === '-' || k === '_') G.mode === 'camera' ? Photo.setZoom(Photo.zoom / 1.25) : setZoom(G.zoom - 1);
    else if (k === '1') HUD.tool('water'); else if (k === '2') HUD.tool('song'); else if (k === '3') HUD.tool('berry'); else if (k === '4') HUD.tool('scan');
    keysMove();
  });
  window.addEventListener('keyup', (e) => { keysDown.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); keysMove(); });
  window.addEventListener('blur', () => { keysDown.clear(); keysMove(); });
  function keysMove() {
    const mk = G.mudkip; if (!mk) return;
    const L = keysDown.has('ArrowLeft') || keysDown.has('a'), R = keysDown.has('ArrowRight') || keysDown.has('d');
    const Up = keysDown.has('ArrowUp') || keysDown.has('w'), Dn = keysDown.has('ArrowDown') || keysDown.has('s');
    if (G.mode === 'camera') { Photo.keyAim((R ? 1 : 0) - (L ? 1 : 0), (Dn ? 1 : 0) - (Up ? 1 : 0)); return; }
    mk.keyDir = (R ? 1 : 0) - (L ? 1 : 0); mk.keyY = (Dn ? 1 : 0) - (Up ? 1 : 0);
    mk.sneak = keysDown.has('Shift');
  }

  /* ---------- start ---------- */
  function start() {
    if (G.started) return;
    G.started = true;
    Music.unlock();
    const want = U.store.get('mk-snap-sound', true);
    Sound.set(!!want);
    Music.onSound(Sound.on);
    G.mode = 'explore';
    const st = $('#start'); if (st) { st.classList.add('open'); setTimeout(() => { st.hidden = true; }, 650); }
    sfx('chime', null, 0.7);
    HUD.banner(G.area.def.name, G.area.def.sub || '');
    Quests.onStart();
  }
  G.start = start;

  /* ---------- loop ---------- */
  let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    Critters.Budget.reset(G.started ? 9 : 30);
    try { update(dt); render(); } catch (e) { console.error(e); }
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) {
      G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      // adaptive quality: drop bloom when the device struggles
      if (G.fps < 38) { slow++; if (slow > 2) G.lowFx = true; } else slow = Math.max(0, slow - 1);
      if (DEBUG) { const el = $('#dbg'); if (el) el.textContent = G.fps.toFixed(0) + ' fps ' + G.VW + 'x' + G.VH + ' z' + G.zoom + ' ' + JSON.stringify(Critters.cacheStats()) + ' ' + Object.entries(prof).map(([k, v]) => k + ':' + v.toFixed(1)).join(' '); }
    }
    requestAnimationFrame(frame);
  }

  // phone back button / swipe-back closes the Pokédex or the map
  window.addEventListener('popstate', () => { if (G.mode === 'dex') Dex.close(); else if (G.mode === 'map') WorldMap.close(); else if (G.mode === 'camera') Photo.close(); });
  G.pushBack = () => { try { history.pushState({ snap: 1 }, ''); } catch (e) { /* sandboxed */ } };
  function boot() {
    const wk = document.getElementById('wk-src');
    if (wk && !qs.has('noworker')) Critters.Pool.init(wk.textContent);
    Save.load();
    if (qs.get('unlock') === 'all') for (const id of Object.keys(Areas)) Save.unlock(id);
    layout();
    window.addEventListener('resize', layout);
    setHour(qs.has('time') ? Math.max(0, Pal.HOURS.indexOf(qs.get('time'))) : 1, true);
    const startArea = qs.get('area') || Save.data.lastArea || 'beach';
    enterArea(Areas[startArea] && Save.unlocked(startArea) ? startArea : 'beach');
    if (qs.has('x')) { G.mudkip.x = +qs.get('x'); G.mudkip.y = World.groundAt(G.mudkip.x); G.cam.x = G.mudkip.x - G.VW / 2; }
    if (qs.has('swim')) { G.mudkip.mode = 'swim'; G.mudkip.y = +qs.get('swim'); }
    const sb = $('#b-start');
    if (sb) sb.addEventListener('click', (e) => { e.stopPropagation(); start(); });
    const st = $('#start'); if (st) st.addEventListener('click', start);
    if (qs.has('autostart')) { start(); }
    if (DEBUG) { const d = document.createElement('div'); d.id = 'dbg'; wrap.appendChild(d); }
    if (qs.has('mode')) { const m = qs.get('mode'); setTimeout(() => { if (m === 'camera') Photo.open(); if (m === 'dex') Dex.open(); if (m === 'map') WorldMap.open(); }, 50); }
    requestAnimationFrame(frame);
  }
  G.boot = boot;
  G.layout = layout;
  return G;
})();
