/* ------------------------------------------------------------------
   Lombre — the Jolly Pokémon (1.2 m ≈ 210 units tall at scale 1, hat
   included). A posable 3D model rendered straight to pixel art by the
   shared Creature pipeline (see src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0 (= Lombre's
   right), ground at y = 0.

   Design (official art / HOME model): a lanky kappa. A big round head
   whose face, "ears", arms and an open vest over the chest are pale mint;
   the back of the head, the neck, the pear-shaped torso and the short
   bowed legs are green. A thick lily-pad hat (a flat disc with a light
   top, dark underside and a square notch cut into its rim, like Lotad's
   pad) sits pushed back on the head, with little green tufts of "hair"
   poking out under it by the ears. Half-lidded, bored white eyes; a wide,
   thick pink-red beak of lips that droops at the corners; very long arms
   hanging out to the sides, ending in flat hands with three pink claws;
   three pink claws on each foot.

   Pose parameters (all optional):
     walk   radians  walk-cycle phase: legs swing with sin(walk), arms
                     counter-swing, body bobs and waddles; exactly 0 =
                     standing (a walk starts from a planted stride)
     swim   radians  swimming phase (0 = off): body tips forward, the
                     arms sweep a breaststroke, the legs kick; the hat
                     stays up like a floating lily pad
     dance  radians  dance-cycle phase (0 = off): hips sway, arms pump in
                     turn, knees lift, the hat bounces
     groove 0..1     dance amplitude (default 1)
     arms   −1..1    arm raise (−1 hanging at the sides, 0 rest pose held
                     out, 1 raised overhead — a cheer); armN / armF
                     override it per arm
     lean   −1..1    body lean (+ forward / hunched, − back)
     eyes   'open' (the half-lidded official look) | 'happy' | 'closed' | 'blink'
     mouth  0..1     beak open
     side   −1..1    ≈ cos(yaw), passed by the game: the hat rolls a
                     little toward the camera so its top reads in profile

   Anchors: top (top of the hat), hat (hat centre), head (head centre),
   mouth, eyeN, eyeF, body (torso centre), handN / handF (claw tips),
   footN / footF.
------------------------------------------------------------------- */
const Lombre = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const GREEN = 1, MINT = 2, PAD = 3, PADU = 4, RIM = 5, LIP = 6, MOUTH = 7, CLAW = 8, EYEW = 9, EYE = 10;
  const MAT = { GREEN, MINT, PAD, PADU, RIM, LIP, MOUTH, CLAW, EYEW, EYE };
  const PAL = Creature.palette({
    [GREEN]: { r: ['#4a7a24', '#64982e', '#80b43c', '#9ccc56', '#c0e482'], od: '#223e0e', ol: '#46701e', ln: '#446c20' },
    [MINT]:  { r: ['#6a9a86', '#8ab8a2', '#a8d2bc', '#c4e4d2', '#e4f6ec'], od: '#2a5244', ol: '#4e8270', ln: '#4e8270' },
    [PAD]:   { r: ['#4a7e2a', '#5e9834', '#74b042', '#8ec658', '#b0de7e'], od: '#224212', ol: '#447424', ln: '#406e22' },
    [PADU]:  { r: ['#305a1e', '#3c6c26', '#4a802e', '#5a9438', '#6ea848'], od: '#15300c', ol: '#2a5a1e', ln: '#2a561e' },
    [RIM]:   { r: ['#44782a', '#5a9234', '#6ea840', '#88c056', '#aad87a'], od: '#224212', ol: '#447424', ln: '#3e6a20' },
    [LIP]:   { r: ['#a2324a', '#c44a60', '#e26a7a', '#f2909a', '#ffc0c4'], od: '#58101e', ol: '#922a3c', ln: '#8a2838' },
    [MOUTH]: { r: ['#3c0c14', '#54141e', '#6c2029', '#862e36', '#a24048'], od: '#26060c', ol: '#3c0c14', ln: '#3c0c14' },
    [CLAW]:  { r: ['#b4465a', '#d26276', '#ec8696', '#f8acb6', '#ffd6dc'], od: '#661426', ol: '#a0384c', ln: '#9c384a' },
    [EYEW]:  { r: ['#c2d0ca', '#dfeae5', '#f6fbf9', '#ffffff', '#ffffff'], od: '#1c3a32', ol: '#2e5048', ln: '#1c3a32' },
    [EYE]:   { r: ['#0a0f0d', '#101714', '#161f1b', '#222c27', '#34403a'], od: '#060a08', ol: '#0a0f0d', ln: '#060a08' },
  });
  const GLOSSY = { [LIP]: 1 };
  const C_GREEN = code(GREEN), C_MINT = code(MINT), C_PAD = code(PAD), C_PADU = code(PADU), C_RIM = code(RIM), C_RIM_L = code(RIM, 1), C_RIM_D = code(RIM, -1);
  const C_LIP = code(LIP), C_LIP_D = code(LIP, -1), C_MOUTH = code(MOUTH), C_CLAW = code(CLAW), C_EYEW = code(EYEW), C_EYE = code(EYE);
  const M_GREEN = () => C_GREEN, M_MINT = () => C_MINT, M_CLAW = () => C_CLAW, M_LIP = () => C_LIP;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, dot = V3.dot, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid spanning p0 → p1 (its local y), model-space points; `hint` = preferred local x direction
  function seg(p0, p1, rx, rz, part, grp, mat, hint = [1, 0, 0]) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const Y = sc(d, 1 / l);
    let X = sub(hint, sc(Y, dot(hint, Y)));
    if (len3(X) < 1e-3) X = cross(Y, [0, 0, 1]);
    X = nrm(X);
    const Z = cross(X, Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(rx, l / 2, rz)), part, grp, mat);
  }
  // two-bone IK: knee/elbow position for a limb from a to b (bone lengths l1, l2), bending toward `hint`
  function ik(a, b, l1, l2, hint) {
    const d = sub(b, a);
    const dl = Math.min(len3(d), l1 + l2 - 1e-3), u = nrm(d);
    const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    let n = sub(hint, sc(u, dot(hint, u)));
    if (len3(n) < 1e-4) n = cross(u, [0, 0, 1]);
    return add(add(a, sc(u, x)), sc(nrm(n), h));
  }
  let curScale = 1;

  /* ---------- torso: pear-shaped green body, mint open vest over the chest ---------- */
  const BELLY_C = [0, 52, 0], BELLY_R = [24, 19, 27];
  const CHEST_C = [1, 71, 0], CHEST_R = [19, 18, 23];
  // torso-space point → vest (mint) or body (green)
  const vestAt = (p) => p[1] > 64 - 5 * Math.abs(p[2]) / 23 && Math.abs(p[2]) > 7.5 + 0.1 * Math.max(0, p[0]) && p[0] > -10;
  const torsoMat = (C, Rr) => (s) => (vestAt([C[0] + Rr[0] * s[0], C[1] + Rr[1] * s[1], C[2] + Rr[2] * s[2]]) ? C_MINT : C_GREEN);

  /* ---------- head: mint face (front), green back; eyes are decals ---------- */
  const HR = [34, 33, 36];
  const EAZ = 0.4, EV = 0.2; // eye centres on the head's unit sphere
  const EC = [1, -1].map((sd) => Creature.sph(sd * EAZ, EV));
  function eyePix(s, kind) {
    const sd = s[2] > 0 ? 0 : 1, q = EC[sd];
    // local tangent frame at the eye centre: u toward the front (the beak), v up
    const az = Math.abs(Math.atan2(q[2], q[0]));
    const fw = [Math.sin(az), 0, (sd ? 1 : -1) * Math.cos(az)];
    const u = (s[0] - q[0]) * fw[0] + (s[2] - q[2]) * fw[2], v = s[1] - q[1];
    const px = 1 / (curScale * HR[1]);
    const ru = Math.max(0.27, 2.2 * px), rv = Math.max(0.24, 2.0 * px);
    if (kind === 'open') {
      // half-lidded: the upper part of the almond is covered by a flat lid, a dark lid line on top
      const lid = 0.03 * rv, lw = Math.max(0.05, 0.8 * px);
      const a = u / ru, b = (v - lid * 0.5) / rv;
      if (a * a + b * b >= 1 || v > lid + lw) return 0;
      if (v > lid) return C_EYE;
      if (v < -0.62 * rv * Math.sqrt(Math.max(0, 1 - a * a)) - 0.3 * lw && a * a + b * b > 0.72) return C_EYE; // lower rim (only when big)
      // pupil: a black dot just under the lid, toward the beak
      const pr = Math.max(0.085, 1.05 * px);
      const pu = (u - 0.18 * ru) / pr, pv = (v - (lid - 0.9 * pr)) / (pr * 1.1);
      return pu * pu + pv * pv < 1 ? C_EYE : C_EYEW;
    }
    const w = Math.max(0.045, 0.72 * px), a = u / (ru * 0.95);
    if (Math.abs(a) > 1) return 0;
    let yc;
    if (kind === 'happy') yc = rv * 0.5 * (1 - 1.8 * a * a);
    else if (kind === 'blink') yc = -rv * 0.05;
    else yc = -rv * 0.3 * (1 - a * a);
    return Math.abs(v - yc) < w ? C_EYE : 0;
  }
  const headMat = (kind) => (s) => {
    if (s[0] < -0.28 + 0.12 * s[1]) return C_GREEN; // back of the head
    if (s[0] > 0.2 && Math.abs(s[2]) < 0.9) { const e = eyePix(s, kind); if (e) return e; }
    return C_MINT;
  };

  /* ---------- lily-pad hat: top + underside discs, a rim wall of plates, a square notch ---------- */
  const HAT_R = 64, HAT_H = 19, RIM_N = 28;
  const NOTCH_A = -1.75, NOTCH_IN = 0.66, NOTCH_W = 23; // notch direction (atan2(z, x) in the hat frame), depth, width
  const ND = [Math.cos(NOTCH_A), Math.sin(NOTCH_A)], NP = [-ND[1], ND[0]];
  const inNotch = (x, z) => x * ND[0] + z * ND[1] > HAT_R * NOTCH_IN && Math.abs(x * NP[0] + z * NP[1]) < NOTCH_W / 2;
  const padTop = (s) => (s[1] < 0 || inNotch(HAT_R * s[0], HAT_R * s[2]) ? 0 : C_PAD);
  const padBot = (s) => (s[1] > 0 || inNotch(HAT_R * s[0], HAT_R * s[2]) ? 0 : C_PADU);
  const RIM_L = (2 * Math.PI * HAT_R) / RIM_N;
  const rimShape = (hw, h) => bakeShape({
    bb: [-hw - 0.5, -h / 2 - 0.5, hw + 0.5, h / 2 + 0.5],
    test: (u, v) => (Math.abs(u) > hw || Math.abs(v) > h / 2 ? 0 : v > h / 2 - 2.6 ? C_RIM_L : v < -h / 2 + 3 ? C_RIM_D : C_RIM),
  });
  const RIM_G = rimShape(RIM_L / 2 + 0.8, HAT_H);
  const NSIDE_L = Math.sqrt(HAT_R * HAT_R - (NOTCH_W / 2) ** 2) - HAT_R * NOTCH_IN;
  const NSIDE_G = rimShape(NSIDE_L / 2 + 0.4, HAT_H), NIN_G = rimShape(NOTCH_W / 2 + 0.4, HAT_H);

  /* ---------- beak: thick pink lips drooping at the corners ---------- */
  const BEAK = [HR[0] * 0.8, -8.5, 0]; // head frame: centre of the mouth line

  const DEFAULT = { walk: 0, swim: 0, dance: 0, groove: 1, arms: 0, armN: null, armF: null, lean: 0, eyes: 'open', mouth: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 64; i++) PRI[i] = 0;
  // 1 torso, 2 head, 3 ears/tufts, 4 upper lip, 5 lower lip, 6 mouth, 7 hat top, 8 hat under, 9 rim,
  // 10/11 arms, 12/13 hands, 14/15 legs, 16/17 feet, 18..21 claws
  Object.assign(PRI, { 2: 1, 3: 2, 4: 3, 5: 2, 6: 1, 7: 2, 8: 1, 9: 3, 10: 1, 11: 1, 12: 2, 13: 2, 14: 1, 15: 1, 16: 2, 17: 2, 18: 3, 19: 3, 20: 3, 21: 3 });
  const SIZE = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const swp = +P.swim || 0, swimming = swp !== 0;
    const dph = +P.dance || 0, dancing = dph !== 0 && !swimming;
    const g = dancing ? clamp(P.groove ?? 1, 0, 1) : 0;
    const mo = clamp(+P.mouth || 0, 0, 1), lean = clamp(+P.lean || 0, -1, 1), side = clamp(P.side ?? 1, -1, 1);
    const ws = walking && !swimming ? Math.sin(wk) : 0, wc = walking && !swimming ? Math.cos(wk) : 0;
    const ds = Math.sin(dph);

    // ---- root / torso frame: walk bob + waddle, dance sway, swim tip-over
    const bob = walking && !swimming ? -2.4 * Math.abs(ws) + 0.6 : dancing ? -3 * g * ds * ds : 0;
    const sway = dancing ? g * ds : 0;
    const waddle = walking && !swimming ? 0.07 * ws : 0;
    const swimTip = swimming ? 1.05 : 0, swimBob = swimming ? 2 * Math.sin(swp * 2) : 0;
    const HIP = 38;
    const torso = chain(
      T(0, bob + swimBob + (swimming ? -20 : 0), sway * 6),
      T(0, HIP, 0), R(M3.rx(-sway * 0.15 + waddle)), R(M3.ry(dancing ? 0.18 * g * Math.sin(dph) : 0)), R(M3.rz(-0.14 * lean - swimTip)), T(0, -HIP, 0),
    );
    prims.push(ellF(chain(torso, T(...BELLY_C)), BELLY_R, 1, 1, torsoMat(BELLY_C, BELLY_R)));
    prims.push(ellF(chain(torso, T(...CHEST_C)), CHEST_R, 1, 1, torsoMat(CHEST_C, CHEST_R)));
    prims.push(seg(inF(torso, [1, 80, 0]), inF(torso, [5, 102, 0]), 12.5, 13, 1, 1, M_GREEN)); // neck
    anchors.body = inF(torso, [0, 60, 0]);

    // ---- head (bobs a little with the walk / dance; tips up to look forward when swimming)
    const hf = chain(torso, T(7, 121, 0), R(M3.rz(0.1 + (swimming ? 0.95 : 0) + 0.06 * lean + (dancing ? 0.06 * g * Math.sin(2 * dph) : 0))), R(M3.rx(dancing ? 0.1 * g * ds : -waddle * 0.6)));
    const headPrim = ellF(hf, HR, 2, 2, headMat(P.eyes));
    prims.push(headPrim);
    anchors.head = hf.t;
    for (const [k, q] of [['eyeN', EC[0]], ['eyeF', EC[1]]]) anchors[k] = inF(hf, [HR[0] * q[0], HR[1] * q[1], HR[2] * q[2]]);
    // "ears": little mint lobes on the sides, and green tufts of hair under the hat by them
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * 1.62, 0.02);
      const n = nrm([s[0] / HR[0], s[1] / HR[1], s[2] / HR[2]]);
      const p = add([HR[0] * s[0], HR[1] * s[1], HR[2] * s[2]], sc(n, 1.5));
      prims.push(ellF(chain(hf, T(...p), R(M3.ry(sd * 0.1))), [5.5, 7.5, 3.4], 3, 3, M_MINT));
      const t0 = inF(hf, [-9, -4, sd * 29]), t1 = inF(hf, [-13, -21, sd * 27]);
      prims.push(seg(t0, t1, 3.6, 2.6, 3, 3, M_GREEN));
      prims.push(seg(inF(hf, [-19, 2, sd * 25]), inF(hf, [-24, -14, sd * 23]), 3.2, 2.4, 3, 3, M_GREEN));
    }

    // ---- beak: upper lip (centre + drooping corners), lower lip hinged, dark mouth
    const bk = chain(hf, T(...BEAK), R(M3.rz(0.1)));
    const upF = chain(bk, R(M3.rz(0.18 * mo)));
    const upC = ellF(chain(upF, T(5.5, 2.6, 0)), [12, 5.2, 16], 4, 4, M_LIP);
    prims.push(upC);
    for (const sd of [1, -1]) prims.push(ellF(chain(upF, T(-3.5, -1.2, sd * 15), R(M3.ry(sd * 0.7)), R(M3.rx(-sd * 0.55))), [10, 5, 9], 4, 4, M_LIP));
    const loF = chain(bk, R(M3.rz(-0.55 * mo)));
    prims.push(ellF(chain(loF, T(3.5, -3.4, 0)), [10.5, 4.4, 14], 5, 5, (s) => (s[1] > 0.5 && mo > 0.05 ? C_LIP_D : C_LIP)));
    for (const sd of [1, -1]) prims.push(ellF(chain(loF, T(-4, -3.6, sd * 13), R(M3.ry(sd * 0.7)), R(M3.rx(-sd * 0.5))), [8.5, 4.2, 8], 5, 5, M_LIP));
    if (mo > 0.03) prims.push(ellF(chain(bk, T(0, -1, 0)), [9, 3 + 5 * mo, 13], 6, 6, () => C_MOUTH));
    anchors.mouth = inF(bk, [14, -1, 0]);

    // ---- hat (pushed back on the head; rolls toward the camera; bounces with the dance)
    const hat = chain(hf, T(-16, 25, 0), R(M3.rz(0.46 + (dancing ? 0.06 * g * Math.sin(2 * dph - 0.7) : 0) - (swimming ? 0.9 : 0))), R(M3.rx(0.2 * side + (dancing ? 0.06 * g * Math.sin(dph - 0.8) : 0))));
    prims.push(ellF(chain(hat, T(0, HAT_H / 2, 0)), [HAT_R, 3.4, HAT_R], 7, 7, padTop));
    prims.push(ellF(chain(hat, T(0, -HAT_H / 2, 0)), [HAT_R, 2.6, HAT_R], 8, 8, padBot));
    for (let i = 0; i < RIM_N; i++) {
      const th = (i / RIM_N) * Math.PI * 2 + 0.07;
      const o = [Math.cos(th), 0, Math.sin(th)], u = [-Math.sin(th), 0, Math.cos(th)];
      const c = sc(o, HAT_R - 0.9);
      if (inNotch(c[0], c[2]) || inNotch(c[0] + u[0] * RIM_L * 0.35, c[2] + u[2] * RIM_L * 0.35) || inNotch(c[0] - u[0] * RIM_L * 0.35, c[2] - u[2] * RIM_L * 0.35)) continue;
      prims.push(PL(inF(hat, c), M3.mul(hat.L, M3.cols(u, [0, 1, 0], o)), 9, 9, RIM_G, 1.6));
    }
    // the notch: two side walls and the inner wall
    const dN = [ND[0], 0, ND[1]], pN = [NP[0], 0, NP[1]];
    for (const sd of [1, -1]) {
      const c = add(sc(dN, HAT_R * NOTCH_IN + NSIDE_L / 2), sc(pN, sd * NOTCH_W / 2));
      prims.push(PL(inF(hat, c), M3.mul(hat.L, M3.cols(dN, [0, 1, 0], pN)), 9, 9, NSIDE_G, 1.6));
    }
    prims.push(PL(inF(hat, sc(dN, HAT_R * NOTCH_IN)), M3.mul(hat.L, M3.cols(pN, [0, 1, 0], dN)), 9, 9, NIN_G, 1.6));
    anchors.hat = inF(hat, [0, HAT_H / 2, 0]);
    let top = anchors.hat;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const q = inF(hat, [HAT_R * Math.cos(a), HAT_H / 2, HAT_R * Math.sin(a)]);
      if (q[1] > top[1]) top = q;
    }
    anchors.top = top;

    // ---- arms: very long, hanging out to the sides; flat hands with three pink claws
    const armR = [P.armN ?? P.arms, P.armF ?? P.arms].map((a) => clamp(+a || 0, -1, 1));
    [1, -1].forEach((sd, k) => {
      let a = armR[k];
      if (dancing) a = clamp(a + g * (0.55 + 0.45 * sd * ds), -1, 1);
      // abduction from hanging straight down: −1 → 0.22, 0 → 0.62 (rest), 1 → 2.7 (overhead)
      const ab = a < 0 ? lerp(0.74, 0.22, -a) : lerp(0.74, 2.7, a);
      let swing = walking && !swimming ? -0.34 * sd * ws : 0;
      let bend = 0.14 + 0.1 * Math.max(0, a);
      if (swimming) {
        // breaststroke: arms reach forward, sweep out and back
        const sp = Math.sin(swp), cp = Math.cos(swp);
        swing = 1.2 + 0.7 * sp; bend = 0.4 - 0.3 * cp;
      }
      const sh = chain(torso, T(1, 82, sd * 21), R(M3.rz(swing)), R(M3.rx(-sd * ab)));
      const L1 = 41, L2 = 40;
      const el = chain(sh, T(0, -L1, 0), R(M3.rz(bend)));
      const id = k ? 11 : 10;
      prims.push(seg(sh.t, el.t, 7.8, 7.4, id, id, M_MINT, dirF(sh, [1, 0, 0])));
      const wr = inF(el, [0, -L2, 0]);
      prims.push(seg(el.t, wr, 8.6, 8, id, id, M_MINT, dirF(el, [1, 0, 0])));
      // hand: a flat paddle (palm facing in), three claws fanned along the forward axis
      const hd = chain(el, T(0, -L2 - 6, 0), R(M3.rx(sd * 0.1)));
      prims.push(ellF(hd, [10.5, 8, 4.6], id + 2, id + 2, M_MINT));
      let tip = null;
      for (const [cx, sp] of [[-7.4, -0.55], [0, 0], [7.4, 0.55]]) {
        const cf = chain(hd, T(cx, -6.8, 0), R(M3.rz(sp)), T(0, -4.6, 0));
        prims.push(ellF(cf, [2.9, 6.4, 2.8], 18 + k, 18 + k, M_CLAW));
        if (cx === 0) tip = inF(cf, [0, -6.4, 0]);
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = tip;
    });

    // ---- legs: short, bowed, knees out; feet with three pink claws (IK keeps the feet planted)
    [1, -1].forEach((sd, k) => {
      const ph = sd > 0 ? wk : wk + Math.PI;
      let swing = walking && !swimming ? 9 * Math.sin(ph) : 0;
      let lift = walking && !swimming ? 5 * Math.max(0, Math.cos(ph)) : 0;
      let knee = 0;
      if (dancing) knee = clamp(0.6 * g * Math.max(0, -sd * ds), 0, 1);
      let hip = inF(torso, [0, HIP, sd * 13.5]);
      let foot = [2 + swing, 5 + lift + 14 * knee, sd * 27];
      if (swimming) {
        // frog kick behind the tipped body
        const kk = Math.sin(swp + (sd > 0 ? 0 : 0.4));
        foot = inF(torso, [-4 - 10 * kk, 10, sd * (24 + 8 * kk)]);
      }
      const L1 = 21, L2 = 20;
      const kneeP = ik(hip, foot, L1, L2, [0.55, 0.15, sd * 1]);
      const id = 14 + k;
      prims.push(seg(hip, kneeP, 9.4, 9.2, id, id, M_GREEN));
      prims.push(seg(kneeP, foot, 8.2, 8, id, id, M_GREEN));
      // foot: flat oval, toes out; claws at the front
      const yawOut = sd * 0.35;
      const ff = chain(T(...foot), R(M3.ry(-yawOut)), R(M3.rz(swimming ? -0.9 : 0.25 * knee)));
      prims.push(ellF(chain(ff, T(5, -0.5, 0)), [12.5, 5.2, 9.5], id + 2, id + 2, M_GREEN));
      for (const [cz, sp] of [[-6.6, -0.5], [0, 0], [6.6, 0.5]]) {
        const cf = chain(ff, T(15.5, -1.6, cz), R(M3.ry(-sp)), T(4.2, 0, 0));
        prims.push(ellF(cf, [6.2, 2.7, 2.7], 20 + k, 20 + k, M_CLAW));
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(ff, [8, -4.5, 0]);
    });

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: MINT, shadowSteps: 14 };
  }

  function render(model, opt) {
    curScale = (opt.scale || 1) * SIZE;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.2, bw: 250, bh: 260, oy: 0.9 } };
})();
