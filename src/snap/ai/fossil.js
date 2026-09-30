/* ------------------------------------------------------------------
   FossilAI — Fossil Cliffs, the east end of Coral Cove.
   Chains to discover:
    · scan the cliffs → sparkling dig spots; tap one → Mudkip digs up
      the Root Fossil, the Claw Fossil (and berries)
    · bring a fossil to the ancient altar → Lileep revives in the tide
      pool / Anorith crawls out onto the rocks
    · Lileep sways (1★); drop a berry in the pool → tentacle grab (3★);
      poke it → it hides in its petals (2★)
    · Anorith scuttles (1★), swims the pool (2★), slashes at berries (3★);
      at dusk the two ancient friends meet in the pool (4★)
    · a sand pit with two jaws poking out: Trapinch. Throw a berry in →
      CHOMP (3★); walk into the pit → it bites the camera (4★)
    · scratching under the old tree's roots: water the soil → Nincada
      digs out (2★); startle it → it burrows away in a spray of sand (3★)
------------------------------------------------------------------- */
const FossilAI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach, hex } = U;
  const { wait, until } = Mons;
  const { Walker, Swimmer, mk, dist, hourIs, surf } = AI;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const PIT = { x0: 4680, x1: 4820, c: 4750 }, POOL = { x0: 4995, x1: 5170, level: 456 }, TREE = 4460, ALTAR = 5320;
  const DIGS = [{ x: 4565, item: 'rootfossil', name: 'Root Fossil' }, { x: 4905, item: 'clawfossil', name: 'Claw Fossil' }, { x: 5460, item: 'berry', name: '3 berries', n: 3 }];
  let S = {}, A0 = null, G0 = null;
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }
  const sand = () => Game.P && Game.P.sand ? Game.P.sand : [0xff5a8ab7, 0xff629bcc, 0xff76b4df, 0xff8ec7eb];

  /* ================= TRAPINCH ================= */
  class TrapinchM extends Walker {
    constructor() {
      super(sp('Trapinch'), { kind: 'trapinch', dex: 'trapinch', x: PIT.c, y: gy(PIT.c), yaw: Math.PI / 2 - 0.3, z: 1.6, scale: 0.44, qPose: 0.06, qFields: { jaw: 0.2, headPitch: 0.2, step: 0.5 }, persona: 'grumpy', speed: 20, minX: PIT.x0 + 20, maxX: PIT.x1 - 20 });
      this.bury = 0.55; this.senseR = 90; this.lastBite = -99; this.noShadow = true;
    }
    animate(dt, t) { const P = { jaw: 0.15 + (Math.sin(t * 0.9 + this.seed) > 0.92 ? 0.4 : 0), headPitch: 0.2, step: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        yield* hold(this, rnd(3, 6), 'peek', 0.4);
        // a little sand spray: the pit's giveaway
        let e = 0; while (e < 0.8) { const dt = yield; e += dt; this.o.jaw = Math.abs(Math.sin(e * 12)) * 0.5; this.setAct('peek', 0.7); if (Math.random() < dt * 20) FX.add({ type: 'drop', x: this.x + rnd(-8, 8), y: gy(this.x) - 4, vx: rnd(-40, 40), vy: -rnd(40, 90), g: 400, life: 0.7, c: sand()[3], size: 1, floor: gy(this.x), layer: 2 }); }
      }
    }
    *chomp(it) {
      yield* this.walkTo(clamp(it.x, this.minX, this.maxX), 30);
      let e = 0; Game.sfx('crack', this.x, 0.8);
      while (e < 1.4) {
        const dt = yield; e += dt;
        this.bury = e < 0.25 ? lerp(0.55, 0.1, e / 0.25) : e > 1.1 ? lerp(0.1, 0.55, (e - 1.1) / 0.3) : 0.1;
        this.o.jaw = e < 0.35 ? 1 : e < 0.5 ? 0 : 0.2; this.o.headPitch = -0.3;
        this.setAct('chomp', e > 0.3 && e < 0.6 ? 1 : 0.6);
        if (e > 0.4 && !it.eaten) { Items.eat(it); FX.bonk(this.x, this.y - 12, 8); }
      }
      this.bury = 0.55; this.emote('heart');
    }
    *bite(m) {
      this.lastBite = Game.t;
      yield* this.faceCam(1);
      let e = 0;
      while (e < 1.1) { const dt = yield; e += dt; this.bury = lerp(0.55, 0, Math.min(1, e / 0.3)); this.o.jaw = e < 0.6 ? 1 : 0; this.o.headPitch = -0.5; this.setAct('attack', e > 0.4 && e < 0.8 ? 1 : 0.6); }
      Game.sfx('crack', this.x, 1); FX.bonk(m.x, m.y - 16, 10);
      if (Game.mode === 'camera') Photo.hitLens('crack', { x: 0.5, y: 0.6 });
      else { m.dizzy = 1.2; m.vair = 260; m.air = 0.5; m.x += m.x < this.x ? -30 : 30; HUD.toast('CHOMP! A Trapinch lives in the pit!', { life: 2.4 }); }
      Save.discover('trapinch.found');
      e = 0; while (e < 0.6) { const dt = yield; e += dt; this.bury = lerp(0, 0.55, e / 0.6); }
    }
    senses(dt, t) {
      super.senses(dt, t);
      const m = mk();
      if (m && m.mode === 'land' && m.x > PIT.x0 + 30 && m.x < PIT.x1 - 30 && t - this.lastBite > 8 && !this.busy(4)) this.doTask(this.bite(m), 5);
    }
    onFood(it) { if (it.x < PIT.x0 || it.x > PIT.x1 || this.busy(3)) return false; this.doTask(this.chomp(it), 3); return true; }
    onPoke() { if (!this.busy(4)) this.doTask(this.bite(mk()), 5); }
    onScan() { if (Math.abs(mk().x - this.x) < Game.VW * 0.6) { HUD.toast('Scan: two sharp jaws in the sand pit... careful where you step!', { life: 2.6 }); return true; } return false; }
  }

  /* ================= NINCADA ================= */
  class NincadaM extends Walker {
    constructor() {
      super(sp('Nincada'), { kind: 'nincada', dex: 'nincada', x: TREE - 20, y: gy(TREE - 20), yaw: 1.1, z: 1.7, scale: 0.5, qPose: 0.06, qFields: { step: 0.5, dig: 0.25, feelers: 0.25 }, persona: 'shy', speed: 38, minX: 4300, maxX: 4640 });
      this.under = true; this.bury = 1; this.visible = false; this.stepPh = 0; this.senseR = 100; this.alert = 1.3;
    }
    animate(dt, t) { if (this.moving) this.stepPh += dt * 12; const P = { step: this.moving ? this.stepPh : 0, dig: 0, feelers: Math.sin(t * 3 + this.seed) * 0.6, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (this.under) { this.setAct('dig', 0); yield; if (Math.random() < 0.004) scratch(this.x); continue; }
        const r = Math.random();
        if (r < 0.5) yield* this.walkTo(clamp(this.x + rnd(-120, 120), this.minX, this.maxX), this.speed, { act: 'walk' });
        else yield* hold(this, rnd(1.5, 3), 'walk', 0.3);
        if (hourIs('night') && chance(0.3)) yield* this.burrow();
      }
    }
    *emerge() {
      this.visible = true; this.under = false;
      let e = 0; Game.sfx('dust', this.x, 0.8);
      while (e < 1.3) { const dt = yield; e += dt; this.bury = Math.max(0, 1 - e / 1.1); this.o.dig = Math.abs(Math.sin(e * 16)); this.setAct('dig', e > 0.5 ? 1 : 0.6); if (Math.random() < dt * 25) FX.add({ type: 'drop', x: this.x + rnd(-8, 8), y: gy(this.x) - 2, vx: rnd(-50, 50), vy: -rnd(40, 110), g: 420, life: 0.8, c: sand()[2], size: 1, floor: gy(this.x), layer: 2 }); }
      this.bury = 0; Save.discover('nincada.found');
      HUD.toast('A Nincada dug its way out of the soil!', { life: 2.4 });
    }
    *burrow() {
      this.emote('sweat', 0.8);
      let e = 0; Game.sfx('dust', this.x, 0.8);
      while (e < 1.2) { const dt = yield; e += dt; this.bury = Math.min(1, e / 1.1); this.o.dig = Math.abs(Math.sin(e * 18)); this.setAct('burrow', e > 0.3 && e < 0.9 ? 1 : 0.6); if (Math.random() < dt * 30) FX.add({ type: 'drop', x: this.x + rnd(-10, 10), y: gy(this.x) - 2, vx: rnd(-60, 60), vy: -rnd(50, 130), g: 420, life: 0.8, c: sand()[3], size: 2, floor: gy(this.x), layer: 2 }); }
      this.under = true; this.visible = false; this.x = clamp(TREE + rnd(-80, 80), this.minX, this.maxX);
    }
    *flee(m) { if (!this.under) yield* this.burrow(); }
    onPoke() { if (!this.under) this.doTask(this.burrow(), 4); }
  }
  function scratch(x) { FX.add({ type: 'drop', x: x + rnd(-6, 6), y: gy(x) - 2, vx: rnd(-20, 20), vy: -rnd(20, 50), g: 300, life: 0.5, c: sand()[2], size: 1, floor: gy(x), layer: 2 }); }

  /* ================= LILEEP ================= */
  class LileepM extends Mons.Mon {
    constructor(entrance) {
      super(sp('Lileep'), { kind: 'lileep', dex: 'lileep', x: 5070, y: gy(5070), yaw: 1.2, z: 1.5, scale: 0.36, qPose: 0.06, qFields: { sway: 0.2, tentacles: 0.2, mouth: 0.25, hide: 0.2 }, persona: 'calm', mode: 'rooted' });
      this.noShadow = true; this.senseR = 80;
      if (entrance) { this.tint = 0xffffffff; this.tintK = 1; }
    }
    physics() { this.y = gy(this.x); }
    animate(dt, t) { this.tintK = Math.max(0, (this.tintK || 0) - dt * 0.7); const P = { sway: Math.sin(t * 0.9 + this.seed) * 0.6, tentacles: 0.5 + Math.sin(t * 1.7) * 0.2, mouth: 0, hide: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() { for (;;) { if (S.friends) { yield* this.friends(); continue; } yield* hold(this, rnd(3, 6), 'sway', (e) => 0.4 + 0.3 * Math.abs(Math.sin(e))); } }
    *friends() { let e = 0; while (S.friends && e < 12) { const dt = yield; e += dt; this.o.tentacles = 0.8 + Math.sin(e * 4) * 0.2; this.o.eyes = 'happy'; this.o.sway = Math.sin(e * 2) * 0.8; this.setAct('friends', 0.8 + 0.2 * Math.sin(e * 2)); } }
    *grab(it) {
      let e = 0;
      while (e < 2) { const dt = yield; e += dt; this.o.tentacles = e < 0.4 ? 1 : 0.1; this.o.mouth = e > 0.5 && e < 1.4 ? Math.abs(Math.sin(e * 12)) : 0; this.setAct('grab', e > 0.25 && e < 0.8 ? 1 : 0.6); if (e > 0.4 && !it.eaten) Items.eat(it); if (!it.eaten) { const [hx, hy] = this.at('head'); it.x = lerp(it.x, hx, dt * 6); it.y = lerp(it.y, hy, dt * 6); it.state = 'held'; } }
      this.emote('heart');
    }
    onFood(it) { if (it.x < POOL.x0 || it.x > POOL.x1 || this.busy(3)) return false; this.doTask(this.grab(it), 3); return true; }
    onPoke() { this.doTask((function* (s) { let e = 0; while (e < 3) { const dt = yield; e += dt; s.o.hide = Math.min(1, e * 3) * (e > 2.4 ? (3 - e) / 0.6 : 1); s.o.eyes = 'closed'; s.setAct('hide', 0.8); } })(this), 3); }
  }

  /* ================= ANORITH ================= */
  class AnorithM extends Walker {
    constructor(entrance) {
      super(sp('Anorith'), { kind: 'anorith', dex: 'anorith', x: ALTAR - 50, y: gy(ALTAR - 50), yaw: Math.PI - 1, z: 1.7, scale: 0.42, qPose: 0.06, qFields: { step: 0.5, clawN: 0.2, clawF: 0.2, fins: 0.25, mouth: 0.25 }, persona: 'curious', speed: 34, minX: 4850, maxX: 5560 });
      this.stepPh = 0; this.senseR = 110;
      if (entrance) { this.tint = 0xffffffff; this.tintK = 1; }
    }
    animate(dt, t) {
      this.tintK = Math.max(0, (this.tintK || 0) - dt * 0.7);
      if (this.moving) this.stepPh += dt * 11;
      const P = { step: this.moving ? this.stepPh : 0, clawN: 0.2, clawF: 0.2, fins: this.mode === 'swim' ? Math.sin(t * 9) : Math.sin(t * 2) * 0.2, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o); this.pose = P;
    }
    physics(dt, t) {
      if (this.mode === 'swim') { const g = gy(this.x); this.y = clamp(this.y, POOL.level + 8, g - 4); return; }
      super.physics(dt, t);
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (S.friends) { yield* this.meet(); continue; }
        const r = Math.random();
        if (r < 0.3) yield* this.swim();
        else if (r < 0.7) yield* this.walkTo(clamp(this.x + rnd(-150, 150), this.minX, this.maxX), this.speed, { act: 'walk', stop: () => this.x > POOL.x0 && this.x < POOL.x1 });
        else yield* hold(this, rnd(1.5, 3), 'walk', 0.3);
        if (this.x > POOL.x0 && this.x < POOL.x1 && this.mode !== 'swim') this.x = this.x < (POOL.x0 + POOL.x1) / 2 ? POOL.x0 - 6 : POOL.x1 + 6;
      }
    }
    *swim(T = rnd(5, 8)) {
      const ex = this.x < POOL.x0 ? POOL.x0 - 4 : POOL.x1 + 4;
      yield* this.walkTo(ex, this.speed, { act: 'walk' });
      this.mode = 'swim'; FX.splashAt(this.x, surf(this.x), { power: 0.35, n: 6 }); Game.sfx('plop', this.x, 0.6);
      let e = 0, tx = rnd(POOL.x0 + 20, POOL.x1 - 20), ty = POOL.level + 14;
      while (e < T) {
        const dt = yield; e += dt;
        if (Math.hypot(tx - this.x, ty - this.y) < 6) { tx = rnd(POOL.x0 + 20, POOL.x1 - 20); ty = rnd(POOL.level + 10, gy(tx) - 6); }
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
        this.x += (dx / d) * 30 * dt; this.y += (dy / d) * 30 * dt; this.moving = 30;
        this.turn(this.face(Math.sign(dx), true), dt, 4);
        this.setAct(S.friends ? 'friends' : 'swim', 0.7);
      }
      const out = this.x < (POOL.x0 + POOL.x1) / 2 ? POOL.x0 - 8 : POOL.x1 + 8;
      this.mode = 'land'; this.x = out; FX.splashAt(out, surf(out + (out < 5000 ? 8 : -8)), { power: 0.3, n: 5 });
    }
    *meet() { yield* this.swim(12); }
    *slash(it) {
      yield* this.walkTo(it.x + (this.x < it.x ? -18 : 18), 60, { act: 'walk' });
      if (it.eaten) return;
      let e = 0;
      while (e < 1.3) { const dt = yield; e += dt; const k = Math.abs(Math.sin(e * 10)); this.o.clawN = k; this.o.clawF = 1 - k; this.setAct('slash', k > 0.85 ? 1 : 0.6); if (k > 0.95 && Math.random() < 0.3) Game.sfx('snip', this.x, 0.5); }
      Items.eat(it); this.emote('heart');
    }
    onFood(it) { if (Math.abs(it.x - this.x) > 260 || (it.x > POOL.x0 && it.x < POOL.x1) || this.busy(3)) return false; this.doTask(this.slash(it), 3); return true; }
    onPoke() { this.emote('anger', 0.8); this.doTask(this.slash({ x: mk().x, eaten: true }), 2); }
  }

  /* ================= area hooks ================= */
  function spawn(A, G) {
    A0 = A; G0 = G;
    S = { friends: false, friendT: 0 };
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Trapinch')) add(new TrapinchM());
    if (sp('Nincada')) S.nin = add(new NincadaM());
    if (sp('Lileep') && Save.found('fossil.lileep')) add(new LileepM(false));
    if (sp('Anorith') && Save.found('fossil.anorith')) add(new AnorithM(false));
    // dig spots: disturbed sand that sparkles under a scan
    for (const d of DIGS) {
      A.addHot({ x0: d.x - 16, x1: d.x + 16, y0: gy(d.x) - 18, y1: gy(d.x) + 6, x: d.x, reach: 26, dig: d,
        tap() { if (Save.found('dig.' + d.item)) { HUD.toast('You already dug here.', { life: 1.4 }); return; } const m = Game.mudkip; m.doTask(digAt(m, d), 3); },
        onScan() { if (Save.found('dig.' + d.item)) return false; FX.sparkles(d.x, gy(d.x) - 6, 8, 16, 0xffffffff, hex('#ffe08a')); return true; } });
    }
    A.addHot({ x0: ALTAR - 22, x1: ALTAR + 22, y0: gy(ALTAR) - 46, y1: gy(ALTAR), x: ALTAR, reach: 40, tap() { altar(A, G); },
      onScan() { HUD.toast('Scan: an ancient altar. Its carvings show two creatures of the old sea... and holes shaped like fossils.', { life: 3.2 }); return true; } });
    A.addHot({ x0: TREE - 50, x1: TREE + 50, y0: gy(TREE) - 12, y1: gy(TREE) + 8, x: TREE, reach: 60,
      onScan() { if (S.nin && S.nin.under) { scratch(S.nin.x); HUD.toast('Scan: faint scratching under the roots. Dry soil though...', { life: 2.6 }); return true; } return false; } });
  }
  function* digAt(m, d) {
    m.target = null;
    yield* m.faceTo(d.x > m.x ? 1 : -1, false);
    let e = 0; Game.sfx('dust', d.x, 0.8);
    while (e < 1.6) {
      const dt = yield; e += dt;
      m.o.headPitch = 0.35; m.o.bodyDip = 1.2; m.o.legF = Math.sin(e * 24) * 0.8; m.o.tailWag = Math.sin(e * 10) * 0.4;
      if (Math.random() < dt * 30) FX.add({ type: 'drop', x: d.x + rnd(-6, 6), y: gy(d.x) - 2, vx: -Math.cos(m.yaw) * rnd(40, 110), vy: -rnd(50, 120), g: 420, life: 0.8, c: sand()[3], c2: sand()[2], size: 2, floor: gy(d.x), layer: 3 });
    }
    Save.discover('dig.' + d.item);
    Save.addItem(d.item, d.n || 1);
    FX.sparkles(d.x, gy(d.x) - 10, 14, 26, 0xffffffff, hex('#ffe08a')); SFX.reward();
    m.happyT = 1.2;
    HUD.toast(d.item === 'berry' ? 'Found 3 berries buried in the sand!' : 'Found the ' + d.name + '! The altar on the cliff might know what to do with it.', { life: 3.2 });
  }
  function altar(A, G) {
    const has = (k) => Save.itemN(k) > 0;
    if (has('rootfossil') && !Save.found('fossil.lileep') && sp('Lileep')) { Save.useItem('rootfossil'); revive(A, G, 'lileep'); return; }
    if (has('clawfossil') && !Save.found('fossil.anorith') && sp('Anorith')) { Save.useItem('clawfossil'); revive(A, G, 'anorith'); return; }
    if (Save.found('fossil.lileep') && Save.found('fossil.anorith')) HUD.toast('The altar hums softly. The old friends are home again.', { life: 2.4 });
    else HUD.toast('An ancient altar with two fossil-shaped hollows. Maybe something is buried nearby...', { life: 3 });
    A.altarGlow.k = 0.6; setTimeout(() => { A.altarGlow.k = 0; }, 900);
  }
  function revive(A, G, which) {
    Save.discover('fossil.' + which);
    Game.sfx('evolve', ALTAR, 1); Game.shake(1.5);
    Game.cine.pan(which === 'lileep' ? (ALTAR + 5070) / 2 : ALTAR - 30, gy(ALTAR) - 26, { hold: 3.5, zoom: 1.14 });
    A.altarGlow.k = 1; setTimeout(() => { A.altarGlow.k = 0.25; }, 4000);
    FX.sparkles(ALTAR, gy(ALTAR) - 30, 30, 50, 0xffffffff, hex('#9fe8ff'));
    setTimeout(() => {
      if (Game.areaId !== 'beach') return;
      const m = which === 'lileep' ? new LileepM(true) : new AnorithM(true);
      G.addMon(m);
      FX.sparkles(m.x, m.y - 20, 20, 30, 0xffffffff, hex('#9fe8ff'));
      HUD.toast(which === 'lileep' ? 'The Root Fossil woke up! Lileep took root in the tide pool.' : 'The Claw Fossil woke up! Anorith scuttles out onto the rocks.', { life: 3.2 });
    }, 1800);
  }
  function update(A, dt, t, G) {
    // ancient friends: at dusk, when both are revived, they meet in the tide pool
    const both = Mons.all.some((m) => m.kind === 'lileep') && Mons.all.some((m) => m.kind === 'anorith');
    S.friends = both && hourIs('dusk');
  }
  function water(tx, ty) {
    if (S.nin && S.nin.alive && S.nin.under && Math.abs(tx - S.nin.x) < 70 && Math.abs(ty - gy(tx)) < 30) S.nin.doTask(S.nin.emerge(), 5);
  }
  function onScan(A) { return 0; }
  return { spawn, update, water, onScan, get S() { return S; }, classes: { TrapinchM, NincadaM, LileepM, AnorithM } };
})();
