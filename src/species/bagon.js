/* ------------------------------------------------------------------
   Bagon — the Rock Head Pokémon (0.6 m ≈ 105 units at scale 1).
   A small, soft-blue dragon crouched forward, after the official art:
   a BIG head (over half its height) capped by a large rounded grey helmet
   built from three ridged lobes, whose front lobe hangs over the eyes like
   a frowning brow and whose back flap runs down the nape; a long bulbous
   muzzle over a big lower jaw with a cream upper edge and a small white
   fang poking up on each side; white eyes with black pupils; a yellow
   ear-ring disc on each side of the head; a pear-shaped body with a cream
   belly patch; stubby clawed arms; thick thighs, three-toed feet and a
   short thick tail.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Pose params:
     mouth    0..1   lower jaw drops open (tongue shows)
     step     radians walk-cycle phase (legs swing/lift, arms counter-swing, body bobs)
     jump     0..1   0..0.4 crouch (squash, knees bent), 0.4..1 leap (stretched, lifted
                     up to ~45 units, legs trailing, arms up, chin up)
     headbutt 0..1   leans forward and drives the helmet ahead (charging pose)
     sleep    0..1   sits down, legs out front, head nodding (pair with eyes 'closed')
     eyes     'open' | 'happy' | 'closed' | 'blink' | 'angry'
     squash   -0.3..0.3  extra vertical squash (+ = flatter)
   Anchors: top (helmet top), head, helmet (front of the helmet), mouth, eyeN, eyeF,
            body, belly, handN, handF, footN, footF, tail.
------------------------------------------------------------------- */
const Bagon = (() => {
  const { chain, T, R, F, S, code, sph } = Creature;

  // material ids
  const BLUE = 1, HELMET = 2, CREAM = 3, WHITE = 4, MOUTH = 5, TONGUE = 6;
  const MAT = { BLUE, HELMET, CREAM, WHITE, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [BLUE]:   { r: ['#3e6c8e', '#5a8fb0', '#83b6d0', '#aad3e6', '#d6eef8'], od: '#1c3a56', ol: '#3a6a8e', ln: '#355f80' },
    [HELMET]: { r: ['#7c7e84', '#a2a4a8', '#c6c7c9', '#dfe0e1', '#f6f6f6'], od: '#3a3c44', ol: '#6a6c74', ln: '#6c6e76' },
    [CREAM]:  { r: ['#a88a48', '#c6a860', '#e0c584', '#f0dca8', '#fcf2d6'], od: '#5e4418', ol: '#94783e', ln: '#8e7240' },
    [WHITE]:  { r: ['#a4acb6', '#c8ced6', '#eceff3', '#ffffff', '#ffffff'], od: '#404858', ol: '#707888', ln: '#6a7280' },
    [MOUTH]:  { r: ['#561222', '#761e32', '#962e42', '#b44456', '#cc6272'], od: '#340912', ol: '#561222', ln: '#48101e' },
    [TONGUE]: { r: ['#b4465a', '#d05e6e', '#ea7e88', '#ffa2a4', '#ffc6c2'], od: '#681428', ol: '#881e36', ln: '#963044' },
  });
  const GLOSSY = { [HELMET]: 1 };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- eye stamps (d = dark rim, w = white, k = black pupil, g = glint) ---------- */
  const mirror = (g) => g.map((row) => row.split('').reverse().join(''));
  const SET = {
    open:   ['ddd.....', 'dwwddd..', 'dwwwkkdd', 'dwwkkgkd', 'dwwkkkkd', '.dwwkkd.', '..dddd..'],
    openN:  ['dd.....', 'dwddd..', 'dwwkkdd', 'dwkkgkd', 'dwkkkkd', '.dwkkd.', '..ddd..'],
    openF:  ['dd..', 'dkdd', 'dkkd', 'dkkd', '.dd.'],
    angry:  ['dd......', 'dwdd....', 'dwwwdd..', 'dwwkkddd', 'dwkkgkkd', '.dwkkkd.', '..dddd..'],
    angryN: ['dd.....', 'dwdd...', 'dwwkdd.', 'dwkkgdd', 'dwkkkkd', '.dwkkd.', '..ddd..'],
    angryF: ['d...', 'ddd.', 'dkdd', 'dkkd', '.dd.'],
    happy:  ['..dddd..', '.d....d.', 'd......d', 'd......d'], happyN: ['..ddd..', '.d...d.', 'd.....d', 'd.....d'], happyF: ['.dd.', 'd..d', 'd..d'],
    closed: ['........', 'd......d', '.d....d.', '..dddd..'], closedN: ['.......', 'd.....d', '.d...d.', '..ddd..'], closedF: ['d..d', '.dd.'],
    blink:  ['........', '........', 'dddddddd', '.dddddd.'], blinkN: ['.......', '.......', 'ddddddd', '.ddddd.'], blinkF: ['....', 'dddd', '.dd.'],
  };
  const SET_S = {
    open: ['kk', 'kk'], openN: ['kk', 'kk'], openF: ['k', 'k'],
    angry: ['k.', 'kk'], angryN: ['k.', 'kk'], angryF: ['k'],
    happy: ['.k.', 'k.k'], happyN: ['.k', 'k.'], happyF: ['k'],
    closed: ['kk'], closedN: ['kk'], closedF: ['k'], blink: ['kk'], blinkN: ['kk'], blinkF: ['k'],
  };
  const flipSet = (S) => Object.fromEntries(Object.entries(S).map(([k, g]) => [k, mirror(g)]));
  const EYES = SET, EYES_M = flipSet(SET), EYES_SN = SET_S, EYES_SM = flipSet(SET_S);
  const EYEC = { d: '#16202e', w: '#ffffff', k: '#101418', g: '#5a6a80' };
  // yellow ear disc with a dark ring and a dark slit
  const EAR = { open: ['.dddd.', 'dyyyyd', 'dyykyd', 'dyykyd', 'dyykyd', 'dyyyyd', '.dddd.'], openN: ['.ddd.', 'dyyyd', 'dykyd', 'dykyd', 'dykyd', 'dyyyd', '.ddd.'], openF: ['.d.', 'dyd', 'dkd', 'dkd', 'dyd', '.d.'] };
  const EAR_S = { open: ['yy', 'yy'], openN: ['y', 'y'], openF: ['y'] };
  const EARC = { d: '#2a3448', y: '#f0cc6a', k: '#2a3448' };

  const DEFAULT = { mouth: 0, step: 0, jump: 0, headbutt: 0, sleep: 0, eyes: 'open', squash: 0, side: 1 };

  const C_BLUE = code(BLUE), C_CREAM = code(CREAM), C_WHITE = code(WHITE), C_HELM = code(HELMET), C_HELM_D = code(HELMET, -1);
  const M_BLUE = () => C_BLUE, M_WHITE = () => C_WHITE;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const mouth = clamp(+P.mouth || 0, 0, 1), jump = clamp(+P.jump || 0, 0, 1), hb = clamp(+P.headbutt || 0, 0, 1);
    const step = +P.step || 0, sl = clamp(+P.sleep || 0, 0, 1);
    const crouch = jump < 0.4 ? smooth(0, 0.4, jump) : 1 - smooth(0.4, 0.6, jump);
    const leap = smooth(0.45, 1, jump);
    const walk = Math.abs(Math.sin(step)) > 1e-3 ? 1 : 0;
    const bob = walk ? Math.abs(Math.sin(step)) * 2 : 0;
    const sq = clamp((+P.squash || 0) + 0.16 * crouch - 0.12 * leap + 0.07 * sl, -0.35, 0.35);
    const lift = 44 * leap;
    const root = F(M3.diag(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45), [0, lift, 0]);
    // resting pose leans forward a little (the crouched-forward stance of the art)
    const lean = -0.16 - 0.5 * hb + 0.2 * leap - 0.06 * crouch + 0.3 * sl;
    const body = chain(root, T(-2, 14 - 6 * crouch - 9 * sl + bob, 0), R(M3.rz(lean)), T(0, -14, 0));
    const prims = [], stamps = [], anchors = {};

    /* --- pear-shaped body with the cream belly patch (a rounded triangle low on the front) --- */
    const bodyC = [0, 27, 0], bodyR = [19.5, 21, 18.5];
    prims.push(ellF(chain(body, T(...bodyC)), bodyR, 1, 1, (s) => {
      if (s[0] > 0.25 && s[1] < 0.15 && s[1] > -0.75) {
        const w = 0.5 * (0.15 - s[1]) / 0.9 + 0.08; // widens downward
        if (Math.abs(s[2]) < w * 1.2) return C_CREAM;
      }
      return C_BLUE;
    }));
    prims.push(ellF(chain(body, T(3, 44, 0)), [14, 12, 14], 1, 1, M_BLUE)); // chest / neck
    anchors.body = P2W(body, bodyC); anchors.belly = P2W(body, [bodyR[0], 20, 0]);

    /* --- head: big, set forward on the chest --- */
    const hp = 0.5 * hb - 0.22 * leap + 0.05 * crouch + 0.4 * sl - 0.1; // nod down for the headbutt / sleep, chin up for the leap
    const head = chain(body, T(8, 52, 0), R(M3.rz(-hp - lean * 0.55)), T(0, 15, 0), S(1.17, 1.17, 1.17));
    const HEAD_R = [20, 18, 17.5];
    const headPrim = ellF(head, HEAD_R, 2, 2, M_BLUE);
    prims.push(headPrim);
    // bulbous muzzle (upper jaw)
    prims.push(ellF(chain(head, T(19, -4, 0), R(M3.rz(-0.08))), [19, 10.5, 12.5], 2, 2, M_BLUE));
    // mouth interior (only seen when the jaw drops)
    if (mouth > 0.04) prims.push(ellF(chain(head, T(15, -12, 0)), [14, 4.5, 10.5], 6, 6, (s) => (s[1] < -0.2 && Math.abs(s[2]) < 0.6 && s[0] > -0.3 ? code(TONGUE) : code(MOUTH))));
    // big lower jaw, hinged at the back of the mouth: cream along its upper edge, blue below
    const jaw = chain(head, T(-2, -10, 0), R(M3.rz(-0.5 * mouth)), T(15, -3.5, 0), R(M3.rz(0.1)));
    prims.push(ellF(jaw, [18, 8, 13], 4, 4, (s) => (s[1] > 0.12 - 0.35 * Math.max(0, -s[0]) ? C_CREAM : C_BLUE)));
    // a small white fang poking up on each side of the lower jaw
    for (const sd of [1, -1]) {
      const fg = chain(jaw, T(5, 6, sd * 12.6), R(M3.rz(-0.05)), R(M3.rx(sd * 0.12)));
      prims.push(ellF(fg, [3, 5, 2.2], 5, 5, (s) => (s[1] < -0.3 ? 0 : C_WHITE)));
    }
    anchors.mouth = P2W(jaw, [16, 5, 0]);

    /* --- helmet: three ridged lobes over the top and a flap down the nape --- */
    const rimCut = (lo) => (s) => (s[1] < lo(s) ? 0 : s[1] < lo(s) + 0.14 ? C_HELM_D : C_HELM);
    const helmF = chain(head, T(-1, 3, 0));
    // front lobe: hangs over the eyes like a brow
    prims.push(ellF(chain(helmF, T(9, 9, 0), R(M3.rz(-0.45))), [13, 16, 21.5], 3, 3, rimCut((s) => -0.55 + 0.25 * s[0])));
    // middle and back lobes
    prims.push(ellF(chain(helmF, T(-2, 15, 0), R(M3.rz(-0.05))), [13.5, 15.5, 22], 7, 7, rimCut((s) => -0.5)));
    prims.push(ellF(chain(helmF, T(-13, 11, 0), R(M3.rz(0.45))), [13.5, 16, 21], 8, 8, rimCut((s) => -0.6)));
    // back flap running down the nape to the shoulders
    prims.push(ellF(chain(helmF, T(-19, -9, 0), R(M3.rz(0.28))), [8, 21, 15.5], 12, 12, (s) => (s[0] > 0.55 ? 0 : C_HELM)));
    anchors.top = P2W(helmF, [-2, 30.5, 0]); anchors.helmet = P2W(helmF, [21, 10, 0]); anchors.head = head.t;

    /* --- eyes just under the brow, ear discs further back --- */
    const onHead = (az, v) => { const s = sph(az, v); return { prim: headPrim, p: P2W(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s }; };
    const kind = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    for (const sd of [1, -1]) {
      const at = onHead(sd * 0.6, 0.14);
      stamps.push({ at, set: sd > 0 ? EYES : EYES_M, big: sd > 0 ? EYES : EYES_M, small: sd > 0 ? EYES_SN : EYES_SM, colors: EYEC, kind, near: 0.7, far: 0.4 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
      stamps.push({ at: onHead(sd * 1.8, 0.0), set: EAR, big: EAR, small: EAR_S, colors: EARC, kind: 'open', near: 0.72, far: 0.42, minFacing: 0.2 });
    }

    /* --- stubby arms with three small claws --- */
    for (const sd of [1, -1]) {
      const sw = walk ? -0.5 * Math.sin(step) * sd : 0;
      const up = 1.3 * leap - 0.5 * crouch + 0.35 * hb - 0.25 * sl;
      const arm = chain(body, T(8, 38, sd * 14), R(M3.rz(0.55 + sw + up)), R(M3.rx(-sd * (0.4 + 0.35 * leap))), T(0, -6.5, 0));
      const id = sd > 0 ? 9 : 10;
      prims.push(ellF(arm, [5, 8.5, 5.2], id, id, M_BLUE));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(arm, T(2.5, -7.5, k * 2.4), R(M3.rz(-0.35))), [1.8, 2.6, 1.6], id, id, M_BLUE));
      anchors[sd > 0 ? 'handN' : 'handF'] = P2W(arm, [2, -9, 0]);
    }

    /* --- thick thighs and three-toed feet --- */
    for (const sd of [1, -1]) {
      const ph = step + (sd > 0 ? 0 : Math.PI);
      const sw = walk ? 0.5 * Math.sin(ph) : 0;
      const lf = walk ? Math.max(0, Math.cos(ph)) * 4 : 0;
      const trail = -0.5 * leap - 0.45 * hb * (sd > 0 ? 0.2 : 1);
      const hip = chain(body, T(1, 17 + lf * 0.5, sd * 11), R(M3.rz(sw + trail + 0.5 * crouch + 1.25 * sl)), R(M3.rx(-sd * (0.1 + 0.15 * sl))));
      const id = sd > 0 ? 13 : 14;
      prims.push(ellF(chain(hip, T(1, -3, 1.5 * sd)), [13.5, 13.5, 10], id, id, M_BLUE));
      const foot = chain(hip, T(4, -12 + lf * 0.3, 1.5 * sd), R(M3.rz(-(sw + trail + 0.5 * crouch) * 0.85 + 0.25 * leap - 0.5 * sl - lean)));
      prims.push(ellF(foot, [10.5, 4.5, 8], id, id, M_BLUE));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(9.5, -1, k * 4), R(M3.ry(-k * 0.35)), R(M3.rz(-0.15))), [4, 2.6, 2.2], id, id, M_BLUE));
      anchors[sd > 0 ? 'footN' : 'footF'] = P2W(foot, [0, -4.5, 0]);
    }

    /* --- short thick tail --- */
    const tw = walk ? 0.2 * Math.sin(step) : 0;
    const tail = chain(body, T(-13, 15, 0), R(M3.ry(tw + 0.5 * sl)), R(M3.rz(0.35 + 0.3 * leap - 0.2 * hb - 0.35 * sl)));
    prims.push(ellF(chain(tail, T(-6, 0, 0)), [10, 8, 8.5], 11, 11, M_BLUE));
    prims.push(ellF(chain(tail, T(-15, -1.5, 0), R(M3.rz(0.15))), [8, 4.5, 5], 11, 11, M_BLUE));
    anchors.tail = P2W(tail, [-22, -2, 0]);

    return {
      prims, stamps, dots: [], anchors, pose: P,
      pri: { 1: 0, 2: 1, 3: 5, 4: 2, 5: 3, 6: 1, 7: 4, 8: 3, 9: 2, 10: 2, 11: 0, 12: 2, 13: 1, 14: 1 },
      glossy: GLOSSY, baseMat: BLUE, shadowSteps: 16,
    };
  }

  function render(model, opt) {
    const small = (opt.scale || 1) < 0.55;
    for (const st of model.stamps) st.set = small ? st.small : st.big;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 170, bh: 215, oy: 0.93 } };
})();
