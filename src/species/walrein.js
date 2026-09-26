/* ------------------------------------------------------------------
   Walrein — the Ice Break Pokémon. A huge walrus with a fluffy white
   mane, a white collar band and long ivory tusks.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.
------------------------------------------------------------------- */
const Walrein = (() => {
  const { ell, chain, T, R, F, onEll, sph, code } = Creature;

  const BODY = 1, PATCH = 2, MANE = 3, BAND = 4, TUSK = 5, NOSE = 6, MOUTH = 7, TONGUE = 8, FLIP = 9;
  const MAT = { BODY, PATCH, MANE, BAND, TUSK, NOSE, MOUTH, TONGUE, FLIP };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#1f5a86', '#2f78a8', '#4a95c2', '#70b1d8', '#a8d4ee'], od: '#10324f', ol: '#21577f', ln: '#245e88' },
    [PATCH]:  { r: ['#3a77a4', '#5594c0', '#76b0d6', '#98c9e6', '#c4e2f4'], od: '#10324f', ol: '#21577f', ln: '#2f6c96' },
    [FLIP]:   { r: ['#1d5580', '#2c719f', '#448cba', '#68a9d2', '#a0cfea'], od: '#10324f', ol: '#21577f', ln: '#1f5a86' },
    [MANE]:   { r: ['#9fb8da', '#c3d5ec', '#e4edf8', '#f6f9fe', '#ffffff'], od: '#4a6892', ol: '#7a96be', ln: '#8ea8cc' },
    [BAND]:   { r: ['#8fb0d2', '#b8d0e8', '#e6f0fa', '#ffffff', '#ffffff'], od: '#44628c', ol: '#7792ba', ln: '#7896bc' },
    [TUSK]:   { r: ['#b99a5e', '#d6bb80', '#ecd9a6', '#f8eccb', '#fff8e6'], od: '#6e5226', ol: '#9a7a44', ln: '#a4834c' },
    [NOSE]:   { r: ['#163f60', '#1f5378', '#2c6890', '#4a86ae', '#7fb0d2'], od: '#0a2238', ol: '#17405f', ln: '#143a58' },
    [MOUTH]:  { r: ['#6a2034', '#8a3046', '#aa4a5e', '#c46676', '#dc8a94'], od: '#40101e', ol: '#62182a', ln: '#62182a' },
    [TONGUE]: { r: ['#b8566c', '#d4728a', '#ea94a4', '#f8b6be', '#ffd6da'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [BODY]: 0, [NOSE]: 1, [TUSK]: 1 };

  const DEFAULT = { headPitch: 0.12, headYaw: 0, mouth: 0, eyes: 'open', squash: 0, flipper: 0, side: 1 };

  const K = 1.08;
  const OX = 20;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- eye stamps: small dark eyes ---------- */
  const EYES = {
    open: ['.kkk.', 'kwkkk', 'kkkkk', 'kkkkk', '.kkk.'],
    openN: ['.kk.', 'wkkk', 'kkkk', 'kkkk', '.kk.'],
    openF: ['kk', 'wk', 'kk', 'kk'],
    angry: ['kk...', 'kkkk.', 'kwkkk', 'kkkkk', '.kkk.'],
    angryN: ['k...', 'kkk.', 'wkkk', 'kkkk', '.kk.'],
    angryF: ['k.', 'kk', 'wk', 'kk'],
    happy: ['.kkk.', 'k...k', 'k...k'],
    happyN: ['.kk.', 'k..k', 'k..k'],
    happyF: ['.k', 'k.', 'k.'],
    blink: ['kkkkk', '.kkk.'],
    blinkN: ['kkkk', '.kk.'],
    blinkF: ['kk', '.k'],
    closed: ['k...k', '.kkk.'],
    closedN: ['k..k', '.kk.'],
    closedF: ['k.', '.k'],
  };
  const EYEC = { k: '#101c2c', w: '#ffffff' };

  // mane lumps [x, y, z, r] in the head frame: a front ring around the face, a second ring
  // behind it, a cap on the forehead and a big puff at the back
  const MANE_L = (() => {
    const L = [];
    const ring = (x, R, r, n, a0, cut) => {
      for (let i = 0; i < n; i++) {
        const t = a0 + (i / n) * Math.PI * 2;
        const cy = Math.cos(t), cz = Math.sin(t);
        if (cy < cut) continue;
        L.push([x - 5 * (1 - cy), R * cy - 3, R * cz * 1.1, r * (cy < -0.3 ? 0.9 : 1)]);
      }
    };
    ring(-3, 32, 17, 9, 0, -0.85);
    ring(-26, 30, 21, 7, Math.PI / 7, -2);
    L.push([-48, 12, 0, 24], [-44, -14, 16, 20], [-44, -14, -16, 20], [-34, 36, 0, 18]);
    L.push([2, 32, 13, 12], [2, 32, -13, 12]);
    return L;
  })();

  // lighter marbled patches: smooth organic blobs from a few low-frequency waves (root space)
  const patchAt = (x, y, z) => {
    const f = Math.sin(x * 0.045 + 1.2) * Math.cos(z * 0.05 - 0.4) + 0.75 * Math.sin(y * 0.06 + x * 0.025 + 2.1) + 0.45 * Math.cos(z * 0.08 + y * 0.03);
    return f > 0.62;
  };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const sq = clamp(P.squash, -0.2, 0.2);
    const root = chain(F(M3.diag(K * (1 + sq * 0.25), K * (1 - sq * 0.5), K * (1 + sq * 0.25)), [0, 0, 0]), T(OX, 0, 0));
    const rinv = M3.inv(root.L), rt = root.t;

    // body material: ground clip + marbled patches (in root space so they flow across parts)
    const bodyMat = (prim, extra) => {
      const c = prim.c, L = prim.L;
      return (s) => {
        const x = c[0] + L[0] * s[0] + L[1] * s[1] + L[2] * s[2];
        const y = c[1] + L[3] * s[0] + L[4] * s[1] + L[5] * s[2];
        if (y < -0.4) return 0;
        const z = c[2] + L[6] * s[0] + L[7] * s[1] + L[8] * s[2];
        if (extra) { const e = extra(s); if (e) return e; }
        const dx = x - rt[0], dy = y - rt[1], dz = z - rt[2];
        const qx = rinv[0] * dx + rinv[1] * dy + rinv[2] * dz;
        const qy = rinv[3] * dx + rinv[4] * dy + rinv[5] * dz;
        const qz = rinv[6] * dx + rinv[7] * dy + rinv[8] * dz;
        return patchAt(qx, qy, qz) ? code(PATCH) : code(BODY);
      };
    };

    /* --- torso, rear, tail --- */
    const torso = chain(root, T(-12, 56, 0), R(M3.rz(0.1)));
    const torsoP = ell(torso, [98, 70, 68], { part: 1, grp: 1 });
    torsoP.mat = bodyMat(torsoP);
    const rear = chain(root, T(-96, 42, 0), R(M3.rz(0.28)));
    const rearP = ell(rear, [58, 38, 48], { part: 1, grp: 1 });
    rearP.mat = bodyMat(rearP);
    const tailS = chain(root, T(-142, 46, 0), R(M3.rz(0.45)));
    const tailP = ell(tailS, [30, 16, 24], { part: 1, grp: 1 });
    tailP.mat = bodyMat(tailP);
    prims.push(torsoP, rearP, tailP);
    const flukeBase = chain(tailS, T(-22, 2, 0));
    for (const side of [1, -1]) {
      const lobe = chain(flukeBase, R(M3.ry(side * 0.55)), R(M3.rx(-side * 0.5)), T(-28, 0, 0), R(M3.rz(-0.1)));
      prims.push(ell(lobe, [36, 8, 18], {
        part: 20, grp: 20,
        mat: (s) => (Math.abs(s[0] + 0.1) < 0.1 ? code(BAND) : code(FLIP)),
      }));
    }

    /* --- neck (with the white collar band) and head --- */
    const hp = clamp(P.headPitch, -0.3, 0.8);
    const neckBase = chain(root, T(48, 96, 0), R(M3.rz(-0.25 + hp * 0.35)));
    const neckP = ell(chain(neckBase, T(0, 26, 0)), [40, 54, 46], { part: 2, grp: 1 });
    neckP.mat = bodyMat(neckP, (s) => {
      const b1 = s[1] + 0.52, b2 = s[1] + 0.22;
      if (Math.abs(b1) < 0.07 || Math.abs(b2) < 0.065) return code(BAND);
      return 0;
    });
    prims.push(neckP);

    const head = chain(neckBase, T(8, 76, 0), R(M3.rz(hp * 0.65 + 0.25)), R(M3.ry(clamp(P.headYaw, -0.8, 0.8))));
    const headP = ell(head, [30, 27, 32], { part: 3, grp: 2, mat: () => code(BODY) });
    const snout = chain(head, T(26, -2, 0));
    const snoutP = ell(snout, [20, 15, 22], { part: 4, grp: 2, mat: () => code(BODY) });
    const noseP = ell(chain(snout, T(12, 7, 0)), [12, 10, 13], { part: 5, grp: 3, mat: (s) => (s[1] < -0.55 && Math.abs(s[2]) < 0.6 ? code(NOSE, -1) : code(NOSE)) });
    const mo = clamp(P.mouth, 0, 1);
    const jaw = chain(head, T(10, -14, 0), R(M3.rz(-mo * 0.55)));
    const jawP = ell(chain(jaw, T(12, -4, 0)), [18, 8, 16], { part: 6, grp: 2, mat: (s) => (s[1] > 0.45 && mo > 0.05 ? code(TONGUE) : code(BODY)) });
    prims.push(headP, snoutP, noseP, jawP);
    if (mo > 0.05) {
      // dark mouth cavity between the jaws
      const cav = chain(head, T(20, -12 - mo * 5, 0));
      prims.push(ell(cav, [14, 4 + mo * 7, 13], { part: 7, grp: 2, mat: (s) => (s[1] < -0.3 ? code(TONGUE) : code(MOUTH)) }));
    }

    /* --- tusks: smooth curved chains of ellipsoids from the upper jaw --- */
    const tuskTips = [];
    const tuskPt = (t, side) => [31 + 12 * t - 7 * t * t, -11 - 46 * t, side * (12 + 6 * t)];
    for (const side of [1, -1]) {
      const N = 11;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const p = tuskPt(t, side), q = tuskPt(t + 0.02, side);
        const r = lerp(5.4, 1.5, t ** 1.2);
        const ay = V3.norm(V3.sub(q, p)), ax = V3.norm(V3.cross(ay, [0, 0, 1])), az = V3.cross(ax, ay);
        const f = chain(head, T(...p), F(M3.cols(ax, ay, az), [0, 0, 0]));
        prims.push(ell(f, [r, 6, r], { part: side > 0 ? 8 : 9, grp: side > 0 ? 8 : 9, mat: () => code(TUSK) }));
        if (i === N - 1) tuskTips.push(V3.add(f.t, M3.v(f.L, [0, -1, 0])));
      }
    }

    /* --- mane: rings of white lumps framing the face, plus a big puff behind the head --- */
    for (const [x, y, z, r] of MANE_L) {
      prims.push(ell(chain(head, T(x, y, z)), [r, r * 0.94, r], { part: 10, grp: 10, mat: () => code(MANE) }));
    }

    /* --- front flippers --- */
    const fl = clamp(P.flipper, 0, 1);
    for (const side of [1, -1]) {
      const ax = V3.norm([0.62, -0.08 + fl * 0.5, side * 0.72]);
      const ay = V3.norm(V3.sub([0, 1, 0], V3.scale(ax, V3.dot([0, 1, 0], ax))));
      const az = V3.cross(ax, ay);
      const fr = chain(root, T(40, 18 + fl * 20, side * 50), F(M3.cols(ax, ay, az), [0, 0, 0]), T(30, 0, 0));
      const fp = ell(fr, [44, 9, 21], { part: side > 0 ? 11 : 12, grp: side > 0 ? 11 : 12, mat: () => code(FLIP) });
      const low = fp.c[1] - Math.hypot(fp.L[3], fp.L[4], fp.L[5]);
      if (low < 0) fp.c = [fp.c[0], fp.c[1] - low, fp.c[2]];
      fp.lines = [-0.4, 0, 0.4].map((w) => ({ pts: [[0.6, 0.8, w], [0.97, 0.2, w * 0.9]], mat: FLIP, useLn: true }));
      prims.push(fp);
    }

    /* --- anchors --- */
    const onHead = (az, v) => onEll(headP, sph(az, v));
    const tusk = V3.scale(V3.add(tuskTips[0], tuskTips[1]), 0.5);
    const anchors = {
      tusk,
      mouth: V3.add(head.t, M3.v(head.L, [28, -12, 0])),
      top: V3.add(head.t, M3.v(head.L, [-12, 52, 0])),
      head: headP.c,
    };
    const kind = P.eyes;
    return {
      prims, anchors, pose: P,
      stamps: [
        { at: onHead(0.62, 0.3), set: EYES, colors: EYEC, kind },
        { at: onHead(-0.62, 0.3), set: EYES, colors: EYEC, kind },
      ],
      dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 8: 3, 9: 3, 10: 2, 11: 1, 12: 1, 20: 1 },
      glossy: GLOSSY,
      baseMat: BODY,
      shadowSteps: 12,
    };
  }

  const render = (model, opt) => Creature.render(model, opt);

  return {
    build, render, PAL, MAT, DEFAULT,
    meta: { heightM: 1.4, bw: 360, bh: 300, oy: 0.9 },
  };
})();
