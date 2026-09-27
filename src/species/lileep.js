/* ------------------------------------------------------------------
   Lileep — the Sea Lily Pokémon (1.0 m ≈ 175 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model): a lavender suction foot with five
   rounded toes, a thin gold ringed stalk, a round lavender cup body with
   a gold collar band and gold ring markings on its sides, a black head
   dome with two yellow oval eyes sitting in the cup's mouth, and a ring
   of eight thick pale-pink petal tentacles with darker rose tips that
   arch up and droop outward like a sea lily.

   Pose parameters (all optional):
     sway       −1..1   stalk sway (+ = lean toward the near side, z+); the
                        stalk bends progressively and the tentacles trail
     tentacles  0..1    0 = relaxed fountain, 1 = spread wide and straight
                        (reaching / grabbing)
     hide       0..1    tentacles fold up and close over the head (a bud)
     mouth      0..1    small mouth under the eyes opens
     eyes       'open' | 'happy' | 'closed' | 'blink'
     side       −1..1   ≈ cos(yaw), passed by the game (unused, accepted)

   Anchors: top (tentacle crown top), head (head dome centre), mouth,
   eyeN, eyeF, body (cup centre), stalk (stalk middle), base (foot centre),
   tipN / tipF (tips of the two front tentacles, near / far side).
------------------------------------------------------------------- */
const Lileep = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const CUP = 1, GOLD = 2, HEAD = 3, EYE = 4, TENT = 5, TIP = 6, FOOT = 7, MOUTH = 8;
  const MAT = { CUP, GOLD, HEAD, EYE, TENT, TIP, FOOT, MOUTH };
  const PAL = Creature.palette({
    [CUP]:   { r: ['#4f449a', '#6a5ec0', '#8c80dc', '#aca2ee', '#d2ccfa'], od: '#2a2266', ol: '#4c42a0', ln: '#4a4096' },
    [FOOT]:  { r: ['#5a4e9e', '#7468c2', '#9488da', '#b2a8ec', '#d4cefa'], od: '#2c2468', ol: '#4e44a0', ln: '#4e4498' },
    [GOLD]:  { r: ['#9c7a2c', '#c49c3e', '#e2c05c', '#f4dc8a', '#fff2c4'], od: '#5a400e', ol: '#8e6c22', ln: '#8a6a24' },
    [HEAD]:  { r: ['#0c0a14', '#16121e', '#221c2c', '#342c40', '#5a5068'], od: '#08060c', ol: '#16121e', ln: '#08060c' },
    [EYE]:   { r: ['#c8a420', '#e2c030', '#f6dc4e', '#fcec86', '#fff8c8'], od: '#5a4608', ol: '#8a6c10', ln: '#8a6c10' },
    [TENT]:  { r: ['#c77c90', '#e39aac', '#f6b8c4', '#fcd4dc', '#fff0f2'], od: '#7a2e48', ol: '#b0566e', ln: '#b25a72' },
    [TIP]:   { r: ['#9c2e62', '#bc427a', '#d66094', '#ea86ae', '#f8b8d0'], od: '#561238', ol: '#8a2456', ln: '#8a2456' },
    [MOUTH]: { r: ['#5a1a3a', '#782650', '#963a66', '#b0507c', '#c86a92'], od: '#300c1e', ol: '#4e1430', ln: '#4e1430' },
  });
  const GLOSSY = { [HEAD]: 1, [CUP]: 1 };
  const C_CUP = code(CUP), C_GOLD = code(GOLD), C_GOLD_D = code(GOLD, -1), C_HEAD = code(HEAD), C_EYE = code(EYE), C_EYE_L = code(EYE, 1);
  const C_TENT = code(TENT), C_TIP = code(TIP), C_FOOT = code(FOOT), C_MOUTH = code(MOUTH);
  const M_FOOT = () => C_FOOT;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 along its local y axis (model-space points)
  function seg(p0, p1, rx, rz, part, grp, mat) {
    const d = sub(p1, p0), l = len3(d);
    const Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }

  /* ---------- cup (body) ---------- */
  const CUP_C = [0, 88, 0], CUP_R = [36, 31, 36];
  const RINGS = [0.8, -0.8, 2.35, -2.35].map((a) => { const s = Creature.sph(a, -0.08); return s; });
  function cupMat(s) {
    if (s[1] > 0.9) return 0; // open mouth of the cup (the head sits inside)
    if (s[1] > 0.36 && s[1] < 0.6) return s[1] < 0.41 ? C_GOLD_D : C_GOLD; // collar band
    if (s[1] > -0.5 && s[1] < 0.34) {
      for (const q of RINGS) {
        const d = Math.acos(clamp(s[0] * q[0] + s[1] * q[1] + s[2] * q[2], -1, 1));
        if (d < 0.46) {
          if (d > 0.33) return C_GOLD;
          // inner spiral: half ring on the upper side
          if (d > 0.14 && d < 0.23 && s[1] > q[1] - 0.02) return C_GOLD;
          return C_CUP;
        }
      }
    }
    return C_CUP;
  }

  /* ---------- head dome with eyes and mouth ---------- */
  const HEAD_R = [25, 18, 25];
  const EYE_AZ = 0.42, EYE_V = 0.4;
  const E1 = Creature.sph(EYE_AZ, EYE_V), E2 = Creature.sph(-EYE_AZ, EYE_V);
  let curScale = 1;
  function headMat(kind, mo) {
    return (s) => {
      if (s[0] > 0.2) {
        const px = 1 / (curScale * HEAD_R[0]);
        for (const q of [E1, E2]) {
          // local eye coords: u across (horizontal), v up
          const side = q[2] > 0 ? 1 : -1;
          const u = (s[2] - q[2]) * side * 0.9 + (s[0] - q[0]) * -0.3 * side, v = s[1] - q[1];
          const ru = Math.max(0.19, 1.3 * px), rv = Math.max(0.27, 1.8 * px);
          if (kind === 'open' || kind === 'blink') {
            const hv = kind === 'blink' ? Math.max(0.05, 0.7 * px) : rv;
            const a = u / ru, b = (v + (kind === 'blink' ? 0.02 : 0)) / hv;
            if (a * a + b * b < 1) return kind === 'open' && a * a + (b + 0.2) * (b + 0.2) < 0.3 && curScale >= 0.8 ? C_EYE_L : C_EYE;
          } else {
            const w = Math.max(0.05, 0.75 * px);
            const a = u / (ru * 1.25);
            if (Math.abs(a) < 1) {
              const yc = kind === 'happy' ? rv * 0.5 * (1 - 1.6 * a * a) : -rv * 0.2 * (1 - a * a);
              if (Math.abs(v - yc) < w) return C_EYE;
            }
          }
        }
        if (mo > 0.04) {
          const a = s[2] / 0.16, b = (s[1] - 0.06) / (0.03 + 0.12 * mo);
          if (a * a + b * b < 1 && s[0] > 0.5) return C_MOUTH;
        }
      }
      return C_HEAD;
    };
  }

  /* ---------- foot ---------- */
  const TOES = [0, 1, 2, 3, 4].map((k) => (k * 2 * Math.PI) / 5);

  /* ---------- tentacles ---------- */
  const N_TENT = 8, TL = 72, T_R0 = 8.4, T_R1 = 7.2, TIP_T = 0.76;
  // azimuths (atan2(z, x)): front pair at ±0.62 frames the face, the rest spread round the back
  const T_AZ = [0.78, -0.78, 1.42, -1.42, 2.2, -2.2, 2.85, -2.85];
  const tentMat = (t0, t1) => (s) => {
    const t = t0 + (t1 - t0) * (s[1] * 0.5 + 0.5);
    return t > TIP_T ? C_TIP : C_TENT;
  };

  const DEFAULT = { sway: 0, tentacles: 0, hide: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // cup 1, head 2, collar lip 3, stalk 4..8, foot 9..15, tentacles 20..27
  Object.assign(PRI, { 1: 1, 2: 2, 3: 1 });
  for (let i = 20; i < 28; i++) PRI[i] = 3;
  const SIZE = 1.03;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const sway = clamp(P.sway, -1, 1), open = clamp(P.tentacles, 0, 1), hide = clamp(P.hide, 0, 1);

    // --- foot: domed base + five rounded toes
    prims.push(ellF(T(0, 15, 0), [24, 17, 24], 9, 9, M_FOOT));
    prims.push(ellF(T(0, 29, 0), [11, 9, 11], 9, 9, M_FOOT));
    TOES.forEach((a) => {
      const o = [Math.cos(a), 0, Math.sin(a)];
      const f = chain(T(o[0] * 26, 8, o[2] * 26), R(M3.ry(-a)), R(M3.rz(-0.22)));
      prims.push(ellF(f, [18, 8.5, 14.5], 9, 9, M_FOOT));
    });
    anchors.base = [0, 12, 0];

    // --- stalk: five ringed gold segments; sway bends it progressively
    const bendX = sway * 0.06, lean = 0.03; // per-segment roll (sideways) and forward lean
    let f = T(0, 30, 0);
    const SEG_L = 8;
    for (let i = 0; i < 5; i++) {
      f = chain(f, R(M3.mul(M3.rx(bendX), M3.rz(-lean))));
      const g = chain(f, T(0, SEG_L / 2, 0));
      prims.push(ellF(g, [6.2 - i * 0.2, SEG_L / 2 + 1.4, 6.2 - i * 0.2], 4 + i, 4 + i, () => (i % 2 ? C_GOLD : C_GOLD)));
      if (i === 2) anchors.stalk = inF(g, [0, 0, 0]);
      f = chain(f, T(0, SEG_L, 0));
    }
    // upper body frame at the top of the stalk (y ≈ 70), tipped a little more by the sway
    const up = chain(f, R(M3.mul(M3.rx(bendX * 1.5), M3.rz(-0.16))), T(0, -70, 0));

    // --- cup, its narrow bottom and the lip above the collar
    const cupPrim = ellF(chain(up, T(...CUP_C)), CUP_R, 1, 1, cupMat);
    prims.push(cupPrim);
    prims.push(ellF(chain(up, T(0, 64, 0)), [19, 11, 19], 1, 1, () => C_CUP));
    anchors.body = inF(up, CUP_C);

    // --- head dome, tilted forward so the face looks out
    const hf = chain(up, T(6, 118, 0), R(M3.rz(-0.34)));
    const headPrim = ellF(hf, HEAD_R, 2, 2, headMat(P.eyes, clamp(P.mouth, 0, 1)));
    prims.push(headPrim);
    anchors.head = inF(hf, [0, 0, 0]);
    anchors.eyeN = inF(hf, [HEAD_R[0] * E1[0], HEAD_R[1] * E1[1], HEAD_R[2] * E1[2]]);
    anchors.eyeF = inF(hf, [HEAD_R[0] * E2[0], HEAD_R[1] * E2[1], HEAD_R[2] * E2[2]]);
    anchors.mouth = inF(hf, [HEAD_R[0] * 0.98, HEAD_R[1] * 0.06, 0]);

    // --- tentacles: each one a smooth curve in its radial plane, elevation angle
    // th(t) = th0 + k·t² (rising, then curling over and drooping at the tip). The front
    // pair frames the face and droops over the cup; the back ones rise the highest.
    const L = TL * lerp(1, 0.9, hide);
    let top = 0;
    const NI = 16;
    for (let i = 0; i < N_TENT; i++) {
      const a = T_AZ[i];
      const o = [Math.cos(a), 0, Math.sin(a)];
      const fr = Math.max(0, Math.cos(a)); // frontness
      let th0 = lerp(1.3 - 0.85 * fr, 0.45 - 0.25 * fr, open), k = lerp(-2.5 + 0.3 * fr, -0.45, open);
      th0 = lerp(th0, 1.35, hide); k = lerp(k, 2.7, hide);
      // sway: tentacles trail against the lean (the far side droops when leaning +z)
      const trail = -sway * 0.45 * o[2];
      const root = add([0, 112, 0], sc(o, 22 - 5 * hide));
      const pts = [root];
      let p = root;
      for (let j = 1; j <= NI; j++) {
        const t = (j - 0.5) / NI;
        const th = th0 + (k + trail) * Math.pow(t, 1.5);
        p = add(p, add(sc(o, (Math.cos(th) * L) / NI), [0, (Math.sin(th) * L) / NI, 0]));
        pts.push(p);
      }
      // heavily overlapping capsules centred on every other sample: a smooth tube
      const grp = 20 + i;
      for (let j = 2; j <= NI - 2; j += 2) {
        const t = j / NI;
        const r = lerp(T_R0, T_R1, t);
        const j0 = Math.max(0, j - 4), j1 = Math.min(NI, j + 4);
        const p0 = pts[j0], p1 = pts[j1];
        const d = nrm(sub(p1, p0));
        const q0 = j0 === 0 ? sub(p0, sc(d, 3)) : p0, q1 = j1 === NI ? add(p1, sc(d, 1.5)) : p1;
        const t0 = (j0 - (j0 === 0 ? 0.7 : 0)) / NI, t1 = (j1 + (j1 === NI ? 0.3 : 0)) / NI;
        prims.push(seg(inF(up, q0), inF(up, q1), r, r, grp, grp, tentMat(t0, t1)));
        top = Math.max(top, inF(up, pts[j])[1] + r);
      }
      const tip = inF(up, pts[NI]);
      if (i === 0) anchors.tipN = tip;
      if (i === 1) anchors.tipF = tip;
    }
    anchors.top = [anchors.head[0], Math.max(top, anchors.head[1] + HEAD_R[1]), anchors.head[2]];

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const kk in anchors) anchors[kk] = sc(anchors[kk], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: CUP, shadowSteps: 18 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.0, bw: 250, bh: 230, oy: 0.9 } };
})();
