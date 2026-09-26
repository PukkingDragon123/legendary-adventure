/* ------------------------------------------------------------------
   Luvdisc — the Rendezvous Pokémon (0.6 m ≈ 105 px heart at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, y = 0 at the
   bottom of the heart.

   Build: a laterally thin heart (upper and lower lobe ellipsoids plus a
   filler; the cleft is at the back) whose point faces forward and ends in
   puckered pale lips (two lip ellipsoids meeting at the mouth line).
   Dark-blue eye stamps and pale cheek patches on both sides.
------------------------------------------------------------------- */
const Luvdisc = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, LIPS = 2, CHEEK = 3, BLUSH = 4;
  const MAT = { BODY, LIPS, CHEEK, BLUSH };
  const PAL = Creature.palette({
    [BODY]: { r: ['#bc5a72', '#d97f8b', '#ea959c', '#f6b4b6', '#ffd4d2'], od: '#6a1e34', ol: '#a8465c', ln: '#a8465c' },
    [LIPS]: { r: ['#d49aa4', '#e8b6bd', '#f6d2d5', '#fde4e4', '#fff5f3'], od: '#6a1e34', ol: '#9a4458', ln: '#8a3a4e' },
    [CHEEK]: { r: ['#dc9aa4', '#eebcc2', '#fad8da', '#ffeceb', '#fff8f7'], od: '#6a1e34', ol: '#9a4458', ln: '#8a3a4e' },
    [BLUSH]: { r: ['#d2385e', '#e84f74', '#f76a8c', '#ff8aa6', '#ffb4c6'], od: '#6a1e34', ol: '#a8304e', ln: '#b0304f' },
  });
  const GLOSSY = { [LIPS]: 1 };
  const NO_DOTS = [{}].slice(1); // empty, but with the elements kind of Mudkip's dot list
  const C_BODY = code(BODY), C_LIPS = code(LIPS), C_CHEEK = code(CHEEK), C_BLUSH = code(BLUSH);
  const C_BODY_L = code(BODY, 1);
  const M_BODY = () => C_BODY, M_BODY_L = () => C_BODY_L, M_LIPS = () => C_LIPS, M_CHEEK = () => C_CHEEK, M_BLUSH = () => C_BLUSH;

  // ---- helpers
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  // Primitives, stamps and the model reuse Mudkip's exact object layouts (monomorphic renderer).
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);

  // ---- body (heart) geometry, fitted to the official silhouette (side view)
  const CEN = [0, 52, 0]; // pivot for tilt / wiggle
  const THK = 10; // half-thickness (laterally thin)
  const LOBES = [
    { c: [-8, 74.6, 0], r: [31.6, 19.6, THK], a: -1.29 }, // upper lobe
    { c: [-7.2, 27.3, 0], r: [27.5, 20.4, THK], a: 1.4 }, // lower lobe
    { c: [-7, 52, 0], r: [15.5, 30, THK + 0.8], a: 0 }, // central filler (smooths the mid crease, fills the cleft)
    { c: [10.2, 67.6, 0], r: [27, 6, THK * 0.55], a: -1.15 }, // upper front edge (runs into the lips)
    { c: [10, 32, 0], r: [28.8, 6.4, THK * 0.55], a: 1.18 }, // lower front edge
  ];
  // lips: two small ellipsoids converging at the front (the mouth line is their seam)
  const LIP_C = [18.4, 49.5, 0];

  // ---- face: eye and cheek positions on the side of the body (model units)
  const EYE_P = [0.5, 59.5], CHEEK_P = [-4.2, 50];
  // unit-sphere direction on the filler's side surface at model (x, y), side ±1
  const FILL = LOBES[2];
  function sideDir(x, y, side) {
    const u = (x - FILL.c[0]) / FILL.r[0], v = (y - FILL.c[1]) / FILL.r[1];
    return [u, v, side * Math.sqrt(Math.max(0.02, 1 - u * u - v * v))];
  }

  const PRI = {};
  for (let i = 1; i < 9; i++) PRI[i] = 0;
  Object.assign(PRI, { 5: 3, 7: 4, 8: 4 });

  const DEFAULT = { wiggle: 0, kiss: 0, eyes: 'open', tilt: 0, blush: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    // whole-body pitch about the heart's centre
    const body = chain(F(M3.I(), CEN), R(M3.rz(P.tilt)), T(-CEN[0], -CEN[1], -CEN[2]));
    // the back of the heart swings sideways (swimming wiggle), pivoting near the snout
    const wig = Math.max(-1, Math.min(1, P.wiggle));
    const back = chain(body, T(6, 0, 0), R(M3.ry(wig * 0.32)), T(-6, 0, 0));

    // --- cheeks (patches on the body's sides), in front of the body
    const bl = Math.max(0, Math.min(1, P.blush));
    const cheekMat = bl > 0.45 ? M_BLUSH : M_CHEEK;
    const cs = 1 + bl * 0.25;
    const fillPrim = ellF(chain(back, T(...FILL.c)), FILL.r, 1, 1, M_BODY);
    for (const side of [1, -1]) {
      const s = sideDir(CHEEK_P[0], CHEEK_P[1], side);
      const nw = nrm([s[0] / FILL.r[0], s[1] / FILL.r[1], s[2] / FILL.r[2]]);
      const up = nrm(sub([0, 1, 0], sc(nw, nw[1])));
      const ax = M3.cols(cross(up, nw), up, nw);
      const cLoc = sub(add(FILL.c, [FILL.r[0] * s[0], FILL.r[1] * s[1], FILL.r[2] * s[2]]), sc(nw, 1.2));
      const id = side > 0 ? 7 : 8;
      prims.push(E(inF(back, cLoc), M3.mul(back.L, M3.mul(ax, M3.diag(4.1 * cs, 7 * cs, 2))), id, id, cheekMat));
    }

    // --- lips (front-most): a round blob plus two beak halves converging on a point;
    //     the mouth line is a decal in the mid-plane, so it reads from either side
    // kiss: the pucker pushes forward while the lips' base stays anchored in the body
    const k = Math.max(0, Math.min(1, P.kiss));
    const lipBase = chain(body, T(LIP_C[0] + k * 1.6, LIP_C[1], 0), R(M3.diag(1, 1 + k * 0.06, 1 + k * 0.1)));
    const bx = 9.2 * (1 + k * 0.3), bt = 0.55 + k * 0.2, by = 2.3 - k * 0.3, fx = bx - 4.6;
    prims.push(ellF(chain(lipBase, T(fx, by, 0), R(M3.rz(-bt))), [6.8, 3.7, 6.2], 5, 5, M_LIPS));
    prims.push(ellF(chain(lipBase, T(fx, -by, 0), R(M3.rz(bt))), [6.8, 3.7, 6.2], 5, 5, M_LIPS));
    const blob = ellF(lipBase, [bx, 8.2, 8.6], 5, 5, M_LIPS);
    const tip = (fx + 6.8 * Math.cos(bt) * 0.98) / bx;
    blob.lines = [{ pts: [[tip, 0, 0], [tip * 0.5, 0.02, 0], [tip * 0.18, 0.06, 0]], tone: 1, mat: LIPS, useLn: true }];
    prims.push(blob);

    // --- body lobes
    prims.push(fillPrim);
    // (the upper front edge is one tone lighter: the official art's highlight along that edge)
    LOBES.forEach((l, i) => {
      if (i !== 2) prims.push(ellF(chain(back, T(...l.c), R(M3.rz(l.a))), l.r, 1, 1, i === 3 ? M_BODY_L : M_BODY));
    });

    // --- eyes (stamps on the sides; far-side set is mirrored so the highlight stays toward the back)
    for (const side of [1, -1]) {
      const s = sideDir(EYE_P[0], EYE_P[1], side);
      const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' || P.eyes === 'closed' ? 'blink' : 'open';
      stamps.push({ at: { prim: fillPrim, p: add(fillPrim.c, M3.v(fillPrim.L, s)), s }, set: side > 0 ? EYES : EYES_M, colors: EYEC, kind });
    }

    anchors.lips = inF(lipBase, [fx + 6.8 * Math.cos(bt), 0, 0]);
    anchors.top = inF(back, [-12, 105, 0]);
    anchors.center = inF(body, CEN);
    return { prims, anchors, pose: P, headPrim: fillPrim, stamps, dots: NO_DOTS, pri: PRI, glossy: GLOSSY, baseMat: BODY };
  }

  /* ---------- eye stamps (Mudkip's key layout) ----------
     k = black, b = dark blue, c = blue, w = white highlight (toward the back of the fish) */
  const mirror = (g) => g.map((row) => row.split('').reverse().join(''));
  const G_OPEN = ['..kkk..', '.kkkkk.', 'kwwkkkk', 'kwwkkkk', 'kwkkkkk', 'kkkkkkk', 'kkkkbbk', 'kkkbbbk', 'kkbbbbk', '.kbbbk.', '..kkk..'];
  const G_OPEN_N = ['.kkkk.', 'kwwkkk', 'kwwkkk', 'kwkkkk', 'kkkkkk', 'kkkkkk', 'kkkbbk', 'kkbbbk', 'kbbbbk', '.kbbk.', '..kk..'];
  const G_OPEN_F = ['.kkk.', 'kwkkk', 'kwkkk', 'kkkkk', 'kkkkk', 'kkkbk', 'kkbbk', 'kbbbk', '.kbk.'];
  const G_HAPPY = ['...k...', '..kkk..', '.kk.kk.', 'kk...kk', 'k.....k'];
  const G_BLINK = ['.......', '.......', '.......', '.......', 'kkkkkkk', '.kkkkk.'];
  const mk = (tr) => ({
    open: tr(G_OPEN), openN: tr(G_OPEN_N), openF: tr(G_OPEN_F),
    happy: tr(G_HAPPY), happyN: tr(['..kk..', '.kkkk.', 'kk..kk', 'k....k']), happyF: tr(['..k..', '.kkk.', 'kk.kk', 'k...k']),
    blink: tr(G_BLINK), blinkN: tr(['......', '......', '......', '......', 'kkkkkk', '.kkkk.']), blinkF: tr(['.....', '.....', '.....', 'kkkkk', '.kkk.']),
    sleep: tr(['k...k', '.kkk.']), sleepN: tr(['k..k', '.kk.']), sleepF: tr(['k..', '.kk']),
  });
  const EYES = mk((g) => g), EYES_M = mk(mirror);
  const EYEC = { k: '#140c1c', w: '#ffffff', b: '#26538a' };

  const render = (model, opt) => Creature.render(model, opt);

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 94, bh: 118, oy: 0.94 } };
})();
