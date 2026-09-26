/* ------------------------------------------------------------------
   Tropius — the Fruit Pokémon (2.0 m ≈ 350 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Build: a big brown sauropod-like body on four stout legs (cream
   toenails), a long curved neck, a rounded head with a hinged jaw and a
   crest of three green leaves, a bunch of yellow banana fruit hanging
   around the throat under the chin, a short tail, and four huge leaf
   wings on the back (V-folded plates with a midrib and side veins).

   Pose params:
     flap   -1..1    leaf wings down (−1) / up (+1); 0 = spread at rest
     neck   -1..1    lower the neck (−1, head down to graze) / raise it (+1)
     mouth  0..1     jaw open amount
     step   radians  walk cycle phase, period 2π (diagonal gait, gentle body bob, tail sway);
                     exactly 0 = standing still, phase 0+ starts from a planted stride
     eyes   'open' | 'happy' | 'closed' | 'blink'
     look   -1..1    turn the head to its left (+, toward +z) / right (−), default 0
     hold   0..1     > 0.5: holds one banana (plucked from its bunch) crosswise in its mouth
                     — the "sharing fruit" shot; the jaw opens a little to grip it. Default 0
   Anchors: top, head, mouth, eyeN, eyeF, body, fruit (banana bunch, or the held banana), tail,
   wingTipN, wingTipF (front leaf tips), footFN, footFF, footBN, footBF.
   Render: cropped to the silhouette box; shadowSteps 12.
------------------------------------------------------------------- */
const Tropius = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, LEAF = 2, FRUIT = 3, STALK = 4, NAIL = 5, MOUTH = 6, TONGUE = 7, SNOUT = 8;
  const MAT = { BODY, LEAF, FRUIT, STALK, NAIL, MOUTH, TONGUE, SNOUT };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#5c3a1e', '#7e522a', '#9e6b38', '#bd894e', '#d9a86c'], od: '#361f0e', ol: '#6a4422', ln: '#66401f' },
    [SNOUT]:  { r: ['#6a4526', '#8e6036', '#b07c48', '#cc9a62', '#e6ba84'], od: '#3a2210', ol: '#744a26', ln: '#704824' },
    [LEAF]:   { r: ['#28682a', '#398a33', '#55aa42', '#7cc65c', '#ade28a'], od: '#143c16', ol: '#2a6828', ln: '#2c6c28' },
    [FRUIT]:  { r: ['#bf8e1a', '#dcb02a', '#f2d048', '#fbe588', '#fff5c6'], od: '#684808', ol: '#9a7012', ln: '#9e7416' },
    [STALK]:  { r: ['#3e5a1c', '#557826', '#6f9632', '#8cb04a', '#b0cc72'], od: '#22340c', ol: '#46621a', ln: '#40581a' },
    [NAIL]:   { r: ['#b09c7a', '#cfbd9a', '#eadcbc', '#f7eedb', '#fffaf0'], od: '#5a4628', ol: '#86704c', ln: '#907a56' },
    [MOUTH]:  { r: ['#561622', '#76202e', '#96303c', '#b0444e', '#c85e66'], od: '#340a12', ol: '#541420', ln: '#541420' },
    [TONGUE]: { r: ['#b44a5e', '#d0647a', '#e88896', '#fcaab4', '#ffd0d4'], od: '#681830', ol: '#8a2440', ln: '#a0344e' },
  });
  const GLOSSY = { [FRUIT]: 1 };

  const DEFAULT = { flap: 0, neck: 0, mouth: 0, step: 0, eyes: 'open', look: 0, hold: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick, lines) => ({ kind: 'plate', part, grp, c, L, shape, thick, lines });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const MIRZ = M3.diag(1, 1, -1);
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid spanning p0 → p1 along its local x axis
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.15) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }
  const rotAxis = (a, t) => {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  };

  const C_BODY = code(BODY), C_BODY_L = code(BODY, 1), C_SNOUT = code(SNOUT), C_FRUIT = code(FRUIT), C_STALK = code(STALK);
  const C_NAIL = code(NAIL), C_MOUTH = code(MOUTH);
  const M_BODY = () => C_BODY, M_FRUIT = () => C_FRUIT, M_STALK = () => C_STALK, M_NAIL = () => C_NAIL, M_MOUTH = () => C_MOUTH, M_SNOUT = () => C_SNOUT;

  /* ---------- leaf shapes (u = along the leaf from the stalk, v = across; one half per plate) ---------- */
  function leafHalf(L, W, top, lighter) {
    // half-width profile: slim stalk, broad middle, pointed tip; gentle waves along the edge
    const hw = (u) => {
      const t = u / L;
      if (t < 0 || t > 1) return -1;
      const body = Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.25 * t);
      return Math.max(t < 0.06 ? 3.2 : 0, W * body * (1 + 0.035 * Math.sin(t * 34)));
    };
    // (two plates per half — inner and outer — so each plate's screen box stays tight)
    const part = (u0, u1) => {
      let wmax = 0;
      for (let u = u0; u <= u1; u += 0.5) wmax = Math.max(wmax, hw(Math.min(L, Math.max(0, u))));
      return {
        bb: [u0 - 0.5, top ? -0.6 : -wmax - 1, u1 + 0.5, top ? wmax + 1 : 0.6],
        test(u, v) {
          if (u < u0 || u > u1) return 0;
          const h = hw(u);
          if (h < 0) return 0;
          const a = top ? v : -v;
          if (a < -0.5 || a > h) return 0;
          return code(LEAF, lighter ? 1 : 0);
        },
      };
    };
    const lines = [];
    // midrib + side veins (in the half's own coordinates)
    lines.push({ pts: [[2, 0, 0], [L * 0.5, 0, 0], [L * 0.97, 0, 0]], mat: LEAF, useLn: true });
    for (let k = 1; k <= 5; k++) {
      const u0 = L * (0.1 + k * 0.14), u1 = u0 + L * 0.13;
      const h = hw(u1) * 0.82 * (top ? 1 : -1);
      lines.push({ pts: [[u0, 0, 0], [u1, h, 0]], mat: LEAF, useLn: true });
    }
    const cut = L * 0.55;
    return { g: bakeShape(part(-1, cut), 0.5), g2: bakeShape(part(cut, L + 1), 0.5), lines };
  }
  const WING_L = 188, WING_W = 38;
  const WING_T = leafHalf(WING_L, WING_W, true, false), WING_B = leafHalf(WING_L, WING_W, false, true);
  const WING2_L = 160, WING2_W = 33;
  const WING2_T = leafHalf(WING2_L, WING2_W, true, false), WING2_B = leafHalf(WING2_L, WING2_W, false, true);
  const CREST_L = 46, CREST_W = 11;
  const CREST_T = leafHalf(CREST_L, CREST_W, true, false), CREST_B = leafHalf(CREST_L, CREST_W, false, true);

  /* ---------- eye stamps (small gentle eyes) ---------- */
  const EYES_S = {
    open: ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'],
    openN: ['.k.', 'kwk', 'kkk', 'kbk', '.k.'],
    openF: ['kk', 'wk', 'kk', 'kk'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['kk', 'k.'],
    blink: ['kkkk', '.kk.'], blinkN: ['kkk', '.k.'], blinkF: ['kk'],
    sleep: ['k..k', '.kk.'], sleepN: ['k.k', '.k.'], sleepF: ['k.', '.k'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkbk', '.kkk.'],
    openN: ['.kk.', 'kwkk', 'kwkk', 'kkkk', 'kkbk', '.kk.'],
    openF: ['.k.', 'kwk', 'kkk', 'kkk', 'kbk', '.k.'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k.', 'k.k', 'k.k'],
    blink: ['.....', '.....', 'kkkkk', '.kkk.'], blinkN: ['....', '....', 'kkkk', '.kk.'], blinkF: ['...', '...', 'kkk', '.k.'],
    sleep: ['k...k', '.kkk.'], sleepN: ['k..k', '.kk.'], sleepF: ['k.k', '.k.'],
  };
  const EYEC = { k: '#1c140e', w: '#ffffff', b: '#5a3a22' };

  const SIZE = 0.935; // uniform scale to the Pokédex height (2.0 m ≈ 350 units at yaw 1.1)

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const hold = (+P.hold || 0) > 0.5;
    const flap = clamp(+P.flap || 0, -1, 1), nk = clamp(+P.neck || 0, -1, 1), mo = Math.max(clamp(+P.mouth || 0, 0, 1), hold ? 0.22 : 0);
    const step = +P.step || 0, walking = step !== 0;
    // body bob: lowest when the diagonal pairs swap (phase 0, π), highest mid-swing
    const bob = walking ? 1.5 - 3 * Math.abs(Math.cos(step)) : 0;
    const body = chain(T(0, bob - 16, 0), T(0, 160, 0), R(M3.rz(walking ? Math.sin(step * 2) * 0.012 : 0)), T(0, -160, 0));

    /* --- torso: barrel body, chest, rump; slightly lighter belly --- */
    const bellyMat = (s) => (s[1] < -0.6 ? C_BODY_L : C_BODY);
    prims.push(ellF(chain(body, T(-8, 168, 0), R(M3.rz(0.05))), [110, 71, 72], 1, 1, bellyMat));
    prims.push(ellF(chain(body, T(50, 184, 0), R(M3.rz(-0.35))), [56, 62, 60], 1, 1, bellyMat));

    /* --- tail: short thick taper --- */
    const TAILP = [[-100, 168], [-120, 161], [-139, 151], [-155, 140], [-167, 131]];
    TAILP.forEach(([x, y], i) => {
      const t = i / (TAILP.length - 1);
      const a = TAILP[Math.max(0, i - 1)], b = TAILP[Math.min(TAILP.length - 1, i + 1)];
      const sw = walking ? Math.sin(step) * 6 * t : 0;
      const half = i === TAILP.length - 1 ? 10 : 34;
      prims.push(E(inF(body, [x, y, sw]), M3.mul(body.L, M3.mul(axesAlong([b[0] - a[0], b[1] - a[1], 0], [0, 1, 0]), M3.diag(half, lerp(36, 9, t), lerp(36, 9, t)))), 2, 1, M_BODY));
    });
    anchors.tail = inF(body, [-174, 128, 0]);

    /* --- legs: four stout pillars, diagonal gait, three toenails each --- */
    const LEGS = [
      { x: 58, z: 44, ph: 0, id: 3, key: 'footFN' }, { x: 58, z: -44, ph: Math.PI, id: 4, key: 'footFF' },
      { x: -64, z: 44, ph: Math.PI, id: 5, key: 'footBN' }, { x: -64, z: -44, ph: 0, id: 6, key: 'footBF' },
    ];
    for (const lg of LEGS) {
      const ph = step + lg.ph;
      // a foot swings forward (lifted) while sin(ph) > 0, and is planted, sliding back, otherwise
      const swing = walking ? -Math.cos(ph) * 15 : 0, lift = walking ? Math.max(0, Math.sin(ph)) * 10 : 0;
      const hip = inF(body, [lg.x, 150, lg.z * 1.02]);
      const foot = [lg.x + swing, 13 + lift, lg.z * 1.12];
      prims.push(seg(hip, add(foot, [0, 6, 0]), 30, 30, [0, 0, 1], lg.id, lg.id, M_BODY, 1.08));
      prims.push(ellF(F(M3.I(), add(foot, [3, 0, 0])), [30, 14, 28], lg.id, lg.id, M_BODY));
      for (const ta of [-0.55, 0, 0.55]) {
        const c = add(foot, [3 + 28 * Math.cos(ta) * 0.93, -3.5, 26 * Math.sin(ta) * 0.93]);
        prims.push(ellF(F(M3.ry(-ta), c), [7, 7.2, 6.6], lg.id, lg.id, M_NAIL));
      }
      anchors[lg.key] = foot;
    }

    /* --- neck: smooth chain from the shoulders, curving up to the head --- */
    const nb = inF(body, [78, 206, 0]); // neck base
    const na = lerp(0, nk > 0 ? 0.38 : 1.2, Math.abs(nk)) * Math.sign(nk); // base bend
    const NECK = [];
    const segs = 6, NL = 118;
    let p = nb, dir = [Math.cos(1.02 + na * 0.9), Math.sin(1.02 + na * 0.9), 0];
    for (let i = 0; i <= segs; i++) {
      NECK.push(p);
      const bend = nk < 0 ? 0.07 - (-nk) * 0.19 : 0.07 - nk * 0.02;
      dir = M3.v(M3.rz(bend), dir);
      p = add(p, sc(dir, NL / segs));
    }
    for (let i = 0; i < NECK.length; i++) {
      const t = i / (NECK.length - 1);
      const a = NECK[Math.max(0, i - 1)], b = NECK[Math.min(NECK.length - 1, i + 1)];
      const r = lerp(31, 21, t);
      prims.push(E(NECK[i], M3.mul(axesAlong(sub(b, a), [0, 0, 1]), M3.diag(i === NECK.length - 1 ? 22 : 38, r, r * 0.98)), 7, 7, M_BODY));
    }
    const top = NECK[NECK.length - 1];
    const headPitch = nk < 0 ? -0.1 + nk * 0.35 : -0.1 - nk * 0.12;
    const head = chain(F(M3.I(), top), R(M3.rz(headPitch)), R(M3.ry(clamp(+P.look || 0, -1, 1) * 0.5)), T(20, 14, 0));

    /* --- head: cranium + snout, hinged jaw, mouth interior --- */
    const HR = [35, 30.5, 29];
    const cran = ellF(head, HR, 8, 8, M_BODY);
    prims.push(cran);
    prims.push(ellF(chain(head, T(26, -8, 0), R(M3.rz(-0.1))), [27, 19, 22.5], 8, 8, M_SNOUT));
    const hinge = [4, -16, 0];
    const jawF = chain(head, T(...hinge), R(M3.rz(-mo * 0.45)));
    prims.push(ellF(chain(jawF, T(22.5, -3.8, 0), R(M3.rz(0.05))), [24.5, 9.2, 19], 9, 9, (s) => (s[1] > 0.55 && mo > 0.05 ? code(TONGUE) : C_SNOUT)));
    if (mo > 0.03) {
      const mid = chain(head, T(...hinge), R(M3.rz(-mo * 0.22)));
      prims.push(ellF(chain(mid, T(22.5, -1.5, 0)), [22.5, 6 + mo * 3, 16.5], 10, 10, M_MOUTH));
    }
    // leaf crest on the head: three leaves fanning up and back
    const crestBase = inF(head, [-6, 24, 0]);
    const crestLeaves = [
      { d: nrm([-0.62, 0.78, 0]), roll: 0 },
      { d: nrm([-0.5, 0.62, 0.6]), roll: 0.9 },
      { d: nrm([-0.5, 0.62, -0.6]), roll: -0.9 },
    ];
    const headRot = head.L;
    for (const [i, cl] of crestLeaves.entries()) {
      const d = M3.v(headRot, cl.d);
      const up0 = M3.v(headRot, [0, 0, 1]);
      const A = axesAlong(d, up0);
      const Rl = M3.mul(A, M3.rx(cl.roll));
      const fold = 0.28;
      const id = 11;
      for (const [H, f, ln] of [[CREST_T, fold, CREST_T.lines], [CREST_B, -fold, null]]) {
        prims.push(PL(crestBase, M3.mul(Rl, M3.rx(f)), id, 11 + (i ? 1 : 0), H.g, 1.8, ln));
        prims.push(PL(crestBase, M3.mul(Rl, M3.rx(f)), id, 11 + (i ? 1 : 0), H.g2, 1.8, null));
      }
    }
    anchors.top = add(crestBase, sc(M3.v(headRot, crestLeaves[0].d), CREST_L * 0.95));

    /* --- banana bunch hanging around the throat under the chin --- */
    // bunch base: on the front of the neck just under the chin
    const nA = NECK[NECK.length - 2], nB = NECK[NECK.length - 1];
    const nDir = nrm(sub(nB, nA));
    const fwd = nrm([nDir[1], -nDir[0], 0]); // toward the front of the neck (in the x-y plane)
    const fb = add(add(nA, sc(sub(nB, nA), 0.55)), sc(fwd, 19));
    prims.push(E(fb, M3.mul(axesAlong(nDir, [0, 0, 1]), M3.diag(12, 12, 15)), 13, 13, M_STALK));
    const BAN = [[-1.25, 0], [-0.62, 0.3], [0, 0], [0.62, 0.3], [1.25, 0], [-0.3, 1], [0.3, 1], [1.95, 0.4], [-1.95, 0.4]];
    for (const [i, [a, lo]] of BAN.entries()) {
      if (hold && i === 2) continue; // the front banana is the one it plucked
      const out = nrm(add(sc(fwd, Math.cos(a)), [0, 0, Math.sin(a)]));
      const root = add(fb, add(sc(out, 9 - lo * 3), [0, -4 - lo * 6, 0]));
      const hang = nrm(add(sc(out, 0.32), [0, -1, 0]));
      const mid = add(root, sc(hang, 17));
      const tipD = nrm(add(sc(out, 0.75), [0, -0.8, 0]));
      const id = 14 + (i % 2);
      prims.push(seg(root, mid, 6, 6.3, [0, 1, 0], id, id, M_FRUIT, 1.3));
      prims.push(seg(mid, add(mid, sc(tipD, 15)), 5.4, 5.7, [0, 1, 0], id, id, M_FRUIT, 1.25));
    }
    anchors.fruit = add(fb, [0, -26, 0]);
    if (hold) {
      // a banana held crosswise in the mouth, curving slightly, tips sticking out on both sides
      // (held near the snout tip, where the snout is narrow, so both ends stick well out)
      const bc = inF(head, [42, -16.5 - mo * 4, 0]);
      const side = M3.v(head.L, [0, 0, 1]), upH = M3.v(head.L, [0, 1, 0]);
      for (const sd of [1, -1]) {
        const p0 = add(bc, sc(side, sd * 3)), pm = add(bc, sc(side, sd * 17)), p1 = add(add(bc, sc(side, sd * 31)), sc(upH, 5));
        prims.push(seg(p0, pm, 6.6, 6.8, upH, 15, 15, M_FRUIT, 1.25));
        prims.push(seg(pm, p1, 5.8, 6, upH, 15, 15, M_FRUIT, 1.2));
      }
      anchors.fruit = bc;
    }

    /* --- leaf wings on the back: two per side, V-folded plates with veins --- */
    const tips = [];
    for (const sd of [1, -1]) {
      for (const [k, W] of [[0, { at: [20, 228, 24], d: [0.5, 0.42, 1], roll: 0.62, T: WING_T, B: WING_B, L: WING_L }], [1, { at: [-38, 226, 24], d: [-0.72, 0.3, 1], roll: 0.55, T: WING2_T, B: WING2_B, L: WING2_L }]]) {
        const lift = flap * (k ? 0.62 : 0.7) + (walking ? Math.sin(step * 2 + k) * 0.03 : 0);
        let d = nrm(W.d);
        let A = axesAlong(d, [0, 1, 0]); // x along the leaf, y ≈ up (then used as the leaf plane's v)
        // leaf plane: u = along, v = across (toward the front edge), normal ≈ up; roll about the leaf axis
        const upN = [A[1], A[4], A[7]];
        const acr = [A[2], A[5], A[8]];
        let Lm = M3.cols(d, acr, upN);
        Lm = M3.mul(rotAxis(d, -W.roll), Lm);
        Lm = M3.mul(M3.rx(-lift), Lm);
        let at = W.at;
        if (sd < 0) { Lm = M3.mul(MIRZ, Lm); at = [at[0], at[1], -at[2]]; }
        const base = inF(body, at);
        const LL = M3.mul(body.L, Lm);
        const fold = 0.2;
        const g = sd > 0 ? 16 + k : 18 + k;
        for (const [H, f] of [[W.T, fold], [W.B, -fold]]) {
          prims.push(PL(base, M3.mul(LL, M3.rx(f)), g, g, H.g, 2, H.lines));
          prims.push(PL(base, M3.mul(LL, M3.rx(f)), g, g, H.g2, 2, null));
        }
        if (k === 0) tips.push(add(base, M3.v(LL, [W.L, 0, 0])));
      }
    }
    anchors.wingTipN = tips[0]; anchors.wingTipF = tips[1];

    /* --- eyes (stamps on the cranium) --- */
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : P.eyes === 'closed' ? 'sleep' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * 0.72, 0.1);
      const at = { prim: cran, p: add(cran.c, M3.v(cran.L, s)), s };
      stamps.push({ at, set: EYES_L, colors: EYEC, kind, near: 0.7, far: 0.4 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.mouth = inF(head, [50, -16, 0]);
    anchors.head = head.t;
    anchors.body = inF(body, [0, 170, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);

    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3, 10: 2, 11: 4, 12: 4, 13: 3, 14: 4, 15: 4, 16: 2, 17: 2, 18: 2, 19: 2 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 12, shadowDepth: 30,
    };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.8 ? EYES_L : EYES_S;
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
      const s = y * w, d = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.0, bw: 520, bh: 450, oy: 0.915 } };
})();
