/* ------------------------------------------------------------------
   Mudkip — a posable 3D model rendered straight to pixel art.
   Orthographic ray casting against analytic ellipsoids and flat
   "plates" (fins, gills), toon-shaded into hand-picked colour ramps,
   then finished with sel-out outlines and hand-drawn eye stamps.
------------------------------------------------------------------- */
const Mudkip = (() => {
  // material ids
  const BODY = 1, BELLY = 2, JAW = 3, FIN = 4, FINEDGE = 5, TAIL = 6, GILL = 7, MOUTH = 8, TONGUE = 9;
  const MAT = { BODY, BELLY, JAW, FIN, FINEDGE, TAIL, GILL, MOUTH, TONGUE };
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
  };
  const GLOSSY = { [BODY]: 1, [FIN]: 1, [GILL]: 1, [BELLY]: 0, [JAW]: 1, [TAIL]: 0, [FINEDGE]: 0 };

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
    for (const lg of legs) {
      const side = Math.sign(lg.hip[2]);
      const f = chain(body, T(...lg.hip), R(M3.rz(lg.sw)), R(M3.rx(-side * P.legSplay)));
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
      eyeN: onHead(0.5 + look, -0.06),
      eyeF: onHead(-0.5 + look, -0.06),
      nosN: onHead(0.13, -0.27),
      nosF: onHead(-0.13, -0.27),
      mouth: onHead(0, -0.42),
      headTop: V3.add(head.t, M3.v(head.L, [0, HEAD_R[1], 0])),
      finTip: V3.add(fin.t, M3.v(fin.L, [-2.6, 29, 0])),
      head: head.t,
      body: body.t,
    };
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
      pri: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 1, 8: 2, 9: 3, 10: 3 },
      glossy: GLOSSY,
      baseMat: BODY,
    };
  }

  /* ---------- eye stamps ---------- */
  // k = black, w = white, b = deep-blue glint, '.' = skip
  const EYES_S = {
    open: ['.kk.', 'kwwk', 'kwkk', 'kkkk', 'kkbk', '.kk.'],
    openN: ['.k.', 'kwk', 'kwk', 'kkk', 'kkk', '.k.'],
    openF: ['kk', 'wk', 'kk', 'kk', '.k'],
    happy: ['.kk.', 'k..k', 'k..k'],
    happyN: ['.k.', 'k.k', 'k.k'],
    happyF: ['.k', 'k.', 'k.'],
    blink: ['....', '....', 'kkkk', '.kk.'],
    blinkN: ['...', '...', 'kkk', '.k.'],
    blinkF: ['..', '..', 'kk', '.k'],
    sleep: ['k..k', '.kk.'],
    sleepN: ['k.k', '.k.'],
    sleepF: ['k.', '.k'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwwkk', 'kwwkk', 'kkkkk', 'kkkbk', 'kkbbk', '.kkk.'],
    openN: ['.kk.', 'kwwk', 'kwkk', 'kkkk', 'kkbk', 'kkbk', '.kk.'],
    openF: ['kk.', 'wkk', 'kkk', 'kkk', 'kbk', '.k.'],
    happy: ['.kkk.', 'k...k', 'k...k'],
    happyN: ['.kk.', 'k..k', 'k..k'],
    happyF: ['.kk', 'k..', 'k..'],
    blink: ['.....', '.....', '.....', 'kkkkk', '.kkk.'],
    blinkN: ['....', '....', '....', 'kkkk', '.kk.'],
    blinkF: ['...', '...', '...', 'kkk', '.kk'],
    sleep: ['k...k', '.kkk.'],
    sleepN: ['k..k', '.kk.'],
    sleepF: ['k..', '.kk'],
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
