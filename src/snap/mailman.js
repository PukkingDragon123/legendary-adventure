/* ------------------------------------------------------------------
   Mailman — Pelipper the postman stands by his mailbox at the start
   of Coral Cove. Talk to him for the map of Hoenn, and help the
   flyers of each area (Pelipper, Tropius, Altaria) to be carried to
   the next one. Flights play a big animated ride over the world map.
------------------------------------------------------------------- */
const Mailman = (() => {
  const { clamp, rnd, pick, lerp } = U;
  const INK = 0xff1b2240;
  const CARRIER = { forest: 'pelipper', beach: 'pelipper', canopy: 'tropius', falls: 'altaria', stage: 'altaria' };
  const CSP = { pelipper: { sp: 'Pelipper', scale: 0.46, flap: (k) => ({ flap: k, spread: 1, feet: 0, pouch: 0.6, bill: 0.2, eyes: 'happy' }) }, tropius: { sp: 'Tropius', scale: 0.34, flap: (k) => ({ flap: k, eyes: 'happy', mouth: 0.3 }) }, altaria: { sp: 'Altaria', scale: 0.85, flap: (k) => ({ flap: k, eyes: 'happy' }) } };

  /* ---------- the postman ---------- */
  let Mail = null;
  function makeClass() {
    if (Mail || typeof Pelipper === 'undefined') return Mail;
    Mail = class extends Mons.Mon {
      constructor(x) {
        super(Pelipper, { kind: 'mailman', dex: 'pelipper', x, y: World.groundAt(x) - 22, yaw: Math.PI / 2 + 0.35, z: 2.4, scale: 0.34, qPose: 0.06, qFields: { bill: 0.1, pouch: 0.1, flap: 0.2 }, persona: 'calm' });
        this.mode = 'perch'; this.noShadow = false; this.baseY = this.y; this.senseR = 0;
      }
      senses() {}
      physics() { this.y = this.baseY; }
      animate(dt, t) {
        const P = { flap: 0, spread: 0, feet: 1, pouch: 0.25 + Math.sin(t * 1.3) * 0.1, bill: 0.12, pitch: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
        const mk = Game.mudkip;
        if (mk && Math.abs(mk.x - this.x) < 90) this.turn(this.face(mk.x > this.x ? 1 : -1, false), dt, 3);
        Object.assign(P, this.o); this.pose = P;
      }
      brain() { const me = this; return (function* () { for (;;) { yield* wait(rnd(3, 7)); let e = 0; while (e < 0.8) { const dt = yield; e += dt; me.o.bill = Math.sin(e * 20) > 0 ? 0.7 : 0.1; } if (Math.random() < 0.4) { e = 0; while (e < 1) { const dt = yield; e += dt; me.o.flap = Math.sin(e * 12) * 0.5; me.o.spread = 0.6; } } } })(); }
      onPoke() { this.emote('note', 1); Game.sfx('squawk', this.x, 0.8); }
      // mailbox + postman's cap
      drawExtra(fb, cx, cy) {
        const X = Math.round(this.x - cx), G = Math.round(World.groundAt(this.x) - cy);
        const red = U.hex('#d8323c'), redD = U.hex('#8e1a26'), wood = U.hex('#6a4a2a');
        for (let y = G - 22; y < G; y++) { UI.put(fb, X - 1, y, wood); UI.put(fb, X, y, wood); UI.put(fb, X + 1, y, U.hex('#8a6a3a')); }
        for (let y = G - 34; y < G - 20; y++) for (let x = -9; x <= 9; x++) { const edge = x === -9 || x === 9 || y === G - 34 || y === G - 21; UI.put(fb, X + x, y, edge ? INK : y < G - 31 ? U.hex('#ff6a6a') : x > 5 ? redD : red); }
        for (let x = -5; x <= 5; x++) UI.put(fb, X + x, G - 27, INK);
        UI.put(fb, X + 10, G - 33, U.hex('#ffd23a')); UI.put(fb, X + 10, G - 32, U.hex('#ffd23a')); UI.put(fb, X + 11, G - 33, U.hex('#ffd23a'));
      }
    };
    return Mail;
  }
  function* wait(s) { while (s > 0) s -= yield; }
  function spawn(A, G) {
    const C = makeClass(); if (!C) return;
    const x = (A.start || 300) + 150;
    const m = new C(x); m.baseY = World.groundAt(x) - 34; m.y = m.baseY;
    G.addMon(m);
  }
  if (typeof Areas !== 'undefined' && Areas.beach) { const s0 = Areas.beach.spawn; Areas.beach.spawn = (A, G) => { s0(A, G); spawn(A, G); }; }

  /* ---------- flights over the world map ---------- */
  const F = { on: false, t: 0, who: null, cast: {}, dur: 3 };
  function cast(who) {
    if (F.cast[who]) return F.cast[who];
    let c = CSP[who], S = null; try { S = (0, eval)(c.sp); } catch (e) { S = null; }
    if (!S) { c = CSP.pelipper; S = Pelipper; F.who = 'pelipper'; }
    const P = Times.compile('noon'), list = [];
    for (let i = 0; i < 4; i++) { const cr = new Critters.Critter(S, { kind: 'fly-' + who + i, scale: c.scale, yaw: 0.75, pitch: 0.1, qPose: 0.01 }); cr.noHD = true; cr.pose = c.flap([-0.9, -0.2, 0.7, -0.2][i]); list.push({ cr, P }); }
    const mk = new Critters.Critter(Mudkip, { kind: 'fly-mk', scale: 0.5, yaw: 0.9, pitch: 0.1, qPose: 0.01 }); mk.noHD = true; mk.pose = Object.assign({ eyes: 'happy', mouth: 1, legF: -0.6, legB: 0.7, tailLift: 0.3 }, Save.look(), { neck: null });
    list.push({ cr: mk, P: Times.compile('noon') });
    return (F.cast[who] = list);
  }
  function pump(who) { for (const e of cast(who)) if (!e.cr.spr) e.cr.sprite(e.P); }
  function start(dest) { F.who = CARRIER[dest] || 'pelipper'; F.on = true; F.t = 0; pump(F.who); Game.sfx('whoosh', null, 0.8); if (F.who === 'pelipper') Game.sfx('squawk', null, 0.8); }
  function stop() { F.on = false; }
  function update(dt) { if (!F.on) return; F.t += dt; pump(F.who); if (Math.floor(F.t * 3) !== Math.floor((F.t - dt) * 3)) Game.sfx('whoosh', null, 0.25); }
  function draw(fb, t) {
    if (!F.on) return;
    const L = cast(F.who), W = fb.w, H = fb.h, k = F.t;
    const inK = Math.min(1, k / 0.5), outK = Math.max(0, (k - (F.dur - 0.6)) / 0.6);
    // wind streaks and clouds rushing past
    for (let i = 0; i < 40; i++) { const y = (U.hash(i, 3, 1) * H) | 0, sp = 200 + U.hash(i, 3, 2) * 400, x = W - ((k * sp + U.hash(i, 3, 3) * W * 2) % (W * 1.6)); for (let j = 0; j < 14; j++) UI.blend(fb, x + j, y, 0xffffffff, 0.35 * (1 - j / 14) * inK); }
    for (let i = 0; i < 5; i++) { const cy = H * (0.15 + i * 0.18), cxp = W - ((k * (120 + i * 40) + i * 170) % (W + 200)) + 100; for (let yy = -8; yy <= 8; yy++) for (let xx = -30; xx <= 30; xx++) if ((xx / 30) ** 2 + (yy / 8) ** 2 < 1) UI.blend(fb, cxp + xx, cy + yy, 0xffffffff, 0.35 * inK); }
    const f = L[Math.floor(k * 8) % 4].cr.spr || L[0].cr.spr, mk = L[4].cr.spr;
    const x = lerp(-W * 0.3, W * 0.5, U.ease.outCubic(inK)) + outK * W * 0.9, y = H * 0.45 + Math.sin(k * 3) * 10 - outK * H * 0.3;
    const blit = (s, cx, cy, flip) => { if (!s) return; const x0 = Math.round(cx - s.w / 2), y0 = Math.round(cy - s.h / 2); for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) { const c = s.d[yy * s.w + (flip ? s.w - 1 - xx : xx)]; if (c) UI.put(fb, x0 + xx, y0 + yy, c); } };
    // Mudkip rides on the back (Pelipper carries it in its beak pouch)
    if (F.who === 'pelipper') { blit(f, x, y); if (mk) blit(mk, x + (f ? f.w * 0.18 : 20), y + (f ? f.h * 0.12 : 10) + Math.sin(k * 6) * 2); }
    else { if (mk) blit(mk, x - 6, y - (f ? f.h * 0.28 : 30) + Math.sin(k * 6) * 2); blit(f, x, y); if (mk && F.who === 'altaria') blit(mk, x - 6, y - (f ? f.h * 0.28 : 30) + Math.sin(k * 6) * 2); }
    const nm = (CSP[F.who] && CSP[F.who].name) || { pelipper: 'Pelipper', tropius: 'Tropius', altaria: 'Altaria' }[F.who];
    Font.draw(fb, nm + ' is flying you there!', W / 2, H - 26, 0xffffffff, { font: 'title', align: 'center', outline: INK });
  }
  return { spawn, start, stop, update, draw, F, CARRIER, CSP };
})();
