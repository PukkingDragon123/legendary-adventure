/* ------------------------------------------------------------------
   Minior — the Meteor Pokémon (0.3 m ≈ 52 units). A rocky pink-brown
   shell studded with dark triangle marks and pale spikes, two big
   black eyes, and a glossy coloured core that shows where the shell
   has cracked (pose.crack 0..1). Core colour comes from the palette
   (see Minior.core(i) for the seven colours).
------------------------------------------------------------------- */
const Minior = (() => {
  const { ell, chain, T, R, F, code } = Creature;
  const SHELL = 1, MARK = 2, SPIKE = 3, EYE = 4, CORE = 5, SHINE = 6;
  const CORES = [
    ['#a01a28', '#d0303a', '#f25050', '#ff8a86', '#ffd0cc'], ['#b0501a', '#e07a24', '#ffa040', '#ffc880', '#ffecc8'],
    ['#b09010', '#e0c020', '#fff050', '#fff8a0', '#fffde0'], ['#1a8030', '#2eb04a', '#5ad86a', '#9af0a0', '#e0ffe0'],
    ['#1a5ab0', '#2a80e0', '#50aaff', '#9ad0ff', '#e0f2ff'], ['#2a2a90', '#4040c0', '#6a6aea', '#a0a0ff', '#e0e0ff'],
    ['#6a1a90', '#9030c0', '#b858e8', '#d8a0ff', '#f4e0ff'],
  ];
  const base = {
    [SHELL]: { r: ['#6e4a4c', '#8e6668', '#b08a88', '#caa8a4', '#e2c8c2'], od: '#3a2426', ol: '#6e4a4c', ln: '#5a3a3c' },
    [MARK]: { r: ['#4a2a2e', '#5e3638', '#744446', '#8a5658', '#a06a6a'], od: '#2a1618', ol: '#4a2a2e', ln: '#3a2022' },
    [SPIKE]: { r: ['#8a8e98', '#b0b4bc', '#d4d8de', '#eef0f4', '#ffffff'], od: '#4a4e58', ol: '#7a7e88', ln: '#6a6e78' },
    [EYE]: { r: ['#141418', '#1c1c22', '#26262e', '#34343e', '#5a5a68'], od: '#08080c', ol: '#141418', ln: '#141418' },
    [SHINE]: { r: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#a0a0b0', ol: '#ffffff', ln: '#ffffff' },
  };
  const core = (i) => { const c = CORES[((i % 7) + 7) % 7]; return Creature.palette(Object.assign({}, base, { [CORE]: { r: c, od: c[0], ol: c[1], ln: c[0] } })); };
  const PAL = core(0);
  const R0 = 26;
  const V = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const EYES = [V(0.72, 0.08, 0.5), V(0.78, 0.02, -0.42)];
  const MARKS = [];
  for (let i = 0; i < 26; i++) { const a = i * 2.39996, y = 1 - (i + 0.5) / 13; MARKS.push(V(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y))); }
  const SPIKES = [V(0.2, 0.95, 0.2), V(-0.7, 0.5, 0.5), V(-0.5, 0.2, -0.85), V(0.5, -0.55, 0.7), V(-0.2, -0.9, -0.3), V(0.35, 0.6, -0.75), V(0.95, -0.2, 0.2)];
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const DEFAULT = { crack: 0, eyes: 'open', spin: 0, squash: 0, side: 1 };
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const sq = P.squash || 0;
    const root = F(M3.diag(1 + sq * 0.4, 1 - sq, 1 + sq * 0.4), [0, 0, 0]);
    const body = chain(root, T(0, R0, 0), R(M3.ry(P.spin || 0)));
    const crack = Math.max(0, Math.min(1, P.crack));
    const shut = P.eyes === 'closed' || P.eyes === 'blink';
    const prims = [ell(body, [R0, R0, R0], {
      part: 1, grp: 1,
      mat: (s) => {
        for (const e of EYES) {
          const d = s[0] * e[0] + s[1] * e[1] + s[2] * e[2];
          if (d > 0.93) {
            if (shut) return d > 0.955 && Math.abs(s[1] - e[1]) < 0.05 ? code(EYE) : code(SHELL);
            if (d > 0.985 && s[1] > e[1] + 0.03) return code(SHINE);
            return code(EYE);
          }
        }
        // cracked shell: the core shows through in chunky facets
        if (crack > 0) { const n = hash(Math.round(s[0] * 3), Math.round(s[1] * 3), Math.round(s[2] * 3)); if (n < crack) return code(CORE, s[1] > 0.3 ? 1 : 0); }
        for (const m of MARKS) { const d = s[0] * m[0] + s[1] * m[1] + s[2] * m[2]; if (d > 0.972) return code(MARK); }
        return code(SHELL, s[1] > 0.4 ? 1 : s[1] < -0.5 ? -1 : 0);
      },
    })];
    let id = 2;
    for (const d of SPIKES) {
      // a pale spike: a slim ellipsoid half-buried along the surface normal
      const ax = d, up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const b1 = V3.norm(V3.cross(up, ax)), b2 = V3.cross(ax, b1);
      const f = { L: M3.mul(body.L, M3.cols(b1, b2, ax)), t: V3.add(body.t, M3.v(body.L, V3.scale(ax, R0 * 0.98))) };
      prims.push(ell(f, [3.2, 3.2, 6.5], { part: id, grp: 2, mat: (s) => (s[2] < -0.2 ? 0 : code(SPIKE, s[2] > 0.6 ? 1 : 0)) }));
      id++;
    }
    return { prims, stamps: [], dots: [], anchors: { top: [0, R0 * 2, 0], head: [0, R0, 0], mouth: [R0, R0 * 0.8, 0] }, pose: P, pri: { 1: 0, 2: 1 }, glossy: { [CORE]: 1, [SPIKE]: 1 }, baseMat: SHELL };
  }
  const render = (model, opt) => Creature.render(model, opt);
  return { build, render, PAL, core, MAT: { SHELL, MARK, SPIKE, EYE, CORE }, DEFAULT, meta: { heightM: 0.3, bw: 80, bh: 80, oy: 0.82 } };
})();
