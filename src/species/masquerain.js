/* ------------------------------------------------------------------
   Masquerain — the Eyeball Pokémon (0.8 m ≈ 140 units tall at scale 1,
   antenna tips included). Surskit's evolution. A posable 3D model
   rendered straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 under
   the lowest wing tip (it hovers: the game lifts it).

   Design (official art / HOME model): a small, pale sky-blue body shaped
   like a water drop: round head with a long tapering horn curving up and
   back, and a salmon face patch with tiny black eyes. Two huge flat
   salmon antennae rise from the sides of the head like D-shaped fans
   with a pointed tip, their fronts painted as intimidating eyes (a white
   half-ring round a mauve half-disc on the straight edge, a row of white
   dashes round the curved edge). Four small translucent pale-blue
   diamond wings stick out from the bottom of the body, dragonfly-style.

   Pose parameters (all optional):
     flap   radians  wing-beat phase (the four wings flutter, fore and hind
                     pairs alternating; body bobs gently); continuous
     walk   radians  drifting sway while it travels (body and antennae
                     rock); exactly 0 = still
     mouth  0..1     mouth open
     eyes   'open' | 'happy' | 'blink' | 'closed'
     side   −1..1    ≈ cos(yaw), passed by the game: the antennae turn a
                     little toward the camera so their eye markings read

   Anchors: top (highest antenna tip), head (head centre), mouth, eyeN,
   eyeF, body (body centre), horn (horn tip), antN / antF (antenna tips),
   wingN / wingF (front wing tips).
------------------------------------------------------------------- */
const Masquerain = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, FACE = 2, ANT = 3, RING = 4, CORE = 5, WING = 6, EYEK = 7, MOUTH = 8;
  const MAT = { BODY, FACE, ANT, RING, CORE, WING, EYEK, MOUTH };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#8aaccc', '#a8c6e2', '#c8def0', '#e2eff9', '#f8fcff'], od: '#3e6890', ol: '#6c94bc', ln: '#6c94bc' },
    [FACE]:  { r: ['#b85a44', '#d8745a', '#f0906e', '#fab092', '#ffd2bc'], od: '#6a2618', ol: '#a44a34', ln: '#a44a34' },
    [ANT]:   { r: ['#bc6250', '#dc7c66', '#f49a82', '#fcb8a2', '#ffd8c8'], od: '#72301e', ol: '#b05a44', ln: '#b05a44' },
    [RING]:  { r: ['#d0bcb8', '#e8d8d6', '#fcf2f0', '#ffffff', '#ffffff'], od: '#80564e', ol: '#b08a82', ln: '#b08a82' },
    [CORE]:  { r: ['#62283a', '#7c3448', '#96475a', '#ae6070', '#c8848e'], od: '#3a1020', ol: '#62283a', ln: '#62283a' },
    [WING]:  { r: ['#9cc0dc', '#bcd8ee', '#d8ecf8', '#ecf6fc', '#ffffff'], od: '#4a78a4', ol: '#7ca4c8', ln: '#8ab0d0' },
    [EYEK]:  { r: ['#0a0a10', '#101018', '#181820', '#20202a', '#2c2c38'], od: '#050508', ol: '#0a0a10', ln: '#050508' },
    [MOUTH]: { r: ['#5a1c1c', '#742626', '#903432', '#aa4642', '#c05c56'], od: '#340c0c', ol: '#5a1c1c', ln: '#5a1c1c' },
  });
  const GLOSSY = { [BODY]: 1 };
  const C_BODY = code(BODY), C_FACE = code(FACE), C_ANT = code(ANT), C_RING = code(RING), C_CORE = code(CORE);
  const C_WING = code(WING), C_EYEK = code(EYEK), C_MOUTH = code(MOUTH);
  const M_BODY = () => C_BODY;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], ext = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return E(sc(add(p0, p1), 0.5), M3.cols(sc(X, rx), sc(Y, (l / 2) * ext), sc(Z, rz)), part, grp, mat);
  }
  // plate: U along, V in-plane (orthogonalised), normal U × V
  function plateUV(c, U, Vh, part, grp, shape, thick = 1.6) {
    const u = nrm(U), v = nrm(sub(Vh, sc(u, dot(Vh, u))));
    return { kind: 'plate', part, grp, c, L: M3.cols(u, v, cross(u, v)), shape, thick };
  }

  let curScale = 1;

  /* ---------- head: pale blue, salmon face patch, tiny eyes (decals) ---------- */
  const HR = [16, 15.5, 16.5];
  const EYE_AZ = 0.42, EYE_V = 0.1;
  const inFace = (az, v) => { const a = az / 0.95, b = (v + 0.12) / 0.5; return a * a + b * b < 1; };
  function headMat(kind, mo) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), v = s[1];
      if (s[0] < 0 || !inFace(az, v)) return C_BODY;
      const px = 1 / (curScale * HR[1]);
      const sd = az >= 0 ? 1 : -1;
      const u = (az - sd * EYE_AZ), w = v - EYE_V;
      const r = Math.max(0.1, 1.2 * px);
      if (kind === 'open') {
        if (u * u + w * w < r * r) return C_EYEK;
        // little lash flicking out at the outer top corner
        const lx = sd * u - r * 0.6, ly = w - r * 0.7;
        if (lx > 0 && lx < r * 1.3 && Math.abs(ly - lx * 0.5) < Math.max(0.03, 0.55 * px)) return C_EYEK;
      } else {
        const k = u / (r * 1.4);
        if (Math.abs(k) < 1) {
          const yc = kind === 'happy' ? -0.3 * r + 0.8 * r * (1 - k * k) : kind === 'blink' ? 0 : 0.2 * r - 0.5 * r * (1 - k * k);
          if (Math.abs(w - yc) < Math.max(0.03, 0.6 * px)) return C_EYEK;
        }
      }
      if (mo > 0.05) {
        const ma = az / Math.max(0.1, 1.3 * px), mb = (v + 0.3) / Math.max(0.03 + 0.08 * mo, 1.1 * px);
        if (ma * ma + mb * mb < 1) return C_MOUTH;
      }
      return C_FACE;
    };
  }

  /* ---------- antenna: D-shaped fan with the eye marking ---------- */
  // u along the straight edge (root 0 → pointed tip AL), v out across the bulge
  const AL = 84, AB = 31;
  const ANT_PTS = (() => {
    const pts = [[0, -1.5]];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = 2 + t * (AL - 2);
      const v = AB * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.9) * (1 - 0.25 * t);
      pts.push([u, v]);
    }
    pts.push([AL - 3, -0.5], [AL * 0.5, -1.5]);
    return pts;
  })();
  const RC = [AL * 0.42, 0];
  const ANT_G = bakeShape(Shape2D.poly(ANT_PTS, C_ANT, 6, (u, v) => {
    const du = u - RC[0], dv = v - RC[1], r = Math.hypot(du, dv);
    if (r < 13) return C_CORE;
    if (r < 20.5) return C_RING;
    // white dashes along the curved edge
    const a = Math.atan2(dv, du);
    if (r > 24.5 && r < 29.5 && v > 3) {
      const k = (a / Math.PI) * 9;
      const f = k - Math.floor(k);
      if (f > 0.25 && f < 0.75) return C_RING;
    }
    return C_ANT;
  }));

  /* ---------- wing: long translucent diamond ---------- */
  const WING_G = bakeShape(Shape2D.poly([[0, 0], [14, -6.5], [46, -2.5], [52, 0.5], [30, 6.5], [8, 4]], C_WING, 3));
  const WING_LN = [[[2, 0.5], [49, 0.2]]];

  const SIZE = 1.12;
  const DEFAULT = { flap: 0, walk: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 body, 2 head, 3 horn, 4/5 antennae, 6..9 wings
  const PRI = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 0, 7: 0, 8: 0, 9: 0 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const fl = +P.flap || 0, wk = +P.walk || 0, mo = clamp(+P.mouth || 0, 0, 1);
    const side = clamp(P.side ?? 1, -1, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const bob = 1.4 * Math.sin(fl * 0.25);
    const rock = wk !== 0 ? 0.08 * Math.sin(wk) : 0;
    const root = chain(T(0, 26 + bob, 0), R(M3.rx(rock)), R(M3.rz(-0.1 + (wk !== 0 ? 0.04 * Math.cos(wk) : 0))));

    /* --- body: a drop under the head --- */
    prims.push(ellF(chain(root, T(-1, 0, 0)), [12, 14, 12], 1, 1, M_BODY));
    prims.push(ellF(chain(root, T(-2, -10, 0)), [6.5, 8, 6.5], 1, 1, M_BODY));
    anchors.body = inF(root, [-1, 0, 0]);

    /* --- head --- */
    const head = chain(root, T(3, 23, 0), R(M3.rz(0.06)));
    const headPrim = ellF(head, HR, 2, 2, headMat(kind, mo));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, -0.3);
    // horn: long, tapering, curving up and back
    let hp = inF(head, [-3, 10, 0]);
    const hpts = [hp];
    for (let i = 0; i < 10; i++) {
      const a = 0.8 + 0.03 * i;
      hp = add(hp, sc(dirF(head, [-Math.cos(a), Math.sin(a), 0]), 5.8));
      hpts.push(hp);
    }
    // smooth taper: a few long overlapping spindles from the base out to the tip
    for (const [i0, i1, r, e] of [[0, 4, 7.4, 1.25], [2, 7, 4.6, 1.2], [5, 9, 2.6, 1.15], [7, 10, 1.3, 1.05]])
      prims.push(seg(hpts[i0], hpts[i1], r, r, 3, 3, M_BODY, [1, 0, 0], e));
    anchors.horn = hpts[10];

    /* --- antennae: big D fans rising from the head sides, eye markings facing forward --- */
    const sway = 0.04 * Math.sin(fl * 0.25) + (wk !== 0 ? 0.05 * Math.sin(wk + 0.5) : 0);
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 4 : 5;
      const rootA = inF(head, [0, 7, sd * 11]);
      const up = 0.55 + sway * sd;
      const U = dirF(head, [-0.12, Math.sin(up), sd * Math.cos(up)]);
      // bulge toward the back-top edge (the straight edge faces inward/forward), face turned to the front
      const tw = 0.25 * side;
      const N = nrm(dirF(head, [1, 0, sd * 0.35 + tw]));
      const Vh = nrm(cross(N, U));
      const V = sd > 0 ? sc(Vh, -1) : Vh;
      // the bulge falls on the lower/outer side, the straight edge faces up/in
      const Vf = V[1] > 0 ? sc(V, -1) : V;
      prims.push(plateUV(rootA, U, Vf, id, id, ANT_G, 1.8));
      anchors[sd > 0 ? 'antN' : 'antF'] = add(rootA, sc(U, AL));
    }
    anchors.top = anchors.antN[1] > anchors.antF[1] ? anchors.antN : anchors.antF;

    /* --- four diamond wings from the bottom of the body --- */
    const wb = inF(root, [-2, -8, 0]);
    let wi = 0;
    for (const [az0, ph] of [[0.75, 0], [2.35, Math.PI]]) {
      for (const sd of [1, -1]) {
        const id = 6 + wi++;
        const beat = 0.35 * Math.sin(fl + ph);
        const az = sd * az0;
        const U = dirF(root, [Math.cos(az) * Math.cos(beat), Math.sin(beat) - 0.12, Math.sin(az) * Math.cos(beat)]);
        // tilt the blade about its long axis so its face shows from above
        const Vh = add(dirF(root, [-Math.sin(az), 0, Math.cos(az)]).map((v) => v * sd * (az0 > 1.5 ? -1 : 1)), dirF(root, [0, 0.9, 0]));
        const w = plateUV(add(wb, sc(U, 3)), U, Vh, id, id, WING_G, 1.2);
        w.lines = WING_LN.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: WING, useLn: true }));
        prims.push(w);
        if (az0 < 1.5) anchors[sd > 0 ? 'wingN' : 'wingF'] = add(wb, sc(U, 52));
      }
    }

    // y = 0 sits under the lowest wing tip at the bottom of the beat
    const dy = 13;
    for (const q of prims) { q.c = sc(add(q.c, [0, dy, 0]), SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(add(anchors[k], [0, dy, 0]), SIZE);

    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 10 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.8, bw: 250, bh: 190, oy: 0.92 } };
})();
