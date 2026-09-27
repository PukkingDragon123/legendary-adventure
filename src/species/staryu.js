/* ------------------------------------------------------------------
   Staryu — the Star Shape Pokémon (0.8 m ≈ 140 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward (the side with the core), y = up, z = near
   side at yaw 0; the star lies in the y-z plane and y = 0 is under its
   lowest point (the two lower tips at spin 0): as it spins it rolls on
   its tips like a cartwheel, the core rising and dipping.

   Design (official art / HOME model): a chunky five-pointed star of
   golden-brown arms, each a faceted pyramid (a ridge from the centre to
   the tip, one lit and one shaded face, sharp edges); a round gold dome
   in the middle with a red jewel core in a thin gold collar, six raised
   gold spokes radiating from the collar out past the dome's rim, a
   rounded gold tab at the bottom and a short bar sticking out at the
   lower right. No eyes or mouth.
   Build: every facet is a flat plate (so each face is flat-shaded by the
   renderer): one triangle per face while the star is flat, three rigid
   pieces per arm once it curls. The spokes are a thin shell over the
   dome (raised bars with their own outline).

   Pose parameters (all optional):
     spin   radians   rotation of the whole star about its core axis
     glow   0..1      core flash (the jewel lights up; the glow ignores the
                      time-of-day grading)
     bend   0..1      the arms curl forward around the core
     eyes   accepted and ignored (Staryu has no eyes)
     side   −1..1     ≈ cos(yaw), passed in by the game (unused, accepted)
   Anchors: top (highest arm tip), head / body (core centre), mouth / eyeN /
   eyeF (the jewel's front: Staryu has no face), core (jewel front),
   tip0..tip4 (arm tips, tip0 = the top arm at spin 0).
------------------------------------------------------------------- */
const Staryu = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const ARM = 1, GOLD = 2, SPOKE = 3, JEWEL = 4, GLOW = 5;
  const MAT = { ARM, GOLD, SPOKE, JEWEL, GLOW };
  const PAL = Creature.palette({
    [ARM]:   { r: ['#5c3818', '#845426', '#ae7638', '#cf9a50', '#ebbe76'], od: '#38200c', ol: '#6a441e', ln: '#583616' },
    [GOLD]:  { r: ['#b28c1c', '#d8b22a', '#f5d63e', '#fcea76', '#fffbc4'], od: '#664806', ol: '#9c7a14', ln: '#8e6e14' },
    [SPOKE]: { r: ['#cbae3a', '#e6cc54', '#f8e57c', '#fff3ae', '#fffce2'], od: '#6e500c', ol: '#a68620', ln: '#8a6c16' },
    [JEWEL]: { r: ['#780e22', '#a81a32', '#d63246', '#ee6a72', '#ffd0d0'], od: '#46040f', ol: '#781226', ln: '#701024' },
    [GLOW]:  { r: ['#ff5a66', '#ff8a8e', '#ffbcb8', '#ffe8e0', '#ffffff'], od: '#a01a2e', ol: '#d8404e', ln: '#d8404e' },
  });
  const GLOSSY = { [JEWEL]: 1, [GOLD]: 1 };
  const C_ARM = code(ARM), C_GOLD = code(GOLD), C_GOLD_D = code(GOLD, -1), C_SPOKE = code(SPOKE), C_JEWEL = code(JEWEL), C_JEWEL_L = code(JEWEL, 1);
  const M_GOLD = () => C_GOLD;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // rotate v about unit axis k by angle t (Rodrigues)
  const rot = (v, k, t) => {
    const c = Math.cos(t), s = Math.sin(t), d = dot(k, v), x = cross(k, v);
    return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
  };

  /* ---------- flat facets: convex polygon plates from 3D vertices ---------- */
  const PAD = 0.45;   // facets overlap their neighbours a little: no cracks along shared edges
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
  function facet(vs, part, grp) {
    const o = vs[0], e1 = sub(vs[1], o), e2 = sub(vs[vs.length - 1], o);
    const nz = nrm(cross(e1, e2)), u = nrm(e1), v = cross(nz, u);
    const pts = vs.map((p) => { const d = sub(p, o); return [dot(d, u), dot(d, v)]; });
    return { kind: 'plate', part, grp, c: o, L: M3.cols(u, v, nz), shape: convexShape(pts, C_ARM), thick: 1.1 };
  }

  /* ---------- star geometry (core frame: x = front, star in the y-z plane) ---------- */
  const R_OUT = 76, R_IN = 44;                       // tip radius, inner-corner radius (chunky arms)
  const H_F = 25, H_B = 17;                          // ridge heights at the centre (front / back), 0 at the tips
  const CS = Math.cos(Math.PI / 5), SN = Math.sin(Math.PI / 5);
  const BASE = R_IN * CS, HALF = R_IN * SN;          // arm base line distance and half width
  const NSEG = 3;
  const hF = (u) => H_F * (1 - u / R_OUT), hB = (u) => H_B * (1 - u / R_OUT);
  const wAt = (u) => HALF * (R_OUT - u) / (R_OUT - BASE);

  /* ---------- core: dome, collar, jewel, spokes, tabs ---------- */
  const DOME_R = [29, 35, 35], DOME_X = 0;
  const JEWEL_R = 11.8, JEWEL_X = 24.5, COLLAR_R = 15.4;
  const SPOKES = [0, 57, 121, 180, 234, 307].map((d) => (d * Math.PI) / 180);
  const SPOKE_W = 3.9;                               // spoke half width (units)
  const SHELL = [1.11, 1.17];                        // spoke shell: x and in-plane scale of the dome
  let curScale = 1;
  function spokeMat(s) {
    if (s[0] < 0.06) return 0;
    const ry = s[1] * DOME_R[1] * SHELL[1], rz = s[2] * DOME_R[2] * SHELL[1];
    const r = Math.hypot(ry, rz);
    if (r < COLLAR_R - 1) return 0;
    const hw = Math.max(SPOKE_W, 0.7 / curScale);
    for (const a of SPOKES) {
      const cy = Math.sin(a), cz = Math.cos(a);
      if (ry * cy + rz * cz <= 0) continue;
      if (Math.abs(rz * cy - ry * cz) < hw) return s[0] < 0.3 ? code(SPOKE, -1) : C_SPOKE;
    }
    return 0;
  }

  // core flash: a white four-point sparkle stamped over the jewel, its rays reaching out past the jewel
  // onto the dome (built per pixel size and cached)
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
  const SPARKC = { w: '#fff0ec', W: '#ffffff' };

  const DEFAULT = { spin: 0, glow: 0, bend: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // arms 1..5, dome 6, spoke shell 7, collar 8, jewel 9, tabs 10
  Object.assign(PRI, { 6: 1, 7: 2, 8: 3, 9: 4, 10: 1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const spin = +P.spin || 0, bend = clamp(+P.bend || 0, 0, 1);
    // built around the core at the origin, then lifted so the lowest point (a tip) rests on y = 0:
    // spinning, it rolls on its tips like a cartwheel
    const core = R(M3.rx(spin));
    const cL = core.L, c0 = core.t;
    let low = 0;
    const toM = (p) => { const q = add(c0, M3.v(cL, p)); if (q[1] < low) low = q[1]; return q; };
    const F = [1, 0, 0];
    const dStep = bend * 0.36;
    let top = -1e9;

    // --- arms: five faceted pyramids (split into NSEG rigid pieces when they curl)
    for (let k = 0; k < 5; k++) {
      const id = 1 + k;
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
      const d = [0, Math.sin(a), Math.cos(a)], w = [0, -Math.cos(a), Math.sin(a)];
      const Af = [H_F, 0, 0], Ab = [-H_B, 0, 0];
      const Il = add(sc(d, BASE), sc(w, HALF)), Ir = add(sc(d, BASE), sc(w, -HALF));
      if (dStep < 1e-3) {
        // flat star: each face of the arm is one planar triangle (apex, inner corner, tip)
        const tip = sc(d, R_OUT);
        for (const tri of [[Af, Il, tip], [Af, tip, Ir], [Ab, Il, tip], [Ab, tip, Ir]]) prims.push(facet(tri.map(toM), id, id));
        anchors['tip' + k] = toM(tip);
        top = Math.max(top, anchors['tip' + k][1]);
        continue;
      }
      // centre part: front and back triangles from the apexes to the base line
      const Bf = add(sc(d, BASE), sc(F, hF(BASE))), Bb = add(sc(d, BASE), sc(F, -hB(BASE)));
      for (const tri of [[Af, Il, Bf], [Af, Bf, Ir], [Ab, Il, Bb], [Ab, Bb, Ir]]) prims.push(facet(tri.map(toM), id, id));
      // arm pieces
      let O = sc(d, BASE), di = d, fi = F;
      for (let i = 0; i < NSEG; i++) {
        di = rot(di, w, -dStep); fi = rot(fi, w, -dStep);
        const u0 = BASE + ((R_OUT - BASE) * i) / NSEG, u1 = BASE + ((R_OUT - BASE) * (i + 1)) / NSEG;
        const at = (u, v, h) => add(add(O, sc(di, u - u0)), add(sc(w, v), sc(fi, h)));
        const last = i === NSEG - 1;
        const rF0 = at(u0, 0, hF(u0)), rB0 = at(u0, 0, -hB(u0)), eL0 = at(u0, wAt(u0), 0), eR0 = at(u0, -wAt(u0), 0);
        if (last) {
          const tip = at(R_OUT, 0, 0);
          for (const tri of [[eL0, rF0, tip], [rF0, eR0, tip], [eL0, rB0, tip], [rB0, eR0, tip]]) prims.push(facet(tri.map(toM), id, id));
          anchors['tip' + k] = toM(tip);
          top = Math.max(top, toM(tip)[1]);
        } else {
          const rF1 = at(u1, 0, hF(u1)), rB1 = at(u1, 0, -hB(u1)), eL1 = at(u1, wAt(u1), 0), eR1 = at(u1, -wAt(u1), 0);
          for (const q of [[eL0, rF0, rF1, eL1], [rF0, eR0, eR1, rF1], [eL0, rB0, rB1, eL1], [rB0, eR0, eR1, rB1]]) prims.push(facet(q.map(toM), id, id));
          O = at(u1, 0, 0);
        }
      }
    }

    // --- gold dome, spoke shell, collar and jewel
    const domeF = chain(core, T(DOME_X, 0, 0));
    prims.push(ellF(domeF, DOME_R, 6, 6, (s) => (s[0] < -0.2 ? 0 : s[0] < 0.22 ? C_GOLD_D : C_GOLD)));
    prims.push(ellF(domeF, [DOME_R[0] * SHELL[0], DOME_R[1] * SHELL[1], DOME_R[2] * SHELL[1]], 7, 7, spokeMat));
    prims.push(ellF(chain(core, T(JEWEL_X - 2.5, 0, 0)), [4.2, COLLAR_R, COLLAR_R], 8, 8, (s) => (s[0] > 0 ? code(SPOKE, 1) : C_SPOKE)));
    const jewel = ellF(chain(core, T(JEWEL_X, 0, 0)), [JEWEL_R, JEWEL_R, JEWEL_R], 9, 9, (s) => (s[0] * 0.55 + s[1] * 0.6 + s[2] * 0.58 > 0.72 ? C_JEWEL_L : C_JEWEL));
    prims.push(jewel);
    // tabs: a rounded nub at the bottom of the dome and a short bar out to the lower right
    const tabAt = (deg, r, x) => { const t = (deg * Math.PI) / 180; return [x, r * Math.sin(t), r * Math.cos(t)]; };
    {
      const t = (268 * Math.PI) / 180, dir = [0, Math.sin(t), Math.cos(t)], lat = [0, -Math.cos(t), Math.sin(t)];
      prims.push(E(toM(tabAt(268, 36, 6)), M3.mul(cL, M3.cols(sc(F, 7.5), sc(dir, 8), sc(lat, 7))), 10, 10, M_GOLD));
      const t2 = (197 * Math.PI) / 180, dir2 = [0, Math.sin(t2), Math.cos(t2)], lat2 = [0, -Math.cos(t2), Math.sin(t2)];
      prims.push(E(toM(tabAt(197, 40, 5)), M3.mul(cL, M3.cols(sc(F, 4.6), sc(dir2, 10), sc(lat2, 3.8))), 10, 10, M_GOLD));
    }

    const jf = toM([JEWEL_X + JEWEL_R, 0, 0]);
    const stamps = [];
    if ((+P.glow || 0) >= 0.5) {
      const ss = nrm([0.95, 0.22, 0.2]);
      stamps.push({ at: { prim: jewel, p: add(jewel.c, M3.v(jewel.L, ss)), s: ss }, set: null, colors: SPARKC, kind: 'open', overflow: true, minFacing: 0.1, near: -1, far: -1 });
    }
    Object.assign(anchors, { head: c0, body: c0, core: jf, mouth: jf, eyeN: jf, eyeF: jf });
    anchors.top = [c0[0], top, c0[2]];
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
    curScale = opt.scale || 1;
    for (const st of model.stamps) st.set = spark(Math.max(1, Math.round(JEWEL_R * 1.75 * curScale * (0.6 + 0.4 * clamp(model.pose.glow || 0, 0, 1)))));
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0) {
      // emissive core: mix the (graded) jewel ramp toward the ungraded glow ramp
      const pal = Object.assign({}, opt.pal || PAL), e = pal[JEWEL], G = PAL[GLOW];
      pal[JEWEL] = { r: e.r.map((c, i) => PX.mix(c, G.r[i], g)), od: PX.mix(e.od, G.od, g), ol: PX.mix(e.ol, G.ol, g), ln: PX.mix(e.ln, G.ln, g) };
      opt = Object.assign({}, opt, { pal });
    }
    return cropRender(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.8, bw: 166, bh: 168, oy: 0.915 } };
})();
