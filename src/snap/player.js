/* ------------------------------------------------------------------
   Player — Mudkip, the photographer. Tap-to-move (walks, swims, hops
   onto docks and bridges, dives off the end), keyboard control, and
   the field moves used to solve photo puzzles: Water Gun, a song on
   the guitar, throwing berries and scanning with the Pokédex.
------------------------------------------------------------------- */
const Player = (() => {
  const { clamp, lerp, rnd, pick, approach } = U;
  const { wait, until } = Mons;

  class MudkipP extends Mons.Mon {
    constructor(x) {
      super(Mudkip, { kind: 'mudkip', dex: 'mudkip', pal: Mudkip.PAL, x, y: World.groundAt(x), yaw: 1.1, qYaw: 0.035, qPose: 0.04, z: 5, persona: 'player',
        qFields: { mouth: 0.1, bodyDip: 0.5, legF: 0.08, legB: 0.08, squash: 0.02, legSplay: 0.06, tailWag: 0.05, look: 0.05, strum: 0.25 } });
      this.sq = new Spring(300, 13); this.finS = new Spring(120, 6.5); this.tailS = new Spring(80, 5);
      this.target = null; this.keyDir = 0; this.keyY = 0;
      this.happyT = 0; this.dizzy = 0; this.look = {}; this.holdCam = 0;
      this.vx = 0; this.vy = 0; this.climb = null;
      this.sneak = false;
      this.scale = 0.62; this.resize();
    }
    resize() { const m = Mudkip.meta; this.SW = Math.ceil(m.bw * this.scale); this.SH = Math.ceil(m.bh * this.scale); this.OX = Math.floor(this.SW / 2); this.OY = Math.floor(this.SH * m.oy); }
    senses() {}
    headPt() { return this.at('headTop', 0, -2); }
    get inWater() { return this.mode === 'swim'; }
    setLook(look) { this.look = Object.assign({}, look); }
    // ---- orders ----
    goTo(tg) { this.target = tg; this.keyDir = 0; this.wakeUp(); }
    // idle antics are low-priority tasks any order cancels
    wakeUp() { this.idleT = 0; if (this.task && this.task.idle && !this.task.done) { this.task.done = true; this.sleepy = false; } }
    idleTask(g) { if (this.doTask(g, 1)) this.task.idle = true; }
    stop() { this.target = null; }
    brain() { return (function* () { for (;;) yield; })(); }

    update(dt, t) {
      this.st += dt; this.o = {}; this.moving = 0;
      if ((this.keyDir || this.keyY) && this.task && this.task.idle) this.wakeUp();
      if (this.task && !this.task.done) this.task.step(dt);
      else this.control(dt, t);
      // idle antics after standing still for a while
      const free = !this.task || this.task.done;
      const still = !this.target && !this.keyDir && !this.keyY && (free || this.task.idle) && Game.mode === 'explore';
      this.idleT = still ? (this.idleT || 0) + dt : 0;
      if (still && free && this.idleT > 5 && (this.nextIdle ?? 0) < this.idleT) { this.nextIdle = this.idleT + rnd(3, 6); this.pickIdle(); }
      if (!still) this.nextIdle = 0;
      if (!free && this.mode === 'land' && !this.task.idle) this.vx = 0;
      this.physics(dt, t);
      this.animate(dt, t);
    }
    control(dt, t) {
      const speed = this.mode === 'swim' ? 95 : this.sneak ? 45 : 88;
      // keyboard
      if (this.keyDir || this.keyY) {
        this.target = null;
        if (this.mode === 'swim') { this.vx = lerp(this.vx, this.keyDir * speed, dt * 5); this.vy = lerp(this.vy, this.keyY * speed * 0.8, dt * 5); }
        else { this.turn(this.face(this.keyDir || Math.sign(Math.cos(this.yaw))), dt, 11); this.drive(this.keyDir * speed, dt); if (this.keyY < 0 && this.air <= 0) this.jumpOn(); }
        return;
      }
      if (this.mode !== 'swim' && !this.target) this.drive(0, dt);
      const tg = this.target;
      if (!tg) { if (this.mode === 'swim') { this.vx *= Math.pow(0.1, dt); this.vy *= Math.pow(0.1, dt); } return; }
      if (this.mode === 'swim') {
        let tx = tg.x, ty = tg.y ?? this.y;
        // heading for land/dock: surface near the shore or a ladder first
        if (tg.kind === 'walk' || tg.kind === 'plat') {
          const exitX = tg.kind === 'plat' && tg.plat && tg.plat.ladders ? tg.plat.ladders.reduce((a, b) => (Math.abs(b - this.x) < Math.abs(a - this.x) ? b : a)) : World.shoreX - 8;
          tx = exitX; ty = WorldRender.surfaceAt(exitX, t) + 12;
          if (Math.hypot(tx - this.x, ty - this.y) < 14) {
            if (tg.kind === 'plat' && tg.plat) { this.doTask(this.climbUp(tg.plat, tx), 3); return; }
            this.mode = 'land'; this.air = 0; this.x -= 4;
          }
        }
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < 5 && tg.kind === 'swim') { this.arrive(); return; }
        const sp = Math.min(speed, d * 3);
        this.vx = lerp(this.vx, (dx / (d || 1)) * sp, dt * 4); this.vy = lerp(this.vy, (dy / (d || 1)) * sp, dt * 4);
        if (Math.abs(dx) > 3) this.turn(this.face(Math.sign(dx), true), dt, 6);
        return;
      }
      // land / dock
      let tx = tg.x;
      if (tg.kind === 'swim') {
        // walk to the water's edge (or off the end of the dock)
        tx = this.plat ? (tg.x > this.plat.x1 || tg.x > (this.plat.x0 + this.plat.x1) / 2 ? this.plat.x1 + 12 : this.plat.x0 - 12) : this.edgeToward(tg.x);
      } else if (tg.kind === 'plat' && !this.plat) {
        const p = tg.plat;
        if (Math.abs(World.groundAt(p.x0) - World.platY(p, p.x0)) < 10) tx = p.x0 + 4; // step on from the land
      } else if (tg.kind === 'walk' && this.plat) {
        tx = clamp(tg.x, this.plat.x0 - 20, this.plat.x1 + 20);
      }
      const dx = tx - this.x;
      if (Math.abs(dx) < 3) {
        this.vx = 0;
        if (tg.kind === 'plat' && !this.plat) { this.plat = tg.plat; return; }
        if (tg.kind === 'swim') { this.doTask(this.diveOff(tg), 3); return; }
        if (tg.kind === 'walk' || tg.kind === 'plat') this.arrive();
        return;
      }
      const d = Math.sign(dx);
      // long trips: bound along in happy hops
      const run = Math.abs(dx) > 150 && this.mode === 'land';
      if (run) {
        this.bound = (this.bound ?? 0) - dt;
        if (this.air <= 0 && this.bound <= 0 && Math.abs(this.vx) > 70) { this.vair = 150; this.air = 0.5; this.bound = 0.34; this.sq.kick(0.25); }
      }
      // skid when turning round at speed
      if (Math.sign(this.vx) === -d && Math.abs(this.vx) > 60 && Math.random() < dt * 20) FX.add({ type: 'dust', x: this.x, y: this.y - 1, vx: -d * 20, vy: -8, r: 2, life: 0.35, c: 0xffd8ecf4, c2: 0xffb0c8d8, layer: 2 });
      this.turn(this.face(d), dt, 11);
      // ease in and out: accelerate, cruise, slow down on arrival (no snapping)
      this.drive(d * Math.min(run ? speed * 1.45 : speed, 20 + Math.abs(dx) * 3.2), dt);
      if (Math.sign(this.vx) === d && Math.abs(this.vx * dt) > Math.abs(dx)) this.x = tx - d * 2.5;
      // step onto a dock from the sand when walking across its start
      if (!this.plat) { const p = World.platAt(this.x); if (p && Math.abs(World.groundAt(this.x) - World.platY(p, this.x)) < 8 && (tg.kind === 'plat' || tg.plat === p)) this.plat = p; }
    }
    arrive() { const tg = this.target; this.target = null; if (Game.pin) Game.pin.done = true; if (tg && tg.then) tg.then(); }
    // horizontal motion with acceleration (land)
    drive(want, dt) {
      const acc = Math.abs(want) > Math.abs(this.vx) ? 520 : 700;
      this.vx = approach(this.vx, want, acc * dt);
      // turning round: slow through zero instead of snapping
      this.x += this.vx * dt;
      if (Math.abs(this.vx) > 4) this.moving = Math.abs(this.vx);
    }
    // nearest point on land just before the water, going toward x1
    edgeToward(x1) {
      const d = x1 > this.x ? 1 : -1;
      for (let x = this.x; d > 0 ? x <= x1 : x >= x1; x += d * 4) if (World.isWet(x, 16)) return x - d * 10;
      return x1;
    }
    /* ---- idle antics: look around, hop, tail chase, yawn, nap; splash and bob in the water ---- */
    pickIdle() {
      if (this.mode === 'swim') { this.idleTask(this.surfaceSplash()); return; }
      if (this.mode !== 'land') return;
      if (this.idleT > 24) { this.idleTask(this.nap()); return; }
      const r = Math.random();
      this.idleTask(r < 0.3 ? this.lookAround() : r < 0.5 ? this.joyHop() : r < 0.7 ? this.tailChase() : r < 0.85 ? this.yawn() : this.faceTo(Math.random() < 0.5 ? 1 : -1, false));
    }
    *lookAround() { let e = 0; while (e < 2.4) { const dt = yield; e += dt; this.o.look = Math.sin(e * 2.6) * 0.5; this.o.headRoll = Math.sin(e * 2.6) * 0.08; } }
    *joyHop(n = 2) {
      for (let i = 0; i < n; i++) { this.vair = 210; this.air = 0.5; Game.sfx('boing', this.x, 0.35); this.happyT = 0.6; yield* until(() => this.air <= 0 && this.vair === 0, 2); yield* wait(0.08); }
    }
    *tailChase() {
      const y0 = this.yaw; let e = 0;
      while (e < 1.6) { const dt = yield; e += dt; this.yaw = y0 + e * 7.8; this.o.tailWag = Math.sin(e * 20) * 0.5; this.happyT = 0.2; }
      this.yaw = this.face(Math.cos(this.yaw) >= 0 ? 1 : -1, false); this.dizzy = 0.8;
    }
    *yawn() { let e = 0; while (e < 1.6) { const dt = yield; e += dt; const k = Math.sin(Math.min(1, e / 1.2) * Math.PI); this.o.mouth = 0.6 + k * 0.4; this.o.eyes = k > 0.5 ? 'sleep' : 'open'; this.o.headPitch = -0.15 * k; } }
    *nap() {
      this.sleepy = true; let e = 0, z = 0;
      yield* this.faceTo(Math.cos(this.yaw) >= 0 ? 1 : -1, false);
      while (this.sleepy) {
        const dt = yield; e += dt; z -= dt;
        const k = Math.min(1, e / 0.8);
        this.o.bodyDip = 2 * k; this.o.legSplay = 0.7 * k; this.o.eyes = 'sleep'; this.o.mouth = 0.2; this.o.headPitch = 0.12 * k;
        this.o.squash = Math.sin(e * 1.6) * 0.03 * k; this.o.tailWag = Math.sin(e * 0.8) * 0.1;
        if (z <= 0 && k >= 1) { z = 1.6; FX.add({ type: 'icon', icon: 'swirl', x: this.x + 6, y: this.y - 26, vx: 5, vy: -9, life: 1.6, layer: 3 }); }
      }
    }
    *surfaceSplash() {
      // bob at the surface, flick the tail, splash
      const s = WorldRender.surfaceAt(this.x, Game.t);
      if (this.y > s + 30) { let e = 0; while (e < 2) { const dt = yield; e += dt; this.o.tailWag = Math.sin(e * 8) * 0.4; this.o.finSway = Math.sin(e * 5) * 0.2; } return; }
      let e = 0;
      Game.sfx('splash', this.x, 0.4);
      while (e < 1.2) {
        const dt = yield; e += dt;
        this.o.tailWag = Math.sin(e * 14) * 0.6; this.o.tailLift = 0.5; this.happyT = 0.2;
        if (Math.random() < dt * 12) FX.add({ type: 'drop', x: this.x - Math.cos(this.yaw) * 12, y: s - 2, vx: rnd(-50, 50), vy: -rnd(60, 140), g: 420, life: 0.8, c: 0xffffffff, c2: U.hex('#8fd6ee'), size: 2, floor: s + 2, layer: 3 });
      }
      FX.add({ type: 'ripple', x: this.x, y: s + 1, r0: 2, r1: 14, flat: 0.3, life: 1, c: 0xffffffff, layer: 2 });
    }
    *shakeOff() {
      let e = 0;
      while (e < 0.9) {
        const dt = yield; e += dt;
        this.o.headRoll = Math.sin(e * 40) * 0.25 * (1 - e / 0.9); this.o.eyes = 'blink'; this.o.squash = Math.sin(e * 40) * 0.04;
        if (Math.random() < dt * 30) FX.add({ type: 'drop', x: this.x + rnd(-10, 10), y: this.y - rnd(10, 26), vx: rnd(-70, 70), vy: -rnd(30, 90), g: 420, life: 0.6, c: 0xffffffff, c2: U.hex('#8fd6ee'), size: 1, floor: World.groundAt(this.x), layer: 3 });
      }
      this.happyT = 0.5;
    }
    jumpOn() { this.vair = 230; this.air = 0.5; }
    *climbUp(p, x) {
      this.vx = this.vy = 0; this.mode = 'climb';
      const y0 = this.y, y1 = World.platY(p, x);
      let e = 0;
      Game.sfx('pat', x, 0.6);
      while (e < 0.7) { const dt = yield; e += dt; this.x = lerp(this.x, x, dt * 8); this.y = lerp(y0, y1, U.ease.inOut(e / 0.7)); this.o.legF = Math.sin(e * 20) * 0.7; this.o.legB = -Math.sin(e * 20) * 0.7; }
      FX.splashAt(x, WorldRender.surfaceAt(x, Game.t), { power: 0.3, n: 6 });
      this.mode = 'land'; this.plat = p; this.air = 0; this.y = World.platY(p, this.x);
      const tg = this.target; if (tg && tg.kind === 'plat') { /* keep walking to the tapped spot */ }
    }
    *diveOff(tg) {
      const dir = tg.x > this.x ? 1 : -1;
      // crouch, then leap
      let e = 0; while (e < 0.18) { const dt = yield; e += dt; this.o.bodyDip = 1.6; this.o.squash = 0.08; }
      this.mode = 'fall'; this.plat = null; this.diving = true;
      this.vx = dir * 95; this.vy = -250;
      this.happyT = 1;
      Game.sfx('boing', this.x, 0.5);
      yield* until(() => this.mode !== 'fall', 4);
      this.target = tg;
    }
    physics(dt, t) {
      if (this.mode === 'ride') return;
      const x = this.x;
      if (this.mode === 'land') {
        if (World.isWet(x, 16) && this.air <= 0 && !this.plat) {
          this.mode = 'swim'; this.vx = Math.cos(this.yaw) * 40; this.vy = 20;
          FX.splashAt(x, WorldRender.surfaceAt(x, t), { power: 0.45, n: 8 }); Game.sfx('splash', x, 0.5);
          for (const m of Mons.all) if (m !== this) m.hear('splash', x, 0.4);
        }
        if (this.air > 0 || this.vair !== 0) {
          this.vair -= 900 * dt; this.air += this.vair * dt;
          if (this.air <= 0) { this.air = 0; if (this.vair < -140) { this.sq.kick(-this.vair * 0.004); Game.sfx('pat', x, 0.4); } this.vair = 0; }
        }
        if (this.plat && (x < this.plat.x0 || x > this.plat.x1)) {
          // walked off the end of a dock/bridge
          if (World.groundAt(x) > World.platY(this.plat, x) + 12) { this.mode = 'fall'; this.vx = Math.cos(this.yaw) > 0 ? 60 : -60; this.vy = -60; this.plat = null; }
          else this.plat = null;
        }
        const base = this.plat ? World.platY(this.plat, this.x) : World.groundAt(this.x);
        this.y = base - this.air;
        // sandy footprints
        if (this.moving && !this.plat && Game.area && Game.area.footprint && Math.floor(this.phase / Math.PI) !== this.lastStep) { this.lastStep = Math.floor(this.phase / Math.PI); Game.area.footprint(this.x - Math.cos(this.yaw) * 6, this.y, this.lastStep & 1); }
      } else if (this.mode === 'swim') {
        this.x += this.vx * dt; this.y += this.vy * dt;
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        if (this.y < s + 10) { this.y = s + 10; this.vy = Math.max(0, this.vy); }
        if (this.y > g - 8) { this.y = g - 8; this.vy = Math.min(0, this.vy); }
        if (!World.isWet(this.x, 12)) { this.mode = 'land'; this.air = 0; this.vx = 0; this.target = this.target && this.target.kind === 'swim' ? null : this.target; if (!this.target) this.idleTask(this.shakeOff()); }
        const sp2 = Math.abs(this.vx) + Math.abs(this.vy);
        if (sp2 > 25 && Math.random() < dt * (4 + sp2 * 0.08)) FX.bubbles(this.x - Math.cos(this.yaw) * 12, this.y - 6, 1, WorldRender.surfaceAt(this.x, t));
        if (Math.sign(this.vx) !== (this.lastVxS || 0) && Math.abs(this.vx) > 30) { this.lastVxS = Math.sign(this.vx); FX.bubbles(this.x, this.y - 8, 4, WorldRender.surfaceAt(this.x, t)); }
        // paddling at the surface throws little splashes
        if (this.y < WorldRender.surfaceAt(this.x, t) + 14 && sp2 > 30 && Math.random() < dt * 8) FX.add({ type: 'drop', x: this.x - Math.cos(this.yaw) * 10, y: WorldRender.surfaceAt(this.x, t) - 1, vx: -Math.cos(this.yaw) * 30 + rnd(-15, 15), vy: -rnd(40, 90), g: 420, life: 0.6, c: 0xffffffff, c2: U.hex('#8fd6ee'), size: 1, floor: WorldRender.surfaceAt(this.x, t) + 1, layer: 3 });
        if (Math.abs(this.vx) + Math.abs(this.vy) > 20) this.moving = 60;
      } else if (this.mode === 'fall') {
        this.vy += 800 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        if (World.waterAt(this.x) !== null && this.y > s + 4 && this.vy > 0) {
          this.mode = 'swim'; this.diving = false; FX.splashAt(this.x, s, { power: Math.min(1.3, this.vy / 350) }); Game.sfx('splash', this.x, 1);
          FX.add({ type: 'ring', x: this.x, y: s, r0: 2, r1: 16, flat: 0.3, life: 0.6, c: 0xffffffff, layer: 2 });
          for (const m of Mons.all) if (m !== this) m.hear('splash', this.x, 0.8);
          this.vy = 60; this.vx *= 0.3;
        } else if (this.y >= g && this.vy > 0) { this.mode = 'land'; this.diving = false; this.y = g; this.sq.kick(0.9); Game.sfx('pat', this.x, 0.8); }
      }
      this.x = clamp(this.x, 16, World.W - 16);
    }
    animate(dt, t) {
      const o = this.o;
      const swim = this.mode === 'swim';
      const walk = this.moving ? clamp(this.moving / 60, 0.6, 1.5) : 0;
      this.gait = approach(this.gait, walk, dt * 6);
      const rate = swim ? 13 : 5 + Math.abs(this.vx) * 0.3; // steps keep pace with the ground (no foot sliding)
      if (this.gait > 0.01 || swim) this.phase += dt * rate;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const P = {};
      const g = swim ? Math.max(0.35, this.gait) : this.gait;
      const fast = clamp((Math.abs(this.vx) - 90) / 60, 0, 1);
      P.legF = s * (0.85 + fast * 0.2) * g; P.legB = -s * (0.85 + fast * 0.2) * g; P.legSplay = Math.abs(c) * 0.12 * this.gait;
      P.bodyDip = swim ? 0 : (1 - Math.abs(s)) * 2.2 * this.gait; // body drops as the legs pass under it
      // footfalls: a little squash and a puff of dust
      if (!swim && this.mode === 'land' && this.gait > 0.3 && this.air <= 0) {
        const step = Math.floor(this.phase / Math.PI);
        if (step !== this.lastFall) { this.lastFall = step; this.sq.kick(0.12 + fast * 0.1); if (Math.random() < 0.55) FX.add({ type: 'dust', x: this.x - Math.cos(this.yaw) * 8, y: this.y - 1, vx: -Math.cos(this.yaw) * 14, vy: -6, r: 1.6 + fast, life: 0.4, c: 0xffd8ecf4, c2: 0xffb8d0e0, layer: 2 }); }
      }
      const sq = this.sq.step(dt);
      P.squash = Math.sin(t * 2.4 + this.seed) * 0.015 + sq * 0.5 + (this.air > 0 ? clamp(this.vair / 2500, -0.08, 0.08) * -1 : 0);
      P.headPitch = (swim ? 0.1 : 0) + Math.sin(this.phase * 2) * 0.05 * this.gait - fast * 0.06;
      P.lean = swim ? 0.04 + Math.sin(this.phase) * 0.1 : this.gait * 0.06 + fast * 0.06;
      P.headRoll = Math.sin(this.phase) * 0.04 * this.gait;
      P.finSway = 0.04 + this.finS.step(dt, -this.gait * 0.08 - (this.air > 0 ? this.vair * 0.0004 : 0)) + Math.sin(t * 1.7 + this.seed) * 0.03;
      P.tailWag = (swim ? Math.sin(this.phase * 0.5) * 0.5 : Math.sin(t * (2.6 + this.gait * 6) + this.seed) * (0.1 + this.gait * 0.2)) + this.tailS.step(dt);
      if (this.air > 0 && !swim) { P.eyes = 'happy'; }
      P.tailLift = this.air > 0 ? 0.15 : 0;
      P.mouth = 0.6;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.air > 0 || this.mode === 'fall') { P.legF = -0.5; P.legB = 0.5; }
      if (this.mode === 'fall' && this.diving) { P.headPitch = clamp(this.vy * 0.0022, -0.45, 0.6); P.legF = -0.9; P.legB = 0.9; P.tailLift = 0.3; P.eyes = this.vy < 0 ? 'happy' : 'open'; }
      if (swim) { P.headPitch = clamp(this.vy * 0.004, -0.45, 0.5); P.lean = clamp(-this.vy * 0.002, -0.2, 0.2); }
      if (this.dizzy > 0) { this.dizzy -= dt; P.eyes = 'blink'; P.headRoll = Math.sin(t * 9) * 0.18; P.mouth = 0.3; }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      Object.assign(P, this.look);
      if (this.holdCam > 0.5) P.hold = 'camera';
      Object.assign(P, o);
      this.pose = P;
    }
    /* ---- field moves ---- */
    *waterGun(tx, ty) {
      this.target = null;
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      Game.sfx('spout', this.x, 0.5);
      let e = 0;
      const hits = new Set();
      while (e < 0.8) {
        const dt = yield; e += dt;
        this.o.mouth = 1; this.o.headPitch = -0.12; this.o.eyes = 'open';
        const [mx, my] = this.at('mouth');
        for (let k = 0; k < 3; k++) {
          const T = 0.45, vx = (tx - mx) / T + rnd(-12, 12), vy = (ty - my - 0.5 * 420 * T * T) / T + rnd(-12, 12);
          FX.add({ type: 'drop', x: mx, y: my, vx, vy, g: 420, life: 1.4, c: 0xffffffff, c2: U.hex('#8fd6ee'), size: 2, layer: 3, floor: World.groundAt(tx) });
        }
        if (e > 0.35) for (const h of Game.hitsAt(tx, ty, 26)) if (!hits.has(h)) { hits.add(h); if (h.onWater) h.onWater(this); }
      }
      if (World.waterAt(tx) !== null) FX.splashAt(tx, WorldRender.surfaceAt(tx, Game.t), { power: 0.5, n: 8 });
      else FX.poof(tx, World.groundAt(tx), 0xffd8f4ff, 0xff9fd0e8, 4, 3);
      for (const m of Mons.all) if (m !== this) m.hear('splash', tx, 0.5);
      if (Game.area && Game.area.onWater) Game.area.onWater(tx, ty);
    }
    *song() {
      this.target = null;
      const look = Object.assign({}, this.look);
      this.look.hold = 'guitar';
      Game.sfx('chime', this.x, 0.6);
      Music.strum && Music.strum();
      let e = 0;
      while (e < 3.2) {
        const dt = yield; e += dt;
        this.o.strum = Math.sin(e * 14); this.o.eyes = 'happy'; this.o.mouth = 1; this.o.headRoll = Math.sin(e * 5) * 0.08;
        if (Math.random() < dt * 5) FX.add({ type: 'icon', icon: Math.random() < 0.5 ? 'note' : 'music2', x: this.x + rnd(-10, 10), y: this.y - 34, vx: rnd(-14, 14), vy: -26, life: 1.3, layer: 3 });
      }
      this.look = look;
      for (const m of Mons.all) if (m !== this) m.hear('song', this.x, 1);
      if (Game.area && Game.area.onSong) Game.area.onSong(this.x);
    }
    *throwBerry(tx, ty) {
      this.target = null;
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      const [mx, my] = this.at('mouth');
      Game.sfx('whoosh', this.x, 0.5);
      Items.throwBerry(mx, my - 4, tx, ty);
      this.o.mouth = 1; this.happyT = 0.4;
      yield* wait(0.35);
    }
  }
  return { MudkipP };
})();
