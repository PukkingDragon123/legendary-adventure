/* ------------------------------------------------------------------
   Wobbuffet — the Patient Pokémon (1.3 m ≈ 227 units at scale 1, base
   to the top of the head). Wynaut's evolution, in the same visual
   language as src/species/wynaut.js. A posable 3D model rendered straight
   to pixel art by the shared Creature pipeline (see src/creature.js,
   dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a big light-blue punching-bag blob: a round
   head that merges into a wider, heavy lower body with a flat base, tiny
   feet barely peeking out. Narrow squinting black eye slits high on the
   face and a wide pink-lipped mouth. Two long, flat paddle arms pressed to
   its sides (one raised to its forehead in its famous salute). A thin
   black tail ends in a round black head with two big white eyes.

   Pose parameters (all optional):
     eyes    'open' (squinting slits, as in the art; default) | 'happy' |
             'blink' | 'closed'
     mouth   0..1     0 = closed pink lips … 1 = wide-open mouth ("Wobba!")
     walk    radians  waddle phase: the tiny feet step, the body bobs and
                      rocks, the tail wags; exactly 0 = standing still
     sway    −1..1    side-to-side sway: the body leans about its base
                      (+ = toward its near side / +z); arms and tail lag
     salute  0..1     the near (right) arm rises to its forehead in a salute
     squish  0..1     squash: the body flattens and bulges (counter-attack
                      bounce); the base stays on the ground
     side    −1..1    ≈ cos(yaw), passed by the game: the tail sweeps toward the
                      camera side so its eyed head always shows

   Anchors: top (head top), head (face centre), mouth, eyeN, eyeF, body
   (lower body centre), armN / armF (paddle tips), tail (centre of the
   tail head), tailEyes, footN / footF.
------------------------------------------------------------------- */
const Wobbuffet = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BLUE = 1, BLACK = 2, WHITE = 3, INK = 4, LIP = 5, MOUTH = 6, TONGUE = 7;
  const MAT = { BLUE, BLACK, WHITE, INK, LIP, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [BLUE]:   { r: ['#2f6cb8', '#4a8cd6', '#68ace8', '#92c8f4', '#c8e6ff'], od: '#173c7a', ol: '#2e64aa', ln: '#2e62a6' },
    [BLACK]:  { r: ['#15161c', '#1f2029', '#2c2e3a', '#3e4150', '#5c6070'], od: '#08080c', ol: '#15161c', ln: '#101118' },
    [WHITE]:  { r: ['#c6ccd8', '#e4e8f0', '#fbfcfe', '#ffffff', '#ffffff'], od: '#4a5060', ol: '#7a8090', ln: '#7a8090' },
    [INK]:    { r: ['#0e1420', '#121a28', '#182232', '#202c40', '#2a384e'], od: '#060a12', ol: '#0e1420', ln: '#0e1420' },
    [LIP]:    { r: ['#b8466a', '#d6628a', '#ee86a6', '#f8a8c0', '#ffd0de'], od: '#681634', ol: '#9a2e52', ln: '#9a2e52' },
    [MOUTH]:  { r: ['#4a0e1e', '#62162a', '#7c2236', '#963044', '#ae4254'], od: '#2c060e', ol: '#4a0e1e', ln: '#4a0e1e' },
    [TONGUE]: { r: ['#c24c68', '#dc6882', '#f08aa0', '#ffaec0', '#ffd4de'], od: '#6a1430', ol: '#94203e', ln: '#94203e' },
  });
  const GLOSSY = {};
  const C_BLUE = code(BLUE), C_BLUE_D = code(BLUE, -1), C_BLACK = code(BLACK), C_WHITE = code(WHITE), C_INK = code(INK);
  const C_LIP = code(LIP), C_LIP_D = code(LIP, -1), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_PUPIL = code(BLACK, -1);
  const M_BLUE = () => C_BLUE, M_BLACK = () => C_BLACK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], over = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * over, rz], part, grp, mat);
  }
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }

  let curScale = 1;

  /* ---------- head decals (head frame, unit sphere s) ---------- */
  const HR = [52, 57, 58];
  const EYE_AZ = 0.36, EYE_V = 0.38, EYE_HW = 0.19;
  const MO_V = 0.0, MO_HW = 0.5, MO_H = 0.2;
  function eyePix(u, v, kind, px) {
    const k = u / EYE_HW;
    if (Math.abs(k) > 1.05) return 0;
    const lw = Math.max(0.028, 0.6 * px);
    if (kind === 'open') {
      // squinting slit: a thick black lens, slightly arched
      const yc = 0.02 * (1 - k * k);
      const h = Math.max(lw * 1.2, 0.055) * Math.sqrt(Math.max(0, 1 - k * k)) + lw * 0.3;
      return Math.abs(k) < 1 && Math.abs(v - yc) < h ? C_INK : 0;
    }
    let yc;
    if (kind === 'happy') yc = -0.04 + 0.09 * (1 - k * k);
    else if (kind === 'closed') yc = 0.04 - 0.08 * (1 - k * k);
    else yc = 0;
    return Math.abs(k) < 1 && Math.abs(v - yc) < lw ? C_INK : 0;
  }
  function headMat(kind, mo) {
    return (s) => {
      if (s[0] < 0.2) return C_BLUE;
      const px = 1 / (curScale * HR[1]);
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      const e = eyePix((az - sd * EYE_AZ) * cv, s[1] - EYE_V, kind, px);
      if (e) return e;
      // wide pink-lipped mouth
      const u = az * cv;
      const k = u / MO_HW;
      if (Math.abs(k) < 1.1) {
        const lipW = Math.max(0.05, 1.5 * px);
        const oh = MO_H * (0.55 + 0.45 * mo);                  // outer lip half-height
        const b = (s[1] - (MO_V - 0.5 * oh * mo)) / (oh + 0.5 * oh * mo);
        const r2 = k * k + b * b;
        if (r2 < 1) {
          // inner opening
          const ih = Math.max(0, (oh - lipW) * mo * 1.2);
          const iw = MO_HW - lipW * 1.3;
          const ik = u / iw, ib = ih > 0 ? (s[1] - (MO_V - 0.5 * oh * mo)) / ih : 9;
          if (mo > 0.05 && ik * ik + ib * ib < 1) return ib < -0.35 && Math.abs(ik) < 0.65 ? C_TONGUE : C_MOUTH;
          // closed: the parting line between the lips
          if (mo <= 0.05 && Math.abs(s[1] - MO_V) < Math.max(0.018, 0.5 * px) && Math.abs(k) < 0.92) return C_LIP_D;
          return C_LIP;
        }
      }
      return C_BLUE;
    };
  }
  // tail head: black, with two big white eyes and black pupils (both faces)
  const TH_R = [21, 20, 17];
  function tailHeadMat(s) {
    if (s[0] < 0.05) return C_BLACK;
    const az = Math.atan2(s[2], s[0]), cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
    const sd = az >= 0 ? 1 : -1;
    const u = (az - sd * 0.5) * cv, v = s[1] - 0.12;
    const px = 1 / (curScale * TH_R[1]);
    const er = Math.max(0.26, 2.2 * px);
    const r2 = (u * u + v * v) / (er * er);
    if (r2 < 1) {
      const pr = Math.max(0.42, 1.1 * px / er);
      const pu = (u + 0.07 * sd) / er, pv = (v + 0.02) / er;
      return pu * pu + pv * pv < pr * pr ? C_PUPIL : C_WHITE;
    }
    return C_BLACK;
  }

  const DEFAULT = { eyes: 'open', mouth: 0, walk: 0, sway: 0, salute: 0, squish: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 24; i++) PRI[i] = 0;
  // 1 body (head + lower body, one group), 2/3 arms, 4/5 feet, 6 tail, 7 tail head
  Object.assign(PRI, { 1: 1, 2: 3, 3: 3, 4: 0, 5: 0, 6: -2, 7: -1 });
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const sw = clamp(+P.sway || 0, -1, 1), sal = clamp(+P.salute || 0, 0, 1), sq = clamp(+P.squish || 0, 0, 1);
    const mo = clamp(+P.mouth || 0, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 3 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.06 * Math.sin(wk) : 0;
    const lean = 0.22 * sw + rock;
    // squash & stretch about the base (volume roughly kept)
    const root = chain({ L: M3.diag(1 + 0.22 * sq, 1 - 0.3 * sq, 1 + 0.22 * sq), t: [0, bob, 0] }, R(M3.rx(lean)));

    // --- the blob: heavy lower body + round head, merged in one contour group
    const bodyF = chain(root, T(0, 84, 0));
    prims.push(ellF(bodyF, [60, 86, 66], 1, 1, (s) => (s[1] < -0.93 ? C_BLUE_D : C_BLUE)));
    // neck filler so head and body read as one smooth blob
    prims.push(ellF(chain(root, T(2, 138, 0)), [55, 44, 61], 1, 1, M_BLUE));
    const hf = chain(root, T(4, 170, 0), R(M3.rx(-0.3 * lean)), R(M3.rz(walking ? 0.02 * Math.sin(2 * wk) : 0)));
    const headPrim = ellF(hf, HR, 1, 1, headMat(kind, mo));
    prims.push(headPrim);
    anchors.head = hf.t;
    anchors.body = bodyF.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(hf, [(HR[0] + out) * q[0], (HR[1] + out) * q[1], (HR[2] + out) * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, MO_V - 0.1 * mo);
    anchors.top = inF(hf, [0, HR[1], 0]);

    // --- long flat paddle arms against the sides; the near arm salutes
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const flop = walking ? 0.1 * Math.sin(wk + (sd > 0 ? 0 : Math.PI)) : 0;
      const sa = sd > 0 ? sal : 0;
      const sh = inF(root, [2, 136, 56 * sd]);
      // hanging: down along the side, a little out; salute: up and forward to the forehead
      let ang = 0.3 - 0.35 * sw * sd + flop;                         // spread from straight down
      const hang = dirF(root, [0.08, -Math.cos(ang), sd * Math.sin(ang)]);
      const up = dirF(hf, [0.42, 0.86, -0.28 * sd]);
      const d = nrm(add(sc(hang, 1 - sa), sc(up, sa)));
      // broad face turned outward (hanging) / forward-in (salute)
      const face = nrm(add(sc(dirF(root, [0, 0, sd]), 1 - sa), sc(dirF(hf, [0.6, 0, 0.8 * sd]), sa)));
      const [Z0, Y0, X0] = frameAlong(d, face);
      const L = 68;
      const sh2 = add(sh, sc(dirF(root, [0.3, 0.1, sd]), 14 * sa));
      prims.push(ellAx(add(sh2, sc(Y0, L * 0.5)), X0, Y0, Z0, [20, L * 0.55, 9], id, id, M_BLUE));
      anchors[sd > 0 ? 'armN' : 'armF'] = add(sh2, sc(Y0, L * 1.05));
    }

    // --- tiny feet peeking out under the front
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 6 * Math.sin(ph) : 0, lift = walking ? 4 * Math.max(0, Math.cos(ph)) : 0;
      const f = [38 + fwd, 7 + lift - bob, 26 * sd];
      prims.push(E(f, M3.diag(16, 7.5, 12), id, id, (s) => (s[1] < -0.5 ? C_BLUE_D : C_BLUE)));
      anchors[sd > 0 ? 'footN' : 'footF'] = [f[0], 0, f[2]];
    }

    // --- thin black tail curving out behind and up toward the camera side; eyed head at the end
    const wag = (walking ? 0.3 * Math.sin(wk) : 0) - 0.6 * sw;
    const sgn = side >= 0 ? 1 : -1, zs = 0.35 + 0.65 * Math.abs(side);
    const tz = (k) => sgn * zs * k + wag * k * 0.7;
    const pts = [
      inF(root, [-50, 22, 0]),
      inF(root, [-72, 14, tz(10)]),
      inF(root, [-92, 18, tz(22)]),
      inF(root, [-104, 34, tz(34)]),
      inF(root, [-106, 52, tz(40)]),
    ];
    const NS = 10;
    for (let i = 0; i < NS; i++) {
      const a = crPt(pts, (i / NS) * (pts.length - 1)), b = crPt(pts, ((i + 1) / NS) * (pts.length - 1));
      const r = lerp(6, 4.2, i / (NS - 1));
      prims.push(seg(a, b, r, r, 6, 6, M_BLACK, [0, 1, 0], 1.6));
    }
    const tipD = nrm(sub(pts[4], crPt(pts, 3.6)));
    const tc = add(pts[4], sc(tipD, 17));
    // the tail head faces the camera side
    const th = 0.9 * side;
    const fwdT = dirF(root, [Math.cos(th) * 0.6, 0, Math.sin(th)]);
    const [Xt, Yt, Zt] = frameAlong(tipD, fwdT);
    prims.push(ellAx(tc, Xt, Yt, Zt, TH_R, 7, 7, tailHeadMat));
    anchors.tail = tc;
    anchors.tailEyes = add(tc, add(sc(Xt, TH_R[0]), sc(Yt, 2)));

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BLUE, shadowSteps: 12 };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
      x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s = y * w, d = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.3, bw: 320, bh: 270, oy: 0.92 } };
})();
