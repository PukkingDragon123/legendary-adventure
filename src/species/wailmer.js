/* ------------------------------------------------------------------
   Wailmer — the Ball Whale Pokémon (2.0 m ≈ 350 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is the
   bottom of the ball (it floats with its belly in the water).

   Design (official art / HOME model): a round ball whale. A glossy blue
   cap covers the top and back and overhangs the front as the upper lip;
   below it a wide grin of white teeth, and a big cream belly ball scored
   with curved lines that meet low at the back. Small black eyes above the
   grin, two blowhole slits on top, broad blue flippers with a scalloped
   trailing edge sticking out of the sides just under the cap edge, and
   tiny tail flukes at the back.

   Pose params:
     swim   phase (rad)  flipper beat (up/down) and tail fluke beat
     puff   0..1         inflate: the ball swells up with seawater
     blow   0..1         blowhole water spout (0 = none, 1 = tall spout with spray)
     mouth  0..1         mouth open: upper and lower teeth part, dark mouth inside
     eyes   'open' | 'happy' | 'blink' | 'closed'
     roll   -1..1        roll about the long axis (+ = near side up), ±0.4 rad
     side   -1..1        ≈ cos(yaw), passed by the game (flipper cheat toward the camera)
   Anchors: top (top of the cap), head (upper front of the cap), mouth (front of
   the grin), eyeN, eyeF, body (ball centre), blowhole, spout (spray top, = blowhole
   when not blowing), finN, finF (flipper tips), tail (fluke centre).
------------------------------------------------------------------- */
const Wailmer = (() => {
  const { ell, plate, chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, BELLY = 2, TEETH = 3, FIN = 4, MOUTH = 5, TONGUE = 6, WATER = 7, HOLE = 8;
  const MAT = { BODY, BELLY, TEETH, FIN, MOUTH, TONGUE, WATER, HOLE };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#123a62', '#18507e', '#1f6096', '#3a7eb0', '#6ea8cc'], od: '#0a2240', ol: '#173e6a', ln: '#143a64' },
    // flat-shaded plates: a narrow ramp so the flippers stay a clean mid blue from any side
    [FIN]:    { r: ['#18507e', '#1c5888', '#205f94', '#2868a0', '#3274aa'], od: '#0a2240', ol: '#173e6a', ln: '#123660' },
    [BELLY]:  { r: ['#d0b484', '#e8cf9e', '#fbe4b3', '#fdefcc', '#fff8e8'], od: '#6c5222', ol: '#9c804c', ln: '#a88a5a' },
    [TEETH]:  { r: ['#96a2b4', '#c2cad8', '#eaeff5', '#ffffff', '#ffffff'], od: '#3a4458', ol: '#667286', ln: '#8490a4' },
    [MOUTH]:  { r: ['#3c0c1a', '#581426', '#761f34', '#963246', '#b44a5a'], od: '#26060f', ol: '#400b19', ln: '#400b19' },
    [TONGUE]: { r: ['#a43c52', '#c45468', '#de7282', '#ee94a0', '#f8b8c0'], od: '#5c1426', ol: '#7e2234', ln: '#8c2c40' },
    [WATER]:  { r: ['#5c9ed4', '#8cc6ee', '#c4eafc', '#e8f8ff', '#ffffff'], od: '#2a64a0', ol: '#4e8ec8', ln: '#6aa6d8' },
    [HOLE]:   { r: ['#07142c', '#0b1c3a', '#10264a', '#16305a', '#1e3c6a'], od: '#07142c', ol: '#0b1c3a', ln: '#07142c' },
  });
  // (the cap's gloss is a painted spot kept high on the head, see capMat/render: the renderer's own
  // specular would land beside the eye on a ball this big)
  const GLOSSY = { [WATER]: 1 };
  const C_BODY = code(BODY), C_BODY_HL = code(BODY, 2), C_BODY_HL2 = code(BODY, 1), C_BELLY = code(BELLY), C_TEETH = code(TEETH), C_FIN = code(FIN), C_FIN_L = code(FIN, 1);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_WATER = code(WATER), C_WATER_L = code(WATER, 1), C_HOLE = code(HOLE);

  const DEFAULT = { swim: 0, puff: 0, blow: 0, mouth: 0, eyes: 'open', roll: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross, dot = V3.dot;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const sph = Creature.sph;
  const tr = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

  /* ---------- the ball: inner cream/teeth ball + a slightly larger blue cap shell ---------- */
  const RAD = [198, 164, 180];
  const CAP_K = [1.12, 1.0, 1.05], CAP_OFF = [14, 8, 0]; // longer than the ball: the upper jaw juts forward as a snout
  const AZC = 1.8; // mouth corner azimuth: the grin runs round the sides to just behind them
  const lipV = (a) => 0.33 - 0.14 * (a / AZC) ** 2; // upper lip (cap edge) across the mouth
  const loV = (a) => 0.14 + 0.1 * (a / AZC) ** 2; // lower edge of the grin: a narrow band of teeth
  // lower edge of the blue cap all the way round (cap unit sphere; a = |azimuth|, 0 = front)
  function capV(a) {
    if (a <= AZC) return lipV(a);
    return lerp(lipV(AZC), -0.3, smooth(0, 0.6, (a - AZC) / (Math.PI - AZC)));
  }
  // grin rows for the mouth-open amount: [upper teeth bottom, cavity bottom, lower teeth bottom]
  function grin(a, mo) {
    const top = lipV(a), lo = loV(a);
    if (mo < 0.01) return [lo, lo, lo];
    const w = Math.sqrt(Math.max(0, 1 - (a / AZC) ** 2));
    const H0 = top - lo, split = top - 0.55 * H0, hole = mo * 0.36 * w;
    return [split, split - hole, split - hole - 0.45 * H0];
  }
  function bodyMat(mo) {
    return (s) => {
      const a = Math.abs(Math.atan2(s[2], s[0])), v = s[1];
      if (a < AZC) {
        const g = grin(a, mo);
        if (v > g[0]) return C_TEETH;
        if (v > g[1]) return v < g[1] + (g[0] - g[1]) * 0.4 && a < AZC * 0.75 ? C_TONGUE : C_MOUTH;
        if (v > g[2]) return C_TEETH;
        return C_BELLY;
      }
      return v > capV(a) - 0.05 ? C_BODY : C_BELLY;
    };
  }
  // blowhole slits: two short slits side by side on top, a little forward of the crown
  const BH = [[0.3, 0.953, 0.05], [0.3, 0.953, -0.05]].map(nrm);
  const BH_D = nrm([0.3, 0.953, 0]);
  let HLc = [0, 1, 0]; // gloss direction in the cap's unit-sphere frame (set per render)
  function capMat(s) {
    const a = Math.abs(Math.atan2(s[2], s[0]));
    if (s[1] < capV(a)) return 0;
    const g = s[0] * HLc[0] + s[1] * HLc[1] + s[2] * HLc[2];
    if (g > 0.9955) return g > 0.9985 ? C_BODY_HL : C_BODY_HL2;
    if (s[1] > 0.85) {
      for (const q of BH) {
        const dx = s[0] - q[0], dy = s[1] - q[1], dz = s[2] - q[2];
        // slit: long across (z), short along x/y
        if ((dx * dx + dy * dy) / 0.0009 + (dz * dz) / 0.00055 < 1) return C_HOLE;
      }
    }
    return C_BODY;
  }

  /* ---------- flippers: broad paddles with a scalloped trailing edge (u = out along the span, v = toward the leading edge) ---------- */
  const FLIP_PTS = [[-12, 32], [40, 41], [95, 45], [145, 42], [184, 33], [206, 18], [214, 2], [210, -14], [199, -27], [187, -25], [175, -35], [161, -32], [146, -41], [118, -42], [74, -36], [30, -33], [-12, -34]];
  const FLIP_LE = [[-12, 32], [40, 41], [95, 45], [145, 42], [184, 33], [206, 18], [214, 2]];
  const leV = (u) => { let i = 0; while (i < FLIP_LE.length - 2 && u > FLIP_LE[i + 1][0]) i++; const [a, b] = [FLIP_LE[i], FLIP_LE[i + 1]]; return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]); };
  // lighter band along the rounded leading edge
  const FLIP_K = 1.22;
  const FLIP_G = bakeShape(Shape2D.poly(FLIP_PTS.map(([u, v]) => [u * FLIP_K, v * FLIP_K]), 0, 8, (u, v) => (v / FLIP_K > leV(u / FLIP_K) - 11 ? C_FIN_L : C_FIN)), 0.5);
  const FLIP_LINES = [[[187, -25], [170, -10], [150, 0]], [[161, -32], [142, -17], [120, -8]]].map((pl) => ({ pts: pl.map(([u, v]) => [u * FLIP_K, v * FLIP_K, 0]), mat: FIN, useLn: true }));
  /* ---------- tail flukes (u = backward, v = sideways): two tiny lobes ---------- */
  const TAIL_PTS = [[-14, -11], [10, -15], [26, -26], [40, -37], [50, -33], [45, -18], [37, -6], [41, 0], [37, 6], [45, 18], [50, 33], [40, 37], [26, 26], [10, 15], [-14, 11]];
  const TAIL_G = bakeShape(Shape2D.poly(TAIL_PTS, C_FIN_L), 0.5);

  /* ---------- decal lines on the ball (teeth gaps, belly grooves), culled per view in render() ---------- */
  const POLE = nrm([-0.38, -1, 0]);
  const PE1 = nrm(sub([1, 0, 0], sc(POLE, POLE[0]))), PE2 = cross(POLE, PE1);
  function ballLines(mo) {
    const out = [];
    // teeth: gaps at even azimuth steps, splitting into upper / lower rows when the mouth opens
    for (let j = -8; j <= 8; j++) {
      const az = j * 0.205, a = Math.abs(az);
      if (a > AZC - 0.06) continue;
      const g = grin(a, mo), top = lipV(a) + 0.06;
      const rows = mo < 0.01 ? [[top, g[2]]] : [[top, g[0]], [g[1], g[2]]];
      for (const [v0, v1] of rows) {
        const pts = [];
        for (let k = 0; k <= 4; k++) pts.push(sph(az, lerp(v0, v1, k / 4)));
        out.push({ pts, mat: TEETH, useLn: true, teeth: j & 1 });
      }
    }
    // belly grooves: meridians of the cream ball converging low at the back
    const belly = bodyMat(mo);
    for (let k = 0; k < 10; k++) {
      const ph = ((k + 0.5) * 2 * Math.PI) / 10;
      const dir = add(sc(PE1, Math.cos(ph)), sc(PE2, Math.sin(ph)));
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const th = 0.26 + (i / 26) * 2.4;
        const q = add(sc(POLE, Math.cos(th)), sc(dir, Math.sin(th)));
        if (belly(q) !== C_BELLY) break;
        pts.push(q);
      }
      // stop just short of the grin / cap edge
      if (pts.length > 3) out.push({ pts: pts.slice(0, -1), mat: BELLY, useLn: true });
    }
    return out;
  }

  /* ---------- eye stamps (k outline/pupil, w glint) ---------- */
  const EYES_S = {
    open: ['kk', 'kk'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyF: ['k.', '.k'],
    blink: ['..', 'kk'], blinkF: ['.', 'k'],
    sleep: ['kk'], sleepF: ['k'],
  };
  const EYES_M = {
    open: ['.kk.', 'kwkk', 'kkkk', '.kk.'], openN: ['.k.', 'kwk', 'kkk', '.k.'], openF: ['kk', 'kk', 'k.'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['k.', '.k'],
    blink: ['....', '....', 'kkkk'], blinkN: ['...', '...', 'kkk'], blinkF: ['..', '..', 'kk'],
    sleep: ['k..k', '.kk.'], sleepN: ['k.k', '.k.'], sleepF: ['k.', '.k'],
  };
  const EYES_L = {
    open: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', '.kkk.'], openN: ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'], openF: ['.k.', 'kwk', 'kkk', '.k.'],
    happy: ['.kkk.', 'k...k', 'k...k'], happyN: ['.kk.', 'k..k', 'k..k'], happyF: ['.k.', 'k.k'],
    blink: ['.....', '.....', 'kkkkk'], blinkN: ['....', '....', 'kkkk'], blinkF: ['...', '...', 'kkk'],
    sleep: ['k...k', '.kkk.'], sleepN: ['k..k', '.kk.'], sleepF: ['k.k', '.k.'],
  };
  const EYES_XL = {
    open: ['..kkk..', '.kwwkk.', 'kwwkkkk', 'kwkkkkk', 'kkkkkkk', '.kkkkk.', '..kkk..'],
    openN: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', 'kkkkk', '.kkk.'], openF: ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'],
    happy: ['..kkk..', '.k...k.', 'k.....k', 'k.....k'], happyN: ['.kkk.', 'k...k', 'k...k'], happyF: ['.kk.', 'k..k', 'k..k'],
    blink: ['.......', '.......', '.......', '.kkkkk.', 'k.....k'], blinkN: ['.....', '.....', '.kkk.', 'k...k'], blinkF: ['....', '....', 'kkkk'],
    sleep: ['k.....k', '.k...k.', '..kkk..'], sleepN: ['k...k', '.kkk.'], sleepF: ['k..k', '.kk.'],
  };
  const EYEC = { k: '#0a1020', w: '#ffffff' };
  const EYE_AZ = 0.66, EYE_V = 0.5;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const puff = clamp(+P.puff || 0, 0, 1), bl = clamp(+P.blow || 0, 0, 1), mo = clamp(+P.mouth || 0, 0, 1);
    const roll = clamp(+P.roll || 0, -1, 1) * 0.4, swim = +P.swim || 0;
    const sd = P.side === undefined ? 1 : clamp(P.side, -1, 1);
    const k = 1 + 0.2 * puff;
    const rad = sc(RAD, k);
    const C = [0, rad[1], 0];
    // roll about the long axis through the ball centre (a ball: the bottom stays on the water line)
    const root = chain(T(...C), R(M3.rx(-roll)));

    /* --- inner ball (teeth + cream belly) and the blue cap shell --- */
    const bodyP = ell(root, rad, { part: 1, grp: 1, mat: bodyMat(mo) });
    const Lb = bodyP.L, LbiT = tr(M3.inv(Lb));
    bodyP.lineSrc = ballLines(mo).map((ln) => Object.assign(ln, { ns: ln.pts.map((q) => nrm(M3.v(LbiT, q))) }));
    const capF = chain(root, T(CAP_OFF[0] * k, CAP_OFF[1] * k, 0));
    const capP = ell(capF, [rad[0] * CAP_K[0], rad[1] * CAP_K[1], rad[2] * CAP_K[2]], { part: 2, grp: 2, mat: capMat });
    capP.isCap = true;
    // (cap first: it hides most of the ball, so the ball's hidden pixels are rejected early)
    prims.push(capP, bodyP);
    const onCap = (s) => ({ prim: capP, p: add(capP.c, M3.v(capP.L, s)), s });
    const onBody = (s) => add(bodyP.c, M3.v(bodyP.L, s));

    /* --- flippers: out of the sides just under the cap edge, beating up/down with swim --- */
    const beat = 0.3 * Math.sin(swim);
    for (const zs of [1, -1]) {
      const s0 = sph(zs * 1.78, 0.12);
      const n0 = nrm(M3.v(LbiT, s0));
      const p0 = sub(onBody(s0), sc(n0, 14));
      // span: out, back and down, blade held upright (leading edge on top) so its broad face
      // shows from the side and 3/4 views; the visible one opens a touch toward the camera
      const cheat = zs * sd > 0 ? 0.05 : -0.05;
      let d = nrm([-0.39, -0.34 - cheat, zs]);
      const up = [0.08, 1, 0];
      let c = nrm(sub(up, sc(d, dot(up, d))));
      const Rf = M3.mul(M3.rx(-roll), M3.rx(-zs * beat));
      d = M3.v(Rf, d); c = M3.v(Rf, c);
      const w = cross(d, c);
      const L = M3.cols(d, c, w);
      prims.push(plate(F(L, p0), FLIP_G, { part: zs > 0 ? 3 : 4, grp: zs > 0 ? 3 : 4, thick: 7, lines: FLIP_LINES }));
      anchors[zs > 0 ? 'finN' : 'finF'] = add(p0, add(sc(d, 200 * FLIP_K), sc(c, -4)));
    }

    /* --- tiny tail: a stubby blue stock at the back with two small upturned flukes, beating with swim --- */
    {
      const lift = 0.32 + 0.26 * Math.cos(swim);
      const tf = chain(root, T(-rad[0] - 8, -0.02 * rad[1], 0), R(M3.rz(-lift)));
      prims.push(ell(chain(tf, T(4, 0, 0)), [26, 17, 21], { part: 5, grp: 5, mat: () => C_BODY }));
      const Lt = M3.mul(tf.L, M3.cols([-1, 0, 0], [0, 0, 1], [0, 1, 0]));
      const p0 = inF(tf, [-12, 0, 0]);
      prims.push(plate(F(Lt, p0), TAIL_G, { part: 5, grp: 5, thick: 7 }));
      anchors.tail = add(p0, M3.v(Lt, [30, 0, 0]));
    }

    /* --- water spout from the blowhole --- */
    const bh = onCap(BH_D).p;
    anchors.blowhole = bh;
    anchors.spout = bh;
    if (bl > 0.02) {
      // a jet that widens as it rises into a bushy plume of spray, droplets arcing down round it
      const h = 50 + 150 * bl, g = 0.55 + 0.45 * bl;
      const b0 = add(bh, [0, -8, 0]);
      const W = (s) => (s[0] < -0.25 && s[1] > -0.2 ? C_WATER_L : C_WATER);
      const blob = (x, y, z, r, ry = r) => prims.push(ell(T(b0[0] + x, b0[1] + y, b0[2] + z), [r, ry, r], { part: 6, grp: 6, mat: W }));
      blob(0, h * 0.16, 0, 6 * g, h * 0.2);
      blob(0, h * 0.42, 0, 9 * g, h * 0.22);
      blob(0, h * 0.66, 0, 13 * g, h * 0.18);
      const rt = 15 + 13 * bl;
      blob(0, h * 0.86, 0, rt, rt * 0.85);
      for (let i = 0; i < 5; i++) {
        const az = (i / 5) * 2 * Math.PI + 0.6;
        blob(Math.cos(az) * rt * 1.05, h * 0.8 - (i % 2) * rt * 0.25, Math.sin(az) * rt * 1.05, rt * 0.72, rt * 0.62);
      }
      for (let i = 0; i < 9; i++) {
        const az = (i / 9) * 2 * Math.PI + 0.2, rr = rt * (1.9 + 0.35 * (i % 3));
        const r0 = (3.2 + 2.6 * bl) * (i % 3 === 1 ? 0.75 : 1);
        prims.push(ell(T(b0[0] + Math.cos(az) * rr, b0[1] + h * (0.74 - 0.13 * (i % 3)), b0[2] + Math.sin(az) * rr), [r0, r0 * 1.3, r0], { part: 7, grp: 6, mat: () => C_WATER_L }));
      }
      anchors.spout = [b0[0], b0[1] + h * 0.86 + rt * 0.85, b0[2]];
    }

    /* --- eyes: small black stamps above the grin --- */
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : P.eyes === 'closed' || P.eyes === 'sleep' ? 'sleep' : 'open';
    for (const zs of [1, -1]) {
      const at = onCap(sph(zs * EYE_AZ, EYE_V));
      stamps.push({ at, set: EYES_M, colors: EYEC, kind, near: 0.62, far: 0.34, minFacing: 0.08, flipX: zs < 0 });
      anchors[zs > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    anchors.top = onCap([0, 1, 0]).p;
    anchors.head = onCap(nrm([0.62, 0.62, 0])).p;
    anchors.mouth = onBody(sph(0, (lipV(0) + grin(0, mo)[2]) / 2));
    anchors.body = root.t;

    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 4: 2, 5: 1, 6: 3, 7: 3 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 9, shadowDepth: 40,
    };
  }

  /* ---------- render: per-view decal culling, eye size by scale, and a cropped ray-cast ---------- */
  function render(model, opt) {
    const scale = opt.scale || 1, yaw = opt.yaw ?? 1.05, pitch = opt.pitch ?? 0.16;
    const set = scale < 0.3 ? EYES_S : scale < 0.55 ? EYES_M : scale < 0.8 ? EYES_L : EYES_XL;
    for (const st of model.stamps) st.set = set;
    const M = M3.mul(M3.rx(pitch), M3.ry(-yaw));
    const cam = [M[6], M[7], M[8]];
    const thin = scale < 0.42;
    for (const p of model.prims) {
      if (!p.lineSrc) continue;
      const lines = [];
      for (const ln of p.lineSrc) {
        if (thin && ln.teeth) continue;
        let cur = [];
        for (let i = 0; i < ln.pts.length; i++) {
          const n = ln.ns[i];
          if (n[0] * cam[0] + n[1] * cam[1] + n[2] * cam[2] > 0.1) cur.push(ln.pts[i]);
          else { if (cur.length > 1) lines.push({ pts: cur, mat: ln.mat, useLn: true }); cur = []; }
        }
        if (cur.length > 1) lines.push({ pts: cur, mat: ln.mat, useLn: true });
      }
      p.lines = lines;
    }
    // gloss spot: the half vector between light and view, pulled up so it sits high on the cap
    // (as on the HOME model), taken into the cap's unit-sphere frame
    const cap = model.prims.find((p) => p.isCap);
    if (cap) {
      const Ld = V3.norm((opt.light && opt.light.dir) || [-0.5, 0.72, 0.5]);
      let hl = M3.v([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]], V3.norm(V3.add(Ld, [0, 0, 1])));
      hl = V3.norm(V3.add(hl, [0, 1.2, 0]));
      HLc = V3.norm(M3.v(M3.inv(cap.L), hl)); // normal ∝ L^-T s, so n·hl = s·(L^-1 hl)
    }
    // cast shadows (lip over the teeth, flippers) kept short on this big ball
    model.shadowSteps = scale >= 0.8 ? 5 : 9;
    return cropRender(model, opt, M);
  }

  // ray-cast only the creature's screen box, then paste it into the full-size buffer
  function cropRender(model, opt, M) {
    const { scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M, M3.diag(scale, scale, scale));
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
    const mg = 4;
    const bx0 = Math.max(0, Math.floor(ox + x0 - mg)), bx1 = Math.min(W - 1, Math.ceil(ox + x1 + mg));
    const by0 = Math.max(0, Math.floor(oy + y0 - mg)), by1 = Math.min(H - 1, Math.ceil(oy + y1 + mg));
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.85 * W * H) return Creature.render(model, opt);
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
    for (const key in r.anchors) { const a = r.anchors[key]; anchors[key] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.0, bw: 940, bh: 720, oy: 0.86 } };
})();
