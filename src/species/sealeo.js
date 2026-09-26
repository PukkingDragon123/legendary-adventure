/* ------------------------------------------------------------------
   Sealeo — the Ball Roll Pokémon. An upright seal with a bristly
   white moustache that balances things on the tip of its nose.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.
------------------------------------------------------------------- */
const Sealeo = (() => {
  const { ell, plate, chain, T, R, F, onEll, sph, code } = Creature;

  const BODY = 1, BELLY = 2, WHISK = 3, TUSK = 4, NOSE = 5, MOUTH = 6, TONGUE = 7, FLIP = 8;
  const MAT = { BODY, BELLY, WHISK, TUSK, NOSE, MOUTH, TONGUE, FLIP };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#2d82bf', '#48a3dc', '#6fc2ee', '#9fdaf7', '#d4f1ff'], od: '#164a82', ol: '#2b78b6', ln: '#2f7ebb' },
    [FLIP]:   { r: ['#2a7ab6', '#4299d4', '#66b8e8', '#94d2f4', '#c8ecfd'], od: '#164a82', ol: '#2b78b6', ln: '#236aa6' },
    [BELLY]:  { r: ['#dcc398', '#ecdcb8', '#f8eed3', '#fdf7e7', '#fffdf6'], od: '#87663c', ol: '#b08d5a', ln: '#c6a472' },
    [WHISK]:  { r: ['#9cb6cc', '#c6d9e8', '#edf5fb', '#ffffff', '#ffffff'], od: '#44658a', ol: '#7896b4', ln: '#86a3bf' },
    [TUSK]:   { r: ['#b6b2a2', '#d7d3c3', '#f3f0e5', '#ffffff', '#ffffff'], od: '#6b6555', ol: '#8e8876', ln: '#98927e' },
    [NOSE]:   { r: ['#121a2a', '#1c273c', '#2a3a55', '#415677', '#6a80a4'], od: '#0a0f1a', ol: '#141c2c', ln: '#141c2c' },
    [MOUTH]:  { r: ['#561828', '#742336', '#943244', '#b24756', '#cc646e'], od: '#380c18', ol: '#561424', ln: '#561424' },
    [TONGUE]: { r: ['#bc4c62', '#d8687a', '#ee8a94', '#ffadb0', '#ffcfcc'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [BODY]: 1, [FLIP]: 1, [NOSE]: 1, [TUSK]: 0 };

  const DEFAULT = { headPitch: 0, headYaw: 0, mouth: 0, eyes: 'open', flipper: 0, clap: 0, squash: 0, tailWag: 0, lean: 0, side: 1 };

  const K = 1.0; // overall model scale (Pokédex height 1.1 m)
  const OX = 50; // model x offset so the body is centred on the origin
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- moustache fan: five white strips radiating from the snout (u = outward, v = up) ---------- */
  const STRIPS = [
    { a: 0.06, L: 62, w: 12.5 },
    { a: -0.3, L: 59, w: 12.5 },
    { a: -0.66, L: 54, w: 12.5 },
    { a: -1.0, L: 47, w: 12 },
    { a: -1.33, L: 40, w: 11.5 },
  ].map((s) => ({ ...s, c: Math.cos(s.a), s: Math.sin(s.a) }));
  const whiskShape = {
    bb: [-6, -48, 66, 11],
    test(u, v) {
      for (const st of STRIPS) {
        const al = u * st.c + v * st.s, pe = -u * st.s + v * st.c;
        const hw = st.w / 2 * (0.62 + 0.38 * clamp(al / st.L, 0, 1));
        if (al < -4 || al > st.L || Math.abs(pe) > hw) continue;
        const cr = 2.5; // rounded outer corners
        if (al > st.L - cr && Math.abs(pe) > hw - cr) {
          const dx = al - (st.L - cr), dy = Math.abs(pe) - (hw - cr);
          if (dx * dx + dy * dy > cr * cr) continue;
        }
        return al < 12 ? code(WHISK) : code(WHISK, 1);
      }
      return 0;
    },
  };
  const WHISK_G = bakeShape(whiskShape);

  /* ---------- eye stamps: small dark-brown eyes with a shine ---------- */
  const EYES = {
    open: ['..kkk..', '.kkkkk.', 'kwwkkkk', 'kwwkkkk', 'kkkkkkk', 'kkrrrkk', 'krrrrrk', '.krrrk.', '..kkk..'],
    openN: ['..kk..', '.kkkk.', 'kwwkkk', 'kwwkkk', 'kkkkkk', 'kkrrkk', 'krrrrk', '.krrk.', '..kk..'],
    openF: ['.kk.', 'kwkk', 'wwkk', 'kkkk', 'kkkk', 'krrk', 'krrk', '.kk.'],
    happy: ['..kkk..', '.kkkkk.', 'kk...kk', 'k.....k'],
    happyN: ['.kkkk.', 'kk..kk', 'k....k'],
    happyF: ['.kk.', 'k..k', 'k..k'],
    blink: ['kkkkkkk', '.kkkkk.'],
    blinkN: ['kkkkkk', '.kkkk.'],
    blinkF: ['kkkk', '.kk.'],
    closed: ['k.....k', '.kk.kk.', '...k...'],
    closedN: ['k....k', '.kkkk.'],
    closedF: ['k..k', '.kk.'],
  };
  const EYEC = { k: '#1e1616', w: '#ffffff', r: '#5b3c2f' };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const sq = clamp(P.squash, -0.25, 0.25);
    // origin = middle of the body on the ground (OX shifts the model so its footprint is centred)
    const root = chain(F(M3.diag(K * (1 + sq * 0.3), K * (1 - sq * 0.6), K * (1 + sq * 0.3)), [0, 0, 0]), T(OX, 0, 0));
    // the upright front half rocks on the ground under the chest for `lean`; the back bends half as much
    const lean = clamp(P.lean, -0.35, 0.35);
    const pivot = chain(root, T(22, 30, 0), R(M3.rz(-lean)), T(0, -30, 0));
    const pivotH = chain(root, T(22, 30, 0), R(M3.rz(-lean * 0.5)), T(0, -30, 0));

    /* --- body: rear (lying), sloping back, chest (upright) and neck, one smooth group.
       Big ellipsoids are clipped at the ground so the body sits flat; the cream belly is a
       volume in the pivot frame so it runs continuously across the parts. --- */
    const pinv = M3.inv(pivot.L), pt = pivot.t;
    const bodyMat = (prim, spots) => {
      const c = prim.c, L = prim.L;
      return (s) => {
        const x = c[0] + L[0] * s[0] + L[1] * s[1] + L[2] * s[2];
        const y = c[1] + L[3] * s[0] + L[4] * s[1] + L[5] * s[2];
        if (y < -0.4) return 0; // ground clip
        const z = c[2] + L[6] * s[0] + L[7] * s[1] + L[8] * s[2];
        const dx = x - pt[0], dy = y - pt[1], dz = z - pt[2];
        const qx = pinv[0] * dx + pinv[1] * dy + pinv[2] * dz;
        const qy = pinv[3] * dx + pinv[4] * dy + pinv[5] * dz;
        const qz = pinv[6] * dx + pinv[7] * dy + pinv[8] * dz;
        if (qx > BELLY_F[0] + BELLY_F[1] * qz * qz - BELLY_F[2] * (qy - BELLY_F[3])) return code(BELLY);
        if (spots) for (const sd of spots) if (s[0] * sd.d[0] + s[1] * sd.d[1] + s[2] * sd.d[2] > sd.c) return code(BELLY);
        return code(BODY);
      };
    };
    const rear = chain(root, T(-78, 20, 0), R(M3.rz(0.12)));
    const rearPrim = ell(rear, [48, 30, 40], { part: 1, grp: 1 });
    rearPrim.mat = bodyMat(rearPrim, SPOTS_R);
    const egg = chain(pivotH, T(-50, 62, 0), R(M3.rz(0.47)));
    const eggPrim = ell(egg, [90, 58, 50], { part: 1, grp: 1 });
    eggPrim.mat = bodyMat(eggPrim, SPOTS_B);
    const chest = chain(pivot, T(-2, 50, 0), R(M3.rz(0.05)));
    const chestPrim = ell(chest, [52, 70, 54], { part: 2, grp: 1 });
    chestPrim.mat = bodyMat(chestPrim, SPOTS_C);
    const neck = chain(pivot, T(-12, 124, 0), R(M3.rz(P.headPitch * 0.3)));
    prims.push(rearPrim, eggPrim, chestPrim);

    /* --- head --- */
    const head = chain(neck, R(M3.rz(P.headPitch * 0.7)), R(M3.ry(clamp(P.headYaw, -0.9, 0.9))), T(3, 22, 0));
    const HR = [39, 35, 45];
    const mo = clamp(P.mouth, 0, 1);
    const headPrim = ell(head, HR, {
      part: 3, grp: 1,
      mat: (s) => {
        const az = Math.atan2(s[2], s[0]), a = Math.abs(az);
        if (a < 1.25) {
          const vm = -0.3 - 0.25 * (a / 1.25) ** 2; // top of the cream chin
          const h = mo * 0.28 * Math.max(0, 1 - (az / 0.5) ** 2);
          if (h > 0.02 && s[1] < vm && s[1] > vm - h) return s[1] < vm - h * 0.6 && a < 0.3 ? code(TONGUE) : code(MOUTH);
          if (s[1] < vm - h + 0.015) return code(BELLY);
        }
        return code(BODY);
      },
    });
    prims.push(headPrim);

    /* --- snout, nose --- */
    const snout = chain(head, T(37, -2, 0));
    const snoutPrim = ell(snout, [9.5, 8.5, 12.5], { part: 4, grp: 2, mat: () => code(BODY) });
    prims.push(snoutPrim);
    const nosePrim = ell(chain(snout, T(6.2, 5, 0)), [3, 2.4, 4.4], { part: 5, grp: 3, mat: () => code(NOSE) });
    prims.push(nosePrim);

    /* --- tusks --- */
    for (const side of [1, -1]) {
      const t = chain(head, T(40, -20, side * 8.5), R(M3.rz(0.08)));
      prims.push(ell(t, [3.6, 8, 3.8], { part: side > 0 ? 6 : 7, grp: side > 0 ? 6 : 7, mat: (s) => (s[1] > 0.6 ? code(TUSK) : code(TUSK, 1)) }));
    }

    /* --- moustache fans --- */
    for (const side of [1, -1]) {
      const sweep = 0.3;
      const u = [-Math.sin(sweep), 0, side * Math.cos(sweep)];
      const v = [0, 1, 0];
      const n = V3.cross(u, v);
      const f = chain(head, T(42, 1, side * 9));
      prims.push(plate(f, WHISK_G, { part: side > 0 ? 8 : 9, grp: side > 0 ? 8 : 9, thick: 1.8 }, [u, v, n]));
    }

    /* --- front flippers: rest (on the ground) -> raised (up and out) -> clap (meet in front) --- */
    const fl = clamp(P.flipper, 0, 1), cl = clamp(P.clap, 0, 1);
    const ortho = (v, a) => V3.norm(V3.sub(v, V3.scale(a, V3.dot(v, a))));
    for (const side of [1, -1]) {
      const rootP = lerpV(lerpV([6, -30, side * 44], [8, -12, side * 46], fl), [26, -6, side * 40], cl);
      let ax = lerpV([0.56, -0.22, side * 0.8], [0.22, 0.78, side * 0.58], fl);
      ax = V3.norm(lerpV(V3.norm(ax), [0.62, 0.26, -side * 0.74], cl));
      let ay = lerpV(lerpV([0, 1, 0], [1, 0, 0], fl), [0, 0.1, -side], cl);
      ay = ortho(ay, ax);
      const az = V3.cross(ax, ay);
      const fr = chain(chest, T(...rootP), F(M3.cols(ax, ay, az), [0, 0, 0]), T(25, 0, 0));
      const fp = ell(fr, [33, 7.5, 16], { part: side > 0 ? 10 : 11, grp: side > 0 ? 10 : 11, mat: () => code(FLIP) });
      const low = fp.c[1] - Math.hypot(fp.L[3], fp.L[4], fp.L[5]);
      if (low < 0) fp.c = [fp.c[0], fp.c[1] - low, fp.c[2]];
      fp.lines = [-0.36, 0, 0.36].map((w) => ({ pts: [[0.62, 0.8, w], [0.97, 0.2, w * 0.9]], mat: FLIP, useLn: true }));
      prims.push(fp);
    }

    /* --- tail and fluke --- */
    const tw = clamp(P.tailWag, -1, 1) * 0.45;
    const tail = chain(rear, T(-52, -6, 0), R(M3.ry(tw)), R(M3.rz(0.1)));
    prims.push(ell(chain(tail, T(-16, 1, 0)), [29, 12, 15], { part: 12, grp: 12, mat: () => code(BODY) }));
    const fluke = chain(tail, T(-38, 1, 0));
    for (const side of [1, -1]) {
      const lobe = chain(fluke, R(M3.ry(side * 0.45)), R(M3.rx(-side * 0.55)), T(-12, 0, 0), R(M3.rz(-0.22)));
      prims.push(ell(lobe, [18, 4.4, 9.5], { part: 12, grp: 12, mat: () => code(FLIP) }));
    }

    /* --- anchors --- */
    const onHead = (az, v) => onEll(headPrim, sph(az, v));
    // topmost point of the nose: where a juggled object rests
    const Ly = [nosePrim.L[3], nosePrim.L[4], nosePrim.L[5]], ly = Math.hypot(...Ly);
    const noseTip = V3.add(nosePrim.c, M3.v(nosePrim.L, V3.scale(Ly, 1 / ly)));
    const anchors = {
      nose: noseTip,
      top: V3.add(headPrim.c, M3.v(headPrim.L, [0, 1, 0])),
      mouth: onHead(0, -0.42).p,
      head: headPrim.c,
    };
    const kind = P.eyes;
    return {
      prims, anchors, pose: P,
      stamps: [
        { at: onHead(0.5, 0.35), set: EYES, colors: EYEC, kind },
        { at: onHead(-0.5, 0.35), set: EYES, colors: EYEC, kind },
      ],
      dots: [],
      pri: { 1: 0, 2: 0, 3: 2, 6: 2, 7: 2, 8: 3, 9: 3, 10: 1, 11: 1, 12: 1 },
      glossy: GLOSSY,
      baseMat: BODY,
      shadowSteps: 14,
    };
  }

  // cream spots: [az, v, angular radius]
  const mkSpots = (list) => list.map(([az, v, r]) => ({ d: sph(az, v), c: Math.cos(r) }));
  const SPOTS_R = mkSpots([[0.95, -0.15, 0.13], [-0.95, -0.15, 0.13]]);
  // belly boundary in the pivot frame: cream where x > X0 + A*z^2 - C*(y - Y0)  [X0, A, C, Y0]
  const BELLY_F = [27, 0.0013, 0.255, 57];
  const SPOTS_C = mkSpots([[1.0, -0.02, 0.17], [-1.0, -0.02, 0.17]]);
  const SPOTS_B = mkSpots([[1.35, -0.3, 0.12], [-1.35, -0.3, 0.12]]);

  const render = (model, opt) => Creature.render(model, opt);

  return {
    build, render, PAL, MAT, DEFAULT,
    meta: { heightM: 1.1, bw: 302, bh: 248, oy: 0.9 },
  };
})();
