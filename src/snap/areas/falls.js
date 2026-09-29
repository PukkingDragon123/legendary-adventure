/* ------------------------------------------------------------------
   Starfall Cave — Meteor Falls reimagined: a huge crystal cavern behind
   roaring waterfalls. Glowing crystals stud the walls, stalactites hang
   from the ceiling, three pools catch the falls (one glows from a geyser
   vent below), and a shaft in the ceiling lets a column of daylight —
   or moonlight and falling stars — down onto the cave floor, where an
   ancient meteorite sits in its crater.
------------------------------------------------------------------- */
Areas.falls = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, mix, hex } = U;
  const GEO = FallsAI.GEO;
  const CEIL = 330, SHAFT_HW = 56, SKY0 = 40;
  const def = {
    id: 'falls', name: 'Starfall Cave', sub: 'Meteor Falls', music: 'space', seed: 57, noSeason: true,
    W: GEO.W, H: 900, sea: null, refY: 560, h0: 118, cy0: 330, ph: 0.05, skyH: 300, sunH: 140, band: 10, waves: 0.4,
    camY: [SKY0 + 20, 820], frameY: 0.74, start: 200,
    ground: GEO.ground,
    water: [{ x0: GEO.POOL.x0, x1: GEO.POOL.x1, level: GEO.POOL.level, kind: 'pool' }, { x0: GEO.GLOW.x0, x1: GEO.GLOW.x1, level: GEO.GLOW.level, kind: 'pool' }, { x0: GEO.SPRING.x0, x1: GEO.SPRING.x1, level: GEO.SPRING.level, kind: 'pool' }],
    plats: [
      { x0: GEO.LEDGE.x0, x1: GEO.LEDGE.x1, y: GEO.LEDGE.y, kind: 'ledge', hop: 'step' },
      { x0: GEO.NEST.x0, x1: GEO.NEST.x1, y: GEO.NEST.y, kind: 'ledge', hop: 'geyser' },
    ],
    mats: {
      ink: ['#08080f', '#12121e'],
      rock: ['#141428', '#1e1e38', '#2a2a4a', '#3a3a5e', '#4e4e74', '#66668c'],
      floor: ['#24223a', '#322f4e', '#433f64', '#57527c', '#6f6a96'],
      wet: ['#12182a', '#1a2438', '#24324a'],
      far: ['#0c0e22', '#121634', '#191e44', '#212854', '#2c3466'],
      mid: ['#101230', '#171b3e', '#20264e', '#2b3462', '#384278'],
      sand: ['#2c2842', '#3a3656', '#4a4668'],
      crys: { c: ['#1e3a8a', '#3a7ae0', '#7ac0ff', '#d0ecff'], emit: true },
      crysP: { c: ['#4a1e8a', '#8a4ae0', '#c49aff', '#f0dcff'], emit: true },
      crysC: { c: ['#10566a', '#1aa8b8', '#6af0e8', '#d8fffa'], emit: true },
      crysK: { c: ['#7a1e5a', '#d04a9a', '#ff9ad0', '#ffe0f0'], emit: true },
      crysY: { c: ['#7a5a10', '#d8a82a', '#ffe070', '#fff8d0'], emit: true },
      metr: ['#2a1e2e', '#3e2e44', '#56445e', '#6e5c78', '#8a789a'],
      glowV: { c: ['#c080ff', '#f0d0ff'], emit: true },
      glowM: { c: ['#1a8a6a', '#5af0c0'], emit: true },
      metal: ['#2a3440', '#4e5e6e', '#8a9aaa', '#d0dce6'],
      wood: ['#3a2414', '#553820', '#74502e', '#946a40'],
      fall: { c: ['#8ed8f0', '#b8ecfa', '#e0f8ff', '#ffffff', '#c8f0ff', '#9ee0f4'], cycle: true },
      foam: ['#d8f4ff', '#ffffff'],
    },
  };
  def.cycleRate = 11;
  def.waterCols = (hour) => {
    const night = hour === 'night';
    return { top: night ? hex('#1e4a66') : hex('#3a9ab8'), mid: night ? hex('#0e2840') : hex('#1e5a80'), deep: night ? hex('#050e1c') : hex('#0c2440'), foam: hex('#e0fbff'), hi: night ? hex('#8ad8f0') : hex('#bff4ff'), ray: null, maxD: 160 };
  };
  const S = {};
  const n1 = (x, y) => Terrain.n1(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n2 = (x, y) => Terrain.n2(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n3 = (x, y) => Terrain.n3(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff);
  const pickR = (ramp, t, x, y) => Terrain.pickR(ramp, t, x, y);
  const CRY = (M) => [M.crys, M.crysP, M.crysC, M.crysK, M.crysY];
  const ceilAt = (x) => CEIL + Math.sin(x * 0.013) * 12 + (vnoise(x * 0.05, 3, 11) - 0.5) * 18;

  /* ---------------- little painters ---------------- */
  // a crystal pillar for the singing-crystal row (i picks colour and height)
  function chimeSpr(M, i) {
    const C = CRY(M)[i], h = [34, 42, 50, 44, 38][i], w = 16, s = new ISpr(w + 8, h + 4);
    for (let y = 0; y < h; y++) {
      const t = y / h, half = y < 6 ? (y / 6) * 5 + 0.5 : 5 + t * 1.5;
      for (let x = -half; x <= half; x += 0.5) s.set(w / 2 + 4 + x, y, C[x < -half * 0.3 ? 3 : x < half * 0.35 ? 2 : 1]);
    }
    // a small side crystal and a rock base
    for (let j = 0; j < 14; j++) for (let q = -1.5; q <= 1.5; q += 0.5) s.set(w / 2 + 4 + 6 + j * 0.45 + q, h - 2 - j, C[q < 0 ? 2 : 1]);
    for (let y = h - 3; y < h + 3; y++) for (let x = 2; x < w + 6; x++) if (Math.abs(x - (w + 8) / 2) < 8 - (y - h + 3) * 0.3 + 3) s.set(x, y, pickR(M.rock, 0.55 - (y - h) * 0.08, x, y));
    Paint.outline(s, M.ink[0]);
    s.ax = (w + 8) >> 1; s.ay = h + 2;
    return s;
  }
  function boulderSprs(M) {
    const base = Paint.rock(M, 46, 36, 404, { ramp: M.rock, cracks: 1 });
    const out = [base];
    for (let k = 1; k <= 2; k++) {
      const s = new ISpr(base.w, base.h); s.d.set(base.d);
      const r = rng(90 + k);
      for (let c = 0; c < k * 2; c++) { let x = base.w * (0.3 + r() * 0.4), y = 4 + r() * 6; for (let j = 0; j < 14 + k * 6; j++) { s.setIf(x, y, M.ink[0]); x += (r() - 0.5) * 2.2; y += 0.9 + r() * 0.6; } }
      // light leaking from a hidden core
      if (k === 2) for (let j = 0; j < 6; j++) s.setIf(base.w * 0.5 + (r() - 0.5) * 6, base.h * 0.5 + (r() - 0.5) * 6, M.crysY[2]);
      out.push(s);
    }
    const rub = new ISpr(base.w + 20, 18);
    const rr = rng(7);
    for (let k = 0; k < 7; k++) { const p = Paint.rock(M, 8 + rr() * 10, 6 + rr() * 6, 30 + k, { ramp: M.rock }); rub.paste(p, Math.round(4 + rr() * (rub.w - p.w - 8)), rub.h - p.h); }
    rub.ax = rub.w >> 1; rub.ay = rub.h - 1;
    out.push(rub);
    for (const s of out.slice(0, 3)) { s.ax = base.ax; s.ay = base.ay; }
    return out;
  }
  function geodeSprs(M) {
    const shut = Paint.rock(M, 30, 22, 77, { ramp: M.rock, cracks: 2 });
    for (let k = 0; k < 5; k++) shut.setIf(10 + k * 2, 6 + (k % 2), M.crysP[2]);
    const open = new ISpr(shut.w, shut.h); open.d.set(shut.d); open.ax = shut.ax; open.ay = shut.ay;
    const cx = shut.w / 2, cy = shut.h * 0.55;
    for (let y = 0; y < shut.h; y++) for (let x = 0; x < shut.w; x++) {
      const q = ((x - cx) / 10) ** 2 + ((y - cy) / 7) ** 2;
      if (q < 1 && open.get(x, y)) open.set(x, y, q < 0.35 ? M.crysP[3] : q < 0.7 ? M.crysP[2] : M.crysP[1]);
    }
    return [shut, open];
  }
  function mirrorSpr(M) {
    const w = 28, h = 58, s = new ISpr(w, h);
    for (let y = 0; y < h; y++) { const half = y < 10 ? 2 + y * 0.9 : 11 - (y > 50 ? (y - 50) * 0.3 : 0); for (let x = -half; x <= half; x += 0.5) { const u = x / half; s.set(w / 2 + x, y, u < -0.4 ? M.crysC[3] : u < 0.2 ? (((y + Math.round(x)) % 9) < 2 ? M.crysC[3] : M.crysC[2]) : M.crysC[1]); } }
    for (let y = h - 6; y < h; y++) for (let x = 2; x < w - 2; x++) s.set(x, y, pickR(M.rock, 0.5 - (y - h + 6) * 0.06, x, y));
    Paint.outline(s, M.ink[0]);
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function scopeSpr(M) {
    const s = new ISpr(20, 26);
    for (let j = 0; j < 14; j++) { s.set(8 + j * 0.35, 12 - j * 0.8, M.metal[2]); s.set(9 + j * 0.35, 12 - j * 0.8, M.metal[1]); }
    s.set(13, 1, M.metal[3]); s.set(14, 1, M.metal[3]);
    for (let j = 0; j < 12; j++) { s.set(9 - j * 0.35, 13 + j, M.wood[2]); s.set(10 + j * 0.35, 13 + j, M.wood[1]); s.set(9.5, 13 + j, M.wood[3]); }
    Paint.outline(s, M.ink[0]);
    s.ax = 10; s.ay = 25;
    return s;
  }
  function nestSpr(M) {
    const s = new ISpr(56, 26), C = CRY(M);
    for (let k = 0; k < 11; k++) {
      const u = k / 10, x = 6 + u * 44, L = 8 + Math.sin(u * Math.PI) * 4 + (k % 2) * 5, a = -Math.PI / 2 + (u - 0.5) * 1.3, R = C[k % 5];
      for (let j = 0; j < L; j++) for (let q = -1.2; q <= 1.2; q += 0.5) s.set(x + Math.cos(a) * j - Math.sin(a) * q, 22 + Math.sin(a) * j + Math.cos(a) * q, R[q < 0 ? 3 : 2]);
    }
    for (let y = 18; y < 26; y++) for (let x = 3; x < 53; x++) if (Math.abs(x - 28) < 25 - (y - 18) * 1.2) s.set(x, y, pickR(M.rock, 0.5 - (y - 18) * 0.05, x, y));
    Paint.outline(s, M.ink[0]);
    s.ax = 28; s.ay = 21;
    return s;
  }
  // a rock shelf with a jagged underside and a column down to the floor
  function shelfSpr(M, w, h, colX, colW, seed, crys) {
    const s = new ISpr(w + 8, h + 2), r = rng(seed);
    for (let x = 0; x < w; x++) {
      const u = x / w, under = 14 + Math.sin(u * Math.PI) * 10 + (n1(x * 3 + seed, 1) - 0.5) * 8;
      const col = Math.abs(x - colX) < colW * (0.8 + 0.2 * Math.sin(x * 0.3));
      const bot = col ? h : under;
      for (let y = 0; y < bot; y++) {
        let lit = 0.72 - y / Math.max(20, bot) * 0.5 - (col ? Math.abs(x - colX) / colW * 0.2 : 0) + (n2(x * 2 + seed, y * 1.5) - 0.5) * 0.35;
        if (y < 2) lit = 0.95;
        s.set(x + 4, y, pickR(y < 3 ? M.floor : M.rock, lit, x, y));
      }
    }
    if (crys) for (let k = 0; k < 4; k++) { const c = Props2.crystal(M, 5 + r() * 4, seed + k, CRY(M)[Math.floor(r() * 5)]); s.paste(c, Math.round(8 + r() * (w - 16)), Math.round(16 + r() * 10)); }
    Paint.outline(s, M.ink[0]);
    s.ax = 4; s.ay = 0;
    return s;
  }
  function stoneSpr(M, h, seed) {
    const w = 26, s = new ISpr(w, h);
    for (let y = 0; y < h; y++) { const half = 9 + y * 0.12; for (let x = -half; x <= half; x++) s.set(w / 2 + x, y, pickR(y < 2 ? M.floor : M.rock, 0.7 - (x + half) / (2 * half) * 0.35 - y / h * 0.25 + (n2(x * 3 + seed, y) - 0.5) * 0.2, x, y)); }
    Paint.outline(s, M.ink[0]);
    s.ax = w >> 1; s.ay = 0;
    return s;
  }
  // a chunk of cave ceiling (world x0..x0+w, world y SKY0..CEIL+70) with stalactites; leaves the shaft open
  function ceilingChunk(M, x0, w, seed) {
    const H = CEIL + 80 - SKY0, s = new ISpr(w, H), r = rng(seed);
    for (let xx = 0; xx < w; xx++) {
      const x = x0 + xx, ds = Math.abs(x - GEO.SHAFT);
      if (ds < SHAFT_HW) continue;
      const yb = ceilAt(x) - SKY0 - (ds < SHAFT_HW + 30 ? (SHAFT_HW + 30 - ds) * 0.6 : 0);
      const rim = ds < SHAFT_HW + 8;
      for (let y = 0; y < yb; y++) {
        const up = (yb - y) / 200;
        let lit = 0.4 - up * 0.35 + (n2(x * 1.3, y * 2.1) - 0.5) * 0.35 + (y > yb - 3 ? -0.2 : 0);
        if (rim) lit += 0.3 * (1 - (ds - SHAFT_HW) / 8);
        if (((x + Math.floor(n1(x, y * 0.2) * 9)) % 23) === 0) lit -= 0.2;
        s.set(xx, y, pickR(M.rock, lit, x, y));
      }
      if (ds > SHAFT_HW + 10 && hash(x, 5, seed) > 0.992) {
        const c = Props2.crystal(M, 4 + hash(x, 6, seed) * 5, x, CRY(M)[Math.floor(hash(x, 7, seed) * 5)]);
        for (let y = 0; y < c.h; y++) for (let q = 0; q < c.w; q++) { const v = c.d[y * c.w + q]; if (v) s.set(xx - c.ax + q, yb + c.h - 1 - y - 3, v); }
      }
    }
    for (let xx = 10; xx < w - 10; xx += 18 + r() * 40) {
      const x = x0 + xx; if (Math.abs(x - GEO.SHAFT) < SHAFT_HW + 12) continue;
      const st = Props2.stalactite(M, 6 + r() * 12, 18 + r() * 50, Math.floor(x));
      s.paste(st, Math.round(xx - st.ax), Math.round(ceilAt(x) - SKY0 - 3));
    }
    Paint.outline(s, M.ink[0]);
    s.ax = 0; s.ay = 0;
    return s;
  }
  // a big backdrop wall: noisy rock, alcoves, crystal clusters, stalactite silhouettes
  function wallLayer(M, ramp, w, h, base, seed, o = {}) {
    const s = new ISpr(w, h), r = rng(seed);
    const alc = []; for (let k = 0; k < w / 260; k++) alc.push([r() * w, base - 120 - r() * 160, 60 + r() * 90, 40 + r() * 70]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (o.cols) { const c = o.cols.find((q) => Math.abs(x - q[0]) < q[1] * (0.8 + 0.25 * Math.sin(y * 0.02 + q[0]))); if (!c) continue; }
      let lit = 0.45 + (n2(x * 0.7 + seed, y * 0.9) - 0.5) * 0.45 + (n3(x * 0.2, y * 0.3 + seed) - 0.5) * 0.3 - Math.max(0, base - y) / 900;
      for (const [ax, ay, rx, ry] of alc) { const q = ((x - ax) / rx) ** 2 + ((y - ay) / ry) ** 2; if (q < 1) lit -= (1 - q) * 0.45; }
      if (((x + Math.floor(n1(x * 0.5, y * 0.1) * 13)) % 37) === 0) lit -= 0.15;
      s.set(x, y, pickR(ramp, lit, x, y));
    }
    const C = CRY(M);
    for (let k = 0; k < (o.crys ?? w / 90); k++) { const c = Props2.crystal(M, 4 + r() * (o.big || 8), seed + k * 3, C[Math.floor(r() * 5)]); const x = r() * w, y = base - r() * (o.span || 260); if (s.get(Math.round(x), Math.round(y))) s.paste(c, Math.round(x - c.ax), Math.round(y - c.ay)); }
    return s;
  }

  /* ---------------- build ---------------- */
  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const gy = (x) => World.groundAt(x);
    const inPool = (x) => def.water.some((w) => x > w.x0 && x < w.x1);
    // ---- terrain: stone floor with glowing moss and embedded crystals ----
    Terrain.paint(A, {
      bb: 5, bf: 5,
      strip(x, y, u, e) {
        if (inPool(x)) return e.pickR(M.wet, 0.5 + (e.n2(x, y) - 0.5) * 0.5, x, y);
        if (e.n1(x * 0.6, y * 2) > 0.8 && u > 0.3) return M.glowM[e.n2(x, y) > 0.6 ? 1 : 0];
        if (Math.abs(x - GEO.SHAFT) < 70 && e.n2(x * 2, y * 3) > 0.62) return M.sand[2];
        return e.pickR(M.floor, 0.78 - u * 0.4 + (e.n2(x * 2, y * 3) - 0.5) * 0.35, x, y);
      },
      face(x, y, dep, e) {
        const strata = Math.floor((y + e.n1(x * 0.05, 1) * 20) / 22) % 3;
        let lit = 0.5 - dep / 260 + (e.n2(x * 1.4, y * 1.6) - 0.5) * 0.35 - strata * 0.08;
        if (dep < 2) lit += 0.2;
        if (dep > 14 && e.hash(x, y, 13) > 0.9985) return CRY(M)[Math.floor(e.hash(x, y, 14) * 5)][2];
        return e.pickR(M.rock, lit, x, y);
      },
    });
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    const C = CRY(M);
    A.crysGlow = [];
    const glowC = ['#6ab8ff', '#b88aff', '#5af0e0', '#ff8ad0', '#ffe070'];
    const crystalAt = (x, sz, ci, zd = -2, glow = true) => { if (inPool(x)) return; const c = Props2.crystal(M, sz, Math.floor(x * 7), C[ci]); put(c, x, zd, { sink: 2 }); if (glow && sz > 8) { const g = { x, y: gy(x) - sz, r: Math.min(24, sz * 2 + 6), c: hex(glowC[ci]), a: 0.45, always: true, k: 0.5 }; A.glows.push(g); A.crysGlow.push(g); } };
    // ---- the ceiling (world-locked, leaves the shaft open) ----
    for (let x0 = -40; x0 < A.W + 40; x0 += 300) A.props.push({ frames: [ceilingChunk(M, x0, 300, 900 + x0)], x: x0, y: SKY0, zd: -9 });
    // ---- waterfalls pouring from cracks in the ceiling ----
    const fall = (x, top, bot, w) => { const s = Props2.waterfall(M, w, Math.round(bot - top), Math.floor(x)); A.props.push({ frames: [s], x, y: bot + 1, zd: -2 }); A.glows.push({ x, y: bot - 6, r: w * 1.8 + 16, c: hex('#bff0ff'), a: 0.3, always: true, flat: 1.6 }); };
    fall(GEO.FALL, ceilAt(GEO.FALL) - 6, GEO.POOL.level + 2, 40);
    fall(GEO.FALL2, ceilAt(GEO.FALL2) - 6, GEO.SPRING.level + 2, 34);
    fall(2022, GEO.NEST.y + 2, GEO.GLOW.level + 2, 10);
    // the glowing pool and its geyser vent
    A.glows.push({ x: (GEO.GLOW.x0 + GEO.GLOW.x1) / 2, y: GEO.GLOW.level + 6, r: 140, flat: 4, c: hex('#40e8d0'), a: 0.35, always: true });
    A.glows.push({ x: GEO.GEYSER, y: GEO.GLOW.level + 20, r: 30, c: hex('#8af0e8'), a: 0.5, always: true });
    // ---- ledges: the Bagon ledge with its hop stone, the high nest ledge ----
    A.props.push({ frames: [shelfSpr(M, GEO.LEDGE.x1 - GEO.LEDGE.x0, gy(1600) - GEO.LEDGE.y + 4, 120, 26, 31, true)], x: GEO.LEDGE.x0, y: GEO.LEDGE.y, zd: -3 });
    A.props.push({ frames: [stoneSpr(M, gy(GEO.STEP.x) - GEO.STEP.y + 4, 12)], x: GEO.STEP.x, y: GEO.STEP.y, zd: -3 });
    A.props.push({ frames: [shelfSpr(M, GEO.NEST.x1 - GEO.NEST.x0, gy(2100) - GEO.NEST.y + 4, 80, 60, 47, true)], x: GEO.NEST.x0, y: GEO.NEST.y, zd: -3 });
    A.props.push({ frames: [nestSpr(M)], x: GEO.NESTX, y: GEO.NEST.y + 1, zd: -2 });
    A.glows.push({ x: GEO.NESTX, y: GEO.NEST.y - 6, r: 34, c: hex('#ffe890'), a: 0.4, always: true });
    // ---- singing crystals ----
    A.chimes = GEO.CHIMES.map((x, i) => { const p = put(chimeSpr(M, i), x, -2, { sink: 2 }); const g = { x, y: gy(x) - 24, r: 26, c: hex(glowC[i]), a: 0.5, always: true, k: 0.5 }; A.glows.push(g); A.crysGlow.push(g); return p; });
    // ---- boulder, geode, mirror crystal, telescope, meteorite ----
    A.boulderSpr = boulderSprs(M);
    A.boulder = put(A.boulderSpr[0], GEO.BOULDER, -1, { sink: 3 });
    A.geodeSpr = geodeSprs(M);
    A.geode = put(A.geodeSpr[0], GEO.GEODE, -1, { sink: 2 });
    A.mirror = put(mirrorSpr(M), GEO.MIRROR, -2, { sink: 2 });
    A.glows.push({ x: GEO.MIRROR, y: gy(GEO.MIRROR) - 30, r: 34, c: hex('#bffff4'), a: 0.35, always: true });
    put(scopeSpr(M), GEO.SCOPE, -1, { sink: 1 });
    put(Props2.meteorite(M, 34, 88), GEO.METEOR, -2, { sink: 5 });
    A.heartGlow = { x: GEO.METEOR, y: gy(GEO.METEOR) - 18, r: 70, c: hex('#c080ff'), a: 0.6, always: true, k: 0.15 };
    A.glows.push(A.heartGlow);
    // ---- crystal clusters, stalagmites, pebbles ----
    for (let x = 60; x < A.W - 40; x += 70 + r() * 140) crystalAt(x, 5 + r() * 9, Math.floor(r() * 5), r() < 0.4 ? 2 : -3);
    for (let x = 100; x < A.W; x += 160 + r() * 220) { if (inPool(x) || Math.abs(x - GEO.SHAFT) < 90) continue; put(Props2.stalactite(M, 10 + r() * 12, 20 + r() * 40, Math.floor(x * 3), true), x, -4, { sink: 3 }); }
    const det = (key, ramp, x, zd) => { const s = Paint.miniSpr(key, ramp); A.details.push({ s, x, y: gy(x) + zd, zd }); };
    for (let x = 10; x < A.W; x += 8 + r() * 18) { if (inPool(x)) continue; const k = r(), zd = (r() - 0.5) * 6; if (k < 0.35) det(r() < 0.5 ? 'pebble' : 'pebble2', M.rock.slice(2), x, zd); else if (k < 0.45) det('pebble', C[Math.floor(r() * 5)], x, zd); }

    /* ---- backdrop ---- */
    const P = (p) => Math.ceil(620 + (A.W - 380) * p) + 80;
    {
      const w = P(0.14), s = wallLayer(M, M.far, w, 820, 520, 5, { crys: w / 70, big: 7 });
      // far waterfalls: pale streaks down the back wall
      for (const fx of [w * 0.22, w * 0.63]) for (let y = 120; y < 520; y++) for (let q = -3; q <= 3; q++) if (hash(Math.round(fx + q), y >> 2, 3) > 0.3) s.set(fx + q + Math.sin(y * 0.04) * 1.5, y, q === 0 || hash(q, y, 4) > 0.7 ? M.foam[0] : M.far[4]);
      const L = A.layer(s, 0.14, { haze: 0, base: 520, x: -60 }); L.skirt = M.far[1];
    }
    {
      const w = P(0.4), cols = [];
      for (let x = 60; x < w; x += 150 + r() * 220) cols.push([x, 20 + r() * 26]);
      const s = wallLayer(M, M.mid, w, 760, 470, 17, { cols, crys: w / 50, big: 9, span: 400 });
      A.layer(s, 0.4, { haze: 0, base: 470, x: -30 });
    }
    {
      const w = P(0.7), cols = [];
      for (let x = 120; x < w; x += 330 + r() * 380) cols.push([x, 26 + r() * 20]);
      const s = wallLayer(M, M.rock, w, 700, 420, 29, { cols, crys: w / 120, big: 10, span: 380 });
      A.layer(s, 0.7, { haze: 0, base: 420, x: 0 });
    }

    /* ---- foreground: stalagmites and crystals below, stalactites above ---- */
    for (let x = -40; x < A.W; x += 180 + r() * 220) {
      const s = new ISpr(90, 110), st = Props2.stalactite(M, 30 + r() * 30, 70 + r() * 30, Math.floor(x * 5), true);
      s.paste(st, 45 - st.ax, 110 - st.h);
      for (let k = 0; k < 3; k++) { const c = Props2.crystal(M, 7 + r() * 8, Math.floor(x) + k, C[Math.floor(r() * 5)]); s.paste(c, Math.round(10 + r() * 60), 110 - c.h); }
      s.ax = 45; s.ay = 109;
      A.foreItem(Paint.edge(s, M.ink[0]), x, gy(x) + 70 + r() * 20, { p: 1.35, flip: r() < 0.5 });
    }
    for (let x = 80; x < A.W; x += 220 + r() * 260) {
      if (Math.abs(x - GEO.SHAFT) < 140) continue;
      const st = Props2.stalactite(M, 26 + r() * 30, 70 + r() * 70, Math.floor(x * 9));
      A.foreItem(Paint.edge(st, M.ink[0]), x, CEIL - 60, { p: 1.3, hang: true });
    }
    A.foreDark = 0.35; A.foreTint = 0xff200c10;

    /* ---- hotspots ---- */
    GEO.CHIMES.forEach((x, i) => A.addHot({ x0: x - 10, x1: x + 10, y0: gy(x) - 50, y1: gy(x), x, reach: 34, tap() { FallsAI.ring(A, i); } }));
    A.addHot({ x0: GEO.BOULDER - 24, x1: GEO.BOULDER + 24, y0: gy(GEO.BOULDER) - 38, y1: gy(GEO.BOULDER), x: GEO.BOULDER, reach: 40, tap() { FallsAI.boulder(A); } });
    A.addHot({ x0: GEO.GEYSER - 22, x1: GEO.GEYSER + 22, y0: GEO.GLOW.level - 14, y1: GEO.GLOW.level + 40, x: GEO.GEYSER, reach: 90, mode: 'swim', tap() { FallsAI.geyser(A); } });
    A.addHot({ x0: 2004, x1: 2040, y0: GEO.NEST.y - 10, y1: GEO.GLOW.level, x: 2030, reach: 60, tap() { FallsAI.slideTap(); } });
    A.addHot({ x0: GEO.MIRROR - 14, x1: GEO.MIRROR + 14, y0: gy(GEO.MIRROR) - 58, y1: gy(GEO.MIRROR), x: GEO.MIRROR, reach: 40, tap() { FallsAI.mirror(A); } });
    A.addHot({ x0: GEO.SCOPE - 12, x1: GEO.SCOPE + 12, y0: gy(GEO.SCOPE) - 26, y1: gy(GEO.SCOPE), x: GEO.SCOPE, reach: 36, tap() { FallsAI.scope(A); } });
    A.addHot({ x0: GEO.METEOR - 30, x1: GEO.METEOR + 30, y0: gy(GEO.METEOR) - 40, y1: gy(GEO.METEOR), x: GEO.METEOR, reach: 50, tap() { HUD.toast(FallsAI.S.heart ? 'The meteorite heart hums with space... Minior cores make it pulse.' : 'A cold, dark meteorite. Legends say sun and moon woke it once.', { life: 2.6 }); } });
    A.addHot({ x0: GEO.GEODE - 16, x1: GEO.GEODE + 16, y0: gy(GEO.GEODE) - 24, y1: gy(GEO.GEODE), x: GEO.GEODE, reach: 34, tap() { HUD.toast(FallsAI.S.geodeOpen ? 'An open geode full of purple crystals.' : 'A lumpy rock with purple glints inside... it seems to hum when the crystals sing.', { life: 2.6 }); } });
  };

  /* ---------------- drawing ---------------- */
  const SKY = {
    dawn: ['#3a3a78', '#e89a8a'], noon: ['#3a7ad0', '#a8d8f4'], afternoon: ['#4a78c0', '#f0d8a0'], dusk: ['#3a2a6a', '#ff8a5a'], night: ['#050818', '#141c40'],
  };
  const BEAM = { dawn: ['#ffc8b0', 0.35], noon: ['#fff6d8', 0.5], afternoon: ['#ffe4a8', 0.42], dusk: ['#ffa878', 0.34], night: ['#a8c4ff', 0.22] };
  function backdrop(fb, cy, t) {
    const W = fb.w, H = fb.h, d = fb.d, night = Stage.S.hour === 'night';
    const a = hex(night ? '#05060e' : '#0a0a1a'), b = hex(night ? '#0e1024' : '#1a1a34');
    for (let y = 0; y < H; y++) { const c = mix(a, b, clamp((y + cy - 200) / 500, 0, 1)); d.fill(c, y * W, y * W + W); }
  }
  // the sky seen up the shaft: gradient by hour, sun glare or moon and stars, shooting stars in a shower
  function shaftSky(fb, cx, cy, t) {
    const W = fb.w, H = fb.h, d = fb.d, hr = Stage.S.hour, sk = SKY[hr] || SKY.noon;
    const x0 = Math.max(0, Math.round(GEO.SHAFT - SHAFT_HW - cx)), x1 = Math.min(W, Math.round(GEO.SHAFT + SHAFT_HW - cx)), y1 = Math.min(H, Math.round(CEIL + 40 - cy));
    if (x1 <= x0 || y1 <= 0) return;
    const top = hex(sk[0]), bot = hex(sk[1]), sw = x1 - x0;
    for (let y = 0; y < y1; y++) {
      const wy = y + cy, k = clamp((wy - SKY0) / (CEIL - SKY0), 0, 1), c = mix(top, bot, k * k);
      for (let x = x0; x < x1; x++) d[y * W + x] = c;
    }
    const FS = FallsAI.S;
    if (hr === 'night' || hr === 'dusk') {
      for (let y = 0; y < y1; y++) for (let x = x0; x < x1; x++) { const wx = x + cx, wy = y + cy; const h = hash(wx, wy, 5); if (h > 0.994) d[y * W + x] = mix(0xffffffff, top, (0.5 + 0.5 * Math.sin(t * 3 + wx)) * 0.5); }
      const mx = Math.round(GEO.SHAFT + 18 - cx), my = Math.round(SKY0 + 60 - cy);
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) { const q = x * x + y * y; if (q > 49) continue; const X = mx + x, Y = my + y; if (X < x0 || X >= x1 || Y < 0 || Y >= y1) continue; d[Y * W + X] = (x + 3) ** 2 + (y - 1) ** 2 < 30 ? top : mix(0xfff8f0d8, 0xffffffff, q / 60); }
    } else {
      const sx = Math.round(GEO.SHAFT - 10 - cx), sy = Math.round(SKY0 + 50 - cy);
      for (let y = Math.max(0, sy - 30); y < Math.min(y1, sy + 30); y++) for (let x = Math.max(x0, sx - 30); x < Math.min(x1, sx + 30); x++) { const q = Math.hypot(x - sx, y - sy); if (q < 28) d[y * W + x] = q < 5 ? 0xffffffff : U.screen(d[y * W + x], 0xffd8f8ff, (1 - q / 28) * 0.6); }
    }
    if (FS && FS.stars) for (const s of FS.stars) {
      const k = s.t / s.life, X = x0 + s.x * sw + k * 26, Y = (SKY0 + 10 - cy) + s.y * (CEIL - SKY0) + k * 18;
      for (let j = 0; j < 9; j++) { const px = Math.round(X - j * 1.4), py = Math.round(Y - j); if (px >= x0 && px < x1 && py >= 0 && py < y1) d[py * W + px] = U.mix(d[py * W + px], 0xffffffff, (1 - j / 9) * (1 - k)); }
    }
  }
  // the column of light falling from the shaft, with drifting motes
  function beam(fb, cx, cy, t) {
    const W = fb.w, H = fb.h, d = fb.d, hr = Stage.S.hour, [bc, bk] = BEAM[hr] || BEAM.noon, col = hex(bc);
    const g = World.groundAt(GEO.SHAFT);
    const y0 = Math.max(0, Math.round(CEIL - 20 - cy)), y1 = Math.min(H, Math.round(g + 6 - cy));
    for (let y = y0; y < y1; y++) {
      const wy = y + cy, k = clamp((wy - CEIL + 20) / (g - CEIL + 20), 0, 1), hw = SHAFT_HW * 0.9 + k * 26;
      const xa = Math.max(0, Math.floor(GEO.SHAFT - hw - cx)), xb = Math.min(W, Math.ceil(GEO.SHAFT + hw - cx));
      for (let x = xa; x < xb; x++) {
        const u = Math.abs(x + cx - GEO.SHAFT) / hw, edge = 1 - u * u;
        const a = bk * edge * (0.75 + 0.25 * Math.sin((x + cx) * 0.08 + t * 0.6)) * (1 - k * 0.35);
        if (a < 0.02 || a < bayer4(x, y) * 0.08) continue;
        const i = y * W + x; d[i] = U.screen(d[i], col, a);
      }
    }
    // motes
    for (let k = 0; k < 26; k++) {
      const h1 = hash(k, 1, 9), h2 = hash(k, 2, 9);
      const wx = GEO.SHAFT + (h1 - 0.5) * 90 + Math.sin(t * 0.5 + k) * 8, wy = CEIL + ((h2 * (g - CEIL) + t * (6 + h1 * 6)) % (g - CEIL));
      const X = Math.round(wx - cx), Y = Math.round(wy - cy);
      if (X >= 0 && Y >= 0 && X < W && Y < H) d[Y * W + X] = U.screen(d[Y * W + X], col, 0.8);
    }
  }
  def.drawBack = (A, fb, cx, cy, t) => {
    backdrop(fb, cy, t);
    Stage.drawLayers(fb, cx, cy, t);
    shaftSky(fb, cx, cy, t);
  };
  def.post = (A, fb, cx, cy, t) => {
    beam(fb, cx, cy, t);
    FallsAI.post(A, fb, cx, cy, t);
  };
  def.spawn = (A, G) => FallsAI.spawn(A, G, S);
  def.update = (A, dt, t, G) => FallsAI.update(A, dt, t, G);
  def.weather = () => ({ rain: 0, fog: 0 });
  def.ambient = (hour) => {
    const out = [{ kind: 'mote', rate: 3, c: hex('#bff4ff'), life: 6, sway: 10, bob: 5, vy: -3 }];
    out.push({ kind: 'firefly', rate: hour === 'night' ? 3 : 1.4, c: hex('#8af0e0'), life: 7, sway: 12, bob: 6, y: (x) => World.groundAt(x) - 10 - Math.random() * 120 });
    return out;
  };
  def.onScan = (A) => FallsAI.onScan(A);
  def.onSong = (x) => FallsAI.song(x);
  def.onWater = (tx, ty) => FallsAI.water(tx, ty);
  def.photoBonus = (A, crop, subs, main) => FallsAI.photoBonus(A, crop, subs, main);
  def.S = S;
  return def;
})();
