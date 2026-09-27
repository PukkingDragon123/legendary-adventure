/* ------------------------------------------------------------------
   Shroomish — the Mushroom Pokémon (0.4 m ≈ 70 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a big round cream-beige mushroom
   cap that is also its head and body, dotted with round green spots
   (two big ones low on the sides by the face, smaller ones higher up and
   on the back), crowned on top by a little cluster of rounded cream
   knobs. The cap's rim spreads into a skirt of rounded scalloped lobes,
   the two at the sides sticking out like little arms, the front ones
   drooping over a stubby green body with small round green feet. A
   deadpan face on the front of the cap: a long flat brow line, two tiny
   upright dash eyes under it and a wide "^"-shaped mouth.

   Pose parameters (all optional):
     hop    0..1     one hop: crouch (squash), spring up (stretch, lobes
                     trail down), fall, land (squash); 0 = standing
     spore  0..1     cap puff: the cap swells, the crown knobs and lobes
                     flare out and a little cloud of spores rises
     step   radians  walk-cycle phase (feet alternate, waddle and bob);
                     continuous, step 0 = standing
     eyes   'open' | 'happy' | 'closed' | 'blink'
     mouth  0..1     mouth open (the "^" opens into a little dark mouth)
     tilt   −1..1    whole-body roll (+ = toward the near side), a
                     curious head tilt
     side   −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (tip of the crown), head (cap centre, front), mouth,
   eyeN, eyeF, body (cap centre), spore (above the crown: where spores
   rise from), footN / footF (front feet).
------------------------------------------------------------------- */
const Shroomish = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const CAP = 1, SPOT = 2, GREEN = 3, FACE = 4, MOUTH = 5, SPORE = 6;
  const MAT = { CAP, SPOT, GREEN, FACE, MOUTH, SPORE };
  const PAL = Creature.palette({
    [CAP]:   { r: ['#ab8b5c', '#ceb07e', '#ecd6a2', '#f8eac4', '#fff8e6'], od: '#624828', ol: '#9c7c52', ln: '#9a784c' },
    [SPOT]:  { r: ['#3e6a2a', '#528638', '#6aa048', '#86ba60', '#aad284'], od: '#1e3a14', ol: '#3a6226', ln: '#3a6226' },
    [GREEN]: { r: ['#335e22', '#44782e', '#5c963e', '#78b056', '#9ccc78'], od: '#16300e', ol: '#2e5220', ln: '#2a4c1c' },
    [FACE]:  { r: ['#3a2818', '#4a3422', '#5a422e', '#6c523a', '#806448'], od: '#24180e', ol: '#3a2818', ln: '#3a2818' },
    [MOUTH]: { r: ['#401a16', '#582420', '#70302a', '#8a4036', '#a45448'], od: '#26100c', ol: '#401a16', ln: '#401a16' },
    [SPORE]: { r: ['#b4b67a', '#d0d496', '#e8ecb4', '#f6f8d4', '#ffffff'], od: '#6a6c38', ol: '#9a9c60', ln: '#9a9c60' },
  });
  const GLOSSY = {};
  const C_CAP = code(CAP), C_SPOT = code(SPOT), C_GREEN = code(GREEN), C_MOUTH = code(MOUTH), C_SPORE = code(SPORE);
  const M_CAP = () => C_CAP, M_GREEN = () => C_GREEN, M_SPORE = () => C_SPORE;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale, dot = V3.dot, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const sph = Creature.sph;

  /* ---------- cap (head/body) with spots and the face ---------- */
  const CC = [0, 29, 0], CR = [33, 35, 33];
  const PK_Y = CR[1] - 9, PK_R = [15, 12.5, 15]; // onion peak under the crown (cap frame)
  // spots: [azimuth, height on the unit sphere, angular radius]
  const SPOTS = [[1.3, 0.34, 0.3], [-1.3, 0.34, 0.3], [0.62, 0.78, 0.14], [-0.7, 0.8, 0.13], [2.2, 0.45, 0.25], [-2.25, 0.47, 0.23],
    [Math.PI, 0.74, 0.17], [2.85, 0.2, 0.19], [-2.8, 0.18, 0.16]].map(([az, v, r]) => ({ c: sph(az, v), k: Math.cos(r) }));
  // face (unit sphere): u = s[2] / horizontal radius (toward the near side), v = s[1]
  const BROW_V = 0.6, BROW_U = 0.52, EYE_U = 0.27, EYE_V = [0.52, 0.42], M_APEX = 0.33, M_DROP = 0.44, M_W = 0.36;
  function capMat(mo) {
    return (s) => {
      if (s[1] < -0.3) return 0; // the cap is open underneath (the green body sits in it)
      for (const sp of SPOTS) if (s[0] * sp.c[0] + s[1] * sp.c[1] + s[2] * sp.c[2] > sp.k) return C_SPOT;
      if (mo > 0.03 && s[0] > 0.6) {
        // open mouth: a little dark "^"-topped opening
        const u = Math.abs(s[2]); // "^": v = apex − drop·u
        const top = M_APEX - M_DROP * u, bot = M_APEX - 0.05 - (0.05 + 0.13 * mo) * (1 - (u / 0.26) ** 2);
        if (u < 0.26 && s[1] < top && s[1] > bot) return C_MOUTH;
      }
      return C_CAP;
    };
  }
  // face lines on the unit sphere of the cap (drawn as 1-px decals, culled when facing away)
  const onCap = (u, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); const z = clamp(u, -0.99, 0.99) * c; return [Math.sqrt(Math.max(0, c * c - z * z)), v, z]; };
  const poly = (fn, a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(fn(a + ((b - a) * i) / n)); return out; };
  function faceLines(kind, mo) {
    const L = [];
    const ln = (pts) => L.push({ pts, mat: FACE, tone: 2 });
    ln(poly((u) => onCap(u, BROW_V + 0.02 * (1 - (u / BROW_U) ** 2)), -BROW_U, BROW_U, 10)); // brow
    for (const sd of [1, -1]) {
      const u0 = sd * EYE_U;
      const [va, vb] = EYE_V, vm = (va + vb) / 2;
      if (kind === 'open') ln([onCap(u0, va), onCap(u0, vb)]);
      else if (kind === 'happy') ln([onCap(u0 - 0.07, vm - 0.03), onCap(u0, vm + 0.04), onCap(u0 + 0.07, vm - 0.03)]);
      else if (kind === 'blink') ln([onCap(u0 - 0.06, vm - 0.01), onCap(u0 + 0.06, vm - 0.01)]);
      else ln([onCap(u0 - 0.07, vm + 0.02), onCap(u0, vm - 0.02), onCap(u0 + 0.07, vm + 0.02)]);
    }
    // "^" mouth
    ln([onCap(-M_W, M_APEX - M_DROP * M_W), onCap(0, M_APEX), onCap(M_W, M_APEX - M_DROP * M_W)]);
    if (mo > 0.03) ln(poly((u) => onCap(u, M_APEX - 0.05 - (0.05 + 0.13 * mo) * (1 - (u / 0.26) ** 2)), -0.25, 0.25, 6));
    return L;
  }

  /* ---------- skirt lobes and crown knobs ---------- */
  // [azimuth, droop (rad below horizontal), length, width]
  const LOBES = [[0.33, 0.78, 18, 19], [0.98, 0.7, 18, 19], [Math.PI / 2, 0.28, 23, 17], [2.2, 0.65, 18, 19], [Math.PI, 0.7, 18, 19],
    [-2.2, 0.65, 18, 19], [-Math.PI / 2, 0.28, 23, 17], [-0.98, 0.7, 18, 19], [-0.33, 0.78, 18, 19]];
  const KNOBS = [[0, 0, 0, 6, 8.8], [0.3, 6.8, 0.75, 4.8, 7.2], [1.9, 6.8, 0.75, 4.8, 6.6], [3.4, 6.8, 0.75, 4.8, 7], [4.8, 6.8, 0.75, 4.8, 6.6]]; // [az, r, tilt, radius, height]

  const DEFAULT = { hop: 0, spore: 0, step: 0, eyes: 'open', mouth: 0, tilt: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 cap, 2 + 21..24 crown knobs, 3..11 skirt lobes, 30 under-body, 31..34 feet, 40 spores
  Object.assign(PRI, { 1: 1, 2: 2, 21: 3, 22: 3, 23: 3, 24: 3, 30: -1 });
  for (let i = 3; i <= 11; i++) PRI[i] = 2;
  const SIZE = 0.885;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const hop = clamp(P.hop, 0, 1), spore = clamp(P.spore, 0, 1), st = P.step || 0, tilt = clamp(P.tilt, -1, 1);
    const mo = clamp(P.mouth, 0, 1);
    // hop: crouch → spring (stretch) → apex → fall → land (squash)
    let lift = 0, sq = 0, trail = 0;
    if (hop > 0 && hop < 1) {
      if (hop < 0.14) sq = -0.16 * Math.sin((Math.PI * hop) / 0.14);
      else if (hop > 0.86) sq = -0.16 * Math.sin((Math.PI * (1 - hop)) / 0.14);
      else {
        const u = (hop - 0.14) / 0.72;
        lift = 16 * Math.sin(Math.PI * u);
        sq = 0.12 * Math.cos(Math.PI * u) * Math.cos(Math.PI * u) * (u < 0.5 ? 1 : 0.6);
        trail = Math.cos(Math.PI * u); // + rising (lobes trail down), − falling (lobes lift)
      }
    }
    const bob = 1.2 * Math.abs(Math.sin(st));
    const roll = 0.22 * tilt + 0.07 * Math.sin(st);
    const puff = 1 + 0.08 * spore;
    const root = chain(T(0, lift + bob, 0), R(M3.rx(roll)), R(M3.diag(1 - 0.5 * sq, 1 + sq, 1 - 0.5 * sq)));
    const cap = chain(root, T(...CC), R(M3.diag(puff, puff, puff)));

    // --- cap
    const capPrim = ellF(cap, CR, 1, 1, capMat(mo));
    capPrim.faceLines = faceLines(P.eyes, mo);
    prims.push(capPrim);
    anchors.body = cap.t;
    anchors.head = inF(cap, [CR[0] * 0.75, CR[1] * 0.45, 0]);
    for (const [k, sd] of [['eyeN', 1], ['eyeF', -1]]) { const q = onCap(sd * EYE_U, (EYE_V[0] + EYE_V[1]) / 2); anchors[k] = inF(cap, [CR[0] * q[0], CR[1] * q[1], CR[2] * q[2]]); }
    { const q = onCap(0, M_APEX - 0.06); anchors.mouth = inF(cap, [CR[0] * q[0], CR[1] * q[1], CR[2] * q[2]]); }

    // gentle onion peak under the crown (same group as the cap: no contour line)
    const capM = capMat(mo);
    prims.push(ellF(chain(cap, T(0, PK_Y, 0)), PK_R, 1, 1, (q) => capM(nrm([(PK_R[0] * q[0]) / CR[0], (PK_Y + PK_R[1] * q[1]) / CR[1], (PK_R[2] * q[2]) / CR[2]]))));
    // --- crown: a little cluster of rounded knobs on top
    let top = inF(cap, [0, CR[1], 0]);
    KNOBS.forEach(([az, r, tl, kr, kh], i) => {
      const t2 = tl * (1 + 0.3 * spore);
      const base = [r * Math.cos(az), CR[1] - 1.5 - (i ? 1.8 : 0), r * Math.sin(az)];
      const f = chain(cap, T(...base), R(M3.ry(-az)), R(M3.rz(-t2)), T(0, kh * 0.55, 0));
      prims.push(ellF(f, [kr, kh, kr], i ? 20 + i : 2, i ? 20 + i : 2, M_CAP));
      const tp = inF(f, [0, kh, 0]);
      if (tp[1] > top[1]) top = tp;
    });
    anchors.top = top;
    anchors.spore = add(top, [0, 6, 0]);

    // --- skirt: rounded lobes round the rim (sides stick out like little arms)
    LOBES.forEach(([az, droop, l, w], i) => {
      const d = droop - 0.25 * trail - 0.35 * spore + 0.08 * Math.sin(st) * Math.sin(az);
      const rim = [CR[0] * 0.8 * Math.cos(az), -2, CR[2] * 0.8 * Math.sin(az)];
      const f = chain(cap, T(...rim), R(M3.ry(-az)), R(M3.rz(-d)), T(l * 0.58, 0, 0));
      prims.push(ellF(f, [l * 0.6, 5.4, w * 0.55], 3 + i, 3 + i, M_CAP));
    });

    // --- stubby green body and round feet under the skirt
    prims.push(ellF(chain(root, T(0, 16, 0)), [20, 11, 20], 30, 30, M_GREEN));
    [[9, 11.5, 0], [9, -11.5, Math.PI], [-9, 11.5, Math.PI], [-9, -11.5, 0]].forEach(([x, z, ph], i) => {
      const pl = Math.max(0, Math.sin(st + ph)) * 3.5;
      const sw = -Math.cos(st + ph) * 2.5;
      const fy = 7.5 + pl + lift * 0.96;
      prims.push(ellF(T(x + sw, fy, z), [8.5, 7.5, 8], 31 + i, 31 + i, M_GREEN));
      if (i === 0) anchors.footN = [x + sw, fy - 7, z];
      if (i === 1) anchors.footF = [x + sw, fy - 7, z];
    });

    // --- spores: a little rising cloud over the crown while puffing
    if (spore > 0.05) {
      const n = 8, g = Math.min(1, spore * 1.5);
      for (let k = 0; k < n; k++) {
        const a = k * 2.4 + 0.3, f = ((k * 37) % 8) / 8;
        const rr = (4 + 10 * spore) * (0.6 + 0.4 * f), hgt = -1 + 12 * spore * (0.35 + 0.65 * (((k * 53) % 8) / 8));
        const c = add(top, [rr * Math.cos(a), hgt, rr * Math.sin(a)]);
        const r = (1.6 + 1.6 * (((k * 29) % 5) / 5)) * g;
        prims.push(ellF(T(...c), [r, r, r], 40, 40, M_SPORE));
      }
    }

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: CAP, shadowSteps: 14 };
  }

  // decal polylines on the unit sphere of a primitive: keep only the segments facing the camera
  function cullLines(prim, view) {
    const Li = M3.inv(prim.L), out = [];
    for (const ln of prim.faceLines) {
      let run = [];
      for (const s of ln.pts) {
        const n = [Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2]];
        if (dot(n, view) / (len3(n) || 1) > 0.12) run.push(s);
        else { if (run.length > 1) out.push(Object.assign({}, ln, { pts: run })); run = []; }
      }
      if (run.length > 1) out.push(Object.assign({}, ln, { pts: run }));
    }
    prim.lines = out;
  }

  function render(model, opt) {
    const yaw = opt.yaw ?? 1.05, pitch = opt.pitch ?? 0.16;
    const view = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    for (const p of model.prims) if (p.faceLines) cullLines(p, view);
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 118, bh: 106, oy: 0.945 } };
})();
