/* ------------------------------------------------------------------
   Player — Mudkip, the photographer. Two ways to play:
   · direct platformer control (keyboard or the touch pad): run, jump
     (hold for higher, tap for a hop), a somersault double jump, a belly
     flop that shakes the ground, leaping out of the water, landing on
     docks, bridges, ledges and Walrein's ice floes, dashing underwater;
   · tap-to-move (walks, swims, hops onto docks, dives off the end).
   Mudkip is goofy: it skids, trips over nothing, bonks into Pokémon,
   teeters on edges, sneezes, blows bubbles, stares at the camera and
   plays dead. Field moves (the TM wheel): Water Gun, Tackle, Sing,
   Scan, Bubble, Growl, Dig, Rock Smash and Ice Beam, plus berries.
------------------------------------------------------------------- */
const Player = (() => {
  const { clamp, lerp, rnd, pick, approach, hex } = U;
  const { wait, until } = Mons;
  const AQUA = () => hex('#8fd6ee');
  const SAND = [0xffd8ecf4, 0xffb8d0e0];
  const TAU = Math.PI * 2;
  const floes = () => (typeof AI !== 'undefined' && AI.floes ? AI.floes : []);

  class MudkipP extends Mons.Mon {
    constructor(x) {
      super(Mudkip, { kind: 'mudkip', dex: 'mudkip', pal: Mudkip.PAL, x, y: World.groundAt(x), yaw: 1.1, qYaw: 0.035, qPose: 0.04, z: 5, persona: 'player',
        qFields: { mouth: 0.1, bodyDip: 0.5, legF: 0.08, legB: 0.08, squash: 0.02, legSplay: 0.06, tailWag: 0.05, look: 0.05, strum: 0.25, prop: 0.5 } });
      this.sq = new Spring(300, 13); this.finS = new Spring(120, 6.5); this.tailS = new Spring(80, 5);
      this.target = null; this.keyDir = 0; this.keyY = 0;
      this.happyT = 0; this.dizzy = 0; this.look = {}; this.holdCam = 0;
      this.vx = 0; this.vy = 0; this.climb = null;
      this.sneak = false; this.running = false; this.jumpHeld = false;
      this.jumpBuf = 0; this.coyote = 0; this.jumping = false; this.cut = false; this.flipped = false; this.flipT = 0; this.flipDir = 1;
      this.pound = false; this.hang = 0; this.splatT = 0; this.crouch = 0; this.floe = null; this.rot = 0; this.rotY = 0;
      this.bumpCool = 0; this.sayCool = 4; this.dashT = 0; this.teeterT = 0; this.watchMon = null; this.watchScan = 0;
      this.scale = 0.62; this.resize();
    }
    resize() { const m = Mudkip.meta; this.SW = Math.ceil(m.bw * this.scale); this.SH = Math.ceil(m.bh * this.scale); this.OX = Math.floor(this.SW / 2); this.OY = Math.floor(this.SH * m.oy); }
    senses() {}
    headPt() { return this.at('headTop', 0, -2); }
    get inWater() { return this.mode === 'swim'; }
    get grounded() { return this.mode === 'land' && this.air <= 0 && this.vair === 0; }
    dirX() { return Math.cos(this.yaw) >= 0 ? 1 : -1; }
    setLook(look) { this.look = Object.assign({}, look); }
    // little speech bubbles ("Mud?", "Kip!")
    say(text, life = 1.6) { if (typeof Talk !== 'undefined') Talk.bubble(() => this.headPt(), text, { life, who: this }); }
    // ---- orders ----
    goTo(tg) { this.target = tg; this.keyDir = 0; this.wakeUp(); }
    // idle antics are low-priority tasks any order cancels
    wakeUp() { this.idleT = 0; if (this.task && this.task.idle && !this.task.done) { this.task.done = true; this.sleepy = false; this.rot = 0; } }
    idleTask(g) { if (this.doTask(g, 1)) this.task.idle = true; }
    stop() { this.target = null; }
    brain() { return (function* () { for (;;) yield; })(); }
    jumpPress() { this.jumpBuf = 0.15; this.wakeUp(); }

    update(dt, t) {
      this.st += dt; this.o = {}; this.moving = 0;
      this.jumpBuf = Math.max(0, this.jumpBuf - dt); this.coyote = Math.max(0, this.coyote - dt);
      this.bumpCool -= dt; this.sayCool -= dt; this.dashT = Math.max(0, this.dashT - dt);
      const input = this.keyDir || this.keyY || this.jumpBuf > 0;
      if (input && this.task && this.task.idle) this.wakeUp();
      if (this.task && !this.task.done) this.task.step(dt);
      else this.control(dt, t);
      // idle antics after standing still for a while
      const free = !this.task || this.task.done;
      const still = !this.target && !this.keyDir && !this.keyY && this.air <= 0 && this.mode !== 'fall' && (free || this.task.idle) && Game.mode === 'explore';
      this.idleT = still ? (this.idleT || 0) + dt : 0;
      if (still && free && this.idleT > 5 && (this.nextIdle ?? 0) < this.idleT) { this.nextIdle = this.idleT + rnd(3, 6); this.pickIdle(); }
      if (!still) this.nextIdle = 0;
      if (!free && this.mode === 'land' && !this.task.idle && !this.task.keepV && this.air <= 0) this.vx = 0;
      this.physics(dt, t);
      this.animate(dt, t);
      this.juice(dt, t);
    }
    control(dt, t) {
      const direct = this.keyDir || this.keyY || this.jumpBuf > 0 || this.mode === 'fall' || (this.mode === 'land' && (this.air > 0 || this.vair !== 0) && !this.target);
      if (direct) {
        if (this.keyDir || this.keyY || this.jumpBuf > 0) { if (this.target && Game.pin) Game.pin.done = true; this.target = null; }
        this.platform(dt, t);
        return;
      }
      const speed = (this.mode === 'swim' ? 95 : this.sneak ? 45 : 88) * (this.buffT > 0 ? 1.35 : 1);
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
      if (Math.sign(this.vx) === -d && Math.abs(this.vx) > 60 && Math.random() < dt * 20) FX.add({ type: 'dust', x: this.x, y: this.y - 1, vx: -d * 20, vy: -8, r: 2, life: 0.35, c: SAND[0], c2: SAND[1], layer: 2 });
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
      this.x += this.vx * dt;
      if (Math.abs(this.vx) > 4) this.moving = Math.abs(this.vx);
    }
    // nearest point on land just before the water, going toward x1
    edgeToward(x1) {
      const d = x1 > this.x ? 1 : -1;
      for (let x = this.x; d > 0 ? x <= x1 : x >= x1; x += d * 4) if (World.isWet(x, 16)) return x - d * 10;
      return x1;
    }

    /* ================= direct platformer control ================= */
    platform(dt, t) {
      const kx = this.keyDir, ky = this.keyY;
      const run = this.running && !this.sneak;
      if (this.mode === 'swim') {
        const sp = ((run ? 140 : 95) + (this.dashT > 0 ? 120 : 0)) * (this.buffT > 0 ? 1.35 : 1);
        this.vx = lerp(this.vx, kx * sp, dt * (this.dashT > 0 ? 2 : 5)); this.vy = lerp(this.vy, ky * sp * 0.8, dt * 5);
        if (kx) this.turn(this.face(kx, true), dt, 8);
        // dive: press down at the surface for a nose-first plunge
        if (ky > 0 && !(this.diveT > 0) && this.y < WorldRender.surfaceAt(this.x, t) + 16 && (this.diveCool || 0) < t) { this.diveT = 0.6; this.diveCool = t + 1; FX.splashAt(this.x, WorldRender.surfaceAt(this.x, t), { power: 0.5, n: 8 }); Game.sfx('splash', this.x, 0.5); FX.bubbles(this.x, this.y, 8, WorldRender.surfaceAt(this.x, t)); }
        if (this.jumpBuf > 0) {
          this.jumpBuf = 0;
          const s = WorldRender.surfaceAt(this.x, t);
          if (this.y < s + 24) this.leapOut(s); else this.dash();
        }
        return;
      }
      if (this.mode === 'fall') {
        if (kx) { this.vx = approach(this.vx, kx * (run ? 150 : 105), 420 * dt); this.turn(this.face(kx), dt, 9); }
        if (this.jumpBuf > 0) {
          if (this.coyote > 0) { this.jumpBuf = 0; this.coyote = 0; this.vy = -268; this.jumping = true; this.cut = false; this.boing(); }
          else if (!this.flipped && !this.pound) { this.jumpBuf = 0; this.somersault(); }
        }
        if (this.jumping && !this.jumpHeld && this.vy < -90 && !this.cut) { this.vy *= 0.5; this.cut = true; }
        if (ky > 0 && !this.pound && this.vy > -160) this.startPound();
        return;
      }
      if (this.mode !== 'land') return;
      const grounded = this.air <= 0 && this.vair === 0;
      const sp = this.sneak ? 45 : run ? 150 : 92;
      const want = this.crouch > 0.5 ? 0 : kx * sp;
      if (kx) this.turn(this.face(kx), dt, grounded ? 12 : 9);
      if (grounded) this.drive(want, dt);
      else { this.vx = approach(this.vx, want, (kx ? 460 : 150) * dt); this.x += this.vx * dt; if (Math.abs(this.vx) > 4) this.moving = Math.abs(this.vx); }
      // jump (buffered, and still allowed a moment after running off an edge)
      if (this.jumpBuf > 0) {
        if (grounded || this.coyote > 0) { this.jumpBuf = 0; this.jump(); }
        else if (!this.flipped && !this.pound && this.air > 5) { this.jumpBuf = 0; this.somersault(); }
      }
      // variable height: let go early for a short hop
      if (this.jumping && !this.jumpHeld && this.vair > 90 && !this.cut) { this.vair *= 0.5; this.cut = true; }
      // down in mid-air: belly flop!
      if (ky > 0 && !grounded && this.air > 12 && !this.pound) this.startPound();
      // down on the ground: crouch and peer at the ground
      this.crouch = grounded && ky > 0 ? Math.min(1, this.crouch + dt * 6) : Math.max(0, this.crouch - dt * 6);
      if (!grounded) return;
      // skid when turning round at speed
      if (kx && Math.sign(this.vx) === -kx && Math.abs(this.vx) > 70) { this.skidT = 0.18; if (Math.random() < dt * 30) FX.add({ type: 'dust', x: this.x, y: this.y - 1, vx: -kx * 20, vy: -10, r: 2, life: 0.35, c: SAND[0], c2: SAND[1], layer: 2 }); }
      if (run && Math.abs(this.vx) > 125) {
        if (Math.random() < dt * 10) FX.add({ type: 'speed', x: this.x - this.dirX() * 14, y: this.y - rnd(6, 20), dx: this.dirX(), dy: 0, len: 9, life: 0.22, c: 0xc0ffffff, layer: 3 });
        // every so often Mudkip trips over absolutely nothing
        if (!this.plat && !this.floe && Math.random() < dt * 0.022) this.doTask(this.trip(), 2);
        this.bumpCheck();
      }
    }
    boing(k = 1) {
      this.sq.kick(-0.35 * k); this.finS.kick(-2); this.tailS.kick(3);
      Game.sfx('boing', this.x, 0.32);
      for (let i = 0; i < 4; i++) FX.add({ type: 'dust', x: this.x + rnd(-6, 6), y: this.y - 1, vx: rnd(-25, 25), vy: -rnd(4, 12), r: 1.6, life: 0.35, c: SAND[0], c2: SAND[1], layer: 2 });
    }
    jump() {
      const fast = Math.abs(this.vx) > 120;
      this.vair = fast ? 305 : 268; this.air = Math.max(this.air, 0.5);
      this.jumping = true; this.cut = false; this.flipped = false; this.pound = false; this.coyote = 0; this.crouch = 0;
      this.boing();
      if (typeof Social !== 'undefined') Social.mudkipJumped(this);
    }
    somersault() {
      this.flipped = true; this.flipT = 0.5; this.flipLen = 0.5; this.flipSpins = 1; this.flipDir = this.keyDir || this.dirX();
      if (this.mode === 'fall') this.vy = Math.min(this.vy, -250); else { this.vair = 245; this.jumping = true; this.cut = true; }
      Game.sfx('whoosh', this.x, 0.45); this.happyT = 0.6;
      FX.sparkles(this.x, this.y - 10, 5, 18);
    }
    startPound() {
      this.pound = true; this.hang = 0.13; this.flipT = 0; this.rot = 0;
      if (this.mode === 'fall') this.vy = 0; else this.vair = 0.001;
      Game.sfx('whoosh', this.x, 0.5);
    }
    leapOut(s) {
      this.rot = 0;
      this.mode = 'fall'; this.plat = null; this.floe = null;
      this.jumping = true; this.cut = false; this.flipped = false; this.pound = false;
      this.vy = -(this.running ? 360 : 325); this.vx = (this.keyDir || this.dirX()) * (this.running ? 140 : 105);
      this.y = Math.min(this.y, s + 4);
      FX.splashAt(this.x, s, { power: 0.6, n: 10 }); Game.sfx('splash', this.x, 0.6);
      this.happyT = 0.5;
      for (const m of Mons.all) if (m !== this) m.hear('splash', this.x, 0.3);
    }
    dash() {
      this.dashT = 0.4; this.vx += this.dirX() * 170;
      Game.sfx('whoosh', this.x, 0.4);
      FX.bubbles(this.x - this.dirX() * 10, this.y - 6, 6, WorldRender.surfaceAt(this.x, Game.t));
    }
    // a hard landing from a belly flop: a shockwave everybody feels
    slam() {
      const x = this.x, y = this.y;
      Game.shake(3.2); Game.sfx('thud', x, 1); this.sq.kick(1.4); this.splatT = 0.6;
      FX.add({ type: 'ring', x, y: y + 1, r0: 3, r1: 34, flat: 0.28, life: 0.5, c: 0xffffffff, layer: 2 });
      FX.add({ type: 'ring', x, y: y + 1, r0: 2, r1: 22, flat: 0.28, life: 0.4, c: 0xffffe8b0, layer: 2 });
      for (let i = 0; i < 14; i++) { const d = i % 2 ? 1 : -1; FX.add({ type: 'dust', x: x + d * rnd(4, 14), y: y - 1, vx: d * rnd(30, 90), vy: -rnd(10, 40), r: rnd(1.6, 3), life: 0.5, c: SAND[0], c2: SAND[1], layer: 2 }); }
      FX.add({ type: 'burst', x, y: y - 3, r: 7, life: 0.25, layer: 3 });
      for (const m of Mons.all) {
        if (m === this || !m.alive) continue;
        const d = Math.hypot(m.x - x, (m.y - y) * 1.3);
        if (d > 120) continue;
        if (m.onPound) m.onPound(this, d); else if (typeof Social !== 'undefined') Social.startle(m, this, d);
      }
      for (const h of Game.area.hot) if (h.onPound && !h.off && x > h.x0 - 20 && x < h.x1 + 20 && y > h.y0 - 30 && y < h.y1 + 30) h.onPound(this);
      if (Game.area.def.onPound) Game.area.def.onPound(Game.area, x, y);
      const b = Game.area.def.ball && Game.area.def.ball();
      if (b && Math.abs(b.x - x) < 60 && !b.holder) b.kick(Math.sign(b.x - x || 1) * 40, -rnd(160, 220), this);
      if (Math.random() < 0.35) { this.dizzy = 1.1; FX.add({ type: 'dizzy', at: () => this.headPt(), rx: 8, life: 1.1, layer: 3 }); if (this.sayCool < 0) { this.say(pick(['Mud...', 'Ow ow', '@_@'])); this.sayCool = 3; } }
      Save.data.stats.pounds = (Save.data.stats.pounds || 0) + 1;
      if (typeof Talk !== 'undefined') Talk.event('flop', x);
      if (typeof Harvest !== 'undefined') Harvest.pound(x, y);
      if (Game.area && Game.area.def.onPound) Game.area.def.onPound(x, y);
    }
    // running into a Pokémon: bonk!
    bumpCheck() {
      if (this.bumpCool > 0) return;
      const d = this.dirX();
      for (const m of Mons.all) {
        if (m === this || !m.alive || !m.visible || m.hideK > 0.5 || m.mode === 'swim' || m.mode === 'fly' || m.layer) continue;
        const w = m.width() * 0.4 + 6;
        if ((m.x - this.x) * d > 0 && Math.abs(m.x - this.x) < w && Math.abs((m.y - 8) - (this.y - 8)) < 16) {
          this.bumpCool = 1.4;
          FX.bonk(this.x + d * 10, this.y - 12, 7); Game.sfx('bonk', this.x, 0.8); Game.shake(1.2);
          this.vx = -d * 110; this.vair = 150; this.air = Math.max(this.air, 0.5); this.dizzy = 0.8; this.jumping = false;
          if (m.onBump) m.onBump(this); else if (typeof Social !== 'undefined') Social.bumped(m, this, d);
          if (this.sayCool < 0) { this.say(pick(['Oof!', 'Mud!?', 'Sorry!'])); this.sayCool = 3; }
          return;
        }
      }
    }
    landed(v) {
      const wasPound = this.pound;
      this.jumping = false; this.flipped = false; this.flipT = 0; this.rot = 0; this.pound = false; this.hang = 0;
      if (wasPound) { this.slam(); return; }
      if (v > 140) { this.sq.kick(Math.min(1.2, v * 0.004)); Game.sfx('pat', this.x, 0.4); for (let i = 0; i < 3; i++) FX.add({ type: 'dust', x: this.x + rnd(-7, 7), y: this.y - 1, vx: rnd(-30, 30), vy: -rnd(4, 10), r: 1.6, life: 0.35, c: SAND[0], c2: SAND[1], layer: 2 }); }
      // a long fall: splat!
      if (v > 540) { this.splatT = 0.7; this.dizzy = 0.9; Game.shake(2); Game.sfx('thud', this.x, 0.6); if (this.sayCool < 0) { this.say('Splat.'); this.sayCool = 3; } }
      if (typeof Social !== 'undefined') Social.mudkipLanded(this, v);
    }
    // a platform (dock, bridge, ledge, ice floe) crossed while coming down from y0 to y1
    platBelow(x, y0, y1, any = false) {
      const base = World.groundAt(x);
      for (const p of World.plats) {
        if (p.off || x < p.x0 || x > p.x1) continue;
        const py = World.platY(p, x);
        if (py > 1e5) continue;
        if (!any && py > base - 2) continue;
        if (y0 <= py + 1.5 && y1 >= py - 0.5) return { plat: p, y: py };
      }
      for (const f of floes()) {
        const top = f.y - 3;
        if (Math.abs(x - f.x) < f.w / 2 && y0 <= top + 1.5 && y1 >= top - 0.5) return { floe: f, y: top };
      }
      return null;
    }
    // at the edge of a cliff, a dock or a ledge (facing it)
    edgeAhead() {
      const d = this.dirX(), x = this.x;
      if (this.plat) {
        const p = this.plat, ex = d > 0 ? p.x1 : p.x0;
        return Math.abs(ex - x) < 6 && World.groundAt(ex + d * 6) > World.platY(p, x) + 20;
      }
      if (this.floe) return Math.abs(this.floe.x + d * this.floe.w / 2 - x) < 5;
      const g0 = World.groundAt(x), g1 = World.groundAt(x + d * 9);
      return g1 > g0 + 26 || (World.isWet(x + d * 9, 16) && g1 > g0 + 14);
    }

    /* ---- idle antics ---- */
    pickIdle() {
      if (this.mode === 'swim') { this.idleTask(Math.random() < 0.6 ? this.surfaceSplash() : this.blowBubble()); return; }
      if (this.mode !== 'land') return;
      if (this.idleT > 26) { this.idleTask(this.nap()); return; }
      if (this.edgeAhead() && Math.random() < 0.7) { this.idleTask(this.teeter()); return; }
      const r = Math.random();
      this.idleTask(
        r < 0.13 ? this.lookAround() : r < 0.23 ? this.joyHop() : r < 0.32 ? this.tailChase() : r < 0.4 ? this.yawn()
        : r < 0.5 ? this.sneeze() : r < 0.59 ? this.scratch() : r < 0.68 ? this.blowBubble() : r < 0.77 ? this.stareCam()
        : r < 0.86 ? this.sniffGround() : r < 0.93 ? this.wiggleDance() : this.playDead());
    }
    *lookAround() { let e = 0; while (e < 2.4) { const dt = yield; e += dt; this.o.look = Math.sin(e * 2.6) * 0.5; this.o.headRoll = Math.sin(e * 2.6) * 0.08; } }
    *joyHop(n = 2) {
      for (let i = 0; i < n; i++) { this.vair = 210; this.air = 0.5; Game.sfx('boing', this.x, 0.35); this.happyT = 0.6; yield* until(() => this.air <= 0 && this.vair === 0, 2); yield* wait(0.08); }
    }
    *tailChase() {
      const y0 = this.yaw; let e = 0;
      while (e < 1.6) { const dt = yield; e += dt; this.yaw = y0 + e * 7.8; this.o.tailWag = Math.sin(e * 20) * 0.5; this.happyT = 0.2; }
      this.yaw = this.face(Math.cos(this.yaw) >= 0 ? 1 : -1, false); this.dizzy = 0.8;
      FX.add({ type: 'dizzy', at: () => this.headPt(), rx: 8, life: 0.9, layer: 3 });
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
    // the build-up... the build-up... ACHOO! (and it blows itself backwards)
    *sneeze() {
      let e = 0;
      while (e < 1.1) { const dt = yield; e += dt; const k = e / 1.1; this.o.headPitch = -0.28 * k; this.o.eyes = k > 0.45 ? 'blink' : 'open'; this.o.mouth = 0.3 + 0.4 * k; this.o.squash = -0.05 * k; this.o.finSway = -0.1 * k; }
      const d = this.dirX(), [mx, my] = this.at('mouth');
      Game.sfx('pop', this.x, 0.7); Game.sfx('splash', this.x, 0.3);
      this.say('ACHOO!', 1.2);
      for (let i = 0; i < 14; i++) FX.add({ type: 'drop', x: mx, y: my, vx: d * rnd(60, 160), vy: -rnd(-20, 80), g: 420, life: 1, c: 0xffffffff, c2: AQUA(), size: 1 + (Math.random() < 0.4 ? 1 : 0), floor: World.groundAt(mx + d * 30), layer: 3 });
      this.vx = -d * 90; this.vair = 120; this.air = 0.5; this.sq.kick(0.8); this.finS.kick(5);
      e = 0;
      while (e < 0.6) { const dt = yield; e += dt; this.o.headPitch = 0.3 * (1 - e / 0.6); this.o.eyes = 'blink'; this.o.mouth = 1; }
      this.happyT = 0.5;
    }
    // scratches behind the gill with a back paw, like a puppy
    *scratch() {
      let e = 0;
      while (e < 1.9) { const dt = yield; e += dt; this.o.legB = 0.95 + Math.sin(e * 30) * 0.35; this.o.headRoll = 0.24; this.o.headPitch = 0.1; this.o.eyes = 'happy'; this.o.lean = -0.06; this.o.tailWag = Math.sin(e * 12) * 0.3; this.o.mouth = 0.8; }
    }
    // a bubble grows from its mouth... and pops right in its face
    *blowBubble() {
      const d = this.dirX(), B = { r: 0, pop: false };
      const at = () => { const [mx, my] = this.at('mouth'); return [mx + d * (2 + B.r), my - 1]; };
      const p = FX.add({ type: 'fn', life: 3, layer: 3, draw: (fb, q, k, cx, cy) => { if (B.pop || B.r < 1) return; const [x, y] = at(); const X = Math.round(x - cx), Y = Math.round(y - cy), r = B.r; fb.ring(X, Y, r, r, 0xffe8faff); fb.set(X - Math.round(r * 0.45), Y - Math.round(r * 0.45), 0xffffffff); if (r > 3) fb.set(X - Math.round(r * 0.45) + 1, Y - Math.round(r * 0.45), 0xffffffff); } });
      let e = 0;
      while (e < 1.7) { const dt = yield; e += dt; B.r = Math.min(this.mode === 'swim' ? 5 : 8, e * 5.5); this.o.mouth = 0.35; this.o.eyes = e > 1.2 ? 'open' : 'happy'; this.o.look = 0.3; this.o.headPitch = -0.05; }
      B.pop = true; p.life = 0;
      const [x, y] = at();
      Game.sfx('pop', this.x, 0.7);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; FX.add({ type: 'drop', x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, g: 200, life: 0.4, c: 0xffe8faff, size: 1, layer: 3 }); }
      this.emote('shock', 0.8);
      e = 0;
      while (e < 0.7) { const dt = yield; e += dt; this.o.eyes = 'blink'; this.o.squash = -0.06; this.o.headPitch = -0.12; }
      if (this.sayCool < 0) { this.say(pick(['Mud?!', 'Kip!?'])); this.sayCool = 4; }
    }
    // turns and stares right into the camera. Hello?
    *stareCam() {
      let e = 0;
      for (let i = 0; i < 90; i++) { const dt = yield; if (this.turn(Math.PI / 2, dt, 4)) break; }
      while (e < 3) {
        const dt = yield; e += dt;
        this.o.headRoll = Math.sin(Math.min(1, e / 1.5) * Math.PI / 2) * 0.22; this.o.eyes = e > 2.4 && e < 2.55 ? 'blink' : 'open'; this.o.mouth = 0.4;
        if (e > 1.2 && e - dt <= 1.2) this.say(pick(['Kip?', 'Mud?', '...?']));
      }
      this.yaw = this.face(Math.random() < 0.5 ? 1 : -1, false);
    }
    // nose to the ground. Sometimes it finds something!
    *sniffGround() {
      let e = 0;
      while (e < 2.2) { const dt = yield; e += dt; this.o.bodyDip = 1.4; this.o.headPitch = 0.45 + Math.sin(e * 16) * 0.05; this.o.eyes = 'blink'; this.o.mouth = 0.2; if (Math.random() < dt * 6) FX.add({ type: 'dust', x: this.x + this.dirX() * 14, y: this.y - 1, vx: rnd(-10, 10), vy: -6, r: 1.2, life: 0.3, c: SAND[0], c2: SAND[1], layer: 2 }); }
      if (!this.plat && Math.random() < 0.18) { Save.addItem('berry', 1); Game.sfx('twinkle', this.x); FX.sparkles(this.x + this.dirX() * 14, this.y - 4, 6, 12); HUD.toast('Mudkip sniffed out a berry!', { life: 2, icon: 'berry' }); this.happyT = 0.8; }
      else this.emote('bulb', 0.8);
    }
    *wiggleDance() {
      let e = 0;
      Game.sfx('chirp', this.x, 0.5);
      while (e < 2.6) { const dt = yield; e += dt; const s = Math.sin(e * 9); this.o.lean = s * 0.12; this.o.headRoll = -s * 0.14; this.o.legF = Math.max(0, s) * 0.7; this.o.legB = Math.max(0, -s) * 0.7; this.o.tailWag = Math.sin(e * 18) * 0.5; this.o.eyes = 'happy'; this.o.mouth = 1; if (Math.random() < dt * 2.5) FX.add({ type: 'icon', icon: 'note', x: this.x + rnd(-10, 10), y: this.y - 30, vx: rnd(-10, 10), vy: -22, life: 1.1, layer: 3 }); }
    }
    // the most dramatic faint in Hoenn
    *playDead() {
      const d = this.dirX(); let e = 0;
      this.say(pick(['Ugh...', 'Bleh.', 'x_x']), 1.2);
      while (e < 0.35) { const dt = yield; e += dt; const k = U.ease.inCubic(Math.min(1, e / 0.35)); this.rot = -d * 1.45 * k; this.rotY = 4 * k; this.o.eyes = 'sleep'; }
      Game.sfx('pat', this.x, 0.5); this.sq.kick(0.6);
      e = 0;
      while (e < 2.2) { const dt = yield; e += dt; this.rot = -d * 1.45; this.rotY = 4; this.o.eyes = 'sleep'; this.o.mouth = 1; this.o.legF = -0.9 + Math.sin(e * 3) * 0.05; this.o.legB = 0.9; this.o.tailWag = e > 1.6 ? Math.sin(e * 20) * 0.3 : 0; }
      e = 0;
      while (e < 0.3) { const dt = yield; e += dt; const k = 1 - e / 0.3; this.rot = -d * 1.45 * k; this.rotY = 4 * k; }
      this.rot = 0; this.rotY = 0; this.vair = 150; this.air = 0.5; this.happyT = 0.8;
    }
    *teeter() {
      let e = 0;
      this.emote('sweat', 1.2);
      while (e < 2) { const dt = yield; e += dt; const s = Math.sin(e * 11); this.o.lean = 0.12 + s * 0.12; this.o.headPitch = 0.18 + s * 0.1; this.o.legF = -0.6 + s * 0.4; this.o.eyes = 'open'; this.o.mouth = 0.9; }
      this.vx = -this.dirX() * 40;
    }
    *trip() {
      const d = this.dirX();
      this.task.keepV = true;
      let e = 0;
      Game.sfx('pat', this.x, 0.6);
      while (e < 0.28) { const dt = yield; e += dt; const k = e / 0.28; this.rot = d * 1.2 * k; this.rotY = 3 * k; this.x += d * 90 * dt * (1 - k); this.o.eyes = 'blink'; this.o.legB = 0.9; this.o.mouth = 1; }
      Game.sfx('thud', this.x, 0.5); Game.shake(1);
      for (let i = 0; i < 8; i++) FX.add({ type: 'dust', x: this.x + d * rnd(4, 14), y: this.y - 1, vx: d * rnd(10, 50), vy: -rnd(4, 20), r: rnd(1.4, 2.6), life: 0.5, c: SAND[0], c2: SAND[1], layer: 2 });
      this.vx = 0;
      e = 0;
      while (e < 0.8) { const dt = yield; e += dt; this.rot = d * 1.2; this.rotY = 3; this.o.eyes = 'sleep'; this.o.legB = 0.9 + Math.sin(e * 20) * 0.2; }
      e = 0;
      while (e < 0.25) { const dt = yield; e += dt; const k = 1 - e / 0.25; this.rot = d * 1.2 * k; this.rotY = 3 * k; }
      this.rot = 0; this.rotY = 0;
      this.say(pick(['I meant that.', 'Mud...', 'Kip!']));
      this.dizzy = 0.5;
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
        if (Math.random() < dt * 12) FX.add({ type: 'drop', x: this.x - Math.cos(this.yaw) * 12, y: s - 2, vx: rnd(-50, 50), vy: -rnd(60, 140), g: 420, life: 0.8, c: 0xffffffff, c2: AQUA(), size: 2, floor: s + 2, layer: 3 });
      }
      FX.add({ type: 'ripple', x: this.x, y: s + 1, r0: 2, r1: 14, flat: 0.3, life: 1, c: 0xffffffff, layer: 2 });
    }
    *shakeOff() {
      let e = 0;
      while (e < 0.9) {
        const dt = yield; e += dt;
        this.o.headRoll = Math.sin(e * 40) * 0.25 * (1 - e / 0.9); this.o.eyes = 'blink'; this.o.squash = Math.sin(e * 40) * 0.04;
        if (Math.random() < dt * 30) FX.add({ type: 'drop', x: this.x + rnd(-10, 10), y: this.y - rnd(10, 26), vx: rnd(-70, 70), vy: -rnd(30, 90), g: 420, life: 0.6, c: 0xffffffff, c2: AQUA(), size: 1, floor: World.groundAt(this.x), layer: 3 });
      }
      this.happyT = 0.5;
    }
    jumpOn() { this.jump(); }
    *climbUp(p, x) {
      this.vx = this.vy = 0; this.mode = 'climb';
      const y0 = this.y, y1 = World.platY(p, x);
      let e = 0;
      Game.sfx('pat', x, 0.6);
      while (e < 0.7) { const dt = yield; e += dt; this.x = lerp(this.x, x, dt * 8); this.y = lerp(y0, y1, U.ease.inOut(e / 0.7)); this.o.legF = Math.sin(e * 20) * 0.7; this.o.legB = -Math.sin(e * 20) * 0.7; }
      FX.splashAt(x, WorldRender.surfaceAt(x, Game.t), { power: 0.3, n: 6 });
      this.mode = 'land'; this.plat = p; this.air = 0; this.y = World.platY(p, this.x);
    }
    *diveOff(tg) {
      const dir = tg.x > this.x ? 1 : -1;
      // crouch, then leap
      let e = 0; while (e < 0.18) { const dt = yield; e += dt; this.o.bodyDip = 1.6; this.o.squash = 0.08; }
      this.mode = 'fall'; this.plat = null; this.floe = null; this.diving = true;
      this.vx = dir * 95; this.vy = -250;
      this.happyT = 1;
      Game.sfx('boing', this.x, 0.5);
      yield* until(() => this.mode !== 'fall', 4);
      this.target = tg;
    }

    /* ================= physics ================= */
    physics(dt, t) {
      if (this.mode === 'ride' || this.mode === 'toy') return;
      if (this.flipT > 0) { this.flipT = Math.max(0, this.flipT - dt); const L = this.flipLen || 0.5, k = 1 - this.flipT / L; this.rot = this.flipDir * TAU * (this.flipSpins || 1) * U.ease.inOut(clamp(k, 0, 1)); this.rotY = 0; if (this.flipT === 0) { this.rot = 0; this.flipLen = 0.5; this.flipSpins = 1; } }
      const x0 = this.x;
      if (this.mode === 'land') {
        // riding an ice floe
        if (this.floe) {
          const f = this.floe;
          if (!floes().includes(f)) this.floe = null;
          else { this.x += (f.x - (f.px ?? f.x)); if (Math.abs(this.x - f.x) > f.w / 2 + 1) { this.floe = null; this.coyote = 0.1; } }
        }
        if (World.isWet(this.x, 16) && this.air <= 0 && !this.plat && !this.floe) {
          this.mode = 'swim'; this.vx = Math.cos(this.yaw) * 40; this.vy = 20; this.rot = 0;
          FX.splashAt(this.x, WorldRender.surfaceAt(this.x, t), { power: 0.45, n: 8 }); Game.sfx('splash', this.x, 0.5);
          for (const m of Mons.all) if (m !== this) m.hear('splash', this.x, 0.4);
        }
        const base0 = this.floe ? this.floe.y - 3 : this.plat ? World.platY(this.plat, this.x) : World.groundAt(this.x);
        if (this.air > 0 || this.vair !== 0) {
          if (this.hang > 0) { this.hang -= dt; this.vair = 0.001; if (this.hang <= 0) this.vair = -480; }
          else this.vair -= (this.pound ? 1700 : this.vair > 0 ? (this.jumpHeld && this.jumping ? 720 : 1000) : 1150) * dt;
          const y0 = base0 - this.air;
          this.air += this.vair * dt;
          // coming down onto a dock, a bridge, a ledge or a floe above the ground we are over
          if (this.vair < 0) {
            const hit = this.platBelow(this.x, y0, base0 - this.air);
            if (hit) { if (hit.floe) { this.floe = hit.floe; this.plat = null; } else { this.plat = hit.plat; this.floe = null; } const v = -this.vair; this.air = 0; this.vair = 0; this.y = hit.y; this.landed(v); }
          }
          if (this.air <= 0 && this.vair !== 0) { const v = -this.vair; this.air = 0; this.vair = 0; this.landed(v); }
        }
        if (this.plat && (this.x < this.plat.x0 || this.x > this.plat.x1)) {
          // walked off the end of a dock/bridge
          const py = World.platY(this.plat, this.x);
          if (World.groundAt(this.x) > py + 12) { this.mode = 'fall'; this.vx = this.vx || (Math.cos(this.yaw) > 0 ? 60 : -60); this.vy = this.air > 0 ? -this.vair : -40; this.y = py - this.air; this.air = 0; this.vair = 0; this.plat = null; this.coyote = 0.1; }
          else this.plat = null;
        }
        if (this.mode === 'land') {
          const base = this.floe ? this.floe.y - 3 : this.plat ? World.platY(this.plat, this.x) : World.groundAt(this.x);
          // running off a cliff edge: fall for real (with a moment of coyote time)
          if (!this.plat && !this.floe && this.air <= 0 && base > World.groundAt(x0) + 18 && Math.abs(this.x - x0) > 0.2) { this.mode = 'fall'; this.y = World.groundAt(x0); this.vy = 0; this.coyote = 0.1; }
          else this.y = base - this.air;
        }
        // sandy footprints
        if (this.moving && !this.plat && !this.floe && this.air <= 0 && Game.area && Game.area.footprint && Math.floor(this.phase / Math.PI) !== this.lastStep) { this.lastStep = Math.floor(this.phase / Math.PI); Game.area.footprint(this.x - Math.cos(this.yaw) * 6, this.y, this.lastStep & 1); }
      } else if (this.mode === 'swim') {
        if (this.kickNow) { this.kickNow = false; const sp = Math.hypot(this.vx, this.vy) || 1; const dx = this.keyDir || this.keyY ? (this.keyDir || 0) : this.vx / sp, dy = this.keyDir || this.keyY ? (this.keyY || 0) : this.vy / sp; const n = Math.hypot(dx, dy) || 1; this.vx += (dx / n) * 55; this.vy += (dy / n) * 55; }
        if (this.diveT > 0) { this.diveT -= dt; this.vy = Math.max(this.vy, 120 * (this.diveT / 0.6) + 20); }
        this.x += this.vx * dt; this.y += this.vy * dt;
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        if (this.y < s + 10) { this.y = s + 10; this.vy = Math.max(0, this.vy); }
        if (this.y > g - 8) { this.y = g - 8; this.vy = Math.min(0, this.vy); }
        if (!World.isWet(this.x, 12)) { this.mode = 'land'; this.air = 0; this.vx = 0; this.rot = 0; this.target = this.target && this.target.kind === 'swim' ? null : this.target; if (!this.target && !this.keyDir) this.idleTask(this.shakeOff()); }
        const sp2 = Math.abs(this.vx) + Math.abs(this.vy);
        if (sp2 > 25 && Math.random() < dt * (4 + sp2 * 0.08)) FX.bubbles(this.x - Math.cos(this.yaw) * 12, this.y - 6, 1, WorldRender.surfaceAt(this.x, t));
        if (Math.sign(this.vx) !== (this.lastVxS || 0) && Math.abs(this.vx) > 30) { this.lastVxS = Math.sign(this.vx); FX.bubbles(this.x, this.y - 8, 4, WorldRender.surfaceAt(this.x, t)); }
        // paddling at the surface throws little splashes
        if (this.y < WorldRender.surfaceAt(this.x, t) + 14 && sp2 > 30 && Math.random() < dt * 8) FX.add({ type: 'drop', x: this.x - Math.cos(this.yaw) * 10, y: WorldRender.surfaceAt(this.x, t) - 1, vx: -Math.cos(this.yaw) * 30 + rnd(-15, 15), vy: -rnd(40, 90), g: 420, life: 0.6, c: 0xffffffff, c2: AQUA(), size: 1, floor: WorldRender.surfaceAt(this.x, t) + 1, layer: 3 });
        if (Math.abs(this.vx) + Math.abs(this.vy) > 20) this.moving = 60;
      } else if (this.mode === 'fall') {
        if (this.hang > 0) { this.hang -= dt; this.vy = 0; if (this.hang <= 0) this.vy = 480; }
        else this.vy += (this.pound ? 1700 : this.vy < 0 && this.jumpHeld && this.jumping ? 720 : 900) * dt;
        const y0 = this.y;
        this.x += this.vx * dt; this.y += this.vy * dt;
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        const hit = this.vy > 0 ? this.platBelow(this.x, y0, this.y, true) : null;
        if (hit) {
          this.mode = 'land'; this.diving = false; this.air = 0; this.vair = 0; this.y = hit.y;
          if (hit.floe) { this.floe = hit.floe; this.plat = null; } else { this.plat = hit.plat; this.floe = null; }
          this.landed(this.vy); this.vx *= 0.6;
        } else if (World.waterAt(this.x) !== null && this.y > s + 4 && this.vy > 0) {
          const big = this.pound;
          this.mode = 'swim'; this.diving = false; this.rot = 0; this.flipT = 0; this.pound = false; this.jumping = false; this.flipped = false;
          FX.splashAt(this.x, s, { power: big ? 1.6 : Math.min(1.3, this.vy / 350), n: big ? 30 : 16 }); Game.sfx('splash', this.x, 1);
          if (big) { Game.shake(2.5); if (typeof Ripples !== 'undefined') Ripples.poke(this.x, -120, 8); }
          FX.add({ type: 'ring', x: this.x, y: s, r0: 2, r1: 16, flat: 0.3, life: 0.6, c: 0xffffffff, layer: 2 });
          for (const m of Mons.all) if (m !== this) m.hear('splash', this.x, big ? 1 : 0.8);
          this.vy = 60; this.vx *= 0.3; this.diveT = 0.5;
        } else if (this.y >= g && (this.vy > 0 || this.y > g + 3)) {
          this.mode = 'land'; this.diving = false; const v = this.vy; this.y = g; this.air = 0; this.vair = 0; this.vx *= 0.7;
          this.landed(Math.max(0, v));
        }
      }
      this.x = clamp(this.x, 16, World.W - 16);
      for (const f of floes()) f.px = f.x;
    }
    animate(dt, t) {
      const o = this.o;
      const swim = this.mode === 'swim';
      const walk = this.moving ? clamp(this.moving / 60, 0.6, 1.5) : 0;
      const inAir = (this.mode === 'land' && this.air > 0) || this.mode === 'fall';
      this.gait = approach(this.gait, inAir ? 0 : walk, dt * 6);
      const rate = swim ? 13 + (this.dashT > 0 ? 10 : 0) : 5 + Math.abs(this.vx) * 0.3; // steps keep pace with the ground (no foot sliding)
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
        if (step !== this.lastFall) {
          this.lastFall = step; this.sq.kick(0.12 + fast * 0.1);
          if (typeof Cries !== 'undefined') Cries.step(this.plat ? 'wood' : Game.areaId === 'beach' ? 'sand' : 'grass', this.x);
          if (Weather.W.rain > 0.3) { // splashing through rain puddles
            for (let k = 0; k < 3; k++) FX.add({ type: 'drop', x: this.x - Math.cos(this.yaw) * 6 + rnd(-3, 3), y: this.y - 1, vx: rnd(-30, 30), vy: -rnd(30, 70), g: 420, life: 0.5, c: 0xffffffff, c2: AQUA(), size: 1, floor: this.y, layer: 2 });
            if (Math.random() < 0.3) Game.sfx('plop', this.x, 0.25);
          } else if (Math.random() < 0.55) FX.add({ type: 'dust', x: this.x - Math.cos(this.yaw) * 8, y: this.y - 1, vx: -Math.cos(this.yaw) * 14, vy: -6, r: 1.6 + fast, life: 0.4, c: SAND[0], c2: SAND[1], layer: 2 });
        }
      }
      const sq = this.sq.step(dt);
      const vUp = this.mode === 'fall' ? -this.vy : this.vair;
      P.squash = Math.sin(t * 2.4 + this.seed) * 0.015 + sq * 0.5 + (inAir ? clamp(vUp / 2500, -0.08, 0.08) * -1 : 0);
      P.headPitch = (swim ? 0.1 : 0) + Math.sin(this.phase * 2) * 0.05 * this.gait - fast * 0.06;
      P.lean = swim ? 0.04 + Math.sin(this.phase) * 0.1 : this.gait * 0.06 + fast * 0.08;
      P.headRoll = Math.sin(this.phase) * 0.04 * this.gait;
      P.finSway = 0.04 + this.finS.step(dt, -this.gait * 0.08 - (inAir ? vUp * 0.0004 : 0) - fast * 0.06) + Math.sin(t * 1.7 + this.seed) * 0.03;
      P.tailWag = (swim ? Math.sin(this.phase * 0.5) * 0.5 : Math.sin(t * (2.6 + this.gait * 6) + this.seed) * (0.1 + this.gait * 0.2)) + this.tailS.step(dt);
      P.tailLift = inAir ? 0.15 + clamp(-vUp * 0.0006, -0.1, 0.25) : 0;
      P.mouth = 0.3 + (this.gait > 0.5 ? 0.25 : 0) + fast * 0.4;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (inAir) {
        const rising = vUp > 0;
        P.legF = rising ? -0.55 : 0.35; P.legB = rising ? 0.6 : -0.3; P.mouth = rising ? 0.9 : 0.7; P.eyes = rising ? 'happy' : 'open';
        P.headPitch = rising ? -0.12 : 0.12;
        if (this.flipT > 0) { P.legF = -0.9; P.legB = 0.9; P.eyes = 'happy'; P.mouth = 1; P.squash = 0.12; }
        if (this.pound) { P.legF = -1; P.legB = 1; P.squash = this.hang > 0 ? -0.1 : 0.06; P.eyes = this.hang > 0 ? 'open' : 'blink'; P.mouth = 1; P.headPitch = 0.25; P.finSway = -0.2; }
      }
      if (this.mode === 'fall' && this.diving) { P.headPitch = clamp(this.vy * 0.0022, -0.45, 0.6); P.legF = -0.9; P.legB = 0.9; P.tailLift = 0.3; P.eyes = this.vy < 0 ? 'happy' : 'open'; }
      if (swim) {
        // frog-style breaststroke: both back legs kick together, arms sweep, then a long glide
        const sp = Math.hypot(this.vx, this.vy), moving = sp > 18 || this.keyDir || this.keyY;
        this.strokeP = (this.strokeP || 0) + dt * (moving ? 1.5 + (this.running ? 0.6 : 0) : 0.55);
        const f = this.strokeP % 1;
        if (f < (this.lastStroke ?? 0)) { this.kickNow = moving; if (moving) { FX.bubbles(this.x - this.dirX() * 12, this.y - 4, 3, WorldRender.surfaceAt(this.x, t)); if (this.y < WorldRender.surfaceAt(this.x, t) + 14) Game.sfx('plop', this.x, 0.2); } }
        this.lastStroke = f;
        const kick = f < 0.2 ? Math.sin((f / 0.2) * Math.PI / 2) : Math.max(0, 1 - (f - 0.2) / 0.8);
        P.legB = -0.6 + 1.5 * kick; P.legF = 0.5 - 1.1 * kick; P.legSplay = 0.7 * (1 - kick) + 0.1;
        P.squash = -0.07 * kick + 0.04 * (1 - kick); P.bodyDip = 0;
        P.tailWag = Math.sin(t * 3) * 0.15 + kick * 0.3; P.tailLift = 0.2 + kick * 0.2; P.finSway = -0.18 * kick + 0.05;
        P.headPitch = clamp(this.vy * 0.003, -0.35, 0.4); P.lean = 0.06;
        P.mouth = kick > 0.8 ? 0.8 : 0.35; if (kick > 0.9 && moving) P.eyes = 'happy';
        if (this.dashT > 0) { P.tailWag = Math.sin(t * 30) * 0.6; P.finSway = -0.2; P.eyes = 'happy'; P.legB = 0.9; P.legF = -0.6; }
        // the whole body tilts along the swim direction (diving nose-first)
        const tilt = this.diveT > 0 ? this.dirX() * 1.1 * Math.sin((this.diveT / 0.6) * Math.PI) : clamp(Math.atan2(this.vy, Math.abs(this.vx) + 30) * 0.6, -0.5, 0.7) * this.dirX();
        if (this.flipT <= 0 && !(this.task && !this.task.done)) this.rot = this.rot + (tilt - this.rot) * Math.min(1, dt * 6);
      }
      if (this.crouch > 0) { P.bodyDip = Math.max(P.bodyDip, this.crouch * 2.2); P.headPitch += this.crouch * 0.3; P.legSplay = this.crouch * 0.4; P.look = 0.2 * this.crouch; }
      if (this.skidT > 0) { this.skidT -= dt; P.lean = -0.14; P.headPitch = -0.12; P.eyes = 'open'; P.mouth = 1; P.legF = 0.8; P.legB = 0.3; }
      if (this.splatT > 0) { this.splatT -= dt; const k = Math.min(1, this.splatT / 0.3); P.squash = Math.max(P.squash, 0.3 * k); P.bodyDip = 3 * k; P.legSplay = 1 * k; P.eyes = 'blink'; P.mouth = 1; }
      if (this.dizzy > 0) { this.dizzy -= dt; P.eyes = 'blink'; P.headRoll = Math.sin(t * 9) * 0.18; P.mouth = 0.3; }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      if (this.snapT > 0) { this.snapT -= dt; const k = this.snapT / 0.4; P.squash = 0.12 * k; P.headPitch = -0.1 * k; P.eyes = k > 0.6 ? 'blink' : 'happy'; P.mouth = 0.7; this.sq.kick(0); }
      // curious: watch whatever the Pokémon nearby are up to
      this.watchScan -= dt;
      if (this.watchScan <= 0) { this.watchScan = 0.5; this.watchMon = this.watching || this.findInteresting(); }
      const wm = this.watchMon;
      if (wm && wm.alive && !this.moving && !inAir && !this.task) {
        const dx = (wm.x - this.x) * this.dirX();
        if (dx > -10) { P.look = clamp(dx / 120, -0.3, 0.45); P.headPitch += clamp((wm.y - 16 - (this.y - 18)) / 200, -0.3, 0.3); }
        if (this.watching && Math.random() < dt * 0.7) this.emote(Math.random() < 0.5 ? 'bulb' : 'sparkle', 0.9);
      }
      Object.assign(P, this.look);
      if (this.holdCam > 0.5) P.hold = 'camera';
      if (P.hat === 'propeller') P.prop = inAir || this.gait > 0.4 || swim ? (t * 14) % Math.PI : 0.5;
      Object.assign(P, o);
      this.pose = P;
    }
    findInteresting() {
      let best = null, bd = 150;
      for (const m of Mons.all) {
        if (m === this || !m.alive || !m.visible || m.hideK > 0.5 || m.layer) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d < bd && (m.peak > 0.4 || m.moving)) { bd = d; best = m; }
      }
      return best;
    }

    /* ================= field moves ================= */
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
          FX.add({ type: 'drop', x: mx, y: my, vx, vy, g: 420, life: 1.4, c: 0xffffffff, c2: AQUA(), size: 2, layer: 3, floor: World.groundAt(tx) });
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
      if (typeof Talk !== 'undefined') Talk.event('song', this.x);
    }
    // pick something up by hand: lean down, grab it with the mouth, a happy little hop
    *pickUp(it, done) {
      this.target = null;
      yield* this.faceTo(it.x > this.x ? 1 : -1, false);
      let e = 0;
      while (e < 0.32) { const dt = yield; e += dt; const k = Math.sin((e / 0.32) * Math.PI); this.o.bodyDip = 2 * k; this.o.headPitch = 0.5 * k; this.o.mouth = k > 0.5 ? 0.2 : 0.9; this.o.legF = 0.3 * k; }
      done();
      this.vair = 150; this.air = 0.5; this.happyT = 0.6; this.sq.kick(-0.3);
    }
    // the camera raised, a squash, a flash from the lens: click!
    snapPose() { this.snapT = 0.4; const [lx, ly] = this.spr && this.spr.anchors && this.spr.anchors.lens ? this.at('lens') : this.at('mouth'); FX.add({ type: 'ring', x: lx, y: ly, r0: 1, r1: 10, life: 0.25, c: 0xffffffff, layer: 4 }); FX.sparkles(lx, ly, 4, 8); }
    *throwBerry(tx, ty, kind = 'oran') {
      this.target = null;
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      const [mx, my] = this.at('mouth');
      Game.sfx('whoosh', this.x, 0.5);
      Items.throwBerry(mx, my - 4, tx, ty, kind);
      this.o.mouth = 1; this.happyT = 0.4;
      yield* wait(0.35);
    }
    // Tackle: a wind-up, a charge, a bonk
    *tackle() {
      this.target = null; this.task.keepV = true;
      const d = this.dirX(), swim = this.mode === 'swim';
      let e = 0;
      while (e < 0.16) { const dt = yield; e += dt; this.o.bodyDip = 1.8; this.o.lean = -0.1; this.o.headPitch = 0.22; this.o.eyes = 'open'; this.o.squash = 0.08; }
      Game.sfx('whoosh', this.x, 0.6);
      e = 0; const hit = new Set(); let bonked = false;
      while (e < 0.38 && !bonked) {
        const dt = yield; e += dt;
        const v = 290 * (1 - e / 0.5);
        this.x += d * v * dt; this.moving = v;
        this.o.lean = 0.2; this.o.headPitch = 0.32; this.o.eyes = 'open'; this.o.mouth = 0.2; this.o.legF = -0.9; this.o.legB = 0.9;
        if (Math.random() < dt * 30) FX.add({ type: 'speed', x: this.x - d * 12, y: this.y - rnd(6, 20), dx: d, dy: 0, len: 10, life: 0.2, c: 0xd0ffffff, layer: 3 });
        const hx = this.x + d * 12, hy = this.y - 10;
        for (const m of Mons.all) {
          if (m === this || !m.alive || !m.visible || hit.has(m) || m.layer || m.hideK > 0.6) continue;
          const [cx, cy] = m.center(), hw = m.width() * 0.5 + 6, hh = Math.max(14, (m.spr ? m.spr.h : 20) * 0.55);
          if (Math.abs(cx - hx) < hw && Math.abs(cy - hy) < hh) {
            hit.add(m); bonked = true;
            FX.bonk(hx, hy, 9); Game.sfx('bonk', this.x, 0.9); Game.shake(1.6);
            if (m.onTackle) m.onTackle(this, d); else if (typeof Social !== 'undefined') Social.bumped(m, this, d, true);
          }
        }
        for (const h of Game.area.hot) {
          if (hit.has(h) || h.off || hx < h.x0 || hx > h.x1 || hy < h.y0 - 12 || hy > h.y1 + 12) continue;
          if (!h.onTackle && !h.tap) continue;
          hit.add(h); bonked = true;
          FX.bonk(hx, hy, 8); Game.sfx('bonk', this.x, 0.8); Game.shake(1.2);
          if (h.onTackle) h.onTackle(this, d); else h.tap((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2);
        }
        const b = Game.area.def.ball && Game.area.def.ball();
        if (b && !b.holder && Math.abs(b.x - hx) < 14 && Math.abs(b.y - hy) < 16) { b.kick(d * rnd(180, 240), -rnd(200, 260), this); Game.sfx('boing', b.x, 0.9); bonked = true; }
      }
      if (bonked) {
        if (swim) { this.vx = -d * 80; }
        else { this.vx = -d * 90; this.vair = 150; this.air = Math.max(this.air, 0.5); this.jumping = false; }
        this.dizzy = 0.5;
      } else if (!swim) { this.skidT = 0.3; FX.poof(this.x + d * 6, this.y, SAND[0], SAND[1], 4, 3); }
    }
    // Bubble: a stream of floating bubbles Pokémon love to chase and pop
    *bubble(tx, ty) {
      this.target = null;
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      Game.sfx('bubble', this.x, 0.8);
      let e = 0, n = 0;
      while (e < 1) {
        const dt = yield; e += dt;
        this.o.mouth = 0.75; this.o.headPitch = -0.1; this.o.eyes = e > 0.2 ? 'happy' : 'open';
        if (e > n * 0.13 && n < 7) {
          n++;
          const [mx, my] = this.at('mouth');
          const T = 0.9 + n * 0.08, vx = (tx - mx) / T + rnd(-10, 10), vy = (ty - my) / T - 10 + rnd(-8, 8);
          Bubbles.add(mx, my, vx, vy, 2.5 + Math.random() * 3);
          if (n % 2) Game.sfx('pop', this.x, 0.2);
        }
      }
      for (const m of Mons.all) if (m !== this && m.alive && Math.hypot(m.x - tx, m.y - ty) < 120) { if (m.onBubble) m.onBubble(this); else if (typeof Social !== 'undefined') Social.bubbleFun(m, this, tx, ty); }
    }
    // Growl: a big "MUD-KIP!" and every Pokémon nearby looks your way (a photo trick!)
    *growl() {
      this.target = null;
      let e = 0;
      while (e < 0.3) { const dt = yield; e += dt; this.o.bodyDip = 1.2; this.o.headPitch = 0.2; this.o.squash = 0.06; }
      Game.sfx('mud', this.x, 1); Game.sfx('roar', this.x, 0.35); Game.shake(1.2);
      this.say('MUD-KIP!!', 1.6);
      FX.add({ type: 'ring', x: this.x, y: this.y - 16, r0: 6, r1: 70, flat: 0.7, life: 0.6, c: 0xffffe890, layer: 3 });
      FX.add({ type: 'ring', x: this.x, y: this.y - 16, r0: 4, r1: 48, flat: 0.7, life: 0.5, c: 0xffffffff, layer: 3 });
      for (const m of Mons.all) {
        if (m === this || !m.alive || !m.visible) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d > 230) continue;
        if (m.onGrowl) m.onGrowl(this, d); else if (typeof Social !== 'undefined') Social.growled(m, this, d);
      }
      if (Game.area.def.onGrowl) Game.area.def.onGrowl(Game.area, this.x, this.y);
      e = 0;
      while (e < 0.9) { const dt = yield; e += dt; this.o.mouth = 1; this.o.headPitch = -0.22; this.o.eyes = 'blink'; this.o.squash = -0.05; this.o.finSway = Math.sin(e * 40) * 0.12; }
    }
    // Dig: paws fly, sand flies... treasure (sometimes)
    *dig() {
      this.target = null;
      if (this.plat || this.floe) { this.emote('sweat', 0.8); this.say('Wood...?'); return; }
      const swim = this.mode === 'swim', d = this.dirX();
      let e = 0;
      Game.sfx('dust', this.x, 0.8);
      while (e < 1.3) {
        const dt = yield; e += dt;
        this.o.bodyDip = 1.8; this.o.headPitch = 0.42; this.o.legF = Math.sin(e * 34) * 0.9; this.o.lean = 0.14; this.o.eyes = 'blink'; this.o.mouth = 0.6;
        if (Math.random() < dt * 40) {
          const gx = this.x + d * 10, gy = World.groundAt(gx);
          if (swim) FX.add({ type: 'dust', x: gx, y: gy - 2, vx: -d * rnd(10, 40), vy: -rnd(5, 20), r: rnd(2, 3.5), life: 0.8, c: 0xffa8b4a8, c2: 0xff88948c, layer: 2 });
          else FX.add({ type: 'drop', x: gx, y: gy - 1, vx: -d * rnd(40, 120), vy: -rnd(60, 150), g: 420, life: 1, c: SAND[0], c2: SAND[1], size: 1 + (Math.random() < 0.3 ? 1 : 0), floor: World.groundAt(gx - d * 30), layer: 2 });
        }
      }
      const gx = this.x + d * 10;
      let found = null;
      if (Game.area.def.onDig) found = Game.area.def.onDig(Game.area, gx, World.groundAt(gx));
      if (!found && typeof Harvest !== 'undefined') found = Harvest.dig(gx);
      if (!found) {
        const r = Math.random();
        if (r < 0.3) { Save.addItem('berry', 1); found = 'a berry'; }
        else if (r < 0.4) { Save.addItem(swim ? 'pearl' : 'shell', 1); found = swim ? 'a pearl' : 'a shell'; }
        else if (r < 0.45) { Save.addItem('gem', 1); found = 'a shiny gem'; }
      }
      if (found) { Game.sfx('twinkle', this.x); FX.sparkles(gx, World.groundAt(gx) - 6, 8, 16); HUD.toast('Mudkip dug up ' + found + '!', { life: 2.2 }); this.happyT = 1; this.vair = 170; this.air = 0.5; }
      else { this.emote('sweat', 0.9); if (this.sayCool < 0) { this.say(pick(['Just dirt.', 'Mud...', 'Sand in my gills'])); this.sayCool = 3; } }
    }
    // Rock Smash: headbutt! (cracked rocks break; Mudkip's head does not)
    *rockSmash() {
      this.target = null; this.task.keepV = true;
      const d = this.dirX();
      let e = 0;
      while (e < 0.3) { const dt = yield; e += dt; this.o.bodyDip = 2; this.o.lean = -0.16; this.o.headPitch = -0.2; this.o.eyes = 'open'; this.o.squash = 0.1; }
      Game.sfx('whoosh', this.x, 0.7);
      e = 0; let smashed = false, bonk = false;
      while (e < 0.22 && !smashed && !bonk) {
        const dt = yield; e += dt;
        this.x += d * 200 * dt; this.moving = 200; this.o.lean = 0.22; this.o.headPitch = 0.45; this.o.legF = -1; this.o.legB = 1; this.o.eyes = 'blink';
        const hx = this.x + d * 14, hy = this.y - 10;
        for (const h of Game.area.hot) {
          if (h.off || !h.smash || hx < h.x0 - 4 || hx > h.x1 + 4 || hy < h.y0 - 16 || hy > h.y1 + 16) continue;
          smashed = true; h.smash(this); break;
        }
        if (!smashed) for (const m of Mons.all) { if (m === this || !m.alive || !m.visible || m.layer) continue; const [cx, cy] = m.center(); if (Math.abs(cx - hx) < m.width() * 0.5 + 4 && Math.abs(cy - hy) < 18) { bonk = true; if (m.onTackle) m.onTackle(this, d); else if (typeof Social !== 'undefined') Social.bumped(m, this, d, true); break; } }
      }
      const hx = this.x + d * 14, hy = this.y - 10;
      FX.bonk(hx, hy, smashed ? 12 : 8); Game.shake(smashed ? 3 : 1.5);
      if (smashed) { Game.sfx('crack', this.x, 1); for (let i = 0; i < 12; i++) FX.add({ type: 'drop', x: hx, y: hy, vx: rnd(-120, 120), vy: -rnd(40, 180), g: 480, life: 1.2, c: 0xff8a96a8, c2: 0xff5a6478, size: 2, floor: World.groundAt(hx) + 2, layer: 3 }); this.happyT = 1; }
      else {
        Game.sfx('bonk', this.x, 1);
        this.vx = -d * 80; this.vair = 130; this.air = Math.max(this.air, 0.5); this.dizzy = 1.2;
        FX.add({ type: 'dizzy', at: () => this.headPt(), rx: 8, life: 1.2, layer: 3 });
        if (this.sayCool < 0) { this.say(pick(['Owww!', 'Hard head...', 'Mud...?'])); this.sayCool = 3; }
      }
    }
    // Ice Beam: freezes water into floes you can hop across; frosts Pokémon for a moment
    *iceBeam(tx, ty) {
      this.target = null;
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      Game.sfx('freeze', this.x, 0.8);
      let e = 0;
      // aim at the water ahead when nothing is targeted
      let wx = tx, target = null;
      for (const m of Mons.all) if (m !== this && m.alive && Math.hypot(m.x - tx, m.y - 12 - ty) < 20) target = m;
      if (!target) { const d = this.dirX(); for (let x = this.x + d * 30; Math.abs(x - this.x) < 180; x += d * 6) if (World.waterAt(x) !== null && !World.platAt(x)) { wx = x; break; } }
      const wy = target ? ty : World.waterAt(wx) !== null ? WorldRender.surfaceAt(wx, Game.t) : World.groundAt(wx);
      while (e < 1.1) {
        const dt = yield; e += dt;
        this.o.mouth = 1; this.o.headPitch = -0.08; this.o.eyes = 'open';
        const [mx, my] = this.at('mouth');
        if (e > 0.2 && e < 0.9) for (let k = 0; k < 4; k++) { const q = Math.random(); FX.add({ type: 'spark', x: lerp(mx, wx, q) + rnd(-2, 2), y: lerp(my, wy, q) + rnd(-2, 2), size: 1 + (Math.random() * 2 | 0), life: 0.25, c: 0xffffffff, c2: hex('#9fe8ff'), layer: 3 }); }
      }
      FX.sparkles(wx, wy - 4, 12, 30, 0xffffffff, hex('#9fe8ff'));
      if (target) { if (target.onIce) target.onIce(this); else if (typeof Social !== 'undefined') Social.frozen(target, this); }
      else if (World.waterAt(wx) !== null && typeof AI !== 'undefined' && AI.makeFloe) { FX.splashAt(wx, wy, { power: 0.5, c: hex('#e8fcff') }); const f = AI.makeFloe(wx); f.vx *= 0.3; Game.sfx('crack', wx, 0.5); }
      else { FX.poof(wx, wy, 0xffffffff, hex('#bfefff'), 6, 4); }
      if (Game.area.def.onIce) Game.area.def.onIce(Game.area, wx, wy);
    }
  }

  /* ---- Bubble-move bubbles: drift, wobble, bounce off Pokémon, pop ---- */
  const Bubbles = (() => {
    const list = [];
    function add(x, y, vx, vy, r) { list.push({ x, y, vx, vy, r, t: 0, life: 3.2 + Math.random() * 1.5, ph: Math.random() * 6 }); }
    function pop(b) {
      b.dead = true; Game.sfx('pop', b.x, 0.35);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; FX.add({ type: 'drop', x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, g: 150, life: 0.35, c: 0xffe8faff, size: 1, layer: 3 }); }
    }
    function update(dt) {
      for (const b of list) {
        b.t += dt;
        b.vx *= Math.pow(0.35, dt); b.vy = b.vy * Math.pow(0.35, dt) - 14 * dt;
        b.x += (b.vx + Math.sin(b.t * 3 + b.ph) * 8) * dt; b.y += b.vy * dt;
        if (b.t > b.life || b.y < World.groundAt(b.x) - 300) pop(b);
        else if (b.y > World.groundAt(b.x) - b.r) { b.y = World.groundAt(b.x) - b.r; b.vy = -Math.abs(b.vy) * 0.5; }
        else for (const m of Mons.all) {
          if (m === Game.mudkip || !m.alive || !m.visible || m.layer) continue;
          if (m.hit(b.x, b.y, Math.round(b.r))) { pop(b); if (m.onBubblePop) m.onBubblePop(b); else { m.emote(Math.random() < 0.5 ? 'heart' : 'note', 0.9); if (m.mode === 'land' && m.air <= 0 && !m.busy(3)) m.doTask(m.hop(170), 2); } break; }
        }
      }
      for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    }
    function draw(fb, cx, cy) {
      for (const b of list) {
        const X = Math.round(b.x - cx), Y = Math.round(b.y - cy), r = b.r * (1 + Math.sin(b.t * 7 + b.ph) * 0.06);
        if (X < -10 || Y < -10 || X > fb.w + 10 || Y > fb.h + 10) continue;
        fb.ring(X, Y, r, r * 0.94, 0xffd8f6ff);
        const hx = X - Math.round(r * 0.45), hy = Y - Math.round(r * 0.45);
        fb.set(hx, hy, 0xffffffff); if (r > 3) { fb.set(hx + 1, hy, 0xffffffff); fb.set(hx, hy + 1, 0xfff0fcff); }
        // a faint rainbow film
        fb.set(X + Math.round(r * 0.6), Y + Math.round(r * 0.3), 0xffffc0f0);
      }
    }
    return { list, add, update, draw, clear: () => (list.length = 0) };
  })();

  return { MudkipP, Bubbles };
})();
