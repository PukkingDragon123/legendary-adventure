/* ------------------------------------------------------------------
   Castform — the Weather Pokémon (0.3 m ≈ 52 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0. y = 0 is the
   ground point under it: Castform floats, its lowest point hovers ~7-15
   units above the ground (see `bob`).

   Forms (pose.form):
     'normal'  white-grey round head with a curled swirl on top, cupped by a
               blue-grey cloud whose two ends curl up at its sides
     'sunny'   orange-red sun: yellow face disc ringed by eight flame-ray petals
               (the top one big and curling back)
     'rainy'   raindrop: pale-blue face in a dark-blue water "hood" that rises
               into a pointed drop tip and hangs down in water-drop locks
     'snowy'   pale icy-lavender face inside a periwinkle hail-cloud hood with a
               lumpy hail rim, a small cloud tuft and icicle hail points below

   Pose params:
     form   'normal' | 'sunny' | 'rainy' | 'snowy'
     bob    0..1     float height: 0 = low, 1 = high (8 units of travel); animate with a sine
     mouth  0..1     mouth open amount (0 = small smile)
     eyes   'open' | 'happy' | 'closed' | 'blink'
     spin   radians  whole-body twirl about the vertical axis (transformation twirl)
     tilt   -1..1    head tilt / sway sideways (cute lean), default 0
     squash -1..1    squash (+, flattened and wider) / stretch (−, taller) about the body centre:
                     a pop for the moment it changes form, default 0
   Anchors: top, head, mouth, eyeN, eyeF, body, bottom (lowest point, for drips /
   sparkles), tip (tip of the swirl / flame / drop point).
------------------------------------------------------------------- */
const Castform = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const HEAD = 1, CLOUD = 2, SUNF = 3, SUNR = 4, RAINF = 5, RAINH = 6, SNOWF = 7, SNOWH = 8, ICE = 9, MOUTH = 10, TONGUE = 11;
  const MAT = { HEAD, CLOUD, SUNF, SUNR, RAINF, RAINH, SNOWF, SNOWH, ICE, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [HEAD]:   { r: ['#9ca1b9', '#c2c6d8', '#e8eaf2', '#f7f8fc', '#ffffff'], od: '#474c6a', ol: '#7a7f9a', ln: '#8a8fa8' },
    [CLOUD]:  { r: ['#4d5a82', '#67779f', '#8595b9', '#a7b4d1', '#cad3e7'], od: '#262e50', ol: '#4a5682', ln: '#4c5883' },
    [SUNF]:   { r: ['#d8951c', '#f0b52c', '#fcd64e', '#ffe98a', '#fff7c8'], od: '#7a4410', ol: '#b06c18', ln: '#b87218' },
    [SUNR]:   { r: ['#b3301a', '#d84b22', '#f26c30', '#ff9450', '#ffbe82'], od: '#661408', ol: '#9c2a12', ln: '#9a2a12' },
    [RAINF]:  { r: ['#5a9fd6', '#7ebeea', '#a4daf8', '#c8ecfd', '#eefaff'], od: '#1b4c8a', ol: '#3a76b6', ln: '#3c7aba' },
    [RAINH]:  { r: ['#1c4696', '#2a60ba', '#3c80da', '#5fa0ee', '#9ccaf8'], od: '#0c2256', ol: '#1c448c', ln: '#1c4088' },
    [SNOWF]:  { r: ['#a4a4d0', '#c6c6e6', '#e6e4f6', '#f4f3fc', '#ffffff'], od: '#4a4686', ol: '#7a78b4', ln: '#8886c0' },
    [SNOWH]:  { r: ['#57549a', '#716eb8', '#918ed4', '#b3b1e8', '#d6d5f7'], od: '#2a2764', ol: '#4c4990', ln: '#4c4990' },
    [ICE]:    { r: ['#86b0d8', '#aacfec', '#d2ebfa', '#eef8ff', '#ffffff'], od: '#305c8c', ol: '#5886b4', ln: '#6894c0' },
    [MOUTH]:  { r: ['#681a2a', '#882436', '#a83444', '#c24a58', '#da6a72'], od: '#3a0a16', ol: '#5a1424', ln: '#5a1424' },
    [TONGUE]: { r: ['#c6506a', '#de6a80', '#f28c9a', '#ffb0b8', '#ffd2d4'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [RAINF]: 1, [RAINH]: 1, [ICE]: 1 };

  const DEFAULT = { form: 'normal', bob: 0, mouth: 0, eyes: 'open', spin: 0, tilt: 0, squash: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross, dot = V3.dot;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
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
  // a tapered chain of ellipsoids along a polyline of { p, r:[along, up, side] } nodes
  function tube(f, nodes, up, part, grp, mat, out) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[Math.max(0, i - 1)].p, b = nodes[Math.min(nodes.length - 1, i + 1)].p;
      out.push(ellAlong(f, nodes[i].p, sub(b, a), up, nodes[i].r, part, grp, mat));
    }
  }
  const pt = (x, y, z, r0, r1, r2) => ({ p: [x, y, z], r: [r0, r1, r2 === undefined ? r1 : r2] });

  let curScale = 1;

  /* ---------- face decals: the mouth (on the face prim's unit sphere) ---------- */
  const EAZ = 0.44, EV = 0.06; // eye direction on the face prim
  const MV = -0.36; // mouth line height
  function mouthMat(s, open, base) {
    if (s[0] < 0.55) return base;
    const az = Math.atan2(s[2], s[0]);
    const px = 1 / (curScale * 14);
    if (open < 0.08) {
      // closed: a small smile (1 px curve, corners up)
      const k = az / 0.2;
      if (Math.abs(k) > 1) return base;
      const vm = MV + 0.07 * k * k;
      return s[1] < vm + 0.02 && s[1] > vm - Math.max(0.075, 1.5 * px) ? code(MOUTH) : base;
    }
    // open: a "D" on its back — flat-ish top lip, round bottom; tongue at the bottom
    const w = 0.2 + 0.06 * open, k = az / w;
    if (Math.abs(k) > 1) return base;
    const top = MV + 0.05 + 0.03 * k * k;
    const bot = top - (0.08 + 0.2 * open) * Math.sqrt(1 - k * k);
    if (s[1] > top || s[1] < bot) return base;
    return s[1] < bot + (top - bot) * 0.42 && Math.abs(k) < 0.72 && open > 0.3 ? code(TONGUE) : code(MOUTH);
  }

  /* ---------- eye stamps: tall black ovals with a white shine (k black, w white, b blue glint) ---------- */
  const EYES_S = { // scale < 0.75
    open: ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'],
    openN: ['.k.', 'kwk', 'kkk', 'kbk', '.k.'],
    openF: ['kk', 'wk', 'kk', 'kk'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['kk', 'k.'],
    blink: ['kkkk', '.kk.'], blinkN: ['kkk', '.k.'], blinkF: ['kk'],
    sleep: ['k..k', '.kk.'], sleepN: ['k.k', '.k.'], sleepF: ['k.', '.k'],
  };
  const EYES_M = { // 0.75 .. 1.4
    open: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkkk', 'kkkbk', '.kkk.'],
    openN: ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkkk', 'kkbk', '.kk.'],
    openF: ['.k.', 'kwk', 'kkk', 'kkk', 'kbk', '.k.'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k.', 'k.k', 'k.k'],
    blink: ['.....', '.....', 'kkkkk', '.kkk.'], blinkN: ['....', '....', 'kkkk', '.kk.'], blinkF: ['...', '...', 'kkk', '.k.'],
    sleep: ['k...k', '.kkk.'], sleepN: ['k..k', '.kk.'], sleepF: ['k.k', '.k.'],
  };
  const EYES_L = { // >= 1.4
    open: ['..kkk..', '.kwwkkk', 'kwwwkkk', 'kwwkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkbk', '.kkkbbk', '..kkk..'],
    openN: ['.kkk.', 'kwwkk', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkkk', 'kkkbk', 'kkbbk', '.kkk.'],
    openF: ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkkk', 'kkbk', '.kk.'],
    happy: ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], happyN: ['.kkk.', 'k...k', 'k...k'], happyF: ['.kk.', 'k..k', 'k..k'],
    blink: ['.......', '.......', '.......', 'kkkkkkk', '.kkkkk.'], blinkN: ['.....', '.....', '.....', 'kkkkk', '.kkk.'], blinkF: ['....', '....', '....', 'kkkk', '.kk.'],
    sleep: ['k.....k', '.kkkkk.'], sleepN: ['k...k', '.kkk.'], sleepF: ['k..k', '.kk.'],
  };
  const EYEC = { k: '#161a2c', w: '#ffffff', b: '#3a4a7c' };

  /* ---------- build ---------- */
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const form = P.form === 'sunny' || P.form === 'rainy' || P.form === 'snowy' ? P.form : 'normal';
    const bob = clamp(+P.bob || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const tilt = clamp(+P.tilt || 0, -1, 1) * 0.28;
    const prims = [], anchors = {};
    const h0 = 7 + 8 * bob; // hover height of the lowest point
    // whole-body twirl about the vertical axis; squash / stretch about the body centre (y ≈ 24 above h0)
    const sq = clamp(+P.squash || 0, -1, 1);
    const root = chain(T(0, h0 + 24, 0), F(M3.diag(1 + 0.14 * sq, 1 - 0.22 * sq, 1 + 0.14 * sq), [0, 0, 0]), T(0, -24, 0), R(M3.ry(+P.spin || 0)));
    let faceP = null, headF = null, tip = null, bottomY = 0, topP = null;

    if (form === 'normal') {
      headF = chain(root, T(0, 25, 0), R(M3.rx(tilt)));
      const HR = [15.5, 15, 15.5];
      faceP = ellF(headF, HR, 1, 1, (s) => mouthMat(s, mo, CH));
      prims.push(faceP);
      // swirl on top: a soft cone that rises and curls over toward the back
      const sw = [];
      tube(headF, [
        pt(0.4, 11.8, 0, 6.6, 5.9), pt(-0.8, 16.4, 0, 5.8, 4.8), pt(-2.9, 20.4, 0, 4.8, 3.8), pt(-6, 22.8, 0, 4, 2.9),
        pt(-9.2, 22.9, 0, 3.2, 2.3), pt(-11.2, 20.9, 0, 2.6, 1.8), pt(-11.4, 18.6, 0, 1.9, 1.4),
      ], [0, 0, 1], 1, 1, CH_F, sw);
      prims.push(...sw);
      tip = inF(headF, [-11.2, 18.4, 0]);
      topP = inF(headF, [-4, 25.5, 0]);
      // blue-grey cloud cupping the head from below (a crescent of puffs), both ends curling up at the sides
      const cl = chain(root, R(M3.rx(tilt * 0.4)));
      prims.push(ellF(chain(cl, T(-1, 7.6, 0)), [14.5, 7.4, 12.5], 2, 3, CC));
      prims.push(ellF(chain(cl, T(-11, 9, 0)), [8, 6.4, 9], 2, 3, CC));
      for (const sd of [1, -1]) {
        const id = sd > 0 ? 4 : 5;
        tube(cl, [pt(2.5, 7.2, sd * 9.5, 7.4, 6.6, 6.8), pt(1.8, 9.6, sd * 15, 5.6, 5, 5.2), pt(0.8, 14.2, sd * 18.2, 4.4, 3.9, 3.9), pt(0, 18.8, sd * 18.4, 3.4, 2.9, 2.9), pt(-0.4, 21.6, sd * 16.4, 2.6, 2.1, 2.1), pt(-0.4, 21.4, sd * 13.8, 1.9, 1.6, 1.6)], [1, 0, 0], id, id, CC, prims);
      }
      bottomY = h0 + 0.4;
    } else if (form === 'sunny') {
      headF = chain(root, T(0, 25, 0), R(M3.rx(tilt)));
      // orange sun body with a yellow face disc bulging in front
      prims.push(ellF(headF, [12.5, 13.6, 13.6], 2, 2, CSR));
      faceP = ellF(chain(headF, T(4.6, 0, 0)), [9, 12.4, 12.4], 1, 1, (s) => mouthMat(s, mo, CSF));
      prims.push(faceP);
      // eight flame-ray petals around the face; the top one is big and curls back
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 4; // angle in the face plane, from +z toward +y
        const ca = Math.cos(a), sa = Math.sin(a);
        const d = nrm([-0.34, sa, ca]);
        const perp = [0, ca, -sa]; // in-plane, perpendicular to the ray
        const nodes = [];
        const top = i === 0;
        const len = top ? 16.5 : 12, wd = top ? 7.6 : 7.2;
        const r0 = 9.6;
        const curl = top ? 0 : 0.1;
        for (const [t, k] of [[0, 1], [0.34, 0.74], [0.62, 0.48], [0.86, 0.27]]) {
          const p = add(add(sc(d, r0 + len * t), sc(perp, curl * len * t * t * 3)), top ? [-7 * t * t, -2.5 * t * t, 0] : [0, 0, 0]);
          nodes.push({ p, r: [wd * (0.9 - 0.25 * t), 4.2 * k + 0.6, wd * k] });
        }
        const g = 10 + i;
        tube(headF, nodes, [1, 0, 0], 4 + i, g, CSR, prims);
        if (top) tip = inF(headF, add(sc(d, r0 + len), [-7, -2.5, 0]));
      }
      topP = inF(headF, [-3, 27, 0]);
      bottomY = h0 + 3;
    } else if (form === 'rainy') {
      headF = chain(root, T(0, 20, 0), R(M3.rx(tilt)));
      const FR = [14, 13.6, 14];
      faceP = ellF(headF, FR, 1, 1, (s) => mouthMat(s, mo, CRF));
      prims.push(faceP);
      // dark-blue water hood (face window in front) rising into a pointed drop tip
      const HR = V3.scale(FR, 1.08);
      const hoodMat = (s) => {
        const az = Math.abs(Math.atan2(s[2], s[0]));
        const v = s[1];
        // window: the lower front, arching over the brow with a centre peak (a lock of bangs)
        const brow = 0.42 - 0.2 * Math.exp(-(az * az) / 0.03) - 0.3 * (az / 1.25) ** 2;
        if (az < 1.25 && v < brow) return 0;
        if (v < -0.55 && az < 2.2) return 0;
        return CRH();
      };
      prims.push(ellF(headF, HR, 2, 2, hoodMat));
      // the raindrop point: one long ellipsoid plus a slim tip, leaning back a little
      prims.push(ellAlong(headF, [-1.6, 17, 0], [-0.22, 1, 0], [1, 0, 0], [11.5, 7.6, 7.8], 2, 2, CRH));
      prims.push(ellAlong(headF, [-4.6, 26.2, 0], [-0.42, 1, 0], [1, 0, 0], [5.4, 2.8, 2.9], 2, 2, CRH));
      tip = inF(headF, [-6.6, 30.6, 0]);
      topP = tip;
      bottomY = h0 + 5;
      // water-drop locks: a big drop hanging down each side of the face (point up, merging into the hood)
      for (const sd of [1, -1]) {
        const id = sd > 0 ? 3 : 4;
        prims.push(ellAlong(headF, [1.2, 1.5, sd * 12.9], [0.1, 1, sd * 0.12], [1, 0, 0], [7, 3.6, 2.6], id, id, CRH));
        prims.push(ellAlong(headF, [1.6, -8.4, sd * 12.6], [0.05, 1, -sd * 0.1], [1, 0, 0], [6.4, 5.2, 3.6], id, id, CRH));
      }
    } else {
      headF = chain(root, T(0, 23, 0), R(M3.rx(tilt)));
      const FR = [14, 13.6, 14];
      faceP = ellF(headF, FR, 1, 1, (s) => mouthMat(s, mo, CSNF));
      prims.push(faceP);
      // periwinkle hail-cloud hood with a round face window
      const HR = [16, 16.4, 16.6];
      const WIN = 0.64; // cos of the window's angular radius
      const WC = nrm([1, -0.1, 0]);
      prims.push(ellF(headF, HR, 2, 2, (s) => (dot(s, WC) > WIN ? 0 : CSNH())));
      // thick rim around the window (a rounded collar), studded with hail lumps
      const ang = Math.acos(WIN), rr = Math.sin(ang);
      const rimC = sc(WC, Math.cos(ang) * HR[0] * 0.97);
      const RR = [3.2, rr * HR[1] + 2.4, rr * HR[2] + 2.4], RIN = (rr * HR[1] - 1.2) / RR[1];
      prims.push(ellAlong(headF, rimC, WC, [0, 1, 0], RR, 3, 3, (s) => (s[1] * s[1] + s[2] * s[2] < RIN * RIN && s[0] > 0 ? 0 : CSNH_L())));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const dir = nrm(add(sc(WC, Math.cos(ang) * 0.9), add(sc([0, 1, 0], rr * 1.12 * Math.sin(a)), sc([0, 0, 1], rr * 1.12 * Math.cos(a)))));
        const p = [dir[0] * HR[0], dir[1] * HR[1], dir[2] * HR[2]];
        prims.push(ellAlong(headF, p, dir, [0, 1, 0], [3, 4.4, 4.4], 3, 3, CSNH_L));
      }
      // cloud tuft on top
      prims.push(ellF(chain(headF, T(-2.5, 15, 0)), [7.6, 5.4, 7], 4, 4, CSNH));
      prims.push(ellF(chain(headF, T(-7.2, 19, 0)), [4.8, 4, 4.4], 4, 4, CSNH));
      prims.push(ellF(chain(headF, T(-10.2, 21.6, 0)), [2.8, 2.6, 2.8], 4, 4, CSNH));
      tip = inF(headF, [-10.6, 23.8, 0]);
      topP = inF(headF, [-4, 20.6, 0]);
      // icicle hail points dangling under the back and sides of the hood (the face stays clear)
      for (const [az, L] of [[1.7, 4.6], [Math.PI, 5.4], [-1.7, 4.6], [2.45, 3.4], [-2.45, 3.4]]) {
        const ca = Math.cos(az), sa = Math.sin(az);
        const v = -0.74;
        const cr = Math.sqrt(1 - v * v);
        const p = [HR[0] * cr * ca * 0.98, HR[1] * v - L * 0.45, HR[2] * cr * sa * 0.98];
        prims.push(ellAlong(headF, p, [0.12 * ca, -1, 0.12 * sa], [ca, 0, sa], [L, 2.3, 2.4], 5, 6, CICE));
      }
      bottomY = h0 + 3;
    }

    // eyes: stamps on the face prim
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : P.eyes === 'closed' ? 'sleep' : 'open';
    const stamps = [];
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EAZ, EV);
      const at = { prim: faceP, p: add(faceP.c, M3.v(faceP.L, s)), s };
      stamps.push({ at, set: EYES_M, colors: EYEC, kind, near: 0.8, far: 0.45 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    const ms = Creature.sph(0, MV - 0.05);
    anchors.mouth = add(faceP.c, M3.v(faceP.L, ms));
    anchors.head = headF.t;
    anchors.body = headF.t;
    anchors.top = topP;
    anchors.tip = tip;
    anchors.bottom = [0, bottomY, 0];
    return {
      prims, stamps, dots: [], anchors, pose: P, form,
      pri: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0 },
      glossy: GLOSSY, baseMat: form === 'sunny' ? SUNF : form === 'rainy' ? RAINF : form === 'snowy' ? SNOWF : HEAD,
      shadowSteps: 16, shadowDepth: 10,
    };
  }
  const CH = code(HEAD), CH_F = K(HEAD), CC = K(CLOUD), CSF = code(SUNF), CSR = K(SUNR), CRF = code(RAINF), CRH = K(RAINH);
  const CSNF = code(SNOWF), CSNH = K(SNOWH), CSNH_L = K(SNOWH, 1), CICE = K(ICE);

  function render(model, opt) {
    curScale = opt.scale || 1;
    const set = curScale >= 1.4 ? EYES_L : curScale >= 0.75 ? EYES_M : EYES_S;
    for (const st of model.stamps) st.set = set;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, FORMS: ['normal', 'sunny', 'rainy', 'snowy'], meta: { heightM: 0.3, bw: 84, bh: 96, oy: 0.9 } };
})();
