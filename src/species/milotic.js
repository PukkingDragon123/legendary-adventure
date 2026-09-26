/* ------------------------------------------------------------------
   Milotic — the Tender Pokémon (6.2 m long; ~2 m tall in its classic
   coiled S pose ≈ 350 units at scale 1). A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0
   (the model is centred on its footprint: loop in front, tail fan behind).

   Design (official art / HOME model): a cream serpent whose neck rises in
   an S from a loop of its body; the tail half is covered in blue and pink
   diamond scales outlined in black and ends in a fan of four blue fins
   with pink ovals. Small head with a tall straight spike, red eyes with
   pink markings, two long thin red antennae arching over the head, two
   long pink hair-like fins hanging beside the neck, three black gill dots
   on each side of the neck.

   Built from a spine: control points → Catmull-Rom → ellipsoid "beads"
   along the curve (neck, loop and tail are separate line groups so the
   neck gets a contour where it passes in front of the loop).

   Pose parameters (all optional):
     coil   radians   serpentine wave phase: a lateral wave travels up the
                      neck and down the tail, head and fan sway with it
     rise   0..1      how upright the neck is (1 = tall S, default; 0 = the
                      neck arches forward over the loop, head bowed low)
     hair   −1..1     flow of the hair fins and antennae (+ = streaming back)
     mouth  0..1      mouth open
     eyes   'open' | 'happy' | 'closed' | 'blink'
     side   −1..1     ≈ cos(yaw), passed in by the game (unused)
------------------------------------------------------------------- */
const Milotic = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const CREAM = 1, BLUE = 2, PINK = 3, INK = 4, HAIR = 5, IRIS = 6, PUPIL = 7, SHINE = 8, MOUTH = 9, FIN = 10, FINO = 11;
  const MAT = { CREAM, BLUE, PINK, INK, HAIR, IRIS, PUPIL, SHINE, MOUTH, FIN, FINO };
  const PAL = Creature.palette({
    [CREAM]: { r: ['#c4ad7c', '#e0cd9c', '#f6eabd', '#fdf6da', '#fffef2'], od: '#6a5530', ol: '#a48e5a', ln: '#968052' },
    [BLUE]:  { r: ['#0c5c9e', '#1680c4', '#28a4e6', '#5ec6f6', '#a8e8ff'], od: '#082a54', ol: '#12569a', ln: '#0a3466' },
    [PINK]:  { r: ['#9c2442', '#c23656', '#e2526e', '#f47c92', '#ffb2c0'], od: '#520a20', ol: '#90203c', ln: '#721430' },
    [INK]:   { r: ['#0a0e16', '#0e141e', '#121a26', '#182230', '#202c3c'], od: '#06080e', ol: '#06080e', ln: '#06080e' },
    [HAIR]:  { r: ['#aa2846', '#cc3a5a', '#e85470', '#f67a90', '#ffaabb'], od: '#5a0a1e', ol: '#9a2240', ln: '#841a36' },
    [IRIS]:  { r: ['#7e0a28', '#a41636', '#cc2446', '#e84860', '#ff7c8c'], od: '#3a040e', ol: '#62081c', ln: '#62081c' },
    [PUPIL]: { r: ['#14050a', '#1c080e', '#240c14', '#2e1219', '#3a1820'], od: '#0e0306', ol: '#0e0306', ln: '#0e0306' },
    [SHINE]: { r: ['#f4eef0', '#fcf8fa', '#ffffff', '#ffffff', '#ffffff'], od: '#5a2030', ol: '#8a4050', ln: '#8a4050' },
    [MOUTH]: { r: ['#4a1220', '#64202c', '#80323a', '#9a464a', '#b25a5a'], od: '#300812', ol: '#4a1220', ln: '#4a1220' },
    [FIN]:   { r: ['#10609e', '#1a84c6', '#30a8e8', '#66caf8', '#aeeaff'], od: '#082a54', ol: '#12569a', ln: '#0c3c70' },
    [FINO]:  { r: ['#a02646', '#c6385a', '#e45272', '#f67a94', '#ffb0c0'], od: '#520a20', ol: '#90203c', ln: '#7a1834' },
  });
  const GLOSSY = {}; // the body's highlight comes from tube(), per the ideal normal
  const C_CREAM = code(CREAM), C_BLUE = code(BLUE), C_PINK = code(PINK), C_INK = code(INK), C_HAIR = code(HAIR);
  const C_IRIS = code(IRIS), C_PUPIL = code(PUPIL), C_SHINE = code(SHINE), C_MOUTH = code(MOUTH), C_FIN = code(FIN), C_FINO = code(FINO);
  const M_HAIR = () => C_HAIR, M_CREAM = () => C_CREAM;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth = (t) => t * t * (3 - 2 * t);
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid from p0 to p1 (local x along the segment), cross radius r
  function seg(p0, p1, r, part, grp, mat, up = [0, 1, 0]) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const X = sc(d, 1 / l);
    let Y = sub(up, sc(X, dot(up, X)));
    if (len3(Y) < 1e-3) Y = cross([0, 0, 1], X);
    Y = nrm(Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(l / 2 + r * 0.6, r, r)), part, grp, mat);
  }
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
  };
  const rotAxis = (a, t) => {
    const c = Math.cos(t), s = Math.sin(t), C1 = 1 - c, [x, y, z] = a;
    return [c + x * x * C1, x * y * C1 - z * s, x * z * C1 + y * s, y * x * C1 + z * s, c + y * y * C1, y * z * C1 - x * s, z * x * C1 - y * s, z * y * C1 + x * s, c + z * z * C1];
  };

  /* ---------- spine: control points (head end first) ---------- */
  // neck, upright (rise = 1) and bowed (rise = 0); last point = loop entry
  const LOOP_C = [34, 83, 0], LOOP_R = 55, LOOP_A0 = -Math.PI / 2 - 0.55, LOOP_SPAN = 2 * Math.PI - 1.08, LOOP_Z = 30;
  const loopPt = (t) => {
    const a = LOOP_A0 + LOOP_SPAN * t;
    return [LOOP_C[0] + LOOP_R * Math.cos(a), LOOP_C[1] + LOOP_R * Math.sin(a), LOOP_Z - 2 * LOOP_Z * t];
  };
  const ENTRY = loopPt(0);
  const NECK_UP = [[40, 254, 0], [21, 232, 2], [8, 202, 4], [0, 168, 8], [-7, 134, 14], [-13, 100, 20], [-16, 70, 26], [-9, 48, 29]];
  const NECK_BOW = [[108, 146, 0], [94, 180, 2], [70, 205, 5], [38, 212, 9], [8, 196, 14], [-11, 160, 20], [-18, 112, 26], [-12, 62, 29]];
  const NECK_R = [15, 16, 17.5, 19.5, 21.5, 23.5, 25, 26];
  const LOOP_N = 9;
  const TAIL = [[-26, 58, -32], [-40, 32, -30], [-74, 23, -26], [-124, 23, -20], [-176, 28, -12], [-220, 44, -4], [-248, 74, 2], [-261, 110, 4], [-259, 146, 4]];
  const TAIL_R = [26, 25, 23.5, 21.5, 19.5, 17.5, 15.5, 13.5, 11.5];
  const SEC_NECK = 0, SEC_LOOP = 1, SEC_TAIL = 2;
  const XC = 105; // shift so the footprint is centred on the origin

  function controlPoints(P) {
    const rise = smooth(clamp(P.rise, 0, 1));
    const ph = P.coil || 0;
    const pts = [];
    const nN = NECK_UP.length;
    for (let i = 0; i < nN; i++) {
      const p = lerp3(NECK_BOW[i], NECK_UP[i], rise);
      const w = 1 - i / (nN - 1); // wave weight: 1 at the head, 0 at the loop
      p[2] += 11 * w * Math.sin(ph + i * 0.85);
      p[0] += 4 * w * Math.sin(ph * 0.5 + 1 + i * 0.4);
      pts.push({ p, r: NECK_R[i], sec: SEC_NECK });
    }
    for (let k = 0; k <= LOOP_N; k++) {
      const t = k / LOOP_N;
      const p = loopPt(t);
      p[2] += 2 * Math.sin(ph - k * 0.7);
      pts.push({ p, r: lerp(26.5, 26, t), sec: SEC_LOOP });
    }
    TAIL.forEach((q, i) => {
      const w = smooth(i / (TAIL.length - 1));
      const p = q.slice();
      p[2] += 16 * w * Math.sin(ph - 1.2 - i * 0.75);
      p[1] += 4 * w * Math.sin(ph - 0.3 - i * 0.75);
      pts.push({ p, r: TAIL_R[i], sec: SEC_TAIL });
    });
    return pts;
  }

  // dense Catmull-Rom samples with cumulative arc length
  function densify(ctrl, seg = 8) {
    const out = [], n = ctrl.length;
    const get = (i) => ctrl[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
      for (let k = 0; k < seg; k++) {
        const t = k / seg;
        out.push({ p: cr(a.p, b.p, c.p, d.p, t), r: lerp(b.r, c.r, t), sec: t < 0.5 ? b.sec : c.sec });
      }
    }
    out.push({ p: ctrl[n - 1].p.slice(), r: ctrl[n - 1].r, sec: ctrl[n - 1].sec });
    out[0].s = 0;
    for (let i = 1; i < out.length; i++) out[i].s = out[i - 1].s + len3(sub(out[i].p, out[i - 1].p));
    return out;
  }
  function sampleAt(D, s) {
    let lo = 0, hi = D.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m].s <= s) lo = m; else hi = m; }
    const a = D[lo], b = D[hi], t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
    return { p: lerp3(a.p, b.p, t), r: lerp(a.r, b.r, t), sec: t < 0.5 ? a.sec : b.sec };
  }

  /* ---------- smooth tube shading ----------
     Each bead is an ellipsoid, so its own normals would shade the body as a row of rings. Beads are
     shaded with the ideal tube normal instead (the radial direction around the spine): tube() turns
     a material into the code whose tone bias lands on the tone that normal would get. */
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74], HH = V3.norm(V3.add(LD, [0, 0, 1])), SPEC = 0.975;
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  function tube(prim, s, m, gloss) {
    const Lv = prim.Lv, Li = prim.Li;
    // ideal normal: Lv · (0, s1, s2), normalised (view space)
    let ix = Lv[1] * s[1] + Lv[2] * s[2], iy = Lv[4] * s[1] + Lv[5] * s[2], iz = Lv[7] * s[1] + Lv[8] * s[2];
    let l = Math.hypot(ix, iy, iz) || 1;
    ix /= l; iy /= l; iz /= l;
    // actual ellipsoid normal (as the renderer computes it)
    let ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
    l = Math.hypot(ax, ay, az) || 1;
    const dA = (ax * LD[0] + ay * LD[1] + az * LD[2]) / l;
    const dI = ix * LD[0] + iy * LD[1] + iz * LD[2];
    let tI = tone(dI);
    if (gloss && tI >= 2 && ix * HH[0] + iy * HH[1] + iz * HH[2] > SPEC) tI = 4;
    return code(m, clamp(tI - tone(dA), -2, 4));
  }

  /* ---------- tail scales: diamond grid in (along, around) scale units ---------- */
  const NA = 8; // scales around the body
  const U_START = 1.2; // scales begin this many scale-lengths after the loop
  let curScale = 1;
  function scaleMat(b) {
    // b: bead info (u0 = scale-units at centre, du = scale-units per local x, sl = scale size in units)
    return (s) => tube(b.prim, s, scaleM(b, s), false);
  }
  function scaleM(b, s) {
    // along-coordinate, corrected for the spine's curvature (the outer side of a bend is stretched)
    const kn = clamp(b.kd * s[1] + b.kb * s[2], -0.6, 0.6);
    const u = b.u0 + (s[0] * b.du) / (1 - kn);
    const th = Math.atan2(s[2], s[1]);
    const v = (th * NA) / (2 * Math.PI);
    const a = u + v, c = u - v;
    const fa = Math.floor(a), fc = Math.floor(c);
    const uc = (fa + fc + 1) / 2;
    if (uc < U_START) return CREAM;
    const w = clamp(0.48 / (curScale * b.sl), 0.035, 0.16);
    const ra = a - fa, rc = c - fc;
    if (ra < w || rc < w || ra > 1 - w || rc > 1 - w) return INK;
    const vc = (fa - fc) / 2; // angular index of the cell centre
    return Math.abs(vc) > NA * 0.38 ? PINK : BLUE;
  }
  // neck: cream with three black gill dots on each side
  const GILLS = [44, 58, 72]; // arc length from the neck top
  function neckMat(b) {
    return (s) => tube(b.prim, s, neckM(b, s), false);
  }
  function neckM(b, s) {
    if (b.gill) {
      const al = b.s0 + s[0] * b.hl;
      const rr = Math.max(2.4, 1.1 / curScale);
      for (let i = 0; i < GILLS.length; i++) {
        const da = al - GILLS[i];
        if (da > -rr && da < rr) {
          // lateral patch: local ±z is the side of the neck, dots slightly toward the front
          const dl = (Math.atan2(s[1], Math.abs(s[2])) + 0.6) * b.r;
          if (da * da + dl * dl < rr * rr) return INK;
        }
      }
    }
    return CREAM;
  }

  /* ---------- head decals ---------- */
  const HEAD_R = [28, 22.5, 20];
  const EC = Creature.sph(1.02, 0.08);
  const ETY = nrm(sub([0, 1, 0], sc(EC, EC[1])));
  const ETX = cross(ETY, EC); // toward the snout on the near side
  function headMat(kind, mo) {
    return (s) => {
      const m = s[2] < 0 ? [s[0], s[1], -s[2]] : s;
      if (m[0] * EC[0] + m[1] * EC[1] + m[2] * EC[2] > 0.3) {
        const dx = m[0] - EC[0], dy = m[1] - EC[1], dz = m[2] - EC[2];
        const ex = dx * ETX[0] + dy * ETX[1] + dz * ETX[2], ey = dx * ETY[0] + dy * ETY[1] + dz * ETY[2];
        const px = 1 / (curScale * HEAD_R[1]);
        const ir = ((ex - 0.02) / 0.23) ** 2 + ((ey + 0.01) / 0.3) ** 2;
        if (kind === 'closed' || kind === 'happy') {
          const yc = kind === 'happy' ? -0.12 + 0.3 * (1 - (ex / 0.26) ** 2) : 0.06 - 0.24 * (1 - (ex / 0.26) ** 2);
          if (Math.abs(ex) < 0.25 && Math.abs(ey - yc) < Math.max(0.05, 0.7 * px)) return C_PUPIL;
        } else if (ir < 1) {
          if (kind === 'blink' && ey > -0.06) return ey < -0.06 + Math.max(0.06, 0.9 * px) ? C_PUPIL : C_HAIR;
          const pr = ((ex - 0.05) / Math.max(0.11, 1.2 * px)) ** 2 + ((ey + 0.03) / 0.19) ** 2;
          if (curScale >= 0.6 && ((ex + 0.06) / 0.08) ** 2 + ((ey - 0.12) / 0.08) ** 2 < 1) return C_SHINE;
          return pr < 1 ? C_PUPIL : C_IRIS;
        }
        // pink marking: a rim around the eye that streams back (and a little down) to the hair root
        if (ir < 1.7) return C_HAIR;
        if (ex < -0.05 && ex > -0.75) {
          const t = (-ex - 0.05) / 0.7;
          const yc = -0.03 - 0.12 * t, hw = 0.16 + 0.1 * t;
          if (Math.abs(ey - yc) < hw) return C_HAIR;
        }
      }
      return C_CREAM;
    };
  }
  const SNOUT_R = [18, 13, 14];
  function snoutMat(mo) {
    return (s) => {
      if (s[0] > 0.3) {
        const k = Math.abs(s[2]) / 0.8;
        const ym = -0.38 + 0.12 * k * k;
        const h = 0.05 + 0.34 * mo;
        if (Math.abs(s[2]) < 0.8 && s[1] < ym + 0.02 && s[1] > ym - h) return C_MOUTH;
      }
      return C_CREAM;
    };
  }

  /* ---------- plates: hair fins (4 segments, widening, forked tip) and tail fins ---------- */
  const HSEG = [{ l: 44, w0: 7, w1: 13 }, { l: 50, w0: 13, w1: 19 }, { l: 50, w0: 19, w1: 25 }, { l: 44, w0: 25, w1: 30, fork: true }];
  const HAIR_G = HSEG.map((g) => {
    const pts = [[-2, -g.w0 / 2], [g.l + 2, -g.w1 / 2]];
    if (g.fork) pts.push([g.l + 14, -g.w1 * 0.55], [g.l + 3, -g.w1 * 0.18], [g.l + 16, 0.02 * g.w1], [g.l + 3, g.w1 * 0.22], [g.l + 12, g.w1 * 0.58]);
    pts.push([g.l + 2, g.w1 / 2], [-2, g.w0 / 2]);
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({ bb, test: (u, v) => (Shape2D.inPoly(u, v, pts) ? C_HAIR : 0) });
  });
  const HAIR_A = [0.26, 0.12, -0.02, -0.12]; // hang angles from vertical (+ = backward)
  const HAIR_F = [0.3, 0.42, 0.5, 0.56]; // flow response per segment
  const TFIN_G = bakeShape(Shape2D.poly([[0, -5], [14, -15], [40, -20.5], [68, -17], [90, -8], [100, 0], [90, 8], [68, 17], [40, 20.5], [14, 15], [0, 5]], C_FIN, 8, (u, v) => (((u - 50) / 29) ** 2 + (v / 8.5) ** 2 < 1 ? C_FINO : C_FIN)));
  const TFINS = [
    { a: -0.95, yaw: -0.5, tw: 0.35, s: 0.9 },
    { a: -0.42, yaw: -0.18, tw: 0.12, s: 1 },
    { a: 0.08, yaw: 0.16, tw: -0.12, s: 1 },
    { a: 0.56, yaw: 0.46, tw: -0.35, s: 0.88 },
  ];
  const FAN_YAW = 0.5; // the fan turns toward the camera side (pose.side) so it reads in both 3/4 views
  // antenna path in its own plane (x = outward, y = up), from the forehead
  const ANT = [[0, 0], [5, 18], [14, 36], [28, 52], [46, 61], [64, 60], [78, 50], [86, 34], [87, 16], [83, 0], [76, -14]];

  const DEFAULT = { coil: 0, rise: 1, hair: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  Object.assign(PRI, { 4: 1, 5: 1, 6: 2, 7: 3, 8: 3, 10: 2, 11: 2, 12: 3, 13: 3, 14: 3, 15: 3 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const hair = clamp(P.hair, -1, 1);

    // --- spine → beads
    const ctrl = controlPoints(P);
    const D = densify(ctrl);
    const Ltot = D[D.length - 1].s;
    const beads = [];
    let s = 0;
    while (s < Ltot) {
      const q = sampleAt(D, s);
      const step = Math.max(4, q.r * 0.45);
      beads.push({ s, p: q.p, r: q.r, sec: q.sec, step });
      s += step;
    }
    // tangents
    for (let i = 0; i < beads.length; i++) {
      const a = sampleAt(D, Math.max(0, beads[i].s - 3)).p, b = sampleAt(D, Math.min(Ltot, beads[i].s + 3)).p;
      beads[i].t = nrm(sub(b, a));
    }
    // dorsal frame for the tail: parallel transport from the ground part (dorsal = up)
    const iRef = beads.findIndex((b) => b.sec === SEC_TAIL && b.p[1] < 30);
    const i0 = iRef < 0 ? beads.length - 1 : iRef;
    const proj = (d, t) => nrm(sub(d, sc(t, dot(d, t))));
    beads[i0].d = proj([0, 1, 0], beads[i0].t);
    for (let i = i0 + 1; i < beads.length; i++) beads[i].d = proj(beads[i - 1].d, beads[i].t);
    for (let i = i0 - 1; i >= 0; i--) beads[i].d = proj(beads[i + 1].d, beads[i].t);
    // scale coordinate along the body (scale units), integrated from the loop exit
    const iExit = beads.findIndex((b) => b.sec === SEC_TAIL);
    let u = 0;
    for (let i = iExit; i < beads.length; i++) {
      if (i > iExit) u += (beads[i].s - beads[i - 1].s) / ((2 * Math.PI * (beads[i].r + beads[i - 1].r) * 0.5) / NA);
      beads[i].u = u;
    }
    const neckTopS = beads[0].s;
    beads.forEach((b, i) => {
      const hl = b.r * 1.1;
      let d = b.d, info, mat;
      if (b.sec === SEC_NECK) {
        d = proj([-1, 0.25, 0], b.t); // back of the neck, so ±local z = the neck's sides
        info = { s0: b.s - neckTopS, hl, r: b.r, gill: b.s - neckTopS < GILLS[2] + 12 };
        mat = neckMat(info);
      } else if (b.sec === SEC_TAIL) {
        const sl = (2 * Math.PI * b.r) / NA;
        // curvature of the spine at this bead, in the bead's (d, bz) axes, times the radius
        const ia = Math.max(0, i - 1), ib = Math.min(beads.length - 1, i + 1);
        const kv = ib > ia ? sc(sub(beads[ib].t, beads[ia].t), 1 / (beads[ib].s - beads[ia].s)) : [0, 0, 0];
        const bzv = cross(b.t, d);
        info = { u0: b.u, du: hl / sl, sl, kd: b.r * dot(kv, d), kb: b.r * dot(kv, bzv) };
        mat = scaleMat(info);
      } else {
        info = {};
        mat = (s) => tube(info.prim, s, CREAM, false);
      }
      const bz = cross(b.t, d);
      const grp = b.sec === SEC_NECK ? 1 : b.sec === SEC_LOOP ? 2 : 3;
      const prim = E(b.p, M3.mul(M3.cols(b.t, d, bz), M3.diag(hl, b.r, b.r)), grp, grp, mat);
      info.prim = prim;
      prims.push(prim);
    });

    // --- head: frame from the neck top (bows with rise)
    const rise = smooth(clamp(P.rise, 0, 1));
    const top = beads[0];
    const pitch = lerp(-0.95, 0.02, rise) + 0.06 * Math.sin((P.coil || 0) + 0.5);
    const yawH = 0.1 * Math.sin(P.coil || 0);
    const head = chain(T(...top.p), R(M3.ry(yawH)), R(M3.rz(pitch)), T(7, 19, 0));
    const kind = P.eyes, mo = clamp(P.mouth, 0, 1);
    const headPrim = ellF(head, HEAD_R, 4, 4, headMat(kind, mo));
    prims.push(headPrim);
    prims.push(ellF(chain(head, T(17, -8, 0), R(M3.rz(-0.12))), SNOUT_R, 5, 4, snoutMat(mo)));
    // spike
    prims.push(ellF(chain(head, T(-3, 26, 0), R(M3.rz(0.1))), [8.4, 46, 7.8], 6, 4, M_CREAM));
    anchors.top = inF(head, [-3 - 46 * Math.sin(0.1), 26 + 46 * Math.cos(0.1), 0]);
    anchors.head = head.t;
    anchors.mouth = inF(head, [30, -10, 0]);
    anchors.eyeN = inF(head, [HEAD_R[0] * EC[0], HEAD_R[1] * EC[1], HEAD_R[2] * EC[2]]);
    anchors.eyeF = inF(head, [HEAD_R[0] * EC[0], HEAD_R[1] * EC[1], -HEAD_R[2] * EC[2]]);

    // --- antennae (thin red whips arching over the head like a heart)
    for (const side of [1, -1]) {
      const root = inF(head, [9, 19, side * 8]);
      const out = nrm(M3.v(head.L, [-0.15 - 0.25 * hair, 0, side]));
      const up = [0, 1, 0];
      let prev = root;
      ANT.forEach(([ox, oy], k) => {
        if (k === 0) return;
        const bend = hair * 0.25 * (k / ANT.length);
        const p = add(root, add(sc(nrm(add(out, [-bend, 0, 0])), ox), sc(up, oy)));
        const r = k < 3 ? 2.6 : 2.2;
        prims.push(seg(prev, p, r, side > 0 ? 7 : 8, 5, M_HAIR));
        prev = p;
      });
      anchors[side > 0 ? 'antN' : 'antF'] = prev;
    }

    // --- hair fins: ribbons of four plates hanging beside the neck
    // neck lateral position/radius at a given height (the upper neck is roughly vertical)
    const nb = beads.filter((b) => b.sec === SEC_NECK);
    const neckAt = (q) => {
      let best = nb[0], bd = Infinity;
      for (const b of nb) { const d2 = (b.p[0] - q[0]) ** 2 + (b.p[1] - q[1]) ** 2; if (d2 < bd) { bd = d2; best = b; } }
      return best;
    };
    const bow = 1 - rise; // bowed: the hair streams back along the neck
    for (const side of [1, -1]) {
      const root = inF(head, [-11, 1, side * 17]);
      const J = [root];
      let q = root;
      HSEG.forEach((g, k) => {
        const a = HAIR_A[k] + hair * HAIR_F[k] + 0.04 * Math.sin((P.coil || 0) - k * 0.8) + bow * [1.0, 0.62, 0.3, 0.1][k];
        q = add(q, [-Math.sin(a) * g.l, -Math.cos(a) * g.l, 0]);
        q[1] = Math.max(q[1], 4 + 3 * k);
        const nk = neckAt(q);
        q[2] = nk.p[2] + side * (nk.r + 5 + 2 * k);
        J.push(q.slice());
      });
      HSEG.forEach((g, k) => {
        const du = nrm(sub(J[k + 1], J[k]));
        const v = nrm(cross([0, 0, side], du));
        const Lk = len3(sub(J[k + 1], J[k])) / g.l;
        const id = (side > 0 ? 10 : 12) + (k >> 1);
        prims.push(PL(J[k], M3.cols(sc(du, Lk), v, cross(du, v)), id, side > 0 ? 10 : 11, HAIR_G[k], 1.6));
      });
      anchors[side > 0 ? 'hairN' : 'hairF'] = J[J.length - 1];
    }

    // --- tail fan: four blue fins with pink ovals, spread like a lotus
    const last = beads[beads.length - 1];
    const tipT = last.t;
    // tip frame: x = back, y = along the tail, z = side; the fan spreads in its x-y plane, turned toward the 3/4 view
    const tbx = proj([-1, 0, 0], tipT);
    const tipF = F(M3.cols(tbx, tipT, cross(tbx, tipT)), add(last.p, sc(tipT, last.r * 0.4)));
    TFINS.forEach((f, k) => {
      const sway = 0.12 * Math.sin((P.coil || 0) - 2.2 - k * 0.3);
      const Rf = M3.mul(M3.ry(FAN_YAW * clamp(P.side ?? 1, -1, 1) + f.yaw * 0.5 + sway), M3.mul(M3.rz(Math.PI / 2 + f.a), M3.rx(f.tw)));
      const L = M3.mul(tipF.L, M3.mul(Rf, M3.diag(f.s, f.s, 1)));
      prims.push(PL(tipF.t, L, 20 + k, 14 + (k & 1), TFIN_G, 1.6));
    });
    anchors.tail = inF(tipF, [0, 90, 0]);
    anchors.body = beads[Math.floor(beads.length * 0.45)].p;
    anchors.loop = LOOP_C.slice();

    // centre the footprint on the origin
    for (const q of prims) q.c = [q.c[0] + XC, q.c[1], q.c[2]];
    for (const k in anchors) anchors[k] = [anchors[k][0] + XC, anchors[k][1], anchors[k][2]];
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: CREAM, shadowSteps: 14, shadowDepth: 30 };
  }

  /* ---------- render: ray-cast only the silhouette box (nearest prims first), paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74]; SPEC = lg.spec ?? 0.975; HH = V3.norm(V3.add(LD, [0, 0, 1]));
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const zs = new Map();
    for (const p of model.prims) zs.set(p, V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2]);
    model.prims.sort((a, b) => zs.get(b) - zs.get(a));
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
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return Creature.render(model, opt);
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 6.2, lengthM: 6.2, bw: 620, bh: 480, oy: 0.86 } };
})();
