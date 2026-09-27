/* ------------------------------------------------------------------
   Plusle — the Cheering Pokémon (0.4 m ≈ 70 units tall at scale 1,
   ears included). A posable 3D model rendered straight to pixel art by
   the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a small cream rabbit-like
   electric mouse. A big round cream head with two small cream bumps on
   top from which long red oval ears splay out in a V; black oval eyes
   with a white glint; red round cheeks with a cream "+"; a wide open
   smiling mouth (dark red with a pink tongue) and a tiny nose. A small
   pear-shaped body on short stubby legs, short arms ending in red
   mitten paws, and a thin tail ending in a red "+".

   Pose parameters (all optional):
     cheer   0..1     arms raised: 0 = arms out at the sides, 1 = both arms
                      up high waving pom-poms of sparks (the pom-poms grow in
                      from cheer ≈ 0.3)
     jump    0..1     hop squash & stretch: rising from 0 the body first
                      crouches (squash, deepest at ≈ 0.22), then stretches
                      tall from ≈ 0.4 to 1 (legs extended, arms and ears
                      swept up) — animate 0 → 1 → 0 over a hop for crouch,
                      leap and landing squash (the game moves it up)
     step    radians  walk cycle phase (bouncy steps: legs alternate, arms
                      swing, body bobs and rocks); exactly 0 = standing
     spark   0..1     electric glow: the cheeks brighten and glow hot, and
                      from ≈ 0.45 little yellow sparks crackle off them
     mouth   0..1     0 = closed smile … 1 = wide open (default 0.7, as in
                      the official art)
     eyes    'open' | 'happy' | 'closed' | 'blink'
     side    −1..1    ≈ cos(yaw), passed by the game: the flat "+" tail turns
                      toward the camera so it always reads

   Anchors: top (highest ear tip), head (head centre), mouth, eyeN, eyeF,
   body (belly centre), cheekN / cheekF (cheek centres, for spark FX),
   pawN / pawF (paw centres, pom-poms), earN / earF (ear tips), tail
   (centre of the "+").
------------------------------------------------------------------- */
const Plusle = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const CREAM = 1, RED = 2, EYE = 3, GLINT = 4, MOUTH = 5, TONGUE = 6, GLOW = 7, SPARK = 8, INK = 9;
  const MAT = { CREAM, RED, EYE, GLINT, MOUTH, TONGUE, GLOW, SPARK, INK };
  const PAL = Creature.palette({
    [CREAM]:  { r: ['#c89e62', '#e4c282', '#f7e2a4', '#fdf1c8', '#fffbe8'], od: '#7e5426', ol: '#b0823e', ln: '#b98a48' },
    [RED]:    { r: ['#a01e38', '#cc3048', '#ee4c5c', '#ff7c80', '#ffb4b0'], od: '#580a1c', ol: '#921a30', ln: '#9a2236' },
    [EYE]:    { r: ['#08080e', '#0e0e16', '#161620', '#22222e', '#34344a'], od: '#040408', ol: '#08080e', ln: '#08080e' },
    [GLINT]:  { r: ['#e6e8f0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8c98', ol: '#c4c6d0', ln: '#c4c6d0' },
    [MOUTH]:  { r: ['#541220', '#701c2a', '#8c2c3a', '#a43e4a', '#bc5460'], od: '#34080e', ol: '#541220', ln: '#541220' },
    [TONGUE]: { r: ['#c44a62', '#de667a', '#f28896', '#ffacb4', '#ffd0d4'], od: '#6a1428', ol: '#942038', ln: '#942038' },
    [GLOW]:   { r: ['#f0405a', '#ff6878', '#ff9496', '#ffc4b8', '#fff0e0'], od: '#a01830', ol: '#d83a50', ln: '#d83a50' },
    [SPARK]:  { r: ['#e0a000', '#ffcc1c', '#fff05a', '#fffab0', '#ffffff'], od: '#8a5a00', ol: '#c89000', ln: '#c89000' },
    [INK]:    { r: ['#301818', '#3e2020', '#4c2a28', '#5a3430', '#6a403a'], od: '#1e0c0c', ol: '#301818', ln: '#301818' },
  });
  const GLOSSY = {};
  const C_CREAM = code(CREAM), C_CREAM_D = code(CREAM, -1), C_RED = code(RED), C_RED_L = code(RED, 1), C_EYE = code(EYE), C_GLINT = code(GLINT);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_GLOW = code(GLOW), C_SPARK = code(SPARK), C_SPARK_L = code(SPARK, 2), C_INK = code(INK);
  const M_CREAM = () => C_CREAM, M_RED = () => C_RED;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid centred at c with (unit) local axes X, Y, Z and radii r
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 along its local y axis
  function seg(p0, p1, rx, rz, part, grp, mat, up = [0, 0, 1]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, up);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }
  // orthonormal frame with Y along d and X as close as possible to `fwd`
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }

  let curScale = 1, viewZ = [0, 0, 1]; // view-space z row (set per render) for view-aware ear masks

  /* ---------- head decals (head frame, unit sphere s) ---------- */
  const HR = [13.6, 13.6, 16.2];
  const EYE_AZ = 0.5, EYE_V = 0.19, EYE_RU = 0.16, EYE_RV = 0.26;
  const CH_AZ = 1.13, CH_V = -0.17, CH_R = 0.34;
  const MO_V = -0.15, MO_HW = 0.36, MO_H = 0.74, NOSE_V = -0.03;
  // cheek emblem: a cream "+" (a, b in cheek radii)
  const emblem = (a, b, w) => (Math.abs(a) < w && Math.abs(b) < 0.64) || (Math.abs(b) < w && Math.abs(a) < 0.64);

  function eyePix(u, v, kind, px, sd) {
    const ru = Math.max(EYE_RU, 1.3 * px), rv = Math.max(EYE_RV, 1.8 * px);
    if (kind === 'open') {
      const a = u / ru, b = v / rv;
      if (a * a + b * b >= 1) return 0;
      // glint: upper part of the eye, a touch toward the nose — kept a pixel inside the
      // outline so tiny eyes don't lose their top row
      if (rv > 1.75 * px && ru > 1.15 * px) {
        const gu = -sd * Math.min(0.14 * ru, Math.max(0, ru - 1.4 * px)), gv = Math.min(0.44 * rv, rv - 1.35 * px);
        const gx = (u - gu) / Math.max(0.3 * ru, 0.44 * px), gy = (v - gv) / Math.max(0.3 * rv, 0.5 * px);
        if (gx * gx + gy * gy < 1) return C_GLINT;
      }
      return C_EYE;
    }
    const w = Math.max(0.045, 0.62 * px), a = u / (ru * 1.25);
    if (Math.abs(a) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = rv * 0.2 + rv * 0.55 * (1 - 1.8 * a * a);
    else if (kind === 'blink') yc = -rv * 0.15;
    else yc = -rv * 0.1 - rv * 0.3 * (1 - a * a); // closed: a soft downward curve
    return Math.abs(v - yc) < w ? C_EYE : 0;
  }

  function headMat(kind, mo, spk) {
    return (s) => {
      if (s[0] < -0.15) return C_CREAM;
      const px = 1 / (curScale * HR[1]);
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      // cheeks
      const cu = (az - sd * CH_AZ) * cv, cw = s[1] - CH_V;
      const cr = Math.hypot(cu, cw), R0 = Math.max(CH_R, 2.2 * px);
      if (cr < R0) {
        const big = R0 > 3.6 * px; // room for the emblem?
        const a = cu / R0, b = cw / R0;
        if (big ? emblem(a, b, Math.max(0.19, 0.55 * px / R0)) : cr < 0.9 * px) return spk > 0.65 ? C_SPARK_L : C_CREAM;
        if (spk > 0.65) return C_GLOW;
        return spk > 0.3 ? C_RED_L : C_RED;
      }
      if (s[0] < 0.25) return C_CREAM;
      // eyes
      const eu = (az - sd * EYE_AZ) * cv, ev = s[1] - EYE_V;
      if (Math.abs(ev) < 0.45 && Math.abs(eu) < 0.3) { const e = eyePix(eu, ev, kind, px, sd); if (e) return e; }
      // mouth (centre front)
      const mu = az * cv;
      if (Math.abs(mu) < MO_HW + 0.1) {
        const w = Math.max(0.04, 0.6 * px);
        if (mo > 0.06) {
          const hw = MO_HW * (0.72 + 0.28 * mo), h = Math.max(MO_H * mo, 2.2 * px);
          const top = MO_V + 0.3 * mu * mu; // corners turn up
          const k = mu / hw;
          if (Math.abs(k) < 1) {
            const bot = top - h * Math.sqrt(1 - k * k);
            if (s[1] <= top && s[1] > bot) return s[1] < top - h * 0.52 && Math.abs(k) < 0.72 ? C_TONGUE : C_MOUTH;
          }
        } else {
          // closed smile: the corners turn up about a pixel at game scale
          const hw = 0.22;
          if (Math.abs(mu) < hw && Math.abs(s[1] - (MO_V - 0.07 + 2.4 * mu * mu)) < w) return C_INK;
        }
        // tiny nose (only once there is room for it)
        if (curScale * HR[1] > 11 && Math.abs(mu) < Math.max(0.02, 0.5 * px) && Math.abs(s[1] - NOSE_V) < Math.max(0.018, 0.5 * px)) return C_INK;
      }
      return C_CREAM;
    };
  }

  /* ---------- flat pieces: "+" tail, spark bolts, pom-pom bursts ---------- */
  const TAIL_G = bakeShape({
    bb: [-6.6, -6.6, 6.6, 6.6],
    test: (u, v) => {
      const au = Math.abs(u), av = Math.abs(v), w = 2.05, L = 6.2;
      const inBar = (x, y) => x <= L && y <= w && (x < L - 1.1 || (x - (L - 1.1)) ** 2 + Math.max(0, y - (w - 1.1)) ** 2 <= 1.25);
      return inBar(au, av) || inBar(av, au) ? C_RED : 0;
    },
  });
  const BOLT_PTS = [[0, 0.8], [2.6, 1.7], [2.3, 0.5], [5.6, 1.3], [3.3, -0.9], [3.6, 0.2], [0, -0.8]];
  const BOLT_G = bakeShape({ bb: Shape2D.bbox(BOLT_PTS, 0.5), test: (u, v) => (Shape2D.inPoly(u, v, BOLT_PTS) ? C_SPARK : 0) });
  const starPts = (n, ro, ri) => { const p = []; for (let i = 0; i < 2 * n; i++) { const a = (i * Math.PI) / n, r = i % 2 ? ri : ro; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
  const STAR_P = starPts(7, 7, 3);
  const STAR_G = bakeShape({ bb: Shape2D.bbox(STAR_P, 0.5), test: (u, v) => (!Shape2D.inPoly(u, v, STAR_P) ? 0 : u * u + v * v < 3.2 ? C_SPARK_L : C_SPARK) });

  const DEFAULT = { cheer: 0, jump: 0, step: 0, spark: 0, mouth: 0.7, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // 1 body, 2 head, 3/4 ear bumps, 5/6 ears, 7/8 arms, 9/10 legs, 11 tail stalk, 12 tail, 13/14 pom-poms, 15 sparks
  Object.assign(PRI, { 2: 2, 3: 3, 4: 3, 5: 1, 6: 1, 7: 3, 8: 3, 9: 1, 10: 1, 11: -1, 12: -1, 13: 4, 14: 4, 15: 5 });
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = +P.step || 0, walking = st !== 0;
    const cheer = clamp(+P.cheer || 0, 0, 1), jp = clamp(+P.jump || 0, 0, 1);
    const spk = clamp(+P.spark || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const side = clamp(P.side ?? 1, -1, 1);
    // hop curve: crouch (squash) early, stretch late
    const ksq = jp < 0.45 ? Math.sin((Math.PI * jp) / 0.45) : 0;
    const kst = sstep(0.32, 0.9, jp);
    const bob = walking ? 1.3 * Math.abs(Math.sin(st)) : 0;
    const rock = walking ? 0.07 * Math.sin(st) : 0;
    const sy = 1 - 0.2 * ksq + 0.14 * kst, sxz = 1 + 0.13 * ksq - 0.06 * kst;
    const root = { L: M3.diag(sxz, sy, sxz), t: [0, bob + 1.5 * kst, 0] };
    const body = chain(root, T(0, 9, 0), R(M3.rx(rock)), R(M3.rz(-0.04 + 0.05 * kst - 0.06 * ksq)), T(0, -9, 0));

    // small egg-shaped body, widest low at the belly (the head hides its narrow top)
    const BELLY_C = [0.9, 10, 0];
    prims.push(ellF(chain(body, T(...BELLY_C)), [8.4, 9.9, 8.9], 1, 1, M_CREAM));
    anchors.body = inF(body, BELLY_C);

    // --- head
    const hf = chain(body, T(1.6, 21, 0), R(M3.rx(rock * 0.6)), R(M3.rz(0.04 - 0.1 * ksq + 0.06 * kst)), T(0, 12.2, 0));
    const headPrim = ellF(hf, HR, 2, 2, headMat(P.eyes, mo, spk));
    prims.push(headPrim);
    anchors.head = hf.t;
    const onHead = (az, v) => { const q = Creature.sph(az, v); return inF(hf, [HR[0] * q[0], HR[1] * q[1], HR[2] * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.cheekN = onHead(CH_AZ, CH_V); anchors.cheekF = onHead(-CH_AZ, CH_V);
    anchors.mouth = onHead(0, MO_V - 0.12);

    // --- ears: cream bumps on top of the head, long red ovals splayed in a V
    const splay = 0.72 + 0.14 * ksq - 0.18 * kst + (walking ? 0.05 * Math.sin(2 * st + 0.6) : 0);
    const back = 0.2 + 0.25 * kst - 0.05 * ksq;
    let topY = hf.t[1] + HR[1];
    for (const sd of [1, -1]) {
      const rootL = [-1.2, 10.9, 8.6 * sd];
      const root = inF(hf, rootL);
      prims.push(ellF(chain(hf, T(...rootL)), [4.6, 4.8, 4.6], sd > 0 ? 3 : 4, sd > 0 ? 3 : 4, M_CREAM));
      const dir = dirF(hf, [-Math.sin(back), Math.cos(splay), sd * Math.sin(splay)]);
      const [X, Y, Z] = frameAlong(dir, dirF(hf, [1, 0, 0.1 * sd]));
      const L = 15, id = sd > 0 ? 5 : 6;
      const earMat = (s) => {
        // narrow toward the root: a teardrop leaf, widest two thirds of the way up. The taper
        // fades out as the ear turns edge-on (a surface mask would otherwise hollow it out)
        const t = s[1], face = Math.abs(viewZ[0] * X[0] + viewZ[1] * X[1] + viewZ[2] * X[2]);
        const tp = 1 - (0.42 - 0.42 * sstep(-1, 0.15, t)) * sstep(0.2, 0.55, face);
        return Math.abs(s[2]) > Math.sqrt(Math.max(0, 1 - t * t)) * tp ? 0 : C_RED;
      };
      prims.push(ellAx(add(root, sc(Y, L - 1.4)), X, Y, Z, [2.4, L, 7.1], id, id, earMat));
      const tip = add(root, sc(Y, 2 * L - 1.6));
      anchors[sd > 0 ? 'earN' : 'earF'] = tip;
      topY = Math.max(topY, tip[1]);
    }
    anchors.top = [hf.t[0], topY + 1, 0];

    // --- arms: short cream arms, red mitten paws (cheer raises them; walking swings them)
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const swing = walking ? 0.3 * Math.sin(st + (sd > 0 ? Math.PI : 0)) : 0;
      const el = lerp(-0.34, 0.74, cheer) + 0.5 * kst * (1 - cheer) - 0.45 * ksq + swing;
      const az = lerp(1.22, 1.5, cheer) - 0.25 * ksq;
      const d = dirF(body, [Math.cos(el) * Math.cos(az), Math.sin(el), sd * Math.cos(el) * Math.sin(az)]);
      const sh = inF(body, [1.3, 17.2 + 1.8 * cheer, (5.7 + 2.2 * cheer) * sd]);
      const reach = 1 + 0.12 * cheer;
      prims.push(seg(sh, add(sh, sc(d, 6.4 * reach)), 2.3, 2.3, id, id, M_CREAM));
      const [X, Y, Z] = frameAlong(d, M3.v(body.L, [0, 0, sd]));
      const pc = add(sh, sc(d, 8.6 * reach));
      prims.push(ellAx(pc, X, Y, Z, [2.5, 3.9, 3.0], id, id, M_RED));
      anchors[sd > 0 ? 'pawN' : 'pawF'] = pc;
      // pom-pom of sparks
      const kp = sstep(0.3, 0.85, cheer);
      if (kp > 0.05) {
        const c = add(pc, sc(d, 7.2));
        const s = kp * (0.72 + 0.18 * spk);
        const pid = sd > 0 ? 13 : 14;
        for (const ax of [[X, Y], [Y, Z], [Z, X]]) prims.push(PL(c, M3.cols(sc(ax[0], s), sc(ax[1], s), cross(ax[0], ax[1])), pid, pid, STAR_G, 1.4));
      }
    }

    // --- legs: short stubby legs, rounded feet (crouch bends them, stretch points them down)
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 9 : 10;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 3.2 * Math.sin(ph) : 0;
      const lift = walking ? 2.4 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(body, [0.3, 6.8, 4.1 * sd]);
      const foot = [1.2 + fwd + 0.6 * ksq, 2.2 + lift - 0.6 * kst, (4.4 + 0.8 * ksq - 0.7 * kst) * sd];
      prims.push(seg(hip, add(foot, [0, 0.6, 0]), 3.2, 3.2, id, id, M_CREAM));
      const fr = chain(T(foot[0] + 0.8, foot[1], foot[2]), R(M3.rz(-0.35 * kst + (walking ? 0.25 * Math.sin(ph) : 0))));
      prims.push(ellF(fr, [3.7, 2.3, 3.1], id, id, (s) => (s[1] < -0.62 ? C_CREAM_D : C_CREAM)));
    }

    // --- tail: thin cream stalk and a flat red "+" (turned toward the camera)
    const wag = walking ? 0.2 * Math.sin(st) : 0;
    const t0 = inF(body, [-6, 7.4, 0]);
    const t1 = inF(body, [-14.6, 6.4 + 1.5 * kst, 8 * wag]);
    prims.push(seg(t0, t1, 1.2, 1.2, 11, 11, M_CREAM));
    const th = 0.67 * side;
    const n = [Math.cos(th), 0, Math.sin(th)], u0 = [-Math.sin(th), 0, Math.cos(th)], v0 = [0, 1, 0];
    const tau = 0.28 + wag;
    const U = add(sc(u0, Math.cos(tau)), sc(v0, Math.sin(tau))), Vv = add(sc(u0, -Math.sin(tau)), sc(v0, Math.cos(tau)));
    const tc = add(t1, [-4.2, 1.4, 0]);
    prims.push(PL(tc, M3.cols(U, Vv, n), 12, 12, TAIL_G, 2.6));
    anchors.tail = tc;

    // --- sparks crackling off the cheeks
    if (spk > 0.45) {
      const ks = sstep(0.45, 1, spk);
      for (const sd of [1, -1]) {
        const c = anchors[sd > 0 ? 'cheekN' : 'cheekF'];
        for (const [a, up] of [[0.35, 0.8], [-0.45, -0.3]]) {
          const out = dirF(hf, [0.1, up * 0.6, sd]);
          const [X, Y, Z] = frameAlong(add(out, dirF(hf, [0, a, 0])), dirF(hf, [1, 0, 0]));
          // plate: u along the bolt (Y), v across (Z), normal X
          prims.push(PL(add(c, sc(Y, 1.5)), M3.cols(sc(Y, 0.9 * ks + 0.3), sc(Z, 0.9 * ks + 0.3), X), 15, 15, BOLT_G, 1.2));
        }
      }
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: CREAM, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    const V = M3.mul(M3.rx(opt.pitch ?? 0.16), M3.ry(-(opt.yaw ?? 1.05)));
    viewZ = [V[6], V[7], V[8]];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 108, bh: 104, oy: 0.87 } };
})();
