/* ------------------------------------------------------------------
   Regi puzzle — deep in Starfall Cave an ancient wall is covered in
   braille dots. Scan or tap it to read the riddle; it names the order
   in which to wake the three glyph stones (tap them, or belly flop on
   them). Get it right and the chamber rumbles open: the dots blaze in
   the Regi pattern and a treasure is yours. Wrong order: the stones
   go dark and the riddle changes.
------------------------------------------------------------------- */
const Regi = (() => {
  const { hex } = U;
  const WALL = 2720, STONES = [2780, 2825, 2870];
  const NAMES = ['FIRST', 'SECOND', 'THIRD'], GLYPH = ['SUN', 'MOON', 'STAR'];
  const R = { order: [0, 1, 2], lit: [], done: false, flash: 0, read: false };
  function shuffle() { const o = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [o[i], o[j]] = [o[j], o[i]]; } R.order = o; R.lit = []; }
  function riddle() { return 'The dots read: "Wake the ' + R.order.map((i) => GLYPH[i]).join(', then the ') + '."'; }
  function touch(i) {
    if (R.done) { HUD.toast('The stones hum quietly. The chamber is already open.', { life: 2 }); return; }
    if (!R.read) { HUD.toast('Three stones: SUN, MOON and STAR. Read the dotted wall first!', { life: 2.4 }); return; }
    if (R.lit.includes(i)) return;
    R.lit.push(i); Game.sfx('icering', STONES[i], 0.8); FX.sparkles(STONES[i], World.groundAt(STONES[i]) - 20, 8, 14, 0xffffffff, hex('#9ae8ff'));
    const k = R.lit.length - 1;
    if (R.lit[k] !== R.order[k]) { Game.sfx('error'); Game.shake(2); HUD.toast('The stones go dark... the dots on the wall shift into a new riddle.', { life: 2.6 }); shuffle(); R.read = false; return; }
    if (R.lit.length === 3) {
      R.done = true; R.flash = 1; Game.shake(6); Game.sfx('rumble', WALL, 1); setTimeout(() => Game.sfx('reward'), 900);
      Save.data.stats.regi = 1; Save.addPoints(1000); Save.addItem('stardust', 3);
      if (Save.discover('regi.puzzle')) HUD.toast('BOOM! The ancient chamber opens! The Regi dots blaze with light. (+1000, 3 Star Pieces)', { life: 4 });
      if (Game.cine) Game.cine.pan(WALL, World.groundAt(WALL) - 60, { hold: 2 });
    }
  }
  if (typeof Harvest !== 'undefined') { const pd = Harvest.pound; Harvest.pound = (x, ...a) => { const i = STONES.findIndex((sx) => Math.abs(sx - x) < 14); if (Game.areaId === 'falls' && i >= 0) touch(i); return pd ? pd(x, ...a) : undefined; }; }
  if (typeof Areas !== 'undefined' && Areas.falls) {
    const b0 = Areas.falls.build, p0 = Areas.falls.post;
    Areas.falls.build = (A) => {
      b0(A); R.done = !!(Save.data.stats && Save.data.stats.regi); shuffle();
      const g = (x) => World.groundAt(x);
      A.addHot({ x0: WALL - 26, x1: WALL + 26, y0: g(WALL) - 80, y1: g(WALL), x: WALL, reach: 50, tap() { R.read = true; Game.sfx('scan'); HUD.toast(R.done ? 'The dots glow: "THE GIANTS SLEEP IN ICE, ROCK AND STEEL."' : riddle(), { life: 4 }); }, onScan() { R.read = true; HUD.toast(riddle(), { life: 4 }); return true; } });
      STONES.forEach((x, i) => A.addHot({ x0: x - 12, x1: x + 12, y0: g(x) - 26, y1: g(x), x, reach: 30, tap() { touch(i); } }));
    };
    Areas.falls.post = (A, fb, cx, cy, t) => {
      p0 && p0(A, fb, cx, cy, t);
      const g = (x) => World.groundAt(x);
      R.flash = Math.max(0, R.flash - 1 / 90);
      // the dotted wall
      const X = Math.round(WALL - cx), Y = Math.round(g(WALL) - cy);
      for (let y = -78; y < 0; y++) for (let x = -24; x <= 24; x++) { const e = Math.abs(x) === 24 || y === -78; UI.put(fb, X + x, Y + y, e ? 0xff08080f : U.mix(hex('#3a3a5e'), hex('#4e4e74'), U.hash(x + 99, y + 99, 3) * 0.6)); }
      const glow = R.done ? 0.6 + 0.4 * Math.sin(t * 2) : 0.25 + 0.1 * Math.sin(t * 3);
      for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) { if (U.hash(r, c, 11) < 0.45) continue; const px = X - 18 + c * 6, py = Y - 70 + r * 11; const col = R.done ? U.mix(hex('#6ad8ff'), 0xffffffff, glow * 0.5) : U.mix(hex('#20203a'), hex('#9ae8ff'), glow); UI.put(fb, px, py, col); UI.put(fb, px + 1, py, col); UI.put(fb, px, py + 1, col); UI.put(fb, px + 1, py + 1, col); }
      if (R.done) { // the classic Regi eye pattern blazing
        for (const [dx, dy] of [[-8, -30], [0, -30], [8, -30], [-4, -22], [4, -22], [0, -38], [0, -14]]) { const px = X + dx, py = Y + dy; for (let q = -1; q <= 1; q++) for (let w = -1; w <= 1; w++) UI.put(fb, px + q, py + w, U.mix(hex('#ffd23a'), 0xffffffff, 0.3 + 0.3 * Math.sin(t * 5))); }
      }
      // glyph stones: SUN, MOON, STAR
      STONES.forEach((sx, i) => {
        const x0 = Math.round(sx - cx), y0 = Math.round(g(sx) - cy), on = R.lit.includes(i) || R.done;
        for (let y = -20; y < 0; y++) for (let x = -9; x <= 9; x++) { const q = (x / 9.5) ** 2 + ((y + 10) / 11) ** 2; if (q < 1) UI.put(fb, x0 + x, y0 + y, q > 0.8 ? 0xff08080f : U.mix(hex('#2a2a4a'), hex('#57527c'), (-x - y) / 30 + 0.4)); }
        const c = on ? [hex('#ffd23a'), hex('#bfe8ff'), hex('#ff9ad0')][i] : hex('#6a6a8c');
        if (i === 0) { for (let a = 0; a < 8; a++) UI.put(fb, x0 + Math.round(Math.cos(a * 0.785) * 5), y0 - 11 + Math.round(Math.sin(a * 0.785) * 5), c); UI.put(fb, x0, y0 - 11, c); }
        if (i === 1) for (let a = -1.6; a < 1.6; a += 0.2) UI.put(fb, x0 + Math.round(Math.cos(a) * 4) - 1, y0 - 11 + Math.round(Math.sin(a) * 4), c);
        if (i === 2) for (const [dx, dy] of [[0, -4], [-1, -1], [1, -1], [-4, -1], [4, -1], [-2, 2], [2, 2], [-3, 4], [3, 4], [0, 0]]) UI.put(fb, x0 + dx, y0 - 11 + dy, c);
        if (on) Stage.S && 0;
      });
      if (R.flash > 0) { const k = Math.round(R.flash * 120); for (let i = 0; i < fb.d.length; i++) fb.d[i] = U.mixk(fb.d[i], 0xffffffff, k); }
    };
  }
  return R;
})();
