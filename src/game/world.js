/* ------------------------------------------------------------------
   World — layout of the island cross-section and the five hours.
   World units are art pixels at zoom 1. y grows downward.
------------------------------------------------------------------- */
const World = (() => {
  const W = 3600, H = 1320;
  const SEA = 560;       // still-water level
  const HORIZON = 468;   // far horizon line of the backdrop sea

  // terrain profile (x, ground y) — dunes, beach, reef slope, deep trench
  const GP = [
    [-40, 500], [120, 497], [300, 506], [470, 522], [700, 536], [920, 548], [1080, 556], [1180, 566],
    [1330, 596], [1500, 650], [1700, 740], [1900, 812], [2100, 842], [2320, 850], [2520, 856], [2640, 884],
    [2740, 990], [2880, 1150], [3100, 1206], [3400, 1214], [3660, 1216],
  ];
  const ground = new Float32Array(W + 2);
  (() => {
    const pts = GP;
    let k = 0;
    for (let x = 0; x <= W + 1; x++) {
      while (k < pts.length - 2 && x > pts[k + 1][0]) k++;
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
      const t = (x - p1[0]) / (p2[0] - p1[0]);
      const t2 = t * t, t3 = t2 * t;
      ground[x] = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
    }
  })();
  let shoreX = 0;
  for (let x = 0; x < W; x++) if (ground[x] >= SEA) { shoreX = x; break; }
  const groundAt = (x) => {
    if (x <= 0) return ground[0];
    if (x >= W) return ground[W];
    const i = Math.floor(x), f = x - i;
    return ground[i] * (1 - f) + ground[i + 1] * f;
  };
  const slopeAt = (x) => groundAt(x + 2) - groundAt(x - 2);

  // placements
  const PALMS = [{ x: 150, h: 430, lean: -0.18, seed: 3 }, { x: 402, h: 470, lean: 0.12, seed: 8 }, { x: 668, h: 400, lean: -0.08, seed: 14 }];
  const BEACH_ROCKS = [
    { x: 842, w: 58, h: 34, seed: 1 }, { x: 896, w: 92, h: 56, seed: 2 }, { x: 962, w: 50, h: 30, seed: 3 },
    { x: 1004, w: 70, h: 42, seed: 4 }, { x: 790, w: 40, h: 24, seed: 5 },
  ];
  const WALREIN_ROCK = { x: 1262, w: 190, h: 112, seed: 6 };
  const REEF_ROCKS = [{ x: 1668, w: 110, h: 70, seed: 7 }, { x: 2360, w: 140, h: 80, seed: 8 }, { x: 2580, w: 90, h: 60, seed: 9 }];
  const PIER = { x0: 1360, x1: 1880, deck: 496, posts: [1380, 1470, 1560, 1650, 1740, 1830, 1872] };

  return { W, H, SEA, HORIZON, ground, groundAt, slopeAt, shoreX, PALMS, BEACH_ROCKS, WALREIN_ROCK, REEF_ROCKS, PIER };
})();

