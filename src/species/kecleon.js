/* ------------------------------------------------------------------
   Kecleon — the Color Swap Pokémon (1.0 m ≈ 175 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (= Kecleon's
   left side), ground at y = 0.

   Build (after the official art): a yellow-green chameleon standing with a
   slight forward lean on short legs; a big head with a long flat snout and
   thick yellow lips, a yellow ridge running up the snout and forehead to a
   tall spiky frill crest (green spikes in front, a yellow crown behind);
   two big eye turrets with a yellow ring, pale green iris and small black
   pupil that roll independently; a row of green spikes down the nape; a
   dusty-rose zig-zag band round the belly; a yellow three-pointed mark on
   each hip; long arms reaching forward with three cream claws; and a long
   tail rolled up in a big spiral behind.
   (Camouflage transparency is done by the game; this renders normal colours.)

   Pose params:
     tongue  0..1    tongue shot forward: 0 = in, 1 = fully out (≈ one body length,
                     sticky pink ball on the tip); opens the mouth automatically
     tongueAim -1..1 aim the tongue down (−1, ≈ −29°) / up (+1, ≈ +29°), default 0
     tail    0..1    tail curl tightness: 0 = loose open curl, 1 = tight spiral
     eyeL    -1..1   left eye (near side at yaw 0) direction: -1 back, 0 side, +1 forward
     eyeR    -1..1   right eye direction (same convention)
     eyeUp   -1..1   both eyes look down / up (optional, default 0)
     mouth   0..1    jaw open amount
     step    radians walk cycle phase, period 2π (legs, arm swing, body bob, tail sway);
                     exactly 0 = standing still, phase 0+ starts from a planted stride
     arms    0..1    raise both arms (0 = reaching forward, 1 = up high)
     eyes    'open' | 'happy' | 'closed' | 'blink'
     lean    -1..1   body lean forward (+) / back (−), default 0
   Anchors: top, head, mouth, tongueTip, eyeN, eyeF, body, belly, tail (spiral
   centre), handN, handF, footN, footF.
------------------------------------------------------------------- */
const Kecleon = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const GREEN = 1, CREAM = 2, RED = 3, EYEY = 4, PUPIL = 5, MOUTH = 6, TONGUE = 7, CLAW = 8, IRIS = 9;
  const MAT = { GREEN, CREAM, RED, EYEY, PUPIL, MOUTH, TONGUE, CLAW, IRIS };
  const PAL = Creature.palette({
    [GREEN]:  { r: ['#5a8438', '#7ea450', '#a6c670', '#c4dc90', '#e2f0b8'], od: '#2e4a1a', ol: '#56782f', ln: '#54763a' },
    [CREAM]:  { r: ['#b0a870', '#ccc48c', '#e4dcaa', '#f2ecc8', '#fcf8e6'], od: '#5e5424', ol: '#8c8248', ln: '#948a54' },
    [RED]:    { r: ['#6e2440', '#8e3c58', '#b45a74', '#cc7c92', '#e4a6b6'], od: '#401024', ol: '#6c2440', ln: '#6e2442' },
    [EYEY]:   { r: ['#c49440', '#e0b65c', '#f8d888', '#fde9b2', '#fff8e0'], od: '#6a4a12', ol: '#9e7a30', ln: '#9e7a32' },
    [IRIS]:   { r: ['#90aa70', '#afc68e', '#cedeae', '#e2ecc8', '#f6faea'], od: '#44602a', ol: '#6a8448', ln: '#6a8448' },
    [PUPIL]:  { r: ['#0e0e12', '#141418', '#1c1c22', '#2a2a32', '#f4f4f4'], od: '#08080a', ol: '#0e0e10', ln: '#0e0e10' },
    [MOUTH]:  { r: ['#5a1422', '#7a1e2e', '#9a2c3c', '#b4404e', '#cc5e68'], od: '#360a14', ol: '#561222', ln: '#561222' },
    [TONGUE]: { r: ['#b84264', '#d65e80', '#ee849e', '#ffaec0', '#ffd4de'], od: '#681430', ol: '#902040', ln: '#a43050' },
    [CLAW]:   { r: ['#bcae84', '#d8cca4', '#f0e8cc', '#fbf6e8', '#ffffff'], od: '#5e5234', ol: '#8a7e5c', ln: '#948862' },
  });
  const GLOSSY = { [PUPIL]: 1, [TONGUE]: 1 };

  const DEFAULT = { tongue: 0, tongueAim: 0, tail: 0.5, eyeL: 0, eyeR: 0, eyeUp: 0, mouth: 0, step: 0, arms: 0, eyes: 'open', lean: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // rotation whose x axis is d and whose y axis is as close as possible to `up`
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid (model space) spanning p0 → p1 along its local x axis
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.12) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }

  let curScale = 1;

  const C_GREEN = code(GREEN), C_GREEN_D = code(GREEN, -1), C_GREEN_L = code(GREEN, 1), C_RED = code(RED);
  const C_YEL = code(EYEY), C_YEL_D = code(EYEY, -1), C_IRIS = code(IRIS), C_PUPIL = code(PUPIL), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_CLAW = code(CLAW);
  const M_GREEN = () => C_GREEN, M_CLAW = () => C_CLAW, M_MOUTH = () => C_MOUTH, M_TONGUE = () => C_TONGUE;

  /* ---------- body layout (body frame: origin on the ground between the feet) ---------- */
  const BELLY_C = [3, 56, 0], BELLY_R = [25, 27, 23];
  const CHEST_C = [9, 82, 0], CHEST_R = [19, 21, 18];
  const HIP_C = [-3, 38, 0], HIP_R = [23, 16, 23];
  const BAND_Y = 57, BAND_A = 4.6, BAND_N = 9, BAND_W = 5.2; // zig-zag band: centre height, amplitude, zigs around, half width

  // torso material: green with the rose zig-zag band all the way round (a slightly paler belly).
  // The torso ellipsoids are axis-aligned in the body frame, so body-space coordinates come straight from s.
  function torsoMat(C, Rr, band) {
    return (s) => {
      if (band) {
        const y = C[1] + Rr[1] * s[1];
        const az = Math.atan2(Rr[2] * s[2], C[0] + Rr[0] * s[0]);
        const ph = (az / (2 * Math.PI)) * BAND_N;
        const tri = Math.abs(ph - Math.floor(ph + 0.5)) * 4 - 1; // triangle wave -1..1
        if (Math.abs(y - (BAND_Y + BAND_A * tri)) < BAND_W) return C_RED;
      }
      return s[0] > 0.55 && Math.abs(s[2]) < 0.6 ? C_GREEN_L : C_GREEN;
    };
  }
  // yellow three-pointed mark on the side of each hip
  const LOBES = [1.0, 1.55, 2.1];
  function hipMat(s) {
    if (Math.abs(s[2]) > 0.45) {
      const dx = s[0] + 0.28, dy = s[1] + 0.35;
      const r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      if (dy > -0.05 && r < 0.75) {
        for (const la of LOBES) {
          const w = 0.22 * (1 - r / 0.75) + 0.02;
          if (Math.abs(ang - la) < w / Math.max(0.2, r) * 0.9 || r < 0.14) return C_YEL;
        }
      }
    }
    return C_GREEN;
  }

  /* ---------- crest (frill) on top of the head: a spiky plate in the head's mid-plane ---------- */
  // u = forward, v = up (v = 0 on the top of the cranium)
  const CREST_PTS = [
    [20, -8], [23, 6], [16, 4], [15, 17], [8, 9], [3, 30], [-3, 13], [-7, 24], [-11, 10], [-16, 20], [-18, 6], [-25, 12], [-24, -2], [-20, -10],
  ];
  const CREST_POLY = CREST_PTS; // straight-edged spikes
  const CREST = bakeShape({
    bb: Shape2D.bbox(CREST_POLY, 0.5),
    test: (u, v) => (Shape2D.inPoly(u, v, CREST_POLY) ? (u > 6 ? C_GREEN_L : v > 22 ? code(EYEY, 1) : C_YEL) : 0),
  }, 0.5);
  // spikes down the nape / upper back (plate in the body's mid-plane; u = back, v = up)
  const NAPE_PTS = [[-4, -6], [2, 10], [6, 1], [12, 12], [14, 0], [21, 8], [20, -4], [10, -9]];
  const NAPE = bakeShape({ bb: Shape2D.bbox(NAPE_PTS, 0.5), test: (u, v) => (Shape2D.inPoly(u, v, NAPE_PTS) ? C_GREEN : 0) }, 0.5);

  /* ---------- eye turret aperture decal (turret frame: x = aperture axis, y = up) ---------- */
  const AP = 0.6; // cos of the aperture's angular radius
  const APR = Math.sqrt(1 - AP * AP);
  function eyeMat(kind) {
    return (s) => {
      if (s[0] < AP - 0.02) return C_GREEN;
      const px = 1 / (curScale * 14);
      const r = Math.sqrt(s[1] * s[1] + s[2] * s[2]) / APR; // 0 centre .. 1 rim
      if (r > 0.74) return r > 0.93 ? C_YEL_D : C_YEL; // yellow ring
      if (kind === 'closed' || kind === 'happy') {
        // happy: a high arch (^), closed: a sleepy U-shaped lash line
        const yc = kind === 'happy' ? 0.26 - 0.9 * s[2] * s[2] : -0.04 + 0.5 * s[2] * s[2];
        if (Math.abs(s[1] - yc) < Math.max(0.06, 1.1 * px)) return C_PUPIL;
        return C_GREEN;
      }
      if (kind === 'blink') return s[1] > -0.02 ? C_GREEN : Math.abs(s[1] + 0.02) < Math.max(0.05, px) ? C_GREEN_D : C_GREEN;
      // small round black pupil with a glint, on a pale green iris
      const pr = Math.hypot(s[1] / 1.25, s[2]) / APR;
      if (pr < Math.max(0.3, 1.6 * px / APR)) return pr < 0.1 && s[1] > 0 ? code(PUPIL, 2) : C_PUPIL;
      return C_IRIS;
    };
  }

  /* ---------- tail spiral (2D, in the body's x-y plane) ---------- */
  function tailPath(curl, sway) {
    const pts = [];
    let x = -20, y = 34, phi = Math.PI + 0.55; // heading back and down
    const L = 285, ds = 6;
    const k0 = lerp(0.006, 0.011, curl), k1 = lerp(0.00017, 0.00036, curl);
    for (let s = 0; s <= L; s += ds) {
      pts.push([x, y, sway * (s / L) * 10]);
      const k = -(k0 + k1 * s);
      phi += k * ds;
      x += Math.cos(phi) * ds;
      y += Math.sin(phi) * ds;
    }
    return pts;
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const tg = clamp(+P.tongue || 0, 0, 1);
    const mo = Math.max(clamp(+P.mouth || 0, 0, 1), tg > 0.01 ? 0.3 + 0.2 * Math.min(1, tg * 4) : 0);
    const step = +P.step || 0, walking = step !== 0;
    const armUp = clamp(+P.arms || 0, 0, 1);
    const lean = 0.2 + clamp(+P.lean || 0, -1, 1) * 0.16; // standing with a slight forward lean
    // body bob: lowest when both feet are down (phase 0, π), highest mid-swing
    const bobY = walking ? 1.4 - 2.6 * Math.abs(Math.cos(step)) : 0;
    // body frame: lean about the hips, walk bob
    const body = chain(T(0, bobY, 0), T(0, 36, 0), R(M3.rz(-lean)), T(0, -36, 0));

    /* --- torso: belly (with the band), chest, hips --- */
    prims.push(ellF(chain(body, T(...BELLY_C)), BELLY_R, 1, 1, torsoMat(BELLY_C, BELLY_R, true)));
    prims.push(ellF(chain(body, T(...CHEST_C)), CHEST_R, 1, 1, torsoMat(CHEST_C, CHEST_R, false)));
    prims.push(ellF(chain(body, T(...HIP_C)), HIP_R, 1, 1, hipMat));

    /* --- head: big cranium + long flat snout (upper jaw), hinged lower jaw, mouth interior --- */
    const head = chain(body, T(15, 98, 0), R(M3.rz(lean * 0.85)), T(6, 20, 0));
    const cran = ellF(chain(head, T(0, 4, 0)), [27, 27, 23], 2, 2, (s) => (Math.abs(s[2]) < 0.12 && s[0] > 0.05 && s[1] > 0.2 ? C_YEL : C_GREEN));
    const snout = ellF(chain(head, T(22, -7, 0), R(M3.rz(-0.1))), [28, 14, 17], 2, 2, (s) => {
      if (s[1] < -0.5) return C_YEL; // thick upper lip
      if (Math.abs(s[2]) < 0.14 && s[1] > 0.3 && s[0] < 0.9) return C_YEL; // ridge up the snout
      return C_GREEN;
    });
    prims.push(cran, snout);
    const hinge = [-2, -14, 0];
    const jawF = chain(head, T(...hinge), R(M3.rz(-mo * 0.55)));
    prims.push(ellF(chain(jawF, T(23, -2.5, 0), R(M3.rz(0.02))), [26, 8.5, 16], 3, 3, (s) => (s[1] > 0.2 ? C_YEL : C_GREEN_L)));
    if (mo > 0.03) {
      // mouth interior: a dark wedge filling the gape
      const mid = chain(head, T(...hinge), R(M3.rz(-mo * 0.27)));
      prims.push(ellF(chain(mid, T(21, -1, 0)), [23, 6 + mo * 3, 14], 4, 4, M_MOUTH));
    }
    // throat
    prims.push(ellF(chain(head, T(4, -16, 0)), [17, 12, 16], 1, 1, () => C_GREEN_L));

    // spiky crest along the top of the head, and spikes down the nape
    const crestF = chain(head, T(-2, 28, 0), Creature.S(1.3, 1.3, 1));
    prims.push(PL(crestF.t, crestF.L, 5, 5, CREST, 3.4));
    const napeF = chain(body, T(-8, 104, 0), R(M3.rz(0.2)), R(M3.ry(Math.PI)));
    prims.push(PL(napeF.t, napeF.L, 14, 14, NAPE, 2.4));

    /* --- eye turrets (rolling apertures) --- */
    const eyeKind = P.eyes === 'happy' ? 'happy' : P.eyes === 'closed' ? 'closed' : P.eyes === 'blink' ? 'blink' : 'open';
    const up = clamp(+P.eyeUp || 0, -1, 1) * 0.45;
    for (const sd of [1, -1]) {
      const look = clamp(sd > 0 ? +P.eyeL || 0 : +P.eyeR || 0, -1, 1);
      const base = [8, 7, sd * 16];
      // aperture axis: outward and a bit forward, swivelling forward/back with `look`
      const az = 1.0 - look * 0.72;
      const dir = nrm([Math.cos(az), 0.1 + up, sd * Math.sin(az)]);
      const tf = chain(head, T(...base), F(axesAlong(dir, [0, 1, 0]), [0, 0, 0]));
      const id = sd > 0 ? 6 : 7;
      prims.push(ellF(chain(tf, T(4, 0, 0)), [15.5, 15, 15], id, id, eyeMat(eyeKind)));
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(tf, [19.5, 0, 0]);
    }

    /* --- arms: long, reaching forward; three cream claws --- */
    const walkArm = walking ? -Math.cos(step) * 0.25 : 0; // arms swing against the legs
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const sh = inF(body, [12, 88, sd * 18]);
      const swing = sd * walkArm;
      // rest: reaching forward, a little down (world pitch, the lean is undone); raised: up and out
      const a0 = lerp(-0.45 + swing + lean, 1.25, armUp); // upper arm pitch in the body frame
      const spread = lerp(0.22, 0.95, armUp);
      const d1 = M3.v(body.L, nrm([Math.cos(a0) * Math.cos(spread), Math.sin(a0), sd * Math.sin(spread)]));
      const el = add(sh, sc(d1, 22));
      const a1 = a0 + lerp(0.1, 0.2, armUp);
      const d2 = M3.v(body.L, nrm([Math.cos(a1), Math.sin(a1), sd * lerp(-0.05, 0.5, armUp)]));
      const hand = add(el, sc(d2, 21));
      prims.push(seg(sh, el, 5.8, 5.6, [0, 1, 0], id, id, M_GREEN));
      prims.push(seg(el, hand, 5, 4.8, [0, 1, 0], id, id, M_GREEN));
      const hf = F(axesAlong(d2, [0, 1, 0]), hand);
      prims.push(ellF(hf, [6, 4.6, 6.2], id, id, M_GREEN));
      for (const fa of [-0.7, 0, 0.7]) {
        const fd = M3.v(hf.L, nrm([1, -0.25, fa * 0.8]));
        const f0 = add(hand, sc(fd, 4.5));
        prims.push(seg(f0, add(f0, sc(fd, 4.5)), 2.1, 2.1, [0, 1, 0], id, id, M_GREEN));
        prims.push(seg(add(f0, sc(fd, 4)), add(f0, sc(fd, 8.5)), 1.7, 1.7, [0, 1, 0], id, id, M_CLAW));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hand, sc(d2, 8));
    }

    /* --- legs: short thighs, feet with three clawed toes --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11;
      const ph = step + (sd > 0 ? 0 : Math.PI);
      // foot moves forward (and lifts) while sin(ph) > 0, planted and sliding back otherwise
      const fwdOff = walking ? -Math.cos(ph) * 13 : 0;
      const lift = walking ? Math.max(0, Math.sin(ph)) * 7 : 0;
      const swing = walking ? Math.sin(ph) * 0.3 : 0;
      const hip = inF(body, [0, 34, sd * 15]);
      const foot = [8 + fwdOff, 6 + lift, sd * 18];
      const knee = add(sc(add(hip, foot), 0.5), [6, 1, sd * 2]);
      prims.push(seg(hip, knee, 10.5, 11, [0, 0, 1], id, id, M_GREEN, 1.3));
      prims.push(seg(sub(knee, [0, -2, 0]), add(foot, [0, 2, 0]), 8, 8.5, [0, 0, 1], id, id, M_GREEN, 1.2));
      const ff = F(M3.rz(swing * 0.4), foot);
      prims.push(ellF(chain(ff, T(4, -0.5, 0)), [12.5, 6, 9], id, id, M_GREEN));
      for (const ta of [-0.5, 0, 0.5]) {
        const td = M3.v(ff.L, nrm([1, -0.08, ta]));
        const t0 = add(inF(ff, [11, -1.5, 0]), sc(td, 1));
        prims.push(seg(t0, add(t0, sc(td, 5)), 3, 3.2, [0, 1, 0], id, id, M_GREEN));
        prims.push(seg(add(t0, sc(td, 4.5)), add(t0, sc(td, 8.5)), 2, 2.2, [0, 1, 0], id, id, M_CLAW));
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = foot;
    }

    /* --- tail: long tapering spiral behind --- */
    const tp = tailPath(clamp(+P.tail, 0, 1), walking ? Math.sin(step) : 0);
    const n = tp.length;
    // (the tail hangs from the hips, so it only takes part of the body lean)
    const tailF = chain(T(0, bobY, 0), T(-10, 34, 0), R(M3.rz(-lean * 0.3)), T(10, -34, 0));
    let tcx = 0, tcy = 0;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const r = lerp(12, 3.2, Math.pow(t, 0.85));
      const a = inF(tailF, tp[Math.max(0, i - 1)]), b = inF(tailF, tp[Math.min(n - 1, i + 1)]);
      const half = i === n - 1 ? 4 : 10;
      prims.push(E(inF(tailF, tp[i]), M3.mul(axesAlong(sub(b, a), [0, 1, 0]), M3.diag(half, r, r * 1.05)), 12, 12, M_GREEN));
      if (i > n * 0.6) { tcx += tp[i][0]; tcy += tp[i][1]; }
    }
    const nc = n - 1 - Math.floor(n * 0.6);
    anchors.tail = inF(tailF, [tcx / nc, tcy / nc, 0]);

    /* --- tongue: shoots straight forward from the mouth --- */
    const mouthP = inF(head, [46, -13 - mo * 4, 0]);
    anchors.mouth = mouthP;
    if (tg > 0.01) {
      // smooth pink tube: long overlapping ellipsoids centred on nodes along a slight droop
      const L = tg * 168;
      const nseg = Math.max(3, Math.ceil(L / 7));
      const aim = clamp(+P.tongueAim || 0, -1, 1) * 0.5, ca = Math.cos(aim), sa = Math.sin(aim);
      const node = (t) => {
        const u = L * t - 6 * (1 - t), w = -Math.sin(Math.PI * t) * 4 * tg - 1.5 * t; // along / sag
        return add(mouthP, [u * ca - w * sa, u * sa + w * ca, 0]);
      };
      const half = Math.max(5, (L / nseg) * 1.9);
      for (let i = 0; i <= nseg; i++) {
        const t = i / nseg;
        const p = node(t), d = sub(node(Math.min(1, t + 0.02)), node(Math.max(0, t - 0.02)));
        const r = lerp(3.8, 3.1, t);
        prims.push(E(p, M3.mul(axesAlong(d, [0, 1, 0]), M3.diag(Math.min(half, 4 + L * t), r, r * 1.12)), 13, 13, M_TONGUE));
      }
      const tipR = lerp(5, 8, Math.min(1, tg * 3));
      const end = node(1);
      prims.push(E(add(end, [tipR * 0.5 * ca, tipR * 0.5 * sa, 0]), M3.diag(tipR * 1.1, tipR, tipR), 13, 13, M_TONGUE));
      anchors.tongueTip = add(end, [tipR * 1.6 * ca, tipR * 1.6 * sa, 0]);
    } else anchors.tongueTip = mouthP;

    anchors.top = inF(crestF, [3, 30, 0]);
    anchors.head = inF(head, [4, 0, 0]);
    anchors.body = inF(body, [4, 66, 0]);
    anchors.belly = inF(body, [BELLY_C[0] + BELLY_R[0], BAND_Y, 0]);

    return {
      prims, anchors, pose: P, stamps: [], dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 4: 1, 5: 2, 6: 3, 7: 3, 8: 2, 9: 2, 10: 1, 11: 1, 12: 0, 13: 4, 14: 0 },
      glossy: GLOSSY, baseMat: GREEN, shadowSteps: 16,
    };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 470, bh: 290, oy: 0.9 } };
})();
