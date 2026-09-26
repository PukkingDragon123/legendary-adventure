/* ------------------------------------------------------------------
   Friends — Spheal, Sealeo, Walrein, Corphish and Pelipper, with the
   little games they play with Mudkip and each other.
------------------------------------------------------------------- */
const Friends = (() => {
  const { clamp, lerp } = Scenery;
  const { Mon, Nuts, wait, until, rnd, pick, chance, gy, sy, wet, approach } = Life;
  const TAU = Math.PI * 2;
  const SP = {
    Spheal: typeof Spheal !== 'undefined' ? Spheal : null, Sealeo: typeof Sealeo !== 'undefined' ? Sealeo : null,
    Walrein: typeof Walrein !== 'undefined' ? Walrein : null, Corphish: typeof Corphish !== 'undefined' ? Corphish : null,
    Pelipper: typeof Pelipper !== 'undefined' ? Pelipper : null,
  };
  const sp = (name) => SP[name];
  const mudkip = () => Game.mudkip;

  function rockTop(r, x) {
    const col = clamp(Math.round(x - r.x0), 0, r.spr.w - 1);
    for (let y = 0; y < r.spr.h; y++) if (r.spr.get(col, y)) return r.y0 + y;
    return r.y0 + r.spr.h;
  }
  // arc velocity that lands at (tx, ty) after T seconds under gravity g
  const lob = (x, y, tx, ty, T, g = 560) => [(tx - x) / T, (ty - y - 0.5 * g * T * T) / T];

  /* ================================================================
     SPHEAL — rolls, claps, bounces the ball back to Mudkip
  ================================================================ */
  class SphealMon extends Mon {
    constructor(o) {
      super(sp('Spheal'), { kind: 'spheal', x: o.x, y: gy(o.x), yaw: Math.PI - 1.1, z: 2.2, scale: 0.5, qPose: 0.05, qFields: { roll: 0.2, clap: 0.2, mouth: 0.25, squash: 0.03 } });
      this.roll = 0; this.sq = new Spring(220, 10); this.happyT = 0; this.floatT = 0;
    }
    headPt() { return this.at('top', 0, -4); }
    holdPt() { return this.at('nose', 0, -8); }
    physics(dt, t) {
      if (this.mode === 'swim') {
        this.y = lerp(this.y, sy(this.x) + 54 + Math.sin(t * 2 + this.seed) * 2, Math.min(1, dt * 5));
        if (!wet(this.x, 40)) this.mode = 'land';
      } else {
        if (wet(this.x, 40)) { this.mode = 'swim'; FX.splashAt(this.x, sy(this.x), { power: 0.6 }); Game.sfx('splash', this.x, 0.6); }
        if (this.air > 0 || this.vair !== 0) {
          this.vair -= 900 * dt; this.air += this.vair * dt;
          if (this.air <= 0) { this.air = 0; if (this.vair < -120) { this.sq.kick(0.8); Game.sfx('pat', this.x, 0.5); } this.vair = 0; }
        }
        this.y = gy(this.x) - this.air;
      }
      this.x = clamp(this.x, 60, 1500);
    }
    animate(dt, t) {
      const P = {};
      P.roll = this.roll;
      P.squash = this.sq.step(dt) * 0.5 + Math.sin(t * 2.1 + this.seed) * 0.02;
      P.clap = 0; P.mouth = 0.25; P.headPitch = 0; P.tailWag = Math.sin(t * 3 + this.seed) * 0.4;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      if (this.sleeping) { P.eyes = 'closed'; P.mouth = 0; P.squash = Math.sin(t * 1.2) * 0.04; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    *rollTo(tx, speed = 70) {
      tx = clamp(tx, 80, 1450);
      for (let g = 0; g < 3000; g++) {
        const dt = yield;
        const dx = tx - this.x;
        if (Math.abs(dx) < 3) break;
        const d = Math.sign(dx);
        this.turn(this.face(d, false), dt, 6);
        const step = d * Math.min(Math.abs(dx), speed * dt);
        this.x += step;
        this.roll += Math.abs(step) / 58;
        this.moving = speed;
      }
      // settle upright (nearest full turn)
      const target = Math.round(this.roll / TAU) * TAU;
      for (let g = 0; g < 200 && Math.abs(this.roll - target) > 0.02; g++) { const dt = yield; this.roll = approach(this.roll, target, dt * 4); }
      this.roll = target;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 1.5));
      for (;;) {
        if (Game.hour() === 'night') { yield* this.sleep(); continue; }
        const r = Math.random();
        const m = mudkip();
        if (m && m.mode === 'land' && Math.abs(m.x - this.x) > 360 && r < 0.35) yield* this.rollTo(m.x + (m.x < this.x ? 200 : -200));
        else if (r < 0.55) yield* this.clapAbout();
        else if (r < 0.8) yield* this.rollTo(this.x + rnd(-260, 260));
        else if (r < 0.92) yield* this.floatTrip();
        else { let e = 0; const T = rnd(1.5, 3); while (e < T) { const dt = yield; e += dt; this.o.headPitch = Math.sin(e * 2) * 0.1; } }
        yield* wait(rnd(0.3, 1.2));
      }
    }
    *clapAbout() {
      yield* this.faceTo(mudkip() && mudkip().x < this.x ? -1 : 1);
      let e = 0, n = 0;
      const T = rnd(1.2, 2.4);
      while (e < T) {
        const dt = yield; e += dt;
        const c = Math.abs(Math.sin(e * 9));
        this.o.clap = c; this.o.eyes = 'happy'; this.o.mouth = 1;
        if (Math.floor(e * 9 / Math.PI) > n) { n++; Game.sfx('clap', this.x, 0.6); }
      }
      if (chance(0.5)) { Game.sfx('spheal', this.x, 0.8); FX.emote(pick(['note', 'music2', 'heart']), () => this.headPt()); }
    }
    *floatTrip() {
      yield* this.rollTo(World.shoreX + 150, 80);
      let e = 0;
      while (e < rnd(3, 5)) { const dt = yield; e += dt; this.o.eyes = 'happy'; this.o.mouth = 0.6; this.roll = Math.sin(e * 1.5) * 0.25; }
      this.roll = 0;
      yield* this.rollTo(World.shoreX - rnd(150, 300), 70);
    }
    *sleep() {
      yield* this.rollTo(clamp(this.x, 700, 1000), 50);
      this.sleeping = true;
      while (Game.hour() === 'night') yield;
      this.sleeping = false;
      this.happyT = 1;
    }
    onBall(b) {
      // bump it back toward Mudkip (or a friend) with the belly
      if (b.lastTouch === this && b.touchT < 0.5) return true;
      const m = mudkip();
      let tx = m && m.mode === 'land' && Math.abs(m.x - this.x) < 700 ? m.x + (m.x < this.x ? 20 : -20) : this.x + (chance(0.5) ? -1 : 1) * rnd(120, 220);
      tx = clamp(tx, 100, World.shoreX - 20);
      const [vx, vy] = lob(b.x, b.y, tx, gy(tx) - 50, 1.15);
      b.kick(vx, vy, this);
      this.sq.kick(0.7); this.happyT = 0.8;
      Game.sfx('boing', b.x, 0.9);
      if (chance(0.4)) Game.sfx('spheal', this.x, 0.7);
      FX.add({ type: 'burst', x: b.x, y: b.y + 4, r: 6, life: 0.2, layer: 3 });
      return true;
    }
    onPoke() {
      this.doTask((function* (s) {
        Game.sfx('spheal', s.x, 1); s.happyT = 1.4; s.sq.kick(0.9);
        FX.emote(pick(['heart', 'note', 'star']), () => s.headPt());
        s.vair = 200; s.air = 0.5;
        yield* until(() => s.air <= 0, 2);
        if (chance(0.6)) yield* s.rollTo(s.x + (chance(0.5) ? 1 : -1) * rnd(90, 160), 110);
        else yield* s.clapAbout();
      })(this), 2);
    }
    onBonk() { this.sq.kick(1); this.happyT = 0; FX.add({ type: 'dizzy', x: 0, y: 0, at: () => this.at('top', 0, -6), rx: 16, life: 1.6, layer: 3 }); this.doTask((function* (s) { let e = 0; while (e < 1.6) { const dt = yield; e += dt; s.o.eyes = 'dizzy'; s.o.mouth = 0.4; } })(this), 3); }
    greet() { this.happyT = 1.2; Game.sfx('spheal', this.x, 0.8); this.emote('heart'); }
    newHour(h) {
      if (h !== 'night') this.sleeping = false;
      if (h !== 'night' && this.mode === 'land') this.doTask((function* (s) { yield* wait(0.8); FX.emote('sparkle', () => s.headPt()); yield* s.clapAbout(); })(this), 2);
    }
  }

  /* ================================================================
     SEALEO — juggles things on its nose on the pier
  ================================================================ */
  class SealeoMon extends Mon {
    constructor(o) {
      super(sp('Sealeo'), { kind: 'sealeo', x: o.x, y: World.PIER.deck, yaw: Math.PI - 1.05, z: 1.6, scale: 0.55, qPose: 0.05, qFields: { headPitch: 0.06, clap: 0.2, flipper: 0.2, mouth: 0.25 } });
      this.item = null; this.happyT = 0; this.sq = new Spring(240, 11);
    }
    headPt() { return this.at('top', 0, -4); }
    holdPt(obj) {
      const n = this.at('nose');
      const r = obj && obj.R ? obj.R : 7;
      const wob = Math.sin(Game.t * 5) * 2;
      return [n[0] + wob, n[1] - r + 1];
    }
    physics(dt) { this.y = World.PIER.deck; this.x = clamp(this.x, World.PIER.x0 + 80, World.PIER.x1 - 60); }
    animate(dt, t) {
      const P = {};
      P.squash = this.sq.step(dt) * 0.5 + Math.sin(t * 1.8 + this.seed) * 0.015;
      P.headPitch = 0.05; P.headYaw = 0; P.mouth = 0.2; P.flipper = 0; P.clap = 0; P.tailWag = Math.sin(t * 2.2) * 0.3; P.lean = 0;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.item) { P.headPitch = 0.62 + Math.sin(t * 5) * 0.05; P.flipper = 0.4 + Math.sin(t * 3) * 0.2; P.eyes = 'happy'; }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      if (this.sleeping) { P.eyes = 'closed'; P.headPitch = -0.15; P.mouth = 0; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    catchIt(obj) {
      if (this.item) return false;
      this.item = obj;
      if (obj.kind === 'ball') { obj.holder = this; obj.vx = obj.vy = 0; }
      else { obj.state = 'held'; obj.holder = this; }
      Game.sfx('boing', this.x, 0.7);
      this.doTask(this.juggle(), 3);
      return true;
    }
    *juggle() {
      this.happyT = 0.6;
      Game.sfx('bark', this.x, 0.7);
      let e = 0;
      const T = rnd(3.5, 6);
      while (e < T && this.item) {
        const dt = yield; e += dt;
        if (Math.random() < dt * 0.8) FX.floatIcon(pick(['note', 'music2']), this.x + rnd(-20, 20), this.y - 200);
      }
      if (!this.item) return;
      // flick it back to the beach (toward Mudkip if possible)
      const obj = this.item;
      this.item = null;
      const m = mudkip();
      const tx = m && m.mode === 'land' ? clamp(m.x, 500, World.shoreX - 40) : rnd(700, 1050);
      this.o.headPitch = 0.9;
      yield* wait(0.08);
      const p = this.holdPt(obj);
      const [vx, vy] = lob(p[0], p[1], tx, gy(tx) - 40, 1.6);
      if (obj.kind === 'ball') { obj.holder = null; obj.x = p[0]; obj.y = p[1]; obj.kick(vx, vy, this); }
      else { obj.holder = null; obj.state = 'fall'; obj.x = p[0]; obj.y = p[1]; obj.vx = vx; obj.vy = vy; }
      Game.sfx('boing', this.x, 0.8);
      this.happyT = 1;
      yield* this.clap(1.2);
    }
    *clap(T = 1.4) {
      let e = 0, n = 0;
      while (e < T) {
        const dt = yield; e += dt;
        this.o.clap = Math.abs(Math.sin(e * 8)); this.o.eyes = 'happy'; this.o.mouth = 0.8;
        if (Math.floor((e * 8) / Math.PI) > n) { n++; Game.sfx('clap', this.x, 0.5); }
      }
    }
    dropBall() { if (this.item && this.item.kind === 'ball') { this.item.holder = null; this.item = null; } }
    dropNut() { if (this.item && this.item.kind !== 'ball') { this.item.holder = null; this.item.state = 'fall'; this.item.vy = -80; this.item = null; } }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (Game.hour() === 'night') { this.sleeping = true; while (Game.hour() === 'night') yield; this.sleeping = false; }
        const r = Math.random();
        if (r < 0.3) yield* this.clap(rnd(1, 2));
        else if (r < 0.55) {
          // belly-scoot along the pier
          const tx = clamp(this.x + rnd(-200, 200), World.PIER.x0 + 80, World.PIER.x1 - 60);
          const d = Math.sign(tx - this.x);
          yield* this.faceTo(d, true);
          while (Math.abs(tx - this.x) > 3) {
            const dt = yield;
            this.x += d * Math.min(Math.abs(tx - this.x), 40 * dt);
            this.o.lean = 0.1; this.o.flipper = Math.abs(Math.sin(Game.t * 6)) * 0.6; this.moving = 40;
            this.o.squash = Math.abs(Math.sin(Game.t * 6)) * 0.05;
          }
        } else if (r < 0.75) {
          Game.sfx('bark', this.x, 0.7); this.happyT = 0.8;
          let e = 0; while (e < 1) { const dt = yield; e += dt; this.o.headPitch = 0.35; this.o.mouth = Math.abs(Math.sin(e * 10)); }
        } else {
          let e = 0; const T = rnd(1.5, 3); while (e < T) { const dt = yield; e += dt; this.o.headYaw = Math.sin(e * 1.4) * 0.4; }
        }
        yield* wait(rnd(0.5, 1.5));
      }
    }
    onBall(b) {
      const n = this.at('nose');
      if (!this.item && b.vy > 0 && b.y < n[1] && Math.abs(b.x - n[0]) < 26) return this.catchIt(b);
      return false;
    }
    catchNut(c) {
      if (this.item || this.sleeping || c.cracked) return false;
      const n = this.at('nose');
      if (Math.abs(c.x - n[0]) < 18 && c.y < n[1] && c.y > n[1] - 26) { c.vx = c.vy = 0; return this.catchIt(c); }
      return false;
    }
    onPoke() {
      const had = this.item;
      if (had) { if (had.kind === 'ball') this.dropBall(); else this.dropNut(); if (had.kind === 'ball') had.kick(rnd(-60, 60), -120, this); }
      this.doTask((function* (s) {
        s.sq.kick(0.8); Game.sfx('bark', s.x, 1);
        FX.emote(had ? 'sweat' : pick(['heart', 'note']), () => s.headPt());
        yield* s.clap(1.2);
      })(this), 2);
    }
    onBonk(c) { this.happyT = 0; FX.add({ type: 'dizzy', x: 0, y: 0, at: () => this.at('top', 0, -6), rx: 16, life: 1.4, layer: 3 }); }
    pierKnock(x) { if (Math.abs(x - this.x) < 200) { this.sq.kick(0.5); FX.emote('shock', () => this.headPt(), { life: 0.8 }); } }
    newHour(h) { if (h !== 'night' && !this.item) this.doTask((function* (s) { yield* wait(1); Game.sfx('bark', s.x, 0.6); yield* s.clap(1.4); })(this), 2); }
    greet() { this.happyT = 1; Game.sfx('bark', this.x, 0.7); this.emote('heart'); }
  }

  /* ================================================================
     WALREIN — the boss of the rock: roars, smashes coconuts
  ================================================================ */
  class WalreinMon extends Mon {
    constructor(o) {
      const r = Scene.S.walreinRock;
      const x = r.x0 + r.spr.w * 0.5;
      super(sp('Walrein'), { kind: 'walrein', x, y: rockTop(r, x) + 6, yaw: Math.PI - 0.95, z: 1.2, scale: 0.55, qPose: 0.05, qFields: { headPitch: 0.06, mouth: 0.2, squash: 0.02, flipper: 0.2 }, solid: true });
      this.rock = r; this.roarT = 0; this.sq = new Spring(200, 10); this.happyT = 0; this.angry = 0;
      this.roarAt = rnd(25, 45);
    }
    headPt() { return this.at('top', 0, -4); }
    physics(dt, t) { const r = this.rock; this.x = r.x0 + r.spr.w * 0.5; this.y = rockTop(r, this.x) + 6 + (r.shake > 0 ? Math.round(Math.sin(r.shake * 60)) : 0); }
    animate(dt, t) {
      const P = {};
      P.squash = Math.sin(t * (this.sleeping ? 0.9 : 1.4)) * 0.025 + this.sq.step(dt) * 0.4;
      P.headPitch = 0; P.mouth = 0; P.flipper = 0; P.headYaw = 0;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.angry > 0) { this.angry -= dt; P.eyes = 'angry'; }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; }
      if (this.sleeping) { P.eyes = 'closed'; P.headPitch = -0.12; P.mouth = 0.1; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (Game.hour() === 'night') { yield* this.sleep(); continue; }
        // coconut in reach? smash it
        const nut = Nuts.near(this.x - 60, 150, (c) => !c.cracked && (c.state === 'float' || c.state === 'ground') && Math.abs(c.x - (this.x - 70)) < 120);
        if (nut) { yield* this.smash(nut); continue; }
        if (Game.t > this.roarAt) { this.roarAt = Game.t + rnd(35, 60); yield* this.roar(); continue; }
        const r = Math.random();
        if (r < 0.3) { let e = 0; const T = rnd(1.5, 3); while (e < T) { const dt = yield; e += dt; this.o.headYaw = Math.sin(e * 1.2) * 0.35; } }
        else if (r < 0.4) { let e = 0; while (e < 2) { const dt = yield; e += dt; const k = Math.sin(Math.min(1, e / 1.8) * Math.PI); this.o.mouth = k; this.o.headPitch = k * 0.3; this.o.eyes = 'closed'; } }
        yield* wait(0.5);
      }
    }
    *sleep() {
      this.sleeping = true;
      let bub = null, tt = 0;
      while (Game.hour() === 'night' && this.sleeping) {
        const dt = yield; tt += dt;
        if (!bub) bub = FX.add({ type: 'fn', x: 0, y: 0, life: 1e9, layer: 3, draw: (fb, p, k, cx, cy) => { const m = this.at('mouth', -6, -10); Life.snotBubble(fb, { at: () => m, dir: -1 }, tt * 0.7, cx, cy); } });
      }
      if (bub) bub.life = 0;
      this.sleeping = false;
    }
    *roar() {
      this.sq.kick(0.6);
      let e = 0, rings = 0;
      Game.sfx('roar', this.x, 1);
      while (e < 1.6) {
        const dt = yield; e += dt;
        const k = Math.min(1, e / 0.35) * (e > 1.3 ? Math.max(0, 1 - (e - 1.3) / 0.3) : 1);
        this.o.headPitch = 0.62 * k; this.o.mouth = k; this.o.eyes = 'angry';
        if (e > 0.3 && e < 1.3 && e * 5 > rings) {
          rings++;
          const m = this.at('mouth');
          FX.add({ type: 'ring', x: m[0], y: m[1], r0: 8, r1: 90, flat: 0.8, life: 0.7, c: PX.hex('#ffffff'), layer: 3 });
          Game.shake(3);
        }
      }
      // the roar rattles the palms
      for (const p of Scene.S.palms) { p.shake = Math.max(p.shake, 0.7); if (chance(0.35)) Nuts.shakePalm(p, 1); }
      for (const m of Game.mons) if (m !== this && m.kind === 'mudkip' && m.mode === 'land' && !m.sleeping) { FX.emote('shock', () => m.headPt(), { life: 0.9 }); m.vair = 220; m.air = 0.5; }
    }
    *smash(c) {
      c.claim = this;
      let e = 0;
      while (e < 0.5) { const dt = yield; e += dt; this.o.headPitch = 0.55 * Math.min(1, e / 0.4); this.o.eyes = 'angry'; }
      e = 0;
      while (e < 0.12) { const dt = yield; e += dt; this.o.headPitch = 0.55 - (e / 0.12) * 0.8; }
      const tk = this.at('tusk');
      c.x = clamp(tk[0], this.x - 140, this.x); c.y = Math.min(c.y, tk[1] + 6);
      Nuts.crack(c, this);
      Game.shake(4);
      FX.bonk(c.x, c.y, 13);
      // flings the halves onto the beach
      c.state = 'fall'; c.claim = null;
      const tx = rnd(960, 1080);
      [c.vx, c.vy] = lob(c.x, c.y, tx, gy(tx) - 10, 1.1, 760);
      this.happyT = 1.2;
      yield* wait(0.5);
      Game.sfx('roar', this.x, 0.4);
    }
    onPoke() {
      if (this.sleeping) { this.sleeping = false; this.angry = 1.5; FX.emote('anger', () => this.headPt()); }
      this.doTask((function* (w) {
        w.angry = 2;
        let e = 0;
        while (e < 0.4) { const dt = yield; e += dt; w.o.flipper = Math.sin((e / 0.4) * Math.PI); }
        Game.sfx('splash', w.x - 60, 0.7); FX.splashAt(w.x - 80, World.SEA, { power: 0.7 });
        yield* w.roar();
      })(this), 2);
    }
    onBonk(c) { this.angry = 2; FX.emote('anger', () => this.headPt()); c.claim = null; }
    onBall(b) { this.angry = 1; FX.emote('anger', () => this.headPt(), { life: 0.9 }); return false; }
    greet() { this.happyT = 1; Game.sfx('roar', this.x, 0.2); this.emote('note'); }
  }

  /* ================================================================
     CORPHISH — sideways scuttler, coconut cracker, tail pincher
  ================================================================ */
  class CorphishMon extends Mon {
    constructor(o) {
      super(sp('Corphish'), { kind: 'corphish', x: o.x, y: gy(o.x), yaw: 1.3, scale: 0.55, z: o.under ? 1.4 : 2.4, qPose: 0.05, qFields: { walk: 0.52, clawN: 0.25, clawF: 0.25, armN: 0.2, armF: 0.2, tilt: 0.05, squash: 0.03 } });
      this.underwater = !!o.under; this.min = o.min; this.max = o.max; this.angry = 0; this.happyT = 0; this.wantNut = null; this.sq = new Spring(260, 12);
    }
    headPt() { return this.at('top', 0, -4); }
    physics(dt) {
      if (this.air > 0 || this.vair !== 0) { this.vair -= 900 * dt; this.air += this.vair * dt; if (this.air <= 0) { this.air = 0; this.vair = 0; this.sq.kick(0.6); } }
      this.y = gy(this.x) - this.air;
    }
    animate(dt, t) {
      const P = {};
      if (this.moving) this.phase += dt * 12;
      P.walk = this.moving ? this.phase % TAU : 0;
      P.tilt = this.moving ? Math.sin(this.phase) * 0.08 : 0;
      P.clawN = 0.1 + Math.max(0, Math.sin(t * 1.3 + this.seed)) * 0.2; P.clawF = 0.1 + Math.max(0, Math.sin(t * 1.1 + this.seed + 2)) * 0.2;
      P.armN = 0; P.armF = 0; P.mouth = 0;
      P.squash = this.sq.step(dt) * 0.5;
      P.eyes = this.blink(t, dt) ? 'closed' : 'open';
      if (this.angry > 0) { this.angry -= dt; P.eyes = 'angry'; P.armN = 0.9; P.armF = 0.9; P.clawN = Math.abs(Math.sin(t * 14)); P.clawF = Math.abs(Math.cos(t * 14)); }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.armN = 0.8 + Math.sin(t * 10) * 0.2; P.armF = 0.8 - Math.sin(t * 10) * 0.2; P.mouth = 0.6; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    *scuttle(tx, speed = 45) {
      tx = clamp(tx, this.min, this.max);
      const d0 = Math.sign(tx - this.x);
      yield* this.walkTo(tx, speed, { sideways: true, yaw: (d) => (d > 0 ? 1.25 : Math.PI - 1.25), turn: 5, min: this.min, max: this.max });
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1.5));
      for (;;) {
        const m = mudkip();
        const nut = this.wantNut && this.wantNut.state === 'ground' && !this.wantNut.cracked ? this.wantNut : (!this.underwater ? Nuts.near(this.x, 420, (c) => c.state === 'ground' && !c.cracked && c.x > this.min && c.x < this.max && (!c.claim || c.claim.kind === 'mudkip')) : null);
        if (nut) { yield* this.crackNut(nut); this.wantNut = null; continue; }
        const r = Math.random();
        if (!this.underwater && m && m.mode === 'land' && !m.sleeping && Math.abs(m.x - this.x) < 260 && r < 0.18 && !m.busy(2)) { yield* this.pinch(m); continue; }
        if (r < 0.55) yield* this.scuttle(this.x + rnd(-160, 160), rnd(35, 55));
        else if (r < 0.75) {
          let e = 0, n = 0;
          while (e < 1.2) { const dt = yield; e += dt; this.o.clawN = Math.abs(Math.sin(e * 9)); this.o.armN = 0.5; if (Math.floor(e * 9 / Math.PI) > n) { n++; Game.sfx('snip', this.x, 0.3); } }
        } else if (r < 0.85 && this.underwater) {
          let e = 0; while (e < 1.5) { const dt = yield; e += dt; this.o.mouth = 0.4; if (Math.random() < dt * 6) FX.bubbles(...this.at('mouth'), 1, World.SEA); }
        } else yield* wait(rnd(0.8, 2));
        yield* wait(rnd(0.2, 0.8));
      }
    }
    *crackNut(c) {
      c.claim = c.claim || this;
      const side = this.x < c.x ? -1 : 1;
      yield* this.scuttle(c.x + side * 30, 60);
      if (c.state !== 'ground' || c.cracked) return;
      yield* this.faceTo(-side);
      // grip with both claws and squeeze — snip, snip, CRACK
      for (let k = 0; k < 3; k++) {
        let e = 0;
        while (e < 0.35) { const dt = yield; e += dt; this.o.armN = 0.55; this.o.armF = 0.55; this.o.clawN = 1 - e / 0.35; this.o.clawF = 1 - e / 0.35; this.o.eyes = 'angry'; }
        Game.sfx('snip', this.x, 0.8);
        FX.bonk(c.x, c.y - 4, 5);
        if (c.state !== 'ground') return;
      }
      Nuts.crack(c, this);
      this.happyT = 1.4;
      Game.sfx('crab', this.x, 0.8);
      c.claim = null;
      // share: eat a bit, leave the rest for Mudkip
      yield* wait(0.6);
      for (let k = 0; k < 2 && c.state === 'ground'; k++) { let e = 0; while (e < 0.35) { const dt = yield; e += dt; this.o.mouth = e < 0.17 ? 0.8 : 0.1; this.o.armN = 0.3; } Nuts.bite(c); }
      FX.emote('heart', () => this.headPt());
      const m = mudkip();
      if (m && m.mode === 'land' && !m.busy(2) && Math.abs(m.x - c.x) < 700) m.doTask(m.coconut(c), 1);
      yield* this.scuttle(this.x + side * 60, 50);
    }
    *pinch(m) {
      // sneak up to the tail side...
      const tailSide = -m.dir;
      yield* this.scuttle(m.x + tailSide * 34, 30);
      if (Math.abs(this.x - (m.x + tailSide * 34)) > 20 || m.mode !== 'land') return;
      let e = 0;
      while (e < 0.5) { const dt = yield; e += dt; this.o.armN = 0.7; this.o.clawN = 1; this.o.eyes = 'happy'; }
      this.o.clawN = 0;
      Game.sfx('snip', this.x, 1);
      FX.bonk(m.x + tailSide * 24, m.y - 16, 7);
      m.doTask((function* (mk) {
        mk.o.eyes = 'blink'; mk.vair = 300; mk.air = 0.5;
        Game.sfx('squeak', mk.x, 1);
        FX.emote('shock', () => mk.headPt(), { life: 0.8 });
        yield* until(() => mk.air <= 0, 2);
        FX.emote('tear', () => mk.headPt(), { life: 1 });
        yield* mk.walkTo(mk.x - tailSide * 150, 130);
        yield* mk.faceTo(tailSide);
        FX.emote('anger', () => mk.headPt(), { life: 1 });
        yield* wait(0.8);
      })(m), 3);
      this.happyT = 2;
      Game.sfx('crab', this.x, 0.9);
      FX.emote('note', () => this.headPt());
      yield* wait(1.2);
      yield* this.scuttle(this.x - tailSide * 120, 70);
    }
    onPoke() {
      this.angry = 2;
      FX.emote('anger', () => this.headPt());
      Game.sfx('snip', this.x, 1);
      this.doTask((function* (c) { c.vair = 150; c.air = 0.5; yield* wait(1); yield* c.scuttle(c.x + (Math.random() < 0.5 ? -1 : 1) * 90, 90); })(this), 2);
    }
    onBonk() { this.angry = 1.5; FX.add({ type: 'dizzy', x: 0, y: 0, at: () => this.at('top', 0, -4), rx: 12, life: 1.4, layer: 3 }); }
    onBall() { this.angry = 1.2; return false; }
    bubbleNear(x, y) { if (this.underwater && Math.hypot(x - this.x, y - this.y) < 120) { this.happyT = 0.8; } }
    newHour() { this.happyT = 1.5; }
    greet() { this.happyT = 1; Game.sfx('crab', this.x, 0.6); this.emote('heart'); }
  }

  /* ================================================================
     PELIPPER — flies, fishes, perches, carries things (and Mudkip)
  ================================================================ */
  class PelipperMon extends Mon {
    constructor(o) {
      super(sp('Pelipper'), { kind: 'pelipper', x: o.x, y: o.y, yaw: Math.PI - 1.0, scale: 0.65, z: 4, qPose: 0.05, qFields: { flap: 0.2, spread: 0.25, bill: 0.2, pitch: 0.1, feet: 0.34, pouch: 0.34 } });
      this.mode = 'perch'; this.layer = 'mid'; this.vx = 0; this.vy = 0; this.flapPh = 0; this.cargo = null; this.happyT = 0; this.perchX = o.x; this.perchY = o.y;
      this.shadow = false;
    }
    headPt() { return this.at('top', 0, -4); }
    holdPt(obj) {
      const p = this.at('pouch');
      return [p[0], p[1] + (obj && obj.kind === 'mudkip' ? 26 : obj && obj.R ? 2 : 0)];
    }
    physics(dt, t) {
      if (this.mode === 'fly') {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.layer = 'top';
      } else if (this.mode === 'swim') {
        this.y = lerp(this.y, sy(this.x) + 40, Math.min(1, dt * 5)); this.layer = 'mid';
      } else this.layer = 'mid';
      if (this.cargo && this.cargo.kind === 'mudkip') { const p = this.holdPt(this.cargo); this.cargo.x = p[0]; this.cargo.y = p[1] + 30; }
    }
    animate(dt, t) {
      const P = {};
      const fly = this.mode === 'fly';
      const speed = Math.hypot(this.vx, this.vy);
      if (fly) {
        const glide = this.vy > 30 && speed > 60;
        this.flapPh += dt * (glide ? 2 : 8.5);
        P.spread = 1; P.flap = glide ? 0.25 + Math.sin(this.flapPh) * 0.1 : Math.sin(this.flapPh);
        P.pitch = clamp(-this.vy / 260, -0.9, 0.6); P.feet = 1;
        const want = this.vx >= 0 ? 0.5 : Math.PI - 0.5;
        if (Math.abs(this.vx) > 12) this.turn(want, dt, 3);
      } else {
        P.spread = 0; P.flap = 0; P.pitch = 0; P.feet = 0;
      }
      P.bill = 0.12; P.pouch = this.cargo ? (this.cargo.kind === 'mudkip' ? 1 : 0.6) : 0;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; }
      if (this.sleeping) { P.eyes = 'closed'; P.bill = 0.05; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    // steer toward a point; resolves when close
    *flyTo(tx, ty, speed = 130, tol = 10) {
      this.mode = 'fly';
      for (let g = 0; g < 4000; g++) {
        const dt = yield;
        const target = typeof tx === 'function' ? tx() : [tx, ty];
        const dx = target[0] - this.x, dy = target[1] - this.y;
        const d = Math.hypot(dx, dy);
        if (d < tol) break;
        const sp2 = Math.min(speed, d * 2.2 + 20);
        const k = 1 - Math.exp(-dt * 2.4);
        this.vx += ((dx / d) * sp2 - this.vx) * k; this.vy += ((dy / d) * sp2 - this.vy) * k;
      }
    }
    *takeOff() {
      if (this.mode === 'fly') return;
      Game.sfx('whoosh', this.x, 0.7);
      if (this.mode === 'swim') FX.splashAt(this.x, sy(this.x), { power: 0.6 });
      this.mode = 'fly'; this.vy = -90; this.vx = this.dir * 40;
      yield* wait(0.4);
    }
    *land(x, y) {
      yield* this.flyTo(x, y - 30, 110, 8);
      yield* this.flyTo(x, y, 60, 3);
      this.mode = 'perch'; this.vx = this.vy = 0; this.x = x; this.y = y;
      Game.sfx('pat', x, 0.4);
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(2, 4));
      for (;;) {
        if (Game.hour() === 'night') { yield* this.roost(); continue; }
        const b = Game.ball, sealeo = Game.mons.find((m) => m.kind === 'sealeo');
        const walrein = Game.mons.find((m) => m.kind === 'walrein');
        const m = mudkip();
        const opts = [];
        if (b && !b.holder && b.rest > 1.5 && !wet(b.x, 6) && sealeo && !sealeo.item) opts.push([2.5, () => this.carryBall(b, sealeo)]);
        if (walrein && !walrein.sleeping) opts.push([1.8, () => this.carryNut(walrein)]);
        if (m && m.mode === 'land' && !m.busy(1) && !m.sleeping) opts.push([1.2, () => this.rideMudkip(m)]);
        opts.push([2, () => this.fish()]);
        opts.push([2, () => this.patrol()]);
        opts.push([1.2, () => this.perchAbout()]);
        let tot = opts.reduce((a, o) => a + o[0], 0), r = Math.random() * tot;
        for (const [w, f] of opts) { r -= w; if (r <= 0) { yield* f(); break; } }
        yield* wait(rnd(0.5, 1.5));
      }
    }
    *perchAbout() {
      if (this.mode !== 'perch') yield* this.land(this.perchX, this.perchY);
      let e = 0;
      const T = rnd(4, 8);
      while (e < T) {
        const dt = yield; e += dt;
        if (Math.random() < dt * 0.3) this.yaw = this.yaw > Math.PI / 2 ? 1.0 : Math.PI - 1.0;
        if (e > T * 0.6 && e < T * 0.6 + 0.8) { this.o.spread = 0.6; this.o.flap = Math.sin(e * 16) * 0.8; }
      }
    }
    *patrol() {
      yield* this.takeOff();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) yield* this.flyTo(rnd(300, 2500), rnd(170, 360), 140, 30);
      if (chance(0.5)) Game.sfx('squawk', this.x, 0.6);
      yield* this.land(this.perchX, this.perchY);
    }
    *fish() {
      yield* this.takeOff();
      const fx = rnd(1500, 2500);
      yield* this.flyTo(fx - this.dir * 60, 250, 140, 25);
      // plunge
      this.mode = 'fly';
      let e = 0;
      while (this.y < sy(this.x) - 10 && e < 3) { const dt = yield; e += dt; this.vy += 700 * dt; this.vx *= Math.pow(0.5, dt); this.o.spread = 0.3; this.o.pitch = -0.9; }
      FX.splashAt(this.x, sy(this.x), { power: 1.1 }); Game.sfx('splash', this.x, 1);
      this.mode = 'swim'; this.vx = this.vy = 0;
      yield* wait(0.4);
      e = 0;
      while (e < 1.8) { const dt = yield; e += dt; this.o.pouch = 1; this.o.bill = 0.3; this.o.eyes = 'happy'; }
      Game.sfx('gulp', this.x, 0.7);
      e = 0; while (e < 0.5) { const dt = yield; e += dt; this.o.pitch = 0.4; this.o.bill = 0; }
      this.happyT = 1;
      yield* this.takeOff();
      yield* this.flyTo(this.x + this.dir * 200, 300, 120, 30);
      yield* this.land(this.perchX, this.perchY);
    }
    *carryBall(b, sealeo) {
      yield* this.takeOff();
      yield* this.flyTo(() => [b.x, b.y - 60], 150, 12);
      yield* this.flyTo(() => [b.x, b.y - 20], 80, 8);
      if (b.holder || Math.hypot(b.x - this.x, b.y - (this.y + 30)) > 80) return yield* this.land(this.perchX, this.perchY);
      b.holder = this; this.cargo = b; Game.sfx('gulp', this.x, 0.5);
      yield* this.flyTo(this.x, this.y - 120, 120, 20);
      const n = () => { const p = sealeo.at('nose'); return [p[0] - this.dir * 6, p[1] - 150]; };
      yield* this.flyTo(n, 130, 10);
      yield* this.flyTo(n, 50, 4);
      // drop it right on Sealeo's nose
      b.holder = null; this.cargo = null; b.vx = 0; b.vy = 20; b.lastTouch = this; b.touchT = 0;
      this.o.bill = 0.8; Game.sfx('squawk', this.x, 0.6);
      yield* wait(0.3);
      yield* this.flyTo(this.x + 200, 260, 120, 30);
      yield* this.land(this.perchX, this.perchY);
    }
    *carryNut(walrein) {
      const nut = Scene.S.coconuts.find((c) => c.state === 'tree') || Nuts.near(walrein.x, 900, (c) => c.state === 'ground' && !c.cracked && !c.claim);
      if (!nut) return yield* this.patrol();
      nut.claim = this;
      yield* this.takeOff();
      yield* this.flyTo(() => [nut.x, nut.y - 50], 150, 14);
      yield* this.flyTo(() => [nut.x, nut.y - 34], 70, 6);
      if (nut.state !== 'tree' && nut.state !== 'ground') { nut.claim = null; return yield* this.land(this.perchX, this.perchY); }
      if (nut.state === 'tree') nut.palm.shake = 0.6;
      nut.state = 'held'; nut.holder = this; this.cargo = nut;
      Game.sfx('rustle', nut.x, 0.6);
      yield* this.flyTo(this.x, 220, 120, 30);
      // prank: sometimes drop it on Mudkip instead!
      const m = mudkip();
      const prank = m && m.mode === 'land' && !m.sleeping && chance(0.3);
      const sealeo = Game.mons.find((q) => q.kind === 'sealeo' && !q.item && !q.sleeping);
      const toSeal = !prank && sealeo && chance(0.4);
      const target = () => (prank ? [m.x, m.y - 190] : toSeal ? (() => { const p = sealeo.at('nose'); return [p[0], p[1] - 150]; })() : [walrein.x - 70, walrein.y - 240]);
      yield* this.flyTo(target, 140, 12);
      nut.holder = null; nut.state = 'fall'; nut.vx = prank ? 0 : -10; nut.vy = 0; nut.claim = null; this.cargo = null;
      this.o.bill = 0.8; Game.sfx('squawk', this.x, 0.7);
      if (prank) this.happyT = 1.5;
      yield* wait(0.4);
      yield* this.flyTo(this.x + this.dir * 250, 240, 120, 30);
      yield* this.land(this.perchX, this.perchY);
    }
    *rideMudkip(m) {
      yield* this.takeOff();
      yield* this.flyTo(() => [m.x, m.y - 240], 150, 20);
      if (m.mode !== 'land' || m.busy(2)) return yield* this.land(this.perchX, this.perchY);
      yield* this.flyTo(() => [m.x, m.y - 110], 80, 8);
      if (m.mode !== 'land' || m.busy(2)) return yield* this.land(this.perchX, this.perchY);
      // scoop!
      this.cargo = m; m.mode = 'carried'; m.visible = true;
      Game.sfx('gulp', this.x, 0.8); Game.sfx('mud', m.x, 0.9);
      m.doTask((function* (mk, pel) {
        while (mk.mode === 'carried') { yield; mk.o.eyes = 'happy'; mk.o.mouth = 1; mk.o.legF = Math.sin(Game.t * 9) * 0.5; mk.o.legB = -Math.sin(Game.t * 9) * 0.5; mk.moving = 0; mk.turn(pel.dir > 0 ? 0.9 : Math.PI - 0.9, 0.05); }
        yield* until(() => mk.mode !== 'fall', 4);
        mk.happyT = 1.5;
      })(m, this), 4);
      yield* this.flyTo(this.x + 40, this.y - 170, 110, 20);
      yield* this.flyTo(rnd(1500, 2000), 250, 150, 30);
      yield* this.flyTo(this.x + this.dir * 160, 330, 120, 30);
      // release over the sea
      m.mode = 'fall'; m.vx = this.vx * 0.5; m.vy = 40; this.cargo = null;
      Game.sfx('squawk', this.x, 0.7);
      this.happyT = 1.2;
      yield* wait(0.5);
      yield* this.flyTo(this.x + this.dir * 220, 220, 120, 30);
      yield* this.land(this.perchX, this.perchY);
    }
    *roost() {
      if (this.mode !== 'perch') yield* this.land(this.perchX, this.perchY);
      this.sleeping = true;
      while (Game.hour() === 'night') yield;
      this.sleeping = false;
    }
    dropBall() { if (this.cargo && this.cargo.kind === 'ball') { this.cargo.holder = null; this.cargo = null; } }
    dropNut() { if (this.cargo && this.cargo.state === 'held') { this.cargo.holder = null; this.cargo.state = 'fall'; this.cargo.claim = null; this.cargo = null; } }
    onPoke() {
      Game.sfx('squawk', this.x, 1);
      FX.emote(pick(['shock', 'sweat', 'note']), () => this.headPt(), { life: 1 });
      if (this.cargo) {
        const c = this.cargo;
        if (c.kind === 'mudkip') { c.mode = 'fall'; c.vx = this.vx * 0.5; c.vy = 0; this.cargo = null; }
        else if (c.kind === 'ball') this.dropBall(); else this.dropNut();
      }
      if (this.mode === 'fly') {
        // a startled loop-the-loop
        this.doTask((function* (p) {
          let e = 0;
          const cx0 = p.x, cy0 = p.y - 50;
          while (e < 1.2) { const dt = yield; e += dt; const a = (e / 1.2) * TAU; p.vx = Math.cos(a) * 160 * p.dir; p.vy = -Math.sin(a) * 160; p.o.pitch = -Math.sin(a) * 0.8; }
          yield* p.land(p.perchX, p.perchY);
        })(this), 3);
      } else {
        this.doTask((function* (p) {
          let e = 0;
          while (e < 0.9) { const dt = yield; e += dt; p.o.spread = 1; p.o.flap = Math.sin(e * 22); p.o.bill = 0.7; }
          if (Math.random() < 0.5) {
            // water gun spray!
            const bt = p.at('billTip');
            for (let i = 0; i < 26; i++) FX.add({ type: 'drop', x: bt[0], y: bt[1], vx: p.dir * Life.rnd(120, 220), vy: Life.rnd(-160, -40), g: 420, life: 2, c: PX.hex('#e8fbff'), c2: PX.hex('#8fd6ee'), size: 2, floor: World.SEA + 2, layer: 2, delay: i * 0.02 });
            Game.sfx('splash', p.x, 0.6);
          }
        })(this), 2);
      }
    }
    onBall(b) { return false; }
    splashNear(x) { }
  }

  /* ---- spawn everybody that has a model ---- */
  function init(G) {
    const add = (m) => { G.mons.push(m); return m; };
    if (sp('Spheal')) add(new SphealMon({ x: 880 }));
    if (sp('Sealeo')) add(new SealeoMon({ x: 1600 }));
    if (sp('Walrein')) add(new WalreinMon({}));
    if (sp('Corphish')) { add(new CorphishMon({ x: 1010, min: 700, max: 1140 })); add(new CorphishMon({ x: 1760, min: 1560, max: 2050, under: true })); }
    if (sp('Pelipper')) { const post = World.PIER.posts[5]; add(new PelipperMon({ x: post, y: World.PIER.deck - 31 })); }
  }
  const sys = { init, rockTop, lob, SphealMon, SealeoMon, WalreinMon, CorphishMon, PelipperMon };
  Game.systems.push(sys);
  return sys;
})();
