/* ------------------------------------------------------------------
   Walrein — the Ice Break Pokémon. A huge walrus with a fluffy white
   mane, a white collar band and long ivory tusks.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.
------------------------------------------------------------------- */
const Walrein = (() => {
  const { ell, chain, T, R, F, onEll, sph, code } = Creature;

  const BODY = 1, PATCH = 2, MANE = 3, BAND = 4, NOSE = 6, MOUTH = 7, TONGUE = 8, FLIP = 9;
  // ivory tusk tones: flat ramps, one per toon band (the tusks are shaded analytically, see build)
  const TK0 = 10, TK1 = 11, TK2 = 12, TK3 = 13;
  const MAT = { BODY, PATCH, MANE, BAND, TUSK: TK2, NOSE, MOUTH, TONGUE, FLIP, TK0, TK1, TK2, TK3 };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#1f5a86', '#2f78a8', '#4a95c2', '#70b1d8', '#a8d4ee'], od: '#10324f', ol: '#21577f', ln: '#245e88' },
    [PATCH]:  { r: ['#3a77a4', '#5594c0', '#76b0d6', '#98c9e6', '#c4e2f4'], od: '#10324f', ol: '#21577f', ln: '#2f6c96' },
    [FLIP]:   { r: ['#1d5580', '#2c719f', '#448cba', '#68a9d2', '#a0cfea'], od: '#10324f', ol: '#21577f', ln: '#1f5a86' },
    [MANE]:   { r: ['#adc3e1', '#cddbef', '#e9f0fa', '#f7fafe', '#ffffff'], od: '#4a6892', ol: '#7a96be', ln: '#93acce' },
    [BAND]:   { r: ['#8fb0d2', '#b8d0e8', '#e6f0fa', '#ffffff', '#ffffff'], od: '#44628c', ol: '#7792ba', ln: '#7896bc' },
    [TK0]:    { r: ['#c2a164', '#c2a164', '#c2a164', '#c2a164', '#c2a164'], od: '#6e5226', ol: '#9a7a44', ln: '#a4834c' },
    [TK1]:    { r: ['#dbbf86', '#dbbf86', '#dbbf86', '#dbbf86', '#dbbf86'], od: '#6e5226', ol: '#9a7a44', ln: '#a4834c' },
    [TK2]:    { r: ['#eedcab', '#eedcab', '#eedcab', '#eedcab', '#eedcab'], od: '#6e5226', ol: '#9a7a44', ln: '#a4834c' },
    [TK3]:    { r: ['#faefd2', '#faefd2', '#faefd2', '#faefd2', '#faefd2'], od: '#6e5226', ol: '#9a7a44', ln: '#a4834c' },
    [NOSE]:   { r: ['#163f60', '#1f5378', '#2c6890', '#4a86ae', '#7fb0d2'], od: '#0a2238', ol: '#17405f', ln: '#143a58' },
    [MOUTH]:  { r: ['#6a2034', '#8a3046', '#aa4a5e', '#c46676', '#dc8a94'], od: '#40101e', ol: '#62182a', ln: '#62182a' },
    [TONGUE]: { r: ['#b8566c', '#d4728a', '#ea94a4', '#f8b6be', '#ffd6da'], od: '#6e1428', ol: '#8e2038', ln: '#b04450' },
  });
  const GLOSSY = { [NOSE]: 1 };

  const DEFAULT = { headPitch: 0.12, headYaw: 0, mouth: 0, eyes: 'open', squash: 0, flipper: 0, side: 1 };

  const K = 1.08;
  const OX = 32;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- eye stamps: small dark eyes ---------- */
  const EYES = {
    open: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkkk', '.kkk.'],
    openN: ['.kk.', 'wwkk', 'wkkk', 'kkkk', 'kkkk', '.kk.'],
    openF: ['kk', 'wk', 'kk', 'kk', 'kk'],
    angry: ['kk...', '.kkk.', 'kwkkk', 'kkkkk', 'kkkkk', '.kkk.'],
    angryN: ['k...', '.kk.', 'wkkk', 'kkkk', 'kkkk', '.kk.'],
    angryF: ['k.', 'kk', 'wk', 'kk', 'kk'],
    happy: ['.kkk.', 'kk.kk', 'k...k'],
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
    const ring = (x, R, r, n, a0, cut, sx = 1.1) => {
      for (let i = 0; i < n; i++) {
        const t = a0 + (i / n) * Math.PI * 2;
        const cy = Math.cos(t), cz = Math.sin(t);
        if (cy < cut) continue;
        L.push([x - 6 * (1 - cy), R * cy + 2, R * cz * sx, r * (cy < -0.3 ? 0.9 : 1)]);
      }
    };
    ring(8, 31, 17, 9, 0, -0.55);           // front ring: forehead and cheeks, around the snout
    ring(-17, 37, 23, 8, Math.PI / 8, -0.9); // second ring
    L.push([-8, 46, 0, 20]);                 // crown
    L.push([-50, 14, 0, 32], [-46, -20, 22, 26], [-46, -20, -22, 26], [-58, -38, 0, 24], [-32, 38, 0, 24]); // back puff
    return L;
  })();

  // lighter marbled patches: smooth organic blobs from a few low-frequency waves (root space)
  const patchAt = (x, y, z) => {
    const f = Math.sin(x * 0.045 + 1.2 + z * 0.03) * Math.cos(z * 0.05 - 0.4 + y * 0.012) + 0.75 * Math.sin(y * 0.06 + x * 0.025 + 2.1 + z * 0.02);
    return f > 0.55;
  };

  // world-space topmost point over a set of ellipsoid prims (where things rest on the head)
  function topOf(prims) {
    let best = null;
    for (const p of prims) {
      const ly = Math.hypot(p.L[3], p.L[4], p.L[5]);
      const q = V3.add(p.c, M3.v(p.L, [p.L[3] / ly, p.L[4] / ly, p.L[5] / ly]));
      if (!best || q[1] > best[1]) best = q;
    }
    return best;
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const view = { L: [-0.49, 0.7, 0.49] }; // model-space light direction, updated by render()
    const sq = clamp(P.squash, -0.15, 0.15);
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
    const torso = chain(root, T(-12, 45, 0), R(M3.rz(0.14)));
    const torsoP = ell(torso, [100, 57, 68], { part: 1, grp: 1 });
    torsoP.mat = bodyMat(torsoP);
    const rear = chain(root, T(-92, 36, 0), R(M3.rz(0.32)));
    const rearP = ell(rear, [54, 32, 46], { part: 1, grp: 1 });
    rearP.mat = bodyMat(rearP);
    const tailS = chain(root, T(-128, 50, 0), R(M3.rz(0.62)));
    const tailP = ell(tailS, [26, 15, 22], { part: 1, grp: 1 });
    tailP.mat = bodyMat(tailP);
    prims.push(torsoP, rearP, tailP);
    const flukeBase = chain(tailS, T(-18, 2, 0));
    for (const side of [1, -1]) {
      const lobe = chain(flukeBase, R(M3.ry(side * 0.5)), R(M3.rx(-side * 0.62)), T(-27, 0, 0), R(M3.rz(-0.12)));
      prims.push(ell(lobe, [34, 8, 19], {
        part: 20, grp: 20,
        mat: (s) => (Math.abs(s[0] + 0.1) < 0.1 ? code(BAND) : code(FLIP)),
      }));
    }

    /* --- neck (with the white collar band) and head --- */
    const hp = clamp(P.headPitch, -0.3, 0.8);
    const neckBase = chain(root, T(48, 88, 0), R(M3.rz(-0.25 + hp * 0.55)));
    const neckP = ell(chain(neckBase, T(0, 28 + hp * 12, 0)), [46, 54 + hp * 14, 54], { part: 2, grp: 1 });
    neckP.mat = bodyMat(neckP, (s) => {
      const b1 = s[1] + 0.34, b2 = s[1] + 0.06;
      if (Math.abs(b1) < 0.065 || Math.abs(b2) < 0.06) return code(BAND);
      return 0;
    });
    const shoulder = chain(root, T(32, 90, 0), R(M3.rz(-0.35)));
    const shoulderP = ell(shoulder, [54, 46, 60], { part: 1, grp: 1 });
    shoulderP.mat = bodyMat(shoulderP);
    prims.push(neckP, shoulderP);

    const head = chain(neckBase, T(8 - hp * 6, 76 + hp * 26, 0), R(M3.rz(hp * 0.45 + 0.25)), R(M3.ry(clamp(P.headYaw, -0.8, 0.8))));
    const headP = ell(head, [32, 28, 33], { part: 3, grp: 2, mat: () => code(BODY) });
    const snout = chain(head, T(28, -2, 0));
    const snoutP = ell(snout, [22, 17, 24], { part: 4, grp: 2, mat: () => code(BODY) });
    const noseP = ell(chain(snout, T(14, 8, 0)), [13.5, 11, 14.5], { part: 5, grp: 3, mat: (s) => (s[1] < -0.55 && Math.abs(s[2]) < 0.6 ? code(NOSE, -1) : code(NOSE)) });
    const mo = clamp(P.mouth, 0, 1);
    const jaw = chain(head, T(8, -15, 0), R(M3.rz(-mo * 0.85)));
    const jawP = ell(chain(jaw, T(14, -4, 0)), [20, 9, 18], {
      part: 6, grp: 2,
      // inside of the lower jaw: pink tongue in the middle, dark gums at the rim
      mat: (s) => (mo > 0.05 && s[1] > 0.4 ? (s[1] > 0.62 && Math.abs(s[2]) < 0.5 ? code(TONGUE) : code(MOUTH, -1)) : code(BODY)),
    });
    prims.push(headP, snoutP, noseP, jawP);
    if (mo > 0.05) {
      // dark mouth cavity between the jaws
      const cav = chain(head, T(22, -13 - mo * 5, 0));
      prims.push(ell(cav, [15, 4 + mo * 8, 14], { part: 7, grp: 2, mat: (s) => (s[1] < -0.72 && Math.abs(s[2]) < 0.5 ? code(TONGUE) : code(MOUTH, s[0] > 0.5 ? 0 : -1)) }));
    }

    /* --- tusks: a dense chain of shrinking spheres along a curve. A union of spheres has rippled
       normals, so the tusks are shaded here with the normal of the ideal smooth cone instead
       (flat-ramp tone materials; the light direction is set per render by render()). --- */
    const tuskTips = [];
    const tuskPt = (t, side) => [34 + 5 * t - 12 * t * t, -12 - 50 * t, side * (13 + 8 * t)];
    const tuskTan = (t, side) => V3.norm([5 - 24 * t, -50, side * 8]);
    const TK = [code(TK0), code(TK1), code(TK2), code(TK3)];
    for (const side of [1, -1]) {
      const N = 26;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const r = lerp(5.6, 1.4, t ** 1.1);
        const f = chain(head, T(...tuskPt(t, side)));
        const a = V3.norm(M3.v(head.L, tuskTan(t, side))); // cone axis (toward the tip) in model space
        const HL = head.L;
        prims.push(ell(f, [r, r, r], {
          part: side > 0 ? 8 : 9, grp: side > 0 ? 8 : 9,
          mat: (s) => {
            let nx = HL[0] * s[0] + HL[1] * s[1] + HL[2] * s[2];
            let ny = HL[3] * s[0] + HL[4] * s[1] + HL[5] * s[2];
            let nz = HL[6] * s[0] + HL[7] * s[1] + HL[8] * s[2];
            const k = nx * a[0] + ny * a[1] + nz * a[2] - 0.08 * Math.hypot(nx, ny, nz);
            nx -= k * a[0]; ny -= k * a[1]; nz -= k * a[2];
            const L = view.L, d = (nx * L[0] + ny * L[1] + nz * L[2]) / (Math.hypot(nx, ny, nz) || 1);
            return TK[d < -0.2 ? 0 : d < 0.18 ? 1 : d < 0.74 ? 2 : 3];
          },
        }));
        if (i === N - 1) tuskTips.push(V3.add(f.t, M3.v(f.L, [0, -1, 0])));
      }
    }

    /* --- mane: rings of white lumps framing the face, plus a big puff behind the head --- */
    const maneP = [];
    for (const [x, y, z, r] of MANE_L) {
      const mp = ell(chain(head, T(x, y, z)), [r, r * 0.94, r], { part: 10, grp: 10, mat: () => code(MANE) });
      maneP.push(mp); prims.push(mp);
    }

    /* --- front flippers --- */
    const fl = clamp(P.flipper, 0, 1);
    for (const side of [1, -1]) {
      const ax = V3.norm([0.45, -0.08 + fl * 0.5, side * 0.85]);
      const ay = V3.norm(V3.sub([0, 1, 0], V3.scale(ax, V3.dot([0, 1, 0], ax))));
      const az = V3.cross(ax, ay);
      const fr = chain(root, T(38, 18 + fl * 20, side * 48), F(M3.cols(ax, ay, az), [0, 0, 0]), T(26, 0, 0));
      const fp = ell(fr, [40, 9, 20], { part: side > 0 ? 11 : 12, grp: side > 0 ? 11 : 12, mat: () => code(FLIP) });
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
      top: topOf([...maneP, headP, noseP]),
      head: headP.c,
    };
    const kind = P.eyes;
    return {
      prims, anchors, pose: P, view,
      stamps: [
        { at: onHead(0.6, 0.5), set: EYES, colors: EYEC, kind },
        // the far-side eye mirrors asymmetric expressions so angry brows slant toward the nose
        { at: onHead(-0.6, 0.5), set: EYES, colors: EYEC, kind, flipX: kind === 'angry' },
      ],
      dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 8: 3, 9: 3, 10: 2, 11: 1, 12: 1, 20: 1 },
      glossy: GLOSSY,
      baseMat: BODY,
      shadowSteps: 10,
      shadowDepth: 10,
    };
  }

  /* Render only the model's on-screen bounding box, then paste it into the full W x H sprite.
     Pixel-identical to Creature.render (nothing is drawn outside the prims), but the renderer's
     full-buffer passes then only touch the pixels the creature can actually cover. */
  function renderTight(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx);
        y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]])
          for (const w of [-p.thick, p.thick]) {
            const q = V3.add(cv, M3.v(Lv, [u, v, w]));
            x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
            y0 = Math.min(y0, -q[1]); y1 = Math.max(y1, -q[1]);
          }
      }
    }
    const pad = 4;
    const X0 = Math.max(0, Math.floor(ox + x0) - pad), X1 = Math.min(W, Math.ceil(ox + x1) + pad);
    const Y0 = Math.max(0, Math.floor(oy + y0) - pad), Y1 = Math.min(H, Math.ceil(oy + y1) + pad);
    const w = X1 - X0, h = Y1 - Y0;
    if (!(w > 0 && h > 0) || w * h > W * H * 0.9) return Creature.render(model, opt);
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - X0, oy: oy - Y0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s0 = y * w, d0 = (y + Y0) * W + X0;
      buf.d.set(r.buf.d.subarray(s0, s0 + w), d0);
      depth.set(r.depth.subarray(s0, s0 + w), d0);
      part.set(r.part.subarray(s0, s0 + w), d0);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + X0, a[1] + Y0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  function render(model, opt) {
    if (model.view) {
      // light direction in model space = inverse view rotation applied to the (view-space) light
      const Ld = V3.norm((opt.light && opt.light.dir) || [-0.5, 0.72, 0.5]);
      model.view.L = M3.v(M3.mul(M3.ry(opt.yaw ?? 1.05), M3.rx(-(opt.pitch ?? 0.16))), Ld);
    }
    return renderTight(model, opt);
  }

  return {
    build, render, PAL, MAT, DEFAULT,
    meta: { heightM: 1.4, bw: 384, bh: 306, oy: 0.922 },
  };
})();
