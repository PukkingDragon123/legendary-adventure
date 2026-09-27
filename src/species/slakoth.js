/* ------------------------------------------------------------------
   Slakoth — the Slacker Pokémon (0.8 m: ≈ 133 units long lying flat with
   the curl ≈ 85 up; sitting up ≈ 135 to the top of the curl, head top
   ≈ 100). A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (Slakoth's
   right side), ground at y = 0.

   Design (official art / HOME model): a lazy sloth lying flat on its
   belly. Pale greyish-beige fur. A big round head with large dark-brown
   eye patches; inside them droopy eyes — heavy pink upper lids, a dark
   lid line sloping down to the outer corners, white eyes with small black
   pupils hanging from the lids; a big pink snout with two nostrils and a
   small wavy smile. Two white claw-like tufts on the forehead in a crown
   of spiky fur, and a huge thick curl of fur looping up from the crown
   and over to its right side. A long body with two dark-brown stripes
   across the back and spiky tufts on the shoulders; long arms lying
   along its sides and hind legs stretched out behind, every limb ending
   in two big curved white claws.

   Pose parameters (all optional):
     lie      0..1    0 = sitting up on its rump (legs out in front, arms
                      hanging at its sides), 1 = lying flat on its belly (the
                      official pose, default). The rump contact stays put.
     yawn     0..1    big yawn: mouth opens wide (eyes squeeze shut past 0.55,
                      head tips back)
     scratch  −1..1   one arm lifts to scratch its cheek: + = right arm (near
                      side at yaw 0), − = left arm; |value| = how far (animate
                      it between ≈ 0.7 and 1 to scratch)
     eyes     'half' (droopy, as in the art; default) | 'open' (lids up,
              alert) | 'happy' | 'closed' | 'blink'
     headRoll −1..1   head tilt (+ = toward its right / near side)
     step     radians slow crawl phase: lying, the arms reach forward in turn
                      and drag the body, which sways; sitting, a lazy sway;
                      exactly 0 = still
     side     −1..1   ≈ cos(yaw), passed by the game: the head turns up to
                      ≈ 35° toward the camera (the face stays visible in side
                      views, as in the official art)

   Anchors: top (top of the fur curl), head (head centre), mouth, nose,
   eyeN, eyeF (eye centres, N = near side at yaw 0), body (torso centre),
   curl (curl centre), handN / handF, footN / footF, belly (ground contact
   under the chest).
------------------------------------------------------------------- */
const Slakoth = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const FUR = 1, STRIPE = 2, LID = 3, NOSE = 4, WHITE = 5, PUPIL = 6, MOUTH = 7, TONGUE = 8, CLAW = 9, INK = 10, PATCH = 11;
  const MAT = { FUR, STRIPE, LID, NOSE, WHITE, PUPIL, MOUTH, TONGUE, CLAW, INK, PATCH };
  const PAL = Creature.palette({
    [FUR]:    { r: ['#8a7c6e', '#ac9e8e', '#cfc3b3', '#e6ddd0', '#f7f2ea'], od: '#463a2e', ol: '#786a5a', ln: '#7e7060' },
    [STRIPE]: { r: ['#46301e', '#5e422c', '#78583a', '#92704c', '#ac8a64'], od: '#26180c', ol: '#48301c', ln: '#46301c' },
    [PATCH]:  { r: ['#503622', '#684a30', '#82623f', '#9a7a54', '#b4946c'], od: '#2a1a0e', ol: '#4e3420', ln: '#4e3420' },
    [LID]:    { r: ['#b25a6e', '#d2788c', '#eea0b0', '#fac2cc', '#ffe2e8'], od: '#66223a', ol: '#9e4660', ln: '#9e4660' },
    [NOSE]:   { r: ['#b0566c', '#d27288', '#ee98aa', '#f9bcc8', '#ffe0e6'], od: '#64203a', ol: '#9a4460', ln: '#9a4460' },
    [WHITE]:  { r: ['#c4c4cc', '#e2e2e8', '#fbfbfd', '#ffffff', '#ffffff'], od: '#5a5a66', ol: '#8a8a96', ln: '#8a8a96' },
    [PUPIL]:  { r: ['#08080c', '#0e0e14', '#16161e', '#22222c', '#34343e'], od: '#040406', ol: '#08080c', ln: '#08080c' },
    [MOUTH]:  { r: ['#3a1618', '#502022', '#682c2c', '#803a38', '#984a46'], od: '#220a0c', ol: '#3a1618', ln: '#3a1618' },
    [TONGUE]: { r: ['#b44c60', '#d06678', '#ea8896', '#f8aab4', '#ffcdd2'], od: '#621828', ol: '#8e2a3c', ln: '#8e2a3c' },
    [CLAW]:   { r: ['#9c978e', '#c6c2b9', '#ecebe6', '#fafaf7', '#ffffff'], od: '#4c4842', ol: '#7c776e', ln: '#86817a' },
    [INK]:    { r: ['#241410', '#321c16', '#40261e', '#4e3026', '#5c3a2e'], od: '#140a08', ol: '#241410', ln: '#241410' },
  });
  const GLOSSY = { [NOSE]: 1 };
  const C_FUR = code(FUR), C_STRIPE = code(STRIPE), C_PATCH = code(PATCH), C_LID = code(LID), C_NOSE = code(NOSE);
  const C_WHITE = code(WHITE), C_PUPIL = code(PUPIL), C_GLINT = code(WHITE, 1), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const C_CLAW = code(CLAW), C_INK = code(INK), C_NOSTRIL = code(NOSE, -2);
  const M_FUR = () => C_FUR, M_CLAW = () => C_CLAW;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // rotation whose x axis is d and whose y axis is as close as possible to `up`
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid (model space) spanning p0 → p1 along its local x axis
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.12) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }

  // pointed fur tuft: two crossed flat plates (reads from every angle)
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

  // tapered, progressively bending chain of ellipsoids (claws, forehead tufts): starts at p along d,
  // each link turns by `bend` rad toward −bendDir; r = [[rAcross, rThick], ...], lens = link lengths
  function hookChain(prims, p, d, bendDir, lens, r, bend, part, grp) {
    let dir = nrm(d);
    for (let i = 0; i < lens.length; i++) {
      const q = add(p, sc(dir, lens[i]));
      const B = nrm(sub(bendDir, sc(dir, dot(bendDir, dir))));
      const Rm = M3.cols(dir, B, cross(dir, B));
      const hl = lens[i] * 0.5 + r[i][0] * 0.55;
      prims.push(E(sc(add(p, q), 0.5), M3.mul(Rm, M3.diag(hl, r[i][1], r[i][0])), part, grp, M_CLAW));
      p = q;
      dir = nrm(sub(dir, sc(B, Math.tan(bend))));
    }
  }

  let curScale = 1;

  /* ---------- head: eye patches, droopy eyes, mouth (head frame, unit sphere s) ---------- */
  const HR = [24, 25, 33];
  const EP_AZ = 0.5, EP_V = 0.07, EP_RU = 0.4, EP_RV = 0.44;     // eye patch centre / radii
  const OP_K = 0.72;                                            // eye opening, fraction of the patch
  const NOSE_V = -0.3, MOUTH_V = -0.64, MOUTH_HW = 0.36;
  function eyePix(a, b, kind, pxa, pxb, sd) {
    // a, b: patch-normalised coords (b up); sd: +1 = outer corner at +a
    const r2 = a * a + b * b;
    if (r2 >= 1) return 0;
    const oa = a / OP_K, ob = (b + 0.03) / (OP_K * 0.96);
    const o2 = oa * oa + ob * ob;
    if (o2 >= 1) return C_PATCH;
    const lw = Math.max(0.09, 0.95 * pxb); // lid line half-width
    const ao = a * sd;                     // + toward the outer corner
    if (kind === 'closed' || kind === 'blink' || kind === 'happy') {
      let yc;
      if (kind === 'happy') yc = -0.3 + 0.55 * (1 - oa * oa); // ∩
      else if (kind === 'blink') yc = -0.08;
      else yc = 0.02 - 0.26 * (1 - oa * oa);                  // closed: a droopy ∪
      if (Math.abs(b - yc) < lw && Math.abs(oa) < 0.97) return C_INK;
      return b > yc ? C_LID : C_PATCH;
    }
    const lid = (kind === 'open' ? 0.4 : 0.12) - 0.2 * ao;
    if (b > lid + lw) return C_LID;
    if (b > lid - lw) return C_INK;
    // pupil hangs from the lid line, a little toward the nose
    const pr = Math.max(0.25, 1.25 * pxa);
    const pc = [-0.14 * sd, lid - (kind === 'open' ? 0.34 : 0.1)];
    const dx = (a - pc[0]) / pr, dy = (b - pc[1]) / (pr * 1.12);
    if (dx * dx + dy * dy < 1) {
      if (kind === 'open' && pr > 2.2 * pxa && (dx + 0.35 * sd) ** 2 + (dy - 0.35) ** 2 < 0.12) return C_GLINT;
      return C_PUPIL;
    }
    // dark rim under the white when there is room for it
    if (o2 > 1 - Math.min(0.5, 2.1 * pxb) && pxb < 0.14) return C_INK;
    return C_WHITE;
  }
  function headMat(kind, yawn) {
    return (s) => {
      if (s[0] < 0.12) return C_FUR;
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      const pxv = 1 / (curScale * HR[1]), pxh = 1 / (curScale * 26);
      // eye patches
      const u = (az - sd * EP_AZ) * cv, v = s[1] - EP_V;
      const a = u / EP_RU, b = v / EP_RV;
      if (a * a + b * b < 1) return eyePix(a, b, kind, pxh / EP_RU, pxv / EP_RV, sd);
      // mouth: a small wavy smile, or a big yawn
      const mu = az * cv;
      if (Math.abs(mu) < MOUTH_HW + 0.06 && s[1] < NOSE_V + 0.1) {
        if (yawn > 0.05) {
          const hw = 0.16 + 0.16 * yawn, h = Math.max(0.06 + 0.26 * yawn, 1.6 * pxv);
          const k = mu / hw, e = (s[1] - (MOUTH_V + 0.02)) / h; // ellipse centred under the snout
          const q = k * k + e * e;
          if (q < 1) return e < -0.35 && Math.abs(k) < 0.72 ? C_TONGUE : C_MOUTH;
        } else if (Math.abs(mu) < MOUTH_HW) {
          const k = mu / MOUTH_HW;
          const yc = MOUTH_V + 0.12 * k * k + 0.035 * Math.sin(k * 7.5) + (Math.abs(k) > 0.86 ? 0.09 * (Math.abs(k) - 0.86) / 0.14 : 0);
          if (Math.abs(s[1] - yc) < Math.max(0.028, 0.6 * pxv)) return C_INK;
        }
      }
      return C_FUR;
    };
  }
  // snout: big pink oval with two nostrils (nose frame, unit sphere)
  function noseMat(s) {
    if (s[0] > 0.45 && Math.abs(Math.abs(s[2]) - 0.36) < Math.max(0.07, 0.55 / (curScale * 10.5)) && Math.abs(s[1] + 0.02) < 0.26) return C_NOSTRIL;
    return C_NOSE;
  }

  /* ---------- torso (torso frame: a = along the body from the rump, b = belly → back) ---------- */
  const RUMP_C = [42, 21, 0], RUMP_R = [45, 21, 27];     // the whole torso (one smooth ellipsoid)
  const STRIPES = [59, 33], STRIPE_W = 5.6;
  function torsoMat(C, Rr) {
    return (s) => {
      // two saddle stripes across the upper back
      if (s[1] > 0) {
        const a = C[0] + Rr[0] * s[0] + 4.5 * (1 - s[1]);
        const w = STRIPE_W * (0.45 + 0.55 * sstep(0, 0.5, s[1]));
        for (const s0 of STRIPES) if (Math.abs(a - s0) < w) return C_STRIPE;
      }
      return C_FUR;
    };
  }

  /* ---------- the fur curl (head frame): a thick tube looping up and over to the right ----------
     Built from overlapping ellipsoids along the loop; their shading is corrected to the true
     torus normal (a per-pixel tone bias), so the tube reads smooth instead of beaded. */
  const CURL_C = [-4, 31, 19], CURL_R = 21;
  const CURL_SIDE = nrm([-0.14, 0, 1]), CURL_UP = [0, 1, 0];
  const CURL_A0 = -38, CURL_A1 = 252, CURL_N = 13;
  const curlR = (t) => (t < 0.12 ? 9.2 + 13 * t : t < 0.7 ? 10.8 : 10.8 - (t - 0.7) * 5); // tube radius along the arc (0..1)
  let viewR = M3.I(), lightD = V3.norm([-0.5, 0.72, 0.5]), lightTh = [-0.2, 0.18, 0.74];
  const toneOf = (d) => (d < lightTh[0] ? 0 : d < lightTh[1] ? 1 : d < lightTh[2] ? 2 : 3);
  function curlMat(seg, ring) {
    return (s) => {
      const p = add(seg.c, M3.v(seg.L, s));
      const ne = nrm([seg.Li[0] * s[0] + seg.Li[3] * s[1] + seg.Li[6] * s[2], seg.Li[1] * s[0] + seg.Li[4] * s[1] + seg.Li[7] * s[2], seg.Li[2] * s[0] + seg.Li[5] * s[1] + seg.Li[8] * s[2]]);
      const v = sub(p, ring.c);
      const vin = sub(v, sc(ring.n, dot(v, ring.n)));
      const q = add(ring.c, sc(nrm(vin), ring.R));
      const nt = nrm(sub(p, q));
      const bias = toneOf(dot(M3.v(viewR, nt), lightD)) - toneOf(dot(M3.v(viewR, ne), lightD));
      return code(FUR, clamp(bias, -2, 2));
    };
  }

  const DEFAULT = { lie: 1, yawn: 0, scratch: 0, eyes: 'half', headRoll: 0, step: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 snout, 4 curl, 5 head tufts (white), 6 crown spikes, 7 back spikes,
  // 10/11 arms, 12/13 legs, 14/15 hand claws, 16/17 foot claws
  Object.assign(PRI, { 2: 2, 3: 4, 4: 1, 5: 3, 6: 1, 7: 0, 10: 3, 11: 3, 12: 1, 13: 1, 14: 4, 15: 4, 16: 2, 17: 2 });
  const SIZE = 0.95;
  const RUMP_X = -26; // world x of the rump's ground contact (kept for every lie value)

  // lowest point (world y) of an ellipsoid given centre c and matrix M (= axes · radii)
  const lowY = (c, M) => c[1] - Math.hypot(M[3], M[4], M[5]);

  function claws(prims, base, dir, up, id, n = 2, len = 12.5, spread = 0.34) {
    const Rm = axesAlong(dir, up);
    const X = [Rm[0], Rm[3], Rm[6]], Y = [Rm[1], Rm[4], Rm[7]], Z = [Rm[2], Rm[5], Rm[8]];
    const k = len / 12.5;
    for (let i = 0; i < n; i++) {
      const o = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
      const d0 = nrm(add(X, sc(Z, o)));
      // the tip hooks toward −Y (the palm side)
      hookChain(prims, add(base, sc(Z, o * 7)), d0, Y, [5 * k, 4.4 * k, 3.8 * k], [[2.9, 2.6], [2.1, 1.9], [1.25, 1.15]], 0.42, id, id);
    }
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const lie = clamp(P.lie ?? 1, 0, 1), up = 1 - lie;
    const yawn = clamp(+P.yawn || 0, 0, 1), scr = clamp(+P.scratch || 0, -1, 1);
    const st = +P.step || 0, moving = st !== 0;
    const roll = clamp(+P.headRoll || 0, -1, 1);
    const eyes = yawn > 0.55 && P.eyes !== 'open' ? 'closed' : P.eyes;

    // --- torso frame: rotate up about the rump (0 = lying, ~75° = sitting, leaning back a little)
    const th = up * 1.3;
    const sway = moving ? (lie > 0.5 ? 0.07 : 0.04) * Math.sin(st) : 0;
    const Rt = M3.mul(M3.mul(M3.ry(sway), M3.rz(th)), M3.diag(1 - 0.16 * up, 1, 1));
    // place the frame so the rump rests on the ground at RUMP_X
    const rc = M3.v(Rt, RUMP_C), rM = M3.mul(Rt, M3.diag(...RUMP_R));
    const ly = lowY(rc, rM);
    // x of the lowest rump point
    const nY = [rM[3], rM[4], rM[5]], nl = Math.hypot(...nY);
    const lowX = rc[0] - (rM[0] * nY[0] + rM[1] * nY[1] + rM[2] * nY[2]) / nl;
    const tf = F(Rt, [RUMP_X - lowX, -ly, 0]);

    prims.push(ellF(chain(tf, T(...RUMP_C)), RUMP_R, 1, 1, torsoMat(RUMP_C, RUMP_R)));
    anchors.body = inF(tf, [40, 20, 0]);
    anchors.belly = [inF(tf, [52, 0, 0])[0], 0, 0];

    // --- head: resting on the ground in front (lying) / on top of the chest (sitting)
    const neck = inF(tf, [84, 25, 0]);
    const headLie = [neck[0], 26, 0];
    const headPos = lerp3(headLie, add(neck, [4, 8, 0]), up);
    const crawlBob = moving && lie > 0.5 ? 1.2 * Math.abs(Math.sin(st)) : 0;
    // the head turns a little toward the camera (as in the official art) — side = cos(yaw) cheat
    const look = -0.62 * clamp(P.side ?? 0, -1, 1);
    const hf = chain(T(headPos[0], headPos[1] + crawlBob, headPos[2]), R(M3.ry(look - sway * 0.8)), R(M3.rx(roll * 0.36)), R(M3.rz(0.05 * up + 0.3 * yawn - 0.04 * lie)));
    const headPrim = ellF(hf, HR, 2, 2, headMat(eyes, yawn));
    prims.push(headPrim);
    anchors.head = hf.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(hf, [HR[0] * q[0] + out * q[0], HR[1] * q[1] + out * q[1], HR[2] * q[2] + out * q[2]]); };
    anchors.eyeN = onHead(EP_AZ, EP_V); anchors.eyeF = onHead(-EP_AZ, EP_V);
    anchors.mouth = onHead(0, MOUTH_V + 0.04);
    // snout
    const nf = chain(hf, T(HR[0] * 0.8 - 1.2 * yawn, HR[1] * (NOSE_V + 0.12 * yawn), 0), R(M3.rz(0.25 * yawn)));
    prims.push(ellF(nf, [7.6, 7.9, 11.6], 3, 3, noseMat));
    anchors.nose = inF(nf, [7.2, 0, 0]);

    // --- forehead: two white claw-like tufts (flattened, curving forward) in a crown of spiky fur
    for (const sd of [1, -1]) {
      const d = dirF(hf, [0, 1, 0.18 * sd]);
      hookChain(prims, inF(hf, [4, 20.5, 5.2 * sd]), d, dirF(hf, [-1, 0, 0]), [11, 8.5, 7], [[6.2, 4.2], [4.6, 3.2], [2.6, 2.0]], 0.55, 5, 5);
    }
    for (const [x, y, z, dx, dy, dz, l] of [[-2, 23, 10, 0.1, 1, 0.8, 15], [-8, 21, 16, -0.2, 0.8, 1, 14], [3, 22, -9, 0.3, 1, -0.7, 15], [-6, 21, -16, -0.2, 0.8, -1, 14], [-11, 22, 2, -0.8, 1, 0.1, 14]])
      tuft(prims, inF(hf, [x, y, z]), dirF(hf, [dx, dy, dz]), l, 5.6, 6, 6, M3.v(hf.L, [1, 0, 0]));

    // --- the big fur curl (overlapping ellipsoids along the loop, torus-shaded)
    let top = hf.t[1] + HR[1];
    const ring = { c: inF(hf, CURL_C), R: CURL_R };
    const Sw = dirF(hf, CURL_SIDE), Uw = dirF(hf, CURL_UP);
    ring.n = nrm(cross(Sw, Uw));
    const dA = ((CURL_A1 - CURL_A0) / CURL_N) * (Math.PI / 180);
    for (let i = 0; i < CURL_N; i++) {
      const ph = CURL_A0 * (Math.PI / 180) + (i + 0.5) * dA, t = (i + 0.5) / CURL_N;
      const c = add(ring.c, add(sc(Sw, -CURL_R * Math.cos(ph)), sc(Uw, CURL_R * Math.sin(ph))));
      const tg = nrm(add(sc(Sw, Math.sin(ph)), sc(Uw, Math.cos(ph))));
      const r = curlR(t);
      const L = M3.mul(axesAlong(tg, ring.n), M3.diag(CURL_R * dA * 0.95 + r * 0.35, r, r));
      const segP = { c, L, Li: M3.inv(L) };
      prims.push(E(c, L, 4, 4, curlMat(segP, ring)));
      top = Math.max(top, c[1] + r);
    }
    anchors.curl = ring.c;
    anchors.top = [ring.c[0], top, ring.c[2]];

    // --- shoulder spikes
    for (const [a, b, c, da, db, dc, l] of [[62, 36, 8, -0.6, 1, 0.35, 15], [54, 38, -4, -0.7, 1, -0.25, 16], [68, 34, -12, -0.5, 1, -0.6, 13], [46, 37, 10, -0.8, 1, 0.5, 13]])
      tuft(prims, inF(tf, [a, b, c]), dirF(tf, [da, db, dc]), l, 5.6, 7, 7, M3.v(tf.L, [0, 0, 1]));

    // --- arms: lying along the sides (claws back) / hanging down at the sides (sitting);
    //     the crawl reaches forward in turn; scratch lifts one arm to its cheek
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11, cid = sd > 0 ? 14 : 15;
      const sh = inF(tf, [74, 12, 21 * sd]);
      // lying rest: along the body side toward the rump
      let elbow = inF(tf, [44, 8.5, 27 * sd]), hand = inF(tf, [12, 6.5, 30 * sd]);
      let cdir = dirF(tf, [-1, -0.05, 0.1 * sd]), cup = [0, -1, 0];
      // sitting rest: hanging down beside the body, claws on the ground
      const eS = add(sh, [3, -17, 7 * sd]), hS = [sh[0] + 9, 7, sh[2] + 10 * sd];
      elbow = lerp3(elbow, eS, up); hand = lerp3(hand, hS, up);
      cdir = nrm(lerp3(cdir, [0.55, -0.8, 0.2 * sd], up));
      cup = nrm(lerp3([0, -1, 0.05 * sd], [1, 0.3, 0], up));
      // crawl: reach forward beside the head, plant, pull back
      if (moving && lie > 0.3) {
        const ph = st + (sd > 0 ? 0 : Math.PI);
        const k = (0.5 + 0.5 * Math.sin(ph)) * lie;
        const lift = Math.max(0, Math.cos(ph)) * 4 * lie;
        const hF = [hf.t[0] + 6, 5 + lift, 30 * sd], eF = [sh[0] + 14, 10 + lift * 0.6, 29 * sd];
        hand = lerp3(hand, hF, k); elbow = lerp3(elbow, eF, k);
        cdir = nrm(lerp3(cdir, [1, -0.15, 0.1 * sd], k));
      }
      // scratch
      const ks = sd > 0 ? Math.max(0, scr) : Math.max(0, -scr);
      if (ks > 0) {
        const kk = sstep(0, 1, ks);
        const hT = inF(hf, [7 + 4 * (ks - 0.85), 4 + 10 * (ks - 0.85), 33 * sd]);
        const eT = add(lerp3(sh, hT, 0.5), [6, -8, 14 * sd]);
        hand = lerp3(hand, hT, kk); elbow = lerp3(elbow, eT, kk);
        cdir = nrm(lerp3(cdir, M3.v(hf.L, [0.35, 0.85, -0.3 * sd]), kk));
        cup = nrm(lerp3(cup, M3.v(hf.L, [0, 0, sd]), kk));
      }
      prims.push(seg(sh, elbow, 7.3, 7.1, [0, 1, 0], id, id, M_FUR, 1.4));
      prims.push(E(elbow, M3.diag(6.5, 6.5, 6.5), id, id, M_FUR));
      prims.push(seg(elbow, hand, 6.8, 6.6, [0, 1, 0], id, id, M_FUR, 1.3));
      claws(prims, add(hand, sc(cdir, 4.5)), cdir, cup, cid, 2, 13, 0.32);
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hand, sc(cdir, 10));
    }

    // --- hind legs: stretched out behind (lying) / out in front on the ground (sitting)
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 12 : 13, cid = sd > 0 ? 16 : 17;
      const hip = inF(tf, [12, 10, 13 * sd]);
      const push = moving && lie > 0.3 ? Math.sin(st + (sd > 0 ? Math.PI : 0)) * 3 * lie : 0;
      let foot = inF(tf, [-10 + push * 1.6, 7, 24 * sd]);
      const fS = [hip[0] + 30, 7, hip[2] + 5 * sd];
      foot = lerp3(foot, fS, up);
      const fdir = nrm(lerp3(dirF(tf, [-1, 0.15, 0.45 * sd]), [1, 0.25, 0.1 * sd], up));
      const fup = nrm(lerp3([0, -1, 0], [-0.3, 1, 0], up));
      prims.push(seg(hip, foot, 8.8, 8.6, [0, 1, 0], id, id, M_FUR, 1.12));
      const fc = add(foot, sc(fdir, 1.5));
      claws(prims, add(fc, sc(fdir, 3.8)), fdir, fup, cid, 2, 12, 0.32);
      anchors[sd > 0 ? 'footN' : 'footF'] = add(fc, sc(fdir, 8));
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 14 };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    viewR = M3.mul(M3.rx(pitch), M3.ry(-yaw));
    const Lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    lightD = V3.norm(Lg.dir); lightTh = Lg.th || [-0.2, 0.18, 0.74];
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.8, bw: 220, bh: 196, oy: 0.86 } };
})();
