/* ------------------------------------------------------------------
   Swampert — the Mud Fish Pokémon (1.5 m ≈ 262 units tall at scale 1,
   head fins included). Marshtomp's evolution, in the same visual
   language as src/species/marshtomp.js (glossy blue skin, orange gills).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a big, hunched sky-blue amphibian. A fairly small,
   broad head on a thick neck carries two huge rounded slate-grey ribbed
   fins side by side (each taller than the head); orange eyes with black
   pupils sit right in front of their bases; a very wide mouth, pale
   lower jaw, and a pale stripe running down the throat and chest. Spiky
   peach-orange three-pointed gills on the cheeks. Long arms: slim upper
   arms, massive forearms with orange two-segment pads, big flat hands
   with three long fingers that reach the ground. Bent legs with padded
   thighs, long three-toed feet, and a short tail carrying a huge slate
   sail fin that rises behind the back.

   Pose params:
     walk    radians  walk-cycle phase (legs swing with sin(walk), arms
                      counter-swing, body bobs and rocks); exactly 0 = standing
     crouch  0..1     low guard / pounce stance (official art pose): knees
                      bend, hips drop, the body leans far forward and the
                      big hands plant flat on the ground ahead
     roar    0..1     roar: chest rises, head tilts back, arms spread wide,
                      head fins flare; also opens the mouth (max(mouth, roar))
     mouth   0..1     mouth open (the wide mouth opens; tongue shows)
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    optional, ≈ 3·cos(yaw): the tail fin turns a little
                      toward the camera so it reads (default 1)
   Anchors: top (fin peak), head, mouth, eyeN, eyeF, body, belly, finN, finF,
            handN, handF, footN, footF, tail (tail root), tailTip (fin tip).
------------------------------------------------------------------- */
const Swampert = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials (colours sampled from the official art)
  const BODY = 1, BELLY = 2, FIN = 3, ORANGE = 4, MOUTH = 5, TONGUE = 6, LINE = 7, EYE = 8, IRIS = 9, SHINE = 10;
  const MAT = { BODY, BELLY, FIN, ORANGE, MOUTH, TONGUE, LINE, EYE, IRIS, SHINE };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#4c7cab', '#6a9dca', '#88b8e0', '#a8cdec', '#cfe4f6'], od: '#1a3558', ol: '#36628c', ln: '#44729e' },
    [BELLY]:  { r: ['#9ab0b6', '#bccfd2', '#deebeb', '#eef6f6', '#ffffff'], od: '#2e4c5a', ol: '#62828e', ln: '#86a0a8' },
    [FIN]:    { r: ['#2c333d', '#3d4551', '#4f5864', '#646e7b', '#7e8896'], od: '#131715', ol: '#262c32', ln: '#343a42' },
    [ORANGE]: { r: ['#b87648', '#d8975f', '#f4bb8b', '#fcd2a8', '#ffe8cc'], od: '#6a3a1a', ol: '#9a5e34', ln: '#b0703e' },
    [MOUTH]:  { r: ['#6e4458', '#8e6076', '#ba91a4', '#cca6b6', '#dcbcc8'], od: '#3e1e2e', ol: '#5e3446', ln: '#5e3446' },
    [TONGUE]: { r: ['#b06882', '#c8849c', '#dea2b4', '#eebccb', '#fad8e0'], od: '#62203a', ol: '#82344e', ln: '#a04c66' },
    [LINE]:   { r: ['#1a3558', '#1a3558', '#1a3558', '#1a3558', '#1a3558'], od: '#1a3558', ol: '#36628c', ln: '#1a3558' },
    [EYE]:    { r: ['#0e1012', '#0e1012', '#0e1012', '#0e1012', '#0e1012'], od: '#0a0c0e', ol: '#0e1012', ln: '#0e1012' },
    [IRIS]:   { r: ['#c86a24', '#dc7e30', '#ee9440', '#f8ac5c', '#f8ac5c'], od: '#5a2008', ol: '#8a3810', ln: '#8a3810' },
    [SHINE]:  { r: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#606878', ol: '#8890a0', ln: '#8890a0' },
  });
  const GLOSSY = { [BODY]: 1 };
  const C_BODY = code(BODY), C_BELLY = code(BELLY), C_FIN = code(FIN), C_OR = code(ORANGE), C_OR_L = code(ORANGE, 1), C_OR_D = code(ORANGE, -1);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_LINE = code(LINE), C_EYE = code(EYE), C_IRIS = code(IRIS), C_SHINE = code(SHINE);
  const M_BODY = () => C_BODY;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const ellAx = (c, X, Y, Z, r, part, grp, mat) => E(c, M3.cols(sc(X, r[0]), sc(Y, r[1]), sc(Z, r[2])), part, grp, mat);
  // orthonormal frame with Y along d and X as close as possible to `fwd`
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  // ellipsoid spanning p0 → p1 along its local y axis (x kept close to `fwd`)
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], over = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return ellAx(sc(add(p0, p1), 0.5), X, Y, Z, [rx, (l / 2) * over, rz], part, grp, mat);
  }
  // two-bone limb: knee/elbow bulges toward `bend` (world dir); bones of length L each
  function joint(a, b, L, bend) {
    const d = sub(b, a), l = len3(d), m = sc(add(a, b), 0.5);
    const u = nrm(d);
    let p = sub(bend, sc(u, dot(bend, u)));
    p = len3(p) < 1e-4 ? [1, 0, 0] : nrm(p);
    return add(m, sc(p, Math.sqrt(Math.max(0, L * L - (l / 2) * (l / 2)))));
  }
  // a fin as a clipped, very flat ellipsoid (stays solid when seen edge-on): frame f (x = u, y = v, z = normal),
  // G = baked 2D shape in (u, v), th = half thickness; ribs = polylines in (u, v)
  function finEll(f, G, th, part, grp, ribs) {
    const [u0, v0, u1, v1] = G.bb;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ru = ((u1 - u0) / 2) * 1.42, rv = ((v1 - v0) / 2) * 1.42;
    const prim = E(inF(f, [cu, cv, 0]), M3.mul(f.L, M3.diag(ru, rv, th)), part, grp, (s) => G.test(cu + ru * s[0], cv + rv * s[1]));
    if (ribs) prim.lines = ribs.map((pl) => ({ pts: pl.map(([u, v]) => [(u - cu) / ru, (v - cv) / rv, 0]), mat: FIN, useLn: true }));
    return prim;
  }

  let curScale = 1;

  // orange two-segment pad on the outer face of a limb ellipsoid (local y = along the limb, z = outward)
  const padMat = (y0, y1, wx) => (s) => {
    if (s[2] < 0.2) return C_BODY;
    const mid = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const dy = (s[1] - mid) / hy, dx = s[0] / wx;
    if (dx * dx + dy * dy < 1) {
      const lw = Math.max(0.05, 0.7 / (curScale * 20));
      if (Math.abs(s[1] - mid) < lw) return C_OR_D;
      return C_OR;
    }
    return C_BODY;
  };

  /* ---------- torso (torso frame: origin at the hip centre, y up the spine) ---------- */
  // pale stripe down the front of the throat, chest and belly
  const stripe = (w) => (s) => (s[0] > 0.5 && Math.abs(s[2]) < w ? C_BELLY : C_BODY);
  const chestMat = stripe(0.38), neckMat = (s) => (s[0] > 0.3 && Math.abs(s[2]) < 0.62 ? C_BELLY : C_BODY);

  /* ---------- head (head frame: origin at the head centre) ---------- */
  const HR = [37, 29, 43];
  const EYE_AZ = 0.46, EYE_V = 0.4;
  const mouthV = (az) => { const k = az / 1.2; return -0.2 + 0.26 * k * k; }; // very wide mouth, corners up
  // orange eyes as scale-aware decals: dark rim, orange iris, black pupil, white glint
  function eyePix(ea, eb, sd, kind) {
    const pu = 1 / (curScale * HR[2]), pv = 1 / (curScale * HR[1]);
    const ru = Math.max(0.19, 2.6 * pu), rv = Math.max(0.25, 2.9 * pv);
    const x = ea / ru, y = eb / rv;
    if (Math.abs(x) > 1.2 || Math.abs(y) > 1.3) return 0;
    const lw = Math.max(0.16, (0.8 * pv) / rv);
    if (kind === 'happy') return Math.abs(x) < 1 && Math.abs(y - (0.35 - 1.0 * x * x)) < lw ? C_EYE : 0;
    if (kind === 'blink') return Math.abs(x) < 1 && Math.abs(y + 0.15) < lw ? C_EYE : 0;
    if (kind === 'closed') return Math.abs(x) < 1 && Math.abs(y - (-0.3 + 0.7 * x * x)) < lw ? C_EYE : 0;
    const d = x * x + y * y;
    if (d > 1) return 0;
    const gx = x + 0.3 * sd, gy = y - 0.42, gr = Math.max(0.24, (0.8 * pu) / ru);
    if (gx * gx + gy * gy < gr * gr) return C_SHINE;
    const qx = (x - 0.1 * sd) / 0.42, qy = (y + 0.05) / 0.7;
    if (qx * qx + qy * qy < 1) return C_EYE;
    const rim = Math.max(0.35, 1 - (1.1 * pu) / ru);
    return d < rim * rim ? C_IRIS : C_EYE;
  }
  function headMat(mo, kind) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      if (v > 0.1 && a > 0.2 && a < 0.8) {
        const sd = az > 0 ? 1 : -1, cv = Math.sqrt(Math.max(0, 1 - v * v));
        const e = eyePix((az - sd * EYE_AZ) * cv, v - EYE_V, sd, kind);
        if (e) return e;
      }
      if (a < 1.35) {
        const vm = mouthV(az);
        const h = mo * 0.95 * Math.max(0, 1 - (az / 1.15) ** 1.6);
        if (h > 0.03 && v < vm && v > vm - h) return v < vm - h * 0.55 && a < 0.8 ? C_TONGUE : C_MOUTH;
        if (h <= 0.03 && a < 1.25) {
          const lw = Math.max(0.03, 0.65 / (curScale * HR[1]));
          if (Math.abs(v - vm) < lw) return C_LINE;
        }
        if (v < vm - h && a < 1.15) return C_BELLY; // pale lower jaw
      }
      return C_BODY;
    };
  }

  /* ---------- fins ---------- */
  // head fin (u = sideways/out, v = up; base at the origin): a tall, round-topped blade with ribs from the base
  const HFIN_P = [[-17, -4], [-24, 14], [-28, 36], [-27, 56], [-18, 71], [-2, 78], [15, 75], [26, 60], [30, 38], [25, 14], [15, -4], [0, -8]];
  const HFS = 1.32; HFIN_P.forEach((q) => { q[0] *= HFS * 1.1; q[1] *= HFS; });
  const HFIN_G = bakeShape(Shape2D.poly(HFIN_P, C_FIN, 8));
  const HFIN_RIB = [[[-8, 4], [-16, 32], [-17, 58]], [[0, 4], [-1, 40], [-1, 72]], [[8, 4], [15, 34], [18, 62]]].map((pl) => pl.map(([u, v]) => [u * HFS * 1.1, v * HFS])).map((pl) => Shape2D.catmull(pl, false, 4));
  // tail fin (tail frame: u back along the tail, v up; origin at the root): a huge sail rising behind the back
  const TFIN_P = [[-10, 4], [-12, 34], [-8, 64], [2, 90], [18, 104], [36, 103], [50, 88], [58, 64], [62, 38], [58, 14], [44, -4], [22, -8], [4, -6]];
  const TFS = 1.3; TFIN_P.forEach((q) => { q[0] *= TFS; q[1] *= TFS; });
  const TFIN_G = bakeShape(Shape2D.poly(TFIN_P, C_FIN, 8));
  const TFIN_RIB = [[[0, 8], [0, 50], [12, 94]], [[8, 6], [22, 50], [34, 96]], [[14, 4], [40, 38], [54, 70]]].map((pl) => pl.map(([u, v]) => [u * TFS, v * TFS])).map((pl) => Shape2D.catmull(pl, false, 4));
  // cheek gill: a rounded base with three swept points (u = back/out, v = up)
  const GILL_SPIKES = [{ a: 0.85, len: 26, w: 6.5 }, { a: 0.08, len: 36, w: 7.5 }, { a: -0.62, len: 22, w: 6 }].map((s) => {
    const ca = Math.cos(s.a), sa = Math.sin(s.a), r0 = 3;
    return { tip: [ca * s.len, sa * s.len], b1: [ca * r0 - sa * s.w, sa * r0 + ca * s.w], b2: [ca * r0 + sa * s.w, sa * r0 - ca * s.w], root: [ca * r0, sa * r0], dir: [ca, sa] };
  });
  const GILL_G = bakeShape({
    bb: [-12, -18, 38, 26],
    test(u, v) {
      for (const s of GILL_SPIKES) {
        if (Shape2D.inTri(u, v, s.tip, s.b1, s.b2)) {
          const cr = s.dir[0] * (v - s.root[1]) - s.dir[1] * (u - s.root[0]);
          return cr > 0.8 ? C_OR_L : C_OR;
        }
      }
      return (u - 1) ** 2 / 100 + v * v / 110 < 1 ? C_OR : 0;
    },
  });

  const DEFAULT = { walk: 0, crouch: 0, roar: 0, mouth: 0.55, eyes: 'open', side: 1 };
  // 1 torso + neck + head, 2/3 head fins, 4/5 gills, 6/7 arms, 8/9 legs, 10 tail, 11 tail fin
  const PRI = { 1: 0, 2: 1, 3: 1, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1, 10: 0, 11: -1 };
  const SIZE = 1.06;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    const prims = [], anchors = {}, stamps = [], dots = [];
    const st = +P.walk || 0, walking = st !== 0;
    const cr = clamp(+P.crouch || 0, 0, 1), ro = clamp(+P.roar || 0, 0, 1);
    const mo = Math.max(clamp(+P.mouth || 0, 0, 1), ro), side = clamp(P.side ?? 1, -1, 1);
    const bob = walking ? 3 * Math.abs(Math.cos(st)) : 0;
    const rock = walking ? 0.05 * Math.sin(st) : 0;
    const lean = -0.72 + 0.1 * cr + 0.4 * ro;
    const hipY = 52 - 18 * cr + bob + 4 * ro;
    // torso frame at the hip centre
    const body = chain(T(-6 + 6 * cr, hipY, 0), R(M3.rx(rock)), R(M3.rz(lean)));

    /* --- torso: belly egg + broad chest, a thick neck forward to the head --- */
    prims.push(ellF(chain(body, T(2, 42, 0)), [35, 50, 39], 1, 1, chestMat));
    anchors.body = inF(body, [4, 50, 0]);
    anchors.belly = inF(body, [34, 30, 0]);

    /* --- head: broad and fairly small on the thick neck; stays about level --- */
    const head = chain(body, T(26, 94, 0), R(M3.rz(-lean * 0.9 + 0.36 * ro - 0.08 * cr)), R(M3.rx(-rock * 0.5)), T(20, 8, 0));
    const neckA = inF(body, [8, 70, 0]), neckB = inF(head, [-10, -8, 0]);
    prims.push(seg(neckA, neckB, 24, 26, 1, 1, neckMat, dirF(body, [1, 0, 0]), 1.25));
    const headPrim = ellF(head, HR, 1, 1, headMat(mo, kind));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return { prim: headPrim, p: inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]), s }; };
    anchors.mouth = onHead(0, mouthV(0) - 0.14).p;
    for (const sd of [1, -1]) {
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = onHead(sd * EYE_AZ, EYE_V).p;
      dots.push({ at: onHead(sd * 0.12, 0.08), mat: BODY, tone: 0, onlyMat: BODY, minFacing: 0.5 });
    }

    /* --- head fins: two huge round-topped ribbed blades side by side on top of the head --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const base = inF(head, [-4, HR[1] * 0.64, sd * 23]);
      const fl = 0.72 + 0.2 * ro; // splay outward: the two blades part in a V
      const f = chain({ t: base, L: head.L }, R(M3.rz(0.2)), R(M3.rx(sd * fl)), R(M3.ry(-sd * 0.42)), T(0, 0, sd * 3));
      // fin frame: u = sideways (z of head), v = up, normal = forward
      const F = { t: f.t, L: M3.mul(f.L, M3.cols([0, 0, sd], [0, 1, 0], [sd, 0, 0])) };
      prims.push(finEll(F, HFIN_G, 3.4, id, id, HFIN_RIB));
      anchors[sd > 0 ? 'finN' : 'finF'] = inF(F, [-2, 78 * HFS, 0]);
    }
    anchors.top = [anchors.finN[0], Math.max(anchors.finN[1], anchors.finF[1]) + 2, 0];

    /* --- gills: spiky peach fans on the cheeks, behind the mouth corners --- */
    for (const sd of [1, -1]) {
      const g = onHead(sd * 1.22, -0.05);
      const U = dirF(head, [-0.5, 0.05, 0.87 * sd]);
      const N = dirF(head, [0.87, 0, 0.5 * sd]);
      const Vv = nrm(cross(U, N));
      const up = Vv[1] < 0 ? sc(Vv, -1) : Vv;
      prims.push(finEll({ t: add(g.p, sc(U, -3)), L: M3.cols(U, up, cross(U, up)) }, GILL_G, 2, sd > 0 ? 4 : 5, sd > 0 ? 4 : 5));
    }

    /* --- arms: slim upper arms, massive padded forearms, big flat three-fingered hands --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const ph = st + (sd > 0 ? Math.PI : 0);
      const swing = walking ? 16 * Math.sin(ph) : 0;
      const sh = inF(body, [6, 70, sd * 36]);
      prims.push(E(sh, M3.mul(body.L, M3.diag(17, 18, 16)), id, id, M_BODY)); // shoulder
      // wrist target: reaching down to the ground (stand), planted wide ahead (crouch), spread high (roar)
      const wStand = [92 + swing, 18 + bob, sd * 84];
      const wCrouch = [104, 16, sd * 94];
      const wRoar = [36, 176, sd * 120];
      let wr = [lerp(wStand[0], wCrouch[0], cr), lerp(wStand[1], wCrouch[1], cr), lerp(wStand[2], wCrouch[2], cr)];
      wr = [lerp(wr[0], wRoar[0], ro), lerp(wr[1], wRoar[1], ro), lerp(wr[2], wRoar[2], ro)];
      const L = 56;
      const el = joint(sh, wr, L, [-0.6, lerp(0.1, 0.6, ro), sd * 0.8]);
      prims.push(seg(sh, el, 11.5, 12, id, id, M_BODY));
      // forearm: thick, widest in the middle, orange two-segment pad on its outer face
      const fd = sub(wr, el);
      const [, FY] = frameAlong(fd, [1, 0, 0]);
      const pd = [0.75, 0.45, sd];
      const outw = nrm(sub(pd, sc(FY, dot(pd, FY))));
      const FXo = nrm(cross(FY, outw)), FZ = outw;
      const fc = add(sc(add(el, wr), 0.5), sc(FY, -1));
      prims.push(ellAx(fc, FXo, FY, FZ, [16, len3(fd) / 2 + 4, 17], id, id, padMat(-0.62, 0.5, 0.72)));
      // hand: flat paw with three long fingers; lies on the ground ahead
      const hdir = nrm([lerp(0.92, 1, cr), lerp(-0.2, -0.08, cr) + 0.9 * ro, sd * lerp(0.28, 0.45, cr)]);
      const pn = nrm([lerp(0.02, 0, cr), lerp(0.95, 1, cr), -sd * lerp(0.2, 0.1, cr)]);
      const [HX, HY, HZ] = frameAlong(hdir, pn);
      const hc = add(wr, sc(HY, 7));
      prims.push(ellAx(hc, HX, HY, HZ, [6.5, 12, 14], id, id, M_BODY));
      for (const k of [-1, 0, 1]) {
        const fdir = nrm(add(HY, sc(HZ, k * 0.5)));
        prims.push(ellAx(add(hc, add(sc(fdir, 17), sc(HX, -1))), HX, fdir, cross(HX, fdir), [4.6, 12, 5.6], id, id, M_BODY));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hc, sc(HY, 22));
    }

    /* --- legs: padded thighs, bent knees, long three-toed feet --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 16 * Math.sin(ph) : 0;
      const lift = walking ? 9 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(body, [-2, 12, sd * 26]);
      const ank = [-12 + fwd + 4 * cr, 12 + lift, sd * (54 + 10 * cr)];
      const L = 36;
      const kn = joint(hip, ank, L, [1, 0.1, sd * 0.4]);
      const td = sub(kn, hip);
      const [, TY] = frameAlong(td, [1, 0, 0]);
      const td0 = [0.5, 0, sd];
      const tout = nrm(sub(td0, sc(TY, dot(td0, TY))));
      prims.push(ellAx(sc(add(hip, kn), 0.5), nrm(cross(TY, tout)), TY, tout, [19, len3(td) / 2 + 7, 18], id, id, padMat(-0.35, 0.72, 0.62)));
      prims.push(seg(kn, ank, 13, 13, id, id, M_BODY, [1, 0, 0], 1.15));
      const tip = walking ? 0.25 * Math.sin(ph) * (lift > 0 ? 1 : 0.4) : 0;
      const foot = chain(T(ank[0] + 10, ank[1] - 6, ank[2]), R(M3.ry(-sd * 0.35)), R(M3.rz(-tip)));
      prims.push(ellF(foot, [18, 6.5, 12], id, id, M_BODY));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(18, -1.5, k * 8), R(M3.ry(-k * 0.4))), [12, 4.6, 4.8], id, id, M_BODY));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -6.5, 0]);
    }

    /* --- tail: short and thick, carrying a huge ribbed sail fin --- */
    const wag = walking ? 0.12 * Math.sin(st) : 0;
    const tail = chain(body, T(-30, 14, 0), R(M3.ry(Math.PI + wag)), R(M3.rz(-0.35 - 0.2 * cr)));
    prims.push(ellF(chain(tail, T(14, 0, 0)), [24, 14, 14], 10, 10, M_BODY));
    const tfin = chain(tail, T(0, 6, 0), R(M3.rz(0.3 + 0.25 * cr - 0.15 * ro)), R(M3.ry(-0.2 * side - 0.1)));
    prims.push(finEll(tfin, TFIN_G, 3.6, 11, 11, TFIN_RIB));
    anchors.tail = inF(tail, [4, 0, 0]);
    anchors.tailTip = inF(tfin, [26 * TFS, 104 * TFS, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    for (const s of stamps) s.at.p = sc(s.at.p, SIZE);
    for (const d of dots) d.at.p = sc(d.at.p, SIZE);
    return { prims, stamps, dots, anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12 };
  }

  function render(model, opt) {
    const s = (opt.scale || 1) * SIZE;
    curScale = s;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.5, bw: 400, bh: 380, oy: 0.9 } };
})();
