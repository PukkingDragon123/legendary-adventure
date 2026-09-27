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
      super(sp('Wailmer'), { kind: 'wailmer', dex: 'wailmer', x, y: SEA + 90, yaw: 0.6, z: 1.3, scale: 0.26, qPose: 0.06, qFields: { swim: 0.5, puff: 0.2, blow: 0.25, mouth: 0.25, roll: 0.25 }, persona: 'curious', speed: 30, box: { x0: 2050, x1: 3150, y0: SEA + 40, y1: SEA + 220 } });
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
      super(sp('Clamperl'), { kind: 'clamperl', dex: 'clamperl', x, y: gy(x), yaw: 1.3, z: 1.6, scale: 0.44, qPose: 0.06, qFields: { open: 0.2, pearl: 0.25, mouth: 0.25 }, persona: 'shy', mode: 'rooted' });
      this.noShadow = true; this.senseR = 70; this.alert = 1.4; this.openK = 0;
    }
    physics() { this.y = gy(this.x); }
    animate(dt, t) { const P = { open: this.openK, pearl: hourIs('night') ? 0.7 + 0.3 * Math.sin(t * 2) : 0.2, eyes: this.blink(t, dt) ? 'blink' : 'open', mouth: 0 }; Object.assign(P, this.o); this.pose = P; if (hourIs('night') && this.openK > 0.5) this.glowOn = true; else this.glowOn = false; }
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
      yield* until(() => it.eaten || it.y > this.y - 30, 6);
      let e = 0;
      while (e < 1.4) { const dt = yield; e += dt; this.openK = e < 0.3 ? e / 0.3 : e < 0.5 ? 0 : 0; this.setAct('feed', e > 0.25 && e < 0.6 ? 1 : 0.6); if (e > 0.35 && !it.eaten) { Items.eat(it); Game.sfx('clink', this.x, 0.6); FX.bubbles(this.x, this.y - 8, 4, SEA); } }
      this.emote('heart');
    }
    onPoke() { this.openK = 0; this.emote('sweat', 0.8); this.doTask(hold(this, 3, 'rest', 0.3), 3); }
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

  /* ================= hooks ================= */
  function spawn(A, G) {
    S = { leapReq: null };
    const add = (m) => { if (m && m.sp) G.addMon(m); return m; };
    if (sp('Wailmer')) { S.wailmer = [add(new WailmerM(2300)), add(new WailmerM(2800))]; }
    if (sp('Clamperl')) { add(new ClamperlM(2250)); add(new ClamperlM(2430)); add(new ClamperlM(2690)); }
    if (sp('Relicanth')) add(new RelicanthM());
  }
  function update(A, dt, t, G) {}
  // a song at the end of the dock in daylight: a Wailmer leaps
  function song(x) {
    const m = Game.mudkip;
    if (!hourIs('dusk', 'night') && m && m.plat && m.x > 1700 && S.wailmer && S.wailmer.length) { S.leapReq = pick(S.wailmer.filter(Boolean)); HUD.toast('A big splash is coming...', { life: 2 }); }
  }
  return { spawn, update, song, get S() { return S; }, classes: { WailmerM, ClamperlM, RelicanthM } };
})();
