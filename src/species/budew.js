/* ------------------------------------------------------------------
   Budew — the Bud Pokémon (0.2 m ≈ 35 units tall at scale 1).
   Roselia's baby form. A posable 3D model rendered straight to pixel
   art by the shared Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a tiny green Pokémon whose head is
   wrapped in a big closed flower bud: a pale yellow-green "hood" that
   frames the round green face like a bonnet and rises to a pointed tip
   leaning back, with faint darker seams where the bud's petals overlap.
   Big dark glossy eyes, a small smile, a small round green body and two
   stubby feet.
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
  const GREEN = 1, BUD = 2, SEAM = 3, MOUTH = 4, HEART = 5, POLLEN = 6, EYE = 7, GLINT = 8, FOOT = 9;
  const MAT = { GREEN, BUD, SEAM, MOUTH, HEART, POLLEN, EYE, GLINT, FOOT };
  const PAL = Creature.palette({
    [GREEN]:  { r: ['#347a2e', '#4a9a3c', '#64b64c', '#86d066', '#b2e890'], od: '#163e14', ol: '#2e6a26', ln: '#2c6424' },
    [FOOT]:   { r: ['#2c6a28', '#3e8834', '#56a444', '#74c05c', '#9ad882'], od: '#123612', ol: '#285e22', ln: '#245620' },
    [BUD]:    { r: ['#a2b448', '#c0d05c', '#dce878', '#eff5a4', '#fbfdd8'], od: '#4a5a1a', ol: '#82962e', ln: '#7a8c2a' },
    [SEAM]:   { r: ['#7c9a36', '#94b240', '#aac852', '#c2da6e', '#d8ea90'], od: '#3a4c14', ol: '#6c8428', ln: '#627a24' },
    [MOUTH]:  { r: ['#4a1a1c', '#662628', '#843636', '#a04a48', '#bc6460'], od: '#2c0c0e', ol: '#4a1a1c', ln: '#4a1a1c' },
    [HEART]:  { r: ['#c89a20', '#e4bc30', '#f6d84a', '#fdec84', '#fffbd0'], od: '#6a4c08', ol: '#a47c18', ln: '#9a7416' },
    [POLLEN]: { r: ['#d6b830', '#ecd246', '#fae466', '#fff29a', '#fffde0'], od: '#7a6214', ol: '#b09426', ln: '#b09426' },
    [EYE]:    { r: ['#0e1812', '#121e16', '#16241a', '#1e2e22', '#2a3c2e'], od: '#08100a', ol: '#0e1812', ln: '#0e1812' },
    [GLINT]:  { r: ['#e6ece8', '#f4f8f4', '#ffffff', '#ffffff', '#ffffff'], od: '#16241a', ol: '#16241a', ln: '#16241a' },
  });
  const GLOSSY = {};
  const C_GREEN = code(GREEN), C_BUD = code(BUD), C_BUD_D = code(BUD, -1), C_SEAM = code(SEAM), C_MOUTH = code(MOUTH), C_HEART = code(HEART), C_POLLEN = code(POLLEN);
  const C_EYE = code(EYE), C_GLINT = code(GLINT), C_FOOT = code(FOOT);
  const M_GREEN = () => C_GREEN, M_FOOT = () => C_FOOT, M_HEART = () => C_HEART, M_POLLEN = () => C_POLLEN, M_LINING = () => C_BUD_D;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);

  /* ---------- layout (design units, 2× the final size) ---------- */
  const BODY_C = [0, 14, 0], BODY_R = [9.6, 10.6, 10.2];
  const HEAD_C = [0.4, 35, 0], HEAD_R = [14, 14.2, 14.8];
  const HOOD_C = [-1.2, 38, 0], HOOD_R = [15.6, 17, 16.6];
  const SIZE = 0.5;
  // render-time state (set by render(): the renderer calls the material functions)
  let curScale = 1, MO = 0, EYEK = 'open', DECAL = false;
  const px1 = (r) => 0.55 / (curScale * SIZE * r); // about one pixel on a unit sphere of radius r

  // seams on the bud: meridians from the tip, thin at any scale
  function seam(s, n, ph, r) {
    const az = Math.atan2(s[2], s[0]);
    const k = (az / (2 * Math.PI)) * n + ph;
    const w = (Math.max(0.03, px1(r)) * n) / (2 * Math.PI) / Math.max(0.35, Math.sqrt(1 - s[1] * s[1]));
    return Math.abs(k - Math.round(k)) < w;
  }
  // hood: open in front (the face window) and underneath (the neck); darker seams toward the back
  const WIN_Z = 0.64, WIN_V = -0.14, WIN_H = 0.6;
  function hoodMat(s) {
    if (s[1] < -0.74) return 0;
    if (s[0] > 0) {
      const a = s[2] / WIN_Z, b = (s[1] - WIN_V) / WIN_H;
      if (a * a + b * b < 1) return 0;
    }
    if (s[0] < 0.62 && s[1] > -0.5 && seam(s, 5, 0.5, HOOD_R[0])) return C_SEAM;
    return C_BUD;
  }
  function tipMat(s) { return s[1] < 0.75 && seam(s, 5, 0.5, 7) ? C_SEAM : C_BUD; }

  // face: eyes (surface decals when the head is big on screen) and a small smile
  const EYE_AZ = 0.44, EYE_V = 0.1, EW = 0.22, EH = 0.3;
  function eyeDecal(s) {
    const az = Math.atan2(s[2], s[0]);
    for (const sd of [1, -1]) {
      const du = (az - sd * EYE_AZ) / EW, dv = (s[1] - EYE_V) / EH;
      if (du * du + dv * dv > 1.6) continue;
      const lw = Math.max(0.22, px1(HEAD_R[1]) * 1.3 / EH);
      if (EYEK === 'open') {
        if (du * du + dv * dv >= 1) continue;
        const gu = (du - 0.3) / 0.36, gv = (dv - 0.36) / 0.32;
        if (gu * gu + gv * gv < 1) return C_GLINT;
        const hu = (du + 0.28) / 0.2, hv = (dv + 0.5) / 0.16;
        if (hu * hu + hv * hv < 1) return code(EYE, 3);
        return C_EYE;
      }
      if (Math.abs(du) > 0.95) continue;
      if (EYEK === 'happy') { if (Math.abs(dv - (0.05 + 0.45 * (1 - du * du))) < lw) return C_EYE; }
      else if (EYEK === 'closed') { if (Math.abs(dv - (-0.1 - 0.4 * (1 - du * du))) < lw) return C_EYE; }
      else if (Math.abs(dv + 0.35 - 0.12 * du * du) < lw) return C_EYE; // blink: a flat lash line
    }
    return 0;
  }
  function faceMat(s) {
    if (DECAL && s[0] > 0.3) { const e = eyeDecal(s); if (e) return e; }
    if (s[0] > 0.6 && Math.abs(s[2]) < 0.32) {
      const u = s[2] / 0.32, v = s[1] + 0.36;
      if (MO > 0.05) {
        if (Math.abs(u) < 0.72 && v < 0.05 - 0.04 * u * u && v > -0.04 - 0.22 * MO * (1 - u * u)) return C_MOUTH;
      } else if (Math.abs(u) < 0.62) {
        if (Math.abs(v - 0.12 * u * u) < Math.max(0.045, px1(HEAD_R[1]))) return code(MOUTH, 1);
      }
    }
    return C_GREEN;
  }

  /* ---------- eye stamps for small sizes (k = eye, w = white glint) ---------- */
  const EYES_S = {
    open: ['kk', 'wk', 'kk'], openN: ['kk', 'wk', 'kk'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k', 'k'],
    closed: ['k.k', '.k.'], closedN: ['k.', '.k'], closedF: ['k'],
    blink: ['kk'], blinkN: ['kk'], blinkF: ['k'],
  };
  const EYES_M = {
    open: ['.kk.', 'wwkk', 'wkkk', 'kkkk', '.kk.'], openN: ['.k.', 'wkk', 'kkk', 'kkk', '.k.'], openF: ['k.', 'wk', 'kk', 'k.'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['....', 'kkkk', '.kk.'], blinkN: ['...', 'kkk', '.k.'], blinkF: ['..', 'kk'],
  };
  const EYEC = { k: '#16201a', w: '#ffffff' };

  const DEFAULT = { walk: 0, bloom: 0, eyes: 'open', mouth: 0, tilt: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 body, 2 head, 3 hood (+ tip), 4 lining, 5..7 petals, 8 heart, 10/11 feet, 20+ pollen
  Object.assign(PRI, { 2: 1, 3: 2, 4: -1, 5: 3, 6: 3, 7: 3, 8: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const wk = +P.walk || 0, bloom = clamp(+P.bloom || 0, 0, 1), tilt = clamp(+P.tilt || 0, -1, 1);
    const moving = wk !== 0;
    const bob = moving ? 1.6 * Math.abs(Math.sin(wk)) : 0;
    const roll = moving ? 0.08 * Math.sin(wk) : 0;
    const root = chain(T(0, bob, 0), T(0, 4, 0), R(M3.rx(roll)), T(0, -4, 0));

    // --- body
    prims.push(ellF(chain(root, T(...BODY_C)), BODY_R, 1, 1, M_GREEN));
    anchors.body = inF(root, BODY_C);

    // --- head (face) inside the hood; the head tilt pivots at the neck
    const neck = chain(root, T(0, 22, 0), R(M3.rx(-0.2 * tilt)), T(0, -22, 0));
    const head = chain(neck, T(...HEAD_C));
    const headPrim = ellF(head, HEAD_R, 2, 2, faceMat);
    prims.push(headPrim);
    const hood = chain(neck, T(...HOOD_C));
    prims.push(ellF(hood, HOOD_R, 3, 3, hoodMat));
    prims.push(ellF(hood, [HOOD_R[0] * 0.94, HOOD_R[1] * 0.94, HOOD_R[2] * 0.94], 4, 4, M_LINING));

    // --- bud tip: a tapering point leaning back; parts into three petals when blooming
    const tipBase = chain(hood, T(-1.2, HOOD_R[1] - 4.5, 0), R(M3.rz(0.3)));
    // lower bud swell (same group as the hood: no contour line)
    prims.push(ellF(chain(tipBase, T(0, 3.2, 0)), [8.6, 8.4, 8.6], 3, 3, tipMat));
    if (bloom < 0.04) {
      prims.push(ellF(chain(tipBase, T(-0.4, 10, 0), R(M3.rz(0.1))), [4.2, 7.2, 4.2], 3, 3, tipMat));
      anchors.top = inF(tipBase, [-1.6, 17, 0]);
    } else {
      // flower heart and four broad petals parting round it
      prims.push(ellF(chain(tipBase, T(0, 9 + 2.5 * bloom, 0)), [3.8 + 1.2 * bloom, 3.4 + bloom, 3.8 + 1.2 * bloom], 8, 8, M_HEART));
      for (let k = 0; k < 4; k++) {
        const az = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const pf = chain(tipBase, T(0, 7, 0), R(M3.ry(-az)), R(M3.rz(-0.12 - 0.5 * bloom)), T(2.6, 4.6, 0), R(M3.rz(0.28)));
        prims.push(ellF(pf, [2.2, 5.6, 5.4], 5 + (k % 3), 5 + (k % 3), tipMat));
      }
      anchors.top = inF(tipBase, [0, 16, 0]);
      // pollen specks puffing up over the open bud
      if (bloom > 0.3) {
        const n = 6, g = Math.min(1, (bloom - 0.3) / 0.4);
        for (let k = 0; k < n; k++) {
          const a = k * 2.4 + 0.6, f = ((k * 37) % 7) / 7;
          const rr = (2 + 7 * bloom) * (0.4 + 0.6 * f), hgt = 17 + 11 * bloom * (0.2 + 0.8 * (((k * 53) % 7) / 7));
          const c = add(inF(tipBase, [0, 0, 0]), [rr * Math.cos(a) - 1.5, hgt, rr * Math.sin(a)]);
          const r = (1 + 0.9 * (((k * 29) % 5) / 5)) * g;
          prims.push(ellF(T(...c), [r, r, r], 20 + k, 20 + k, M_POLLEN));
        }
      }
    }
    anchors.bud = add(anchors.top, [0, 3, 0]);
    anchors.head = head.t;

    // --- eyes (stamps at small sizes; render() swaps in surface decals when the head is big)
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = sph(sd * EYE_AZ, EYE_V);
      const at = { prim: headPrim, p: inF(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s };
      stamps.push({ at, set: EYES_M, colors: EYEC, kind, near: 0.72, far: 0.42 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.mouth = inF(head, [HEAD_R[0] * 0.92, -HEAD_R[1] * 0.38, 0]);

    // --- feet: stubby, alternate when walking
    [[1, 0], [-1, Math.PI]].forEach(([sd, ph], i) => {
      const lift = moving ? Math.max(0, Math.sin(wk + ph)) * 3 : 0;
      const sw = moving ? Math.cos(wk + ph) * 2.8 : 0;
      const c = [2.4 + sw, 3.4 + lift, sd * 5.8];
      prims.push(ellF(chain(T(...c), R(M3.ry(-sd * 0.25))), [5.8, 3.5, 4.6], 10 + i, 10 + i, M_FOOT));
      anchors[sd > 0 ? 'footN' : 'footF'] = [c[0], c[1] - 3.4, c[2]];
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
    const px = HEAD_R[0] * SIZE * curScale; // head radius in pixels
    DECAL = px >= 10.5;
    model.stamps = DECAL ? [] : model.eyeStamps;
    for (const st of model.eyeStamps) st.set = px >= 6 ? EYES_M : EYES_S;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.2, bw: 48, bh: 54, oy: 0.88 } };
})();
