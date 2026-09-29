/* ------------------------------------------------------------------
   Mons — living Pokémon for Mudkip Snap. Every creature runs a
   generator "brain" (yields once per frame with dt), tags what it is
   doing for the camera (act + peak moment), and reacts to Mudkip with
   a personality: shy ones flee, curious ones come sniff the lens,
   show-offs pose, grumpy ones attack the camera.
------------------------------------------------------------------- */
const Mons = (() => {
  const { clamp, lerp, rnd, pick, chance, approach } = U;
  const TAU = Math.PI * 2;

  class Task {
    constructor(g, prio = 0) { this.g = g; this.prio = prio; this.done = false; }
    step(dt) { if (this.done) return; try { if (this.g.next(dt).done) this.done = true; } catch (e) { console.error(e); this.done = true; } }
  }
  function* wait(s) { while (s > 0) s -= yield; }
  function* until(cond, max = 1e9) { while (!cond() && max > 0) max -= yield; }
  function* both(...gs) { const ts = gs.map((g) => new Task(g)); for (;;) { const dt = yield; let all = true; for (const t of ts) { t.step(dt); if (!t.done) all = false; } if (all) return; } }

  const all = [];

  class Mon extends Critters.Critter {
    constructor(sp, o = {}) {
      super(sp, o);
      this.dex = o.dex || this.kind;           // species key in DexData
      this.task = null; this.o = {}; this.seed = Math.random() * 100;
      this.gait = 0; this.moving = 0; this.phase = 0;
      this.mode = o.mode || 'land';           // land | swim | fly | float
      this.air = 0; this.vair = 0; this.plat = null;
      this.alive = true; this.sleeping = false; this.hidden = false; this.hideK = 0;
      this.zd = o.zd ?? 0;                     // depth inside the ground strip
      this.act = { id: o.act || 'idle', t0: 0 }; this.peak = 0; this.actData = null;
      this.aware = 0; this.persona = o.persona || 'calm'; this.mood = 0; this.annoy = 0;
      this.home = o.home ?? this.x; this.range = o.range ?? 260;
      this.fx = 0; this.fy = 0; // fly/swim targets
      this.yawGoal = null;
      this.cooldown = 0; this.lastReact = -99;
      this.noticeT = 0; this.facingCam = 0;
      this.shadowK = o.shadowK ?? 1;
      all.push(this);
    }
    brain() { return (function* () { for (;;) yield; })(); }
    doTask(g, prio = 1) {
      if (this.task && !this.task.done && this.task.prio > prio) return false;
      this.task = new Task(g, prio);
      return true;
    }
    busy(prio = 1) { return this.task && !this.task.done && this.task.prio >= prio; }
    setAct(id, peak = 0, data = null) { if (this.act.id !== id) this.act = { id, t0: Game.t }; this.peak = peak; this.actData = data; }
    update(dt, t) {
      this.st += dt; this.o = {}; this.moving = 0; this.peak = Math.max(0, this.peak - dt * 0.8);
      this.cooldown = Math.max(0, this.cooldown - dt); this.annoy = Math.max(0, this.annoy - dt * 0.05);
      this.senses(dt, t);
      if (!this.task || this.task.done) { this.setAct(this.idleAct || 'idle'); this.task = new Task(this.brain(), 0); }
      this.task.step(dt);
      this.physics(dt, t);
      this.animate(dt, t);
      this.hideK = approach(this.hideK, this.hidden ? 1 : 0, dt * 2.5);
      this.juice(dt, t);
    }
    // bouncy "juice" on top of the model pose: breathing, hop bob when moving, squash on landing
    juice(dt, t) {
      if (this.noJuice || this.layer === 'sea') { this.jOn = false; return; }
      const air = (this.air || 0) > 0.5 || this.mode === 'fall';
      if (this.wasAir && !air) this.jv = (this.jv || 0) - 3.2;
      this.wasAir = air;
      const k = 180, c = 11; this.jv = (this.jv || 0) + (-k * (this.jq || 0) - c * (this.jv || 0)) * dt; this.jq = (this.jq || 0) + this.jv * dt;
      const mv = this.moving ? Math.min(1, this.moving / 60) : 0;
      this.jb = (this.jb || 0) + dt * (6 + mv * 8);
      const breathe = Math.sin(t * 2.6 + this.seed) * 0.035, hop = mv * Math.abs(Math.sin(this.jb)), q = clamp(this.jq, -0.35, 0.35);
      const st = air ? 0.08 : breathe - hop * 0.06 + q;
      this.jsy = 1 + st; this.jsx = 1 - st * 0.7;
      this.jy = -hop * 2.5 - (this.mode === 'swim' || this.mode === 'fly' || this.mode === 'float' ? Math.sin(t * 2 + this.seed) * 1.5 : 0);
      this.jOn = true;
    }
    /* ---- awareness of Mudkip & the camera ---- */
    senses(dt, t) {
      const mk = Game.mudkip;
      if (!mk || this.sleeping) { this.aware = Math.max(0, this.aware - dt * 0.2); return; }
      const d = Math.hypot(mk.x - this.x, (mk.y - this.y) * 1.4);
      const R = this.senseR ?? 150;
      let gain = d < R ? (1 - d / R) * (mk.moving > 70 ? 1.6 : mk.moving > 0 ? 0.8 : 0.35) : -0.25;
      if (mk.sneak) gain *= 0.4;
      if (Game.lureT > 0 && d < 420) gain = Math.max(gain, 0.5);
      if (Game.mode === 'camera' && Photo.inView(this)) gain += this.persona === 'shy' ? 0.35 : 0.15;
      this.aware = clamp(this.aware + gain * dt * (this.alert ?? 1), 0, 1);
      if (this.aware > 0.55 && this.noticeT <= 0 && t - this.lastReact > 6) {
        this.noticeT = 8;
        this.onNotice(mk);
      }
      this.noticeT -= dt;
    }
    // loud things: shutter clicks, songs, splashes. amt 0..1
    hear(kind, x, amt = 1) {
      if (Math.abs(x - this.x) > 360 * amt) return;
      if (this.sleeping) { if (kind === 'loud' || kind === 'splash') this.wake(); return; }
      this.aware = clamp(this.aware + amt * (kind === 'shutter' ? 0.12 : 0.3), 0, 1);
      if (kind === 'song' && this.onSong) this.onSong(Game.music && Music.cur);
    }
    wake() { if (!this.sleeping) return; this.sleeping = false; this.emote('anger', 1.2); this.annoy += 0.4; this.doTask(this.grumble(), 3); }
    *grumble() { this.setAct('woken', 0.4); yield* wait(1.2); }
    onNotice(mk) {
      this.lastReact = Game.t;
      if (Game.lureT > 0 && this.mode !== 'hidden') { this.doTask(this.curiousLook(mk), 3); return; }
      switch (this.persona) {
        case 'shy': this.doTask(this.flee(mk), 4); break;
        case 'curious': this.doTask(this.curiousLook(mk), 3); break;
        case 'showoff': this.doTask(this.posing(mk), 3); break;
        case 'grumpy': if (this.annoy > 0.5 && this.attackCam) this.doTask(this.attackCam(mk), 5); else this.doTask(this.stare(mk), 2); break;
        default: this.doTask(this.stare(mk), 2);
      }
    }
    *stare(mk) {
      this.emote('shock', 0.8);
      yield* this.faceCam(0.6);
      this.setAct('notice', 0.3);
      yield* wait(rnd(0.8, 1.6));
    }
    *curiousLook(mk) {
      this.emote('sparkle', 1);
      const side = this.x < mk.x ? 1 : -1;
      if (this.mode === 'land') yield* this.walkTo(mk.x - side * (this.width() * 0.5 + 34), (this.speed || 50) * 1.1, { max: this.home + this.range * 1.5, min: this.home - this.range * 1.5 });
      yield* this.faceCam(0.9);
      let e = 0;
      while (e < 2.2) { const dt = yield; e += dt; this.setAct('curious', e > 0.6 && e < 1.8 ? 1 : 0.4); this.o.eyes = e % 1 < 0.1 ? 'blink' : 'open'; this.headTilt = Math.sin(e * 3) * 0.2; }
      this.emote(pick(['heart', 'note']), 1.2);
    }
    *posing(mk) {
      this.emote('star', 1);
      yield* this.faceCam(1);
      let e = 0;
      while (e < 2) { const dt = yield; e += dt; this.setAct('pose', e > 0.4 ? 1 : 0.5); this.o.eyes = 'happy'; this.o.mouth = 1; }
    }
    *flee(mk) {
      this.emote('sweat', 1);
      this.setAct('flee', 0.5);
      const dir = this.x < mk.x ? -1 : 1;
      if (this.mode === 'swim' || this.mode === 'fly') { this.fx = this.x + dir * 300; yield* this.moveTo(this.x + dir * 300, this.y + (this.mode === 'fly' ? -40 : 30), (this.speed || 60) * 2.2); }
      else yield* this.walkTo(clamp(this.x + dir * 240, this.home - this.range * 1.6, this.home + this.range * 1.6), (this.speed || 50) * 2.2);
      yield* wait(rnd(2, 4));
    }
    // camera-facing: yaw π/2 shows the face
    *faceCam(k = 1) {
      const target = Math.PI / 2 + (this.x < Game.mudkip.x ? -0.35 : 0.35) * (1 - k);
      for (let i = 0; i < 90; i++) { const dt = yield; if (this.turn(target, dt, 5)) break; }
    }
    /* ---- movement ---- */
    *walkTo(tx, speed = 60, o = {}) {
      tx = clamp(tx, o.min ?? 30, o.max ?? World.W - 30);
      tx = clamp(tx, 30, World.W - 30);
      for (let guard = 0; guard < 3000; guard++) {
        const dt = yield;
        const dx = tx - this.x;
        if (Math.abs(dx) < 2.5) break;
        const d = Math.sign(dx);
        this.turn(this.face(d), dt, o.turn ?? 8);
        if (o.sideways || Math.sign(Math.cos(this.yaw)) === d) { this.x += d * Math.min(Math.abs(dx), speed * dt); this.moving = speed; }
        if (o.stop && o.stop()) break;
        if (o.act) this.setAct(o.act, 0);
      }
    }
    // free 2D move (swimmers, flyers, floaters)
    *moveTo(tx, ty, speed = 60, o = {}) {
      for (let guard = 0; guard < 3000; guard++) {
        const dt = yield;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < 3) break;
        const s = Math.min(d, speed * dt);
        this.x += (dx / d) * s; this.y += (dy / d) * s;
        this.moving = speed;
        if (Math.abs(dx) > 4) this.turn(this.face(Math.sign(dx), true), dt, o.turn ?? 5);
        if (o.stop && o.stop()) break;
        if (o.act) this.setAct(o.act, 0);
      }
    }
    *faceTo(d, walk = false) { for (let i = 0; i < 200; i++) { const dt = yield; if (this.turn(this.face(d, walk), dt)) break; } }
    *hop(v = 220) { this.vair = v; this.air = Math.max(this.air, 0.5); yield* until(() => this.air <= 0 && this.vair === 0, 3); }
    physics(dt, t) {
      if (this.mode === 'land') {
        if (this.air > 0 || this.vair !== 0) {
          this.vair -= 900 * dt; this.air += this.vair * dt;
          if (this.air <= 0) { this.air = 0; if (this.vair < -150) { this.landed && this.landed(-this.vair); } this.vair = 0; }
        }
        const base = this.plat && this.x >= this.plat.x0 && this.x <= this.plat.x1 ? World.platY(this.plat, this.x) : World.groundAt(this.x);
        if (this.plat && (this.x < this.plat.x0 || this.x > this.plat.x1)) this.plat = null;
        this.y = base - this.air + this.zd;
      } else if (this.mode === 'swim') {
        const s = WorldRender.surfaceAt(this.x, t), g = World.groundAt(this.x);
        this.y = clamp(this.y, s + (this.swimTop ?? 10), g - (this.swimBot ?? 6));
      }
    }
    animate(dt, t) { this.pose = Object.assign({ eyes: this.blink(t, dt) ? 'blink' : 'open' }, this.o); }
    /* ---- interactions (override per species) ---- */
    onPoke() { this.emote('shock', 0.9); this.annoy += 0.25; }
    onFood() { return false; }
    onSplash() { this.hear('splash', this.x, 0.6); }
    onScan() {}
    headPt() { return this.at('top'); }
    emote(icon, life = 1.5) { if (this !== Game.mudkip && typeof Cries !== 'undefined' && Math.random() < 0.55) Cries.play(this.dex, this.x, 0.6); return FX.emote(icon, () => this.headPt(), { life }); }
    // what the camera sees (0 = back / profile, 1 = looking straight at the lens)
    facing() { return clamp(Math.sin(this.yaw) * 1.1, 0, 1); }
    remove() { this.alive = false; const i = all.indexOf(this); if (i >= 0) all.splice(i, 1); }
    // blit with camouflage (hideK dithers the sprite away), burying (show only the top rows) and photo ids
    draw(fb, cx, cy, occ) {
      const s = this.spr;
      if (!s || !this.visible || this.hideK >= 0.999) return;
      if (Critters.HDS.on && !this.spr2 && !this.noHD && this.layer !== 'sea') return;
      if (this.rot || this.jOn) { this.drawRot(fb, cx, cy, occ); return; }
      const X = this.ox() - cx, Y = this.oy() - cy + (this.bury ? Math.round(s.h * this.bury) : 0);
      const W = fb.w, H = fb.h, d = fb.d;
      const rows = this.bury ? Math.max(1, Math.round(s.h * (1 - this.bury))) : s.h;
      const x0 = Math.max(0, -X), x1 = Math.min(s.w, W - X), y0 = Math.max(0, -Y), y1 = Math.min(rows, H - Y);
      if (x0 >= x1 || y0 >= y1) return;
      const occV = this.occV, hk = this.hideK, t = Game.t;
      const idb = Stage.S.idOn ? Stage.S.idb : null, pid = this.pid || 0, rawb = Stage.S.rawb;
      const tint = this.tint || 0, tk = this.tintK || 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * s.w, trow = (Y + sy) * W + X;
        for (let sx = x0; sx < x1; sx++) {
          const c = s.d[row + (this.flip ? s.w - 1 - sx : sx)];
          if (!c) continue;
          if (hk > 0) {
            const th = U.bayer4(X + sx, Y + sy + Math.floor(t * 8));
            if (th < hk) { if (th > hk - 0.08 && hk < 0.97) d[trow + sx] = U.mix(d[trow + sx], 0xffffffff, 0.35); continue; }
          }
          const cc = tk ? U.mix(c, tint, tk) : c;
          d[trow + sx] = cc;
          if (occ) occ[trow + sx] = occV;
          if (idb) { idb[trow + sx] = pid; if (rawb) rawb[trow + sx] = cc; }
        }
      }
    }
  }

  // rotated blit (somersaults, faceplants, playing dead): nearest-neighbour around the sprite centre
  Mon.prototype.drawRot = function (fb, cx, cy, occ) {
    const s = this.spr, W = fb.w, H = fb.h, d = fb.d;
    const jx = this.jsx || 1, jy = this.jsy || 1;
    const px = this.ox() - cx + s.w / 2, py = this.oy() - cy + s.h / 2 + (this.rotY || 0) + (this.jy || 0) - (jy - 1) * s.h / 2;
    const ca = Math.cos(this.rot || 0), sa = Math.sin(this.rot || 0), R = Math.ceil(Math.hypot(s.w, s.h) / 2 * Math.max(jx, jy)) + 1;
    const PX0 = Math.round(px), PY0 = Math.round(py), hw = s.w / 2, hh = s.h / 2;
    const s2 = Critters.HDS.on && this.spr2 ? this.spr2.s : null, P2x = Math.round(px * 2), P2y = Math.round(py * 2);
    const idb = Stage.S.idOn ? Stage.S.idb : null, pid = this.pid || 0, rawb = Stage.S.rawb, occV = this.occV;
    const tint = this.tint || 0, tk = this.tintK || 0;
    for (let y = -R; y <= R; y++) {
      const Y = PY0 + y; if (Y < 0 || Y >= H) continue;
      for (let x = -R; x <= R; x++) {
        const X = PX0 + x; if (X < 0 || X >= W) continue;
        let c;
        if (s2) {
          // sample the 2× sprite so the low-res silhouette matches the HD pass exactly (no see-through edges)
          const dx = (X * 2 + 1) - P2x, dy = (Y * 2 + 1) - P2y;
          const u2 = Math.floor((dx * ca + dy * sa) / jx + s2.w / 2), v2 = Math.floor((-dx * sa + dy * ca) / jy + s2.h / 2);
          if (u2 < 0 || v2 < 0 || u2 >= s2.w || v2 >= s2.h) continue;
          c = s2.d[v2 * s2.w + (this.flip ? s2.w - 1 - u2 : u2)]; if (!c) continue;
        } else {
          const u = Math.floor((x * ca + y * sa) / jx + hw), v = Math.floor((-x * sa + y * ca) / jy + hh);
          if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue;
          c = s.d[v * s.w + (this.flip ? s.w - 1 - u : u)]; if (!c) continue;
        }
        const cc = tk ? U.mix(c, tint, tk) : c, i = Y * W + X;
        d[i] = cc; if (occ) occ[i] = occV;
        if (idb) { idb[i] = pid; if (rawb) rawb[i] = cc; }
      }
    }
  };

  return { Mon, Task, wait, until, both, all, rnd, pick, chance };
})();
