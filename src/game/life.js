/* ------------------------------------------------------------------
   Life — behaviours. Every creature runs a "brain": a generator that
   yields once per frame (receiving dt), so multi-step antics read like
   little scripts. Interrupts (pokes, bonks, being carried) swap in a
   higher-priority task; when it finishes the brain starts over.
------------------------------------------------------------------- */
const Life = (() => {
  const { clamp, lerp } = Scenery;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const gy = (x) => World.groundAt(x);
  const sy = (x) => WorldRender.surfaceAt(x, Game.t);
  const depthAt = (x) => World.groundAt(x) - sy(x);
  const wet = (x, pad = 14) => depthAt(x) > pad;
  const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* ---- tasks ---- */
  class Task {
    constructor(g, prio = 0) { this.g = g; this.prio = prio; this.done = false; }
    step(dt) { if (this.done) return; try { if (this.g.next(dt).done) this.done = true; } catch (e) { console.error(e); this.done = true; } }
  }
  function* wait(s) { while (s > 0) s -= yield; }
  function* until(cond, max = 1e9) { while (!cond() && max > 0) max -= yield; }
  function* both(...gs) {
    const ts = gs.map((g) => new Task(g));
    for (;;) { const dt = yield; let all = true; for (const t of ts) { t.step(dt); if (!t.done) all = false; } if (all) return; }
  }

  /* ---- base creature ---- */
  class Mon extends Critters.Critter {
    constructor(sp, o) {
      super(sp, o);
      this.task = null; this.o = {}; this.seed = Math.random() * 100;
      this.gait = 0; this.moving = 0; this.phase = 0;
      this.air = 0; this.vair = 0; this.mode = 'land';
      this.solid = o.solid ?? true;
      this.sleeping = false;
      this.alive = true;
    }
    brain() { return (function* () { for (;;) yield; })(); }
    doTask(g, prio = 1) {
      if (this.task && !this.task.done && this.task.prio > prio) return false;
      this.task = new Task(g, prio);
      return true;
    }
    busy(prio = 1) { return this.task && !this.task.done && this.task.prio >= prio; }
    update(dt, t) {
      this.st += dt; this.o = {}; this.moving = 0;
      if (!this.task || this.task.done) this.task = new Task(this.brain(), 0);
      this.task.step(dt);
      this.physics(dt, t);
      this.animate(dt, t);
    }
    physics() {}
    animate() {}
    onPoke() {}
    onBonk() {}
    onBall() { return false; }
    headPt() { return this.at('top'); }
    emote(icon, life = 1.5) { return FX.emote(icon, () => this.headPt(), { life }); }
    // walk along the ground toward tx
    *walkTo(tx, speed = 60, o = {}) {
      tx = clamp(tx, o.min ?? 30, o.max ?? World.W - 30);
      for (let guard = 0; guard < 4000; guard++) {
        const dt = yield;
        const dx = tx - this.x;
        if (Math.abs(dx) < 2.5) break;
        const d = Math.sign(dx);
        this.turn(o.yaw ? o.yaw(d) : this.face(d), dt, o.turn ?? 8);
        if (o.sideways || Math.sign(Math.cos(this.yaw)) === d) {
          this.x += d * Math.min(Math.abs(dx), speed * dt);
          this.moving = speed;
        }
        if (o.stop && o.stop()) break;
      }
    }
    *faceTo(d, walk = false) { for (let i = 0; i < 200; i++) { const dt = yield; if (this.turn(this.face(d, walk), dt)) break; } }
    *hop(v = 220) { this.vair = v; this.air = Math.max(this.air, 0.5); yield* until(() => this.air <= 0 && this.vair === 0, 3); }
  }

  /* ---- coconuts ---- */
  const Nuts = {
    list() { return Scene.S.coconuts; },
    free(c) { return c.state === 'ground' && !c.claim; },
    near(x, maxD, f = () => true) {
      let best = null, bd = maxD;
      for (const c of Scene.S.coconuts) {
        if (!f(c)) continue;
        const d = Math.abs(c.x - x);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    drop(c, vx = 0) {
      if (c.state !== 'tree') return;
      c.state = 'fall'; c.vx = vx + rnd(-20, 20); c.vy = rnd(-20, 10); c.w = rnd(-4, 4);
      Game.sfx('rustle', c.x, 0.8);
    },
    shakePalm(p, n = 1) {
      p.shake = 1;
      const on = Scene.S.coconuts.filter((c) => c.palm === p && c.state === 'tree');
      for (let i = 0; i < n && on.length; i++) Nuts.drop(on.splice(Math.floor(Math.random() * on.length), 1)[0], rnd(-30, 30));
      // a few loose leaf bits
      const pal = Game.pal();
      for (let i = 0; i < 6; i++) FX.add({ type: 'confetti', x: p.gx + p.m.crownX - p.m.bx + rnd(-60, 60), y: p.gy + p.m.crownY - p.m.by + rnd(-10, 30), vx: rnd(-40, 40), vy: rnd(-30, 10), g: 60, drag: 0.5, life: 2 + Math.random(), c: pal.palm.leaf[2 + (i & 1)], ph: Math.random() * 6, layer: 2 });
      Game.sfx('rustle', p.gx, 1);
    },
    crack(c, by) {
      if (c.cracked || c.state === 'gone') return;
      c.cracked = true; c.bites = 0; c.halfOff = 0; c.meat = 6;
      if (c.state === 'float' || c.state === 'held' || c.state === 'fall') c.state = c.state === 'held' ? 'ground' : c.state;
      FX.bonk(c.x, c.y - 4, 10);
      const pal = Game.pal();
      for (let i = 0; i < 10; i++) FX.add({ type: 'drop', x: c.x, y: c.y - 3, vx: rnd(-90, 90), vy: rnd(-160, -60), g: 500, life: 1.2, c: i % 3 ? PX.hex('#fbf6e6') : pal.palm.nut[1], size: 1, floor: c.y + 4, layer: 2 });
      for (let i = 0; i < 6; i++) FX.add({ type: 'drop', x: c.x, y: c.y - 5, vx: rnd(-50, 50), vy: rnd(-120, -40), g: 420, life: 1, c: PX.hex('#e8f8ff'), c2: PX.hex('#bfe8ff'), size: 2, floor: c.y + 3, layer: 2 });
      Game.sfx('crack', c.x, 1);
    },
    bite(c) {
      if (!c.cracked) return false;
      c.bites++;
      for (let i = 0; i < 3; i++) FX.add({ type: 'drop', x: c.x + rnd(-6, 6), y: c.y - 4, vx: rnd(-40, 40), vy: rnd(-90, -30), g: 400, life: 0.8, c: PX.hex('#fbf6e6'), size: 1, floor: c.y + 5, layer: 2 });
      Game.sfx('munch', c.x, 0.7);
      if (c.bites >= 6) { c.state = 'fade'; c.fade = 1.2; }
      return true;
    },
    update(dt, t) {
      const mons = Game.mons;
      for (const c of Scene.S.coconuts) {
        switch (c.state) {
          case 'tree': {
            const p = c.palm;
            c.x = p.gx + c.slot.dx + Math.sin(p.shake * 40) * p.shake * 9;
            c.y = p.gy + c.slot.dy + 4 + Math.sin(t * 2.4 + p.seed) * 1;
            if (c.regrow > 0) { c.regrow -= dt; }
            break;
          }
          case 'fall': case 'ground': {
            const g0 = gy(c.x);
            if (c.state === 'fall') {
              c.vy += 760 * dt;
              // someone who juggles might catch it on their nose
              let caught = false;
              if (c.vy > 60) for (const m of mons) if (m.catchNut && m.catchNut(c)) { caught = true; break; }
              if (caught) break;
              // bonk heads on the way down
              if (c.vy > 120) for (const m of mons) {
                if (!m.solid || !m.visible || m.mode === 'dive' || m === c.bonked) continue;
                const hp = m.headPt();
                if (Math.abs(hp[0] - c.x) < 14 + m.width() * 0.12 && c.y > hp[1] - 10 && c.y < hp[1] + 14) {
                  c.bonked = m; c.vy = -rnd(160, 220); c.vx = (c.x < m.x ? -1 : 1) * rnd(50, 90); c.w = c.vx * 0.1;
                  FX.bonk(c.x, hp[1] - 2, 10);
                  Game.sfx('bonk', c.x, 1);
                  m.onBonk(c);
                  break;
                }
              }
            } else {
              c.vx += World.slopeAt(c.x) * 80 * dt;
              c.vx *= Math.pow(0.25, dt);
              if (Math.abs(c.vx) < 1.5) c.vx = 0;
            }
            c.x += c.vx * dt; c.y += c.vy * dt;
            c.rot += (c.vx / c.r) * dt;
            if (c.x < 10) { c.x = 10; c.vx = Math.abs(c.vx); }
            const g = gy(c.x);
            const s = sy(c.x);
            if (g > s + 6 && c.y > s) {
              // into the sea
              if (c.vy > 100) FX.splashAt(c.x, s, { power: 0.55, n: 10 });
              if (c.vy > 100) Game.sfx('plop', c.x, 0.8);
              c.state = 'float'; c.vy *= 0.2;
              break;
            }
            if (c.y + c.r > g) {
              c.y = g - c.r;
              if (c.vy > 140) {
                FX.poof(c.x, g, Game.pal().sand[3], Game.pal().sand[2], 4, 4);
                Game.sfx('thud', c.x, Math.min(1, c.vy / 500));
                c.vy = -c.vy * 0.32; c.vx += World.slopeAt(c.x) * 20;
              } else { c.vy = 0; c.state = 'ground'; c.bonked = null; }
            }
            break;
          }
          case 'float': {
            const s = sy(c.x);
            const target = s - c.r * 0.35 + Math.sin(t * 2 + c.k) * 1.2;
            c.vy += (target - c.y) * 30 * dt; c.vy *= Math.pow(0.05, dt);
            c.vx = lerp(c.vx, (World.shoreX + 30 - c.x > 0 ? 8 : -8), dt * 0.5);
            c.x += c.vx * dt; c.y += c.vy * dt; c.rot += Math.sin(t + c.k) * dt * 0.5;
            if (!wet(c.x, 5)) { c.state = 'ground'; c.vy = 0; }
            break;
          }
          case 'held': {
            const h = c.holder;
            if (!h || !h.holdPt) { c.state = 'fall'; break; }
            const p = h.holdPt(c);
            c.x = p[0]; c.y = p[1]; c.vx = c.vy = 0;
            break;
          }
          case 'fade': {
            c.fade -= dt;
            if (c.fade <= 0) { c.state = 'gone'; c.regrow = rnd(14, 26); }
            break;
          }
          case 'gone': {
            c.regrow -= dt;
            if (c.regrow <= 0) {
              // a new nut grows back on its palm
              Object.assign(c, { state: 'tree', cracked: false, bites: 0, halfOff: 0, vx: 0, vy: 0, rot: 0, claim: null, holder: null, bonked: null, meat: 0 });
              FX.sparkles(c.palm.gx + c.slot.dx, c.palm.gy + c.slot.dy + 4, 4, 14);
            }
            break;
          }
        }
        if (c.cracked && c.halfOff < 5) c.halfOff = Math.min(5, c.halfOff + dt * 20);
      }
    },
  };

  /* ---- shiny Mudkip palette: lavender body, same orange gills ---- */
  const SHINY = (() => {
    const out = {};
    const M = Mudkip.MAT;
    for (const k in Mudkip.PAL) {
      const e = Mudkip.PAL[k];
      const shift = +k === M.BODY || +k === M.FIN || +k === M.FINEDGE || +k === M.TAIL;
      const belly = +k === M.BELLY;
      const f = (c) => {
        if (!shift && !belly) return c;
        const [r, g, b] = PX.rgbOf(c);
        const [h, s, l] = PX.rgb2hsl(r, g, b);
        const [R, G, B] = PX.hsl2rgb(shift ? 0.74 : 0.7, shift ? s * 0.62 : s * 0.3, shift ? l * 0.98 + 0.02 : l);
        return PX.pack(R, G, B);
      };
      out[k] = { r: e.r.map(f), od: f(e.od), ol: f(e.ol), ln: f(e.ln) };
    }
    return out;
  })();

  /* ================================================================
     MUDKIP — the star
  ================================================================ */
  class MudkipMon extends Mon {
    constructor(o) {
      super(Mudkip, { kind: o.shiny ? 'mudkip-shiny' : 'mudkip', pal: o.shiny ? SHINY : Mudkip.PAL, x: o.x, y: gy(o.x), yaw: 1.1, qYaw: 0.035, qPose: 0.04, qFields: { mouth: 0.1, bodyDip: 0.5, legF: 0.08, legB: 0.08, squash: 0.02, legSplay: 0.06, tailWag: 0.05, look: 0.05 }, z: 3 });
      this.shiny = !!o.shiny;
      this.sq = new Spring(300, 13); this.finS = new Spring(120, 6.5); this.tailS = new Spring(80, 5);
      this.dizzy = 0; this.happyT = 0; this.surprise = 0;
      this.pokes = [];
    }
    headPt() { return this.at('headTop', 0, -2); }
    holdPt() { return this.at('mouth', this.dir * 4, -2); }
    get inWater() { return this.mode === 'swim' || this.mode === 'dive'; }

    physics(dt, t) {
      const x = this.x;
      if (this.mode === 'land') {
        if (wet(x, 16) && this.air <= 0) {
          this.mode = 'swim';
          if (this.moving > 0) FX.splashAt(x, sy(x), { power: 0.4, n: 8 });
          Game.sfx('splash', x, 0.4);
        }
        if (this.air > 0 || this.vair !== 0) {
          this.vair -= 900 * dt; this.air += this.vair * dt;
          if (this.air <= 0) {
            this.air = 0;
            if (this.vair < -140) { this.sq.kick(-this.vair * 0.004); Game.sfx('pat', x, 0.4); FX.poof(x, gy(x), Game.pal().sand[3], Game.pal().sand[2], 3, 3); }
            this.vair = 0;
          }
        }
        this.y = gy(this.x) - this.air;
      } else if (this.mode === 'swim') {
        if (!wet(x, 12) && this.air <= 0) { this.mode = 'land'; this.y = Math.min(this.y, gy(x)); }
        else {
          const target = sy(x) + 22 + Math.sin(t * 2.3 + this.seed) * 1;
          this.y = lerp(this.y, target, Math.min(1, dt * 6));
          if (this.moving && Math.random() < dt * 5) FX.add({ type: 'ripple', x: this.x - this.dir * 18, y: sy(this.x) + 1, r0: 2, r1: 10, flat: 0.3, life: 0.7, c: Game.pal().foam[0], layer: 2 });
        }
      } else if (this.mode === 'fall') {
        this.vy += 800 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        const s = sy(this.x), g = gy(this.x);
        if (g > s + 16 && this.y > s + 10 && this.vy > 0) {
          this.mode = 'swim'; FX.splashAt(this.x, s, { power: Math.min(1.3, this.vy / 350) }); Game.sfx('splash', this.x, 1);
          this.y = s + 34; this.vx = 0;
        } else if (this.y >= g && this.vy > 0) {
          this.mode = 'land'; this.y = g; this.air = 0; this.vair = 0; this.sq.kick(0.9); this.vx = 0;
          FX.poof(this.x, g, Game.pal().sand[3], Game.pal().sand[2], 5, 4); Game.sfx('pat', this.x, 0.8);
        }
      }
      this.x = clamp(this.x, 24, World.W - 24);
      this.layer = this.mode === 'carried' || (this.mode === 'fall' && this.y < World.SEA - 60) ? 'top' : 'mid';
    }

    animate(dt, t) {
      const o = this.o;
      const walk = this.moving ? clamp(this.moving / 60, 0.6, 1.5) : 0;
      this.gait = approach(this.gait, walk, dt * 6);
      const swim = this.inWater;
      const rate = swim ? 13 : 7 + this.gait * 6;
      if (this.gait > 0.01 || swim) this.phase += dt * rate;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const P = {};
      const g = swim ? Math.max(0.35, this.gait) : this.gait;
      P.legF = s * 0.55 * g; P.legB = -s * 0.55 * g;
      P.bodyDip = swim ? 0 : Math.abs(c) * 1.6 * this.gait;
      const breathe = Math.sin(t * 2.4 + this.seed) * 0.015;
      const sq = this.sq.step(dt);
      P.squash = breathe + sq * 0.5 + (this.air > 0 ? clamp(this.vair / 2500, -0.08, 0.08) * -1 : 0);
      P.headPitch = (swim ? 0.1 : 0) + Math.sin(this.phase * 2) * 0.03 * this.gait;
      P.lean = swim ? 0.04 : 0;
      const fin = this.finS.step(dt, -this.gait * 0.08 - (this.air > 0 ? this.vair * 0.0004 : 0));
      P.finSway = 0.04 + fin + Math.sin(t * 1.7 + this.seed) * 0.03;
      P.tailWag = Math.sin(t * (swim ? 6 : 2.6) + this.seed) * (swim ? 0.25 : 0.1) + this.tailS.step(dt);
      P.tailLift = this.air > 0 ? 0.15 : 0;
      P.mouth = 0.6;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.air > 0) { P.legF = -0.5; P.legB = 0.5; }
      if (this.dizzy > 0) {
        this.dizzy -= dt;
        P.eyes = 'blink'; P.headRoll = Math.sin(t * 9) * 0.18; P.mouth = 0.3;
      }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 1; }
      Object.assign(P, o);
      this.pose = P;
    }

    brain() { return this.life(); }
    *life() {
      yield* wait(rnd(0.3, 1.2));
      for (;;) {
        if (this.inWater) { yield* this.swimHome(); continue; }
        if (Game.hour() === 'night') { yield* this.goSleep(); continue; }
        const ball = Game.ball;
        const nut = Nuts.near(this.x, 700, (c) => (c.state === 'ground' && !wet(c.x, 4)) && (!c.claim || c.claim === this || c.cracked));
        const opts = [];
        if (nut) opts.push([nut.cracked ? 7 : 4, () => this.coconut(nut)]);
        if (ball && !ball.holder && !wet(ball.x, 6) && Math.abs(ball.x - this.x) < 900) opts.push([3, () => this.playBall()]);
        if (Scene.S.castleHP <= 0.5 && Game.t - Scene.S.castleT > 3) opts.push([4, () => this.rebuildCastle()]);
        opts.push([1.6, () => this.wander()]);
        opts.push([1.2, () => this.swimTrip()]);
        opts.push([1.2, () => this.idleLook()]);
        opts.push([0.6, () => this.dig()]);
        opts.push([0.5, () => this.visit()]);
        let tot = opts.reduce((a, b) => a + b[0], 0), r = Math.random() * tot;
        for (const [w, f] of opts) { r -= w; if (r <= 0) { yield* f(); break; } }
      }
    }
    *idleLook() {
      const T = rnd(1.5, 3.5);
      let e = 0;
      const look = rnd(-0.4, 0.4);
      yield* this.faceTo(chance(0.5) ? 1 : -1, false);
      while (e < T) {
        const dt = yield; e += dt;
        this.o.headYaw = Math.sin(e * 1.3) * look;
        if (e > T * 0.5) this.o.mouth = 0.8;
      }
    }
    *rebuildCastle() {
      const S = Scene.S;
      yield* this.walkTo(S.castle.x - 46, 60);
      yield* this.faceTo(1, true);
      const pal = Game.pal();
      let e = 0;
      while (e < 2.6 && S.castleHP <= 0.5) {
        const dt = yield; e += dt;
        this.o.headPitch = -0.2; this.o.legF = Math.abs(Math.sin(e * 14)) * -0.8; this.o.bodyDip = 1; this.o.eyes = 'happy'; this.o.mouth = 0.8;
        if (Math.random() < dt * 8) FX.poof(S.castle.x + rnd(-20, 20), gy(S.castle.x) - rnd(0, 10), pal.sand[3], pal.sand[2], 1, 3);
        if (Math.random() < dt * 4) Game.sfx('pat', S.castle.x, 0.4);
        S.castleHP = Math.min(0.5, S.castleHP + dt * 0.12);
      }
      if (S.castleHP <= 0.5) {
        S.castleHP = 1; S.castle.wob = 0.6;
        FX.sparkles(S.castle.x, S.castle.y0 + 30, 12, 60);
        FX.confetti(S.castle.x, S.castle.y0 + 10, 16);
        Game.sfx('twinkle', S.castle.x, 0.9);
        this.happyT = 1.4; this.emote('star');
        yield* this.hop(240);
      }
    }
    *wander() {
      let tx = clamp(this.x + rnd(-280, 280), 140, World.shoreX - 20);
      yield* this.walkTo(tx, rnd(45, 65));
      if (chance(0.3)) { this.happyT = 0.8; yield* this.hop(200); }
    }
    *dig() {
      yield* this.walkTo(clamp(this.x + rnd(-150, 150), 480, World.shoreX - 30), 55);
      const pal = Game.pal();
      let e = 0;
      while (e < 1.6) {
        const dt = yield; e += dt;
        this.o.headPitch = -0.25; this.o.legF = Math.sin(e * 22) * 0.7; this.o.bodyDip = 1; this.o.mouth = 0.2;
        if (Math.random() < dt * 10) FX.add({ type: 'drop', x: this.x + this.dir * 12, y: gy(this.x) - 2, vx: -this.dir * rnd(30, 80), vy: rnd(-120, -60), g: 500, life: 1, c: pal.sand[1 + (Math.random() * 3 | 0)], size: 1, floor: gy(this.x) + 1, layer: 2 });
      }
      if (chance(0.45)) {
        // found a shiny shell!
        FX.sparkles(this.x + this.dir * 14, gy(this.x) - 8, 6, 16);
        Game.sfx('twinkle', this.x, 0.7);
        this.happyT = 1.2;
        this.emote(pick(['star', 'heart', 'sparkle']));
        yield* this.hop(220);
      }
    }
    // poke the sand and Mudkip trots over to sniff it; sometimes it digs up a sparkle
    curious(x) {
      if (this.mode !== 'land' || this.sleeping || this.busy(1.5) || Math.abs(x - this.x) > 800 || wet(x, 4)) return;
      this.doTask(this.sniff(x), 1.5);
    }
    *sniff(x) {
      const side = this.x < x ? -1 : 1;
      this.emote('sparkle', 0.9);
      yield* this.walkTo(x + side * 28, 95);
      yield* this.faceTo(-side, false);
      let e = 0;
      while (e < 1.1) { const dt = yield; e += dt; this.o.headPitch = 0.3 + Math.sin(e * 18) * 0.06; this.o.mouth = 0.2; this.o.eyes = e > 0.8 ? 'happy' : 'open'; if (Math.floor(e * 6) !== Math.floor((e - dt) * 6)) FX.poof(x, gy(x), Game.P.sand[3], Game.P.sand[2], 2, 2); }
      if (chance(0.35)) { FX.sparkles(x, gy(x) - 6, 8, 18, PX.hex('#ffffff'), PX.hex('#ffe066')); Game.sfx('twinkle', x, 0.8); this.emote('star'); this.happyT = 1.3; yield* this.hop(250); }
      else { this.emote(pick(['heart', 'note'])); Game.sfx('mud', this.x, 0.8); this.happyT = 1; yield* this.hop(190); }
    }
    *visit() {
      const who = pick(Game.mons.filter((m) => m !== this && m.mode !== 'fly' && !m.sleeping && Math.abs(m.x - this.x) < 900 && !wet(m.x, 8) && m.kind !== 'luvdisc'));
      if (!who) return yield* this.idleLook();
      const side = this.x < who.x ? -1 : 1;
      yield* this.walkTo(who.x + side * (who.width() * 0.5 + 34), 60);
      yield* this.faceTo(-side, false);
      this.emote(pick(['heart', 'note', 'music2']));
      Game.sfx('mud', this.x, 0.8);
      let e = 0;
      while (e < 1.4) { const dt = yield; e += dt; this.o.eyes = 'happy'; this.o.mouth = 1; this.o.headRoll = Math.sin(e * 6) * 0.1; }
      if (who.greet) who.greet(this);
    }
    *coconut(c) {
      c.claim = c.claim || this;
      const side = this.x < c.x ? -1 : 1;
      yield* this.walkTo(c.x + side * 26, 70, { stop: () => c.state !== 'ground' || Math.abs(c.x - (this.x - side * 26)) > 60 && false });
      if (c.state !== 'ground') { if (c.claim === this) c.claim = null; return; }
      yield* this.faceTo(-side, true);
      if (!c.cracked) {
        // try to bite it... too hard!
        for (let k = 0; k < 2 && !c.cracked; k++) {
          let e = 0;
          while (e < 0.5) { const dt = yield; e += dt; this.o.mouth = 1; this.o.headPitch = -0.12 + e * 0.2; }
          this.o.mouth = 0;
          FX.bonk(c.x - side * 6, c.y - 6, 7); Game.sfx('clink', c.x, 0.9);
          this.sq.kick(0.6);
          c.vx = -side * 25; c.state = 'ground';
          yield* wait(0.25);
        }
        if (!c.cracked) {
          this.emote('sweat');
          let e = 0;
          while (e < 1.2) { const dt = yield; e += dt; this.o.eyes = 'blink'; this.o.mouth = 0.2; this.o.headRoll = Math.sin(e * 8) * 0.06; }
          // wait for a crab to crack it, or roll it around like a ball
          const crab = Game.mons.find((m) => m.kind === 'corphish' && !m.underwater);
          if (crab && Math.abs(crab.x - c.x) < 900) { crab.wantNut = c; yield* until(() => c.cracked || c.state !== 'ground', 7); }
          if (!c.cracked) {
            // headbutt it and chase it for a bit
            for (let k = 0; k < 2 && c.state === 'ground'; k++) {
              const s2 = this.x < c.x ? -1 : 1;
              yield* this.walkTo(c.x + s2 * 22, 80);
              this.o.headPitch = -0.3; this.sq.kick(0.4);
              c.vx = -s2 * rnd(60, 110); c.vy = -60; c.state = 'fall';
              Game.sfx('knock', c.x, 0.6);
              this.happyT = 0.6;
              yield* wait(0.8);
            }
            if (c.claim === this) c.claim = null;
            return;
          }
        }
      }
      // eat!
      if (c.cracked && c.state !== 'gone' && c.state !== 'fade') {
        this.happyT = 0.6;
        yield* this.walkTo(c.x + (this.x < c.x ? -24 : 24), 60);
        yield* this.faceTo(this.x < c.x ? 1 : -1, true);
        for (let k = 0; k < 4 && c.state === 'ground'; k++) {
          let e = 0;
          while (e < 0.34) { const dt = yield; e += dt; this.o.headPitch = -0.28; this.o.mouth = e < 0.17 ? 1 : 0.1; }
          Nuts.bite(c);
        }
        this.emote('heart'); this.happyT = 1.3;
        Game.sfx('yum', this.x, 0.8);
        yield* this.hop(190);
      }
      if (c.claim === this) c.claim = null;
    }
    // chase and kick the beach ball, passing to a friend when one is around
    *playBall() {
      const b = Game.ball;
      for (let n = 0; n < 8; n++) {
        if (!b || b.holder || wet(b.x, 8) || Game.hour() === 'night') return;
        // predict where the ball comes down to head height
        let px = b.x;
        if (Math.abs(b.vy) > 30 || Math.abs(b.vx) > 20) {
          const hh = gy(b.x) - 44;
          const a = 280, bb = b.vy, cc = b.y - hh;
          const disc = bb * bb - 4 * a * cc;
          const tt = disc > 0 ? (-bb + Math.sqrt(disc)) / (2 * a) : 0.3;
          px = b.x + b.vx * clamp(tt, 0, 2);
        }
        const side = px < this.x ? 1 : -1;
        const target = clamp(px + side * 18, 60, World.shoreX + 30);
        const fast = Math.abs(target - this.x) > 80;
        let e = 0;
        // run under it
        while (Math.abs(target - this.x) > 4 && e < 3) {
          const dt = yield; e += dt;
          const d = Math.sign(target - this.x);
          this.turn(this.face(d), dt, 10);
          if (Math.sign(Math.cos(this.yaw)) === d) { this.x += d * Math.min(Math.abs(target - this.x), (fast ? 120 : 70) * dt); this.moving = fast ? 110 : 60; }
        }
        // face the ball and wait for it to come close
        const toward = b.x > this.x ? 1 : -1;
        yield* this.faceTo(toward, false);
        let w = 0;
        while (w < 2.2) {
          const dt = yield; w += dt;
          const hp = this.headPt();
          const d = Math.hypot(b.x - hp[0], b.y - hp[1]);
          this.o.look = clamp((b.x - this.x) / 200, -0.3, 0.3);
          if (d < 34 || (b.rest > 0.3 && Math.abs(b.x - this.x) < 34)) break;
          if (b.rest > 0.4 && Math.abs(b.x - this.x) > 40) break;
        }
        const hp = this.headPt();
        if (Math.hypot(b.x - hp[0], b.y - hp[1]) < 40 || Math.abs(b.x - this.x) < 38) {
          // header or nudge: aim for a friend if one is near
          const friend = Game.mons.find((m) => (m.kind === 'spheal' || m.kind === 'dialga' || (m.kind === 'mudkip-shiny' && m !== this)) && m.mode === 'land' && !m.sleeping && Math.abs(m.x - this.x) < 520 && Math.abs(m.x - this.x) > 90);
          let vx, vy;
          if (friend && chance(0.8)) {
            const T = 1.15; vx = (friend.x - b.x) / T; vy = -(0.5 * 560 * T) - rnd(0, 40);
          } else {
            vx = (chance(0.5) ? 1 : -1) * rnd(90, 160); vy = -rnd(230, 320);
            if (b.x + vx * 1.2 > World.shoreX + 20) vx = -Math.abs(vx);
          }
          const air = b.y < gy(this.x) - 40;
          if (air) { this.vair = 240; this.air = 0.5; }
          this.o.headPitch = 0.35; this.o.mouth = 1; this.o.eyes = 'happy';
          yield* wait(air ? 0.12 : 0.05);
          b.kick(vx, vy, this);
          Game.sfx('boing', b.x, 0.9);
          FX.add({ type: 'burst', x: b.x, y: b.y + 6, r: 6, life: 0.2, layer: 3 });
          this.happyT = 0.7;
          if (chance(0.25)) this.emote(pick(['note', 'star']));
          yield* wait(0.35);
        } else yield* wait(0.2);
      }
    }
    // swim out, maybe dive to the reef, come back
    *swimTrip() {
      yield* this.walkTo(World.shoreX + 60, 62);
      yield* until(() => this.mode === 'swim', 3);
      if (this.mode !== 'swim') return;
      const tx = rnd(1500, 2250);
      yield* this.swimTo(tx);
      if (chance(0.75)) yield* this.dive();
      else yield* this.floatAbout();
      yield* this.swimHome();
    }
    *swimTo(tx, speed = 48) {
      for (let g = 0; g < 3000; g++) {
        const dt = yield;
        const dx = tx - this.x;
        if (Math.abs(dx) < 4 || this.mode !== 'swim') break;
        const d = Math.sign(dx);
        this.turn(this.face(d), dt, 6);
        this.x += d * Math.min(Math.abs(dx), speed * dt); this.moving = speed;
      }
    }
    *floatAbout() {
      let e = 0;
      const T = rnd(2, 4);
      while (e < T) { const dt = yield; e += dt; this.o.eyes = e > 1 ? 'happy' : this.pose.eyes; this.o.mouth = 1; this.o.tailWag = Math.sin(e * 5) * 0.4; }
      Game.sfx('mud', this.x, 0.5);
    }
    *dive() {
      this.mode = 'dive';
      Game.sfx('splash', this.x, 0.5);
      FX.add({ type: 'ripple', x: this.x, y: sy(this.x) + 1, r0: 4, r1: 22, flat: 0.3, life: 0.9, c: Game.pal().foam[0], layer: 2 });
      // pick a spot: the heart school, the reef or the chest
      const school = Game.school;
      const pts = [];
      if (school) pts.push([school.cx, school.cy + 20]);
      pts.push([rnd(1700, 2500), 0], [rnd(2100, 2600), 0]);
      if (chance(0.3)) pts.push([Scene.S.chest.x - 40, 0]);
      let [tx, ty] = pick(pts);
      if (!ty) ty = gy(tx) - rnd(40, 90);
      ty = Math.min(ty, gy(tx) - 30);
      yield* this.swimPath(tx, ty, 55);
      // look around, blow bubbles
      let e = 0;
      while (e < 2.2) {
        const dt = yield; e += dt;
        this.o.lean = Math.sin(e * 2) * 0.05; this.o.mouth = 0.3; this.o.headYaw = Math.sin(e * 1.5) * 0.3;
        if (Math.random() < dt * 2.5) FX.bubbles(...this.at('mouth'), 1, World.SEA);
      }
      if (Game.school && Math.hypot(Game.school.cx - this.x, Game.school.cy - this.y) < 260) { this.emote('heart'); this.happyT = 1.5; }
      // back up — and leap out of the water!
      const ux = this.x + this.dir * rnd(60, 160);
      yield* this.swimPath(ux, World.SEA + 40, 70);
      if (chance(0.7)) {
        this.mode = 'fall'; this.vx = this.dir * 70; this.vy = -330;
        FX.splashAt(this.x, sy(this.x), { power: 0.8 }); Game.sfx('splash', this.x, 0.9);
        this.happyT = 1.2;
        yield* until(() => this.mode !== 'fall', 3);
      } else this.mode = 'swim';
    }
    *swimPath(tx, ty, speed) {
      for (let g = 0; g < 3000; g++) {
        const dt = yield;
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 5) break;
        const k = Math.min(1, (speed * dt) / d);
        this.x += dx * k; this.y += dy * k;
        this.turn(this.face(dx), dt, 5);
        this.moving = speed;
        this.o.lean = clamp(Math.atan2(-dy, Math.abs(dx) + 1) * 0.8, -0.7, 0.7);
        this.o.finSway = -0.3; this.o.tailLift = 0.1; this.o.mouth = 0.4;
        if (Math.random() < dt * 1.5) FX.bubbles(...this.at('mouth'), 1, World.SEA);
        // stay below the surface and above the floor while diving
        this.y = clamp(this.y, sy(this.x) + 30, gy(this.x) - 8);
      }
    }
    *swimHome() {
      if (this.mode === 'dive') { yield* this.swimPath(this.x, World.SEA + 40, 60); this.mode = 'swim'; }
      if (this.mode === 'swim') yield* this.swimTo(World.shoreX - 10);
      if (this.mode === 'land' || !wet(this.x, 12)) {
        // shake off the water
        this.mode = 'land';
        yield* this.walkTo(World.shoreX - rnd(80, 200), 55);
        let e = 0;
        while (e < 0.8) {
          const dt = yield; e += dt;
          this.o.headRoll = Math.sin(e * 30) * 0.2; this.o.eyes = 'blink';
          if (Math.random() < dt * 30) FX.add({ type: 'drop', x: this.x + rnd(-20, 20), y: this.y - rnd(20, 50), vx: rnd(-90, 90), vy: rnd(-120, -40), g: 500, life: 1, c: Game.pal().foam[0], c2: Game.pal().foam[1], size: 1, floor: this.y + 1, layer: 2 });
        }
        this.happyT = 0.8;
      }
    }
    *goSleep() {
      const towel = Scene.S.towel;
      yield* this.walkTo(towel.x + rnd(-10, 10), 45);
      yield* this.faceTo(1, false);
      // yawn and lie down
      let e = 0;
      while (e < 1.4) { const dt = yield; e += dt; this.o.mouth = Math.sin(Math.min(1, e / 1.2) * Math.PI) * 1.2; this.o.eyes = 'blink'; this.o.headPitch = 0.2 * Math.sin(Math.min(1, e / 1.2) * Math.PI); }
      this.sleeping = true;
      let bub = null, tt = 0;
      while (Game.hour() === 'night' && this.sleeping) {
        const dt = yield; tt += dt;
        const br = Math.sin(tt * 1.6);
        Object.assign(this.o, { squash: 0.14 + br * 0.03, bodyDip: 2.5, eyes: 'sleep', mouth: 0.1, headPitch: -0.14, legSplay: 0.35, legF: 0.7, legB: -0.8, tailLift: -0.2, finSway: 0.2 });
        if (!bub) bub = FX.add({ type: 'fn', x: 0, y: 0, life: 1e9, layer: 3, draw: (fb, p, k, cx, cy) => snotBubble(fb, this, tt, cx, cy) });
      }
      if (bub) bub.life = 0;
      this.sleeping = false;
      // wake up stretch
      e = 0;
      while (e < 1.2) { const dt = yield; e += dt; this.o.headPitch = 0.3 * Math.sin((e / 1.2) * Math.PI); this.o.mouth = 1; this.o.eyes = 'blink'; this.o.squash = -0.06 * Math.sin((e / 1.2) * Math.PI); }
      this.happyT = 1;
    }
    *dance(T = 4) {
      let e = 0, k = 0;
      while (e < T) {
        const dt = yield; e += dt;
        const beat = Math.floor(e * 2.2);
        if (beat !== k) { k = beat; this.vair = 170; this.air = 0.5; if (k % 2) FX.floatIcon(pick(['note', 'music2']), this.x + rnd(-20, 20), this.y - 80); }
        this.turn(k % 2 ? 1.1 : Math.PI - 1.1, dt, 9);
        this.o.eyes = 'happy'; this.o.mouth = 1; this.o.headRoll = Math.sin(e * 7) * 0.14; this.o.tailWag = Math.sin(e * 9) * 0.4;
      }
    }

    /* ---- reactions ---- */
    onPoke() {
      const now = Game.t;
      this.pokes = this.pokes.filter((p) => now - p < 2.5); this.pokes.push(now);
      if (this.sleeping) {
        this.doTask((function* (m) {
          m.o.eyes = 'open'; FX.emote('shock', () => m.headPt(), { life: 1 }); Game.sfx('squeak', m.x, 1);
          m.sleeping = false; m.vair = 200; m.air = 0.5; yield* wait(0.9);
          yield* wait(0.1);
        })(this), 3);
        return;
      }
      if (this.mode === 'fall' || this.mode === 'carried') return;
      const n = this.pokes.length;
      this.doTask((function* (m) {
        if (n >= 5) {
          m.emote('anger'); Game.sfx('grr', m.x, 0.8);
          let e = 0;
          while (e < 1) { const dt = yield; e += dt; m.o.eyes = 'blink'; m.o.mouth = 0.2; m.o.headRoll = Math.sin(e * 25) * 0.08; }
          return;
        }
        if (m.inWater) {
          m.happyT = 1; Game.sfx('mud', m.x, 1); FX.splashAt(m.x, sy(m.x), { power: 0.4, n: 8 });
          if (m.mode === 'swim') { m.mode = 'fall'; m.vx = 0; m.vy = -260; }
          yield* wait(0.6); return;
        }
        m.surprise = 1; Game.sfx(n >= 3 ? 'squeak' : 'mud', m.x, 1);
        m.happyT = 1.1;
        m.emote(n >= 3 ? 'swirl' : pick(['heart', 'note', 'heart']));
        yield* m.hop(n >= 3 ? 300 : 230);
        if (n >= 3) { m.dizzy = 1.4; FX.add({ type: 'dizzy', x: 0, y: 0, at: () => m.at('headTop', 0, -4), rx: 12, life: 1.4, layer: 3 }); yield* wait(1.2); }
      })(this), 2);
    }
    onBonk() {
      this.dizzy = 1.8;
      FX.add({ type: 'dizzy', x: 0, y: 0, at: () => this.at('headTop', 0, -4), rx: 13, life: 1.8, layer: 3 });
      Game.sfx('squeak', this.x, 1);
      this.doTask((function* (m) { m.sq.kick(1.2); FX.emote('tear', () => m.headPt(), { life: 1.2 }); yield* wait(1.9); m.emote('sweat'); yield* wait(0.5); })(this), 3);
    }
    onBall(b) {
      // gentle boop off the head
      if (b.lastTouch === this && b.touchT < 0.4) return false;
      this.happyT = 0.5; this.sq.kick(0.3);
      return false;
    }
    greet(from) { this.happyT = 1; this.emote('heart'); }
  }

  // sleepy snot bubble at the nose
  function snotBubble(fb, m, tt, cx, cy) {
    const p = m.at('nosN');
    const cyc = (tt * 0.45) % 1;
    const r = 1 + Math.sin(cyc * Math.PI) * 6;
    if (cyc > 0.94) return;
    const x = Math.round(p[0] + m.dir * (r * 0.6 + 1)) - cx, y = Math.round(p[1] + 1) - cy;
    const c1 = PX.hex('#e8fbff'), c2 = PX.hex('#9fd6f0');
    fb.ring(x + 0.5, y + 0.5, r, r * 0.95, c2);
    if (r > 3) { fb.set(x - Math.round(r * 0.4), y - Math.round(r * 0.4), c1); fb.set(x - Math.round(r * 0.4) + 1, y - Math.round(r * 0.4), c1); }
  }

  /* ---- ball vs creatures ---- */
  function ballCollide(b, dt) {
    if (!b || b.holder) return;
    for (const m of Game.mons) {
      if (!m.solid || !m.visible || m.mode === 'fly' && m.kind !== 'pelipper') continue;
      if (b.lastTouch === m && b.touchT < 0.3) continue;
      if (Math.abs(b.x - m.x) > m.width() * 0.7 + 20) continue;
      let hx = 0, hy = 0, n = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const px = b.x + Math.cos(a) * b.R, py = b.y + Math.sin(a) * b.R;
        if (m.hit(px, py)) { hx += Math.cos(a); hy += Math.sin(a); n++; }
      }
      if (!n) continue;
      if (m.onBall(b)) continue;
      // reflect away from the contact normal
      const l = Math.hypot(hx, hy) || 1;
      const nx = -hx / l, ny = -hy / l;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
      b.vy = Math.min(b.vy, -120);
      b.x += nx * 3; b.y += ny * 3;
      b.lastTouch = m; b.touchT = 0; b.sq = 0.16;
      Game.sfx('boing', b.x, 0.6);
    }
  }

  return { Task, Mon, MudkipMon, Nuts, SHINY, wait, until, both, rnd, pick, chance, gy, sy, wet, depthAt, approach, dist, ballCollide, snotBubble, TAU };
})();
