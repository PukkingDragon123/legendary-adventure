/* ------------------------------------------------------------------
   Azurill — the Polka Dot Pokémon (0.2 m ≈ 35 units tall at scale 1,
   ears included). Marill's baby form. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a tiny glossy light-blue "snowman". A round
   body/head sits on top of its big bouncy blue ball tail, joined to it by
   a thick black zig-zag tail stalk that springs out of its back. Two big
   round mouse ears with pink insides on top, small black oval eyes with
   a white glint, a tiny mouth, a white spot on each cheek and two stubby
   little arms. No visible legs: it bounces around on the ball.

   Pose params:
     walk    radians  hop-along phase: the body bobs with |sin(walk)|, the ball
                      squashes on each landing, the arms flap; 0 = standing
     bounce  0..1     squashes the ball tail (1 = flattened wide under the
                      body's weight, the body sinks onto it); default 0.2
     mouth   0..1     tiny mouth opens (pink tongue)
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    optional, ≈ 3·cos(yaw): the zig-zag stalk swings toward
                      the camera side so it reads (default 1)
   Anchors: top (ear tops), head (= body centre), mouth, eyeN, eyeF, body,
            earN, earF, handN, handF, ball (tail ball centre), tail (stalk
            root), foot (ground contact under the ball).
------------------------------------------------------------------- */
const Azurill = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BLUE = 1, PINK = 2, BLACK = 3, WHITE = 4, EYE = 5, MOUTH = 6, TONGUE = 7, SHINE = 8, EYEBL = 9;
  const MAT = { BLUE, PINK, BLACK, WHITE, EYE, MOUTH, TONGUE, SHINE, EYEBL };
  const PAL = Creature.palette({
    // sampled from the official art: sky blue #66b1e1 (shadow #49a4dc), pink ear insides #cf7ba5
    [BLUE]:   { r: ['#2e7cb4', '#49a4dc', '#66b1e1', '#8ac4ea', '#c0e0f6'], od: '#1c3e56', ol: '#2e6690', ln: '#3478aa' },
    [PINK]:   { r: ['#9a4a74', '#b8628e', '#cf7ba5', '#e09cc0', '#f0c0d8'], od: '#5c1c3e', ol: '#8a3460', ln: '#9a4470' },
    [BLACK]:  { r: ['#14141c', '#1e1e28', '#2a2a36', '#3a3a48', '#565666'], od: '#08080c', ol: '#14141c', ln: '#101016' },
    [WHITE]:  { r: ['#c4dcf0', '#e0eefa', '#f8fcff', '#ffffff', '#ffffff'], od: '#3a6aa0', ol: '#6a98c8', ln: '#80a8d0' },
    [EYE]:    { r: ['#141824', '#141824', '#1c2230', '#1c2230', '#1c2230'], od: '#06080e', ol: '#0c1020', ln: '#0c1020' },
    [EYEBL]:  { r: ['#3a5a84', '#3a5a84', '#48709c', '#48709c', '#48709c'], od: '#06080e', ol: '#0c1020', ln: '#0c1020' },
    [MOUTH]:  { r: ['#5a1828', '#742234', '#8e3044', '#a84256', '#c05868'], od: '#380c18', ol: '#561424', ln: '#561424' },
    [TONGUE]: { r: ['#c04c68', '#da6a84', '#ee8ca2', '#ffb0c0', '#ffd4de'], od: '#6a1430', ol: '#94203e', ln: '#94203e' },
    [SHINE]:  { r: ['#e8eef6', '#f6f9fc', '#ffffff', '#ffffff', '#ffffff'], od: '#606878', ol: '#8890a0', ln: '#8890a0' },
  });
  const GLOSSY = { [BLUE]: 1, [BLACK]: 1 };
  const C_BLUE = code(BLUE), C_PINK = code(PINK), C_BLACK = code(BLACK), C_WHITE = code(WHITE, 1);
  const C_EYE = code(EYE), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_SHINE = code(SHINE, 1), C_EYEBL = code(EYEBL), C_LIP = code(PINK, -1);
  const M_BLUE = () => C_BLUE, M_BLACK = () => C_BLACK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], over = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * over, rz], part, grp, mat);
  }

  let curScale = 1;

  /* ---------- body/head decals (unit sphere s; az 0 = forward) ---------- */
  const BR = [9.6, 10.8, 9.8];
  const EYE_AZ = 0.36, EYE_V = 0.4, MOUTH_V = 0.14, CHEEK_AZ = 0.74, CHEEK_V = 0.02;
  // small black oval eyes with a glint, scale-aware so they stay readable at a few pixels
  function eyePix(ea, eb, sd, kind) {
    const pu = 1 / (curScale * BR[2]), pv = 1 / (curScale * BR[1]);
    const ru = Math.max(0.12, 0.85 * pu), rv = Math.max(0.2, 1.25 * pv);
    const x = ea / ru, y = eb / rv;
    if (Math.abs(x) > 1.3 || Math.abs(y) > 1.3) return 0;
    const lw = Math.max(0.2, 0.7 * pv / rv);
    if (kind === 'happy') return Math.abs(x) < 1.1 && Math.abs(y - (0.3 - 0.9 * x * x)) < lw ? C_EYE : 0;
    if (kind === 'blink') return Math.abs(x) < 1.05 && Math.abs(y + 0.1) < lw ? C_EYE : 0;
    if (kind === 'closed') return Math.abs(x) < 1.05 && Math.abs(y - (-0.3 + 0.6 * x * x)) < lw ? C_EYE : 0;
    if (x * x + y * y > 1) return 0;
    if (ru > 1.7 * pu) {
      const gx = x + 0.25 * sd, gy = y - 0.42, gr = Math.max(0.3, 0.75 * pu / ru);
      if (gx * gx + gy * gy < gr * gr) return C_SHINE;
      if (rv > 3 * pv && y < -0.35 && Math.abs(x) < 0.7) return C_EYEBL;
    }
    return C_EYE;
  }
  function bodyMat(kind, mo) {
    return (s) => {
      if (s[0] < 0.1) return C_BLUE;
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      const cv = Math.sqrt(Math.max(0, 1 - v * v)), sd = az >= 0 ? 1 : -1;
      const pu = 1 / (curScale * BR[2]), pv = 1 / (curScale * BR[1]);
      if (a > 0.1 && a < 0.66 && v > 0.08 && v < 0.75) { const e = eyePix((az - sd * EYE_AZ) * cv, v - EYE_V, sd, kind); if (e) return e; }
      // white cheek spots
      if (a > 0.55 && a < 1.05) {
        const cx = (az - sd * CHEEK_AZ) * cv / Math.max(0.17, 1.2 * pu), cy = (v - CHEEK_V) / Math.max(0.17, 1.2 * pv);
        if (cx * cx + cy * cy < 1) return C_WHITE;
      }
      // tiny mouth: a short line (worried little "-"), or a small open oval
      const u = az * cv;
      if (mo > 0.08) {
        const mx = u / Math.max(0.1 + 0.05 * mo, 1.3 * pu), my = (v - (MOUTH_V - 0.05 * mo)) / Math.max(0.05 + 0.1 * mo, 1.1 * pv);
        if (mx * mx + my * my < 1) return my < -0.1 && mx * mx + (my + 0.6) * (my + 0.6) < 0.5 ? C_TONGUE : C_MOUTH;
      } else if (Math.abs(u) < Math.max(0.13, 1.3 * pu) && Math.abs(v - MOUTH_V - 0.025 * Math.sin(u * 30)) < Math.max(0.03, 0.55 * pv)) return C_LIP;
      return C_BLUE;
    };
  }
  // ear: round flat disc, pink inside on the front face
  // pink oval set low in the round ear
  const earMat = (s) => (s[0] > 0.3 && (s[1] + 0.12) ** 2 / 0.3 + s[2] * s[2] / 0.13 < 1 ? C_PINK : C_BLUE);

  const DEFAULT = { walk: 0, bounce: 0.2, mouth: 0, eyes: 'open', side: 1 };
  // 1 body, 2/3 ears, 4/5 arms, 6 ball, 7 stalk
  const PRI = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 0, 7: -1 };
  const SIZE = 0.82;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const wk = +P.walk || 0, walking = wk !== 0;
    const mo = clamp(+P.mouth || 0, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    // hopping: up in the air mid-hop, the ball squashes as it lands
    const hop = walking ? Math.abs(Math.sin(wk)) : 0;
    let sq = clamp(P.bounce ?? 0.2, 0, 1);
    if (walking) sq = Math.max(sq * 0.5, 0.7 * Math.max(0, Math.cos(wk * 2)) * (1 - hop));
    const lift = 5 * hop;
    const rock = walking ? 0.1 * Math.sin(wk) : 0;

    /* --- ball tail: the big blue ball it sits on --- */
    const BRAD = 10.2;
    const by = BRAD * 0.88 * (1 - 0.38 * sq), bx = BRAD * (1.2 + 0.24 * sq);
    const ball = { L: M3.diag(bx, by, bx), t: [-1.5, by + lift, 0] };
    prims.push(E(ball.t, ball.L, 6, 6, M_BLUE));
    anchors.ball = ball.t;
    anchors.foot = [ball.t[0], lift, 0];

    /* --- body: round, sits on the ball --- */
    const bodyY = 2 * by + 8.6 - 1.2 * sq + lift;
    const bodyF = chain(T(0.5, bodyY, 0), R(M3.rx(rock)), R(M3.rz(walking ? 0.05 * Math.sin(2 * wk) : 0)));
    const bodyPrim = ellF(bodyF, BR, 1, 1, bodyMat(kind, mo));
    prims.push(bodyPrim);
    anchors.body = bodyF.t;
    anchors.head = bodyF.t;
    const onB = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(bodyF, [(BR[0] + out) * q[0], (BR[1] + out) * q[1], (BR[2] + out) * q[2]]); };
    anchors.eyeN = onB(EYE_AZ, EYE_V); anchors.eyeF = onB(-EYE_AZ, EYE_V);
    anchors.mouth = onB(0, MOUTH_V);

    /* --- ears: big round discs on top, splayed out, facing forward --- */
    let top = 0;
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const flop = walking ? 0.12 * Math.cos(wk) : 0;
      const ec = onB(sd * 1.05, 0.74, 1.5);
      const Y = dirF(bodyF, [-0.05, 1, sd * (0.45 + flop)]);
      const [X, Yy, Z] = frameAlong(Y, dirF(bodyF, [1, 0, 0.35 * sd]));
      const c = add(ec, sc(Yy, 2.6));
      prims.push(ellAx(c, X, Yy, Z, [2.2, 5.4, 5.2], id, id, earMat));
      anchors[sd > 0 ? 'earN' : 'earF'] = add(c, sc(Yy, 5.4));
      top = Math.max(top, c[1] + 5.4);
    }
    anchors.top = [anchors.body[0], top, 0];

    /* --- stubby arms --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const flap = walking ? 0.35 * Math.sin(wk + (sd > 0 ? 0 : Math.PI)) : 0;
      const root = onB(sd * 1.0, -0.3, -1);
      const d = dirF(bodyF, [0.55 + 0.3 * mo, -0.75 + flap, sd * 0.45]);
      prims.push(seg(root, add(root, sc(d, 7.5)), 3, 3.2, id, id, M_BLUE, [1, 0, 0], 1.1));
      anchors[sd > 0 ? 'handN' : 'handF'] = add(root, sc(d, 6.5));
    }

    /* --- thick black zig-zag stalk: from the back of the body out and down to the ball --- */
    const zs = 0.35 + 0.65 * Math.abs(side), sg = side >= 0 ? 1 : -1;
    const zz = (k) => sg * zs * k;
    const spring = 1 - 0.3 * sq;
    const rootP = onB(Math.PI, -0.25, -1.5);
    const bt = ball.t;
    const pts = [
      rootP,
      [rootP[0] - 16, rootP[1] + 7 * spring, zz(3)],
      [rootP[0] - 10, rootP[1] - 3 * spring, zz(4.5)],
      [rootP[0] - 21, rootP[1] - 7 * spring, zz(6)],
      [rootP[0] - 10, rootP[1] - 14 * spring, zz(5)],
      [bt[0] - bx * 0.85, bt[1] - by * 0.1, zz(1.5)],
    ];
    for (let i = 0; i < pts.length - 1; i++) prims.push(seg(pts[i], pts[i + 1], 1.0, 1.0, 7, 7, M_BLACK, [0, 1, 0], 1.14));
    anchors.tail = rootP;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim: bodyPrim, pri: PRI, glossy: GLOSSY, baseMat: BLUE, shadowSteps: 12, shadowDepth: 12 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.2, bw: 72, bh: 64, oy: 0.9 } };
})();
