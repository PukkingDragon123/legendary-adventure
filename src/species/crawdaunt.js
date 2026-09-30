/* ------------------------------------------------------------------
   Crawdaunt — the Rogue Pokémon (1.1 m ≈ 192 units at scale 1).
   Corphish's evolution, built on the same rig (src/species/corphish.js).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a crimson carapace hood with a big yellow
   four-pointed star crest on top of the head, mean yellow eyes under heavy
   red brows, a cream face window and cream segmented belly; two huge red
   pincers (bigger than the head) on thick arms, six short red legs and a
   red fan tail.

   Pose params:
     walk   radians  tripod scuttle phase; exactly 0 = standing
     claw   0..1     0 = claws held low in front, closed; 1 = raised high
                     and snapped wide open (boss pose / Crabhammer)
     mouth  0..1     small mouth opens (tongue shows)
     eyes   'open' (default, glaring) | 'happy' | 'closed' | 'angry' | 'dizzy'
     side   −1..1    camera side from the game (unused; the model is symmetric)
     squash 0..1, tilt (radians roll) — as Corphish
   Anchors: top (star tip), head, mouth, body, eyeN, eyeF, clawTipN, clawTipF.
------------------------------------------------------------------- */
const Crawdaunt = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const SHELL = 1, CREAM = 2, EYE = 3, INNER = 4, MOUTH = 5, TONGUE = 6, STAR = 7;
  const MAT = { SHELL, CREAM, EYE, INNER, MOUTH, TONGUE, STAR };
  const PAL = Creature.palette({
    [SHELL]: { r: ['#6a1216', '#921e20', '#bc302c', '#dc4c3e', '#f47a62'], od: '#3a0608', ol: '#6e1414', ln: '#6a1214' },
    [CREAM]: { r: ['#b09470', '#d2b88e', '#ecd6ac', '#f8eaca', '#fff8e6'], od: '#5a3a1e', ol: '#8a6844', ln: '#9a7a54' },
    [EYE]: { r: ['#c08a10', '#e0b020', '#f8d840', '#fff080', '#fffac0'], od: '#3a1008', ol: '#5c2010', ln: '#3a1008' },
    [INNER]: { r: ['#b09470', '#d2b88e', '#ecd6ac', '#f8eaca', '#fff8e6'], od: '#5a3a1e', ol: '#8a6844', ln: '#9a7a54' },
    [STAR]: { r: ['#b87410', '#dc9c1c', '#f6c634', '#ffe070', '#fff4b4'], od: '#6a3a06', ol: '#a0620e', ln: '#a8680e' },
    [MOUTH]: { r: ['#3e0c12', '#56141a', '#6e1e24', '#88282c', '#a03836'], od: '#2a0608', ol: '#3a0c10', ln: '#3a0c10' },
    [TONGUE]: { r: ['#b0404a', '#cc5a60', '#e57a78', '#f59a92', '#ffc0b4'], od: '#5a1018', ol: '#7a1c24', ln: '#8a2830' },
  });
  const GLOSSY = { [SHELL]: 1, [STAR]: 1 };
  const NO_DOTS = [{}].slice(1); // empty, but with the elements kind of Mudkip's dot list
  const C_SHELL = code(SHELL), C_SHELL_D = code(SHELL, -1), C_CREAM = code(CREAM), C_EYE = code(EYE);
  const C_INNER = code(INNER), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const M_SHELL = () => C_SHELL, M_CREAM = () => C_CREAM, M_EYE = () => C_EYE, M_LINING = () => C_SHELL_D;

  // ---- vector helpers
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  const inF = (f, p) => add(f.t, M3.v(f.L, p)); // local point → parent space

  // Primitives, stamps and the model reuse Mudkip's exact object layouts, so the shared
  // renderer's inline caches see no new hidden classes (no deopts when species interleave).
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 along its local y axis (model-space points)
  function seg(p0, p1, rx, rz, part, grp, mat) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  // ---- body geometry (body frame: origin on the ground, before squash/tilt)
  const HOOD_C = [-2, 54, 0], HOOD_R = [23, 30, 27];
  const MUZ_C = [7, 52, 0], MUZ_R = [16.5, 13.5, 19];
  const BEL = [
    { c: [6, 41, 0], r: [16, 12.5, 19.5] },
    { c: [4.5, 31.5, 0], r: [15, 11.5, 18] },
    { c: [3, 24.5, 0], r: [13.5, 8, 15] },
  ];
  const LOW_C = [-4, 29, 0], LOW_R = [18, 11, 18.5]; // lower body under the hood rim
  const LAM_Y = 65, LAM_K = 0.66; // Λ-shaped top edge of the cream face: y < LAM_Y − LAM_K·|z|
  const RIM_Y = 29; // hood rim height
  // the window follows the cream shells' outlines (so it never shows the hood lining)
  const SHELLS = [{ c: MUZ_C, r: MUZ_R }, ...BEL];
  const SH_Y = SHELLS.map((b) => b.c[1]), SH_RY = SHELLS.map((b) => 1 / b.r[1]), SH_RZ = SHELLS.map((b) => 1 / b.r[2]);
  function inWindow(x, y, z) {
    if (x <= 0 || y >= LAM_Y - LAM_K * Math.abs(z)) return false;
    for (let i = 0; i < 4; i++) {
      const dy = (y - SH_Y[i]) * SH_RY[i], dz = z * SH_RZ[i];
      if (dy * dy + dz * dz < 0.8) return true;
    }
    return false;
  }
  const hoodMat = (s) => {
    const x = HOOD_C[0] + HOOD_R[0] * s[0], y = HOOD_C[1] + HOOD_R[1] * s[1], z = HOOD_R[2] * s[2];
    return y < RIM_Y || inWindow(x, y, z) ? 0 : C_SHELL;
  };
  const lowMat = (s) => (s[1] < 0.3 ? C_CREAM : C_SHELL);

  // yellow four-pointed star crest: two crossed star plates (frontal + sagittal) so it reads from every side
  const C_STAR = code(STAR), C_STAR_D = code(STAR, -1);
  const STAR_C = [-3, 82, 0], STAR_R = 29, STAR_IN = 0.36;
  const STAR_G = bakeShape({
    bb: [-STAR_R - 1, -STAR_R - 1, STAR_R + 1, STAR_R + 1],
    test(u, v) {
      const r = Math.hypot(u, v), a = Math.atan2(v, u);
      // 4 points (up, down, left, right), concave sides
      const k = Math.abs(Math.cos(2 * a));
      const lim = STAR_R * (STAR_IN + (1 - STAR_IN) * Math.pow(k, 2.4));
      if (r > lim) return 0;
      return r > lim - 2.2 && r > 5 ? C_STAR_D : C_STAR;
    },
  });

  // ---- claw geometry (claw frame: origin at the wrist, x' = toward the tip,
  //      y' = back of the claw (red upper jaw side), z' = across the broad cream palm)
  // The bite surface is a steeply tilted plane s1 = Y0 − KT·s0 (unit-sphere space): the red
  // upper jaw is a wedge over the top and back, hinged low at the back, so the pincer
  // opens like a mouth at the front-top of the claw. The border zigzags (big teeth).
  const CA = 22.5, CB = 11.8, CC = 16; // half-length, half-depth (jaw axis), half-width
  const Y0 = -0.45, KT = 1.4, ZA = 0.5, ZN = 6, ZPH = 0.5;
  const BN = nrm([KT, 1, 0]), BU = nrm([1, -KT, 0]), BOFF = Y0 / Math.hypot(1, KT);
  const BCEN = sc(BN, BOFF);
  const bite = (s) => {
    const ph = (Math.atan2(s[2], (s[0] - BCEN[0]) * BU[0] + (s[1] - BCEN[1]) * BU[1]) / (2 * Math.PI)) * ZN + ZPH;
    return Y0 - KT * s[0] + ZA * (Math.abs(ph - Math.floor(ph + 0.5)) * 2 - 0.5);
  };
  const lowerMat = (s) => (s[1] < bite(s) ? C_SHELL : 0);
  const upperMat = (s) => (s[1] >= bite(s) ? C_SHELL : 0);
  // bite faces: discs in the tilted plane (only seen when the pincer is open)
  const BRHO = Math.sqrt(1 - BOFF * BOFF) * 0.92, BS = 10;
  const BITE_G = bakeShape({
    bb: [-BRHO * BS - 0.5, -BRHO * BS - 0.5, BRHO * BS + 0.5, BRHO * BS + 0.5],
    test: (u, v) => (u * u + v * v <= (BRHO * BS) ** 2 ? C_INNER : 0),
  });
  const BITE_L = M3.mul(M3.diag(CA, CB, CC), M3.mul(M3.cols(BU, [0, 0, 1], BN), M3.diag(1 / BS, 1 / BS, 1 / BS)));
  const BITE_C = add([CA, 0, 0], M3.v(M3.diag(CA, CB, CC), BCEN));
  const onBite = (k) => add([CA, 0, 0], mul3([CA, CB, CC], add(BCEN, sc(BU, k * Math.sqrt(1 - BOFF * BOFF)))));
  const HINGE = onBite(-0.97); // lowest back point of the bite loop
  const TIP = onBite(0.97); // front point of the bite loop (where the pincer tips meet)
  // arm keyframes (near side, body frame): wrist position, claw axis, back-of-claw direction
  const ARM_K = [
    { a: -0.5, W: [12, 32, 26], X: [1, 0.35, -0.15], Y: [-0.8, 0.9, 0.1] },
    { a: 0, W: [-8, 55, 34], X: [0.2, 1, 0.3], Y: [-1, 0.15, -0.35] },
    { a: 1, W: [-6, 66, 27], X: [0.05, 1, 0.12], Y: [-1, 0.05, -0.3] },
  ];
  function armKey(a) {
    const i = a <= 0 ? 0 : 1;
    const k0 = ARM_K[i], k1 = ARM_K[i + 1];
    const t = Math.max(0, Math.min(1, (a - k0.a) / (k1.a - k0.a)));
    return { W: lerp3(k0.W, k1.W, t), X: nrm(lerp3(k0.X, k1.X, t)), Y: lerp3(k0.Y, k1.Y, t) };
  }

  // ---- eyes
  const EYE_AZ = 0.6, EYE_V = 0.44, EYE_R = [6.8, 8.6, 4];
  const lidMat = (s) => (s[1] > 0.42 - 0.62 * s[0] ? C_SHELL : 0);

  // ---- legs: hips in the body frame, feet on the ground (tripod gait phases)
  const LEGS = [
    { hip: [9, 25, 11], foot: [25, 0, 21], ph: 0 },
    { hip: [-2, 24, 14], foot: [1, 0, 32], ph: Math.PI },
    { hip: [-12, 25, 11], foot: [-24, 0, 26], ph: 0 },
  ];
  const L_UP = 8, L_LO = 23;

  // ---- tail
  const TAIL = [
    { c: [-18, 27, 0], r: [7, 6, 11], a: -0.3 },
    { c: [-25, 23, 0], r: [6, 5, 9.5], a: -0.42 },
    { c: [-31, 19.5, 0], r: [5, 4.2, 8.5], a: -0.55 },
    { c: [-36.5, 16, 0], r: [6.5, 2.4, 11], a: -0.7 },
  ];

  // contour-line priorities per group (integer-keyed object like Mudkip's)
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 2, 3: 4, 4: 3, 5: 2, 6: 1, 10: 5, 11: 5, 12: 6, 13: 6, 60: 1, 62: -1, 63: -2 });
  for (const b of [20, 30]) { PRI[b] = 3; PRI[b + 1] = 4; PRI[b + 2] = 5; PRI[b + 3] = 6; }
  for (let i = 40; i < 46; i++) PRI[i] = 1;

  const SIZE = 1.62;
  const DEFAULT = { claw: 0, walk: 0, eyes: 'open', squash: 0, tilt: 0, mouth: 0, side: 1 };
  const CLAW_S = 1.3;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const sq = P.squash;
    const root = F(M3.diag(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45), [0, 0, 0]);
    // body roll about the forward axis (sideways shuffle); legs are IK so the feet stay planted
    const body = chain(root, T(0, 40, 0), R(M3.rx(-P.tilt)), T(0, -40, 0));
    const hood = chain(body, T(...HOOD_C));

    // --- eyes first (front-most), white eyeballs bulging from the hood; pupils are stamps
    const eyeKind = P.eyes;
    const closed = eyeKind === 'happy' || eyeKind === 'closed';
    for (const side of [1, -1]) {
      const s0 = Creature.sph(side * EYE_AZ, EYE_V);
      const pS = add(HOOD_C, mul3(HOOD_R, s0));
      const n = nrm([s0[0] / HOOD_R[0], s0[1] / HOOD_R[1], s0[2] / HOOD_R[2]]);
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = sc(cross(ye, n), side); // x_e points forward/inward for both eyes
      const cLoc = sub(pS, sc(n, 1.0));
      const ax = M3.cols(xe, ye, n);
      const id = side > 0 ? 10 : 11;
      const eyePrim = E(inF(body, cLoc), M3.mul(body.L, M3.mul(ax, M3.diag(EYE_R[0], EYE_R[1], EYE_R[2]))), id, closed ? 2 : id, closed ? M_SHELL : M_EYE);
      prims.push(eyePrim);
      if (eyeKind === 'angry' || eyeKind === 'open') prims.push(E(eyePrim.c, M3.mul(body.L, M3.mul(ax, M3.diag(EYE_R[0] * 1.12, EYE_R[1] * 1.1, EYE_R[2] * 1.15))), id + 2, id + 2, lidMat));
      let sP;
      if (closed) sP = [0, 0.05, 1];
      else if (eyeKind === 'angry' || eyeKind === 'open') sP = [0.3, -0.25, 1];
      else if (eyeKind === 'dizzy') sP = [0, 0, 1];
      else sP = [0.28, -0.08, 1];
      sP = nrm(sP);
      const at = { prim: eyePrim, p: add(eyePrim.c, M3.v(eyePrim.L, sP)), s: sP };
      stamps.push({ at, set: EYE_SETS[eyeKind] || EYE_SETS.open, colors: EYEC, kind: 'open' });
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    // --- cream face (muzzle, with the Λ top edge and the optional mouth) and belly shells
    const mouthH = P.mouth;
    const hh = 0.13 * mouthH + 0.03, vc = -0.53 + hh;
    const muzMat = (s) => {
      if (MUZ_C[1] + MUZ_R[1] * s[1] >= LAM_Y - LAM_K * Math.abs(MUZ_R[2] * s[2])) return 0;
      if (mouthH > 0.02 && s[0] > 0) {
        // small mouth just above the smile line, opening upward
        const dv = (s[1] - vc) / hh, az = Math.atan2(s[2], s[0]) / 0.24;
        if (dv * dv + az * az < 1) return dv < -0.25 && mouthH > 0.4 ? C_TONGUE : C_MOUTH;
      }
      return C_CREAM;
    };
    prims.push(ellF(chain(body, T(...MUZ_C)), MUZ_R, 3, 3, muzMat));
    BEL.forEach((b, i) => prims.push(ellF(chain(body, T(...b.c)), b.r, 4 + i, 4 + i, M_CREAM)));

    // --- hood (red carapace) with the Λ window, its lining and the lower body
    const hoodPrim = ellF(hood, HOOD_R, 1, 2, hoodMat);
    prims.push(hoodPrim);
    // star crest: frontal plate (u = z, v = y) and a slimmer sagittal plate (u = x, v = y)
    prims.push(PL(inF(body, STAR_C), M3.mul(body.L, M3.cols([0, 0, 1], [0, 1, 0], [-1, 0, 0])), 8, 8, STAR_G, 2.4));
    prims.push(PL(inF(body, STAR_C), M3.mul(body.L, M3.cols([0.8, 0, 0], [0, 1, 0], [0, 0, 1])), 9, 8, STAR_G, 2.4));

    // --- claws
    for (const side of [1, -1]) {
      const cl = Math.max(0, Math.min(1, +P.claw || 0));
      const arm = 0.8 * cl, open = Math.min(1, cl * 1.25);
      const k = armKey(arm);
      const W = [k.W[0], k.W[1], k.W[2] * side], X = [k.X[0], k.X[1], k.X[2] * side];
      let Y = [k.Y[0], k.Y[1], k.Y[2] * side];
      Y = nrm(sub(Y, sc(X, dot(Y, X))));
      const CF = chain(body, F(M3.cols(X, Y, cross(X, Y)), W), Creature.S(CLAW_S, CLAW_S, CLAW_S));
      const base = side > 0 ? 20 : 30;
      // lower (cream) jaw + its bite face
      prims.push(ellF(chain(CF, T(CA, 0, 0)), [CA, CB, CC], base + 2, base + 2, lowerMat));
      if (open > 0.01) prims.push(PL(inF(CF, BITE_C), M3.mul(CF.L, BITE_L), base + 2, base + 2, BITE_G, 1.2));
      // upper (red) jaw hinged at the back
      const UF = chain(CF, T(...HINGE), R(M3.rz(open * 0.72)), T(-HINGE[0], -HINGE[1], 0));
      prims.push(ellF(chain(UF, T(CA, 0, 0)), [CA, CB, CC], base + 3, base + 3, upperMat));
      if (open > 0.01) prims.push(PL(inF(UF, BITE_C), M3.mul(UF.L, BITE_L), base + 3, base + 3, BITE_G, 1.2));
      // wrist knob and arm from the shoulder to the wrist
      prims.push(ellF(chain(CF, T(0.5, -0.5, 0)), [4.4, 4.4, 4.4], base + 1, base + 1, M_SHELL));
      prims.push(seg(inF(body, [-3, 46, 14 * side]), inF(CF, [-2, 0, 0]), 5.4, 5.4, base, base, M_SHELL));
      anchors[side > 0 ? 'clawTipN' : 'clawTipF'] = sc(add(inF(CF, TIP), inF(UF, TIP)), 0.5);
    }

    prims.push(ellF(hood, sc(HOOD_R, 0.9), 2, 1, M_LINING));
    prims.push(ellF(chain(body, T(...LOW_C)), LOW_R, 2, 1, lowMat));

    // --- legs (2-bone IK: hips follow the body, feet stay on the ground; tripod walk cycle)
    let li = 0;
    for (const side of [1, -1])
      for (const lg of LEGS) {
        // tripod gait for a sideways scuttle: lifted feet swing along z (and a little along x)
        const ph = P.walk + lg.ph + (side > 0 ? 0 : Math.PI);
        const lift = Math.max(0, Math.sin(ph)) * 5;
        const swing = Math.cos(ph) * 4.5;
        const hip = inF(body, [lg.hip[0], lg.hip[1], lg.hip[2] * side]);
        const foot = [lg.foot[0] + swing * 0.35, lift, lg.foot[2] * side * (1 + sq * 0.3) + swing];
        const d = sub(foot, hip), dl = len3(d);
        const dir = sc(d, 1 / dl);
        const a = Math.min(dl, (L_UP * L_UP - L_LO * L_LO + dl * dl) / (2 * dl));
        const h = Math.sqrt(Math.max(0, L_UP * L_UP - a * a));
        const out = nrm([foot[0] - hip[0], 0, foot[2] - hip[2]]);
        let bend = add([0, 1.3, 0], out);
        bend = nrm(sub(bend, sc(dir, dot(bend, dir))));
        const knee = add(add(hip, sc(dir, a)), sc(bend, h));
        const id = 40 + li++;
        // talon: fat rounded knee, curving outward, tapering to a sharp tip on the ground
        const kd = sub(foot, knee);
        const mid = add(add(knee, sc(kd, 0.5)), sc(out, 2));
        prims.push(seg(sub(knee, sc(kd, 0.18)), add(mid, sc(sub(foot, mid), 0.35)), 5.6, 5.2, id, id, M_SHELL));
        prims.push(seg(add(knee, sc(sub(mid, knee), 0.6)), foot, 2.6, 2.5, id, id, M_SHELL));
        prims.push(seg(hip, add(knee, sc(kd, 0.1)), 3.8, 3.8, id, id, M_SHELL));
      }

    // --- tail (flattened overlapping segments trailing back, ending in a fan)
    TAIL.forEach((t, i) => prims.push(ellF(chain(body, T(...t.c), R(M3.rz(t.a))), t.r, 60 + i, 60 + i, M_SHELL)));

    anchors.top = inF(body, [STAR_C[0], STAR_C[1] + STAR_R, 0]); // star crest tip
    anchors.body = inF(body, [4, 34, 0]);
    anchors.head = inF(body, HOOD_C);
    anchors.mouth = inF(body, [MUZ_C[0] + MUZ_R[0] * 0.85, MUZ_C[1] - MUZ_R[1] * 0.5, 0]);

    // uniform scale to the Pokédex height (1.1 m ≈ 192 px silhouette at yaw 1.1)
    for (const p of prims) { p.c = sc(p.c, SIZE); p.L = p.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const key in anchors) anchors[key] = sc(anchors[key], SIZE);
    return { prims, anchors, pose: P, headPrim: hoodPrim, stamps, dots: NO_DOTS, pri: PRI, glossy: GLOSSY, baseMat: SHELL, shadowSteps: 16 };
  }

  /* ---------- eye stamps (pupils and closed-eye marks) ----------
     Every set uses Mudkip's exact key layout (the renderer looks glyphs up by name);
     each expression puts its glyphs in the open/openN/openF slots and is drawn as kind 'open'.
     k = pupil, b = dark lid line, w = white. */
  const stampSet = (o, oN, oF) => ({ open: o, openN: oN, openF: oF, happy: o, happyN: oN, happyF: oF, blink: o, blinkN: oN, blinkF: oF, sleep: o, sleepN: oN, sleepF: oF });
  const EYE_SETS = {
    open: stampSet(['kk', 'kk'], ['kk', 'kk'], ['k', 'k']),
    angry: stampSet(['kk', 'kk'], ['kk', 'kk'], ['k', 'k']),
    dizzy: stampSet(['.kkk.', 'k...k', 'k.k.k', 'k..kk', '.k...'], ['.kkk.', 'k...k', 'k.k.k', 'k..kk', '.k...'], ['.kk', 'k.k', 'kkk']),
    happy: stampSet(['..bb..', '.b..b.', 'b....b'], ['.bb.', 'b..b', 'b..b'], ['.b', 'b.', 'b.']),
    closed: stampSet(['......', '......', 'bbbbbb', '.bbbb.'], ['....', '....', 'bbbb', '.bb.'], ['..', '..', 'bb', '.b']),
  };
  const EYEC = { k: '#1c1012', w: '#ffffff', b: '#3a0608' };

  const render = (model, opt) => Creature.render(model, opt);

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 250, bh: 250, oy: 0.9 } };
})();