/* ------------------------------------------------------------------
   Times of day. Colours are strings here; compiled once per time.
------------------------------------------------------------------- */
const Times = (() => {
  const ORDER = ['dawn', 'noon', 'afternoon', 'dusk', 'night'];
  const DEF = {
    dawn: {
      seabed: ['#4e4a68', '#7a6e84', '#a8949a', '#cbb4b0'],
      sky: [[0, '#4d6ab4'], [0.2, '#6881c4'], [0.4, '#9197cf'], [0.57, '#bea0cb'], [0.72, '#e6aeae'], [0.86, '#fcc59a'], [1, '#ffdcaa']],
      sun: { kind: 'sun', px: 0.78, y: 440, r: 26, cols: ['#ffc98a', '#ffe7b6', '#fffaea'], glow: '#ffe2c2', halo: 190 },
      cloud: ['#8d83bf', '#c79fc7', '#ffc59c', '#fff0cc'], cloudLit: [-0.4, 0.9],
      far: [[0, '#cfa7b6'], [0.1, '#8078b2'], [0.55, '#6671ae'], [1, '#6483b8']], glint: ['#fff3cc', '#ffc99e'],
      water: [[0, '#7aa6d0'], [0.12, '#5f86c0'], [0.4, '#435ea6'], [0.7, '#2c3f82'], [1, '#1a2458']],
      rays: '#ffe0d0', rayK: 0.32, caustic: '#c9d6f0',
      foam: ['#fff4e8', '#f0dbe0', '#c1b1cf'],
      sand: ['#a4878d', '#c6a5a1', '#dcbeb1', '#eed5c5'], sandWet: ['#83717e', '#97838d', '#ab959b', '#c3aca9'], cut: ['#7d6770', '#8e7780'],
      grass: ['#3e5a58', '#557068', '#728a78', '#9aa88a'],
      rock: ['#3e3b58', '#55506f', '#716a8a', '#968caa', '#c3b8cf'],
      wood: ['#3e2b33', '#5a3e44', '#7a5656', '#a07a70'],
      palm: { trunk: ['#4a3238', '#664648', '#86605a', '#a88070'], leaf: ['#1f3a3a', '#2f5a4e', '#4a7a5e', '#7aa07a'], spine: '#a0b88a', outline: '#16282c', nut: ['#3e2a26', '#5e4038', '#86604e'] },
      coral: ['#b0607a', '#d88090', '#e89a78', '#9a78b8'],
      light: { dir: [-0.25, 0.75, 0.6], th: [-0.3, 0.1, 0.8], spec: 0.99, rim: { dir: [0.5, 0.86], k: 0.38, tint: '#ffe2b0', amt: 0.45 } },
      grade: { shadow: ['#6a5c9c', 0.32], light: ['#ffd9b4', 0.3], all: ['#c9a6c8', 0.1] },
      shadowTint: '#54467c', stars: 0,
    },
    noon: {
      seabed: ['#56686e', '#8f9478', '#c6bb88', '#eadba2'],
      sky: [[0, '#2966c8'], [0.18, '#3176d4'], [0.36, '#3d88df'], [0.54, '#4f9ce8'], [0.7, '#66afef'], [0.85, '#86c4f4'], [1, '#b3dcf8']],
      sun: { kind: 'sun', px: 0.18, y: 60, r: 22, cols: ['#fff2b0', '#fffbe0', '#ffffff'], glow: '#fff6da', halo: 230 },
      cloud: ['#9fbfe0', '#c6dcf0', '#e9f3fc', '#ffffff'], cloudLit: [-0.62, -0.78],
      far: [[0, '#8cc4ea'], [0.08, '#1d58a8'], [0.5, '#2468ba'], [1, '#2c80c6']], glint: ['#ffffff', '#b9e6fb'],
      water: [[0, '#4cc4e2'], [0.06, '#3cb2dc'], [0.14, '#2e9ed6'], [0.24, '#268bcc'], [0.36, '#1f78bf'], [0.5, '#1a64ad'], [0.66, '#15509a'], [0.82, '#103e80'], [1, '#0b2c66']],
      rays: '#d8fbff', rayK: 0.45, caustic: '#d6fbf4',
      foam: ['#ffffff', '#e0f5fa', '#a9dce9'],
      sand: ['#c49a60', '#ddbb82', '#edd4a0', '#f7e7c2'], sandWet: ['#9c7a50', '#b59262', '#c6a576', '#d9c09a'], cut: ['#a88455', '#b8945f'],
      grass: ['#2a6a34', '#3f8f3e', '#5fb04c', '#94d06c'],
      rock: ['#3b4a5c', '#55677b', '#768ba0', '#9fb3c4', '#d0dce6'],
      wood: ['#4a2e1c', '#6b4428', '#8f5e36', '#b67f4e'],
      palm: { trunk: ['#5b3a22', '#7c522f', '#9e6c40', '#c28b57'], leaf: ['#1a5a2c', '#2c8434', '#43a23f', '#79c95a'], spine: '#9ccf62', outline: '#113a22', nut: ['#4d321c', '#74502e', '#a07448'] },
      coral: ['#e0607a', '#f58a8a', '#ffab5e', '#b884e0'],
      light: { dir: [-0.5, 0.72, 0.5] },
      grade: null, shadowTint: '#2b3a6a', stars: 0,
    },
    afternoon: {
      seabed: ['#5c6468', '#96927a', '#cab884', '#eed8a0'],
      sky: [[0, '#3a7bcd'], [0.3, '#4a8fda'], [0.6, '#6aa9e6'], [0.82, '#95c6f0'], [1, '#d4e6ee']],
      sun: { kind: 'sun', px: 0.72, y: 150, r: 22, cols: ['#ffe29a', '#fff4cc', '#ffffff'], glow: '#fff0c8', halo: 210 },
      cloud: ['#a3b8d8', '#cfdcec', '#f1f5fa', '#ffffff'], cloudLit: [0.62, -0.78],
      far: [[0, '#a8cce6'], [0.08, '#255aa3'], [0.5, '#2a6cb4'], [1, '#3084c4']], glint: ['#fffbe8', '#cde8f4'],
      water: [[0, '#4ab8d6'], [0.1, '#3496cc'], [0.35, '#2372b8'], [0.65, '#194e94'], [1, '#0e2c62']],
      rays: '#fff4d6', rayK: 0.42, caustic: '#e8f8ea',
      foam: ['#ffffff', '#e6f4f4', '#aad4e0'],
      sand: ['#c8985a', '#e0b87a', '#f0d098', '#f9e4ba'], sandWet: ['#9e7648', '#b88e5a', '#c9a26e', '#dcbe92'], cut: ['#aa8250', '#bb925c'],
      grass: ['#2e6a30', '#43903a', '#66b24a', '#9ed26a'],
      rock: ['#3e4a58', '#586a7c', '#7a8fa2', '#a4b6c4', '#d6e0e6'],
      wood: ['#4e301c', '#704628', '#946038', '#bc8452'],
      palm: { trunk: ['#5e3a20', '#80542e', '#a26e3e', '#c68e56'], leaf: ['#1c5a2a', '#2e8632', '#48a43c', '#84cc58'], spine: '#a8d266', outline: '#123a20', nut: ['#4d321c', '#74502e', '#a07448'] },
      coral: ['#e0607a', '#f58a8a', '#ffab5e', '#b884e0'],
      light: { dir: [0.45, 0.7, 0.5] },
      grade: { all: ['#fff0d0', 0.08] }, shadowTint: '#2e3a66', stars: 0,
    },
    dusk: {
      seabed: ['#3a2c50', '#5a4260', '#86606a', '#b0806e'],
      sky: [[0, '#27285c'], [0.18, '#3d3476'], [0.36, '#673d8a'], [0.52, '#9c4680'], [0.67, '#d35a6c'], [0.8, '#f0835a'], [0.91, '#ffb05a'], [1, '#ffd98c']],
      sun: { kind: 'sun', px: 0.34, y: 452, r: 34, cols: ['#ffae52', '#ffd878', '#fff4cc'], glow: '#ffc07a', halo: 260 },
      cloud: ['#553a7c', '#9a4a86', '#f27c64', '#ffc47a'], cloudLit: [-0.9, 0.35],
      far: [[0, '#f59c6c'], [0.1, '#8d4f7e'], [0.5, '#5c3f7c'], [1, '#3d3a72']], glint: ['#fff0b8', '#ffb46a'],
      water: [[0, '#5a5288'], [0.12, '#463f7c'], [0.4, '#302c66'], [0.7, '#1e1c4c'], [1, '#100e30']],
      rays: '#ffb888', rayK: 0.34, caustic: '#e8b8b0',
      foam: ['#ffe9cf', '#f6b8a0', '#ad829c'],
      sand: ['#7a5162', '#a3666c', '#ca8670', '#e8a577'], sandWet: ['#573c5d', '#704966', '#8b566a', '#b36e6e'], cut: ['#5e4058', '#6e4a60'],
      grass: ['#3a3048', '#523e54', '#74525e', '#a06c66'],
      rock: ['#2e2440', '#43345a', '#5e4a72', '#86668a', '#b890a8'],
      wood: ['#2e1c26', '#48283a', '#6a3c48', '#96585a'],
      palm: { trunk: ['#1c1226', '#241832', '#2e1d3a', '#56304a'], leaf: ['#170f22', '#1f152c', '#281a36', '#4c2a46'], spine: '#5a3450', outline: '#120a1a', nut: ['#140c1e', '#1e1428', '#2a1a32'] },
      coral: ['#a8506e', '#c8688a', '#e08a6e', '#8a60a8'],
      light: { dir: [-0.35, 0.5, 0.78], th: [0.12, 0.55, 0.96], spec: 0.998, rim: { dir: [-0.95, 0.3], k: 0.17, tint: '#ffae52', amt: 0.62, base: 3 } },
      grade: { shadow: ['#34286a', 0.5], light: ['#ff9c7a', 0.22], all: ['#8e4f86', 0.3] },
      shadowTint: '#2e2450', stars: 0.25,
    },
    night: {
      seabed: ['#161c34', '#222c46', '#34405a', '#4a5a7c'],
      sky: [[0, '#04071a'], [0.3, '#081030'], [0.58, '#0e1a44'], [0.84, '#18285a'], [1, '#253c72']],
      sun: { kind: 'moon', px: 0.7, y: 90, r: 16, cols: ['#c9c2a2', '#ece5c6', '#fbf8e6'], glow: '#8ea6e0', halo: 140 },
      cloud: ['#0c1330', '#18244a', '#3a4c80', '#9aaee0'], cloudLit: [0.5, -0.8],
      far: [[0, '#3c5a96'], [0.08, '#17264f'], [0.5, '#0f1b41'], [1, '#0f1d42']], glint: ['#eef4ff', '#8ea8dc'],
      water: [[0, '#1c3a66'], [0.12, '#142c56'], [0.4, '#0e2046'], [0.7, '#081636'], [1, '#040a1e']],
      rays: '#8fb0e8', rayK: 0.22, caustic: '#6a8ac8', glowFoam: true,
      foam: ['#c8fff6', '#5ff2e0', '#279fb2'],
      sand: ['#2a3048', '#373f5a', '#454e6e', '#566182'], sandWet: ['#1d2238', '#262d46', '#303954', '#3e4a6c'], cut: ['#20263c', '#282f48'],
      grass: ['#141c30', '#1e2a42', '#2a3a56', '#3e5270'],
      rock: ['#0e1224', '#161c34', '#222a48', '#344066', '#56648e'],
      wood: ['#10121e', '#1a1c2e', '#2a2c44', '#3e4260'],
      palm: { trunk: ['#070a18', '#0b1020', '#10162a', '#2a3a5e'], leaf: ['#060914', '#0a0f1e', '#0f1628', '#2c3e66'], spine: '#34466e', outline: '#04060e', nut: ['#05070f', '#0a0e1c', '#141a2e'] },
      coral: ['#3a4a8a', '#4a5ea8', '#5a78c0', '#46d6c8'],
      light: { dir: [0.55, 0.7, 0.45], th: [0.05, 0.4, 0.9], spec: 0.995, rim: { dir: [-0.55, 0.83], k: 0.3, tint: '#46e6d6', amt: 0.55, base: 2 } },
      grade: { all: ['#23397a', 0.46], shadow: ['#0c1236', 0.5], light: ['#cfe0ff', 0.3] },
      shadowTint: '#050818', stars: 1,
    },
  };

  const hexify = (v) => (typeof v === 'string' && v[0] === '#' ? PX.hex(v) : Array.isArray(v) ? v.map(hexify) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hexify(x)])) : v);
  const cache = {};

  // gradient helper → { a, b, f } per integer step, for dithered fills
  function ramp(stops, n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [ta, ca] = stops[k], [tb, cb] = stops[k + 1];
      let f = Math.max(0, Math.min(1, (t - ta) / (tb - ta || 1)));
      f = Scenery.smooth(0.2, 0.8, f);
      out[i] = { a: PX.hex(ca), b: PX.hex(cb), f };
    }
    return out;
  }

  function compile(key) {
    if (cache[key]) return cache[key];
    const d = DEF[key];
    const P = hexify(d);
    P.key = key;
    P.skyRow = ramp(d.sky, World.SEA + 1);
    P.farRow = ramp(d.far, World.SEA - World.HORIZON + 1);
    P.waterRow = ramp(d.water, World.H - World.SEA + 1);
    P.waterC = d.water.map((st) => PX.hex(st[1]));
    P.farC = d.far.map((st) => PX.hex(st[1]));
    // creature palettes graded for this hour
    const g = d.grade;
    const grader = (c, i) => {
      if (!g) return c;
      let r = c;
      if (g.all) r = PX.mix(r, PX.hex(g.all[0]), g.all[1]);
      if (g.shadow && i <= 1) r = PX.mix(r, PX.hex(g.shadow[0]), g.shadow[1] * (i <= 0 ? 1 : 0.65));
      if (g.light && i >= 3) r = PX.mix(r, PX.hex(g.light[0]), g.light[1] * (i === 4 ? 1 : 0.7));
      return r;
    };
    P.grader = grader;
    P.rimGrader = d.light.rim ? (c, i) => PX.mix(c, PX.hex(d.light.rim.tint), d.light.rim.amt * (i >= 3 ? 1 : 0.85)) : null;
    P.palCache = new Map();
    P.gradePal = (base, id) => {
      let e = P.palCache.get(id);
      if (!e) {
        const pal = g ? Creature.grade(base, grader) : base;
        const light = Object.assign({}, d.light);
        if (d.light.rim) light.rim = Object.assign({}, d.light.rim, { pal: Creature.grade(base, P.rimGrader) });
        e = { pal, light };
        P.palCache.set(id, e);
      }
      return e;
    };
    cache[key] = P;
    return P;
  }
  return { ORDER, DEF, compile };
})();
