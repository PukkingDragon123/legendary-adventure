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
  const RIVER = { x0: 1090, x1: 1635, level: 578 }, POND = { x0: 2840, x1: 3370, level: 576 };
  const BRIDGE = { x0: 1065, x1: 1660, y: 552 };
  const MEADOW = 4170; // where the woods open onto the Flower Meadow (expand.js)
  const def = {
    id: 'forest', name: 'Weather Woods', sub: 'Route 119 Rainforest', music: 'lake', seed: 23,
    W: 4170, H: 900, sea: null, refY: 560, h0: 118, cy0: 330, ph: 0.05, skyH: 300, sunH: 130, band: 12, waves: 0.6,
    camY: [-60, 900], frameY: 0.76, start: 240,
    ground: [[0, 560], [200, 556], [420, 562], [860, 558], [1040, 562], [1085, 572], [1120, 600], [1170, 628], [1260, 640], [1360, 648], [1460, 640], [1560, 626], [1605, 600], [1638, 572], [1680, 562], [2240, 556], [2440, 560], [2790, 562], [2838, 572], [2880, 600], [2990, 614], [3110, 618], [3230, 612], [3330, 598], [3372, 572], [3530, 562], [3710, 556], [4170, 550]],
    water: [{ x0: RIVER.x0, x1: RIVER.x1, level: RIVER.level, kind: 'river' }, { x0: POND.x0, x1: POND.x1, level: POND.level, kind: 'pond' }],
    plats: [{ x0: BRIDGE.x0, x1: BRIDGE.x1, y: BRIDGE.y, kind: 'bridge', ladders: [1355] }],
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
      lichen: ['#7a8a6a', '#a8b890'],
      mossH: ['#24401e', '#3e5e2e', '#5e7e40', '#86a45c'],
      glowS: { c: ['#1e6a6a', '#3ad0b8', '#9affe0', '#e8fff6'], emit: true },
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
    const wetX = (x) => (x > RIVER.x0 + 10 && x < RIVER.x1 - 10) || (x > POND.x0 + 20 && x < POND.x1 - 20);
    Scenic.laneRoots(A, M, { ramp: M.bark, rock: M.rock, ok: (x) => !wetX(x), seed: 23, p: 0.5, len: 26, lip: M.moss, lipLen: 6 });
    // ---- the rope bridge (walkable, sags) ----
    const B = Props2.ropeBridge(M, BRIDGE.x0, BRIDGE.x1, BRIDGE.y, { sag: 9 });
    A.props.push({ frames: [B.back], x: 0, y: 0, zd: -3 });
    A.props.push({ frames: [B.front], x: 0, y: 0, zd: 4, late: true });
    World.plats[0].fy = (x) => B.deckY(x) + 1;
    def.plats[0].fy = World.plats[0].fy;
    // ---- lane props ----
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    const giant = (x, H, seed, o = {}) => { const s = Paint.tree(M, H, seed, Object.assign({ trunkRamp: M.bark, leafRamp: M.leaf, roots: true, vines: true, crownW: H * 1.1, crownH: H * 0.55, trunkW: H * 0.06 }, o)); Scenic.bark(s, M.bark, { moss: M.moss, seed, lichen: M.lichen[1], furrow: 0.28 }); Scenic.hangMoss(s, M.mossH, { from: [M.leaf], n: Math.round(s.w / 7), len: 26, seed, leaves: true }); return put(s, x, -5, { sink: 6, foot: 40 }); };
    giant(150, 300, 3); giant(940, 330, 7); giant(1980, 310, 11); giant(2520, 350, 13); giant(3700, 320, 17);
    A.fruitTree = put(Paint.tree(M, 150, 19, { trunkRamp: M.bark, leafRamp: M.leaf, fruit: M.fruit, fruitN: 14, crownW: 150, crownH: 90 }), 720, -4, { sink: 4, foot: 16 });
    for (const [x, s] of [[330, 26], [1900, 22], [3570, 28]]) put(Paint.bush(M, s, s * 0.6, x, { ramp: M.leaf, dots: M.berry, nd: 8 }), x, -3, { sink: 3 });
    put(Props2.log(M, 70, 5), 440, -2, { sink: 3 });
    put(Props2.log(M, 54, 9, false), 2740, -2, { sink: 3 });
    A.stump = put(Props2.stump(M, 34, 20, 4), 3570, -1, { sink: 2 });
    A.lever = put(Props2.lever(M, false), 2080, -2, { sink: 2 });
    // bioluminescent fungus: little teal mushroom clusters that glow at night (on roots, logs and damp banks)
    {
      const MG = Object.assign(Object.create(M), { capR: M.glowS, capB: M.glowS });
      const cluster = (seed) => { const rr = rng(seed), s = new ISpr(22, 14); for (let k = 0; k < 2 + Math.floor(rr() * 3); k++) { const m = Props2.mushroom(MG, 2 + Math.floor(rr() * 3), seed + k); s.paste(m, Math.round(3 + rr() * 10 - m.ax + m.w / 2) - Math.round(m.w / 2) + 2, 14 - m.h); } s.ax = 11; s.ay = 13; return s; };
      for (let x = 260, k = 0; x < MEADOW - 60; x += 120 + r() * 220, k++) {
        if (wetX(x) || (x > RIVER.x0 - 40 && x < RIVER.x1 + 40)) continue;
        put(cluster(900 + k), x, r() < 0.5 ? -3 : 2, { sink: 1 });
        if (k % 2 === 0) A.glows.push({ x, y: gy(x) - 5, r: 16, c: hex('#3ae0c0'), a: 0.4, k: 0.9 });
      }
    }
    put(Paint.rock(M, 30, 18, 33, { moss: M.moss }), 2042, -1, { sink: 4 });
    for (let x = 30; x < A.W; x += 26 + r() * 60) {
      if ((x > RIVER.x0 - 10 && x < RIVER.x1 + 10) || (x > POND.x0 - 10 && x < POND.x1 + 10)) continue;
      const k = r();
      if (k < 0.3) put(Paint.fern(M, 12 + r() * 10, Math.floor(x), { ramp: M.leaf }), x, r() < 0.5 ? -4 : 3, { sink: 2, sway: 1.2 });
      else if (k < 0.45) put(Props2.mushroom(M, 3 + Math.floor(r() * 4), Math.floor(x), r() < 0.3 ? 1 : 0), x, 1 + r() * 3, { sink: 1 });
      else if (k < 0.7) put(Paint.tuft(M, 10 + r() * 10, 10 + r() * 12, Math.floor(x), { ramp: M.grass, flowers: r() < 0.3 ? [M.flower] : null }), x, r() < 0.5 ? 3 : -3, { windFrames: true, sink: 0 });
      else if (k < 0.8) put(Paint.rock(M, 14 + r() * 16, 9 + r() * 8, Math.floor(x), { moss: M.moss }), x, r() < 0.5 ? 2 : -3, { sink: 3 });
    }
    // tall grass meadow where a Kecleon likes to hide
    for (let x = 2280; x < 2460; x += 7 + r() * 6) put(Paint.tuft(M, 14, 24 + r() * 10, Math.floor(x * 3), { ramp: M.grass, density: 1.2 }), x, r() < 0.5 ? 2 : -2, { windFrames: true, sink: 0 });
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
    // where the woods open onto the Flower Meadow, in a layer's own coordinates (the walls thin out there)
    const meadAt = (p, Lx) => (MEADOW - 160) * p - Lx + 160;
    const tex = (s, seed) => { Scenic.bark(s, M.bark, { moss: M.moss, seed, lichen: M.lichen[1] }); Scenic.hangMoss(s, M.mossH, { from: [M.leaf, M.leafD], n: Math.round(s.w / 9), len: 18, seed }); return s; };
    // misty mountains with far waterfalls and a veil of cloud at their feet
    {
      const w = 800, h = 110, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.far, base: h, amp: 90, seed: 5, freq: 0.006, peaks: [[160, 140, 1], [520, 200, 0.85]], snow: null });
      for (const [fx, fy] of [[330, 30], [596, 44]]) for (let y = fy; y < h; y++) for (let x = fx; x < fx + (fx === 330 ? 8 : 4); x++) if (s.get(x, y)) s.set(x + Math.round(Math.sin(y * 0.15) * 0.6), y, M.mist[(y + x) % 3 === 0 ? 0 : 1]);
      for (let y = h - 26; y < h; y++) for (let x = 0; x < w; x++) if (s.get(x, y) && bayer4(x, y) < (y - (h - 26)) / 30 * (0.6 + 0.4 * vnoise(x * 0.03, y * 0.1, 3))) s.set(x, y, M.mist[1]);
      A.layer(s, 0.03, { haze: 0.55, base: h - 1, x: -60 }).skirt = M.far[2];
    }
    // far canopy (rolling tree line) with mist pooling in the valleys
    {
      const w = 1250, h = 90, s = new ISpr(w, h);
      Paint.treeline(s, { ramp: M.hill, base: h * 0.55, size: 12, seed: 8, jag: 6 });
      // a few emergent giants poking above the canopy
      for (let x = 50; x < w; x += 110 + r() * 160) { const tr = Paint.tree(M, 46 + r() * 20, Math.floor(x * 3), { trunkRamp: M.hill, leafRamp: M.hill, crownW: 34, crownH: 22, trunkW: 2 }); s.paste(tr, Math.round(x - tr.ax), Math.round(h * 0.62 - tr.ay)); }
      for (let y = h - 34; y < h; y++) for (let x = 0; x < w; x++) if (s.get(x, y) && bayer4(x, y) < (y - (h - 34)) / 50 * (0.5 + vnoise(x * 0.02, 1, 8))) s.set(x, y, M.mist[0]);
      A.layer(s, 0.14, { haze: 0.45, base: h - 1, x: 0 }).skirt = M.hill[1];
    }
    // the Weather Institute on its hill, with its weather vane and dish
    {
      const w = 1750, h = 170, s = new ISpr(w, h);
      Paint.treeline(s, { ramp: M.hill, base: h - 30, size: 16, seed: 12, jag: 8 });
      for (let x = 30; x < w; x += 70 + r() * 120) { if (Math.abs(x - 690) < 170) continue; const tr = Paint.tree(M, 60 + r() * 30, Math.floor(x * 7), { trunkRamp: M.bark, leafRamp: M.hill, crownW: 50, crownH: 34, trunkW: 3 }); s.paste(tr, Math.round(x - tr.ax), Math.round(h - 26 - r() * 14 - tr.ay)); }
      // hill clearing with a winding path up to the door
      for (let x = 560; x < 820; x++) { const u = (x - 690) / 130; const top = h - 34 - Math.max(0, 1 - u * u) * 26; for (let y = Math.round(top); y < h; y++) s.set(x, y, Props.pick(M.grass, 0.6 - (y - top) / 40 + (hash(x, y, 4) > 0.97 ? 0.3 : 0), x, y)); }
      for (let y = h - 30; y < h; y++) { const px = 690 + Math.sin(y * 0.18) * 10 + (y - (h - 30)) * 1.2; for (let q = -1; q <= 1 + (y - (h - 30)) / 10; q++) s.set(px + q, y, M.litter[q === -1 ? 2 : 3]); }
      const ins = Props2.institute(M, 3);
      s.paste(ins, 690 - ins.ax, h - 60 - ins.ay + 4);
      // radar dish and weather vane on the roof
      const rx = 690 + 18, ry = h - 60 - ins.ay + 2;
      for (let j = 0; j < 7; j++) s.set(rx, ry - j, M.metal[1]);
      for (let a = -1.2; a <= 1.2; a += 0.15) s.set(rx + Math.round(Math.cos(a) * 5) - 3, ry - 8 + Math.round(Math.sin(a) * 5), M.metal[3]);
      for (let j = 0; j < 9; j++) s.set(690 - 16, ry - j, M.metal[1]);
      for (let q = -3; q <= 3; q++) s.set(690 - 16 + q, ry - 8, M.metal[2]);
      A.instGlow = true;
      A.layer(s, 0.24, { haze: 0.34, base: h - 1, x: 60 }).skirt = M.hill[1];
    }
    // mid forest: tall trunks with furrowed bark and hanging moss, a waterfall feeding the river (thins out at the meadow)
    {
      const w = 2400, h = 360, s = new ISpr(w, h), end = meadAt(0.36, 40);
      for (let x = 30; x < w; x += x < end - 60 ? 90 + r() * 120 : 300 + r() * 260) {
        const tr = tex(Paint.tree(M, 180 + r() * 60, Math.floor(x), { trunkRamp: M.bark, leafRamp: M.leafD, crownW: 180, crownH: 110, trunkW: 9, vines: r() < 0.5 }), Math.floor(x));
        s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 6);
      }
      for (let x = 0; x < w; x++) for (let y = h - 8; y < h; y++) s.set(x, y, M.leafD[1]);
      const fall = Props2.waterfall(M, 26, 150, 4);
      const fx = Math.round(1360 * 0.52 + 40);
      s.paste(fall, fx - 13, h - 150);
      // mist rising off the falls' plunge pool
      for (let y = h - 40; y < h; y++) for (let x = fx - 40; x < fx + 40; x++) { const q = Math.hypot((x - fx) / 40, (y - h + 4) / 36); if (q < 1 && bayer4(x, y) < (1 - q) * 0.9) s.set(x, y, M.mist[q < 0.5 ? 1 : 0]); }
      A.layer(s, 0.36, { haze: 0.3, base: h - 1, x: 40 }).skirt = M.leafD[1];
    }
    // near forest wall: huge buttressed trunks, vines, moss, ferns and glowing fungus (opens up at the meadow)
    {
      const w = 3150, h = 420, s = new ISpr(w, h), end = meadAt(0.5, 0);
      for (let x = 60; x < w; x += x < end - 80 ? 140 + r() * 160 : 420 + r() * 300) {
        const tr = tex(Paint.tree(M, 260 + r() * 60, Math.floor(x * 5), { trunkRamp: M.bark, leafRamp: M.leaf, roots: true, vines: true, crownW: 240, crownH: 140, trunkW: 14 }), Math.floor(x * 5));
        s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 2);
        // shelf fungus stepping up the trunk
        if (r() < 0.6) for (let k = 0; k < 3; k++) { const fy = h - 30 - k * 9 - r() * 20, fx2 = Math.round(x + (k % 2 ? 6 : -9)); for (let q = 0; q < 6; q++) { s.set(fx2 + q, Math.round(fy), M.stem[q < 2 ? 3 : 2]); if (q > 0 && q < 5) s.set(fx2 + q, Math.round(fy) + 1, M.stem[0]); } }
      }
      for (let x = 0; x < w; x += 12 + r() * 20) { const f = Paint.fern(M, 14 + r() * 8, Math.floor(x * 7), { ramp: x < end ? M.leafD : M.leaf }); s.paste(f, Math.round(x - f.ax), h - f.ay - 1); }
      const L = A.layer(s, 0.5, { haze: 0.24, base: h - 1, x: 0 });
      L.skirt = M.leafD[0];
    }
    // ---- 2.5D depth: the forest floor recedes in perspective from the tree wall to the lane; the river
    // and the pond reach back into the distance; trees, ferns, mushrooms and rocks stand at many depths ----
    {
      A.depthP0 = 0.5; A.depthHaze = 0.24;
      const riverC = (p) => 1360 + (1 - p) / 0.5 * 230 + Math.sin((1 - p) * 9) * 40 * (1 - p);
      const RHW = 270, PC = 3105, PHW = 262;
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
          if (n2 > (wx > MEADOW ? 0.78 : 0.95)) return [M.flower[1], M.flowerY[1], M.lotus[1], M.berry[2]][Math.floor(wx * 0.7 + wz) & 3];
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
      place((p, wx, i) => wx < MEADOW - 90 && A.scatterAt(Scenic.hangMoss(Scenic.bark(Paint.tree(M, Math.round((220 + r2() * 90) * p), 2000 + i, { trunkRamp: M.bark, leafRamp: r2() < 0.5 ? M.leaf : M.leafD, roots: true, vines: r2() < 0.6, crownW: Math.round((180 + r2() * 60) * p), crownH: Math.round((110 + r2() * 40) * p), trunkW: Math.max(3, Math.round(12 * p)) }), M.bark, { moss: M.moss, seed: 2000 + i, mossK: 0.25, minRun: 3 }), M.mossH, { from: [M.leaf, M.leafD], len: 16 * p, seed: i }), wx, p), 22, 0.53, 0.9, 40);
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
    A.glows.push({ x: 1360, y: 360, r: 0, c: 0, a: 0 });
    // ---- hotspots ----
    A.addHot({ x0: 2068, x1: 2092, y0: gy(2080) - 30, y1: gy(2080), x: 2080, reach: 36, tap() { ForestAI.lever(A); }, onScan() { FX.sparkles(2080, gy(2080) - 20, 6, 14, 0xffffffff, hex('#7affc0')); HUD.toast('Scan: the Institute\'s weather lever. It cycles clear, rain, sun and snow!', { life: 3 }); return true; } });
    A.addHot({ x0: 680, x1: 760, y0: gy(720) - 150, y1: gy(720) - 50, x: 720, reach: 60, tap() { ForestAI.shakeTree(A); } });
    for (const bx of [330, 1900, 3570]) A.addHot({ x0: bx - 14, x1: bx + 14, y0: gy(bx) - 16, y1: gy(bx), x: bx, reach: 34, tap() { ForestAI.bush(A, bx); } });
    A.addHot({ x0: 1310, x1: 1410, y0: RIVER.level - 4, y1: RIVER.level + 50, x: 1360, reach: 120, remote: false, stand: 552, tap() { ForestAI.pool(A); }, onScan() { if (!Save.found('forest.feebas')) { FX.add({ type: 'ripple', x: 1365, y: RIVER.level + 1, r0: 2, r1: 16, flat: 0.3, life: 1.4, c: 0xffffffff, layer: 2 }); HUD.toast('Scan: odd ripples in the quiet pool under the bridge...', { life: 3 }); return true; } return false; } });
    // toys: a vine to swing across the river, a giant mushroom to bounce on
    Toys.vine(A, M, RIVER.x0 - 52, RIVER.x1 + 42, 560);
    { const mu = put(Props2.mushroom(M, 13, 77, 0), 2778, -2, { sink: 1 }); const ms = mu.frames[0]; Toys.springy(A, 2778, mu.y - ms.ay + 6, { prop: mu, secret: 'toy.mushroom', w: 22 }); }
    A.addHot({ x0: 3552, x1: 3588, y0: gy(3570) - 24, y1: gy(3570), x: 3570, reach: 40, tap() { HUD.toast('A mossy stump... like a little stage.', { life: 2.4 }); } });
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
    const hr = Stage.S.hour, rain = Weather.W.rain, H = fb.h;
    // ground mist: thick at dawn, wisps after rain and at dusk, a cool veil at night
    const mk = { dawn: 0.5, noon: 0.08, afternoon: 0.1, dusk: 0.22, night: 0.26 }[hr] + rain * 0.25;
    Scenic.mist(fb, cx, cy, t, { k: mk, c: hex({ dawn: '#f2e2ea', noon: '#e4f2ea', afternoon: '#f4ead4', dusk: '#f0b8a8', night: '#6a86b0' }[hr]), ground: World.groundAt, up: hr === 'dawn' ? 56 : 40, down: 12, speed: 5 });
    // light shafts slanting through the canopy, dust motes drifting in them; pale moonbeams at night
    if (rain < 0.3) {
      const k0 = (1 - rain * 3) * (S.weather === 'sun' ? 1.8 : 1);
      if (hr === 'night') Scenic.shafts(fb, cx, cy, t, { c: hex('#9ab8ff'), k: 0.07 * k0, slant: 0.3, par: 0.6, freq: 0.017, th: 0.62, motes: 18, moteK: 0.6, bottom: H * 0.9 });
      else if (hr !== 'dusk') Scenic.shafts(fb, cx, cy, t, { c: hex({ dawn: '#ffd0c0', noon: '#fff4c8', afternoon: '#ffe0a0' }[hr]), k: (hr === 'dawn' ? 0.15 : 0.11) * k0, slant: hr === 'afternoon' ? -0.45 : 0.45, par: 0.6, freq: 0.021, th: 0.55, motes: 46 });
      else Scenic.shafts(fb, cx, cy, t, { c: hex('#ffb070'), k: 0.09 * k0, slant: -0.75, par: 0.6, freq: 0.016, th: 0.6, motes: 30 });
    }
    ForestAI.post(A, fb, cx, cy, t);
  };
  def.spawn = (A, G) => { ForestAI.spawn(A, G, S); if (typeof GroveAI !== 'undefined') GroveAI.spawn(A, G); };
  def.update = (A, dt, t, G) => { ForestAI.update(A, dt, t, G, S); if (typeof GroveAI !== 'undefined') GroveAI.update(A, dt, t, G); };
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
    // the meadow: drifting petals and busy bees by day; in the woods: moths and glowing spores by night
    const cx = Game.cam.x + Game.VW / 2, mead = cx > MEADOW - 120, P = [['#ff9ac0', '#ffd0e0'], ['#fff4a0', '#ffd040'], ['#c8b0ff', '#8a6ad8'], ['#ffffff', '#f0e8ff']][Math.floor(Math.random() * 4)];
    if (mead && hour !== 'night') {
      out.push({ kind: 'petal', rate: 2.2, c: hex(P[0]), c2: hex(P[1]), life: 9, drift: 3, vy: 6, sway: 16, bob: 8, y: (x) => World.groundAt(x) - 40 - Math.random() * 110 });
      out.push({ kind: 'moth', rate: 1.2, c: hex('#ffd040'), life: 6, sway: 26, bob: 10, vy: 0, wob: 6, y: (x) => World.groundAt(x) - 8 - Math.random() * 26 });
      out.push({ kind: 'butterfly', rate: 0.8, c: hex(P[0]), c2: hex('#ffffff'), life: 12, sway: 18, bob: 10, y: (x) => World.groundAt(x) - 14 - Math.random() * 50 });
    }
    if (!mead && (hour === 'night' || hour === 'dusk')) {
      out.push({ kind: 'moth', rate: 0.6, c: hex('#e8e0c8'), life: 7, sway: 20, bob: 8, wob: 4, y: (x) => World.groundAt(x) - 30 - Math.random() * 60 });
      out.push({ kind: 'spore', rate: 1.6, c: hex('#5af0c8'), life: 9, sway: 6, bob: 3, vy: -3, y: (x) => World.groundAt(x) - 4 - Math.random() * 30 });
    }
    return out;
  };
  def.onScan = (A) => ForestAI.onScan(A);
  def.onSong = (x) => ForestAI.song(x);
  def.onWater = (tx, ty) => ForestAI.water(tx, ty);
  def.photoBonus = (A, crop, subs, main) => ForestAI.photoBonus(A, crop, subs, main);
  def.S = S;
  return def;
})();
