/* ------------------------------------------------------------------
   Azumarill — the Aqua Rabbit Pokémon (0.8 m ≈ 140 units tall at scale 1,
   ear tips included). Marill's evolution. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a glossy blue egg-shaped body, wider at the
   bottom, whose lower third is pale grey-white with a wavy (water-surface)
   edge. White bubble spots of different sizes are scattered over the
   blue belly just above the wave. Two long rabbit ears with pink-red
   insides stand on top; the far one flops over sideways near its tip.
   Small dark eyes with a glint high on the egg, a tiny nose and an open
   smile with a pink tongue. Tube-like arms held out to the sides, oval
   feet, and a black zig-zag tail with a small blue ball at its end.

   Pose params:
     walk    radians  waddle phase: the feet step with sin(walk), the body bobs
                      and rocks, the arms swing, the ears bounce; 0 = standing
     swim    0..1     swimming: the body tips forward and floats, arms reach
                      and paddle forward, feet kick back, ears sweep back, the
                      tail ball rises as a float (walk still animates strokes)
     mouth   0..1     0 = closed smile … 1 = wide-open smile with tongue
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    optional, ≈ 3·cos(yaw): the tail swings toward the camera
                      side so the zig-zag reads (default 1)
   Anchors: top (upright ear tip), head (face centre), mouth, eyeN, eyeF,
            body, belly, earN, earF (ear tips), handN, handF, footN, footF,
            tail (tail root), ball (tail ball centre).
------------------------------------------------------------------- */
const Azumarill = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BLUE = 1, PALE = 2, EARIN = 3, BLACK = 4, EYE = 5, MOUTH = 6, TONGUE = 7, SHINE = 8, SPOT = 9;
  const MAT = { BLUE, PALE, EARIN, BLACK, EYE, MOUTH, TONGUE, SHINE, SPOT };
  const PAL = Creature.palette({
    [BLUE]:   { r: ['#1a5a9e', '#2c7cc2', '#4299da', '#72bcee', '#b8e0ff'], od: '#10386e', ol: '#285c9c', ln: '#285a98' },
    [PALE]:   { r: ['#94a2b4', '#b8c4d2', '#dae2ea', '#eef3f8', '#ffffff'], od: '#34506e', ol: '#62789a', ln: '#8090a6' },
    [EARIN]:  { r: ['#a43a4e', '#c45464', '#e0707c', '#f0949c', '#ffbcc0'], od: '#5a1424', ol: '#8a2a3c', ln: '#9a3a4a' },
    [BLACK]:  { r: ['#14141c', '#1e1e28', '#2a2a36', '#3a3a48', '#565666'], od: '#08080c', ol: '#14141c', ln: '#101016' },
    [EYE]:    { r: ['#1a0e0c', '#221410', '#2c1a14', '#38221a', '#442c22'], od: '#0c0606', ol: '#1a0e0c', ln: '#1a0e0c' },
    [MOUTH]:  { r: ['#561426', '#701e32', '#8a2c42', '#a43e54', '#bc5466'], od: '#380c18', ol: '#561424', ln: '#561424' },
    [TONGUE]: { r: ['#c04c68', '#da6a84', '#ee8ca2', '#ffb0c0', '#ffd4de'], od: '#6a1430', ol: '#94203e', ln: '#94203e' },
    [SHINE]:  { r: ['#e8eef6', '#f6f9fc', '#ffffff', '#ffffff', '#ffffff'], od: '#606878', ol: '#8890a0', ln: '#8890a0' },
    [SPOT]:   { r: ['#b8cce0', '#dce8f4', '#f6fafe', '#ffffff', '#ffffff'], od: '#2a5a90', ol: '#5a88bc', ln: '#6a94c4' },
  });
  const GLOSSY = { [BLUE]: 1, [BLACK]: 1 };
  const C_BLUE = code(BLUE), C_PALE = code(PALE), C_EARIN = code(EARIN), C_BLACK = code(BLACK), C_SPOT = code(SPOT, 1);
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

  /* ---------- egg body: two half-ellipsoids sharing the equator (wide bottom) ----------
     decals are computed from (az, y) with y = height above the equator in model units */
  const EQ = 42, RX = 37, RZ = 39, R_LO = 38, R_UP = 50;
  const EYE_AZ = 0.28, EYE_Y = 30, NOSE_Y = 24, MOUTH_Y = 20;
  // bubble spots on the blue belly (az, y, radius); mirrored pairs, a little uneven like the art
  const SPOTS = [[0.3, 4, 6.8], [-0.34, 6, 6], [0.8, 10, 5.6], [-0.78, 1, 6.4], [1.2, -1, 4.2], [-1.2, 12, 3.6],
    [0.52, 17, 3.4], [-0.62, 17, 3.8], [1.12, 17, 2.8]];
  const waveY = (az) => -12 + 2.6 * Math.sin(az * 6.2 + 0.6) + 1.2 * Math.sin(az * 11 + 1.3);
  function eyePix(ea, eb, sd, kind) {
    // ea, eb in model units on the surface
    const p = 1 / curScale;
    const ru = Math.max(3, 0.8 * p), rv = Math.max(4, 1.1 * p);
    const x = ea / ru, y = eb / rv;
    if (Math.abs(x) > 1.3 || Math.abs(y) > 1.4) return 0;
    const lw = Math.max(0.2, 0.7 * p / rv);
    if (kind === 'happy') return Math.abs(x) < 1.1 && Math.abs(y - (0.3 - 0.9 * x * x)) < lw ? C_EYE : 0;
    if (kind === 'blink') return Math.abs(x) < 1.05 && Math.abs(y + 0.1) < lw ? C_EYE : 0;
    if (kind === 'closed') return Math.abs(x) < 1.05 && Math.abs(y - (-0.3 + 0.6 * x * x)) < lw ? C_EYE : 0;
    if (x * x + y * y > 1) return 0;
    if (ru > 1.7 * p) {
      const gx = x + 0.28 * sd, gy = y - 0.4, gr = Math.max(0.3, 0.75 * p / ru);
      if (gx * gx + gy * gy < gr * gr) return C_SHINE;
    }
    return C_EYE;
  }
  function eggMat(upper, kind, mo) {
    const RY = upper ? R_UP : R_LO;
    return (s) => {
      if (upper ? s[1] < -0.02 : s[1] > 0.02) return 0;
      const y = RY * s[1], az = Math.atan2(s[2], s[0]), a = Math.abs(az);
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const rh = cv * Math.hypot(RX * Math.cos(az), RZ * Math.sin(az)); // horizontal radius here
      if (y < waveY(az)) return C_PALE;
      if (a > 1.6) return C_BLUE;
      const p = 1 / curScale;
      // spots
      if (y < 26) for (const [sa, sy, r] of SPOTS) {
        const du = (az - sa) * rh, dv = y - sy, rr = Math.max(r, 0.9 * p);
        if (du * du + dv * dv < rr * rr) return C_SPOT;
      }
      if (!upper) return C_BLUE;
      const u = az * rh, sd = az >= 0 ? 1 : -1;
      if (a < 0.6 && Math.abs(y - EYE_Y) < 6) { const e = eyePix((az - sd * EYE_AZ) * rh, y - EYE_Y, sd, kind); if (e) return e; }
      // nose
      const nx = u / Math.max(1.3, 0.6 * p), ny = (y - NOSE_Y) / Math.max(1, 0.55 * p);
      if (nx * nx + ny * ny < 1) return C_EYE;
      // smile
      if (Math.abs(u) < 9 && y < MOUTH_Y + 1.5 && y > MOUTH_Y - 12) {
        const hw = Math.max(5 + 1.5 * mo, 2.2 * p), k = u / hw;
        if (mo > 0.08) {
          const h = Math.max(3 + 6 * mo, 2.2 * p);
          if (Math.abs(k) < 1 && y < MOUTH_Y + 0.8 * k * k && y > MOUTH_Y - h * Math.sqrt(1 - k * k)) return y < MOUTH_Y - h * 0.5 && Math.abs(k) < 0.75 ? C_TONGUE : C_MOUTH;
        } else if (Math.abs(k) < 1 && Math.abs(y - (MOUTH_Y - 1.5 + 1.5 * k * k)) < Math.max(0.6, 0.55 * p)) return C_MOUTH;
      }
      return C_BLUE;
    };
  }
  // long ear segment: thin flat ellipsoid (x = thickness, facing forward), pink-red inside at the front
  const earMat = (k0, k1) => (s) => (s[0] > 0.42 && Math.abs(s[2]) < 0.5 && s[1] > k0 && s[1] < k1 ? C_EARIN : C_BLUE);

  const DEFAULT = { walk: 0, swim: 0, mouth: 0.5, eyes: 'open', side: 1 };
  // 1 body, 2/3 ears, 4/5 arms, 6/7 feet, 8 tail, 9 tail ball
  const PRI = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 0, 7: 0, 8: -1, 9: 0 };
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const wk = +P.walk || 0, walking = wk !== 0;
    const sw = clamp(+P.swim || 0, 0, 1);
    const mo = clamp(P.mouth ?? 0.5, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 3 * Math.abs(Math.sin(wk)) * (1 - sw) : 0;
    const rock = walking ? 0.07 * Math.sin(wk) * (1 - sw) : 0;
    const tip = -0.4 * sw;

    /* --- egg body --- */
    const bodyF = chain(T(0, 8 + bob - 4 * sw, 0), R(M3.rx(rock)), R(M3.rz(tip)), T(0, EQ, 0));
    const lo = ellF(bodyF, [RX, R_LO, RZ], 1, 1, eggMat(false, kind, mo));
    const up = ellF(bodyF, [RX, R_UP, RZ], 1, 1, eggMat(true, kind, mo));
    prims.push(lo, up);
    const onUp = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(bodyF, [(RX + out) * q[0], (R_UP + out) * q[1], (RZ + out) * q[2]]); };
    const vAt = (y) => y / R_UP;
    anchors.body = bodyF.t;
    anchors.head = onUp(0, vAt(EYE_Y), -14);
    anchors.belly = inF(bodyF, [RX, -8, 0]);
    anchors.eyeN = onUp(EYE_AZ, vAt(EYE_Y)); anchors.eyeF = onUp(-EYE_AZ, vAt(EYE_Y));
    anchors.mouth = onUp(0, vAt(MOUTH_Y - 4));

    /* --- long rabbit ears: the near one stands, the far one flops over near its tip --- */
    let topY = -1e9;
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const bounce = walking ? 0.08 * Math.sin(wk * 2 + (sd > 0 ? 0 : 1)) : 0;
      const base = onUp(sd * 0.72, 0.84, -3);
      const d1 = dirF(bodyF, [-0.12 - 0.9 * sw, 1, sd * (0.32 + bounce)]);
      const fwd = dirF(bodyF, [1, 0, 0.35 * sd]);
      const mid = add(base, sc(d1, 27));
      let tipP;
      if (sd > 0) {
        // the standing ear: one long leaf, narrow at the base
        tipP = add(base, sc(nrm(add(d1, dirF(bodyF, [0, 0, bounce]))), 55));
        prims.push(seg(base, tipP, 4.6, 10.6, id, id, earMat(-0.62, 0.84), fwd, 1.06));
      } else {
        // the floppy ear: bends over sideways near halfway
        const flop = 1.25 + 3 * bounce;
        const d2 = nrm(add(sc(d1, Math.cos(flop)), sc(dirF(bodyF, [0, 0, sd]), Math.sin(flop))));
        tipP = add(mid, sc(d2, 27));
        prims.push(seg(base, mid, 4.6, 9.6, id, id, earMat(-0.55, 1.2), fwd, 1.12));
        prims.push(seg(mid, tipP, 4.6, 10.8, id, id, earMat(-1.2, 0.72), fwd, 1.12));
      }
      anchors[sd > 0 ? 'earN' : 'earF'] = tipP;
      topY = Math.max(topY, tipP[1] + 3);
    }
    anchors.top = [anchors.earN[0], topY, anchors.earN[2]];

    /* --- tube arms held out --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const ph = wk + (sd > 0 ? Math.PI : 0);
      const swing = walking ? 0.3 * Math.sin(ph) : 0;
      const root = inF(bodyF, [4, 8, sd * (RZ - 7)]);
      const stroke = walking ? Math.sin(ph) : 0;
      const d = nrm(add(sc(dirF(bodyF, [0.35 + swing, -0.3, sd * 0.9]), 1 - sw), sc(dirF(bodyF, [0.9 + 0.4 * stroke, 0.1, sd * 0.45]), sw)));
      const hand = add(root, sc(d, 30));
      prims.push(seg(root, hand, 6.4, 7, id, id, M_BLUE, [1, 0, 0], 1.06));
      anchors[sd > 0 ? 'handN' : 'handF'] = hand;
    }

    /* --- oval feet --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 7 * Math.sin(ph) * (1 - sw) : 0;
      const lift = walking ? 4 * Math.max(0, Math.cos(ph)) * (1 - sw) : 0;
      const kick = walking ? 6 * Math.sin(ph) * sw : 0;
      const stand = [10 + fwd, 6.8 + lift, sd * 17];
      const swimP = inF(bodyF, [-20 + kick, -36, sd * 16]);
      const c = [lerp(stand[0], swimP[0], sw), lerp(stand[1], swimP[1], sw), lerp(stand[2], swimP[2], sw)];
      const f = chain(T(...c), R(M3.ry(-sd * 0.25)), R(M3.rz((walking ? 0.2 * Math.sin(ph) : 0) + 0.9 * sw)));
      prims.push(ellF(f, [15, 7, 10], id, id, M_BLUE));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(f, [0, -7, 0]);
    }

    /* --- black zig-zag tail running back low, small blue ball --- */
    const zs = 0.3 + 0.7 * Math.abs(side), sg = side >= 0 ? 1 : -1;
    const bounceT = walking ? 2 * Math.sin(2 * wk) : 0;
    const rootP = inF(bodyF, [-RX + 3, -24, 0]);
    const zig = [[0, 0, 0], [-6, 6, 0.2], [-12, -1, 0.4], [-18, 6, 0.6], [-24, -1, 0.8], [-30, 5, 1]];
    const pts = zig.map(([dx, dy, k]) => [rootP[0] + dx, rootP[1] + dy + (bounceT + 30 * sw) * k, rootP[2] + sg * zs * 12 * k]);
    for (let i = 0; i < pts.length - 1; i++) prims.push(seg(pts[i], pts[i + 1], 1.6, 1.6, 8, 8, M_BLACK, [0, 1, 0], 1.18));
    const last = pts[pts.length - 1];
    const BALL = 9;
    const bc = add(last, [-BALL + 1.5, 1, 0]);
    prims.push(E(bc, M3.diag(BALL, BALL, BALL), 9, 9, M_BLUE));
    anchors.tail = rootP;
    anchors.ball = bc;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim: up, pri: PRI, glossy: GLOSSY, baseMat: BLUE, shadowSteps: 14, shadowDepth: 22 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.8, bw: 190, bh: 180, oy: 0.9 } };
})();
