/* ------------------------------------------------------------------
   Swellow — the Swallow Pokémon (0.7 m ≈ 122 units from the feet to the
   top of the head at scale 1; the tail streamers rise higher). Taillow's
   evolution. A posable 3D model rendered straight to pixel art by the
   shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground (the
   toes when perched) at y = 0.

   Design (official art / HOME model): a sleek swallow. Glossy navy crown,
   nape and back with a spiky crest swept back from the back of the head;
   a crimson face and throat, a navy chevron "V" across the chest with
   more crimson below it and a white belly; a short pointed yellow beak;
   stern black eyes under the navy brow. Long pointed navy wings (folded
   along the body, tips crossing past the tail, or spread), a long
   pointed tail, and two very long thin tail streamers tipped in crimson,
   raised up and back when perched. Thin crimson legs, dark claws.

   Pose parameters (all optional):
     flap    radians  wing-beat phase (the spread wings beat with sin(flap));
                      continuous
     spread  0..1     wings folded along the body -> fully spread
     dive    0..1     steep dive: nose down, wings swept back tight, legs
                      tucked, streamers straight back
     perch   0..1     1 = perched upright on its feet (the default); 0 = level
                      flight posture (legs tucked back, streamers trail)
     walk    radians  hopping walk when perched (legs step, body bobs);
                      exactly 0 = still
     mouth   0..1     beak open (`bill` accepted as an alias)
     eyes    'open' | 'happy' | 'blink' | 'closed'
     side    −1..1    ≈ cos(yaw), passed by the game (accepted, unused)

   Anchors: top (highest point: streamer tip or head), head (head centre),
   mouth, beak (beak tip), eyeN, eyeF, body (body centre), crest,
   wingTipN / wingTipF, tail (streamer tip), feet (between the feet).
------------------------------------------------------------------- */
const Swellow = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const NAVY = 1, RED = 2, WHITE = 3, BEAK = 4, LEG = 5, CLAW = 6, MOUTH = 7, EYEK = 8, EYEW = 9;
  const MAT = { NAVY, RED, WHITE, BEAK, LEG, CLAW, MOUTH, EYEK, EYEW };
  const PAL = Creature.palette({
    [NAVY]:  { r: ['#161828', '#22253c', '#303452', '#434a6c', '#636a8c'], od: '#0a0a14', ol: '#1a1c2e', ln: '#141626' },
    [RED]:   { r: ['#7e2236', '#a2344a', '#c44c62', '#da6c80', '#eea0ac'], od: '#420c18', ol: '#76202e', ln: '#6c1c2a' },
    [WHITE]: { r: ['#a4aabe', '#c8cede', '#eceff6', '#fafbfd', '#ffffff'], od: '#3c4460', ol: '#68708c', ln: '#8088a4' },
    [BEAK]:  { r: ['#a8883a', '#c8a44a', '#e2c060', '#f0d888', '#fcf0c0'], od: '#5a4418', ol: '#8e7030', ln: '#86682a' },
    [LEG]:   { r: ['#8a3444', '#aa4a5a', '#c86474', '#dc8490', '#ecb0b8'], od: '#48141e', ol: '#7a2c38', ln: '#702834' },
    [CLAW]:  { r: ['#22242c', '#30323c', '#40444e', '#585c68', '#80848e'], od: '#0e1014', ol: '#22242c', ln: '#1a1c22' },
    [MOUTH]: { r: ['#4e1224', '#6a1c30', '#86283e', '#a03c50', '#b85668'], od: '#2a0610', ol: '#4e1224', ln: '#46101e' },
    [EYEK]:  { r: ['#08090e', '#0c0e14', '#10141c', '#181e28', '#242c38'], od: '#040508', ol: '#040508', ln: '#040508' },
    [EYEW]:  { r: ['#dde2ec', '#f0f3f8', '#ffffff', '#ffffff', '#ffffff'], od: '#303844', ol: '#303844', ln: '#303844' },
  });
  const GLOSSY = { [NAVY]: 1, [BEAK]: 1 };
  const C_NAVY = code(NAVY), C_RED = code(RED), C_WHITE = code(WHITE), C_BEAK = code(BEAK), C_BEAK_D = code(BEAK, -1);
  const C_LEG = code(LEG), C_CLAW = code(CLAW), C_MOUTH = code(MOUTH), C_EYEK = code(EYEK), C_EYEW = code(EYEW);
  const M_NAVY = () => C_NAVY, M_LEG = () => C_LEG, M_CLAW = () => C_CLAW;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm, dot = V3.dot;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  function frameAlong(d, fwd) {
    const Y = nrm(d);
    let X = sub(fwd, sc(Y, dot(fwd, Y)));
    if (len3(X) < 1e-4) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    return [X, Y, cross(X, Y)];
  }
  function seg(p0, p1, rx, rz, part, grp, mat, fwd = [1, 0, 0], ext = 1) {
    const d = sub(p1, p0), l = len3(d);
    const [X, Y, Z] = frameAlong(d, fwd);
    return E(sc(add(p0, p1), 0.5), M3.cols(sc(X, rx), sc(Y, (l / 2) * ext), sc(Z, rz)), part, grp, mat);
  }
  // rotation with columns U (along), V (in plane), U × V
  function frameUV(U, Vh) {
    const u = nrm(U), v = nrm(sub(Vh, sc(u, dot(Vh, u))));
    return M3.cols(u, v, cross(u, v));
  }
  function rotAxis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function slerpM(A, B, t) {
    const Q = M3.mul(transpose(A), B);
    const ang = Math.acos(clamp((Q[0] + Q[4] + Q[8] - 1) / 2, -1, 1));
    if (ang < 1e-5) return A;
    const ax = [Q[7] - Q[5], Q[2] - Q[6], Q[3] - Q[1]];
    if (len3(ax) < 1e-6) return t < 0.5 ? A : B;
    return M3.mul(A, rotAxis(nrm(ax), ang * t));
  }
  const plate = (c, L, part, grp, shape, thick = 1.6) => ({ kind: 'plate', part, grp, c, L, shape, thick });

  let curScale = 1;

  /* ---------- head: navy cap and nape, crimson face; decal eyes under the brow ---------- */
  const HR = [22, 21, 20.5];
  const EYE_AZ = 0.62, EYE_V = 0.2;
  const capLine = (s) => 0.4 - 0.12 * s[0] - 0.1 * Math.max(0, Math.abs(Math.atan2(s[2], s[0])) - 0.6);
  function eyePix(s, kind) {
    const az = Math.atan2(Math.abs(s[2]), s[0]);
    const px = 1 / (curScale * HR[1]);
    const a = (az - EYE_AZ) / Math.max(0.2, 2.2 * px), b = (s[1] - EYE_V) / Math.max(0.15, 1.8 * px);
    const ain = -a; // + toward the beak
    if (Math.abs(a) > 1.1 || Math.abs(b) > 1.4) return 0;
    const lw = Math.max(0.22, 0.9 * px / Math.max(0.15, 1.8 * px));
    if (kind === 'open') {
      const top = 0.55 - 0.55 * ain; // stern brow sloping down toward the beak
      const bot = -0.9 * Math.sqrt(Math.max(0, 1 - a * a));
      if (Math.abs(a) > 1 || b > top + lw || b < bot) return 0;
      if (b > top - lw * 0.4) return C_NAVY; // brow (the cap edge)
      const pa = (ain - 0.2) / 0.62, pb = (b + 0.05) / 0.75;
      return pa * pa + pb * pb < 1 ? C_EYEK : C_EYEW;
    }
    if (Math.abs(a) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = -0.3 + 0.8 * (1 - a * a);
    else if (kind === 'blink') yc = 0.1 - 0.3 * ain;
    else yc = 0.15 - 0.3 * ain - 0.3 * (1 - a * a);
    return Math.abs(b - yc) < lw ? C_EYEK : 0;
  }
  const headMat = (kind) => (s) => {
    if (s[1] > capLine(s) || s[0] < -0.45 + 0.35 * Math.max(0, -s[1])) return C_NAVY;
    if (s[0] > 0.05) { const e = eyePix(s, kind); if (e) return e; }
    return C_RED;
  };
  // neck: red throat in front, navy nape
  const neckMat = (s) => (s[0] > -0.25 + 0.4 * s[1] ? C_RED : C_NAVY);
  // body (body frame, x forward along the body axis): red chest with a navy V, white belly, navy back
  function bodyMat(s) {
    const w = Math.abs(s[2]);
    if (s[0] > 0.05 && s[1] > -0.2 - 0.9 * s[0]) {
      const vl = 0.45 - 0.9 * s[0] + 1.25 * w; // chevron (point down at the front)
      if (w < 0.8) {
        if (Math.abs(s[1] - vl) < 0.1) return C_NAVY;
        if (s[1] > vl && w < 0.62 + 0.2 * s[1]) return C_RED;
        if (s[1] > vl - 0.32) return C_RED;
      }
    }
    if (s[1] < 0.1 - 0.8 * Math.max(0, s[0] + 0.2) && s[0] > -0.75 && Math.abs(s[2]) < 0.93) return C_WHITE;
    return C_NAVY;
  }

  /* ---------- plates ---------- */
  // long pointed swallow wing: u = root → tip, v = leading edge (+)
  const WING_G = bakeShape(Shape2D.poly([[0, -10], [0, 11], [16, 12.5], [38, 9.5], [60, 4.5], [82, 0.6], [62, -3.2], [40, -6.5], [18, -10]], C_NAVY, 8));
  const WING_LN = Shape2D.catmull([[6, -4], [30, -2.5], [58, -0.6]], false, 4);
  // streamer: long thin blade, crimson tip
  const STR_G = bakeShape(Shape2D.poly([[0, -4], [30, -3.6], [62, -2.6], [86, -1], [96, 0], [86, 1.6], [62, 3.4], [30, 4.2], [0, 4.2]], C_NAVY, 6, (u, v) => (u > 18 && u < 88 && v > -0.5 && v < 2.6 - 0.02 * Math.abs(u - 55) ? C_RED : C_NAVY)));
  // pointed lower tail
  const TAIL_G = bakeShape(Shape2D.poly([[0, -6], [18, -5], [36, -2.5], [48, 0], [36, 2.5], [18, 5], [0, 6]], C_NAVY, 6));
  // crest spike
  const CREST_G = bakeShape(Shape2D.poly([[0, -3.5], [9, -2.6], [18, -0.4], [9, 2.2], [0, 3.5]], C_NAVY, 5));

  const DEFAULT = { flap: 0, spread: 0, dive: 0, perch: 1, walk: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 body, 2 head, 3 neck, 4 beak, 5 lower beak, 6 mouth, 7/8 wings, 9 streamers, 10 tail, 11 crest, 12/13 legs
  const PRI = { 1: 0, 2: 1, 3: 0, 4: 3, 5: 3, 6: 2, 7: 3, 8: 3, 9: 0, 10: 0, 11: 0, 12: 1, 13: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const sp0 = clamp(+P.spread || 0, 0, 1), fl = +P.flap || 0;
    const dv = clamp(+P.dive || 0, 0, 1), pe = clamp(P.perch === undefined ? 1 : +P.perch, 0, 1);
    const sp = sp0 * (1 - dv);
    const st = +P.walk || 0, walking = st !== 0 && pe > 0.5;
    const bo = clamp(+(pose && pose.bill !== undefined ? pose.bill : P.mouth) || 0, 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const hop = walking ? 3.5 * Math.abs(Math.sin(st)) : 0;
    // body pitch: perched upright, level in flight, nose down in a dive
    const pitch = lerp(0.05, 0.42, pe) * (1 - dv) - 0.95 * dv;
    const root = chain(T(0, lerp(55, 44, pe) + hop, 0), R(M3.rz(pitch)));

    /* --- body --- */
    prims.push(ellF(root, [39, 24.5, 22.5], 1, 1, bodyMat));
    anchors.body = root.t;

    /* --- neck + head (the head stays level-ish when perched) --- */
    const neckF = chain(root, T(33, 13, 0));
    prims.push(ellF(chain(neckF, R(M3.rz(0.3))), [14, 14, 15], 3, 3, neckMat));
    const head = chain(root, T(41, 23, 0), R(M3.rz(-pitch * 0.75 - 0.04 * bo + (walking ? 0.04 * Math.sin(2 * st) : 0))));
    const headPrim = ellF(head, HR, 2, 2, headMat(kind));
    prims.push(headPrim);
    anchors.head = head.t;
    const onHead = (az, v) => { const s = Creature.sph(az, v); return inF(head, [HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]]); };
    anchors.eyeN = onHead(EYE_AZ, EYE_V); anchors.eyeF = onHead(-EYE_AZ, EYE_V);
    // beak: short, pointed, yellow; lower half opens
    const hinge = chain(head, T(17, 0.5, 0));
    const ub = chain(hinge, R(M3.rz(bo * 0.15)));
    prims.push(ellF(chain(ub, T(7, 0.6, 0), R(M3.rz(-0.12))), [11, 3.4, 4.6], 4, 4, () => C_BEAK));
    const lb = chain(hinge, R(M3.rz(-0.1 - bo * 0.55)));
    prims.push(ellF(chain(lb, T(6, -1.4, 0)), [9, 2.2, 3.8], 5, 5, () => C_BEAK_D));
    if (bo > 0.05) prims.push(ellF(chain(hinge, T(3.5, -1.5, 0), R(M3.rz(-bo * 0.25))), [6, 1.4 + bo * 2, 4], 6, 6, () => C_MOUTH));
    anchors.beak = inF(ub, [17, -0.6, 0]);
    anchors.mouth = inF(hinge, [4, -1.5, 0]);
    // crest: three navy spikes swept back from the back of the head
    const cb = inF(head, [-15, 8, 0]);
    for (const [a, z, l] of [[0.4, 0, 1.6], [0.1, 5, 1.35], [0.1, -5, 1.35], [-0.2, 0, 1.1]]) {
      const U = dirF(head, [-Math.cos(a), Math.sin(a), z * 0.03]);
      const L = M3.mul(frameUV(U, dirF(head, [0, 1, 0.2 * Math.sign(z || 1)])), M3.diag(l, 1, 1));
      prims.push(plate(add(cb, dirF(head, [0, 0, z])), L, 11, 11, CREST_G, 2.2));
    }
    anchors.crest = add(cb, sc(dirF(head, [-Math.cos(0.35), Math.sin(0.35), 0]), 22));

    /* --- wings: folded along the body, or spread and beating --- */
    const beat = Math.sin(fl);
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      // body frame directions (z mirrored per side)
      const zf = (v) => [v[0], v[1], v[2] * sd];
      const Rfold = frameUV(dirF(root, zf([-0.97, -0.2 - 0.08 * dv, 0.12])), dirF(root, zf([0.15, 1, 0.1])));
      const el = 0.28 + 0.85 * beat;
      const Rspr = frameUV(dirF(root, zf([-0.28, Math.sin(el), Math.cos(el)])), dirF(root, zf([1, 0.15 - 0.3 * beat, 0])));
      const Rw = slerpM(Rfold, Rspr, sp);
      const sh = inF(root, [lerp(10, 12, sp), lerp(8, 12, sp), sd * lerp(17, 12, sp)]);
      const w = plate(sh, Rw, id, id, WING_G, 2);
      w.lines = [{ pts: WING_LN.map(([u, v]) => [u, v * (sd > 0 ? 1 : 1), 0]), mat: NAVY, useLn: true }];
      prims.push(w);
      anchors[sd > 0 ? 'wingTipN' : 'wingTipF'] = add(sh, M3.v(Rw, [82, 0.6, 0]));
    }

    /* --- tail: pointed lower tail + two long streamers --- */
    const tb = inF(root, [-34, 3, 0]);
    prims.push(plate(tb, frameUV(dirF(root, [-1, -0.08, 0]), dirF(root, [0, 0.15, 1])), 10, 10, TAIL_G, 2.4));
    const sa = lerp(0.14, 1.15, pe) * (1 - dv);
    let tipTop = null;
    for (const [k, da] of [[1, 0.08], [-1, -0.1]]) {
      const U = dirF(root, [-Math.cos(sa + da), Math.sin(sa + da), k * 0.12]);
      const Rs = frameUV(U, dirF(root, [0, 0.3, 1]).map((v) => v));
      // turn the blade edge-up so its broad side faces the camera side
      const Rs2 = frameUV(U, cross(U, dirF(root, [0, 0, 1])));
      const tip = add(add(tb, [0, 0, k * 2.5]), sc(U, 96));
      prims.push(plate(add(tb, [0, 0, k * 2.5]), Rs2 || Rs, 9, 9, STR_G, 2.4));
      if (!tipTop || tip[1] > tipTop[1]) tipTop = tip;
    }
    anchors.tail = tipTop;

    /* --- legs: thin crimson legs, three toes forward + one back, dark claws --- */
    const feet = [];
    const tuck = Math.max(1 - pe, dv);
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 12 : 13;
      const ph = st + (sd > 0 ? 0 : Math.PI);
      const lift = walking ? 3 * Math.max(0, Math.sin(ph)) : 0;
      const hip = inF(root, [4, -18, sd * 9]);
      const standAnk = [6 + (walking ? 3 * Math.cos(ph) : 0), 5 + lift, sd * 10];
      const tuckAnk = inF(root, [-12, -24, sd * 7]);
      const ank = [lerp(standAnk[0], tuckAnk[0], tuck), lerp(standAnk[1], tuckAnk[1], tuck), lerp(standAnk[2], tuckAnk[2], tuck)];
      prims.push(seg(hip, ank, 2.6, 2.6, id, id, M_LEG, [1, 0, 0], 1.1));
      const toeRot = lerp(0, -1.2, tuck);
      for (const [a, len] of [[0.4, 9], [0, 10.5], [-0.4, 9], [Math.PI, 6]]) {
        const d = nrm([Math.cos(a) * Math.cos(toeRot), -0.45 + Math.sin(toeRot) * (a === Math.PI ? -1 : 1), Math.sin(a) * 0.9]);
        const te = add(ank, sc(d, len));
        prims.push(seg(ank, te, 1.5, 1.5, id, id, M_LEG, [0, 1, 0], 1.1));
        prims.push(seg(te, add(te, sc(nrm([d[0], d[1] - 0.6, d[2]]), 3.2)), 1.1, 1.1, id, id, M_CLAW, [0, 1, 0]));
      }
      feet.push(ank);
    }
    anchors.feet = sc(add(feet[0], feet[1]), 0.5);

    const headTop = inF(head, [0, HR[1], 0]);
    anchors.top = tipTop[1] > headTop[1] ? tipTop : headTop;
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: NAVY, shadowSteps: 12 };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 250, bh: 240, oy: 0.84 } };
})();
