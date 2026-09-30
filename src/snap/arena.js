/* ------------------------------------------------------------------
   Arena — the cinematic stage for Cards boss battles.
   First the WALK-IN, out in the real world: a cut to black, then
   letterbox tracking shots — Mudkip strides up (its name plate slides
   in), cut to the boss stomping over (the ground shakes, its title
   plate), then a wide stare-down with a VS slam, the boss's taunt, wind
   and a tumbleweed, while the locals gather round and cheer. The final
   frame freezes and SHATTERS into the arena.
   The arena itself: a screen-shatter transition, letterbox, spotlights, a dedicated backdrop per area
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
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* */ } };
  const nm = (m) => (DexData.S[m.dex] || { name: '?' }).name;
  /* ---------- the walk-in: where both fighters start and stop ---------- */
  // safe ground between a and b: dry, no steps or ledges, inside the area
  function safe(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo < 40 || hi > World.W - 40) return false;
    let py = World.groundAt(lo);
    for (let x = lo; x <= hi; x += 4) { const y = World.groundAt(x); if (World.isWet(x, 12) || Math.abs(y - py) > 7) return false; py = y; }
    return true;
  }
  function room(x, dir, max) { let d = 0; while (d < max && safe(x, x + dir * (d + 6))) d += 6; return d; }
  // → { mx, fx: the marks, mx0, fx0: where the walk starts } or null (no walk-in: e.g. mid-jump)
  function plan(M, F, side) {
    const landM = M.mode === 'land' && !M.plat && !M.floe && (M.air || 0) <= 0;
    if (M.mode === 'swim' || F.mode === 'swim') {
      const fx = World.isWet(M.x + side * 112, 10) ? M.x + side * 112 : F.x;
      return { mx: M.x, fx, mx0: M.x, fx0: F.x, swim: true };
    }
    if (!landM) return null;
    let c = clamp((M.x + F.x) / 2, 120, World.W - 120), mx = c - side * 56, fx = c + side * 56;
    if (!safe(mx, fx)) { mx = M.x; fx = M.x + side * 112; if (!safe(mx, fx)) return { mx: M.x, fx: F.x, mx0: M.x, fx0: F.x, still: true }; }
    const fly = F.mode !== 'land';
    const wm = room(mx, -side, 96), wf = fly ? 0 : room(fx, side, 90);
    return { mx, fx, mx0: mx - side * wm, fx0: fly ? F.x : fx + side * wf, fly };
  }
  function begin(G, P) {
    const M = Game.mudkip, F = G.foe;
    const th = M.mode === 'swim' || F.mode === 'swim' ? 'abyss' : THEMES[Game.areaId] ? Game.areaId : 'other';
    G.ar = { th: THEMES[th], id: th, t: 0, floor: M.mode === 'swim' ? Math.max(M.y, F.y) + 30 : M.y, dark: 1, spotF: 0, spotM: 0, bars: P ? 0 : 0.16, title: -1, shatter: 0, out: -1, bolt: 0, plan: P, black: 0, wt: 0, dim: 0, vs: -1, flash: 0 };
    A.on = true; A.G = G;
    try { Music.play('legend'); } catch (e) { /* */ }
    if (P) {
      A.walking = true;
      crowd(G, P); sfx('whoosh', null, 0.6);
      // let the camera look lower than usual, so the tight low shots can frame the fighters' feet
      const Ar = Game.area; if (Ar && !A.peekA) { A.peekA = Ar; A.peek0 = Ar.floorPeek; Ar.floorPeek = Math.max(Ar.floorPeek ?? 40, 100); }
    }
    else cut(G);
  }
  // freeze the frame and cover the world with the arena (the shatter plays in intro)
  function cut(G) {
    const M = Game.mudkip, F = G.foe, R = G.ar;
    restorePeek(); A.walking = false;
    R.floor = M.mode === 'swim' ? Math.max(M.y, F.y) + 30 : Math.max(M.y, F.mode === 'land' ? Math.min(F.y, M.y + 30) : M.y);
    try { const f = Game.hdFrame ? Game.hdFrame(Game.cx, Game.cy) : null; const src = f || Game.fb(); R.snap = { w: src.w, h: src.h, d: new Uint32Array(src.d) }; } catch (e) { R.snap = null; }
    R.shards = [];
    for (let i = 0; i < 26; i++) R.shards.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, r: (Math.random() - 0.5) * 6 });
    A.cover = true; R.shatter = 0;
    A.hidden = []; for (const m of Game.mons) if (m !== M && m !== F && m.visible) { m.visible = false; A.hidden.push(m); }
    sfx('lensCrack', null, 1); sfx('thud', null, 1);
  }
  // the locals gather to watch: they turn to the ring, hop, cheer and gasp
  function crowd(G, P) {
    const M = Game.mudkip, F = G.foe, cx = (P.mx + P.fx) / 2;
    const list = Mons.all.filter((m) => m !== M && m !== F && m.alive && m.visible && !m.layer && !m.arcade && m.doTask && !String(m.kind).startsWith('bg-') && m.mode !== 'fly' && Math.abs(m.x - cx) < Game.VW * 0.95 && !m.busy(8))
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx)).slice(0, 8);
    G.crowd = list;
    for (const m of list) m.doTask(cheer(m, G, cx), 8);
  }
  function* cheer(m, G, cx) {
    let next = U.rnd(0.3, 1.2);
    while (A.G === G && (G.step === 'walk' || G.step === 'intro')) {
      const dt = yield; next -= dt;
      m.turn && m.turn(m.face(cx > m.x ? 1 : -1, false), dt, 6);
      m.setAct && m.setAct('idle', 0.2);
      if (next <= 0) {
        next = U.rnd(0.8, 1.8);
        const ic = U.pick(G.ar && G.ar.vs >= 0 ? ['shock', 'sweat', 'anger'] : ['note', 'heart', 'star', 'shock']);
        if (Math.random() < 0.25) m.emote(ic, 1); else FX.emote(ic, () => m.headPt(), { life: 1 });
        if (m.mode === 'land' && (m.air || 0) <= 0 && Math.random() < 0.7) { m.vair = 150; m.air = 0.5; }
      }
    }
  }
  function* walk(G) {
    const R = G.ar, P = R.plan, M = Game.mudkip, F = G.foe, side = G.side, W = G.wk;
    const quick = !!(G.o && G.o.rematch) || P.still || P.swim;
    const tA = quick ? 0 : 0.22, tB = quick ? 0 : tA + 1.2, tC = quick ? 0 : tB + 1.15, tEnd = tC + (quick ? 1.5 : 1.3);
    const w0 = quick ? 0 : tA + 0.08, w1 = quick ? 1.1 : tC + 0.05;
    const sm = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k, 0, 1));
    const fh = F.spr ? F.spr.h : 40, heavy = (F.spr ? F.spr.w * F.spr.h : 900) > 1600 && !P.fly;
    let e = 0, shot = '', stomp = 0, dust = 0, clap = U.rnd(0.4, 0.9);
    R.placed = quick;
    if (quick) { W.mx = P.mx0; W.fx = P.fx0; }
    while (e < tEnd && !R.skip) {
      const dt = yield; e += dt; R.wt = e;
      R.bars = lerp(R.bars, 0.14, Math.min(1, dt * 6)); R.dim = lerp(R.dim, 0.42, Math.min(1, dt * 2));
      // a cut to black, the fighters go to their starting spots, then the lights come up
      if (!quick) R.black = e < tA ? e / tA : Math.max(0, 1 - (e - tA) / 0.22);
      if (!R.placed && e >= tA) { R.placed = true; W.mx = P.mx0; W.fx = P.fx0; }
      if (R.placed) {
        const px = W.mx, pf = W.fx, k = sm((e - w0) / (w1 - w0));
        W.mx = lerp(P.mx0, P.mx, k); W.fx = lerp(P.fx0, P.fx, P.fly ? ease((e - w0) / (w1 - w0) * 1.3) : k);
        W.mv = Math.abs(W.mx - px) / Math.max(dt, 0.001); W.fv = Math.abs(W.fx - pf) / Math.max(dt, 0.001);
      }
      // the shots: A tracks Mudkip, B the boss, C the stare-down
      const want = quick ? 'C' : e < tB ? 'A' : e < tC ? 'B' : 'C';
      if (want !== shot) { shot = want; R.shot = want; R.shotT = 0; if (want !== 'A') sfx('whoosh', null, 0.5); if (want === 'B') { sfx('grr', F.x, 0.9); try { Cries.play(F.dex, F.x, 0.9, true); } catch (err) { /* */ } } }
      R.shotT += dt;
      if (shot === 'A') G.cam = { x: W.mx + side * 34, y: M.y - 16, zoom: 1.85, speed: 8, cut: R.shotT <= dt + 1e-6 };
      else if (shot === 'B') G.cam = { x: W.fx - side * 30, y: F.y - fh * 0.36, zoom: 1.7, speed: 8, cut: R.shotT <= dt + 1e-6 };
      else { const kc = clamp(R.shotT / 1.3, 0, 1); G.cam = { x: (W.mx + W.fx) / 2, y: Math.max(M.y, F.y) - 30, zoom: lerp(1.22, 1.4, kc), speed: 5, cut: R.shotT <= dt + 1e-6 }; }
      // footsteps: dust puffs, and the boss shakes the ground
      dust -= dt; if (W.mv > 8 && dust <= 0 && M.mode === 'land') { dust = 0.28; FX.poof && FX.poof(M.x - side * 6, M.y - 1, U.hex('#e8dcc0'), U.hex('#fff4e0'), 2, 3); }
      stomp -= dt;
      if (W.fv > 8 && stomp <= 0) { stomp = heavy ? 0.46 : 0.34; if (!P.fly) { FX.poof && FX.poof(F.x + side * 4, F.y - 1, U.hex('#d8ccb0'), U.hex('#fff0d8'), heavy ? 4 : 2, heavy ? 5 : 3); if (shot === 'B') { sfx(heavy ? 'thud' : 'pat', F.x, heavy ? 0.8 : 0.5); if (heavy) Game.shake && Game.shake(1.6); } } else if (shot === 'B') sfx('whoosh', F.x, 0.4); }
      clap -= dt; if (clap <= 0 && G.crowd.length) { clap = U.rnd(0.5, 1.1); sfx('clap', null, 0.5); setTimeout(() => sfx('clap', null, 0.35), 90); }
      // the stare-down: a VS slam, the boss's taunt, Mudkip's answer
      if (shot === 'C') {
        if (R.vs < 0 && R.shotT > 0.12) { R.vs = 0; R.flash = 0.22; sfx('stamp', null, 1); sfx('thud', null, 0.7); Game.shake && Game.shake(3); G.kick = 0.3; }
        if (!R.said && R.shotT > 0.3) { R.said = true; G.bubbles.push({ who: 'them', text: (G.fd.lines && G.fd.lines.intro ? U.pick(G.fd.lines.intro) : 'Hmph!'), t: 0, life: 1.1, shout: true }); G.them.face = { kind: 'anger', t: 0, life: 1.2 }; try { Cries.play(F.dex, F.x, 0.9, true); } catch (err) { /* */ } }
        if (!R.said2 && R.shotT > 0.85) { R.said2 = true; G.bubbles = G.bubbles.filter((b) => b.who !== 'you'); G.bubbles.push({ who: 'you', text: U.pick(['MUD-KIP!', 'Kip! (Bring it!)', 'Mud mud!']), t: 0, life: 0.7, shout: true }); G.you.face = { kind: 'anger', t: 0, life: 0.6 }; try { Cries.mudkip(); } catch (err) { /* */ } }
      }
      if (R.vs >= 0) R.vs += dt;
      R.flash = Math.max(0, R.flash - dt);
    }
    // done (or skipped): on the marks, then freeze the frame and break it
    W.mx = P.mx; W.fx = P.fx; W.mv = W.fv = 0; R.black = 0; R.shot = 'C';
    if (F.mode === 'fly') { F.mode = 'land'; F.perched = true; F.air = 0; F.vair = 0; F.y = World.groundAt(P.fx); }
    G.cam = { x: (P.mx + P.fx) / 2, y: Math.max(M.y, F.y) - 24, zoom: 1.35, speed: 99, cut: true };
    yield;
    G.cam = null; R.walked = true;
    cut(G);
  }
  function restorePeek() { const Ar = A.peekA; if (Ar) { if (A.peek0 === undefined) delete Ar.floorPeek; else Ar.floorPeek = A.peek0; } A.peekA = null; A.peek0 = undefined; }
  function stop() { restorePeek(); A.walking = false; for (const m of A.hidden) if (m.alive) m.visible = true; A.hidden = []; A.on = false; A.cover = false; A.G = null; if (Game.cine) Game.cine.zk = 1; }
  function skip(G) { G.ar.skip = true; }
  function* wait(T, G) { let e = 0; while (e < T && !G.ar.skip) e += yield; }
  function* intro(G) {
    const R = G.ar, F = G.foe;
    if (R.walked) {
      // after the walk-in: the frozen stare-down cracks and shatters, spotlights, BATTLE!
      G.bubbles.length = 0;
      yield* wait(0.3, G); R.shatter = 1;
      R.spotF = R.spotM = 1; sfx('stamp', null, 0.9);
      yield* wait(0.45, G);
      R.fight = 0; sfx('stamp', null, 0.8); yield* wait(0.55, G); R.fight = -1;
      R.skip = false;
      return;
    }
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
    if (G.step !== 'walk') R.bars = lerp(R.bars, G.step === 'intro' || G.step === 'ko' || G.step === 'prize' ? 0.14 : 0.075, dt * 3);
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
    if (F.mode === 'land' && py < fy - 8) { const px = Math.round(F.x - cx); for (let y = py; y < fy; y++) UI.hline(fb, px - 24, px + 24, y, y === py ? ed : fl); }
    try { const occ = Game.occ(); occ && occ.fill(0); } catch (e) { /* */ }
    for (const m of [Game.mudkip, F]) Critters.shadow(fb, cx, cy, m.x, m.mode === 'swim' ? R.floor : m.y + 1, m.width() * 0.4, 3, 0.9);
  }
  /* ---------- world: spotlights, darkness, weather (after the Pokémon) ---------- */
  function drawFront(fb, cx, cy, t, G) {
    if (G.step === 'walk' && G.ar) { drawWalkWorld(fb, cx, cy, t, G); return; }
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
    if (G.you.st.hail || G.hailT > 0) for (let k = 0; k < (G.hailT > 0 ? 80 : 40); k++) { const x = (k * 61 + Math.floor(t * 180)) % W, y = (k * 43 + Math.floor(t * 330)) % H; UI.put(fb, x, y, WHITE); UI.put(fb, x + 1, y, hex('#d8f4ff')); UI.put(fb, x, y + 1, hex('#d8f4ff')); }
  }
  /* ---------- the walk-in, drawn over the live world ---------- */
  function drawWalkWorld(fb, cx, cy, t, G) {
    const R = G.ar, W = fb.w, H = fb.h, d = fb.d, M = Game.mudkip, F = G.foe;
    // a soft stage light on each fighter, the rest of the world dims
    const dk = R.dim; if (dk > 0.02) {
      const s1 = M.x - cx, s2 = F.x - cx;
      for (let y = 0; y < H; y++) { const r = 34 + y * 0.35, row = y * W; for (let x = 0; x < W; x++) { const l = Math.max(1 - Math.abs(x - s1) / r, 1 - Math.abs(x - s2) / r, 0); const k = dk * (1 - clamp(l * 1.7, 0, 1)); if (k > 0.02) d[row + x] = mix(d[row + x], 0xff0a0612, k); } }
    }
    // wind streaks skimming the ground, and in the stare-down a tumbleweed rolls between them
    const gy = Math.round(Math.max(M.y, F.y) - cy);
    for (let k = 0; k < 16; k++) { const x = Math.round(((k * 83 + t * (R.shot === 'C' ? 300 : 160)) % (W + 60)) - 30), y = gy - 3 - ((k * 13) % 34); if (y < 0 || y >= H) continue; for (let j = 0; j < 7 + (k % 4) * 2; j++) UI.blend ? UI.blend(fb, x - j, y, WHITE, 0.4 * (1 - j / 12)) : UI.put(fb, x - j, y, WHITE); }
    if (R.shot === 'C' && R.shotT > 0.2) {
      const k = (R.shotT - 0.2) / 1.2, x0 = Math.min(M.x, F.x) - 90, x1 = Math.max(M.x, F.x) + 90, wx = lerp(x0, x1, k);
      const X = Math.round(wx - cx), Y = Math.round(World.groundAt(wx) - cy - 5 - Math.abs(Math.sin(k * 14)) * 7), a = k * 20;
      if (X > -10 && X < W + 10) { for (let q = 0; q < 26; q++) { const an = a + q * 0.73, r = 3 + (q % 3); UI.put(fb, X + Math.round(Math.cos(an) * r), Y + Math.round(Math.sin(an) * r), q % 2 ? hex('#a8844a') : hex('#6a4a2a')); } UI.ring(fb, X, Y, 5, hex('#8a6a3a')); }
    }
  }
  function drawWalk(fb, t, G) {
    const R = G.ar, W = fb.w, H = fb.h, bh = Math.round(H * R.bars), M = Game.mudkip, F = G.foe, B = G.o && G.o.boss;
    UI.rect(fb, 0, 0, W, bh, 0xff05060c); UI.rect(fb, 0, H - bh, W, bh, 0xff05060c);
    const sc = W >= 420 ? 2 : 1;
    // name plates: Mudkip's slides in from the left in shot A, the boss's from the right in shot B
    const plate = (x, y, w, col, name, sub, tag, right, k) => {
      const X = Math.round(right ? W - w - x + (1 - k) * (w + 40) : x - (1 - k) * (w + 40));
      for (let r = 0; r < 26; r++) { const sl = Math.round((26 - r) * 0.35); UI.hline(fb, X + (right ? sl : -sl), X + w + (right ? 0 : -sl * 2) , y + r, r < 2 ? U.mix(col, WHITE, 0.4) : r > 23 ? U.mix(col, 0xff000000, 0.4) : col); }
      UI.rect(fb, X - 4, y + 26, w + 8, 2, hex('#ffd070'));
      Font.draw(fb, name, right ? X + w - 6 : X + 6, y + 3, hex('#ffe070'), { font: 'title', outline: INK, align: right ? 'right' : 'left', sc: sc > 1 && Font.measure(name, 'title', 2) < w - 12 ? 2 : 1 });
      Font.draw(fb, sub, right ? X + w - 6 : X + 6, y + 31, WHITE, { font: 'small', outline: INK, align: right ? 'right' : 'left' });
      if (tag) { const tw = Font.measure(tag, 'small') + 8, tx = right ? X + 4 : X + w - tw - 4; UI.rrect(fb, tx, y - 9, tw, 10, 3, INK); UI.rrect(fb, tx + 1, y - 8, tw - 2, 8, 2, hex('#e8a020')); Font.draw(fb, tag, tx + tw / 2, y - 7, WHITE, { font: 'small', align: 'center' }); }
    };
    const pw = Math.min(W - 30, Math.round(W * 0.48)), py = H - bh - 44;
    if (R.shot === 'A') { const k = ease(R.shotT / 0.3) * (1 - ease((R.shotT - 1.0) / 0.2)); const lv = typeof Progress !== 'undefined' && Progress.level ? Progress.level() : 1; plate(14, py, pw, hex('#1c54b8'), 'MUDKIP', 'Lv ' + lv + '  ·  Hoenn photographer  ·  ' + Cards.battleDeck().length + ' cards', null, false, k); }
    if (R.shot === 'B') {
      const k = ease(R.shotT / 0.3) * (1 - ease((R.shotT - 0.95) / 0.2));
      const area = DexData.AREAS[Game.areaId] ? DexData.AREAS[Game.areaId].name : '';
      plate(14, py, pw, hex('#b8242a'), nm(F).toUpperCase(), '- ' + (G.fd.title || 'Challenger') + ' -', B && B.boss ? 'BOSS OF ' + area.toUpperCase() : B && B.rival ? 'RIVAL' : 'CHALLENGER', true, k);
    }
    // stare-down: names over each side of the top bar
    if (R.shot === 'C') {
      const [mx] = Talk.toUI(M.x, M.y), [fx] = Talk.toUI(F.x, F.y), ty = Math.max(2, Math.round(bh / 2 - 4));
      Font.draw(fb, 'MUDKIP', clamp(mx, 30, W - 30), ty, hex('#8ac8ff'), { font: 'body', align: 'center', outline: INK });
      Font.draw(fb, nm(F).toUpperCase(), clamp(fx, 40, W - 40), ty, hex('#ff8a7a'), { font: 'body', align: 'center', outline: INK });
      if (B && B.boss) Font.draw(fb, 'BOSS BATTLE', W / 2, H - bh + Math.round(bh / 2) - 3, hex('#ffd070'), { font: 'small', align: 'center' });
    }
    Font.draw(fb, (typeof Pad !== 'undefined' && Pad.touch ? 'tap' : 'space') + ' to skip', W - 6, H - Math.max(8, Math.round(bh / 2) + 3), 0xff8a90a8, { font: 'small', align: 'right' });
  }
  function drawWalkOver(fb, t, G) {
    const R = G.ar, W = fb.w, H = fb.h;
    if (R.vs >= 0) {
      const k = R.vs, pop = k < 0.12 ? 3 - (k / 0.12) : 2, y = Math.round(H * 0.3), sh = k < 0.2 ? Math.round((Math.random() - 0.5) * 4) : 0;
      if (k < 0.25) for (let a = 0; a < 24; a++) { const an = a / 24 * Math.PI * 2, r0 = 14 + k * 80, r1 = r0 + 30; UI.line(fb, Math.round(W / 2 + Math.cos(an) * r0), Math.round(y + 8 + Math.sin(an) * r0 * 0.6), Math.round(W / 2 + Math.cos(an) * r1), Math.round(y + 8 + Math.sin(an) * r1 * 0.6), a % 2 ? hex('#ffe070') : WHITE); }
      Font.draw(fb, 'VS', W / 2 + sh, y + sh, ((t * 10) | 0) % 2 ? hex('#ffe040') : hex('#ff7a3a'), { font: 'title', align: 'center', outline: INK, sc: Math.max(1, Math.round(pop)) + (W >= 420 ? 1 : 0) });
    }
    if (R.flash > 0) UI.rectA(fb, 0, 0, W, H, WHITE, Math.min(0.7, R.flash * 3));
    if (R.black > 0) UI.rectA(fb, 0, 0, W, H, 0xff000000, Math.min(1, R.black));
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
  const skipWhen = (obj, names, walk) => { if (!obj) return; for (const n of names) { const f = obj[n]; if (typeof f !== 'function') continue; obj[n] = function () { if (A.cover || (walk && A.walking)) return; return f.apply(this, arguments); }; } };
  skipWhen(Stage, ['drawLate', 'drawWater', 'drawGlows']);
  skipWhen(Stage, ['drawFore'], true);
  // during the walk-in, nothing in the foreground hides the fighters (bushes, front props)
  { const f = Stage.drawProps; Stage.drawProps = function (fb, cx, cy, t, front) { if ((A.cover || A.walking) && front) return; return f.apply(this, arguments); }; }
  skipWhen(typeof Weather !== 'undefined' ? Weather : null, ['draw']);
  skipWhen(typeof Seasons !== 'undefined' ? Seasons : null, ['draw']);
  skipWhen(typeof Harvest !== 'undefined' ? Harvest : null, ['draw', 'drawUnder', 'drawFore'], true);
  skipWhen(typeof Items !== 'undefined' ? Items : null, ['draw']);
  skipWhen(typeof Shaders !== 'undefined' ? Shaders : null, ['apply']);
  U.on && U.on('area', () => stop());
  return Object.assign(A, { THEMES, plan, begin, cut, walk, stop, skip, intro, update, outDone, barH, drawBack, drawFront, drawUnder, drawFaces, drawOver, drawWalk, drawWalkOver, sadTrombone });
})();
