/* ------------------------------------------------------------------
   Swampert — the Mud Fish Pokémon (1.5 m ≈ 262 units tall at scale 1,
   head fins included). Marshtomp's evolution, in the same visual
   language as src/species/marshtomp.js (glossy blue skin, orange gills).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a hulking blue amphibian that hunches forward
   on short, thick bent legs. Huge shoulders and massive forearms end in
   big flat three-fingered hands that reach down toward the ground. A
   broad, flat head sits low in front of the shoulders with a very wide
   mouth; the lower jaw, throat and chest are pale blue-white. Two big
   dark-grey ribbed fins stand up side by side on top of the head, small
   orange eyes sit just in front of them, and spiky orange gills stick
   out of the cheeks behind the mouth corners. Orange two-segment pads on
   the outer forearms and thighs, broad three-toed feet, and a short tail
   carrying a huge dark-grey ribbed fan fin that rises behind the back.

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

  // ---- materials
  const BODY = 1, BELLY = 2, FIN = 3, ORANGE = 4, MOUTH = 5, TONGUE = 6, LINE = 7, EYE = 8, IRIS = 9, SHINE = 10;
  const MAT = { BODY, BELLY, FIN, ORANGE, MOUTH, TONGUE, LINE, EYE, IRIS, SHINE };
  const PAL = Creature.palette({
    [BODY]:   { r: ['#2c5d9c', '#4580c2', '#65a5de', '#92c6f0', '#cde8ff'], od: '#15356a', ol: '#2a5a98', ln: '#2a5892' },
    [BELLY]:  { r: ['#8aa6c0', '#afc7da', '#d6e6f0', '#edf6fb', '#ffffff'], od: '#2c4f7c', ol: '#5a80a8', ln: '#7896b2' },
    [FIN]:    { r: ['#1f232b', '#2b3039', '#3e444f', '#565d6a', '#7a828f'], od: '#0c0e12', ol: '#1e2229', ln: '#15181e' },
    [ORANGE]: { r: ['#b0602a', '#d4803e', '#f0a45e', '#ffc486', '#ffe2b8'], od: '#653010', ol: '#98541f', ln: '#a45a26' },
    [MOUTH]:  { r: ['#5e2238', '#7e344c', '#a0526a', '#bc7488', '#d898a6'], od: '#3a0e1e', ol: '#5a1a30', ln: '#5a1a30' },
    [TONGUE]: { r: ['#b8566c', '#d27084', '#e8929e', '#f8b4ba', '#ffd4d4'], od: '#6a1a30', ol: '#8a2a42', ln: '#a44a5c' },
    [LINE]:   { r: ['#1a467e', '#20508a', '#285a96', '#3064a0', '#386eaa'], od: '#15356a', ol: '#2a5a98', ln: '#1a467e' },
    [EYE]:    { r: ['#120e16', '#16121c', '#1a1620', '#221c28', '#2a2432'], od: '#0a080c', ol: '#120e16', ln: '#120e16' },
    [IRIS]:   { r: ['#c8601c', '#e07424', '#f28c2c', '#ffa640', '#ffbe60'], od: '#5a2008', ol: '#8a3810', ln: '#8a3810' },
    [SHINE]:  { r: ['#e8eef6', '#f6f9fc', '#ffffff', '#ffffff', '#ffffff'], od: '#606878', ol: '#8890a0', ln: '#8890a0' },
  });
  const GLOSSY = { [BODY]: 1, [FIN]: 1, [ORANGE]: 1 };
  const C_BODY = code(BODY), C_BELLY = code(BELLY), C_FIN = code(FIN), C_OR = code(ORANGE), C_OR_L = code(ORANGE, 1), C_OR_D = code(ORANGE, -1);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_LINE = code(LINE), C_EYE = code(EYE), C_IRIS = code(IRIS, 1), C_SHINE = code(SHINE, 1);
  const M_BODY = () => C_BODY;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
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

  let curScale = 1;

  // orange two-segment pad on the outer face of a limb ellipsoid (local y = along the limb, z = outward)
  // oval centred on the outward axis: spans y0..y1 along the limb, half-width wx across it
  const padMat = (y0, y1, wx) => (s) => {
    if (s[2] < 0.2) return C_BODY;
    const mid = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const dy = (s[1] - mid) / hy, dx = s[0] / wx;
    if (dx * dx + dy * dy < 1) {
      const lw = Math.max(0.05, 0.6 / (curScale * 20));
      if (Math.abs(s[1] - mid) < lw) return C_OR_D;
      return dx + dy < -0.6 ? C_OR_L : C_OR;
    }
    return C_BODY;
  };

  /* ---------- torso (torso frame: origin at the hip centre, y up the spine) ---------- */
  const EQ = 40, TR = [50, 42, 54], TR_UP = 60;
  // pale chest/belly: the front of the torso, narrower toward the sides
  const bellyAt = (x, y, z) => { const zz = z / 56; return x > 14 + 34 * zz * zz - 0.1 * Math.max(0, y - 60); };
  const lowMat = (s) => (s[1] > 0.02 ? 0 : bellyAt(TR[0] * s[0], EQ + TR[1] * s[1], TR[2] * s[2]) ? C_BELLY : C_BODY);
  const upMat = (s) => (s[1] < -0.02 ? 0 : bellyAt(TR[0] * s[0], EQ + TR_UP * s[1], TR[2] * s[2]) ? C_BELLY : C_BODY);

  /* ---------- head (head frame: origin at the head centre) ---------- */
  const HR = [48, 34, 54];
  const EYE_AZ = 0.5, EYE_V = 0.46;
  const mouthV = (az) => { const k = az / 1.25; return -0.12 + 0.2 * k * k; }; // very wide mouth, corners up
  // small orange eyes as scale-aware decals: dark rim, orange iris, black pupil, white glint
  function eyePix(ea, eb, sd, kind) {
    const pu = 1 / (curScale * HR[2]), pv = 1 / (curScale * HR[1]);
    const ru = Math.max(0.072, 2.2 * pu), rv = Math.max(0.12, 2.4 * pv);
    const x = ea / ru, y = eb / rv;
    if (Math.abs(x) > 1.2 || Math.abs(y) > 1.3) return 0;
    const lw = Math.max(0.16, 0.75 * pv / rv);
    if (kind === 'happy') return Math.abs(x) < 1 && Math.abs(y - (0.35 - 1.0 * x * x)) < lw ? C_EYE : 0;
    if (kind === 'blink') return Math.abs(x) < 1 && Math.abs(y + 0.15) < lw ? C_EYE : 0;
    if (kind === 'closed') return Math.abs(x) < 1 && Math.abs(y - (-0.3 + 0.7 * x * x)) < lw ? C_EYE : 0;
    const d = x * x + y * y;
    if (d > 1) return 0;
    const gx = x + 0.3 * sd, gy = y - 0.4, gr = Math.max(0.3, 0.8 * pu / ru);
    if (gx * gx + gy * gy < gr * gr) return C_SHINE;
    const qx = (x - 0.12 * sd) / 0.5, qy = y / 0.72;
    if (qx * qx + qy * qy < 1) return C_EYE;
    const rim = Math.max(0.35, 1 - 1.1 * pu / ru);
    return d < rim * rim ? C_IRIS : C_EYE;
  }
  function headMat(mo, kind) {
    return (s) => {
      const az = Math.atan2(s[2], s[0]), a = Math.abs(az), v = s[1];
      if (v > 0.2 && a > 0.25 && a < 0.8) {
        const sd = az > 0 ? 1 : -1, cv = Math.sqrt(Math.max(0, 1 - v * v));
        const e = eyePix((az - sd * EYE_AZ) * cv, v - EYE_V, sd, kind);
        if (e) return e;
      }
      if (a < 1.4) {
        const vm = mouthV(az);
        const h = mo * 0.62 * Math.max(0, 1 - (az / 1.25) ** 2);
        if (h > 0.03 && v < vm && v > vm - h) return v < vm - h * 0.55 && a < 0.8 ? C_TONGUE : C_MOUTH;
        if (h <= 0.03 && a < 1.3) {
          const lw = Math.max(0.03, 0.6 / (curScale * HR[1]));
          if (Math.abs(v - vm) < lw) return C_LINE;
        }
        if (v < vm - h) return C_BELLY; // pale lower jaw
      }
      return C_BODY;
    };
  }

  /* ---------- plates ---------- */
  // head fin (u = outward/back, v = up; base at the origin): a tall rounded blade, ribs fan from the base
  const HFIN_P = [[-14, -6], [-24, 14], [-28, 38], [-22, 58], [-8, 71], [10, 74], [25, 64], [32, 44], [29, 20], [18, 0], [4, -8]];
  const HFIN_G = bakeShape(Shape2D.poly(HFIN_P, C_FIN, 8));
  const HFIN_RIB = [[[-6, 6], [-16, 30], [-18, 52]], [[0, 6], [-4, 40], [-3, 66]], [[5, 6], [10, 40], [14, 66]], [[10, 4], [22, 28], [27, 46]]].map((pl) => Shape2D.catmull(pl, false, 4));
  // tail fin (tail frame: u back along the tail, v up; origin at the root): a huge fan rising behind
  const TFIN_P = [[-8, 4], [-8, 32], [-2, 62], [10, 86], [28, 100], [48, 101], [63, 88], [70, 64], [70, 36], [62, 12], [46, -4], [24, -8], [6, -6]];
  const TFIN_G = bakeShape(Shape2D.poly(TFIN_P, C_FIN, 8));
  const TFIN_RIB = [[[2, 8], [4, 48], [12, 84]], [[6, 6], [20, 50], [36, 94]], [[10, 4], [36, 40], [58, 80]], [[14, 2], [44, 20], [66, 44]]].map((pl) => Shape2D.catmull(pl, false, 4));
  // cheek gill: a fan with three swept points (u = back/out, v = up)
  const GILL_SPIKES = [{ a: 0.7, len: 30, w: 8 }, { a: 0.05, len: 36, w: 8.5 }, { a: -0.6, len: 24, w: 7 }].map((s) => {
    const ca = Math.cos(s.a), sa = Math.sin(s.a), r0 = 4;
    return { tip: [ca * s.len, sa * s.len], b1: [ca * r0 - sa * s.w, sa * r0 + ca * s.w], b2: [ca * r0 + sa * s.w, sa * r0 - ca * s.w], root: [ca * r0, sa * r0], dir: [ca, sa] };
  });
  const GILL_G = bakeShape({
    bb: [-12, -20, 38, 26],
    test(u, v) {
      for (const s of GILL_SPIKES) {
        if (Shape2D.inTri(u, v, s.tip, s.b1, s.b2)) {
          const cr = s.dir[0] * (v - s.root[1]) - s.dir[1] * (u - s.root[0]);
          return cr > 0.8 ? C_OR_L : C_OR;
        }
      }
      return u * u + v * v < 11 * 11 ? C_OR : 0;
    },
  });

  const DEFAULT = { walk: 0, crouch: 0, roar: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 torso + head, 2/3 head fins, 4/5 gills, 6/7 arms, 8/9 legs, 10 tail, 11 tail fin
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
    const lean = -0.36 - 0.5 * cr + 0.34 * ro;
    const hipY = 62 - 20 * cr + bob + 4 * ro;
    // torso frame at the hip centre
    const body = chain(T(-6 + 8 * cr, hipY, 0), R(M3.rx(rock)), R(M3.rz(lean)));

    /* --- torso: broad egg, huge shoulders --- */
    const tc = chain(body, T(0, EQ, 0));
    prims.push(ellF(tc, TR, 1, 1, lowMat));
    prims.push(ellF(tc, [TR[0], TR_UP, TR[2]], 1, 1, upMat));
    anchors.body = inF(body, [4, EQ + 10, 0]);
    anchors.belly = inF(body, [TR[0], EQ, 0]);

    /* --- head: broad and flat, low in front of the shoulders; stays about level --- */
    const head = chain(body, T(34, 92, 0), R(M3.rz(-lean * 0.85 + 0.38 * ro - 0.06 * cr)), R(M3.rx(-rock * 0.5)), T(14, 12, 0));
    const headPrim = ellF(head, HR, 1, 1, headMat(mo, kind));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return { prim: headPrim, p: inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]), s }; };
    anchors.mouth = onHead(0, mouthV(0) - 0.14).p;
    for (const sd of [1, -1]) {
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = onHead(sd * EYE_AZ, EYE_V).p;
      dots.push({ at: onHead(sd * 0.12, 0.12), mat: BODY, tone: 0, onlyMat: BODY, minFacing: 0.5 });
    }

    /* --- head fins: two tall ribbed blades side by side, splayed out and a little back --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 2 : 3;
      const base = onHead(sd * 1.0, 0.6).p;
      const fl = 0.22 + 0.2 * ro;
      const U = dirF(head, [-0.38, 0, 0.92 * sd]);
      const up0 = dirF(head, [-0.12, 1, 0]);
      const Vv = nrm(add(sc(up0, Math.cos(fl)), sc(U, Math.sin(fl))));
      const Uu = nrm(sub(U, sc(Vv, dot(U, Vv))));
      const W = cross(Uu, Vv);
      const f = { t: add(base, sc(Vv, -4)), L: M3.cols(Uu, Vv, W) };
      prims.push(Object.assign(PL(f.t, f.L, id, id, HFIN_G, 3.2), { lines: HFIN_RIB.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true })) }));
      anchors[sd > 0 ? 'finN' : 'finF'] = inF(f, [8, 70, 0]);
    }
    anchors.top = [anchors.finN[0], Math.max(anchors.finN[1], anchors.finF[1]) + 2, 0];

    /* --- gills: spiky orange fans behind the mouth corners --- */
    for (const sd of [1, -1]) {
      const g = onHead(sd * 1.25, -0.02);
      const U = dirF(head, [-0.45, 0.05, 0.89 * sd]);
      const N = dirF(head, [0.89, 0, 0.45 * sd]);
      const Vv = nrm(cross(U, N));
      const up = Vv[1] < 0 ? sc(Vv, -1) : Vv;
      prims.push(PL(add(g.p, sc(U, -4)), M3.cols(U, up, cross(U, up)), sd > 0 ? 4 : 5, sd > 0 ? 4 : 5, GILL_G, 2));
    }

    /* --- arms: big shoulders, massive forearms, flat three-fingered hands --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const ph = st + (sd > 0 ? Math.PI : 0);
      const swing = walking ? 16 * Math.sin(ph) : 0;
      const sh = inF(body, [10, 80, sd * 50]);
      prims.push(E(sh, M3.mul(body.L, M3.diag(26, 26, 24)), id, id, M_BODY)); // deltoid
      // wrist target: hanging by the knees (stand), planted ahead on the ground (crouch), spread high (roar)
      const wStand = [62 + swing, 34 + bob, sd * 80];
      const wCrouch = [96, 14, sd * 74];
      const wRoar = [34, 150, sd * 118];
      let wr = [lerp(wStand[0], wCrouch[0], cr), lerp(wStand[1], wCrouch[1], cr), lerp(wStand[2], wCrouch[2], cr)];
      wr = [lerp(wr[0], wRoar[0], ro), lerp(wr[1], wRoar[1], ro), lerp(wr[2], wRoar[2], ro)];
      const L = 52;
      const el = joint(sh, wr, L, [-0.5, lerp(0.1, 0.6, ro), sd * 0.9]);
      prims.push(seg(sh, el, 17, 17, id, id, M_BODY));
      // forearm: thick (Popeye), orange pad on its outer face
      const fd = sub(wr, el);
      const [FX, FY] = frameAlong(fd, [1, 0, 0]);
      const outw = nrm(sub([0, 0, sd], sc(FY, FY[2] * sd)));
      const FXo = nrm(cross(FY, outw)), FZ = outw;
      const fc = add(sc(add(el, wr), 0.5), sc(FY, 2));
      prims.push(ellAx(fc, FXo, FY, FZ, [21, len3(fd) / 2 + 4, 22], id, id, padMat(-0.7, 0.45, 0.75)));
      // hand: flat paw with three thick fingers; hangs forward/down standing, lies flat when planted
      const hdir = nrm([lerp(0.55, 1, cr), lerp(-0.85, -0.05, cr) + 0.9 * ro, sd * lerp(0.2, 0.5, cr)]);
      const pn = nrm([lerp(0.2, 0, cr), lerp(0.2, 1, cr), -sd * lerp(1, 0.1, cr)]);
      const [HX, HY, HZ] = frameAlong(hdir, pn);
      const hc = add(wr, sc(HY, 10));
      prims.push(ellAx(hc, HX, HY, HZ, [9, 16, 20], id, id, M_BODY));
      for (const k of [-1, 0, 1]) {
        const fdir = nrm(add(HY, sc(HZ, k * 0.42)));
        prims.push(ellAx(add(hc, add(sc(fdir, 20), sc(HX, -1))), HX, fdir, cross(HX, fdir), [6.5, 11, 7.5], id, id, M_BODY));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(hc, sc(HY, 26));
    }

    /* --- legs: fat bent thighs with orange pads, broad three-toed feet --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 16 * Math.sin(ph) : 0;
      const lift = walking ? 9 * Math.max(0, Math.cos(ph)) : 0;
      const hip = inF(body, [0, 10, sd * 30]);
      const ank = [8 + fwd + 6 * cr, 12 + lift, sd * (40 + 6 * cr)];
      const L = 34;
      const kn = joint(hip, ank, L, [1, 0, sd * 0.35]);
      const td = sub(kn, hip);
      const [, TY] = frameAlong(td, [1, 0, 0]);
      const tout = nrm(sub([0, 0, sd], sc(TY, TY[2] * sd)));
      prims.push(ellAx(sc(add(hip, kn), 0.5), nrm(cross(TY, tout)), TY, tout, [25, len3(td) / 2 + 8, 24], id, id, padMat(-0.1, 0.8, 0.6)));
      prims.push(seg(kn, ank, 17, 17, id, id, M_BODY, [1, 0, 0], 1.15));
      const tip = walking ? 0.25 * Math.sin(ph) * (lift > 0 ? 1 : 0.4) : 0;
      const foot = chain(T(ank[0] + 8, ank[1] - 4, ank[2]), R(M3.ry(-sd * 0.3)), R(M3.rz(-tip)));
      prims.push(ellF(foot, [22, 8, 17], id, id, M_BODY));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(19, -1.5, k * 9.5), R(M3.ry(-k * 0.35))), [10, 5.5, 6], id, id, M_BODY));
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -8, 0]);
    }

    /* --- tail: short and thick, carrying a huge ribbed fan fin --- */
    const wag = walking ? 0.12 * Math.sin(st) : 0;
    const tail = chain(body, T(-40, 16, 0), R(M3.ry(Math.PI + wag)), R(M3.rz(-0.1 - 0.2 * cr)));
    prims.push(ellF(chain(tail, T(14, 0, 0)), [26, 17, 17], 10, 10, M_BODY));
    const tfin = chain(tail, T(4, 6, 0), R(M3.rz(0.1 + 0.25 * cr - 0.15 * ro)), R(M3.ry(-0.3 * side)));
    prims.push(Object.assign(PL(tfin.t, tfin.L, 11, 11, TFIN_G, 3.2), { lines: TFIN_RIB.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true })) }));
    anchors.tail = inF(tail, [4, 0, 0]);
    anchors.tailTip = inF(tfin, [40, 100, 0]);

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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.5, bw: 330, bh: 340, oy: 0.94 } };
})();
