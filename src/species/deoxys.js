/* ------------------------------------------------------------------
   Deoxys — the DNA Pokémon, Normal Forme (1.7 m; rendered small in the
   Time Gallery). Orange armour with teal face stripe and leg insets,
   a purple chest crystal, a grey waist, long pointed legs and two
   twisted orange-and-teal tentacle arms that ripple (pose.wave).
------------------------------------------------------------------- */
const Deoxys = (() => {
  const { ell, chain, T, R, F, code } = Creature;
  const ORANGE = 1, TEAL = 2, GREY = 3, GEM = 4, EYE = 5, WHITE = 6;
  const PAL = Creature.palette({
    [ORANGE]: { r: ['#9a3a1a', '#c4552a', '#e27440', '#f59a66', '#ffc8a0'], od: '#5a1e0c', ol: '#9a3a1a', ln: '#7a2c12' },
    [TEAL]: { r: ['#1a6a7a', '#2a8e9e', '#48b2c0', '#80d4de', '#c8f4f8'], od: '#0c3a44', ol: '#1a6a7a', ln: '#145a68' },
    [GREY]: { r: ['#4a4a56', '#66667a', '#86869a', '#a8a8ba', '#d0d0de'], od: '#26262e', ol: '#4a4a56', ln: '#3a3a44' },
    [GEM]: { r: ['#3a1a5a', '#5a2e82', '#8050b0', '#b08ad8', '#f0e0ff'], od: '#1e0c30', ol: '#3a1a5a', ln: '#2e1446' },
    [EYE]: { r: ['#101014', '#16161c', '#1e1e26', '#2a2a34', '#3a3a48'], od: '#08080a', ol: '#101014', ln: '#101014' },
    [WHITE]: { r: ['#d8d8e0', '#ececf2', '#ffffff', '#ffffff', '#ffffff'], od: '#8a8a96', ol: '#c0c0cc', ln: '#a0a0ac' },
  });
  const DEFAULT = { wave: 0, lean: 0, spread: 0.5, eyes: 'open', side: 1 };
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const root = chain(F(M3.I(), [0, 0, 0]), T(0, 90, 0), R(M3.rz(-P.lean)), T(0, -90, 0));
    const orange = (s) => code(ORANGE, s[1] > 0.45 ? 1 : s[1] < -0.5 ? -1 : 0);
    // head: orange dome with a teal face stripe down the front, two small eyes beside it
    const head = chain(root, T(2, 150, 0));
    prims.push(ell(head, [13, 15, 12], {
      part: 1, grp: 1,
      mat: (s) => {
        if (s[0] > 0.2 && Math.abs(s[2]) < 0.2 && s[1] < 0.75) return code(TEAL, s[2] > 0 ? 1 : 0);
        if (s[0] > 0.45 && Math.abs(s[2]) > 0.26 && Math.abs(s[2]) < 0.5 && s[1] > -0.35 && s[1] < 0.05) return s[1] > -0.12 && Math.abs(s[2]) < 0.4 ? code(WHITE) : code(EYE);
        return orange(s);
      },
    }));
    // head fins sticking out sideways, each with a teal slit
    for (const sd of [1, -1]) prims.push(ell(chain(head, T(-1, 4, 16 * sd)), [5, 4.5, 10], { part: 2, grp: 2, mat: (s) => (Math.abs(s[1]) < 0.25 && Math.abs(s[2]) < 0.6 && s[0] > 0 ? code(TEAL) : orange(s)) }));
    prims.push(ell(chain(root, T(1, 134, 0)), [5, 6, 5], { part: 3, grp: 3, mat: orange }));
    // torso with the chest crystal
    prims.push(ell(chain(root, T(0, 116, 0)), [12, 17, 11], {
      part: 4, grp: 4,
      mat: (s) => {
        const d = Math.hypot(s[1] - 0.2, s[2]);
        if (s[0] > 0.4 && d < 0.44) return d < 0.3 ? code(GEM, s[1] > 0.28 && s[2] < 0 ? 2 : 0) : code(ORANGE, -1);
        return orange(s);
      },
    }));
    prims.push(ell(chain(root, T(0, 97, 0)), [5.5, 7, 5.5], { part: 5, grp: 5, mat: (s) => code(GREY, Math.abs(s[2]) > 0.5 ? -1 : 0) }));
    prims.push(ell(chain(root, T(0, 88, 0)), [12, 6.5, 13], { part: 6, grp: 6, mat: orange }));
    // long pointed legs with teal insets
    for (const sd of [1, -1]) {
      const leg = chain(root, T(0, 86, 7 * sd), R(M3.rx(-sd * 0.36)), T(0, -38, 0));
      prims.push(ell(leg, [6, 40, 5.5], { part: 7, grp: 7, mat: (s) => (s[2] * sd > 0.55 && Math.abs(s[1]) < 0.45 ? code(TEAL, 1) : orange(s)) }));
    }
    // tentacle arms: two strands (orange, teal) twisting around a rippling centre line
    const wv = P.wave;
    let id = 10;
    for (const sd of [1, -1]) {
      const shoulder = [0, 126, 11 * sd];
      for (let k = 0; k < 18; k++) {
        const u = k / 17;
        const cx = shoulder[0] + Math.sin(u * 3 + wv + sd) * 10 * u;
        const cy = shoulder[1] - u * (40 + 30 * (1 - P.spread)) + Math.sin(u * 5 + wv * 1.3) * 8 * u;
        const cz = shoulder[2] + sd * u * (24 + 30 * P.spread);
        for (const st of [0, 1]) {
          const a = u * 9 + st * Math.PI + wv * 0.5;
          const r = 3.6 - u * 0.9;
          prims.push(ell(chain(root, T(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6 * 0.6, cz + Math.sin(a) * 2.2)), [r, r, r], { part: id, grp: 10 + st, mat: st ? (s) => code(TEAL, s[1] > 0.4 ? 1 : 0) : orange }));
        }
      }
      id++;
    }
    return { prims, stamps: [], dots: [], anchors: { top: [2, 166, 0], head: [2, 150, 0], gem: [11, 120, 0], mouth: [14, 146, 0] }, pose: P, pri: { 1: 1, 2: 1, 4: 1, 10: 2, 11: 2 }, glossy: { [GEM]: 1, [ORANGE]: 1 }, baseMat: ORANGE };
  }
  const render = (model, opt) => Creature.render(model, opt);
  return { build, render, PAL, MAT: { ORANGE, TEAL, GREY, GEM }, DEFAULT, meta: { heightM: 1.7, bw: 200, bh: 200, oy: 0.9 } };
})();
