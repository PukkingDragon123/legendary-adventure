/* ------------------------------------------------------------------
   Bagon — the Rock Head Pokémon (0.6 m ≈ 105 units at scale 1).
   A small blue bipedal dragon: a big head capped by a rounded grey-white
   helmet whose front rim hangs over the eyes like a determined brow, a
   blue muzzle over a big pale-yellow lower jaw with two small white fangs
   poking up at its front corners, a pale-yellow belly, stubby arms, short
   legs with white claws and a short pointed tail.
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
  const { chain, T, R, F, code, sph } = Creature;

  // material ids
  const BLUE = 1, HELMET = 2, CREAM = 3, WHITE = 4, MOUTH = 5, TONGUE = 6;
  const MAT = { BLUE, HELMET, CREAM, WHITE, MOUTH, TONGUE };
  const PAL = Creature.palette({
    [BLUE]:   { r: ['#244c8a', '#376cb4', '#5090d8', '#7eb4ee', '#bcdcff'], od: '#10285a', ol: '#2a589e', ln: '#224c90' },
    [HELMET]: { r: ['#888a94', '#acaeb6', '#d0d1d7', '#ebebee', '#ffffff'], od: '#42444c', ol: '#72747e', ln: '#60626c' },
    [CREAM]:  { r: ['#baa05e', '#d7bd7a', '#eddb9e', '#f9eec6', '#fffbe8'], od: '#684e1e', ol: '#9e824e', ln: '#967e4a' },
    [WHITE]:  { r: ['#acb2bc', '#ced4dc', '#f0f3f7', '#ffffff', '#ffffff'], od: '#485060', ol: '#78808e', ln: '#6a7280' },
    [MOUTH]:  { r: ['#561222', '#761e32', '#962e42', '#b44456', '#cc6272'], od: '#340912', ol: '#561222', ln: '#48101e' },
    [TONGUE]: { r: ['#b4465a', '#d05e6e', '#ea7e88', '#ffa2a4', '#ffc6c2'], od: '#681428', ol: '#881e36', ln: '#963044' },
  });
  const GLOSSY = { [HELMET]: 1, [BLUE]: 1 };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- eye stamps (k = black, w = white glint, b = blue-black) ---------- */
  const mirror = (g) => g.map((row) => row.split('').reverse().join(''));
  const SET = {
    open: ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'], openN: ['.k.', 'kwk', 'kkk', 'kbk', '.k.'], openF: ['k.', 'wk', 'kk', 'k.'],
    angry: ['kk..', 'kkkk', 'kwkk', 'kkbk', '.kk.'], angryN: ['k..', 'kkk', 'kwk', 'kbk', '.k.'], angryF: ['k.', 'kk', 'wk', 'k.'],
    happy: ['.kk.', 'k..k', 'k..k'], happyN: ['.k.', 'k.k', 'k.k'], happyF: ['.k', 'k.'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['....', 'kkkk', '.kk.'], blinkN: ['...', 'kkk', '.k.'], blinkF: ['..', 'kk'],
  };
  const EYES = SET, EYES_M = Object.fromEntries(Object.entries(SET).map(([k, g]) => [k, mirror(g)]));
  const EYEC = { k: '#101420', w: '#ffffff', b: '#2c3e6c' };

  const HEAD_R = [24, 23, 24];
  const DEFAULT = { mouth: 0, step: 0, jump: 0, headbutt: 0, sleep: 0, eyes: 'open', squash: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const mouth = clamp(+P.mouth || 0, 0, 1), jump = clamp(+P.jump || 0, 0, 1), hb = clamp(+P.headbutt || 0, 0, 1);
    const step = +P.step || 0, sl = clamp(+P.sleep || 0, 0, 1);
    const crouch = jump < 0.4 ? smooth(0, 0.4, jump) : 1 - smooth(0.4, 0.6, jump);
    const leap = smooth(0.45, 1, jump);
    const walk = Math.abs(Math.sin(step)) > 1e-3 ? 1 : 0;
    const bob = walk ? Math.abs(Math.sin(step)) * 2.2 : 0;
    const sq = clamp((+P.squash || 0) + 0.16 * crouch - 0.12 * leap + 0.07 * sl, -0.35, 0.35);
    const lift = 44 * leap;
    const root = F(M3.diag(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45), [0, lift, 0]);
    const lean = -0.55 * hb + 0.12 * leap - 0.06 * crouch + 0.2 * sl;
    const body = chain(root, T(0, 16 - 7 * crouch - 10 * sl + bob, 0), R(M3.rz(lean)), T(0, -16, 0));
    const prims = [], stamps = [], anchors = {};

    /* --- body with the cream belly --- */
    const bodyC = [0, 31, 0], bodyR = [20.5, 23.5, 20.5];
    prims.push(ellF(chain(body, T(...bodyC)), bodyR, 1, 1, (s) => {
      const bz = s[2] / 0.72, by = (s[1] + 0.08) / 0.82;
      return s[0] > 0.2 && bz * bz + by * by < 1 ? code(CREAM) : code(BLUE);
    }));
    anchors.body = P2W(body, bodyC); anchors.belly = P2W(body, [bodyR[0], 30, 0]);

    /* --- head --- */
    const hp = 0.55 * hb - 0.22 * leap + 0.05 * crouch + 0.42 * sl; // nod down for the headbutt / sleep, chin up for the leap
    const head = chain(body, T(4, 54, 0), R(M3.rz(-hp)), T(1, 19, 0));
    const headPrim = ellF(head, HEAD_R, 2, 2, () => code(BLUE));
    prims.push(headPrim);
    // helmet: a cap a little bigger than the head, hugging its top half; its rim runs straight over
    // the eyes as a visor at the front and drops lower round the back
    const helm = chain(head, T(-0.5, 2.5, 0));
    const HR2 = [28.5, 23.5, 27];
    prims.push(ellF(helm, HR2, 3, 3, (s) => {
      const rim = 0.07 * smooth(0.2, 0.8, s[0]) - 0.12 - 0.42 * Math.max(0, -s[0]);
      if (s[1] < rim) return 0;
      return code(HELMET, s[1] < rim + 0.1 ? -1 : 0);
    }));
    anchors.top = P2W(helm, [0, HR2[1], 0]); anchors.helmet = P2W(helm, [HR2[0], 3, 0]); anchors.head = head.t;
    // muzzle (upper jaw)
    const muz = chain(head, T(13, -7.5, 0));
    prims.push(ellF(muz, [15, 10.5, 16], 2, 2, (s) => code(BLUE)));
    // mouth interior (only seen when the jaw drops)
    if (mouth > 0.04) prims.push(ellF(chain(head, T(13, -14.5, 0)), [12.5, 5, 12], 6, 6, (s) => (s[1] < -0.2 && Math.abs(s[2]) < 0.6 && s[0] > -0.3 ? code(TONGUE) : code(MOUTH))));
    // lower jaw, hinged at the back of the mouth
    const jaw = chain(head, T(2, -13, 0), R(M3.rz(-0.5 * mouth)), T(12, -4.5, 0));
    prims.push(ellF(jaw, [15.5, 10, 14.5], 4, 4, (s) => code(CREAM)));
    // fangs poking up from the front corners of the lower jaw
    for (const sd of [1, -1]) {
      const fg = chain(jaw, T(10.5, 8, sd * 6.4), R(M3.rz(0.2)));
      prims.push(ellF(fg, [1.9, 4, 1.9], 5, 5, (s) => (s[1] < -0.2 ? 0 : code(WHITE))));
    }
    anchors.mouth = P2W(jaw, [14, 7, 0]);
    // eyes below the helmet rim
    const eyeAt = (sd) => { const s = sph(sd * 0.56, -0.02); return { prim: headPrim, p: P2W(head, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]), s }; };
    const kind = ['happy', 'closed', 'blink', 'angry'].includes(P.eyes) ? P.eyes : P.eyes === 'sleep' ? 'closed' : 'open';
    for (const sd of [1, -1]) {
      const at = eyeAt(sd);
      stamps.push({ at, set: sd > 0 ? EYES : EYES_M, colors: EYEC, kind, near: 0.7, far: 0.42 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }

    /* --- arms --- */
    for (const sd of [1, -1]) {
      const sw = walk ? -0.5 * Math.sin(step) * sd : 0;
      const up = 1.3 * leap - 0.5 * crouch + 0.35 * hb - 0.25 * sl;
      const arm = chain(body, T(6, 42, sd * 17), R(M3.rz(0.35 + sw + up)), R(M3.rx(-sd * (0.45 + 0.35 * leap))), T(0, -9, 0));
      const id = sd > 0 ? 7 : 8;
      prims.push(ellF(arm, [5.4, 10.5, 5.6], id, id, () => code(BLUE)));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(arm, T(3.2, -9, k * 2.3 + sd * 0.5), R(M3.rz(-0.5))), [1.4, 2.3, 1.3], id, id, () => code(WHITE)));
      anchors[sd > 0 ? 'handN' : 'handF'] = P2W(arm, [2, -11, 0]);
    }

    /* --- legs and feet (white claws) --- */
    for (const sd of [1, -1]) {
      const ph = step + (sd > 0 ? 0 : Math.PI);
      const sw = walk ? 0.5 * Math.sin(ph) : 0;
      const lf = walk ? Math.max(0, Math.cos(ph)) * 4 : 0;
      const trail = -0.5 * leap - 0.45 * hb * (sd > 0 ? 0.2 : 1);
      const hip = chain(body, T(3, 17 + lf * 0.5, sd * 11.5), R(M3.rz(sw + trail + 0.5 * crouch + 1.25 * sl)), R(M3.rx(-sd * (0.12 + 0.15 * sl))));
      const id = sd > 0 ? 9 : 10;
      prims.push(ellF(chain(hip, T(0, -5, 0)), [9.5, 10, 9], id, id, () => code(BLUE)));
      const foot = chain(hip, T(3, -12.5 + lf * 0.3, 0), R(M3.rz(-(sw + trail + 0.5 * crouch) * 0.85 + 0.25 * leap - 0.5 * sl)));
      prims.push(ellF(foot, [11.5, 4.8, 9], id, id, () => code(BLUE)));
      for (const k of [-1, 0, 1]) prims.push(ellF(chain(foot, T(10.2, -1.2, k * 4), R(M3.ry(-k * 0.3))), [2.4, 1.9, 1.7], id, id, () => code(WHITE)));
      anchors[sd > 0 ? 'footN' : 'footF'] = P2W(foot, [0, -4.8, 0]);
    }

    /* --- tail --- */
    const tw = walk ? 0.2 * Math.sin(step) : 0;
    const tail = chain(body, T(-16, 20, 0), R(M3.ry(tw + 0.5 * sl)), R(M3.rz(0.25 + 0.3 * leap - 0.2 * hb - 0.35 * sl)));
    prims.push(ellF(chain(tail, T(-8, 0, 0)), [11, 8, 9], 11, 11, () => code(BLUE)));
    prims.push(ellF(chain(tail, T(-19, -2, 0), R(M3.rz(0.2))), [10, 4.5, 5.5], 11, 11, () => code(BLUE)));
    anchors.tail = P2W(tail, [-28, -3, 0]);

    return {
      prims, stamps, dots: [], anchors, pose: P,
      pri: { 1: 0, 2: 1, 3: 3, 4: 2, 5: 4, 6: 1, 7: 2, 8: 2, 9: 1, 10: 1, 11: 0 },
      glossy: GLOSSY, baseMat: BLUE, shadowSteps: 16,
    };
  }

  const render = (model, opt) => Creature.render(model, opt);

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 150, bh: 215, oy: 0.93 } };
})();
