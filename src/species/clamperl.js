/* ------------------------------------------------------------------
   Clamperl — the Bivalve Pokémon (0.4 m ≈ 70 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward (the way the shell opens), y = up, z = near
   side at yaw 0; y = 0 is the bottom of the lower shell.

   Design (official art / HOME model): a big blue bivalve shell whose
   rims are cut into square, gear-like notches, each valve edged with
   blue and a white lip round a black inside. The upper valve stands up
   behind like an open lid; the lower valve is a dish tipped toward the
   viewer, holding a pale-blue fluffy mantle — a cushion of rounded lobes
   cupped round a pink pearl-like head with a small face: peaceful closed
   eyes, a tiny round mouth and white cheeks.

   Pose params:
     open   0..1    shell gape: 0 = shut (the body tucks down inside), 1 = wide open (default)
     pearl  0..1    pearl glow: the pearl brightens and twinkles
     eyes   'closed' (default, as in the official art) | 'open' | 'happy' | 'blink'
     mouth  0..1    the little round mouth opens wider
     side   -1..1   ≈ cos(yaw), passed by the game (unused, accepted)
   Anchors: top (top of the upper valve), head (pearl centre), mouth, eyeN, eyeF,
   body (mantle centre), pearl (front of the pearl), lid (inside centre of the
   upper valve), hinge.
------------------------------------------------------------------- */
const Clamperl = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const SHELL = 1, INNER = 2, RIM = 3, MANTLE = 4, PEARL = 5, FACE = 6, MOUTH = 7, CHEEK = 8;
  const MAT = { SHELL, INNER, RIM, MANTLE, PEARL, FACE, MOUTH, CHEEK };
  const PAL = Creature.palette({
    [SHELL]:  { r: ['#1c3a7a', '#28529e', '#3669bc', '#5487d4', '#98c0ee'], od: '#0e1c4a', ol: '#223c7e', ln: '#1a3270' },
    [INNER]:  { r: ['#05070c', '#090d16', '#0f1522', '#182234', '#283854'], od: '#040509', ol: '#090d16', ln: '#1e2e4a' },
    [RIM]:    { r: ['#8c9ab2', '#b6c2d6', '#e2e9f3', '#f7faff', '#ffffff'], od: '#2c3854', ol: '#54627c', ln: '#6a7894' },
    [MANTLE]: { r: ['#5889c4', '#7aaade', '#a0ccf1', '#c6e5fb', '#ecf8ff'], od: '#284c88', ol: '#4870ae', ln: '#5480bc' },
    [PEARL]:  { r: ['#c66a7e', '#e08c9c', '#f3adb7', '#fbcad0', '#fff0f1'], od: '#782c42', ol: '#ae566a', ln: '#b0586c' },
    [FACE]:   { r: ['#3a1220', '#461828', '#521e30', '#5e2638', '#6a3040'], od: '#2a0c16', ol: '#3a1220', ln: '#3a1220' },
    [MOUTH]:  { r: ['#9c3446', '#b84656', '#d05c6a', '#e2767e', '#f0969a'], od: '#4a1422', ol: '#6e2032', ln: '#6e2032' },
    [CHEEK]:  { r: ['#e8d6de', '#f6eaef', '#ffffff', '#ffffff', '#ffffff'], od: '#a86878', ol: '#c88a98', ln: '#c88a98' },
  });
  const GLOSSY = { [SHELL]: 1, [PEARL]: 1 };
  const C_SHELL = code(SHELL), C_INNER = code(INNER), C_RIM = code(RIM), C_MANTLE = code(MANTLE);
  const C_FACE = code(FACE), C_MOUTH = code(MOUTH), C_CHEEK = code(CHEEK);

  const DEFAULT = { open: 1, pearl: 0, eyes: 'closed', mouth: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross, dot = V3.dot;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid centred at c whose local y axis points along dir (radii: rx across, ry along, rz across)
  function blob(c, dir, r, part, grp, mat) {
    const Y = nrm(dir);
    let X = cross(Y, [0, 0, 1]);
    if (Math.hypot(X[0], X[1], X[2]) < 1e-3) X = [1, 0, 0];
    X = nrm(X);
    const Z = cross(X, Y);
    return E(c, M3.mul(M3.cols(X, Y, Z), M3.diag(r[0], r[1], r[2])), part, grp, mat);
  }

  /* ---------- notched rims ----------
     notchFn(period, phase, span) gives h(phi): 1 on a tooth top, 0 at a notch bottom, with short
     sloped walls (a castellated edge), plain tooth beyond ±span; phi = 0 points away from the hinge. */
  function notchFn(period, phase, span) {
    return (phi) => {
      if (Math.abs(phi) > span) return 1;
      const f = (phi - phase) / period, fr = f - Math.floor(f);
      const d = Math.abs(fr - 0.5); // 0 at a notch centre, 0.5 mid-tooth
      return clamp((d - 0.2) / 0.1, 0, 1);
    };
  }
  /* upper valve: a thick lens hinged at the back. Lens local axes: x = inside normal (thickness),
     y = away from the hinge, z = across. Inside face: a blue edge, the white lip, then the black inside. */
  const UP_R = [6.5, 32, 39], UP_NOTCH = 0.86, BORDER = 0.065, LIP = 0.045;
  const UPPER_N = notchFn(0.6, 0.02, 2.3);
  function upperMat(s) {
    const r = Math.hypot(s[1], s[2]), phi = Math.atan2(s[2], s[1]);
    const d = UP_NOTCH + (1 - UP_NOTCH) * UPPER_N(phi) - r; // radial distance inside the notched outline
    if (d < 0) return 0;
    if (s[0] > 0.04) return d < BORDER ? C_SHELL : d < BORDER + LIP ? C_RIM : C_INNER;
    return C_SHELL;
  }
  /* lower valve: a deep dish tipped toward the viewer (its black inside shows behind the front
     rim), its outer wall cut down into notches with the white lip along the notched edge */
  const LO_R = [29, 17, 33], TIP = 0.27;
  const LOWER_N = notchFn(0.78, 0.0, 1.35); // notches only round the front: the sides stay clean
  function lowerMat(s) {
    const phi = Math.atan2(s[2], s[0]);
    const top = -0.38 * (1 - LOWER_N(phi)); // teeth reach the rim plane, notches are cut down
    if (s[1] > top) return 0;
    return s[1] > top - 0.13 ? C_RIM : C_SHELL;
  }
  const floorMat = () => C_INNER;

  /* ---------- pearl face (decals on the pearl's unit sphere, sized in pixels at render time) ---------- */
  let pxU = 0.05; // one pixel in pearl unit-sphere units (set per render)
  const EYE_AZ = 0.47, EYE_V = 0.36, CHEEK_AZ = 0.76, CHEEK_V = -0.02, MOUTH_V = -0.04;
  const tan = (q) => { const u = nrm(cross([0, 1, 0], q)); return [u, cross(q, u)]; };
  const EYES = [1, -1].map((zs) => { const q = Creature.sph(zs * EYE_AZ, EYE_V); return { q, t: tan(q), zs }; });
  const CHEEKS = [1, -1].map((zs) => { const q = Creature.sph(zs * CHEEK_AZ, CHEEK_V); return { q, t: tan(q) }; });
  const MQ = Creature.sph(0, MOUTH_V), MT = tan(MQ);
  const loc = (s, f) => { const d = sub(s, f.q); return [dot(d, f.t[0]), dot(d, f.t[1])]; };
  function pearlMat(kind, mo, cPearl) {
    return (s) => {
      if (s[0] < 0.2) return cPearl;
      const px = pxU, lw = Math.max(0.055, 1.05 * px);
      for (const e of EYES) {
        const [u0, v] = loc(s, e), u = u0 * e.zs; // u > 0 = toward the outer corner
        const w = Math.max(0.3, 2.6 * px);
        if (Math.abs(u) > w + lw || Math.abs(v) > 0.3) continue;
        const a = u / w;
        if (kind === 'open') {
          const rv = Math.max(0.12, 2.1 * px), ru = Math.max(0.085, 1.5 * px);
          const b = (u0 / ru) ** 2 + ((v + 0.02) / rv) ** 2;
          if (b < 1) return (u0 * e.zs + ru * 0.35) ** 2 + (v - rv * 0.35) ** 2 < (ru * 0.42) ** 2 && px < 0.06 ? C_CHEEK : C_FACE;
        } else if (Math.abs(a) < 1) {
          // closed: a smiling arc (ends up, dipping in the middle), outer end a touch lower;
          // happy: an upturned arc; blink: a flat line
          const h = Math.max(0.1, 1.4 * px);
          const yc = kind === 'happy' ? h * (0.3 - a * a) : kind === 'blink' ? -h * 0.2 : -h * (1 - a * a) - 0.12 * h * a;
          if (Math.abs(v - yc) < lw * 0.6) return C_FACE;
        }
      }
      for (const c of CHEEKS) {
        const [u, v] = loc(s, c), r = Math.max(0.1, 1.6 * px);
        if (u * u + v * v < r * r) return C_CHEEK;
      }
      {
        const [u, v] = loc(s, { q: MQ, t: MT });
        const ru = Math.max(0.065, 1.3 * px) * (1 + 0.3 * mo), rv = Math.max(0.08, 1.5 * px) * (1 + 0.8 * mo);
        const b = (u / ru) ** 2 + (v / rv) ** 2;
        if (b < 1) return b < 0.3 + 0.2 * mo && px < 0.075 ? C_MOUTH : C_FACE;
      }
      return cPearl;
    };
  }
  const SPARK = { S: ['.w.', 'www', '.w.'], M: ['..w..', '..w..', 'wwwww', '..w..', '..w..'], L: ['...w...', '...w...', '..www..', 'wwwwwww', '..www..', '...w...', '...w...'] };
  const SPARKC = { w: '#ffffff' };

  /* ---------- mantle: a skirt and six lobes cupped round the pearl, in the body frame
     (origin = centre of the lower valve's rim): [centre, direction, radii] ---------- */
  const PEARL_C = [4, 10, 0], PEARL_RAD = 11.2;
  const SKIRT = [[1, -3, 0], [18, 8.5, 22]];
  const LOBES = [
    [[11.5, 0.5, 15], [0.3, 1, 0.5], [7.6, 10.6, 7.4]], // front pair, standing up either side of the face
    [[11.5, 0.5, -15], [0.3, 1, -0.5], [7.6, 10.6, 7.4]],
    [[0, 6.5, 21], [0.1, 0.8, 1], [6.6, 9, 6.8]], // outer pair
    [[0, 6.5, -21], [0.1, 0.8, -1], [6.6, 9, 6.8]],
    [[-6.5, 15, 13], [-0.3, 1, 0.55], [6.2, 8, 6.4]], // back pair, peeking up behind the pearl
    [[-6.5, 15, -13], [-0.3, 1, -0.55], [6.2, 8, 6.4]],
  ];
  const SIZE = 0.84;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const open = clamp(P.open === undefined ? 1 : +P.open, 0, 1), glow = clamp(+P.pearl || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);

    /* --- lower valve: dish tipped forward, lowest point on the ground; dark inside just under the rim --- */
    const loLow = Math.hypot(LO_R[0] * Math.sin(TIP), LO_R[1] * Math.cos(TIP));
    const dish = chain(T(1, loLow, 0), R(M3.rz(-TIP)));
    prims.push(ellF(dish, LO_R, 1, 1, lowerMat));
    prims.push(ellF(chain(dish, T(0, -2.6, 0)), [LO_R[0] - 1.4, 2.4, LO_R[2] - 1.4], 2, 1, floorMat));
    const H = inF(dish, [-LO_R[0] + 1.5, 0.5, 0]); // hinge at the back rim
    anchors.hinge = H;

    /* --- upper valve: swings from lying on the dish (shut) to upright, a little past vertical --- */
    const th = lerp(-TIP + 0.04, 1.72, open);
    const U = [Math.cos(th), Math.sin(th), 0], N = [Math.sin(th), -Math.cos(th), 0];
    const upC = add(add(H, sc(U, lerp(LO_R[0] - 1, 19, open))), sc(N, -UP_R[0] * 0.5));
    const upP = E(upC, M3.mul(M3.cols(N, U, [0, 0, 1]), M3.diag(...UP_R)), 3, 2, upperMat);
    prims.push(upP);
    anchors.lid = add(upC, sc(N, UP_R[0] * 0.8));
    anchors.top = add(upC, sc(U, UP_R[1]));

    /* --- mantle and pearl: sit in the dish, tucking down inside as the shell shuts --- */
    const k = lerp(0.35, 1, smooth(0.12, 0.8, open));
    const body = chain(T(dish.t[0] + 1, dish.t[1], 0), F(M3.diag(k, k, k), [0, 0, 0]), T(0, -9 * (1 - k), 0));
    const inside = open > 0.12; // shut tight: the body is hidden inside
    if (inside) {
      prims.push(ellF(chain(body, T(...SKIRT[0])), SKIRT[1], 4, 3, () => C_MANTLE));
      LOBES.forEach(([c, d, r], i) => prims.push(blob(inF(body, c), M3.v(body.L, d), sc(r, k), 5 + i, 4 + (i % 2), () => C_MANTLE)));
    }
    anchors.body = inF(body, [2, 4, 0]);

    const pc = inF(body, PEARL_C), pr = PEARL_RAD * k;
    const kind = P.eyes === 'open' ? 'open' : P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : 'closed';
    const cPearl = code(PEARL, glow > 0.75 ? 2 : glow > 0.3 ? 1 : 0);
    const pearlP = E(pc, M3.diag(pr, pr, pr), 11, 6, pearlMat(kind, mo, cPearl));
    if (inside) prims.push(pearlP);
    const onPearl = (az, v) => { const s = Creature.sph(az, v); return { prim: pearlP, p: add(pc, sc(s, pr)), s }; };
    anchors.head = pc;
    anchors.pearl = add(pc, [pr, 0, 0]);
    anchors.eyeN = onPearl(EYE_AZ, EYE_V).p;
    anchors.eyeF = onPearl(-EYE_AZ, EYE_V).p;
    anchors.mouth = onPearl(0, MOUTH_V).p;
    // glow: twinkles on the black inside of the upper valve, round the pearl
    if (glow > 0.3 && open > 0.6) {
      const onLid = (y, z) => { const s = nrm([Math.sqrt(Math.max(0, 1 - y * y - z * z)), y, z]); return { prim: upP, p: add(upC, M3.v(upP.L, s)), s }; };
      stamps.push({ at: onLid(-0.12, 0.48), spark: 1, colors: SPARKC, minFacing: 0.05, set: null });
      if (glow > 0.65) {
        stamps.push({ at: onLid(0.3, -0.42), spark: 2, colors: SPARKC, minFacing: 0.05, set: null });
        stamps.push({ at: onLid(-0.3, -0.62), spark: 2, colors: SPARKC, minFacing: 0.05, set: null });
      }
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const kk in anchors) anchors[kk] = sc(anchors[kk], SIZE);
    pearlP.pr = pr * SIZE; // (render sizes the face decals in pixels from this)
    return {
      prims, anchors, pose: P, stamps, dots: [], pearlP,
      pri: { 1: 1, 2: 0, 3: 2, 4: 3, 5: 4, 6: 5 },
      glossy: GLOSSY, baseMat: PEARL, shadowSteps: 20, shadowDepth: 16,
    };
  }

  function render(model, opt) {
    const s0 = opt.scale || 1;
    pxU = 1 / (s0 * (model.pearlP ? model.pearlP.pr : PEARL_RAD));
    const sz = s0 >= 1.3 ? 'L' : s0 >= 0.7 ? 'M' : 'S';
    for (const st of model.stamps) st.set = { open: SPARK[st.spark === 2 ? (sz === 'L' ? 'M' : 'S') : sz] };
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 110, bh: 100, oy: 0.88 } };
})();
