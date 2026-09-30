/* ------------------------------------------------------------------
   Feebas — the Fish Pokémon (0.6 m ≈ 105 units long at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature renderer (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is the
   bottom of the belly (it can lie on the shore or sit at a water line).

   Build: a shabby brown fish — oval body with irregular dark-brown
   blotches over the back and a dull tan belly; thick pale lips on a
   hinged jaw; big droopy eyes (heavy brown lids, small low pupils);
   tattered blue-grey fins with ragged notches and tears: dorsal, a pair
   of pectorals, pelvic, anal and a forked tail fin.

   Pose params:
     tail   -1..1   tail flop: the tail stock and fin swing to the near (+) / far (−) side
     mouth  0..1    mouth (lips) open amount
     eyes   'open' | 'closed' | 'blink' | 'happy'
     fins   0..1    fin flutter: pectorals fan out, dorsal fin lifts
     bend   -1..1   whole-body arch (flopping on land: + = curl up), default 0
     roll   -1..1   lie on its side: roll about the long axis (+ = near side up), default 0
   Anchors: top (dorsal fin tip), head, mouth, eyeN, eyeF, body, tail (tail fin
   centre), finN, finF, belly.
------------------------------------------------------------------- */
const Feebas = (() => {
  const { chain, T, R, F, code } = Creature;

  // ---- materials
  const BODY = 1, BELLY = 2, SPOT = 3, FIN = 4, LIP = 5, MOUTH = 6;
  const MAT = { BODY, BELLY, SPOT, FIN, LIP, MOUTH };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#664628', '#86603c', '#a57d55', '#c19b70', '#dbbb92'], od: '#3a2414', ol: '#6c4a2c', ln: '#684628' },
    [BELLY]: { r: ['#ad916a', '#c8ad88', '#dfc7a2', '#eedaba', '#f8ead4'], od: '#5c4226', ol: '#886a46', ln: '#937556' },
    [SPOT]:  { r: ['#402a18', '#523622', '#64442c', '#765236', '#8a6344'], od: '#28180c', ol: '#46301c', ln: '#3a2616' },
    [FIN]:   { r: ['#465270', '#5e6c8a', '#7a88a4', '#9aa6be', '#bec8d8'], od: '#232b44', ol: '#434f6c', ln: '#48546f' },
    [LIP]:   { r: ['#bb9286', '#d6ada0', '#eac8bc', '#f5ded4', '#fff0ea'], od: '#664036', ol: '#98695e', ln: '#9c7064' },
    [MOUTH]: { r: ['#361618', '#4a1e22', '#60282c', '#763438', '#8a4446'], od: '#220a0e', ol: '#3a1216', ln: '#3a1216' },
  });
  const GLOSSY = { [LIP]: 1 };

  const DEFAULT = { tail: 0, mouth: 0, eyes: 'open', fins: 0, bend: 0, roll: 0, side: 1 };

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale, nrm = V3.norm, cross = V3.cross;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick, lines) => ({ kind: 'plate', part, grp, c, L, shape, thick, lines });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const C_BODY = code(BODY), C_BELLY = code(BELLY), C_SPOT = code(SPOT), C_LIP = code(LIP), C_MOUTH = code(MOUTH);
  const M_LIP = () => C_LIP, M_MOUTH = () => C_MOUTH;

  /* ---------- tattered fins: straight-edged polygons (notches) with small tears ---------- */
  function finShape(pts, holes, bias = 0) {
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({
      bb,
      test(u, v) {
        if (u < bb[0] || u > bb[2] || v < bb[1] || v > bb[3] || !Shape2D.inPoly(u, v, pts)) return 0;
        for (const [hu, hv, ha, hb] of holes) if (((u - hu) / ha) ** 2 + ((v - hv) / hb) ** 2 < 1) return 0;
        return code(FIN, bias);
      },
    });
  }
  const rays = (list) => list.map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true }));
  // tail fin (u = backward from the tail stock, v = up): forked, ragged lobes, one tear
  const TAIL_PTS = [[-2, 6.5], [6, 9], [13, 14], [19, 19.5], [25, 24], [23.5, 18.5], [27.5, 15.5], [22.5, 11.5], [21, 6], [16, 1.5], [21.5, -3.5], [24.5, -8.5], [28, -11.5], [23.5, -14], [26.5, -20.5], [18, -17], [11, -12.5], [5, -8.5], [-2, -6.5]];
  const TAIL_G = finShape(TAIL_PTS, [[17.5, 12.5, 1.7, 1.3], [19, -10.5, 1.4, 1.1]]);
  const TAIL_RAYS = rays([[[1, 2], [12, 7], [22, 16]], [[1, -2], [12, -7], [21, -14]], [[2, 0], [11, 1.5]]]);
  // dorsal fin (u = forward, v = up)
  const DORSAL_PTS = [[12, 0], [10, 5], [6.5, 10], [3.5, 8], [0.5, 13], [-3, 10.5], [-6, 14], [-9, 9.5], [-12, 11], [-14.5, 5], [-17, 0]];
  const DORSAL_G = finShape(DORSAL_PTS, [[-4.5, 6, 1.2, 1]]);
  const DORSAL_RAYS = rays([[[6, 1], [5, 8]], [[0, 1], [0, 10]], [[-6, 1], [-6.5, 10]], [[-12, 1], [-12.5, 7]]]);
  // pectoral fin (u = along the fin from its root, v = across)
  const PEC_PTS = [[-1, -3], [5, -3.6], [10, -5.5], [12.5, -3], [15.5, -4.2], [14.5, -0.5], [17, 2.4], [12, 3], [7.5, 4.8], [4, 3.6], [-1, 3]];
  const PEC_G = finShape(PEC_PTS, [], 0);
  const PEC_RAYS = rays([[[1, 0], [13, -2.5]], [[1, 1], [13, 2.2]]]);
  // pelvic / anal fins (u = backward, v = down)
  const LOW_PTS = [[-2, 0], [4, 0.5], [9, 3], [12, 7.5], [9.5, 7], [8.5, 10], [4.5, 7], [0, 4]];
  const LOW_G = finShape(LOW_PTS, [], 0);

  /* ---------- blotches (body unit sphere): irregular dark patches over the back ---------- */
  const BLOTCH = [];
  const addB = (az, v, r) => {
    for (const sd of [1, -1]) {
      const d = Creature.sph(sd * az, v);
      BLOTCH.push({ d, c: Math.cos(r) });
    }
  };
  // each patch = two or three overlapping round caps
  [[1.05, 0.62, 0.2], [1.2, 0.5, 0.14], [1.75, 0.55, 0.2], [1.9, 0.4, 0.13], [2.35, 0.2, 0.18], [1.45, 0.05, 0.13], [0, 0.97, 0.16], [3.14, 0.7, 0.15]].forEach(([a, v, r]) => addB(a, v, r));
  function bodyMat(s) {
    // dull tan belly, lip-coloured at the very front (the snout tip is covered by the lips)
    if (s[1] < -0.3 + 0.12 * s[0] * s[0]) return C_BELLY;
    for (const b of BLOTCH) if (s[0] * b.d[0] + s[1] * b.d[1] + s[2] * b.d[2] > b.c) return C_SPOT;
    return C_BODY;
  }
  // tail stock: blotches continue, belly underneath
  const stockMat = (s) => (s[1] < -0.35 ? C_BELLY : s[1] > 0.55 && s[2] * s[2] < 0.2 ? C_SPOT : C_BODY);

  /* ---------- eye stamps: big droopy eyes (k outline, l heavy brown lid, w pale eye, p pupil) ---------- */
  const EYES_M = {
    open: ['.kkkkk.', 'klllllk', 'kllllll', 'kwwwwwk', 'kwwwppk', '.kwwppk', '..kkkk.'],
    openN: ['.kkkk.', 'kllllk', 'klllll', 'kwwwwk', 'kwwppk', '.kwppk', '..kkk.'],
    openF: ['.kkk.', 'kllll', 'kwwwk', 'kwwpk', '.kkk.'],
    blink: ['.kkkkk.', 'klllllk', 'kllllll', 'kllllll', 'kwwwppk', '.kkkkk.'],
    blinkN: ['.kkkk.', 'kllllk', 'klllll', 'kwwppk', '.kkkk.'],
    blinkF: ['.kkk.', 'kllll', 'kwwpk', '.kkk.'],
    happy: ['.kkkkk.', 'k.....k'], happyN: ['.kkkk.', 'k....k'], happyF: ['.kkk.', 'k...k'],
    sleep: ['.......', 'kkkkkkk', '.kkkkk.'], sleepN: ['......', 'kkkkkk', '.kkkk.'], sleepF: ['.....', 'kkkkk', '.kkk.'],
  };
  const EYES_S = {
    open: ['.kkk.', 'kllll', 'kwwpk', '.kkk.'],
    openN: ['.kk.', 'klll', 'kwpk', '.kk.'],
    openF: ['.k.', 'kll', 'kpk', '.k.'],
    blink: ['.kkk.', 'kllll', 'kllpk', '.kkk.'], blinkN: ['.kk.', 'klll', '.kpk'], blinkF: ['.k.', 'kll', '.k.'],
    happy: ['.kkk.', 'k...k'], happyN: ['.kk.', 'k..k'], happyF: ['.k.', 'k.k'],
    sleep: ['kkkkk', '.kkk.'], sleepN: ['kkkk', '.kk.'], sleepF: ['kkk', '.k.'],
  };
  const EYES_L = {
    open: ['..kkkkk..', '.klllllk.', 'klllllllk', 'kllllllll', 'kwwwwwwwk', 'kwwwwwppk', 'kwwwwpppk', '.kwwwpppk', '..kkkkkk.'],
    openN: ['.kkkkk.', 'klllllk', 'kllllll', 'kwwwwwk', 'kwwwwpk', 'kwwwppk', '.kwwppk', '..kkkk.'],
    openF: ['.kkkk.', 'klllll', 'kllllk', 'kwwwpk', 'kwwppk', '.kkkk.'],
    blink: ['..kkkkk..', '.klllllk.', 'klllllllk', 'kllllllll', 'kllllllll', 'kwwwwwppk', '.kkkkkkk.'],
    blinkN: ['.kkkkk.', 'klllllk', 'kllllll', 'kllllll', 'kwwwwpk', '.kkkkk.'],
    blinkF: ['.kkkk.', 'klllll', 'klllll', 'kwwwpk', '.kkkk.'],
    happy: ['..kkkkk..', '.k.....k.', 'k.......k'], happyN: ['.kkkkk.', 'k.....k'], happyF: ['.kkkk.', 'k....k'],
    sleep: ['.........', 'kkkkkkkkk', '.kkkkkkk.'], sleepN: ['.......', 'kkkkkkk', '.kkkkk.'], sleepF: ['......', 'kkkkkk', '.kkkk.'],
  };
  const EYEC = { k: '#241810', l: '#8a643e', w: '#f2ead0', p: '#101014' };

  const SIZE = 0.92; // uniform scale: 0.6 m ≈ 105 units nose to tail fin

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stamps = [];
    const tl = clamp(+P.tail || 0, -1, 1), mo = clamp(+P.mouth || 0, 0, 1), fn = clamp(+P.fins || 0, 0, 1);
    const bend = clamp(+P.bend || 0, -1, 1), roll = clamp(+P.roll || 0, -1, 1);
    // body frame: roll about the long axis (lying on its side), centred on the body
    // (lying on its side it rests lower: body half-height along y after the roll, plus fin clearance)
    const ra = roll * 1.35, cr = Math.cos(ra), sr = Math.sin(ra);
    const BC = [0, Math.hypot(25.5 * cr, 14.5 * sr) + 8.5 * cr * cr, 0];
    const body = chain(T(...BC), R(M3.rx(-ra)), R(M3.rz(bend * 0.12)));

    /* --- body: main oval + head bulge --- */
    const main = ellF(body, [33, 25.5, 14.5], 1, 1, bodyMat);
    prims.push(main);
    prims.push(ellF(chain(body, T(-4, -4, 0)), [27, 21, 13.4], 1, 1, (s) => (s[1] < -0.2 ? C_BELLY : C_BODY)));

    /* --- tail stock + tail fin (flop) --- */
    const pivot = chain(body, T(-22, 0, 0), R(M3.rz(-bend * 0.3)), R(M3.ry(-tl * 0.42)));
    prims.push(ellF(chain(pivot, T(-8, 0, 0)), [18, 11.5, 8.6], 2, 1, stockMat));
    const tailF = chain(pivot, T(-22, 0.5, 0), R(M3.rz(-bend * 0.25)), R(M3.ry(-tl * 0.35)));
    // plate axes: u = backward (−x), v = up, normal = z
    prims.push(PL(tailF.t, M3.mul(tailF.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), 3, 2, TAIL_G, 1.8, TAIL_RAYS));
    anchors.tail = inF(tailF, [-15, 0, 0]);

    /* --- dorsal fin (lifts with `fins`) --- */
    const df = chain(body, T(-1, 22, 0), R(M3.rz(0.08 - fn * 0.12)), R(M3.diag(1, 0.9 + fn * 0.3, 1)));
    prims.push(PL(df.t, df.L, 4, 3, DORSAL_G, 1.6, DORSAL_RAYS));
    anchors.top = inF(df, [-6, 14, 0]);

    /* --- pelvic + anal fins (hang below) --- */
    const pv = chain(body, T(6, -23.5, 0), R(M3.rz(0.15)));
    prims.push(PL(pv.t, M3.mul(pv.L, M3.cols([-1, 0, 0], [0, -1, 0], [0, 0, 1])), 5, 4, LOW_G, 1.6, null));
    const an = chain(pivot, T(-2, -9.5, 0), R(M3.rz(0.3)));
    prims.push(PL(an.t, M3.mul(an.L, M3.cols([-1, 0, 0], [0, -1, 0], [0, 0, 1])), 5, 4, LOW_G, 1.6, null));

    /* --- pectoral fins (flutter) --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 6 : 7;
      const root = [13, -6, sd * 12];
      const out = 0.35 + fn * 0.75;
      // fin points back and down, swinging outward from the body with `fins`
      const d = nrm([-Math.cos(out) * 0.9, -0.42, sd * Math.sin(out)]);
      const up = [0, 1, 0];
      let Z = nrm(cross(d, up)); const Y = cross(Z, d);
      const pf = chain(body, T(...root), F(M3.cols(d, Y, Z), [0, 0, 0]), R(M3.rx(sd * (0.5 - fn * 0.3))));
      prims.push(PL(pf.t, pf.L, id, 5, PEC_G, 1.4, PEC_RAYS));
      anchors[sd > 0 ? 'finN' : 'finF'] = inF(pf, [14, 0, 0]);
    }

    /* --- lips: thick pale upper and lower lip at the snout tip; the lower lip hinges open --- */
    const snout = chain(body, T(32, 0, 0));
    prims.push(ellF(chain(snout, T(0.8, 1.5, 0), R(M3.rz(-0.22))), [5.8, 3.3, 7.2], 8, 6, M_LIP));
    const jaw = chain(snout, T(-5, -1, 0), R(M3.rz(-mo * 0.55)), T(5, 0, 0));
    prims.push(ellF(chain(jaw, T(-0.2, -2, 0), R(M3.rz(0.18))), [5.4, 3, 6.8], 9, 7, M_LIP));
    if (mo > 0.04) prims.push(ellF(chain(snout, T(-1.2, -0.8 - mo * 1.2, 0)), [4.2, 2.2 + mo * 2.2, 5.8], 10, 8, M_MOUTH));
    anchors.mouth = inF(snout, [5, 0, 0]);

    /* --- eyes: droopy stamps on the head --- */
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'blink' ? 'blink' : P.eyes === 'closed' ? 'sleep' : 'open';
    for (const sd of [1, -1]) {
      const s = Creature.sph(sd * 0.62, 0.22);
      const at = { prim: main, p: add(main.c, M3.v(main.L, s)), s };
      stamps.push({ at, set: EYES_M, colors: EYEC, kind, near: 0.72, far: 0.42, flipX: sd < 0 });
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = at.p;
    }
    anchors.head = inF(body, [22, 3, 0]);
    anchors.body = body.t;
    anchors.belly = inF(body, [0, -21, 0]);

    for (const q of prims) { q.c = sc(q.c, SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const st of stamps) st.at.p = sc(st.at.p, SIZE);
    for (const k in anchors) anchors[k] = sc(anchors[k], SIZE);

    return {
      prims, anchors, pose: P, stamps, dots: [],
      pri: { 1: 0, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 1, 9: 3 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 16, shadowDepth: 14,
    };
  }

  function render(model, opt) {
    const sc0 = opt.scale || 1;
    const set = sc0 >= 0.75 ? EYES_L : sc0 >= 0.45 ? EYES_M : EYES_S;
    for (const st of model.stamps) st.set = set;
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.6, bw: 170, bh: 100, oy: 0.86 } };
})();
