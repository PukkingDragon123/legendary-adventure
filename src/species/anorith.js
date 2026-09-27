/* ------------------------------------------------------------------
   Anorith — the Old Shrimp Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME / battle model): a long oval sage-green
   shell carried level above the ground, its back covered by a dark grey
   segmented plate; the front of the head is a black shield with two red
   leaf markings and a pointed nose ridge. Round white eyes with big
   black pupils sit on short stalks out to the sides of the head. Two
   big jointed sage claws with dark hooked tips hang from under the head
   and serve as its legs. Four white fins with red diamond tips fan out
   on each side like oars, and two long dark spikes form a V tail.

   Pose parameters (all optional):
     step    radians  walk-cycle phase (the claws alternate, body bob and
                      a small roll); 0 = standing
     clawN   0..1     near-side (z+) claw raised forward/up (threat, grab)
     clawF   0..1     far-side (z−) claw raised
     fins    −1..1    fin beat (+ = up, − = down), for swimming: animate
                      it with sin(t); 0 = fins level, slightly drooped
     mouth   0..1     small mouth under the face opens
     eyes    'open' | 'happy' | 'closed' | 'blink'
     side    −1..1    ≈ cos(yaw), passed by the game (unused, accepted)

   Anchors: top (tail spike tips), head (head centre), mouth, eyeN, eyeF,
   body (shell centre), clawN / clawF (claw tips), tail (spike base),
   finN / finF (outer tip of the second fin on each side).
------------------------------------------------------------------- */
const Anorith = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const SHELL = 1, BACK = 2, FACE = 3, RED = 4, FIN = 5, EYEW = 6, PUPIL = 7, DARK = 8, MOUTH = 9;
  const MAT = { SHELL, BACK, FACE, RED, FIN, EYEW, PUPIL, DARK, MOUTH };
  const PAL = Creature.palette({
    [SHELL]: { r: ['#4c7466', '#6a9484', '#8db6a2', '#b2d4c2', '#dcf0e6'], od: '#243e34', ol: '#46695a', ln: '#44685a' },
    [BACK]:  { r: ['#2a2c30', '#3a3d42', '#50545a', '#686d74', '#9398a0'], od: '#16181c', ol: '#2c2f34', ln: '#1c1e22' },
    [FACE]:  { r: ['#101114', '#18191d', '#23252a', '#34373e', '#5a5e66'], od: '#0a0b0d', ol: '#18191d', ln: '#0a0b0d' },
    [RED]:   { r: ['#a8303e', '#cc4654', '#e8626c', '#f68890', '#ffbcc0'], od: '#5a101a', ol: '#94242e', ln: '#8e2430' },
    [FIN]:   { r: ['#a2abbc', '#c8d0de', '#eaeff6', '#fbfcff', '#ffffff'], od: '#3a4252', ol: '#7a8496', ln: '#8a94a8' },
    [EYEW]:  { r: ['#a8b2c4', '#ccd4e2', '#eef2f8', '#ffffff', '#ffffff'], od: '#2c3a36', ol: '#4c6258', ln: '#6a7a8c' },
    [PUPIL]: { r: ['#050608', '#0a0b0e', '#121418', '#1e2126', '#6a7078'], od: '#050608', ol: '#050608', ln: '#050608' },
    [DARK]:  { r: ['#2a2c2e', '#3c3f42', '#54585c', '#6e7276', '#989ca0'], od: '#141618', ol: '#2c2e30', ln: '#202224' },
    [MOUTH]: { r: ['#4a1018', '#641a24', '#802832', '#9a3a42', '#b24e54'], od: '#2a060c', ol: '#4a1018', ln: '#4a1018' },
  });
  const GLOSSY = { [BACK]: 1, [FACE]: 1, [EYEW]: 1, [PUPIL]: 1, [DARK]: 1, [SHELL]: 1 };
  const C_SHELL = code(SHELL), C_BACK = code(BACK), C_BACK_L = code(BACK, -1), C_FACE = code(FACE), C_RED = code(RED);
  const C_FIN = code(FIN), C_FIN_D = code(FIN, -1), C_FINR = code(RED), C_EYEW = code(EYEW), C_PUPIL = code(PUPIL), C_DARK = code(DARK), C_MOUTH = code(MOUTH);
  const M_SHELL = () => C_SHELL, M_DARK = () => C_DARK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function seg(p0, p1, rx, rz, part, grp, mat, up = [0, 0, 1]) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, up);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  /* ---------- shell: dark segmented back plate over the sage body ---------- */
  const SH_C = [-4, 0, 0], SH_R = [39, 16, 29];
  const SEGS = [-0.62, -0.3, 0.02, 0.34]; // transverse segment lines (unit-sphere x)
  function shellMat(s) {
    if (s[1] > 0.32 - 0.25 * Math.max(0, -s[0])) {
      for (const x of SEGS) if (Math.abs(s[0] - x) < 0.035) return C_BACK_L;
      return C_BACK;
    }
    return C_SHELL;
  }
  const TAIL_C = [-40, 3, 0], TAIL_R = [16, 9, 13];
  const tailMat = (s) => (s[1] > 0.3 && s[0] > -0.55 ? C_BACK : C_SHELL);

  /* ---------- head: black shield face with red leaf marks ---------- */
  const HD_C = [30, -2, 0], HD_R = [21, 14, 23];
  function headMat(mo) {
    return (s) => {
      // mouth: small slit under the nose
      if (mo > 0.04 && s[0] > 0.55 && s[1] < -0.2 && s[1] > -0.55 - 0.3 * mo && Math.abs(s[2]) < 0.2 + 0.1 * mo) return C_MOUTH;
      if (s[1] > -0.12 + 0.5 * Math.max(0, -s[0]) && Math.abs(Math.atan2(s[2], s[0])) < 1.25) {
        // red leaf marks either side of the nose ridge
        const az = Math.abs(Math.atan2(s[2], s[0])), el = s[1];
        const u = (az - 0.62) / 0.28, v = (el - 0.28) / 0.3 - u * 0.5;
        if (s[0] > 0 && u * u + v * v < 1) return C_RED;
        return C_FACE;
      }
      return C_SHELL;
    };
  }

  /* ---------- eyes: white balls with big black pupils ---------- */
  const EYE_R = 8.2;
  function eyeMat(kind, side, look) {
    return (s) => {
      const ls = [s[0], s[1], s[2] * side]; // mirrored so +z is outward on both sides
      const d = dot(ls, look);
      if (kind === 'open') return d > 0.62 ? C_PUPIL : C_EYEW;
      if (kind === 'happy') {
        // white ball with a black ^ arc
        const u = ls[2] * look[0] - ls[0] * look[2], v = ls[1] - look[1];
        return d > 0.4 && Math.abs(v - (0.28 - 0.9 * u * u)) < 0.11 && Math.abs(u) < 0.5 ? C_PUPIL : C_EYEW;
      }
      // closed / blink: sage lid over the ball, dark lash line
      const lid = kind === 'blink' ? -0.05 : 0.05;
      if (d > 0.2 && Math.abs(ls[1] - lid) < 0.1) return C_PUPIL;
      return ls[1] > lid || kind === 'blink' ? C_SHELL : C_EYEW;
    };
  }

  /* ---------- fins: white oar blades with red diamond tips (u out, v along the body) ---------- */
  function finShape(L) {
    const pts = [[0, -6.5], [0.6 * L, -6], [L, -2.2], [0.72 * L, 6.2], [0, 6.5]];
    return bakeShape({
      bb: [-0.5, -7, L + 0.5, 7],
      test: (u, v) => {
        if (!Shape2D.inPoly(u, v, pts)) return 0;
        if (u > 0.6 * L + 0.11 * L * (v + 6) / 12.4) return C_FINR;
        return Math.abs(v + 0.8 - 0.1 * u / L) < 0.5 && u > 3 && u < 0.55 * L ? C_FIN_D : C_FIN;
      },
    });
  }
  const FINS = [
    { x: 16, y: 5, a: -0.12, L: 50 },
    { x: 7, y: 6.5, a: 0.06, L: 52 },
    { x: -3, y: 8, a: 0.24, L: 47 },
    { x: -13, y: 9.5, a: 0.42, L: 41 },
  ].map((f) => Object.assign(f, { shape: finShape(f.L) }));

  /* ---------- claws: keyframes (near side, model space) ---------- */
  // shoulder (body frame) → elbow → wrist → hook tip; rest = standing on the tips
  const CL_REST = { e: [44, 32, 21], w: [47, 13, 20], t: [42, 0, 13] };
  const CL_UP = { e: [54, 48, 27], w: [70, 60, 27], t: [80, 66, 17] };

  const DEFAULT = { step: 0, clawN: 0, clawF: 0, fins: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 shell, 2 tail, 3 head, 4/5 eyes, 6/7 stalks, 10..13 near claw, 14..17 far claw, 20..27 fins, 30/31 spikes
  Object.assign(PRI, { 1: 1, 2: 0, 3: 2, 4: 4, 5: 4, 6: 3, 7: 3 });
  for (let i = 10; i < 18; i++) PRI[i] = 3;
  for (let i = 20; i < 28; i++) PRI[i] = -1;
  const SIZE = 1.08;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const st = P.step || 0;
    const bob = 1.5 * Math.abs(Math.sin(st));
    const roll = 0.04 * Math.sin(st);
    // body frame: level shell at y ≈ 46, nose tipped slightly down
    const body = chain(T(0, 46 + bob, 0), R(M3.mul(M3.rx(roll), M3.rz(-0.1))));

    // --- shell, tail cone, head
    prims.push(ellF(chain(body, T(...SH_C)), SH_R, 1, 1, shellMat));
    prims.push(ellF(chain(body, T(...TAIL_C), R(M3.rz(0.12))), TAIL_R, 2, 2, tailMat));
    const hf = chain(body, T(...HD_C), R(M3.rz(-0.12)));
    const headPrim = ellF(hf, HD_R, 3, 3, headMat(clamp(P.mouth, 0, 1)));
    prims.push(headPrim);
    // nose ridge line down the middle of the face
    headPrim.lines = [{ pts: [[0.2, 0.93, 0], [0.62, 0.62, 0], [0.9, 0.25, 0], [0.99, -0.05, 0]], mat: FACE, tone: 3 }];
    anchors.head = inF(hf, [0, 0, 0]);
    anchors.mouth = inF(hf, [HD_R[0] * 0.8, -HD_R[1] * 0.45, 0]);
    anchors.body = inF(body, SH_C);

    // --- eyes on short stalks
    const kind = P.eyes;
    const look = nrm([0.62, 0.3, 0.72]);
    for (const side of [1, -1]) {
      const base = inF(body, [30, 1, 17 * side]);
      const ec = inF(body, [32, 3, 36 * side]);
      const id = side > 0 ? 4 : 5;
      prims.push(seg(base, sub(ec, sc(nrm(sub(ec, base)), 5)), 3.6, 3.6, id + 2, id + 2, M_SHELL));
      const eye = ellF(chain(body, T(32, 3, 36 * side)), [EYE_R, EYE_R, EYE_R], id, id, eyeMat(kind, side, look));
      eye.c = inF(body, [32, 3, 36.6 * side]);
      prims.push(eye);
      anchors[side > 0 ? 'eyeN' : 'eyeF'] = inF(body, [32 + EYE_R * look[0], 3 + EYE_R * look[1], (36.6 + EYE_R * look[2]) * side]);
    }

    // --- claws (jointed sage arm, broad forearm, dark hook tip)
    for (const side of [1, -1]) {
      const raise = clamp(side > 0 ? P.clawN : P.clawF, 0, 1);
      const ph = st + (side > 0 ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(ph)) * 7 * (1 - raise);
      const swing = Math.cos(ph) * 6 * (1 - raise) * (st ? 1 : 0);
      const k = (key) => [key[0], key[1], key[2] * side];
      const sh = inF(body, [26, -10, 10 * side]);
      const mv = (p, w) => add(p, [swing * w, lift * w, 0]);
      const e = mv(lerp3(k(CL_REST.e), k(CL_UP.e), raise), 0.6);
      const w = mv(lerp3(k(CL_REST.w), k(CL_UP.w), raise), 1);
      const t = mv(lerp3(k(CL_REST.t), k(CL_UP.t), raise), 1);
      const b = side > 0 ? 10 : 14;
      prims.push(seg(sh, e, 4.6, 4.6, b, b, M_SHELL));
      prims.push(ellF(T(...e), [5.4, 5.4, 5.4], b + 1, b + 1, M_SHELL));
      // forearm: broad, flattened across (z), bulging outward
      const fm = add(sc(add(e, w), 0.5), [0, 0, 2.5 * side]);
      prims.push(seg(sub(e, sc(nrm(sub(w, e)), 2)), add(w, sc(nrm(sub(w, e)), 2)), 6.2, 4.8, b + 2, b + 2, M_SHELL));
      prims.push(ellF(T(...fm), [4, 4, 4], b + 2, b + 2, M_SHELL));
      // hook tip curving inward
      const hm = add(lerp3(w, t, 0.45), [0, 0, 2 * side]);
      prims.push(seg(sub(w, sc(nrm(sub(hm, w)), 1)), hm, 4.8, 4.2, b + 3, b + 3, M_DARK));
      prims.push(seg(lerp3(w, hm, 0.6), t, 2.8, 2.4, b + 3, b + 3, M_DARK));
      anchors[side > 0 ? 'clawN' : 'clawF'] = t;
    }

    // --- fins: fan of four white oars per side; `fins` beats them up/down
    const beat = clamp(P.fins, -1, 1) * 0.6 - 0.1;
    FINS.forEach((fn, i) => {
      for (const side of [1, -1]) {
        const root = [fn.x, fn.y, 23 * side];
        const ang = beat * (1 - i * 0.08) + 0.28; // dihedral + beat (radians, up)
        // u: outward (with backward sweep and the dihedral), v: forward in the fin plane
        // (the pointed red tip trails toward −v), w: normal
        const out = nrm([-Math.sin(fn.a), 0, Math.cos(fn.a) * side]);
        const U = nrm(add(sc(out, Math.cos(ang)), [0, Math.sin(ang), 0]));
        const V0 = nrm(sub([1, 0, 0], sc(U, U[0]))), W0 = cross(U, V0);
        // twist about the long axis (leading edge down) so the blades show their faces to the camera
        const tw = -0.48 * side;
        const V = add(sc(V0, Math.cos(tw)), sc(W0, Math.sin(tw)));
        const id = 20 + i + (side > 0 ? 0 : 4);
        prims.push(PL(inF(body, root), M3.mul(body.L, M3.cols(U, V, cross(U, V))), id, id, fn.shape, 1.6));
        if (i === 1) anchors[side > 0 ? 'finN' : 'finF'] = inF(body, add(root, sc(U, fn.L)));
      }
    });

    // --- V tail: two long dark spikes rising back
    let topY = 0, topP = null;
    for (const side of [1, -1]) {
      const r0 = inF(body, [-50, 7, 3 * side]);
      const dir = nrm(M3.v(body.L, [-0.62, 0.74, 0.24 * side]));
      const L = 44;
      const id = side > 0 ? 30 : 31;
      prims.push(seg(add(r0, sc(dir, -3)), add(r0, sc(dir, L * 0.55)), 4.2, 3.2, id, id, M_DARK));
      prims.push(seg(add(r0, sc(dir, L * 0.3)), add(r0, sc(dir, L * 0.85)), 3.3, 2.5, id, id, M_DARK));
      prims.push(seg(add(r0, sc(dir, L * 0.6)), add(r0, sc(dir, L)), 2, 1.6, id, id, M_DARK));
      const tip = add(r0, sc(dir, L));
      if (tip[1] > topY) { topY = tip[1]; topP = tip; }
    }
    anchors.tail = inF(body, [-50, 7, 0]);
    anchors.top = topP;

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const kk in anchors) anchors[kk] = sc(anchors[kk], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: SHELL, shadowSteps: 16 };
  }

  const render = (model, opt) => Creature.render(model, opt);

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 200, bh: 170, oy: 0.86 } };
})();
