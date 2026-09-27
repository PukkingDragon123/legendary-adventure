/* ------------------------------------------------------------------
   Nincada — the Trainee Pokémon (0.5 m ≈ 87 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME / battle model): a small, low, pale bug.
   A rounded white armoured head with a notched helmet edge across its
   brow and big black eyes ringed with pale green; two long white tusk-
   like feelers hang from the front of the face. Two stubby forelegs end
   in large flat grey-brown digging claws. Behind the head, a plump
   segmented abdomen; two small pale-green wing buds with veins on the
   back; four thin white jointed legs splayed out to the ground.

   Pose parameters (all optional):
     step     radians  walk-cycle phase (legs alternate, claws paddle, bob);
                       0 = standing
     dig      0..1     forelegs dig: claws reach forward and scoop down and
                       back under the head (animate 0 → 1 → 0 to dig)
     feelers  −1..1    feeler swing (+ = forward/up, − = back under the face)
     eyes     'open' | 'happy' | 'closed' | 'blink'
     side     −1..1    ≈ cos(yaw), passed by the game (unused, accepted)

   Anchors: top (wing tips / back top), head (head centre), mouth (front
   of the face between the feelers), eyeN, eyeF, body (abdomen centre),
   clawN / clawF (claw centres), feelerN / feelerF (feeler tips),
   wingN / wingF (wing tips).
------------------------------------------------------------------- */
const Nincada = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SHELL = 1, HEAD = 2, CLAW = 3, WING = 4, EYE = 5, IRIS = 6, LEG = 7;
  const MAT = { SHELL, HEAD, CLAW, WING, EYE, IRIS, LEG };
  const PAL = Creature.palette({
    [SHELL]: { r: ['#8e9084', '#b4b6aa', '#dcdcd0', '#f2f2e8', '#ffffff'], od: '#44463e', ol: '#7a7c70', ln: '#8a8c80' },
    [HEAD]:  { r: ['#9498a0', '#babec6', '#e0e3e8', '#f4f6f8', '#ffffff'], od: '#40444c', ol: '#747a84', ln: '#7c828c' },
    [LEG]:   { r: ['#8e9084', '#b4b6aa', '#dcdcd0', '#f2f2e8', '#ffffff'], od: '#44463e', ol: '#7a7c70', ln: '#8a8c80' },
    [CLAW]:  { r: ['#5c524a', '#7a7068', '#9c928a', '#bab2aa', '#dcd6d0'], od: '#2e2620', ol: '#524840', ln: '#524840' },
    [WING]:  { r: ['#92ac72', '#b0ca8e', '#cfe4ae', '#e4f2ca', '#f6fde8'], od: '#4a5e32', ol: '#7a9658', ln: '#86a266' },
    [EYE]:   { r: ['#060708', '#0c0d10', '#141619', '#202328', '#40444a'], od: '#060708', ol: '#060708', ln: '#060708' },
    [IRIS]:  { r: ['#6e9a3a', '#8ab84e', '#a8d468', '#c4e68c', '#e2f6bc'], od: '#2e4a14', ol: '#4e7026', ln: '#4e7026' },
  });
  const GLOSSY = { [HEAD]: 1, [SHELL]: 1, [CLAW]: 1, [EYE]: 1 };
  const C_SHELL = code(SHELL), C_HEAD = code(HEAD), C_CLAW = code(CLAW), C_WING = code(WING), C_WING_D = code(WING, -1);
  const C_EYE = code(EYE), C_IRIS = code(IRIS), C_LEG = code(LEG);
  const M_SHELL = () => C_SHELL, M_HEAD = () => C_HEAD, M_CLAW = () => C_CLAW, M_LEG = () => C_LEG;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, up = [0, 0, 1]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, up);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  /* ---------- head with eyes (decals) ---------- */
  const HD_R = [25, 22, 23];
  const EYE_AZ = 0.98, EYE_V = 0.08, EYE_RU = 0.24, EYE_RV = 0.36;
  const EC = [1, -1].map((sd) => Creature.sph(sd * EYE_AZ, EYE_V));
  let curScale = 1;
  function headMat(kind) {
    return (s) => {
      if (s[0] < 0.1) return C_HEAD;
      const q = s[2] > 0 ? EC[0] : EC[1];
      // local eye frame: u = horizontal along the surface, v = up
      const tz = [-q[2], 0, q[0]]; const tl = Math.hypot(tz[0], tz[2]);
      const u = ((s[0] - q[0]) * tz[0] + (s[2] - q[2]) * tz[2]) / tl, v = s[1] - q[1];
      const px = 1 / (curScale * HD_R[1]);
      const ru = Math.max(EYE_RU, 1.6 * px), rv = Math.max(EYE_RV, 2.2 * px);
      if (kind === 'open') {
        const a = u / ru, b = v / rv, r = a * a + b * b;
        if (r >= 1) return C_HEAD;
        // black oval, pale-green ring, black centre (ring only when there is room for it)
        if (curScale * HD_R[1] * EYE_RV >= 4.5) { const rr = Math.sqrt(r); if (rr > 0.42 && rr < 0.7) return C_IRIS; }
        else if (curScale * HD_R[1] * EYE_RV >= 2.8 && a * a + (b - 0.1) * (b - 0.1) < 0.12) return C_IRIS;
        return C_EYE;
      }
      const w = Math.max(0.05, 0.8 * px), a = u / (ru * 1.1);
      if (Math.abs(a) > 1) return C_HEAD;
      let yc;
      if (kind === 'happy') yc = rv * 0.45 * (1 - 1.6 * a * a);
      else if (kind === 'blink') yc = -rv * 0.25;
      else yc = -rv * 0.15 * (1 - a * a); // closed: gentle downward curve
      return Math.abs(v - yc) < w ? C_EYE : C_HEAD;
    };
  }
  // notched helmet edge across the brow (unit-sphere points on the head)
  const BROW = [[0.3, 0.62, 0.72], [0.62, 0.42, 0.52], [0.8, 0.5, 0.3], [0.78, 0.3, 0.14], [0.86, 0.46, 0], [0.78, 0.3, -0.14], [0.8, 0.5, -0.3], [0.62, 0.42, -0.52], [0.3, 0.62, -0.72]].map((p) => nrm(p));

  /* ---------- wings: small leaf-shaped buds with two veins (u along, v across) ---------- */
  const WING_L = 30;
  const WING_G = (() => {
    const P = Shape2D.catmull([[0, -3], [9, -6.5], [20, -6.8], [29, -3.5], [31, 0.5], [26, 4.8], [14, 6.2], [4, 4.5], [0, 2.5]], true, 8);
    const V1 = [[3, 0], [15, 1.2], [29, 0.5]], V2 = [[6, -1.5], [16, -3.2], [25, -3.4]];
    const bb = Shape2D.bbox(P, 0.5);
    return bakeShape({ bb, test: (u, v) => (!Shape2D.inPoly(u, v, P) ? 0 : Shape2D.polyDist(u, v, V1) < 0.55 || Shape2D.polyDist(u, v, V2) < 0.5 ? C_WING_D : C_WING) });
  })();

  // segment rings across the abdomen (constant unit-sphere x, over the top and sides)
  const SEG_LINES = [0.3, -0.12, -0.5].map((x0) => {
    const r = Math.sqrt(1 - x0 * x0), pts = [];
    for (let k = 0; k <= 12; k++) { const a = -1.45 + (k / 12) * 2.9; pts.push([x0, r * Math.cos(a), r * Math.sin(a)]); }
    return { pts, mat: SHELL, useLn: true };
  });

  /* ---------- legs ---------- */
  const LEGS = [
    { hip: [4, 26, 16], knee: [6, 32, 32], foot: [12, 0, 40], ph: 0 },
    { hip: [-16, 27, 18], knee: [-36, 34, 34], foot: [-66, 0, 38], ph: Math.PI },
  ];

  const DEFAULT = { step: 0, dig: 0, feelers: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 head, 2 face, 3..5 abdomen segments, 6/7 wings, 10..15 forelegs+claws, 16/17 feelers, 20..23 legs
  Object.assign(PRI, { 1: 3, 2: 2, 3: 1, 4: 0, 5: -1, 6: 2, 7: 2, 16: 4, 17: 4 });
  for (let i = 10; i < 16; i++) PRI[i] = 3;
  const SIZE = 0.93;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = P.step || 0, dig = clamp(P.dig, 0, 1), fl = clamp(P.feelers, -1, 1);
    const bob = 1.2 * Math.abs(Math.sin(st));
    const body = chain(T(0, bob, 0), T(0, 30, 0), R(M3.rz(-0.06 - 0.1 * dig)), T(0, -30, 0));

    // --- head (armoured dome) + face block
    const hf = chain(body, T(24, 40, 0), R(M3.rz(-0.1)));
    const headPrim = ellF(hf, HD_R, 1, 1, headMat(P.eyes));
    headPrim.lines = [{ pts: BROW, mat: HEAD, useLn: true }];
    prims.push(headPrim);
    prims.push(ellF(chain(hf, T(12, -9, 0)), [14, 12, 15], 2, 2, M_HEAD));
    anchors.head = inF(hf, [0, 0, 0]);
    anchors.mouth = inF(hf, [24, -13, 0]);
    for (const [k, q] of [['eyeN', EC[0]], ['eyeF', EC[1]]]) anchors[k] = inF(hf, [HD_R[0] * q[0], HD_R[1] * q[1], HD_R[2] * q[2]]);

    // --- abdomen: a plump capsule with curved segment lines, and a tapered tail end
    const abd = ellF(chain(body, T(-16, 40, 0), R(M3.rz(0.06))), [32, 23, 25], 3, 3, M_SHELL);
    abd.lines = SEG_LINES;
    prims.push(abd);
    prims.push(ellF(chain(body, T(-40, 37, 0), R(M3.rz(0.25))), [13, 15, 17], 4, 4, M_SHELL));
    anchors.body = inF(body, [-16, 40, 0]);

    // --- wing buds on the back, pointing up and back, splayed a little
    let top = anchors.head[1] + HD_R[1];
    for (const side of [1, -1]) {
      const root = inF(body, [-4, 58, 12 * side]);
      const U = nrm(M3.v(body.L, [-0.88, 0.38, 0.3 * side]));
      const Vt = nrm(cross(U, [0, 0, side]));
      const Vv = nrm(add(Vt, [0, 0, 0.5 * side]));
      const V = nrm(sub(Vv, sc(U, V3.dot(Vv, U))));
      const id = side > 0 ? 6 : 7;
      prims.push(PL(root, M3.cols(U, V, cross(U, V)), id, id, WING_G, 1.4));
      const tip = add(root, sc(U, WING_L));
      anchors[side > 0 ? 'wingN' : 'wingF'] = tip;
      top = Math.max(top, tip[1]);
    }
    anchors.top = [anchors.body[0], top, 0];

    // --- forelegs with big flat digging claws
    for (const side of [1, -1]) {
      const ph = st + (side > 0 ? 0 : Math.PI);
      const pad = st ? Math.sin(ph) * 4 : 0;
      const b = side > 0 ? 10 : 13;
      const sh = inF(body, [26, 24, 13 * side]);
      // rest → dig (reach forward and scoop down/back under the head)
      const el = lerp3([40, 30, 25 * side], [50, 22, 22 * side], dig);
      const cc = lerp3([52, 17, 27 * side], [36, 10, 20 * side], dig);
      const cDir = nrm(lerp3([0.35, -1, 0.05 * side], [-0.7, -0.6, 0], dig));
      const elbow = add(el, [pad * 0.5, Math.max(0, pad) * 0.6, 0]);
      const claw = add(cc, [pad, Math.max(0, pad), 0]);
      prims.push(seg(sh, elbow, 5, 5, b, b, M_SHELL));
      prims.push(seg(elbow, add(claw, sc(cDir, -9)), 4.4, 4.4, b + 1, b + 1, M_SHELL));
      // claw: flat oval scoop (long along cDir, thin across z)
      prims.push(seg(add(claw, sc(cDir, -15)), add(claw, sc(cDir, 17)), 9.5, 5, b + 2, b + 2, M_CLAW, [0, 0, 1]));
      anchors[side > 0 ? 'clawN' : 'clawF'] = claw;
    }

    // --- feelers: two long white tusks hanging from the front of the face
    for (const side of [1, -1]) {
      const root = inF(hf, [22, -13, 7 * side]);
      const a = -1.25 + 0.6 * fl; // angle below forward (radians)
      const dir = nrm(M3.v(hf.L, [Math.cos(a), Math.sin(a), 0.1 * side]));
      const tip = add(root, sc(dir, 30));
      const id = side > 0 ? 16 : 17;
      prims.push(seg(add(root, sc(dir, -2)), add(root, sc(dir, 17)), 3.4, 3.4, id, id, M_HEAD));
      prims.push(seg(add(root, sc(dir, 12)), tip, 2.6, 2.6, id, id, M_HEAD));
      anchors[side > 0 ? 'feelerN' : 'feelerF'] = tip;
    }

    // --- four thin jointed legs (alternating pairs)
    let li = 0;
    for (const side of [1, -1])
      for (const lg of LEGS) {
        const ph = st + lg.ph + (side > 0 ? 0 : Math.PI);
        const lift = st ? Math.max(0, Math.sin(ph)) * 5 : 0;
        const swing = st ? Math.cos(ph) * 5 : 0;
        const k = (p) => [p[0], p[1], p[2] * side];
        const hip = inF(body, k(lg.hip));
        const knee = add(inF(body, k(lg.knee)), [swing * 0.5, lift, 0]);
        const foot = add(k(lg.foot), [swing, lift * 0.6, 0]);
        const id = 20 + li++;
        prims.push(seg(hip, knee, 3.6, 3.6, id, id, M_LEG));
        prims.push(seg(sub(knee, sc(nrm(sub(foot, knee)), 1.5)), foot, 2.9, 2.9, id, id, M_LEG));
      }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const kk in anchors) anchors[kk] = sc(anchors[kk], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: SHELL, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 190, bh: 136, oy: 0.8 } };
})();
