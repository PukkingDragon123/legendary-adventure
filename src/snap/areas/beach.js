/* ------------------------------------------------------------------
   Coral Cove — Route 109 seashore, reimagined. Grassy dunes and a
   palm beach, one long wooden dock out over the water (walkable, with
   ladders), moored boats, a coral reef, a dark trench and a lighthouse
   islet. Layered backdrop: Slateport skyline, sailboats, a sandbar
   island, dunes with the Seashore House.
------------------------------------------------------------------- */
Areas.beach = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, fbm, mix, hex } = U;
  const pick2 = (r, a) => a[Math.floor(r() * a.length)];
  const SEA = 520;
  const DOCK = { x0: 870, x1: 1880, y: 496 };
  const def = {
    id: 'beach', name: 'Coral Cove', sub: 'Route 109 Seashore', music: 'crossing', seed: 11,
    W: 12600, H: 1300, sea: SEA, refY: SEA, h0: 96, cy0: 290, ph: 0.06, skyH: 360, sunH: 150, band: 12, waves: 1.6,
    camY: [-40, 1300],
    start: 300,
    ground: [[0, 452], [90, 452], [170, 462], [240, 478], [320, 488], [460, 492], [640, 494], [800, 497], [900, 502], [1000, 509], [1100, 520], [1200, 535], [1300, 555], [1400, 580], [1500, 608], [1600, 638], [1700, 666], [1800, 690], [1900, 708], [2000, 714], [2150, 724], [2300, 740], [2450, 764], [2600, 800], [2750, 848], [2880, 900], [2980, 935], [3060, 940], [3160, 928], [3280, 896], [3400, 850], [3520, 792], [3640, 726], [3760, 656], [3860, 594], [3940, 544], [4000, 506], [4060, 486], [4200, 480], [4260, 470], [4320, 456], [4400, 444], [4520, 440], [4640, 441], [4680, 450], [4710, 464], [4750, 470], [4790, 464], [4820, 450], [4860, 441], [4960, 440], [4990, 452], [5020, 476], [5080, 482], [5140, 478], [5170, 456], [5200, 442], [5360, 436], [5500, 430], [5600, 432], [5700, 430], [5850, 428], [6100, 430], [6400, 432], [6700, 430], [7000, 428], [7300, 430], [7600, 432], [7900, 430], [8150, 434], [8280, 448], [8360, 476], [8440, 506], [8520, 532], [8660, 570], [8840, 622], [9000, 684], [9150, 736], [9300, 764], [9500, 772], [9700, 792], [9900, 780], [10100, 800], [10300, 788], [10500, 806], [10700, 798], [10850, 830], [11000, 884], [11200, 952], [11420, 1020], [11640, 1080], [11860, 1130], [12060, 1165], [12300, 1185], [12600, 1190]],
    water: [{ x0: 0, x1: 4020, level: SEA, kind: 'sea' }, { x0: 8400, x1: 12600, level: SEA, kind: 'sea' }, { x0: 4985, x1: 5180, level: 456, kind: 'pool' }],
    plats: [{ x0: DOCK.x0, x1: DOCK.x1, y: DOCK.y, kind: 'dock', ladders: [1400, 1872] }],
    mats: {
      ink: ['#161828', '#221e36'],
      sand: ['#b78452', '#cc9b62', '#dfb476', '#ebc78e', '#f5dcab', '#fff0d2'],
      sandW: ['#86684a', '#9c7a56', '#b28c62', '#c49e74'],
      face: ['#7a5433', '#946840', '#ab7c4c', '#c0915b', '#d3a66e', '#e2b981'],
      rock: ['#2f3b4e', '#46566c', '#617690', '#8499b0', '#b3c3d2', '#dce6ee'],
      rockU: ['#1c2638', '#2a3850', '#3c4e6a', '#526a88'],
      moss: ['#2e5a32', '#4a8038', '#78a848'],
      grass: ['#1f5a2e', '#2f7e38', '#4ea044', '#80c45a', '#b8e27c'],
      palmLeaf: ['#10442a', '#1c6a34', '#33923e', '#62bc52', '#a2dc74'],
      palmTrunk: ['#553620', '#744c2c', '#94663c', '#b6844f', '#d6a86c'],
      nut: ['#46301c', '#6e4c2c', '#9a7046'],
      wood: ['#3a2414', '#553820', '#74502e', '#946a40', '#b48552', '#d4a46c'],
      woodW: ['#262420', '#38322a', '#4e4434'],
      rope: ['#7a5a32', '#b08c56', '#dcc088'],
      metal: ['#22283a', '#434c62', '#76849a', '#b6c2d2'],
      lamp: { c: ['#ffd878', '#fff4c8'], emit: true },
      win: { c: ['#ffcf6a', '#fff0b8'], emit: true },
      algae: ['#2a5a3a', '#3e7a44'],
      seabed: ['#5c6668', '#84886e', '#ada57c', '#cdc191', '#e4d8a8'],
      bedFace: ['#4a4c52', '#5e6264', '#76786e', '#8e8e7a', '#a8a488'],
      coralP: ['#7a2446', '#b44466', '#e27086', '#ffa2a6', '#ffd2c8'],
      coralP2: ['#8a3450', '#c05a78', '#f08aa4', '#ffc2d0'],
      coralO: ['#96401a', '#cc6a2a', '#ee964a', '#ffc676'],
      coralY: ['#7e6c1a', '#b89c30', '#e2cc5a', '#fcec92'],
      coralV: ['#43286e', '#63469c', '#9376d0', '#c4a6f4'],
      coralT: ['#16504e', '#26807a', '#46b6a0', '#8ae2cc'],
      kelp: ['#173a24', '#265a2e', '#3e7c34', '#6aa84a'],
      anem: ['#5a1650', '#94337e', '#c862aa', '#eea0da'],
      sponge: ['#8a6a1a', '#b8902a', '#e0bc4a'],
      reefInk: ['#1a1830'],
      shell: ['#b8766a', '#dca08e', '#f4cebe', '#fff0e8'],
      shellB: ['#62709e', '#94a4cc', '#ccd8f2', '#ffffff'],
      star: ['#a8342a', '#d8543a', '#fa8458', '#ffbe8e'],
      pebble: ['#5e5e6c', '#83838f', '#aaaab4', '#d4d4dc'],
      drift: ['#6a5a4a', '#8a7a64', '#aa9a80', '#ccbca0'],
      umbA: ['#1e4ea0', '#2e6ed0', '#4a94f0', '#8ac0ff'],
      umbB: ['#c8a018', '#e8c030', '#ffe060', '#fff4a8'],
      tRed: ['#9a1a2a', '#d4323c', '#ff6060'],
      tWhite: ['#c4c8d6', '#e6eaf4', '#ffffff'],
      boatR: ['#5a1818', '#8a2626', '#b8383a', '#dc5c56'],
      boatB: ['#16264e', '#243e7a', '#3462aa', '#5288d0'],
      boatW: ['#9aa2b0', '#c8d0da', '#f2f6fa'],
      orb: ['#b88ab8', '#e8c8e8', '#ffffff'],
      gold: ['#a87a18', '#e0b030', '#ffe890'],
      lhW: ['#9aa2b4', '#c8d0de', '#f2f6fe'],
      lhR: ['#7e1a28', '#b82a3a', '#ec4a58'],
      lhLight: { c: ['#ffe890', '#fffce0'], emit: true },
      city: ['#50709a', '#6484aa', '#82a2c4', '#aac6e0'],
      hill: ['#264e36', '#346a42', '#4e8a50', '#7aae66'],
      sail: ['#d0d8e4', '#f4f8ff'],
      flowerP: ['#c2407a', '#ff78ae', '#ffd2e6'],
      flowerY: ['#c8961a', '#ffd648', '#fff6b0'],
      roof: ['#6e2a26', '#9a3a30', '#c4543e', '#e2785a'],
      wall: ['#b8a890', '#d8ccb4', '#f2ead8'],
      glowP: { c: ['#6af0ff', '#d0ffff'], emit: true },
      // distant city: cool concrete, warm stucco, blue glass, unlit windows, far forest
      bldA: { c: ['#5a6680', '#78869e', '#9aa8bc', '#c0cad8', '#e4eaf0'], noSeason: true },
      bldB: { c: ['#8c6456', '#aa8270', '#c8a28a', '#e4c6aa'], noSeason: true },
      bldC: { c: ['#284462', '#3a5e84', '#5684aa', '#8ab4d4'], noSeason: true },
      winD: { c: ['#1c2638', '#34435c'], noSeason: true },
      treeF: ['#1a3a30', '#285240', '#3a6a4a', '#588a5a'],
      // deep sea rock, abyssal sediment, bioluminescence
      bedDeep: ['#141a2c', '#1e2638', '#2a3446', '#3a4658', '#4e5a68'],
      glowB: { c: ['#3ad8ff', '#b8ffff'], emit: true },
      glowV: { c: ['#b070ff', '#f0d0ff'], emit: true },
    },
  };

  /* ---------------- a hand-painted distant town (indexed sprite painter) ----------------
     s: the layer sprite, lit: a matching sprite of window lights shown at dusk/night.
     o: { x0, x1, ground(x) → base y, maxH, seed, rows, harbour: [x0, x1], trees } */
  const paintTown = (s, lit, M, o) => {
    const r = rng(o.seed || 1), P = Props.pick;
    const span = o.x1 - o.x0;
    const env = (x) => { const u = (x - o.x0) / span; return (o.env ? o.env(u) : Math.pow(Math.max(0, Math.sin(u * Math.PI)), 0.6)); };
    const put = (x, y, v) => s.set(x, y, v);
    const light = (x, y, k) => { if (lit && hash(x, y, o.seed || 1) < k) lit.set(x, y, M.win[hash(x, y, 7) > 0.7 ? 1 : 0]); };
    const building = (x, by, w, h, kind, ramp) => {
      const n = ramp.length;
      if (kind === 'tower') { // glass tower: mullions, a stepped crown and an antenna
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const edge = xx === 0 ? 1 : xx >= w - 2 ? -1 : 0;
          let c = M.bldC[edge > 0 ? 3 : edge < 0 ? 0 : (xx % 3 === 0 ? 1 : 2)];
          if (yy % 3 === 0 && xx > 0 && xx < w - 1) c = M.bldC[1];
          if (hash(x + xx, yy, 3) > 0.93 && yy > 3) c = M.bldC[3];
          put(x + xx, by - yy, c);
          if (xx % 3 && yy % 3 && xx < w - 1 && yy > 2) light(x + xx, by - yy, 0.35);
        }
        const cw = Math.max(2, w - 4); for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < cw; xx++) put(x + 2 + xx, by - h - yy, M.bldA[xx === 0 ? 3 : 1]);
        for (let yy = 0; yy < 5 + (h >> 3); yy++) put(x + (w >> 1), by - h - 3 - yy, M.bldA[0]);
        if (lit) lit.set(x + (w >> 1), by - h - 8 - (h >> 3), M.lhR[2]);
        return;
      }
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        let t = xx === 0 ? 0.9 : xx >= w - 2 ? 0.28 : 0.62 + (hash(x + xx, yy >> 1, 5) - 0.5) * 0.12;
        if (yy === h - 1) t = 0.95; else if (yy === h - 2) t -= 0.12;
        let c = P(ramp, t, x + xx, yy);
        const wx = xx % 3 === 1, wy = yy % 3 === 1 && yy < h - 2;
        if (w > 5 && xx > 0 && xx < w - 2 && wx && wy && yy > 1) { c = M.winD[xx < w * 0.4 ? 1 : 0]; light(x + xx, by - yy, 0.42); }
        if (kind === 'shop' && yy < 3 && xx > 0 && xx < w - 1) c = (xx >> 1) % 2 ? M.tWhite[1] : (x % 3 ? M.tRed[1] : M.umbA[1]);
        put(x + xx, by - yy, c);
      }
      const top = by - h;
      if (kind === 'house') { // pitched tiled roof with a ridge line
        const rp = [M.roof, M.boatB, M.roof, M.coralO][(x >> 3) % 4];
        const rh = Math.max(3, (w >> 1) - 1);
        for (let yy = 0; yy < rh; yy++) for (let xx = rh - 2 - yy; xx <= w + yy - rh + 1; xx++) put(x + xx, top - rh + yy + 1, yy === 0 ? rp[3] : xx < w / 2 ? rp[2] : rp[1]);
        if (r() < 0.4) { put(x + w - 3, top - rh, M.wall[0]); put(x + w - 3, top - rh - 1, M.wall[0]); }
      } else if (kind === 'dome') { // Contest-Hall dome with a flag
        const R = w / 2;
        for (let yy = 0; yy <= R * 0.8; yy++) for (let xx = 0; xx < w; xx++) { const dx = (xx + 0.5 - R) / R, dy = yy / (R * 0.8); if (dx * dx + dy * dy <= 1) put(x + xx, top - yy, M.bldC[dx < -0.3 ? 3 : dx < 0.3 ? 2 : 1]); }
        const fy = top - Math.round(R * 0.8); for (let yy = 1; yy < 7; yy++) put(x + Math.round(R), fy - yy, M.bldA[0]);
        for (let xx = 1; xx < 5; xx++) { put(x + Math.round(R) + xx, fy - 6, M.tRed[2]); put(x + Math.round(R) + xx, fy - 5, M.tRed[1]); }
      } else { // flat roof: parapet, water tanks, vents
        for (let xx = -1; xx <= w; xx++) put(x + xx, top, ramp[n - 1]);
        if (w > 8 && r() < 0.55) { const tx = x + 2 + Math.floor(r() * (w - 6)); for (let yy = 1; yy < 4; yy++) for (let xx = 0; xx < 3; xx++) put(tx + xx, top - yy, M.wood[yy === 3 ? 4 : 2]); put(tx, top - 4, M.wood[1]); put(tx + 2, top - 4, M.wood[1]); }
        if (r() < 0.5) { const vx = x + 1 + Math.floor(r() * (w - 2)); put(vx, top - 1, M.metal[2]); put(vx + 1, top - 1, M.metal[1]); }
      }
    };
    // two rows of buildings: the back row taller (downtown), the front row low houses and shops
    for (const row of [0, 1]) {
      for (let x = o.x0; x < o.x1;) {
        const e = env(x);
        const bw = row ? 6 + Math.floor(r() * 8) : 7 + Math.floor(r() * 12);
        if (e < 0.05) { x += bw; continue; }
        const by = Math.round(o.ground(x + bw / 2)) - (row ? 0 : 4);
        let kind = 'house', ramp = pick2(r, [M.wall, M.bldB, M.bldA]);
        let bh = row ? 5 + Math.floor(r() * 6) : Math.round(6 + r() * 6 + e * o.maxH * (0.35 + r() * 0.65));
        if (!row) { const q = r(); kind = q < 0.25 * e ? 'tower' : q < 0.8 ? 'block' : 'house'; if (bh > o.maxH * 0.55 && kind === 'house') kind = 'block'; ramp = pick2(r, [M.bldA, M.bldA, M.bldB, M.wall]); }
        else if (r() < 0.25) kind = 'shop';
        if (o.dome && !row && Math.abs(x - o.dome) < 10) { kind = 'dome'; bh = 10; }
        building(x, by, bw, bh, kind, ramp);
        x += bw + (r() < 0.25 ? 2 + Math.floor(r() * 5) : 0);
        // street trees in the front row
        if (row && o.trees !== false && r() < 0.45) { const tx = x - 1, ty = Math.round(o.ground(tx)); const R = 2 + Math.floor(r() * 3); for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) if (xx * xx + yy * yy <= R * R + 1) put(tx + xx, ty - R - 1 + yy, M.treeF[Math.max(0, Math.min(3, 2 - yy + (xx < 0 ? 1 : -1) + (hash(tx + xx, yy, 2) > 0.6 ? 1 : 0)))]); put(tx, ty, M.wood[1]); }
      }
    }
    // the harbour: quay wall, gantry cranes and a container ship
    if (o.harbour) {
      const [h0, h1] = o.harbour, qy = Math.round(o.ground(h0));
      for (let x = h0; x < h1; x++) { put(x, qy + 1, M.bldA[3]); put(x, qy + 2, M.bldA[1]); put(x, qy + 3, M.bldA[0]); }
      // ship: dark hull, white bridge, coloured containers
      const sx = h0 + Math.round((h1 - h0) * 0.3), sl = Math.min(70, Math.round((h1 - h0) * 0.4));
      for (let yy = 0; yy < 5; yy++) for (let xx = yy; xx < sl - (yy >> 1); xx++) put(sx + xx, qy + 2 - yy, yy === 4 ? M.tRed[1] : M.boatB[yy < 2 ? 0 : 1]);
      const CC = [M.tRed, M.umbA, M.coralO, M.grass, M.umbB, M.boatB];
      for (let cx = sx + 6; cx < sx + sl - 16; cx += 4) { const st = 1 + Math.floor(r() * 3), c = CC[Math.floor(r() * CC.length)]; for (let k = 0; k < st; k++) for (let xx = 0; xx < 4; xx++) for (let yy = 0; yy < 2; yy++) put(cx + xx, qy - 3 - k * 2 - yy, xx === 3 ? c[0] : c[yy ? 1 : 2]); }
      for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 7; xx++) { put(sx + sl - 14 + xx, qy - 3 - yy, yy % 3 === 1 && xx % 2 ? M.winD[0] : M.tWhite[xx < 2 ? 2 : 1]); if (yy % 3 === 1 && xx % 2) light(sx + sl - 14 + xx, qy - 3 - yy, 0.8); }
      for (let yy = 0; yy < 4; yy++) put(sx + sl - 11, qy - 12 - yy, M.tRed[1]);
      // gantry cranes: two legs, a cross beam, a long boom over the water
      for (let cx = h0 + 8; cx < h1 - 10; cx += 54 + Math.floor(r() * 20)) {
        const ch = 26 + Math.floor(r() * 8), cr = cx % 2 ? M.tRed : M.umbB;
        for (let yy = 0; yy < ch; yy++) { put(cx, qy - yy, cr[1]); put(cx + 7, qy - yy, cr[0]); if (yy % 6 === 3) for (let xx = 1; xx < 7; xx++) put(cx + xx, qy - yy, cr[0]); }
        for (let xx = -14; xx < 20; xx++) { put(cx + xx, qy - ch, cr[2]); put(cx + xx, qy - ch + 1, cr[0]); }
        for (let yy = 1; yy < 6; yy++) { put(cx + 3, qy - ch - yy, cr[1]); put(cx + 4, qy - ch - yy, cr[0]); }
        for (let k = 0; k < 10; k++) { put(cx + 3 + Math.round(k * 1.6), qy - ch - 5 + Math.round(k * 0.5), M.metal[1]); put(cx + 3 - Math.round(k * 1.4), qy - ch - 5 + Math.round(k * 0.5), M.metal[1]); }
        for (let yy = 2; yy < 8; yy++) put(cx - 10, qy - ch + yy, M.metal[0]);
        if (lit) lit.set(cx + 3, qy - ch - 6, M.lhR[2]);
      }
    }
  };
  def.paintTown = paintTown;

  /* ---------------- colours of the sea ---------------- */
  const SEAC = {
    dawn: { far: '#6f6aa8', near: '#86a4cc', glint: '#ffe8d0', top: '#7aa6d0', mid: '#44609e', deep: '#1e2856', abyss: '#070a1c', foam: '#fff4e8', ray: '#ffe0d0' },
    noon: { far: '#1f5eb2', near: '#3ab8de', glint: '#ffffff', top: '#3cb4dc', mid: '#1e74ba', deep: '#0d3a70', abyss: '#040b1e', foam: '#ffffff', ray: '#d8fbff' },
    afternoon: { far: '#2a62a8', near: '#52acc8', glint: '#fff4d0', top: '#4aa6c6', mid: '#236ca8', deep: '#11386a', abyss: '#050a1c', foam: '#fffdf4', ray: '#fff0c4' },
    dusk: { far: '#4a3a78', near: '#7a5a8e', glint: '#ffc070', top: '#5a5288', mid: '#342e6c', deep: '#1a1846', abyss: '#07061a', foam: '#ffe0c8', ray: '#ffb888' },
    night: { far: '#0c183c', near: '#193660', glint: '#cfe0ff', top: '#183660', mid: '#0e2446', deep: '#071430', abyss: '#02050e', foam: '#bff8f0', ray: '#8fb0e8' },
  };
  const SIN = new Float32Array(4096); for (let i = 0; i < 4096; i++) SIN[i] = Math.sin(i / 4096 * Math.PI * 2);
  const SINK = 4096 / (Math.PI * 2);
  const SC = {}; for (const k in SEAC) { SC[k] = {}; for (const j in SEAC[k]) SC[k][j] = hex(SEAC[k][j]); }
  def.waterCols = (hour, w) => {
    const c = SC[hour];
    return { top: c.top, mid: c.mid, deep: c.deep, foam: c.foam, hi: mix(c.foam, c.top, 0.25), ray: w && w.rain > 0.5 ? null : c.ray, maxD: 620, abyss: mix(c.deep, c.abyss, 0.5), bedFade: 320, bedMax: 0.8 };
  };

  /* ---------------- build ---------------- */
  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const shoreX = World.shoreX;
    const gy = (x) => World.groundAt(x);
    // ---- terrain ----
    Terrain.paint(A, {
      bb: 7, bf: 5,
      strip(x, y, u, e) {
        const g = gy(x), wv = clamp((g - SEA - 2) / 60, 0, 1), under = wv > 0 && U.bayer4(x, y) < wv;
        const n = e.n2(x, y * 3), n1 = e.n1(x, y);
        if (under) {
          const rip = Math.sin(x * 0.19 + n1 * 5) > 0.55 ? 0.12 : 0;
          let t = 0.62 - u * 0.35 + rip + (n - 0.5) * 0.25;
          if (u < 0.12) t += 0.2;
          if (n1 > 0.72) return e.pickR(M.rockU, t, x, y);
          return e.pickR(M.seabed, t, x, y);
        }
        if (x > 4240 && x < 5620 && !under) { // Fossil Cliffs: dry grass and gritty sand on a rock shelf
          let t = 0.66 - u * 0.4 + (n - 0.5) * 0.35;
          if (u < 0.15) t += 0.18;
          if (n1 > 0.6) return e.pickR(M.grass, t - 0.1, x, y);
          if (e.hash(x, y, 5) > 0.9) return e.pickR(M.rock, 0.6, x, y);
          return e.pickR(M.sand, t - 0.12, x, y);
        }
        if (x < 250) { // grassy dune top
          let t = 0.7 - u * 0.4 + (n - 0.5) * 0.4;
          if (u < 0.15) t += 0.18;
          if (u > 0.7 && e.hash(x, y, 3) > 0.6) return e.pickR(M.sand, 0.6, x, y);
          return e.pickR(M.grass, t, x, y);
        }
        const wet = SEA - g < 14;
        const rip = Math.sin(x * 0.23 + Math.sin(x * 0.013) * 3 + n1 * 4) > 0.6 ? 0.1 : 0;
        let t = 0.68 - u * 0.38 + rip + (n - 0.5) * 0.28;
        if (u < 0.14) t += 0.22;
        if (wet) return e.pickR(M.sandW, t + 0.1, x, y);
        return e.pickR(M.sand, t, x, y);
      },
      face(x, y, dep, e) {
        // sand fades into seabed over the shallows (ordered dither), so the slope reads as one continuous beach
        const g = gy(x), wv = clamp(Math.max((g - SEA - 2) / 60 + dep / 900, (y - SEA - 8) / 40), 0, 1), under = wv > 0 && U.bayer4(x, y) < wv;
        const n1 = e.n1(x, y), n2 = e.n2(x, y);
        if (dep <= 1) return under ? M.bedFace[0] : M.face[0]; // shadow under the lip
        // sediment bands that follow the surface, with soft wavy boundaries
        const band = (dep + n1 * 10 + Math.sin(x * 0.05) * 2) / 13;
        const bi = Math.floor(band), bf = band - bi;
        const edge = bf < 0.12;
        if (under) {
          // deep bedrock: layered strata, boulder clusters and cracks that darken gradually into the deep
          const dd = y - Math.max(SEA, g);
          if (dd > 40) {
            const n3 = e.n1(Math.floor(x * 0.4), Math.floor(y * 0.4)), bk = clamp((dd - 40) / 260, 0, 1);
            const strata = Math.sin((y + n1 * 26 + Math.sin(x * 0.011) * 18) * 0.11);
            const boulder = n3 > 0.64, crack = Math.abs(n2 - 0.5) < 0.018;
            let t = 0.6 - bk * 0.55 + strata * 0.2 + (n2 - 0.5) * 0.26 + (boulder ? 0.16 + (n3 - 0.64) * 1.2 : 0) - (crack ? 0.25 : 0);
            if (bk < 0.3 && bayer4(x, y) > bk / 0.3) return e.pickR(M.bedFace, t + 0.12, x, y);
            return e.pickR(boulder ? M.rockU : M.bedDeep, t, x, y);
          }
          let t = 0.72 - Math.min(0.45, dep / 260) - (bi % 3 === 1 ? 0.12 : bi % 3 === 2 ? 0.05 : 0) + (n2 - 0.5) * 0.18;
          if (edge) t -= 0.1;
          return e.pickR(M.bedFace, t, x, y);
        }
        if (x < 250 && dep < 5) return dep < 3 ? M.grass[0] : M.face[1]; // grass roots overhang
        if (x > 4240 && x < 5620) { // layered cliff rock (sandstone over slate)
          const cb = (dep + n1 * 8 + Math.sin(x * 0.03) * 3) / 9, ci = Math.floor(cb);
          if (dep < 3) return dep < 2 ? M.grass[0] : M.face[0];
          const slate = dep > 70 + n2 * 20;
          let t = 0.7 - Math.min(0.35, dep / 300) - (ci % 2 ? 0.12 : 0) + (n2 - 0.5) * 0.16 - (cb - ci < 0.1 ? 0.12 : 0);
          return e.pickR(slate ? M.rock : M.face, t, x, y);
        }
        let t = 0.74 - Math.min(0.4, dep / 240) - (bi % 3 === 1 ? 0.14 : bi % 3 === 2 ? 0.06 : 0) + (n2 - 0.5) * 0.18;
        if (edge) t -= 0.1;
        return e.pickR(M.face, t, x, y);
      },
    });
    // embedded pebbles, shells and a few stones in the sand face / seabed
    for (let i = 0; i < 140; i++) {
      const x = r() * A.W, g = gy(x);
      if (x < 250) continue;
      const dep = 8 + r() * 110, k = r();
      const under = g > SEA;
      const s = k < 0.45 ? Paint.miniSpr(r() < 0.5 ? 'pebble' : 'pebble2', under ? M.bedFace.slice(1).concat([M.seabed[3]]) : M.pebble)
        : k < 0.8 ? Paint.miniSpr(['shell1', 'shell2', 'shell3', 'conch'][Math.floor(r() * 4)], M.shell)
        : Paint.rock(M, 7 + r() * 7, 5 + r() * 4, i, { ramp: under ? M.rockU : M.rock, flat: false, cracks: 0 });
      Terrain.stamp(A, s, x, g + 6 + dep);
    }
    // buried boulders and rock seams under the sea slopes, so the cross-section reads as real ground
    for (let i = 0; i < 320; i++) {
      const x = r() < 0.4 ? 1100 + r() * 2950 : 8420 + r() * 4180, g = gy(x);
      if (g < SEA + 20) continue;
      const dep = 14 + Math.pow(r(), 1.4) * 320;
      Terrain.stamp(A, Paint.rock(M, 10 + r() * 30, 6 + r() * 16, 900 + i, { ramp: dep > 120 ? M.bedDeep.slice(1) : M.rockU, flat: false, cracks: 1 }), x, g + 8 + dep);
    }
    // ---- dock (walkable platform) ----
    const posts = []; for (let x = DOCK.x0 + 14; x <= DOCK.x1; x += 72) posts.push(x);
    posts.push(DOCK.x1 - 2);
    const D = Props.dock(M, { x0: DOCK.x0, x1: DOCK.x1, deck: DOCK.y, posts, ground: gy, sea: SEA, lamps: [1130, 1660], ladders: [1400, 1872], bollards: [1010, 1520, 1840], crates: [1720, 1736] });
    const dockB = { frames: [D.back], x: 0, y: 0, zd: -3, noSettle: true };
    A.props.push(Object.assign(dockB, { x: 0, y: 0 }));
    D.back.ax = -D.x0; D.back.ay = -D.top; // placed in world coords directly
    A.props.push({ frames: [D.front], x: 0, y: 0, zd: 4, late: true });
    A.dockLamps = D.lamps;
    for (const [lx, ly] of D.lamps) A.glows.push({ x: lx, y: ly, r: 46, c: hex('#ffc860'), a: 0.55, flicker: true });
    // ---- moored boats (bob on the swell; one hides the Lustrous Orb) ----
    A.boats = [];
    const orbBoat = Save.found('orb.taken') ? -1 : Math.floor(r() * 3);
    [[1210, 64, M.boatR], [1560, 58, M.boatB], [1990, 72, M.boatR]].forEach(([bx, len, hull], i) => {
      const s = Props.boat(M, len, { hull, orb: i === orbBoat });
      const p = { frames: [s], x: bx, y: SEA + 3, zd: -2, boat: true, bob: i * 1.7, orb: i === orbBoat };
      A.props.push(p); A.boats.push(p);
    });
    // ---- beach ----
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    const palms = [[165, 128, 0.25], [340, 150, -0.1], [590, 136, 0.3], [775, 118, -0.3], [4000, 120, -0.25]];
    for (const [px, h, lean] of palms) { const f = Paint.palm(M, h, px, { lean }); put(f, px, -4, { windFrames: true, foot: 10, sink: 3 }); }
    A.walreinRock = put(Paint.rock(M, 92, 40, 5, { moss: M.moss, cracks: 3 }), 700, -3, { sink: 6 });
    put(Paint.rock(M, 44, 28, 8, { moss: M.moss }), 505, -2, { sink: 4 });
    const crystalRock = put(Paint.rock(M, 34, 22, 21, {}), 948, -1, { sink: 4 });
    put(Paint.rock(M, 22, 14, 13, {}), 925, 2, { sink: 3 });
    A.umbrella = put(Props.umbrella(M), 425, -3, { sink: 2 });
    put(Props.towel(M), 450, 1, { sink: 1 });
    A.castle = put(Props.sandcastle(M), 560, -1, { sink: 2 });
    put(Props.bucket(M), 586, 2, { sink: 1 });
    put(Props.sign(M), 70, -2, { sink: 2 });
    put(Props.driftwood(M, 40, 3), 840, 2, { sink: 1 });
    put(Paint.bush(M, 30, 16, 4, { ramp: M.grass, dots: M.flowerP }), 60, -4, { sink: 3 });
    put(Paint.bush(M, 24, 12, 9, { ramp: M.grass, dots: M.flowerY }), 215, -4, { sink: 3 });
    // ---- reef ----
    const reefK = ['branch', 'fan', 'brain', 'tube', 'table', 'stag'];
    for (let x = 1080; x < 3880; x += 16 + r() * 36) {
      if (x > 2380 && x < 2440) continue;
      if (x > 2560 && x < 3250) { x += 30; continue; }
      const g = gy(x);
      if (g < SEA + 20) continue;
      const k = reefK[Math.floor(r() * reefK.length)];
      const sz = 14 + r() * 26 * (x > 1300 && x < 2300 ? 1.2 : 0.7);
      put(Props.coral(M, k, sz, Math.floor(x)), x, (r() < 0.35 ? 3 : -3), { sink: 2 });
      if (r() < 0.35) put(Props.anemone(M, 7 + r() * 5, Math.floor(x * 3)), x + 10, -2, { fps: 2.2, phase: r() * 3, sink: 2 });
      if (r() < 0.2) put(Props.sponge(M, 10 + r() * 8, Math.floor(x)), x - 12, -3, { sink: 2 });
    }
    for (let x = 1110; x < 3800; x += 40 + r() * 70) { if (gy(x) < SEA + 30) continue; put(Props.kelp(M, 40 + r() * 70, Math.floor(x)), x, -4, { fps: 2.5 + r(), phase: r() * 4, sink: 2 }); }
    for (const [rx, w, h] of [[1480, 60, 34], [2080, 78, 40], [2470, 110, 58], [2600, 70, 50]]) put(Paint.rock(M, w, h, rx, { ramp: M.rockU, moss: M.algae, cracks: 3 }), rx, -3, { sink: 6 });
    A.chest = put(Props.chest(M, Save.found('beach.chest')), 2330, -1, { sink: 2 });
    // ---- the deep: rock formations, boulders, coral outcrops, sea grass and glowing polyps on the drop-offs ----
    {
      const glowPolyp = (seed) => [0, 1].map((f) => {
        const s = new ISpr(9, 12), rr = rng(seed), g = rr() < 0.5 ? M.glowB : M.glowV;
        for (let k = 0; k < 4; k++) { const x = 1 + Math.floor(rr() * 7), L = 3 + Math.floor(rr() * 7); for (let y = 0; y < L; y++) s.set(x, 11 - y, y === L - 1 ? g[(f + k) % 2] : M.coralV[0]); }
        s.ax = 4; s.ay = 11; return s;
      });
      const spots = [[2440, 3300], [8600, 12560]];
      for (const [a0, a1] of spots) for (let x = a0; x < a1; x += 22 + r() * 46) {
        const g = gy(x); if (g < SEA + 60) continue;
        const deep = g > 900, k = r();
        if (k < 0.16) put(Paint.rock(M, 26 + r() * 60, 16 + r() * 40, Math.floor(x), { ramp: M.rockU, moss: r() < 0.5 ? M.algae : null, cracks: 3 }), x, -3 + r() * 5, { sink: 5 });
        else if (k < 0.34 && !deep) put(Props.coral(M, reefK[Math.floor(r() * reefK.length)], 12 + r() * 20, Math.floor(x)), x, r() < 0.4 ? 3 : -3, { sink: 2 });
        else if (k < 0.5) put(Props.kelp(M, 26 + r() * (deep ? 40 : 70), Math.floor(x)), x, -4, { fps: 2 + r(), phase: r() * 4, sink: 2 });
        else if (k < 0.62) put(Props.sponge(M, 8 + r() * 10, Math.floor(x)), x, -2, { sink: 2 });
        else if (k < 0.74 && deep) put(glowPolyp(Math.floor(x)), x, r() < 0.5 ? -2 : 2, { fps: 1.2, phase: r() * 3, sink: 1 });
        else if (k < 0.84) put(Props.anemone(M, 6 + r() * 5, Math.floor(x * 3)), x, -2, { fps: 2.2, phase: r() * 3, sink: 2 });
        else for (let j = 0; j < 3; j++) put(Paint.tuft(M, 6 + r() * 6, 8 + r() * 10, Math.floor(x + j * 7), { ramp: M.kelp }), x + j * 5, -3 + j * 2, { windFrames: true, sink: 1 });
        if (deep && r() < 0.3) A.glows.push({ x, y: g - 6, r: 14, c: hex(r() < 0.5 ? '#3ad8ff' : '#b070ff'), a: 0.35, flicker: true });
      }
      // big rock formations: stacked arches and pinnacles along the shelf edge and the abyss wall
      for (const [rx, w, h] of [[2700, 120, 70], [3080, 90, 90], [8900, 110, 60], [9600, 150, 80], [10300, 130, 110], [10900, 100, 140], [11500, 160, 90], [12200, 120, 120]]) {
        put(Paint.rock(M, w, h, rx, { ramp: M.rockU, moss: M.algae, cracks: 5 }), rx, -4, { sink: 10 });
        put(Paint.rock(M, w * 0.5, h * 0.7, rx + 7, { ramp: M.rockU, cracks: 3 }), rx + w * 0.45, -3, { sink: 6 });
      }
    }
    put(Props.anchor(M), 2520, 2, { sink: 4 });
    // the islet
    A.lighthouse = put(Props.lighthouse(M), 3962, -4, { sink: 4 });
    // the lighthouse keeper's telescope: look far out to sea
    A.addHot({ x0: 3946, x1: 3978, y0: gy(3962) - 40, y1: gy(3962), x: 3962, reach: 44, tap() {
      HUD.scope(4.4); Game.sfx('select', 3962, 0.6);
      Game.cine.pan(2750, SEA - 60, { dur: 1.4, hold: 2.6, zoom: 1.28, frame: 0.5 });
      HUD.toast(Game.hour() === 'night' ? 'From the lighthouse: the beam sweeps the dark waves... something glows deep in the trench.' : 'From the lighthouse: the open sea, a volcano island on the horizon, and Wailord spouting far away!', { life: 3.2 });
    } });
    A.glows.push({ x: 3962, y: gy(3962) - 84, r: 70, c: hex('#fff0a0'), a: 0.7, flicker: false });
    put(Paint.rock(M, 60, 30, 77, { moss: M.moss }), 3930, -2, { sink: 6 });
    // ---- Fossil Cliffs (east): rock shelf, sand pit, tide pool, the ancient altar, dig spots ----
    {
      // ammonite and shell imprints in the cliff face (a hint that fossils lie here)
      const amm = new ISpr(11, 11);
      for (let a = 0; a < 26; a += 0.15) { const rr = 0.35 * a / 2.2; const x = 5 + Math.cos(a) * rr, y = 5 + Math.sin(a) * rr; if (rr < 5.4) amm.set(Math.round(x), Math.round(y), M.rock[a > 18 ? 4 : 3]); }
      for (let i = 0; i < 26; i++) { const x = 4300 + r() * 1280; Terrain.stamp(A, i % 3 ? amm : Paint.miniSpr('shell2', M.rock.slice(2)), x, gy(x) + 18 + r() * 90); }
      for (let x = 4260; x < 5580; x += 30 + r() * 70) {
        if (x > 4980 && x < 5185) continue;
        if (x > 4670 && x < 4830) continue;
        const k = r();
        if (k < 0.35) put(Paint.tuft(M, 10 + r() * 8, 10 + r() * 10, Math.floor(x), { ramp: M.grass }), x, r() < 0.5 ? 3 : -3, { windFrames: true, sink: 0 });
        else if (k < 0.6) put(Paint.rock(M, 16 + r() * 26, 10 + r() * 14, Math.floor(x), { moss: M.moss, cracks: 2 }), x, r() < 0.5 ? 2 : -3, { sink: 3 });
        else if (k < 0.72) put(Props.driftwood(M, 20 + r() * 20, Math.floor(x)), x, 2, { sink: 1 });
      }
      A.fossilTree = put(Paint.tree(M, 120, 51, { trunkRamp: M.palmTrunk, leafRamp: M.grass, roots: true, crownW: 110, crownH: 60 }), 4460, -4, { sink: 4, foot: 16 });
      for (const x of [4988, 5178]) put(Paint.rock(M, 26, 20, x, { ramp: M.rock, moss: M.algae, cracks: 2 }), x, 2, { sink: 5 });
      put(Props.anemone(M, 8, 7), 5070, -2, { fps: 2, sink: 2 });
      put(Props.coral(M, 'brain', 14, 44), 5120, -3, { sink: 2 });
      // the ancient altar: a carved slab with a spiral glyph
      const alt = new ISpr(40, 46);
      for (let y = 0; y < 46; y++) for (let x = 0; x < 40; x++) { const top = y < 6 ? Math.abs(x - 20) > 14 + y : false; if (top) continue; alt.set(x, y, x === 0 || x === 39 || y === 45 ? M.ink[1] : Props.pick(M.rock, 0.75 - x / 80 - y / 140, x, y)); }
      for (let a = 0; a < 20; a += 0.12) { const rr = a * 0.5; if (rr < 11) alt.set(Math.round(20 + Math.cos(a) * rr), Math.round(22 + Math.sin(a) * rr), M.rock[1]); }
      alt.ax = 20; alt.ay = 45;
      A.altar = put(alt, 5320, -3, { sink: 3 });
      A.glows.push({ x: 5320, y: gy(5320) - 24, r: 26, c: hex('#9fe8ff'), a: 0.35, always: true, k: 0 });
      A.altarGlow = A.glows[A.glows.length - 1];
    }
    // ---- micro details on the ground strip (front and back) ----
    const det = (key, ramp, x, zd, flip) => { const s = Paint.miniSpr(key, ramp, flip); const g = gy(x); A.details.push({ s, x, y: g + zd, zd, flip: false }); };
    for (let x = 260; x < 1040; x += 5 + r() * 14) {
      const k = r(), zd = (r() - 0.5) * 10;
      if (k < 0.18) det('shell1', M.shell, x, zd); else if (k < 0.3) det('shell3', M.shellB, x, zd); else if (k < 0.4) det('conch', M.shell, x, zd);
      else if (k < 0.52) det('pebble2', M.pebble, x, zd); else if (k < 0.58) det('star', M.star, x, zd); else if (k < 0.66) det('twig', M.drift, x, zd);
    }
    for (let x = 4260; x < 5590; x += 5 + r() * 14) { if (x > 4985 && x < 5180) continue; const k = r(), zd = (r() - 0.5) * 10; if (k < 0.2) det('pebble2', M.pebble, x, zd); else if (k < 0.3) det('shell2', M.shell, x, zd); else if (k < 0.4) det('twig', M.drift, x, zd); else if (k < 0.46) det('flower', M.flowerY, x, zd); }
    for (let x = 10; x < 250; x += 4 + r() * 8) { const k = r(), zd = (r() - 0.5) * 10; if (k < 0.3) det('flower', r() < 0.5 ? M.flowerP : M.flowerY, x, zd); else if (k < 0.45) det('clover', M.grass, x, zd); }
    for (let x = 1060; x < 3900; x += 6 + r() * 18) { if (gy(x) < SEA + 10) continue; const k = r(), zd = (r() - 0.5) * 10; if (k < 0.25) det('shell2', M.shell, x, zd); else if (k < 0.45) det('pebble', M.rockU, x, zd); else if (k < 0.55) det('star', M.star, x, zd); }
    // swaying tufts on the dunes and at the top of the beach
    for (let x = 12; x < 300; x += 9 + r() * 12) put(Paint.tuft(M, 10 + r() * 8, 8 + r() * 8, Math.floor(x), { flowers: r() < 0.3 ? [M.flowerP] : null }), x, 3 + r() * 2, { windFrames: true, sink: 0 });
    for (let x = 300; x < 900; x += 60 + r() * 90) put(Paint.tuft(M, 8 + r() * 6, 6 + r() * 6, Math.floor(x), { ramp: M.grass }), x, -4, { windFrames: true, sink: 0 });
    // ---- background layers ----
    // horizon: a smoking volcano island, Slateport City on its hills (downtown towers, the Contest Hall dome,
    // the harbour with gantry cranes and a container ship, a breakwater lighthouse) and a forested headland
    {
      const w = 1500, h = 120, s = new ISpr(w, h), lit = new ISpr(w, h);
      const P = Props.pick;
      // far volcano (left) with a drifting smoke plume, faint snow streaks
      for (let x = 0; x < 300; x++) { const u = Math.abs(x - 150) / 145; if (u >= 1) continue; let top = h - 52 * Math.pow(1 - u, 1.7) - (u < 0.05 ? -2 : 0) - fbm(x * 0.08, 0, 21, 2) * 3; for (let y = Math.round(top); y < h; y++) { const dep = y - top; let tt = (x < 150 ? 0.7 : 0.35) - dep / 120 + (fbm(x * 0.2, y * 0.05, 22, 2) - 0.5) * 0.3; if (Math.sin(x * 0.5 + y * 0.1) > 0.8 && dep < 30) tt -= 0.2; s.set(x, y, dep < 3 + hash(x >> 1, 0, 23) * 14 * (1 - u * 2.5) ? P(M.rock, tt + 0.1, x, y) : P(M.hill, tt, x, y)); } }
      for (let k = 0; k < 34; k++) { const cx0 = 150 + k * 2.6 + Math.sin(k * 0.7) * 4, cy0 = h - 68 - k * 1.4, rr = 3 + k * 0.3; for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr && hash(Math.round(cx0 + x), Math.round(cy0 + y), 4) > 0.2 + k / 60) s.set(Math.round(cx0 + x), Math.round(cy0 + y), M.sail[(y < -rr * 0.3 ? 1 : 0)]); }
      // rolling hills behind the city: two ridges, a forest canopy on the nearer one
      const hillTop = (x) => h - 20 - (x < 340 ? (340 - x) * -0.9 : x > 900 ? (x - 900) * -0.5 : 0) - Math.max(0, Math.sin((x - 250) / 700 * Math.PI)) * 30 - fbm(x * 0.012, 2, 9, 3) * 12;
      const back = new ISpr(w, h); Paint.ridge(back, M, { ramp: M.hill, base: h - 10, amp: 56, seed: 71, freq: 0.006, peaks: [[560, 260, 0.8], [1180, 200, 0.9]] });
      for (let x = 250; x < w; x++) for (let y = 0; y < h; y++) { const v = back.get(x, y); if (v && x < 960 && y > h - (h - hdTop(back, x)) * Math.min(1, (x - 250) / 80, (960 - x) / 80)) s.set(x, y, hash(x, y, 3) > 0.5 && back.get(x, y - 1) ? M.hill[Math.max(0, M.hill.indexOf(v) - 1)] : v); }
      const canopy = new ISpr(w, h); Paint.treeline(canopy, { ramp: M.treeF, base: h - 30, size: 5, seed: 31, jag: 6 });
      for (let x = 270; x < 940; x++) { const top = Math.round(hillTop(x)); for (let y = top - 6; y < h; y++) { const v = canopy.get(x, y - (top - (h - 34))); if (y >= top) s.set(x, y, v && y < top + 10 ? v : P(M.hill, 0.6 - (y - top) / 40, x, y)); else if (v) s.set(x, y, v); } }
      // the city: stepping up the hill, densest downtown
      const cityG = (x) => Math.min(h - 8, hillTop(x) + 12 - (x > 600 && x < 880 ? 0 : 0));
      paintTown(s, lit, M, { x0: 300, x1: 900, ground: (x) => x > 610 ? h - 8 : Math.min(h - 8, cityG(x) + (x - 300) * 0.04), maxH: 46, seed: 5, dome: 520, env: (u) => 0.25 + 0.75 * Math.exp(-((u - 0.55) ** 2) / 0.06), harbour: [612, 880] });
      for (const [dy, sd] of [[12, 15], [24, 25]]) paintTown(s, lit, M, { x0: 330, x1: 620, ground: (x) => Math.min(h - 8, cityG(x) + dy + (x - 300) * 0.04), maxH: 14, seed: sd, env: (u) => 0.6 + 0.4 * Math.sin(u * Math.PI) });
      // a sea wall + breakwater with a small lighthouse at its tip
      for (let x = 300; x < 930; x++) { s.set(x, h - 7, M.bldA[2]); s.set(x, h - 6, M.bldA[1]); s.set(x, h - 5, M.bldA[0]); }
      for (let y = 0; y < 14; y++) for (let x = -1; x <= 1; x++) s.set(928 + x, h - 7 - y, y > 11 ? M.ink[1] : Math.floor(y / 3) % 2 ? M.tRed[1] : M.tWhite[x < 0 ? 2 : 1]);
      lit.set(928, h - 20, M.lhLight[1]);
      // headland (right) with a forest cap, villas and the red-and-white lighthouse, tapering into the sea
      const hd = new ISpr(w, h);
      Paint.ridge(hd, M, { ramp: M.hill, base: h, amp: 44, seed: 4, freq: 0.01, peaks: [[1200, 200, 0.95], [1050, 110, 0.5]] });
      const hx0 = 960, hx1 = 1470;
      for (let x = hx0; x < hx1; x++) { const taper = Math.min(1, (x - hx0) / 60, (hx1 - x) / 90); for (let y = 0; y < h; y++) { const v = hd.get(x, y); if (v && y > h - (h - hdTop(hd, x)) * taper) s.set(x, y, v); } }
      function hdTop(sp, x) { let t = 0; while (t < h && !sp.get(x, t)) t++; return t; }
      const hTop = (x) => { let t = 0; while (t < h && !s.get(x, t)) t++; return t; };
      const trees = new ISpr(w, h); Paint.treeline(trees, { ramp: M.treeF, base: h - 30, size: 5, seed: 41, jag: 5 });
      for (let x = hx0 + 20; x < hx1 - 20; x++) { const top = hTop(x); for (let y = top - 4; y < Math.min(h, top + 8); y++) { const v = trees.get(x, y - top + (h - 34)); if (v) s.set(x, y, v); } }
      paintTown(s, lit, M, { x0: 1060, x1: 1150, ground: (x) => hdTop(hd, x) + 6, maxH: 4, seed: 9, trees: false });
      { const lx = 1240, top = hdTop(hd, lx) + 2; for (let y = 0; y < 20; y++) for (let x = -2; x <= 2; x++) s.set(lx + x, top - 18 + y, Math.floor(y / 4) % 2 ? M.roof[2] : M.wall[x < 0 ? 2 : 1]); for (let x = -3; x <= 3; x++) s.set(lx + x, top - 19, M.ink[1]); s.set(lx, top - 21, M.win[1]); s.set(lx - 1, top - 20, M.win[1]); s.set(lx + 1, top - 20, M.win[1]); A.farLight = [lx, top - 20]; }
      const L = A.layer(s, 0.03, { haze: 0.42, base: h - 1, x: -60 });
      L.draw = (fb, sx, sy, pal, t) => { const hr = Stage.S.hour; if (hr === 'night' || hr === 'dusk') Paint.blit(fb, lit, sx, sy, pal, { fade: hr === 'dusk' ? 0.45 : 0 }); };
    }
    // sailboats, a ferry and far rocks on the sea band
    {
      const w = 1400, h = 44, s = new ISpr(w, h);
      const SC2 = [M.tRed, M.umbA, M.umbB, M.coralP];
      for (const [bx, big] of [[140, 1], [330, 0], [470, 1], [700, 0], [820, 1], [1060, 1], [1250, 0]]) {
        const sh = big ? 18 + r() * 6 : 11 + r() * 4, c = SC2[Math.floor(r() * 4)], wl = h - 9;
        // mainsail (lit/shaded, a coloured stripe) + jib
        for (let y = 0; y < sh; y++) { const hw = Math.round((y / sh) * (big ? 8 : 5)); for (let k = 1; k <= hw; k++) s.set(bx + k, wl - sh + y, Math.abs(y - sh * 0.6) < 1 ? c[1] : M.sail[k < hw - 1 ? 1 : 0]); }
        for (let y = 3; y < sh - 1; y++) { const hw = Math.round(((y - 3) / sh) * (big ? 5 : 3)); for (let k = 1; k <= hw; k++) s.set(bx - k, wl - sh + y + 1, M.sail[k === hw ? 0 : 1]); }
        for (let y = 0; y < sh + 1; y++) s.set(bx, wl - sh + y, M.wood[1]);
        const hl = big ? 10 : 7;
        for (let k = -hl; k <= hl; k++) { s.set(bx + k, wl + 1, c[2] ?? c[1]); if (Math.abs(k) < hl) s.set(bx + k, wl + 2, c[0]); if (Math.abs(k) < hl - 2) s.set(bx + k, wl + 3, M.boatB[0]); }
        for (let k = -hl - 2; k <= hl + 2; k += 2) s.set(bx + k, wl + 4, M.shell[3]);
      }
      // a white ferry heading for Slateport
      { const fx = 560, wl = h - 8; for (let y = 0; y < 5; y++) for (let x = y; x < 46 - y; x++) s.set(fx + x, wl - y + 4, y < 2 ? M.boatB[1] : M.tWhite[x < 20 ? 2 : 1]); for (let y = 0; y < 5; y++) for (let x = 10; x < 34; x++) s.set(fx + x, wl - 1 - y, y === 2 && x % 3 ? M.winD[0] : M.tWhite[x < 14 ? 2 : 1]); for (let y = 0; y < 5; y++) for (let x = 18; x < 22; x++) s.set(fx + x, wl - 6 - y, y < 2 ? M.ink[1] : M.tRed[1]); for (let x = -8; x < 0; x++) if (x % 2) s.set(fx + x, wl + 4, M.shell[3]); }
      // wave-washed rocks
      for (const rx of [260, 940, 1180]) { const rk = Paint.rock(M, 16 + r() * 12, 7 + r() * 4, rx, { cracks: 0 }); s.paste(rk, rx, h - 5 - rk.h); for (let k = -2; k < rk.w + 2; k += 2) s.set(rx + k, h - 5, M.shell[3]); }
      A.layer(s, 0.14, { haze: 0.45, base: h - 5, x: 80 });
    }
    // sandbar island with palms (right, over the sea)
    {
      const w = 900, h = 110, s = new ISpr(w, h);
      const top = [];
      for (let x = 0; x < w; x++) { const u = (x - 520) / 300; top[x] = h - 10 - Math.max(0, 1 - u * u) * 14; }
      for (let x = 0; x < w; x++) for (let y = Math.round(top[x]); y < h - 6; y++) if (top[x] < h - 11) s.set(x, y, y < top[x] + 2 ? M.sand[4] : Props.pick(M.sand, 0.7 - (y - top[x]) / 12, x, y));
      for (const [px, ph] of [[420, 70], [520, 84], [610, 64], [700, 76]]) { const f = Paint.palm(M, ph, px + 3, { lean: (r() - 0.5) * 0.6, nuts: false })[1]; s.paste(f, px - f.ax, Math.round(top[px]) - f.ay + 2); }
      // hut
      for (let y = 0; y < 16; y++) for (let x = 0; x < 22; x++) s.set(560 + x, Math.round(top[560]) - 16 + y, y < 6 ? M.roof[2 + (x % 3 === 0 ? -1 : 0)] : M.wall[1]);
      A.layer(s, 0.3, { haze: 0.4, base: h - 8, x: 1400 * 0.3 + 200 });
    }
    // near backdrop: dunes, beach grass, the Seashore House, fence (land side only)
    {
      const w = 1100, h = 150, FR = 0, s = new ISpr(w, h + FR); // (the sand in front is now a real perspective floor)
      const top = [];
      for (let x = 0; x < w; x++) { const end = x < 520 ? 0 : (x - 520) * 0.45; top[x] = h - 30 - fbm(x * 0.008, 0.3, 5, 3) * 34 - 10 + end; }
      for (let x = 0; x < w; x++) for (let y = Math.max(0, Math.round(top[x])); y < h; y++) {
        const d = y - top[x];
        if (top[x] > h - 4) continue;
        const grassy = d < 8 + vnoise(x * 0.1, 0, 3) * 10 && x < 560;
        s.set(x, y, grassy ? Props.pick(M.grass, 0.75 - d / 18, x, y) : Props.pick(M.sand, 0.72 - d / 90, x, y));
        if (grassy && d < 1 && hash(x, 0, 5) > 0.5) for (let k = 1; k < 3 + hash(x, 1, 5) * 5; k++) s.set(x, y - k, M.grass[2 + (k & 1)]);
      }
      // seashore house
      const hx = 360, hy = Math.round(top[hx + 40]) + 6;
      for (let y = 0; y < 34; y++) for (let x = 0; x < 88; x++) s.set(hx + x, hy - 34 + y, x === 0 || x === 87 ? M.ink[1] : Props.pick(M.wall, 0.8 - (x / 88) * 0.4, x, y));
      for (let y = 0; y < 18; y++) { const hw = 48 - Math.round(y * 0.4); for (let x = -hw; x <= hw; x++) s.set(hx + 44 + x, hy - 52 + y, (Math.abs(x) + y) % 5 === 0 ? M.roof[0] : Props.pick(M.roof, 0.85 - y / 24 - (x > 0 ? 0.15 : 0), x, y)); }
      for (const wx of [hx + 12, hx + 34, hx + 62]) for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) s.set(wx + x, hy - 26 + y, x === 0 || y === 0 || x === 11 || y === 9 ? M.wood[1] : M.win[y < 4 ? 1 : 0]);
      for (let y = 0; y < 14; y++) for (let x = 0; x < 10; x++) s.set(hx + 50 + x - 2, hy - 14 + y, x === 0 || x === 9 ? M.wood[0] : M.wood[3]);
      A.houseGlow = [hx, hy];
      // fence + palms behind the beach
      for (let x = 40; x < 520; x += 10) { const y = Math.round(top[x]) + 10; for (let k = 0; k < 9; k++) s.set(x, y - k, M.wood[k < 2 ? 1 : 3]); if (x < 510) for (let k = 0; k < 10; k++) { s.set(x + k, y - 6, M.wood[2]); s.set(x + k, y - 3, M.wood[2]); } }
      for (const [px, ph] of [[120, 96], [260, 110], [470, 88]]) { const f = Paint.palm(M, ph, px + 9, { lean: (r() - 0.5) * 0.5, nuts: false })[0]; s.paste(f, px - f.ax, Math.round(top[px]) - f.ay + 6); }
      // the near beach in front of the dunes runs down toward the lane (stops where the sea begins)
      for (let x = 0; x < w; x++) {
        const edge = 560 + fbm(x * 0.02, 1, 3, 2) * 30;
        for (let y = h; y < h + FR; y++) {
          const yy = y - h;
          const ex = edge + yy * 1.6; // the shoreline slants toward the viewer
          if (x > ex) { if (x < ex + 4 + (hash(x, y, 2) > 0.5 ? 1 : 0)) s.set(x, y, M.sandW[3]); continue; }
          let t = 0.62 + (vnoise(x * 0.08, y * 0.25, 7) - 0.5) * 0.3 + yy / FR * 0.08;
          if (x > ex - 14) t -= 0.25; // wet sand at the waterline
          s.set(x, y, Props.pick(x > ex - 14 ? M.sandW : M.sand, t, x, y));
          if (hash(x, y, 9) > 0.992) s.set(x, y, M.shell[2]);
        }
      }
      const L = A.layer(s, 0.62, { haze: 0.22, base: h - 1, x: 0 });
      A.nearL = L;
    }
    // ---- 2.5D depth: the sand between the dunes and the lane is a perspective plane; the shoreline
    // curves away into the bay and waves lap along it; palms, rocks and grass stand at many depths ----
    {
      const SH0 = World.shoreX;
      const shoreW = (p) => { const k = (1 - p) / 0.38; return SH0 + k * (760 - SH0) + Math.sin(k * 3.1) * 34 * k; };
      const shoreE = (p) => { const k = (1 - p) / 0.38; return 3995 + k * 50 + Math.sin(k * 2.3) * 20 * k; };
      A.depthP0 = 0.62; A.depthHaze = 0.22;
      const land = (wx, p, m = 0) => wx < shoreW(p) - m || wx > shoreE(p) + m;
      A.floor = { p0: 0.62, D: 110,
        row(wz, p, t) { const lap = Math.sin(t * 0.8 + wz * 0.07) * 5 + Math.sin(t * 1.9 + wz * 0.21) * 1.5; return { sw: shoreW(p) + lap, se: shoreE(p) - lap, C: SC[Stage.S.hour], foam: 2.4 / p }; },
        tex(wx, wz, p, t, R) {
        const sw = R.sw, se = R.se;
        const dist = wx < sw ? sw - wx : wx > se ? wx - se : -Math.min(wx - sw, se - wx);
        if (dist < -30) return 0; // open sea: the sea band shows through
        const C = R.C;
        if (dist < 0) { // clear shallows over sand, with sun glints
          const k = -dist / 30, g = hash(Math.floor(wx / 3), Math.floor(wz), Math.floor(t * 3)) > 0.97;
          return g ? C.glint : mix(mix(C.near, C.glint, 0.35), C.near, k);
        }
        if (dist < R.foam) return M.shell[3]; // foam line
        const n = Stage.noiseAt(wx * 0.45, wz * 1.4);
        if (dist < 18) return M.sandW[Math.min(3, 1 + (n > 0.55 ? 1 : 0) + (dist > 12 ? 1 : 0))];
        if (wx < 240 || (wx > 4200 && n > 0.62)) return M.grass[n > 0.7 ? 3 : 2];
        if (hash(Math.floor(wx / 2), Math.floor(wz / 1.2), 7) > 0.996) return M.shell[2];
        if (hash(Math.floor(wx / 2), Math.floor(wz / 1.2), 9) > 0.997) return M.pebble[2];
        const rip = Math.sin(wz * 0.9 + n * 7 + wx * 0.015);
        return M.sand[Math.max(1, Math.min(5, 3 + (rip > 0.7 ? 1 : 0) + (n > 0.64 ? 1 : 0) - (n < 0.34 ? 1 : 0)))];
      } };
      const r2 = rng(777);
      const place = (make, n, p0, p1, m, xr = [60, A.W - 60]) => {
        for (let i = 0, g = 0; i < n && g < n * 20; g++) {
          const p = p0 + r2() * (p1 - p0), wx = xr[0] + r2() * (xr[1] - xr[0]);
          if (!land(wx, p, m)) continue;
          const it = make(p, wx, i); if (it) i++;
        }
      };
      // palms (painted at their distance's size — nothing is scaled, so pixels stay crisp)
      place((p, wx, i) => A.scatterAt(Paint.palm(M, Math.round((100 + r2() * 50) * p), 900 + i, { lean: (r2() - 0.5) * 0.5 }), wx, p, { windFrames: true }), 16, 0.64, 0.93, 40);
      place((p, wx, i) => A.scatterAt(Paint.rock(M, Math.round((16 + r2() * 30) * p), Math.round((10 + r2() * 16) * p), 300 + i, { moss: M.moss, cracks: 1 }), wx, p), 30, 0.63, 0.97, 20);
      place((p, wx, i) => A.scatterAt(Paint.tuft(M, Math.round((10 + r2() * 12) * p), Math.round((10 + r2() * 14) * p), 500 + i, { ramp: M.grass, flowers: r2() < 0.3 ? [M.flowerP] : null }), wx, p, { windFrames: true }), 90, 0.63, 0.86, 30);
      place((p, wx, i) => A.scatterAt(Props.driftwood(M, Math.round((22 + r2() * 26) * p), 700 + i), wx, p), 10, 0.7, 0.97, 30);
      place((p, wx, i) => A.scatterAt(Paint.bush(M, Math.round((18 + r2() * 14) * p), Math.round((10 + r2() * 8) * p), 800 + i, { ramp: M.grass, dots: r2() < 0.5 ? M.flowerY : M.flowerP }), wx, p), 18, 0.63, 0.8, 60);
      for (const [wx, p] of [[430, 0.9], [620, 0.86], [300, 0.93]]) if (land(wx, p, 20)) A.scatterAt(Props.umbrella(M, Math.floor(wx)), wx, p);
      A.shoreW = shoreW; A.shoreE = shoreE;
      // out on the water, all bobbing on the swell: striped buoys, sailboats, surf-ringed rocks
      {
        const sea = (wx, p) => wx > shoreW(p) + 50 && wx < shoreE(p) - 50;
        const BOB = [0, 1, 1, 0];
        const foam = (s, y, x0, x1, f) => { for (let x = x0; x <= x1; x++) if ((x + f) % 3) s.set(x, y, M.shell[3]); };
        const buoy = (p) => BOB.map((dy, f) => {
          const h = Math.max(5, Math.round(13 * p)), w = Math.max(3, Math.round(6 * p)), s = new ISpr(w + 4, h + 3);
          for (let y = 0; y < h; y++) {
            const half = Math.max(1, Math.round((w / 2) * Math.min(1, (y + 2) / (h * 0.45))));
            for (let x = -half; x < half; x++) { const band = Math.floor(y / Math.max(2, h / 4)) % 2, lit = x < 0 ? 2 : 1; s.set(2 + (w >> 1) + x, y + dy, band ? M.tWhite[lit] : M.tRed[lit]); }
          }
          s.set(2 + (w >> 1), dy, M.umbB[3]);
          foam(s, h + 1, 0, w + 3, f); s.ax = (w + 4) / 2; s.ay = h + 1;
          return s;
        });
        const sail = (p, seed) => BOB.map((dy, f) => {
          const L = Math.max(8, Math.round(30 * p)), H = Math.max(8, Math.round(34 * p)), s = new ISpr(L + 4, H + 5);
          const mast = Math.round(L * 0.45);
          for (let y = 0; y < H - 4; y++) {
            const wS = Math.round((y / (H - 4)) * L * 0.42), wJ = Math.round((y / (H - 4)) * L * 0.3);
            for (let x = 1; x <= wS; x++) s.set(2 + mast + x, y + dy, M.tWhite[x < wS * 0.4 ? 2 : 1]);
            for (let x = 1; x <= wJ; x++) s.set(2 + mast - x, y + 2 + dy, M.tWhite[1]);
            s.set(2 + mast, y + dy, M.wood[1]);
          }
          for (let y = H - 4; y < H; y++) { const inset = y - (H - 4); for (let x = inset; x < L - inset * 0.5; x++) s.set(2 + x, y + dy, y === H - 4 ? M.boatR[3] : M.boatR[1 + (x < L / 2 ? 1 : 0)]); }
          foam(s, H + 1, 0, L + 3, f + seed); s.ax = (L + 4) / 2; s.ay = H + 1;
          return s;
        });
        const islet = (p, seed) => {
          const w = Math.round((26 + (seed % 5) * 6) * p), h = Math.round((14 + (seed % 3) * 5) * p), rk = Paint.rock(M, w, h, seed, { moss: M.moss, cracks: 2 });
          return [0, 1, 2].map((f) => {
            const s = new ISpr(rk.w + 6, rk.h + 3); s.paste(rk, 3, 0);
            foam(s, rk.h, 0, rk.w + 5, f); foam(s, rk.h + 1, 2, rk.w + 3, f + 1); s.ax = s.w / 2; s.ay = rk.h;
            return s;
          });
        };
        const rs = rng(909);
        const spot = (p0, p1, n, fn) => { for (let i = 0, g = 0; i < n && g < 200; g++) { const p = p0 + rs() * (p1 - p0), wx = 900 + rs() * 2500; if (!sea(wx, p)) continue; fn(p, wx, i); i++; } };
        spot(0.66, 0.92, 7, (p, wx, i) => A.scatterAt(buoy(p), wx, p, { fps: 1.6, phase: i * 1.3 }));
        spot(0.63, 0.72, 3, (p, wx, i) => A.scatterAt(sail(p, i), wx, p, { fps: 1.1, phase: i * 2 }));
        spot(0.64, 0.84, 4, (p, wx, i) => A.scatterAt(islet(p, 31 + i * 7), wx, p, { fps: 2, phase: i }));
      }
    }
    // east backdrop: warm sandstone sea cliffs with a grassy cap, bushes, palms and a cave mouth
    {
      const w = 1500, h = 170, s = new ISpr(w, h);
      const top = [];
      for (let x = 0; x < w; x++) { const rise = clamp((x - 40) / 200, 0, 1); top[x] = h - 14 - rise * (70 + fbm(x * 0.007, 0.4, 8, 3) * 40); }
      for (let x = 0; x < w; x++) for (let y = Math.max(0, Math.round(top[x])); y < h; y++) {
        const d = y - top[x];
        const cap = 4 + vnoise(x * 0.15, 0, 5) * 4;
        if (d < cap) { s.set(x, y, Props.pick(M.grass, 0.85 - d / cap * 0.5, x, y)); continue; }
        // horizontal strata (subtle, warm), vertical weathering cracks, shadow under the grass lip
        const band = (y + Math.sin(x * 0.015) * 5 + vnoise(x * 0.03, y * 0.1, 2) * 3) / 9, bi = Math.floor(band);
        let t = 0.78 - (d < cap + 3 ? 0.35 : 0) - (bi % 3 === 1 ? 0.14 : bi % 3 === 2 ? 0.06 : 0) - (band - bi < 0.12 ? 0.1 : 0) - d / 600;
        if (vnoise(x * 0.09, y * 0.012, 4) > 0.78) t -= 0.25;
        s.set(x, y, Props.pick(M.face, t + (vnoise(x * 0.2, y * 0.2, 6) - 0.5) * 0.12, x, y));
      }
      // hanging grass and vines over the lip
      for (let x = 0; x < w; x += 3) if (hash(x, 3, 7) > 0.55) { const L = 2 + Math.floor(hash(x, 4, 7) * 9); for (let k = 0; k < L; k++) s.set(x, Math.round(top[x]) + 5 + k, M.grass[k < 2 ? 2 : 1]); }
      // cave mouth: shaded arch, dark depth, dripping teeth, a faint blue glow deep inside
      const CX = 1060, CB = h - 6, CW = 34, CH = 46;
      for (let y = 0; y < CH + 4; y++) for (let x = -CW - 4; x <= CW + 4; x++) {
        const q = (x * x) / (CW * CW) + ((y - CH) * (y - CH)) / (CH * CH);
        const X = CX + x, Y = CB - y;
        if (q < 1) { const inner = 1 - q; s.set(X, Y, inner > 0.55 ? M.ink[0] : inner > 0.25 ? M.ink[1] : M.face[0]); if (inner > 0.7 && hash(X, Y, 3) > 0.985) s.set(X, Y, M.win[0]); }
        else if (q < 1.25) s.set(X, Y, M.face[q < 1.1 ? 1 : 2]);
      }
      for (let x = -CW + 6; x < CW - 6; x += 5 + Math.floor(hash(x, 9, 1) * 4)) { const L = 3 + Math.floor(hash(x, 8, 1) * 6), yy = CB - CH + Math.round(CH * (1 - Math.sqrt(Math.max(0, 1 - (x * x) / (CW * CW))))); for (let k = 0; k < L; k++) s.set(CX + x, yy + k, M.face[1]); }
      // bushes and palms on top
      for (let x = 60; x < w; x += 90 + Math.floor(hash(x, 5, 5) * 140)) { const b = Paint.bush(M, 20 + hash(x, 6, 5) * 16, 10 + hash(x, 7, 5) * 6, x, { ramp: M.grass, dots: hash(x, 8, 5) > 0.5 ? M.flowerY : M.flowerP }); s.paste(b, x - b.ax, Math.round(top[x]) - b.ay + 3); }
      for (const [px, ph] of [[300, 80], [760, 96], [1280, 70]]) { const f = Paint.palm(M, ph, px, { lean: (r() - 0.5) * 0.5, nuts: false })[0]; s.paste(f, px - f.ax, Math.round(top[px]) - f.ay + 6); }
      const L = A.layer(s, 0.62, { haze: 0.14, base: h - 1, x: 2760 }); // starts behind the islet, never behind open sea
      L.skirt = M.face[2];
    }
    // foreground occluders: beach grass clumps and morning-glory vines in front of the beach, coral heads and kelp over the reef
    for (let x = -40; x < 1080; x += 70 + r() * 110) {
      const kind = r() < 0.7 ? 'grass' : 'leaf';
      let s = Paint.clump(kind === 'grass' ? M.grass : M.palmLeaf, 50 + r() * 40, 60 + r() * 40, Math.floor(x * 7), kind, { n: kind === 'grass' ? 14 : 9 });
      // sea-oat seed heads on the grass, pink morning glories on the leafy vines
      Paint.tips(s, kind === 'grass' ? M.sand : M.flowerP, kind === 'grass' ? 7 : 5, Math.floor(x * 3), kind === 'grass' ? 1.1 : 2);
      s = Paint.edge(s, M.ink[0]);
      A.foreItem(s, x, gy(x) + 58 + r() * 26, { p: 1.35, sway: 3, flip: r() < 0.5, dark: 0.12 });
    }
    for (let x = 1200; x < 3800; x += 120 + r() * 200) {
      if (gy(x) < SEA + 40) continue;
      const k = r();
      const s = k < 0.4 ? Props.coral(M, pick2(r, ['branch', 'fan', 'brain', 'table']), 50 + r() * 30, Math.floor(x)) : k < 0.75 ? Props.kelp(M, 100 + r() * 60, Math.floor(x), 1)[0] : Paint.rock(M, 60 + r() * 40, 30 + r() * 20, Math.floor(x), { ramp: M.rockU, moss: M.algae });
      A.foreItem(s, x, gy(x) + 50 + r() * 30, { p: 1.35, sway: k >= 0.4 && k < 0.75 ? 2 : 0, tint: 0xff3a1a08, dark: 0.35 });
    }
    A.foreHaze = 0; A.foreDark = 0.16; A.foreTint = 0xff2a1c14;
    // ---- hotspots ----
    // toys: bounce on the umbrella, build the sandcastle, nap in the hammock, ring the dock bell, collect shells
    { const u = A.umbrella, us = u.frames[0]; Toys.springy(A, 425, u.y - us.ay + 8, { prop: u, secret: 'toy.umbrella', w: 26 }); }
    Toys.castle(A, M, A.castle, 560);
    Toys.hammock(A, M, 178, 328, gy(250) - 46);
    Toys.bell(A, M, 1800, DOCK.y);
    Toys.shells(A, M, [280, 1000]);
    A.addHot({ x0: 2318, x1: 2342, y0: gy(2330) - 20, y1: gy(2330) + 2, x: 2330, reach: 34, stand: gy(2330) - 10, tap() { BeachAI.chest(A); } });
    for (const b of A.boats) A.addHot({ x0: b.x - 36, x1: b.x + 36, y0: SEA - 16, y1: SEA + 12, x: b.x, reach: 60, stand: DOCK.y, boat: b, tap() { BeachAI.boatTap(A, b); } });
    A.addHot({ x0: 930, x1: 966, y0: gy(948) - 24, y1: gy(948), x: 948, reach: 40, rock: crystalRock, tap() { BeachAI.crystalRock(A, crystalRock); } });
    A.addHot({ x0: 55, x1: 85, y0: gy(70) - 30, y1: gy(70), x: 70, reach: 40, tap() { HUD.toast('Route 109 — Coral Cove. Snap Pokémon doing fun things!', { life: 3.4 }); } });
    // berry bushes
    for (const bx of [60, 215]) A.addHot({ x0: bx - 16, x1: bx + 16, y0: gy(bx) - 18, y1: gy(bx), x: bx, reach: 34, tap() { BeachAI.shakeBush(A, bx); } });
  };

  /* ---------------- drawing behind the lane ---------------- */
  def.drawBack = (A, fb, cx, cy, t) => {
    const W = fb.w, H = fb.h, d = fb.d;
    const hr = Stage.S.hour, C = SC[hr], rain = Weather.W.rain;
    const hz = Stage.horizonS(cy), seaS = SEA - cy;
    Stage.drawSky(fb, cx, cy, t);
    // horizon layer (skyline) sits on the horizon
    Stage.drawLayer(fb, A.layers[0], cx, cy, t);
    // the far sea: from the horizon down to the lane's surface line
    const y0 = Math.max(0, hz), y1 = Math.min(H, Math.max(hz, seaS + 2));
    const far = rain > 0 ? mix(C.far, 0xff605a58, rain * 0.3) : C.far, near = rain > 0 ? mix(C.near, 0xff807a70, rain * 0.3) : C.near;
    const sunX = Math.round(Pal.LOOK[hr].sun.x * W - cx * 0.01);
    const wm = Stage.waterMask(W * H), wcb = Stage.S.wc;
    for (let y = y0; y < y1; y++) {
      const u = (y - hz) / Math.max(1, seaS - hz);
      const base = mix(far, near, Math.pow(u, 0.7));
      const row = y * W;
      const lines = 1 + Math.floor(u * 3);
      // wave texture via a sine lookup table (this band covers a lot of pixels)
      const fa = (0.3 - u * 0.2) * SINK, pa = (y * 1.7 + t * (0.8 + u)) * SINK, fb2 = 0.071 * SINK, pb = (y * 0.9 - t * 0.6) * SINK;
      const thr = 1.25 - u * 0.2, gl = mix(base, C.glint, 0.35 + u * 0.25), tr = mix(base, far, 0.35);
      const off = cx * (0.1 + u * 0.9), sw = 10 + u * 60, tq = Math.floor(t * 4);
      for (let x = 0; x < W; x++) {
        const wx = x + off;
        const wv = SIN[(wx * fa + pa) & 4095] + SIN[(wx * fb2 + pb) & 4095] * 0.6;
        let c = wv > thr && ((x + y) & 1) ? gl : wv < -1.3 ? tr : base;
        const ds = Math.abs(x - sunX) / sw;
        if (ds < 1 && hash(Math.floor(wx / 2), y, tq) > 0.6 + ds * 0.35) c = mix(c, C.glint, 0.8 - ds * 0.5);
        d[row + x] = c;
      }
      if (u < 0.04) for (let x = 0; x < W; x++) d[row + x] = mix(d[row + x], Pal.LOOK[hr].hazeC, 0.5 - u * 10);
      for (let x = 0; x < W; x++) { wm[row + x] = 1; wcb[row + x] = d[row + x]; }
    }
    // sailboats + sandbar island on the sea, backdrop dunes on the land side
    Stage.drawLayer(fb, A.layers[1], cx, cy, t);
    Stage.drawLayer(fb, A.layers[2], cx, cy, t);
    // distant Wailord (behind the near backdrop)
    BeachAI.drawFarSea(fb, cx, cy, t, hz, seaS);
    Stage.drawLayer(fb, A.layers[3], cx, cy, t);
    for (let i = 4; i < A.layers.length; i++) Stage.drawLayer(fb, A.layers[i], cx, cy, t);
    // the beach receding in perspective: sand plane, curving shoreline with lapping waves, depth scenery
    Stage.drawDepthFrom(fb, cx, cy, t, 0.6);
    BeachAI.checkFar(fb);
    // underwater backdrop below the surface line
    if (seaS < H) {
      const ys = Math.max(0, Math.round(seaS));
      for (let y = ys; y < H; y++) {
        const dep = y + cy - SEA;
        const k1 = clamp(dep / 260, 0, 1), k2 = clamp((dep - 260) / 520, 0, 1);
        const base = k2 > 0 ? mix(C.deep, C.abyss, k2) : mix(C.top, C.deep, k1 * k1 * 0.4 + k1 * 0.6);
        const row = y * W;
        d.fill(base, row, row + W);
      }
      // distant reef silhouettes
      BeachAI.drawUnderBackdrop(fb, cx, cy, t, C);
    }
  };
  def.drawLane = (A, fb, cx, cy, t) => {
    // boats bob on the swell
    for (const b of A.boats) { b.y = WorldRender.surfaceAt(b.x, t) + 4; }
  };
  def.post = (A, fb, cx, cy, t) => {
    // lighthouse beam sweeping at night
    const hr = Stage.S.hour;
    if (hr !== 'night' && hr !== 'dusk') return;
    const lx = (A.lhX ?? 3962) - cx, ly = (A.lhY ?? World.groundAt(3962) - 84) - cy;
    if (lx < -400 || lx > fb.w + 400) return;
    const a = Math.sin(t * 0.8) * 1.2 + Math.PI;
    const W = fb.w, H = fb.h, d = fb.d;
    for (let k = 0; k < 400; k++) {
      for (let j = -Math.round(k * 0.08); j <= Math.round(k * 0.08); j++) {
        const x = Math.round(lx + Math.cos(a) * k - Math.sin(a) * j), y = Math.round(ly + Math.sin(a) * k * 0.3 + Math.cos(a) * j);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        d[y * W + x] = U.screen(d[y * W + x], 0xffb0f0ff, 0.12 * (1 - k / 400));
      }
    }
  };
  def.hazeC = null;

  /* ---------------- footprints in the sand ---------------- */
  const prints = [];
  def.footprint = (x, y, side) => {
    const A = Stage.A;
    if (World.groundAt(x) > SEA - 2 || x < 250) return;
    const px = Math.round(x), py = Math.round(y + (side ? 1 : -2));
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const saved = cells.map(([dx, dy]) => [px + dx, py + dy, Terrain.at(A, px + dx, py + dy)]);
    for (const [dx, dy] of cells) Terrain.put(A, px + dx, py + dy, A.M.sand[1]);
    prints.push({ saved, t: 0 });
    if (prints.length > 60) { const p = prints.shift(); for (const [sx, sy, v] of p.saved) Terrain.put(A, sx, sy, v); }
  };
  def.update = (A, dt, t, G) => {
    for (let i = prints.length - 1; i >= 0; i--) { const p = prints[i]; p.t += dt; if (p.t > 14 || (World.groundAt(p.saved[0][0]) > SEA - 12 && p.t > 3)) { for (const [sx, sy, v] of p.saved) Terrain.put(A, sx, sy, v); prints.splice(i, 1); } }
    BeachAI.update(A, dt, t, G);
    if (typeof FossilAI !== 'undefined') FossilAI.update(A, dt, t, G);
    if (typeof SeaAI !== 'undefined') SeaAI.update(A, dt, t, G);
  };
  def.ball = () => (BeachAI.S ? BeachAI.S.ball : null);
  def.spawn = (A, G) => { BeachAI.spawn(A, G); if (typeof FossilAI !== 'undefined') FossilAI.spawn(A, G); if (typeof SeaAI !== 'undefined') SeaAI.spawn(A, G); };
  def.weather = (hour) => ({ rain: 0, fog: hour === 'dawn' ? 0.25 : 0 });
  def.ambient = (hour, W) => {
    const out = [
      { kind: 'sparkle', rate: 1.6, c: hex('#ffffff'), life: 1.4, y: () => SEA - 4 - Math.random() * 30, sway: 2, bob: 1 },
      { kind: 'bubble', rate: 4, life: 5, vy: -18, y: () => SEA + 40 + Math.random() * 500, sway: 4, bob: 2 },
    ];
    if (hour === 'night' || hour === 'dusk') out.push({ kind: 'firefly', rate: 0.8, c: hex('#c8ff9a'), life: 7, y: () => 420 + Math.random() * 60, sway: 10, bob: 6 });
    if (hour !== 'night') {
      out.push({ kind: 'bird', rate: 0.25, group: [3, 6], vx0: 22, par: 0.35, c: hour === 'dusk' ? hex('#3a2a40') : hex('#2a3a5a'), life: 40, sway: 3, bob: 2, y: () => 180 + Math.random() * 90 });
      out.push({ kind: 'butterfly', rate: 0.5, c: hex(Math.random() < 0.5 ? '#ffd648' : '#ff9ad0'), c2: hex('#ffffff'), life: 12, sway: 18, bob: 10, y: (x) => World.groundAt(x) - 14 - Math.random() * 40 });
      out.push({ kind: 'sand', rate: 5, c: hex('#f5dcab'), life: 1.4, vy: -3, drift: 3, sway: 2, bob: 1, y: (x) => World.groundAt(x) - 1 - Math.random() * 4 });
    }
    out.push({ kind: 'fish', rate: 0.35, group: [8, 14], vx0: 12, c: hex('#5a8ac0'), c2: hex('#c8e8ff'), life: 36, sway: 3, bob: 4, y: () => SEA + 280 + Math.random() * 420 });
    out.push({ kind: 'firefly', rate: 0.6, c: hex('#7af0ff'), life: 8, sway: 8, bob: 5, y: () => SEA + 380 + Math.random() * 500 });
    out.push({ kind: 'fish', rate: 0.6, group: [5, 9], vx0: 16, c: hex('#9ad8f0'), c2: hex('#ffffff'), life: 30, sway: 2, bob: 3, y: () => SEA + 60 + Math.random() * 300 });
    if (hour === 'noon' || hour === 'afternoon') out.push({ kind: 'leaf', rate: 0.25, c: hex('#4ea044'), c2: hex('#80c45a'), life: 8, drift: 1, vy: 6, y: () => 380 + Math.random() * 60 });
    return out;
  };
  def.onScan = (A) => BeachAI.onScan(A) + (typeof FossilAI !== 'undefined' ? FossilAI.onScan(A) : 0);
  def.onSong = (x) => { BeachAI.Secrets.song(x); if (typeof SeaAI !== 'undefined') SeaAI.song(x); };
  def.onWater = (tx, ty) => { if (World.waterAt(tx) !== null && tx < 4100) for (const m of Mons.all) if (m.splash) m.splash(tx); if (typeof FossilAI !== 'undefined') FossilAI.water(tx, ty); };
  def.onFood = (A, it) => { if (it.state === 'float') for (const m of Mons.all) if (m.splash && !it.claim) { m.splash(it.x, it); it.claim = m; } };
  def.photoBonus = (A, crop, subs, main) => { const b = BeachAI.photoBonus(A, crop, subs, main); if (typeof Boardwalk !== 'undefined' && Boardwalk.lucky) { Boardwalk.lucky = false; return { pts: ((b && b.pts) || 0) + 300, name: (b && b.name ? b.name + ' + ' : '') + 'Lucky Lemonade' }; } return b; };
  return def;
})();
