/* ------------------------------------------------------------------
   Spheal — the Clap Pokémon. A round, rolling ball of a seal.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.
------------------------------------------------------------------- */
const Spheal = (() => {
  const { ell, plate, chain, T, R, F, onEll, sph, code } = Creature;

  // material ids
  const BODY = 1, BELLY = 2, SPOT = 3, FANG = 4, MOUTH = 5, TONGUE = 6, FLIP = 7, LIP = 8, EARIN = 9;
  const MAT = { BODY, BELLY, SPOT, FANG, MOUTH, TONGUE, FLIP, LIP, EARIN };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#4b5eb0', '#6782cf', '#86a1e4', '#a9c1f4', '#c8dafc'], od: '#27357a', ol: '#4a60b4', ln: '#5068b8' },
    [LIP]:    { r: ['#2b397f', '#33428d', '#3c4d9c', '#4d62b6', '#5d76c8'], od: '#1e2860', ol: '#2e3d84', ln: '#2e3d84' },
    [EARIN]:  { r: ['#34458f', '#4a60b2', '#6680cc', '#86a0e2', '#a6bdf1'], od: '#232f6d', ol: '#4458a8', ln: '#3d4e9e' },
    [BELLY]:  { r: ['#dcc08e', '#ecd7a9', '#f9edcc', '#fef8e5', '#fffbee'], od: '#8c6a3c', ol: '#b8945c', ln: '#caa672' },
    [FLIP]:   { r: ['#d3b37c', '#e6cc98', '#f6e6bf', '#fdf4dc', '#fffbf0'], od: '#8c6a3c', ol: '#b8945c', ln: '#c09a64' },
    [SPOT]:   { r: ['#a9bae2', '#cad7f3', '#eef3ff', '#ffffff', '#ffffff'], od: '#4a5eae', ol: '#7189cc', ln: '#8ea3d8' },
    [FANG]:   { r: ['#aab6cf', '#cfd8ea', '#f4f7fc', '#ffffff', '#ffffff'], od: '#465476', ol: '#66769c', ln: '#76849f' },
    [MOUTH]:  { r: ['#561828', '#742336', '#943244', '#b24756', '#cc646e'], od: '#380c18', ol: '#561424', ln: '#561424' },
    [TONGUE]: { r: ['#bc4c62', '#d8687a', '#ee8a94', '#ffadb0', '#ffcfcc'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [BODY]: 1, [BELLY]: 1, [FLIP]: 0, [SPOT]: 0 };

  const DEFAULT = { roll: 0, clap: 0, mouth: 0, eyes: 'open', squash: 0, headPitch: 0, tailWag: 0, side: 1 };

  const BR = [69, 69, 68]; // ball radii
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  /* ---------- belly boundary (head frame) ----------
     cream = (face region below the lip line) OR (tilted cap on the lower front) */
  const BN = [0.819, -0.574, 0], BK = 0.6;
  const LIP0 = 0.45;
  const faceLip = (a) => LIP0 - 0.14 * a * a - 2.6 * Math.max(0, a - 0.68) ** 2;
  // signed "cream-ness": > 0 inside the belly
  function bellyE(h, a) {
    const e1 = h[1] < 1 ? faceLip(a) - h[1] : -1; // lip region
    const e2 = (V3.dot(h, BN) - BK) * 1.6; // cap
    return Math.max(e1, e2);
  }

  /* ---------- white spots on the sides (body frame) ---------- */
  const SPOT_DEF = [
    { az: 1.24, v: 0.38, a: 0.2, b: 0.26, tilt: 0.3 },
    { az: 1.36, v: 0.0, a: 0.085, b: 0.11, tilt: 0.1 },
    { az: 1.63, v: -0.26, a: 0.13, b: 0.16, tilt: -0.2 },
    { az: 2.35, v: 0.52, a: 0.1, b: 0.12, tilt: 0.0 },
  ];
  const SPOTS = [];
  for (const sd of SPOT_DEF) {
    for (const side of [1, -1]) {
      const d = sph(side * sd.az, sd.v);
      const t1 = V3.norm(V3.cross([0, 1, 0], d));
      const t2 = V3.cross(d, t1);
      const ct = Math.cos(sd.tilt * side), st = Math.sin(sd.tilt * side);
      SPOTS.push({ d, t1, t2, a: sd.a, b: sd.b, ct, st, cmin: Math.cos(Math.max(sd.a, sd.b) * 1.3) });
    }
  }
  function spotAt(s) {
    for (const sp of SPOTS) {
      const dd = s[0] * sp.d[0] + s[1] * sp.d[1] + s[2] * sp.d[2];
      if (dd < sp.cmin) continue;
      const u0 = s[0] * sp.t1[0] + s[1] * sp.t1[1] + s[2] * sp.t1[2];
      const v0 = s[0] * sp.t2[0] + s[1] * sp.t2[1] + s[2] * sp.t2[2];
      const u = u0 * sp.ct + v0 * sp.st, v = -u0 * sp.st + v0 * sp.ct;
      if ((u / sp.a) ** 2 + (v / sp.b) ** 2 < 1) return true;
    }
    return false;
  }

  /* ---------- plate shapes ---------- */
  const FANG_G = bakeShape(Shape2D.poly([[-4.2, 3.6], [0, 4.2], [4.2, 3.6], [2.2, -2.2], [0.2, -7.2], [-2.2, -2.2]], code(FANG), 8));

  /* ---------- eye stamps (k = pupil, w = shine, b = glint) ---------- */
  const EYES = {
    open: ['....kkkk....', '..kkkkkkkk..', '.kkwwwkkkkk.', '.kwwwwwkkkk.', 'kkwwwwwkkkkk', 'kkwwwwkkkkkk', 'kkkwwkkkkkkk', 'kkkkkkkkkkkk', 'kkkkkkkkkkkk', 'kkkkkkkkwwkk', '.kkkkkkbwkk.', '.kkkkkkbbkk.', '..kkkkkkkk..', '....kkkk....'],
    openN: ['...kkkk...', '..kkkkkk..', '.kwwwkkkk.', '.wwwwwkkk.', 'kwwwwwkkkk', 'kwwwwkkkkk', 'kkwwkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkwwkk', '.kkkkbwkk.', '.kkkkbbkk.', '..kkkkkk..', '...kkkk...'],
    openF: ['..kkk..', '.kkkkk.', '.wwkkk.', 'wwwkkkk', 'wwwkkkk', 'kwkkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkwkk', 'kkkbwkk', '.kkbkk.', '.kkkkk.', '..kkk..'],
    happy: ['...kkkkkk...', '.kkkkkkkkkk.', 'kkk......kkk', 'kk........kk'],
    happyN: ['..kkkkkk..', '.kkkkkkkk.', 'kk......kk', 'k........k'],
    happyF: ['.kkkkk.', 'kkk.kkk', 'k.....k'],
    blink: ['kkkkkkkkkkkk', '.kkkkkkkkkk.'],
    blinkN: ['kkkkkkkkkk', '.kkkkkkkk.'],
    blinkF: ['kkkkkkk', '.kkkkk.'],
    closed: ['k..........k', '.kk......kk.', '...kkkkkk...'],
    closedN: ['k........k', '.kk....kk.', '...kkkk...'],
    closedF: ['k.....k', '.kk.kk.', '...k...'],
    dizzy: ['..kkkkkk..', '.k......k.', 'k..kkkk..k', 'k.k....k.k', 'k.k.kk.k.k', 'k.k.k..k.k', 'k.k..kk..k', 'k..k.....k', '.k..kkkkk.', '..kk......'],
    dizzyN: ['.kkkkkk.', 'k......k', 'k.kkkk.k', 'k.k..k.k', 'k.k.kk.k', 'k..k...k', '.k..kkk.', '..k.....'],
    dizzyF: ['.kkkk.', 'k....k', 'k.kk.k', 'k.k..k', '.k.kk.', '..k...'],
  };
  const EYEC = { k: '#161b2e', w: '#ffffff', b: '#4d5f98' };

  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // lowest model-space y of a primitive (ellipsoid: analytic; plate: bbox corners)
  function minY(p) {
    if (p.kind === 'ell') return p.c[1] - Math.hypot(p.L[3], p.L[4], p.L[5]);
    const [a, b, c, d] = p.shape.bb;
    let m = Infinity;
    for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]]) m = Math.min(m, p.c[1] + p.L[3] * u + p.L[4] * v);
    return m;
  }
  const minYs = (ps) => ps.reduce((m, p) => Math.min(m, minY(p)), Infinity);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    let m = buildAt(P, 0);
    const low = minYs(m.prims);
    if (low < -0.4) m = buildAt(P, -low, m.bends);
    return m;
  }

  function buildAt(P, lift, bends) {
    const prims = [];
    const sq = clamp(P.squash, -0.4, 0.4);
    const root = F(M3.diag(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5), [0, 0, 0]);
    const ballC = chain(root, T(0, BR[1] + lift, 0));
    const roll = P.roll || 0;
    const body = chain(ballC, R(M3.rz(-roll)));
    const hp = clamp(P.headPitch, -0.6, 0.6);
    const head = chain(body, R(M3.rz(hp)));
    const Hm = M3.rz(hp), Hinv = M3.rz(-hp);
    const Wm = M3.mul(M3.rz(-roll), Hm); // head frame -> world rotation (without squash)
    const mo = clamp(P.mouth, 0, 1);
    // how much a head-frame direction points into the ground (1 = straight down)
    const downness = (d) => -M3.v(Wm, d)[1];

    /* --- ball --- */
    const ballMat = (s) => {
      const h = M3.v(Hinv, s); // head-frame direction
      const az = Math.atan2(h[2], h[0]);
      const a = Math.abs(az);
      const e = bellyE(h, a);
      if (e > 0) {
        if (mo > 0.02 && a < 0.62) {
          const hh = mo * 0.2 * Math.max(0, 1 - (az / 0.62) ** 2);
          const el = faceLip(a) - h[1];
          if (el < hh) return el > hh * 0.55 && a < 0.42 ? code(TONGUE) : code(MOUTH);
        }
        return code(BELLY);
      }
      if (a < 1.05) {
        const k = 1 - (a / 1.05) ** 2;
        if (e > -0.03 * k) return code(LIP);
        if (e > -0.085 * k) return code(BODY, -1);
      }
      if (spotAt(s)) return code(SPOT);
      return code(BODY);
    };
    const ball = ell(body, BR, { part: 1, grp: 1, mat: ballMat });
    prims.push(ball);

    const onBallH = (az, v) => onEll(ball, M3.v(Hm, sph(az, v)));

    /* --- snout: a rounded muzzle between the eyes; flattens when rolled against the ground --- */
    const snV = 0.57, snEl = Math.asin(snV);
    const snDir = sph(0, snV);
    const snPress = smooth(0.55, 0.97, downness(snDir)) * 0.6;
    const snD = 0.93 - snPress * 0.16;
    const snout = chain(head, T(snDir[0] * BR[0] * snD, snDir[1] * BR[1] * snD, 0), R(M3.rz(snEl * 0.3)));
    const SN_R = [19 * (1 - snPress * 0.55), 12, 20];
    const snoutPrim = ell(snout, SN_R, {
      part: 2, grp: 2,
      mat: (s) => (s[1] < -0.66 ? code(LIP) : s[1] < -0.28 && s[0] > -0.3 ? code(BODY, -1) : code(BODY)),
    });
    prims.push(snoutPrim);

    /* --- ears: small round bumps on top --- */
    for (const side of [1, -1]) {
      const d = sph(side * 0.86, 0.86);
      const press = smooth(0.55, 0.97, downness(d)) * 0.7;
      const n = V3.norm([d[0] / BR[0], d[1] / BR[1], d[2] / BR[2]]);
      const face = V3.norm([Math.cos(side * 0.62), 0.25, Math.sin(side * 0.62)]); // ear opening direction
      const upv = V3.norm(V3.sub(n, V3.scale(face, V3.dot(n, face))));
      const lat = V3.cross(face, upv);
      const k = 0.99 - press * 0.08;
      const ear = chain(head, T(d[0] * BR[0] * k, d[1] * BR[1] * k, d[2] * BR[2] * k), F(M3.cols(face, upv, lat), [0, 0, 0]));
      prims.push(ell(ear, [6.5, 9.5 * (1 - press * 0.5), 9], {
        part: side > 0 ? 3 : 4, grp: side > 0 ? 3 : 4,
        mat: (s) => (s[0] > 0.45 && s[1] > -0.2 && s[1] * s[1] + s[2] * s[2] < 0.3 ? code(EARIN) : code(BODY)),
      }));
    }

    /* --- fangs (plates hanging from the lip) --- */
    for (const side of [1, -1]) {
      const az = side * 0.36;
      const v = faceLip(0.36) - 0.075;
      const d = sph(az, v);
      const n = V3.norm([d[0] / BR[0], d[1] / BR[1], d[2] / BR[2]]);
      const tu = V3.norm(V3.cross([0, 1, 0], n));
      const tv = V3.cross(n, tu);
      const f = chain(head, T(d[0] * BR[0] + n[0] * 0.9, d[1] * BR[1] + n[1] * 0.9, d[2] * BR[2] + n[2] * 0.9));
      prims.push(plate(f, FANG_G, { part: side > 0 ? 10 : 11, grp: side > 0 ? 10 : 11, thick: 1.4 }, [tu, tv, n]));
    }

    /* --- front flippers (fold up against the ball when they would dig into the ground) --- */
    const clap = clamp(P.clap, 0, 1);
    const flipper = (side, beta) => {
      const rootRest = sph(side * 0.9, -0.8), rootClap = sph(side * 0.4, -0.2);
      const rd = V3.norm(lerpV(rootRest, rootClap, clap));
      const rp = [rd[0] * BR[0] * 0.92, rd[1] * BR[1] * 0.92, rd[2] * BR[2] * 0.92];
      const xRest = V3.norm([0.55, -0.14, side * 0.83]), xClap = V3.norm([0.42, 0.22, -side * 0.88]);
      const yRest = [0, 1, 0], yClap = V3.norm([0, 0.2, side * 1]);
      const ax = V3.norm(lerpV(xRest, xClap, clap));
      let ay = lerpV(yRest, yClap, clap);
      ay = V3.norm(V3.sub(ay, V3.scale(ax, V3.dot(ay, ax))));
      const az3 = V3.cross(ax, ay);
      const fr = chain(body, T(...rp), F(M3.cols(ax, ay, az3), [0, 0, 0]), R(M3.rz(beta)), T(13, 0, 0));
      return ell(fr, [19, 4.2, 9.5], { part: side > 0 ? 5 : 6, grp: side > 0 ? 5 : 6, mat: () => code(FLIP) });
    };
    const tw = clamp(P.tailWag, -1, 1) * 0.5;
    const tail = (beta) => {
      const tailRoot = sph(Math.PI, -0.55);
      const tr = chain(body, T(tailRoot[0] * BR[0] * 0.8, tailRoot[1] * BR[1] * 0.8, 0), R(M3.ry(tw * (1 - beta / 1.7))), R(M3.rz(0.3 - beta)));
      const out = [ell(chain(tr, T(-10, -1, 0)), [17, 12, 13.5], { part: 7, grp: 7, mat: () => code(BODY) })];
      const flukeBase = chain(tr, T(-24, -5.5, 0), R(M3.rz(-0.34 - beta * 0.45)));
      for (const side of [1, -1]) {
        const lobe = chain(flukeBase, R(M3.ry(side * 0.62)), T(-9.5, 0, 0), R(M3.rz(-0.18)));
        out.push(ell(lobe, [13, 4.4, 9.5], { part: 7, grp: 7, mat: () => code(BODY) }));
      }
      return out;
    };
    // bends: rolling tucks the tail and flippers in; parts that would still dig into the ground fold further
    const fit = (make, b0, maxB) => {
      const low = (b) => minYs([].concat(make(b))) + lift;
      if (low(b0) >= -0.3) return b0;
      if (low(maxB) < -0.3) return maxB;
      let lo = b0, hi = maxB;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (low(mid) >= -0.3) hi = mid; else lo = mid; }
      return hi;
    };
    const tuck = smooth(0.08, 0.5, Math.abs(Math.sin(roll / 2)));
    const bf = bends || {
      n: fit((b) => flipper(1, b), tuck * 1.15, 1.45),
      f: fit((b) => flipper(-1, b), tuck * 1.15, 1.45),
      t: fit(tail, tuck * 1.35, 1.8),
    };
    prims.push(flipper(1, bf.n), flipper(-1, bf.f), ...tail(bf.t));

    /* --- anchors --- */
    const eyeN = onBallH(0.42, 0.67), eyeF = onBallH(-0.42, 0.67);
    const lipMid = onBallH(0, faceLip(0));
    const snoutTip = V3.add(snoutPrim.c, M3.v(snoutPrim.L, [1, 0.1, 0]));
    const anchors = {
      top: V3.add(ballC.t, [0, BR[1] * (1 - sq) + 4, 0]),
      mouth: lipMid.p,
      nose: snoutTip,
      belly: V3.add(ballC.t, M3.v(root.L, [BR[0], -6, 0])),
      head: V3.add(ballC.t, M3.v(head.L, V3.scale(sph(0, 0.45), BR[1] * 0.55))),
    };

    const kind = P.eyes;
    return {
      prims,
      anchors,
      pose: P,
      bends: bf,
      stamps: [
        { at: eyeN, set: EYES, colors: EYEC, kind, near: 0.62, far: 0.3 },
        { at: eyeF, set: EYES, colors: EYEC, kind, near: 0.62, far: 0.3 },
      ],
      dots: [],
      pri: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 1, 7: 1, 10: 2, 11: 2 },
      glossy: GLOSSY,
      baseMat: BODY,
      shadowSteps: 18,
    };
  }

  const render = (model, opt) => Creature.render(model, opt);

  return {
    build, render, PAL, MAT, DEFAULT,
    meta: { heightM: 0.8, bw: 206, bh: 190, oy: 0.97 },
  };
})();
