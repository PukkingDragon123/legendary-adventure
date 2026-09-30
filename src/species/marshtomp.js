/* ------------------------------------------------------------------
   Marshtomp — the Mud Fish Pokémon (0.7 m ≈ 122 units tall at scale 1,
   head crest included). Mudkip's first evolution, in the same visual
   language as src/mudkip.js (glossy blue skin, orange cheek gills).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a light-blue amphibian standing upright on short,
   thick legs with a slight forward lean. A big, broad head merges straight
   into an egg-shaped body; a wide smiling mouth runs from cheek to cheek,
   with a pale-blue chin that continues into a big pale-blue belly. Small
   orange-brown eyes sit high on the face, under a large dark blue-grey
   mud crest that sweeps back over the head. Pointed orange gills stick out
   behind the mouth corners. Thick arms with three stubby fingers, big
   three-toed feet, and a short thick tail carrying a big dark fan fin.

   Pose params:
     walk    radians  walk-cycle phase (legs swing with sin(walk), arms
                      counter-swing, body bobs and rocks); exactly 0 = standing
     crouch  0..1     crouched, ready to pounce: knees bend, hips drop,
                      body leans forward, arms reach forward and down
     mouth   0..1     mouth open (the wide smile opens; tongue shows)
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    ≈ 3·cos(yaw), passed by the game: the head crest and the
                      tail fin turn a little toward the camera so they read
   Anchors: top (crest peak), head, mouth, eyeN, eyeF, body, belly, crest,
            handN, handF, footN, footF, tail (tail root), tailTip (fin tip).
------------------------------------------------------------------- */
const Marshtomp = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, BELLY = 2, FIN = 3, GILL = 4, MOUTH = 5, TONGUE = 6, LINE = 7, PEACH = 8;
  const MAT = { BODY, BELLY, FIN, GILL, MOUTH, TONGUE, LINE, PEACH };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#3a8e9c', '#52b0bc', '#7ccdd4', '#a8e4e6', '#e0faf8'], od: '#1a4c5a', ol: '#2e7482', ln: '#2e7280' },
    [BELLY]:  { r: ['#88c0c4', '#a8dcdc', '#caeeec', '#e4f8f6', '#fafffe'], od: '#245a64', ol: '#4a8c94', ln: '#5e9aa2' },
    [PEACH]:  { r: ['#b8603a', '#d67c4e', '#ee9a68', '#fcb888', '#ffd8b4'], od: '#6a2c14', ol: '#9a4a28', ln: '#a8522e' },
    [FIN]:    { r: ['#1e2630', '#2a3440', '#3a4656', '#52606f', '#76849a'], od: '#0c1016', ol: '#1a2028', ln: '#1a222c' },
    [GILL]:   { r: ['#b8461a', '#d96520', '#f28a2a', '#ffae45', '#ffd584'], od: '#6a2010', ol: '#9b3514', ln: '#a8401a' },
    [MOUTH]:  { r: ['#6e1a2a', '#8e2a38', '#ae3e4a', '#c85460', '#e07478'], od: '#420c18', ol: '#661626', ln: '#661626' },
    [TONGUE]: { r: ['#c8505a', '#e06a6c', '#f58c84', '#ffaea0', '#ffcfc2'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
    [LINE]:   { r: ['#1c4a80', '#22548e', '#2a5e9a', '#3268a4', '#3a72ae'], od: '#173f72', ol: '#2c68a4', ln: '#1c4a80' },
  });
  const GLOSSY = { [BODY]: 1, [FIN]: 1, [GILL]: 1 };
  const C_BODY = code(BODY), C_BELLY = code(BELLY), C_PEACH = code(PEACH), C_FIN = code(FIN), C_GILL = code(GILL), C_GILL_L = code(GILL, 1);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_LINE = code(LINE);
  const M_BODY = () => C_BODY;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid centred at c with (unit) local axes X, Y, Z and radii r
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  // orthonormal frame with Y along d and X as close as possible to `fwd`
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  // ellipsoid spanning p0 → p1 along its local y axis (x kept close to `fwd`)
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, l / 2, rz], part, grp, mat);
  }

  let curScale = 1;

  /* ---------- torso (torso frame: origin at the hip centre, y up the spine) ----------
     an egg: two half-ellipsoids sharing the equator (smooth join), round belly below */
  const EQ = 17, TR = [24, 23, 24.5], TR_UP = 29;
  // big pale belly: the front of the torso, an oval that narrows toward the sides and the chest
  const bellyAt = (x, y, z) => { const zz = z / 24; return x > 3 + 18 * zz * zz + 0.12 * Math.max(0, y - 36); };
  // orange belly oval on the front of the torso (official art), pale cyan chin above
  const patch = (s, ry) => { const zz = s[2] / 0.5, yy = (s[1] * ry + 1) / 15; return s[0] > 0.3 && zz * zz + yy * yy < 1; };
  const lowMat = (s) => (s[1] > 0.02 ? 0 : patch(s, TR[1]) ? C_PEACH : C_BODY);
  const upMat = (s) => (s[1] < -0.02 ? 0 : patch(s, TR_UP) ? C_PEACH : bellyAt(TR[0] * s[0], EQ + TR_UP * s[1], TR[2] * s[2]) && s[1] > 0.75 ? C_BELLY : C_BODY);

  /* ---------- head (head frame: origin at the head centre) ---------- */
  const HR = [26.5, 21, 30];
  const EYE_AZ = 0.44, EYE_V = 0.42;
  const mouthV = (az) => { const k = az / 1.2; return -0.22 + 0.17 * k * k; }; // smile line, corners up
  function headMat(mo) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      if (a < 1.34) {
        const vm = mouthV(az);
        const h = mo * 0.4 * Math.max(0, 1 - (az / 1.2) ** 2);
        if (h > 0.03 && v < vm && v > vm - h) return v < vm - h * 0.5 && a < 0.85 ? C_TONGUE : C_MOUTH;
        if (h <= 0.03 && a < 1.22) {
          const lw = Math.max(0.028, 0.55 / (curScale * HR[1]));
          if (Math.abs(v - vm) < lw) return C_LINE;
        }
        if (v < vm - h) return C_BELLY; // pale chin
      }
      // round orange cheek patches behind the mouth corners
      { const ca = (a - 1.2) / 0.34, cv = (v + 0.02) / 0.4; if (ca * ca + cv * cv < 1) return C_PEACH; }
      return C_BODY;
    };
  }

  /* ---------- plates ---------- */
  // head crest in the head's mid plane (u = forward, v = up, head-centre units): rises from the
  // forehead between the eyes, peaks toward the back and drops steeply to the nape
  const CREST_P = [[17.5, 11], [18, 19], [13, 27], [6, 34], [-2, 41], [-10, 48], [-17, 53], [-20, 50], [-23, 38], [-25.5, 22], [-24, 8], [-10, 4], [6, 6]];
  const CREST_RIDGE = Shape2D.catmull([[12, 21], [4, 30], [-5, 38], [-12, 46], [-17, 51]], false, 5);
  const CREST_G = bakeShape(Shape2D.poly(CREST_P, C_FIN, 8));
  // tail fin (tail frame: u back along the tail, v up): a big rounded fan over the top and end of the tail
  const TFIN_P = [[-3, 3], [3, 11], [10, 17.5], [18.5, 21], [27, 20], [33, 14], [35, 5.5], [32, -3], [25, -7], [17, -4], [8, 0.5]];
  const TFIN_G = bakeShape(Shape2D.poly(TFIN_P, C_FIN, 8));
  const TFIN_RIB = [[[4, 6], [14, 11.5], [25, 13.5]], [[7, 3], [17, 4.5], [28, 5]]].map((pl) => Shape2D.catmull(pl, false, 4));
  // cheek gill: a rounded fan with two broad points swept back (u = back/out, v = up)
  const GILL_SPIKES = [{ a: 0.42, len: 13, w: 4.6 }, { a: -0.3, len: 10.5, w: 4.2 }].map((s) => {
    const ca = Math.cos(s.a), sa = Math.sin(s.a), r0 = 2.8;
    return { tip: [ca * s.len, sa * s.len], b1: [ca * r0 - sa * s.w, sa * r0 + ca * s.w], b2: [ca * r0 + sa * s.w, sa * r0 - ca * s.w], root: [ca * r0, sa * r0], dir: [ca, sa] };
  });
  const GILL_G = bakeShape({
    bb: [-7, -8, 14.5, 12],
    test(u, v) {
      for (const s of GILL_SPIKES) {
        if (Shape2D.inTri(u, v, s.tip, s.b1, s.b2)) {
          const cr = s.dir[0] * (v - s.root[1]) - s.dir[1] * (u - s.root[0]);
          return cr > 0.5 ? C_GILL_L : C_GILL;
        }
      }
      return u * u + v * v < 6 * 6 ? C_GILL : 0;
    },
  });

  /* ---------- eye stamps: small orange-brown eyes, black pupil, white glint ---------- */
  // k = dark rim, p = pupil, o = orange iris, w = glint
  const EYES_S = {
    open: ['.kk.', 'kwpk', 'kopk', '.kk.'], openN: ['.k.', 'wpk', 'opk', '.k.'], openF: ['k', 'p', 'k'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    blink: ['....', 'kkkk'], blinkN: ['...', 'kkk'], blinkF: ['.', 'k'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwwpk', 'kwppk', 'koppk', '.kok.'], openN: ['.kk.', 'kwpk', 'kppk', 'kopk', '.kk.'], openF: ['.k', 'kp', 'kp', '.k'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k', 'k.'],
    blink: ['.....', '.....', 'kkkkk', '.kkk.'], blinkN: ['....', '....', 'kkkk', '.kk.'], blinkF: ['..', 'kk'],
    closed: ['k...k', '.kkk.'], closedN: ['k..k', '.kk.'], closedF: ['k.', '.k'],
  };
  const EYES_XL = {
    open: ['.kkkk.', 'kwwppk', 'kwwppk', 'kopppk', 'koopok', '.kkkk.'], openN: ['.kkk.', 'kwwpk', 'kwppk', 'koppk', 'koopk', '.kkk.'], openF: ['.k.', 'kwk', 'kpk', 'kok', '.k.'],
    happy: ['.kkkk.', 'kk..kk', 'k....k'], happyN: ['.kkk.', 'kk.kk', 'k...k'], happyF: ['.k.', 'k.k'],
    blink: ['......', '......', '......', 'kkkkkk', '.kkkk.'], blinkN: ['.....', '.....', '.....', 'kkkkk', '.kkk.'], blinkF: ['...', 'kkk'],
    closed: ['k....k', 'kk..kk', '.kkkk.'], closedN: ['k...k', 'kk.kk', '.kkk.'], closedF: ['k.', '.k'],
  };
  const mirror = (S) => Object.fromEntries(Object.entries(S).map(([k, g]) => [k, g.map((r) => r.split('').reverse().join(''))]));
  const SETS = { S: [EYES_S, mirror(EYES_S)], L: [EYES_L, mirror(EYES_L)], XL: [EYES_XL, mirror(EYES_XL)] };
  const EYEC = { k: '#1a1420', p: '#0c0a10', o: '#e2802c', w: '#ffffff' };

  const DEFAULT = { walk: 0, crouch: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 torso + head, 2 crest, 3/4 gills, 5/6 arms, 7/8 legs, 9 tail, 10 tail fin
  const PRI = { 1: 0, 2: 2, 3: 3, 4: 3, 5: 2, 6: 2, 7: 1, 8: 1, 9: 0, 10: 1 };
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [], dots = [];
    const st = +P.walk || 0, walking = st !== 0;
    const cr = clamp(+P.crouch || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 1.6 * Math.abs(Math.cos(st)) : 0;
    const rock = walking ? 0.055 * Math.sin(st) : 0;
    const lean = -0.1 - 0.36 * cr;
    // torso frame at the hip centre
    const body = chain(T(-2 + 3 * cr, 23 - 10 * cr + bob, 0), R(M3.rx(rock)), R(M3.rz(lean)));

    /* --- torso --- */
    const tc = chain(body, T(0, EQ, 0));
    prims.push(ellF(tc, TR, 1, 1, lowMat));
    prims.push(ellF(tc, [TR[0], TR_UP, TR[2]], 1, 1, upMat));
    anchors.body = inF(body, [2, EQ + 4, 0]);
    anchors.belly = inF(body, [TR[0], EQ, 0]);

    /* --- head: broad, sits straight on the chest; stays level when the body leans --- */
    const head = chain(body, T(8, 44, 0), R(M3.rz(-lean * 0.75 + 0.04 * cr)), R(M3.rx(-rock * 0.5)), T(3, 11, 0));
    const headPrim = ellF(head, HR, 1, 1, headMat(mo));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return { prim: headPrim, p: inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]), s }; };
    anchors.mouth = onHead(0, mouthV(0) - 0.12).p;

    // eyes (stamps) and nostrils
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    for (const sd of [1, -1]) {
      const at = onHead(sd * EYE_AZ, EYE_V);
      stamps.push({ at, sd, colors: EYEC, kind, near: 0.7, far: 0.42, minFacing: 0.15 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
      dots.push({ at: onHead(sd * 0.14, 0.0), mat: BODY, tone: 0, onlyMat: BODY, minFacing: 0.5 });
    }

    // crest (turned a little toward the camera)
    const crest = chain(head, T(-3, 0, 0), R(M3.ry(0.24 * side)), T(3, 0, 0));
    prims.push(Object.assign(PL(crest.t, crest.L, 2, 2, CREST_G, 2.8), { lines: [{ pts: CREST_RIDGE.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true }] }));
    anchors.crest = inF(crest, [-10, 47, 0]);
    anchors.top = inF(crest, [-17, 54, 0]);

    // gills: frontal-ish fans behind the mouth corners, points swept back and out
    for (const sd of [1, -1]) {
      const g = onHead(sd * 1.22, -0.1);
      const U = dirF(head, [-0.5, 0.1, 0.86 * sd]);
      const N = dirF(head, [0.86, 0, 0.5 * sd]);
      const Vv = nrm(cross(U, N));
      const up = Vv[1] < 0 ? sc(Vv, -1) : Vv;
      const gs = 1.32; // gill size
      prims.push(PL(add(g.p, sc(U, -2)), M3.cols(sc(U, gs), sc(up, gs), cross(U, up)), sd > 0 ? 3 : 4, sd > 0 ? 3 : 4, GILL_G, 1.5));
    }

    /* --- arms: thick, hanging forward; three stubby fingers --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 5 : 6;
      const ph = st + (sd > 0 ? Math.PI : 0);
      const swing = walking ? 0.4 * Math.sin(ph) : 0;
      const pitchA = 0.42 + 0.55 * cr + swing; // forward angle from straight down
      const d = dirF(body, [Math.sin(pitchA), -Math.cos(pitchA), sd * (0.34 - 0.12 * cr)]);
      const sh = inF(body, [8, 35, sd * 19]);
      const wr = add(sh, sc(d, 23));
      prims.push(seg(sub(sh, sc(d, 3)), wr, 7.4, 7.6, id, id, M_BODY));
      const [X, Y, Z] = frameAlong(d, dirF(body, [1, 0, 0]));
      const hc = add(wr, sc(Y, 1.8));
      prims.push(ellAx(hc, X, Y, Z, [6.6, 6, 7.2], id, id, M_BODY));
      for (const k of [-1, 0, 1]) prims.push(ellAx(add(hc, add(sc(Y, 5), add(sc(Z, k * 4), sc(X, 1.5)))), X, Y, Z, [2.8, 3.6, 2.5], id, id, M_BODY));
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hc, sc(Y, 8));
    }

    /* --- legs: short thick thighs, big three-toed feet (crouch bends them, walking swings them) --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 7 * Math.sin(ph) : 0;
      const lift = walking ? 4.5 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(body, [0, 4, sd * 12.5]);
      const ank = [4 + fwd + 3 * cr, 5 + lift, sd * (15 + 2 * cr)];
      const mid = add(sc(add(hip, ank), 0.5), [5 * cr, 0, 0]);
      prims.push(seg(add(hip, [0, 3, 0]), add(ank, [0, -1, 0]), 12.5 + 1.5 * cr, 11.5, id, id, M_BODY, [1, 0, 0]));
      if (cr > 0.05) prims.push(ellF(T(...mid), [11 * cr + 2, 10, 10], id, id, M_BODY));
      const tip = walking ? 0.3 * Math.sin(ph) * (lift > 0 ? 1 : 0.4) : 0;
      const foot = chain(T(ank[0] + 3.5, ank[1] - 0.5, ank[2]), R(M3.ry(-sd * 0.12)), R(M3.rz(-tip)));
      prims.push(ellF(foot, [11, 4.6, 8.6], id, id, M_BODY));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(9.4, -0.8, k * 4.4), R(M3.ry(-k * 0.3))), [4.2, 3.2, 2.9], id, id, M_BODY));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -4.6, 0]);
    }

    /* --- tail: short and thick, a big dark fan fin on top --- */
    const wag = walking ? 0.18 * Math.sin(st) : 0;
    const tail = chain(body, T(-18, 8, 0), R(M3.ry(Math.PI + wag)), R(M3.rz(-0.38 - 0.2 * cr)));
    // tail frame: +x runs back along the tail (the body turned round), +y up
    prims.push(ellF(chain(tail, T(9, 0, 0)), [14, 8.5, 9], 9, 9, M_BODY));
    const tfin = chain(tail, T(2, 3, 0), R(M3.rz(0.3)), R(M3.ry(-0.3 * side)));
    prims.push(Object.assign(PL(tfin.t, tfin.L, 10, 10, TFIN_G, 2.4), { lines: TFIN_RIB.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true })) }));
    anchors.tail = inF(tail, [2, 0, 0]);
    anchors.tailTip = inF(tfin, [34, 8, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const s of stamps) s.at.p = sc(s.at.p, SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps, dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 16 };
  }

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    curScale = s;
    const set = SETS[s >= 1.15 ? 'XL' : s >= 0.62 ? 'L' : 'S'];
    for (const st of model.stamps) st.set = set[st.sd > 0 ? 0 : 1];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 150, bh: 150, oy: 0.9 } };
})();
