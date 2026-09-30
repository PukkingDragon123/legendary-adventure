/* ------------------------------------------------------------------
   Marill — the Aqua Mouse Pokémon (0.4 m ≈ 70 units tall at scale 1,
   ears included). A posable 3D model rendered straight to pixel art by
   the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a glossy blue ball of a mouse. The round body is
   the whole creature; its lower third is pale grey-white, split off by a
   gentle curve. Two big round ears with red-orange insides on top, big
   black oval eyes with a white glint, a tiny dark nose and a small open
   smile with a pink tongue. Stubby round arms and little round feet. A
   thin black zig-zag tail springs from its back and ends in a blue ball
   (the float that keeps it up in water).

   Pose params:
     walk    radians  waddle phase: the feet step with sin(walk), the body bobs
                      and rocks, arms swing, the tail ball bounces; 0 = standing
     swim    0..1     swimming: the body tips forward and floats, arms reach
                      and paddle forward, feet kick back, the tail ball rises
                      high behind as a float (walk still animates the strokes)
     mouth   0..1     0 = small closed smile … 1 = open smile with tongue
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    optional, ≈ 3·cos(yaw): the tail swings toward the
                      camera side so the zig-zag reads (default 1)
   Anchors: top (ear tops), head (face centre), mouth, eyeN, eyeF, body,
            belly, earN, earF, handN, handF, footN, footF, tail (tail root),
            ball (tail ball centre).
------------------------------------------------------------------- */
const Marill = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BLUE = 1, PALE = 2, EARIN = 3, BLACK = 4, EYE = 5, MOUTH = 6, TONGUE = 7, SHINE = 8;
  const MAT = { BLUE, PALE, EARIN, BLACK, EYE, MOUTH, TONGUE, SHINE };
  const PAL = Creature.palette({
    [BLUE]:   { r: ['#1e62a8', '#3384cc', '#4aa6e4', '#7cc6f2', '#bfe4ff'], od: '#123c78', ol: '#2a62a2', ln: '#2a60a0' },
    [PALE]:   { r: ['#94a2b4', '#b8c4d2', '#dae2ea', '#eef3f8', '#ffffff'], od: '#34506e', ol: '#62789a', ln: '#8090a6' },
    [EARIN]:  { r: ['#96301e', '#b8482e', '#d66448', '#ea866a', '#ffae96'], od: '#521408', ol: '#80281a', ln: '#8e3222' },
    [BLACK]:  { r: ['#14141c', '#1e1e28', '#2a2a36', '#3a3a48', '#565666'], od: '#08080c', ol: '#14141c', ln: '#101016' },
    [EYE]:    { r: ['#0a0e1a', '#0e1220', '#121828', '#182032', '#20283e'], od: '#06080e', ol: '#0a0e1a', ln: '#0a0e1a' },
    [MOUTH]:  { r: ['#561426', '#701e32', '#8a2c42', '#a43e54', '#bc5466'], od: '#380c18', ol: '#561424', ln: '#561424' },
    [TONGUE]: { r: ['#c04c68', '#da6a84', '#ee8ca2', '#ffb0c0', '#ffd4de'], od: '#6a1430', ol: '#94203e', ln: '#94203e' },
    [SHINE]:  { r: ['#e8eef6', '#f6f9fc', '#ffffff', '#ffffff', '#ffffff'], od: '#606878', ol: '#8890a0', ln: '#8890a0' },
  });
  const GLOSSY = { [BLUE]: 1, [BLACK]: 1 };
  const C_BLUE = code(BLUE), C_PALE = code(PALE), C_EARIN = code(EARIN), C_BLACK = code(BLACK);
  const C_EYE = code(EYE), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_SHINE = code(SHINE, 1);
  const M_BLUE = () => C_BLUE, M_BLACK = () => C_BLACK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
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

  /* ---------- body decals (unit sphere s; az 0 = forward) ---------- */
  const BR = [25.5, 25, 26];
  const EYE_AZ = 0.3, EYE_V = 0.2, NOSE_V = 0.06, MOUTH_V = -0.04;
  function eyePix(ea, eb, sd, kind) {
    const pu = 1 / (curScale * BR[2]), pv = 1 / (curScale * BR[1]);
    const ru = Math.max(0.1, 0.75 * pu), rv = Math.max(0.145, 1.05 * pv);
    const x = ea / ru, y = eb / rv;
    if (Math.abs(x) > 1.3 || Math.abs(y) > 1.4) return 0;
    const lw = Math.max(0.2, 0.7 * pv / rv);
    if (kind === 'happy') return Math.abs(x) < 1.1 && Math.abs(y - (0.3 - 0.9 * x * x)) < lw ? C_EYE : 0;
    if (kind === 'blink') return Math.abs(x) < 1.05 && Math.abs(y + 0.1) < lw ? C_EYE : 0;
    if (kind === 'closed') return Math.abs(x) < 1.05 && Math.abs(y - (-0.3 + 0.6 * x * x)) < lw ? C_EYE : 0;
    if (x * x + y * y > 1) return 0;
    if (ru > 1.7 * pu) {
      const gx = x + 0.28 * sd, gy = y - 0.4, gr = Math.max(0.3, 0.75 * pu / ru);
      if (gx * gx + gy * gy < gr * gr) return C_SHINE;
    }
    return C_EYE;
  }
  // pale lower third: the boundary dips a little toward the front and back, rises at the sides
  const paleLine = (az) => -0.36 + 0.06 * Math.sin(az) ** 2;
  function bodyMat(kind, mo) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      if (v < paleLine(az)) return C_PALE;
      if (s[0] < 0.2) return C_BLUE;
      const cv = Math.sqrt(Math.max(0, 1 - v * v)), sd = az >= 0 ? 1 : -1;
      const pu = 1 / (curScale * BR[2]), pv = 1 / (curScale * BR[1]);
      const u = az * cv;
      if (a > 0.08 && a < 0.55 && v > 0.0 && v < 0.42) { const e = eyePix((az - sd * EYE_AZ) * cv, v - EYE_V, sd, kind); if (e) return e; }
      // tiny nose
      const nx = u / Math.max(0.035, 0.6 * pu), ny = (v - NOSE_V) / Math.max(0.025, 0.55 * pv);
      if (nx * nx + ny * ny < 1) return C_EYE;
      // smile: a small "w"-ish curve closed, a round open mouth with a pink tongue
      if (Math.abs(u) < 0.2 && v < MOUTH_V + 0.04 && v > MOUTH_V - 0.25) {
        const hw = Math.max(0.1, 2.2 * pu);
        const k = u / hw;
        if (mo > 0.08) {
          const h = Math.max(0.08 + 0.12 * mo, 2.2 * pv);
          const top = MOUTH_V;
          if (Math.abs(k) < 1 && v < top && v > top - h * Math.sqrt(1 - k * k)) return v < top - h * 0.5 ? C_TONGUE : C_MOUTH;
        } else if (Math.abs(k) < 1 && Math.abs(v - (MOUTH_V - 0.02 + 0.03 * k * k)) < Math.max(0.018, 0.55 * pv)) return C_MOUTH;
      }
      return C_BLUE;
    };
  }
  // ear: round flat disc, red-orange inside on the front face
  const earMat = (s) => (s[0] > 0.25 && s[1] * s[1] + s[2] * s[2] < 0.56 ? C_EARIN : C_BLUE);

  const DEFAULT = { walk: 0, swim: 0, mouth: 0.4, eyes: 'open', side: 1 };
  // 1 body, 2/3 ears, 4/5 arms, 6/7 feet, 8 tail, 9 tail ball
  const PRI = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 0, 7: 0, 8: -1, 9: 0 };
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const wk = +P.walk || 0, walking = wk !== 0;
    const sw = clamp(+P.swim || 0, 0, 1);
    const mo = clamp(P.mouth ?? 0.4, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 2 * Math.abs(Math.sin(wk)) * (1 - sw) : 0;
    const rock = walking ? 0.08 * Math.sin(wk) * (1 - sw) : 0;
    const tip = -0.35 * sw; // swimming: tips forward

    /* --- body: the ball --- */
    const bodyF = chain(T(0, 31 + bob - 4 * sw, 0), R(M3.rx(rock)), R(M3.rz(tip)));
    const bodyPrim = ellF(bodyF, BR, 1, 1, bodyMat(kind, mo));
    prims.push(bodyPrim);
    const onB = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(bodyF, [(BR[0] + out) * q[0], (BR[1] + out) * q[1], (BR[2] + out) * q[2]]); };
    anchors.body = bodyF.t;
    anchors.head = onB(0, 0.15, -8);
    anchors.belly = onB(0, -0.55);
    anchors.eyeN = onB(EYE_AZ, EYE_V); anchors.eyeF = onB(-EYE_AZ, EYE_V);
    anchors.mouth = onB(0, MOUTH_V - 0.1);

    /* --- ears: big round discs on top, set wide, facing forward --- */
    let top = 0;
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const flop = walking ? 0.06 * Math.cos(wk) : 0;
      const ec = onB(sd * 1.2, 0.72, 1);
      const Y = dirF(bodyF, [-0.1, 1, sd * (0.62 + flop)]);
      const [X, Yy, Z] = frameAlong(Y, dirF(bodyF, [1, 0, 0.45 * sd]));
      const c = add(ec, sc(Yy, 5.5));
      prims.push(ellAx(c, X, Yy, Z, [4.2, 11.8, 12.6], id, id, earMat));
      anchors[sd > 0 ? 'earN' : 'earF'] = add(c, sc(Yy, 11.8));
      top = Math.max(top, c[1] + 10.8);
    }
    anchors.top = [bodyF.t[0], top, 0];

    /* --- stubby arms --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const ph = wk + (sd > 0 ? Math.PI : 0);
      const swing = walking ? 0.35 * Math.sin(ph) : 0;
      const root = onB(sd * 1.15, -0.12, -4);
      const stroke = walking ? Math.sin(ph) : 0;
      const d = nrm(add(sc(dirF(bodyF, [0.5 + swing, -0.35, sd * 0.8]), 1 - sw), sc(dirF(bodyF, [0.9 + 0.4 * stroke, 0.1, sd * 0.45]), sw)));
      const hand = add(root, sc(d, 12));
      prims.push(seg(root, hand, 5.2, 5.6, id, id, M_BLUE, [1, 0, 0], 1.1));
      anchors[sd > 0 ? 'handN' : 'handF'] = hand;
    }

    /* --- little round feet --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 5 * Math.sin(ph) * (1 - sw) : 0;
      const lift = walking ? 3 * Math.max(0, Math.cos(ph)) * (1 - sw) : 0;
      const kick = walking ? 4 * Math.sin(ph) * sw : 0;
      const stand = [5 + fwd, 5.2 + lift, sd * 11];
      const swimP = inF(bodyF, [-12 + kick, -24, sd * 11]);
      const c = [lerp(stand[0], swimP[0], sw), lerp(stand[1], swimP[1], sw), lerp(stand[2], swimP[2], sw)];
      const f = chain(T(...c), R(M3.ry(-sd * 0.2)), R(M3.rz((walking ? 0.2 * Math.sin(ph) : 0) + 0.9 * sw)));
      prims.push(ellF(f, [8.5, 5.4, 6.6], id, id, M_BLUE));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(f, [0, -5.4, 0]);
    }

    /* --- thin black zig-zag tail with the blue ball float --- */
    const zs = 0.3 + 0.7 * Math.abs(side), sg = side >= 0 ? 1 : -1;
    const bounceT = walking ? 2.5 * Math.sin(2 * wk) : 0;
    const rootP = onB(Math.PI, -0.3, -1);
    // zig-zag rising up and back from the lower back (in world space; higher when swimming)
    const up = lerp(1, 1.35, sw);
    const zig = [[0, 0, 0], [-9, 4, 0.25], [-6, 8, 0.35], [-15, 11, 0.55], [-12, 15, 0.7], [-21, 18, 0.85], [-19, 22, 1]];
    const pts = zig.map(([dx, dy, k]) => [rootP[0] + dx - 3 * sw * k * 3, rootP[1] + (dy * up + bounceT * k), rootP[2] + sg * zs * 8 * k]);
    for (let i = 0; i < pts.length - 1; i++) prims.push(seg(pts[i], pts[i + 1], 1.1, 1.1, 8, 8, M_BLACK, [0, 1, 0], 1.2));
    const last = pts[pts.length - 1], dirT = nrm(sub(last, pts[pts.length - 2]));
    const BALL = 12.5;
    const bc = add(last, sc(nrm(add(dirT, [-0.5, 0.5, 0])), BALL - 1));
    prims.push(E(bc, M3.diag(BALL, BALL, BALL), 9, 9, M_BLUE));
    anchors.tail = rootP;
    anchors.ball = bc;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim: bodyPrim, pri: PRI, glossy: GLOSSY, baseMat: BLUE, shadowSteps: 14, shadowDepth: 18 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 130, bh: 104, oy: 0.9 } };
})();
