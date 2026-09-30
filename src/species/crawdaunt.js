/* ------------------------------------------------------------------
   Crawdaunt — the Rogue Pokémon (1.1 m ≈ 192 units tall at scale 1).
   Corphish's evolution. A posable 3D model rendered straight to pixel
   art by the shared Creature pipeline (src/creature.js).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a tall crimson crayfish, its long domed head
   leaning forward over a big rounded body. A big pale-gold five-pointed
   star (faceted, with a ridge down every point) is stuck on the front of
   the crown. A cream mask covers the face and chest: a red nose-V dips
   into its top, two blue chevrons cross it, and it ends in a zigzag of
   teeth; a red band with more zigzags separates it from the cream belly.
   Small round eyes (white, thick black ring, tiny pupil) sit high on the
   sides of the head in dark-red sockets. Two huge pincers: a bulbous red
   palm, a curved red upper hook with conical teeth and spiky side studs,
   a cream fixed finger curving up to a pale tip, a black throat when
   open. Thin jointed arms, six chunky spiked legs with white claw tips,
   and a segmented tail ending in a pointed, gold-edged fan.

   Pose params:
     walk   radians  tripod scuttle phase; exactly 0 = standing
     claw   0..1     0 = claws held low in front, jaws barely open; 1 = raised high
                     and snapped wide open (boss pose / Crabhammer)
     mouth  0..1     small mouth opens (tongue shows)
     eyes   'open' (default, glaring) | 'happy' | 'closed' | 'blink' | 'angry' | 'dizzy'
     side   −1..1    ≈ 3·cos(yaw), from the game: the star turns a little toward the camera
     squash 0..1, tilt (radians, sideways body roll; feet stay planted)
   Anchors: top (star tip), head, mouth, body, eyeN, eyeF, clawTipN, clawTipF.
------------------------------------------------------------------- */
const Crawdaunt = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const SHELL = 1, CREAM = 2, EYE = 3, INNER = 4, MOUTH = 5, TONGUE = 6, STAR = 7, BLUE = 8, SOCKET = 9, NAIL = 10, SEG = 11;
  const MAT = { SHELL, CREAM, EYE, INNER, MOUTH, TONGUE, STAR, BLUE, SOCKET, NAIL, SEG };
  const PAL = Creature.palette({
    [SHELL]: { r: ['#7a2224', '#a63634', '#c94c44', '#e0685a', '#f39584'], od: '#420c0e', ol: '#7a1e1e', ln: '#7c1e1e' },
    [CREAM]: { r: ['#968a7c', '#b6aa9a', '#d2c6b4', '#e8ddcc', '#f8f2e6'], od: '#4e3c2c', ol: '#806a54', ln: '#6e5a48' },
    [EYE]: { r: ['#b6bac6', '#d6dae4', '#f0f2f6', '#ffffff', '#ffffff'], od: '#2a1012', ol: '#3a1618', ln: '#2a1012' },
    [INNER]: { r: ['#141012', '#1e181a', '#2a2224', '#3a3034', '#4c4044'], od: '#0c0808', ol: '#140c0e', ln: '#0c0808' },
    [MOUTH]: { r: ['#3e0c12', '#56141a', '#6e1e24', '#88282c', '#a03836'], od: '#2a0608', ol: '#3a0c10', ln: '#3a0c10' },
    [TONGUE]: { r: ['#b0404a', '#cc5a60', '#e57a78', '#f59a92', '#ffc0b4'], od: '#5a1018', ol: '#7a1c24', ln: '#8a2830' },
    [STAR]: { r: ['#b8964e', '#d6b670', '#eccd8a', '#fae3a4', '#fff4cc'], od: '#5e4214', ol: '#8e6a2a', ln: '#9a7430' },
    [BLUE]: { r: ['#285a92', '#3a78b6', '#5294cf', '#76b0e2', '#a6cff2'], od: '#16325c', ol: '#224a82', ln: '#1e3e6e' },
    [SOCKET]: { r: ['#3e0c0e', '#521416', '#661c1e', '#7a2626', '#8c3030'], od: '#2a0608', ol: '#3a0a0c', ln: '#2e0808' },
    [NAIL]: { r: ['#aaa6a2', '#cac6c2', '#e8e6e2', '#fafaf8', '#ffffff'], od: '#3c3432', ol: '#5c5450', ln: '#6c6460' },
    [SEG]: { r: ['#5a4838', '#665444', '#746050', '#806c5a', '#8c7864'], od: '#4e3c2c', ol: '#806a54', ln: '#746050' },
  });
  const GLOSSY = { [SHELL]: 1, [STAR]: 1 };
  const NO_DOTS = [{}].slice(1); // empty, but with the elements kind of Mudkip's dot list
  const C_SHELL = code(SHELL), C_CREAM = code(CREAM), C_EYE = code(EYE), C_INNER = code(INNER), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const C_STAR = code(STAR), C_BLUE = code(BLUE), C_SOCKET = code(SOCKET), C_NAIL = code(NAIL), C_SEG = code(SEG), C_BLUE_LN = code(BLUE, -2);
  const M_SHELL = () => C_SHELL, M_CREAM = () => C_CREAM, M_INNER = () => C_INNER, M_SOCKET = () => C_SOCKET;

  // ---- vector helpers
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const mz = (a, side) => [a[0], a[1], a[2] * side]; // mirror to the far side
  const inF = (f, p) => add(f.t, M3.v(f.L, p)); // local point → parent space
  const tri = (x) => { const q = x - Math.floor(x); return 1 - Math.abs(2 * q - 1); }; // triangle wave 0..1..0, period 1

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
  // flat triangle plate (frame-local vertices)
  function triPlate(A, B, C, code_) {
    const u = nrm(sub(B, A)), n = nrm(cross(sub(B, A), sub(C, A))), v = cross(n, u);
    const b = [len3(sub(B, A)), 0], c = [dot(sub(C, A), u), dot(sub(C, A), v)];
    const bb = [Math.min(0, c[0]) - 0.6, Math.min(0, c[1]) - 0.6, Math.max(b[0], c[0]) + 0.6, Math.max(0, c[1]) + 0.6];
    // grown a hair so neighbouring facets close without cracks
    const g = 0.35, cx = (b[0] + c[0]) / 3, cy = c[1] / 3;
    const G = (p) => { const d = [p[0] - cx, p[1] - cy], l = Math.hypot(d[0], d[1]) || 1; return [p[0] + (d[0] / l) * g, p[1] + (d[1] / l) * g]; };
    const a2 = G([0, 0]), b2 = G(b), c2 = G(c);
    const shape = bakeShape({ bb, test: (x, y) => (Shape2D.inTri(x, y, a2, b2, c2) ? code_ : 0) });
    return { A, axes: M3.cols(u, v, n), shape };
  }
  // faceted cone (flat triangular plates): teeth, studs and nails
  function cone(base, apex, r, n, rot, code_) {
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
    const out = [];
    for (let k = 0; k < n; k++) out.push(triPlate(V[k], V[(k + 1) % n], apex, code_));
    return out;
  }
  const pushTris = (prims, f, tris, part, grp) => { for (const t of tris) prims.push(PL(inF(f, t.A), M3.mul(f.L, t.axes), part, grp, t.shape, 1.1)); };

  /* ---------- body (body frame: origin on the ground, before squash / roll) ----------
     torso + neck + a long head leaning forward; the cream mask and belly are "proud" copies of
     them (a touch larger) painted only inside their regions, so they sit on the red shell like
     armour plates with clean contour lines at every size. */
  const TORSO_C = [-4, 72, 0], TORSO_R = [35, 36, 37];
  const POT_C = [-3, 52, 0], POT_R = [37, 21, 40.5]; // pot belly: the body is widest low down
  const NECK_C = [6, 98, 0], NECK_R = [30, 23, 32]; 
  const HEAD_C = [12, 121, 0], HEAD_R = [25.5, 37, 28.5], HEAD_LEAN = -0.3;
  const HEAD_M = M3.rz(HEAD_LEAN);
  const PROUD = [1.06, 1.012, 1.03];
  // mask (face + chest), front view coordinates (y up, z across)
  const maskW = (y) => 31.5 - 0.0045 * (y - 96) * (y - 96);
  const maskTop = (z) => Math.min(128, 116 + 1.15 * Math.abs(z)) - Math.max(0, Math.abs(z) - 24) * 0.8; // red nose-V dips into the top
  const maskBot = (z) => 60 + 17 * Math.abs(((Math.abs(z) / 12.5) % 2) - 1); // zigzag teeth pointing down
  const CHEV_K = 0.68, CHEV = [[92, 102], [79.5, 89.5]]; // blue chevrons: y − K·|z| within these
  const bellyTop = (z) => 57 - 7 * tri(Math.abs(z) / 13 + 0.5); // zigzag, red V's pointing down
  const BELLY_SEG = [44, 36];
  let lineW = 0.5, mouthK = 0;
  function maskAt(x, y, z) {
    const az = Math.abs(z);
    if (y > 57 || x > 0) {
      if (x > 6 && y < maskTop(z) && y > maskBot(z) && az < maskW(y)) {
        // mouth: under the tip of the red nose-V, above the chevrons
        if (mouthK > 0.02) { const dv = (y - 108.5 + 1.6 * mouthK) / (0.9 + 3.4 * mouthK), dz = z / (5.5 + 1.5 * mouthK); if (dv * dv + dz * dz < 1) return dv < -0.25 && mouthK > 0.4 ? C_TONGUE : C_MOUTH; }
        const v = y - CHEV_K * az;
        for (const [a, b] of CHEV) if (v > a && v < b) return v - a < lineW * 1.2 || b - v < lineW * 1.2 ? C_BLUE_LN : C_BLUE;
        return C_CREAM;
      }
      if (y > 57) return 0;
    }
    // belly: the lower body all round, below a zigzag
    if (y < bellyTop(z) - (x < -12 ? 3 : 0)) {
      for (const y0 of BELLY_SEG) if (Math.abs(y - (y0 + 0.012 * z * z)) < lineW) return C_SEG;
      return C_CREAM;
    }
    return 0;
  }
  // mat for an ellipsoid (centre c, rotation m, radii r) that evaluates fn at body coordinates
  function bodyMat(c, m, r, fn) {
    return (s) => {
      const lx = r[0] * s[0], ly = r[1] * s[1], lz = r[2] * s[2];
      return fn(c[0] + m[0] * lx + m[1] * ly + m[2] * lz, c[1] + m[3] * lx + m[4] * ly + m[5] * lz, c[2] + m[6] * lx + m[7] * ly + m[8] * lz);
    };
  }
  const I3 = M3.I();
  const pr = (r) => [r[0] * PROUD[0], r[1] * PROUD[1], r[2] * PROUD[2]];
  const MASK_T = bodyMat(TORSO_C, I3, pr(TORSO_R), maskAt);
  const MASK_P = bodyMat(POT_C, I3, pr(POT_R), maskAt);
  const MASK_N = bodyMat(NECK_C, I3, pr(NECK_R), maskAt);
  const MASK_H = bodyMat(HEAD_C, HEAD_M, pr(HEAD_R), maskAt);

  /* ---------- star crest: a faceted five-pointed star (flat triangles), in the (y, z) plane
     with its bulge along +x; a ridge runs from the raised centre out to every point ---------- */
  const STAR_R = 34, STAR_IN = 14.2, STAR_H = 11;
  const STAR_TRIS = (() => {
    const tips = [], ins = [];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 5, b = a + Math.PI / 5;
      tips.push([0, STAR_R * Math.sin(a), STAR_R * Math.cos(a)]);
      ins.push([0, STAR_IN * Math.sin(b), STAR_IN * Math.cos(b)]);
    }
    const out = [];
    for (const h of [STAR_H, -STAR_H]) {
      const C = [h, 0, 0];
      for (let k = 0; k < 5; k++) {
        const kp = (k + 1) % 5, kn = (k + 4) % 5;
        out.push(triPlate(C, tips[k], ins[k], C_STAR));
        out.push(triPlate(C, ins[kn], tips[k], C_STAR));
      }
    }
    return out;
  })();
  const STAR_C = [29, 156, 0];

  /* ---------- eyes: small, high on the sides of the head, in dark-red sockets ---------- */
  const EYE_AZ = 1.26, EYE_V = 0.46, EYE_R = [6.8, 6.8, 4.4], SOCK_R = [10.5, 11, 3.6];
  const WHITE = 0.62; // white disc radius (fraction of the eyeball) inside the thick black ring
  const eyeMat = (s) => (s[2] > Math.sqrt(1 - WHITE * WHITE) ? C_EYE : C_INNER);
  const lidMat = (s) => (s[1] > 0.25 - 0.5 * s[0] ? C_SHELL : 0);
  const LOOK = nrm([1, -0.05, 0]);

  /* ---------- claws (claw frame: origin at the wrist; x' = toward the tips,
     y' = the upper hook's side, z' = across) ---------- */
  const CS = 1.32; // claw scale
  const PALM_C = [14, 0, 0], PALM_R = [18, 15, 14.5];
  const HINGE = [22, 8, 0];
  // upper hook: a broad dome that sweeps forward and curls down to a point
  const DOME = { c: [42, 11, 0], r: [31, 12.5, 16.5], a: -0.13 }; // one smooth dome from the hinge forward
  const DACT = [[[60, 11, 0], [90, -9.5, 0], 7.2, 8]]; // the hooked point
  const TEETH = [[[48, 3, 0], [50.5, -8.5, 0], 4.6], [[63, 1.5, 0], [65, -8.5, 0], 3.8]];
  const STUDS = [[[33, 7, 13], [35, -3, 22.5], 3.8], [[49, 11, 11], [52, 3, 19], 3]];
  const TEETH_T = TEETH.flatMap(([b, a, r]) => cone(b, a, r, 5, 0.3, C_SHELL));
  const STUDS_T = STUDS.flatMap(([b, a, r]) => [1, -1].flatMap((zz) => cone(mz(b, zz), mz(a, zz), r, 4, 0.2, C_SHELL)));
  const FIXED = [[[14, -7, 0], [74, -13.5, 0], 9.5, 13], [[62, -14, 0], [88, 0, 0], 5.4, 6.6]]; // long tusk, tip curling up
  const FIX_CREAM = 38; // the fixed finger is cream from here on (pale tip)
  const fixedMat = (p0, p1) => (s) => (lerp3(p0, p1, (s[1] + 1) / 2)[0] > FIX_CREAM ? C_CREAM : C_SHELL);
  const CLAW_TIP = [85, -4, 0];
  // arm keyframes (near side, body frame): shoulder, elbow, wrist, claw axis x', hook side y'
  const SHOULDER = [-4, 94, 31];
  const ARM_K = [
    { E: [-2, 72, 47], W: [20, 62, 45], X: [0.84, -0.3, 0.3], Y: [0.3, 1, 0] },
    { E: [-4, 94, 57], W: [18, 104, 56], X: [0.93, 0.2, 0.3], Y: [-0.2, 1, 0] },
  ];

  /* ---------- legs: chunky, with a row of small studs and two white claw tips ---------- */
  const LEGS = [
    { hip: [17, 38, 20], foot: [36, 0, 35], ph: 0 },
    { hip: [-3, 36, 27], foot: [-3, 0, 51], ph: Math.PI },
    { hip: [-22, 38, 21], foot: [-37, 0, 40], ph: 0 },
  ];
  const KNEE_OUT = 10, KNEE_UP = 5;
  // studs and claw tips, baked once in local frames (shin frame: x out, y down the shin; foot frame: x out, y up)
  const LSTUD_T = [8, 17].flatMap((d) => { const b = [9.4 - d * 0.14, d, 0]; return cone(b, add(b, [5.5, -3, 0]), 2.8, 4, 0.4, C_SHELL); });
  const NAIL_T = [-1, 1].flatMap((k) => cone([2, 3.6, k * 3.4], [8, 0, k * 4.4], 2.8, 4, 0.2, C_NAIL));

  /* ---------- tail: overlapping segments trailing back and down, then a pointed fan ---------- */
  const TAIL = [
    { c: [-31, 46, 0], r: [10, 9, 16], a: -0.25 },
    { c: [-40, 41.5, 0], r: [8.5, 7.6, 14], a: -0.45 },
    { c: [-48, 36, 0], r: [7.5, 6.6, 12.5], a: -0.7 },
  ];
  const FAN_P = [[0, -8], [10, -14], [21, -20], [18, -11], [27, -8], [33, 0], [27, 8], [18, 11], [21, 20], [10, 14], [0, 8]];
  const FAN_POLY = Shape2D.poly(FAN_P, C_SHELL, 4);
  const FAN_PIN = FAN_P.map(([u, v]) => [u * 0.8 + 1, v * 0.78]);
  const FAN_IN = Shape2D.catmull(FAN_PIN, true, 4);
  // gold rim round the fan (as in the art), cupped halves so it reads as 3D
  const FAN_G = bakeShape({ bb: FAN_POLY.bb, test: (u, v) => (v < -0.4 || !FAN_POLY.test(u, v) ? 0 : u > 6 && !Shape2D.inPoly(u, v, FAN_IN) ? C_STAR : C_SHELL) });
  const FAN_CUP = 0.4;
  const FAN_LINES = [[[3, 4], [13, 9.5], [18, 15]], [[5, 1.6], [16, 5], [24, 6]]];

  // contour-line priorities per group (integer-keyed object like Mudkip's)
  const PRI = {};
  for (let i = 1; i < 72; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 0, 2: 3, 8: 4, 10: 6, 11: 6, 12: 5, 13: 5, 14: 7, 15: 7, 60: 1, 61: 0, 62: -1, 63: -2 });
  for (const b of [20, 30]) { PRI[b] = 2; PRI[b + 1] = 3; PRI[b + 2] = 3; PRI[b + 3] = 5; PRI[b + 4] = 4; PRI[b + 5] = 1; PRI[b + 6] = 6; }
  for (let i = 40; i < 52; i++) PRI[i] = 1;

  const SIZE = 1;
  const DEFAULT = { claw: 0, walk: 0, eyes: 'open', squash: 0, tilt: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const sq = clamp(+P.squash || 0, -0.3, 0.8);
    const root = F(M3.diag(1 + sq * 0.25, 1 - sq, 1 + sq * 0.25), [0, 0, 0]);
    // body roll about the forward axis (sideways shuffle); legs are IK so the feet stay planted
    const body = chain(root, T(0, 60, 0), R(M3.rx(-(+P.tilt || 0))), T(0, -60, 0));
    const head = chain(body, T(...HEAD_C), R(HEAD_M));
    const side = clamp(+P.side || 0, -1, 1);
    mouthK = clamp(+P.mouth || 0, 0, 1);

    /* --- eyes first (front-most): ringed eyeballs in dark sockets; pupils are stamps --- */
    const ek = P.eyes === 'sleep' || P.eyes === 'blink' ? 'closed' : P.eyes;
    const closed = ek === 'happy' || ek === 'closed';
    for (const sd of [1, -1]) {
      const s0 = Creature.sph(sd * EYE_AZ, EYE_V);
      const pS = [HEAD_R[0] * s0[0], HEAD_R[1] * s0[1], HEAD_R[2] * s0[2]];
      const n = nrm([s0[0] / HEAD_R[0], s0[1] / HEAD_R[1], s0[2] / HEAD_R[2]]);
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = sc(cross(ye, n), sd);
      const ax = M3.cols(xe, ye, n);
      const id = sd > 0 ? 10 : 11;
      const sock = chain(head, F(ax, add(pS, sc(n, -1.2))));
      prims.push(ellF(sock, SOCK_R, id + 2, id + 2, M_SOCKET));
      const eyeF = chain(head, F(ax, add(pS, sc(n, 1.6))));
      const eyePrim = ellF(eyeF, EYE_R, id, id, closed ? M_SHELL : eyeMat);
      prims.push(eyePrim);
      if (ek === 'angry') prims.push(ellF(eyeF, [EYE_R[0] * 1.2, EYE_R[1] * 1.2, EYE_R[2] * 1.25], id + 4, id + 4, lidMat));
      let sP;
      if (closed) sP = [0, 0, 1];
      else if (ek === 'dizzy') sP = [0, 0, 1];
      else {
        const Lh = M3.v([HEAD_M[0], HEAD_M[3], HEAD_M[6], HEAD_M[1], HEAD_M[4], HEAD_M[7], HEAD_M[2], HEAD_M[5], HEAD_M[8]], LOOK); // look dir in head space
        const dl = M3.v([ax[0], ax[3], ax[6], ax[1], ax[4], ax[7], ax[2], ax[5], ax[8]], Lh);
        sP = [EYE_R[0] * dl[0] * 0.5, EYE_R[1] * dl[1] * 0.5 - (ek === 'angry' ? 0.2 : 0), Math.max(0.6, EYE_R[2] * dl[2])];
      }
      sP = nrm(sP);
      const at = { prim: eyePrim, p: add(eyePrim.c, M3.v(eyePrim.L, sP)), s: sP };
      stamps.push({ at, set: EYE_SETS.M[ek] || EYE_SETS.M.open, colors: EYEC, kind: 'open' });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- star crest (turned a little toward the camera) --- */
    const starF = chain(body, T(...STAR_C), R(M3.ry(-0.5 * side)), R(M3.rz(0.2)), R(M3.rx(-0.16)));
    pushTris(prims, starF, STAR_TRIS, 8, 8);

    /* --- mask / belly plates, then the red shell --- */
    prims.push(ellF(chain(body, T(...TORSO_C)), pr(TORSO_R), 2, 2, MASK_T));
    prims.push(ellF(chain(body, T(...POT_C)), pr(POT_R), 2, 2, MASK_P));
    prims.push(ellF(chain(body, T(...NECK_C)), pr(NECK_R), 2, 2, MASK_N));
    prims.push(ellF(head, pr(HEAD_R), 2, 2, MASK_H));
    const headPrim = ellF(head, HEAD_R, 1, 1, M_SHELL);
    prims.push(headPrim);
    prims.push(ellF(chain(body, T(...NECK_C)), NECK_R, 1, 1, M_SHELL));
    prims.push(ellF(chain(body, T(...TORSO_C)), TORSO_R, 1, 1, M_SHELL));
    prims.push(ellF(chain(body, T(...POT_C)), POT_R, 1, 1, M_SHELL));

    /* --- claws --- */
    const cl = clamp(+P.claw || 0, 0, 1);
    const raise = cl * cl * (3 - 2 * cl), open = 0.2 + 0.8 * clamp(cl * 1.4, 0, 1); // the jaws always gape a little
    const W0 = F(M3.I(), [0, 0, 0]);
    for (const sd of [1, -1]) {
      const k0 = ARM_K[0], k1 = ARM_K[1];
      const X = mz(nrm(lerp3(k0.X, k1.X, raise)), sd);
      let Y = mz(nrm(lerp3(k0.Y, k1.Y, raise)), sd);
      Y = nrm(sub(Y, sc(X, dot(Y, X))));
      const Zc = sc(nrm(cross(X, Y)), sd); // toward the outer side
      const Wr = mz(lerp3(k0.W, k1.W, raise), sd), El = mz(lerp3(k0.E, k1.E, raise), sd), Sh = mz(SHOULDER, sd);
      const CF = chain(body, F(M3.cols(X, Y, Zc), Wr), Creature.S(CS, CS, CS));
      const base = sd > 0 ? 20 : 30;
      // palm
      prims.push(ellF(chain(CF, T(...PALM_C)), PALM_R, base + 2, base + 2, M_SHELL));
      // throat (black), seen between the jaws when they open
      prims.push(ellF(chain(CF, T(36, -1.5, 0)), [18, 8.5, 11], base + 5, base + 5, M_INNER));
      // fixed finger (lower jaw): red at the root, a long cream tusk
      for (const [p0, p1, rx, rz] of FIXED) prims.push(seg(CF, p0, p1, rx, rz, base + 4, base + 4, fixedMat(p0, p1), [0, 1, 0]));
      // upper hook, hinged at the top of the palm: teeth underneath, spiky studs on the sides
      const DF = chain(CF, T(...HINGE), R(M3.rz(open * 0.72)), T(-HINGE[0], -HINGE[1], -HINGE[2]));
      prims.push(ellF(chain(DF, T(...DOME.c), R(M3.rz(DOME.a))), DOME.r, base + 3, base + 3, M_SHELL));
      for (const [p0, p1, rx, rz] of DACT) prims.push(seg(DF, p0, p1, rx, rz, base + 3, base + 3, M_SHELL, [0, 1, 0]));
      pushTris(prims, DF, TEETH_T, base + 3, base + 3);
      pushTris(prims, DF, STUDS_T, base + 3, base + 3);
      // wrist knob, forearm, elbow knob, upper arm
      prims.push(ellF(chain(CF, T(-1, 0, 0)), [7, 7, 7], base + 1, base + 1, M_SHELL));
      prims.push(seg(body, El, add(Wr, sc(X, -3 * CS)), 5.2, 5.2, base + 1, base + 1, M_SHELL));
      prims.push(ellF(chain(body, T(...El)), [6, 6, 6], base + 6, base + 6, M_CREAM));
      prims.push(seg(body, Sh, El, 5.6, 5.6, base, base, M_SHELL));
      anchors[sd > 0 ? 'clawTipN' : 'clawTipF'] = sc(add(inF(CF, CLAW_TIP), inF(DF, CLAW_TIP)), 0.5);
    }

    /* --- legs: hips and knees ride on the body, feet stay planted (tripod scuttle) --- */
    const walk = +P.walk || 0;
    let li = 0;
    for (const sd of [1, -1])
      for (const lg of LEGS) {
        const ph = walk + lg.ph + (sd > 0 ? 0 : Math.PI);
        const lift = walk ? Math.max(0, Math.sin(ph)) * 7 : 0;
        const swing = walk ? Math.cos(ph) * 6 : 0;
        const hipB = mz(lg.hip, sd);
        const outB = nrm([lg.foot[0] - lg.hip[0], 0, (lg.foot[2] - lg.hip[2]) * sd]);
        const hip = inF(body, hipB);
        const knee = inF(body, add(hipB, add(sc(outB, KNEE_OUT), [0, KNEE_UP + lift * 0.4, 0])));
        const foot = [lg.foot[0] + swing * 0.35, lift, lg.foot[2] * sd * (1 + sq * 0.3) + swing];
        const out = nrm([foot[0] - knee[0], 0, foot[2] - knee[2]]);
        const id = 40 + li++;
        const kd = sub(foot, knee);
        const ank = add(knee, sc(kd, 0.78));
        prims.push(seg(W0, hip, knee, 9.5, 9.5, id, id, M_SHELL, out));
        prims.push(seg(W0, sub(knee, sc(kd, 0.2)), ank, 11, 10, id, id, M_SHELL, out));
        prims.push(seg(W0, add(knee, sc(kd, 0.45)), add(foot, [0, 3, 0]), 7.8, 7, id, id, M_SHELL, out));
        // studs up the outer side of the shin (shin frame: x out, y down the shin), two white claw tips
        const Yd = nrm(kd), Xo = nrm(sub(out, sc(Yd, dot(out, Yd))));
        pushTris(prims, F(M3.cols(Xo, Yd, cross(Xo, Yd)), knee), LSTUD_T, id, id);
        const up = [0, 1, 0];
        pushTris(prims, F(M3.cols(out, up, cross(out, up)), foot), NAIL_T, 46 + (li % 6), id);
      }

    /* --- tail --- */
    TAIL.forEach((t, i) => prims.push(ellF(chain(body, T(...t.c), R(M3.rz(t.a))), t.r, 60 + i, 60 + i, M_SHELL)));
    const fan = chain(body, T(-54, 30, 0), R(M3.rz(-0.9)));
    for (const zs of [1, -1]) {
      const V = [0, -Math.sin(FAN_CUP), Math.cos(FAN_CUP) * zs], U = [-1, 0, 0];
      const lines = FAN_LINES.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: SHELL, useLn: true }));
      prims.push(Object.assign(PL(fan.t, M3.mul(fan.L, M3.cols(U, V, cross(U, V))), 63, 63, FAN_G, 1.6), { lines }));
    }

    anchors.top = inF(starF, [0, STAR_R, 0]); // star tip
    anchors.body = inF(body, [6, 70, 0]);
    anchors.head = inF(head, [0, 4, 0]);
    anchors.mouth = inF(body, [37, 107, 0]);

    for (const p of prims) { p.c = sc(p.c, SIZE); p.L = p.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const key in anchors) anchors[key] = sc(anchors[key], SIZE);
    return { prims, anchors, pose: P, headPrim, stamps, dots: NO_DOTS, pri: PRI, glossy: GLOSSY, baseMat: SHELL, shadowSteps: 14 };
  }

  /* ---------- eye stamps (pupils and closed-eye marks), one set per render size ----------
     Every set uses Mudkip's exact key layout (the renderer looks glyphs up by name);
     each expression puts its glyphs in the open/openN/openF slots and is drawn as kind 'open'.
     k = pupil, b = dark lid line, w = white. */
  const stampSet = (o, oN, oF) => ({ open: o, openN: oN, openF: oF, happy: o, happyN: oN, happyF: oF, blink: o, blinkN: oN, blinkF: oF, sleep: o, sleepN: oN, sleepF: oF });
  const EYE_SETS = {
    S: {
      open: stampSet(['k'], ['k'], ['k']),
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
      open: stampSet(['.kk.', 'kkkk', 'kkkk', '.kk.'], ['.kk', 'kkk', 'kkk', '.kk'], ['kk', 'kk', 'kk']),
      angry: stampSet(['kkkk', 'kkkk', 'kkkk', '.kk.'], ['kkk', 'kkk', 'kkk', '.k.'], ['kk', 'kk', 'kk']),
      dizzy: stampSet(['..kkkk..', '.k....k.', 'k..kk..k', 'k.k..k.k', 'k.k.kk.k', 'k..k...k', '.k....k.', '..kkk...'], ['.kkkk.', 'k....k', 'k.kk.k', 'k.k..k', 'k..kkk', '.k....'], ['.kk', 'k.k', 'kkk']),
      happy: stampSet(['...bbbb...', '..bb..bb..', '.bb....bb.', 'bb......bb', 'b........b'], ['..bbb..', '.bb.bb.', 'bb...bb', 'b.....b'], ['.bb', 'bb.', 'b..']),
      closed: stampSet(['..........', '..........', 'bbbbbbbbbb', '.bbbbbbbb.', '...bbbb...'], ['.......', '.......', 'bbbbbbb', '.bbbbb.'], ['...', '...', 'bbb', '.bb']),
    },
  };
  const EYEC = { k: '#140c0e', w: '#ffffff', b: '#1e0a0c' };

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    const sets = EYE_SETS[s >= 1.7 ? 'XL' : s >= 1.1 ? 'L' : s >= 0.55 ? 'M' : 'S'];
    lineW = Math.max(0.3, 0.52 / s);
    const P = model.pose || {};
    mouthK = clamp(+P.mouth || 0, 0, 1);
    const ek = P.eyes === 'sleep' || P.eyes === 'blink' ? 'closed' : P.eyes;
    for (const st of model.stamps) st.set = sets[ek] || sets.open;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 340, bh: 280, oy: 0.9 } };
})();
