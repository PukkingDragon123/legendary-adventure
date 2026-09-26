/* ------------------------------------------------------------------
   Kecleon — the Color Swap Pokémon (1.0 m ≈ 175 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (= Kecleon's
   left side), ground at y = 0.

   Build: green chameleon standing upright on short thick legs; cream
   throat and belly crossed by a red zig-zag band that runs all the way
   round the body; big head with a hinged lower jaw, a scalloped frill
   crest along the top, and two big eye turrets whose apertures (yellow
   rim, pale-yellow eye, black slit pupil) roll independently; short arms
   with three-clawed hands; a long tail rolled up in a spiral behind.
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
     arms    0..1    raise both arms (0 = hanging, 1 = up high)
     eyes    'open' | 'happy' | 'closed' | 'blink'
     lean    -1..1   body lean forward (+) / back (−), default 0
   Anchors: top, head, mouth, tongueTip, eyeN, eyeF, body, belly, tail (spiral
   centre), handN, handF, footN, footF.
------------------------------------------------------------------- */
const Kecleon = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const GREEN = 1, CREAM = 2, RED = 3, EYEY = 4, PUPIL = 5, MOUTH = 6, TONGUE = 7, CLAW = 8;
  const MAT = { GREEN, CREAM, RED, EYEY, PUPIL, MOUTH, TONGUE, CLAW };
  const PAL = Creature.palette({
    [GREEN]:  { r: ['#2c7436', '#459c47', '#66bf58', '#92da78', '#c4f0a4'], od: '#17461f', ol: '#2c7334', ln: '#2a6c33' },
    [CREAM]:  { r: ['#c2a868', '#dfca88', '#f5e6ae', '#fcf3d0', '#fffbea'], od: '#6a5424', ol: '#9c8444', ln: '#aa9254' },
    [RED]:    { r: ['#921c1e', '#ba2c2c', '#dc4640', '#f26e5e', '#ff9a86'], od: '#560e10', ol: '#86191a', ln: '#861a1a' },
    [EYEY]:   { r: ['#c88e12', '#e8b020', '#f8d240', '#ffe98a', '#fff7c8'], od: '#6a4606', ol: '#9c6c10', ln: '#9a6a10' },
    [PUPIL]:  { r: ['#0e0e12', '#141418', '#1a1a20', '#24242c', '#3a3a46'], od: '#08080a', ol: '#0e0e10', ln: '#0e0e10' },
    [MOUTH]:  { r: ['#5a1422', '#7a1e2e', '#9a2c3c', '#b4404e', '#cc5e68'], od: '#360a14', ol: '#561222', ln: '#561222' },
    [TONGUE]: { r: ['#b84264', '#d65e80', '#ee849e', '#ffaec0', '#ffd4de'], od: '#681430', ol: '#902040', ln: '#a43050' },
    [CLAW]:   { r: ['#b4ab94', '#d4ccb4', '#f0eadb', '#fbf8f0', '#ffffff'], od: '#5a523c', ol: '#877f68', ln: '#948c74' },
  });
  const GLOSSY = { [EYEY]: 1, [PUPIL]: 1, [TONGUE]: 1 };

  const SIZE = 0.93;
  const DEFAULT = { tongue: 0, tongueAim: 0, tail: 0.5, eyeL: 0, eyeR: 0, eyeUp: 0, mouth: 0, step: 0, arms: 0, eyes: 'open', lean: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
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

  const C_GREEN = code(GREEN), C_GREEN_D = code(GREEN, -1), C_CREAM = code(CREAM), C_RED = code(RED);
  const C_EYEY = code(EYEY), C_EYER = code(EYEY, -1), C_PUPIL = code(PUPIL), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_CLAW = code(CLAW);
  const M_GREEN = () => C_GREEN, M_CLAW = () => C_CLAW, M_MOUTH = () => C_MOUTH, M_TONGUE = () => C_TONGUE;

  /* ---------- body layout (body frame: origin on the ground between the feet) ---------- */
  const BELLY_C = [6, 68, 0], BELLY_R = [33, 34, 31];
  const CHEST_C = [3, 102, 0], CHEST_R = [26, 27, 25];
  const HIP_C = [-3, 46, 0], HIP_R = [27, 19, 27];
  const THROAT_C = [12, 118, 0], THROAT_R = [19, 15, 19];
  const BAND_Y = 70, BAND_A = 4.2, BAND_N = 12, BAND_W = 2.7; // zig-zag band: centre height, amplitude, zigs around, half width

  // torso material: cream front, red zig-zag band all the way round, green elsewhere.
  // The torso ellipsoids are axis-aligned in the body frame, so body-space coordinates come straight from s.
  function torsoMat(C, Rr, band, creamK) {
    return (s) => {
      if (band) {
        const y = C[1] + Rr[1] * s[1];
        const az = Math.atan2(Rr[2] * s[2], C[0] + Rr[0] * s[0] - 4);
        const ph = (az / (2 * Math.PI)) * BAND_N;
        const tri = Math.abs(ph - Math.floor(ph + 0.5)) * 4 - 1; // triangle wave -1..1
        if (Math.abs(y - (BAND_Y + BAND_A * tri)) < BAND_W) return C_RED;
      }
      return s[0] > creamK(s[1]) ? C_CREAM : C_GREEN;
    };
  }

  /* ---------- crest: frill lobes along the top of the head (crest frame: u forward, v up) ---------- */
  const CREST = [
    [17, 0.5, -0.9, 5.6, 7.4],
    [8, 4.8, -0.45, 6.4, 9],
    [-3, 7.2, 0.05, 6.8, 10],
    [-14, 6.4, 0.5, 6.6, 9.2],
    [-23, 2.6, 0.95, 5.4, 7],
  ];
  const M_CREST = (s) => (s[1] > 0.55 ? code(GREEN, 1) : C_GREEN);

  /* ---------- eye turret aperture decal (turret frame: x = aperture axis, y = up) ---------- */
  const AP = 0.66; // cos of the aperture's angular radius
  function eyeMat(kind) {
    return (s) => {
      if (s[0] < AP - 0.02) return C_GREEN;
      const px = 1 / (curScale * 13);
      const r = Math.sqrt(s[1] * s[1] + s[2] * s[2]) / Math.sqrt(1 - AP * AP); // 0 centre .. 1 rim
      if (kind === 'closed' || kind === 'happy') {
        // happy: a high arch (^), closed: a sleepy U-shaped lash line
        const yc = kind === 'happy' ? 0.32 - 0.8 * s[2] * s[2] : -0.06 + 0.45 * s[2] * s[2];
        if (r < 0.95 && Math.abs(s[1] - yc) < Math.max(0.07, 1.1 * px)) return C_PUPIL;
        return r > 0.86 ? C_GREEN_D : C_GREEN;
      }
      if (kind === 'blink' && s[1] > -0.05) return s[1] < 0.02 + 1.2 * px ? C_GREEN_D : C_GREEN;
      if (r > 0.8) return C_EYER; // yellow rim
      // slit pupil
      if (Math.abs(s[2]) < Math.max(0.085, 0.9 * px) && Math.abs(s[1]) < 0.44 * Math.sqrt(1 - AP * AP) / 0.75) return C_PUPIL;
      return C_EYEY;
    };
  }

  /* ---------- tail spiral (2D, in the body's x-y plane) ---------- */
  function tailPath(curl, sway) {
    const pts = [];
    let x = -24, y = 44, phi = Math.PI + 0.35; // heading back and a little down
    const L = 150, ds = 5.5;
    const k0 = lerp(0.004, 0.012, curl), k1 = lerp(0.00018, 0.00062, curl);
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
    const lean = clamp(+P.lean || 0, -1, 1) * 0.16;
    // body bob: lowest when both feet are down (phase 0, π), highest mid-swing
    const bobY = walking ? 1.4 - 2.6 * Math.abs(Math.cos(step)) : 0;
    // body frame: lean about the hips, walk bob
    const body = chain(T(0, bobY, 0), T(0, 44, 0), R(M3.rz(-lean)), T(0, -44, 0));

    /* --- torso: belly, chest, hips, throat --- */
    const belly = ellF(chain(body, T(...BELLY_C)), BELLY_R, 1, 1, torsoMat(BELLY_C, BELLY_R, true, (v) => 0.2 - 0.1 * v));
    const chest = ellF(chain(body, T(...CHEST_C)), CHEST_R, 1, 1, torsoMat(CHEST_C, CHEST_R, false, (v) => 0.3 + 0.1 * v));
    const hips = ellF(chain(body, T(...HIP_C)), HIP_R, 1, 1, (s) => (s[0] > 0.35 - 0.2 * s[1] ? C_CREAM : C_GREEN));
    prims.push(belly, chest, hips);

    /* --- head: cranium + snout (upper jaw), hinged lower jaw, mouth interior --- */
    const neck = chain(body, T(8, 118, 0), R(M3.rz(lean * 0.6)));
    const head = chain(neck, T(4, 20, 0));
    const cran = ellF(chain(head, T(0, 3, 0)), [32, 28, 29.5], 2, 2, (s) => (s[1] < -0.55 && s[0] > 0.2 ? C_CREAM : C_GREEN));
    const snout = ellF(chain(head, T(18.5, -5, 0), R(M3.rz(-0.08))), [23.5, 15.5, 21], 2, 2, M_GREEN);
    prims.push(cran, snout);
    const hinge = [-2, -9, 0];
    const jawF = chain(head, T(...hinge), R(M3.rz(-mo * 0.55)));
    const jaw = ellF(chain(jawF, T(20.5, -4.8, 0), R(M3.rz(0.06))), [24.5, 9.6, 20], 3, 3, (s) => (s[1] < -0.2 ? C_CREAM : C_GREEN));
    prims.push(jaw);
    if (mo > 0.03) {
      // mouth interior: a dark wedge filling the gape
      const mid = chain(head, T(...hinge), R(M3.rz(-mo * 0.27)));
      prims.push(ellF(chain(mid, T(19.5, -3, 0)), [21.5, 7 + mo * 3, 17], 4, 4, M_MOUTH));
    }
    prims.push(ellF(chain(body, T(...THROAT_C)), THROAT_R, 1, 1, (s) => (s[0] > 0.1 ? C_CREAM : C_GREEN)));

    // crest (frill) along the top of the head: a row of flattened rounded lobes, tallest mid-back
    const crestF = chain(head, T(-2, 27, 0), R(M3.rz(0.04)));
    for (const [u, v, a, rx, ry] of CREST) prims.push(ellF(chain(crestF, T(u, v, 0), R(M3.rz(a))), [rx, ry, 3.1], 5, 5, M_CREST));

    /* --- eye turrets (rolling apertures) --- */
    const eyeKind = P.eyes === 'happy' ? 'happy' : P.eyes === 'closed' ? 'closed' : P.eyes === 'blink' ? 'blink' : 'open';
    const up = clamp(+P.eyeUp || 0, -1, 1) * 0.45;
    for (const sd of [1, -1]) {
      const look = clamp(sd > 0 ? +P.eyeL || 0 : +P.eyeR || 0, -1, 1);
      const base = [9.5, 9, sd * 20.5];
      // aperture axis: outward and a bit forward, swivelling forward/back with `look`
      const az = 0.95 - look * 0.72;
      const dir = nrm([Math.cos(az), 0.16 + up, sd * Math.sin(az)]);
      const tf = chain(head, T(...base), F(axesAlong(dir, [0, 1, 0]), [0, 0, 0]));
      const id = sd > 0 ? 6 : 7;
      const tur = ellF(chain(tf, T(3.8, 0, 0)), [14, 13.2, 13.2], id, id, eyeMat(eyeKind));
      prims.push(tur);
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(tf, [17.8, 0, 0]);
    }

    /* --- arms: shoulder → elbow → hand, three claws --- */
    const walkArm = walking ? -Math.cos(step) * 0.3 : 0; // arms swing against the legs
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const sh = inF(body, [6, 106, sd * 23]);
      const swing = sd * walkArm;
      // rest: hanging down-forward; raised: up and out
      const a0 = lerp(-1.05 + swing, 1.2, armUp); // upper arm pitch (0 = forward horizontal)
      const spread = lerp(0.28, 1.0, armUp);
      const d1 = nrm([Math.cos(a0) * Math.cos(spread), Math.sin(a0), sd * Math.sin(spread)]);
      const el = add(sh, sc(d1, 20));
      const a1 = a0 + lerp(0.75, 0.25, armUp);
      const d2 = nrm([Math.cos(a1) * Math.cos(spread * armUp * 0.8), Math.sin(a1), sd * lerp(0.1, 0.55, armUp)]);
      const hand = add(el, sc(d2, 17));
      prims.push(seg(sh, el, 6.2, 6, [0, 0, 1], id, id, M_GREEN));
      prims.push(seg(el, hand, 5.2, 5, [0, 0, 1], id, id, M_GREEN));
      const hf = F(axesAlong(d2, [0, 0, sd]), hand);
      prims.push(ellF(hf, [6.8, 5.6, 6], id, id, M_GREEN));
      for (const fa of [-0.6, 0, 0.6]) {
        const fd = M3.v(hf.L, nrm([1, fa * 0.9, 0.25 * sd]));
        const f0 = add(hand, sc(fd, 5));
        prims.push(seg(f0, add(f0, sc(fd, 6)), 2.2, 2.2, [0, 0, 1], id, id, M_GREEN));
        prims.push(seg(add(f0, sc(fd, 5)), add(f0, sc(fd, 9)), 1.6, 1.6, [0, 0, 1], id, id, M_CLAW));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hand, sc(d2, 8));
    }

    /* --- legs: short thick thighs, feet with three clawed toes --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11;
      const ph = step + (sd > 0 ? 0 : Math.PI);
      // foot moves forward (and lifts) while sin(ph) > 0, planted and sliding back otherwise
      const fwdOff = walking ? -Math.cos(ph) * 14 : 0;
      const lift = walking ? Math.max(0, Math.sin(ph)) * 7 : 0;
      const swing = walking ? Math.sin(ph) * 0.3 : 0;
      const hip = inF(body, [0, 42, sd * 17]);
      const foot = [10 + fwdOff, 6.5 + lift, sd * 21];
      const knee = add(sc(add(hip, foot), 0.5), [4, 1, sd * 2]);
      prims.push(seg(hip, knee, 12.5, 13, [0, 0, 1], id, id, M_GREEN, 1.35));
      prims.push(seg(sub(knee, [0, -3, 0]), add(foot, [0, 2, 0]), 10.5, 11, [0, 0, 1], id, id, M_GREEN, 1.2));
      const ff = F(M3.rz(swing * 0.4), foot);
      prims.push(ellF(chain(ff, T(4, -0.5, 0)), [14, 7, 10.5], id, id, M_GREEN));
      for (const ta of [-0.5, 0, 0.5]) {
        const td = M3.v(ff.L, nrm([1, -0.08, ta]));
        const t0 = add(inF(ff, [12, -1.5, 0]), sc(td, 1));
        prims.push(seg(t0, add(t0, sc(td, 6)), 3.4, 3.6, [0, 1, 0], id, id, M_GREEN));
        prims.push(seg(add(t0, sc(td, 5)), add(t0, sc(td, 9.5)), 2.2, 2.4, [0, 1, 0], id, id, M_CLAW));
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = foot;
    }

    /* --- tail: tapering spiral behind --- */
    const tp = tailPath(clamp(+P.tail, 0, 1), walking ? Math.sin(step) : 0);
    const n = tp.length;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const r = lerp(11.5, 3.4, t);
      const a = inF(body, tp[Math.max(0, i - 1)]), b = inF(body, tp[Math.min(n - 1, i + 1)]);
      const half = i === n - 1 ? 4 : 11;
      prims.push(E(inF(body, tp[i]), M3.mul(axesAlong(sub(b, a), [0, 1, 0]), M3.diag(half, r, r * 1.05)), 12, 12, M_GREEN));
    }
    anchors.tail = inF(body, tp[Math.floor(n * 0.8)]);

    /* --- tongue: shoots straight forward from the mouth --- */
    const mouthP = inF(head, [39, -9 - mo * 4, 0]);
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

    anchors.top = inF(crestF, [-3, 17, 0]);
    anchors.head = inF(head, [4, 0, 0]);
    anchors.body = inF(body, [4, 80, 0]);
    anchors.belly = inF(body, [BELLY_C[0] + BELLY_R[0], BAND_Y, 0]);

    // uniform scale to the Pokédex height (1.0 m ≈ 175 units at yaw 1.1)
    for (const p of prims) { p.c = sc(p.c, SIZE); p.L = p.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);

    return {
      prims, anchors, pose: P, stamps: [], dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 4: 1, 5: 2, 6: 3, 7: 3, 8: 2, 9: 2, 10: 1, 11: 1, 12: 0, 13: 4 },
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 470, bh: 280, oy: 0.9 } };
})();
