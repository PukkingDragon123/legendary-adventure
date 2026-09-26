/* ------------------------------------------------------------------
   Lotad — the Water Weed Pokémon (0.5 m ≈ 87 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a small round blue body on six
   stubby legs, a wide pale-yellow bill, white sleepy eyes, and a huge
   lily pad on its back: a flat disc with an upturned rim, a V-notch at
   the back, four dark-green triangles pointing inward and a midrib.

   Pose parameters (all optional):
     step   radians   walk-cycle phase (tripod gait of the six legs, body
                      bob and a small waddle); 0 = standing
     tilt   −1..1     pad + body roll (+ = toward the near side), for
                      waddles, wobbles on the water or a curious lean
     swim   0..1      legs tucked under the body (floating on water)
     mouth  0..1      bill open
     eyes   'open' | 'happy' | 'closed' | 'blink'
     side   −1..1     ≈ cos(yaw), passed in by the game: the pad leans a
                      little toward the camera so its top reads in profile
------------------------------------------------------------------- */
const Lotad = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, BILL = 2, PAD = 3, PADD = 4, PADU = 5, MOUTH = 6, EYEW = 7, EYE = 8, RIM = 9;
  const MAT = { BODY, BILL, PAD, PADD, PADU, MOUTH, EYEW, EYE, RIM };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#0a6aa8', '#0a8cc8', '#12aee8', '#52ccf6', '#a8ecff'], od: '#07365e', ol: '#0a5e98', ln: '#0a5a92' },
    [BILL]:  { r: ['#c2a64a', '#e0c866', '#f6e48a', '#fdf2b6', '#fffbe2'], od: '#6a5214', ol: '#a8883a', ln: '#9a7c32' },
    [PAD]:   { r: ['#3a8a30', '#52a83e', '#66c24c', '#80dc5e', '#a8f282'], od: '#1c4a16', ol: '#387c2a', ln: '#34742a' },
    [PADD]:  { r: ['#284e18', '#335e1e', '#3f7026', '#4c822e', '#5c963a'], od: '#15300c', ol: '#2a5418', ln: '#2a5418' },
    [PADU]:  { r: ['#2c6424', '#3a7c2e', '#4a9438', '#5aa844', '#70bc56'], od: '#16380e', ol: '#2e6422', ln: '#2c5e20' },
    [RIM]:   { r: ['#3e9034', '#58b044', '#70ca54', '#8ce46a', '#b4f890'], od: '#1c4a16', ol: '#387c2a', ln: '#34742a' },
    [MOUTH]: { r: ['#521a24', '#6e2632', '#8a3a42', '#a44e52', '#bc6462'], od: '#34101a', ol: '#521a24', ln: '#521a24' },
    [EYEW]:  { r: ['#c8d6e0', '#e4eef4', '#fafdff', '#ffffff', '#ffffff'], od: '#062a4a', ol: '#0a3e66', ln: '#062a4a' },
    [EYE]:   { r: ['#060c16', '#0a121e', '#0e1826', '#162232', '#223044'], od: '#04080e', ol: '#04080e', ln: '#04080e' },
  });
  const GLOSSY = { [BODY]: 1 };
  const C_BODY = code(BODY), C_BILL = code(BILL), C_BILL_D = code(BILL, -1), C_PAD = code(PAD), C_PADD = code(PADD), C_PADU = code(PADU);
  const C_MOUTH = code(MOUTH), C_EYEW = code(EYEW), C_EYE = code(EYE), C_RIM = code(RIM), C_RIM_D = code(RIM, -1);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (f, c, ax, r, part, grp, mat) => E(inF(f, c), M3.mul(f.L, M3.mul(M3.cols(ax[0], ax[1], ax[2]), M3.diag(r[0], r[1], r[2]))), part, grp, mat);
  const wrapA = (a) => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };

  /* ---------- body ---------- */
  const BODY_C = [0, 33, 0], BODY_R = [35, 28, 33];
  const bodyMat = () => C_BODY;

  /* ---------- lily pad (pad frame: origin at the disc centre, y up) ---------- */
  const PAD_R = 75, NOTCH_A = Math.PI - 0.55, NOTCH_W = 0.36; // notch centre angle (atan2(z, x)) and half-width
  const RIM_N = 26, RIM_H = 12, RIM_FLARE = 0.62;
  const TRI = [0, 1, 2, 3].map((k) => wrapA(NOTCH_A + Math.PI / 4 + (k * Math.PI) / 2)); // triangle centres, the notch sits between two
  const TRI_IN = 0.44, TRI_W = 0.42; // apex radius (fraction of PAD_R), half-width of the base (radians)
  const inNotch = (a) => Math.abs(wrapA(a - NOTCH_A)) < NOTCH_W;
  function padMat(s) {
    const a = Math.atan2(s[2], s[0]);
    if (inNotch(a)) return 0;
    if (s[1] < 0) return C_PADU;
    const r = Math.hypot(s[0], s[2]);
    if (r > TRI_IN) {
      const k = (r - TRI_IN) / (0.97 - TRI_IN);
      for (let i = 0; i < TRI.length; i++) if (Math.abs(wrapA(a - TRI[i])) < TRI_W * Math.min(1, k)) return C_PADD;
    }
    return C_PAD;
  }
  // rim plate (u along the edge, v up the wall); gently rounded top edge
  const RIM_L = (2 * Math.PI * PAD_R) / RIM_N;
  const RIM_G = (() => {
    const k = Math.sin(RIM_FLARE) / PAD_R, hw0 = RIM_L / 2 + 0.7;
    const hw = (v) => hw0 * (1 + v * k);
    const pts = [[-hw(-2), -2], [hw(-2), -2], [hw(RIM_H), RIM_H], [-hw(RIM_H), RIM_H]];
    return bakeShape({ bb: [-hw(RIM_H) - 0.5, -2.5, hw(RIM_H) + 0.5, RIM_H + 0.5], test: (u, v) => (Shape2D.inPoly(u, v, pts) ? (v > RIM_H - 2.2 ? C_RIM : C_RIM_D) : 0) });
  })();
  // rim end at the notch: the wall rises to a little point
  const RIM_END_G = (() => {
    const pts = [[-RIM_L / 2 - 0.7, -2], [RIM_L / 2 + 0.7, -2], [RIM_L / 2 + 0.7, RIM_H + 6], [-RIM_L / 2 - 0.7, RIM_H]];
    return bakeShape({ bb: [-RIM_L / 2 - 1.5, -2.5, RIM_L / 2 + 1.5, RIM_H + 6.5], test: (u, v) => (Shape2D.inPoly(u, v, pts) ? (v > RIM_H - 2.2 ? C_RIM : C_RIM_D) : 0) });
  })();

  /* ---------- eyes (white, sleepy upper lid) ---------- */
  const EYE_AZ = 0.6, EYE_V = 0.35, EYE_R = [6.8, 8.4, 3];
  let curScale = 1;
  function eyeMat(kind, side) {
    return (s) => {
      const x = s[0] * side, y = s[1];
      const px = 1 / (curScale * EYE_R[1]);
      if (kind === 'closed' || kind === 'happy') {
        const yc = kind === 'happy' ? -0.3 + 0.7 * (1 - x * x) : 0.12 - 0.5 * (1 - x * x);
        return Math.abs(y - yc) < Math.max(0.12, 0.62 * px) && Math.abs(x) < 0.86 ? C_EYE : C_BODY;
      }
      const lid = kind === 'blink' ? -0.05 : 0.5 - 0.12 * x;
      if (y > lid + Math.max(0.16, 0.9 * px)) return C_BODY;
      if (y > lid) return C_EYE; // dark lid line
      const pr = Math.max(0.42, 1.25 * px);
      const qx = (x - 0.22) / pr, qy = (y - (kind === 'blink' ? -0.35 : 0.02)) / (pr * 1.15);
      return qx * qx + qy * qy < 1 ? C_EYE : C_EYEW;
    };
  }

  /* ---------- legs: six stubs, tripod gait ---------- */
  const LEGS = [
    { x: 19, z: 18, ph: 0 }, { x: 0, z: 23, ph: Math.PI }, { x: -18, z: 18, ph: 0 },
    { x: 19, z: -18, ph: Math.PI }, { x: 0, z: -23, ph: 0 }, { x: -18, z: -18, ph: Math.PI },
  ];

  const DEFAULT = { step: 0, tilt: 0, swim: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 2, 3: 3, 4: 3, 5: 1, 6: 1, 7: 0, 8: 1, 9: 2, 10: 1 });
  for (let i = 12; i < 18; i++) PRI[i] = -1;
  const SIZE = 0.92;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = P.step || 0;
    const sw = clamp(P.swim, 0, 1);
    // the gait is continuous in `step` (no pop when a walk starts); step 0 is a relaxed, staggered stance
    const bob = 1.6 * Math.abs(Math.sin(st)) * (1 - sw);
    const roll = clamp(P.tilt, -1, 1) * 0.3 + 0.05 * Math.sin(st) * (1 - sw);
    const body = chain(T(0, bob, 0), T(0, 20, 0), R(M3.rx(roll)), T(0, -20, 0));

    // --- body
    const bodyPrim = ellF(chain(body, T(...BODY_C)), BODY_R, 1, 1, bodyMat);
    prims.push(bodyPrim);
    // point + normal on the body at azimuth az, unit height v
    const onBody = (az, v) => {
      const h = Math.sqrt(Math.max(0, 1 - v * v));
      const s = [h * Math.cos(az), v, h * Math.sin(az)];
      return { p: add(BODY_C, [BODY_R[0] * s[0], BODY_R[1] * s[1], BODY_R[2] * s[2]]), n: nrm([s[0] / BODY_R[0], s[1] / BODY_R[1], s[2] / BODY_R[2]]) };
    };

    // --- eyes
    const kind = P.eyes;
    for (const side of [1, -1]) {
      const h = onBody(side * EYE_AZ, EYE_V);
      const n = h.n;
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = cross(ye, n);
      const flat = kind === 'happy' || kind === 'closed';
      const id = side > 0 ? 2 : 3;
      prims.push(ellAx(body, sub(h.p, sc(n, flat ? 2.2 : 1.2)), [xe, ye, n], EYE_R, id, flat ? 1 : id, eyeMat(kind, side)));
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = inF(body, h.p);
    }

    // --- bill: wide flat upper bill + lower bill hinged at the face, mouth interior
    const mo = clamp(P.mouth, 0, 1);
    const HINGE = [22, 26, 0];
    const upF = chain(body, T(...HINGE), R(M3.rz(0.12 * mo)));
    prims.push(ellF(chain(upF, T(15, -1, 0), R(M3.rz(-0.28))), [21, 7, 25], 4, 4, (s) => (s[1] < -0.5 && mo > 0.05 ? C_BILL_D : C_BILL)));
    const loF = chain(body, T(...HINGE), R(M3.rz(-0.55 * mo)));
    prims.push(ellF(chain(loF, T(12, -7, 0), R(M3.rz(-0.22))), [18, 5.5, 22], 5, 5, () => C_BILL));
    if (mo > 0.03) prims.push(ellF(chain(body, T(26, 20, 0)), [13, 8 + 4 * mo, 18], 6, 6, () => C_MOUTH));
    anchors.mouth = inF(upF, [30, -6, 0]);

    // --- legs (tripod gait: lifted legs swing forward; tucked in when swimming)
    LEGS.forEach((lg, i) => {
      const ph = st + lg.ph;
      const lift = Math.max(0, Math.sin(ph)) * 4.5 * (1 - sw);
      const swing = Math.cos(ph) * 4 * (1 - sw);
      const tuck = sw * 7;
      const out = Math.sign(lg.z);
      const f = chain(T(lg.x + swing, 7.5 + lift + tuck, lg.z * (1 - 0.15 * sw)), R(M3.rx(-out * 0.35)));
      const id = 12 + i;
      prims.push(ellF(f, [6.5, 7.5, 5.8], id, id, bodyMat));
    });

    // --- lily pad (tilted a little forward; leans toward the camera in profile views)
    const cheat = clamp(P.side ?? 1, -1, 1) * 0.12;
    const pad = chain(body, T(-4, 64, 0), R(M3.rz(-0.07)), R(M3.rx(cheat)));
    prims.push(ellF(pad, [PAD_R, 3.4, PAD_R], 7, 7, padMat));
    // midrib from the centre to the front edge
    prims[prims.length - 1].lines = [{ pts: [[0.05, 1.02, 0], [0.5, 0.9, 0.06], [0.95, 0.35, 0.1]], mat: PAD, useLn: true }];
    for (let i = 0; i < RIM_N; i++) {
      const th = (i / RIM_N) * Math.PI * 2 + 0.05;
      const d = wrapA(th - NOTCH_A);
      if (Math.abs(d) < NOTCH_W + 0.5 * (2 * Math.PI / RIM_N)) continue;
      const end = Math.abs(d) < NOTCH_W + 1.5 * (2 * Math.PI / RIM_N);
      const o = [Math.cos(th), 0, Math.sin(th)], u = [-Math.sin(th), 0, Math.cos(th)];
      const v = add(sc([0, 1, 0], Math.cos(RIM_FLARE)), sc(o, Math.sin(RIM_FLARE)));
      // rim ends: the rising point sits on the notch side
      const uu = end && d < 0 ? sc(u, -1) : u;
      prims.push(PL(inF(pad, sc(o, PAD_R - 1.2)), M3.mul(pad.L, M3.cols(uu, v, cross(uu, v))), 8, 8, end ? RIM_END_G : RIM_G, 1.6));
    }

    anchors.top = inF(pad, [0, 16, 0]);
    anchors.pad = inF(pad, [0, 4, 0]);
    anchors.head = inF(body, [22, 42, 0]);
    anchors.body = inF(body, BODY_C);
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 200, bh: 140, oy: 0.885 } };
})();
