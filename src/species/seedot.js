/* ------------------------------------------------------------------
   Seedot — the Acorn Pokémon (0.5 m ≈ 88 units tall at scale 1, stalk
   included). A posable 3D model rendered straight to pixel art by the
   shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): an acorn. A round body that tapers
   to a little point at the bottom: brown below, pale cream across the
   face, the cream dipping in a scalloped U under each eye with a brown
   point rising between them. Two big eyes under the cap: thick black
   U-shaped rings around a cream centre, their tops hidden by the brim.
   A grey cap: a dome with three concentric grooves, a thick rounded brim
   and a short stalk flaring into a flat top. Two stubby cream feet.

   Pose parameters (all optional):
     hang    0..1     dangling from a branch by its stalk (like an acorn on
                      its twig — the Pokédex pose; the cap stays up, the body
                      hangs below the stalk): 1 = suspended from the stalk tip,
                      feet hanging limp, toes down. The stalk tip stays at
                      (0, 88, 0)·scale in model space for every hang value
                      (anchor `stalk`), so a hanging Seedot is drawn with its
                      origin 88·scale below the branch; the dangling feet then
                      dip ≈ 10·scale below y = 0 (the buffer allows for it)
     step     radians waddle phase: rocks side to side on its feet with a
                      bob, feet lifting in turn (when hanging, the feet kick
                      and it sways); exactly 0 = still
     squash  −1..1    squash (+) / stretch (−) of the whole body
     tilt    −1..1    roll toward the near (+) / far (−) side: a curious tilt
                      on the ground, a pendulum swing when hanging
     eyes    'open' | 'happy' | 'closed' | 'blink'
     mouth   0..1     a small mouth opening below the eyes (0 = no mouth, as
                      in the official art)
     side    −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (stalk tip), stalk (stalk tip — the hanging point), head
   (face centre under the brim), mouth, eyeN, eyeF, body (body centre),
   footN / footF, brim (front edge of the cap brim).
------------------------------------------------------------------- */
const Seedot = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const CAP = 1, BROWN = 2, CREAM = 3, EYE = 4, MOUTH = 5, FOOT = 6;
  const MAT = { CAP, BROWN, CREAM, EYE, MOUTH, FOOT };
  const PAL = Creature.palette({
    [CAP]:   { r: ['#5c585a', '#7a7676', '#9f9a98', '#c2beba', '#e4e2de'], od: '#2c282a', ol: '#54504e', ln: '#524d4b' },
    [BROWN]: { r: ['#573c2a', '#74533a', '#926e4e', '#ae8a66', '#c8a684'], od: '#2c1a0e', ol: '#583a22', ln: '#583a24' },
    [CREAM]: { r: ['#b89c60', '#d8be80', '#f0daa2', '#f9ebc8', '#fffae6'], od: '#665020', ol: '#9c7e3c', ln: '#a48646' },
    [FOOT]:  { r: ['#b89c60', '#d8be80', '#f0daa2', '#f9ebc8', '#fffae6'], od: '#665020', ol: '#9c7e3c', ln: '#a28444' },
    [EYE]:   { r: ['#12100e', '#1c1916', '#272320', '#36312c', '#4a443e'], od: '#0a0908', ol: '#12100e', ln: '#12100e' },
    [MOUTH]: { r: ['#4a1418', '#641e22', '#80302e', '#9a4640', '#b45c52'], od: '#2c080c', ol: '#4a1418', ln: '#4a1418' },
  });
  const GLOSSY = {};
  const C_CAP = code(CAP), C_CAP_D = code(CAP, -1), C_CAP_DD = code(CAP, -2), C_CAP_L = code(CAP, 1), C_BROWN = code(BROWN), C_BROWN_D = code(BROWN, -1);
  const C_CREAM = code(CREAM), C_EYE = code(EYE), C_MOUTH = code(MOUTH), C_FOOT = code(FOOT), C_FOOT_D = code(FOOT, -1);
  const M_CAP = () => C_CAP;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, up = [0, 0, 1]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, up);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  let curScale = 1;

  /* ---------- body with the face (body frame; physical coords p = C + R·s) ---------- */
  const BC = [0, 36.5, 0], BR = [26, 31.5, 27];
  const EYE_AZ = 0.5, EYE_Y = 36, EYE_RU = 11, EYE_RV = 12.6, EYE_IN = 0.52; // ring centre, outer radii (units), inner fraction
  const BAND_Y = 32, CREAM_PAD = 3.2, MOUTH_Y = 25.5;
  function bodyMat(kind, mo) {
    return (s) => {
      const y = BC[1] + BR[1] * s[1];
      if (y > 52) return 0; // hidden under the cap (keeps the dome clean)
      if (y < 14 && s[1] < -0.8) return C_BROWN_D; // darker little point at the bottom
      const az = Math.atan2(s[2], s[0]);
      const px = 1 / curScale;
      if (s[0] > -0.35) {
        // eyes: black U ring, cream centre (tops hidden by the brim)
        const sd = az >= 0 ? 1 : -1;
        const r = BR[0] * Math.sqrt(1 - s[1] * s[1]); // horizontal radius at this height
        const u = (az - sd * EYE_AZ) * r, v = y - EYE_Y;
        const a = u / EYE_RU, b = v / EYE_RV, rr = a * a + b * b;
        if (kind === 'open') {
          if (rr < 1) {
            const ti = Math.max(EYE_IN, 0);
            const ia = u / Math.max(EYE_RU * ti, 1.1 * px), ib = (v - 1.6) / Math.max(EYE_RV * ti * 1.16, 1.3 * px);
            return ia * ia + ib * ib < 1 ? C_CREAM : C_EYE;
          }
        } else {
          // shut eyes: thick curved lines about as heavy as the open eye rings
          const w = Math.max(1.7, 0.7 * px);
          const k = u / (EYE_RU * 0.95);
          if (Math.abs(k) < 1) {
            let yc;
            if (kind === 'happy') yc = -3 + 6 * (1 - k * k); // ∩ arch
            else if (kind === 'blink') yc = -2.5;
            else yc = -1.5 - 5 * (1 - k * k); // closed: a soft ∪
            if (Math.abs(v - yc) < w * (1 - 0.35 * k * k)) return C_EYE;
          }
        }
        // small mouth (only when open)
        if (mo > 0.05) {
          const mu = az * r, mv = y - MOUTH_Y;
          const mw = Math.max(3.2 * (0.6 + 0.4 * mo), 1.2 * px), mh = Math.max(3.2 * mo, 1.1 * px);
          if ((mu / mw) ** 2 + (mv / mh) ** 2 < 1) return C_MOUTH;
        }
        // cream face: a band under the brim + a cream border round each eye ring
        const band = BAND_Y + Math.max(0, Math.abs(az) - 1.05) * 10;
        if (y > band) return C_CREAM;
        if (rr < 1) return C_CREAM;
        const ca = u / (EYE_RU + CREAM_PAD), cb = v / (EYE_RV + CREAM_PAD);
        if (ca * ca + cb * cb < 1) return C_CREAM;
      }
      return C_BROWN;
    };
  }

  /* ---------- cap: dome with three grooves, rounded brim, stalk ---------- */
  const DOME_C = [0, 46, 0], DOME_R = [27.8, 30.5, 27.8];
  const GROOVES = [0.3, 0.56, 0.79];
  function domeMat(s) {
    if (s[1] < -0.02) return 0;
    const px = 1 / (curScale * DOME_R[1]);
    const w = Math.max(0.026, 0.55 * px);
    // stepped rings: a dark groove with a lit bevel just below it (when there is room)
    for (const g of GROOVES) {
      const d = s[1] - g;
      if (Math.abs(d) < w) return C_CAP_DD;
      if (px < 0.05 && d < -w && d > -w - Math.max(0.03, 0.9 * px)) return C_CAP_L;
    }
    return C_CAP;
  }
  const BRIM_C = [0, 46.2, 0], BRIM_R = [32.4, 6.6, 32.4];
  const STALK_TOP = 88.4;

  /* ---------- feet ---------- */
  const FEET = [{ z: 12.6, ph: 0 }, { z: -12.6, ph: Math.PI }];

  const DEFAULT = { hang: 0, step: 0, squash: 0, tilt: 0, eyes: 'open', mouth: 0, side: 1 };
  const PRI = { 1: 0, 2: 2, 3: 1, 4: 2, 5: 1, 6: 1, 7: 0 };
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const hang = clamp(+P.hang || 0, 0, 1), st = +P.step || 0, moving = st !== 0;
    const sq = clamp(+P.squash || 0, -1, 1), tilt = clamp(+P.tilt || 0, -1, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const ground = 1 - hang;
    // waddle: rock on the feet with a bob (on the ground only)
    const rock = moving ? 0.13 * Math.sin(st) * ground : 0;
    const bob = moving ? 1.6 * Math.abs(Math.sin(st)) * ground : 0;
    const roll = tilt * 0.3 + rock + (moving ? 0.05 * Math.sin(st * 0.5) * hang : 0);
    // pivot: the ground contact when standing, the stalk tip when hanging
    const pv = [0, lerp(0, STALK_TOP, hang), 0];
    const sy = 1 - 0.2 * sq, sxz = 1 + 0.14 * sq;
    const body = chain(T(pv[0], pv[1] + bob, pv[2]), R(M3.rx(roll)), { L: M3.diag(sxz, sy, sxz), t: [0, 0, 0] }, T(-pv[0], -pv[1], -pv[2]));

    // --- body + face
    const bodyPrim = ellF(chain(body, T(...BC)), BR, 1, 1, bodyMat(P.eyes, mo));
    prims.push(bodyPrim);
    // little point at the bottom
    prims.push(ellF(chain(body, T(0, 7.2, 0)), [6.2, 6.6, 6.2], 1, 1, () => C_BROWN_D));
    anchors.body = inF(body, [0, 30, 0]);
    const onBody = (az, y) => {
      const v = (y - BC[1]) / BR[1], h = Math.sqrt(Math.max(0, 1 - v * v));
      return inF(body, [BC[0] + BR[0] * h * Math.cos(az), y, BC[2] + BR[2] * h * Math.sin(az)]);
    };
    anchors.eyeN = onBody(EYE_AZ, EYE_Y - 2); anchors.eyeF = onBody(-EYE_AZ, EYE_Y - 2);
    anchors.mouth = onBody(0, MOUTH_Y);
    anchors.head = inF(body, [BR[0] * 0.7, EYE_Y - 3, 0]);

    // --- cap: dome, brim, stalk
    prims.push(ellF(chain(body, T(...DOME_C)), DOME_R, 2, 2, domeMat));
    prims.push(ellF(chain(body, T(...BRIM_C)), BRIM_R, 3, 3, (s) => (s[1] > 0.55 ? C_CAP_L : s[1] < -0.45 ? C_CAP_D : C_CAP)));
    // stalk: a short stem widening into a flat-topped flare (like a golf tee)
    prims.push(seg(inF(body, [0, 70, 0]), inF(body, [0, 80, 0]), 3.3, 3.3, 4, 4, M_CAP));
    prims.push(seg(inF(body, [0, 75, 0]), inF(body, [0, 87, 0]), 3.9, 3.9, 4, 4, M_CAP));
    prims.push(ellF(chain(body, T(0, 86.3, 0)), [4.9, 2.1, 4.9], 4, 4, (s) => (s[1] > 0.45 ? C_CAP_L : C_CAP)));
    anchors.stalk = inF(body, [0, STALK_TOP, 0]);
    anchors.top = anchors.stalk;
    anchors.brim = inF(body, [BRIM_R[0], BRIM_C[1] - 2, 0]);

    // --- feet: stubby cream ovals; waddle lifts them in turn, hanging lets them dangle
    FEET.forEach((f, i) => {
      const sd = Math.sign(f.z), id = 5 + i;
      const ph = st + f.ph;
      const lift = moving ? Math.max(0, Math.sin(ph)) * 3.2 * ground : 0;
      const kick = moving ? Math.sin(ph) * 0.45 * hang : 0;
      // standing: forward-out on the ground; hanging: toes down, a bit further under the body
      const c = lerp3([6.4, 8.2 + lift, f.z * 0.96], [3.2, 3.8, f.z * 0.82], hang);
      const pitch = lerp(0, -1.05, hang) + kick;
      const ff = chain(body, T(...c), R(M3.ry(-sd * 0.22)), R(M3.rz(pitch)));
      const foot = ellF(chain(ff, T(3.8, 0, 0)), [11.8, 8.3, 9.6], id, id, (s) => (s[1] < -0.7 ? C_FOOT_D : C_FOOT));
      // a crease across the front of the foot
      foot.lines = [{ pts: [[0.62, 0.62, -0.48], [0.8, 0.12, -0.58], [0.8, -0.4, -0.45]].map((q) => [q[0], q[1], q[2] * -sd]), mat: FOOT, useLn: true }];
      prims.push(foot);
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(ff, [8, -2, 0]);
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim: bodyPrim, pri: PRI, glossy: GLOSSY, baseMat: BROWN, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 116, bh: 136, oy: 0.85 } };
})();
