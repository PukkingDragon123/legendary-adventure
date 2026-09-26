/* ------------------------------------------------------------------
   Remoraid — the Jet Pokémon (0.6 m ≈ 105 px tall with its fins at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is the bottom of the belly (the fins hang a little lower).

   Build: a bullet-shaped mint body — a big rounded head (its groove
   against the body is a contour line), a round "muzzle" at the front
   whose mouth opens into a round jet 'O', a cone-shaped sight on the
   forehead, dark teal stripes along the back, pale veined fins (dorsal,
   forked tail, pectorals, pelvics). Target-like eye stamps with a
   cross-hair line fore and aft of each eye.

   Pose parameters (all optional):
     mouth   0..1   closed slit .. wide round jet mouth (Water Gun)
     tail   -1..1   tail sway toward -z (-1) .. +z (+1) (swimming wiggle)
     fins    0..1   fins folded (0) .. flared out (1); default 0.35
     aim    -1..1   body pitched nose down (-1) .. nose up (+1) (±0.5 rad), for aiming shots
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'angry'
   Anchors: top, head, mouth (jet nozzle), eyeN, eyeF, body, tail, dorsal, finN, finF.
------------------------------------------------------------------- */
const Remoraid = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, STRIPE = 2, FIN = 3, MUZZLE = 4, MOUTH = 5, VEIN = 6;
  const MAT = { BODY, STRIPE, FIN, MUZZLE, MOUTH, VEIN };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#5e8f88', '#7fb2a9', '#a3cfc6', '#c4e6de', '#e6f8f3'], od: '#284a48', ol: '#4f7c77', ln: '#4b7771' },
    [STRIPE]: { r: ['#2e5d5a', '#3f7470', '#528a84', '#68a09a', '#86b8b1'], od: '#1c3e3c', ol: '#35625e', ln: '#2f5a56' },
    [MUZZLE]: { r: ['#6c9d95', '#8dbfb5', '#b2dbd2', '#d0ede6', '#effbf8'], od: '#284a48', ol: '#4f7c77', ln: '#4b7771' },
    [FIN]:    { r: ['#a8bdb4', '#c6d8cf', '#e2eee7', '#f2f8f4', '#ffffff'], od: '#4f6a62', ol: '#7f978e', ln: '#9aaea6' },
    [MOUTH]:  { r: ['#1c2a30', '#27383e', '#35484e', '#465c60', '#5a7274'], od: '#101a1e', ol: '#1c2a30', ln: '#1c2a30' },
    [VEIN]:   { r: ['#8ea69c', '#a3b9af', '#b6cac1', '#c8d8d0', '#dae6e0'], od: '#4f6a62', ol: '#7f978e', ln: '#8aa097' },
  });
  const GLOSSY = { [BODY]: 1, [MUZZLE]: 1 };
  const C_BODY = code(BODY), C_STRIPE = code(STRIPE), C_FIN = code(FIN, 1), C_MUZZLE = code(MUZZLE), C_MOUTH = code(MOUTH);
  const M_BODY = () => C_BODY;

  const DEFAULT = { mouth: 0, tail: 0, fins: 0.35, aim: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const sphP = (az, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); return [c * Math.cos(az), v, c * Math.sin(az)]; };
  // fin plate with vein lines: shape in (u, v) with u along the fin, v across
  function finShape(ctrl, veins) {
    return { shape: bakeShape(Shape2D.poly(ctrl, C_FIN, 8)), lines: veins.map((pl) => ({ pts: Shape2D.catmull(pl, false, 5).map(([u, v]) => [u, v, 0]), mat: VEIN, useLn: true })) };
  }

  /* ---------- geometry (body frame: origin under the body centre) ---------- */
  const HEAD_C = [10, 27.5, 0], HEAD_R = [27, 27, 23.5];
  const BODY_C = [-12, 26.5, 0], BODY_R = [32, 25, 21.5];
  const REAR_C = [-38, 26, 0], REAR_R = [15, 12.5, 9.5];
  const MUZ_C = [31, 20, 0], MUZ_R = [7.5, 11.5, 13];
  // stripes on the upper back (body-ellipsoid unit sphere): [azimuth from the back, v, half-length, half-width]
  const STRIPES = [
    { az: 2.2, v: 0.66, a: 0.7, b: 0.12 },
    { az: 2.1, v: 0.32, a: 0.6, b: 0.11 },
    { az: 2.2, v: 0.02, a: 0.45, b: 0.1 },
  ];
  // fins (plates; u = along, v = across)
  const DORSAL = finShape([[0, 0], [6, 6], [16, 20], [30, 32], [34, 33], [30, 24], [26, 12], [24, 0], [12, -2]], [[[4, 2], [18, 16], [31, 29]], [[12, 1], [24, 14], [30, 25]]]);
  const TAILF = finShape([[0, -7], [8, -14], [22, -30], [34, -40], [37, -38], [30, -22], [27, -6], [28, 6], [34, 24], [36, 34], [32, 34], [20, 22], [8, 12], [0, 7]],
    [[[2, -3], [18, -20], [33, -36]], [[4, 0], [18, -2], [27, -2]], [[2, 3], [16, 14], [32, 31]]]);
  const PECT = finShape([[0, -4], [8, -6], [18, -8], [24, -6], [20, -1], [12, 3], [2, 5]], [[[2, 0], [12, -3], [21, -5]]]);
  const PELV = finShape([[0, -3], [6, -5], [13, -6], [16, -4], [12, 0], [5, 3]], [[[2, 0], [9, -3], [14, -4]]]);

  /* ---------- face decals ---------- */
  const EYE_AZ = 1.02, EYE_V = 0.04; // on the head ellipsoid
  const EYE_W = 0.34;                // angular half-width of the eye (for the cross-hair lines)
  const HAIRS = [];
  for (const sd of [1, -1]) {
    HAIRS.push([sphP(sd * (EYE_AZ - EYE_W), EYE_V), sphP(sd * (EYE_AZ - EYE_W - 0.16), EYE_V - 0.02)]);
    HAIRS.push([sphP(sd * (EYE_AZ + EYE_W), EYE_V), sphP(sd * (EYE_AZ + EYE_W + 0.26), EYE_V - 0.02)]);
  }

  const PRI = {};
  for (let i = 1; i < 16; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 0, 2: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3 });

  const SIZE = 1.08;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const mo = clamp(P.mouth, 0, 1), tw = clamp(P.tail, -1, 1), fins = clamp(P.fins, 0, 1), aim = clamp(P.aim, -1, 1);
    const side = P.side === undefined ? 1 : clamp(P.side, -1, 1);
    const body = chain(T(0, 26, 0), R(M3.rz(aim * 0.5)), T(0, -26, 0));

    /* --- muzzle (front) with the mouth: a slit that opens into a round jet 'O' */
    const muzF = chain(body, T(MUZ_C[0] + mo * 2.5, MUZ_C[1], 0));
    const orad = mo * 0.62;
    const muzMat = (s) => {
      if (s[0] > 0.2) {
        const r = Math.hypot(s[1] / 0.95, s[2]);
        if (orad > 0.05) {
          if (r < orad) return code(MOUTH, r < orad * 0.55 ? -1 : 0);
          if (r < orad + 0.12) return code(MUZZLE, 1); // pale lip ring
        }
      }
      return C_MUZZLE;
    };
    const muzPrim = ellF(muzF, [MUZ_R[0], MUZ_R[1] * (1 + mo * 0.12), MUZ_R[2] * (1 + mo * 0.1)], 5, 5, muzMat);
    prims.push(muzPrim);

    /* --- head (big rounded dome; grp 2 so its groove against the body is drawn) */
    const headF = chain(body, T(...HEAD_C));
    const headPrim = ellF(headF, HEAD_R, 1, 2, M_BODY);
    prims.push(headPrim);

    /* --- forehead sight (cone) */
    const hornBase = inF(headF, [2, HEAD_R[1] * 0.78, 0]);
    const hornDir = nrm(M3.v(body.L, [-0.42, 1, 0]));
    const hornTip = add(hornBase, sc(hornDir, 20));
    {
      const X = hornDir, Z = nrm(cross(X, M3.v(body.L, [1, 0, 0]))), Y = cross(Z, X);
      const Lh = M3.cols(X, Y, Z);
      prims.push(E(add(hornBase, sc(hornDir, 6)), M3.mul(Lh, M3.diag(13, 7.5, 5.2)), 6, 6, (s) => (s[0] > 0.97 ? 0 : C_BODY)));
      prims.push(E(add(hornBase, sc(hornDir, 13)), M3.mul(Lh, M3.diag(8, 4.2, 3.2)), 6, 6, M_BODY));
    }

    /* --- body with stripes, and the tail peduncle (sways) */
    const bodyF = chain(body, T(...BODY_C));
    const stripeMat = (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az);
      for (const st of STRIPES) {
        const du = (a - st.az) / st.a, dv = (s[1] - st.v) / st.b;
        if (du * du + dv * dv < 1) return C_STRIPE;
      }
      return C_BODY;
    };
    prims.push(ellF(bodyF, BODY_R, 2, 1, stripeMat));
    const tailF = chain(body, T(REAR_C[0] + 10, REAR_C[1], 0), R(M3.ry(-tw * 0.45)), T(-10, 0, 0));
    prims.push(ellF(tailF, REAR_R, 3, 1, M_BODY));

    /* --- fins */
    // tail fin: vertical plate behind the peduncle, swaying further than the body
    const tfF = chain(tailF, T(-REAR_R[0] + 3, 0, 0), R(M3.ry(-tw * 0.35)));
    const tailFin = PL(tfF.t, M3.mul(tfF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 7, 7, TAILF.shape, 1.4);
    tailFin.lines = TAILF.lines;
    prims.push(tailFin);
    // dorsal fin on the back, raised by `fins`
    const dF = chain(bodyF, T(-4, BODY_R[1] * 0.86, 0), R(M3.rz(0.1 - fins * 0.16)), R(M3.rx(side * 0.1)));
    const dorsal = PL(dF.t, M3.mul(dF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 8, 8, DORSAL.shape, 1.4);
    dorsal.lines = DORSAL.lines;
    prims.push(dorsal);
    // pectoral fins behind the eyes, pelvic fins under the chin
    const finTips = [];
    for (const sd of [1, -1]) {
      const pf = chain(headF, T(-12, -9, sd * 18.5), R(M3.ry(sd * (0.35 + fins * 0.5))), R(M3.rz(-0.35 + fins * 0.15)), R(M3.rx(sd * 0.25)));
      const pect = PL(pf.t, M3.mul(pf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), sd > 0 ? 9 : 10, sd > 0 ? 9 : 10, PECT.shape, 1.4);
      pect.lines = PECT.lines;
      prims.push(pect);
      finTips.push(inF(pf, [-22, -6, 0]));
      const vf = chain(headF, T(4, -HEAD_R[1] * 0.86, sd * 8), R(M3.ry(sd * (0.3 + fins * 0.35))), R(M3.rz(-0.95 + fins * 0.2)));
      const pelv = PL(vf.t, M3.mul(vf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), 11, 11, PELV.shape, 1.3);
      pelv.lines = PELV.lines;
      prims.push(pelv);
    }

    /* --- eyes (target stamps) and their cross-hair decals */
    const eyeKind = P.eyes === 'closed' ? 'blink' : ['happy', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    for (const sd of [1, -1]) {
      const s = sphP(sd * EYE_AZ, EYE_V);
      const at = { prim: headPrim, p: inF(headF, [s[0] * HEAD_R[0], s[1] * HEAD_R[1], s[2] * HEAD_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.7, far: 0.42, minFacing: 0.2, toFront: [MUZ_C[0] - s[0] * HEAD_R[0] - HEAD_C[0], -s[2] * HEAD_R[2]] });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    const decals = HAIRS.map((pts) => ({ pts, mat: STRIPE, tone: 0 }));
    if (mo < 0.06) decals.push({ pts: [[0.88, -0.02, 0.47], [0.96, 0, 0.2], [0.99, 0.02, 0], [0.96, 0, -0.2], [0.88, -0.02, -0.47]], mat: MOUTH, tone: 2, muz: true });

    Object.assign(anchors, {
      top: hornTip,
      head: headF.t,
      mouth: inF(muzF, [MUZ_R[0], 0, 0]),
      body: bodyF.t,
      tail: inF(tfF, [-34, 0, 0]),
      dorsal: inF(dF, [-32, 32, 0]),
      finN: finTips[0], finF: finTips[1],
    });
    if (SIZE !== 1) {
      for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
      for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
      for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    }
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 16, headPrim, muzPrim, decals };
  }

  /* ---------- eye stamps: round target eyes (k = black ring / pupil, w = white, b = navy lower pupil).
     Open eyes are hand-drawn per size; N / F = the eye turned away (narrower). Happy / blink / angry
     glyphs are generated; angry lids slant down toward the snout (flipped per view in render()). */
  function eyeGlyph(n, sx, kind) {
    const w = Math.max(2, Math.round(n * sx)), h = n;
    const cx = w / 2, cy = h / 2;
    const inD = (x, y, rx = w / 2, ry = h / 2, ox = 0, oy = 0) => x >= 0 && y >= 0 && x < w && y < h && ((x + 0.5 - cx - ox) / rx) ** 2 + ((y + 0.5 - cy - oy) / ry) ** 2 <= 1;
    const G = [];
    for (let y = 0; y < h; y++) G.push(new Array(w).fill('.'));
    const ringOf = (test) => {
      const out = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x, y) && (!test(x - 1, y) || !test(x + 1, y) || !test(x, y - 1) || !test(x, y + 1))) out.push([x, y]);
      return out;
    };
    if (kind === 'blink') {
      const ww = Math.max(2, w - 2), y0 = Math.floor(h / 2);
      const rows = [];
      let r0 = '', r1 = '';
      for (let x = 0; x < w; x++) {
        r0 += x >= (w - ww) / 2 && x < (w + ww) / 2 ? 'k' : '.';
        r1 += x >= (w - ww) / 2 + Math.max(1, ww / 5) && x < (w + ww) / 2 - Math.max(1, ww / 5) ? 'k' : '.';
      }
      return n >= 9 ? [r0, r1] : [r0, r1.includes('k') ? r1 : r0.replace(/k/g, '.')].filter((r) => r.includes('k'));
    }
    if (kind === 'happy') {
      const ry = Math.max(1.6, h * 0.3), test = (x, y) => x >= 0 && x < w && y >= 0 && y < h && ((x + 0.5 - cx) / (w / 2)) ** 2 + ((y + 0.5 - (ry + 0.5)) / ry) ** 2 <= 1;
      for (const [x, y] of ringOf(test)) if (y + 0.5 <= ry + 0.9) G[y][x] = 'k';
      const rows = G.map((r) => r.join(''));
      while (rows.length && !rows[rows.length - 1].includes('k')) rows.pop();
      return rows;
    }
    const D = (x, y) => inD(x, y);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (D(x, y)) G[y][x] = 'w';
    let ring = ringOf(D);
    for (const [x, y] of ring) G[y][x] = 'k';
    if (n >= 13) { // thicker ring on big eyes
      const D2 = (x, y) => D(x, y) && G[y][x] !== 'k';
      for (const [x, y] of ringOf(D2)) if (Math.abs(y + 0.5 - cy) > h * 0.25 || Math.abs(x + 0.5 - cx) > w * 0.3) G[y][x] = 'k';
    }
    // pupil
    const prx = Math.max(0.5, w * 0.17), pry = Math.max(1, h * 0.26);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!D(x, y) || G[y][x] === 'k') continue;
      const px = (x + 0.5 - cx) / prx, py = (y + 0.5 - cy - h * 0.02) / pry;
      if (px * px + py * py <= 1.05) G[y][x] = py > 0.3 && n >= 9 ? 'b' : 'k';
    }
    if (n >= 9) { // glint on the pupil's upper left
      const gx = Math.floor(cx - prx * 0.45), gy = Math.floor(cy - pry * 0.55);
      if (G[gy] && G[gy][gx] === 'k') G[gy][gx] = 'w';
      if (n >= 13 && G[gy + 1] && G[gy + 1][gx] === 'k') G[gy + 1][gx] = 'w';
    }
    if (kind === 'angry') {
      const lid = (x) => h * 0.12 + (x + 0.5) / w * h * 0.42; // lower toward the front (+x)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (G[y][x] === '.') continue;
        const l = lid(x);
        if (y + 0.5 < l - 1) G[y][x] = '.';
        else if (y + 0.5 < l) G[y][x] = 'k';
      }
    }
    const rows = G.map((r) => r.join(''));
    while (rows.length && !/[kwb]/.test(rows[0])) rows.shift();
    return rows;
  }

  const OPEN = {
    5: [['.kkk.', 'kwwwk', 'kwkwk', 'kwbwk', '.kkk.'], ['.kk.', 'kwwk', 'kwkk', 'kwbk', '.kk.'], ['.k.', 'kwk', 'kkk', 'kbk', '.k.']],
    7: [['..kkk..', '.kwwwk.', 'kwwkwwk', 'kwwkwwk', 'kwwbwwk', '.kwwwk.', '..kkk..'],
      ['.kkk.', 'kwwwk', 'kwkwk', 'kwkwk', 'kwbwk', 'kwwwk', '.kkk.'],
      ['.k.', 'kwk', 'kkk', 'kkk', 'kbk', 'kwk', '.k.']],
    10: [['...kkkk...', '.kkwwwwkk.', '.kwwwwwwk.', 'kwwwwkwwwk', 'kwwwkkwwwk', 'kwwwkkwwwk', 'kwwwbbwwwk', '.kwwwwwwk.', '.kkwwwwkk.', '...kkkk...'],
      ['..kkk..', '.kwwwk.', 'kwwwwwk', 'kwwwkwk', 'kwwkkwk', 'kwwkkwk', 'kwwbbwk', 'kwwwwwk', '.kwwwk.', '..kkk..'],
      ['.kkk.', 'kwwwk', 'kwkwk', 'kwkwk', 'kwkwk', 'kwbwk', 'kwwwk', '.kkk.']],
    14: [['....kkkkkk....', '..kkwwwwwwkk..', '.kwwwwwwwwwwk.', '.kwwwwkkwwwwk.', 'kwwwwkwkkwwwwk', 'kwwwwkwkkwwwwk', 'kwwwwkkkkwwwwk', 'kwwwwkkbbwwwwk', 'kwwwwkbbbwwwwk', '.kwwwwkkwwwwk.', '.kwwwwwwwwwwk.', '..kkwwwwwwkk..', '....kkkkkk....'],
      ['...kkkk...', '.kkwwwwkk.', '.kwwwwwwk.', 'kwwwwkkwwk', 'kwwwkwkkwk', 'kwwwkwkkwk', 'kwwwkkkkwk', 'kwwwkkbbwk', 'kwwwkbbbwk', 'kwwwwkkwwk', '.kwwwwwwk.', '.kkwwwwkk.', '...kkkk...'],
      ['..kkk..', '.kwwwk.', 'kwwwwwk', 'kwwkkwk', 'kwkwkwk', 'kwkkkwk', 'kwkkkwk', 'kwkbbwk', 'kwwkkwk', 'kwwwwwk', '.kwwwk.', '..kkk..']],
  };
  function eyeSet(n) {
    const o = { open: OPEN[n][0], openN: OPEN[n][1], openF: OPEN[n][2] };
    for (const kind of ['happy', 'blink', 'angry']) {
      o[kind] = eyeGlyph(n, 1, kind);
      o[kind + 'N'] = eyeGlyph(n, 0.72, kind);
      o[kind + 'F'] = eyeGlyph(n, 0.5, kind);
    }
    return o;
  }
  const EYES_XS = eyeSet(5), EYES_S = eyeSet(7), EYES_M = eyeSet(10), EYES_L = eyeSet(14);
  const EYEC = { k: '#111a1e', w: '#ffffff', b: '#2c4c78' };

  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1 } = opt;
    const set = scale >= 0.85 ? EYES_L : scale >= 0.55 ? EYES_M : scale >= 0.36 ? EYES_S : EYES_XS;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const st of model.stamps) {
      st.set = set;
      st.flipX = cy * st.toFront[0] - sy * st.toFront[1] < 0; // angry lids slant down toward the snout
    }
    // 1-px decals (cross-hairs on the head, the closed mouth slit on the muzzle), culled when facing away
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const facing = (p, q) => {
      const Li = M3.inv(M3.mul(V, p.L));
      const nz = Li[2] * q[0] + Li[5] * q[1] + Li[8] * q[2];
      return nz / Math.hypot(Li[0] * q[0] + Li[3] * q[1] + Li[6] * q[2], Li[1] * q[0] + Li[4] * q[1] + Li[7] * q[2], nz);
    };
    model.headPrim.lines = model.decals.filter((d) => !d.muz && facing(model.headPrim, d.pts[0]) > 0.25);
    model.muzPrim.lines = model.decals.filter((d) => d.muz && facing(model.muzPrim, d.pts[2]) > 0.1);
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 208, bh: 190, oy: 0.645 } };
})();
