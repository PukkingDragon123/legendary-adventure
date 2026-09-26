/* ------------------------------------------------------------------
   Lunatone — the Meteorite Pokémon (1.0 m ≈ 175 units tip to tip).
   A thick, pale-yellow crescent-moon rock: the concave side faces
   forward (a "C" in profile), a pointed nose juts into the hollow of
   the crescent and one red eye (red iris in a black almond, like the
   official art) sits on each flat face above it. Craters pock the
   surface. It floats, hovering ~20 units above the ground.
   Build: the crescent band is a chain of ellipsoids for the silhouette;
   its toon shading is taken from the analytic normal of the ideal smooth
   band (a per-pixel tone bias), so the chain never shows as ribs.
   Model space: x = forward, y = up, z = near side at yaw 0, y = 0 = ground.

   Pose params:
     tilt  -1..1   rolls the crescent in its own plane (± ~0.6 rad)
     glow  0..1    moonlight: the rock brightens and its shadows lift
     eyes  'open' | 'closed' | 'blink' | 'angry' | 'happy'
     bob   -1..1   hover offset (± 8 units), for a floating bob
     mouth ignored (Lunatone has no mouth)
   Anchors: top, bottom, head, body, mouth (nose base), nose, eyeN, eyeF.
------------------------------------------------------------------- */
const Lunatone = (() => {
  const { chain, T, R, code } = Creature;

  // material ids
  const ROCK = 1, CRATER = 2, EYEK = 3, EYER = 4, GLINT = 5, GLOW = 6;
  const MAT = { ROCK, CRATER, EYEK, EYER, GLINT, GLOW };
  const PAL = Creature.palette({
    [ROCK]:   { r: ['#a08a4c', '#c9b26c', '#e8d796', '#f6eabc', '#fffae2'], od: '#5a461c', ol: '#98803e', ln: '#8a7236' },
    [CRATER]: { r: ['#86703a', '#a88f52', '#c6ad6a', '#dcc788', '#eedfae'], od: '#4c3a14', ol: '#806a34', ln: '#6e5a2a' },
    [EYEK]:   { r: ['#140e0c', '#1a1210', '#221816', '#2c201c', '#3a2c26'], od: '#0a0605', ol: '#140e0c', ln: '#140e0c' },
    [EYER]:   { r: ['#8a1018', '#b41c24', '#dc3036', '#fa5c56', '#ffa296'], od: '#4a0610', ol: '#8a1018', ln: '#7a0c14' },
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

  /* ---------- crescent geometry (body frame: crescent in the x-y plane, faces ±z) ---------- */
  const RO = 88, RI = 72, DX = 38;            // outer circle, inner (cut) circle radius and its forward offset
  const THK = 22;                              // half-thickness at the back of the band
  const CEN_Y = 108;                           // hover height of the crescent's centre
  function bandAt(a) {
    const ux = Math.cos(a), uc = ux * DX;
    const tin = uc + Math.sqrt(Math.max(0, uc * uc - DX * DX + RI * RI));
    const w = Math.max(0.5, (RO - tin) / 2), rc = (RO + tin) / 2;
    const back = Math.cos(a) < 0 ? -Math.cos(a) : 0; // 1 at the back of the moon
    const t = Math.min(THK * (0.62 + 0.38 * back), w * 1.25 + 1.5);
    return { w, rc, t };
  }
  const XT = (RO * RO - RI * RI + DX * DX) / (2 * DX);
  const A_TIP = Math.atan2(Math.sqrt(RO * RO - XT * XT), XT);
  const SEGS = [];
  {
    const N = 22, a0 = A_TIP + 0.05, a1 = 2 * Math.PI - A_TIP - 0.05;
    for (let i = 0; i < N; i++) {
      const a = a0 + ((a1 - a0) * i) / (N - 1);
      const b = bandAt(a);
      SEGS.push({ a, c: [b.rc * Math.cos(a), b.rc * Math.sin(a), 0], w: b.w, t: b.t, len: ((a1 - a0) / (N - 1)) * b.rc * 1.1 + 1 });
    }
  }
  // craters: body-frame centres (x, y), face (+1 near, -1 far, 0 = on the outer rim), radius
  const CRATERS = [
    [-62, 34, 1, 9], [-52, -40, 1, 7.5], [-77, -6, 1, 5.5], [-30, 66, 1, 5], [-18, -68, 1, 6.5], [-47, 55, 1, 4],
    [-64, 30, -1, 8.5], [-44, -50, -1, 9], [-78, 4, -1, 6], [-24, 62, -1, 6], [-12, -72, -1, 5], [-52, 50, -1, 4],
    [-86, 22, 0, 6.5], [-80, -40, 0, 6], [-48, 74, 0, 5.5], [-36, -80, 0, 5],
  ];
  const EYE_C = [-47, 17]; // eye centre (x, y) on each flat face

  const DEFAULT = { tilt: 0, glow: 0, eyes: 'open', bob: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const tilt = clamp(+P.tilt || 0, -1, 1), eyes = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    const body = chain(T(0, CEN_Y + 8 * clamp(+P.bob || 0, -1, 1), 0), R(M3.rz(tilt * 0.6)));
    const prims = [];
    // decals from a body-frame point (x, y, z)
    const surf = (x, y, z) => {
      if (Math.abs(z) > 4) {
        const ex = (x - EYE_C[0]) / 9.5, ey = (y - EYE_C[1]) / 6.2;
        if (ex * ex + ey * ey < 1.3) {
          if (eyes === 'closed' || eyes === 'happy') {
            const k = eyes === 'happy' ? -1 : 1, yc = k * (-0.25 + 0.75 * ex * ex);
            if (Math.abs(ey - yc) < 0.24 && Math.abs(ex) < 0.95) return code(EYEK);
          } else if (eyes === 'blink') {
            if (Math.abs(ey + 0.1) < 0.26 && Math.abs(ex) < 0.95) return code(EYEK);
          } else {
            // black almond, red iris with a glint; the angry lid slants down toward the nose
            const alm = ex * ex + (ey / (1 - 0.35 * ex * ex)) ** 2;
            if (alm < 1) {
              if (eyes === 'angry' && ey > 0.2 - 0.6 * ex) return code(ROCK, -1);
              const ix = (x - EYE_C[0] - 1.6) / 4.3, iy = (y - EYE_C[1] + 0.2) / 4.5;
              if (ix * ix + iy * iy < 1) {
                if ((ix + 0.3) ** 2 + (iy - 0.42) ** 2 < 0.1) return code(GLINT);
                return code(EYER, iy > 0.3 ? 1 : 0);
              }
              return code(EYEK);
            }
          }
        }
      }
      for (const cr of CRATERS) {
        const cs = cr[2];
        if (cs !== 0 ? Math.sign(z) !== cs || Math.abs(z) < 6 : Math.abs(z) > 11) continue;
        const dx = x - cr[0], dy = y - cr[1], d = Math.hypot(dx, dy);
        if (d < cr[3]) return d > cr[3] * 0.7 ? (dx + dy > 0 ? code(ROCK, 1) : code(CRATER, -1)) : code(CRATER);
      }
      return code(ROCK);
    };
    // crescent band: chain of ellipsoids, shaded from the ideal band normal
    for (const sg of SEGS) {
      const f = chain(body, T(...sg.c), R(M3.rz(sg.a)));
      const r = [sg.w, sg.len, sg.t];
      const cosA = Math.cos(sg.a), sinA = Math.sin(sg.a);
      const prim = E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), 1, 1, null);
      prim.mat = (s) => {
        const lx = r[0] * s[0], ly = r[1] * s[1], z = r[2] * s[2];
        const x = sg.c[0] + lx * cosA - ly * sinA, y = sg.c[1] + lx * sinA + ly * cosA;
        // ideal normal: elliptic cross-section (w, t) of the band at this point's angle
        const a = Math.atan2(y, x), b = bandAt(a < 0 ? a + 2 * Math.PI : a), rr = Math.hypot(x, y);
        const dr = (rr - b.rc) / (b.w * b.w), dz = z / (b.t * b.t);
        const nx = (dr * x) / (rr || 1), ny = (dr * y) / (rr || 1);
        return addBias(surf(x, y, z), smoothBias(prim, s, nx, ny, dz));
      };
      prims.push(prim);
    }
    // nose: a sharp cone jutting forward from the middle of the inner edge
    const tin = RO - 2 * bandAt(Math.PI).w;
    const noseBase = [-tin, -5, 0];
    // (a long ellipsoid sunk deep into the rock, so the visible part tapers like a cone)
    const nf = chain(body, T(-tin - 8, -5, 0), R(M3.rz(-0.1)));
    prims.push(E(nf.t, M3.mul(nf.L, M3.diag(36, 7.2, 8.4)), 2, 2, (s) => (s[0] < 0.1 ? 0 : code(ROCK, s[1] > 0.35 ? 1 : 0))));

    const anchors = {
      top: P2W(body, [0, RO, 0]), bottom: P2W(body, [0, -RO, 0]),
      head: P2W(body, [-50, 10, 0]), body: body.t,
      mouth: P2W(body, noseBase), nose: P2W(nf, [36, 0, 0]),
      eyeN: P2W(body, [EYE_C[0], EYE_C[1], 18]), eyeF: P2W(body, [EYE_C[0], EYE_C[1], -18]),
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
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
      x0 = Math.min(x0, ox + cv[0] - rx); x1 = Math.max(x1, ox + cv[0] + rx); y0 = Math.min(y0, oy - cv[1] - ry); y1 = Math.max(y1, oy - cv[1] + ry);
    }
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 230, bh: 250, oy: 0.9 } };
})();
