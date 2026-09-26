/* ------------------------------------------------------------------
   Wailord — the Float Whale Pokémon. A posable 3D model rendered
   straight to pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = near side at yaw 0, ground
   (bottom of the belly) at y = 0. 175 units = 1 m: ~2540 long.
------------------------------------------------------------------- */
const Wailord = (() => {
  const { ell, plate, chain, T, R, F, code } = Creature;

  // material ids
  const BODY = 1, BELLY = 2, FIN = 3, MOUTH = 4, TONGUE = 5, EYE = 6, EYEW = 7;
  const MAT = { BODY, BELLY, FIN, MOUTH, TONGUE, EYE, EYEW };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#1f5596', '#2e73b9', '#3c8ad1', '#56a2e0', '#cfeaff'], od: '#10295a', ol: '#1f4b8c', ln: '#1c4788' },
    [FIN]:    { r: ['#1f5596', '#2e73b9', '#3c8ad1', '#56a2e0', '#cfeaff'], od: '#10295a', ol: '#1f4b8c', ln: '#1b4583' },
    [BELLY]:  { r: ['#9c989b', '#bab6b7', '#d8d5d3', '#eae8e6', '#f8f7f5'], od: '#45404a', ol: '#6f6a70', ln: '#5e5963' },
    [MOUTH]:  { r: ['#3e0c1a', '#5c1426', '#7e2234', '#9c3446', '#b84c5a'], od: '#2a0610', ol: '#420c1a', ln: '#420c1a' },
    [TONGUE]: { r: ['#a43c52', '#c45468', '#de7282', '#ee94a0', '#f8b8c0'], od: '#5c1426', ol: '#7e2234', ln: '#8c2c40' },
    [EYE]:    { r: ['#0a0f1c', '#0e1422', '#121a2b', '#182236', '#223050'], od: '#070b14', ol: '#070b14', ln: '#070b14' },
    [EYEW]:   { r: ['#d8e4f4', '#eef4fc', '#ffffff', '#ffffff', '#ffffff'], od: '#070b14', ol: '#070b14', ln: '#070b14' },
  });

  const DEFAULT = { tail: 0, fin: 0, mouth: 0, eyes: 'open', blow: 0, roll: 0, side: 1 };

  /* ---------- helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MIRZ = M3.diag(1, 1, -1);
  const mirror = (f) => F(M3.mul(MIRZ, f.L), M3.v(MIRZ, f.t));
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));
  function frameUW(u, w) {
    const U = V3.norm(u);
    const W = V3.norm(V3.sub(w, V3.scale(U, V3.dot(w, U))));
    return M3.cols(U, V3.cross(W, U), W);
  }

  /* ---------- body: a smooth asymmetric egg made of four quarter-ellipsoids that share one centre and
     tilt (front/rear lengths, top/bottom heights, common width). Each draws only its own quadrant, so
     the pieces meet with matching cross-sections and normals: no creases. Fitted to the official
     silhouette (big domed head, long taper to a mid-height tail). ---------- */
  const EGG = { c: [683, 0, 0], rxf: 580, rxr: 1657, ryt: 540, ryb: 540, rz: 575, a: 0.1 };
  {
    // put the lowest point of the belly on the ground (y = 0)
    const ca = Math.cos(EGG.a), sa = Math.sin(EGG.a);
    let lo = Infinity;
    for (let i = 0; i < 720; i++) {
      const t = (i / 720) * 2 * Math.PI, ct = Math.cos(t), st = Math.sin(t);
      const lx = ct * (ct >= 0 ? EGG.rxf : EGG.rxr), ly = st * (st >= 0 ? EGG.ryt : EGG.ryb);
      lo = Math.min(lo, sa * lx + ca * ly);
    }
    EGG.c[1] = -lo;
  }
  const QUADS = EGG.ryt === EGG.ryb ? [
    { id: 'F', r: [EGG.rxf, EGG.ryt, EGG.rz], sx: 1, sy: 0 },
    { id: 'R', r: [EGG.rxr, EGG.ryt, EGG.rz], sx: -1, sy: 0 },
  ] : [
    { id: 'FT', r: [EGG.rxf, EGG.ryt, EGG.rz], sx: 1, sy: 1 },
    { id: 'FB', r: [EGG.rxf, EGG.ryb, EGG.rz], sx: 1, sy: -1 },
    { id: 'RT', r: [EGG.rxr, EGG.ryt, EGG.rz], sx: -1, sy: 1 },
    { id: 'RB', r: [EGG.rxr, EGG.ryb, EGG.rz], sx: -1, sy: -1 },
  ];
  for (const Q of QUADS) {
    Q.c = EGG.c; Q.a = EGG.a;
    Q.R = M3.rz(EGG.a);
    Q.L = M3.mul(Q.R, M3.diag(...Q.r));
    Q.Li = M3.inv(Q.L);
  }
  const FT = QUADS[0];
  const toLocal = (E, p) => M3.v(E.Li, V3.sub(p, E.c));
  const toModel = (E, q) => V3.add(E.c, M3.v(E.L, q));
  const inQuad = (Q, q) => q[0] * Q.sx >= -1e-6 && q[1] * Q.sy >= -1e-6;
  // quadrant containing the (in-plane) model point, and its unit-sphere direction there (near side)
  function quadDir(x, y, zSign = 1) {
    for (const Q of QUADS) {
      const q = toLocal(Q, [x, y, 0]);
      if (!inQuad(Q, q)) continue;
      return { Q, s: V3.norm([q[0], q[1], zSign * Math.sqrt(Math.max(0, 1 - q[0] * q[0] - q[1] * q[1]))]) };
    }
    return { Q: FT, s: [0, 1, 0] };
  }
  const REAR_POLE = toModel(QUADS.find((Q) => Q.sx < 0), [-1, 0, 0]);

  // jaw line / belly boundary: height as a function of x (lookup table, Catmull-Rom through JAW)
  const JAW = [[-1100, 455], [-700, 468], [-300, 515], [100, 605], [400, 710], [700, 815], [900, 868], [1100, 915], [1320, 950]];
  const JAW_T = new Float32Array(260);
  for (let i = 0; i < 260; i++) {
    const x = -1100 + i * 10;
    let k = 0;
    while (k < JAW.length - 2 && x > JAW[k + 1][0]) k++;
    const p0 = JAW[Math.max(0, k - 1)], p1 = JAW[k], p2 = JAW[k + 1], p3 = JAW[Math.min(JAW.length - 1, k + 2)];
    const t = clamp((x - p1[0]) / (p2[0] - p1[0]), 0, 1), t2 = t * t, t3 = t2 * t;
    JAW_T[i] = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  }
  const jawY = (x) => { const f = clamp((x + 1100) / 10, 0, 258.99), i = f | 0; return JAW_T[i] + (JAW_T[i + 1] - JAW_T[i]) * (f - i); };

  /* ---------- belly grooves: curves where the body surface meets planes through a tilted axis
     (from the lower rear, where they converge, to a point high in front of the snout, so their
     front ends fan out below the jaw line). Stored in FT's local coordinates + model normals. ---------- */
  const GROOVES = (() => {
    const Rp = [-780, 420, 0], Fp = [1450, 1060, 0];
    const a = V3.norm(V3.sub(Fp, Rp)), b1 = [a[1], -a[0], 0], b2 = [0, 0, 1];
    const len = Math.hypot(Fp[0] - Rp[0], Fp[1] - Rp[1]);
    const cosPhi = [0.93, 0.8, 0.65, 0.5, 0.34, 0.18];
    const out = [];
    cosPhi.forEach((cp, gi) => {
      const sp = Math.sqrt(1 - cp * cp);
      for (const zs of [1, -1]) {
        const d = V3.add(V3.scale(b1, cp), V3.scale(b2, sp * zs));
        let cur = [];
        const flush = () => { if (cur.length > 2) out.push(cur); cur = []; };
        for (let t = -200; t <= len; t += 16) {
          const A = V3.add(Rp, V3.scale(a, t));
          let best = -1, bestE = null;
          for (const E of QUADS) {
            const o = toLocal(E, A), dl = M3.v(E.Li, d);
            const qa = V3.dot(dl, dl), qb = 2 * V3.dot(o, dl), qc = V3.dot(o, o) - 1;
            const disc = qb * qb - 4 * qa * qc;
            if (disc < 0) continue;
            const s = (-qb + Math.sqrt(disc)) / (2 * qa);
            if (s > best && inQuad(E, V3.add(o, V3.scale(dl, s)))) { best = s; bestE = E; }
          }
          if (best <= 0) { flush(); continue; }
          const P = V3.add(A, V3.scale(d, best));
          const ql = toLocal(bestE, P), Li = bestE.Li;
          const n = V3.norm([Li[0] * ql[0] + Li[3] * ql[1] + Li[6] * ql[2], Li[1] * ql[0] + Li[4] * ql[1] + Li[7] * ql[2], Li[2] * ql[0] + Li[5] * ql[1] + Li[8] * ql[2]]);
          if (P[1] < jawY(P[0]) - 22 && P[0] > Rp[0] + 90 + gi * 30) cur.push({ q: toLocal(FT, P), n });
          else flush();
        }
        flush();
      }
    });
    return out;
  })();

  /* ---------- fins and flukes (plates, baked at 2-unit resolution) ---------- */
  // swept-back dorsal fin: a long low blade (u = forward, v = up; base on the back, tip pointing back)
  const DORSAL = bakeShape(Shape2D.poly([[135, -40], [112, 22], [45, 82], [-60, 128], [-200, 156], [-335, 166], [-300, 122], [-236, 84], [-165, 40], [-115, -40]], code(FIN)), 2);
  const DORSAL_LINES = [
    { pts: [[0, 30, 0], [-130, 88, 0], [-290, 136, 0]], mat: FIN, useLn: true },
  ];
  // pectoral flipper (u = back along the body, v = down)
  const PECT = bakeShape(Shape2D.poly([[-10, -40], [60, -36], [170, -14], [270, 30], [300, 58], [230, 60], [120, 40], [20, 36], [-20, 10]], code(FIN)), 2);
  // tail lobes (u = backward, v = up): long blue upper blade, small grey lower spike
  // both lobes in one plate (no overlapping coplanar plates): blue above the split line, grey below
  const FLUKE_UP_P = Shape2D.catmull([[-40, -60], [70, -40], [200, 10], [330, 60], [420, 96], [310, 100], [170, 82], [50, 62], [-40, 50]], true, 8);
  const FLUKE_LO_P = Shape2D.catmull([[-40, 30], [60, 16], [140, -20], [210, -66], [145, -68], [60, -52], [-40, -40]], true, 8);
  const FLUKES = bakeShape({
    bb: [-45, -75, 425, 105],
    test(u, v) {
      const up = Shape2D.inPoly(u, v, FLUKE_UP_P), lo = Shape2D.inPoly(u, v, FLUKE_LO_P);
      if (!up && !lo) return 0;
      if (up && lo) return v > 4 - 0.25 * u ? code(FIN) : code(BELLY);
      return up ? code(FIN) : code(BELLY);
    },
  }, 2);

  // body top height at x (for seating the dorsal fins)
  function topAt(x) {
    let best = 0;
    for (const Q of QUADS) {
      for (let i = 0; i <= 400; i++) {
        const th = (i / 400) * Math.PI;
        const q = [Math.cos(th), Math.sin(th), 0];
        if (!inQuad(Q, q)) continue;
        const p = toModel(Q, q);
        if (Math.abs(p[0] - x) < 8) best = Math.max(best, p[1]);
      }
    }
    return best;
  }
  const FIN_POS = [{ x: -110, s: 1 }, { x: -500, s: 0.84 }].map((d) => Object.assign(d, { y: topAt(d.x) - 12 * d.s }));

  const EYE_D = quadDir(700, 895), EYE_S = EYE_D.s, EYE_SF = [EYE_S[0], EYE_S[1], -EYE_S[2]];
  const EYE_TV = V3.norm(V3.sub([0, 1, 0], V3.scale(EYE_S, EYE_S[1]))), EYE_TU = V3.cross(EYE_TV, EYE_S);
  let EYE_DECAL = false, EYE_KIND = 'open';
  const BLOW_D = quadDir(640, 1085);
  const PECT_D = quadDir(520, 735);
  const PECT_AT = V3.add(toModel(PECT_D.Q, PECT_D.s), [0, 0, -12]);

  let HL = null, HLl = [0, 1, 0]; // highlight direction in model space / in the egg's local frame (set per render)
  // points covering one octant-pair of the unit sphere (x, y >= 0, both z signs), for bounding quarter prims
  const QUAD_SAMPLES = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const th = (i / 12) * (Math.PI / 2), ph = (j / 12) * Math.PI; // th: angle in the x-y quadrant, ph: around it
    const c = Math.cos(th), sn = Math.sin(th);
    for (const zs of [1, -1]) {
      const sp = Math.sin(ph), cp = Math.cos(ph);
      // meridian from the x-y quadrant point toward +/-z
      QUAD_SAMPLES.push([c * sp, sn * sp, zs * Math.abs(cp)]);
    }
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const bl = clamp(P.blow, 0, 1), mo = clamp(P.mouth, 0, 1), roll = clamp(P.roll || 0, -0.6, 0.6);
    const prims = [];
    // squash before spouting (anchored at the belly) and roll about the long axis
    const D = M3.diag(1 + 0.05 * bl, 1 - 0.1 * bl, 1 + 0.05 * bl);
    const root = chain(F(D, [0, 0, 0]), T(0, 560, 0), R(M3.rx(roll)), T(0, -560, 0));
    const mouthA = mo * 0.14;
    const bodyMat = (E) => {
      const ca = Math.cos(E.a), sa = Math.sin(E.a), rx = E.r[0], ry = E.r[1], rz = E.r[2];
      return (s) => {
        const lx = s[0] * rx, ly = s[1] * ry;
        const x = E.c[0] + ca * lx - sa * ly, y = E.c[1] + sa * lx + ca * ly;
        const yb = jawY(x);
        if (y < yb) {
          // open mouth: a dark wedge below the jaw line at the front, tongue at its floor
          if (mouthA > 0.003 && x > 560) {
            const k = (x - 560) / 700, h = mouthA * 900 * k * Math.min(1, k * 3);
            if (y > yb - h) return code(y < yb - h * 0.62 ? TONGUE : MOUTH);
          }
          return code(BELLY);
        }
        if (E === FT) {
          // eyes as surface decals when rendered large (stamps are used for small scales)
          if (EYE_DECAL) {
            const zs = s[2] < 0 ? -1 : 1, ex = s[0] - EYE_S[0], ey = s[1] - EYE_S[1], ez = s[2] * zs - EYE_S[2];
            const du = ex * EYE_TU[0] + ey * EYE_TU[1] + ez * EYE_TU[2], dv = ex * EYE_TV[0] + ey * EYE_TV[1] + ez * EYE_TV[2];
            const ek = EYE_KIND, R0 = 0.03;
            if (Math.abs(du) < 0.06 && Math.abs(dv) < 0.06) {
              if (ek === 'happy') { const rr = Math.hypot(du, dv + 0.012); if (dv > -0.012 && rr < R0 * 1.15 && rr > R0 * 0.55) return code(EYE); }
              else if (ek === 'closed') { if (Math.abs(dv + 0.008 - 12 * du * du) < 0.006 && Math.abs(du) < R0 * 1.1) return code(EYE); }
              else {
                const r2 = (du * du) / (R0 * R0 * 0.8) + (dv * dv) / (R0 * R0 * 1.15);
                if (r2 < 1) { const gu = du - zs * 0.3 * R0, gv = dv - 0.35 * R0; return gu * gu + gv * gv < R0 * R0 * 0.12 ? code(EYEW) : code(EYE); }
              }
            }
          }
          // blowhole on top of the head
          const bx = (x - 640) / 55, bz = (s[2] * rz) / 30;
          if (y > 1000 && bx * bx + bz * bz < 1) return code(BODY, -2);
        }
        // small glossy highlight on the head (HL = half vector in model space, set per render)
        if (HL && E.sy >= 0 && x > -250) {
          // local-frame normal vs local-frame half vector; deviations along the long axis count double so the
          // spot stays round on this long, gently curved body
          const ux = s[0] / rx, uy = s[1] / ry, uz = s[2] / rz, ul = Math.hypot(ux, uy, uz);
          const dx = ux / ul - HLl[0], dy = uy / ul - HLl[1], dz = uz / ul - HLl[2];
          if (4 * dx * dx + dy * dy + dz * dz < 0.0064) return code(BODY, 2);
        }
        return code(BODY);
      };
    };
    const bodyF = (E) => chain(root, T(...E.c), R(E.R));
    const qPrims = QUADS.map((Q) => {
      const base = bodyMat(Q);
      return ell(bodyF(Q), Q.r, { part: 1, grp: 1, quad: [Q.sx, Q.sy], mat: (sv) => (sv[0] * Q.sx < 0 || sv[1] * Q.sy < 0 ? 0 : base(sv)) });
    });
    const mainF = bodyF(FT), mainP = qPrims[0];
    mainP.grooves = GROOVES;
    prims.push(...qPrims);

    // dorsal fins: two long low blades in a row on the back
    for (const d of FIN_POS) {
      const f = chain(root, T(d.x, d.y, 0), R(M3.rz(0.12)), F(M3.diag(d.s, d.s, 1), [0, 0, 0]));
      prims.push(plate(f, DORSAL, { part: 2, grp: 2, thick: 14, lines: DORSAL_LINES }));
    }
    // pectoral flippers behind the mouth corner (flap with P.fin); the visible one opens a little toward the camera
    for (const k of [1, -1]) {
      let f = chain(T(...PECT_AT), R(frameUW([-0.9, -0.3, 0.2], [0.1, 0.2, 1])), R(M3.rx(-0.6 * clamp(P.fin, -1, 1))), R(M3.rx(0.15 * k * (P.side ?? 1))));
      if (k < 0) f = mirror(f);
      prims.push(plate(chain(root, f), PECT, { part: k > 0 ? 3 : 4, grp: k > 0 ? 3 : 4, thick: 14 }, [[1, 0, 0], [0, -1, 0], [0, 0, 1]]));
    }
    // tail lobes hinged at the tail stock, swinging up/down with P.tail
    const tailF = chain(root, T(REAR_POLE[0] + 30, REAR_POLE[1], 0), R(M3.rz(-0.3 * clamp(P.tail, -1, 1))));
    const flip = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
    prims.push(plate(tailF, FLUKES, { part: 5, grp: 5, thick: 16 }, flip));

    const qP = (D) => qPrims[QUADS.indexOf(D.Q)], qF = (D) => bodyF(D.Q);
    const eyeAt = { p: P2W(qF(EYE_D), M3.v(M3.diag(...EYE_D.Q.r), EYE_S)), s: EYE_S, prim: qP(EYE_D) };
    const eyeAtF = { p: P2W(qF(EYE_D), M3.v(M3.diag(...EYE_D.Q.r), EYE_SF)), s: EYE_SF, prim: qP(EYE_D) };
    const anchors = {
      blowhole: P2W(qF(BLOW_D), M3.v(M3.diag(...BLOW_D.Q.r), BLOW_D.s)),
      mouth: P2W(root, [1230, jawY(1230) - 30, 0]),
      eye: eyeAt.p, eyeF: eyeAtF.p,
      tail: P2W(tailF, [-330, 70, 0]),
      top: P2W(mainF, [0, FT.r[1], 0]),
      body: mainF.t,
    };
    return {
      prims, anchors, pose: P, dots: [], rootN: M3.mul(M3.inv(D), M3.rx(roll)),
      stamps: [{ at: eyeAt, set: EYES[0], colors: EYEC, kind: P.eyes, minFacing: 0.15 }, { at: eyeAtF, set: EYES[0], colors: EYEC, kind: P.eyes, minFacing: 0.15, flipX: true }],
      pri: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
      glossy: {}, baseMat: BODY, shadowSteps: 0,
    };
  }

  /* ---------- eyes: pixel stamps sized for the render scale ---------- */
  const EYEC = { k: '#0c1220', w: '#ffffff', b: '#26406e' };
  const NO_EYE = { open: ['.'] };
  const EYES = [
    { open: ['kk', 'kk', 'kk'], happy: ['.k.', 'k.k'], closed: ['kkk'] }, // tiny (far out at sea)
    { open: ['.kk.', 'kwkk', 'kkkk', '.kk.'], happy: ['.kk.', 'k..k'], closed: ['k..k', '.kk.'] },
    { open: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkbk', '.kkk.'], happy: ['.kkk.', 'k...k', 'k...k'], closed: ['k...k', '.kkk.'] },
    { open: ['..kkk..', '.kwwkk.', 'kwwkkkk', 'kwkkkkk', 'kkkkkkk', 'kkkkbbk', '.kkkbk.', '..kkk..'], happy: ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], closed: ['k.....k', '.k...k.', '..kkk..'] },
  ];

  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale < 0.16 ? EYES[0] : scale < 0.3 ? EYES[1] : EYES[2];
    EYE_DECAL = scale >= 0.45;
    EYE_KIND = (model.pose && model.pose.eyes) || 'open';
    for (const st of model.stamps) st.set = EYE_DECAL ? NO_EYE : set;
    const M = M3.mul(M3.rx(pitch), M3.ry(-yaw));
    const cam = [M[6], M[7], M[8]];
    { // highlight direction (half vector between light and view) in model space
      const Ld = V3.norm((opt.light && opt.light.dir) || [-0.5, 0.72, 0.5]);
      HL = M3.v([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]], V3.norm(V3.add(Ld, [0, 0, 1])));
      HL = V3.norm(V3.add(HL, [0, 1.1, 0])); // keep the spot high on the head, as in the official art
      HLl = M3.v(M3.rz(-EGG.a), HL);
    }
    // grooves: keep only the parts facing the camera
    const RN = model.rootN || M3.I();
    for (const p of model.prims) {
      if (!p.grooves) continue;
      const lines = [];
      for (const g of p.grooves) {
        let cur = [];
        for (const pt of g) {
          const n = M3.v(RN, pt.n);
          if ((n[0] * cam[0] + n[1] * cam[1] + n[2] * cam[2]) / Math.hypot(n[0], n[1], n[2]) > 0.06) cur.push(pt.q);
          else { if (cur.length > 1) lines.push({ pts: cur, mat: BELLY, useLn: true }); cur = []; }
        }
        if (cur.length > 1) lines.push({ pts: cur, mat: BELLY, useLn: true });
      }
      p.lines = lines;
    }
    // ray-cast only the creature's screen box, then paste into the full buffer
    const V = M3.mul(M, M3.diag(scale, scale, scale));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.quad) {
        // quarter-ellipsoid: bound only the quadrant that is drawn
        for (const ys of p.quad[1] ? [p.quad[1]] : [1, -1]) for (const q of QUAD_SAMPLES) {
          const sx = q[0] * p.quad[0], sy = q[1] * ys, sz = q[2];
          const qx = cv[0] + Lv[0] * sx + Lv[1] * sy + Lv[2] * sz, qy = cv[1] + Lv[3] * sx + Lv[4] * sy + Lv[5] * sz;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, -qy); y1 = Math.max(y1, -qy);
        }
      } else if (p.kind === 'ell') {
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
    const mg = 3 + 0.01 * Math.max(x1 - x0, y1 - y0);
    const bx0 = Math.max(0, Math.floor(ox + x0 - mg)), bx1 = Math.min(W - 1, Math.ceil(ox + x1 + mg));
    const by0 = Math.max(0, Math.floor(oy + y0 - mg)), by1 = Math.min(H - 1, Math.ceil(oy + y1 + mg));
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 14.5, bw: 2800, bh: 1700, oy: 0.88 } };
})();
