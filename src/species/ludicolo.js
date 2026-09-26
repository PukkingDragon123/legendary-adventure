/* ------------------------------------------------------------------
   Ludicolo — the Carefree Pokémon (1.5 m ≈ 262 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): an egg-shaped body of shaggy yellow
   fur with brown zigzag bands and a green zigzag-edged bottom, a green eye
   mask with white eyes, a big orange duck bill, a green lily-pad sombrero
   (a flat pad with an upturned serrated rim) with a brown stem and a spiky
   yellow tuft on top, big green mitten hands with two black palm lines and
   thick green legs with a black circle on each sole.

   Pose parameters (all optional):
     dance  radians   dance-cycle phase: hips sway, arms pump alternately,
                      knees lift in turn, body bobs and twists (a full cycle
                      = 2π; phase 0 is the neutral pose)
     groove 0..1      amplitude of the dance swing (default 1)
     hip    −1..1     static hip sway (+ = hips toward the near side, the
                      upper body leans away)
     armN, armF −1..1 arm raise, near / far arm (−1 hanging down, 0 out to
                      the side, 1 raised above the head, palms forward)
     legs   0..1      knee-lift height of the dance step (default 0.6)
     legN, legF 0..1  explicit knee lift of the near / far leg
     lean   −1..1     whole-body lean (+ forward, − back)
     mouth  0..1      beak open (1 = big happy open beak)
     eyes   'open' | 'happy' | 'closed' | 'blink'
     side   −1..1     ≈ cos(yaw), passed in by the game (unused)
------------------------------------------------------------------- */
const Ludicolo = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const FUR = 1, STRIPE = 2, GREEN = 3, GREEND = 4, BILL = 5, MOUTH = 6, TONGUE = 7, EYEW = 8, EYE = 9, DARK = 10, STEM = 11, TUFT = 12;
  const MAT = { FUR, STRIPE, GREEN, GREEND, BILL, MOUTH, TONGUE, EYEW, EYE, DARK, STEM, TUFT };
  const PAL = Creature.palette({
    [FUR]:    { r: ['#b58f3a', '#d8b552', '#f0d164', '#fbe68a', '#fff6c6'], od: '#6a4a14', ol: '#a07a28', ln: '#9a762c' },
    [STRIPE]: { r: ['#6a4838', '#86624e', '#a47e68', '#bc977f', '#d6b6a0'], od: '#46281c', ol: '#664434', ln: '#5e3e30' },
    [GREEN]:  { r: ['#4a7a2a', '#6a9e3a', '#8fc550', '#aee26a', '#d4f69c'], od: '#26461a', ol: '#467426', ln: '#44702a' },
    [GREEND]: { r: ['#355c20', '#4a7a2a', '#669c3a', '#84b84e', '#a6d46c'], od: '#1e3a12', ol: '#3a6420', ln: '#35591e' },
    [BILL]:   { r: ['#c0662a', '#e0883c', '#f6aa5a', '#ffc682', '#ffe2b4'], od: '#743410', ol: '#ad5c26', ln: '#a45424' },
    [MOUTH]:  { r: ['#44121a', '#621f26', '#7e2e33', '#9a3e42', '#b45252'], od: '#2c0810', ol: '#4a1218', ln: '#4a1218' },
    [TONGUE]: { r: ['#b24e50', '#cf6a66', '#e8847a', '#f8a498', '#ffc8bc'], od: '#6a1a22', ol: '#8e2a32', ln: '#a2403e' },
    [EYEW]:   { r: ['#cfd6cc', '#e8ede4', '#fbfdf8', '#ffffff', '#ffffff'], od: '#1c2a12', ol: '#2c4020', ln: '#1c2a12' },
    [EYE]:    { r: ['#0c1008', '#12180e', '#181f12', '#222a1a', '#303a26'], od: '#0a0e06', ol: '#0a0e06', ln: '#0a0e06' },
    [DARK]:   { r: ['#10180a', '#162010', '#1c2814', '#26341a', '#344424'], od: '#0a1006', ol: '#10180a', ln: '#10180a' },
    [STEM]:   { r: ['#4e3322', '#6a4830', '#876044', '#a47c58', '#c29c78'], od: '#2e1c10', ol: '#4e3322', ln: '#46301e' },
    [TUFT]:   { r: ['#a8862a', '#ccaa3c', '#ecca52', '#f8e27e', '#fff4bc'], od: '#5e4410', ol: '#94722a', ln: '#8a6a24' },
  });
  const GLOSSY = {};
  const C = (m, b = 0) => code(m, b);
  const C_FUR = C(FUR), C_STRIPE = C(STRIPE), C_GREEN = C(GREEN), C_GREEND = C(GREEND), C_BILL = C(BILL), C_BILL_D = C(BILL, -1);
  const C_MOUTH = C(MOUTH), C_TONGUE = C(TONGUE), C_EYEW = C(EYEW), C_EYE = C(EYE), C_DARK = C(DARK), C_STEM = C(STEM), C_STEM_L = C(STEM, 1), C_TUFT = C(TUFT);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  // prims as Mudkip-layout literals (keeps the shared renderer monomorphic)
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid with explicit (orthonormal, model-space) axes in a parent frame
  const ellAx = (f, c, ax, r, part, grp, mat) => E(inF(f, c), M3.mul(f.L, M3.mul(M3.cols(ax[0], ax[1], ax[2]), M3.diag(r[0], r[1], r[2]))), part, grp, mat);
  // ellipsoid spanning p0 → p1 (its local y axis), model-space points; `hint` = preferred local x direction
  function seg(p0, p1, rx, rz, part, grp, mat, hint = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = sub(hint, sc(Y, dot(hint, Y)));
    if (len3(X) < 1e-3) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  /* ---------- body (torso-local, axis aligned) ---------- */
  // egg = two half-ellipsoids sharing the equator (y = EQ): smooth join, wide bottom, narrower head
  const EQ = 96;
  const LOW = { c: [0, EQ, 0], r: [60, 68, 64] };
  const UP = { c: [0, EQ, 0], r: [60, 98, 64] };
  // zigzag bands (heights in torso space), teeth around the body
  const NZ = 9, ZA = 7, SW = 4.2;
  const STRIPES = [132, 88];
  const GREEN_Y = 52;
  const zig = (az) => { const t = (az * NZ) / (2 * Math.PI) + 0.25; const f = t - Math.floor(t); return 4 * Math.abs(f - 0.5) - 1; };
  // eye mask (front of the head, under the hat)
  const MASK_AZ = 0.98;
  const maskLow = (az) => 157 + 20 * (az / MASK_AZ) ** 2;
  function furMat(x, y, z, face) {
    const az = Math.atan2(z, x);
    if (face && Math.abs(az) < MASK_AZ && y > maskLow(az)) return C_GREEN;
    const zz = zig(az);
    if (y < GREEN_Y + ZA * zz) return C_GREEN;
    for (let i = 0; i < STRIPES.length; i++) if (Math.abs(y - (STRIPES[i] + ZA * zig(az + 0.35 * i))) < SW) return C_STRIPE;
    return C_FUR;
  }
  const lowMat = (s) => (s[1] > 0.02 ? 0 : furMat(LOW.c[0] + LOW.r[0] * s[0], LOW.c[1] + LOW.r[1] * s[1], LOW.c[2] + LOW.r[2] * s[2], false));
  const upMat = (s) => (s[1] < -0.02 ? 0 : furMat(UP.c[0] + UP.r[0] * s[0], UP.c[1] + UP.r[1] * s[1], UP.c[2] + UP.r[2] * s[2], true));

  // point + outward normal on the upper (head) ellipsoid at azimuth az, height y (torso space)
  function onHead(az, y) {
    const v = (y - UP.c[1]) / UP.r[1], h = Math.sqrt(Math.max(0, 1 - v * v));
    const s = [h * Math.cos(az), v, h * Math.sin(az)];
    const p = [UP.c[0] + UP.r[0] * s[0], UP.c[1] + UP.r[1] * s[1], UP.c[2] + UP.r[2] * s[2]];
    return { p, n: nrm([s[0] / UP.r[0], s[1] / UP.r[1], s[2] / UP.r[2]]), s };
  }

  /* ---------- eyes: small white eyeballs in the mask ---------- */
  const EYE_AZ = 0.36, EYE_Y = 177, EYE_R = [6.6, 9.8, 3.6];
  let curScale = 1;
  function eyeMat(kind, side) {
    return (s) => {
      const x = s[0] * side, y = s[1];
      if (kind === 'closed' || kind === 'happy') {
        // ∩ arc (happy) or ∪ arc (closed), about one pixel thick at any scale
        const yc = kind === 'happy' ? -0.3 + 0.7 * (1 - x * x) : 0.1 - 0.5 * (1 - x * x);
        const w = Math.max(0.1, 0.62 / (curScale * EYE_R[1]));
        return Math.abs(y - yc) < w && Math.abs(x) < 0.86 ? C_EYE : C_GREEN;
      }
      if (kind === 'blink' && y > -0.1) return y < -0.1 + Math.max(0.2, 1.2 / (curScale * EYE_R[1])) ? C_EYE : C_GREEN;
      // pupil (looks slightly forward and down), with a white glint
      const px = (x - 0.12) / 0.56, py = (y + 0.12) / 0.62;
      if (px * px + py * py < 1) {
        const gx = (x - 0.28) / 0.2, gy = (y - 0.12) / 0.2;
        return curScale >= 0.7 && gx * gx + gy * gy < 1 ? C_EYEW : C_EYE;
      }
      return C_EYEW;
    };
  }

  /* ---------- hat: pad disc + upturned serrated rim (ring of plates) ---------- */
  const HAT_R = 86, RIM_N = 18, RIM_H = 20, RIM_T = 16, RIM_FLARE = 0.52;
  const RIM_L = (2 * Math.PI * HAT_R) / RIM_N;
  const RIM_G = (() => {
    const hw0 = RIM_L / 2 + 0.8, k = Math.sin(RIM_FLARE) / HAT_R;
    const hw = (v) => hw0 * (1 + v * k);
    const H0 = RIM_H;
    const pts = [[-hw(-2), -2], [hw(-2), -2], [hw(H0), H0], [0, H0 + RIM_T], [-hw(H0), H0]];
    return bakeShape({
      bb: [-hw(H0 + RIM_T) - 0.5, -2.5, hw(H0 + RIM_T) + 0.5, H0 + RIM_T + 0.5],
      test: (u, v) => (Shape2D.inPoly(u, v, pts) ? (v < 3 ? C_GREEND : C_GREEN) : 0),
    });
  })();
  const padMat = (s) => (s[1] > 0 ? C_GREEN : C_GREEND);
  const stemMat = (s) => (s[1] > -0.05 && s[1] < 0.3 ? C_STEM_L : C_STEM);
  // tuft spikes (narrow triangles, u across, v along)
  const SPIKE_G = bakeShape(Shape2D.poly([[-5, 0], [-3.4, 9], [0, 31], [3.4, 9], [5, 0], [0, -3]], C_TUFT, 6));
  const SPIKE_S = bakeShape(Shape2D.poly([[-4, 0], [-2.8, 7], [0, 21], [2.8, 7], [4, 0], [0, -3]], C_TUFT, 6));
  const TUFTS = [
    { az: 0.3, el: 1.25, big: 1 }, { az: 1.5, el: 0.85, big: 1 }, { az: 2.6, el: 0.7, big: 1 }, { az: 3.6, el: 0.9, big: 1 },
    { az: 4.6, el: 0.75, big: 1 }, { az: 5.5, el: 0.95, big: 1 }, { az: 0.9, el: 0.55, big: 0 }, { az: 3.1, el: 1.4, big: 0 },
    { az: 5.0, el: 0.5, big: 0 },
  ];

  /* ---------- hands: palm with two black lines ---------- */
  const HAND_R = [11, 24, 19];
  function handMat(s) {
    // s: [palm normal, length, width]
    if (s[0] > 0.45 && s[1] > -0.2 && s[1] < 0.42) {
      const w = Math.abs(s[2]);
      if (Math.abs(w - 0.28) < 0.075) return C_DARK;
    }
    return C_GREEN;
  }
  const legMat = (s) => (s[1] < -0.8 && s[0] * s[0] + s[2] * s[2] < 0.22 ? C_DARK : C_GREEN);

  /* ---------- shaggy fur tufts (thin ellipsoids from a → b, torso space) ---------- */
  const M_FUR = () => C_FUR;
  const FUR_SPIKES = [
    { a: [-42, 60, 0], b: [-66, 30, 0], r: 8.5 },
    { a: [-42, 58, 17], b: [-58, 36, 24], r: 6.5 },
    { a: [-42, 58, -17], b: [-58, 36, -24], r: 6.5 },
    { a: [-30, 52, 34], b: [-40, 38, 46], r: 5.5 },
    { a: [-30, 52, -34], b: [-40, 38, -46], r: 5.5 },
    { a: [-10, 76, 54], b: [-18, 66, 66], r: 5 },
    { a: [-10, 76, -54], b: [-18, 66, -66], r: 5 },
  ];

  const SIZE = 1.035;
  const DEFAULT = { dance: 0, groove: 1, hip: 0, armN: 0.35, armF: 0.35, legs: 0.6, legN: 0, legF: 0, lean: 0, mouth: 0.2, eyes: 'open', side: 1 };

  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  Object.assign(PRI, { 2: 3, 3: 3, 4: 2, 5: 1, 6: 0, 7: 1, 8: 2, 9: 1, 10: 2, 11: 1, 12: 1, 13: 1, 14: 2, 15: 3, 16: 4, 17: -1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const g = clamp(P.groove, 0, 1);
    const ph = P.dance || 0;
    const s1 = Math.sin(ph);
    const sway = clamp(P.hip + g * s1, -1.4, 1.4);
    const bob = -3.5 * g * s1 * s1;
    const legLiftN = clamp(Math.max(P.legN, P.legs * Math.max(0, -s1)), 0, 1);
    const legLiftF = clamp(Math.max(P.legF, P.legs * Math.max(0, s1)), 0, 1);

    // torso: hula sway about the hips (hips shift toward the sway side, upper body leans away)
    const HIP_Y = 38;
    const torso = chain(
      T(0, bob, sway * 5),
      T(0, HIP_Y, 0), R(M3.rx(-sway * 0.16)), R(M3.ry(0.2 * g * Math.sin(ph))), R(M3.rz(-clamp(P.lean, -1, 1) * 0.2)), T(0, -HIP_Y, 0),
    );

    // --- body
    prims.push(ellF(chain(torso, T(...UP.c)), UP.r, 1, 1, upMat));
    prims.push(ellF(chain(torso, T(...LOW.c)), LOW.r, 1, 1, lowMat));

    // --- eyes
    const kind = P.eyes;
    for (const side of [1, -1]) {
      const h = onHead(side * EYE_AZ, EYE_Y);
      const n = h.n;
      const ye = nrm(sub([0, 1, 0], sc(n, n[1])));
      const xe = cross(ye, n);
      const id = side > 0 ? 2 : 3;
      const flat = kind === 'happy' || kind === 'closed';
      const eye = ellAx(torso, sub(h.p, sc(n, flat ? 2.6 : 1.6)), [xe, ye, n], EYE_R, id, flat ? 1 : id, eyeMat(kind, side));
      prims.push(eye);
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = inF(torso, h.p);
    }

    // --- bill: upper bill, lower bill (hinged at the face) and the mouth interior
    const mo = clamp(P.mouth, 0, 1);
    const HINGE = [37, 151, 0];
    const upF = chain(torso, T(...HINGE), R(M3.rz(0.28 * mo)));
    const upBill = ellF(chain(upF, T(24, 8, 0), R(M3.rz(-0.1))), [32, 11.5, 33], 4, 4, (s) => (s[1] < -0.55 && mo > 0.05 ? C_BILL_D : C_BILL));
    prims.push(upBill);
    const loF = chain(torso, T(...HINGE), R(M3.rz(-0.75 * mo)));
    prims.push(ellF(chain(loF, T(22, -6, 0), R(M3.rz(0.08))), [28, 10.5, 29], 5, 5, (s) => (s[1] > 0.55 && mo > 0.05 ? C_TONGUE : C_BILL)));
    if (mo > 0.03) prims.push(ellF(chain(torso, T(40, 152, 0)), [24, 16 + 10 * mo, 24], 6, 6, (s) => (s[1] < -0.15 && Math.abs(s[2]) < 0.75 ? C_TONGUE : C_MOUTH)));
    anchors.mouth = sc(add(inF(upF, [46, 2, 0]), inF(loF, [44, -4, 0])), 0.5);
    const dots = [1, -1].map((sd) => {
      const sN = nrm([0.7, 0.62, sd * 0.24]);
      return { at: { prim: upBill, p: add(upBill.c, M3.v(upBill.L, sN)), s: sN }, mat: BILL, tone: 0, onlyMat: BILL, minFacing: 0.2 };
    });

    // --- arms + mitten hands
    const armRaise = [clamp(P.armN + g * 0.7 * s1 + 0.12 * g * (1 - Math.cos(2 * ph)), -1, 1), clamp(P.armF - g * 0.7 * s1 + 0.12 * g * (1 - Math.cos(2 * ph)), -1, 1)];
    [1, -1].forEach((side, k) => {
      const a = armRaise[k];
      const th = lerp(0.32, 2.65, (a + 1) / 2);
      const d = nrm([0.46 - 0.3 * Math.max(0, a), -Math.cos(th), side * Math.sin(th)]);
      const sh = inF(torso, [6, 130, side * 46]);
      const dW = dirF(torso, d);
      const wrist = add(sh, sc(dW, 34));
      const id = side > 0 ? 7 : 9;
      prims.push(seg(sh, wrist, 12.5, 12.5, id, id, () => C_GREEN));
      // hand frame: length along the arm, palm facing forward
      const fwd = dirF(torso, [1, 0, 0]);
      let n = sub(fwd, sc(dW, dot(fwd, dW)));
      if (len3(n) < 1e-3) n = dirF(torso, [0, 1, 0]);
      n = nrm(n);
      const w = cross(n, dW);
      const hc = add(wrist, sc(dW, 16));
      prims.push(E(hc, M3.mul(M3.cols(n, dW, w), M3.diag(HAND_R[0], HAND_R[1], HAND_R[2])), id + 1, id + 1, handMat));
      anchors[side > 0 ? 'handN' : 'handF'] = add(hc, sc(dW, HAND_R[1]));
    });

    // --- legs (thick green pillars; a lifted leg swings forward/out and shows its black sole)
    [1, -1].forEach((side) => {
      const lift = side > 0 ? legLiftN : legLiftF;
      const hip = [2, 42 + 6 * lift, side * 30];
      const f = chain(T(...hip), R(M3.rz(1.3 * lift)), R(M3.rx(-side * 0.38 * lift)));
      const id = side > 0 ? 11 : 12;
      prims.push(ellF(chain(f, T(0, -18, 0)), [19, 24, 18.5], id, id, legMat));
      anchors[side > 0 ? 'footN' : 'footF'] = inF(f, [0, -42, 0]);
    });

    // --- shaggy fur: tufts at the lower back (a short fur "tail") and on the sides
    for (const f of FUR_SPIKES) prims.push(seg(inF(torso, f.a), inF(torso, f.b), f.r, f.r, 1, 1, M_FUR));

    // --- hat (tilted back a little; bounces with the dance)
    const hat = chain(torso, T(-4, 191, 0), R(M3.rz(0.3 + 0.05 * g * Math.sin(2 * ph - 0.7))), R(M3.rx(0.07 * g * Math.sin(ph - 0.8))));
    prims.push(ellF(hat, [HAT_R - 3.5, 4.2, HAT_R - 3.5], 13, 1, padMat));
    for (let i = 0; i < RIM_N; i++) {
      const th = (i / RIM_N) * Math.PI * 2 + 0.09;
      const o = [Math.cos(th), 0, Math.sin(th)], u = [-Math.sin(th), 0, Math.cos(th)];
      const v = add(sc([0, 1, 0], Math.cos(RIM_FLARE)), sc(o, Math.sin(RIM_FLARE)));
      const w = cross(u, v);
      prims.push(PL(inF(hat, sc(o, HAT_R - 1)), M3.mul(hat.L, M3.cols(u, v, w)), 14, 14, RIM_G, 1.8));
    }
    // stem with a pale band, and the spiky tuft on top
    const stemF = chain(hat, T(-8, 17, 0));
    prims.push(ellF(stemF, [11, 18, 11], 15, 15, stemMat));
    const tuftC = inF(stemF, [0, 15, 0]);
    for (const tf of TUFTS) {
      const dd = [Math.cos(tf.el) * Math.cos(tf.az), Math.sin(tf.el), Math.cos(tf.el) * Math.sin(tf.az)];
      const dW = dirF(stemF, dd);
      let uu = cross(dW, dirF(stemF, [0, 1, 0]));
      if (len3(uu) < 1e-3) uu = dirF(stemF, [1, 0, 0]);
      uu = nrm(uu);
      const ww = cross(uu, dW);
      prims.push(PL(tuftC, M3.cols(uu, dW, ww), 16, 16, tf.big ? SPIKE_G : SPIKE_S, 1.6));
    }

    anchors.top = inF(stemF, [0, 46, 0]);
    anchors.head = inF(torso, [20, 168, 0]);
    anchors.body = inF(torso, [0, 100, 0]);
    anchors.hat = inF(hat, [0, 10, 0]);
    anchors.belly = inF(torso, [58, 95, 0]);
    // uniform scale to the Pokédex height (1.5 m ≈ 262 units at yaw 1.1)
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps: [], dots, anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 0 };
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.5, bw: 320, bh: 330, oy: 0.93 } };
})();
