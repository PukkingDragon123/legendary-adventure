/* ------------------------------------------------------------------
   CanopyAI — Treetop Town's Pokémon and its photo puzzles.
   Chains to discover:
    · stand very still under a perched Swablu → it flutters down and
      fluffs Mudkip clean with its cotton wings (4★)
    · sing anywhere → Swablu hum along (2★); Altaria sing back (3★);
      an Altaria singing while a Swablu hums → a duet (4★)
    · play a song near Chatot → it copies it right back (3★) and, the
      first time, whistles the wind-chime tune: low, high, middle.
      Ring the three chimes in that order → a great gust sweeps the
      canopy, every bird takes wing and an Altaria rides the wind in
    · hang a berry in the bird feeder → a Taillow swoops to rob it;
      Water Gun it away → the Swablu flock gathers at the feeder to feast
      and hum together. Pester a Taillow near its nest (camera up close,
      pokes) → it pecks the lens (4★). Thrown berries → Taillow dive (2★)
    · play a song standing on the little treetop stage → Chatot performs
      and the birds gather as an audience (secret: canopy.stage)
    · sing at the lookout at dusk → the Altaria choir (secret: canopy.choir)
    · leaves rustling with no wind in the planters → a hidden Kecleon
    · by day a Tropius drops by now and then; shake the fruit basket
------------------------------------------------------------------- */
const CanopyAI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach, hex } = U;
  const { wait, until } = Mons;
  const { Walker, Flyer, mk, dist, hourIs } = AI;
  const TAU = Math.PI * 2;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };

  /* ---------------- shared geometry (the area builds from this too) ---------------- */
  const DECK = 561;
  const GEO = {
    W: 3400, DECK,
    trunks: [{ x: 170, w: 44 }, { x: 820, w: 52 }, { x: 1500, w: 48 }, { x: 2150, w: 56 }, { x: 2830, w: 50 }, { x: 3290, w: 40 }],
    segs: [
      { k: 'deck', x0: 0, x1: 310 },
      { k: 'bridge', x0: 310, x1: 690, sag: 14 },
      { k: 'deck', x0: 690, x1: 960 },
      { k: 'bridge', x0: 960, x1: 1350, sag: 12 },
      { k: 'deck', x0: 1350, x1: 1650 },
      { k: 'branch', x0: 1650, x1: 2010, rise: 12 },
      { k: 'deck', x0: 2010, x1: 2300 },
      { k: 'bridge', x0: 2300, x1: 2660, sag: 16 },
      { k: 'deck', x0: 2660, x1: 3400 },
    ],
    FEEDER: 905, CHIMES: [1385, 1430, 1590], NEST: [2188, 468], LEAVES: { x0: 2205, x1: 2290 },
    STAGE: { x0: 2905, x1: 3010, x: 2958 }, LOOKOUT: { x0: 3140, x1: 3400, x: 3215 }, BASKET: 3085,
    houses: [{ x: 88, w: 70, h: 48, y: null }, { x: 858, w: 64, h: 46, y: 432, ladder: 790 }, { x: 2075, w: 74, h: 50, y: null }, { x: 2118, w: 60, h: 44, y: 418, ladder: 2200 }, { x: 2745, w: 66, h: 46, y: null }],
  };
  // walk line: decks, sagging rope bridges and one great arching branch
  GEO.groundAt = (x) => {
    for (const s of GEO.segs) {
      if (x < s.x0 || x > s.x1) continue;
      const u = (x - s.x0) / (s.x1 - s.x0);
      if (s.k === 'bridge') return DECK + Math.round(Math.sin(u * Math.PI) * s.sag);
      if (s.k === 'branch') return DECK - Math.round(Math.sin(u * Math.PI) * s.rise);
      return DECK;
    }
    return DECK;
  };
  GEO.segAt = (x) => GEO.segs.find((s) => x >= s.x0 && x <= s.x1) || GEO.segs[0];
  // where birds like to sit ([x, y] feet position)
  GEO.perches = [
    [250, 543], [88, 495], [308, 538], [692, 538], [735, 543], [858, 373], [930, 543], [958, 538],
    [1352, 538], [1640, 543], [1830, 548], [2040, 543], [2075, 493], [2118, 361], [2298, 538], [2662, 538],
    [2700, 543], [2745, 497], [3140, 543], [3330, 543],
  ];
  GEO.FEED_PERCH = [[GEO.FEEDER - 9, 519], [GEO.FEEDER + 9, 519], [GEO.FEEDER, 507]];
  GEO.STAGE_PERCH = [[GEO.STAGE.x, 494], [GEO.STAGE.x0 + 8, 550], [GEO.STAGE.x1 - 6, 550]];
  GEO.LOOK_PERCH = [[GEO.LOOKOUT.x, 473], [3180, 537], [3250, 537], [3300, 543]];
  GEO.CHIME_TOP = (i) => [GEO.CHIMES[i] + 13, DECK - 44];
  const CHIME_ORDER = [0, 2, 1];

  let S = {}, A0 = null, G0 = null;
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }
  const notes = (x, y, n = 1) => { for (let i = 0; i < n; i++) FX.add({ type: 'icon', icon: Math.random() < 0.5 ? 'note' : 'music2', x: x + rnd(-8, 8), y: y - rnd(0, 6), vx: rnd(-12, 12), vy: -22, life: 1.3, layer: 3 }); };
  const feathers = (x, y, n = 4) => { for (let i = 0; i < n; i++) FX.add({ type: 'drop', x: x + rnd(-8, 8), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: rnd(-20, 0), g: 30, life: 1.8, c: 0xffffffff, c2: hex('#d8ecf8'), size: 2, floor: gy(x), layer: 3 }); };
  const leafFall = (x, y, n = 3) => { for (let i = 0; i < n; i++) FX.add({ type: 'drop', x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: -rnd(10, 40), g: 90, life: 1.8, c: hex('#56a848'), c2: hex('#8ccc60'), size: 2, floor: gy(x), layer: 3 }); };
  // free perch (not taken by another bird), near x if given
  function freePerch(self, near = null, list = GEO.perches) {
    const taken = (p) => Mons.all.some((m) => m !== self && m.alive && (m.perchAt === p || m.goal === p));
    const c = list.filter((p) => !taken(p));
    if (!c.length) return null;
    if (near !== null) { c.sort((a, b) => Math.abs(a[0] - near) - Math.abs(b[0] - near)); return c[Math.min(c.length - 1, Math.floor(Math.random() * 3))]; }
    return pick(c);
  }

  /* ================= shared bird base ================= */
  class Bird extends Flyer {
    constructor(spec, o) { super(spec, o); this.flapPh = Math.random() * 6; this.goal = null; this.carry = null; }
    // fly in from above and settle on a perch
    *land(p, speed = this.speed) {
      this.abort = false;
      if (!p) return;
      this.goal = p; this.mode = 'fly'; this.perchAt = null;
      yield* this.flyTo(p[0] + (this.x < p[0] ? -18 : 18), p[1] - 26, speed, { act: this.flyAct || 'fly', stop: () => this.abort, near: 8, agile: 3 });
      if (this.abort) { this.goal = null; return; }
      yield* this.flyTo(p[0], p[1], Math.min(speed, 45), { near: 2, act: this.flyAct || 'fly' });
      this.x = p[0]; this.y = p[1]; this.vx = this.vy = 0;
      this.mode = 'perch'; this.perchAt = p; this.goal = null;
    }
    // (the base circle leaves a huge velocity behind — tame it so the next flight doesn't overshoot)
    *circle(cx, cy, R, T, act) { yield* super.circle(cx, cy, R, T, act); this.vx = clamp(this.vx, -this.speed, this.speed); this.vy = clamp(this.vy, -this.speed, this.speed); }
    *takeOff(dy = -40) { this.mode = 'fly'; this.perchAt = null; this.vy = -40; yield* this.flyTo(this.x + rnd(-40, 40), this.y + dy, this.speed, { act: this.flyAct || 'fly' }); }
    *hopPerch() { if (this.mode === 'perch') yield* this.takeOff(); const p = freePerch(this, this.x + rnd(-500, 500)); if (p) yield* this.land(p); }
    *roam(T) { this.mode = 'fly'; this.perchAt = null; let e = 0; while (e < T) { const x = clamp(this.x + rnd(-420, 420), 60, GEO.W - 60), y = rnd(330, 480); const t0 = Game.t; yield* this.flyTo(x, y, this.speed, { act: this.flyAct || 'fly', stop: () => this.abort }); e += Game.t - t0 + 0.01; if (this.abort) return; } }
    drawExtra(fb, cx, cy) {
      if (!this.carry) return;
      const [bx, by] = this.at('beak');
      const X = Math.round(bx - cx), Y = Math.round(by - cy + 1);
      const px = [[0, 0, 0xff1b2240], [1, 0, 0xff3a7ce8], [0, 1, 0xff3a7ce8], [1, 1, 0xffbfe2ff]];
      for (const [dx, dy, c] of px) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = c; }
    }
  }

  /* ================= SWABLU ================= */
  class SwabluM extends Bird {
    constructor(i, p) {
      super(sp('Swablu'), { kind: 'swablu', dex: 'swablu', x: p[0], y: p[1], yaw: Math.PI / 2 + (i % 2 ? 0.5 : -0.5), z: 2.4, scale: 0.48, qPose: 0.06, qFields: { flap: 0.25, bill: 0.25, bob: 0.25, fold: 0.25 }, persona: 'curious', speed: 58 });
      this.i = i; this.mode = 'perch'; this.perchAt = p; this.senseR = 110; this.humming = 0; this.cleanT = -99;
    }
    animate(dt, t) {
      const perched = this.mode === 'perch';
      this.flapPh += dt * (perched ? 0 : 10);
      const P = { flap: perched ? 0 : Math.round(Math.sin(this.flapPh) * 4) / 4, bill: 0, bob: perched && Math.sin(t * 1.4 + this.seed * 3) > 0.85 ? 0.5 : 0, fold: perched ? 0.35 : 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.sleeping) { P.fold = 1; P.eyes = 'closed'; P.bob = Math.sin(t * 1.2) > 0.6 ? 0.25 : 0; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        this.abort = false;
        if (this.mode !== 'perch') { yield* this.land(freePerch(this, this.x)); continue; }
        const quiet = hourIs('afternoon', 'night') && !Mons.all.some((m) => m.kind === 'taillow' && dist(m, this) < 150);
        const r = Math.random();
        if (quiet && r < 0.35) yield* this.nap();
        else if (r < 0.7) yield* this.perchIdle(rnd(3, 7));
        else if (r < 0.85) { yield* this.takeOff(); yield* this.roam(rnd(3, 6)); }
        else yield* this.hopPerch();
      }
    }
    *perchIdle(T) {
      let e = 0, tw = rnd(1, 3);
      while (e < T) {
        const dt = yield; e += dt; tw -= dt;
        if (tw < 0 && tw > -0.5) { this.o.bill = 0.5; this.o.eyes = 'happy'; } else if (tw <= -0.5) tw = rnd(1.5, 4);
        this.setAct('perch', 0.4 + (this.facing() > 0.6 ? 0.3 : 0));
      }
    }
    *nap() {
      this.sleeping = true;
      let e = 0, z = 0; const T = rnd(10, 22);
      while (e < T && this.sleeping) { const dt = yield; e += dt; z -= dt; if (z <= 0) { z = 2.4; const h = this.headPt(); FX.add({ type: 'icon', icon: 'swirl', x: h[0] + 5, y: h[1] - 3, vx: 5, vy: -9, life: 1.6, layer: 3 }); } this.setAct('nap', 0.5 + 0.5 * Math.abs(Math.sin(e * 0.7))); }
      this.sleeping = false;
    }
    *hum(T = 3.6) {
      this.sleeping = false;
      if (this.mode === 'perch') yield* this.faceCam(0.7);
      let e = 0;
      this.humming = 1;
      while (e < T) {
        const dt = yield; e += dt;
        const k = Math.abs(Math.sin(e * 4));
        this.o.bill = 0.3 + k * 0.6; this.o.eyes = 'happy'; this.o.bob = Math.sin(e * 4) > 0.5 ? 0.6 : 0.1;
        if (this.mode !== 'perch') { this.x += Math.sin(e * 2) * dt * 8; this.o.flap = Math.sin(e * 12); }
        this.setAct('hum', e > 0.5 && e < T - 0.3 ? 1 : 0.6);
        S.lastHum = Game.t; S.humX = this.x;
        if (Math.random() < dt * 3) notes(this.at('mouth')[0], this.at('mouth')[1] - 4);
      }
      this.humming = 0;
    }
    // Mudkip stood still under its branch: flutter down and fluff it clean
    *clean(m) {
      this.sleeping = false;
      this.emote('sparkle', 1); Game.sfx('chirp', this.x, 0.6);
      this.cleanT = Game.t;
      this.mode = 'fly'; this.perchAt = null;
      yield* this.flyTo(m.x, m.y - 40, 50, { act: 'fly' });
      let e = 0; const T = 3.4;
      while (e < T) {
        const dt = yield; e += dt;
        if (e > 0.6 && S.stillT < 0.05) break; // Mudkip moved away
        this.x = lerp(this.x, m.x + Math.sin(e * 5) * 7, Math.min(1, dt * 8)); this.y = lerp(this.y, m.y - 26 + Math.sin(e * 11) * 2, Math.min(1, dt * 8));
        this.o.flap = Math.sin(e * 16); this.o.fold = 0.5 + 0.5 * Math.sin(e * 9); this.o.eyes = 'happy'; this.o.bill = 0.3;
        this.turn(this.face(Math.sin(e * 2.5) > 0 ? 1 : -1, true), dt, 5);
        this.setAct('clean', e > 0.7 && e < 3 ? 1 : 0.6);
        if (Math.random() < dt * 10) FX.add({ type: 'spark', x: m.x + rnd(-10, 10), y: m.y - rnd(8, 26), size: 1, life: 0.6, c: 0xffffffff, c2: hex('#bfe8ff'), layer: 3 });
        if (Math.random() < dt * 3) feathers(this.x, this.y - 6, 1);
      }
      if (e >= T - 0.1) { m.emote('heart', 1.4); m.happyT = 1; if (Save.discover('canopy.clean')) HUD.toast('Swablu fluffed Mudkip squeaky clean!', { life: 2.6 }); }
      yield* this.land(freePerch(this, this.x));
    }
    *feast(p) {
      yield* this.land(p, 70);
      yield* this.faceCam(0.6);
      let e = 0;
      while (e < 9) { const dt = yield; e += dt; const peck = Math.sin(e * 7) > 0.6; this.o.bob = peck ? 1 : 0; this.o.bill = peck ? 0.4 : 0; this.setAct(e > 4 ? 'hum' : 'perch', e > 4 ? 1 : 0.6); if (e > 4) { this.o.bill = 0.4 + 0.5 * Math.abs(Math.sin(e * 4)); this.o.eyes = 'happy'; S.lastHum = Game.t; if (Math.random() < dt * 2) notes(this.x, this.y - 18); } }
      yield* this.hopPerch();
    }
    *sitAndSing(p, T, act = 'hum', speed = 75) {
      yield* this.land(p, speed);
      yield* this.faceCam(0.8);
      let e = 0;
      while (e < T) { const dt = yield; e += dt; this.o.bill = 0.3 + 0.6 * Math.abs(Math.sin(e * 3.5 + this.i)); this.o.eyes = 'happy'; this.o.bob = Math.sin(e * 3.5) > 0.4 ? 0.5 : 0; this.setAct(act, 1); S.lastHum = Game.t; S.humX = this.x; if (Math.random() < dt * 2.5) notes(this.x, this.y - 20); }
    }
    senses(dt, t) {
      super.senses(dt, t);
      const m = mk();
      if (!m || this.mode !== 'perch' || this.sleeping || this.busy(3) || t - this.cleanT < 20) return;
      if (S.stillT > 2.6 && Math.abs(m.x - this.x) < 42 && m.y > this.y && m.mode === 'land') this.doTask(this.clean(m), 4);
    }
    onSong() { if (!this.busy(4)) this.doTask(this.hum(), 3); }
    onPoke() {
      if (this.sleeping) { this.sleeping = false; this.emote('anger', 1); Game.sfx('chirp', this.x, 0.5); this.doTask(this.hopPerch(), 3); return; }
      this.emote('note'); Game.sfx('chirp', this.x, 0.5);
      this.doTask(this.hum(1.6), 2);
    }
    onWater() { this.sleeping = false; this.emote('sweat'); feathers(this.x, this.y - 8, 5); this.doTask((function* (s) { yield* s.takeOff(-60); yield* s.roam(3); })(this), 3); }
  }

  /* ================= ALTARIA ================= */
  class AltariaM extends Bird {
    constructor(x, y) {
      super(sp('Altaria'), { kind: 'altaria', dex: 'altaria', x, y, yaw: 1.2, z: 2.2, scale: 0.38, qPose: 0.05, qFields: { flap: 0.25, neck: 0.25, bill: 0.25 }, persona: 'calm', speed: 42 });
      this.senseR = 160; this.leaving = false; this.stay = rnd(70, 110);
    }
    animate(dt, t) {
      const perched = this.mode === 'perch';
      this.flapPh += dt * (perched ? 0 : 2.2);
      const P = { flap: perched ? 0 : Math.round(Math.sin(this.flapPh) * 3) / 6, neck: Math.round(Math.sin(t * 0.6 + this.seed) * 2) * 0.15, bill: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        this.abort = false;
        if (this.leaving || (this.stay < 0 && !S.choir)) { yield* this.leave(); return; }
        const r = Math.random();
        if (r < 0.45) { this.mode = 'fly'; this.perchAt = null; yield* this.flyTo(clamp(this.x + rnd(-600, 600), 150, GEO.W - 150), rnd(300, 430), this.speed, { act: 'fly', agile: 0.8 }); }
        else if (r < 0.7) yield* this.circle(clamp(mk().x + rnd(-200, 200), 200, GEO.W - 200), rnd(360, 420), rnd(90, 150), rnd(5, 9), 'fly');
        else { yield* this.land(freePerch(this, mk().x, [GEO.LOOK_PERCH[0], [858, 373], [2118, 361], [88, 495], [2075, 493], [2745, 497]]), 40); yield* hold(this, rnd(4, 8), 'fly', 0.4); }
      }
    }
    update(dt, t) { super.update(dt, t); this.stay -= dt; }
    *sing(T = 4.2) {
      if (this.mode === 'perch') yield* this.faceCam(0.8);
      Game.sfx('chime', this.x, 0.5);
      let e = 0;
      while (e < T) {
        const dt = yield; e += dt;
        const duet = Game.t - (S.lastHum || -99) < 1.5 && Math.abs((S.humX || -999) - this.x) < 320;
        this.o.neck = 0.7 + 0.3 * Math.sin(e * 2); this.o.bill = 0.4 + 0.5 * Math.abs(Math.sin(e * 3)); this.o.eyes = 'happy';
        if (this.mode !== 'perch') this.o.flap = Math.sin(e * 3) * 0.4;
        this.setAct(duet ? 'duet' : 'sing', e > 0.6 && e < T - 0.4 ? 1 : 0.6);
        if (duet) S.duetT = Game.t;
        if (Math.random() < dt * 4) { const [bx, by] = this.at('mouth'); notes(bx, by - 6); }
      }
      if (Game.t - (S.duetT || -99) < 1) this.emote('heart', 1.2);
    }
    *leave() {
      this.emote('note', 1);
      this.mode = 'fly'; this.perchAt = null;
      const dir = this.x < GEO.W / 2 ? -1 : 1;
      yield* this.flyTo(this.x + dir * 900, 150, 60, { act: 'fly' });
      this.remove(); if (S.altaria === this) S.altaria = null;
    }
    onSong() { if (!this.busy(4)) this.doTask(this.sing(), 3); }
    onPoke() { this.emote('heart', 1.2); Game.sfx('chime', this.x, 0.4); this.doTask(this.sing(2), 2); }
    onWater() { this.emote('sweat'); this.doTask(this.roam(4), 3); }
  }

  /* ================= CHATOT ================= */
  class ChatotM extends Bird {
    constructor(p) {
      super(sp('Chatot'), { kind: 'chatot', dex: 'chatot', x: p[0], y: p[1], yaw: Math.PI / 2 - 0.4, z: 2.4, scale: 0.5, qPose: 0.06, qFields: { flap: 0.25, spread: 0.5, bill: 0.25, tail: 0.25, bob: 0.25 }, persona: 'showoff', speed: 70 });
      this.mode = 'perch'; this.perchAt = p; this.senseR = 130; this.beatPh = 0;
    }
    animate(dt, t) {
      const perched = this.mode === 'perch';
      this.flapPh += dt * (perched ? 0 : 12);
      const P = { flap: perched ? 0 : Math.round(Math.sin(this.flapPh) * 4) / 4, spread: perched ? 0 : 1, bill: 0, tail: Math.round(Math.sin(t * 2.2 + this.seed) * 2) / 2, bob: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1.5));
      for (;;) {
        this.abort = false;
        if (this.mode !== 'perch') { yield* this.land(freePerch(this, GEO.STAGE.x, [...GEO.STAGE_PERCH, [2700, 543], [2745, 497], [3140, 543]])); continue; }
        const r = Math.random();
        if (r < 0.4) yield* this.chatter(rnd(2.5, 5));
        else if (r < 0.8) yield* this.beat(rnd(4, 7));
        else yield* this.hop2();
      }
    }
    *hop2() { yield* this.takeOff(-30); yield* this.land(freePerch(this, GEO.STAGE.x + rnd(-150, 150), [...GEO.STAGE_PERCH, [2700, 543], [2745, 497], [3140, 543], [2662, 538]])); }
    *chatter(T) {
      let e = 0, k = 0;
      let bill = 0;
      while (e < T) { const dt = yield; e += dt; k -= dt; if (k <= 0) { k = rnd(0.12, 0.5); bill = chance(0.6) ? rnd(0.3, 0.9) : 0; if (chance(0.25)) Game.sfx('chirp', this.x, 0.25); } this.o.bill = bill; this.setAct('perch', 0.5 + bill * 0.3); }
    }
    // keeping the beat: metronome tail and head bobs
    *beat(T) {
      let e = 0, n = 0;
      const bpm = S.music > 0 ? 2.4 : 1.8;
      while (e < T) {
        const dt = yield; e += dt;
        const ph = e * bpm * Math.PI;
        this.o.tail = Math.round(Math.sin(ph) * 2) / 2; this.o.bob = Math.abs(Math.sin(ph)) > 0.8 ? 1 : 0; this.o.eyes = 'happy';
        this.setAct('beat', this.o.bob ? 1 : 0.6);
        if (Math.floor(ph / Math.PI) > n) { n = Math.floor(ph / Math.PI); if (n % 2 === 0) FX.add({ type: 'icon', icon: 'note', x: this.x + rnd(-6, 6), y: this.y - 22, vx: rnd(-6, 6), vy: -18, life: 0.9, layer: 3 }); }
      }
    }
    *mimic(first = false) {
      yield* wait(0.5);
      yield* this.faceCam(1);
      let e = 0; const T = 3.6;
      Game.sfx('whistle', this.x, 0.6);
      while (e < T) {
        const dt = yield; e += dt;
        this.o.bill = Math.sin(e * 14) > 0 ? 0.9 : 0.2; this.o.bob = Math.sin(e * 7) > 0.5 ? 1 : 0; this.o.tail = Math.round(Math.sin(e * 7) * 2) / 2; this.o.eyes = 'happy';
        if (this.mode !== 'perch') this.o.flap = Math.sin(e * 14);
        this.setAct('mimic', e > 0.4 && e < T - 0.3 ? 1 : 0.6);
        if (Math.random() < dt * 5) notes(this.at('mouth')[0], this.at('mouth')[1] - 4);
      }
      if (first) {
        HUD.toast('Chatot whistles a little tune... low, high, middle — like the wind chimes!', { life: 3.4 });
        for (let j = 0; j < 3; j++) setTimeout(() => { const i = CHIME_ORDER[j], [cx, cy] = GEO.CHIME_TOP(i); FX.sparkles(cx, cy + 20, 8, 14, 0xffffffff, hex('#ffe890')); FX.add({ type: 'icon', icon: 'note', x: cx, y: cy, vx: 0, vy: -16, life: 1.4, layer: 3 }); }, 800 + j * 700);
        S.hinted = true;
      }
    }
    *perform() {
      yield* this.land(GEO.STAGE_PERCH[0], 90);
      yield* this.faceCam(1);
      let e = 0; const T = 14;
      while (e < T) {
        const dt = yield; e += dt;
        const ph = e * 2.6 * Math.PI;
        this.o.bill = Math.sin(e * 11) > 0 ? 0.9 : 0.25; this.o.bob = Math.abs(Math.sin(ph)) > 0.75 ? 1 : 0; this.o.tail = Math.round(Math.sin(ph) * 2) / 2; this.o.eyes = 'happy';
        this.setAct(Math.floor(e / 3.5) % 2 ? 'beat' : 'mimic', this.o.bob ? 1 : 0.7);
        if (Math.random() < dt * 5) notes(this.x, this.y - 22);
      }
      S.show = 0;
    }
    onSong() {
      if (this.busy(4)) return;
      const near = Math.abs(mk().x - this.x) < 360;
      if (near) this.doTask(this.mimic(!S.hinted && !Save.found('canopy.chimes')), 3);
    }
    onPoke() { this.emote('music2', 1); Game.sfx('chirp', this.x, 0.6); this.doTask(this.beat(2.5), 2); }
    onWater() { this.emote('anger'); this.doTask(this.hop2(), 3); }
  }

  /* ================= TAILLOW ================= */
  class TaillowM extends Bird {
    constructor(i, p) {
      super(sp('Taillow'), { kind: 'taillow', dex: 'taillow', x: p[0], y: p[1], yaw: Math.PI / 2 - 0.5, z: 2.5, scale: 0.46, qPose: 0.06, qFields: { flap: 0.25, spread: 0.5, bill: 0.25, pitch: 0.25 }, persona: 'grumpy', speed: 120 });
      this.i = i; this.mode = 'perch'; this.perchAt = p; this.senseR = 120; this.smell = 560; this.pester = 0;
    }
    animate(dt, t) {
      const perched = this.mode === 'perch';
      this.flapPh += dt * (perched ? 0 : 16);
      const glide = !perched && Math.sin(this.flapPh * 0.13) > 0.3;
      const P = { flap: perched ? 0 : glide ? 0.2 : Math.round(Math.sin(this.flapPh) * 4) / 4, spread: perched ? 0 : 1, bill: 0, pitch: perched ? 0 : clamp(-this.vy / 160, -1, 1) * 0.6, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        this.abort = false;
        const r = Math.random();
        if (this.mode === 'perch' && r < 0.45) { yield* hold(this, rnd(2.5, 6), 'fly', 0.3); continue; }
        if (r < 0.7) yield* this.swoop();
        else if (r < 0.85) yield* this.circle(clamp(this.x + rnd(-300, 300), 150, GEO.W - 150), rnd(380, 450), rnd(80, 140), rnd(3, 6), 'fly');
        else yield* this.land(this.i === 0 ? GEO.NEST : freePerch(this, this.x), 110);
      }
    }
    *swoop() {
      this.mode = 'fly'; this.perchAt = null;
      const x = clamp(this.x + rnd(-600, 600), 80, GEO.W - 80);
      yield* this.flyTo(x, rnd(470, 520), this.speed * 1.2, { act: 'fly', agile: 3 });
      yield* this.flyTo(x + rnd(-120, 120), rnd(340, 420), this.speed, { act: 'fly', agile: 3 });
    }
    *dive(it) {
      this.mode = 'fly'; this.perchAt = null;
      this.emote('shock', 0.7);
      yield* this.flyTo(it.x + (this.x < it.x ? -70 : 70), it.y - 60, 170, { act: 'fly', agile: 3 });
      if (it.eaten) return;
      Game.sfx('whoosh', this.x, 0.7);
      yield* this.flyTo(it.x, it.y - 3, 230, { act: 'dive', agile: 5, near: 6, peak: (d) => (d < 40 ? 1 : 0.6) });
      if (!it.eaten) { Items.eat(it); this.carry = true; this.setAct('dive', 1); }
      yield* this.flyTo(this.x + (this.vx > 0 ? 80 : -80), it.y - 70, 150, { act: 'dive', agile: 3, peak: () => 0.8 });
      yield* this.land(GEO.NEST, 120);
      if (this.carry) { yield* hold(this, 1.2, 'fly', 0.5); this.carry = false; Game.sfx('munch', this.x, 0.4); this.emote('note'); }
    }
    // the bird-feeder robbery
    *rob() {
      this.abort = false;
      this.mode = 'fly'; this.perchAt = null;
      yield* this.flyTo(GEO.FEEDER + (this.x < GEO.FEEDER ? -90 : 90), 470, 140, { act: 'fly', stop: () => this.abort });
      if (this.abort) return;
      HUD.toast('A Taillow is eyeing the feeder...', { life: 2 });
      yield* hold(this, 1.2, 'fly', 0.5, () => this.abort);
      if (this.abort) return;
      yield* this.flyTo(GEO.FEEDER, 514, 170, { act: 'dive', peak: (d) => (d < 30 ? 1 : 0.6), stop: () => this.abort });
      if (this.abort || !S.feeder.full) return;
      S.feeder.full = false; S.feeder.phase = 'robbed'; A0.feeder.frames = [A0.feederSpr[0]];
      this.carry = true; Game.sfx('whoosh', this.x, 0.8);
      HUD.toast('The Taillow snatched the berry! (Chase it off with Water Gun next time.)', { life: 3 });
      yield* this.land(GEO.NEST, 130);
      yield* hold(this, 1.5, 'fly', 0.5); this.carry = false; this.emote('note');
    }
    *attackCam() {
      this.emote('anger', 1.2); Game.sfx('chirp', this.x, 0.9);
      this.mode = 'fly'; this.perchAt = null;
      const tx = Game.cam.x + Game.VW / 2, ty = Game.cam.y + Game.VH / 2;
      yield* this.flyTo(tx + (this.x < tx ? -60 : 60), ty - 40, 150, { act: 'fly' });
      let e = 0;
      Game.sfx('whoosh', this.x, 1);
      while (e < 0.9) {
        const dt = yield; e += dt;
        this.x = lerp(this.x, tx, Math.min(1, dt * 5)); this.y = lerp(this.y, ty, Math.min(1, dt * 5));
        this.o.bill = e > 0.5 ? 1 : 0.3; this.o.pitch = -0.4; this.o.spread = 1; this.o.flap = Math.sin(e * 30);
        yield* this.faceCamNow(dt);
        this.setAct('attack', e > 0.45 ? 1 : 0.7);
      }
      Photo.hitLens('crack', { x: 0.5, y: 0.45 });
      this.annoy = 0; this.pester = 0;
      feathers(this.x, this.y - 6, 4);
      yield* this.land(GEO.NEST, 120);
    }
    *faceCamNow(dt) { this.turn(Math.PI / 2, dt, 8); }
    senses(dt, t) {
      super.senses(dt, t);
      const m = mk();
      if (!m) return;
      // pestered: the camera pointed at it up close (worst near its nest)
      if (Game.mode === 'camera' && Photo.inView(this) && Math.abs(m.x - this.x) < 230) this.pester += dt * (this.perchAt === GEO.NEST ? 0.5 : 0.22);
      else this.pester = Math.max(0, this.pester - dt * 0.08);
      if ((this.pester + this.annoy) > 1 && !this.busy(5)) this.doTask(this.attackCam(), 5);
    }
    onFood(it) {
      if ((it.kind !== 'berry' && it.kind !== 'pecha') || this.busy(3) || Math.abs(it.x - this.x) > 560) return false;
      this.doTask(this.dive(it), 3);
      return true;
    }
    onPoke() { this.annoy += 0.4; this.emote('anger', 1); Game.sfx('chirp', this.x, 0.7); if (this.annoy + this.pester > 0.9) this.doTask(this.attackCam(), 5); else this.doTask(this.swoop(), 3); }
    onWater() {
      this.emote('sweat', 1); feathers(this.x, this.y - 6, 3);
      this.abort = true; this.carry = false;
      if (S.feeder && S.feeder.full && S.feeder.robber === this) { S.feeder.scared = true; }
      this.doTask((function* (s) { s.mode = 'fly'; s.perchAt = null; yield* s.flyTo(clamp(s.x + (s.x < mk().x ? -400 : 400), 60, GEO.W - 60), 380, 170, { act: 'fly' }); yield* wait(6); })(this), 4);
    }
  }

  /* ================= KECLEON ================= */
  class KecleonM extends Walker {
    constructor(x) {
      super(sp('Kecleon'), { kind: 'kecleon', dex: 'kecleon', x, y: gy(x), yaw: Math.PI / 2 + 0.3, z: 1.8, scale: 0.32, qPose: 0.05, qFields: { tongue: 0.1, step: 0.5, eyeL: 0.5, eyeR: 0.5, mouth: 0.25, tail: 0.25, arms: 0.25, lean: 0.25, tongueAim: 0.5 }, persona: 'shy', speed: 32, minX: GEO.LEAVES.x0 - 150, maxX: GEO.LEAVES.x1 + 5 });
      this.hidden = true; this.hideK = 1; this.stepPh = 0; this.revealT = 0; this.senseR = 100; this.zd = -2; this.lastLick = -99; this.trust = 0; this.home = x; this.range = 100;
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 7;
      const P = { step: this.moving ? this.stepPh : 0, tongue: 0, tongueAim: 0, tail: 0.5, eyeL: Math.round(Math.sin(t * 0.9 + this.seed) * 2) / 2, eyeR: Math.round(Math.sin(t * 0.63 + 2 + this.seed) * 2) / 2, mouth: 0, arms: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', lean: 0 };
      Object.assign(P, this.o);
      this.pose = P;
    }
    update(dt, t) {
      super.update(dt, t);
      if (!this.hidden && !this.busy(4)) { this.revealT -= dt; if (this.revealT <= 0 && this.trust <= 0) { this.hidden = true; if (Math.abs(this.x - (GEO.LEAVES.x0 + GEO.LEAVES.x1) / 2) > 50) this.doTask(this.walkTo(rnd(GEO.LEAVES.x0 + 10, GEO.LEAVES.x1 - 10), 40), 1); } }
      this.trust = Math.max(0, this.trust - dt);
      this.persona = this.trust > 0 ? 'curious' : 'shy';
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (this.hidden) { yield* hold(this, rnd(4, 8), 'hide', 0, () => !this.hidden); if (this.hidden) { rustle(this.x); if (chance(0.4)) yield* this.walkTo(clamp(this.x + rnd(-30, 30), GEO.LEAVES.x0 + 8, GEO.LEAVES.x1 - 8), 16); } continue; }
        if (chance(0.5)) yield* this.idle(rnd(1.5, 3), 'reveal');
        else yield* this.walkTo(clamp(this.x + rnd(-70, 70), this.minX, this.maxX), this.speed, { act: 'reveal' });
      }
    }
    *flee(m) {
      if (this.hidden) return;
      yield* this.walkTo(clamp(this.x + (this.x < m.x ? -60 : 60), this.minX, this.maxX), 60);
      this.revealT = Math.min(this.revealT, 2);
    }
    reveal() {
      if (!this.hidden) return false;
      this.hidden = false; this.revealT = 16;
      this.doTask(this.startled(), 4);
      return true;
    }
    *startled() {
      this.emote('shock', 1); Game.sfx('squeak', this.x, 0.7);
      const cols = ['#ff5a5a', '#ffd84a', '#5ae07a', '#5ab4ff', '#c07aff', '#ff8ad0'].map(hex);
      let e = 0;
      while (e < 1.7) { const dt = yield; e += dt; this.tint = cols[Math.floor(e * 9) % cols.length]; this.tintK = 0.55 * (1 - e / 1.7) + 0.15; this.o.arms = 1; this.o.mouth = 0.7; this.o.eyeL = 1; this.o.eyeR = 1; this.o.lean = -0.4; this.setAct('colors', e > 0.25 && e < 1.4 ? 1 : 0.6); }
      this.tintK = 0;
      yield* this.faceCam(0.7);
      yield* hold(this, 1.4, 'reveal', 0.8);
    }
    *snapAt(it) {
      const reach = 44;
      if (Math.abs(it.x - this.x) > reach) yield* this.walkTo(it.x + (this.x < it.x ? -reach : reach), 60);
      yield* this.faceTo(it.x > this.x ? 1 : -1, false);
      if (it.eaten) return;
      const was = this.hidden; this.hidden = false;
      let e = 0, got = false;
      Game.sfx('tongue', this.x, 0.8);
      while (e < 0.95) {
        const dt = yield; e += dt;
        const k = e < 0.22 ? e / 0.22 : e < 0.45 ? 1 : Math.max(0, 1 - (e - 0.45) / 0.35);
        this.o.tongue = k; this.o.tongueAim = -1; this.o.eyeL = 1; this.o.eyeR = 1; this.o.lean = 0.3;
        this.setAct('tongue', k > 0.9 ? 1 : 0.65);
        if (k >= 1 && !it.eaten) got = true;
        if (got && e > 0.45) { const tip = this.at('tongueTip'); it.x = tip[0]; it.y = tip[1]; it.state = 'held'; }
      }
      if (got) { Items.eat(it); Game.sfx('gulp', this.x, 0.6); this.emote('heart'); this.trust = 30; this.revealT = 30; if (was) Save.discover('kecleon.found'); }
      yield* hold(this, 1, 'tongue', 0.4);
    }
    *lick(m) {
      yield* this.walkTo(m.x + (this.x < m.x ? -26 : 26), 60);
      yield* this.faceCam(1);
      let e = 0; Game.sfx('tongue', this.x, 1);
      while (e < 1.2) { const dt = yield; e += dt; const k = e < 0.4 ? e / 0.4 : Math.max(0, 1 - (e - 0.7) / 0.4); this.o.tongue = k; this.o.tongueAim = 0.4; this.o.eyes = e > 0.5 ? 'happy' : 'open'; this.setAct('attack', k > 0.85 ? 1 : 0.6); }
      Photo.hitLens('smear');
      this.emote('note');
      this.trust = Math.min(this.trust, 8);
    }
    senses(dt, t) {
      super.senses(dt, t);
      const m = mk();
      if (!m || this.hidden || this.busy(4) || t - this.lastLick < 14) return;
      const d = Math.abs(m.x - this.x);
      if (this.trust > 0 && (d < 40 || (d < 90 && Game.mode === 'camera'))) { this.lastLick = t; this.doTask(this.lick(m), 5); }
    }
    onFood(it) {
      if ((it.kind !== 'berry' && it.kind !== 'pecha') || Math.abs(it.x - this.x) > 200 || this.busy(4)) return false;
      this.doTask(this.snapAt(it), 4);
      return true;
    }
    onPoke() { if (this.hidden) { this.reveal(); return; } super.onPoke(); if (this.trust <= 0 && !this.busy(4)) this.doTask(this.flee(mk()), 4); }
    onScan() { if (this.hidden && Math.abs(mk().x - this.x) < Game.VW * 0.6) { this.reveal(); HUD.toast('Scan: a Kecleon hiding among the planters!', { life: 2 }); return true; } return false; }
    onWater() { if (this.hidden) this.reveal(); else { this.annoy += 0.3; this.emote('anger'); } }
  }

  /* ================= TROPIUS (a visitor) ================= */
  class TropiusM extends Walker {
    constructor(x) {
      super(sp('Tropius'), { kind: 'tropius', dex: 'tropius', x, y: 200, yaw: Math.PI - 0.95, z: 1.2, scale: 0.24, qPose: 0.05, qFields: { step: 0.5, flap: 0.25, neck: 0.2, mouth: 0.25, look: 0.25 }, persona: 'calm', speed: 24, minX: 2690, maxX: 3120 });
      this.stepPh = 0; this.senseR = 140; this.zd = -3; this.smell = 500; this.mode = 'air'; this.stay = rnd(45, 70); this.shared = false;
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 4.5;
      const P = { step: this.moving ? this.stepPh : 0, flap: Math.round(Math.sin(t * 0.8 + this.seed) * 2) * 0.04, neck: 0, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', look: 0, hold: 0 };
      Object.assign(P, this.o);
      this.pose = P;
    }
    physics(dt, t) { if (this.mode === 'land') super.physics(dt, t); }
    update(dt, t) { super.update(dt, t); if (this.mode === 'land') this.stay -= dt; }
    brain() { return this.life(); }
    *life() {
      if (this.mode === 'air') yield* this.arrive();
      for (;;) {
        if (this.stay <= 0 || hourIs('night')) { this.doTask(this.depart(), 5); return; }
        const r = Math.random();
        if (r < 0.35) yield* this.walkTo(clamp(this.x + rnd(-160, 160), this.minX, this.maxX), this.speed, { act: 'walk' });
        else if (r < 0.65) yield* this.browse();
        else yield* this.idle(rnd(2, 4), 'walk');
      }
    }
    *arrive() {
      const x1 = 2760, x0 = x1 + 520;
      let e = 0; const T = 6;
      Game.sfx('whoosh', x1, 0.6);
      while (e < T) { const dt = yield; e += dt; const k = U.ease ? U.ease.inOut(Math.min(1, e / T)) : e / T; this.x = lerp(x0, x1, k); this.y = gy(this.x) - (1 - k) * 170 - Math.sin(e * 3.5) * 2 * (1 - k); this.o.flap = Math.sin(e * 6.5); this.o.neck = 0.4; this.turn(this.face(-1, true), dt, 3); this.setAct('fly', k > 0.2 && k < 0.8 ? 1 : 0.6); if (Math.random() < dt * 3) leafFall(this.x, this.y - 30, 1); }
      this.mode = 'land';
      FX.poof(this.x, gy(this.x), hex('#946a40'), hex('#b48552'), 5, 5);
      if (!S.tropSeen) { S.tropSeen = true; HUD.toast('A Tropius glides down onto the deck!', { life: 2.4 }); }
    }
    *depart() {
      this.emote('note', 1);
      this.mode = 'air';
      const x0 = this.x;
      let e = 0; const T = 6;
      Game.sfx('whoosh', this.x, 0.6);
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = x0 + k * 600; this.y = gy(Math.min(GEO.W, this.x)) - k * k * 260; this.o.flap = Math.sin(e * 6.5); this.o.neck = 0.4; this.turn(this.face(1, true), dt, 3); this.setAct('fly', k > 0.15 && k < 0.7 ? 1 : 0.6); }
      this.remove(); if (S.tropius === this) S.tropius = null;
    }
    // reaching up to nibble the leaves overhead
    *browse() { let e = 0; const T = rnd(2.5, 4); while (e < T) { const dt = yield; e += dt; this.o.neck = 0.9; this.o.look = 0.8; this.o.mouth = Math.sin(e * 6) > 0.3 ? 0.4 : 0; this.setAct('walk', 0.4); if (Math.random() < dt) leafFall(this.x + (Math.cos(this.yaw) > 0 ? 20 : -20), this.y - 60, 1); } }
    onFood(it) {
      if (it.kind !== 'fruit' || this.mode !== 'land' || this.busy(3)) return false;
      this.doTask(this.eat(it), 3);
      return true;
    }
    *eat(it) {
      yield* this.walkTo(it.x + (this.x < it.x ? -30 : 30), 55, { act: 'walk' });
      yield* this.faceTo(it.x > this.x ? 1 : -1, false);
      if (!it.eaten) {
        let e = 0, bit = false;
        while (e < 2.2) { const dt = yield; e += dt; const dip = Math.min(1, e / 0.5); this.o.neck = -dip; this.o.mouth = e > 0.5 ? (Math.sin(e * 14) > 0 ? 0.7 : 0.1) : 0; this.o.eyes = e > 0.8 ? 'happy' : 'open'; this.setAct('eat', e > 0.6 && e < 1.9 ? 1 : 0.5); if (e > 0.5 && !bit) { bit = true; Items.eat(it); Game.sfx('munch', this.x, 0.6); } }
        this.emote('heart');
        this.stay += 20;
      }
      const more = Items.nearest(this.x, 220, (q) => q.kind === 'fruit' && !q.eaten && q.state !== 'fly');
      if (more) { yield* this.eat(more); return; }
      const m = mk();
      if (m && Math.abs(m.x - this.x) < 170 && !this.shared) yield* this.share(m);
    }
    *share(m) {
      this.shared = true;
      this.emote('bulb', 1);
      yield* this.walkTo(m.x + (this.x < m.x ? -44 : 44), 40, { act: 'walk' });
      yield* this.faceTo(m.x > this.x ? 1 : -1, false);
      let e = 0;
      while (e < 3.6) { const dt = yield; e += dt; const k = Math.min(1, e / 0.8); this.o.neck = -0.55 * k; this.o.hold = e > 0.6 ? 1 : 0; this.o.eyes = 'happy'; this.setAct('share', e > 0.9 && e < 3.2 ? 1 : 0.6); }
      m.emote('heart', 1.4); m.happyT = 1;
      Save.addItem('berry', 1);
      HUD.toast('Tropius shared its fruit with you! (+1 berry)', { life: 2.6 });
    }
    onPoke() { this.emote('note'); Game.sfx('grr', this.x, 0.3); this.doTask(hold(this, 1.2, 'walk', 0.5), 2); }
    onWater() { this.emote('sweat'); this.stay = Math.min(this.stay, 1); }
  }

  /* ================= area logic ================= */
  function spawn(A, G, S0) {
    S = S0; A0 = A; G0 = G;
    Object.assign(S, { stillT: 0, lastHum: -99, humX: -999, duetT: -99, hinted: false, seq: [], chimeT: -9, gust: 0, feeder: { full: false, phase: 'empty', t: 0, scared: false, robber: null }, choir: null, show: 0, music: 0, altaria: null, tropius: null, tropT: rnd(25, 45), tropSeen: false, basketT: -99, lookHint: false, flash: 0 });
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Swablu')) [[250, 543], [858, 373], [2040, 543], [1640, 543]].forEach((p, i) => add(new SwabluM(i, GEO.perches.find((q) => q[0] === p[0] && q[1] === p[1]) || p)));
    if (sp('Chatot')) add(new ChatotM(GEO.STAGE_PERCH[0]));
    if (sp('Taillow')) { add(new TaillowM(0, GEO.NEST)); add(new TaillowM(1, GEO.perches[8])); }
    if (sp('Kecleon')) add(new KecleonM((GEO.LEAVES.x0 + GEO.LEAVES.x1) / 2));
    if (sp('Altaria') && (chance(0.3) || hourIs('dusk'))) S.altaria = add(new AltariaM(rnd(600, 2800), rnd(330, 400)));
  }
  function callAltaria(x, why) {
    if (!sp('Altaria')) return null;
    if (S.altaria && S.altaria.alive) { S.altaria.leaving = false; S.altaria.stay = Math.max(S.altaria.stay, 60); return S.altaria; }
    const a = G0.addMon(new AltariaM(clamp(x + (chance(0.5) ? -320 : 320), 100, GEO.W - 60), 260));
    S.altaria = a;
    if (why) HUD.toast(why, { life: 2.8 });
    return a;
  }
  function update(A, dt, t, G) {
    const m = G.mudkip;
    // Mudkip standing still (for Swablu's grooming)
    if (m && m.mode === 'land' && !m.target && Math.abs(m.vx || 0) < 2 && !(m.air > 0)) S.stillT += dt; else S.stillT = 0;
    S.music = Math.max(0, S.music - dt);
    // Tropius drops by in daylight now and then
    if (sp('Tropius') && !S.tropius && !hourIs('night', 'dusk')) { S.tropT -= dt; if (S.tropT <= 0) { S.tropT = rnd(90, 140); const tr = S.tropius = G.addMon(new TropiusM(3200)); tr.doTask(tr.arrive(), 5); } }
    // the feeder: a hung berry draws a thief first
    const F = S.feeder;
    if (F.full) {
      F.t += dt;
      if (F.phase === 'wait' && F.t > 2.5) {
        const th = Mons.all.filter((q) => q.kind === 'taillow' && q.alive && !q.busy(4)).sort((a, b) => Math.abs(a.x - GEO.FEEDER) - Math.abs(b.x - GEO.FEEDER))[0];
        if (th) { F.phase = 'thief'; F.robber = th; th.doTask(th.rob(), 4); }
        else F.phase = 'birds';
      }
      if (F.phase === 'thief' && F.scared) { F.phase = 'birds'; F.t = 0; HUD.toast('The Taillow flees! The feeder is safe...', { life: 2.2 }); }
      if (F.phase === 'thief' && F.robber && (!F.robber.alive || (!F.robber.busy(4) && F.full && F.t > 25))) F.phase = 'birds';
      if (F.phase === 'birds') {
        F.phase = 'feast'; F.t = 0;
        const sw = Mons.all.filter((q) => q.kind === 'swablu' && q.alive).sort((a, b) => Math.abs(a.x - GEO.FEEDER) - Math.abs(b.x - GEO.FEEDER)).slice(0, 3);
        sw.forEach((s, i) => { s.sleeping = false; s.doTask(s.feast(GEO.FEED_PERCH[i]), 4); });
        if (sw.length) HUD.toast('Swablu flutter down to the feeder!', { life: 2.2 });
      }
      if (F.phase === 'feast' && F.t > 6) {
        if (Save.discover('canopy.feeder')) HUD.toast('The Swablu flock is feasting and humming together!', { life: 2.8 });
        if (F.t > 11) { F.full = false; F.phase = 'empty'; A.feeder.frames = [A.feederSpr[0]]; }
      }
    }
    // the choir at the lookout
    if (S.choir) { S.choir.t -= dt; if (S.choir.t <= 0) S.choir = null; }
    if (S.gust > 0) {
      S.gust -= dt;
      if (Math.random() < dt * 30) FX.add({ type: 'drop', x: Game.cam.x + rnd(-40, Game.VW), y: Game.cam.y + rnd(0, Game.VH * 0.7), vx: rnd(120, 220), vy: rnd(-20, 30), g: 20, life: 2.4, c: hex('#56a848'), c2: hex('#8ccc60'), size: 2, layer: 4 });
    }
    // chimes sway back to rest
    for (const c of A.chimes || []) { c.swing = approach(c.swing || 0, 0, dt * 0.8); c.frames = [c.sprs[clamp(Math.round(1 + Math.sin(t * 9 + c.x) * c.swing * 1.4), 0, 2)]]; }
    S.flash = Math.max(0, S.flash - dt * 1.5);
  }
  // Kecleon's giveaway: leaves stirring with no wind
  function rustle(x) {
    for (const p of A0.props) if (p.leafy && Math.abs(p.x - x) < 26) p.shake = 0.6;
    leafFall(x, gy(x) - 16, 3);
    Game.sfx('rustle', x, 0.45);
  }
  function chime(A, i) {
    const c = A.chimes[i];
    c.swing = 1; c.shake = 0.3;
    Game.sfx(['bongo', 'chime', 'twinkle'][i] || 'chime', c.x, 0.7);
    const [cx, cy] = GEO.CHIME_TOP(i);
    FX.add({ type: 'icon', icon: 'note', x: cx, y: cy + 4, vx: rnd(-8, 8), vy: -20, life: 1.2, layer: 3 });
    FX.sparkles(cx, cy + 22, 4, 10, 0xffffffff, hex(['#ffd08a', '#bfe8ff', '#ffc8f0'][i]));
    for (const m of Mons.all) if (m.kind === 'chatot' && Math.abs(m.x - c.x) < 1600 && !m.busy(3)) m.doTask(m.beat(1.6), 2);
    S.music = 3;
    if (Game.t - S.chimeT > 6) S.seq = [];
    S.chimeT = Game.t;
    S.seq.push(i);
    if (S.seq.length > 3) S.seq.shift();
    if (S.seq.length === 3 && S.seq.every((v, k) => v === CHIME_ORDER[k])) { S.seq = []; gust(); }
  }
  function gust() {
    S.gust = 6; Wind.boost = 1.6;
    Game.sfx('whoosh', null, 1); Game.shake(1.2);
    HUD.toast('The chimes sing in harmony... a great gust sweeps through the canopy!', { life: 3 });
    for (const m of Mons.all) {
      if (m.kind === 'swablu' || m.kind === 'taillow' || m.kind === 'chatot') { m.sleeping = false; m.abort = true; m.doTask((function* (s) { yield* s.takeOff(-60); yield* s.circle(clamp(s.x, 300, GEO.W - 300), 400, rnd(80, 160), rnd(4, 6), s.kind === 'swablu' ? 'hum' : 'fly'); })(m), 3); }
    }
    const a = callAltaria(mk().x, Save.found('canopy.chimes') ? null : 'Something big rides in on the wind...');
    if (a) a.doTask((function* (s) { s.mode = 'fly'; s.perchAt = null; yield* s.flyTo(mk().x + 60, 420, 80, { act: 'fly' }); yield* s.sing(4); })(a), 4);
    Save.discover('canopy.chimes');
  }
  function feeder(A) {
    const F = S.feeder;
    if (F.full) { HUD.toast('A berry is already hanging in the feeder.', { life: 1.6 }); return; }
    if (!Save.useItem('berry')) { HUD.toast('The bird feeder is empty. A berry would fit nicely...', { life: 2.2 }); return; }
    Object.assign(F, { full: true, phase: 'wait', t: 0, scared: false, robber: null });
    A.feeder.frames = [A.feederSpr[1]]; A.feeder.shake = 0.4;
    Game.sfx('pat', GEO.FEEDER, 0.6);
    HUD.toast('You hang a berry in the bird feeder.', { life: 1.8 });
  }
  function basket(A) {
    if (Game.t - S.basketT < 25) { HUD.toast('The fruit basket is empty for now.', { life: 1.6 }); return; }
    S.basketT = Game.t; A.basket.shake = 0.8;
    Game.sfx('rustle', GEO.BASKET, 0.8);
    for (let i = 0; i < 2; i++) Items.drop(GEO.BASKET + rnd(-8, 8), gy(GEO.BASKET) - 18, 'fruit');
    HUD.toast(S.tropius ? 'Fruit rolls out of the basket!' : 'Fruit rolls out of the basket... Tropius love this fruit.', { life: 2 });
  }
  function song(x) {
    S.music = 6;
    // on the stage: Chatot performs and the birds gather to listen
    if (x > GEO.STAGE.x0 - 10 && x < GEO.STAGE.x1 + 10 && !S.show) {
      S.show = 1;
      const ch = Mons.all.find((q) => q.kind === 'chatot' && q.alive);
      if (ch) { ch.abort = true; ch.doTask(ch.perform(), 5); }
      const aud = [[2700, 543], [2745, 497], [3140, 543], [2662, 538]];
      Mons.all.filter((q) => q.kind === 'swablu' && q.alive).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).slice(0, 3).forEach((s, i) => { s.sleeping = false; s.doTask(s.sitAndSing(aud[i] || GEO.STAGE_PERCH[1 + (i % 2)], 12, i === 0 ? 'hum' : 'perch', Math.max(90, Math.abs(s.x - x) / 5)), 4); });
      if (Save.discover('canopy.stage')) HUD.toast('Chatot takes the stage — and the birds gather to listen!', { life: 3 });
      else HUD.toast('An encore on the treetop stage!', { life: 2 });
    }
    // at the lookout at dusk: the Altaria choir
    if (x > GEO.LOOKOUT.x0 - 20) {
      if (hourIs('dusk')) {
        if (!S.choir) {
          S.choir = { t: 26 };
          const a = callAltaria(x, null);
          if (a) { a.abort = true; a.doTask((function* (s) { yield* s.land(GEO.LOOK_PERCH[0], Math.max(120, Math.abs(s.x - GEO.LOOKOUT.x) / 5)); yield* s.sing(7); yield* s.sing(7); yield* s.sing(5); })(a), 5); }
          Mons.all.filter((q) => q.kind === 'swablu' && q.alive).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).slice(0, 3).forEach((s, i) => { s.sleeping = false; s.doTask(s.sitAndSing(GEO.LOOK_PERCH[1 + i], 18, 'hum', Math.max(110, Math.abs(s.x - x) / 5)), 5); });
          if (Save.discover('canopy.choir')) HUD.toast('The sunset song carries over the canopy... an Altaria choir answers!', { life: 3.4 });
          else HUD.toast('The Altaria choir sings with you!', { life: 2.4 });
        }
      } else if (!S.lookHint) { S.lookHint = true; HUD.toast('What a view! They say the birds up here sing loudest at dusk...', { life: 3 }); }
    }
  }
  function water(tx, ty) {
    // spraying near the feeder while a thief circles it
    const F = S.feeder;
    if (F.full && F.phase === 'thief' && F.robber && Math.hypot(F.robber.x - tx, F.robber.y - ty) < 60) F.robber.onWater();
  }
  function onScan(A) {
    let n = 0;
    const mx = mk().x, near = (x) => Math.abs(x - mx) < Game.VW * 0.7;
    if (near(GEO.CHIMES[1])) { HUD.toast(S.hinted ? 'Scan: wind chimes. Chatot\'s tune went low, high, middle...' : 'Scan: three wind chimes, low, middle and high. Chatot on the stage seems to know a tune...', { life: 3 }); n++; }
    if (near(GEO.FEEDER) && !S.feeder.full) { FX.sparkles(GEO.FEEDER, gy(GEO.FEEDER) - 44, 6, 12, 0xffffffff, hex('#9ad0ff')); HUD.toast('Scan: an empty bird feeder. Swablu love berries... so do thieves.', { life: 2.8 }); n++; }
    if (near(GEO.STAGE.x)) { HUD.toast('Scan: a little treetop stage, waiting for music.', { life: 2.4 }); n++; }
    if (near(GEO.LOOKOUT.x)) { HUD.toast('Scan: the lookout faces the sunset. A song here at dusk carries far...', { life: 2.8 }); n++; }
    if (near(GEO.NEST[0])) { HUD.toast('Scan: a Taillow nest. Don\'t point the camera at it too long!', { life: 2.4 }); n++; }
    return n;
  }
  function post(A, fb, cx, cy, t) {
    if (S.flash > 0.01) { const d = fb.d, N = d.length, k = Math.round(S.flash * 200); for (let i = 0; i < N; i++) d[i] = U.mixk(d[i], 0xffffffff, k); }
  }
  function photoBonus(A, crop, subs, main) {
    if (S.choir && subs.some((s) => s.sp === 'altaria')) return { pts: 700, name: 'Treetop choir' };
    if (Game.t - S.duetT < 1.5 && subs.some((s) => s.sp === 'altaria') && subs.some((s) => s.sp === 'swablu')) return { pts: 500, name: 'Cloud duet' };
    if (S.show && subs.some((s) => s.sp === 'chatot')) return { pts: 400, name: 'Treetop stage' };
    if (S.feeder.phase === 'feast' && subs.filter((s) => s.sp === 'swablu').length >= 2) return { pts: 400, name: 'Feeder party' };
    if (S.gust > 0) return { pts: 300, name: 'Wind in the canopy' };
    if (hourIs('night', 'dusk')) return { pts: 150, name: 'Lantern light' };
    return null;
  }
  return { GEO, spawn, update, chime, feeder, basket, song, water, onScan, post, photoBonus, rustle, get S() { return S; }, classes: { SwabluM, AltariaM, ChatotM, TaillowM, KecleonM, TropiusM } };
})();
