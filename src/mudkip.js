/* ------------------------------------------------------------------
   Mudkip — a posable 3D model rendered straight to pixel art.
   Orthographic ray casting against analytic ellipsoids and flat
   "plates" (fins, gills), toon-shaded into hand-picked colour ramps,
   then finished with sel-out outlines and hand-drawn eye stamps.

   Pose fields (build(pose); all optional, unknown fields ignored):
     squash      -0.2..0.2  vertical squash/stretch        lean       rad   body pitch (nose up > 0)
     headPitch   rad        nose up > 0                    headYaw    rad   head turn
     headRoll    rad        head tilt                      look       rad   eyes glance sideways
     finSway     rad        head fin sway (0.04)           finTwist   rad   head fin twist (cheated by side)
     tailLift    rad        tail raise                     tailWag    rad   tail swing
     tailTwist   rad        tail twist (cheated by side)   bodyDip    0..2  walk bob (units)
     legF, legB  rad        front / back leg swing (+z leg +, -z leg -)
     legSplay    rad        legs out to the sides          gill       rad   cheek gill fan
     mouth       0..1       open amount (0.6)              eyes       'open'|'happy'|'blink'|'sleep'
     noNostrils  bool       hide nostril dots              side       -1..1 ≈3·cos(yaw), passed by the game
   Cosmetics (rewards for the photographer). Real 3D parts on the head/body frames;
   none are built unless a field is set, so the plain look is untouched:
     hat      'lobster' | 'sailor' | 'bucket' | 'beanie' | 'flower' | 'star' | 'straw'
     shirt    'heart' | 'stripe' | 'pop' | 'hoodie'
     glasses  'star' | 'round'
     neck     'camera' | 'bow' | 'scarf'
     hold     'guitar' | 'camera'   (a held camera replaces a worn one; the guitar swings a
                                     worn camera round to Mudkip's back)
     strum    -1..1      guitar strum: the near front leg sweeps over the strings (hold 'guitar')
   Extra anchors when present: lens (camera lens front), guitar (guitar body centre).
------------------------------------------------------------------- */
const Mudkip = (() => {
  // material ids
  const BODY = 1, BELLY = 2, JAW = 3, FIN = 4, FINEDGE = 5, TAIL = 6, GILL = 7, MOUTH = 8, TONGUE = 9;
  // cosmetic material ids (10..25)
  const RED = 10, WHITE = 11, NAVY = 12, YELLOW = 13, SPHEAL = 14, CREAM = 15, PINK = 16, GREEN = 17,
    GOLD = 18, MAGENTA = 19, ORANGE = 20, STRAW = 21, DARK = 22, LENS = 23, METAL = 24, SHADE = 25;
  const MAT = { BODY, BELLY, JAW, FIN, FINEDGE, TAIL, GILL, MOUTH, TONGUE,
    RED, WHITE, NAVY, YELLOW, SPHEAL, CREAM, PINK, GREEN, GOLD, MAGENTA, ORANGE, STRAW, DARK, LENS, METAL, SHADE };
  const code = (m, bias = 0) => m | ((bias + 2) << 5);

  /* Base ("noon") palette. Each ramp: [deep, shadow, base, light, highlight], plus
     od = outline on the shadow side, ol = outline on the lit side, ln = internal line. */
  const H = PX.hex;
  const BASE_PAL = {
    [BODY]:    { r: [H('#2b6db5'), H('#3a92d8'), H('#56bcf0'), H('#8ad7fa'), H('#d4f5ff')], od: H('#15336b'), ol: H('#2560a8'), ln: H('#2356a0') },
    [FIN]:     { r: [H('#2b6db5'), H('#3a92d8'), H('#56bcf0'), H('#8ad7fa'), H('#d4f5ff')], od: H('#15336b'), ol: H('#2560a8'), ln: H('#2d6cb8') },
    [FINEDGE]: { r: [H('#6aa9dc'), H('#8cc8ee'), H('#afe1f8'), H('#d2f1ff'), H('#f0fbff')], od: H('#1d4d8e'), ol: H('#3f7fc0'), ln: H('#4f8fcc') },
    [TAIL]:    { r: [H('#6aa6d8'), H('#88c2ea'), H('#a8dbf6'), H('#c8ecfc'), H('#e6f8ff')], od: H('#1f5596'), ol: H('#3674b8'), ln: H('#5b98cc') },
    [BELLY]:   { r: [H('#6fa9d4'), H('#93c8e8'), H('#bfe5f7'), H('#def4fd'), H('#f6fdff')], od: H('#1d4d8e'), ol: H('#3a74b4'), ln: H('#5a92c6') },
    [JAW]:     { r: [H('#8fb2cc'), H('#b6d4e6'), H('#e3f3fa'), H('#f6fcff'), H('#ffffff')], od: H('#284f7e'), ol: H('#5f8db4'), ln: H('#7ba3c4') },
    [GILL]:    { r: [H('#b8461a'), H('#d96520'), H('#f28a2a'), H('#ffae45'), H('#ffd584')], od: H('#6a2010'), ol: H('#9b3514'), ln: H('#a8401a') },
    [MOUTH]:   { r: [H('#7a1f2c'), H('#9a2f3a'), H('#bb4450'), H('#d45a62'), H('#e87a7a')], od: H('#4a0e1c'), ol: H('#6e1a28'), ln: H('#6e1a28') },
    [TONGUE]:  { r: [H('#c8505a'), H('#e06a6c'), H('#f58c84'), H('#ffaea0'), H('#ffcfc2')], od: H('#6e1428'), ol: H('#8e2038'), ln: H('#b04450') },
    // cosmetics
    [RED]:     { r: [H('#8e1c2c'), H('#c02c36'), H('#e84a44'), H('#ff7a62'), H('#ffb89c')], od: H('#4e0a18'), ol: H('#8a1a28'), ln: H('#8e2030') },
    [WHITE]:   { r: [H('#98a6c0'), H('#c2cde0'), H('#e9eff7'), H('#fbfdff'), H('#ffffff')], od: H('#3c4a6a'), ol: H('#6d7ea2'), ln: H('#8492b4') },
    [NAVY]:    { r: [H('#1a2860'), H('#243a86'), H('#3150ae'), H('#4a70cc'), H('#7c9ee6')], od: H('#0c1440'), ol: H('#1c2e72'), ln: H('#1a2a68') },
    [YELLOW]:  { r: [H('#b88a3a'), H('#dcae50'), H('#f4d272'), H('#fce6a2'), H('#fff5d6')], od: H('#6a4614'), ol: H('#a0762c'), ln: H('#a67c2e') },
    [SPHEAL]:  { r: [H('#4b5eb0'), H('#6782cf'), H('#86a1e4'), H('#a9c1f4'), H('#c8dafc')], od: H('#27357a'), ol: H('#4a60b4'), ln: H('#5068b8') },
    [CREAM]:   { r: [H('#d2b27e'), H('#e8cf9e'), H('#f7e9c6'), H('#fdf6e2'), H('#fffbf0')], od: H('#7e5e32'), ol: H('#b08c56'), ln: H('#bf9c68') },
    [PINK]:    { r: [H('#c0467a'), H('#e06898'), H('#f890b8'), H('#ffb8d4'), H('#ffe2ef')], od: H('#6a163e'), ol: H('#a42e5c'), ln: H('#b03a66') },
    [GREEN]:   { r: [H('#2c7a3c'), H('#40a048'), H('#62c25a'), H('#92de7c'), H('#ccf6ae')], od: H('#124620'), ol: H('#286a32'), ln: H('#2c7034') },
    [GOLD]:    { r: [H('#a86c18'), H('#d09424'), H('#f0c038'), H('#ffdf6c'), H('#fff4bc')], od: H('#583408'), ol: H('#94600f'), ln: H('#9a6614') },
    [MAGENTA]: { r: [H('#52237e'), H('#8a2ca4'), H('#c43cbc'), H('#ea68d6'), H('#ffb2f0')], od: H('#2a0c4a'), ol: H('#62208a'), ln: H('#662090') },
    [ORANGE]:  { r: [H('#b04a1c'), H('#dc6a28'), H('#fb8f3c'), H('#ffb46a'), H('#ffdcaa')], od: H('#62200e'), ol: H('#a03e18'), ln: H('#a4441c') },
    [STRAW]:   { r: [H('#a47634'), H('#c89c4e'), H('#e6c474'), H('#f4dea2'), H('#fff2d0')], od: H('#5a3a10'), ol: H('#8c6222'), ln: H('#96692a') },
    [DARK]:    { r: [H('#10141c'), H('#1a202c'), H('#262e40'), H('#3a465e'), H('#8898b8')], od: H('#0b1122'), ol: H('#182236'), ln: H('#0e1526') },
    [LENS]:    { r: [H('#0e1c44'), H('#1a3672'), H('#2c5ca4'), H('#58a0d8'), H('#d6f4ff')], od: H('#07102c'), ol: H('#132656'), ln: H('#132656') },
    [METAL]:   { r: [H('#5a6474'), H('#808c9e'), H('#a8b2c2'), H('#d0d8e4'), H('#f6f9fc')], od: H('#262c3a'), ol: H('#465062'), ln: H('#4a5466') },
    [SHADE]:   { r: [H('#36102e'), H('#561846'), H('#7c285c'), H('#ae4a88'), H('#f2acd8')], od: H('#1e0818'), ol: H('#3e1030'), ln: H('#3e1030') },
  };
  const GLOSSY = { [BODY]: 1, [FIN]: 1, [GILL]: 1, [BELLY]: 0, [JAW]: 1, [TAIL]: 0, [FINEDGE]: 0,
    [GOLD]: 1, [DARK]: 1, [LENS]: 1, [METAL]: 1, [SHADE]: 1 };

  /* ---------- shapes ---------- */
  const FIN_CTRL = [[8.6, -5], [9.6, 1], [9.8, 7], [9, 13], [7.2, 18.6], [4.4, 23.6], [1, 27.4], [-2.6, 29.2], [-5.6, 28.4], [-7.3, 25.2], [-7.9, 19.6], [-8.1, 13], [-8.5, 6], [-9.1, 0], [-9.6, -5]];
  const FIN_POLY = Shape2D.catmull(FIN_CTRL, true, 8);
  const FIN_BACK = Shape2D.catmull([[-2.6, 29.2], [-5.6, 28.4], [-7.3, 25.2], [-7.9, 19.6], [-8.1, 13], [-8.5, 6], [-9.1, 0]], false, 8);
  const FIN_BB = Shape2D.bbox(FIN_POLY, 0.5);
  const FIN_RIDGES = [
    Shape2D.catmull([[3.2, 4], [3.6, 10], [2.6, 16], [0.4, 21.5], [-2.2, 25.2]], false, 5),
    Shape2D.catmull([[-2.4, 4], [-2.4, 10], [-3, 16], [-4.2, 21], [-5, 24]], false, 5),
  ];
  const finShape = {
    bb: FIN_BB,
    test(u, v) {
      if (u < FIN_BB[0] || u > FIN_BB[2] || v < FIN_BB[1] || v > FIN_BB[3]) return 0;
      if (!Shape2D.inPoly(u, v, FIN_POLY)) return 0;
      const d = Shape2D.polyDist(u, v, FIN_BACK);
      if (d < 1.7 && v > 4) return code(FINEDGE);
      return code(FIN);
    },
  };

  const TAIL_CTRL = [[-1, -2.6], [6, -4.4], [12.5, -6.4], [18.5, -7.8], [23.2, -7.2], [26.4, -4.4], [27.6, -0.2], [26.8, 4.6], [23.8, 8.8], [19.2, 11.4], [13.4, 10.6], [7.4, 6.8], [2.4, 3.8], [-1, 2.6]];
  const TAIL_POLY = Shape2D.catmull(TAIL_CTRL, true, 8);
  const TAIL_BB = Shape2D.bbox(TAIL_POLY, 0.5);
  const tailShape = {
    bb: TAIL_BB,
    test(u, v) {
      if (u < TAIL_BB[0] || u > TAIL_BB[2] || v < TAIL_BB[1] || v > TAIL_BB[3]) return 0;
      return Shape2D.inPoly(u, v, TAIL_POLY) ? code(TAIL) : 0;
    },
  };
  const TAIL_VEINS = [
    Shape2D.catmull([[3, -0.6], [10, -2.2], [17, -3.6], [23.5, -4.2]], false, 5),
    Shape2D.catmull([[4, 1.4], [10, 3.6], [16, 6.2], [21, 8]], false, 5),
  ];

  // Gill: rounded cheek base with three pointed, faceted spikes (u = outward, v = up)
  const GILL_SPIKES = [
    { a: 1.02, len: 12.6, w: 3.5, bend: -0.12 },
    { a: 0.2, len: 13.4, w: 3.7, bend: -0.06 },
    { a: -0.66, len: 11.2, w: 3.4, bend: 0.1 },
  ].map((s) => {
    const r0 = 3;
    const a2 = s.a + s.bend;
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    return {
      tip: [Math.cos(a2) * s.len, Math.sin(a2) * s.len],
      b1: [ca * r0 - sa * s.w, sa * r0 + ca * s.w],
      b2: [ca * r0 + sa * s.w, sa * r0 - ca * s.w],
      root: [ca * r0, sa * r0],
      dir: [Math.cos(a2), Math.sin(a2)],
    };
  });
  const GILL_R = 5.6;
  const gillShape = {
    bb: [-7, -11, 14, 13.5],
    test(u, v) {
      for (const s of GILL_SPIKES) {
        if (Shape2D.inTri(u, v, s.tip, s.b1, s.b2)) {
          const cr = s.dir[0] * (v - s.root[1]) - s.dir[1] * (u - s.root[0]);
          return code(GILL, cr > 0.3 ? 1 : 0);
        }
      }
      const r2 = u * u + v * v;
      if (r2 < GILL_R * GILL_R) return code(GILL, r2 < 2.6 * 2.6 && u < 0.5 ? 0 : 0);
      return 0;
    },
  };

  const FIN_G = bakeShape(finShape), TAIL_G = bakeShape(tailShape), GILL_G = bakeShape(gillShape);

  /* ---------- frames ---------- */
  const F = (L, t) => ({ L, t });
  const comp = (P, C) => ({ L: M3.mul(P.L, C.L), t: V3.add(M3.v(P.L, C.t), P.t) });
  const T = (x, y, z) => F(M3.I(), [x, y, z]);
  const R = (m) => F(m, [0, 0, 0]);
  const chain = (...fs) => fs.reduce((a, b) => comp(a, b));

  const DEFAULT_POSE = {
    squash: 0, lean: 0, headPitch: 0, headYaw: 0, headRoll: 0,
    finSway: 0.04, finTwist: 0.32, tailLift: 0, tailWag: 0, tailTwist: -0.85,
    legF: 0, legB: 0, legSplay: 0, mouth: 0.6, eyes: 'open', gill: 0, look: 0,
    bodyDip: 0,
  };
  const HEAD_R = [14.6, 14, 16.4];

  function build(pose) {
    const P = Object.assign({}, DEFAULT_POSE, pose);
    if (pose && pose.side !== undefined) { P.finTwist = 0.32 * pose.side; P.tailTwist = -0.85 * pose.side; }
    const prims = [];
    const sq = P.squash;
    const root = F(M3.diag(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55), [0, 0, 0]);
    const body = chain(root, T(-6, 13 - P.bodyDip, 0), R(M3.rz(P.lean)));

    // --- body
    prims.push({
      kind: 'ell', part: 1, grp: 1, c: body.t, L: M3.mul(body.L, M3.diag(14.5, 9.6, 10.2)),
      mat: (s) => (s[1] < -0.34 + 0.3 * Math.max(0, s[0]) ? code(BELLY) : code(BODY)),
    });

    // --- legs (front/back, near/far): stubby cylinders-ish with a paw
    const legs = [
      { hip: [7.6, -4.5, 7.4], sw: P.legF, id: 2 },
      { hip: [7.6, -4.5, -7.4], sw: -P.legF, id: 3 },
      { hip: [-8.4, -4.5, 7.1], sw: P.legB, id: 4 },
      { hip: [-8.4, -4.5, -7.1], sw: -P.legB, id: 5 },
    ];
    // cosmetics: is anything worn? (the plain model skips every cosmetic code path)
    const dressed = !!(P.hat || P.shirt || P.glasses || P.neck || P.hold);
    // holding the guitar: the near front leg (the camera-side one) strums
    const gside = P.side !== undefined && P.side < 0 ? -1 : 1;
    const strumLeg = P.hold === 'guitar' ? (gside > 0 ? 2 : 3) : 0;
    const legFrames = {};
    for (const lg of legs) {
      const side = Math.sign(lg.hip[2]);
      const f = lg.id === strumLeg
        ? chain(body, T(...lg.hip), R(M3.rz(1.3 + 0.36 * Math.max(-1, Math.min(1, +P.strum || 0)))), R(M3.rx(side * 0.42)))
        : chain(body, T(...lg.hip), R(M3.rz(lg.sw)), R(M3.rx(-side * P.legSplay)));
      legFrames[lg.id] = f;
      prims.push({ kind: 'ell', part: lg.id, grp: lg.id, c: V3.add(f.t, M3.v(f.L, [0, -3.2, 0])), L: M3.mul(f.L, M3.diag(3.4, 5.2, 3.2)), mat: () => code(BODY) });
      const paw = { kind: 'ell', part: lg.id, grp: lg.id, c: V3.add(f.t, M3.v(f.L, [1.0, -6.8, 0])), L: M3.mul(f.L, M3.diag(3.9, 2.3, 3.5)), mat: () => code(BODY) };
      paw.lines = [-0.3, 0.3].map((w) => ({ pts: [[0.9 * Math.sqrt(1 - w * w), -0.05, w], [0.8 * Math.sqrt(1 - w * w), -0.55, w]], tone: 1, mat: BODY }));
      prims.push(paw);
    }

    // --- tail fin
    const tail = chain(body, T(-12.5, 3.2, 0), R(M3.rz(-(0.86 + P.tailLift))), R(M3.ry(P.tailWag)), R(M3.rx(P.tailTwist)));
    prims.push({
      kind: 'plate', part: 6, grp: 6, c: tail.t, L: M3.mul(tail.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])),
      shape: TAIL_G, thick: 1.6,
      lines: TAIL_VEINS.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), tone: 1, mat: TAIL, useLn: true })),
    });

    // --- head
    const head = chain(body, T(8, 4.4, 0), R(M3.rz(P.headPitch)), R(M3.ry(P.headYaw)), R(M3.rx(P.headRoll)), T(3.4, 10.4, 0));
    const open = P.mouth;
    const headMat = (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1], a = Math.abs(az);
      if (a < 1.3) {
        const k = az / 1.16;
        const vm = -0.4 + 0.25 * k * k;
        const h = open * 0.3 * Math.max(0, 1 - (az / 1.1) ** 2);
        if (h > 0.03 && v < vm && v > vm - h) return v < vm - h * 0.55 && a < 0.85 ? code(TONGUE) : code(MOUTH);
        const chin = 0.2 * Math.max(0, 1 - k * k) + 0.06;
        if (v <= vm - h && v > vm - h - chin) return code(JAW);
        if (v <= vm - h - chin) return code(BELLY);
      }
      return code(BODY);
    };
    const headPrim = { kind: 'ell', part: 7, grp: 7, c: head.t, L: M3.mul(head.L, M3.diag(...HEAD_R)), mat: headMat };
    prims.push(headPrim);

    // --- head fin
    const fin = chain(head, T(-1, 10.5, 0), R(M3.rz(P.finSway)), R(M3.ry(P.finTwist)));
    prims.push({
      kind: 'plate', part: 8, grp: 8, c: fin.t, L: fin.L, shape: FIN_G, thick: 1.8,
      lines: FIN_RIDGES.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), tone: 1, mat: FIN, useLn: true })),
    });

    // --- gills (frontal plates on the cheeks at the mouth corners)
    for (const side of [1, -1]) {
      const az = 1.22, v = -0.22;
      const cv = Math.sqrt(1 - v * v);
      const pos = [HEAD_R[0] * cv * Math.cos(az) * 1.0, HEAD_R[1] * v, side * HEAD_R[2] * cv * Math.sin(az) * 1.0];
      const o = V3.norm([-0.3, 0.08, side]);
      const n0 = V3.norm([1, 0, side * 0.42]);
      const up = V3.norm(V3.cross(n0, o));
      const upF = up[1] < 0 ? V3.scale(up, -1) : up;
      const w = V3.cross(o, upF);
      const g = chain(head, T(...pos));
      prims.push({
        kind: 'plate', part: side > 0 ? 9 : 10, grp: side > 0 ? 9 : 10, c: g.t,
        L: M3.mul(g.L, M3.mul(M3.cols(o, upF, w), M3.rz(P.gill))), shape: GILL_G, thick: 1.4,
      });
    }

    // --- anchors (model space)
    const onHead = (az, v) => {
      const cv = Math.sqrt(1 - v * v);
      const s = [cv * Math.cos(az), v, cv * Math.sin(az)];
      return { p: V3.add(head.t, M3.v(headPrim.L, s)), s };
    };
    const look = P.look;
    const anchors = {
      eyeN: onHead(0.36 + look, -0.04),
      eyeF: onHead(-0.36 + look, -0.04),
      nosN: onHead(0.13, -0.27),
      nosF: onHead(-0.13, -0.27),
      mouth: onHead(0, -0.42),
      headTop: V3.add(head.t, M3.v(head.L, [0, HEAD_R[1], 0])),
      finTip: V3.add(fin.t, M3.v(fin.L, [-2.6, 29, 0])),
      head: head.t,
      body: body.t,
    };
    const pri = { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 1, 8: 2, 9: 3, 10: 3 };
    if (dressed) dress(P, { body, head, legs: legFrames, gside }, prims, anchors, pri);
    return {
      prims, anchors, pose: P, headPrim,
      stamps: [
        { at: Object.assign({ prim: headPrim }, anchors.eyeN), set: EYES_S, colors: EYEC, kind: P.eyes },
        { at: Object.assign({ prim: headPrim }, anchors.eyeF), set: EYES_S, colors: EYEC, kind: P.eyes },
      ],
      dots: P.noNostrils ? [] : [
        { at: Object.assign({ prim: headPrim }, anchors.nosN), mat: BODY, tone: 0, onlyMat: BODY },
        { at: Object.assign({ prim: headPrim }, anchors.nosF), mat: BODY, tone: 0, onlyMat: BODY },
      ],
      pri,
      glossy: GLOSSY,
      baseMat: BODY,
    };
  }

  /* ================================================================
     Cosmetics — wearable rewards as real 3D parts (ellipsoids and plates)
     riding on the head / body / leg frames, so they turn, squash and bob
     with Mudkip. Hats sit around the head fin (it pokes through); nothing
     sits on the cheek gills.
  ================================================================ */
  // part / group ids (Mudkip's own parts are 1..10)
  const G = { HAT: 11, HAT2: 12, HAT3: 13, HAT4: 14, HAT5: 15, SHIRT: 16, SLV2: 17, SLV3: 18, SHIRT2: 19,
    GLN: 20, GLF: 21, GLB: 22, NECK: 23, NECK2: 24, NECK3: 25, HOLD: 26, HOLD2: 27, HOLD3: 28 };
  const ACC_PRI = { 11: 3, 12: 3, 13: 4, 14: 4, 15: 4, 16: 2, 17: 3, 18: 3, 19: 3, 20: 5, 21: 5, 22: 4, 23: 4, 24: 3, 25: 5, 26: 4, 27: 3, 28: 5 };
  const HR = HEAD_R;
  const K = code;
  const W0 = F(M3.I(), [0, 0, 0]);
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sphv = (az, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); return [c * Math.cos(az), v, c * Math.sin(az)]; };
  // point on the head surface (head-local) for unit direction s, pushed out along the normal
  const headPt = (s, off = 0) => {
    const n = V3.norm([s[0] / HR[0], s[1] / HR[1], s[2] / HR[2]]);
    return { p: V3.add([HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]], V3.scale(n, off)), n };
  };
  // orthonormal axes around a direction: [u (horizontal), v (up-ish), w = dir]
  const basis = (dir, up = [0, 1, 0]) => {
    const w = V3.norm(dir);
    let u = V3.cross(up, w);
    if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = V3.cross([1, 0, 0], w);
    u = V3.norm(u);
    return [u, V3.cross(w, u), w];
  };
  // ellipsoid in frame f with radii r; with explicit local axes; rod (capsule-ish) from a to b; plate
  const eA = (f, r, part, mat) => ({ kind: 'ell', part, grp: part, c: f.t, L: M3.mul(f.L, M3.diag(r[0], r[1], r[2])), mat });
  const eAx = (f, c, ax, r, part, mat) => {
    const g = chain(f, T(c[0], c[1], c[2]));
    return { kind: 'ell', part, grp: part, c: g.t, L: M3.mul(g.L, M3.cols(V3.scale(ax[0], r[0]), V3.scale(ax[1], r[1]), V3.scale(ax[2], r[2]))), mat };
  };
  const rodA = (f, a, b, r, part, mat) => {
    const d = V3.sub(b, a), len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
    return eAx(f, V3.scale(V3.add(a, b), 0.5), basis(d), [r, r, len / 2 + r * 0.55], part, mat);
  };
  const pA = (f, c, ax, shape, part, thick = 1.4) => {
    const g = chain(f, T(c[0], c[1], c[2]));
    return { kind: 'plate', part, grp: part, c: g.t, L: M3.mul(g.L, M3.cols(ax[0], ax[1], ax[2])), shape, thick };
  };
  const hash3 = (a, b, c) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const inHeart = (x, y) => { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; };

  /* ---- plate shapes (baked lazily on first use, so plain Mudkip's start-up cost is unchanged) ---- */
  const lazy = (make) => { let v = null; return () => v || (v = make()); };
  const starPts = (ro, ri) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? ri : ro; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return p;
  };
  const STAR_G = lazy(() => bakeShape(Shape2D.poly(starPts(5.9, 2.7), 0, 3, (u, v) => ((u + 1.0) ** 2 + (v - 1.2) ** 2 < 2.0 ? K(GOLD, 1) : K(GOLD)))));
  const STARGL_G = lazy(() => {
    const out = Shape2D.catmull(starPts(6.9, 3.5), true, 3), inner = Shape2D.catmull(starPts(4.5, 2.3), true, 3);
    return bakeShape({
      bb: Shape2D.bbox(out, 0.5),
      test(u, v) {
        if (!Shape2D.inPoly(u, v, out)) return 0;
        return Shape2D.inPoly(u, v, inner) ? K(SHADE, (u + 1.2) ** 2 + (v - 1.3) ** 2 < 1.0 ? 3 : 0) : K(PINK);
      },
    });
  });
  const RIBBON_G = lazy(() => bakeShape(Shape2D.poly([[-1.7, 0.8], [1.7, 0.8], [2.1, -4.2], [2.6, -9.6], [0.4, -7.9], [-1.6, -10.0], [-1.2, -4.2]], K(NAVY), 6)));
  // camera: a boxy red/white body (six rounded-rectangle plates) with a lens
  const CAM = [3.4, 4.8, 7.0]; // half extents: depth (lens axis), height, width
  const rrect = (hw, hh, rad, fn) => ({
    bb: [-hw - 0.5, -hh - 0.5, hw + 0.5, hh + 0.5],
    test(u, v) {
      // (written so NaN from an exactly edge-on face is rejected)
      if (!(Math.abs(u) <= hw && Math.abs(v) <= hh)) return 0;
      const ax = Math.abs(u) - (hw - rad), ay = Math.abs(v) - (hh - rad);
      if (ax > 0 && ay > 0 && ax * ax + ay * ay > rad * rad) return 0;
      return fn(u, v);
    },
  });
  const camSplit = (v) => (v > -0.12 * CAM[1] ? K(RED) : K(WHITE));
  const CAM_FRONT = rrect(CAM[2], CAM[1], 1.2, (u, v) => (u > 0.34 * CAM[2] && u < 0.82 * CAM[2] && v > 0.3 * CAM[1] && v < 0.78 * CAM[1] ? K(WHITE, 1) : camSplit(v)));
  const CAM_BACK = rrect(CAM[2], CAM[1], 1.2, (u, v) => (u > 0.2 * CAM[2] && u < 0.72 * CAM[2] && v > 0.24 * CAM[1] && v < 0.74 * CAM[1] ? K(DARK) : camSplit(v)));
  const CAM_SIDE = rrect(CAM[0], CAM[1], 1.0, (u, v) => camSplit(v));
  const CAM_TOP = rrect(CAM[0], CAM[2], 1.0, () => K(RED));
  const CAM_BOT = rrect(CAM[0], CAM[2], 1.0, () => K(WHITE));
  // electric guitar in plate space: u along the neck (headstock at +u), v across the body
  const GTR_BODY = Shape2D.catmull([[-7.6, 0], [-7.1, 3.9], [-5.0, 6.0], [-2.2, 5.8], [0.2, 4.4], [2.6, 4.9], [5.2, 5.8], [6.3, 4.6], [4.8, 2.3], [4.8, -2.3], [6.3, -4.7], [5.0, -5.9], [2.4, -5.0], [0.2, -4.6], [-2.2, -6.1], [-5.0, -6.2], [-7.1, -4.0]], true, 6);
  const GTR_GUARD = Shape2D.catmull([[-6.2, -1.2], [-5.2, -4.8], [-2.4, -5.1], [0.6, -3.6], [3.4, -3.4], [3.8, -1.2], [0.8, -0.9], [-2.6, -1.8]], true, 5);
  const GTR_HEAD = Shape2D.catmull([[19.2, -1.4], [21.6, -1.9], [23.8, -1.3], [24.2, 0.4], [23.0, 2.3], [20.6, 2.1], [19.2, 1.4]], true, 5);
  const GTR_BB = [-8.2, -6.8, 24.8, 6.6];
  const gtrNeck = (u, v) => u > 4 && u < 19.6 && Math.abs(v) < 1.25;
  const gtrTest = (u, v) => {
    if (gtrNeck(u, v)) return u > 18.9 ? K(WHITE) : K(STRAW); // neck + nut
    if (Shape2D.inPoly(u, v, GTR_HEAD)) return (u - 21.1) ** 2 + (v + 1.1) ** 2 < 0.5 || (u - 23.0) ** 2 + (v + 0.7) ** 2 < 0.5 ? K(METAL) : K(PINK);
    if (!Shape2D.inPoly(u, v, GTR_BODY)) return 0;
    if (Math.abs(u - 1.2) < 0.75 && Math.abs(v) < 2.2) return K(WHITE); // neck pickup
    if (Math.abs(u + 2.2) < 0.75 && Math.abs(v) < 2.2) return K(WHITE); // bridge pickup
    if (Math.abs(u + 4.7) < 0.55 && Math.abs(v) < 2.4) return K(METAL); // bridge
    if ((u + 4.6) ** 2 + (v + 3.9) ** 2 < 0.55 || (u + 2.4) ** 2 + (v + 4.3) ** 2 < 0.55) return K(GOLD); // knobs
    if (Shape2D.inPoly(u, v, GTR_GUARD)) return K(GREEN);
    return K(PINK);
  };
  const GTR_G = lazy(() => bakeShape({ bb: GTR_BB, test: gtrTest }, 0.33));
  // the back plate (fake thickness) reuses the baked front silhouette
  const GTR_BACK_G = lazy(() => { const f = GTR_G(); return { bb: GTR_BB, test: (u, v) => (f.test(u, v) ? (gtrNeck(u, v) ? K(STRAW, -1) : K(PINK, -1)) : 0) }; });

  /* ---- hats (head frame h; sd = pose.side for camera-facing cheats) ---- */
  const HATS = {
    // Spheal-blue knit beanie: cream cuff, Spheal's white spots, pom-pom behind the head fin
    beanie(h, add) {
      const n = V3.norm([-0.12, 1, 0]), d = 0.28;
      const spots = [[-0.5, 0.66, 0.56], [-0.5, 0.66, -0.56], [0.3, 0.82, 0.48], [0.3, 0.82, -0.48]].map(V3.norm);
      add(eA(h, [HR[0] * 1.1, HR[1] * 1.12, HR[2] * 1.1], G.HAT, (s) => {
        if (dot3(s, n) < d + 0.14) return 0;
        for (const q of spots) if (dot3(s, q) > 0.978) return K(WHITE);
        return K(SPHEAL);
      }));
      add(eA(h, [HR[0] * 1.15, HR[1] * 1.15, HR[2] * 1.15], G.HAT2, (s) => { const e = dot3(s, n); return e < d || e > d + 0.2 ? 0 : K(CREAM); }));
      const pp = headPt(V3.norm([-0.64, 0.77, 0]), 3.6).p;
      add(eA(chain(h, T(pp[0], pp[1], pp[2])), [4.3, 4.1, 4.3], G.HAT3, () => K(WHITE)));
    },
    // white sailor cap: navy band with a gold badge, flat top, two ribbon tails at the back
    sailor(h, add) {
      const cf = chain(h, T(-0.6, 7.7, 0), R(M3.rz(0.1)));
      add(eA(cf, [13.7, 9.4, 15.4], G.HAT, (s) => {
        if (s[1] < -0.03) return 0;
        if (s[1] < 0.34) return s[0] > 0.93 && Math.abs(s[2]) < 0.2 && s[1] > 0.08 && s[1] < 0.28 ? K(GOLD, 1) : K(NAVY);
        return K(WHITE);
      }));
      add(eA(chain(cf, T(0, 7.2, 0)), [14.6, 3.4, 16.2], G.HAT2, () => K(WHITE)));
      for (const sz of [1, -1]) {
        const rf = chain(cf, T(-13.2, 1.6, sz * 2.6), R(M3.ry(sz * 0.3)), R(M3.rz(-0.34 - 0.1 * sz)));
        add(pA(rf, [0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], RIBBON_G(), G.HAT3, 1.1));
      }
    },
    // Pelipper-yellow bucket hat with a Pelipper-blue band
    bucket(h, add) {
      const tilt = R(M3.rz(0.08));
      add(eA(chain(h, T(-0.6, 9.9, 0), tilt), [12.3, 8.4, 13.7], G.HAT, (s) => (s[1] < 0.05 ? 0 : s[1] < 0.36 ? K(SPHEAL) : K(YELLOW))));
      add(eA(chain(h, T(-0.6, 6.4, 0), tilt), [19.0, 6.0, 19.4], G.HAT2, (s) => (s[1] < 0.03 ? 0 : K(YELLOW, s[1] < 0.13 ? -1 : 0))));
    },
    // straw sun hat with a red band
    straw(h, add) {
      const tilt = R(M3.rz(0.2));
      add(eA(chain(h, T(-2.2, 8.6, 0), tilt), [21.5, 4.2, 23.0], G.HAT2, (s) => {
        if (s[1] < 0.18) return 0;
        const r = Math.hypot(s[0], s[2]);
        return K(STRAW, r > 0.935 || (r > 0.7 && r < 0.745) ? -1 : 0);
      }));
      add(eA(chain(h, T(-2.2, 12.4, 0), tilt), [11.2, 7.0, 12.4], G.HAT, (s) => (s[1] < -0.2 ? 0 : s[1] < 0.3 ? K(RED) : K(STRAW))));
    },
    // flower crown: pink and white five-petal flowers with gold centres, leaves between
    flower(h, add) {
      for (let k = 0; k < 8; k++) {
        const az = (k * Math.PI) / 4;
        const { p, n } = headPt(sphv(az, 0.6), 1.0);
        const col = k % 2 ? WHITE : PINK, rot = k * 0.7;
        add(eAx(h, p, basis(n), [4.0, 4.0, 1.5], k % 2 ? G.HAT3 : G.HAT4, (s) => {
          const rr = Math.hypot(s[0], s[1]), th = Math.atan2(s[1], s[0]) + rot;
          if (rr > 0.7 + 0.3 * Math.cos(5 * th)) return 0;
          return rr < 0.3 ? K(GOLD) : K(col);
        }));
        const L = headPt(sphv(az + Math.PI / 8, 0.5), 0.6);
        add(eAx(h, L.p, basis(L.n), [3.6, 1.6, 1.0], G.HAT2, () => K(GREEN)));
      }
    },
    // pop-star tiara: gold band with a big gold star at the front (turned toward the camera)
    star(h, add, sd) {
      const n = V3.norm([-0.28, 1, 0]), d = 0.46, k = 1.07;
      add(eA(h, [HR[0] * k, HR[1] * k, HR[2] * k], G.HAT2, (s) => (Math.abs(dot3(s, n) - d) < 0.085 ? K(GOLD) : 0)));
      const phi = Math.asin(d) - Math.atan2(n[0], n[1]);
      const p = headPt([Math.cos(phi), Math.sin(phi), 0], 0.8).p;
      const sf = chain(h, T(p[0] + 0.2, p[1] + 4.6, 0), R(M3.ry(-0.75 * sd)), R(M3.rz(0.3)));
      add(pA(sf, [0, 0, 0], [[0, 0, 1], [0, 1, 0], [1, 0, 0]], STAR_G(), G.HAT3, 1.5));
      // two pink gems on the band either side of the star
      for (const sz of [1, -1]) {
        const az = 0.95 * sz, A = n[0] * Math.cos(az), B = n[1];
        const v = Math.asin(d / Math.hypot(A, B)) - Math.atan2(A, B);
        const q = headPt([Math.cos(v) * Math.cos(az), Math.sin(v), Math.cos(v) * Math.sin(az)], 1.2);
        add(eAx(h, q.p, basis(q.n), [1.5, 1.7, 1.0], G.HAT4, (s) => K(PINK, s[1] > 0.3 && s[0] < 0.2 ? 2 : 0)));
      }
    },
    // plush lobster: red cap with tail segments down the back, eyes on stalks, antennae, two claws
    lobster(h, add) {
      const n = V3.norm([-0.16, 1, 0]), d = 0.24;
      add(eA(h, [HR[0] * 1.09, HR[1] * 1.1, HR[2] * 1.09], G.HAT, (s) => {
        const e = dot3(s, n);
        if (e < d) return 0;
        if (e < d + 0.07) return K(RED, -1);
        if (s[0] < -0.28 && ((-s[0] - 0.28) / 0.16) % 1 < 0.25) return K(RED, -1);
        return K(RED);
      }));
      for (const sz of [1, -1]) {
        // eyes on short stalks, either side of the head fin
        add(rodA(h, [10.0, 11.4, 4.4 * sz], [11.4, 14.2, 5.3 * sz], 1.15, G.HAT3, () => K(RED)));
        const pd = V3.norm([1, 0.18, 0.5 * sz]), gl = V3.norm([0.78, 0.55, 0.32 * sz]);
        add(eA(chain(h, T(12.0, 16.0, 5.7 * sz)), [2.9, 2.9, 2.9], G.HAT3, (s) => (dot3(s, pd) > 0.5 ? (dot3(s, gl) > 0.955 ? K(WHITE, 1) : K(DARK)) : K(WHITE))));
        // antennae: up past the eyes then sweeping back beside the fin (fin shadow group: thin
        // rods would otherwise speckle the fin with screen-space shadows)
        const A = [[11.2, 15.0, 3.8], [13.4, 20.4, 4.7], [12.2, 25.4, 5.6], [8.6, 29.0, 6.3], [4.0, 30.6, 6.9]].map((q) => [q[0], q[1], q[2] * sz]);
        for (let i = 0; i < A.length - 1; i++) { const r = rodA(h, A[i], A[i + 1], 0.85 - i * 0.07, G.HAT3, () => K(RED, -1)); r.grp = 8; add(r); }
        // claws: an arm and a big pincer (palm ellipsoid with a V notch opening at the tip)
        const cg = sz > 0 ? G.HAT4 : G.HAT5;
        const cd = V3.norm([0.06, 0.8, 0.62 * sz]), cax = basis(cd);
        const pc = [6.6, 16.6, 16.2 * sz];
        add(rodA(h, [4.4, 7.4, 13.2 * sz], V3.sub(pc, V3.scale(cd, 3.8)), 1.8, cg, () => K(RED)));
        add(eAx(h, pc, cax, [2.8, 3.6, 5.8], cg, (s) => (s[2] > 0.18 && Math.abs(s[1] - 0.06) < (s[2] - 0.18) * 0.52 ? 0 : K(RED))));
      }
    },
  };

  /* ---- shirts (body frame; the shirt is a shell ~0.85 outside the body, sleeves on the front legs) ---- */
  const SHIRT_R = [15.35, 10.5, 11.1];
  const sparkle = (s, n = 9) => hash3(Math.floor(s[0] * n + 50), Math.floor(s[1] * n + 50), Math.floor(s[2] * n + 50)) < 0.09;
  const HOOD_OPEN = V3.norm([0.62, 0.78, 0]);
  const SHIRTS = {
    heart: {
      x0: -0.52, slvY: -2.4, slvR: [4.2, 3.2, 4.0],
      body(s, hem) {
        if (hem) return K(PINK, -1);
        const x = s[0] * SHIRT_R[0], y = s[1] * SHIRT_R[1];
        if (Math.abs(s[2]) > 0.25 && inHeart((x + 2.8) / 4.5, (y + 1.3) / 4.5)) return K(RED);
        if (s[0] > 0.8 && inHeart((s[2] * SHIRT_R[2]) / 3.6, (y + 3.2) / 3.6)) return K(RED);
        return K(PINK);
      },
      sleeve: (s) => K(PINK, s[1] < -0.62 ? -1 : 0),
    },
    stripe: {
      x0: -0.5, slvY: -2.4, slvR: [4.2, 3.2, 4.0],
      body(s, hem) {
        if (hem) return K(NAVY);
        return Math.floor((s[1] * SHIRT_R[1] + 40) / 3.1) % 2 ? K(NAVY) : K(WHITE);
      },
      sleeve: (s) => (s[1] < -0.55 ? K(NAVY) : K(WHITE)),
    },
    pop: {
      x0: -0.46, slvY: -2.6, slvR: [4.2, 3.5, 4.0],
      body(s, hem) {
        if (hem) return K(GOLD);
        if (s[0] > 0.45 && Math.abs(s[2]) < 0.07) return K(GOLD);
        return K(MAGENTA, sparkle(s) ? 2 : 0);
      },
      sleeve: (s) => (s[1] < -0.55 ? K(GOLD) : K(MAGENTA, sparkle(s, 5) ? 2 : 0)),
      extra(body, add) {
        for (const sz of [1, -1]) {
          const q = [7.2, 0.8, 9.2 * sz];
          const nn = V3.norm([q[0] / SHIRT_R[0] ** 2, q[1] / SHIRT_R[1] ** 2, q[2] / SHIRT_R[2] ** 2]);
          const ax = basis(nn, [1, 0, 0]);
          add(eAx(body, V3.add(q, V3.scale(nn, 1.0)), ax, [2.6, 3.3, 1.2], G.SHIRT2, () => K(GOLD)));
        }
      },
    },
    hoodie: {
      x0: -0.52, slvY: -3.4, slvR: [4.2, 4.3, 4.0],
      body: (s, hem) => K(ORANGE, hem ? -1 : 0),
      sleeve: (s) => K(ORANGE, s[1] < -0.62 ? -1 : 0),
      extra(body, add) {
        add(eA(chain(body, T(-5.4, 10.9, 0), R(M3.rz(0.28))), [6.6, 4.4, 8.4], G.SHIRT2, (s) => {
          const e = dot3(s, HOOD_OPEN);
          return e > 0.5 ? K(ORANGE, -2) : e > 0.34 ? K(ORANGE, 1) : K(ORANGE);
        }));
        for (const sz of [1, -1]) {
          add(rodA(body, [15.3, 1.2, 2.3 * sz], [15.7, -3.8, 2.7 * sz], 0.5, G.SHIRT2, () => K(WHITE)));
          add(eA(chain(body, T(15.8, -4.3, 2.75 * sz)), [0.8, 0.9, 0.8], G.SHIRT2, () => K(METAL)));
        }
      },
    },
  };
  function shirt(kind, body, legs, add) {
    const S = SHIRTS[kind];
    add(eA(body, SHIRT_R, G.SHIRT, (s) => (s[0] < S.x0 ? 0 : S.body(s, s[0] < S.x0 + 0.075))));
    for (const id of [2, 3]) add(eA(chain(legs[id], T(0.25, S.slvY, 0)), S.slvR, id === 2 ? G.SLV2 : G.SLV3, S.sleeve));
    if (S.extra) S.extra(body, add);
  }

  /* ---- glasses (head frame): lenses float just off the eyes, bridge over the nose, arms back to the gills ---- */
  function glasses(kind, h, add) {
    const inner = [];
    const fc = kind === 'round' ? DARK : PINK;
    for (const sz of [1, -1]) {
      const { p, n } = headPt(sphv(0.5 * sz, -0.06), 1.5);
      const ax = basis(n);
      const toNose = ax[0][2] * sz > 0 ? V3.scale(ax[0], -1) : ax[0];
      const part = sz > 0 ? G.GLN : G.GLF;
      if (kind === 'round') add(eAx(h, p, ax, [4.7, 4.7, 0.9], part, (s) => (Math.hypot(s[0], s[1]) > 0.8 ? K(DARK) : K(LENS, (s[0] + 0.35 * sz) ** 2 + (s[1] - 0.4) ** 2 < 0.06 ? 3 : -1))));
      else add(pA(h, p, ax, STARGL_G(), part, 1.3));
      const rr = kind === 'round' ? 4.3 : 3.9;
      inner.push(V3.add(p, V3.scale(toNose, rr)));
      add(rodA(h, V3.add(p, V3.scale(toNose, -rr)), headPt(sphv(1.08 * sz, 0.02), 0.8).p, 0.55, G.GLB, () => K(fc)));
    }
    const mid = V3.add(V3.scale(V3.add(inner[0], inner[1]), 0.5), [0.6, 0.9, 0]);
    add(rodA(h, inner[0], mid, 0.6, G.GLB, () => K(fc)));
    add(rodA(h, mid, inner[1], 0.6, G.GLB, () => K(fc)));
  }

  /* ---- camera: frame f has x = lens axis; returns the lens front point (model space) ---- */
  function camera(f, add, pb, pl) {
    const [a, b, c] = CAM;
    const face = (t, u, v, w, sh) => add(pA(f, t, [u, v, w], sh, pb, 0.8));
    face([a, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0], CAM_FRONT);
    face([-a, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], CAM_BACK);
    face([0, 0, c], [1, 0, 0], [0, 1, 0], [0, 0, 1], CAM_SIDE);
    face([0, 0, -c], [-1, 0, 0], [0, 1, 0], [0, 0, -1], CAM_SIDE);
    face([0, b, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0], CAM_TOP);
    face([0, -b, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], CAM_BOT);
    add(eAx(f, [a + 1.0, -0.5, 0], [[0, 0, 1], [0, 1, 0], [1, 0, 0]], [3.9, 3.9, 2.6], pl,
      (s) => (s[2] > 0.62 ? K(LENS, (s[0] + 0.26) ** 2 + (s[1] - 0.28) ** 2 < 0.07 ? 3 : 0) : K(DARK))));
    add(eA(chain(f, T(-0.3, b + 0.2, 0)), [2.2, 1.7, 2.6], pb, () => K(RED)));   // viewfinder hump
    add(eA(chain(f, T(-0.5, b + 0.4, -c * 0.62)), [1.1, 0.8, 1.1], pl, () => K(METAL, 1)));   // shutter button
    return chain(f, T(a + 3.4, -0.5, 0)).t;
  }

  function dress(P, fr, prims, anchors, pri) {
    const add = (p) => { prims.push(p); if (pri[p.grp] === undefined) pri[p.grp] = ACC_PRI[p.grp] ?? 3; return p; };
    const { body, head, legs, gside } = fr;
    const sd = P.side === undefined ? 1 : Math.max(-1, Math.min(1, P.side));
    if (own(HATS, P.hat)) HATS[P.hat](head, add, sd);
    if (own(SHIRTS, P.shirt)) shirt(P.shirt, body, legs, add);
    if (P.glasses === 'star' || P.glasses === 'round') glasses(P.glasses, head, add);
    // neck
    if (P.neck === 'bow') {
      for (const sz of [1, -1]) add(eAx(body, [15.9, -0.4, 3.3 * sz], basis([0.12, 0, sz]), [1.4, 2.7, 3.4], G.NECK, (s) => K(RED, Math.abs(s[2]) < 0.35 ? -1 : 0)));
      add(eA(chain(body, T(16.9, -0.4, 0)), [1.6, 1.8, 1.6], G.NECK2, () => K(RED, -1)));
    } else if (P.neck === 'scarf') {
      add(eA(chain(body, T(10.4, 4.9, 0), R(M3.rz(-0.5))), [8.9, 3.5, 11.6], G.NECK, () => K(RED)));
      add(eA(chain(body, T(16.6, 0.4, 1.8)), [1.9, 1.9, 1.9], G.NECK2, () => K(RED, -1)));
      add(eAx(body, [17.4, -3.2, 2.9], basis([0.2, 0, 1]), [1.9, 3.8, 0.9], G.NECK3, () => K(RED)));
      add(eAx(body, [17.0, -2.4, 0.2], basis([0.25, 0, 1]), [1.8, 3.4, 0.9], G.NECK3, () => K(RED, -1)));
    }
    if (P.hold === 'camera') {
      // camera raised to the face, lens forward; the neck strap keeps it tethered
      const cf = chain(head, T(17.5, -2.3, 0));
      anchors.lens = camera(cf, add, G.HOLD, G.HOLD3);
      for (const sz of [1, -1]) {
        const a0 = chain(cf, T(-1.2, CAM[1] * 0.2, sz * (CAM[2] + 0.3))).t;
        const n1 = chain(body, T(15.0, 3.2, sz * 9.2)).t, n2 = chain(body, T(9.5, 6.8, sz * 9.8)).t;
        add(rodA(W0, a0, n1, 0.6, G.HOLD2, () => K(DARK)));
        add(rodA(W0, n1, n2, 0.6, G.HOLD2, () => K(DARK)));
      }
    } else if (P.neck === 'camera' && P.hold === 'guitar') {
      // playing the guitar: the camera is slung round onto the back, lens up, strap round the neck
      const cp = [-7.4, 12.2, 0], cr = M3.rz(Math.PI / 2 + 0.3);
      anchors.lens = camera(chain(body, T(...cp), R(cr)), add, G.NECK, G.NECK3);
      for (const sz of [1, -1]) {
        const pts = [V3.add(cp, M3.v(cr, [-1.0, -(CAM[1] - 1.0), sz * (CAM[2] + 0.35)])), [2.0, 9.6, 8.6 * sz], [9.0, 6.5, 10.4 * sz]];
        for (let i = 0; i < pts.length - 1; i++) add(rodA(body, pts[i], pts[i + 1], 0.7, G.NECK2, () => K(DARK)));
      }
    } else if (P.neck === 'camera') {
      const cp = [18.2, -2.0, 0], cr = M3.I();
      anchors.lens = camera(chain(body, T(...cp), R(cr)), add, G.NECK, G.NECK3);
      for (const sz of [1, -1]) {
        const pts = [V3.add(cp, [-1.2, CAM[1] - 1.0, sz * (CAM[2] + 0.35)]), [15.0, 5.2, 12.2 * sz], [9.5, 8.4, 11.6 * sz]];
        for (let i = 0; i < pts.length - 1; i++) add(rodA(body, pts[i], pts[i + 1], 0.7, G.NECK2, () => K(DARK)));
      }
    }
    if (P.hold === 'guitar') {
      const sg = gside;
      const Rg = M3.mul(M3.ry(-0.5 * sg), M3.rz(0.2));
      const ang = 0.52;
      const u = M3.v(Rg, [0, Math.sin(ang), -sg * Math.cos(ang)]), w = M3.v(Rg, [1, 0, 0]);
      const v = V3.cross(w, u);
      const c = [15.3, -3.5, 1.4 * sg], gs = 0.95; // a small-Pokémon sized guitar
      const ax = [V3.scale(u, gs), V3.scale(v, gs), w];
      add(pA(body, c, ax, GTR_G(), G.HOLD, 1.3));
      add(pA(body, V3.add(c, V3.scale(w, -1.5)), ax, GTR_BACK_G(), G.HOLD2, 1.3));
      anchors.guitar = chain(body, T(...c)).t;
    }
  }

  /* ---------- eye stamps ---------- */
  // k = black, w = white, b = deep-blue glint, '.' = skip
  const EYES_S = {
    open: ['.k.', 'kwk', 'kkk', 'kbk', '.k.'],
    openN: ['.k', 'wk', 'kk', 'bk', '.k'],
    openF: ['k', 'k', 'k', 'k'],
    happy: ['.k.', 'k.k'],
    happyN: ['.k', 'k.'],
    happyF: ['k', 'k'],
    blink: ['...', '...', 'kkk'],
    blinkN: ['..', '..', 'kk'],
    blinkF: ['.', '.', 'k'],
    sleep: ['k.k', '.k.'],
    sleepN: ['k.', '.k'],
    sleepF: ['k'],
  };
  const EYES_L = {
    open: ['.kk.', 'kwwk', 'kwkk', 'kkbk', '.kk.'],
    openN: ['.k.', 'kwk', 'kkk', 'kbk', '.k.'],
    openF: ['k.', 'wk', 'kk', 'kk', '.k'],
    happy: ['.kk.', 'k..k', 'k..k'],
    happyN: ['.k.', 'k.k', 'k.k'],
    happyF: ['.k', 'k.', 'k.'],
    blink: ['....', '....', '....', 'kkkk'],
    blinkN: ['...', '...', '...', 'kkk'],
    blinkF: ['..', '..', '..', 'kk'],
    sleep: ['k..k', '.kk.'],
    sleepN: ['k.k', '.k.'],
    sleepF: ['k.', '.k'],
  };
  const EYES = EYES_S;

  /* ---------- renderer: shared Creature pipeline with Mudkip's eye stamps ---------- */
  const EYEC = { k: '#101826', w: '#ffffff', b: '#2e4a78' };
  function render(model, opt) {
    const set = (opt.scale || 1) >= 1.2 ? EYES_L : EYES_S;
    for (const st of model.stamps) st.set = set;
    return Creature.render(model, opt);
  }

  // Build a graded palette from BASE_PAL through a colour function
  function gradePalette(fn) {
    const out = {};
    for (const k in BASE_PAL) {
      const e = BASE_PAL[k];
      out[k] = { r: e.r.map((c, i) => fn(c, i)), od: fn(e.od, -2), ol: fn(e.ol, -1), ln: fn(e.ln, -1) };
    }
    return out;
  }

  return { build, render, BASE_PAL, PAL: BASE_PAL, gradePalette, MAT, EYES, meta: { heightM: 0.4, bw: 112, bh: 112, oy: 0.86 } };
})();
