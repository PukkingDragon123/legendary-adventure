/* ------------------------------------------------------------------
   Numel — the Numb Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a chubby little camel. A plump mustard-yellow
   barrel body on four short stubby legs, a big sage-green hump on the
   back, a short thick neck carrying a large head with a long, rounded,
   slightly drooping cream muzzle, sleepy half-closed eyes, small round
   ears sticking out sideways, a tiny tail.

   Pose params:
     walk   radians  plodding walk-cycle phase (diagonal leg pairs swing,
                     head nods); exactly 0 = standing
     hump   0..1     the hump swells and its top glows ember orange
     mouth  0..1     the muzzle opens (dark mouth, pink tongue)
     eyes   'open' (default, sleepy) | 'happy' | 'blink' | 'closed'
     side   −1..1    camera side from the game (unused; symmetric model)
   Anchors: top (hump top), hump, head, mouth, eyeN, eyeF, body, tail,
            footN, footF.
------------------------------------------------------------------- */
const Numel = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, MUZ = 2, HUMP = 3, MOUTH = 4, TONGUE = 5, EAR = 6, GLOW = 7, RING = 8, EYEW = 9, PUPIL = 10, NOSE = 11;
  const MAT = { BODY, MUZ, HUMP, MOUTH, TONGUE, EAR, GLOW, RING, EYEW, PUPIL, NOSE };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#c4a45c', '#e4c276', '#fbdd8e', '#fde8b0', '#fff4d6'], od: '#664a16', ol: '#9c7836', ln: '#a88440' },
    [MUZ]:    { r: ['#c8b88e', '#e4d6ae', '#f7ebc8', '#fcf4de', '#fffbf0'], od: '#62502a', ol: '#94805a', ln: '#a08c66' },
    [HUMP]:   { r: ['#6aa486', '#88bea0', '#aad7bc', '#c4e6d2', '#e0f4e8'], od: '#2a5640', ol: '#4a7e64', ln: '#4a7e64' },
    [MOUTH]:  { r: ['#4a1a1a', '#662424', '#843434', '#a04646', '#bc5e5a'], od: '#2c0a0a', ol: '#4a1414', ln: '#3a1010' },
    [TONGUE]: { r: ['#b84a56', '#d6646e', '#ee8690', '#ffaab0', '#ffd0d0'], od: '#6a1a26', ol: '#8e2a38', ln: '#8e2a38' },
    [EAR]:    { r: ['#b48a4c', '#d4a866', '#eec486', '#f8daa8', '#fff0d4'], od: '#5e4014', ol: '#94703a', ln: '#9a7640' },
    [GLOW]:   { r: ['#d8501a', '#f07024', '#ff9a34', '#ffc460', '#fff0a8'], od: '#7a2408', ol: '#b8400e', ln: '#c04810' },
    [RING]:   { r: ['#5e5248', '#7a6c60', '#97897d', '#ada094', '#c4b8ae'], od: '#302820', ol: '#4e4238', ln: '#4e4238' },
    [EYEW]:   { r: ['#c8ccd4', '#e2e6ec', '#fbfcfe', '#ffffff', '#ffffff'], od: '#5a5e66', ol: '#8a8e96', ln: '#8a8e96' },
    [PUPIL]:  { r: ['#06060a', '#0c0c10', '#141418', '#202026', '#303036'], od: '#040406', ol: '#08080a', ln: '#08080a' },
    [NOSE]:   { r: ['#9a5a6a', '#b87282', '#d08c9a', '#e2aab4', '#f2ccd2'], od: '#4e2230', ol: '#7a3e4c', ln: '#7a3e4c' },
  });
  const GLOSSY = { [HUMP]: 1 };
  const C_BODY = code(BODY), C_MUZ = code(MUZ), C_HUMP = code(HUMP), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const C_SPOT = code(HUMP, -1);
  const C_EAR = code(EAR), C_GLOW = code(GLOW), C_GLOW_H = code(GLOW, 1);
  const M_BODY = () => C_BODY, M_EAR = () => C_EAR;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.cols(sc(X, rx), sc(Y, l / 2), sc(Z, rz)), part, grp, mat);
  }

  // ---- geometry (body frame; origin on the ground under the belly)
  const BODY_C = [-8, 44, 0], BODY_R = [40, 30, 28];
  const HUMP_C = [-12, 49, 0], HUMP_R = [35, 28, 29.5];
  const HEAD_C = [36, 88, 0], HEAD_R = [25, 25, 23];
  const MUZ_C = [16, -3, 0], MUZ_R = [20, 20, 20]; // in the head frame
  const LEGS = [{ x: 18, z: 15, ph: 0 }, { x: -26, z: 15, ph: Math.PI }];
  const PRI = { 1: 0, 2: 1, 3: 3, 4: 4, 5: 1, 6: 1, 7: 1, 8: 1, 9: 0 };
  const SIZE = 1.08;
  const DEFAULT = { walk: 0, hump: 0, mouth: 0, eyes: 'open', side: 1 };

  let curScale = 1;
  const C_RING = code(RING), C_EYEW = code(EYEW), C_PUPIL = code(PUPIL), C_LID = code(BODY), C_INK = code(PUPIL), C_NOSE = code(NOSE);
  const C_GLINT = code(EYEW, 1);
  // big eyes on the sides of the head: a thick grey-brown ring round a white eye with a black pupil at its
  // front, a heavy sleepy upper lid (a skin-coloured cap and a black lid line) drooping over it
  const EYE_AZ = 1.16, EYE_V = 0.24, ER_U = 0.3, ER_V = 0.48;
  function eyePix(u, v, kind, px) {
    const a = u / ER_U, b = v / ER_V, r = Math.hypot(a, b);
    if (r > 1) return 0;
    const ring = Math.max(0.3, 1.5 * px / ER_U);
    if (r > 1 - ring) return C_RING;
    const lw = Math.max(0.1, 0.9 * px / ER_V);
    if (kind !== 'open') {
      const yc = kind === 'happy' ? -0.2 + 0.45 * (1 - a * a / 0.5) : kind === 'closed' ? 0.1 - 0.35 * (1 - a * a / 0.5) : -0.05;
      if (Math.abs(b - yc) < lw * 1.3) return C_INK;
      return C_LID;
    }
    const lid = 0.22 - 0.12 * a;                       // sleepy: the lid covers the top third
    if (b > lid + lw) return C_LID;
    if (b > lid - lw) return C_INK;
    const pa = (a - 0.18) / 0.36, pb = (b + 0.12) / 0.5;
    if (pa * pa + pb * pb < 1) return (pa + 0.3) ** 2 + (pb - 0.35) ** 2 < 0.09 && px < 0.06 ? C_GLINT : C_PUPIL;
    return C_EYEW;
  }
  function headMat(kind) {
    return (s) => {
      if (s[0] < -0.2) return C_BODY;
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]), sd = az >= 0 ? 1 : -1;
      const px = 1 / (curScale * HEAD_R[1]);
      // local eye coords: u toward the front (the muzzle), v up
      const e = eyePix((EYE_AZ - Math.abs(az)) * cv, s[1] - EYE_V, kind, px);
      return e || C_BODY;
    };
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], dots = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const hump = clamp(+P.hump || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const bob = walking ? 1.4 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.04 * Math.sin(wk) : 0;
    const body = chain(T(0, bob, 0), T(0, 50, 0), R(M3.rz(rock)), T(0, -50, 0));
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';

    /* --- body barrel: yellow, a pale cream bib under the chest --- */
    const bodyMat = (s) => (s[1] < 0 && s[0] > 0.66 && Math.abs(s[2]) < 0.55 ? C_MUZ : C_BODY);
    prims.push(ellF(chain(body, T(...BODY_C)), BODY_R, 1, 1, bodyMat));
    anchors.body = inF(body, BODY_C);

    /* --- the back: a mint-green cap with a zig-zag lower edge and a few loose hexagon spots below it
           (it merges into the body; `hump` swells it and its top glows ember orange) --- */
    const hs = 1 + 0.14 * hump;
    const hc = [HUMP_C[0], HUMP_C[1] + 3 * hump, 0];
    const gl = 0.93 - 0.3 * hump;
    const humpMat = (s) => {
      if (hump > 0.05 && s[1] > gl) return s[1] > gl + (1 - gl) * 0.5 ? C_GLOW_H : C_GLOW;
      const az = Math.atan2(s[2], s[0]);
      const zz = 0.42 + 0.2 * Math.abs(((az * 2.6) % 2 + 2) % 2 - 1) - 0.1;
      if (s[1] > zz) return C_HUMP;
      // loose hexagon spots just under the zig-zag
      const a = az * 2.6 + 0.5, v = s[1] * 6;
      const fa = a - Math.round(a), fv = v - 2.2;
      if (Math.abs(fa) + Math.abs(fv) * 0.6 < 0.2 && Math.abs(fa) < 0.16) return C_HUMP;
      return C_BODY;
    };
    prims.push(ellF(chain(body, T(...hc)), sc(HUMP_R, hs), 2, 1, humpMat));
    anchors.hump = inF(body, [hc[0], hc[1] + HUMP_R[1] * hs * 0.9, 0]);
    anchors.top = inF(body, [hc[0], hc[1] + HUMP_R[1] * hs, 0]);

    /* --- thick short neck and the big head (it nods while walking) --- */
    const nod = walking ? 0.06 * Math.sin(wk * 2) : 0;
    const head = chain(body, T(...HEAD_C), R(M3.rz(-0.05 + nod)));
    prims.push(seg(inF(body, [20, 50, 0]), inF(head, [-6, -10, 0]), 19, 18, 1, 1, (s) => (s[0] > 0.45 && Math.abs(s[2]) < 0.7 ? C_MUZ : C_BODY)));
    const headPrim = ellF(head, HEAD_R, 3, 3, headMat(kind));
    prims.push(headPrim);
    anchors.head = head.t;
    // the big round cream muzzle; the mouth opens along its lower front
    const muzF = chain(head, T(...MUZ_C), R(M3.rz(-0.18)));
    const muzMat = (s) => {
      if (s[0] > 0.2 && mo > 0.05) {
        const line = -0.42 + 0.1 * s[0];
        const h = mo * 0.36;
        if (s[1] < line && s[1] > line - h && Math.abs(s[2]) < 0.8) return mo > 0.35 && s[1] < line - h * 0.55 && Math.abs(s[2]) < 0.5 ? C_TONGUE : C_MOUTH;
      }
      return C_MUZ;
    };
    const muzPrim = ellF(muzF, MUZ_R, 4, 4, muzMat);
    prims.push(muzPrim);
    anchors.mouth = inF(muzF, [MUZ_R[0] * 0.9, -MUZ_R[1] * 0.4, 0]);
    // pink oval nostrils low on the front of the muzzle
    for (const sd of [1, -1]) prims.push(E(inF(muzF, [MUZ_R[0] * 0.84, -MUZ_R[1] * 0.1, sd * MUZ_R[2] * 0.42]), M3.mul(muzF.L, M3.mul(M3.ry(-sd * 0.5), M3.diag(2.2, 3.4, 2))), 4, 4, () => C_NOSE));

    /* --- ears: round, tan, set high on the back of the head --- */
    for (const sd of [1, -1]) {
      const ef = chain(head, T(-12, 18, sd * 14), R(M3.rx(sd * 0.6)), R(M3.rz(0.5)));
      prims.push(ellF(chain(ef, T(0, 4, 0)), [8.5, 8.5, 4.5], sd > 0 ? 5 : 6, sd > 0 ? 5 : 6, M_EAR));
    }
    // the little tan tuft on top of the head
    prims.push(ellF(chain(head, T(4, 23, 0), R(M3.rz(-0.3))), [12, 4.5, 8], 5, 3, M_EAR));

    for (const sd of [1, -1]) {
      const q = Creature.sph(sd * EYE_AZ, EYE_V);
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(head, [HEAD_R[0] * q[0], HEAD_R[1] * q[1], HEAD_R[2] * q[2]]);
    }

    /* --- legs: short stubby columns, diagonal pairs swing together --- */
    for (const lg of LEGS)
      for (const sd of [1, -1]) {
        const id = 7 + (sd > 0 ? 0 : 1);
        const ph = wk + lg.ph + (sd > 0 ? 0 : Math.PI);
        const sw = walking ? 6 * Math.sin(ph) : 0, lift = walking ? 4 * Math.max(0, Math.cos(ph)) : 0;
        const hip = inF(body, [lg.x, 30, sd * lg.z]);
        const foot = [lg.x + sw, 1 + lift, sd * (lg.z + 1.5)];
        prims.push(seg(hip, foot, 13, 12, id, id, M_BODY));
        if (lg.x > 0) anchors[sd > 0 ? 'footN' : 'footF'] = [foot[0], 0, foot[2]];
      }

    /* --- tiny tail --- */
    prims.push(seg(inF(body, [-41, 52, 0]), inF(body, [-47, 42, 0]), 3.4, 3.4, 9, 9, M_BODY));
    anchors.tail = inF(body, [-47, 42, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps, dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 16 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 220, bh: 180, oy: 0.9 } };
})();
