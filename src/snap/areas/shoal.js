/* ------------------------------------------------------------------
   Shoal Cave — an icy sea cave on a snowy islet (Route 125).
    · Snowy Shore: snow drifts over the sand, an icy tide lapping at the
      rocks, Spheal lounging, and at night an aurora rippling over the
      frozen sea. Latias and Latios sometimes race by at dusk.
    · Tidal Cavern: through the great cave mouth, a tide pool glowing
      blue under hanging icicles; Starmie shine in it at night.
    · Ice Slide: a frozen waterfall and a floor of glassy ice — Mudkip
      skates and slides! Snorunt play here.
    · The Ice Chamber: braille dots on the wall, a circle on the floor
      and a giant frozen in ice. "STAND IN THE CIRCLE. BE STILL. SING."
------------------------------------------------------------------- */
Areas.shoal = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, mix, hex } = U;
  const MOUTH = 760, CEIL = 452, TIDE = { x0: 0, x1: 250, level: 568 }, POOL = { x0: 1150, x1: 1480, level: 578 };
  const ICE = { x0: 2060, x1: 2820 }, FALLX = 2420, WALL = 3470, RING = 3570, REGI = 3740;
  const def = {
    id: 'shoal', name: 'Shoal Cave', sub: 'Route 125 · Ice Cave', music: 'shoal', seed: 88, noSeason: true, cave: true,
    W: 3900, H: 1000, sea: null, refY: 560, h0: 118, cy0: 330, ph: 0.05, skyH: 300, sunH: 130, band: 11, waves: 0.4,
    camY: [-40, 860], frameY: 0.74, start: 380,
    ground: [[0, 640], [120, 620], [230, 584], [300, 562], [500, 558], [760, 560], [900, 562], [1100, 566], [1160, 588], [1200, 620], [1300, 638], [1420, 626], [1470, 590], [1500, 566], [1700, 560], [1900, 558], [2060, 562], [2400, 564], [2820, 562], [2960, 556], [3100, 552], [3400, 550], [3900, 548]],
    water: [{ x0: TIDE.x0, x1: TIDE.x1, level: TIDE.level, kind: 'tide' }, { x0: POOL.x0, x1: POOL.x1, level: POOL.level, kind: 'pool' }],
    plats: [],
    sky: {
      noon: [[0, '#5a8ad0'], [0.45, '#8ab4e4'], [0.8, '#c8def0'], [1, '#e8f2f8']],
      afternoon: [[0, '#5a7ec4'], [0.5, '#94acd8'], [0.85, '#dcd8e0'], [1, '#f4e4d4']],
      night: [[0, '#02061a'], [0.4, '#061232'], [0.75, '#0e2250'], [1, '#1a3466']],
    },
    mats: {
      ink: ['#0a0e18', '#141c2c'],
      snow: ['#9aaac8', '#b8c6de', '#d4def0', '#eaf0fa', '#ffffff'],
      sand: ['#6a6a7a', '#8a8a98', '#a8a8b4'],
      ice: { c: ['#2a5a8a', '#3a82b8', '#5aaad8', '#8ad0f0', '#c0ecff', '#eafaff'], emit: false },
      iceG: { c: ['#1a4a8a', '#2a8ad8', '#6ad0ff', '#d0f4ff'], emit: true },
      rock: ['#141a26', '#1e2636', '#2a3448', '#3a4660', '#4e5c7a', '#687898'],
      wall: ['#0e1426', '#141c32', '#1c2640', '#26324e', '#324060', '#425274'],
      wallI: ['#16304a', '#1e4260', '#285878', '#347090', '#4a8aa8'],
      far: ['#5a7298', '#6e86aa', '#869cbc', '#a2b6d0', '#c2d2e4'],
      sea: ['#1a3a6a', '#24508a', '#3470a8', '#4a90c4'],
      pine: ['#12302a', '#1a4236', '#265844', '#387056'],
      bark: ['#2a1c14', '#3e2a1c', '#563a26'],
      braille: { c: ['#1a2a4a', '#3a8aff', '#bfe8ff'], emit: true },
      ring: { c: ['#2a6ab8', '#6ad0ff', '#e0faff'], emit: true },
      aur: { c: ['#20c89a', '#6affc8', '#b88aff'], emit: true },
    },
  };
  def.cycleRate = 4;
  def.waterCols = (hour) => {
    const night = hour === 'night';
    return { top: night ? hex('#1a4a70') : hex('#5ab4e0'), mid: night ? hex('#0e2a48') : hex('#2a7ab4'), deep: night ? hex('#061426') : hex('#123e6a'), foam: hex('#f4fcff'), hi: night ? hex('#9ae0ff') : hex('#e4faff'), ray: null, maxD: 110 };
  };
  const S = { slide: 0, still: 0, dots: 0, awake: false, sungT: 0, frost: 0 };
  const n1 = (x, y) => Terrain.n1(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n2 = (x, y) => Terrain.n2(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff);
  const pickR = (ramp, t, x, y) => Terrain.pickR(ramp, t, x, y);
  const ceilAt = (x) => CEIL + Math.sin(x * 0.011) * 10 + (vnoise(x * 0.04, 3, 21) - 0.5) * 16;
  const inside = (x) => x > MOUTH;

  /* ---------------- painters ---------------- */
  function icicle(M, w, h, seed, up = false) {
    const s = new ISpr(w + 2, h + 2);
    for (let y = 0; y < h; y++) { const t = y / h, half = (w / 2) * (1 - t) ** 1.2 + 0.4; for (let x = -half; x <= half; x++) s.set(w / 2 + 1 + x, up ? h - y : y, pickR(M.ice.c ? M.ice : M.ice, 0.85 - (x + half) / (2 * half + 0.1) * 0.55 - t * 0.1, x, y)); }
    Paint.outline(s, M.ink[1]);
    s.ax = (w >> 1) + 1; s.ay = up ? h : 0;
    return s;
  }
  function crystal(M, size, seed) { return Props2.crystal(M, size, seed, M.iceG); }
  function ceilingChunk(M, x0, w, seed) {
    const top = CEIL - 150, H = CEIL + 70 - top, s = new ISpr(w, H), r = rng(seed);
    for (let xx = 0; xx < w; xx++) {
      const x = x0 + xx; if (x < MOUTH - 40) continue;
      const lip = x < MOUTH + 60 ? (MOUTH + 60 - x) * 0.9 : 0;
      const yb = ceilAt(x) - top - lip;
      for (let y = 0; y < yb; y++) { let lit = 0.35 - (yb - y) / 300 + (n2(x * 1.2, y * 2) - 0.5) * 0.35 + (y > yb - 3 ? 0.25 : 0); s.set(xx, y, pickR(y > yb - 5 ? M.wallI : M.wall, lit, x, y)); }
      if (hash(x, 5, seed) > 0.985) { const c = crystal(M, 3 + hash(x, 6, seed) * 4, x); for (let y = 0; y < c.h; y++) for (let q = 0; q < c.w; q++) { const v = c.d[y * c.w + q]; if (v) s.set(xx - c.ax + q, yb + c.h - 1 - y - 3, v); } }
    }
    for (let xx = 6; xx < w - 6; xx += 7 + r() * 22) { const x = x0 + xx; if (x < MOUTH + 20) continue; const ic = icicle(M, 3 + r() * 7, 8 + r() * 30, Math.floor(x)); s.paste(ic, Math.round(xx - ic.ax), Math.round(ceilAt(x) - top - 2)); }
    Paint.outline(s, M.ink[0]);
    s.ax = 0; s.ay = 0; s.top = top;
    return s;
  }
  function wallSpr(M, w, h, seed) {
    const s = new ISpr(w, h), r = rng(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let lit = 0.42 + (n2(x * 0.7 + seed, y * 0.9) - 0.5) * 0.4 + (Terrain.n3(x & 0xffff, (y + seed) & 0xffff) - 0.5) * 0.3 - Math.abs(y - h * 0.55) / h * 0.3;
      if (((x + Math.floor(n1(x * 0.5, y * 0.1) * 13)) % 29) === 0) lit += 0.12;
      s.set(x, y, pickR(n1(x * 0.3, y * 0.3) > 0.62 ? M.wallI : M.wall, lit, x, y));
    }
    for (let k = 0; k < w / 40; k++) { const c = crystal(M, 3 + r() * 6, seed + k); s.paste(c, Math.round(r() * w), Math.round(h * 0.3 + r() * h * 0.6)); }
    return s;
  }
  function frozenFall(M, w, h) {
    const s = new ISpr(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = x / w, edge = Math.min(u, 1 - u) * w + Math.sin(y * 0.07) * 3; if (edge < 1) continue; const band = Math.sin(x * 0.5 + y * 0.02) + Math.sin(x * 0.13); s.set(x, y, pickR(M.ice, 0.55 + band * 0.18 + (y > h - 10 ? 0.2 : 0), x, y)); }
    Paint.outline(s, M.ink[1]);
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function brailleWall(M) {
    const w = 60, h = 84, s = new ISpr(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s.set(x, y, pickR(M.rock, 0.5 + (n2(x * 3, y * 2) - 0.5) * 0.3 - (x < 2 || y < 2 ? -0.3 : 0), x, y));
    for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) if (hash(r, c, 17) > 0.45) { const x = 6 + c * 6, y = 8 + r * 10; s.rect(x, y, 2, 2, M.braille[0]); }
    Paint.outline(s, M.ink[0]);
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function snowPine(M, H, seed) {
    const s = new ISpr(Math.round(H * 0.7) + 4, H + 2), r = rng(seed), cx = s.w / 2;
    for (let y = H - 8; y < H; y++) { s.set(cx, y, M.bark[1]); s.set(cx + 1, y, M.bark[2]); }
    for (let t = 0; t < 5; t++) { const y0 = Math.round(t * (H - 10) / 5), y1 = Math.round((t + 1.3) * (H - 10) / 5); for (let y = y0; y < y1; y++) { const hw = ((y - y0) / (y1 - y0)) * (H * 0.12 + t * H * 0.06); for (let x = -hw; x <= hw; x++) { const top = (y - y0) < 2 || hash(Math.round(x), y, seed) > 0.8 && (y - y0) < (y1 - y0) * 0.4; s.set(cx + x, y, top ? M.snow[4] : pickR(M.pine, 0.7 - (x + hw) / (2 * hw + 1) * 0.5, x, y)); } } }
    void r; Paint.outline(s, M.ink[0]);
    s.ax = Math.round(cx); s.ay = H;
    return s;
  }

  /* ---------------- build ---------------- */
  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const gy = (x) => World.groundAt(x);
    const wet = (x) => (x > TIDE.x0 && x < TIDE.x1 - 10) || (x > POOL.x0 + 16 && x < POOL.x1 - 16);
    Terrain.paint(A, {
      bb: 7, bf: 5,
      strip(x, y, u, e) {
        const n = e.n2(x, y * 3);
        if (wet(x)) return e.pickR(M.sand, 0.4 + (n - 0.5) * 0.4, x, y);
        let t = 0.7 - u * 0.36 + (n - 0.5) * 0.3;
        if (x > ICE.x0 && x < ICE.x1) return e.pickR(M.ice, t + 0.1 + (e.hash(x, y, 3) > 0.9 ? 0.2 : 0), x, y);
        if (!inside(x)) return e.pickR(M.snow, t + 0.1, x, y);
        return e.pickR(e.n1(x, y) > 0.55 ? M.snow : M.rock, t, x, y);
      },
      face(x, y, dep, e) {
        if (dep <= 1) return M.ink[1];
        const n1v = e.n1(x, y), n2v = e.n2(x, y);
        const band = (dep + n1v * 12) / 18, bi = Math.floor(band);
        let t = 0.55 - Math.min(0.5, dep / 240) - (bi % 3 === 1 ? 0.1 : 0) + (n2v - 0.5) * 0.25;
        if (x > ICE.x0 && x < ICE.x1 && dep < 26) return e.pickR(M.ice, 0.55 - dep / 40, x, y);
        if (dep < 4 && !inside(x)) return M.snow[1];
        if (dep > 12 && e.hash(x, y, 13) > 0.9985) return M.iceG[2];
        return e.pickR(M.rock, t, x, y);
      },
    });
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    // ---- the snowy shore ----
    for (let x = 300; x < MOUTH - 40; x += 80 + r() * 110) put(snowPine(M, 70 + r() * 50, Math.floor(x)), x, -5, { sink: 3 });
    for (let x = 260; x < MOUTH; x += 40 + r() * 60) put(Paint.rock(M, 14 + r() * 18, 9 + r() * 10, Math.floor(x), { ramp: M.rock, moss: M.snow }), x, r() < 0.5 ? 2 : -3, { sink: 3 });
    // ---- the cave ceiling, world-locked ----
    for (let x0 = MOUTH - 60; x0 < A.W + 40; x0 += 300) { const c = ceilingChunk(M, x0, 300, 700 + x0); A.props.push({ frames: [c], x: x0, y: c.top, zd: -9 }); }
    // ---- tidal cavern ----
    for (let x = MOUTH + 40; x < A.W - 30; x += 70 + r() * 120) { if (wet(x)) continue; const k = r(); if (k < 0.35) put(crystal(M, 5 + r() * 7, Math.floor(x)), x, r() < 0.5 ? -3 : 2, { sink: 2 }); else if (k < 0.7) put(icicle(M, 6 + r() * 8, 14 + r() * 26, Math.floor(x * 3), true), x, -4, { sink: 3 }); else put(Paint.rock(M, 16 + r() * 20, 10 + r() * 12, Math.floor(x), { ramp: M.rock, moss: M.snow }), x, 2, { sink: 3 }); }
    A.glows.push({ x: (POOL.x0 + POOL.x1) / 2, y: POOL.level + 20, r: 180, flat: 2.5, c: hex('#4ab8ff'), a: 0.3, always: true });
    // ---- the frozen waterfall and ice slide ----
    A.props.push({ frames: [frozenFall(M, 44, Math.round(gy(FALLX) - ceilAt(FALLX) + 10))], x: FALLX, y: gy(FALLX) + 2, zd: -6 });
    A.glows.push({ x: FALLX, y: gy(FALLX) - 60, r: 70, c: hex('#bfefff'), a: 0.35, always: true });
    // ---- the ice chamber ----
    A.wall = put(brailleWall(M), WALL, -4, { sink: 2 });
    A.glows.push(S.ringGlow = { x: RING, y: gy(RING) - 2, r: 30, flat: 3, c: hex('#6ad0ff'), a: 0.3, always: true, k: 0.4 });
    A.glows.push(S.wallGlow = { x: WALL, y: gy(WALL) - 40, r: 50, c: hex('#3a8aff'), a: 0.4, always: true, k: 0.2 });
    for (const x of [3040, 3200, 3860]) { put(icicle(M, 16, 70, x, true), x, -5, { sink: 3 }); }
    const det = (key, ramp, x, zd) => { const s = Paint.miniSpr(key, ramp); A.details.push({ s, x, y: gy(x) + zd, zd }); };
    for (let x = 10; x < A.W; x += 6 + r() * 14) { if (wet(x)) continue; const k = r(), zd = (r() - 0.5) * 8; if (k < 0.3) det('pebble2', inside(x) ? M.rock : M.snow, x, zd); else if (k < 0.4) det('pebble', M.ice, x, zd); else if (k < 0.45 && !inside(x)) det('shell1', M.snow, x, zd); }

    /* ---- backdrop: outside (sea, snowy islands), inside (ice walls, clipped to the cave mouth) ---- */
    {
      const w = 900, h = 90, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.far, base: h, amp: 70, seed: 5, freq: 0.01, peaks: [[200, 150, 0.9], [640, 120, 0.7]], snow: M.snow, snowD: 12, snowLine: 0.3 });
      const L = A.layer(s, 0.03, { haze: 0.4, base: h - 1, x: -40 }); L.out = true;
    }
    {
      const w = 1300, h = 120, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.rock, base: h, amp: 80, seed: 9, freq: 0.014, snow: M.snow, snowD: 16, snowLine: 0.1 });
      for (let x = 0; x < w; x += 20 + r() * 40) { const p = snowPine(M, 24 + r() * 20, Math.floor(x)); s.paste(p, Math.round(x - p.ax), h - p.ay - 6 - Math.round(r() * 20)); }
      const L = A.layer(s, 0.2, { haze: 0.3, base: h - 1, x: 0 }); L.out = true; L.skirt = M.rock[1];
    }
    S.wallS = wallSpr(M, 1800, 330, 17); S.wall2 = wallSpr(M, 2600, 300, 29);
    // ---- 2.5D floor: snowy sand and the icy sea outside, frosted rock and ice inside ----
    {
      A.depthP0 = 0.55; A.depthHaze = 0.24;
      A.floor = { p0: 0.55, D: 120,
        row(wz, p, t) { return { t, C: def.waterCols(Stage.S.hour) }; },
        tex(wx, wz, p, t, R) {
          const n = Stage.noiseAt(wx * 0.4, wz * 1.2), n2v = Stage.noiseAt(wx * 1.7 + 50, wz * 3.1);
          const k = (1 - p) / 0.45;
          if (wx < 260 + k * 140) { const f = Math.sin(wx * 0.04 + wz * 0.5 + t) > 0.85; return f ? R.C.hi : n > 0.6 ? R.C.mid : R.C.top; }
          if (wx < MOUTH) return M.snow[n > 0.6 ? 4 : n < 0.35 ? 2 : 3];
          if (wx > POOL.x0 && wx < POOL.x1 && k < 0.7) { return n2v > 0.86 ? R.C.hi : R.C.top; }
          if (wx > ICE.x0 && wx < ICE.x1) return n2v > 0.9 ? M.ice[5] : M.ice[n > 0.5 ? 4 : 3];
          return n > 0.62 ? M.snow[2] : M.rock[n < 0.3 ? 2 : 3];
        } };
      const r2 = rng(5151);
      for (let i = 0; i < 26; i++) { const p = 0.57 + r2() * 0.38, wx = 280 + r2() * (MOUTH - 300); A.scatterAt(snowPine(M, Math.round((60 + r2() * 40) * p), 5000 + i), wx, p); }
      for (let i = 0; i < 60; i++) { const p = 0.56 + r2() * 0.42, wx = MOUTH + 40 + r2() * (A.W - MOUTH - 80); if (wx > POOL.x0 - 20 && wx < POOL.x1 + 20) continue; A.scatterAt(r2() < 0.5 ? crystal(M, Math.max(2, Math.round((4 + r2() * 6) * p)), 5100 + i) : icicle(M, Math.max(3, Math.round(8 * p)), Math.max(6, Math.round((18 + r2() * 20) * p)), 5200 + i, true), wx, p); }
    }
    // ---- foreground ----
    for (let x = -40; x < A.W; x += 170 + r() * 200) {
      const s = new ISpr(80, 100), st = icicle(M, 26 + r() * 20, 60 + r() * 30, Math.floor(x * 5), true);
      s.paste(st, 40 - st.ax, 100 - st.h);
      for (let k = 0; k < 2; k++) { const c = crystal(M, 6 + r() * 6, Math.floor(x) + k); s.paste(c, Math.round(8 + r() * 56), 100 - c.h); }
      s.ax = 40; s.ay = 99;
      A.foreItem(Paint.edge(s, M.ink[0]), x, gy(x) + 70 + r() * 20, { p: 1.35, flip: r() < 0.5 });
    }
    for (let x = MOUTH + 100; x < A.W; x += 240 + r() * 260) { const ic = icicle(M, 24 + r() * 24, 60 + r() * 60, Math.floor(x * 9)); A.foreItem(Paint.edge(ic, M.ink[0]), x, CEIL - 70, { p: 1.3, hang: true }); }
    A.foreDark = 0.3; A.foreTint = 0xff301810;
    // ---- hotspots ----
    A.addHot({ x0: WALL - 30, x1: WALL + 30, y0: gy(WALL) - 84, y1: gy(WALL), x: WALL, reach: 50, tap() { Game.sfx('scan'); HUD.toast(S.awake ? 'The dots glow: "THE GIANT OF ICE HAS WOKEN."' : 'The braille reads: "STAND IN THE CIRCLE. BE STILL. THEN SING."', { life: 3.6 }); }, onScan() { HUD.toast('Scan: "STAND IN THE CIRCLE. BE STILL. THEN SING."', { life: 3.2 }); return true; } });
  };

  /* ---------------- drawing ---------------- */
  // the icy sea band outside, and an aurora on clear nights
  function outside(fb, cx, cy, t) {
    const W = fb.w, H = fb.h, d = fb.d, hz = Stage.horizonS(cy), seaY = Math.round(TIDE.level - cy);
    const C = def.waterCols(Stage.S.hour), far = C.mid, near = C.top;
    const wm = Stage.waterMask(W * H), wc = Stage.S.wc;
    for (let y = Math.max(0, hz); y < Math.min(H, seaY); y++) {
      const u = (y - hz) / Math.max(1, seaY - hz), row = y * W, base = mix(far, near, Math.pow(u, 0.7));
      for (let x = 0; x < W; x++) { let c = base; const wv = Math.sin((x + cx * (0.1 + u * 0.9)) * 0.21 + y * 1.3 + t) + Math.sin(x * 0.05 - t * 0.6); if (wv > 1.4) c = mix(c, C.hi, 0.5); if (hash((x + cx) >> 3, y, 5) > 0.992) c = 0xffffffff; d[row + x] = c; wm[row + x] = 1; wc[row + x] = c; }
    }
    // aurora ribbons
    const hr = Stage.S.hour;
    if (hr === 'night' || hr === 'dusk') {
      const k = hr === 'night' ? 1 : 0.4, A0 = hex('#30e0a0'), A1 = hex('#b88aff');
      for (let x = 0; x < W; x++) {
        const wx = x + cx * 0.05, top = 30 + Math.sin(wx * 0.02 + t * 0.3) * 18 + Math.sin(wx * 0.007 - t * 0.1) * 24;
        for (let j = 0; j < 46; j++) { const y = Math.round(top + j); if (y < 0 || y >= Math.min(H, hz)) continue; const a = (1 - j / 46) * (0.5 + 0.5 * Math.sin(wx * 0.05 + t + j * 0.05)) * 0.35 * k; if (a < 0.03) continue; const i = y * W + x; d[i] = U.screen(d[i], mix(A0, A1, j / 46 + Math.sin(wx * 0.01) * 0.2), a); }
      }
    }
  }
  // the cave's back wall, only to the right of the cave mouth (at the lane's depth)
  function caveWall(fb, cx, cy, t, spr, p, yBase, hz) {
    const W = fb.w, H = fb.h, d = fb.d, pal = Stage.framePal(hz, t);
    const ox = Math.round(-cx * p + 40), oy = Math.round(yBase - cy);
    for (let y = Math.max(0, oy); y < Math.min(H, oy + spr.h); y++) {
      const edge = MOUTH - cx + Math.round(Math.sin((y + cy) * 0.09) * 6 + (y + cy - CEIL) * 0.25);
      const row = (y - oy) * spr.w;
      for (let x = Math.max(0, edge); x < W; x++) { const u = x - ox; if (u < 0 || u >= spr.w) continue; const v = spr.d[row + u]; if (v) d[y * W + x] = x - edge < 2 ? 0xff0a0e18 : pal[v]; }
    }
  }
  def.drawBack = (A, fb, cx, cy, t) => {
    Stage.drawSky(fb, cx, cy, t);
    outside(fb, cx, cy, t);
    for (const L of A.layers) if (L.out) Stage.drawLayer(fb, L, cx, cy, t);
    const hz = Stage.horizonS(cy);
    caveWall(fb, cx, cy, t, S.wallS, 0.35, CEIL - 140, 0.25);
    caveWall(fb, cx, cy, t, S.wall2, 0.62, CEIL - 60, 0.12);
    Stage.drawDepthFrom(fb, cx, cy, t, 0.5);
    void hz;
  };
  def.post = (A, fb, cx, cy, t) => {
    const W = fb.w, H = fb.h, d = fb.d;
    for (const p of S.snow || []) { const x = Math.round(p.x - cx), y = Math.round(p.y - cy); if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) continue; const i = y * W + x; d[i] = mix(d[i], 0xffffffff, 0.9); if (p.big) { d[i + 1] = mix(d[i + 1], 0xfff0f4ff, 0.7); d[i + W] = mix(d[i + W], 0xfff0f4ff, 0.7); } }
    // the stillness ring glows brighter as Mudkip waits in it; the wall's dots light one by one
    const X = Math.round(RING - cx), Y = Math.round(World.groundAt(RING) - cy);
    const k = S.awake ? 1 : S.dots / 7;
    for (let a = 0; a < Math.PI * 2; a += 0.05) { const px = X + Math.round(Math.cos(a) * 18), py = Y + Math.round(Math.sin(a) * 4); if (px >= 0 && py >= 0 && px < W && py < H) d[py * W + px] = U.screen(d[py * W + px], hex('#6ad0ff'), 0.35 + k * 0.6); }
    const wx = Math.round(WALL - cx), wy = Math.round(World.groundAt(WALL) - cy);
    for (let i = 0; i < 7; i++) {
      if (!S.awake && i >= S.dots) continue;
      const [dx, dy] = [[-12, -60], [0, -60], [12, -60], [-6, -48], [6, -48], [0, -72], [0, -36]][i];
      for (let q = -1; q <= 1; q++) for (let w = -1; w <= 1; w++) { const px = wx + dx + q, py = wy + dy + w; if (px >= 0 && py >= 0 && px < W && py < H) d[py * W + px] = U.mix(hex('#bfe8ff'), 0xffffffff, 0.3 + 0.3 * Math.sin(t * 5 + i)); }
    }
    if (S.frost > 0) { S.frost = Math.max(0, S.frost - 1 / 90); const kk = Math.round(S.frost * 120); for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xfffff4e8, kk); }
  };
  def.spawn = (A, G) => {
    S.still = 0; S.dots = 0; S.awake = Save.found('regice.woke'); S.slide = 0;
    if (typeof ShoalAI !== 'undefined') ShoalAI.spawn(A, G, { TIDE, POOL, ICE, RING, REGI, MOUTH });
  };
  def.update = (A, dt, t, G) => {
    const mk = G.mudkip;
    // snow falls on the open shore only (the cave roof keeps it out)
    const cx = Game.cam.x, cy = Game.cam.y, VW = Game.VW, VH = Game.VH;
    S.snow = S.snow || [];
    const want = cx < MOUTH ? Math.round(110 * clamp((MOUTH - cx) / VW, 0, 1)) : 0;
    for (let k = 0; k < 4 && S.snow.length < want; k++) S.snow.push({ x: cx + Math.random() * Math.min(VW + 40, MOUTH - cx + 20) - 20, y: cy - 6 + (S.snow.length < 30 ? Math.random() * VH : 0), vy: 14 + Math.random() * 18, ph: Math.random() * 6, big: Math.random() < 0.22 });
    for (let i = S.snow.length - 1; i >= 0; i--) { const p = S.snow[i]; p.x += (Math.sin(t * 1.3 + p.ph) * 10 + 4) * dt; p.y += p.vy * dt; if (p.y > World.groundAt(p.x) || p.y > cy + VH + 8 || p.x > MOUTH + 10 || p.x < cx - 40) S.snow.splice(i, 1); }
    // glassy ice: Mudkip keeps sliding when it lets go (and sparkles as it skates)
    if (mk && mk.mode === 'land' && mk.x > ICE.x0 && mk.x < ICE.x1) {
      if (mk.keyDir) S.slide = lerp(S.slide, mk.keyDir * (mk.running ? 150 : 100), Math.min(1, dt * 2.5));
      else if (Math.abs(S.slide) > 4) { const nx = clamp(mk.x + S.slide * dt, 30, A.W - 30); mk.x = nx; S.slide *= Math.exp(-dt * 0.8); if (Math.random() < dt * 20) FX.add({ type: 'spark', x: mk.x + (Math.random() - 0.5) * 8, y: World.groundAt(mk.x) - 1, size: 1, life: 0.4, c: 0xffffffff, c2: hex('#9ae0ff'), layer: 3 }); if (Math.random() < dt * 4) Game.sfx('icering', mk.x, 0.15); }
      if (Math.abs(S.slide) > 60 && !S.skateTold) { S.skateTold = true; Save.discover('shoal.skate'); if (mk.say) mk.say('Wheee! Slippery!', 1.4); }
    } else S.slide *= Math.exp(-dt * 6);
    // the chamber: stand still in the circle...
    if (!S.awake && mk) {
      const inRing = Math.abs(mk.x - RING) < 16 && mk.mode === 'land' && !mk.keyDir && !mk.target && !mk.moving;
      if (inRing) { S.still += dt; const want = Math.min(7, Math.floor(S.still / 0.6)); if (want > S.dots) { S.dots = want; Game.sfx('icering', WALL, 0.5 + want * 0.05); if (S.dots === 7) HUD.toast('All seven dots glow... now SING! (Sing TM, or play a song)', { life: 3 }); } }
      else if (S.dots < 7) { if (S.still > 0 && S.dots > 0) Game.sfx('error', null, 0.3); S.still = 0; S.dots = 0; }
      S.ringGlow.k = 0.4 + S.dots / 7 * 0.6; S.wallGlow.k = 0.2 + S.dots / 7 * 0.8;
    }
    if (typeof ShoalAI !== 'undefined') ShoalAI.update(A, dt, t, G, S);
  };
  def.onSong = (x) => {
    if (!S.awake && S.dots >= 7 && Math.abs(x - RING) < 80) { S.awake = true; S.frost = 1; Game.shake(6); Game.sfx('freeze', REGI, 1); Game.sfx('rumble', REGI, 0.9); Save.discover('regice.woke'); Save.addItem('icegem', 1); HUD.toast('The ice giant awakens! (+ Never-Melt Ice)', { life: 3.4 }); if (Game.cine) Game.cine.pan(REGI, World.groundAt(REGI) - 50, { hold: 3, zoom: 1.12 }); if (typeof Legends !== 'undefined' && Legends.wakeRegice) Legends.wakeRegice(); }
    if (typeof ShoalAI !== 'undefined' && ShoalAI.song) ShoalAI.song(x);
  };
  def.weather = () => ({ rain: 0, fog: 0.05, snow: 0 });
  def.ambient = (hour) => {
    const out = [{ kind: 'sparkle', rate: 2.2, c: hex('#bfefff'), life: 1.6, sway: 4, bob: 2, y: (x) => World.groundAt(x) - 10 - Math.random() * 90 }];
    out.push({ kind: 'mote', rate: 2, c: hex('#e8f8ff'), life: 6, sway: 8, bob: 4, vy: 3 });
    return out;
  };
  def.onScan = (A) => { const mk = Game.mudkip; if (mk && mk.x > 3300) { HUD.toast(S.awake ? 'Scan: an ancient Pokémon made of ice, awake and humming.' : 'Scan: something enormous is frozen in the ice beyond the circle.', { life: 3 }); return true; } return false; };
  def.photoBonus = (A, crop, subs) => {
    if (subs.some((s) => s.sp === 'regice')) return { pts: 800, name: 'Iceberg giant' };
    if (subs.some((s) => s.sp === 'latias') && subs.some((s) => s.sp === 'latios')) return { pts: 900, name: 'Eon duo' };
    if (Stage.S.hour === 'night' && Game.mudkip && Game.mudkip.x < MOUTH) return { pts: 400, name: 'Aurora night' };
    return null;
  };
  def.S = S; def.GEO = { MOUTH, CEIL, TIDE, POOL, ICE, FALLX, WALL, RING, REGI };
  return def;
})();
