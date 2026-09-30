/* ------------------------------------------------------------------
   Vigoroth — the Wild Monkey Pokémon (1.4 m ≈ 245 units at scale 1,
   feet to the tip of the red tuft). Slakoth's evolution, in the same
   visual language as src/species/slakoth.js. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a white, shaggy, ape-like sloth standing upright
   on short thick legs, hunched a little forward. A teardrop-shaped tuft of
   red fur rises from its forehead; stubby ears; big eyes circled by brown
   rings; a small pink nose; a brown lower jaw and a wide mouth with two
   small triangular fangs in each jaw (usually wide open, screaming).
   Shaggy fur on the chest, at the sides of the maw and on a stubby tail;
   two brown stripes across the back. Long arms held up and out, each hand
   ending in two big curved black claws; two black claws on each foot.

   Pose parameters (all optional):
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     mouth   0..1     0 = closed grin … 1 = wide-open scream (default 0.55)
     walk    radians  walk-cycle phase (legs step with sin(walk), the body bobs
                      and rocks, the arms counter-swing); exactly 0 = standing
     arms    radians  wild arm swinging: both arms windmill about the shoulders
                      (near arm by +arms, far arm by −arms); 0 = the official
                      raised "ready to go berserk" pose. Animate arms = t·8.
     side    −1..1    ≈ cos(yaw), accepted (unused)

   Anchors: top (tip of the red tuft), head (head centre), mouth, nose, eyeN,
   eyeF, tuft (tuft centre), body (torso centre), chest, handN / handF (between
   the claws), footN / footF, tail.
------------------------------------------------------------------- */
const Vigoroth = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const FUR = 1, RED = 2, BROWN = 3, CLAW = 4, EYEW = 5, PUPIL = 6, MOUTH = 7, TONGUE = 8, NOSE = 9, INK = 10;
  const MAT = { FUR, RED, BROWN, CLAW, EYEW, PUPIL, MOUTH, TONGUE, NOSE, INK };
  const PAL = Creature.palette({
    [FUR]:    { r: ['#a6a4b0', '#cfcdd4', '#eeeef0', '#f8f8f9', '#ffffff'], od: '#4a4858', ol: '#86849a', ln: '#9896a6' },
    [RED]:    { r: ['#a8404c', '#cc5a64', '#e6757b', '#f49a9c', '#ffc6c4'], od: '#5e1620', ol: '#96323c', ln: '#9a3a44' },
    [BROWN]:  { r: ['#5a4638', '#76604e', '#937c6d', '#ab9686', '#c4b2a4'], od: '#2e2018', ol: '#4e3c30', ln: '#4e3c30' },
    [CLAW]:   { r: ['#26262a', '#3a3a3e', '#56565a', '#747478', '#9a9a9e'], od: '#121214', ol: '#26262a', ln: '#222226' },
    [EYEW]:   { r: ['#c4c4cc', '#e2e2e8', '#fbfbfd', '#ffffff', '#ffffff'], od: '#5a5a66', ol: '#8a8a96', ln: '#8a8a96' },
    [PUPIL]:  { r: ['#08080c', '#0e0e14', '#16161e', '#22222c', '#34343e'], od: '#040406', ol: '#08080c', ln: '#08080c' },
    [MOUTH]:  { r: ['#5e2e44', '#7c4260', '#9d607d', '#b67a96', '#cc96ae'], od: '#34101e', ol: '#5a2438', ln: '#5a2438' },
    [TONGUE]: { r: ['#b8849a', '#cc9cb0', '#dfb2c5', '#ecc8d6', '#f8e0ea'], od: '#6a3048', ol: '#8e4a64', ln: '#8e4a64' },
    [NOSE]:   { r: ['#a84c62', '#c8687e', '#e68ea0', '#f6b2c0', '#ffd8e0'], od: '#5e1a32', ol: '#903e58', ln: '#903e58' },
    [INK]:    { r: ['#241410', '#321c16', '#40261e', '#4e3026', '#5c3a2e'], od: '#140a08', ol: '#241410', ln: '#241410' },
  });
  const GLOSSY = { [NOSE]: 1, [CLAW]: 1 };
  const C_FUR = code(FUR), C_RED = code(RED), C_BROWN = code(BROWN), C_CLAW = code(CLAW), C_EYEW = code(EYEW);
  const C_PUPIL = code(PUPIL), C_GLINT = code(EYEW, 1), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_NOSE = code(NOSE), C_INK = code(INK);
  const C_TOOTH = code(EYEW);
  const M_FUR = () => C_FUR, M_RED = () => C_RED, M_CLAW = () => C_CLAW, M_NOSE = () => C_RED;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    if (len3(Z) < 1e-4) Z = cross(X, [1, 0, 0]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid spanning p0 → p1 along its local x axis
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.12) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }
  // tapered, bending chain of ellipsoids (claws, the tuft); each link turns by `bend` toward −bendDir
  function hookChain(prims, p, d, bendDir, lens, r, bend, part, grp, mat) {
    let dir = nrm(d);
    for (let i = 0; i < lens.length; i++) {
      const q = add(p, sc(dir, lens[i]));
      const B = nrm(sub(bendDir, sc(dir, dot(bendDir, dir))));
      const Rm = M3.cols(dir, B, cross(dir, B));
      const hl = lens[i] * 0.5 + r[i][0] * 0.55;
      prims.push(E(sc(add(p, q), 0.5), M3.mul(Rm, M3.diag(hl, r[i][1], r[i][0])), part, grp, mat));
      p = q;
      dir = nrm(sub(dir, sc(B, Math.tan(bend))));
    }
    return p;
  }
  // pointed fur tuft: two crossed flat plates
  const SPK_L = 10, SPK_W = 3.6;
  const SPK_G = bakeShape({
    bb: [-2, -SPK_W - 0.5, SPK_L + 0.5, SPK_W + 0.5],
    test: (u, v) => {
      if (u < -2 || u > SPK_L) return 0;
      const hw = u < 0 ? SPK_W : SPK_W * Math.pow((SPK_L - u) / SPK_L, 0.9);
      return Math.abs(v) < hw ? C_FUR : 0;
    },
  });
  function tuft(prims, root, dir, len, w, part, grp, out = [0, 0, 1]) {
    const U = nrm(dir);
    let A = sub(out, sc(U, dot(out, U)));
    if (len3(A) < 1e-3) A = cross(U, [1, 0, 0]);
    A = nrm(A);
    const B = cross(U, A);
    for (const k of [1, -1]) {
      const Vv = nrm(add(A, sc(B, k)));
      prims.push(PL(root, M3.cols(sc(U, len / SPK_L), sc(Vv, w / SPK_W), cross(U, Vv)), part, grp, SPK_G, 1.4));
    }
  }

  let curScale = 1;

  /* ---------- head decals (head frame, unit sphere s) ---------- */
  const HR = [30, 28.5, 31];
  const EYE_AZ = 0.43, EYE_V = 0.3, RING_R = 0.37, WHITE_R = 0.21;
  const NOSE_V = 0.08, MOUTH_V = -0.06, MOUTH_HW = 0.62;
  function eyePix(a, b, kind, px, sd) {
    const r = Math.hypot(a, b * 0.95);
    if (r > RING_R) return 0;
    const lw = Math.max(0.03, 0.65 * px);
    if (kind === 'happy' || kind === 'closed' || kind === 'blink') {
      const k = a / (WHITE_R * 1.05);
      if (Math.abs(k) < 1) {
        const yc = kind === 'happy' ? -0.06 + 0.13 * (1 - k * k) : kind === 'closed' ? 0.05 - 0.12 * (1 - k * k) : -0.01;
        if (Math.abs(b - yc) < lw * 1.2) return C_INK;
      }
      return C_BROWN;
    }
    const wr = Math.min(RING_R * 0.6, RING_R - 1.3 * px);
    if (r > wr) return C_BROWN;
    const pr = Math.max(0.095, 1.4 * px);
    const pa = a + 0.035 * sd, pb = b + 0.01;
    if (pa * pa + pb * pb < pr * pr) {
      if (pr > 2.4 * px && (pa - 0.35 * pr) ** 2 + (pb - 0.4 * pr) ** 2 < (0.35 * pr) ** 2) return C_GLINT;
      return C_PUPIL;
    }
    return C_EYEW;
  }
  function headMat(kind, mo) {
    return (s) => {
      if (s[0] < 0.1) return C_FUR;
      const px = 1 / (curScale * HR[1]);
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      // eyes with brown rings
      const e = eyePix((az - sd * EYE_AZ) * cv, s[1] - EYE_V, kind, px, sd);
      if (e) return e;
      const u = az * cv;
      // mouth (+ the brown lower jaw under it)
      if (Math.abs(u) < MOUTH_HW + 0.2 && s[1] < MOUTH_V + 0.2) {
        const k = u / MOUTH_HW;
        const top = MOUTH_V + 0.09 * k * k;
        const h = mo * 0.8 * Math.sqrt(Math.max(0, 1 - k * k));
        if (h > 0.035 && Math.abs(k) < 1 && s[1] < top && s[1] > top - h) {
          // two little triangular fangs in each jaw
          const tw = 0.1, th = Math.max(0.09, 2.4 * px);
          for (const c of [-0.24, 0.24]) {
            const du = Math.abs(u - c * MOUTH_HW);
            if (du < tw && s[1] > top - th * (1 - du / tw)) return C_TOOTH;
            if (h > 0.2 && du < tw && s[1] < top - h + th * (1 - du / tw)) return C_TOOTH;
          }
          const tb = (s[1] - (top - h)) / (h * 0.45), tk = u / (MOUTH_HW * 0.55);
          if (h > 0.16 && tb * tb + tk * tk < 1) return C_TONGUE;
          return C_MOUTH;
        }
        if (h <= 0.035 && Math.abs(k) < 0.95 && Math.abs(s[1] - (top - 0.02)) < Math.max(0.03, 0.6 * px)) return C_INK;
        // brown lips ringing the maw
        const rim = Math.max(0.1, 1.5 * px);
        const hr = Math.max(h, 0.05);
        const kk = Math.abs(k) / (1 + rim / MOUTH_HW);
        if (kk < 1 && s[1] < top + rim * 0.8 && s[1] > top - hr * Math.sqrt(Math.max(0, 1 - kk * kk)) - rim * (1.2 + 0.6 * (1 - kk * kk))) return C_BROWN;
      }
      return C_FUR;
    };
  }

  /* ---------- torso: two brown stripes across the upper back ---------- */
  // one wedge-shaped stripe per torso ellipsoid (v0 = its height on the unit sphere): widest at the spine,
  // tapering to a point toward the flanks
  const torsoMat = (v0) => (s) => {
    if (s[0] < -0.2) {
      const f = sstep(-0.2, -0.85, s[0]);
      if (Math.abs(s[1] - v0 - 0.06 * (1 - f)) < 0.11 * f) return C_BROWN;
    }
    return C_FUR;
  };
  function sstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  const DEFAULT = { eyes: 'open', mouth: 0.8, walk: 0, arms: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 tuft, 4 nose, 5 ears, 6 chest/cheek fur, 7/8 arms, 9/10 hand claws,
  // 11/12 legs, 13/14 foot claws, 15 tail
  Object.assign(PRI, { 1: 0, 2: 2, 3: 3, 4: 4, 5: 1, 6: 1, 7: 3, 8: 3, 9: 4, 10: 4, 11: 1, 12: 1, 13: 2, 14: 2, 15: -1 });
  const SIZE = 1.22;

  function claws(prims, base, dir, up, id, len = 16, spread = 0.3, three = false) {
    const Rm = axesAlong(dir, up);
    const X = [Rm[0], Rm[3], Rm[6]], Y = [Rm[1], Rm[4], Rm[7]], Z = [Rm[2], Rm[5], Rm[8]];
    const k = len / 16;
    for (const o of three ? [-spread, 0, spread] : [-spread, spread]) {
      const d0 = nrm(add(X, sc(Z, o)));
      hookChain(prims, add(base, sc(Z, o * 9)), d0, Y, [6.5 * k, 5.5 * k, 4.8 * k], [[3.6, 3.2], [2.6, 2.3], [1.4, 1.3]], 0.4, id, id, M_CLAW);
    }
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const mo = clamp(P.mouth ?? 0.55, 0, 1);
    const sw = +P.arms || 0;
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 3 * Math.abs(Math.cos(wk)) : 0;
    const rock = walking ? 0.06 * Math.sin(wk) : 0;

    // --- torso frame at the hips, hunched a little forward
    const tf = chain(T(-8, 40 + bob, 0), R(M3.rx(rock)), R(M3.rz(-0.3)));
    prims.push(ellF(chain(tf, T(0, 40, 0)), [31, 44, 32], 1, 1, torsoMat(0.5)));
    prims.push(ellF(chain(tf, T(4, 78, 0)), [31, 27, 37], 1, 1, torsoMat(-0.02)));
    anchors.body = inF(tf, [0, 50, 0]);
    anchors.chest = inF(tf, [31, 66, 0]);
    // shaggy chest fur: spikes hanging down over the belly, and a ruff at the collar
    for (const [z, y, l] of [])
      tuft(prims, inF(tf, [30 - Math.abs(z) * 0.3, y, z]), dirF(tf, [0.45, -1, z * 0.02]), l, 7, 6, 6, M3.v(tf.L, [1, 0, 0]));

    // --- head: sits low on the shoulders
    const hf = chain(tf, T(22, 108, 0), R(M3.rz(0.34 + (walking ? 0.03 * Math.sin(2 * wk) : 0))), R(M3.rx(-rock * 0.6)));
    const headPrim = ellF(hf, HR, 2, 2, headMat(kind, mo));
    prims.push(headPrim);
    anchors.head = hf.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(hf, [(HR[0] + out) * q[0], (HR[1] + out) * q[1], (HR[2] + out) * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, MOUTH_V - 0.18 * mo);
    // small pink nose
    const nc = onHead(0, NOSE_V, -1.5);
    prims.push(E(nc, M3.mul(hf.L, M3.diag(6, 5.5, 7)), 4, 4, M_NOSE));
    anchors.nose = nc;
    // stubby ears
    for (const sd of [1, -1]) prims.push(E(onHead(sd * 1.5, 0.42, -3), M3.mul(hf.L, M3.diag(6, 7.5, 5)), 5, 5, M_FUR));
    // shaggy fur at the sides of the maw
    for (const sd of [1, -1])
      for (const [az, v, l] of [[1.15, -0.35, 12], [1.35, -0.05, 10]])
        tuft(prims, onHead(sd * az, v, -3), dirF(hf, [-0.1, -0.5, sd]), l, 5.4, 2, 2, M3.v(hf.L, [1, 0, 0]));

    // --- the red teardrop tuft rising from the forehead: a fat bulb at the front, tapering up into
    //     a pointed flame tip with a smaller second point just behind it
    const tb = onHead(0, 0.6, -5);
    const fwdH = dirF(hf, [1, 0, 0]), upH = dirF(hf, [0, 1, 0]);
    const tU = dirF(hf, [0.3, 1, 0]);
    const bulbC = add(tb, add(sc(tU, 10), sc(fwdH, 2)));
    const tAx = axesAlong(tU, fwdH);
    prims.push(E(bulbC, M3.mul(tAx, M3.diag(16, 13.5, 10.5)), 3, 3, M_RED));
    // upper half narrows smoothly into the point (the two ellipsoids blend into one teardrop)
    const upC = add(bulbC, sc(dirF(hf, [0.12, 1, 0]), 12));
    prims.push(E(upC, M3.mul(axesAlong(dirF(hf, [0.12, 1, 0]), fwdH), M3.diag(13, 8.5, 7)), 3, 3, M_RED));
    const tip = add(upC, sc(dirF(hf, [0.12, 1, 0]), 12.5));
    prims.push(E(add(upC, sc(dirF(hf, [0.12, 1, 0]), 9)), M3.mul(axesAlong(dirF(hf, [0.12, 1, 0]), fwdH), M3.diag(6, 4.2, 3.6)), 3, 3, M_RED));
    // the small second point just behind the tip
    const t2 = dirF(hf, [-0.55, 1, 0]);
    prims.push(E(add(upC, add(sc(t2, 8), sc(fwdH, -3))), M3.mul(axesAlong(t2, fwdH), M3.diag(7, 3.4, 3.2)), 3, 3, M_RED));
    anchors.tuft = bulbC;
    anchors.top = add(tip, [0, 2, 0]);

    // --- arms: long, raised up and out; `arms` windmills them about the shoulders
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8, cid = sd > 0 ? 9 : 10;
      const sh = inF(tf, [4, 86, 37 * sd]);
      const swing = (walking ? 0.35 * Math.sin(wk + (sd > 0 ? Math.PI : 0)) : 0) + sw * sd;
      const Rs = M3.mul(tf.L, M3.rz(swing));
      // upper arm out to the side and down; forearm bent up, hands about head height
      const d1 = nrm(M3.v(Rs, [0.2, -0.72, 0.66 * sd]));
      const el = add(sh, sc(d1, 40));
      const d2 = nrm(M3.v(Rs, [0.28, 0.96, 0.02 * sd]));
      const wr = add(el, sc(d2, 70));
      prims.push(seg(sh, el, 13, 13, [0, 1, 0], id, id, M_FUR, 1.2));
      prims.push(E(el, M3.diag(12.5, 12.5, 12.5), id, id, M_FUR));
      prims.push(seg(el, wr, 12.5, 12, [0, 1, 0], id, id, M_FUR, 1.1));
      // shaggy elbow tuft
      tuft(prims, el, nrm(sub(sc(d2, -1), sc(d1, 1))), 13, 5.2, id, id, M3.v(Rs, [0, 0, sd]));
      const hc = add(wr, sc(d2, 5));
      prims.push(E(hc, M3.mul(axesAlong(d2, M3.v(Rs, [1, 0, 0])), M3.diag(12, 10, 11)), id, id, M_FUR));
      // red palm pad
      prims.push(E(add(hc, M3.v(Rs, [5, 0, 0])), M3.mul(axesAlong(d2, M3.v(Rs, [1, 0, 0])), M3.diag(6.5, 7, 6.5)), id, id, M_RED));
      // two big black claws curling forward
      const cd = nrm(add(d2, M3.v(Rs, [0.35, 0, 0])));
      claws(prims, add(hc, sc(cd, 8)), cd, M3.v(Rs, [-1, 0.2, 0]), cid, 21, 0.34);
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hc, sc(cd, 18));
    }

    // --- short thick legs, two black claws on each foot
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 11 : 12, cid = sd > 0 ? 13 : 14;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 13 * Math.sin(ph) : 0;
      const lift = walking ? 8 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(tf, [2, 8, 18 * sd]);
      const ank = [4 + fwd, 9 + lift, 21 * sd];
      prims.push(seg(hip, ank, 14, 14, [1, 0, 0], id, id, M_FUR, 1.1));
      const foot = chain(T(ank[0] + 5, ank[1] - 2.5, ank[2]), R(M3.ry(-sd * 0.15)), R(M3.rz(walking ? -0.3 * Math.sin(ph) * (lift > 0 ? 1 : 0.3) : 0)));
      prims.push(ellF(foot, [15, 7.5, 12], id, id, M_FUR));
      claws(prims, inF(foot, [11, -1, 0]), dirF(foot, [1, 0.05, 0]), dirF(foot, [0, 1, 0]), cid, 12, 0.5, true);
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -7, 0]);
    }

    // --- stubby shaggy tail
    const tc = inF(tf, [-34, 16, 0]);
    prims.push(E(tc, M3.mul(tf.L, M3.diag(15, 12, 12)), 15, 15, M_FUR));
    for (const [dy, dz, l] of [[0.1, 0, 24], [-0.5, 0.45, 20], [-0.5, -0.45, 20], [0.6, 0.3, 17], [0.6, -0.3, 17]]) tuft(prims, tc, dirF(tf, [-1, -0.2 + dy, dz]), l, 7, 15, 15, M3.v(tf.L, [0, 1, 0]));
    anchors.tail = tc;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 12 };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
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
      const s = y * w, d = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.4, bw: 290, bh: 300, oy: 0.93 } };
})();
