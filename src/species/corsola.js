/* ------------------------------------------------------------------
   Corsola — the Coral Pokémon, Johto / Hoenn pink form (0.6 m ≈ 105 px tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Build: a pink egg-shaped body whose lower part is the pale sea-foam
   coral base (irregular jagged edge plus a few islands), branching pink
   coral on the back and sides (blunt rounded ends, pale tips), a couple
   of stubby nubs, four stubby pale legs, small eye stamps and a 1-px
   smile (culled when facing away) or an open mouth.

   Pose parameters (all optional):
     step   radians     walk phase: diagonal leg pairs lift and swing forward in turn, the body rocks;
                        step = 0 (or any multiple of pi) is the neutral stance
     bob     0..1       bouncy idle: the body rises and stretches, the stubby legs stay planted
     hide    0..1       hunker down: the body sinks and squashes, legs tuck in
     mouth   0..1       smile .. open mouth
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'angry'
   Anchors: top, head, mouth, eyeN, eyeF, body, tipL, tipR (branch tips), feet.
------------------------------------------------------------------- */
const Corsola = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const CORAL = 1, BASE = 2, TIPS = 3, MOUTH = 4, TONGUE = 5;
  const MAT = { CORAL, BASE, TIPS, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [CORAL]:  { r: ['#c2506e', '#de6d88', '#f78ea4', '#ffadbe', '#ffd2dc'], od: '#6e1a34', ol: '#b0445e', ln: '#a8405a' },
    [TIPS]:   { r: ['#d06a84', '#ea8aa0', '#ffb0c0', '#ffcbd6', '#ffe8ee'], od: '#6e1a34', ol: '#b0445e', ln: '#b04c64' },
    [BASE]:   { r: ['#6ea8c0', '#92c8dc', '#bfe6f0', '#dcf4f8', '#f4fdff'], od: '#2a5a72', ol: '#5a8aa4', ln: '#5f90a8' },
    [MOUTH]:  { r: ['#5a1424', '#761e30', '#962c40', '#b24254', '#cc5e6c'], od: '#3a0814', ol: '#5a1424', ln: '#5a1424' },
    [TONGUE]: { r: ['#c24c64', '#dc6a7e', '#f28c9a', '#ffb0b8', '#ffd2d4'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [CORAL]: 1, [TIPS]: 1 };
  const C_CORAL = code(CORAL), C_BASE = code(BASE), C_TIPS = code(TIPS), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const M_CORAL = () => C_CORAL, M_BASE = () => C_BASE;

  const DEFAULT = { step: 0, bob: 0, hide: 0, mouth: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const sphP = (az, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); return [c * Math.cos(az), v, c * Math.sin(az)]; };
  // round-ended ellipsoid spanning p0 -> p1 (local x along it), overlapping its ends by `over`
  function segX(p0, p1, r, part, grp, mat, over) {
    const d = sub(p1, p0), l = Math.hypot(d[0], d[1], d[2]);
    const X = sc(d, 1 / l);
    let Z = cross(X, [0, 1, 0]);
    if (Math.hypot(Z[0], Z[1], Z[2]) < 1e-3) Z = cross(X, [1, 0, 0]);
    Z = nrm(Z);
    const Y = cross(Z, X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(l / 2 + over, r, r)), part, grp, mat);
  }
  const tipMat = (s) => (s[0] > 0.55 ? C_TIPS : C_CORAL);

  /* ---------- body ---------- */
  const BODY_C = [0, 35, 0], BODY_R = [30, 30, 29];
  // pale coral base: below an irregular jagged line, plus a few islands (body unit sphere)
  const jag = (az) => -0.42 + 0.07 * Math.sin(az * 5 + 0.6) + 0.05 * Math.sin(az * 11 + 1.3) + 0.035 * Math.sign(Math.sin(az * 17 + 0.2));
  const ISLES = [[2.4, -0.18, 0.13], [-2.1, -0.2, 0.11], [0.95, -0.3, 0.1], [-0.9, -0.33, 0.08], [3.0, -0.08, 0.08], [-2.9, -0.3, 0.1]];
  const ISLE_D = ISLES.map(([az, v, r]) => ({ d: sphP(az, v), c: Math.cos(r) }));

  /* ---------- branches: [base (body frame), direction, length, radius, sub-branches [t, dir, len, r]] ---------- */
  const BRANCHES = [
    { base: [-3, 57, 10], dir: [-0.2, 1, 0.72], len: 46, r: 6.8, bend: [0.1, 0.1, -0.1], subs: [[0.5, [-0.1, 0.3, 1], 13, 3.8], [0.8, [0.5, 0.8, 0.1], 8, 3.4]] },
    { base: [-6, 56, -11], dir: [-0.4, 1, -0.66], len: 50, r: 7, bend: [-0.1, 0.12, 0.12], subs: [[0.46, [-0.75, 0.35, -0.6], 14, 4], [0.76, [0.3, 0.9, -0.3], 9, 3.4]] },
    { base: [-3, 44, 24], dir: [-0.25, 0.42, 1], len: 30, r: 5.2, bend: [0, 0.12, 0], subs: [[0.58, [0.05, 1, 0.25], 10, 3.2]] },
    { base: [3, 40, -25], dir: [0.12, 0.32, -1], len: 22, r: 4.6, bend: [0, 0.1, 0], subs: [[0.62, [0.25, 0.9, -0.25], 7, 2.8]] },
    { base: [15, 21, -17], dir: [0.55, -0.35, -0.78], len: 15, r: 3.8, bend: [0, 0, 0], subs: [] },
    { base: [-15, 19, 21], dir: [-0.35, -0.25, 1], len: 10, r: 3.4, bend: [0, 0, 0], subs: [] },
    { base: [-19, 30, -18], dir: [-0.7, 0.1, -0.7], len: 9, r: 3.2, bend: [0, 0, 0], subs: [] },
  ];

  /* ---------- legs (body frame hips; diagonal pairs move together) ---------- */
  const LEGS = [
    { hip: [12, 8, 12], ph: 0 }, { hip: [12, 8, -12], ph: Math.PI },
    { hip: [-12, 8, 12], ph: Math.PI }, { hip: [-12, 8, -12], ph: 0 },
  ];

  /* ---------- face (body unit sphere) ---------- */
  const EYE_AZ = 0.3, EYE_V = 0.02;
  const MOUTH_V = -0.2, MOUTH_AZ = 0.22;
  const smileV = (az) => MOUTH_V - 0.07 * (1 - (az / MOUTH_AZ) ** 2);
  const SMILE = [];
  for (let i = 0; i <= 12; i++) { const a = lerp(-MOUTH_AZ, MOUTH_AZ, i / 12); SMILE.push(sphP(a, smileV(a))); }
  // little upturned corners
  const CORNERS = [1, -1].map((sd) => [sphP(sd * MOUTH_AZ, smileV(MOUTH_AZ)), sphP(sd * (MOUTH_AZ + 0.04), MOUTH_V + 0.03)]);

  const PRI = {};
  for (let i = 1; i < 24; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 0, 2: 1 });
  for (let i = 10; i < 20; i++) PRI[i] = 2;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const bob = clamp(P.bob, 0, 1), hide = clamp(P.hide, 0, 1), mo = clamp(P.mouth, 0, 1), st = P.step || 0;
    // step = 0 (or any multiple of pi) is the neutral stance; the body rocks and bobs with the gait
    const sway = Math.sin(st) * 0.05;
    // bob: bouncy idle — the body rises and stretches while the feet stay planted; hide: sinks and squashes
    const lift = bob * 5 - hide * 6 + Math.abs(Math.sin(st)) * 1.2;
    const sy = 1 + bob * 0.07 - hide * 0.14, sxz = 1 - bob * 0.035 + hide * 0.07;
    const body = chain(T(0, lift, 0), T(0, 8, 0), R(M3.rx(sway)), F(M3.diag(sxz, sy, sxz), [0, 0, 0]), T(0, -8, 0));

    /* --- body with the face */
    const bodyF = chain(body, T(...BODY_C));
    const hM = mo * 0.18;
    const bodyMat = (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az);
      if (s[1] < jag(az)) return C_BASE;
      for (const is of ISLE_D) if (s[0] * is.d[0] + s[1] * is.d[1] + s[2] * is.d[2] > is.c) return C_BASE;
      if (hM > 0.01 && a < MOUTH_AZ + 0.02) {
        const k = Math.max(0, 1 - (az / (MOUTH_AZ + 0.02)) ** 2);
        const top = smileV(clamp(az, -MOUTH_AZ, MOUTH_AZ)) + 0.05 * k;
        const bot = top - (hM + 0.03) * Math.sqrt(k);
        if (s[1] <= top && s[1] > bot) return s[1] < bot + (top - bot) * 0.45 && a < MOUTH_AZ * 0.65 ? C_TONGUE : C_MOUTH;
      }
      return C_CORAL;
    };
    const bodyPrim = ellF(bodyF, BODY_R, 1, 1, bodyMat);
    prims.push(bodyPrim);
    const decals = [];
    if (mo < 0.1) { decals.push({ pts: SMILE, mat: MOUTH, tone: 1 }); for (const c of CORNERS) decals.push({ pts: c, mat: MOUTH, tone: 1 }); }

    /* --- coral branches */
    const tips = [];
    BRANCHES.forEach((b, i) => {
      const id = 10 + i;
      const p0 = inF(body, b.base);
      const d0 = nrm(M3.v(body.L, b.dir));
      const mid = add(p0, sc(d0, b.len * 0.55));
      const d1 = nrm(add(d0, M3.v(body.L, b.bend)));
      const end = add(mid, sc(d1, b.len * 0.45));
      const r1 = b.r * 0.86;
      prims.push(segX(sub(p0, sc(d0, 6)), mid, b.r, id, id, M_CORAL, 2));
      prims.push(segX(mid, end, r1, id, id, b.subs.length || b.len > 12 ? tipMat : M_CORAL, 2.5));
      for (const [t, dir, len, r] of b.subs) {
        const q0 = t <= 0.55 ? add(p0, sc(d0, b.len * t)) : add(mid, sc(d1, b.len * (t - 0.55)));
        const q1 = add(q0, sc(nrm(M3.v(body.L, dir)), len));
        prims.push(segX(q0, q1, r, id, id, tipMat, 1));
      }
      tips.push(add(end, sc(d1, r1)));
    });

    /* --- stubby legs (walk: diagonal pairs lift and swing) */
    const feet = [];
    LEGS.forEach((lg, i) => {
      const ph = st + lg.ph;
      const up = Math.max(0, Math.sin(ph)) * 4;   // lifted legs swing forward, planted legs push back
      const sw = Math.sin(ph) * 3.5;
      const hip = inF(body, lg.hip);
      const foot = [lg.hip[0] * 1.05 + sw, up + hide * 3, lg.hip[2] * 1.08];
      const len = Math.max(2, hip[1] - foot[1]);
      const c = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2 + 1, (hip[2] + foot[2]) / 2];
      prims.push(E(c, M3.diag(6, len / 2 + 2.5, 6), 2, 2, M_BASE));
      feet.push([foot[0], foot[1], foot[2]]);
    });

    /* --- eyes */
    const eyeKind = P.eyes === 'closed' ? 'blink' : ['happy', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = sphP(sd * EYE_AZ, EYE_V);
      const at = { prim: bodyPrim, p: inF(bodyF, [s[0] * BODY_R[0], s[1] * BODY_R[1], s[2] * BODY_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.62, far: 0.34, flipX: sd < 0 && eyeKind === 'angry' });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    let topP = tips[0];
    for (const t of tips) if (t[1] > topP[1]) topP = t;
    Object.assign(anchors, {
      top: topP,
      head: inF(bodyF, [8, 14, 0]),
      mouth: inF(bodyF, [BODY_R[0] * 0.97, MOUTH_V * BODY_R[1], 0]),
      body: bodyF.t,
      tipL: tips[0], tipR: tips[1],
      feet: sc(feet.reduce((a, f) => add(a, f), [0, 0, 0]), 0.25),
    });
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: CORAL, shadowSteps: 16, facePrim: bodyPrim, decals };
  }

  /* ---------- eye stamps: k = black, w = glint; far eye mirrored so angry lids slant inward ---------- */
  const mk = (o, oN, oF, h, hN, hF, b, bN, bF, a, aN, aF) => ({ open: o, openN: oN, openF: oF, happy: h, happyN: hN, happyF: hF, blink: b, blinkN: bN, blinkF: bF, angry: a, angryN: aN, angryF: aF });
  const EYES_S = mk(
    ['kk', 'wk', 'kk', 'kk'], ['kk', 'wk', 'kk', 'kk'], ['k', 'k', 'k'],
    ['.k.', 'k.k'], ['.k.', 'k.k'], ['k.', '.k'],
    ['kkk'], ['kk'], ['kk'],
    ['k..', 'kk.', 'wkk', 'kkk'], ['k.', 'kk', 'kk'], ['k', 'k'],
  );
  const EYES_M = mk(
    ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'], ['.k.', 'kwk', 'kkk', 'kkk', '.k.'], ['kk', 'wk', 'kk', 'kk'],
    ['.kk.', 'k..k'], ['.k.', 'k.k'], ['.k', 'k.'],
    ['kkkk', '.kk.'], ['kkk', '.k.'], ['kk'],
    ['k...', 'kkk.', 'kwkk', 'kkkk', '.kk.'], ['k..', 'kkk', 'kwk', 'kkk'], ['k.', 'kk', 'kk'],
  );
  const EYES_L = mk(
    ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'], ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkkk', '.kk.'], ['.k.', 'kwk', 'kkk', 'kkk', '.k.'],
    ['.kkk.', 'k...k', 'k...k'], ['.kk.', 'k..k', 'k..k'], ['.k.', 'k.k'],
    ['kkkkk', '.kkk.'], ['kkkk', '.kk.'], ['kkk'],
    ['k....', 'kkk..', 'kwkkk', 'kkkkk', 'kkkkk', '.kkk.'], ['k...', 'kkk.', 'kwkk', 'kkkk', '.kk.'], ['k..', 'kkk', 'kkk', '.k.'],
  );
  const EYEC = { k: '#1e1016', w: '#ffffff' };

  /* ---------- render: face lines culled when facing away; eye size by scale; cropped ray-cast ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.9 ? EYES_L : scale >= 0.5 ? EYES_M : EYES_S;
    for (const st of model.stamps) st.set = set;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const p = model.facePrim, Li = M3.inv(M3.mul(V, p.L));
    p.lines = model.decals.filter((ln) => {
      const q = ln.pts[Math.floor(ln.pts.length / 2)];
      const nz = Li[2] * q[0] + Li[5] * q[1] + Li[8] * q[2];
      return nz / Math.hypot(Li[0] * q[0] + Li[3] * q[1] + Li[6] * q[2], Li[1] * q[0] + Li[4] * q[1] + Li[7] * q[2], nz) > 0.25;
    });
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 126, bh: 150, oy: 0.855 } };
})();
