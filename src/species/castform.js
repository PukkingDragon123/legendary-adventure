/* ------------------------------------------------------------------
   Castform — the Weather Pokémon (0.3 m ≈ 52 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0. y = 0 is the
   ground point under it: Castform floats, its lowest point hovers ~7-15
   units above the ground (see `bob`).

   Forms (pose.form):
     'normal'  white round head with a curled swirl on top, sitting on a small grey
               cloud body (lumpy bottom, little curled tail). Every form paints a big face
               decal: a dark figure-8 eye mask, big black eyes with a shine, a small smile
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
  const EYE = 12, WHITE = 13, MASK = 14, SUNO = 15, SNOWM = 16;
  const MAT = { HEAD, CLOUD, SUNF, SUNR, RAINF, RAINH, SNOWF, SNOWH, ICE, MOUTH, TONGUE, EYE, WHITE, MASK, SUNO, SNOWM };
  const PAL = Creature.palette({
    [HEAD]:   { r: ['#9ca1b9', '#c2c6d8', '#e8eaf2', '#f7f8fc', '#ffffff'], od: '#474c6a', ol: '#7a7f9a', ln: '#8a8fa8' },
    [CLOUD]:  { r: ['#6a6e86', '#878ba2', '#a6aabe', '#c4c7d5', '#e0e2ec'], od: '#363a54', ol: '#5c6078', ln: '#60647e' },
    [MASK]:   { r: ['#555970', '#6c7088', '#868aa2', '#a0a4b8', '#bcbfce'], od: '#363a56', ol: '#555972', ln: '#5a5e78' },
    [SUNF]:   { r: ['#d8951c', '#f0b52c', '#fcd64e', '#ffe98a', '#fff7c8'], od: '#7a4410', ol: '#b06c18', ln: '#b87218' },
    [SUNR]:   { r: ['#a01e18', '#c43022', '#e2462e', '#f26442', '#ff8e6a'], od: '#5a0c08', ol: '#8e1c12', ln: '#8e1c12' },
    [SUNO]:   { r: ['#c4601a', '#e07e2e', '#f59c46', '#ffb86a', '#ffd69c'], od: '#6e2c08', ol: '#a04a14', ln: '#a44c14' },
    [RAINF]:  { r: ['#3a82c6', '#56a0de', '#78bef0', '#a2d8fa', '#d8f2ff'], od: '#1b4c8a', ol: '#3a76b6', ln: '#3c7aba' },
    [RAINH]:  { r: ['#1c4696', '#2a60ba', '#3c80da', '#5fa0ee', '#9ccaf8'], od: '#0c2256', ol: '#1c448c', ln: '#1c4088' },
    [SNOWF]:  { r: ['#7a70b8', '#968ed0', '#b2aae2', '#ccc6f0', '#ebe8ff'], od: '#3a3280', ol: '#5e56a4', ln: '#6058a8' },
    [SNOWM]:  { r: ['#44357e', '#5a4896', '#7362b2', '#9080c8', '#b2a6de'], od: '#221a50', ol: '#3a2e70', ln: '#3a2e70' },
    [SNOWH]:  { r: ['#6a88b0', '#88a8cc', '#a8c6e2', '#c8def0', '#e8f4fc'], od: '#2e4a78', ol: '#56769e', ln: '#5a7aa4' },
    [ICE]:    { r: ['#86b0d8', '#aacfec', '#d2ebfa', '#eef8ff', '#ffffff'], od: '#305c8c', ol: '#5886b4', ln: '#6894c0' },
    [MOUTH]:  { r: ['#681a2a', '#882436', '#a83444', '#c24a58', '#da6a72'], od: '#3a0a16', ol: '#5a1424', ln: '#5a1424' },
    [TONGUE]: { r: ['#c6506a', '#de6a80', '#f28c9a', '#ffb0b8', '#ffd2d4'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
    [EYE]:    { r: ['#0c0e1c', '#121426', '#181b30', '#22263e', '#2e344e'], od: '#05060c', ol: '#0a0c18', ln: '#0a0c18' },
    [WHITE]:  { r: ['#c4c8da', '#e0e3ee', '#f6f7fb', '#ffffff', '#ffffff'], od: '#5a5e7c', ol: '#8a8ea8', ln: '#9a9eb6' },
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
  const EAZ = 0.4, EV = 0.14; // eye direction on the face prim
  const MV = -0.4; // mouth line height
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

  /* ---------- face decal: the dark eye mask (a figure-8 patch), big eyes with a shine, the mouth ---------- */
  let eyeKind = 'open';
  const EYE_DIRS = [1, -1].map((sd) => Creature.sph(sd * EAZ, EV));
  // F = { base, mask, ring, R }: base / mask codes, optional rim code (sunny), face radius in model units
  function faceMat(s, open, F) {
    const px = 1 / (curScale * F.R);
    if (F.ring && s[0] < 0.42) return F.ring;
    if (s[0] > 0.3) {
      // small sprites: a big black eye with a shine; big sprites add the white ring of the art
      const tiny = px > 0.075;
      const RP = tiny ? Math.max(0.17, 1.9 * px) : 0.16, RW = tiny ? RP : RP + 0.055, RM = RW + Math.max(0.085, 1.05 * px);
      let inMask = false;
      for (let i = 0; i < 2; i++) {
        const e = EYE_DIRS[i], sd = i ? -1 : 1;
        const dx = s[0] - e[0], dy = s[1] - e[1], dz = s[2] - e[2];
        const d = Math.hypot(dx, dy * 0.7, dz);
        if (d < RW) {
          if (eyeKind === 'open') {
            if (Math.hypot(dx, dy - RP * 0.42, dz + sd * RP * 0.3) < Math.max(0.05, 0.8 * px)) return code(WHITE, 1);
            return d < RP ? code(EYE) : code(WHITE);
          }
          const lw = Math.max(0.04, 0.75 * px);
          if (eyeKind === 'happy') { if (Math.abs(d - RP * 0.8) < lw && dy > -0.02) return code(EYE); }
          else if (Math.abs(dy + 0.02) < lw && d < RP * 1.2) return code(EYE);
          return F.mask;
        }
        // mask: round patch around the eye, drawn out into a point below-outside (the mustache tip)
        const tx = Math.hypot(dx, dz), below = -dy;
        if (d < RM || (below > 0 && sd * s[2] > sd * e[2] - 0.05 && Math.hypot(tx * 1.25, below * 0.8) < RM + 0.02 && below < RM * 1.25)) inMask = true;
      }
      // bridge between the eyes, dipping to a small point over the mouth
      if (!inMask && Math.abs(s[2]) < 0.22 && s[1] < EV + 0.2 - Math.abs(s[2]) * 0.5 && s[1] > EV - 0.13 + Math.abs(s[2]) * 0.2) inMask = true;
      if (inMask) return F.mask;
    }
    return mouthMat(s, open, F.base);
  }


  /* ---------- build ---------- */
  // little cloud "body" under the head: a round puff, a lumpy bottom and a curled tail flicking back
  function cloudBody(f, mat, prims, big) {
    const k = big || 1;
    prims.push(ellF(chain(f, T(-0.5, 10.5, 0)), [9.6 * k, 6.6, 9 * k], 2, 3, mat));
    prims.push(ellF(chain(f, T(2.4, 5.4, 4.6 * k)), [5.8, 5.2, 5.4], 2, 3, mat));
    prims.push(ellF(chain(f, T(2.4, 5.4, -4.6 * k)), [5.8, 5.2, 5.4], 2, 3, mat));
    prims.push(ellF(chain(f, T(-4.6, 5.8, 0)), [5.8, 5.4, 6], 2, 3, mat));
    tube(f, [pt(-8.5, 9, 0, 4.6, 4), pt(-12.8, 9.2, 0, 3.6, 3.1), pt(-16.2, 11, 0, 2.7, 2.3), pt(-18, 13.8, 0, 2, 1.7), pt(-17.6, 16.2, 0, 1.4, 1.2)], [0, 0, 1], 3, 3, mat, prims);
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const form = P.form === 'sunny' || P.form === 'rainy' || P.form === 'snowy' ? P.form : 'normal';
    const bob = clamp(+P.bob || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const tilt = clamp(+P.tilt || 0, -1, 1) * 0.28;
    const prims = [], anchors = {};
    const h0 = 5 + 8 * bob; // hover height of the lowest point
    const sq = clamp(+P.squash || 0, -1, 1);
    const root = chain(T(0, h0 + 22, 0), F(M3.diag(1 + 0.14 * sq, 1 - 0.22 * sq, 1 + 0.14 * sq), [0, 0, 0]), T(0, -22, 0), R(M3.ry(+P.spin || 0)));
    const cl = chain(root, R(M3.rx(tilt * 0.4)));
    let faceP = null, headF = null, tip = null, bottomY = h0, topP = null;

    if (form === 'normal') {
      headF = chain(root, T(0, 28, 0), R(M3.rx(tilt)));
      const HR = [15.5, 15, 15.5];
      faceP = ellF(headF, HR, 1, 1, (s) => faceMat(s, mo, FN));
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
      cloudBody(cl, CC, prims);
    } else if (form === 'sunny') {
      headF = chain(root, T(0, 29, 0), R(M3.rx(tilt)));
      // orange sun body behind a red face disc with a yellow rim
      prims.push(ellF(headF, [10.5, 13, 13], 2, 2, CSO));
      faceP = ellF(chain(headF, T(3.6, 0, 0)), [9, 12.6, 12.6], 1, 1, (s) => faceMat(s, mo, FS));
      prims.push(faceP);
      // eight round flame puffs around the face; the top one bigger
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 4;
        const d = nrm([-0.3, Math.sin(a), Math.cos(a)]);
        const top = i === 0, r = top ? 7.2 : 6.2;
        prims.push(ellAlong(headF, sc(d, top ? 15.5 : 14.5), d, [1, 0, 0], [r * 1.05, r * 0.72, r], 4 + i, 10 + i, CSO));
        if (top) tip = inF(headF, sc(d, 22));
      }
      topP = inF(headF, [-3, 22.5, 0]);
      cloudBody(cl, CW, prims, 0.9);
    } else if (form === 'rainy') {
      headF = chain(root, T(0, 27, 0), R(M3.rx(tilt)));
      const FR = [14, 13.6, 14];
      faceP = ellF(headF, FR, 1, 1, (s) => faceMat(s, mo, FR_));
      prims.push(faceP);
      const HR = V3.scale(FR, 1.08);
      const hoodMat = (s) => {
        const az = Math.abs(Math.atan2(s[2], s[0]));
        const v = s[1];
        const brow = 0.62 - 0.16 * Math.exp(-(az * az) / 0.03) - 0.34 * (az / 1.45) ** 2;
        if (az < 1.45 && v < brow) return 0;
        if (v < -0.55 && az < 2.2) return 0;
        return CRH();
      };
      prims.push(ellF(headF, HR, 2, 2, hoodMat));
      prims.push(ellAlong(headF, [-1.6, 17, 0], [-0.22, 1, 0], [1, 0, 0], [11.5, 7.6, 7.8], 2, 2, CRH));
      prims.push(ellAlong(headF, [-4.6, 26.2, 0], [-0.42, 1, 0], [1, 0, 0], [5.4, 2.8, 2.9], 2, 2, CRH));
      tip = inF(headF, [-6.6, 30.6, 0]);
      topP = tip;
      for (const sd of [1, -1]) {
        const id = sd > 0 ? 4 : 5;
        prims.push(ellAlong(headF, [0.6, 1.5, sd * 13.4], [0.1, 1, sd * 0.12], [1, 0, 0], [7, 3.6, 2.6], id, id, CRH));
        prims.push(ellAlong(headF, [1, -8.4, sd * 13], [0.05, 1, -sd * 0.1], [1, 0, 0], [6.4, 5.2, 3.6], id, id, CRH));
      }
      cloudBody(cl, CC, prims);
    } else {
      headF = chain(root, T(0, 22, 0), R(M3.rx(tilt)));
      const FR = [14, 13.6, 14];
      faceP = ellF(headF, FR, 1, 1, (s) => faceMat(s, mo, FSN));
      prims.push(faceP);
      // icy hail-cloud hood with a round face window, puffy lumps around it
      const HR = [16, 16.4, 16.6];
      const WIN = 0.52;
      const WC = nrm([1, -0.08, 0]);
      prims.push(ellF(headF, HR, 2, 2, (s) => (dot(s, WC) > WIN ? 0 : CSNH())));
      const ang = Math.acos(WIN), rr = Math.sin(ang);
      // big soft cloud puffs round the lower sides and the back
      for (const [x, y, z, r] of [[-1, -9, 12.5, 7.4], [-1, -9, -12.5, 7.4], [-10, -7, 0, 8], [-9, 7, 11, 6.2], [-9, 7, -11, 6.2], [-11, 1, 0, 8]]) prims.push(ellF(chain(headF, T(x, y, z)), [r, r * 0.85, r], 3, 3, CSNH));
      // floating halo ring above the head
      const ringF = chain(headF, T(-3, 21, 0), R(M3.rz(0.22)));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        prims.push(ellAlong(ringF, [11.5 * Math.cos(a), 0, 12.5 * Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], [0, 1, 0], [4.2, 2.1, 2.4], 4, 4, CSNH_L));
      }
      tip = inF(ringF, [-11.5, 0, 0]);
      topP = inF(ringF, [0, 2, 0]);
      // one long icicle hail point dangling below plus two small ones
      prims.push(ellAlong(headF, [-1, -19, 0], [0.05, -1, 0], [1, 0, 0], [7, 2.8, 2.8], 5, 6, CICE));
      for (const sd of [1, -1]) prims.push(ellAlong(headF, [-4, -15.5, sd * 7], [0, -1, sd * 0.2], [1, 0, 0], [4, 2.1, 2.1], 5, 6, CICE));
      bottomY = h0 + 0.5;
    }

    // eyes: painted into the face decal (anchors only)
    eyeKind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' || P.eyes === 'closed' ? 'blink' : 'open';
    const ek = eyeKind;
    const wrap = faceP.mat;
    faceP.mat = (s) => { eyeKind = ek; return wrap(s); };
    for (const sd of [1, -1]) anchors[sd > 0 ? 'eyeN' : 'eyeF'] = add(faceP.c, M3.v(faceP.L, Creature.sph(sd * EAZ, EV)));
    anchors.mouth = add(faceP.c, M3.v(faceP.L, Creature.sph(0, MV - 0.05)));
    anchors.head = headF.t;
    anchors.body = headF.t;
    anchors.top = topP;
    anchors.tip = tip;
    anchors.bottom = [0, bottomY, 0];
    return {
      prims, stamps: [], dots: [], anchors, pose: P, form,
      pri: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0 },
      glossy: GLOSSY, baseMat: form === 'sunny' ? SUNR : form === 'rainy' ? RAINF : form === 'snowy' ? SNOWF : HEAD,
      shadowSteps: 16, shadowDepth: 10,
    };
  }
  const CH = code(HEAD), CH_F = K(HEAD), CC = K(CLOUD), CW = K(HEAD), CSO = K(SUNO), CRH = K(RAINF);
  const CSNH = K(SNOWH), CSNH_L = K(SNOWH, 1), CICE = K(ICE);
  const FN = { base: CH, mask: code(MASK), R: 15.5 };
  const FS = { base: code(SUNR), mask: code(SUNF), ring: code(SUNF), R: 12.6 };
  const FR_ = { base: code(ICE), mask: code(RAINH), R: 14 };
  const FSN = { base: code(SNOWF), mask: code(SNOWM), R: 14 };

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, FORMS: ['normal', 'sunny', 'rainy', 'snowy'], meta: { heightM: 0.3, bw: 84, bh: 96, oy: 0.9 } };
})();
