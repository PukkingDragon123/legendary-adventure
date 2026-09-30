/* ------------------------------------------------------------------
   Linoone — the Rushing Pokémon (0.5 m; a long, low weasel: ≈ 75 units
   tall to the tail tip at scale 1, ≈ 195 long). Zigzagoon's evolution.
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a long, sleek, streamlined body in
   cream-white fur with straight taupe-brown stripes running lengthwise:
   a mask stripe from the bridge of the muzzle over each eye to the back
   of the head (jagged end), a thin dorsal stripe from the brow along the
   spine tapering out mid-back, and a broad flank stripe starting in a
   jagged point mid-body and running back into the lower half of the long
   bushy tail, which sweeps up and back to a fringed white tip. A pointed
   wedge-shaped head with a black nose, narrow fierce blue eyes, small
   spiky white ear tufts and two little fangs; very short white legs with
   big pale blue-grey claws.

   Pose parameters (all optional):
     walk   radians  run-cycle phase (diagonal trot; with dash, a bounding
                     gallop); exactly 0 = standing
     dash   0..1     rushing: body stretches long and low, legs reach fore
                     and aft, head thrusts forward, tail streams straight back
     sniff  0..1     head down, nose to the ground (sniffing a trail);
                     the nose twitches if animated
     mouth  0..1     jaw open
     eyes   'open' | 'happy' | 'blink' | 'closed'
     side   −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (highest point: tail tip or back), head (head centre),
   mouth, nose (nose tip), eyeN, eyeF, body (torso centre), tail (tail
   tip), earN / earF, pawN / pawF (front paws).
------------------------------------------------------------------- */
const Linoone = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const FUR = 1, STRIPE = 2, CLAW = 3, NOSE = 4, IRIS = 5, EYEK = 6, MOUTH = 7, FANG = 8, GLINT = 9;
  const MAT = { FUR, STRIPE, CLAW, NOSE, IRIS, EYEK, MOUTH, FANG, GLINT };
  const PAL = Creature.palette({
    // sampled from the official art: pinkish cream fur #e7ddd7 (shadow #cac0ba), taupe stripes #a58d7b / #89806a
    [FUR]:    { r: ['#a8a09a', '#c6bcb6', '#e0d6d0', '#ece4de', '#f8f4f0'], od: '#4e4440', ol: '#867c76', ln: '#8e8480' },
    [STRIPE]: { r: ['#665646', '#86766a', '#a28a78', '#b49e8c', '#c8b4a2'], od: '#34261a', ol: '#5e4a38', ln: '#5a4838' },
    [CLAW]:   { r: ['#8e96a6', '#aab2c0', '#cdd2dc', '#e2e6ee', '#f6f8fc'], od: '#3c4a60', ol: '#6c7c94', ln: '#6c7c94' },
    [NOSE]:   { r: ['#1c1c20', '#2a2a30', '#3c3c44', '#56565e', '#8a8a94'], od: '#0a0a0c', ol: '#1c1c20', ln: '#0a0a0c' },
    [IRIS]:   { r: ['#3e84ae', '#5aa0c8', '#80c0e2', '#a4d6ee', '#cceaf8'], od: '#0c3458', ol: '#1a6aa8', ln: '#1a6aa8' },
    [EYEK]:   { r: ['#0a0a0e', '#101016', '#16161e', '#20202a', '#2e2e3a'], od: '#050508', ol: '#0a0a0e', ln: '#050508' },
    [MOUTH]:  { r: ['#3e1218', '#561c22', '#70282e', '#8c3a3e', '#a84e50'], od: '#24080c', ol: '#3e1218', ln: '#3e1218' },
    [FANG]:   { r: ['#b8b8c0', '#d8d8de', '#f4f4f6', '#ffffff', '#ffffff'], od: '#5a5a66', ol: '#8a8a96', ln: '#8a8a96' },
    [GLINT]:  { r: ['#e8f4ff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8090a0', ol: '#c0ccd8', ln: '#c0ccd8' },
  });
  const GLOSSY = { [NOSE]: 1, [CLAW]: 1, [IRIS]: 1 };
  const C_FUR = code(FUR), C_ST = code(STRIPE), C_CLAW = code(CLAW), C_NOSE = code(NOSE), C_IRIS = code(IRIS);
  const C_EYEK = code(EYEK), C_MOUTH = code(MOUTH), C_FANG = code(FANG), C_GLINT = code(GLINT);
  const M_FUR = () => C_FUR, M_CLAW = () => C_CLAW, M_NOSE = () => C_NOSE, M_FANG = () => C_FANG;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
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
  const tri = (x) => { const f = x - Math.floor(x); return Math.abs(f - 0.5) * 4 - 1; }; // −1..1 zig-zag

  let curScale = 1;

  /* ---------- torso (body frame, rest coordinates): long streamlined body ---------- */
  // stripes from rest-space position p and the unit normal-ish direction (y/z of the section)
  // dorsal stripe: along the spine from the neck, tapering out at x ≈ −12
  // flank stripe: from a jagged point at x ≈ 2 back along the upper flank into the tail
  function bodyStripe(p, sy, sz) {
    const az = Math.atan2(Math.abs(sz), sy); // 0 = top of the back, π/2 = the flank, π = belly
    const wD = 0.82 * clamp((p[0] + 18) / 34, 0, 1) ** 0.8 + 0.04 * tri(p[0] / 6);
    if (az < wD) return true;
    const f0 = 2 + 5 * tri(az * 2.2 + 0.2);
    if (p[0] < f0) {
      const k = clamp((f0 - p[0]) / 30, 0, 1);
      const c = 1.02 + 0.05 * k, w = 0.12 + 0.24 * Math.sqrt(k);
      if (Math.abs(az - c) < w + 0.025 * tri(p[0] / 7)) return true;
    }
    return false;
  }
  const bodyMat = (C, Rr) => (s) => {
    const p = [C[0] + Rr[0] * s[0], C[1] + Rr[1] * s[1], C[2] + Rr[2] * s[2]];
    return bodyStripe(p, (p[1] - 24.5) / 13.5, p[2] / 13.5) ? C_ST : C_FUR;
  };

  /* ---------- head (head frame; origin at the head centre, x forward) ---------- */
  const HR = [19, 11.5, 12.5];
  const EYE = { x: 9, y: 3.6, z: 8.6 };
  const EAZ = Math.atan2(EYE.z / HR[2], EYE.x / HR[0]), EV = EYE.y / HR[1];
  function eyePix(s, kind) {
    const sd = s[2] >= 0 ? 1 : -1;
    const az = Math.atan2(Math.abs(s[2]) / 1, s[0]);
    const px = 1 / (curScale * HR[1]);
    const u = (az - EAZ) * 1.25, v = s[1] - EV; // u > 0 toward the back of the head
    const ru = Math.max(0.3, 2.4 * px), rv = Math.max(0.17, 1.5 * px);
    const a = u / ru, b = v / rv;
    if (kind === 'open') {
      // narrow fierce almond: flat top sloping down to the front
      const top = 0.55 + 0.4 * a, bot = -0.9 * Math.sqrt(Math.max(0, 1 - a * a));
      if (Math.abs(a) > 1 || b > top || b < bot) return 0;
      const lw = (0.8 * px) / rv;
      if (b > top - lw * 1.2 || b < bot + lw * 0.6 || Math.abs(a) > 1 - (0.7 * px) / ru) return C_EYEK;
      const pa = (a + 0.15) / Math.max(0.28, (0.9 * px) / ru), pb = (b + 0.05) / Math.max(0.5, (1 * px) / rv);
      if (pa * pa + pb * pb < 1) return C_EYEK;
      const ga = (a + 0.45) / Math.max(0.2, (0.6 * px) / ru), gb = (b - 0.2) / Math.max(0.35, (0.6 * px) / rv);
      if (ga * ga + gb * gb < 1 && px < 0.08) return C_GLINT;
      return C_IRIS;
    }
    if (Math.abs(a) > 1) return 0;
    const w = Math.max(0.12, (0.8 * px) / rv);
    let yc;
    if (kind === 'happy') yc = -0.3 + 0.8 * (1 - a * a);
    else if (kind === 'blink') yc = 0.05 + 0.2 * a;
    else yc = 0.1 - 0.25 * (1 - a * a) + 0.2 * a;
    return Math.abs(b - yc) < w ? C_EYEK : 0;
  }
  // mask stripe: over the eye, from the muzzle bridge back to a jagged end behind the head;
  // plus the dorsal stripe starting on the brow
  function headStripe(p) {
    const r = Math.hypot(p[1] / HR[1], p[2] / HR[2]);
    const az = Math.atan2(Math.abs(p[2]) / HR[2], p[1] / HR[1]);
    if (p[0] < 8 && az < 0.34) return true;
    const endX = -HR[0] - 2 + 5 * tri(az * 2.5);
    if (p[0] > endX && p[0] < 17) {
      const c = 0.95 + 0.012 * (p[0] - EYE.x);
      const w = 0.44 - 0.014 * Math.max(0, p[0] - EYE.x) + 0.1 * Math.max(0, -p[0] / HR[0]);
      if (Math.abs(az - c) < w && r > 0.2) return true;
    }
    return false;
  }
  const headMat = (kind) => (s) => {
    const p = [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]];
    if (s[0] > 0) { const e = eyePix(s, kind); if (e) return e; }
    return headStripe(p) ? C_ST : C_FUR;
  };
  // muzzle (head frame offset SN_C): the mask stripe runs on along its upper side
  const SN_C = [18, -2.6, 0], SN_R = [13, 6, 6.6];
  const snoutMat = (s) => {
    const p = [SN_C[0] + SN_R[0] * s[0], SN_C[1] + SN_R[1] * s[1], SN_C[2] + SN_R[2] * s[2]];
    const az = Math.atan2(Math.abs(s[2]), s[1]);
    if (p[0] < 21 && p[0] > 8 && az > 0.35 && az < 1.2 && s[1] > -0.1) return C_ST;
    return C_FUR;
  };

  /* ---------- flat pieces ---------- */
  // spiky ear tuft (u = up, v = across): three points
  const EAR_G = bakeShape(Shape2D.poly([[-1, -3.6], [4, -3.4], [6.8, -2.6], [4.4, -1.1], [7.6, 0], [4.4, 1.1], [6.8, 2.6], [4, 3.4], [-1, 3.6]], C_FUR, 6));
  // fur spike (u = along)
  const SPK = (m) => bakeShape({ bb: [-1, -3.5, 10.5, 3.5], test: (u, v) => (u < -1 || u > 10 ? 0 : Math.abs(v) < 3.2 * Math.max(0, Math.min(1, (10 - u) / 10)) ** 0.8 ? m : 0) });
  const SPK_F = SPK(C_FUR), SPK_S = SPK(C_ST);

  const DEFAULT = { walk: 0, dash: 0, sniff: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 muzzle, 4 nose, 5 jaw, 6 mouth, 7 ears, 8 tail, 9 tail tufts, 10..13 legs, 14 cheek tufts, 15 fangs
  Object.assign(PRI, { 2: 2, 3: 3, 4: 4, 5: 2, 6: 1, 7: 1, 14: 1, 15: 4, 9: 1 });

  const LEGS = [
    { hip: [28, 20, 8.5], ph: 0, front: 1 }, { hip: [28, 20, -8.5], ph: Math.PI, front: 1 },
    { hip: [-30, 21, 9.5], ph: Math.PI, front: 0 }, { hip: [-30, 21, -9.5], ph: 0, front: 0 },
  ];

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = +P.walk || 0, moving = st !== 0;
    const dash = clamp(+P.dash || 0, 0, 1), sn = clamp(+P.sniff || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = moving ? (1.4 + 1.2 * dash) * Math.abs(Math.sin(st)) : 0;
    const pitch = -0.06 * sn + (moving ? 0.035 * Math.sin(2 * st) * (1 + dash) : 0);
    const stretch = 1 + 0.12 * dash;
    const body = chain(T(0, bob - 2.5 - 3.5 * dash, 0), R(M3.rz(pitch)), Creature.S(stretch, 1 - 0.06 * dash, 1));

    /* --- torso: chest, middle, rounded haunch --- */
    for (const [C, Rr] of [[[22, 25, 0], [22, 12.5, 12]], [[-2, 23.8, 0], [34, 14.4, 13.8]], [[-26, 24, 0], [22, 13.8, 13.8]]])
      prims.push(ellF(chain(body, T(...C)), Rr, 1, 1, bodyMat(C, Rr)));
    anchors.body = inF(body, [-2, 25, 0]);

    /* --- neck + head: wedge head, long pointed muzzle --- */
    const sniffDrop = sn * 11;
    let hf = chain(body, T(40, 30 - sniffDrop, 0), R(M3.rz(-0.12 - 0.5 * sn + 0.12 * dash)), T(10 + 3 * dash, 0, 0));
    // keep the nose off the ground when sniffing
    const low = Math.min(inF(hf, [27, -8, 0])[1], inF(hf, [5, -HR[1], 0])[1]) - (mo > 0.03 ? 4 * mo : 0);
    if (low < 1.5) hf = chain(T(0, 1.5 - low, 0), hf);
    prims.push(seg(inF(body, [30, 26, 0]), inF(hf, [-8, -1, 0]), 11, 11, 1, 1, bodyMat([30, 26, 0], [11, 11, 11])));
    const headPrim = ellF(hf, HR, 2, 2, headMat(kind));
    prims.push(headPrim);
    anchors.head = hf.t;
    for (const [k, sd] of [['eyeN', 1], ['eyeF', -1]]) anchors[k] = inF(hf, [EYE.x, EYE.y, sd * EYE.z]);
    prims.push(ellF(chain(hf, T(...SN_C), R(M3.rz(-0.08))), SN_R, 3, 2, snoutMat)); // same contour group as the head: one smooth wedge
    const twitch = sn > 0 ? 0.6 * Math.sin(sn * 40) : 0;
    prims.push(ellF(chain(hf, T(30.2, -3.2 + twitch, 0)), [2.2, 2, 2.5], 4, 4, M_NOSE));
    anchors.nose = inF(hf, [32.4, -3.2, 0]);
    anchors.mouth = inF(hf, [22, -8, 0]);
    // jaw (opens) and two little fangs
    const jf = chain(hf, T(6, -6.8, 0), R(M3.rz(-0.5 * mo)));
    prims.push(ellF(chain(jf, T(10, -0.4, 0)), [12.5, 3.2, 6], 5, 5, M_FUR));
    if (mo > 0.03) prims.push(ellF(chain(hf, T(14, -7, 0)), [9, 1.5 + 3.5 * mo, 5.2], 6, 6, () => C_MOUTH));
    for (const sd of [1, -1]) {
      const fb = inF(chain(hf, T(0, 0, 0)), [23.5, -7.3, sd * 2.6]);
      prims.push(seg(fb, add(fb, dirF(hf, [0.15, -1, 0]).map((v) => v * 3.6)), 0.9, 0.9, 15, 15, M_FANG));
    }
    // spiky ear tufts on top of the head, turned out a little
    for (const sd of [1, -1]) {
      const root = inF(hf, [-6, 9.5, sd * 6.5]);
      const U = dirF(hf, [-0.3, 1, 0.35 * sd]), V = dirF(hf, [1, 0.3, 0]);
      const Vv = nrm(sub(V, sc(U, dot(V, U))));
      prims.push({ kind: 'plate', part: 7, grp: 7, c: root, L: M3.cols(U, Vv, cross(U, Vv)), shape: EAR_G, thick: 1.6 });
      anchors[sd > 0 ? 'earN' : 'earF'] = add(root, sc(U, 9));
    }
    // jagged cheek ruff behind the jaw (white) and the jagged end of the mask stripe
    for (const sd of [1, -1]) {
      for (const [p, d, m, l] of [[[-10, -5, 9], [-1, -0.5, 0.5], SPK_F, 1.1], [[-14, 1, 9.5], [-1, 0.1, 0.4], SPK_S, 1], [[-6, -9, 6], [-0.8, -0.8, 0.4], SPK_F, 0.9]]) {
        const root = inF(hf, [p[0], p[1], sd * p[2]]);
        const U = dirF(hf, [d[0], d[1], sd * d[2]]);
        const n = dirF(hf, [0, 0.2, sd]);
        const Vv = nrm(cross(n, U));
        prims.push({ kind: 'plate', part: 14, grp: 14, c: root, L: M3.cols(sc(U, l), Vv, cross(U, Vv)), shape: m, thick: 1.4 });
      }
    }

    /* --- legs: very short, white, big pale claws --- */
    LEGS.forEach((lg, i) => {
      const ph = st + (dash > 0.5 && moving ? (lg.front ? 0 : Math.PI) : lg.ph);
      const amp = 5 + 7 * dash;
      const reach = (lg.front ? 1 : -1) * 9 * dash * (moving ? 0.4 : 1);
      const swing = moving ? -Math.cos(ph) * amp : 0;
      const lift = moving ? Math.max(0, Math.sin(ph)) * (3.5 + 2 * dash) : 2.5 * dash;
      const hip = inF(body, lg.hip);
      const foot = [hip[0] + swing + reach + (lg.front ? 2 : 0), 3 + lift, lg.hip[2] * 1.15];
      const id = 10 + i;
      prims.push(seg(hip, add(foot, [0, 1.5, 0]), 4.4, 4.2, id, id, M_FUR));
      const paw = chain(T(foot[0] + 1.5, foot[1], foot[2]), R(M3.rz(dash > 0 && !moving ? (lg.front ? 0.5 : -0.5) * dash : 0)));
      prims.push(ellF(paw, [5.6, 3, 4.2], id, id, M_FUR));
      for (const k of lg.front ? [-1, 0, 1] : [-1, 1]) {
        const cb = inF(paw, [4.2, -0.4, k * 2.2]);
        prims.push(seg(cb, inF(paw, [lg.front ? 11.5 : 9, -2.8, k * 2.6]), 1.2, 1.2, id, id, M_CLAW, [0, 1, 0], 1.05));
      }
      if (i === 0) anchors.pawN = inF(paw, [7, -2, 0]);
      if (i === 1) anchors.pawF = inF(paw, [7, -2, 0]);
    });

    /* --- tail: long bushy plume sweeping up and back, lower half brown --- */
    const tAng = lerp(0.12, 0.02, dash) + (moving ? 0.06 * Math.sin(st + 1) : 0);
    const tf = chain(body, T(-44, 27, 0), R(M3.rz(Math.PI - tAng)), R(M3.rx(moving ? 0.1 * Math.sin(st) : 0)));
    // tail frame: +x runs back along the tail, +y is the tail's upper side (flipped by the π turn)
    const tailMat = (x0, rx) => (s) => {
      const x = x0 + rx * s[0];
      const tip = x > 58 + 4 * tri(s[2] * 1.5 + s[1]);
      return !tip && Math.abs(s[1] + 0.05) < 0.36 - 0.12 * Math.max(0, (x - 30) / 30) + 0.06 * tri(x / 8) && x > -6 ? C_ST : C_FUR;
    };
    let top = inF(body, [-2, 38, 0]);
    const TB = (x) => -0.07 * (x / 60) ** 2;
    for (const [x, rx, ry, rz] of [[6, 14, 11, 9.8], [20, 16, 13, 10.2], [35, 16, 13.6, 10], [49, 13, 11.6, 8.6], [58, 9, 8, 6.4]]) {
      const c = chain(tf, R(M3.rz(TB(x))), T(x, 0, 0), R(M3.rz(TB(x) * 0.8)));
      prims.push(ellF(c, [rx, ry, rz], 8, 8, tailMat(x, rx)));
    }
    // fringed tip: a fan of white spikes (and brown ones along the lower edge)
    const tipF = chain(tf, R(M3.rz(TB(64))), T(64, 0, 0), R(M3.rz(TB(64) * 0.8)));
    for (const [dy, dz, m, l] of [[0, 0, SPK_F, 1.6], [0.6, 0.2, SPK_F, 1.4], [-0.5, -0.3, SPK_F, 1.3], [0.2, -0.6, SPK_F, 1.2], [-0.1, 0.6, SPK_F, 1.2], [-0.9, 0, SPK_F, 1.1], [1.1, 0, SPK_F, 1.1]]) {
      const root = inF(tipF, [0, dy * 8, dz * 6]);
      const U = dirF(tipF, [1, dy * 0.8, dz * 0.6]);
      const n0 = dirF(tipF, [0, 0, 1]);
      const Vv = nrm(sub(cross(n0, U), [0, 0, 0]));
      prims.push({ kind: 'plate', part: 9, grp: 9, c: root, L: M3.cols(sc(U, l), Vv, cross(U, Vv)), shape: m, thick: 1.4 });
    }
    anchors.tail = inF(tipF, [14, 0, 0]);
    if (anchors.tail[1] > top[1]) top = anchors.tail;
    anchors.top = top;

    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 12 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 290, bh: 116, oy: 0.9 } };
})();
