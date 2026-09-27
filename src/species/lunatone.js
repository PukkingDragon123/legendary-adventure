/* ------------------------------------------------------------------
   Lunatone — the Meteorite Pokémon (1.0 m ≈ 175 units tip to tip).
   Official look: a fat pale-cream crescent-moon rock with round crater
   rings on its face. A long faceted beak-like "nose" juts from the
   middle of the hollow toward the horn tips, split along its length by
   a black slit that runs into one big eye: a black round socket with a
   pink-red oval iris and a dark ring pupil.
   Orientation: the flat faces of the crescent look forward and back
   (±x), so the moon face and eye read like the official art from the
   usual 3/4 game views; the hollow (and the nose) points to the near
   side (+z). There is one eye on each flat face.
   Build: the crescent band is a chain of ellipsoids for the silhouette;
   its toon shading is taken from the analytic normal of the ideal smooth
   band (a per-pixel tone bias), so the chain never shows as ribs. The
   nose is four flat triangular facets.
   Model space: x = forward, y = up, z = near side at yaw 0, y = 0 = ground.

   Pose params:
     tilt  -1..1   rolls the crescent in its own plane (± ~0.6 rad)
     glow  0..1    moonlight: the rock brightens and its shadows lift
     eyes  'open' | 'closed' | 'blink' | 'angry' | 'happy'
     bob   -1..1   hover offset (± 8 units), for a floating bob
     mouth ignored (Lunatone has no mouth)
   Anchors: top, bottom, head, body, mouth (nose base), nose, eyeN (front eye), eyeF (back eye).
------------------------------------------------------------------- */
const Lunatone = (() => {
  const { chain, T, R, code, plate } = Creature;

  // material ids
  const ROCK = 1, CRATER = 2, EYEK = 3, EYER = 4, GLINT = 5, GLOW = 6, PUPIL = 7;
  const MAT = { ROCK, CRATER, EYEK, EYER, GLINT, GLOW, PUPIL };
  const PAL = Creature.palette({
    [ROCK]:   { r: ['#a4986c', '#c2b68a', '#ddd1a4', '#ede5c3', '#f9f5e2'], od: '#5a4e2c', ol: '#978a5c', ln: '#86794c' },
    [CRATER]: { r: ['#958960', '#b1a57a', '#cbc094', '#ddd4b0', '#ebe5c8'], od: '#4e4424', ol: '#857a50', ln: '#776b42' },
    [EYEK]:   { r: ['#0e0c0a', '#141210', '#1c1a16', '#2a2622', '#3a3630'], od: '#060504', ol: '#0e0c0a', ln: '#0e0c0a' },
    [EYER]:   { r: ['#a8424e', '#c25a66', '#d5737d', '#e59ea4', '#f6cacd'], od: '#5a1420', ol: '#8a2a36', ln: '#7a2230' },
    [PUPIL]:  { r: ['#5a1018', '#6e1620', '#821c2a', '#982636', '#b03444'], od: '#300810', ol: '#5a1018', ln: '#5a1018' },
    [GLINT]:  { r: ['#f0e8e0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8078', ol: '#c8c0b8', ln: '#c8c0b8' },
    [GLOW]:   { r: ['#e6dca0', '#f4ecbc', '#fdf8dc', '#fffef2', '#ffffff'], od: '#8a7a40', ol: '#c8b870', ln: '#b0a060' },
  });
  const GLOSSY = {};

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- smooth-shading override (set per render) ---------- */
  let NV = M3.I(), LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74];
  const toneOf = (x, y, z) => { const d = x * LD[0] + y * LD[1] + z * LD[2]; return d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3; };
  // tone bias turning the prim's own shading into the shading of body-frame normal (bx, by, bz)
  function smoothBias(prim, s, bx, by, bz) {
    const Li = prim.Li;
    if (!Li) return 0;
    const gx = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], gy = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], gz = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
    const gl = Math.hypot(gx, gy, gz) || 1;
    const vx = NV[0] * bx + NV[1] * by + NV[2] * bz, vy = NV[3] * bx + NV[4] * by + NV[5] * bz, vz = NV[6] * bx + NV[7] * by + NV[8] * bz;
    const vl = Math.hypot(vx, vy, vz) || 1;
    return toneOf(vx / vl, vy / vl, vz / vl) - toneOf(gx / gl, gy / gl, gz / gl);
  }
  const addBias = (c, b) => { const m = c & 31, k = clamp((c >> 5) - 2 + b, -2, 5); return m | ((k + 2) << 5); };

  /* ---------- crescent geometry (body frame: crescent in the x-y plane, faces ±z, hollow toward +x) ----------
     Measured from the official art: outer circle R 88 about the origin; the hollow is a much smaller
     circle (R 45) set far toward +x, so the back of the moon is very fat (~100 units across).
     Build: one domed disk (an ellipsoid R 88 x 88 x THK) with the hollow cut out of it, plus a chain
     of small ellipsoids that rounds off the hollow's inner wall. The rim chain is shaded from the
     normal of an ideal smooth tube, so it never shows as ribs. */
  const RO = 88;                               // outer circle radius (about the origin)
  const C = [57, 7.3], RI = 45;                // hollow circle centre and radius
  const THK = 25;                              // half-thickness of the disk at its centre
  const WR = 9;                                // radial half-width of the rounded inner wall
  const CEN_Y = 108;                           // hover height of the crescent's centre
  // distance from C to the outer circle along angle a (about C)
  const outerFromC = (ux, uy) => { const oc = C[0] * ux + C[1] * uy; return -oc + Math.sqrt(Math.max(0, oc * oc - C[0] * C[0] - C[1] * C[1] + RO * RO)); };
  const rimW = (ux, uy) => Math.min(WR, (outerFromC(ux, uy) - RI) / 2);
  const dome = (x, y) => THK * Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (RO * RO)));
  const tipAt = (lo, hi, rising) => { for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if ((rimW(Math.cos(m), Math.sin(m)) > 0) === rising) hi = m; else lo = m; } return (lo + hi) / 2; };
  const A_TIP0 = tipAt(0.05, Math.PI, true), A_TIP1 = tipAt(Math.PI, 2 * Math.PI - 0.05, false);
  const SEGS = [];
  {
    const N = 34, a0 = A_TIP0 + 0.02, a1 = A_TIP1 - 0.02;
    for (let i = 0; i < N; i++) {
      const a = a0 + ((a1 - a0) * i) / (N - 1), ux = Math.cos(a), uy = Math.sin(a);
      const w = Math.max(0.6, rimW(ux, uy)), rc = RI + w, c = [C[0] + rc * ux, C[1] + rc * uy, 0];
      const t = Math.max(1, dome(c[0], c[1]));
      SEGS.push({ a, c, w, t, rc, len: ((a1 - a0) / (N - 1)) * rc * 1.7 + 0.5 });
    }
  }
  // craters: body-frame centres (x, y), face (-1 = front face, +1 = back face, 0 = outer rim), radius x, radius y
  const CRATERS = [
    [-46, 53, -1, 8.5, 10], [-69, 32, -1, 2.5, 2.8], [-73, -42, -1, 8, 12], [-32, -56, -1, 10, 12.5], [-5, -58, -1, 6.5, 7.5], [-20, 72, -1, 3, 3],
    [-46, 50, 1, 8, 8.5], [-72, -22, 1, 6, 7], [-36, -60, 1, 9, 9.5], [-4, 62, 1, 5, 5.5], [-8, -66, 1, 5, 5], [-70, 30, 1, 3, 3],
    [-86, 10, 0, 6, 6], [-80, -40, 0, 5, 5], [-44, 76, 0, 5, 5], [-28, -84, 0, 4.5, 4.5],
  ];
  const EYE_C = [-40, -3], EYE_RX = 25, EYE_RY = 30; // eye socket centre (x, y) and radii on each flat face
  const IRIS = [8.5, 0, 11, 15.5];                  // iris offset (toward the nose) and radii

  /* ---------- the nose: a faceted beak ----------
     A kite in profile (tip, top, rear-top, rear-bottom, bottom) split along its length by the black
     slit; the widest point is 60% of the way back from the tip. Upper and lower jaws are each built
     from flat triangular facets meeting on a side ridge that carries the slit. */
  const SLIT_Y = -1.5, NOSE_TIP = [55, SLIT_Y, 0];
  // sections: x, top / bottom edge heights, half-widths of the top ridge, the slit ridge and the bottom ridge
  const NW = { x: 10.6, top: 18.7, bot: -21, zt: 20, zs: 27, zb: 20 };  // widest section
  const NR = { x: -18, top: 5, bot: -14, zt: 28, zs: 31, zb: 28 };      // root (in front of the socket)
  function facet(pts, m, slits) {
    const A = pts[0], ab = V3.sub(pts[1], A), ac = V3.sub(pts[pts.length - 1], A);
    const u = V3.norm(ab), w = V3.norm(V3.cross(ab, ac)), v = V3.cross(w, u);
    const P2 = pts.map((p) => { const d = V3.sub(p, A); return [V3.dot(d, u), V3.dot(d, v)]; });
    const bb = Shape2D.bbox(P2, 0.5), ring = [...P2, P2[0]];
    const slit = (x, y) => slits.some(([i, j]) => Shape2D.segDist(x, y, P2[i][0], P2[i][1], P2[j][0], P2[j][1]) < 1.8);
    const shape = bakeShape({ bb, test: (x, y) => (Shape2D.inPoly(x, y, P2) || Shape2D.polyDist(x, y, ring) < 0.5 ? (slit(x, y) ? code(EYEK) : m) : 0) }, 0.4);
    return { A, axes: [u, v, w], shape };
  }
  const NOSE = [];
  {
    const V = (S, k, sd) => [S.x, k === 't' ? S.top : k === 'b' ? S.bot : SLIT_Y, sd * S['z' + k]];
    const T0 = NOSE_TIP, up = code(ROCK, 0), dn = code(ROCK, -1);
    for (const sd of [1, -1]) {
      // upper jaw side (tip triangle + two triangles back to the root), slit along the bottom edge
      NOSE.push(facet([T0, V(NW, 't', sd), V(NW, 's', sd)], up, [[0, 2]]));
      NOSE.push(facet([V(NW, 's', sd), V(NW, 't', sd), V(NR, 't', sd)], up, []));
      NOSE.push(facet([V(NW, 's', sd), V(NR, 't', sd), V(NR, 's', sd)], up, [[0, 2]]));
      // lower jaw side
      NOSE.push(facet([T0, V(NW, 'b', sd), V(NW, 's', sd)], dn, [[0, 2]]));
      NOSE.push(facet([V(NW, 's', sd), V(NW, 'b', sd), V(NR, 'b', sd)], dn, []));
      NOSE.push(facet([V(NW, 's', sd), V(NR, 'b', sd), V(NR, 's', sd)], dn, [[0, 2]]));
    }
    // top and bottom faces
    for (const k of ['t', 'b']) {
      NOSE.push(facet([T0, V(NW, k, 1), V(NW, k, -1)], k === 't' ? code(ROCK, 1) : dn, []));
      NOSE.push(facet([V(NW, k, 1), V(NR, k, 1), V(NR, k, -1), V(NW, k, -1)], k === 't' ? code(ROCK, 1) : dn, []));
    }
  }

  const DEFAULT = { tilt: 0, glow: 0, eyes: 'open', bob: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const tilt = clamp(+P.tilt || 0, -1, 1), eyes = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    // body frame: crescent plane → world y-z (faces look along ±x), hollow → world +z
    const body = chain(T(0, CEN_Y + 8 * clamp(+P.bob || 0, -1, 1), 0), R(M3.ry(-Math.PI / 2)), R(M3.rz(tilt * 0.6)));
    const prims = [];
    // decals from a body-frame point (x, y, z)
    const surf = (x, y, z) => {
      if (Math.abs(z) > 3) {
        const ex = (x - EYE_C[0]) / EYE_RX, ey = (y - EYE_C[1]) / EYE_RY, er = ex * ex + ey * ey;
        if (er < 1) {
          if (eyes === 'closed' || eyes === 'happy') {
            const k = eyes === 'happy' ? -1 : 1, yc = k * (-0.2 + 0.55 * ex * ex);
            if (Math.abs(ey - yc) < 0.1 && Math.abs(ex) < 0.72) return code(EYEK);
          } else if (eyes === 'blink') {
            if (Math.abs(ey) < 0.1 && Math.abs(ex) < 0.85) return code(EYEK);
          } else {
            // black socket, pink-red oval iris with a dark ring pupil and a glint
            const ix = (x - EYE_C[0] - IRIS[0]) / IRIS[2], iy = (y - EYE_C[1] - IRIS[1]) / IRIS[3], ir = ix * ix + iy * iy;
            if (eyes === 'angry' && ey > 0.25 - 0.5 * ex && ir < 1.3) return code(EYEK);
            if (ir < 1) {
              if ((ix + 0.42) ** 2 + (iy - 0.5) ** 2 < 0.035) return code(GLINT);
              const px = (x - EYE_C[0] - IRIS[0] - 0.8) / 2.8, py = (y - EYE_C[1] - IRIS[1]) / 8, pr = px * px + py * py;
              if (pr < 1 && pr > 0.36) return code(PUPIL);
              return code(EYER, iy > 0.45 ? 1 : iy < -0.55 ? -1 : 0);
            }
            return code(EYEK);
          }
        }
      }
      for (const cr of CRATERS) {
        const cs = cr[2];
        if (cs !== 0 ? Math.sign(z) !== cs || Math.abs(z) < 5 : Math.abs(z) > 11) continue;
        const dx = (x - cr[0]) / cr[3], dy = (y - cr[1]) / cr[4], d = Math.hypot(dx, dy);
        if (d < 1) {
          if (d > 0.78) return code(CRATER, -1);                 // the crater's rim line
          return dx + dy < -0.3 ? code(CRATER, -1) : code(CRATER, dx + dy > 0.5 ? 1 : 0);
        }
      }
      return code(ROCK);
    };
    // the domed disk, with the hollow (and the band of the rounded wall) cut away
    const disk = E(body.t, M3.mul(body.L, M3.diag(RO, RO, THK)), 1, 1, (s) => {
      const x = RO * s[0], y = RO * s[1], qx = x - C[0], qy = y - C[1], rr = Math.hypot(qx, qy);
      if (rr < RI + 2 * WR && rr < RI + Math.max(0, rimW(qx / rr, qy / rr))) return 0;
      return surf(x, y, THK * s[2]);
    });
    prims.push(disk);
    // the hollow's inner wall: a chain of small ellipsoids, shaded from the ideal tube normal
    for (const sg of SEGS) {
      const f = chain(body, T(...sg.c), R(M3.rz(sg.a)));
      const r = [sg.w, sg.len, sg.t];
      const cosA = Math.cos(sg.a), sinA = Math.sin(sg.a);
      const prim = E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), 1, 1, null);
      prim.mat = (s) => {
        const lx = r[0] * s[0], ly = r[1] * s[1], z = r[2] * s[2];
        const x = sg.c[0] + lx * cosA - ly * sinA, y = sg.c[1] + lx * sinA + ly * cosA;
        if (x * x + y * y > RO * RO) return 0; // near the horn tips the chain pokes past the outer rim
        const qx = x - C[0], qy = y - C[1], rr = Math.hypot(qx, qy) || 1;
        const dr = Math.min(0, (rr - sg.rc) / (sg.w * sg.w)), dz = z / (sg.t * sg.t);
        return addBias(surf(x, y, z), smoothBias(prim, s, (dr * qx) / rr, (dr * qy) / rr, dz));
      };
      prims.push(prim);
    }
    // nose facets
    for (const n of NOSE) prims.push(plate(chain(body, T(...n.A)), n.shape, { part: 2, grp: 2, thick: 1.2 }, n.axes));

    const anchors = {
      top: P2W(body, [0, RO, 0]), bottom: P2W(body, [0, -RO, 0]),
      head: P2W(body, [EYE_C[0], EYE_C[1], 0]), body: body.t,
      mouth: P2W(body, [NR.x + 10, SLIT_Y, 0]), nose: P2W(body, NOSE_TIP),
      eyeN: P2W(body, [EYE_C[0], EYE_C[1], -THK]), eyeF: P2W(body, [EYE_C[0], EYE_C[1], THK]),
    };
    return { prims, stamps: [], dots: [], anchors, pose: P, bodyL: body.L, pri: { 1: 0, 2: 1 }, glossy: GLOSSY, baseMat: ROCK, shadowSteps: 14 };
  }

  function render(model, opt) {
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0 && pal[ROCK] && pal[GLOW]) {
      const lift = (e) => ({ r: e.r.map((c, i) => PX.mix(c, pal[GLOW].r[Math.min(4, i + 1)], g * (i < 3 ? 0.55 : 0.35))), od: e.od, ol: PX.mix(e.ol, pal[GLOW].r[1], g * 0.4), ln: PX.mix(e.ln, pal[GLOW].r[0], g * 0.4) });
      pal = Object.assign({}, pal, { [ROCK]: lift(pal[ROCK]), [CRATER]: lift(pal[CRATER]) });
    }
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    NV = M3.mul(M3.mul(M3.rx(pitch), M3.ry(-yaw)), model.bodyL || M3.I());
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    // tight screen box around the moon (a sphere bound: the nose stays inside ROY)
    const cv = M3.v(V, model.anchors.body), rr = (RO + 4) * scale;
    const X0 = Math.max(0, Math.floor(ox + cv[0] - rr) - 3), Y0 = Math.max(0, Math.floor(oy - cv[1] - rr) - 3);
    const X1 = Math.min(W - 1, Math.ceil(ox + cv[0] + rr) + 3), Y1 = Math.min(H - 1, Math.ceil(oy - cv[1] + rr) + 3);
    const o2 = Object.assign({}, opt, { pal });
    // draw the band front to back so hidden segments fail the depth test before their (costly) mat
    const dz = (p) => V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2];
    model = Object.assign({}, model, { prims: model.prims.slice().sort((a, b) => dz(b) - dz(a)) });
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 230, bh: 250, oy: 0.9 } };
})();
