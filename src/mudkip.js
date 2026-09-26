/* ------------------------------------------------------------------
   Mudkip — a posable 3D model rendered straight to pixel art.
   Orthographic ray casting against analytic ellipsoids and flat
   "plates" (fins, gills), toon-shaded into hand-picked colour ramps,
   then finished with sel-out outlines and hand-drawn eye stamps.
------------------------------------------------------------------- */
const M3 = {
  mul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ];
  },
  v(m, p) {
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  },
  inv(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const id = 1 / (a * A + b * B + c * C);
    return [
      A * id, -(b * i - c * h) * id, (b * f - c * e) * id,
      B * id, (a * i - c * g) * id, -(a * f - c * d) * id,
      C * id, -(a * h - b * g) * id, (a * e - b * d) * id,
    ];
  },
  rx(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  ry(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  rz(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
  diag(x, y, z) { return [x, 0, 0, 0, y, 0, 0, 0, z]; },
  I() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
  cols(u, v, w) { return [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]]; },
};
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/* ---------- 2D shape helpers for plates ---------- */
const Shape2D = {
  catmull(pts, closed = true, seg = 8) {
    const out = [], n = pts.length;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  },
  inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  },
  segDist(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t);
  },
  polyDist(x, y, pl) {
    let d = Infinity;
    for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, Shape2D.segDist(x, y, pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]));
    return d;
  },
  bbox(poly, pad = 0) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    return [a - pad, b - pad, c + pad, d + pad];
  },
  inTri(px, py, a, b, c) {
    const s1 = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    const s2 = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0]);
    const s3 = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0]);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  },
};

