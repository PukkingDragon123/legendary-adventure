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
  const BODY = 1, MUZ = 2, HUMP = 3, MOUTH = 4, TONGUE = 5, EAR = 6, GLOW = 7;
  const MAT = { BODY, MUZ, HUMP, MOUTH, TONGUE, EAR, GLOW };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#9c7a28', '#c49c38', '#e4c254', '#f4da7c', '#fff0b4'], od: '#5a400e', ol: '#8e6a1c', ln: '#8e6a20' },
    [MUZ]:    { r: ['#b8a064', '#d8c488', '#f2e2ae', '#faf0cc', '#fffae8'], od: '#5e4818', ol: '#8e7438', ln: '#a08448' },
    [HUMP]:   { r: ['#3e6a4a', '#50845a', '#6ca274', '#90c092', '#c0e0bc'], od: '#1e3a26', ol: '#34603e', ln: '#2e5838' },
    [MOUTH]:  { r: ['#4a1a1a', '#662424', '#843434', '#a04646', '#bc5e5a'], od: '#2c0a0a', ol: '#4a1414', ln: '#3a1010' },
    [TONGUE]: { r: ['#b84a56', '#d6646e', '#ee8690', '#ffaab0', '#ffd0d0'], od: '#6a1a26', ol: '#8e2a38', ln: '#8e2a38' },
    [EAR]:    { r: ['#7e5e1c', '#a07a28', '#c09a3c', '#d8b658', '#f0d488'], od: '#4a320a', ol: '#7a5616', ln: '#6e4e14' },
    [GLOW]:   { r: ['#d8501a', '#f07024', '#ff9a34', '#ffc460', '#fff0a8'], od: '#7a2408', ol: '#b8400e', ln: '#c04810' },
  });
  const GLOSSY = { [HUMP]: 1 };
  const C_BODY = code(BODY), C_MUZ = code(MUZ), C_HUMP = code(HUMP), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
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
  const BODY_C = [-2, 44, 0], BODY_R = [38, 25, 25.5];
  const HUMP_C = [-7, 64, 0], HUMP_R = [26, 18.5, 21.5];
  const HEAD_C = [42, 76, 0], HEAD_R = [17.5, 16.5, 17];
  const MUZ_C = [15, -6, 0], MUZ_R = [16, 10, 11]; // in the head frame
  const EYE_S = nrm([0.72, 0.2, 0.66]);
  const LEGS = [{ x: 22, z: 15, ph: 0 }, { x: -24, z: 15, ph: Math.PI }];
  const PRI = { 1: 0, 2: 2, 3: 3, 4: 3, 5: 1, 6: 1, 7: 1, 8: 1, 9: 0 };
  const SIZE = 1.3;
  const DEFAULT = { walk: 0, hump: 0, mouth: 0, eyes: 'open', side: 1 };

  // ---- eye stamps: sleepy, heavy-lidded black eyes. k = lid/outline, p = pupil, w = glint
  const EYES_S = {
    open: ['kkk', 'kpk'], openN: ['kk', 'kp'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k'],
    blink: ['...', 'kkk'], blinkN: ['..', 'kk'], blinkF: ['k'],
    closed: ['k.k', '.k.'], closedN: ['k.', '.k'], closedF: ['k'],
  };
  const EYES_L = {
    open: ['kkkkk', 'kpppk', 'kppwk', '.kpk.'], openN: ['kkkk', 'kppk', 'kpwk', '.kk.'], openF: ['kk', 'kp', 'kk'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k'], happyF: ['.k', 'k.'],
    blink: ['.....', 'kkkkk', '.kkk.'], blinkN: ['...', 'kkk'], blinkF: ['..', 'kk'],
    closed: ['k...k', '.kkk.'], closedN: ['k..k', '.kk.'], closedF: ['k.', '.k'],
  };
  const EYES_XL = {
    open: ['.kkkk.', 'kkkkkk', 'kppppk', 'kpppwk', '.kppk.'], openN: ['.kkk.', 'kkkkk', 'kpppk', 'kppwk', '.kpk.'], openF: ['.k', 'kk', 'kp', 'kk'],
    happy: ['.kkkk.', 'kk..kk', 'k....k'], happyN: ['.kkk.', 'kk.kk', 'k...k'], happyF: ['.k', 'k.'],
    blink: ['......', '......', 'kkkkkk', '.kkkk.'], blinkN: ['.....', '.....', 'kkkkk', '.kkk.'], blinkF: ['..', 'kk'],
    closed: ['k....k', 'kk..kk', '.kkkk.'], closedN: ['k...k', 'kk.kk', '.kkk.'], closedF: ['k.', '.k'],
  };
  const mirror = (S) => Object.fromEntries(Object.entries(S).map(([k, g]) => [k, g.map((r) => r.split('').reverse().join(''))]));
  const SETS = { S: [EYES_S, mirror(EYES_S)], L: [EYES_L, mirror(EYES_L)], XL: [EYES_XL, mirror(EYES_XL)] };
  let curScale = 1;
  const EYEC = { k: '#2a1a0a', p: '#140c06', w: '#ffffff' };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], dots = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const hump = clamp(+P.hump || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const bob = walking ? 1.4 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.04 * Math.sin(wk) : 0;
    const body = chain(T(0, bob, 0), T(0, 50, 0), R(M3.rz(rock)), T(0, -50, 0));

    /* --- body barrel: yellow, a little paler underneath --- */
    const bodyMat = (s) => C_BODY;
    prims.push(ellF(chain(body, T(...BODY_C)), BODY_R, 1, 1, bodyMat));
    anchors.body = inF(body, BODY_C);

    /* --- hump: swells with `hump`, its top glows ember orange --- */
    const hs = 1 + 0.14 * hump;
    const hc = [HUMP_C[0], HUMP_C[1] + 3 * hump, 0];
    const gl = 0.93 - 0.3 * hump;
    const humpMat = (s) => (hump > 0.05 && s[1] > gl ? (s[1] > gl + (1 - gl) * 0.5 ? C_GLOW_H : C_GLOW) : C_HUMP);
    prims.push(ellF(chain(body, T(...hc)), sc(HUMP_R, hs), 2, 2, humpMat));
    anchors.hump = inF(body, [hc[0], hc[1] + HUMP_R[1] * hs * 0.9, 0]);
    anchors.top = inF(body, [hc[0], hc[1] + HUMP_R[1] * hs, 0]);

    /* --- neck and head (head nods while walking) --- */
    const nod = walking ? 0.06 * Math.sin(wk * 2) : 0;
    const head = chain(body, T(...HEAD_C), R(M3.rz(-0.12 + nod)));
    prims.push(seg(inF(body, [22, 48, 0]), inF(head, [-6, -6, 0]), 13, 13.5, 1, 1, M_BODY));
    const headPrim = ellF(head, HEAD_R, 3, 3, M_BODY);
    prims.push(headPrim);
    anchors.head = head.t;
    // muzzle: long, rounded, drooping; the mouth opens along its lower front
    const muzF = chain(head, T(...MUZ_C), R(M3.rz(-0.32)));
    const muzMat = (s) => {
      if (s[0] > 0.2) {
        const line = -0.38 + 0.1 * s[0];
        const h = Math.max(0.06, 0.8 / (curScale * MUZ_R[1] * SIZE)) + mo * 0.34;
        if (s[1] < line && s[1] > line - h && Math.abs(s[2]) < 0.85) return mo > 0.35 && s[1] < line - h * 0.55 && Math.abs(s[2]) < 0.5 ? C_TONGUE : C_MOUTH;
      }
      return C_MUZ;
    };
    const muzPrim = ellF(muzF, MUZ_R, 4, 4, muzMat);
    prims.push(muzPrim);
    anchors.mouth = inF(muzF, [MUZ_R[0] * 0.9, -MUZ_R[1] * 0.35, 0]);
    // nostrils
    for (const sd of [1, -1]) {
      const s = nrm([0.92, 0.2, 0.3 * sd]);
      dots.push({ at: { prim: muzPrim, p: inF(muzF, [MUZ_R[0] * s[0], MUZ_R[1] * s[1], MUZ_R[2] * s[2]]), s }, mat: MUZ, tone: 0, minFacing: 0.3 });
    }

    /* --- ears: small, round, sticking out sideways --- */
    for (const sd of [1, -1]) {
      const ef = chain(head, T(-10, 8, sd * 12), R(M3.rx(sd * 0.5)), R(M3.ry(sd * 0.3)));
      prims.push(ellF(chain(ef, T(0, 0, sd * 5)), [5.5, 4, 8], sd > 0 ? 5 : 6, sd > 0 ? 5 : 6, M_EAR));
    }

    /* --- eyes --- */
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    for (const sd of [1, -1]) {
      const s = [EYE_S[0], EYE_S[1], EYE_S[2] * sd];
      const at = { prim: headPrim, p: inF(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s };
      stamps.push({ at, sd, colors: EYEC, kind, near: 0.7, far: 0.4, minFacing: 0.12 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- legs: short stubby columns, diagonal pairs swing together --- */
    for (const lg of LEGS)
      for (const sd of [1, -1]) {
        const id = 7 + (sd > 0 ? 0 : 1);
        const ph = wk + lg.ph + (sd > 0 ? 0 : Math.PI);
        const sw = walking ? 6 * Math.sin(ph) : 0, lift = walking ? 4 * Math.max(0, Math.cos(ph)) : 0;
        const hip = inF(body, [lg.x, 30, sd * lg.z]);
        const foot = [lg.x + sw, 4 + lift, sd * (lg.z + 1.5)];
        prims.push(seg(hip, foot, 10.5, 10, id, id, M_BODY));
        prims.push(ellF(T(foot[0] + 1, foot[1] - 0.5, foot[2]), [11, 4.2, 10.4], id, id, M_BODY));
        if (lg.x > 0) anchors[sd > 0 ? 'footN' : 'footF'] = [foot[0], 0, foot[2]];
      }

    /* --- tiny tail --- */
    prims.push(seg(inF(body, [-37, 50, 0]), inF(body, [-44, 40, 0]), 3.4, 3.4, 9, 9, M_BODY));
    anchors.tail = inF(body, [-44, 40, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const s of stamps) s.at.p = sc(s.at.p, SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps, dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 16 };
  }

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    curScale = s;
    const set = SETS[s >= 1.2 ? 'XL' : s >= 0.62 ? 'L' : 'S'];
    for (const st of model.stamps) st.set = set[st.sd > 0 ? 0 : 1];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 220, bh: 180, oy: 0.9 } };
})();
