/* ------------------------------------------------------------------
   Volbeat — the Firefly Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (= Volbeat's
   right), y = 0 under the pointed feet (it hovers: the game lifts it).

   Design (official art): a blue-grey face with half-lidded yellow eyes,
   a round nose and a small frown; a thick red roll (hood) arches over the
   top of the head, bulges down its left side and curls forward under the
   chin; two curly yellow antennae with black tips and a black band; a
   round, hunched black body whose front is striped blue-grey and yellow;
   thick red rings where the stubby, pointed black arms and legs join;
   two pairs of translucent blue-lavender wings; a big round yellow tail
   bulb at the rear that glows.

   Pose parameters (all optional):
     flap   −1..1    wing beat (−1 wings down/forward, 1 up/back)
     arms   −1..1    both arms (−1 hanging, 0 held in front, 1 raised)
     armN, armF      optional per-arm override of `arms`
     glow   0..1     tail-bulb light (0 = plain yellow, 1 = bright glow;
                     the glow ramp ignores the time-of-day grading)
     lean   −1..1    body pitch (+ = leaning forward)
     mouth  0..1     mouth open
     eyes   'open' | 'happy' | 'closed' | 'blink'
     side   −1..1    ≈ cos(yaw), passed in by the game (unused)
   Anchors: head, eyeN, eyeF, mouth, antN, antF, body, tail (bulb centre),
   handN, handF, footN, footF, wingTipN, wingTipF, top.
------------------------------------------------------------------- */
const Volbeat = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SKIN = 1, BLACK = 2, RED = 3, YEL = 4, BULB = 5, GLOW = 6, WING = 7, EYEY = 8, EYE = 9, MOUTH = 10, TIPK = 11, BAND = 12;
  const MAT = { SKIN, BLACK, RED, YEL, BULB, GLOW, WING, EYEY, EYE, MOUTH, TIPK, BAND };
  const PAL = Creature.palette({
    [SKIN]:  { r: ['#5c6690', '#7a85ae', '#9ea9cf', '#c0c9e6', '#e4e9f8'], od: '#282e56', ol: '#4c5584', ln: '#4a5382' },
    [BAND]:  { r: ['#5c6690', '#7a85ae', '#9ea9cf', '#c0c9e6', '#e4e9f8'], od: '#282e56', ol: '#4c5584', ln: '#3e466e' },
    [BLACK]: { r: ['#14161e', '#1c1f2a', '#272b38', '#363c4c', '#4e5668'], od: '#08090e', ol: '#12141c', ln: '#0c0e14' },
    [RED]:   { r: ['#901428', '#b81e34', '#de3446', '#f4606a', '#ff9ea0'], od: '#4a0612', ol: '#7e0e22', ln: '#760c20' },
    [YEL]:   { r: ['#b8841c', '#dca82e', '#f4ca44', '#fce07a', '#fff4c0'], od: '#664608', ol: '#9e761c', ln: '#946e18' },
    [BULB]:  { r: ['#c89a24', '#e6bc36', '#f8da56', '#feee94', '#fffbe0'], od: '#6a4a0a', ol: '#a47e1e', ln: '#9a741a' },
    [GLOW]:  { r: ['#f8dc5a', '#fdec86', '#fff6b4', '#fffce0', '#ffffff'], od: '#b88a1a', ol: '#e0b43a', ln: '#e0b43a' },
    [WING]:  { r: ['#8890c4', '#a2abd8', '#bcc4ea', '#d4daf6', '#eef1ff'], od: '#48508a', ol: '#6e78b0', ln: '#8890c2' },
    [EYEY]:  { r: ['#c89a1c', '#e8bc2c', '#fbdc3e', '#ffec7c', '#fff8c4'], od: '#1a1c24', ol: '#2a2c34', ln: '#1a1c24' },
    [EYE]:   { r: ['#0a0c12', '#0e1118', '#12161e', '#1a1f28', '#242a36'], od: '#06080c', ol: '#06080c', ln: '#06080c' },
    [MOUTH]: { r: ['#2a2238', '#382c46', '#463854', '#564664', '#685676'], od: '#18121c', ol: '#2a2230', ln: '#2a2230' },
    [TIPK]:  { r: ['#12141c', '#181c26', '#202532', '#2c3242', '#3c4456'], od: '#08090e', ol: '#10121a', ln: '#0c0e14' },
  });
  const GLOSSY = { [BULB]: 1 };
  const C_SKIN = code(SKIN), C_BAND = code(BAND), C_BLACK = code(BLACK), C_RED = code(RED), C_YEL = code(YEL), C_BULB = code(BULB), C_WING = code(WING);
  const C_EYEY = code(EYEY), C_EYE = code(EYE), C_MOUTH = code(MOUTH), C_TIPK = code(TIPK), C_SKIN_D = code(SKIN, -1);
  const M_BLACK = () => C_BLACK, M_RED = () => C_RED, M_SKIN = () => C_SKIN, M_YEL = () => C_YEL, M_TIPK = () => C_TIPK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (f, c, ax, r, part, grp, mat) => E(inF(f, c), M3.mul(f.L, M3.mul(M3.cols(ax[0], ax[1], ax[2]), M3.diag(r[0], r[1], r[2]))), part, grp, mat);
  // ellipsoid from p0 to p1 (local y along the segment), cross radii rx, rz; ext = extra half-length
  function seg(p0, p1, rx, rz, part, grp, mat, ext = 0) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(rx, l / 2 + ext, rz)), part, grp, mat);
  }

  // smooth tube shading for segment chains (local y = axis): shade with the radial normal so the
  // beads of a tube don't read as rings (light captured per render)
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74];
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  function tubeSeg(p0, p1, r, part, grp, m, ext) {
    const q = seg(p0, p1, r, r, part, grp, null, ext);
    q.mat = (s) => {
      const Lv = q.Lv, Li = q.Li;
      let ix = Lv[0] * s[0] + Lv[2] * s[2], iy = Lv[3] * s[0] + Lv[5] * s[2], iz = Lv[6] * s[0] + Lv[8] * s[2];
      const li = Math.hypot(ix, iy, iz) || 1;
      const ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
      const la = Math.hypot(ax, ay, az) || 1;
      const tI = tone((ix * LD[0] + iy * LD[1] + iz * LD[2]) / li), tA = tone((ax * LD[0] + ay * LD[1] + az * LD[2]) / la);
      return code(m, clamp(tI - tA, -2, 4));
    };
    return q;
  }

  /* ---------- body layout (torso frame, before lean) ---------- */
  const HEAD_C = [9, 96, 0], HEAD_R = [18, 19, 20];
  const CHEST_C = [2, 64, 0], CHEST_R = [17, 17, 19];
  const ABD_C = [-6, 38, 0], ABD_R = [27, 27, 28];
  const BULB_C = [-37, 16, 0], BULB_R = 15;
  // black body; the front is striped blue-grey / yellow (bands in torso y)
  const BANDS = [[27, 34.5], [43, 50.5]];
  function torsoMat(c, r, ang, frontK) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return (s) => {
      // torso-frame point (undo the primitive's own rotation)
      const lx = r[0] * s[0], ly = r[1] * s[1];
      const x = c[0] + ca * lx - sa * ly, y = c[1] + sa * lx + ca * ly, z = r[2] * s[2];
      const front = x - c[0] + 0.3 * (y - c[1]) > frontK * r[0] + 0.16 * Math.abs(z) * (1 + 0.5 * Math.abs(z) / r[2]);
      if (!front) return C_BLACK;
      for (const b of BANDS) if (y > b[0] && y < b[1]) return C_YEL;
      return C_BAND;
    };
  }

  /* ---------- face ---------- */
  const EYE_AZ = 0.52, EYE_V = 0.14, EYE_R = [5.4, 5.6, 2.4];
  let curScale = 1;
  function eyeMat(kind, side) {
    return (s) => {
      const x = s[0] * side, y = s[1];
      const px = 1 / (curScale * EYE_R[1]);
      if (kind === 'closed' || kind === 'happy') {
        const yc = kind === 'happy' ? -0.3 + 0.7 * (1 - x * x) : 0.1 - 0.5 * (1 - x * x);
        return Math.abs(y - yc) < Math.max(0.12, 0.62 * px) && Math.abs(x) < 0.86 ? C_EYE : C_SKIN;
      }
      // heavy upper lid (Volbeat's stern look); 'blink' nearly shut
      const lid = kind === 'blink' ? -0.25 : 0.2 + 0.14 * x;
      if (y > lid + Math.max(0.14, 0.9 * px)) return C_SKIN_D;
      if (y > lid) return C_EYE;
      if (y < -0.72 + 0.1 * x * x) return C_EYE;
      const pr = Math.max(0.3, 1.05 * px);
      const qx = (x - 0.2) / pr, qy = (y + (kind === 'blink' ? 0.5 : 0.12)) / (pr * 1.25);
      return qx * qx + qy * qy < 1 ? C_EYE : C_EYEY;
    };
  }
  function headMat(mo) {
    return (s) => {
      // small frown (∩) under the nose; opens into a little "o"
      if (s[0] > 0.7 && Math.abs(s[2]) < 0.3) {
        const k = s[2] / 0.22;
        if (Math.abs(k) < 1) {
          const yc = -0.46 + 0.08 * (1 - k * k) - 0.06 * mo;
          const h = Math.max(0.035, 0.5 / (curScale * HEAD_R[1])) + 0.12 * mo * (1 - k * k);
          if (Math.abs(s[1] - yc) < h) return C_MOUTH;
        }
      }
      return C_SKIN;
    };
  }

  /* ---------- red roll (hood): from Volbeat's right temple over the top, down the left side,
     curling forward under the chin. Head-frame path; angle a in the y-z plane
     (0 = top, π/2 = Volbeat's left (−z), π = under the chin) ---------- */
  const ROLL_A0 = -0.95, ROLL_A1 = Math.PI + 0.95, ROLL_N = 22;
  const rollR = (t) => 7 + 4 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 1.05)) + 0.9 * Math.max(0, t - 0.8) * 5;
  const rollPt = (a, r) => {
    const sa = Math.sin(a), ca = Math.cos(a);
    const R0 = 18.5 + 0.55 * r + 4 * Math.max(0, sa);
    // behind the face on top / at the side, swinging forward under the chin
    const x = -7 + 26 * Math.max(0, -ca) ** 1.3 + 2.5 * Math.max(0, sa);
    return [x, 1 + R0 * ca, -R0 * sa];
  };

  /* ---------- antennae: up, one curl outward, black band and tip ---------- */
  function antPts(side) {
    const pts = [];
    for (let i = 0; i <= 5; i++) pts.push([1.5 - i * 0.7, i * 7, side * i * 1.3]);
    const c = [-3, 42, side * 18];
    for (let i = 1; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI * 1.55;
      pts.push([c[0] + 1.5 * Math.sin(a), c[1] - 11 * Math.sin(a), c[2] + side * 11 * Math.cos(a)]);
    }
    const last = pts[pts.length - 1];
    pts.push([last[0] - 0.5, last[1] + 7, last[2] + side * 1.5], [last[0] - 1, last[1] + 15, last[2] + side * 2.5]);
    return pts;
  }
  const ANT_BLACK = (i, n) => i >= n - 2 || i === 7 || i === 8; // tip + a band where the loop starts

  /* ---------- wings (plates): rounded, pointed leaves ---------- */
  const WING_G = bakeShape(Shape2D.poly([[0, -4], [8, -8], [20, -10], [32, -8], [40, -2], [38, 5], [28, 9], [14, 8], [0, 4]], C_WING, 8));
  const WING2_G = bakeShape(Shape2D.poly([[0, -3], [8, -6], [18, -7], [27, -4], [29, 1], [22, 5], [10, 5], [0, 3]], C_WING, 8));
  const WING_VEIN = [[[2, 0], [16, -1], [30, -2], [38, 0]]].map((pl) => ({ pts: Shape2D.catmull(pl, false, 4).map(([u, v]) => [u, v, 0]), mat: WING, useLn: true }));

  const SIZE = 0.8;
  const DEFAULT = { flap: 0, arms: 0, armN: null, armF: null, glow: 0, lean: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 1, 3: 3, 4: 3, 5: 2, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 2, 15: 3, 16: 3, 17: 4, 18: 4, 20: 1, 21: 1, 22: 1, 23: 1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const lean = clamp(P.lean, -1, 1);
    const body = chain(T(0, 30, 0), R(M3.rz(-0.12 - 0.22 * lean)), T(0, -30, 0));
    const headF = chain(body, T(...HEAD_C), R(M3.rz(0.1 + 0.12 * lean)));

    // --- head, nose, eyes
    const mo = clamp(P.mouth, 0, 1);
    const headPrim = ellF(headF, HEAD_R, 1, 1, headMat(mo));
    prims.push(headPrim);
    prims.push(ellF(chain(headF, T(HEAD_R[0] * 0.94, -3.5, 0)), [3.6, 3.4, 4], 2, 2, M_SKIN));
    const kind = P.eyes;
    for (const side of [1, -1]) {
      const s0 = Creature.sph(side * EYE_AZ, EYE_V);
      const pS = [HEAD_R[0] * s0[0], HEAD_R[1] * s0[1], HEAD_R[2] * s0[2]];
      const n = nrm([s0[0] / HEAD_R[0], s0[1] / HEAD_R[1], s0[2] / HEAD_R[2]]);
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = cross(ye, n);
      const flat = kind === 'happy' || kind === 'closed';
      const id = side > 0 ? 3 : 4;
      prims.push(ellAx(headF, sub(pS, sc(n, flat ? 1.7 : 1.0)), [xe, ye, n], EYE_R, id, flat ? 1 : id, eyeMat(kind, side)));
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = inF(headF, pS);
    }
    anchors.mouth = inF(headF, [HEAD_R[0] * 0.88, -HEAD_R[1] * 0.46, 0]);
    anchors.head = headF.t;

    // --- red roll (thick tube of beads, rounded cap at the chin end)
    {
      let prev = null;
      for (let i = 0; i <= ROLL_N; i++) {
        const t = i / ROLL_N, r = rollR(t);
        const p = inF(headF, rollPt(lerp(ROLL_A0, ROLL_A1, t), r));
        if (prev) prims.push(tubeSeg(prev, p, r, 5, 5, RED, r * 0.7));
        prev = p;
      }
    }

    // --- antennae
    for (const side of [1, -1]) {
      const root = inF(headF, [0, HEAD_R[1] + 4, side * 5.5]);
      const pts = antPts(side).map((q) => add(root, M3.v(headF.L, q)));
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const blk = ANT_BLACK(i, n);
        prims.push(seg(pts[i], pts[i + 1], 2.1, 2.1, side > 0 ? 7 : 8, side > 0 ? 7 : 8, blk ? M_TIPK : M_YEL, 1.0));
      }
      anchors[side > 0 ? 'antN' : 'antF'] = pts[n];
    }

    // --- torso, bulb
    prims.push(ellF(chain(body, T(...CHEST_C), R(M3.rz(-0.1))), CHEST_R, 6, 6, torsoMat(CHEST_C, CHEST_R, -0.1, 0.12)));
    prims.push(ellF(chain(body, T(...ABD_C), R(M3.rz(0.32))), ABD_R, 6, 6, torsoMat(ABD_C, ABD_R, 0.32, 0.18)));
    const bulbF = chain(body, T(...BULB_C));
    // glowing core: the bulb's lit face is a paler spot
    prims.push(ellF(bulbF, [BULB_R, BULB_R * 0.94, BULB_R * 0.98], 9, 9, (s) => code(BULB, s[0] < -0.35 && s[1] > -0.2 ? 1 : 0)));
    anchors.tail = bulbF.t;
    anchors.body = inF(body, [0, 46, 0]);

    // --- arms: thick red shoulder ring, stubby black arm tapering to a point
    const aN = P.armN == null ? P.arms : P.armN, aF = P.armF == null ? P.arms : P.armF;
    [1, -1].forEach((side) => {
      const a = clamp(side > 0 ? aN : aF, -1, 1);
      const sh = inF(body, [8, 65, side * 17]);
      // direction: hanging (−1) → forward (0) → raised (1)
      const th = a < 0 ? lerp(-0.3, -1.3, -a) : lerp(-0.3, 1.4, a);
      const d = nrm(M3.v(body.L, [Math.cos(th) * 0.75, Math.sin(th), side * (0.75 - 0.2 * Math.max(0, a))]));
      const id = side > 0 ? 10 : 11;
      prims.push(seg(add(sh, sc(d, 1)), add(sh, sc(d, 4.5)), 7.4, 7.4, id + 2, id + 2, M_RED, 1.4));
      const elbow = add(sh, sc(d, 13));
      prims.push(seg(add(sh, sc(d, 3)), elbow, 6.2, 6.2, id, id, M_BLACK, 2.5));
      // forearm bends up a little and tapers to a point
      const d2 = nrm(add(d, M3.v(body.L, [0.35, 0.7 + 0.3 * Math.max(0, -a), -side * 0.55])));
      const tip = add(elbow, sc(d2, 12));
      prims.push(seg(elbow, tip, 5, 5, id, id, M_BLACK, 1.5));
      prims.push(seg(add(elbow, sc(d2, 7)), add(tip, sc(d2, 4)), 2.8, 2.8, id, id, M_BLACK, 1.5));
      anchors[side > 0 ? 'handN' : 'handF'] = add(tip, sc(d2, 5));
    });

    // --- legs: thick red hip ring, short black cone to a pointed foot
    [1, -1].forEach((side) => {
      const hip = inF(body, [4, 19, side * 12]);
      const d = nrm(M3.v(body.L, [0.4, -1, side * 0.18]));
      const id = side > 0 ? 15 : 16;
      prims.push(seg(add(hip, sc(d, 0)), add(hip, sc(d, 4)), 7.4, 7.4, id + 2, id + 2, M_RED, 1.2));
      const knee = add(hip, sc(d, 11));
      prims.push(seg(add(hip, sc(d, 2)), knee, 6.4, 6.4, id, id, M_BLACK, 2));
      const d2 = nrm(add(d, [0.45, 0.05, 0]));
      prims.push(seg(knee, add(knee, sc(d2, 7)), 4.4, 4.4, id, id, M_BLACK, 1.5));
      prims.push(seg(add(knee, sc(d2, 5)), add(knee, sc(d2, 12)), 2.4, 2.4, id, id, M_BLACK, 1.2));
      anchors[side > 0 ? 'footN' : 'footF'] = add(knee, sc(d2, 13));
    });

    // --- wings: two pairs from the back at the shoulders (flap sweeps them up/back)
    const fl = clamp(P.flap, -1, 1);
    [1, -1].forEach((side) => {
      const root = inF(body, [-14, 62, side * 6]);
      const mk = (yaw, pitch, roll, shape, id, sz) => {
        const Rw = M3.mul(body.L, M3.mul(M3.ry(side * yaw), M3.mul(M3.rz(pitch), M3.rx(side * roll))));
        // plate u axis points back (−x), so the leaf trails behind
        const L = M3.mul(Rw, M3.cols([-sz, 0, 0], [0, sz, 0], [0, 0, -1]));
        const w = PL(root, L, id, id, shape, 1.4);
        w.lines = WING_VEIN;
        prims.push(w);
        return L;
      };
      const L1 = mk(0.6 - 0.25 * fl, -0.15 + 0.75 * fl, 0.75 + 0.35 * fl, WING_G, side > 0 ? 20 : 21, 1.15);
      mk(0.75 - 0.2 * fl, -0.75 + 0.6 * fl, 0.95 + 0.3 * fl, WING2_G, side > 0 ? 22 : 23, 1.1);
      anchors[side > 0 ? 'wingTipN' : 'wingTipF'] = add(root, M3.v(L1, [40, 0, 0]));
    });

    anchors.top = inF(headF, [0, HEAD_R[1] + 56, 0]);
    // uniform scale to the Pokédex height (0.7 m ≈ 122 units)
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: SKIN, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0) {
      // emissive: mix the (graded) bulb ramp toward the ungraded glow ramp
      const pal = opt.pal || PAL, e = pal[BULB], G = PAL[GLOW];
      const bulb = { r: e.r.map((c, i) => PX.mix(c, G.r[i], g)), od: PX.mix(e.od, G.od, g), ol: PX.mix(e.ol, G.ol, g), ln: PX.mix(e.ln, G.ln, g) };
      opt = Object.assign({}, opt, { pal: Object.assign({}, pal, { [BULB]: bulb }) });
    }
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 170, bh: 170, oy: 0.86 } };
})();
