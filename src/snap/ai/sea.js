/* ------------------------------------------------------------------
   SeaAI — more of Coral Cove's sea life.
    · Wailmer cruise past the reef (1★), surface to blow a spout (2★) and
      bounce on the waves like a ball (3★); sing at the end of the dock
      in daylight and one leaps for a huge belly-flop (4★)
    · Clamperl rest on the seabed (1★), peek out of their shells (2★),
      snap up a berry that sinks to them (3★), and at night their pearls
      glow as the shells open wide (4★)
    · Relicanth: the living fossil sleeps in the deep trench. Once the
      old friends from the Fossil Cliffs are revived, it rises at dawn to
      meet you (4★)
    · Staryu rest in the shallows and the tide pool (1★) and cartwheel
      along the seabed (2★); at night they come up onto the wet sand and
      their cores twinkle (3★) — play music and they flash in time (4★)
    · Tentacool drift near the surface (1★), pulse upward (2★) and their
      gems glint in the sun (3★). One has washed up on the sand: give it
      a few squirts of Water Gun and help it home (4★)
    · Chinchou glow in the dark trench (2★) and signal each other with
      their lights (3★); swim down there at night and they light your way
      (4★)
    · Carvanha patrol the reef in a pack (2★) and charge anything that
      swims too close (3★); a berry on the water sends them into a frenzy
      (4★)
------------------------------------------------------------------- */
const SeaAI = (() => {
  const { clamp, lerp, rnd, pick, chance, hex } = U;
  const { wait, until } = Mons;
  const { Swimmer, mk, hourIs, surf } = AI;
  const gy = (x) => World.groundAt(x);
  const sp = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  const SEA = 520;
  let S = {};
  function* hold(m, T, act, peak = 0.3, stop = null) { let e = 0; while (e < T) { const dt = yield; e += dt; m.setAct(act, typeof peak === 'function' ? peak(e) : peak); if (stop && stop()) return; } }

  /* ================= WAILMER ================= */
  class WailmerM extends Swimmer {
    constructor(x) {
      super(sp('Wailmer'), { kind: 'wailmer', dex: 'wailmer', x, y: SEA + 90, yaw: 0.6, z: 1.3, scale: 0.28, qPose: 0.06, qFields: { swim: 0.5, puff: 0.2, blow: 0.25, mouth: 0.25, roll: 0.25 }, persona: 'curious', speed: 30, box: { x0: 2050, x1: 3150, y0: SEA + 40, y1: SEA + 220 } });
      this.swimTop = 16; this.senseR = 160;
    }
    animate(dt, t) { const P = { swim: t * 2 + this.seed, puff: 0.2, blow: 0, mouth: 0.3, eyes: this.blink(t, dt) ? 'blink' : 'open', roll: Math.sin(t * 0.7) * 0.2 }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 3));
      for (;;) {
        if (S.leapReq === this) { S.leapReq = null; yield* this.leap(); continue; }
        const r = Math.random();
        if (r < 0.25) yield* this.spout();
        else if (r < 0.4) yield* this.bounce();
        else yield* this.cruise(rnd(4, 8), 'swim');
      }
    }
    *surface() { yield* this.swimTo(this.x + rnd(-40, 40), surf(this.x) + 6, 40, 5); }
    *spout() {
      yield* this.surface();
      let e = 0; Game.sfx('spout', this.x, 0.6);
      while (e < 2.2) { const dt = yield; e += dt; const k = Math.sin(Math.min(1, e / 2.2) * Math.PI); this.o.blow = k; this.setAct('spout', k > 0.6 ? 1 : 0.5); if (k > 0.3 && Math.random() < dt * 40) { const [bx, by] = this.at('top'); FX.add({ type: 'drop', x: bx + rnd(-3, 3), y: by - 2, vx: rnd(-20, 20), vy: -rnd(80, 140) * k, g: 300, life: 1, c: 0xffffffff, c2: hex('#bfefff'), size: 2, floor: surf(bx) + 2, layer: 3 }); } }
    }
    *bounce() {
      yield* this.surface();
      this.mode = 'air';
      for (let i = 0; i < 3; i++) {
        const s0 = surf(this.x), x0 = this.x, H = 26 - i * 6; let e = 0; const T = 0.6;
        Game.sfx('boing', this.x, 0.5);
        while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = x0 + k * 24 * Math.cos(this.yaw); this.y = s0 + 4 - Math.sin(k * Math.PI) * H; this.o.puff = 0.6; this.o.eyes = 'happy'; this.setAct('bounce', k > 0.3 && k < 0.7 ? 1 : 0.6); }
        FX.splashAt(this.x, surf(this.x), { power: 0.5 });
      }
      this.mode = 'swim';
    }
    *leap() {
      yield* this.swimTo(1980 + rnd(0, 120), SEA + 70, 70, 6);
      this.mode = 'air';
      const x0 = this.x, s0 = surf(x0), y0 = this.y; let e = 0; const T = 1.8;
      Game.sfx('whale', this.x, 0.7);
      while (e < T) { const dt = yield; e += dt; const k = e / T; this.x = x0 + k * 70; this.y = lerp(y0, s0, Math.min(1, k * 4)) - Math.max(0, Math.sin(Math.min(1, Math.max(0, (k - 0.2) / 0.8)) * Math.PI)) * 120; this.o.puff = 1; this.o.mouth = 1; this.o.eyes = 'happy'; this.o.roll = (k - 0.5) * 1.2; this.setAct('leap', k > 0.4 && k < 0.75 ? 1 : 0.6); if (Math.abs(k - 0.2) < 0.02) FX.splashAt(this.x, s0, { power: 1 }); }
      FX.splashAt(this.x, surf(this.x), { power: 1.6, n: 30 }); Game.sfx('splash', this.x, 1); Game.shake(2.5);
      if (typeof Ripples !== 'undefined') Ripples.poke(this.x, -160, 10);
      for (const m of Mons.all) if (m !== this && Math.abs(m.x - this.x) < 400) m.hear('splash', this.x, 1);
      this.mode = 'swim'; this.y = surf(this.x) + 30;
      Save.discover('wailmer.leap');
    }
    onPoke() { this.emote('note', 1); this.doTask(this.spout(), 2); }
  }

  /* ================= CLAMPERL ================= */
  class ClamperlM extends Mons.Mon {
    constructor(x) {
      super(sp('Clamperl'), { kind: 'clamperl', dex: 'clamperl', x, y: gy(x), yaw: 1.3, z: 1.6, scale: 0.5, qPose: 0.06, qFields: { open: 0.2, pearl: 0.25, mouth: 0.25 }, persona: 'shy', mode: 'rooted' });
      this.noShadow = true; this.senseR = 70; this.alert = 1.4; this.openK = 0;
    }
    physics() { this.y = gy(this.x); }
    animate(dt, t) { const P = { open: this.openK, pearl: hourIs('night') ? 0.7 + 0.3 * Math.sin(t * 2) : 0.2, eyes: this.act.id === 'feed' ? 'happy' : 'closed', mouth: 0 }; Object.assign(P, this.o); this.pose = P; if (hourIs('night') && this.openK > 0.5) this.glowOn = true; else this.glowOn = false; }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 3));
      for (;;) {
        if (hourIs('night')) { yield* this.glow(); continue; }
        this.openK = 0; yield* hold(this, rnd(4, 8), 'rest', 0.3);
        yield* this.peek();
      }
    }
    *peek() {
      let e = 0;
      while (e < 2.6) { const dt = yield; e += dt; this.openK = Math.min(0.45, e * 1.2) * (e > 2.1 ? (2.6 - e) / 0.5 : 1); this.setAct('open', e > 0.4 && e < 2 ? 0.9 : 0.5); if (Math.random() < dt * 2) FX.bubbles(this.x, this.y - 8, 1, SEA); }
      this.openK = 0;
    }
    *glow() {
      let e = 0;
      while (hourIs('night') && e < 12) { const dt = yield; e += dt; this.openK = Math.min(1, e * 0.6); this.setAct('pearl', this.openK > 0.8 ? 1 : 0.6); if (Math.random() < dt * 3) FX.add({ type: 'spark', x: this.x + rnd(-6, 6), y: this.y - 10 - rnd(0, 10), size: 1, life: 0.8, c: 0xffffffff, c2: hex('#ffd0f0'), layer: 3 }); }
    }
    onFood(it) { if (Math.abs(it.x - this.x) > 90 || World.waterAt(it.x) === null || this.busy(3)) return false; this.doTask(this.snap(it), 3); return true; }
    *snap(it) {
      // the berry sinks down to the shell (Items leaves a 'sink' berry alone)
      it.state = 'sink';
      for (let g = 0; g < 600 && !it.eaten && it.y < this.y - 10; g++) { const dt = yield; it.y = Math.min(this.y - 10, it.y + dt * 60); it.x += (this.x - it.x) * Math.min(1, dt * 1.2); this.setAct('rest', 0.4); if (Math.random() < dt * 5) FX.bubbles(it.x, it.y, 1, SEA); }
      let e = 0;
      while (e < 1.4) { const dt = yield; e += dt; this.openK = e < 0.3 ? e / 0.3 : e < 0.5 ? 0 : 0; this.setAct('feed', e > 0.25 && e < 0.6 ? 1 : 0.6); if (e > 0.35 && !it.eaten) { Items.eat(it); Game.sfx('clink', this.x, 0.6); FX.bubbles(this.x, this.y - 8, 4, SEA); } }
      this.emote('heart');
    }
    onPoke() { this.openK = 0; this.emote('sweat', 0.8); this.doTask(hold(this, 3, 'rest', 0.3), 3); }
    // rooted to the seabed: startled, it just clams up
    onNotice() { this.lastReact = Game.t; this.openK = 0; this.doTask(hold(this, rnd(2.5, 4), 'rest', 0.3), 4); }
    drawExtra(fb, cx, cy, P, t) {
      if (!this.glowOn || !this.spr) return;
      const X = Math.round(this.x - cx), Y = Math.round(this.y - 10 - cy);
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = Math.hypot(x, y); if (d > 8) continue; const px = X + x, py = Y + y; if (px < 0 || py < 0 || px >= fb.w || py >= fb.h) continue; const i = py * fb.w + px; fb.d[i] = U.screen(fb.d[i], 0xffe0c0ff, (1 - d / 8) * 0.5); }
    }
  }

  /* ================= RELICANTH ================= */
  class RelicanthM extends Swimmer {
    constructor() {
      super(sp('Relicanth'), { kind: 'relicanth', dex: 'relicanth', x: 3000, y: 930, yaw: Math.PI - 0.6, z: 1.2, scale: 0.4, qPose: 0.06, qFields: { swim: 0.5, fins: 0.25, mouth: 0.25, tilt: 0.25 }, persona: 'calm', speed: 18, box: { x0: 2800, x1: 3120, y0: 800, y1: 935 } });
      this.swimTop = 30; this.swimBot = 4; this.senseR = 110; this.risen = false;
    }
    animate(dt, t) { const P = { swim: t * 1.4 + this.seed, fins: Math.sin(t * 1.2) * 0.5, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open', tilt: 0 }; Object.assign(P, this.o); this.pose = P; }
    brain() { return this.life(); }
    *life() {
      for (;;) {
        const friends = Save.found('fossil.lileep') && Save.found('fossil.anorith');
        if (friends && hourIs('dawn') && !this.risen) { yield* this.rise(); continue; }
        yield* this.cruise(rnd(6, 10), 'swim');
        yield* hold(this, rnd(3, 6), 'swim', 0.4);
      }
    }
    *rise() {
      this.risen = true;
      HUD.toast('Something ancient stirs in the trench...', { life: 2.6 });
      Game.cine.pan(2960, 780, { dur: 1.6, hold: 4, zoom: 1.1 });
      yield* this.swimTo(2960, 760, 30, 10);
      yield* this.faceCam(0.5);
      let e = 0;
      while (e < 8) { const dt = yield; e += dt; this.o.mouth = Math.sin(e * 0.8) > 0.7 ? 0.6 : 0; this.o.fins = Math.sin(e * 2) * 0.8; this.setAct('ancient', 0.8 + 0.2 * Math.sin(e)); if (Math.random() < dt * 3) FX.bubbles(this.x + rnd(-20, 20), this.y - 20, 2, SEA); }
      Save.discover('relicanth.rose');
      yield* this.swimTo(3000, 920, 20, 12);
    }
    onPoke() { this.emote('note', 1); }
  }

  // soft additive glow (screen blend) around a point
  function glowAt(fb, cx, cy, x, y, R, col, a) {
    const X = Math.round(x - cx), Y = Math.round(y - cy), W = fb.w, H = fb.h, d = fb.d;
    const r = Math.ceil(R);
    for (let yy = -r; yy <= r; yy++) {
      const py = Y + yy; if (py < 0 || py >= H) continue;
      for (let xx = -r; xx <= r; xx++) {
        const px = X + xx; if (px < 0 || px >= W) continue;
        const q = (xx * xx + yy * yy) / (R * R); if (q >= 1) continue;
        const i = py * W + px; d[i] = U.screen(d[i], col, (1 - q) * (1 - q) * a);
      }
    }
  }
  const dark = () => hourIs('night') || hourIs('dusk');

  /* ================= STARYU ================= */
  const SHORE = { x0: 930, x1: 1070 }, SHALLOW = { x0: 1150, x1: 1380 }, POOL = { x0: 4400, x1: 4565 };
  class StaryuM extends Mons.Mon {
    constructor(x, home) {
      super(sp('Staryu'), { kind: 'staryu', dex: 'staryu', x, y: gy(x), yaw: Math.PI / 2, z: 1.8, scale: 0.36, qPose: 0.06, qFields: { spin: 0.2, glow: 0.2, bend: 0.25 }, persona: 'shy', mode: 'land' });
      this.homeZone = home; this.spinA = rnd(0, 6); this.glowK = 0; this.senseR = 70; this.noShadow = false;
      this.slot = (StaryuM.n = (StaryuM.n || 0) + 1) * 0.37 % 1; // each keeps its own spot on the sand
    }
    animate(dt, t) {
      const flash = dark() ? Math.max(0, Math.sin(t * 2.2 + this.seed * 3)) ** 6 : 0;
      this.glowK = this.o.glow != null ? Math.max(0.1, this.o.glow) : 0.15 + flash * 0.85;
      const P = { spin: this.spinA, glow: this.glowK, bend: Math.sin(t * 0.8 + this.seed) * 0.08, eyes: 'open' };
      Object.assign(P, this.o); P.glow = this.glowK; this.pose = P;
    }
    brain() { return this.life(); }
    zone() { return this.homeZone === 'pool' ? POOL : dark() ? SHORE : SHALLOW; }
    *life() {
      yield* wait(rnd(0.3, 2));
      for (;;) {
        const Z = this.zone();
        if (this.x < Z.x0 - 4 || this.x > Z.x1 + 4) { yield* this.roll(lerp(Z.x0 + 12, Z.x1 - 12, this.slot), 60); continue; }
        if (dark() && this.homeZone !== 'pool') { yield* this.twinkle(rnd(4, 8)); continue; }
        const r = Math.random();
        if (r < 0.4) yield* this.roll(rnd(Z.x0 + 10, Z.x1 - 10), 50);
        else yield* hold(this, rnd(2, 5), 'rest', 0.3);
      }
    }
    // cartwheel along the ground like a wheel
    *roll(tx, speed) {
      const d = Math.sign(tx - this.x) || 1;
      for (let g = 0; g < 900 && Math.abs(tx - this.x) > 2; g++) {
        const dt = yield;
        const s = Math.min(Math.abs(tx - this.x), speed * dt);
        this.x += d * s; this.spinA -= d * s / 11; this.moving = speed;
        this.setAct('spin', 0.8);
        if (!World.isWet(this.x, 4) && Math.random() < dt * 8) FX.add({ type: 'dust', x: this.x, y: this.y - 1, vx: -d * 16, vy: -6, r: 2, life: 0.35, c: 0xffe8d8b0, c2: 0xffc8b088, layer: 2 });
        else if (World.isWet(this.x, 4) && Math.random() < dt * 4) FX.bubbles(this.x, this.y - 10, 1, surf(this.x));
      }
    }
    *twinkle(T) {
      let e = 0;
      while (e < T && dark()) {
        const dt = yield; e += dt;
        if (S.starSync > 0) { const b = Math.max(0, Math.sin(Game.t * Math.PI * 2 * 1.1)) ** 4; this.o.glow = b; this.setAct('starry', b > 0.5 ? 1 : 0.7); }
        else { this.o.glow = undefined; this.setAct(this.glowK > 0.6 ? 'twinkle' : 'rest', this.glowK > 0.6 ? 1 : 0.4); }
      }
      this.o.glow = undefined;
    }
    onWater() { this.emote('note', 0.8); this.doTask(this.spinInPlace(), 3); }
    *spinInPlace() { let e = 0; while (e < 1.4) { const dt = yield; e += dt; this.spinA += dt * 12; this.o.glow = 0.8; this.setAct('spin', 1); } this.o.glow = undefined; }
    onPoke() { const Z = this.zone(); this.emote('sweat', 0.7); this.doTask(this.roll(clamp(this.x + (this.x < mk().x ? -70 : 70), Z.x0 + 6, Z.x1 - 6), 90), 3); }
    onNotice(m) { this.lastReact = Game.t; if (!dark()) { const Z = this.zone(); this.doTask(this.roll(clamp(this.x + (this.x < m.x ? -60 : 60), Z.x0 + 6, Z.x1 - 6), 80), 3); } }
    drawExtra(fb, cx, cy, P, t) {
      if (!this.spr || this.glowK < 0.3) return;
      const [x, y] = this.center();
      glowAt(fb, cx, cy, x, y, 7 + this.glowK * 9, 0xff8ad8ff, 0.35 + this.glowK * 0.4);
    }
  }

  /* ================= TENTACOOL ================= */
  const BEACHED_X = 1046;
  class TentacoolM extends Swimmer {
    constructor(x, y, beached = false) {
      super(sp('Tentacool'), { kind: 'tentacool', dex: 'tentacool', x, y, yaw: Math.PI / 2 + rnd(-0.4, 0.4), z: 1.5, scale: 0.34, qPose: 0.06, qFields: { pulse: 0.5, gem: 0.25, drift: 0.2 }, persona: 'shy', speed: 20, box: { x0: 1450, x1: 2650, y0: SEA + 14, y1: SEA + 110 } });
      this.swimTop = 8; this.pulseA = rnd(0, 6); this.beached = beached; this.wet = 0; this.senseR = 80;
      if (beached) { this.mode = 'land'; this.y = gy(x); }
    }
    physics(dt, t) { if (this.mode === 'land') { this.y = gy(this.x); return; } super.physics(dt, t); }
    animate(dt, t) {
      if (!this.beached) this.pulseA += dt * (this.moving > 18 ? 3.4 : 1.6);
      const gem = hourIs('noon', 'afternoon') && this.y < surf(this.x) + 26 ? Math.max(0, Math.sin(t * 3 + this.seed)) ** 8 : 0;
      const P = { pulse: this.beached ? 0.3 + this.wet * 0.2 * Math.sin(t * 6) : this.pulseA, gem, drift: Math.sin(t * 0.9 + this.seed) * 0.5, eyes: this.beached && this.wet < 0.3 ? 'closed' : this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o); this.pose = P;
      this.gemK = gem;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.2, 2));
      for (;;) {
        if (this.beached) { yield* hold(this, 1, 'beached', 0.4); continue; }
        const r = Math.random();
        if (r < 0.35) yield* this.jet();
        else if (r < 0.55 && hourIs('noon', 'afternoon')) yield* this.bask();
        else yield* this.driftAbout(rnd(4, 7));
      }
    }
    // gentle drift, sinking slowly between pulses
    *driftAbout(T) {
      const [tx, ty] = this.spot(); let e = 0;
      while (e < T) { const dt = yield; e += dt; this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 8 * dt); this.y += (Math.sin(this.pulseA) > 0.6 ? -14 : 5) * dt; this.moving = 10; this.setAct('drift', 0.3); if (this.y > ty + 30) break; }
    }
    // a few strong pulses upward
    *jet() {
      let e = 0; const d = chance(0.5) ? 1 : -1;
      while (e < 3) { const dt = yield; e += dt; const push = Math.max(0, Math.sin(e * 5.5)); this.y -= push * 38 * dt; this.x += d * push * 10 * dt; this.moving = 30; this.pulseA += dt * 2; this.setAct('pulse', push > 0.5 ? 0.9 : 0.5); }
    }
    // float at the surface soaking up the sun; gems glint
    *bask() {
      yield* this.swimTo(this.x + rnd(-40, 40), surf(this.x) + 12, 24, 8);
      let e = 0; const T = rnd(5, 9);
      while (e < T) { const dt = yield; e += dt; this.y = surf(this.x) + 12 + Math.sin(e * 2) * 2; this.setAct(this.gemK > 0.4 ? 'glint' : 'drift', this.gemK > 0.4 ? 1 : 0.4); if (this.gemK > 0.6 && Math.random() < dt * 6) FX.add({ type: 'spark', x: this.x + rnd(-4, 4), y: this.y - 14, size: 1, life: 0.5, c: 0xffffffff, c2: hex('#ff9a9a'), layer: 3 }); }
    }
    onWater() {
      if (!this.beached) { this.emote('note', 0.6); return; }
      this.wet = Math.min(1, this.wet + 0.34); this.emote('sweat', 0.6);
      FX.sparkles(this.x, this.y - 8, 6, 10, 0xffffffff, hex('#bfefff'));
      if (this.wet >= 1) this.doTask(this.goHome(), 6);
      else HUD.toast(this.wet < 0.5 ? 'The stranded Tentacool stirs a little... more water!' : 'Almost! It is starting to wriggle...', { life: 1.8 });
    }
    *goHome() {
      this.emote('heart', 1.4); HUD.toast('Tentacool wriggles back toward the sea!', { life: 2.2 });
      let e = 0;
      while (!World.isWet(this.x, 10) && e < 20) { const dt = yield; e += dt; this.x += 18 * dt; this.pulseA += dt * 5; this.o.pulse = this.pulseA; this.moving = 12; this.setAct('rescue', 1); }
      this.beached = false; this.mode = 'swim'; FX.splashAt(this.x, surf(this.x), { power: 0.5 }); Game.sfx('splash', this.x, 0.6);
      yield* this.swimTo(this.x + 80, SEA + 40, 30, 5);
      e = 0; while (e < 3) { const dt = yield; e += dt; this.pulseA += dt * 4; this.setAct('rescue', 1); }
      Save.addPoints(150);
      if (Save.discover('tentacool.rescue')) HUD.toast('Tentacool is home! It waves its tentacles in thanks. (+150)', { life: 2.8 });
      this.o = {};
    }
    onPoke() { if (this.beached) { HUD.toast('This Tentacool has washed up and dried out. It needs water!', { life: 2.2 }); return; } this.emote('sweat', 0.6); this.doTask(this.jet(), 3); }
    onNotice(m) { this.lastReact = Game.t; if (this.beached) return; super.onNotice(m); }
    drawExtra(fb, cx, cy, P, t) { if (this.spr && this.gemK > 0.5) { const [x, y] = this.at('top'); glowAt(fb, cx, cy, x, y + 3, 5, 0xffffc0c0, this.gemK * 0.6); } }
  }

  /* ================= CHINCHOU ================= */
  const TRENCH = { x0: 2770, x1: 3130, y0: 800, y1: 935 };
  class ChinchouM extends Swimmer {
    constructor(x, y) {
      super(sp('Chinchou'), { kind: 'chinchou', dex: 'chinchou', x, y, yaw: Math.PI / 2 + rnd(-0.6, 0.6), z: 1.4, scale: 0.36, qPose: 0.06, qFields: { swim: 0.5, glow: 0.15, fins: 0.25, mouth: 0.25 }, persona: 'curious', speed: 30, box: TRENCH });
      this.swimTop = 20; this.swimBot = 6; this.glowK = 0.4; this.senseR = 120;
    }
    animate(dt, t) {
      if (this.flashT > 0) { this.flashT -= dt; this.o.glow = 1; }
      const base = (dark() ? 0.75 : 0.35) + (this.y > 860 ? 0.15 : 0);
      this.glowK = clamp(this.o.glow ?? base + Math.sin(t * 1.5 + this.seed) * 0.08, 0, 1);
      const P = { swim: t * 3 + this.seed, glow: this.glowK, fins: Math.sin(t * 4 + this.seed) * 0.5, mouth: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      Object.assign(P, this.o); P.glow = this.glowK; this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.5, 2));
      for (;;) {
        const m = mk();
        if (dark() && m && m.mode === 'swim' && m.x > TRENCH.x0 - 40 && m.x < TRENCH.x1 + 40 && m.y > 780) { yield* this.escort(m); continue; }
        const pal = Mons.all.find((q) => q !== this && q.kind === 'chinchou' && Math.hypot(q.x - this.x, q.y - this.y) < 110);
        if (pal && chance(0.35) && !pal.busy(2)) { pal.doTask(pal.signal(this, 0.45), 2); yield* this.signal(pal, 0); continue; }
        yield* this.cruise(rnd(4, 8), dark() ? 'glow' : 'swim');
      }
    }
    // flash back and forth with a friend
    *signal(q, ph) {
      yield* this.swimTo(q.x + (this.x < q.x ? -34 : 34), q.y + rnd(-10, 10), 30, 3);
      yield* this.faceTo(q.x > this.x ? 1 : -1, true);
      let e = 0;
      while (e < 4.5) { const dt = yield; e += dt; const on = Math.sin((e + ph) * Math.PI * 2 * 0.9) > 0.3; this.o.glow = on ? 1 : 0.1; this.setAct('signal', on ? 1 : 0.6); }
      this.o.glow = undefined;
    }
    // at night they gather around Mudkip and light the trench
    *escort(m) {
      const i = Mons.all.filter((q) => q.kind === 'chinchou').indexOf(this);
      if (!S.escortSaid) { S.escortSaid = true; HUD.toast('Little lights gather around Mudkip... the Chinchou are lighting the way!', { life: 2.8 }); Save.discover('chinchou.escort'); }
      let e = 0;
      while (e < 14 && m.mode === 'swim' && m.y > 760) {
        const dt = yield; e += dt;
        const a = Game.t * 0.9 + i * 2.1, tx = m.x + Math.cos(a) * 34, ty = m.y - 6 + Math.sin(a) * 18;
        this.x = lerp(this.x, tx, dt * 1.6); this.y = lerp(this.y, ty, dt * 1.6); this.moving = 30;
        if (Math.abs(tx - this.x) > 3) this.turn(this.face(Math.sign(tx - this.x), true), dt, 4);
        this.o.glow = 1; this.setAct('escort', 1);
      }
      this.o.glow = undefined;
    }
    onPoke() { this.emote('note', 0.8); this.flashT = 0.7; }
    drawExtra(fb, cx, cy, P, t) {
      if (!this.spr || this.glowK < 0.25) return;
      for (const n of ['lureN', 'lureF']) { const [x, y] = this.at(n); glowAt(fb, cx, cy, x, y, 4 + this.glowK * 10, 0xfffff0a0, 0.25 + this.glowK * 0.45); }
    }
  }

  /* ================= CARVANHA ================= */
  const REEF = { x0: 1440, x1: 1900, y0: SEA + 50, y1: SEA + 170 };
  class CarvanhaM extends Swimmer {
    constructor(i, x, y) {
      super(sp('Carvanha'), { kind: 'carvanha', dex: 'carvanha', x, y, yaw: 0.4, z: 1.5, scale: 0.34, qPose: 0.06, qFields: { swim: 0.5, bite: 0.25, fins: 0.25, lunge: 0.25 }, persona: 'grumpy', speed: 55, box: REEF });
      this.i = i; this.swimTop = 22; this.swimBot = 10; this.senseR = 120; this.chargeT = 0;
    }
    animate(dt, t) {
      const P = { swim: t * (this.moving > 60 ? 9 : 5) + this.seed, bite: Math.max(0, Math.sin(t * 2 + this.seed)) ** 10 * 0.4, fins: Math.sin(t * 3 + this.seed) * 0.4, eyes: this.blink(t, dt) ? 'blink' : 'open', lunge: 0 };
      Object.assign(P, this.o); this.pose = P;
    }
    get lead() { return S.carvanha && S.carvanha[0]; }
    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.2, 1));
      for (;;) {
        const m = mk();
        if (m && m.mode === 'swim' && Game.t > (S.carvCool || 0) && Math.abs(m.x - this.x) < 120 && Math.abs(m.y - this.y) < 90 && m.x > REEF.x0 - 60 && m.x < REEF.x1 + 60) { yield* this.charge(m); continue; }
        const L = this.lead;
        if (L && L !== this && L.alive) yield* this.follow(L, rnd(3, 5));
        else yield* this.cruise(rnd(4, 7), 'patrol');
      }
    }
    // keep formation behind the leader
    *follow(L, T) {
      let e = 0; const ox = this.i === 1 ? -26 : -44, oy = this.i === 1 ? -12 : 14;
      while (e < T) {
        const dt = yield; e += dt;
        const d = Math.cos(L.yaw) >= 0 ? 1 : -1, tx = L.x + ox * d, ty = L.y + oy;
        this.vx = lerp(this.vx, (tx - this.x) * 2.2, dt * 3); this.vy = lerp(this.vy, (ty - this.y) * 2.2, dt * 3);
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = Math.hypot(this.vx, this.vy);
        if (Math.abs(this.vx) > 6) this.turn(this.face(Math.sign(this.vx), true), dt, 5);
        this.setAct('patrol', 0.5);
        if (S.frenzy) break;
      }
    }
    // charge the intruder: lunge and snap, knocking Mudkip back
    *charge(m) {
      this.emote('anger', 0.8);
      let e = 0, hit = false;
      while (e < 1.6) {
        const dt = yield; e += dt;
        const dx = m.x - this.x, dy = m.y - 8 - this.y, d = Math.hypot(dx, dy) || 1;
        const sp2 = e < 0.35 ? 20 : 190;
        this.vx = lerp(this.vx, dx / d * sp2, dt * 6); this.vy = lerp(this.vy, dy / d * sp2, dt * 6);
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = sp2;
        if (Math.abs(this.vx) > 6) this.turn(this.face(Math.sign(this.vx), true), dt, 8);
        this.o.lunge = e < 0.35 ? -0.3 : 1; this.o.bite = e > 0.35 ? Math.abs(Math.sin(e * 16)) : 0;
        this.setAct('charge', e > 0.35 ? 1 : 0.6);
        if (!hit && d < 16 && m.mode === 'swim') {
          hit = true; Game.sfx('clink', this.x, 0.8);
          m.vx = Math.sign(m.x - this.x || 1) * 230; m.vy = -60; m.target = null; m.happyT = 0;
          FX.bubbles(m.x, m.y - 8, 8, surf(m.x));
          if (Game.t > (S.biteSaid || 0)) { S.biteSaid = Game.t + 30; HUD.toast('Chomp! The Carvanha chase Mudkip out of their reef.', { life: 2.2 }); }
          S.carvCool = Game.t + 5;
          break;
        }
      }
      this.o.lunge = 0; this.o.bite = 0;
      yield* this.swimTo(clamp(this.x + (this.x < m.x ? -80 : 80), REEF.x0, REEF.x1), this.y, 50, 2);
    }
    onFood(it) {
      if (World.waterAt(it.x) === null || Math.abs(it.x - this.x) > 360 || it.x < REEF.x0 - 250 || it.x > REEF.x1 + 250) return false;
      for (const q of S.carvanha || []) if (q && q.alive) q.doTask(q.frenzy(it), 4);
      return true;
    }
    *frenzy(it) {
      S.frenzy = true;
      let e = 0;
      while (e < 6 && !it.eaten) {
        const dt = yield; e += dt;
        const tx = it.x + Math.cos(e * 7 + this.i * 2) * 10, ty = surf(it.x) + 10 + Math.sin(e * 9 + this.i) * 5;
        this.vx = lerp(this.vx, (tx - this.x) * 3, dt * 5); this.vy = lerp(this.vy, (ty - this.y) * 3, dt * 5);
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = 120;
        if (Math.abs(this.vx) > 6) this.turn(this.face(Math.sign(this.vx), true), dt, 9);
        const near = Math.hypot(it.x - this.x, it.y - this.y) < 26;
        this.o.bite = near ? Math.abs(Math.sin(e * 18)) : 0.3; this.o.lunge = near ? 0.6 : 0.2;
        this.setAct(near ? 'frenzy' : 'charge', near ? 1 : 0.7);
        if (near && Math.random() < dt * 12) FX.splashAt(this.x + rnd(-6, 6), surf(this.x), { power: 0.25, n: 3 });
        if (near && e > 2.2 && !it.eaten) { Items.eat(it); Game.sfx('clink', this.x, 0.7); }
      }
      e = 0; while (e < 1.2) { const dt = yield; e += dt; this.o.bite = Math.abs(Math.sin(e * 14)) * 0.6; this.setAct('frenzy', 0.8); }
      this.o.bite = 0; this.o.lunge = 0; S.frenzy = false;
      yield* this.swimTo(rnd(REEF.x0, REEF.x1), rnd(REEF.y0, REEF.y1), 50, 4);
    }
    onPoke() { this.annoy += 0.5; this.emote('anger', 0.8); }
  }

  /* ================= hooks ================= */
  function spawn(A, G) {
    S = { leapReq: null, starSync: 0, carvanha: [], frenzy: false, escortSaid: false };
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Wailmer')) { S.wailmer = [add(new WailmerM(2300)), add(new WailmerM(2800))]; }
    if (sp('Clamperl')) { add(new ClamperlM(2250)); add(new ClamperlM(2430)); add(new ClamperlM(2690)); }
    if (sp('Relicanth')) add(new RelicanthM());
    if (sp('Staryu')) { add(new StaryuM(1200, 'shore')); add(new StaryuM(1270, 'shore')); add(new StaryuM(1340, 'shore')); add(new StaryuM(4470, 'pool')); }
    if (sp('Tentacool')) {
      for (const [x, y] of [[1560, SEA + 40], [1720, SEA + 70], [2140, SEA + 30], [2480, SEA + 60]]) add(new TentacoolM(x, y));
      if (!Save.found('tentacool.rescue')) add(new TentacoolM(BEACHED_X, gy(BEACHED_X), true));
    }
    if (sp('Chinchou')) { add(new ChinchouM(2860, 880)); add(new ChinchouM(2960, 905)); add(new ChinchouM(3060, 870)); }
    if (sp('Carvanha')) S.carvanha = [add(new CarvanhaM(0, 1650, SEA + 110)), add(new CarvanhaM(1, 1620, SEA + 100)), add(new CarvanhaM(2, 1600, SEA + 124))];
  }
  function update(A, dt, t, G) { S.starSync = Math.max(0, (S.starSync || 0) - dt); }
  // a song at the end of the dock in daylight: a Wailmer leaps. At night on the shore, the Staryu flash in time
  function song(x) {
    const m = Game.mudkip;
    if (!hourIs('dusk', 'night') && m && m.plat && m.x > 1700 && S.wailmer && S.wailmer.length) { S.leapReq = pick(S.wailmer.filter(Boolean)); HUD.toast('A big splash is coming...', { life: 2 }); }
    if (dark() && m && m.x > 700 && m.x < 1500 && Mons.all.some((q) => q.kind === 'staryu' && Math.abs(q.x - m.x) < 400)) {
      S.starSync = 12;
      if (Save.discover('staryu.stars')) HUD.toast('The Staryu flash in time with the music... the shore is full of stars!', { life: 3 });
    }
  }
  return { spawn, update, song, get S() { return S; }, classes: { WailmerM, ClamperlM, RelicanthM, StaryuM, TentacoolM, ChinchouM, CarvanhaM } };
})();
