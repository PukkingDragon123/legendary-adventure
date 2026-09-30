/* ------------------------------------------------------------------
   Arena — the cinematic stage for Cards boss battles: a screen-shatter
   transition, letterbox, spotlights, a dedicated backdrop per area
   (stormy rock arena on the beach, abyss ring at sea, moonlit dojo in
   the forest, lava ring in the volcano, a stadium elsewhere), a boss
   title card with a zoom on its face, dramatic music, comic faces
   (anger veins, sweat, shock lines, smug sparkles, dizzy stars) and an
   iris-out exit. While it covers the screen, the world's own layers
   (props, water, foreground, weather) are skipped.
------------------------------------------------------------------- */
const Arena = (() => {
  const { clamp, lerp, hex, mix } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const A = { on: false, cover: false, G: null, hidden: [] };
  const THEMES = {
    beach: { name: 'STORM ROCK ARENA', sky: ['#1a1c3a', '#4a4a6a'], floor: '#6a6a78', edge: '#8a8a98', rain: 1, bolt: 1, sea: '#1a2a4a' },
    abyss: { name: 'THE ABYSS RING', sky: ['#020a2a', '#0a3a7a'], floor: '#2a3a5a', edge: '#4a6a8a', bubbles: 1, water: 1 },
    forest: { name: 'MOONLIT DOJO', sky: ['#0a0a28', '#2a2a5a'], floor: '#7a5230', edge: '#a8784a', moon: 1, trees: 1 },
    volcano: { name: 'LAVA RING', sky: ['#1a0404', '#6a1a0a'], floor: '#2a1a1a', edge: '#4a2a22', lava: 1, embers: 1 },
    other: { name: 'CHAMPION STADIUM', sky: ['#0a0a1a', '#2a1a4a'], floor: '#4a4a5a', edge: '#6a6a7a', crowd: 1 },
  };
  const ease = (k) => U.ease.outCubic(clamp(k, 0, 1));
  function begin(G) {
    const M = Game.mudkip, F = G.foe;
    const th = M.mode === 'swim' || F.mode === 'swim' ? 'abyss' : THEMES[Game.areaId] ? Game.areaId : 'other';
    G.ar = { th: THEMES[th], id: th, t: 0, floor: M.mode === 'swim' ? Math.max(M.y, F.y) + 30 : M.y, dark: 1, spotF: 0, spotM: 0, bars: 0.16, title: -1, shatter: 0, out: -1, bolt: 0 };
    try { const f = Game.hdFrame ? Game.hdFrame(Game.cx, Game.cy) : null; const src = f || Game.fb(); G.ar.snap = { w: src.w, h: src.h, d: new Uint32Array(src.d) }; } catch (e) { G.ar.snap = null; }
    G.ar.shards = [];
    for (let i = 0; i < 26; i++) G.ar.shards.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, r: (Math.random() - 0.5) * 6 });
    A.on = true; A.G = G; A.cover = true;
    A.hidden = []; for (const m of Game.mons) if (m !== M && m !== F && m.visible) { m.visible = false; A.hidden.push(m); }
    try { Game.sfx('lensCrack', null, 1); Game.sfx('thud', null, 1); } catch (e) { /* */ }
    try { Music.play('legend'); } catch (e) { /* */ }
  }
  function stop() { for (const m of A.hidden) if (m.alive) m.visible = true; A.hidden = []; A.on = false; A.cover = false; A.G = null; if (Game.cine) Game.cine.zk = 1; }
  function skip(G) { G.ar.skip = true; }
  function* wait(T, G) { let e = 0; while (e < T && !G.ar.skip) e += yield; }
  function* intro(G) {
    const R = G.ar, F = G.foe;
    yield* wait(0.9, G); R.shatter = 1;
    const h = F.headPt();
    G.cam = { x: F.x, y: (h[1] + F.y) / 2, zoom: 2.2, speed: 12 };
    R.spotF = 1; Game.sfx('stamp', null, 1);
    yield* wait(0.4, G);
    R.title = 0; Game.sfx('roar', F.x, 0.8);
    G.them.face = { kind: 'anger', t: 0, life: 1.8 };
    yield* wait(1.2, G);
    G.bubbles.push({ who: 'them', text: (G.fd.lines && G.fd.lines.intro ? U.pick(G.fd.lines.intro) : 'Hmph!'), t: 0, life: 1.4, shout: true });
    G.zoom = { who: 'them', t: 1, T: 1.4, z: 2.2 };
    yield* wait(1.3, G);
    G.zoom = null; G.cam = null; R.spotM = 1; R.title = -1; R.shatter = 1;
    Game.sfx('stamp', null, 0.8);
    R.fight = 0; yield* wait(0.7, G); R.fight = -1;
    R.spotF = R.spotM = 1; G.bubbles.length = 0; R.skip = false;
  }
  function update(dt, G) {
    const R = G.ar; R.t += dt;
    if (R.shatter > 0 && R.shatter < 99) R.shatter += dt;
    if (R.title >= 0) R.title += dt; if (R.fight >= 0) R.fight += dt;
    R.dark = lerp(R.dark, G.step === 'intro' && !G.ar.spotM ? 0.75 : 0.35, dt * 3);
    R.bars = lerp(R.bars, G.step === 'intro' || G.step === 'ko' ? 0.16 : 0.075, dt * 3);
    if (R.th.bolt && Math.random() < dt * 0.25) { R.bolt = 0.25; try { Game.sfx('zap', null, 0.3); } catch (e) { /* */ } }
    R.bolt = Math.max(0, R.bolt - dt);
    if (G.over && R.out < 0) R.out = 0;
    if (R.out >= 0) { R.out += dt; if (R.out > 0.5 && A.cover) { A.cover = false; for (const m of A.hidden) if (m.alive) m.visible = true; A.hidden = []; Game.camFocus = null; } }
  }
  const outDone = (G) => G.ar.out > 1.0;
  const barH = (G, H) => Math.round(H * G.ar.bars);
  /* ---------- world: the backdrop (before the Pokémon) ---------- */
  function drawBack(fb, cx, cy, t, G) {
    if (!A.cover) return;
    const R = G.ar, T = R.th, W = fb.w, H = fb.h, d = fb.d;
    const s0 = hex(T.sky[0]), s1 = hex(T.sky[1]), fy = Math.round(R.floor - cy), par = cx * 0.2;
    for (let y = 0; y < H; y++) { const c = mix(s0, s1, clamp(y / Math.max(1, fy), 0, 1)); d.fill(R.bolt > 0.15 ? mix(c, WHITE, 0.4) : c, y * W, y * W + W); }
    if (T.moon) UI.disc(fb, Math.round(W * 0.75 - par * 0.2), Math.round(fy * 0.35), 16, hex('#f0f0d0'));
    if (T.trees) for (let x = -20; x < W + 20; x += 14) { const X = Math.round(((x - par) % (W + 40) + W + 40) % (W + 40) - 20), h = 40 + ((x * 7) % 30); for (let k = 0; k < h; k++) UI.hline(fb, X - Math.round(k * 0.18), X + Math.round(k * 0.18), fy - h + k, hex('#0a1418')); }
    if (T.sea) for (let y = fy - 30; y < fy; y++) { UI.hline(fb, 0, W, y, mix(hex(T.sea), s1, 0.3)); if ((y + ((t * 8) | 0)) % 7 === 0) for (let x = 0; x < W; x += 9) UI.put(fb, (x + y * 3) % W, y, hex('#c8d8f0')); }
    if (T.lava) { for (let x = 0; x < W; x++) { const h = 30 + Math.round(Math.sin((x + par) * 0.03) * 10); UI.vline(fb, x, fy - h, fy, hex('#2a0a08')); } const vx = Math.round(W * 0.6 - par * 0.3); for (let k = 0; k < 60; k++) UI.hline(fb, vx - k, vx + k, fy - 60 + k, hex('#1a0606')); UI.disc(fb, vx, fy - 62, 4, hex('#ff6a1a')); }
    if (T.crowd) for (let x = 0; x < W; x += 5) { const bob = Math.round(Math.sin(t * 6 + x) * 1); UI.disc(fb, x, fy - 30 + bob + (x % 3), 3, hex('#1a1030')); }
    // the floor: a stone ring with a front lip
    const fl = hex(T.floor), ed = hex(T.edge);
    for (let y = Math.max(0, fy - 10); y < H; y++) { const top = y < fy + 2; for (let x = 0; x < W; x++) d[y * W + x] = top ? ed : y < fy + 16 ? (PX.bayer4(x + cx, y) < 0.15 ? mix(fl, INK, 0.3) : fl) : mix(fl, INK, 0.5); }
    for (let x = 0; x < W; x += 1) if (((x + cx) & 31) === 0) UI.vline(fb, x, fy - 9, fy + 15, mix(fl, INK, 0.4));
    if (T.lava) for (let y = fy + 16; y < Math.min(H, fy + 26); y++) for (let x = 0; x < W; x++) d[y * W + x] = mix(hex('#ff5a0a'), hex('#ffd04a'), (Math.sin((x + cx) * 0.2 + t * 3 + y) + 1) / 2);
    if (T.water) for (let y = fy + 16; y < H; y++) UI.hline(fb, 0, W, y, hex('#0a2a5a'));
    // pedestal under a foe standing higher (Walrein on its rock)
    const F = G.foe, py = Math.round(F.y - cy);
    if (F.mode !== 'swim' && py < fy - 8) { const px = Math.round(F.x - cx); for (let y = py; y < fy; y++) UI.hline(fb, px - 24, px + 24, y, y === py ? ed : fl); }
    try { const occ = Game.occ(); occ && occ.fill(0); } catch (e) { /* */ }
    for (const m of [Game.mudkip, F]) Critters.shadow(fb, cx, cy, m.x, m.mode === 'swim' ? R.floor : m.y + 1, m.width() * 0.4, 3, 0.9);
  }
  /* ---------- world: spotlights, darkness, weather (after the Pokémon) ---------- */
  function drawFront(fb, cx, cy, t, G) {
    if (!A.cover) return;
    const R = G.ar, T = R.th, W = fb.w, H = fb.h, d = fb.d;
    const spots = [];
    if (R.spotF) spots.push(G.foe.x - cx); if (R.spotM) spots.push(Game.mudkip.x - cx);
    const dk = R.dark;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let lit = 0; for (const sx of spots) { const w = 18 + y * 0.28; const k = 1 - Math.abs(x - sx) / w; if (k > lit) lit = k; }
      const i = y * W + x; const k = dk * (1 - clamp(lit * 1.6, 0, 1));
      if (k > 0.01) d[i] = mix(d[i], 0xff05030a, k); else if (lit > 0.3) d[i] = mix(d[i], hex('#fff0d0'), 0.08);
    }
    if (T.rain || G.you.st.rain) for (let k = 0; k < 90; k++) { const x = (k * 53 + Math.floor(t * 300)) % W, y = (k * 29 + Math.floor(t * 500)) % H; UI.line(fb, x, y, x - 2, y + 5, 0xffa8c0e0); }
    if (T.embers || T.bubbles) for (let k = 0; k < 30; k++) { const x = (k * 71) % W, y = H - ((k * 37 + t * (T.embers ? 40 : 25)) % H); UI.put(fb, Math.round(x + Math.sin(t + k) * 3), Math.round(y), T.embers ? hex('#ffa03a') : hex('#c8f0ff')); }
    if (R.bolt > 0.12) { let x = Math.round(W * 0.3 + (R.t * 97 % 1) * W * 0.4), y = 0; while (y < R.floor - cy - 40) { const nx = x + Math.round((Math.random() - 0.5) * 10); UI.line(fb, x, y, nx, y + 8, WHITE); x = nx; y += 8; } }
    if (G.you.st.sun) for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) if (((x + y) & 15) === 0) d[y * W + x] = mix(d[y * W + x], hex('#ffe070'), 0.3);
  }
  /* ---------- UI ---------- */
  function drawUnder(fb, t, G) {
    const W = fb.w, H = fb.h, bh = barH(G, H);
    UI.rect(fb, 0, 0, W, bh, 0xff05060c); UI.rect(fb, 0, H - bh, W, bh, 0xff05060c);
    if (G.step === 'intro' && G.ar.shatter > 0.5) Font.draw(fb, G.ar.th.name, W / 2, H - bh + Math.round(bh / 2) - 3, hex('#c8c0e0'), { font: 'small', align: 'center' });
  }
  function drawFaces(fb, t, G, head) {
    for (const [u, m] of [[G.you, Game.mudkip], [G.them, G.foe]]) {
      const [hx, hy] = head(m), f = u.face, X = Math.round(hx), Y = Math.round(hy);
      if (u.dizzyT > 0 || u.ko) for (let s = 0; s < 3; s++) { const an = t * 5 + s * 2.09; const x = Math.round(hx + Math.cos(an) * 12), y = Math.round(hy - 2 + Math.sin(an) * 4); UI.put(fb, x, y, WHITE); UI.put(fb, x - 1, y, hex('#ffe040')); UI.put(fb, x + 1, y, hex('#ffe040')); UI.put(fb, x, y - 1, hex('#ffe040')); UI.put(fb, x, y + 1, hex('#ffe040')); }
      if (!f) continue;
      const p = 1 + Math.round(Math.abs(Math.sin(f.t * 10)));
      if (f.kind === 'anger') { const ax = X + 10, ay = Y - 6; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { UI.rect(fb, ax + dx * (p + 1) - 1, ay + dy * (p + 1) - 1, 3, 3, INK); UI.rect(fb, ax + dx * (p + 1), ay + dy * (p + 1), 1 + (dx > 0 ? 1 : 0), 1, hex('#ff3a3a')); } Font.draw(fb, '#', ax, ay - 3, hex('#ff3a3a'), { font: 'small', align: 'center', outline: INK }); }
      else if (f.kind === 'shock') { Font.draw(fb, '!!', X, Y - 16 - p, hex('#ffe040'), { font: 'body', align: 'center', outline: INK }); for (let k = -1; k <= 1; k++) UI.vline(fb, X + k * 4, Y + 2, Y + 7, hex('#6a8aff')); }
      else if (f.kind === 'smug' || f.kind === 'laugh') { Font.draw(fb, f.kind === 'laugh' ? 'HA HA' : 'heh~', X + 14, Y - 8 - p, WHITE, { font: 'small', outline: INK }); UI.put(fb, X - 10, Y - 6, WHITE); UI.put(fb, X - 11, Y - 6, hex('#ffe070')); UI.put(fb, X - 9, Y - 6, hex('#ffe070')); }
      else if (f.kind === 'hurt') { UI.disc(fb, X + 9, Y - 2 + p, 2, hex('#8ac8ff')); }
    }
  }
  function drawOver(fb, t, G) {
    const R = G.ar, W = fb.w, H = fb.h;
    // zoom-in focus lines
    if (G.zoom) for (let k = 0; k < 40; k++) { const a = k * 0.157 + t * 0.5, r0 = Math.max(W, H) * (0.42 + ((k * 7) % 5) * 0.02); UI.line(fb, Math.round(W / 2 + Math.cos(a) * r0), Math.round(H / 2 + Math.sin(a) * r0), Math.round(W / 2 + Math.cos(a) * W), Math.round(H / 2 + Math.sin(a) * W), 0xccffffff); }
    // title card
    if (R.title >= 0) {
      const k = ease(R.title / 0.3), y = Math.round(H * 0.62), bw = Math.round(W * k);
      UI.rect(fb, 0, y - 2, bw, 34, INK); UI.rect(fb, 0, y, bw, 30, hex('#b82a2a')); UI.rect(fb, 0, y + 30, bw, 2, hex('#ffd070'));
      const sc = W >= 420 ? 2 : 1;
      Font.draw(fb, (U.clamp ? '' : '') + (DexData.S[G.foe.dex] || { name: '?' }).name.toUpperCase(), Math.round(W * 0.08 + (1 - k) * -80), y + 4, hex('#ffe070'), { font: 'title', outline: INK, sc });
      Font.draw(fb, '- ' + (G.fd.title || 'Challenger') + ' -', Math.round(W * 0.08 + (1 - k) * -120), y + 22, WHITE, { font: 'small', outline: INK });
    }
    if (R.fight >= 0) { const k = ease(R.fight / 0.2); Font.draw(fb, 'BATTLE!', W / 2, Math.round(H * 0.4), hex('#ffe070'), { font: 'title', align: 'center', outline: INK, sc: k > 0.5 ? 2 : 1 }); }
    // screen shatter (the frozen world breaks away)
    const S = R.snap, st = G.step === 'intro' ? R.shatter : 99;
    if (S && st < 1.4) {
      const sx = S.w / W, sy = S.h / H, k = st;
      if (k < 0.01) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb.d[y * W + x] = S.d[Math.floor(y * sy) * S.w + Math.floor(x * sx)]; }
      else {
        const n = 6, cw = W / n, chh = H / 4;
        for (let j = 0; j < 4; j++) for (let i = 0; i < n; i++) {
          const q = G.ar.shards[(j * n + i) % G.ar.shards.length], dx = (q.vx * 120 + (i - n / 2) * 20) * k, dy = (q.vy * 60 + 260 * k) * k, a = q.r * k * 0.3, ca = Math.cos(a), sa = Math.sin(a);
          const x0 = i * cw, y0 = j * chh, mx = x0 + cw / 2, my = y0 + chh / 2;
          for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
            const ux = x - cw / 2, uy = y - chh / 2, X = Math.round(mx + dx + ux * ca - uy * sa), Y = Math.round(my + dy + ux * sa + uy * ca);
            if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
            const c = S.d[Math.min(S.h - 1, Math.floor((y0 + y) * sy)) * S.w + Math.min(S.w - 1, Math.floor((x0 + x) * sx))];
            fb.d[Y * W + X] = (x === 0 || y === 0) ? WHITE : c;
          }
        }
      }
    } else if (G.step === 'intro' && R.shatter === 0 && S) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb.d[y * W + x] = S.d[Math.floor(y * S.h / H) * S.w + Math.floor(x * S.w / W)]; for (let k = 0; k < 10; k++) UI.line(fb, W / 2, H / 2, Math.round(W / 2 + Math.cos(k * 0.63) * W), Math.round(H / 2 + Math.sin(k * 0.63) * W), WHITE); }
    // iris out / in
    if (R.out >= 0) {
      const k = R.out < 0.5 ? 1 - R.out / 0.5 : (R.out - 0.5) / 0.5, rr = Math.hypot(W, H) * 0.6 * k;
      const [cx, cy] = Talk.toUI(Game.mudkip.x, Game.mudkip.y - 10);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, y - cy) > rr) fb.d[y * W + x] = 0xff000000;
    }
  }
  function sadTrombone() {
    try {
      const ac = Sound.ctx(); if (!ac || !Sound.on) return; const out = Sound.sfxBus ? Sound.sfxBus() : ac.destination, t0 = ac.currentTime + 0.05;
      [[311, 0.35], [293, 0.35], [277, 0.35], [262, 1.1]].forEach(([f, d], i) => { const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * 0.4; o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); if (i === 3) for (let k = 0; k < 8; k++) o.frequency.setValueAtTime(f * (k % 2 ? 0.97 : 1), t + k * 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05); });
    } catch (e) { /* no audio */ }
  }
  // while the arena covers the screen, skip the world's own layers drawn over/around it
  const skipWhen = (obj, names) => { if (!obj) return; for (const n of names) { const f = obj[n]; if (typeof f !== 'function') continue; obj[n] = function () { if (A.cover) return; return f.apply(this, arguments); }; } };
  skipWhen(Stage, ['drawLate', 'drawWater', 'drawFore', 'drawGlows']);
  { const f = Stage.drawProps; Stage.drawProps = function (fb, cx, cy, t, front) { if (A.cover && front) return; return f.apply(this, arguments); }; }
  skipWhen(typeof Weather !== 'undefined' ? Weather : null, ['draw']);
  skipWhen(typeof Seasons !== 'undefined' ? Seasons : null, ['draw']);
  skipWhen(typeof Harvest !== 'undefined' ? Harvest : null, ['draw', 'drawUnder', 'drawFore']);
  skipWhen(typeof Items !== 'undefined' ? Items : null, ['draw']);
  skipWhen(typeof Shaders !== 'undefined' ? Shaders : null, ['apply']);
  U.on && U.on('area', () => stop());
  return Object.assign(A, { THEMES, begin, stop, skip, intro, update, outDone, barH, drawBack, drawFront, drawUnder, drawFaces, drawOver, sadTrombone });
})();
