/* ------------------------------------------------------------------
   Tropius — the Fruit Pokémon (2.0 m ≈ 350 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Build (after the official art): a low, pear-shaped greyish tan body on
   four short sturdy legs with pale-yellow toenails; a very long neck that
   rises almost straight up from the shoulders and arches over like a
   question mark so the small head hangs forward; a big pointed leaf lying
   over the head like a hood (plus a small leaf over each cheek); a bunch of
   yellow bananas hanging from the throat under the chin; a cape of leaves
   draped over the shoulders; four huge banana-leaf wings (midrib, veins,
   frayed tips) spreading from the back; a short tail.

   Pose params:
     flap   -1..1    leaf wings down (−1) / up (+1); 0 = spread at rest
     neck   -1..1    lower the neck (−1, head down to graze) / raise it (+1)
     mouth  0..1     jaw open amount
     step   radians  walk cycle phase, period 2π (diagonal gait, gentle body bob, tail sway);
                     exactly 0 = standing still, phase 0+ starts from a planted stride
     eyes   'open' | 'happy' | 'closed' | 'blink'
     look   -1..1    turn the head to its left (+, toward +z) / right (−), default 0
     hold   0..1     > 0.5: holds one banana (plucked from its bunch) crosswise in its mouth
                     — the "sharing fruit" shot; the jaw opens a little to grip it. Default 0
   Anchors: top, head, mouth, eyeN, eyeF, body, fruit (banana bunch, or the held banana), tail,
   wingTipN, wingTipF (front leaf tips), footFN, footFF, footBN, footBF.
   Render: cropped to the silhouette box; shadowSteps 8.
------------------------------------------------------------------- */
const Tropius = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, LEAF = 2, FRUIT = 3, STALK = 4, NAIL = 5, MOUTH = 6, TONGUE = 7, SNOUT = 8, LEAF2 = 9;
  const MAT = { BODY, LEAF, FRUIT, STALK, NAIL, MOUTH, TONGUE, SNOUT, LEAF2 };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#6c5646', '#8e7664', '#b09a86', '#c9b6a4', '#e0d2c4'], od: '#3e2e24', ol: '#6e5a4a', ln: '#6a5646' },
    [SNOUT]:  { r: ['#74604e', '#98806c', '#baa48e', '#d2c0ae', '#e8dccf'], od: '#40302a', ol: '#735e4e', ln: '#715c4c' },
    [LEAF]:   { r: ['#2a5e34', '#3d7c44', '#559c58', '#76b86c', '#a6d890'], od: '#163a1e', ol: '#2c5e32', ln: '#2f6436' },
    [LEAF2]:  { r: ['#2e6a3a', '#43884a', '#5ea860', '#80c474', '#b0e098'], od: '#163a1e', ol: '#2c5e32', ln: '#34703c' },
    [FRUIT]:  { r: ['#b8862a', '#d6a83e', '#eecb62', '#f8e094', '#fff3c8'], od: '#6a4810', ol: '#9a7020', ln: '#9e7622' },
    [STALK]:  { r: ['#3e5a1c', '#557826', '#6f9632', '#8cb04a', '#b0cc72'], od: '#22340c', ol: '#46621a', ln: '#40581a' },
    [NAIL]:   { r: ['#b89a3e', '#d6b858', '#eed47a', '#f8e6a4', '#fff6d4'], od: '#6a5018', ol: '#9a7e30', ln: '#9a7e30' },
    [MOUTH]:  { r: ['#6a2a42', '#8c3c58', '#b0587a', '#cc7c9a', '#e6a4bc'], od: '#3c1024', ol: '#5c1e36', ln: '#5c1e36' },
    [TONGUE]: { r: ['#b45a7a', '#d07896', '#e89ab2', '#fcbcd0', '#ffdce6'], od: '#6a1e3a', ol: '#8a2c4c', ln: '#a04462' },
  });
  const GLOSSY = { [FRUIT]: 1 };

  const DEFAULT = { flap: 0, neck: 0, mouth: 0, step: 0, eyes: 'open', look: 0, hold: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat, lines) => ({ kind: 'ell', part, grp, c, L, mat, lines });
  const PL = (c, L, part, grp, shape, thick, lines) => ({ kind: 'plate', part, grp, c, L, shape, thick, lines });
  const ellF = (f, r, part, grp, mat, lines) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat, lines);
  const MIRZ = M3.diag(1, 1, -1);
  function axesAlong(d, up) {
    const X = nrm(d);
    let Z = cross(X, up);
    if (len3(Z) < 1e-4) Z = cross(X, [0, 0, 1]);
    Z = nrm(Z);
    return M3.cols(X, cross(Z, X), Z);
  }
  // ellipsoid spanning p0 → p1 along its local x axis
  function seg(p0, p1, ry, rz, up, part, grp, mat, over = 1.15) {
    const d = sub(p1, p0), l = len3(d);
    return E(sc(add(p0, p1), 0.5), M3.mul(axesAlong(d, up), M3.diag((l / 2) * over, ry, rz)), part, grp, mat);
  }
  const rotAxis = (a, t) => {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  };

  const C_BODY = code(BODY), C_BODY_L = code(BODY, 1), C_SNOUT = code(SNOUT), C_FRUIT = code(FRUIT), C_STALK = code(STALK);
  const C_NAIL = code(NAIL), C_MOUTH = code(MOUTH), C_LEAF = code(LEAF), C_LEAF_L = code(LEAF, 1), C_LEAF2 = code(LEAF2);
  const M_BODY = () => C_BODY, M_FRUIT = () => C_FRUIT, M_STALK = () => C_STALK, M_NAIL = () => C_NAIL, M_MOUTH = () => C_MOUTH, M_SNOUT = () => C_SNOUT;

  /* ---------- leaf shapes (u = along the leaf from the stalk, v = across; one half per plate) ----------
     kind 'wing': broad banana leaf, rounded blunt end, the outer part frayed into slanted strips.
     kind 'cape': slim pointed leaf. */
  function leafHalf(L, W, top, mat, kind, matB = mat) {
    // top: true = upper half, false = lower half, null = the whole leaf (upper half `mat`, lower `matB`)
    const wing = kind === 'wing';
    const hw = (u) => {
      const t = u / L;
      if (t < 0 || t > 1) return -1;
      if (wing) {
        const base = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, t / 0.42)), 0.8);
        const tip = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1;
        return Math.max(t < 0.04 ? 2.6 : 0, W * base * (0.25 + 0.75 * tip));
      }
      return Math.max(t < 0.05 ? 1.6 : 0, W * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.3 * t));
    };
    const P = 17; // fray strip period (units)
    const test = (u, v) => {
      const h = hw(u);
      if (h < 0) return 0;
      const a = top === null ? Math.abs(v) : top ? v : -v;
      if (a < -0.5 || a > h) return 0;
      if (wing) {
        const t = u / L, e = a / Math.max(1, h);
        const fz = smooth(0.5, 0.72, t);
        if (fz > 0 && e > 0.28) {
          const s = (u + a * 1.15) / P;
          const g = 0.5 * fz * (e - 0.28) / 0.72;
          if (s - Math.floor(s) < g) return 0;
        }
      }
      return top === null && v < 0 ? matB : mat;
    };
    // (split along the leaf so each plate's screen box stays tight)
    const cuts = wing ? [-1, L * 0.2, L * 0.4, L * 0.6, L * 0.8, L + 1] : [-1, L + 1];
    const plates = [];
    for (let k = 0; k < cuts.length - 1; k++) {
      const u0 = cuts[k], u1 = cuts[k + 1];
      let wmax = 0;
      for (let u = u0; u <= u1; u += 0.5) wmax = Math.max(wmax, hw(Math.min(L, Math.max(0, u))));
      plates.push(bakeShape({
        bb: [u0 - 0.5, top ? -0.6 : -wmax - 1, u1 + 0.5, top !== false ? wmax + 1 : 0.6],
        test: (u, v) => (u < u0 || u > u1 ? 0 : test(u, v)),
      }, 0.5));
    }
    const lines = [];
    // midrib + side veins (in the half's own coordinates)
    lines.push({ pts: [[2, 0, 0], [L * 0.5, 0, 0], [L * (wing ? 0.9 : 0.95), 0, 0]], mat: LEAF, useLn: true });
    if (wing) {
      for (let k = 1; k <= 3; k++) {
        const u0 = L * (0.08 + k * 0.15), u1 = u0 + L * 0.1;
        for (const sg of top === null ? [1, -1] : [top ? 1 : -1]) lines.push({ pts: [[u0, 0, 0], [u1, hw(u1) * 0.8 * sg, 0]], mat: LEAF, useLn: true });
      }
    }
    return { plates, lines, L };
  }
  const WING_L = 226, WING_W = 52;
  const WING_F = leafHalf(WING_L, WING_W, null, C_LEAF, 'wing', C_LEAF_L), WING_U = leafHalf(WING_L, WING_W, null, code(LEAF2, 1), 'wing', C_LEAF2);
  const WING2_L = 200, WING2_W = 47;
  const WING2_F = leafHalf(WING2_L, WING2_W, null, C_LEAF, 'wing', C_LEAF_L), WING2_U = leafHalf(WING2_L, WING2_W, null, code(LEAF2, 1), 'wing', C_LEAF2);
  const CAPE_L = 92, CAPE_W = 22;
  const CAPE_F = leafHalf(CAPE_L, CAPE_W, null, C_LEAF2, 'cape', code(LEAF2, 1));

  /* ---------- eye stamps (small gentle eyes) ---------- */
  const EYES_S = {
    open: ['kk', 'kk'], openN: ['k', 'k'], openF: ['k', 'k'],
    happy: ['.k.', 'k.k'], happyN: ['k.', '.k'], happyF: ['k'],
    blink: ['kkk'], blinkN: ['kk'], blinkF: ['k'],
    sleep: ['k.k', '.k.'], sleepN: ['kk'], sleepF: ['k'],
  };
  const EYES_L = {
    open: ['.kk.', 'kwkk', 'kkkk', '.kk.'],
    openN: ['.k.', 'wkk', 'kkk', '.k.'],
    openF: ['kk', 'wk', 'kk'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['k.', '.k'],
    blink: ['kkkk', '.kk.'], blinkN: ['kkk', '.k.'], blinkF: ['kk'],
    sleep: ['k..k', '.kk.'], sleepN: ['k.k', '.k.'], sleepF: ['k.', '.k'],
  };
  const EYEC = { k: '#1c140e', w: '#ffffff', b: '#5a3a22' };

  // hood leaf over the head (ellipsoid shell, unit-sphere coords: x forward, y up, z side)
  const HOOD_LINES = [{ pts: [[-0.75, 0.66, 0], [-0.3, 0.95, 0], [0.2, 0.98, 0], [0.62, 0.78, 0], [0.9, 0.42, 0]], mat: LEAF, useLn: true }];
  const hoodMat = (s) => {
    const x = s[0], az = Math.abs(s[2]);
    // outline seen from above: pointed at the front, rounded at the back; hangs lower at the sides
    const w = x > 0.1 ? 1.02 - 0.95 * ((x - 0.1) / 0.9) ** 1.4 : 1;
    if (az > w) return 0;
    if (s[1] < -0.28 + 0.5 * Math.max(0, x - 0.35) - 0.12 * Math.max(0, -x)) return 0;
    return az > 0.72 * w ? C_LEAF_L : C_LEAF;
  };
  const cheekMat = (s) => (Math.abs(s[1]) > 1.02 - 0.9 * Math.max(0, s[0]) ** 1.3 ? 0 : C_LEAF2);

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const hold = (+P.hold || 0) > 0.5;
    const flap = clamp(+P.flap || 0, -1, 1), nk = clamp(+P.neck || 0, -1, 1), mo = Math.max(clamp(+P.mouth || 0, 0, 1), hold ? 0.22 : 0);
    const step = +P.step || 0, walking = step !== 0;
    // body bob: lowest when the diagonal pairs swap (phase 0, π), highest mid-swing
    const bob = walking ? 1.5 - 3 * Math.abs(Math.cos(step)) : 0;
    const body = chain(T(0, bob, 0), T(0, 90, 0), R(M3.rz(walking ? Math.sin(step * 2) * 0.012 : 0)), T(0, -90, 0));

    /* --- torso: low pear-shaped barrel (heavier rump), chest; lighter belly --- */
    const bellyMat = (s) => (s[1] < -0.55 ? C_BODY_L : C_BODY);
    prims.push(ellF(chain(body, T(-18, 92, 0), R(M3.rz(0.06))), [98, 54, 64], 1, 1, bellyMat));
    prims.push(ellF(chain(body, T(-68, 88, 0)), [56, 56, 62], 1, 1, bellyMat));
    prims.push(ellF(chain(body, T(52, 100, 0), R(M3.rz(-0.5))), [50, 52, 52], 1, 1, bellyMat));

    /* --- tail: short thick taper --- */
    const TAILP = [[-116, 96], [-136, 88], [-152, 78], [-164, 69]];
    TAILP.forEach(([x, y], i) => {
      const t = i / (TAILP.length - 1);
      const a = TAILP[Math.max(0, i - 1)], b = TAILP[Math.min(TAILP.length - 1, i + 1)];
      const sw = walking ? Math.sin(step) * 6 * t : 0;
      const half = i === TAILP.length - 1 ? 9 : 26;
      prims.push(E(inF(body, [x, y, sw]), M3.mul(body.L, M3.mul(axesAlong([b[0] - a[0], b[1] - a[1], 0], [0, 1, 0]), M3.diag(half, lerp(28, 8, t), lerp(28, 8, t)))), 2, 1, M_BODY));
    });
    anchors.tail = inF(body, [-170, 66, 0]);

    /* --- legs: four short sturdy pillars, diagonal gait, three toenails each --- */
    const LEGS = [
      { x: 56, z: 40, ph: 0, id: 3, key: 'footFN' }, { x: 56, z: -40, ph: Math.PI, id: 4, key: 'footFF' },
      { x: -76, z: 42, ph: Math.PI, id: 5, key: 'footBN' }, { x: -76, z: -42, ph: 0, id: 6, key: 'footBF' },
    ];
    for (const lg of LEGS) {
      const ph = step + lg.ph;
      // a foot swings forward (lifted) while sin(ph) > 0, and is planted, sliding back otherwise
      const swing = walking ? -Math.cos(ph) * 13 : 0, lift = walking ? Math.max(0, Math.sin(ph)) * 9 : 0;
      const hip = inF(body, [lg.x, 76, lg.z * 1.0]);
      const foot = [lg.x + swing, 12 + lift, lg.z * 1.1];
      prims.push(seg(hip, add(foot, [1, 0, 0]), 26, 26, [0, 0, 1], lg.id, lg.id, M_BODY, 1.0));
      prims.push(ellF(F(M3.I(), add(foot, [4, -2, 0])), [29, 10, 28], lg.id, lg.id, M_BODY));
      for (const ta of [-0.62, 0, 0.62]) {
        const c = add(foot, [5 + 27 * Math.cos(ta) * 0.92, -3.5, 25 * Math.sin(ta) * 0.92]);
        prims.push(ellF(F(M3.ry(-ta), c), [7.4, 6.4, 7.2], lg.id, lg.id, M_NAIL));
      }
      anchors[lg.key] = foot;
    }

    /* --- neck: rises almost straight up from the shoulders, then arches forward (a question mark) --- */
    const nb = inF(body, [72, 124, 0]); // neck base
    const low = Math.max(0, -nk), high = Math.max(0, nk);
    const phi0 = 1.62 - 1.1 * low + 0.02 * high;            // heading at the base (rad, 0 = forward)
    const turn = 2.55 - 0.35 * low - 0.8 * high;            // total forward bend along the neck
    const NL = 312 - 60 * low, segs = 24, ds = NL / segs;
    const NECK = [], DIRS = [];
    let p = nb;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const phi = phi0 - turn * Math.pow(t, 2.3 + 0.6 * high - 1.2 * low);
      const d = [Math.cos(phi), Math.sin(phi), 0];
      NECK.push(p); DIRS.push(d);
      p = add(p, sc(d, ds));
    }
    let topY = -1e9, topP = null;
    for (let i = 0; i < NECK.length; i++) {
      const t = i / (NECK.length - 1);
      const r = lerp(31, 17, Math.pow(t, 0.8));
      if (NECK[i][1] + r > topY) { topY = NECK[i][1] + r; topP = add(NECK[i], [0, r, 0]); }
      // long, heavily overlapping pieces (their length limited by the local bend) keep the tube's shading smooth
      const da = DIRS[Math.max(0, i - 1)], db = DIRS[Math.min(segs, i + 1)];
      const bendR = (2 * ds) / Math.max(1e-3, Math.acos(clamp(da[0] * db[0] + da[1] * db[1], -1, 1)));
      const half = i === segs ? 16 : i === 0 ? r : clamp(0.55 * bendR, ds * 1.6, 44);
      prims.push(E(NECK[i], M3.mul(axesAlong(DIRS[i], [0, 0, 1]), M3.diag(half, r, r)), 7, 7, M_BODY));
    }
    const top = NECK[NECK.length - 1], endD = DIRS[DIRS.length - 1];
    const endPhi = Math.atan2(endD[1], endD[0]);
    // the head is held more level than the end of the neck
    const headPhi = clamp(endPhi * 0.5 - 0.12, -1.2, 0.3);
    const head = chain(F(M3.I(), top), R(M3.rz(headPhi)), R(M3.ry(clamp(+P.look || 0, -1, 1) * 0.5)), T(12, 2, 0));

    /* --- head: small cranium + snout, hinged jaw, mouth interior --- */
    const HR = [23, 20, 19];
    const cran = ellF(head, HR, 8, 8, M_BODY);
    prims.push(cran);
    prims.push(ellF(chain(head, T(20, -5, 0), R(M3.rz(-0.06))), [20, 12.5, 14], 8, 8, M_SNOUT));
    const hinge = [4, -11, 0];
    const jawF = chain(head, T(...hinge), R(M3.rz(-mo * 0.5)));
    prims.push(ellF(chain(jawF, T(16, -2.5, 0), R(M3.rz(0.05))), [18, 6.8, 12.5], 9, 9, (s) => (s[1] > 0.55 && mo > 0.05 ? code(TONGUE) : C_SNOUT)));
    if (mo > 0.03) {
      const mid = chain(head, T(...hinge), R(M3.rz(-mo * 0.25)));
      prims.push(ellF(chain(mid, T(16, -1, 0)), [16, 4.5 + mo * 3, 11], 10, 10, M_MOUTH));
    }
    // hood leaf over the head, pointed tip reaching past the snout
    const hoodF = chain(head, T(10, 4, 0), R(M3.rz(-0.2)));
    prims.push(ellF(hoodF, [44, 23, 25], 11, 11, hoodMat, HOOD_LINES));
    // a small leaf over each cheek, pointing forward and down
    for (const sd of [1, -1]) {
      const cf = chain(head, T(-2, -2, sd * 16), R(M3.ry(sd * 0.35)), R(M3.rz(-0.75)), T(10, 0, 0));
      prims.push(ellF(cf, [22, 11, 4.5], 12, 12, cheekMat));
    }
    anchors.top = topP;
    // (if the head is the highest thing, e.g. neck raised, the top anchor is over the hood)
    const hoodTop = inF(hoodF, [0, 23, 0]);
    if (hoodTop[1] > anchors.top[1]) anchors.top = hoodTop;

    /* --- banana bunch hanging from the throat under the chin --- */
    const nA = NECK[Math.round(segs * 0.86)], nB = NECK[segs];
    const nDir = nrm(sub(nB, nA));
    const down = nrm([nDir[1], -nDir[0], 0]); // the throat side of the neck end (under the chin)
    const fb = add(add(nA, sc(sub(nB, nA), 0.7)), sc(down, 16));
    prims.push(E(fb, M3.mul(axesAlong(nDir, [0, 0, 1]), M3.diag(9, 9, 11)), 13, 13, M_STALK));
    const BAN = [[-1.2, 0], [-0.45, 0.2], [0.3, 0], [1.2, 0.2], [0, 1], [1.9, 0.5], [-1.9, 0.5]];
    const fwdH = nrm([Math.cos(headPhi), 0, 0]);
    for (const [i, [a, lo]] of BAN.entries()) {
      if (hold && i === 2) continue; // the front banana is the one it plucked
      const out = nrm(add(sc(fwdH, Math.cos(a) * 0.8 - 0.2), [0, 0, Math.sin(a)]));
      const root = add(fb, add(sc(out, 8 - lo * 2), [0, -3 - lo * 7, 0]));
      const hang = nrm(add(sc(out, 0.22), [0, -1, 0]));
      const mid = add(root, sc(hang, 19));
      const tipD = nrm(add(sc(out, 0.7), [0, -0.8, 0]));
      const id = 14 + (i % 2);
      prims.push(seg(root, mid, 7, 7.6, [0, 1, 0], id, id, M_FRUIT, 1.3));
      prims.push(seg(mid, add(mid, sc(tipD, 17)), 6.2, 6.8, [0, 1, 0], id, id, M_FRUIT, 1.25));
    }
    anchors.fruit = add(fb, [0, -26, 0]);
    if (hold) {
      // a banana held crosswise in the mouth, curving slightly, tips sticking out on both sides
      const bc = inF(head, [30, -11 - mo * 3, 0]);
      const side = M3.v(head.L, [0, 0, 1]), upH = M3.v(head.L, [0, 1, 0]);
      for (const sd of [1, -1]) {
        const p0 = add(bc, sc(side, sd * 3)), pm = add(bc, sc(side, sd * 15)), p1 = add(add(bc, sc(side, sd * 27)), sc(upH, 4));
        prims.push(seg(p0, pm, 5.6, 5.8, upH, 15, 15, M_FRUIT, 1.25));
        prims.push(seg(pm, p1, 5, 5.2, upH, 15, 15, M_FRUIT, 1.2));
      }
      anchors.fruit = bc;
    }

    /* --- cape: leaves draped over the shoulders around the neck base --- */
    const CAPE = [
      // [attach x, y, z], direction (body frame), leaf plane roll
      [[70, 150, 22], [0.25, -1, 0.55]], [[56, 158, 30], [-0.3, -0.9, 0.75]], [[40, 160, 24], [-0.85, -0.55, 0.55]],
      [[46, 164, 0], [-1, -0.35, 0]],
    ];
    const capeList = [];
    for (const [at, d] of CAPE) {
      capeList.push([at, d]);
      if (at[2] !== 0) capeList.push([[at[0], at[1], -at[2]], [d[0], d[1], -d[2]]]);
    }
    for (const [i, [at, d]] of capeList.entries()) {
      const dir = nrm(d);
      // leaf plane lies on the body: normal ≈ away from the torso centre
      const pc = add(at, sc(dir, CAPE_L * 0.5));
      const outN = nrm(sub(pc, [0, 60, 0]));
      const acr = nrm(cross(outN, dir));
      const nrmL = cross(dir, acr);
      const Lm = M3.mul(body.L, M3.cols(dir, acr, nrmL));
      const base = inF(body, at);
      const g = 20 + (i % 2);
      prims.push(PL(base, Lm, g, g, CAPE_F.plates[0], 2, CAPE_F.lines));
    }

    /* --- leaf wings on the back: two per side, V-folded plates with veins --- */
    const tips = [];
    for (const sd of [1, -1]) {
      for (const [k, W] of [[0, { at: [4, 148, 22], d: [0.62, 0.36, 0.7], roll: 0.85, F: WING_F, U: WING_U, L: WING_L }], [1, { at: [-34, 146, 24], d: [-0.3, 0.52, 0.8], roll: 0.5, F: WING2_F, U: WING2_U, L: WING2_L }]]) {
        const lift = flap * (k ? 0.62 : 0.7) + (walking ? Math.sin(step * 2 + k) * 0.03 : 0);
        const d = nrm(W.d);
        const A = axesAlong(d, [0, 1, 0]);
        const upN = [A[1], A[4], A[7]];
        const acr = [A[2], A[5], A[8]];
        let Lm = M3.cols(d, acr, upN);
        Lm = M3.mul(rotAxis(d, -W.roll), Lm);
        Lm = M3.mul(M3.rx(-lift), Lm);
        let at = W.at;
        if (sd < 0) { Lm = M3.mul(MIRZ, Lm); at = [at[0], at[1], -at[2]]; }
        const base = inF(body, at);
        const LL = M3.mul(body.L, Lm);
        const g = sd > 0 ? 16 + k : 18 + k;
        // (the paler underside shape is swapped in at render time when the camera sees the leaf from below)
        for (const [j, pl] of W.F.plates.entries()) prims.push(Object.assign(PL(base, LL, g, g, pl, 2, j === 0 ? W.F.lines : null), { top: pl, under: W.U.plates[j] }));
        if (k === 0) tips.push(add(base, M3.v(LL, [W.L, 0, 0])));
      }
    }
    anchors.wingTipN = tips[0]; anchors.wingTipF = tips[1];

    /* --- eyes (stamps on the cranium, just under the hood's rim) --- */
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : P.eyes === 'closed' ? 'sleep' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * 0.62, 0.05);
      const at = { prim: cran, p: add(cran.c, M3.v(cran.L, s)), s };
      stamps.push({ at, set: EYES_L, colors: EYEC, kind, near: 0.7, far: 0.4 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.mouth = inF(head, [36, -11, 0]);
    anchors.head = head.t;
    anchors.body = inF(body, [0, 96, 0]);

    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3, 10: 2, 11: 4, 12: 5, 13: 3, 14: 4, 15: 4, 16: 2, 17: 2, 18: 2, 19: 2, 20: 3, 21: 3 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 8, shadowDepth: 30,
    };
  }

  /* ---------- render: ray-cast only the creature's screen box, then paste into the full buffer ---------- */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const set = scale >= 0.8 ? EYES_L : EYES_S;
    for (const st of model.stamps) st.set = set;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    for (const p of model.prims) if (p.under) p.shape = V[6] * p.L[2] + V[7] * p.L[5] + V[8] * p.L[8] >= 0 ? p.top : p.under;
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 2.0, bw: 660, bh: 500, oy: 0.88 } };
})();
