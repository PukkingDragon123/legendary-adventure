/* ------------------------------------------------------------------
   Surskit — the Pond Skater Pokémon (0.5 m ≈ 87 units tall at scale 1,
   horn tip to feet). A posable 3D model rendered straight to pixel art by
   the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground (water
   surface) at y = 0.

   Design (official art / HOME model): a small round sky-blue body, wider
   than tall, carried high on four very long, thin legs that arch out and
   down to the water like a pond skater's, ending in tiny pale-yellow
   skating pads. A yellow cap covers the top of the head (two creases at
   the front) and a curved, tapering yellow horn rises from it, bending
   back and to its left. Big glossy black eyes with a white glint sit just under
   the cap, with pink blush marks below them; tiny mouth.

   Pose parameters (all optional):
     skate  radians  skating phase: the front and back leg pairs push
                     (glide back on the water, swing forward lifted) in
                     turn, the body surges and bobs; continuous, 0 = a
                     still stance
     bob    0..1     body dips down between the legs (knees flex out)
     legs   0..1     legs spread wide (body sinks, arches flatten)
     eyes   'open' | 'happy' | 'closed' | 'blink'
     mouth  0..1     mouth open
     side   −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (horn tip), head (top of the cap), mouth, eyeN, eyeF,
   body (body centre), horn (horn tip), footN / footF (front feet),
   footBN / footBF (back feet).
   Thin parts are sized per render scale (render() rebuilds the model for
   the scale it is drawn at, so the legs never break up into gaps).
------------------------------------------------------------------- */
const Surskit = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, LEG = 2, CAP = 3, EYE = 4, GLINT = 5, BLUSH = 6, MOUTH = 7, PAD = 8;
  const MAT = { BODY, LEG, CAP, EYE, GLINT, BLUSH, MOUTH, PAD };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#1d6aae', '#2c8ed2', '#48b2ec', '#7ed0f8', '#c4eeff'], od: '#0c3664', ol: '#1c5e9e', ln: '#1c5a98' },
    [LEG]:   { r: ['#2272b4', '#3496d8', '#54baf0', '#8ad6fa', '#c8f0ff'], od: '#0c3664', ol: '#1c5e9e', ln: '#1c5a98' },
    [CAP]:   { r: ['#b08a30', '#d4ae4a', '#eed274', '#f9e8a2', '#fff8d8'], od: '#5e4410', ol: '#9a7a2c', ln: '#a88630' },
    [PAD]:   { r: ['#b8963e', '#dcbc5a', '#f4dc84', '#fcecb0', '#fffbe2'], od: '#5e4410', ol: '#9a7a2c', ln: '#a88630' },
    [EYE]:   { r: ['#07090e', '#0c0f16', '#12161e', '#1c222c', '#2e3642'], od: '#040508', ol: '#07090e', ln: '#040508' },
    [GLINT]: { r: ['#e8f0f8', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8090a0', ol: '#c0ccd8', ln: '#c0ccd8' },
    [BLUSH]: { r: ['#c44c6c', '#dc6684', '#ef849c', '#f8a4b8', '#ffc8d6'], od: '#7a2440', ol: '#b04868', ln: '#b04868' },
    [MOUTH]: { r: ['#521a2c', '#6e2638', '#8a3446', '#a44a58', '#bc646e'], od: '#300c18', ol: '#521a2c', ln: '#521a2c' },
  });
  const GLOSSY = { [BODY]: 1, [CAP]: 1, [EYE]: 1 };
  const C_BODY = code(BODY), C_LEG = code(LEG), C_CAP = code(CAP), C_EYE = code(EYE), C_GLINT = code(GLINT);
  const C_BLUSH = code(BLUSH), C_MOUTH = code(MOUTH), C_PAD = code(PAD);
  const M_LEG = () => C_LEG, M_CAP = () => C_CAP, M_PAD = () => C_PAD;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, up = [0, 1, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, up);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }
  // smooth tapered tube along sample points: elongated, overlapping ellipsoids (no joint bands)
  function tube(prims, pts, rad, part, grp, matFor, up = [0, 1, 0]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], m = sc(add(a, b), 0.5), h = sub(b, a);
      const ext = i === pts.length - 2 ? 0.5 : 0.95; // the last piece ends on the tip
      prims.push(seg(sub(m, sc(h, ext)), add(m, sc(h, i === 0 ? 0.95 : ext)), (rad[i] + rad[i + 1]) / 2, (rad[i] + rad[i + 1]) / 2, part, grp, matFor(i), up));
    }
  }
  const bez = (a, b, c, d, t) => {
    const u = 1 - t;
    return add(add(sc(a, u * u * u), sc(b, 3 * u * u * t)), add(sc(c, 3 * u * t * t), sc(d, t * t * t)));
  };

  /* ---------- body: cap, eyes, blush, mouth (decals on the unit sphere) ---------- */
  const BC = [0, 50, 0], BR = [19, 14.5, 21.5];
  const EAZ = 0.5, EV = 0.07;
  const EC = [1, -1].map((sd) => Creature.sph(sd * EAZ, EV));
  const KC = [1, -1].map((sd) => Creature.sph(sd * 0.66, -0.2)); // blush centres
  const capEdge = (s) => 0.4 - 0.07 * Math.max(0, s[0]) * (1 - 4 * s[2] * s[2]) + 0.04 * Math.cos(3 * Math.atan2(s[2], s[0]));
  let curScale = 1;
  // local (u = along the surface horizontally toward −z, v = up) offsets from a centre direction q
  const uvAt = (s, q) => {
    const tz = [-q[2], 0, q[0]], tl = Math.hypot(tz[0], tz[2]) || 1;
    return [-((s[0] - q[0]) * tz[0] + (s[2] - q[2]) * tz[2]) / tl, s[1] - q[1]];
  };
  function bodyMat(kind, mo) {
    return (s) => {
      if (s[1] > capEdge(s)) return C_CAP;
      if (s[0] < 0.2) return C_BODY;
      const px = 1 / (curScale * BR[1]);
      const q = s[2] > 0 ? EC[0] : EC[1];
      const [u, v] = uvAt(s, q);
      const ru = Math.max(0.17, 1.5 * px), rv = Math.max(0.26, 2.1 * px);
      if (kind === 'open') {
        const a = u / ru, b = v / rv;
        if (a * a + b * b < 1) {
          // white glint up and toward the near side (+z: upper left in a front view), like the official art
          const gu = (u + 0.3 * ru) / Math.max(0.36 * ru, 0.62 * px), gv = (v - 0.36 * rv) / Math.max(0.3 * rv, 0.62 * px);
          return gu * gu + gv * gv < 1 ? C_GLINT : C_EYE;
        }
      } else {
        const w = Math.max(0.05, 0.75 * px), a = u / (ru * 1.2);
        if (Math.abs(a) < 1) {
          let yc;
          if (kind === 'happy') yc = rv * 0.35 * (1 - 1.8 * a * a);
          else if (kind === 'blink') yc = -rv * 0.15;
          else yc = -rv * 0.3 * (1 - a * a);
          if (Math.abs(v - yc) < w) return C_EYE;
        }
      }
      // blush: pink half-discs (flat top) under and outside the eyes
      const k = s[2] > 0 ? KC[0] : KC[1];
      const [bu, bv] = uvAt(s, k);
      const bru = Math.max(0.29, 1.8 * px), brv = Math.max(0.19, 1.3 * px);
      if (bv < 0.25 * brv && (bu / bru) ** 2 + (bv / brv) ** 2 < 1) return C_BLUSH;
      // mouth: a small dark opening under the face
      if (mo > 0.03) {
        const mu = s[2] / Math.max(0.12, 1.4 * px), mv = (s[1] + 0.28) / Math.max(0.05 + 0.1 * mo, 1.1 * px);
        if (s[0] > 0.6 && mu * mu + mv * mv < 1) return C_MOUTH;
      }
      return C_BODY;
    };
  }
  // creases in the cap at the front (unit-sphere polylines, culled when facing away)
  const CREASES = [-0.3, 0.3].map((az) => {
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const v = 0.3 + k * 0.07;
      const c = Math.sqrt(1 - v * v);
      const s = [c * Math.cos(az), v, c * Math.sin(az)];
      if (v >= capEdge(s) - 0.01) pts.push(s);
    }
    return pts;
  }).filter((p) => p.length > 1);

  /* ---------- legs ---------- */
  // hip azimuth round the body, reach of the foot from the centre, push phase
  const LEGS = [
    { az: 1.08, reach: 66, ph: 0 }, { az: -1.08, reach: 66, ph: 0 },
    { az: 2.2, reach: 60, ph: Math.PI }, { az: -2.2, reach: 60, ph: Math.PI },
  ];
  const NSEG = 9;

  const DEFAULT = { skate: 0, bob: 0, legs: 0, eyes: 'open', mouth: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 body, 2 horn, 10..13 legs (+ pads)
  Object.assign(PRI, { 2: 1 });
  const SIZE = 0.845;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const sk = P.skate || 0, bob = clamp(P.bob, 0, 1), spread = clamp(P.legs, 0, 1);
    const mo = clamp(P.mouth, 0, 1);
    const minR = 0.72 / ((P._scale || 1) * SIZE); // keep the thin legs and horn tip at least ~1.5 px wide
    const surge = Math.sin(sk);
    const drop = 11 * bob + 9 * spread + 0.8 * (1 - Math.cos(2 * sk));
    const body = chain(T(2.5 * surge, -drop, 0), T(...BC), R(M3.rz(-0.06 * surge)), R(M3.diag(1 + 0.05 * bob, 1 - 0.06 * bob, 1 + 0.05 * bob)));
    const bodyPrim = ellF(body, BR, 1, 1, bodyMat(P.eyes, mo));
    bodyPrim.faceLines = CREASES.map((pts) => ({ pts, mat: CAP, useLn: true }));
    prims.push(bodyPrim);
    anchors.body = body.t;
    anchors.head = inF(body, [0, BR[1], 0]);
    for (const [k, q] of [['eyeN', EC[0]], ['eyeF', EC[1]]]) anchors[k] = inF(body, [BR[0] * q[0], BR[1] * q[1], BR[2] * q[2]]);
    anchors.mouth = inF(body, [BR[0] * 0.95, -BR[1] * 0.3, 0]);

    // --- horn: curved, tapering, bending back (and a touch to its left)
    const H0 = inF(body, [0, BR[1] - 2, 0]);
    const hf = (p) => inF(body, p);
    const hp = [H0, hf([0, BR[1] + 13, 0]), hf([-2, BR[1] + 22, -3.5]), hf([-6.5, BR[1] + 27, -10])];
    const HN = 8, hpts = [], hrad = [];
    for (let i = 0; i <= HN; i++) {
      const t = i / HN;
      hpts.push(bez(hp[0], hp[1], hp[2], hp[3], t));
      hrad.push(Math.max(minR, 3.3 * Math.pow(1 - t, 0.8) + 0.3));
    }
    tube(prims, hpts, hrad, 2, 2, () => M_CAP, [0, 0, 1]);
    anchors.horn = hp[3];
    anchors.top = hp[3];

    // --- legs: long thin arches from the lower sides of the body out and down to the water
    LEGS.forEach((lg, i) => {
      const ph = sk + lg.ph;
      // continuous in `skate`: the foot glides back on the water, then swings forward lifted
      const glide = 5 * Math.cos(ph);
      const lift = Math.max(0, -Math.sin(ph)) * 3;
      const o = [Math.cos(lg.az), 0, Math.sin(lg.az)];
      const s = Creature.sph(lg.az, -0.28);
      const hip = inF(body, [BR[0] * s[0] * 0.86, BR[1] * s[1] * 0.86, BR[2] * s[2] * 0.86]);
      const reach = lg.reach * (1 + 0.2 * spread + 0.06 * bob);
      const foot = add(sc(o, reach), [glide, lift, 0]);
      const arch = 1 - 0.45 * spread - 0.3 * bob;
      // a long convex arc: leaves the body heading out and a little up, bends over and comes
      // down to the water at a steep slant
      const dx = Math.hypot(foot[0] - hip[0], foot[2] - hip[2]), dy = hip[1] - foot[1];
      const c1 = add(hip, add(sc(o, 0.42 * dx), [0, (0.08 - 0.12 * (1 - arch)) * dy, 0]));
      const c2 = add(foot, add(sc(o, -0.2 * dx), [0, (0.36 * arch + 0.06) * dy, 0]));
      const id = 10 + i, lpts = [], lrad = [];
      for (let k = 0; k <= NSEG; k++) {
        const t = k / NSEG;
        lpts.push(bez(hip, c1, c2, foot, t));
        lrad.push(Math.max(minR, 2.5 - 1.9 * Math.pow(t, 0.8)));
      }
      tube(prims, lpts, lrad, id, id, () => M_LEG);
      // skating pad: a small flat pale-yellow oval on the water under the tip
      const pf = chain(T(foot[0], Math.max(minR, 1) + lift, foot[2]), R(M3.ry(-lg.az)));
      prims.push(ellF(pf, [3.3, Math.max(minR, 1), 2.2], id, id, M_PAD));
      anchors[['footN', 'footF', 'footBN', 'footBF'][i]] = foot;
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14 };
  }

  // decal polylines on the unit sphere of a primitive: keep only the segments facing the camera
  function cullLines(prim, view) {
    const Li = M3.inv(prim.L), out = [];
    for (const ln of prim.faceLines) {
      let run = [];
      for (const s of ln.pts) {
        const n = [Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2]];
        if (dot(n, view) / (len3(n) || 1) > 0.12) run.push(s);
        else { if (run.length > 1) out.push(Object.assign({}, ln, { pts: run })); run = []; }
      }
      if (run.length > 1) out.push(Object.assign({}, ln, { pts: run }));
    }
    prim.lines = out;
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    // thin parts are sized for the render scale: rebuild when it differs
    if ((model.pose._scale || 1) !== curScale) model = build(Object.assign({}, model.pose, { _scale: curScale }));
    const yaw = opt.yaw ?? 1.05, pitch = opt.pitch ?? 0.16;
    const view = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    for (const p of model.prims) if (p.faceLines) cullLines(p, view);
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 160, bh: 100, oy: 0.845 } };
})();
