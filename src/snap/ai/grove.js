/* ------------------------------------------------------------------
   GroveAI — more Weather Woods residents.
    · Zigzagoon trot in zig-zags and sniff the ground (2★); toss a berry
      and they zoom after it (3★); now and then one digs up a treasure
      for you (4★)
    · Surskit skate on the pond (1★), glide in long streaks (2★), twirl
      in circles when it rains (3★) and hop over a Lotad's pad (4★)
    · Shroomish bounce around the mushrooms (1★), nap in the shade (2★),
      puff sleepy spores when startled (3★ — careful!), and at dusk they
      gather on the giant mushroom to bounce together (4★)
    · Seedot hang in the fruit tree pretending to be acorns (1★); shake
      the tree and they drop with a thump (3★), waddle about and polish
      themselves with leaves (2★), then spring back up. Give a hanging one
      a drink with Water Gun and it turns glossy (4★)
    · Slakoth loll on a log (and on Treetop Town's great branch): sleep
      (1★), scratch (2★), a huge yawn (3★), and yawns are catching —
      stand close and Mudkip yawns along (4★)
    · Plusle and Minun hop (1★) and play tag (2★); they cheer when Mudkip
      plays on the mushroom or the vine, or when music plays (3★), and
      cheering side by side they spark together (4★)
------------------------------------------------------------------- */
const GroveAI = (() => {
  const { clamp, lerp, rnd, pick, chance, hex } = U;
  const { wait } = Mons;
  const { Walker, mk, hourIs, surf } = AI;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const POND = { x0: 2250, x1: 2780, level: 576 }, MUSH = 2188, TREE = 560;
  let S = {};
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }

  /* ================= ZIGZAGOON ================= */
  class ZigzagoonM extends Walker {
    constructor(x, minX, maxX) {
      super(sp('Zigzagoon'), { kind: 'zigzagoon', dex: 'zigzagoon', x, y: gy(x), yaw: 1, z: 1.9, scale: 0.5, qPose: 0.06, qFields: { step: 0.5, sniff: 0.25, tail: 0.34, mouth: 0.25, lean: 0.25 }, persona: 'curious', speed: 55, minX, maxX });
      this.stepPh = 0; this.senseR = 130; this.zd = 1;
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * (6 + this.moving * 0.08);
      const P = { step: this.moving ? this.stepPh : 0, sniff: 0, tail: Math.round(Math.sin(t * 6 + this.seed) * 2) / 2, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', lean: this.moving > 80 ? 0.3 : 0 };
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1.5));
      for (;;) {
        if (hourIs('night') && chance(0.5)) { yield* this.napUntil(() => !hourIs('night'), 40); continue; }
        const r = Math.random();
        if (r < 0.45) yield* this.zigzag(clamp(this.x + rnd(-220, 220), this.minX, this.maxX), this.speed);
        else if (r < 0.85) yield* this.sniff();
        else yield* this.idle(rnd(1, 2.5), 'walk');
      }
    }
    // the famous zig-zag: short diagonal dashes, turning back and forth toward the goal
    *zigzag(tx, speed, act = 'walk') {
      let leg = 0;
      for (let g = 0; g < 60 && Math.abs(tx - this.x) > 6; g++) {
        leg++;
        const dir = Math.sign(tx - this.x), len = Math.min(Math.abs(tx - this.x), rnd(28, 50));
        this.zd = leg % 2 ? -3 : 3; // weave across the depth of the path
        yield* this.walkTo(this.x + dir * len, speed, { act, turn: 14 });
        if (Math.random() < 0.3) FX.add({ type: 'dust', x: this.x, y: this.y - 1, vx: -dir * 20, vy: -6, r: 2, life: 0.35, c: 0xffd8ecf4, c2: 0xffb0c8d8, layer: 2 });
      }
      this.zd = 1;
    }
    *sniff() {
      let e = 0; const T = rnd(1.8, 3);
      while (e < T) { const dt = yield; e += dt; this.o.sniff = 0.8 + Math.sin(e * 14) * 0.2; this.o.tail = Math.sin(e * 10); this.setAct('sniff', 0.5 + 0.5 * Math.abs(Math.sin(e * 3))); }
      // Pickup: sometimes it digs up a little treasure and brings it to Mudkip
      if (Math.random() < 0.12 && Game.t - (S.findT || -99) > 45) yield* this.find();
    }
    *find() {
      S.findT = Game.t;
      let e = 0; Game.sfx('dust', this.x, 0.6);
      while (e < 1.2) { const dt = yield; e += dt; this.o.sniff = 1; this.setAct('find', e > 0.5 ? 1 : 0.6); if (Math.random() < dt * 20) FX.add({ type: 'drop', x: this.x + rnd(-6, 6), y: gy(this.x) - 2, vx: rnd(-40, 40), vy: -rnd(40, 90), g: 420, life: 0.6, c: 0xff4a6a8a, size: 1, floor: gy(this.x), layer: 2 }); }
      FX.sparkles(this.x, this.y - 14, 8, 14, 0xffffffff, hex('#ffe08a'));
      this.emote('sparkle', 1.2);
      const m = mk();
      if (m && Math.abs(m.x - this.x) < 300) {
        yield* this.zigzag(m.x + (this.x < m.x ? -26 : 26), 70, 'find');
        yield* this.faceCam(0.5);
        yield* hold(this, 1.4, 'find', 1);
        Save.addPoints(50); Save.addItem('berry', 1);
        HUD.toast('Zigzagoon found something for you! (+1 berry, +50)', { life: 2.4 });
        Save.discover('zigzagoon.pickup');
      }
    }
    onFood(it) { if (this.sleeping || this.busy(3) || Math.abs(it.x - this.x) > 360 || World.waterAt(it.x) !== null) return false; this.doTask(this.chase(it), 3); return true; }
    *chase(it) {
      this.emote('shock', 0.6);
      yield* this.zigzag(it.x + (this.x < it.x ? -12 : 12), 125, 'zoom');
      if (it.eaten) return;
      let e = 0; while (e < 1) { const dt = yield; e += dt; this.o.sniff = 0.6; this.o.mouth = Math.sin(e * 18) > 0 ? 0.8 : 0.1; this.setAct('zoom', 0.6); }
      Items.eat(it); this.emote('heart');
    }
    onSong() { if (!this.sleeping) this.doTask(this.zigzag(clamp(this.x + rnd(-160, 160), this.minX, this.maxX), 120, 'zoom'), 2); }
  }

  /* ================= SURSKIT ================= */
  class SurskitM extends Mons.Mon {
    constructor(x) {
      super(sp('Surskit'), { kind: 'surskit', dex: 'surskit', x, y: POND.level, yaw: 0.9, z: 2, scale: 0.46, qPose: 0.06, qFields: { skate: 0.5, bob: 0.25, legs: 0.25, mouth: 0.25 }, persona: 'shy', mode: 'float' });
      this.noShadow = true; this.senseR = 100; this.lift = 0; this.vx = 0;
    }
    physics(dt, t) { this.y = surf(this.x) + 2 - this.lift; }
    animate(dt, t) { const P = { skate: this.moving ? t * 9 : 0, bob: 0.5 + 0.5 * Math.sin(t * 3 + this.seed), legs: 0.6, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0, 1.5));
      for (;;) {
        if (Weather.W.rain > 0.45) { yield* this.twirl(); continue; }
        const r = Math.random();
        if (r < 0.55) yield* this.glide(clamp(this.x + rnd(-180, 180), POND.x0 + 30, POND.x1 - 30));
        else if (r < 0.7) yield* this.hopPad();
        else yield* hold(this, rnd(1, 3), 'skate', 0.3);
      }
    }
    *glide(tx) {
      const d = Math.sign(tx - this.x);
      yield* this.faceTo(d, true);
      let v = 140;
      for (let g = 0; g < 400 && Math.abs(tx - this.x) > 3; g++) {
        const dt = yield;
        v = Math.max(28, v - dt * 90);
        this.x += d * Math.min(Math.abs(tx - this.x), v * dt); this.moving = v;
        this.setAct(v > 90 ? 'glide' : 'skate', v > 100 ? 1 : 0.5);
        if (Math.random() < dt * 14) FX.add({ type: 'ripple', x: this.x - d * 6, y: surf(this.x) + 1, r0: 1, r1: 6, flat: 0.3, life: 0.7, c: 0xffffffff, layer: 2 });
      }
    }
    *twirl() {
      const cx0 = this.x; let e = 0;
      while (Weather.W.rain > 0.45 && e < 8) {
        const dt = yield; e += dt;
        this.x = clamp(cx0 + Math.sin(e * 3) * 26, POND.x0 + 20, POND.x1 - 20); this.moving = 60;
        this.yaw = Math.PI / 2 + Math.cos(e * 3) * 1.2; this.o.eyes = 'happy'; this.o.mouth = 0.8;
        this.setAct('rain', 0.7 + 0.3 * Math.abs(Math.sin(e * 3)));
        if (Math.random() < dt * 20) FX.add({ type: 'ripple', x: this.x, y: surf(this.x) + 1, r0: 1, r1: 8, flat: 0.3, life: 0.8, c: 0xffffffff, layer: 2 });
      }
    }
    // hop over a Lotad drifting nearby
    *hopPad() {
      const l = Mons.all.find((q) => q.kind === 'lotad' && q.body && q.body.level === POND.level && Math.abs(q.x - this.x) < 160);
      if (!l) { yield* hold(this, 1, 'skate', 0.3); return; }
      const d = Math.sign(l.x - this.x) || 1;
      yield* this.glide(l.x - d * 26);
      const x0 = this.x, x1 = clamp(l.x + d * 30, POND.x0 + 20, POND.x1 - 20);
      let e = 0; Game.sfx('boing', this.x, 0.4);
      while (e < 0.7) { const dt = yield; e += dt; const k = e / 0.7; this.x = lerp(x0, x1, k); this.lift = Math.sin(k * Math.PI) * 34; this.o.legs = 1; this.setAct('hop', k > 0.3 && k < 0.7 ? 1 : 0.6); }
      this.lift = 0; FX.add({ type: 'ripple', x: this.x, y: surf(this.x) + 1, r0: 2, r1: 12, flat: 0.3, life: 1, c: 0xffffffff, layer: 2 });
      if (l.emote) l.emote('shock', 0.8);
    }
    onPoke() { this.emote('sweat', 0.8); this.doTask(this.glide(clamp(this.x + (this.x < mk().x ? -150 : 150), POND.x0 + 30, POND.x1 - 30)), 3); }
  }

  /* ================= SHROOMISH ================= */
  class ShroomishM extends Walker {
    constructor(x, home) {
      super(sp('Shroomish'), { kind: 'shroomish', dex: 'shroomish', x, y: gy(x), yaw: 1.2, z: 1.8, scale: 0.46, qPose: 0.06, qFields: { hop: 0.2, spore: 0.25, step: 0.5, mouth: 0.25, tilt: 0.25 }, persona: 'grumpy', speed: 30, minX: home - 140, maxX: home + 140 });
      this.home = home; this.senseR = 90; this.air2 = 0;
    }
    animate(dt, t) { const P = { hop: this.hopK || 0, spore: 0, step: this.moving ? t * 8 : 0, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', tilt: Math.round(Math.sin(t * 0.9 + this.seed) * 2) * 0.1 }; if (this.sleeping) P.eyes = 'closed'; Object.assign(P, this.o); this.pose = P; }
    physics(dt, t) { super.physics(dt, t); this.y -= this.air2; }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1.5));
      for (;;) {
        if (hourIs('dusk') && S.party) { yield* this.party(); continue; }
        if (hourIs('noon', 'afternoon') && chance(0.25)) { yield* this.napUntil(() => false, rnd(6, 12)); continue; }
        const r = Math.random();
        if (r < 0.6) yield* this.bounceTo(clamp(this.x + rnd(-90, 90), this.minX, this.maxX));
        else yield* this.idle(rnd(1.2, 3), 'hop');
      }
    }
    *bounceTo(tx) {
      const d = Math.sign(tx - this.x) || 1;
      yield* this.faceTo(d, true);
      for (let g = 0; g < 12 && Math.abs(tx - this.x) > 4; g++) {
        const x0 = this.x, x1 = this.x + d * Math.min(Math.abs(tx - this.x), 22);
        let e = 0; const T = 0.42;
        while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = lerp(x0, x1, k); this.air2 = Math.sin(k * Math.PI) * 14; this.hopK = k < 0.15 ? 0.8 : k > 0.85 ? 0.8 : -0.4; this.moving = 30; this.setAct('hop', k > 0.3 && k < 0.7 ? 0.7 : 0.4); }
        this.air2 = 0; this.hopK = 0;
      }
    }
    *spores() {
      this.emote('anger', 0.8);
      let e = 0; Game.sfx('dust', this.x, 0.8);
      while (e < 1.6) {
        const dt = yield; e += dt; const k = Math.min(1, e / 0.3);
        this.o.spore = k; this.o.hop = 0.6; this.setAct('spore', e > 0.3 && e < 1.2 ? 1 : 0.6);
        if (Math.random() < dt * 40) FX.add({ type: 'dust', x: this.x + rnd(-24, 24), y: this.y - 20 + rnd(-16, 10), vx: rnd(-20, 20), vy: -rnd(4, 16), r: 2 + Math.random() * 3, life: 1.4, c: hex('#e8f0a0'), c2: hex('#b8c870'), layer: 3 });
      }
      const m = mk();
      if (m && Math.abs(m.x - this.x) < 70 && m.mode === 'land') { m.dizzy = 2.5; HUD.toast('Achoo! Sleepy spores... Mudkip feels drowsy.', { life: 2 }); if (Game.mode === 'camera') Photo.hitLens('smear'); }
      this.annoy = 0;
    }
    *party() {
      // everyone bounces on the giant mushroom together
      const slot = (Mons.all.filter((q) => q.kind === 'shroomish').indexOf(this) - 1) * 16;
      yield* this.bounceTo(MUSH + slot);
      let e = 0;
      while (S.party && hourIs('dusk') && e < 14) {
        const dt = yield; e += dt;
        const k = (e * 1.6) % 1;
        this.air2 = Math.sin(k * Math.PI) * 22; this.hopK = k < 0.12 || k > 0.88 ? 0.8 : -0.4; this.o.eyes = 'happy'; this.o.mouth = 0.8;
        this.setAct('party', k > 0.35 && k < 0.65 ? 1 : 0.6);
        if (k < 0.04 && Math.random() < 0.3) Game.sfx('boing', this.x, 0.3);
      }
      this.air2 = 0; this.hopK = 0;
    }
    onPoke() { this.annoy += 0.4; this.doTask(this.spores(), 4); }
    onWater() { this.doTask(this.spores(), 4); }
    attackCam() { return this.spores(); }
  }

  /* ================= SEEDOT ================= */
  const SEEDOT_S = 0.5, SEEDOT_H = 88 * SEEDOT_S;
  class SeedotM extends Mons.Mon {
    constructor(i, hx, hy) {
      super(sp('Seedot'), { kind: 'seedot', dex: 'seedot', x: hx, y: hy + SEEDOT_H, yaw: Math.PI / 2 + (i - 1) * 0.25, z: 1.9, scale: SEEDOT_S, qPose: 0.06, qFields: { hang: 0.25, step: 0.5, squash: 0.25, tilt: 0.1, mouth: 0.25 }, persona: 'shy', mode: 'hang' });
      this.i = i; this.hx = hx; this.hy = hy; this.hangK = 1; this.swing = 0; this.sq = 0; this.gloss = 0; this.stepPh = 0;
      this.noShadow = true; this.senseR = 80; this.home = hx; this.range = 150; this.speed = 22;
    }
    physics(dt, t) {
      this.swing *= Math.pow(0.35, dt);
      if (this.mode === 'hang') { this.x = this.hx; this.y = this.hy + SEEDOT_H; this.noShadow = true; }
      else if (this.mode === 'land') { super.physics(dt, t); this.noShadow = false; }
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 9;
      const breeze = this.mode === 'hang' ? Math.sin(t * 1.4 + this.seed) * 0.12 * (typeof Wind !== 'undefined' ? 0.6 + Wind.v : 1) : 0;
      const P = { hang: this.hangK, step: this.moving ? this.stepPh : 0, squash: this.sq, tilt: clamp(breeze + Math.sin(t * 7) * this.swing, -1, 1), eyes: this.blink(t, dt) ? 'blink' : 'open', mouth: 0 };
      if (this.mode === 'hang' && hourIs('night')) P.eyes = 'closed';
      Object.assign(P, this.o); this.pose = P;
      this.sq *= Math.pow(0.02, dt);
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.2, 1.5));
      for (;;) {
        if (this.mode === 'hang') { yield* this.dangle(); continue; }
        // on the ground for a while, then back up the tree
        const until0 = Game.t + rnd(18, 30);
        while (Game.t < until0) {
          const r = Math.random();
          if (r < 0.5) yield* this.waddle(clamp(this.x + rnd(-70, 70), this.hx - 140, this.hx + 140));
          else if (r < 0.75) yield* this.polish();
          else yield* hold(this, rnd(1, 2.5), 'waddle', 0.3);
        }
        yield* this.climb();
      }
    }
    *dangle() {
      let e = 0; const T = rnd(3, 6);
      while (e < T && this.mode === 'hang') {
        const dt = yield; e += dt;
        if (this.gloss > 0) { this.gloss = Math.max(0, this.gloss - dt / 12); this.setAct('glossy', 1); if (Math.random() < dt * 5) FX.add({ type: 'spark', x: this.x + rnd(-6, 6), y: this.y - SEEDOT_H * 0.5 + rnd(-6, 6), size: 1, life: 0.6, c: 0xffffffff, c2: hex('#fff4c0'), layer: 3 }); }
        else this.setAct('hang', 0.3 + (Math.abs(this.swing) > 0.2 ? 0.4 : 0));
      }
    }
    *waddle(tx) {
      yield* this.walkTo(tx, this.speed, { act: 'waddle', turn: 8 });
    }
    // Seedot polish their bodies with leaves once a day
    *polish() {
      yield* this.faceCam(0.6);
      let e = 0;
      while (e < 3) {
        const dt = yield; e += dt;
        this.o.tilt = Math.sin(e * 9) * 0.35; this.o.eyes = 'happy'; this.o.squash = Math.sin(e * 18) * 0.08;
        this.setAct('polish', e > 0.5 && e < 2.6 ? 1 : 0.5);
        if (Math.random() < dt * 6) FX.add({ type: 'drop', x: this.x + rnd(-8, 8), y: this.y - rnd(10, 26), vx: rnd(-20, 20), vy: -rnd(10, 30), g: 60, life: 1, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 1, floor: this.y, layer: 3 });
      }
    }
    // shaken loose: drop with a thump
    drop(delay) { if (this.mode !== 'hang' || !this.alive) return; this.doTask(this.fall(delay), 6); }
    *fall(delay) {
      this.swing = 0.8;
      yield* wait(delay);
      this.emote('shock', 0.7);
      this.mode = 'air'; S.seedAir = (S.seedAir || 0) + 1;
      let vy = -20, e = 0; const g0 = gy(this.x) + this.zd;
      while (this.y < g0) {
        const dt = yield; e += dt;
        vy += 820 * dt; this.y = Math.min(g0, this.y + vy * dt);
        this.hangK = Math.max(0, 1 - e * 2.5); this.o.eyes = 'closed'; this.o.squash = -0.25;
        this.setAct(S.seedAir >= 3 ? 'triple' : 'drop', 1);
      }
      S.seedAir = Math.max(0, S.seedAir - 1);
      this.mode = 'land'; this.hangK = 0; this.sq = 0.8;
      Game.sfx('pat', this.x, 0.9); Game.shake(0.4);
      for (let i = 0; i < 6; i++) FX.add({ type: 'dust', x: this.x + rnd(-8, 8), y: this.y - 1, vx: rnd(-40, 40), vy: -rnd(6, 20), r: 2, life: 0.5, c: 0xffd8c8a0, c2: 0xffb09870, layer: 2 });
      // a little bounce, then dizzy
      yield* this.hopUp(10, 0.3);
      let d = 0; while (d < 1.2) { const dt = yield; d += dt; this.o.eyes = 'blink'; this.o.tilt = Math.sin(d * 10) * 0.3; this.setAct('drop', 0.6); }
      for (const m of Mons.all) if (m !== this && Math.abs(m.x - this.x) < 120) m.hear('splash', this.x, 0.3);
    }
    *hopUp(H, T) {
      const y0 = this.zd; let e = 0;
      while (e < T) { const dt = yield; e += dt; this.zd = y0 - Math.sin(Math.min(1, e / T) * Math.PI) * H; }
      this.zd = y0; this.sq = 0.5;
    }
    // walk back under its twig and spring up to grab it
    *climb() {
      yield* this.walkTo(this.hx, this.speed * 1.4, { act: 'waddle', turn: 8 });
      yield* this.faceCam(0.9);
      let e = 0; while (e < 0.4) { const dt = yield; e += dt; this.o.squash = 0.5; }
      Game.sfx('boing', this.x, 0.4);
      this.mode = 'air';
      const y0 = this.y, y1 = this.hy + SEEDOT_H; e = 0;
      while (e < 0.55) { const dt = yield; e += dt; const k = Math.min(1, e / 0.55); this.y = lerp(y0, y1, 1 - (1 - k) * (1 - k)); this.hangK = k; this.o.squash = -0.3; this.setAct('waddle', 0.4); }
      this.mode = 'hang'; this.hangK = 1; this.swing = 0.5;
    }
    // the little twig it hangs from, poking out of the leaves
    drawExtra(fb, cx, cy) {
      if (this.mode !== 'hang' && !(this.mode === 'air' && this.hangK > 0.9)) return;
      const X = Math.round(this.hx - cx), Y = Math.round(this.hy - cy), W = fb.w, H = fb.h;
      for (let i = 0; i < 9; i++) {
        const x = X + Math.round(i * 0.35 * (this.i - 1)), y = Y - i;
        for (const [dx, c] of [[0, 0xff3a2a1e], [1, 0xff6a4a2c]]) { const px = x + dx; if (px >= 0 && y >= 0 && px < W && y < H) fb.d[y * W + px] = c; }
      }
    }
    onWater() {
      if (this.mode !== 'hang') { this.emote('sweat', 0.8); return; }
      this.gloss = 1; this.swing = 0.4; this.emote('heart', 1.2);
      FX.sparkles(this.x, this.y - SEEDOT_H * 0.5, 8, 14, 0xffffffff, hex('#fff4c0'));
      if (Save.discover('seedot.gloss')) HUD.toast('Seedot drinks through its stalk... the more it drinks, the glossier it gets!', { life: 3 });
    }
    *playAcorn(T) { let e = 0; while (e < T && this.mode === 'hang') { const dt = yield; e += dt; this.o.eyes = 'closed'; this.setAct('hang', 0.6); } }
    onPoke() { if (this.mode === 'hang') { this.swing = 0.7; Game.sfx('rustle', this.x, 0.4); } else { this.emote('sweat', 0.8); this.doTask(this.waddle(clamp(this.x + (this.x < mk().x ? -60 : 60), this.hx - 140, this.hx + 140)), 3); } }
    // when watched, a hanging Seedot freezes and plays acorn
    onNotice(mk) {
      this.lastReact = Game.t;
      if (this.mode === 'hang') { this.doTask(this.playAcorn(rnd(2, 3.5)), 3); return; }
      super.onNotice(mk);
    }
  }

  /* ================= SLAKOTH ================= */
  class SlakothM extends Walker {
    constructor(x, minX, maxX, o = {}) {
      super(sp('Slakoth'), { kind: 'slakoth', dex: 'slakoth', x, y: gy(x), yaw: Math.PI / 2 + 0.5, z: 1.8, scale: 0.5, qPose: 0.06, qFields: { lie: 0.2, yawn: 0.2, scratch: 0.25, headRoll: 0.25, step: 0.5 }, persona: 'calm', speed: 5, minX, maxX, zd: o.zd ?? 0 });
      this.senseR = 50; this.alert = 3; this.lieK = 1; this.stepPh = 0;
    }
    animate(dt, t) {
      const P = { lie: this.lieK, yawn: 0, scratch: 0, eyes: t % 5 < 0.15 ? 'closed' : 'half', headRoll: Math.sin(t * 0.3 + this.seed) * 0.15, step: this.moving ? this.stepPh : 0 };
      if (this.sleeping) P.eyes = 'closed';
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        const r = Math.random();
        if (r < 0.45) yield* this.napUntil(() => false, rnd(8, 16));
        else if (r < 0.68) yield* this.yawnBig();
        else if (r < 0.86) yield* this.scratchy();
        else yield* this.crawl();
      }
    }
    *yawnBig() {
      const m = mk();
      let e = 0, caught = false; const T = 2.6;
      while (e < T) {
        const dt = yield; e += dt;
        const k = Math.sin(Math.min(1, e / T) * Math.PI);
        this.o.yawn = k; this.o.eyes = k > 0.4 ? 'closed' : 'half'; this.o.headRoll = -0.1 * k; this.lieK = 1 - k * 0.35;
        // yawns are catching: an idle Mudkip close by yawns along
        if (!caught && e > 0.5 && m && m.mode === 'land' && !m.target && Math.abs(m.x - this.x) < 110 && Math.abs(m.y - this.y) < 40 && (!m.task || m.task.idle || m.task.done)) { caught = true; m.idleTask(m.yawn()); }
        this.setAct(caught && e < 2.1 ? 'yawnduo' : 'yawn', k > 0.6 ? 1 : 0.5);
      }
      this.lieK = 1;
      if (caught && Save.discover('slakoth.yawn')) HUD.toast('Yawns are catching... Mudkip yawned along with Slakoth!', { life: 2.6 });
    }
    *scratchy() {
      let e = 0; const T = rnd(1.8, 3);
      while (e < T) { const dt = yield; e += dt; this.o.scratch = Math.sin(e * 7) * 0.9; this.lieK = 0.75; this.o.eyes = 'half'; this.setAct('scratch', e > 0.4 ? 0.9 : 0.5); }
      this.lieK = 1;
    }
    // the slowest crawl in the forest
    *crawl() {
      const d = chance(0.5) ? 1 : -1, tx = clamp(this.x + d * rnd(8, 18), this.minX, this.maxX);
      let e = 0;
      while (Math.abs(tx - this.x) > 0.5 && e < 8) { const dt = yield; e += dt; this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 3 * dt); this.moving = 3; this.stepPh += dt * 1.6; this.setAct('crawl', 0.6); }
    }
    onFood(it) { if (this.busy(3) || Math.abs(it.x - this.x) > 70 || World.waterAt(it.x) !== null) return false; this.doTask(this.eat(it), 3); return true; }
    *eat(it) {
      this.sleeping = false;
      yield* this.faceTo(it.x > this.x ? 1 : -1, false);
      let e = 0;
      // a slow, slow reach...
      while (e < 3.5 && !it.eaten) { const dt = yield; e += dt; this.o.scratch = Math.min(1, e / 3); this.lieK = 0.8; this.o.eyes = 'half'; this.setAct('eat', 0.5); }
      if (!it.eaten) Items.eat(it);
      e = 0; while (e < 2) { const dt = yield; e += dt; this.o.yawn = Math.abs(Math.sin(e * 5)) * 0.35; this.o.eyes = 'happy'; this.setAct('eat', 1); }
      this.emote('heart', 1.2); this.lieK = 1;
    }
    onPoke() { this.sleeping = false; this.emote('sweat', 1); this.doTask(this.grumbleLazy(), 3); }
    onWater() { this.onPoke(); }
    *grumbleLazy() {
      let e = 0;
      while (e < 2) { const dt = yield; e += dt; this.o.headRoll = Math.sin(e * 3) * 0.4; this.o.eyes = 'half'; this.lieK = 0.85; this.setAct('scratch', 0.4); }
      this.lieK = 1;
    }
    // too lazy to run from anything
    onNotice() { this.lastReact = Game.t; }
  }

  /* ================= PLUSLE & MINUN ================= */
  class CheerM extends Walker {
    constructor(kind, x, minX, maxX) {
      super(sp(kind === 'plusle' ? 'Plusle' : 'Minun'), { kind, dex: kind, x, y: gy(x), yaw: Math.PI / 2 + (kind === 'plusle' ? 0.5 : -0.5), z: 1.9, scale: 0.55, qPose: 0.06, qFields: { cheer: 0.2, jump: 0.2, step: 0.5, spark: 0.25, mouth: 0.25 }, persona: 'curious', speed: 60, minX, maxX });
      this.air2 = 0; this.stepPh = 0; this.jumpK = 0; this.senseR = 110;
    }
    get pal() { return this.kind === 'plusle' ? S.minun : S.plusle; }
    physics(dt, t) { super.physics(dt, t); this.y -= this.air2; }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * (8 + this.moving * 0.06);
      const P = { cheer: 0, jump: this.jumpK, step: this.moving ? this.stepPh : 0, spark: 0.1, mouth: this.kind === 'plusle' ? 0.7 : 0.15, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.sleeping) { P.eyes = 'closed'; P.mouth = 0; }
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.2, 1));
      for (;;) {
        const p = this.pal;
        if (hourIs('night')) { yield* this.snuggle(); continue; }
        if (p && Math.abs(p.x - this.x) > 140) { yield* this.walkTo(p.x + (this.x < p.x ? -26 : 26), 90, { act: 'hop', max: this.maxX, min: this.minX }); continue; }
        const r = Math.random();
        if (r < 0.35) yield* this.hops(clamp(this.x + rnd(-80, 80), this.minX, this.maxX));
        else if (r < 0.55 && p && !p.busy(2) && !p.sleeping) { p.doTask(p.chase(this), 2); yield* this.flee2(); }
        else yield* this.idle(rnd(1, 2.4), 'hop');
      }
    }
    *hop1(x1, H = 14, T = 0.45, act = 'hop') {
      const x0 = this.x; let e = 0;
      if (Math.abs(x1 - x0) > 2) this.turn(this.face(Math.sign(x1 - x0), true), 1, 20);
      while (e < T) { const dt = yield; e += dt; const k = Math.min(1, e / T); this.x = lerp(x0, x1, k); this.air2 = Math.sin(k * Math.PI) * H; this.jumpK = k < 0.2 ? k * 1.1 : Math.sin(k * Math.PI); this.moving = Math.abs(x1 - x0) > 2 ? 40 : 0; this.setAct(act, k > 0.3 && k < 0.7 ? 0.7 : 0.4); }
      this.air2 = 0; this.jumpK = 0;
    }
    *hops(tx) { for (let g = 0; g < 10 && Math.abs(tx - this.x) > 4; g++) yield* this.hop1(this.x + Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 24)); }
    // tag: one runs, the other chases
    *flee2() {
      const d = this.x < (this.minX + this.maxX) / 2 ? 1 : -1;
      yield* this.walkTo(clamp(this.x + d * rnd(90, 160), this.minX, this.maxX), 110, { act: 'tag' });
      yield* this.walkTo(clamp(this.x - d * rnd(60, 120), this.minX, this.maxX), 110, { act: 'tag' });
      this.o.eyes = 'happy';
      yield* this.hop1(this.x, 18, 0.5, 'tag');
    }
    *chase(q) {
      for (let g = 0; g < 6; g++) { yield* this.walkTo(q.x + (this.x < q.x ? -18 : 18), 118, { act: 'tag', max: this.maxX, min: this.minX }); if (!q.busy(2)) break; }
      this.emote('note', 1);
    }
    *snuggle() {
      const p = this.pal;
      if (p && this.kind === 'minun') yield* this.walkTo(p.x + 18, 50, { act: 'hop' });
      yield* this.faceCam(0.7);
      this.sleeping = true;
      let e = 0, z = 0;
      while (hourIs('night') && this.sleeping) { const dt = yield; e += dt; z -= dt; this.o.eyes = 'closed'; this.o.mouth = 0; this.jumpK = 0.12; if (z <= 0) { z = 2.4; FX.add({ type: 'icon', icon: 'swirl', x: this.headPt()[0] + 6, y: this.headPt()[1] - 4, vx: 6, vy: -10, life: 1.6, layer: 3 }); } this.setAct('snuggle', p && Math.abs(p.x - this.x) < 30 ? 0.9 : 0.4); }
      this.sleeping = false; this.jumpK = 0;
    }
    // cheering, with pom-poms of sparks
    cheerFor(T = 4) { if (this.sleeping || (this.task && this.task.cheer && !this.task.done)) return; if (this.doTask(this.cheer(T), 3)) this.task.cheer = true; }
    *cheer(T) {
      this.emote('star', 0.8);
      yield* this.faceCam(0.8);
      let e = 0;
      while (e < T) {
        const dt = yield; e += dt;
        const k = (e * 1.9) % 1;
        this.air2 = Math.sin(k * Math.PI) * 12; this.jumpK = Math.sin(k * Math.PI);
        this.o.cheer = 1; this.o.spark = 0.8 + 0.2 * Math.sin(e * 20); this.o.eyes = 'happy'; this.o.mouth = 1;
        const p = this.pal, duo = p && p.task && p.task.cheer && !p.task.done && Math.abs(p.x - this.x) < 80;
        this.setAct(duo ? 'duo' : 'cheer', k > 0.3 && k < 0.7 ? 1 : 0.7);
        if (duo) { S.duoT = 0.3; if (Save.discover('forest.cheer')) HUD.toast('Plusle and Minun cheer together — plus and minus, sparking!', { life: 2.8 }); }
        if (k < 0.05 && Math.random() < 0.4) Game.sfx('chirp', this.x, 0.3);
      }
      this.air2 = 0; this.jumpK = 0;
    }
    onSong() { this.cheerFor(5); }
    onFood(it) { if (this.sleeping || this.busy(3) || Math.abs(it.x - this.x) > 300 || World.waterAt(it.x) !== null) return false; this.doTask(this.share(it), 3); const p = this.pal; if (p && !p.sleeping && !p.busy(3)) p.doTask(p.share(it), 3); return true; }
    *share(it) {
      yield* this.walkTo(it.x + (this.kind === 'plusle' ? -12 : 12), 100, { act: 'hop' });
      yield* this.faceCam(0.6);
      let e = 0;
      while (e < 2) { const dt = yield; e += dt; this.o.mouth = Math.sin(e * 16) > 0 ? 1 : 0.3; this.o.eyes = 'happy'; this.setAct('share', e > 0.4 ? 1 : 0.6); }
      if (!it.eaten) Items.eat(it);
      this.emote('heart', 1.2);
    }
    onPoke() { this.emote('note', 1); this.doTask(this.hop1(this.x, 20, 0.5, 'hop'), 2); }
    drawExtra(fb, cx, cy, P, t) {
      // the plus-minus spark arc, drawn once (by Plusle) while they cheer side by side
      if (this.kind !== 'plusle' || !(S.duoT > 0) || !S.minun || !this.spr || !S.minun.spr) return;
      const [x0, y0] = this.at('cheekN'), [x1, y1] = S.minun.at('cheekN');
      const n = 10, W = fb.w, H = fb.h;
      let px = x0, py = y0;
      for (let i = 1; i <= n; i++) {
        const k = i / n, jx = lerp(x0, x1, k), jy = lerp(y0, y1, k) - Math.sin(k * Math.PI) * 10 + (i < n ? rnd(-3, 3) : 0);
        const steps = Math.max(1, Math.ceil(Math.hypot(jx - px, jy - py)));
        for (let s = 0; s <= steps; s++) {
          const X = Math.round(lerp(px, jx, s / steps) - cx), Y = Math.round(lerp(py, jy, s / steps) - cy);
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          fb.d[Y * W + X] = k < 0.5 ? 0xff7ae8ff : 0xffffd87a;
        }
        px = jx; py = jy;
      }
    }
  }

  /* ================= hooks ================= */
  function spawn(A, G) {
    S = { party: false, findT: -99, seedot: [], seedAir: 0, duoT: 0, plusle: null, minun: null };
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Zigzagoon')) { add(new ZigzagoonM(420, 260, 880)); add(new ZigzagoonM(3000, 2830, 3220)); }
    if (sp('Surskit')) { add(new SurskitM(2400)); add(new SurskitM(2640)); }
    if (sp('Shroomish')) { add(new ShroomishM(2120, MUSH - 40)); add(new ShroomishM(2900, 2940)); add(new ShroomishM(3050, 2980)); }
    // Seedot dangle from the fruit tree's lower boughs
    if (sp('Seedot')) { const hy = gy(TREE) - 96; S.seedot = [add(new SeedotM(0, TREE - 40, hy + 6)), add(new SeedotM(1, TREE + 4, hy - 4)), add(new SeedotM(2, TREE + 44, hy + 8))]; }
    // Slakoth lolls on the mossy log near the start
    if (sp('Slakoth')) add(new SlakothM(446, 425, 468, { zd: -8 }));
    if (sp('Plusle') && sp('Minun')) { S.plusle = add(new CheerM('plusle', 1640, 1545, 1830)); S.minun = add(new CheerM('minun', 1690, 1545, 1830)); }
  }
  function update(A, dt, t, G) {
    S.party = hourIs('dusk');
    S.duoT = Math.max(0, (S.duoT || 0) - dt);
    // Plusle and Minun cheer Mudkip on while it plays on the mushroom or the vine
    const m = mk();
    if (m && m.mode === 'toy') for (const q of [S.plusle, S.minun]) if (q && q.alive && Math.abs(q.x - m.x) < 420) q.cheerFor(4);
  }
  // the fruit tree was shaken: every hanging Seedot drops
  function shake() { (S.seedot || []).forEach((q, i) => q && q.drop(0.15 + i * 0.12 + Math.random() * 0.1)); }
  // Treetop Town: a Slakoth lazing on the great branch
  function spawnCanopy(A, G) {
    if (!S.canopy) S.canopy = {};
    if (sp('Slakoth')) G.addMon(new SlakothM(1790, 1770, 1815));
  }
  return { spawn, update, shake, spawnCanopy, get S() { return S; }, classes: { ZigzagoonM, SurskitM, ShroomishM, SeedotM, SlakothM, CheerM } };
})();
