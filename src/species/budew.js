/* ------------------------------------------------------------------
   Budew — the Bud Pokémon (0.2 m ≈ 35 units tall at scale 1).
   Roselia's baby form. A posable 3D model rendered straight to pixel
   art by the shared Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): one green pear-shaped bud. The lower bulb holds
   a round pale-yellow face (tiny vertical-dash eyes, a small smile) above
   a dark green four-lobed leaf collar; a leaf band wraps diagonally up the
   narrowing top and ends in a closed bud with a pale mint scalloped cap.
   Two tiny pointed yellow-green feet.
   Built at 2× in design units and scaled down (SIZE) at the end.

   Pose parameters (all optional):
     walk   radians   walk-cycle phase (feet alternate, waddle and bob);
                      continuous, 0 = standing
     bloom  0..1      the bud opens a little: the tip parts into three
                      petals round a yellow flower heart and pollen puffs up
     eyes   'open' (default) | 'blink' | 'happy' | 'closed'
     mouth  0..1      mouth open
     tilt   −1..1     curious head tilt (+ = toward the near side)
     side   −1..1     ≈ cos(yaw), passed by the game (accepted, unused)
   Anchors: top (bud tip), head (head centre), mouth, eyeN, eyeF, body,
   bud (above the bud tip, where the pollen rises), footN, footF.
------------------------------------------------------------------- */
const Budew = (() => {
  const { chain, T, R, code, sph } = Creature;

  // ---- materials
  const GREEN = 1, BUD = 2, SEAM = 3, MOUTH = 4, HEART = 5, POLLEN = 6, EYE = 7, GLINT = 8, FOOT = 9, FACE = 10, COLLAR = 11;
  const MAT = { GREEN, BUD, SEAM, MOUTH, HEART, POLLEN, EYE, GLINT, FOOT, FACE, COLLAR };
  const PAL = Creature.palette({
    // sampled from the official art: leaf green #89c768, pale yellow face #e9ea95, dark green collar #56844a,
    // pale mint bud cap #d8e9b6 (shadow #b4d398), olive feet #a5b759
    [GREEN]:  { r: ['#4a8a3c', '#68a94f', '#89c768', '#a6d888', '#c8eab0'], od: '#1a4216', ol: '#34702a', ln: '#3a7430' },
    [FOOT]:   { r: ['#6a7636', '#828e46', '#a5b759', '#bccc74', '#d4e09a'], od: '#343c10', ol: '#5a6424', ln: '#5a6424' },
    [BUD]:    { r: ['#94b87c', '#b4d398', '#cce2aa', '#dcecc2', '#eef8e0'], od: '#2e5a26', ol: '#5a8a4a', ln: '#4e7e40' },
    [SEAM]:   { r: ['#3a6a2a', '#487c34', '#58903e', '#6ca44e', '#84b866'], od: '#1a3a12', ol: '#305e22', ln: '#2a5a20' },
    [MOUTH]:  { r: ['#3a2a10', '#4a3616', '#5a441e', '#6a5428', '#7a6434'], od: '#2c1c08', ol: '#3a2a10', ln: '#3a2a10' },
    [HEART]:  { r: ['#c89a20', '#e4bc30', '#f6d84a', '#fdec84', '#fffbd0'], od: '#6a4c08', ol: '#a47c18', ln: '#9a7416' },
    [POLLEN]: { r: ['#d6b830', '#ecd246', '#fae466', '#fff29a', '#fffde0'], od: '#7a6214', ol: '#b09426', ln: '#b09426' },
    [EYE]:    { r: ['#1a1a0e', '#222212', '#2a2a16', '#34341c', '#404024'], od: '#0e0e06', ol: '#1a1a0e', ln: '#1a1a0e' },
    [GLINT]:  { r: ['#e6ece8', '#f4f8f4', '#ffffff', '#ffffff', '#ffffff'], od: '#16241a', ol: '#16241a', ln: '#16241a' },
    [FACE]:   { r: ['#bcc062', '#d2d676', '#e6e98e', '#f2f4ae', '#fcfcd8'], od: '#5a5a14', ol: '#8a9028', ln: '#7a8024' },
    [COLLAR]: { r: ['#345a2c', '#46723a', '#56844a', '#68985a', '#80ae70'], od: '#142c10', ol: '#264a1e', ln: '#20421a' },
  });
  const GLOSSY = {};
  const C_GREEN = code(GREEN), C_BUD = code(BUD), C_SEAM = code(SEAM), C_HEART = code(HEART), C_POLLEN = code(POLLEN);
  const C_EYE = code(EYE), C_FOOT = code(FOOT), C_FACE = code(FACE), C_COLLAR = code(COLLAR);
  const M_GREEN = () => C_GREEN, M_FOOT = () => C_FOOT, M_HEART = () => C_HEART, M_POLLEN = () => C_POLLEN, M_COLLAR = () => C_COLLAR, M_BUD = () => C_BUD;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.cols(sc(X, rx), sc(Y, l / 2), sc(Z, rz)), part, grp, mat);
  }

  /* ---------- layout (design units, 2× the final size) ---------- */
  const BODY_C = [0, 21, 0], BODY_R = [17.5, 18.5, 18];
  const HEAD_C = [8.5, 23, 0], HEAD_R = [11, 15, 15.5]; // the yellow face dome
  const TOP_C = [2, 60, -3], TOP_R = [9, 10.5, 9]; // closed bud at the top (leans to one side)
  const SIZE = 0.5;
  let curScale = 1, MO = 0, EYEK = 'open', DECAL = false;
  const px1 = (r) => 0.55 / (curScale * SIZE * r);

  // face: tiny vertical-dash eyes and a small smile (surface decals when big on screen)
  const EYE_AZ = 0.42, EYE_V = 0.22;
  function faceMat(s) {
    const az = Math.atan2(s[2], s[0]), v = s[1];
    { const w = 1.12 * Math.pow(Math.max(0, 1 - Math.max(0, v + 0.1) / 1.0), 0.45); if (Math.abs(az) > w || s[0] < -0.2) return 0; }
    if (s[0] < 0.1) return C_FACE;
    if (DECAL) {
      const lw = Math.max(0.06, px1(HEAD_R[2]) * 0.8);
      for (const sd of [1, -1]) {
        const du = az - sd * EYE_AZ;
        if (EYEK === 'open') { if (Math.abs(du) < lw && Math.abs(v - EYE_V) < 0.16) return C_EYE; }
        else if (Math.abs(du) < 0.16) {
          const u = du / 0.16;
          if (EYEK === 'happy' && Math.abs(v - EYE_V - 0.08 * (1 - u * u)) < lw) return C_EYE;
          if (EYEK === 'closed' && Math.abs(v - EYE_V + 0.08 * (1 - u * u)) < lw) return C_EYE;
          if (EYEK === 'blink' && Math.abs(v - EYE_V + 0.08) < lw) return C_EYE;
        }
      }
    }
    // smile: a small V/U curve under the eyes
    const u = az / 0.26, mv = v + 0.22;
    if (Math.abs(u) < 1) {
      if (MO > 0.05) { if (mv < 0.02 && mv > -0.04 - 0.2 * MO * (1 - u * u)) return code(MOUTH); }
      else if (Math.abs(mv + 0.07 * (1 - u * u)) < Math.max(0.04, px1(HEAD_R[1]) * 0.8)) return code(MOUTH);
    }
    return C_FACE;
  }
  // top bud: green bulb with a pale mint cap whose lower edge is scalloped
  function topMat(s) {
    const az = Math.atan2(s[2], s[0]);
    const edge = -0.05 + 0.14 * Math.abs(Math.cos(az * 2));
    if (s[1] > edge) {
      // two seam ticks on the cap front
      if (s[0] > 0.2 && s[1] > 0.3 && s[1] < 0.6 && Math.abs(Math.abs(s[2]) - 0.28) < Math.max(0.05, px1(TOP_R[0]))) return C_SEAM;
      return C_BUD;
    }
    return C_GREEN;
  }

  /* ---------- eye stamps for small sizes: vertical dashes ---------- */
  const EYES_S = {
    open: ['k', 'k'], openN: ['k', 'k'], openF: ['k'],
    happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k'],
    closed: ['k.k', '.k.'], closedN: ['k.', '.k'], closedF: ['k'],
    blink: ['kk'], blinkN: ['kk'], blinkF: ['k'],
  };
  const EYES_M = {
    open: ['k', 'k', 'k'], openN: ['k', 'k', 'k'], openF: ['k', 'k'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['kkk'], blinkN: ['kk'], blinkF: ['k'],
  };
  const EYEC = { k: '#1a1a0e', w: '#ffffff' };

  const DEFAULT = { walk: 0, bloom: 0, eyes: 'open', mouth: 0, tilt: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 body, 2 face, 3 wrap band, 4 top bud, 5..7 petals, 8 heart, 10/11 feet, 12..15 collar, 20+ pollen
  Object.assign(PRI, { 2: 2, 3: 1, 4: 2, 5: 3, 6: 3, 7: 3, 8: 2, 12: 3, 13: 3, 14: 3, 15: 3 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const wk = +P.walk || 0, bloom = clamp(+P.bloom || 0, 0, 1), tilt = clamp(+P.tilt || 0, -1, 1);
    const moving = wk !== 0;
    const bob = moving ? 1.6 * Math.abs(Math.sin(wk)) : 0;
    const roll = moving ? 0.08 * Math.sin(wk) : 0;
    const root = chain(T(0, bob, 0), T(0, 4, 0), R(M3.rx(roll)), T(0, -4, 0));

    // --- pear body: round lower bulb narrowing into the neck
    prims.push(ellF(chain(root, T(...BODY_C)), BODY_R, 1, 1, M_GREEN));
    prims.push(ellF(chain(root, T(-1, 36, 0)), [8.5, 7, 9], 1, 1, M_GREEN));
    anchors.body = inF(root, BODY_C);

    // --- face dome and the dark four-lobed collar under it (tilt rolls the upper body)
    const neck = chain(root, T(0, 24, 0), R(M3.rx(-0.15 * tilt)), T(0, -24, 0));
    const head = chain(neck, T(...HEAD_C));
    const headPrim = ellF(head, HEAD_R, 2, 2, faceMat);
    prims.push(headPrim);
    [[-0.55, 0], [-0.18, 1], [0.18, 2], [0.55, 3]].forEach(([az, i]) => {
      const c = [BODY_C[0] + 13.5 * Math.cos(az), 9.5 - 2 * Math.abs(az), 17.5 * Math.sin(az)];
      prims.push(ellF(chain(neck, T(...c), R(M3.ry(-az)), R(M3.rz(-0.25))), [5.6, 8.4, 8.4], 12 + i, 12 + i, M_COLLAR));
    });

    // --- thin neck curving up in an S (the wrapped leaf) to the leaning top bud
    prims.push(seg(inF(neck, [0, 36, 1]), inF(neck, [1, 46, 4]), 6, 6, 1, 1, M_GREEN));
    prims.push(seg(inF(neck, [1, 44, 4]), inF(neck, [2, 54, -1]), 5.4, 5.4, 3, 3, M_GREEN));
    prims.push(seg(inF(neck, [2, 28, 15]), inF(neck, [3, 43, 3]), 4.2, 3.8, 3, 3, M_GREEN));

    // --- top bud; parts into petals when blooming
    const tipBase = chain(neck, T(...TOP_C), R(M3.rx(-0.38)), R(M3.rz(-0.12)));
    prims.push(ellF(tipBase, TOP_R, 4, 4, topMat));
    if (bloom < 0.04) {
      anchors.top = inF(tipBase, [0, TOP_R[1], 0]);
    } else {
      prims.push(ellF(chain(tipBase, T(0, 7 + 2.5 * bloom, 0)), [3.8 + 1.2 * bloom, 3.4 + bloom, 3.8 + 1.2 * bloom], 8, 8, M_HEART));
      for (let k = 0; k < 4; k++) {
        const az = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const pf = chain(tipBase, T(0, 5, 0), R(M3.ry(-az)), R(M3.rz(-0.12 - 0.5 * bloom)), T(2.6, 4.6, 0), R(M3.rz(0.28)));
        prims.push(ellF(pf, [2.2, 5.6, 5.4], 5 + (k % 3), 5 + (k % 3), M_BUD));
      }
      anchors.top = inF(tipBase, [0, 14, 0]);
      if (bloom > 0.3) {
        const n = 6, g = Math.min(1, (bloom - 0.3) / 0.4);
        for (let k = 0; k < n; k++) {
          const a = k * 2.4 + 0.6, f = ((k * 37) % 7) / 7;
          const rr = (2 + 7 * bloom) * (0.4 + 0.6 * f), hgt = 15 + 11 * bloom * (0.2 + 0.8 * (((k * 53) % 7) / 7));
          const c = add(inF(tipBase, [0, 0, 0]), [rr * Math.cos(a) - 1.5, hgt, rr * Math.sin(a)]);
          const r = (1 + 0.9 * (((k * 29) % 5) / 5)) * g;
          prims.push(ellF(T(...c), [r, r, r], 20 + k, 20 + k, M_POLLEN));
        }
      }
    }
    anchors.bud = add(anchors.top, [0, 3, 0]);
    anchors.head = head.t;

    // --- eyes (stamps at small sizes; render() swaps in surface decals when the face is big)
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = sph(sd * EYE_AZ, EYE_V);
      const at = { prim: headPrim, p: inF(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s };
      stamps.push({ at, set: EYES_M, colors: EYEC, kind, near: 0.5, far: 0.2, minFacing: 0.08 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.mouth = inF(head, [HEAD_R[0] * 0.95, -HEAD_R[1] * 0.25, 0]);

    // --- feet: tiny pointed yellow-green nubs, alternate when walking
    [[1, 0], [-1, Math.PI]].forEach(([sd, ph], i) => {
      const lift = moving ? Math.max(0, Math.sin(wk + ph)) * 3 : 0;
      const sw = moving ? Math.cos(wk + ph) * 2.8 : 0;
      const c = [3 + sw, 3 + lift, sd * 8];
      prims.push(seg([c[0] - 1, c[1] + 4, c[2] * 0.85], [c[0] + 2, c[1] - 3, c[2] * 1.1], 3.2, 3.6, 10 + i, 10 + i, M_FOOT));
      anchors[sd > 0 ? 'footN' : 'footF'] = [c[0], 0, c[2]];
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps, eyeStamps: stamps, dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: GREEN, shadowSteps: 10 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    MO = clamp(+model.pose.mouth || 0, 0, 1);
    EYEK = ['open', 'happy', 'blink', 'closed'].includes(model.pose.eyes) ? model.pose.eyes : 'open';
    const px = HEAD_R[0] * SIZE * curScale; // face radius in pixels
    DECAL = px >= 10.5;
    model.stamps = DECAL ? [] : model.eyeStamps;
    for (const st of model.eyeStamps) st.set = px >= 5 ? EYES_M : EYES_S;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.2, bw: 48, bh: 54, oy: 0.88 } };
})();
