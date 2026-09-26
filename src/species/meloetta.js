/* ------------------------------------------------------------------
   Meloetta — the Melody Pokémon, Aria Forme (0.6 m ≈ 105 units from the
   pointed toes to the tips of the headpiece). A posable 3D model rendered
   straight to pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = its right side (near side at yaw 0).
   Meloetta hovers: the origin (y = 0) sits under its pointed toes.

   Build: big white head with teal eye decals (a shell ellipsoid, outlined
   by the contour pass), the forehead gem, the pale-green hair hood that
   flows into a long wavy staff-shaped tress down its left side (a chain of
   flat ellipsoids with 1-px staff/bar lines and teal note dots), the dark
   treble-clef headpiece on its right side (two lobes + band + curl), dark
   neck/arms with paddle hands, pale-green chest band, dark tapered skirt
   and slender white legs.

   Pose parameters (all optional):
     armN   -1..1   near (right, +z) arm: -1 down by the side, 0 held out, 1 raised high
     armF   -1..1   far (left, -z) arm, same range
     legs    0..1   dance kick: 0 = legs together, toes pointed; 1 = right knee lifted
                    forward with the foot tucked (the classic Meloetta pose)
     hair   -1..1   sway of the long tress (+ swings it outward/forward, - inward/back)
     tilt   -1..1   head/body tilt (+ leans toward its right = the treble-clef side)
     spin   radians pirouette twirl about the vertical axis (the tress flares out)
     flare   0..1   how far the tress flies out (default: automatic from |spin|)
     mouth   0..1   singing: small closed mouth -> round "o"
     eyes   'open' | 'happy' | 'closed' | 'blink'
     form   'aria' (default) | 'pirouette' (orange turban bun, red eyes, flared skirt)
------------------------------------------------------------------- */
const Meloetta = (() => {
  const { chain, T, R, F, sph, code } = Creature;

  // material ids
  const SKIN = 1, DARK = 2, HAIR = 3, NOTE = 4, GEM = 5, IRIS = 6, SHINE = 7, MOUTH = 8, TONGUE = 9, LID = 10;
  const HAIRP = 11, IRISP = 12, GEMP = 13;
  const MAT = { SKIN, DARK, HAIR, NOTE, GEM, IRIS, SHINE, MOUTH, TONGUE, LID, HAIRP, IRISP, GEMP };

  const PAL = Creature.palette({
    [SKIN]:   { r: ['#a3abc2', '#c9d0e0', '#edf0f7', '#fbfcfe', '#ffffff'], od: '#4b5572', ol: '#7a84a2', ln: '#98a1bb' },
    [DARK]:   { r: ['#3d3534', '#564c4a', '#746966', '#958985', '#b8ada8'], od: '#221b1b', ol: '#3b3231', ln: '#2c2524' },
    [HAIR]:   { r: ['#8cb567', '#aed188', '#cfeaa8', '#e5f7c6', '#f5ffe4'], od: '#44703a', ol: '#6c9a54', ln: '#6a9656' },
    [NOTE]:   { r: ['#2a879c', '#39a5b8', '#58c3d1', '#84dae3', '#bff1f4'], od: '#164f5d', ol: '#2a7888', ln: '#257080' },
    [GEM]:    { r: ['#288a9a', '#3aadbc', '#5fcbd5', '#99e5ea', '#effeff'], od: '#144e58', ol: '#2a7a86', ln: '#1d6874' },
    [IRIS]:   { r: ['#2b8ca2', '#3caabd', '#5bc7d4', '#85dde6', '#bff2f5'], od: '#123d4b', ol: '#1c5868', ln: '#1c4f60' },
    [SHINE]:  { r: ['#e6f6f8', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#1c4f60', ol: '#1c4f60', ln: '#1c4f60' },
    [MOUTH]:  { r: ['#6c1d2f', '#8c2b3f', '#ae4353', '#c65b67', '#da7981'], od: '#3c0b19', ol: '#5c1525', ln: '#581a2a' },
    [TONGUE]: { r: ['#be4d61', '#d66779', '#ea8995', '#f7a7af', '#ffc7cb'], od: '#6c1327', ol: '#8c1f37', ln: '#9e394b' },
    [LID]:    { r: ['#19323e', '#1d3a48', '#214250', '#274a58', '#2d5260'], od: '#0f2129', ol: '#19323e', ln: '#19323e' },
    [HAIRP]:  { r: ['#b8502e', '#d8683e', '#f08a58', '#fbac7c', '#ffd2b0'], od: '#6a2412', ol: '#a2442a', ln: '#a4462a' },
    [IRISP]:  { r: ['#8e1626', '#b4202f', '#d8343e', '#ee5c60', '#ff9a96'], od: '#4a0a14', ol: '#6e1020', ln: '#62101c' },
    [GEMP]:   { r: ['#b44a24', '#d8642e', '#f08448', '#fbb07c', '#fff0e0'], od: '#62200e', ol: '#9a3a1c', ln: '#8a3218' },
  });
  const GLOSSY = { [GEM]: 1, [GEMP]: 1 };

  const DEFAULT = { armN: -0.25, armF: 0.3, legs: 0, hair: 0, tilt: 0, spin: 0, mouth: 0, eyes: 'open', form: 'aria', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add = V3.add, sub = V3.sub, scl = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const P2W = (f, p) => add(f.t, M3.v(f.L, p));
  const V2W = (f, d) => M3.v(f.L, d);
  // rotation whose y axis is d and whose x axis is as close as possible to hint
  function frameY(d, hint) {
    const Y = nrm(d);
    let X = sub(hint, scl(Y, dot(hint, Y)));
    if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    X = nrm(X);
    return M3.cols(X, Y, cross(X, Y));
  }
  // prims as plain literals (same layout everywhere)
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning a -> b (y along the segment, radii rx/rz across, hint = direction of the x radius)
  function segE(a, b, rx, rz, hint, part, grp, mat, ext = 1) {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]);
    return E(scl(add(a, b), 0.5), M3.mul(frameY(d, hint), M3.diag(rx, (len / 2) * ext, rz)), part, grp, mat);
  }
  const ball = (p, r, part, grp, mat) => E(p, M3.diag(r, r, r), part, grp, mat);
  // Catmull-Rom point on an open polyline of 3D points, t in [0, n-1]
  function crPt(P, t) {
    const n = P.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), u = t - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return o;
  }

  /* ---------- proportions (rest pose) ---------- */
  const HIP_Y = 41, NECK_Y = 55.5;
  const HR = [15.6, 17.2, 16.4]; // head radii (depth, height, width)
  const HEAD_UP = 19.8; // head centre above the neck pivot
  const C_SKIN = code(SKIN), C_DARK = code(DARK), C_HAIR = code(HAIR), C_HAIRP = code(HAIRP);
  const M_SKIN = () => C_SKIN, M_DARK = () => C_DARK, M_HAIR = () => C_HAIR, M_NOTE = () => code(NOTE);

  /* ---------- head decals (head-local unit sphere, x fwd, y up, z = right side) ---------- */
  const EYE_AZ = 0.43, EYE_V = 0.0;
  const EYES = [1, -1].map((k) => {
    const c = sph(k * EYE_AZ, EYE_V);
    const ty = nrm(sub([0, 1, 0], scl(c, c[1])));
    const tx = cross(ty, c); // points toward -z (screen right when facing the viewer)
    const tl = -0.12 * k; // tops of the eyes lean outward
    return { k, c, tx, ty, ct: Math.cos(tl), st: Math.sin(tl) };
  });
  const EA = 0.27, EB = 0.365; // eye semi-axes (unit-sphere units)
  const MOUTH_V = -0.47;
  let curScale = 1, eyeCull = [1, 1];
  let form = 0; // 0 = aria, 1 = pirouette (set per build/render, read by the decal functions)

  function faceMat(s, eyes, mo) {
    // --- eyes
    const k = s[2] >= 0 ? 0 : 1;
    if (eyeCull[k] > 0.18) {
      const e = EYES[k];
      const dx = s[0] - e.c[0], dy = s[1] - e.c[1], dz = s[2] - e.c[2];
      const ex0 = dx * e.tx[0] + dy * e.tx[1] + dz * e.tx[2];
      const ey0 = dx * e.ty[0] + dy * e.ty[1] + dz * e.ty[2];
      const ex = ex0 * e.ct - ey0 * e.st, ey = ex0 * e.st + ey0 * e.ct;
      const u = ex / EA, v = ey / EB;
      if (u * u + v * v < 1.4) {
        const lw = Math.max(0.06, 1.15 / (curScale * HR[1]));
        if (eyes === 'happy') {
          const yc = 0.1 - 0.75 * u * u;
          if (Math.abs(u) < 0.95 && Math.abs(ey - yc * EB) < lw) return code(LID);
        } else if (eyes === 'closed') {
          const yc = -0.3 + 0.7 * u * u;
          if (Math.abs(u) < 0.95 && Math.abs(ey - yc * EB) < lw) return code(LID);
        } else if (eyes === 'blink') {
          const yc = -0.2 + 0.25 * u * u;
          if (Math.abs(u) < 1.0 && Math.abs(ey - yc * EB) < lw) return code(LID);
        } else if (u * u + v * v < 1) {
          if (form && v > 0.62 - 0.12 * u * e.k) return v > 0.62 - 0.12 * u * e.k + Math.max(0.2, 1.4 / (curScale * HR[1] * EB)) ? 0 : code(LID);
          const I = form ? IRISP : IRIS;
          // shine: upper, toward screen-left (+z = -ex)
          const hx = u + 0.34, hy = v - 0.4;
          if (hx * hx + hy * hy * 0.8 < 0.15) return code(SHINE);
          const gx = u - 0.35, gy = v + 0.52;
          if (curScale >= 0.8 && gx * gx + gy * gy < 0.035) return code(SHINE);
          if (v < -0.42 + 0.25 * u * u || v > 0.55) return code(I, -1);
          return code(I);
        }
      }
    }
    // --- mouth (small round "o")
    if (s[0] > 0.6) {
      const mx = s[2], my = s[1] - MOUTH_V;
      if (mo < 0.08) {
        const px = 1 / (curScale * HR[1]);
        if (Math.abs(my + 0.4 * mx * mx) < Math.max(0.04, 0.8 * px) && Math.abs(mx) < 0.075) return code(MOUTH, -2);
        return 0;
      }
      const ma = 0.06 + 0.05 * mo, mb = 0.045 + 0.1 * mo;
      const r = (mx / ma) ** 2 + (my / mb) ** 2;
      if (r < 1) return mo > 0.45 && my < -mb * 0.35 ? code(TONGUE) : code(MOUTH, my > mb * 0.3 ? -1 : 0);
    }
    return 0;
  }

  // hair hood: covers the top and back of the head and its whole left side (where the tress starts);
  // the white face is framed by an arched hairline over the forehead and straight edges at the sides
  const BAND_PHI = 1.27, BAND_C = Math.cos(BAND_PHI), BAND_S = Math.sin(BAND_PHI);
  const SIDE_L = Math.cos(0.88), SIDE_R = Math.cos(1.4);
  function hoodMat(s) {
    const r = Math.hypot(s[0], s[2]) || 1e-6;
    const v = s[1], c = s[0] / r;
    // treble-clef band down the right side of the head (widens toward the lobes on top)
    if (form) return 0; // Pirouette: the turban covers the top of the head, the face is all white
    if (s[2] > 0 && v > -0.36 && v < 0.97) {
      const bw = 0.15 + 0.12 * clamp((v + 0.2) / 1.1, 0, 1);
      if ((s[0] * BAND_C + s[2] * BAND_S) / r > Math.cos(bw)) return C_DARK;
    }
    const hair = C_HAIR;
    // arched forehead hairline: 0.5 at the centre, dropping toward the temples
    const sn = s[2] / r;
    if (v > 0.52 - 0.95 * (1 - c) + 0.06 * sn) return hair;
    // sides and back behind the face
    if (c < (s[2] < 0 ? SIDE_L : SIDE_R) && v > (s[2] < 0 ? -0.72 : -0.5)) return hair;
    return 0;
  }

  // staff lines over the hood: great circles converging toward the tress on the left side of the head
  // (hood-local unit sphere); clipped to the visible hair at render time
  const HOOD_LINES = (() => {
    const A = nrm([-0.28, -0.3, -0.91]);
    const B = nrm(sub([0.25, 1, 0], scl(A, dot(A, nrm([0.25, 1, 0])))));
    const C = cross(A, B);
    const out = [];
    for (const psi of [-0.3, 0, 0.3]) {
      const d = add(scl(B, Math.cos(psi)), scl(C, Math.sin(psi)));
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = 0.18 + (2.6 * i) / 40;
        pts.push(add(scl(A, Math.cos(t)), scl(d, Math.sin(t))));
      }
      out.push(pts);
    }
    return out;
  })();

  /* ---------- hair tress (rest pose, body space) ---------- */
  // centre line: from inside the hood on the upper left of the head down its left side, S-shaped
  const TRESS = [
    [-6.5, 85, -10],
    [-6.5, 71.5, -18],
    [-5.5, 56.5, -22.5],
    [-4.5, 42, -21.5],
    [-4, 29, -16],
    [-4, 16, -15],
    [-4.2, 3, -20.5],
    [-4.5, -6, -23],
  ];
  const TRESS_W0 = [0.42, 0, 0.91]; // preferred width direction (broad face toward the front, a little left)
  const NOTES = [[0.2, 0.3], [0.33, -0.4], [0.47, 0.22], [0.6, -0.45], [0.74, 0.35], [0.88, -0.2]];
  const BARS = [0.42, 0.7];
  const NSEG = 18;
  const halfW = (u) => lerp(9.2, 6.8, u) * (1 - 0.4 * Math.pow(Math.max(0, u - 0.9) / 0.1, 2));

  /* ---------- Pirouette turban (head-local units): wound hair drum + crown, striped ---------- */
  const TURBAN = [
    { c: [-1.4, 14.2, -2.8], r: [16.6, 10.4, 19.4], rx: -0.24, rz: 0.1, stripes: [-0.45, 0.0, 0.45] },
    { c: [-2.4, 22.4, -8.2], r: [13.2, 8.2, 15.2], rx: -0.4, rz: 0.1, stripes: [0.3] },
  ];
  const KNOB = [7.5, 21, 10.5];

  /* ---------- skirt profile: [y, half-depth, half-width] from the waist down to the point ---------- */
  const SKIRT_PROF = [[45.5, 4.0, 4.6], [41.5, 5.0, 6.0], [36, 5.5, 6.8], [30.5, 5.0, 6.1], [25, 3.8, 4.5], [20, 2.4, 2.7], [16.5, 1.2, 1.3], [14.5, 0.4, 0.4]];
  const SKIRT = (() => {
    const out = [];
    const prof = (y) => {
      for (let i = 0; i < SKIRT_PROF.length - 1; i++) {
        const a = SKIRT_PROF[i], b = SKIRT_PROF[i + 1];
        if (y <= a[0] && y >= b[0]) { const t = (a[0] - y) / (a[0] - b[0]); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
      }
      return [0.5, 0.5];
    };
    for (let y = 44.5; y >= 16; y -= 2.4) {
      const [dx, dz] = prof(y);
      const ry = Math.min(9, Math.max(1.8, (y - 14.2) * 0.9));
      out.push([1.0 + (44 - y) * 0.055, y, dx * 1.03, ry, dz * 1.03]);
    }
    return out;
  })();

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    form = P.form === 'pirouette' ? 1 : 0;
    const tilt = clamp(+P.tilt || 0, -1, 1), spin = +P.spin || 0;
    const legs = clamp(+P.legs || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const hairS = clamp(+P.hair || 0, -1, 1);
    const flare = clamp(P.flare !== undefined ? +P.flare : Math.abs(spin) / 1.2, 0, 1);
    const prims = [];

    // --- frames: spin about the vertical axis, tilt leans the body about the hips
    const root = chain(F(M3.I(), [0, 0, 0]), R(M3.ry(spin)));
    const body = chain(root, T(0, HIP_Y, 0), R(M3.rx(tilt * 0.1)), T(0, -HIP_Y, 0));
    const headF = chain(body, T(0, NECK_Y, 0), R(M3.rx(tilt * 0.2)), R(M3.rz(mo * 0.07)), T(0.4, HEAD_UP, 0));
    const headC = headF.t;

    // --- head + face decal shell + hair hood
    const headPrim = ellF(headF, HR, 1, 1, M_SKIN);
    prims.push(headPrim);
    const eyes = P.eyes;
    prims.push(ellF(headF, V3.scale(HR, 1.018), 2, 2, (s) => faceMat(s, eyes, mo)));
    const hoodF = chain(headF, T(-0.6, 0.6, -0.4));
    const hoodPrim = ellF(hoodF, V3.scale(HR, 1.06), 3, 3, hoodMat);
    if (!form) prims.push(hoodPrim);
    // forehead gem (sits on the hairline)
    const gd = nrm([1, 0.5, 0]);
    const gemF = chain(headF, T(gd[0] * HR[0], gd[1] * HR[1], 0), F(frameY([-gd[1], gd[0], 0], [gd[0], gd[1], 0]), [0, 0, 0]));
    prims.push(ellF(gemF, [1.6, 2.5, 2.1], 4, 4, () => code(form ? GEMP : GEM)));

    // --- treble-clef headpiece
    const onHead = (d, k = 1) => P2W(headF, [d[0] * HR[0] * k, d[1] * HR[1] * k, d[2] * HR[2] * k]);
    const lobeTips = [];
    const lobe = (base, a, r) => {
      const ax = nrm(V2W(headF, a));
      const c = add(base, scl(ax, r[1] * 0.78));
      prims.push(E(c, M3.mul(frameY(ax, V2W(headF, [1, 0, 0])), M3.diag(r[0], r[1], r[2])), 5, 5, M_DARK));
      lobeTips.push(add(c, scl(ax, r[1])));
    };
    let turbanPrims = null;
    if (!form) {
      // Aria: two lobes on top of the right side + a curl by the right cheek
      lobe(onHead(nrm([0.1, 0.8, 0.58]), 0.98), nrm([0.05, 1, 0.66]), [2.1, 8.8, 4.1]);
      lobe(onHead(nrm([-0.12, 0.93, 0.28]), 0.98), nrm([-0.1, 1, 0.02]), [2.1, 8.6, 4.0]);
      const CURL = [[0.3, -0.24, 0.9], [0.28, -0.34, 1.12], [0.24, -0.5, 1.26], [0.2, -0.69, 1.24], [0.18, -0.83, 1.1], [0.18, -0.83, 0.96]];
      const curlPts = CURL.map((q) => P2W(headF, [q[0] * HR[0], q[1] * HR[1], q[2] * HR[2]]));
      for (let i = 0; i < 14; i++) prims.push(ball(crPt(curlPts, (i / 13) * (curlPts.length - 1)), 1.3, 5, 5, M_DARK));
      prims.push(ball(P2W(headF, [0.18 * HR[0], -0.67 * HR[1], 0.98 * HR[2]]), 2.4, 5, 5, M_DARK));
    } else {
      // Pirouette: the hair is wound into a big striped turban; the clef sits on its front-right as a
      // round knob with the two lobes, and a thin stalk curls down to a bead above the right eye
      turbanPrims = [];
      for (const tb of TURBAN) {
        const f = chain(headF, T(...tb.c), R(M3.rx(tb.rx)), R(M3.rz(tb.rz)));
        const pr = ellF(f, tb.r, 15, 15, () => C_HAIRP);
        pr.stripes = tb.stripes;
        prims.push(pr);
        turbanPrims.push(pr);
      }
      const knob = P2W(headF, KNOB);
      prims.push(ball(knob, 4.6, 5, 5, M_DARK));
      lobe(add(knob, V2W(headF, [0, 3.2, 1.2])), nrm([0.05, 1, 0.55]), [1.8, 7.8, 3.1]);
      lobe(add(knob, V2W(headF, [-0.5, 3.6, -1.4])), nrm([-0.05, 1, -0.2]), [1.8, 7.6, 3.0]);
      const STALK = [[KNOB[0] + 3, KNOB[1] - 3.5, KNOB[2] - 0.5], [13.5, 12, 9.5], [15.6, 9.4, 8.6], [16.2, 7.2, 7.4]];
      const stPts = STALK.map((q) => P2W(headF, q));
      for (let i = 0; i < 10; i++) prims.push(ball(crPt(stPts, (i / 9) * (stPts.length - 1)), 0.95, 5, 5, M_DARK));
      prims.push(ball(P2W(headF, [16.0, 6.4, 6.6]), 1.7, 5, 5, M_DARK));
    }

    // --- neck, chest band, skirt
    prims.push(segE(P2W(body, [0, NECK_Y - 3, 0]), P2W(body, [0.3, NECK_Y + 7, 0]), 1.8, 1.8, V2W(body, [1, 0, 0]), 6, 6, M_DARK));
    const chestF = chain(body, T(0.3, 50, 0));
    prims.push(ellF(chestF, [4.3, 4.4, 5.0], 7, 7, () => (form ? C_HAIRP : C_HAIR)));
    if (!form) {
      // skirt: a long dark teardrop hanging in front of the hips, tapering to a point by the knees
      // (a dense stack of overlapping ellipsoids so the shading stays smooth)
      for (let i = 0; i < SKIRT.length; i++) {
        const q = SKIRT[i];
        prims.push(ellF(chain(body, T(q[0], q[1], 0)), [q[2], q[3], q[4]], 8, 8, M_DARK));
      }
    } else {
      // Pirouette: dark waist and a flared tutu of drooping petals with curled-up tips
      prims.push(ellF(chain(body, T(0.4, 43.5, 0)), [4.0, 4.6, 4.4], 8, 8, M_DARK));
      const twirl = 0.5 * flare * Math.sign(spin || 1);
      for (let k = 0; k < 6; k++) {
        const th = (k * Math.PI) / 3 + Math.PI / 6 + twirl;
        const lift = -0.26 + 0.2 * flare;
        const d = V2W(body, nrm([Math.cos(th), lift, Math.sin(th)]));
        const w0 = P2W(body, [0.4, 41.5, 0]);
        const up = V2W(body, [0, 1, 0]);
        const c = add(w0, scl(d, 9.2));
        prims.push(E(c, M3.mul(frameY(d, up), M3.diag(1.8, 9.0, 6.6)), 8, 8, M_DARK));
        const tip0 = add(w0, scl(d, 17.4));
        const d2 = nrm(add(scl(d, 0.55), scl(up, 0.85)));
        prims.push(E(add(tip0, scl(d2, 2.2)), M3.mul(frameY(d2, scl(d, -1)), M3.diag(1.2, 3.2, 2.4)), 8, 8, M_DARK));
      }
    }

    // --- legs: thigh, knee, shin, pointed toe (the right leg lifts for the dance kick)
    const feet = [];
    for (const k of [1, -1]) {
      const kick = k > 0 ? legs : 0;
      const th = lerp(k > 0 ? 0.1 : 0.02, 1.25, kick); // thigh swing forward
      const kn = lerp(k > 0 ? 0.28 : 0.1, 1.95, kick); // knee bend
      const splay = lerp(0.06, 0.2, kick);
      const hip = P2W(body, [-0.8, HIP_Y, k * 2.4]);
      const dT = V2W(body, [Math.sin(th), -Math.cos(th), k * splay]);
      const knee = add(hip, scl(nrm(dT), 19.5));
      const a2 = th - kn;
      const dS = V2W(body, [Math.sin(a2), -Math.cos(a2), k * splay * 0.3]);
      const ankle = add(knee, scl(nrm(dS), 17));
      const toe = add(ankle, scl(nrm(dS), 5.2));
      const pid = k > 0 ? 9 : 10;
      const hint = V2W(body, [0, 0, 1]);
      prims.push(segE(hip, knee, 2.9, 2.9, hint, pid, pid, M_SKIN, 1.08));
      prims.push(ball(knee, 2.15, pid, pid, M_SKIN));
      prims.push(segE(knee, ankle, 2.2, 2.2, hint, pid, pid, M_SKIN, 1.05));
      prims.push(segE(add(ankle, scl(nrm(dS), -1.5)), toe, 1.25, 1.25, hint, pid, pid, M_SKIN));
      feet.push(toe);
    }

    // --- arms: thin dark arms with flat paddle hands
    const hands = [];
    for (const k of [1, -1]) {
      const a = clamp(+(k > 0 ? P.armN : P.armF) || 0, -1, 1);
      const al = a < 0 ? lerp(0.95, 0.2, -a) : lerp(0.95, 2.05, a); // upper arm: angle from straight down
      const al2 = al + (a < 0 ? lerp(0.5, 0.15, -a) : lerp(0.5, 0.42, a)); // forearm bends a little further up
      const sh = P2W(body, [0, 52.5, k * 4.4]);
      const dU = V2W(body, nrm([0.3, -Math.cos(al), k * Math.sin(al)]));
      const elbow = add(sh, scl(nrm(dU), 9.4));
      const dF = V2W(body, nrm([0.5, -Math.cos(al2), k * Math.sin(al2)]));
      const wrist = add(elbow, scl(nrm(dF), 8.6));
      const pid = k > 0 ? 11 : 12;
      const fwd = V2W(body, [1, 0, 0]);
      prims.push(segE(sh, elbow, 1.25, 1.25, fwd, pid, pid, M_DARK, 1.1));
      prims.push(segE(elbow, wrist, 1.15, 1.15, fwd, pid, pid, M_DARK, 1.1));
      const hc = add(wrist, scl(nrm(dF), 4.6));
      prims.push(E(hc, M3.mul(frameY(dF, fwd), M3.diag(1.3, 5.6, 3.3)), pid, pid, M_DARK));
      hands.push(add(wrist, scl(nrm(dF), 6)));
    }

    // --- hair tress (Aria Forme only)
    let hairTip = null, tressPrim = null;
    if (!form) [hairTip, tressPrim] = buildTress(prims, body, headF, hairS, flare, spin);

    const top = lobeTips[0][1] > lobeTips[1][1] ? lobeTips[0] : lobeTips[1];
    const anchors = {
      top,
      head: headC,
      mouth: onHead(sph(0, MOUTH_V), 1.02),
      eyeN: onHead(EYES[0].c, 1.02),
      eyeF: onHead(EYES[1].c, 1.02),
      gem: gemF.t,
      body: chestF.t,
      handN: hands[0], handF: hands[1],
      feet: scl(add(feet[0], feet[1]), 0.5),
      hairTip: hairTip || headC,
    };
    return {
      prims, anchors, pose: P, stamps: [], dots: [], headL: headPrim.L, tressPrim, hoodPrim: form ? null : hoodPrim, turbanPrims,
      pri: { 1: 1, 2: 3, 3: 2, 4: 4, 5: 2, 6: 0, 7: 1, 8: 1, 9: 1, 10: 1, 11: 2, 12: 2, 13: 1, 14: 1, 15: 2 },
      glossy: GLOSSY, baseMat: SKIN, shadowSteps: 12,
    };
  }

  // long staff-shaped tress: chain of flat ellipsoids + staff/bar lines + note dots
  function buildTress(prims, body, headF, sway, flare, spin) {
    // control points: attached to the head at the top, to the body lower down
    const att = TRESS[0];
    const ctrl = TRESS.map((p, i) => {
      const t = i / (TRESS.length - 1);
      let q = sub(p, att);
      // sway: swing outward (+) / inward (-) about the forward axis and a little fore/aft, growing down the tress
      const w = Math.pow(t, 1.25);
      const sw = sway * (1 - 0.7 * flare);
      q = M3.v(M3.rx(sw * 0.3 * w), q);
      q = M3.v(M3.rz(sw * 0.14 * w), q);
      // flare: the tress flies outward (bending near the top) and trails behind the turn during a pirouette
      if (flare > 0) {
        const b = Math.min(1, t / 0.4), bend = b * b * (3 - 2 * b);
        q = M3.v(M3.rx(flare * 0.8 * bend), q);
        q = M3.v(M3.ry(-Math.sign(spin || 1) * flare * 0.55 * t), q);
      }
      const pb = add(att, q);
      // blend: head frame near the top, body frame lower down
      const hLocal = sub(pb, [0, NECK_Y + HEAD_UP, 0]);
      const ph = P2W(headF, [hLocal[0] - 0.4, hLocal[1], hLocal[2]]);
      const pw = P2W(body, pb);
      return lerpV(ph, pw, clamp(t * 3, 0, 1));
    });
    // dense samples with arc length
    const NS = 72, S = [], len = [0];
    for (let i = 0; i <= NS; i++) S.push(crPt(ctrl, (i / NS) * (ctrl.length - 1)));
    for (let i = 1; i <= NS; i++) len.push(len[i - 1] + Math.hypot(...sub(S[i], S[i - 1])));
    const total = len[NS];
    const at = (u) => {
      const L = clamp(u, 0, 1) * total;
      let i = 1;
      while (i < NS && len[i] < L) i++;
      const f = (L - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      return lerpV(S[i - 1], S[i], f);
    };
    const W0 = V2W(body, TRESS_W0);
    const frameAt = (u) => {
      const a = at(u - 0.025), b = at(u + 0.025);
      const Tn = nrm(sub(b, a));
      const Wd = nrm(sub(W0, scl(Tn, dot(W0, Tn))));
      return { p: at(u), T: Tn, W: Wd, N: cross(Tn, Wd) };
    };
    const THIN = 1.6;
    // note dots (world-space ovals on the ribbon)
    const notes = NOTES.map(([u, o]) => {
      const fr = frameAt(u);
      return { c: add(fr.p, scl(fr.W, o * halfW(u))), T: fr.T, W: fr.W, N: fr.N };
    });
    const segLen = total / NSEG;
    let first = null;
    for (let i = 0; i < NSEG; i++) {
      const u = (i + 0.5) / NSEG;
      const fr = frameAt(u);
      const prim = E(fr.p, M3.mul(M3.cols(fr.W, fr.T, fr.N), M3.diag(halfW(u), segLen * 1.5, THIN)), 13, 3, M_HAIR);
      prims.push(prim);
      if (!first) first = prim;
    }
    // note dots: small flat ovals set into the ribbon (own part, so the staff lines skip them)
    for (const n of notes) prims.push(E(n.c, M3.mul(M3.cols(n.W, n.T, n.N), M3.diag(3.0, 3.9, THIN + 1.0)), 14, 3, M_NOTE));
    // staff lines (inner lines; the two outline edges complete the staff) + bar lines, in the first
    // segment's local space (they are drawn on every pixel of the tress part)
    const Li = M3.inv(first.L);
    const toLocal = (p) => M3.v(Li, sub(p, first.c));
    const staff = (offs) => offs.map((o) => {
      const pts = [];
      for (let k = 0; k <= 44; k++) {
        const u = 0.03 + (0.96 * k) / 44;
        const fr = frameAt(u);
        pts.push(toLocal(add(fr.p, scl(fr.W, o * halfW(u)))));
      }
      return { pts, mat: HAIR, tone: 0 };
    });
    const bars = BARS.map((u) => {
      const fr = frameAt(u), hw = halfW(u);
      return { pts: [toLocal(add(fr.p, scl(fr.W, -hw))), toLocal(add(fr.p, scl(fr.W, hw)))], mat: HAIR, useLn: true };
    });
    first.linesHi = staff([-0.5, 0, 0.5]).concat(bars);
    first.linesLo = staff([-0.34, 0.34]).concat(bars);
    first.lines = first.linesHi;
    return [at(1), first];
  }

  /* ---------- render: eye culling, then ray-cast only the creature's screen box ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    form = model.pose && model.pose.form === 'pirouette' ? 1 : 0;
    if (model.tressPrim) model.tressPrim.lines = scale >= 0.72 ? model.tressPrim.linesHi : model.tressPrim.linesLo;
    if (model.hoodPrim) {
      // hood staff lines: keep the runs that face the camera and lie on the green hair
      const M = M3.mul(M3.rx(pitch), M3.ry(-yaw)), cam = [M[6], M[7], M[8]];
      const Lh = model.hoodPrim.L, cl = M3.v(M3.inv(Lh), cam);
      const lines = [];
      if (scale >= 0.72) {
        for (const pl of HOOD_LINES) {
          let run = [];
          for (const q of pl) {
            const ok = q[0] * cl[0] + q[1] * cl[1] + q[2] * cl[2] > 0.06 * Math.hypot(cl[0], cl[1], cl[2]) && hoodMat(q) === C_HAIR;
            if (ok) run.push(q);
            else { if (run.length > 1) lines.push({ pts: run, mat: HAIR, tone: 0 }); run = []; }
          }
          if (run.length > 1) lines.push({ pts: run, mat: HAIR, tone: 0 });
        }
      }
      model.hoodPrim.lines = lines;
    }
    if (model.turbanPrims) {
      // turban wraps: latitude circles of each turban ellipsoid, front-facing runs only
      const M = M3.mul(M3.rx(pitch), M3.ry(-yaw)), cam = [M[6], M[7], M[8]];
      for (const pr of model.turbanPrims) {
        const cl = M3.v(M3.inv(pr.L), cam), cn = Math.hypot(cl[0], cl[1], cl[2]);
        const lines = [];
        for (const y of pr.stripes) {
          if (scale < 0.72 && Math.abs(y) > 0.2) continue;
          const rr = Math.sqrt(1 - y * y);
          let run = [];
          for (let i = 0; i <= 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const q = [rr * Math.cos(a), y, rr * Math.sin(a)];
            if (q[0] * cl[0] + q[1] * cl[1] + q[2] * cl[2] > 0.05 * cn) run.push(q);
            else { if (run.length > 1) lines.push({ pts: run, mat: HAIRP, tone: 0 }); run = []; }
          }
          if (run.length > 1) lines.push({ pts: run, mat: HAIRP, tone: 0 });
        }
        pr.lines = lines;
      }
    }
    if (model.headL) {
      const M = M3.mul(M3.rx(pitch), M3.ry(-yaw)), cam = [M[6], M[7], M[8]];
      const Li = M3.inv(model.headL);
      for (const k of [0, 1]) {
        const e = EYES[k].c;
        const n = nrm([Li[0] * e[0] + Li[3] * e[1] + Li[6] * e[2], Li[1] * e[0] + Li[4] * e[1] + Li[7] * e[2], Li[2] * e[0] + Li[5] * e[1] + Li[8] * e[2]]);
        eyeCull[k] = dot(n, cam);
      }
    } else eyeCull = [1, 1];
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 204, bh: 140, oy: 0.86 } };
})();
