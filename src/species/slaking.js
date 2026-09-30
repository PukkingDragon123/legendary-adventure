/* ------------------------------------------------------------------
   Slaking — the Lazy Pokémon (2.0 m standing ≈ 350 units; it never
   stands: sitting ≈ 240 units to the top of the head tuft, lying on its
   side ≈ 175 tall and ≈ 320 long). Vigoroth's evolution, in the same
   visual language as src/species/slakoth.js. A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline (see
   src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a huge, bulky, lazy ape covered in shaggy brown
   fur. Lighter beige face, chest / big belly, hands and feet. Thick jutting
   brows over droopy, half-closed eyes with dark-brown semicircles under
   them; a large pink pig-like snout; a white collar of fur round the neck
   that runs up over the top of the head and ends in a small tuft on the
   forehead. Long heavy arms with big three-clawed hands, short thick legs
   with two-toed feet. Its signature pose: lying on its side, propped on one
   elbow with its head resting on its hand, the other hand scratching its
   belly.

   Pose parameters (all optional):
     lie      0..1    0 = sitting slumped on its rump (legs out in front, hands
                      on the ground), 1 = lying on its left side, propped on the
                      left elbow, head resting on the left hand (default). The
                      body is re-grounded for every value.
     scratch  0..1    the free (right) hand scratches its belly: 0 = resting
                      on its hip / knee, 1 = on the belly (animate it between
                      ≈ 0.7 and 1 to scratch)
     eyes     'open' (droopy half-lidded, as in the art; default) | 'happy' |
              'blink' | 'closed'
     mouth    0..1    mouth open (a big lazy yawn at 1)
     walk     radians lazy shuffle phase: the body rocks, the legs kick in
                      turn, the free arm sways; exactly 0 = still
     side     −1..1   ≈ cos(yaw), accepted (unused)

   Anchors: top (head top / tuft), head (head centre), mouth, nose, eyeN,
   eyeF (N = its right eye), body (torso centre), belly (front of the belly),
   handN / handF (N = right = free hand, F = left = propping hand), elbow
   (propping elbow), footN / footF.
------------------------------------------------------------------- */
const Slaking = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const FUR = 1, FACE = 2, WHITE = 3, SNOUT = 4, DARK = 5, EYEW = 6, PUPIL = 7, INK = 8, MOUTH = 9, TONGUE = 10, CLAW = 11;
  const MAT = { FUR, FACE, WHITE, SNOUT, DARK, EYEW, PUPIL, INK, MOUTH, TONGUE, CLAW };
  const PAL = Creature.palette({
    [FUR]:    { r: ['#5c4a3e', '#76614f', '#8f7a66', '#a8937e', '#bfab96'], od: '#30241c', ol: '#56463a', ln: '#56463a' },
    [FACE]:   { r: ['#9a8a74', '#b8a78e', '#d2c2a8', '#e4d6c0', '#f2e8d8'], od: '#524634', ol: '#7e6e58', ln: '#84745e' },
    [WHITE]:  { r: ['#aaa69c', '#cecac0', '#eeebe4', '#f9f7f2', '#ffffff'], od: '#555044', ol: '#8a8474', ln: '#948e80' },
    [SNOUT]:  { r: ['#b0566c', '#d27288', '#ee98aa', '#f9bcc8', '#ffe0e6'], od: '#64203a', ol: '#9a4460', ln: '#9a4460' },
    [DARK]:   { r: ['#3a2416', '#4a301e', '#5c3e28', '#6e4e34', '#806042'], od: '#1e1008', ol: '#3a2416', ln: '#2e1c10' },
    [EYEW]:   { r: ['#c4c4cc', '#e2e2e8', '#fbfbfd', '#ffffff', '#ffffff'], od: '#5a5a66', ol: '#8a8a96', ln: '#8a8a96' },
    [PUPIL]:  { r: ['#08080c', '#0e0e14', '#16161e', '#22222c', '#34343e'], od: '#040406', ol: '#08080c', ln: '#08080c' },
    [INK]:    { r: ['#241410', '#321c16', '#40261e', '#4e3026', '#5c3a2e'], od: '#140a08', ol: '#241410', ln: '#241410' },
    [MOUTH]:  { r: ['#3a1618', '#502022', '#682c2c', '#803a38', '#984a46'], od: '#220a0c', ol: '#3a1618', ln: '#3a1618' },
    [TONGUE]: { r: ['#b44c60', '#d06678', '#ea8896', '#f8aab4', '#ffcdd2'], od: '#621828', ol: '#8e2a3c', ln: '#8e2a3c' },
    [CLAW]:   { r: ['#9c978e', '#c6c2b9', '#ecebe6', '#fafaf7', '#ffffff'], od: '#4c4842', ol: '#7c776e', ln: '#86817a' },
  });
  const GLOSSY = { [SNOUT]: 1 };
  const C_FUR = code(FUR), C_FACE = code(FACE), C_WHITE = code(WHITE), C_SNOUT = code(SNOUT), C_DARK = code(DARK), C_EYEW = code(EYEW);
  const C_PUPIL = code(PUPIL), C_INK = code(INK), C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_CLAW = code(CLAW), C_NOSTRIL = code(SNOUT, -2);
  const M_FUR = () => C_FUR, M_FACE = () => C_FACE, M_WHITE = () => C_WHITE, M_CLAW = () => C_CLAW, M_DARK = () => C_FUR;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    if (len3(Z) < 1e-4) Z = cross(X, [1, 0, 0]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.12) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }
  function hookChain(prims, p, d, bendDir, lens, r, bend, part, grp, mat) {
    let dir = nrm(d);
    for (let i = 0; i < lens.length; i++) {
      const q = add(p, sc(dir, lens[i]));
      const B = nrm(sub(bendDir, sc(dir, dot(bendDir, dir))));
      const Rm = M3.cols(dir, B, cross(dir, B));
      const hl = lens[i] * 0.5 + r[i][0] * 0.55;
      prims.push(E(sc(add(p, q), 0.5), M3.mul(Rm, M3.diag(hl, r[i][1], r[i][0])), part, grp, mat));
      p = q;
      dir = nrm(sub(dir, sc(B, Math.tan(bend))));
    }
    return p;
  }
  const SPK_L = 10, SPK_W = 3.6;
  const spikeShape = (c) => bakeShape({
    bb: [-2, -SPK_W - 0.5, SPK_L + 0.5, SPK_W + 0.5],
    test: (u, v) => {
      if (u < -2 || u > SPK_L) return 0;
      const hw = u < 0 ? SPK_W : SPK_W * Math.pow((SPK_L - u) / SPK_L, 0.9);
      return Math.abs(v) < hw ? c : 0;
    },
  });
  const SPK_W_G = spikeShape(C_WHITE), SPK_F_G = spikeShape(C_FUR);
  function tuft(prims, root, dir, len, w, part, grp, out, shape) {
    const U = nrm(dir);
    let A = sub(out, sc(U, dot(out, U)));
    if (len3(A) < 1e-3) A = cross(U, [1, 0, 0]);
    A = nrm(A);
    const B = cross(U, A);
    for (const k of [1, -1]) {
      const Vv = nrm(add(A, sc(B, k)));
      prims.push(PL(root, M3.cols(sc(U, len / SPK_L), sc(Vv, w / SPK_W), cross(U, Vv)), part, grp, shape, 1.6));
    }
  }
  const lowY = (p) => (p.kind === 'ell' ? p.c[1] - Math.hypot(p.L[3], p.L[4], p.L[5]) : p.c[1]);

  let curScale = 1;

  /* ---------- head (head frame, unit sphere s) ---------- */
  const HR = [40, 38, 43];
  const EYE_AZ = 0.4, EYE_V = 0.1, ER_U = 0.19, ER_V = 0.13;
  const SNOUT_V = -0.2, MOUTH_V = -0.58, MOUTH_HW = 0.34;
  function eyePix(u, v, kind, px, sd) {
    const a = u / ER_U, b = v / ER_V;
    const r2 = a * a + b * b;
    if (r2 >= 1) {
      // the dark semicircle patterning under the eye
      const cu = u / 0.3, cvv = (v + 0.02) / 0.25;
      if (v < -0.03 && cu * cu + cvv * cvv < 1 && cu * cu + ((v + 0.02) / 0.19) ** 2 > 0.62) return C_DARK;
      return 0;
    }
    const pxa = px / ER_U, pxb = px / ER_V;
    const lw = Math.max(0.12, 0.8 * pxb);
    const ao = a * sd;
    if (kind === 'happy' || kind === 'closed' || kind === 'blink') {
      const yc = kind === 'happy' ? -0.35 + 0.6 * (1 - a * a) : kind === 'closed' ? 0 - 0.4 * (1 - a * a) : -0.1;
      if (Math.abs(b - yc) < lw && Math.abs(a) < 0.96) return C_INK;
      return C_FACE;
    }
    const lid = 0.18 - 0.28 * ao;             // heavy droopy lid, sloping down to the outer corner
    if (b > lid + lw) return C_FACE;
    if (b > lid - lw) return C_INK;
    const pr = Math.max(0.3, 1.2 * pxa);
    const dx = (a + 0.12 * sd) / pr, dy = (b - (lid - 0.2)) / (pr * 1.25);
    if (dx * dx + dy * dy < 1) return C_PUPIL;
    if (r2 > 1 - Math.min(0.45, 2 * pxb) && pxb < 0.2) return C_INK;
    return C_EYEW;
  }
  function headMat(kind, mo) {
    return (s) => {
      const cv = Math.sqrt(Math.max(0, 1 - s[1] * s[1]));
      // the white band of fur running over the top of the head
      if (Math.abs(s[2]) < 0.3 - 0.1 * Math.max(0, s[0]) && s[1] > 0.3 && s[0] < 0.5) return C_WHITE;
      if (s[0] < 0.25) return C_FUR;
      const px = 1 / (curScale * HR[1]);
      const az = Math.atan2(s[2], s[0]);
      const sd = az >= 0 ? 1 : -1;
      const e = eyePix((az - sd * EYE_AZ) * cv, s[1] - EYE_V, kind, px, sd);
      if (e) return e;
      const u = az * cv;
      // mouth: a small lazy line, or a big yawn
      if (Math.abs(u) < MOUTH_HW + 0.1 && s[1] < SNOUT_V) {
        if (mo > 0.05) {
          const hw = 0.18 + 0.16 * mo, h = Math.max(0.08 + 0.26 * mo, 2 * px);
          const k = u / hw, ee = (s[1] - (MOUTH_V + 0.02)) / h;
          if (k * k + ee * ee < 1) return ee < -0.3 && Math.abs(k) < 0.7 ? C_TONGUE : C_MOUTH;
        } else if (Math.abs(u) < MOUTH_HW) {
          const k = u / MOUTH_HW;
          const yc = MOUTH_V + 0.08 * k * k;
          if (Math.abs(s[1] - yc) < Math.max(0.03, 0.6 * px)) return C_INK;
        }
      }
      // lighter face (front of the head, below the brows)
      const fz = Math.abs(az) / 1.05, fy = (s[1] + 0.12) / 0.62;
      if (fz * fz + fy * fy < 1) return C_FACE;
      return C_FUR;
    };
  }
  function snoutMat(s) {
    if (s[0] > 0.55 && Math.abs(Math.abs(s[2]) - 0.33) < Math.max(0.1, 0.6 / (curScale * 12)) && Math.abs(s[1]) < 0.28) return C_NOSTRIL;
    return C_SNOUT;
  }

  /* ---------- torso (S frame: y up the spine, x = front, z = its right side) ---------- */
  const BELLY_C = [4, 64, 0], BELLY_R = [62, 68, 66];
  const CHEST_C = [-4, 124, 0], CHEST_R = [52, 42, 66];
  const bellyMat = (s) => {
    if (s[0] < 0.25 + 0.45 * s[2] * s[2] || s[1] > 0.8) return C_FUR;
    // jagged white bib hanging over the top of the belly
    const zz = Math.abs(s[2]), jag = 0.08 * Math.abs(((Math.atan2(s[2], s[0]) * 7) % 2 + 2) % 2 - 1);
    if (s[1] > 0.42 - 0.5 * zz * zz + jag && zz < 0.62) return C_WHITE;
    return C_FACE;
  };
  const chestMat = (s) => (s[0] > 0.3 + 0.5 * s[2] * s[2] ? C_WHITE : C_FUR);

  const DEFAULT = { lie: 1, scratch: 0, eyes: 'open', mouth: 0, walk: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 snout, 4 brows, 5 collar/tuft (white), 6/7 arms, 8/9 hands, 10/11 legs, 12/13 feet
  Object.assign(PRI, { 1: 0, 2: 2, 3: 4, 4: 3, 5: 1, 6: 3, 7: 3, 8: 4, 9: 4, 10: 1, 11: 1, 12: 2, 13: 2 });
  const SIZE = 1;

  function hand(prims, wr, dir, palm, id, grip = 0) {
    const Rm = axesAlong(dir, palm);
    const X = [Rm[0], Rm[3], Rm[6]], Y = [Rm[1], Rm[4], Rm[7]], Z = [Rm[2], Rm[5], Rm[8]];
    const hc = add(wr, sc(X, 11));
    prims.push(E(hc, M3.mul(Rm, M3.diag(17, 11, 18)), id, id, M_FACE));
    for (const o of [-1, 0, 1]) {
      const base = add(add(hc, sc(X, 13)), sc(Z, o * 10));
      const d0 = nrm(add(X, sc(Z, o * 0.25)));
      const tip = hookChain(prims, base, d0, Y, [8, 7], [[5.4, 5], [4.6, 4.3]], 0.35 + grip, id, id, M_FACE);
      hookChain(prims, tip, nrm(sub(d0, sc(Y, 0.6 + grip))), Y, [4, 3.5], [[3, 2.6], [1.6, 1.4]], 0.4, id, id, M_CLAW);
    }
    return add(hc, sc(X, 26));
  }

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const lie = clamp(P.lie ?? 1, 0, 1), sit = 1 - lie;
    const scr = clamp(+P.scratch || 0, 0, 1);
    const mo = clamp(+P.mouth || 0, 0, 1);
    const wk = +P.walk || 0, moving = wk !== 0;
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';

    // --- S frame → world: sitting leans back a little; lying turns it to face +z, then tips it
    //     over onto its left side (spine along +x, raised ≈ 25° on the propping elbow)
    const rockA = moving ? 0.05 * Math.sin(wk) : 0;
    const Rw = M3.mul(M3.mul(M3.rz(-1.13 * lie), M3.ry(-Math.PI / 2 * lie)), M3.mul(M3.rz(0.12 * sit), M3.rx(rockA)));
    let sf = F(Rw, [0, 0, 0]);
    const S = (p) => inF(sf, p);

    // torso first (sets the ground)
    const tors = [
      ellF(chain(sf, T(...BELLY_C)), BELLY_R, 1, 1, bellyMat),
      ellF(chain(sf, T(...CHEST_C)), CHEST_R, 1, 1, chestMat),
    ];
    let gy = Math.min(...tors.map(lowY));
    // legs are part of the ground contact when sitting (they hardly are when lying)
    sf = F(Rw, [0, -gy, 0]);
    for (const p of tors) p.c = add(p.c, [0, -gy, 0]);
    prims.push(...tors);
    anchors.body = S([0, 80, 0]);
    anchors.belly = S([BELLY_C[0] + BELLY_R[0], 60, 0]);

    // --- head: sits low on the shoulders (sitting) / propped on the left hand (lying)
    const hp = lerp3([28, 188, 0], [30, 192, 8], lie);
    const hf = chain(sf, T(...hp), R(M3.rz(-0.1 * sit + 0.05 * lie)), R(M3.rx(0.6 * lie + (moving ? 0.03 * Math.sin(wk) : 0))));
    const headPrim = ellF(hf, HR, 2, 2, headMat(kind, mo));
    prims.push(headPrim);
    anchors.head = hf.t;
    const onHead = (az, v, out = 0) => { const q = Creature.sph(az, v); return inF(hf, [(HR[0] + out) * q[0], (HR[1] + out) * q[1], (HR[2] + out) * q[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    anchors.mouth = onHead(0, MOUTH_V);
    // thick jutting brows
    for (const sd of [1, -1]) {
      const bc = onHead(sd * 0.42, 0.34, -6);
      prims.push(E(bc, M3.mul(M3.mul(hf.L, M3.ry(-sd * 0.4)), M3.mul(M3.rx(sd * 0.22), M3.diag(10, 7, 17))), 4, 4, M_DARK));
    }
    // big pink pig snout
    const nf = chain(hf, T(HR[0] * 0.82, HR[1] * SNOUT_V, 0));
    prims.push(ellF(nf, [12, 11.5, 17], 3, 3, snoutMat));
    anchors.nose = inF(nf, [12, 0, 0]);
    // forehead tuft at the end of the white band
    let top = hf.t[1] + HR[1];
    for (const [dz, dx] of [[0, 0.5], [0.45, 0.2], [-0.45, 0.2]]) {
      const root = onHead(0, 0.82, -3);
      tuft(prims, root, dirF(hf, [dx, 1, dz]), 16, 6, 5, 5, M3.v(hf.L, [1, 0, 0]), SPK_W_G);
      top = Math.max(top, add(root, sc(dirF(hf, [dx, 1, dz]), 16))[1]);
    }
    anchors.top = [hf.t[0], top, hf.t[2]];

    // --- white shaggy mane: jowls round the face and a spiky bib down the chest
    for (let i = 0; i < 9; i++) {
      const a = -1.75 + (i / 8) * 3.5;
      const c = S([2 + 42 * Math.cos(a), 158 + 6 * Math.cos(a), 52 * Math.sin(a)]);
      prims.push(E(c, M3.mul(M3.mul(Rw, M3.ry(-a)), M3.diag(12, 15, 17)), 5, 5, M_WHITE));
    }
    for (let i = 0; i < 9; i++) {
      const a = -1.6 + (i / 8) * 3.2;
      tuft(prims, S([6 + 50 * Math.cos(a), 146, 60 * Math.sin(a)]), M3.v(Rw, [Math.cos(a) * 0.8, -0.35, Math.sin(a) * 0.9]), 20, 7, 5, 5, M3.v(Rw, [0, 1, 0]), SPK_W_G);
    }
    for (const [z, y, l] of [[0, 104, 22], [20, 110, 20], [-20, 110, 20], [34, 122, 18], [-34, 122, 18]])
      tuft(prims, S([CHEST_R[0] - 8 - Math.abs(z) * 0.2, y, z]), M3.v(Rw, [0.35, -1, z * 0.012]), l, 8, 5, 5, M3.v(Rw, [1, 0, 0]), SPK_W_G);

    // --- arms
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7, hid = sd > 0 ? 8 : 9;
      const sh = S([0, 134, 62 * sd]);
      // sitting: hands resting on the ground beside the legs
      let el = S([26, 80, 84 * sd]), wr = S([48, 26, 82 * sd]);
      let hd = M3.v(Rw, [0.5, -0.8, 0.1 * sd]), palm = M3.v(Rw, [0, -1, 0]);
      if (sd < 0) {
        // lying: the left elbow on the ground, forearm up, hand under the cheek
        const cheek = onHead(-1.1, -0.5, 4);
        const elL = [cheek[0] - 4, 19, cheek[2] + 12];
        const wrL = add(cheek, [-4, -24, 4]);
        el = lerp3(el, elL, lie); wr = lerp3(wr, wrL, lie);
        hd = nrm(lerp3(hd, [0.35, 1, 0.3], lie)); palm = nrm(lerp3(palm, [0.2, 0, 1], lie));
      } else {
        // lying: the right arm rests along its side, hand on the hip
        const elL = S([10, 70, 86]), wrL = S([30, 18, 80]);
        el = lerp3(el, elL, lie); wr = lerp3(wr, wrL, lie);
        hd = nrm(lerp3(hd, M3.v(Rw, [0.55, -0.6, -0.4]), lie)); palm = nrm(lerp3(palm, M3.v(Rw, [0, 0, -1]), lie));
        if (moving) { const w = 5 * Math.sin(wk); el = add(el, M3.v(Rw, [w, 0, 0])); wr = add(wr, M3.v(Rw, [w * 1.6, 0, 0])); }
        // scratch: the hand goes to the belly and rubs up and down
        if (scr > 0) {
          const k = scr * scr * (3 - 2 * scr);
          const rub = 14 * (scr - 0.85) / 0.15;
          const wrS = S([BELLY_C[0] + BELLY_R[0] * 0.8, 62 + rub, 26]);
          const elS = S([40, 92, 90]);
          wr = lerp3(wr, wrS, k); el = lerp3(el, elS, k);
          hd = nrm(lerp3(hd, M3.v(Rw, [0.2, -0.6, -1]), k)); palm = nrm(lerp3(palm, M3.v(Rw, [1, 0, 0]), k));
        }
      }
      prims.push(seg(sh, el, 21, 21, M3.v(Rw, [0, 1, 0]), id, id, M_FUR, 1.2));
      prims.push(E(el, M3.diag(19, 19, 19), id, id, M_FUR));
      prims.push(seg(el, wr, 19, 18, M3.v(Rw, [0, 1, 0]), id, id, M_FUR, 1.15));
      for (const k of [0, 2.1, 4.2]) tuft(prims, wr, nrm(add(sc(nrm(sub(wr, el)), -0.3), M3.v(M3.ry(k), [0.8, 0, 0.6]))), 22, 7, id, id, nrm(sub(wr, el)), SPK_F_G);
      const tip = hand(prims, wr, hd, palm, hid, sd > 0 && scr > 0 ? 0.25 * scr : 0);
      anchors[sd > 0 ? 'handN' : 'handF'] = tip;
      if (sd < 0) anchors.elbow = el;
    }

    // --- legs: out in front (sitting) / stacked, the top one bent (lying)
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11, fid = sd > 0 ? 12 : 13;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const kick = moving ? Math.sin(ph) : 0;
      const hip = S([6, 22, 36 * sd]);
      const kneeS = [66, 44 + 6 * kick, 46 * sd], footS = [104 + 8 * kick, -4 + 4 * Math.max(0, kick), 50 * sd];
      // lying: both legs rest along the ground behind it, the top (right) one bent forward over the other
      const kneeL = sd > 0 ? add(hip, [-34, 20, 42 + 8 * kick]) : add(hip, [-56, 0, 14]);
      const footL = sd > 0 ? add(hip, [-92 + 10 * kick, 6, 40]) : add(hip, [-112, 0, 10]);
      kneeL[1] = Math.max(kneeL[1], 24); footL[1] = Math.max(footL[1], 18);
      const knee = lerp3(S(kneeS), kneeL, lie), foot = lerp3(S(footS), footL, lie);
      prims.push(seg(hip, knee, 25, 25, M3.v(Rw, [0, 1, 0]), id, id, M_FUR, 1.15));
      prims.push(seg(knee, foot, 21, 21, M3.v(Rw, [0, 1, 0]), id, id, M_FUR, 1.12));
      for (const k of [0, 2.1, 4.2]) tuft(prims, foot, nrm(add(sc(nrm(sub(foot, knee)), -0.3), M3.v(M3.ry(k), [0.8, 0, 0.6]))), 22, 7, id, id, nrm(sub(foot, knee)), SPK_F_G);
      // two-toed beige foot, toes pointing forward/up
      const fdir = nrm(lerp3(M3.v(Rw, [0.25, 0.9, 0.1 * sd]), [0.15, 0.3, 1], lie));
      const fup = nrm(lerp3(M3.v(Rw, [-1, 0.2, 0]), [-1, 0.1, 0], lie));
      const Rf = axesAlong(fdir, fup);
      const X = [Rf[0], Rf[3], Rf[6]], Y = [Rf[1], Rf[4], Rf[7]], Z = [Rf[2], Rf[5], Rf[8]];
      const fc = add(foot, sc(X, 4));
      prims.push(E(fc, M3.mul(Rf, M3.diag(16, 12, 17)), fid, fid, M_FACE));
      for (const o of [-1, 1]) {
        const tb = add(add(fc, sc(X, 12)), sc(Z, o * 8));
        const t2 = hookChain(prims, tb, nrm(add(X, sc(Z, o * 0.15))), sc(Y, -1), [8], [[7.5, 7]], 0.3, fid, fid, M_FACE);
        hookChain(prims, t2, nrm(add(X, sc(Y, 0.3))), sc(Y, -1), [4, 3], [[3.4, 3], [1.8, 1.6]], 0.4, fid, fid, M_CLAW);
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = add(fc, sc(X, 20));
    }

    // --- re-ground on the lowest part, and centre the lying body along x (it is long)
    let g = Infinity;
    for (const q of prims) g = Math.min(g, lowY(q));
    const cx = lie * -44;
    for (const q of prims) q.c = add(q.c, [cx, -g, 0]);
    for (const k in anchors) anchors[k] = add(anchors[k], [cx, -g, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: FUR, shadowSteps: 12 };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
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
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.0, bw: 440, bh: 300, oy: 0.9 } };
})();
