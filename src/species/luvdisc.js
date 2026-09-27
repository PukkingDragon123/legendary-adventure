/* ------------------------------------------------------------------
   Luvdisc — the Rendezvous Pokémon (0.6 m ≈ 105 px heart at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, y = 0 at the
   bottom of the heart.

   Design (official Sugimori art): a flat, laterally compressed pink heart
   lying on its side as it swims — the heart's POINT is the snout, capped by
   pale puckered lips, and its two round lobes (upper and lower) form the
   back, with the shallow cleft between them at the tail. Small black eye
   with a blue lower rim and a white shine just behind the lips, a pale
   pink oval cheek patch behind and below the eye.

   Build: the heart silhouette is fitted to the official art (two tilted
   lobe ellipsoids, a centre filler and two tapering sweeps of spheres from
   the lobes to the snout), all flattened in z. The union of spheres is
   shaded with the normal of a smooth blend of their fields (so the pillow
   reads as one clean surface, no lumps). Eye and cheek are surface decals
   sized in model units with a pixel minimum, so they stay clean at the
   game's tiny scales.

   Pose parameters (all optional):
     wiggle −1..1   swimming wiggle: the back of the heart swings sideways
     kiss   0..1    lips pucker and push forward
     tilt   radians whole-body pitch (+ = nose up)
     blush  0..1    cheeks flush a deeper pink
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'sleep'
     side   −1..1   ≈ cos(yaw), passed in by the game: the flat heart turns a
                    little toward the camera so it reads as a heart in 3/4
                    views (0 = no turn, e.g. when facing the camera)
     face   0..1    how much of that turn to apply (default 1)
------------------------------------------------------------------- */
const Luvdisc = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, LIPS = 2, CHEEK = 3, BLUSH = 4, EYE = 5, IRIS = 6, SHINE = 7;
  const MAT = { BODY, LIPS, CHEEK, BLUSH, EYE, IRIS, SHINE };
  const PAL = Creature.palette({
    [BODY]: { r: ['#b8586e', '#d67486', '#eb8f9c', '#f7aeb4', '#ffd6d6'], od: '#6a1e34', ol: '#a0405a', ln: '#a0405a' },
    [LIPS]: { r: ['#d0909c', '#e8b0b8', '#f6ccd0', '#fde2e2', '#fff4f2'], od: '#6a1e34', ol: '#9a4458', ln: '#9a4a5c' },
    [CHEEK]: { r: ['#dc9aa6', '#efbcc4', '#fbd8dc', '#ffe9ea', '#fff6f6'], od: '#6a1e34', ol: '#9a4458', ln: '#9a4458' },
    [BLUSH]: { r: ['#d2385e', '#e44c72', '#f46688', '#ff86a2', '#ffb0c2'], od: '#6a1e34', ol: '#a8304e', ln: '#b0304f' },
    [EYE]: { r: ['#120a18', '#140c1c', '#160e20', '#1a1226', '#1e162c'], od: '#0e0612', ol: '#0e0612', ln: '#0e0612' },
    [IRIS]: { r: ['#1a3c74', '#20508e', '#2a64a8', '#3a7cc0', '#4c90d0'], od: '#0e0612', ol: '#0e0612', ln: '#0e0612' },
    [SHINE]: { r: ['#f4f4f8', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#0e0612', ol: '#0e0612', ln: '#0e0612' },
  });
  const GLOSSY = {}; // the body's soft highlight comes from the smooth normal (see shadeBody)
  const NO_DOTS = [{}].slice(1);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });

  /* ---------- heart geometry, fitted to the official art ----------
     Given in reference-image pixels (475 px art, snout at the left) and converted:
     model x = (236 − px)·K (forward), y = (452 − py)·K (up). */
  const K = 0.253, XS = 1.1; // XS: a touch longer nose-to-tail than the art, so the heart reads at 3/4 views
  const PXX = (px) => (236 - px) * K * XS, PXY = (py) => (452 - py) * K;
  // (lobes a little rounder and further apart than the art: a clearer cleft at the tail)
  const LOBE_U = [276, 140, 84, 104, 0.1], LOBE_L = [268, 339, 86, 108, -0.06], FILL = [248, 240, 56, 84, 0];
  const SNOUT = [136, 247], SW_U = [256, 150, 70], SW_L = [254, 328, 72], SW_END = 14;
  const Y0 = 1.8; // lift so the lowest point of the heart sits on y = 0
  // balls: { c: [x, y], r: [rx, ry, rz], a: in-plane angle }
  const BALLS = [];
  const ball = (px, py, rx, ry, rz, a) => BALLS.push({ c: [PXX(px), PXY(py) + Y0, 0], r: [rx * K * XS, ry * K, rz], a });
  ball(LOBE_U[0], LOBE_U[1], LOBE_U[2], LOBE_U[3], 10, LOBE_U[4]);
  ball(LOBE_L[0], LOBE_L[1], LOBE_L[2], LOBE_L[3], 10, LOBE_L[4]);
  ball(FILL[0], FILL[1], FILL[2], FILL[3], 10, FILL[4]);
  for (const [cx, cy, r0] of [SW_U, SW_L]) {
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const t = i / n, r = (r0 + (SW_END - r0) * t) * K;
      ball(cx + (SNOUT[0] - cx) * t, cy + (SNOUT[1] - cy) * t, r / K, r / K, Math.min(10, 1.2 + 0.62 * r), 0);
    }
  }
  // each ball's local frame (heart space): L = Rz(a)·diag(r), and its inverse for the field
  for (const b of BALLS) {
    b.L = M3.mul(M3.rz(b.a), M3.diag(b.r[0], b.r[1], b.r[2]));
    b.Q = M3.inv(b.L);
  }
  const NB = BALLS.length;
  const CEN = [PXX(250), PXY(242) + Y0, 0]; // heart centre (tilt pivot)
  const LIP_C = [PXX(150), PXY(246) + Y0, 0]; // lip blob centre
  const EYE_C = [PXX(236), PXY(214) + Y0], EYE_R = [3.4, 6.2];
  const CHEEK_C = [PXX(259), PXY(254) + Y0], CHEEK_R = [3.6, 6.0];

  /* ---------- smooth shading: an analytic pillow ----------
     The body is a union of ellipsoids (for the silhouette and depth), but it is shaded as a clean
     pillow: flat sides that round off toward the heart's outline. The outline is traced once from the
     union, its distance field is baked into a grid; each hit is shaded with the pillow normal at its
     (x, y), turned into a tone bias against the ellipsoid's own normal (what the renderer shades with). */
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74], HH = V3.norm(V3.add(LD, [0, 0, 1])), SPEC = 0.975;
  let curScale = 1;
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  const inUnion = (x, y) => {
    for (const b of BALLS) {
      const Q = b.Q, dx = x - b.c[0], dy = y - b.c[1];
      const qx = Q[0] * dx + Q[1] * dy, qy = Q[3] * dx + Q[4] * dy;
      if (qx * qx + qy * qy < 1) return true;
    }
    return false;
  };
  // outline: star-shaped around the heart centre (radial binary search)
  const OUT = [];
  const OC = [PXX(250), PXY(245) + Y0];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    let lo = 0, hi = 80;
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (inUnion(OC[0] + ca * m, OC[1] + sa * m)) lo = m; else hi = m; }
    OUT.push([OC[0] + ca * lo, OC[1] + sa * lo]);
  }
  // baked inward distance to the outline (negative outside), 0.5-unit cells
  const PT = 9, PD = 12; // pillow half-thickness and the width of its rounded rim
  const GR = 0.5, GX0 = -36, GY0 = -8, GW = 150, GH = 250;
  let DG = null;
  function bakeField() { // lazily, on the first build (keeps page load light)
    DG = new Float32Array(GW * GH).fill(1e9);
    const band = PD + 1, n = OUT.length;
    for (let k = 0; k < n; k++) {
      const a = OUT[k], b = OUT[(k + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-9;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - band - GX0) / GR)), i1 = Math.min(GW - 1, Math.ceil((Math.max(a[0], b[0]) + band - GX0) / GR));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - band - GY0) / GR)), j1 = Math.min(GH - 1, Math.ceil((Math.max(a[1], b[1]) + band - GY0) / GR));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const px = GX0 + i * GR - a[0], py = GY0 + j * GR - a[1];
          let t = (px * ex + py * ey) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - ex * t, dy = py - ey * t, d2 = dx * dx + dy * dy;
          if (d2 < DG[j * GW + i]) DG[j * GW + i] = d2;
        }
    }
    // sign: scanline fill of the outline polygon
    const xs = [];
    for (let j = 0; j < GH; j++) {
      const y = GY0 + j * GR;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const a = OUT[k], b = OUT[(k + 1) % n];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i < GW; i++) {
        const x = GX0 + i * GR, o = j * GW + i, d = Math.min(band, Math.sqrt(DG[o]));
        let inside = false;
        for (let k = 0; k < xs.length; k++) if (xs[k] < x) inside = !inside;
        DG[o] = inside ? d : -d;
      }
    }
  }
  const dAt = (x, y) => {
    const fx = clamp((x - GX0) / GR, 0, GW - 1.001), fy = clamp((y - GY0) / GR, 0, GH - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, o = j * GW + i;
    return (DG[o] * (1 - u) + DG[o + 1] * u) * (1 - v) + (DG[o + GW] * (1 - u) + DG[o + GW + 1] * u) * v;
  };
  function fieldNormal(h) {
    const d = dAt(h[0], h[1]);
    if (d >= PD) return [0, 0, h[2] >= 0 ? 1 : -1];
    const e = 0.6;
    let gx = (dAt(h[0] + e, h[1]) - dAt(h[0] - e, h[1])) / (2 * e), gy = (dAt(h[0], h[1] + e) - dAt(h[0], h[1] - e)) / (2 * e);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl; // inward
    const u = 1 - Math.max(0, d) / PD; // 1 at the rim, 0 on the flat
    const slope = (PT / PD) * u / Math.sqrt(Math.max(1e-4, 1 - u * u)); // −dt/dd of t = PT·sqrt(1 − u²)
    const nz = h[2] >= 0 ? 1 : -1;
    const l = Math.hypot(slope, 1);
    return [(-gx * slope) / l, (-gy * slope) / l, nz / l];
  }
  // prim: the rendered ellipsoid (Lv/Li set by the renderer), b: its heart-space ball, s: unit-sphere hit
  function shade(prim, b, s, m, gloss, forceTone) {
    const Li = prim.Li;
    let ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
    let l = Math.hypot(ax, ay, az) || 1;
    const tA = tone((ax * LD[0] + ay * LD[1] + az * LD[2]) / l);
    if (forceTone !== undefined) return code(m, clamp(forceTone - tA, -2, 4));
    const h = add(b.c, M3.v(b.L, s));
    const n = fieldNormal(h);
    // heart space → view space: A = Lv·(b.L)⁻¹, normals by A⁻ᵀ = (b.L·Li)ᵀ
    const B = prim._B || (prim._B = M3.mul(b.L, Li));
    const ix = B[0] * n[0] + B[3] * n[1] + B[6] * n[2], iy = B[1] * n[0] + B[4] * n[1] + B[7] * n[2], iz = B[2] * n[0] + B[5] * n[1] + B[8] * n[2];
    l = Math.hypot(ix, iy, iz) || 1;
    let tI = tone((ix * LD[0] + iy * LD[1] + iz * LD[2]) / l);
    if (gloss && tI >= 2 && (ix * HH[0] + iy * HH[1] + iz * HH[2]) / l > SPEC) tI = 4;
    return code(m, clamp(tI - tA, -2, 4));
  }

  /* ---------- face decals (on the flat sides, in heart space x-y) ---------- */
  // eye: black oval, dark-blue lower crescent, white shine toward the upper front
  function eyeCode(h, kind) {
    const px = 1 / curScale; // one screen pixel in model units
    const rx = Math.max(EYE_R[0], 0.75 * px), ry = Math.max(EYE_R[1], 1.1 * px);
    const ex = (h[0] - EYE_C[0]) / rx, ey = (h[1] - EYE_C[1]) / ry;
    if (curScale < SMALL) return 0; // stamps
    if (kind === 'open') {
      if (ex * ex + ey * ey >= 1) return 0;
      if (curScale >= 0.5) {
        if (((ex - 0.18) / 0.42) ** 2 + ((ey - 0.38) / 0.3) ** 2 < 1) return SHINE;
        if (ey < -0.28 && ((ex + 0.05) / 0.62) ** 2 + ((ey + 0.52) / 0.36) ** 2 < 1) return IRIS;
      }
      return EYE;
    }
    // happy ^ / closed ‿ : a thin arc across the eye
    if (Math.abs(ex) > 1.1) return 0;
    const lw = Math.max(0.16, (0.7 * px) / ry);
    const yc = kind === 'happy' ? -0.2 + 0.55 * (1 - ex * ex) : kind === 'sleep' ? -0.25 + 0.25 * ex * ex : 0.1 - 0.35 * (1 - ex * ex);
    return Math.abs(ey - yc) < lw ? EYE : 0;
  }
  function cheekHit(h, big) {
    const px = 1 / curScale, k = big ? 1.15 : 1;
    const rx = Math.max(CHEEK_R[0] * k, 0.9 * px), ry = Math.max(CHEEK_R[1] * k, 1.2 * px);
    const ex = (h[0] - CHEEK_C[0]) / rx, ey = (h[1] - CHEEK_C[1]) / ry;
    return ex * ex + ey * ey < 1;
  }

  const PRI = {};
  for (let i = 1; i < 9; i++) PRI[i] = 0;
  Object.assign(PRI, { 5: 3 });

  const SIZE = 1.0; // → ≈ 105 px tall at yaw 1.1
  const TWIST = 0.5; // max turn toward the camera (radians)
  const DEFAULT = { wiggle: 0, kiss: 0, eyes: 'open', tilt: 0, blush: 0, side: 1, face: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    if (!DG) bakeField();
    const prims = [], anchors = {};
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'sleep' ? 'sleep' : P.eyes === 'blink' || P.eyes === 'closed' ? 'closed' : 'open';
    const bl = clamp(P.blush, 0, 1);
    const cheekM = bl > 0.45 ? BLUSH : CHEEK;
    const wig = clamp(P.wiggle, -1, 1);
    const turn = TWIST * clamp(P.side ?? 1, -1, 1) * clamp(P.face ?? 1, 0, 1);
    // root: size, turn toward the camera, pitch about the heart centre
    const root = chain(F(M3.diag(SIZE, SIZE, SIZE), [0, 0, 0]), T(CEN[0], CEN[1], 0), R(M3.ry(turn)), R(M3.rz(P.tilt)), T(-CEN[0], -CEN[1], 0));
    // the back swings sideways (pivot just behind the snout); the swing grows toward the tail
    const bend = (x) => {
      const w = clamp((12 - x) / 34, 0, 1);
      return chain(root, T(12, 0, 0), R(M3.ry(wig * 0.3 * w)), T(-12, 0, 0));
    };

    // --- body balls
    let eyeBall = null, eyeZ = -1e9;
    BALLS.forEach((b, i) => {
      const f = bend(b.c[0]);
      const prim = E(inF(f, b.c), M3.mul(f.L, b.L), 1, 1, null);
      prim.mat = (s) => {
        const h = add(b.c, M3.v(b.L, s));
        if (Math.abs(s[2]) > 0.25) {
          const e = eyeCode(h, kind);
          if (e) return shade(prim, b, s, e, false, 2);
          if (cheekHit(h, bl > 0.45)) return shade(prim, b, s, cheekM, false);
        }
        return shade(prim, b, s, BODY, i < 2);
      };
      prims.push(prim);
      // the ball whose side surface is outermost at the eye carries the eye anchors
      const dx = EYE_C[0] - b.c[0], dy = EYE_C[1] - b.c[1];
      const Q = b.Q, qx = Q[0] * dx + Q[1] * dy, qy = Q[3] * dx + Q[4] * dy;
      const z = b.r[2] * Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
      if (1 - qx * qx - qy * qy > 0 && z > eyeZ) { eyeZ = z; eyeBall = { f, z, prim, s: [qx, qy, Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy))] }; }
    });

    // --- lips: a pale puckered blob plus a rounded forward tip, the mouth line across the tip
    const k = clamp(P.kiss, 0, 1);
    const lf = chain(root, T(LIP_C[0] + k * 2.2, LIP_C[1], 0), R(M3.rz(0.06)), R(M3.diag(1 + k * 0.08, 1 + k * 0.12, 1 + k * 0.12)));
    const lipLine = (s, th) => {
      const px = 1 / (curScale * 6.4);
      return s[0] > th && Math.abs(s[1] + 0.04) < Math.max(0.07, 0.5 * px);
    };
    const lipBlob = E(lf.t, M3.mul(lf.L, M3.diag(9.6, 8.2, 7.0)), 5, 5, (s) => (lipLine(s, 0.5) ? code(LIPS, -1) : code(LIPS)));
    const tf = chain(lf, T(7.4 + k * 1.4, 0.3, 0), R(M3.rz(0.06)));
    const lipTip = E(tf.t, M3.mul(tf.L, M3.diag(5.8 + k * 1.4, 5.0, 4.8)), 5, 5, (s) => (lipLine(s, -0.3) ? code(LIPS, -1) : code(LIPS)));
    prims.push(lipBlob, lipTip);

    // eye anchors (near / far side) for effects
    const ef = eyeBall ? eyeBall.f : root, ez = eyeBall ? eyeBall.z : 10;
    // small-scale eyes: pixel stamps (the decal eye takes over from scale 0.6 up, see render)
    const stamps = [];
    if (eyeBall) for (const sd of [1, -1]) {
      const es = [eyeBall.s[0], eyeBall.s[1], sd * eyeBall.s[2]];
      stamps.push({ at: { prim: eyeBall.prim, p: add(eyeBall.prim.c, M3.v(eyeBall.prim.L, es)), s: es }, set: sd > 0 ? EYES : EYES_M, colors: EYEC, kind, minFacing: 0.2 });
    }
    anchors.eyeN = inF(ef, [EYE_C[0], EYE_C[1], ez]);
    anchors.eyeF = inF(ef, [EYE_C[0], EYE_C[1], -ez]);
    anchors.lips = inF(tf, [5.8 + k * 1.4, 0, 0]);
    anchors.top = inF(bend(PXX(274)), [PXX(274), PXY(22) + Y0, 0]);
    anchors.center = inF(root, CEN);
    anchors.tail = inF(bend(PXX(330)), [PXX(330), PXY(245) + Y0, 0]);
    return { prims, anchors, pose: P, headPrim: prims[2], stamps, dots: NO_DOTS, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12 };
  }

  /* ---------- small-scale eye stamps (k = black, b = blue; the blue sits low, toward the front) ---------- */
  const mirror = (g) => g.map((row) => row.split('').reverse().join(''));
  const mk = (tr) => ({
    open: tr(['kk', 'kk', 'kb']), openN: tr(['kk', 'kk', 'kb']), openF: tr(['k', 'k', 'b']),
    happy: tr(['.k.', 'k.k']), happyN: tr(['.k', 'k.']), happyF: tr(['k']),
    closed: tr(['kkk']), closedN: tr(['kk']), closedF: tr(['k']),
    sleep: tr(['k.k', '.k.']), sleepN: tr(['kk']), sleepF: tr(['k']),
  });
  const EYES = mk((g) => g), EYES_M = mk(mirror);
  const EYEC = { k: '#140c1c', b: '#2a5ea0' };
  const SMALL = 0.6; // below this scale the eye is a stamp, above it a surface decal

  function render(model, opt) {
    curScale = opt.scale || 1;
    if (curScale >= SMALL && model.stamps.length) model = Object.assign({}, model, { stamps: [] });
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74]; SPEC = lg.spec ?? 0.975; HH = V3.norm(V3.add(LD, [0, 0, 1]));
    for (const p of model.prims) p._B = null;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 130, bh: 132, oy: 0.93 } };
})();
