/* ------------------------------------------------------------------
   Wingull — the Seagull Pokémon (0.6 m ≈ 105 px from bill tip to tail at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is where the feet touch down when extended (feet: 1).

   Build: a white teardrop head/body with two feather tufts on the back
   of the head, a long yellow bill with a dark hooked tip (hinged lower
   bill), very long thin wings (arm + hand plates) with a sky-blue band
   and forked tips, a forked white tail with blue bands, small orange
   webbed feet. Slit eye stamps.

   Pose parameters (all optional):
     flap    -1..1   wing beat: wings down (-1) .. up (+1) (only when spread)
     spread   0..1   wings folded along the body (0) .. fully spread (1); default 1
     bill     0..1   bill closed .. wide open (call); `mouth` is accepted as an alias
     feet     0..1   feet tucked back (0) .. legs down for landing / perching (1)
     tilt    -1..1   body pitch: nose down (-1, dive) .. nose up (+1, flare) (±0.5 rad)
     eyes    'open' | 'happy' | 'closed' | 'blink'
   Anchors: top, head, mouth, billTip, eyeN, eyeF, body, tail, feet, wingTipN, wingTipF.
------------------------------------------------------------------- */
const Wingull = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const WHITE = 1, BLUE = 2, BILL = 3, TIP = 4, FEET = 5, MOUTH = 6;
  const MAT = { WHITE, BLUE, BILL, TIP, FEET, MOUTH };
  const PAL = Creature.palette({
    [WHITE]: { r: ['#97a4c4', '#bfcae2', '#e4eaf5', '#f7f9fd', '#ffffff'], od: '#38466c', ol: '#6a7aa4', ln: '#8391b8' },
    [BLUE]:  { r: ['#3f84c4', '#5fa6e0', '#84c4f2', '#aedaf8', '#d8eeff'], od: '#1a4c86', ol: '#3a72b0', ln: '#3a72b0' },
    [BILL]:  { r: ['#c07a2c', '#dc9c3c', '#f2be52', '#f9d57e', '#fdebb4'], od: '#6a3c10', ol: '#a0621c', ln: '#9a5c1a' },
    [TIP]:   { r: ['#25272e', '#353841', '#4a4e59', '#626773', '#838996'], od: '#121318', ol: '#25272e', ln: '#1c1d22' },
    [FEET]:  { r: ['#b8561e', '#d6702a', '#ee9040', '#f8b062', '#ffd092'], od: '#5e2408', ol: '#94401a', ln: '#8a3a14' },
    [MOUTH]: { r: ['#7a2a3a', '#9a3c4c', '#bc5666', '#d67482', '#ec9aa4'], od: '#4a1020', ol: '#6c1c30', ln: '#6c1c30' },
  });
  const GLOSSY = {};
  const C_WHITE = code(WHITE), C_BILL = code(BILL), C_TIP = code(TIP), C_FEET = code(FEET), C_MOUTH = code(MOUTH);
  const M_WHITE = () => C_WHITE, M_FEET = () => C_FEET;

  const DEFAULT = { flap: 0, spread: 1, bill: 0, feet: 0, tilt: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross, dot = V3.dot;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const MIRZ = M3.diag(1, 1, -1);
  const mirror = (f) => F(M3.mul(MIRZ, f.L), M3.v(MIRZ, f.t));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function slerpM(A, B, t) {
    const Q = M3.mul(transpose(A), B);
    const ang = Math.acos(clamp((Q[0] + Q[4] + Q[8] - 1) / 2, -1, 1));
    if (ang < 1e-5) return A;
    return M3.mul(A, rotAxis(V3.norm([Q[7] - Q[5], Q[2] - Q[6], Q[3] - Q[1]]), ang * t));
  }
  // orthonormal rotation whose first column is u and third column is close to w
  function frameUW(u, w) {
    const U = nrm(u);
    const W = nrm(sub(w, sc(U, dot(w, U))));
    return M3.cols(U, cross(W, U), W);
  }

  /* ---------- wing shapes (u = span from the joint, v = chord, +v = leading edge) ---------- */
  const ARM_L = 52;
  const ARM = bakeShape(Shape2D.poly([[-5, -9], [-5, 7], [8, 10], [30, 10.5], [ARM_L + 4, 9.5], [ARM_L + 6, 3], [ARM_L + 6, -8], [ARM_L, -11], [28, -12], [6, -12]], code(WHITE, 1)));
  const BAND0 = 30, BAND1 = 41; // sky-blue band across the hand
  const HAND_POLY = Shape2D.catmull([[-5, -9], [-5, 8], [16, 9.5], [46, 9], [62, 8], [72, 8.5], [67, 3.5], [64, 0], [72, -7], [62, -8.5], [42, -9.5], [16, -10]], true, 8);
  const HAND = bakeShape({
    bb: [-7, -12, 75, 11],
    test: (u, v) => (!Shape2D.inPoly(u, v, HAND_POLY) ? 0 : u > BAND0 && u < BAND1 ? code(BLUE, 1) : code(WHITE, 1)),
  });
  const HAND_LEN = 72;
  // separation line between the two tip points
  const HAND_LINES = [{ pts: [[50, 0, 0], [58, -0.5, 0], [64, 0, 0]], mat: WHITE, useLn: true }];
  // tail: a forked fan (u = back, v = sideways), blue bands before the white tips
  const TAIL_POLY = Shape2D.catmull([[-2, -5], [10, -9], [24, -12], [30, -11], [26, -6], [22, -2], [26, 0], [22, 2], [26, 6], [30, 11], [24, 12], [10, 9], [-2, 5]], true, 8);
  const TAIL = bakeShape({
    bb: [-4, -13, 32, 13],
    test: (u, v) => (v < -0.5 || !Shape2D.inPoly(u, v, TAIL_POLY) ? 0 : u > 15 && u < 22 ? code(BLUE, 1) : code(WHITE, 1)),
  });
  const TUFT = bakeShape(Shape2D.poly([[0, -4], [0, 4], [8, 3], [15, 5], [11, 0], [14, -3.5], [7, -3]], code(WHITE, 0), 6));
  const WEB = bakeShape(Shape2D.poly([[0, -2], [9, -5.5], [11, -4], [8, 0], [11, 4], [9, 5.5], [0, 2]], code(FEET), 6));

  /* ---------- body geometry ---------- */
  const HEAD_C = [13, 40, 0], HEAD_R = [20, 19.5, 18];
  const BODY_C = [-11, 35, 0], BODY_R = [28, 18, 16.5];
  const EYE_AZ = 0.72, EYE_V = 0.2;
  const SIZE = 0.88;

  const PRI = {};
  for (let i = 1; i < 24; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 0, 2: 1, 3: 2, 4: 2, 5: 1, 6: 1, 7: 1, 10: 2, 11: 2, 12: 2, 13: 2, 14: 1, 15: 1, 16: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const fl = clamp(P.flap, -1, 1), sp = clamp(P.spread, 0, 1), ft = clamp(P.feet, 0, 1), tilt = clamp(P.tilt, -1, 1);
    const bo = clamp(Math.max(P.bill, P.mouth || 0), 0, 1);
    const CG = [-2, 36, 0];
    // (the model sits 9 units low so the extended feet touch y = 0)
    const top = chain(T(0, -9, 0), T(...CG), R(M3.rz(tilt * 0.5)), T(-CG[0], -CG[1], -CG[2]));

    /* --- head + body (one white teardrop) */
    const headF = chain(top, T(...HEAD_C));
    const headPrim = ellF(headF, HEAD_R, 1, 1, M_WHITE);
    prims.push(headPrim);
    const bodyF = chain(top, T(...BODY_C), R(M3.rz(0.12)));
    prims.push(ellF(bodyF, BODY_R, 2, 1, M_WHITE));
    // tufts: two feather points at the back of the head
    for (const [dz, a] of [[3, 0.42], [-3, 0.42]]) {
      const tf = chain(headF, T(-15, 8, dz), R(M3.rz(Math.PI - a)));
      prims.push(PL(tf.t, tf.L, 5, 5, TUFT, 2.2));
    }

    /* --- bill: yellow base, dark hooked tip; the lower bill hinges open */
    const hingeF = chain(headF, T(16, -4, 0));
    const ubF = chain(hingeF, R(M3.rz(-0.1 + bo * 0.12)));
    const ubMat = (s) => (s[0] > 0.28 ? C_TIP : C_BILL);
    prims.push(ellF(chain(ubF, T(16, 1.2, 0)), [21, 5.8, 6.4], 3, 3, ubMat));
    prims.push(ellF(chain(ubF, T(34, -1.6, 0), R(M3.rz(-0.75))), [4.6, 2.8, 3.2], 3, 3, () => C_TIP)); // hook
    const lbF = chain(hingeF, R(M3.rz(-0.16 - bo * 0.5)));
    prims.push(ellF(chain(lbF, T(14, -2.6, 0)), [17, 3.4, 5.2], 4, 4, (s) => (s[0] > 0.42 ? C_TIP : s[1] > 0.55 && bo > 0.05 ? C_MOUTH : C_BILL)));
    if (bo > 0.08) prims.push(ellF(chain(hingeF, R(M3.rz(-0.1 - bo * 0.22)), T(10, -1.2, 0)), [11, 2.4, 4.4], 4, 4, () => C_MOUTH));

    /* --- eyes */
    const eyeKind = P.eyes === 'closed' ? 'blink' : P.eyes === 'happy' || P.eyes === 'blink' ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      const at = { prim: headPrim, p: inF(headF, [s[0] * HEAD_R[0], s[1] * HEAD_R[1], s[2] * HEAD_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.6, far: 0.32, minFacing: 0.18 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- tail (forked fan with a little dihedral so it reads from the side) */
    for (const sd of [1, -1]) {
      const tf = chain(bodyF, T(-BODY_R[0] + 4, 3, 0), R(M3.rz(0.1)), R(M3.rx(sd * -0.35)));
      const L = M3.mul(tf.L, M3.cols([-1, 0, 0], [0, 0, sd], [0, sd, 0]));
      prims.push(PL(tf.t, L, sd > 0 ? 14 : 15, sd > 0 ? 14 : 15, TAIL, 1.6));
    }

    /* --- wings: folded along the body (spread 0) .. fully spread (1); flap raises/lowers them */
    const tips = [];
    for (const side of [1, -1]) {
      // folded: the wing lies flat along the flank, the hand's tips reaching past the tail
      const Rf = frameUW([-0.985, -0.1, 0.05], [0.04, 0.02, 1]);
      // spread: gull-wing "M" — the arm rises a little, the hand angles back down; flap beats about
      // the body axis (the hand lags a little behind the arm)
      // (the chord is pitched leading-edge-down a little so the long wings read from the usual front 3/4 views)
      const Rs = M3.mul(M3.mul(M3.rx(-(0.22 + fl * 0.75)), frameUW([-0.1, 0, 1], [0, 1, 0])), M3.rx(-0.28));
      const Rw = slerpM(Rf, Rs, sp);
      const sh = lerpV([2, 42, 15.5], [0, 45, 12], sp);
      const armF0 = F(M3.mul(Rw, M3.diag(lerp(0.45, 1, sp), lerp(0.7, 1, sp), 1)), sh);
      const wrist = add(sh, M3.v(Rw, [ARM_L * lerp(0.45, 1, sp), 0, 0]));
      const handRf = M3.mul(Rf, M3.rz(0.03));
      const handRs = M3.mul(Rs, M3.mul(M3.rx(0.3 + fl * 0.15), M3.ry(0.12)));
      const Rh = slerpM(handRf, handRs, sp);
      let armF = armF0;
      let handF = F(M3.mul(Rh, M3.diag(1, lerp(0.72, 1, sp), 1)), lerpV(add(sh, M3.v(Rf, [4, 0.5, 0.6])), wrist, Math.min(1, sp * 1.6)));
      if (side < 0) { armF = mirror(armF); handF = mirror(handF); }
      armF = chain(top, armF); handF = chain(top, handF);
      const pid = side > 0 ? 10 : 12;
      prims.push(PL(armF.t, armF.L, pid, pid, ARM, 1.8));
      const hand = PL(handF.t, handF.L, pid + 1, pid + 1, HAND, 1.8);
      hand.lines = HAND_LINES;
      prims.push(hand);
      tips.push(inF(handF, [HAND_LEN, 0, 0]));
    }

    /* --- legs and webbed feet: tucked back under the body (0) .. down for landing (1) */
    const feetPts = [];
    for (const sd of [1, -1]) {
      const hip = inF(bodyF, [2, -BODY_R[1] * 0.7, sd * 6]);
      const legDir = nrm(M3.v(top.L, lerpV([-0.95, -0.3, 0], [0.05, -1, 0], ft)));
      const knee = add(hip, sc(legDir, 13));
      const id = sd > 0 ? 7 : 6;
      const d = sub(knee, hip), X = nrm(d);
      let Zl = nrm(cross(X, [0, 0, 1]));
      if (!isFinite(Zl[0])) Zl = [1, 0, 0];
      prims.push(E(add(hip, sc(d, 0.5)), M3.mul(M3.cols(X, cross(Zl, X), Zl), M3.diag(7.5, 2.4, 2.4)), id, id, M_FEET));
      const footRot = lerp(2.7, 0, ft);
      const footF = chain(F(M3.I(), knee), R(M3.mul(top.L, M3.rz(footRot))));
      prims.push(PL(footF.t, M3.mul(footF.L, M3.cols([1, 0, 0], [0, 0, 1], [0, 1, 0])), id, id, WEB, 1.4));
      feetPts.push(knee);
    }

    Object.assign(anchors, {
      top: inF(headF, [-6, HEAD_R[1] + 6, 0]),
      head: headF.t,
      mouth: inF(hingeF, [8, -2, 0]),
      billTip: inF(ubF, [37, -3, 0]),
      body: bodyF.t,
      tail: inF(bodyF, [-BODY_R[0] - 24, 4, 0]),
      feet: sc(add(feetPts[0], feetPts[1]), 0.5),
      wingTipN: tips[0], wingTipF: tips[1],
    });
    // uniform scale to the Pokédex size (0.6 m ≈ 105 px from bill tip to tail)
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: WHITE, shadowSteps: 16 };
  }

  /* ---------- eye stamps: small black slits (k), picked by render scale ---------- */
  const mk = (o, oN, oF, h, hN, hF, b, bN, bF) => ({ open: o, openN: oN, openF: oF, happy: h, happyN: hN, happyF: hF, blink: b, blinkN: bN, blinkF: bF });
  const EYES_S = mk(['k', 'k', 'k'], ['k', 'k', 'k'], ['k', 'k'], ['.k.', 'k.k'], ['.k.', 'k.k'], ['k.', '.k'], ['kkk'], ['kk'], ['kk']);
  const EYES_M = mk(['.k', 'kk', 'kk', 'kk', 'k.'], ['k', 'k', 'k', 'k'], ['k', 'k', 'k'], ['.kk.', 'k..k'], ['.k.', 'k.k'], ['.k', 'k.'], ['kkkk'], ['kkk'], ['kk']);
  const EYES_L = mk(['.kk', 'kkk', 'kkk', 'kkk', 'kkk', 'kk.'], ['.k', 'kk', 'kk', 'kk', 'kk', 'k.'], ['k', 'k', 'k', 'k', 'k'], ['.kkk.', 'k...k', 'k...k'], ['.kk.', 'k..k', 'k..k'], ['.k', 'k.', 'k.'], ['kkkkk', '.kkk.'], ['kkkk', '.kk.'], ['kkk']);
  const EYEC = { k: '#141a26', w: '#ffffff' };

  /* ---------- render: pick the eye size, ray-cast only the sprite's screen box, paste into the buffer ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.9 ? EYES_L : scale >= 0.5 ? EYES_M : EYES_S;
    for (const st of model.stamps) st.set = set;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const u of [a, c]) for (const v of [b, d]) for (const w of [-p.thick, p.thick]) {
          const qx = cv[0] + Lv[0] * u + Lv[1] * v + Lv[2] * w, qy = cv[1] + Lv[3] * u + Lv[4] * v + Lv[5] * w;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, -qy); y1 = Math.max(y1, -qy);
        }
      }
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s0 = y * w, d0 = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s0, s0 + w), d0);
      depth.set(r.depth.subarray(s0, s0 + w), d0);
      part.set(r.part.subarray(s0, s0 + w), d0);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 248, bh: 232, oy: 0.63 } };
})();
