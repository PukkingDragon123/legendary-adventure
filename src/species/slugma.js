/* ------------------------------------------------------------------
   Slugma — the Lava Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a slug made of glowing magma. A big round head
   rises on a thick neck out of a flat, flowing slug foot that trails back
   into a tapering tail pool; molten drips hang from the head's rim and
   blobs bubble on its crown. Bright lava orange-red with hot yellow
   spots, round yellow eyes with black pupils, a wide dark mouth.

   Pose params:
     ooze   radians  blobby crawl phase: a wave runs back along the foot,
                     the neck sways, the head wobbles, the drips stretch;
                     0 = at rest
     walk   radians  alias of ooze (either drives the crawl; they add)
     mouth  0..1     the mouth opens wide (dark mouth, glowing tongue)
     eyes   'open' (default) | 'happy' | 'blink' | 'closed'
     side   −1..1    camera side from the game (unused; symmetric model)
   Anchors: top (crown blob), head, mouth, eyeN, eyeF, body, tail.
------------------------------------------------------------------- */
const Slugma = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials (warm, self-lit ramps: even the deepest tone stays hot)
  const LAVA = 1, HOT = 2, EYE = 3, PUPIL = 4, MOUTH = 5, TONGUE = 6;
  const MAT = { LAVA, HOT, EYE, PUPIL, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [LAVA]:   { r: ['#a84a40', '#c85a4e', '#e36d5e', '#ec8a72', '#f6ac92'], od: '#5a1812', ol: '#96382c', ln: '#9a3a2e' },
    [HOT]:    { r: ['#cc6c58', '#e0826a', '#ed9b7e', '#f5b698', '#fdd2b8'], od: '#6a2418', ol: '#a04a38', ln: '#a04a38' },
    [EYE]:    { r: ['#d4c468', '#e8d880', '#f8eb9a', '#fcf4c0', '#fffce4'], od: '#5a1a10', ol: '#7a2a18', ln: '#7a2a18' },
    [PUPIL]:  { r: ['#120806', '#1a0c0a', '#22100c', '#2c1410', '#361a14'], od: '#080404', ol: '#120806', ln: '#120806' },
    [MOUTH]:  { r: ['#4a0806', '#620e08', '#7c160c', '#962012', '#b02c16'], od: '#2a0402', ol: '#4a0806', ln: '#3a0604' },
    [TONGUE]: { r: ['#e04a1c', '#f46626', '#ff8a36', '#ffb050', '#ffd880'], od: '#7a1a06', ol: '#a02a0a', ln: '#a02a0a' },
  });
  const GLOSSY = {};
  const C_CRATER = code(LAVA, -1);
  const C_LAVA = code(LAVA), C_LAVA_B = code(LAVA, 1), C_HOT = code(HOT), C_EYE = code(EYE), C_EYE_L = code(EYE, 1), C_PUPIL = code(PUPIL);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const M_LAVA = () => C_LAVA, M_HOT = () => C_HOT;

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
  // hot spots: fixed directions on a unit sphere (cos of angular radius)
  const spots = (list) => list.map(([az, v, r]) => ({ d: Creature.sph(az, v), c: Math.cos(r) }));
  const inSpot = (S, s) => { for (const q of S) if (s[0] * q.d[0] + s[1] * q.d[1] + s[2] * q.d[2] > q.c) return true; return false; };

  // ---- geometry (pre-SIZE units)
  const HEAD_C = [7, 62, 0], HEAD_R = [26, 20, 29];
  const FOOT = [ // the flat lava puddle it sits in, from front to back: centre x, y, radii
    { x: 24, y: 9, r: [24, 11, 34] },
    { x: 2, y: 10, r: [30, 12.5, 40] },
    { x: -22, y: 10, r: [26, 12, 36] },
    { x: -40, y: 8, r: [18, 9, 27] },
    { x: -52, y: 5, r: [10, 6, 16] },
  ];
  const HEAD_SPOTS = spots([[2.4, 0.55, 0.2], [-2.2, 0.35, 0.18], [1.9, -0.2, 0.16], [-1.6, 0.6, 0.14], [3.14, 0.1, 0.18], [-1.9, -0.3, 0.14]]);
  const BODY_SPOTS = spots([[1.9, 0.2, 0.25], [-2.3, -0.1, 0.22], [2.9, 0.4, 0.2]]);
  const FOOT_SPOTS = spots([[0.9, 0.55, 0.2], [-1.3, 0.6, 0.17], [2.1, 0.5, 0.15], [-2.4, 0.45, 0.19], [0.1, 0.8, 0.12]]);
  const CRATER_IN = spots([[0.9, 0.55, 0.14], [-1.3, 0.6, 0.12], [2.1, 0.5, 0.1], [-2.4, 0.45, 0.13], [0.1, 0.8, 0.07]]);
  // eyes (head unit-sphere): two big, wide, pale-yellow ovals high on the front, almost touching,
  // each with a tiny black pupil and a heavy dark lid line over it
  const EYE_AZ = 0.4, EYE_V = 0.22, EYE_RA = 0.37, EYE_RV = 0.3;
  const PRI = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 3, 7: 2 };
  const SIZE = 1.14;
  const DEFAULT = { ooze: 0, walk: 0, mouth: 0, eyes: 'open', side: 1 };
  let curScale = 1;
  // flame silhouettes (u from the root along the flame, v across; the tip curls toward +v)
  const FLAME_S = bakeShape(Shape2D.poly([[-2, -6], [6, -8.5], [14, -8], [21, -5], [27, 0], [31, 6.5], [25, 4.5], [22, 7.5], [23, 12], [16, 7.5], [9, 8], [2, 7]], C_LAVA, 6, (u, v) => (u > 17 ? C_HOT : C_LAVA)), 0.5);
  const FLAME_B = bakeShape(Shape2D.poly([[-2, -7], [8, -9.5], [18, -9], [28, -6.5], [37, -2], [44, 4], [47, 11], [40, 7], [35, 8.5], [33, 13], [27, 7.5], [19, 8], [10, 8.5], [2, 7.5]], C_LAVA, 6, (u, v) => (u > 26 ? C_HOT : C_LAVA)), 0.5);
  // [root x, y, z (head frame), flame axis, plane normal, shape, scale]
  const FLAMES = [
    [4, 13, -8, [-0.25, 1, -0.3], [0.8, 0, 0.6], FLAME_S, 1.1],
    [-6, 14, 9, [-0.55, 1, 0.3], [-0.7, 0, 0.7], FLAME_S, 0.95],
    [-14, 9, 0, [-1, 0.55, 0], [0, 0, 1], FLAME_B, 1.1],
  ];

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const oz = (+P.ooze || 0) + (+P.walk || 0), moving = oz !== 0;
    const mo = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const w = (ph) => (moving ? Math.sin(oz - ph) : 0);

    /* --- the flat lava puddle: a wave of swelling segments runs back along it; bubbling craters --- */
    FOOT.forEach((f, i) => {
      const k = 1 + 0.12 * w(i * 1.1);
      const fx = f.x + 2.5 * w(i * 1.1 + 1.2);
      const mat = (s) => (s[1] < -0.2 ? 0 : s[1] > 0.2 && inSpot(FOOT_SPOTS, s) ? (inSpot(CRATER_IN, s) ? C_LAVA : C_CRATER) : C_LAVA);
      prims.push(ellF(T(fx, f.y * (1 + 0.15 * w(i * 1.1)), 0), [f.r[0] * (2 - k) * 1.05, f.r[1] * k, f.r[2] * k], 1, 1, mat));
    });
    anchors.tail = [FOOT[4].x - FOOT[4].r[0], 2, 0];

    /* --- the narrow neck rising out of the puddle (sways) --- */
    const sway = 0.06 * w(0.5), wob = 0.05 * w(1.4);
    const neck = chain(T(-6, 10, 0), R(M3.rz(sway)), R(M3.rx(wob * 0.5)));
    const bodyMat = (s) => (inSpot(BODY_SPOTS, s) ? C_HOT : C_LAVA);
    prims.push(ellF(chain(neck, T(0, 10, 0)), [22, 12, 26], 2, 1, bodyMat));        // flares into the puddle
    prims.push(ellF(chain(neck, T(2, 30, 0), R(M3.rz(-0.25))), [11.5, 24, 13.5], 2, 2, bodyMat));
    anchors.body = inF(neck, [0, 26, 0]);

    /* --- head: a wide magma blob leaning out over the front --- */
    const squish = 1 + 0.04 * w(2);
    const head = chain(neck, T(HEAD_C[0] + 6, HEAD_C[1] - 10, 0), R(M3.rz(-sway * 0.5 + 0.03 * w(2.4) - 0.08)), R(M3.diag(1 / Math.sqrt(squish), squish, 1 / Math.sqrt(squish))));
    const mouthV = -0.4, mouthH = 0.05 + 0.3 * mo, mouthW = 0.36 + 0.08 * mo;
    const headMat = (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1];
      if (s[0] > 0.05) {
        const px = 1 / (curScale * HEAD_R[1]);
        for (const sd of [1, -1]) {
          const da = (az - sd * EYE_AZ) / EYE_RA, dv = (v - EYE_V) / EYE_RV, r2 = da * da + dv * dv;
          const lw = Math.max(0.12, 1.1 * px / EYE_RV);
          // the heavy lid line arching over the eye, running out past its outer corner
          const rr = Math.sqrt(r2);
          if (dv > 0 && rr > 1 && rr < 1 + lw * 1.3 && da * sd > -0.7) return C_PUPIL;
          if (kind === 'open') {
            if (r2 < 1) {
              if (rr > 1 - lw * 0.8) return C_PUPIL;
              const pa = (da + sd * 0.42) / Math.max(0.1, 0.9 * px / EYE_RA), pv = (dv + 0.05) / Math.max(0.16, 1.3 * px / EYE_RV);
              if (pa * pa + pv * pv < 1) return C_PUPIL;
              return C_EYE;
            }
          } else if (r2 < 1) {
            const yc = kind === 'happy' ? -0.3 + 0.6 * (1 - da * da) : kind === 'closed' ? 0.2 - 0.5 * (1 - da * da) : 0;
            if (Math.abs(dv - yc) < lw * 1.4 && Math.abs(da) < 0.95) return C_PUPIL;
            return C_LAVA;
          }
        }
        // mouth: a wide dark oval below the eyes, opening downward
        const ma = az / mouthW, mv = (v - (mouthV - mouthH * 0.6)) / mouthH;
        if (mo > 0.05 && ma * ma + mv * mv < 1) return mo > 0.35 && mv < -0.2 && Math.abs(ma) < 0.6 ? C_TONGUE : C_MOUTH;
      }
      return inSpot(HEAD_SPOTS, s) ? C_HOT : C_LAVA;
    };
    const headPrim = ellF(head, HEAD_R, 3, 3, headMat);
    prims.push(headPrim);
    anchors.head = head.t;
    anchors.mouth = inF(head, [0.9 * HEAD_R[0], (mouthV - mouthH * 0.3) * HEAD_R[1], 0]);
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(head, [s[0] * HEAD_R[0], s[1] * HEAD_R[1], s[2] * HEAD_R[2]]);
    }

    /* --- crown: flat flame tongues licking up and streaming back from the top of the head --- */
    // each flame is a thick flat plate (u = along the flame, v = across) set in a tilted plane
    let top = 0;
    FLAMES.forEach(([x, y, z, U0, N0, g, sz], i) => {
      const k = 1 + 0.1 * w(i * 1.7 + 0.5);
      const U = nrm(M3.v(head.L, U0));
      let Nn = nrm(M3.v(head.L, N0));
      Nn = nrm(sub(Nn, sc(U, dot(Nn, U))));
      const Vv = cross(Nn, U);
      const c = inF(head, [x, y, z]);
      prims.push({ kind: 'plate', part: 4, grp: 4, c, L: M3.cols(sc(U, sz * k), sc(Vv, sz), Nn), shape: g, thick: 5 });
      top = Math.max(top, c[1] + g.bb[2] * sz * k * Math.max(0, U[1]) + 4);
    });
    anchors.top = [head.t[0] - 8, top, 0];

    /* --- two molten drips hanging off the front of the head --- */
    const DRIPS = [[0.42, 0.45, 4.4], [-0.5, 0.35, 4]];
    DRIPS.forEach(([az, len, r], i) => {
      const s = Creature.sph(az, -0.62);
      const root = inF(head, [s[0] * HEAD_R[0] * 0.9, s[1] * HEAD_R[1] * 0.9, s[2] * HEAD_R[2] * 0.9]);
      const L = (9 + 14 * len) * (1 + 0.25 * w(i * 1.3 + 2));
      const tip = add(root, [1.5, -L, 0]);
      prims.push(seg(root, tip, r * 0.62, r * 0.62, 5 + (i % 2), 5, M_LAVA));
      prims.push(ellF(T(...add(tip, [0, 2, 0])), [r * 1.05, r * 1.4, r * 1.05], 5 + (i % 2), 5, M_LAVA));
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: LAVA, shadowSteps: 14 };
  }

  const render = (model, opt) => { curScale = (opt.scale || 1) * SIZE; return Creature.render(model, opt); };

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 200, bh: 170, oy: 0.92 } };
})();
