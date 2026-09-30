/* ------------------------------------------------------------------
   Pad — platformer controls. On touch screens: a joystick bottom-left
   and big A (jump) / B (use the selected TM move) buttons bottom-right,
   each tracking its own finger so you can run and jump at once. On a
   keyboard: arrows / WASD to move, Space / W / Up to jump (hold for a
   higher jump, again in mid-air for a flip), Down in mid-air to belly-
   flop, Shift to run, X to use the move, Q for the move wheel.
------------------------------------------------------------------- */
const Pad = (() => {
  const { clamp } = U;
  const P = { touch: false, stick: null, a: null, b: null, dx: 0, dy: 0, jumpHeld: false, keys: { dx: 0, dy: 0, run: false, jump: false }, L: null, hint: 1 };
  const INK = 0xff1b2240;
  function layout(W, H) {
    const s = Math.min(W, H);
    const R = Math.round(clamp(s * 0.1, 18, 34)), aR = Math.round(R * 0.8), bR = Math.round(R * 0.62);
    const ax = W - aR - 12, ay = H - aR - 12;
    const bx = ax - aR - bR - 8, by = ay - Math.round(aR * 0.55);
    return { R, sx: R + 14, sy: H - R - 14, aR, ax, ay, bR, bx, by, camX: ax - 2, camY: ay - aR - 30 };
  }
  const inC = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  // returns true when the touch is taken by the pad
  function down(ux, uy, pid, touch) {
    if (touch) P.touch = true;
    const L = P.L; if (!L || Game.mode !== 'explore') return false;
    // floating stick: a finger landing anywhere in the lower-left zone becomes the stick's centre
    // a new finger in the stick zone always takes the stick over (a lost touch-end can never leave it stuck)
    if (P.touch && ux < (P.UW || 400) * 0.42 && uy > (P.UH || 240) * 0.38 && !inC(ux, uy, L.bx, L.by, L.bR + 8) && !inC(ux, uy, L.ax, L.ay, L.aR + 8)) { P.stick = { pid, t: performance.now(), x0: inC(ux, uy, L.sx, L.sy, L.R * 1.4) ? L.sx : ux, y0: inC(ux, uy, L.sx, L.sy, L.R * 1.4) ? L.sy : uy }; stickMove(ux, uy); return true; }
    if (inC(ux, uy, L.ax, L.ay, L.aR + 6)) { P.a = { pid }; P.jumpHeld = true; Game.mudkip && Game.mudkip.jumpPress(); P.hint = 0; return true; }
    if (inC(ux, uy, L.bx, L.by, L.bR + 6)) { P.b = { pid, t: 0 }; Moves.press(); return true; }
    return false;
  }
  function stickMove(ux, uy) {
    const S = P.stick; if (!S) return;
    const R = P.L.R, dx = (ux - S.x0) / R, dy = (uy - S.y0) / R, d = Math.hypot(dx, dy);
    // drag past the rim and the stick follows the finger (no dead stick after a long swipe)
    if (d > 1.05) { S.x0 += (dx / d) * (d - 1.05) * R; S.y0 += (dy / d) * (d - 1.05) * R; }
    // quick reversal: pull back a little from the furthest point and the stick flips right away
    if (P.dx > 0.5) { S.ex = Math.max(S.ex ?? ux, ux); if (ux < S.ex - R * 0.45) { S.x0 = ux + R * 0.55; S.ex = ux; } }
    else if (P.dx < -0.5) { S.ex = Math.min(S.ex ?? ux, ux); if (ux > S.ex + R * 0.45) { S.x0 = ux - R * 0.55; S.ex = ux; } }
    else S.ex = ux;
    { const dx2 = (ux - S.x0) / R, dy2 = (uy - S.y0) / R, d2 = Math.hypot(dx2, dy2), k = d2 > 1 ? 1 / d2 : 1; P.dx = dx2 * k; P.dy = dy2 * k; }
  }
  function move(ux, uy, pid) { if (P.stick && P.stick.pid === pid) { P.stick.t = performance.now(); stickMove(ux, uy); } }
  function up(pid) {
    if (P.stick && P.stick.pid === pid) { P.stick = null; P.dx = 0; P.dy = 0; }
    if (P.a && P.a.pid === pid) { P.a = null; P.jumpHeld = false; }
    if (P.b && P.b.pid === pid) { P.b = null; Moves.release(); }
  }
  const owns = (pid) => (P.stick && P.stick.pid === pid) || (P.a && P.a.pid === pid) || (P.b && P.b.pid === pid);
  // push the combined keyboard + touch state into Mudkip every frame
  function apply(mk, dt) {
    if (P.b) P.b.t += dt;
    if (!mk) return;
    if (Game.mode !== 'explore' || (typeof Talk !== 'undefined' && Talk.busy())) { mk.keyDir = 0; mk.keyY = 0; mk.running = false; mk.jumpHeld = false; return; }
    if (typeof Arcade !== 'undefined' && Arcade.live && Arcade.drive(mk, dt)) return;
    const K = P.keys;
    const sx = Math.abs(P.dx) > 0.16 ? Math.sign(P.dx) : 0, sy = Math.abs(P.dy) > 0.6 && Math.abs(P.dy) > Math.abs(P.dx) ? Math.sign(P.dy) : 0;
    const swim = mk.mode === 'swim';
    mk.keyDir = K.dx || sx;
    mk.keyY = K.dy || (swim ? (Math.abs(P.dy) > 0.25 ? P.dy : 0) : sy > 0 ? 1 : 0);
    mk.running = K.run || Math.abs(P.dx) > 0.85;
    mk.sneak = K.sneak;
    mk.jumpHeld = K.jump || P.jumpHeld;
  }
  function draw(fb, S, t) {
    const W = fb.w, H = fb.h, L = (P.L = layout(W, H)); P.UW = W; P.UH = H;
    if (Game.mode !== 'explore' || (typeof Talk !== 'undefined' && Talk.busy())) return;
    if (typeof Arcade !== 'undefined' && Arcade.live && !Arcade.freeMove()) return;
    // joystick (touch screens)
    if (P.touch) {
      const on = !!P.stick;
      if (on) { L.sx = Math.round(P.stick.x0); L.sy = Math.round(P.stick.y0); }
      for (let y = -L.R; y <= L.R; y++) for (let x = -L.R; x <= L.R; x++) { const q = x * x + y * y; if (q > L.R * L.R) continue; const X = L.sx + x, Y = L.sy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const i = Y * W + X, v = fb.d[i]; const a = q > (L.R - 2) ** 2 ? 0.55 : on ? 0.3 : 0.2; fb.d[i] = v ? U.mix(v, 0xff0a0e20, a) : (((a * 255) | 0) << 24 | 0x200e0a) >>> 0; }
      UI.ring(fb, L.sx, L.sy, L.R, 0x90ffffff, 1);
      for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const x = L.sx + ax * (L.R - 6), y = L.sy + ay * (L.R - 6); for (let k = 0; k < 3; k++) for (let j = -k; j <= k; j++) UI.put(fb, Math.round(x + (ax ? -ax * k : j)), Math.round(y + (ay ? -ay * k : j)), 0xa0ffffff); }
      const kx = Math.round(L.sx + P.dx * L.R * 0.6), ky = Math.round(L.sy + P.dy * L.R * 0.6), kr = Math.round(L.R * 0.45);
      UI.disc(fb, kx, ky + 1, kr, 0xff0a0e1a); UI.orb(fb, kx, ky, kr, on ? S.accent : S.btn, { ol: INK });
    }
    // A: jump
    const pa = P.a ? 1 : 0;
    UI.disc(fb, L.ax, L.ay + 2, L.aR, 0xff0a0e1a); UI.orb(fb, L.ax, L.ay + pa, L.aR, pa ? U.tweak(S.accent, 0, 1, -0.1) : S.accent, { ol: INK });
    jumpIcon(fb, L.ax, L.ay + pa, L.aR);
    Font.draw(fb, 'A', L.ax + L.aR - 4, L.ay - L.aR - 2, 0xffffffff, { font: 'small', outline: INK });
    // B: the selected move (tap = use, hold = move wheel)
    const pb = P.b ? 1 : 0, mv = Moves.current();
    UI.disc(fb, L.bx, L.by + 2, L.bR, 0xff0a0e1a); UI.orb(fb, L.bx, L.by + pb, L.bR, mv ? mv.col : S.btn, { ol: INK });
    if (mv) Moves.icon(fb, mv.id, L.bx, L.by + pb, Math.max(1, Math.round(L.bR / 9)));
    if (P.b && P.b.t > 0.18) { const k = Math.min(1, (P.b.t - 0.18) / 0.3); for (let a = 0; a < 32 * k; a++) { const an = -Math.PI / 2 + a / 32 * Math.PI * 2; UI.put(fb, Math.round(L.bx + Math.cos(an) * (L.bR + 3)), Math.round(L.by + Math.sin(an) * (L.bR + 3)), 0xffffffff); } }
    Font.draw(fb, 'B', L.bx + L.bR - 3, L.by - L.bR - 2, 0xffffffff, { font: 'small', outline: INK });
    // keyboard hint (fades after the first jump)
    if (!P.touch && P.hint > 0 && Game.t > 3 && !(typeof Arcade !== 'undefined' && Arcade.live)) { P.hint = Math.max(0, P.hint - 1 / 900); const a = Math.min(1, P.hint * 3); if (a > 0.05) Font.draw(fb, 'Arrows move  ·  Space jump (again: flip, Down: belly flop)  ·  E pick up  ·  X move  ·  Q wheel  ·  F throw berry  ·  G guitar jam  ·  C camera  ·  Shift run', W / 2, H - 10, U.mix(0x00ffffff, 0xffffffff, a) | 0xff000000, { font: 'small', align: 'center', outline: INK }); }
  }
  // two stacked up-chevrons (jump!)
  function jumpIcon(fb, cx, cy, r) {
    const s = Math.max(1, Math.round(r / 10));
    const chev = (y0, c) => { for (let k = 0; k < 4; k++) for (let q = 0; q < s * 2; q++) { const yy = y0 + k * s + (q >> 1) * 0; UI.put(fb, cx - k * s - (q % s), yy + Math.floor(q / s), c); UI.put(fb, cx + k * s + (q % s), yy + Math.floor(q / s), c); } };
    chev(cy - 5 * s, 0xffffffff); chev(cy + s, 0xc0ffffff);
  }
  // keyboard state from main.js
  function setKeys(o) { Object.assign(P.keys, o); if (o.jump || o.dx) P.hint = Math.min(P.hint, 0.35); }
  // safety net: when no finger is on the screen any more, let go of everything
  function allUp() { if (P.stick) { P.stick = null; P.dx = 0; P.dy = 0; } if (P.a) { P.a = null; P.jumpHeld = false; } if (P.b) { P.b = null; Moves.release(); } }
  if (typeof window !== 'undefined') {
    let nT = 0;
    const onEnd = (e) => { nT = e.touches ? e.touches.length : 0; if (nT === 0) setTimeout(() => { if (nT === 0) allUp(); }, 80); };
    window.addEventListener('touchstart', (e) => { nT = e.touches.length; }, { passive: true, capture: true });
    window.addEventListener('touchend', onEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', onEnd, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) allUp(); });
  }
  function reset() { P.stick = null; P.a = null; P.b = null; P.dx = 0; P.dy = 0; P.jumpHeld = false; Object.assign(P.keys, { dx: 0, dy: 0, run: false, jump: false, sneak: false }); }
  return Object.assign(P, { down, move, up, owns, apply, draw, setKeys, layout, reset });
})();
