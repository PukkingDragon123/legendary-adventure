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
------------------------------------------------------------------- */
const GroveAI = (() => {
  const { clamp, lerp, rnd, pick, chance, hex } = U;
  const { wait } = Mons;
  const { Walker, mk, hourIs, surf } = AI;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const POND = { x0: 2250, x1: 2780, level: 576 }, MUSH = 2188;
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

  /* ================= hooks ================= */
  function spawn(A, G) {
    S = { party: false, findT: -99 };
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Zigzagoon')) { add(new ZigzagoonM(420, 260, 880)); add(new ZigzagoonM(1650, 1540, 1830)); }
    if (sp('Surskit')) { add(new SurskitM(2400)); add(new SurskitM(2640)); }
    if (sp('Shroomish')) { add(new ShroomishM(2120, MUSH - 40)); add(new ShroomishM(2900, 2940)); add(new ShroomishM(3050, 2980)); }
  }
  function update(A, dt, t, G) {
    S.party = hourIs('dusk');
  }
  return { spawn, update, get S() { return S; }, classes: { ZigzagoonM, SurskitM, ShroomishM } };
})();
