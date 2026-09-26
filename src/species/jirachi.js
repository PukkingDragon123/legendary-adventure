/* ------------------------------------------------------------------
   Jirachi — the Wish Pokémon (0.3 m ≈ 52 units, star tip to toes).
   A tiny white body under a round white face set in a big yellow
   three-pointed star (points up, lower-left and lower-right); a blue
   paper wish tag hangs from each point, two long green-blue streamers
   hang down its back, small cyan marks sit under the eyes and its "true
   eye" is a faint closed line on the belly. Asleep (eyes closed) by default.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Pose params:
     arms   -1..1   -1 = arms down at the sides, 0 = held out, 1 = raised up (cheer)
     float  0..1    hovers up to 20 units, legs dangling
     eyes   'closed' (default) | 'open' | 'happy' | 'blink'
     tags   -1..1   sway of the wish tags and back streamers
     mouth  0..1    small smile opening
     glow   0..1    wish glow: the star and the tags brighten
   Anchors: top, head, mouth, eyeN, eyeF, body, handN, handF, tagTop, tagN, tagF.
------------------------------------------------------------------- */
const Jirachi = (() => {
  const { chain, T, R, F, code, sph } = Creature;

  // material ids
  const WHITE = 1, YELLOW = 2, TAG = 3, RIBBON = 4, CYAN = 5, MOUTH = 6, LINE = 7;
  const MAT = { WHITE, YELLOW, TAG, RIBBON, CYAN, MOUTH, LINE };
  const PAL = Creature.palette({
    [WHITE]:  { r: ['#b2b6c8', '#d2d6e4', '#f0f2f8', '#ffffff', '#ffffff'], od: '#4e5268', ol: '#888ca4', ln: '#8a8ea6' },
    [YELLOW]: { r: ['#c69618', '#e4b828', '#fad448', '#ffec88', '#fffad0'], od: '#6c4c06', ol: '#ae8210', ln: '#9e760e' },
    [TAG]:    { r: ['#3874b6', '#5294d2', '#76b4ea', '#a6d2f8', '#d8f0ff'], od: '#163e6c', ol: '#386ea6', ln: '#2a629e' },
    [RIBBON]: { r: ['#2a8686', '#3ea4a0', '#60c2b8', '#92dcd0', '#cef6ee'], od: '#0c4848', ol: '#2a7e7e', ln: '#206e6e' },
    [CYAN]:   { r: ['#3898d0', '#52b2e6', '#76caf6', '#a6e0ff', '#dcf4ff'], od: '#185a86', ol: '#3a8cc0', ln: '#3a8cc0' },
    [MOUTH]:  { r: ['#7a2638', '#9a3448', '#bc4a5c', '#d66a78', '#ec9aa2'], od: '#4a1020', ol: '#7a2638', ln: '#6a1e30' },
    [LINE]:   { r: ['#8a8ea6', '#9a9eb4', '#aeb2c6', '#c2c6d6', '#d6d9e4'], od: '#4e5268', ol: '#888ca4', ln: '#8a8ea6' },
  });
  const GLOSSY = { [YELLOW]: 1 };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- eye stamps (k = black, w = white glint) ---------- */
  const SET = {
    open: ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'], openN: ['.k.', 'kwk', 'kkk', 'kkk', '.k.'], openF: ['k.', 'wk', 'kk', 'k.'],
    happy: ['.kk.', 'k..k'], happyN: ['.k.', 'k.k'], happyF: ['.k', 'k.'],
    closed: ['k..k', '.kk.'], closedN: ['k.k', '.k.'], closedF: ['k.', '.k'],
    blink: ['kkkk', '.kk.'], blinkN: ['kkk', '.k.'], blinkF: ['kk'],
  };
  const EYEC = { k: '#1a1c30', w: '#ffffff' };
  // paper tag (plate): a rounded strip hanging down from its top edge (u across, v down = negative)
  const TAG_G = bakeShape(Shape2D.poly([[-1.5, 0.4], [1.5, 0.4], [1.6, -3], [1.4, -7.2], [0, -8], [-1.4, -7.2], [-1.6, -3]], code(TAG), 6));

  const FACE_C = [1, 29, 0], FACE_R = [9, 9.2, 9.8];
  const STAR_C = [-3.4, 30, 0];
  const PTS = [Math.PI / 2, Math.PI * 1.1, Math.PI * 1.9]; // star points (angle in the y-z plane, from +z toward +y)
  const PL = 22.5; // point length from the star centre
  const SIZE = 0.92;

  const DEFAULT = { arms: 0, float: 0, eyes: 'closed', tags: 0, mouth: 0, glow: 0, side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const arms = clamp(+P.arms || 0, -1, 1), fl = clamp(+P.float || 0, 0, 1), sway = clamp(+P.tags || 0, -1, 1), mouth = clamp(+P.mouth || 0, 0, 1);
    const root = F(M3.I(), [0, 20 * fl, 0]);
    const prims = [], stamps = [], anchors = {};

    /* --- body with the closed "true eye" line on the belly --- */
    const body = chain(root, T(0, 13, 0));
    prims.push(ellF(body, [7, 8.6, 7.6], 1, 1, (s) => {
      if (s[0] > 0.55 && Math.abs(s[2]) < 0.34) { const yc = -0.28 + 1.3 * s[2] * s[2]; if (Math.abs(s[1] - yc) < 0.07) return code(LINE); }
      return code(WHITE);
    }));
    anchors.body = body.t;
    // legs: little rounded feet; they dangle when floating
    for (const sd of [1, -1]) {
      const lg = chain(root, T(0.5, 6, sd * 3.8), R(M3.rz(-0.35 * fl)), R(M3.rx(-sd * 0.12)));
      const id = sd > 0 ? 2 : 3;
      prims.push(ellF(chain(lg, T(0.5, -3, 0)), [3.4, 4.2, 3.2], id, id, () => code(WHITE)));
    }
    // arms: short stubs with rounded ends (−1 down, 0 out, 1 up)
    for (const sd of [1, -1]) {
      const ang = lerp(0.35, 1.45, (arms + 1) / 2) + (arms > 0 ? arms * 1.1 : 0);
      const ar = chain(body, T(0.5, 4.5, sd * 6.4), R(M3.rx(-sd * ang)), T(0, -4.2, 0));
      const id = sd > 0 ? 4 : 5;
      prims.push(ellF(ar, [2.6, 4.6, 2.5], id, id, () => code(WHITE)));
      anchors[sd > 0 ? 'handN' : 'handF'] = P2W(ar, [0, -4.6, 0]);
    }

    /* --- back streamers: two long green-blue ribbons from the waist down --- */
    for (const sd of [1, -1]) {
      let f = chain(body, T(-5.5, 0, sd * 2.5), R(M3.rx(-sd * (0.34 + 0.12 * sway * sd))), R(M3.rz(-0.55 - 0.3 * fl)));
      const id = sd > 0 ? 6 : 7;
      const segs = [[6.5, 1.6, 1.0], [6.5, 2.1, 0.85], [6, 2.7, 0.8]];
      segs.forEach(([len, w, th], i) => {
        f = chain(f, R(M3.rx(-sd * (0.12 + 0.18 * sway * sd))), R(M3.rz(0.12 * sway + (i ? -0.1 : 0))));
        prims.push(ellF(chain(f, T(0, -len * 0.5, 0)), [th, len * 0.62, w], id, id, () => code(RIBBON, i === 2 ? 1 : 0)));
        f = chain(f, T(0, -len, 0));
      });
    }

    /* --- head: round white face in front of the yellow three-pointed star --- */
    const face = chain(root, T(...FACE_C));
    const faceMat = (s) => {
      // cyan marks under the eyes
      for (const sd of [1, -1]) {
        const du = Math.atan2(s[2], s[0]) - sd * 0.5, dv = s[1] + 0.3;
        if (Math.abs(du) < 0.11 && dv < 0.04 && dv > -0.22 + Math.abs(du) * 1.3) return code(CYAN);
      }
      // mouth: a small smile that opens
      const mu = Math.atan2(s[2], s[0]), mv = s[1] + 0.42;
      if (s[0] > 0.5 && Math.abs(mu) < 0.2) {
        if (mouth > 0.05) { if (mv < 0.06 && mv > -0.05 - 0.14 * mouth * (1 - (mu / 0.2) ** 2)) return code(MOUTH); }
        else if (Math.abs(mv - 0.9 * mu * mu) < 0.04 && Math.abs(mu) < 0.16) return code(MOUTH, 1);
      }
      return code(WHITE);
    };
    const facePrim = ellF(face, FACE_R, 8, 8, faceMat);
    prims.push(facePrim);
    const star = chain(root, T(...STAR_C));
    prims.push(ellF(star, [4.4, 10, 10.5], 9, 9, () => code(YELLOW)));
    const tips = [];
    PTS.forEach((a, k) => {
      const dir = [0, Math.sin(a), Math.cos(a)];
      // a point: a flattened ellipsoid sunk into the star's centre so its end tapers
      const rot = M3.rx(-(a - Math.PI / 2)); // local +y → dir
      const pf = chain(star, R(rot), T(0, PL * 0.2, 0));
      prims.push(ellF(pf, [4.2, PL * 0.84, PL * 0.29], 9, 9, (s) => code(YELLOW, s[1] > 0.6 ? 1 : 0)));
      const tip = V3.add(STAR_C, V3.scale(dir, PL * 1.02));
      tips.push(tip);
      // wish tag hanging from the tip (paper plate), swaying
      const tf = chain(root, T(tip[0] + 2.2, tip[1] - 0.3, tip[2]), R(M3.rx(0.35 * sway + (k === 1 ? 0.12 : k === 2 ? -0.12 : 0))), R(M3.rz(0.08)));
      prims.push({ kind: 'plate', part: 10 + k, grp: 10 + k, c: tf.t, L: M3.mul(tf.L, M3.cols([0, 0, 1], [0, 1, 0], [-1, 0, 0])), shape: TAG_G, thick: 1.1 });
      anchors[['tagTop', 'tagF', 'tagN'][k]] = P2W(tf, [0, -8, 0]);
    });

    /* --- eyes --- */
    const kind = ['open', 'happy', 'blink'].includes(P.eyes) ? P.eyes : P.eyes === 'angry' ? 'open' : 'closed';
    for (const sd of [1, -1]) {
      const s = sph(sd * 0.5, 0.02);
      const at = { prim: facePrim, p: P2W(face, [FACE_R[0] * s[0], FACE_R[1] * s[1], FACE_R[2] * s[2]]), s };
      stamps.push({ at, set: SET, colors: EYEC, kind, near: 0.72, far: 0.45, flipX: sd < 0 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.top = P2W(root, tips[0]);
    anchors.head = face.t;
    anchors.mouth = P2W(face, [FACE_R[0] * 0.9, -FACE_R[1] * 0.42, 0]);
    // uniform scale to the Pokédex height (0.3 m ≈ 52 units star tip to toes)
    for (const q of prims) { q.c = V3.scale(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = V3.scale(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = V3.scale(anchors[k], SIZE);
    return {
      prims, stamps, dots: [], anchors, pose: P,
      pri: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 0, 7: 0, 8: 3, 9: 1, 10: 2, 11: 2, 12: 2 },
      glossy: GLOSSY, baseMat: WHITE, shadowSteps: 14,
    };
  }

  function render(model, opt) {
    const g = clamp((model.pose && model.pose.glow) || 0, 0, 1);
    let pal = opt.pal || PAL;
    if (g > 0) {
      // emissive: shadow tones lift toward the lit ones, highlights toward white
      const lift = (e) => ({ r: e.r.map((c, i) => PX.mix(c, i < 4 ? e.r[i + 1] : c, g * 0.7)), od: e.od, ol: PX.mix(e.ol, e.r[2], g * 0.5), ln: PX.mix(e.ln, e.r[1], g * 0.5) });
      pal = Object.assign({}, pal, { [YELLOW]: lift(pal[YELLOW]), [TAG]: lift(pal[TAG]) });
    }
    return Creature.render(model, Object.assign({}, opt, { pal }));
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.3, bw: 90, bh: 110, oy: 0.86 } };
})();
