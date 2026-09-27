/* ------------------------------------------------------------------
   Trapinch — the Ant Pit Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME / battle model): an enormous orange egg-
   shaped head, carried nose-up in front of a small domed body, that is
   almost all jaw: a zigzag mouth seam runs round the front half of the
   head and ends at the mouth corners, just ahead of two small black eyes
   with a white four-point sparkle. The head splits along the seam into
   an upper and a lower jaw (hinged at the back of the head) that open
   very wide, showing a dark mouth lined with cream teeth. A short neck,
   a whitish-grey segmented band round the bottom of the body and four
   stubby splayed legs.

   Pose parameters (all optional):
     jaw        0..1    mouth open (1 = very wide, ~100°)
     headPitch  −1..1   head tilt (+ = nose further up, − = level/down)
     step       radians walk-cycle phase (diagonal leg pairs, bob); 0 = standing
     eyes       'open' | 'happy' | 'closed' | 'blink'
     bury       0..1    accepted and ignored (burying is done by the game)
     side       −1..1   ≈ cos(yaw), passed by the game (unused, accepted)

   Anchors: top (head top), head (head centre), mouth (front of the
   mouth, between the jaws), eyeN, eyeF, body (body centre), neck,
   jawTip (upper jaw tip).
------------------------------------------------------------------- */
const Trapinch = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SKIN = 1, BAND = 2, MOUTH = 3, TOOTH = 4, LEG = 5, SEAM = 6;
  const MAT = { SKIN, BAND, MOUTH, TOOTH, LEG, SEAM };
  const PAL = Creature.palette({
    [SKIN]:  { r: ['#b04c26', '#d66636', '#f0844a', '#faa46a', '#ffcfa6'], od: '#652010', ol: '#a44220', ln: '#963c1e' },
    [LEG]:   { r: ['#b04c26', '#d66636', '#f0844a', '#faa46a', '#ffcfa6'], od: '#652010', ol: '#a44220', ln: '#963c1e' },
    [BAND]:  { r: ['#7e8594', '#a2a9b6', '#c8ced8', '#e4e8ee', '#f8faff'], od: '#3a3e4a', ol: '#666c7a', ln: '#6a707e' },
    [MOUTH]: { r: ['#3e0e14', '#5a1820', '#76262c', '#90383a', '#a84c4a'], od: '#26060a', ol: '#3e0e14', ln: '#3e0e14' },
    [SEAM]:  { r: ['#4a160a', '#5c1e0e', '#6e2812', '#823418', '#96401e'], od: '#3a1006', ol: '#5c1e0e', ln: '#3a1006' },
    [TOOTH]: { r: ['#b8a88a', '#d8caa8', '#f2e6c8', '#fcf6e4', '#ffffff'], od: '#5a4a30', ol: '#8a7a5a', ln: '#8a7a5a' },
  });
  const GLOSSY = { [SKIN]: 1 };
  const C_SKIN = code(SKIN), C_SEAM = code(SEAM), C_BAND = code(BAND), C_BAND_D = code(BAND, -1), C_MOUTH = code(MOUTH), C_TOOTH = code(TOOTH), C_LEG = code(LEG);
  const M_SKIN = () => C_SKIN, M_LEG = () => C_LEG;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  /* ---------- head: egg split by a zigzag seam ---------- */
  const HD_R = [48, 38, 40];
  const SEAM_V = -0.06, ZIG_A = 0.17, ZIG_N = 2.6, SEAM_AZ = 1.52; // seam height, tooth amplitude, teeth per side, corner azimuth
  // seam height at azimuth az (unit-sphere y): zigzag over the front, flat behind the mouth corners
  function zig(az) {
    const a = Math.abs(az);
    if (a > SEAM_AZ) return SEAM_V;
    const ph = (a / SEAM_AZ) * ZIG_N + 0.25;
    const tri = Math.abs(ph - Math.floor(ph + 0.5)) * 2; // 0..1
    const fade = Math.min(1, (SEAM_AZ - a) / 0.25);
    return SEAM_V + ZIG_A * (tri - 0.5) * 2 * fade;
  }
  let curScale = 1;
  // closed head: one surface, the seam drawn as a dark line
  const headClosedMat = (s) => {
    const az = Math.atan2(s[2], s[0]);
    if (Math.abs(az) < SEAM_AZ) {
      const w = Math.max(0.02, 0.62 / (curScale * HD_R[1]));
      if (Math.abs(s[1] - zig(az)) < w) return C_SEAM;
    }
    return C_SKIN;
  };
  const upperMat = (s) => (s[1] >= zig(Math.atan2(s[2], s[0])) ? C_SKIN : 0);
  const lowerMat = (s) => (s[1] < zig(Math.atan2(s[2], s[0])) ? C_SKIN : 0);
  // cut face of a jaw (plate in the seam plane, u = forward, v = across): dark mouth, cream teeth round the front
  const CUT = 0.99 * Math.sqrt(1 - SEAM_V * SEAM_V);
  const MOUTH_G = bakeShape({
    bb: [-HD_R[0] * CUT - 0.5, -HD_R[2] * CUT - 0.5, HD_R[0] * CUT + 0.5, HD_R[2] * CUT + 0.5],
    test: (u, v) => {
      const a = u / (HD_R[0] * CUT), b = v / (HD_R[2] * CUT);
      const r = Math.hypot(a, b);
      if (r > 1) return 0;
      const az = Math.atan2(b, a);
      if (Math.abs(az) < SEAM_AZ - 0.1) {
        const ph = (Math.abs(az) / SEAM_AZ) * ZIG_N * 2 + 0.5;
        const tri = Math.abs(ph - Math.floor(ph + 0.5)) * 2; // teeth pointing inward
        if (r > 0.8 + 0.14 * tri) return C_TOOTH;
      }
      return r > 0.95 ? C_SKIN : C_MOUTH;
    },
  });

  /* ---------- eye stamps: black oval with a white sparkle ---------- */
  const EYE_L = {
    open: ['.kkk.', 'kkkkk', 'kkwkk', 'kwwwk', 'kkwkk', 'kkkkk', '.kkk.'],
    openN: ['.kk.', 'kkkk', 'kwkk', 'wwwk', 'kwkk', 'kkkk', '.kk.'],
    openF: ['.k', 'kk', 'kk', 'wk', 'kk', 'kk', '.k'],
    happy: ['.kkk.', 'k...k'], happyN: ['.kk.', 'k..k'], happyF: ['kk', 'k.'],
    closed: ['.....', 'kkkkk', '.kkk.'], closedN: ['....', 'kkkk', '.kk.'], closedF: ['..', 'kk'],
    blink: ['.....', '.....', 'kkkkk'], blinkN: ['....', '....', 'kkkk'], blinkF: ['..', '..', 'kk'],
  };
  const EYE_S = {
    open: ['.k.', 'kwk', 'kkk', '.k.'], openN: ['.k.', 'kwk', 'kkk', '.k.'], openF: ['k', 'k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['.k.', 'k.k'], happyF: ['k', 'k'],
    closed: ['kkk'], closedN: ['kk'], closedF: ['k'],
    blink: ['...', 'kkk'], blinkN: ['..', 'kk'], blinkF: ['.', 'k'],
  };
  const EYEC = { k: '#16100e', w: '#ffffff' };
  const EYE_AZ = 1.66, EYE_V = 0.12;

  /* ---------- body + legs ---------- */
  const BD_C = [-20, 28, 0], BD_R = [29, 20, 26];
  function bodyMat(s) {
    // whitish-grey band with a scalloped top edge, split into segments
    const az = Math.atan2(s[2], s[0]);
    const ph = (az / Math.PI) * 4;
    const f = ph - Math.floor(ph);
    const top = -0.2 + 0.07 * Math.sin(f * Math.PI);
    if (s[1] < top && s[1] > -0.62) return f < 0.05 || f > 0.95 ? C_BAND_D : C_BAND;
    return C_SKIN;
  }
  const LEGS = [
    { hip: [-4, 22, 17], foot: [6, 0, 30], ph: 0 },
    { hip: [-4, 22, -17], foot: [6, 0, -30], ph: Math.PI },
    { hip: [-36, 22, 16], foot: [-44, 0, 28], ph: Math.PI },
    { hip: [-36, 22, -16], foot: [-44, 0, -28], ph: 0 },
  ];

  const DEFAULT = { jaw: 0, headPitch: 0, step: 0, eyes: 'open', bury: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // 1 upper head, 2 lower head, 3 neck, 4 body, 5..8 legs, 9 mouth plates
  Object.assign(PRI, { 1: 3, 2: 2, 3: 1, 4: 0, 9: 1 });
  const SIZE = 1.0;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const st = P.step || 0;
    const bob = 1.4 * Math.abs(Math.sin(st));
    const jaw = clamp(P.jaw, 0, 1);
    const pitch = 0.6 + clamp(P.headPitch, -1, 1) * 0.42;
    const body = T(0, bob, 0);

    // --- body, neck
    prims.push(ellF(chain(body, T(...BD_C), R(M3.rz(0.08))), BD_R, 4, 4, bodyMat));
    const neckTop = inF(body, [8, 46, 0]);
    prims.push(seg(inF(body, [-2, 30, 0]), neckTop, 13, 13, 3, 3, M_SKIN));
    anchors.neck = neckTop;
    anchors.body = inF(body, BD_C);

    // --- head: pivot at the neck top; the head sits forward and up of it
    // When the jaw opens the lower jaw drops a little and the upper jaw swings up (hinge at the back).
    const hp = chain(body, T(...neckTop), R(M3.rz(pitch - 0.22 * jaw)));
    const hc = chain(hp, T(20, 30, 0));
    const HINGE = [-HD_R[0] * 0.9, HD_R[1] * SEAM_V, 0];
    const upF = chain(hc, T(...HINGE), R(M3.rz(jaw * 1.45)), T(-HINGE[0], -HINGE[1], 0));
    let eyeHost;
    if (jaw < 0.02) {
      eyeHost = ellF(hc, HD_R, 1, 1, headClosedMat);
      prims.push(eyeHost);
    } else {
      eyeHost = ellF(upF, HD_R, 1, 1, upperMat);
      prims.push(eyeHost);
      prims.push(ellF(hc, HD_R, 2, 2, lowerMat));
      const plateL = (f) => M3.mul(f.L, M3.cols([1, 0, 0], [0, 0, 1], [0, 1, 0]));
      const yc = HD_R[1] * SEAM_V;
      prims.push(PL(inF(upF, [0, yc - 0.6, 0]), plateL(upF), 1, 9, MOUTH_G, 1.2));
      prims.push(PL(inF(hc, [0, yc + 0.6, 0]), plateL(hc), 2, 9, MOUTH_G, 1.2));
    }
    anchors.head = inF(hc, [0, 0, 0]);
    anchors.jawTip = inF(upF, [HD_R[0], HD_R[1] * SEAM_V, 0]);
    anchors.mouth = sc(add(anchors.jawTip, inF(hc, [HD_R[0], HD_R[1] * SEAM_V, 0])), 0.5);
    // top: highest point of the (upper) head
    {
      const L = eyeHost.L, c = eyeHost.c;
      anchors.top = [c[0], c[1] + Math.hypot(L[3], L[4], L[5]), c[2]];
    }

    // --- eyes (stamps on the upper head just behind the mouth corners)
    for (const side of [1, -1]) {
      const s = Creature.sph(side * EYE_AZ, EYE_V);
      const f = jaw < 0.02 ? hc : upF;
      const at = { prim: eyeHost, p: inF(f, [HD_R[0] * s[0], HD_R[1] * s[1], HD_R[2] * s[2]]), s };
      stamps.push({ at, set: EYE_L, colors: EYEC, kind: P.eyes === 'closed' ? 'closed' : P.eyes, near: 0.55, far: 0.25, minFacing: 0.1 });
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    // --- legs: stubby, splayed; diagonal pairs step together
    LEGS.forEach((lg, i) => {
      const ph = st + lg.ph;
      const lift = st ? Math.max(0, Math.sin(ph)) * 5 : 0;
      const swing = st ? Math.cos(ph) * 5 : 0;
      const hip = inF(body, lg.hip);
      const foot = [lg.foot[0] + swing, 4.5 + lift, lg.foot[2]];
      const id = 5 + i;
      prims.push(seg(hip, foot, 8.2, 8.2, id, id, M_LEG));
      prims.push(ellF(chain(T(...foot), R(M3.ry(-Math.atan2(lg.foot[2], lg.foot[0] - lg.hip[0])))), [8.5, 5, 8], id, id, M_LEG));
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const q of stamps) q.at.p = sc(q.at.p, SIZE);
    for (const kk in anchors) anchors[kk] = sc(anchors[kk], SIZE);
    return { prims, stamps, dots: [], anchors, pose: P, headPrim: eyeHost, pri: PRI, glossy: GLOSSY, baseMat: SKIN, shadowSteps: 16 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    for (const st of model.stamps) st.set = curScale >= 0.8 ? EYE_L : EYE_S; // small sparkle eyes at game scale
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 190, bh: 190, oy: 0.9 } };
})();
