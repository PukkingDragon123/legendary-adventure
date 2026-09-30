/* ------------------------------------------------------------------
   Regice — the Iceberg Pokémon (1.8 m ≈ 315 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a golem of pale-blue Antarctic ice with a
   faceted, crystalline surface. A big rounded egg-shaped body that is
   head and torso in one, topped by a low faceted crest; on the upper
   front, seven braille dots (2-3-2, a hexagon round a centre dot) that
   serve as its eyes and light up yellow when it wakes. Heavy rounded
   shoulders, long thick arms tapering to three blunt ice points, and
   short stubby legs.
   Facets: each ellipsoid's surface is split into large planar-looking
   cells (nearest of a fixed set of directions) with a tone step per cell
   and a light edge between cells; the ice is glossy.

   Pose params:
     walk    radians  stiff waddle phase: the body rocks side to side with
                      sin(walk), feet lift in turn, arms barely swing; 0 = still
     glow    0..1     the seven dots glow (brighter, near white-yellow)
     awake   0..1     0 dormant (dark dots, slightly dimmer ice), 1 active
                      (yellow dots)
     arms    0..1     arms raised forward and up (Ice Beam pose)
     eyes    'open' (default) | 'happy' | 'blink' | 'closed' — blink/closed dim
                      the dots (it has no other eyes)
     mouth   0..1     accepted for the shared API; Regice has no mouth (unused)
     side    −1..1    ≈ 3·cos(yaw), passed by the game (unused)
   Anchors: top (crest), head (the dot face), mouth (= face centre, where the
            Ice Beam comes from), eyeN/eyeF (outer dots), body, handN, handF,
            footN, footF.
------------------------------------------------------------------- */
const Regice = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const ICE = 1, ICED = 2, DOT = 3, DOTD = 4, EDGE = 5;
  const MAT = { ICE, ICED, DOT, DOTD, EDGE };
  const PAL = Creature.palette({
    [ICE]:  { r: ['#3f7fb2', '#65a6d6', '#98d0ee', '#c8ebfa', '#f2fcff'], od: '#1c4676', ol: '#3a74a6', ln: '#4f8cbe' },
    [ICED]: { r: ['#356ea0', '#5694c6', '#84bee2', '#b2def4', '#e6f8ff'], od: '#1c4676', ol: '#3a74a6', ln: '#4f8cbe' },
    [EDGE]: { r: ['#86b8dc', '#aad4ee', '#d4f0fc', '#eefaff', '#ffffff'], od: '#1c4676', ol: '#3a74a6', ln: '#4f8cbe' },
    [DOT]:  { r: ['#b8820c', '#e2aa1a', '#fad036', '#ffe886', '#fff8d4'], od: '#6a4406', ol: '#8e6210', ln: '#7a520a' },
    [DOTD]: { r: ['#1c2a3a', '#243548', '#2c4056', '#364c64', '#405872'], od: '#101a26', ol: '#1c2a3a', ln: '#1c2a3a' },
  });
  const GLOSSY = { [ICE]: 1, [ICED]: 1 };
  const LIT = ['#ffe070', '#fff09a', '#fff8c8', '#ffffee', '#ffffff'].map(PX.hex);
  const C_ICE = code(ICE), C_EDGE = code(EDGE), C_DOT = code(DOT), C_DOTD = code(DOTD);
  const FACET_C = [code(ICED, -1), code(ICE, 0), code(ICED, 0), code(ICE, 1), code(ICE, 0), code(ICED, 0)];

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, dot = V3.dot, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, ry, rz, part, grp, mat, up = [1, 0, 0], over = 0.5) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const X = sc(d, 1 / l);
    let Y = sub(up, sc(X, dot(up, X)));
    if (len3(Y) < 1e-3) Y = cross([0, 0, 1], X);
    Y = nrm(Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(l / 2 + Math.min(ry, rz) * over, ry, rz)), part, grp, mat);
  }

  let curScale = 1;

  /* ---------- facets: nearest of a fixed direction set (flattened arrays for speed) ---------- */
  function facetSet(seed, n) {
    const D = [];
    // golden-spiral points, jittered: irregular, crystal-like cells
    let h = seed;
    const rnd = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996 + rnd() * 0.5;
      D.push(nrm([r * Math.cos(a) + (rnd() - 0.5) * 0.2, y, r * Math.sin(a) + (rnd() - 0.5) * 0.2]));
    }
    const f = new Float32Array(n * 3);
    D.forEach((d, i) => { f[i * 3] = d[0]; f[i * 3 + 1] = d[1]; f[i * 3 + 2] = d[2]; });
    const c = new Int32Array(n);
    for (let i = 0; i < n; i++) c[i] = FACET_C[Math.floor(rnd() * FACET_C.length)];
    return { f, c, n };
  }
  const FS = [facetSet(7, 20), facetSet(101, 12), facetSet(4242, 9)];
  // facet material at unit-sphere point s (edge half-width w in dot units)
  function facet(F, s, w) {
    let b1 = -9, b2 = -9, i1 = 0;
    const f = F.f;
    for (let i = 0; i < F.n; i++) {
      const d = f[i * 3] * s[0] + f[i * 3 + 1] * s[1] + f[i * 3 + 2] * s[2];
      if (d > b1) { b2 = b1; b1 = d; i1 = i; } else if (d > b2) b2 = d;
    }
    return b1 - b2 < w ? C_EDGE : F.c[i1];
  }
  const facetMat = (F, r) => (s) => facet(F, s, Math.max(0.018, 0.5 / (curScale * r)));

  /* ---------- the dot face (body local sphere) ---------- */
  const BODY_R = [98, 126, 104];
  const FACE = nrm([0.86, 0.5, 0]); // face centre direction on the body sphere
  const FY = nrm(sub([0, 1, 0], sc(FACE, FACE[1])));
  const FZ = cross(FACE, FY); // toward +z
  const DX = 0.2, DY = 0.17;
  // 2-3-2: a hexagon round a centre dot
  const DOTS = [[-0.5, 1], [0.5, 1], [-1, 0], [0, 0], [1, 0], [-0.5, -1], [0.5, -1]].map(([a, b]) => [a * DX, b * DY]);
  let dotOn = true;
  function bodyMat(s) {
    const df = s[0] * FACE[0] + s[1] * FACE[1] + s[2] * FACE[2];
    if (df > 0.8) {
      const d = [s[0] - FACE[0], s[1] - FACE[1], s[2] - FACE[2]];
      const u = d[0] * FZ[0] + d[1] * FZ[1] + d[2] * FZ[2], v = d[0] * FY[0] + d[1] * FY[1] + d[2] * FY[2];
      const rr = Math.max(0.058, 1.4 / (curScale * BODY_R[1] * SIZE));
      for (let i = 0; i < 7; i++) {
        const du = u - DOTS[i][0], dv = v - DOTS[i][1];
        if (du * du + dv * dv < rr * rr) return dotOn ? C_DOT : C_DOTD;
      }
      // smooth ice around the face so the dots read cleanly
      if (Math.abs(u) < DX * 1.35 && Math.abs(v) < DY * 1.5) return C_ICE;
    }
    return facet(FS[0], s, Math.max(0.018, 0.5 / (curScale * BODY_R[1])));
  }

  const DEFAULT = { walk: 0, glow: 0, awake: 1, arms: 0, eyes: 'open', mouth: 0, side: 1 };
  // 1 body, 2 crest, 3/4 shoulders+arms, 5/6 legs
  const SIZE = 0.95;
  const PRI = { 1: 0, 2: 1, 3: 2, 4: 1, 5: 1, 6: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const am = clamp(+P.arms || 0, 0, 1);
    const sam = am * am * (3 - 2 * am);
    const roll = walking ? 0.09 * Math.sin(wk) : 0;
    const twist = walking ? 0.05 * Math.sin(wk) : 0;
    const bob = walking ? 3 * Math.abs(Math.sin(wk)) : 0;
    // body frame: pivots about the planted foot side while waddling
    const B = chain(T(0, bob, 0), R(M3.ry(twist)), T(0, 0, -Math.sign(roll) * 0), R(M3.rx(roll)));

    /* --- body: one big faceted egg, the dot face on the upper front --- */
    const bf = chain(B, T(0, 184, 0), R(M3.rz(-0.06)));
    const bodyPrim = ellF(bf, BODY_R, 1, 1, bodyMat);
    prims.push(bodyPrim);
    anchors.body = inF(bf, [0, 0, 0]);
    // lower body bulge (slightly wider hips)
    prims.push(ellF(chain(B, T(-4, 104, 0)), [86, 58, 96], 1, 1, facetMat(FS[1], 70)));
    // crest: a low faceted ridge over the top, front to back
    const cf = chain(bf, T(-6, 110, 0), R(M3.rz(0.1)));
    prims.push(ellF(cf, [70, 26, 42], 2, 2, facetMat(FS[2], 36)));
    anchors.top = inF(cf, [0, 26, 0]);
    anchors.head = inF(bf, [BODY_R[0] * FACE[0], BODY_R[1] * FACE[1], 0]);
    anchors.mouth = anchors.head;
    const dotP = (u) => inF(bf, [BODY_R[0] * (FACE[0] + FZ[0] * u), BODY_R[1] * (FACE[1] + FZ[1] * u), BODY_R[2] * (FACE[2] + FZ[2] * u)]);
    anchors.eyeN = dotP(DX); anchors.eyeF = dotP(-DX);

    /* --- shoulders and arms --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 3 : 4;
      const ph = wk + (sd > 0 ? Math.PI : 0);
      const sw = walking ? 0.07 * Math.sin(ph) : 0;
      const sh = inF(B, [0, 212, sd * 98]);
      prims.push(ellF(chain(T(...sh), R(M3.rx(sd * 0.2))), [50, 52, 46], id, id, facetMat(FS[2], 48)));
      // arm direction: hanging slightly out and forward → raised forward/up
      const ang = lerp(0.12 + sw, 1.75, sam); // angle from straight down toward forward
      const out = lerp(0.3, 0.12, sam);
      const d = nrm([Math.sin(ang), -Math.cos(ang), sd * out]);
      const el = add(sh, sc(d, 88));
      const hand = add(el, sc(d, 62));
      prims.push(seg(add(sh, sc(d, 10)), el, 42, 40, id, id, facetMat(FS[1], 40)));
      prims.push(seg(el, hand, 34, 32, id, id, facetMat(FS[0], 34)));
      // three blunt ice points
      const X = nrm(cross(d, [0, 0, 1])), Z = nrm(cross(X, d));
      for (const [a, b] of [[0.9, 0], [-0.5, 0.8], [-0.5, -0.8]]) {
        const o = add(hand, add(sc(X, a * 16), sc(Z, b * 16)));
        prims.push(seg(o, add(o, add(sc(d, 36), add(sc(X, a * 6), sc(Z, b * 6)))), 13, 13, id, id, facetMat(FS[2], 14), X, 0.35));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hand, sc(d, 40));
    }

    /* --- legs: short and stubby; lift in turn when waddling --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 5 : 6;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const lift = walking ? 10 * Math.max(0, Math.sin(ph)) : 0;
      const fwd = walking ? 8 * Math.cos(ph) : 0;
      const hip = inF(B, [0, 70, sd * 54]);
      const ank = [8 + fwd, 18 + lift, sd * 60];
      prims.push(seg(hip, ank, 38, 36, id, id, facetMat(FS[1], 38), [1, 0, 0], 0.4));
      prims.push(ellF(T(ank[0] + 8, ank[1] - 4, ank[2]), [40, 16, 34], id, id, facetMat(FS[2], 30)));
      anchors[sd > 0 ? 'footN' : 'footF'] = [ank[0] + 8, ank[1] - 20, ank[2]];
    }
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim: bodyPrim, pri: PRI, glossy: GLOSSY, baseMat: ICE, shadowSteps: 0 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    const P = model.pose;
    const aw = clamp(P.awake ?? 1, 0, 1);
    const dim = P.eyes === 'closed' ? 1 : P.eyes === 'blink' ? 0.7 : 0;
    const on = aw * (1 - dim);
    dotOn = true;
    let pal = opt.pal || PAL;
    // dots: dormant dark → active yellow → glowing white-yellow
    const g = clamp(P.glow || 0, 0, 1) * on;
    const D = pal[DOT], K = pal[DOTD];
    const ramp = (i) => PX.mix(PX.mix(K.r[i], D.r[i], on), LIT[i], g);
    const dotPal = { r: [0, 1, 2, 3, 4].map((i) => ramp(Math.min(4, i + (g > 0.5 ? 1 : 0)))), od: PX.mix(K.od, D.od, on), ol: PX.mix(K.ol, PX.mix(D.ol, LIT[0], g), on), ln: PX.mix(K.ln, D.ln, on) };
    pal = Object.assign({}, pal, { [DOT]: dotPal });
    if (aw < 1) {
      // dormant: the ice is a little duller
      const dull = (e) => ({ r: e.r.map((c) => PX.mix(c, e.r[0], (1 - aw) * 0.25)), od: e.od, ol: e.ol, ln: e.ln });
      pal = Object.assign({}, pal, { [ICE]: dull(pal[ICE]), [ICED]: dull(pal[ICED]), [EDGE]: dull(pal[EDGE]) });
    }
    return Creature.render(model, Object.assign({}, opt, { pal }));
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.8, bw: 480, bh: 360, oy: 0.9 } };
})();
