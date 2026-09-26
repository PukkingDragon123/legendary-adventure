/* ------------------------------------------------------------------
   Solrock — the Meteorite Pokémon (1.2 m ≈ 210 units ray tip to tip).
   An orange sun-shaped rock: a round, slightly flattened face with two
   fierce red eyes set in black almonds, ringed by eight flame-like rays
   (red-orange with a yellow flame core, each curling the same way like a
   pinwheel). It floats ~20 units above the ground and spins its rays
   (the face stays upright).
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
  const { chain, T, R, code } = Creature;

  // material ids
  const BODY = 1, RAY = 2, EYEK = 3, EYER = 4, GLINT = 5, GLOW = 6, CORE = 7;
  const MAT = { BODY, RAY, EYEK, EYER, GLINT, GLOW, CORE };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#b25c1a', '#d98026', '#f4a33a', '#ffc566', '#ffe3a0'], od: '#62280a', ol: '#a8521a', ln: '#944616' },
    [RAY]:   { r: ['#9c2c18', '#c64422', '#e5622e', '#f88a46', '#ffb872'], od: '#561208', ol: '#962a16', ln: '#842412' },
    [CORE]:  { r: ['#c86a1c', '#e8902a', '#fbb540', '#ffd46e', '#fff0b0'], od: '#62280a', ol: '#a8521a', ln: '#b0621c' },
    [EYEK]:  { r: ['#140c0a', '#1a100c', '#221612', '#2c1c18', '#3a2822'], od: '#0a0504', ol: '#140c0a', ln: '#140c0a' },
    [EYER]:  { r: ['#8a0e16', '#b41a22', '#dc2e32', '#fa5a50', '#ffa090'], od: '#4a0610', ol: '#8a0e16', ln: '#7a0c14' },
    [GLINT]: { r: ['#f0e8e0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8078', ol: '#c8c0b8', ln: '#c8c0b8' },
    [GLOW]:  { r: ['#ffb040', '#ffc862', '#ffde90', '#fff0c4', '#ffffff'], od: '#a85010', ol: '#e08a2a', ln: '#d07a22' },
  });
  const GLOSSY = { [BODY]: 1 };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  const CY = 126;                 // hover height of the centre
  const BR = [36, 50, 50];        // face body radii (x = depth)
  const NR = 8;                   // rays
  const RT = 105;                 // ray tip distance from the centre
  const EYE = { y: 11, z: 17.5, w: 10.5, h: 6.4 };

  const DEFAULT = { spin: 0, glow: 0, eyes: 'open', bob: 0, mouth: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const eyes = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    const body = chain(T(0, CY + 8 * clamp(+P.bob || 0, -1, 1), 0));
    const prims = [];

    /* --- face: eyes as decals on the front of the body sphere --- */
    const faceMat = (s) => {
      const y = BR[1] * s[1], z = BR[2] * s[2];
      if (s[0] > 0.3) {
        for (const sd of [1, -1]) {
          const ex = (sd * z - EYE.z) / EYE.w, ey = (y - EYE.y) / EYE.h;
          if (ex * ex + ey * ey > 1.3) continue;
          if (eyes === 'closed' || eyes === 'happy') {
            const k = eyes === 'happy' ? -1 : 1, yc = k * (-0.2 + 0.7 * ex * ex);
            if (Math.abs(ey - yc) < 0.26 && Math.abs(ex) < 0.95) return code(EYEK);
            continue;
          }
          if (eyes === 'blink') { if (Math.abs(ey + 0.1) < 0.26 && Math.abs(ex) < 0.95) return code(EYEK); continue; }
          const alm = ex * ex + (ey / (1 - 0.3 * ex * ex)) ** 2;
          if (alm < 1) {
            // fierce: the inner end of the almond tips down (the angry lid cuts deeper)
            if (ey > (eyes === 'angry' ? 0.15 : 0.62) - (eyes === 'angry' ? 0.75 : 0.45) * -ex) return code(BODY, -1);
            const ix = (sd * z - EYE.z + 0.8) / 4.3, iy = (y - EYE.y + 0.4) / 4.4;
            if (ix * ix + iy * iy < 1) {
              if ((ix - 0.25) ** 2 + (iy - 0.45) ** 2 < 0.1) return code(GLINT);
              return code(EYER, iy > 0.3 ? 1 : 0);
            }
            return code(EYEK);
          }
        }
      }
      // a faint raised rim around the face
      const rr = Math.hypot(s[1], s[2]);
      if (s[0] > 0 && s[0] < 0.42 && rr > 0.9) return code(BODY, -1);
      return code(BODY);
    };
    const bodyPrim = E(body.t, M3.mul(body.L, M3.diag(...BR)), 1, 1, faceMat);
    prims.push(bodyPrim);

    /* --- rays: curling flames (broad base, mid, sharp tip), a yellow tongue up the middle --- */
    const spin = +P.spin || 0;
    // [radial centre, radial half-length, lateral half-width, thickness, curl from the previous piece]
    const PIECES = [[44, 20, 22, 12, 0], [18, 20, 14.5, 10, -0.16], [20, 25, 7, 7.5, -0.26]];
    for (let k = 0; k < NR; k++) {
      const a = spin + (k / NR) * Math.PI * 2;
      let f = chain(body, R(M3.rx(a)));  // ray axis = local +y, lateral = local z
      let u0 = 0;
      PIECES.forEach(([du, rl, lw, th, curl], j) => {
        f = chain(f, R(M3.rx(curl)), T(0, du, 0));
        u0 += du;
        const uc = u0;
        prims.push(E(f.t, M3.mul(f.L, M3.diag(th, rl, lw)), 2 + k, 2, (s) => {
          const u = uc + rl * s[1];
          if (j === 0 && s[1] < -0.3) return 0; // buried in the face
          const tongue = Math.abs(s[2]) < 0.55 * (1 - Math.max(0, (u - 50) / 34)) && s[0] > -0.3;
          if (tongue) return code(CORE, u > 60 ? 1 : 0);
          return code(RAY, s[0] > 0.55 ? 1 : u > 98 ? -1 : 0);
        }));
      });
    }

    const anchors = {
      top: P2W(body, [0, RT, 0]), bottom: P2W(body, [0, -RT, 0]), rayTip: P2W(body, [0, RT * Math.cos(spin), RT * Math.sin(spin)]),
      head: body.t, body: body.t, mouth: P2W(body, [BR[0], -8, 0]),
      eyeN: P2W(body, [BR[0] * 0.8, EYE.y, EYE.z]), eyeF: P2W(body, [BR[0] * 0.8, EYE.y, -EYE.z]),
    };
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: { 1: 1, 2: 0 }, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14 };
  }

  function render(model, opt) {
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0 && pal[GLOW]) {
      const G = pal[GLOW].r;
      const lift = (e, k) => ({ r: e.r.map((c, i) => PX.mix(c, i < 4 ? e.r[i + 1] : G[4], g * k)), od: e.od, ol: PX.mix(e.ol, G[1], g * 0.4), ln: PX.mix(e.ln, G[0], g * 0.4) });
      pal = Object.assign({}, pal, { [BODY]: lift(pal[BODY], 0.6), [RAY]: lift(pal[RAY], 0.6), [CORE]: { r: pal[CORE].r.map((c, i) => PX.mix(c, G[Math.min(4, i + 1)], g * 0.7)), od: pal[CORE].od, ol: pal[CORE].ol, ln: pal[CORE].ln } });
    }
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.2, bw: 250, bh: 270, oy: 0.92 } };
})();
