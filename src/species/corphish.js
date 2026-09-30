/* ------------------------------------------------------------------
   Corphish — the Ruffian Pokémon (0.6 m ≈ 105 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): an upright, egg-shaped crayfish. A red-orange
   carapace hood crowned by three sharp spikes (a tall one in the middle,
   two swept out to the sides) covers the head, back and sides; a nose
   keel runs down between two big, bulging white eyes with tiny pupils.
   A Λ-topped window in the front of the hood shows the cream face and the
   stacked cream belly plates (their overlaps draw the "smile" and the
   segment lines). Two huge egg-shaped claws, held up beside the head:
   a big cream palm under a red cap with a zigzag, tooth-edged rim that
   also runs down the inner edge; the cap is the movable jaw, hinged on
   the inner side, and opens like a mouth at the outer top. Thin red arms
   with cream joints, six curved horn-like legs on cream hip joints, and a
   segmented tail ending in a pointed fan.

   Pose params:
     walk         radians  tripod scuttle phase; exactly 0 = standing
     clawN/clawF  0..1     near / far pincer open
     armN/armF    −0.5..1  near / far arm: 0 = claws up beside the head (as in
                           the official art), 1 = raised high, −0.5 = held low in front
     mouth        0..1     small mouth opens (tongue shows)
     eyes         'open' | 'blink' | 'closed' | 'happy' | 'angry' | 'dizzy' | 'sleep'
     squash 0..1, tilt (radians, sideways body roll; feet stay planted), side (unused)
   Anchors: top (middle spike tip), head, mouth, body, eyeN, eyeF, clawTipN, clawTipF.
------------------------------------------------------------------- */
const Corphish = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const SHELL = 1, CREAM = 2, EYE = 3, INNER = 4, MOUTH = 5, TONGUE = 6, SEG = 7;
  const MAT = { SHELL, CREAM, EYE, INNER, MOUTH, TONGUE, SEG };
  const PAL = Creature.palette({
    [SHELL]: { r: ['#a9422c', '#d35c3e', '#ef7d55', '#faa27c', '#ffc8aa'], od: '#5c1c10', ol: '#963820', ln: '#a43e26' },
    [CREAM]: { r: ['#a39380', '#c3b39e', '#ddd0bc', '#eee6d7', '#fbf7ee'], od: '#5a4432', ol: '#8a735c', ln: '#76604c' },
    [EYE]: { r: ['#c2c9d8', '#dde3ee', '#f3f6fa', '#ffffff', '#ffffff'], od: '#44201a', ol: '#6a3428', ln: '#4a2218' },
    [INNER]: { r: ['#3c140e', '#541c14', '#6c281c', '#833626', '#9a4834'], od: '#2a0a06', ol: '#3e120c', ln: '#2e0c08' },
    [MOUTH]: { r: ['#3e0c12', '#56141a', '#6e1e24', '#88282c', '#a03836'], od: '#2a0608', ol: '#3a0c10', ln: '#3a0c10' },
    [TONGUE]: { r: ['#b0404a', '#cc5a60', '#e57a78', '#f59a92', '#ffc0b4'], od: '#5a1018', ol: '#7a1c24', ln: '#8a2830' },
    [SEG]: { r: ['#5e4a3a', '#6a5644', '#78624e', '#846e58', '#907a62'], od: '#5a4432', ol: '#8a735c', ln: '#78624e' },
  });
  const GLOSSY = { [SHELL]: 1 };
  const NO_DOTS = [{}].slice(1); // empty, but with the elements kind of Mudkip's dot list
  const C_SHELL = code(SHELL), C_SHELL_D = code(SHELL, -1), C_CREAM = code(CREAM), C_EYE = code(EYE), C_INNER = code(INNER);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_SEG = code(SEG);
  const M_SHELL = () => C_SHELL, M_CREAM = () => C_CREAM, M_EYE = () => C_EYE, M_LINING = () => C_SHELL_D;

  // ---- vector helpers
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  const mz = (a, side) => [a[0], a[1], a[2] * side]; // mirror to the far side
  const inF = (f, p) => add(f.t, M3.v(f.L, p)); // local point → parent space

  // Primitives, stamps and the model reuse Mudkip's exact object layouts, so the shared
  // renderer's inline caches see no new hidden classes (no deopts when species interleave).
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 (frame-local points) along its local y axis, x kept close to `fwd`
  function seg(f, p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-3) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(inF(f, sc(add(p0, p1), 0.5)), M3.mul(f.L, M3.cols(sc(X, rx), sc(Y, l / 2), sc(Z, rz))), part, grp, mat);
  }

  // ---- faceted cone (flat triangular plates): the head spikes
  function pyramid(base, apex, r, n, rot) {
    const ax = nrm(sub(apex, base));
    let e1 = cross(ax, [0, 0, 1]);
    if (len3(e1) < 1e-3) e1 = cross(ax, [1, 0, 0]);
    e1 = nrm(e1);
    const e2 = cross(ax, e1);
    const V = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2;
      V.push(add(base, add(sc(e1, r * Math.cos(a)), sc(e2, r * Math.sin(a)))));
    }
    const faces = [];
    let hw = 0, h = 0;
    for (let k = 0; k < n; k++) {
      const A = V[k], B = V[(k + 1) % n];
      const M = sc(add(A, B), 0.5);
      const u = nrm(sub(B, A));
      let v = sub(apex, M);
      v = nrm(sub(v, sc(u, dot(v, u))));
      hw = len3(sub(B, A)) / 2;
      h = dot(sub(apex, M), v);
      faces.push({ M, axes: M3.cols(u, v, cross(u, v)) });
    }
    const shape = bakeShape({
      bb: [-hw - 0.5, -0.5, hw + 0.5, h + 0.5],
      test: (u, v) => (Shape2D.inTri(u, v, [-hw - 0.15, 0], [hw + 0.15, 0], [0, h]) ? C_SHELL : 0),
    });
    return { faces, shape };
  }

  /* ---------- body (body frame: origin on the ground, before squash / roll) ----------
     The hood is an egg: two half-ellipsoids sharing the equator (a tall dome over a rounder
     base). The cream face and belly are "proud" copies of it (a touch larger, mostly forward),
     painted only inside their regions, so they sit on the hood like armour plates and their
     edges get clean contour lines at every size. */
  const HC = [-1, 38, 0], HRX = 21, HRZ = 25, HRU = 41, HRL = 27;
  const FACE_K = [1.12, 1.0, 1.03], BELLY_K = [1.065, 1.0, 1.02];
  const LAM_Y = 61.5, LAM_K = 0.88; // Λ-shaped top edge of the cream face: y < LAM_Y − LAM_K·|z|
  const smileY = (z) => 37.5 + 0.029 * z * z; // bottom edge of the face (the "smile"), corners up
  const bellyW = (y) => 17.5 - 0.01 * (y - 28) * (y - 28);
  // belly segment lines: rings that curve up toward the sides (≈1 px wide at any scale)
  let lineW = 0.5;
  const SEG_Y = [28.5, 20];
  const hoodU = (s) => (s[1] < 0 ? 0 : C_SHELL);
  const hoodL = (s) => (s[1] > 0 ? 0 : s[1] < -0.86 ? C_CREAM : C_SHELL);
  function plateMat(K, R, upper, fn) {
    const rx = HRX * K[0], ry = R * K[1], rz = HRZ * K[2];
    return (s) => ((upper ? s[1] < 0 : s[1] > 0) ? 0 : fn(HC[0] + rx * s[0], HC[1] + ry * s[1], rz * s[2]));
  }
  // the face plate is two mirrored halves turned slightly toward the middle: they meet in a
  // prow-like crease down the centre of the face (as in the official art)
  const PROW = 0.2;
  function prowMat(K, R, upper, zs, fn) {
    const rx = HRX * K[0], ry = R * K[1], rz = HRZ * K[2];
    const c = Math.cos(PROW * zs), sn = Math.sin(PROW * zs);
    return (s) => {
      if (upper ? s[1] < 0 : s[1] > 0) return 0;
      const lx = rx * s[0], lz = rz * s[2];
      const x = HC[0] + c * lx + sn * lz, z = -sn * lx + c * lz;
      return z * zs < -0.05 ? 0 : fn(x, HC[1] + ry * s[1], z);
    };
  }
  const faceAt = (mo, mh, mc) => (x, y, z) => {
    if (x < 3 || y >= LAM_Y - LAM_K * Math.abs(z) || y <= smileY(z)) return 0;
    if (mo > 0.02) {
      // small mouth just above the smile line, opening upward
      const dv = (y - (38.6 + mc)) / mh, dz = z / 3.2;
      if (dv * dv + dz * dz < 1) return dv < -0.2 && mo > 0.4 ? C_TONGUE : C_MOUTH;
    }
    return y - smileY(z) < lineW * 1.2 ? C_SEG : C_CREAM;
  };
  const bellyAt = (x, y, z) => {
    if (x < 1.5 || y > smileY(z) + 1.5 || Math.abs(z) > bellyW(y)) return 0;
    for (const y0 of SEG_Y) if (Math.abs(y - (y0 + 0.02 * z * z)) < lineW) return C_SEG;
    return C_CREAM;
  };
  const BELLY_U = plateMat(BELLY_K, HRU, true, bellyAt), BELLY_L = plateMat(BELLY_K, HRL, false, bellyAt);

  // three spikes: the tall middle one and two swept out to the sides
  const SPIKES = [
    pyramid([-1.5, 75.5, 0], [-4, 106, 0], 5.2, 8, 0.2),
    pyramid([-1, 70, 12.8], [-3.5, 97, 27], 4.4, 7, 0.3),
    pyramid([-1, 70, -12.8], [-3.5, 97, -27], 4.4, 7, 0.3),
  ];

  /* ---------- claws (claw frame: origin at the wrist; x' = along the claw toward its top,
     y' = out of the broad cream palm face, z' = across the claw, toward its outer edge) ----------
     The claw is an egg (rounder, broader top). The red cap (upper jaw) sits over the top above a
     zigzag bite line u = U0 + K·w − TA·tooth(w) (u along x' from the egg centre, w along z'),
     lower on the inner side, and hinges about the y' axis at the inner end of that line. */
  const CL_T = 23, CL_B = 28.5, CL_Y = 12.5, CL_Z = 17.5; // egg half-lengths (top, bottom), half-thickness, half-width
  const U0 = 5.5, KB = 0.22, TA = 5, TP = 8.2, TPH = 0.3;
  const tooth = (w) => { const f = w / TP + TPH; const q = f - Math.floor(f); return 1 - Math.abs(2 * q - 1); };
  const biteU = (w) => U0 + KB * w - TA * tooth(w);
  const BAND = -0.72; // inner-edge red band on the palm (s2 below this)
  const palmMat = (A) => (s) => {
    const u = s[0] * A;
    if (u > biteU(s[2] * CL_Z)) return 0;
    return s[2] < BAND && u > -12 + (s[2] - BAND) * 20 ? C_SHELL : C_CREAM;
  };
  const capMat = (A) => (s) => (s[0] * A > biteU(s[2] * CL_Z) ? C_SHELL : 0);
  // flat dark plates closing the cut faces (seen only while the pincer is open)
  const BN = nrm([1, 0, -KB]), BE1 = nrm([KB, 0, 1]), BE2 = [0, 1, 0];
  const insideEgg = (p, k) => { const A = p[0] > 0 ? CL_T : CL_B; return (p[0] / A) ** 2 + (p[1] / CL_Y) ** 2 + (p[2] / CL_Z) ** 2 < k; };
  function bitePlate(off) {
    const P0 = [U0 + off, 0, 0];
    return bakeShape({
      bb: [-CL_Z * 1.2, -CL_Y - 1, CL_Z * 1.2, CL_Y + 1],
      test: (a, b) => (insideEgg(add(P0, add(sc(BE1, a), sc(BE2, b))), 0.93) ? C_INNER : 0),
    });
  }
  const PALM_PLATE = { off: -TA + 0.3, shape: bitePlate(-TA + 0.3) };
  const CAP_PLATE = { off: -0.3, shape: bitePlate(-0.3) };
  const HINGE = [CL_B + U0 - KB * CL_Z - 1, 0, -CL_Z + 1.2]; // wrist-relative, inner end of the bite line
  // arm keyframes (near side, body frame): shoulder → elbow → wrist, claw axis, palm-face direction
  const ARM_K = [
    { a: -0.5, E: [8, 32, 23], W: [12, 33, 24], X: [0.72, 0.5, 0.45], Y: [-0.2, 0.3, 1] },
    { a: 0, E: [0, 38.5, 25], W: [3, 43, 24.5], X: [0.03, 0.87, 0.5], Y: [1, 0, -0.12] },
    { a: 1, E: [-2, 52, 26], W: [-1, 59, 26.5], X: [-0.05, 0.95, 0.32], Y: [1, 0.05, -0.05] },
  ];
  const SHOULDER = [-2, 40, 20];
  function armKey(a) {
    const i = a <= 0 ? 0 : 1;
    const k0 = ARM_K[i], k1 = ARM_K[i + 1];
    const t = clamp((a - k0.a) / (k1.a - k0.a), 0, 1);
    return { E: lerp3(k0.E, k1.E, t), W: lerp3(k0.W, k1.W, t), X: nrm(lerp3(k0.X, k1.X, t)), Y: lerp3(k0.Y, k1.Y, t) };
  }

  /* ---------- eyes: big bulging white ovals on the front of the hood ---------- */
  const EYE_AZ = 0.74, EYE_V = 0.683, EYE_R = [6, 7.7, 4.8], EYE_OUT = 2.4, EYE_UP = 0.3;
  // angry lid: the hood colour slanting down toward the nose
  const lidMat = (s) => (s[1] > 0.3 - 0.55 * s[0] ? C_SHELL : 0);
  const LOOK = nrm([1, -0.12, 0]);

  /* ---------- legs: hips in the body frame, feet on the ground (tripod gait phases) ---------- */
  const LEGS = [
    { hip: [12, 19, 9.5], foot: [30, 0, 19], ph: 0 },
    { hip: [-1, 18, 16], foot: [1, 0, 42], ph: Math.PI },
    { hip: [-13, 19, 11.5], foot: [-28, 0, 32], ph: 0 },
  ];
  const KNEE_OUT = 6.5, KNEE_UP = 8;
  const TAPER = [[-0.14, 0.72, 5.7], [0.34, 1, 3]];

  /* ---------- tail: overlapping segments trailing back, then a pointed fan ---------- */
  const TAIL = [
    { c: [-20, 31, 0], r: [7.2, 6.8, 12], a: -0.12 },
    { c: [-26.5, 28.6, 0], r: [6.4, 6, 11], a: -0.34 },
    { c: [-32, 25.4, 0], r: [5.7, 5.2, 10], a: -0.6 },
  ];
  // fan in its own plane (u = back along the tail, v = across): telson + two uropods a side
  const FAN_P = [[0, -6.5], [8, -11.5], [17, -16.5], [15, -9], [21.5, -6.5], [26, 0], [21.5, 6.5], [15, 9], [17, 16.5], [8, 11.5], [0, 6.5]];
  // two cupped halves (outer edges tipped down), so the fan reads as 3D from every side
  const FAN_POLY = Shape2D.poly(FAN_P, C_SHELL, 4);
  const FAN_G = bakeShape({ bb: FAN_POLY.bb, test: (u, v) => (v < -0.4 ? 0 : FAN_POLY.test(u, v)) });
  const FAN_CUP = 0.42;
  const FAN_LINES = [[[2, -3.8], [11, -9], [15.5, -14.5]], [[2, 3.8], [11, 9], [15.5, 14.5]], [[4, -1.5], [13, -4.4], [20, -5.3]], [[4, 1.5], [13, 4.4], [20, 5.3]]];

  // contour-line priorities per group (integer-keyed object like Mudkip's)
  const PRI = {};
  for (let i = 1; i < 72; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 2, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 10: 1, 11: 1, 12: 7, 13: 7, 60: 1, 61: 0, 62: -1, 63: -2 });
  for (const b of [20, 30]) { PRI[b] = 3; PRI[b + 1] = 4; PRI[b + 2] = 3; PRI[b + 3] = 5; PRI[b + 4] = 6; PRI[b + 5] = 7; }
  for (let i = 40; i < 46; i++) PRI[i] = 1;

  const SIZE = 0.955; // 0.6 m ≈ 105 units tall (spike tip) at yaw 1.1–1.3
  const DEFAULT = { clawN: 0, clawF: 0, armN: 0, armF: 0, walk: 0, eyes: 'open', squash: 0, tilt: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const sq = clamp(+P.squash || 0, -0.3, 0.8);
    const root = F(M3.diag(1 + sq * 0.3, 1 - sq, 1 + sq * 0.3), [0, 0, 0]);
    // body roll about the forward axis (sideways shuffle); legs are IK so the feet stay planted
    const body = chain(root, T(0, 40, 0), R(M3.rx(-(+P.tilt || 0))), T(0, -40, 0));
    const hood = chain(body, T(...HC));

    /* --- eyes first (front-most): white eyeballs bulging from the hood; pupils are stamps --- */
    const ek = P.eyes === 'sleep' || P.eyes === 'blink' ? 'closed' : P.eyes;
    const closed = ek === 'happy' || ek === 'closed';
    for (const side of [1, -1]) {
      const s0 = Creature.sph(side * EYE_AZ, EYE_V);
      const pS = add(HC, [HRX * s0[0], HRU * s0[1], HRZ * s0[2]]);
      const n0 = nrm([s0[0] / HRX, s0[1] / HRU, s0[2] / HRZ]);
      const n = nrm([n0[0], n0[1] * EYE_UP, n0[2]]); // the eyeballs face more level than the dome they sit on
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = sc(cross(ye, n), side); // x_e points forward / toward the nose for both eyes
      const ax = M3.cols(xe, ye, n);
      const id = side > 0 ? 10 : 11;
      const eF = F(ax, add(pS, sc(n, EYE_OUT)));
      const eyeF = chain(body, eF);
      const eyePrim = ellF(eyeF, EYE_R, id, closed ? 2 : id, closed ? M_SHELL : M_EYE);
      prims.push(eyePrim);
      if (ek === 'angry') prims.push(ellF(eyeF, mul3(EYE_R, [1.14, 1.1, 1.2]), id + 2, id + 2, lidMat));
      // pupil: where the eyeball faces straight ahead (so it looks at the camera from the front)
      let sP;
      if (closed) sP = [0, 0.05, 1];
      else if (ek === 'dizzy') sP = [0.1, 0, 1];
      else {
        const dl = M3.v([ax[0], ax[3], ax[6], ax[1], ax[4], ax[7], ax[2], ax[5], ax[8]], LOOK); // axᵀ·LOOK
        sP = [EYE_R[0] * dl[0], EYE_R[1] * dl[1], EYE_R[2] * dl[2]];
        if (ek === 'angry') sP[1] -= 0.6;
      }
      sP = nrm(sP);
      const at = { prim: eyePrim, p: add(eyePrim.c, M3.v(eyePrim.L, sP)), s: sP };
      stamps.push({ at, set: EYE_SETS.M[ek] || EYE_SETS.M.open, colors: EYEC, kind: 'open' });
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- cream face plate (Λ top edge, smile bottom, optional mouth) and the belly plate --- */
    const mo = clamp(+P.mouth || 0, 0, 1);
    const fa = faceAt(mo, 1.1 + 2.6 * mo, 1.1 + 2.6 * mo);
    const hood2 = chain(body, T(...HC));
    for (const zs of [1, -1]) {
      const fr = chain(hood2, R(M3.ry(PROW * zs)));
      prims.push(ellF(fr, [HRX * FACE_K[0], HRU * FACE_K[1], HRZ * FACE_K[2]], 3, 3, prowMat(FACE_K, HRU, true, zs, fa)));
      prims.push(ellF(fr, [HRX * FACE_K[0], HRL * FACE_K[1], HRZ * FACE_K[2]], 3, 3, prowMat(FACE_K, HRL, false, zs, fa)));
    }
    prims.push(ellF(hood2, [HRX * BELLY_K[0], HRU * BELLY_K[1], HRZ * BELLY_K[2]], 4, 4, BELLY_U));
    prims.push(ellF(hood2, [HRX * BELLY_K[0], HRL * BELLY_K[1], HRZ * BELLY_K[2]], 4, 4, BELLY_L));

    /* --- hood (egg with the Λ window), nose keel, spikes --- */
    const hoodPrim = ellF(hood, [HRX, HRU, HRZ], 1, 2, hoodU);
    prims.push(hoodPrim);
    prims.push(ellF(hood, [HRX, HRL, HRZ], 1, 2, hoodL));
    // crown: broadens the top of the head between the spikes (sits behind the face and eyes)
    prims.push(ellF(chain(body, T(-2.5, 62, 0)), [16, 17, 20.5], 1, 2, M_SHELL));
    prims.push(ellF(chain(body, T(13.6, 68.5, 0), R(M3.rz(0.5))), [2.8, 9.5, 2.6], 1, 2, M_SHELL));
    for (const sp of SPIKES) for (const f of sp.faces) prims.push(PL(inF(body, f.M), M3.mul(body.L, f.axes), 8, 2, sp.shape, 1.01));

    /* --- claws --- */
    for (const side of [1, -1]) {
      const arm = clamp(+(side > 0 ? P.armN : P.armF) || 0, -0.5, 1.2);
      const open = clamp(+(side > 0 ? P.clawN : P.clawF) || 0, 0, 1);
      const k = armKey(arm);
      const X = mz(k.X, side);
      let Y = mz(k.Y, side);
      Y = nrm(sub(Y, sc(X, dot(Y, X))));
      const Z = sc(nrm(cross(Y, X)), side); // toward the claw's outer edge
      const CF = chain(body, F(M3.cols(X, Y, Z), mz(k.W, side)));
      const base = side > 0 ? 20 : 30;
      // palm (cream, red band on the inner edge): the egg's top and bottom halves
      const eggT = chain(CF, T(CL_B, 0, 0));
      const pT = palmMat(CL_T), pB = palmMat(CL_B);
      prims.push(ellF(eggT, [CL_T, CL_Y, CL_Z], base + 4, base + 4, (s) => (s[0] < 0 ? 0 : pT(s))));
      prims.push(ellF(eggT, [CL_B, CL_Y, CL_Z], base + 4, base + 4, (s) => (s[0] > 0 ? 0 : pB(s))));
      // cap (red upper jaw) hinged on the inner side
      const UF = chain(CF, T(...HINGE), R(M3.ry(open * 0.8)), T(-HINGE[0], -HINGE[1], -HINGE[2]));
      const capT = chain(UF, T(CL_B, 0, 0));
      const cT = capMat(CL_T), cB = capMat(CL_B);
      prims.push(ellF(capT, [CL_T, CL_Y, CL_Z], base + 5, base + 5, (s) => (s[0] < 0 ? 0 : cT(s))));
      prims.push(ellF(capT, [CL_B, CL_Y, CL_Z], base + 5, base + 5, (s) => (s[0] > 0 ? 0 : cB(s))));
      if (open > 0.02) {
        const pl = (fr, o, part) => {
          const c = [CL_B + U0 + o.off, 0, 0];
          prims.push(PL(inF(fr, c), M3.mul(fr.L, M3.cols(BE1, BE2, BN)), part, part, o.shape, 1.2));
        };
        pl(CF, PALM_PLATE, base + 4);
        pl(UF, CAP_PLATE, base + 5);
      }
      // wrist knob, forearm, elbow knob, upper arm
      prims.push(ellF(chain(CF, T(0.5, 0, -0.5)), [4.2, 4.2, 4.2], base + 3, base + 3, M_CREAM));
      const El = mz(k.E, side), Sh = mz(SHOULDER, side);
      prims.push(seg(body, El, mz(k.W, side), 3.2, 3.2, base + 2, base + 2, M_SHELL));
      prims.push(ellF(chain(body, T(...El)), [3.3, 3.3, 3.3], base + 1, base + 1, M_CREAM));
      prims.push(seg(body, Sh, El, 3.4, 3.4, base, base, M_SHELL));
      const tipL = [CL_B + U0 + KB * CL_Z * 0.85, 0, CL_Z * 0.85];
      anchors[side > 0 ? 'clawTipN' : 'clawTipF'] = sc(add(inF(CF, tipL), inF(UF, tipL)), 0.5);
    }


    /* --- legs: hips and knees ride on the body, feet stay planted (tripod scuttle) --- */
    const walk = +P.walk || 0;
    const W0 = F(M3.I(), [0, 0, 0]);
    let li = 0;
    for (const side of [1, -1])
      for (const lg of LEGS) {
        // tripod gait for a sideways scuttle: lifted feet swing along z (and a little along x)
        const ph = walk + lg.ph + (side > 0 ? 0 : Math.PI);
        const lift = walk ? Math.max(0, Math.sin(ph)) * 5 : 0;
        const swing = walk ? Math.cos(ph) * 4.5 : 0;
        const hipB = mz(lg.hip, side);
        const outB = nrm([lg.foot[0] - lg.hip[0], 0, (lg.foot[2] - lg.hip[2]) * side]);
        const hip = inF(body, hipB);
        const knee = inF(body, add(hipB, add(sc(outB, KNEE_OUT), [0, KNEE_UP + lift * 0.4, 0])));
        const foot = [lg.foot[0] + swing * 0.35, lift, lg.foot[2] * side * (1 + sq * 0.3) + swing];
        const out = nrm([foot[0] - knee[0], 0, foot[2] - knee[2]]);
        const id = 40 + li++;
        // sickle-shaped horn: fat rounded knee on top, bowing out, tapering to a sharp tip
        const kd = sub(foot, knee);
        const mid = add(add(knee, sc(kd, 0.4)), add(sc(out, 5), [0, 5.5, 0]));
        const cv = (t) => add(add(sc(knee, (1 - t) * (1 - t)), sc(mid, 2 * t * (1 - t))), sc(foot, t * t));
        for (const [t0, t1, r] of TAPER) prims.push(seg(W0, t0 < 0 ? sub(knee, sc(kd, -t0)) : cv(t0), cv(t1), r, r * 0.94, id, id, M_SHELL, out));
        prims.push(seg(W0, hip, knee, 2.6, 2.6, 46, 7, M_CREAM, out));
      }

    /* --- tail: flattened overlapping segments trailing back, ending in a fan --- */
    TAIL.forEach((t, i) => prims.push(ellF(chain(body, T(...t.c), R(M3.rz(t.a))), t.r, 60 + i, 60 + i, M_SHELL)));
    const fan = chain(body, T(-35, 23.5, 0), R(M3.rz(-0.72)));
    // fan halves: u = back along the tail (−x), v = out to one side (tipped down), w = normal
    for (const zs of [1, -1]) {
      const V = [0, -Math.sin(FAN_CUP), Math.cos(FAN_CUP) * zs], U = [-1, 0, 0];
      const lines = FAN_LINES.filter((pl) => pl[2][1] > 0).map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: SHELL, useLn: true }));
      prims.push(Object.assign(PL(fan.t, M3.mul(fan.L, M3.cols(U, V, cross(U, V))), 63, 63, FAN_G, 1.4), { lines }));
    }

    anchors.top = inF(body, [-3.5, 107, 0]); // middle spike tip
    anchors.head = inF(body, [HC[0], 60, 0]);
    anchors.body = inF(body, [2, 34, 0]);
    anchors.mouth = inF(body, [HRX * 1.1 - 2, 40, 0]);

    for (const p of prims) { p.c = sc(p.c, SIZE); p.L = p.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const key in anchors) anchors[key] = sc(anchors[key], SIZE);
    return { prims, anchors, pose: P, headPrim: hoodPrim, stamps, dots: NO_DOTS, pri: PRI, glossy: GLOSSY, baseMat: SHELL, shadowSteps: 16 };
  }

  /* ---------- eye stamps (pupils and closed-eye marks), one set per render size ----------
     Every set uses Mudkip's exact key layout (the renderer looks glyphs up by name);
     each expression puts its glyphs in the open/openN/openF slots and is drawn as kind 'open'.
     k = pupil, b = dark lid line, w = white. */
  const stampSet = (o, oN, oF) => ({ open: o, openN: oN, openF: oF, happy: o, happyN: oN, happyF: oF, blink: o, blinkN: oN, blinkF: oF, sleep: o, sleepN: oN, sleepF: oF });
  const EYE_SETS = {
    S: {
      open: stampSet(['k', 'k'], ['k', 'k'], ['k']),
      angry: stampSet(['k'], ['k'], ['k']),
      dizzy: stampSet(['kk', 'kk'], ['kk', 'kk'], ['k']),
      happy: stampSet(['.b.', 'b.b'], ['.b', 'b.'], ['b']),
      closed: stampSet(['bbb'], ['bb'], ['b']),
    },
    M: {
      open: stampSet(['kk', 'kk'], ['kk', 'kk'], ['k', 'k']),
      angry: stampSet(['kk', 'kk'], ['kk', 'kk'], ['k', 'k']),
      dizzy: stampSet(['.kk.', 'k..k', 'k.kk', '.k..'], ['.kk.', 'k..k', 'k.kk', '.k..'], ['kk', 'kk']),
      happy: stampSet(['.bb.', 'b..b', 'b..b'], ['.b.', 'b.b', 'b.b'], ['.b', 'b.']),
      closed: stampSet(['....', 'bbbb', '.bb.'], ['...', 'bbb', '.b.'], ['..', 'bb']),
    },
    L: {
      open: stampSet(['.kk.', 'kkkk', 'kkkk', '.kk.'], ['.kk', 'kkk', 'kkk', '.kk'], ['kk', 'kk', 'kk']),
      angry: stampSet(['kkk', 'kkk', '.k.'], ['kkk', 'kkk', '.k.'], ['kk', 'kk']),
      dizzy: stampSet(['.kkk.', 'k...k', 'k.k.k', 'k..kk', '.k...'], ['.kkk.', 'k...k', 'k.k.k', 'k..kk', '.k...'], ['.kk', 'k.k', 'kkk']),
      happy: stampSet(['..bb..', '.b..b.', 'b....b', 'b....b'], ['.bb.', 'b..b', 'b..b'], ['.b', 'b.', 'b.']),
      closed: stampSet(['......', '......', 'bbbbbb', '.bbbb.'], ['....', '....', 'bbbb', '.bb.'], ['..', '..', 'bb', '.b']),
    },
    XL: {
      open: stampSet(['.kkk.', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'], ['.kkk', 'kkkk', 'kkkk', 'kkkk', '.kkk'], ['kk', 'kk', 'kk', 'kk']),
      angry: stampSet(['kkkk', 'kkkk', 'kkkk', '.kk.'], ['kkk', 'kkk', 'kkk', '.k.'], ['kk', 'kk', 'kk']),
      dizzy: stampSet(['..kkkk..', '.k....k.', 'k..kk..k', 'k.k..k.k', 'k.k.kk.k', 'k..k...k', '.k....k.', '..kkk...'], ['.kkkk.', 'k....k', 'k.kk.k', 'k.k..k', 'k..kkk', '.k....'], ['.kk', 'k.k', 'kkk']),
      happy: stampSet(['...bbbb...', '..bb..bb..', '.bb....bb.', 'bb......bb', 'b........b'], ['..bbb..', '.bb.bb.', 'bb...bb', 'b.....b'], ['.bb', 'bb.', 'b..']),
      closed: stampSet(['..........', '..........', 'bbbbbbbbbb', '.bbbbbbbb.', '...bbbb...'], ['.......', '.......', 'bbbbbbb', '.bbbbb.'], ['...', '...', 'bbb', '.bb']),
    },
  };
  const EYEC = { k: '#1c1012', w: '#ffffff', b: '#5c1c10' };

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    const sets = EYE_SETS[s >= 1.75 ? 'XL' : s >= 1.15 ? 'L' : s >= 0.62 ? 'M' : 'S'];
    lineW = Math.max(0.3, 0.52 / s);
    const P = model.pose || {};
    const ek = P.eyes === 'sleep' || P.eyes === 'blink' ? 'closed' : P.eyes;
    for (const st of model.stamps) st.set = sets[ek] || sets.open;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 140, bh: 144, oy: 0.905 } };
})();
