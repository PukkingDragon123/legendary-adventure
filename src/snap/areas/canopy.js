/* ------------------------------------------------------------------
   Treetop Town — Fortree City reimagined: a village of tree houses
   built high in giant trees, joined by sagging rope bridges and one
   great arching branch. Paper lanterns glow at dusk, wind chimes sing,
   birds nest in the forks. Beyond the rail: a sea of treetops fading
   into mist, far blue mountains, and a misty drop straight down.
------------------------------------------------------------------- */
Areas.canopy = (() => {
  const { clamp, lerp, rng, hash, bayer4, vnoise, mix, hex } = U;
  const GEO = CanopyAI.GEO, DECK = GEO.DECK;
  // dense walk-line points (decks, bridge sags, the branch arch)
  const ground = [];
  for (let x = 0; x <= GEO.W; x += 5) ground.push([x, GEO.groundAt(x)]);
  const def = {
    id: 'canopy', name: 'Treetop Town', sub: 'Fortree Canopy', music: 'space', seed: 41,
    W: GEO.W, H: 900, sea: null, refY: 560, h0: 118, cy0: 330, ph: 0.05, skyH: 300, sunH: 140, band: 8, waves: 0,
    camY: [-80, 840], frameY: 0.64, start: 230, clouds: 9,
    ground,
    water: [],
    plats: GEO.segs.filter((s) => s.k !== 'deck').map((s) => ({ x0: s.x0, x1: s.x1, y: 1e6, kind: s.k === 'bridge' ? 'bridge' : 'branch', fy: (x) => GEO.groundAt(x) })),
    sky: {
      noon: [[0, '#3a78c4'], [0.45, '#6aa4dc'], [0.8, '#a4cce6'], [1, '#cae4ec']],
      afternoon: [[0, '#4a78c0'], [0.5, '#86aad8'], [0.85, '#d6cfbc'], [1, '#f0d8a8']],
    },
    mats: {
      ink: ['#0e1216', '#1a2020'],
      bark: ['#261a12', '#3a2a1c', '#543e28', '#6e5436', '#8a6c48', '#a6885e'],
      moss: ['#1e4a26', '#2e6a30', '#4a8a3a', '#78b04c'],
      leaf: ['#0e3220', '#174e28', '#236a30', '#36883a', '#56a848', '#8ccc60'],
      leafD: ['#0a2418', '#113420', '#194828', '#236034'],
      wood: ['#3a2414', '#553820', '#74502e', '#946a40', '#b48552', '#d4a46c'],
      rope: ['#6a5230', '#9a7e4e', '#c8ac78'],
      win: { c: ['#ffc060', '#fff0b0'], emit: true },
      lant: { c: ['#b8321c', '#f06a38', '#ffb46a'], emit: true },
      lantY: { c: ['#c88a1a', '#f4c040', '#fff0a0'], emit: true },
      metal: ['#2a3440', '#4e5e6e', '#8a9aaa', '#d0dce6'],
      flower: ['#c8406a', '#ff7aa0', '#ffd0e0'],
      flowerY: ['#c8901a', '#ffd040', '#fff4a0'],
      flowerB: ['#3a5ac8', '#6a9aff', '#c0d8ff'],
      berry: ['#1a3a8a', '#3a6ae0', '#9ad0ff'],
      fruit: ['#a86a10', '#e0a020', '#ffd850'],
      cloth: ['#6a1a28', '#a02a3a', '#d44a5a', '#f07a80'],
      clothB: ['#1a3a6a', '#2a5a9a', '#4a88d0'],
      twig: ['#3a2a18', '#5a4228', '#7e6038', '#9c7c50'],
      egg: ['#c8c0a8', '#f4eedc'],
      thatch: ['#4a3a1a', '#6e5a2a', '#927a3a', '#b89c52'],
      mist: ['#6e8c96', '#88a4aa', '#a2bcbc', '#bcd2ce', '#d4e4de'],
      far: ['#46668a', '#5a7c9c', '#7494ae', '#90acc2', '#aec6d6'],
      snow: ['#c8d8e6', '#eaf2f8'],
      sea: ['#123a2c', '#1c4e36', '#286442', '#3a7c50', '#529664', '#72b07a'],
      seaF: ['#34606a', '#447474', '#568a80', '#6ca08e', '#86b6a0'],
    },
  };
  const S = {};
  const n1 = (x, y) => Terrain.n1(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n2 = (x, y) => Terrain.n2(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n3 = (x, y) => Terrain.n3(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff);
  const pickR = (ramp, t, x, y) => Terrain.pickR(ramp, t, x, y);
  let FOG = null;

  /* ---------------- little painters ---------------- */
  // shaded bark column (cylinder lit from the left) from row y0 to y1
  function column(s, M, cx, y0, y1, half0, half1, ramp, seed, o = {}) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(s.h, y1); y++) {
      const k = (y - y0) / Math.max(1, y1 - y0), half = lerp(half0, half1, k) + (o.flare && k > 0.9 ? (k - 0.9) * half1 * 4 : 0);
      const wob = Math.sin(y * 0.02 + seed) * 1.5;
      for (let x = Math.floor(cx - half + wob); x <= Math.ceil(cx + half + wob); x++) {
        const u = (x - cx - wob) / half;
        if (Math.abs(u) > 1) continue;
        let lit = 0.66 - u * 0.42 - (u > 0.6 ? 0.18 : 0) + (n2(x * 2 + seed, y) - 0.5) * 0.3 - (o.dark || 0);
        const groove = ((x - cx + 40 + Math.floor(n1(x + seed, y * 0.25) * 7)) % 7 + 7) % 7 === 0;
        if (groove) lit -= 0.28;
        let c = pickR(ramp, lit, x, y);
        if (o.moss && u < -0.3 && n1(x * 3 + seed, y * 1.5) > 0.62) c = o.moss[n1(x, y) > 0.7 ? 2 : 1];
        s.set(x, y, c);
      }
    }
  }
  // tapering branch from (x, y) heading at angle a
  function branch(s, ramp, x, y, a, len, th, seed) {
    const r = rng(seed); const tips = [];
    for (let j = 0; j < len; j++) {
      const t = Math.max(1, th * (1 - j / len));
      for (let yy = -t; yy <= t; yy++) for (let xx = -t; xx <= t; xx++) if (xx * xx + yy * yy <= t * t) s.set(Math.round(x + xx), Math.round(y + yy), ramp[yy < -t * 0.3 ? 4 : yy > t * 0.4 ? 1 : 2]);
      x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.1;
    }
    tips.push([x, y]);
    return tips;
  }
  function vine(s, ramp, x, y, L, seed) {
    const r = rng(seed);
    for (let j = 0; j < L; j++) {
      const xx = x + Math.sin(j * 0.08 + seed) * 2;
      s.under(xx, y + j, ramp[j % 5 === 0 ? 2 : 1]);
      if (j % 6 === 3) { s.under(xx - 1, y + j, ramp[3]); s.under(xx - 2, y + j + 1, ramp[2]); }
      if (j % 6 === 0 && r() < 0.8) { s.under(xx + 1, y + j, ramp[3]); s.under(xx + 2, y + j + 1, ramp[4] ?? ramp[3]); }
    }
  }
  // one of the giant town trees (above the deck): trunk, side branches, a huge crown, vines
  function giantTree(M, tw, seed) {
    const r = rng(seed);
    // (T0 rows of headroom so the crown's rounded top is never clipped by the sprite edge)
    const H = DECK - 80, T0 = 70, w = 420, s = new ISpr(w, H + T0 + 2), bx = w / 2, by = H + T0;
    column(s, M, bx, T0 + 60, by + 1, tw * 0.34, tw * 0.5, M.bark, seed, { moss: M.moss, flare: true });
    const clumps = [];
    for (let k = 0; k < 4; k++) {
      const dir = k % 2 ? 1 : -1, yb = by - 150 - k * 45 - r() * 30;
      const tip = branch(s, M.bark, bx + dir * tw * 0.3, yb, -Math.PI / 2 + dir * (1 + r() * 0.35), 70 + r() * 70, 6 + r() * 2, seed + k)[0];
      clumps.push([tip[0], tip[1], 22 + r() * 10], [tip[0] - dir * 18, tip[1] + 8, 16 + r() * 6], [tip[0] + dir * 10, tip[1] + 10, 14]);
    }
    const balls = [];
    for (let k = 0; k < 34; k++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()); balls.push([bx + Math.cos(a) * rr * w * 0.42, T0 + 70 + Math.sin(a) * rr * 58, 24 + r() * 18]); }
    for (let k = 0; k < 8; k++) balls.push([bx + (r() - 0.5) * w * 0.8, T0 + 120 + r() * 30, 18 + r() * 10]);
    balls.sort((a, b) => b[1] - a[1]);
    Paint.foliage(s, clumps.sort((a, b) => b[1] - a[1]), M.leaf, seed + 3, { topLight: 0.3 });
    Paint.foliage(s, balls, M.leaf, seed, { topLight: 0.35 });
    for (let k = 0; k < 16; k++) { const b = pick(balls.concat(clumps), r); vine(s, M.leaf, b[0] + (r() - 0.5) * b[2], b[1] + b[2] * 0.6, 20 + r() * 120, seed + k * 7); }
    Paint.outline(s, M.ink[0]);
    s.ax = Math.round(bx); s.ay = by;
    return s;
  }
  const pick = (a, r) => a[Math.floor(r() * a.length)];
  function ladder(M, h) {
    const s = new ISpr(12, h);
    for (let y = 0; y < h; y++) { s.set(1, y, M.wood[3]); s.set(2, y, M.wood[2]); s.set(9, y, M.wood[3]); s.set(10, y, M.wood[1]); if (y % 6 === 3) for (let x = 3; x < 9; x++) { s.set(x, y, M.wood[4]); s.set(x, y + 1, M.wood[1]); } }
    Paint.outline(s, M.ink[0]);
    s.ax = 6; s.ay = h - 1;
    return s;
  }
  function lantern(M, str = 4, ramp = M.lant) {
    const s = new ISpr(9, str + 12);
    for (let y = 0; y < str; y++) s.set(4, y, M.rope[0]);
    for (let x = 2; x <= 6; x++) s.set(x, str, M.ink[1]);
    const hw = [2, 3, 4, 4, 4, 4, 3, 2];
    for (let j = 0; j < hw.length; j++) for (let x = -hw[j]; x <= hw[j]; x++) { const u = x / hw[j]; s.set(4 + x, str + 1 + j, x === 0 && j % 2 ? ramp[0] : pickR(ramp, 0.95 - (u + 1) * 0.2 - (j > 5 ? 0.15 : 0), x, j)); }
    for (let x = 2; x <= 6; x++) s.set(x, str + 9, M.ink[1]);
    s.set(4, str + 10, ramp[1]); s.set(4, str + 11, ramp[0]);
    s.ax = 4; s.ay = 0;
    return s;
  }
  function railing(M, len) {
    const s = new ISpr(len + 2, 15);
    for (let x = 0; x <= len; x++) { s.set(x, 0, M.wood[4]); s.set(x, 1, M.wood[2]); s.set(x, 7, M.rope[x % 4 === 0 ? 0 : 1]); }
    for (let x = 0; x <= len; x += 24) for (let y = 0; y < 15; y++) { s.set(x, y, M.wood[3]); s.set(x + 1, y, M.wood[1]); }
    Paint.outline(s, M.ink[0]);
    s.ax = 0; s.ay = 14;
    return s;
  }
  function planter(M, seed, flowers) {
    const s = new ISpr(28, 26);
    const b = Paint.bush(M, 24, 14, seed, { ramp: M.leaf, dots: flowers, nd: 7 });
    s.paste(b, 14 - b.ax, 18 - b.ay);
    for (let y = 17; y < 25; y++) for (let x = 3; x < 25; x++) s.set(x, y, y === 17 ? M.wood[4] : (x - 3) % 7 === 0 ? M.wood[1] : pickR(M.wood, 0.7 - (x - 3) / 22 * 0.35 - (y - 17) * 0.03, x, y));
    Paint.outline(s, M.ink[0]);
    s.ax = 14; s.ay = 24;
    return s;
  }
  function chimeSpr(M, i, f) {
    const s = new ISpr(26, 52);
    for (let y = 2; y < 52; y++) { s.set(3, y, M.wood[3]); s.set(4, y, M.wood[2]); s.set(5, y, M.wood[1]); }
    for (let x = 3; x < 20; x++) { s.set(x, 2, M.wood[4]); s.set(x, 3, M.wood[1]); }
    const hx = 15, lean = f - 1;
    for (let y = 4; y < 8; y++) s.set(hx, y, M.rope[1]);
    for (let x = hx - 5; x <= hx + 5; x++) s.set(x, 8, M.metal[3 - (x > hx ? 1 : 0)]);
    const L0 = [24, 19, 14][i];
    for (let k = 0; k < 4; k++) {
      const tx = hx - 4 + k * 3 - (k > 1 ? 0 : 1), L = Math.round(L0 * (1 - k * 0.1));
      for (let y = 0; y < L; y++) { const x = tx + Math.round(lean * y / L0 * 1.5); s.set(x, 10 + y, M.metal[y < 2 ? 3 : 2]); s.set(x + 1, 10 + y, M.metal[1]); }
    }
    const cy = 10 + Math.round(L0 * 0.6), cxx = hx + lean;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) s.set(cxx + x, cy + y, M.wood[4]);
    s.set(cxx, cy + 3, M.cloth[2]); s.set(cxx, cy + 4, M.cloth[2]); s.set(cxx + lean, cy + 5, M.cloth[1]);
    Paint.outline(s, M.ink[0]);
    s.ax = 4; s.ay = 51;
    return s;
  }
  function feederSpr(M, full) {
    const s = new ISpr(26, 52);
    for (let y = 12; y < 52; y++) { s.set(12, y, M.wood[3]); s.set(13, y, M.wood[1]); }
    for (let x = 3; x < 23; x++) { s.set(x, 11, M.wood[4]); s.set(x, 12, M.wood[2]); s.set(x, 13, M.wood[1]); }
    s.set(3, 10, M.wood[3]); s.set(22, 10, M.wood[3]);
    for (let y = 5; y < 11; y++) { s.set(5, y, M.wood[2]); s.set(20, y, M.wood[2]); }
    for (let y = 0; y < 6; y++) for (let x = 12 - y * 2 - 2; x <= 13 + y * 2 + 2; x++) s.set(x, y, (x + y) % 5 === 0 ? M.cloth[0] : pickR(M.cloth, 0.85 - y * 0.1, x, y));
    if (full) for (const [x, y] of [[9, 9], [12, 9], [15, 9], [10, 8], [14, 8]]) { s.set(x, y, M.berry[1]); s.set(x + 1, y, M.berry[2]); s.set(x, y + 1, M.berry[0]); s.set(x + 1, y + 1, M.berry[1]); }
    Paint.outline(s, M.ink[0]);
    s.ax = 13; s.ay = 51;
    return s;
  }
  function stageSpr(M) {
    const w = 120, h = 66, s = new ISpr(w, h);
    // posts
    for (const px of [5, 113]) for (let y = 8; y < 60; y++) for (let k = 0; k < 4; k++) s.set(px + k, y, M.wood[k === 0 ? 4 : k === 3 ? 1 : 3]);
    // drapes
    for (const [x0, dir] of [[9, 1], [111, -1]]) for (let y = 12; y < 50; y++) { const wd = 14 - Math.round((y - 12) * 0.25); for (let k = 0; k < wd; k++) { const x = x0 + dir * k; s.set(x, y, (k % 4 === 0) ? M.cloth[0] : pickR(M.cloth, 0.75 - k / wd * 0.4, x, y)); } }
    // floor
    for (let y = 58; y < 66; y++) for (let x = 2; x < w - 2; x++) s.set(x, y, y === 58 ? M.wood[5] : y < 61 ? ((x % 8 === 0) ? M.wood[2] : M.wood[4]) : pickR(M.wood, 0.4 - (y - 61) * 0.06, x, y));
    // leafy arch with flowers
    const balls = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; balls.push([6 + t * 108, 12 - Math.sin(t * Math.PI) * 6, 7 + Math.sin(t * Math.PI) * 2]); }
    Paint.foliage(s, balls, M.leaf, 17, { topLight: 0.3 });
    const fr = rng(5);
    for (let k = 0; k < 14; k++) { const x = 8 + fr() * 104, y = 8 + fr() * 8 - Math.sin((x / w) * Math.PI) * 6; const F = [M.flower, M.flowerY, M.flowerB][k % 3]; s.set(x, y, F[1]); s.set(x + 1, y, F[2]); s.set(x, y + 1, F[0]); }
    // bunting
    for (let x = 12; x < 108; x++) { const y = 20 + Math.round(Math.sin(((x - 12) / 96) * Math.PI) * 8); s.set(x, y, M.rope[1]); if ((x - 12) % 8 === 0) { const F = [M.cloth, M.clothB, M.flowerY][((x - 12) / 8) % 3]; for (let j = 1; j <= 5; j++) for (let q = -Math.floor((6 - j) / 2); q <= Math.floor((6 - j) / 2); q++) s.set(x + 3 + q, y + j, F[1 + (q < 0 ? 1 : 0)] ?? F[1]); } }
    Paint.outline(s, M.ink[0]);
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function lookoutSpr(M) {
    const w = 104, h = 86, s = new ISpr(w, h);
    for (const px of [16, 50, 84]) for (let y = 22; y < 86; y++) { s.set(px, y, M.wood[3]); s.set(px + 1, y, M.wood[2]); s.set(px + 2, y, M.wood[1]); }
    for (let x = 12; x < 92; x++) { s.set(x, 66, M.wood[4]); s.set(x, 67, M.wood[2]); if (x % 6 === 0) for (let y = 68; y < 86; y++) s.set(x, y, M.wood[2]); }
    // thatched cone roof
    for (let y = 0; y < 26; y++) { const hw = 4 + y * 1.95; for (let x = -hw; x <= hw; x++) { const X = 52 + x; s.set(X, y + 2, ((Math.round(x) + y * 3) % 5 === 0 || y === 25) ? M.thatch[0] : pickR(M.thatch, 0.8 - (x + hw) / (2 * hw) * 0.4 - y * 0.008, X, y)); } }
    for (let y = 0; y < 3; y++) s.set(52, y, M.wood[2]);
    // lanterns under the eaves
    for (const lx of [12, 92]) { const L = lantern(M, 3, M.lantY); s.paste(L, lx - 4, 27); }
    // telescope on a tripod
    for (let j = 0; j < 16; j++) { s.set(70 + j, 50 - j * 0.45, M.metal[2]); s.set(70 + j, 51 - j * 0.45, M.metal[1]); }
    for (let j = 0; j < 14; j++) { s.set(76 - j * 0.3, 52 + j, M.wood[1]); s.set(76 + j * 0.3, 52 + j, M.wood[2]); }
    Paint.outline(s, M.ink[0]);
    s.ax = 52; s.ay = h - 1;
    return s;
  }
  function nestSpr(M, stubDir = -1, eggs = true) {
    const s = new ISpr(34, 15);
    for (let x = 0; x < 20; x++) { const X = stubDir < 0 ? x : 33 - x; for (let y = 9; y < 13; y++) s.set(X, y, M.bark[y === 9 ? 4 : y === 12 ? 1 : 2]); }
    const cx = stubDir < 0 ? 22 : 11;
    if (eggs) for (const [x, y] of [[-3, 4], [1, 3], [4, 4]]) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) s.set(cx + x + xx, y + yy, M.egg[yy === 0 || xx === 0 ? 1 : 0]);
    for (let y = 5; y < 12; y++) { const hw = 8 - Math.max(0, y - 8) * 1.5; for (let x = -hw; x <= hw; x++) s.set(cx + x, y, (Math.round(x * 1.7) + y * 2) % 3 === 0 ? M.twig[0] : M.twig[1 + ((Math.round(x) + y) & 1) + (y < 7 ? 1 : 0)]); }
    Paint.outline(s, M.ink[0]);
    s.ax = cx; s.ay = 11;
    return s;
  }
  function basketSpr(M) {
    const s = new ISpr(20, 14);
    for (let y = 5; y < 13; y++) { const hw = 8 - (y > 10 ? y - 10 : 0); for (let x = -hw; x <= hw; x++) s.set(10 + x, y, ((x + y) & 1) ? M.twig[2] : M.twig[3]); }
    for (const [x, y] of [[6, 2], [10, 1], [13, 3], [8, 4]]) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) s.set(x + xx, y + yy, M.fruit[yy === 0 ? 2 : 1]);
    Paint.outline(s, M.ink[0]);
    s.ax = 10; s.ay = 12;
    return s;
  }
  function platformSpr(M, w) {
    const s = new ISpr(w, 36);
    for (let x = 0; x < w; x++) for (let y = 0; y < 5; y++) s.set(x, y, y === 0 ? M.wood[5] : x % 7 === 0 ? M.wood[1] : M.wood[y < 3 ? 4 : 2]);
    for (let j = 0; j < 30; j++) { s.set(6 + j * 0.8, 5 + j, M.wood[2]); s.set(7 + j * 0.8, 5 + j, M.wood[1]); s.set(w - 7 - j * 0.8, 5 + j, M.wood[3]); s.set(w - 8 - j * 0.8, 5 + j, M.wood[1]); }
    Paint.outline(s, M.ink[0]);
    s.ax = w >> 1; s.ay = 0;
    return s;
  }
  // a rolling row of treetops seen from above (fills everything below its crowns)
  function canopyRow(s, base, size, ramp, seed, o = {}) {
    const w = s.w, r = rng(seed), top = new Float32Array(w).fill(1e9), cu = new Float32Array(w);
    let x = -size;
    while (x < w + size) {
      const rad = size * (0.6 + r() * 0.8), cy = base - rad * (0.25 + r() * 0.6) - (o.jag ? r() * o.jag : 0);
      for (let xx = Math.max(0, Math.floor(x - rad)); xx <= Math.min(w - 1, x + rad); xx++) { const u = (xx - x) / rad, yt = cy - Math.sqrt(Math.max(0, 1 - u * u)) * rad * 0.8; if (yt < top[xx]) { top[xx] = yt; cu[xx] = u; } }
      x += rad * (0.7 + r() * 0.5);
    }
    const y1 = Math.min(s.h, o.y1 ?? s.h);
    for (let xx = 0; xx < w; xx++) for (let y = Math.max(0, Math.floor(top[xx])); y < y1; y++) {
      const d = y - top[xx];
      const lit = 0.62 - cu[xx] * 0.28 + (d < 2 ? 0.2 : 0) - d / (size * 2.2) * 0.55 + (n2(xx * 1.3 + seed, y * 1.3) - 0.5) * 0.45 + (o.bias || 0);
      s.set(xx, y, pickR(ramp, lit, xx, y));
    }
  }
  // mist settling over a band of rows (dithered, noisy — never a flat band)
  function mistOver(s, y0, y1, ramp, k0, k1, t0, seed, onlyFilled = true) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(s.h, y1); y++) {
      const k = lerp(k0, k1, (y - y0) / Math.max(1, y1 - y0));
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        if (onlyFilled && !s.d[i]) continue;
        const nv = n3(x * 0.7 + seed, y * 2.2);
        const a = k + (nv - 0.5) * 0.7;
        if (a <= bayer4(x, y)) continue;
        s.d[i] = pickR(ramp, t0 + (nv - 0.5) * 0.5 + (y - y0) / Math.max(1, y1 - y0) * 0.1, x, y);
      }
    }
  }

  /* ---------------- build ---------------- */
  def.build = (A) => {
    const M = A.M, r = rng(A.seed);
    const gy = (x) => World.groundAt(x);
    const trunkAt = (x, dep) => GEO.trunks.find((t) => Math.abs(x - t.x) < t.w * 0.5 * (1 + dep * 0.0012));
    // ---- terrain: plank decks, the great branch, trunk columns plunging into the mist ----
    Terrain.paint(A, {
      bb: 4, bf: 4,
      strip(x, y, u, e) {
        const sg = GEO.segAt(x);
        if (sg.k === 'bridge' && x > sg.x0 + 1 && x < sg.x1 - 1) return 0;
        if (sg.k === 'branch' && x > sg.x0 + 3 && x < sg.x1 - 3) {
          if (u < 0.5 && e.n1(x, y * 3) > 0.45) return e.pickR(M.moss, 0.5 + (e.n2(x, y) - 0.5) * 0.6, x, y);
          return e.pickR(M.bark, 0.8 - u * 0.3 + (e.n2(x * 2, y) - 0.5) * 0.3, x, y);
        }
        if (x % 7 === 0) return M.wood[1];
        const pl = Math.floor(x / 7);
        return e.pickR(M.wood, 0.78 - u * 0.25 + (hash(pl, 0, 3) - 0.5) * 0.25 + (e.n2(x, y * 4) - 0.5) * 0.15, x, y);
      },
      face(x, y, dep, e) {
        const tr = trunkAt(x, dep);
        const sg = GEO.segAt(x);
        const inBridge = sg.k === 'bridge' && x > sg.x0 + 1 && x < sg.x1 - 1;
        if (sg.k === 'branch' && x > sg.x0 + 3 && x < sg.x1 - 3) {
          const u = (x - sg.x0) / (sg.x1 - sg.x0), th = 15 - Math.sin(u * Math.PI) * 5;
          if (dep < th) return e.pickR(M.bark, 0.72 - dep / th * 0.6 + (e.n2(x * 2, y) - 0.5) * 0.3, x, y);
        }
        if (!inBridge && sg.k !== 'branch') {
          if (dep < 6) return x % 7 === 0 ? M.wood[1] : e.pickR(M.wood, 0.58 - dep * 0.05 + (hash(Math.floor(x / 7), 1, 3) - 0.5) * 0.2, x, y);
          if (dep < 9) return dep === 8 ? M.ink[0] : M.wood[1];
        }
        if (tr) {
          const half = tr.w * 0.5 * (1 + dep * 0.0012), u = (x - tr.x) / half;
          let lit = 0.6 - u * 0.4 - (u > 0.6 ? 0.18 : 0) + (e.n2(x * 2, y) - 0.5) * 0.3;
          if (((x - tr.x + 40 + Math.floor(e.n1(x, y * 0.25) * 7)) % 7 + 7) % 7 === 0) lit -= 0.28;
          if (Math.abs(u) > 0.93) return M.ink[0];
          return e.pickR(M.bark, lit, x, y);
        }
        if (!inBridge && sg.k === 'deck') {
          // diagonal braces from the trunk out under the deck
          for (const t of GEO.trunks) {
            const d = Math.abs(x - t.x) - t.w / 2;
            if (d > 0 && d < 70) { const yb = 9 + d * 0.8; if (Math.abs(dep - yb) < 1.8) return dep < yb ? M.wood[3] : M.wood[1]; }
          }
          // hanging posts at deck ends
          if ((x - sg.x0 < 4 || sg.x1 - x < 4) && dep < 30 && sg.x0 > 0 && sg.x1 < GEO.W) return M.wood[(x & 1) + 1];
        }
        return 0;
      },
    });
    // fog noise tile for the misty drop
    FOG = new Float32Array(128 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) FOG[y * 128 + x] = (Terrain.n3(x * 2, y * 4) + Terrain.n2(x * 2, y * 4) * 0.5) / 1.5;
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    // ---- the giant trees ----
    GEO.trunks.forEach((t, i) => put(giantTree(M, t.w, 31 + i * 17), t.x, -6, { sink: 0, foot: 4 }));
    // ---- rope bridges ----
    for (const [k, sg] of GEO.segs.entries()) {
      if (sg.k !== 'bridge') continue;
      const B = Props2.ropeBridge(M, sg.x0, sg.x1, DECK - 1, { sag: sg.sag });
      A.props.push({ frames: [B.back], x: 0, y: 0, zd: -3 });
      A.props.push({ frames: [B.front], x: 0, y: 0, zd: 4, late: true });
      // lanterns strung under the hand rope
      for (let x = sg.x0 + 60; x < sg.x1 - 40; x += 90) {
        const ry = B.deckY(x) - 16 + Math.round(Math.sin(((x - sg.x0) / (sg.x1 - sg.x0)) * Math.PI) * 3);
        const L = lantern(M, 3, (x / 90) & 1 ? M.lant : M.lantY);
        A.props.push({ frames: [L], x, y: ry + 1, zd: -3, sway: 0 });
        A.glows.push({ x, y: ry + 9, r: 20, c: hex((x / 90) & 1 ? '#ff9a50' : '#ffd070'), a: 0.5, flicker: true });
      }
      // vines trailing from the planks
      for (let x = sg.x0 + 30; x < sg.x1 - 20; x += 40 + r() * 60) { const v = new ISpr(8, 70); vine(v, M.leaf, 3, 0, 20 + r() * 50, Math.floor(x)); Paint.outline(v, M.ink[0]); v.ax = 3; v.ay = 0; A.props.push({ frames: [v], x, y: B.deckY(x) + 4, zd: -1, sway: 1.5 }); }
    }
    // the branch walkway: leaf tufts and twigs along its back
    const br = GEO.segs.find((s) => s.k === 'branch');
    for (let x = br.x0 + 30; x < br.x1 - 20; x += 50 + r() * 60) {
      const s = Paint.clump(M.leaf, 20 + r() * 16, 14 + r() * 12, Math.floor(x), 'leaf', { n: 5, spread: 1.6 });
      put(Paint.edge(s, M.ink[0]), x, -4, { sink: 3, sway: 1.2, leafy: true });
    }
    for (let x = br.x0 + 40; x < br.x1 - 30; x += 70 + r() * 50) { const v = new ISpr(8, 90); vine(v, M.leaf, 3, 0, 30 + r() * 60, Math.floor(x * 3)); Paint.outline(v, M.ink[0]); v.ax = 3; v.ay = 0; A.props.push({ frames: [v], x, y: gy(x) + 10, zd: -1, sway: 1.5 }); }
    // ---- back railings along the decks ----
    for (const sg of GEO.segs) if (sg.k === 'deck') { const x0 = sg.x0 + (sg.x0 ? 4 : 0), x1 = sg.x1 - (sg.x1 < GEO.W ? 4 : 0); A.props.push({ frames: [railing(M, x1 - x0)], x: x0, y: DECK - 4, zd: -7 }); }
    // ---- tree houses (on the decks and up the trunks) ----
    for (const [k, h] of GEO.houses.entries()) {
      const hs = Props2.treehouse(M, h.w, h.h, 7 + k);
      let base;
      if (h.y === null) { const p = put(hs, h.x, -5, { sink: 1, foot: h.w }); base = p.y; }
      else {
        A.props.push({ frames: [platformSpr(M, h.w + 30)], x: h.x, y: h.y, zd: -5 });
        A.props.push({ frames: [hs], x: h.x, y: h.y + 1, zd: -5 });
        base = h.y + 1;
        A.props.push({ frames: [ladder(M, DECK - h.y + 2)], x: h.ladder, y: DECK - 2, zd: -4 });
        for (const lx of [h.x - (h.w + 30) / 2 + 4, h.x + (h.w + 30) / 2 - 4]) { A.props.push({ frames: [lantern(M, 4)], x: lx, y: h.y + 5, zd: -4 }); A.glows.push({ x: lx, y: h.y + 15, r: 22, c: hex('#ff9a50'), a: 0.5, flicker: true }); }
      }
      // window glow at night
      A.glows.push({ x: h.x - hs.ax + 14 + 4, y: base - hs.ay + (h.h + 10) - h.h + 9, r: 16, c: hex('#ffc060'), a: 0.35 });
      // a lantern by the door
      if (h.y === null) { A.props.push({ frames: [lantern(M, 6, M.lantY)], x: h.x + h.w / 2 + 2, y: base - h.h + 2, zd: -4 }); A.glows.push({ x: h.x + h.w / 2 + 2, y: base - h.h + 14, r: 22, c: hex('#ffd070'), a: 0.5, flicker: true }); }
    }
    // ---- lantern posts on the decks ----
    const post = (x) => { const s = new ISpr(14, 40); for (let y = 2; y < 40; y++) { s.set(3, y, M.wood[3]); s.set(4, y, M.wood[1]); } for (let x2 = 3; x2 < 11; x2++) s.set(x2, 2, M.wood[4]); Paint.outline(s, M.ink[0]); s.ax = 4; s.ay = 39; put(s, x, -3, { sink: 2 }); A.props.push({ frames: [lantern(M, 3)], x: x + 6, y: DECK - 37, zd: -3 }); A.glows.push({ x: x + 6, y: DECK - 29, r: 24, c: hex('#ff9a50'), a: 0.55, flicker: true }); };
    for (const x of [40, 290, 710, 960 - 20, 1370, 1640, 2030, 2280, 2680, 3080, 3390 - 10]) post(x);
    // ---- ladders dropping into the mist below ----
    for (const x of [130, 1560, 2250, 2990]) A.props.push({ frames: [ladder(M, 170)], x, y: DECK + 176, zd: -1 });
    // ---- flower planters, a Kecleon's leafy hideout, nests ----
    const FL = [M.flower, M.flowerY, M.flowerB];
    for (const [i, x] of [210, 740, 1400, 1470, 1625, 2045, 2700, 2880, 3040, 3370].entries()) put(planter(M, 70 + i, FL[i % 3]), x, -3, { sink: 1, leafy: true });
    for (let x = GEO.LEAVES.x0; x < GEO.LEAVES.x1; x += 16) put(Paint.bush(M, 30, 22, Math.floor(x), { ramp: M.leaf, dots: r() < 0.5 ? M.flower : null, nd: 4 }), x, -3, { sink: 2, leafy: true, sway: 0.6 });
    A.props.push({ frames: [nestSpr(M, -1, true)], x: GEO.NEST[0], y: GEO.NEST[1] + 4, zd: -5 });
    A.props.push({ frames: [nestSpr(M, 1, true)], x: 770, y: 452, zd: -5 });
    A.props.push({ frames: [nestSpr(M, -1, false)], x: 1535, y: 400, zd: -5 });
    // ---- wind chimes ----
    A.chimes = GEO.CHIMES.map((x, i) => { const sprs = [0, 1, 2].map((f) => chimeSpr(M, i, f)); const p = put(sprs[1], x, -3, { sink: 1, foot: 4 }); p.sprs = sprs; return p; });
    // ---- bird feeder, stage, lookout, fruit basket ----
    A.feederSpr = [feederSpr(M, false), feederSpr(M, true)];
    A.feeder = put(A.feederSpr[0], GEO.FEEDER, -3, { sink: 1, foot: 4 });
    put(stageSpr(M), GEO.STAGE.x, -4, { sink: 1, foot: 20 });
    put(lookoutSpr(M), GEO.LOOKOUT.x, -5, { sink: 1, foot: 20 });
    A.glows.push({ x: GEO.LOOKOUT.x - 40, y: DECK - 50, r: 22, c: hex('#ffd070'), a: 0.5, flicker: true }, { x: GEO.LOOKOUT.x + 40, y: DECK - 50, r: 22, c: hex('#ffd070'), a: 0.5, flicker: true });
    A.basket = put(basketSpr(M), GEO.BASKET, -2, { sink: 1 });
    // micro detail on the planks: leaves, twigs, petals, feathers
    const det = (key, ramp, x, zd) => { const s = Paint.miniSpr(key, ramp); A.details.push({ s, x, y: gy(x) + zd, zd }); };
    for (let x = 10; x < A.W; x += 6 + r() * 16) {
      const sg = GEO.segAt(x); if (sg.k === 'bridge') continue;
      const k = r(), zd = (r() - 0.5) * 6;
      if (k < 0.3) det('leaf', M.leaf.slice(2), x, zd); else if (k < 0.42) det('twig', M.twig, x, zd); else if (k < 0.5) det('flower', FL[Math.floor(r() * 3)], x, zd);
    }

    /* ---- backdrop ---- */
    const P = (p) => Math.ceil(620 + (A.W - 380) * p) + 80;
    // far mountains over a hazy sea of treetops that runs all the way down
    {
      const w = 900, top = 150, s = new ISpr(w, top + 540);
      Paint.ridge(s, M, { ramp: M.far, base: top, amp: 118, seed: 4, freq: 0.005, peaks: [[210, 170, 1], [660, 230, 0.8]], snow: M.snow, snowLine: 0.62 });
      let y = top - 10, sz = 6;
      for (let k = 0; y < s.h + 20; k++) { canopyRow(s, y, sz, k < 4 ? M.seaF : M.sea, 50 + k, { bias: k < 4 ? 0.1 : -0.05 }); mistOver(s, y - sz * 0.2, y + sz * 1.4, M.mist, 0.05, 0.55, 0.62 - k * 0.03, k * 37); y += sz * 2.2 + k * 2; sz = Math.min(26, sz + 2.2); }
      A.layer(s, 0.02, { haze: 0.5, base: top, x: -70 });
    }
    // rolling canopy sea with emergent giants, mist in the hollows
    {
      const w = P(0.12), top = 150, s = new ISpr(w, top + 500);
      for (let x = 40; x < w; x += 140 + r() * 200) { const tr = Paint.tree(M, 90 + r() * 40, Math.floor(x), { trunkRamp: M.bark, leafRamp: M.sea, crownW: 90, crownH: 50, trunkW: 3 }); s.paste(tr, Math.round(x - tr.ax), top + 10 - tr.ay); }
      let y = top - 8, sz = 9;
      for (let k = 0; y < s.h + 20; k++) { canopyRow(s, y, sz, M.sea, 90 + k, { jag: 3, bias: 0.05 - k * 0.02 }); mistOver(s, y - sz * 0.2, y + sz * 1.5, M.mist, 0.0, 0.5, 0.55 - k * 0.04, k * 53); y += sz * 2 + 8; sz = Math.min(30, sz + 3); }
      A.layer(s, 0.12, { haze: 0.36, base: top, x: -40 });
    }
    // distant giant trees rising out of the mist, with a far-off tree house
    {
      const w = P(0.32), top = 300, s = new ISpr(w, top + 480);
      for (let x = 60; x < w; x += 190 + r() * 150) {
        const hw = 10 + r() * 6;
        column(s, M, x, 100, s.h, hw * 0.7, hw, M.bark, Math.floor(x), { dark: 0.15 });
        const balls = []; for (let k = 0; k < 16; k++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()); balls.push([x + Math.cos(a) * rr * 110, 110 + Math.sin(a) * rr * 44, 16 + r() * 14]); }
        for (let k = 0; k < 3; k++) { const dir = k % 2 ? 1 : -1, yb = 150 + k * 40 + r() * 30; const tip = branch(s, M.bark, x, yb, -Math.PI / 2 + dir * 1.1, 40 + r() * 30, 4, Math.floor(x) + k)[0]; balls.push([tip[0], tip[1], 14 + r() * 6]); }
        Paint.foliage(s, balls.sort((a, b) => b[1] - a[1]), M.leafD, Math.floor(x), { topLight: 0.3 });
        if (r() < 0.45) { const th = Props2.treehouse(M, 40, 28, Math.floor(x)); s.paste(th, Math.round(x - th.ax), Math.round(top - 60 - r() * 60 - th.ay)); }
      }
      mistOver(s, top + 60, s.h, M.mist, 0.0, 0.7, 0.45, 23);
      A.layer(s, 0.32, { haze: 0.3, base: top, x: -20 });
    }
    // nearer trunks: tree houses, a rope bridge and lanterns across the gap
    {
      const w = P(0.56), top = 330, s = new ISpr(w, top + 480);
      const xs = [];
      for (let x = 100; x < w; x += 260 + r() * 200) xs.push(x);
      for (const x of xs) {
        const hw = 15 + r() * 7;
        column(s, M, x, 90, s.h, hw * 0.7, hw, M.bark, Math.floor(x * 3), { moss: M.moss });
        const balls = []; for (let k = 0; k < 20; k++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()); balls.push([x + Math.cos(a) * rr * 150, 100 + Math.sin(a) * rr * 50, 18 + r() * 16]); }
        for (let k = 0; k < 3; k++) { const dir = k % 2 ? 1 : -1, yb = 170 + k * 50 + r() * 30; const tip = branch(s, M.bark, x, yb, -Math.PI / 2 + dir * 1.15, 50 + r() * 40, 5, Math.floor(x * 3) + k)[0]; balls.push([tip[0], tip[1], 16 + r() * 8]); }
        Paint.foliage(s, balls.sort((a, b) => b[1] - a[1]), M.leaf, Math.floor(x * 3), { topLight: 0.3 });
        for (let k = 0; k < 6; k++) { const b = balls[Math.floor(r() * balls.length)]; vine(s, M.leafD, b[0], b[1] + b[2] * 0.5, 30 + r() * 80, Math.floor(x) + k); }
        if (r() < 0.6) { const hy = top - 40 - r() * 90; const pl = platformSpr(M, 70); s.paste(pl, Math.round(x - 35), Math.round(hy)); const th = Props2.treehouse(M, 48, 32, Math.floor(x * 7)); s.paste(th, Math.round(x - th.ax), Math.round(hy - th.ay)); }
      }
      // rope bridges between neighbours
      for (let k = 0; k + 1 < xs.length; k++) {
        if (r() < 0.4) continue;
        const a = xs[k] + 16, b = xs[k + 1] - 16, yb = top - 20 - r() * 70, sag = 10 + r() * 8, lz = [];
        for (let x = a; x < b; x++) { const u = (x - a) / (b - a), y = Math.round(yb + Math.sin(u * Math.PI) * sag); s.set(x, y, M.wood[x % 4 === 0 ? 1 : 3]); s.set(x, y + 1, M.wood[1]); s.set(x, y - 8, M.rope[1]); if ((x - a) % 8 === 0) for (let q = y - 8; q < y; q++) s.set(x, q, M.rope[0]); if ((x - a) % 50 === 25) lz.push([x, y]); }
        for (const [x, y] of lz) s.paste(lantern(M, 2), x - 4, y - 8);
      }
      mistOver(s, top + 90, s.h, M.mist, 0.0, 0.65, 0.4, 41);
      A.layer(s, 0.56, { haze: 0.2, base: top, x: 0 });
    }
    // right behind the lane: the great trunks below the decks, lower branches, the misty drop
    {
      const w = P(0.82), top = 560, s = new ISpr(w, top + 520);
      for (let x = 30; x < w; x += 170 + r() * 200) {
        const hw = 18 + r() * 12;
        column(s, M, x, 0, s.h, hw * 0.85, hw, M.bark, Math.floor(x * 5), { moss: M.moss, dark: 0.08 });
        for (let k = 0; k < 3; k++) {
          const dir = r() < 0.5 ? 1 : -1, yb = top - 200 + k * 180 + r() * 120;
          const tip = branch(s, M.bark, x, yb, -Math.PI / 2 + dir * (1.2 + r() * 0.3), 60 + r() * 60, 6, Math.floor(x * 5) + k)[0];
          const balls = [[tip[0], tip[1], 20 + r() * 8], [tip[0] - dir * 16, tip[1] + 8, 14], [tip[0] + dir * 8, tip[1] - 6, 12]];
          Paint.foliage(s, balls, M.leaf, Math.floor(x) + k * 9, { topLight: 0.3 });
          for (let q = 0; q < 3; q++) vine(s, M.leaf, tip[0] + (r() - 0.5) * 30, tip[1] + 10, 30 + r() * 90, Math.floor(x) + q * 3 + k);
        }
      }
      mistOver(s, top + 120, s.h, M.mist, 0.0, 0.6, 0.35, 67);
      const L = A.layer(s, 0.82, { haze: 0.1, base: top, x: 0 });
      L.skirt = M.mist[1];
    }

    /* ---- foreground: leaf sprays below, vines and leaves hanging from above ---- */
    for (let x = -40; x < A.W; x += 150 + r() * 170) {
      let s = Paint.clump(r() < 0.6 ? M.leaf : M.leafD, 60 + r() * 40, 60 + r() * 40, Math.floor(x * 11), r() < 0.5 ? 'leaf' : 'frond', { n: 10 });
      if (r() < 0.35) Paint.tips(s, FL[Math.floor(r() * 3)], 4, Math.floor(x * 5), 1.6);
      s = Paint.edge(s, M.ink[0]);
      A.foreItem(s, x, gy(x) + 70 + r() * 20, { p: 1.35, sway: 3, flip: r() < 0.5 });
    }
    for (let x = 60; x < A.W; x += 200 + r() * 260) {
      const w = 70 + Math.floor(r() * 40), h = 110 + Math.floor(r() * 60), s = new ISpr(w, h);
      const top = Paint.clump(M.leaf, w, 50, Math.floor(x * 13), 'leaf', { spread: 1.3 });
      for (let y = 0; y < top.h; y++) for (let xx = 0; xx < top.w; xx++) { const v = top.d[(top.h - 1 - y) * top.w + xx]; if (v) s.set(xx, y, v); }
      for (let k = 0; k < 5; k++) vine(s, M.leaf, 6 + r() * (w - 12), 10, 30 + r() * (h - 40), Math.floor(x) + k);
      A.foreItem(Paint.edge(s, M.ink[0]), x, gy(x) - 260 - r() * 40, { p: 1.3, sway: 2, hang: true });
    }
    A.foreDark = 0.25; A.foreTint = 0xff0c1a10;

    /* ---- hotspots ---- */
    GEO.CHIMES.forEach((x, i) => A.addHot({ x0: x - 4, x1: x + 24, y0: DECK - 54, y1: DECK - 8, x: x + 12, reach: 40, tap() { CanopyAI.chime(A, i); }, onScan() { FX.sparkles(x + 14, DECK - 30, 5, 10, 0xffffffff, hex('#ffe890')); HUD.toast('Scan: a wind chime (' + ['low', 'middle', 'high'][i] + ' note). Tap to ring it.', { life: 2.4 }); return true; } }));
    A.addHot({ x0: GEO.FEEDER - 14, x1: GEO.FEEDER + 14, y0: DECK - 54, y1: DECK - 30, x: GEO.FEEDER, reach: 40, tap() { CanopyAI.feeder(A); } });
    A.addHot({ x0: GEO.BASKET - 12, x1: GEO.BASKET + 12, y0: DECK - 16, y1: DECK, x: GEO.BASKET, reach: 36, tap() { CanopyAI.basket(A); } });
    A.addHot({ x0: GEO.STAGE.x0, x1: GEO.STAGE.x1, y0: DECK - 64, y1: DECK - 50, x: GEO.STAGE.x, reach: 60, tap() { HUD.toast('A little treetop stage, strung with bunting. It\'s waiting for a song...', { life: 2.6 }); } });
    A.addHot({ x0: GEO.LOOKOUT.x + 14, x1: GEO.LOOKOUT.x + 36, y0: DECK - 40, y1: DECK - 20, x: GEO.LOOKOUT.x + 24, reach: 40, tap() {
      // look through the telescope: the camera swings out to whatever is worth seeing
      const pick = (k) => Mons.all.find((m) => m.kind === k && m.alive && m.visible !== false);
      const tgt = pick('altaria') || pick('tropius') || pick('swablu') || pick('chatot');
      const x = tgt ? tgt.x : 1200, y = tgt ? tgt.y - 20 : DECK - 140;
      HUD.scope(4.4); Game.sfx('select', GEO.LOOKOUT.x, 0.6);
      Game.cine.pan(x, y, { dur: 1.3, hold: 2.6, zoom: 1.3, frame: 0.5 });
      const name = tgt ? ({ altaria: 'an Altaria gliding over the canopy', tropius: 'Tropius munching leaves', swablu: 'a Swablu fluffing its wings', chatot: 'Chatot keeping the beat' })[tgt.kind] : 'an endless sea of treetops';
      HUD.toast(Game.hour() === 'dusk' ? 'Through the telescope: the sun sinks into the canopy sea... and ' + name + '.' : 'Through the telescope: ' + name + '!', { life: 3 });
    } });
  };

  /* ---------------- drawing ---------------- */
  // little bird flocks drifting across the sky
  const FLOCKS = [{ x: 200, y: 70, v: 9, n: 5, s: 1 }, { x: 900, y: 40, v: 6, n: 4, s: 2 }, { x: 1500, y: 95, v: 12, n: 6, s: 3 }];
  function drawBirds(fb, cx, cy, t) {
    const hr = Stage.S.hour;
    if (hr === 'night') return;
    const W = fb.w, H = fb.h, d = fb.d, hz = Stage.horizonS(cy);
    const col = hr === 'dusk' ? 0xff3a2a3a : 0xff4a4a5a;
    for (const f of FLOCKS) {
      const span = W + 400;
      const bx = ((((f.x + t * f.v - cx * 0.04) % span) + span) % span) - 200;
      for (let i = 0; i < f.n; i++) {
        const x = Math.round(bx + i * 9 - (i % 2) * 4), y = Math.round(hz - 150 + f.y + (i % 2) * 5 + Math.sin(t * 0.7 + i) * 2 - (cy - 330) * 0.02);
        const up = Math.sin(t * 8 + i * 1.7 + f.s) > 0;
        const pts = up ? [[-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1]] : [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]];
        for (const [dx, dy] of pts) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) d[Y * W + X] = mix(d[Y * W + X], col, 0.75); }
      }
    }
  }
  // drifting mist in the drop below the decks (animated noise, thickening with depth)
  function drawFog(A, fb, cx, cy, t) {
    if (!FOG) return;
    const W = fb.w, H = fb.h, d = fb.d;
    const pal = Stage.framePal(0, t), c1 = pal[A.M.mist[2]], c2 = pal[A.M.mist[4]];
    const top = DECK + 14;
    const y0 = Math.max(0, top - cy);
    const drift = t * 5, drift2 = t * 2.2;
    for (let y = y0; y < H; y++) {
      const wy = y + cy, base = clamp((wy - top) / 300, 0, 1);
      const kb = base * base * 0.55 + base * 0.25;
      if (kb < 0.01) continue;
      const ny = ((wy >> 1) & 63) * 128, row = y * W;
      const c = U.mix(c1, c2, base);
      for (let x = 0; x < W; x++) {
        const nx = ((x + cx * 0.95 + drift) >> 1) & 127, nx2 = ((x + cx * 0.9 - drift2) >> 2) & 127;
        const nv = FOG[ny + nx] * 0.6 + FOG[(((wy >> 2) + 17) & 63) * 128 + nx2] * 0.4;
        const a = kb * (0.45 + nv * 0.9);
        if (a < 0.02) continue;
        d[row + x] = U.mixk(d[row + x], c, Math.min(230, (a * 256) | 0));
      }
    }
  }
  def.drawBack = (A, fb, cx, cy, t) => {
    Stage.drawSky(fb, cx, cy, t);
    drawBirds(fb, cx, cy, t);
    Stage.drawLayers(fb, cx, cy, t);
  };
  def.post = (A, fb, cx, cy, t) => {
    drawFog(A, fb, cx, cy, t);
    // warm dappled light through the leaves by day
    const hr = Stage.S.hour;
    if (hr === 'noon' || hr === 'afternoon') {
      const W = fb.w, H = fb.h, d = fb.d, col = hr === 'afternoon' ? 0xff90d8ff : 0xffb8f0ff;
      for (let y = 0; y < H; y += 1) for (let x = (y & 1); x < W; x += 2) {
        const wx = x + cx * 0.7 + y * 0.5;
        const v = Math.sin(wx * 0.019) * Math.sin(wx * 0.0061 + 1.1) + Math.sin(t * 0.25 + wx * 0.002) * 0.2;
        if (v > 0.62) { const a = (v - 0.62) * 0.18 * (1 - y / H); if (a > 0.006) { const i = y * W + x; d[i] = U.screen(d[i], col, a); if (x + 1 < W) d[i + 1] = U.screen(d[i + 1], col, a); } }
      }
    }
    CanopyAI.post(A, fb, cx, cy, t);
  };
  def.spawn = (A, G) => { CanopyAI.spawn(A, G, S); if (typeof GroveAI !== 'undefined') GroveAI.spawnCanopy(A, G); };
  def.update = (A, dt, t, G) => CanopyAI.update(A, dt, t, G, S);
  def.weather = (hour) => ({ rain: 0, fog: hour === 'dawn' ? 0.35 : 0.04 });
  def.ambient = (hour, W) => {
    const out = [{ kind: 'leaf', rate: 1.6, c: hex('#56a848'), c2: hex('#8ccc60'), life: 10, drift: 1.4, vy: 9, y: (x) => World.groundAt(x) - 180 - Math.random() * 120 }];
    if (hour === 'night' || hour === 'dusk') out.push({ kind: 'firefly', rate: 2.5, c: hex('#ffe08a'), life: 8, sway: 14, bob: 8, y: (x) => World.groundAt(x) - 10 - Math.random() * 140 });
    else out.push({ kind: 'mote', rate: 2.5, c: hex('#fff4d0'), life: 5, sway: 10, bob: 4, vy: -2 });
    return out;
  };
  def.onScan = (A) => CanopyAI.onScan(A);
  def.onSong = (x) => CanopyAI.song(x);
  def.onWater = (tx, ty) => CanopyAI.water(tx, ty);
  def.photoBonus = (A, crop, subs, main) => CanopyAI.photoBonus(A, crop, subs, main);
  def.S = S;
  return def;
})();
