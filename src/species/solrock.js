/* ------------------------------------------------------------------
   Solrock — the Meteorite Pokémon (1.2 m ≈ 210 units ray tip to tip).
   Official look: a round orange-brown rock ball studded with small pale
   tan rock chips, ringed by eight pale cream/yellow crystal "flame" rays
   (flat, faceted, jagged-edged, each bent a little the same way like a
   pinwheel). The face is two big sun-like eyes: a pale yellow disc in a
   black ring with a black bar across it and a red slit in the middle,
   with short black rays around the ring. It floats ~20 units above the
   ground and spins its ray ring (the face stays upright).
   Model space: x = forward (the face), y = up, z = near side at yaw 0, y = 0 = ground.

   Pose params:
     spin  radians  rotation of the ray ring about the face axis
     glow  0..1     sunfire: the rock brightens and its shadows lift
     eyes  'open' | 'closed' | 'blink' | 'angry' | 'happy'
     bob   -1..1    hover offset (± 8 units)
     mouth ignored (Solrock has no mouth)
   Anchors: top, bottom, head, body, mouth (face centre), eyeN, eyeF, rayTip.
------------------------------------------------------------------- */
const Solrock = (() => {
  const { chain, T, code, plate } = Creature;

  // material ids
  const BODY = 1, RAY = 2, EYEK = 3, EYER = 4, GLINT = 5, GLOW = 6, CORE = 7, EYEY = 8, CHIP = 9;
  const MAT = { BODY, RAY, EYEK, EYER, GLINT, GLOW, CORE, EYEY, CHIP };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#8a3f1e', '#b0592c', '#cf723e', '#e38f58', '#f2ad7a'], od: '#4c1c0a', ol: '#86391a', ln: '#7a3416' },
    [RAY]:   { r: ['#c09a52', '#dcbc72', '#f0d68c', '#fbe7a8', '#fff5d0'], od: '#6a4618', ol: '#a8823e', ln: '#9c7634' },
    [CORE]:  { r: ['#c8a258', '#e2c47a', '#f5de96', '#fdedb4', '#fff8dc'], od: '#6a4618', ol: '#a8823e', ln: '#9c7634' },
    [CHIP]:  { r: ['#a8804a', '#cca468', '#e8c688', '#f6dca6', '#fff0c8'], od: '#5a3a16', ol: '#8e6a36', ln: '#7e5a2a' },
    [EYEY]:  { r: ['#d4ac52', '#e8c66a', '#f7df8c', '#fdeeae', '#fff8d6'], od: '#1a100c', ol: '#1a100c', ln: '#1a100c' },
    [EYEK]:  { r: ['#140c0a', '#1a100c', '#221612', '#2c1c18', '#3a2822'], od: '#0a0504', ol: '#140c0a', ln: '#140c0a' },
    [EYER]:  { r: ['#9a1420', '#c4202c', '#e8323e', '#ff5a5a', '#ff9a90'], od: '#4a0610', ol: '#8a0e16', ln: '#7a0c14' },
    [GLINT]: { r: ['#f0e8e0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8078', ol: '#c8c0b8', ln: '#c8c0b8' },
    [GLOW]:  { r: ['#ffb040', '#ffc862', '#ffde90', '#fff0c4', '#ffffff'], od: '#a85010', ol: '#e08a2a', ln: '#d07a22' },
  });
  const GLOSSY = {};

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  const CY = 126;                 // hover height of the centre
  const BR = [48, 50, 50];        // rock ball radii (x = depth)
  const NR = 8;                   // rays
  const RT = 105;                 // ray tip distance from the centre
  // eyes: azimuth from the face axis, elevation, angular half-width / half-height
  const EYE = { az: 0.58, el: -0.06, rw: 0.31, rh: 0.39 };
  const EYE_DIR = (sd) => [Math.cos(EYE.el) * Math.cos(EYE.az), Math.sin(EYE.el), sd * Math.cos(EYE.el) * Math.sin(EYE.az)];

  // pale rock chips on the ball: [azimuth (0 = face, around y), elevation, size, rotation]
  const CHIPS = [
    [0.04, 0.7, 0.17, 0.3], [0.26, -0.74, 0.15, 1.1], [-0.36, -0.7, 0.13, 2.2],
    [1.08, 0.5, 0.17, 2.0], [-1.06, 0.48, 0.16, 0.4], [1.12, -0.34, 0.16, 1.4], [-1.1, -0.38, 0.16, 2.6],
    [0.62, 0.88, 0.13, 1.9], [-0.6, 0.86, 0.12, 0.9], [1.7, 0.1, 0.17, 0.6], [-1.7, 0.06, 0.17, 1.7],
    [2.2, 0.56, 0.17, 1.0], [-2.2, 0.52, 0.16, 2.4], [2.4, -0.42, 0.17, 0.1], [-2.4, -0.36, 0.16, 1.3], [2.95, 0.12, 0.18, 2.1],
    [-2.9, -0.12, 0.17, 0.5], [3.14, 0.74, 0.15, 1.5], [3.14, -0.66, 0.16, 2.8],
].map(([az, el, r, rot]) => {
    const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const t1 = V3.norm(Math.abs(d[1]) > 0.9 ? [0, 0, 1] : V3.cross([0, 1, 0], d)), t2 = V3.cross(d, t1);
    const c = Math.cos(rot), s = Math.sin(rot);
    return { d, a: V3.add(V3.scale(t1, c), V3.scale(t2, s)), b: V3.add(V3.scale(t1, -s), V3.scale(t2, c)), r, k: 0.6 + 0.5 * ((rot * 7) % 1) };
  });

  // ray outline halves in (u = along the ray from the ball centre, v = across); the tip sits on the ridge
  const RAY_L = [[34, 0], [34, 9], [50, 11.5], [62, 15.5], [70, 12.5], [78, 14.5], [105, 0]];
  const RAY_R = [[34, 0], [34, -9], [54, -12.5], [68, -14.5], [84, -8], [89, -10], [105, 0]];
  const LEN = [1.02, 0.95, 1, 0.94, 1.03, 0.95, 1, 0.94];
  const rayShape = (poly, k, m) => {
    const P = poly.map(([u, v]) => [34 + (u - 34) * k, v]);
    const bb = Shape2D.bbox(P, 0.5);
    return bakeShape({ bb, test: (u, v) => (Shape2D.inPoly(u, v, P) ? m : 0) });
  };
  const SHAPES = LEN.map((k) => [rayShape(RAY_L, k, code(RAY)), rayShape(RAY_R, k, code(CORE))]);

  const DEFAULT = { spin: 0, glow: 0, eyes: 'open', bob: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const eyes = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    const body = chain(T(0, CY + 8 * clamp(+P.bob || 0, -1, 1), 0));
    const prims = [];

    /* --- the rock ball: sun eyes on the front, pale rock chips all over --- */
    const E1 = EYE_DIR(1), E2 = EYE_DIR(-1);
    const eyeAt = (s, e, sd) => {
      const de = s[0] * e[0] + s[1] * e[1] + s[2] * e[2];
      if (de < 0.6) return 0;
      // tangent frame at the eye centre: t1 across (toward the outside of the face), t2 up
      const t1 = [-sd * Math.sin(EYE.az), 0, Math.cos(EYE.az)];
      const t2 = [-Math.sin(EYE.el) * Math.cos(EYE.az), Math.cos(EYE.el), -sd * Math.sin(EYE.el) * Math.sin(EYE.az)];
      const a = (s[0] * t1[0] + s[1] * t1[1] + s[2] * t1[2]) * sd / EYE.rw; // + = toward the face edge
      const b = (s[0] * t2[0] + s[1] * t2[1] + s[2] * t2[2]) / EYE.rh;
      const r = Math.hypot(a, b);
      if (r > 1.52) return 0;
      if (r > 1.0) {
        // six short black sun rays around the ring
        if (r < 1.14 || eyes === 'closed' || eyes === 'happy') return 0;
        const ang = Math.atan2(b, a) - Math.PI / 2, k = Math.round(ang / (Math.PI / 3)) * (Math.PI / 3);
        return Math.abs(Math.sin(ang - k)) * r < 0.13 ? code(EYEK) : 0;
      }
      if (r > 0.83) return code(EYEK);
      if (eyes === 'closed' || eyes === 'happy') {
        const k = eyes === 'happy' ? -1 : 1, yc = k * (-0.15 + 0.55 * a * a);
        return Math.abs(b - yc) < 0.14 ? code(EYEK) : code(BODY, -1);
      }
      if (eyes === 'blink') return Math.abs(b) < 0.14 ? code(EYEK) : code(BODY, b > 0 ? -1 : 0);
      if (eyes === 'angry' && b > 0.3 - 0.55 * a) return code(BODY, -1); // lid slants down toward the middle
      if (Math.abs(b) < 0.12) return Math.abs(a) < 0.3 ? code(EYER, b > 0.02 ? 1 : 0) : code(EYEK);
      return code(EYEY, b > 0.45 ? 1 : b < -0.5 ? -1 : 0);
    };
    const faceMat = (s) => {
      if (s[0] > 0.5) {
        const m = eyeAt(s, E1, 1) || eyeAt(s, E2, -1);
        if (m) return m;
      }
      for (const c of CHIPS) {
        const dd = s[0] * c.d[0] + s[1] * c.d[1] + s[2] * c.d[2];
        if (dd < 0.9) continue;
        const a = (s[0] * c.a[0] + s[1] * c.a[1] + s[2] * c.a[2]) / c.r, b = (s[0] * c.b[0] + s[1] * c.b[1] + s[2] * c.b[2]) / (c.r * c.k);
        // angular chip: a blend of a diamond and a square
        const q = 0.7 * (Math.abs(a) + Math.abs(b)) + 0.3 * Math.max(Math.abs(a), Math.abs(b)) + 0.25 * Math.abs(a * b);
        if (q < 1) return q > 0.72 && b < -0.2 ? code(CHIP, -1) : code(CHIP, b > 0.35 ? 1 : 0);
      }
      return code(BODY);
    };
    const bodyPrim = E(body.t, M3.mul(body.L, M3.diag(...BR)), 1, 1, faceMat);
    prims.push(bodyPrim);

    /* --- rays: flat crystal flames, each two facets meeting on a raised ridge --- */
    const spin = +P.spin || 0;
    const TB = 0.2, CURL = 0.1, BEV = 0.42; // tilt back, pinwheel curl, facet bevel
    for (let k = 0; k < NR; k++) {
      const a = spin + (k / NR) * Math.PI * 2;
      const d = [0, Math.cos(a), Math.sin(a)], lat = [0, -Math.sin(a), Math.cos(a)];
      const U = V3.norm(V3.add(V3.add(V3.scale(d, Math.cos(TB)), [-Math.sin(TB), 0, 0]), V3.scale(lat, CURL)));
      const V0 = V3.norm(V3.sub(lat, V3.scale(U, V3.dot(lat, U))));
      let W0 = V3.cross(U, V0);
      if (W0[0] < 0) W0 = V3.scale(W0, -1);
      const f = chain(body, T(-4, 0, 0));
      for (const h of [0, 1]) {
        // left facet (v > 0) and right facet (v < 0): both edges lean back from the ridge
        const Vh = V3.norm(V3.sub(V3.scale(V0, Math.cos(BEV)), V3.scale(W0, (h ? -1 : 1) * Math.sin(BEV))));
        const Wh = V3.cross(U, Vh);
        prims.push(plate(f, SHAPES[k][h], { part: 2 + k, grp: 2 + h, thick: 1.4 }, [U, Vh, Wh]));
      }
    }

    const anchors = {
      top: P2W(body, [0, RT, 0]), bottom: P2W(body, [0, -RT, 0]), rayTip: P2W(body, [0, RT * Math.cos(spin), RT * Math.sin(spin)]),
      head: body.t, body: body.t, mouth: P2W(body, [BR[0], -8, 0]),
      eyeN: P2W(body, V3.scale(E1, BR[1])), eyeF: P2W(body, V3.scale(E2, BR[1])),
    };
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: { 1: 2, 2: 1, 3: 0 }, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14 };
  }

  function render(model, opt) {
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0 && pal[GLOW]) {
      const G = pal[GLOW].r;
      const lift = (e, k) => ({ r: e.r.map((c, i) => PX.mix(c, i < 4 ? e.r[i + 1] : G[4], g * k)), od: e.od, ol: PX.mix(e.ol, G[1], g * 0.4), ln: PX.mix(e.ln, G[0], g * 0.4) });
      pal = Object.assign({}, pal, { [BODY]: lift(pal[BODY], 0.6), [CHIP]: lift(pal[CHIP], 0.6), [RAY]: lift(pal[RAY], 0.7), [CORE]: lift(pal[CORE], 0.7) });
    }
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    // tight screen box: the ball plus the ray tips
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const c = model.anchors.body, cv = M3.v(V, c), rr = (RT + 6) * scale;
    x0 = ox + cv[0] - rr; x1 = ox + cv[0] + rr; y0 = oy - cv[1] - rr; y1 = oy - cv[1] + rr;
    const X0 = Math.max(0, Math.floor(x0) - 3), Y0 = Math.max(0, Math.floor(y0) - 3);
    const X1 = Math.min(W - 1, Math.ceil(x1) + 3), Y1 = Math.min(H - 1, Math.ceil(y1) + 3);
    const o2 = Object.assign({}, opt, { pal });
    if (X1 < X0 || Y1 < Y0) return Creature.render(model, o2);
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    const r = Creature.render(model, Object.assign(o2, { W: w, H: h, ox: ox - X0, oy: oy - Y0 }));
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.2, bw: 250, bh: 270, oy: 0.92 } };
})();
