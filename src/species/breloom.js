/* ------------------------------------------------------------------
   Breloom — the Mushroom Pokémon (1.2 m ≈ 210 units tall at scale 1,
   cap included). Shroomish's evolution. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a kangaroo-like biped. A cream
   head on a long cream neck, with a pointed cream beak jutting forward
   and down and small black oval eyes, topped by a big green mushroom cap
   worn tilted back (its beige gilled underside shows at the front) with
   a round red seed on each side. A cream petal collar round the
   shoulders; a big round green body with heavy thighs; short arms ending
   in red pointed claws (they stretch out for Mach Punch); thin
   digitigrade green shins on two long red toe claws; a long cream tail
   curling up behind, tipped with a cluster of four green seed balls.

   Pose parameters (all optional):
     walk   radians  walk-cycle phase (legs step, body bobs, arms swing);
                     exactly 0 = standing
     punch  0..1     Mach Punch: the near arm shoots straight forward
                     (stretchy), body leans into it
     tail   −1..1    tail sway (+ = toward the near side)
     mouth  0..1     beak open
     eyes   'open' | 'happy' | 'blink' | 'closed'
     side   −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (top of the cap), head (head centre), mouth (under the
   beak), beak (beak tip), eyeN, eyeF, body (torso centre), cap (cap
   centre, where spores puff from), fist (near claw: the punch point),
   handN, handF, footN, footF, tail (seed cluster).
------------------------------------------------------------------- */
const Breloom = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const GREEN = 1, CREAM = 2, GILL = 3, RED = 4, EYEK = 5, GLINT = 6, MOUTH = 7, SEED = 8;
  const MAT = { GREEN, CREAM, GILL, RED, EYEK, GLINT, MOUTH, SEED };
  const PAL = Creature.palette({
    // sampled from the official art: sage green #76a070 (lit #91af8b, shadow #4e684b), cream #efe3c4,
    // greyish-beige gills #baaf9b, dusty coral red claws/seeds #d86c72
    [GREEN]: { r: ['#4a6447', '#5f825b', '#76a070', '#91b48a', '#b0c8a8'], od: '#1e3220', ol: '#3e5e3c', ln: '#3e5c3c' },
    [SEED]:  { r: ['#4a6447', '#5f825b', '#76a070', '#91b48a', '#b0c8a8'], od: '#1e3220', ol: '#3e5e3c', ln: '#3e5c3c' },
    [CREAM]: { r: ['#b4a888', '#d2c6a6', '#ece0c2', '#f6efda', '#fffaec'], od: '#5e5434', ol: '#968a62', ln: '#9a8e66' },
    [GILL]:  { r: ['#857c6c', '#a59b89', '#baaf9b', '#cec4b2', '#e0d8c8'], od: '#46402e', ol: '#766e5a', ln: '#6e6654' },
    [RED]:   { r: ['#984a50', '#b65c62', '#d86c72', '#ea9094', '#f6b8b8'], od: '#541820', ol: '#8a3440', ln: '#86343c' },
    [EYEK]:  { r: ['#0a0a0c', '#101014', '#18181c', '#222228', '#303038'], od: '#050506', ol: '#0a0a0c', ln: '#050506' },
    [GLINT]: { r: ['#e8eef0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8090a0', ol: '#c0ccd8', ln: '#c0ccd8' },
    [MOUTH]: { r: ['#3a1216', '#521c20', '#6c282c', '#86383a', '#a04c4c'], od: '#22080a', ol: '#3a1216', ln: '#3a1216' },
  });
  const GLOSSY = { [RED]: 1, [SEED]: 1 };
  const C_GREEN = code(GREEN), C_CREAM = code(CREAM), C_GILL = code(GILL), C_GILL_D = code(GILL, -1), C_RED = code(RED);
  const C_EYEK = code(EYEK), C_GLINT = code(GLINT), C_MOUTH = code(MOUTH), C_SEED = code(SEED);
  const M_GREEN = () => C_GREEN, M_CREAM = () => C_CREAM, M_RED = () => C_RED, M_SEED = () => C_SEED, M_MOUTH = () => C_MOUTH;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
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
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * ext, rz], part, grp, mat);
  }

  let curScale = 1;

  /* ---------- head: cream, small black oval eyes (decals) ---------- */
  const HR = [19, 22, 18];
  const EYE_AZ = 0.52, EYE_V = 0.04;
  function eyePix(s, kind) {
    const az = Math.atan2(Math.abs(s[2]), s[0]);
    const px = 1 / (curScale * HR[1]);
    const u = (az - EYE_AZ) * 1.1, v = s[1] - EYE_V;
    const ru = Math.max(0.2, 1.4 * px), rv = Math.max(0.31, 2 * px);
    const a = u / ru, b = v / rv;
    if (kind === 'open') {
      if (a * a + b * b >= 1) return 0;
      const ga = (a + 0.3) / Math.max(0.38, (0.6 * px) / ru), gb = (b - 0.38) / Math.max(0.3, (0.6 * px) / rv);
      return ga * ga + gb * gb < 1 && px < 0.07 ? C_GLINT : C_EYEK;
    }
    const w = Math.max(0.2, (0.75 * px) / rv), k = a / 1.3;
    if (Math.abs(k) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = -0.3 + 0.8 * (1 - k * k);
    else if (kind === 'blink') yc = 0;
    else yc = 0.1 - 0.4 * (1 - k * k);
    return Math.abs(b - yc) < w ? C_EYEK : 0;
  }
  const headMat = (kind) => (s) => (s[0] > 0 ? eyePix(s, kind) || C_CREAM : C_CREAM);

  /* ---------- cap: green dome, beige gilled underside ---------- */
  const CAP_R = [36, 16, 38];
  const capMat = (s) => {
    if (s[1] > -0.45) return C_GREEN; // the green top and rim
    // underside: radial gills
    const az = Math.atan2(s[2], s[0]);
    const r = Math.hypot(s[0], s[2]);
    const lw = Math.max(0.05, 0.9 / (curScale * CAP_R[0] * Math.max(0.3, r)));
    const g = Math.abs(((az * 14) / Math.PI) % 1);
    if (r < 0.3) return C_GILL_D;
    return Math.min(g, 1 - g) < lw * 2 ? C_GILL_D : C_GILL;
  };
  // red seed with a dark centre
  const seedMat = (s) => (s[0] > 0.8 ? C_EYEK : C_RED);

  const DEFAULT = { walk: 0, punch: 0, tail: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 torso, 2 head+neck, 3 beak, 4 cap, 5 seeds, 6 collar, 7/8 arms, 9/10 legs, 11 tail, 12 seed balls, 13 jaw/mouth, 14 thighs
  const PRI = { 1: 0, 2: 1, 3: 3, 4: 2, 5: 3, 6: 2, 7: 3, 8: 3, 9: 0, 10: 0, 11: 0, 12: 1, 13: 2, 14: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = +P.walk || 0, walking = st !== 0;
    const pu = clamp(+P.punch || 0, 0, 1), tw = clamp(+P.tail || 0, -1, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 3 * Math.abs(Math.cos(st)) : 0;
    const rock = walking ? 0.05 * Math.sin(st) : 0;
    const lean = -0.04 - 0.14 * pu;
    // body frame at the hip centre
    const body = chain(T(0, 52 + bob - 3 * pu, 0), R(M3.ry(-0.12 * pu)), R(M3.rx(rock)), R(M3.rz(lean)));

    /* --- torso: big round green body --- */
    prims.push(ellF(chain(body, T(2, 22, 0)), [31, 36, 35], 1, 1, M_GREEN));
    anchors.body = inF(body, [2, 24, 0]);
    // heavy thighs
    for (const sd of [1, -1]) prims.push(ellF(chain(body, T(2, 4, sd * 21), R(M3.rz(0.25))), [22, 20, 17], 14, 14, M_GREEN));

    /* --- collar: cream petals round the shoulders --- */
    const neckB = inF(body, [6, 56, 0]);
    for (const az of [-2.3, -1.35, -0.48, 0.48, 1.35, 2.3]) {
      const out = dirF(body, [Math.cos(az), 0, Math.sin(az)]);
      const d = nrm(add(out, dirF(body, [0, -0.62, 0])));
      const c = add(add(neckB, sc(out, 20)), sc(d, 3));
      const [X, Y, Z] = frameAlong(d, dirF(body, [0, 1, 0]));
      prims.push(ellAx(c, X, Y, Z, [5, 16, 12.5], 6, 6, M_CREAM));
    }
    prims.push(ellF(chain(body, T(6, 56, 0)), [17, 7, 19], 6, 6, M_CREAM));

    /* --- neck + head --- */
    const neckTop = inF(body, [13, 94, 0]);
    prims.push(seg(inF(body, [6, 52, 0]), neckTop, 11, 11, 2, 2, M_CREAM));
    const head = chain(body, T(14, 106, 0), R(M3.rz(-lean * 0.8 + (walking ? 0.03 * Math.sin(2 * st) : 0))));
    const headPrim = ellF(head, HR, 2, 2, headMat(kind));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    // pointed beak, forward and down; the lower part drops to open
    const bd = dirF(head, [Math.cos(-0.5), Math.sin(-0.5), 0]);
    const bb = inF(head, [12, -4, 0]);
    prims.push(seg(bb, add(bb, sc(bd, 20)), 8.5, 8, 3, 3, M_CREAM, dirF(head, [0, 1, 0]), 1.05));
    prims.push(seg(add(bb, sc(bd, 12)), add(bb, sc(bd, 30)), 4.4, 4.2, 3, 3, M_CREAM, dirF(head, [0, 1, 0]), 1.05));
    prims.push(seg(add(bb, sc(bd, 25)), add(bb, sc(bd, 35)), 2, 2, 3, 3, M_CREAM, dirF(head, [0, 1, 0])));
    anchors.beak = add(bb, sc(bd, 35));
    anchors.mouth = add(bb, add(sc(bd, 14), dirF(head, [-0.5, -1, 0]).map((v) => v * 6)));
    if (mo > 0.03) {
      const jf = chain(head, T(8, -14, 0), R(M3.rz(-0.35 - 0.5 * mo)));
      prims.push(ellF(chain(jf, T(10, -1, 0)), [11, 3.6, 6], 13, 13, M_CREAM));
      prims.push(ellF(chain(head, T(16, -15, 0), R(M3.rz(-0.5))), [9, 1.5 + 3.5 * mo, 5], 13, 13, M_MOUTH));
    }

    /* --- cap: tilted back, gills showing under the front brim; red seeds on the sides --- */
    // worn like a hood: tipped far back so the gilled underside frames the face (official art)
    const cap = chain(head, T(-18, 14, 0), R(M3.rz(1.12)));
    prims.push(ellF(cap, CAP_R, 4, 4, capMat));
    anchors.cap = inF(cap, [0, CAP_R[1], 0]);
    let capTop = anchors.cap;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const q = inF(cap, [CAP_R[0] * Math.cos(a), 0, CAP_R[2] * Math.sin(a)]); if (q[1] > capTop[1]) capTop = q; }
    anchors.top = capTop;
    for (const sd of [1, -1]) {
      const s = nrm([Math.cos(1.3), -0.15, sd * Math.sin(1.3)]);
      const p = inF(cap, [CAP_R[0] * s[0], CAP_R[1] * s[1], CAP_R[2] * s[2]]);
      const n = dirF(cap, [s[0] / CAP_R[0], s[1] / CAP_R[1], s[2] / CAP_R[2]]);
      const [X, Y, Z] = frameAlong(dirF(cap, [0, 1, 0]), n);
      prims.push(ellAx(add(p, sc(n, 2)), X, Y, Z, [7.5, 7.5, 7.5], 5, 5, seedMat));
    }

    /* --- arms: short, red pointed claws; the near one shoots out for Mach Punch --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const sh = inF(body, [16, 44, sd * 24]);
      const ph = st + (sd > 0 ? Math.PI : 0);
      const sw = walking ? 0.35 * Math.sin(ph) : 0;
      let hand, dir;
      if (sd > 0 && pu > 0) {
        const ext = pu * 78;
        dir = nrm(lerp3(dirF(body, [0.35, -1, 0.3]), [1, 0.02, -0.08], Math.min(1, pu * 1.5)));
        hand = add(sh, sc(dir, 12 + ext));
      } else {
        dir = dirF(body, [0.35 + sw, -1, 0.3 * sd]);
        hand = add(sh, sc(dir, 12));
      }
      prims.push(seg(sh, hand, 4.4, 4.4, id, id, M_GREEN));
      const [X, Y, Z] = frameAlong(dir, dirF(body, [1, 0, 0]));
      const hc = add(hand, sc(Y, 7));
      const big = sd > 0 && pu > 0.5 ? 1.25 : 1;
      // a big pointed leaf-shaped claw
      prims.push(ellAx(add(hc, sc(Y, 2)), X, Y, Z, [8 * big, 14 * big, 7 * big], id, id, M_RED));
      prims.push(ellAx(add(hc, sc(Y, 12 * big)), X, Y, Z, [4.4 * big, 8 * big, 4 * big], id, id, M_RED));
      prims.push(ellAx(add(hc, sc(Y, 19 * big)), X, Y, Z, [2 * big, 4 * big, 1.8 * big], id, id, M_RED));
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hc, sc(Y, 22 * big));
    }
    anchors.fist = anchors.handN;

    /* --- legs: digitigrade green shins, two long red toe claws --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 9 : 10;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 11 * Math.sin(ph) : 0;
      const lift = walking ? 7 * Math.max(0, Math.cos(ph)) : 0;
      const knee = add(inF(body, [10, -8, sd * 23]), [fwd * 0.5, 0, 0]);
      const ank = [-4 + fwd, 12 + lift, sd * 25];
      prims.push(seg(knee, ank, 5.2, 5.2, id, id, M_GREEN, [1, 0, 0], 1.08));
      prims.push(ellF(T(...ank), [6, 6, 6], id, id, M_GREEN));
      const tip = walking ? 0.3 * Math.sin(ph) * (lift > 0 ? 1 : 0.3) : 0;
      const foot = chain(T(...ank), R(M3.ry(-sd * 0.12)), R(M3.rz(-tip)));
      for (const k of [1, -1]) {
        const cf = chain(foot, R(M3.ry(k * 0.28)));
        prims.push(seg(inF(cf, [-2, -3, 0]), inF(cf, [19, -9.5, 0]), 5.2, 4.6, id, id, M_RED, [0, 1, 0], 1.05));
        prims.push(seg(inF(cf, [12, -8, 0]), inF(cf, [25, -11.2, 0]), 2.4, 2.2, id, id, M_RED, [0, 1, 0]));
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [8, -12, 0]);
    }

    /* --- tail: long cream tail curling up behind, green seed cluster --- */
    const tf = chain(body, T(-24, 6, 0), R(M3.ry(Math.PI - 0.55 * tw + (walking ? 0.12 * Math.sin(st) : 0))), R(M3.rz(0.12)));
    // tail frame: +x back along the tail; build it as a chain of tapering segments curling up
    let p = inF(tf, [0, 0, 0]), ang = -0.3;
    const pts = [p];
    const N = 10;
    for (let i = 0; i < N; i++) {
      ang += 0.03 + 0.024 * i;
      const d = dirF(tf, [Math.cos(ang), Math.sin(ang), 0]);
      p = add(p, sc(d, 10.5));
      pts.push(p);
    }
    for (let i = 0; i < N; i++) {
      const r0 = lerp(12, 4.4, i / N), r1 = lerp(12, 4.4, (i + 1) / N);
      prims.push(seg(pts[i], pts[i + 1], (r0 + r1) / 2, (r0 + r1) / 2, 11, 11, M_CREAM, [0, 1, 0], 1.9));
    }
    const tipDir = nrm(sub(pts[N], pts[N - 1]));
    const cl = add(pts[N], sc(tipDir, 7));
    const [X, Y, Z] = frameAlong(tipDir, [0, 0, 1]);
    for (const [a, b, c] of [[0, 0, 0], [-0.9, 0.7, 0.2], [0.9, 0.7, -0.2], [0, 0.9, 0.9], [0, 0.6, -0.9]])
      prims.push(ellAx(add(cl, add(add(sc(X, a * 9), sc(Y, b * 7)), sc(Z, c * 8))), X, Y, Z, [8.6, 8.6, 8.6], 12, 12, M_SEED));
    anchors.tail = add(cl, sc(Y, 6));

    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: GREEN, shadowSteps: 12 };
  }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.2, bw: 310, bh: 250, oy: 0.9 } };
})();
