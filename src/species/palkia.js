/* ------------------------------------------------------------------
   Palkia — the Spatial Pokémon, a super small chibi built from the
   chibi Dialga rig: pale lavender armour with pink stripes, pearls
   set in the shoulders, fan wings, stubby arms and a long tail.
   (Original Dialga notes follow.)
   Dialga — the Temporal Pokémon, as a super small chibi (~95 units
   tall at yaw 1.1 including the crest; the player's size exception to
   the 5.4 m Pokédex height) posable 3D model rendered to pixel art by
   the shared Creature renderer (src/creature.js).
   x = forward, y = up, z = near side at yaw 0; y = 0 is the ground.
   Navy body with glowing cyan lines, silver armour (swept crest, visor
   band across the red eyes, shoulder plates with a fan of blades,
   chest shield, claws, tail fin) and the big Adamant diamond.
   The crest and blades are thin ellipsoid "shells" clipped to 2D
   outlines; an edge-on fallback keeps them solid from every angle.
------------------------------------------------------------------- */
const Palkia = (() => {
  const { chain, T, R, code } = Creature;
  // prims as { kind, part, grp, c, L, mat } literals (same hidden class as Mudkip's)
  const ell = (f, r, o) => ({ kind: 'ell', part: o.part, grp: o.grp, c: f.t, L: M3.mul(f.L, M3.diag(r[0], r[1], r[2])), mat: o.mat });
  const plate = (f, shape, o) => ({ kind: 'plate', part: o.part, grp: o.grp, c: f.t, L: f.L, shape, thick: o.thick || 1.4 });
  // Clipped thin "shell" ellipsoid: test(s0,s1,s2) = material of the nearest surface point or 0.
  // When that point is clipped away, march the view ray's chord through the ellipsoid (direction
  // from the renderer's prim.Li) so edge-on fins keep their silhouette; face-on nothing changes.
  const clipped = (prim, test, edge, thin, R) => {
    let li = null, cw = 1, dx = 0, dy = 0, dz = 0, dt = 0;
    prim.mat = (s) => {
      const m = test(s[0], s[1], s[2]);
      if (m) return m;
      const Li = prim.Li;
      if (Li !== li) {
        // once per render: view direction in local space, and |cos| between view and fin normal
        li = Li;
        const t3 = thin * 3;
        cw = Math.abs(Li[t3 + 2]) / Math.hypot(Li[t3], Li[t3 + 1], Li[t3 + 2]);
        const il = 1 / Math.hypot(Li[2], Li[5], Li[8]);
        dx = Li[2] * il; dy = Li[5] * il; dz = Li[8] * il;
        dt = thin === 0 ? dx : thin === 1 ? dy : dz;
      }
      if (cw > 0.5) return 0; // within 60 degrees of face-on: the surface clip is already right
      const k = 2 * (s[0] * dx + s[1] * dy + s[2] * dz);
      // samples ~3 units apart along the chord's travel across the fin plane
      const n = Math.min(8, Math.floor((k * Math.sqrt(Math.max(0, 1 - dt * dt)) * R) / 3));
      for (let j = 1; j <= n; j++) {
        const t = (k * j) / (n + 1);
        const e = edge(s[0] - t * dx, s[1] - t * dy, s[2] - t * dz);
        if (e) return e;
      }
      return 0;
    };
    return prim;
  };

  // material ids
  const BODY = 1, SILVER = 2, CYAN = 3, GEM = 4, MOUTH = 5, TONGUE = 6, FANG = 7, HALO = 8;
  const MAT = { BODY, SILVER, CYAN, GEM, MOUTH, TONGUE, FANG, HALO };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#8e82a8', '#b0a4c8', '#d2c8e2', '#ebe4f4', '#ffffff'], od: '#4e4468', ol: '#8a7ea4', ln: '#7a6e96' },
    [SILVER]: { r: ['#7c7490', '#a49cb6', '#c8c2d6', '#e4e0ee', '#ffffff'], od: '#463e5c', ol: '#6c6484', ln: '#6c6484' },
    [CYAN]:   { r: ['#6a1e6a', '#8a2e86', '#a844a2', '#c86ac0', '#eaa6e2'], od: '#3e0e40', ol: '#6a1e6a', ln: '#6a1e6a' },
    [GEM]:    { r: ['#b0506a', '#d27088', '#ee9aae', '#ffc8d6', '#ffffff'], od: '#6a2034', ol: '#a04058', ln: '#8a3048' },
    [HALO]:   { r: ['#4a4458', '#5c5670', '#6e6886', '#8a84a0', '#a6a0bc'], od: '#2a2438', ol: '#4a4458', ln: '#4a4458' },
    [MOUTH]:  { r: ['#4a1024', '#6a1a32', '#8c2a44', '#aa3c56', '#c85a6e'], od: '#2a0818', ol: '#4a1024', ln: '#3a0c1c' },
    [TONGUE]: { r: ['#b04a60', '#d05e74', '#ea7a8c', '#ff9eac', '#ffc4cc'], od: '#6a1a30', ol: '#8a2a40', ln: '#8a2a40' },
    [FANG]:   { r: ['#9aa8b8', '#c4d0dc', '#e8f0f6', '#ffffff', '#ffffff'], od: '#4a5a6e', ol: '#6a7a8e', ln: '#6a7a8e' },
  });
  const GLOSSY = { [BODY]: 1, [SILVER]: 1, [GEM]: 1 };
  const GEM_GLOW = ['#ff6aa0', '#ff9ac0', '#ffc8dc', '#ffe8f2', '#ffffff'].map(PX.hex);

  /* ---------- 2D grid helpers ---------- */
  function grid(u0, v0, u1, v1, res, Type = Uint8Array, init = 0) {
    const gw = Math.ceil((u1 - u0) / res), gh = Math.ceil((v1 - v0) / res);
    const a = new Type(gw * gh);
    if (init) a.fill(init);
    return { u0, v0, res, gw, gh, a };
  }
  function at(g, u, v, def) {
    const x = Math.floor((u - g.u0) / g.res), y = Math.floor((v - g.v0) / g.res);
    return x < 0 || y < 0 || x >= g.gw || y >= g.gh ? def : g.a[y * g.gw + x];
  }
  function fill(g, poly, val) {
    const n = poly.length;
    for (let y = 0; y < g.gh; y++) {
      const vy = g.v0 + (y + 0.5) * g.res;
      const xs = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i][1], yj = poly[j][1];
        if (yi > vy !== yj > vy) xs.push(poly[i][0] + ((vy - yi) * (poly[j][0] - poly[i][0])) / (yj - yi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil((xs[k] - g.u0) / g.res - 0.5));
        const xb = Math.min(g.gw - 1, Math.floor((xs[k + 1] - g.u0) / g.res - 0.5));
        for (let x = xa; x <= xb; x++) g.a[y * g.gw + x] = val;
      }
    }
  }
  function stroke(g, pts, maxD) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxD - g.u0) / g.res)), x1 = Math.min(g.gw - 1, Math.ceil((Math.max(ax, bx) + maxD - g.u0) / g.res));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - maxD - g.v0) / g.res)), y1 = Math.min(g.gh - 1, Math.ceil((Math.max(ay, by) + maxD - g.v0) / g.res));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Shape2D.segDist(g.u0 + (x + 0.5) * g.res, g.v0 + (y + 0.5) * g.res, ax, ay, bx, by);
          const i = y * g.gw + x;
          if (d < g.a[i]) g.a[i] = d;
        }
    }
  }
  const smooth = (pts, closed = false, seg = 6) => Shape2D.catmull(pts, closed, seg);
  const bevel = (g, u, v, dx, dy) => (!at(g, u + dx, v + dy, 0) ? 1 : !at(g, u - dx, v - dy, 0) ? -1 : 0);

  /* ---------- cyan lines (rest-pose side view, both sides) ---------- */
  const LINES = grid(-60, -5, 60, 110, 0.5, Float32Array, 99);
  // body flank swoosh
  stroke(LINES, smooth([[12, 36], [4, 32.5], [-6, 30], [-15, 31], [-22, 34]]), 4);
  stroke(LINES, smooth([[0, 40], [-9, 38.5], [-17, 39.5]]), 4);
  // head: cheek line under the eye sweeping back
  stroke(LINES, smooth([[23, 56.5], [15, 55.5], [6, 57.5], [-1, 62]]), 4);
  // neck
  stroke(LINES, smooth([[17, 46], [13, 41]]), 4);

  /* ---------- crest (side view, x forward / y up), thin axis z ---------- */
  const CREST_OUT = smooth([[27, 70], [23, 77.5], [15, 83.5], [4, 88.5], [-8, 92.5], [-20, 95.5], [-25, 95], [-19, 89.5], [-12, 83], [-7, 76.5], [-4, 70], [10, 68]], true, 8);
  const CREST_G = grid(-30, 64, 32, 100, 0.25);
  fill(CREST_G, CREST_OUT, 1);
  const CREST_LN = grid(-30, 64, 32, 100, 0.25, Float32Array, 99);
  stroke(CREST_LN, smooth([[21, 76], [11, 82.5], [-1, 87.5], [-12, 91], [-19, 93]]), 3);
  const CREST_E = { cx: 1, cy: 81, rx: 41, ry: 23, rz: 5.5 };

  /* ---------- chest shield (local: v = up, w = sideways) ---------- */
  const SHIELD_OUT = smooth([[-11, 12], [-6, 15.5], [0, 16.5], [6, 15.5], [11, 12], [12.5, 2], [8, -8], [0, -15], [-8, -8], [-12.5, 2]], true, 8);
  const SHIELD_G = grid(-15, -17, 15, 19, 0.25);
  fill(SHIELD_G, SHIELD_OUT, 1);
  const SHIELD_E = { rv: 18.5, rw: 15.5, ru: 5.5 };
  // gem diamond (plate, local u = sideways, v = up)
  const GEM_H = 8, GEM_W = 6.4;
  const gemShape = bakeShape({
    bb: [-GEM_W - 0.5, -GEM_W - 0.5, GEM_W + 0.5, GEM_W + 0.5],
    test(u, v) {
      const d = Math.hypot(u, v) / GEM_W;
      if (d > 1) return 0;
      if (u < -0.6 && v > 0.6 && Math.hypot(u + 2, v - 2) < 1.8) return code(GEM, 2);   // glint
      return code(GEM, d > 0.78 ? -1 : u + v > 1.5 ? 1 : 0);
    },
  });
  const haloShape = bakeShape({
    bb: [-GEM_W - 3, -GEM_W - 3, GEM_W + 3, GEM_W + 3],
    test(u, v) { const d = Math.hypot(u, v); return d <= GEM_W + 2.6 ? code(HALO, d > GEM_W + 1.6 ? -1 : 0) : 0; },
  });
  /* ---------- back blades (clipped shells) and fangs (plates) ---------- */
  const bladeShape = (L, W) => {
    const g = grid(-4, -W, L + 2, W, 0.25);
    fill(g, smooth([[0, -W * 0.5], [L * 0.35, -W * 0.55], [L * 0.8, -W * 0.3], [L, 0.2 * W], [L * 0.72, W * 0.5], [L * 0.3, W * 0.55], [0, W * 0.45], [-2, 0]], true, 8), 1);
    return { g, cu: L / 2 - 1, ru: (L / 2 + 1.5) * 1.22, rv: W * 0.85, rw: 1.9 };
  };
  const BLADES = [
    { a: -0.05, L: 40, W: 12 },
    { a: 0.4, L: 36, W: 11 },
    { a: 0.85, L: 28, W: 9.5 },
  ].map((b) => Object.assign(b, { shape: bladeShape(b.L, b.W) }));
  const FANGS = bakeShape(Shape2D.poly([[-1.3, 0.6], [1.3, 0.6], [0.2, -3.2]], code(FANG), 6));

  /* ---------- eye stamps: k navy outline, w glint, r red, d dark red ---------- */
  const EYES = {
    open: ['.kk.', 'kwrk', 'krrk', 'krdk', '.kk.'],
    openN: ['.k.', 'kwk', 'krk', 'kdk', '.k.'],
    openF: ['kk', 'wk', 'rk', 'kk'],
    happy: ['.kk.', 'k..k', 'k..k'],
    happyN: ['.k.', 'k.k', 'k.k'],
    happyF: ['.k', 'k.', 'k.'],
    blink: ['....', '....', 'kkkk', '.kk.'],
    blinkN: ['...', '...', 'kkk', '.k.'],
    blinkF: ['..', '..', 'kk', '.k'],
    closed: ['k..k', '.kk.'],
    closedN: ['k.k', '.k.'],
    closedF: ['k.', '.k'],
    angry: ['k...', 'kkk.', '.kkk', 'krrk', '.kk.'],
    angryN: ['k..', 'kk.', '.kk', 'krk', '.k.'],
    angryF: ['k.', 'kk', 'rk', 'kk'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwwrk', 'kwrrk', 'krrrk', 'krrdk', '.kkk.'],
    openN: ['.kk.', 'kwrk', 'krrk', 'krrk', 'krdk', '.kk.'],
    openF: ['kk.', 'wrk', 'rrk', 'rdk', 'kk.'],
    happy: ['.kkk.', 'k...k', 'k...k'],
    happyN: ['.kk.', 'k..k', 'k..k'],
    happyF: ['.kk', 'k..', 'k..'],
    blink: ['.....', '.....', '.....', 'kkkkk', '.kkk.'],
    blinkN: ['....', '....', '....', 'kkkk', '.kk.'],
    blinkF: ['...', '...', '...', 'kkk', '.kk'],
    closed: ['k...k', '.kkk.'],
    closedN: ['k..k', '.kk.'],
    closedF: ['k..', '.kk'],
    angry: ['kk...', 'kkkk.', '.kkkk', 'kwrrk', 'krrdk', '.kkk.'],
    angryN: ['kk..', 'kkk.', '.kkk', 'krrk', 'krdk', '.kk.'],
    angryF: ['k..', 'kk.', 'kkk', 'rdk', 'kk.'],
  };
  const EYEC = { k: '#0a1630', w: '#ffffff', r: '#ec3b33', d: '#a81e26' };

  const K = 0.9; // overall size: ~95 px tall at yaw 1.1 including the crest
  const DEFAULT = { roar: 0, walk: 0, hop: 0, headPitch: 0, headYaw: 0, mouth: 0, eyes: 'open', gem: 0, tailWag: 0, side: 1 };
  let LWH = 0.9;

  const pivot = (p, M) => chain(T(p[0], p[1], p[2]), R(M), T(-p[0], -p[1], -p[2]));
  const frame = (L, t) => ({ L, t });
  const pt = (f, p) => V3.add(f.t, M3.v(f.L, p));

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const roar = Math.max(0, Math.min(1, P.roar));
    const mouth = Math.max(0, Math.min(1, Math.max(P.mouth || 0, roar)));
    const hop = Math.max(-1, Math.min(1, P.hop));
    const wk = P.walk;
    const walking = wk !== 0;
    const bob = walking ? 1.1 * Math.abs(Math.sin(wk)) : 0;
    const sy = 1 + 0.2 * hop, sxz = 1 - 0.1 * hop;
    const root = frame(M3.diag(K * sxz, K * sy, K * sxz), [0, K * bob, 0]);

    const cBODY = code(BODY), cCYAN = code(CYAN), cSILVER = code(SILVER), cBODYsh = code(BODY, -1);
    const skin = (X, Y, az) => (az > 0.25 && at(LINES, X, Y, 99) < LWH ? cCYAN : cBODY);
    // navy ellipsoid with side-projected cyan lines (rest centre c, radii r, rest tilt about z)
    const navy = (f, c, r, part, grp, tilt = 0, extra = null) => {
      const [cx, cy, cz] = c, [rx, ry, rz] = r;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      return ell(chain(f, T(cx, cy, cz), R(M3.rz(tilt))), r, {
        part, grp,
        mat: (s) => {
          if (extra) { const e = extra(s); if (e) return e; }
          const lx = rx * s[0], ly = ry * s[1];
          const ax = s[0] / rx, ay = s[1] / ry, nz = s[2] / rz;
          const nx = ax * ct - ay * st, ny = ax * st + ay * ct;
          const az = Math.abs(nz) / Math.sqrt(nx * nx + ny * ny + nz * nz);
          return skin(cx + lx * ct - ly * st, cy + lx * st + ly * ct, az);
        },
      });
    };

    // --- body + neck
    prims.push(navy(root, [-2, 29, 0], [16, 19, 15], 1, 1));
    prims.push(navy(root, [8, 40, 0], [9, 8.5, 9.5], 2, 1, -0.3));

    // --- tail (wags about y)
    const tailF = chain(root, pivot([-20, 24, 0], M3.mul(M3.ry(P.tailWag), M3.rz(-0.12))));
    prims.push(navy(tailF, [-27, 23.5, 0], [8, 6.5, 6.5], 3, 1, 0.12, (s) => (s[1] > 0.62 && Math.abs(s[2]) < 0.45 ? cCYAN : 0)));
    prims.push(navy(tailF, [-34, 22.5, 0], [5.5, 4.4, 4.4], 4, 1, 0.2, (s) => (s[1] > 0.6 && Math.abs(s[2]) < 0.5 ? cCYAN : 0)));
    prims.push(navy(tailF, [-41, 24, 0], [5, 3.4, 3.4], 4, 1, 0.5, (s) => (s[1] > 0.5 ? cCYAN : 0)));
    prims.push(ell(chain(tailF, T(-47, 29, 0), R(M3.rz(-0.9))), [7, 3.4, 1.6], { part: 5, grp: 5, mat: (s) => code(SILVER, s[1] > 0.5 ? 1 : s[1] < -0.55 ? -1 : 0) }));

    // --- legs (trot: FL+BR together); hips in rest coordinates
    const legs = [
      { hip: [9, 34, 11], ph: 0, id: 6, arm: true },
      { hip: [9, 34, -11], ph: Math.PI, id: 7, arm: true },
      { hip: [-6, 17, 9], ph: Math.PI, id: 8 },
      { hip: [-6, 17, -9], ph: 0, id: 9 },
    ];
    for (const lg of legs) {
      if (lg.arm) {
        const f = chain(root, pivot(lg.hip, M3.rz(-0.6 + (walking ? 0.35 * Math.sin(wk + lg.ph) : 0) - 0.5 * roar)));
        const [hx, hy, hz] = lg.hip;
        prims.push(navy(f, [hx + 4, hy - 4, hz], [4.2, 6.2, 4], lg.id, lg.id, 0.5));
        for (const dz of [-1.6, 1.6]) prims.push(ell(chain(f, T(hx + 8.5, hy - 9, hz + dz), R(M3.rz(-0.9))), [2.6, 1.3, 1.2], { part: lg.id, grp: lg.id, mat: () => cSILVER }));
        continue;
      }
      const sw = walking ? 0.5 * Math.sin(wk + lg.ph) : 0;
      const lift = walking ? 3 * Math.max(0, Math.cos(wk + lg.ph)) : 0;
      const f = chain(root, T(lg.hip[0], lg.hip[1] + lift, lg.hip[2]), R(M3.rz(sw)), T(-lg.hip[0], -lg.hip[1], -lg.hip[2]));
      const [hx, , hz] = lg.hip;
      const sd = Math.sign(hz);
      // (tops of the legs get a baked contact shadow from the body)
      prims.push(navy(f, [hx, 10.5, hz], [6.6, 8.5, 6.2], lg.id, lg.id, 0, (s) => (s[2] * sd > 0.55 && Math.abs(s[0]) < 0.28 && s[1] < 0.5 ? cCYAN : s[1] > 0.5 ? cBODYsh : 0)));
      prims.push(ell(chain(f, T(hx + 1.5, 3.6, hz)), [7.4, 3.9, 6.8], { part: lg.id, grp: lg.id, mat: (s) => (s[1] > 0.62 ? cSILVER : cBODY) }));
      for (const dz of [-3.5, 0, 3.5]) prims.push(ell(chain(f, T(hx + 7.9, 1.7, hz + dz * 0.95), R(M3.ry(-dz * 0.08)), R(M3.rz(-0.3))), [3.1, 1.8, 1.55], { part: lg.id, grp: lg.id, mat: () => cSILVER }));
    }

    // --- shoulder plates + fan of blades (near/far)
    for (const sd of [1, -1]) {
      const gid = sd > 0 ? 10 : 11;
      prims.push(ell(chain(root, T(4, 36.5, 12 * sd), R(M3.rx(-0.35 * sd))), [7.5, 5, 4.6], { part: gid, grp: gid, mat: (s) => (s[1] < -0.55 ? 0 : cSILVER) }));
      BLADES.forEach((b, k) => {
        // blade plane: u along the blade, v across, w normal (mostly sideways)
        const f = chain(root, T(0 - k * 3, 39, 8.5 * sd), R(M3.ry(sd * (0.42 + 0.12 * k))), R(M3.rx(sd * 0.22)), R(M3.rz(Math.PI / 2 + b.a - 0.12 * roar)));
        const B = b.shape, W = b.W;
        const bl = { kind: 'ell', part: 12 + k + (sd < 0 ? 3 : 0), grp: 12 + (sd < 0 ? 1 : 0), c: pt(f, [B.cu, 0, 0]), L: M3.mul(f.L, M3.cols([B.ru, 0, 0], [0, 0, B.rw], [0, B.rv, 0])), mat: null };
        prims.push(clipped(bl, (a, bb, c) => {
          const uu = B.cu + B.ru * a, vv = B.rv * c;
          if (!at(B.g, uu, vv, 0)) return 0;
          return code(SILVER, vv > W * 0.18 ? 1 : vv < -W * 0.25 ? -1 : 0);
        }, (a, bb, c) => (at(B.g, B.cu + B.ru * a, B.rv * c, 0) ? cSILVER : 0), 1, B.ru));
      });
    }

    // --- chest shield + gem (faces forward)
    const chestF = chain(root, T(13, 28, 0), R(M3.rz(0.22)));
    const shield = { kind: 'ell', part: 16, ghost: true, grp: 16, c: chestF.t, L: M3.mul(chestF.L, M3.cols([SHIELD_E.ru, 0, 0], [0, SHIELD_E.rv, 0], [0, 0, SHIELD_E.rw])), mat: (s) => (s[0] < 0 || !at(SHIELD_G, SHIELD_E.rw * s[2], SHIELD_E.rv * s[1], 0) ? 0 : code(SILVER, s[0] < 0.45 || SHIELD_E.rv * s[1] > 10.5 ? -1 : 0)) };
    let gemF = null;
    for (const sd of [1, -1]) {
      const pf = chain(root, T(3, 38, 13.5 * sd), R(M3.cols([1, 0, 0], [0, 1, 0], [0, 0, sd])));
      prims.push(plate(chain(pf, T(0, 0, -0.2)), haloShape, { part: 17, grp: 17, thick: 1 }));
      prims.push(plate(chain(pf, T(0, 0, 0.8)), gemShape, { part: 18, grp: 17, thick: 1 }));
      if (sd > 0) gemF = pf;
    }
    // --- head (pitch/yaw at the neck; roar lifts it)
    const headF = chain(root, pivot([8, 46, 0], M3.mul(M3.rz(P.headPitch + 0.32 * roar), M3.ry(P.headYaw))));
    const cranium = navy(headF, [12, 62, 0], [18.5, 17, 18], 20, 20, 0, (s) => {
      // silver visor band across the brow (front half only)
      if (s[0] > 0.12 && s[1] > -0.24 + 0.1 * s[0] && s[1] < 0.06 + 0.1 * s[0]) return cSILVER;
      // ridge from the visor up the forehead to the crest
      if (s[0] > 0.3 && s[1] > 0 && Math.abs(s[2]) < 0.1 + 0.06 * s[1]) return cSILVER;
      return 0;
    });
    prims.push(cranium);
    // upper jaw / snout
    prims.push(navy(headF, [27, 55.5, 0], [11, 8, 10.5], 21, 20, 0, (s) => (s[1] > 0.55 && Math.abs(s[2]) < 0.55 ? cSILVER : 0)));
    // lower jaw
    const jawF = chain(headF, pivot([14, 52, 0], M3.rz(-0.68 * mouth)));
    prims.push(ell(chain(jawF, T(24, 49.5, 0)), [9.5, 4, 8.2], { part: 22, grp: 21, mat: (s) => (s[1] < -0.2 ? cSILVER : cBODY) }));
    // mouth interior: rides halfway down with the jaw and grows with the opening
    if (mouth > 0.03) prims.push(ell(chain(headF, pivot([14, 52, 0], M3.rz(-0.34 * mouth)), T(24.5, 50.5, 0)), [9.4, 2 + 3.4 * mouth, 7.4], { part: 23, grp: 22, mat: (s) => (s[1] < -0.1 && Math.abs(s[2]) < 0.62 && s[0] > -0.6 ? code(TONGUE) : code(MOUTH)) }));
    // fangs
    for (const sd of [1, -1]) prims.push(plate(chain(headF, T(33, 50.6, 4.2 * sd), R(M3.ry(-sd * 0.9))), FANGS, { part: 24, grp: 23, thick: 1 }));
    // crest (raised by the roar)
    const crestF = chain(headF, pivot([8, 76, 0], M3.mul(M3.ry(0.3 * (P.side ?? 1)), M3.rz(-0.42 * roar))));
    // crest: clipped thin shell (crisp fin outline; chord fallback keeps it solid head-on)
    const CE = CREST_E;
    prims.push(clipped(ell(chain(crestF, T(CE.cx, CE.cy, 0)), [CE.rx, CE.ry, CE.rz], { part: 25, grp: 24, mat: null }), (a, b, c) => {
      const X = CE.cx + CE.rx * a, Y = CE.cy + CE.ry * b;
      if (!at(CREST_G, X, Y, 0)) return 0;
      if (Math.abs(c) > 0.3 && at(CREST_LN, X, Y, 99) < 0.85) return cCYAN;
      return code(SILVER, bevel(CREST_G, X, Y, 1.1, 1.5));
    }, (a, b) => (at(CREST_G, CE.cx + CE.rx * a, CE.cy + CE.ry * b, 0) ? cSILVER : 0), 2, CE.rx));

    // --- anchors + eye stamps
    const eyeS = (az, v) => { const c = Math.sqrt(1 - v * v); return [c * Math.cos(az), v, c * Math.sin(az)]; };
    const eN = eyeS(0.62, -0.1), eF = eyeS(-0.62, -0.1);
    const anchors = {
      gem: pt(gemF, [0, 0, 0]),
      mouth: V3.scale(V3.add(pt(headF, [35, 51.5, 0]), pt(jawF, [32.5, 51.5, 0])), 0.5),
      top: pt(crestF, [-23, 95.5, 0]),
      head: pt(headF, [12, 62, 0]),
      eyeN: { p: V3.add(cranium.c, M3.v(cranium.L, eN)), s: eN },
      eyeF: { p: V3.add(cranium.c, M3.v(cranium.L, eF)), s: eF },
    };
    return {
      autoSide: !pose || pose.side === undefined,
      prims, anchors, pose: P,
      stamps: [
        { at: Object.assign({ prim: cranium }, anchors.eyeN), set: EYES, colors: EYEC, kind: P.eyes },
        { at: Object.assign({ prim: cranium }, anchors.eyeF), set: EYES, colors: EYEC, kind: P.eyes, flipX: true },
      ],
      dots: [],
      pri: { 1: 0, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2, 11: 2, 12: 3, 13: 3, 16: 2, 17: 3, 20: 1, 21: 2, 22: 0, 23: 3, 24: 3 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 0, // contact shadows are baked (cheaper first renders)
    };
  }

  // Render into a tight buffer around the model's projected bounds (same bbox maths as the
  // renderer, so pixels are identical), then place it in the full sprite buffer.
  function render(model, opt) {
    // `side` mirrors the camera cheats; when the caller did not pass it, derive it from the yaw
    // exactly like the game does (side = clamp(3 cos yaw, -1, 1)) and rebuild if it differs
    if (model.autoSide) {
      const sd = Math.max(-1, Math.min(1, 3 * Math.cos(opt.yaw ?? 1.05)));
      if (Math.abs(sd - model.pose.side) > 1e-6) model = build(Object.assign({}, model.pose, { side: sd }));
    }
    const sc = opt.scale || 1;
    LWH = 0.5 * Math.max(1.7, 1.25 / sc);
    const set = sc >= 1.5 ? EYES_L : EYES;
    for (const st of model.stamps) st.set = set;
    let pal = opt.pal || PAL;
    const g = Math.min(1, model.pose.gem || 0);
    if (g > 0) {
      const e = pal[GEM];
      pal = Object.assign({}, pal, { [GEM]: { r: e.r.map((c, i) => PX.mix(c, GEM_GLOW[i], g)), od: e.od, ol: PX.mix(e.ol, GEM_GLOW[1], g * 0.5), ln: PX.mix(e.ln, GEM_GLOW[0], g * 0.6) } });
    }
    const { yaw = 1.05, pitch = 0.16, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(sc, sc, sc)));
    // nearest primitives first: hidden pixels then fail the depth test before any mat() call
    // (draw order only affects overdraw, not the image)
    const zs = new Map();
    for (const p of model.prims) zs.set(p, V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2]);
    model.prims.sort((a, b) => zs.get(b) - zs.get(a));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        grow(ox + cv[0] - rx, oy - cv[1] - ry); grow(ox + cv[0] + rx, oy - cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]]) for (const w of [-p.thick, p.thick]) {
          const q = V3.add(cv, M3.v(Lv, [u, v, w]));
          grow(ox + q[0], oy - q[1]);
        }
      }
    }
    const X0 = Math.max(0, Math.floor(x0) - 3), Y0 = Math.max(0, Math.floor(y0) - 3);
    const X1 = Math.min(W - 1, Math.ceil(x1) + 3), Y1 = Math.min(H - 1, Math.ceil(y1) + 3);
    if (X1 < X0 || Y1 < Y0) return Creature.render(model, Object.assign({}, opt, { pal }));
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { pal, W: w, H: h, ox: ox - X0, oy: oy - Y0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const src = y * w, dst = (y + Y0) * W + X0;
      buf.d.set(r.buf.d.subarray(src, src + w), dst);
      depth.set(r.depth.subarray(src, src + w), dst);
      part.set(r.part.subarray(src, src + w), dst);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + X0, a[1] + Y0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  // heightM is the chibi's rendered height (~95 units); the Pokédex height is 5.4 m
  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.56, pokedexM: 4.2, bw: 150, bh: 150, oy: 0.82 } };
})();
