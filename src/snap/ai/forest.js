/* ------------------------------------------------------------------
   ForestAI — Weather Woods' Pokémon and its photo puzzles.
   Chains to discover:
    · the Institute lever cycles the weather: clear → rain → sun → snow.
      Castform changes form to match; snap it mid-change (4★).
      Water Gun on Castform → a soggy Rainy Form sulk.
    · grass that rustles with no wind → scan (or poke) it → a Kecleon
      flashes every colour (3★); throw it a berry → tongue snap (3★);
      once it trusts you it comes close and licks the lens (4★)
    · shake the fruit tree → Tropius eats (2★); stay near and it shares
      its own fruit (4★); splash near it → it takes flight (3★)
    · odd ripples in the quiet pool under the bridge → Water Gun it a few
      times → Feebas (2★). Rain that clears into sunshine → a rainbow →
      Feebas evolves (4★) → Milotic under the rainbow (4★)
    · play a song by the pond → Ludicolo bursts out to dance (3★) and the
      Lotad join in; dance in the rain → a Rain Dance storm (4★)
    · night: Volbeat and Illumise light shows over the pond (3★); sing
      while they dance → they draw a glowing heart in the sky (4★)
------------------------------------------------------------------- */
const ForestAI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach, hex } = U;
  const { wait, until } = Mons;
  const { Walker, Swimmer, Flyer, mk, dist, hourIs, surf } = AI;
  const TAU = Math.PI * 2;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const RIVER = { x0: 930, x1: 1475, level: 578 }, POND = { x0: 2250, x1: 2780, level: 576 };
  const POOL = { x0: 1150, x1: 1250 };
  const GRASS = { x0: 1840, x1: 2020 };
  const STUMP = 2860, TREE = 560, LEVER = 1760, BANK = 2195;
  const WEATHERS = ['clear', 'rain', 'sun', 'snow'];
  let S = {}, A0 = null, G0 = null;
  const wet = () => Weather.W.rain > 0.45;
  // a generator that just holds an act for a while
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }

  /* ================= CASTFORM ================= */
  class CastformM extends Mons.Mon {
    constructor(x) {
      super(sp('Castform'), { kind: 'castform', dex: 'castform', x, y: gy(x) - 44, yaw: 1.3, z: 2.2, scale: 0.62, qPose: 0.05, qFields: { bob: 0.1, spin: 0.2, tilt: 0.1, squash: 0.1, mouth: 0.25 }, persona: 'curious', mode: 'float' });
      this.form = 'normal'; this.speed = 38; this.hover = 44; this.minX = 1500; this.maxX = 2100; this.senseR = 150;
      this.spin = 0; this.sq = 0; this.wetT = 0; this.fxT = 0;
    }
    want() {
      if (this.wetT > 0) return 'rainy';
      if (S.weather === 'snow' && Weather.W.snow > 0.3) return 'snowy';
      if (wet()) return 'rainy';
      if (S.weather === 'sun') return 'sunny';
      return 'normal';
    }
    physics(dt, t) {
      this.y = lerp(this.y, gy(this.x) - this.hover, Math.min(1, dt * 3));
      this.wetT = Math.max(0, this.wetT - dt);
      // a little weather of its own
      this.fxT -= dt;
      if (this.fxT <= 0 && this.spr) {
        this.fxT = this.form === 'normal' ? 9 : rnd(0.15, 0.4);
        const b = this.at('bottom');
        if (this.form === 'rainy') FX.add({ type: 'drop', x: b[0] + rnd(-5, 5), y: b[1], vx: 0, vy: 20, g: 300, life: 0.8, c: hex('#bfe8ff'), c2: hex('#6ab8ff'), size: 2, floor: gy(this.x), layer: 2 });
        else if (this.form === 'snowy') FX.add({ type: 'spark', x: b[0] + rnd(-8, 8), y: b[1] - rnd(0, 20), size: 1, life: 0.9, c: 0xffffffff, c2: hex('#bfe0ff'), layer: 3 });
        else if (this.form === 'sunny') FX.add({ type: 'spark', x: this.x + rnd(-12, 12), y: this.y - rnd(10, 34), size: 1, life: 0.6, c: 0xffffffff, c2: hex('#ffc040'), layer: 3 });
      }
    }
    animate(dt, t) {
      const P = { form: this.form, bob: 0.5 + 0.5 * Math.sin(t * 2.2 + this.seed), mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', spin: this.spin, tilt: Math.sin(t * 1.3 + this.seed) * 0.25, squash: this.sq };
      if (this.form === 'rainy' && this.wetT > 0) { P.eyes = 'closed'; P.mouth = 0.3; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1));
      for (;;) {
        const f = this.want();
        if (f !== this.form) { yield* this.transform(f); continue; }
        const r = Math.random();
        if (r < 0.4) yield* this.glideTo(clamp(this.x + rnd(-220, 220), this.minX, this.maxX), this.speed);
        else if (r < 0.58) yield* this.twirl();
        else yield* hold(this, rnd(2, 4), this.form, (e) => 0.3 + 0.2 * Math.sin(e * 2), () => this.want() !== this.form);
      }
    }
    *glideTo(tx, speed) {
      for (let g = 0; g < 2000; g++) {
        const dt = yield;
        const dx = tx - this.x; if (Math.abs(dx) < 3) break;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt); this.moving = speed;
        this.turn(this.face(Math.sign(dx), true), dt, 4);
        this.setAct(this.form, 0.3);
        if (this.want() !== this.form) return;
      }
    }
    *twirl() {
      let e = 0; const T = 1.1;
      Game.sfx('twinkle', this.x, 0.35);
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.spin = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * TAU; this.o.eyes = 'happy'; this.o.mouth = 0.8; this.setAct(this.form, k > 0.2 && k < 0.8 ? 0.9 : 0.5); }
      this.spin = 0;
    }
    *transform(f) {
      let e = 0, switched = false; const T = 1.5;
      this.emote('sparkle', 1);
      Game.sfx('sparkle', this.x, 0.8);
      while (e < T) {
        const dt = yield; e += dt; const k = e / T;
        this.spin = k * TAU * 2;
        if (!switched && k >= 0.5) {
          switched = true; this.form = f; this.sq = 0.7;
          FX.sparkles(this.x, this.y - 16, 12, 26, 0xffffffff, hex(f === 'sunny' ? '#ffc040' : f === 'rainy' ? '#6ab8ff' : f === 'snowy' ? '#d8f0ff' : '#ffffff'));
          FX.add({ type: 'ring', x: this.x, y: this.y - 16, r0: 4, r1: 26, life: 0.5, c: 0xffffffff, layer: 3 });
          Game.sfx('pop', this.x, 0.9);
        }
        if (switched) this.sq = approach(this.sq, 0, dt * 2.2); else this.sq = -0.35 * Math.sin(k * 2 * Math.PI);
        this.tint = 0xffffffff; this.tintK = Math.max(0, 1 - Math.abs(k - 0.5) * 4) * 0.85;
        this.setAct('change', k > 0.3 && k < 0.75 ? 1 : 0.6);
      }
      this.spin = 0; this.sq = 0; this.tintK = 0;
      this.emote(f === 'sunny' ? 'star' : f === 'rainy' ? 'drop' : f === 'snowy' ? 'sparkle' : 'note', 1.2);
    }
    *attackCam() {
      this.emote('anger', 1);
      yield* this.faceCam(1);
      let e = 0;
      const c2 = hex(this.form === 'sunny' ? '#ffb040' : this.form === 'rainy' ? '#5ab4ff' : this.form === 'snowy' ? '#d8f0ff' : '#ffffff');
      Game.sfx('whoosh', this.x, 0.8);
      while (e < 1.1) { const dt = yield; e += dt; this.o.mouth = 1; this.setAct('attack', e > 0.55 ? 1 : 0.6); const [mx, my] = this.at('mouth'); FX.add({ type: 'spark', x: mx + rnd(-4, 4), y: my + rnd(-4, 4) + 4, size: 1 + Math.round(e * 2), life: 0.3, c: 0xffffffff, c2, layer: 4 }); }
      Photo.hitLens(this.form === 'rainy' ? 'splash' : this.form === 'snowy' ? 'frost' : 'bump');
      this.annoy = 0;
      yield* wait(0.6);
    }
    onPoke() {
      this.annoy += 0.3;
      if (this.annoy > 0.85) { this.doTask(this.attackCam(), 5); return; }
      Game.sfx('squeak', this.x, 0.6);
      this.doTask(this.twirl(), 2);
    }
    onWater() {
      if (this.form === 'snowy') { this.emote('anger'); this.annoy += 0.3; return; }
      this.wetT = 9; this.emote('sweat', 1); this.annoy += 0.15;
    }
    onSong() { this.doTask((function* (s) { yield* s.faceCam(0.8); let e = 0; while (e < 3) { const dt = yield; e += dt; s.o.eyes = 'happy'; s.o.mouth = 0.9; s.o.tilt = Math.sin(e * 6) * 0.8; s.setAct(s.form, 0.8); } })(this), 2); }
  }

  /* ================= KECLEON ================= */
  class KecleonM extends Walker {
    constructor(x) {
      super(sp('Kecleon'), { kind: 'kecleon', dex: 'kecleon', x, y: gy(x), yaw: Math.PI / 2 + 0.3, z: 1.8, scale: 0.34, qPose: 0.05, qFields: { tongue: 0.1, step: 0.5, eyeL: 0.5, eyeR: 0.5, mouth: 0.25, tail: 0.25, arms: 0.25, lean: 0.25, tongueAim: 0.5 }, persona: 'shy', speed: 34, minX: GRASS.x0 - 80, maxX: GRASS.x1 + 80 });
      this.hidden = true; this.hideK = 1; this.stepPh = 0; this.revealT = 0; this.senseR = 110; this.zd = -2; this.lastLick = -99; this.trust = 0; this.home = x; this.range = 120;
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 7;
      const P = { step: this.moving ? this.stepPh : 0, tongue: 0, tongueAim: 0, tail: 0.5, eyeL: Math.round(Math.sin(t * 0.9 + this.seed) * 2) / 2, eyeR: Math.round(Math.sin(t * 0.63 + 2 + this.seed) * 2) / 2, mouth: 0, arms: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', lean: 0 };
      Object.assign(P, this.o);
      this.pose = P;
    }
    update(dt, t) {
      super.update(dt, t);
      if (!this.hidden && !this.busy(4)) { this.revealT -= dt; if (this.revealT <= 0 && this.trust <= 0) this.hidden = true; }
      this.trust = Math.max(0, this.trust - dt);
      if (this.trust > 0) this.persona = 'curious'; else this.persona = 'shy';
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (this.hidden) { yield* this.lurk(); continue; }
        const r = Math.random();
        if (r < 0.5) yield* this.idle(rnd(1.5, 3), 'reveal');
        else yield* this.walkTo(clamp(this.x + rnd(-80, 80), this.minX, this.maxX), this.speed, { act: 'reveal' });
      }
    }
    *lurk() {
      // hidden in the grass — now and then the grass moves with no wind
      yield* hold(this, rnd(3.5, 7), 'hide', 0, () => !this.hidden);
      if (!this.hidden) return;
      rustle(this.x);
      if (chance(0.45)) yield* this.walkTo(clamp(this.x + rnd(-50, 50), GRASS.x0 + 12, GRASS.x1 - 12), 18);
      // at night it hunts the glowing bugs that stray too low
      const bug = Mons.all.find((m) => m.kind === 'volbeat' && Math.abs(m.x - this.x) < 90 && m.y > gy(m.x) - 80);
      if (bug && chance(0.5)) yield* this.snapAt(bug);
    }
    *flee(m) {
      if (this.hidden) { yield* this.walkTo(clamp(this.x + (this.x < m.x ? -70 : 70), GRASS.x0 + 10, GRASS.x1 - 10), 50); return; }
      yield* super.flee(m);
    }
    reveal() {
      if (!this.hidden) return false;
      this.hidden = false; this.revealT = 16;
      this.doTask(this.startled(), 4);
      return true;
    }
    *startled() {
      this.emote('shock', 1);
      Game.sfx('squeak', this.x, 0.7);
      const cols = ['#ff5a5a', '#ffd84a', '#5ae07a', '#5ab4ff', '#c07aff', '#ff8ad0'].map(hex);
      let e = 0;
      while (e < 1.7) { const dt = yield; e += dt; this.tint = cols[Math.floor(e * 9) % cols.length]; this.tintK = 0.55 * (1 - e / 1.7) + 0.15; this.o.arms = 1; this.o.mouth = 0.7; this.o.eyeL = 1; this.o.eyeR = 1; this.o.lean = -0.4; this.setAct('colors', e > 0.25 && e < 1.4 ? 1 : 0.6); }
      this.tintK = 0;
      yield* this.faceCam(0.7);
      yield* hold(this, 1.4, 'reveal', 0.8);
    }
    *snapAt(target) {
      // a tongue lash at something (a berry item or a low-flying bug)
      const isItem = !(target instanceof Mons.Mon);
      const reach = 46;
      if (Math.abs(target.x - this.x) > reach) yield* this.walkTo(target.x + (this.x < target.x ? -reach : reach), isItem ? 60 : 30);
      yield* this.faceTo(target.x > this.x ? 1 : -1, false);
      if (isItem && target.eaten) return;
      const was = this.hidden; this.hidden = false;
      const aim = clamp((this.y - 30 - target.y) / -40, -1, 1);
      let e = 0, got = false;
      Game.sfx('tongue', this.x, 0.8);
      while (e < 0.95) {
        const dt = yield; e += dt;
        const k = e < 0.22 ? e / 0.22 : e < 0.45 ? 1 : Math.max(0, 1 - (e - 0.45) / 0.35);
        this.o.tongue = k; this.o.tongueAim = isItem ? -1 : -aim; this.o.eyeL = 1; this.o.eyeR = 1; this.o.lean = 0.3;
        this.setAct('tongue', k > 0.9 ? 1 : 0.65);
        if (k >= 1 && isItem && !target.eaten) got = true;
        if (got && e > 0.45) { const tip = this.at('tongueTip'); target.x = tip[0]; target.y = tip[1]; target.state = 'held'; }
        if (!isItem && k >= 1 && !got) { got = true; target.emote('anger', 1); target.doTask(target.dodge(this), 4); }
      }
      if (isItem) {
        Items.eat(target); Game.sfx('gulp', this.x, 0.6);
        yield* hold(this, 1, 'tongue', 0.4);
        this.emote('heart'); this.trust = 30; this.revealT = 30;
        if (was) Save.discover('kecleon.found');
      } else { this.hidden = was; }
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
      if ((this.trust > 0 && d < 90 && Game.mode === 'camera') || (this.trust > 0 && d < 40)) { this.lastLick = t; this.doTask(this.lick(m), 5); }
    }
    onFood(it) {
      if ((it.kind !== 'berry' && it.kind !== 'pecha') || Math.abs(it.x - this.x) > 230 || World.waterAt(it.x) !== null || this.busy(4)) return false;
      this.doTask(this.snapAt(it), 4);
      return true;
    }
    onPoke() { if (this.hidden) { this.reveal(); return; } super.onPoke(); if (this.trust <= 0 && !this.busy(4)) this.doTask(this.flee(mk()), 4); }
    onScan() { if (this.hidden && Math.abs(mk().x - this.x) < Game.VW * 0.6) { this.reveal(); HUD.toast('Scan: a hidden Kecleon!', { life: 2 }); return true; } return false; }
    onWater() { if (this.hidden) this.reveal(); else { this.annoy += 0.3; this.emote('anger'); } }
  }

  /* ================= TROPIUS ================= */
  class TropiusM extends Walker {
    constructor(x) {
      super(sp('Tropius'), { kind: 'tropius', dex: 'tropius', x, y: gy(x), yaw: Math.PI - 0.95, z: 1.2, scale: 0.26, qPose: 0.05, qFields: { step: 0.5, flap: 0.25, neck: 0.2, mouth: 0.25, look: 0.25 }, persona: 'calm', speed: 26, minX: 220, maxX: 900 });
      this.stepPh = 0; this.senseR = 140; this.zd = -3; this.smell = 460;
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 4.5;
      const P = { step: this.moving ? this.stepPh : 0, flap: Math.round(Math.sin(t * 0.8 + this.seed) * 2) * 0.04, neck: 0, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', look: 0, hold: 0 };
      if (this.sleeping) { P.eyes = 'closed'; P.neck = -0.6; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (hourIs('night')) { yield* this.napUntil(() => !hourIs('night'), 60); continue; }
        const r = Math.random();
        if (r < 0.35) yield* this.walkTo(clamp(this.x + rnd(-180, 180), this.minX, this.maxX), this.speed, { act: 'walk' });
        else if (r < 0.6) yield* this.graze();
        else yield* this.idle(rnd(2, 4), 'walk');
      }
    }
    *graze() { let e = 0; const T = rnd(2.5, 4); while (e < T) { const dt = yield; e += dt; this.o.neck = -0.85; this.o.mouth = Math.sin(e * 6) > 0.3 ? 0.4 : 0; this.setAct('walk', 0.3); } }
    onFood(it) {
      if (it.kind !== 'fruit' || this.sleeping || this.busy(3)) return false;
      this.doTask(this.eat(it), 3);
      return true;
    }
    *eat(it) {
      yield* this.walkTo(it.x + (this.x < it.x ? -30 : 30), 55, { act: 'walk' });
      yield* this.faceTo(it.x > this.x ? 1 : -1, false);
      if (!it.eaten) {
        let e = 0, bit = false;
        while (e < 2.2) { const dt = yield; e += dt; const dip = Math.min(1, e / 0.5); this.o.neck = -dip; this.o.mouth = e > 0.5 ? (Math.sin(e * 14) > 0 ? 0.7 : 0.1) : 0; this.o.eyes = e > 0.8 ? 'happy' : 'open'; this.setAct('eat', e > 0.6 && e < 1.9 ? 1 : 0.5); if (e > 0.5 && !bit) { bit = true; Items.eat(it); Game.sfx('munch', this.x, 0.6); } }
        this.emote('heart'); this.ate = (this.ate || 0) + 1;
        if (this.ate === 1) HUD.toast('Tropius is happy! Tap it to go for a ride.', { life: 2.6 });
      }
      const more = Items.nearest(this.x, 220, (q) => q.kind === 'fruit' && !q.eaten && q.state !== 'fly');
      if (more) { yield* this.eat(more); return; }
      const m = mk();
      if (m && Math.abs(m.x - this.x) < 170 && !S.shared) yield* this.share(m);
    }
    *share(m) {
      S.shared = true;
      this.emote('bulb', 1);
      yield* this.walkTo(m.x + (this.x < m.x ? -44 : 44), 40, { act: 'walk' });
      yield* this.faceTo(m.x > this.x ? 1 : -1, false);
      let e = 0;
      while (e < 3.6) { const dt = yield; e += dt; const k = Math.min(1, e / 0.8); this.o.neck = -0.55 * k; this.o.hold = e > 0.6 ? 1 : 0; this.o.eyes = 'happy'; this.setAct('share', e > 0.9 && e < 3.2 ? 1 : 0.6); }
      m.emote('heart', 1.4); m.happyT = 1;
      Save.addItem('berry', 1);
      HUD.toast('Tropius shared its fruit with you! (+1 berry)', { life: 2.6 });
    }
    hear(kind, x, amt) {
      super.hear(kind, x, amt);
      if (kind === 'splash' && Math.abs(x - this.x) < 260 && !this.busy(3) && !this.sleeping) this.doTask(this.fly(), 3);
    }
    onWater() { if (!this.busy(4)) this.doTask(this.fly(), 4); }
    *fly() {
      this.emote('shock', 0.8);
      Game.sfx('whoosh', this.x, 0.8);
      this.mode = 'air';
      const x0 = this.x, dir = this.x < 560 ? 1 : -1;
      let e = 0; const T = 7.5;
      while (e < T) {
        const dt = yield; e += dt; const k = e / T;
        const lift = Math.sin(k * Math.PI);
        this.x = clamp(x0 + dir * Math.sin(k * Math.PI) * 260, 120, 1000);
        this.y = gy(this.x) - lift * 150 - Math.sin(e * 3.5) * 3;
        this.o.flap = Math.sin(e * 5.5) * (0.7 + 0.3 * lift); this.o.neck = 0.35 + Math.sin(e * 5.5 + 1) * 0.1; this.o.step = Math.PI * 0.5; this.o.mouth = lift > 0.8 ? 0.3 : 0;
        this.turn(this.face(dir * Math.cos(k * Math.PI) >= 0 ? 1 : -1, true), dt, 3);
        this.setAct('fly', lift > 0.35 ? 1 : 0.6);
        if (Math.random() < dt * 3) FX.add({ type: 'drop', x: this.x + rnd(-20, 20), y: this.y - 30, vx: rnd(-20, 20), vy: 10, g: 60, life: 1.6, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 2, floor: gy(this.x), layer: 3 });
      }
      this.mode = 'land';
      FX.poof(this.x, gy(this.x), hex('#a8742e'), hex('#c89040'), 5, 5);
    }
    // a ride on Tropius: Mudkip climbs on its back and they fly across the woods
    *ride(m) {
      S.riding = true;
      m.wakeUp(); m.target = null;
      m.doTask((function* () { while (S.riding) yield; })(), 6);
      HUD.toast('All aboard! Tropius takes to the sky.', { life: 2.2 });
      Game.sfx('whoosh', this.x, 1);
      this.mode = 'air'; this.emote('heart');
      const x0 = this.x, dir = x0 < 1600 ? 1 : -1, span = 1300;
      let e = 0; const T = 16;
      while (e < T) {
        const dt = yield; e += dt; const k = e / T;
        const lift = Math.min(1, Math.sin(k * Math.PI) * 1.6);
        const px = this.x;
        this.x = clamp(x0 + dir * Math.sin(k * Math.PI) * span, 140, World.W - 140);
        this.y = gy(this.x) - lift * 170 - Math.sin(e * 2.2) * 6;
        const vx = (this.x - px) / Math.max(dt, 0.016);
        if (Math.abs(vx) > 3) this.turn(this.face(Math.sign(vx), true), dt, 3);
        this.o.flap = Math.sin(e * 5) * (0.6 + 0.4 * lift); this.o.neck = 0.4; this.o.eyes = 'happy'; this.o.step = Math.PI * 0.5;
        this.setAct('fly', lift > 0.4 ? 1 : 0.6);
        // Mudkip sits on its back, holding on
        const b = this.at('body', 0, -14);
        m.x = b[0]; m.y = b[1]; m.yaw = this.yaw; m.mode = 'ride'; m.o.legF = -0.6; m.o.legB = 0.6; m.happyT = 0.2;
        m.o.tailWag = Math.sin(e * 6) * 0.3;
        if (Math.random() < dt * 4) FX.add({ type: 'drop', x: this.x + rnd(-24, 24), y: this.y - 20, vx: rnd(-20, 20), vy: 10, g: 50, life: 1.8, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 2, floor: gy(this.x), layer: 3 });
      }
      this.mode = 'land';
      m.mode = 'land'; m.x = this.x + (this.x > 1600 ? -30 : 30); m.y = gy(m.x); m.plat = null;
      S.riding = false;
      FX.poof(this.x, gy(this.x), hex('#a8742e'), hex('#c89040'), 6, 6);
      Save.discover('tropius.ride');
    }
    onPoke() {
      const m0 = mk();
      if (this.ate > 0 && !this.busy(3) && !this.sleeping && m0.mode === 'land') { this.doTask(this.ride(m0), 5); return; }
      if (this.ate <= 0 && Math.random() < 0.5) HUD.toast('Tropius sniffs you... it looks hungry for fruit.', { life: 2 });
      if (!S.shared && Game.t - S.treeT < 40 && !Items.nearest(this.x, 400, (q) => q.kind === 'fruit' && !q.eaten)) { this.doTask(this.share(mk()), 3); return; }
      this.emote('note'); Game.sfx('grr', this.x, 0.3);
      this.doTask(hold(this, 1.2, 'walk', 0.5), 2);
    }
  }

  /* ================= FEEBAS / MILOTIC ================= */
  class FeebasM extends Swimmer {
    constructor(x, y) {
      super(sp('Feebas'), { kind: 'feebas', dex: 'feebas', x, y, yaw: 0.5, z: 1.6, scale: 0.4, qPose: 0.06, qFields: { tail: 0.25, fins: 0.25, mouth: 0.25, bend: 0.2, roll: 0.2 }, persona: 'shy', speed: 20, box: { x0: POOL.x0, x1: POOL.x1, y0: RIVER.level + 14, y1: RIVER.level + 54 } });
      this.swimTop = 12; this.swimBot = 8; this.senseR = 80;
    }
    animate(dt, t) { const P = { tail: Math.round(Math.sin(t * (3 + this.moving * 0.05) + this.seed) * 3) / 4, mouth: Math.sin(t * 1.3) > 0.7 ? 0.5 : 0.1, eyes: this.blink(t, dt) ? 'blink' : 'open', fins: Math.sin(t * 4) > 0 ? 0.6 : 0.3, bend: 0, roll: 0 }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (S.rainbow > 2 && !S.milotic && !this.evolving) { yield* this.evolve(); return; }
        yield* this.cruise(rnd(3, 6), 'swim');
        if (chance(0.3)) yield* hold(this, rnd(1, 2.5), 'swim', 0.4);
      }
    }
    *splashOut() {
      this.mode = 'air';
      const x0 = this.x, s0 = surf(x0);
      let e = 0; const T = 1.3;
      FX.splashAt(x0, s0, { power: 0.8 }); Game.sfx('splash', x0, 0.9);
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = x0 + k * 30; this.y = s0 + 10 - Math.sin(k * Math.PI) * 58; this.o.bend = Math.sin(e * 16) * 0.8; this.o.mouth = 1; this.o.fins = 1; this.setAct('splash', k > 0.25 && k < 0.75 ? 1 : 0.6); }
      FX.splashAt(this.x, s0, { power: 0.7 }); Game.sfx('splash', this.x, 0.7);
      this.mode = 'swim'; this.y = s0 + 20;
    }
    *evolve() {
      this.evolving = true;
      yield* this.swimTo((POOL.x0 + POOL.x1) / 2, RIVER.level + 16, 30, 4);
      HUD.toast('What? Feebas is evolving!', { life: 3 });
      Game.sfx('evolve', this.x, 1);
      this.mode = 'air';
      let e = 0; const T = 4.6, y0 = this.y;
      while (e < T) {
        const dt = yield; e += dt; const k = e / T;
        this.y = lerp(y0, RIVER.level - 22, Math.min(1, k * 2)) + Math.sin(e * 3) * 2;
        this.tint = 0xffffffff; this.tintK = Math.min(1, k * 1.6) * (0.75 + 0.25 * Math.sin(e * 14));
        this.o.fins = 1; this.o.eyes = 'closed'; this.o.bend = Math.sin(e * 8) * 0.3 * (1 - k);
        this.setAct('evolve', k > 0.25 ? 1 : 0.6);
        if (Math.random() < dt * 30) FX.add({ type: 'spark', x: this.x + rnd(-32, 32), y: this.y - rnd(-10, 44), size: 1 + (Math.random() * 2 | 0), life: 0.6, c: 0xffffffff, c2: hex('#bfe8ff'), layer: 3 });
      }
      Game.shake(2); FX.sparkles(this.x, this.y - 20, 30, 80, 0xffffffff, hex('#ffc8f0'));
      S.flash = 1;
      Save.discover('forest.milotic');
      S.milotic = G0.addMon(new MiloticM(clamp(this.x, RIVER.x0 + 100, RIVER.x1 - 100), true));
      HUD.toast('Feebas evolved into Milotic!', { life: 3 });
      this.remove(); S.feebas = null;
    }
    onPoke() { this.emote('sweat', 0.8); this.doTask(this.cruise(2, 'swim'), 3); }
  }
  class MiloticM extends Swimmer {
    constructor(x, entrance = false) {
      super(sp('Milotic'), { kind: 'milotic', dex: 'milotic', x, y: RIVER.level + 30, yaw: 1.25, z: 1.4, scale: 0.26, qPose: 0.05, qFields: { coil: 0.35, rise: 0.1, hair: 0.25, mouth: 0.25 }, persona: 'calm', speed: 16, box: { x0: RIVER.x0 + 100, x1: RIVER.x1 - 100, y0: RIVER.level + 28, y1: RIVER.level + 34 } });
      this.swimTop = 24; this.swimBot = -40; this.noShadow = true; this.senseR = 120; this.layer = 'near';
      if (entrance) { this.tint = 0xffffffff; this.tintK = 1; }
    }
    animate(dt, t) {
      this.tintK = Math.max(0, (this.tintK || 0) - dt * 0.6);
      const P = { coil: t * 0.9 + this.seed, rise: 1, hair: Math.sin(t * 0.7 + this.seed) * 0.6, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (S.rainbow > 0) { yield* this.bask(); continue; }
        yield* this.cruise(rnd(5, 9), 'swim');
        yield* hold(this, rnd(2, 4), 'swim', 0.5);
      }
    }
    *bask() {
      yield* this.faceCam(0.6);
      let e = 0;
      while (S.rainbow > 0 && e < 12) { const dt = yield; e += dt; this.o.eyes = e % 4 < 3 ? 'happy' : 'open'; this.o.mouth = Math.sin(e * 1.5) > 0.6 ? 0.6 : 0; this.setAct('rainbow', 0.7 + 0.3 * Math.abs(Math.sin(e * 0.9))); if (Math.random() < dt * 6) FX.add({ type: 'spark', x: this.x + rnd(-30, 30), y: this.y - rnd(20, 90), size: 1, life: 0.8, c: 0xffffffff, c2: hex('#ffc8f0'), layer: 3 }); }
    }
    onPoke() { this.emote('heart', 1.4); Game.sfx('chime', this.x, 0.5); for (const m of Mons.all) if (Math.abs(m.x - this.x) < 500) m.annoy = 0; }
  }

  /* ================= LOTAD ================= */
  class LotadM extends Mons.Mon {
    constructor(x, body) {
      super(sp('Lotad'), { kind: 'lotad', dex: 'lotad', x, y: body.level, yaw: 0.8, z: 1.7, scale: 0.4, qPose: 0.06, qFields: { step: 0.5, tilt: 0.2, swim: 0.5, mouth: 0.25 }, persona: 'curious', mode: 'float' });
      this.body = body; this.noShadow = true; this.senseR = 110; this.speed = 18; this.sink = 11; this.lift = 0;
    }
    physics(dt, t) { this.y = surf(this.x) + this.sink - this.lift; }
    animate(dt, t) {
      const P = { step: 0, tilt: Math.round(Math.sin(t * 1.4 + this.seed) * 2) * 0.08, swim: 1, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.moving) P.step = t * 6;
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0, 2));
      for (;;) {
        if (wet()) { yield* this.rainBath(); continue; }
        const b = this.body;
        const tx = clamp(this.x + rnd(-130, 130), b.x0 + 40, b.x1 - 40);
        for (let g = 0; g < 2000; g++) { const dt = yield; const dx = tx - this.x; if (Math.abs(dx) < 3 || wet()) break; this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * dt); this.moving = this.speed; this.turn(this.face(Math.sign(dx), true), dt, 3); this.setAct('swim', 0.3); if (Math.random() < dt * 1.5) FX.add({ type: 'ripple', x: this.x - Math.sign(dx) * 8, y: surf(this.x) + 1, r0: 1, r1: 7, flat: 0.3, life: 0.8, c: 0xffffffff, layer: 2 }); }
        yield* hold(this, rnd(1.5, 4), 'swim', 0.3, wet);
      }
    }
    *rainBath() {
      let e = 0;
      while (wet() && e < 10) { const dt = yield; e += dt; const b = Math.abs(Math.sin(e * 3)); this.o.eyes = 'happy'; this.o.mouth = 0.8; this.o.tilt = Math.sin(e * 3) * 0.4; this.lift = b * 3; this.setAct('rain', 0.6 + 0.4 * b); }
      this.lift = 0;
    }
    *dance(T = 5) {
      yield* wait(rnd(0.1, 0.5));
      let e = 0;
      while (e < T) { const dt = yield; e += dt; const b = Math.abs(Math.sin(e * 5)); this.lift = b * 9; this.o.tilt = Math.sin(e * 5) * 0.6; this.o.eyes = 'happy'; this.o.mouth = 1; this.o.swim = 0.5; this.setAct('dance', b > 0.8 ? 1 : 0.6); if (b < 0.08 && Math.random() < 0.5) FX.splashAt(this.x, surf(this.x), { power: 0.15, n: 3 }); }
      this.lift = 0;
    }
    onSong() { this.doTask(this.dance(), 3); }
    onPoke() { this.emote('note'); this.doTask(this.dance(1.5), 2); }
  }

  /* ================= LUDICOLO ================= */
  class LudicoloM extends Walker {
    constructor() {
      super(sp('Ludicolo'), { kind: 'ludicolo', dex: 'ludicolo', x: 2420, y: POND.level + 40, yaw: Math.PI / 2 - 0.35, z: 1.9, scale: 0.28, qPose: 0.05, qFields: { dance: 0.35, mouth: 0.25, lean: 0.2 }, persona: 'showoff', speed: 40, minX: 2140, maxX: 2240 });
      this.mode = 'hidden'; this.visible = false; this.senseR = 160; this.leftT = -99; this.zd = 1;
    }
    physics(dt, t) { if (this.mode === 'land') super.physics(dt, t); }
    animate(dt, t) { const P = { dance: 0, groove: 1, mouth: 0.2, eyes: this.blink(t, dt) ? 'blink' : 'open', lean: 0 }; Object.assign(P, this.o); this.pose = P; }
    senses(dt, t) { if (this.visible) super.senses(dt, t); }
    brain() { return (function* (s) { for (;;) { s.setAct('dance', 0); yield; } })(this); }
    *show() {
      // burst out of the pond and land on the bank
      this.visible = true; this.mode = 'air';
      const x0 = 2400, x1 = BANK, s0 = surf(x0);
      this.x = x0; this.y = s0 + 30;
      FX.splashAt(x0, s0, { power: 1.1 }); Game.sfx('splash', x0, 1);
      HUD.toast('The music drew a Ludicolo out of the pond!', { life: 2.6 });
      let e = 0; const T = 1.2;
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = lerp(x0, x1, k); this.y = lerp(s0 + 30, gy(x1), k) - Math.sin(k * Math.PI) * 90; this.o.mouth = 1; this.o.eyes = 'happy'; this.setAct('dance', 0.6); }
      this.mode = 'land'; this.zd = 1;
      FX.poof(this.x, gy(this.x), hex('#a8742e'), hex('#c89040'), 6, 6); Game.sfx('thud', this.x, 0.8);
      Save.discover('forest.ludicolo');
      for (const m of Mons.all) if (m.kind === 'lotad' && m.body === POND) m.doTask(m.dance(14), 3);
      yield* this.faceCam(0.9);
      // dance while the party lasts
      e = 0; let beat = 0, rainDance = 0;
      const T2 = 22;
      while (e < T2) {
        const dt = yield; e += dt;
        const ph = e * 6.2;
        this.o.dance = ph; this.o.mouth = 0.5 + 0.5 * Math.abs(Math.sin(ph)); this.o.eyes = Math.sin(ph * 0.5) > 0.9 ? 'closed' : 'happy';
        const peak = Math.abs(Math.sin(ph)) > 0.85 ? 1 : 0.65;
        if (wet()) {
          rainDance += dt; this.setAct('raindance', peak);
          if (rainDance > 3 && !S.storm) { S.storm = 16; Weather.set({ rain: 1, fog: 0.3, storm: 1 }); HUD.toast('Rain Dance! The rain grows into a storm!', { life: 2.6 }); Game.sfx('rumble', null, 1); }
        } else this.setAct('dance', peak);
        if (Math.floor(ph / Math.PI) > beat) { beat = Math.floor(ph / Math.PI); Game.sfx('bongo', this.x, 0.5); if (beat % 2 === 0) FX.add({ type: 'icon', icon: beat % 4 ? 'note' : 'music2', x: this.x + rnd(-14, 14), y: this.y - 70, vx: rnd(-10, 10), vy: -22, life: 1.3, layer: 3 }); }
      }
      // back into the pond
      this.mode = 'air';
      const bx = this.x, by = this.y;
      e = 0;
      while (e < 1) { const dt = yield; e += dt; const k = e; this.x = lerp(bx, 2400, k); this.y = lerp(by, surf(2400) + 30, k) - Math.sin(k * Math.PI) * 70; this.setAct('dance', 0.5); }
      FX.splashAt(2400, surf(2400), { power: 1 }); Game.sfx('splash', 2400, 0.9);
      this.visible = false; this.mode = 'hidden'; this.leftT = Game.t;
    }
    onPoke() { this.emote('music2', 1); }
  }

  /* ================= VOLBEAT / ILLUMISE ================= */
  class BugM extends Flyer {
    constructor(spName, kind, i, o) {
      super(sp(spName), Object.assign({ kind, dex: kind, x: 2100 + i * 150 + rnd(-40, 40), y: 300, yaw: 1, z: 2.4, qPose: 0.06, qFields: { flap: 0.34, arms: 0.25, glow: 0.25, lean: 0.25, mouth: 0.25 }, speed: 55 }, o));
      this.i = i; this.flapPh = Math.random() * 6; this.glow = 0.6; this.leave = false;
      this.gl = { x: this.x, y: this.y, r: 16, c: hex(kind === 'volbeat' ? '#d8ff8a' : '#ffc8f0'), a: 0, k: 1 };
      A0.glows.push(this.gl);
    }
    remove() { super.remove(); const j = A0.glows.indexOf(this.gl); if (j >= 0) A0.glows.splice(j, 1); }
    physics(dt, t) {
      super.physics(dt, t);
      const tl = this.spr ? this.at(this.kind === 'volbeat' ? 'tail' : 'body') : [this.x, this.y];
      this.gl.x = Math.round(tl[0]); this.gl.y = Math.round(tl[1]);
      this.gl.a = this.kind === 'volbeat' ? 0.25 + this.glow * 0.45 : 0.18;
      this.gl.r = this.kind === 'volbeat' ? 10 + Math.round(this.glow * 10) : 12;
    }
    animate(dt, t) {
      this.flapPh += dt * 20;
      const P = { flap: Math.sin(this.flapPh), arms: 0, lean: clamp(this.vx * 0.004, -0.3, 0.3), mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.kind === 'volbeat') P.glow = this.glow;
      Object.assign(P, this.o);
      this.pose = P;
    }
    *dodge(from) { yield* this.flyTo(this.x + (this.x < from.x ? -90 : 90), this.y - 70, 140); }
    *go() { this.emote('swirl', 0.8); yield* this.flyTo(this.x + rnd(-200, 200), -80, 90); this.remove(); }
    // slot position in the current light show
    slot(t) {
      const n = Mons.all.filter((m) => m.kind === 'volbeat').length || 1;
      const ph = S.showPh;
      if (this.kind === 'illumise') return S.heart ? [2520 + Math.sin(ph) * 10, 440 + Math.sin(ph * 2) * 6] : [2520 + Math.sin(ph * 0.9) * 150, 430 + Math.sin(ph * 1.8) * 40];
      if (S.heart) {
        const a = ph * 0.7 + (this.i / n) * TAU;
        const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        return [2520 + hx * 4.4, 432 + hy * 4.4];
      }
      const q = ph - (this.i + 1) * 0.42;
      return [2520 + Math.sin(q * 0.9) * 150, 430 + Math.sin(q * 1.8) * 40];
    }
    brain() { return this.life(); }
    *life() {
      yield* this.flyTo(this.x, 400 + rnd(-30, 40), 60);
      for (;;) {
        if (this.leave) { yield* this.go(); return; }
        if (S.showOn) { yield* this.perform(); continue; }
        // free flight: wander over the pond, tails pulsing
        const tx = rnd(2150, 2900), ty = rnd(380, 500);
        yield* this.flyTo(tx, ty, 40, { act: this.kind === 'volbeat' ? 'glow' : 'fly', peak: () => 0.3 + 0.3 * this.glow, stop: () => S.showOn || this.leave, agile: 1.5 });
        this.glow = 0.5 + 0.5 * Math.sin(Game.t * 2 + this.i);
      }
    }
    *perform() {
      while (S.showOn && !this.leave) {
        const dt = yield;
        const [tx, ty] = this.slot(Game.t);
        const px = this.x;
        this.x = lerp(this.x, tx, Math.min(1, dt * 5)); this.y = lerp(this.y, ty, Math.min(1, dt * 5));
        this.vx = (this.x - px) / Math.max(dt, 0.016); this.moving = Math.abs(this.vx);
        if (Math.abs(this.vx) > 6) this.turn(this.face(Math.sign(this.vx), true), dt, 5);
        if (this.kind === 'volbeat') {
          this.glow = 1;
          this.setAct(S.heart ? 'heart' : 'show', Math.hypot(tx - this.x, ty - this.y) < 8 ? 1 : 0.7);
          if (Math.random() < dt * (S.heart ? 26 : 14)) { const tl = this.at('tail'); FX.add({ type: 'spark', x: tl[0], y: tl[1], size: 1, life: S.heart ? 1.8 : 0.9, c: 0xffffffff, c2: hex('#c8ff7a'), layer: 3 }); }
        } else {
          this.o.arms = 0.8 + Math.sin(Game.t * 4) * 0.2; this.setAct('lead', 1);
          if (Math.random() < dt * 8) FX.add({ type: 'spark', x: this.x + rnd(-10, 10), y: this.y - rnd(0, 24), size: 1, life: 1, c: 0xffffffff, c2: hex('#ffb0e0'), layer: 3 });
        }
      }
    }
    onPoke() { this.emote('note', 0.8); Game.sfx('chirp', this.x, 0.6); }
    onSong() { if (hourIs('night', 'dusk')) S.heartReq = true; }
  }

  /* ================= area helpers ================= */
  function applyWeather(w) {
    S.weather = w; S.natRain = 0;
    if (w === 'rain') Weather.set({ rain: 1, fog: 0.25, storm: S.storm > 0 ? 1 : 0 });
    else if (w === 'snow') Weather.set({ snow: 1, fog: 0.2 });
    else Weather.set({ rain: 0, fog: w === 'sun' ? 0 : hourIs('dawn') ? 0.4 : 0.08 });
    S.storm = 0;
  }
  function spawn(A, G, S0) {
    S = S0; A0 = A; G0 = G;
    Object.assign(S, { weather: 'clear', leverT: -9, rainClock: rnd(60, 100), natRain: 0, rainbow: 0, rbT: 0, rainWas: 0, storm: 0, shared: false, treeT: -99, poolTries: 0, flash: 0, showOn: false, showT: 6, showPh: 0, heart: false, heartReq: false, bugs: null, feebas: null, milotic: null, ludi: null, rainSnd: 0, bushT: {} });
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Castform')) add(new CastformM(1680));
    if (sp('Kecleon')) add(new KecleonM(1930));
    if (sp('Tropius')) add(new TropiusM(720));
    if (sp('Lotad')) { add(new LotadM(1040, RIVER)); add(new LotadM(1360, RIVER)); add(new LotadM(2380, POND)); add(new LotadM(2620, POND)); }
    if (sp('Ludicolo')) S.ludi = add(new LudicoloM());
    if (sp('Feebas') && Save.found('forest.feebas')) S.feebas = add(new FeebasM(1200, RIVER.level + 30));
    if (sp('Milotic') && Save.found('forest.milotic')) S.milotic = add(new MiloticM(1300));
    if (hourIs('night', 'dusk')) spawnBugs(true);
  }
  function spawnBugs(instant = false) {
    if (!sp('Volbeat')) return;
    S.bugs = [];
    for (let i = 0; i < 5; i++) { const b = G0.addMon(new BugM('Volbeat', 'volbeat', i, { scale: 0.3, persona: 'showoff' })); if (instant) b.y = 420 + rnd(-40, 40); S.bugs.push(b); }
    if (sp('Illumise')) { const b = G0.addMon(new BugM('Illumise', 'illumise', 5, { scale: 0.32, persona: 'calm' })); if (instant) b.y = 430; S.bugs.push(b); }
    S.showT = 8;
  }
  function update(A, dt, t, G) {
    // natural showers when the machine is idle
    if (S.weather === 'clear') {
      if (S.natRain > 0) { S.natRain -= dt; if (S.natRain <= 0) { Weather.set({ rain: 0, fog: 0.1 }); S.rainClock = rnd(100, 160); } }
      else { S.rainClock -= dt; if (S.rainClock <= 0) { S.natRain = rnd(24, 36); Weather.set({ rain: 0.85, fog: 0.2 }); HUD.toast('Clouds gather over the woods... rain!', { life: 2.2 }); } }
    }
    // rain that clears into sunshine → a rainbow
    const r = Weather.W.rain;
    if (r > 0.6) S.rainWas = 1;
    if (S.rainWas && r < 0.2) {
      S.rainWas = 0;
      if (!hourIs('night') && S.weather !== 'snow') { S.rainbow = 50; S.rbT = 0; Game.sfx('chime', null, 0.7); HUD.toast(Save.found('forest.rainbow') ? 'A rainbow!' : 'A rainbow arcs over the woods! Rare Pokémon love rainbows...', { life: 3 }); Save.discover('forest.rainbow'); }
    }
    if (S.rainbow > 0) { S.rainbow -= dt; S.rbT += dt; }
    if (S.storm > 0) { S.storm -= dt; if (S.storm <= 0) { S.storm = 0; Weather.set(S.weather === 'rain' ? { rain: 1, fog: 0.25 } : S.weather === 'snow' ? { snow: 1, fog: 0.2 } : { rain: 0, fog: 0.1 }); } }
    // patter of rain
    if (r > 0.3) { S.rainSnd -= dt; if (S.rainSnd <= 0) { S.rainSnd = 2.8; Game.sfx('rain', null, r * 0.6); } }
    // night lights
    const night = hourIs('night', 'dusk');
    if (night && !S.bugs) spawnBugs();
    if (!night && S.bugs) { for (const b of S.bugs) b.leave = true; S.bugs = null; S.showOn = false; }
    if (S.bugs) {
      S.showT -= dt; S.showPh += dt;
      if (!S.showOn && (S.showT <= 0 || S.heartReq)) { S.showOn = true; S.heart = !!S.heartReq; S.heartReq = false; S.showT = S.heart ? 16 : 12; S.showPh = 0; if (S.heart) HUD.toast('The Volbeat answer your song...', { life: 2.4 }); }
      else if (S.showOn) {
        if (S.heartReq && !S.heart) { S.heart = true; S.heartReq = false; S.showT = Math.max(S.showT, 14); HUD.toast('The Volbeat answer your song...', { life: 2.4 }); }
        if (S.showT <= 0) { S.showOn = false; S.heart = false; S.showT = rnd(14, 22); }
      }
    }
    S.flash = Math.max(0, S.flash - dt * 1.5);
  }
  // Kecleon's giveaway: grass moving with no wind
  function rustle(x) {
    for (const p of A0.props) if (p.windFrames && Math.abs(p.x - x) < 16) p.shake = 0.5;
    for (let i = 0; i < 3; i++) FX.add({ type: 'drop', x: x + rnd(-8, 8), y: gy(x) - rnd(10, 26), vx: rnd(-20, 20), vy: -rnd(20, 50), g: 200, life: 0.9, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 2, floor: gy(x), layer: 3 });
    Game.sfx('rustle', x, 0.45);
  }
  function lever(A) {
    if (Game.t - S.leverT < 2.5) { HUD.toast('The machine is still whirring...', { life: 1.4 }); return; }
    S.leverT = Game.t;
    const i = (WEATHERS.indexOf(S.weather) + 1) % WEATHERS.length;
    const w = WEATHERS[i];
    applyWeather(w);
    A.lever.frames = [Props2.lever(A.M, i % 2 === 1)];
    A.lever.shake = 0.6;
    Game.sfx('lever', LEVER, 1); Game.shake(1.2);
    FX.sparkles(LEVER, gy(LEVER) - 26, 8, 16, 0xffffffff, hex('#9fe8ff'));
    HUD.toast({ clear: 'Weather machine: CLEAR skies.', rain: 'Weather machine: RAIN! Clouds roll in.', sun: 'Weather machine: HARSH SUNLIGHT!', snow: 'Weather machine: SNOW?! In a rainforest!' }[w], { life: 2.6 });
    Save.discover('forest.lever');
  }
  function shakeTree(A) {
    const tr = A.fruitTree;
    if (Game.t - S.treeT < 30) { tr.shake = 0.4; Game.sfx('rustle', TREE, 0.6); HUD.toast('No ripe fruit left... yet.', { life: 1.6 }); return; }
    S.treeT = Game.t; S.shared = false;
    tr.shake = 1; Game.sfx('rustle', TREE, 1); Game.shake(0.8);
    for (let i = 0; i < 3; i++) setTimeout(() => Items.drop(TREE + rnd(-40, 40), gy(TREE) - rnd(90, 120), 'fruit'), i * 180);
    for (let i = 0; i < 8; i++) FX.add({ type: 'drop', x: TREE + rnd(-60, 60), y: gy(TREE) - rnd(80, 140), vx: rnd(-20, 20), vy: 0, g: 80, life: 1.8, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 2, floor: gy(TREE), layer: 3 });
    HUD.toast('Fruit tumbles down from the tree!', { life: 1.8 });
  }
  function bush(A, x) {
    if (S.bushT[x] && Game.t - S.bushT[x] < 25) { HUD.toast('No berries left on this bush yet.', { life: 1.6 }); Game.sfx('rustle', x, 0.5); return; }
    S.bushT[x] = Game.t;
    Game.sfx('rustle', x, 1);
    for (let i = 0; i < 2; i++) Items.drop(x + rnd(-6, 6), gy(x) - 16, 'berry');
    Save.addItem('berry', 2);
    HUD.toast('+2 berries', { life: 1.4 });
  }
  // the quiet pool under the bridge: Water Gun (or poke) the odd ripples
  function fish() {
    if (S.feebas && S.feebas.alive) { HUD.toast('Feebas hides shyly in the quiet pool.', { life: 2 }); return; }
    if (!sp('Feebas')) return;
    S.poolTries++;
    FX.add({ type: 'ripple', x: 1205, y: RIVER.level + 1, r0: 2, r1: 18, flat: 0.3, life: 1.4, c: 0xffffffff, layer: 2 });
    if (S.poolTries < 3) { HUD.toast(S.poolTries === 1 ? 'Just ripples...' : 'Something flickered under the water!', { life: 2 }); Game.sfx('plop', 1200, 0.6); return; }
    S.poolTries = 0;
    const f = G0.addMon(new FeebasM(1200, RIVER.level + 30));
    f.doTask(f.splashOut(), 5);
    S.feebas = f;
    Save.discover('forest.feebas');
    HUD.toast('A Feebas splashed out of the quiet pool!', { life: 3 });
  }
  function pool(A) { fish(); }
  function water(tx, ty) {
    if (tx > POOL.x0 - 20 && tx < POOL.x1 + 20 && ty > RIVER.level - 30) fish();
  }
  function song(x) {
    if (S.ludi && S.ludi.mode === 'hidden' && x > POND.x0 - 180 && x < STUMP + 90 && Game.t - S.ludi.leftT > 12) S.ludi.doTask(S.ludi.show(), 5);
    if (S.bugs && x > 2050) S.heartReq = true;
  }
  function onScan(A) {
    let n = 0;
    const mx = mk().x, near = (x) => Math.abs(x - mx) < Game.VW * 0.7;
    if (S.ludi && S.ludi.mode === 'hidden' && near(2450)) { FX.bubbles(2400, POND.level + 20, 4, POND.level); HUD.toast('Scan: something in the pond bubbles happily whenever there is music.', { life: 3 }); n++; }
    if (Game.t - S.treeT > 30 && near(TREE)) { FX.sparkles(TREE, gy(TREE) - 110, 6, 30, 0xffffffff, hex('#ffd850')); HUD.toast('Scan: ripe fruit up in that tree. Tropius love it.', { life: 2.6 }); n++; }
    if (S.bugs && near(STUMP)) { HUD.toast('Scan: the Volbeat dance to music under the stars.', { life: 2.6 }); n++; }
    if (S.feebas && S.feebas.alive && !S.milotic) { HUD.toast('Scan: Feebas gazes at the sky, as if waiting for colours...', { life: 3 }); n++; }
    return n;
  }
  // after-rain rainbow, drawn over the sky behind the forest layers
  const RB = ['#ff4a4a', '#ff9a3a', '#ffe24a', '#6ad84a', '#4aa8ff', '#6a6aff', '#b46aff'].map(hex);
  function rainbowK() { return clamp(S.rbT / 3, 0, 1) * clamp(S.rainbow / 5, 0, 1); }
  function drawRainbow(fb, cx, cy, t, k) {
    if (k <= 0.01) return;
    const W = fb.w, H = fb.h, d = fb.d;
    const hz = Stage.horizonS(cy);
    const X0 = W * 0.5 + (1900 - (cx + W * 0.5)) * 0.08, Y0 = hz + 60;
    const R = Math.max(W, H) * 0.6, bw = 3, n = RB.length;
    const r1 = R, r0 = R - bw * n;
    const yEnd = Math.min(H, Math.round(hz + 70));
    for (let y = Math.max(0, Math.floor(Y0 - r1)); y < yEnd; y++) {
      const dy = y - Y0, dy2 = dy * dy;
      if (dy2 > r1 * r1) continue;
      const xo = Math.sqrt(r1 * r1 - dy2), xi = dy2 < r0 * r0 ? Math.sqrt(r0 * r0 - dy2) : 0;
      const vf = clamp((hz + 70 - y) / 110, 0, 1);
      for (const s of [-1, 1]) {
        const xa = Math.floor(X0 + s * xi), xb = Math.floor(X0 + s * xo);
        const lo = Math.max(0, Math.min(xa, xb)), hi = Math.min(W - 1, Math.max(xa, xb));
        for (let x = lo; x <= hi; x++) {
          const u = (r1 - Math.hypot(x - X0, dy)) / (bw * n);
          if (u < 0 || u >= 1) continue;
          const bi = Math.min(n - 1, Math.floor(u * n));
          const a = k * vf * (0.26 + 0.08 * Math.sin(t * 0.8 + x * 0.01));
          if (a < 0.01) continue;
          d[y * W + x] = U.screen(d[y * W + x], RB[bi], a);
        }
      }
    }
  }
  function post(A, fb, cx, cy, t) {
    const d = fb.d, N = d.length;
    if (S.weather === 'sun' && !hourIs('night')) { const c = hex('#ffe0a0'); for (let i = 0; i < N; i++) d[i] = U.screen(d[i], c, 0.07); }
    if (S.flash > 0.01) { const k = Math.round(S.flash * 200); for (let i = 0; i < N; i++) d[i] = U.mixk(d[i], 0xffffffff, k); }
  }
  function photoBonus(A, crop, subs, main) {
    if (S.rainbow > 0) return { pts: 600, name: 'Under the rainbow' };
    if (S.heart && subs.some((s) => s.sp === 'volbeat')) return { pts: 500, name: 'Heart of light' };
    if (Weather.W.snow > 0.5) return { pts: 300, name: 'Rainforest snow' };
    if (Weather.W.rain > 0.5) return { pts: 200, name: 'Rainy mood' };
    return null;
  }
  return { spawn, update, lever, shakeTree, bush, pool, water, song, onScan, drawRainbow, rainbowK, post, photoBonus, get S() { return S; }, classes: { CastformM, KecleonM, TropiusM, FeebasM, MiloticM, LotadM, LudicoloM, BugM } };
})();
