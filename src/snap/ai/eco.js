/* ------------------------------------------------------------------
   Eco — a living, data-driven ecosystem for the wild Pokémon of Hoenn.
   One brain, many species: each species is a small config (how it
   moves, when it is awake, what it eats, who it plays with, who it
   runs from, its signature moves and how its body poses), and the
   brain weaves them into a little society:
    · day-active and night-active Pokémon, naps in the shade, a deep
      sleep at night, and cold-loving Pokémon that come alive in winter
      while the rest curl up
    · families: babies toddle after a parent, nuzzle it and copy it;
      evolved Pokémon look after their younger kin
    · herds that drift together, hungry Pokémon that raid ripe bushes
      and chase thrown berries
    · playful predators: chasers dash after prey, and prey scatters
    · every signature move is tagged with setAct, so photos find it
------------------------------------------------------------------- */
const Eco = (() => {
  const { clamp, lerp, rnd, pick, chance, hex } = U;
  const { wait } = Mons;
  const gy = (x) => World.groundAt(x);
  const spc = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const SP = {}; // species id → config
  const all = () => Mons.all.filter((m) => m.eco && m.alive);
  function def(id, cfg) { SP[id] = Object.assign({ id }, cfg); return SP[id]; }
  function weighted(list) { let s = 0; for (const a of list) s += a.w ?? 1; let r = Math.random() * s; for (const a of list) { r -= a.w ?? 1; if (r <= 0) return a; } return list[list.length - 1]; }
  const hourNow = () => Game.hour();
  const isNight = () => { const h = hourNow(); return h === 'night'; };
  const isTwilight = () => { const h = hourNow(); return h === 'dusk' || h === 'dawn'; };
  const season = () => (typeof Seasons !== 'undefined' && Game.area && !Game.area.def.noSeason ? Pal.season : 'summer');

  class EcoMon extends Mons.Mon {
    constructor(id, x, o = {}) {
      const c = SP[id];
      const loco = o.loco || c.loco || 'walk';
      const mode = loco === 'swim' ? 'swim' : loco === 'fly' ? 'fly' : loco === 'hover' ? 'float' : 'land';
      const S = spc(c.sp);
      const y0 = o.y ?? (mode === 'land' ? gy(x) : mode === 'swim' ? (o.box ? (o.box.y0 + o.box.y1) / 2 : World.SEA + 60) : gy(x) - (c.hover ?? 60));
      super(S, Object.assign({ kind: c.kind || c.dex || id, dex: c.dex || id, x, y: y0, yaw: chance(0.5) ? 0.9 : Math.PI - 0.9, z: c.z ?? 2, scale: (c.scale ?? 0.5) * (o.size ?? 1), qPose: c.qPose ?? 0.06, qFields: c.qf, persona: o.persona || c.persona || 'calm', mode, shadowK: c.shadowK }, o.mon || {}));
      this.eco = true; this.cfg = c; this.loco = loco;
      this.speed = (c.speed ?? 45) * (o.speedK ?? 1); this.senseR = c.senseR ?? 140; this.alert = c.alert ?? 1;
      this.minX = o.minX ?? (x - (o.range ?? 260)); this.maxX = o.maxX ?? (x + (o.range ?? 260)); this.home = x; this.range = o.range ?? 260;
      this.box = o.box || null; this.water = o.water || null; this.hoverH = o.hover ?? c.hover ?? 60; this.alt = o.alt || c.alt || [70, 170];
      this.gph = Math.random() * 6; this.fph = Math.random() * 6; this.vx = 0; this.vy = 0; this.perched = false;
      this.parent = null; this.kids = []; this.baby = !!(o.baby ?? c.baby); this.zd = o.zd ?? c.zd ?? 0;
      this.noShadow = mode === 'swim'; this.swimTop = c.swimTop ?? 10; this.swimBot = c.swimBot ?? 8;
      this.smell = c.smell ?? 320; this.sizeK = o.size ?? 1;
      if (c.init) c.init(this, o);
    }
    /* ---------- when it wants to be awake ---------- */
    awakeNow() {
      const c = this.cfg, a = c.active || 'day', h = hourNow(), s = season();
      if (this.forceAwake > 0) return true;
      if (a === 'any') return !(s === 'winter' && c.hibernate && h === 'night');
      let on = a === 'night' ? h === 'night' || h === 'dusk' : a === 'twilight' ? h !== 'noon' && h !== 'afternoon' : h !== 'night';
      if (s === 'winter' && !c.cold && c.hibernate && chance(0.5)) on = on && h === 'noon';
      return on;
    }
    /* ---------- the brain ---------- */
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.2, 1.4));
      for (;;) {
        const c = this.cfg;
        if (c.brain) { const g = c.brain(this); if (g) { yield* g; continue; } }
        if (!this.awakeNow()) { yield* this.doze(); continue; }
        // babies stay close to a parent
        if (this.parent && this.parent.alive) {
          const d = Math.abs(this.parent.x - this.x);
          if (d > (c.leash ?? 64)) { yield* this.goNear(this.parent.x, 18 + rnd(0, 18), this.speed * 1.5, 'follow'); continue; }
          if (chance(0.25)) { yield* this.withParent(); continue; }
        }
        // herds drift back together
        if (c.herd) { const hc = this.herdX(); if (hc !== null && Math.abs(hc - this.x) > c.herd) { yield* this.goNear(hc, c.herd * 0.4, this.speed, this.walkAct()); continue; } }
        // hungry: a ripe bush nearby
        if (c.diet && this.loco !== 'swim' && chance(c.hunger ?? (season() === 'autumn' ? 0.2 : 0.1))) { const b = this.findBush(); if (b) { yield* this.raidBush(b); continue; } }
        // prey nearby: give chase
        if (c.prey && chance(c.chaseRate ?? 0.18)) { const q = this.findPrey(); if (q) { yield* this.chase(q); continue; } }
        // parents fuss over their little ones
        if (this.kids.length && chance(0.14)) { yield* this.familyTime(); continue; }
        const acts = (c.acts || []).filter((a) => (!a.when || a.when(this)) && (!a.cool || Game.t - (this['cool_' + a.id] || -99) > a.cool));
        const r = Math.random();
        if (acts.length && r < (c.actRate ?? 0.42)) { yield* this.perform(weighted(acts)); continue; }
        if (r < (c.roamRate ?? 0.78)) { yield* this.roam(); continue; }
        yield* this.loaf();
      }
    }
    walkAct() { return this.loco === 'swim' ? 'swim' : this.loco === 'fly' && !this.perched ? 'fly' : this.loco === 'hover' ? 'float' : 'walk'; }
    herdX() { const mates = all().filter((m) => m !== this && m.dex === this.dex && Math.abs(m.x - this.x) < 600); if (!mates.length) return null; return mates.reduce((s, m) => s + m.x, 0) / mates.length; }
    findBush() {
      if (typeof Harvest === 'undefined' || !Harvest.items) return null;
      const mk = Game.mudkip;
      return Harvest.items.find((p) => p.kind === 'plant' && p.ripe > 0 && !p.taken && Math.abs(p.x - this.x) < 240 && p.x > this.minX - 40 && p.x < this.maxX + 40 && (!mk || Math.abs(p.x - mk.x) > 40)) || null;
    }
    findPrey() { const P = this.cfg.prey; return all().concat(Mons.all.filter((m) => !m.eco)).find((m) => m !== this && m.alive && !m.sleeping && P.includes(m.dex) && Math.abs(m.x - this.x) < 300 && Math.abs(m.y - this.y) < 160) || null; }
    /* ---------- movement ---------- */
    *roam() {
      const L = this.loco;
      if (L === 'swim') { const [tx, ty] = this.swimSpot(); yield* this.swimTo(tx, ty, this.speed, rnd(3, 7), 'swim'); return; }
      if (L === 'fly') {
        if (this.perched && chance(0.5)) { yield* this.takeOff(); return; }
        if (!this.perched && chance(this.cfg.perch ?? 0.3)) { yield* this.land(clamp(this.x + rnd(-200, 200), this.minX, this.maxX)); return; }
        if (this.perched) { yield* this.walkTo(clamp(this.x + rnd(-80, 80), this.minX, this.maxX), this.speed * 0.4, { act: 'walk' }); return; }
        const tx = clamp(this.x + rnd(-260, 260), this.minX, this.maxX), ty = gy(tx) - rnd(this.alt[0], this.alt[1]);
        yield* this.flyTo(tx, ty, this.speed, 'fly'); return;
      }
      if (L === 'hover') { yield* this.glide(clamp(this.x + rnd(-220, 220), this.minX, this.maxX), this.speed, 'float'); return; }
      if (L === 'amphi' && this.water && chance(0.45)) { yield* this.goSwim(); return; }
      yield* this.walkTo(clamp(this.x + rnd(-this.range * 0.7, this.range * 0.7), this.minX, this.maxX), this.speed, { act: 'walk', stop: this.dryStop() });
    }
    // land walkers never wander into deep water (amphibians choose to)
    dryStop() { const hz = (x) => Game.area && Game.area.def.hazardAt && !this.cfg.lavaOk && Game.area.def.hazardAt(x); if (this.loco === 'amphi' || this.cfg.wade) return () => hz(this.x + Math.cos(this.yaw) * 8); return () => World.isWet(this.x + Math.cos(this.yaw) * 8, 12) || hz(this.x + Math.cos(this.yaw) * 8); }
    *goNear(x, gap, speed, act) {
      const side = this.x < x ? -1 : 1, tx = clamp(x + side * gap, this.minX - 60, this.maxX + 60);
      if (this.loco === 'swim') { yield* this.swimTo(tx, this.y + rnd(-20, 20), speed, 4, act); return; }
      if (this.loco === 'fly' && !this.perched) { yield* this.flyTo(tx, gy(tx) - rnd(this.alt[0], this.alt[1]) * 0.7, speed, act); return; }
      if (this.loco === 'hover') { yield* this.glide(tx, speed, act); return; }
      yield* this.walkTo(tx, speed, { act, max: this.maxX + 80, min: this.minX - 80 });
    }
    swimSpot() {
      const b = this.box || { x0: this.minX, x1: this.maxX, y0: World.SEA + 20, y1: World.SEA + 160 };
      for (let k = 0; k < 20; k++) { const x = rnd(b.x0, b.x1), y = rnd(b.y0, b.y1); if (y < gy(x) - 14 && y > AI.surf(x) + 10) return [x, y]; }
      return [this.x, this.y];
    }
    *swimTo(tx, ty, speed, T = 8, act = 'swim') {
      let e = 0; this.setAct(act);
      while (e < T) {
        const dt = yield; e += dt;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < 6) break;
        const s = Math.min(speed, d * 2);
        this.vx = lerp(this.vx, (dx / d) * s, dt * 2.5); this.vy = lerp(this.vy, (dy / d) * s, dt * 2.5);
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = Math.hypot(this.vx, this.vy);
        if (Math.abs(this.vx) > 4) this.turn(this.face(Math.sign(this.vx), true), dt, 4);
        this.setAct(act, this.peak);
      }
    }
    *flyTo(tx, ty, speed, act = 'fly', o = {}) {
      this.perched = false; this.mode = 'fly';
      for (let g = 0; g < 2400; g++) {
        const dt = yield;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < (o.near ?? 5)) break;
        const s = Math.min(speed, d * 2.5);
        this.vx = lerp(this.vx, (dx / d) * s, dt * (o.agile ?? 2)); this.vy = lerp(this.vy, (dy / d) * s, dt * (o.agile ?? 2));
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = s;
        if (Math.abs(this.vx) > 5) this.turn(this.face(Math.sign(this.vx), true), dt, 4);
        this.setAct(act, o.peak ? o.peak(d) : this.peak);
        if (o.stop && o.stop()) break;
      }
    }
    *land(x) {
      yield* this.flyTo(x, gy(x) - 12, this.speed, 'fly');
      let e = 0; while (e < 0.5) { const dt = yield; e += dt; this.y = lerp(this.y, gy(this.x), Math.min(1, dt * 8)); this.setAct('land', 0.4); }
      this.perched = true; this.mode = 'land'; this.air = 0; this.vair = 0;
    }
    *takeOff() {
      this.perched = false; this.mode = 'fly'; Game.sfx('whoosh', this.x, 0.35);
      yield* this.flyTo(clamp(this.x + rnd(-120, 120), this.minX, this.maxX), gy(this.x) - rnd(this.alt[0], this.alt[1]), this.speed * 1.2, 'fly');
    }
    *glide(tx, speed, act = 'float') {
      for (let g = 0; g < 2000; g++) {
        const dt = yield;
        const dx = tx - this.x; if (Math.abs(dx) < 3) break;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt); this.moving = speed;
        this.turn(this.face(Math.sign(dx), true), dt, 4);
        this.setAct(act, this.peak);
      }
    }
    // amphibians: wade into the pond or river, swim about, climb back out
    *goSwim() {
      const w = this.water, ex = clamp(rnd(w.x0 + 20, w.x1 - 20), w.x0, w.x1);
      yield* this.walkTo(ex < this.x ? Math.max(ex, w.x0 + 8) : Math.min(ex, w.x1 - 8), this.speed, { act: 'walk' });
      if (!World.isWet(this.x, 10)) return;
      this.mode = 'swim'; this.noShadow = true; FX.splashAt && FX.splashAt(this.x, AI.surf(this.x), { power: 0.35, n: 6 }); Game.sfx('splash', this.x, 0.4);
      this.box = { x0: w.x0 + 10, x1: w.x1 - 10, y0: w.level + 8, y1: w.level + 60 };
      for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) { const [tx, ty] = this.swimSpot(); yield* this.swimTo(tx, ty, this.speed * 0.9, rnd(3, 6), 'swim'); if (this.cfg.swimAct && chance(0.5)) yield* this.perform(this.cfg.swimAct); }
      // climb out at the nearer bank
      const bank = Math.abs(this.x - w.x0) < Math.abs(this.x - w.x1) ? w.x0 - 16 : w.x1 + 16;
      yield* this.swimTo(bank, AI.surf(bank) + 4, this.speed, 6, 'swim');
      this.mode = 'land'; this.noShadow = false; this.y = gy(this.x); Game.sfx('splash', this.x, 0.3);
      yield* this.walkTo(bank + (bank < w.x0 ? -20 : 20), this.speed, { act: 'walk' });
    }
    /* ---------- sleeping, loafing ---------- */
    *doze() {
      if (this.loco === 'fly' && !this.perched) yield* this.land(clamp(this.x, this.minX, this.maxX));
      this.sleeping = true; this.setAct('sleep', 0.3);
      let e = 0, z = 0; const T = rnd(20, 40);
      while (e < T && !this.awakeNow() && this.sleeping) {
        const dt = yield; e += dt; z -= dt; this.o.eyes = 'closed'; this.o.sleep = 1;
        if (z <= 0) { z = 2.4; const [hx, hy] = this.headPt(); FX.add({ type: 'icon', icon: 'swirl', x: hx + 6, y: hy - 4, vx: 6, vy: -10, life: 1.6, layer: 3 }); }
        this.setAct('sleep', Math.sin(e * 1.3) > 0.8 ? 0.8 : 0.3);
      }
      this.sleeping = false;
    }
    *loaf() {
      const T = rnd(1.5, 4); let e = 0; this.setAct('idle');
      while (e < T) { const dt = yield; e += dt; this.setAct(this.loco === 'swim' ? 'swim' : this.loco === 'fly' && !this.perched ? 'fly' : 'idle', 0.2); if (this.loco === 'fly' && !this.perched) { this.y += Math.sin(Game.t * 2 + this.seed) * 0.3; this.moving = 20; } }
    }
    /* ---------- signature moves ---------- */
    *perform(a) {
      this['cool_' + a.id] = Game.t;
      if (a.run) { yield* a.run(this); return; }
      if (a.face) yield* this.faceCam(a.face);
      if (a.sfx) Game.sfx(a.sfx, this.x, a.vol ?? 0.5);
      if (a.cry && typeof Cries !== 'undefined') Cries.play(this.dex, this.x, 0.7, true);
      if (a.emote) this.emote(a.emote, 1.2);
      const T = Array.isArray(a.T) ? rnd(a.T[0], a.T[1]) : a.T ?? 2;
      let e = 0;
      if (a.hop) { this.vair = a.hop; this.air = Math.max(this.air, 0.5); }
      while (e < T) {
        const dt = yield; e += dt; const k = Math.min(1, e / T);
        if (a.p) Object.assign(this.o, a.p(this, k, e));
        if (a.fx) a.fx(this, k, dt, e);
        if (a.dash) { const d = Math.cos(this.yaw) >= 0 ? 1 : -1, nx = clamp(this.x + d * a.dash * dt, this.minX, this.maxX); if (!World.isWet(nx, 12) || this.loco === 'amphi') { this.x = nx; this.moving = a.dash; } }
        this.setAct(a.id, a.peak ? a.peak(k, e) : 0.35 + 0.65 * Math.sin(k * Math.PI));
      }
      if (a.after) a.after(this);
    }
    /* ---------- families ---------- */
    *withParent() {
      const p = this.parent, c = this.cfg;
      if (c.babyAct && chance(0.5)) { yield* this.perform(c.babyAct); return; }
      // nuzzle up to the parent
      yield* this.goNear(p.x, 10, this.speed * 1.2, 'follow');
      let e = 0; const T = rnd(1.4, 2.4);
      if (p.alive && !p.busy(3) && p.doTask) p.doTask((function* (pp, kid) { yield* pp.faceTo(kid.x > pp.x ? 1 : -1, false); let q = 0; while (q < T) { const dt = yield; q += dt; pp.o.eyes = 'happy'; pp.setAct('family', 0.9); } })(p, this), 2);
      while (e < T) { const dt = yield; e += dt; this.turn(this.face(p.x > this.x ? 1 : -1, false), dt, 6); this.o.eyes = 'happy'; this.setAct('nuzzle', e > 0.4 ? 1 : 0.6); }
      if (chance(0.5)) this.emote('heart', 1.2);
    }
    *familyTime() {
      const kid = pick(this.kids.filter((k) => k.alive)); if (!kid) return;
      yield* this.goNear(kid.x, 14, this.speed, 'walk');
      let e = 0; const T = rnd(1.6, 2.6);
      while (e < T) { const dt = yield; e += dt; this.turn(this.face(kid.x > this.x ? 1 : -1, false), dt, 5); this.o.eyes = 'happy'; this.setAct('family', e > 0.5 ? 1 : 0.5); }
      this.emote('heart', 1.1);
    }
    /* ---------- food, prey ---------- */
    *raidBush(p) {
      this.emote('bulb', 0.9);
      if (this.loco === 'fly' && !this.perched) yield* this.land(p.x + (this.x < p.x ? -12 : 12));
      else yield* this.walkTo(p.x + (this.x < p.x ? -10 : 10), this.speed * 1.2, { act: 'walk' });
      let e = 0;
      while (e < 1.8 && p.ripe > 0) { const dt = yield; e += dt; this.o.mouth = Math.sin(e * 16) > 0 ? 1 : 0.2; this.o.eyes = 'happy'; this.setAct('eat', 0.8); if (e > 0.6 && e - dt <= 0.6) { p.ripe--; Game.sfx('munch', p.x, 0.7); FX.poof(p.x, p.y - 6, 0xffffffff, 0xff5a8af0, 3, 2); } }
      this.emote('heart', 1.2);
    }
    onFood(it) {
      const c = this.cfg;
      if (!c.diet || this.sleeping || this.busy(3) || Math.abs(it.x - this.x) > this.smell) return false;
      const wet = World.isWet(it.x, 8);
      if (this.loco === 'swim' ? !wet : wet && this.loco !== 'fly' && this.loco !== 'amphi') return false;
      this.doTask(this.fetch(it), 3); return true;
    }
    *fetch(it) {
      this.emote('shock', 0.6);
      const sp = this.speed * (this.cfg.dashK ?? 1.6);
      if (this.loco === 'swim') yield* this.swimTo(it.x, it.y, sp, 6, 'eat');
      else if (this.loco === 'fly') yield* this.flyTo(it.x, it.y - 6, sp * 1.3, 'dive', { near: 8 });
      else if (this.loco === 'hover') yield* this.glide(it.x + (this.x < it.x ? -10 : 10), sp, 'eat');
      else yield* this.walkTo(it.x + (this.x < it.x ? -10 : 10), sp, { act: 'walk' });
      if (it.eaten) return;
      let e = 0; while (e < 1) { const dt = yield; e += dt; this.o.mouth = Math.sin(e * 18) > 0 ? 0.9 : 0.1; this.setAct('eat', 0.8); }
      Items.eat(it); Game.sfx('munch', this.x, 0.7); this.emote('heart');
      if (this.cfg.onEat) this.cfg.onEat(this, it);
      if (this.loco === 'fly' && !this.perched) yield* this.flyTo(this.x, gy(this.x) - this.alt[0], this.speed, 'fly');
    }
    *chase(q) {
      this.emote('anger', 0.8);
      if (q.doTask && !q.busy(4)) q.doTask(this.scatter(q, this), 4);
      const sp = this.speed * (this.cfg.dashK ?? 1.8);
      let e = 0;
      while (e < 3.2 && q.alive) {
        const dt = yield; e += dt;
        const dx = q.x - this.x, dy = q.y - 10 - this.y;
        if (Math.hypot(dx, dy) < 16) break;
        if (this.loco === 'fly' && !this.perched) { const d = Math.hypot(dx, dy) || 1; this.x += (dx / d) * sp * dt; this.y += (dy / d) * sp * dt; this.turn(this.face(Math.sign(dx), true), dt, 5); this.moving = sp; }
        else if (this.loco === 'swim') { const d = Math.hypot(dx, dy) || 1; this.x += (dx / d) * sp * dt; this.y += (dy / d) * sp * dt; this.turn(this.face(Math.sign(dx), true), dt, 5); this.moving = sp; }
        else { const d = Math.sign(dx); this.turn(this.face(d), dt, 10); const nx = this.x + d * sp * dt; if (!World.isWet(nx, 12) || this.loco === 'amphi') this.x = nx; this.moving = sp; }
        this.setAct('chase', 0.5 + 0.5 * Math.min(1, e / 1.2));
      }
      if (this.loco === 'fly' && !this.perched) yield* this.flyTo(this.x - Math.cos(this.yaw) * 40, gy(this.x) - this.alt[1], this.speed, 'fly');
      else if (chance(0.5)) this.emote('note', 1);
    }
    // the chased one runs, hops or dives away
    *scatter(q, from) {
      q.emote && q.emote('sweat', 1);
      if (q.setAct) q.setAct('flee', 0.7);
      const dir = q.x < from.x ? -1 : 1, sp = (q.speed || 50) * 2.1;
      if (q.mode === 'swim' || q.mode === 'fly' || q.mode === 'float') { if (q.moveTo) yield* q.moveTo(q.x + dir * 160, q.y + (q.mode === 'fly' ? -30 : 20), sp); }
      else if (q.walkTo) yield* q.walkTo(clamp(q.x + dir * 170, (q.home ?? q.x) - (q.range || 260) * 1.5, (q.home ?? q.x) + (q.range || 260) * 1.5), sp, { act: 'flee' });
      yield* wait(rnd(0.5, 1.4));
    }
    /* ---------- reactions ---------- */
    onPoke() {
      const c = this.cfg;
      if (this.sleeping) { this.wake(); return; }
      if (c.onPoke) { c.onPoke(this); return; }
      this.emote(pick(['shock', 'note', 'heart']), 1); this.annoy += 0.25;
      if (this.loco !== 'swim' && this.mode === 'land' && this.air <= 0) { this.vair = 180; this.air = 0.5; }
    }
    onWater() {
      const c = this.cfg, T = (DexData.S[this.dex] || {}).type || [];
      if (c.onWater) { c.onWater(this); return; }
      if (T.includes('Fire')) { this.emote('anger', 1.2); this.annoy += 0.35; FX.poof(this.x, this.y - 12, 0xffe8e8e8, 0xffb0b0b0, 8, 5); Game.sfx('steam', this.x, 0.6); return; }
      if (T.includes('Water') || T.includes('Grass')) { this.emote('heart', 1.2); this.doTask(this.happyHop(), 2); return; }
      this.emote('shock', 1); this.annoy += 0.2;
    }
    *happyHop() { for (let i = 0; i < 2; i++) { if (this.mode === 'land') yield* this.hop(170); else yield* wait(0.3); this.setAct('happy', 0.8); } }
    onSong() {
      const c = this.cfg; if (this.sleeping) return;
      if (c.onSong) { c.onSong(this); return; }
      const dance = (c.acts || []).find((a) => a.dance);
      this.doTask((function* (m) { yield* m.faceCam(0.8); if (dance) { yield* m.perform(dance); return; } let e = 0; while (e < 2.5) { const dt = yield; e += dt; m.o.eyes = 'happy'; m.setAct('dance', 0.8); m.rot = Math.sin(e * 6) * 0.08; } m.rot = 0; })(this), 2);
    }
    onScan() { if (this.cfg.onScan) this.cfg.onScan(this); }
    /* ---------- body ---------- */
    physics(dt, t) {
      if (this.cfg.physics && this.cfg.physics(this, dt, t)) return;
      if (this.mode === 'swim') { const s = AI.surf(this.x), g = gy(this.x); this.y = clamp(this.y, s + this.swimTop, g - this.swimBot); return; }
      if (this.mode === 'fly') { const g = gy(this.x); if (this.y > g - 6) this.y = g - 6; return; }
      if (this.mode === 'float') { const g = gy(this.x); if (!this.freeY) this.y = lerp(this.y, g - this.hoverH + Math.sin(t * 1.8 + this.seed) * 3, Math.min(1, dt * 3)); return; }
      super.physics(dt, t);
      // bouncers hop as they go
      if (this.cfg.hopper && this.moving && this.air <= 0 && this.vair === 0) { this.vair = this.cfg.hopper; this.air = 0.5; }
    }
    animate(dt, t) {
      const c = this.cfg;
      const mv = this.moving ? Math.min(1.6, this.moving / Math.max(20, this.speed)) : 0;
      if (this.moving) this.gph += dt * (c.gait ?? 7) * (0.6 + mv * 0.6);
      this.fph += dt * (c.flapRate ?? 9) * (this.mode === 'fly' ? (this.vy < -10 ? 1.4 : 1) : 0.4);
      const st = { mv, ph: this.gph, fl: this.fph, t, dt, air: this.air, fly: this.mode === 'fly', swim: this.mode === 'swim', sleep: this.sleeping, act: this.act.id, vx: this.vx, vy: this.vy };
      const P = c.pose ? c.pose(this, st) : {};
      if (P.eyes === undefined) P.eyes = this.sleeping ? 'closed' : this.blink(t, dt) ? 'blink' : 'open';
      const o = this.o;
      if (c.alias) for (const k in c.alias) if (o[k] !== undefined) { o[c.alias[k]] = o[k]; delete o[k]; }
      Object.assign(P, o);
      if (c.clean) c.clean(P);
      this.pose = P;
    }
    headPt() { return this.cfg.head ? this.at(this.cfg.head) : this.at('top'); }
  }

  /* ---------- spawning helpers ---------- */
  // add one Pokémon of a species; o: { minX, maxX, range, box, water, loco, size, baby, y, zd }
  function add(G, id, x, o = {}) {
    const c = SP[id]; if (!c || !spc(c.sp)) return null;
    const m = new EcoMon(id, x, o);
    if (!m.sp) return null;
    G.addMon(m);
    return m;
  }
  // a family: parent at x with n babies of species `baby` tagging along
  function family(G, parentId, babyId, x, n = 1, o = {}) {
    const p = add(G, parentId, x, o); if (!p) return [];
    const out = [p];
    for (let i = 0; i < n; i++) { const b = add(G, babyId, x + (i + 1) * (chance(0.5) ? 22 : -22), Object.assign({}, o, { baby: true, box: o.box, zd: (o.zd || 0) + 2 })); if (b) { b.parent = p; p.kids.push(b); out.push(b); } }
    return out;
  }
  function herd(G, id, x0, x1, n, o = {}) { const out = []; for (let i = 0; i < n; i++) { const m = add(G, id, lerp(x0, x1, n > 1 ? i / (n - 1) : 0.5) + rnd(-20, 20), Object.assign({ minX: x0 - 60, maxX: x1 + 60 }, o)); if (m) out.push(m); } return out; }
  return { def, add, family, herd, EcoMon, SP, all, isNight, isTwilight, season, spc };
})();
