/* ------------------------------------------------------------------
   Fiery Path — Mt. Chimney, Route 113 and Lavaridge reimagined.
    · Ashen Slopes: volcanic ash drifts down like grey snow over ash-
      dusted grass and sooty trees; the cable car creeps up the smoking
      mountain behind. Numel graze, Spinda stagger about.
    · Lavaridge Hot Springs: a little spa town — a wooden bathhouse with
      lit lanterns, a steaming hot spring you can swim in, and steam
      vents that shoot Mudkip sky-high.
    · Jagged Pass: black basalt ledges with glowing cracks and little
      lava puddles where Slugma ooze.
    · Magma Crater: the ground drops into a bowl of molten lava. Something
      enormous sleeps in it... Four magma stones ring the crater: watch
      the lava pulse at them, then repeat the order (belly flop or tap).
------------------------------------------------------------------- */
Areas.volcano = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, mix, hex } = U;
  const SPRING = { x0: 1720, x1: 2060, level: 562 };
  const LAVA = { x0: 3930, x1: 4690, y: 626 }, PUDDLE = { x0: 3158, x1: 3242, y: 497 };
  const LAVAS = [LAVA, PUDDLE];
  const VENTS = [1540, 2190, 2470];
  const STONES = [3790, 3860, 4730, 4660];
  const BATH = 2330;
  const def = {
    id: 'volcano', name: 'Fiery Path', sub: 'Mt. Chimney · Lavaridge', music: 'ashen', seed: 77, noSeason: true,
    W: 4800, H: 1000, sea: null, refY: 560, h0: 116, cy0: 330, ph: 0.05, skyH: 300, sunH: 150, band: 12, waves: 0.5,
    camY: [-60, 860], frameY: 0.74, start: 220,
    intro: { x: 900, y: 300, dur: 3.4 },
    ground: [[0, 560], [200, 556], [500, 548], [800, 540], [1100, 534], [1350, 536], [1450, 546], [1600, 548], [1700, 552], [1728, 572], [1760, 600], [1840, 614], [1940, 614], [2020, 598], [2052, 572], [2080, 552], [2300, 548], [2600, 546], [2750, 548], [2850, 530], [2950, 508], [3050, 514], [3120, 486], [3150, 492], [3170, 506], [3230, 506], [3250, 474], [3350, 490], [3450, 462], [3560, 470], [3680, 474], [3760, 486], [3840, 500], [3900, 560], [3950, 632], [4050, 666], [4300, 680], [4550, 668], [4660, 634], [4710, 566], [4760, 512], [4800, 506]],
    water: [{ x0: SPRING.x0, x1: SPRING.x1, level: SPRING.level, kind: 'spring' }],
    plats: [{ x0: 2968, x1: 3036, y: 474, kind: 'ledge' }, { x0: 3392, x1: 3450, y: 428, kind: 'ledge' }],
    sky: {
      dawn: [[0, '#40406e'], [0.35, '#7a6a98'], [0.65, '#d49a96'], [0.85, '#f4b890'], [1, '#ffd0a0']],
      noon: [[0, '#4a78b0'], [0.4, '#7a9ec4'], [0.72, '#b8bec8'], [0.9, '#dccdb8'], [1, '#ecd8b8']],
      afternoon: [[0, '#4a6ea8'], [0.45, '#8a98b8'], [0.75, '#d0b89c'], [0.92, '#f0c890'], [1, '#ffd49a']],
      dusk: [[0, '#241a40'], [0.3, '#4a2a5a'], [0.55, '#9a3a4a'], [0.75, '#e8603a'], [0.9, '#ffa048'], [1, '#ffc870']],
      night: [[0, '#06040e'], [0.4, '#120a20'], [0.7, '#2a1024'], [0.9, '#5a1a1a'], [1, '#7a2a18']],
    },
    mats: {
      ink: ['#120c0c', '#1e1614'],
      ash: ['#4a4644', '#66605c', '#847c76', '#a49a92', '#c4bab0', '#e0d8ce'],
      ashG: ['#2e3a2a', '#465440', '#62705a', '#828e76', '#a8b09a'],
      soil: ['#1e1612', '#2c201a', '#3c2c22', '#50392a', '#664836'],
      rock: ['#14121a', '#221e26', '#322c34', '#443c44', '#5a5058', '#766a70'],
      rockR: ['#2a1410', '#442018', '#5e2e20', '#7a3e2a', '#9a5438'],
      stone: ['#5a4a3a', '#7a6650', '#9a8468', '#baa484', '#d8c4a4'],
      bark: ['#1e1612', '#2e221a', '#443226', '#5c4634'],
      leafA: ['#3a3836', '#55524e', '#747068', '#9a948a', '#c4bcb0'],
      wood: ['#3a2414', '#553820', '#74502e', '#946a40', '#b48552', '#d4a46c'],
      roof: ['#4a1a1a', '#6e2424', '#963230', '#bc4a3e', '#dc6a50'],
      wall: ['#8a7a66', '#aa9a82', '#cabaa0', '#e6d8bc', '#f8f0dc'],
      cloth: ['#1a2a5a', '#2a4a8a', '#4a74c0'],
      win: { c: ['#ffb050', '#ffe0a0'], emit: true },
      lava: { c: ['#8a1a08', '#c83a0c', '#f06a14', '#ffa028', '#ffd050', '#ffc038'], emit: true, cycle: true },
      ember: { c: ['#a82a0a', '#ff6a1a', '#ffc040'], emit: true },
      crack: { c: ['#6a1406', '#d24a10', '#ff8a28'], emit: true },
      steam: ['#b8b4b0', '#d8d4d0', '#f4f0ec'],
      far: ['#3a3444', '#4e4656', '#645a6a', '#7c7282', '#968a9a'],
      mid: ['#2a2226', '#3a3034', '#4c4044', '#605256', '#78686a'],
      smoke: ['#5a524e', '#7a726c', '#9a928a', '#bab2aa'],
      flower: ['#c8406a', '#ff7aa0', '#ffd0e0'],
      herb: ['#2a5a2a', '#3a7a34', '#5aa048', '#8ac868'],
    },
  };
  def.cycleRate = 5;
  def.waterCols = (hour) => {
    const night = hour === 'night';
    return { top: night ? hex('#2a5a5a') : hex('#7ad0c0'), mid: night ? hex('#163a3c') : hex('#3a9a90'), deep: night ? hex('#0a2224') : hex('#1e5a58'), foam: hex('#f4fff8'), hi: night ? hex('#9ae0d0') : hex('#e0fff4'), ray: null, maxD: 90 };
  };
  const S = { ash: [], smoke: [], vents: VENTS.map((x, i) => ({ x, t: 1.5 + i * 1.3, on: 0 })), seq: [], input: [], showT: 0, showI: -1, solved: false, flash: 0, lit: [0, 0, 0, 0], burnCool: 0 };
  const lavaAt = (x) => LAVAS.find((L) => x > L.x0 && x < L.x1 && World.groundAt(x) > L.y + 1) || null;
  def.hazardAt = (x) => !!lavaAt(x);
  const n1 = (x, y) => Terrain.n1(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n2 = (x, y) => Terrain.n2(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff);
  const pickR = (ramp, t, x, y) => Terrain.pickR(ramp, t, x, y);

  /* ---------------- painters ---------------- */
  function bathhouse(M) {
    const w = 150, h = 96, s = new ISpr(w + 20, h + 40), base = h + 36;
    // stone foundation, timber walls with lit windows, a deep red tiled roof with upturned eaves
    for (let y = base - 10; y < base; y++) for (let x = 6; x < w + 14; x++) s.set(x, y, pickR(M.stone, 0.6 - (y - base + 10) * 0.05 + (hash(x >> 2, y >> 1, 3) - 0.5) * 0.3, x, y));
    for (let y = base - 58; y < base - 10; y++) for (let x = 14; x < w + 6; x++) { const post = (x - 14) % 34 < 4; s.set(x, y, post ? pickR(M.wood, 0.3, x, y) : pickR(M.wall, 0.75 - (x - 14) / w * 0.3, x, y)); }
    for (let k = 0; k < 4; k++) { const wx = 24 + k * 34; for (let y = base - 48; y < base - 30; y++) for (let x = wx; x < wx + 18; x++) s.set(x, y, x === wx || x === wx + 17 || y === base - 48 || y === base - 31 || (x - wx) === 9 ? M.wood[1] : M.win[y < base - 40 ? 1 : 0]); }
    // noren curtain over the door
    for (let y = base - 30; y < base - 10; y++) for (let x = 66; x < 96; x++) s.set(x, y, y < base - 22 ? M.cloth[((x - 66) >> 2) % 2 ? 1 : 2] : (x % 4 === 0 ? M.cloth[0] : M.ink[1]));
    for (let y = 0; y < 30; y++) { const hw = (w / 2 + 12) * (0.45 + y / 30 * 0.55); for (let x = -hw; x <= hw; x++) s.set(w / 2 + 10 + x, base - 58 - 30 + y, pickR(M.roof, 0.85 - y / 34 - (Math.abs(x) / hw) * 0.2 + ((Math.round(x) + y * 3) % 6 === 0 ? -0.2 : 0), x, y)); }
    for (let x = 0; x < 10; x++) { s.set(x, base - 58 - 2 - (10 - x) * 0.6, M.roof[3]); s.set(w + 19 - x, base - 58 - 2 - (10 - x) * 0.6, M.roof[3]); }
    // the ♨ sign
    for (let y = base - 76; y < base - 64; y++) for (let x = w / 2; x < w / 2 + 20; x++) s.set(x, y, x === w / 2 || x === w / 2 + 19 || y === base - 76 || y === base - 65 ? M.wood[0] : M.wall[4]);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) s.set(w / 2 + 5 + k * 5 + Math.round(Math.sin(j * 1.4 + k) * 1), base - 74 + j, M.roof[2]);
    Paint.outline(s, M.ink[0]);
    s.ax = (w + 20) >> 1; s.ay = base - 1;
    return s;
  }
  function hut(M, w, h, seed) {
    const s = new ISpr(w + 12, h + 24), base = h + 22, r = rng(seed);
    for (let y = base - h; y < base; y++) for (let x = 6; x < w + 6; x++) s.set(x, y, pickR(M.wall, 0.8 - (x - 6) / w * 0.35 + (y > base - 4 ? -0.3 : 0), x, y));
    const wx = 10 + Math.floor(r() * (w - 26)); for (let y = base - h + 8; y < base - h + 20; y++) for (let x = wx; x < wx + 12; x++) s.set(x, y, x === wx || x === wx + 11 || y === base - h + 8 ? M.wood[1] : M.win[1]);
    for (let y = 0; y < 18; y++) { const hw = w / 2 + 6 - y * 0.0; for (let x = -hw * (0.4 + y / 30); x <= hw * (0.4 + y / 30); x++) s.set(w / 2 + 6 + x, base - h - 18 + y, pickR(M.roof, 0.85 - y / 22, x, y)); }
    Paint.outline(s, M.ink[0]);
    s.ax = (w + 12) >> 1; s.ay = base - 1;
    return s;
  }
  function ashTree(M, H, seed) { return Paint.tree(M, H, seed, { trunkRamp: M.bark, leafRamp: M.leafA, crownW: H * 0.8, crownH: H * 0.5, trunkW: Math.max(3, H * 0.06) }); }
  function stoneSpr(M, i, lit) {
    const w = 22, h = 26, s = new ISpr(w + 2, h + 2);
    for (let y = 0; y < h; y++) { const hw = w / 2 - (y < 5 ? (5 - y) * 1.2 : 0); for (let x = -hw; x <= hw; x++) s.set(w / 2 + 1 + x, y + 1, pickR(M.rock, 0.65 - (x + hw) / (2 * hw) * 0.4 - y / h * 0.2, x, y)); }
    // carved rune: a flame, a drop, a leaf, a sun — each lights in its colour
    const C = lit ? M.lava[4] : M.rock[5], cx = w / 2 + 1, cy = 12;
    const R = [[[0, -5], [-2, -2], [2, -2], [-3, 1], [3, 1], [0, 3], [-1, 0], [1, 0]], [[0, -5], [-1, -3], [1, -3], [-2, -1], [2, -1], [-2, 1], [2, 1], [0, 3], [-1, 2], [1, 2]], [[-3, 3], [-2, 2], [-1, 1], [0, 0], [1, -1], [2, -2], [3, -3], [0, -2], [2, 0], [-1, -1], [1, 1]], [[0, 0], [0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, 3], [-3, 3], [3, -3], [-1, 0], [1, 0], [0, -1], [0, 1]]][i];
    for (const [dx, dy] of R) s.set(cx + dx, cy + dy, C);
    Paint.outline(s, M.ink[0]);
    s.ax = (w >> 1) + 1; s.ay = h;
    return s;
  }
  function shelf(M, w, h, seed) {
    const s = new ISpr(w + 6, h + 2);
    for (let x = 0; x < w; x++) { const bot = h - 4 - Math.sin(x / w * Math.PI) * 6 + (n1(x * 3 + seed, 1) - 0.5) * 8; for (let y = 0; y < bot; y++) s.set(x + 3, y, y < 2 ? M.ash[3] : pickR(M.rock, 0.7 - y / Math.max(10, bot) * 0.5 + (n2(x * 2 + seed, y * 2) - 0.5) * 0.3, x, y)); if (hash(x, 3, seed) > 0.85) s.set(x + 3, 3 + (x % 5), M.crack[1]); }
    Paint.outline(s, M.ink[0]);
    s.ax = 3; s.ay = 0;
    return s;
  }

  /* ---------------- build ---------------- */
  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const gy = (x) => World.groundAt(x);
    const inSpring = (x) => x > SPRING.x0 + 14 && x < SPRING.x1 - 14;
    const zone = (x) => (x < 1450 ? 'ash' : x < 2780 ? 'town' : x < 3720 ? 'pass' : 'crater');
    // ---- terrain ----
    Terrain.paint(A, {
      bb: 7, bf: 5,
      strip(x, y, u, e) {
        const z = zone(x), n = e.n2(x, y * 3), n1v = e.n1(x, y);
        if (inSpring(x)) return e.pickR(M.stone, 0.4 + (n - 0.5) * 0.4, x, y);
        let t = 0.62 - u * 0.36 + (n - 0.5) * 0.35;
        if (u < 0.15) t += 0.2;
        if (z === 'ash') { if (n1v > 0.6) return e.pickR(M.ashG, t, x, y); if (e.hash(x, y, 7) > 0.96) return M.rock[3]; return e.pickR(M.ash, t + 0.1, x, y); }
        if (z === 'town') { const tile = ((x >> 3) + (y >> 1)) % 2; if (Math.abs(x - BATH) < 120 || (x > 1560 && x < 1700)) return e.pickR(M.stone, t + (tile ? 0.08 : -0.05), x, y); if (n1v > 0.62) return e.pickR(M.herb, t, x, y); return e.pickR(M.ash, t, x, y); }
        if (e.hash(x, y, 9) > 0.985) return M.crack[1];
        return e.pickR(z === 'crater' ? M.rockR : M.rock, t + 0.1, x, y);
      },
      face(x, y, dep, e) {
        const n1v = e.n1(x, y), n2v = e.n2(x, y);
        if (dep <= 1) return M.soil[0];
        const z = zone(x);
        const band = (dep + n1v * 12) / 16, bi = Math.floor(band);
        let t = 0.62 - Math.min(0.5, dep / 220) - (bi % 3 === 1 ? 0.12 : 0) + (n2v - 0.5) * 0.25;
        if (band - bi < 0.1) t -= 0.12;
        if ((z === 'pass' || z === 'crater') && dep > 6) {
          // glowing magma veins through the black rock
          const v = Math.abs(Math.sin(x * 0.043 + Math.sin(y * 0.05) * 2.2 + n1v * 3) + Math.sin(y * 0.031 - x * 0.012));
          if (v < 0.05) return M.crack[2]; if (v < 0.11) return M.crack[1];
          return e.pickR(z === 'crater' ? M.rockR : M.rock, t, x, y);
        }
        if (z === 'ash' && dep < 5) return e.pickR(M.ash, 0.5, x, y);
        return e.pickR(M.soil, t, x, y);
      },
    });
    for (let k = 0; k < 70; k++) { const x = r() * A.W; Terrain.stamp(A, Paint.rock(M, 6 + r() * 9, 4 + r() * 5, k, { ramp: M.rock, flat: false, cracks: 0 }), x, gy(x) + 16 + r() * 90); }
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    // ---- Ashen Slopes ----
    for (let x = 40; x < 1440; x += 60 + r() * 120) { const k = r(); if (k < 0.16) put(ashTree(M, 70 + r() * 50, Math.floor(x)), x, -5, { sink: 4, foot: 16 }); else if (k < 0.7) put(Paint.tuft(M, 12 + r() * 12, 12 + r() * 14, Math.floor(x), { ramp: M.ashG }), x, r() < 0.5 ? 3 : -3, { windFrames: true }); else put(Paint.rock(M, 16 + r() * 22, 10 + r() * 12, Math.floor(x), { ramp: M.rock }), x, r() < 0.5 ? 2 : -3, { sink: 3 }); }
    for (let x = 300; x < 1200; x += 9 + r() * 10) if (r() < 0.5) put(Paint.tuft(M, 14, 18 + r() * 12, Math.floor(x * 3), { ramp: M.ashG, density: 1.1 }), x, r() < 0.5 ? 2 : -2, { windFrames: true });
    // the glass workshop
    A.glassHut = put(hut(M, 70, 44, 5), 980, -4, { sink: 2 });
    A.glows.push({ x: 980, y: gy(980) - 30, r: 30, c: hex('#ffb050'), a: 0.4, flicker: true });
    // ---- Lavaridge ----
    A.bath = put(bathhouse(M), BATH, -5, { sink: 2 });
    for (const [x, w] of [[1500, 64], [2640, 72]]) { put(hut(M, w, 46, x), x, -5, { sink: 2 }); A.glows.push({ x, y: gy(x) - 32, r: 26, c: hex('#ffc060'), a: 0.4, flicker: true }); }
    A.glows.push({ x: BATH, y: gy(BATH) - 40, r: 60, c: hex('#ffb050'), a: 0.45, flicker: true });
    for (let x = SPRING.x0 - 30; x < SPRING.x1 + 40; x += 22 + r() * 30) if (!inSpring(x)) put(Paint.rock(M, 12 + r() * 10, 8 + r() * 6, Math.floor(x), { ramp: M.stone }), x, r() < 0.5 ? 3 : -2, { sink: 3 });
    for (const x of [1640, 2120, 2560]) put(Paint.bush(M, 22, 14, Math.floor(x), { ramp: M.herb, dots: M.flower, nd: 6 }), x, -3, { sink: 2 });
    A.glows.push({ x: (SPRING.x0 + SPRING.x1) / 2, y: SPRING.level - 4, r: 150, flat: 4, c: hex('#9af0e0'), a: 0.18, always: true });
    // steam vents
    for (const x of VENTS) { const s = Paint.rock(M, 18, 8, Math.floor(x), { ramp: M.stone }); put(s, x, 1, { sink: 2 }); }
    // ---- Jagged Pass ----
    for (const p of def.plats) A.props.push({ frames: [shelf(M, p.x1 - p.x0, gy((p.x0 + p.x1) / 2) - p.y + 6, p.x0)], x: p.x0, y: p.y, zd: -3 });
    for (let x = 2800; x < 3720; x += 50 + r() * 90) { if (x > PUDDLE.x0 - 10 && x < PUDDLE.x1 + 10) continue; put(Paint.rock(M, 20 + r() * 30, 14 + r() * 22, Math.floor(x), { ramp: r() < 0.5 ? M.rock : M.rockR, cracks: 2 }), x, r() < 0.5 ? -3 : 2, { sink: 4 }); }
    A.glows.push({ x: (PUDDLE.x0 + PUDDLE.x1) / 2, y: PUDDLE.y, r: 60, flat: 2.2, c: hex('#ff7020'), a: 0.5, always: true, flicker: true });
    // ---- the crater ----
    S.stoneSpr = [0, 1, 2, 3].map((i) => [stoneSpr(M, i, false), stoneSpr(M, i, true)]);
    A.stones = STONES.map((x, i) => put(S.stoneSpr[i][0], x, -2, { sink: 2 }));
    A.glows.push({ x: (LAVA.x0 + LAVA.x1) / 2, y: LAVA.y, r: 420, flat: 2.6, c: hex('#ff5a10'), a: 0.55, always: true, flicker: true });
    for (let x = 3740; x < A.W - 20; x += 90 + r() * 120) if (!(x > LAVA.x0 - 30 && x < LAVA.x1 + 30)) put(Paint.rock(M, 18 + r() * 20, 12 + r() * 14, Math.floor(x), { ramp: M.rockR }), x, -3, { sink: 3 });
    // micro detail
    const det = (key, ramp, x, zd) => { const s = Paint.miniSpr(key, ramp); A.details.push({ s, x, y: gy(x) + zd, zd }); };
    for (let x = 10; x < A.W; x += 5 + r() * 12) { if (inSpring(x) || lavaAt(x)) continue; const k = r(), zd = (r() - 0.5) * 10, z = zone(x); if (k < 0.25) det('pebble2', z === 'ash' ? M.ash : M.rock, x, zd); else if (k < 0.35 && z !== 'crater') det('twig', M.bark, x, zd); else if (k < 0.42 && z === 'town') det('flower', M.flower, x, zd); else if (k < 0.5 && z !== 'ash') det('pebble', M.rockR, x, zd); }

    /* ---- backdrop ---- */
    // Mt. Chimney: a great ashen cone with its crater, and the cable-car wire
    {
      const w = 900, h = 130, s = new ISpr(w, h);
      S.peakU = 470;
      Paint.ridge(s, M, { ramp: M.far, base: h, amp: 104, seed: 7, freq: 0.004, peaks: [[S.peakU, 320, 1], [120, 200, 0.4], [800, 220, 0.45]], pow: 1.2 });
      // the crater notch and a glowing lip
      for (let x = S.peakU - 22; x < S.peakU + 22; x++) { const d = 1 - Math.abs(x - S.peakU) / 22, top = h - 104 * 0.98 + d * 9; for (let y = 0; y < top; y++) if (s.get(x, y)) s.set(x, y, 0); s.set(x, Math.round(top), M.ember[1]); }
      // ash streaks down the slopes
      for (let k = 0; k < 40; k++) { let x = S.peakU + (r() - 0.5) * 240, y = h - 96 + r() * 30; for (let j = 0; j < 24; j++) { if (s.get(x, y)) s.set(x, y, M.far[4]); x += (x < S.peakU ? -1 : 1) * 0.7; y += 1.3; } }
      const L = A.layer(s, 0.04, { haze: 0.5, base: h - 1, x: -80 }); L.skirt = M.far[2]; S.farL = L;
    }
    // jagged volcanic hills with ashy tree lines
    {
      const w = 1500, h = 80, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.mid, base: h, amp: 46, seed: 19, freq: 0.012, pow: 1.1 });
      const tl = new ISpr(w, h); Paint.treeline(tl, { ramp: M.leafA, base: h - 14, size: 7, seed: 21, jag: 4 });
      for (let i = 0; i < tl.d.length; i++) if (tl.d[i] && (i % w) < 700) s.d[i] = tl.d[i];
      const L = A.layer(s, 0.18, { haze: 0.4, base: h - 1, x: 0 }); L.skirt = M.mid[1];
    }
    // Lavaridge rooftops and steam in the middle distance
    {
      const w = 2200, h = 110, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.mid, base: h, amp: 50, seed: 33, freq: 0.01 });
      for (let k = 0; k < 9; k++) { const x = 600 + k * 70 + r() * 20, hs = hut(M, 30 + r() * 20, 18 + r() * 10, 90 + k); s.paste(hs, Math.round(x - hs.ax), h - hs.h - 4); }
      for (let x = 0; x < w; x += 40 + r() * 70) { const tr = ashTree(M, 40 + r() * 30, Math.floor(x * 7)); s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 3); }
      const L = A.layer(s, 0.34, { haze: 0.28, base: h - 1, x: 20 }); L.skirt = M.mid[2];
    }
    // near basalt wall with lava falls far to the right
    {
      const w = 3200, h = 120, s = new ISpr(w, h);
      Paint.ridge(s, M, { ramp: M.rock, base: h, amp: 64, seed: 45, freq: 0.009, peaks: [[2500, 400, 1]] });
      for (let x = 0; x < 1100; x += 110 + r() * 150) { const tr = ashTree(M, 50 + r() * 30, Math.floor(x * 11)); s.paste(tr, Math.round(x - tr.ax), h - tr.ay - 2); }
      for (const fx of [2280, 2560, 2700]) for (let y = 40; y < h; y++) { const top = s.get(fx, y); if (!top) continue; for (let q = -2; q <= 2; q++) s.set(fx + q + Math.round(Math.sin(y * 0.1) * 1.2), y, M.lava[(y + q) % 6 < 3 ? 3 : 4]); }
      const L = A.layer(s, 0.52, { haze: 0.18, base: h - 1, x: 0 }); L.skirt = M.rock[1];
    }
    // ---- 2.5D floor: ash fields, the warm stones of Lavaridge, black basalt and a lava lake reaching back ----
    {
      A.depthP0 = 0.55; A.depthHaze = 0.2;
      A.floor = { p0: 0.55, D: 120,
        row(wz, p, t) { return { tq: Math.floor(t * 3), t }; },
        tex(wx, wz, p, t, R) {
          const n = Stage.noiseAt(wx * 0.4, wz * 1.2), n2v = Stage.noiseAt(wx * 1.7 + 50, wz * 3.1);
          if (wx < 1450) { if (n > 0.66) return M.ashG[n > 0.74 ? 3 : 2]; if (n2v > 0.9) return M.rock[3]; return M.ash[n < 0.3 ? 2 : n > 0.55 ? 4 : 3]; }
          if (wx < 2780) { const k = (1 - p) / 0.45, sp = Math.abs(wx - 1890) < 170 * (1 - k * 0.8) && k < 0.9; if (sp) return n2v > 0.8 ? M.steam[2] : M.stone[1]; if (n > 0.64) return M.herb[2]; return M.stone[n2v > 0.5 ? 3 : 2]; }
          // basalt with glowing cracks; the lava lake stretches into the distance
          const lk = Math.abs(wx - 4310) < 360 * (1 - (1 - p) * 0.7);
          if (wx > 3860 && lk) { const f = Math.sin(wx * 0.05 + wz * 0.3 + R.t * 1.5) + Math.sin(wx * 0.013 - wz * 0.2 - R.t * 0.8); return f > 1.2 ? M.lava[5] : f > 0.3 ? M.lava[3] : f > -0.6 ? M.lava[2] : M.lava[1]; }
          const v = Math.abs(Math.sin(wx * 0.07 + n * 6) + Math.sin(wz * 0.4 - wx * 0.01));
          if (v < 0.06) return M.crack[2];
          return (wx > 3720 ? M.rockR : M.rock)[n < 0.35 ? 2 : n > 0.6 ? 4 : 3];
        } };
      const r2 = rng(3131);
      const place = (make, n, p0, p1, xr) => { for (let i = 0, g = 0; i < n && g < n * 25; g++) { const p = p0 + r2() * (p1 - p0), wx = xr[0] + r2() * (xr[1] - xr[0]); if (wx > 3860 && Math.abs(wx - 4310) < 400) continue; if (make(p, wx, i)) i++; } };
      place((p, wx, i) => A.scatterAt(ashTree(M, Math.round((60 + r2() * 40) * p), 4000 + i), wx, p), 7, 0.57, 0.9, [0, 1500]);
      place((p, wx, i) => A.scatterAt(Paint.tuft(M, Math.round((10 + r2() * 10) * p), Math.round((10 + r2() * 12) * p), 4100 + i, { ramp: M.ashG }), wx, p, { windFrames: true }), 60, 0.58, 0.98, [0, 1500]);
      place((p, wx, i) => A.scatterAt(Paint.rock(M, Math.round((14 + r2() * 26) * p), Math.round((9 + r2() * 18) * p), 4200 + i, { ramp: wx > 3700 ? M.rockR : M.rock, cracks: 1 }), wx, p), 50, 0.56, 0.98, [0, A.W]);
      place((p, wx, i) => A.scatterAt(hut(M, Math.round(60 * p), Math.round(38 * p), 4300 + i), wx, p), 5, 0.6, 0.75, [1500, 2700]);
      place((p, wx, i) => A.scatterAt(Paint.bush(M, Math.round(20 * p), Math.round(12 * p), 4400 + i, { ramp: M.herb, dots: M.flower, nd: 3 }), wx, p), 16, 0.6, 0.95, [1500, 2750]);
    }
    // ---- foreground ----
    for (let x = -60; x < A.W; x += 150 + r() * 170) {
      if (x > LAVA.x0 && x < LAVA.x1) continue;
      let s = x < 2780 ? Paint.clump(x < 1450 ? M.ashG : M.herb, 50 + r() * 40, 60 + r() * 30, Math.floor(x * 11), 'grass', { n: 11 }) : Paint.rock(M, 60 + r() * 40, 40 + r() * 30, Math.floor(x), { ramp: M.rock, cracks: 3 });
      s = Paint.edge(s, M.ink[0]);
      A.foreItem(s, x, gy(x) + 62 + r() * 24, { p: 1.35, sway: x < 2780 ? 2 : 0, flip: r() < 0.5 });
    }
    A.foreDark = 0.25; A.foreTint = 0xff0a0a1a;
    // ---- hotspots ----
    A.addHot({ x0: 950, x1: 1010, y0: gy(980) - 50, y1: gy(980), x: 980, reach: 50, tap() { const n = Save.data.stats.soot || 0; HUD.toast(n >= 30 ? 'The glassblower made you a little glass flute from your ash! (It whistles.)' : 'The glass workshop. "Collect volcanic ash by walking through the ashy grass and I will make you something!" (' + n + '/30)', { life: 3.2 }); if (n >= 30 && Save.discover('volcano.flute')) { Save.addPoints(500); Game.sfx('reward'); } } });
    A.addHot({ x0: BATH - 70, x1: BATH + 70, y0: gy(BATH) - 90, y1: gy(BATH), x: BATH, reach: 60, tap() { HUD.toast('Lavaridge Bathhouse: "Soak in the spring out back — it\'s good for tired fins!"', { life: 3 }); } });
    STONES.forEach((x, i) => A.addHot({ x0: x - 12, x1: x + 12, y0: gy(x) - 28, y1: gy(x), x, reach: 34, tap() { stoneHit(i); } }));
  };

  /* ---------------- the Magma Stones puzzle ---------------- */
  function newSeq() { S.seq = [0, 1, 2, 3].sort(() => Math.random() - 0.5); S.input = []; }
  function showSeq() { if (S.solved) return; if (!S.seq.length) newSeq(); S.showT = 0; S.showI = 0; Game.sfx('lava', 4300, 0.9); }
  function stoneHit(i) {
    if (S.solved) { HUD.toast('The magma stones are warm and quiet now.', { life: 2 }); return; }
    if (S.showI >= 0) return;
    if (!S.seq.length) { showSeq(); HUD.toast('The lava lake bubbles... watch which stones it lights!', { life: 2.6 }); return; }
    S.lit[i] = 0.8; Game.sfx('knock', STONES[i], 0.9);
    FX.sparkles(STONES[i], World.groundAt(STONES[i]) - 16, 8, 14, 0xffffffff, hex('#ffa028'));
    S.input.push(i);
    const k = S.input.length - 1;
    if (S.input[k] !== S.seq[k]) { Game.sfx('error'); Game.shake(2); HUD.toast('The lava hisses angrily. Watch again...', { life: 2 }); S.input = []; setTimeout(showSeq, 900); return; }
    if (S.input.length === 4) solved();
  }
  function solved() {
    S.solved = true; S.flash = 1; Save.discover('volcano.stones'); Save.addPoints(800);
    Game.shake(6); Game.sfx('rumble', 4300, 1); setTimeout(() => Game.sfx('reward'), 800);
    if (Game.cine) Game.cine.pan(4310, LAVA.y - 70, { hold: 2.8, zoom: 1.1 });
    if (!Save.itemN('redorb')) { Save.addItem('redorb', 1); HUD.toast('The Red Orb rose out of the lava! Something deep in the magma stirs...', { life: 4 }); }
    if (typeof Legends !== 'undefined' && Legends.wakeGroudon) setTimeout(() => Legends.wakeGroudon(), 1400);
  }
  def.onPound = (x) => { const i = STONES.findIndex((sx) => Math.abs(sx - x) < 16); if (i >= 0) stoneHit(i); };

  /* ---------------- drawing ---------------- */
  def.drawBack = (A, fb, cx, cy, t) => {
    Stage.drawSky(fb, cx, cy, t);
    Stage.drawLayer(fb, A.layers[0], cx, cy, t);
    // the smoke plume pouring from Mt. Chimney (lit red from below at night)
    const L = S.farL, sx = Math.round(L.x - cx * L.p + S.peakU), sy = Stage.layerY(L, cy) + 18;
    const W = fb.w, H = fb.h, d = fb.d, night = Stage.S.hour === 'night' || Stage.S.hour === 'dusk';
    const cS = hex(night ? '#5a3a3a' : '#9a928a'), cL = hex(night ? '#c05a2a' : '#d8d0c6');
    for (let k = 0; k < 26; k++) {
      const age = ((t * 0.06 + k / 26) % 1), px = sx + Math.sin(k * 1.7 + t * 0.2) * 8 + age * 90 + age * age * 60, py = sy - age * 150, rr = 6 + age * 26;
      for (let y = Math.max(0, Math.floor(py - rr)); y < Math.min(H, py + rr); y++) for (let x = Math.max(0, Math.floor(px - rr)); x < Math.min(W, px + rr); x++) {
        const q = Math.hypot(x - px, (y - py) * 1.2) / rr; if (q > 1) continue;
        const a = (1 - q) * (1 - age) * 0.55;
        if (a > bayer4(x, y) * 0.5) d[y * W + x] = mix(d[y * W + x], y > py ? cS : cL, Math.min(0.85, a * 1.4));
      }
    }
    // cable car creeping along its wire
    const wx0 = Math.round(L.x - cx * L.p + 60), wx1 = sx - 30, wy0 = Stage.layerY(L, cy) + 150, wy1 = sy + 26;
    UI.line(fb, wx0, wy0, wx1, wy1, hex('#2a2430'));
    const ck = (t * 0.02) % 1, gx = Math.round(lerp(wx0, wx1, ck)), gyy = Math.round(lerp(wy0, wy1, ck));
    for (let y = gyy + 2; y < gyy + 7; y++) for (let x = gx - 3; x <= gx + 3; x++) UI.put(fb, x, y, y === gyy + 3 ? hex('#ffe0a0') : hex('#c84a3a'));
    UI.put(fb, gx, gyy + 1, hex('#2a2430'));
    for (let i = 1; i < A.layers.length; i++) Stage.drawLayer(fb, A.layers[i], cx, cy, t);
    Stage.drawDepthFrom(fb, cx, cy, t, 0.5);
  };
  // lava drawn over the lane (so whatever stands in it is half-submerged)
  function drawLava(fb, cx, cy, t, L) {
    const W = fb.w, H = fb.h, d = fb.d, pal = Stage.framePal(0, t), M = Game.area.M;
    const x0 = Math.max(0, Math.floor(L.x0 - cx)), x1 = Math.min(W, Math.ceil(L.x1 - cx));
    for (let x = x0; x < x1; x++) {
      const wx = x + cx, g = World.groundAt(wx);
      if (g <= L.y + 1) continue;
      const surf = L.y + Math.sin(wx * 0.08 + t * 1.6) * 1.2;
      const y0 = Math.max(0, Math.round(surf - cy)), y1 = Math.min(H, Math.round(g - cy) + 6);
      for (let y = y0; y < y1; y++) {
        const dep = y + cy - surf, i = y * W + x;
        const f = Math.sin(wx * 0.06 + (y + cy) * 0.11 - t * 1.2) + Math.sin(wx * 0.021 - t * 0.5 + (y + cy) * 0.05) * 0.8;
        let c;
        if (dep < 1.5) c = pal[M.lava[5]];
        else if (f > 1.1) c = pal[M.lava[4]]; else if (f > 0.1) c = pal[M.lava[3]]; else if (f > -0.9) c = pal[M.lava[2]]; else c = pal[M.lava[1]];
        // a dark cooling crust drifting on top
        if (dep < 10 && Stage.noiseAt(wx * 0.5 + t * 3, dep * 2 + t) > 0.72) c = mix(c, 0xff0a0a20, 0.7);
        d[i] = dep > 3 ? mix(c, d[i], Math.min(0.25, dep / 80)) : c;
      }
    }
    // bubbles popping
    if (Math.random() < 0.25) { const bx = rnd2(L.x0 + 20, L.x1 - 20); if (World.groundAt(bx) > L.y + 6) { FX.add({ type: 'ring', x: bx, y: L.y, r0: 1, r1: 6, flat: 0.4, life: 0.5, c: hex('#ffe070'), layer: 2 }); for (let k = 0; k < 4; k++) FX.add({ type: 'drop', x: bx, y: L.y - 1, vx: rnd2(-30, 30), vy: -rnd2(40, 90), g: 380, life: 0.6, c: hex('#ffc040'), c2: hex('#ff5a10'), size: 1, floor: L.y, layer: 2 }); if (Math.random() < 0.2) Game.sfx('lava', bx, 0.3); } }
  }
  const rnd2 = (a, b) => a + Math.random() * (b - a);
  def.drawFront = (A, fb, cx, cy, t) => { for (const L of LAVAS) drawLava(fb, cx, cy, t, L); };
  def.post = (A, fb, cx, cy, t) => {
    const W = fb.w, H = fb.h, d = fb.d;
    // falling ash on the slopes, rising embers near the magma
    for (const p of S.ash) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy); if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (p.k === 'ash') { d[i] = mix(d[i], 0xffd0ccc8, 0.85); if (p.big) { d[i + 1] = mix(d[i + 1], 0xffb0aca8, 0.7); d[i + W] = mix(d[i + W], 0xffa8a4a0, 0.6); } }
      else { const a = Math.min(1, p.life * 2); d[i] = U.screen(d[i], 0xff3a9aff, a); d[i - W] = U.screen(d[i - W], 0xff2a6aff, a * 0.5); }
    }
    // heat shimmer above the lava
    const lx0 = Math.max(0, Math.floor(LAVA.x0 - cx)), lx1 = Math.min(W, Math.ceil(LAVA.x1 - cx)), ly1 = Math.min(H, Math.round(LAVA.y - cy)), ly0 = Math.max(0, ly1 - 60);
    if (lx1 > lx0 && ly1 > 0) {
      const row = new Uint32Array(W);
      for (let y = ly0; y < ly1; y++) {
        const k = (y - ly0) / 60, off = Math.round(Math.sin(y * 0.6 + t * 8) * 1.4 * k);
        if (!off) continue;
        for (let x = lx0; x < lx1; x++) row[x] = d[y * W + clamp(x + off, 0, W - 1)];
        for (let x = lx0; x < lx1; x++) d[y * W + x] = row[x];
      }
    }
    if (S.flash > 0) { S.flash = Math.max(0, S.flash - 1 / 80); const k = Math.round(S.flash * 110); for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xff60c0ff, k); }
  };
  def.spawn = (A, G) => {
    S.ash.length = 0; S.seq = []; S.input = []; S.showI = -1; S.solved = Save.found('volcano.stones');
    if (typeof VolcanoAI !== 'undefined') VolcanoAI.spawn(A, G, { SPRING, LAVA, PUDDLE, BATH });
  };
  def.update = (A, dt, t, G) => {
    const mk = G.mudkip, cx = Game.cam.x, cy = Game.cam.y, VW = Game.VW, VH = Game.VH;
    // ash + embers
    const wantAsh = cx < 1600 ? 150 : cx < 2800 ? 40 : 12, wantEmb = cx + VW > 3600 ? 40 : 0;
    let na = 0, ne = 0; for (const p of S.ash) p.k === 'ash' ? na++ : ne++;
    for (let k = 0; k < 3 && na < wantAsh; k++, na++) S.ash.push({ k: 'ash', x: cx + Math.random() * (VW + 60) - 30, y: cy - 10 + (S.ash.length < 20 ? Math.random() * VH : 0), vy: 12 + Math.random() * 16, ph: Math.random() * 6, big: Math.random() < 0.25, life: 20 });
    for (let k = 0; k < 2 && ne < wantEmb; k++, ne++) { const x = rnd2(Math.max(cx, LAVA.x0), Math.min(cx + VW, LAVA.x1)); S.ash.push({ k: 'ember', x, y: LAVA.y - 2, vy: -rnd2(20, 50), ph: Math.random() * 6, life: rnd2(1.5, 3) }); }
    for (let i = S.ash.length - 1; i >= 0; i--) { const p = S.ash[i]; p.life -= dt; p.x += (Math.sin(t * 1.3 + p.ph) * 10 + (p.k === 'ash' ? 6 : 0)) * dt; p.y += p.vy * dt; if (p.life <= 0 || p.y > cy + VH + 10 || p.y < cy - 60 || (p.k === 'ash' && p.y > World.groundAt(p.x))) S.ash.splice(i, 1); }
    // steam over the hot spring
    if (Math.random() < dt * 8) { const x = rnd2(SPRING.x0 + 20, SPRING.x1 - 20); FX.add({ type: 'dust', x, y: SPRING.level - 2, vx: rnd2(-6, 6), vy: -rnd2(12, 24), r: 3 + Math.random() * 3, life: 1.6, c: 0xfff4f0ec, c2: 0xffd8d4d0, layer: 3 }); }
    // steam vents: every few seconds a hot blast that throws Mudkip sky-high
    for (const v of S.vents) {
      v.t -= dt;
      if (v.t <= 0) { v.t = 4 + Math.random() * 3; v.on = 1; Game.sfx('steam', v.x, 0.6); }
      if (v.on > 0) {
        v.on = Math.max(0, v.on - dt / 1.2);
        for (let k = 0; k < 3; k++) FX.add({ type: 'dust', x: v.x + rnd2(-4, 4), y: World.groundAt(v.x) - 4, vx: rnd2(-10, 10), vy: -rnd2(90, 160), r: 3 + Math.random() * 4, life: 0.9, c: 0xfff8f4f0, c2: 0xffc8c4c0, layer: 3 });
        if (mk && Math.abs(mk.x - v.x) < 12 && mk.mode === 'land' && mk.air <= 0) { mk.mode = 'fall'; mk.vy = -560; mk.vx = 0; mk.jumping = false; mk.flipT = 0.9; mk.flipLen = 0.9; mk.flipSpins = 2; mk.flipDir = 1; mk.flipped = true; Game.sfx('whoosh', v.x, 0.8); if (mk.say) mk.say('Wheee!', 1); Save.discover('volcano.vent'); }
      }
    }
    // ash collecting in the ashy grass (for the glassblower)
    if (mk && mk.moving && mk.x < 1450 && mk.mode === 'land') { S.sootT = (S.sootT || 0) + dt; if (S.sootT > 1.2) { S.sootT = 0; const n = (Save.data.stats.soot || 0) + 1; if (n <= 30) { Save.data.stats.soot = n; Save.save(); if (n % 10 === 0 || n === 30) HUD.toast('Ash collected: ' + n + '/30', { life: 1.4 }); } } }
    // lava! too hot to touch: Mudkip bounces out yelping
    S.burnCool -= dt;
    if (mk && S.burnCool <= 0) {
      const L = lavaAt(mk.x);
      if (L && mk.y >= L.y - 3 && mk.mode !== 'swim') {
        S.burnCool = 1; const toLeft = mk.x - L.x0 < L.x1 - mk.x;
        mk.mode = 'fall'; mk.vy = -480; mk.vx = toLeft ? -150 : 150; mk.jumping = false; mk.dizzy = 1.2; mk.flipT = 0.7; mk.flipLen = 0.7; mk.flipSpins = 1; mk.flipDir = toLeft ? -1 : 1; mk.flipped = true;
        FX.poof(mk.x, L.y - 4, 0xffe8e8e8, 0xffb0b0b0, 10, 6); Game.sfx('steam', mk.x, 1); Game.shake(2);
        if (mk.say) mk.say('HOT HOT HOT!', 1.4);
      }
    }
    // the stones' light show
    if (S.showI >= 0) {
      S.showT += dt;
      const i = Math.floor(S.showT / 0.8);
      if (i >= 4) { S.showI = -1; }
      else if (i !== S.showI || S.showT < 0.02) { S.showI = i; const st = S.seq[i]; S.lit[st] = 0.7; Game.sfx('lava', STONES[st], 0.7); FX.add({ type: 'ring', x: STONES[st], y: World.groundAt(STONES[st]) - 12, r0: 3, r1: 18, life: 0.5, c: hex('#ffc040'), layer: 3 }); }
    }
    for (let k = 0; k < 4; k++) { S.lit[k] = Math.max(0, S.lit[k] - dt); if (A.stones) A.stones[k].frames = [S.stoneSpr[k][S.lit[k] > 0 || S.solved ? 1 : 0]]; }
    if (!S.solved && mk && S.showI < 0 && !S.seq.length && Math.abs(mk.x - 3830) < 60 && !S.hinted) { S.hinted = true; HUD.toast('Four carved stones ring the crater... tap one to wake the lava.', { life: 3 }); }
    if (typeof VolcanoAI !== 'undefined') VolcanoAI.update(A, dt, t, G);
  };
  def.weather = () => ({ rain: 0, fog: 0.12 });
  def.ambient = (hour) => {
    const out = [{ kind: 'mote', rate: 2, c: hex('#e0d8ce'), life: 6, sway: 10, bob: 4, vy: 2 }];
    if (hour === 'night' || hour === 'dusk') out.push({ kind: 'firefly', rate: 1.2, c: hex('#ff9a4a'), life: 6, sway: 12, bob: 6, y: (x) => World.groundAt(x) - 10 - Math.random() * 60 });
    else out.push({ kind: 'bird', rate: 0.1, group: [2, 3], vx0: 22, par: 0.3, c: hex('#2a2024'), life: 40, sway: 3, bob: 3, y: () => 150 + Math.random() * 60 });
    return out;
  };
  def.onScan = (A) => { const mk = Game.mudkip; if (mk && mk.x > 3700) { HUD.toast(S.solved ? 'Scan: a colossal heat signature in the magma... awake.' : 'Scan: a colossal heat signature sleeps in the magma. The four stones hum.', { life: 3 }); return true; } return false; };
  def.onSong = (x) => { if (typeof VolcanoAI !== 'undefined' && VolcanoAI.song) VolcanoAI.song(x); };
  def.photoBonus = (A, crop, subs, main) => {
    if (subs.some((s) => s.sp === 'groudon')) return { pts: 800, name: 'Lord of the land' };
    if (Game.mudkip && Game.mudkip.x > 3700) return { pts: 250, name: 'Magma glow' };
    if (Game.mudkip && Game.mudkip.x < 1450) return { pts: 150, name: 'Ashfall' };
    return null;
  };
  def.S = S; def.LAVAS = LAVAS; def.STONES = STONES; def.SPRING = SPRING; def.LAVA = LAVA; def.PUDDLE = PUDDLE;
  return def;
})();
