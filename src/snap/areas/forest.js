/* ------------------------------------------------------------------
   Weather Woods — Route 119 reimagined: a steamy rainforest with giant
   buttress-rooted trees, a river under a sagging rope bridge (with one
   quiet pool beneath it), the Weather Institute on the hill with its
   weather lever, a lily pond, tall grass, mushrooms and ferns. Rain
   comes and goes; after rain, a rainbow. Light shafts through the
   canopy, mist in the morning, fireflies at night.
------------------------------------------------------------------- */
Areas.forest = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, fbm, mix, hex } = U;
  const RIVER = { x0: 930, x1: 1475, level: 578 }, POND = { x0: 2250, x1: 2780, level: 576 };
  const BRIDGE = { x0: 905, x1: 1500, y: 552 };
  const def = {
    id: 'forest', name: 'Weather Woods', sub: 'Route 119 Rainforest', music: 'lake', seed: 23,
    W: 3300, H: 900, sea: null, refY: 560, h0: 118, cy0: 330, ph: 0.05, skyH: 300, sunH: 130, band: 12, waves: 0.6,
    camY: [-60, 900], frameY: 0.68, start: 240,
    ground: [[0, 560], [200, 556], [420, 562], [700, 558], [880, 562], [925, 572], [960, 600], [1010, 628], [1100, 640], [1200, 648], [1300, 640], [1400, 626], [1445, 600], [1478, 572], [1520, 562], [1800, 556], [2000, 560], [2200, 562], [2248, 572], [2290, 600], [2400, 614], [2520, 618], [2640, 612], [2740, 598], [2782, 572], [2820, 562], [3000, 556], [3300, 550]],
    water: [{ x0: RIVER.x0, x1: RIVER.x1, level: RIVER.level, kind: 'river' }, { x0: POND.x0, x1: POND.x1, level: POND.level, kind: 'pond' }],
    plats: [{ x0: BRIDGE.x0, x1: BRIDGE.x1, y: BRIDGE.y, kind: 'bridge', ladders: [1195] }],
    sky: {
      noon: [[0, '#4a86c8'], [0.4, '#78aad8'], [0.75, '#a8cfe4'], [1, '#d0e8e8']],
      afternoon: [[0, '#4f7cc0'], [0.5, '#88acd8'], [0.85, '#d8d0b8'], [1, '#f0d8a0']],
    },
    mats: {
      ink: ['#10160e', '#1c2418'],
      soil: ['#2e2016', '#3e2c1c', '#523a24', '#684a30', '#7e5c3c'],
      litter: ['#4a3420', '#6a4a26', '#8a5e2a', '#a8742e', '#c89040'],
      moss: ['#1e4a22', '#2e6a2c', '#4a8a36', '#76b048'],
      grass: ['#163e20', '#22582a', '#347834', '#56a042', '#8ccc5a'],
      leaf: ['#0e3218', '#164a22', '#22642c', '#368438', '#58a846', '#8cd062'],
      leafD: ['#0a2414', '#10341c', '#184824', '#24602e'],
      bark: ['#2a1c14', '#3e2a1c', '#563a26', '#6e4c32', '#8a6440'],
      wood: ['#3a2414', '#553820', '#74502e', '#946a40', '#b48552', '#d4a46c'],
      rope: ['#6a5230', '#9a7e4e', '#c8ac78'],
      rock: ['#2e3438', '#454e52', '#606a6a', '#7e8a86', '#a4b0a8'],
      metal: ['#20262e', '#3e4854', '#6e7c8c', '#aebccc'],
      wallW: ['#8e969e', '#b4bcc4', '#d6dce2', '#f0f4f6'],
      roofB: ['#1c3a6a', '#28528e', '#3a70b4', '#5a94d4'],
      win: { c: ['#ffd070', '#fff0b8'], emit: true },
      capR: ['#6a1a18', '#a02a22', '#d44a34', '#f07a50'],
      capB: ['#3a2a6a', '#5a44a0', '#8468d0', '#b49cf0'],
      stem: ['#a89a80', '#cabca0', '#e8dcc0', '#fff6e0'],
      pad: ['#1a4a22', '#2a6a2e', '#44903e', '#6cb456'],
      lotus: ['#c85a8a', '#f08ab4', '#ffd0e4'],
      fruit: ['#a86a10', '#e0a020', '#ffd850'],
      berry: ['#1a3a8a', '#3a6ae0', '#9ad0ff'],
      flower: ['#c8406a', '#ff7aa0', '#ffd0e0'],
      flowerY: ['#c8901a', '#ffd040', '#fff4a0'],
      fall: { c: ['#8ed8f0', '#b8ecfa', '#e0f8ff', '#ffffff', '#c8f0ff', '#9ee0f4'], cycle: true },
      foam: ['#d8f4ff', '#ffffff'],
      riverBed: ['#2a2e26', '#3a4034', '#4e5644', '#667058'],
      mist: ['#c8dcd4', '#e0ece8'],
      hill: ['#1a3c2c', '#24503a', '#346a48', '#4c8a5a', '#6aa870'],
      far: ['#3e6a78', '#548492', '#6c9eaa', '#8ab8c0', '#a8d0d4'],
      glow: { c: ['#c8ff9a', '#f0ffd0'], emit: true },
    },
  };
  def.cycleRate = 9;
  def.waterCols = (hour, w) => {
    const night = hour === 'night', dusk = hour === 'dusk';
    return { top: night ? hex('#1e3a4a') : dusk ? hex('#5a5a6a') : hex('#5aa8a8'), mid: night ? hex('#0e2230') : hex('#2e6a6e'), deep: night ? hex('#061018') : hex('#16383c'), foam: hex('#e8fcff'), hi: night ? hex('#8ab8c8') : hex('#d0f4f0'), ray: null, maxD: 140 };
  };
  const S = { weather: 'sun', leverT: 0, rainClock: 30, rainbow: 0, rainWas: 0 };

  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const gy = (x) => World.groundAt(x);
    // ---- terrain: loamy forest floor with leaf litter and moss over rooty soil ----
    Terrain.paint(A, {
      bb: 7, bf: 5,
      strip(x, y, u, e) {
        const g = gy(x);
        const inRiver = x > RIVER.x0 + 20 && x < RIVER.x1 - 20, inPond = x > POND.x0 + 30 && x < POND.x1 - 30;
        const n = e.n2(x, y * 3), n1 = e.n1(x, y);
        if (inRiver || inPond) return e.pickR(M.riverBed, 0.6 - u * 0.3 + (n - 0.5) * 0.4, x, y);
        let t = 0.62 - u * 0.36 + (n - 0.5) * 0.35;
        if (u < 0.15) t += 0.2;
        if (n1 > 0.55) return e.pickR(M.moss, t, x, y);
        if (e.hash(x, y, 7) > 0.93) return M.litter[2 + ((x + y) & 1)];
        return e.pickR(M.litter.slice(0, 4), t, x, y);
      },
      face(x, y, dep, e) {
        const n1 = e.n1(x, y), n2 = e.n2(x, y);
        if (dep <= 1) return M.soil[0];
        const band = (dep + n1 * 12) / 16, bi = Math.floor(band);
        let t = 0.7 - Math.min(0.5, dep / 200) - (bi % 3 === 1 ? 0.12 : 0) + (n2 - 0.5) * 0.2;
        if (band - bi < 0.1) t -= 0.12;
        return e.pickR(M.soil, t, x, y);
      },
    });
    // roots threading through the soil, and stones
    for (let k = 0; k < 90; k++) {
      let x = r() * A.W, y = gy(x) + 8 + r() * 20, a = Math.PI * (0.2 + r() * 0.6);
      const L = 20 + r() * 60;
      for (let j = 0; j < L; j++) { Terrain.put(A, x, y, M.bark[j % 5 === 0 ? 3 : 2]); Terrain.put(A, x, y + 1, M.bark[1]); x += Math.cos(a); y += Math.sin(a) * 0.6; a += (r() - 0.5) * 0.3; }
    }
    for (let k = 0; k < 60; k++) { const x = r() * A.W; Terrain.stamp(A, Paint.rock(M, 6 + r() * 8, 4 + r() * 5, k, { flat: false, cracks: 0 }), x, gy(x) + 14 + r() * 80); }
    // ---- the rope bridge (walkable, sags) ----
    const B = Props2.ropeBridge(M, BRIDGE.x0, BRIDGE.x1, BRIDGE.y, { sag: 9 });
    A.props.push({ frames: [B.back], x: 0, y: 0, zd: -3 });
    A.props.push({ frames: [B.front], x: 0, y: 0, zd: 4, late: true });
    World.plats[0].fy = (x) => B.deckY(x) + 1;
    def.plats[0].fy = World.plats[0].fy;
    // ---- lane props ----
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    const giant = (x, H, seed, o = {}) => put(Paint.tree(M, H, seed, Object.assign({ trunkRamp: M.bark, leafRamp: M.leaf, roots: true, vines: true, crownW: H * 1.1, crownH: H * 0.55, trunkW: H * 0.06 }, o)), x, -5, { sink: 6, foot: 40 });
    giant(150, 300, 3); giant(780, 330, 7); giant(1660, 310, 11); giant(2080, 350, 13); giant(2990, 320, 17);
    A.fruitTree = put(Paint.tree(M, 150, 19, { trunkRamp: M.bark, leafRamp: M.leaf, fruit: M.fruit, fruitN: 14, crownW: 150, crownH: 90 }), 560, -4, { sink: 4, foot: 16 });
    for (const [x, s] of [[330, 26], [1580, 22], [2860, 28]]) put(Paint.bush(M, s, s * 0.6, x, { ramp: M.leaf, dots: M.berry, nd: 8 }), x, -3, { sink: 3 });
    put(Props2.log(M, 70, 5), 440, 2, { sink: 3 });
    put(Props2.log(M, 54, 9, false), 2150, -2, { sink: 3 });
    A.stump = put(Props2.stump(M, 34, 20, 4), 2860, -1, { sink: 2 });
    A.lever = put(Props2.lever(M, false), 1760, -2, { sink: 2 });
    put(Paint.rock(M, 30, 18, 33, { moss: M.moss }), 1722, -1, { sink: 4 });
    for (let x = 30; x < A.W; x += 26 + r() * 60) {
      if ((x > RIVER.x0 - 10 && x < RIVER.x1 + 10) || (x > POND.x0 - 10 && x < POND.x1 + 10)) continue;
      const k = r();
      if (k < 0.3) put(Paint.fern(M, 12 + r() * 10, Math.floor(x), { ramp: M.leaf }), x, r() < 0.5 ? -4 : 3, { sink: 2, sway: 1.2 });
      else if (k < 0.45) put(Props2.mushroom(M, 3 + Math.floor(r() * 4), Math.floor(x), r() < 0.3 ? 1 : 0), x, 1 + r() * 3, { sink: 1 });
      else if (k < 0.7) put(Paint.tuft(M, 10 + r() * 10, 10 + r() * 12, Math.floor(x), { ramp: M.grass, flowers: r() < 0.3 ? [M.flower] : null }), x, r() < 0.5 ? 3 : -3, { windFrames: true, sink: 0 });
      else if (k < 0.8) put(Paint.rock(M, 14 + r() * 16, 9 + r() * 8, Math.floor(x), { moss: M.moss }), x, r() < 0.5 ? 2 : -3, { sink: 3 });
    }
    // tall grass meadow where a Kecleon likes to hide
    for (let x = 1840; x < 2020; x += 7 + r() * 6) put(Paint.tuft(M, 14, 24 + r() * 10, Math.floor(x * 3), { ramp: M.grass, density: 1.2 }), x, r() < 0.5 ? 2 : -2, { windFrames: true, sink: 0 });
    // water plants
    for (let x = POND.x0 + 40; x < POND.x1 - 40; x += 34 + r() * 50) A.props.push({ frames: [Props2.lilypad(M, 16 + Math.floor(r() * 10), Math.floor(x), r() < 0.35)], x, y: POND.level + 1, zd: 2, pad: true });
    for (const x of [RIVER.x0 - 6, RIVER.x1 + 8, POND.x0 - 4, POND.x1 + 6, POND.x0 + 30, POND.x1 - 26]) put(Props2.reeds(M, 22 + r() * 12, Math.floor(x)), x, 2, { windFrames: false, sink: 0 });
    // micro detail
    const det = (key, ramp, x, zd) => { const s = Paint.miniSpr(key, ramp); A.details.push({ s, x, y: gy(x) + zd, zd }); };
    for (let x = 10; x < A.W; x += 4 + r() * 10) {
      if ((x > RIVER.x0 + 20 && x < RIVER.x1 - 20) || (x > POND.x0 + 30 && x < POND.x1 - 30)) continue;
      const k = r(), zd = (r() - 0.5) * 10;
      if (k < 0.18) det('leaf', M.litter, x, zd); else if (k < 0.28) det('twig', M.bark, x, zd); else if (k < 0.36) det('flower', r() < 0.5 ? M.flower : M.flowerY, x, zd);
      else if (k < 0.44) det('clover', M.moss, x, zd); else if (k < 0.5) det('mush', M.capR, x, zd); else if (k < 0.56) det('pebble2', M.rock, x, zd);
    }
    // ---- backdrop ----
    // misty mountains with a far waterfall
    {
      const w = 800, h = 110, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.far, base: h, amp: 90, seed: 5, freq: 0.006, peaks: [[160, 140, 1], [520, 200, 0.85]], snow: null });
      for (let y = 30; y < h; y++) for (let x = 330; x < 338; x++) if (s.get(x, y)) s.set(x, y, M.mist[(y + x) % 3 === 0 ? 0 : 1]);
      A.layer(s, 0.03, { haze: 0.55, base: h - 1, x: -60 }).skirt = M.far[2];
    }
    // far canopy (rolling tree line) with mist
    {
      const w = 1100, h = 90, s = new ISpr(w, h);
      Paint.treeline(s, { ramp: M.hill, base: h * 0.55, size: 12, seed: 8, jag: 6 });
      for (let y = h - 30; y < h; y++) for (let x = 0; x < w; x++) if (s.get(x, y) && bayer4(x, y) < (y - (h - 30)) / 60) s.set(x, y, M.hill[1]);
      A.layer(s, 0.14, { haze: 0.45, base: h - 1, x: 0 }).skirt = M.hill[1];
    }
    // the Weather Institute on its hill
    {
      const w = 1500, h = 170, s = new ISpr(w, h);
      Paint.treeline(s, { ramp: M.hill, base: h - 30, size: 16, seed: 12, jag: 8 });
      // hill clearing
      for (let x = 560; x < 820; x++) { const u = (x - 690) / 130; const top = h - 34 - Math.max(0, 1 - u * u) * 26; for (let y = Math.round(top); y < h; y++) s.set(x, y, Props.pick(M.grass, 0.6 - (y - top) / 40, x, y)); }
      const ins = Props2.institute(M, 3);
      s.paste(ins, 690 - ins.ax, h - 60 - ins.ay + 4);
      A.instGlow = true;
      A.layer(s, 0.24, { haze: 0.34, base: h - 1, x: 60 }).skirt = M.hill[1];
    }
    // mid forest: big trunks and canopy clumps, a waterfall feeding the river
    {
      const w = 2400, h = 360, s = new ISpr(w, h);
      for (let x = 30; x < w; x += 90 + r() * 120) {
        const tr = Paint.tree(M, 180 + r() * 60, Math.floor(x), { trunkRamp: M.bark, leafRamp: M.leafD, crownW: 180, crownH: 110, trunkW: 9 });
        s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 6);
      }
      for (let x = 0; x < w; x++) for (let y = h - 8; y < h; y++) s.set(x, y, M.leafD[1]);
      const fall = Props2.waterfall(M, 26, 150, 4);
      const fx = Math.round(1200 * 0.52 + 40);
      s.paste(fall, fx - 13, h - 150);
      A.layer(s, 0.36, { haze: 0.3, base: h - 1, x: 40 }).skirt = M.leafD[1];
    }
    // near forest wall: huge trunks and vines, skirting down to the lane
    {
      const w = 3000, h = 420, s = new ISpr(w, h);
      for (let x = 60; x < w; x += 140 + r() * 160) {
        const tr = Paint.tree(M, 260 + r() * 60, Math.floor(x * 5), { trunkRamp: M.bark, leafRamp: M.leaf, roots: true, vines: true, crownW: 240, crownH: 140, trunkW: 14 });
        s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 2);
      }
      for (let x = 0; x < w; x += 12 + r() * 20) { const f = Paint.fern(M, 14 + r() * 8, Math.floor(x * 7), { ramp: M.leafD }); s.paste(f, Math.round(x - f.ax), h - f.ay - 1); }
      const L = A.layer(s, 0.5, { haze: 0.24, base: h - 1, x: 0 });
      L.skirt = M.leafD[0];
    }
    // ---- 2.5D depth: the forest floor recedes in perspective from the tree wall to the lane; the river
    // and the pond reach back into the distance; trees, ferns, mushrooms and rocks stand at many depths ----
    {
      A.depthP0 = 0.5; A.depthHaze = 0.24;
      const riverC = (p) => 1200 + (1 - p) / 0.5 * 230 + Math.sin((1 - p) * 9) * 40 * (1 - p);
      const RHW = 270, PC = 2515, PHW = 262;
      const pondHW = (p) => { const k = (1 - p) / 0.42; return k >= 1 ? 0 : PHW * Math.sqrt(1 - k * k); };
      const inWater = (wx, p, m = 0) => Math.abs(wx - riverC(p)) < RHW + m || Math.abs(wx - PC) < pondHW(p) + m;
      A.floor = { p0: 0.5, D: 130,
        row(wz, p, t) {
          const wc = def.waterCols(Stage.S.hour);
          return { rc: riverC(p), phw: pondHW(p), top: wc.top, hi: wc.hi, mid: wc.mid, flow: t * 3, rain: Weather.W.rain > 0.3, tq: Math.floor(t * 4) };
        },
        tex(wx, wz, p, t, R) {
          const dr = Math.abs(wx - R.rc) - RHW, dp = R.phw > 0 ? Math.abs(wx - PC) - R.phw : 99;
          const dw = dr < dp ? dr : dp;
          if (dw < 0) {
            // water reaching into the distance: current streaks flowing toward you, glints, lily pads on the pond
            if (dp < 0 && Stage.noiseAt(wx * 0.6, wz * 2) > 0.72) return Stage.noiseAt(wx * 1.3, wz * 3) > 0.8 ? M.lotus[1] : M.pad[2];
            if (dw > -3) return R.hi;
            const st = Math.sin(wz * 0.55 + R.flow + Stage.noiseAt(wx * 0.3, wz) * 5);
            if (st > 0.93) return R.hi;
            if (hash(Math.floor(wx / 3), Math.floor(wz), R.tq) > 0.985) return 0xffffffff;
            return st < -0.6 ? R.mid : R.top;
          }
          if (dw < 7) return M.soil[dw < 3 ? 2 : 3];            // muddy bank
          if (dw < 14) return M.moss[Stage.noiseAt(wx, wz) > 0.5 ? 2 : 1];
          const n = Stage.noiseAt(wx * 0.4, wz * 1.2), n2 = Stage.noiseAt(wx * 1.7 + 50, wz * 3.1);
          if (R.rain && n2 > 0.84) return n2 > 0.9 ? R.hi : R.top;  // rain puddles
          if (n2 > 0.95) return (Math.floor(wx) & 1) ? M.flower[1] : M.flowerY[1];
          if (n > 0.6) return M.moss[n > 0.72 ? 3 : 2];
          if (n < 0.3) return M.litter[n < 0.2 ? 1 : 2];
          return M.grass[n2 > 0.5 ? 3 : 2];
        } };
      const r2 = rng(4242);
      const place = (make, n, p0, p1, m) => {
        for (let i = 0, g = 0; i < n && g < n * 25; g++) {
          const p = p0 + r2() * (p1 - p0), wx = 40 + r2() * (A.W - 80);
          if (inWater(wx, p, m)) continue;
          if (make(p, wx, i)) i++;
        }
      };
      // trees at every depth (painted at their distance's size), then the undergrowth
      place((p, wx, i) => A.scatterAt(Paint.tree(M, Math.round((220 + r2() * 90) * p), 2000 + i, { trunkRamp: M.bark, leafRamp: r2() < 0.5 ? M.leaf : M.leafD, roots: true, vines: r2() < 0.6, crownW: Math.round((180 + r2() * 60) * p), crownH: Math.round((110 + r2() * 40) * p), trunkW: Math.max(3, Math.round(12 * p)) }), wx, p), 22, 0.53, 0.9, 40);
      place((p, wx, i) => A.scatterAt(Paint.fern(M, Math.round((14 + r2() * 12) * p), 2100 + i, { ramp: r2() < 0.5 ? M.leaf : M.grass }), wx, p, { sway: 0.8 }), 70, 0.52, 0.97, 12);
      place((p, wx, i) => A.scatterAt(Paint.bush(M, Math.round((22 + r2() * 20) * p), Math.round((12 + r2() * 10) * p), 2200 + i, { ramp: M.leaf, dots: r2() < 0.4 ? M.berry : r2() < 0.5 ? M.flower : null, nd: 5 }), wx, p), 30, 0.52, 0.95, 20);
      place((p, wx, i) => A.scatterAt(Props2.mushroom(M, Math.max(2, Math.round((3 + r2() * 4) * p)), 2300 + i, r2() < 0.35 ? 1 : 0), wx, p), 40, 0.6, 0.98, 8);
      place((p, wx, i) => A.scatterAt(Paint.rock(M, Math.round((14 + r2() * 22) * p), Math.round((9 + r2() * 12) * p), 2400 + i, { moss: M.moss }), wx, p), 30, 0.52, 0.97, 10);
      place((p, wx, i) => A.scatterAt(Props2.log(M, Math.round((40 + r2() * 30) * p), 2500 + i, r2() < 0.5), wx, p), 6, 0.6, 0.95, 30);
      place((p, wx, i) => A.scatterAt(Paint.tuft(M, Math.round((8 + r2() * 8) * p), Math.round((10 + r2() * 14) * p), 2600 + i, { ramp: M.grass, flowers: r2() < 0.35 ? [r2() < 0.5 ? M.flower : M.flowerY] : null }), wx, p, { windFrames: true }), 80, 0.55, 0.98, 6);
      // reeds along the receding river banks
      for (let k = 0; k < 40; k++) { const p = 0.52 + r2() * 0.45, side = r2() < 0.5 ? -1 : 1, wx = riverC(p) + side * (RHW + 8 + r2() * 10); A.scatterAt(Props2.reeds(M, Math.round((18 + r2() * 12) * p), 2700 + k), wx, p); }
      A.riverC = riverC;
    }
    // ---- foreground: giant fern fronds below, hanging vines and leaves above ----
    for (let x = -60; x < A.W; x += 110 + r() * 160) {
      let s = Paint.clump(r() < 0.6 ? M.leaf : M.grass, 60 + r() * 40, 70 + r() * 40, Math.floor(x * 11), r() < 0.5 ? 'frond' : 'grass', { n: 12 });
      if (r() < 0.5) Paint.tips(s, r() < 0.5 ? M.flower : M.flowerY, 4, Math.floor(x * 5), 1.8);
      s = Paint.edge(s, M.ink[0]);
      A.foreItem(s, x, gy(x) + 62 + r() * 24, { p: 1.35, sway: 3, flip: r() < 0.5 });
    }
    for (let x = 40; x < A.W; x += 240 + r() * 300) {
      const s = Paint.clump(M.leaf, 50 + r() * 30, 80 + r() * 40, Math.floor(x * 13), 'leaf', { spread: 1.2 });
      const v = new ISpr(s.w, s.h); for (let y = 0; y < s.h; y++) for (let xx = 0; xx < s.w; xx++) v.d[y * s.w + xx] = s.d[(s.h - 1 - y) * s.w + xx];
      A.foreItem(v, x, gy(x) - 230 - r() * 40, { p: 1.3, sway: 2, hang: true });
    }
    A.foreDark = 0.2; A.foreTint = 0xff0a1a0a;
    // ---- glows: institute windows at night, fireflies are weather ambient ----
    A.glows.push({ x: 1200, y: 360, r: 0, c: 0, a: 0 });
    // ---- hotspots ----
    A.addHot({ x0: 1748, x1: 1772, y0: gy(1760) - 30, y1: gy(1760), x: 1760, reach: 36, tap() { ForestAI.lever(A); }, onScan() { FX.sparkles(1760, gy(1760) - 20, 6, 14, 0xffffffff, hex('#7affc0')); HUD.toast('Scan: the Institute\'s weather lever. It cycles clear, rain, sun and snow!', { life: 3 }); return true; } });
    A.addHot({ x0: 520, x1: 600, y0: gy(560) - 150, y1: gy(560) - 50, x: 560, reach: 60, tap() { ForestAI.shakeTree(A); } });
    for (const bx of [330, 1580, 2860]) A.addHot({ x0: bx - 14, x1: bx + 14, y0: gy(bx) - 16, y1: gy(bx), x: bx, reach: 34, tap() { ForestAI.bush(A, bx); } });
    A.addHot({ x0: 1150, x1: 1250, y0: RIVER.level - 4, y1: RIVER.level + 50, x: 1200, reach: 120, remote: false, stand: 552, tap() { ForestAI.pool(A); }, onScan() { if (!Save.found('forest.feebas')) { FX.add({ type: 'ripple', x: 1205, y: RIVER.level + 1, r0: 2, r1: 16, flat: 0.3, life: 1.4, c: 0xffffffff, layer: 2 }); HUD.toast('Scan: odd ripples in the quiet pool under the bridge...', { life: 3 }); return true; } return false; } });
    // toys: a vine to swing across the river, a giant mushroom to bounce on
    Toys.vine(A, M, RIVER.x0 - 52, RIVER.x1 + 42, 560);
    { const mu = put(Props2.mushroom(M, 13, 77, 0), 2188, -2, { sink: 1 }); const ms = mu.frames[0]; Toys.springy(A, 2188, mu.y - ms.ay + 6, { prop: mu, secret: 'toy.mushroom', w: 22 }); }
    A.addHot({ x0: 2842, x1: 2878, y0: gy(2860) - 24, y1: gy(2860), x: 2860, reach: 40, tap() { HUD.toast('A mossy stump... like a little stage.', { life: 2.4 }); } });
  };

  /* ---------------- drawing ---------------- */
  def.drawBack = (A, fb, cx, cy, t) => {
    Stage.drawSky(fb, cx, cy, t);
    // rainbow after rain
    if (S.rainbow > 0) ForestAI.drawRainbow(fb, cx, cy, t, ForestAI.rainbowK());
    Stage.drawLayers(fb, cx, cy, t);
  };
  def.drawLane = (A, fb, cx, cy, t) => {
    for (const p of A.props) if (p.pad) p.y = WorldRender.surfaceAt(p.x, t) + 1;
  };
  def.post = (A, fb, cx, cy, t) => {
    const hr = Stage.S.hour;
    // light shafts through the canopy on clear days
    if ((hr === 'noon' || hr === 'afternoon' || hr === 'dawn') && Weather.W.rain < 0.3) {
      const W = fb.w, H = fb.h, d = fb.d, k = (hr === 'dawn' ? 0.14 : 0.1) * (1 - Weather.W.rain * 3) * (S.weather === 'sun' ? 2.2 : 1);
      const col = hr === 'afternoon' ? 0xffa0e0ff : hr === 'dawn' ? 0xffc0d0ff : 0xffc8f4ff;
      // the shaft pattern only depends on the slanted coordinate: tabulate it once per frame
      const base = Math.floor(cx * 0.6), n = W + Math.ceil(H * 0.45) + 2;
      if (!def._shaft || def._shaft.length < n) def._shaft = new Float32Array(n + 64);
      const tab = def._shaft;
      for (let j = 0; j < n; j++) { const wx = base + j; const v = Math.sin(wx * 0.021) * Math.sin(wx * 0.0073 + 1.3) + Math.sin(t * 0.3 + wx * 0.002) * 0.2; tab[j] = v > 0.55 ? v - 0.55 : 0; }
      for (let y = 0; y < H; y++) {
        const ky = k * (0.4 + 0.6 * (1 - y / H)), off = Math.floor(y * 0.45), row = y * W;
        for (let x = 0; x < W; x++) { const v = tab[x + off]; if (v > 0) { const a = v * ky; if (a > 0.004) d[row + x] = U.screen(d[row + x], col, a); } }
      }
    }
    ForestAI.post(A, fb, cx, cy, t);
  };
  def.spawn = (A, G) => ForestAI.spawn(A, G, S);
  def.update = (A, dt, t, G) => ForestAI.update(A, dt, t, G, S);
  def.weather = (hour) => ({ rain: 0, fog: hour === 'dawn' ? 0.5 : 0.1 });
  def.ambient = (hour, W) => {
    const out = [{ kind: 'mote', rate: 3, c: hex('#e8ffd0'), life: 5, sway: 10, bob: 4, vy: -2 }];
    if (hour === 'night' || hour === 'dusk') out.push({ kind: 'firefly', rate: 3, c: hex('#c8ff9a'), life: 8, sway: 14, bob: 8, y: (x) => World.groundAt(x) - 20 - Math.random() * 120 });
    else {
      out.push({ kind: 'butterfly', rate: 0.7, c: hex(Math.random() < 0.5 ? '#6ad0ff' : '#ffb040'), c2: hex('#ffffff'), life: 12, sway: 18, bob: 10, y: (x) => World.groundAt(x) - 14 - Math.random() * 50 });
      out.push({ kind: 'dragonfly', rate: 0.5, c: hex('#3ad8a0'), c2: hex('#1a6a8a'), life: 8, sway: 30, bob: 6, vy: 0, y: (x) => World.groundAt(x) - 20 - Math.random() * 40 });
      out.push({ kind: 'seed', rate: 0.8, life: 10, drift: 2, vy: -1, sway: 12, bob: 6, y: (x) => World.groundAt(x) - 30 - Math.random() * 120 });
      out.push({ kind: 'bird', rate: 0.15, group: [2, 4], vx0: 26, par: 0.3, c: hex('#1a2a2a'), life: 40, sway: 3, bob: 3, y: () => 140 + Math.random() * 80 });
    }
    if (hour !== 'night') out.push({ kind: 'leaf', rate: 0.8, c: hex('#56a042'), c2: hex('#8ccc5a'), life: 9, drift: 1, vy: 8, y: (x) => World.groundAt(x) - 200 - Math.random() * 80 });
    return out;
  };
  def.onScan = (A) => ForestAI.onScan(A);
  def.onSong = (x) => ForestAI.song(x);
  def.onWater = (tx, ty) => ForestAI.water(tx, ty);
  def.photoBonus = (A, crop, subs, main) => ForestAI.photoBonus(A, crop, subs, main);
  def.S = S;
  return def;
})();
