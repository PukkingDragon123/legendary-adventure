/* ------------------------------------------------------------------
   Sharpedo — the Brutal Pokémon (1.8 m ≈ 315 px nose to tail at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is the bottom of the belly in the rest pose; the lunge arches
   the body about its middle.

   Build: a huge blunt head (navy skull with a white upper lip, cut flat
   at the lip plane) over a hinged white lower jaw (overbite); a dark red
   throat shows through the gape, with a pink tongue on the lower jaw;
   rows of white triangular teeth ride on both jaw rims. Yellow four-point
   star on the snout, red target eyes, three curved black gill slits,
   a navy body with a jagged white belly line, a tall notched dorsal fin,
   long pectorals, a navy / white forked tail.

   Pose parameters (all optional):
     mouth   0..1   jaws closed (teeth interlocked) .. gaping wide
     tail   -1..1   tail sways toward -z (-1) .. +z (+1)
     lunge   0..1   attack arch: the head rears up and forward, the tail curls down
     eyes   'open' | 'angry' | 'closed'   (also accepts 'happy' / 'blink' as closed-ish lids)
   Anchors: top (dorsal tip), head, mouth (centre of the gape), jawTip, eyeN, eyeF, body, tail, finN, finF.
------------------------------------------------------------------- */
const Sharpedo = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const NAVY = 1, WHITE = 2, STAR = 3, GILL = 4, THROAT = 5, TONGUE = 6, TOOTH = 7, FIN = 8;
  const MAT = { NAVY, WHITE, STAR, GILL, THROAT, TONGUE, TOOTH, FIN };
  const PAL = Creature.palette({
    [NAVY]:   { r: ['#0b2650', '#133a6c', '#1c528c', '#2c6caa', '#5690cc'], od: '#061530', ol: '#113264', ln: '#0e2c5a' },
    [FIN]:    { r: ['#0b2650', '#133a6c', '#1c528c', '#2c6caa', '#5690cc'], od: '#061530', ol: '#113264', ln: '#0e2c5a' },
    [WHITE]:  { r: ['#8a93b2', '#b4bbd4', '#dde1ee', '#f1f3f9', '#ffffff'], od: '#323a62', ol: '#6a739c', ln: '#7a83aa' },
    [STAR]:   { r: ['#b6841a', '#d6a42a', '#f0c63e', '#f9dc70', '#fff2b4'], od: '#5e3e08', ol: '#a07418', ln: '#9a7016' },
    [GILL]:   { r: ['#060a14', '#0a101c', '#0e1524', '#141c2e', '#1c263a'], od: '#04070e', ol: '#060a14', ln: '#060a14' },
    [THROAT]: { r: ['#3e0a16', '#581222', '#761c30', '#922a40', '#aa3a52'], od: '#26040c', ol: '#3e0a16', ln: '#3e0a16' },
    [TONGUE]: { r: ['#b8485e', '#d4647a', '#ec8698', '#f8a8b6', '#ffcad2'], od: '#6a1428', ol: '#8a2238', ln: '#9a3048' },
    [TOOTH]:  { r: ['#a4acc4', '#cbd1e2', '#eef1f8', '#ffffff', '#ffffff'], od: '#3a4262', ol: '#6a7294', ln: '#8a92b0' },
  });
  const GLOSSY = {};
  const C_NAVY = code(NAVY), C_WHITE = code(WHITE), C_STAR = code(STAR), C_GILL = code(GILL), C_THROAT = code(THROAT, -1);
  const C_TONGUE = code(TONGUE), C_TOOTH = code(TOOTH, 1), C_FIN = code(FIN), C_FINW = code(WHITE, 0);

  const DEFAULT = { mouth: 0, tail: 0, lunge: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale, nrm = V3.norm;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const tri = (x) => 1 - Math.abs((x - Math.floor(x)) * 2 - 1);

  /* ---------- geometry (body axis frame, before the final lift) ---------- */
  const SKULL_C = [30, 12, 0], SKULL_R = [100, 68, 70];
  const LIP_Y = -10;                                 // mouth plane (model units)
  const LIP_S = (LIP_Y - SKULL_C[1]) / SKULL_R[1];   // ... in skull unit-sphere v
  const HINGE = [-18, LIP_Y, 0];
  const JAW_C = [46, -18, 0], JAW_R = [92, 38, 72];  // lower jaw, in the hinge frame
  const JAW_S = -JAW_C[1] / JAW_R[1];                // its lip plane in jaw unit-sphere v
  const BODY_C = [-52, 12, 0], BODY_R = [108, 67, 64];
  const STOCK_C = [-160, 14, 0], STOCK_R = [46, 22, 15];
  const LIFT = 64;

  // cut-face ellipses (x-z) of the skull and the jaw at their lip planes
  const SK_K = Math.sqrt(1 - LIP_S * LIP_S), JW_K = Math.sqrt(1 - JAW_S * JAW_S);

  /* ---------- skull surface: navy top, white upper lip / throat, star, gills ---------- */
  const EYE_AZ = 0.56, EYE_V = 0.02;
  const GILLS = [0.76, 0.87, 0.98];
  const skullMat = (s) => {
    // cut at the lip plane in front of the hinge (the lower jaw and the gape live there)
    const x = SKULL_C[0] + SKULL_R[0] * s[0];
    if (s[1] < LIP_S && x > HINGE[0] - 4) return 0;
    const az = Math.atan2(s[2], s[0]), a = Math.abs(az);
    // yellow four-point star on top of the snout (astroid in the tangent plane)
    if (s[1] > 0.3) {
      const u = Math.asin(clamp(s[1], -1, 1)) - 0.72, w = az * Math.cos(0.72); // u > 0 toward the crown, w sideways
      const au = u > 0 ? 0.3 : 0.2;
      const q = Math.sqrt(Math.abs(u) / au) + Math.sqrt(Math.abs(w) / 0.34);
      if (q < 1 && s[0] > 0) return C_STAR;
    }
    // gill slits: three curved black stripes behind the eye
    if (s[1] > -0.24 && s[1] < 0.22) for (const g of GILLS) if (Math.abs(a - g + 0.45 * s[1] * s[1] - 0.02) < 0.03 + 0.012 * (1 - Math.abs(s[1]) * 4)) return C_GILL;
    // white upper lip rim (wider at the front) and white underside behind the hinge
    const lip = LIP_S + 0.07 + 0.2 * Math.max(0, Math.cos(az)) ** 6;
    if (s[1] < lip && x > HINGE[0] - 4) return C_WHITE;
    if (x <= HINGE[0] - 4 && s[1] < -0.22) return C_WHITE;
    return C_NAVY;
  };
  // body: navy back, white belly below a jagged line
  const bodyMat = (s) => (s[1] < -0.3 + 0.1 * tri(s[0] * 3.2 + 0.3) + 0.12 * Math.max(0, s[0] - 0.3) ? C_WHITE : C_NAVY);
  const stockMat = (s) => (s[1] < -0.25 + 0.12 * tri(s[0] * 2 + 0.5) ? C_WHITE : C_NAVY);

  /* ---------- fins (plates: u along, v across) ---------- */
  // dorsal fin as a lens (reads as a wedge edge-on): an ellipsoid leaning back, its rim forming the
  // leading edge and tip, the trailing edge sawn into Sharpedo's stepped notches
  const DORS_LEAN = 0.34, DORS_C = [-24, 34, 0], DORS_R = [21, 62, 8];
  const dorsMat = (s) => {
    const l = DORS_R[1] * s[1], w = DORS_R[0] * s[0];
    if (w < 0 && l > 6) {
      const rim = DORS_R[0] * Math.sqrt(Math.max(0, 1 - (l / DORS_R[1]) ** 2));
      const f = (l - 6) / 17, saw = 0.5 + 0.5 * (f - Math.floor(f));
      if (-w > rim * saw && l < 50) return 0;
    }
    return C_FIN;
  };
  const PECT = bakeShape(Shape2D.poly([[0, -12], [30, -12], [70, -8], [104, -2], [108, 3], [92, 8], [56, 12], [20, 14], [0, 10]], C_FIN, 8));
  const PELV = bakeShape(Shape2D.poly([[0, -6], [18, -8], [34, -6], [30, 0], [16, 5], [0, 6]], C_FIN, 6));
  const TAILF = bakeShape({
    ...Shape2D.poly([[0, -14], [14, -26], [30, -46], [42, -66], [46, -64], [40, -40], [44, -34], [38, -24], [36, -6], [40, 10], [48, 34], [62, 70], [66, 76], [58, 74], [40, 50], [20, 28], [4, 14], [0, 0]], C_FIN, 6),
    test(u, v) { const P = this.poly; if (!Shape2D.inPoly(u, v, P)) return 0; return v < -4 ? C_FINW : C_FIN; },
  });
  // teeth: white triangles (u across the base, v toward the tip)
  const TOOTH_S = bakeShape(Shape2D.poly([[-6, 0], [0, 0.6], [6, 0], [2.4, 9], [0, 15], [-2.4, 9]], C_TOOTH, 6));
  const UPPER_TEETH = [-1.12, -0.8, -0.48, -0.16, 0.16, 0.48, 0.8, 1.12];
  const LOWER_TEETH = [-1.0, -0.62, -0.22, 0.22, 0.62, 1.0];

  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 1, 2: 0, 3: 1, 4: 0, 5: -1, 6: 0, 7: 3, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const mo = clamp(P.mouth, 0, 1), tw = clamp(P.tail, -1, 1), lg = clamp(P.lunge, 0, 1);
    const side = P.side === undefined ? 1 : clamp(P.side, -1, 1);
    // lunge: the front half rears up about the body middle, the rear half curls down
    const root = chain(T(0, LIFT + lg * 10, 0));
    const front = chain(root, T(-40, 0, 0), R(M3.rz(lg * 0.32)), T(40, 0, 0));
    const rear = chain(root, T(-40, 0, 0), R(M3.rz(-lg * 0.22)), T(40, 0, 0));

    /* --- skull (upper jaw + head) */
    const skullF = chain(front, T(...SKULL_C));
    const skull = ellF(skullF, SKULL_R, 1, 1, skullMat);
    prims.push(skull);

    /* --- lower jaw, hinged at the back of the mouth; cut flat at its lip plane */
    const open = mo * 0.62;
    const hingeF = chain(front, T(...HINGE), R(M3.rz(-open)));
    const jawF = chain(hingeF, T(...JAW_C));
    prims.push(ellF(jawF, JAW_R, 2, 2, (s) => (s[1] > JAW_S ? 0 : C_WHITE)));
    // tongue lying on the jaw floor (visible in the gape)
    if (mo > 0.04) prims.push(ellF(chain(jawF, T(-4, JAW_R[1] * JAW_S - 2.2, 0)), [JAW_R[0] * JW_K * 0.78, 3.5, JAW_R[2] * JW_K * 0.62], 6, 5, () => C_TONGUE));
    // dark red throat filling the gape (hidden inside the head when the jaws are shut)
    prims.push(ellF(chain(front, T(22, LIP_Y - 4, 0)), [84, 26 + mo * 18, 58], 5, 5, () => C_THROAT));

    /* --- teeth: upper row hangs from the skull's lip rim, lower row stands on the jaw rim */
    const toothAt = (frame, cx, cz, rx, rz, th, dirY, id, grow) => {
      const px = cx + rx * Math.cos(th), pz = rz * Math.sin(th);
      const out = nrm([Math.cos(th) / rx, 0, Math.sin(th) / rz]);   // rim normal (outward)
      const tang = nrm([-out[2], 0, out[0]]);
      const inset = 3.2;
      const pos = [px - out[0] * inset, 0, pz - out[2] * inset];
      const L = M3.mul(frame.L, M3.cols(sc(tang, grow), [0, dirY * grow, 0], out));
      return PL(inF(frame, pos), L, id, id, TOOTH_S, 1.6);
    };
    const upF = chain(skullF, T(0, LIP_Y - SKULL_C[1] + 1.5, 0));
    for (const th of UPPER_TEETH) prims.push(toothAt(upF, 0, 0, SKULL_R[0] * SK_K, SKULL_R[2] * SK_K, th, -1, 7, 1 - 0.1 * Math.abs(th)));
    const lowF = chain(jawF, T(0, JAW_R[1] * JAW_S - 1.5, 0));
    for (const th of LOWER_TEETH) prims.push(toothAt(lowF, 0, 0, JAW_R[0] * JW_K, JAW_R[2] * JW_K, th, 1, 7, 0.92 - 0.1 * Math.abs(th)));

    /* --- body and tail */
    const bodyF = chain(rear, T(...BODY_C));
    prims.push(ellF(bodyF, BODY_R, 3, 1, bodyMat));
    const stockF = chain(rear, T(STOCK_C[0] + 26, STOCK_C[1], 0), R(M3.rz(-lg * 0.25)), R(M3.ry(tw * 0.4)), T(-26, 0, 0));
    prims.push(ellF(stockF, STOCK_R, 4, 3, stockMat));
    const tfF = chain(stockF, T(-STOCK_R[0] + 8, 0, 0), R(M3.ry(tw * 0.3)), R(M3.rz(-lg * 0.2)));
    prims.push(PL(tfF.t, M3.mul(tfF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 8, 8, TAILF, 1.8));

    /* --- fins */
    const dF = chain(bodyF, T(20, BODY_R[1] * 0.9, 0), R(M3.rz(-0.12)), R(M3.rx(side * 0.06)));
    const dL = M3.mul(dF.L, M3.rz(DORS_LEAN));
    prims.push(E(inF(dF, DORS_C), M3.mul(dL, M3.diag(DORS_R[0], DORS_R[1], DORS_R[2])), 9, 9, dorsMat));
    const finTips = [];
    for (const sd of [1, -1]) {
      const pf = chain(front, T(-20, -32, sd * 50), R(M3.ry(sd * 0.5)), R(M3.rz(-0.35)), R(M3.rx(sd * 0.55)));
      prims.push(PL(pf.t, M3.mul(pf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), sd > 0 ? 10 : 11, sd > 0 ? 10 : 11, PECT, 1.8));
      finTips.push(inF(pf, [-106, 2, 0]));
      const vf = chain(bodyF, T(-40, -BODY_R[1] * 0.78, sd * 20), R(M3.ry(sd * 0.4)), R(M3.rz(-0.5)));
      prims.push(PL(vf.t, M3.mul(vf.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, sd])), 12, 12, PELV, 1.6));
    }

    /* --- eyes: red target stamps (angry lids slant down toward the snout) */
    const eyeKind = P.eyes === 'angry' ? 'angry' : P.eyes === 'closed' || P.eyes === 'blink' || P.eyes === 'happy' ? 'blink' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      const at = { prim: skull, p: inF(skullF, [s[0] * SKULL_R[0], s[1] * SKULL_R[1], s[2] * SKULL_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.6, far: 0.34, minFacing: 0.2, toFront: [SKULL_R[0] * (1 - s[0]), -s[2] * SKULL_R[2]] });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    Object.assign(anchors, {
      top: inF(dF, [DORS_C[0] - Math.sin(DORS_LEAN) * DORS_R[1], DORS_C[1] + Math.cos(DORS_LEAN) * DORS_R[1], 0]),
      head: skullF.t,
      mouth: inF(front, [SKULL_C[0] + SKULL_R[0] * 0.7, LIP_Y - 12 * mo, 0]),
      jawTip: inF(jawF, [JAW_R[0] * 0.95, 0, 0]),
      body: bodyF.t,
      tail: inF(tfF, [-60, 0, 0]),
      finN: finTips[0], finF: finTips[1],
    });
    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: NAVY, shadowSteps: 14, shadowDepth: 28 };
  }
  const SIZE = 0.8;

  /* ---------- eye stamps: k = black ring / pupil, r = red iris, w = glint ---------- */
  const mk = (o, oN, oF, a, aN, aF, b, bN, bF) => ({ open: o, openN: oN, openF: oF, angry: a, angryN: aN, angryF: aF, blink: b, blinkN: bN, blinkF: bF });
  const EYES_S = mk(
    ['.kk.', 'krrk', 'krwk', '.kk.'], ['.k.', 'krk', 'kwk', '.k.'], ['k', 'r', 'k'],
    ['kk..', 'krkk', 'krwk', '.kk.'], ['kk.', 'krk', '.k.'], ['k', 'k'],
    ['kkkk'], ['kkk'], ['kk'],
  );
  const EYES_M = mk(
    ['.kkk.', 'krrrk', 'krkwk', 'krrrk', '.kkk.'], ['.kk.', 'krrk', 'krwk', 'krrk', '.kk.'], ['.k.', 'krk', 'kkk', '.k.'],
    ['kk...', 'krkkk', 'krkwk', 'krrrk', '.kkk.'], ['kk..', 'krkk', 'krwk', '.kk.'], ['k.', 'kk', 'kk'],
    ['kkkkk', '.kkk.'], ['kkkk', '.kk.'], ['kkk'],
  );
  const EYES_XL = mk(
    ['...kkkk...', '.kkrrrrkk.', '.krrrrrrk.', 'krrrkkrrrk', 'krrkkwkrrk', 'krrkkkkrrk', 'krrrkkrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['..kkkk..', '.krrrrk.', 'krrkkrrk', 'krkkwkrk', 'krkkkkrk', 'krrkkrrk', '.krrrrk.', '..kkkk..'],
    ['.kkk.', 'krrrk', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['kkk.......', 'krrkkk....', '.krrrrkkk.', 'krrrkkrrkk', 'krrkkwkrrk', 'krrkkkkrrk', 'krrrkkrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['kk......', 'krkkk...', 'krrkkkkk', 'krkkwkrk', 'krkkkkrk', 'krrkkrrk', '.krrrrk.', '..kkkk..'],
    ['kk...', 'krkk.', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['kkkkkkkkkk', '.kkkkkkkk.'], ['kkkkkkkk', '.kkkkkk.'], ['kkkkk', '.kkk.'],
  );
  const EYES_L = mk(
    ['..kkk..', '.krrrk.', 'krrkkrk', 'krkkwrk', 'krkkkrk', '.krrrk.', '..kkk..'],
    ['.kkk.', 'krrrk', 'krkwk', 'krkkk', 'krrrk', '.kkk.'],
    ['.kk.', 'krrk', 'kkwk', 'krrk', '.kk.'],
    ['kk.....', 'krkk...', 'krrkkkk', 'krkkwrk', 'krkkkrk', '.krrrk.', '..kkk..'],
    ['kk...', 'krkkk', 'krkwk', 'krrrk', '.kkk.'],
    ['kk..', 'krkk', 'kkwk', '.kk.'],
    ['kkkkkkk', '.kkkkk.'], ['kkkkk', '.kkk.'], ['kkkk'],
  );
  const EYEC = { k: '#0c0d14', r: '#d8263a', w: '#ffffff' };

  // drop tiny detached islands (a fin seen edge-on can leave lone outlined pixels)
  function despeckle(d, depth, part, w, h) {
    const seen = new Uint8Array(w * h), stack = [], comp = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!d[i0] || seen[i0]) continue;
      stack.length = 0; comp.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const x = i % w;
        if (x > 0 && d[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && d[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (i >= w && d[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (i < w * (h - 1) && d[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      if (comp.length < 9) for (const i of comp) { d[i] = 0; depth[i] = -1e9; part[i] = 0; }
    }
  }

  /* ---------- render: eye size by scale, angry lids flipped toward the snout, cropped ray-cast ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.8 ? EYES_XL : scale >= 0.58 ? EYES_L : scale >= 0.4 ? EYES_M : EYES_S;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const st of model.stamps) { st.set = set; st.flipX = st.kind === 'angry' && cy * st.toFront[0] - sy * st.toFront[1] < 0; }
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
    despeckle(r.buf.d, r.depth, r.part, w, h);
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.8, bw: 432, bh: 312, oy: 0.775 } };
})();
