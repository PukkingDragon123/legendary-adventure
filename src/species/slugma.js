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
    [LAVA]:   { r: ['#9a2822', '#bc3a30', '#d85244', '#ea6e5c', '#f89682'], od: '#541010', ol: '#8a2018', ln: '#8e241c' },
    [HOT]:    { r: ['#c4483a', '#dc5e4c', '#ee7a66', '#f89a84', '#ffbca8'], od: '#6a1a14', ol: '#9a2a20', ln: '#9a2a20' },
    [EYE]:    { r: ['#d8b020', '#ecd038', '#f8e45a', '#fff08a', '#fffcc8'], od: '#5a1a04', ol: '#7a2a06', ln: '#7a2a06' },
    [PUPIL]:  { r: ['#4a0c0a', '#5a120e', '#6a1812', '#7a2016', '#8a281c'], od: '#300604', ol: '#4a0c0a', ln: '#3a0806' },
    [MOUTH]:  { r: ['#4a0806', '#620e08', '#7c160c', '#962012', '#b02c16'], od: '#2a0402', ol: '#4a0806', ln: '#3a0604' },
    [TONGUE]: { r: ['#e04a1c', '#f46626', '#ff8a36', '#ffb050', '#ffd880'], od: '#7a1a06', ol: '#a02a0a', ln: '#a02a0a' },
  });
  const GLOSSY = { [EYE]: 1 };
  const C_CRATER = code(LAVA, -1);
  const C_LAVA = code(LAVA), C_LAVA_B = code(LAVA, 1), C_HOT = code(HOT), C_EYE = code(EYE), C_EYE_L = code(EYE, 1), C_PUPIL = code(PUPIL);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const M_LAVA = () => C_LAVA;

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
  const HEAD_C = [6, 62, 0], HEAD_R = [26, 24, 28];
  const FOOT = [ // slug foot / tail pool from front to back: centre x, y, radii
    { x: 14, y: 9, r: [30, 11, 34] },
    { x: -8, y: 9, r: [28, 11, 34] },
    { x: -28, y: 7, r: [20, 8, 26] },
    { x: -42, y: 5, r: [13, 6, 17] },
    { x: -52, y: 3.5, r: [8, 4, 10] },
  ];
  const HEAD_SPOTS = spots([[2.4, 0.55, 0.16], [-2.2, 0.35, 0.13], [1.6, -0.1, 0.12], [-1.4, 0.6, 0.11], [3.14, 0.1, 0.14], [0.9, 0.82, 0.1]]);
  const BODY_SPOTS = spots([[1.9, 0.2, 0.2], [-2.3, -0.1, 0.18], [2.9, 0.4, 0.15]]);
  const FOOT_SPOTS = spots([[0.9, 0.55, 0.2], [-1.3, 0.6, 0.17], [2.1, 0.5, 0.15], [-2.4, 0.45, 0.19], [0.1, 0.8, 0.12]]);
  const CRATER_IN = spots([[0.9, 0.55, 0.12], [-1.3, 0.6, 0.1], [2.1, 0.5, 0.08], [-2.4, 0.45, 0.11], [0.1, 0.8, 0.06]]);
  // eyes (head unit-sphere): big round yellow eyes set wide on the front of the head
  const EYE_AZ = 0.36, EYE_V = 0.12, EYE_RA = 0.3, EYE_RV = 0.3;
  const PRI = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 3, 7: 2 };
  const SIZE = 1.14;
  const DEFAULT = { ooze: 0, walk: 0, mouth: 0, eyes: 'open', side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const oz = (+P.ooze || 0) + (+P.walk || 0), moving = oz !== 0;
    const mo = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const w = (ph) => (moving ? Math.sin(oz - ph) : 0);

    /* --- slug foot: a wave of swelling segments runs back along it --- */
    FOOT.forEach((f, i) => {
      const k = 1 + 0.12 * w(i * 1.1);
      const fx = f.x + 2.5 * w(i * 1.1 + 1.2);
      const mat = (s) => (s[1] < -0.2 ? 0 : s[1] > 0.2 && inSpot(FOOT_SPOTS, s) ? (inSpot(CRATER_IN, s) ? C_CRATER : C_HOT) : C_LAVA);
      prims.push(ellF(T(fx, f.y * (1 + 0.15 * w(i * 1.1)), 0), [f.r[0] * (2 - k) * 1.05, f.r[1] * k, f.r[2] * k], 1, 1, mat));
    });
    anchors.tail = [FOOT[4].x - FOOT[4].r[0], 2, 0];

    /* --- neck / body column (sways) --- */
    const sway = 0.06 * w(0.5), wob = 0.05 * w(1.4);
    const neck = chain(T(4, 10, 0), R(M3.rz(sway)), R(M3.rx(wob * 0.5)));
    const bodyMat = (s) => (inSpot(BODY_SPOTS, s) ? C_HOT : C_LAVA);
    prims.push(ellF(chain(neck, T(0, 20, 0)), [26, 24, 28], 2, 2, M_LAVA));
    anchors.body = inF(neck, [0, 26, 0]);

    /* --- head: big round magma blob with eyes, mouth and hot spots --- */
    const squish = 1 + 0.04 * w(2);
    const head = chain(neck, T(HEAD_C[0] - 4, HEAD_C[1] - 10, 0), R(M3.rz(-sway * 0.5 + 0.03 * w(2.4))), R(M3.diag(1 / Math.sqrt(squish), squish, 1 / Math.sqrt(squish))));
    const mouthV = -0.36, mouthH = 0.05 + 0.3 * mo, mouthW = 0.36 + 0.08 * mo;
    const headMat = (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1];
      if (s[0] > 0.2) {
        // eyes
        for (const sd of [1, -1]) {
          const da = (az - sd * EYE_AZ) / EYE_RA, dv = (v - EYE_V) / EYE_RV, r2 = da * da + dv * dv;
          if (kind === 'open') {
            if (r2 < 1) {
              if (r2 > 0.72) return C_PUPIL; // dark rim, no pupil (official art)
              return r2 < 0.25 && dv > 0.1 ? C_EYE_L : C_EYE;
            }
          } else if (kind === 'happy') {
            // ^ arc
            const rr = Math.sqrt(r2);
            if (dv > -0.2 && rr > 0.62 && rr < 0.95) return C_PUPIL;
          } else if (kind === 'blink') {
            if (Math.abs(dv + 0.1) < 0.17 && Math.abs(da) < 0.95) return C_PUPIL;
          } else {
            // closed: ‿ arc
            const rr = Math.sqrt(r2);
            if (dv < 0.1 && rr > 0.62 && rr < 0.95) return C_PUPIL;
          }
        }
        // mouth: a wide dark oval below the eyes, opening downward
        const ma = az / mouthW, mv = (v - (mouthV - mouthH * 0.6)) / mouthH;
        if (mo > 0.05 && ma * ma + mv * mv < 1) return mo > 0.35 && mv < -0.2 && Math.abs(ma) < 0.6 ? C_TONGUE : C_MOUTH;
      }
      return C_LAVA;
    };
    const headPrim = ellF(head, HEAD_R, 3, 3, headMat);
    prims.push(headPrim);
    anchors.head = head.t;
    anchors.mouth = inF(head, sc([Math.cos(0) * 0.9, mouthV - mouthH * 0.3, 0], 1).map((x, i) => x * HEAD_R[i]));
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(head, [s[0] * HEAD_R[0], s[1] * HEAD_R[1], s[2] * HEAD_R[2]]);
    }

    /* --- crown: flame-like lava tendrils licking up and back from the head --- */
    const FLAMES = [[-2, 18, 0, 0.35, 30, 8], [4, 16, -12, 0.2, 22, 6.5], [4, 16, 12, 0.2, 22, 6.5], [-14, 14, 6, 0.9, 18, 5.5], [-14, 14, -6, 0.9, 18, 5.5]];
    FLAMES.forEach(([x, y, z, back, len, r], i) => {
      const k = 1 + 0.12 * w(i * 1.7 + 0.5);
      const p0 = inF(head, [x, y, z]);
      const d = nrm([-Math.sin(back), Math.cos(back), z * 0.03]);
      const p1 = add(p0, sc(d, len * 0.55 * k));
      const d2 = nrm(add(d, [-0.55, 0.1, z * 0.02]));
      const p2 = add(p1, sc(d2, len * 0.5 * k));
      prims.push(seg(p0, p1, r, r, 4, 4, M_LAVA));
      prims.push(seg(sub(p1, sc(d, 2)), p2, r * 0.62, r * 0.62, 4, 4, M_LAVA));
      prims.push(seg(sub(p2, sc(d2, 3)), add(p2, sc(nrm(add(d2, [-0.6, 0.4, 0])), len * 0.3)), r * 0.3, r * 0.3, 4, 4, M_LAVA));
    });
    anchors.top = inF(head, [-4, 18 + 26, 0]);

    /* --- molten drips hanging off the head's rim --- */
    const DRIPS = [[0.62, 0.9, 4.6], [-0.62, 0.9, 4.6], [0.05, 0.55, 4], [1.2, 0.6, 4.2], [-1.25, 0.7, 4.2]];
    DRIPS.forEach(([az, len, r], i) => {
      const s = Creature.sph(az, -0.28);
      const root = inF(head, [s[0] * HEAD_R[0] * 0.92, s[1] * HEAD_R[1] * 0.92, s[2] * HEAD_R[2] * 0.92]);
      const L = (8 + 12 * len) * (1 + 0.25 * w(i * 1.3 + 2));
      const out = nrm([s[0], 0, s[2]]);
      const tip = add(root, add(sc(out, 2.5), [0, -L, 0]));
      prims.push(seg(root, tip, r, r, 5 + (i % 2), 5, M_LAVA));
      prims.push(ellF(T(...add(tip, [0, 1, 0])), [r * 1.1, r * 1.2, r * 1.1], 5 + (i % 2), 5, M_LAVA));
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: LAVA, shadowSteps: 14 };
  }

  const render = (model, opt) => Creature.render(model, opt);

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 200, bh: 170, oy: 0.92 } };
})();
