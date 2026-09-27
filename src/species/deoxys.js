/* ------------------------------------------------------------------
   Deoxys — the DNA Pokémon (1.7 m ≈ 297 units tall standing, at scale 1).
   Salmon-orange armour; a pointed helmet head with a teal visor split by a
   lavender crystal line, fierce eyes in black "eyeliner" marks and two
   panel-shaped side lobes with teal slits; a round purple chest crystal in
   a ribbed frame; a grey ribbed waist over a bowl-shaped pelvis; long
   pointed legs whose upper ends flare up beside the pelvis ("skirt" flaps)
   with teal insets; and two arms, each an orange and a teal tentacle
   twisted around each other like a DNA double helix.
   Model space: x = forward, y = up, z = near side at yaw 0, leg tips at y = 0.

   Pose params:
     wave   radians   tentacle wave phase (animate continuously; arms undulate and twist)
     lean   -0.35..0.35  body lean (+ = forward)
     spread 0..1      arm spread (0 = hanging down, 0.5 = relaxed out/down, 1 = stretched out sideways; >1 = 1)
     fly    0..1      flight: body tips forward, legs and arms trail back
     punch  0..1      near (+z) arm drives straight forward, far arm pulls back
     kick   0..1      near leg swings forward (up to ~horizontal)
     form   'normal' | 'attack' | 'defense' | 'speed'  forme silhouette
     morph  0..1      blend normal → form (default 1)
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'angry'
     mouth  ignored (Deoxys has no mouth)
   Anchors: top, head, mouth (chin), eyeN, eyeF, body, gem, waist, handN, handF, footN, footF.
------------------------------------------------------------------- */
const Deoxys = (() => {
  const { chain, T, R, F, code } = Creature;

  // material ids
  const ORANGE = 1, TEAL = 2, GREY = 3, GEM = 4, BLACK = 5, WHITE = 6, FRAME = 7;
  const MAT = { ORANGE, TEAL, GREY, GEM, BLACK, WHITE, FRAME };
  const PAL = Creature.palette({
    [ORANGE]: { r: ['#983f24', '#c05c38', '#df7f56', '#efa079', '#fbc9ac'], od: '#5a1e0c', ol: '#983f24', ln: '#86361e' },
    [TEAL]:   { r: ['#28606e', '#408496', '#60a6b4', '#8ec6d0', '#c6eaef'], od: '#103a46', ol: '#28606e', ln: '#205466' },
    [GREY]:   { r: ['#48423f', '#66605d', '#88827e', '#aca6a2', '#d2cdc9'], od: '#24201e', ol: '#48423f', ln: '#3a3432' },
    [GEM]:    { r: ['#382a5c', '#58488c', '#7e6eb4', '#b0a6da', '#eeeaff'], od: '#1c1236', ol: '#382a5c', ln: '#2c204e' },
    [BLACK]:  { r: ['#121216', '#18181e', '#202026', '#2a2a32', '#383842'], od: '#0a0a0e', ol: '#121216', ln: '#121216' },
    [WHITE]:  { r: ['#c6cad2', '#e0e4ea', '#f6f8fc', '#ffffff', '#ffffff'], od: '#484c56', ol: '#888c96', ln: '#787c86' },
    [FRAME]:  { r: ['#8a3a22', '#b0522f', '#cf6e47', '#e38f68', '#f2b392'], od: '#4c1a0a', ol: '#80321c', ln: '#6a2814' },
  });
  const GLOSSY = { [ORANGE]: 1, [TEAL]: 1, [GEM]: 1 };

  /* ---------- small math ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const P2W = (f, p) => add(f.t, M3.v(f.L, p));
  // ellipsoid prim literal (same hidden class as the other species)
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 (model space); width axis ⟂ nHint gets radius rw, the other rt
  function seg(p0, p1, rw, rt, ext, nHint, part, grp, mat) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const Tn = sc(d, 1 / l);
    let N = sub(nHint, sc(Tn, dot(nHint, Tn)));
    if (len3(N) < 1e-4) N = Math.abs(Tn[1]) < 0.9 ? cross(Tn, [0, 1, 0]) : cross(Tn, [1, 0, 0]);
    N = nrm(N);
    const B = cross(Tn, N);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(B, N, Tn), M3.diag(rw, rt, l / 2 + ext)), part, grp, mat);
  }

  /* ---------- forme targets (blended from normal by `morph`) ---------- */
  const NORMAL = {
    crownH: 15, crownW: 11, crownY: 16.5, headR: [15, 27, 18], chinR: [10.5, 12, 8.5], back: 0,
    lobeL: 22, lobeH: 10, lobeT: 5, lobeUp: 0.1, lobeSwept: 0, lobeCut: 0.55, lobeDrop: -2,
    visorW: 7.5, chestW: 26.5, chestD: 13.5,
    armLen: 170, armR: 5.2, helix: 1.4, twists: 1.25, spikes: 0, shield: 0, single: 0, tipPoint: 0,
    legW: 11.5, legD: 7, flapH: 31, flapW: 11, flapOut: 0.36, legLen: 141, stripe: 0,
  };
  const FORMS = {
    attack: { crownH: 30, crownW: 8.5, crownY: 22, headR: [14, 24, 16.5], lobeL: 14, lobeH: 6.5, lobeT: 5, lobeUp: 0.95, lobeSwept: 0.5, lobeCut: 1.2, visorW: 6,
      chestW: 21, armLen: 180, armR: 3.9, helix: 1.35, twists: 0.2, spikes: 1, tipPoint: 1, legW: 9, legD: 5.5, flapH: 44, flapW: 12, flapOut: 0.36 },
    defense: { crownH: 8, crownW: 13, crownY: 10, headR: [17, 23, 20], chinR: [12, 11, 13], lobeL: 13, lobeH: 17, lobeT: 8.5, lobeUp: -0.25, lobeCut: 1.2, lobeDrop: 7, visorW: 7,
      chestW: 26, chestD: 15, armLen: 96, armR: 5.6, helix: 0.2, twists: 0.1, shield: 1, legW: 15, legD: 10, flapH: 30, flapW: 15, flapOut: 0.3, legLen: 140 },
    speed: { crownH: 9, crownW: 10, crownY: 12, headR: [15, 22, 16], back: 1, lobeL: 8, lobeH: 6, lobeT: 5, lobeUp: 0.2, lobeSwept: 1, lobeCut: 1.2, visorW: 6,
      chestW: 20, chestD: 12, armLen: 150, armR: 3.4, helix: 0.15, twists: 0.3, single: 1, tipPoint: 1, legW: 8, legD: 5.5, flapH: 24, flapW: 7.5, flapOut: 0.18, stripe: 1 },
  };
  function formeParams(form, m) {
    const tgt = FORMS[form];
    if (!tgt || m <= 0) return NORMAL;
    const o = {};
    for (const k in NORMAL) {
      const a = NORMAL[k], b = tgt[k] ?? a;
      o[k] = Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], m)) : lerp(a, b, m);
    }
    return o;
  }

  /* ---------- rest skeleton (body frame, before lean / fly) ---------- */
  const PIV = [0, 147, 0];     // body pivot (pelvis) for lean / fly
  const HIP_Y = 140, HIP_Z = 21;
  const SHOULDER = [0, 216, 23];
  const HEAD_C = [2, 266, 0];
  const GEM_C = [13, 203, 0];

  // eye stamps would be too coarse here: the eyes are decals in the head's local space
  const DEFAULT = { wave: 0, lean: 0, spread: 0.5, fly: 0, punch: 0, kick: 0, form: 'normal', morph: 1, eyes: 'open', mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const G = formeParams(P.form, clamp(P.morph ?? 1, 0, 1));
    const fly = clamp(+P.fly || 0, 0, 1), punch = clamp(+P.punch || 0, 0, 1), kick = clamp(+P.kick || 0, 0, 1);
    const spread = clamp(+P.spread || 0, 0, 1.5), lean = clamp(+P.lean || 0, -0.5, 0.5), wave = +P.wave || 0;
    const prims = [], anchors = {};
    const tilt = lean + 1.12 * fly + 0.12 * punch;
    const body = chain(T(...PIV), R(M3.rz(-tilt)), T(-PIV[0], -PIV[1], -PIV[2]));
    const orange = (s) => code(ORANGE);

    /* --- head (helmet, crown, chin; visor + crystal + eyes as decals in head space) --- */
    const head = chain(body, T(...HEAD_C), R(M3.rz(0.62 * fly + 0.1 * punch)));
    const HR = G.headR;
    const eyes = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    const vw = G.visorW;
    const visorHalf = (y) => { const t = (y + 1) / (y > -1 ? 25 : 27.5); return t >= 1 ? 0 : vw * Math.pow(1 - t * t, 0.85); };
    const EYE_Y = 0.5, EW = visorHalf(EYE_Y);
    // eye mark (eye-local u = outward from the visor edge, v = up): a black quad whose sharp tip points
    // down toward the chin, a small white lens-shaped eye in its upper-outer part and a dot pupil
    const EQ = [[6.2, 2.4], [-1.7, 1.2], [-1.1, -4.0], [6.2, -0.7]];
    const inQuad = (u, v) => {
      for (let i = 0; i < 4; i++) {
        const a = EQ[i], b = EQ[(i + 1) % 4];
        if ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0]) < 0) return false;
      }
      return true;
    };
    function eyeMat(u, v) {
      if (u < -2 || u > 6.5 || v < -4.2 || v > 2.6 || !inQuad(u, v)) return 0;
      if (eyes === 'closed') return Math.abs(v - 0.4 - 0.12 * u) < 0.45 && u > 0 && u < 5 ? code(WHITE, -1) : code(BLACK);
      const wx = (u - 2.7) / 2.3, wy = (v - 0.55 - 0.1 * (u - 2.7)) / 1.35;
      let white = wx * wx + wy * wy < 1;
      if (eyes === 'blink') white = Math.abs(wy) < 0.36 && Math.abs(wx) < 1;
      else if (eyes === 'angry') white = white && wy < 0.3 + 0.8 * wx;
      else if (eyes === 'happy') { const r = wx * wx + (wy + 0.75) ** 2; white = r < 1.15 && r > 0.45 && wy > -0.55; }
      if (white) {
        if ((eyes === 'open' || eyes === 'angry') && (u - 2.1) ** 2 + (v - 0.8) ** 2 < 0.42) return code(BLACK);
        return code(WHITE, 1);
      }
      return code(BLACK);
    }
    function faceMat(x, y, z) {
      if (x < 1) return 0;
      const az = Math.abs(z);
      const e = eyeMat(az - EW, y - EYE_Y);
      if (e) return e;
      const w = visorHalf(y);
      if (az < w) {
        const cw = 1.35 * Math.sqrt(Math.max(0, 1 - ((y + 1) / (y > -1 ? 22 : 25)) ** 2));
        if (az < cw) return code(GEM, z > 0.2 ? 1 : 0);
        return code(TEAL, y > 8 ? 1 : 0);
      }
      return 0;
    }
    const headPart = (c, r, part) => {
      const f = chain(head, T(...c));
      return ellF(f, r, part, 1, (s) => faceMat(c[0] + r[0] * s[0], c[1] + r[1] * s[1], c[2] + r[2] * s[2]) || code(ORANGE));
    };
    const headMain = headPart([0, 0, 0], HR, 1);
    prims.push(headMain);
    prims.push(headPart([-1, G.crownY, 0], [G.crownW * 0.86, G.crownH, G.crownW], 1));
    prims.push(headPart([2.5, -17, 0], G.chinR, 1));
    if (G.back > 0.01) {
      // speed forme: the helmet streams back into a long point
      const bf = chain(head, T(-10 - 8 * G.back, 6, 0), R(M3.rz(-0.22)));
      prims.push(ellF(bf, [10 + 16 * G.back, 8.5, 9.5 - 1.5 * G.back], 1, 1, orange));
    }
    // side lobes: chunky panels with a flat outer end (clipped ellipsoid + end cap) and a teal slit
    for (const sd of [1, -1]) {
      const L = G.lobeL, cut = Math.min(0.99, G.lobeCut);
      const lf = chain(head, T(-2 - 6 * G.lobeSwept, 3 - G.lobeDrop, sd * (HR[2] - 5 + L * 0.45)), R(M3.rx(-sd * G.lobeUp)), R(M3.ry(sd * 0.5 * G.lobeSwept)));
      const lr = [G.lobeT, G.lobeH, L];
      prims.push(ellF(lf, lr, 2, 2, (s) => {
        const zz = s[2] * sd;
        if (zz > cut) return 0;
        if (s[0] > 0.25 && Math.abs(s[1]) < 0.16 && zz > 0.05 && zz < cut - 0.12) return code(TEAL);
        return code(ORANGE, s[1] > 0.5 ? 1 : 0);
      }));
      if (cut < 0.98) {
        // flat end: a thin disc at the cut (an ellipsoid, so it stays solid edge-on)
        const k = Math.sqrt(1 - cut * cut);
        prims.push(ellF(chain(lf, T(0, 0, sd * (L * cut - 0.6))), [lr[0] * k, lr[1] * k, 0.9], 2, 2, () => code(ORANGE, -1)));
      }
    }

    /* --- neck, chest, gem --- */
    prims.push(ellF(chain(body, T(1, 232, 0)), [5.4, 10, 5.6], 3, 3, (s) => (s[0] > 0.35 && Math.abs(s[2]) < 0.34 ? code(TEAL) : code(ORANGE))));
    const cw = G.chestW, cd = G.chestD;
    const chestMat = (s) => {
      // teal strip coming down from the neck, rounded end
      if (s[0] > 0.5 && Math.abs(s[2]) * cw < 2.6 && s[1] > 0.55) return code(TEAL);
      if (G.stripe > 0.5 && Math.abs(s[2]) > 0.72 && Math.abs(s[1]) < 0.55) return code(TEAL);
      return code(ORANGE, s[1] > 0.55 ? 1 : 0);
    };
    prims.push(ellF(chain(body, T(0, 205, 0)), [cd, 21, cw], 4, 4, chestMat));
    prims.push(ellF(chain(body, T(0, 183, 0)), [cd * 0.76, 18, cw * 0.44], 4, 4, orange));
    for (const sd of [1, -1]) prims.push(ellF(chain(body, T(0, 214, sd * (cw - 4))), [11, 10, 10.5], 4, 4, orange));
    // chest crystal in a ribbed frame
    const gemF = chain(body, T(GEM_C[0] + (cd - 13), GEM_C[1], 0));
    prims.push(ellF(gemF, [3.2, 12.5, 12.5], 5, 5, (s) => {
      const r = Math.hypot(s[1], s[2]);
      if (r > 0.86) return code(FRAME, -1);
      const a = Math.atan2(s[1], s[2]) * 6 / Math.PI;
      if (Math.abs(a - Math.round(a)) < 0.09 && r > 0.5) return code(FRAME, -1);
      return code(FRAME);
    }));
    prims.push(ellF(chain(gemF, T(1.6, 0, 0)), [4.6, 6.8, 6.8], 6, 6, (s) => code(GEM, s[1] > 0.35 && s[2] < 0 ? 1 : 0)));
    anchors.gem = P2W(gemF, [5, 0, 0]);

    /* --- waist and pelvis --- */
    prims.push(ellF(chain(body, T(0, 164, 0)), [8, 13.5, 9], 7, 7, (s) => {
      const a = Math.atan2(s[2], s[0]) * 4 / Math.PI;
      return Math.abs(a - Math.round(a)) < 0.1 ? code(GREY, -1) : code(GREY);
    }));
    prims.push(ellF(chain(body, T(0, 147, 0)), [19, 14, 25], 8, 8, (s) => code(ORANGE, s[1] > 0.74 ? -1 : s[1] > 0.6 ? 1 : 0)));
    anchors.waist = P2W(body, [0, 164, 0]);

    /* --- legs: long pointed spindles whose tops flare up beside the pelvis --- */
    for (const sd of [1, -1]) {
      const swing = -0.32 * fly + (sd > 0 ? 1.45 * kick : -0.25 * kick);
      const splay = 0.2 + 0.04 * fly;
      const leg = chain(body, T(0, HIP_Y, sd * HIP_Z), R(M3.rz(swing)), R(M3.rx(-sd * splay)));
      const id = sd > 0 ? 9 : 10;
      const LL = G.legLen, LW = G.legW, LD = G.legD;
      // leg-local decal: teal inset on the front-outer face (segment lines), speed-forme stripe
      const legMat = (c, r) => (s) => {
        const x = c[0] + r[0] * s[0], y = c[1] + r[1] * s[1], z = (c[2] + r[2] * s[2]) * sd;
        const az = Math.atan2(z / LW, x / LD);
        const t = (y + 0.42 * LL) / (0.24 * LL); // -1..1 over the inset's length
        const wmax = 0.33 * (1 - t * t);
        if (wmax > 0 && Math.abs(az - 0.85) < wmax) {
          const k = (t + 1) * 3.5;
          return Math.abs(k - Math.round(k)) < 0.14 && t > -0.85 && t < 0.85 ? code(TEAL, -1) : code(TEAL);
        }
        if (G.stripe > 0.5 && Math.abs(az - 0.85) < 0.13 && y < -0.7 * LL && y > -0.9 * LL) return code(TEAL);
        return code(ORANGE);
      };
      // a cone-like blade: wide thigh, mid and a long pointed lower part (tip at -LL)
      const parts = [[[0, -0.14 * LL, 0], [LD, 0.29 * LL, LW]], [[0, -0.42 * LL, 0], [LD * 0.86, 0.31 * LL, LW * 0.78]], [[0, -0.715 * LL, 0], [LD * 0.64, 0.285 * LL, LW * 0.47]]];
      for (const [c, r] of parts) prims.push(ellF(chain(leg, T(...c)), r, id, id, legMat(c, r)));
      // flap: the flared upper end of the leg, rising beside the pelvis and leaning out ("skirt")
      const ff = chain(leg, T(0, 4, sd * 3), R(M3.rx(sd * G.flapOut)));
      prims.push(ellF(ff, [LD, G.flapH, G.flapW], id, id, (s) => code(ORANGE, s[1] > 0.6 ? 1 : 0)));
      anchors[sd > 0 ? 'footN' : 'footF'] = P2W(leg, [0, -LL, 0]);
    }

    /* --- arms: two tentacles (orange + teal) twisted into a double helix --- */
    for (const sd of [1, -1]) {
      const sh = [SHOULDER[0], SHOULDER[1], sd * (cw - 1)];
      // base direction of the arm
      const hang = nrm([0.12, -1, 0.3 * sd]), out = nrm([0.18, -0.72, 0.68 * sd]), side = nrm([0.12, 0.08, 1 * sd]);
      let dir = spread < 0.5 ? lerpV(hang, out, spread / 0.5) : lerpV(out, side, Math.min(1, (spread - 0.5) / 0.5));
      dir = nrm(lerpV(dir, nrm([-0.2, -0.95, 0.42 * sd]), fly * 0.8)); // trails back along the tipped body
      const pu = sd > 0 ? punch : 0, pull = sd < 0 ? punch : 0;
      dir = nrm(lerpV(dir, nrm([1, 0.04, 0.12]), pu));
      dir = nrm(lerpV(dir, nrm([-0.7, -0.5, 0.5 * sd]), pull * 0.6));
      if (G.shield > 0.01) dir = nrm(lerpV(dir, nrm([0.62, -0.72, -0.3 * sd]), G.shield));
      // local frame: a = along the arm, b = "up" across it, c = cross
      const a = dir;
      let b = sub([0, 1, 0], sc(a, a[1]));
      if (len3(b) < 0.1) b = sub([1, 0, 0], sc(a, a[0]));
      b = nrm(b);
      const c = cross(a, b);
      const L = G.armLen * (1 - 0.18 * pu);
      const wamp = 15 * (1 - pu) * (1 - 0.6 * G.shield);
      const N = 18;
      const ctr = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        let p = add(sh, sc(a, L * u));
        p = add(p, sc(b, wamp * u * Math.sin(u * 6.9 - wave) - 18 * u * u * (1 - pu) * (1 - fly) * smooth(0.4, 1, spread)));
        p = add(p, sc(c, 0.7 * wamp * u * Math.sin(u * 5.2 - wave * 0.8 + 1.3)));
        if (G.shield > 0.01) p = add(p, sc([-0.3, 0.2, -sd], 22 * G.shield * u * u)); // curl in front of the body
        ctr.push(P2W(body, p));
      }
      const id0 = sd > 0 ? 11 : 13;
      const r0 = G.armR;
      const strands = [[], []];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const tg = nrm(sub(ctr[Math.min(N, i + 1)], ctr[Math.max(0, i - 1)]));
        let nb = sub(M3.v(body.L, [1, 0, 0]), sc(tg, dot(M3.v(body.L, [1, 0, 0]), tg)));
        if (len3(nb) < 0.1) nb = sub([0, 1, 0], sc(tg, tg[1]));
        nb = nrm(nb);
        const bb = cross(tg, nb);
        const rh = r0 * G.helix * (1 + 1.3 * (1 - pu) * smooth(0.82, 1, u));
        const ph = u * Math.PI * 2 * G.twists - wave * 0.5 + (sd > 0 ? 0 : 1.1);
        for (let k = 0; k < 2; k++) {
          const a2 = ph + k * Math.PI;
          let off = add(sc(nb, Math.cos(a2) * rh), sc(bb, Math.sin(a2) * rh));
          if (G.single > 0.01 && k === 1) off = lerpV(off, sc(nb, r0 * 0.55), G.single); // speed: teal rides on the front
          if (G.shield > 0.01) off = lerpV(off, sc(bb, (k ? -1 : 1) * sd * r0 * 0.9), G.shield); // defense: side by side, a broad band
          strands[k].push({ p: add(ctr[i], off), nb, u });
        }
      }
      for (let k = 0; k < 2; k++) {
        const st = strands[k];
        const mat = k === 0 ? (s) => code(ORANGE, s[1] > 0.5 ? 1 : 0) : (s) => code(TEAL, s[1] > 0.5 ? 1 : 0);
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N;
          let rr = r0 * (1 - 0.22 * u) * (k === 1 && G.single > 0.01 ? 1 - 0.35 * G.single : 1);
          const rw = rr * (1 + 1.9 * G.shield * (1 - 0.5 * u * u)), rt = rr * (1 - 0.15 * G.shield);
          const last = i === N - 1;
          const ext = last && G.tipPoint > 0.01 ? rr * 2.6 * G.tipPoint : last ? rr * 1.1 : rr * 1.9;
          prims.push(seg(st[i].p, st[i + 1].p, last ? rw * (1 - 0.35 * G.tipPoint) : rw, last ? rt * (1 - 0.35 * G.tipPoint) : rt, ext, st[i].nb, id0 + k, id0 + k, mat));
          // attack forme barbs along the orange strand
          if (G.spikes > 0.05 && k === 0 && i % 3 === 1 && i < N - 1) {
            const q = st[i].p, dirS = nrm(sub(q, ctr[i]));
            const lenS = 7 * G.spikes;
            prims.push(seg(q, add(q, sc(dirS, lenS)), rr * 0.55, rr * 0.55, rr * 0.3, st[i].nb, id0, id0, mat));
          }
        }
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = ctr[N];
    }

    /* --- anchors --- */
    const top = P2W(head, [-1, G.crownY + G.crownH, 0]);
    Object.assign(anchors, {
      top, head: head.t, body: P2W(body, [0, 200, 0]),
      mouth: P2W(head, [HR[0] - 2, -20, 0]),
      eyeN: P2W(head, [HR[0] * 0.8, EYE_Y, EW + 3]), eyeF: P2W(head, [HR[0] * 0.8, EYE_Y, -EW - 3]),
    });
    return {
      prims, stamps: [], dots: [], anchors, pose: P,
      pri: { 1: 1, 2: 2, 3: 0, 4: 1, 5: 2, 6: 3, 7: 0, 8: 1, 9: 2, 10: 2, 11: 3, 12: 4, 13: 3, 14: 4 },
      glossy: GLOSSY, baseMat: ORANGE, shadowSteps: 14,
    };
  }

  /* ---------- render: nearest prims first, ray-cast only the model's screen box ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const zs = new Map();
    for (const p of model.prims) zs.set(p, V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2]);
    model.prims.sort((a, b) => zs.get(b) - zs.get(a));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        grow(ox + cv[0] - rx, oy - cv[1] - ry); grow(ox + cv[0] + rx, oy - cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]]) for (const w of [-p.thick, p.thick]) {
          const q = add(cv, M3.v(Lv, [u, v, w]));
          grow(ox + q[0], oy - q[1]);
        }
      }
    }
    const X0 = Math.max(0, Math.floor(x0) - 3), Y0 = Math.max(0, Math.floor(y0) - 3);
    const X1 = Math.min(W - 1, Math.ceil(x1) + 3), Y1 = Math.min(H - 1, Math.ceil(y1) + 3);
    if (X1 < X0 || Y1 < Y0) return Creature.render(model, opt);
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - X0, oy: oy - Y0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s = y * w, d = (y + Y0) * W + X0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + X0, a[1] + Y0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, FORMS: ['normal', 'attack', 'defense', 'speed'], meta: { heightM: 1.7, bw: 460, bh: 380, oy: 0.9 } };
})();
