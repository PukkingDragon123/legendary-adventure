/* ------------------------------------------------------------------
   Wynaut — the Bright Pokémon (0.6 m ≈ 105 units at scale 1, feet to
   the forehead knob). A posable 3D model rendered straight to pixel art
   by the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a small light-blue blob. A big round head (most
   of its height) with a little bulbous knob on the forehead, closed
   eyes that each curve up to a point (^ ^), and a huge happy grin with a
   serrated (zig-zag) upper jaw, a dark mouth and a pink tongue. Long,
   ear-like fingerless arms hang from the sides of the head, widening to
   rounded paddle tips. The fur of the short body ends in a zig-zag hem
   over two stubby legs. A long, thin, all-black tail ends in a round,
   flattened tip with a white eye-like spot.

   Pose parameters (all optional):
     eyes    'open' (default: the official closed ^ ^ eyes) | 'happy' (bold
             rounded arcs) | 'closed' (sleepy downward curves) | 'blink'
     mouth   0..1     0 = closed smile … 1 = huge open grin (default 0.85, as
                      in the official art)
     walk    radians  waddle phase: the stubby legs step in turn (sin(walk)),
                      the body bobs and rocks, the arms flop, the tail wags;
                      exactly 0 = standing still
     sway    −1..1    the happy side-to-side sway: the whole body leans (pivot at
                      the feet, + = toward its near side / +z), squashes a
                      little, the arms and the tail swing out the other way
                      (animate sway = sin(t) for the bobbing dance)
     arms    −1..1    −1 = arms tucked against the head, 0 = hanging (default),
                      1 = both arms raised high (the "Wyyy-naut!" cheer)
     side    −1..1    ≈ cos(yaw), passed by the game: the tail sweeps toward the
                      camera side so its eye-spot tip always shows

   Anchors: top (knob top), head (head centre), mouth, eyeN, eyeF, body (lower
   body centre), armN / armF (arm tips), knob, tail (centre of the eye-spot tip),
   footN / footF.
------------------------------------------------------------------- */
const Wynaut = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BLUE = 1, BLACK = 2, WHITE = 3, INK = 4, MOUTH = 5, TONGUE = 6;
  const MAT = { BLUE, BLACK, WHITE, INK, MOUTH, TONGUE };
  const PAL = Creature.palette({
    // sampled from the official art: aqua #7dc8cf (shadow #69bbbd, light #b2dce2), brick-red mouth #a55051, pale tongue #f5c0bb
    [BLUE]:   { r: ['#4c9ea4', '#69bbbd', '#7dc8cf', '#a2d8de', '#cceef0'], od: '#1c4e54', ol: '#3a8088', ln: '#3e8a90' },
    [BLACK]:  { r: ['#15161c', '#1f2029', '#2c2e3a', '#3e4150', '#5c6070'], od: '#08080c', ol: '#15161c', ln: '#101118' },
    [WHITE]:  { r: ['#c6ccd8', '#e4e8f0', '#fbfcfe', '#ffffff', '#ffffff'], od: '#4a5060', ol: '#7a8090', ln: '#7a8090' },
    [INK]:    { r: ['#0e1420', '#121a28', '#182232', '#202c40', '#2a384e'], od: '#060a12', ol: '#0e1420', ln: '#0e1420' },
    [MOUTH]:  { r: ['#6a2a2e', '#86383c', '#a55051', '#b86462', '#c87874'], od: '#3a1014', ol: '#5a1c20', ln: '#5a1c20' },
    [TONGUE]: { r: ['#d08c8a', '#e4a4a0', '#f5c0bb', '#fad2ce', '#fde4e0'], od: '#6a2a2e', ol: '#8a3a3e', ln: '#8a3a3e' },
  });
  const GLOSSY = {};
  const C_BLUE = code(BLUE), C_BLUE_D = code(BLUE, -1), C_BLACK = code(BLACK), C_WHITE = code(WHITE);
  const C_INK = code(INK), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_PUPIL = code(BLACK, -1);
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
  // orthonormal frame with Y along d and X as close as possible to `fwd`
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  // ellipsoid spanning p0 → p1 along its local y axis
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], over = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * over, rz], part, grp, mat);
  }
  const tri = (x) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1); // 0 at integers, 1 halfway

  let curScale = 1;

  /* ---------- head decals (head frame, unit sphere s) ---------- */
  const HR = [33, 32, 34];
  const EYE_AZ = 0.4, EYE_V = 0.34, EYE_RU = 0.19, EYE_RV = 0.12;
  const MO_TOP = 0.05, MO_HW = 0.62, MO_H = 0.84;

  // closed eyes: 'open' = the official ^ (two curved strokes meeting in a point)
  function eyePix(a, b, kind, px) {
    const ru = Math.max(EYE_RU, 2.2 * px), rv = Math.max(EYE_RV, 1.6 * px);
    const t = Math.abs(a) / ru;
    if (t > 1) return 0;
    const w = Math.max(0.036, 0.7 * px) * (kind === 'happy' ? 1.35 : 1);
    let yc, slope;
    if (kind === 'open') { yc = rv * (0.6 - 1.2 * t); slope = 1.2 * rv / ru; } // sharp ∧ chevron
    else if (kind === 'happy') { yc = rv * (0.55 - 1.1 * t * t); slope = 2.2 * t * rv / ru; }
    else if (kind === 'closed') { yc = rv * (-0.35 + 0.7 * t * t); slope = 1.4 * t * rv / ru; }
    else { yc = -rv * 0.05; slope = 0; }
    return Math.abs(b - yc) / Math.sqrt(1 + slope * slope) < w ? C_INK : 0;
  }

  function headMat(kind, mo) {
    return (s) => {
      if (s[0] < 0.2) return C_BLUE;
      const px = 1 / (curScale * HR[1]);
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      // eyes
      const ea = (az - sd * EYE_AZ) * cv, eb = s[1] - EYE_V;
      if (Math.abs(ea) < 0.3 && Math.abs(eb) < 0.25) { const e = eyePix(ea, eb, kind, px); if (e) return e; }
      // the big grin
      const u = az * cv;
      if (Math.abs(u) < MO_HW + 0.06 && s[1] < MO_TOP + 0.12) {
        const k = u / MO_HW;
        const top = MO_TOP + 0.16 * k * k;
        if (mo > 0.06) {
          if (Math.abs(k) >= 1) return C_BLUE;
          const h = Math.max(MO_H * (0.35 + 0.65 * mo), 3 * px);
          const bot = top - h * Math.sqrt(1 - k * k);
          if (s[1] > top || s[1] < bot) return C_BLUE;
          // serrated upper jaw: blue teeth hanging from the top edge (only when they read)
          const n = Math.min(4, Math.floor((2 * MO_HW) / (4.2 * px)));
          if (n >= 3) {
            const depth = Math.max(0.13, 2.1 * px) * Math.min(1, 0.4 + mo);
            const ph = ((k + 1) / 2) * n + 0.5;
            if (s[1] > top - depth * tri(ph)) return C_BLUE;
          }
          // pink tongue in the bottom of the mouth
          const tk = u / (MO_HW * 0.62), tb = (s[1] - (top - h)) / (h * 0.5);
          if (tk * tk + tb * tb < 1 && h > 5 * px) return C_TONGUE;
          return C_MOUTH;
        }
        // closed: a wide smile line
        if (Math.abs(k) < 0.9 && Math.abs(s[1] - (top - 0.14 + 0.1 * k * k)) < Math.max(0.03, 0.6 * px)) return C_MOUTH;
      }
      return C_BLUE;
    };
  }

  // tail tip: round flattened disc, black with a white eye-like spot (both faces)
  function tipMat(s) {
    if (Math.abs(s[2]) < 0.45) return C_BLACK;
    const r2 = s[0] * s[0] + s[1] * s[1];
    const px = 1 / (curScale * 8.5);
    if (r2 < Math.max(0.36, 3.2 * px * px)) {
      const pr = Math.max(0.3, 1.1 * px);
      return r2 < pr * pr ? C_PUPIL : C_WHITE;
    }
    return C_BLACK;
  }

  const DEFAULT = { eyes: 'open', mouth: 0.85, walk: 0, sway: 0, arms: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 24; i++) PRI[i] = 0;
  // 1 lower body, 2 head, 3 knob, 4/5 arms, 6/7 legs, 8 tail, 9 tail tip
  Object.assign(PRI, { 1: 0, 2: 2, 3: 1, 4: 3, 5: 3, 6: -1, 7: -1, 8: -2, 9: -1 });
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const sw = clamp(+P.sway || 0, -1, 1), armsUp = clamp(+P.arms || 0, -1, 1);
    const mo = clamp(P.mouth ?? 0.85, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 1.6 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.07 * Math.sin(wk) : 0;
    // the sway leans the whole blob about the feet and squashes it a little at the ends
    const lean = 0.25 * sw + rock;
    const sq = 0.05 * Math.abs(sw);
    const root = chain({ L: M3.diag(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5), t: [0, bob, 0] }, R(M3.rx(lean)));

    // --- lower body with the zig-zag fur hem over the legs
    // a short skirt-like body: the upper half of an egg, widest at the zig-zag hem
    const BC = [0, 15, 0], BR = [17.5, 22, 19.5];
    const bodyF = chain(root, T(...BC));
    prims.push(ellF(bodyF, BR, 1, 1, (s) => {
      const az = Math.atan2(s[2], s[0]);
      const hem = -0.02 - 0.26 * tri((az / (2 * Math.PI)) * 10 + 0.5);
      return s[1] < hem ? 0 : C_BLUE;
    }));
    anchors.body = bodyF.t;

    // --- head
    const hf = chain(root, T(2, 62, 0), R(M3.rx(-0.25 * lean)), R(M3.rz(walking ? 0.03 * Math.sin(2 * wk) : 0)));
    const headPrim = ellF(hf, HR, 2, 2, headMat(P.eyes, mo));
    prims.push(headPrim);
    anchors.head = hf.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(hf, [(HR[0] + out) * q[0], (HR[1] + out) * q[1], (HR[2] + out) * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, MO_TOP - 0.22);

    // --- the bulbous knob on the forehead
    // big rounded lobe rising from the crown, leaning back
    // a big droplet lobe growing out of the crown and flopping over to one side and back (official art)
    const kf = chain(hf, T(-5, HR[1] - 6, 2), R(M3.rx(0.78)), R(M3.rz(0.42)));
    prims.push(ellF(chain(kf, T(0, 20, 0)), [14, 25, 16.5], 3, 3, M_BLUE));
    anchors.knob = inF(kf, [0, 20, 0]);
    anchors.top = inF(kf, [0, 45, 0]);

    // --- ear-like arms: hang from the upper sides of the head, widening to paddle tips
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const flop = walking ? 0.16 * Math.sin(wk + (sd > 0 ? 0 : Math.PI)) : 0;
      // spread angle from straight down (in the head's side plane): hanging ≈ 0.62, raised ≈ 2.5
      let ang = armsUp >= 0 ? lerp(0.42, 2.5, armsUp) : lerp(0.42, 0.18, -armsUp);
      ang += -0.3 * sw * sd + flop;        // inertia: the arms swing out opposite to the lean
      const root0 = onHead(sd * 1.5, 0.46, -3);
      const d = dirF(hf, [-0.1 + 0.08 * armsUp, -Math.cos(ang), sd * Math.sin(ang)]);
      // flat like an ear: the broad face looks forward and a little outward
      const [X, Y, Z] = frameAlong(d, dirF(hf, [1, 0, 0.5 * sd]));
      prims.push(ellAx(add(root0, sc(Y, 13)), X, Y, Z, [4, 15, 8], id, id, M_BLUE));
      prims.push(ellAx(add(root0, sc(Y, 38)), X, Y, Z, [3.8, 22, 13], id, id, M_BLUE));
      anchors[sd > 0 ? 'armN' : 'armF'] = add(root0, sc(Y, 58));
    }

    // --- stubby legs and feet (mostly hidden by the fur hem)
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 3.6 * Math.sin(ph) : 0;
      const lift = walking ? 3 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(root, [0.5, 14, 8.6 * sd]);
      const foot = inF(root, [3.5 + fwd, 4 + lift - bob, 9.4 * sd]);
      prims.push(seg(hip, add(foot, [0, 2, 0]), 6.4, 6.2, id, id, M_BLUE));
      prims.push(E(foot, M3.mul(M3.mul(root.L, M3.rz(walking ? 0.2 * Math.sin(ph) : 0)), M3.diag(8.2, 4.4, 6.6)), id, id, (s) => (s[1] < -0.55 ? C_BLUE_D : C_BLUE)));
      anchors[sd > 0 ? 'footN' : 'footF'] = foot;
    }

    // --- long thin black tail, curving back and up toward the camera side, eye-spot tip
    const wag = (walking ? 0.25 * Math.sin(wk) : 0) - 0.5 * sw;
    const zs = 0.35 + 0.65 * Math.abs(side);
    const sgn = side >= 0 ? 1 : -1;
    const tz = (k) => (sgn * zs * k + wag * k * 0.8) ;
    const pts = [
      inF(bodyF, [-14, -2, 0]),
      inF(root, [-27, 12, tz(8)]),
      inF(root, [-38, 14, tz(17)]),
      inF(root, [-45, 20, tz(25)]),
      inF(root, [-48, 27, tz(30)]),
    ];
    for (let i = 0; i < pts.length - 1; i++) prims.push(seg(pts[i], pts[i + 1], 2.9 - 0.15 * i, 2.9 - 0.15 * i, 8, 8, M_BLACK, [0, 1, 0], 1.15));
    const tipD = nrm(sub(pts[4], pts[3]));
    const tc = add(pts[4], sc(tipD, 7.6));
    // the flat face turns toward the camera side
    const th = 0.7 * side;
    const nrmT = dirF(root, [Math.cos(th) * 0.8, 0, Math.sin(th)]);
    const Yt = nrm(sub(tipD, sc(nrmT, dot(tipD, nrmT))));
    const Xt = cross(Yt, nrmT);
    prims.push(ellAx(tc, Xt, Yt, nrmT, [8.4, 8.8, 3.4], 9, 9, tipMat));
    anchors.tail = tc;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BLUE, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 204, bh: 160, oy: 0.88 } };
})();
