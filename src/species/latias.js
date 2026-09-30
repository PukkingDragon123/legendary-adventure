/* ------------------------------------------------------------------
   Latias — the Eon Pokémon (1.4 m ≈ 245 units tall hovering, scale 1).
   A red-and-white jet-like dragon: a plump streamlined body (red back,
   white throat/chest/belly) that tapers into a tail with two little
   stabiliser fins, a round head with a short snout (red crown, white
   jaw), golden-yellow eyes, two red fin "ears" swept back from the head,
   a blue downward-pointing triangle on the white chest, short white arms
   and big red jet wings from the shoulders.
   Model space: x = forward, y = up, z = near side at yaw 0. In the default
   hovering pose the tail tip is the lowest point (y = 0).

   Build: the body is a chain of overlapping ellipsoids along a spline (so
   the white belly line, the triangle and the colours follow the spine in
   every pose); the head is a cranium + snout pair; wings, ear fins and tail
   fins are thin ellipsoid shells clipped to 2D outlines (curvature shading,
   crisp outline, an edge-on fallback keeps them solid when seen side-on).

   Pose params:
     fly    0..1    0 = hovering upright (neck raised, arms held in front,
                    wings spread, tail hanging), 1 = jet flight (body level,
                    neck stretched forward, arms tucked, wings swept back)
     bank   -1..1   roll about the body axis; +1 dips the near (+z) wing
     glow   0..1    psychic glow: the body brightens, a pale aura outlines it
     eyes   'open' (default) | 'happy' | 'closed' | 'blink'
     mouth  0..1    snout opens (dark mouth, pink tongue)
     side   -1..1   camera side from the game (unused; the model is symmetric)
   Anchors: top, head, mouth, eyeN, eyeF, body, chest, handN, handF,
            wingTipN, wingTipF, tail.
------------------------------------------------------------------- */
const Latias = (() => {
  // material ids (eyes are pixel stamps)
  const MAIN = 1, WHITE = 2, MARK = 3, MOUTH = 4, TONGUE = 5;
  const MAT = { RED: MAIN, WHITE, MARK, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [MAIN]:   { r: ['#8c2c3a', '#b64652', '#d6646a', '#ee8c8c', '#fcc0bc'], od: '#541020', ol: '#9a3242', ln: '#8a2a38' },
    [WHITE]:  { r: ['#98a0c2', '#bac4de', '#dae2f2', '#f0f4fc', '#ffffff'], od: '#464c72', ol: '#8088ac', ln: '#8e96b8' },
    [MARK]:   { r: ['#2654aa', '#3670cc', '#5290e8', '#80b4f8', '#bcdafe'], od: '#122c66', ol: '#2a56a6', ln: '#244a96' },
    [MOUTH]:  { r: ['#4a1020', '#66182c', '#84263c', '#a2384e', '#bc5264'], od: '#2c0612', ol: '#4a1020', ln: '#3c0c1a' },
    [TONGUE]: { r: ['#b8485e', '#d66276', '#ee8290', '#ffa8b0', '#ffd0d2'], od: '#6a1a2e', ol: '#8e2a40', ln: '#8e2a40' },
  });
  const GLOSSY = { [MAIN]: 1, [MARK]: 1 };
  const GLOW_TINT = PX.hex('#ffe4ee');
  const DEFAULT = { fly: 0, bank: 0, glow: 0, eyes: 'open', mouth: 0, side: 1 };
  const SIZE = 1.075; // uniform scale to the Pokédex height (1.4 m ≈ 245 units hovering)

  /* ---------- small math ---------- */
  const { code } = Creature;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add = V3.add, sub = V3.sub, scl = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  // Catmull-Rom through rows of numbers (any width) at parameter t in [0, n-1]
  function crN(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = new Array(p1.length);
    for (let k = 0; k < p1.length; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }
  // ellipsoid spanning a → b (radius r across, `ext` stretches it along the segment)
  function segE(a, b, r, hint, part, grp, mat, ext = 1.15) {
    const d = sub(b, a), l = len3(d) || 1e-3, Y = scl(d, 1 / l);
    let X = sub(hint, scl(Y, dot(hint, Y)));
    if (len3(X) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    X = nrm(X);
    return E(scl(add(a, b), 0.5), M3.cols(scl(X, r), scl(Y, (l / 2) * ext), scl(cross(X, Y), r)), part, grp, mat);
  }
  // orthonormal frame from a main direction u and a hint for v (w = u × v, optionally mirrored)
  function frameUV(u, vHint, mirror = false) {
    u = nrm(u);
    let v = sub(vHint, scl(u, dot(vHint, u)));
    v = nrm(len3(v) < 1e-4 ? [0, 1, 0] : v);
    const w = cross(u, v);
    return M3.cols(u, v, mirror ? scl(w, -1) : w);
  }

  /* ---------- clipped thin shells (wings, fins) ----------
     test(s0,s1,s2) = material of the nearest surface point or 0. When that point is clipped away
     and the shell is seen near edge-on, march the view ray's chord through the ellipsoid (view
     direction from the renderer's prim.Li) so the fin keeps its silhouette. */
  const clipped = (prim, test, edge, thin, R) => {
    let li = null, cw = 1, dx = 0, dy = 0, dz = 0, dt = 0;
    prim.mat = (s) => {
      const m = test(s[0], s[1], s[2]);
      if (m) return m;
      const Li = prim.Li;
      if (Li !== li) {
        li = Li;
        const t3 = thin * 3;
        cw = Math.abs(Li[t3 + 2]) / Math.hypot(Li[t3], Li[t3 + 1], Li[t3 + 2]);
        const il = 1 / Math.hypot(Li[2], Li[5], Li[8]);
        dx = Li[2] * il; dy = Li[5] * il; dz = Li[8] * il;
        dt = thin === 0 ? dx : thin === 1 ? dy : dz;
      }
      if (cw > 0.5) return 0;
      const k = 2 * (s[0] * dx + s[1] * dy + s[2] * dz);
      const n = Math.min(8, Math.floor((k * Math.sqrt(Math.max(0, 1 - dt * dt)) * R) / 2.5));
      for (let j = 1; j <= n; j++) {
        const t = (k * j) / (n + 1);
        const e = edge(s[0] - t * dx, s[1] - t * dy, s[2] - t * dz);
        if (e) return e;
      }
      return 0;
    };
    return prim;
  };
  // 2D outline (u along the fin, v across) → baked test + an enclosing ellipse centred at u = cu
  function outline(ctrl, cu, rw) {
    const P = Shape2D.catmull(ctrl, true, 8);
    const bb = Shape2D.bbox(P, 0);
    const cv = (bb[1] + bb[3]) / 2;
    const au = Math.max(cu - bb[0], bb[2] - cu), av = (bb[3] - bb[1]) / 2;
    let k = 0;
    for (const [u, v] of P) k = Math.max(k, Math.hypot((u - cu) / au, (v - cv) / av));
    const g = bakeShape(Shape2D.poly(ctrl, 1, 8));
    return { test: g.test, cu, cv, ru: au * k * 1.04, rv: av * k * 1.04, rw };
  }
  // shell in frame (origin o, axes L = [u v w] columns); bevel: lighter leading edge (+v), darker trailing edge
  function shell(o, L, G, part, grp, m, bevel = 3) {
    const cTop = code(m, 0), cHi = code(m, 1), cLo = code(m, -1);
    const prim = E(add(o, M3.v(L, [G.cu, G.cv, 0])), M3.mul(L, M3.diag(G.ru, G.rv, G.rw)), part, grp, null);
    return clipped(prim, (a, b, c) => {
      const u = G.cu + G.ru * a, v = G.cv + G.rv * b;
      if (!G.test(u, v)) return 0;
      if (!G.test(u, v + bevel)) return cHi;
      if (!G.test(u, v - bevel) || c < -0.35) return cLo;
      return cTop;
    }, (a, b) => (G.test(G.cu + G.ru * a, G.cv + G.rv * b) ? cLo : 0), 2, Math.max(G.ru, G.rv));
  }

  /* ---------- geometry (model units before SIZE) ---------- */
  // spine from the tail tip to the top of the neck: hover (h) and jet (j) positions in the x-y plane,
  // half thickness rn (back ↔ belly), half width rw, white-belly threshold wk (white where s·dorsal < wk)
  const SPINE = [
    { h: [-104, 9], j: [-146, 104], rn: 4.5, rw: 5, wk: -2 },
    { h: [-79, 18], j: [-114, 104], rn: 9, rw: 10, wk: -2 },
    { h: [-52, 37], j: [-80, 105], rn: 15, rw: 16, wk: -2 },
    { h: [-28, 64], j: [-46, 106], rn: 21.5, rw: 22.5, wk: -2 },
    { h: [-9, 96], j: [-12, 107], rn: 26, rw: 26, wk: -0.55 },
    { h: [4, 126], j: [22, 108], rn: 27, rw: 26.5, wk: 0.3 },
    { h: [12, 150], j: [48, 110], rn: 19.5, rw: 19.5, wk: 2 },
    { h: [20, 170], j: [70, 113], rn: 12, rw: 12, wk: 2 },
    { h: [30, 188], j: [90, 117], rn: 11, rw: 11, wk: 2 },
  ];
  const TRI = { t0: 3.55, t1: 4.55, w: 12 };          // belly triangle (spline param range, top half-width)
  const PATCH = { t: 3.3, dt: 0.95, z: 0.62, dz: 0.42, y: -0.25, dy: 0.55 };
  const HEAD = { h: [48, 203, 0], j: [112, 125, 0], ph: -0.06, pj: 0.06 };
  const CRAN_R = [25, 21, 20.5], SNOUT_C = [14.5, -6, 0], SNOUT_R = [17, 13, 14.5], SNOUT_TILT = -0.08;
  const jawLine = (x) => (x > 8 ? -3 - (x - 8) * 0.1 : -3 - (8 - x) * 0.26);
  const EYE_S = nrm([0.62, 0.2, 0.76]);                // eye position on the cranium (unit sphere, near side)

  // wing (u = span out from the root, v = chord: + toward the leading edge)
  const WING = outline([[-8, 20], [20, 15], [52, 9], [84, 4], [112, 1], [124, -3], [114, -8], [110, -13], [104, -9], [84, -11], [54, -16], [26, -25], [6, -32], [-8, -24]], 16, 6);
  const EAR = outline([[-6, 10], [12, 10.5], [28, 7], [44, 0.5], [31, -4], [14, -7.5], [-6, -7.5]], 6, 3.2);
  const TFIN = outline([[-5, 12], [10, 10], [22, 3], [32, -7], [22, -9], [9, -7], [-5, -8]], 2, 2.6);

  /* ---------- eye stamps: k outline, y iris, o iris shade, p pupil, w glint ---------- */
  const EYES_S = {
    open: ['.kk.', 'kwyk', 'kyok', '.kk.'], openN: ['.k.', 'kwk', 'kok', '.k.'], openF: ['k.', 'yk', 'k.'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['kkkk', '.kk.'], blinkN: ['kkk', '.k.'], blinkF: ['kk'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwyyk', 'kyppk', 'kyopk', '.kkk.'], openN: ['.kk.', 'kwyk', 'kypk', 'kopk', '.kk.'], openF: ['.k.', 'kwk', 'kpk', 'kok', '.k.'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k.', 'k.k'],
    closed: ['k...k', '.kkk.'], closedN: ['k..k', '.kk.'], closedF: ['k.', '.k'],
    blink: ['.....', 'kkkkk', '.kkk.'], blinkN: ['....', 'kkkk', '.kk.'], blinkF: ['kkk'],
  };
  const EYES_XL = {
    open: ['.kkkk.', 'kwwyyk', 'kwyppk', 'kyyppk', 'koyyok', '.kkkk.'], openN: ['.kkk.', 'kwyyk', 'kyppk', 'kyppk', 'koyok', '.kkk.'], openF: ['.kk.', 'kwpk', 'kypk', 'kook', '.kk.'],
    happy: ['.kkkk.', 'k....k', 'k....k'], happyN: ['.kkk.', 'k...k', 'k...k'], happyF: ['.kk.', 'k..k'],
    closed: ['k....k', '.kkkk.'], closedN: ['k...k', '.kkk.'], closedF: ['k..k', '.kk.'],
    blink: ['......', 'kkkkkk', '.kkkk.'], blinkN: ['.....', 'kkkkk', '.kkk.'], blinkF: ['kkkk'],
  };
  const EYEC = { k: '#3a0c1a', y: '#ffd23c', o: '#e0961c', p: '#2a0c14', w: '#ffffff' };

  const C_MAIN = code(MAIN), C_WHITE = code(WHITE), C_MARK = code(MARK), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const fly = clamp(+P.fly || 0, 0, 1), bank = clamp(+P.bank || 0, -1, 1), mouth = clamp(+P.mouth || 0, 0, 1);
    const k = fly * fly * (3 - 2 * fly);
    const prims = [], stamps = [], anchors = {};

    /* --- spine --- */
    const CP = SPINE.map((c) => [lerp(c.h[0], c.j[0], k), lerp(c.h[1], c.j[1], k), c.rn, c.rw, c.wk]);
    const NT = CP.length - 1;
    const at = (t) => {
      t = clamp(t, 0, NT);
      const q = crN(CP, t), q1 = crN(CP, Math.min(NT, t + 0.02)), q0 = crN(CP, Math.max(0, t - 0.02));
      const tg = nrm([q1[0] - q0[0], q1[1] - q0[1], 0]);
      return { p: [q[0], q[1], 0], t: tg, n: [-tg[1], tg[0], 0], rn: q[2], rw: q[3], wk: q[4] };
    };
    // body material: white belly below the dorsal threshold, blue triangle on the chest
    const bodyMat = (tm, rlT, rw, wk) => (s) => {
      const t = tm + s[0] * rlT;
      if (s[1] < -0.2 && t > TRI.t0 && t < TRI.t1) {
        const hw = (TRI.w * (t - TRI.t0)) / (TRI.t1 - TRI.t0), z = Math.abs(s[2] * rw);
        if (z < hw) return (z < hw - 2.6 && t < TRI.t1 - 0.22 && t > TRI.t0 + 0.28 ? C_MAIN : C_MARK);
      }
      // white jet-intake patches low on the flanks
      const pt = (t - PATCH.t) / PATCH.dt, pz = (Math.abs(s[2]) - PATCH.z) / PATCH.dz, py = (s[1] - PATCH.y) / PATCH.dy;
      if (pt * pt + pz * pz + py * py < 1) return C_WHITE;
      return s[1] < wk ? C_WHITE : C_MAIN;
    };
    const NS = 56;
    for (let i = 0; i < NS; i++) {
      const t0 = (i / NS) * NT, t1 = ((i + 1) / NS) * NT, tm = (t0 + t1) / 2;
      const A = crN(CP, t0), B = crN(CP, t1), M = at(tm);
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const rl = Math.max(len * 0.8, 1.22 * Math.min(M.rn, M.rw));
      prims.push(E(M.p, M3.cols(scl(M.t, rl), scl(M.n, M.rn), [0, 0, M.rw]), 1, 1, bodyMat(tm, (rl * (t1 - t0)) / len, M.rw, M.wk)));
    }
    anchors.body = at(4).p;
    anchors.chest = add(at(5.1).p, scl(at(5.1).n, -at(5.1).rn));

    /* --- head: cranium + snout (red crown, white jaw), mouth wedge at the snout tip --- */
    const hc = lerpV(HEAD.h, HEAD.j, k), HL = M3.rz(lerp(HEAD.ph, HEAD.pj, k));
    const headMat = (c, Lloc, snout) => (s) => {
      const p = add(c, M3.v(Lloc, s));
      const yb = jawLine(p[0]);
      if (snout && mouth > 0.04 && p[0] > 15) {
        const open = mouth * 0.34 * (p[0] - 15);
        if (p[1] < yb + 0.9 && p[1] > yb - open) return p[1] < yb - open * 0.5 && Math.abs(p[2]) < 8.5 ? C_TONGUE : C_MOUTH;
      }
      // white head; a red band across the face through the eyes and back over the crown
      if (!snout || p[0] < 26) { if (p[1] > yb + 3.5 && p[1] < yb + 16 - 0.1 * p[0]) return C_MAIN; }
      return C_WHITE;
    };
    const crL = M3.diag(...CRAN_R);
    const cran = E(add(hc, M3.v(HL, [0, 0, 0])), M3.mul(HL, crL), 20, 2, headMat([0, 0, 0], crL, false));
    const snL = M3.mul(M3.rz(SNOUT_TILT), M3.diag(...SNOUT_R));
    const snout = E(add(hc, M3.v(HL, SNOUT_C)), M3.mul(HL, snL), 21, 2, headMat(SNOUT_C, snL, true));
    prims.push(cran, snout);
    const HP = (p) => add(hc, M3.v(HL, p)), HD = (d) => M3.v(HL, d);
    anchors.head = hc;
    anchors.top = HP([-4, CRAN_R[1] + 1, 0]);
    anchors.mouth = HP([SNOUT_C[0] + SNOUT_R[0] * 0.92, jawLine(34), 0]);

    // ear fins: swept back from the back of the head, tilted outward
    for (const sd of [1, -1]) {
      const root = HP([-12, 8.5, sd * 9]);
      const dir = HD(nrm([-1, -0.08 + 0.1 * k, sd * 0.42]));
      const L = frameUV(dir, HD([0, 1, sd * 0.7]), sd < 0);
      prims.push(shell(root, L, EAR, sd > 0 ? 22 : 23, sd > 0 ? 3 : 4, WHITE, 1.6));
    }

    /* --- eyes --- */
    const kind = ['open', 'happy', 'closed', 'blink'].includes(P.eyes) ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = [EYE_S[0], EYE_S[1], EYE_S[2] * sd];
      const at0 = { prim: cran, p: add(cran.c, M3.v(cran.L, s)), s };
      stamps.push({ at: at0, set: EYES_S, colors: EYEC, kind, near: 0.66, far: 0.36, flipX: sd < 0, minFacing: 0.1 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at0.p;
    }

    /* --- wings: jet wings from the shoulders --- */
    const WR = at(5.35);
    const sweep = lerp(0.12, 0.5, k), dihedral = lerp(0.38, 0.14, k);
    for (const sd of [1, -1]) {
      const root = add(add(WR.p, scl(WR.n, WR.rn * 0.42)), [0, 0, sd * WR.rw * 0.45]);
      // base axes: span out along ±z, chord toward the head (spine tangent), normal = dorsal
      const u0 = [0, 0, sd], v0 = WR.t, w0 = WR.n;
      // sweep (tips back toward the tail) then dihedral (tips toward the back)
      const cs = Math.cos(sweep), sn = Math.sin(sweep);
      let u = add(scl(u0, cs), scl(v0, -sn));
      const v = add(scl(u0, sn), scl(v0, cs));
      const cd = Math.cos(dihedral), sdh = Math.sin(dihedral);
      u = add(scl(u, cd), scl(w0, sdh));
      const L = frameUV(u, v, sd < 0);
      prims.push(shell(root, L, WING, sd > 0 ? 30 : 31, sd > 0 ? 5 : 6, MAIN, 3.2));
      anchors[sd > 0 ? 'wingTipN' : 'wingTipF'] = add(root, M3.v(L, [105, -14, 0]));
    }

    /* --- arms: short white arms (held in front when hovering, tucked back in flight) --- */
    const SH = at(5.05);
    for (const sd of [1, -1]) {
      const z = [0, 0, sd];
      const sh = add(add(SH.p, scl(SH.n, -SH.rn * 0.25)), scl(z, SH.rw * 0.78));
      const dir = (a, b, c) => nrm(add(add(scl(SH.t, a), scl(SH.n, b)), scl(z, c)));
      const up = nrm(lerpV(dir(-0.45, -0.75, 0.38), dir(-0.93, -0.22, 0.12), k));
      const fo = nrm(lerpV(dir(0.28, -0.95, -0.02), dir(-0.97, 0.06, -0.06), k));
      const el = add(sh, scl(up, 19)), ha = add(el, scl(fo, 16));
      const id = sd > 0 ? 7 : 8;
      prims.push(segE(sh, el, 7.6, SH.n, 40 + (sd > 0 ? 0 : 3), id, () => C_MAIN));
      prims.push(segE(el, ha, 6.8, SH.n, 41 + (sd > 0 ? 0 : 3), id, () => C_MAIN));
      prims.push(E(add(ha, scl(fo, 1.5)), M3.diag(7.4, 7, 7), 42 + (sd > 0 ? 0 : 3), id, () => C_MAIN));
      // three small white claws
      for (const c of [-1, 0, 1]) {
        const cd = nrm(add(add(fo, scl(SH.t, 0.5)), scl(z, c * 0.55)));
        const cb = add(ha, scl(fo, 4));
        prims.push(segE(cb, add(cb, scl(cd, 9)), 2.4, SH.n, 42 + (sd > 0 ? 0 : 3), id, () => C_WHITE, 1));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = ha;
    }

    /* --- tail stabiliser fins --- */
    const TT = at(0.45);
    for (const sd of [1, -1]) {
      const root = add(TT.p, scl(TT.n, TT.rn * 0.1));
      const dir = nrm(add(add(scl(TT.t, -0.62), [0, 0, sd * 0.78]), scl(TT.n, 0.2)));
      const L = frameUV(dir, TT.t, sd < 0);
      prims.push(shell(root, L, TFIN, sd > 0 ? 50 : 51, 9, MAIN, 1.8));
    }
    anchors.tail = at(0).p;

    /* --- bank (roll about the body axis through the belly) + Pokédex size --- */
    const piv = at(4).p;
    const Rb = M3.rx(bank * 0.55);
    const X = (p) => scl(add(piv, M3.v(Rb, sub(p, piv))), SIZE);
    const XL = M3.mul(M3.diag(SIZE, SIZE, SIZE), Rb);
    for (const q of prims) { q.c = X(q.c); q.L = M3.mul(XL, q.L); }
    for (const st of stamps) st.at.p = X(st.at.p);
    for (const key in anchors) anchors[key] = X(anchors[key]);
    return {
      prims, stamps, dots: [], anchors, pose: P,
      pri: { 1: 0, 2: 2, 3: 1, 4: 1, 5: 1, 6: 1, 7: 3, 8: 3, 9: 1 },
      glossy: GLOSSY, baseMat: MAIN, shadowSteps: 14, shadowDepth: 30,
    };
  }

  /* ---------- render: eye set by scale, glow lift + aura, tight ray-cast box ---------- */
  function render(model, opt) {
    const sc = opt.scale || 1;
    const set = sc >= 0.7 ? EYES_XL : sc >= 0.36 ? EYES_L : EYES_S;
    for (const st of model.stamps) st.set = set;
    const g = clamp((model.pose && model.pose.glow) || 0, 0, 1);
    let pal = opt.pal || PAL;
    if (g > 0) {
      const lift = (e) => ({ r: e.r.map((c, i) => PX.mix(PX.mix(c, i < 4 ? e.r[i + 1] : c, g * 0.75), GLOW_TINT, g * 0.18)), od: PX.mix(e.od, e.r[1], g * 0.45), ol: PX.mix(e.ol, e.r[2], g * 0.45), ln: PX.mix(e.ln, e.r[1], g * 0.4) });
      const o = {};
      for (const key in pal) o[key] = lift(pal[key]);
      pal = o;
    }
    const { yaw = 1.05, pitch = 0.16, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(sc, sc, sc)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
      x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    let r;
    if (bx1 - bx0 < 4 || by1 - by0 < 4) r = Creature.render(model, Object.assign({}, opt, { pal }));
    else {
      const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
      const t = Creature.render(model, Object.assign({}, opt, { pal, W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
      const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
      for (let y = 0; y < h; y++) {
        const s = y * w, d = (y + by0) * W + bx0;
        buf.d.set(t.buf.d.subarray(s, s + w), d);
        depth.set(t.depth.subarray(s, s + w), d);
        part.set(t.part.subarray(s, s + w), d);
      }
      const anchors = {};
      for (const key in t.anchors) { const a = t.anchors[key]; anchors[key] = [a[0] + bx0, a[1] + by0, a[2]]; }
      r = { buf, depth, part, W, H, ox, oy, anchors };
    }
    // psychic aura: a pale 1-px halo around the silhouette
    if (g > 0.3) {
      const d = r.buf.d, halo = PX.mix(pal[MAIN].r[4], GLOW_TINT, 0.6), add1 = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (d[i]) continue;
          if ((x > 0 && d[i - 1]) || (x < W - 1 && d[i + 1]) || (y > 0 && d[i - W]) || (y < H - 1 && d[i + W])) add1.push(i);
        }
      for (const i of add1) d[i] = halo;
    }
    return r;
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.4, bw: 330, bh: 300, oy: 0.9 } };
})();
