/* ------------------------------------------------------------------
   Nuzleaf — the Wily Pokémon (1.0 m ≈ 175 units tall at scale 1, head
   leaf included). Seedot's evolution. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a chibi tengu. A huge round
   tan-brown head with a cream "mask" band across the eyes, a thick cream
   cone nose jutting forward from the middle of the band, sly white eyes
   with a heavy black upper lid, a small round mouth (pink inside) low on
   the face and one long green leaf growing from the crown, swept back
   and up. A short skinny tan torso with a navel; long thin arms with big
   round fists, held up in its flexing pose; two big bulbous cream
   "pants" lobes (the acorn shell of Seedot) ringed with grey stripes;
   short legs and broad three-toed feet.

   Pose parameters (all optional):
     walk     radians  walk-cycle phase (legs step, fists pump, body bobs
                       and rocks); exactly 0 = standing
     whistle  0..1     leaf flute: the near fist brings a plucked leaf to the
                       mouth, head tips back a little, lips pucker
     mouth    0..1     mouth open (the small "o" widens)
     eyes     'open' | 'happy' | 'blink' | 'closed'
     side     −1..1    ≈ 3·cos(yaw), passed by the game: the head leaf turns a
                       little toward the camera so it reads

   Anchors: top (leaf tip), head (head centre), mouth, nose (nose tip),
   eyeN, eyeF, body (torso centre), leaf (leaf tip), handN, handF,
   footN, footF, flute (the held leaf; notes rise from here).
------------------------------------------------------------------- */
const Nuzleaf = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, MASK = 2, PANTS = 3, LEAF = 4, MOUTH = 5, INNER = 6, EYEK = 7, EYEW = 8, NOSE = 9;
  const MAT = { BODY, MASK, PANTS, LEAF, MOUTH, INNER, EYEK, EYEW, NOSE };
  const PAL = Creature.palette({
    // sampled from the official art: greyish brown #98725e (shadow #795b4c, lit #bfa497), cream mask #e5dbd0,
    // cream pants #e9ddd0, pale leaf green #70ae88 / #8cba9a
    [BODY]:  { r: ['#604a40', '#826452', '#a07c68', '#b89682', '#ccb09e'], od: '#2e2018', ol: '#5e4436', ln: '#5a4032' },
    [MASK]:  { r: ['#9e958a', '#bdb4aa', '#dcd2c6', '#e8dfd4', '#f4eee6'], od: '#4a4032', ol: '#7e7260', ln: '#7e7260' },
    // the cone nose: a flatter ramp so its stacked sections read as one smooth cone
    [NOSE]:  { r: ['#b4aca2', '#c4bcb1', '#d4cbc0', '#e0d7cc', '#ece4da'], od: '#4a4032', ol: '#7e7260', ln: '#7e7260' },
    [PANTS]: { r: ['#a89c8e', '#c6baac', '#e2d6c8', '#ece2d6', '#f6f0e8'], od: '#4a4032', ol: '#7e7260', ln: '#7e7260' },
    [LEAF]:  { r: ['#3e7a56', '#56946c', '#70ae88', '#8cc49e', '#b0dcbc'], od: '#1a3c28', ol: '#34684a', ln: '#3a7050' },
    [MOUTH]: { r: ['#3c0c10', '#541418', '#6c2024', '#862e30', '#a0403e'], od: '#240408', ol: '#3c0c10', ln: '#3c0c10' },
    [INNER]: { r: ['#a8404e', '#c65464', '#e0707e', '#f0929c', '#ffbcc2'], od: '#5a1420', ol: '#8a2a38', ln: '#8a2a38' },
    [EYEK]:  { r: ['#0a0808', '#100c0c', '#161212', '#201a1a', '#2e2626'], od: '#050303', ol: '#0a0808', ln: '#050303' },
    [EYEW]:  { r: ['#d4d0cc', '#eceae6', '#fbfaf8', '#ffffff', '#ffffff'], od: '#40383a', ol: '#40383a', ln: '#40383a' },
  });
  const GLOSSY = { [LEAF]: 1 };
  const C_BODY = code(BODY), C_MASK = code(MASK), C_PANTS = code(PANTS), C_STRIPE = code(PANTS, -2);
  const C_LEAF = code(LEAF), C_LEAF_L = code(LEAF, 1), C_MOUTH = code(MOUTH), C_INNER = code(INNER);
  const C_EYEK = code(EYEK), C_EYEW = code(EYEW);
  const M_BODY = () => C_BODY, M_MASK = () => C_MASK, M_LEAF = () => C_LEAF, C_NOSE = code(NOSE), M_NOSE = () => C_NOSE;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], ext = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return E(sc(add(p0, p1), 0.5), M3.cols(sc(X, rx), sc(Y, (l / 2) * ext), sc(Z, rz)), part, grp, mat);
  }
  function plateUV(c, U, Vh, part, grp, shape, thick = 1.6) {
    const u = nrm(U), v = nrm(sub(Vh, sc(u, dot(Vh, u))));
    return PL(c, M3.cols(u, v, cross(u, v)), part, grp, shape, thick);
  }

  let curScale = 1;

  /* ---------- head: tan, a cream mask band across the eyes, decal eyes and mouth ---------- */
  const HR = [39, 41, 43];
  const EYE_AZ = 0.5, EYE_V = 0.3, EYE_W = 0.36, EYE_H = 0.2;
  const MOUTH_V = -0.46;
  // mask band: from eye level up to the brow, wrapping round the sides; dips under the nose
  const inBand = (az, v) => {
    const a = Math.abs(az);
    if (a > 1.55) return false;
    const top = 0.76 - 0.2 * (a / 1.55) ** 2;
    const bot = -0.2 - 0.1 * Math.max(0, 1 - a / 0.45) + 0.06 * (a / 1.55);
    return v < top && v > bot;
  };
  function eyePix(az, v, sd, kind) {
    const px = 1 / (curScale * HR[1]);
    const a = (az - sd * EYE_AZ) / EYE_W, b = (v - EYE_V) / EYE_H;
    const ain = -sd * a; // + toward the nose
    if (Math.abs(ain) > 1.15 || Math.abs(b) > 1.6) return 0;
    const lw = Math.max(0.2, (1.1 * px) / EYE_H);
    if (kind === 'open') {
      const top = 0.55 - 0.45 * ain; // heavy lid sloping down toward the nose (sly)
      const bot = -0.95 * Math.sqrt(Math.max(0, 1 - ain * ain));
      if (Math.abs(ain) > 1 || b < bot - lw * 0.6) return 0;
      if (b > top + lw * 1.3) return 0;
      if (b > top - lw * 0.3) return C_EYEK; // lid
      if (b < bot + lw * 0.2 || Math.abs(ain) > 1 - 0.6 * lw * EYE_H / EYE_W) return C_EYEK;
      // pupil: toward the nose, just under the lid
      const pa = (ain - 0.3) / Math.max(0.3, (1.3 * px) / EYE_W), pb = (b + 0.05) / Math.max(0.55, (1.4 * px) / EYE_H);
      return pa * pa + pb * pb < 1 ? C_EYEK : C_EYEW;
    }
    if (Math.abs(ain) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = -0.3 + 0.9 * (1 - ain * ain);
    else if (kind === 'blink') yc = 0.05 - 0.2 * ain;
    else yc = 0.1 - 0.35 * ain - 0.3 * (1 - ain * ain);
    return Math.abs(b - yc) < lw * 1.1 ? C_EYEK : 0;
  }
  function headMat(kind, mo) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1];
      if (s[0] > 0) {
        const e = eyePix(az, v, az >= 0 ? 1 : -1, kind);
        if (e) return e;
        // small round mouth: dark rim, pink inside
        const px = 1 / (curScale * HR[1]);
        const mw = Math.max(0.13 + 0.05 * mo, 2.4 * px), mh = Math.max(0.15 + 0.08 * mo, 2.4 * px);
        const ma = az / mw, mb = (v - MOUTH_V) / mh, mr = ma * ma + mb * mb;
        if (mr < 1) {
          const ir = Math.max(0, 1 - (1.2 * px) / Math.min(mw, mh));
          return mr < ir * ir ? C_INNER : C_MOUTH;
        }
      }
      return inBand(az, v) ? C_MASK : C_BODY;
    };
  }

  /* ---------- plates ---------- */
  // head leaf: u = along the leaf (from the stem), v = across; a long pointed blade
  const LEAF_P = [[0, 0], [8, -10], [22, -19], [40, -23], [58, -21], [76, -13], [94, -2], [76, 8], [56, 14], [38, 16], [20, 13], [8, 7]];
  const LEAF_G = bakeShape(Shape2D.poly(LEAF_P, C_LEAF, 8, (u, v) => (v > 0.6 ? C_LEAF_L : C_LEAF)));
  const LEAF_RIB = Shape2D.catmull([[2, 0], [26, 0.6], [52, 0.6], [76, 0.2]], false, 4);
  // small plucked leaf held to the mouth
  const FLUTE_P = [[0, 0], [5, -4], [12, -5], [19, -3], [23, 0], [19, 3], [12, 5], [5, 4]];
  const FLUTE_G = bakeShape(Shape2D.poly(FLUTE_P, C_LEAF, 8));

  const DEFAULT = { walk: 0, whistle: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 torso, 2 head, 3 nose, 4 leaf, 5/6 pants, 7/8 arms, 9/10 legs, 11 flute
  const SIZE = 0.92;
  const PRI = { 1: 0, 2: 1, 3: 3, 4: 2, 5: 1, 6: 1, 7: 2, 8: 2, 9: 0, 10: 0, 11: 4 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = +P.walk || 0, walking = st !== 0;
    const wh = clamp(+P.whistle || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 2.6 * Math.abs(Math.cos(st)) : 0;
    const rock = walking ? 0.06 * Math.sin(st) : 0;
    // hip frame (centre of the pants)
    const hip = chain(T(0, 40 + bob, 0), R(M3.rx(rock)));

    /* --- pants: two big striped lobes --- */
    const pantsMat = (s) => {
      const lw = Math.max(0.035, 0.5 / (curScale * 22));
      for (const g of [0.5, 0.05, -0.42]) if (Math.abs(s[1] - g + 0.08 * s[0]) < lw) return C_STRIPE;
      return C_PANTS;
    };
    for (const sd of [1, -1]) {
      prims.push(ellF(chain(hip, T(0, 0, sd * 15), R(M3.rx(-sd * 0.12))), [21, 23, 20], sd > 0 ? 5 : 6, sd > 0 ? 5 : 6, pantsMat));
    }

    /* --- torso: short and skinny, navel --- */
    const torso = chain(hip, T(0, 16, 0), R(M3.rx(-rock * 0.5)), R(M3.rz(walking ? 0.03 * Math.sin(2 * st) : 0)));
    prims.push(ellF(chain(torso, T(-1, 18, 0)), [12, 20, 14], 1, 1, M_BODY));
    prims.push(ellF(chain(torso, T(-1, 31, 0)), [11, 8, 17], 1, 1, M_BODY));
    anchors.body = inF(torso, [0, 18, 0]);
    const navelPrim = prims[prims.length - 2];
    const dots = [{ at: { prim: navelPrim, p: inF(torso, [11, 12, 0]), s: nrm([0.95, -0.3, 0]) }, mat: BODY, tone: 0, minFacing: 0.3 }];

    /* --- head --- */
    const head = chain(torso, T(1, 30, 0), R(M3.rz(0.14 * wh)), T(2, 29, 0));
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const headPrim = ellF(head, HR, 2, 2, headMat(kind, wh > 0.3 ? 0.35 : mo));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, MOUTH_V);
    // thick cream cone nose from the middle of the band, pointing forward and a little up
    const nd = dirF(head, [Math.cos(0.58), Math.sin(0.58), 0]);
    const nb = inF(head, [30, 9, 0]);
    // a long pointed cone: stacked, shrinking sections
    for (const [a, b, r] of [[-4, 30, 10], [12, 46, 5.4], [30, 57, 2.4]]) prims.push(seg(add(nb, sc(nd, a)), add(nb, sc(nd, b)), r, r * 0.94, 3, 3, M_NOSE, dirF(head, [0, 1, 0])));
    anchors.nose = add(nb, sc(nd, 56));
    // pucker when whistling
    if (wh > 0.3) prims.push(ellF(chain(head, T(HR[0] * 0.86, HR[1] * MOUTH_V, 0)), [4, 3.4, 4], 3, 3, () => C_MOUTH));

    // long leaf from the crown, swept back and up (twisted to show its face)
    const lroot = inF(head, [-4, HR[1] - 2, 0]);
    const lu = dirF(head, [-Math.cos(0.3), Math.sin(0.3), 0]);
    const lv = dirF(head, [0.15, 1, 0.5 * (side >= 0 ? 1 : -1)]);
    const leaf = plateUV(lroot, lu, lv, 4, 4, LEAF_G, 2.2);
    leaf.lines = [{ pts: LEAF_RIB.map(([u, v]) => [u, v, 0]), mat: LEAF, useLn: true }];
    prims.push(leaf);
    prims.push(seg(inF(head, [-2, HR[1] - 6, 0]), add(lroot, sc(lu, 4)), 2.4, 2.4, 4, 4, M_LEAF));
    anchors.leaf = add(lroot, sc(lu, 90));
    anchors.top = anchors.leaf[1] > inF(head, [0, HR[1], 0])[1] ? anchors.leaf : inF(head, [0, HR[1], 0]);

    /* --- arms: thin, big round fists; flexing pose (fists up beside the head) --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const ph = st + (sd > 0 ? Math.PI : 0);
      const pump = walking ? Math.sin(ph) : 0;
      const sh = inF(torso, [0, 30, sd * 13]);
      let el = inF(torso, [-2 + 3 * pump, 30, sd * 40]);
      let fist = inF(torso, [6 + 5 * pump, 54 + 3 * pump, sd * 46]);
      if (sd > 0 && wh > 0) {
        // near fist brings the leaf flute to the mouth
        el = lerp3(el, inF(torso, [16, 22, 30]), wh);
        fist = lerp3(fist, inF(head, [HR[0] + 6, HR[1] * MOUTH_V - 4, 14]), wh);
      }
      prims.push(seg(sh, el, 4.2, 4.2, id, id, M_BODY, [1, 0, 0], 1.12));
      prims.push(seg(el, fist, 4, 4, id, id, M_BODY, [1, 0, 0], 1.0));
      prims.push(ellF(T(...fist), [13.5, 14.5, 13], id, id, M_BODY));
      // curled fingers: a crease line on the front of the fist
      prims[prims.length - 1].lines = [{ pts: [[0.8, 0.45, 0.35 * sd], [0.95, 0, 0.3 * sd], [0.8, -0.45, 0.35 * sd]], mat: BODY, useLn: true }];
      anchors[sd > 0 ? 'handN' : 'handF'] = fist;
    }
    if (wh > 0.05) {
      // plucked leaf held crosswise at the lips
      const fc = inF(head, [HR[0] + 3, HR[1] * MOUTH_V - 1, 10 * wh]);
      prims.push(plateUV(fc, dirF(head, [0.15, 0.1, -1]), dirF(head, [0.3, 1, 0]), 11, 11, FLUTE_G, 1.4));
      anchors.flute = fc;
    } else anchors.flute = anchors.mouth;

    /* --- legs: short, broad three-toed feet --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 9 : 10;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 8 * Math.sin(ph) : 0;
      const lift = walking ? 5 * Math.max(0, Math.cos(ph)) : 0;
      const h0 = inF(hip, [0, -12, sd * 15]);
      const ank = [1 + fwd, 6 + lift, sd * 17];
      prims.push(seg(h0, ank, 5.4, 5.4, id, id, M_BODY, [1, 0, 0], 1.1));
      const tip = walking ? 0.25 * Math.sin(ph) * (lift > 0 ? 1 : 0.4) : 0;
      const foot = chain(T(ank[0] + 4, ank[1] - 2, ank[2]), R(M3.ry(-sd * 0.45)), R(M3.rz(-tip)));
      prims.push(ellF(foot, [12, 4.2, 9], id, id, M_BODY));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(10.5, -0.8, k * 4.8), R(M3.ry(-k * 0.35))), [6.4, 3, 2.8], id, id, M_BODY));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -4, 0]);
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps: [], dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 210, bh: 216, oy: 0.9 } };
})();
