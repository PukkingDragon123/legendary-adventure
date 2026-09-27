/* ------------------------------------------------------------------
   Altaria — the Humming Pokémon (1.1 m ≈ 192 units from the tail tips to
   the top of the head plumes). A posable 3D model rendered straight to
   pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = its right side (near side at yaw 0);
   the lowest tail/toe tips sit at y = 0 (it floats on its cloud).

   Build: a big cotton cloud (a body mass plus two cloud wings wrapped
   around the front, built from overlapping puffs in alternating contour
   groups so the puffs read), a long sky-blue neck rising out of the gap,
   a round blue head with the white fluffy beak tufts and small black eyes
   (pixel stamps), two long ribbon head plumes, blue three-toed feet
   poking out under the cloud and a comb of long blue tail feathers.

   Pose parameters (all optional):
     flap   -1..1   cloud wings: + lift/open up and out, - press down
     neck   -1..1   - curls the neck into an S (head tucked), + stretches it up (singing)
     bill    0..1   beak open (singing); `mouth` is accepted as an alias
     eyes   'open' | 'happy' | 'closed' | 'blink'
------------------------------------------------------------------- */
const Altaria = (() => {
  const { chain, T, R, F, sph, code } = Creature;

  const BLUE = 1, CLOUD = 2, TUFT = 3, MOUTH = 4, EYEK = 5, EYEW = 6;
  const MAT = { BLUE, CLOUD, TUFT, MOUTH, EYEK, EYEW };
  const PAL = Creature.palette({
    [BLUE]:  { r: ['#1f78b8', '#2e98d8', '#4ab8f0', '#7ed2f8', '#c0ecfd'], od: '#0e3e6e', ol: '#1f6aa8', ln: '#1c64a2' },
    [CLOUD]: { r: ['#b2c6dc', '#d3e0ee', '#eef3f9', '#f9fbfd', '#ffffff'], od: '#5a7696', ol: '#88a0be', ln: '#a4b9d2' },
    [TUFT]:  { r: ['#a2b2c8', '#c8d4e4', '#ecf1f8', '#fafcfe', '#ffffff'], od: '#44546e', ol: '#74849e', ln: '#8292ac' },
    [MOUTH]: { r: ['#56283a', '#703444', '#8a4656', '#a45c6a', '#bc7884'], od: '#321420', ol: '#4c1e2c', ln: '#461c28' },
    [EYEK]:  { r: ['#0c1018', '#10151e', '#141a24', '#1c232e', '#28303c'], od: '#06080c', ol: '#06080c', ln: '#06080c' },
    [EYEW]:  { r: ['#dde4ee', '#f0f4f8', '#ffffff', '#ffffff', '#ffffff'], od: '#303844', ol: '#303844', ln: '#303844' },
  });
  const GLOSSY = { [BLUE]: 1 };

  const DEFAULT = { flap: 0, neck: 0, bill: 0, eyes: 'open', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
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
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }
  const C = (m, b = 0) => code(m, b);
  const M_BLUE = () => C(BLUE), M_CLOUD = () => C(CLOUD), M_CLOUDW = () => C(CLOUD, 1), M_TUFT = () => C(TUFT);

  /* ---------- cloud puffs: [x, y, z, r] ---------- */
  // body mass (behind the neck): a big core plus bumps around its outline
  const BODY_PUFFS = [
    [-14, 70, 0, 38], [-18, 98, -24, 19], [-18, 98, 24, 19], [-6, 102, 0, 16], [-34, 98, 0, 17],
    [-44, 78, -16, 19], [-44, 78, 16, 19], [-46, 54, 0, 18], [-36, 36, -18, 17], [-36, 36, 18, 17],
    [-12, 30, -28, 17], [-12, 30, 28, 17], [-6, 30, 0, 17], [-14, 62, -46, 19], [-14, 62, 46, 19],
    [-20, 86, -42, 18], [-20, 86, 42, 18], [-24, 42, -40, 16], [-24, 42, 40, 16],
  ];
  // one wing (z > 0 side, wing-local around its shoulder pivot): wraps from the flank round to the front
  const WING_PUFFS = [
    [0, 2, 20, 18], [16, -8, 18, 17], [28, -24, 14, 16], [32, -42, 9, 15], [22, -56, 18, 14], [6, -50, 36, 16],
    [-6, -28, 40, 17], [-6, -8, 36, 16], [16, -32, 28, 16], [30, -8, 5, 13], [36, -26, 3, 12], [8, -62, 8, 12],
  ];
  const WING_PIVOT = [0, 94, 20];

  // head plumes (head-local): long ribbons flowing up and back
  const PLUMES = [
    { pts: [[-3, 9, 2.5], [-5, 24, 6], [-13, 33, 9], [-26, 31, 12], [-40, 24, 15], [-56, 22, 19]], w0: 4.4, w1: 3.0, up: [0.25, 0.1, 1] },
    { pts: [[-4, 9, -2.5], [-12, 21, -6], [-26, 24, -12], [-42, 20, -18], [-58, 23, -24], [-76, 19, -30]], w0: 4.4, w1: 2.8, up: [0.1, 0.4, -1] },
  ];

  /* ---------- eye stamps ---------- */
  const EYES_L = {
    open: ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'],
    openN: ['.k.', 'wkk', 'kkk', 'kkk', '.k.'],
    openF: ['k.', 'kk', 'kk', 'k.'],
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

  const HEAD_R = [12.6, 11.6, 11.2];

  // flat ribbon along a spline (chain of thin ellipsoids), broad face toward `up`
  function ribbon(prims, pts, w0, w1, up, part, grp, thin = 1.2, nseg = 16) {
    const NS = 48, S = [], len = [0];
    for (let i = 0; i <= NS; i++) S.push(crPt(pts, (i / NS) * (pts.length - 1)));
    for (let i = 1; i <= NS; i++) len.push(len[i - 1] + Math.hypot(...sub(S[i], S[i - 1])));
    const total = len[NS];
    const at = (u) => {
      const L = clamp(u, 0, 1) * total;
      let i = 1;
      while (i < NS && len[i] < L) i++;
      return lerpV(S[i - 1], S[i], (L - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]));
    };
    const seg = total / nseg;
    for (let i = 0; i < nseg; i++) {
      const u = (i + 0.5) / nseg;
      const Tn = nrm(sub(at(u + 0.02), at(u - 0.02)));
      const Wd = nrm(cross(Tn, up));
      const Nn = cross(Wd, Tn);
      const w = lerp(w0, w1, u) * (u > 0.85 ? 1 - ((u - 0.85) / 0.15) * 0.6 : 1);
      prims.push(E(at(u), M3.mul(M3.cols(Wd, Tn, Nn), M3.diag(w, seg * 1.9, thin)), part, grp, M_BLUE));
    }
    return at(1);
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const fl = clamp(+P.flap || 0, -1, 1), nk = clamp(+P.neck || 0, -1, 1);
    const bo = clamp(+((pose && pose.bill !== undefined ? pose.bill : pose && pose.mouth !== undefined ? pose.mouth : 0)) || 0, 0, 1);
    const prims = [];
    const root = F(M3.I(), [0, 0, 0]);

    // --- cloud body mass
    BODY_PUFFS.forEach((q) => prims.push(E([q[0], q[1], q[2]], M3.diag(q[3], q[3] * 0.94, q[3]), 1, 1, M_CLOUD)));

    // --- cloud wings, wrapped around the front; flap lifts them up and out
    const tips = [];
    for (const side of [1, -1]) {
      const lift = fl >= 0 ? fl * 0.95 : fl * 0.3;
      const open = fl >= 0 ? fl * 0.55 : 0;
      const w = chain(root, T(WING_PIVOT[0], WING_PIVOT[1], side * WING_PIVOT[2]), R(M3.rx(-side * lift)), R(M3.ry(side * open)));
      WING_PUFFS.forEach((q, i) => {
        const c = P2W(w, [q[0], q[1], side * q[2]]);
        prims.push(E(c, M3.diag(q[3], q[3] * 0.94, q[3]), side > 0 ? 4 : 5, side > 0 ? 4 : 5, M_CLOUDW));
      });
      tips.push(P2W(w, [20, -40, side * 36]));
    }

    // --- neck: a long blue S rising out of the gap in the front of the cloud
    const base = [12, 88, 0];
    const rest = [base, [21, 108, 0], [24, 126, 0], [20, 142, 0], [21, 155, 0]];
    const up = [base, [17, 112, 0], [20, 134, 0], [21, 156, 0], [22, 170, 0]];
    const curl = [base, [28, 104, 0], [28, 118, 0], [14, 128, 0], [20, 138, 0]];
    const tgt = nk >= 0 ? up : curl, k = Math.abs(nk);
    const neckPts = rest.map((p, i) => lerpV(p, tgt[i], k));
    const NN = 18;
    for (let i = 0; i < NN; i++) {
      const a = crPt(neckPts, (i / NN) * (neckPts.length - 1)), b = crPt(neckPts, ((i + 1) / NN) * (neckPts.length - 1));
      const r = lerp(7.6, 5.4, i / (NN - 1));
      prims.push(segE(a, b, r, r, [1, 0, 0], 10, 10, M_BLUE, 7));
    }
    const top = neckPts[neckPts.length - 1];
    const nd = nrm(sub(top, crPt(neckPts, neckPts.length - 1.35)));
    // --- head (sits on the neck, tilted by the neck's end direction; lifts its chin when singing)
    const pitch = Math.atan2(nd[0], nd[1]) * 0.5 - bo * 0.12;
    const headF = chain(root, T(top[0] + 1.5, top[1] + 8.5, 0), R(M3.rz(-pitch)));
    const headPrim = ellF(headF, HEAD_R, 11, 11, M_BLUE);
    prims.push(headPrim);
    // beak tufts: two white fluffy "moustache" puffs + a centre puff, lower beak opens under them
    for (const z of [1, -1]) prims.push(ellF(chain(headF, T(9.2, -4.6, z * 5.8), R(M3.ry(-z * 0.35))), [5.6, 4.0, 5.2], 12, 12, M_TUFT));
    prims.push(ellF(chain(headF, T(11.4, -4.0, 0)), [4.6, 3.8, 4.4], 12, 12, M_TUFT));
    const lb = chain(headF, T(6, -6.8, 0), R(M3.rz(-bo * 0.55)));
    prims.push(ellF(chain(lb, T(4.2, -1.2, 0)), [4.6, 2.2, 3.8], 13, 12, () => C(TUFT, -1)));
    if (bo > 0.05) prims.push(ellF(chain(headF, T(9, -7.4, 0), R(M3.rz(-bo * 0.3))), [4.2, 1.4 + bo * 1.6, 3.6], 14, 14, () => C(MOUTH)));

    // --- head plumes
    const plumeTips = PLUMES.map((pl, i) => ribbon(prims, pl.pts.map((q) => P2W(headF, q)), pl.w0, pl.w1, V2W(headF, nrm(pl.up)), 15 + i, 15));

    // --- feet poking out under the cloud: three long thin toes each
    const feet = [];
    for (const side of [1, -1]) {
      const ankle = [22, 13, side * 20];
      prims.push(segE([16, 28, side * 18], ankle, 3, 3, [1, 0, 0], 17, 17, M_BLUE));
      for (const a of [-0.55, 0, 0.55]) {
        const d = nrm([Math.cos(a) * 0.9, -0.55, Math.sin(a) * 0.9 + side * 0.25]);
        prims.push(segE(ankle, add(ankle, scl(d, 13)), 1.9, 1.9, [0, 1, 0], 17, 17, M_BLUE, 1.08));
      }
      feet.push(ankle);
    }

    // --- tail: a comb of long blue feathers hanging down behind
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 6.5;
      const a = [-26, 30, z], b = [-38 - Math.abs(i - 2) * 2.5, 1.5 + Math.abs(i - 2) * 1.5, z * 1.25];
      prims.push(segE(a, b, 2.4, 3.2, [0, 0, 1], 18, 18, M_BLUE, 1.02));
    }

    // --- eyes and anchors
    const onHead = (az, v) => { const s = sph(az, v); return { p: P2W(headF, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s }; };
    const eyeN = onHead(0.62, 0.16), eyeF = onHead(-0.62, 0.16);
    const flip = (P.side ?? 1) < 0;
    const kind = P.eyes === 'happy' || P.eyes === 'closed' || P.eyes === 'blink' ? P.eyes : 'open';
    const stamps = [
      { at: Object.assign({ prim: headPrim }, eyeN), set: null, kind, flip, far: 0.45, near: 0.72 },
      { at: Object.assign({ prim: headPrim }, eyeF), set: null, kind, flip, far: 0.45, near: 0.72 },
    ];
    const anchors = {
      top: P2W(headF, [-10, 33, 10]),
      head: headF.t,
      mouth: P2W(headF, [12, -7, 0]),
      beak: P2W(headF, [14, -4, 0]),
      eyeN: eyeN.p, eyeF: eyeF.p,
      neck: crPt(neckPts, 2),
      body: [-8, 70, 0],
      wingTipN: tips[0], wingTipF: tips[1],
      plumeN: plumeTips[0], plumeF: plumeTips[1],
      feet: scl(add(feet[0], feet[1]), 0.5),
      tail: [-40, 4, 0],
    };
    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2, 11: 2, 12: 3, 14: 2, 15: 2, 17: 2, 18: 0 },
      glossy: GLOSSY, baseMat: CLOUD, shadowSteps: 6,
    };
  }

  /* ---------- render: eye stamps by scale, then ray-cast only the creature's screen box ---------- */
  function render(model, opt) {
    const pal = opt.pal || PAL;
    const big = (opt.scale || 1) >= 0.8;
    const colors = { k: pal[EYEK].r[1], w: pal[EYEW].r[2] };
    for (const st of model.stamps) {
      st.set = st.flip ? (big ? EYES_LM : EYES_SM) : big ? EYES_L : EYES_S;
      st.colors = colors;
      st._c = null;
    }
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 212, bh: 240, oy: 0.93 } };
})();
