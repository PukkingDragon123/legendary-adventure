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
    goTo(tg) { this.target = tg; this.keyDir = 0; }
    stop() { this.target = null; }
    brain() { return (function* () { for (;;) yield; })(); }

    update(dt, t) {
      this.st += dt; this.o = {}; this.moving = 0;
      if (this.task && !this.task.done) this.task.step(dt);
      else this.control(dt, t);
      this.physics(dt, t);
      this.animate(dt, t);
    }
    control(dt, t) {
      const speed = this.mode === 'swim' ? 95 : this.sneak ? 45 : 88;
      // keyboard
      if (this.keyDir || this.keyY) {
        this.target = null;
        if (this.mode === 'swim') { this.vx = lerp(this.vx, this.keyDir * speed, dt * 5); this.vy = lerp(this.vy, this.keyY * speed * 0.8, dt * 5); }
        else if (this.keyDir) { this.turn(this.face(this.keyDir), dt, 9); this.x += this.keyDir * speed * dt; this.moving = speed; if (this.keyY < 0 && this.air <= 0) this.jumpOn(); }
        return;
      }
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
        tx = this.plat ? (tg.x > this.plat.x1 || tg.x > (this.plat.x0 + this.plat.x1) / 2 ? this.plat.x1 + 12 : this.plat.x0 - 12) : World.shoreX + 30;
      } else if (tg.kind === 'plat' && !this.plat) {
        const p = tg.plat;
        if (Math.abs(World.groundAt(p.x0) - World.platY(p, p.x0)) < 10) tx = p.x0 + 4; // step on from the land
      } else if (tg.kind === 'walk' && this.plat) {
        tx = clamp(tg.x, this.plat.x0 - 20, this.plat.x1 + 20);
      }
      const dx = tx - this.x;
      if (Math.abs(dx) < 3) {
        if (tg.kind === 'plat' && !this.plat) { this.plat = tg.plat; return; }
        if (tg.kind === 'swim' && this.plat) { this.doTask(this.diveOff(tg), 3); return; }
        if (tg.kind === 'walk' || tg.kind === 'plat') this.arrive();
        return;
      }
      const d = Math.sign(dx);
      this.turn(this.face(d), dt, 9);
      if (Math.sign(Math.cos(this.yaw)) === d) { this.x += d * Math.min(Math.abs(dx), speed * dt); this.moving = speed; }
      // step onto a dock from the sand when walking across its start
      if (!this.plat) { const p = World.platAt(this.x); if (p && Math.abs(World.groundAt(this.x) - World.platY(p, this.x)) < 8 && (tg.kind === 'plat' || tg.plat === p)) this.plat = p; }
    }
    arrive() { const tg = this.target; this.target = null; if (tg && tg.then) tg.then(); }
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
      this.mode = 'fall'; this.plat = null;
      this.vx = dir * 90; this.vy = -230;
      this.happyT = 1;
      Game.sfx('boing', this.x, 0.5);
      yield* until(() => this.mode !== 'fall', 4);
      this.target = tg;
    }
    physics(dt, t) {
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
        if (!World.isWet(this.x, 12)) { this.mode = 'land'; this.air = 0; this.target = this.target && this.target.kind === 'swim' ? null : this.target; }
        if ((Math.abs(this.vx) + Math.abs(this.vy) > 25) && Math.random() < dt * 4) FX.bubbles(this.x + Math.cos(this.yaw) * 8, this.y - 6, 1, WorldRender.surfaceAt(this.x, t));
        if (Math.abs(this.vx) + Math.abs(this.vy) > 20) this.moving = 60;
      } else if (this.mode === 'fall') {
        this.vy += 800 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        if (World.waterAt(this.x) !== null && this.y > s + 4 && this.vy > 0) {
          this.mode = 'swim'; FX.splashAt(this.x, s, { power: Math.min(1.3, this.vy / 350) }); Game.sfx('splash', this.x, 1);
          for (const m of Mons.all) if (m !== this) m.hear('splash', this.x, 0.8);
          this.vy = 60; this.vx *= 0.3;
        } else if (this.y >= g && this.vy > 0) { this.mode = 'land'; this.y = g; this.sq.kick(0.9); Game.sfx('pat', this.x, 0.8); }
      }
      this.x = clamp(this.x, 16, World.W - 16);
    }
    animate(dt, t) {
      const o = this.o;
      const swim = this.mode === 'swim';
      const walk = this.moving ? clamp(this.moving / 60, 0.6, 1.5) : 0;
      this.gait = approach(this.gait, walk, dt * 6);
      const rate = swim ? 13 : 7 + this.gait * 6;
      if (this.gait > 0.01 || swim) this.phase += dt * rate;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const P = {};
      const g = swim ? Math.max(0.35, this.gait) : this.gait;
      P.legF = s * 0.55 * g; P.legB = -s * 0.55 * g;
      P.bodyDip = swim ? 0 : Math.abs(c) * 1.6 * this.gait;
      const sq = this.sq.step(dt);
      P.squash = Math.sin(t * 2.4 + this.seed) * 0.015 + sq * 0.5 + (this.air > 0 ? clamp(this.vair / 2500, -0.08, 0.08) * -1 : 0);
      P.headPitch = (swim ? 0.1 : 0) + Math.sin(this.phase * 2) * 0.03 * this.gait;
      P.lean = swim ? 0.04 : 0;
      P.finSway = 0.04 + this.finS.step(dt, -this.gait * 0.08 - (this.air > 0 ? this.vair * 0.0004 : 0)) + Math.sin(t * 1.7 + this.seed) * 0.03;
      P.tailWag = Math.sin(t * (swim ? 6 : 2.6) + this.seed) * (swim ? 0.25 : 0.1) + this.tailS.step(dt);
      P.tailLift = this.air > 0 ? 0.15 : 0;
      P.mouth = 0.6;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.air > 0 || this.mode === 'fall') { P.legF = -0.5; P.legB = 0.5; }
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
