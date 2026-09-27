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
    W: 3400, H: 1260, sea: SEA, refY: SEA, h0: 96, cy0: 290, ph: 0.06, skyH: 360, sunH: 150, band: 12, waves: 1.6,
    camY: [-40, 1260],
    start: 300,
    ground: [[0, 452], [90, 452], [170, 462], [240, 478], [320, 488], [460, 492], [640, 494], [800, 497], [900, 502], [1000, 509], [1100, 520], [1200, 535], [1300, 555], [1400, 580], [1500, 608], [1600, 638], [1700, 666], [1800, 690], [1900, 708], [2000, 714], [2100, 708], [2300, 702], [2450, 716], [2560, 752], [2640, 840], [2700, 1000], [2760, 1120], [2880, 1170], [2990, 1130], [3070, 980], [3130, 780], [3180, 600], [3220, 510], [3260, 486], [3330, 478], [3400, 478]],
    water: [{ x0: 0, x1: 3400, level: SEA, kind: 'sea' }],
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
    },
  };

  /* ---------------- colours of the sea ---------------- */
  const SEAC = {
    dawn: { far: '#6f6aa8', near: '#86a4cc', glint: '#ffe8d0', top: '#7aa6d0', mid: '#44609e', deep: '#1e2856', abyss: '#070a1c', foam: '#fff4e8', ray: '#ffe0d0' },
    noon: { far: '#1f5eb2', near: '#3ab8de', glint: '#ffffff', top: '#3cb4dc', mid: '#1e74ba', deep: '#0d3a70', abyss: '#040b1e', foam: '#ffffff', ray: '#d8fbff' },
    afternoon: { far: '#2a62a8', near: '#52acc8', glint: '#fff4d0', top: '#4aa6c6', mid: '#236ca8', deep: '#11386a', abyss: '#050a1c', foam: '#fffdf4', ray: '#fff0c4' },
    dusk: { far: '#4a3a78', near: '#7a5a8e', glint: '#ffc070', top: '#5a5288', mid: '#342e6c', deep: '#1a1846', abyss: '#07061a', foam: '#ffe0c8', ray: '#ffb888' },
    night: { far: '#0c183c', near: '#193660', glint: '#cfe0ff', top: '#183660', mid: '#0e2446', deep: '#071430', abyss: '#02050e', foam: '#bff8f0', ray: '#8fb0e8' },
  };
  const SC = {}; for (const k in SEAC) { SC[k] = {}; for (const j in SEAC[k]) SC[k][j] = hex(SEAC[k][j]); }
  def.waterCols = (hour, w) => {
    const c = SC[hour];
    return { top: c.top, mid: c.mid, deep: c.deep, foam: c.foam, hi: mix(c.foam, c.top, 0.25), ray: w && w.rain > 0.5 ? null : c.ray, maxD: 620 };
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
        const g = gy(x), wv = clamp((g - SEA - 2) / 60 + dep / 900, 0, 1), under = wv > 0 && U.bayer4(x, y) < wv;
        const n1 = e.n1(x, y), n2 = e.n2(x, y);
        if (dep <= 1) return under ? M.bedFace[0] : M.face[0]; // shadow under the lip
        // sediment bands that follow the surface, with soft wavy boundaries
        const band = (dep + n1 * 10 + Math.sin(x * 0.05) * 2) / 13;
        const bi = Math.floor(band), bf = band - bi;
        const edge = bf < 0.12;
        if (under) {
          let t = 0.72 - Math.min(0.45, dep / 260) - (bi % 3 === 1 ? 0.12 : bi % 3 === 2 ? 0.05 : 0) + (n2 - 0.5) * 0.18;
          if (edge) t -= 0.1;
          return e.pickR(M.bedFace, t, x, y);
        }
        if (x < 250 && dep < 5) return dep < 3 ? M.grass[0] : M.face[1]; // grass roots overhang
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
    const palms = [[165, 128, 0.25], [340, 150, -0.1], [590, 136, 0.3], [775, 118, -0.3], [3300, 120, -0.25]];
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
    for (let x = 1080; x < 2560; x += 16 + r() * 36) {
      if (x > 2380 && x < 2440) continue;
      const g = gy(x);
      if (g < SEA + 20) continue;
      const k = reefK[Math.floor(r() * reefK.length)];
      const sz = 14 + r() * 26 * (x > 1300 && x < 2300 ? 1.2 : 0.7);
      put(Props.coral(M, k, sz, Math.floor(x)), x, (r() < 0.35 ? 3 : -3), { sink: 2 });
      if (r() < 0.35) put(Props.anemone(M, 7 + r() * 5, Math.floor(x * 3)), x + 10, -2, { fps: 2.2, phase: r() * 3, sink: 2 });
      if (r() < 0.2) put(Props.sponge(M, 10 + r() * 8, Math.floor(x)), x - 12, -3, { sink: 2 });
    }
    for (let x = 1110; x < 2700; x += 40 + r() * 70) { if (gy(x) < SEA + 30) continue; put(Props.kelp(M, 40 + r() * 70, Math.floor(x)), x, -4, { fps: 2.5 + r(), phase: r() * 4, sink: 2 }); }
    for (const [rx, w, h] of [[1480, 60, 34], [2080, 78, 40], [2470, 110, 58], [2600, 70, 50]]) put(Paint.rock(M, w, h, rx, { ramp: M.rockU, moss: M.algae, cracks: 3 }), rx, -3, { sink: 6 });
    A.chest = put(Props.chest(M, Save.found('beach.chest')), 2330, -1, { sink: 2 });
    put(Props.anchor(M), 2520, 2, { sink: 4 });
    // the islet
    A.lighthouse = put(Props.lighthouse(M), 3285, -4, { sink: 4 });
    A.glows.push({ x: 3285, y: gy(3285) - 84, r: 70, c: hex('#fff0a0'), a: 0.7, flicker: false });
    put(Paint.rock(M, 60, 30, 77, { moss: M.moss }), 3215, -2, { sink: 6 });
    // ---- micro details on the ground strip (front and back) ----
    const det = (key, ramp, x, zd, flip) => { const s = Paint.miniSpr(key, ramp, flip); const g = gy(x); A.details.push({ s, x, y: g + zd, zd, flip: false }); };
    for (let x = 260; x < 1040; x += 5 + r() * 14) {
      const k = r(), zd = (r() - 0.5) * 10;
      if (k < 0.18) det('shell1', M.shell, x, zd); else if (k < 0.3) det('shell3', M.shellB, x, zd); else if (k < 0.4) det('conch', M.shell, x, zd);
      else if (k < 0.52) det('pebble2', M.pebble, x, zd); else if (k < 0.58) det('star', M.star, x, zd); else if (k < 0.66) det('twig', M.drift, x, zd);
    }
    for (let x = 10; x < 250; x += 4 + r() * 8) { const k = r(), zd = (r() - 0.5) * 10; if (k < 0.3) det('flower', r() < 0.5 ? M.flowerP : M.flowerY, x, zd); else if (k < 0.45) det('clover', M.grass, x, zd); }
    for (let x = 1060; x < 3200; x += 6 + r() * 18) { if (gy(x) < SEA + 10) continue; const k = r(), zd = (r() - 0.5) * 10; if (k < 0.25) det('shell2', M.shell, x, zd); else if (k < 0.45) det('pebble', M.rockU, x, zd); else if (k < 0.55) det('star', M.star, x, zd); }
    // swaying tufts on the dunes and at the top of the beach
    for (let x = 12; x < 300; x += 9 + r() * 12) put(Paint.tuft(M, 10 + r() * 8, 8 + r() * 8, Math.floor(x), { flowers: r() < 0.3 ? [M.flowerP] : null }), x, 3 + r() * 2, { windFrames: true, sink: 0 });
    for (let x = 300; x < 900; x += 60 + r() * 90) put(Paint.tuft(M, 8 + r() * 6, 6 + r() * 6, Math.floor(x), { ramp: M.grass }), x, -4, { windFrames: true, sink: 0 });
    // ---- background layers ----
    // horizon: Slateport skyline, the headland and far islands
    {
      const w = 900, h = 64, s = new ISpr(w, h);
      // headland (right)
      Paint.ridge(s, M, { ramp: M.hill, base: h, amp: 46, seed: 4, freq: 0.012, peaks: [[760, 160, 0.9], [620, 90, 0.4]] });
      for (let x = 0; x < 520; x++) for (let y = 0; y < h; y++) if (s.get(x, y)) s.set(x, y, 0);
      // city towers (left/middle)
      let x = 40;
      while (x < 520) {
        const bw = 8 + Math.floor(r() * 14), bh = 10 + Math.floor(r() * 40 * (x > 180 && x < 360 ? 1.2 : 0.6));
        for (let yy = h - bh; yy < h; yy++) for (let xx = x; xx < x + bw; xx++) {
          let c = xx === x ? M.city[3] : xx === x + bw - 1 ? M.city[0] : M.city[(yy % 4 === 0 && (xx - x) % 3 === 1) ? 2 : 1];
          s.set(xx, yy, c);
        }
        if (r() < 0.3) for (let yy = h - bh - 6; yy < h - bh; yy++) s.set(x + (bw >> 1), yy, M.city[1]);
        x += bw + Math.floor(r() * 4);
      }
      // far islands (left)
      const s2 = new ISpr(w, h);
      Paint.ridge(s2, M, { ramp: M.hill, base: h, amp: 14, seed: 9, freq: 0.03, peaks: [[20, 30, 0.8], [110, 40, 0.6]] });
      for (let xx = 0; xx < 160; xx++) for (let yy = 0; yy < h; yy++) { const v = s2.get(xx, yy); if (v && !s.get(xx, yy)) s.set(xx, yy, v); }
      A.layer(s, 0.03, { haze: 0.62, base: h - 1, x: -40 });
    }
    // sailboats and far rocks
    {
      const w = 1200, h = 40, s = new ISpr(w, h);
      for (const bx of [140, 470, 820, 1060]) {
        const sh = 14 + r() * 8;
        for (let y = 0; y < sh; y++) { const hw = Math.round((y / sh) * 6); for (let k = 0; k <= hw; k++) s.set(bx + k, h - 8 - sh + y, M.sail[k < hw - 1 ? 1 : 0]); }
        for (let k = -8; k <= 8; k++) { s.set(bx + k, h - 7, M.boatB[1]); if (Math.abs(k) < 7) s.set(bx + k, h - 6, M.boatB[0]); }
        for (let y = 0; y < sh; y++) s.set(bx - 1, h - 8 - sh + y, M.wood[1]);
      }
      A.layer(s, 0.14, { haze: 0.5, base: h - 5, x: 80 });
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
      const w = 1100, h = 150, FR = 150, s = new ISpr(w, h + FR);
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
    // foreground occluders: beach grass clumps and morning-glory vines in front of the beach, coral heads and kelp over the reef
    for (let x = -40; x < 1080; x += 70 + r() * 110) {
      const kind = r() < 0.7 ? 'grass' : 'leaf';
      const s = Paint.clump(kind === 'grass' ? M.grass : M.palmLeaf, 50 + r() * 40, 60 + r() * 40, Math.floor(x * 7), kind);
      A.foreItem(s, x, gy(x) + 58 + r() * 26, { p: 1.35, sway: 3, flip: r() < 0.5 });
    }
    for (let x = 1200; x < 3200; x += 120 + r() * 200) {
      if (gy(x) < SEA + 40) continue;
      const k = r();
      const s = k < 0.4 ? Props.coral(M, pick2(r, ['branch', 'fan', 'brain', 'table']), 50 + r() * 30, Math.floor(x)) : k < 0.75 ? Props.kelp(M, 100 + r() * 60, Math.floor(x), 1)[0] : Paint.rock(M, 60 + r() * 40, 30 + r() * 20, Math.floor(x), { ramp: M.rockU, moss: M.algae });
      A.foreItem(s, x, gy(x) + 50 + r() * 30, { p: 1.35, sway: k >= 0.4 && k < 0.75 ? 2 : 0, tint: 0xff3a1a08, dark: 0.35 });
    }
    A.foreHaze = 0; A.foreDark = 0.22; A.foreTint = 0xff2a1c14;
    // ---- hotspots ----
    A.addHot({ x0: 395, x1: 455, y0: gy(425) - 60, y1: gy(425), x: 425, reach: 40, tap() { A.umbrella.shake = 0.6; Game.sfx('boing', 425, 0.7); FX.sparkles(425, gy(425) - 50, 3, 20); } });
    A.addHot({ x0: 535, x1: 588, y0: gy(560) - 44, y1: gy(560), x: 560, reach: 40, tap() { A.castle.shake = 0.5; Game.sfx('dust', 560, 0.8); FX.poof(560, gy(560) - 20, 0xfff5dcab, 0xffdfb476, 6, 5); } });
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
    for (let y = y0; y < y1; y++) {
      const u = (y - hz) / Math.max(1, seaS - hz);
      const base = mix(far, near, Math.pow(u, 0.7));
      const row = y * W;
      const lines = 1 + Math.floor(u * 3);
      for (let x = 0; x < W; x++) {
        let c = base;
        const wx = x + cx * (0.1 + u * 0.9);
        // wave texture: dark troughs + bright glints, bigger nearer
        const wv = Math.sin(wx * (0.3 - u * 0.2) + y * 1.7 + t * (0.8 + u)) + Math.sin(wx * 0.071 - t * 0.6 + y * 0.9) * 0.6;
        if (wv > 1.25 - u * 0.2 && ((x + y) & 1)) c = mix(c, C.glint, 0.35 + u * 0.25);
        else if (wv < -1.3) c = mix(c, far, 0.35);
        // sun glitter path
        const ds = Math.abs(x - sunX) / (10 + u * 60);
        if (ds < 1 && hash(Math.floor(wx / 2), y, Math.floor(t * 4)) > 0.6 + ds * 0.35) c = mix(c, C.glint, 0.8 - ds * 0.5);
        d[row + x] = c;
      }
      if (u < 0.04) for (let x = 0; x < W; x++) d[row + x] = mix(d[row + x], Pal.LOOK[hr].hazeC, 0.5 - u * 10);
    }
    // sailboats + sandbar island on the sea, backdrop dunes on the land side
    Stage.drawLayer(fb, A.layers[1], cx, cy, t);
    Stage.drawLayer(fb, A.layers[2], cx, cy, t);
    // distant Wailord (behind the near backdrop)
    BeachAI.drawFarSea(fb, cx, cy, t, hz, seaS);
    Stage.drawLayer(fb, A.layers[3], cx, cy, t);
    BeachAI.checkFar(fb);
    // underwater backdrop below the surface line
    if (seaS < H) {
      const ys = Math.max(0, Math.round(seaS));
      for (let y = ys; y < H; y++) {
        const dep = y + cy - SEA;
        const k1 = clamp(dep / 260, 0, 1), k2 = clamp((dep - 260) / 520, 0, 1);
        const base = mix(mix(C.top, C.mid, k1), mix(C.deep, C.abyss, k2), k2 > 0 ? 1 : 0);
        const row = y * W;
        for (let x = 0; x < W; x++) {
          let c = base;
          if (k2 === 0 && bayer4(x, y) < (k1 * 4) % 1) c = mix(C.top, C.mid, Math.min(1, k1 + 0.25));
          d[row + x] = c;
        }
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
    const lx = 3285 - cx, ly = World.groundAt(3285) - 84 - cy;
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
  };
  def.spawn = (A, G) => BeachAI.spawn(A, G);
  def.weather = (hour) => ({ rain: 0, fog: hour === 'dawn' ? 0.25 : 0 });
  def.ambient = (hour, W) => {
    const out = [
      { kind: 'sparkle', rate: 1.6, c: hex('#ffffff'), life: 1.4, y: () => SEA - 4 - Math.random() * 30, sway: 2, bob: 1 },
      { kind: 'bubble', rate: 4, life: 5, vy: -18, y: () => SEA + 40 + Math.random() * 500, sway: 4, bob: 2 },
    ];
    if (hour === 'night' || hour === 'dusk') out.push({ kind: 'firefly', rate: 0.8, c: hex('#c8ff9a'), life: 7, y: () => 420 + Math.random() * 60, sway: 10, bob: 6 });
    if (hour === 'noon' || hour === 'afternoon') out.push({ kind: 'leaf', rate: 0.25, c: hex('#4ea044'), c2: hex('#80c45a'), life: 8, drift: 1, vy: 6, y: () => 380 + Math.random() * 60 });
    return out;
  };
  def.onScan = (A) => BeachAI.onScan(A);
  def.onSong = (x) => BeachAI.Secrets.song(x);
  def.onWater = (tx, ty) => { if (World.waterAt(tx) !== null) for (const m of Mons.all) if (m.splash) m.splash(tx); };
  def.onFood = (A, it) => { if (it.state === 'float') for (const m of Mons.all) if (m.splash && !it.claim) { m.splash(it.x, it); it.claim = m; } };
  def.photoBonus = (A, crop, subs, main) => BeachAI.photoBonus(A, crop, subs, main);
  return def;
})();
