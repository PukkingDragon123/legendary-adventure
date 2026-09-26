/* ------------------------------------------------------------------
   Game — shell: canvas + integer zoom, camera (drag, fling, pinch,
   wheel, keys, follow), the frame loop, poke dispatch and the
   icon-only HUD. No words anywhere except Dialga's "yo".
------------------------------------------------------------------- */
const Game = (() => {
  const { clamp, lerp } = Scenery;
  const $ = (s) => document.querySelector(s);
  const DEBUG = /[?&]debug/.test(location.search);
  const qs = new URLSearchParams(location.search);
  const SPEED = Math.max(1, Math.min(8, +(qs.get('speed') || 1)));

  const G = {
    t: 0, hourIdx: 1, P: null, mons: [], systems: [], ball: null, mudkip: null, school: null,
    cam: { x: 300, y: 200, vx: 0, vy: 0 }, zoom: 3, follow: true, lock: 0, shakeA: 0, started: false, paused: false,
    VW: 320, VH: 180,
  };
  G.hour = () => Times.ORDER[G.hourIdx];
  G.pal = () => G.P;

  /* ---------- canvas & zoom ---------- */
  const wrap = $('#game');
  const cv = $('#cv');
  const ctx = cv.getContext('2d', { alpha: false });
  let fb = null, occ = null, img = null, dpr = 1, devW = 0, devH = 0, zMin = 2, zMax = 6;
  const MAXPIX = 640000;
  function layout() {
    dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    devW = Math.max(160, Math.round(r.width * dpr)); devH = Math.max(120, Math.round(r.height * dpr));
    zMin = 1;
    while ((devW / zMin) * (devH / zMin) > MAXPIX && !qs.has('zmin')) zMin++;
    G.zMin = zMin;
    zMax = zMin + 4;
    if (!G.zoomSet) { G.zoom = clamp(Math.round(devH / 460), zMin, zMin + 1); G.zoomSet = true; }
    G.zoom = clamp(G.zoom, zMin, zMax);
    const z = G.zoom;
    G.VW = Math.ceil(devW / z); G.VH = Math.ceil(devH / z);
    cv.width = G.VW; cv.height = G.VH;
    cv.style.width = (G.VW * z) / dpr + 'px'; cv.style.height = (G.VH * z) / dpr + 'px';
    img = ctx.createImageData(G.VW, G.VH);
    fb = new PX.Buf(G.VW, G.VH);
    fb.d = new Uint32Array(img.data.buffer);
    occ = new Uint8Array(G.VW * G.VH);
    clampCam();
    updateZoomUI();
  }
  function setZoom(nz, sx = devW / 2, sy = devH / 2) {
    nz = clamp(nz, zMin, zMax);
    if (nz === G.zoom) return;
    const oz = G.zoom;
    const wx = G.cam.x + sx / oz, wy = G.cam.y + sy / oz;
    G.zoom = nz;
    layout();
    G.cam.x = wx - sx / nz; G.cam.y = wy - sy / nz;
    clampCam();
    // smooth the jump: start the new frame scaled like the old one
    cv.style.transition = 'none';
    cv.style.transformOrigin = `${sx / dpr}px ${sy / dpr}px`;
    cv.style.transform = `scale(${oz / nz})`;
    void cv.offsetWidth;
    cv.style.transition = 'transform 180ms cubic-bezier(.2,.8,.3,1)';
    cv.style.transform = 'scale(1)';
    sfx('pop', null, 0.4);
  }
  function clampCam() {
    const c = G.cam;
    const W = World.W, H = World.H;
    c.x = G.VW >= W ? (W - G.VW) / 2 : clamp(c.x, 0, W - G.VW);
    // don't scroll far below the ground that's in view (endless sand isn't interesting)
    let gmax = 0;
    for (let x = c.x; x <= c.x + G.VW + 40; x += 40) gmax = Math.max(gmax, World.groundAt(clamp(x, 0, W)));
    const yMax = Math.min(H - G.VH, Math.max(-60, gmax + 150 - G.VH));
    c.y = G.VH >= H ? (H - G.VH) / 2 : clamp(c.y, -60, yMax);
  }

  /* ---------- audio helper ---------- */
  function sfx(name, x = null, vol = 1) {
    if (!Sound.on) return;
    let pan = 0, v = vol;
    if (x !== null && x !== undefined) {
      const mid = G.cam.x + G.VW / 2;
      const d = (x - mid) / (G.VW * 0.5);
      pan = clamp(d * 0.7, -0.9, 0.9);
      v = vol / (1 + Math.max(0, Math.abs(d) - 1) * 1.6);
    }
    Sound.play(name, pan, v);
  }
  G.sfx = sfx;
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  G.shake = (a) => { if (!calm) G.shakeA = Math.max(G.shakeA, a); };

  /* ---------- time of day ---------- */
  function setHour(i) {
    G.hourIdx = (i + Times.ORDER.length) % Times.ORDER.length;
    G.P = Times.compile(G.hour());
    Critters.setShadowColor(G.P.shadowTint);
    Sound.setHour(G.hour());
    HUD.clock();
  }
  G.setHour = setHour;

  /* ---------- world setup ---------- */
  function init() {
    Scene.init();
    setHour(qs.has('time') ? Math.max(0, Times.ORDER.indexOf(qs.get('time'))) : 1);
    const gy = World.groundAt;
    G.ball = new Critters.BeachBall(640, gy(640) - 11);
    G.mudkip = new Life.MudkipMon({ x: 520 });
    G.mons.push(G.mudkip);
    for (const s of G.systems) if (s.init) s.init(G);
    G.cam.x = G.mudkip.x - G.VW * 0.5; G.cam.y = G.mudkip.y - G.VH * 0.7;
    if (qs.has('cam')) { const [x, y] = qs.get('cam').split(',').map(Number); G.cam.x = x; G.cam.y = y; G.follow = false; }
    if (qs.has('z')) { G.zoom = +qs.get('z'); layout(); }
    clampCam();
  }

  /* ---------- update ---------- */
  function updateCamera(dt) {
    const c = G.cam;
    if (G.lock > 0) G.lock -= dt;
    else if (G.follow && G.mudkip && !drag) {
      const m = G.followTarget || G.mudkip;
      const tx = m.x - G.VW * 0.5, ty = m.y - G.VH * 0.7;
      const k = 1 - Math.exp(-dt * 2.6);
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    } else if (!drag) {
      c.x += c.vx * dt; c.y += c.vy * dt;
      const f = Math.exp(-dt * 4.5);
      c.vx *= f; c.vy *= f;
    }
    c.x += keys.x * dt * 420 / Math.sqrt(G.zoom / zMin); c.y += keys.y * dt * 420 / Math.sqrt(G.zoom / zMin);
    clampCam();
  }

  function update(dt) {
    G.rt = (G.rt || 0) + dt;
    if (G.gallery) { Gallery.update(dt); return; }
    if (G.frozen > 0) {
      // Dialga stopped time: only Dialga (and the magic) keep moving
      G.frozen -= dt;
      for (const m of G.mons) if (m.kind === 'dialga') m.update(dt, G.rt);
      for (const s of G.systems) if (s.updateFrozen) s.updateFrozen(dt);
      updateCamera(dt);
      return;
    }
    G.t += dt;
    const t = G.t;
    updateCamera(dt);
    // world
    for (const p of Scene.S.palms) p.shake = Math.max(0, p.shake - dt * 1.2);
    for (const r of Scene.S.rocks) r.shake = Math.max(0, r.shake - dt);
    for (const k of ['umbrella', 'castle']) if (Scene.S[k].wob) Scene.S[k].wob = Math.max(0, Scene.S[k].wob - dt * 1.5);
    Life.Nuts.update(dt, t);
    Wind.update(dt); Ripples.step(dt);
    // blowing sand on the dry beach in view
    if (Math.random() < dt * Wind.v * 30) { const x = G.cam.x + Math.random() * G.VW, g = World.groundAt(Math.max(0, Math.min(World.W, x))); if (g < World.SEA - 2 && g > G.cam.y && g < G.cam.y + G.VH) FX.add({ type: 'grain', x, y: g - 2, vx: Wind.v * 50, vy: -Math.random() * 40, life: 1.5 + Math.random() * 2, c: G.P.sand[3], c2: G.P.sand[2], layer: 2 }); }
    if (G.ball) { G.ball.step(dt, t); Life.ballCollide(G.ball, dt); }
    for (const m of G.mons) if (m.alive) m.update(dt, t);
    for (const s of G.systems) if (s.update) s.update(dt, t);
    FX.update(dt);
    G.shakeA = Math.max(0, G.shakeA - dt * 6);
    // audio: muffle when the view is underwater
    const midY = G.cam.y + G.VH * 0.5;
    Sound.setUnder(midY > World.SEA + 60 ? 1 : 0);
  }

  /* ---------- render ---------- */
  const prof = {};
  let pt = 0;
  const mark = DEBUG ? (k) => { const n = performance.now(); prof[k] = (prof[k] || 0) * 0.95 + (n - pt) * 0.05; pt = n; } : () => {};
  G.prof = prof;
  function render() {
    WorldRender.setTilt((G.cam.y - (World.SEA - G.VH * 0.62)) * 0.5 + (G.zoom - zMin) * 7);
    if (G.gallery) { Gallery.draw(fb); Gallery.post(fb); ctx.putImageData(img, 0, 0); return; }
    const P = G.P, t = G.t;
    pt = performance.now();
    const sh = G.shakeA > 0 ? G.shakeA : 0;
    const cx = Math.round(G.cam.x + (sh ? (Math.random() - 0.5) * sh * 2 : 0));
    const cy = Math.round(G.cam.y + (sh ? (Math.random() - 0.5) * sh * 2 : 0));
    G.cx = cx; G.cy = cy;
    occ.fill(0);
    const swash = WorldRender.swashState(t);
    WorldRender.drawSky(fb, cx, cy, P, t);
    for (const s of G.systems) if (s.drawSky) s.drawSky(fb, cx, cy, P, t);
    mark('sky');
    WorldRender.drawBackdrop(fb, cx, cy, P, t, (b, bx, byy, bd) => { for (const s of G.systems) if (s.drawBackdrop) s.drawBackdrop(b, cx, cy, P, t, bx, byy); });
    mark('backdrop');
    // sprites for this frame (render budget shared by everyone)
    for (const m of G.mons) if (m.visible && m.alive && onScreen(m, cx, cy, 200)) m.sprite(P);
    mark('sprites');
    // far swimmers sit behind the seabed cross-section
    for (const m of G.mons) if (m.layer === 'far' && m.visible) m.draw(fb, cx, cy, occ);
    WorldRender.drawTerrain(fb, cx, cy, P, t, occ, swash);
    Depth.drawNear(fb, cx, cy, P, t, occ);
    mark('terrain');
    Scene.drawBack(fb, cx, cy, P, t, occ);
    for (const s of G.systems) if (s.drawBack) s.drawBack(fb, cx, cy, P, t, occ);
    // contact shadows
    for (const m of G.mons) {
      if (!m.visible || !m.shadow || m.layer === 'far' || m.mode === 'swim' || m.mode === 'dive') continue;
      const g = World.groundAt(m.x);
      const h = g - m.y;
      if (h > 160 || g > WorldRender.surfaceAt(m.x, t) + 4) continue;
      const w = m.width();
      Critters.shadow(fb, cx, cy, m.x + (m.shadowDx || 0), g + 1, w * 0.36 * (1 - h / 400), 3.2, 0.9 * (1 - h / 160));
    }
    if (G.ball && !G.ball.holder) {
      const g = World.groundAt(G.ball.x), h = g - G.ball.y;
      if (h < 140 && g < WorldRender.surfaceAt(G.ball.x, t) + 2) Critters.shadow(fb, cx, cy, G.ball.x, g + 1, 9 * (1 - h / 300), 2.5, 0.9 * (1 - h / 140));
    }
    Scene.drawItems(fb, cx, cy, P, t);
    const mids = G.mons.filter((m) => m.layer !== 'far' && m.layer !== 'top' && m.visible).sort((a, b) => a.z - b.z);
    let ballDrawn = false;
    for (const m of mids) {
      if (!ballDrawn && G.ball && m.z > G.ball.z) { drawBall(cx, cy, P); ballDrawn = true; }
      m.draw(fb, cx, cy, occ);
      if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ);
    }
    if (!ballDrawn && G.ball) drawBall(cx, cy, P);
    drawHeld(cx, cy, P, t);
    Scene.drawFront(fb, cx, cy, P, t);
    for (const m of G.mons) if (m.layer === 'top' && m.visible) { m.draw(fb, cx, cy, occ); if (m.drawExtra) m.drawExtra(fb, cx, cy, P, t, occ); }
    drawHeld(cx, cy, P, t, true);
    for (const s of G.systems) if (s.drawMid) s.drawMid(fb, cx, cy, P, t, occ);
    mark('scene');
    WorldRender.drawWater(fb, cx, cy, P, t, occ, swash);
    WorldRender.drawSurface(fb, cx, cy, P, t);
    Depth.drawSheen(fb, cx, cy, P, t);
    mark('water');
    FX.draw(fb, cx, cy, 1, t);
    FX.draw(fb, cx, cy, 2, t);
    for (const s of G.systems) if (s.drawFront) s.drawFront(fb, cx, cy, P, t);
    FX.draw(fb, cx, cy, 3, t);
    FX.draw(fb, cx, cy, 4, t);
    for (const s of G.systems) if (s.post) s.post(fb, cx, cy, P, t);
    Depth.drawFore(fb, cx, cy, P, t);
    if (typeof Post !== 'undefined') Post.apply(fb, P, cx, cy, t, G, occ);
    if (typeof Gallery !== 'undefined') Gallery.post(fb);
    mark('fx');
    ctx.putImageData(img, 0, 0);
    mark('put');
  }
  function onScreen(m, cx, cy, pad) {
    return m.x + m.SW > cx - pad && m.x - m.SW < cx + G.VW + pad && m.y + m.SH > cy - pad && m.y - m.SH < cy + G.VH + pad;
  }
  function drawBall(cx, cy, P) {
    const b = G.ball;
    if (b.holder && b.holder.layer === 'top') return;
    b.sprite(P);
    b.draw(fb, cx, cy, occ);
  }
  function drawHeld(cx, cy, P, t, top = false) {
    for (const c of Scene.S.coconuts) if (c.state === 'held' && !!(c.holder && c.holder.layer === 'top') === top) Scene.drawCoconut(fb, cx, cy, c, P, t);
    if (top && G.ball && G.ball.holder && G.ball.holder.layer === 'top') { G.ball.sprite(P); G.ball.draw(fb, cx, cy, occ); }
  }
  G.fb = () => fb;

  /* ---------- poke ---------- */
  function poke(sx, sy) {
    if (G.gallery) { Gallery.poke(sx / G.zoom, sy / G.zoom); return; }
    const wx = G.cam.x + sx / G.zoom, wy = G.cam.y + sy / G.zoom;
    const t = G.t, P = G.P, S = Scene.S;
    FX.add({ type: 'ring', x: wx, y: wy, r0: 1, r1: 7, life: 0.3, c: PX.hex('#ffffff'), layer: 4 });
    const pad = Math.max(1, Math.round(4 / G.zoom * 2));
    // systems first (orb, Dialga, portal...)
    for (const s of G.systems) if (s.pokeFirst && s.pokeFirst(wx, wy)) return;
    // the ball
    const b = G.ball;
    if (b && b.hit(wx, wy, 4)) {
      const dir = wx < b.x ? 1 : -1;
      if (b.holder && b.holder.dropBall) b.holder.dropBall();
      b.kick(dir * Life.rnd(80, 150), -Life.rnd(240, 330), null);
      sfx('boing', b.x, 1);
      FX.add({ type: 'burst', x: wx, y: wy, r: 6, life: 0.2, layer: 3 });
      return;
    }
    // creatures, front-most first
    const order = G.mons.filter((m) => m.visible && m.alive).sort((a, c) => (c.layer === 'top') - (a.layer === 'top') || c.z - a.z);
    for (const m of order) if (m.layer !== 'far' && m.hit(wx, wy, pad)) { m.onPoke(wx, wy); return; }
    // coconuts
    for (const c of S.coconuts) {
      if (c.state === 'gone' || c.state === 'fade') continue;
      if (Math.hypot(c.x - wx, c.y - wy) < c.r + 4) {
        if (c.state === 'tree') { Life.Nuts.drop(c, Life.rnd(-30, 30)); c.palm.shake = 0.6; }
        else if (c.state === 'held' && c.holder && c.holder.dropNut) c.holder.dropNut();
        else if (!c.cracked) { c.state = 'fall'; c.vx = (wx < c.x ? 1 : -1) * Life.rnd(60, 120); c.vy = -Life.rnd(150, 230); sfx('knock', c.x, 0.8); FX.bonk(wx, wy, 5); }
        else { FX.sparkles(c.x, c.y - 4, 3, 12); sfx('pop', c.x, 0.6); }
        return;
      }
    }
    // palm crowns / trunks
    for (const p of S.palms) {
      const f = Math.floor(t * 2.4 + p.seed) % p.m.frames.length;
      const fx = Math.round(p.gx + p.m.crownX - p.m.bx - p.m.ccx), fy = Math.round(p.gy + p.m.crownY - p.m.by - p.m.ccy + 4);
      if (p.m.frames[f].get(Math.round(wx - fx), Math.round(wy - fy))) { Life.Nuts.shakePalm(p, 1); return; }
      if (p.m.trunk.get(Math.round(wx - p.x0), Math.round(wy - p.y0))) { Life.Nuts.shakePalm(p, Math.random() < 0.5 ? 1 : 0); sfx('knock', p.gx, 0.7); return; }
    }
    // rocks (one hides the Adamant crystal)
    for (const r of S.rocks) {
      if (r.spr.get(Math.round(wx - r.x0), Math.round(wy - r.y0))) {
        r.shake = 0.4; r.pokes++;
        sfx('knock', r.x, 0.8);
        FX.poof(wx, wy, P.rock[2], P.rock[3], 3, 3);
        for (const s of G.systems) if (s.rockPoked) s.rockPoked(r, wx, wy);
        return;
      }
    }
    // beach things
    const hitSpr = (spr, x0, y0) => spr.get(Math.round(wx - x0), Math.round(wy - y0));
    if (S.castleHP > 0.5 && hitSpr(S.castle.spr, S.castle.x - 38, S.castle.y0)) {
      S.castleHP -= 0.5; S.castle.wob = 1; S.castleT = t;
      FX.poof(wx, wy, P.sand[3], P.sand[2], 7, 5); sfx('dust', S.castle.x, 1);
      if (S.castleHP <= 0.5) { FX.poof(S.castle.x, S.castle.y0 + 50, P.sand[3], P.sand[2], 14, 8); sfx('thud', S.castle.x, 0.8); for (const m of G.mons) if (m.castleGone) m.castleGone(); }
      return;
    }
    if (hitSpr(S.umbrella.spr, S.umbrella.x - 75, S.umbrella.y0)) { S.umbrella.wob = 1; sfx('boing', S.umbrella.x, 0.8); return; }
    const chSpr = S.chestSpr[S.chestOpen ? 1 : 0];
    if (hitSpr(chSpr, S.chest.x - 32, S.chest.y0)) {
      S.chestOpen = !S.chestOpen;
      sfx(S.chestOpen ? 'chest' : 'knock', S.chest.x, 1);
      if (S.chestOpen) { FX.sparkles(S.chest.x, S.chest.y0 + 20, 10, 36); FX.bubbles(S.chest.x, S.chest.y0 + 10, 8, World.SEA); }
      return;
    }
    if (hitSpr(S.towel.spr, S.towel.x - 55, S.towel.y0)) { FX.poof(wx, wy, PX.hex('#ffffff'), P.sand[3], 3, 3); sfx('pat', wx, 0.6); return; }
    if (hitSpr(S.pier.s, S.pier.x, S.pier.y)) { sfx('knock', wx, 1); FX.poof(wx, wy, P.wood[3], P.wood[2], 3, 2); for (const m of G.mons) if (m.pierKnock) m.pierKnock(wx); return; }
    for (const k of S.kelp) {
      if (Math.abs(wx - k.x) < 12 && wy < World.groundAt(k.x) && wy > World.groundAt(k.x) - k.len) { FX.bubbles(wx, wy, 4, World.SEA); sfx('bubble', wx, 0.6); return; }
    }
    for (const c of S.corals) {
      if (hitSpr(c.spr, c.x0, c.y0)) { FX.bubbles(wx, wy, 6, World.SEA); FX.sparkles(wx, wy, 3, 14, PX.hex('#ffffff'), PX.hex('#ffb0d0')); sfx('bubble', wx, 0.8); return; }
    }
    // sky: sun / moon / clouds
    const surf = WorldRender.surfaceAt(wx, t);
    const g = World.groundAt(wx);
    if (wy < surf - 4 && wy < g) {
      const sp = P.sun, sunX = cxs() + Math.round(sp.px * G.VW), sunY = Math.round(sp.y - G.cy * 0.9) + G.cy;
      if (Math.hypot(wx - sunX, wy - sunY) < sp.r + 8) {
        FX.sparkles(sunX, sunY, 12, sp.r * 3, PX.hex('#ffffff'), sp.kind === 'moon' ? PX.hex('#9fc0ff') : PX.hex('#ffe066'));
        FX.add({ type: 'ring', x: sunX, y: sunY, r0: sp.r, r1: sp.r * 3, life: 0.7, c: PX.hex('#ffffff'), thick: true, c2: sp.cols[1], layer: 3 });
        sfx('twinkle', wx, 1);
        return;
      }
      const k = WorldRender.cloudAt(wx - G.cx, wy - G.cy, G.cx, G.cy, G.VW, t, P);
      if (k >= 0) { WorldRender.rainOn(k, t + 4); sfx('rain', wx, 1); FX.poof(wx, wy, P.cloud[3], P.cloud[2], 4, 5); return; }
      for (const s of G.systems) if (s.pokeSky && s.pokeSky(wx, wy)) return;
      FX.sparkles(wx, wy, 2, 6);
      sfx('pop', wx, 0.4);
      return;
    }
    if (g > surf + 2 && Math.abs(wy - surf) < 9) { FX.splashAt(wx, surf, { power: 0.55, n: 10 }); sfx('plop', wx, 1); for (const m of G.mons) if (m.splashNear) m.splashNear(wx); return; }
    if (g > surf && wy > surf && wy < g) { FX.bubbles(wx, wy, 5, World.SEA); sfx('bubble', wx, 0.9); for (const m of G.mons) if (m.bubbleNear) m.bubbleNear(wx, wy); return; }
    const fos = Scene.pokeBuried(wx, wy);
    if (fos) { FX.sparkles(fos.x, fos.y, 8, 24, PX.hex('#ffffff'), PX.hex('#ffe066')); sfx('twinkle', wx, 1); return; }
    if (wy >= g - 2) { FX.poof(wx, Math.min(wy, g + 2), P.sand[3], P.sand[2], 4, 4); sfx('dust', wx, 0.8); if (G.mudkip && G.mudkip.curious) G.mudkip.curious(wx); return; }
  }
  const cxs = () => G.cx;
  G.poke = poke;

  /* ---------- input ---------- */
  const ptrs = new Map();
  let drag = null, pinch = null;
  const keys = { x: 0, y: 0, held: new Set() };
  const devXY = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  cv.addEventListener('pointerdown', (e) => {
    if (!G.started) return;
    cv.setPointerCapture(e.pointerId);
    const [x, y] = devXY(e);
    ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 1) drag = { x0: x, y0: y, cx: G.cam.x, cy: G.cam.y, moved: false, hist: [[x, y, performance.now()]], t0: performance.now() };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = devXY(e);
    ptrs.set(e.pointerId, { x, y });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      G.cam.x -= (mx - pinch.mx) / G.zoom; G.cam.y -= (my - pinch.my) / G.zoom;
      pinch.mx = mx; pinch.my = my;
      if (d / pinch.d0 > 1.28) { setZoom(G.zoom + 1, mx, my); pinch.d0 = d; }
      else if (d / pinch.d0 < 0.78) { setZoom(G.zoom - 1, mx, my); pinch.d0 = d; }
      G.follow = false; updateFollowUI();
      clampCam();
      return;
    }
    if (!drag) return;
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 8 * dpr) { drag.moved = true; G.follow = false; updateFollowUI(); wrap.classList.add('dragging'); }
    if (drag.moved) {
      G.cam.x = drag.cx - dx / G.zoom; G.cam.y = drag.cy - dy / G.zoom;
      clampCam();
      drag.hist.push([x, y, performance.now()]);
      if (drag.hist.length > 6) drag.hist.shift();
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = devXY(e);
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; drag = null; } return; }
    if (drag) {
      if (!drag.moved && e.type === 'pointerup') poke(x, y);
      else if (drag.moved) {
        const h = drag.hist, a = h[0], b = h[h.length - 1];
        const dtm = (b[2] - a[2]) / 1000;
        if (dtm > 0 && performance.now() - b[2] < 80) { G.cam.vx = -((b[0] - a[0]) / G.zoom) / dtm; G.cam.vy = -((b[1] - a[1]) / G.zoom) / dtm; }
      }
      drag = null;
      wrap.classList.remove('dragging');
    }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  let wheelAcc = 0;
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!G.started) return;
    const [x, y] = devXY(e);
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { G.cam.x += e.deltaX / G.zoom; clampCam(); G.follow = false; updateFollowUI(); return; }
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 33 : 1) * (e.ctrlKey ? 4 : 1);
    if (wheelAcc > 90) { setZoom(G.zoom - 1, x, y); wheelAcc = 0; }
    else if (wheelAcc < -90) { setZoom(G.zoom + 1, x, y); wheelAcc = 0; }
  }, { passive: false });
  const KEYMAP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
  window.addEventListener('keydown', (e) => {
    if (!G.started) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYMAP[k]) { keys.held.add(k); G.follow = false; updateFollowUI(); e.preventDefault(); }
    else if (k === '+' || k === '=') setZoom(G.zoom + 1);
    else if (k === '-' || k === '_') setZoom(G.zoom - 1);
    else if (k === 'f') toggleFollow();
    else if (k === 'm') toggleSound();
    recomputeKeys();
  });
  window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.held.delete(k); recomputeKeys(); });
  window.addEventListener('blur', () => { keys.held.clear(); recomputeKeys(); });
  function recomputeKeys() { keys.x = 0; keys.y = 0; for (const k of keys.held) { keys.x += KEYMAP[k][0]; keys.y += KEYMAP[k][1]; } }

  /* ---------- HUD (icons only) ---------- */
  const ICONS = {
    zin: ['...kkkkk.....', '..kwwwwwk....', '.kwcccccwk...', 'kwccckcccwk..', 'kwccckcccwk..', 'kwckkkkkcwk..', 'kwccckcccwk..', 'kwccckcccwk..', '.kwcccccwk...', '..kwwwwwkkk..', '...kkkkkkwwk.', '.........kwwk', '..........kk.'],
    zout: ['...kkkkk.....', '..kwwwwwk....', '.kwcccccwk...', 'kwcccccccwk..', 'kwcccccccwk..', 'kwckkkkkcwk..', 'kwcccccccwk..', 'kwcccccccwk..', '.kwcccccwk...', '..kwwwwwkkk..', '...kkkkkkwwk.', '.........kwwk', '..........kk.'],
    follow: ['.....kk.......', '....kbbk......', '...kbbbbk.....', '..kbbbbbbkk...', '.kbbbbbbbbbk..', 'kobbkwbbkwbok.', 'koobkkbbkkook.', 'kobbbbbbbbbok.', '.kbbbwwwwbbk..', '..kbbbbbbbk...', '...kkkkkkk....'],
    son: ['....k.......', '...kk...k...', 'kkkwk....k..', 'kwwwk.k..k..', 'kwwwk..k.k..', 'kwwwk..k.k..', 'kwwwk.k..k..', 'kkkwk....k..', '...kk...k...', '....k.......'],
    soff: ['....k.......', '...kk.......', 'kkkwk.......', 'kwwwk.r...r.', 'kwwwk..r.r..', 'kwwwk...r...', 'kwwwk..r.r..', 'kkkwk.r...r.', '...kk.......', '....k.......'],
    full: ['kkkk....kkkk', 'k..........k', 'k..........k', 'k..........k', '............', '............', '............', '............', 'k..........k', 'k..........k', 'k..........k', 'kkkk....kkkk'],
    orb: ['.....k.....', '....kck....', '...kcwck...', '..kccwcck..', '.kbcccccbk.', 'kbbbccccbbk', '.kbbbcbbbk.', '..kbbbbbk..', '...kbbbk...', '....kbk....', '.....k.....'],
    orbGrey: ['.....g.....', '....g.g....', '...g...g...', '..g.....g..', '.g.......g.', 'g.........g', '.g.......g.', '..g.....g..', '...g...g...', '....g.g....', '.....g.....'],
    dawn: ['............', '.....y......', '..y..y..y...', '...y...y....', '....yyy.....', '..yyyyyyy...', '.yyyyyyyyy..', 'oooooooooooo', '.bbbbbbbbbb.', '..bbbbbbbb..'],
    noon: ['.....y.....', '..y..y..y..', '...y...y...', '....yyy....', 'yy.yyyyy.yy', '...yyyyy...', '....yyy....', '...y...y...', '..y..y..y..', '.....y.....'],
    afternoon: ['..y..y.....', '...y...y...', '.y.yyy.....', '..yyyyy.y..', 'y.yyyyy....', '..yyywwww..', '.y.wwwwwww.', '..wwwwwwwww', '...wwwwwww.'],
    dusk: ['............', '............', '....oooo....', '..oooooooo..', '.oooooooooo.', 'rrrrrrrrrrrr', '.pppppppppp.', '..pppppppp..', '............'],
    night: ['...cccc.....', '..ccc....w..', '.ccc.....w..', '.ccc...wwwww', '.ccc.....w..', '.cccc....w..', '..ccccc.....', '...cccccc...', '.....cc.....'],
  };
  const ICOL = { k: '#1b2240', w: '#ffffff', b: '#56bcf0', o: '#f28a2a', r: '#ff5a6a', g: '#8f98b8', c: '#9ff3ff', y: '#ffd83a', p: '#8a5cc8' };
  function svgIcon(map, cols = ICOL) {
    const h = map.length, w = map[0].length;
    let r = '';
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const ch = map[y][x];
        if (ch === '.') { x++; continue; }
        let x2 = x;
        while (x2 < w && map[y][x2] === ch) x2++;
        r += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${cols[ch]}"/>`;
        x = x2;
      }
    }
    return `<svg viewBox="-1 -1 ${w + 2} ${h + 2}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }
  const HUD = {
    clock() { const el = $('#b-clock'); if (el) el.innerHTML = svgIcon(ICONS[G.hour()]); },
    orb(state) {
      const el = $('#b-orb');
      if (!el) return;
      el.innerHTML = svgIcon(state === 'none' ? ICONS.orbGrey : ICONS.orb);
      el.classList.toggle('lit', state !== 'none');
      el.classList.toggle('pulse', state === 'dialga');
    },
  };
  G.HUD = HUD;
  function btn(id, icon, label, fn) {
    const b = $(id);
    b.innerHTML = svgIcon(ICONS[icon]);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function updateZoomUI() {
    const zi = $('#b-zin'), zo = $('#b-zout');
    if (zi) zi.disabled = G.zoom >= zMax;
    if (zo) zo.disabled = G.zoom <= zMin;
  }
  function updateFollowUI() { const b = $('#b-follow'); if (b) b.setAttribute('aria-pressed', String(G.follow)); }
  function toggleFollow() { G.follow = !G.follow; G.followTarget = null; updateFollowUI(); sfx('pop', null, 0.5); }
  function toggleSound() {
    const v = Sound.set(!Sound.on);
    const b = $('#b-sound');
    b.innerHTML = svgIcon(ICONS[v ? 'son' : 'soff']);
    b.setAttribute('aria-pressed', String(v));
    try { localStorage.setItem('mk-game-sound', v ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  }
  function toggleFull() {
    const d = document;
    try {
      if (!d.fullscreenElement && wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
      else if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
    } catch (e) { /* not allowed here */ }
  }
  function panTo(x, y) { G.follow = false; updateFollowUI(); G.cam.vx = 0; G.cam.vy = 0; G.panGoal = [x - G.VW / 2, y - G.VH / 2]; }
  G.panTo = panTo;
  function buildHUD() {
    btn('#b-zin', 'zin', 'Zoom in', () => setZoom(G.zoom + 1));
    btn('#b-zout', 'zout', 'Zoom out', () => setZoom(G.zoom - 1));
    btn('#b-follow', 'follow', 'Follow Mudkip', toggleFollow);
    btn('#b-sound', 'soff', 'Sound', toggleSound);
    btn('#b-full', 'full', 'Fullscreen', toggleFull);
    if (!document.fullscreenEnabled) $('#b-full').hidden = true;
    const orbB = $('#b-orb');
    orbB.setAttribute('aria-label', 'Adamant crystal');
    orbB.addEventListener('click', (e) => { e.stopPropagation(); for (const s of G.systems) if (s.orbButton) s.orbButton(); });
    const clk = $('#b-clock');
    clk.setAttribute('aria-label', 'Time of day');
    clk.addEventListener('click', (e) => { e.stopPropagation(); for (const s of G.systems) if (s.clockButton) s.clockButton(); });
    HUD.clock(); HUD.orb('none'); updateFollowUI();
    // pixel finger cursor
    try {
      const fc = document.createElement('canvas'); fc.width = 24; fc.height = 24;
      const fx = fc.getContext('2d');
      const F = ['....kk......', '...kwwk.....', '...kwwk.....', '...kwwk.....', '...kwwkkk...', '...kwwkwwkk.', '.kkkwwkwwkwk', 'kwwkwwwwwkwk', 'kwwwwwwwwwwk', '.kwwwwwwwwwk', '..kwwwwwwwk.', '...kwwwwwk..', '...kkkkkkk..'];
      F.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { fx.fillStyle = ch === 'k' ? '#1b2240' : '#ffffff'; fx.fillRect(x * 2, y * 2, 2, 2); } }));
      cv.style.cursor = `url(${fc.toDataURL()}) 9 1, pointer`;
    } catch (e) { /* default cursor */ }
    // pixel Poké Ball for the start button, and a tapping finger
    try {
      const N = 33, c = document.createElement('canvas'); c.width = c.height = N;
      const x2 = c.getContext('2d');
      const put = (x, y, col) => { x2.fillStyle = col; x2.fillRect(x, y, 1, 1); };
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2, d = Math.hypot(dx, dy);
          if (d > 16) continue;
          let col;
          if (d > 14.2) col = '#1b2240';
          else if (Math.abs(dy) < 1.9) col = '#1b2240';
          else if (dy < 0) col = dx + dy < -13 ? '#ff9a9a' : dx - dy > 17 ? '#b8202e' : '#ee3b45';
          else col = dx - dy > 9 ? '#c9d3e3' : '#f4f7fb';
          if (d < 6.6) col = d > 5 ? '#1b2240' : d > 3.4 ? '#f4f7fb' : d > 2.4 ? '#c9d3e3' : '#ffffff';
          put(x, y, col);
        }
      put(9, 6, '#ffffff'); put(10, 6, '#ffffff'); put(8, 7, '#ffffff');
      const url = c.toDataURL();
      document.querySelectorAll('#b-start .pb-top, #b-start .pb-bot').forEach((el) => { el.style.backgroundImage = `url(${url})`; });
      const tc = document.createElement('canvas'); tc.width = tc.height = 20;
      const tx = tc.getContext('2d');
      const F = ['....kk......', '...kwwk.....', '...kwwk.....', '...kwwk.....', '...kwwkkk...', '...kwwkwwkk.', '.kkkwwkwwkwk', 'kwwkwwwwwkwk', 'kwwwwwwwwwwk', '.kwwwwwwwwwk', '..kwwwwwwwk.', '...kwwwwwk..', '...kkkkkkk..'];
      F.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { tx.fillStyle = ch === 'k' ? '#1b2240' : '#ffffff'; tx.fillRect(x + 4, y + 3, 1, 1); } }));
      const tap = document.querySelector('.tap');
      if (tap) tap.style.backgroundImage = `url(${tc.toDataURL()})`;
    } catch (e) { /* decorative */ }
    // minimap
    const mini = $('#mini');
    const go = (e) => {
      const r = mini.getBoundingClientRect();
      const u = clamp((e.clientX - r.left) / r.width, 0, 1), v = clamp((e.clientY - r.top) / r.height, 0, 1);
      G.follow = false; updateFollowUI();
      G.cam.x = u * World.W - G.VW / 2; G.cam.y = v * World.H - G.VH / 2; G.cam.vx = G.cam.vy = 0;
      clampCam();
    };
    let md = false;
    mini.addEventListener('pointerdown', (e) => { md = true; mini.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
    mini.addEventListener('pointermove', (e) => { if (md) go(e); });
    mini.addEventListener('pointerup', () => { md = false; });
    mini.setAttribute('aria-label', 'Map');
  }
  let miniT = 0;
  function drawMini() {
    const mc = $('#mini');
    if (!mc) return;
    const w = mc.width, h = mc.height, m = mc.getContext('2d');
    const P = G.P, sx = w / World.W, sy = h / World.H;
    const hx = (c) => '#' + PX.toHex(c).slice(1);
    const sk = P.skyRow;
    for (let y = 0; y < h; y++) {
      const wy = y / sy;
      if (wy < World.SEA) m.fillStyle = hx(sk[Math.min(sk.length - 1, Math.max(0, Math.floor(wy)))].a);
      else m.fillStyle = hx(P.waterRow[Math.min(P.waterRow.length - 1, Math.floor(wy - World.SEA))].a);
      m.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x++) {
      const g = World.groundAt(x / sx);
      m.fillStyle = hx(g > World.SEA + 2 ? P.seabed[2] : P.sand[2]);
      m.fillRect(x, Math.floor(g * sy), 1, h);
    }
    for (const s of G.systems) if (s.drawMini) s.drawMini(m, sx, sy);
    const mk = G.mudkip;
    if (mk) { m.fillStyle = '#1b2240'; m.fillRect(Math.round(mk.x * sx) - 2, Math.round((mk.y - 20) * sy) - 2, 5, 5); m.fillStyle = '#56bcf0'; m.fillRect(Math.round(mk.x * sx) - 1, Math.round((mk.y - 20) * sy) - 1, 3, 3); }
    m.strokeStyle = '#ffffff'; m.lineWidth = 1;
    m.strokeRect(Math.round(G.cam.x * sx) + 0.5, Math.round(G.cam.y * sy) + 0.5, Math.max(3, Math.round(G.VW * sx) - 1), Math.max(3, Math.round(G.VH * sy) - 1));
  }

  /* ---------- start screen ---------- */
  function start() {
    if (G.started) return;
    G.started = true;
    const st = $('#start');
    st.classList.add('open');
    setTimeout(() => { st.hidden = true; }, 700);
    let want = true;
    try { want = localStorage.getItem('mk-game-sound') !== '0'; } catch (e) { /* default on */ }
    if (want) toggleSound();
    sfx('chime', null, 0.7);
    wrap.focus({ preventScroll: true });
  }

  /* ---------- loop ---------- */
  let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0, msAcc = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const t0 = performance.now();
    Critters.Budget.reset(G.started ? 10 : 40);
    if (G.panGoal) {
      const k = 1 - Math.exp(-dt * 4);
      G.cam.x += (G.panGoal[0] - G.cam.x) * k; G.cam.y += (G.panGoal[1] - G.cam.y) * k;
      if (Math.hypot(G.panGoal[0] - G.cam.x, G.panGoal[1] - G.cam.y) < 2 || drag) G.panGoal = null;
    }
    if (!G.paused) for (let k = 0; k < SPEED; k++) update(dt);
    render();
    miniT -= dt;
    if (miniT <= 0) {
      drawMini(); miniT = 0.2;
      // a gentle nudge toward the hidden crystal after a while
      const ob = $('#b-orb');
      if (ob) ob.classList.toggle('hint', G.started && G.t > 50 && typeof Magic !== 'undefined' && Magic.S.orb === 'hidden');
    }
    if (DEBUG) {
      msAcc += performance.now() - t0; fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.5) { fpsShow = fpsN / fpsAcc; const el = $('#dbg'); if (el) el.textContent = fpsShow.toFixed(0) + ' fps  ' + (msAcc / fpsN).toFixed(1) + ' ms  ' + G.VW + 'x' + G.VH + ' z' + G.zoom + ' ' + JSON.stringify(Critters.cacheStats()) + ' ' + Object.entries(prof).map(([k, v]) => k + ':' + v.toFixed(1)).join(' '); fpsAcc = 0; fpsN = 0; msAcc = 0; }
    }
    requestAnimationFrame(frame);
  }

  function restore(d) {
    if (!d || typeof d !== 'object') return;
    if (typeof d.hour === 'number') setHour(d.hour);
    if (d.zoom) { G.zoom = d.zoom; layout(); }
    if (d.cam) { G.cam.x = d.cam[0]; G.cam.y = d.cam[1]; clampCam(); }
    if (typeof d.follow === 'boolean') { G.follow = d.follow; updateFollowUI(); }
    if (d.started) { G.started = true; $('#start').hidden = true; }
    if (typeof Magic !== 'undefined' && (d.orb === 'used' || d.orb === 'inside' || d.orb === 'summon')) Magic.restoreDialga();
  }
  function boot() {
    const wk = document.getElementById('wk-src');
    if (wk && !qs.has('noworker')) Critters.Pool.init(wk.textContent);
    layout();
    buildHUD();
    init();
    window.addEventListener('resize', () => { const oz = G.zoom; layout(); if (G.zoom !== oz) updateZoomUI(); });
    $('#b-start').addEventListener('click', (e) => { e.stopPropagation(); start(); });
    $('#start').addEventListener('click', start);
    try { $('#b-start').focus({ preventScroll: true }); } catch (e) { /* focus is optional */ }
    if (qs.has('autostart')) { G.started = true; $('#start').hidden = true; }
    // keep the player's place across a republish of the page
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) {
      try {
        hot.snapshot(() => ({ hour: G.hourIdx, cam: [G.cam.x, G.cam.y], zoom: G.zoom, follow: G.follow, started: G.started, orb: typeof Magic !== 'undefined' ? Magic.S.orb : 'hidden' }));
      } catch (e) { /* optional */ }
    }
    if (DEBUG) { const d = document.createElement('div'); d.id = 'dbg'; wrap.appendChild(d); }
    const go = (d) => { try { restore(d); } catch (e) { /* fresh start */ } requestAnimationFrame(frame); };
    if (hot && hot.ready) hot.ready(go); else go(hot && hot.data);
  }
  G.boot = boot;
  G.layout = layout;
  G.setZoom = setZoom;
  G.clampCam = clampCam;
  G.devToWorld = (x, y) => [G.cam.x + x / G.zoom, G.cam.y + y / G.zoom];
  return G;
})();
