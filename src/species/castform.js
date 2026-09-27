/* ------------------------------------------------------------------
   Castform — the Weather Pokémon (0.3 m ≈ 52 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0. y = 0 is the
   ground point under it: Castform floats, its lowest point hovers ~5-13
   units above the ground (see `bob`).

   Every form shares one face: a white figure-8 "mask" (two round lobes around
   the eyes, a rounded notch above and the little moustache bump below), big
   black oval eyes with a white shine, a small mouth under the moustache.
   Eyes and mouth are hand-drawn stamps so they stay crisp and symmetrical at
   every size; the mask is a smooth decal on the face sphere.

   Forms (pose.form):
     'normal'  pearly white round head with a smooth crescent swirl on top, the mask
               ringed by a thin grey outline, a small smile; a soft grey cloud body
               below (two round buns in front, a little curled wisp at the back)
     'sunny'   red face disc with a yellow mask in an orange rim, eight glossy orange
               sun balls around it (the top one biggest); a white cloud with a long wisp
     'rainy'   a glossy light-blue raindrop (pointed tip up) with a deep-blue face
               window and a light-blue mask; a grey bell-shaped cloud below
     'snowy'   purple face with a lavender mask, wrapped in a pale icy cloud hood
               (big puffs at the lower sides), a spiral cloud ring floating above
               and one long icicle hanging below

   Pose params:
     form   'normal' | 'sunny' | 'rainy' | 'snowy'
     bob    0..1     float height: 0 = low, 1 = high (8 units of travel); animate with a sine
     mouth  0..1     mouth open amount (0 = small smile / the form's small open mouth)
     eyes   'open' | 'happy' | 'closed' | 'blink'
     spin   radians  whole-body twirl about the vertical axis (transformation twirl)
     tilt   -1..1    head tilt / sway sideways (cute lean), default 0
     squash -1..1    squash (+, flattened and wider) / stretch (−, taller) about the body centre:
                     a pop for the moment it changes form, default 0
   Anchors: top, head, mouth, eyeN, eyeF, body, bottom (lowest point, for drips /
   sparkles), tip (tip of the swirl / top sun ball / drop point / ring).
------------------------------------------------------------------- */
const Castform = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const HEAD = 1, CLOUD = 2, SUNF = 3, SUNR = 4, RAINF = 5, RAINH = 6, SNOWF = 7, SNOWH = 8, ICE = 9, MOUTH = 10, TONGUE = 11;
  const EYE = 12, WHITE = 13, MASK = 14, SUNO = 15, SNOWM = 16, CLOUDW = 17, RAINM = 18;
  const MAT = { HEAD, CLOUD, SUNF, SUNR, RAINF, RAINH, SNOWF, SNOWH, ICE, MOUTH, TONGUE, EYE, WHITE, MASK, SUNO, SNOWM, CLOUDW, RAINM };
  const PAL = Creature.palette({
    // normal: pearly head, white mask, grey mask outline, soft grey cloud
    [HEAD]:   { r: ['#a9a7c6', '#c6c4dc', '#dfdeed', '#efeff8', '#fdfdff'], od: '#4e4b74', ol: '#7a779e', ln: '#8d8aad' },
    [WHITE]:  { r: ['#d0d2e6', '#e9eaf6', '#fafaff', '#ffffff', '#ffffff'], od: '#55527a', ol: '#8581a6', ln: '#9491b3' },
    [MASK]:   { r: ['#6e6b92', '#7e7ba1', '#8e8baf', '#9d9abc', '#adaac8'], od: '#46436a', ol: '#6a678e', ln: '#6a678e' },
    [CLOUD]:  { r: ['#9391ad', '#adabc4', '#c5c4d8', '#d8d7e6', '#ebebf4'], od: '#484668', ol: '#716f90', ln: '#7c7a9a' },
    [CLOUDW]: { r: ['#b4b8d0', '#d0d3e5', '#eaecf6', '#f7f8fc', '#ffffff'], od: '#555a80', ol: '#8286a8', ln: '#9094b4' },
    // sunny
    [SUNR]:   { r: ['#a8261c', '#cc3624', '#e8502e', '#f4704a', '#ff9a74'], od: '#5e0e0a', ol: '#962016', ln: '#8e1e14' },
    [SUNF]:   { r: ['#d8961e', '#f0b62e', '#fcd44a', '#ffe680', '#fff4bc'], od: '#7a4410', ol: '#b06c18', ln: '#b87218' },
    [SUNO]:   { r: ['#c8601c', '#e47e2c', '#f7a044', '#ffbc68', '#ffdca0'], od: '#6e2a08', ol: '#a44a14', ln: '#b0561a' },
    // rainy
    [RAINH]:  { r: ['#3f8fd0', '#5aaae4', '#7cc6f2', '#a4dcf8', '#d8f2ff'], od: '#18508e', ol: '#3a7cba', ln: '#3c7fbe' },
    [RAINF]:  { r: ['#1c4c98', '#2660b4', '#3278ce', '#4a92e0', '#78b4f0'], od: '#0c2256', ol: '#1c448c', ln: '#173c80' },
    [RAINM]:  { r: ['#6aaee0', '#88c6ee', '#aadcf8', '#c8eaff', '#e8f8ff'], od: '#1b4c8a', ol: '#3a76b6', ln: '#4a86c2' },
    // snowy
    [SNOWF]:  { r: ['#4e4096', '#6254ae', '#7868c4', '#9282d6', '#b2a6e8'], od: '#261c5e', ol: '#443888', ln: '#403486' },
    [SNOWM]:  { r: ['#9c92d4', '#b4abe6', '#cbc4f4', '#dedaff', '#f2f0ff'], od: '#3a3280', ol: '#5e56a4', ln: '#6a62ae' },
    [SNOWH]:  { r: ['#8fb8b8', '#aed2d0', '#cae6e2', '#e0f4f0', '#f6fffc'], od: '#3c6a70', ol: '#6a9696', ln: '#78a2a2' },
    [ICE]:    { r: ['#7fb2c4', '#a2cede', '#c4e6ee', '#e2f6fa', '#ffffff'], od: '#2e5e74', ol: '#5a8aa0', ln: '#6896aa' },
    // shared
    [MOUTH]:  { r: ['#6a1a2c', '#88263a', '#a0324a', '#b8465c', '#cc6072'], od: '#3a0a16', ol: '#5a1424', ln: '#5a1424' },
    [TONGUE]: { r: ['#c8506a', '#de6a80', '#f28c9a', '#ffb0b8', '#ffd2d4'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
    [EYE]:    { r: ['#0c0e1c', '#121426', '#181b30', '#22263e', '#2e344e'], od: '#05060c', ol: '#0a0c18', ln: '#0a0c18' },
  });
  const GLOSSY = { [SUNO]: 1, [RAINH]: 1, [ICE]: 1 };

  const DEFAULT = { form: 'normal', bob: 0, mouth: 0, eyes: 'open', spin: 0, tilt: 0, squash: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const sphAt = (f, p, r, part, grp, mat) => ellF(chain(f, T(p[0], p[1], p[2])), Array.isArray(r) ? r : [r, r, r], part, grp, mat);
  const K = (m, b = 0) => { const c = code(m, b); return () => c; };
  // rotation whose x axis is d and whose y axis is as close as possible to `up`
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (Math.hypot(Z[0], Z[1], Z[2]) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid in frame f centred at p (frame-local), long axis along d, radii [along, up-ish, side]
  const ellAlong = (f, p, d, up, r, part, grp, mat) => E(inF(f, p), M3.mul(f.L, M3.mul(axesAlong(d, up), M3.diag(r[0], r[1], r[2]))), part, grp, mat);
  // smooth tapered tube: Catmull-Rom through control nodes { p, r }, densely sampled with
  // overlapping ellipsoids stretched along the curve (no lumps, no seams)
  function tube(f, ctrl, up, samples, part, grp, mat, out) {
    const n = ctrl.length, get = (i) => ctrl[clamp(i, 0, n - 1)];
    const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    const pts = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < samples; k++) {
        const t = k / samples, a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
        pts.push({ p: [0, 1, 2].map((j) => cr(a.p[j], b.p[j], c.p[j], d.p[j], t)), r: Math.max(0.3, cr(a.r, b.r, c.r, d.r, t)) });
      }
    }
    pts.push(ctrl[n - 1]);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p;
      const d = sub(b, a), seg = Math.hypot(d[0], d[1], d[2]) * (i > 0 && i < pts.length - 1 ? 0.5 : 1);
      const r = pts[i].r;
      out.push(ellAlong(f, pts[i].p, d, up, [Math.max(r * 0.9, seg * 1.6), r, r], part, grp, mat));
    }
    return pts[pts.length - 1].p;
  }
  const nd = (x, y, z, r) => ({ p: [x, y, z], r });

  let curScale = 1;

  /* ---------- face decal: the figure-8 mask on the face sphere ---------- */
  // eye directions on the face sphere: azimuth ±EAZ, elevation EEL (radians)
  const EAZ = 0.44, EEL = 0.0, MEL = -0.5;        // MEL: mouth elevation
  const LA = 0.62, LB = 0.45;                       // mask lobe half axes (az, el)
  const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  function maskQ(az, el) {
    const l1 = Math.hypot((az - EAZ) / LA, (el - EEL) / LB) - 1;
    const l2 = Math.hypot((az + EAZ) / LA, (el - EEL) / LB) - 1;
    let q = smin(l1, l2, 0.35);
    const top = Math.hypot(az / 0.22, (el - 0.44) / 0.2) - 1;       // rounded notch above, between the lobes
    const bot = Math.hypot(az / 0.25, (el + 0.4) / 0.21) - 1;       // the moustache bump below
    q = Math.max(q, -top * 0.5, -bot * 0.5);
    return q;
  }
  // FC = { base, mask, line?, R } material codes and the face radius (model units)
  // big renders (dex photos): eyes and mouth are drawn here as smooth decals instead of stamps
  let bigFace = false;
  const EW = 0.15, EH = 0.2;                        // eye oval half axes (radians)
  function bigFeatures(az, el, px, look) {
    const lw = Math.max(0.035, 0.85 * px);
    const ew = EW * look.es, eh = EH * look.es;
    for (const sd of [1, -1]) {
      const dx = az - sd * EAZ, dy = el - EEL;
      if (Math.abs(dx) > ew * 1.4 || Math.abs(dy) > eh * 1.4) continue;
      const r = Math.hypot(dx / ew, dy / eh);
      if (look.eye === 'open') {
        if (r < 1) return Math.hypot((dx - 0.3 * ew) / (0.41 * ew), (dy - 0.37 * eh) / (0.36 * eh)) < 1 ? C_SHINE : C_EYE;
      } else if (look.eye === 'happy') {
        if (Math.abs(r - 0.78) < lw / ew && dy > -0.03) return C_EYE;
      } else if (Math.abs(dy + 0.03) < lw * 0.8 && Math.abs(dx) < ew * 1.05) return C_EYE;
    }
    const mo = look.mo;
    if (look.mouth === 'smile') {
      const k = az / 0.21;
      if (Math.abs(k) < 1 && Math.abs(el - (MEL + 0.1 * k * k)) < lw * 0.75) return C_LIP;
      return 0;
    }
    const w = 0.17 + 0.07 * mo, k = az / w;
    if (Math.abs(k) >= 1.08) return 0;
    const top = MEL + 0.07 + 0.03 * k * k;
    const bot = top - (0.1 + 0.2 * mo) * Math.sqrt(Math.max(0, 1 - k * k));
    if (Math.abs(k) < 1 && el < top && el > bot) return el < bot + (top - bot) * 0.45 && Math.abs(k) < 0.78 ? C_TONGUE : C_MOUTH;
    if (el < top + lw && el > bot - lw) return C_LIP;
    return 0;
  }
  function faceMat(s, FC, look) {
    if (s[0] < -0.2) return FC.base;
    const az = Math.atan2(s[2], s[0]), el = Math.asin(clamp(s[1], -1, 1));
    if (Math.abs(az) > 1.35) return FC.base;
    if (bigFace) { const f = bigFeatures(az, el, 1 / (curScale * FC.R), look); if (f) return f; }
    const ms = look.es > 1 ? 1.08 : 1;               // the weather forms' masks are a touch bigger, like their eyes
    const q = maskQ(az / ms, (el - EEL) / ms + EEL);
    if (q < 0) return FC.mask;
    if (FC.line) {
      const px = 1 / (curScale * FC.R);              // one pixel, in radians on the face
      if (q < Math.max(0.05, (0.95 * px) / LB)) return FC.line;
    }
    return FC.base;
  }

  /* ---------- build ---------- */
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const form = P.form === 'sunny' || P.form === 'rainy' || P.form === 'snowy' ? P.form : 'normal';
    const bob = clamp(+P.bob || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const eyeKind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' || P.eyes === 'closed' ? 'blink' : 'open';
    const mouthKind = mo >= 0.6 ? 'wide' : mo >= 0.15 || form !== 'normal' ? 'open' : 'smile';
    const look = { eye: eyeKind, mouth: mouthKind, mo: form === 'normal' ? mo : Math.max(0.25, mo), es: form === 'normal' ? 1 : 1.18 };
    const tilt = clamp(+P.tilt || 0, -1, 1) * 0.28;
    const prims = [], anchors = {};
    const h0 = 5 + 8 * bob; // hover height of the lowest point
    const sq = clamp(+P.squash || 0, -1, 1);
    const root = chain(T(0, h0 + 22, 0), F(M3.diag(1 + 0.14 * sq, 1 - 0.22 * sq, 1 + 0.14 * sq), [0, 0, 0]), T(0, -22 - h0, 0), R(M3.ry(+P.spin || 0)));
    const cl = chain(root, T(0, h0, 0), R(M3.rx(tilt * 0.35)));  // cloud frame: y = 0 at the lowest point
    let faceP = null, faceR = 15, headF = null, tip = null, bottomY = h0, topP = null;

    if (form === 'normal') {
      headF = chain(root, T(0, h0 + 29, 0), R(M3.rx(tilt)));
      faceR = 15.2;
      faceP = ellF(headF, [15, 14.6, 15.4], 1, 1, (s) => faceMat(s, FN, look));
      prims.push(faceP);
      // crescent swirl: rises from the crown and curls over to one side
      tip = tube(headF, [nd(-1, 11, 0.6, 4.7), nd(-1.5, 16, -0.3, 3.6), nd(-2.8, 20.4, -2.2, 2.6), nd(-4.8, 23, -5, 1.8), nd(-6.6, 23.4, -8, 1.1), nd(-7.6, 22, -10.4, 0.45)], [1, 0, 0], 5, 3, 1, CH_S, prims);
      tip = inF(headF, tip);
      topP = inF(headF, [-2.4, 25, -5]);
      // soft grey cloud body: a round puff under the head, two buns in front, a curled wisp behind
      prims.push(sphAt(cl, [-1.6, 9.6, 0], [8.4, 6.6, 8.6], 12, 12, CC));
      prims.push(sphAt(cl, [1.6, 6.3, 4.5], [6.3, 6.3, 6.1], 13, 13, CC));
      prims.push(sphAt(cl, [1.6, 6.3, -4.5], [6.3, 6.3, 6.1], 14, 14, CC));
      prims.push(sphAt(cl, [-4.6, 6.4, 0], [5.6, 5.8, 6.8], 15, 15, CC));
      tube(cl, [nd(-5, 7.4, -3, 3.6), nd(-9.5, 7.2, -6.2, 2.8), nd(-13.4, 8.4, -8.4, 1.9), nd(-15.2, 10.6, -9.2, 1.1), nd(-15, 12.4, -9, 0.45)], [0, 1, 0], 4, 16, 16, CC, prims);
    } else if (form === 'sunny') {
      headF = chain(root, T(0, h0 + 29, 0), R(M3.rx(tilt)));
      faceR = 11.6;
      // orange rim behind the red face disc
      prims.push(ellF(chain(headF, T(-1.2, 0, 0)), [10.6, 14.2, 14.2], 2, 2, CSO));
      faceP = ellF(chain(headF, T(2.8, 0, 0)), [9.6, 11.6, 11.6], 1, 1, (s) => faceMat(s, FS, look));
      prims.push(faceP);
      // eight glossy sun balls in a ring, the top one biggest
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, top = i === 0;
        const rr = top ? 17.6 : 16.4, r = top ? 7.6 : 6.4;
        const p = [-3.4, Math.cos(a) * rr, Math.sin(a) * rr];
        prims.push(sphAt(headF, p, r, 4 + i, 4 + i, CSO));
        if (top) tip = inF(headF, [-3.4, rr + r, 0]);
      }
      topP = tip;
      // white cloud with a long wisp sweeping out to the side
      prims.push(sphAt(cl, [-0.5, 7.2, 0], [11.4, 6.4, 11], 12, 12, CW));
      prims.push(sphAt(cl, [4.2, 4.8, 0], [5.8, 4.8, 6], 13, 13, CW));
      prims.push(sphAt(cl, [2, 5.2, 6.6], [5.6, 5, 5.4], 14, 14, CW));
      prims.push(sphAt(cl, [2, 5.2, -6.6], [5.6, 5, 5.4], 15, 15, CW));
      tube(cl, [nd(-3, 6.4, 8, 3.6), nd(-5.8, 5.6, 13.4, 2.8), nd(-7.6, 6.4, 18.4, 1.9), nd(-8, 8.4, 21.6, 1.1), nd(-7.4, 10.2, 22.6, 0.45)], [0, 1, 0], 4, 16, 16, CW, prims);
    } else if (form === 'rainy') {
      headF = chain(root, T(0, h0 + 28, 0), R(M3.rx(tilt)));
      faceR = 13.2;
      // glossy raindrop: a sphere with a straight cone rising to the tip
      prims.push(ellF(headF, [14.6, 14.6, 14.6], 2, 2, CRH));
      const cone = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; cone.push(nd(-2.4 * t * t, 7.6 + 20 * t, 0, Math.max(0.5, 12.4 * (1 - t)))); }
      tip = inF(headF, tube(headF, cone, [1, 0, 0], 3, 2, 2, CRH, prims));
      topP = tip;
      // deep-blue face window set into the front of the drop
      faceP = ellF(chain(headF, T(2, -0.6, 0)), [13.2, 13.2, 13.2], 1, 1, (s) => faceMat(s, FR_, look));
      prims.push(faceP);
      // grey bell of a cloud: a low dome ringed by seven round ribs
      prims.push(sphAt(cl, [0, 7.2, 0], [12.6, 6.4, 12.6], 12, 12, CC));
      for (let i = 0; i < 7; i++) {
        const a = ((i + 0.5) / 7) * Math.PI * 2;
        prims.push(ellAlong(cl, [Math.cos(a) * 9.4, 5, Math.sin(a) * 9.4], [0, 1, 0], [Math.cos(a), 0, Math.sin(a)], [5.2, 4.6, 4.8], 13 + i, 13 + i, CC));
      }
    } else {
      headF = chain(root, T(0, h0 + 27, 0), R(M3.rx(tilt)));
      faceR = 13;
      faceP = ellF(headF, [13, 13, 13], 1, 1, (s) => faceMat(s, FSN, look));
      prims.push(faceP);
      // pale icy cloud hood behind the face, big puffs round the lower sides
      prims.push(sphAt(headF, [-6, 1.5, 0], [9.6, 12.6, 14], 2, 2, CSNH));
      prims.push(sphAt(headF, [-7, 10.5, 0], [7, 6.4, 8], 3, 3, CSNH));
      for (const sd of [1, -1]) {
        const g = sd > 0 ? 0 : 1;
        prims.push(sphAt(headF, [1.5, -8.6, sd * 10.6], [6.4, 6.4, 6.4], 4 + g, 4 + g, CSNH));
        prims.push(sphAt(headF, [-3.2, -11.4, sd * 5.4], [5.4, 5.2, 5.4], 6 + g, 6 + g, CSNH));
        prims.push(sphAt(headF, [-7.5, 6.5, sd * 10], [5.6, 5.6, 5.6], 8 + g, 8 + g, CSNH));
      }
      // spiral cloud ring floating above the head
      const ringF = chain(headF, T(-3.5, 21.5, 0), R(M3.rz(-0.3)));
      const ring = [], turns = 1.14, n = 14, RA = 15.8, RB = 16.8;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = 0.5 + t * turns * Math.PI * 2;
        ring.push(nd(RA * Math.cos(a), -2 + 4.2 * t, RB * Math.sin(a), 1.3 + 2.1 * Math.sin(Math.PI * clamp(t * 1.12, 0, 1))));
      }
      tube(ringF, ring, [0, 1, 0], 4, 20, 20, CSNH_L, prims);
      tip = inF(ringF, [RA * Math.cos(0.5), -2, RB * Math.sin(0.5)]);
      topP = inF(ringF, [0, 4, 0]);
      // one long icicle hanging below
      const ice = tube(headF, [nd(-3, -9.6, -6.4, 3.6), nd(-2.4, -14.8, -8, 2.7), nd(-1.8, -19.6, -9.2, 1.6), nd(-1.4, -24, -10, 0.4)], [1, 0, 0], 3, 21, 21, CICE, prims);
      bottomY = inF(headF, ice)[1] - 0.4;
    }

    // eyes and mouth: hand-drawn stamps on the face sphere
    const stamps = [];
    const onFace = (az, el) => { const s = Creature.sph(az, el); return { prim: faceP, p: add(faceP.c, M3.v(faceP.L, s)), s }; };
    for (const sd of [1, -1]) {
      const at = onFace(sd * EAZ, EEL);
      stamps.push({ at, set: null, eye: true, colors: EYEC, kind: eyeKind, near: 0.8, far: 0.56, minFacing: 0.22 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    const ma = onFace(0, MEL);
    stamps.push({ at: ma, set: null, mouth: true, colors: MOUTHC, kind: mouthKind, near: 0.8, far: 0.56, minFacing: 0.3 });
    anchors.mouth = ma.p;
    anchors.head = headF.t;
    anchors.body = headF.t;
    anchors.top = topP;
    anchors.tip = tip;
    anchors.bottom = [0, bottomY, 0];
    const pri = { 1: 2, 2: 1, 3: 1 };
    for (let i = 4; i <= 21; i++) pri[i] = 0;
    return {
      prims, stamps, dots: [], anchors, pose: P, form, faceR, eyeScale: look.es,
      pri, glossy: GLOSSY, baseMat: form === 'sunny' ? SUNR : form === 'rainy' ? RAINF : form === 'snowy' ? SNOWF : HEAD,
      shadowSteps: 14, shadowDepth: 8,
    };
  }
  const CH = code(HEAD), CH_S = K(HEAD), CC = K(CLOUD), CW = K(CLOUDW), CSO = K(SUNO), CRH = K(RAINH);
  const CSNH = K(SNOWH), CSNH_L = K(SNOWH, 1), CICE = K(ICE);
  const C_EYE = code(EYE), C_SHINE = code(WHITE, 2), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_LIP = code(MOUTH, -2);
  const FN = { base: CH, mask: code(WHITE), line: code(MASK), R: 15.2 };
  const FS = { base: code(SUNR), mask: code(SUNF), R: 11.6 };
  const FR_ = { base: code(RAINF), mask: code(RAINM), R: 13.2 };
  const FSN = { base: code(SNOWF), mask: code(SNOWM), R: 13 };

  /* ---------- stamps: k = black, w = white shine; mouth: k = line, m = inside, p = tongue ---------- */
  const EYEC = { k: '#15172a', w: '#ffffff' };
  const MOUTHC = { k: '#3e1a2c', m: '#9a2e46', p: '#f28c9a' };
  // eyes by pixel size (tall ovals, shine up and to the left); N = turned a little, F = turned a lot
  const EYES = [
    { // ~4 px tall
      open: ['.k.', 'kwk', 'kkk', '.k.'], openN: ['.k', 'wk', 'kk', '.k'], openF: ['k', 'k', 'k'],
      happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k'],
      blink: ['kkk'], blinkN: ['kk'], blinkF: ['k'],
    },
    { // ~5 px
      open: ['.kk.', 'kwkk', 'kwkk', 'kkkk', '.kk.'], openN: ['.k.', 'kwk', 'kwk', 'kkk', '.k.'], openF: ['.k', 'wk', 'kk', '.k'],
      happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
      blink: ['kkkk'], blinkN: ['kkk'], blinkF: ['kk'],
    },
    { // ~7 px
      open: ['.kkk.', 'kwwkk', 'kwwkk', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'], openN: ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkkk', 'kkkk', '.kk.'], openF: ['.k.', 'kwk', 'kkk', 'kkk', 'kkk', '.k.'],
      happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k.', 'k.k', 'k.k'],
      blink: ['k...k', '.kkk.'], blinkN: ['k..k', '.kk.'], blinkF: ['k.k', '.k.'],
    },
    { // ~9 px
      open: ['..kkk..', '.kkkkk.', 'kkwwkkk', 'kwwwkkk', 'kwwkkkk', 'kkkkkkk', 'kkkkkkk', '.kkkkk.', '..kkk..'],
      openN: ['.kkk.', 'kkkkk', 'kwwkk', 'kwwkk', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'],
      openF: ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkkk', 'kkkk', '.kk.'],
      happy: ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], happyN: ['.kkk.', 'k...k', 'k...k'], happyF: ['.kk.', 'k..k', 'k..k'],
      blink: ['k.....k', '.kkkkk.'], blinkN: ['k...k', '.kkk.'], blinkF: ['k..k', '.kk.'],
    },
    { // ~12 px
      open: ['...kkk...', '..kkkkk..', '.kkkkkkk.', 'kkwwwkkkk', 'kkwwwkkkk', 'kwwwwkkkk', 'kkwwkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', '.kkkkkkk.', '..kkkkk..', '...kkk...'],
      openN: ['..kkk..', '.kkkkk.', 'kkwwkkk', 'kwwwkkk', 'kwwwkkk', 'kkwkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkkk', '.kkkkk.', '..kkk..'],
      openF: ['.kkk.', 'kwwkk', 'kwwkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'],
      happy: ['...kkk...', '.kk...kk.', 'k.......k', 'k.......k'], happyN: ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], happyF: ['.kkk.', 'k...k', 'k...k'],
      blink: ['k.......k', '.kkkkkkk.'], blinkN: ['k.....k', '.kkkkk.'], blinkF: ['k...k', '.kkk.'],
    },
  ];
  // mouths: smile (closed), open (small 'D' with a tongue), wide
  const narrow = (rows, n) => rows.map((r) => { const m = r.length >> 1; return r.slice(0, m - (n >> 1) - (n & 1)) + r.slice(m + (n >> 1)); });
  const mouthSet = (smile, open, wide) => ({ smile, open, wide, smileN: narrow(smile, 1), openN: narrow(open, 1), wideN: narrow(wide, 1), smileF: narrow(smile, 2), openF: narrow(open, 2), wideF: narrow(wide, 2) });
  const MOUTHS = [
    mouthSet(['k..k', '.kk.'], ['kkkk', 'kppk', '.kk.'], ['kkkk', 'kmmk', 'kppk', '.kk.']),
    mouthSet(['k...k', '.kkk.'], ['kkkkk', 'kmmmk', 'kpppk', '.kkk.'], ['.kkkk.', 'kmmmmk', 'kmppmk', 'kppppk', '.kkkk.']),
    mouthSet(['k.....k', '.kkkkk.'], ['kkkkkk', 'kmmmmk', 'kmppmk', '.kppk.', '..kk..'], ['.kkkkk.', 'kmmmmmk', 'kmmmmmk', 'kmpppmk', 'kpppppk', '.kkkkk.']),
    mouthSet(['k.......k', '.kk...kk.', '...kkk...'], ['kkkkkkk', 'kmmmmmk', 'kmmpmmk', 'kmpppmk', '.kpppk.', '..kkk..'], ['.kkkkkk.', 'kmmmmmmk', 'kmmmmmmk', 'kmmppmmk', 'kmppppmk', 'kppppppk', '.kkkkkk.']),
    mouthSet(['k.........k', '.kk.....kk.', '...kkkkk...'], ['kkkkkkkk', 'kmmmmmmk', 'kmmmmmmk', 'kmmppmmk', 'kmppppmk', '.kppppk.', '..kkkk..'], ['..kkkkkk..', '.kmmmmmmk.', 'kmmmmmmmmk', 'kmmmmmmmmk', 'kmmmppmmmk', 'kmmppppmmk', 'kmppppppmk', '.kppppppk.', '..kkkkkk..']),
  ];

  function render(model, opt) {
    curScale = opt.scale || 1;
    // stamp size from the on-screen face size (so the eyes keep their proportion at every scale)
    const fpx = curScale * (model.faceR || 15);          // face radius in pixels
    const epx = fpx * (model.eyeScale || 1);             // ... scaled by the form's eye size
    const i = epx < 8.5 ? 0 : epx < 12.5 ? 1 : epx < 16.5 ? 2 : epx < 23 ? 3 : 4;
    bigFace = fpx > 28;
    if (bigFace) return Creature.render(Object.assign({}, model, { stamps: [] }), opt);
    for (const st of model.stamps) st.set = st.mouth ? MOUTHS[i] : EYES[i];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, FORMS: ['normal', 'sunny', 'rainy', 'snowy'], meta: { heightM: 0.3, bw: 84, bh: 96, oy: 0.9 } };
})();
