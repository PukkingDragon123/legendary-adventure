/* ------------------------------------------------------------------
   BeachAI — Coral Cove's Pokémon and its photo puzzles.
   Chains to discover:
    · kick the ball to a Spheal → nose-ball (3★)
    · noise near Walrein → Ice Beam makes a floe → a Spheal rides it (4★)
    · two Corphish + one berry → claw duel (3★); pester one → Crabhammer at the camera (4★)
    · splash the water → Pelipper dives to scoop (3★); splash Pelipper → Water Gun at the lens (4★)
    · dusk → the Luvdisc heart school (3★); sing to it → they leap (4★)
    · wear a hat on the dock → a Wingull steals it (4★)
    · play a song at the end of the dock at dusk → Wailord breaches (4★) → a huge swell → Mantine surfs (4★)
    · the sunken chest holds the Blue Orb → carry it down to the deepest abyss at the far end of the cove at night → Kyogre rises in a storm (4★)
    · a crystal under a beach rock → Dialga; the Lustrous Orb in a moored boat → Palkia
------------------------------------------------------------------- */
const BeachAI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach, hex } = U;
  const { wait, until } = Mons;
  const { Walker, Swimmer, Flyer, mk, dist, hourIs, surf } = AI;
  const TAU = Math.PI * 2;
  const SEA = 520;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const S = { ball: null, heartT: 0, heartOn: false, swell: 0, swellX: 0, breachT: -99, spoutT: 20, kyogre: null, hatThief: null, events: {} };

  /* ================= SPHEAL ================= */
  class SphealM extends Walker {
    constructor(x) {
      super(sp('Spheal'), { kind: 'spheal', dex: 'spheal', x, y: gy(x), yaw: Math.PI - 1.1, z: 2.2, scale: 0.3, qPose: 0.05, qFields: { roll: 0.2, clap: 0.2, mouth: 0.25, squash: 0.03 }, persona: 'curious', speed: 40, minX: 280, maxX: 1000 });
      this.roll = 0; this.sq = new Spring(220, 10); this.happyT = 0; this.senseR = 130; this.floe = null;
    }
    animate(dt, t) {
      const P = { roll: this.roll, squash: this.sq.step(dt) * 0.5 + Math.sin(t * 2.1 + this.seed) * 0.02, clap: 0, mouth: 0.25, headPitch: 0, tailWag: Math.sin(t * 3 + this.seed) * 0.4, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      if (this.sleeping) { P.eyes = 'closed'; P.mouth = 0; P.squash = Math.sin(t * 1.2) * 0.04; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    *rollTo(tx, speed = 80) {
      tx = clamp(tx, this.minX, this.maxX);
      yield* this.faceTo(Math.sign(tx - this.x), true);
      for (let g = 0; g < 1500; g++) {
        const dt = yield;
        const dx = tx - this.x; if (Math.abs(dx) < 3) break;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        this.x += step; this.roll += Math.abs(step) / 58; this.moving = speed;
        this.setAct('roll', speed > 70 ? 1 : 0.6);
        if (Math.random() < dt * 6) FX.add({ type: 'dust', x: this.x - Math.sign(dx) * 10, y: gy(this.x) - 2, vx: -Math.sign(dx) * 20, vy: -10, r: 3, life: 0.5, c: Game.P.sand[3], c2: Game.P.sand[2], layer: 2 });
      }
      const target = Math.round(this.roll / TAU) * TAU;
      for (let g = 0; g < 200 && Math.abs(this.roll - target) > 0.02; g++) { const dt = yield; this.roll = approach(this.roll, target, dt * 4); }
      this.roll = target;
    }
    *clapAbout(T = rnd(1.6, 2.6)) {
      let e = 0, n = 0;
      while (e < T) { const dt = yield; e += dt; const c = Math.abs(Math.sin(e * 9)); this.o.clap = c; this.o.eyes = 'happy'; this.o.mouth = 1; this.setAct('clap', c > 0.8 ? 1 : 0.5); if (Math.floor((e * 9) / Math.PI) > n) { n++; Game.sfx('clap', this.x, 0.5); } }
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 2));
      for (;;) {
        if (hourIs('night') || (hourIs('noon') && chance(0.15))) { yield* this.napUntil(() => !hourIs('night') && chance(0.02), hourIs('night') ? 60 : rnd(8, 16)); continue; }
        const f = AI.floes.find((q) => !q.rider && Math.abs(q.x - this.x) < 500 && q.t < q.life - 12);
        if (f) { yield* this.rideFloe(f); continue; }
        const r = Math.random();
        if (r < 0.3) yield* this.idle(rnd(2, 4));
        else if (r < 0.55) yield* this.rollTo(this.x + (chance(0.5) ? 1 : -1) * rnd(120, 260), rnd(70, 110));
        else if (r < 0.7) yield* this.clapAbout();
        else yield* this.wander(120);
      }
    }
    *rideFloe(f) {
      f.rider = this;
      this.emote('sparkle', 1);
      yield* this.rollTo(clamp(World.shoreX - 10, this.minX, this.maxX), 90);
      // hop out onto the ice
      this.mode = 'air';
      const x0 = this.x, y0 = this.y;
      let e = 0;
      Game.sfx('boing', this.x, 0.6);
      while (e < 0.8) { const dt = yield; e += dt; const k = e / 0.8; this.x = lerp(x0, f.x, k); this.y = lerp(y0, f.y - 2, k) - Math.sin(k * Math.PI) * 50; this.setAct('floe', 0.5); }
      FX.splashAt(f.x, f.y, { power: 0.4, n: 8 });
      e = 0;
      while (f.t < f.life - 1 && e < 16) {
        const dt = yield; e += dt;
        this.x = f.x; this.y = f.y - 2;
        this.o.eyes = 'happy'; this.o.mouth = 1; this.o.clap = Math.abs(Math.sin(e * 3)) > 0.9 ? 1 : 0; this.o.squash = Math.sin(e * 5) * 0.05;
        this.setAct('floe', 0.85 + 0.15 * Math.sin(e * 2));
        this.yaw = Math.PI / 2 + Math.sin(e * 0.7) * 0.6;
      }
      f.rider = null;
      // swim back to shore
      this.mode = 'land';
      this.x = clamp(this.x, this.minX, this.maxX);
      FX.splashAt(this.x, surf(this.x), { power: 0.5 });
      this.happyT = 1.5;
    }
    onPoke() { this.sq.kick(0.6); this.happyT = 0.8; Game.sfx('spheal', this.x, 0.7); this.doTask(this.clapAbout(1.2), 2); }
    onSong() { if (!this.sleeping) this.doTask((function* (s) { yield* wait(rnd(0.3, 0.9)); yield* s.faceCam(0.8); yield* s.clapAbout(3); })(this), 2); }
    onFood(it) { if (this.sleeping || Math.abs(it.x - this.x) > 260 || World.waterAt(it.x) !== null) return false; this.doTask(this.eat(it), 2); return true; }
    *eat(it) { yield* this.rollTo(it.x + (this.x < it.x ? -16 : 16), 90); if (it.eaten) return; let e = 0; while (e < 1.2) { const dt = yield; e += dt; this.o.mouth = Math.sin(e * 18) > 0 ? 1 : 0.2; this.o.eyes = 'happy'; this.setAct('idle', 0.4); } Items.eat(it); this.happyT = 1; this.emote('heart'); }
    // the beach ball lands nearby → nose-ball
    ball(b) {
      if (this.sleeping || this.busy(2) || Math.abs(b.x - this.x) > 240) return false;
      this.doTask(this.noseBall(b), 2);
      return true;
    }
    *noseBall(b) {
      yield* this.rollTo(b.x + (this.x < b.x ? -6 : 6), 100);
      if (Math.abs(b.x - this.x) > 40 || b.holder) return;
      b.holder = this; this.holdPt = () => this.at('nose', 0, -12);
      let e = 0;
      const T = rnd(4, 6);
      while (e < T) {
        const dt = yield; e += dt;
        this.o.headPitch = -0.35; this.o.eyes = e % 1.2 < 0.1 ? 'blink' : 'happy'; this.o.mouth = 0.6;
        const bob = Math.abs(Math.sin(e * 5));
        this.holdPt = () => { const p = this.at('nose', 0, -10); return [p[0], p[1] - bob * 16]; };
        this.setAct('ballnose', 0.55 + 0.45 * bob);
        if (bob > 0.98 && Math.random() < 0.3) Game.sfx('boing', this.x, 0.3);
      }
      b.holder = null; b.kick(rnd(-60, 60), -rnd(200, 260), this);
      this.happyT = 1; this.emote('star');
    }
  }

  /* ================= SEALEO ================= */
  class SealeoM extends Walker {
    constructor(x) {
      super(sp('Sealeo'), { kind: 'sealeo', dex: 'sealeo', x, y: gy(x), yaw: Math.PI - 1.05, z: 1.6, scale: 0.34, qPose: 0.05, qFields: { headPitch: 0.06, clap: 0.2, flipper: 0.2, mouth: 0.25 }, persona: 'showoff', speed: 36, minX: 700, maxX: 1060 });
      this.sq = new Spring(220, 10); this.carry = null; this.senseR = 170;
    }
    animate(dt, t) {
      const P = { squash: this.sq.step(dt) * 0.5 + Math.sin(t * 1.8 + this.seed) * 0.015, headPitch: 0.05, headYaw: 0, mouth: 0.2, flipper: 0, clap: 0, tailWag: Math.sin(t * 2.2) * 0.3, lean: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.moving) { P.lean = 0.1; P.flipper = Math.abs(Math.sin(t * 6)) * 0.6; }
      if (this.sleeping) { P.eyes = 'closed'; P.mouth = 0; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (hourIs('night')) { yield* this.napUntil(() => !hourIs('night'), 60); continue; }
        if (hourIs('dawn') && !S.events.tower) { S.events.tower = 1; yield* this.tower(); continue; }
        const r = Math.random();
        if (r < 0.35) yield* this.idle(rnd(2, 4));
        else if (r < 0.55) yield* this.bark();
        else yield* this.wander(120);
      }
    }
    *bark() { let e = 0; Game.sfx('bark', this.x, 0.5); while (e < 1.4) { const dt = yield; e += dt; this.o.clap = Math.abs(Math.sin(e * 8)); this.o.mouth = 0.9; this.o.eyes = 'happy'; } }
    *tower() {
      const s = Mons.all.find((m) => m.kind === 'spheal' && !m.sleeping && !m.busy(2));
      if (!s) return;
      s.doTask((function* () { yield* s.rollTo(this.x, 80); s.mode = 'carried'; yield* until(() => s.mode !== 'carried', 30); }).call(this), 3);
      yield* until(() => Math.abs(s.x - this.x) < 20 || !s.alive, 10);
      let e = 0;
      Game.sfx('boing', this.x, 0.6);
      while (e < 9 && s.alive) {
        const dt = yield; e += dt;
        const lift = Math.min(1, e / 0.8);
        const nose = this.at('nose', 0, -2);
        s.x = nose[0]; s.y = nose[1] - lift * 4 + Math.sin(e * 3) * 1.5; s.mode = 'carried';
        s.o.eyes = 'happy'; s.o.clap = Math.abs(Math.sin(e * 4)) > 0.9 ? 1 : 0; s.roll = Math.sin(e * 1.3) * 0.3;
        this.o.headPitch = 0.6; this.o.eyes = 'happy'; this.o.flipper = 0.4 + Math.sin(e * 3) * 0.2;
        this.setAct('tower', lift >= 1 ? 1 : 0.4); s.setAct('tower', 0.8);
      }
      s.mode = 'land'; s.y = gy(s.x);
      s.happyT = 1;
    }
    onPoke() { this.sq.kick(0.5); this.doTask(this.bark(), 2); }
    onSong() { this.doTask((function* (s) { yield* s.faceCam(1); let e = 0; while (e < 2.5) { const dt = yield; e += dt; s.o.eyes = 'happy'; s.o.mouth = 1; s.setAct('pose', 1); s.o.headPitch = 0.3 + Math.sin(e * 4) * 0.1; } })(this), 2); }
    onFood(it) { if (this.sleeping || Math.abs(it.x - this.x) > 300 || World.waterAt(it.x) !== null) return false; this.doTask(this.spinIt(it), 2); return true; }
    *spinIt(it) {
      yield* this.walkTo(it.x + (this.x < it.x ? -14 : 14), 60);
      if (it.eaten) return;
      it.held = true;
      let e = 0;
      while (e < 3.5) {
        const dt = yield; e += dt;
        const nose = this.at('nose', 0, -4);
        it.x = nose[0] + Math.cos(e * 12) * 2; it.y = nose[1] - 4; it.state = 'held';
        this.o.headPitch = 0.62 + Math.sin(e * 5) * 0.05; this.o.eyes = 'happy'; this.o.flipper = 0.4;
        this.setAct('spin', 0.6 + 0.4 * Math.abs(Math.sin(e * 3)));
      }
      Items.eat(it); this.emote('heart');
    }
    ball(b) { if (this.sleeping || this.busy(2) || Math.abs(b.x - this.x) > 220) return false; this.doTask(this.ballSpin(b), 2); return true; }
    *ballSpin(b) {
      yield* this.walkTo(b.x + (this.x < b.x ? -8 : 8), 70);
      if (Math.abs(b.x - this.x) > 40 || b.holder) return;
      b.holder = this; let e = 0;
      while (e < 4) { const dt = yield; e += dt; this.holdPt = () => { const n = this.at('nose', 0, -12); return [n[0] + Math.sin(e * 9) * 1.5, n[1]]; }; b.w = 12; this.o.headPitch = 0.62; this.o.eyes = 'happy'; this.setAct('spin', 1); }
      b.holder = null; b.kick(rnd(-80, 80), -240, this);
    }
  }

  /* ================= WALREIN ================= */
  class WalreinM extends Walker {
    constructor(A) {
      const rock = A.walreinRock;
      super(sp('Walrein'), { kind: 'walrein', dex: 'walrein', x: rock.x, y: rock.y - rock.frames[0].h + 6, yaw: Math.PI - 0.95, z: 1.2, scale: 0.38, qPose: 0.05, qFields: { headPitch: 0.06, mouth: 0.2, squash: 0.02, flipper: 0.2 }, persona: 'grumpy' });
      this.rock = rock; this.sq = new Spring(200, 10); this.senseR = 160; this.alert = 0.6;
      this.baseY = rock.y - rock.frames[0].h + 10;
    }
    physics() { this.y = this.baseY; }
    animate(dt, t) {
      const P = { headPitch: 0.1 + Math.sin(t * 0.7) * 0.03, headYaw: 0, mouth: 0.05, squash: this.sq.step(dt) * 0.5 + Math.sin(t * 1.4 + this.seed) * 0.012, flipper: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.sleeping) { P.eyes = 'closed'; P.headPitch = -0.1; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(1, 3));
      for (;;) {
        if (hourIs('dawn') && !S.events.roar) { S.events.roar = 1; yield* this.roar(); continue; }
        if (hourIs('night') || (hourIs('afternoon') && chance(0.3))) { yield* this.napUntil(() => false, hourIs('night') ? 50 : rnd(10, 20)); continue; }
        const r = Math.random();
        if (r < 0.7) { this.setAct('idle'); let e = 0; const T = rnd(3, 6); while (e < T) { const dt = yield; e += dt; this.o.headYaw = Math.sin(e * 0.8) * 0.4; } }
        else yield* this.roar(0.6);
      }
    }
    *roar(k = 1) {
      yield* this.faceCam(0.3);
      let e = 0; Game.sfx('roar', this.x, k); Game.shake(1.5 * k);
      while (e < 1.8) { const dt = yield; e += dt; const m = Math.min(1, e / 0.4); this.o.mouth = m; this.o.headPitch = 0.45 * m; this.o.eyes = 'closed'; this.setAct('roar', m >= 1 && e < 1.4 ? 1 : 0.5); }
      for (const m of Mons.all) if (m !== this && Math.abs(m.x - this.x) < 500) m.hear('loud', this.x, 0.6);
    }
    *iceBeam() {
      yield* this.faceTo(1, false);
      let e = 0;
      Game.sfx('freeze', this.x, 0.8);
      const tx = World.shoreX + rnd(60, 140);
      while (e < 1.6) {
        const dt = yield; e += dt;
        this.o.mouth = 1; this.o.headPitch = 0.15;
        const [mx, my] = this.at('mouth');
        const firing = e > 0.4 && e < 1.3;
        this.setAct('icebeam', firing ? 1 : 0.5);
        if (firing) for (let k = 0; k < 4; k++) { const q = Math.random(); FX.add({ type: 'spark', x: lerp(mx, tx, q) + rnd(-2, 2), y: lerp(my, surf(tx), q) + rnd(-2, 2), size: 1 + (Math.random() * 2 | 0), life: 0.25, c: 0xffffffff, c2: hex('#9fe8ff'), layer: 3 }); }
      }
      FX.splashAt(tx, surf(tx), { power: 0.7, c: hex('#e8fcff') }); FX.sparkles(tx, surf(tx) - 6, 12, 40, 0xffffffff, hex('#9fe8ff'));
      AI.makeFloe(tx);
    }
    *attackCam() {
      this.emote('anger', 1.2);
      yield* this.faceCam(1);
      let e = 0; Game.sfx('freeze', this.x, 1);
      while (e < 1.3) { const dt = yield; e += dt; this.o.mouth = Math.min(1, e * 2); this.o.headPitch = 0.3; this.setAct('attack', e > 0.7 ? 1 : 0.6); const [mx, my] = this.at('mouth'); if (e > 0.6) FX.add({ type: 'spark', x: mx + rnd(-4, 4), y: my + rnd(-4, 4), size: 2, life: 0.3, c: 0xffffffff, c2: hex('#9fe8ff'), layer: 4 }); }
      Photo.hitLens('frost');
      this.annoy = 0;
      yield* wait(1);
    }
    onPoke() {
      this.annoy += 0.35; this.sq.kick(0.4); this.emote('anger', 1);
      if (this.sleeping) { this.sleeping = false; this.doTask(this.roar(), 3); return; }
      if (this.annoy > 0.6 && Game.mode !== 'dex') this.doTask(this.attackCam(), 5);
      else this.doTask(this.roar(0.7), 3);
    }
    hear(kind, x, amt) {
      super.hear(kind, x, amt);
      if ((kind === 'song' || kind === 'splash' || kind === 'loud') && !this.sleeping && !this.busy(2) && Math.abs(x - this.x) < 500 && chance(kind === 'song' ? 0.8 : 0.45)) this.doTask(this.iceBeam(), 3);
    }
    onPhoto(res) { if (dist(this, mk()) < 180) { this.annoy += 0.22; if (this.annoy > 0.7 && !this.busy(4)) this.doTask(this.attackCam(), 5); } }
    onWater() { this.annoy += 0.5; this.doTask(this.attackCam(), 5); }
  }

  /* ================= CORPHISH ================= */
  class CorphishM extends Walker {
    constructor(x, o = {}) {
      super(sp('Corphish'), { kind: 'corphish', dex: 'corphish', x, y: gy(x), yaw: Math.PI / 2, z: 2, scale: 0.42, qPose: 0.06, qFields: { walk: 0.5, clawN: 0.2, clawF: 0.2 }, persona: 'grumpy', speed: 50, minX: o.minX ?? 300, maxX: o.maxX ?? 1040 });
      this.walkPh = 0; this.bury = 0; this.under = !!o.under; this.senseR = 110;
      if (this.under) { this.minX = o.minX; this.maxX = o.maxX; }
    }
    animate(dt, t) {
      if (this.moving) this.walkPh += dt * 14;
      const P = { walk: this.moving ? this.walkPh : 0, clawN: 0.15 + Math.sin(t * 2 + this.seed) * 0.08, clawF: 0.15 + Math.sin(t * 2.3 + this.seed) * 0.08, armN: 0, armF: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', tilt: 0, mouth: 0 };
      Object.assign(P, this.o);
      this.pose = P;
    }
    *scuttle(tx, speed = this.speed) { yield* this.walkTo(tx, speed, { sideways: true, yaw: () => Math.PI / 2 + (tx > this.x ? -0.25 : 0.25), turn: 4 }); }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        const r = Math.random();
        if (!this.under && r < 0.28) yield* this.hide();
        else if (r < 0.55) yield* this.scuttle(clamp(this.x + rnd(-160, 160), this.minX, this.maxX));
        else if (r < 0.75) yield* this.snip();
        else yield* this.idle(rnd(1.5, 3));
      }
    }
    *snip(T = 1.4) { let e = 0; while (e < T) { const dt = yield; e += dt; const c = Math.abs(Math.sin(e * 10)); this.o.clawN = c; this.o.clawF = 1 - c; this.o.armN = 0.3; this.setAct('idle', 0.3); if (Math.random() < dt * 5) Game.sfx('snip', this.x, 0.3); } }
    *hide() {
      // dig in until only the eyes show
      let e = 0;
      while (e < 1) { const dt = yield; e += dt; this.bury = Math.min(0.72, e * 0.8); this.o.walk = e * 30; if (Math.random() < dt * 10) FX.add({ type: 'drop', x: this.x + rnd(-8, 8), y: gy(this.x) - 2, vx: rnd(-40, 40), vy: -rnd(40, 90), g: 400, life: 0.8, c: Game.P.sand[2], size: 1, floor: gy(this.x), layer: 2 }); }
      this.hidden2 = true;
      e = 0;
      const T = rnd(8, 18);
      while (e < T && this.hidden2) { const dt = yield; e += dt; this.bury = 0.72; this.setAct('hide', 0.8); if (Math.random() < dt * 0.8) FX.bubbles(this.x + rnd(-4, 4), gy(this.x) - 4, 1, gy(this.x) - 30); }
      yield* this.popUp();
    }
    *popUp() {
      this.hidden2 = false;
      let e = 0;
      while (e < 0.35) { const dt = yield; e += dt; this.bury = Math.max(0, 0.72 - e * 2.2); }
      this.bury = 0;
      FX.poof(this.x, gy(this.x), Game.P.sand[3], Game.P.sand[2], 5, 4);
    }
    onFood(it) {
      if (World.waterAt(it.x) !== null && !this.under) return false;
      if (Math.abs(it.x - this.x) > 300) return false;
      const rival = Mons.all.find((m) => m !== this && m.kind === 'corphish' && m.alive && Math.abs(m.x - it.x) < 300 && m.under === this.under);
      this.doTask(this.grab(it, rival), 3);
      if (rival && !rival.busy(3)) rival.doTask(rival.grab(it, this), 3);
      return true;
    }
    *grab(it, rival) {
      if (this.bury) yield* this.popUp();
      yield* this.scuttle(it.x + (this.x < it.x ? -14 : 14), 80);
      if (rival && rival.alive && Math.abs(rival.x - this.x) < 60 && !it.eaten) { yield* this.duel(rival); if (this.lostDuel) { this.lostDuel = false; return; } }
      if (it.eaten) return;
      let e = 0;
      while (e < 1.6) { const dt = yield; e += dt; this.o.clawN = Math.abs(Math.sin(e * 12)); this.o.armN = 0.5; this.o.mouth = Math.sin(e * 18) > 0 ? 1 : 0; this.setAct('eat', 0.8); }
      Items.eat(it); this.emote('heart');
    }
    *duel(rival) {
      let e = 0; this.emote('anger', 1);
      yield* this.faceTo(rival.x > this.x ? 1 : -1, false);
      while (e < 3.2 && rival.alive) {
        const dt = yield; e += dt;
        const hit = Math.sin(e * 9) > 0.7;
        this.o.armN = 0.8; this.o.armF = 0.8; this.o.clawN = hit ? 1 : 0.2; this.o.clawF = hit ? 0.2 : 1; this.o.tilt = Math.sin(e * 9) * 0.15;
        this.x += Math.sin(e * 9) * dt * 20 * Math.sign(rival.x - this.x);
        this.setAct('duel', hit ? 1 : 0.6);
        if (hit && Math.random() < dt * 8) { FX.bonk((this.x + rival.x) / 2, this.y - 16, 6); Game.sfx('clink', this.x, 0.5); }
      }
      if (this.x < rival.x && chance(0.5)) { this.lostDuel = true; this.emote('sweat'); yield* this.scuttle(this.x - 100, 90); }
    }
    *attackCam() {
      if (this.bury) yield* this.popUp();
      this.emote('anger', 1);
      const m = mk();
      yield* this.scuttle(m.x + (this.x < m.x ? -30 : 30), 110);
      yield* this.faceCam(1);
      let e = 0;
      while (e < 1.1) { const dt = yield; e += dt; const wind = Math.min(1, e / 0.7); this.o.armN = wind; this.o.clawN = 1; this.o.tilt = -0.2 * wind; this.setAct('attack', e > 0.45 ? 1 : 0.6); }
      FX.bonk(m.x, m.y - 20, 12); Game.sfx('bonk', this.x, 1);
      Photo.hitLens('crack', { x: 0.45 + rnd(-0.1, 0.1), y: 0.5 });
      this.annoy = 0;
      yield* wait(0.6);
      yield* this.scuttle(clamp(this.x + rnd(-120, 120), this.minX, this.maxX), 90);
    }
    onPoke() {
      if (this.bury) { this.hidden2 = false; this.emote('shock'); this.annoy += 0.3; return; }
      this.annoy += 0.35;
      if (this.annoy > 0.55) this.doTask(this.attackCam(), 5); else { this.emote('anger'); this.doTask(this.snip(1), 2); }
    }
    onPhoto() { if (dist(this, mk()) < 120) this.annoy += 0.15; }
    onWater() { this.annoy += 0.4; if (this.bury) this.hidden2 = false; }
    onScan() { if (this.bury) { FX.sparkles(this.x, gy(this.x) - 6, 6, 16, 0xffffffff, hex('#7affc0')); return true; } return false; }
  }

  /* ================= LUVDISC school ================= */
  class LuvdiscM extends Swimmer {
    constructor(x, y, i) {
      super(sp('Luvdisc'), { kind: 'luvdisc', dex: 'luvdisc', x, y, yaw: 0.6, z: 1.8, scale: 0.26, qPose: 0.05, qFields: { wiggle: 0.25, kiss: 0.25, tilt: 0.1 }, persona: 'shy', speed: 42, box: { x0: 1060, x1: 1900, y0: SEA + 24, y1: SEA + 150 } });
      this.i = i; this.wig = Math.random() * 6; this.senseR = 90; this.alert = 1.4;
    }
    animate(dt, t) {
      this.wig += dt * (4 + this.moving * 0.08);
      const P = { wiggle: Math.sin(this.wig) * 0.6, kiss: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', tilt: clamp(this.vy * 0.01, -0.4, 0.4), blush: 0 };
      if (this.sleeping) { P.eyes = 'closed'; P.wiggle *= 0.3; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0, 2));
      for (;;) {
        if (S.heartOn) { yield* this.heart(); continue; }
        if (hourIs('night')) { this.sleeping = true; this.setAct('sleep', 0.3); yield* this.swimTo(this.x + rnd(-40, 40), Math.min(gy(this.x) - 20, SEA + 160), 12, 6); this.sleeping = false; continue; }
        const r = Math.random();
        if (r < 0.22) yield* this.kiss();
        else yield* this.cruise(rnd(3, 6));
      }
    }
    *kiss() {
      const o = Mons.all.find((m) => m !== this && m.kind === 'luvdisc' && !m.busy(2) && dist(m, this) < 160);
      if (!o) return yield* this.cruise();
      const mx = (this.x + o.x) / 2, my = (this.y + o.y) / 2;
      o.doTask(o.kissAt(mx + 9, my, this), 2);
      yield* this.kissAt(mx - 9, my, o);
    }
    *kissAt(x, y, other) {
      yield* this.swimTo(x, y, 50, 6);
      yield* this.faceTo(other.x > this.x ? 1 : -1, true);
      let e = 0;
      while (e < 1.6) { const dt = yield; e += dt; this.o.kiss = Math.min(1, e * 2); this.o.blush = 1; this.o.eyes = 'happy'; this.setAct('kiss', e > 0.5 && e < 1.3 ? 1 : 0.5); if (e > 0.6 && Math.random() < dt * 3) FX.add({ type: 'icon', icon: 'heart', x: this.x + rnd(-4, 4), y: this.y - 20, vx: rnd(-6, 6), vy: -16, life: 1.2, layer: 3 }); }
      if (this.i % 2 === 0) Game.sfx('kiss', this.x, 0.5);
    }
    *heart() {
      // formation around the heart centre: parametric heart curve
      const n = Mons.all.filter((m) => m.kind === 'luvdisc').length;
      const a = (this.i / n) * TAU;
      const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      const cx = S.heartX, cy = S.heartY;
      while (S.heartOn) {
        const dt = yield;
        const tx = cx + hx * 3.2, ty = cy + hy * 3.2;
        this.x = lerp(this.x, tx, dt * 2); this.y = lerp(this.y, ty, dt * 2);
        this.turn(this.face(Math.cos(a) > 0 ? -1 : 1, true), dt, 3);
        const formed = Math.hypot(tx - this.x, ty - this.y) < 6;
        this.setAct(S.leap ? 'leap' : 'heart', formed ? 1 : 0.4);
        this.o.blush = 1; this.o.eyes = 'happy';
        if (S.leap && formed && this.i === S.leapI) yield* this.leap();
      }
    }
    *leap() {
      const x0 = this.x, s0 = surf(this.x);
      this.mode = 'air';
      // swim up and arc out of the water
      let e = 0;
      Game.sfx('splash', this.x, 0.6);
      const y0 = this.y;
      while (e < 1.5) { const dt = yield; e += dt; const k = e / 1.5; this.x = x0 + k * 60; this.y = lerp(y0, s0, Math.min(1, k * 3)) - Math.max(0, Math.sin((k - 0.3) / 0.7 * Math.PI)) * 70 * (k > 0.3 ? 1 : 0); this.setAct('leap', k > 0.45 && k < 0.8 ? 1 : 0.6); this.o.eyes = 'happy'; this.o.tilt = (0.6 - k) * 1.5; if (k > 0.3 && k < 0.35) FX.splashAt(this.x, s0, { power: 0.5 }); }
      FX.splashAt(this.x, s0, { power: 0.6 });
      this.mode = 'swim';
      S.leapI = (S.leapI + 1) % 6;
    }
    onPoke() { this.emote('sweat', 0.8); this.doTask(this.flee(mk()), 3); }
  }

  /* ================= PELIPPER ================= */
  class PelipperM extends Flyer {
    constructor(A) {
      super(sp('Pelipper'), { kind: 'pelipper', dex: 'pelipper', x: 1660, y: 420, yaw: 1, z: 2.5, scale: 0.4, qPose: 0.06, qFields: { flap: 0.15, spread: 0.1, bill: 0.1, pouch: 0.1 }, persona: 'calm', speed: 70 });
      this.A = A; this.flapPh = 0; this.perches = A.dockLamps.map(([x, y]) => [x, y - 6]); this.pouch = 0; this.target = null;
    }
    animate(dt, t) {
      const flying = this.mode === 'fly';
      if (flying) this.flapPh += dt * (this.moving > 60 ? 8 : 5);
      const P = { flap: flying ? Math.sin(this.flapPh) * 0.8 : 0, spread: flying ? 1 : 0, bill: 0.12, pitch: flying ? clamp(this.vy * 0.004, -0.3, 0.4) : 0, feet: flying ? 0 : 1, pouch: this.pouch, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.mode === 'perch') { P.flap = 0; P.spread = 0; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (this.target) { const it = this.target; this.target = null; yield* this.scoop(it); continue; }
        const r = Math.random();
        if (r < 0.45) yield* this.circle(1400 + rnd(-300, 300), 380 + rnd(-40, 20), rnd(120, 220), rnd(6, 12), 'fly');
        else yield* this.perch();
      }
    }
    *perch() {
      const p = pick(this.perches);
      yield* this.flyTo(p[0], p[1] - 14, 80);
      yield* this.flyTo(p[0], p[1], 30, { near: 2 });
      this.mode = 'perch'; this.perchAt = p;
      let e = 0; const T = rnd(6, 14);
      while (e < T && !this.target) { const dt = yield; e += dt; this.setAct('perch', 0.3); this.o.bill = Math.sin(e * 0.7) > 0.95 ? 0.6 : 0.12; }
      this.mode = 'fly'; this.perchAt = null;
      this.vy = -40;
    }
    *scoop(it) {
      const x = it.x;
      this.mode = 'fly'; this.perchAt = null;
      yield* this.flyTo(x - 80, SEA - 90, 110);
      yield* this.flyTo(x, surf(x) - 6, 160, { act: 'scoop', peak: (d) => (d < 40 ? 1 : 0.6) });
      this.o.bill = 1;
      FX.splashAt(x, surf(x), { power: 0.9 }); Game.sfx('splash', x, 0.8);
      if (it.kind) Items.eat(it);
      let e = 0;
      while (e < 0.6) { const dt = yield; e += dt; this.pouch = Math.min(1, e * 2); this.setAct('scoop', 1); this.o.bill = 0.3; this.y -= dt * 40; }
      this.emote('heart');
      yield* this.flyTo(x + 120, SEA - 120, 90);
      this.pouch = 0;
    }
    *attackCam() {
      this.mode = 'fly'; this.perchAt = null;
      const m = mk();
      this.emote('anger', 1);
      yield* this.flyTo(m.x + (this.x < m.x ? -70 : 70), m.y - 50, 120);
      yield* this.faceCam(1);
      let e = 0;
      Game.sfx('spout', this.x, 0.8);
      while (e < 1.2) { const dt = yield; e += dt; this.o.bill = Math.min(1, e * 2); this.setAct('attack', e > 0.6 ? 1 : 0.6); if (e > 0.6) { const [bx, by] = this.at('billTip'); FX.add({ type: 'drop', x: bx, y: by, vx: (m.x - bx) * 2 + rnd(-20, 20), vy: (m.y - 30 - by) * 2 + rnd(-20, 20), g: 100, life: 0.5, c: 0xffffffff, c2: hex('#8fd6ee'), size: 2, layer: 4 }); } }
      Photo.hitLens('splash');
      yield* this.flyTo(this.x + 150, SEA - 130, 100);
    }
    splash(x, it) { if (Math.abs(x - this.x) < 700 && !this.busy(3)) this.doTask(this.scoop(it || { x }), 3); }
    onWater() { this.doTask(this.attackCam(), 5); }
    onPoke() { this.emote('note'); if (this.mode === 'perch') this.doTask((function* (s) { s.o.bill = 0.8; Game.sfx('squawk', s.x, 0.7); yield* wait(0.8); })(this), 2); }
  }

  /* ================= generic sea swimmers for new species (models from Mantine.js etc.) ================= */
  class MantineM extends Swimmer {
    constructor() {
      super(sp('Mantine'), { kind: 'mantine', dex: 'mantine', x: 1700, y: SEA + 110, yaw: 0.7, z: 1.5, scale: 0.34, qPose: 0.06, qFields: { flap: 0.15, bank: 0.1, pitch: 0.1 }, persona: 'calm', speed: 46, box: { x0: 1200, x1: 2500, y0: SEA + 50, y1: SEA + 170 } });
      this.flapPh = 0; this.rider = null; this.swimTop = 16;
    }
    animate(dt, t) {
      this.flapPh += dt * (1.6 + this.moving * 0.02);
      const P = { flap: Math.sin(this.flapPh) * 0.7, bank: clamp(this.vy * 0.01, -0.5, 0.5), pitch: clamp(-this.vy * 0.012, -0.6, 0.6), tail: Math.sin(t * 2 + this.seed) * 0.5, mouth: 0.2, eyes: this.blink(t, dt) ? 'blink' : 'open', fins: 0.5 };
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (S.swell > 0.6) { yield* this.surf(); continue; }
        const r = Math.random();
        if (r < 0.18) yield* this.leap();
        else yield* this.cruise(rnd(4, 8), this.rider ? 'ride' : 'swim');
      }
    }
    *leap() {
      const x0 = this.x, dir = Math.cos(this.yaw) > 0 ? 1 : -1;
      yield* this.swimTo(x0 + dir * 60, SEA + 40, 80, 3);
      this.mode = 'air';
      let e = 0; const T = 1.5, s0 = surf(this.x), y0 = this.y;
      Game.sfx('splash', this.x, 0.7);
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.x += dir * 110 * dt; this.y = lerp(y0, s0, Math.min(1, k * 4)) - Math.max(0, Math.sin(clamp((k - 0.25) / 0.75, 0, 1) * Math.PI)) * 95; this.o.pitch = (0.55 - k) * 1.6; this.o.flap = Math.sin(e * 8) * 0.9; this.o.eyes = 'happy'; this.o.mouth = 1; this.setAct('leap', k > 0.45 && k < 0.75 ? 1 : 0.6); if (Math.abs(k - 0.25) < 0.02) FX.splashAt(this.x, s0, { power: 0.9 }); }
      FX.splashAt(this.x, s0, { power: 1.1 }); Game.sfx('splash', this.x, 1);
      this.mode = 'swim'; this.y = s0 + 30;
    }
    *surf() {
      // ride the crest of the big swell toward the beach
      let e = 0;
      this.mode = 'air';
      while (S.swell > 0.2 && e < 14) {
        const dt = yield; e += dt;
        const cx = S.swellX;
        this.x = lerp(this.x, cx + 10, dt * 3);
        const s = surf(this.x);
        this.y = s - 4 - Math.sin(e * 3) * 3;
        this.yaw = lerp(this.yaw, Math.PI - 0.5, dt * 2);
        this.o.pitch = 0.25 + Math.sin(e * 2) * 0.1; this.o.bank = Math.sin(e * 1.5) * 0.3; this.o.flap = 0.6; this.o.eyes = 'happy'; this.o.mouth = 1;
        this.setAct('surf', S.swell > 0.5 ? 1 : 0.7);
        if (Math.random() < dt * 10) FX.add({ type: 'drop', x: this.x + rnd(-20, 20), y: s - 2, vx: rnd(40, 90), vy: -rnd(40, 120), g: 420, life: 0.7, c: 0xffffffff, c2: hex('#bfefff'), size: 2, floor: s + 2, layer: 2 });
      }
      this.mode = 'swim'; this.y = surf(this.x) + 30;
    }
  }
  class RemoraidM extends Swimmer {
    constructor(mantine) {
      super(sp('Remoraid'), { kind: 'remoraid', dex: 'remoraid', x: 1650, y: SEA + 140, yaw: 0.7, z: 1.6, scale: 0.24, qPose: 0.06, qFields: { tail: 0.2 }, persona: 'curious', speed: 55, box: { x0: 1200, x1: 2400, y0: SEA + 40, y1: SEA + 180 } });
      this.mant = mantine;
    }
    animate(dt, t) { const P = { tail: Math.sin(t * 7 + this.seed) * 0.6, mouth: 0.2, fins: 0.5, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        const m = this.mant;
        if (m && m.alive && m.mode === 'swim' && chance(0.6)) {
          m.rider = this;
          let e = 0; const T = rnd(8, 14);
          while (e < T && m.mode === 'swim') { const dt = yield; e += dt; this.x = lerp(this.x, m.x + Math.cos(m.yaw) * -4, dt * 4); this.y = lerp(this.y, m.y + 10, dt * 4); this.yaw = m.yaw; this.setAct('ride', 0.9); m.setAct('ride', 0.9); }
          m.rider = null;
        } else if (chance(0.3)) yield* this.shoot();
        else yield* this.cruise(rnd(3, 6));
      }
    }
    *shoot() {
      yield* this.swimTo(this.x + rnd(-60, 60), SEA + 20, 60, 3);
      let e = 0;
      Game.sfx('spout', this.x, 0.5);
      while (e < 1) { const dt = yield; e += dt; this.o.mouth = 1; this.o.pitch = -0.6; this.setAct('shoot', e > 0.3 ? 1 : 0.5); if (e > 0.3) FX.add({ type: 'drop', x: this.x + rnd(-2, 2), y: SEA - 2, vx: rnd(-10, 10), vy: -rnd(160, 220), g: 380, life: 1.2, c: 0xffffffff, c2: hex('#8fd6ee'), size: 2, floor: SEA, layer: 3 }); }
    }
  }
  class CorsolaM extends Walker {
    constructor(x) { super(sp('Corsola'), { kind: 'corsola', dex: 'corsola', x, y: gy(x), yaw: 1.1, z: 1.7, scale: 0.5, qPose: 0.06, qFields: { step: 0.5 }, persona: 'shy', speed: 22, minX: x - 140, maxX: x + 140 }); this.stepPh = 0; this.senseR = 100; this.alert = 1.2; }
    animate(dt, t) { if (this.moving) this.stepPh += dt * 8; const P = { step: this.stepPh, bob: Math.sin(t * 2 + this.seed) * 0.3 + 0.3, eyes: this.blink(t, dt) ? 'blink' : 'open', mouth: 0.2, hide: 0 }; if (hourIs('night')) this.glowOn = true; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() { for (;;) { if (hourIs('night')) { this.setAct('glow', 0.9); yield* this.idle(4, 'glow'); continue; } if (chance(0.6)) yield* this.wander(80); else yield* this.idle(rnd(2, 4)); } }
    *flee() { this.emote('sweat'); let e = 0; while (e < 4) { const dt = yield; e += dt; this.o.hide = Math.min(1, e * 3); this.o.eyes = 'closed'; this.setAct('hide', 0.9); } }
    drawExtra(fb, cx, cy, P, t) { if (hourIs('night') && this.spr) { const b = this.bounds(); for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const X = x - cx, Y = y - cy; if (X < 0 || Y < 0 || X >= fb.w || Y >= fb.h) continue; if (this.hit(x, y, 0) && U.hash(x, y, Math.floor(t * 3)) > 0.9) fb.d[Y * fb.w + X] = U.screen(fb.d[Y * fb.w + X], 0xffe0a0ff, 0.6); } } }
  }
  class SharpedoM extends Swimmer {
    constructor() { super(sp('Sharpedo'), { kind: 'sharpedo', dex: 'sharpedo', x: 2700, y: 820, yaw: 0.3, z: 1.4, scale: 0.36, qPose: 0.06, qFields: { tail: 0.2, mouth: 0.1 }, persona: 'grumpy', speed: 70, box: { x0: 2350, x1: 3080, y0: 640, y1: 1080 } }); this.senseR = 130; this.alert = 1.5; this.swimTop = 30; }
    animate(dt, t) { const P = { tail: Math.sin(t * (4 + this.moving * 0.05) + this.seed) * 0.7, mouth: 0.1, lunge: 0, eyes: 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        const prey = Mons.all.find((m) => m.kind === 'luvdisc' && m.x > 1850 && m.alive);
        if (prey && chance(0.5)) { yield* this.chase(prey); continue; }
        if (chance(0.08)) { const l = Mons.all.filter((m) => m.kind === 'luvdisc' && !S.heartOn); if (l.length) { const v = pick(l); v.doTask(v.swimTo(2000 + rnd(0, 150), SEA + rnd(60, 150), 60, 6), 2); } }
        yield* this.cruise(rnd(3, 6), 'patrol');
      }
    }
    *chase(prey) {
      this.emote('anger', 0.8);
      prey.doTask(prey.flee(this), 4);
      let e = 0;
      while (e < 3 && prey.alive) { const dt = yield; e += dt; const dx = prey.x - this.x, dy = prey.y - this.y, d = Math.hypot(dx, dy); this.vx = lerp(this.vx, (dx / d) * 150, dt * 3); this.vy = lerp(this.vy, (dy / d) * 150, dt * 3); this.x += this.vx * dt; this.y += this.vy * dt; this.turn(this.face(Math.sign(dx), true), dt, 6); this.o.mouth = d < 60 ? 1 : 0.3; this.setAct('chase', d < 70 ? 1 : 0.6); this.moving = 150; }
      this.o.mouth = 0;
    }
    *attackCam() {
      const m = mk();
      this.emote('anger', 1);
      let e = 0;
      while (e < 1.4) { const dt = yield; e += dt; const dx = m.x - this.x, dy = m.y - 12 - this.y, d = Math.hypot(dx, dy); if (d > 30) { this.x += (dx / d) * 200 * dt; this.y += (dy / d) * 200 * dt; } this.turn(Math.PI / 2 + (dx > 0 ? -0.5 : 0.5), dt, 6); this.o.mouth = Math.min(1, e * 1.5); this.o.lunge = Math.min(1, e); this.setAct('attack', e > 0.8 ? 1 : 0.6); }
      Photo.hitLens('crack', { x: 0.5, y: 0.5 }); Game.sfx('crunch', this.x, 1) || Game.sfx('bonk', this.x, 1);
      this.annoy = 0;
      yield* this.swimTo(this.x + rnd(-200, 200), 900, 90, 3);
    }
    senses(dt, t) { super.senses(dt, t); const m = mk(); if (m && m.inWater && dist(this, m) < 110 && !this.busy(4) && t - this.lastReact > 5) { this.lastReact = t; if (Game.mode === 'camera' || chance(0.5)) this.doTask(this.attackCam(), 5); } }
  }
  // far-away giant on the horizon sea band (projected with parallax)
  class FarWailord extends Mons.Mon {
    constructor() { super(sp('Wailord'), { kind: 'wailord', dex: 'wailord', x: 2200, y: 460, yaw: 0.35, z: 0, scale: 0.026, qPose: 0.08, persona: 'calm' }); this.layer = 'sea'; this.always = true; this.p = 0.12; this.wx = 2200; this.spout = 0; this.visible = true; this.noShadow = true; this.breach = 0; }
    senses() {}
    animate(dt, t) { const P = { tail: Math.sin(t * 0.8) * 0.3, fin: Math.sin(t * 0.6) * 0.3, mouth: 0, eyes: 'open', blow: this.spout, roll: 0 }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        this.setAct('swim', 0.3);
        let e = 0; const T = rnd(18, 34);
        while (e < T) { const dt = yield; e += dt; this.wx += dt * 4; if (this.wx > 3000) this.wx = 1500; if (S.breachReq) break; }
        if (S.breachReq) { S.breachReq = false; yield* this.doBreach(); continue; }
        // spout
        e = 0;
        while (e < 3) { const dt = yield; e += dt; this.spout = Math.sin(Math.min(1, e / 3) * Math.PI); this.setAct('spout', this.spout > 0.7 ? 1 : 0.5); }
        this.spout = 0;
      }
    }
    *doBreach() {
      let e = 0;
      this.p = 0.32;
      Game.sfx('whale', null, 1);
      while (e < 4.5) { const dt = yield; e += dt; const k = e / 4.5; this.breach = Math.sin(k * Math.PI); this.o.roll = k * 0.8; this.setAct('breach', this.breach > 0.8 ? 1 : 0.6); }
      this.breach = 0;
      Game.sfx('rumble', null, 1); Game.shake(3);
      S.swell = 1; S.swellX = 2600;
      this.p = 0.12;
    }
    // world-space position on the sea band (for draw, hit tests and photo framing)
    proj(cx, cy) {
      const hz = Stage.horizonS(cy), seaS = SEA - cy;
      const sy = hz + (seaS - hz) * this.p;
      return [this.wx * 0 + (this.wx - cx) * this.p + (cx * 0) , sy];
    }
    draw(fb, cx, cy, occ) {
      const s = this.spr; if (!s) return;
      const hz = Stage.horizonS(cy), seaS = SEA - cy;
      const sx = Math.round(this.wx * this.p - cx * this.p + fb.w * 0.2 * 0), sy = Math.round(hz + (seaS - hz) * this.p);
      const lift = Math.round(this.breach * s.h * 1.4);
      // store world coords so photo/aim logic can find it
      this.x = sx + cx; this.y = sy + cy + s.h * 0.3 - lift;
      const X = sx - Math.round(s.w / 2), Y = sy - Math.round(s.h * 0.35) - lift;
      this.cpx = [sx, Y + Math.round(s.h * 0.2)];
      const W = fb.w, H = fb.h, d = fb.d, idb = Stage.S.idOn ? Stage.S.idb : null;
      const haze = Pal.LOOK[Stage.S.hour].hazeC;
      for (let yy = 0; yy < s.h; yy++) {
        const ty = Y + yy; if (ty < 0 || ty >= H) continue;
        if (!this.breach && ty > sy + 1) continue; // below the surface
        for (let xx = 0; xx < s.w; xx++) { const c = s.d[yy * s.w + xx]; if (!c) continue; const tx = X + xx; if (tx < 0 || tx >= W) continue; d[ty * W + tx] = U.mix(c, haze, 0.35); if (idb) idb[ty * W + tx] = this.pid || 0; }
      }
      if (this.spout > 0.05) for (let k = 0; k < 18 * this.spout; k++) { const x = sx + Math.round(Math.sin(k * 2.3) * k * 0.4), y = Y + 2 - Math.round(k * 1.2 * this.spout); if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = U.screen(d[y * W + x], 0xffffffff, 0.8); }
      if (this.breach > 0.2) for (let k = 0; k < 30; k++) { const x = sx + Math.round(Math.sin(k * 7.1) * s.w * 0.6), y = sy - Math.round(Math.abs(Math.sin(k * 3.3)) * 12 * this.breach); if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = 0xffffffff; }
    }
    hit(wx, wy) { const b = this.bounds(); return wx > b.x0 && wx < b.x1 && wy > b.y0 && wy < b.y1; }
    bounds() { const s = this.spr; if (!s) return { x0: 0, y0: 0, x1: 0, y1: 0 }; return { x0: this.x - s.w / 2, y0: this.y - s.h, x1: this.x + s.w / 2, y1: this.y }; }
    center() { const b = this.bounds(); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    facing() { return 0.3; }
  }
  class KyogreM extends Swimmer {
    constructor() { super(sp('Kyogre'), { kind: 'kyogre', dex: 'kyogre', x: 12340, y: 1060, yaw: Math.PI - 0.5, z: 0.8, scale: 0.28, qPose: 0.06, qFields: { fin: 0.15, tail: 0.15 }, persona: 'calm', speed: 30, box: { x0: 12060, x1: 12480, y0: 900, y1: 1110 } }); this.swimTop = 20; }
    senses() {}
    animate(dt, t) { const P = { fin: Math.sin(t * 1.2) * 0.5, tail: Math.sin(t * 1.4 + 1) * 0.5, mouth: 0.1, eyes: 'open', glow: 0.6 + 0.4 * Math.sin(t * 2), headPitch: -0.1, roll: 0 }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      Weather.set({ rain: 1, fog: 0.2, storm: 1 });
      Game.sfx('rumble', null, 1);
      HUD.toast('The sea is churning... something huge is rising!', { life: 3 });
      yield* this.swimTo(2980, 760, 40, 12);
      let e = 0;
      while (e < 30) { const dt = yield; e += dt; this.y = 760 + Math.sin(e * 0.7) * 12; this.setAct('rise', 0.8 + 0.2 * Math.sin(e)); this.o.mouth = Math.sin(e * 0.5) > 0.8 ? 1 : 0.1; if (Math.random() < dt * 3) FX.bubbles(this.x + rnd(-40, 40), this.y - 20, 2, SEA); }
      yield* this.swimTo(2980, 935, 30, 10);
      Weather.set({ rain: 0, fog: 0 });
      this.remove();
    }
  }

  /* ================= area helpers ================= */
  let A0 = null;
  function spawn(A, G) {
    A0 = A;
    S.events = {}; S.heartOn = false; S.swell = 0;
    AI.floes.length = 0;
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Spheal')) for (const x of [470, 880]) add(new SphealM(x));
    if (sp('Sealeo')) add(new SealeoM(1010));
    if (sp('Walrein')) add(new WalreinM(A));
    if (sp('Corphish')) { add(new CorphishM(330)); add(new CorphishM(4400, { minX: 4280, maxX: 4640 })); add(new CorphishM(1760, { under: true, minX: 1500, maxX: 2200 })); }
    if (sp('Luvdisc')) for (let i = 0; i < 6; i++) add(new LuvdiscM(1200 + i * 80, SEA + 50 + (i % 3) * 30, i));
    if (sp('Pelipper')) add(new PelipperM(A));
    if (sp('Mantine')) { const m = add(new MantineM()); if (sp('Remoraid')) add(new RemoraidM(m)); }
    if (sp('Corsola')) { add(new CorsolaM(1420)); add(new CorsolaM(2020)); }
    if (sp('Sharpedo')) add(new SharpedoM());
    if (sp('Wingull')) for (let i = 0; i < 2; i++) add(new WingullM(i));
    if (sp('Wailord')) S.wailord = add(new FarWailord());
    // the beach ball
    S.ball = new Critters.BeachBall(610, gy(610) - 11);
    S.ball.kind = 'ball';
    Secrets.spawn(A, G);
  }
  function update(A, dt, t, G) {
    AI.updateFloes(dt, t);
    const b = S.ball;
    if (b) {
      b.step(dt, t);
      // nudge nearby Pokémon when the ball rolls to a stop near them
      if (!b.holder && b.rest > 0.3 && !b.claimed) { for (const m of Mons.all) if (m.ball && m.ball(b)) { b.claimed = true; break; } }
      if (b.holder) b.claimed = false;
      if (Math.abs(b.vx) > 20) b.claimed = false;
      // Mudkip bumps the ball when walking into it
      const mk0 = G.mudkip;
      if (mk0 && !b.holder && Math.abs(mk0.x - b.x) < 16 && Math.abs(mk0.y - 10 - b.y) < 20 && mk0.moving) { b.kick(Math.cos(mk0.yaw) * rnd(90, 150), -rnd(160, 240), mk0); Game.sfx('boing', b.x, 0.8); }
    }
    // heart school at dusk (or a sunset song)
    const dusk = hourIs('dusk');
    S.heartT -= dt;
    if (dusk && !S.heartOn && S.heartT <= 0) { S.heartOn = true; S.heartT = 18; S.heartX = 1500; S.heartY = SEA + 90; S.leap = false; S.leapI = 0; }
    if (S.heartOn && S.heartT <= 0) { S.heartOn = false; S.heartT = 25; S.leap = false; }
    if (!dusk && S.heartOn) S.heartOn = false;
    // swell (after a breach) rolls toward the shore
    if (S.swell > 0) {
      S.swell = Math.max(0, S.swell - dt * 0.07); S.swellX -= dt * 90;
      if (Math.random() < dt * 30) Ripples.poke(S.swellX, -140 * S.swell, 6);
      if (S.swellX < World.shoreX) S.swell = 0;
    }
    // Wailord breach request: a song at the end of the dock at dusk
    Secrets.update(A, dt, t, G);
  }
  function drawFarSea(fb, cx, cy, t, hz, seaS) { if (typeof BackMons !== 'undefined') BackMons.drawSea(fb, cx, cy); if (S.wailord && S.wailord.alive) { S.wailord.draw(fb, cx, cy, null); const c = S.wailord.cpx; S.wailord.ccol = c && c[0] >= 0 && c[1] >= 0 && c[0] < fb.w && c[1] < fb.h ? fb.d[c[1] * fb.w + c[0]] : null; } }
  // after the near backdrop is drawn: is the far giant still visible?
  function checkFar(fb) { const w = S.wailord; if (!w || !w.cpx) return; const c = w.cpx; w.occluded = !(c[0] >= 0 && c[1] >= 0 && c[0] < fb.w && c[1] < fb.h) || fb.d[c[1] * fb.w + c[0]] !== w.ccol; }
  function drawUnderBackdrop(fb, cx, cy, t, C) {
    // distant reef silhouettes, hazy toward the water colour
    const W = fb.w, H = fb.h, d = fb.d;
    const p = 0.5, y0 = Math.round(SEA + 140 - cy * p - (SEA * (1 - p)) + SEA * 0);
    for (let x = 0; x < W; x++) {
      const wx = x + cx * p;
      const h1 = 60 + U.fbm(wx * 0.004, 0.2, 31, 4) * 180;
      const top = Math.round((SEA + 420 - h1) - cy * 1 + (cy - 300) * (1 - p));
      if (top >= H) continue;
      for (let y = Math.max(0, top); y < H; y++) {
        const dep = y + cy - SEA;
        const k = clamp(0.55 + dep / 1600, 0.55, 0.9);
        d[y * W + x] = U.mix(C.deep, C.mid, 1 - k);
      }
    }
  }
  function chest(A) {
    if (!Save.found('beach.chest')) {
      Save.discover('beach.chest');
      A.chest.frames = [Props.chest(A.M, true)];
      FX.sparkles(2330, gy(2330) - 14, 14, 40); FX.bubbles(2330, gy(2330) - 10, 10, SEA); Game.cine.pan(2330, gy(2330) - 20, { hold: 1.6 });
      Game.sfx('chest', 2330, 1); SFX.reward();
      Save.addItem('berry', 3); Save.addItem('blueorb', 1);
      HUD.toast('Found the Blue Orb and 3 berries!', { life: 3.5, icon: 'spark' });
      setTimeout(() => HUD.toast('The Blue Orb glows faintly... like the deepest abyss at the far end of the cove, at night.', { life: 4 }), 1800);
    } else { FX.bubbles(2330, gy(2330) - 10, 4, SEA); Game.sfx('bubble', 2330, 0.6); }
  }
  function boatTap(A, b) { Secrets.boat(A, b); }
  function crystalRock(A, rock) { Secrets.rock(A, rock); }
  const bushT = {};
  function shakeBush(A, x) {
    const now = Game.t;
    if (bushT[x] && now - bushT[x] < 25) { HUD.toast('No berries left on this bush yet.', { life: 1.6 }); Game.sfx('rustle', x, 0.5); return; }
    bushT[x] = now;
    Game.sfx('rustle', x, 1);
    for (let i = 0; i < 2; i++) Items.drop(x + rnd(-6, 6), gy(x) - 16, 'berry');
    Save.addItem('berry', 2);
    HUD.toast('+2 berries', { life: 1.4 });
  }
  function onScan(A) { return Secrets.scan(A); }
  function photoBonus(A, crop, subs, main) {
    const hr = Stage.S.hour;
    const sun = Pal.LOOK[hr].sun;
    if (hr === 'dusk' && subs.length) return { pts: 350, name: 'Sunset glow' };
    if (subs.some((s) => s.sp === 'wailord') && main.sp !== 'wailord') return { pts: 500, name: 'Wailord in the background' };
    if (hr === 'night' && subs.some((s) => s.m.glowOn)) return { pts: 250, name: 'Night lights' };
    return null;
  }

  /* ================= WINGULL ================= */
  class WingullM extends Flyer {
    constructor(i) { super(sp('Wingull'), { kind: 'wingull', dex: 'wingull', x: 1200 + i * 600, y: 380, yaw: 1, z: 2.6, scale: 0.5, qPose: 0.06, qFields: { flap: 0.15, spread: 0.1 }, persona: 'curious', speed: 90 }); this.i = i; this.flapPh = Math.random() * 6; this.hat = null; }
    animate(dt, t) { this.flapPh += dt * (this.glide ? 1.5 : 6); const P = { flap: this.glide ? Math.sin(this.flapPh) * 0.1 : Math.sin(this.flapPh) * 0.8, spread: 1, bill: 0.1, feet: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        const m = mk();
        if (m && m.look && m.look.hat && m.plat && chance(0.02) && !S.hatThief) { yield* this.steal(m); continue; }
        if (Wind.v > 0.95) { yield* this.hover(); continue; }
        const r = Math.random();
        if (r < 0.25) yield* this.dive();
        else yield* this.circle(1500 + this.i * 500 + rnd(-200, 200), 360 + rnd(-40, 40), rnd(90, 180), rnd(5, 10), 'fly');
      }
    }
    *hover() { this.glide = true; let e = 0; while (e < 4 && Wind.v > 0.8) { const dt = yield; e += dt; this.y += Math.sin(e * 2) * dt * 6; this.x -= (Wind.v - 0.6) * dt * 12; this.setAct('glide', 0.8 + 0.2 * Math.sin(e * 3)); } this.glide = false; }
    *dive() {
      const x = this.x + rnd(-60, 60);
      yield* this.flyTo(x, SEA - 70, 100);
      yield* this.flyTo(x + 20, surf(x) - 4, 170, { act: 'dive', peak: (d) => (d < 30 ? 1 : 0.5) });
      FX.splashAt(this.x, surf(this.x), { power: 0.6 }); Game.sfx('plop', this.x, 0.6);
      yield* this.flyTo(this.x + 60, SEA - 110, 100);
    }
    *steal(m) {
      S.hatThief = this;
      yield* this.flyTo(m.x - 80, m.y - 70, 110);
      yield* this.flyTo(m.x, m.y - 30, 180, { act: 'steal', peak: (d) => (d < 30 ? 1 : 0.6) });
      this.hat = m.look.hat; m.look.hat = null; delete m.look.hat;
      this.emote('note'); m.emote('shock');
      HUD.toast('A Wingull stole your hat!', { life: 2.4 });
      this.setAct('steal', 1);
      yield* this.flyTo(3980, gy(3980) - 110, 110, { act: 'steal', peak: () => 0.7 });
      Secrets.dropHat(this.hat);
      this.hat = null; S.hatThief = null;
    }
    drawExtra(fb, cx, cy, P, t) { if (this.hat) { const [hx, hy] = this.at('feet', 0, 4); for (let y = 0; y < 3; y++) for (let x = -3; x <= 3; x++) { const X = Math.round(hx + x - cx), Y = Math.round(hy + y - cy); if (X >= 0 && Y >= 0 && X < fb.w && Y < fb.h) fb.d[Y * fb.w + X] = y === 0 ? 0xff3040d0 : 0xffffffff; } } }
  }

  /* ================= secrets ================= */
  const Secrets = {
    spawn(A, G) {
      if (Save.found('dialga.met') && sp('Dialga')) Legends.dialga(A, G, 990);
      if (Save.found('palkia.met') && sp('Palkia')) Legends.palkia(A, G, 1850);
      S.rockPokes = 0;
    },
    update(A, dt, t, G) {
      const m = G.mudkip;
      // Kyogre: the Blue Orb in the trench at night
      if (!S.kyogre && Save.itemN('blueorb') > 0 && hourIs('night') && m.inWater && m.x > 11860 && m.y > 900 && sp('Kyogre')) { S.kyogre = G.addMon(new KyogreM()); Save.discover('kyogre.woke'); Game.cine.pan(12340, 980, { dur: 1.6, hold: 4, zoom: 1.1 }); }
    },
    song(x) {
      const m = Game.mudkip;
      if (hourIs('dusk') && m.plat && m.x > 1760 && S.wailord) { S.breachReq = true; Game.cine.pan(m.x + 120, m.y - 110, { dur: 1.4, hold: 5, zoom: 1.06 }); HUD.toast('Far out at sea, something answers the song...', { life: 3 }); Save.discover('wailord.song'); }
      if (S.heartOn) { S.leap = true; }
    },
    boat(A, b) {
      if (b.orb && !Save.found('orb.taken')) {
        b.pokes = (b.pokes || 0) + 1; b.shake = 0.5; Game.sfx('knock', b.x, 0.8);
        if (b.pokes >= 2) {
          Save.discover('orb.taken'); b.orb = false;
          b.frames = [Props.boat(A.M, b.frames[0].w - 4, { hull: A.M.boatR })];
          FX.sparkles(b.x, b.y - 10, 16, 40, 0xffffffff, hex('#ffc8f0')); SFX.reward();
          HUD.toast('You found the Lustrous Orb! Space ripples over the dock...', { life: 3.5 });
          if (sp('Palkia')) { Save.discover('palkia.met'); Legends.palkia(A, Game, 1850, true); }
        }
      } else { b.shake = 0.4; Game.sfx('knock', b.x, 0.6); FX.splashAt(b.x + 30, surf(b.x + 30), { power: 0.2, n: 4 }); }
    },
    rock(A, rock) {
      rock.shake = 0.4; Game.sfx('knock', rock.x, 0.8); FX.poof(rock.x, rock.y - 10, Game.P.rock[2], Game.P.rock[3], 3, 3);
      S.rockPokes++;
      if (S.rockPokes >= 3 && !Save.found('dialga.met') && sp('Dialga')) {
        Save.discover('dialga.met'); SFX.reward();
        FX.sparkles(rock.x, rock.y - 16, 14, 30, 0xffffffff, hex('#9fd8ff'));
        HUD.toast('A crystal humming with time was under the rock!', { life: 3.2 });
        Legends.dialga(A, Game, rock.x + 40, true);
      }
    },
    dropHat(hat) {
      const x = 3995, y = gy(3995);
      Stage.A.addHot({ x0: x - 12, x1: x + 12, y0: y - 16, y1: y + 2, x, reach: 30, hat, tap() { this.off = true; const mk0 = Game.mudkip; mk0.look.hat = hat; HUD.toast('Got your hat back!', { life: 2 }); Game.sfx('twinkle', x, 0.8); } });
      FX.sparkles(x, y - 6, 8, 20);
    },
    scan(A) {
      let n = 0;
      const mx = Game.mudkip.x;
      const near = (x) => Math.abs(x - mx) < Game.VW * 0.7;
      if (!Save.found('dialga.met') && near(948)) { FX.sparkles(948, gy(948) - 12, 8, 16, 0xffffffff, hex('#9fd8ff')); HUD.toast('Scan: something humming under that rock...', { life: 2.6 }); n++; }
      for (const b of A.boats) if (b.orb && near(b.x)) { FX.sparkles(b.x, b.y - 8, 8, 20, 0xffffffff, hex('#ffc8f0')); HUD.toast('Scan: a strange glow in that boat.', { life: 2.6 }); n++; }
      if (!Save.found('beach.chest') && near(2330)) { FX.sparkles(2330, gy(2330) - 10, 8, 16); n++; }
      if (Save.itemN('blueorb') > 0 && near(2860)) { HUD.toast('Scan: the Blue Orb pulses when pointed at the trench.', { life: 2.6 }); n++; }
      return n;
    },
  };

  /* ================= legendary visitors ================= */
  const Legends = {
    dialga(A, G, x, entrance = false) {
      const d = new (class extends Walker {
        constructor() { super(sp('Dialga'), { kind: 'dialga', dex: 'dialga', x, y: gy(x), yaw: 1.2, z: 2.4, scale: 0.9, qPose: 0.05, persona: 'curious', speed: 30, minX: x - 120, maxX: x + 120 }); }
        animate(dt, t) { const P = { walk: this.moving ? t * 8 : 0, hop: 0, headPitch: 0, mouth: 0.1, eyes: this.blink(t, dt) ? 'blink' : 'open', gem: 0.5 + 0.5 * Math.sin(t * 3), tailWag: Math.sin(t * 2) * 0.3 }; Object.assign(P, this.o); this.pose = P; }
        brain() { return (function* (s) { for (;;) { s.setAct('idle', 0.5); if (chance(0.5)) yield* s.wander(80); else yield* s.idle(rnd(2, 4)); } })(this); }
        onPoke() { this.doTask(this.roarTime(), 3); }
        *roarTime() {
          yield* this.faceCam(1);
          let e = 0; Game.sfx('dialga', this.x, 1);
          FX.say(() => this.headPt(), 2.2);
          while (e < 1.8) { const dt = yield; e += dt; this.o.roar = Math.min(1, e * 2); this.o.mouth = 1; this.o.gem = 1; this.setAct('roar', e > 0.6 ? 1 : 0.6); }
          Game.nextHour();
        }
      })();
      G.addMon(d);
      if (entrance) { FX.sparkles(x, gy(x) - 30, 20, 50, 0xffffffff, hex('#9fd8ff')); Game.sfx('portal', x, 1); Game.cine.pan(x, gy(x) - 30, { hold: 2.5, zoom: 1.15 }); }
      return d;
    },
    palkia(A, G, x, entrance = false) {
      const p = new (class extends Walker {
        constructor() { super(sp('Palkia'), { kind: 'palkia', dex: 'palkia', x, y: DOCKY, yaw: 1.2, z: 2.4, scale: 0.9, qPose: 0.05, persona: 'calm', speed: 30, minX: 1500, maxX: 1870 }); this.plat = World.platAt(x); }
        animate(dt, t) { const P = { walk: this.moving ? t * 8 : 0, hop: 0, headPitch: 0, mouth: 0.1, eyes: this.blink(t, dt) ? 'blink' : 'open', gem: 0.5 + 0.5 * Math.sin(t * 3), tailWag: Math.sin(t * 2) * 0.3 }; Object.assign(P, this.o); this.pose = P; }
        brain() { return (function* (s) { for (;;) { if (chance(0.3)) yield* s.blink2(); else yield* s.idle(rnd(2, 4), 'blink'); } })(this); }
        *blink2() {
          FX.sparkles(this.x, this.y - 20, 10, 30, 0xffffffff, hex('#ffc8f0')); Game.sfx('portal', this.x, 0.5);
          this.hideK = 1; this.hidden = true; yield* wait(0.3);
          this.x = clamp(this.x + rnd(-160, 160), this.minX, this.maxX); this.hidden = false;
          FX.sparkles(this.x, this.y - 20, 10, 30, 0xffffffff, hex('#ffc8f0'));
          this.setAct('blink', 1); yield* wait(0.6);
        }
        onPoke() { this.doTask(this.rift(), 3); }
        *rift() {
          yield* this.faceCam(1);
          let e = 0; Game.sfx('portal', this.x, 1);
          while (e < 2) { const dt = yield; e += dt; this.o.roar = Math.min(1, e); this.o.mouth = 1; this.setAct('rift', e > 0.8 ? 1 : 0.6); if (Math.random() < dt * 20) FX.add({ type: 'spark', x: this.x + 50 + rnd(-10, 10), y: this.y - 40 + rnd(-30, 30), size: 2, life: 0.4, c: 0xffffffff, c2: hex('#ff9ae8'), layer: 3 }); }
          HUD.toast('A rift to the Space Gallery opened! (Tap Palkia again to enter)', { life: 3 });
          this.riftOpen = true;
        }
      })();
      G.addMon(p);
      if (entrance) { FX.sparkles(x, DOCKY - 30, 20, 50, 0xffffffff, hex('#ffc8f0')); Game.sfx('portal', x, 1); Game.cine.pan(x, DOCKY - 30, { hold: 2.5, zoom: 1.15 }); }
      return p;
    },
  };
  const DOCKY = 496;

  return { S, spawn, update, drawFarSea, checkFar, drawUnderBackdrop, chest, boatTap, crystalRock, shakeBush, onScan, photoBonus, Secrets, Legends, classes: { SphealM, SealeoM, WalreinM, CorphishM, LuvdiscM, PelipperM, MantineM, RemoraidM, CorsolaM, SharpedoM, WingullM, FarWailord, KyogreM } };
})();
