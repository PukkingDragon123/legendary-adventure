/* ------------------------------------------------------------------
   Swablu — the Cotton Bird Pokémon (0.4 m ≈ 70 units from the dangling
   feet to the tips of the head feathers). A posable 3D model rendered
   straight to pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = its right side (near side at yaw 0);
   the tips of the dangling feet sit at y = 0.

   Build: round sky-blue body, big round white beak (the lower half opens),
   small black eyes (pixel stamps), two long thin head feathers splaying in
   a V, fluffy white cotton-cloud wings (clusters of puffs, alternating
   contour groups so the puffs read), a thin blue tail feather pair and
   tiny three-toed feet.

   Pose parameters (all optional):
     flap   -1..1   cloud-wing beat (+ up, - down)
     bill    0..1   beak open (singing); `mouth` is accepted as an alias
     bob     0..1   bounce: the body squashes down a little and tips forward
     eyes   'open' | 'happy' | 'closed' | 'blink'
------------------------------------------------------------------- */
const Swablu = (() => {
  const { chain, T, R, F, sph, code } = Creature;

  const BODY = 1, BEAK = 2, CLOUD = 3, MOUTH = 4, FEET = 5, EYEK = 6, EYEW = 7;
  const MAT = { BODY, BEAK, CLOUD, MOUTH, FEET, EYEK, EYEW };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#1f78b6', '#2e96d4', '#4cb6ec', '#80d0f6', '#c2ecfd'], od: '#0e3e6c', ol: '#1f6aa6', ln: '#1c64a0' },
    [BEAK]:  { r: ['#a2b2c6', '#c9d4e2', '#edf2f8', '#fbfcfe', '#ffffff'], od: '#44546e', ol: '#76869e', ln: '#8494ac' },
    [CLOUD]: { r: ['#a7bdd6', '#cbdaea', '#eaf1f8', '#f9fbfd', '#ffffff'], od: '#5c7898', ol: '#8aa2c0', ln: '#a2b8d2' },
    [MOUTH]: { r: ['#5a2a3a', '#743846', '#8e4a58', '#a8606c', '#c07c86'], od: '#341420', ol: '#50202e', ln: '#4a1e2a' },
    [FEET]:  { r: ['#7e94ae', '#9cb0c8', '#bccce0', '#d6e2f0', '#eef4fa'], od: '#3e5270', ol: '#627692', ln: '#627692' },
    [EYEK]:  { r: ['#0c1018', '#10151e', '#141a24', '#1c232e', '#28303c'], od: '#06080c', ol: '#06080c', ln: '#06080c' },
    [EYEW]:  { r: ['#dde4ee', '#f0f4f8', '#ffffff', '#ffffff', '#ffffff'], od: '#303844', ol: '#303844', ln: '#303844' },
  });
  const GLOSSY = { [BODY]: 1 };

  const DEFAULT = { flap: 0, bill: 0, bob: 0, eyes: 'open', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, scl = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const P2W = (f, p) => add(f.t, M3.v(f.L, p));
  const V2W = (f, d) => M3.v(f.L, d);
  function frameY(d, hint) {
    const Y = nrm(d);
    let X = sub(hint, scl(Y, dot(hint, Y)));
    if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    X = nrm(X);
    return M3.cols(X, Y, cross(X, Y));
  }
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function segE(a, b, rx, rz, hint, part, grp, mat, ext = 1) {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]);
    return E(scl(add(a, b), 0.5), M3.mul(frameY(d, hint), M3.diag(rx, (len / 2) * ext, rz)), part, grp, mat);
  }
  const C = (m, b = 0) => code(m, b);
  const M_BODY = () => C(BODY), M_BEAK = () => C(BEAK), M_CLOUD = () => C(CLOUD), M_FEET = () => C(FEET);

  /* ---------- proportions ---------- */
  const BR = [16.4, 16.8, 15.8]; // body radii
  const BODY_C = [0, 24.5, 0];
  const EYE_AZ = 0.62, EYE_V = 0.3;

  // head feather: thin curved blade (plate, u = along, v = across)
  const FEATHER = bakeShape(Shape2D.poly([[0, -1.4], [8, -1.9], [16, -1.5], [23, 0.2], [28.5, 2.6], [33, 6.2], [28, 4.8], [22, 3.0], [15.4, 2.0], [8, 1.9], [0, 1.4]], C(BODY), 8));
  const TAILF = bakeShape(Shape2D.poly([[0, -1.8], [7, -2.4], [14, -1.6], [19, 0], [14, 1.4], [7, 1.9], [0, 1.6]], C(BODY), 8));

  // cloud wing puffs (wing-local: x = forward, y = up, z = outward from the shoulder)
  const PUFFS = [
    [1.5, 1, 5, 7.2], [-3.5, -1.5, 7, 6.6], [3.5, 4.5, 11, 7.8], [-2.5, 0, 14, 7.4], [4, -3, 16.5, 6.4],
    [0.5, 5, 20, 7.6], [-3, -2, 23, 7.0], [3, 1, 26.5, 6.8], [-1, 5.5, 29, 5.6], [0, -2.5, 31, 5.4],
  ];

  /* ---------- eye stamps: k = black, w = shine ---------- */
  const EYES_L = {
    open: ['.kk.', 'kwkk', 'kkkk', '.kk.'],
    openN: ['.k.', 'wkk', 'kkk', '.k.'],
    openF: ['k.', 'kk', 'k.'],
    happy: ['.kk.', 'k..k'],
    happyN: ['.k.', 'k.k'],
    happyF: ['k.', '.k'],
    closed: ['k..k', '.kk.'],
    closedN: ['k.k', '.k.'],
    closedF: ['k.', '.k'],
    blink: ['kkkk'],
    blinkN: ['kkk'],
    blinkF: ['kk'],
  };
  const EYES_S = {
    open: ['kk', 'wk', 'kk'], openN: ['kk', 'wk', 'kk'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['.k.', 'k.k'], happyF: ['k.', '.k'],
    closed: ['k.k', '.k.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['kkk'], blinkN: ['kkk'], blinkF: ['kk'],
  };
  const mirror = (set) => { const o = {}; for (const k in set) o[k] = set[k].map((r) => r.split('').reverse().join('')); return o; };
  const EYES_LM = mirror(EYES_L), EYES_SM = mirror(EYES_S);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const fl = clamp(+P.flap || 0, -1, 1), bob = clamp(+P.bob || 0, 0, 1);
    const bo = clamp(+((pose && pose.bill !== undefined ? pose.bill : pose && pose.mouth !== undefined ? pose.mouth : 0)) || 0, 0, 1);
    const prims = [];

    // --- body (bounce: squash + a small forward tip)
    const sq = bob * 0.07;
    const root = chain(F(M3.diag(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5), [0, 0, 0]), T(0, BODY_C[1], 0), R(M3.rz(-bob * 0.12)), T(0, -BODY_C[1], 0));
    const bodyF = chain(root, T(...BODY_C));
    const bodyPrim = ellF(bodyF, BR, 1, 1, M_BODY);
    prims.push(bodyPrim);

    // --- beak: big round white upper beak; the lower beak swings open under it
    const bkF = chain(bodyF, T(13.4, 2.2, 0));
    prims.push(ellF(chain(bkF, T(1.4, 1.2, 0), R(M3.rz(-0.2))), [7.0, 6.6, 7.2], 2, 2, M_BEAK));
    const lbF = chain(bkF, T(-2, -3, 0), R(M3.rz(-bo * 0.5)));
    prims.push(ellF(chain(lbF, T(3.4, -1.6, 0), R(M3.rz(-0.2))), [4.4, 2.6, 4.8], 3, 2, () => C(BEAK, -1)));
    if (bo > 0.05) prims.push(ellF(chain(bkF, T(1.5, -2.6, 0), R(M3.rz(-bo * 0.25))), [4.4, 1.6 + bo * 1.4, 4.2], 4, 4, () => C(MOUTH)));

    // --- head feathers: two long blades splaying up and back in a V
    const topP = P2W(bodyF, [-2.5, BR[1] - 1.2, 0]);
    const featherTips = [];
    for (const k of [1, -1]) {
      const up = nrm([-0.28, 1, k * 0.42]);
      const axU = V2W(bodyF, up);
      // plate plane: the feather direction and an outward/backward axis, so each blade arcs away from the other
      const out = nrm([-0.45, 0, k]);
      const axV = V2W(bodyF, nrm(sub(out, scl(up, dot(out, up)))));
      const axW = cross(axU, axV);
      prims.push({ kind: 'plate', part: k > 0 ? 5 : 6, grp: 5, c: topP, L: M3.cols(axU, axV, axW), shape: FEATHER, thick: 1.5 });
      featherTips.push(add(topP, add(scl(axU, 33), scl(axV, 6.2))));
    }

    // --- cloud wings: clusters of puffs, pivoting at the shoulders
    const tips = [];
    for (const side of [1, -1]) {
      const a = 0.35 + fl * 0.6;
      const wing = chain(root, T(-1.5, 27, side * 12), R(M3.rx(-side * a)), R(M3.ry(side * 0.2)));
      PUFFS.forEach((q, i) => {
        const c = P2W(wing, [q[0], q[1], side * q[2]]);
        prims.push(E(c, M3.diag(q[3], q[3] * 0.92, q[3]), side > 0 ? 7 : 8, (side > 0 ? 7 : 9) + (i % 2), M_CLOUD));
      });
      tips.push(P2W(wing, [0, 0, side * 34]));
    }

    // --- tail feathers: a thin blue pair pointing down and back
    for (const [k, len, ang] of [[1, 1, 0.95], [-1, 0.75, 1.25]]) {
      const base = P2W(bodyF, [-12.5, -9, k * 1.2]);
      const d = V2W(bodyF, nrm([-Math.cos(ang), -Math.sin(ang), k * 0.12]));
      const v = V2W(bodyF, [0, 0, 1]);
      prims.push({ kind: 'plate', part: 11, grp: 11, c: base, L: M3.cols(scl(d, len), nrm(cross(v, d)), v), shape: TAILF, thick: 1.6 });
    }

    // --- tiny dangling legs with three thin toes
    const feet = [];
    for (const side of [1, -1]) {
      const hip = P2W(bodyF, [1.5, -BR[1] + 3, side * 5.5]);
      const ankle = add(hip, V2W(root, [0.6, -4.6, side * 0.4]));
      prims.push(segE(hip, ankle, 1.2, 1.2, [1, 0, 0], 12, 12, M_FEET));
      for (const a of [-0.45, 0, 0.45]) {
        const d = V2W(root, nrm([0.35 * Math.cos(a), -1, Math.sin(a) * 0.5 + side * 0.1]));
        prims.push(segE(ankle, add(ankle, scl(d, 3.4)), 0.75, 0.75, [1, 0, 0], 12, 12, M_FEET, 1.15));
      }
      feet.push(add(ankle, V2W(root, [0, -3.4, 0])));
    }

    // --- eyes and anchors
    const onBody = (az, v) => { const s = sph(az, v); return { p: P2W(bodyF, [BR[0] * s[0], BR[1] * s[1], BR[2] * s[2]]), s }; };
    const eyeN = onBody(EYE_AZ, EYE_V), eyeF = onBody(-EYE_AZ, EYE_V);
    const flip = (P.side ?? 1) < 0;
    const kind = P.eyes === 'happy' || P.eyes === 'closed' || P.eyes === 'blink' ? P.eyes : 'open';
    const stamps = [
      { at: Object.assign({ prim: bodyPrim }, eyeN), set: null, kind, flip, far: 0.45, near: 0.72 },
      { at: Object.assign({ prim: bodyPrim }, eyeF), set: null, kind, flip, far: 0.45, near: 0.72 },
    ];
    const anchors = {
      top: featherTips[0][1] > featherTips[1][1] ? featherTips[0] : featherTips[1],
      featherN: featherTips[0], featherF: featherTips[1],
      head: P2W(bodyF, [3, 7, 0]),
      mouth: P2W(bkF, [4, -2.5, 0]),
      beak: P2W(bkF, [6.5, 1, 0]),
      eyeN: eyeN.p, eyeF: eyeF.p,
      body: bodyF.t,
      wingTipN: tips[0], wingTipF: tips[1],
      feet: scl(add(feet[0], feet[1]), 0.5),
    };
    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 2, 4: 1, 5: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 0, 12: 1 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 12,
    };
  }

  function render(model, opt) {
    const pal = opt.pal || PAL;
    const big = (opt.scale || 1) >= 0.8;
    const colors = { k: pal[EYEK].r[1], w: pal[EYEW].r[2] };
    for (const st of model.stamps) {
      st.set = st.flip ? (big ? EYES_LM : EYES_SM) : big ? EYES_L : EYES_S;
      st.colors = colors;
      st._c = null;
    }
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 112, bh: 90, oy: 0.88 } };
})();
