/* ------------------------------------------------------------------
   WorldMap — the Hoenn photo map: a full-screen voxel diorama of the
   island. The camera sweeps in when the map opens, glides over to any
   place you tap, and when you travel it flies along the route and dives
   down into the destination. Drag to spin and tilt, pinch or wheel to
   zoom.
   Landmarks stand on the terrain as depth-tested billboards: the
   lighthouse, the dock and houses of Coral Cove, the Weather Institute,
   the giant trees of Treetop Town, the waterfall at Starfall Cave and
   the Seaside Stage. Clouds drift and cast shadows, the sea glitters
   and foams along the coast, rivers run down from the mountains, the
   volcano smokes, Wingull circle, boats bob and Wailord spouts
   offshore — and it all follows the time of day (at night: stars, lit
   windows and a sweeping lighthouse beam).
------------------------------------------------------------------- */
const WorldMap = (() => {
  const { clamp, lerp, smooth, hex, mix, fbm, vnoise, ease } = U;
  const N = 512, SC = N / 256;           // grid resolution; world units run 0..256
  const M = { on: false, t: 0, dist: 1, sel: null, drag: null, built: false, anim: 0, closing: 0, travel: null, shot: null, reveal: null, idleT: 0 };
  const CAM = { fx: 128, fy: 150, yaw: 0.6, pitch: 0.55, zoom: 1 };
  const GOAL = { fx: 128, fy: 150, yaw: 0.6, pitch: 0.55, zoom: 1 };
  // locations in world space (0..256) with a nice viewing angle for each
  const LOC = {
    beach: { x: 118, y: 191, yaw: 0.25, label: 'Coral Cove' },
    forest: { x: 178, y: 130, yaw: 0.95, label: 'Weather Woods' },
    canopy: { x: 150, y: 84, yaw: 0.45, label: 'Treetop Town' },
    falls: { x: 93, y: 88, yaw: -0.5, label: 'Starfall Cave' },
    stage: { x: 208, y: 190, yaw: 1.25, label: 'Seaside Stage' },
  };
  const ROUTES = [['beach', 'forest'], ['forest', 'canopy'], ['canopy', 'falls'], ['forest', 'stage'], ['beach', 'stage'], ['canopy', 'volcano'], ['beach', 'shoal']];
  const RIVERS = [
    [[136, 121], [150, 127], [164, 133], [178, 141], [194, 149], [210, 155], [228, 158], [246, 160], [256, 161]],
    [[97, 95], [91, 106], [82, 118], [71, 131], [58, 143], [42, 151], [22, 156], [4, 158]],
  ];
  const LAKES = [{ x: 97, y: 92, r: 6 }, { x: 188, y: 126, r: 4.5 }];
  let HM = null, CM = null, WL = null, WATER = null, COAST = null, WPH = null, FOGM = null, ZB = null, ZBW = 0, ZBH = 0;
  let SPR = null, BB = [], CLOUDS = [], PUFFS = [], BIRDS = [], SPOUT = [], STARS = [];
  const OCEAN = hex('#153a88'), OCEAN2 = hex('#2a58aa'), DARKSEA = hex('#0a1840'), ROUTE_C = hex('#fff2b0'), ROUTE_S = hex('#5a4020'), NAVY = hex('#0a1030'), BALL_R = hex('#e8323c'), HERE_C = hex('#3a78c8');
  const SIN = new Float32Array(1024); for (let i = 0; i < 1024; i++) SIN[i] = Math.sin(i / 1024 * Math.PI * 2);

  /* ================= terrain ================= */
  const segD = (x, y, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1; const k = clamp(((x - ax) * vx + (y - ay) * vy) / L, 0, 1); return Math.hypot(x - ax - vx * k, y - ay - vy * k); };
  function ground(x, y) {
    const u = x / 256 - 0.5, v = y / 256 - 0.5;
    // the main island and a few islets
    let isl = 1 - Math.hypot(u * 1.25, v * 1.45) * 2.1;
    isl = Math.max(isl, 0.55 - Math.hypot(u - 0.36, v - 0.3) * 7, 0.45 - Math.hypot(u + 0.34, v - 0.36) * 8, 0.4 - Math.hypot(u - 0.4, v + 0.36) * 9);
    let h = isl * 0.9 + (fbm(x * 0.022, y * 0.022, 5, 5) - 0.5) * 0.7;
    // craggy mountains to the north-west
    const dm = Math.hypot(x - 84, y - 68);
    if (dm < 66) { const r = 1 - Math.abs(vnoise(x * 0.085, y * 0.085, 7) * 2 - 1); h += Math.max(0, 1 - dm / 62) * (0.7 + r * 0.55); }
    // the volcano and its crater
    const dv = Math.hypot(x - 128, y - 110);
    h += Math.max(0, 1 - dv / 34) * 0.95 - (dv < 7 ? (7 - dv) * 0.07 : 0);
    // Coral Cove: a sheltered bay with a sandy rim
    const db = Math.hypot((x - 118) * 1.05, (y - 207) * 1.15);
    if (db < 24) h = Math.min(h, lerp(-0.24, Math.max(h, 0.05), smooth(8, 21, db)));
    // the lighthouse islet
    h = Math.max(h, 0.26 - Math.hypot(x - 143, y - 219) * 0.06);
    // the Fossil Cliffs east of the cove
    const dc = segD(x, y, 136, 200, 160, 196);
    if (dc < 9) h = Math.max(h, 0.36 * smooth(9, 4, dc) + (vnoise(x * 0.4, y * 0.4, 3) - 0.5) * 0.05);
    // a green headland out to the Seaside Stage
    h = Math.max(h, 0.19 - segD(x, y, 186, 170, 212, 192) * 0.022);
    return Math.max(-0.45, h);
  }
  function build() {
    const NN = N * N;
    HM = new Float32Array(NN); CM = new Uint32Array(NN); WL = new Float32Array(NN); WATER = new Uint8Array(NN); COAST = new Uint8Array(NN); WPH = new Uint8Array(NN);
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) HM[gy * N + gx] = ground(gx / SC, gy / SC);
    // leafy canopy bumps (so forests are lumpy and catch the light)
    const forestK = (x, y) => {
      const h = HM[(y * SC | 0) * N + (x * SC | 0)];
      if (h < 0.1 || h > 0.85) return 0;
      const wood = vnoise(x * 0.06, y * 0.06, 9) > 0.46 || Math.hypot(x - 178, y - 130) < 26 || Math.hypot(x - 150, y - 86) < 20;
      return wood ? 1 : 0;
    };
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const x = gx / SC, y = gy / SC;
      if (forestK(x, y)) HM[gy * N + gx] += Math.max(0, vnoise(x * 0.8, y * 0.8, 19) - 0.35) * 0.14;
    }
    // sea
    for (let i = 0; i < NN; i++) if (HM[i] < 0.02) { WATER[i] = 1; WL[i] = 0.02; }
    // lakes (a mountain tarn under the falls, the woods pond)
    const hAt = (x, y) => HM[clamp(Math.round(y * SC), 0, N - 1) * N + clamp(Math.round(x * SC), 0, N - 1)];
    for (const L of LAKES) {
      const lvl = hAt(L.x, L.y) - 0.01;
      L.level = lvl;
      stampDisc(L.x, L.y, L.r + 2.5, (i, dd) => {
        if (dd < L.r) { WATER[i] = 1; WL[i] = lvl; HM[i] = Math.min(HM[i], lvl - 0.04 - (L.r - dd) * 0.01); }
        else HM[i] = Math.min(HM[i], lerp(lvl + 0.012, HM[i], (dd - L.r) / 2.5));
      });
    }
    // rivers, always running downhill
    for (const R of RIVERS) {
      const pts = [];
      for (let s = 0; s < R.length - 1; s++) { const [ax, ay] = R[s], [bx, by] = R[s + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(ay, by, k / n)]); }
      let lvl = 9;
      pts.forEach(([x, y], k) => {
        lvl = Math.max(0.02, Math.min(lvl, hAt(x, y) - 0.02));
        const w = lerp(0.9, 2.2, k / pts.length);
        stampDisc(x, y, w + 2, (i, dd) => {
          if (dd < w) { if (!WATER[i] || WL[i] > lvl) { WATER[i] = 1; WL[i] = lvl; } HM[i] = Math.min(HM[i], lvl - 0.03); }
          else if (!WATER[i]) HM[i] = Math.min(HM[i], lerp(lvl + 0.01, HM[i], (dd - w) / 2));
        });
      });
    }
    // the dock in the cove: planks on posts over the water
    for (let y = 195.5; y < 207.5; y += 0.5) for (let x = 113.5; x < 115.6; x += 0.5) { const i = Math.round(y * SC) * N + Math.round(x * SC); WATER[i] = 0; HM[i] = 0.05; }
    // distance to the coast for sea cells (waves and foam)
    let front = [];
    for (let i = 0; i < NN; i++) if (!WATER[i]) front.push(i);
    for (let d = 1; d <= 12 && front.length; d++) {
      const nxt = [];
      for (const i of front) { const x = i % N; for (const j of [i - 1, i + 1, i - N, i + N]) { if (j < 0 || j >= NN || (j === i - 1 && x === 0) || (j === i + 1 && x === N - 1)) continue; if (WATER[j] && !COAST[j] && WL[j] <= 0.021) { COAST[j] = d; nxt.push(j); } } }
      front = nxt;
    }
    for (let i = 0; i < NN; i++) WPH[i] = (Math.imul(i, 2654435761) >>> 24);
    colour();
    makeSprites();
    placeBillboards();
    M.built = true;
  }
  function stampDisc(cx, cy, R, fn) {
    const x0 = Math.max(0, Math.floor((cx - R) * SC)), x1 = Math.min(N - 1, Math.ceil((cx + R) * SC)), y0 = Math.max(0, Math.floor((cy - R) * SC)), y1 = Math.min(N - 1, Math.ceil((cy + R) * SC));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const dd = Math.hypot(gx / SC - cx, gy / SC - cy); if (dd <= R) fn(gy * N + gx, dd); }
  }
  function colour() {
    const C = hex;
    const deep = C('#163a86'), sea = C('#2462c0'), shallow = C('#35a0d8'), lagoon = C('#52cce0'), river = C('#3a8ed8');
    const sand = C('#ecd49a'), sandW = C('#d4b47a'), grass = C('#62b24e'), grass2 = C('#4a9a40'), meadow = C('#78c25a');
    const wood = C('#2e7a36'), wood2 = C('#215c2c'), lush = C('#1f6430'), lush2 = C('#2f8a3a');
    const rock = C('#8e7e6c'), rock2 = C('#6a5e54'), snow = C('#f4f8ff'), ash = C('#8a8084'), lava = C('#ff6a2a'), cliff = C('#c49a6a'), plank = C('#a87a4a');
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const i = gy * N + gx, x = gx / SC, y = gy / SC, h = HM[i];
      const n = U.hash(gx, gy, 3), f = vnoise(x * 0.9, y * 0.9, 13);
      let c;
      if (WATER[i]) {
        const dep = WL[i] - h;
        if (WL[i] > 0.021) c = mix(river, C('#1e5aa8'), clamp(dep * 3, 0, 0.6));
        else c = dep > 0.34 ? deep : dep > 0.14 ? mix(sea, deep, (dep - 0.14) / 0.2) : dep > 0.05 ? mix(shallow, sea, (dep - 0.05) / 0.09) : mix(lagoon, shallow, dep / 0.05);
        // coral patches in the cove shallows
        if (dep < 0.12 && Math.hypot(x - 118, y - 207) < 26 && vnoise(x * 0.5, y * 0.5, 23) > 0.64) c = mix(c, C('#f08aa0'), 0.4);
        if (dep < 0.2 && n > 0.93) c = mix(c, 0xffffffff, 0.08);
      } else {
        const dv = Math.hypot(x - 128, y - 110), lushZ = Math.hypot(x - 178, y - 130) < 27;
        if (Math.abs(y - 201) < 6.5 && x > 113 && x < 116 && h < 0.06) c = (Math.round(y * 2) % 3 === 0) ? C('#6a4a2c') : plank;
        else if (h < 0.07) c = h < 0.035 ? sandW : sand;
        else if (h > 1.28) c = snow;
        else if (h > 0.78) c = n > 0.5 ? rock : rock2;
        else {
          const isWood = vnoise(x * 0.06, y * 0.06, 9) > 0.46 || lushZ || Math.hypot(x - 150, y - 86) < 20;
          if (isWood) c = lushZ ? (f > 0.5 ? lush2 : lush) : (f > 0.5 ? wood : wood2);
          else { c = n > 0.5 ? grass : grass2; if (vnoise(x * 0.2, y * 0.2, 5) > 0.62) c = meadow; if (n > 0.975) c = n > 0.988 ? C('#ffd84a') : C('#ff8ab0'); }
        }
        if (segD(x, y, 136, 200, 160, 196) < 5 && h > 0.12) c = mix(cliff, rock2, n * 0.4);
        if (dv < 30 && h > 0.5) c = mix(c, ash, 0.62);
        if (Math.hypot(x - 41, y - 220) < 16 && h > 0.02) c = mix(c, snow, 0.8 - (n > 0.7 ? 0.2 : 0));
        if (dv < 6 && h > 0.85) c = lava;
        // soft texture
        if (c !== lava) c = mix(c, f > 0.5 ? 0xffffffff : 0xff102018, Math.abs(f - 0.5) * 0.28);
      }
      // slope light from the north-west (land only)
      if (!WATER[i]) {
        const hx = HM[i] - HM[gy * N + Math.max(0, gx - 1)], hy = HM[i] - HM[Math.max(0, gy - 1) * N + gx];
        const l = clamp(0.86 + (hx + hy) * 9, 0.52, 1.3);
        c = U.pack(U.R(c) * l, U.G(c) * l, U.B(c) * l);
      }
      CM[i] = c;
    }
    // trodden footpaths along the routes
    for (const [a, b] of ROUTES) for (const [x, y] of routePts(a, b, 0.5)) { const i = Math.round(y * SC) * N + Math.round(x * SC); if (!WATER[i] && HM[i] > 0.07 && HM[i] < 0.8) CM[i] = mix(CM[i], C('#e8d4a0'), 0.55); }
  }
  // route curve between two places (a gentle arc)
  function routePts(a, b, step = 1) {
    const A = LOC[a], B = LOC[b], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / L * L * 0.12, cy = my + dx / L * L * 0.12, n = Math.max(2, Math.ceil(L / step)), out = [];
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * A.x + 2 * u * t * cx + t * t * B.x, u * u * A.y + 2 * u * t * cy + t * t * B.y]); }
    return out;
  }
  function heightAt(x, y) {
    const gx = clamp(x * SC, 0, N - 1.001), gy = clamp(y * SC, 0, N - 1.001), ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i = iy * N + ix;
    const h = (k) => (WATER[k] ? WL[k] : HM[k]);
    return lerp(lerp(h(i), h(i + 1), fx), lerp(h(i + N), h(i + N + 1), fx), fy);
  }

  /* ================= billboard sprites ================= */
  const ART = {
    palm: { rows: ['.LL...LL.', 'LGGL.LGGL', 'G..GLG..G', '...GtG...', '..G.t.G..', '....t....', '....t....', '...t.....', '...t.....', '...t.....', '..ttt....'], pal: { L: '#9ae070', G: '#3a9a44', t: '#9a7048' } },
    tree: { rows: ['..LLL..', '.LLLGL.', 'LLGLGGG', 'LGGGGGD', 'GGGGGDD', '.GGDDD.', '...t...', '...t...', '..tt...'], pal: { L: '#8ad060', G: '#3e9a3e', D: '#246a2c', t: '#7a5a38' } },
    rtree: { rows: ['...LLL...', '.LLGGGL..', 'LLGGGGGL.', 'LGGGGGGGD', 'GGGGGGGDD', '.GGGGGDD.', '..DGDDD..', '....t....', '....t....', '...ttt...'], pal: { L: '#6ac858', G: '#2a7a36', D: '#185028', t: '#6a4a2c' } },
    pine: { rows: ['...L...', '...G...', '..LGG..', '..GGD..', '.LGGGD.', '..GGD..', '.LGGGD.', 'LGGGGDD', '...t...', '...t...'], pal: { L: '#78b878', G: '#2e6e44', D: '#1e4a30', t: '#6a4a2c' } },
    snowpine: { rows: ['...W...', '...G...', '..WGG..', '..GGD..', '.WWGGD.', '..GGD..', '.WGGGD.', 'WGGGGDD', '...t...', '...t...'], pal: { W: '#f4f8ff', G: '#2e6e44', D: '#1e4a30', t: '#6a4a2c' } },
    giant: { rows: ['....LLLLL....', '..LLLGGGLLL..', '.LLGGGGGGGGL.', 'LLGGGGGGGGGGD', 'LGGGGGGGGGGDD', 'GGGGGGGGGGDDD', '.GGGGGGGGDDD.', '..DGGGDGDDD..', '....DtttD....', '.....ttt.....', '...hhttt.....', '..hhhhtt.....', '...wwhtt.....', '.....tttff...', '.....ttt.....', '.....ttt.....', '.....ttt.....', '.....ttt.....', '....ttttt....', '...tt.t.tt...'], pal: { L: '#7ad060', G: '#2e8a3e', D: '#1c5a2c', t: '#8a6040', h: '#c8563a', w: '#e8c890', f: '#ffd860' }, lit: 'wf' },
    houseR: { rows: ['...R...', '..RRR..', '.RRRRR.', 'RRRRRRR', '.WWWWW.', '.WdWwW.', '.WdWWW.'], pal: { R: '#e0503a', W: '#f4ecd8', d: '#6a4a2a', w: '#6ab8f0' }, lit: 'w' },
    houseB: { rows: ['...R...', '..RRR..', '.RRRRR.', 'RRRRRRR', '.WWWWW.', '.WwWdW.', '.WWWdW.'], pal: { R: '#3a6ad8', W: '#f4ecd8', d: '#6a4a2a', w: '#6ab8f0' }, lit: 'w' },
    houseG: { rows: ['..RRR..', '.RRRRR.', 'RRRRRRR', '.WWWWW.', '.WwWwW.', '.WWdWW.'], pal: { R: '#3a9a5a', W: '#f0e4cc', d: '#6a4a2a', w: '#6ab8f0' }, lit: 'w' },
    lighthouse: { rows: ['..Y..', '.KYK.', '.KKK.', '.RRR.', '.WWW.', '.RRR.', '.WWW.', '.RRR.', '.WWW.', '.RRR.', 'RWWWR', '.WWW.', 'WWWWW', 'SSSSS', 'SSSSS'], pal: { Y: '#fff4a0', K: '#2a2e40', R: '#e0483a', W: '#f8f4ec', S: '#8a8078' }, lit: 'Y' },
    institute: { rows: ['......a......', '.....BBB.....', '....BBBBB....', '.WWWWWWWWWWW.', '.WwWwWWWwWwW.', '.WWWWWWWWWWW.', '.WwWwWdWwWwW.', '.WWWWWdWWWWW.', 'GGGGGGGGGGGGG'], pal: { a: '#c8c8d0', B: '#3a7ad8', W: '#f4f6fa', w: '#8ac8f0', d: '#5a6070', G: '#6a9a5a' }, lit: 'w' },
    stage: { rows: ['....PPPPPPP....', '..PPYYYYYYYPP..', '.PYYkkkkkkkYYP.', 'PYkkkkkkkkkkkYP', 'PYkkppppppkkkYP', 'PYkpkkkkkkpkkYP', 'PYkkkkkkkkkkkYP', 'WWWWWWWWWWWWWWW', 'wwwwwwwwwwwwwww', '..s.........s..'], pal: { P: '#e04a8a', Y: '#ffd84a', k: '#3a2448', p: '#6ac8ff', W: '#f4e8d0', w: '#a88060', s: '#5a4a3a' }, lit: 'Yp' },
    cave: { rows: ['..rrrrr..', '.rrkkkrr.', 'rrkkckkrr', 'rkkkkkkkr', 'rkkkkkkkr', 'rrkkkkkrr'], pal: { r: '#7a6a5c', k: '#141018', c: '#9ae8ff' }, lit: 'c' },
    icecave: { rows: ['..wwwww..', '.wwiiiww.', 'wwikkkiww', 'wikkckkiw', 'wikkkkkiw', 'wwkkkkkww'], pal: { w: '#f4f8ff', i: '#9ad8f8', k: '#10203a', c: '#6ad0ff' }, lit: 'c' },
    boat: { rows: ['...W...', '...WW..', '...WWW.', '...WWWW', 'bbbbbbb', '.bbbbb.'], pal: { W: '#f8f8f8', b: '#9a5a3a' } },
    wailord: { rows: ['......BBBBB......', '...BBBBBBBBBBB...', '.BBBBBBBBBBBBBBB.', 'wwwwwwwwwwwwwwwww'], pal: { B: '#3a6ab8', w: '#e8f4ff' } },
    rock: { rows: ['.rrr.', 'rrrrr', 'wwwww'], pal: { r: '#6a6a74', w: '#e8f4ff' } },
    bird0: { rows: ['W.W', '.W.'], pal: { W: '#ffffff' } },
    bird1: { rows: ['...', 'WWW'], pal: { W: '#ffffff' } },
    tent: { rows: ['...o...', '..ooo..', '.ooyoo.', 'ooyyyoo', 'oo.k.oo'], pal: { o: '#ff8a3a', y: '#ffd070', k: '#2a1a14' } },
  };
  function sprFrom(rows, pal, lit = '') {
    const h = rows.length, w = rows[0].length, d = new Uint32Array(w * h), nd = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      const c = hex(pal[ch]); d[y * w + x] = c;
      nd[y * w + x] = lit.includes(ch) ? (ch === 'w' || ch === 'd' ? hex('#ffd860') : c) : U.pack(U.R(c) * 0.34, U.G(c) * 0.4, U.B(c) * 0.66);
    }
    return { w, h, d, nd };
  }
  function makeSprites() {
    SPR = {};
    for (const k in ART) SPR[k] = sprFrom(ART[k].rows, ART[k].pal, ART[k].lit || '');
    // waterfall frames: streaks sliding down
    SPR.falls = [0, 1, 2, 3].map((f) => {
      const rows = [];
      for (let y = 0; y < 16; y++) { let r = ''; for (let x = 0; x < 5; x++) r += y > 13 ? 'f' : ((y + f + x * 3) % 4 === 0 ? 'w' : (x === 0 || x === 4) ? 'e' : 'b'); rows.push(r); }
      return sprFrom(rows, { w: '#ffffff', b: '#a8dcff', e: '#6ab0e8', f: '#f4fbff' });
    });
    // soft clouds and smoke puffs
    const blob = (w, h, parts, top, bot) => {
      const d = new Uint32Array(w * h), nd = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let inn = false; for (const [cx, cy, rx, ry] of parts) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) inn = true;
        if (!inn) continue;
        const c = mix(top, bot, clamp((y - h * 0.35) / (h * 0.65), 0, 1));
        d[y * w + x] = c; nd[y * w + x] = U.pack(U.R(c) * 0.42, U.G(c) * 0.46, U.B(c) * 0.7);
      }
      return { w, h, d, nd };
    };
    SPR.cloud = [
      blob(28, 11, [[7, 7, 7, 4], [14, 5, 7, 5], [21, 7, 7, 4], [14, 8, 12, 3]], 0xffffffff, hex('#d2def0')),
      blob(20, 9, [[6, 5, 6, 4], [13, 4, 6, 4], [10, 6, 9, 3]], 0xffffffff, hex('#d8e2f2')),
    ];
    SPR.puff = blob(7, 6, [[3, 3, 3.4, 3]], hex('#d8d4d4'), hex('#a8a2a4'));
  }
  function placeBillboards() {
    BB = [];
    const r = U.rng(4242);
    const add = (s, x, y, o = {}) => { const b = Object.assign({ s, x, y, dh: 0, sc: 1 }, o); BB.push(b); return b; };
    const land = (x, y) => { const i = Math.round(y * SC) * N + Math.round(x * SC); return !WATER[i] ? HM[i] : null; };
    // Coral Cove: town, palms, lighthouse, boats
    for (const [x, y, k] of [[104, 186, 'houseR'], [110, 182, 'houseB'], [124, 182, 'houseR'], [130, 187, 'houseG'], [98, 190, 'houseB']]) if (land(x, y) !== null) add(k, x, y);
    for (let k = 0; k < 90 && BB.filter((b) => b.s === 'palm').length < 12; k++) { const a = r() * Math.PI, x = 118 + Math.cos(a + Math.PI) * 22 * (0.9 + r() * 0.3), y = 207 - Math.sin(a) * 19 * (0.9 + r() * 0.25); const h = land(x, y); if (h !== null && h < 0.12) add('palm', x, y, { sc: 0.9 + r() * 0.3 }); }
    add('lighthouse', 143, 219, { sc: 1.1, lamp: true });
    M.boats = [add('boat', 111, 212, { bob: 1 }), add('boat', 66, 206, { bob: 1, drift: 1.2 })];
    // Weather Woods: the Institute and rainforest trees
    add('institute', 168, 119, { sc: 1 });
    for (let k = 0; k < 160; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 27, x = 178 + Math.cos(a) * d, y = 130 + Math.sin(a) * d; const h = land(x, y); if (h !== null && h > 0.08 && h < 0.8 && Math.hypot(x - 168, y - 119) > 6) add('rtree', x, y, { sc: 0.8 + r() * 0.45 }); if (BB.length > 150) break; }
    // Treetop Town: giant trees with tree houses
    for (const [x, y, s] of [[146, 80, 2.3], [155, 84, 2.6], [149, 90, 2.1], [140, 86, 1.9], [158, 77, 2.0], [162, 90, 1.8], [152, 76, 1.7]]) if (land(x, y) !== null) add('giant', x, y, { sc: s });
    // Starfall Cave: the cave mouth and the waterfall into the tarn
    add('cave', 88, 81, { sc: 1.2 });
    add('falls', 97, 86.5, { sc: 1.25, anim: 1 });
    add('tent', 101, 97, { sc: 0.9 });
    // Seaside Stage
    add('stage', 209, 191, { sc: 1.05 });
    // Lavaridge huts on the volcano's flank, and the icy mouth of Shoal Cave on its islet
    for (const [x, y, k] of [[116, 124, 'houseR'], [121, 127, 'houseG'], [111, 121, 'houseB']]) if (land(x, y) !== null) add(k, x, y, { sc: 0.8 });
    add('icecave', 40, 214, { sc: 1.1 });
    for (const [x, y] of [[34, 222], [47, 225], [37, 211], [50, 216]]) if (land(x, y) !== null) add('snowpine', x, y, { sc: 0.9 });
    // forests and meadows elsewhere
    for (let k = 0; k < 900 && BB.length < 420; k++) {
      const x = 20 + r() * 216, y = 30 + r() * 200, h = land(x, y);
      if (h === null || h < 0.09) continue;
      const nearLoc = Object.values(LOC).some((L) => Math.hypot(L.x - x, L.y - y) < 7);
      if (nearLoc) continue;
      const woods = vnoise(x * 0.06, y * 0.06, 9) > 0.46;
      if (h > 0.62 && h < 1.3) { if (r() < 0.55) add(h > 1.05 ? 'snowpine' : 'pine', x, y, { sc: 0.8 + r() * 0.4 }); }
      else if (h < 0.62 && (woods ? r() < 0.8 : r() < 0.18)) add('tree', x, y, { sc: 0.75 + r() * 0.45 });
    }
    // sea rocks with surf
    for (let k = 0; k < 400 && BB.filter((b) => b.s === 'rock').length < 14; k++) { const x = r() * 256, y = r() * 256, i = Math.round(y * SC) * N + Math.round(x * SC); if (WATER[i] && COAST[i] >= 3 && COAST[i] <= 7) add('rock', x, y, { sc: 0.8 + r() * 0.5, sea: true }); }
    M.wailord = add('wailord', 44, 222, { sea: true, sc: 1.1 });
    for (const b of BB) b.h = heightAt(b.x, b.y) + b.dh;
    // clouds, birds, stars
    CLOUDS = [];
    for (let k = 0; k < 9; k++) CLOUDS.push({ x: r() * 256, y: r() * 256, h: 2.5 + r() * 0.6, big: r() < 0.55 ? 0 : 1, sc: 1 + r() * 0.6 });
    BIRDS = [];
    for (let k = 0; k < 6; k++) BIRDS.push({ a: r() * 6.28, r: 10 + r() * 8, cx: 120 + r() * 10, cy: 200 + r() * 8, h: 1.1 + r() * 0.4, sp: 0.5 + r() * 0.3 });
    STARS = [];
    for (let k = 0; k < 120; k++) STARS.push({ u: r(), v: r(), b: r() });
  }
  function lockFog() {
    FOGM = new Float32Array(N * N);
    const locked = Object.keys(LOC).filter((id) => !Save.unlocked(id));
    if (!locked.length) return;
    for (const id of locked) { const L = LOC[id]; stampDisc(L.x, L.y, 24, (i, dd) => { const gx = i % N, gy = (i / N) | 0; const k = clamp(1.35 - dd / 20 + (vnoise(gx * 0.1, gy * 0.1, 5) - 0.5) * 0.9, 0, 1); FOGM[i] = Math.max(FOGM[i], k); }); }
  }

  /* ================= camera ================= */
  const wrapA = U.wrapA;
  function shot(to, dur, ez = ease.inOut) { M.shot = { from: Object.assign({}, CAM), to: Object.assign({}, CAM, to), t: 0, dur, ez }; }
  function applyShot(dt) {
    const S = M.shot; S.t += dt;
    const k = S.ez(clamp(S.t / S.dur, 0, 1));
    CAM.fx = lerp(S.from.fx, S.to.fx, k); CAM.fy = lerp(S.from.fy, S.to.fy, k);
    CAM.yaw = S.from.yaw + wrapA(S.to.yaw - S.from.yaw) * k;
    CAM.pitch = lerp(S.from.pitch, S.to.pitch, k); CAM.zoom = lerp(S.from.zoom, S.to.zoom, k);
    if (S.t >= S.dur) { M.shot = null; Object.assign(GOAL, CAM); }
  }
  function select(id) {
    M.sel = id; SFX.select(); M.idleT = 0;
    const L = LOC[id];
    shot({ fx: L.x, fy: L.y, yaw: CAM.yaw + wrapA(L.yaw - CAM.yaw) * 0.6, pitch: 0.5, zoom: 0.72 }, 1.15);
  }
  function path(a, b) {
    // breadth-first over the routes, then stitch the arcs
    const prev = { [a]: null }, q = [a];
    while (q.length) { const c = q.shift(); if (c === b) break; for (const [p, r2] of ROUTES) { const n = p === c ? r2 : r2 === c ? p : null; if (n && !(n in prev)) { prev[n] = c; q.push(n); } } }
    if (!(b in prev)) return [[LOC[a].x, LOC[a].y], [LOC[b].x, LOC[b].y]];
    const chain = []; for (let c = b; c; c = prev[c]) chain.unshift(c);
    let pts = [];
    for (let k = 0; k < chain.length - 1; k++) { const fwd = ROUTES.some(([p, q2]) => p === chain[k] && q2 === chain[k + 1]); let seg = fwd ? routePts(chain[k], chain[k + 1], 1) : routePts(chain[k + 1], chain[k], 1).reverse(); pts = pts.concat(k ? seg.slice(1) : seg); }
    return pts;
  }
  function travelTo(id) {
    const from = Game.areaId && LOC[Game.areaId] ? Game.areaId : id;
    const pts = path(from, id), len = [0];
    for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    M.travel = { id, t: 0, pts, len, total: len[len.length - 1] || 1, start: Object.assign({}, CAM), done: false };
    M.shot = null; SFX.unlock();
    // a flyer carries Mudkip there
    if (typeof Mailman !== 'undefined' && id !== from) { FLY = 3.2; Mailman.F.dur = FLY + DIVE; Mailman.start(id); } else FLY = 1.6;
  }
  function pathAt(T, u) {
    const want = u * T.total; let k = 1;
    while (k < T.len.length - 1 && T.len[k] < want) k++;
    const a = T.pts[k - 1], b = T.pts[Math.min(k, T.pts.length - 1)], seg = (T.len[k] - T.len[k - 1]) || 1, f = clamp((want - T.len[k - 1]) / seg, 0, 1);
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.atan2(b[0] - a[0], -(b[1] - a[1]))];
  }
  let FLY = 1.6; const DIVE = 0.75, WIPE = 0.5;
  function updateTravel(dt) {
    const T = M.travel; T.t += dt;
    if (T.t < FLY) {
      const u = ease.inOut(T.t / FLY), [x, y, dir] = pathAt(T, u), k = Math.min(1, T.t / 0.5);
      CAM.fx = lerp(T.start.fx, x, k); CAM.fy = lerp(T.start.fy, y, k);
      if (T.total > 4) CAM.yaw += wrapA(dir - CAM.yaw) * Math.min(1, dt * 2.4);
      CAM.pitch = lerp(CAM.pitch, 0.66, dt * 2); CAM.zoom = lerp(CAM.zoom, 1.05, dt * 2);
      T.mark = [x, y];
    } else {
      const k = ease.inCubic(clamp((T.t - FLY) / DIVE, 0, 1)), L = LOC[T.id];
      CAM.fx = lerp(CAM.fx, L.x, dt * 6); CAM.fy = lerp(CAM.fy, L.y, dt * 6);
      CAM.zoom = lerp(1.05, 0.24, k); CAM.pitch = lerp(0.66, 0.28, k); T.mark = [L.x, L.y];
    }
    if (T.t > FLY + DIVE - 0.2 && !T.done && T.t > FLY + DIVE - 0.2 + WIPE) {
      T.done = true;
      if (typeof Mailman !== 'undefined') Mailman.stop();
      Game.enterArea(T.id);
      M.reveal = { t: 0 }; M.on = false; M.travel = null; Game.mode = 'explore';
    }
  }

  /* ================= open / close / update ================= */
  function open() {
    if (!Save.found('mail.map') && !/unlock=all/.test(location.search)) { HUD.toast('You have no map yet! Pelipper the postman by the mailbox has a delivery for you.', { life: 3.2 }); Game.sfx('error'); return; }
    if (Game.mode === 'camera') Photo.close();
    if (!M.built) build();
    lockFog();
    Game.mode = 'map'; M.on = true; M.t = 0; M.anim = 0; M.closing = 0; M.travel = null; M.reveal = null; M.idleT = 0;
    M.sel = Game.areaId && LOC[Game.areaId] ? Game.areaId : 'beach';
    const L = LOC[M.sel];
    Object.assign(CAM, { fx: 128, fy: 140, yaw: L.yaw - 1.2, pitch: 0.95, zoom: 2.0 });
    shot({ fx: L.x, fy: L.y, yaw: L.yaw, pitch: 0.55, zoom: 0.9 }, 2.0);
    SFX.dexOpen();
  }
  function close() { if (M.closing || M.travel) return; M.closing = 0.001; SFX.back(); }
  function update(dt) {
    M.t += dt; M.anim = Math.min(1, M.anim + dt * 2.5);
    if (M.closing) { M.closing += dt; if (M.closing > 0.4) { M.on = false; Game.mode = 'explore'; M.closing = 0; } }
    if (M.travel) { updateTravel(dt); if (typeof Mailman !== 'undefined') Mailman.update(dt); }
    else if (M.shot) applyShot(dt);
    else if (!M.drag) {
      M.idleT += dt;
      GOAL.yaw += dt * 0.035;
      const k = 1 - Math.exp(-dt * 3);
      CAM.fx = lerp(CAM.fx, GOAL.fx, k); CAM.fy = lerp(CAM.fy, GOAL.fy, k); CAM.yaw += wrapA(GOAL.yaw - CAM.yaw) * k; CAM.pitch = lerp(CAM.pitch, GOAL.pitch, k); CAM.zoom = lerp(CAM.zoom, GOAL.zoom, k);
    }
    // life on the map
    const t = M.t;
    for (const c of CLOUDS) { c.x += dt * 1.6; if (c.x > 290) c.x -= 330; }
    if (!PUFFS.last || t - PUFFS.last > 0.5) { PUFFS.last = t; PUFFS.push({ x: 128 + Math.random() * 2 - 1, y: 110, h: 1.62, t: 0, sc: 0.4 }); }
    for (let i = PUFFS.length - 1; i >= 0; i--) { const p = PUFFS[i]; p.t += dt; p.h += dt * 0.2; p.x += dt * 2.4; p.y += dt * 0.6; p.sc = 0.4 + p.t * 0.22; if (p.t > 6) PUFFS.splice(i, 1); }
    if (M.wailord) { M.wailord.x = 44 + Math.sin(t * 0.07) * 14; M.wailord.y = 222 + Math.cos(t * 0.05) * 5; if ((t % 7) < dt) for (let k = 0; k < 10; k++) SPOUT.push({ x: M.wailord.x + 1, y: M.wailord.y, h: 0.12, vh: 0.5 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 1.5, t: 0 }); }
    for (let i = SPOUT.length - 1; i >= 0; i--) { const s = SPOUT[i]; s.t += dt; s.h += s.vh * dt; s.vh -= dt * 0.9; s.x += s.vx * dt; if (s.h < 0.03 || s.t > 2) SPOUT.splice(i, 1); }
    if (M.boats) { const b = M.boats[1]; b.x += dt * (b.drift || 0) * 0.5; if (b.x > 90) b.x = 40; }
    for (const b of BIRDS) b.a += dt * b.sp;
  }

  /* ================= rendering ================= */
  const HOURS = {
    dawn: { sky0: '#5a70c0', sky1: '#ffc4a4', tone: [1.0, 0.9, 0.95], sun: 0.25 },
    noon: { sky0: '#2966c8', sky1: '#cde8f8', tone: null, sun: 0.75 },
    afternoon: { sky0: '#3a6cc0', sky1: '#f2e2bc', tone: [1.04, 0.97, 0.86], sun: 0.5 },
    dusk: { sky0: '#443e90', sky1: '#ff9a6a', tone: [1.0, 0.74, 0.62], sun: 0.12 },
    night: { sky0: '#080c26', sky1: '#26366a', tone: [0.34, 0.4, 0.66], sun: -1 },
  };
  let HC = null, HCk = '';
  function hourCfg() {
    const h = (typeof Game !== 'undefined' && Game.hour) ? Game.hour() : 'noon';
    if (HCk !== h) { const c = HOURS[h] || HOURS.noon; HC = { id: h, sky0: hex(c.sky0), sky1: hex(c.sky1), tone: c.tone ? c.tone.map((v) => Math.round(v * 256)) : null, sun: c.sun, night: h === 'night' }; HCk = h; }
    return HC;
  }
  const toneC = (c, T) => U.pack(((c & 255) * T[0]) >> 8, (((c >>> 8) & 255) * T[1]) >> 8, (((c >>> 16) & 255) * T[2]) >> 8);
  function render(fb, V, t) {
    const d = fb.d, FW = fb.w, W = V.w, H = V.h, X0 = V.x, Y0 = V.y, HCf = hourCfg();
    if (!ZB || ZBW !== fb.w || ZBH !== fb.h) { ZB = new Float32Array(fb.w * fb.h); ZBW = fb.w; ZBH = fb.h; }
    const D = 150 * CAM.zoom * M.dist;
    const sinY = Math.sin(CAM.yaw), cosY = Math.cos(CAM.yaw);
    const camX = CAM.fx - sinY * D, camY = CAM.fy + cosY * D;
    const K = H * 0.108, a = lerp(0.9, 5.6, CAM.pitch) * (H > W * 1.2 ? 1.45 : 1), hF = heightAt(CAM.fx, CAM.fy);
    const camH = hF * 60 + a * D, focusY = Y0 + H * 0.56, horizon = focusY - a * K;
    const fov = W / H > 1.2 ? 0.9 : 0.62;
    // ---- sky ----
    const sunX = X0 + W * (0.5 + Math.sin(CAM.yaw + 1.2) * 0.62), sunY = horizon - (H * 0.5) * Math.max(0.08, HCf.sun) - 6;
    const skyBot = Math.min(Y0 + H, Math.max(Y0, Math.ceil(horizon + 40)));
    for (let y = Y0; y < Y0 + H; y++) {
      const k = clamp((y - (horizon - H * 0.9)) / (H * 0.9 + 30), 0, 1), base = mix(HCf.sky0, HCf.sky1, k * k), row = y * FW;
      for (let x = X0; x < X0 + W; x++) { d[row + x] = base; ZB[row + x] = 1e9; }
    }
    if (HCf.night) {
      for (const s of STARS) { const x = X0 + Math.floor((((s.u + CAM.yaw * 0.16) % 1) + 1) % 1 * W), y = Math.floor(Y0 + s.v * Math.max(4, horizon - Y0 - 6)); if (y < skyBot && y >= Y0) d[y * FW + x] = mix(HCf.sky0, 0xffffffff, 0.35 + 0.65 * s.b * (0.6 + 0.4 * Math.sin(t * 2 + s.u * 40))); }
      disc(fb, sunX, horizon - H * 0.42, 5, hex('#fff4d0'), V); disc(fb, sunX + 2, horizon - H * 0.42 - 1, 4, HCf.sky0, V);
    } else if (sunY > Y0 - 10) {
      for (let y = Math.max(Y0, Math.floor(sunY - 26)); y < Math.min(Y0 + H, sunY + 26); y++) for (let x = Math.max(X0, Math.floor(sunX - 30)); x < Math.min(X0 + W, sunX + 30); x++) { const ds = Math.hypot(x - sunX, (y - sunY) * 1.2); if (ds < 28) d[y * FW + x] = ds < 5 ? 0xfff4ffff : mix(d[y * FW + x], 0xffe8fcff, (1 - ds / 28) * 0.55); }
    }
    // ---- terrain (front-to-back voxel columns) ----
    const ybuf = new Int32Array(W).fill(Y0 + H), prevH = new Float32Array(W).fill(-1);
    const fogC = HCf.sky1, tone = HCf.tone, shimmer = Math.floor(t * 5), wav = t * 1.7;
    const zBottom = (camH - hF * 60) * K / Math.max(8, Y0 + H - horizon), zStart = Math.max(3, zBottom * 0.55), zEnd = Math.min(560, D + 330);
    const glint = new Float32Array(W); if (!HCf.night) for (let sx = 0; sx < W; sx++) glint[sx] = Math.max(0, 1 - Math.abs(X0 + sx - sunX) / 34);
    const cls = CLOUDS.map((c) => ({ x: c.x - 16, y: c.y + 9, r2: (c.big ? 7 : 5.5) ** 2 * c.sc * c.sc }));
    const fogOn = !!FOGM, faceK = 0.2;
    for (let z = zStart; z < zEnd; z += Math.max(0.45, z * 0.0105)) {
      const plx = -fov * z;
      const lx = camX + sinY * z + cosY * plx, ly = camY - cosY * z + sinY * plx;
      const dx = (cosY * 2 * fov * z) / W, dy = (sinY * 2 * fov * z) / W;
      let px = lx, py = ly;
      const fog = clamp((z - D - 50) / 300, 0, 0.88), fogK = (fog * 256) | 0, near = z < 70, shade = z < D + 200;
      const pz = (camH / z) * K + horizon, hk = 60 / z * K;
      for (let sx = 0; sx < W; sx++, px += dx, py += dy) {
        const gx = px * SC, gy = py * SC;
        let h, c, i = -1;
        if (gx < 0 || gy < 0 || gx >= N - 1 || gy >= N - 1) { h = 0.02; const w1 = SIN[((gx * 5 + gy * 3) * 3 + (wav * 160 | 0)) & 1023] + SIN[((gx * 3 - gy * 4) * 2 - (wav * 120 | 0)) & 1023]; c = w1 > 1.45 ? OCEAN2 : OCEAN; }
        else {
          const ix = gx | 0, iy = gy | 0; i = iy * N + ix;
          if (WATER[i]) {
            h = WL[i]; c = CM[i];
            const cz = COAST[i];
            // rolling swell, foam on the shore, glitter toward the sun
            const w1 = SIN[((ix * 5 + iy * 3) * 3 + (wav * 160 | 0)) & 1023] + SIN[((ix * 3 - iy * 4) * 2 - (wav * 120 | 0)) & 1023];
            if (w1 > 1.45) c = mix(c, 0xffffffff, 0.16); else if (w1 < -1.5) c = mix(c, DARKSEA, 0.12);
            if (cz === 1) c = mix(c, 0xffffffff, 0.5);
            else if (cz > 1 && cz < 7) { const ph = ((t * 1.4 + WPH[i] / 256 * 0.6) % 4) + 1.2; if (Math.abs(cz - ph) < 0.55) c = mix(c, 0xffffffff, 0.34); }
            const hs = (Math.imul(i ^ (shimmer * 40503), 2654435761) >>> 22);
            if (hs < 2 + glint[sx] * 60) c = mix(c, 0xfffff8e8, 0.85);
          } else {
            if (near) { const fx = gx - ix, fy = gy - iy; h = lerp(lerp(HM[i], WATER[i + 1] ? WL[i + 1] : HM[i + 1], fx), lerp(WATER[i + N] ? WL[i + N] : HM[i + N], WATER[i + N + 1] ? WL[i + N + 1] : HM[i + N + 1], fx), fy); }
            else h = HM[i];
            c = CM[i];
          }
          if (fogOn && FOGM[i] > 0) { const k = FOGM[i]; c = mix(c, 0xfff4f4fa, k * 0.85); if (0.36 * k > h) h = 0.36 * k; }
          if (shade) for (let q = 0; q < cls.length; q++) { const C2 = cls[q], ex = px - C2.x, ey = py - C2.y, e2 = (ex * ex * 0.5 + ey * ey * 1.3) / C2.r2; if (e2 < 1 && (e2 < 0.7 || ((sx + (z | 0)) & 1))) { c = U.mixk(c, 0xff402010, WATER[i] ? 16 : 34); break; } }
        }
        if (tone) c = toneC(c, tone);
        if (fogK) c = U.mixk(c, fogC, fogK);
        const sy = (pz - h * hk) | 0;
        const yb = ybuf[sx], steep = h - prevH[sx] > 0.02 && prevH[sx] > -1;
        prevH[sx] = h;
        if (sy < yb) {
          const X = X0 + sx, top = Math.max(Y0, sy), face = steep && yb - top > 2 ? U.mixk(c, 0xff000000, 52) : c;
          for (let y = top; y < yb; y++) { const o = y * FW + X; d[o] = y - top < 2 ? c : face; ZB[o] = z; }
          ybuf[sx] = top;
        }
      }
    }
    const P = { camX, camY, camH, horizon, K, sinY, cosY, fov, W, H, X0, Y0, D, night: HCf.night, tone };
    // ---- routes (marching dashes) ----
    for (const [a, b] of ROUTES) {
      const on = Save.unlocked(a) && Save.unlocked(b), pts = routePts(a, b, 0.9);
      for (let k = 0; k < pts.length; k++) {
        if (on ? ((k + Math.floor(t * 5)) % 4) > 1 : k % 4) continue;
        const [x, y] = pts[k], p = project(P, x, y, heightAt(x, y) + 0.01);
        if (!p) continue;
        dot(fb, V, p, on ? ROUTE_C : 0x88c8c8c8, on ? ROUTE_S : 0);
      }
    }
    // ---- billboards, far to near ----
    const items = [];
    for (const b of BB) { const p = project(P, b.x, b.y, b.h + (b.bob ? Math.sin(t * 2 + b.x) * 0.012 : 0)); if (p && p[2] > 2) items.push({ p, b }); }
    for (const c of CLOUDS) { const p = project(P, c.x, c.y, c.h); if (p && p[2] > 45) items.push({ p, b: { s: 'cloud', big: c.big, sc: c.sc * 0.95, alpha: clamp((p[2] - 45) / 40, 0, 0.82) } }); }
    for (const q of PUFFS) { const p = project(P, q.x, q.y, q.h); if (p) items.push({ p, b: { s: 'puff', sc: q.sc, alpha: 0.6 * (1 - q.t / 6) } }); }
    items.sort((A, B) => B.p[2] - A.p[2]);
    for (const { p, b } of items) {
      let s = SPR[b.s];
      if (b.s === 'falls') s = s[Math.floor(t * 8) % 4];
      else if (b.s === 'cloud') s = s[b.big];
      blit(fb, V, P, s, p, b.sc, HCf.night, b.alpha);
    }
    // spouts, birds
    for (const s of SPOUT) { const p = project(P, s.x, s.y, s.h); if (p) dot(fb, V, p, 0xffe8f8ff, 0); }
    for (const q of BIRDS) { const p = project(P, q.cx + Math.cos(q.a) * q.r, q.cy + Math.sin(q.a) * q.r * 0.6, q.h + Math.sin(q.a * 3) * 0.05); if (p) blit(fb, V, P, SPR[Math.floor(t * 6 + q.r) % 2 ? 'bird0' : 'bird1'], p, 1, HCf.night); }
    // night: a sweeping lighthouse beam, fireflies over the woods
    if (HCf.night) {
      const lp = project(P, 143, 219, heightAt(143, 219) + 0.92);
      if (lp) { const ang = t * 1.1; beam(fb, V, lp[0], lp[1] - 1, ang); }
      for (let k = 0; k < 40; k++) { const x = 178 + Math.sin(k * 12.9 + t * 0.3) * 22, y = 130 + Math.cos(k * 7.3 + t * 0.25) * 20; if (Math.sin(t * 3 + k) < 0.2) continue; const p = project(P, x, y, heightAt(x, y) + 0.1); if (p) dot(fb, V, p, 0xff8affe0, 0); }
    }
    return P;
  }
  function project(P, x, y, h) {
    const rx = x - P.camX, ry = y - P.camY;
    const z = rx * P.sinY - ry * P.cosY, side = rx * P.cosY + ry * P.sinY;
    if (z < 3) return null;
    return [P.X0 + P.W / 2 + (side / (P.fov * z)) * (P.W / 2), (P.camH - h * 60) / z * P.K + P.horizon, z];
  }
  function blit(fb, V, P, s, p, sc0, night, alpha = 1) {
    const z = p[2], sc = sc0 * (200 / z) * (P.W / 400);
    if (sc < 0.2) return;
    const w = s.w * sc, h = s.h * sc, x0 = Math.round(p[0] - w / 2), y0 = Math.round(p[1] - h), x1 = Math.round(x0 + w), y1 = Math.round(p[1]);
    const d = fb.d, FW = fb.w, src = night ? s.nd : s.d, zt = z - 1.5;
    const fog = clamp((z - P.D - 50) / 300, 0, 0.88), fogK = (fog * 256) | 0, fogC = HC.sky1;
    for (let y = Math.max(V.y, y0); y < Math.min(V.y + V.h, y1); y++) {
      const sy = Math.min(s.h - 1, ((y - y0) / sc) | 0), row = sy * s.w, o0 = y * FW;
      for (let x = Math.max(V.x, x0); x < Math.min(V.x + V.w, x1); x++) {
        const c = src[row + Math.min(s.w - 1, ((x - x0) / sc) | 0)];
        if (!c) continue;
        const o = o0 + x; if (ZB[o] < zt) continue;
        let cc = P.tone && !night ? toneC(c, P.tone) : c;
        if (fogK) cc = U.mixk(cc, fogC, fogK);
        d[o] = alpha < 1 ? U.mix(d[o], cc, alpha) : cc;
      }
    }
  }
  function dot(fb, V, p, c, sh) {
    const x = Math.round(p[0]), y = Math.round(p[1]), FW = fb.w;
    for (const [dx, dy, col] of sh ? [[0, 1, sh], [1, 1, sh], [0, 0, c], [1, 0, c]] : [[0, 0, c]]) {
      const X = x + dx, Y = y + dy; if (X < V.x || Y < V.y || X >= V.x + V.w || Y >= V.y + V.h) continue;
      const o = Y * FW + X; if (ZB[o] < p[2] - 2.5) continue;
      fb.d[o] = (col >>> 24) < 255 ? U.mix(fb.d[o], col | 0xff000000, 0.5) : col;
    }
  }
  function disc(fb, cx, cy, r, c, V) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) { const X = Math.round(cx + x), Y = Math.round(cy + y); if (X >= V.x && Y >= V.y && X < V.x + V.w && Y < V.y + V.h) fb.d[Y * fb.w + X] = c; } }
  function beam(fb, V, x0, y0, ang) {
    const dir = Math.cos(ang), spread = 0.22, len = V.w * 0.6;
    for (let y = Math.max(V.y, Math.floor(y0 - 40)); y < Math.min(V.y + V.h, y0 + 40); y++) for (let x = V.x; x < V.x + V.w; x++) {
      const dx = x - x0, dy = (y - y0) * 2.5, L = Math.hypot(dx, dy); if (L < 2 || L > len) continue;
      const a = Math.atan2(dy, dx), tgt = dir > 0 ? 0 : Math.PI, da = Math.abs(wrapA(a - tgt + Math.sin(ang) * 0.3));
      if (da > spread * Math.abs(dir) + 0.02) continue;
      const k = (1 - L / len) * (1 - da / (spread * Math.abs(dir) + 0.02)) * 0.5 * Math.abs(dir);
      const o = y * fb.w + x; fb.d[o] = U.screen(fb.d[o], 0xffc8f8ff, k);
    }
  }

  /* ================= overlay: pins, labels, card, HUD ================= */
  function draw(fb, t) {
    const S = UI.skin(), W = fb.w, H = fb.h;
    const k = M.closing ? 1 - M.closing / 0.4 : Math.min(1, M.anim * 1.6);
    const V = { x: 0, y: 0, w: W, h: H };
    const P = render(fb, V, t);
    // pins
    const pins = [];
    for (const id in LOC) {
      const L = LOC[id], gh = heightAt(L.x, L.y);
      const g = project(P, L.x, L.y, gh), top = project(P, L.x, L.y, gh + 0.42);
      if (!g || !top || g[0] < -20 || g[0] > W + 20 || g[1] < -20 || g[1] > H + 40) continue;
      pins.push({ id, g, top, L });
    }
    // ground rings
    for (const { id, L } of pins) {
      const sel = M.sel === id, R = sel ? 4 + Math.sin(t * 4) * 0.8 : 3;
      for (let a = 0; a < 24; a++) { const an = a / 24 * Math.PI * 2, x = L.x + Math.cos(an) * R, y = L.y + Math.sin(an) * R; const p = project(P, x, y, heightAt(x, y) + 0.01); if (p) dot(fb, V, p, sel ? 0xff5affff : 0xffffffff, 0); }
    }
    // labels (stacked so they never overlap)
    pins.sort((A, B) => B.top[1] - A.top[1]);
    const boxes = [];
    for (const pin of pins) {
      const { id, top } = pin, un = Save.unlocked(id), lbl = un ? LOC[id].label : '???';
      const tw = Font.measure(lbl, 'small') + 8, bx = Math.round(top[0] - tw / 2);
      let by = Math.round(top[1] - 30 - (M.sel === id ? Math.sin(t * 3) * 1.5 : 0));
      for (let g = 0; g < 8; g++) { const hit = boxes.find((q) => bx < q.x1 && bx + tw > q.x0 && by < q.y1 && by + 12 > q.y0); if (!hit) break; by = hit.y0 - 13; }
      boxes.push({ x0: bx, x1: bx + tw, y0: by, y1: by + 12 });
      pin.box = { bx, by, tw, lbl, un };
    }
    for (const pin of pins) {
      const { id, g, top, box } = pin, { bx, by, tw, lbl, un } = box;
      const here = Game.areaId === id, sel = M.sel === id, pct = completion(id);
      const px = Math.round(top[0]), py = Math.round(top[1]);
      // pole + badge
      UI.line(fb, Math.round(g[0]), Math.round(g[1]), px, py + 6, 0xff1b2240);
      for (let a = 0; a < 40; a++) { const ang = (a / 40) * Math.PI * 2 - Math.PI / 2; UI.put(fb, Math.round(px + Math.cos(ang) * 8), Math.round(py + Math.sin(ang) * 8), a / 40 < pct ? (pct >= 1 ? 0xff4ad8ff : 0xff5aff7a) : 0xff3a4058); }
      UI.orb(fb, px, py, 6, un ? (here ? 0xff4ab8ff : S.body) : 0xff6a7088, { ol: 0xff1b2240 });
      Font.icon(fb, un ? (here ? 'cam' : 'pb') : 'lock', px - (un ? (here ? 4 : 3) : 2), py - 3, 1);
      // label
      if (by + 12 < py - 8) UI.line(fb, px, by + 12, px, py - 8, 0xaa1b2240);
      UI.rrect(fb, bx, by, tw, 12, 3, sel ? S.accent : 0xff1b2240);
      Font.draw(fb, lbl, bx + tw / 2, by + 3, 0xffffffff, { font: 'small', align: 'center' });
      if (here) Font.draw(fb, 'you are here', px, py + 11, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
      HUD.btn('pin-' + id, Math.min(bx, px - 10), by - 2, Math.max(tw, 20), py + 10 - by, () => { if (!M.travel) select(id); });
    }
    // travel marker: a glowing trail over the route
    if (M.travel && M.travel.mark) {
      const [x, y] = M.travel.mark, p = project(P, x, y, heightAt(x, y) + 0.25);
      if (p) { UI.disc(fb, Math.round(p[0]), Math.round(p[1]), 3, 0xffffffff); UI.disc(fb, Math.round(p[0]), Math.round(p[1]), 2, 0xff4ab8ff); for (let q = 1; q < 6; q++) { const u = clamp(ease.inOut(M.travel.t / FLY) - q * 0.02, 0, 1), [qx, qy] = pathAt(M.travel, u), pp = project(P, qx, qy, heightAt(qx, qy) + 0.25); if (pp) UI.put(fb, Math.round(pp[0]), Math.round(pp[1]), 0xffbfe8ff); } }
    }
    // rift in the sky once Palkia or Dialga has appeared
    if (Save.found('palkia.met') || Save.found('dialga.met')) {
      const p = project(P, 60, 190, 2.4);
      if (p) { const x = Math.round(p[0]), y = Math.round(p[1]); for (let a = 0; a < 30; a++) UI.put(fb, x + Math.round(Math.sin(a * 0.7 + t) * 6), y + a - 15, a % 2 ? 0xffff9ae8 : 0xff9ad8ff); Font.draw(fb, 'Rift', x, y - 22, 0xffffc8f0, { font: 'small', align: 'center', outline: 0xff1b2240 }); }
    }
    // top bar: title, compass, close
    const bar = Math.round((1 - k) * -24);
    UI.rectA(fb, 0, bar, W, 20, NAVY, 0.6);
    Font.draw(fb, 'HOENN PHOTO MAP', 26, bar + 6, 0xffffffff, { font: 'small' });
    compass(fb, 12, bar + 10, CAM.yaw);
    UI.panel(fb, W - 22, bar + 3, 16, 14, { r: 3, ol: S.ink, fill: S.btn }); Font.icon(fb, 'cross', W - 16, bar + 7, 1);
    HUD.btn('mapx', W - 26, bar, 26, 20, () => close());
    if (!M.sel && !M.travel) Font.draw(fb, 'tap a place  ·  drag to spin  ·  pinch to zoom', W / 2, H - 12, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
    // info card for the selected place
    if (M.sel && DexData.AREAS[M.sel] && !M.travel) {
      const a = DexData.AREAS[M.sel], un = Save.unlocked(M.sel), here = M.sel === Game.areaId;
      const cw = Math.min(214, W - 16), ch = 80, cx = 8, cyy = H - ch - 8 + Math.round((1 - k) * 90);
      UI.panel(fb, cx, cyy, cw, ch, { r: 5, ol: S.ink, fill: 0xfff4f6fb });
      UI.rect(fb, cx + 3, cyy + 3, 3, ch - 6, un ? S.accent : 0xff8a90a8);
      Font.draw(fb, un ? a.name : '??? (locked)', cx + 10, cyy + 7, 0xff1b2240, { font: 'title' });
      Font.draw(fb, a.sub, cx + 10, cyy + 23, 0xff5a6080, { font: 'small' });
      Font.draw(fb, un ? a.blurb : (M.sel === 'stage' ? 'Gather Meloetta\'s band to open the stage.' : 'Earn ' + a.need + ' research stamps to open (' + Quests.stamps() + ' so far).'), cx + 10, cyy + 33, 0xff1b2240, { font: 'small', maxW: cw - 18, lh: 9 });
      const sp = DexData.ORDER.filter((q) => (DexData.S[q].area || []).includes(M.sel)), seen = sp.filter((q) => Save.data.seen[q]).length, pc = completion(M.sel);
      Font.draw(fb, 'Pokémon ' + seen + '/' + sp.length, cx + 10, cyy + ch - 12, 0xff1b2240, { font: 'small' });
      const bw = 40, bxx = cx + 14 + Font.measure('Pokémon ' + seen + '/' + sp.length, 'small'); UI.rrect(fb, bxx, cyy + ch - 12, bw, 6, 2, 0xffd4d8e4); if (pc > 0) UI.rrect(fb, bxx, cyy + ch - 12, Math.max(3, Math.round(bw * pc)), 6, 2, pc >= 1 ? 0xff4ad8ff : 0xff5ad07a);
      Font.draw(fb, Math.round(pc * 100) + '%', bxx + bw + 4, cyy + ch - 12, 0xff1b2240, { font: 'small' });
      if (un && !here) {
        const bx = cx + cw - 56, by = cyy + ch - 21;
        UI.panel(fb, bx, by, 50, 16, { r: 3, ol: S.ink, fill: S.accent });
        Font.draw(fb, 'Travel', bx + 25, by + 5, 0xffffffff, { font: 'small', align: 'center' });
        HUD.btn('travel', bx, by, 50, 16, () => { if (!Areas[M.sel]) { HUD.toast('This place is still being built — coming in a future update!', { life: 2.6 }); SFX.error(); return; } travelTo(M.sel); });
      } else if (here) { const tw = Font.measure('You are here', 'small') + 8; UI.rrect(fb, cx + cw - tw - 6, cyy + 6, tw, 11, 3, HERE_C); Font.draw(fb, 'You are here', cx + cw - 6 - tw / 2, cyy + 9, 0xffffffff, { font: 'small', align: 'center' }); }
    }
    // travel: the Poké Ball wipe closes as the camera dives in
    if (M.travel && M.travel.t > FLY + DIVE - 0.2) wipe(fb, clamp((M.travel.t - (FLY + DIVE - 0.2)) / WIPE, 0, 1), W, H);
    // background drag area (spin / tilt; a tap on empty ground deselects)
    HUD.btn('mapdrag', 0, 20, W, H - 20, null, { drag: (ux, uy, ph) => {
      if (M.travel) return;
      if (ph === 'down') { M.drag = { x: ux, y: uy, yaw: CAM.yaw, pitch: CAM.pitch, moved: 0 }; M.shot = null; }
      else if (ph === 'move' && M.drag) { M.drag.moved = Math.max(M.drag.moved, Math.hypot(ux - M.drag.x, uy - M.drag.y)); CAM.yaw = M.drag.yaw - (ux - M.drag.x) * 0.012; CAM.pitch = clamp(M.drag.pitch + (uy - M.drag.y) * 0.006, 0.12, 1); Object.assign(GOAL, CAM); }
      else { if (M.drag && M.drag.moved < 3 && M.sel) { M.sel = null; GOAL.zoom = Math.max(GOAL.zoom, 1.05); } M.drag = null; }
    } });
    const dragB = HUD.btns.pop(); HUD.btns.unshift(dragB);
  }
  function wipe(fb, r, W, H) {
    const R = Math.hypot(W, H) * 0.5 * r, cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dd = Math.hypot(x - cx, y - cy); if (dd > Math.hypot(W, H) * 0.5 - R) fb.d[y * W + x] = y < cy ? BALL_R : 0xfff4f7fb; }
    if (r > 0.95) { UI.rect(fb, 0, cy - 2, W, 4, 0xff1b2240); UI.disc(fb, cx, cy, 14, 0xff1b2240); UI.disc(fb, cx, cy, 10, 0xfff4f7fb); }
  }
  // after the new area loads, the Poké Ball opens again to reveal it (drawn over the live game)
  function drawReveal(fb, t) {
    if (!M.reveal) return;
    M.reveal.t += 1 / 60;
    const r = 1 - clamp(M.reveal.t / 0.55, 0, 1), W = fb.w, H = fb.h;
    if (r <= 0) { M.reveal = null; return; }
    const R = Math.hypot(W, H) * 0.5 * (1 - r), cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, y - cy) > R) fb.d[y * W + x] = y < cy ? BALL_R : 0xfff4f7fb;
    if (r > 0.85) { UI.rect(fb, 0, cy - 2, W, 4, 0xff1b2240); UI.disc(fb, cx, cy, 14, 0xff1b2240); UI.disc(fb, cx, cy, 10, 0xfff4f7fb); }
  }
  function compass(fb, cx, cy, yaw) {
    UI.disc(fb, cx, cy, 7, 0xff1b2240); UI.disc(fb, cx, cy, 6, 0xfff4f6fb);
    const nx = -Math.sin(yaw), ny = -Math.cos(yaw);
    for (let k = 0; k <= 5; k++) { UI.put(fb, Math.round(cx + nx * k), Math.round(cy + ny * k), BALL_R); UI.put(fb, Math.round(cx - nx * k * 0.8), Math.round(cy - ny * k * 0.8), 0xff5a6080); }
  }
  function completion(id) {
    const sp = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id));
    if (!sp.length) return 0;
    let got = 0, tot = 0;
    for (const k of sp) { const d = DexData.S[k]; tot += Object.keys(d.beh).length; got += Object.keys(Save.data.beh[k] || {}).length; }
    return tot ? got / tot : 0;
  }
  function down() {} function move() {} function up() {}
  function wheel(dy) { M.dist = clamp(M.dist * Math.exp(dy * 0.001), 0.55, 1.6); }
  function key(k) {
    if (k === 'Escape' || k === 'm') close();
    if (M.travel) return;
    if (k === 'ArrowLeft') GOAL.yaw -= 0.3; if (k === 'ArrowRight') GOAL.yaw += 0.3;
    if (k === 'ArrowUp') GOAL.pitch = clamp(GOAL.pitch + 0.1, 0.12, 1); if (k === 'ArrowDown') GOAL.pitch = clamp(GOAL.pitch - 0.1, 0.12, 1);
    M.shot = null;
  }
  return Object.assign(M, { open, close, update, draw, drawReveal, down, move, up, wheel, key, LOC, CAM, select, travelTo });
})();
