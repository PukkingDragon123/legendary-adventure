/* ------------------------------------------------------------------
   Vibrava — the Vibration Pokémon (1.1 m ≈ 192 units at scale 1: head to
   tail-fin tip ≈ 190 long; ≈ 110 tall with the wings folded, ≈ 150 with
   them raised). Trapinch's evolution. A posable 3D model rendered straight
   to pixel art by the shared Creature pipeline (see src/creature.js,
   dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0
   (the tips of its feet; the game lifts it when it hovers).

   Design (official art): a dragonfly-like larva. A broad yellow head with
   two huge bulging green compound eyes with black oval pupils, two thin
   yellow antennae swept back, and two big white fangs jutting down from the
   sides of the mouth. A small yellow thorax on four skinny black legs; a
   long, thin, yellow segmented abdomen (thin green bands) ending in two
   green rhombus fins. Four green rhombus wings with black edges (a paler
   green band inside), held out to the sides and buzzing.

   Pose parameters (all optional):
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     mouth   0..1     jaw open between the fangs
     walk    radians  four-legged walk phase (diagonal pairs); the body bobs,
                      the tail sways; exactly 0 = standing
     flap    radians  wing-buzz phase: each wing beats with sin(flap) (front and
                      hind pairs in counter-phase); animate flap = t·40 for a buzz
     spread  0..1     0 = wings folded back along the body (resting), 1 = held
                      straight out to the sides (hovering; default 0.8)
     side    −1..1    ≈ cos(yaw), accepted (unused)

   Anchors: top (highest point of the head/antennae), head (head centre),
   mouth, eyeN, eyeF, body (thorax centre), back (on top of the thorax),
   tail (tail-fin centre), wingN / wingF (front-wing tips), footN / footF.
------------------------------------------------------------------- */
const Vibrava = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, EYE = 2, PUPIL = 3, LEG = 4, WING = 5, EDGE = 6, FANG = 7, MOUTH = 8, BAND = 9, WINGL = 10;
  const MAT = { BODY, EYE, PUPIL, LEG, WING, EDGE, FANG, MOUTH, BAND, WINGL };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#a6922a', '#c8b53c', '#e4d25a', '#f2e684', '#fdf6bc'], od: '#5a4a10', ol: '#948220', ln: '#8e7c22' },
    [EYE]:   { r: ['#2c8a3a', '#3eaa4a', '#5cc85e', '#8ae088', '#c4f6bc'], od: '#12501e', ol: '#2a8038', ln: '#1e6a2c' },
    [PUPIL]: { r: ['#08100a', '#0e1810', '#142016', '#1e2c20', '#2c3c2e'], od: '#040806', ol: '#08100a', ln: '#08100a' },
    [LEG]:   { r: ['#16181c', '#202328', '#2c3036', '#3e434c', '#585e68'], od: '#08090c', ol: '#16181c', ln: '#101216' },
    [WING]:  { r: ['#3a8e3a', '#4eaa48', '#6cc45a', '#94dc7a', '#c6f2aa'], od: '#15501a', ol: '#2e7a30', ln: '#2a6e2c' },
    [WINGL]: { r: ['#6aaa5a', '#86c46e', '#a6dc88', '#c6eca6', '#e6fad0'], od: '#2a6a2a', ol: '#4a8e44', ln: '#4a8e44' },
    [EDGE]:  { r: ['#101a12', '#16221a', '#1e2c22', '#2a3a2e', '#3a4c3e'], od: '#060a08', ol: '#101a12', ln: '#0c140e' },
    [FANG]:  { r: ['#b8b4a8', '#d8d4c8', '#f4f2ea', '#fcfbf6', '#ffffff'], od: '#5a5648', ol: '#8a8676', ln: '#8a8676' },
    [MOUTH]: { r: ['#3e0e14', '#5a1820', '#76262c', '#90383a', '#a84c4a'], od: '#26060a', ol: '#3e0e14', ln: '#3e0e14' },
    [BAND]:  { r: ['#3c7a2c', '#4e9434', '#64ac42', '#80c456', '#a4dc78'], od: '#1a4412', ol: '#3a7028', ln: '#2e6020' },
  });
  const GLOSSY = { [EYE]: 1 };
  const C_BODY = code(BODY), C_EYE = code(EYE), C_EYE_L = code(EYE, 1), C_PUPIL = code(PUPIL), C_GLINT = code(FANG, 1), C_LEG = code(LEG);
  const C_WING = code(WING), C_WINGL = code(WINGL), C_EDGE = code(EDGE), C_FANG = code(FANG), C_MOUTH = code(MOUTH), C_BAND = code(BAND);
  const M_BODY = () => C_BODY, M_LEG = () => C_LEG, M_FANG = () => C_FANG;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    if (len3(Z) < 1e-4) Z = cross(X, [1, 0, 0]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.12) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }

  let curScale = 1;

  /* ---------- rhombus wing / fin plates (u = span from the root, v = chord) ---------- */
  function rhombus(len, w, mid, cMain, cBand, border, band) {
    return bakeShape({
      bb: [-0.5, -w - 0.5, len + 0.5, w + 0.5],
      test: (u, v) => {
        // diamond with its wide point at `mid` (fraction of the length)
        const a = u < mid * len ? u / (mid * len) : (len - u) / ((1 - mid) * len);
        if (a <= 0) return 0;
        const q = Math.abs(v) / w;
        if (q >= a) return 0;
        const d = (a - q) * Math.min(mid * len, w);         // ≈ distance to the edge
        if (d < border) return C_EDGE;
        if (band && Math.abs(u - len * 0.62) < band && d > border * 2.2) return cBand;
        return cMain;
      },
    });
  }
  const WING_F = rhombus(80, 23, 0.4, C_WING, C_WINGL, 2.6, 5);
  const WING_H = rhombus(68, 20, 0.4, C_WING, C_WINGL, 2.6, 4.5);
  const FIN_G = rhombus(30, 11, 0.45, C_WING, C_WINGL, 2.2, 0);

  /* ---------- head, eyes ---------- */
  const HR = [24, 19, 25];
  const ER = [15, 16, 13];
  function eyeMat(kind, sd) {
    return (s) => {
      // s: eye-local unit sphere; its outward face is +z·sd, looking a little forward
      const px = 1 / (curScale * ER[1]);
      const u = s[0], v = s[1], out = s[2] * sd;
      if (out < 0.1) return C_EYE;
      const lw = Math.max(0.09, 0.8 * px);
      if (kind === 'open') {
        const pu = (u - 0.18) / Math.max(0.24, 1.3 * px), pv = (v - 0.02) / Math.max(0.4, 2 * px);
        if (pu * pu + pv * pv < 1) {
          if (pv > 0.2 && pu < -0.1 && pu * pu + (pv - 0.45) ** 2 < 0.2 && px < 0.12) return C_GLINT;
          return C_PUPIL;
        }
        if (v > 0.45 && u < -0.1 && out > 0.5) return C_EYE_L;
        return C_EYE;
      }
      if (Math.abs(u - 0.1) > 0.55) return C_EYE;
      const k = (u - 0.1) / 0.55;
      const yc = kind === 'happy' ? -0.15 + 0.35 * (1 - k * k) : kind === 'closed' ? 0.12 - 0.3 * (1 - k * k) : 0;
      return Math.abs(v - yc) < lw ? C_PUPIL : C_EYE;
    };
  }

  const DEFAULT = { eyes: 'open', mouth: 0, walk: 0, flap: 0, spread: 0.8, side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 thorax, 2 head, 3/4 eyes, 5 fangs, 6 antennae, 7 abdomen, 8 fins, 10-13 wings, 14-17 legs
  Object.assign(PRI, { 1: 1, 2: 2, 3: 3, 4: 3, 5: 3, 6: 1, 7: 0, 8: 0, 10: 2, 11: 2, 12: 1, 13: 1, 14: -1, 15: -1, 16: -1, 17: -1 });
  const SIZE = 1.15;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const fl = +P.flap || 0, spread = clamp(P.spread ?? 0.8, 0, 1);
    const mo = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 1.5 * Math.abs(Math.sin(wk)) : 0;

    // --- thorax
    const tf = chain(T(0, 40 + bob, 0), R(M3.rz(0.1)));
    prims.push(ellF(tf, [19, 15, 14], 1, 1, M_BODY));
    anchors.body = tf.t;
    anchors.back = inF(tf, [0, 15, 0]);

    // --- head: broad, a little raised, in front of the thorax
    const hf = chain(tf, T(30, 14, 0), R(M3.rz(0.08 + 0.12 * mo)));
    const headPrim = ellF(hf, HR, 2, 2, M_BODY);
    prims.push(headPrim);
    prims.push(seg(tf.t, hf.t, 11, 11, [0, 1, 0], 1, 1, M_BODY, 0.8)); // neck
    anchors.head = hf.t;
    // the lower jaw drops when the mouth opens (a dark gap under the head)
    if (mo > 0.05) {
      const jf = chain(hf, T(6, -11, 0), R(M3.rz(-0.45 * mo)));
      prims.push(ellF(chain(jf, T(10, -3, 0)), [13, 4, 13], 2, 2, M_BODY));
      prims.push(ellF(chain(hf, T(14, -12 - 3 * mo, 0)), [9, 3 + 4 * mo, 10], 5, 2, () => C_MOUTH));
    }
    anchors.mouth = inF(hf, [HR[0] - 2, -12, 0]);
    // huge bulging green eyes on the sides of the head
    for (const sd of [1, -1]) {
      const ef = chain(hf, T(8, 6, 18 * sd), R(M3.ry(-sd * 0.35)));
      prims.push(ellF(ef, ER, sd > 0 ? 3 : 4, sd > 0 ? 3 : 4, eyeMat(kind, sd)));
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(ef, [2, 0, ER[2] * sd]);
      // big white fangs jutting down from the sides of the mouth
      const fb = inF(hf, [18, -12, 9 * sd]);
      const fd = dirF(hf, [0.35, -1, 0.1 * sd]);
      prims.push(seg(fb, add(fb, sc(fd, 9)), 3.6, 3.2, M3.v(hf.L, [1, 0, 0]), 5, 5, M_FANG, 1.2));
      prims.push(seg(add(fb, sc(fd, 8)), add(fb, sc(nrm(add(fd, dirF(hf, [-0.4, 0, 0]))), 15)), 2.2, 2, M3.v(hf.L, [1, 0, 0]), 5, 5, M_FANG, 1.2));
      // thin yellow antennae swept back from the top of the head
      const a0 = inF(hf, [4, 17, 6 * sd]);
      const ap = [a0, inF(hf, [-4, 30, 10 * sd]), inF(hf, [-18, 38, 14 * sd]), inF(hf, [-32, 40, 17 * sd])];
      for (let i = 0; i < 6; i++) prims.push(seg(crPt(ap, (i / 6) * 3), crPt(ap, ((i + 1) / 6) * 3), 1.8, 1.8, [0, 1, 0], 6, 6, M_BODY, 1.3));
    }
    anchors.top = inF(hf, [-12, 40, 0]);

    // --- long thin segmented abdomen, curving up a little at the end, two rhombus fins
    const sway = walking ? 0.12 * Math.sin(wk) : 0;
    const tp = [inF(tf, [-12, -2, 0]), inF(tf, [-40, -6, 0]), inF(tf, [-72, -4, 18 * sway]), inF(tf, [-102, 4, 34 * sway]), inF(tf, [-126, 16, 50 * sway])];
    const NS = 12;
    for (let i = 0; i < NS; i++) {
      const a = crPt(tp, (i / NS) * 4), b = crPt(tp, ((i + 1) / NS) * 4);
      const r = lerp(8.5, 4.6, i / (NS - 1));
      const banded = i % 2 === 1 && i < NS - 1;
      const hl = len3(sub(b, a)) * 0.75;
      prims.push(seg(a, b, r, r, [0, 1, 0], 7, 7, banded ? (q) => (Math.abs(q[0]) < Math.max(0.2, 1.1 / (curScale * hl)) ? C_BAND : C_BODY) : M_BODY, 1.5));
    }
    const tEnd = tp[4], tD = nrm(sub(tEnd, crPt(tp, 3.7)));
    for (const sd of [1, -1]) {
      const U = nrm(add(sc(tD, 0.75), dirF(tf, [0, 0.1, 0.62 * sd])));
      const N = nrm(cross(U, [0, 1, 0]));
      const Vv = cross(N, U);
      prims.push(PL(tEnd, M3.cols(U, Vv, N), 8, 8, FIN_G, 1.2));
    }
    anchors.tail = add(tEnd, sc(tD, 10));

    // --- four rhombus wings on the thorax: out to the sides (spread) / back along the body (folded)
    const tipsF = [];
    for (const sd of [1, -1]) for (const hind of [0, 1]) {
      const id = 10 + (hind ? 2 : 0) + (sd > 0 ? 0 : 1);
      const root = inF(tf, [hind ? -8 : 4, 12, 7 * sd]);
      const beat = 0.5 * Math.sin(fl + (hind ? Math.PI * 0.7 : 0));
      const elev = lerp(0.2, hind ? 0.38 : 0.62, spread) + (fl ? beat : 0);          // up from horizontal
      const sweep = lerp(1.35, hind ? -0.1 : 0.2, spread) * (hind ? 1 : 0.8) + (hind ? 0.15 : 0); // back from straight out
      // span direction: out to the side, swept back, raised
      const U = nrm([-Math.sin(sweep) * Math.cos(elev), Math.sin(elev), sd * Math.cos(sweep) * Math.cos(elev)]);
      const back = nrm(cross([0, 1, 0], U)); // chord axis, roughly along the body
      const N = nrm(cross(U, back));
      prims.push(PL(root, M3.cols(U, back, N), id, id, hind ? WING_H : WING_F, 1.1));
      if (!hind) tipsF.push(add(root, sc(U, 80)));
    }
    anchors.wingN = tipsF[0]; anchors.wingF = tipsF[1];

    // --- four skinny black legs
    const LEGS = [[8, 1, 0], [8, -1, Math.PI], [-6, 1, Math.PI], [-6, -1, 0]];
    LEGS.forEach(([x, sd, ph0], i) => {
      const id = 14 + i;
      const ph = wk + ph0;
      const lift = walking ? 5 * Math.max(0, Math.sin(ph)) : 0;
      const swing = walking ? 6 * Math.cos(ph) : 0;
      const hip = inF(tf, [x, -8, 9 * sd]);
      const knee = [hip[0] + (x > 0 ? 8 : -6) + swing * 0.5, 30 + lift, 24 * sd];
      const foot = [hip[0] + (x > 0 ? 14 : -12) + swing, 1.8 + lift, 32 * sd];
      prims.push(seg(hip, knee, 2.4, 2.4, [0, 1, 0], id, id, M_LEG, 1.15));
      prims.push(seg(knee, foot, 2, 2, [0, 1, 0], id, id, M_LEG, 1.12));
      prims.push(E(foot, M3.diag(4.2, 1.8, 2.6), id, id, M_LEG));
      if (i < 2) anchors[sd > 0 ? 'footN' : 'footF'] = [foot[0], 0, foot[2]];
    });

    // centre the long body (head to tail tip) on the origin
    for (const q of prims) q.c = add(q.c, [40, 0, 0]);
    for (const k in anchors) anchors[k] = add(anchors[k], [40, 0, 0]);
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 330, bh: 230, oy: 0.86 } };
})();
