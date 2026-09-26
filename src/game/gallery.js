/* ------------------------------------------------------------------
   Time Gallery — step through Palkia's rift into a galaxy where the
   cove's moments hang as shattered-mirror rifts, Minior burn across
   the sky and Deoxys swoops between them.
   Poke a painting to fall back into the world at that time of day;
   poke empty space to go home. Also: the soft vignette that makes the
   world read like a framed picture.
------------------------------------------------------------------- */
const Gallery = (() => {
  const { hex, mix, hash2, fbm, bayer4 } = PX;
  const W0 = 384, H0 = 216;
  const PIECES = [
    { make: () => Paintings.dawn() }, { make: () => Paintings.noon() }, { make: () => Fun.party() }, { make: () => Fun.volley() }, { make: () => Paintings.surf() },
    { make: () => Fun.launch() }, { make: () => Fun.reef() }, { make: () => Fun.sky() }, { make: () => Paintings.dusk() }, { make: () => Paintings.night() },
  ];
  const SND = { boing: ['boing', 0.7], cry: ['mud', 0.9], jump: ['whoosh', 0.3], plip: ['plop', 0.5], splash: ['splash', 0.5], twinkle: ['twinkle', 0.6] };
  // run a scene step without letting it leave particles in the shared list
  const quiet = (fn) => { const n = FX.list.length; fn(); FX.list.length = n; };
  const S = { on: false, t: 0, in: 0, out: 0, target: null, flash: 0, rr: 0, hover: -1, mx: 0, my: 0, tmx: 0, tmy: 0, w: 640, h: 360 };
  const gold = [hex('#5a3a12'), hex('#a8701e'), hex('#e0a83a'), hex('#ffe08a'), hex('#fff6d0')];
  const glowC = hex('#8fdcff'), white = hex('#ffffff');

  function ensure() {
    for (const p of PIECES) {
      if (p.inst) continue;
      p.inst = p.make();
      quiet(() => { if (p.inst.warm) p.inst.warm(1.2); else p.inst.step(1 / 30); });
      p.buf = new PX.Buf(W0, H0);
      p.acc = 0;
      p.inst.draw(p.buf);
    }
  }
  const R = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  /* ---- a messy nebula in layers (far is opaque, mid is patchy with dust lanes) ---- */
  function nebulaLayer(w, h, seed, cols, opaque) {
    const b = new PX.Buf(w, h), n1 = cols.length - 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.0045 + seed, y * 0.0065, seed, 5), m = fbm(x * 0.014, y * 0.012 + seed * 3, seed + 7, 4);
      const lane = fbm(x * 0.018 + seed * 5, y * 0.026, seed + 2, 3);
      let v = clamp(n * 1.7 - 0.45 + (m - 0.5) * 0.7, 0, 1);
      if (!opaque && v < 0.18) continue;
      v = clamp(v + (bayer4(x, y) - 0.5) * 0.08, 0, 0.999);
      const f = v * n1, i = Math.floor(f);
      let c = mix(cols[i], cols[Math.min(n1, i + 1)], f - i);
      if (lane > 0.6) c = mix(c, hex('#05030c'), Math.min(0.75, (lane - 0.6) * 3));
      b.d[y * w + x] = c;
    }
    return b;
  }
  let L = null;
  function layers(w, h) {
    if (L && L.w === w && L.h === h) return L;
    const far = nebulaLayer(w + 80, h + 50, 3, ['#04030e', '#140a36', '#34125a', '#6a1e78', '#b0408a', '#ff8ab0'].map(hex), true);
    const mid = nebulaLayer(w + 160, h + 100, 11, ['#0a1a40', '#12407a', '#1e7aa0', '#40c0d0', '#b0f4ff'].map(hex), false);
    const stars = [];
    for (let i = 0; i < 260; i++) stars.push({ x: hash2(i, 1, 5), y: hash2(i, 2, 5), d: [0.3, 0.6, 1][i % 3], c: [white, hex('#ffd8f0'), hex('#c8e8ff'), hex('#fff0b0')][i % 4], big: hash2(i, 3, 5) > 0.95, tw: hash2(i, 4, 5) * 6 });
    L = { w, h, far, mid, stars };
    return L;
  }
  /* ---- rifts: jagged shattered-glass openings, one per scene ---- */
  function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  let RL = null;
  function layout(w, h) {
    if (RL && RL.w === w && RL.h === h) return RL.list;
    const cols = 5, base = Math.min(W0, Math.floor((w - 40) / cols) * 0.8);
    const list = [];
    for (let i = 0; i < PIECES.length; i++) {
      const row = i < cols ? 0 : 1, col = i % cols;
      const sz = base * (0.86 + hash2(i, 7, 1) * 0.2), fw = Math.round(sz), fh = Math.round(sz * H0 / W0);
      const cx = Math.round(20 + (col + 0.5) * ((w - 40) / cols) + (hash2(i, 8, 1) - 0.5) * base * 0.16);
      const cy = Math.round(h * (row ? 0.7 : 0.33) + (hash2(i, 9, 1) - 0.5) * h * 0.1);
      const rot = (hash2(i, 10, 1) - 0.5) * 0.26, depth = 0.7 + hash2(i, 11, 1) * 0.6;
      // jagged outline around the picture rectangle
      const pts = [], n = 11;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (hash2(i, k, 2) - 0.5) * 0.35;
        const ex = Math.cos(a), ey = Math.sin(a), sc = Math.min(1 / Math.abs(ex || 1e-6), 1 / Math.abs(ey || 1e-6));
        const r = 0.5 * (0.86 + hash2(i, k, 3) * 0.2);
        pts.push([ex * sc * r * fw, ey * sc * r * fh]);
      }
      const R0 = Math.ceil(Math.hypot(fw, fh) * 0.62) + 3, D = R0 * 2;
      const mask = new Uint8Array(D * D), src = new Int32Array(D * D).fill(-1);
      const c = Math.cos(rot), s2 = Math.sin(rot);
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const dx = x - R0, dy = y - R0, lx = dx * c + dy * s2, ly = -dx * s2 + dy * c;
        const inn = inPoly(pts, lx, ly);
        let m = 0;
        if (inn) m = inPoly(pts, lx * 1.06, ly * 1.06) ? 1 : 2;
        else if (inPoly(pts, lx / 1.07, ly / 1.07)) m = 3;
        mask[y * D + x] = m;
        if (m === 1) { const u = clamp(Math.floor((lx / fw + 0.5) * W0), 0, W0 - 1), v = clamp(Math.floor((ly / fh + 0.5) * H0), 0, H0 - 1); src[y * D + x] = v * W0 + u; }
      }
      // cracks radiating from the corners
      const cracks = pts.map(([px, py], k) => {
        const a = Math.atan2(py, px) + (hash2(i, k, 4) - 0.5) * 0.6, len = 8 + hash2(i, k, 5) * 26, seg = [];
        let x = px, y = py;
        for (let j = 0; j < len; j++) { x += Math.cos(a + Math.sin(j * 0.5 + k) * 0.5); y += Math.sin(a + Math.sin(j * 0.5 + k) * 0.5); seg.push([x * c - y * s2, x * s2 + y * c]); }
        return seg;
      });
      const shards = [0, 1, 2, 3, 4].map((k) => ({ a: hash2(i, k, 6) * 6.28, r: R0 * (0.75 + hash2(i, k, 7) * 0.35), s: 3 + hash2(i, k, 8) * 5, sp: (hash2(i, k, 9) - 0.5) * 0.8 }));
      list.push({ cx, cy, fw, fh, rot, depth, R0, D, mask, src, cracks, shards });
    }
    RL = { w, h, list };
    return list;
  }
  /* ---- the space dwellers: Minior meteors and a swooping Deoxys ---- */
  let crits = null, sparks = [];
  function ensureCrits() {
    if (crits) return;
    const Pn = Times.compile('noon');
    crits = { P: Pn, minior: [], deoxys: null };
    const cores = ['#f25050', '#ffa040', '#fff050', '#5ad86a', '#50aaff', '#6a6aea', '#b858e8'].map(hex);
    for (let i = 0; i < 7; i++) {
      const c = new Critters.Critter(Minior, { kind: 'minior', palId: 'minior' + i, pal: Minior.core(i), yaw: 1.1, scale: 0.75 + (i % 3) * 0.3, qPose: 0.05, qFields: { spin: 0.45, crack: 0.25 }, shadow: false });
      const a = hash2(i, 1, 9) * 6.28, sp = 0.025 + hash2(i, 2, 9) * 0.03;
      Object.assign(c, { u: hash2(i, 3, 9), v: hash2(i, 4, 9), vu: Math.cos(a) * sp, vv: Math.sin(a) * sp * 0.6, spn: hash2(i, 5, 9) * 6, crackT: 0, core: cores[i], near: i % 3 === 2 });
      crits.minior.push(c);
    }
    crits.deoxys = new Critters.Critter(Deoxys, { kind: 'deoxys', yaw: 1.2, scale: 0.4, qPose: 0.1, qYaw: 0.2, qFields: { wave: 0.5, lean: 0.1, spread: 0.25 }, shadow: false });
    crits.deoxys.boost = 0;
  }
  const flame = [hex('#fffbe0'), hex('#ffe070'), hex('#ffa030'), hex('#e0502a'), hex('#6a2030'), hex('#2a1030')];
  function stepCrits(dt, w, h) {
    ensureCrits();
    const t = S.t;
    for (const m of crits.minior) {
      m.u += m.vu * dt; m.v += m.vv * dt;
      if (m.u < -0.15) m.u += 1.3; if (m.u > 1.15) m.u -= 1.3; if (m.v < -0.15) m.v += 1.3; if (m.v > 1.15) m.v -= 1.3;
      m.spn += dt * 1.6; if (m.crackT > 0) m.crackT -= dt;
      m.pose = { spin: m.spn, crack: m.crackT > 0 ? 1 : 0.3, eyes: 'open' };
      const x = m.u * w, y = m.v * h;
      for (let k = 0; k < 4; k++) sparks.push({ x: x - m.vu * w * 0.25 + R(-3, 3), y: y - m.vv * h * 0.2 + R(-3, 3), vx: -m.vu * w * R(0.4, 1.2) + R(-8, 8), vy: -m.vv * h * R(0.4, 1.2) + R(-8, 8), age: 0, life: R(0.5, 1.3), core: Math.random() < 0.3 ? m.core : 0 });
    }
    const d = crits.deoxys;
    const px = d.x, py = d.y;
    d.x = w * 0.5 + Math.sin(t * 0.21) * w * 0.46; d.y = h * 0.52 + Math.sin(t * 0.34 + 1) * h * 0.3 + 30;
    const vx = (d.x - px) / Math.max(dt, 1e-3), vy = (d.y - py) / Math.max(dt, 1e-3);
    d.yaw = vx >= 0 ? 1.2 : Math.PI - 1.2;
    if (d.boost > 0) d.boost -= dt;
    d.pose = { wave: t * 3, lean: clamp(vy * 0.004, -0.4, 0.4) * (vx >= 0 ? 1 : -1), spread: 0.5 + Math.sin(t * 1.3) * 0.4 + (d.boost > 0 ? 0.5 : 0) };
    for (let k = 0; k < 2; k++) sparks.push({ x: d.x - Math.sign(vx) * 10 + R(-4, 4), y: d.y - 40 + R(-10, 10), vx: -vx * 0.2, vy: R(-5, 5), age: 0, life: R(0.3, 0.6), core: k ? hex('#48b2c0') : hex('#f59a66') });
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > p.life) sparks.splice(i, 1); }
    if (sparks.length > 900) sparks.splice(0, sparks.length - 900);
  }
  function drawSparks(fb) {
    for (const p of sparks) {
      const k = p.age / p.life, x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) continue;
      const c = p.core && k < 0.5 ? p.core : flame[Math.min(5, Math.floor(k * 6))];
      fb.d[y * fb.w + x] = c;
      if (k < 0.45) { if (x + 1 < fb.w) fb.d[y * fb.w + x + 1] = c; if (y + 1 < fb.h) fb.d[(y + 1) * fb.w + x] = c; }
    }
  }
  function drawCrit(fb, c, x, y) { c.x = x; c.y = y; c.sprite(crits.P); c.draw(fb, 0, 0, null); }
  /* ---- full-screen scene mode ---- */
  let layer = null, scv = null, sctx = null, simg = null, sbuf = null, cur = null, saved = null;
  function buildLayer() {
    layer = document.createElement('div');
    layer.id = 'scene-layer';
    layer.style.cssText = 'position:absolute;inset:0;z-index:4;display:none;place-items:center;background:#05061a;touch-action:none';
    scv = document.createElement('canvas'); scv.width = W0; scv.height = H0;
    scv.style.cssText = 'image-rendering:pixelated;width:min(100vw,calc(100vh*16/9));height:auto;aspect-ratio:16/9;cursor:pointer';
    const back = document.createElement('button');
    back.className = 'hb'; back.type = 'button'; back.setAttribute('aria-label', 'Back to the gallery');
    back.style.cssText = 'position:absolute;top:max(16px,env(safe-area-inset-top));left:max(16px,env(safe-area-inset-left))';
    back.innerHTML = '<svg viewBox="-1 -1 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="4" width="10" height="2" fill="#ffffff"/><rect x="1" y="3" width="2" height="4" fill="#ffffff"/><rect x="2" y="2" width="2" height="6" fill="#ffffff"/><rect x="3" y="1" width="2" height="8" fill="#ffffff"/><rect x="4" y="0" width="1" height="10" fill="#9ff3ff"/></svg>';
    back.addEventListener('click', (e) => { e.stopPropagation(); closeScene(); });
    layer.append(scv, back);
    document.getElementById('game').appendChild(layer);
    sctx = scv.getContext('2d'); simg = sctx.createImageData(W0, H0); sbuf = new PX.Buf(W0, H0); sbuf.d = new Uint32Array(simg.data.buffer);
    scv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!cur) return;
      const r = scv.getBoundingClientRect();
      cur.inst.tap(((e.clientX - r.left) / r.width) * W0, ((e.clientY - r.top) / r.height) * H0);
    });
  }
  function openScene(p) {
    if (!layer) buildLayer();
    cur = p; saved = FX.list.splice(0);
    layer.style.display = 'grid';
    Game.sfx('portal', null, 0.8); Game.sfx('chime', null, 0.5);
    S.sceneIn = 1;
  }
  function closeScene() {
    if (!cur) return;
    cur = null; layer.style.display = 'none';
    FX.list.length = 0; if (saved) FX.list.push(...saved); saved = null;
    Game.sfx('whoosh', null, 0.7);
    S.in = 0.6;
  }
  let tracking = false;
  function enter() {
    ensure();
    if (!tracking) {
      tracking = true;
      document.getElementById('game').addEventListener('pointermove', (e) => {
        const r = e.currentTarget.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
        S.tmx = u * 2 - 1; S.tmy = v * 2 - 1;
        const fbw = Game.fb().w, fbh = Game.fb().h, x = u * fbw, y = v * fbh;
        S.hover = -1;
        PIECES.forEach((p, i) => { const q = p.rect; if (q && x > q.x && y > q.y && x < q.x + q.w && y < q.y + q.h) S.hover = i; });
      });
    }
    S.on = true; S.t = 0; S.in = 1; S.out = 0; S.target = null;
    Game.gallery = true;
    document.getElementById('game').classList.add('in-gallery');
    Game.sfx('portal', null, 1); Game.sfx('chime', null, 0.7);
    Sound.setUnder(0);
  }
  function leave(hour) {
    if (S.out > 0) return;
    S.out = 0.9; S.target = hour;
    Game.sfx('timewave', null, 1); Game.sfx('whoosh', null, 0.7);
  }
  function update(dt) {
    S.t += dt; S.dt = dt; { const f = Game.fb(); if (f) { S.w = f.w; S.h = f.h; } }
    if (S.in > 0) S.in = Math.max(0, S.in - dt * 1.4);
    if (cur) {
      const evs = cur.inst.step(dt) || [];
      for (const e of evs) { const m = SND[e.name]; if (m) Game.sfx(m[0], null, m[1]); }
      FX.update(dt);
      cur.inst.draw(sbuf);
      if (S.sceneIn > 0) { S.sceneIn = Math.max(0, S.sceneIn - dt * 2); const k = S.sceneIn; if (k > 0) for (let i = 0; i < sbuf.d.length; i++) sbuf.d[i] = mix(sbuf.d[i], white, k * 0.9); }
      sctx.putImageData(simg, 0, 0);
      return;
    }
    for (const p of PIECES) p.acc += dt;
    for (let k = 0; k < 2; k++) {
      const p = PIECES[S.rr++ % PIECES.length];
      const a = Math.min(p.acc, 0.25); p.acc = 0;
      quiet(() => p.inst.step(a));
      p.inst.draw(p.buf);
    }
    if (S.out > 0) {
      S.out -= dt;
      if (S.out <= 0) {
        S.on = false; Game.gallery = false; S.flash = 1;
        document.getElementById('game').classList.remove('in-gallery');
        if (S.target) Game.setHour(Times.ORDER.indexOf(S.target));
        const d = typeof Magic !== 'undefined' && Magic.S.dialga;
        if (d) { d.say && d.say(); FX.sparkles(d.x, d.y - 60, 12, 40, white, glowC); }
      }
    }
  }
  function draw(fb) {
    if (cur) return;
    const w = fb.w, h = fb.h, t = S.t, d = fb.d;
    const Ly = layers(w, h);
    S.mx += (S.tmx - S.mx) * 0.06; S.my += (S.tmy - S.my) * 0.06;
    const px = S.mx + Math.sin(t * 0.1) * 0.3, py = S.my + Math.cos(t * 0.13) * 0.2;
    // far nebula
    const fx = Math.round(40 + px * 30), fy = Math.round(25 + py * 18);
    for (let y = 0; y < h; y++) { const row = (y + fy) * Ly.far.w + fx; d.set(Ly.far.d.subarray(row, row + w), y * w); }
    const star = (s, par) => {
      const x = Math.round(((s.x * (w + 200) - px * 60 * par) % (w + 200) + w + 200) % (w + 200) - 100), y = Math.round(((s.y * (h + 120) - py * 40 * par) % (h + 120) + h + 120) % (h + 120) - 60);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
      const tw = Math.sin(t * (1.2 + s.tw) + s.tw * 10);
      if (tw < -0.3 && !s.big) return;
      d[y * w + x] = s.c;
      if (s.big || tw > 0.8) { const g = mix(s.c, d[y * w + x + 1], 0.5); d[y * w + x + 1] = g; d[y * w + x - 1] = g; d[(y + 1) * w + x] = g; d[(y - 1) * w + x] = g; }
      if (s.big) for (let k = 2; k < 6; k++) { const f = 1 - k / 6; for (const [ax, ay] of [[k, 0], [-k, 0], [0, k], [0, -k]]) { const X = x + ax, Y = y + ay; if (X >= 0 && Y >= 0 && X < w && Y < h && bayer4(X, Y) < f) d[Y * w + X] = mix(d[Y * w + X], s.c, 0.6); } }
    };
    for (const s of Ly.stars) if (s.d < 0.5) star(s, s.d);
    // mid clouds (patchy, drift with a stronger parallax)
    const mx = Math.round(80 + px * 70 + t * 2) % 80, my = Math.round(50 + py * 45);
    for (let y = 0; y < h; y++) { const row = (y + my) * Ly.mid.w; for (let x = 0; x < w; x++) { const c = Ly.mid.d[row + x + mx]; if (c) d[y * w + x] = mix(d[y * w + x], c, 0.55); } }
    for (const s of Ly.stars) if (s.d >= 0.5 && s.d < 1) star(s, s.d);
    stepCrits(S.dt || 1 / 60, w, h);
    for (const m of crits.minior) if (!m.near) drawCrit(fb, m, m.u * w, m.v * h + 16);
    // rifts
    const list = layout(w, h);
    list.forEach((r, i) => {
      const p = PIECES[i], bob = Math.sin(t * 0.8 + i * 1.7) * 3;
      const X0 = Math.round(r.cx - r.R0 - px * 14 * r.depth), Y0 = Math.round(r.cy - r.R0 + bob - py * 10 * r.depth), D = r.D, hov = S.hover === i;
      p.rect = { x: X0 + r.R0 - r.fw / 2, y: Y0 + r.R0 - r.fh / 2, w: r.fw, h: r.fh };
      const src = p.buf.d;
      for (let y = 0; y < D; y++) {
        const Y = Y0 + y;
        if (Y < 0 || Y >= h) continue;
        for (let x = 0; x < D; x++) {
          const m = r.mask[y * D + x];
          if (!m) continue;
          const X = X0 + x;
          if (X < 0 || X >= w) continue;
          const i2 = Y * w + X;
          if (m === 1) d[i2] = src[r.src[y * D + x]];
          else if (m === 2) d[i2] = (x + y + Math.floor(t * 6)) % 5 === 0 || hov ? white : hex('#ffc8ec');
          else d[i2] = mix(d[i2], x < D / 2 ? hex('#ff4ab0') : hex('#4ae0ff'), 0.55);
        }
      }
      // cracks and a pink glow line along them
      for (const seg of r.cracks) seg.forEach(([cx2, cy2], k) => { const X = Math.round(X0 + r.R0 + cx2), Y = Math.round(Y0 + r.R0 + cy2); if (X >= 0 && Y >= 0 && X < w && Y < h) d[Y * w + X] = k < seg.length * 0.5 ? white : mix(d[Y * w + X], hex('#ff9ad8'), 0.7); });
      // floating shards that reflect the scene
      for (const sh of r.shards) {
        const a = sh.a + t * sh.sp, sx = Math.round(X0 + r.R0 + Math.cos(a) * sh.r), sy = Math.round(Y0 + r.R0 + Math.sin(a) * sh.r * 0.7), n = Math.round(sh.s);
        for (let yy = 0; yy < n; yy++) for (let xx = 0; xx <= yy; xx++) {
          const X = sx + ((a * 3) % 2 > 1 ? xx : -xx), Y = sy + yy - n;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          d[Y * w + X] = xx === yy || yy === n - 1 ? white : src[((yy * 23 + i * 50) % H0) * W0 + ((xx * 31 + i * 70) % W0)];
        }
      }
    });
    drawCrit(fb, crits.deoxys, crits.deoxys.x, crits.deoxys.y);
    if (crits.deoxys.boost > 0) for (let k = 0; k < 3; k++) { const rr = (1 - crits.deoxys.boost) * 60 + k * 10; for (let a = 0; a < 6.28; a += 0.05) { const X = Math.round(crits.deoxys.x + Math.cos(a) * rr), Y = Math.round(crits.deoxys.y - 40 + Math.sin(a) * rr * 0.7); if (X >= 0 && Y >= 0 && X < w && Y < h && bayer4(X, Y) < crits.deoxys.boost) d[Y * w + X] = hex('#ffb070'); } }
    for (const m of crits.minior) if (m.near) drawCrit(fb, m, m.u * w, m.v * h + 20);
    drawSparks(fb);
    for (const s of Ly.stars) if (s.d >= 1) star(s, 1.6);
    // arrival / departure: a ring of light tears the view open
    const cx = w / 2, cy = h / 2;
    const k = S.in > 0 ? S.in : S.out > 0 ? 1 - S.out / 0.9 : 0;
    if (k > 0) {
      const rr = (1 - k) * Math.hypot(w, h) * 0.6;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dd = Math.hypot(x - cx, y - cy);
        if (S.in > 0 ? dd > rr : dd < Math.hypot(w, h) * 0.6 * k) d[y * w + x] = S.in > 0 ? mix(d[y * w + x], white, Math.min(1, (dd - rr) / 30)) : mix(d[y * w + x], white, 0.85);
        else if (Math.abs(dd - rr) < 3) d[y * w + x] = hex('#ff9ad8');
      }
    }
  }
  function poke(x, y) {
    if (S.in > 0.3 || S.out > 0) return;
    if (crits) {
      for (const m of crits.minior) if (m.hit(x, y, 4)) { m.crackT = 2.5; Game.sfx('crack', null, 0.7); Game.sfx('chime', null, 0.6); for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, sp = R(30, 90); sparks.push({ x: m.u * S.w, y: m.v * S.h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: R(0.5, 1), core: m.core }); } return; }
      const dx = crits.deoxys;
      if (dx.hit(x, y, 6)) { dx.boost = 1; Game.sfx('roar', null, 0.6); Game.sfx('whoosh', null, 0.8); return; }
    }
    for (let i = 0; i < PIECES.length; i++) {
      const r = PIECES[i].rect;
      if (r && x >= r.x - 4 && y >= r.y - 4 && x < r.x + r.w + 4 && y < r.y + r.h + 4) {
        S.hover = i; Game.sfx('twinkle', null, 0.8);
        openScene(PIECES[i]);
        return;
      }
    }
    leave(null);
  }
  // soft picture-frame vignette and the white flash after a warp
  let vig = null, vw = 0, vh = 0;
  function post(fb) {
    const w = fb.w, h = fb.h, d = fb.d;
    if (!vig || vw !== w || vh !== h) {
      vig = new Uint8Array(w * h); vw = w; vh = h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x / w - 0.5) * 2, v = (y / h - 0.5) * 2, r = Math.max(0, Math.hypot(u * 0.9, v) - 0.72);
        vig[y * w + x] = Math.round(Math.min(0.32, r * r * 0.9) * 255 + bayer4(x, y) * 6);
      }
    }
    for (let i = 0; i < d.length; i++) {
      const k = vig[i];
      if (k < 8) continue;
      const c = d[i], f = 255 - k;
      d[i] = (c & 0xff000000) | ((((c >>> 16) & 255) * f >> 8) << 16) | ((((c >>> 8) & 255) * f >> 8) << 8) | ((c & 255) * f >> 8);
    }
    if (S.flash > 0) {
      S.flash = Math.max(0, S.flash - 0.03);
      for (let i = 0; i < d.length; i++) d[i] = mix(d[i], white, S.flash * 0.8);
    }
  }
  return { S, enter, leave, update, draw, poke, post, openScene, closeScene, PIECES };
})();
