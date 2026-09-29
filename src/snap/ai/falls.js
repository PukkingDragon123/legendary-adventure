/* ------------------------------------------------------------------
   FallsAI — Starfall Cave's Pokémon and its photo puzzles.
    · Bagon stomp the ledge, headbutt boulders (knock on the big one and
      Bagon cracks it open), leap off the ledge trying to fly (3★) —
      erupt the geyser under a leaping Bagon and it really flies. At
      night a sleeping Bagon dreams of wings (4★, dream bubble).
    · Solrock spins in the daylight shaft (2★); tap the mirror crystal or
      spray Water Gun in the light → solar flare (3★). Lunatone glows in
      the moonlight (2★). At dawn/dusk they meet in the shaft: the cosmic
      alignment (4★) — its light wakes the meteorite heart (falls.meteorite).
    · Minior shells lie where stars fall: hit one three times → the exact
      crack moment (4★) → Core Form (2★). At night Minior fall down the
      shaft as falling stars (3★). Sing under the shaft at night → a
      meteor shower (falls.shower).
    · Sing by the crystal nest during a shower → Jirachi wakes and grants
      a wish (4★, falls.wish). Crack five core colours with the heart
      awake → the meteorite answers: Deoxys descends (4★).
    · Five singing crystals: the drips play their tune (falls.chimes).
------------------------------------------------------------------- */
const FallsAI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach, hex } = U;
  const { wait } = Mons;
  const { Walker, Flyer, mk, hourIs } = AI;
  const TAU = Math.PI * 2;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };

  /* ---------------- shared geometry ---------------- */
  const GEO = {
    W: 3600,
    ground: [[0, 540], [60, 552], [200, 556], [320, 560], [345, 600], [420, 680], [560, 700], [700, 676], [790, 600], [815, 562], [900, 556], [1100, 554], [1300, 558], [1500, 556], [1690, 562], [1712, 600], [1780, 672], [1880, 684], [1960, 660], [1995, 600], [2012, 560], [2150, 552], [2450, 546], [2750, 552], [2860, 562], [2960, 590], [3060, 598], [3160, 588], [3260, 560], [3340, 558], [3375, 600], [3450, 650], [3530, 640], [3565, 590], [3600, 560]],
    POOL: { x0: 330, x1: 805, level: 566 }, GLOW: { x0: 1700, x1: 2005, level: 570 }, SPRING: { x0: 3365, x1: 3590, level: 568 },
    FALL: 560, FALL2: 3470, CHIMES: [1060, 1100, 1140, 1180, 1220], BOULDER: 1370,
    LEDGE: { x0: 1480, x1: 1690, y: 470 }, STEP: { x: 1440, y: 516 }, NEST: { x0: 2030, x1: 2200, y: 405 }, NESTX: 2140,
    GEYSER: 1780, SHAFT: 2450, SCOPE: 2330, MIRROR: 2600, METEOR: 3060, GEODE: 960,
    TUNE: [0, 2, 4, 3],
  };
  const P_LEDGE = 0, P_NEST = 1;

  let S = {}, A0 = null, G0 = null;
  const tuneFreq = [523, 659, 784, 880, 1047];
  function ting(i, x, v = 0.6) {
    if (!Sound.on || !Sound.ctx()) { return; }
    try {
      const ac = Sound.ctx(), t = ac.currentTime + 0.01, g = ac.createGain(), f = tuneFreq[i] || 700;
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      const d = clamp((x - (Game.cam.x + Game.VW / 2)) / Game.VW, -0.9, 0.9);
      if (pan) { pan.pan.value = d; g.connect(pan).connect(Sound.sfxBus()); } else g.connect(Sound.sfxBus());
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      for (const [m, ty] of [[1, 'sine'], [2.76, 'sine'], [4, 'triangle']]) { const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f * m; og.gain.value = m === 1 ? 1 : 0.18; o.connect(og).connect(g); o.start(t); o.stop(t + 1.7); }
    } catch (e) { /* ignore */ }
  }
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }
  const dust = (x, y, n = 4) => FX.poof(x, y, hex('#6a6a80'), hex('#8a8aa0'), n, 4);
  const shaftK = () => ({ dawn: 0.6, noon: 1, afternoon: 0.8, dusk: 0.6, night: 0.45 })[Game.hour()];
  const inShaft = (x, y) => Math.abs(x - GEO.SHAFT) < 60 + (560 - y) * 0.05;

  /* ================= BAGON ================= */
  class BagonM extends Walker {
    constructor(i, x, plat) {
      super(sp('Bagon'), { kind: 'bagon', dex: 'bagon', x, y: gy(x), yaw: Math.PI / 2 + 0.5, z: 2, scale: 0.5, qPose: 0.05, qFields: { step: 0.5, jump: 0.1, headbutt: 0.1, sleep: 0.25, mouth: 0.25, squash: 0.05 }, persona: 'grumpy', speed: 34 });
      this.i = i; this.stepPh = 0; this.senseR = 120; this.pester = 0; this.zd = -1; this.dreamT = 0; this.bubble = 0;
      if (plat) { this.plat = plat; this.x = x; this.minX = plat.x0 + 12; this.maxX = plat.x1 - 14; } else { this.minX = 1250; this.maxX = 1460; }
    }
    animate(dt, t) {
      if (this.moving) this.stepPh += dt * 8;
      const P = { step: this.moving ? this.stepPh : 0, jump: 0, headbutt: 0, sleep: 0, mouth: 0, squash: 0, eyes: this.blink(t, dt) ? 'blink' : 'angry' };
      if (this.sleeping) { P.sleep = 1; P.eyes = 'closed'; P.squash = Math.sin(t * 1.4) * 0.04; }
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        if (hourIs('night')) { yield* this.sleepDream(); continue; }
        const r = Math.random();
        if (this.i === 0 && this.plat && r < 0.3) yield* this.leap();
        else if (r < 0.55) yield* this.stomp();
        else if (r < 0.8 && !this.plat) yield* this.headbutt(this.x + (chance(0.5) ? 40 : -40), null);
        else yield* this.walkTo(clamp(this.x + rnd(-80, 80), this.minX, this.maxX), this.speed, { act: 'idle', min: this.minX, max: this.maxX });
      }
    }
    *stomp() {
      yield* this.walkTo(clamp(this.x + rnd(-60, 60), this.minX, this.maxX), this.speed, { act: 'idle', min: this.minX, max: this.maxX });
      for (let k = 0; k < 3; k++) { let e = 0; while (e < 0.35) { const dt = yield; e += dt; this.o.squash = e < 0.15 ? -0.15 : 0.2; this.o.mouth = 0.5; this.setAct('idle', 0.6); } dust(this.x, this.y, 3); Game.sfx('thud', this.x, 0.35); }
    }
    *headbutt(tx, onHit) {
      yield* this.walkTo(clamp(tx + (this.x < tx ? -30 : 30), 40, GEO.W - 40), 44, { act: 'idle' });
      yield* this.faceTo(tx > this.x ? 1 : -1, false);
      let e = 0; while (e < 0.6) { const dt = yield; e += dt; this.o.jump = 0.3 * (e / 0.6); this.o.headbutt = 0.4; this.setAct('headbutt', 0.6); }
      const x0 = this.x, dir = tx > this.x ? 1 : -1; e = 0;
      while (e < 0.25) { const dt = yield; e += dt; this.x = x0 + dir * 18 * (e / 0.25); this.o.headbutt = 1; this.setAct('headbutt', 1); }
      FX.bonk(this.x + dir * 14, this.y - 14, 10); Game.sfx('bonk', this.x, 0.8); Game.shake(1);
      if (onHit) onHit();
      e = 0; while (e < 0.4) { const dt = yield; e += dt; this.x = x0 + dir * 18 - dir * 14 * (e / 0.4); this.o.headbutt = 0.6; this.setAct('headbutt', 0.8); }
      yield* hold(this, 0.8, 'headbutt', 0.4);
    }
    // off the edge of the ledge, flapping stubby arms
    *leap() {
      const L = World.plats[P_LEDGE];
      yield* this.walkTo(L.x1 - 16, 40, { act: 'idle', min: this.minX, max: this.maxX });
      yield* this.faceTo(1, false);
      this.emote('star', 0.8);
      let e = 0; while (e < 0.8) { const dt = yield; e += dt; this.o.jump = 0.4 * e / 0.8; this.o.mouth = 0.6; this.setAct('fly', 0.6); }
      const x0 = this.x, y0 = this.y; this.plat = null; this.mode = 'toy'; S.leaping = this;
      let vx = 70, vy = -170, x = x0, y = y0; e = 0; let boosted = false;
      Game.sfx('boing', x, 0.6);
      while (e < 6) {
        const dt = yield; e += dt;
        if (!boosted && S.geyserT > 0 && Math.abs(x - GEO.GEYSER) < 60) { boosted = true; vy = -330; vx = 55; Game.sfx('whoosh', x, 1); HUD.toast('The geyser carries Bagon up — it\'s flying!', { life: 2.8 }); Save.discover('falls.flight'); }
        vy += (boosted ? 240 : 520) * dt; x += vx * dt; y += vy * dt;
        this.x = x; this.y = y;
        this.o.jump = 1; this.o.mouth = 1; this.o.eyes = boosted ? 'happy' : 'open';
        this.setAct('fly', vy < 60 || boosted ? 1 : 0.7);
        if (Math.random() < dt * 12) FX.add({ type: 'speed', x: x - 8, y: y - 10, dx: 1, dy: 0, len: 6, life: 0.2, c: 0xffffffff, layer: 3 });
        const s = WorldRender.surfaceAt(x, Game.t), g = gy(x);
        if (vy > 0 && World.waterAt(x) !== null && y > s) { FX.splashAt(x, s, { power: 0.9 }); Game.sfx('splash', x, 1); break; }
        if (vy > 0 && y >= g) break;
      }
      S.leaping = null;
      const wetLand = World.waterAt(this.x) !== null;
      if (wetLand) {
        // scramble out to the far shore
        this.y = WorldRender.surfaceAt(this.x, Game.t) + 4; this.emote('sweat', 1.2);
        let k = 0; const xa = this.x, xb = GEO.GLOW.x1 + 20; while (k < 2.4) { const dt = yield; k += dt; this.x = lerp(xa, xb, k / 2.4); this.y = WorldRender.surfaceAt(this.x, Game.t) + 4 - (k > 2 ? (k - 2) * 60 : 0); this.o.step = k * 12; this.setAct('fly', 0.3); }
      }
      this.mode = 'land'; this.y = gy(this.x); dust(this.x, this.y, 5); Game.sfx('thud', this.x, 0.8);
      this.emote(boosted ? 'heart' : 'sweat', 1.4);
      yield* hold(this, 1.2, 'idle', 0.3);
      yield* this.climbBack();
    }
    *climbBack() {
      const L = World.plats[P_LEDGE];
      yield* this.walkTo(GEO.STEP.x - 26, 50, { act: 'idle' });
      for (const [tx, ty] of [[GEO.STEP.x, GEO.STEP.y], [L.x0 + 20, L.y]]) {
        const x0 = this.x, y0 = this.y; let e = 0; this.mode = 'toy';
        while (e < 0.45) { const dt = yield; e += dt; const k = Math.min(1, e / 0.45); this.x = lerp(x0, tx, k); this.y = lerp(y0, ty, k) - Math.sin(k * Math.PI) * 26; this.o.jump = 0.8; this.setAct('idle', 0.4); }
      }
      this.mode = 'land'; this.plat = L; this.y = L.y;
    }
    *sleepDream() {
      this.sleeping = true; let e = 0, z = 0;
      while (hourIs('night') && this.sleeping) {
        const dt = yield; e += dt; z -= dt; this.dreamT -= dt;
        if (z <= 0) { z = 2.2; const h = this.headPt(); FX.add({ type: 'icon', icon: 'swirl', x: h[0] + 6, y: h[1] - 4, vx: 6, vy: -10, life: 1.6, layer: 3 }); }
        if (this.dreamT <= 0) { this.dreamT = rnd(9, 15); this.bubble = 5; }
        this.bubble = Math.max(0, this.bubble - dt);
        this.setAct(this.bubble > 0.6 ? 'dream' : 'idle', this.bubble > 0.6 ? 1 : 0.15);
      }
      this.sleeping = false; this.bubble = 0;
    }
    drawExtra(fb, cx, cy) {
      if (!this.bubble || !this.spr) return;
      const k = Math.min(1, (5 - this.bubble) / 0.6, this.bubble / 0.5);
      const [hx, hy] = this.headPt(), W = fb.w, H = fb.h, d = fb.d;
      const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = c; };
      const disc = (X, Y, r, c, ol) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const q = x * x + y * y; if (q <= r * r) put(X + x, Y + y, c); else if (q <= (r + 1) * (r + 1)) put(X + x, Y + y, ol); } };
      const X = Math.round(hx - cx), Y = Math.round(hy - cy);
      disc(X + 4, Y - 4, 1, 0xffffffff, 0xff302838); if (k > 0.3) disc(X + 8, Y - 10, 2, 0xffffffff, 0xff302838);
      if (k < 0.7) return;
      const bx = X + 18, by = Y - 30;
      for (const [ox, oy, r] of [[-9, 2, 8], [0, -2, 10], [10, 1, 8], [3, 6, 8], [-5, 7, 6]]) disc(bx + ox, by + oy, r, 0xfff4f4ff, 0xff302838);
      for (const [ox, oy, r] of [[-9, 2, 7], [0, -2, 9], [10, 1, 7], [3, 6, 7], [-5, 7, 5]]) disc(bx + ox, by + oy, r, 0xfff4f4ff, 0xfff4f4ff);
      // a little winged Bagon soaring in the dream
      const fl = Math.sin(Game.t * 10) > 0 ? -3 : 1, sx = bx + Math.round(Math.sin(Game.t * 1.5) * 4), sy = by + 1;
      for (let x = -3; x <= 3; x++) for (let y = -2; y <= 2; y++) if (x * x / 9 + y * y / 4 <= 1) put(sx + x, sy + y, 0xff5a8fb0);
      put(sx + 3, sy - 2, 0xffc6c7c9); put(sx + 4, sy - 2, 0xffc6c7c9); put(sx + 4, sy - 1, 0xff2a2030);
      for (let j = 1; j <= 5; j++) { put(sx - 1 - j, sy - 1 + Math.round(fl * j / 5), 0xffe23a3a); put(sx - 1 - j, sy + Math.round(fl * j / 5), 0xffb82a2a); put(sx + 1 + Math.round(j * 0.3), sy - 1 + Math.round(fl * j / 4) - j, 0xffe23a3a); }
    }
    *attackCam() {
      this.emote('anger', 1.2); Game.sfx('grr', this.x, 0.8);
      let e = 0; while (e < 0.6) { const dt = yield; e += dt; this.o.jump = 0.35; this.o.headbutt = 0.5; yield* hold(this, 0, 'attack', 0.7); this.setAct('attack', 0.7); }
      e = 0; while (e < 0.9) { const dt = yield; e += dt; this.turn(Math.PI / 2, dt, 8); this.o.headbutt = 1; this.o.jump = 0.7; this.setAct('attack', e > 0.4 ? 1 : 0.8); }
      Photo.hitLens('crack'); this.pester = 0; this.annoy = 0;
      yield* hold(this, 1, 'idle', 0.4);
    }
    senses(dt, t) {
      super.senses(dt, t);
      if (this.sleeping || this.mode !== 'land') return;
      const m = mk();
      if (Game.mode === 'camera' && Photo.inView(this) && Math.abs(m.x - this.x) < 200) this.pester += dt * 0.25; else this.pester = Math.max(0, this.pester - dt * 0.1);
      if (this.pester + this.annoy > 1 && !this.busy(5)) this.doTask(this.attackCam(), 5);
    }
    onPoke() { if (this.sleeping) { this.wake(); return; } this.annoy += 0.35; this.emote('anger', 1); Game.sfx('grr', this.x, 0.5); if (!this.busy(3)) this.doTask(this.stomp(), 3); }
    onWater() { if (this.sleeping) { this.wake(); return; } this.annoy += 0.3; this.emote('anger', 1); }
    onFood(it) {
      if (it.kind !== 'berry' || this.sleeping || this.busy(3) || this.mode !== 'land') return false;
      if (this.plat && (it.x < this.plat.x0 || it.x > this.plat.x1)) return false;
      this.doTask((function* (s) { yield* s.walkTo(it.x + (s.x < it.x ? -18 : 18), 50, { act: 'idle', min: s.minX, max: s.maxX }); if (!it.eaten) { Items.eat(it); Game.sfx('munch', s.x, 0.6); s.emote('heart'); s.annoy = 0; } yield* hold(s, 1, 'idle', 0.5); })(this), 3);
      return true;
    }
  }

  /* ================= floating rocks ================= */
  class RockM extends Flyer {
    constructor(spName, kind, x, y) {
      super(sp(spName), { kind, dex: kind, x, y, yaw: Math.PI / 2 + 0.4, z: 1.8, scale: 0.4, qPose: 0.05, qFields: { spin: 0.13, glow: 0.1, tilt: 0.1, bob: 0.25 }, persona: 'calm', speed: 30 });
      this.spinA = 0; this.glowK = 0; this.flare = 0; this.noShadow = false; this.home = x;
    }
    physics(dt, t) { this.y = Math.min(this.y, gy(this.x) - 20); }
    animate(dt, t) {
      const P = { glow: Math.round(this.glowK * 10) / 10, bob: Math.sin(t * 1.6 + this.seed) , eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.kind === 'solrock') P.spin = this.spinA % Math.PI; else P.tilt = Math.sin(t * 0.7 + this.seed) * 0.5;
      if (this.sleeping) P.eyes = 'closed';
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (S.align && S.align.t > 0) { yield* this.alignDance(); continue; }
        if (this.kind === 'solrock') {
          if (hourIs('night')) { this.sleeping = true; yield* this.flyTo(GEO.SHAFT + 230, gy(GEO.SHAFT + 230) - 26, 20); yield* hold(this, 4, 'spin', 0.1); this.sleeping = false; continue; }
          yield* this.flyTo(GEO.SHAFT + rnd(-25, 25), gy(GEO.SHAFT) - rnd(50, 80), 26);
          yield* hold(this, rnd(4, 7), 'spin', () => 0.5 + this.facing() * 0.4, () => S.align && S.align.t > 0);
        } else {
          if (hourIs('night', 'dusk')) { yield* this.flyTo(GEO.SHAFT + rnd(-30, 30), gy(GEO.SHAFT) - rnd(55, 95), 22); yield* hold(this, rnd(4, 7), 'glow', () => 0.4 + this.glowK * 0.6, () => S.align && S.align.t > 0); }
          else { yield* this.flyTo(clamp(this.home + rnd(-160, 160), 2150, 2350), gy(2250) - rnd(40, 90), 18); yield* hold(this, rnd(3, 6), 'float', 0.4); }
        }
      }
    }
    *alignDance() {
      const A = S.align, side = this.kind === 'solrock' ? 1 : -1;
      while (A.t > 0) {
        const dt = yield;
        const k = clamp(1 - A.t / A.T, 0, 1), orbit = k < 0.55;
        const a = Game.t * 1.4 + (side > 0 ? 0 : Math.PI);
        const tx = GEO.SHAFT + (orbit ? Math.cos(a) * 60 : side * 28), ty = gy(GEO.SHAFT) - 110 + (orbit ? Math.sin(a) * 18 : side * -34);
        this.x = lerp(this.x, tx, Math.min(1, dt * 2.5)); this.y = lerp(this.y, ty, Math.min(1, dt * 2.5));
        this.turn(Math.PI / 2 + side * -0.5, dt, 3);
        this.glowK = approach(this.glowK, 1, dt);
        this.setAct('align', orbit ? 0.7 : 1);
      }
    }
    update(dt, t) {
      super.update(dt, t);
      const lit = inShaft(this.x, this.y);
      let g = 0;
      if (this.kind === 'solrock') { this.spinA += dt * (1.2 + (lit ? 1.6 : 0) + this.flare * 8); g = lit && !hourIs('night') ? 0.35 : 0.05; }
      else g = lit && hourIs('night', 'dusk') ? 1 : 0.1;
      if (this.flare > 0) { this.flare = Math.max(0, this.flare - dt / 3.2); g = 1; if (Math.random() < dt * 20) FX.add({ type: 'spark', x: this.x + rnd(-24, 24), y: this.y - 40 + rnd(-24, 24), size: 2, life: 0.5, c: 0xffffffff, c2: hex('#ffb040'), layer: 3 }); this.setAct('flare', this.flare > 0.2 ? 1 : 0.7); }
      if (!(S.align && S.align.t > 0)) this.glowK = approach(this.glowK, g, dt * 0.8);
    }
    doFlare() {
      if (this.kind !== 'solrock' || hourIs('night') || this.flare > 0) return false;
      this.flare = 1; this.emote('star', 1.2); Game.sfx('sparkle', this.x, 1); Game.shake(0.8);
      FX.add({ type: 'ring', x: this.x, y: this.y - 40, r0: 6, r1: 50, life: 0.6, c: hex('#ffd070'), layer: 3 });
      HUD.toast('Reflected sunlight hits Solrock — a blazing solar flare!', { life: 2.6 });
      return true;
    }
    onPoke() { this.emote(this.kind === 'solrock' ? 'star' : 'note', 1); Game.sfx('chime', this.x, 0.35); this.doTask(hold(this, 1.5, this.kind === 'solrock' ? 'spin' : 'float', 0.6), 2); }
    onWater() { if (this.kind === 'solrock' && inShaft(this.x, this.y + 40)) this.doFlare(); else this.emote('sweat'); }
  }

  /* ================= MINIOR ================= */
  class MiniorM extends Mons.Mon {
    constructor(x, c, state = 'shell', y) {
      super(sp('Minior'), { kind: 'minior', dex: 'minior', pal: sp('Minior').core(c), palId: 'minior' + c, x, y: y ?? gy(x), yaw: Math.PI / 2 + rnd(-0.6, 0.6), z: 2.1, scale: 0.4, qPose: 0.05, qFields: { crack: 0.05, spin: 0.2, glow: 0.1, squash: 0.1 }, persona: 'curious', mode: 'float' });
      this.c = c; this.state = state; this.hits = 0; this.crackK = state === 'core' ? 1 : 0; this.spinA = rnd(0, TAU); this.sq = 0; this.life0 = rnd(80, 120); this.zd = rnd(-3, 2); this.vy = 0;
    }
    physics() {}
    animate(dt, t) {
      const P = { crack: Math.round(this.crackK * 20) / 20, spin: Math.round((this.spinA % TAU) / 0.2) * 0.2, glow: this.state === 'core' || this.state === 'fall' ? 0.6 : this.crackK > 0 ? 0.9 : 0, squash: this.sq, eyes: this.blink(t, dt) ? 'blink' : this.state === 'core' ? 'happy' : 'open', mouth: this.state === 'core' ? 0.5 : 0 };
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        if (this.state === 'fall') { yield* this.fall(); continue; }
        if (this.state === 'core') { yield* this.coreFloat(); continue; }
        // lying shell: an occasional wobble
        this.y = gy(this.x) + this.zd;
        yield* hold(this, rnd(2, 5), 'meteor', 0.3);
        let e = 0; while (e < 0.5) { const dt = yield; e += dt; this.spinA += Math.sin(e * 20) * dt * 2; this.setAct('meteor', 0.5); }
      }
    }
    *fall() {
      const g = gy(this.x); this.vy = 160;
      while (this.y < g) { const dt = yield; this.vy += 300 * dt; this.y += this.vy * dt; this.spinA += dt * 9; this.setAct('fall', 1); if (Math.random() < dt * 40) FX.add({ type: 'spark', x: this.x + rnd(-3, 3), y: this.y - 10, size: 1, life: 0.6, c: 0xffffffff, c2: hex('#ffe890'), layer: 3 }); }
      this.y = g; this.state = 'shell'; FX.bonk(this.x, g - 8, 8); dust(this.x, g, 6); Game.sfx('thud', this.x, 0.9); Game.shake(0.6);
      let e = 0; while (e < 0.5) { const dt = yield; e += dt; this.sq = 0.3 * (1 - e / 0.5); this.setAct('fall', 0.6); } this.sq = 0;
    }
    *crack() {
      this.state = 'cracking'; Game.sfx('crack', this.x, 1); this.emote('shock', 0.8);
      let e = 0; const T = 1.8;
      while (e < T) { const dt = yield; e += dt; this.crackK = Math.min(1, e / T); this.sq = Math.sin(e * 30) * 0.05; this.y = gy(this.x) + this.zd - Math.sin(Math.min(1, e / T) * Math.PI) * 6; this.setAct('crack', this.crackK > 0.3 && this.crackK < 0.85 ? 1 : 0.7); if (e > 0.6 && Math.random() < dt * 25) FX.add({ type: 'drop', x: this.x + rnd(-8, 8), y: this.y - 12, vx: rnd(-50, 50), vy: -rnd(40, 100), g: 400, life: 1, c: hex('#8c6a68'), c2: hex('#c2a09a'), size: 2, floor: gy(this.x), layer: 3 }); }
      this.crackK = 1; this.sq = 0; this.state = 'core';
      Game.sfx('sparkle', this.x, 1); FX.sparkles(this.x, this.y - 12, 12, 26, 0xffffffff, hex(['#ff5a5a', '#ffa040', '#f8de46', '#5ad86a', '#50aaff', '#6a6aea', '#b858e8', '#ee8cb2'][this.c]));
      coreCracked(this.c);
    }
    *coreFloat() {
      let e = 0;
      while (e < this.life0) {
        const dt = yield; e += dt;
        const tx = clamp(this.home + Math.sin(e * 0.4 + this.seed) * 60, 40, GEO.W - 40), ty = gy(tx) - 26 - Math.sin(e * 2.2) * 8;
        this.x = lerp(this.x, tx, dt * 1.5); this.y = lerp(this.y, ty, dt * 2); this.spinA += dt * 1.5;
        this.setAct('core', 0.6 + this.facing() * 0.4);
      }
      // drift up the shaft and away
      while (this.y > -200) { const dt = yield; this.x = lerp(this.x, GEO.SHAFT, dt * 0.6); this.y -= dt * 70; this.setAct('core', 0.5); }
      this.remove();
    }
    hitShell() {
      if (this.state !== 'shell') return false;
      this.hits++; this.sq = 0.25; Game.sfx('knock', this.x, 0.8); FX.bonk(this.x, this.y - 10, 6);
      if (this.hits >= 3) { this.doTask(this.crack(), 5); return true; }
      HUD.toast(this.hits === 1 ? 'Clonk! The Minior shell wobbles...' : 'Crk... a fine crack glows in the shell!', { life: 1.8 });
      return true;
    }
    onPoke() { if (!this.hitShell()) { this.emote('heart', 1); Game.sfx('twinkle', this.x, 0.5); } }
    onWater() { this.hitShell(); }
    wake() {}
  }

  /* ================= JIRACHI ================= */
  class JirachiM extends Mons.Mon {
    constructor() {
      super(sp('Jirachi'), { kind: 'jirachi', dex: 'jirachi', x: GEO.NESTX, y: GEO.NEST.y - 2, yaw: Math.PI / 2 + 0.3, z: 2.2, scale: 0.4, qPose: 0.05, qFields: { arms: 0.25, float: 0.1, tags: 0.25, glow: 0.1, mouth: 0.25 }, persona: 'calm', mode: 'float' });
      this.sleeping = true; this.bury = 0.35; this.noShadow = true; this.awake = false;
    }
    physics() {}
    animate(dt, t) {
      const P = { arms: -0.6, float: 0, eyes: this.sleeping ? 'closed' : 'happy', tags: Math.sin(t * 1.4) * 0.5, mouth: 0, glow: 0 };
      Object.assign(P, this.o); this.pose = P;
    }
    brain() { return this.life(); }
    *life() { for (;;) { this.sleeping = true; yield* hold(this, 3, 'sleep', 0.6 + 0.3 * Math.sin(Game.t)); if (Math.random() < 0.3) { const h = this.headPt(); FX.add({ type: 'icon', icon: 'swirl', x: h[0] + 5, y: h[1] - 3, vx: 5, vy: -9, life: 1.6, layer: 3 }); } } }
    hear() {}
    *wish() {
      this.awake = true; this.sleeping = false; this.bury = 0;
      Game.sfx('twinkle', this.x, 1); this.emote('sparkle', 1.2);
      HUD.toast('The song and the falling stars wake something in the crystal nest...', { life: 3 });
      const tx = GEO.SHAFT, ty = gy(GEO.SHAFT) - 150;
      Game.cine.pan(tx, ty + 20, { dur: 1.8, hold: 6, zoom: 1.22, frame: 0.5 });
      let e = 0; const x0 = this.x, y0 = this.y;
      while (e < 2.6) { const dt = yield; e += dt; const k = U.ease.inOut(Math.min(1, e / 2.6)); this.x = lerp(x0, tx, k); this.y = lerp(y0, ty, k) - Math.sin(k * Math.PI) * 30; this.o.float = 1; this.o.arms = 0; this.o.glow = k * 0.6; this.turn(Math.PI / 2, dt, 3); this.setAct('wish', 0.7); }
      e = 0;
      while (e < 5) {
        const dt = yield; e += dt;
        this.o.float = 1; this.o.arms = 1; this.o.glow = 1; this.o.mouth = 0.6; this.o.tags = Math.sin(e * 6);
        this.y = ty + Math.sin(e * 2) * 4; this.setAct('wish', 1);
        if (Math.random() < dt * 30) { const a = e * 5 + rnd(0, 1); FX.add({ type: 'spark', x: this.x + Math.cos(a) * (20 + e * 6), y: this.y - 20 + Math.sin(a) * (12 + e * 4), size: 2, life: 0.8, c: 0xffffffff, c2: hex('#ffe060'), layer: 4 }); }
      }
      Game.sfx('reward', this.x, 0.9); S.flash = 0.8; FX.confetti(this.x, this.y - 20, 50);
      const first = Save.discover('falls.wish');
      Save.addItem('berry', 3); Save.addPoints(500);
      let n = 0; for (const m of Mons.all) if (m.kind === 'minior' && m.state === 'shell' && n < 4) { n++; setTimeout(() => { if (m.alive && m.state === 'shell') m.doTask(m.crack(), 5); }, 600 + n * 500); }
      HUD.toast(first ? 'Jirachi grants a wish! Stars rain down (+3 berries, +500) — and the Minior shells burst open!' : 'Jirachi grants another wish!', { life: 4 });
      e = 0; while (e < 12) { const dt = yield; e += dt; this.x = tx + Math.sin(e * 0.8) * 50; this.y = ty + Math.sin(e * 1.3) * 12; this.o.float = 1; this.o.arms = 0.3; this.o.glow = 0.5; this.setAct('wish', 0.5); }
      e = 0; const x1 = this.x, y1 = this.y;
      while (e < 2.5) { const dt = yield; e += dt; const k = Math.min(1, e / 2.5); this.x = lerp(x1, GEO.NESTX, k); this.y = lerp(y1, GEO.NEST.y - 2, k); this.o.float = 1 - k; this.setAct('wish', 0.4); }
      this.awake = false; this.bury = 0.35; S.wishT = Game.t;
    }
    onPoke() { if (this.sleeping) { this.emote('swirl', 1); HUD.toast('Jirachi is fast asleep. Legends say it wakes under falling stars...', { life: 2.6 }); } }
    onWater() { this.emote('sweat'); }
  }

  /* ================= DEOXYS ================= */
  class DeoxysM extends Flyer {
    constructor() {
      super(sp('Deoxys'), { kind: 'deoxys', dex: 'deoxys', x: GEO.SHAFT, y: -120, yaw: Math.PI / 2 + 0.3, z: 1.9, scale: 0.36, qPose: 0.05, qFields: { wave: 0.4, lean: 0.1, spread: 0.1, fly: 0.1, morph: 0.1, punch: 0.25, kick: 0.25 }, persona: 'calm', speed: 90 });
      this.form = 'normal'; this.morph = 1; this.stay = 70; this.noShadow = false;
    }
    animate(dt, t) { const P = { wave: t * 3, lean: 0, spread: 0.6, fly: 0, form: this.form, morph: Math.round(this.morph * 10) / 10, eyes: this.blink(t, dt) ? 'blink' : 'open' }; Object.assign(P, this.o); this.pose = P; }
    physics() {}
    brain() { return this.life(); }
    *life() {
      yield* this.descend();
      while (this.stay > 0) {
        const r = Math.random();
        if (r < 0.4) yield* this.changeForme();
        else { const x = clamp(GEO.METEOR + rnd(-260, 260), 2600, 3300); this.o.fly = 0.8; yield* this.flyTo(x, gy(x) - rnd(60, 130), 110, { act: 'fly', peak: () => 0.8 }); yield* hold(this, rnd(1.5, 3), 'fly', 0.5); }
      }
      while (this.y > -260) { const dt = yield; this.x = lerp(this.x, GEO.SHAFT, dt); this.y -= dt * 160; this.o.fly = 1; this.setAct('fly', 0.6); }
      this.remove(); S.deoxys = null;
    }
    update(dt, t) { super.update(dt, t); this.stay -= dt; }
    *descend() {
      Game.sfx('portal', GEO.SHAFT, 1); Game.shake(1.5);
      HUD.toast('The meteorite answers! Something descends through the shaft...', { life: 3.4 });
      Game.cine.pan(GEO.SHAFT + 100, gy(GEO.SHAFT) - 130, { dur: 1.6, hold: 5.5, zoom: 1.12, frame: 0.5 });
      let e = 0; const T = 5.5, tx = GEO.SHAFT + 150, ty = gy(GEO.SHAFT + 150) - 70;
      while (e < T) { const dt = yield; e += dt; const k = U.ease.inOut(Math.min(1, e / T)); this.x = lerp(GEO.SHAFT, tx, k); this.y = lerp(-120, ty, k); this.o.spread = 1; this.o.lean = -0.2; this.turn(Math.PI / 2, dt, 2); this.setAct('descend', 1); if (Math.random() < dt * 30) FX.add({ type: 'spark', x: this.x + rnd(-20, 20), y: this.y - rnd(0, 100), size: 2, life: 0.7, c: 0xffffffff, c2: hex('#c08aff'), layer: 3 }); }
      Save.discover('falls.deoxys');
    }
    *changeForme() {
      const nf = pick(['attack', 'defense', 'speed', 'normal'].filter((f) => f !== this.form));
      yield* this.faceCam(1);
      Game.sfx('sparkle', this.x, 1);
      let e = 0, sw = false; const T = 1.6;
      while (e < T) { const dt = yield; e += dt; const k = e / T; if (!sw && k > 0.5) { sw = true; this.form = nf; FX.add({ type: 'ring', x: this.x, y: this.y - 50, r0: 6, r1: 60, life: 0.5, c: hex('#c08aff'), layer: 3 }); Game.sfx('pop', this.x, 1); } this.morph = sw ? Math.min(1, (k - 0.5) * 2) : 1 - k * 2; if (!sw && nf === 'normal') this.morph = 1; this.tint = 0xffffffff; this.tintK = Math.max(0, 1 - Math.abs(k - 0.5) * 3) * 0.8; this.setAct('forme', 1); }
      this.tintK = 0; this.morph = 1;
      yield* hold(this, 1.5, 'forme', 0.6);
    }
    onPoke() { if (!this.busy(3)) this.doTask(this.changeForme(), 3); }
    onWater() { this.emote('anger'); }
  }

  /* ================= area logic ================= */
  function cores() { const st = Save.data.stats || (Save.data.stats = {}); return st.fallsCores || (st.fallsCores = []); }
  function newColour() { const got = cores(); const free = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => !got.includes(c) && !Mons.all.some((m) => m.kind === 'minior' && m.c === c)); return free.length ? pick(free) : Math.floor(Math.random() * 8); }
  function coreCracked(c) {
    const got = cores();
    if (!got.includes(c)) { got.push(c); Save.save(); HUD.toast('A new Minior core colour! (' + got.length + ' of 8)', { life: 2.2 }); }
    maybeDeoxys();
  }
  function maybeDeoxys() {
    if (S.deoxys || !sp('Deoxys') || !Save.found('falls.meteorite') || cores().length < 5 || S.deoxysDone) return;
    S.deoxysDone = true;
    setTimeout(() => { if (Game.area === A0 && !S.deoxys) S.deoxys = G0.addMon(new DeoxysM()); }, 2500);
  }
  function addMinior(x, c, state, y) { if (!sp('Minior') || Mons.all.filter((m) => m.kind === 'minior').length > 11) return null; const m = G0.addMon(new MiniorM(x, c, state, y)); m.home = x; return m; }
  function spawn(A, G, S0) {
    S = S0; A0 = A; G0 = G;
    Object.assign(S, { seq: [], chimeT: -9, hintT: 20, hinted: false, geyserT: 0, geyserCool: 0, shower: 0, showerCool: 0, starT: rnd(10, 25), align: null, alignCool: 20, heart: Save.found('falls.meteorite') ? 1 : 0, heartBeam: 0, boulderHits: 0, boulderOpen: false, geodeOpen: false, flash: 0, jirachi: null, deoxys: null, deoxysDone: false, wishT: -999, leaping: null, mirrorT: -9, roarT: 0, stars: [] });
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Bagon')) { add(new BagonM(0, 1560, World.plats[P_LEDGE])); add(new BagonM(1, 1300, null)); }
    if (sp('Solrock')) add(new RockM('Solrock', 'solrock', GEO.SHAFT + 20, gy(GEO.SHAFT) - 70));
    if (sp('Lunatone')) add(new RockM('Lunatone', 'lunatone', 2250, gy(2250) - 60));
    for (const x of [2230, 2380, 2560, 2690, 2860]) addMinior(x, newColour(), 'shell');
    if (hourIs('night')) spawnJirachi();
    if (sp('Deoxys') && Save.found('falls.deoxys') && hourIs('night') && chance(0.3)) { S.deoxysDone = true; S.deoxys = add(new DeoxysM()); }
  }
  function spawnJirachi() { if (!S.jirachi && sp('Jirachi')) S.jirachi = G0.addMon(new JirachiM()); }
  function startShower(why) {
    if (S.shower > 0) return;
    S.shower = 40; S.showerCool = 60;
    HUD.toast(why || 'A meteor shower! Stars stream past the hole in the ceiling...', { life: 3 });
    Game.cine.pan(GEO.SHAFT, gy(GEO.SHAFT) - 240, { dur: 1.4, hold: 2.4, zoom: 1.05, frame: 0.4 });
    Save.discover('falls.shower'); Game.sfx('twinkle', null, 0.9);
  }
  function update(A, dt, t, G) {
    const m = G.mudkip, night = hourIs('night');
    // hopping up to the ledges: tapping a ledge routes Mudkip via its hop stones
    const tg = m.target;
    if (tg && tg.kind === 'plat' && tg.plat && tg.plat.hop && m.plat !== tg.plat && m.mode === 'land' && !m.busy(2)) {
      const L = tg.plat;
      if (L.hop === 'step') m.target = { kind: 'walk', x: GEO.STEP.x - 24, y: gy(GEO.STEP.x - 24), then: () => m.doTask(climbLedge(m), 3) };
      else { m.target = null; HUD.toast(L === World.plats[P_NEST] ? 'Too high to climb... the geyser in the glowing pool might launch you up!' : 'Hop up the stones!', { life: 2.4 }); }
    }
    // geyser
    S.geyserCool -= dt;
    if (S.geyserT > 0) {
      S.geyserT -= dt;
      if (Math.random() < dt * 60) FX.add({ type: 'drop', x: GEO.GEYSER + rnd(-6, 6), y: GEO.GLOW.level - rnd(0, 120 * Math.min(1, (2.5 - S.geyserT) * 3)), vx: rnd(-30, 30), vy: -rnd(20, 90), g: 300, life: 1, c: 0xffffffff, c2: hex('#8af0e8'), size: 2, floor: GEO.GLOW.level, layer: 3 });
      Ripples.poke(GEO.GEYSER, 40, 3);
    } else if (Math.random() < dt * 3) FX.bubbles(GEO.GEYSER + rnd(-4, 4), gy(GEO.GEYSER) - 4, 1, GEO.GLOW.level);
    // waterfalls: foam, spray, ripples, roar
    for (const [fx, lv] of [[GEO.FALL, GEO.POOL.level], [GEO.FALL2, GEO.SPRING.level], [2025, GEO.GLOW.level]]) {
      if (Math.abs(fx - (Game.cam.x + Game.VW / 2)) > Game.VW) continue;
      Ripples.poke(fx + rnd(-10, 10), 25, 2);
      if (Math.random() < dt * 25) FX.add({ type: 'drop', x: fx + rnd(-16, 16), y: lv - 1, vx: rnd(-40, 40), vy: -rnd(30, 110), g: 300, life: 1, c: 0xffffffff, c2: hex('#c8ecfa'), size: 1, floor: lv + 1, layer: 3 });
    }
    S.roarT -= dt;
    if (S.roarT <= 0) { S.roarT = 2.8; const fx = [GEO.FALL, GEO.FALL2].sort((a, b) => Math.abs(a - m.x) - Math.abs(b - m.x))[0]; Game.sfx('rain', fx, 0.9); }
    // drips from the ceiling
    if (Math.random() < dt * 2.5) { const x = Game.cam.x + rnd(0, Game.VW), w = World.waterAt(x) !== null, fl = w ? WorldRender.surfaceAt(x, t) : gy(x); FX.add({ type: 'drop', x, y: Game.cam.y - 4, vx: 0, vy: 40, g: 380, life: 4, c: hex('#bfe8ff'), c2: hex('#6ab8e0'), size: 2, floor: fl, layer: 2, onFloor: (p) => { FX.add({ type: 'ripple', x: p.x, y: fl + 1, r0: 0.5, r1: w ? 6 : 3, flat: 0.35, life: 0.6, c: 0xffe8fbff, layer: 2 }); if (w && Math.random() < 0.3) Game.sfx('plop', p.x, 0.2); } }); }
    // the drips play the crystal tune now and then (the hint)
    if (Math.abs(m.x - 1140) < 400 && !Save.found('falls.chimes')) { S.hintT -= dt; if (S.hintT <= 0) { S.hintT = 32; GEO.TUNE.forEach((i, k) => setTimeout(() => { if (Game.area === A) ring(A, i, true); }, k * 650)); if (!S.hinted) { S.hinted = true; HUD.toast('Plink... plonk... drips ring the crystals in a little tune.', { life: 3 }); } } }
    // meteor shower & falling stars at night
    S.showerCool -= dt;
    if (S.shower > 0) S.shower -= dt;
    if (night) {
      spawnJirachi();
      S.starT -= dt * (S.shower > 0 ? 6 : 1);
      if (S.starT <= 0) { S.starT = rnd(35, 60); if (Mons.all.filter((q) => q.kind === 'minior').length < 10) { const x = GEO.SHAFT + rnd(-120, 160); addMinior(x, newColour(), 'fall', -60); HUD.toast('A falling star drops through the shaft!', { life: 2 }); } }
      if (S.shower <= 0 && S.showerCool < -200 && chance(dt * 0.004)) startShower('The sky through the shaft fills with shooting stars!');
    } else if (S.jirachi && !S.jirachi.awake) { S.jirachi.remove(); S.jirachi = null; }
    if (S.shower > 0 && Math.random() < dt * 6) S.stars.push({ x: rnd(-0.2, 1.2), y: rnd(-0.1, 0.4), t: 0, life: rnd(0.5, 1) });
    for (const s of S.stars) s.t += dt; S.stars = S.stars.filter((s) => s.t < s.life);
    // cosmic alignment at dawn / dusk
    S.alignCool -= dt;
    if (S.align) { S.align.t -= dt; if (S.align.t < S.align.T * 0.35 && !S.heart) wakeHeart(); if (S.align.t <= 0) S.align = null; }
    else if (hourIs('dawn', 'dusk') && S.alignCool <= 0) callAlign();
    if (S.heartBeam > 0) S.heartBeam -= dt;
    S.flash = Math.max(0, S.flash - dt * 1.5);
    for (const c of A.crysGlow || []) c.k = (night ? 0.9 : 0.45) * (0.8 + 0.2 * Math.sin(t * 1.3 + c.x)) * (c.boost ? 1.8 : 1);
    if (A.heartGlow) A.heartGlow.k = S.heart ? 0.9 + 0.3 * Math.sin(t * 3) : 0.15;
  }
  function callAlign() {
    const lu = Mons.all.find((q) => q.kind === 'lunatone'), so = Mons.all.find((q) => q.kind === 'solrock');
    if (!lu || !so || S.align) return;
    S.align = { t: 14, T: 14 }; S.alignCool = 70;
    lu.sleeping = so.sleeping = false; lu.task = null; so.task = null;
    if (Math.abs(mk().x - GEO.SHAFT) < 500) HUD.toast('The sun and moon rocks drift together in the shaft... a cosmic alignment!', { life: 3 });
  }
  function wakeHeart() {
    S.heart = 1; S.heartBeam = 3;
    Game.sfx('portal', GEO.METEOR, 1); Game.shake(1.2);
    const first = Save.discover('falls.meteorite');
    if (Math.abs(mk().x - GEO.SHAFT) < 900) Game.cine.pan(GEO.METEOR, gy(GEO.METEOR) - 50, { dur: 1.3, hold: 2.5, zoom: 1.12 });
    HUD.toast(first ? 'Their light strikes the meteorite — its heart awakens, humming with space!' : 'The meteorite heart pulses in the alignment\'s light.', { life: 3.4 });
    maybeDeoxys();
  }
  function* climbLedge(m) {
    const L = World.plats[P_LEDGE];
    m.target = null;
    yield* Toys.hopTo(m, GEO.STEP.x, GEO.STEP.y, 0.4, 24);
    yield* Toys.hopTo(m, L.x0 + 18, L.y, 0.45, 30);
    m.mode = 'land'; m.air = 0; m.vair = 0; m.plat = L; m.y = L.y; m.sq.kick(0.4);
  }
  function* geyserRide(m) {
    const L = World.plats[P_NEST];
    m.target = null;
    S.geyserT = 2.5; Game.sfx('spout', GEO.GEYSER, 1); Game.shake(1);
    const x0 = m.x, y0 = m.y; let e = 0; const T = 1.4, tx = L.x0 + 30;
    m.mode = 'toy';
    while (e < T) { const dt = yield; e += dt; const k = Math.min(1, e / T); m.x = lerp(x0, tx, U.ease.inOut(k)); m.y = lerp(y0, L.y, k) - Math.sin(k * Math.PI) * 120; m.o.legF = -0.8; m.o.legB = 0.8; m.o.tailLift = 0.5; m.happyT = 0.2; m.yaw = m.face(1, true); if (Math.random() < dt * 30) FX.add({ type: 'drop', x: m.x + rnd(-6, 6), y: m.y, vx: rnd(-20, 20), vy: rnd(0, 40), g: 300, life: 1, c: 0xffffffff, c2: hex('#8af0e8'), size: 2, layer: 3 }); }
    m.mode = 'land'; m.air = 0; m.vair = 0; m.plat = L; m.y = L.y; m.x = tx; m.sq.kick(0.8); m.happyT = 1;
    Save.discover('toy.geyser');
  }
  function geyser(A) {
    const m = mk();
    if (S.geyserCool > 0) { HUD.toast('The geyser is building up pressure...', { life: 1.4 }); return; }
    S.geyserCool = 4;
    if (m.mode === 'swim' && Math.abs(m.x - GEO.GEYSER) < 90) { m.doTask(geyserRide(m), 4); return; }
    S.geyserT = 2.5; Game.sfx('spout', GEO.GEYSER, 1);
    HUD.toast(S.leaping ? 'Whoosh!' : 'The geyser erupts! Swim over it and it might launch you up...', { life: 2.2 });
  }
  function* slide(m) {
    m.target = null;
    const pts = [[GEO.NEST.x0 + 6, GEO.NEST.y], [2012, 470], [1985, 540], [1950, GEO.GLOW.level + 10]];
    m.mode = 'toy'; m.plat = null; Game.sfx('whoosh', m.x, 0.9);
    for (let i = 0; i < pts.length - 1; i++) { const [xa, ya] = i ? pts[i] : [m.x, m.y], [xb, yb] = pts[i + 1]; let e = 0; const T = 0.35; while (e < T) { const dt = yield; e += dt; const k = Math.min(1, e / T); m.x = lerp(xa, xb, k); m.y = lerp(ya, yb, k); m.yaw = m.face(-1, true); m.o.legF = -0.9; m.o.legB = 0.9; m.happyT = 0.2; if (Math.random() < dt * 30) FX.add({ type: 'drop', x: m.x, y: m.y - 4, vx: rnd(-30, 30), vy: -rnd(20, 60), g: 300, life: 0.6, c: 0xffffffff, c2: hex('#c8ecfa'), size: 1, layer: 3 }); } }
    FX.splashAt(m.x, GEO.GLOW.level, { power: 1 }); Game.sfx('splash', m.x, 1);
    m.mode = 'swim'; m.vx = -30; m.vy = 40; m.happyT = 1;
    Save.discover('toy.slide');
  }
  function slideTap() { const m = mk(); if (m.plat === World.plats[P_NEST]) m.doTask(slide(m), 3); else HUD.toast('A little stream spills off the high ledge into the glowing pool — what a slide that would be!', { life: 2.6 }); }
  function ring(A, i, drip = false) {
    const c = A.chimes && A.chimes[i]; if (!c) return;
    c.shake = 0.35; ting(i, c.x, drip ? 0.35 : 0.8);
    const top = c.y - c.frames[0].ay + 4;
    FX.sparkles(c.x, top + 8, drip ? 3 : 6, 12, 0xffffffff, hex(['#8ad4ff', '#c89aff', '#8af4ec', '#ff9ad0', '#ffe890'][i]));
    if (drip) FX.add({ type: 'drop', x: c.x, y: top - 60, vx: 0, vy: 80, g: 400, life: 0.5, c: hex('#bfe8ff'), size: 2, floor: top, layer: 3 });
    else {
      FX.add({ type: 'icon', icon: 'note', x: c.x, y: top - 4, vx: rnd(-8, 8), vy: -20, life: 1.2, layer: 3 });
      if (Game.t - S.chimeT > 6) S.seq = [];
      S.chimeT = Game.t; S.seq.push(i); if (S.seq.length > 4) S.seq.shift();
      if (S.seq.length === 4 && S.seq.every((v, k) => v === GEO.TUNE[k])) { S.seq = []; resonate(A); }
    }
  }
  function resonate(A) {
    S.flash = 0.6; Game.shake(1); Game.sfx('chime', null, 1);
    for (const g of A.crysGlow || []) g.boost = true;
    setTimeout(() => { for (const g of A.crysGlow || []) g.boost = false; }, 9000);
    for (const q of Mons.all) if (q.kind === 'lunatone' || q.kind === 'solrock') q.emote('note', 1.5);
    const first = Save.discover('falls.chimes');
    if (!S.geodeOpen) {
      S.geodeOpen = true; if (A.geode) A.geode.frames = [A.geodeSpr[1]];
      FX.sparkles(GEO.GEODE, gy(GEO.GEODE) - 20, 20, 40, 0xffffffff, hex('#c89aff'));
      addMinior(GEO.GEODE + 8, newColour(), 'core', gy(GEO.GEODE) - 20);
      Game.cine.pan(GEO.GEODE, gy(GEO.GEODE) - 30, { hold: 2, zoom: 1.12 });
    }
    HUD.toast(first ? 'The crystals resonate — the whole cave sings! A geode cracks open and a Minior core floats out!' : 'The crystals sing together!', { life: 3.4 });
  }
  function boulder(A) {
    if (S.boulderOpen) { HUD.toast('Just rubble now.', { life: 1.4 }); return; }
    Game.sfx('knock', GEO.BOULDER, 0.8);
    const b = Mons.all.filter((q) => q.kind === 'bagon' && !q.sleeping && !q.busy(3) && q.mode === 'land').sort((a, c) => Math.abs(a.x - GEO.BOULDER) - Math.abs(c.x - GEO.BOULDER))[0];
    if (!b) { HUD.toast(hourIs('night') ? 'Knock knock... the Bagon are asleep.' : 'Knock knock! Too hard for Mudkip... a hard-headed Pokémon might crack it.', { life: 2.4 }); return; }
    HUD.toast('Bagon heard that! It wants to show off...', { life: 2 });
    if (b.plat) { b.plat = null; b.x = World.plats[P_LEDGE].x0 - 10; b.minX = 1250; b.maxX = 1460; }
    b.doTask((function* () { for (let k = 0; k < 3 && !S.boulderOpen; k++) yield* b.headbutt(GEO.BOULDER, () => hitBoulder(A)); })(), 4);
  }
  function hitBoulder(A) {
    S.boulderHits++;
    A.boulder.shake = 0.6;
    if (S.boulderHits < 3) { A.boulder.frames = [A.boulderSpr[S.boulderHits]]; return; }
    S.boulderOpen = true; A.boulder.frames = [A.boulderSpr[3]];
    for (let i = 0; i < 16; i++) FX.add({ type: 'drop', x: GEO.BOULDER + rnd(-20, 20), y: gy(GEO.BOULDER) - rnd(10, 40), vx: rnd(-90, 90), vy: -rnd(60, 180), g: 500, life: 1.4, c: hex('#4e5068'), c2: hex('#8488a0'), size: 2, floor: gy(GEO.BOULDER), layer: 3 });
    dust(GEO.BOULDER, gy(GEO.BOULDER), 10); Game.sfx('crack', GEO.BOULDER, 1); Game.shake(1.6);
    addMinior(GEO.BOULDER, newColour(), 'shell');
    HUD.toast('The boulder cracks open — a Minior shell was hidden inside!', { life: 3 });
  }
  function mirror(A) {
    if (Game.t - S.mirrorT < 3) return;
    S.mirrorT = Game.t; A.mirror.shake = 0.4; Game.sfx('clink', GEO.MIRROR, 0.8);
    const so = Mons.all.find((q) => q.kind === 'solrock');
    if (hourIs('night')) { HUD.toast('The mirror crystal catches only a little moonlight.', { life: 2 }); return; }
    S.mirrorBeam = 0.8;
    if (so && inShaft(so.x, so.y + 40)) so.doFlare(); else HUD.toast('A bright reflection flashes across the cave.', { life: 1.8 });
  }
  function scope(A) {
    HUD.scope(4.4); Game.sfx('select', GEO.SCOPE, 0.6);
    const n = hourIs('night');
    Game.cine.pan(GEO.SHAFT, gy(GEO.SHAFT) - 300, { dur: 1.3, hold: 2.6, zoom: 1.3, frame: 0.5 });
    HUD.toast(S.shower > 0 ? 'Through the telescope: shooting stars everywhere! Make a wish...' : n ? 'Through the telescope: the moon and a sky full of stars. Stars fall here sometimes...' : hourIs('dawn', 'dusk') ? 'Through the telescope: sun and moon share the sky. The rocks below seem restless.' : 'Through the telescope: blue sky, and the sun shining straight down the shaft.', { life: 3.2 });
  }
  function song(x) {
    if (Math.abs(x - GEO.SHAFT) < 260 && hourIs('night') && S.shower <= 0 && S.showerCool <= 0) startShower();
    if (Math.abs(x - GEO.SHAFT) < 300 && hourIs('dawn', 'dusk') && !S.align) { S.alignCool = 0; callAlign(); }
    const J = S.jirachi;
    if (J && J.alive && !J.awake && S.shower > 0 && Math.abs(x - GEO.NESTX) < 420 && Game.t - S.wishT > 60) J.doTask(J.wish(), 6);
    else if (J && J.alive && !J.awake && Math.abs(x - GEO.NESTX) < 300) { J.emote('swirl', 1); HUD.toast('Jirachi stirs in its sleep... it needs something more — falling stars?', { life: 2.6 }); }
    if (x > 1000 && x < 1260) HUD.toast('The crystals hum along with your song.', { life: 1.8 });
  }
  function water(tx, ty) {
    const so = Mons.all.find((q) => q.kind === 'solrock');
    if (so && !hourIs('night') && inShaft(tx, ty) && Math.hypot(so.x - tx, so.y - 40 - ty) < 120) so.doFlare();
    for (const q of Mons.all) if (q.kind === 'minior' && q.state === 'shell' && Math.hypot(q.x - tx, q.y - 10 - ty) < 26 && !q._wet) { q._wet = 1; setTimeout(() => { q._wet = 0; }, 700); q.hitShell(); }
  }
  function onScan(A) {
    let n = 0;
    const mx = mk().x, near = (x) => Math.abs(x - mx) < Game.VW * 0.7;
    if (near(1140)) { HUD.toast(Save.found('falls.chimes') ? 'Scan: the singing crystals.' : 'Scan: five singing crystals. The ceiling drips play them in a certain order...', { life: 3 }); n++; }
    if (near(GEO.BOULDER) && !S.boulderOpen) { HUD.toast('Scan: a hollow-sounding boulder. Bagon love headbutting boulders...', { life: 2.6 }); n++; }
    if (near(GEO.METEOR)) { HUD.toast(S.heart ? 'Scan: the meteorite heart hums. It responds to Minior cores... ' + cores().length + ' colours cracked so far.' : 'Scan: an ancient meteorite, cold and dark. It needs the light of sun and moon together...', { life: 3.4 }); n++; }
    if (near(GEO.NESTX)) { HUD.toast(S.jirachi ? 'Scan: something tiny sleeps in the crystal nest. It dreams of falling stars.' : 'Scan: a nest of crystals up high, still warm. Something sleeps here at night.', { life: 3 }); n++; }
    if (near(GEO.GEYSER)) { HUD.toast('Scan: a geyser vent at the bottom of the glowing pool.', { life: 2.4 }); n++; }
    return n;
  }
  function post(A, fb, cx, cy, t) {
    const W = fb.w, H = fb.h, d = fb.d;
    // light from the alignment to the meteorite / the mirror reflection
    const beam = (x0, y0, x1, y1, c, a) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k < n; k++) { const u = k / n, x = Math.round(x0 + (x1 - x0) * u - cx), y = Math.round(y0 + (y1 - y0) * u - cy); for (let j = -2; j <= 2; j++) { const yy = y + j; if (x >= 0 && yy >= 0 && x < W && yy < H) d[yy * W + x] = U.screen(d[yy * W + x], c, a * (1 - Math.abs(j) / 3)); } } };
    if (S.heartBeam > 0) beam(GEO.SHAFT, gy(GEO.SHAFT) - 110, GEO.METEOR, gy(GEO.METEOR) - 40, 0xffffd8ff, Math.min(1, S.heartBeam));
    if (S.mirrorBeam > 0) { S.mirrorBeam -= 1 / 60; const so = Mons.all.find((q) => q.kind === 'solrock'); if (so) beam(GEO.MIRROR, gy(GEO.MIRROR) - 30, so.x, so.y - 40, 0xffffe8a0, S.mirrorBeam); }
    if (S.flash > 0.01) { const k = Math.round(S.flash * 160); for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xffffffff, k); }
  }
  function photoBonus(A, crop, subs, main) {
    if (S.align && subs.some((s) => s.sp === 'solrock') && subs.some((s) => s.sp === 'lunatone')) return { pts: 800, name: 'Cosmic alignment' };
    if (subs.some((s) => s.sp === 'deoxys')) return { pts: 700, name: 'Visitor from space' };
    if (S.shower > 0) return { pts: 400, name: 'Meteor shower' };
    if (subs.some((s) => s.sp === 'minior' && s.m.state === 'core')) return { pts: 200, name: 'Crystal light' };
    if (hourIs('night')) return { pts: 150, name: 'Moonlit cave' };
    return null;
  }
  return { GEO, P_LEDGE, P_NEST, spawn, update, ring, boulder, geyser, slideTap, mirror, scope, song, water, onScan, post, photoBonus, cores, get S() { return S; }, classes: { BagonM, RockM, MiniorM, JirachiM, DeoxysM } };
})();
