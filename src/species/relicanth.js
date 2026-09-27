/* ------------------------------------------------------------------
   Relicanth — the Longevity Pokémon (1.0 m ≈ 175 units long at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is the
   tips of the lower fins (it rests on the sea floor on them).

   Design (official art / HOME model): an ancient rock fish. A big tan
   armoured head — a steep domed helmet with bulging cheek plates at the
   lower back and a protruding, upturned lower jaw (a grumpy underbite),
   squinting slit eyes under a creased brow. A deep dark-grey body with
   jigsaw-edged tan patches and one red hexagon spot on each side behind
   the head; a tan first dorsal fin, and big lobed grey fins: a paddle
   second dorsal, pectoral and pelvic pairs, a long anal fin and a spiky
   diamond tail fin.

   Pose params:
     swim   phase (rad)  swimming: tail stock and tail fin sweep, fins paddle
     fins   -1..1        fin spread: +1 fanned out and erect, −1 folded back against the body
     mouth  0..1         lower jaw drops open
     eyes   'open' | 'closed' | 'blink' | 'happy'
     tilt   -1..1        pitch of the whole fish (+ = nose up), ±0.4 rad
     side   -1..1        ≈ cos(yaw), passed by the game (unused, accepted)
   Anchors: top (first dorsal fin tip, above the head), head (head centre), mouth,
   eyeN, eyeF, body (body centre), tail (tail fin centre), finN, finF (pectoral fin
   tips), spotN, spotF (red spots), jaw (lower jaw tip).
------------------------------------------------------------------- */
const Relicanth = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, HEAD = 2, PATCH = 3, FIN = 4, RED = 5, EYE = 6, MOUTH = 7;
  const MAT = { BODY, HEAD, PATCH, FIN, RED, EYE, MOUTH };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#3c3634', '#4f4845', '#655d59', '#7b7370', '#978f8b'], od: '#211d1c', ol: '#3a3432', ln: '#332d2b' },
    [HEAD]:  { r: ['#8a7862', '#a8957c', '#c4b299', '#d9cab2', '#eee4d2'], od: '#4a3c2c', ol: '#7a6852', ln: '#6c5a46' },
    [PATCH]: { r: ['#857663', '#a1917b', '#baaa92', '#cfc0a8', '#e4d9c6'], od: '#473a2c', ol: '#766650', ln: '#685844' },
    [FIN]:   { r: ['#39332f', '#4a4340', '#5c5451', '#6f6764', '#89817d'], od: '#1e1a19', ol: '#37312f', ln: '#2c2725' },
    [RED]:   { r: ['#961a2e', '#bc2a40', '#dc475a', '#ee6f7e', '#fca6ae'], od: '#560a18', ol: '#86182a', ln: '#86182a' },
    [EYE]:   { r: ['#140e0c', '#1a1310', '#211815', '#2a201c', '#3a2e28'], od: '#0e0a08', ol: '#140e0c', ln: '#0e0a08' },
    [MOUTH]: { r: ['#3a1416', '#4e1c1e', '#642628', '#7a3234', '#904244'], od: '#240a0c', ol: '#3a1214', ln: '#3a1214' },
  });
  const GLOSSY = {};
  const C_BODY = code(BODY), C_HEAD = code(HEAD), C_HEAD_D = code(HEAD, -1), C_PATCH = code(PATCH), C_FIN = code(FIN), C_FIN_D = code(FIN, -1), C_FIN_P = code(PATCH, -1);
  const C_RED = code(RED), C_EYE = code(EYE), C_MOUTH = code(MOUTH);

  const DEFAULT = { swim: 0, fins: 0, mouth: 0, eyes: 'open', tilt: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const PL = (f, shape, part, grp, thick, lines, axes) => ({ kind: 'plate', part, grp, c: f.t, L: axes ? M3.mul(f.L, M3.cols(...axes)) : f.L, shape, thick, lines });
  const rays = (list, mat = FIN) => list.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat, useLn: true }));
  // frame whose x axis points along d (in the parent frame), y axis toward `up`
  function aim(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (Math.hypot(Z[0], Z[1], Z[2]) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return F(M3.cols(X, cross(Z, X), Z), [0, 0, 0]);
  }

  /* ---------- patches: jigsaw-edged tan caps on a unit sphere (wavy edge from two harmonics) ---------- */
  function patchSet(list) {
    return list.map(([az, v, r, k1, k2, ph]) => {
      const d = Creature.sph(az, v);
      const e1 = nrm(cross([0, 1, 0], d)), e2 = cross(d, e1);
      return { d, e1, e2, r, k1, k2, ph };
    });
  }
  function inPatch(s, P) {
    for (const p of P) {
      const c = s[0] * p.d[0] + s[1] * p.d[1] + s[2] * p.d[2];
      if (c < Math.cos(p.r * 1.35)) continue;
      const a = Math.acos(clamp(c, -1, 1));
      const th = Math.atan2(s[0] * p.e2[0] + s[1] * p.e2[1] + s[2] * p.e2[2], s[0] * p.e1[0] + s[1] * p.e1[1] + s[2] * p.e1[2]);
      // step-like wobble: the sum of harmonics, quantised a little, gives the jigsaw look
      const w = 0.16 * Math.sin(p.k1 * th + p.ph) + 0.1 * Math.sin(p.k2 * th + 2 * p.ph);
      if (a < p.r * (1 + Math.round(w * 12) / 12)) return true;
    }
    return false;
  }
  // body patches (near side; mirrored for the far side): [azimuth, v, radius, k1, k2, phase]
  const BODY_PATCH = patchSet([
    [-1.72, 0.74, 0.32, 5, 9, 0.4], // behind the head, upper
    [-2.05, -0.14, 0.47, 4, 7, 1.3], // mid, low
    [-2.55, 0.46, 0.38, 5, 8, 2.2], // back, upper
    [-2.9, -0.32, 0.28, 6, 9, 0.9], // back, low
  ].flatMap(([az, v, r, k1, k2, ph]) => [[az, v, r, k1, k2, ph], [-az, v, r, k1, k2, ph + 0.7]]));
  // red hexagon spot on each side behind the head
  const SPOT = [1, -1].map((zs) => { const d = Creature.sph(zs * 1.62, 0.32); const e1 = nrm(cross([0, 1, 0], d)); return { d, e1, e2: cross(d, e1) }; });
  const BODY_R = [51, 30.5, 19];
  function bodyMat(s) {
    for (const p of SPOT) {
      if (s[0] * p.d[0] + s[1] * p.d[1] + s[2] * p.d[2] < 0.8) continue;
      const dx = s[0] - p.d[0], dy = s[1] - p.d[1], dz = s[2] - p.d[2];
      // tangent offsets scaled to model units, then a regular hexagon test
      const u = (dx * p.e1[0] + dy * p.e1[1] + dz * p.e1[2]) * 45, v = (dx * p.e2[0] + dy * p.e2[1] + dz * p.e2[2]) * 30;
      const au = Math.abs(u), av = Math.abs(v), R0 = 5;
      if (av < R0 * 0.866 && au * 0.866 + av * 0.5 < R0 * 0.866) return C_RED;
    }
    return inPatch(s, BODY_PATCH) ? C_PATCH : C_BODY;
  }
  const STOCK_PATCH = patchSet([[-2.3, 0.35, 0.5, 4, 7, 0.5], [2.3, 0.35, 0.5, 4, 7, 1.1]]);
  const stockMat = (s) => (inPatch(s, STOCK_PATCH) ? C_PATCH : C_BODY);

  /* ---------- fins ---------- */
  // straight-edged polygon fin (spiky) with an optional material function
  function polyFin(pts, fn) {
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({ bb, test: (u, v) => (u < bb[0] || u > bb[2] || v < bb[1] || v > bb[3] || !Shape2D.inPoly(u, v, pts) ? 0 : fn(u, v)) }, 0.25);
  }
  const blotch = (list) => (u, v) => { for (const [cu, cv, r] of list) if ((u - cu) ** 2 + (v - cv) ** 2 < r * r) return true; return false; };
  // tail fin (u = backward from the stock, v = up): a spiky diamond with a small rear lobe
  const TAIL_PTS = [[-3, 12], [6, 22], [12, 32], [18, 44], [23, 36], [29, 39], [29.5, 30], [37, 30], [36.5, 21], [45, 19], [41.5, 11], [49, 4], [49, -4], [41.5, -11], [45, -19], [36.5, -21], [37, -30], [29.5, -30], [29, -39], [23, -36], [18, -44], [12, -32], [6, -22], [-3, -12]];
  const TAIL_B = blotch([[31, 13, 6], [36, 9, 4.5], [27, 19, 4.5], [20, -18, 4.2], [25, -22, 3.5]]);
  const TAIL_G = polyFin(TAIL_PTS, (u, v) => (TAIL_B(u, v) ? C_FIN_P : C_FIN));
  const TAIL_RAYS = rays([[[2, 3], [18, 14], [34, 22]], [[2, -3], [18, -14], [34, -22]], [[3, 0], [40, 0]]]);
  // first dorsal (u = forward, v = up): a tan shark-fin triangle leaning back
  const D1_G = polyFin([[18, -4], [15, 3], [6, 14], [-6, 25], [-11, 28], [-10, 17], [-13, 5], [-18, -4]], () => C_HEAD);
  /* lobed fins (second dorsal, pectoral and pelvic pairs, anal): thin oval paddles (flattened
     ellipsoids, so they keep a clean shape at any angle) with dark rays; local x = along the fin
     from its root, y = across, z = the fin's thickness. radii [half length, half width, half thickness] */
  const FIN_RAYS = [-0.45, 0, 0.45];
  function paddleMat(halfW, spots) {
    return (s) => {
      if (spots) for (const [a, b, r] of spots) if ((s[0] - a) ** 2 + ((s[1] - b) * 1.6) ** 2 < r * r) return C_FIN_P;
      if (s[0] > -0.35) {
        const w = Math.max(0.05, (0.5 * px) / halfW);
        for (const k of FIN_RAYS) if (Math.abs(s[1] - k * (0.35 + 0.65 * (s[0] * 0.5 + 0.5))) < w) return C_FIN_D;
      }
      return C_FIN;
    };
  }
  const D2_R = [29, 9.5, 1.7], LOBE_R = [16, 9, 1.6], ANAL_R = [23, 7, 1.6];
  const D2_MAT = paddleMat(D2_R[1], [[-0.25, 0.1, 0.22], [0.25, -0.12, 0.24], [0.68, 0.12, 0.18]]);
  const LOBE_MAT = paddleMat(LOBE_R[1]), ANAL_MAT = paddleMat(ANAL_R[1]);
  // paddle whose root sits at frame f's origin, pointing along f's x axis
  const paddle = (f, r, part, grp, mat) => ellF(chain(f, T(r[0] * 0.92, 0, 0)), r, part, grp, mat);

  /* ---------- eyes: squinting slits under a creased brow (decals on the cranium, sized in pixels) ---------- */
  let px = 1; // model units per pixel (set per render)
  const CRAN_R = [42, 32, 24], HEAD_TILT = 0.9; // helmet radii; nose-down pitch of its long axis
  const HC = Math.cos(HEAD_TILT), HS = Math.sin(HEAD_TILT);
  // eye on the side of the helmet at mid-height (helmet-local direction)
  const EYE_S = [1, -1].map((zs) => nrm([0.3, 0.42, zs * 0.86]));
  function cranMat(kind) {
    return (s) => {
      if (Math.abs(s[2]) < 0.45 || s[0] < -0.2) return C_HEAD;
      const zs = s[2] > 0 ? 1 : -1, q = zs > 0 ? EYE_S[0] : EYE_S[1];
      // offsets in model units on the head side: u forward, v up
      // (the helmet is pitched nose-down: undo it so the slit stays level)
      const ul = (s[0] - q[0]) * CRAN_R[0], vl = (s[1] - q[1]) * CRAN_R[1];
      const u = ul * HC + vl * HS, v = -ul * HS + vl * HC;
      const w = 7.2, lw = Math.max(0.5, 0.55 * px);
      if (Math.abs(u) < w + 1 && v > -4 && v < 1.5) {
        const a = u / w;
        if (Math.abs(a) <= 1) {
          if (kind === 'open') {
            // flat heavy lid on top, a narrow almond below (deepest toward the back)
            const hh = Math.max(lw * 1.6, 2.3 * (1 - a * a) * (1 - 0.25 * a));
            if (v < lw * 0.8 && v > -hh) return C_EYE;
          } else if (kind === 'happy') {
            if (Math.abs(v + 1.6 * a * a - 0.3) < lw) return C_EYE;
          } else if (Math.abs(v + (kind === 'closed' ? 0.8 * (1 - a * a) : 0)) < lw) return C_EYE;
        }
        // the front end of the slit hooks down a touch
        if (a > 0.85 && a < 1.25 && Math.abs(v + (a - 0.85) * 3.5) < lw) return C_EYE;
      }
      // brow crease: a short slanted line above the front of the eye
      {
        const t = clamp((v - 5.5) / 7.5, 0, 1), uc = 2.2 + 1.8 * t;
        if (v > 5.5 && v < 13 && Math.abs(u - uc) < lw * 1.05) return C_EYE;
      }
      return C_HEAD;
    };
  }

  // cheek plate region on the helmet shell (helmet-local unit sphere, levelled): the lower back,
  // behind a diagonal edge running from the mouth corner up to the rear of the head
  function cheekMat(s) {
    const u = s[0] * HC + s[1] * HS, v = -s[0] * HS + s[1] * HC; // levelled: u forward, v up
    if (Math.abs(s[2]) < 0.2) return 0;
    if (v > -0.12 - 0.42 * u || u > 0.62) return 0;
    return v < -0.72 ? C_HEAD_D : C_HEAD;
  }

  const SIZE = 0.94, X0 = 29, Y0 = 1.5; // 175 long; origin mid-body, y = 0 at the lower fin tips

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const swim = +P.swim || 0, fs = clamp(+P.fins || 0, -1, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const tilt = clamp(+P.tilt || 0, -1, 1) * 0.4;
    const kind = P.eyes === 'closed' || P.eyes === 'sleep' ? 'closed' : P.eyes === 'blink' ? 'blink' : P.eyes === 'happy' ? 'happy' : 'open';
    const sw = Math.sin(swim);

    // whole-fish frame (origin mid-body): tilt about the body centre; the front half counter-sways
    // as the tail sweeps
    const BC = [-30, 55, 0];
    const root = chain(T(X0, Y0, 0), T(...BC), R(M3.rz(tilt)), R(M3.ry(0.05 * sw)), T(-BC[0], -BC[1], 0));

    /* --- body, tail stock, tail fin --- */
    const bodyF = chain(root, T(-26, 55, 0));
    prims.push(ellF(bodyF, BODY_R, 1, 1, bodyMat));
    anchors.body = bodyF.t;
    const stockPiv = chain(root, T(-62, 53, 0), R(M3.ry(-0.28 * sw)));
    prims.push(ellF(chain(stockPiv, T(-11, -0.5, 0)), [18, 18.5, 9.5], 2, 1, stockMat));
    const tailF = chain(stockPiv, T(-19, -0.5, 0), R(M3.ry(-0.3 * Math.sin(swim - 0.7))));
    prims.push(PL(tailF, TAIL_G, 3, 2, 2.2, TAIL_RAYS, [[-0.86, 0, 0], [0, 1.02, 0], [0, 0, -1]]));
    anchors.tail = inF(tailF, [-20, 0, 0]);

    /* --- head: a sloping helmet (cranium) with a blunt snout, the big cheek plate over its lower
       back (its rear edge bulges back over the body, its lower edge slopes forward to the jaw),
       and the protruding, upturned lower jaw --- */
    // helmet: one ellipsoid whose long axis runs from the jaw (low front) up to the dorsal fin
    const headF = chain(root, T(17, 54, 0), R(M3.rz(-HEAD_TILT)));
    prims.push(ellF(headF, CRAN_R, 4, 3, cranMat(kind)));
    anchors.head = inF(headF, [0, 0, 0]);
    // cheek plates: a shell standing off the helmet's lower back, bulging out at the sides; its
    // upper edge runs from the mouth corner back and up to the rear of the head
    prims.push(ellF(headF, [CRAN_R[0] * 1.045, CRAN_R[1] * 1.045, CRAN_R[2] * 1.12], 5, 4, cheekMat));
    // lower head: a broad mass under the face so the front is blunt and the underside flat
    prims.push(ellF(chain(root, T(30, 34, 0), R(M3.rz(0.08))), [24, 14, 21], 4, 3, () => C_HEAD));
    // upper lip: a blunt bump over the mouth
    prims.push(ellF(chain(root, T(47, 43, 0), R(M3.rz(-0.2))), [8, 6.5, 14], 4, 3, () => C_HEAD));
    // lower jaw: hinged under the cheek, its front juts forward and tips up (underbite)
    const jawPiv = chain(root, T(28, 31, 0), R(M3.rz(-0.42 * mo)));
    const jawF = chain(jawPiv, T(21, -0.5, 0), R(M3.rz(0.45)));
    prims.push(ellF(jawF, [15.5, 7, 15.5], 6, 5, (s) => (s[1] < -0.5 ? C_HEAD_D : C_HEAD)));
    anchors.jaw = inF(jawF, [15.5, 1, 0]);
    if (mo > 0.04) prims.push(ellF(chain(root, T(42, 35 - 3 * mo, 0)), [10, 3 + 5 * mo, 12], 7, 6, () => C_MOUTH));
    anchors.mouth = inF(root, [55, 37 - 4 * mo, 0]);
    // eyes (decals) — anchor points on the cranium
    for (const zs of [1, -1]) {
      const q = EYE_S[zs > 0 ? 0 : 1];
      anchors[zs > 0 ? 'eyeN' : 'eyeF'] = inF(headF, [q[0] * CRAN_R[0], q[1] * CRAN_R[1], q[2] * CRAN_R[2]]);
      const sp = SPOT[zs > 0 ? 0 : 1].d;
      anchors[zs > 0 ? 'spotN' : 'spotF'] = inF(bodyF, [sp[0] * BODY_R[0], sp[1] * BODY_R[1], sp[2] * BODY_R[2]]);
    }

    /* --- dorsal fins: tan triangle at the back of the helmet, grey paddle further back --- */
    const d1 = chain(root, T(-12, 85, 0), R(M3.rz(0.05 + 0.1 * fs)));
    prims.push(PL(d1, D1_G, 8, 7, 1.8, null));
    anchors.top = inF(d1, [-10, 27, 0]);
    const d2 = chain(root, T(-50, 80, 0), R(M3.ry(0.1 * Math.sin(swim - 1))), aim([-Math.cos(0.6 + 0.28 * fs), Math.sin(0.6 + 0.28 * fs), 0], [0, 1, 0]));
    prims.push(paddle(d2, D2_R, 9, 8, D2_MAT));

    /* --- lower fins: lobed pectoral and pelvic pairs, long anal fin --- */
    const spread = 0.35 + 0.35 * fs;
    for (const zs of [1, -1]) {
      // pectoral: under the cheek plate, reaching down and back, paddling with swim
      const pa = 0.22 * Math.sin(swim + (zs > 0 ? 0 : Math.PI));
      const pd = [-Math.cos(0.78 - 0.25 * fs + pa), -Math.sin(0.78 - 0.25 * fs + pa), zs * (spread + 0.05)];
      const pf = chain(root, T(6, 24, zs * 13), aim(pd, [0, 1, 0]), R(M3.rx(zs * 0.25)));
      prims.push(paddle(pf, LOBE_R, zs > 0 ? 10 : 11, zs > 0 ? 9 : 10, LOBE_MAT));
      anchors[zs > 0 ? 'finN' : 'finF'] = inF(pf, [30, 0, 0]);
      // pelvic: further back, in step behind the pectoral
      const va = 0.18 * Math.sin(swim + 1.4 + (zs > 0 ? 0 : Math.PI));
      const vd = [-Math.cos(0.82 - 0.25 * fs + va), -Math.sin(0.82 - 0.25 * fs + va), zs * spread * 0.8];
      const vf = chain(root, T(-26, 27, zs * 10), aim(vd, [0, 1, 0]), R(M3.rx(zs * 0.2)));
      prims.push(paddle(vf, LOBE_R, zs > 0 ? 12 : 13, zs > 0 ? 11 : 12, LOBE_MAT));
    }
    const an = chain(root, T(-58, 33, 0), R(M3.ry(-0.12 * Math.sin(swim - 0.5))), aim([-Math.cos(0.55 - 0.15 * fs), -Math.sin(0.55 - 0.15 * fs), 0], [0, 1, 0]));
    prims.push(paddle(an, ANAL_R, 14, 13, ANAL_MAT));

    if (SIZE !== 1) {
      for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
      for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    }
    return {
      prims, anchors, pose: P, stamps: [], dots: [],
      pri: { 1: 0, 2: 1, 3: 1, 4: 3, 5: 4, 6: 5, 7: 1, 8: 1, 9: 3, 10: 3, 11: 1, 12: 1, 13: 1 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 16, shadowDepth: 18,
    };
  }

  function render(model, opt) {
    px = 1 / ((opt.scale || 1) * SIZE);
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 212, bh: 176, oy: 0.84 } };
})();
