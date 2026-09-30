/* ------------------------------------------------------------------
   Legends — the great Pokémon of Hoenn's myths.
    · Groudon sleeps in Mt. Chimney's lava lake. Solve the Magma Stones
      and it rises: a roar, glowing lava lines, harsh sunlight (Drought).
      Awake, it wades through the magma and roars at the sky.
    · Regice stands frozen in Shoal Cave's chamber. Stand still in the
      circle, then sing: its seven dots light up and it lumbers forward,
      breathing Ice Beams into the air.
    · Rayquaza: once Kyogre or Groudon has woken, the sky dragon comes to
      calm them — a long green shape rippling across the sky high above
      Treetop Town and the volcano.
------------------------------------------------------------------- */
const Legends = (() => {
  const { clamp, lerp, rnd, pick, hex } = U;
  const { wait } = Mons;
  const gy = (x) => World.groundAt(x);
  const sp = (n) => { try { return (0, eval)(n); } catch (e) { return null; } };
  const L = { groudon: null, regice: null, ray: null, drought: 0, rayT: 0 };
  function* hold(m, T, act, peak = 0.4) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); } }

  /* ================= GROUDON ================= */
  class GroudonM extends Mons.Mon {
    constructor(x, lava, awake) {
      super(sp('Groudon'), { kind: 'groudon', dex: 'groudon', x, y: gy(x), yaw: Math.PI / 2 - 0.25, z: 3, scale: 0.3, qPose: 0.05, qFields: { roar: 0.1, glow: 0.1, sleep: 0.1, mouth: 0.2 }, persona: 'calm', mode: 'land' });
      this.lava = lava; this.awake = awake; this.senseR = 0; this.noShadow = true; this.speed = 14; this.rise = awake ? 1 : 0; this.glowK = awake ? 0.5 : 0; this.wph = 0;
      this.minX = lava.x0 + 120; this.maxX = lava.x1 - 120;
    }
    senses() {}
    physics(dt, t) { super.physics(dt, t); this.y = gy(this.x) - lerp(14, 40, this.rise); }
    animate(dt, t) {
      if (this.moving) this.wph += dt * 2.2;
      const P = { walk: this.moving ? this.wph : 0, roar: 0, glow: this.glowK + Math.sin(t * 2) * 0.1 * this.rise, sleep: this.awake ? 0 : 1, mouth: 0, eyes: this.awake ? (this.blink(t, dt) ? 'blink' : 'open') : 'closed' };
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.awake ? this.life() : this.dream(); }
    *dream() { for (;;) { const dt = yield; this.setAct('sleep', 0.5 + 0.3 * Math.sin(Game.t * 0.8)); if (Math.random() < dt * 0.25) { const [hx, hy] = this.headPt(); FX.add({ type: 'dust', x: hx + rnd(-10, 10), y: hy, vx: rnd(-4, 4), vy: -rnd(10, 20), r: 4, life: 2, c: 0xff4a4a4a, c2: 0xff2a2a2a, layer: 2 }); } } }
    *wakeUp() {
      this.awake = true;
      Game.sfx('rumble', this.x, 1); Game.shake(4);
      let e = 0;
      while (e < 2.4) { const dt = yield; e += dt; this.rise = clamp(e / 2, 0, 1); this.glowK = clamp(e / 2, 0, 1); this.o.eyes = e > 1.2 ? 'open' : 'closed'; this.setAct('rise', 0.8 + 0.2 * Math.sin(e * 4)); if (Math.random() < dt * 30) lavaSplash(this.x + rnd(-40, 40), this.lava.y); }
      yield* this.roarAt(true);
    }
    *roarAt(drought) {
      yield* this.faceCam(0.6);
      Game.sfx('roar', this.x, 1); Game.shake(5); if (typeof Cries !== 'undefined') Cries.play('groudon', this.x, 1, true);
      if (drought) { L.drought = 8; HUD.toast('The sunlight turned harsh! (Drought)', { life: 2.6 }); }
      let e = 0;
      while (e < 2.2) { const dt = yield; e += dt; const k = Math.sin(clamp(e / 2.2, 0, 1) * Math.PI); this.o.roar = k; this.o.mouth = k; this.o.glow = 0.6 + k * 0.4; this.setAct(drought ? 'drought' : 'roar', 0.5 + k * 0.5); if (Math.random() < dt * 20) { const [hx, hy] = this.at('mouth'); FX.add({ type: 'spark', x: hx + rnd(-6, 6), y: hy + rnd(-4, 4), size: 2, life: 0.5, c: 0xffffffff, c2: hex('#ff8a28'), layer: 4 }); } }
    }
    *life() {
      yield* wait(rnd(1, 3));
      for (;;) {
        const r = Math.random();
        if (r < 0.45) { yield* this.walkTo(clamp(this.x + rnd(-160, 160), this.minX, this.maxX), this.speed, { turn: 3 }); Game.shake(1); lavaSplash(this.x, this.lava.y); }
        else if (r < 0.7) yield* this.roarAt(Math.random() < 0.3);
        else yield* hold(this, rnd(3, 6), 'glow', (e) => 0.5 + 0.3 * Math.sin(e * 2));
      }
    }
    onPoke() { if (this.awake) { this.emote('anger', 1); this.doTask(this.roarAt(false), 4); } else { this.emote('swirl', 1); } }
    onWater() { this.emote('anger', 1.2); FX.poof(this.x, this.y - 40, 0xffe8e8e8, 0xffb0b0b0, 14, 8); Game.sfx('steam', this.x, 1); }
  }
  function lavaSplash(x, y) { for (let k = 0; k < 6; k++) FX.add({ type: 'drop', x: x + rnd(-6, 6), y: y - 1, vx: rnd(-60, 60), vy: -rnd(60, 160), g: 400, life: 0.8, c: hex('#ffc040'), c2: hex('#ff5a10'), size: 2, floor: y, layer: 3 }); }
  function spawnGroudon(G, lava) {
    if (!sp('Groudon')) return null;
    const awake = Save.found('groudon.woke');
    L.groudon = G.addMon(new GroudonM((lava.x0 + lava.x1) / 2 - 20, lava, awake));
    return L.groudon;
  }
  function wakeGroudon() {
    const g = L.groudon; if (!g || !g.alive || g.awake) return;
    Save.discover('groudon.woke'); if (Save.addPoints) Save.addPoints(600);
    if (Game.cine) Game.cine.pan(g.x, g.y - 50, { dur: 1.4, hold: 4.2, zoom: 1.05 });
    if (typeof Music !== 'undefined' && Music.play) Music.play('legend');
    g.doTask(g.wakeUp(), 8);
    setTimeout(() => maybeRayquaza(true), 14000);
  }

  /* ================= REGICE ================= */
  class RegiceM extends Mons.Mon {
    constructor(x, awake) {
      super(sp('Regice'), { kind: 'regice', dex: 'regice', x, y: gy(x), yaw: Math.PI / 2 - 0.2, z: 2.6, scale: 0.5, qPose: 0.05, qFields: { glow: 0.1, awake: 0.1, arms: 0.1 }, persona: 'calm', mode: 'land' });
      this.awake = awake; this.aw = awake ? 1 : 0; this.senseR = 0; this.speed = 16; this.wph = 0; this.minX = x - 380; this.maxX = x + 100;
    }
    senses() {}
    animate(dt, t) {
      if (this.moving) this.wph += dt * 3;
      const g = this.awake ? 0.6 + 0.4 * Math.sin(t * 3) : 0;
      const P = { walk: this.moving ? this.wph : 0, glow: g * this.aw, awake: this.aw, arms: 0, eyes: 'open', mouth: 0 };
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.awake ? this.life() : this.frozen(); }
    *frozen() { for (;;) { yield; this.setAct('dormant', 0.4); } }
    *wakeUp() {
      this.awake = true;
      let e = 0;
      while (e < 2.6) { const dt = yield; e += dt; this.aw = clamp(e / 2.2, 0, 1); this.setAct('awake', 0.6 + 0.4 * this.aw); if (Math.random() < dt * 30) FX.add({ type: 'spark', x: this.x + rnd(-20, 20), y: this.y - rnd(0, 50), size: 1, life: 0.6, c: 0xffffffff, c2: hex('#9ae0ff'), layer: 4 }); }
      if (typeof Cries !== 'undefined') Cries.play('regice', this.x, 1, true);
      Game.sfx('freeze', this.x, 1);
      yield* this.iceBeam();
    }
    *iceBeam() {
      yield* this.faceTo(Game.mudkip && Game.mudkip.x < this.x ? -1 : 1, false);
      let e = 0; Game.sfx('freeze', this.x, 0.9);
      const dir = Math.cos(this.yaw) >= 0 ? 1 : -1;
      while (e < 1.8) {
        const dt = yield; e += dt; const k = Math.sin(clamp(e / 1.8, 0, 1) * Math.PI);
        this.o.arms = k; this.setAct('icebeam', 0.5 + 0.5 * k);
        const [bx, by] = this.at('body');
        for (let j = 0; j < 3; j++) { const d = rnd(10, 160) * k; FX.add({ type: 'spark', x: bx + dir * d, y: by - 30 - d * 0.35 + rnd(-3, 3), size: 1 + (Math.random() < 0.3 ? 1 : 0), life: 0.3, c: 0xffffffff, c2: hex('#8ad8ff'), layer: 4 }); }
      }
      if (Game.mode === 'camera' && Photo.inView && Photo.inView(this) && Photo.hitLens) Photo.hitLens('frost');
    }
    *life() {
      yield* wait(rnd(1, 2));
      for (;;) {
        const r = Math.random();
        if (r < 0.4) yield* this.walkTo(clamp(this.x + rnd(-120, 120), this.minX, this.maxX), this.speed, { turn: 4 });
        else if (r < 0.65) yield* this.iceBeam();
        else yield* hold(this, rnd(2, 4), 'glow', (e) => 0.4 + 0.4 * Math.sin(e * 3));
      }
    }
    onPoke() { if (this.awake) this.doTask(this.iceBeam(), 4); else HUD.toast('It is frozen solid... but you feel it watching.', { life: 2 }); }
  }
  function spawnRegice(G, x) { if (!sp('Regice')) return null; L.regice = G.addMon(new RegiceM(x, Save.found('regice.woke'))); return L.regice; }
  function wakeRegice() { const r = L.regice; if (!r || !r.alive || r.awake) return; if (typeof Music !== 'undefined' && Music.play) Music.play('legend'); r.doTask(r.wakeUp(), 8); }

  /* ================= RAYQUAZA ================= */
  class RayquazaM extends Mons.Mon {
    constructor(dir) {
      const c = Game.cam;
      super(sp('Rayquaza'), { kind: 'rayquaza', dex: 'rayquaza', x: dir > 0 ? c.x - 260 : c.x + Game.VW + 260, y: c.y + Game.VH * 0.28, yaw: dir > 0 ? 0.25 : Math.PI - 0.25, z: 4, scale: 0.25, qPose: 0.05, qFields: { wave: 0.35, roar: 0.1, glow: 0.1 }, persona: 'calm', mode: 'fly' });
      this.dir = dir; this.always = true; this.noShadow = true; this.senseR = 0; this.roared = false; this.wave = 0;
    }
    senses() {}
    physics() {}
    animate(dt, t) { this.wave += dt * 4.5; const P = { wave: this.wave, length: 1, roar: 0, glow: 0.4 + 0.3 * Math.sin(t * 3), mouth: 0, eyes: 'open' }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.fly(); }
    *fly() {
      const sp0 = (Game.VW + 520) / 13;
      for (let g = 0; g < 4000; g++) {
        const dt = yield;
        const c = Game.cam;
        this.x += this.dir * sp0 * dt; this.moving = sp0;
        this.y = lerp(this.y, c.y + Game.VH * 0.26 + Math.sin(Game.t * 0.7) * 12, Math.min(1, dt * 1.5));
        this.setAct('soar', 0.7);
        const mid = Math.abs(this.x - (c.x + Game.VW / 2)) < 40;
        if (mid && !this.roared) { this.roared = true; yield* this.roar(); }
        if ((this.dir > 0 && this.x > c.x + Game.VW + 320) || (this.dir < 0 && this.x < c.x - 320)) break;
      }
      this.remove(); if (L.ray === this) L.ray = null;
    }
    *roar() {
      Game.sfx('roar', this.x, 1); Game.shake(3); if (typeof Cries !== 'undefined') Cries.play('rayquaza', this.x, 1, true);
      let e = 0;
      while (e < 1.8) { const dt = yield; e += dt; const k = Math.sin(clamp(e / 1.8, 0, 1) * Math.PI); this.x += this.dir * 20 * dt; this.o.roar = k; this.o.mouth = k; this.o.glow = 0.7 + 0.3 * k; this.setAct('roar', 0.6 + 0.4 * k); }
      Save.discover('rayquaza.seen');
    }
  }
  // Rayquaza appears once Kyogre or Groudon has woken, over the open-sky areas
  function maybeRayquaza(force) {
    const A = Game.area; if (!A || A.def.noSky || A.def.cave || !sp('Rayquaza')) return;
    if (!(Save.found('kyogre.woke') || Save.found('groudon.woke'))) return;
    if (!['canopy', 'volcano', 'forest', 'beach'].includes(Game.areaId)) return;
    if (L.ray && L.ray.alive) return;
    if (!force && Math.random() > (Game.areaId === 'canopy' ? 0.7 : 0.35)) return;
    L.ray = Game.addMon(new RayquazaM(Math.random() < 0.5 ? 1 : -1));
    HUD.toast('A roar echoes across the sky...', { life: 2.4 });
  }
  function update(dt) {
    if (L.drought > 0) L.drought -= dt;
    L.rayT -= dt;
    if (L.rayT <= 0) { L.rayT = rnd(55, 95); maybeRayquaza(false); }
  }
  // harsh sunlight: a warm, blinding wash over the whole frame
  function post(fb) {
    if (L.drought <= 0) return;
    const k = Math.min(1, L.drought / 2) * 0.35, d = fb.d, c = hex('#ffd890');
    for (let i = 0; i < d.length; i++) d[i] = U.screen(d[i], c, k);
  }
  U.on && U.on('area', () => { L.groudon = L.regice = L.ray = null; L.drought = 0; L.rayT = rnd(20, 40); });
  return Object.assign(L, { spawnGroudon, wakeGroudon, spawnRegice, wakeRegice, maybeRayquaza, update, post, classes: { GroudonM, RegiceM, RayquazaM } });
})();
