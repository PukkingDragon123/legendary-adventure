/* ------------------------------------------------------------------
   Zigzagoon — the TinyRaccoon Pokémon (0.4 m ≈ 70 units tall at scale 1,
   tail included). A posable 3D model rendered straight to pixel art by
   the shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / HOME model, Hoenn form): a long, low, shaggy
   raccoon. Bristly fur in alternating grey-brown and cream bands with
   zig-zag edges runs across the body (head brown, then cream, brown,
   cream, brown rump) and on into a big bushy tail swept up and back
   (cream, brown, cream tip). The band edges and the whole silhouette are
   jagged with pointed fur tufts (flat cards that turn to the camera, see
   render()). A big brown head with small pointed ears, a black raccoon
   mask across the eyes, round brown eyes with a white glint, a short
   brown muzzle with a black button nose and a small zig-zag mouth; four
   very short cream legs with pale paws.

   Pose parameters (all optional):
     step   radians  walk/run phase: diagonal trot, body bob and the
                     zig-zag sway (the body swings side to side, the head
                     counter-turns); continuous, step 0 = a relaxed stance
                     with every paw down
     sniff  0..1     head down, nose to the ground (sniffing a trail)
     tail   −1..1    tail wag (+ = toward the near side)
     mouth  0..1     jaw open
     eyes   'open' | 'happy' | 'closed' | 'blink'
     lean   −1..1    body pitch (+ = nose up / rearing, − = crouched forward)
     side   −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (highest tuft of the back/tail), head (head centre), mouth
   (under the nose), nose (nose tip), eyeN, eyeF, body (torso centre),
   tail (tail tip), earN / earF (ear tips), pawN / pawF (front paws).
------------------------------------------------------------------- */
const Zigzagoon = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const FUR = 1, CREAM = 2, MASK = 3, NOSE = 4, IRIS = 5, GLINT = 6, PAW = 7, MOUTH = 8, TONGUE = 9, LID = 10;
  const MAT = { FUR, CREAM, MASK, NOSE, IRIS, GLINT, PAW, MOUTH, TONGUE, LID };
  const PAL = Creature.palette({
    [FUR]:    { r: ['#46362c', '#5e4a3c', '#7a6350', '#98806a', '#b8a08a'], od: '#281a12', ol: '#523e30', ln: '#3e2e22' },
    [CREAM]:  { r: ['#a09882', '#c4bca4', '#e6e0ca', '#f5f2e3', '#ffffff'], od: '#544a3a', ol: '#8a7e6a', ln: '#857964' },
    [PAW]:    { r: ['#9a9282', '#bab3a2', '#d8d2c2', '#ebe7dc', '#faf8f2'], od: '#4c4436', ol: '#827a6a', ln: '#827a6a' },
    [MASK]:   { r: ['#0b0909', '#131010', '#1b1716', '#262120', '#3c3431'], od: '#060404', ol: '#0b0909', ln: '#060404' },
    [NOSE]:   { r: ['#0a0808', '#121010', '#1c1818', '#2e2826', '#9a9290'], od: '#060404', ol: '#0b0909', ln: '#060404' },
    [IRIS]:   { r: ['#5e3412', '#7c4818', '#9c6226', '#bc8038', '#d8a058'], od: '#2a1406', ol: '#5a3210', ln: '#4a2a0e' },
    [GLINT]:  { r: ['#e8e4e0', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8078', ol: '#c8c0b8', ln: '#c8c0b8' },
    [MOUTH]:  { r: ['#3a1016', '#521a22', '#6e2630', '#8a3440', '#a44a52'], od: '#240a0e', ol: '#3a1016', ln: '#3a1016' },
    [TONGUE]: { r: ['#a8465a', '#c85c6e', '#e47886', '#f496a0', '#ffbcc2'], od: '#5a1828', ol: '#8a2c3c', ln: '#8a2c3c' },
    [LID]:    { r: ['#5a4a40', '#6e5c50', '#86725f', '#9c8874', '#b09c88'], od: '#2a2018', ol: '#4a3a30', ln: '#4a3a30' },
  });
  const GLOSSY = { [NOSE]: 1, [IRIS]: 1 };
  const C_FUR = code(FUR), C_CREAM = code(CREAM), C_MASK = code(MASK), C_NOSE = code(NOSE), C_IRIS = code(IRIS);
  const C_GLINT = code(GLINT), C_PAW = code(PAW), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_LID = code(LID);
  const M_PAW = () => C_PAW, M_NOSE = () => C_NOSE;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
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
  const tri = (x) => { const f = x - Math.floor(x); return Math.abs(f - 0.5) * 4 - 1; }; // −1..1 zig-zag

  /* ---------- zig-zag fur bands ---------- */
  // torso (body frame): brown neck | cream | brown | cream | brown rump; edges slanted (tops
  // further forward) and zig-zagged; the fur tufts growing near each edge add bigger teeth
  const TC = [-4, 27, 0], TR = [33, 21, 19.5];
  const SLANT = 0.55, EDGES = [19, 5, -9, -23];
  const bandT = (p) => p[0] - SLANT * (p[1] - TC[1]) + 4.6 * tri(p[1] / 9.5 + Math.abs(p[2]) / 11);
  const bandOf = (t) => (t > EDGES[0] ? 0 : t > EDGES[1] ? 1 : t > EDGES[2] ? 0 : t > EDGES[3] ? 1 : 0);
  const bodyMat = (s) => (bandOf(bandT([TC[0] + TR[0] * s[0], TC[1] + TR[1] * s[1], TC[2] + TR[2] * s[2]])) ? C_CREAM : C_FUR);
  // tail bands along the tail axis (a = 0 at the root, 1 at the tip): cream | brown | cream tip
  const TAIL_L = 46, TEDGE = [0.33, 0.64];
  const tailBandOf = (t) => (t < TEDGE[0] ? 1 : t < TEDGE[1] ? 0 : 1);

  /* ---------- pointed fur tufts: flat cards turned to the camera in render() ---------- */
  const SPK_L = 10, SPK_W = 3.6;
  const spikeShape = (m) => bakeShape({
    bb: [-2.5, -SPK_W - 0.5, SPK_L + 0.5, SPK_W + 0.5],
    test: (u, v) => {
      if (u < -2.5 || u > SPK_L) return 0;
      const hw = u < 0 ? SPK_W : SPK_W * Math.pow((SPK_L - u) / SPK_L, 0.8);
      return Math.abs(v) < hw ? m : 0;
    },
  });
  const SPK = { [FUR]: spikeShape(C_FUR), [CREAM]: spikeShape(C_CREAM) };
  // tuft at `root` along `dir`; `out` = surface normal at the root (drives its shading)
  function tuft(list, prims, root, dir, out, len, w, grp, m) {
    const U = nrm(dir);
    const pr = { kind: 'plate', part: grp, grp, c: root, L: null, shape: SPK[m], thick: 1.2 };
    prims.push(pr);
    list.push({ pr, U, out: nrm(out), len, w, tip: add(root, sc(U, len)) });
  }
  // Tufts are flat cards: turn each about its own axis to face the camera, tilted toward the
  // surface normal at its root so it shades like the fur it grows from. Tufts seen face-on sit
  // inside the silhouette, so they are shortened (they would only clutter the bands); the
  // side-on ones make the spiky outline and keep their full length.
  function orientTufts(tufts, yaw, pitch) {
    const view = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    for (const t of tufts) {
      const U = t.U;
      const k = Math.abs(dot(t.out, view));
      const f = k < 0.45 ? 1 : k > 0.8 ? 0.55 : 1 - ((k - 0.45) / 0.35) * 0.45;
      let n = add(view, sc(t.out, 0.8));
      for (let i = 0; i < 4; i++) {
        n = sub(n, sc(U, dot(n, U)));
        const l = len3(n);
        if (l > 1e-3 && dot(n, view) / l > 0.4) break;
        n = add(n, view);
      }
      if (len3(n) < 1e-3) n = cross(U, [0, 1, 0]);
      n = nrm(n);
      const V = cross(n, U);
      t.pr.L = M3.cols(sc(U, (t.len * f) / SPK_L), sc(V, (t.w * (0.5 + 0.5 * f)) / SPK_W), n);
    }
  }

  /* ---------- head with mask and eyes ---------- */
  const HR = [20, 20.5, 20.5];
  const EAZ = 0.74, EV = 0.2;
  const EC = [1, -1].map((sd) => Creature.sph(sd * EAZ, EV));
  // raccoon mask: a band across the bridge of the muzzle through both eyes (head-frame units)
  function inMask(p) {
    const az = Math.atan2(Math.abs(p[2]), p[0]);
    const yc = HR[1] * (0.19 + 0.07 * Math.cos(az));
    const a = az / 1.3, b = (p[1] - yc) / (HR[1] * 0.33);
    return a * a * a * a * a * a + b * b < 1;
  }
  let curScale = 1;
  function eyePix(s, kind) {
    const sd = s[2] > 0 ? 0 : 1, q = EC[sd];
    const az = Math.abs(Math.atan2(q[2], q[0]));
    const fw = [Math.sin(az), 0, (sd ? 1 : -1) * Math.cos(az)]; // tangent toward the front
    const u = (s[0] - q[0]) * fw[0] + (s[2] - q[2]) * fw[2], v = s[1] - q[1];
    const px = 1 / (curScale * HR[1]);
    const ru = Math.max(0.27, 1.75 * px), rv = Math.max(0.3, 1.9 * px);
    if (kind === 'open') {
      const a = u / ru, b = v / rv, r = a * a + b * b;
      if (r >= 1) return 0;
      const ga = (u - 0.3 * ru) / Math.max(0.3 * ru, 0.62 * px), gb = (v - 0.34 * rv) / Math.max(0.3 * rv, 0.62 * px);
      if (ga * ga + gb * gb < 1) return C_GLINT;
      const pr = Math.max(0.5, (1.05 * px) / ru);
      return r < pr * pr ? C_MASK : C_IRIS;
    }
    const w = Math.max(0.05, 0.75 * px), a = u / (ru * 1.15);
    if (Math.abs(a) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = rv * 0.5 * (1 - 1.7 * a * a);
    else if (kind === 'blink') yc = -rv * 0.2;
    else yc = -rv * 0.25 * (1 - a * a);
    return Math.abs(v - yc) < w ? C_LID : 0;
  }
  const headMat = (kind) => (s) => {
    const p = [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]];
    if (!inMask(p)) return C_FUR;
    return eyePix(s, kind) || C_MASK;
  };
  // muzzle: brown, the mask runs over its root
  const SN_C = [15.5, -7, 0], SN_R = [10.2, 8.4, 9.2];
  const snoutMat = (s) => {
    const p = [SN_C[0] + SN_R[0] * s[0], SN_C[1] + SN_R[1] * s[1], SN_C[2] + SN_R[2] * s[2]];
    return p[0] < HR[0] - 1 && inMask(p) ? C_MASK : C_FUR;
  };
  // small zig-zag mouth line on the muzzle (muzzle unit-sphere coordinates)
  const MOUTH_LINE = [[0.35, -0.72, 0.58], [0.6, -0.5, 0.52], [0.72, -0.66, 0.22], [0.86, -0.46, 0], [0.72, -0.66, -0.22], [0.6, -0.5, -0.52], [0.35, -0.72, -0.58]].map((p) => nrm(p));

  /* ---------- legs ---------- */
  const LEGS = [
    { hip: [20, 9, 9], ph: 0 }, { hip: [20, 9, -9], ph: Math.PI },
    { hip: [-25, 9, 10], ph: Math.PI }, { hip: [-25, 9, -10], ph: 0 },
  ];

  /* ---------- fur tuft layout on the torso (body frame) ---------- */
  // rows of tufts lying back along the fur: a spiky dorsal ridge, a row high on each flank
  // and a fringe under the belly; each takes the colour of the band it grows from, so the
  // tufts at a band edge make the big teeth of the zig-zag
  const BODY_TUFTS = (() => {
    const out = [];
    const push = (x, th, lift, l, w) => {
      const r = Math.sqrt(Math.max(0.04, 1 - ((x - TC[0]) / TR[0]) ** 2));
      const s = [(x - TC[0]) / TR[0], r * Math.cos(th), r * Math.sin(th)];
      const n = nrm([s[0] / TR[0], s[1] / TR[1], s[2] / TR[2]]);
      const p = [TC[0] + TR[0] * s[0], TC[1] + TR[1] * s[1], TC[2] + TR[2] * s[2]];
      const back = nrm(sub([-1, 0, 0], sc(n, -n[0])));
      const d = nrm(add(back, sc(n, lift)));
      out.push({ p: add(p, sc(n, -1.5)), d, n, l, w, m: bandOf(bandT(p)) ? CREAM : FUR });
    };
    for (let x = 21; x >= -36; x -= 8.2) push(x, 0, 1.15, x > 16 ? 13 : 17, 7);
    for (const sd of [1, -1]) {
      for (let x = 17; x >= -34; x -= 10) push(x - 2, 0.85 * sd, 0.9, 13.5, 6);
      for (let x = 12; x >= -34; x -= 11) push(x - 4, 2.4 * sd, 0.75, 11, 5.4);
    }
    return out;
  })();

  const DEFAULT = { step: 0, sniff: 0, tail: 0, mouth: 0, eyes: 'open', lean: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 muzzle, 4 nose, 5 jaw, 6 mouth, 7 ears, 8 tail, 9 tail tufts, 10..13 legs,
  // 20 body tufts, 22 head tufts
  Object.assign(PRI, { 2: 2, 3: 3, 4: 4, 5: 2, 6: 1, 7: 1, 22: 1 });
  const SIZE = 0.78;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, tufts = [];
    const st = P.step || 0, sn = clamp(P.sniff, 0, 1), wag = clamp(P.tail, -1, 1), mo = clamp(P.mouth, 0, 1);
    const lean = clamp(P.lean, -1, 1);
    const bob = 1.6 * Math.abs(Math.sin(st));
    const sway = 0.16 * Math.sin(st);
    const pitch = 0.24 * lean - 0.08 * sn + 0.03 * Math.sin(2 * st);
    const body = chain(T(0, bob, 0), T(-2, 16, 0), R(M3.ry(sway)), R(M3.rz(pitch)), T(2, -16, 0));

    // --- torso + its fur tufts
    prims.push(ellF(chain(body, T(...TC)), TR, 1, 1, bodyMat));
    anchors.body = inF(body, TC);
    for (const t of BODY_TUFTS) tuft(tufts, prims, inF(body, t.p), dirF(body, t.d), M3.v(body.L, t.n), t.l, t.w, 20, t.m);

    // --- head (turns against the sway, dips to sniff)
    let hf = chain(body, T(34 + 3 * sn, 27.5 - 6 * sn, 0), R(M3.ry(-sway * 1.4)), R(M3.rz(-0.55 * sn - 0.1 * lean + 0.04 * Math.sin(2 * st))));
    // never push the muzzle into the ground (sniffing while crouched forward)
    const low = Math.min(inF(hf, [SN_C[0], SN_C[1] - SN_R[1], 0])[1], inF(hf, [25.4, -8.7, 0])[1], inF(hf, [3, -HR[1] + 0.5, 0])[1]) - (mo > 0.03 ? 4 * mo : 0);
    if (low < 1.2) hf = chain(T(0, 1.2 - low, 0), hf);
    const headPrim = ellF(hf, HR, 2, 2, headMat(P.eyes));
    prims.push(headPrim);
    anchors.head = hf.t;
    for (const [k, q] of [['eyeN', EC[0]], ['eyeF', EC[1]]]) anchors[k] = inF(hf, [HR[0] * q[0], HR[1] * q[1], HR[2] * q[2]]);
    const snout = ellF(chain(hf, T(...SN_C)), SN_R, 3, 3, snoutMat);
    snout.lines = [{ pts: MOUTH_LINE, mat: FUR, useLn: true }];
    prims.push(snout);
    prims.push(ellF(chain(hf, T(25.4, -5.4, 0)), [3.8, 3.3, 4.8], 4, 4, M_NOSE));
    anchors.nose = inF(hf, [29, -5.4, 0]);
    anchors.mouth = inF(hf, [22, -13.2, 0]);
    // jaw + mouth interior
    if (mo > 0.03) {
      const jf = chain(hf, T(7.5, -11.8, 0), R(M3.rz(-0.55 * mo)));
      prims.push(ellF(chain(jf, T(9.5, -1, 0)), [10, 4, 7.4], 5, 5, (s) => (s[1] > 0.55 && s[0] > -0.4 ? C_TONGUE : C_FUR)));
      prims.push(ellF(chain(hf, T(15, -11.2, 0)), [8, 2 + 4 * mo, 6.4], 6, 6, () => C_MOUTH));
    }
    // ears: small pointed brown tufts on top of the head
    for (const sd of [1, -1]) {
      const root = inF(hf, [0.5, 15, 9 * sd]);
      const d = dirF(hf, [-0.15, 1, 0.5 * sd]);
      tuft(tufts, prims, root, d, dirF(hf, [0.3, 0.6, 0.75 * sd]), 13, 6.2, 7, FUR);
      anchors[sd > 0 ? 'earN' : 'earF'] = add(root, sc(d, 13));
    }
    // head tufts: crown, back of the head and shaggy cheeks (they fringe the cream neck band)
    tuft(tufts, prims, inF(hf, [-7.5, 14.4, 0]), dirF(hf, [-0.9, 1, 0]), dirF(hf, [-0.3, 1, 0]), 12, 5.4, 22, FUR);
    for (const sd of [1, -1]) {
      tuft(tufts, prims, inF(hf, [-8.6, 10.7, 9.6 * sd]), dirF(hf, [-1, 0.6, 0.35 * sd]), dirF(hf, [-0.4, 0.6, 0.7 * sd]), 10, 5, 22, FUR);
      tuft(tufts, prims, inF(hf, [-8.6, -1.1, 13.9 * sd]), dirF(hf, [-1, 0.05, 0.45 * sd]), dirF(hf, [-0.3, 0, 1 * sd]), 10, 5, 22, FUR);
      tuft(tufts, prims, inF(hf, [-3.2, -11.2, 12.3 * sd]), dirF(hf, [-0.7, -0.75, 0.4 * sd]), dirF(hf, [0, -0.6, 0.8 * sd]), 11, 5, 22, FUR);
      tuft(tufts, prims, inF(hf, [6.4, -13.4, 10.7 * sd]), dirF(hf, [-0.3, -1, 0.45 * sd]), dirF(hf, [0.3, -0.7, 0.6 * sd]), 9, 4.2, 22, FUR);
    }

    // --- legs: brown upper leg hidden in the fur, short cream lower leg and paw (diagonal trot)
    LEGS.forEach((lg, i) => {
      const ph = st + lg.ph;
      // continuous in `step`: step 0 is a staggered stance with every paw down
      const swing = -Math.cos(ph) * 5.5;
      const lift = Math.max(0, Math.sin(ph)) * 4;
      const hip = inF(body, lg.hip);
      const foot = [lg.hip[0] + swing, 2.5 + lift, lg.hip[2] * 1.1];
      const id = 10 + i;
      prims.push(seg(hip, add(foot, [0, 1.5, 0]), 3.5, 3.4, id, id, M_PAW));
      const paw = ellF(T(foot[0] + 1.4, foot[1], foot[2]), [4.4, 2.5, 3.6], id, id, M_PAW);
      paw.lines = [-0.35, 0.35].map((w) => ({ pts: [[0.93 * Math.sqrt(1 - w * w), 0.1, w], [0.8 * Math.sqrt(1 - w * w), -0.55, w]], mat: PAW, useLn: true }));
      prims.push(paw);
      if (i === 0) anchors.pawN = [foot[0] + 3, foot[1], foot[2]];
      if (i === 1) anchors.pawF = [foot[0] + 3, foot[1], foot[2]];
    });

    // --- tail: big bushy plume swept up and back, banded, ringed with tufts
    const tw = 0.62 * wag + 0.14 * Math.sin(st);
    const tf = chain(body, T(-33, 33, 0), R(M3.ry(tw)), R(M3.rz(Math.PI - 0.45 + 0.1 * lean - 0.05 * Math.sin(2 * st))), R(M3.rx(0.15 * wag)));
    const tailMat = (x0, rx) => (s) => (tailBandOf((x0 + rx * s[0]) / TAIL_L + 0.06 * tri(s[1] * 1.3 + s[2])) ? C_CREAM : C_FUR);
    for (const [x, rx, rr] of [[8, 11, 12.5], [20, 12, 16.5], [32, 12, 18.5], [42, 8, 14]])
      prims.push(ellF(chain(tf, T(x, 0, 0)), [rx, rr, rr], 8, 8, tailMat(x, rx)));
    // tufts: rings pointing out and back; the rings just in front of each band edge make its teeth
    const rings = [[6, 11.5, 5, 0.4, 0.9, 13, CREAM], [TEDGE[0] * TAIL_L - 2, 15, 6, 0, 0.5, 12, CREAM], [22, 16.5, 6, 0.5, 0.95, 16, FUR],
      [TEDGE[1] * TAIL_L - 2, 18, 7, 0.2, 0.5, 13, FUR], [37, 17, 7, 0.75, 0.95, 16, CREAM]];
    for (const [x, r, n, a0, lift, l, m] of rings)
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2;
        const rad = [0, Math.cos(a), Math.sin(a)];
        const root = inF(tf, [x, rad[1] * r * 0.8, rad[2] * r * 0.8]);
        const d = dirF(tf, [1, rad[1] * lift, rad[2] * lift]);
        tuft(tufts, prims, root, d, dirF(tf, rad), l, 6.6, 9, m);
      }
    for (const [dy, dz] of [[0, 0], [0.7, 0.25], [-0.65, -0.3], [0.15, -0.75], [-0.15, 0.75]])
      tuft(tufts, prims, inF(tf, [42, dy * 10, dz * 10]), dirF(tf, [1, dy, dz]), dirF(tf, [0.6, dy, dz]), 14, 7, 9, CREAM);
    anchors.tail = inF(tf, [54, 0, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); if (q.L) q.L = q.L.map((v) => v * SIZE); }
    for (const t of tufts) { t.len *= SIZE; t.w *= SIZE; t.tip = sc(t.tip, SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    orientTufts(tufts, 1.05, 0.16); // default view; render() re-aims them for the real one
    let top = tufts[0].tip;
    for (const t of tufts) if (t.tip[1] > top[1]) top = t.tip;
    anchors.top = top;
    return { prims, tufts, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    orientTufts(model.tufts, opt.yaw ?? 1.05, opt.pitch ?? 0.16);
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.4, bw: 152, bh: 96, oy: 0.89 } };
})();