// Bake a 2D shape test into a lookup grid (0.25 unit cells) so per-pixel tests are O(1)
function bakeShape(shape, res = 0.25) {
  const [u0, v0, u1, v1] = shape.bb;
  const gw = Math.ceil((u1 - u0) / res), gh = Math.ceil((v1 - v0) / res);
  const g = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) g[y * gw + x] = shape.test(u0 + (x + 0.5) * res, v0 + (y + 0.5) * res);
  return {
    bb: shape.bb,
    test(u, v) {
      const x = Math.floor((u - u0) / res), y = Math.floor((v - v0) / res);
      if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
      return g[y * gw + x];
    },
  };
}

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
    return { prims, anchors, pose: P, headPrim };
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

  /* ---------- renderer ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82, pal, light } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const N = W * H;
    const depth = new Float32Array(N).fill(-1e9);
    const mat = new Uint8Array(N), part = new Uint8Array(N), grp = new Uint8Array(N), bias = new Int8Array(N);
    const nxb = new Float32Array(N), nyb = new Float32Array(N), nzb = new Float32Array(N);

    for (const p of model.prims) {
      p.cv = M3.v(V, p.c);
      p.Lv = M3.mul(V, p.L);
      p.Li = M3.inv(p.Lv);
      const Li = p.Li, cv = p.cv;
      let x0, y0, x1, y1;
      if (p.kind === 'ell') {
        const rx = Math.hypot(p.Lv[0], p.Lv[1], p.Lv[2]), ry = Math.hypot(p.Lv[3], p.Lv[4], p.Lv[5]);
        x0 = ox + cv[0] - rx; x1 = ox + cv[0] + rx; y0 = oy - cv[1] - ry; y1 = oy - cv[1] + ry;
      } else {
        const [a, b, c, d] = p.shape.bb;
        x0 = y0 = Infinity; x1 = y1 = -Infinity;
        for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]]) {
          for (const w of [-p.thick, p.thick]) {
            const q = V3.add(cv, M3.v(p.Lv, [u, v, w]));
            x0 = Math.min(x0, ox + q[0]); x1 = Math.max(x1, ox + q[0]);
            y0 = Math.min(y0, oy - q[1]); y1 = Math.max(y1, oy - q[1]);
          }
        }
      }
      const px0 = Math.max(0, Math.floor(x0) - 1), px1 = Math.min(W - 1, Math.ceil(x1) + 1);
      const py0 = Math.max(0, Math.floor(y0) - 1), py1 = Math.min(H - 1, Math.ceil(y1) + 1);
      if (p.kind === 'ell') {
        const dx = Li[2], dy = Li[5], dz = Li[8];
        const a = dx * dx + dy * dy + dz * dz;
        for (let py = py0; py <= py1; py++) {
          const Y = oy - (py + 0.5) - cv[1];
          for (let px = px0; px <= px1; px++) {
            const X = px + 0.5 - ox - cv[0];
            const Z0 = -cv[2];
            const s0x = Li[0] * X + Li[1] * Y + Li[2] * Z0;
            const s0y = Li[3] * X + Li[4] * Y + Li[5] * Z0;
            const s0z = Li[6] * X + Li[7] * Y + Li[8] * Z0;
            const b = 2 * (s0x * dx + s0y * dy + s0z * dz);
            const c = s0x * s0x + s0y * s0y + s0z * s0z - 1;
            const disc = b * b - 4 * a * c;
            if (disc < 0) continue;
            const t = (-b + Math.sqrt(disc)) / (2 * a);
            const Z = t;
            const i = py * W + px;
            if (Z <= depth[i]) continue;
            const s = [s0x + t * dx, s0y + t * dy, s0z + t * dz];
            const m = p.mat(s);
            if (!m) continue;
            // normal = Li^T s
            let nx = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2];
            let ny = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2];
            let nz = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
            const l = Math.hypot(nx, ny, nz) || 1;
            depth[i] = Z; mat[i] = m & 31; bias[i] = (m >> 5) - 2; part[i] = p.part; grp[i] = p.grp;
            nxb[i] = nx / l; nyb[i] = ny / l; nzb[i] = nz / l;
          }
        }
      } else {
        // plate: w(Z) = row2 . (p - c)
        const r2x = Li[6], r2y = Li[7], r2z = Li[8];
        let nl = Math.hypot(r2x, r2y, r2z);
        let nx = r2x / nl, ny = r2y / nl, nz = r2z / nl;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const edgeOn = Math.abs(r2z) / nl < 0.45;
        const samples = edgeOn ? 7 : 1;
        for (let py = py0; py <= py1; py++) {
          const Y = oy - (py + 0.5) - cv[1];
          for (let px = px0; px <= px1; px++) {
            const X = px + 0.5 - ox - cv[0];
            const w0 = r2x * X + r2y * Y - r2z * cv[2] * 0; // partial (without Z term)
            const i = py * W + px;
            let hitZ = null, hitM = 0;
            if (!edgeOn) {
              const Zr = -(r2x * X + r2y * Y) / r2z; // relative Z (to cv)
              const u = Li[0] * X + Li[1] * Y + Li[2] * Zr;
              const v = Li[3] * X + Li[4] * Y + Li[5] * Zr;
              const m = p.shape.test(u, v);
              if (m) { hitZ = Zr + cv[2]; hitM = m; }
            } else {
              // sample across the slab |w| <= thick/2, front to back
              const half = p.thick / 2;
              const za = (-half - (r2x * X + r2y * Y)) / r2z, zb = (half - (r2x * X + r2y * Y)) / r2z;
              const zf = Math.max(za, zb), zk = Math.min(za, zb);
              for (let k = 0; k < samples; k++) {
                const Zr = zf + ((zk - zf) * k) / (samples - 1);
                const u = Li[0] * X + Li[1] * Y + Li[2] * Zr;
                const v = Li[3] * X + Li[4] * Y + Li[5] * Zr;
                const m = p.shape.test(u, v);
                if (m) { hitZ = Zr + cv[2]; hitM = m; break; }
              }
            }
            if (hitZ === null || hitZ <= depth[i]) continue;
            depth[i] = hitZ; mat[i] = hitM & 31; bias[i] = (hitM >> 5) - 2; part[i] = p.part; grp[i] = p.grp;
            nxb[i] = nx; nyb[i] = ny; nzb[i] = nz;
          }
        }
      }
    }

    /* ---- screen-space cast shadows (head over body, gills over cheeks...) ---- */
    const Lg0 = light || { dir: [-0.5, 0.72, 0.5] };
    const Ld0 = V3.norm(Lg0.dir);
    const shadow = new Uint8Array(N);
    {
      const st = 1 / Math.max(Math.abs(Ld0[0]), Math.abs(Ld0[1]), 0.2);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!mat[i]) continue;
          const X0 = x + 0.5 - ox, Y0 = oy - (y + 0.5), Z0 = depth[i];
          for (let k = 2; k < 30; k++) {
            const qx = X0 + Ld0[0] * st * k, qy = Y0 + Ld0[1] * st * k, qz = Z0 + Ld0[2] * st * k;
            const sx = Math.floor(ox + qx), sy = Math.floor(oy - qy);
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) break;
            const j = sy * W + sx;
            if (mat[j] && grp[j] !== grp[i] && depth[j] > qz + 1.5 && depth[j] < qz + 26) { shadow[i] = 1; break; }
          }
        }
    }

    /* ---- shading ---- */
    const Lg = light || { dir: [-0.5, 0.72, 0.5] };
    const Ld = V3.norm(Lg.dir);
    const Hh = V3.norm(V3.add(Ld, [0, 0, 1]));
    const th = Lg.th || [-0.2, 0.18, 0.74];
    const specT = Lg.spec ?? 0.975;
    const rim = Lg.rim || null; // {dir2:[x,y], k, color}
    const out = new Uint32Array(N);
    const tone = new Int8Array(N).fill(-1);
    const rimMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const m = mat[i];
      if (!m) continue;
      const nx = nxb[i], ny = nyb[i], nz = nzb[i];
      let d = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
      // plates are two-sided & thin: soften
      let t = d < th[0] ? 0 : d < th[1] ? 1 : d < th[2] ? 2 : 3;
      if (shadow[i]) t = Math.min(t, d < th[1] ? 0 : 1);
      t += bias[i];
      const sp = nx * Hh[0] + ny * Hh[1] + nz * Hh[2];
      if (GLOSSY[m] && !shadow[i] && sp > specT && t >= 2) t = 4;
      let rimHit = false;
      if (rim) {
        const r = (1 - nz) * Math.max(0, nx * rim.dir[0] + ny * rim.dir[1]);
        if (r > rim.k && !(rim.noShadow && shadow[i])) { t = Math.max(t, rim.base ?? 3) + (r > rim.k * 1.6 ? 1 : 0); rimHit = true; }
      }
      t = Math.max(0, Math.min(4, t));
      tone[i] = t;
      out[i] = rimHit && rim.pal ? rim.pal[m].r[t] : pal[m].r[t];
      if (rimHit && rim.pal) rimMask[i] = 1;
    }

    /* ---- projected line decals ---- */
    const proj = (p, q) => {
      const g = V3.add(p.cv, M3.v(p.Lv, q));
      return [ox + g[0], oy - g[1], g[2]];
    };
    const plotLine = (a, b, color, partId) => {
      let x0 = Math.floor(a[0]), y0 = Math.floor(a[1]);
      const x1 = Math.floor(b[0]), y1 = Math.floor(b[1]);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) {
          const i = y0 * W + x0;
          if (part[i] === partId) out[i] = color;
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    for (const p of model.prims) {
      if (!p.lines) continue;
      for (const ln of p.lines) {
        const pts = ln.pts.map((q) => proj(p, q));
        const col = ln.useLn ? pal[ln.mat].ln : pal[ln.mat].r[ln.tone];
        for (let k = 0; k < pts.length - 1; k++) plotLine(pts[k], pts[k + 1], col, p.part);
      }
    }

    /* ---- eyes ---- */
    const P = model.pose;
    const hp = model.headPrim;
    const eyeInfo = [];
    for (const key of ['eyeN', 'eyeF']) {
      const an = model.anchors[key];
      const q = M3.v(V, an.p);
      // surface normal at anchor
      const Li = hp.Li;
      const s = an.s;
      let n = [Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2]];
      n = V3.norm(n);
      const X = ox + q[0], Y = oy - q[1];
      const xi = Math.floor(X), yi = Math.floor(Y);
      if (n[2] < 0.12) continue;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const i = yi * W + xi;
      if (part[i] !== hp.part || Math.abs(depth[i] - q[2]) > 3) continue;
      const kind = P.eyes;
      const EYES = scale >= 1.2 ? EYES_L : EYES_S;
      let st = EYES[kind] || EYES.open;
      if (n[2] < 0.5) st = EYES[kind + 'F'] || EYES.openF;
      else if (n[2] < 0.78) st = EYES[kind + 'N'] || EYES.openN;
      eyeInfo.push({ x: xi, y: yi, st, fore: n[2] });
    }
    const EYEC = { k: PX.hex('#101826'), w: PX.hex('#ffffff'), b: PX.hex('#2e4a78') };
    for (const e of eyeInfo) {
      const sh = e.st.length, sw = e.st[0].length;
      const x0 = e.x - Math.floor(sw / 2), y0 = e.y - Math.floor(sh / 2);
      for (let r = 0; r < sh; r++)
        for (let c = 0; c < sw; c++) {
          const ch = e.st[r][c];
          if (ch === '.') continue;
          const x = x0 + c, y = y0 + r;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (!mat[i]) continue;
          out[i] = EYEC[ch];
          mat[i] = 31; // mark as eye so outlines treat it as head
        }
    }

    // tiny nostrils
    for (const key of ['nosN', 'nosF']) {
      const an = model.anchors[key];
      const q = M3.v(V, an.p);
      const Li = hp.Li, s = an.s;
      const n = V3.norm([Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2]]);
      if (n[2] < 0.35 || P.noNostrils) continue;
      const xi = Math.floor(ox + q[0]), yi = Math.floor(oy - q[1]);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const i = yi * W + xi;
      if (part[i] !== hp.part || Math.abs(depth[i] - q[2]) > 3 || mat[i] !== BODY) continue;
      out[i] = pal[BODY].r[0];
    }

    /* ---- internal contour lines ----
       A step in depth puts the line on the occluded side; where two parts sit flush
       (a gill lying on the cheek) the higher-priority part outlines its own edge. */
    const PRI = { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 1, 8: 2, 9: 3, 10: 3 };
    const lineCol = new Uint32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!grp[i]) continue;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const j of nb) {
          if (j < 0 || !grp[j] || grp[j] === grp[i]) continue;
          const m = mat[i] === 31 ? BODY : mat[i];
          if (depth[j] > depth[i] + 1.2) { lineCol[i] = pal[m].ln; break; }
          if (depth[j] >= depth[i] - 1.2 && (PRI[grp[i]] || 0) > (PRI[grp[j]] || 0)) { lineCol[i] = pal[m].ln; break; }
        }
      }
    for (let i = 0; i < N; i++) if (lineCol[i]) out[i] = lineCol[i];

    /* ---- outer outline (1px, sel-out) ---- */
    const final = new Uint32Array(N);
    final.set(out);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mat[i]) continue;
        let best = -1, bestTone = 9;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const j of nb) {
          if (j < 0 || !mat[j]) continue;
          const tj = tone[j] < 0 ? 2 : tone[j];
          if (best < 0 || depth[j] > depth[best]) { best = j; bestTone = tj; }
        }
        if (best < 0) continue;
        const m = mat[best] === 31 ? BODY : mat[best];
        // lit side gets the lighter outline
        const P2 = rimMask[best] && rim && rim.pal ? rim.pal : pal;
        final[i] = bestTone >= 3 ? P2[m].ol : P2[m].od;
        depth[i] = depth[best] - 0.01;
        part[i] = part[best];
      }

    // screen-space anchors
    const A = {};
    for (const k in model.anchors) {
      const a = model.anchors[k];
      const p = a.p || a;
      const q = M3.v(V, p);
      A[k] = [ox + q[0], oy - q[1], q[2]];
    }
    const buf = new PX.Buf(W, H);
    buf.d = final;
    return { buf, depth, part, W, H, ox, oy, anchors: A };
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

  return { build, render, BASE_PAL, gradePalette, MAT, EYES };
})();
