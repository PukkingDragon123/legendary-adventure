/* ------------------------------------------------------------------
   Minior — the Meteor Pokémon (0.3 m ≈ 52 units at scale 1).
   Meteor Form: a round, dusty mauve-brown rock shell with small dark
   triangle marks, thin fracture lines, grey-white cone spikes set in
   dark sockets, a little round knob and two big dark hollow eyes.
   Inside sits the glossy glowing Core: white glowing eyes, each hugged
   by a pale swirl crescent, a small smile, a few darker triangle marks
   and white-tipped spikes (the grey meteor spikes are those same core
   spikes poking through the shell).
   Model space: x = forward (the face), y = up, z = near side at yaw 0,
   ground (bottom of the ball) at y = 0.

   Minior.core(i) → full palette for core colour i:
     0 red, 1 orange, 2 yellow, 3 green, 4 blue, 5 indigo, 6 violet, 7 pink.
   (Minior.PAL is the pink core.)

   Pose params:
     crack  0..1   0 = intact Meteor Form (thin dark fracture lines);
                   0..0.3 the fracture lines light up with the core's glow and
                   spread; 0.35..1 shell chunks fall away one by one (the two
                   face chunks go together at ~0.68), showing the glossy core
                   through the holes with glowing broken edges; 1 = Core Form.
     shell  'meteor' | 'core'  convenience: 'core' forces crack = 1
     spin   radians — tumbling rotation (about an axis tilted off vertical)
     glow   0..1   bursting: brighter core ramp, wider/brighter glowing seams
     eyes   'open' | 'happy' | 'closed' | 'blink'
     mouth  0..1   small open mouth (Core Form: the smile opens)
     squash -0.5..0.5  vertical squash (+ = flattened, for bounces)
   Anchors: top, head, body, core, mouth, eyeN, eyeF.
------------------------------------------------------------------- */
const Minior = (() => {
  const { ell, chain, T, R, F, code, sph } = Creature;

  // material ids
  const SHELL = 1, MARK = 2, SPIKE = 3, HOLE = 4, CORE = 5, GLOW = 6, SWIRL = 7, EYEW = 8;
  const MAT = { SHELL, MARK, SPIKE, HOLE, CORE, GLOW, SWIRL, EYEW };

  /* ---------- palettes ---------- */
  const BASE = {
    [SHELL]: { r: ['#6c4c4c', '#8c6a68', '#a88480', '#c2a09a', '#dcc0b8'], od: '#3a2224', ol: '#684846', ln: '#5c3e3c' },
    [MARK]:  { r: ['#4a2c2c', '#5c3838', '#704644', '#845652', '#986862'], od: '#2a1616', ol: '#4a2c2c', ln: '#3a2020' },
    [SPIKE]: { r: ['#8a8c94', '#aeb0b6', '#cfd1d6', '#eceef0', '#ffffff'], od: '#42444c', ol: '#70727a', ln: '#5c5e66' },
    [HOLE]:  { r: ['#1c1a1e', '#242228', '#2e2c32', '#3a3840', '#4a4852'], od: '#0e0c10', ol: '#1c1a1e', ln: '#141216' },
  };
  // per core colour: c = glossy core ramp (+ od/ol/ln), g = bright glow ramp, w = pale swirl ramp
  const CORES = [
    { c: ['#a8243a', '#d23a48', '#f25a5a', '#ff8e86', '#ffd6cc'], od: '#6a0c20', ol: '#a8243a', ln: '#8e1a2e', g: ['#ff7c72', '#ffa092', '#ffc6ba', '#ffe8e0', '#ffffff'], w: ['#f2acaa', '#fbcac6', '#ffe4e0', '#fff4f2', '#ffffff'] },
    { c: ['#bc5418', '#e67824', '#ffa040', '#ffc67c', '#ffeed0'], od: '#742c06', ol: '#b4521a', ln: '#9e4614', g: ['#ffb262', '#ffc88a', '#ffdeb2', '#fff2de', '#ffffff'], w: ['#f6c89a', '#fddcba', '#ffefdc', '#fff8ee', '#ffffff'] },
    { c: ['#b89414', '#e0bc28', '#f8de46', '#fff08c', '#fffbd6'], od: '#6e5004', ol: '#ac8a0e', ln: '#98780a', g: ['#fff06e', '#fff49a', '#fff8c2', '#fffce6', '#ffffff'], w: ['#f2e49c', '#faeec0', '#fff7de', '#fffcf0', '#ffffff'] },
    { c: ['#1c8a3c', '#34b452', '#5ad86a', '#96f09e', '#deffe2'], od: '#0a4a1c', ol: '#1c7e36', ln: '#166e2e', g: ['#80f090', '#a6f8b2', '#caffd2', '#eafff0', '#ffffff'], w: ['#ade8b6', '#caf4d0', '#e4fce8', '#f4fff6', '#ffffff'] },
    { c: ['#1a62b6', '#2c86de', '#50aaff', '#92d0ff', '#def2ff'], od: '#0a326e', ol: '#1a5caa', ln: '#145098', g: ['#80c8ff', '#a6daff', '#caeaff', '#e8f6ff', '#ffffff'], w: ['#acd4f6', '#c8e4fc', '#e2f2ff', '#f2f9ff', '#ffffff'] },
    { c: ['#2c2c98', '#4444c4', '#6a6aea', '#9e9eff', '#e2e2ff'], od: '#16145c', ol: '#2c2c90', ln: '#262680', g: ['#9a9cff', '#b6b8ff', '#d0d0ff', '#eaeaff', '#ffffff'], w: ['#bebef2', '#d2d2f8', '#e8e8ff', '#f4f4ff', '#ffffff'] },
    { c: ['#6c2494', '#9238c0', '#b858e8', '#d898ff', '#f4e2ff'], od: '#3c0c5c', ol: '#6a2290', ln: '#5c1c7e', g: ['#d08cff', '#deaaff', '#eac8ff', '#f6e8ff', '#ffffff'], w: ['#dab6f2', '#e6cafa', '#f2e2ff', '#faf2ff', '#ffffff'] },
    { c: ['#a8305c', '#c84a78', '#dc6090', '#ee8cb2', '#ffd0e2'], od: '#6c1436', ol: '#a4305e', ln: '#942a52', g: ['#f698be', '#ffb6d2', '#ffd4e6', '#ffedf5', '#ffffff'], w: ['#ecb2c8', '#f6ccdc', '#fae0e9', '#fff0f6', '#ffffff'] },
  ];
  const palCache = [];
  function core(i) {
    const k = ((Math.floor(i) % 8) + 8) % 8;
    if (palCache[k]) return palCache[k];
    const C = CORES[k];
    return (palCache[k] = Creature.palette(Object.assign({}, BASE, {
      [CORE]: { r: C.c, od: C.od, ol: C.ol, ln: C.ln },
      [GLOW]: { r: C.g, od: C.ol, ol: C.c[2], ln: C.c[2] },
      [SWIRL]: { r: C.w, od: C.od, ol: C.ol, ln: C.c[1] },
      [EYEW]: { r: [C.w[2], C.w[3], '#ffffff', '#ffffff', '#ffffff'], od: C.od, ol: C.ol, ln: C.c[1] },
    })));
  }
  const PAL = core(7);
  const GLOSSY = { [CORE]: 1, [SPIKE]: 1 };

  /* ---------- small math ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const nrm = V3.norm, dot = V3.dot, cross = V3.cross;
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453; return h - Math.floor(h); };
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  // tangent frame at unit direction d: [t1, t2] (t2 ≈ "up" on the surface)
  function tangents(d) {
    const up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const t2 = nrm(V3.sub(up, V3.scale(d, dot(up, d))));
    return [cross(t2, d), t2];
  }

  /* ---------- geometry ---------- */
  const RS = 21;          // shell radius
  const RC = 20.4;        // core radius (just inside the shell)
  const RT = 28.4;        // spike tip distance from the centre
  const LS = RT - RC;     // spike length from the core surface
  const TILT = nrm([0.42, 1, 0.24]); // tumble axis

  // face: eyes at ±z (near eye = +z), in body space
  const EYE_AZ = 0.5, EYE_V = 0.03;
  const EYES = [1, -1].map((sd) => {
    const e = sph(sd * EYE_AZ, EYE_V);
    const [t1, t2] = tangents(e);
    // outward tangent (away from the face centre) and up tangent
    const out = V3.scale(t1, dot(t1, [0, 0, sd]) >= 0 ? 1 : -1);
    return { sd, e, u: out, v: t2, phc: sd > 0 ? -0.55 : 0.55 };
  });
  const E_HOLE = 0.31;     // meteor eye hole angular radius
  const E_WHITE = 0.175, E_PALE = 0.225; // core eye: white glow, pale rim
  const SW_IN = 0.3, SW_T = 0.155, SW_SPAN = 1.62; // swirl crescent: inner radius, max thickness, half-span (rad)
  const SMILE = sph(0, -0.24);
  const [SM_U, SM_V] = tangents(SMILE);
  const KNOB = sph(-0.84, -0.32);

  // spikes: a ring of 7 around the face rim + 3 on the back
  const SPIKES = [];
  {
    const x0 = [0.28, 0.06, 0.3, 0.1, 0.26, 0.04, 0.22];
    for (let k = 0; k < 7; k++) {
      const ph = (15 - k * 51.43) * Math.PI / 180;
      SPIKES.push(nrm([x0[k], Math.cos(ph), Math.sin(ph)]));
    }
    for (const ph of [0.5, 2.6, 4.7]) SPIKES.push(nrm([-0.78, 0.62 * Math.cos(ph), 0.62 * Math.sin(ph)]));
  }
  const SOCK = 0.27; // socket ring angular radius on the shell
  // spike: one long ellipsoid sunk deep into the ball, so the part outside is a smooth, slightly
  // rounded cone ("bullet"): centre at -SPK_C·LS below the core surface, half-length SPK_A·LS, radius SPK_B·LS
  const SPK_C = 1.2, SPK_A = 2.2, SPK_B = 0.6;
  // shell chunks (Voronoi cells); the two face chunks are centred on the eyes
  const SEEDS = [
    EYES[0].e, EYES[1].e, sph(0, 0.62), sph(0, -0.62),
    sph(1.2, 0.5), sph(-1.2, 0.5), sph(1.25, -0.45), sph(-1.25, -0.45), sph(1.9, 0.05), sph(-1.9, 0.05),
    sph(0.5, -0.9), sph(0.4, 0.93), sph(2.6, 0.55), sph(-2.6, 0.55), sph(2.7, -0.4), sph(-2.7, -0.4),
    sph(Math.PI, 0.05), sph(-2.2, -0.9), sph(2.1, -0.85), sph(3.0, 0.95),
  ].map(nrm);
  const NS = SEEDS.length;
  // seeds → chunk groups (the eyes, brow and chin form one face chunk, so no seam ever frames the eyes)
  const GROUP = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const NG = 17;
  // fall order (0..1) per chunk group: sides first, then the face, the back last
  const ORDER = [0.5, 0.15, 0.3, 0.08, 0.22, 0.62, 0.55, 0.35, 0.7, 0.8, 0.75, 0.85, 0.9, 0.95, 0.65, 0.6, 0.88];
  const SEAM_ORD = [];
  for (let i = 0; i < NG; i++) { SEAM_ORD[i] = []; for (let j = 0; j < NG; j++) SEAM_ORD[i][j] = hash(Math.min(i, j), Math.max(i, j)); }
  // triangle marks on the shell (Fibonacci sphere minus face / sockets / knob)
  function makeTris(n, size, avoid) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996 + 0.7;
      const d = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (avoid(d)) continue;
      const [b1, b2] = tangents(d), rot = hash(i, 3) * 6.283;
      out.push({ d, b1, b2, c: Math.cos(rot), s: Math.sin(rot), k: size * (0.85 + 0.35 * hash(i, 7)) });
    }
    return out;
  }
  const nearEye = (d, lim) => EYES.some((E) => dot(d, E.e) > Math.cos(lim));
  const nearSpike = (d, lim) => SPIKES.some((q) => dot(d, q) > Math.cos(lim));
  const TRIS = makeTris(40, 0.15, (d) => nearEye(d, E_HOLE + 0.12) || nearSpike(d, SOCK + 0.1) || dot(d, KNOB) > Math.cos(0.3));
  const CTRIS = makeTris(13, 0.15, (d) => nearEye(d, 0.62) || nearSpike(d, 0.38) || dot(d, SMILE) > Math.cos(0.4));
  function triAt(list, s) {
    for (const m of list) {
      if (s[0] * m.d[0] + s[1] * m.d[1] + s[2] * m.d[2] < 0.95) continue;
      const u = s[0] * m.b1[0] + s[1] * m.b1[1] + s[2] * m.b1[2], v = s[0] * m.b2[0] + s[1] * m.b2[1] + s[2] * m.b2[2];
      const uu = u * m.c - v * m.s, vv = u * m.s + v * m.c, k = m.k;
      if (vv > -k * 0.45 && vv < k * 0.75 && Math.abs(uu) < (k * 0.75 - vv) * 0.72) return true;
    }
    return false;
  }

  let PXA = 1 / RS; // ~one pixel in unit-sphere units (set per render from the scale)

  const DEFAULT = { crack: 0, spin: 0, glow: 0, eyes: 'open', mouth: 0, squash: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const crack = P.shell === 'core' ? 1 : clamp(+P.crack || 0, 0, 1);
    const glow = clamp(+P.glow || 0, 0, 1);
    const mouth = clamp(+P.mouth || 0, 0, 1);
    const eyes = ['happy', 'closed', 'blink'].includes(P.eyes) ? P.eyes : 'open';
    const sq = clamp(+P.squash || 0, -0.35, 0.5);
    const root = F(M3.diag(1 + sq * 0.4, 1 - sq, 1 + sq * 0.4), [0, 0, 0]);
    const body = chain(root, T(0, RS, 0), R(rotAxis(TILT, +P.spin || 0)));
    const prims = [];

    // which chunks are gone
    const fallT = (crack - 0.35) / 0.6;
    const gone = ORDER.map((o) => crack >= 1 || o < fallT);
    const anyGone = gone.some(Boolean);
    const shellOn = crack < 1;
    const seamT = crack * 2.7; // seams light up progressively (two thirds of them at crack 0.25, all by ~0.37)
    const chunkOf = (d) => { let b = -1, bi = 0; for (let i = 0; i < NS; i++) { const c = dot(d, SEEDS[i]); if (c > b) { b = c; bi = GROUP[i]; } } return bi; };

    /* --- shell --- */
    if (shellOn) {
      const shellMat = (s) => {
        // jagged Voronoi cells
        const j0 = s[0] + 0.055 * Math.sin(9.1 * s[1] + 5.3 * s[2] + 1.1) + 0.022 * Math.sin(27 * s[2] + 3.1);
        const j1 = s[1] + 0.055 * Math.sin(8.3 * s[2] + 6.1 * s[0] + 2.3) + 0.022 * Math.sin(25 * s[0] + 1.7);
        const j2 = s[2] + 0.055 * Math.sin(7.7 * s[0] + 9.9 * s[1] + 0.7) + 0.022 * Math.sin(29 * s[1] + 0.3);
        let c1 = -9, c2 = -9, i1 = 0, i2 = 0;
        for (let i = 0; i < NS; i++) { const q = SEEDS[i], c = j0 * q[0] + j1 * q[1] + j2 * q[2]; if (c > c1) { c1 = c; i1 = GROUP[i]; } }
        for (let i = 0; i < NS; i++) { if (GROUP[i] === i1) continue; const q = SEEDS[i], c = j0 * q[0] + j1 * q[1] + j2 * q[2]; if (c > c2) { c2 = c; i2 = GROUP[i]; } }
        if (gone[i1]) return 0;
        let dc = c1 - c2;
        // broken edge facing a hole: lit by the core
        if (gone[i2] && dc < Math.max(0.6 * PXA, 0.03 + 0.03 * glow)) return code(GLOW, 1);
        // eyes
        for (const E of EYES) {
          const dd = s[0] * E.e[0] + s[1] * E.e[1] + s[2] * E.e[2];
          if (dd < 0.93) continue;
          const u = s[0] * E.u[0] + s[1] * E.u[1] + s[2] * E.u[2], v = s[0] * E.v[0] + s[1] * E.v[1] + s[2] * E.v[2];
          const r2 = u * u + v * v, R2 = E_HOLE * E_HOLE;
          if (eyes === 'open') { if (r2 < R2) return code(HOLE, v < -0.6 * E_HOLE && u > 0 ? 1 : 0); }
          else if (r2 < R2 * 1.1) {
            const lw = Math.max(0.05, PXA * 0.8);
            if (eyes === 'blink') { if (Math.abs(v + 0.02) < lw * 1.3 && Math.abs(u) < E_HOLE * 0.95) return code(HOLE); }
            else {
              const k = eyes === 'happy' ? -1 : 1; // happy = ◠, closed = ◡
              const vc = -k * 0.1 + k * 1.3 * u * u;
              if (Math.abs(v - vc) < lw && Math.abs(u) < E_HOLE * 0.85) return code(HOLE);
            }
          }
        }
        // mouth (only when open)
        if (mouth > 0.05) {
          const dm = s[0] * SMILE[0] + s[1] * SMILE[1] + s[2] * SMILE[2];
          if (dm > 0.9) {
            const u = s[0] * SM_U[0] + s[1] * SM_U[1] + s[2] * SM_U[2], v = s[0] * SM_V[0] + s[1] * SM_V[1] + s[2] * SM_V[2];
            const h = 0.03 + 0.07 * mouth;
            if (v < 0.02 && v > -h && (u / 0.1) ** 2 + ((v - 0.02) / (h + 0.02)) ** 2 < 1) return code(HOLE);
          }
        }
        // fracture seams: dark hairlines while intact, glowing once cracking
        let seamOn = SEAM_ORD[i1][i2] < (crack > 0 ? seamT : 0.34);
        if (i1 === 0 && !seamOn) {
          // the face chunk carries one crack of its own, running down between the eyes
          const e0 = EYES[0].e, e1 = EYES[1].e;
          const de = Math.abs(j0 * (e0[0] - e1[0]) + j1 * (e0[1] - e1[1]) + j2 * (e0[2] - e1[2]));
          if (de < dc && (crack > 0.08 || crack === 0)) { dc = de; seamOn = true; }
        }
        if (seamOn) {
          if (crack > 0) {
            const w = Math.max(0.6 * PXA, 0.024 + 0.035 * crack + 0.04 * glow);
            if (dc < w) return code(GLOW, dc < w * 0.45 && w > 0.9 * PXA ? 2 : 0);
            if (dc < w * 1.9) return code(SHELL, 1);
          } else if (dc < PXA * 0.5) return code(MARK, -1);
        }
        // spike sockets
        for (const q of SPIKES) if (s[0] * q[0] + s[1] * q[1] + s[2] * q[2] > Math.cos(SOCK)) return code(MARK, -1);
        if (triAt(TRIS, s)) return code(MARK);
        return code(SHELL);
      };
      prims.push(ell(body, [RS, RS, RS], { part: 1, grp: 1, mat: shellMat }));
      // the little round knob beside the far eye
      if (!gone[chunkOf(KNOB)]) {
        const kf = chain(body, T(...V3.scale(KNOB, RS - 0.6)));
        prims.push(ell(kf, [3.3, 3.3, 3.3], { part: 3, grp: 2, mat: (s) => code(MARK, s[1] > 0.35 ? 1 : 0) }));
      }
    }

    /* --- core (only visible once a chunk has fallen) --- */
    if (!shellOn || anyGone) {
      const coreMat = (s) => {
        for (const E of EYES) {
          const dd = s[0] * E.e[0] + s[1] * E.e[1] + s[2] * E.e[2];
          if (dd < 0.9) continue;
          const u = s[0] * E.u[0] + s[1] * E.u[1] + s[2] * E.u[2], v = s[0] * E.v[0] + s[1] * E.v[1] + s[2] * E.v[2];
          const r = Math.sqrt(u * u + v * v);
          // swirl crescent hugging the eye on the outer side (upper-outer on the far eye, lower-outer on the near eye)
          let dph = Math.atan2(v, u) - E.phc;
          dph = Math.atan2(Math.sin(dph), Math.cos(dph));
          if (Math.abs(dph) < SW_SPAN) {
            const f = Math.cos((dph / SW_SPAN) * Math.PI * 0.5);
            const rin = Math.max(SW_IN, E_PALE + 1.25 * PXA) - 0.03 * (dph / SW_SPAN) * E.sd;
            if (r > rin && r < rin + Math.max(PXA * 0.9, SW_T * Math.pow(f, 0.7))) return code(SWIRL, 0);
          }
          if (eyes === 'open') {
            if (r < E_WHITE) return code(EYEW, 2);
            if (r < E_PALE) return code(SWIRL, 1);
          } else if (r < E_PALE) {
            const lw = Math.max(0.045, PXA * 0.75);
            if (eyes === 'blink') { if (Math.abs(v) < lw * 1.2 && Math.abs(u) < E_PALE * 0.95) return code(EYEW, 2); }
            else {
              const k = eyes === 'happy' ? -1 : 1;
              const vc = -k * 0.06 + k * 1.9 * u * u;
              if (Math.abs(v - vc) < lw && Math.abs(u) < E_PALE * 0.9) return code(EYEW, 2);
            }
          }
        }
        // smile / open mouth
        const dm = s[0] * SMILE[0] + s[1] * SMILE[1] + s[2] * SMILE[2];
        if (dm > 0.93) {
          const u = s[0] * SM_U[0] + s[1] * SM_U[1] + s[2] * SM_U[2], v = s[0] * SM_V[0] + s[1] * SM_V[1] + s[2] * SM_V[2];
          if (mouth > 0.05) {
            const h = 0.05 + 0.1 * mouth, e = (u / (0.1 + 0.05 * mouth)) ** 2 + ((v - 0.02) / (h + 0.02)) ** 2;
            if (v < 0.035 && e < 1) return e > 0.5 || v > 0.005 ? code(SWIRL, 0) : code(CORE, -2);
          } else {
            const vc = 0.01 + 2.2 * u * u, lw = Math.max(0.045, PXA * 0.8);
            if (Math.abs(u) < 0.13 && Math.abs(v - vc) < lw * (1 - 0.4 * (u / 0.13) ** 2)) return code(SWIRL, 0);
          }
        }
        if (triAt(CTRIS, s)) return code(CORE, -1);
        return code(CORE);
      };
      prims.push(ell(body, [RC, RC, RC], { part: 2, grp: 1, mat: coreMat }));
    }

    /* --- spikes: core cones; grey meteor tips where the shell still holds them --- */
    SPIKES.forEach((d, k) => {
      const meteor = shellOn && !gone[chunkOf(d)];
      const [b1, b2] = tangents(d);
      const Lf = M3.mul(body.L, M3.cols(b1, b2, d));
      const H = -SPK_C * LS, A = SPK_A * LS;
      const f = { L: Lf, t: V3.add(body.t, M3.v(body.L, V3.scale(d, RC + H))) };
      const mat = meteor
        ? (s) => { if (s[2] < 0.4) return 0; const h = (H + A * s[2]) / LS; return h > 0.8 ? code(SPIKE, 1) : code(SPIKE, h < 0.4 ? -1 : 0); }
        : (s) => { if (s[2] < 0.4) return 0; const h = (H + A * s[2]) / LS; return h > 0.76 ? code(EYEW, 1) : h > 0.58 ? code(SWIRL, 0) : code(CORE); };
      prims.push(ell(f, [SPK_B * LS, SPK_B * LS, A], { part: 4 + k, grp: 3, mat }));
    });

    /* --- anchors --- */
    const at = (d, r) => V3.add(body.t, M3.v(body.L, V3.scale(d, r)));
    const rF = shellOn ? RS : RC;
    const anchors = {
      top: V3.add(body.t, [0, RS + 3, 0]),
      head: body.t, body: body.t, core: body.t,
      mouth: at(SMILE, rF),
      eyeN: at(EYES[0].e, rF), eyeF: at(EYES[1].e, rF),
    };
    return {
      prims, stamps: [], dots: [], anchors, pose: Object.assign(P, { crack, glow }),
      pri: { 1: 0, 2: 1, 3: 1 }, glossy: GLOSSY, baseMat: shellOn ? SHELL : CORE, shadowSteps: 16,
    };
  }

  function render(model, opt) {
    const sc = opt.scale || 1;
    PXA = 1 / (RS * sc);
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0 && pal[CORE] && pal[GLOW]) {
      const c = pal[CORE], w = pal[GLOW];
      // emissive: the shadow tones lift toward the lit ones (no pastel wash), highlights warm toward the glow
      const r = c.r.map((x, i) => (i < 3 ? PX.mix(x, c.r[i + 1], g * 0.75) : i === 3 ? PX.mix(x, w.r[2], g * 0.3) : x));
      pal = Object.assign({}, pal, { [CORE]: { r, od: c.od, ol: PX.mix(c.ol, c.r[2], g * 0.4), ln: PX.mix(c.ln, c.r[1], g * 0.5) } });
    }
    return Creature.render(model, Object.assign({}, opt, { pal }));
  }

  return { build, render, PAL, core, CORES: CORES.length, MAT, DEFAULT, meta: { heightM: 0.3, bw: 80, bh: 92, oy: 0.82 } };
})();
