/* ------------------------------------------------------------------
   Sharpedo — the Brutal Pokémon (1.8 m ≈ 315 px nose to tail at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is the bottom of the belly in the rest pose; the lunge arches
   the body about its middle.

   Design (official art): a stubby torpedo — the body is deepest at the
   head and tapers to a slim tail stock. Dark navy back, creamy white
   snout cap, lower jaw and belly. The skull is cut flat at the lip plane
   over a hinged lower jaw; a maroon throat and pink tongue show through
   the gape, big white triangular teeth ride on both jaw rims. A yellow
   four-point star sits on top of the snout, small red eyes with three
   curved black gill slits wrapped behind them, a tall swept dorsal fin
   with two stepped notches on its trailing edge, long pointed navy
   pectoral fins with pale tips, and a forked tail (navy upper lobe,
   white notched lower lobe).

   Pose parameters (all optional):
     mouth   0..1   jaws closed (teeth interlocked) .. gaping wide
     tail   -1..1   tail sways toward -z (-1) .. +z (+1)
     lunge   0..1   attack arch: the head rears up and forward, the tail curls down
     eyes   'open' | 'angry' | 'closed'   (also accepts 'happy' / 'blink' as closed-ish lids)
   Anchors: top (dorsal tip), head, mouth (centre of the gape), jawTip, eyeN, eyeF, body, tail, finN, finF.
------------------------------------------------------------------- */
const Sharpedo = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const NAVY = 1, WHITE = 2, STAR = 3, GILL = 4, THROAT = 5, TONGUE = 6, TOOTH = 7, FIN = 8;
  const MAT = { NAVY, WHITE, STAR, GILL, THROAT, TONGUE, TOOTH, FIN };
  const PAL = Creature.palette({
    [NAVY]:   { r: ['#10284e', '#173a68', '#1f4f86', '#2d66a2', '#4f86bf'], od: '#08152e', ol: '#123262', ln: '#0f2a54' },
    [FIN]:    { r: ['#10284e', '#173a68', '#1f4f86', '#2d66a2', '#4f86bf'], od: '#08152e', ol: '#123262', ln: '#0f2a54' },
    [WHITE]:  { r: ['#8c88ac', '#b5b2cf', '#dcdaec', '#f0eff8', '#ffffff'], od: '#36345e', ol: '#6c6a98', ln: '#7c7aa4' },
    [STAR]:   { r: ['#a8822c', '#cca444', '#e6c460', '#f4dc8c', '#fff2c4'], od: '#5a3e0c', ol: '#9a7420', ln: '#94701e' },
    [GILL]:   { r: ['#05080f', '#080c16', '#0b111e', '#101828', '#172236'], od: '#03050a', ol: '#05080f', ln: '#05080f' },
    [THROAT]: { r: ['#4a1426', '#662036', '#86304a', '#a0445e', '#b85a72'], od: '#2a0814', ol: '#4a1426', ln: '#4a1426' },
    [TONGUE]: { r: ['#b0506a', '#cc6a82', '#e48ca0', '#f2acbc', '#ffd0da'], od: '#661830', ol: '#8a2a44', ln: '#9a3650' },
    [TOOTH]:  { r: ['#a09cc0', '#c8c6de', '#eeedf7', '#ffffff', '#ffffff'], od: '#3a3862', ol: '#6a6894', ln: '#8a88ae' },
  });
  const GLOSSY = {};
  const C_NAVY = code(NAVY), C_WHITE = code(WHITE), C_STAR = code(STAR), C_GILL = code(GILL), C_THROAT = code(THROAT, -1);
  const C_TONGUE = code(TONGUE), C_TOOTH = code(TOOTH, 1), C_FIN = code(FIN), C_FINW = code(WHITE, 0);

  const DEFAULT = { mouth: 0, tail: 0, lunge: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale, nrm = V3.norm;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // straight-edged polygon plate (keeps the fin notches sharp); fn(u, v) picks the material
  const polyShape = (pts, fn) => {
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({ bb, test: (u, v) => (Shape2D.inPoly(u, v, pts) ? fn(u, v) : 0) });
  };
  const smooth = (pts, seg = 4) => Shape2D.catmull(pts, false, seg);

  /* ---------- geometry (body axis frame, before the final lift) ---------- */
  const SKULL_C = [34, 10, 0], SKULL_R = [84, 56, 52];
  const LIP_Y = -8;                                  // mouth plane (model units)
  const LIP_S = (LIP_Y - SKULL_C[1]) / SKULL_R[1];   // ... in skull unit-sphere v
  const HINGE = [-8, LIP_Y, 0];
  const JAW_C = [44, -10, 0], JAW_R = [76, 32, 48];  // lower jaw, in the hinge frame
  const JAW_S = -JAW_C[1] / JAW_R[1];                // its lip plane in jaw unit-sphere v
  const BODY_C = [-32, 8, 0], BODY_R = [96, 58, 48];
  const STOCK_C = [-122, 12, 0], STOCK_R = [38, 17, 12];
  const LIFT = 50;

  // cut-face ellipses (x-z) of the skull and the jaw at their lip planes
  const SK_K = Math.sqrt(1 - LIP_S * LIP_S), JW_K = Math.sqrt(1 - JAW_S * JAW_S);

  /* ---------- skull surface: navy top, white snout cap / upper lip, star, gills ---------- */
  const EYE_AZ = 0.74, EYE_V = 0.06;
  const GILLS = [0.15, 0.205, 0.26];                 // angular radii of the slits around the eye
  const GILLS_S = [0.16, 0.25];                      // (two wider slits at small scales)
  let gillW = 0.017, gills = GILLS;                  // set per render from the scale
  const skullMat = (s) => {
    // cut at the lip plane in front of the hinge (the lower jaw and the gape live there)
    const x = SKULL_C[0] + SKULL_R[0] * s[0];
    if (s[1] < LIP_S && x > HINGE[0] - 4) return 0;
    const az = Math.atan2(s[2], s[0]), a = Math.abs(az);
    const el = Math.asin(clamp(s[1], -1, 1));
    // yellow four-point star on top of the snout (astroid in the tangent plane)
    if (s[1] > 0.3 && s[0] > 0) {
      const u = el - 0.66, w = az * Math.cos(el);
      const q = Math.sqrt(Math.abs(u) / (u > 0 ? 0.36 : 0.26)) + Math.sqrt(Math.abs(w) / 0.36);
      if (q < 1) return C_STAR;
    }
    // gill slits: three black arcs wrapped around the back of the eye
    {
      const du = (a - EYE_AZ) * Math.cos(el), dv = el - EYE_V;
      if (du > 0.02 && Math.abs(dv) < du * 1.5 + 0.02) {
        const r = Math.hypot(du, dv * 0.9);
        for (const g of gills) if (Math.abs(r - g) < gillW) return C_GILL;
      }
    }
    // white snout cap: tall at the tip, narrowing back to the mouth corners
    const cf = Math.max(0, Math.cos(az));
    const lip = LIP_S + 0.1 + 0.62 * cf ** 5;
    if (s[1] < lip && x > HINGE[0] - 4) return C_WHITE;
    if (x <= HINGE[0] - 4 && s[1] < -0.38) return C_WHITE;
    return C_NAVY;
  };
  // body: navy back, white belly below a smooth line that rises toward the tail
  const bodyMat = (s) => (s[1] < -0.34 + 0.22 * Math.max(0, -s[0]) ? C_WHITE : C_NAVY);
  const stockMat = (s) => (s[1] < -0.1 ? C_WHITE : C_NAVY);

  /* ---------- fins (plates: u along, v across) ---------- */
  // dorsal: u runs back along the spine, v up; trailing edge with two stepped notches
  const DORSAL = polyShape([
    [-4, -14], ...smooth([[-2, 0], [8, 30], [20, 60], [32, 86], [40, 98]], 3), [45, 97], [47, 88],
    [48, 74], [41, 71], [50, 55], [52, 46], [44, 43], [54, 26], [62, 8], [70, -2], [70, -14],
  ], () => C_FIN);
  // pectoral: long, pointed, swept; pale tip
  const PECT = polyShape([
    [0, -11], ...smooth([[14, -12], [40, -10], [66, -6], [88, -1], [100, 2]], 3), ...smooth([[98, 5], [80, 8], [52, 12], [24, 14], [0, 12]], 3),
  ], (u) => (u > 86 ? C_FINW : C_FIN));
  const PELV = polyShape(smooth([[0, -5], [14, -7], [28, -6], [30, -3], [18, 3], [0, 5]], 3), () => C_FIN);
  // tail: navy upper lobe, white lower lobe with a notch
  const TAILF = polyShape([
    [-6, -12], [-6, 12], ...smooth([[0, 14], [14, 34], [28, 58], [40, 78], [48, 88]], 3), [53, 86],
    ...smooth([[50, 70], [42, 44], [36, 22], [32, 6]], 3), [34, -4], [40, -16], [46, -30], [42, -30], [48, -44], [52, -56], [46, -56],
    ...smooth([[36, -46], [22, -30], [8, -18]], 3),
  ], (u, v) => (v < -3 ? C_FINW : C_FIN));
  // teeth: white triangles (u across the base, v toward the tip)
  const TOOTH_S = bakeShape(Shape2D.poly([[-6.5, 0], [0, 0.6], [6.5, 0], [2.6, 9], [0, 16], [-2.6, 9]], C_TOOTH, 6));
  const UPPER_TEETH = [-1.18, -0.86, -0.54, -0.2, 0.2, 0.54, 0.86, 1.18];
  const LOWER_TEETH = [-1.02, -0.66, -0.26, 0.26, 0.66, 1.02];

  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 1, 2: 0, 3: 1, 4: 0, 5: -1, 6: 0, 7: 3, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2 });

  const SIZE = 1;
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const mo = clamp(P.mouth, 0, 1), tw = clamp(P.tail, -1, 1), lg = clamp(P.lunge, 0, 1);
    const side = P.side === undefined ? 1 : clamp(P.side, -1, 1);
    // lunge: the front half rears up about the body middle, the rear half curls down
    const root = chain(T(0, LIFT + lg * 10, 0));
    const front = chain(root, T(-30, 0, 0), R(M3.rz(lg * 0.3)), T(30, 0, 0));
    const rear = chain(root, T(-30, 0, 0), R(M3.rz(-lg * 0.2)), T(30, 0, 0));

    /* --- skull (upper jaw + head) */
    const skullF = chain(front, T(...SKULL_C));
    const skull = ellF(skullF, SKULL_R, 1, 1, skullMat);
    prims.push(skull);

    /* --- lower jaw, hinged at the back of the mouth; cut flat at its lip plane */
    const open = mo * 0.66;
    const hingeF = chain(front, T(...HINGE), R(M3.rz(-open)));
    const jawF = chain(hingeF, T(...JAW_C));
    prims.push(ellF(jawF, JAW_R, 2, 2, (s) => (s[1] > JAW_S ? 0 : C_WHITE)));
    // tongue lying on the jaw floor (visible in the gape)
    if (mo > 0.04) prims.push(ellF(chain(jawF, T(-6, JAW_R[1] * JAW_S - 2.4, 0)), [JAW_R[0] * JW_K * 0.74, 4, JAW_R[2] * JW_K * 0.6], 6, 5, () => C_TONGUE));
    // dark throat filling the gape (hidden inside the head when the jaws are shut)
    prims.push(ellF(chain(front, T(24, LIP_Y - 4, 0)), [70, 20 + mo * 20, 44], 5, 5, () => C_THROAT));

    /* --- teeth: upper row hangs from the skull's lip rim, lower row stands on the jaw rim */
    const toothAt = (frame, rx, rz, th, dirY, id, grow) => {
      const px = rx * Math.cos(th), pz = rz * Math.sin(th);
      const out = nrm([Math.cos(th) / rx, 0, Math.sin(th) / rz]);   // rim normal (outward)
      const tang = nrm([-out[2], 0, out[0]]);
      const inset = 3.4;
      const pos = [px - out[0] * inset, 0, pz - out[2] * inset];
      const L = M3.mul(frame.L, M3.cols(sc(tang, grow), [0, dirY * grow, 0], out));
      return PL(inF(frame, pos), L, id, id, TOOTH_S, 1.6);
    };
    const upF = chain(skullF, T(0, LIP_Y - SKULL_C[1] + 1.5, 0));
    for (const th of UPPER_TEETH) prims.push(toothAt(upF, SKULL_R[0] * SK_K, SKULL_R[2] * SK_K, th, -1, 7, 1 - 0.12 * Math.abs(th)));
    const lowF = chain(jawF, T(0, JAW_R[1] * JAW_S - 1.5, 0));
    for (const th of LOWER_TEETH) prims.push(toothAt(lowF, JAW_R[0] * JW_K, JAW_R[2] * JW_K, th, 1, 7, 0.95 - 0.12 * Math.abs(th)));

    /* --- body and tail */
    const bodyF = chain(rear, T(...BODY_C));
    prims.push(ellF(bodyF, BODY_R, 3, 1, bodyMat));
    const stockF = chain(rear, T(STOCK_C[0] + 22, STOCK_C[1], 0), R(M3.rz(-lg * 0.25)), R(M3.ry(tw * 0.4)), T(-22, 0, 0));
    prims.push(ellF(stockF, STOCK_R, 4, 3, stockMat));
    const tfF = chain(stockF, T(-STOCK_R[0] + 10, 0, 0), R(M3.ry(tw * 0.3)), R(M3.rz(-lg * 0.2)));
    prims.push(PL(tfF.t, M3.mul(tfF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 8, 8, TAILF, 2.4));

    /* --- fins */
    const dF = chain(bodyF, T(26, BODY_R[1] * 0.9, 0), R(M3.rz(-0.08)), R(M3.rx(side * 0.05)));
    prims.push(PL(dF.t, M3.mul(dF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 9, 1, DORSAL, 4));
    const finTips = [];
    for (const sd of [1, -1]) {
      const pf = chain(front, T(-6, -30, sd * 38), R(M3.ry(sd * 0.62)), R(M3.rz(-0.42)), R(M3.rx(sd * 0.5)));
      prims.push(PL(pf.t, M3.mul(pf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), sd > 0 ? 10 : 11, sd > 0 ? 10 : 11, PECT, 2.2));
      finTips.push(inF(pf, [-98, 3, 0]));
      const vf = chain(bodyF, T(-44, -BODY_R[1] * 0.72, sd * 16), R(M3.ry(sd * 0.4)), R(M3.rz(-0.5)));
      prims.push(PL(vf.t, M3.mul(vf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), 12, 12, PELV, 1.6));
    }

    /* --- eyes: red target stamps (angry lids slant down toward the snout) */
    const eyeKind = P.eyes === 'angry' ? 'angry' : P.eyes === 'closed' || P.eyes === 'blink' || P.eyes === 'happy' ? 'blink' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      const at = { prim: skull, p: inF(skullF, [s[0] * SKULL_R[0], s[1] * SKULL_R[1], s[2] * SKULL_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.6, far: 0.34, minFacing: 0.2, toFront: [SKULL_R[0] * (1 - s[0]), -s[2] * SKULL_R[2]] });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    Object.assign(anchors, {
      top: inF(dF, [-40, 98, 0]),
      head: skullF.t,
      mouth: inF(front, [SKULL_C[0] + SKULL_R[0] * 0.7, LIP_Y - 12 * mo, 0]),
      jawTip: inF(jawF, [JAW_R[0] * 0.95, 0, 0]),
      body: bodyF.t,
      tail: inF(tfF, [-50, 0, 0]),
      finN: finTips[0], finF: finTips[1],
    });
    if (SIZE !== 1) {
      for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
      for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
      for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    }
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: NAVY, shadowSteps: 14, shadowDepth: 28 };
  }

  /* ---------- eye stamps: k = black ring / pupil, r = red iris, w = glint ---------- */
  const mk = (o, oN, oF, a, aN, aF, b, bN, bF) => ({ open: o, openN: oN, openF: oF, angry: a, angryN: aN, angryF: aF, blink: b, blinkN: bN, blinkF: bF });
  const EYES_S = mk(
    ['.kk.', 'krrk', 'krwk', '.kk.'], ['.k.', 'krk', 'kwk', '.k.'], ['k', 'r', 'k'],
    ['kk..', 'krkk', 'krwk', '.kk.'], ['kk.', 'krk', '.k.'], ['k', 'k'],
    ['kkkk'], ['kkk'], ['kk'],
  );
  const EYES_M = mk(
    ['.kkk.', 'krrrk', 'krkwk', 'krrrk', '.kkk.'], ['.kk.', 'krrk', 'krwk', 'krrk', '.kk.'], ['.k.', 'krk', 'kkk', '.k.'],
    ['kk...', 'krkkk', 'krkwk', 'krrrk', '.kkk.'], ['kk..', 'krkk', 'krwk', '.kk.'], ['k.', 'kk', 'kk'],
    ['kkkkk', '.kkk.'], ['kkkk', '.kk.'], ['kkk'],
  );
  const EYES_XL = mk(
    ['...kkkk...', '.kkrrrrkk.', '.krrrrrrk.', 'krrrkkrrrk', 'krrkkwkrrk', 'krrkkkkrrk', 'krrrkkrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['..kkkk..', '.krrrrk.', 'krrkkrrk', 'krkkwkrk', 'krkkkkrk', 'krrkkrrk', '.krrrrk.', '..kkkk..'],
    ['.kkk.', 'krrrk', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['kkk.......', 'krrkkk....', '.krrrrkkk.', 'krrrkkrrkk', 'krrkkwkrrk', 'krrkkkkrrk', 'krrrkkrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['kk......', 'krkkk...', 'krrkkkkk', 'krkkwkrk', 'krkkkkrk', 'krrkkrrk', '.krrrrk.', '..kkkk..'],
    ['kk...', 'krkk.', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['kkkkkkkkkk', '.kkkkkkkk.'], ['kkkkkkkk', '.kkkkkk.'], ['kkkkk', '.kkk.'],
  );
  const EYES_L = mk(
    ['..kkk..', '.krrrk.', 'krrkkrk', 'krkkwrk', 'krkkkrk', '.krrrk.', '..kkk..'],
    ['.kkk.', 'krrrk', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['.kk.', 'krrk', 'kkwk', 'krrk', '.kk.'],
    ['kk.....', 'krkk...', 'krrkkkk', 'krkkwrk', 'krkkkrk', '.krrrk.', '..kkk..'],
    ['kk...', 'krkkk', 'krkwk', 'krrrk', '.kkk.'],
    ['kk..', 'krkk', 'kkwk', '.kk.'],
    ['kkkkkkk', '.kkkkk.'], ['kkkkk', '.kkk.'], ['kkkk'],
  );
  const EYEC = { k: '#0c0d14', r: '#e0283c', w: '#ffffff' };

  // drop tiny detached islands (a fin seen edge-on can leave lone outlined pixels)
  function despeckle(d, depth, part, w, h) {
    const seen = new Uint8Array(w * h), stack = [], comp = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!d[i0] || seen[i0]) continue;
      stack.length = 0; comp.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const x = i % w;
        if (x > 0 && d[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && d[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (i >= w && d[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (i < w * (h - 1) && d[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      if (comp.length < 9) for (const i of comp) { d[i] = 0; depth[i] = -1e9; part[i] = 0; }
    }
  }

  /* ---------- render: eye size by scale, angry lids flipped toward the snout, cropped ray-cast ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    gills = scale < 0.5 ? GILLS_S : GILLS;
    gillW = Math.max(0.017, 0.5 / (scale * SKULL_R[1]));
    const set = scale >= 0.8 ? EYES_XL : scale >= 0.58 ? EYES_L : scale >= 0.4 ? EYES_M : EYES_S;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const st of model.stamps) { st.set = set; st.flipX = st.kind === 'angry' && cy * st.toFront[0] - sy * st.toFront[1] < 0; }
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const u of [a, c]) for (const v of [b, d]) for (const w of [-p.thick, p.thick]) {
          const qx = cv[0] + Lv[0] * u + Lv[1] * v + Lv[2] * w, qy = cv[1] + Lv[3] * u + Lv[4] * v + Lv[5] * w;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, -qy); y1 = Math.max(y1, -qy);
        }
      }
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    despeckle(r.buf.d, r.depth, r.part, w, h);
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s0 = y * w, d0 = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s0, s0 + w), d0);
      depth.set(r.depth.subarray(s0, s0 + w), d0);
      part.set(r.part.subarray(s0, s0 + w), d0);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.8, bw: 432, bh: 312, oy: 0.775 } };
})();
