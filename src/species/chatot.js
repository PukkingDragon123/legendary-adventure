/* ------------------------------------------------------------------
   Chatot — the Music Note Pokémon (0.5 m ≈ 88 units from the feet to
   the tip of the note crest). A posable 3D model rendered straight to
   pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = its right side (near side at yaw 0);
   ground contact (the feet) at y = 0.

   Build: round charcoal head with the eighth-note crest (stem + flag),
   pink hooked parrot beak, half-lidded pink-ringed eyes (pixel stamps),
   white scalloped ruff, plump body (yellow upper chest, green belly, blue
   back), clipped-ellipsoid blue wings with feather tips, blue tail fan
   with the black metronome pendulum, yellow zygodactyl feet.

   Pose parameters (all optional):
     flap   -1..1   wing beat (+ up, - down); small twitch when folded
     spread  0..1   wings folded along the body -> fully spread
     bill    0..1   beak open (singing); `mouth` is accepted as an alias
     tail   -1..1   metronome swing of the tail pendulum (side to side)
     bob     0..1   head bob to the beat (head dips forward and down)
     eyes   'open' | 'happy' | 'closed' | 'blink'  ('open' = Chatot's usual half-lidded look)
------------------------------------------------------------------- */
const Chatot = (() => {
  const { chain, T, R, F, sph, code } = Creature;

  // material ids
  const BLACK = 1, BEAK = 2, RUFF = 3, YELLOW = 4, GREEN = 5, BLUE = 6, FEET = 7, MOUTH = 8, PINK = 9, EYEW = 10, EYEK = 11;
  const MAT = { BLACK, BEAK, RUFF, YELLOW, GREEN, BLUE, FEET, MOUTH, PINK, EYEW, EYEK };
  const PAL = Creature.palette({
    [BLACK]:  { r: ['#1d2224', '#2a3033', '#3a4144', '#525c60', '#76838a'], od: '#101416', ol: '#1f2527', ln: '#161a1c' },
    [BEAK]:   { r: ['#ac4658', '#cf6275', '#ec8595', '#f9abb5', '#ffd4d9'], od: '#5e1a28', ol: '#94344a', ln: '#8a3044' },
    [RUFF]:   { r: ['#959eae', '#bfc6d3', '#e5e9f0', '#f7f8fb', '#ffffff'], od: '#3e4758', ol: '#6c7688', ln: '#8a93a6' },
    [YELLOW]: { r: ['#b48610', '#d6a61a', '#eec52e', '#f8de6c', '#fff3b6'], od: '#5e4206', ol: '#94700e', ln: '#9a7410' },
    [GREEN]:  { r: ['#12652a', '#1a8538', '#26a348', '#48c064', '#8adf9a'], od: '#093616', ol: '#135c26', ln: '#12562a' },
    [BLUE]:   { r: ['#0b64a2', '#1283c8', '#1fa3e6', '#56c2f5', '#a6e2fc'], od: '#063862', ol: '#0c5a94', ln: '#0c5690' },
    [FEET]:   { r: ['#b48410', '#d8a616', '#f2c82a', '#fbde6c', '#fff3b6'], od: '#5e4206', ol: '#94700e', ln: '#8e6a0e' },
    [MOUTH]:  { r: ['#5a1624', '#762232', '#943246', '#b0485a', '#c86470'], od: '#34080f', ol: '#521420', ln: '#4a121e' },
    // eye stamp colours (graded with the palette at render time)
    [PINK]:   { r: ['#b04860', '#d06480', '#ea8098', '#f6a4b6', '#ffd0da'], od: '#5a1a2a', ol: '#8e3048', ln: '#8e3048' },
    [EYEW]:   { r: ['#d8dce6', '#eef0f6', '#ffffff', '#ffffff', '#ffffff'], od: '#303844', ol: '#303844', ln: '#303844' },
    [EYEK]:   { r: ['#0c0f14', '#11151b', '#161b22', '#1e242c', '#2a323c'], od: '#08090c', ol: '#08090c', ln: '#08090c' },
  });
  const GLOSSY = { [BEAK]: 1, [BLACK]: 1 };

  const DEFAULT = { flap: 0, spread: 0, bill: 0, tail: 0, bob: 0, eyes: 'open', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, scl = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const P2W = (f, p) => add(f.t, M3.v(f.L, p));
  const V2W = (f, d) => M3.v(f.L, d);
  const MIRZ = M3.diag(1, 1, -1);
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  function frameY(d, hint) {
    const Y = nrm(d);
    let X = sub(hint, scl(Y, dot(hint, Y)));
    if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    X = nrm(X);
    return M3.cols(X, Y, cross(X, Y));
  }
  // orthonormal rotation whose first column is u and third column is close to w
  function frameUW(u, w) {
    const U = nrm(u);
    const W = nrm(sub(w, scl(U, dot(w, U))));
    return M3.cols(U, cross(W, U), W);
  }
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function slerpM(A, B, t) {
    const Q = M3.mul(transpose(A), B);
    const ang = Math.acos(clamp((Q[0] + Q[4] + Q[8] - 1) / 2, -1, 1));
    if (ang < 1e-5) return A;
    return M3.mul(A, rotAxis(nrm([Q[7] - Q[5], Q[2] - Q[6], Q[3] - Q[1]]), ang * t));
  }
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function segE(a, b, rx, rz, hint, part, grp, mat, ext = 1) {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]);
    return E(scl(add(a, b), 0.5), M3.mul(frameY(d, hint), M3.diag(rx, (len / 2) * ext, rz)), part, grp, mat);
  }
  const ball = (p, r, part, grp, mat) => E(p, M3.diag(r, r, r), part, grp, mat);
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }
  const C = (m, b = 0) => code(m, b);
  const M_BLACK = () => C(BLACK), M_RUFF = () => C(RUFF), M_BLUE = () => C(BLUE), M_FEET = () => C(FEET);

  /* ---------- proportions ---------- */
  const HEAD_R = [14.8, 14.0, 14.0];
  const HEAD_C = [6, 55.5, 0]; // rest position (body frame)
  const EYE_AZ = 0.98, EYE_V = -0.02;

  // body: plump egg tilted nose-up; yellow upper chest, green belly, blue back
  // (s: body-local unit sphere; the body is tilted nose-up by BODY_TILT, so measure height and
  //  frontness along the untilted axes)
  const BODY_TILT = 0.42, BT_C = Math.cos(BODY_TILT), BT_S = Math.sin(BODY_TILT);
  function bodyMat(s) {
    const h = BT_S * s[0] + BT_C * s[1], f = BT_C * s[0] - BT_S * s[1];
    if (f > 0.02 - 0.25 * s[2] * s[2] + 0.18 * Math.max(0, -h)) return h > 0.04 - 0.22 * f ? C(YELLOW) : C(GREEN);
    return C(BLUE);
  }

  // wing outline (clipped ellipsoid, local unit coords: u = along from the shoulder (-1) to the tip (+1),
  // v = chord (+ = leading edge)); feather tips notch the trailing edge toward the tip
  function wingMat(s) {
    const u = s[1], v = s[0];
    if (v < 0 && u > 0.05) {
      const k = (u - 0.05) / 0.95;
      const edge = -Math.sqrt(Math.max(0, 1 - u * u)) * 0.98;
      const ph = (k * 3.2) % 1;
      const notch = 0.2 * (1 - k * 0.4) * Math.sin(ph * Math.PI);
      if (v < edge + notch) return 0;
      if (v < -0.35 && ph < 0.12 && k > 0.1) return C(BLUE, -1);
    }
    return u > 0.35 && v < 0.1 ? C(BLUE, v < -0.3 ? 0 : 0) : C(BLUE);
  }

  /* ---------- note crest outline (head-local x = forward, y = up; plate normal = z) ---------- */
  const CREST = bakeShape(Shape2D.poly([
    // stem: from inside the back of the head up to the top
    [-4.5, 6], [-7.2, 14], [-9.4, 22], [-10.6, 28.6],
    // flag: from the top of the stem, bulging back and drooping to a point
    [-12.4, 30.6], [-16.8, 29.6], [-21, 26], [-23.2, 20.2], [-23.2, 14.2], [-21.4, 9.2], [-18.6, 5.6],
    [-18.6, 9.4], [-17.8, 13.6], [-15.8, 18], [-13.4, 20.8], [-12.4, 21.6],
    // back down the stem
    [-11.6, 22], [-10.0, 15], [-8.0, 8], [-6.4, 3.5],
  ], code(BLACK), 6));

  /* ---------- eye stamps: p = pink ring, k = lid/pupil, w = white ---------- */
  const EYES_L = {
    open: ['..pppp..', '.pkkkkp.', 'pkkkkkkp', 'pwwwkkwp', 'pwwwkkwp', '.pwwwwp.', '..pppp..'],
    openN: ['.pppp.', 'pkkkkp', 'pkkkkp', 'pwwkkp', 'pwwkkp', '.pppp.'],
    openF: ['.pp.', 'pkkp', 'pkkp', 'pwkp', '.pp.'],
    happy: ['..pppp..', '.p....p.', 'p......p'],
    happyN: ['.pppp.', 'p....p', 'p....p'],
    happyF: ['.pp', 'p..'],
    closed: ['p......p', '.p....p.', '..pppp..'],
    closedN: ['p....p', '.pppp.'],
    closedF: ['p..', '.pp'],
    blink: ['.pppppp.', 'pkkkkkkp', '.pppppp.'],
    blinkN: ['.pppp.', 'pkkkkp', '.pppp.'],
    blinkF: ['.pp.', 'pkkp', '.pp.'],
  };
  const EYES_S = {
    open: ['.pp.', 'pkkp', 'pwkp', '.pp.'],
    openN: ['.pp.', 'pkkp', 'pwkp', '.pp.'],
    openF: ['pp', 'kp', 'pp'],
    happy: ['.pp.', 'p..p'],
    happyN: ['.pp.', 'p..p'],
    happyF: ['pp', 'p.'],
    closed: ['p..p', '.pp.'],
    closedN: ['p..p', '.pp.'],
    closedF: ['p.', '.p'],
    blink: ['pppp'],
    blinkN: ['pppp'],
    blinkF: ['ppp'],
  };
  const mirror = (set) => { const o = {}; for (const k in set) o[k] = set[k].map((r) => r.split('').reverse().join('')); return o; };
  const EYES_LM = mirror(EYES_L), EYES_SM = mirror(EYES_S);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const sp = clamp(+P.spread || 0, 0, 1), fl = clamp(+P.flap || 0, -1, 1);
    const bo = clamp(+((pose && pose.bill !== undefined ? pose.bill : pose && pose.mouth !== undefined ? pose.mouth : 0)) || 0, 0, 1);
    const tl = clamp(+P.tail || 0, -1, 1), bob = clamp(+P.bob || 0, 0, 1);
    const prims = [];

    // --- body (leans forward a little when bobbing / spreading)
    const lean = bob * 0.1 + sp * 0.12;
    const root = chain(T(0, 22, 0), R(M3.rz(-lean)), T(0, -22, 0));
    const bodyF = chain(root, T(-5.5, 24, 0), R(M3.rz(BODY_TILT)));
    prims.push(ellF(bodyF, [21, 15, 14.8], 1, 1, bodyMat));
    // rump under the tail
    prims.push(ellF(chain(root, T(-20, 14, 0), R(M3.rz(0.3))), [10, 6.5, 9.5], 1, 1, M_BLUE));

    // --- head (bobs forward/down)
    const headF = chain(root, T(2, 42, 0), R(M3.rz(-bob * 0.42)), T(HEAD_C[0] - 2, HEAD_C[1] - 42, 0));
    const headPrim = ellF(headF, HEAD_R, 2, 2, M_BLACK);
    prims.push(headPrim);

    // --- beak: hooked pink upper mandible + darker lower mandible (opens for singing)
    const hinge = chain(headF, T(10.5, -3.2, 0));
    const ub = chain(hinge, R(M3.rz(bo * 0.22)));
    prims.push(ellF(chain(ub, T(3.2, 2.4, 0), R(M3.rz(-0.3))), [7.4, 6.2, 5.8], 3, 3, () => C(BEAK)));
    prims.push(ellF(chain(ub, T(8.4, -1.2, 0), R(M3.rz(-0.95))), [4.6, 3.0, 3.6], 3, 3, () => C(BEAK)));
    prims.push(ellF(chain(ub, T(9.6, -3.6, 0), R(M3.rz(-1.5))), [2.6, 1.6, 2.4], 3, 3, () => C(BEAK, -1)));
    const lb = chain(hinge, R(M3.rz(-bo * 0.55)));
    prims.push(ellF(chain(lb, T(3.4, -3.4, 0), R(M3.rz(-0.15))), [5.2, 2.8, 4.4], 4, 3, () => C(BEAK, -1)));
    if (bo > 0.05) prims.push(ellF(chain(hinge, T(3, -1.6, 0), R(M3.rz(-bo * 0.2))), [4.6, 2.4 + bo, 3.8], 5, 5, () => C(MOUTH)));

    // --- note crest: one thick plate shaped like an eighth note's stem + flag (head-local x/y)
    // (twisted a little toward the viewing side, like Mudkip's fin, so the note reads in 3/4 views)
    const crestF = chain(headF, T(-6, 4, 0), R(M3.ry(0.38 * clamp(+P.side || 0, -1, 1))), T(6, -4, 0));
    prims.push({ kind: 'plate', part: 6, grp: 6, c: crestF.t, L: crestF.L, shape: CREST, thick: 2.8 });

    // --- ruff: two rows of white scalloped feathers around the neck
    const neckF = chain(root, T(3.2, 41, 0), R(M3.rz(-0.22)));
    for (let row = 0; row < 2; row++) {
      const n = row ? 12 : 13;
      for (let i = 0; i < n; i++) {
        const a = ((i + (row ? 0.5 : 0)) / n) * Math.PI * 2;
        const dir = V2W(neckF, nrm([Math.cos(a), row ? -0.55 : -0.25, Math.sin(a)]));
        const len = row ? 7.0 : 8.2;
        const base = P2W(neckF, [Math.cos(a) * 6, row ? -2.6 : 0.6, Math.sin(a) * 6]);
        const c = add(base, scl(dir, len * 0.72));
        const up = V2W(neckF, [0, 1, 0]);
        prims.push(E(c, M3.mul(frameY(dir, up), M3.diag(2.6, len, 4.3)), 7, 7, (s) => C(RUFF, s[1] > 0.55 ? 0 : 0)));
      }
    }

    // --- wings: clipped flat ellipsoids, folded along the flanks or spread
    const tips = [];
    for (const side of [1, -1]) {
      const Rf = M3.mul(M3.rx(-fl * 0.12), frameUW([-0.8, -0.5, 0.2], [-0.1, 0.2, 1]));
      const Rs = M3.mul(M3.rx(-fl * 0.95), frameUW([-0.22, 0.28, 1], [0, 1, -0.1]));
      let Rw = slerpM(Rf, Rs, sp);
      let sh = [lerp(0, 1, sp), lerp(35.5, 38, sp), lerp(10.4, 9, sp)];
      if (side < 0) { Rw = M3.mul(MIRZ, M3.mul(Rw, MIRZ)); sh = [sh[0], sh[1], -sh[2]]; }
      const wf = chain(root, F(Rw, sh));
      // local: x = along (u), y = chord (v), z = normal  -> ellipsoid axes (y along, x chord, z thin)
      const L = M3.mul(wf.L, M3.mul(M3.cols([0, 1, 0], [1, 0, 0], [0, 0, 1]), M3.diag(lerp(7.8, 9.4, sp), lerp(15.5, 17, sp), 2.3)));
      const c = P2W(wf, [lerp(14, 15, sp), 0, side * 0.5]);
      prims.push(E(c, L, side > 0 ? 8 : 9, side > 0 ? 8 : 9, wingMat));
      tips.push(P2W(wf, [29, 0, 0]));
    }

    // --- tail: short blue fan + the metronome pendulum (rod, bob weight, spike)
    const tailF = chain(root, T(-27, 16, 0), R(M3.ry(tl * 0.55)), R(M3.rz(0.3)));
    for (const k of [-1, 0, 1]) {
      const d = V2W(tailF, nrm([-1, -0.35, k * 0.42]));
      const c = add(tailF.t, scl(d, 6.5));
      prims.push(E(c, M3.mul(frameY(d, V2W(tailF, [0, 1, 0])), M3.diag(1.8, 7.6, 3.4)), 10, 10, M_BLUE));
    }
    const rodD = V2W(tailF, nrm([-0.8, 0.6, 0]));
    const r0 = add(tailF.t, scl(rodD, 2)), r1 = add(tailF.t, scl(rodD, 27));
    prims.push(segE(r0, r1, 1.25, 1.25, V2W(tailF, [0, 0, 1]), 11, 11, M_BLACK));
    const bobC = add(tailF.t, scl(rodD, 22));
    prims.push(ball(bobC, 4.7, 11, 11, M_BLACK));
    const spikeE = add(tailF.t, scl(rodD, 36));
    prims.push(segE(add(tailF.t, scl(rodD, 25)), spikeE, 1.3, 1.3, V2W(tailF, [0, 0, 1]), 11, 11, M_BLACK));

    // --- legs & zygodactyl feet (two toes forward, two back)
    const feet = [];
    for (const side of [1, -1]) {
      const hip = P2W(root, [0.5, 11, side * 5.5]);
      const ankle = [1.5, 2.8, side * 6];
      prims.push(segE(hip, ankle, 2.2, 2.2, [1, 0, 0], 12, 12, M_FEET));
      for (const [a, len, r] of [[0.28, 6.4, 1.35], [-0.28, 6.0, 1.35], [Math.PI - 0.35, 4.2, 1.2], [Math.PI + 0.3, 3.8, 1.2]]) {
        const d = nrm([Math.cos(a), -0.12, Math.sin(a) * 0.8 + side * 0.12]);
        const tip = add(ankle, scl(d, len));
        prims.push(segE(add(ankle, [0, -0.8, 0]), add(tip, [0, -0.9, 0]), r, r, [0, 1, 0], 12, 12, M_FEET, 1.1));
      }
      feet.push(ankle);
    }

    // --- anchors and eye stamps
    const onHead = (az, v, k = 1) => { const s = sph(az, v); return { p: P2W(headF, [HEAD_R[0] * s[0] * k, HEAD_R[1] * s[1] * k, HEAD_R[2] * s[2] * k]), s }; };
    const eyeN = onHead(EYE_AZ, EYE_V), eyeF = onHead(-EYE_AZ, EYE_V);
    const flip = (P.side ?? 1) < 0;
    const kind = P.eyes === 'happy' || P.eyes === 'closed' || P.eyes === 'blink' ? P.eyes : 'open';
    const stamps = [
      { at: Object.assign({ prim: headPrim }, eyeN), set: null, kind, flip, far: 0.42, near: 0.7 },
      { at: Object.assign({ prim: headPrim }, eyeF), set: null, kind, flip, far: 0.42, near: 0.7 },
    ];
    const anchors = {
      top: P2W(headF, [-12.4, 30.6, 0]),
      head: headF.t,
      mouth: P2W(hinge, [6, -1.5, 0]),
      beak: P2W(ub, [10, -2, 0]),
      eyeN: eyeN.p, eyeF: eyeF.p,
      body: bodyF.t,
      tail: bobC,
      tailTip: spikeE,
      wingTipN: tips[0], wingTipF: tips[1],
      feet: scl(add(feet[0], feet[1]), 0.5),
    };
    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 4: 2, 5: 1, 6: 1, 7: 2, 8: 3, 9: 3, 10: 0, 11: 1, 12: 1 },
      glossy: GLOSSY, baseMat: BLACK, shadowSteps: 12,
    };
  }

  /* ---------- render: eye stamp set by scale (colours from the graded palette) ---------- */
  function render(model, opt) {
    const pal = opt.pal || PAL;
    const big = (opt.scale || 1) >= 0.8;
    const colors = { p: pal[PINK].r[2], k: pal[EYEK].r[1], w: pal[EYEW].r[2] };
    for (const st of model.stamps) {
      st.set = st.flip ? (big ? EYES_LM : EYES_SM) : big ? EYES_L : EYES_S;
      st.colors = colors;
      st._c = null;
    }
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 132, bh: 110, oy: 0.86 } };
})();
