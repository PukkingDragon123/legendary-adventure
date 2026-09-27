/* ------------------------------------------------------------------
   Tentacool — the Jellyfish Pokémon (0.9 m ≈ 157 units tall at scale 1,
   tentacles included). A posable 3D model rendered straight to pixel
   art by the shared Creature pipeline (src/creature.js,
   dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is
   the rim of the bell (the tentacles hang below it).

   Design (official art / HOME model): a tall, glossy, translucent-blue
   egg-shaped dome leaning back a little, with two big red crystal orbs
   set in the upper sides and a small red orb on the front; below them a
   narrow keel runs down the face between two half-lidded white eyes
   (flat, sleepy upper lids, black pupils toward the keel) into a small
   beak. Below the eyes the jelly flares out into a skirt-like mantle
   whose dark underside shows under the rim; two long grey tentacles
   with flat spoon tips come out from under the face, plus two short
   stubby ones beside them.
   Build: the dome and the mantle are two ellipsoids shaded as one smooth
   jelly (a blended normal near their junction), with a crease drawn only
   across the front, under the eyes.

   Pose parameters (all optional):
     pulse  radians   swimming pulse (period 2π): the bell contracts and
                      expands, the dome stretches, the tentacles trail
                      in a wave
     gem    0..1      glint on the red orbs (brighter crystals and a sparkle)
     drift  −1..1     tentacle sway toward the far (−) / near (+) side
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'sleep'
     side   −1..1     ≈ cos(yaw), passed in by the game (unused, accepted)
   Anchors: top (top of the dome), head (dome centre), mouth (the beak),
   eyeN, eyeF, body (bell centre), gem (small front orb), gemN, gemF
   (big orbs), tipN, tipF (long tentacle tips), base (centre of the rim).
------------------------------------------------------------------- */
const Tentacool = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, ORB = 2, UNDER = 3, TENT = 4, EYE = 5, PUPIL = 6, GLINT = 7, KEEL = 8;
  const MAT = { BODY, ORB, UNDER, TENT, EYE, PUPIL, GLINT, KEEL };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#2a7fb8', '#3ba4d8', '#5cc6ee', '#90def8', '#d2f6ff'], od: '#15496e', ol: '#2c82b8', ln: '#2878ae' },
    [KEEL]:  { r: ['#2a7fb8', '#3ba4d8', '#5cc6ee', '#90def8', '#d2f6ff'], od: '#15496e', ol: '#2c82b8', ln: '#236d9e' },
    [ORB]:   { r: ['#840e26', '#b41c36', '#dc3448', '#f2707c', '#ffc6cc'], od: '#520614', ol: '#86122a', ln: '#7c1026' },
    [GLINT]: { r: ['#d8404e', '#f06270', '#ff8c96', '#ffc0c6', '#ffffff'], od: '#8a1428', ol: '#b82a3c', ln: '#b82a3c' },
    [UNDER]: { r: ['#0c1a2e', '#12243c', '#1a3050', '#223e66', '#2e4f80'], od: '#060e1a', ol: '#0e1c32', ln: '#0e1c32' },
    [TENT]:  { r: ['#72685f', '#8e8378', '#aca196', '#c8bfb4', '#e6dfd6'], od: '#3c342e', ol: '#62584f', ln: '#62584f' },
    [EYE]:   { r: ['#b4c2d2', '#d6e0ea', '#f2f7fb', '#ffffff', '#ffffff'], od: '#15496e', ol: '#2c82b8', ln: '#1a3a56' },
    [PUPIL]: { r: ['#0c1018', '#10141e', '#141a26', '#1a222e', '#222c3a'], od: '#080a10', ol: '#080a10', ln: '#080a10' },
  });
  const GLOSSY = { [BODY]: 1, [ORB]: 1, [GLINT]: 1, [KEEL]: 1 };
  const C_KEEL = code(KEEL), C_ORB = code(ORB), C_ORB_L = code(ORB, 1), C_ORB_D = code(ORB, -1);
  const C_UNDER = code(UNDER), C_TENT = code(TENT), C_EYE = code(EYE, 1), C_PUPIL = code(PUPIL), C_LINE = code(PUPIL), C_CREASE = code(KEEL, -1);
  const M_UNDER = () => C_UNDER, M_TENT = () => C_TENT, M_KEEL = () => C_KEEL;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function segAxes(p0, p1) {
    const d = sub(p1, p0), l = len3(d) || 1e-3, Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return { X, Y, Z: cross(X, Y), l };
  }
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
  };

  /* ---------- dome, face ---------- */
  const DOME_C = [0, 66, 0], DOME_R = [44, 51, 48], DOME_TILT = 0.12;
  const EYE_AZ = 0.5, EYE_V = -0.45, EYE_W = 11, EYE_H = 4.8;       // eye half-width / half-height (units)
  let curScale = 1;

  /* smooth-union shading of the dome + mantle jelly: near their junction a hit is shaded with a
     normal blended from both surfaces (returned as a tone bias against the prim's own normal), so the
     two ellipsoids read as one soft body with no ledge at the waist. Light captured per render. */
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74], VR = M3.I();
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  const BK = 0.55;
  function blendBias(A, s, B) {
    const L = A.L, QA = A.Q, QB = B.Q;
    const px = A.c[0] + L[0] * s[0] + L[1] * s[1] + L[2] * s[2] - B.c[0];
    const py = A.c[1] + L[3] * s[0] + L[4] * s[1] + L[5] * s[2] - B.c[1];
    const pz = A.c[2] + L[6] * s[0] + L[7] * s[1] + L[8] * s[2] - B.c[2];
    const qx = QB[0] * px + QB[1] * py + QB[2] * pz, qy = QB[3] * px + QB[4] * py + QB[5] * pz, qz = QB[6] * px + QB[7] * py + QB[8] * pz;
    const f = qx * qx + qy * qy + qz * qz - 1;
    if (f > BK) return 0;
    // surface gradients (model space): inv(L)ᵀ·q
    let ax = QA[0] * s[0] + QA[3] * s[1] + QA[6] * s[2], ay = QA[1] * s[0] + QA[4] * s[1] + QA[7] * s[2], az = QA[2] * s[0] + QA[5] * s[1] + QA[8] * s[2];
    let bx = QB[0] * qx + QB[3] * qy + QB[6] * qz, by = QB[1] * qx + QB[4] * qy + QB[7] * qz, bz = QB[2] * qx + QB[5] * qy + QB[8] * qz;
    const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
    ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
    const t = clamp(f / BK, 0, 1), w = 0.5 * (1 - t * t * (3 - 2 * t));
    const nx = ax + (bx - ax) * w, ny = ay + (by - ay) * w, nz = az + (bz - az) * w;
    const V = VR;
    const dn = (V[0] * nx + V[1] * ny + V[2] * nz) * LD[0] + (V[3] * nx + V[4] * ny + V[5] * nz) * LD[1] + (V[6] * nx + V[7] * ny + V[8] * nz) * LD[2];
    const da = (V[0] * ax + V[1] * ay + V[2] * az) * LD[0] + (V[3] * ax + V[4] * ay + V[5] * az) * LD[1] + (V[6] * ax + V[7] * ay + V[8] * az) * LD[2];
    return tone(dn / (Math.hypot(nx, ny, nz) || 1)) - tone(da);
  }
  // smooth tube shading for tentacle segments (local y = axis): shade with the radial normal so the
  // beads of a tube don't read as rings
  function tubeSeg(p0, p1, r, part, grp, m, ext) {
    const a = segAxes(p0, p1);
    const q = E(sc(add(p0, p1), 0.5), M3.cols(sc(a.X, r), sc(a.Y, a.l / 2 + ext), sc(a.Z, r)), part, grp, null);
    q.mat = (s) => {
      const Lv = q.Lv, Li = q.Li;
      const ix = Lv[0] * s[0] + Lv[2] * s[2], iy = Lv[3] * s[0] + Lv[5] * s[2], iz = Lv[6] * s[0] + Lv[8] * s[2];
      const li = Math.hypot(ix, iy, iz) || 1;
      const ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
      const la = Math.hypot(ax, ay, az) || 1;
      return code(m, clamp(tone((ix * LD[0] + iy * LD[1] + iz * LD[2]) / li) - tone((ax * LD[0] + ay * LD[1] + az * LD[2]) / la), -2, 4));
    };
    return q;
  }
  // tangent frames of the two eye centres on the dome's unit sphere
  const EYES = [1, -1].map((sd) => {
    const e = Creature.sph(sd * EYE_AZ, EYE_V);
    const h = nrm([e[2], 0, -e[0]]);                                  // horizontal tangent
    const u = sd > 0 ? h : sc(h, -1);                                 // across the eye, + toward the keel
    const v = nrm([-e[1] * e[0], 1 - e[1] * e[1], -e[1] * e[2]]);     // up the surface
    return { e, u, v, sd };
  });
  function domeMat(kind, J) {
    return (s) => {
      if (s[0] > 0.3 && s[1] < -0.2) {
        const px = 1 / curScale;
        for (const q of EYES) {
          const d0 = s[0] - q.e[0], d1 = s[1] - q.e[1], d2 = s[2] - q.e[2];
          // a: across (+ = toward the keel), b: up; in model units on the dome
          const a = (d0 * q.u[0] + d1 * q.u[1] + d2 * q.u[2]) * DOME_R[2], b = (d0 * q.v[0] + d1 * q.v[1] + d2 * q.v[2]) * DOME_R[1];
          const hw = Math.max(EYE_W, 2.4 * px), hh = Math.max(EYE_H, 1.7 * px);
          if (Math.abs(a) > hw * 1.3 + px || Math.abs(b) > hh * 2.4) continue;
          const lw = Math.max(0.6, 0.62 * px);                       // lid / crease line width
          const top = hh * 0.45 - 0.12 * a;                          // flat, sleepy upper lid (a touch lower toward the keel)
          if (kind === 'open' || kind === 'blink') {
            const tp = kind === 'blink' ? -hh * 0.6 : top;
            if ((a / hw) ** 2 + (b / (hh * 1.3)) ** 2 < 1 && b < tp) {
              if (b > tp - lw) return C_LINE;
              if (kind === 'open') {
                const pa = (a - hw * 0.4) / Math.max(hw * 0.22, 0.55 * px), pb = (b - (tp - hh * 0.5)) / Math.max(hh * 0.6, 0.75 * px);
                if (pa * pa + pb * pb < 1) return C_PUPIL;
              }
              return C_EYE;
            }
            // lid crease runs on a little past the back corner
            if (Math.abs(b - tp) < lw && a < -hw * 0.7 && a > -hw * 1.3) return C_LINE;
          } else {
            // happy ^ / closed ‿ / sleep: a single dark arc
            if (Math.abs(a) < hw) {
              const k = 1 - (a / hw) ** 2;
              const yc = kind === 'happy' ? -hh * 0.6 + hh * 1.1 * k : kind === 'sleep' ? hh * 0.1 - hh * 0.7 * k : hh * 0.2 - hh * 0.9 * k;
              if (Math.abs(b - yc) < lw) return C_LINE;
            }
          }
        }
      }
      return code(BODY, blendBias(J.dome, s, J.mantle));
    };
  }

  /* ---------- tentacles ---------- */
  const NL = 13, TL_R0 = 5, TL_R1 = 3.6;

  // gem glint: a white four-point sparkle stamped on the crystals' highlight (it may overflow the silhouette)
  const SPARK = {
    s: { open: ['.w.', 'wWw', '.w.'] },
    m: { open: ['...w...', '...w...', '..wWw..', 'wwWWWww', '..wWw..', '...w...', '...w...'] },
    l: { open: ['....w....', '....w....', '....w....', '...wWw...', 'wwwWWWwww', '...wWw...', '....w....', '....w....', '....w....'] },
  };
  const SPARKC = { w: '#fff6f0', W: '#ffffff' };
  const SPARK_S = nrm([0.12, 0.26, 0.96]);

  const DEFAULT = { pulse: 0, gem: 0, drift: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // dome + mantle 1, under 3, keel 4, orbs 5..7, long tentacles 8/9, small 10/11
  Object.assign(PRI, { 1: 1, 3: 0, 4: 3, 5: 3, 6: 3, 7: 4, 8: 1, 9: 1, 10: 1, 11: 1 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const gem = clamp(+P.gem || 0, 0, 1);
    const ph = +P.pulse || 0, k = Math.sin(ph);
    const dr = clamp(+P.drift || 0, -1, 1);
    const kind = ['happy', 'closed', 'blink', 'sleep'].includes(P.eyes) ? P.eyes : 'open';

    // --- dome: stretches as the bell contracts
    const domeF = chain(T(DOME_C[0], DOME_C[1] + 2 * k, 0), R(M3.rz(DOME_TILT)), R(M3.diag(1 - 0.03 * k, 1 + 0.04 * k, 1 - 0.03 * k)));
    const J = {};
    J.dome = ellF(domeF, DOME_R, 1, 1, domeMat(kind, J));
    J.dome.Q = M3.inv(J.dome.L);
    prims.push(J.dome);
    const onDome = (az, v, off = 0) => {
      const s = Creature.sph(az, v);
      const n = nrm([s[0] / DOME_R[0], s[1] / DOME_R[1], s[2] / DOME_R[2]]);
      return { p: add([DOME_R[0] * s[0], DOME_R[1] * s[1], DOME_R[2] * s[2]], sc(n, off)), n };
    };
    anchors.head = domeF.t;
    anchors.top = inF(domeF, [0, DOME_R[1], 0]);
    for (const q of EYES) anchors[q.sd > 0 ? 'eyeN' : 'eyeF'] = inF(domeF, [DOME_R[0] * q.e[0], DOME_R[1] * q.e[1], DOME_R[2] * q.e[2]]);

    // --- red orbs: two big crystals in the upper sides, a small one on the front
    const orbMat = (s) => (s[0] * -0.35 + s[1] * 0.75 + s[2] * 0.35 > 0.6 ? C_ORB_L : s[1] < -0.6 ? C_ORB_D : C_ORB);
    for (const sd of [1, -1]) {
      const { p, n } = onDome(sd * 0.98, 0.4, -10);
      const ax0 = nrm(cross([0, 1, 0], n)), ax1 = cross(n, ax0);
      const r = 23.5;
      const id = sd > 0 ? 5 : 6;
      const orb = E(inF(domeF, p), M3.mul(domeF.L, M3.cols(sc(ax0, r), sc(ax1, r * 1.1), sc(n, r))), id, id, orbMat);
      prims.push(orb);
      anchors[sd > 0 ? 'gemN' : 'gemF'] = inF(domeF, add(p, sc(n, r)));
      if (gem > 0.3) stamps.push({ at: { prim: orb, p: add(orb.c, M3.v(orb.L, SPARK_S)), s: SPARK_S }, set: SPARK.m, colors: SPARKC, kind: 'open', overflow: true, minFacing: 0.15, big: true });
    }
    {
      const { p, n } = onDome(0, -0.02, -3.4);
      const orb = E(inF(domeF, p), M3.mul(domeF.L, M3.diag(7.6, 8, 7.6)), 7, 7, orbMat);
      prims.push(orb);
      anchors.gem = inF(domeF, add(p, sc(n, 7.6)));
      if (gem > 0.6) stamps.push({ at: { prim: orb, p: add(orb.c, M3.v(orb.L, SPARK_S)), s: SPARK_S }, set: SPARK.s, colors: SPARKC, kind: 'open', overflow: true, minFacing: 0.15, big: false });
    }

    // --- mantle: the skirt that hangs from under the eyes and flares out, rim in soft scallops
    const sk = 1 + 0.07 * k;
    const bellF = chain(T(-13, 8, 0), R(M3.diag(sk, 1 - 0.06 * k, sk)));
    const RIM = -0.2;
    // the mantle is one jelly with the dome (same group: no seam at the back); a crease line is drawn
    // only across the front, where the hood meets the face under the eyes
    const DQ = J.dome.Q, DC = J.dome.c;
    const mantle = J.mantle = ellF(bellF, [50, 40, 54], 1, 1, null);
    mantle.Q = M3.inv(mantle.L);
    mantle.mat = (s) => {
      if (s[1] < RIM + 0.05 * Math.cos(Math.atan2(s[2], s[0]) * 5)) return 0;
      if (s[0] > 0.25 && s[1] > 0.4) {
        const p = add(mantle.c, M3.v(mantle.L, s)), q = M3.v(DQ, sub(p, DC));
        if (Math.abs(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] - 1) < Math.max(0.035, 1.3 / (curScale * 46))) return C_CREASE;
      }
      return code(BODY, blendBias(mantle, s, J.dome));
    };
    prims.push(mantle);
    // dark underside, showing below the rim
    prims.push(ellF(chain(bellF, T(1, -8, 0)), [46, 8, 50], 3, 3, M_UNDER));
    anchors.body = bellF.t;
    anchors.base = inF(bellF, [0, -8, 0]);

    // --- keel: a ridge down the middle of the face (between the eyes) into a small beak
    const ridge = (a, b, r0, r1) => {
      const ax = segAxes(a, b);
      return E(sc(add(a, b), 0.5), M3.cols(sc(ax.X, r0), sc(ax.Y, ax.l / 2 + 2), sc(ax.Z, r1)), 4, 4, M_KEEL);
    };
    const kTop = inF(domeF, onDome(0, -0.18, -0.9).p), kMid = inF(domeF, onDome(0, -0.62, -1.4).p);
    prims.push(ridge(kTop, kMid, 2.8, 2.6));
    const beakBot = add(kMid, [5, -13, 0]);
    prims.push(ridge(add(kMid, [0, 3, 0]), beakBot, 4.6, 4.2));
    anchors.mouth = beakBot;

    // --- long tentacles: out from under the face, down and out to the sides, spoon tips curling up
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const p0 = [27, 4, sd * 9];
      const p1 = [42, -16, sd * 15];
      const p2 = [24, -34, sd * 56];
      const p3 = [6, -14, sd * 80];
      const pts = [];
      for (let i = 0; i <= NL; i++) {
        const t = i / NL;
        const q = bez(p0, p1, p2, p3, t);
        // trailing wave with the pulse; drift swings the tentacles sideways (more toward the tip)
        const w = Math.sin(ph - 3.2 * t) * 7 * t;
        pts.push([q[0] - 5 * t * t * (1 + k), q[1] + w, q[2] + dr * 24 * t * t]);
      }
      for (let i = 0; i < NL; i++) {
        const r = lerp(TL_R0, TL_R1, i / NL);
        prims.push(tubeSeg(pts[i], pts[i + 1], r, id, id, TENT, r * 0.9));
      }
      // flat spoon-shaped tip
      const a = segAxes(pts[NL - 1], pts[NL]);
      const tipC = add(pts[NL], sc(a.Y, 3.5));
      const flat = nrm(cross(a.Y, [0, 1, 0]));
      const Z = nrm(cross(flat, a.Y));
      prims.push(E(tipC, M3.cols(sc(flat, 2.8), sc(a.Y, 10), sc(Z, 7.2)), id, id, M_TENT));
      anchors[sd > 0 ? 'tipN' : 'tipF'] = add(tipC, sc(a.Y, 9));
    }
    // --- two small stubby tentacles beside them
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11;
      let p = [14 * sk, 0, sd * 20 * sk];
      for (let j = 0; j < 3; j++) {
        const q = [p[0] + 1 - 1.4 * Math.sin(ph - 1 - j), p[1] - 6.5, p[2] + sd * (1.4 + 1.2 * j) + dr * 3 * (j + 1)];
        const a = segAxes(p, q);
        const rr = 2.4 - j * 0.45;
        prims.push(E(sc(add(p, q), 0.5), M3.cols(sc(a.X, rr), sc(a.Y, a.l / 2 + rr * 0.5), sc(a.Z, rr)), id, id, M_TENT));
        p = q;
      }
    }

    return { prims, stamps, dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 14, shadowDepth: 22 };
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
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    VR = M3.mul(M3.rx(opt.pitch ?? 0.16), M3.ry(-(opt.yaw ?? 1.05)));
    for (const st of model.stamps) st.set = st.big ? (curScale >= 1.1 ? SPARK.l : curScale >= 0.6 ? SPARK.m : SPARK.s) : curScale >= 1.1 ? SPARK.m : SPARK.s;
    const g = clamp(model.pose.gem || 0, 0, 1);
    if (g > 0) {
      // glint: the crystals brighten toward the ungraded glint ramp
      const pal = Object.assign({}, opt.pal || PAL), e = pal[ORB], G = PAL[GLINT];
      pal[ORB] = { r: e.r.map((c, i) => PX.mix(c, G.r[i], g * (i >= 3 ? 0.35 : 0.55))), od: PX.mix(e.od, G.od, g * 0.4), ol: PX.mix(e.ol, G.ol, g * 0.5), ln: PX.mix(e.ln, G.ln, g * 0.5) };
      opt = Object.assign({}, opt, { pal });
    }
    return cropRender(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.9, bw: 240, bh: 176, oy: 0.72 } };
})();
