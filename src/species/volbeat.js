/* ------------------------------------------------------------------
   Volbeat — the Firefly Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (= Volbeat's
   right), y = 0 under the pointed feet (it hovers: the game lifts it).

   Design (official art / HOME model): a big blue-grey face with half-lidded
   yellow eyes, a round nose and a small frown; a thick red roll wraps from
   the top of the head around its left side and curls under the chin; two
   curly yellow antennae with black bands; a hunched black body with a
   blue-grey front crossed by two yellow bands; red rings where the pointed
   black arms and legs join; pale translucent-looking wings; a round yellow
   tail bulb that glows.

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
------------------------------------------------------------------- */
const Volbeat = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SKIN = 1, BLACK = 2, RED = 3, YEL = 4, BULB = 5, GLOW = 6, WING = 7, EYEY = 8, EYE = 9, MOUTH = 10, TIPK = 11;
  const MAT = { SKIN, BLACK, RED, YEL, BULB, GLOW, WING, EYEY, EYE, MOUTH, TIPK };
  const PAL = Creature.palette({
    [SKIN]:  { r: ['#5e7ea6', '#7c9cc4', '#9dbde2', '#bfd6f0', '#e2eefc'], od: '#26385a', ol: '#4c6690', ln: '#476088' },
    [BLACK]: { r: ['#161e28', '#1e2833', '#28343f', '#384854', '#4e606e'], od: '#0a0e14', ol: '#141c26', ln: '#0e141c' },
    [RED]:   { r: ['#9c0a2c', '#c80a36', '#ec1646', '#ff4a6a', '#ff90a2'], od: '#50041a', ol: '#8a0828', ln: '#7a0624' },
    [YEL]:   { r: ['#c08a1c', '#e0b030', '#f6d446', '#fde87a', '#fff6c0'], od: '#6a4a0a', ol: '#a47e1e', ln: '#9a741a' },
    [BULB]:  { r: ['#c08a1c', '#e0b030', '#f6d446', '#fde87a', '#fff6c0'], od: '#6a4a0a', ol: '#a47e1e', ln: '#9a741a' },
    [GLOW]:  { r: ['#f6d24a', '#fbe476', '#fff2a6', '#fffad4', '#ffffff'], od: '#b88a1a', ol: '#e0b43a', ln: '#e0b43a' },
    [WING]:  { r: ['#8e9ac4', '#aab6dc', '#c6d0ee', '#dde5fa', '#f2f6ff'], od: '#4a5686', ol: '#7482b0', ln: '#8a96c0' },
    [EYEY]:  { r: ['#c89a1c', '#e8bc2c', '#fbdc3e', '#ffec7c', '#fff8c4'], od: '#1a1c24', ol: '#2a2c34', ln: '#1a1c24' },
    [EYE]:   { r: ['#0a0c12', '#0e1118', '#12161e', '#1a1f28', '#242a36'], od: '#06080c', ol: '#06080c', ln: '#06080c' },
    [MOUTH]: { r: ['#2a2230', '#382c3c', '#46384a', '#56465a', '#68566a'], od: '#18121c', ol: '#2a2230', ln: '#2a2230' },
    [TIPK]:  { r: ['#12161e', '#181e28', '#202834', '#2c3644', '#3c4858'], od: '#080a0e', ol: '#10141a', ln: '#0c1016' },
  });
  const GLOSSY = { [BULB]: 1 };
  const C_SKIN = code(SKIN), C_BLACK = code(BLACK), C_RED = code(RED), C_YEL = code(YEL), C_BULB = code(BULB), C_WING = code(WING);
  const C_EYEY = code(EYEY), C_EYE = code(EYE), C_MOUTH = code(MOUTH), C_TIPK = code(TIPK), C_SKIN_D = code(SKIN, -1);
  const M_BLACK = () => C_BLACK, M_RED = () => C_RED, M_SKIN = () => C_SKIN, M_BULB = () => C_BULB, M_YEL = () => C_YEL, M_TIPK = () => C_TIPK;

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
  const HEAD_C = [9, 89, 0], HEAD_R = [22, 23, 25];
  const CHEST_C = [3, 52, 0], CHEST_R = [17, 19, 17.5];
  const ABD_C = [-8, 33, 0], ABD_R = [18.5, 16, 17];
  const BULB_C = [-23, 22, 0], BULB_R = 12;
  // blue-grey front with two yellow bands; black back
  function torsoMat(c, r) {
    return (s) => {
      const x = c[0] + r[0] * s[0], y = c[1] + r[1] * s[1];
      const front = x + 0.28 * (y - 40) > -2 + 0.18 * Math.abs(r[2] * s[2]);
      if (!front) return C_BLACK;
      if (Math.abs(y - 57) < 3.4 || Math.abs(y - 36) < 3.4) return C_YEL;
      return C_SKIN;
    };
  }

  /* ---------- face ---------- */
  const EYE_AZ = 0.5, EYE_V = 0.12, EYE_R = [5.4, 5.8, 2.4];
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
      const lid = kind === 'blink' ? -0.25 : 0.18 + 0.12 * x;
      if (y > lid + Math.max(0.14, 0.9 * px)) return C_SKIN_D;
      if (y > lid) return C_EYE;
      const pr = Math.max(0.3, 1.1 * px);
      const qx = (x - 0.38) / pr, qy = (y + (kind === 'blink' ? 0.5 : 0.18)) / (pr * 1.2);
      return qx * qx + qy * qy < 1 ? C_EYE : C_EYEY;
    };
  }
  function headMat(mo) {
    return (s) => {
      // small frown (∩) under the nose; opens into a little "o"
      if (s[0] > 0.7 && Math.abs(s[2]) < 0.3) {
        const k = s[2] / 0.24;
        if (Math.abs(k) < 1) {
          const yc = -0.42 - 0.08 * k * k - 0.06 * mo;
          const h = Math.max(0.035, 0.5 / (curScale * HEAD_R[1])) + 0.12 * mo * (1 - k * k);
          if (Math.abs(s[1] - yc) < h) return C_MOUTH;
        }
      }
      return C_SKIN;
    };
  }

  /* ---------- red roll around the head: from the top (right side) around the left side, under the chin ---------- */
  const ROLL_A0 = -0.55, ROLL_A1 = Math.PI + 1.05, ROLL_N = 16;
  const rollPt = (a) => {
    // angle a in the head's y-z plane: 0 = top, π/2 = Volbeat's left (−z), π = under the chin
    const R0 = 23.5 + 2.5 * Math.sin(a) * (Math.sin(a) > 0 ? 1 : 0.3);
    const x = -5 + 13 * Math.max(0, -Math.cos(a)) ** 1.4 + 3 * Math.max(0, Math.sin(a));
    return [HEAD_C[0] + x, HEAD_C[1] + 2 + R0 * Math.cos(a), HEAD_C[2] - R0 * Math.sin(a)];
  };
  const rollR = (t) => 6.2 + 3.6 * Math.sin(Math.PI * Math.min(1, t * 1.15));

  /* ---------- antennae: up, one curl outward, black bands ---------- */
  function antPts(side) {
    const pts = [];
    // stem (up), then a loop of radius 7.5 in a plane facing forward, curling outward
    for (let i = 0; i <= 4; i++) pts.push([1.5 - i * 0.5, i * 6.2, side * i * 1.1]);
    const c = [-1, 31, side * 14.5];
    for (let i = 1; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI * 1.6;
      pts.push([c[0] + 1.5 * Math.sin(a), c[1] - 9.5 * Math.sin(a), c[2] + side * 9.5 * Math.cos(a)]);
    }
    const last = pts[pts.length - 1];
    pts.push([last[0] - 0.5, last[1] + 6, last[2] + side * 2.5], [last[0] - 1, last[1] + 12, last[2] + side * 4]);
    return pts;
  }
  const ANT_BLACK = (i, n) => i >= n - 2 || i === n - 6 || i === n - 7; // tip + one band

  /* ---------- wings (plates): rounded leaf ---------- */
  const WING_G = bakeShape(Shape2D.poly([[0, -4], [10, -9], [24, -11], [36, -8], [42, 0], [38, 7], [26, 10], [12, 9], [0, 4]], C_WING, 8));

  const SIZE = 0.8;
  const DEFAULT = { flap: 0, arms: 0, armN: null, armF: null, glow: 0, lean: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 1, 3: 3, 4: 3, 5: 2, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 3, 13: 2, 14: 2, 15: 3, 16: 3, 20: 1, 21: 1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const lean = clamp(P.lean, -1, 1);
    const body = chain(T(0, 30, 0), R(M3.rz(-0.18 - 0.22 * lean)), T(0, -30, 0));
    const headF = chain(body, T(...HEAD_C), R(M3.rz(0.16 + 0.12 * lean)));

    // --- head, nose, eyes
    const mo = clamp(P.mouth, 0, 1);
    const headPrim = ellF(headF, HEAD_R, 1, 1, headMat(mo));
    prims.push(headPrim);
    prims.push(ellF(chain(headF, T(HEAD_R[0] * 0.93, -3.5, 0)), [4.4, 4, 4.8], 2, 2, M_SKIN));
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
    anchors.mouth = inF(headF, [HEAD_R[0] * 0.9, -HEAD_R[1] * 0.42, 0]);
    anchors.head = headF.t;

    // --- red roll (thick tube of beads)
    {
      let prev = null;
      for (let i = 0; i <= ROLL_N; i++) {
        const t = i / ROLL_N;
        const p = inF(body, rollPt(lerp(ROLL_A0, ROLL_A1, t)));
        if (prev) {
          const r = rollR(t);
          prims.push(tubeSeg(prev, p, r, 5, 5, RED, r * 0.7));
        }
        prev = p;
      }
    }

    // --- antennae
    for (const side of [1, -1]) {
      const root = inF(headF, [2, HEAD_R[1] - 2, side * 6.5]);
      const pts = antPts(side).map((q) => add(root, M3.v(headF.L, q)));
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const blk = ANT_BLACK(i, n);
        prims.push(seg(pts[i], pts[i + 1], 1.9, 1.9, side > 0 ? 7 : 8, side > 0 ? 7 : 8, blk ? M_TIPK : M_YEL, 0.9));
      }
      anchors[side > 0 ? 'antN' : 'antF'] = pts[n];
    }

    // --- torso, bulb
    prims.push(ellF(chain(body, T(...CHEST_C), R(M3.rz(-0.15))), CHEST_R, 6, 6, torsoMat(CHEST_C, CHEST_R)));
    prims.push(ellF(chain(body, T(...ABD_C), R(M3.rz(0.35))), ABD_R, 6, 6, torsoMat(ABD_C, ABD_R)));
    const bulbF = chain(body, T(...BULB_C));
    prims.push(ellF(bulbF, [BULB_R, BULB_R * 0.95, BULB_R], 9, 9, M_BULB));
    anchors.tail = bulbF.t;
    anchors.body = inF(body, [0, 44, 0]);

    // --- arms: red shoulder ring, black arm tapering to a point
    const aN = P.armN == null ? P.arms : P.armN, aF = P.armF == null ? P.arms : P.armF;
    [1, -1].forEach((side) => {
      const a = clamp(side > 0 ? aN : aF, -1, 1);
      const sh = inF(body, [5, 60, side * 15.5]);
      // direction: hanging (−1) → forward (0) → raised (1)
      const th = a < 0 ? lerp(-0.35, -1.35, -a) : lerp(-0.35, 1.45, a);
      const d = nrm(M3.v(body.L, [Math.cos(th) * 0.75, Math.sin(th), side * (0.55 - 0.15 * Math.max(0, a))]));
      const id = side > 0 ? 10 : 11;
      prims.push(seg(sh, add(sh, sc(d, 4)), 6.4, 6.4, id + 2, id + 2, M_RED, 1.2));
      const elbow = add(sh, sc(d, 12));
      prims.push(seg(add(sh, sc(d, 2)), elbow, 5.2, 5.2, id, id, M_BLACK, 2));
      // forearm bends up a little and ends in a point
      const d2 = nrm(add(d, M3.v(body.L, [0.35, 0.75 + 0.3 * Math.max(0, -a), -side * 0.45])));
      const tip = add(elbow, sc(d2, 14));
      prims.push(seg(elbow, tip, 4.8, 4.8, id, id, M_BLACK, 1));
      prims.push(seg(add(elbow, sc(d2, 9)), add(tip, sc(d2, 4)), 3, 3, id, id, M_BLACK, 1.5));
      anchors[side > 0 ? 'handN' : 'handF'] = add(tip, sc(d2, 5));
    });

    // --- legs: red hip ring, black leg, pointed foot
    [1, -1].forEach((side) => {
      const hip = inF(body, [-2, 22, side * 9]);
      const d = nrm(M3.v(body.L, [0.35, -1, side * 0.12]));
      const id = side > 0 ? 15 : 16;
      prims.push(seg(add(hip, sc(d, 1)), add(hip, sc(d, 5)), 6.2, 6.2, id - 2, id - 2, M_RED, 1));
      const knee = add(hip, sc(d, 13));
      prims.push(seg(add(hip, sc(d, 3)), knee, 5.4, 5.4, id, id, M_BLACK, 2));
      const d2 = nrm(add(d, [0.5, 0.1, 0]));
      prims.push(seg(knee, add(knee, sc(d2, 12)), 4, 4, id, id, M_BLACK, 1.5));
      anchors[side > 0 ? 'footN' : 'footF'] = add(knee, sc(d2, 13));
    });

    // --- wings (from the back at the shoulders; flap sweeps them up/back)
    const fl = clamp(P.flap, -1, 1);
    [1, -1].forEach((side) => {
      const root = inF(body, [-9, 62, side * 7]);
      const Rw = M3.mul(body.L, M3.mul(M3.ry(side * (0.55 - 0.25 * fl)), M3.mul(M3.rz(-0.5 + 0.75 * fl), M3.rx(side * (0.85 + 0.35 * fl)))));
      // plate u axis points back (−x), so the leaf trails behind
      const L = M3.mul(Rw, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1]));
      prims.push(PL(root, L, 20 + (side > 0 ? 0 : 1), 20 + (side > 0 ? 0 : 1), WING_G, 1.4));
      anchors[side > 0 ? 'wingTipN' : 'wingTipF'] = add(root, M3.v(L, [40, 0, 0]));
    });

    anchors.top = inF(headF, [0, HEAD_R[1] + 42, 0]);
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
