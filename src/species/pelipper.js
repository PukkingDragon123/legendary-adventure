/* ------------------------------------------------------------------
   Pelipper — the Water Bird Pokémon. A posable 3D model rendered
   straight to pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.
------------------------------------------------------------------- */
const Pelipper = (() => {
  const { ell, plate, chain, T, R, F, sph, code } = Creature;

  // material ids
  const WHITE = 1, CAP = 2, BILL = 3, MOUTH = 4, TIP = 5, FEET = 6, EYEW = 7, EYE = 8;
  const MAT = { WHITE, CAP, BILL, MOUTH, TIP, FEET, EYEW, EYE };

  const PAL = Creature.palette({
    [WHITE]: { r: ['#9aa6c6', '#c1cbe2', '#e6ecf6', '#f8fafd', '#ffffff'], od: '#3a4870', ol: '#6c7ca6', ln: '#8795bb' },
    [CAP]:   { r: ['#3d6396', '#5783b8', '#7ea7d4', '#a6c6e8', '#d2e6f8'], od: '#1e3560', ol: '#3b5d90', ln: '#34568a' },
    [BILL]:  { r: ['#be9448', '#ddb865', '#f4d88f', '#fbe9b5', '#fff7de'], od: '#6e4c18', ol: '#a67d34', ln: '#a27a32' },
    [MOUTH]: { r: ['#7a3a58', '#9c5676', '#c27e9b', '#daa2ba', '#efc8d8'], od: '#4a1830', ol: '#6c2b48', ln: '#6c2b48' },
    [TIP]:   { r: ['#3c6ca4', '#5a92c9', '#7fb2de', '#9cc8ec', '#b9dbf6'], od: '#1c3968', ol: '#36689e', ln: '#2e5a90' },
    [FEET]:  { r: ['#34609a', '#4d82bc', '#71a6d8', '#98c4ec', '#c4e2fb'], od: '#193360', ol: '#315f96', ln: '#2a5288' },
    [EYEW]:  { r: ['#c5cfe4', '#e0e7f4', '#f9fbff', '#ffffff', '#ffffff'], od: '#1b2136', ol: '#283150', ln: '#1e2539' },
    [EYE]:   { r: ['#0d111d', '#131827', '#181e2f', '#20283b', '#34405a'], od: '#0a0d17', ol: '#0a0d17', ln: '#0a0d17' },
  });
  const GLOSSY = {};

  const DEFAULT = { flap: 0, spread: 0, bill: 0.12, pitch: 0, feet: 0, pouch: 0, eyes: 'open', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const MIRZ = M3.diag(1, 1, -1);
  const mirror = (f) => F(M3.mul(MIRZ, f.L), M3.v(MIRZ, f.t)); // mirror a local frame across z = 0
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function slerpM(A, B, t) {
    const Q = M3.mul(transpose(A), B);
    const ang = Math.acos(clamp((Q[0] + Q[4] + Q[8] - 1) / 2, -1, 1));
    if (ang < 1e-5) return A;
    return M3.mul(A, rotAxis(V3.norm([Q[7] - Q[5], Q[2] - Q[6], Q[3] - Q[1]]), ang * t));
  }
  // orthonormal rotation whose first column is u and third column is close to w
  function frameUW(u, w) {
    const U = V3.norm(u);
    const W = V3.norm(V3.sub(w, V3.scale(U, V3.dot(w, U))));
    return M3.cols(U, V3.cross(W, U), W);
  }

  /* ---------- wing shapes (u = span from the joint, v = chord, +v = leading edge) ---------- */
  const ARM_L = 70;
  const ARM = bakeShape(Shape2D.poly([[-6, -4], [-3, 12], [16, 16.5], [45, 18], [70, 18.5], [77, 14], [78, 0], [76, -18], [58, -24], [30, -23], [8, -19], [-4, -12]], code(WHITE, 1)));
  const FINGERS = [
    { v0: 13, len: 56, fan: 4.5 },
    { v0: 2, len: 62, fan: 1.5 },
    { v0: -9, len: 59, fan: -1.5 },
    { v0: -19.5, len: 51, fan: -4.5 },
  ];
  const FW = 6.6, FU0 = 16;
  const whiteEdge = (v) => 25 + 0.01 * v * v;
  const FSEG = FINGERS.map((f) => [FU0, f.v0, FU0 + f.len, f.v0 + f.fan]);
  const HAND_POLY = Shape2D.catmull([[-6, 0], [-5, 16], [8, 19.5], [24, 20], [29, 0], [25, -25], [8, -26], [-5, -18]], true, 8);
  const HAND = bakeShape({
    bb: [-8, -30, FU0 + 72, 28],
    test(u, v) {
      for (const s of FSEG) if (Shape2D.segDist(u, v, s[0], s[1], s[2], s[3]) < FW) return u > whiteEdge(v) ? code(TIP, 1) : code(WHITE, 1);
      return Shape2D.inPoly(u, v, HAND_POLY) ? code(WHITE, 1) : 0;
    },
  });
  // separation lines between the blue feathers + the white/blue boundary
  const HAND_LINES = [];
  for (let k = 0; k < 3; k++) {
    const a = FSEG[k], b = FSEG[k + 1], pts = [];
    for (let i = 0; i <= 6; i++) {
      const u = lerp(whiteEdge((a[1] + b[1]) / 2), FU0 + Math.min(FINGERS[k].len, FINGERS[k + 1].len) * 0.94, i / 6);
      const fa = (u - a[0]) / (a[2] - a[0]), fb = (u - b[0]) / (b[2] - b[0]);
      pts.push([u, (lerp(a[1], a[3], fa) + lerp(b[1], b[3], fb)) / 2, 0]);
    }
    HAND_LINES.push({ pts, mat: TIP, useLn: true });
  }
  {
    const pts = [];
    for (let v = -26; v <= 20; v += 2) pts.push([whiteEdge(v), v, 0]);
    HAND_LINES.push({ pts, mat: TIP, useLn: true });
  }

  /* ---------- head decals (head-local unit sphere) ---------- */
  const EYE_AZ = 1.15, EYE_V = -0.1;
  const EC = sph(EYE_AZ, EYE_V);
  const ETY = V3.norm(V3.sub([0, 1, 0], V3.scale(EC, EC[1])));
  const ETX = V3.cross(ETY, EC); // points toward the bill
  const EA = 0.44, EB = 0.54, ETILT = 0.14;
  let curScale = 1, eyeCull = [0, 0, 0, 0]; // eyeCull: camera direction in head space per eye side
  function eyeMat(s, kind) {
    if ((s[2] < 0 ? eyeCull[1] : eyeCull[0]) < 0.3) return 0;
    const m = s[2] < 0 ? [s[0], s[1], -s[2]] : s;
    if (m[0] * EC[0] + m[1] * EC[1] + m[2] * EC[2] < 0.45) return 0;
    const dx = m[0] - EC[0], dy = m[1] - EC[1], dz = m[2] - EC[2];
    const ex0 = dx * ETX[0] + dy * ETX[1] + dz * ETX[2], ey0 = dx * ETY[0] + dy * ETY[1] + dz * ETY[2];
    const c = Math.cos(ETILT), sn = Math.sin(ETILT);
    const ex = ex0 * c + ey0 * sn, ey = -ex0 * sn + ey0 * c;
    const px = 1 / (curScale * 30); // ~one pixel in unit-sphere units
    if (kind === 'closed') {
      const yc = -0.22 + 1.1 * ex * ex;
      return Math.abs(ey - yc) < Math.max(0.05, 1.1 * px) && Math.abs(ex) < EA * 0.8 ? code(EYE) : 0;
    }
    if ((ex / EA) ** 2 + (ey / EB) ** 2 > 1) return 0;
    if (kind === 'happy') {
      const r = (ex / 0.28) ** 2 + ((ey + 0.12) / 0.32) ** 2;
      return ey > -0.12 && r < 1 && r > 0.4 ? code(EYE) : code(EYEW);
    }
    if (kind === 'blink') return ey < 0.0 && ey > -0.22 && Math.abs(ex) < 0.28 ? code(EYE) : ey > 0.06 ? 0 : code(EYEW);
    const pr = ((ex - 0.01) / 0.23) ** 2 + ((ey + 0.01) / 0.36) ** 2;
    if (pr < 1) return Math.abs(ey + 0.01) < Math.max(0.045, 0.8 * px) ? code(EYEW) : code(EYE);
    return code(EYEW);
  }
  function capMat(s) {
    const b = 0.38 - 2.4 * Math.max(0, s[0] - 0.8) - 0.12 * Math.max(0, -s[0]);
    return s[1] > b ? code(CAP) : 0;
  }
  const crestCapMat = (s) => (s[1] > 0.08 + 0.9 * Math.max(0, -s[0] - 0.3) ? code(CAP) : 0);
  const tipCapMat = () => 0;

  // upper bill: one long ellipsoid (radii UB, centre UBC in the bill frame, tilted UBT) cut at y = -3
  const UB = [104, 28, 36], UBC = [50, -10, 0], UBT = -0.13;
  // its cross-section at the cut plane (the palate) is an ellipse: centre PAL_U0, half-axes PAL_A x PAL_B
  const [PAL_U0, PAL_A, PAL_B] = (() => {
    const c = Math.cos(UBT), s = Math.sin(UBT), dy = -3 - UBC[1];
    const A2 = UB[0] * UB[0], B2 = UB[1] * UB[1];
    const al = (c * c) / A2 + (s * s) / B2, be = dy * c * s * (1 / A2 - 1 / B2), ga = dy * dy * ((s * s) / A2 + (c * c) / B2);
    const K = 1 - (ga - (be * be) / al);
    return [UBC[0] - be / al, Math.sqrt(K / al), UB[2] * Math.sqrt(K)];
  })();

  // inner mouth walls: vertical plates starting at z = ±CHEEK_Z by the hinge and converging toward the tip
  // (angle CHEEK_A) so the upper bill always covers them from above; CHEEK_X = forward extent
  const CHEEK_Z = 27, CHEEK_A = 0.15;
  const CHEEK_X = (() => {
    const Ri = M3.rz(-UBT);
    let xm = 0;
    for (let u = 0; u < 160; u += 0.5) {
      const x = u * Math.cos(CHEEK_A), z = CHEEK_Z - u * Math.sin(CHEEK_A) + 1.5;
      if (((x - PAL_U0) / PAL_A) ** 2 + (z / PAL_B) ** 2 < 1) xm = u;
    }
    return xm - 2;
  })();

  // unit-disk rim plate: mouth interior with a yellow lip
  const rimMat = (s) => { const r = s[0] * s[0] + s[2] * s[2]; return r > 0.6 ? code(BILL) : code(MOUTH, r < 0.25 && s[0] < 0 ? -1 : 0); };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const sp = clamp(P.spread, 0, 1), fl = clamp(P.flap, -1, 1), bo = clamp(P.bill, 0, 1), pb = clamp(P.pouch, 0, 1), ft = clamp(P.feet, 0, 1);
    const prims = [];
    const lean = sp * 0.35;
    const CG = [-10, 100, 0];
    const top = chain(T(...CG), R(M3.rz(P.pitch - lean)), T(-CG[0], -CG[1], -CG[2]));
    const W = () => code(WHITE);

    // --- body, tail, neck
    const bodyF = chain(top, T(-16, 78, 0), R(M3.rz(-0.26)));
    prims.push(ell(bodyF, [32, 58, 32], { part: 1, grp: 1, mat: W }));
    prims.push(ell(chain(top, T(-48, 42, 0), R(M3.rz(0.6))), [18, 4, 10], { part: 1, grp: 1, mat: W }));
    prims.push(ell(chain(top, T(-8, 142, 0), R(M3.rz(-0.3))), [26, 30, 26], { part: 2, grp: 2, mat: W }));

    // --- head, crest, cap and eye shells
    const headF = chain(top, T(4, 178, 0), R(M3.rz(lean * 0.85)));
    const HR = [32, 31, 30], C1 = [40, 17, 12.5], C2 = [16, 5.5, 5];
    prims.push(ell(headF, HR, { part: 2, grp: 2, mat: W }));
    const c1F = chain(headF, T(-24, 9, 0), R(M3.rz(-0.12)));
    const c2F = chain(headF, T(-57, 14.5, 0), R(M3.rz(-0.16)));
    prims.push(ell(c1F, C1, { part: 2, grp: 2, mat: W }));
    prims.push(ell(c2F, C2, { part: 2, grp: 2, mat: W }));
    prims.push(ell(headF, V3.scale(HR, 1.012), { part: 3, grp: 3, mat: capMat }));
    prims.push(ell(c1F, V3.scale(C1, 1.015), { part: 3, grp: 3, mat: crestCapMat }));
    const kind = P.eyes;
    prims.push(ell(headF, V3.scale(HR, 1.022), { part: 4, grp: 4, mat: (s) => eyeMat(s, kind) }));

    // --- bill: tapered upper bill + pouch, hinged at the lower front of the head
    const hinge = [20, -30, 0];
    const TILT = 0.08, tu = bo * 0.5, tl = bo * 0.1;
    const ubF = chain(headF, T(...hinge), R(M3.rz(TILT + tu)));
    // one long ellipsoid tilted nose-down and cut at the mouth plane (y = -3): thick base, pointed tip
    const ubE = chain(ubF, T(...UBC), R(M3.rz(UBT)));
    const sT = Math.sin(UBT) * UB[0], cT = Math.cos(UBT) * UB[1];
    prims.push(ell(ubE, UB, { part: 5, grp: 5, mat: (s) => (UBC[1] + sT * s[0] + cT * s[1] < -3 ? 0 : code(BILL)) }));
    // palate: the cut face of the upper bill, a flat pink ellipse (only visible once the bill opens)
    if (bo > 0.15) prims.push(ell(chain(ubF, T(PAL_U0, -3.4, 0)), [PAL_A, 1.2, PAL_B], { part: 9, grp: 5, mat: () => code(MOUTH, 1) }));
    // chin / throat under the head, filling the corner of the gape
    prims.push(ell(chain(headF, T(2, -33, 0)), [28, 14, 27], { part: 2, grp: 2, mat: W }));
    const lbF = chain(headF, T(...hinge), R(M3.rz(TILT - tl)));
    const PR = [82 * (1 + 0.06 * pb), 96 * (1 + 0.12 * pb), 55 * (1 + 0.2 * pb)];
    const RIM = 0.3, rimK = Math.sqrt(1 - RIM * RIM);
    const pouchF = chain(lbF, T(54, -3 - RIM * PR[1], 0));
    prims.push(ell(pouchF, PR, { part: 6, grp: 6, mat: (s) => (s[1] > RIM ? 0 : code(BILL)) }));
    const rimF = chain(pouchF, T(0, RIM * PR[1] - 0.6, 0));
    prims.push(ell(rimF, [PR[0] * rimK, 1.2, PR[2] * rimK], { part: 7, grp: 6, mat: rimMat }));
    // mouth: pink inner walls at z = ±CHEEK_Z spanning the wedge between the jaws (visible whenever the bill parts)
    if (bo > 0.02) {
      const cu = Math.cos(tu), su = Math.sin(tu), cl = Math.cos(tl), sl = Math.sin(tl);
      const hF = chain(headF, T(...hinge), R(M3.rz(TILT)));
      const cheek = {
        bb: [1, -8 - CHEEK_X * sl, CHEEK_X + 1, 4 + CHEEK_X * su],
        test(u, v) {
          if (u < 2 || u > CHEEK_X || -u * su + v * cu > -3 || u * sl + v * cl < -3.5) return 0;
          return code(MOUTH, u < 30 ? -2 : -1);
        },
      };
      for (const k of [1, -1]) prims.push(plate(chain(hF, T(0, 0, k * CHEEK_Z), R(M3.ry(k * CHEEK_A))), cheek, { part: 8, grp: 7, thick: 1.2, farSide: k }));
    }

    // --- wings (near side built, far side mirrored)
    const tips = [];
    for (const side of [1, -1]) {
      const a = 0.42;
      const Rf = M3.mul(M3.rx(-fl * 0.35), frameUW([-0.12, -Math.cos(a), Math.sin(a)], [0.75, 0, 0.66]));
      const Rs = M3.mul(M3.rx(-fl * 1.05), frameUW([-0.16, 0, 1], [0, 1, 0]));
      const Rw = slerpM(Rf, Rs, sp);
      const sc = 0.74 + 0.26 * sp;
      const beta = lerp(-0.05, fl * 0.35, sp);
      const sh = lerpV([-6, 136, 30], [-10, 130, 26], sp);
      let armF = F(M3.mul(Rw, M3.diag(sc, 1, 1)), sh);
      const wrist = V3.add(sh, M3.v(Rw, [(ARM_L - 3) * sc, 0, 0]));
      let handF = F(M3.mul(Rw, M3.ry(-beta)), wrist);
      if (side < 0) { armF = mirror(armF); handF = mirror(handF); }
      armF = chain(top, armF); handF = chain(top, handF);
      const pid = side > 0 ? 10 : 12, g = side > 0 ? 10 : 11;
      prims.push(plate(armF, ARM, { part: pid, grp: g, thick: 1.8 }));
      prims.push(plate(handF, HAND, { part: pid + 1, grp: g, thick: 1.8, lines: HAND_LINES }));
      tips.push(P2W(handF, [FU0 + 60, 0, 0]));
    }

    // --- legs and webbed feet (pad + three toes)
    const feetPts = [];
    const FM = () => code(FEET);
    for (const side of [1, -1]) {
      let legF = chain(T(-12, 20, 12), R(M3.rz(-ft * 1.5)), R(M3.rx(-0.08)));
      if (side < 0) legF = mirror(legF);
      legF = chain(top, legF);
      const pid = side > 0 ? 14 : 15;
      prims.push(ell(chain(legF, T(0, -7, 0)), [5, 8.5, 5], { part: pid, grp: pid, mat: FM }));
      const footF = chain(legF, T(2, -16.6, 0.5));
      prims.push(ell(footF, [6.5, 3.2, 6], { part: pid, grp: pid, mat: FM }));
      for (const ta of [-0.62, 0, 0.62]) prims.push(ell(chain(footF, R(M3.ry(ta)), T(8, -1, 0), R(M3.rz(-0.12))), [8.5, 2.2, 2.4], { part: pid, grp: pid, mat: FM }));
      feetPts.push(P2W(footF, [0, -3.4, 0]));
    }

    const anchors = {
      pouch: P2W(pouchF, [0, -0.12 * PR[1], 0]),
      mouth: rimF.t,
      billTip: P2W(ubF, [128, -1, 0]),
      top: P2W(headF, [0, HR[1] * 1.012, 0]),
      head: headF.t,
      feet: V3.scale(V3.add(feetPts[0], feetPts[1]), 0.5),
      body: bodyF.t,
      wingTipN: tips[0], wingTipF: tips[1],
      eyeN: P2W(headF, [HR[0] * EC[0], HR[1] * EC[1], HR[2] * EC[2]]),
      eyeF: P2W(headF, [HR[0] * EC[0], HR[1] * EC[1], -HR[2] * EC[2]]),
    };
    return {
      prims, anchors, pose: P, stamps: [], dots: [], headL: M3.mul(headF.L, M3.diag(...HR)),
      pri: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 1, 6: 0, 7: 0, 10: 1, 11: 1, 14: 1, 15: 1 },
      glossy: GLOSSY, baseMat: WHITE, shadowSteps: 14,
    };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    // eyes: facing of each eye centre toward the camera (skip eyes seen edge-on)
    if (model.headL) {
      const M = M3.mul(M3.rx(pitch), M3.ry(-yaw)), cam = [M[6], M[7], M[8]];
      const Li = M3.inv(model.headL);
      for (const k of [0, 1]) {
        const e = [EC[0], EC[1], k ? -EC[2] : EC[2]];
        const n = V3.norm([Li[0] * e[0] + Li[3] * e[1] + Li[6] * e[2], Li[1] * e[0] + Li[4] * e[1] + Li[7] * e[2], Li[2] * e[0] + Li[5] * e[1] + Li[8] * e[2]]);
        eyeCull[k] = V3.dot(n, cam);
      }
    } else eyeCull = [1, 1];
    // inner mouth walls: only the wall on the far side of the mouth is ever visible
    const cz = Math.cos(yaw);
    if (model.prims.some((p) => p.farSide)) model = Object.assign({}, model, { prims: model.prims.filter((p) => !p.farSide || (Math.abs(cz) > 0.35 && p.farSide * cz < 0)) });
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.2, bw: 400, bh: 380, oy: 0.74 } };
})();
