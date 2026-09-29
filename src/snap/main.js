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
  Critters.HDS.on = G.hd;
  let dpr = 1, devW = 0, devH = 0, zBase = 4, US = 3;
  function layout() {
    dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    devW = Math.max(200, Math.round(r.width * dpr)); devH = Math.max(150, Math.round(r.height * dpr));
    const step = 1; // (the HD canvas is scaled by z/2; fine at any zoom on high-DPI screens)
    // close camera: about 205 world pixels tall, so Mudkip and the Pokémon fill the screen
    // (portrait phones: keep at least ~190 world pixels across)
    zBase = Math.max(step, Math.min(Math.round(devH / 205 / step) * step, Math.floor(devW / 190)));
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
    // never look down into the ground: the bottom edge stays just below the deepest ground in view
    let gmax = -1e9;
    for (let x = c.x; x <= c.x + G.VW; x += 16) { const g = World.groundAt(x); if (g > gmax) gmax = g; }
    if (gmax > -1e9) c.y = Math.min(c.y, Math.max(y0, gmax + (A.floorPeek ?? 40) - G.VH));
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
    G.cam.x = G.mudkip.x - G.VW * 0.45; G.cam.y = G.mudkip.y - G.VH * (A.frameY ?? 0.76); clampCam();
    if (G.started && !o.noIntro) G.cine.intro();
    Save.visit(id);
    Music.areaTrack(def.music);
    U.emit('area', id);
    HUD.banner(def.name, def.sub || '');
  }
  G.enterArea = enterArea;
  G.addMon = (m) => { G.mons.push(m); return m; };

  /* ---------- update ---------- */
  /* ---------- camera director: establishing pans, event pans, smooth zoom punches ---------- */
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  G.cine = {
    shot: null, zk: 1, zGoal: 1,
    // sweep in from a landmark (or from high above and ahead) down to Mudkip
    intro() {
      const A = G.area, mk = G.mudkip; if (!A || !mk) return;
      const it = A.def.intro || {};
      const fx = it.x ?? clamp(mk.x + (mk.x < A.W / 2 ? 1 : -1) * G.VW * 1.1, G.VW / 2, A.W - G.VW / 2), fy = it.y ?? mk.y - G.VH * 0.55;
      this.shot = { kind: 'intro', t: 0, dur: it.dur ?? 3.2, fromX: fx - G.VW / 2, fromY: fy - G.VH / 2, zoom: 1.12 };
      G.cam.x = this.shot.fromX; G.cam.y = this.shot.fromY; clampCam();
    },
    // pan to a world point, hold, then glide back to Mudkip
    pan(x, y, o = {}) {
      if (G.mode !== 'explore') return;
      this.shot = { kind: 'pan', t: 0, dur: o.dur ?? 1.1, hold: o.hold ?? 2.2, toX: x - G.VW / 2, toY: y - G.VH * (o.frame ?? 0.55), fromX: G.cam.x, fromY: G.cam.y, zoom: o.zoom ?? 1.12 };
    },
    skip() { if (this.shot && this.shot.kind === 'intro') this.shot.t = Math.max(this.shot.t, this.shot.dur * 0.8); },
    update(dt) {
      const sh = this.shot;
      this.zGoal = 1;
      if (sh) {
        sh.t += dt;
        const c = G.cam;
        if (sh.kind === 'intro') {
          const k = ease(Math.min(1, sh.t / sh.dur));
          const mk = G.mudkip, tx = mk.x - G.VW * 0.5, ty = mk.y - G.VH * (G.area.frameY ?? 0.76);
          c.x = lerp(sh.fromX, tx, k); c.y = lerp(sh.fromY, ty, k); clampCam();
          this.zGoal = lerp(sh.zoom, 1, k);
          if (sh.t >= sh.dur) this.shot = null;
          return true;
        }
        if (sh.kind === 'pan') {
          const k = ease(Math.min(1, sh.t / sh.dur));
          c.x = lerp(sh.fromX, sh.toX, k); c.y = lerp(sh.fromY, sh.toY, k); clampCam();
          this.zGoal = lerp(1, sh.zoom, k);
          if (sh.t > sh.dur + sh.hold) this.shot = null;
          return true;
        }
      }
      return false;
    },
  };
  // smooth CSS zoom around the screen centre (used by the director; integer zoom steps stay crisp)
  function applyCineZoom(dt) {
    const C = G.cine;
    C.zk += (C.zGoal - C.zk) * Math.min(1, dt * 2.5);
    if (Math.abs(C.zk - 1) < 0.002 && C.zGoal === 1) { if (C.zOn) { cv.style.transform = ''; C.zOn = false; } return; }
    C.zOn = true;
    cv.style.transition = 'none'; cv.style.transformOrigin = '50% 55%'; cv.style.transform = `scale(${C.zk.toFixed(4)})`;
  }
  function updateCamera(dt) {
    const c = G.cam, mk = G.mudkip;
    if (!mk) return;
    if (G.mode === 'camera') { G.cine.shot = null; G.cine.zGoal = 1; applyCineZoom(dt); Photo.updateCam(dt); return; }
    // a game or cutscene framing a spot in the world
    if (G.camFocus) {
      const f = G.camFocus; G.cine.shot = null; G.cine.zGoal = f.zoom || 1.2; applyCineZoom(dt);
      const k = 1 - Math.exp(-dt * (f.speed || 2.5));
      c.x += (f.x - G.VW * 0.5 - c.x) * k; c.y += (f.y - G.VH * 0.55 - c.y) * k; clampCam();
      return;
    }
    if (G.cine.update(dt)) { applyCineZoom(dt); return; }
    applyCineZoom(dt);
    const lead = mk.moving ? Math.cos(mk.yaw) * (36 + clamp((Math.abs(mk.vx || 0) - 90) / 40, 0, 1) * 34) : 0;
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
    const tx = mk.x - G.VW * 0.5 + lead + c.lookX + G.camF.x, ty = mk.y - G.VH * (mk.inWater ? 0.5 : (G.area.frameY ?? 0.76)) + c.lookY + G.camF.y;
    const k = 1 - Math.exp(-dt * 3.2);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    if (!drag) { c.lookX *= Math.exp(-dt * 1.2); c.lookY *= Math.exp(-dt * 1.2); }
    clampCam();
  }
  const SCREEN = () => ({ rhythm: typeof Rhythm !== 'undefined' ? Rhythm : null, bag: typeof Bag !== 'undefined' ? Bag : null, style: typeof Style !== 'undefined' ? Style : null, memory: typeof Memories !== 'undefined' ? Memories : null })[G.mode] || null;
  G.frozenMode = () => G.mode === 'dex' || G.mode === 'map' || G.mode === 'bag' || G.mode === 'style' || G.mode === 'memory' || G.mode === 'rhythm';
  function update(dt) {
    G.rt += dt;
    if (typeof Talk !== 'undefined') Talk.update(dt);
    if (G.mode === 'dex' || G.mode === 'map') { if (G.mode === 'dex') Dex.update(dt); if (G.mode === 'map') WorldMap.update(dt); HUD.update(dt); Music.update(dt); return; }
    const scr = SCREEN();
    if (scr) { scr.update(dt); HUD.update(dt); Music.update(dt); return; }
    if (typeof Moves !== 'undefined') Moves.update(dt);
    if (typeof Pad !== 'undefined') Pad.apply(G.mudkip, dt);
    // a Memory waiting to play (after a big discovery)
    if (typeof Memories !== 'undefined' && Memories.queue.length && G.mode === 'explore') Memories.update(0);
    // the move wheel slows time right down while you choose
    if (typeof Moves !== 'undefined' && Moves.wheel) dt *= 0.2;
    G.t += dt;
    const t = G.t;
    G.hourT += dt; if (G.hourT > G.HOUR_LEN) G.nextHour();
    if (G.lureT > 0) { G.lureT -= dt; if (G.lureT <= 0) HUD.toast('The Sweet Lure has worn off.', { life: 2 }); }
    Wind.update(dt); Ripples.step(dt);
    Stage.update(dt, t);
    Weather.update(dt, t);
    if (typeof Seasons !== 'undefined') Seasons.update(dt, t);
    Items.update(dt, t);
    Player.Bubbles.update(dt);
    if (typeof Harvest !== 'undefined') Harvest.update(dt, t);
    for (const m of G.mons) if (m.alive) m.update(dt, t);
    if (typeof Social !== 'undefined') Social.update(dt, t);
    if (typeof Bite !== 'undefined' && !(typeof Arcade !== 'undefined' && Arcade.live)) Bite.update(dt);
    if (typeof Arcade !== 'undefined') Arcade.update(dt);
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
    if (typeof Harvest !== 'undefined') Harvest.drawFar(fb, cx, cy, t);
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
    if (typeof Arcade !== 'undefined' && Arcade.live) Arcade.drawWorld(fb, cx, cy, t, true);
    const mids = G.mons.filter((m) => !m.layer && m.visible && m.alive).sort((a, b) => (a.zd - b.zd) || (a.z - b.z));
    for (const m of mids) { m.draw(fb, cx, cy, occ); if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ); }
    if (typeof Accs !== 'undefined') Accs.draw(fb, cx, cy);
    if (typeof Arcade !== 'undefined' && Arcade.live) Arcade.drawWorld(fb, cx, cy, t, false);
    Items.draw(fb, cx, cy, t);
    if (typeof Harvest !== 'undefined') Harvest.draw(fb, cx, cy, t);
    if (typeof Toys !== 'undefined') { Toys.drawShells(fb, cx, cy, t); if (!o.ids) Toys.drawPrompts(fb, cx, cy, t); }
    if (!o.ids) drawPin(fb, cx, cy);
    Stage.drawProps(fb, cx, cy, t, true);
    Stage.drawLate(fb, cx, cy, t);
    if (A.def.drawFront) A.def.drawFront(A, fb, cx, cy, t);
    // big creatures nearer than the lane's front props (e.g. Milotic in front of the bridge)
    for (const m of G.mons) if (m.layer === 'near' && m.visible && m.alive) { m.draw(fb, cx, cy, occ); if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ); }
    // seabed life in front of everything under the water (tinted by the water pass)
    if (typeof Harvest !== 'undefined') Harvest.drawUnder(fb, cx, cy, t);
    mark('scene');
    Stage.drawWater(fb, cx, cy, t);
    Player.Bubbles.draw(fb, cx, cy);
    mark('water');
    FX.draw(fb, cx, cy, 1, t); FX.draw(fb, cx, cy, 2, t);
    Weather.draw(fb, cx, cy, t);
    if (typeof Seasons !== 'undefined') Seasons.draw(fb, cx, cy, t);
    FX.draw(fb, cx, cy, 3, t);
    Stage.drawGlows(fb, cx, cy, t);
    if (typeof Harvest !== 'undefined') Harvest.drawFore(fb, cx, cy, t);
    Stage.drawFore(fb, cx, cy, t, dof ? dof.fore : 1);
    FX.draw(fb, cx, cy, 4, t);
    if (typeof Shaders !== 'undefined') Shaders.apply(fb, cx, cy, t);
    if (!G.lowFx) Stage.bloom(fb, G.hour() === 'night' ? 0.9 : 0.4, G.hour() === 'night' ? 150 : 222);
    if (A.def.post) A.def.post(A, fb, cx, cy, t);
    if (typeof Shaders !== 'undefined') Shaders.grade(fb);
    Stage.vignette(fb, 0.25);
    mark('post');
  }
  G.drawWorld = drawWorld;
  G.fb = () => fb; G.idb = () => idb; G.occ = () => occ;
  // the current world frame composed at double resolution (for photos): { d, w, h } or null
  G.hdFrame = (cx, cy) => { if (!G.hd) return null; pre.set(fb.d); composeHD(cx, cy); return { d: hb, w: fb.w * 2, h: fb.h * 2 }; };
  function render() {
    if (G.area) {
      const sh = G.shakeA > 0 ? G.shakeA : 0;
      const cx = Math.round(G.cam.x + (sh ? (Math.random() - 0.5) * sh * 2 : 0)), cy = Math.round(G.cam.y + (sh ? (Math.random() - 0.5) * sh * 2 : 0));
      G.cx = cx; G.cy = cy;
      if (!G.frozenMode() || !G.frozenFrame) {
        drawWorld(cx, cy, G.t);
        if (G.hd) pre.set(fb.d);
        if (G.mode === 'camera') Photo.drawLens(fb, G.t);
        if (G.hd) composeHD(cx, cy);
        if (G.frozenMode()) G.frozenFrame = true;
      }
      ctx.putImageData(img, 0, 0);
    }
    if (!G.frozenMode()) G.frozenFrame = false;
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
    if (!hm || hm.length !== W2 * H * 2) hm = new Uint8Array(W2 * H * 2); else hm.fill(0);
    for (const m of G.mons) {
      if (!m.visible || !m.alive || !m.spr || m.hideK >= 0.999 || !m.pid || m.layer === 'sea') continue;
      if (m.x + m.SW < cx - 20 || m.x - m.SW > cx + W + 20) continue;
      const h2 = m.spr2;
      if (!h2 || m.noHD) continue;
      if (m.rot || m.jOn) { composeRot(m, h2, cx, cy, W, H, W2, d); continue; }
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
          hb[Y * W2 + X] = 0xff000000 | (b << 16) | (g << 8) | r; hm[Y * W2 + X] = 1;
        }
      }
    }
    outlineHD(W, H);
  }

  // a crisp dark outline round every Pokémon (drawn where the creature meets open background)
  let hm = null;
  const OUTL = U.hex('#1a1426');
  function outlineHD(W, H) {
    const W2 = W * 2, H2 = H * 2;
    for (let y = 1; y < H2 - 1; y++) {
      const row = y * W2;
      for (let x = 1; x < W2 - 1; x++) {
        const i = row + x;
        if (hm[i]) continue;
        if (!(hm[i - 1] === 1 || hm[i + 1] === 1 || hm[i - W2] === 1 || hm[i + W2] === 1)) continue;
        hb[i] = U.mix(hb[i], OUTL, 0.85); hm[i] = 2;
      }
    }
  }
  // the HD pass for a rotated creature: rotate its 2× sprite about the same centre as the 1× one
  function composeRot(m, h2, cx, cy, W, H, W2, d) {
    const s = h2.s, s1 = m.spr, pid = m.pid;
    const jx = m.jsx || 1, jy = m.jsy || 1;
    const px = (m.ox() - cx + s1.w / 2) * 2, py = (m.oy() - cy + s1.h / 2 + (m.rotY || 0) + (m.jy || 0) - (jy - 1) * s1.h / 2) * 2;
    const ca = Math.cos(m.rot || 0), sa = Math.sin(m.rot || 0), R = Math.ceil(Math.hypot(s.w, s.h) / 2 * Math.max(jx, jy)) + 2;
    const PX0 = Math.round(px), PY0 = Math.round(py), hw = s.w / 2, hh = s.h / 2;
    const tint = m.tint || 0, tk = m.tintK || 0;
    // (dx measured from pixel centres, like the 1× pass)
    for (let y = -R; y <= R; y++) {
      const Y = PY0 + y; if (Y < 0 || Y >= H * 2) continue;
      const ly = Y >> 1;
      for (let x = -R; x <= R; x++) {
        const X = PX0 + x; if (X < 0 || X >= W2) continue;
        const ex = X + 0 - PX0, ey = Y - PY0;
        const u = Math.floor((ex * ca + ey * sa) / jx + hw), v = Math.floor((-ex * sa + ey * ca) / jy + hh);
        if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue;
        let c = s.d[v * s.w + (m.flip ? s.w - 1 - u : u)]; if (!c) continue;
        const li = ly * W + (X >> 1);
        if (idb[li] !== pid || d[li] !== pre[li]) continue;
        const raw = rawb[li], fin = d[li];
        if (tk) c = U.mix(c, tint, tk);
        let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
        if (raw !== fin) {
          r += (fin & 255) - (raw & 255); g += ((fin >>> 8) & 255) - ((raw >>> 8) & 255); b += ((fin >>> 16) & 255) - ((raw >>> 16) & 255);
          r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
        }
        hb[Y * W2 + X] = 0xff000000 | (b << 16) | (g << 8) | r; hm[Y * W2 + X] = 1;
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
    if (G.cine.shot && G.cine.shot.kind === 'intro') { G.cine.skip(); }
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
        // quest givers talk; everyone else says something and reacts to the poke
        const poke = () => { if (!h.alive) return; if (!(typeof Talk !== 'undefined' && Talk.tryTalk(h))) h.onPoke(mk); };
        if (Math.abs(mk.x - h.x) < reach + 30 && (mk.mode === h.mode || h.mode !== 'swim')) { poke(); mk.happyT = 0.3; }
        else if (h.mode === 'swim' || h.mode === 'fly') { mk.goTo(targetFor(h.x + side * reach, h.y)); }
        else mk.goTo(Object.assign(targetFor(h.x + side * reach, h.y - 4), { then: poke }));
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
  // pointers not held by the on-screen pad (joystick / A / B)
  const freePtrs = () => [...ptrs.values()].filter((p) => !p.pad);
  ui.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init && Music.unlock();
    ui.setPointerCapture(e.pointerId);
    const [x, y] = devXY(e);
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    ptrs.set(e.pointerId, { x, y });
    const P0 = ptrs.get(e.pointerId);
    const ux = x / US, uy = y / US;
    // modal layers first: dialogue, the photo rating card, the move wheel
    if (typeof Talk !== 'undefined' && Talk.down(ux, uy)) { P0.ui = true; P0.sink = true; return; }
    if (Photo.cardDown && Photo.cardDown(ux, uy)) { P0.ui = true; P0.sink = true; return; }
    if (G.mode === 'explore' && typeof Arcade !== 'undefined' && Arcade.live && Arcade.down(ux, uy)) { P0.ui = true; P0.sink = true; return; }
    if (G.mode === 'explore' && typeof Moves !== 'undefined' && Moves.wheel) { Moves.tapWheel(ux, uy); P0.ui = true; P0.sink = true; return; }
    if (G.mode === 'explore' && typeof Pad !== 'undefined' && Pad.down(ux, uy, e.pointerId, touch)) { P0.pad = true; return; }
    if (freePtrs().length === 1 && HUD.down(ux, uy, e.pointerId)) { P0.ui = true; return; }
    if (G.mode === 'dex') { Dex.down(ux, uy); P0.ui = true; return; }
    if (G.mode === 'map') { P0.ui = true; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), m0: WorldMap.dist }; } return; }
    if (SCREEN() && SCREEN().down && (G.mode === 'rhythm' || G.mode === 'memory')) { SCREEN().down(ux, uy); P0.sink = true; return; }
    if (G.mode === 'title' || SCREEN()) { P0.ui = true; return; }
    const fp = freePtrs();
    if (fp.length === 1) drag = { x0: x, y0: y, lx: G.cam.lookX, ly: G.cam.lookY, moved: false, t0: performance.now(), pid: e.pointerId };
    else if (fp.length === 2) { const [a, b] = fp; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: Photo.zoom }; drag = null; }
  });
  ui.addEventListener('pointermove', (e) => {
    const [x, y] = devXY(e);
    if (!ptrs.has(e.pointerId)) { HUD.hover(x / US, y / US); return; }
    const p = ptrs.get(e.pointerId);
    p.x = x; p.y = y;
    if (p.pad) { Pad.move(x / US, y / US, e.pointerId); if (Moves.wheel && Pad.b && Pad.b.pid === e.pointerId) Moves.wheelPoint(x / US, y / US); return; }
    if (p.sink) return;
    if (p.ui) { if (G.mode === 'dex') Dex.move(x / US, y / US); else HUD.move(x / US, y / US, e.pointerId); return; }
    const fp = freePtrs();
    if (pinch && fp.length >= 2) {
      const [a, b] = fp;
      const d = Math.hypot(a.x - b.x, a.y - b.y), k = d / pinch.d0;
      if (G.mode === 'map') { WorldMap.dist = U.clamp(pinch.m0 / k, 0.55, 1.6); return; }
      if (G.mode === 'camera') Photo.setZoom(pinch.z0 * k);
      else if (k > 1.3) { setZoom(G.zoom + 1); pinch.d0 = d; } else if (k < 0.77) { setZoom(G.zoom - 1); pinch.d0 = d; }
      return;
    }
    if (!drag || drag.pid !== e.pointerId) return;
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
    if (p.pad) { Pad.up(e.pointerId); return; }
    if (p.sink) return;
    if (p.ui) { if (G.mode === 'dex') { if (e.type === 'pointercancel') Dex.cancel && Dex.cancel(); else Dex.up(x / US, y / US); } else HUD.up(x / US, y / US, e.pointerId); return; }
    if (pinch) { if (freePtrs().length < 2) { pinch = null; drag = null; } return; }
    if (drag && drag.pid === e.pointerId) {
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
    const scr = SCREEN(); if (scr) { scr.wheel && scr.wheel(e.deltaY); return; }
    if (G.mode === 'camera') { Photo.setZoom(Photo.zoom * Math.exp(-e.deltaY * 0.0015)); return; }
    wheelAcc += e.deltaY;
    const [x, y] = devXY(e);
    if (wheelAcc > 90) { setZoom(G.zoom - 1, x, y); wheelAcc = 0; } else if (wheelAcc < -90) { setZoom(G.zoom + 1, x, y); wheelAcc = 0; }
  }, { passive: false });
  const keysDown = new Set();
  const MOVE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (G.mode === 'title') { if (k === 'Enter' || k === ' ') { start(); e.preventDefault(); } return; }
    if (G.mode === 'dex') { Dex.key(k); e.preventDefault(); return; }
    if (G.mode === 'map') { WorldMap.key(k); e.preventDefault(); return; }
    const scr = SCREEN(); if (scr) { scr.key(k, e); e.preventDefault(); return; }
    if (typeof Talk !== 'undefined' && Talk.key(k, e)) { e.preventDefault(); return; }
    if (G.mode === 'explore' && typeof Arcade !== 'undefined' && Arcade.live && Arcade.key(k, e)) { e.preventDefault(); return; }
    if (Photo.cardKey && Photo.cardKey(k, e)) { e.preventDefault(); return; }
    if (typeof Moves !== 'undefined' && Moves.wheel && !e.repeat && Moves.wheelKey(k)) { e.preventDefault(); return; }
    const first = !keysDown.has(k);
    keysDown.add(k);
    const mk = G.mudkip;
    if (G.mode === 'camera') {
      if ((k === ' ' || k === 'Enter') && first) Photo.shutterDown ? Photo.shutterDown() : Photo.shoot();
      else if (k === 'c' || k === 'Escape') Photo.close();
      else if (k === '+' || k === '=') Photo.setZoom(Photo.zoom * 1.25);
      else if (k === '-' || k === '_') Photo.setZoom(Photo.zoom / 1.25);
      if (k === ' ' || k === 'Enter' || k.startsWith('Arrow')) e.preventDefault();
      keysMove();
      return;
    }
    if (G.mode !== 'explore') return;
    if (k === ' ') { if (first && mk) mk.jumpPress(); e.preventDefault(); }
    else if ((k === 'ArrowUp' || k === 'w') && first && mk && mk.mode !== 'swim') { mk.jumpPress(); e.preventDefault(); }
    else if (k === 'Enter' || k === 'c') Photo.open();
    else if (k === 'e' && first) { if (!Harvest.pick()) Moves.press(); }
    else if ((k === 'x' || k === 'j') && first) Moves.press();
    else if (k === 'q' && first) Moves.toggleWheel();
    else if (k === 'f' && first) HUD.throwBerry && HUD.throwBerry();
    else if (k === 'b' || k === 'i') Bag.open();
    else if (k === 'v') Style.open();
    else if (k === 'g') Rhythm.open(0);
    else if (k === 'h' && typeof Arcade !== 'undefined') Arcade.open();
    else if (k === 'p' || k === 'Tab') { Dex.open(); e.preventDefault(); }
    else if (k === 'm') WorldMap.open();
    else if (k === 't') G.tryTime();
    else if (k === 'n' && typeof Seasons !== 'undefined') Seasons.next();
    else if (k === '+' || k === '=') setZoom(G.zoom + 1);
    else if (k === '-' || k === '_') setZoom(G.zoom - 1);
    else if (MOVE_KEYS.includes(k) && first) { const m = Moves.LIST[+k - 1]; if (m) { Moves.select(Moves.LIST.indexOf(m)); if (Moves.has(m.id)) HUD.toast(m.name + ' ready', { life: 1, col: m.col }); } }
    if (k.startsWith('Arrow')) e.preventDefault();
    keysMove();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keysDown.delete(k);
    if ((k === 'x' || k === 'j' || (k === 'e' && Moves.pressing)) && G.mode === 'explore') Moves.release();
    if ((k === ' ' || k === 'Enter') && G.mode === 'camera' && Photo.shutterUp) Photo.shutterUp();
    keysMove();
  });
  window.addEventListener('blur', () => { keysDown.clear(); keysMove(); if (typeof Pad !== 'undefined') Pad.reset(); if (Photo.shutterUp) Photo.shutterUp(true); });
  function keysMove() {
    const mk = G.mudkip; if (!mk) return;
    const L = keysDown.has('ArrowLeft') || keysDown.has('a'), R = keysDown.has('ArrowRight') || keysDown.has('d');
    const Up = keysDown.has('ArrowUp') || keysDown.has('w'), Dn = keysDown.has('ArrowDown') || keysDown.has('s');
    if (G.mode === 'camera') { Photo.keyAim((R ? 1 : 0) - (L ? 1 : 0), (Dn ? 1 : 0) - (Up ? 1 : 0)); Pad.setKeys({ dx: 0, dy: 0, run: false, jump: false, sneak: false }); return; }
    if (Moves.wheel) { Pad.setKeys({ dx: 0, dy: 0, run: false, jump: false }); return; }
    Pad.setKeys({ dx: (R ? 1 : 0) - (L ? 1 : 0), dy: (Dn ? 1 : 0) - (Up ? 1 : 0), run: keysDown.has('Shift'), sneak: keysDown.has('z'), jump: keysDown.has(' ') || (Up && mk.mode !== 'swim') });
  }
  G.keysDown = keysDown;

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
    G.cine.intro();
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
    // touch screens show the joystick from the start
    try { if (typeof Pad !== 'undefined' && ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0)) Pad.touch = true; } catch (e) { /* ignore */ }
    const wk = document.getElementById('wk-src');
    if (wk && !qs.has('noworker')) Critters.Pool.init(wk.textContent);
    Save.load();
    if (typeof Seasons !== 'undefined') Seasons.init();
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
