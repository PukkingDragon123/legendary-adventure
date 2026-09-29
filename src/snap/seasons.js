/* ------------------------------------------------------------------
   Seasons — spring, summer, autumn and winter. Every palette shifts
   (Pal.seasonC): fresh greens and blossom petals in spring, deep greens
   and pollen by day / fireflies by night in summer, red and gold leaves
   that drift down and settle in autumn, and snow on the grass, the
   treetops and the rooftops with falling flakes in winter. A new
   season arrives with each new dawn; tap the season chip to change it.
------------------------------------------------------------------- */
const Seasons = (() => {
  const { clamp, rnd, pick, mix, hex } = U;
  const LIST = Pal.SEASONS;
  const NAME = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
  const MSG = {
    spring: 'Spring! Blossoms drift on the breeze and baby Pokémon come out to play.',
    summer: 'Summer! Long sunny days, deep green leaves and fireflies at night.',
    autumn: 'Autumn! The leaves turn red and gold and the berry bushes are heavy with fruit.',
    winter: 'Winter! Snow covers the grass and some Pokémon curl up for the cold.',
  };
  const S = { parts: [], lastHour: null, cur: 'summer' };
  const outdoor = () => Game.area && !Game.area.def.noSeason;
  const cur = () => Pal.season;
  const is = (...k) => k.includes(Pal.season) && outdoor();

  function set(s, o = {}) {
    if (!Pal.setSeason(s)) return false;
    S.cur = s; S.parts.length = 0;
    Save.data.season = s; Save.save();
    if (Game.area) Stage.setHour(Stage.S.hour, !!o.instant); // cross-fades every palette to the new season
    if (!o.quiet) { HUD.toast(MSG[s], { life: 3.2 }); Game.sfx('timewave', null, 0.5); }
    U.emit('season', s);
    return true;
  }
  const next = (o) => set(LIST[(LIST.indexOf(Pal.season) + 1) % LIST.length], o);
  function init() {
    const qs = new URLSearchParams(location.search);
    const s = qs.get('season') || Save.data.season || 'summer';
    if (LIST.includes(s)) set(s, { quiet: true, instant: true });
  }
  // a new dawn brings the next season
  U.on('hour', (h) => { if (S.lastHour === 'night' && h === 'dawn' && Game.started) next(); S.lastHour = h; });

  /* ---------- falling things ---------- */
  const PET = ['#ffc0d8', '#ffd8e8', '#ff9ec4', '#fff0f6'].map(hex), LEAF = ['#e2741c', '#c83e1e', '#eaae28', '#b8561a', '#dc8c22', '#8a3a18'].map(hex), POL = hex('#fff4b0'), FF = hex('#d8ff6a');
  function want() {
    if (!outdoor()) return 0;
    const lo = Game.lowFx ? 0.5 : 1, h = Game.hour();
    switch (Pal.season) {
      case 'spring': return 34 * lo;
      case 'autumn': return 30 * lo;
      case 'winter': return 120 * lo;
      default: return (h === 'night' || h === 'dusk' ? 16 : 22) * lo;
    }
  }
  function spawn(fill) {
    const VW = Game.VW, VH = Game.VH, cx = Game.cam.x, cy = Game.cam.y, s = Pal.season, h = Game.hour();
    const p = { x: cx + rnd(-30, VW + 30), y: fill ? cy + rnd(-10, VH) : cy - rnd(4, 30), t: 0, ph: Math.random() * 6, rest: 0 };
    if (s === 'spring') Object.assign(p, { k: 'petal', c: pick(PET), vy: rnd(10, 18), vx: rnd(-4, 8), sw: rnd(10, 18) });
    else if (s === 'autumn') Object.assign(p, { k: 'leaf', c: pick(LEAF), vy: rnd(12, 22), vx: rnd(-4, 10), sw: rnd(14, 24) });
    else if (s === 'winter') Object.assign(p, { k: 'snow', c: 0xffffffff, vy: rnd(12, 30), vx: rnd(-3, 3), sw: rnd(4, 10), big: Math.random() < 0.22 });
    else if (h === 'night' || h === 'dusk') {
      const x = cx + rnd(0, VW), g = World.groundAt(x);
      Object.assign(p, { k: 'fly', c: FF, x, y: g - rnd(10, 70), vy: rnd(-3, 3), vx: rnd(-6, 6), sw: 10, life: rnd(5, 9) });
    } else Object.assign(p, { k: 'pollen', c: POL, y: fill ? p.y : cy + rnd(0, VH), vy: -rnd(1, 5), vx: rnd(-3, 5), sw: 6, life: rnd(5, 9) });
    S.parts.push(p);
    return p;
  }
  function update(dt, t) {
    if (!Game.area) return;
    const n = Math.round(want()), P = S.parts, VW = Game.VW, VH = Game.VH, cx = Game.cam.x, cy = Game.cam.y;
    if (P.length < n) { const fill = P.length === 0; for (let i = 0; i < (fill ? n : Math.min(3, n - P.length)); i++) spawn(fill); }
    const wind = (typeof Wind !== 'undefined' ? Wind.v : 0.4) * 30;
    let resting = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.rest > 0) { p.rest -= dt; resting++; if (p.rest <= 0 || resting > 40) P.splice(i, 1); continue; }
      const sway = Math.sin(t * (p.k === 'leaf' ? 1.7 : 1.2) + p.ph) * p.sw;
      p.x += (p.vx + sway + (p.k === 'fly' || p.k === 'pollen' ? 0 : wind)) * dt;
      p.y += (p.vy + (p.k === 'leaf' ? Math.cos(t * 2.3 + p.ph) * 8 : 0)) * dt;
      const sx = p.x - cx, sy = p.y - cy;
      if (p.life && p.t > p.life) { P.splice(i, 1); continue; }
      if (sx < -60 || sx > VW + 60 || sy > VH + 30 || sy < -80) { P.splice(i, 1); continue; }
      if (p.k === 'fly' || p.k === 'pollen') continue;
      // meets the water or the ground: sink away, or settle for a moment
      const s = WorldRender.surfaceAt(p.x, t), g = World.groundAt(p.x);
      if (p.y >= s && s < g) { if (p.k !== 'snow' && Math.random() < 0.3) FX.add({ type: 'ripple', x: p.x, y: s + 1, r0: 0.5, r1: 3, flat: 0.35, life: 0.5, c: 0xffe8fbff, layer: 2 }); P.splice(i, 1); continue; }
      if (p.y >= g - 1) { p.y = g - 1 - (p.k === 'snow' ? 0 : rnd(0, 3)); p.rest = p.k === 'snow' ? rnd(0.6, 1.4) : rnd(3, 6); }
    }
  }
  function draw(fb, cx, cy, t) {
    const d = fb.d, W = fb.w, H = fb.h;
    for (const p of S.parts) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue;
      const i = y * W + x;
      const fade = p.rest > 0 ? clamp(p.rest / 1.2, 0, 1) : p.life ? Math.min(1, p.t / 0.8, (p.life - p.t) / 0.8) : 1;
      if (p.k === 'snow') {
        d[i] = mix(d[i], 0xffffffff, 0.9 * fade);
        if (p.big) { d[i + 1] = mix(d[i + 1], 0xfff4f8ff, 0.7 * fade); d[i + W] = mix(d[i + W], 0xfff4f8ff, 0.7 * fade); d[i + W + 1] = mix(d[i + W + 1], 0xffdce8ff, 0.5 * fade); }
      } else if (p.k === 'petal') {
        const f = Math.sin(t * 6 + p.ph);
        d[i] = mix(d[i], p.c, fade); if (f > 0.2) d[i + 1] = mix(d[i + 1], p.c, 0.8 * fade); else if (f < -0.2) d[i + W] = mix(d[i + W], mix(p.c, 0xffffffff, 0.3), 0.8 * fade);
      } else if (p.k === 'leaf') {
        // a tumbling little leaf: its shape flips between flat and edge-on
        const f = p.rest > 0 ? 1 : Math.sin(t * 5 + p.ph), dk = mix(p.c, 0xff101820, 0.35);
        d[i] = mix(d[i], p.c, fade);
        if (f > 0.3) { d[i + 1] = mix(d[i + 1], p.c, fade); d[i + W] = mix(d[i + W], dk, fade); d[i + W + 1] = mix(d[i + W + 1], p.c, fade); }
        else if (f > -0.3) d[i + W] = mix(d[i + W], dk, fade);
        else { d[i - 1] = mix(d[i - 1], dk, fade); d[i + 1] = mix(d[i + 1], p.c, fade); }
      } else if (p.k === 'fly') {
        const on = (0.5 + 0.5 * Math.sin(t * 3 + p.ph)) * fade;
        if (on < 0.15) continue;
        d[i] = U.screen(d[i], p.c, on); const g = on * 0.45;
        d[i - 1] = U.screen(d[i - 1], p.c, g); d[i + 1] = U.screen(d[i + 1], p.c, g); d[i - W] = U.screen(d[i - W], p.c, g); d[i + W] = U.screen(d[i + W], p.c, g);
      } else if (p.k === 'pollen') {
        const a = (0.4 + 0.3 * Math.sin(t * 4 + p.ph)) * fade;
        d[i] = U.screen(d[i], p.c, a);
      }
    }
  }

  /* ---------- the season chip's icons ---------- */
  function icon(fb, cx, cy, s, t) {
    const P = (x, y, c) => UI.put(fb, cx + x, cy + y, c), INK = 0xff1b2240;
    if (s === 'spring') {
      const pk = hex('#ff9ec4'), pl = hex('#ffd8e8'), y = hex('#ffd23a');
      for (const [ox, oy] of [[0, -4], [4, -1], [2, 4], [-2, 4], [-4, -1]]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const r = dx * dx + dy * dy; if (r <= 5) P(ox + dx, oy + dy, r > 3 ? INK : dy < 0 ? pl : pk); }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) P(dx, dy, y);
      P(0, 0, hex('#ff8a1a'));
    } else if (s === 'winter') {
      const w = 0xffffffff, b = hex('#9ad8ff');
      for (let k = -6; k <= 6; k++) { P(k, 0, Math.abs(k) > 4 ? b : w); P(0, k, Math.abs(k) > 4 ? b : w); if (Math.abs(k) <= 4) { P(k, k, w); P(k, -k, w); } }
      for (const [x, y] of [[-5, -2], [-5, 2], [5, -2], [5, 2], [-2, -5], [2, -5], [-2, 5], [2, 5]]) P(x, y, b);
      if (Math.sin(t * 3) > 0.6) P(4, -5, w);
    } else {
      // a leaf: green in summer, a red-gold maple leaf in autumn
      const a = s === 'autumn', c1 = hex(a ? '#e2741c' : '#4ab860'), c2 = hex(a ? '#ffb040' : '#8ae07a'), c3 = hex(a ? '#a8401c' : '#2a7a3a');
      const shape = a
        ? ['....#....', '...###...', '.#.###.#.', '#########', '.#######.', '..#####..', '.#######.', '....#....', '....#....']
        : ['.....##..', '...####..', '..#####..', '.######..', '.#####...', '.####....', '..##.....', '.#.......', '#........'];
      shape.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') P(x - 4, y - 4, y < 3 ? c2 : x + y > 9 ? c3 : c1); }));
      for (let k = 0; k < 5; k++) P(a ? 0 : -3 + k, a ? k - 1 : 3 - k, c3);
    }
  }
  return { set, next, init, update, draw, icon, is, get cur() { return Pal.season; }, NAME, LIST, S };
})();
