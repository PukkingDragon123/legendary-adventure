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
    W: 10800, H: 1300, sea: SEA, refY: SEA, h0: 96, cy0: 290, ph: 0.06, skyH: 360, sunH: 150, band: 12, waves: 1.6,
    camY: [-40, 1300],
    start: 300,
    ground: [[0, 452], [90, 452], [170, 462], [240, 478], [320, 488], [460, 492], [640, 494], [800, 497], [900, 502], [1000, 509], [1100, 520], [1200, 535], [1300, 555], [1400, 580], [1500, 608], [1600, 638], [1700, 666], [1800, 690], [1900, 708], [2000, 714], [2150, 724], [2300, 740], [2450, 764], [2600, 800], [2750, 848], [2880, 900], [2980, 935], [3060, 940], [3160, 928], [3280, 896], [3400, 850], [3520, 792], [3640, 726], [3760, 656], [3860, 594], [3940, 544], [4000, 506], [4060, 486], [4200, 480], [4260, 470], [4320, 456], [4400, 444], [4520, 440], [4640, 441], [4680, 450], [4710, 464], [4750, 470], [4790, 464], [4820, 450], [4860, 441], [4960, 440], [4990, 452], [5020, 476], [5080, 482], [5140, 478], [5170, 456], [5200, 442], [5360, 436], [5500, 430], [5600, 432], [5700, 430], [5850, 428], [6100, 430], [6400, 432], [6700, 430], [7000, 428], [7300, 430], [7600, 432], [7900, 430], [8150, 434], [8280, 448], [8360, 476], [8440, 506], [8520, 532], [8660, 566], [8840, 604], [9060, 650], [9300, 706], [9560, 772], [9820, 846], [10060, 926], [10280, 1006], [10460, 1080], [10600, 1140], [10720, 1180], [10800, 1190]],
    water: [{ x0: 0, x1: 4020, level: SEA, kind: 'sea' }, { x0: 8400, x1: 10800, level: SEA, kind: 'sea' }, { x0: 4985, x1: 5180, level: 456, kind: 'pool' }],
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
  const SIN = new Float32Array(4096); for (let i = 0; i < 4096; i++) SIN[i] = Math.sin(i / 4096 * Math.PI * 2);
  const SINK = 4096 / (Math.PI * 2);
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
    // horizon: a smoking volcano island, a green headland with a lighthouse, and a hillside port town
    {
      const w = 1000, h = 84, s = new ISpr(w, h);
      // far volcano (left) with a smoke plume
      Paint.ridge(s, M, { ramp: M.far || M.hill, base: h, amp: 20, seed: 21, freq: 0.02, peaks: [[150, 150, 1.25]] });
      for (let k = 0; k < 26; k++) { const cx0 = 150 + k * 2.2 + Math.sin(k) * 3, cy0 = h - 64 - k * 1.5, rr = 3 + k * 0.28; for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr && hash(Math.round(cx0 + x), Math.round(cy0 + y), 4) > 0.25) s.set(Math.round(cx0 + x), Math.round(cy0 + y), M.sail[(y < 0 ? 1 : 0)]); }
      // rolling green hills behind the town, with a textured tree canopy
      const hill = new ISpr(w, h);
      Paint.treeline(hill, { ramp: M.hill, base: h - 18, size: 7, seed: 31, jag: 4 });
      for (let x = 0; x < w; x++) { const top = h - 22 - Math.max(0, Math.sin((x - 280) / 420 * Math.PI)) * 16; for (let y = Math.round(top); y < h; y++) if (x > 250 && x < 720) hill.set(x, y, Props.pick(M.hill, 0.75 - (y - top) / 30, x, y)); }
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { const v = hill.get(x, y); if (v && (x > 240 && x < 740)) s.set(x, y, v); }
      // port town: little houses stepping up the hill (coloured roofs, lit windows)
      const roofs = [M.roof, M.boatB || M.roof, M.city];
      for (let i = 0; i < 34; i++) {
        const hx = 290 + Math.floor(r() * 400), bw = 7 + Math.floor(r() * 7), bh = 5 + Math.floor(r() * 5);
        const top = h - 20 - Math.max(0, Math.sin((hx - 280) / 420 * Math.PI)) * 14 - Math.floor(r() * 6);
        const rp = roofs[i % 3];
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) s.set(hx + x, top - bh + y, x === bw - 1 ? M.wall[0] : (y % 3 === 1 && x % 3 === 1) ? M.win[0] : M.wall[2 - (x > bw / 2 ? 1 : 0)]);
        for (let y = 0; y < 3; y++) for (let x = -1 + y; x <= bw - y; x++) s.set(hx + x, top - bh - 3 + y, rp[(y === 2 ? 1 : 2)] ?? rp[0]);
      }
      // harbour wall + cranes + a church spire
      for (let x = 280; x < 720; x++) { s.set(x, h - 4, M.city[1]); s.set(x, h - 3, M.city[0]); }
      for (const cx1 of [610, 650]) { for (let y = 0; y < 18; y++) s.set(cx1, h - 4 - y, M.roof[1]); for (let x = 0; x < 12; x++) s.set(cx1 - 3 + x, h - 22, M.roof[1]); }
      for (let y = 0; y < 22; y++) { const hw = Math.max(0, Math.round((y - 6) * 0.2)); for (let x = -hw; x <= hw; x++) s.set(470 + x, h - 44 + y, y < 8 ? M.roof[0] : M.wall[1]); }
      // headland (right) with a forest cap and a red-and-white lighthouse
      const hd = new ISpr(w, h);
      Paint.ridge(hd, M, { ramp: M.hill, base: h, amp: 40, seed: 4, freq: 0.012, peaks: [[880, 150, 0.9], [760, 90, 0.4]] });
      for (let x = 740; x < w; x++) for (let y = 0; y < h; y++) { const v = hd.get(x, y); if (v) s.set(x, y, v); }
      const trees = new ISpr(w, h); Paint.treeline(trees, { ramp: M.hill, base: h - 30, size: 6, seed: 41, jag: 5 });
      for (let x = 760; x < w; x++) { let top = 0; while (top < h && !hd.get(x, top)) top++; for (let y = top; y < Math.min(h, top + 6); y++) if (trees.get(x, y) || y < top + 3) s.set(x, y, Props.pick(M.hill, 0.9 - (y - top) / 8, x, y)); }
      { let top = 0; while (top < h && !hd.get(900, top)) top++; for (let y = 0; y < 18; y++) for (let x = -2; x <= 2; x++) s.set(900 + x, top - 18 + y, Math.floor(y / 4) % 2 ? M.roof[2] : M.wall[3]); for (let x = -3; x <= 3; x++) s.set(900 + x, top - 19, M.ink[1]); s.set(900, top - 21, M.win[1]); s.set(899, top - 20, M.win[1]); s.set(901, top - 20, M.win[1]); A.farLight = [900, top - 20]; }
      A.layer(s, 0.03, { haze: 0.55, base: h - 1, x: -60 });
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
      const L = A.layer(s, 0.62, { haze: 0.14, base: h - 1, x: 2150 });
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
    const lx = 3962 - cx, ly = World.groundAt(3962) - 84 - cy;
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
