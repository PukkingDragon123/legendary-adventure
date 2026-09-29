/* ------------------------------------------------------------------
   Starmie — the Mysterious Pokémon (1.1 m ≈ 190 units tall at scale 1).
   Staryu's evolution. A posable 3D model rendered straight to pixel art
   by the shared Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward (the side with the core), y = up, z = near
   side at yaw 0; the stars lie in the y-z plane and y = 0 is under the
   lowest tip: as it spins it rolls on its ten tips like a wheel.

   Design (official art / HOME model): two violet five-pointed stars, the
   back one turned 36° so ten sharp points show all round; every arm is a
   faceted pyramid (a ridge from the centre to the tip, one lit and one
   shaded face). In the middle of the front star a gold setting with a
   jagged ten-point sunburst rim and a raised gold collar holds a big red
   jewel (the "core"), which flashes and glows. No eyes or mouth.
   Build: every facet is a flat plate (flat-shaded by the renderer); the
   setting is a thick gold disc cut to the sunburst outline.

   Pose parameters (all optional):
     spin   radians   rotation of both stars about the core axis (the
                      shuriken spin it swims and attacks with); continuous
     glow   0..1      core glow (the jewel lights up, a sparkle flashes at
                      ≥ 0.5; the glow ignores the time-of-day grading)
     tilt   −1..1     lean of the whole star: + tips the core up toward the
                      sky, − dips it toward the ground (±0.5 rad)
     eyes   accepted: 'closed' dims the core a little, others ignored
                      (Starmie has no eyes)
     mouth  accepted and ignored (no mouth)
     side   −1..1     ≈ cos(yaw), passed in by the game (unused, accepted)
   Anchors: top (highest tip), head / body (core centre), core / mouth /
   eyeN / eyeF (the jewel's front: Starmie has no face), tip0..tip9 (arm
   tips; tip0 = top of the front star at spin 0, tip5..9 = back star).
------------------------------------------------------------------- */
const Starmie = (() => {
  const { R, code } = Creature;

  // ---- materials
  const ARM = 1, GOLD = 2, COLLAR = 3, JEWEL = 4, GLOW = 5, ARM2 = 6;
  const MAT = { ARM, GOLD, COLLAR, JEWEL, GLOW, ARM2 };
  const PAL = Creature.palette({
    [ARM]:    { r: ['#3f2166', '#5b358f', '#7c52b8', '#a07ad6', '#c9a8f0'], od: '#241040', ol: '#4a2a78', ln: '#3c2064' },
    [GOLD]:   { r: ['#a8801a', '#d0a826', '#f0cc3a', '#fae676', '#fffac6'], od: '#5e4206', ol: '#94721a', ln: '#886812' },
    [COLLAR]: { r: ['#c2a232', '#e0c24c', '#f6e074', '#fff0a8', '#fffce0'], od: '#664a0a', ol: '#a0801e', ln: '#8a6c16' },
    [JEWEL]:  { r: ['#700a20', '#a01830', '#d02e44', '#ec6470', '#ffd2d2'], od: '#40040e', ol: '#721024', ln: '#6a0e22' },
    [GLOW]:   { r: ['#ff5c78', '#ff8c9e', '#ffbcc6', '#ffe6ea', '#ffffff'], od: '#a01a36', ol: '#d84058', ln: '#d84058' },
    // back star: the same violet, a touch deeper so the two stars read apart
    [ARM2]:   { r: ['#381c5e', '#523086', '#7049ac', '#936ccc', '#bb98e6'], od: '#221040', ol: '#44266e', ln: '#361c5c' },
  });
  const GLOSSY = { [JEWEL]: 1, [GOLD]: 1, [COLLAR]: 1 };
  const C_ARM = code(ARM), C_ARM2 = code(ARM2), C_GOLD = code(GOLD), C_GOLD_L = code(GOLD, 1), C_COLLAR = code(COLLAR), C_JEWEL = code(JEWEL), C_JEWEL_L = code(JEWEL, 1), C_JEWEL_D = code(JEWEL, -1);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });

  /* ---------- flat facets: convex polygon plates from 3D vertices ---------- */
  const PAD = 0.45; // facets overlap their neighbours a little: no cracks along shared edges
  function convexShape(pts, m) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const P = area < 0 ? pts.slice().reverse() : pts;
    const n = P.length, EQ = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
      const nx = -ey / l, ny = ex / l;
      EQ[i * 3] = nx; EQ[i * 3 + 1] = ny; EQ[i * 3 + 2] = PAD - (nx * a[0] + ny * a[1]);
    }
    const bb = Shape2D.bbox(P, PAD + 0.3);
    return {
      bb,
      test(u, v) {
        for (let i = 0; i < n * 3; i += 3) if (EQ[i] * u + EQ[i + 1] * v + EQ[i + 2] < 0) return 0;
        return m;
      },
    };
  }
  function facet(vs, part, grp, m) {
    const o = vs[0], e1 = sub(vs[1], o), e2 = sub(vs[vs.length - 1], o);
    const nz = nrm(cross(e1, e2)), u = nrm(e1), v = cross(nz, u);
    const pts = vs.map((p) => { const d = sub(p, o); return [dot(d, u), dot(d, v)]; });
    return { kind: 'plate', part, grp, c: o, L: M3.cols(u, v, nz), shape: convexShape(pts, m), thick: 1.1 };
  }

  /* ---------- the two stars (core frame: x = front, stars in the y-z plane) ---------- */
  const R_OUT = 94, R_IN = 42;                        // tip radius, inner-corner radius (sharp points)
  const CS = Math.cos(Math.PI / 5), SN = Math.sin(Math.PI / 5);
  const BASE = R_IN * CS, HALF = R_IN * SN;           // arm base line distance and half width
  // x: plane of the star, hF / hB: ridge height at the centre toward the front / back, rot: turn
  const STARS = [
    { x: 0, hF: 17, hB: 8, rot: 0, id: 1 },           // front star (arms 1..5)
    { x: -12, hF: 9, hB: 13, rot: Math.PI / 5, id: 11 }, // back star, turned 36° (arms 11..15)
  ];

  /* ---------- gold setting, collar and jewel ---------- */
  const SET_X = 11, SET_R = [9.5, 35, 35];              // gold disc (its back half sinks into the star)
  const COLLAR_X = 17.5, COLLAR_R = [5, 20.5, 20.5];
  const JEWEL_X = 19, JEWEL_R = 17;
  // ten-point sunburst rim: radius (unit disc) by angle, points toward all ten arm tips
  function sunburst(th) {
    const u = (th - Math.PI / 2) / (Math.PI / 5);
    const f = Math.abs(u - Math.round(u)) * 2; // 0 at a point, 1 half way between
    return 1 - 0.3 * Math.pow(f, 0.8);
  }
  const setMat = (s) => {
    const rho = Math.hypot(s[1], s[2]);
    if (rho > sunburst(Math.atan2(s[1], s[2]))) return 0;
    // a raised inner ridge of the setting catches the light
    return rho > 0.62 && rho < 0.7 ? C_GOLD_L : C_GOLD;
  };
  const collarMat = (s) => (s[0] > 0.35 ? code(COLLAR, 1) : C_COLLAR);

  // core flash: a white four-point sparkle stamped over the jewel (per pixel size, cached)
  const SPARKS = new Map();
  function spark(L) {
    let g = SPARKS.get(L);
    if (g) return g;
    const n = 2 * L + 1, rows = [];
    for (let y = 0; y < n; y++) {
      let row = '';
      for (let x = 0; x < n; x++) {
        const dx = Math.abs(x - L), dy = Math.abs(y - L);
        const core = dx + dy <= Math.max(1, L >> 2);
        const ray = (dx === 0 && dy <= L) || (dy === 0 && dx <= L) || (L >= 6 && dx === dy && dx <= L >> 2);
        row += core ? 'W' : ray ? 'w' : '.';
      }
      rows.push(row);
    }
    g = { open: rows };
    SPARKS.set(L, g);
    return g;
  }
  const SPARKC = { w: '#fff0f2', W: '#ffffff' };

  const DEFAULT = { spin: 0, glow: 0, tilt: 0, eyes: 'open', mouth: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // front arms 1..5, back arms 11..15, setting 20, collar 21, jewel 22
  Object.assign(PRI, { 20: 2, 21: 3, 22: 4 });
  for (let i = 11; i <= 15; i++) PRI[i] = -1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const spin = +P.spin || 0, tilt = clamp(+P.tilt || 0, -1, 1);
    // built around the core at the origin (spin about the core axis, then the lean),
    // then lifted so the lowest point rests on y = 0: spinning, it rolls on its tips
    const core = R(M3.mul(M3.rz(0.5 * tilt), M3.rx(spin)));
    const cL = core.L;
    let low = 0, top = -1e9;
    const toM = (p) => { const q = M3.v(cL, p); if (q[1] < low) low = q[1]; return q; };

    // --- arms: two stars of five faceted pyramids each
    for (const st of STARS) {
      for (let k = 0; k < 5; k++) {
        const id = st.id + k;
        const a = Math.PI / 2 + st.rot + (k * 2 * Math.PI) / 5;
        const d = [0, Math.sin(a), Math.cos(a)], w = [0, -Math.cos(a), Math.sin(a)];
        const O = [st.x, 0, 0];
        const Af = [st.x + st.hF, 0, 0], Ab = [st.x - st.hB, 0, 0];
        const Il = add(O, add(sc(d, BASE), sc(w, HALF))), Ir = add(O, add(sc(d, BASE), sc(w, -HALF)));
        const tip = add(O, sc(d, R_OUT));
        for (const tri of [[Af, Il, tip], [Af, tip, Ir], [Ab, Il, tip], [Ab, tip, Ir]]) prims.push(facet(tri.map(toM), id, id, st.id === 1 ? C_ARM : C_ARM2));
        const tk = st.id === 1 ? k : 5 + k;
        anchors['tip' + tk] = toM(tip);
        top = Math.max(top, anchors['tip' + tk][1]);
      }
    }

    // --- gold setting (sunburst disc), collar, jewel
    const onCore = (x, r) => E(M3.v(cL, [x, 0, 0]), M3.mul(cL, M3.diag(r[0], r[1], r[2])), 0, 0, null);
    const setP = onCore(SET_X, SET_R); setP.part = setP.grp = 20; setP.mat = setMat; prims.push(setP);
    const colP = onCore(COLLAR_X, COLLAR_R); colP.part = colP.grp = 21; colP.mat = collarMat; prims.push(colP);
    const jewel = onCore(JEWEL_X, [JEWEL_R, JEWEL_R, JEWEL_R]);
    jewel.part = jewel.grp = 22;
    const dim = P.eyes === 'closed';
    // facet glints: a bright crescent toward the light, a darker rim underneath
    jewel.mat = (s) => (s[0] * 0.5 + s[1] * 0.62 + s[2] * 0.6 > 0.74 ? (dim ? C_JEWEL : C_JEWEL_L) : s[0] < 0.3 && s[1] < -0.2 ? C_JEWEL_D : dim ? C_JEWEL_D : C_JEWEL);
    prims.push(jewel);
    toM([SET_X - SET_R[0], 0, 0]); toM([SET_X, -SET_R[1], 0]); toM([SET_X, SET_R[1], 0]);

    const jf = M3.v(cL, [JEWEL_X + JEWEL_R, 0, 0]);
    const stamps = [];
    if ((+P.glow || 0) >= 0.5) {
      const ss = nrm([0.95, 0.22, 0.2]);
      stamps.push({ at: { prim: jewel, p: add(jewel.c, M3.v(jewel.L, ss)), s: ss }, set: null, colors: SPARKC, kind: 'open', overflow: true, minFacing: 0.1, near: -1, far: -1 });
    }
    const c0 = [0, 0, 0];
    Object.assign(anchors, { head: c0, body: c0, core: jf, mouth: jf, eyeN: jf, eyeF: jf });
    anchors.top = [0, top, 0];
    const lift = [0, -low, 0];
    for (const q of prims) q.c = add(q.c, lift);
    for (const st of stamps) st.at.p = add(st.at.p, lift);
    for (const k in anchors) anchors[k] = add(anchors[k], lift);
    return { prims, stamps, dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: ARM, shadowSteps: 14, shadowDepth: 26 };
  }

  // ray-cast only the prims' screen box (the full-buffer passes dominate), then place it in the W×H buffer
  function cropRender(model, opt) {
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
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.85 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s0 = y * w, d0 = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s0, s0 + w), d0);
      depth.set(r.depth.subarray(s0, s0 + w), d0);
      part.set(r.part.subarray(s0, s0 + w), d0);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  function render(model, opt) {
    const scl = opt.scale || 1;
    const g = clamp(model.pose.glow || 0, 0, 1);
    for (const st of model.stamps) st.set = spark(Math.max(1, Math.round(JEWEL_R * 1.8 * scl * (0.6 + 0.4 * g))));
    if (g > 0) {
      // emissive core: mix the (graded) jewel ramp toward the ungraded glow ramp
      const pal = Object.assign({}, opt.pal || PAL), e = pal[JEWEL], G = PAL[GLOW];
      pal[JEWEL] = { r: e.r.map((c, i) => PX.mix(c, G.r[i], g)), od: PX.mix(e.od, G.od, g), ol: PX.mix(e.ol, G.ol, g), ln: PX.mix(e.ln, G.ln, g) };
      opt = Object.assign({}, opt, { pal });
    }
    return cropRender(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 206, bh: 218, oy: 0.92 } };
})();
