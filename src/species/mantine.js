/* ------------------------------------------------------------------
   Mantine — the Kite Pokémon (2.1 m ≈ 367 px wingspan at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is the bottom of the belly in the rest pose (it "rests" on the
   water line / sea floor); pitch and bank pivot about the body centre.

   Build: a chubby lilac-white head/belly dome under a navy cap, two
   manta wings (each three flattened ellipsoids hinged along the span:
   their rims trace the swept leading edge, the concave trailing edge is
   carved; the navy top wraps under the leading edge as a zig-zag band),
   two rabbit-ear cephalic fins, a thin pale-blue whip tail ending in a
   flat blade. Eye stamps, 1-px smile / fang / gill-slit decals (culled
   when facing away), open-mouth decal with fangs and tongue.

   Pose parameters (all optional):
     flap   -1..1   wings down (-1) .. up (+1); the tips bend more than the roots
     bank   -1..1   roll about the body axis; +1 dips the near (+z) wing
     pitch  -1..1   nose down (-1) .. nose up (+1) (±0.9 rad; breaching / diving)
     tail   -1..1   whip tail sways toward -z (-1) .. +z (+1), curling more toward the tip
     mouth   0..1   closed smile .. wide open (dark mouth, fangs, tongue)
     eyes   'open' | 'happy' | 'closed' | 'blink'
     fins    0..1   cephalic fins drooped back (0) .. raised straight up (1); default 0.7
   Anchors: top, head, mouth, eyeN, eyeF, body, back (rider seat), belly,
            wingTipN, wingTipF, finN, finF, tail (blade tip).
------------------------------------------------------------------- */
const Mantine = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BACK = 1, BELLY = 2, BAND = 3, TAIL = 4, TIP = 5, MOUTH = 6, TONGUE = 7;
  const MAT = { BACK, BELLY, BAND, TAIL, TIP, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [BACK]:   { r: ['#172a50', '#213b6a', '#2e4c84', '#40649e', '#6488c2'], od: '#0c1734', ol: '#1d3464', ln: '#182c56' },
    [BAND]:   { r: ['#1c3260', '#27457a', '#355894', '#4a70ae', '#7094cc'], od: '#0c1734', ol: '#20386a', ln: '#1d325e' },
    [BELLY]:  { r: ['#9a8fbf', '#c0b6db', '#e2daf0', '#f2eef9', '#ffffff'], od: '#3e3470', ol: '#7a70ac', ln: '#6a5f9c' },
    [TAIL]:   { r: ['#7598cc', '#9dbbe4', '#c2daf4', '#dfedfc', '#f6fbff'], od: '#2f4f88', ol: '#6689bf', ln: '#6a8cc4' },
    [TIP]:    { r: ['#5a7ebc', '#7ea2d8', '#a4c4ee', '#c8dcf8', '#eaf3ff'], od: '#223f78', ol: '#4c70aa', ln: '#4d6fac' },
    [MOUTH]:  { r: ['#4a1228', '#661c36', '#842a46', '#a23e5a', '#be5874'], od: '#2c0616', ol: '#4a1228', ln: '#4a1228' },
    [TONGUE]: { r: ['#b24a68', '#cc6682', '#e6879e', '#f6a8ba', '#ffcad6'], od: '#5e1430', ol: '#8a2848', ln: '#9a3654' },
  });
  const GLOSSY = {};
  const C_BACK = code(BACK), C_BELLY = code(BELLY), C_BAND = code(BAND), C_TAIL = code(TAIL), C_TIP = code(TIP);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE);
  const M_BACK = () => C_BACK, M_TAIL = () => C_TAIL;

  const DEFAULT = { flap: 0, bank: 0, pitch: 0, tail: 0, mouth: 0, eyes: 'open', fins: 0.7, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const MIRZ = M3.diag(1, 1, -1);
  const mirror = (f) => F(M3.mul(MIRZ, f.L), M3.v(MIRZ, f.t)); // mirror a local frame across z = 0
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 -> p1 along its local x axis (y ≈ `up`), overlapping its ends by `over`
  function segX(p0, p1, ry, rz, up, part, grp, mat, over = 1) {
    const d = sub(p1, p0), l = Math.hypot(d[0], d[1], d[2]);
    const X = sc(d, 1 / l);
    const Z = nrm(cross(X, up));
    const Y = cross(Z, X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(l / 2 + over, ry, rz)), part, grp, mat);
  }

  /* ---------- body ---------- */
  const BODY_Y = 40;                 // body centre height (rest pose); belly bottom at y = 0
  const BODY_R = [62, 40, 58];       // head / belly dome
  const REAR_C = [-40, -5, 0], REAR_R = [54, 29, 42];
  const YH = 10;                     // wing-root height above the body centre
  // navy cap boundary on the dome (unit-sphere v as a function of azimuth): an arch over the face,
  // dropping below the wing roots on the flanks (so a lowered wing never uncovers a lilac band)
  const WING_V = YH / BODY_R[1];
  const capV = (az) => {
    const t = clamp((Math.abs(az) - 0.75) / 0.6, 0, 1);
    return Math.max(WING_V - 0.36 * t * t * (3 - 2 * t), 0.52 - 0.5 * az * az);
  };

  /* ---------- wing planform (x forward, z outward; body-centre coordinates, near wing) ---------- */
  const LE = [[44, 30], [36, 55], [22, 85], [4, 115], [-16, 142], [-38, 164], [-58, 178], [-72, 186]];
  const TE = [[-72, 186], [-70, 174], [-64, 158], [-62, 140], [-64, 118], [-70, 96], [-78, 74], [-86, 58], [-90, 44], [-88, 32], [-80, 20], [-70, 10]];
  // leading-edge x as a function of z (the polyline is monotone in z)
  function edgeFn(ctrl) {
    const pl = Shape2D.catmull(ctrl, false, 12).sort((a, b) => a[1] - b[1]);
    return (z) => {
      if (z <= pl[0][1]) return pl[0][0];
      for (let i = 0; i < pl.length - 1; i++) {
        const a = pl[i], b = pl[i + 1];
        if (z <= b[1]) return lerp(a[0], b[0], (z - a[1]) / (b[1] - a[1] || 1));
      }
      return pl[pl.length - 1][0];
    };
  }
  const leX = edgeFn(LE);
  // zig-zag band: the navy top wraps under the leading edge; teeth point back toward the trailing edge
  const BAND_W = 4, BAND_A = 15, BAND_P = 27, BAND_Z0 = 50;
  function bandDepth(z) {
    if (z < BAND_Z0 - 8) return 0;
    const ph = (z - BAND_Z0) / BAND_P;
    const tri = 1 - Math.abs((ph - Math.floor(ph)) * 2 - 1); // 0 at the valleys, 1 at the tooth tips
    return (BAND_W + BAND_A * tri) * (1 - 0.4 * clamp((z - 120) / 60, 0, 1));
  }

  // carve grid for the planform (0.5-unit cells): 1 = inside the wing
  const PLAN = Shape2D.catmull([...LE, ...TE.slice(1), [44, 10]], true, 10);
  const G_RES = 0.5, G_X0 = -112, G_Z0 = 0, G_W = Math.ceil((62 - G_X0) / G_RES), G_H = Math.ceil((196 - G_Z0) / G_RES);
  const GRID = new Uint8Array(G_W * G_H);
  (() => {
    const n = PLAN.length;
    for (let r = 0; r < G_H; r++) {
      const z = G_Z0 + (r + 0.5) * G_RES;
      const xs = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = PLAN[i], b = PLAN[j];
        if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - G_X0) / G_RES - 0.5)), c1 = Math.min(G_W - 1, Math.floor((xs[k + 1] - G_X0) / G_RES - 0.5));
        for (let c = c0; c <= c1; c++) GRID[r * G_W + c] = 1;
      }
    }
  })();
  const inPlan = (x, z) => {
    const c = Math.floor((x - G_X0) / G_RES), r = Math.floor((z - G_Z0) / G_RES);
    return c >= 0 && r >= 0 && c < G_W && r < G_H && GRID[r * G_W + c] === 1;
  };
  const under = (x, z) => (leX(z) - x < bandDepth(z) ? C_BAND : C_BELLY);

  /* Each wing has three spanwise sections hinged at HZ (the span bends at the hinges when flapping).
     A section = a thick "core" ellipsoid whose rim traces the rounded leading edge (fitted, inscribed
     in the planform) + a thin "membrane" ellipsoid carved to the exact planform (concave trailing
     edge, pointed tip). Ellipses: centre (cx, cz) in planform coordinates, chord axis turned by psi,
     radii Rw (chord), Ry (half thickness), Ru (span). */
  const HZ = [34, 100, 148];
  const ZLIM = [[16, 101.5], [98.5, 149.5], [146.5, 999]];
  const CORES = [
    { cx: -0.3, cz: 57.33, psi: 0.43, Rw: 32.44, Ry: 10.5, Ru: 95 },
    { cx: -7.2, cz: 105.19, psi: 0.58, Rw: 14.83, Ry: 7.4, Ru: 70 },
    { cx: -42.28, cz: 160.14, psi: 0.88, Rw: 5.62, Ry: 4, Ru: 34.95 },
  ];
  const MEMBS = [
    { cx: -28.5, cz: 58.5, psi: 0, Rw: 123.13, Ry: 2.6, Ru: 65.49 },
    { cx: -31.23, cz: 112.96, psi: 0.96, Rw: 40.08, Ry: 1.9, Ru: 52.74 },
    { cx: -52.46, cz: 156.35, psi: 0.92, Rw: 17.55, Ry: 1.5, Ru: 48.75 },
  ];
  function wingEll(e, k, carve) {
    const c = Math.cos(e.psi), s = Math.sin(e.psi);
    e.hz = HZ[k];
    e.L = M3.mul(M3.ry(-e.psi), M3.diag(e.Rw, e.Ry, e.Ru));
    const ax = c * e.Rw, au = -s * e.Ru, bx = s * e.Rw, bu = c * e.Ru;
    const [z0, z1] = ZLIM[k];
    e.mat = (sv) => {
      const x = e.cx + ax * sv[0] + au * sv[2];
      const z = e.cz + bx * sv[0] + bu * sv[2];
      if (z < z0 || z > z1 || (carve && !inPlan(x, z))) return 0;
      return sv[1] >= 0 ? C_BACK : under(x, z);
    };
    return e;
  }
  CORES.forEach((e, k) => wingEll(e, k, false));
  MEMBS.forEach((e, k) => wingEll(e, k, true));
  // end caps: thin discs closing each core's outboard cut face (where the next, thinner section
  // would otherwise let you look into the hollow end of the thicker one)
  const CAPS = CORES.slice(0, 2).map((e, k) => {
    const z0 = ZLIM[k][1], c = Math.cos(e.psi), sn = Math.sin(e.psi);
    let x0 = Infinity, x1 = -Infinity, rmin = 1;
    for (let x = -120; x <= 80; x += 0.25) {
      const dx = x - e.cx, dz = z0 - e.cz;
      const w = dx * c + dz * sn, u = -dx * sn + dz * c; // chord / span coordinates
      const r = Math.hypot(w / e.Rw, u / e.Ru);
      if (r < 1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); rmin = Math.min(rmin, r); }
    }
    const cap = { k, x: (x0 + x1) / 2, z: z0 - 0.6, a: (x1 - x0) / 2, b: e.Ry * Math.sqrt(1 - rmin * rmin) };
    cap.mat = (sv) => (sv[1] >= 0 ? C_BACK : under(cap.x + cap.a * sv[0], z0));
    return cap;
  });

  /* ---------- tail ---------- */
  const TAIL_BEND = [0.2, 0.08, 0.0, -0.05, -0.07, -0.06, -0.02, 0.02, 0.05, 0.06, 0.04, 0.02];
  const TAIL_N = TAIL_BEND.length, TAIL_L = 12.5, TAIL_R0 = 4.6, TAIL_R1 = 2.2;
  const BLADE_R = [27, 2.2, 9];

  /* ---------- face decals (body unit sphere) ---------- */
  const EYE_AZ = 0.4, EYE_V = 0.3;
  const MOUTH_V = -0.06, MOUTH_AZ = 0.23;
  const smileV = (az) => MOUTH_V - 0.1 * (1 - (az / MOUTH_AZ) ** 2);
  const sphP = (az, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); return [c * Math.cos(az), v, c * Math.sin(az)]; };
  const lineOn = (fn, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(sphP(a, fn(a))); } return pts; };
  const SMILE = lineOn(smileV, -MOUTH_AZ, MOUTH_AZ, 12);
  const FANG_AZ = 0.1, FANG_W = 0.03;
  const FANGS = [1, -1].map((sd) => {
    const a = sd * FANG_AZ;
    return [sphP(a - sd * FANG_W, smileV(a - sd * FANG_W)), sphP(a, smileV(a) - 0.065), sphP(a + sd * FANG_W, smileV(a + sd * FANG_W))];
  });
  const GILLS = [];
  for (const sd of [1, -1]) for (const k of [0, 1]) {
    const a = sd * (0.6 + k * 0.1), v = -0.2 - k * 0.05;
    GILLS.push([sphP(a - sd * 0.05, v + 0.06), sphP(a, v), sphP(a + sd * 0.05, v - 0.06)]);
  }

  // contour-line priorities per group
  const PRI = {};
  for (let i = 1; i < 16; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 0, 8: 2, 9: 2, 10: 0 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const flap = clamp(P.flap, -1, 1), bank = clamp(P.bank, -1, 1), pitch = clamp(P.pitch, -1, 1);
    const tailS = clamp(P.tail, -1, 1), mo = clamp(P.mouth, 0, 1), fins = clamp(P.fins, 0, 1);

    const body = chain(T(0, BODY_Y, 0), R(M3.rz(pitch * 0.9)), R(M3.rx(bank * 0.6)));

    /* --- head / belly dome with the face */
    const hMouth = mo * 0.2;
    const bodyMat = (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1], a = Math.abs(az);
      if (v > capV(az)) return C_BACK;
      if (hMouth > 0.01 && a < MOUTH_AZ + 0.02) {
        const k = Math.max(0, 1 - (az / (MOUTH_AZ + 0.02)) ** 2);
        const top = smileV(clamp(az, -MOUTH_AZ, MOUTH_AZ)) + 0.015;
        const bot = top - (hMouth + 0.02) * Math.sqrt(k);
        if (v <= top && v > bot) {
          if (Math.abs(a - FANG_AZ) < FANG_W && v > top - 0.06 - 0.02 * mo) return C_BELLY; // fangs
          return v < bot + (top - bot) * 0.4 && a < MOUTH_AZ * 0.7 ? C_TONGUE : C_MOUTH;
        }
      }
      return C_BELLY;
    };
    const bodyPrim = ellF(body, BODY_R, 1, 1, bodyMat);
    const decals = []; // 1-px face lines, culled per view in render()
    if (mo < 0.12) {
      decals.push({ pts: SMILE, mat: BACK, tone: 0 });
      for (const f of FANGS) decals.push({ pts: f, mat: BACK, tone: 0 });
    }
    for (const g of GILLS) decals.push({ pts: g, mat: BELLY, useLn: true });
    prims.push(bodyPrim);

    /* --- rear body tapering into the tail */
    const rearF = chain(body, T(...REAR_C));
    const rearV = (YH - 14 - REAR_C[1]) / REAR_R[1];
    prims.push(ellF(rearF, REAR_R, 2, 1, (s) => (s[1] > rearV - 0.3 * Math.max(0, -s[0]) ? C_BACK : C_BELLY)));

    /* --- wings (near side built, far side mirrored); rest pose: roots droop a little, tips curl up */
    // each section's span axis is turned up by th[k] while its thickness stays vertical, so
    // neighbouring sections meet on the same vertical cut plane (no gaps at the hinges)
    const th = [-0.08 + flap * 0.3, 0.06 + flap * 0.5, 0.26 + flap * 0.6];
    const secs = [];
    let hy = YH, hz = HZ[0];
    for (let k = 0; k < 3; k++) {
      const c = Math.cos(th[k]), sn = Math.sin(th[k]);
      secs.push(F([1, 0, 0, 0, 1, sn, 0, 0, c], [0, hy, hz]));
      if (k < 2) { hy += sn * (HZ[k + 1] - HZ[k]); hz += c * (HZ[k + 1] - HZ[k]); }
    }
    const tips = [], wingPrims = [];
    for (const side of [1, -1]) {
      let tipP = inF(secs[2], [-72, 0, 186 - HZ[2]]);
      const hw = secs.map((f) => chain(body, side < 0 ? mirror(f) : f));
      if (side < 0) tipP = [tipP[0], tipP[1], -tipP[2]];
      // contour groups are assigned per view in render()
      const pid = side > 0 ? 20 : 30;
      for (let k = 0; k < 3; k++) {
        for (const [e, o] of [[CORES[k], 0], [MEMBS[k], 3]]) {
          const w = E(inF(hw[k], [e.cx, 0, e.cz - e.hz]), M3.mul(hw[k].L, e.L), pid + k + o, 1, e.mat);
          prims.push(w);
          wingPrims.push(w, side);
        }
      }
      for (const cap of CAPS) {
        const w = E(inF(hw[cap.k], [cap.x, 0, cap.z - HZ[cap.k]]), M3.mul(hw[cap.k].L, M3.diag(cap.a, cap.b, 1.2)), pid + cap.k, 1, cap.mat);
        prims.push(w);
        wingPrims.push(w, side);
      }
      tips.push(inF(body, tipP));
    }

    /* --- cephalic fins ("antennae"): long flattened rabbit ears, widening to rounded paddle ends */
    const finTips = [];
    const fwd = M3.v(body.L, [1, 0, 0]);
    for (const side of [1, -1]) {
      const s0 = Creature.sph(side * 0.33, 0.8);
      const base = inF(body, [s0[0] * BODY_R[0] * 0.8, s0[1] * BODY_R[1] * 0.8, s0[2] * BODY_R[2] * 0.8]);
      const lean = lerp(1.25, 0.08, fins), out = lerp(0.5, 0.16, fins);
      const dir = (l, o) => nrm(M3.v(body.L, [-Math.sin(l), Math.cos(l), side * o]));
      const d1 = dir(lean, out), d2 = dir(lean + lerp(0.45, 0.28, fins), out * 1.5);
      const p1 = add(base, sc(d1, 30)), p2 = add(p1, sc(d2, 30));
      const id = side > 0 ? 8 : 9;
      prims.push(segX(base, p1, 4.6, 5.6, fwd, id, id, M_BACK, 7));
      prims.push(segX(sub(p1, sc(d2, 6)), p2, 5.6, 8.2, fwd, id, id, (s) => (s[0] > 0.62 ? C_TIP : C_BACK), 2));
      finTips.push(add(p2, sc(d2, 2)));
    }

    /* --- whip tail (pale blue, gently waving) with a flat blade at the end */
    let tf = chain(body, T(-78, -17, 0));
    let prev = tf.t;
    for (let k = 0; k < TAIL_N; k++) {
      const u = k / (TAIL_N - 1);
      tf = chain(tf, R(M3.ry(tailS * (0.03 + 0.07 * u))), R(M3.rz(TAIL_BEND[k])));
      const nxt = inF(tf, [-TAIL_L, 0, 0]);
      const r = lerp(TAIL_R0, TAIL_R1, Math.sqrt(u));
      prims.push(segX(prev, nxt, r, r, M3.v(tf.L, [0, 1, 0]), 10, 10, M_TAIL, TAIL_L * 0.55));
      tf = chain(tf, T(-TAIL_L, 0, 0));
      prev = nxt;
    }
    const blade = chain(tf, R(M3.ry(tailS * 0.25)), R(M3.rz(0.06)), R(M3.rx(0.3)), T(-BLADE_R[0] + 6, 0, 0));
    prims.push(ellF(blade, BLADE_R, 10, 10, (s) => (s[0] < -0.2 ? C_TIP : C_TAIL)));

    /* --- eyes */
    const eyeKind = P.eyes === 'closed' ? 'blink' : P.eyes === 'happy' || P.eyes === 'blink' ? P.eyes : 'open';
    for (const side of [1, -1]) {
      const s = Creature.sph(side * EYE_AZ, EYE_V);
      const at = { prim: bodyPrim, p: inF(body, [s[0] * BODY_R[0], s[1] * BODY_R[1], s[2] * BODY_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.62, far: 0.34 });
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    Object.assign(anchors, {
      top: finTips[0][1] > finTips[1][1] ? finTips[0] : finTips[1],
      head: inF(body, [34, 12, 0]),
      mouth: inF(body, [BODY_R[0] * 0.98, smileV(0) * BODY_R[1], 0]),
      body: body.t,
      back: inF(body, [-14, BODY_R[1] * 0.93, 0]),
      belly: inF(body, [0, -BODY_R[1], 0]),
      wingTipN: tips[0], wingTipF: tips[1],
      finN: finTips[0], finF: finTips[1],
      tail: inF(blade, [-BLADE_R[0], 0, 0]),
    });
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: BELLY, shadowSteps: 14, shadowDepth: 30, wingPrims, facePrim: bodyPrim, decals };
  }

  /* ---------- eye stamps: k = black, w = glint, b = navy glint (picked by render scale) ---------- */
  const mk = (o, oN, oF, h, hN, hF, b, bN, bF) => ({ open: o, openN: oN, openF: oF, happy: h, happyN: hN, happyF: hF, blink: b, blinkN: bN, blinkF: bF });
  const EYES_S = mk(
    ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'], ['.k.', 'kwk', 'kkk', 'kbk', '.k.'], ['kk', 'wk', 'kk', 'kk'],
    ['.kk.', 'k..k'], ['.k.', 'k.k'], ['.k', 'k.'],
    ['kkkk', '.kk.'], ['kkk', '.k.'], ['kk'],
  );
  const EYES_M = mk(
    ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkbk', '.kkk.'], ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'], ['.k.', 'kwk', 'kkk', 'kbk', '.k.'],
    ['.kkk.', 'k...k', 'k...k'], ['.kk.', 'k..k', 'k..k'], ['.k.', 'k.k'],
    ['k...k', '.kkk.'], ['k..k', '.kk.'], ['kkk'],
  );
  const EYES_L = mk(
    ['..kkk..', '.kwwkk.', 'kwwwkkk', 'kwwkkkk', 'kkkkkkk', 'kkkkbbk', '.kkkbk.', '..kkk..'],
    ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkbk', 'kkkbk', '.kkk.'],
    ['.kk.', 'kwkk', 'kkkk', 'kkkk', 'kkbk', '.kk.'],
    ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], ['.kkk.', 'k...k', 'k...k'], ['.kk.', 'k..k', 'k..k'],
    ['k.....k', '.kkkkk.'], ['k...k', '.kkk.'], ['k..k', '.kk.'],
  );
  const EYEC = { k: '#101a2e', w: '#ffffff', b: '#34508a' };

  // drop tiny detached islands (a sub-pixel wing tip can leave a lone outlined pixel)
  function despeckle(d, depth, part, w, h) {
    const seen = new Uint8Array(w * h), stack = [], comp = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!d[i0] || seen[i0]) continue;
      stack.length = 0; comp.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const x = i % w;
        if (x > 0 && d[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && d[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (i >= w && d[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (i < w * (h - 1) && d[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      if (comp.length < 9) for (const i of comp) { d[i] = 0; depth[i] = -1e9; part[i] = 0; }
    }
  }

  /* ---------- render: cull face lines seen from behind, pick eye size, ray-cast only the sprite box ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.85 ? EYES_L : scale >= 0.42 ? EYES_M : EYES_S;
    for (const st of model.stamps) st.set = set;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    // the wing on the camera side shares the body's contour group (the back flows into it without
    // seams); the other wing gets its own group so it separates cleanly where the body hides it
    const cy = Math.cos(yaw), wp = model.wingPrims || [];
    for (let i = 0; i < wp.length; i += 2) wp[i].grp = Math.abs(cy) < 0.35 || wp[i + 1] * cy > 0 ? 1 : 4;
    if (model.facePrim) {
      const p = model.facePrim;
      const Li = M3.inv(M3.mul(V, p.L));
      p.lines = model.decals.filter((ln) => {
        const q = ln.pts[Math.floor(ln.pts.length / 2)];
        const nz = Li[2] * q[0] + Li[5] * q[1] + Li[8] * q[2];
        const l = Math.hypot(Li[0] * q[0] + Li[3] * q[1] + Li[6] * q[2], Li[1] * q[0] + Li[4] * q[1] + Li[7] * q[2], nz);
        return nz / l > 0.22;
      });
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
      x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    despeckle(r.buf.d, r.depth, r.part, w, h);
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.1, bw: 560, bh: 528, oy: 0.58 } };
})();
