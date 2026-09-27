/* ------------------------------------------------------------------
   Taillow — the TinySwallow Pokémon (0.3 m ≈ 53 units from the feet to
   the top of the head). A posable 3D model rendered straight to pixel art
   by the shared Creature renderer.
   Model space: x = forward, y = up, z = its right side (near side at yaw 0);
   ground contact (the feet) at y = 0.

   Build: big round head and plump body in dark navy, red face mask with
   the notched crown and a red throat bib ending in a point on the white
   belly, long yellow beak (lower half opens), big black eyes with a white
   shine and a stern brow (pixel stamps), long pointed swallow wings
   (clipped flat ellipsoids, folded over the back or spread), the long
   forked tail and small yellow feet.

   Pose parameters (all optional):
     flap   -1..1   wing beat (+ up, - down); small twitch when folded
     spread  0..1   wings folded over the back -> fully spread
     bill    0..1   beak open (singing); `mouth` is accepted as an alias
     pitch  -1..1   whole-body pitch about the chest: - nose down (dive, use with spread 0), + nose up
     eyes   'open' | 'happy' | 'closed' | 'blink'
------------------------------------------------------------------- */
const Taillow = (() => {
  const { chain, T, R, F, sph, code } = Creature;

  const NAVY = 1, RED = 2, WHITE = 3, BEAK = 4, FEET = 5, MOUTH = 6, EYEK = 7, EYEW = 8;
  const MAT = { NAVY, RED, WHITE, BEAK, FEET, MOUTH, EYEK, EYEW };
  const PAL = Creature.palette({
    [NAVY]:  { r: ['#141c38', '#1e2a52', '#2b3b6e', '#40548e', '#6478b0'], od: '#0a0f22', ol: '#18223e', ln: '#111a36' },
    [RED]:   { r: ['#9a1030', '#c01c40', '#e0324f', '#f25e72', '#ff9aa6'], od: '#520616', ol: '#8a0e2a', ln: '#80102a' },
    [WHITE]: { r: ['#a0aabe', '#c8d0de', '#eceff5', '#fafbfd', '#ffffff'], od: '#404a64', ol: '#6c7690', ln: '#8690a8' },
    [BEAK]:  { r: ['#b88a0c', '#d8aa14', '#f2ca26', '#fadf64', '#fff2b0'], od: '#5c4204', ol: '#94700a', ln: '#8e6a0c' },
    [FEET]:  { r: ['#b0860e', '#d0a418', '#ecc42c', '#f8dc68', '#fff2b0'], od: '#5c4204', ol: '#8e6a0c', ln: '#8e6a0c' },
    [MOUTH]: { r: ['#56162a', '#722036', '#902e46', '#aa445a', '#c26274'], od: '#30080f', ol: '#4c1020', ln: '#46101e' },
    [EYEK]:  { r: ['#080a10', '#0c0f16', '#10141c', '#181e28', '#242c38'], od: '#040508', ol: '#040508', ln: '#040508' },
    [EYEW]:  { r: ['#dde2ec', '#f0f3f8', '#ffffff', '#ffffff', '#ffffff'], od: '#303844', ol: '#303844', ln: '#303844' },
  });
  const GLOSSY = { [NAVY]: 1, [BEAK]: 1 };

  const DEFAULT = { flap: 0, spread: 0, bill: 0, pitch: 0, eyes: 'open', side: 1 };

  /* ---------- small math helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, scl = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const P2W = (f, p) => add(f.t, M3.v(f.L, p));
  const V2W = (f, d) => M3.v(f.L, d);
  const MIRZ = M3.diag(1, 1, -1);
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  function frameY(d, hint) {
    const Y = nrm(d);
    let X = sub(hint, scl(Y, dot(hint, Y)));
    if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    X = nrm(X);
    return M3.cols(X, Y, cross(X, Y));
  }
  function frameUW(u, w) {
    const U = nrm(u);
    const W = nrm(sub(w, scl(U, dot(w, U))));
    return M3.cols(U, cross(W, U), W);
  }
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function slerpM(A, B, t) {
    const Q = M3.mul(transpose(A), B);
    const ang = Math.acos(clamp((Q[0] + Q[4] + Q[8] - 1) / 2, -1, 1));
    if (ang < 1e-5) return A;
    return M3.mul(A, rotAxis(nrm([Q[7] - Q[5], Q[2] - Q[6], Q[3] - Q[1]]), ang * t));
  }
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function segE(a, b, rx, rz, hint, part, grp, mat, ext = 1) {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]);
    return E(scl(add(a, b), 0.5), M3.mul(frameY(d, hint), M3.diag(rx, (len / 2) * ext, rz)), part, grp, mat);
  }
  const C = (m, b = 0) => code(m, b);
  const M_FEET = () => C(FEET);

  /* ---------- proportions ---------- */
  const HEAD_R = [15.4, 14.6, 14.6];
  const EYE_AZ = 0.86, EYE_V = 0.22;

  // head: red mask over the face and forehead (a crown patch with a navy notch), navy on top/back
  // and behind the eyes; the red continues under the beak into the throat
  function headMat(s) {
    const r = Math.hypot(s[0], s[2]) || 1e-6;
    const c = s[0] / r; // cos of the azimuth from the front
    // front mask: widest below the eyes, narrowing over the forehead
    if (c > 0.8 - 0.25 * Math.max(0, -s[1]) && s[1] < 0.62) return C(RED);
    // forehead crown patch reaching up over the top, notched on its right
    if (s[1] > 0.3 && s[0] > 0.02 - 0.1 * s[1] && Math.abs(s[2]) < 0.34 + 0.35 * s[0]) return C(RED);
    // throat
    if (s[1] < -0.3 && c > 0.2) return C(RED);
    return C(NAVY);
  }
  // body: red bib at the throat ending in a point, white belly, navy back
  function bodyMat(s) {
    if (s[0] > 0.1) {
      const w = Math.abs(s[2]);
      if (s[1] > -0.1 + 1.4 * w * w && s[0] > 0.35) return C(RED);
      if (s[1] < 0.55 && s[0] > 0.2 - 0.3 * Math.max(0, -s[1])) return C(WHITE);
    }
    if (s[1] < -0.4 && s[0] > -0.55) return C(WHITE);
    return C(NAVY);
  }
  // long pointed swallow wing (clipped flat ellipsoid; y = along, x = chord (+ leading edge))
  function wingMat(s) {
    const u = s[1], v = s[0];
    if (u > 0.2) {
      // taper the outer half to a sharp point: the trailing edge sweeps up to the tip
      const k = (u - 0.2) / 0.8;
      const lim = -Math.sqrt(Math.max(0, 1 - u * u)) + k * k * 0.9 * Math.sqrt(Math.max(0, 1 - u * u));
      if (v < lim) return 0;
    }
    return C(NAVY);
  }
  // forked tail feather (plate): long pointed blade
  const TAILF = bakeShape(Shape2D.poly([[0, -3.0], [9, -3.2], [18, -2.4], [26, -0.8], [31, 0.6], [24, 2.0], [15, 2.8], [7, 3.1], [0, 2.8]], C(NAVY), 8));

  /* ---------- eye stamps: k = black, w = white; the brow is a black row on top ---------- */
  const EYES_L = {
    open: ['kkkkkk..', 'kwwkkkkk', 'wwkkwkkk', 'wwkkkkkk', 'wwkkkkkk', '.wwkkkk.', '..kkkk..'],
    openN: ['kkkkk.', 'wwkkkk', 'wkkwkk', 'wkkkkk', '.wkkk.', '..kk..'],
    openF: ['kkk.', 'kwkk', 'kkkk', '.kk.'],
    happy: ['.kkkkkk.', 'k......k', 'k......k'],
    happyN: ['.kkk.', 'k...k'],
    happyF: ['kk.', '..k'],
    closed: ['k......k', '.kkkkkk.'],
    closedN: ['k...k', '.kkk.'],
    closedF: ['k.', '.k'],
    blink: ['kkkkkkkk', '.kkkkkk.'],
    blinkN: ['kkkkk', '.kkk.'],
    blinkF: ['kkk'],
  };
  const EYES_S = {
    open: ['kkk', 'wkk', 'wkk'], openN: ['kkk', 'wkk', 'kkk'], openF: ['kk', 'kk'],
    happy: ['.k.', 'k.k'], happyN: ['.k.', 'k.k'], happyF: ['k.', '.k'],
    closed: ['k.k', '.k.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['kkk'], blinkN: ['kkk'], blinkF: ['kk'],
  };
  const mirror = (set) => { const o = {}; for (const k in set) o[k] = set[k].map((r) => r.split('').reverse().join('')); return o; };
  const EYES_LM = mirror(EYES_L), EYES_SM = mirror(EYES_S);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const sp = clamp(+P.spread || 0, 0, 1), fl = clamp(+P.flap || 0, -1, 1);
    const bo = clamp(+((pose && pose.bill !== undefined ? pose.bill : pose && pose.mouth !== undefined ? pose.mouth : 0)) || 0, 0, 1);
    const prims = [];
    const pt = clamp(+P.pitch || 0, -1, 1);
    const root = chain(T(0, 22, 0), R(M3.rz(-sp * 0.1 + pt * (pt < 0 ? 0.75 : 0.45))), T(0, -22, 0));

    // --- body + head
    const bodyF = chain(root, T(-3, 19, 0), R(M3.rz(0.22)));
    prims.push(ellF(bodyF, [18.5, 15.2, 15.4], 1, 1, bodyMat));
    const headF = chain(root, T(5, 33.6, 0), R(M3.rz(-bo * 0.08)));
    const headPrim = ellF(headF, HEAD_R, 2, 1, headMat);
    prims.push(headPrim);

    // --- beak: long pointed yellow bill; the lower half opens
    const hinge = chain(headF, T(13.2, -2.4, 0));
    const ub = chain(hinge, R(M3.rz(bo * 0.2)));
    prims.push(ellF(chain(ub, T(7.6, 0.5, 0), R(M3.rz(-0.07))), [10.2, 2.1, 2.9], 3, 3, () => C(BEAK)));
    const lb = chain(hinge, R(M3.rz(-0.06 - bo * 0.5)));
    prims.push(ellF(chain(lb, T(6.6, -1.1, 0)), [8.6, 1.4, 2.4], 4, 3, () => C(BEAK, -1)));
    if (bo > 0.05) prims.push(ellF(chain(hinge, T(3.5, -1.2, 0), R(M3.rz(-bo * 0.2))), [4.4, 1.2 + bo * 1.2, 2.6], 5, 5, () => C(MOUTH)));

    // --- wings: long pointed blades folded over the back (crossing above the tail) or spread
    const tips = [];
    for (const side of [1, -1]) {
      const Rf = M3.mul(M3.rx(-fl * 0.12), frameUW([-0.95, -0.24, 0.16], [0.1, 0.3, 1]));
      const Rs = M3.mul(M3.rx(-fl * 0.9), frameUW([-0.3, 0.22, 1], [0.38, 0.92, -0.05]));
      let Rw = slerpM(Rf, Rs, sp);
      let sh = [lerp(1, 2.5, sp), lerp(29, 30, sp), lerp(12.2, 9, sp)];
      if (side < 0) { Rw = M3.mul(MIRZ, M3.mul(Rw, MIRZ)); sh = [sh[0], sh[1], -sh[2]]; }
      const wf = chain(root, F(Rw, sh));
      const L = M3.mul(wf.L, M3.mul(M3.cols([0, 1, 0], [1, 0, 0], [0, 0, 1]), M3.diag(lerp(10.4, 7.8, sp), lerp(21, 22, sp), 2.3)));
      prims.push(E(P2W(wf, [lerp(18.5, 20, sp), 0, side * 0.6]), L, side > 0 ? 6 : 7, side > 0 ? 6 : 7, wingMat));
      tips.push(P2W(wf, [lerp(39, 42, sp), 0, 0]));
    }

    // --- forked tail: two long blades rising behind
    const tailBase = P2W(bodyF, [-15.5, 3, 0]);
    for (const [k, ang, len] of [[1, 0.66, 1.3], [-1, 0.44, 1.22]]) {
      const d = V2W(root, nrm([-Math.cos(ang), Math.sin(ang), k * 0.16]));
      const v = V2W(root, nrm([0, 0, 1]));
      const vv = nrm(sub(v, scl(d, dot(v, d))));
      prims.push({ kind: 'plate', part: 8, grp: 8, c: tailBase, L: M3.cols(scl(d, len), nrm(cross(vv, d)), vv), shape: TAILF, thick: 1.8 });
    }

    // --- small yellow feet (three toes forward, one back)
    const feet = [];
    for (const side of [1, -1]) {
      const ankle = [3, 2.2, side * 6.5];
      prims.push(segE(P2W(bodyF, [4, -12, side * 6]), ankle, 1.7, 1.7, [1, 0, 0], 9, 9, M_FEET));
      for (const [a, len] of [[0.35, 4.6], [0, 5], [-0.35, 4.6], [Math.PI, 3.4]]) {
        const d = nrm([Math.cos(a), -0.3, Math.sin(a) * 0.9]);
        prims.push(segE(ankle, add(ankle, scl(d, len)), 1.0, 1.0, [0, 1, 0], 9, 9, M_FEET, 1.1));
      }
      feet.push(ankle);
    }

    // --- eyes and anchors
    const onHead = (az, v) => { const s = sph(az, v); return { p: P2W(headF, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s }; };
    const eyeN = onHead(EYE_AZ, EYE_V), eyeF = onHead(-EYE_AZ, EYE_V);
    const flip = (P.side ?? 1) < 0;
    const kind = P.eyes === 'happy' || P.eyes === 'closed' || P.eyes === 'blink' ? P.eyes : 'open';
    const stamps = [
      { at: Object.assign({ prim: headPrim }, eyeN), set: null, kind, flip, far: 0.45, near: 0.72 },
      { at: Object.assign({ prim: headPrim }, eyeF), set: null, kind, flip, far: 0.45, near: 0.72 },
    ];
    const anchors = {
      top: P2W(headF, [0, HEAD_R[1], 0]),
      head: headF.t,
      mouth: P2W(hinge, [4, -1, 0]),
      beak: P2W(ub, [14, 0.4, 0]),
      eyeN: eyeN.p, eyeF: eyeF.p,
      body: bodyF.t,
      wingTipN: tips[0], wingTipF: tips[1],
      tail: add(tailBase, V2W(root, [-31, 24, 0])),
      feet: scl(add(feet[0], feet[1]), 0.5),
    };
    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 3: 2, 5: 1, 6: 2, 7: 2, 8: 0, 9: 1 },
      glossy: GLOSSY, baseMat: NAVY, shadowSteps: 12,
    };
  }

  function render(model, opt) {
    const pal = opt.pal || PAL;
    const big = (opt.scale || 1) >= 0.8;
    const colors = { k: pal[EYEK].r[1], w: pal[EYEW].r[2] };
    for (const st of model.stamps) {
      st.set = st.flip ? (big ? EYES_LM : EYES_SM) : big ? EYES_L : EYES_S;
      st.colors = colors;
      st._c = null;
    }
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.3, bw: 116, bh: 92, oy: 0.86 } };
})();
