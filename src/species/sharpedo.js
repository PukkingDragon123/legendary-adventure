/* ------------------------------------------------------------------
   Sharpedo — the Brutal Pokémon (1.8 m ≈ 315 px nose to tail at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0.
   y = 0 is the bottom of the belly in the rest pose; the lunge arches
   the body about its middle.

   Design (official art / HOME model): a stout, chunky torpedo that is mostly
   head. A big rounded skull with a blunt snout, cut flat at the lip plane over a
   deep hinged lower jaw whose corner sits far back, under the eye. The mouth
   gapes very wide: a maroon palate and throat, a pink tongue, big white
   triangular teeth on both jaw rims. A white snout cap, tall at the nose, curves
   back over the upper jaw as a lip band; a yellow four-point star sits on top of
   the snout. Small red eyes with three curved black stripes behind them. Dark
   navy back with a faint lighter mottling, creamy white lower jaw and belly. One
   tall swept dorsal fin with two stepped notches on its trailing edge, long
   pointed pectoral fins swept back, and a small forked tail (navy upper lobe,
   white notched lower lobe).

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
  const NAVY = 1, WHITE = 2, STAR = 3, GILL = 4, THROAT = 5, TONGUE = 6, TOOTH = 7, FIN = 8, MAW = 9, SPECK = 10;
  const MAT = { NAVY, WHITE, STAR, GILL, THROAT, TONGUE, TOOTH, FIN, MAW, SPECK };
  const NAVY_R = ['#12294f', '#1b3d6e', '#255591', '#336fb0', '#5690cc'];
  const PAL = Creature.palette({
    [NAVY]:   { r: NAVY_R, od: '#0a1733', ol: '#16356a', ln: '#11294f' },
    [FIN]:    { r: NAVY_R, od: '#0a1733', ol: '#16356a', ln: '#11294f' },
    [SPECK]:  { r: ['#173260', '#22487e', '#2d619e', '#3c79b8', '#6098d2'], od: '#0a1733', ol: '#16356a', ln: '#11294f' },
    [WHITE]:  { r: ['#8e93b4', '#b7bcd6', '#dfe2f0', '#f3f4fa', '#ffffff'], od: '#383c66', ol: '#6c719c', ln: '#7c81a8' },
    [STAR]:   { r: ['#b0801c', '#d6a42a', '#f0c83c', '#fadf70', '#fff2b0'], od: '#5c3a08', ol: '#9a6c14', ln: '#96681a' },
    [GILL]:   { r: ['#06090f', '#090d17', '#0c1220', '#111a2c', '#18233a'], od: '#03050a', ol: '#05080f', ln: '#05080f' },
    [THROAT]: { r: ['#5a1622', '#782232', '#963242', '#b04652', '#c65e66'], od: '#2c0812', ol: '#4e1220', ln: '#561420' },
    [MAW]:    { r: ['#4c1220', '#581626', '#641c2c', '#702232', '#7e2a3a'], od: '#2c0812', ol: '#4e1220', ln: '#4e1220' },
    [TONGUE]: { r: ['#bc5058', '#d8686c', '#ec8682', '#f8a69c', '#ffc8bc'], od: '#661826', ol: '#8a2a3a', ln: '#9a3a48' },
    [TOOTH]:  { r: ['#a4a8c6', '#cacde2', '#eef0f8', '#ffffff', '#ffffff'], od: '#3a3e66', ol: '#6a6e98', ln: '#8a8eb0' },
  });
  const GLOSSY = {};

  const DEFAULT = { mouth: 0, tail: 0, lunge: 0, eyes: 'open', side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sc = V3.scale, nrm = V3.norm;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const plF = (f, axes, part, grp, shape, thick) => PL(f.t, M3.mul(f.L, M3.cols(...axes)), part, grp, shape, thick);
  // straight-edged polygon plate (keeps the fin notches sharp); fn(u, v) picks the material
  const polyShape = (pts, fn) => {
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({ bb, test: (u, v) => (Shape2D.inPoly(u, v, pts) ? fn(u, v) : 0) });
  };
  const smooth = (pts, seg = 4) => Shape2D.catmull(pts, false, seg);
  const ellipseShape = (a, b, fn) => ({ bb: [-a - 0.5, -b - 0.5, a + 0.5, b + 0.5], test: (u, v) => (u * u / (a * a) + v * v / (b * b) < 1 ? fn(u, v) : 0) });

  /* ---------- geometry (body frame, before the final lift and SIZE) ---------- */
  // head + body: one big egg tipped nose-up a touch, cut flat at the lip plane in front of the mouth corner
  const SK_C = [18, 6, 0], SK_A = 0.08, SK_R = [104, 70, 62];
  const LIP = -13;                                  // lip plane (skull frame y)
  const LIP_S = LIP / SK_R[1];
  const SK_K = Math.sqrt(1 - LIP_S * LIP_S);
  const RIM_A = SK_R[0] * SK_K, RIM_B = SK_R[2] * SK_K; // skull rim ellipse (x, z half axes)
  const HX = 0;                                   // mouth corner (skull frame x, on the lip plane)
  // lower jaw: the lower front of the same egg (below the lip plane, ahead of the corner), hinged at the
  // corner, so the closed head is one seamless egg; pulled in a touch so the snout overhangs the chin
  const JAW_SX = 0.925, JAW_SZ = 0.975;
  const JRIM_A = RIM_A * JAW_SX, JRIM_B = RIM_B * JAW_SZ, JRIM_C = HX * (1 - JAW_SX); // jaw rim (skull-frame x centre)
  // tapering tail: a chain of overlapping ellipsoids from inside the egg back to the tail stock
  const TAIL_X0 = -50, TAIL_X1 = -158;
  const LIFT = 64;
  const SIZE = 0.94;

  const skullRest = (() => { const f = chain(T(...SK_C), R(M3.rz(SK_A))); return (x, y, z) => inF(f, [x, y, z]); })();
  const HINGE_B = skullRest(HX, LIP, 0);            // mouth corner in the body frame
  // egg profile (top / bottom / half width) at body-frame x, sampled numerically from the rotated ellipsoid
  const eggAt = (x) => {
    let top = -1e9, bot = 1e9, wid = 0;
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const p = skullRest(SK_R[0] * Math.cos(a), SK_R[1] * Math.sin(a), 0);
      const q = skullRest(SK_R[0] * Math.cos(a + 0.07), SK_R[1] * Math.sin(a + 0.07), 0);
      if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) {
        const y = p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0]);
        top = Math.max(top, y); bot = Math.min(bot, y);
      }
    }
    const u = (x - SK_C[0]) / SK_R[0];
    wid = SK_R[2] * Math.sqrt(Math.max(0, 1 - u * u));
    return { top, bot, wid };
  };
  const herm = (t, p0, m0, p1, m1) => { const t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1; };
  const TAIL_NODES = (() => {
    const e0 = eggAt(TAIL_X0), e1 = eggAt(TAIL_X0 + 1);
    const L = TAIL_X0 - TAIL_X1, n = 13, out = [];
    const st = { top: 22, bot: -1, wid: 8 };            // tail stock at the fin
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = TAIL_X0 - t * L;
      const top = herm(t, e0.top, (e0.top - e1.top) * L, st.top, -4);
      const bot = herm(t, e0.bot, (e0.bot - e1.bot) * L, st.bot, 3);
      const wid = herm(t, e0.wid * 0.97, (e0.wid - e1.wid) * L, st.wid, -2);
      out.push({ x, yc: (top + bot) / 2, ry: (top - bot) / 2, rz: wid, rx: i === n - 1 ? 9 : i === n - 2 ? 14 : 22, t });
    }
    return out;
  })();
  // white belly below a smooth line running from the mouth corner back and up toward the tail
  const bellyY = (x) => { const d = Math.max(0, HINGE_B[0] - x); return HINGE_B[1] - 8 + 0.1 * d + 0.0001 * d * d; };

  // soft value noise for the faint lighter mottling on the navy skin (only at big render scales)
  const hash3 = (a, b, c) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    let v = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
      v += hash3(xi + dx, yi + dy, zi + dz) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    }
    return v;
  };
  let speckOn = false;
  const C_NAVY = code(NAVY), C_SPECK = code(SPECK), C_WHITE = code(WHITE), C_STAR = code(STAR), C_GILL = code(GILL);
  const navyAt = (p) => (speckOn && vnoise(p[0] / 9, p[1] / 9, p[2] / 9) > 0.76 ? C_SPECK : C_NAVY);

  /* ---------- skull surface: navy top, white snout cap / lip band, star, eye stripes ---------- */
  const EYE_X = 28, EYE_Y = 16;                      // skull-frame (x, y) of the eye centre
  const EYE_V = EYE_Y / SK_R[1];
  const EYE_AZ = Math.acos(clamp(EYE_X / SK_R[0] / Math.sqrt(1 - EYE_V * EYE_V), -1, 1));
  let stripeR = [12.8, 20.2, 27.6], stripeW = 1.9;   // set per render from the scale
  const STAR_X = 74, STAR_AF = 30, STAR_AB = 30, STAR_AZ = 33;
  const skullMat = (s) => {
    const x = SK_R[0] * s[0], y = SK_R[1] * s[1], z = SK_R[2] * s[2];
    // open mouth in front of the corner: palate / throat prims live there
    if (y < LIP && x > HX) return 0;
    // white snout cap and lip band: tall at the nose, thinning back to the corner
    const t = clamp((x - HX) / (RIM_A - HX), 0, 1);
    if (x > HX - 3 && y < LIP + 4.5 + 11 * t * t + 24 * smoothstep(0.76, 1, t)) return C_WHITE;
    // yellow four-point star on top of the snout
    if (s[1] > 0.3) {
      const q = Math.sqrt(Math.abs(x - STAR_X) / (x > STAR_X ? STAR_AF : STAR_AB)) + Math.sqrt(Math.abs(z) / STAR_AZ);
      if (q < 1) return C_STAR;
    }
    // three black stripes curving behind the eye
    if (Math.abs(s[2]) > 0.4) {
      const dx = EYE_X - x, dy = y - EYE_Y;
      if (dx > 2) {
        const r = Math.hypot(dx, dy * 0.95);
        for (let i = 0; i < 3; i++) if (Math.abs(r - stripeR[i]) < stripeW && Math.abs(dy) < dx * (1.3 + 0.12 * i)) return C_GILL;
      }
    }
    const p = skullRest(x, y, z);
    if (p[1] < bellyY(p[0])) return C_WHITE;
    return navyAt(p);
  };
  const bodyMat = (C, Rr) => (s) => {
    const p = [C[0] + Rr[0] * s[0], C[1] + Rr[1] * s[1], C[2] + Rr[2] * s[2]];
    return p[1] < bellyY(p[0]) ? C_WHITE : navyAt(p);
  };

  /* ---------- plates (u along, v across) ---------- */
  const C_FIN = code(FIN), C_FINW = code(WHITE, 0);
  // dorsal: u runs back along the spine, v up; a tall swept fin with two stepped notches on the trailing edge
  const DORSAL = polyShape([
    [-6, -18], ...smooth([[-2, 0], [8, 30], [20, 58], [36, 84], [54, 102], [68, 110]], 4), [72, 108],
    [68, 98], [63, 88], [54, 86], [60, 73], [57, 62], [48, 60], [52, 47], [50, 32], [48, 16], [46, 0], [44, -18],
  ], () => C_FIN);
  // pectoral: long, pointed, swept back
  const PECT = polyShape([
    [-4, -15], ...smooth([[10, -15], [34, -11], [58, -6], [80, -1], [92, 2], [97, 3]], 4),
    ...smooth([[89, 6], [68, 9], [44, 12], [20, 14], [0, 14]], 4), [-4, 14],
  ], () => C_FIN);
  // tail: forked — navy upper lobe, white lower lobe with a notch on its trailing edge
  const TAILF = polyShape([
    [-10, -12], [-10, 14], ...smooth([[0, 16], [14, 32], [28, 48], [40, 60], [48, 66]], 3), [52, 64],
    ...smooth([[45, 48], [36, 28], [28, 10], [26, 0]], 3), [30, -12], [36, -26], [41, -40], [35, -41], [40, -56], [43, -70], [37, -71],
    ...smooth([[28, -54], [18, -34], [4, -16]], 3),
  ], (u, v) => (v < -3 ? C_FINW : C_FIN));
  // teeth: white triangles (u across the base, v toward the tip)
  const TOOTH_S = bakeShape(Shape2D.poly([[-8.5, 0], [0, 1], [8.5, 0], [3.2, 11], [0, 21], [-3.2, 11]], code(TOOTH, 1), 6));
  // mouth interior plates: palate (skull lip plane) and floor (jaw rim plane)
  const C_THROAT = code(THROAT, 1), C_MAW = code(MAW), C_TONGUE = code(TONGUE);
  // both carry a white gum/lip margin along the rim, where the teeth are rooted
  const LIPW = 5.5;
  const inLip = (u, v) => u * u / (RIM_A - LIPW) ** 2 + v * v / (RIM_B - LIPW) ** 2 > 1;
  const C_GUM = code(WHITE, -1);
  const PALATE = ellipseShape(RIM_A - 1.5, RIM_B - 1.5, (u, v) => (u <= HX + 1 ? 0 : inLip(u, v) ? C_GUM : C_THROAT));
  const FLOOR = ellipseShape(RIM_A - 1.5, RIM_B - 1.5, (u, v) => (u < HX + 1 ? 0 : inLip(u, v) ? C_GUM : (u - 4) ** 2 / (RIM_A * 0.64) ** 2 + v * v / (RIM_B * 0.54) ** 2 < 1 ? C_TONGUE : C_THROAT));
  // rim angles (from the snout tip) down each side of the mouth back toward the corner
  const rimTh = (n, t0, t1) => { const o = []; for (let i = 0; i < n; i++) { const t = t0 + ((t1 - t0) * i) / (n - 1); o.push(t, -t); } return o; };
  const UPPER_TEETH = rimTh(5, 0.17, 1.45);
  const LOWER_TEETH = rimTh(4, 0.5, 1.4);

  const PRI = {};
  for (let i = 1; i < 40; i++) PRI[i] = 0;
  Object.assign(PRI, { 1: 1, 2: 0, 3: 1, 5: -1, 6: 0, 7: 3, 8: 2, 9: 2, 10: 2, 11: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], stamps = [], anchors = {};
    const mo = clamp(+P.mouth || 0, 0, 1), tw = clamp(+P.tail || 0, -1, 1), lg = clamp(+P.lunge || 0, 0, 1);
    const side = P.side === undefined ? 1 : clamp(P.side, -1, 1);
    // lunge: the front half rears up about the body middle, the rear half curls down
    const root = chain(T(0, LIFT + lg * 14, 0));
    const front = chain(root, T(-50, 0, 0), R(M3.rz(lg * 0.3)), T(50, 0, 0));
    const rear = chain(root, T(-50, 0, 0), R(M3.rz(-lg * 0.2)), T(50, 0, 0));

    /* --- head + body egg (upper jaw, skull, back) */
    const skullF = chain(front, T(...SK_C), R(M3.rz(SK_A)));
    const skull = ellF(skullF, SK_R, 1, 1, skullMat);
    prims.push(skull);
    prims.push(plF(chain(skullF, T(0, LIP + 0.3, 0)), [[1, 0, 0], [0, 0, 1], [0, 1, 0]], 5, 5, PALATE, 1.2));

    /* --- lower jaw, hinged at the mouth corner */
    const open = 0.17 + mo * 1.02;   // never quite shut: the interlocked teeth always read as a zig-zag grin
    const hingeF = chain(skullF, T(HX, LIP, 0), R(M3.rz(-open)));
    const jawF = chain(hingeF, Creature.S(JAW_SX, 1, JAW_SZ), T(-HX, -LIP, 0));   // the egg, swung about the corner
    prims.push(ellF(jawF, SK_R, 2, 1, (s) => (SK_R[1] * s[1] < LIP && SK_R[0] * s[0] > HX ? C_WHITE : 0)));
    prims.push(plF(chain(jawF, T(0, LIP - 0.3, 0)), [[1, 0, 0], [0, 0, 1], [0, 1, 0]], 6, 5, FLOOR, 1.2));
    // throat: the dark back of the gape between palate and tongue (hidden inside the head when shut)
    const thF = chain(skullF, T(HX, LIP, 0), R(M3.rz(-open * 0.5)), T(20, 0, 0));
    const thH = 4 + 52 * Math.sin(open * 0.5);
    prims.push(ellF(thF, [34, thH, RIM_B * 0.7], 6, 5, () => C_MAW));

    /* --- teeth: upper row hangs from the skull rim, lower row stands on the jaw rim */
    const toothAt = (frame, cx, rx, rz, th, dirY, grow) => {
      const px = cx + rx * Math.cos(th), pz = rz * Math.sin(th);
      const out = nrm([Math.cos(th) / rx, 0, Math.sin(th) / rz]);   // rim normal (outward)
      const tang = nrm([-out[2], 0, out[0]]);
      const inset = 3.2;
      const pos = [px - out[0] * inset, 0, pz - out[2] * inset];
      const lean = 0.3;   // tips lean in toward the middle of the mouth
      const dn = [-out[0] * Math.sin(lean), dirY * Math.cos(lean), -out[2] * Math.sin(lean)];
      const L = M3.mul(frame.L, M3.cols(sc(tang, grow), sc(dn, grow), nrm(V3.cross(tang, dn))));
      return PL(inF(frame, pos), L, 7, 7, TOOTH_S, 1.8);
    };
    const upF = chain(skullF, T(0, LIP + 0.5, 0));
    for (const th of UPPER_TEETH) prims.push(toothAt(upF, 0, RIM_A, RIM_B, th, -1, 1.04 - 0.22 * Math.abs(th)));
    const lowF = chain(hingeF, T(JRIM_C - HX, -0.5, 0));
    for (const th of LOWER_TEETH) prims.push(toothAt(lowF, 0, JRIM_A, JRIM_B, th, 1, 1.0 - 0.22 * Math.abs(th)));

    /* --- tapering tail: the spine bends sideways (tail) and down (lunge) progressively */
    let tf = chain(rear, T(TAIL_X0, 0, 0)), px = TAIL_X0;
    let tailEnd = null;
    for (const nd of TAIL_NODES) {
      const k = nd.t;
      tf = chain(tf, T(nd.x - px, 0, 0), R(M3.ry(tw * 0.075 * k)), R(M3.rz(-lg * 0.05 * k)));
      px = nd.x;
      const C = [nd.x, nd.yc, 0], Rr = [nd.rx, nd.ry, nd.rz];
      prims.push(ellF(chain(tf, T(0, nd.yc, 0)), Rr, 3, 1, bodyMat(C, Rr)));
      tailEnd = chain(tf, T(0, nd.yc, 0));
    }
    const tfF = chain(tailEnd, T(4, 0, 0), R(M3.ry(tw * 0.3)), R(M3.rz(-lg * 0.2)));
    prims.push(plF(tfF, [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], 8, 8, TAILF, 2.6));

    /* --- fins */
    const dF = chain(front, T(2, 74, 0), R(M3.rz(0.14)), R(M3.rx(side * 0.05)));
    prims.push(plF(dF, [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], 9, 9, DORSAL, 4));
    const finTips = [];
    for (const sd of [1, -1]) {
      const pf = chain(front, T(8, -28, sd * 50), R(M3.ry(sd * 0.7)), R(M3.rz(-0.28)), R(M3.rx(sd * 0.5)));
      prims.push(plF(pf, [[-1, 0, 0], [0, 1, 0], [0, 0, sd]], sd > 0 ? 10 : 11, sd > 0 ? 10 : 11, PECT, 2.4));
      finTips.push(inF(pf, [-96, 3, 0]));
    }

    /* --- eyes: red stamps (angry lids slant down toward the snout) */
    const eyeKind = P.eyes === 'angry' ? 'angry' : P.eyes === 'closed' || P.eyes === 'blink' || P.eyes === 'happy' ? 'blink' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * EYE_AZ, EYE_V);
      const at = { prim: skull, p: inF(skullF, [s[0] * SK_R[0], s[1] * SK_R[1], s[2] * SK_R[2]]), s };
      stamps.push({ at, set: null, colors: EYEC, kind: eyeKind, near: 0.6, far: 0.34, minFacing: 0.2, toFront: [SK_R[0] * (1 - s[0]), -s[2] * SK_R[2]] });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    Object.assign(anchors, {
      top: inF(dF, [-70, 110, 0]),
      head: inF(skullF, [40, 10, 0]),
      mouth: inF(skullF, [(HX + RIM_A) / 2 + 16, LIP - 30 * mo, 0]),
      jawTip: inF(hingeF, [JRIM_C + JRIM_A - HX, 0, 0]),
      body: inF(skullF, [-40, 0, 0]),
      tail: inF(tfF, [-46, 0, 0]),
      finN: finTips[0], finF: finTips[1],
    });
    if (SIZE !== 1) {
      for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
      for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
      for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    }
    return { prims, anchors, pose: P, stamps, dots: [], pri: PRI, glossy: GLOSSY, baseMat: NAVY, shadowSteps: 14, shadowDepth: 30 };
  }

  /* ---------- eye stamps: k = black ring, r = red iris, w = white glint ---------- */
  const mk = (o, oN, oF, a, aN, aF, b, bN, bF) => ({ open: o, openN: oN, openF: oF, angry: a, angryN: aN, angryF: aF, blink: b, blinkN: bN, blinkF: bF });
  const EYES_S = mk(
    ['.kk.', 'krrk', 'kwrk', '.kk.'], ['.k.', 'krk', 'kwk', '.k.'], ['k', 'r', 'k'],
    ['kk..', 'kkkk', 'kwrk', '.kk.'], ['kk.', 'kwk', '.k.'], ['k', 'k'],
    ['kkkk'], ['kkk'], ['kk'],
  );
  const EYES_M = mk(
    ['.kkk.', 'krrrk', 'krwrk', 'krrrk', '.kkk.'], ['.kk.', 'krrk', 'kwrk', 'krrk', '.kk.'], ['.k.', 'krk', 'kwk', 'krk', '.k.'],
    ['kk...', 'kkkkk', 'krwrk', 'krrrk', '.kkk.'], ['kk..', 'kkkk', 'kwrk', '.kk.'], ['k.', 'kk', 'kk'],
    ['kkkkk', '.kkk.'], ['kkkk', '.kk.'], ['kkk'],
  );
  const EYES_L = mk(
    ['..kkkk..', '.krrrrk.', 'krwwrrrk', 'krwwrrrk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..kkkk..'],
    ['.kkkk.', 'krrrrk', 'kwwrrk', 'kwwrrk', 'krrrrk', 'krrrrk', '.kkkk.'],
    ['.kk.', 'krrk', 'kwrk', 'kwrk', 'krrk', '.kk.'],
    ['kk......', 'kkkk....', 'krkkkkk.', 'krwwrkkk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..kkkk..'],
    ['kk....', 'kkkk..', 'kwkkkk', 'kwwrrk', 'krrrrk', '.kkkk.'],
    ['kk..', 'kkkk', 'kwrk', 'krrk', '.kk.'],
    ['kkkkkkkk', '.kkkkkk.'], ['kkkkkk', '.kkkk.'], ['kkkk'],
  );
  const EYES_XL = mk(
    ['...kkkk...', '.kkrrrrkk.', '.krrrrrrk.', 'krrwwrrrrk', 'krrwwrrrrk', 'krrrrrrrrk', 'krrrrrrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['..kkkk..', '.krrrrk.', 'krwwrrrk', 'krwwrrrk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..kkkk..'],
    ['.kkk.', 'krrrk', 'kwwrk', 'kwwrk', 'krrrk', '.kkk.'],
    ['kkk.......', 'kkkkkk....', '.kkkkkkkk.', 'krrwwkkkkk', 'krrwwrrrrk', 'krrrrrrrrk', 'krrrrrrrrk', '.krrrrrrk.', '.kkrrrrkk.', '...kkkk...'],
    ['kk......', 'kkkkk...', 'krkkkkkk', 'krwwrrrk', 'krwwrrrk', 'krrrrrrk', '.krrrrk.', '..kkkk..'],
    ['kk...', 'kkkk.', 'kwwkk', 'kwwrk', 'krrrk', '.kkk.'],
    ['kkkkkkkkkk', '.kkkkkkkk.'], ['kkkkkkkk', '.kkkkkk.'], ['kkkkk', '.kkk.'],
  );
  const EYEC = { k: '#0c0d16', r: '#e02838', w: '#ffffff' };

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

  /* ---------- render: eye size / stripes by scale, angry lids flipped toward the snout, cropped ray-cast ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const k = scale * SIZE;
    // stripes: at least ~1 px wide with a clear gap; spread a little at small sizes so they don't merge
    stripeW = k < 0.5 ? 0.6 / k : 1.9;
    const gap = Math.max(7.4, 2.1 / k);
    stripeR = [12.8, 12.8 + gap, 12.8 + 2 * gap];
    speckOn = k >= 0.6;
    const set = k >= 0.6 ? EYES_XL : k >= 0.45 ? EYES_L : k >= 0.3 ? EYES_M : EYES_S;
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
    for (const k2 in r.anchors) { const a = r.anchors[k2]; anchors[k2] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.8, bw: 440, bh: 300, oy: 0.82 } };
})();
