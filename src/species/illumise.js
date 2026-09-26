/* ------------------------------------------------------------------
   Illumise — the Firefly Pokémon (0.6 m ≈ 105 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, y = 0 under
   the pointed feet (it hovers: the game lifts it).

   Design (official art / HOME model): a big light-blue face framed by a
   lavender hair roll that arches over the head and ends in a big curl on
   each cheek; large blue eyes with purple eyeshadow at the outer corners,
   a tiny nose and a small smile; two small yellow leaf-shaped antennae;
   an upright dark-grey body with a blue belly panel (two segment lines)
   under a scalloped yellow bib; lavender bands at the shoulders and hips;
   pointed dark limbs; small pale wings; three yellow spots on the rear.
   No glowing tail (that's Volbeat).

   Pose parameters (all optional):
     flap   −1..1    wing beat (−1 wings down/forward, 1 up/back)
     arms   −1..1    both arms (−1 hanging, 0 held in front, 1 raised)
     armN, armF      optional per-arm override of `arms`
     lean   −1..1    body pitch (+ = leaning forward)
     mouth  0..1     smile opens
     eyes   'open' | 'happy' | 'closed' | 'blink'
     side   −1..1    ≈ cos(yaw), passed in by the game (unused)
------------------------------------------------------------------- */
const Illumise = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SKIN = 1, DARK = 2, LAV = 3, YEL = 4, WING = 5, EYEW = 6, IRIS = 7, PUPIL = 8, MOUTH = 9, LINE = 10, BELLY = 11, SHADOW = 12;
  const MAT = { SKIN, DARK, LAV, YEL, WING, EYEW, IRIS, PUPIL, MOUTH, LINE, BELLY, SHADOW };
  const PAL = Creature.palette({
    [SKIN]:   { r: ['#2c84b6', '#46a6d6', '#66c4ec', '#8edffb', '#c6f3ff'], od: '#0e3e66', ol: '#2a70a4', ln: '#256a9c' },
    [BELLY]:  { r: ['#2c84b6', '#46a6d6', '#66c4ec', '#8edffb', '#c6f3ff'], od: '#0e3e66', ol: '#2a70a4', ln: '#1e5a88' },
    [DARK]:   { r: ['#262d33', '#353e45', '#465058', '#5c6870', '#7a8890'], od: '#12161a', ol: '#262d33', ln: '#1e2429' },
    [LAV]:    { r: ['#6a56a2', '#8672be', '#a592da', '#c3b2f0', '#e2d8ff'], od: '#342464', ol: '#5e4c96', ln: '#56448c' },
    [SHADOW]: { r: ['#6a56a2', '#7d68b8', '#9480d0', '#ad9ae6', '#c8b8f6'], od: '#342464', ol: '#5e4c96', ln: '#56448c' },
    [YEL]:    { r: ['#b89c26', '#d8bc3c', '#f1dc62', '#f9ec92', '#fff8cc'], od: '#5e4a0c', ol: '#98801e', ln: '#8c761c' },
    [WING]:   { r: ['#86a4c6', '#a2bede', '#bed6f0', '#d8e8fa', '#f0f8ff'], od: '#3e5a82', ol: '#6a88ae', ln: '#7c98bc' },
    [EYEW]:   { r: ['#c8d8e4', '#e2eef6', '#f8fcff', '#ffffff', '#ffffff'], od: '#0c2234', ol: '#16344c', ln: '#0c2234' },
    [IRIS]:   { r: ['#00507e', '#006ea4', '#0096d4', '#3cbcf0', '#94e0ff'], od: '#002238', ol: '#003a5a', ln: '#003a5a' },
    [PUPIL]:  { r: ['#081420', '#0c1a28', '#102232', '#162c40', '#1e3850'], od: '#040a10', ol: '#040a10', ln: '#040a10' },
    [MOUTH]:  { r: ['#0c3050', '#123c60', '#1a4a72', '#245a86', '#306c9a'], od: '#061c30', ol: '#0c3050', ln: '#0c3050' },
    [LINE]:   { r: ['#1e5a88', '#1e5a88', '#256a9c', '#2a74a8', '#3380b4'], od: '#0e3e66', ol: '#1e5a88', ln: '#1e5a88' },
  });
  const GLOSSY = {};
  const C_SKIN = code(SKIN), C_DARK = code(DARK), C_LAV = code(LAV), C_YEL = code(YEL), C_WING = code(WING), C_EYEW = code(EYEW);
  const C_IRIS = code(IRIS), C_PUPIL = code(PUPIL), C_MOUTH = code(MOUTH), C_LINE = code(LINE), C_BELLY = code(BELLY), C_SHADOW = code(SHADOW);
  const C_LAV_D = code(LAV, -1);
  const M_DARK = () => C_DARK, M_LAV = () => C_LAV, M_YEL = () => C_YEL, M_SKIN = () => C_SKIN;

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
  function seg(p0, p1, rx, rz, part, grp, mat, ext = 0) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(rx, l / 2 + ext, rz)), part, grp, mat);
  }
  // smooth tube shading for segment chains (see volbeat.js)
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74];
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  function tubeSeg(p0, p1, r, part, grp, m, ext) {
    const q = seg(p0, p1, r, r, part, grp, null, ext);
    q.mat = (s) => {
      const Lv = q.Lv, Li = q.Li;
      const ix = Lv[0] * s[0] + Lv[2] * s[2], iy = Lv[3] * s[0] + Lv[5] * s[2], iz = Lv[6] * s[0] + Lv[8] * s[2];
      const li = Math.hypot(ix, iy, iz) || 1;
      const ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
      const la = Math.hypot(ax, ay, az) || 1;
      const tI = tone((ix * LD[0] + iy * LD[1] + iz * LD[2]) / li), tA = tone((ax * LD[0] + ay * LD[1] + az * LD[2]) / la);
      return code(m, clamp(tI - tA, -2, 4));
    };
    return q;
  }

  /* ---------- body (torso frame) ---------- */
  const HEAD_C = [5, 80, 0], HEAD_R = [21, 23, 24.5];
  const TORSO_C = [0, 40, 0], TORSO_R = [15, 21, 16.5];
  let curScale = 1;
  function torsoMat(s) {
    const x = TORSO_C[0] + TORSO_R[0] * s[0], y = TORSO_C[1] + TORSO_R[1] * s[1], z = TORSO_R[2] * s[2];
    if (y < 24) return C_LAV; // hip band
    if (s[0] > 0.2) {
      // yellow bib with a scalloped lower edge, blue belly panel with two segment lines
      const az = Math.abs(z);
      const scal = 52.5 - 2.2 * Math.abs(Math.cos((z / 13) * Math.PI * 1.5));
      if (y > scal && az < 14.5) return C_YEL;
      if (az < 9.5 && y > 27 && y < scal) {
        const w = Math.max(0.55, 0.6 / curScale);
        if (Math.abs(az - 3.2) < w * 0.6) return C_LINE;
        return C_BELLY;
      }
    }
    if (s[0] < -0.45) {
      // three oblong yellow spots on the rear
      for (const zc of [-7.5, 0, 7.5]) if (((z - zc) / 2.6) ** 2 + ((y - 39) / 7) ** 2 < 1) return C_YEL;
    }
    return C_DARK;
  }

  /* ---------- face ---------- */
  const EYE_AZ = 0.45, EYE_V = 0.08, EYE_R = [7.4, 8.4, 2.6];
  function eyeMat(kind, side) {
    return (s) => {
      const x = s[0] * side, y = s[1];
      const px = 1 / (curScale * EYE_R[1]);
      if (kind === 'closed' || kind === 'happy') {
        const yc = kind === 'happy' ? -0.3 + 0.7 * (1 - x * x) : 0.1 - 0.5 * (1 - x * x);
        if (Math.abs(y - yc) < Math.max(0.12, 0.62 * px) && Math.abs(x) < 0.86) return C_PUPIL;
        return x > 0.3 && y > 0.25 ? C_SHADOW : C_SKIN;
      }
      // eyeshadow at the outer upper corner, dark upper lash line
      if (x > 0.35 && y > 0.3 - 0.35 * (x - 0.35)) return C_SHADOW;
      const lid = kind === 'blink' ? -0.1 : 0.62 - 0.15 * x;
      if (y > lid + Math.max(0.12, 0.8 * px)) return C_SKIN;
      if (y > lid) return C_PUPIL;
      const ir = ((x - 0.02) / 0.62) ** 2 + ((y + 0.06) / 0.7) ** 2;
      if (ir < 1) {
        if (curScale >= 0.55 && ((x + 0.2) / 0.2) ** 2 + ((y - 0.18) / 0.2) ** 2 < 1) return C_EYEW;
        const pr = ((x - 0.04) / Math.max(0.3, 1.1 * px)) ** 2 + ((y + 0.08) / 0.38) ** 2;
        return pr < 1 ? C_PUPIL : C_IRIS;
      }
      return C_EYEW;
    };
  }
  function headMat(mo) {
    return (s) => {
      // small smile (∪) under the tiny nose; opens with `mouth`
      if (s[0] > 0.7 && Math.abs(s[2]) < 0.3) {
        const k = s[2] / 0.24;
        if (Math.abs(k) < 1) {
          const yc = -0.4 + 0.08 * k * k;
          const h = Math.max(0.035, 0.5 / (curScale * HEAD_R[1]));
          if (mo > 0.05 && s[1] < yc && s[1] > yc - 0.2 * mo * (1 - k * k)) return C_MOUTH;
          if (Math.abs(s[1] - yc) < h) return C_MOUTH;
        }
      }
      return C_SKIN;
    };
  }
  // hair curls: a spiral groove on the outer face (local z = outward)
  function curlMat(s) {
    if (s[2] > 0.25) {
      const a = Math.atan2(s[1], s[0]), r = Math.hypot(s[0], s[1]);
      // Archimedean spiral r = (a + 2πk) / (2π · 1.6)
      let f = (r * 1.6 * 2 * Math.PI - a) / (2 * Math.PI);
      f -= Math.floor(f);
      if (r > 0.12 && r < 0.9 && Math.abs(f - 0.5) < Math.max(0.12, 0.35 / (curScale * 10))) return C_LAV_D;
    }
    return C_LAV;
  }

  /* ---------- wings (plates): small rounded leaf ---------- */
  const WING_G = bakeShape(Shape2D.poly([[0, -3.5], [8, -7.5], [19, -9], [29, -6], [33, 0], [29, 5.5], [19, 8], [8, 7], [0, 3.5]], C_WING, 8));

  const SIZE = 0.83;
  const DEFAULT = { flap: 0, arms: 0, armN: null, armF: null, lean: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 1, 3: 3, 4: 3, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1, 10: 3, 11: 3, 12: 3, 13: 3, 15: 3, 16: 3, 20: 1, 21: 1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const lean = clamp(P.lean, -1, 1);
    const body = chain(T(0, 26, 0), R(M3.rz(-0.22 * lean)), T(0, -26, 0));
    const headF = chain(body, T(...HEAD_C), R(M3.rz(0.1 * lean)));

    // --- head, nose, eyes
    const mo = clamp(P.mouth, 0, 1);
    prims.push(ellF(headF, HEAD_R, 1, 1, headMat(mo)));
    prims.push(ellF(chain(headF, T(HEAD_R[0] * 0.96, -3, 0)), [2.2, 2, 2.4], 2, 1, M_SKIN));
    const kind = P.eyes;
    for (const side of [1, -1]) {
      const s0 = Creature.sph(side * EYE_AZ, EYE_V);
      const pS = [HEAD_R[0] * s0[0], HEAD_R[1] * s0[1], HEAD_R[2] * s0[2]];
      const n = nrm([s0[0] / HEAD_R[0], s0[1] / HEAD_R[1], s0[2] / HEAD_R[2]]);
      // slanted: the outer corner lifts
      const up0 = nrm(sub([0, 1, 0], sc(n, n[1])));
      const tilt = side * 0.18;
      const xe0 = cross(up0, n);
      const ye = nrm(add(sc(up0, Math.cos(tilt)), sc(xe0, -Math.sin(tilt))));
      const xe = cross(ye, n);
      const flat = kind === 'happy' || kind === 'closed';
      const id = side > 0 ? 3 : 4;
      prims.push(ellAx(headF, sub(pS, sc(n, flat ? 1.8 : 1.1)), [xe, ye, n], EYE_R, id, flat ? 1 : id, eyeMat(kind, side)));
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = inF(headF, pS);
    }
    anchors.mouth = inF(headF, [HEAD_R[0] * 0.92, -HEAD_R[1] * 0.4, 0]);
    anchors.head = headF.t;

    // --- lavender hair: arch over the head + a big curl on each cheek
    {
      const N = 14, A0 = -1.75, A1 = 1.75;
      const pt = (a) => inF(headF, [-4 + 3 * Math.cos(a), 1 + 27 * Math.cos(a), -26.5 * Math.sin(a)]);
      let prev = pt(A0);
      for (let i = 1; i <= N; i++) {
        const p = pt(lerp(A0, A1, i / N));
        prims.push(tubeSeg(prev, p, 6.6, 5, 5, LAV, 4.5));
        prev = p;
      }
      for (const side of [1, -1]) {
        const c = inF(headF, [-1, -7, side * 25]);
        // curl disc facing outward (local z = outward)
        const L = M3.mul(headF.L, M3.mul(M3.cols([1, 0, 0], [0, 1, 0], [0, 0, side]), M3.diag(10.5, 11.5, 8)));
        prims.push(E(c, L, side > 0 ? 10 : 11, side > 0 ? 10 : 11, curlMat));
      }
    }

    // --- antennae: small yellow leaves pointing up and out
    for (const side of [1, -1]) {
      const root = inF(headF, [0, HEAD_R[1] + 3, side * 8]);
      const d = nrm(M3.v(headF.L, [0.15, 1, side * 0.55]));
      const tip = add(root, sc(d, 17));
      prims.push(seg(add(root, sc(d, 4)), tip, 3.6, 2.6, side > 0 ? 7 : 8, side > 0 ? 7 : 8, M_YEL, 0.5));
      anchors[side > 0 ? 'antN' : 'antF'] = tip;
    }

    // --- torso
    prims.push(ellF(chain(body, T(...TORSO_C)), TORSO_R, 6, 6, torsoMat));
    anchors.body = inF(body, TORSO_C);
    anchors.tail = inF(body, [-TORSO_R[0], 38, 0]);

    // --- arms: lavender shoulder band, dark pointed arm
    const aN = P.armN == null ? P.arms : P.armN, aF = P.armF == null ? P.arms : P.armF;
    [1, -1].forEach((side) => {
      const a = clamp(side > 0 ? aN : aF, -1, 1);
      const sh = inF(body, [1, 53, side * 14.5]);
      const th = a < 0 ? lerp(-0.6, -1.35, -a) : lerp(-0.6, 1.3, a);
      const d = nrm(M3.v(body.L, [Math.cos(th) * 0.55, Math.sin(th), side * (0.75 - 0.2 * Math.max(0, a))]));
      const id = side > 0 ? 12 : 13;
      prims.push(tubeSeg(add(sh, sc(d, -1)), add(sh, sc(d, 4)), 6.4, id + 3, id + 3, LAV, 1));
      const tip = add(sh, sc(d, 24));
      prims.push(seg(add(sh, sc(d, 2)), add(sh, sc(d, 15)), 5.4, 5.4, id, id, M_DARK, 2));
      prims.push(seg(add(sh, sc(d, 12)), tip, 3.8, 3.8, id, id, M_DARK, 2));
      anchors[side > 0 ? 'handN' : 'handF'] = tip;
    });

    // --- legs: dark, pointed feet (the lavender hip band is on the torso)
    [1, -1].forEach((side) => {
      const hip = inF(body, [0, 20, side * 8]);
      const d = nrm(M3.v(body.L, [0.12, -1, side * 0.1]));
      const id = side > 0 ? 15 : 16;
      const knee = add(hip, sc(d, 12));
      prims.push(seg(hip, knee, 6, 6, id, id, M_DARK, 2));
      const d2 = nrm(add(d, [0.45, 0.05, 0]));
      prims.push(seg(knee, add(knee, sc(d2, 10)), 4.4, 4.4, id, id, M_DARK, 1.5));
      anchors[side > 0 ? 'footN' : 'footF'] = add(knee, sc(d2, 11));
    });

    // --- wings
    const fl = clamp(P.flap, -1, 1);
    [1, -1].forEach((side) => {
      const root = inF(body, [-10, 55, side * 6]);
      const Rw = M3.mul(body.L, M3.mul(M3.ry(side * (0.6 - 0.25 * fl)), M3.mul(M3.rz(-0.35 + 0.7 * fl), M3.rx(side * (0.9 + 0.35 * fl)))));
      const L = M3.mul(Rw, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1]));
      prims.push(PL(root, L, 20 + (side > 0 ? 0 : 1), 20 + (side > 0 ? 0 : 1), WING_G, 1.4));
      anchors[side > 0 ? 'wingTipN' : 'wingTipF'] = add(root, M3.v(L, [32, 0, 0]));
    });

    anchors.top = inF(headF, [0, HEAD_R[1] + 18, 0]);
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: SKIN, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 150, bh: 150, oy: 0.88 } };
})();
