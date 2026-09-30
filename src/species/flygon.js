/* ------------------------------------------------------------------
   Flygon — the Mystic Pokémon (2.0 m ≈ 350 units at scale 1, feet to the
   tips of the antennae, standing / hovering). Vibrava's evolution; in the
   game it also carries Mudkip as a flight mount (anchor `back`).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0
   (lowest foot; the game lifts it when it flies).

   Design (official art): a slim green desert dragon with insect features.
   Light-green body with a pale, segmented belly; a long curved neck; a
   dragon head with a rounded snout, big domed red covers over its eyes and
   two long antennae swept back from the top of the head. Two huge rhombus
   wings of pale lime green trimmed in red (a darker green vein inside),
   held up in a V and buzzing. Thin arms with three claws, thick legs with
   toeless feet, and a long tail ending in a fan of three small red-trimmed
   lime rhombuses. Darker green diamond markings run down its back.

   Pose parameters (all optional):
     eyes    'open' (default) | 'happy' | 'blink' | 'closed' (drawn on the red
             eye covers)
     mouth   0..1     jaw open
     walk    radians  walk phase (legs step with sin(walk), body bobs, tail
                      sways); exactly 0 = standing
     flap    radians  wing-buzz phase: the wings beat with sin(flap); animate
                      flap = t·30 while flying
     spread  0..1     0 = wings folded back and up, body upright (standing),
                      1 = wings spread wide and the body pitched forward almost
                      level (flying, a flat back for a rider); default 0.6
     side    −1..1    ≈ cos(yaw), passed by the game: the tail fan turns a
                      little toward the camera

   Anchors: top (antenna tips / head top), head (head centre), mouth, nose,
   eyeN, eyeF, neck, body (torso centre), back (the rider's seat on the upper
   back, between the wing roots), belly, wingN / wingF (wing tips), handN /
   handF, footN / footF, tail (tail-fan centre).
------------------------------------------------------------------- */
const Flygon = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, BELLY = 2, DARK = 3, COVER = 4, WING = 5, TRIM = 6, VEIN = 7, CLAW = 8, MOUTH = 9, INK = 10;
  const MAT = { BODY, BELLY, DARK, COVER, WING, TRIM, VEIN, CLAW, MOUTH, INK };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#7e9e6e', '#9cba86', '#bed79c', '#d4e6b8', '#eaf4d8'], od: '#34502a', ol: '#5e7e4c', ln: '#62824e' },
    [BELLY]: { r: ['#a2b27a', '#bccc94', '#d6e8b0', '#e6f2c8', '#f6fbe6'], od: '#4a5a2e', ol: '#7a8a56', ln: '#86985c' },
    [DARK]:  { r: ['#44704a', '#5a8a5e', '#77a377', '#92bc90', '#b0d4ac'], od: '#1c3820', ol: '#345a38', ln: '#345a38' },
    [COVER]: { r: ['#6a221e', '#8c3630', '#b04a44', '#cc6e62', '#e8a092'], od: '#3a0e0c', ol: '#6a221e', ln: '#6a221e' },
    [WING]:  { r: ['#8eb078', '#a6c890', '#bcdaa0', '#d0e8bc', '#e8f4dc'], od: '#3e6a30', ol: '#6a9a58', ln: '#6a9a58' },
    [TRIM]:  { r: ['#b04e58', '#cc6870', '#e8848a', '#f4a4a6', '#fcc8c8'], od: '#5e1c24', ol: '#983842', ln: '#983842' },
    [VEIN]:  { r: ['#5a8250', '#6e9a62', '#86b276', '#9ec88e', '#bcdcac'], od: '#1a4412', ol: '#346e28', ln: '#346e28' },
    [CLAW]:  { r: ['#a8a8a0', '#cacac2', '#ecece6', '#f8f8f4', '#ffffff'], od: '#50504a', ol: '#80807a', ln: '#86867e' },
    [MOUTH]: { r: ['#3e0e14', '#5a1820', '#76262c', '#90383a', '#a84c4a'], od: '#26060a', ol: '#3e0e14', ln: '#3e0e14' },
    [INK]:   { r: ['#2a0608', '#3a0a0e', '#4a1014', '#5a161a', '#6a1e22'], od: '#1a0204', ol: '#2a0608', ln: '#2a0608' },
  });
  const GLOSSY = { [COVER]: 1 };
  const C_BODY = code(BODY), C_BELLY = code(BELLY), C_BELLY_D = code(BELLY, -1), C_DARK = code(DARK), C_COVER = code(COVER), C_COVER_L = code(COVER, 1);
  const C_WING = code(WING), C_TRIM = code(TRIM), C_VEIN = code(VEIN), C_CLAW = code(CLAW), C_MOUTH = code(MOUTH), C_INK = code(INK);
  const M_BODY = () => C_BODY, M_DARK = () => C_DARK, M_CLAW = () => C_CLAW;

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
  function hookChain(prims, p, d, bendDir, lens, r, bend, part, grp, mat) {
    let dir = nrm(d);
    for (let i = 0; i < lens.length; i++) {
      const q = add(p, sc(dir, lens[i]));
      const B = nrm(sub(bendDir, sc(dir, dot(bendDir, dir))));
      const Rm = M3.cols(dir, B, cross(dir, B));
      const hl = lens[i] * 0.5 + r[i][0] * 0.55;
      prims.push(E(sc(add(p, q), 0.5), M3.mul(Rm, M3.diag(hl, r[i][1], r[i][0])), part, grp, mat));
      p = q;
      dir = nrm(sub(dir, sc(B, Math.tan(bend))));
    }
    return p;
  }
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }
  // tube of ellipsoids along a Catmull-Rom spline, radius r(t). Each link's shading is corrected
  // to the true tube normal (a per-pixel tone bias, as for Slakoth's curl) so the tube reads smooth.
  let viewR = M3.I(), lightD = V3.norm([-0.5, 0.72, 0.5]), lightTh = [-0.2, 0.18, 0.74];
  const toneOf = (d) => (d < lightTh[0] ? 0 : d < lightTh[1] ? 1 : d < lightTh[2] + 0.13 ? 2 : 3); // matches the soft renderer
  // m < 0: a body-green link with a thin dark ring round its middle (the tail's segment lines)
  function tubeMat(Rm, hl, rr, m) {
    const ring = m < 0 ? Math.min(0.2, 2.2 / hl) : 0;
    return (s) => {
      const ne = nrm(M3.v(Rm, [s[0] / hl, s[1] / rr, s[2] / rr]));
      const nt = nrm(M3.v(Rm, [0, s[1], s[2]]));
      const bias = toneOf(dot(M3.v(viewR, nt), lightD)) - toneOf(dot(M3.v(viewR, ne), lightD));
      const mm = m < 0 ? (Math.abs(s[0]) < Math.max(ring, 0.9 / (curScale * hl)) ? DARK : -m) : m;
      return code(mm, clamp(bias, -2, 2));
    };
  }
  function tube(prims, pts, n, r, part, grp, m, up = [0, 1, 0], over = 1.45) {
    const k = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = crPt(pts, (i / n) * k), b = crPt(pts, ((i + 1) / n) * k);
      const rr = r((i + 0.5) / n);
      const d = sub(b, a), hl = (len3(d) / 2) * over;
      const Rm = axesAlong(d, up);
      prims.push(E(sc(add(a, b), 0.5), M3.mul(Rm, M3.diag(hl, rr, rr)), part, grp, tubeMat(Rm, hl, rr, typeof m === 'function' ? m(i) : m)));
    }
  }

  let curScale = 1;

  /* ---------- rhombus plates: wings and tail fan (u = span from the root, v = chord) ---------- */
  function rhombus(len, w, mid, trim, vein) {
    return bakeShape({
      bb: [-0.5, -w - 0.5, len + 0.5, w + 0.5],
      test: (u, v) => {
        const a = u < mid * len ? u / (mid * len) : (len - u) / ((1 - mid) * len);
        if (a <= 0) return 0;
        const q = Math.abs(v) / w;
        if (q >= a) return 0;
        const d = (a - q) * Math.min(mid * len, w);
        if (d < trim) return C_TRIM;
        // a darker green line just inside the red trim
        if (vein && d < trim + vein) return C_VEIN;
        return C_WING;
      },
    });
  }
  const WING_G = rhombus(168, 58, 0.36, 8, 3.2);
  const FAN_G = rhombus(42, 15, 0.5, 3.4, 0);

  /* ---------- head, eye covers ---------- */
  const HR = [24, 20, 21];
  const CR = [14, 13.5, 10];
  function coverMat(kind, sd) {
    return (s) => {
      const out = s[2] * sd;
      if (out < 0.15) return C_COVER;
      const px = 1 / (curScale * CR[1]);
      const lw = Math.max(0.1, 0.8 * px);
      const u = s[0], v = s[1];
      if (kind !== 'open') {
        const k = (u - 0.05) / 0.6;
        if (Math.abs(k) < 1) {
          const yc = kind === 'happy' ? -0.2 + 0.4 * (1 - k * k) : kind === 'closed' ? 0.1 - 0.32 * (1 - k * k) : -0.02;
          if (Math.abs(v - yc) < lw) return C_INK;
        }
        return C_COVER;
      }
      // the eye behind the cover shows as a darker oval, with a bright reflection band on top
      const eu = (u - 0.12) / 0.34, ev = (v + 0.05) / 0.42;
      if (eu * eu + ev * ev < 1 && px < 0.2) return code(COVER, -1);
      if (v > 0.35 && v < 0.62 && u < 0.35 && u > -0.5) return C_COVER_L;
      return C_COVER;
    };
  }
  function headMat(s) {
    // darker green cap on the top / back of the head
    if (s[1] > 0.55 && s[0] < 0.4) return C_DARK;
    if (s[1] < -0.45 && s[0] > -0.2) return C_BELLY;
    return C_BODY;
  }
  function snoutMat(mo) {
    return (s) => {
      if (s[1] < -0.35) return C_BELLY;
      // mouth line along the side of the snout, curving up at the corner
      if (mo <= 0.05 && s[0] > -0.55) {
        const lw = Math.max(0.05, 0.6 / (curScale * 12));
        const yc = -0.28 + 0.2 * Math.max(0, -s[0] - 0.1);
        if (Math.abs(s[1] - yc) < lw && Math.abs(s[2]) > 0.25) return C_INK;
      }
      return C_BODY;
    };
  }

  /* ---------- torso (spine frame: y up the spine, x = chest) ---------- */
  function torsoMat(s) {
    // pale segmented belly down the front
    if (s[0] > 0.45 - 0.2 * s[2] * s[2] + 0.3 * s[2] * s[2]) {
      if (Math.abs(s[2]) < 0.62) {
        const ph = (s[1] + 1) * 4.2;
        const f = ph - Math.floor(ph);
        return f < 0.14 ? C_BELLY_D : C_BELLY;
      }
    }
    // darker diamond markings down the back
    if (s[0] < -0.55) {
      const ph = (s[1] + 1) * 2.2;
      const f = ph - Math.floor(ph) - 0.5;
      if (Math.abs(s[2]) < 0.34 * (1 - 2 * Math.abs(f))) return C_DARK;
    }
    return C_BODY;
  }

  const DEFAULT = { eyes: 'open', mouth: 0, walk: 0, flap: 0, spread: 0.6, side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 torso, 2 neck, 3 head, 4 snout, 5/6 eye covers, 7 antennae, 8/9 wings, 10/11 arms, 12/13 legs, 14 tail, 15 tail fan, 16 jaw
  Object.assign(PRI, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5, 7: 1, 8: -1, 9: -1, 10: 3, 11: 3, 12: 2, 13: 2, 14: 0, 15: 0, 16: 3 });
  const SIZE = 1.1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const fl = +P.flap || 0, spread = clamp(P.spread ?? 0.6, 0, 1);
    const mo = clamp(+P.mouth || 0, 0, 1), side = clamp(P.side ?? 1, -1, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 3 * Math.abs(Math.cos(wk)) : 0;
    const lean = 0.32 + 0.78 * spread;          // spine pitched forward from vertical
    const rock = walking ? 0.05 * Math.sin(wk) : 0;

    // --- torso (spine frame at the hips)
    const tf = chain(T(0, 92 + bob, 0), R(M3.rx(rock)), R(M3.rz(-lean)));
    prims.push(ellF(chain(tf, T(2, 34, 0)), [30, 44, 30], 1, 1, torsoMat));
    prims.push(ellF(chain(tf, T(6, 82, 0)), [24, 30, 26], 1, 1, torsoMat));
    // the big dark-green oval marking on each shoulder
    for (const sd of [1, -1]) prims.push(ellF(chain(tf, T(-2, 78, 17 * sd), R(M3.rx(sd * 0.35))), [17, 24, 10], 1, 1, M_DARK));
    anchors.body = inF(tf, [2, 50, 0]);
    anchors.belly = inF(tf, [34, 40, 0]);
    anchors.back = inF(tf, [-22, 84, 0]);

    // --- long curved neck: rises from the chest, bends forward; the head stays about level
    const nb = inF(tf, [12, 104, 0]);
    const up = [Math.sin(lean * 0.35), Math.cos(lean * 0.35), 0], fw = [Math.cos(lean * 0.35), -Math.sin(lean * 0.35), 0];
    const at = (a, b) => add(nb, add(sc(up, a), sc(fw, b)));
    const neckPts = [inF(tf, [8, 88, 0]), nb, at(28, 2), at(56, 10), at(78, 24), at(88, 42)];
    tube(prims, neckPts, 12, (t) => lerp(15, 10.5, t), 2, 2, BODY, [0, 1, 0], 1.8);
    anchors.neck = neckPts[3];
    const hc = add(neckPts[5], [10, 8, 0]);
    const hf = chain(T(...hc), R(M3.rz(-0.1 + 0.15 * mo + (walking ? 0.03 * Math.sin(2 * wk) : 0))));
    const headPrim = ellF(hf, HR, 3, 3, headMat);
    prims.push(headPrim);
    anchors.head = hf.t;
    // rounded snout
    const sf = chain(hf, T(22, -4, 0));
    prims.push(ellF(sf, [20, 12, 14], 4, 4, snoutMat(mo)));
    anchors.nose = inF(sf, [20, 1, 0]);
    // lower jaw drops when the mouth opens
    if (mo > 0.05) {
      const jf = chain(hf, T(6, -12, 0), R(M3.rz(-0.5 * mo)));
      prims.push(ellF(chain(jf, T(18, -2, 0)), [20, 5, 12], 16, 16, (s) => (s[1] > 0.3 ? C_MOUTH : C_BELLY)));
      prims.push(ellF(chain(hf, T(22, -13, 0)), [16, 3 + 4 * mo, 11], 16, 4, () => C_MOUTH));
    }
    anchors.mouth = inF(hf, [36, -12 - 6 * mo, 0]);
    // big domed red eye covers
    for (const sd of [1, -1]) {
      const ef = chain(hf, T(9, 8, 15 * sd), R(M3.ry(-sd * 0.45)), R(M3.rz(0.1)));
      prims.push(ellF(ef, CR, sd > 0 ? 5 : 6, sd > 0 ? 5 : 6, coverMat(kind, sd)));
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(ef, [0, 0, CR[2] * sd]);
      // long antennae swept back from the top of the head, with a kink
      const a0 = inF(hf, [-2, 17, 6 * sd]);
      const a0b = inF(hf, [8, 16, 4 * sd]);
      const ap = [a0b, inF(hf, [-6, 28, 7 * sd]), inF(hf, [-32, 40, 10 * sd]), inF(hf, [-70, 46, 14 * sd]), inF(hf, [-112, 44, 18 * sd]), inF(hf, [-150, 34, 22 * sd])];
      tube(prims, ap, 14, (t) => lerp(4.6, 1.5, t), 7, 7, DARK, [0, 1, 0], 1.7);
    }
    anchors.top = inF(hf, [-58, 60, 0]);

    // --- the big rhombus wings: roots on the upper back, a V up and out; flap buzzes them
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const root = inF(tf, [-18, 90, 13 * sd]);
      const beat = fl ? 0.45 * Math.sin(fl) : 0;
      const elev = lerp(1.05, 0.3, spread) + beat;    // up from horizontal (world)
      const sweep = lerp(0.85, 0.12, spread);         // back from straight out
      const U = nrm([-Math.sin(sweep) * Math.cos(elev), Math.sin(elev), sd * Math.cos(sweep) * Math.cos(elev)]);
      const back = nrm(cross([0, 1, 0], U));
      // chord axis pointing forward, its leading edge twisted up so the broad face shows in 3/4 views
      const fwdC = sd > 0 ? back : sc(back, -1);
      const chord = nrm(sub(add(fwdC, [0, 1.0, 0]), sc(U, dot(add(fwdC, [0, 1.0, 0]), U))));
      const N = nrm(cross(U, chord));
      prims.push(PL(root, M3.cols(U, cross(N, U), N), id, id, WING_G, 1.4));
      anchors[sd > 0 ? 'wingN' : 'wingF'] = add(root, sc(U, 168));
    }

    // --- thin arms with three claws
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11;
      const sh = inF(tf, [14, 86, 24 * sd]);
      const swing = walking ? 0.25 * Math.sin(wk + (sd > 0 ? Math.PI : 0)) : 0;
      const el = add(sh, M3.v(M3.rz(swing), [4, -26, 8 * sd]));
      const wr = add(el, M3.v(M3.rz(swing), [24, -4, 2 * sd]));
      prims.push(seg(sh, el, 6.5, 6.5, [0, 1, 0], id, id, M_BODY, 1.2));
      prims.push(seg(el, wr, 5.5, 5.5, [0, 1, 0], id, id, M_BODY, 1.2));
      prims.push(E(wr, M3.diag(6.5, 6, 6.5), id, id, M_BODY));
      for (const o of [-1, 0, 1]) {
        const d = nrm([0.8, -0.35, 0.3 * o + 0.1 * sd]);
        hookChain(prims, add(wr, sc(d, 4)), d, [0, 1, 0], [5, 4], [[2.2, 2], [1.2, 1.1]], 0.35, id, id, M_CLAW);
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(wr, [9, -4, 0]);
    }

    // --- thick legs with toeless feet
    const legs = [];
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 12 : 13;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 16 * Math.sin(ph) : 0, lift = walking ? 10 * Math.max(0, Math.cos(ph)) : 0;
      // flying: the legs trail back a little
      const hip = inF(tf, [0, 12, 22 * sd]);
      const knee = [hip[0] + 22 + fwd * 0.5 - 20 * spread, lerp(56, 62, spread) + lift, 28 * sd];
      const foot = [hip[0] + 8 + fwd - 34 * spread, 12 + lift + 22 * spread, 27 * sd];
      prims.push(seg(hip, knee, 14, 14, [0, 1, 0], id, id, M_BODY, 1.15));
      prims.push(seg(knee, foot, 9.5, 9.5, [0, 1, 0], id, id, M_BODY, 1.12));
      const ff = chain(T(foot[0] + 6, foot[1] - 5, foot[2]), R(M3.rz(-0.6 * spread)));
      prims.push(ellF(ff, [14, 7, 10], id, id, (s) => (s[1] < -0.4 ? C_BELLY : C_BODY)));
      legs.push(ff);
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(ff, [0, -8, 0]);
    }

    // --- long tail: back and down from the hips, curving up at the end, a fan of three rhombuses
    const sway = (walking ? 0.25 * Math.sin(wk) : 0);
    const tb = inF(tf, [-24, 14, 0]);
    const tp = [inF(tf, [-10, 24, 0]), tb, add(tb, [-42, -26, 10 * sway]), add(tb, [-98, -38, 26 * sway + 8 * side]), add(tb, [-152, -30, 40 * sway + 16 * side]), add(tb, [-192, -6, 50 * sway + 22 * side])];
    tube(prims, tp, 18, (t) => lerp(19, 5, Math.pow(t, 0.85)), 14, 14, (i) => (i >= 2 && i % 2 === 0 ? -BODY : BODY), [0, 1, 0], 1.8);
    const tEnd = tp[5], tD = nrm(sub(tEnd, crPt(tp, 4.7)));
    const fanN = nrm(cross(tD, [0, 0, 1]).map((x, i) => x + (i === 2 ? 0.5 * side : 0)));
    for (const a of [-0.75, 0, 0.75]) {
      const U = nrm(add(sc(tD, Math.cos(a)), sc(nrm(cross(fanN, tD)), Math.sin(a))));
      const Nn = fanN;
      prims.push(PL(add(tEnd, sc(U, -2)), M3.cols(U, cross(Nn, U), Nn), 15, 15, FAN_G, 1.2));
    }
    anchors.tail = add(tEnd, sc(tD, 14));

    // --- re-ground: the lowest foot touches y = 0
    let gy = Infinity;
    for (const ff of legs) gy = Math.min(gy, ff.t[1] - 8);
    if (gy) { for (const q of prims) q.c = add(q.c, [0, -gy, 0]); for (const k in anchors) anchors[k] = add(anchors[k], [0, -gy, 0]); }
    // centre the long body along x
    const cx = 20;
    for (const q of prims) q.c = add(q.c, [cx, 0, 0]);
    for (const k in anchors) anchors[k] = add(anchors[k], [cx, 0, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12 };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    viewR = M3.mul(M3.rx(pitch), M3.ry(-yaw));
    const Lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    lightD = V3.norm(Lg.dir); lightTh = Lg.th || [-0.2, 0.18, 0.74];
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const u of [a, c]) for (const v of [b, d]) for (const w of [-p.thick, p.thick]) {
          const qx = cv[0] + Lv[0] * u + Lv[1] * v + Lv[2] * w, qy = cv[1] + Lv[3] * u + Lv[4] * v + Lv[5] * w;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, -qy); y1 = Math.max(y1, -qy);
        }
      }
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s = y * w, d = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.0, bw: 540, bh: 440, oy: 0.9 } };
})();
