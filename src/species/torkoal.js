/* ------------------------------------------------------------------
   Torkoal — the Coal Pokémon (0.5 m ≈ 88 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a stout tortoise. A big high-domed charcoal shell
   with a pale grey-brown rim and dark vents on top (they glow and puff
   smoke when it burns coal), an orange-red body with thick stubby legs
   and dark claws, a thick neck lifting a blunt orange-red head with big
   nostrils (it blows smoke rings from them) and sleepy grey eyes.

   Pose params:
     walk   radians  slow crawl phase (diagonal legs step, head sways);
                     exactly 0 = standing
     smoke  0..1     the shell vents glow ember orange and grey smoke puffs
                     billow out of them
     hide   0..1     withdrawn: head and legs pull into the shell (eyes shut)
     mouth  0..1     mouth opens (dark mouth, pink tongue)
     eyes   'open' (default, sleepy) | 'happy' | 'blink' | 'closed'
     side   −1..1    camera side from the game (unused; symmetric model)
   Anchors: top (shell top / smoke vent), shell, head, mouth, nose, eyeN,
            eyeF, body, footN, footF.
------------------------------------------------------------------- */
const Torkoal = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SKIN = 1, SHELL = 2, RIM = 3, HOLE = 4, GLOW = 5, SMOKE = 6, MOUTH = 7, TONGUE = 8, CLAW = 9;
  const MAT = { SKIN, SHELL, RIM, HOLE, GLOW, SMOKE, MOUTH, TONGUE, CLAW };
  const PAL = Creature.palette({
    [SKIN]:   { r: ['#962a14', '#c0421c', '#e4622a', '#f68a46', '#ffb676'], od: '#541208', ol: '#8e2610', ln: '#8a2810' },
    [SHELL]:  { r: ['#1e1a1c', '#2c2628', '#40383a', '#5a4e4e', '#7e7270'], od: '#0c0808', ol: '#262022', ln: '#181314' },
    [RIM]:    { r: ['#4a4448', '#625a5e', '#7e767a', '#9a9296', '#bab2b6'], od: '#221e20', ol: '#3e383a', ln: '#3a3436' },
    [HOLE]:   { r: ['#6a1420', '#92202e', '#bc3444', '#e0566a', '#f68a9a'], od: '#3a0810', ol: '#5a0e18', ln: '#1a1012' },
    [GLOW]:   { r: ['#b8300e', '#e04c14', '#ff7a24', '#ffae48', '#ffe49a'], od: '#5a1406', ol: '#9a2a0c', ln: '#a0300c' },
    [SMOKE]:  { r: ['#8e8c94', '#aeacb4', '#cecdd2', '#e8e7ea', '#faf9fb'], od: '#56545c', ol: '#7c7a82', ln: '#8a8890' },
    [MOUTH]:  { r: ['#3e0e10', '#581618', '#742224', '#903234', '#aa4846'], od: '#260608', ol: '#3e0c0e', ln: '#300a0c' },
    [TONGUE]: { r: ['#b84452', '#d65e6a', '#ee808a', '#ffa6aa', '#ffcccc'], od: '#6a1a26', ol: '#8e2a38', ln: '#8e2a38' },
    [CLAW]:   { r: ['#a8a4a0', '#c8c4c0', '#e4e0dc', '#f4f2ee', '#ffffff'], od: '#4a4440', ol: '#7a746e', ln: '#7a746e' },
  });
  const GLOSSY = { [SHELL]: 1 };
  const C_SKIN = code(SKIN), C_SHELL = code(SHELL), C_RIM = code(RIM), C_HOLE = code(HOLE), C_GLOW = code(GLOW), C_GLOW_H = code(GLOW, 1);
  const C_HOLE_RIM = code(SHELL, -1);
  const C_SMOKE = code(SMOKE), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_CLAW = code(CLAW);
  const M_SKIN = () => C_SKIN, M_CLAW = () => C_CLAW, M_SMOKE = () => C_SMOKE;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
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

  // ---- geometry (body frame, ground at y = 0)
  const SHELL_C = [-6, 30, 0], SHELL_R = [38, 33, 34];
  const RIM_V = -0.3, CUT_V = -0.46; // rim band between CUT_V and RIM_V (unit-sphere y), open below
  const BELLY_C = [-3, 17, 0], BELLY_R = [33, 11, 29];
  // vents on the shell top (unit-sphere directions, angular radius)
  // hexagonal vents ringing the shell (red-hot inside, like the official art) plus a rear exhaust
  const VENTS = [[-1, 0.2, 0, 0.22], ...[0.5, 1.55, 2.6, 3.7, 4.75, 5.8].map((a) => [...Creature.sph(a, 0.55), 0.26]), ...[1.0, 2.9, 4.2].map((a) => [...Creature.sph(a, 1.1), 0.2])]
    .map(([x, y, z, r]) => {
      const d = nrm([x, y, z]);
      let u = cross(d, [0, 1, 0]); if (len3(u) < 1e-3) u = [0, 0, 1];
      u = nrm(u); const v = cross(u, d);
      return { d, u, v, r: Math.sin(r), c: Math.cos(r * 1.35) };
    });
  const hexD = (a, b) => Math.max(Math.abs(b), Math.abs(b * 0.5 + a * 0.866), Math.abs(b * 0.5 - a * 0.866));
  const BAND_M = () => C_RIM;
  const HEAD_OUT = { neck0: [22, 24, 0], c: [42, 54, 0] }, HEAD_IN = { neck0: [6, 22, 0], c: [16, 27, 0] };
  const HEAD_R = [14.5, 12.5, 13];
  const SNOUT_C = [11.5, -2.5, 0], SNOUT_R = [10.5, 9.5, 11];
  const EYE_S = nrm([0.5, 0.5, 0.72]);
  const LEGS = [{ x: 22, z: 22, ph: 0 }, { x: -26, z: 21, ph: Math.PI }];
  const PRI = { 1: 0, 2: 2, 3: 3, 4: 3, 5: 1, 6: 1, 7: 1, 8: 1, 9: 0, 10: 4 };
  const SIZE = 1.2;
  const DEFAULT = { walk: 0, smoke: 0, hide: 0, mouth: 0, eyes: 'open', side: 1 };

  // ---- eye stamps: sleepy grey eyes with heavy dark lids. k = lid, g = grey eye, p = pupil
  const EYES_S = {
    open: ['kkk', 'gpk'], openN: ['kk', 'pk'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k'],
    blink: ['...', 'kkk'], blinkN: ['..', 'kk'], blinkF: ['k'],
    closed: ['k.k', '.k.'], closedN: ['k.', '.k'], closedF: ['k'],
  };
  const EYES_L = {
    open: ['kkkk', 'kggk', 'kgpk', '.kk.'], openN: ['kkk', 'kgk', 'kpk', '.k.'], openF: ['kk', 'gk', 'k.'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    blink: ['....', 'kkkk', '.kk.'], blinkN: ['...', 'kkk'], blinkF: ['..', 'kk'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
  };
  const EYES_XL = {
    open: ['.kkkk.', 'kkkkkk', 'kgggpk', 'kggppk', '.kkkk.'], openN: ['.kkk.', 'kkkkk', 'kggpk', 'kgppk', '.kkk.'], openF: ['.k', 'kk', 'gk', 'kk'],
    happy: ['.kkkk.', 'kk..kk', 'k....k'], happyN: ['.kkk.', 'kk.kk', 'k...k'], happyF: ['.k', 'k.'],
    blink: ['......', '......', 'kkkkkk', '.kkkk.'], blinkN: ['.....', '.....', 'kkkkk', '.kkk.'], blinkF: ['..', 'kk'],
    closed: ['k....k', 'kk..kk', '.kkkk.'], closedN: ['k...k', 'kk.kk', '.kkk.'], closedF: ['k.', '.k'],
  };
  const mirror = (S) => Object.fromEntries(Object.entries(S).map(([k, g]) => [k, g.map((r) => r.split('').reverse().join(''))]));
  const SETS = { S: [EYES_S, mirror(EYES_S)], L: [EYES_L, mirror(EYES_L)], XL: [EYES_XL, mirror(EYES_XL)] };
  const EYEC = { k: '#2a0c08', g: '#d8d4d8', p: '#1a1418' };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], dots = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const smoke = clamp(+P.smoke || 0, 0, 1), hide = clamp(+P.hide || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1) * (1 - hide);
    const hk = hide * hide * (3 - 2 * hide);
    const bob = walking ? 0.8 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.035 * Math.sin(wk) : 0;
    const body = chain(T(0, bob - 3 * hk, 0), T(0, 30, 0), R(M3.rx(rock)), T(0, -30, 0));

    /* --- shell: charcoal dome, pale rim band, vents (glowing when it smokes) --- */
    const glow = smoke > 0.05;
    const shellMat = (s) => {
      if (s[1] < CUT_V) return 0;
      if (s[1] < RIM_V) return C_RIM;
      for (const v of VENTS) {
        const c = s[0] * v.d[0] + s[1] * v.d[1] + s[2] * v.d[2];
        if (c < v.c) continue;
        const h = hexD(s[0] * v.u[0] + s[1] * v.u[1] + s[2] * v.u[2], s[0] * v.v[0] + s[1] * v.v[1] + s[2] * v.v[2]) / v.r;
        if (h < 0.72) return glow ? (h < 0.45 && smoke > 0.4 ? C_GLOW_H : C_GLOW) : C_HOLE;
        if (h < 1) return C_HOLE_RIM;
      }
      return C_SHELL;
    };
    const shellF = chain(body, T(...SHELL_C));
    prims.push(ellF(shellF, SHELL_R, 2, 2, shellMat));
    prims.push(ellF(chain(body, T(...BELLY_C)), BELLY_R, 1, 1, M_SKIN));
    anchors.shell = inF(body, SHELL_C);
    anchors.top = inF(shellF, [0, SHELL_R[1], 0]);
    anchors.body = inF(body, [0, 26, 0]);

    /* --- smoke puffs out of the vents --- */
    if (smoke > 0.05) {
      const puffs = [[0, 1.0, 0, 1], [0.3, 0.8, 0.45, 0.7], [-0.4, 0.78, -0.35, 0.7]];
      puffs.forEach(([x, y, z, k], i) => {
        const d = nrm([x, y, z]);
        const base = inF(shellF, [d[0] * SHELL_R[0], d[1] * SHELL_R[1], d[2] * SHELL_R[2]]);
        const r = (4 + 7 * smoke) * k;
        const rise = r * 0.6 + 6 * smoke * k;
        prims.push(ellF(T(base[0] - 2 * i, base[1] + rise, base[2]), [r, r * 0.85, r], 20 + i, 20 + i, M_SMOKE));
        if (k === 1 && smoke > 0.4) prims.push(ellF(T(base[0] - 4, base[1] + rise + r * 1.1, base[2]), [r * 0.75, r * 0.65, r * 0.75], 23, 23, M_SMOKE));
      });
    }

    /* --- neck and head (pull into the shell with `hide`) --- */
    const H = { neck0: lerpV(HEAD_OUT.neck0, HEAD_IN.neck0, hk), c: lerpV(HEAD_OUT.c, HEAD_IN.c, hk) };
    const sway = walking ? 0.05 * Math.sin(wk) : 0;
    const head = chain(body, T(...H.c), R(M3.ry(sway)), R(M3.rz(0.4)));
    const neckMat = (s) => (Math.abs(s[1] + 0.05) < 0.12 ? C_RIM : C_SKIN); // grey neck band
    prims.push(seg(inF(body, H.neck0), inF(head, [-6, -6, 0]), 9, 9.5, 3, 3, neckMat));
    const headPrim = ellF(head, HEAD_R, 3, 3, M_SKIN);
    prims.push(headPrim);
    anchors.head = head.t;
    const snF = chain(head, T(...SNOUT_C), R(M3.rz(-0.15)));
    const snMat = (s) => {
      if (mo > 0.03 && s[0] > 0.1) {
        const line = -0.42, h = mo * 0.4;
        if (s[1] < line + 0.04 && s[1] > line - h && Math.abs(s[2]) < 0.8) return s[1] < line - h * 0.55 && Math.abs(s[2]) < 0.45 ? C_TONGUE : C_MOUTH;
      }
      return C_SKIN;
    };
    const snPrim = ellF(snF, SNOUT_R, 4, 3, snMat);
    prims.push(snPrim);
    anchors.mouth = inF(snF, [SNOUT_R[0] * 0.8, -SNOUT_R[1] * 0.5, 0]);
    anchors.nose = inF(snF, [SNOUT_R[0], SNOUT_R[1] * 0.25, 0]);
    // big nostrils
    for (const sd of [1, -1]) {
      for (const [dy, dz] of [[0, 0], [0.08, 0], [0, 0.08]]) {
        const s = nrm([0.9, 0.28 + dy, (0.3 + dz) * sd]);
        dots.push({ at: { prim: snPrim, p: inF(snF, [SNOUT_R[0] * s[0], SNOUT_R[1] * s[1], SNOUT_R[2] * s[2]]), s }, color: '#3a0e08', minFacing: 0.3 });
      }
    }

    /* --- eyes --- */
    let kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    if (hide > 0.5) kind = 'closed';
    for (const sd of [1, -1]) {
      const s = [EYE_S[0], EYE_S[1], EYE_S[2] * sd];
      const at = { prim: headPrim, p: inF(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s };
      stamps.push({ at, sd, colors: EYEC, kind, near: 0.7, far: 0.4, minFacing: 0.12 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- legs: thick stumps splayed out from under the shell, dark claws --- */
    for (const lg of LEGS)
      for (const sd of [1, -1]) {
        const id = 5 + (lg.x > 0 ? 0 : 2) + (sd > 0 ? 0 : 1);
        const ph = wk + lg.ph + (sd > 0 ? 0 : Math.PI);
        const sw = walking ? 5 * Math.sin(ph) : 0, lift = walking ? 3 * Math.max(0, Math.cos(ph)) : 0;
        const k = 1 - 0.55 * hk; // legs pull in and up under the shell
        const hip = inF(body, [lg.x * 0.8, 20, sd * lg.z * 0.75]);
        const foot = add(lerpV([lg.x + sw, 4 + lift, sd * lg.z * 1.12], inF(body, [lg.x * 0.7, 14, sd * lg.z * 0.7]), hk), [0, 0, 0]);
        prims.push(seg(hip, foot, 9.5 * k + 2, 9.5 * k + 2, id, id, (s) => (Math.abs(s[1] + 0.05) < 0.14 ? C_RIM : C_SKIN)));
        const fd = nrm([lg.x > 0 ? 1 : -0.3, 0, sd * 0.5]);
        prims.push(ellF(T(foot[0], foot[1] - 1, foot[2]), [10 * k + 1, 5, 10 * k + 1], id, id, M_SKIN));
        if (hk < 0.8) for (const t of [-1, 0, 1]) {
          const cd = nrm(add(fd, [0, 0, t * 0.5 * (lg.x > 0 ? 1 : -1)]));
          prims.push(ellF(T(foot[0] + cd[0] * 9, foot[1] - 2, foot[2] + cd[2] * 9), [3, 2.4, 3], id, id, M_CLAW));
        }
        if (lg.x > 0) anchors[sd > 0 ? 'footN' : 'footF'] = [foot[0], 0, foot[2]];
      }

    /* --- stubby tail --- */
    prims.push(seg(inF(body, [-34, 18, 0]), inF(body, [-44 + 8 * hk, 12, 0]), 4.5, 4.5, 9, 9, M_SKIN));

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const s of stamps) s.at.p = sc(s.at.p, SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps, dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: SKIN, shadowSteps: 16 };
  }

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    const set = SETS[s >= 1.3 ? 'XL' : s >= 0.62 ? 'L' : 'S'];
    for (const st of model.stamps) st.set = set[st.sd > 0 ? 0 : 1];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 170, bh: 150, oy: 0.92 } };
})();
