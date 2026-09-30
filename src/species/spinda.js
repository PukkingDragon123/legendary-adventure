/* ------------------------------------------------------------------
   Spinda — the Spot Panda Pokémon (1.1 m ≈ 192 units tall at scale 1,
   ear tips included). A posable 3D model rendered straight to pixel art
   by the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a cream-coloured, bear/rabbit-like Pokémon that
   totters about dizzily. A big round head with two huge oval ears that
   splay out to the sides; each ear has a red outer tip and a black spiral
   on its inner face. The eyes ARE black spirals. A tiny black nose and a
   thin pink smile. Red patches on the head (every Spinda's pattern is
   unique: the `spots` seed moves them). A pear-shaped body with a red band
   around the hips, cream stubby legs and feet, and red flipper-like arms
   held out for balance.

   Pose params:
     walk    radians  tottering walk phase: the feet step with sin(walk), the
                      body bobs and rocks; exactly 0 = standing
     wobble  radians  dizzy sway phase (animate it continuously): the whole
                      body circles/sways about the feet, the head lags and
                      counter-tilts, the arms flail for balance; 0 = upright
     spots   integer  seed for the unique red face-spot pattern (0 = the
                      official-art pattern; any other integer = a stable variant)
     mouth   0..1     0 = thin pink smile … 1 = open smile
     eyes    'open' (default: the spiral eyes) | 'happy' (^ ^) | 'blink' | 'closed'
   Anchors: top (ear tips), head, mouth, eyeN, eyeF, nose, body, belly,
            earN, earF, handN, handF, footN, footF.
------------------------------------------------------------------- */
const Spinda = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const CREAM = 1, RED = 2, INK = 3, PINK = 4, MOUTH = 5;
  const MAT = { CREAM, RED, INK, PINK, MOUTH };
  const PAL = Creature.palette({
    // sampled from the official art: pinkish cream #e8ddcf, spot red #d86d6b
    [CREAM]: { r: ['#b4a292', '#d0c2b2', '#e8ddcf', '#f2ebe0', '#fbf7f0'], od: '#5e4a40', ol: '#8e7a6c', ln: '#a4927e' },
    [RED]:   { r: ['#9a3c3c', '#bc5452', '#d86d6b', '#e88a86', '#f4aaa4'], od: '#561418', ol: '#86282c', ln: '#94383a' },
    [INK]:   { r: ['#140e12', '#1a1216', '#20161a', '#2a1e22', '#34262a'], od: '#0a0608', ol: '#140e12', ln: '#140e12' },
    [PINK]:  { r: ['#a84e6c', '#c46482', '#dc7e98', '#e898ae', '#f4b8c8'], od: '#6a1e38', ol: '#94344e', ln: '#9e4058' },
    [MOUTH]: { r: ['#5a1a2a', '#742434', '#8e3244', '#a84456', '#c05a6a'], od: '#380c18', ol: '#561424', ln: '#561424' },
  });
  const GLOSSY = {};
  const C_CREAM = code(CREAM), C_RED = code(RED), C_INK = code(INK), C_PINK = code(PINK), C_MOUTH = code(MOUTH);
  const M_CREAM = () => C_CREAM, M_RED = () => C_RED;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], over = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * over, rz], part, grp, mat);
  }
  // small deterministic PRNG for the spot pattern
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  let curScale = 1;

  /* ---------- spiral decal (model units around a centre; dir = spin direction) ---------- */
  // r = b·θ Archimedean spiral: on the line when r/b − θ is close to a multiple of 2π
  function spiral(du, dv, R0, dir) {
    const r = Math.hypot(du, dv);
    const p = 1 / curScale;
    if (r > R0 + 0.6 * p) return false;
    const gap = Math.max(R0 / 1.6, 2.3 * p);  // turn spacing, at least ~2 px
    const lw = Math.max(R0 * 0.18, 0.62 * p);
    if (r < lw * 1.2) return true;            // centre dot
    const th = dir * Math.atan2(dv, du);
    const turns = r / gap - th / (2 * Math.PI);
    const f = turns - Math.round(turns);
    return Math.abs(f) * gap < lw && r < R0;
  }

  /* ---------- head decals (head frame: unit sphere s) ---------- */
  const HR = [44, 42, 52];
  const EYE_AZ = 0.43, EYE_V = 0.1, EYE_R = 14, NOSE_V = -0.12, MOUTH_V = -0.3;
  // official-art spot pattern (az, v, radius in unit-sphere units)
  const OFFICIAL = [[0.42, 0.74, 0.3], [-0.56, 0.12, 0.36], [1.75, 0.2, 0.3], [2.6, 0.45, 0.42]];
  function spotSet(seed) {
    if (!seed) return OFFICIAL;
    const r = rng(seed);
    return OFFICIAL.map(([az, v, rr], i) => [az + (r() - 0.5) * (i < 2 ? 0.9 : 1.4), clamp(v + (r() - 0.5) * 0.7, -0.35, 0.85), rr * (0.8 + 0.45 * r())]);
  }
  function headMat(kind, mo, spots) {
    const SP = spots.map(([az, v, rr]) => { const d = Creature.sph(az, v); return { d, c: Math.cos(rr) }; });
    return (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      const cv = Math.sqrt(Math.max(0, 1 - v * v)), rh = cv * Math.hypot(HR[0] * Math.cos(az), HR[2] * Math.sin(az));
      const p = 1 / curScale;
      if (s[0] > 0) {
        const sd = az >= 0 ? 1 : -1;
        // eyes
        if (a < 1.0 && Math.abs(v - EYE_V) < 0.5) {
          const du = (az - sd * EYE_AZ) * rh, dv = (v - EYE_V) * HR[1];
          if (kind === 'open') { if (spiral(sd * du, dv, EYE_R, 1)) return C_INK; }
          else if (Math.abs(du) < EYE_R * 0.8) {
            const k = du / (EYE_R * 0.8), lw = Math.max(0.9, 0.62 * p);
            const yc = kind === 'happy' ? EYE_R * (0.3 - 0.6 * k * k) : kind === 'closed' ? EYE_R * (-0.2 + 0.4 * k * k) : 0;
            if (Math.abs(dv - yc) < lw) return C_INK;
          }
        }
        const u = az * rh, y = (v - MOUTH_V) * HR[1];
        // nose
        const nx = u / Math.max(2, 0.8 * p), ny = (v - NOSE_V) * HR[1] / Math.max(1.5, 0.6 * p);
        if (nx * nx + ny * ny < 1) return C_INK;
        // smile
        if (Math.abs(u) < 13 && Math.abs(y) < 10) {
          const hw = 11 + mo, k = u / hw;
          if (Math.abs(k) < 1) {
            const yc = 1.8 * k * k;
            if (mo > 0.08) {
              const h = Math.max(1.5 + 5 * mo, 2 * p) * Math.sqrt(1 - k * k);
              if (y < yc + 0.6 && y > yc - h) return y > yc - Math.max(0.9, 0.6 * p) ? C_PINK : C_MOUTH;
            } else if (Math.abs(y - yc) < Math.max(1.3, 0.62 * p)) return C_PINK;
          }
        }
      }
      // red spots (the unique pattern)
      for (const sp of SP) if (s[0] * sp.d[0] + s[1] * sp.d[1] + s[2] * sp.d[2] > sp.c) return C_RED;
      return C_CREAM;
    };
  }
  // body: cream, red band around the hips
  // red band wraps the lower body (rising at the sides and back), cream belly oval above it at the front
  const bodyMat = (s) => {
    const back = Math.max(0, 0.35 - s[0]);
    return s[1] < -0.28 + 0.55 * back && s[1] > -0.9 ? C_RED : C_CREAM;
  };
  // ear (flat ellipsoid: x = thickness facing forward, y = along the ear, z = across): red outer tip, black spiral inside
  function earMat(sd) {
    return (s) => {
      if (s[1] > 0.3 - 0.35 * s[2] * sd) return C_RED;
      if (s[0] > 0.3 && spiral(s[2] * 17 * sd, (s[1] + 0.25) * 25, 11, -1)) return C_INK;
      return C_CREAM;
    };
  }

  const DEFAULT = { walk: 0, wobble: 0, spots: 0, mouth: 0, eyes: 'open' };
  // 1 body, 2 head, 3/4 ears, 5/6 arms, 7/8 legs
  const PRI = { 1: 0, 2: 2, 3: 1, 4: 1, 5: 3, 6: 3, 7: -1, 8: -1 };
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const wk = +P.walk || 0, walking = wk !== 0;
    const wb = +P.wobble || 0;
    const mo = clamp(+P.mouth || 0, 0, 1);
    const spots = spotSet(Math.round(+P.spots || 0));
    const bob = walking ? 3 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.06 * Math.sin(wk) : 0;
    // dizzy sway: circles about the feet (side-to-side + a little forward/back)
    const swayX = 0.13 * Math.sin(wb) + rock, swayZ = 0.06 * Math.sin(2 * wb);
    const root = chain(T(0, bob, 0), R(M3.rx(swayX)), R(M3.rz(swayZ + 0.04)));

    /* --- legs and feet (cream), stepping --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 9 * Math.sin(ph) : 0;
      const lift = walking ? 5 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(root, [0, 22, sd * 15]);
      const ank = [4 + fwd, 8 + lift, sd * 17 + Math.sin(wb) * 3];
      prims.push(seg(hip, ank, 11.5, 11.5, id, id, M_CREAM, [1, 0, 0], 1.2));
      const foot = chain(T(ank[0] + 4, ank[1] - 2.5, ank[2]), R(M3.ry(-sd * 0.3)), R(M3.rz(walking ? 0.2 * Math.sin(ph) : 0)));
      prims.push(ellF(foot, [12, 6, 10], id, id, M_CREAM));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -6, 0]);
    }

    /* --- pear-shaped body with the red hip band --- */
    const bodyF = chain(root, T(0, 50, 0));
    prims.push(ellF(bodyF, [30, 35, 32], 1, 1, bodyMat));
    anchors.body = bodyF.t;
    anchors.belly = inF(bodyF, [33, -8, 0]);

    /* --- head: lags behind the sway and counter-tilts (dizzy) --- */
    const lag = 0.12 * Math.sin(wb - 0.9);
    const head = chain(root, T(4, 96, 0), R(M3.rx(-0.6 * swayX + lag)), R(M3.rz(-0.1 * Math.sin(2 * wb - 0.6))), T(0, 10, 0));
    const headPrim = ellF(head, HR, 2, 2, headMat(kind, mo, spots));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(head, [(HR[0] + out) * q[0], (HR[1] + out) * q[1], (HR[2] + out) * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.nose = onHead(0, NOSE_V);
    anchors.mouth = onHead(0, MOUTH_V);

    /* --- huge oval ears splayed out --- */
    let top = -1e9;
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 3 : 4;
      const flap = 0.1 * Math.sin(wb * 1.5 + sd) + (walking ? 0.05 * Math.sin(wk * 2) : 0);
      const base = onHead(sd * 1.0, 0.62, -6);
      const d = dirF(head, [-0.12, 1, sd * (0.6 + flap)]);
      const [X, Y, Z] = frameAlong(d, dirF(head, [1, 0, 0.3 * sd]));
      const c = add(base, sc(Y, 27));
      prims.push(ellAx(c, X, Y, Z, [6, 32, 19], id, id, earMat(sd)));
      const tp = add(c, sc(Y, 32));
      anchors[sd > 0 ? 'earN' : 'earF'] = tp;
      top = Math.max(top, tp[1]);
    }
    anchors.top = [head.t[0], top, 0];

    /* --- red flipper arms held out for balance (near one raised) --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 5 : 6;
      const flail = 0.35 * Math.sin(wb * 2 + (sd > 0 ? 0 : 2)) + (walking ? 0.2 * Math.sin(wk + (sd > 0 ? Math.PI : 0)) : 0);
      const lift = (sd > 0 ? 0.55 : -0.25) + flail;
      const sh = inF(bodyF, [2, 16, sd * 29]);
      const d = dirF(bodyF, [0.35, Math.sin(lift), sd * Math.cos(lift)]);
      const [X, Y, Z] = frameAlong(d, dirF(bodyF, [0, 1, 0]));
      // flat paddle: thin across its local x (the up-facing side)
      prims.push(ellAx(add(sh, sc(Y, 16)), X, Y, Z, [5.5, 18, 11], id, id, M_RED));
      anchors[sd > 0 ? 'handN' : 'handF'] = add(sh, sc(Y, 32));
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: CREAM, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.1, bw: 230, bh: 236, oy: 0.92 } };
})();
