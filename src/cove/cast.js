/* ------------------------------------------------------------------
   Cast — the 2D Pokémon that live in each scene. A tiny Actor base
   (springy squash, hops, blinks, dizzy stars) plus one factory per
   species with its own little moods and poke reactions.
------------------------------------------------------------------- */
const Cast = (() => {
  const { hex } = PX;
  const R = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const q = (v, s) => Math.round(v / s) * s;
  const hooks = { sfx: () => {}, shake: () => {} };
  const sfx = (n, x, v) => hooks.sfx(n, x, v);

  class Actor {
    constructor(sp, x, y, o = {}) {
      Object.assign(this, {
        sp, x, y, hop: 0, hv: 0, sq: 0, sqv: 0, flip: false, rot: 0, t: R(0, 9), st: 0, state: 'idle', pose: {},
        layer: 'front', shadow: 0, blinkAt: R(1, 4), blinkT: 0, dizzy: 0, hidden: false, a: 1, next: R(2, 5), home: x,
      }, o);
    }
    set(s) { this.state = s; this.st = 0; }
    squish(v) { this.sqv += v * 8; }
    jump(v) { if (this.hop <= 0.01 && this.hv <= 0) { this.hv = v; this.hop = 0.1; } }
    base(dt) {
      this.t += dt; this.st += dt;
      this.sqv += (-420 * this.sq - 16 * this.sqv) * dt; this.sq += this.sqv * dt;
      if (this.hop > 0 || this.hv > 0) {
        this.hv -= 700 * dt; this.hop += this.hv * dt;
        if (this.hop <= 0) { const v = -this.hv; this.hop = 0; this.hv = 0; if (v > 50) { this.squish(Math.min(0.3, v * 0.0014)); if (this.onLand) this.onLand(v); } }
      }
      if (this.blinkT > 0) this.blinkT -= dt; else if (this.t > this.blinkAt) { this.blinkT = 0.12; this.blinkAt = this.t + R(2, 5); }
      if (this.dizzy > 0) this.dizzy -= dt;
    }
    eyes(def = 'open') { return this.dizzy > 0 ? 'dizzy' : this.blinkT > 0 && def === 'open' ? 'closed' : def; }
    top() { const b = this.last; return b ? this.y - this.hop - b.ay : this.y - 20; }
    // world position of a sprite-local point
    at(lx, ly) { const b = this.last || Pix.get(this.sp, this.pose); return [this.x + (lx - b.ax) * (this.flip ? -1 : 1), this.y - this.hop + (ly - b.ay)]; }
    draw(fb, tint) {
      if (this.hidden) return;
      const b = Pix.get(this.sp, this.pose, tint);
      this.last = b;
      if (this.shadow) FX.shadow(fb, this.x, this.y, this.shadow * (1 - Math.min(0.5, this.hop / 90)), Math.max(1.5, this.shadow * 0.26));
      const sq = clamp(this.sq, -0.3, 0.3), o = { flip: this.flip, sx: 1 + sq * 0.6, sy: 1 - sq, a: this.a, map: this.map, clip: this.clip, top: this.clipTop };
      if (this.rot) { o.rot = this.rot; o.ay = this.pivotY ?? b.ay; Pix.draw(fb, b, this.x, this.y - this.hop - (b.ay - o.ay), o); } else Pix.draw(fb, b, this.x, this.y - this.hop, o);
      if (this.dizzy > 0) {
        const top = this.top() - 2;
        for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * 2.09; FX.glyph(fb, ['.x.', 'xwx', '.x.'], this.x + Math.cos(a) * 9, top + Math.sin(a) * 2.5, FX.C.y); }
      }
      if (this.extra) this.extra(fb, tint);
    }
    hit(px, py) { return !this.hidden && Pix.hit(this.last, this.x, this.y - this.hop, this.flip, px, py, this.pad ?? 3); }
  }
  function snot(fb, x, y, t, k = 1) {
    const r = Math.round((1 + (Math.sin(t * 1.4) + 1) * 2.2) * k);
    for (let i = 0; i < 20; i++) { const a = i * 0.314; fb.set(Math.round(x + r + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), FX.C.b); }
    fb.set(Math.round(x + r * 0.6), Math.round(y - r * 0.5), FX.C.w);
  }

  /* ------------------------------ Spheal ------------------------------ */
  function spheal(x, y, o = {}) {
    const a = new Actor('spheal', x, y, Object.assign({ shadow: 15, pivotY: 22, minX: x - 50, maxX: x + 50 }, o));
    a.clapPh = 0;
    a.update = function (dt, S) {
      this.base(dt);
      const p = { eyes: this.eyes(), clap: 0, mouth: 0 };
      const st = this.st;
      if (this.state === 'idle') {
        if (this.sleepy) { this.set('sleep'); }
        else if (st > this.next) {
          const r = Math.random();
          if (r < 0.35) this.set('clap');
          else if (r < 0.75) { this.tx = clamp(this.home + R(-45, 45), this.minX, this.maxX); this.set('roll'); }
          else { this.jump(160); sfx('spheal', this.x); FX.notes(this.x, this.top(), 1); this.st = 0; }
          this.next = R(3, 7);
        }
      } else if (this.state === 'sleep') {
        p.eyes = 'closed';
      } else if (this.state === 'wake') {
        p.eyes = st < 1.2 ? 'open' : 'happy'; p.mouth = st > 0.3 && st < 1.2 ? 1 : 0;
        if (st > 2.2) this.set(this.sleepy ? 'sleep' : 'idle');
      } else if (this.state === 'clap') {
        const c = Math.abs(Math.sin(st * 9));
        p.clap = q(c, 0.5); p.eyes = 'happy'; p.mouth = 0.6;
        const ph = Math.floor(st * 9 / Math.PI);
        if (ph !== this.clapPh) { this.clapPh = ph; sfx('clap', this.x, 0.6); }
        if (st > 1.6) this.set('idle');
      } else if (this.state === 'roll' || this.state === 'go') {
        const tx = this.state === 'go' && this.target ? this.target.x - 16 * Math.sign(this.target.x - this.x || 1) : this.tx;
        const dx = tx - this.x, s = Math.sign(dx) * Math.min(Math.abs(dx), 50 * dt);
        this.x += s; this.rot += s / 19; this.flip = dx < 0;
        if (Math.abs(dx) < 1) {
          const tgt = Math.round(this.rot / 6.283) * 6.283;
          this.rot += (tgt - this.rot) * Math.min(1, dt * 10);
          if (Math.abs(tgt - this.rot) < 0.05) { this.rot = 0; this.set(this.state === 'go' ? (this.target.half ? 'eat' : 'bite') : 'idle'); }
        }
      } else if (this.state === 'bite') {
        p.mouth = Math.sin(st * 14) > 0 ? 1 : 0;
        if (st > 1.3) { sfx('bonk', this.x); FX.sweat(this.x + 10, this.top() + 6); this.dizzy = 1.4; this.squish(0.25); if (this.target) { this.target.vy = -90; this.target.vx = this.flip ? -40 : 40; this.target.claim = null; } this.target = null; this.set('idle'); }
      } else if (this.state === 'eat') {
        p.mouth = Math.sin(st * 16) > 0 ? 0.8 : 0; p.eyes = 'happy';
        if (Math.floor(st * 4) !== Math.floor((st - dt) * 4)) sfx('munch', this.x, 0.6);
        if (st > 1.8) { if (this.target) this.target.gone = true; this.target = null; FX.hearts(this.x, this.top(), 2); sfx('yum', this.x); this.set('idle'); }
      }
      if (this.dizzy > 0) p.eyes = 'dizzy';
      this.pose = p;
    };
    a.extra = function (fb) { if (this.state === 'sleep') { const [nx, ny] = this.at(29, 27); snot(fb, nx + (this.flip ? -4 : 0), ny, this.t); } };
    a.poke = function () {
      if (this.state === 'sleep') { this.set('wake'); sfx('spheal', this.x); this.jump(90); FX.sparks(this.x, this.top(), 4); return true; }
      this.pokes = (this.t - (this.lastPoke || -9) < 2.5 ? (this.pokes || 0) : 0) + 1; this.lastPoke = this.t;
      if (this.pokes >= 4) { this.dizzy = 2; this.pokes = 0; sfx('bonk', this.x); FX.stars(this.x, this.top(), 5); this.squish(0.3); return true; }
      this.jump(170); sfx('spheal', this.x); FX.hearts(this.x, this.top(), 1); this.set('clap'); this.rot = 0;
      return true;
    };
    return a;
  }

  /* ----------------------------- Corphish ----------------------------- */
  function corphish(x, y, o = {}) {
    const a = new Actor('corphish', x, y, Object.assign({ shadow: 12, minX: x - 60, maxX: x + 60, wk: 0 }, o));
    a.update = function (dt) {
      this.base(dt);
      const st = this.st, p = { eyes: this.eyes(), walk: 0, armL: 0, armR: 0, clawL: 0, clawR: 0, mouth: 0 };
      const walkTo = (tx, sp) => {
        const dx = tx - this.x;
        if (Math.abs(dx) < 1.5) return true;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); this.wk += dt * 16;
        if (Math.floor(this.wk / 3) !== Math.floor((this.wk - dt * 16) / 3)) sfx('pat', this.x, 0.25);
        return false;
      };
      if (this.state === 'idle') {
        const c = Math.sin(this.t * 1.7) > 0.93;
        p.clawL = c ? 1 : 0; p.clawR = Math.sin(this.t * 1.7 + 1) > 0.93 ? 1 : 0;
        if (st > this.next) { this.tx = clamp(this.home + R(-60, 60), this.minX, this.maxX); this.set('scuttle'); this.next = R(2, 5); }
      } else if (this.state === 'scuttle') {
        if (walkTo(this.tx, 34)) this.set('idle');
      } else if (this.state === 'go') {
        const t = this.target;
        if (!t || t.gone) { this.set('idle'); } else if (walkTo(t.x + (this.x < t.x ? -14 : 14), 44)) { this.set('crack'); this.snips = 0; }
        p.armL = p.armR = 0.4;
      } else if (this.state === 'crack') {
        const n = Math.floor(st / 0.42);
        const ph = (st % 0.42) / 0.42;
        const side = this.target && this.target.x > this.x ? 'R' : 'L';
        p['arm' + side] = -0.5; p['claw' + side] = ph < 0.5 ? 1 : 0; p.eyes = 'angry';
        if (n > this.snips && n <= 3) { this.snips = n; sfx('snip', this.x); if (this.target) { FX.sparks(this.target.x, this.target.y - 4, 4, FX.C.w, 5); this.target.hop = 3; } }
        if (n >= 4) {
          if (this.target && !this.target.gone && this.onCrack) this.onCrack(this.target);
          this.set('happy');
        }
      } else if (this.state === 'happy') {
        p.eyes = 'happy'; p.armL = p.armR = 1; p.clawL = p.clawR = Math.sin(st * 12) > 0 ? 1 : 0;
        if (st > 1) { this.set(this.meal ? 'goeat' : 'idle'); }
      } else if (this.state === 'goeat') {
        const t = this.meal;
        if (!t || t.gone) this.set('idle'); else if (walkTo(t.x + (this.x < t.x ? -12 : 12), 40)) this.set('eat');
      } else if (this.state === 'eat') {
        p.mouth = Math.sin(st * 16) > 0 ? 1 : 0; p.eyes = 'happy'; p.armL = p.armR = -0.3; p.clawL = p.clawR = 1;
        if (Math.floor(st * 4) !== Math.floor((st - dt) * 4)) sfx('munch', this.x, 0.5);
        if (st > 2) { if (this.meal) this.meal.gone = true; this.meal = null; FX.hearts(this.x, this.top(), 2); this.set('idle'); }
      } else if (this.state === 'angry') {
        p.eyes = 'angry'; p.armL = p.armR = 1; p.clawL = Math.sin(st * 20) > 0 ? 1 : 0; p.clawR = 1 - p.clawL; p.mouth = 0.6;
        this.x += Math.sin(st * 30) * 0.6;
        if (st > 1.4) this.set('idle');
      }
      if (this.dizzy > 0) p.eyes = 'dizzy';
      p.walk = q(((this.wk % 6.283) + 6.283) % 6.283, 1.047);
      this.pose = p;
    };
    a.poke = function () {
      if (this.state === 'crack' || this.state === 'eat') { FX.anger(this.x + 12, this.top() + 2); sfx('crab', this.x); return true; }
      this.set('angry'); this.jump(120); sfx('crab', this.x); FX.anger(this.x + 12, this.top() + 2);
      return true;
    };
    return a;
  }

  /* ----------------------------- Wingull ----------------------------- */
  function wingull(x, y, v, o = {}) {
    const a = new Actor('wingull', x, y, Object.assign({ layer: 'back', v, base0: y, pad: 5 }, o));
    a.update = function (dt) {
      this.base(dt);
      this.x += this.v * dt;
      if (this.x > 420) this.x = -40; if (this.x < -40) this.x = 420;
      this.y = this.base0 + Math.sin(this.t * 0.9) * 6;
      this.flip = this.v < 0;
      const glide = Math.sin(this.t * 0.5) > 0.3;
      this.pose = { flap: glide && this.state !== 'loop' ? 0 : q(Math.sin(this.t * 11), 1) };
      if (this.state === 'loop') { this.rot = (this.st / 0.75) * 6.283 * (this.flip ? -1 : 1); if (this.st > 0.75) { this.rot = 0; this.set('idle'); } }
    };
    a.poke = function () { if (this.state !== 'loop') { this.set('loop'); sfx('squawk', this.x); FX.feathers(this.x, this.y, 3, 'back'); } return true; };
    return a;
  }

  /* ----------------------------- Pelipper ----------------------------- */
  // flies across; over the sea it dives for a fish and flies off with a full pouch
  function pelipper(o = {}) {
    const a = new Actor('pelipper', -60, 50, Object.assign({ layer: 'back', pad: 2, cruise: 50, seaY: 150, diveX: [110, 280] }, o));
    a.state = 'away'; a.next = R(2, 5); a.pouch = 0; a.v = 55;
    a.update = function (dt) {
      this.base(dt);
      const st = this.st;
      let flap = q(Math.sin(this.t * 9), 0.5);
      if (this.state === 'away') {
        this.hidden = true;
        if (st > this.next) { this.hidden = false; this.v = chance(0.5) ? 55 : -55; this.x = this.v > 0 ? -40 : 424; this.y = this.cruise; this.pouch = 0; this.dove = false; this.set('fly'); }
      } else if (this.state === 'fly') {
        this.x += this.v * dt; this.y = this.cruise + Math.sin(this.t * 1.3) * 5;
        if (Math.sin(this.t * 0.8) > 0.4) flap = 0;
        if (!this.dove && this.x > this.diveX[0] && this.x < this.diveX[1] && chance(dt * 0.8)) { this.dove = true; this.set('dive'); }
        if (this.x < -70 || this.x > 454) { this.set('away'); this.next = R(6, 14); }
      } else if (this.state === 'dive') {
        this.x += this.v * 0.6 * dt; this.y += (this.seaY - this.y) * Math.min(1, dt * 3.2) + 30 * dt; flap = 1;
        if (this.y >= this.seaY - 2) { FX.drops(this.x + (this.v > 0 ? 12 : -12), this.seaY, 12, 1, 'back'); sfx('splash', this.x, 0.8); this.pouch = 2; this.set('rise'); }
      } else if (this.state === 'rise') {
        this.x += this.v * 0.8 * dt; this.y += (this.cruise - this.y) * Math.min(1, dt * 1.5); flap = q(Math.sin(this.t * 14), 0.5);
        if (st > 1.6) this.set('fly');
      } else if (this.state === 'loop') {
        this.x += this.v * 0.5 * dt; this.rot = (st / 0.9) * 6.283 * (this.v > 0 ? -1 : 1); flap = 1;
        if (st > 0.9) { this.rot = 0; this.set('fly'); }
      }
      this.flip = this.v < 0;
      this.pose = { flap, pouch: this.pouch, eyes: this.eyes() };
    };
    a.poke = function () {
      if (this.hidden || this.state === 'loop') return false;
      this.set('loop'); sfx('squawk', this.x); FX.feathers(this.x, this.y, 4, 'back');
      if (this.pouch) { this.pouch = 0; FX.fish(this.x + (this.v > 0 ? 20 : -20), this.y + 4, 'back'); } else FX.drops(this.x, this.y + 6, 10, 0.6, 'back');
      return true;
    };
    return a;
  }

  /* ----------------------------- Chinchou ----------------------------- */
  function chinchou(x, y, o = {}) {
    const a = new Actor('chinchou', x, y, Object.assign({ layer: 'back', glowK: 0.6, flash: 0 }, o));
    a.update = function (dt) {
      this.base(dt);
      this.bob = Math.round(Math.sin(this.t * 2 + this.home) * 1.5);
      if (this.flash > 0) this.flash -= dt;
      this.pose = { eyes: this.flash > 0 ? 'happy' : this.eyes(), sway: q(Math.sin(this.t * 1.6), 1) };
    };
    const _draw = a.draw;
    a.draw = function (fb, tint) {
      const y0 = this.y; this.y += this.bob; _draw.call(this, fb, tint); this.y = y0;
      const k = this.glowK + Math.max(0, this.flash) * 2, s = this.pose.sway * 1.5;
      for (const bx of [5 + s, 29 + s]) { const [gx, gy] = this.at(bx, 4); FX.glow(fb, gx, gy + this.bob, 9 + this.flash * 30, hex('#fff27a'), k); }
    };
    a.poke = function () { this.flash = 0.6; this.jump(130); sfx('twinkle', this.x); FX.sparks(this.x, this.top(), 8, hex('#fff27a'), 16, this.layer); if (this.inWater) { FX.drops(this.x, this.y, 8, 0.7, this.layer); sfx('splash', this.x, 0.5); } return true; };
    return a;
  }

  /* ------------------------------ Walrein ------------------------------ */
  function walrein(x, y, o = {}) {
    const a = new Actor('walrein', x, y, Object.assign({ shadow: 34, pad: 0 }, o));
    a.state = 'sleep'; a.next = R(12, 22);
    a.update = function (dt, S) {
      this.base(dt);
      const st = this.st, p = { eyes: 'closed', mouth: 0, headPitch: 0, flip: 0 };
      if (this.state === 'sleep') { if (st > this.next) this.set('wake'); }
      else if (this.state === 'wake') { p.eyes = st < 0.4 ? 'closed' : this.eyes(); if (st > 1.1) { this.set('roar'); this.roared = false; } }
      else if (this.state === 'roar') {
        p.eyes = 'angry'; p.mouth = st < 1.4 ? 1 : 0; p.headPitch = st < 1.4 ? 1 : 0;
        if (!this.roared && st > 0.15) {
          this.roared = true; sfx('roar', this.x); hooks.shake(3, 0.8);
          const [mx, my] = this.at(69, 40);
          for (let i = 0; i < 3; i++) setTimeout(() => FX.ring(mx, my, 3, 40, FX.C.w, 0.6), i * 180);
          FX.dust(this.x, this.y, 8); if (S && S.onRoar) S.onRoar(this);
        }
        if (st > 2.2) { this.set('sleep'); this.next = R(18, 32); }
      } else if (this.state === 'slap') {
        p.eyes = 'angry'; p.flip = st < 0.4 ? 1 : 0;
        if (st > 0.2 && !this.slapped) { this.slapped = true; sfx('thud', this.x); FX.dust(this.x + 18, this.y, 8); hooks.shake(2, 0.3); }
        if (st > 0.9) { this.set('sleep'); this.next = R(10, 20); }
      }
      if (this.dizzy > 0) p.eyes = 'dizzy';
      this.pose = p;
    };
    a.extra = function (fb) { if (this.state === 'sleep') { const [nx, ny] = this.at(72, 29); snot(fb, nx, ny, this.t, 1.3); } };
    a.poke = function () {
      if (this.state === 'sleep') { this.set('wake'); FX.anger(this.x + 26, this.top() + 6); sfx('grr', this.x); }
      else if (this.state !== 'roar') { this.slapped = false; this.set('slap'); }
      return true;
    };
    return a;
  }

  /* ------------------------------ Sealeo ------------------------------ */
  // balances a beach ball on its nose; tosses and catches it
  function sealeo(x, y, o = {}) {
    const a = new Actor('sealeo', x, y, Object.assign({ shadow: 22 }, o));
    const ball = { x: 0, y: 0, vx: 0, vy: 0, on: true, rot: 0 };
    a.ball = ball; a.state = 'balance';
    const nose = () => { const [nx, ny] = a.at(50, 19); return [nx, ny - 8]; };
    a.update = function (dt, S) {
      this.base(dt);
      const st = this.st, p = { eyes: this.eyes(), headPitch: 1, clap: 0, mouth: 0 };
      const gy = this.y - 7;
      if (this.state === 'balance') {
        const [nx, ny] = nose(); ball.x = nx + Math.sin(this.t * 2.2) * 1.5; ball.y = ny; ball.rot += dt * 2;
        if (st > this.next) { this.toss(); }
      } else if (this.state === 'toss') {
        p.clap = q(Math.abs(Math.sin(st * 9)), 0.5); p.eyes = 'happy'; p.mouth = 0.6;
        if (Math.floor(st * 9 / Math.PI) !== Math.floor((st - dt) * 9 / Math.PI)) sfx('clap', this.x, 0.5);
        ball.vy += 330 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += dt * 8;
        const [nx, ny] = nose();
        if (ball.vy > 0 && ball.y >= ny && Math.abs(ball.x - nx) < 8) { ball.vx = 0; this.squish(0.12); sfx('boing', this.x, 0.5); FX.sparks(nx, ny, 4); this.set('balance'); this.next = R(4, 8); }
        else if (ball.y > gy) { ball.y = gy; ball.vy = -ball.vy * 0.45; ball.vx *= 0.7; sfx('boing', ball.x, 0.4); if (Math.abs(ball.vy) < 40) { ball.vy = 0; this.set('fetch'); } }
      } else if (this.state === 'drop') {
        p.eyes = 'dizzy'; ball.vy += 330 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y > gy) { ball.y = gy; ball.vy = -ball.vy * 0.45; ball.vx *= 0.6; sfx('boing', ball.x, 0.4); if (Math.abs(ball.vy) < 40) { ball.vy = 0; this.set('fetch'); } }
      } else if (this.state === 'fetch') {
        ball.x += ball.vx * dt; ball.vx *= Math.exp(-dt * 2);
        const tx = ball.x - (this.flip ? -19 : 19), dx = tx - this.x;
        if (Math.abs(dx) > 2) { if (this.hop <= 0) { this.jump(80); this.x += Math.sign(dx) * 7; sfx('pat', this.x, 0.3); } this.x += Math.sign(dx) * Math.min(Math.abs(dx), 20 * dt); }
        else if (this.hop <= 0) { this.toss(0.7); }
      }
      if (this.dizzy > 0) p.eyes = 'dizzy';
      this.pose = p;
    };
    a.toss = function (k = 1) { ball.vy = -230 * k; ball.vx = R(-12, 12); this.set('toss'); this.squish(0.2); sfx('boing', this.x); };
    a.drop = function () { if (this.state === 'balance' || this.state === 'toss') { ball.vx = this.flip ? 40 : -40; ball.vy = -60; this.set('drop'); FX.sweat(this.x + 14, this.top()); } };
    a.extra = function (fb, tint) { Pix.draw(fb, Pix.get('ball', {}, tint), ball.x, ball.y, { rot: q(ball.rot, 0.39) }); };
    a.poke = function () { if (this.state === 'balance') this.toss(1.15); else { this.jump(120); sfx('bark', this.x); } return true; };
    a.hitBall = (px, py) => Math.hypot(px - ball.x, py - ball.y) < 11;
    return a;
  }

  /* ------------------------------ Dialga ------------------------------ */
  function dialga() {
    const a = new Actor('dialga', 0, 0, { shadow: 11, pad: 4, mode: 'ground', sayT: 0, roarT: 0, gemT: 0 });
    a.update = function (dt, S) {
      this.base(dt);
      if (this.sayT > 0) this.sayT -= dt;
      if (this.roarT > 0) this.roarT -= dt;
      this.gemT += dt;
      const st = this.st, p = { eyes: this.eyes(), mouth: this.roarT > 0 ? 1 : this.sayT > 0 ? q(Math.abs(Math.sin(this.sayT * 12)), 0.5) : 0, walk: 0, gem: 0 };
      if (this.mode === 'bubble') { this.y = this.home2 + Math.sin(this.t * 1.6) * 3; this.flip = Math.sin(this.t * 0.3) < 0; }
      if (this.state === 'idle') {
        if (this.sleepy && this.sayT <= 0) { p.eyes = 'closed'; }
        else if (this.mode === 'ground' && st > this.next) {
          const r = Math.random();
          if (r < 0.5) { this.tx = this.home + R(-22, 22); this.set('walk'); }
          else if (r < 0.8) { this.jump(150); FX.sparks(this.x, this.top(), 4, FX.C.cy); sfx('pop', this.x, 0.4); this.st = 0; }
          else { this.set('dance'); }
          this.next = R(2.5, 6);
        }
      } else if (this.state === 'walk') {
        const dx = this.tx - this.x;
        this.flip = dx < 0; this.x += Math.sign(dx) * Math.min(Math.abs(dx), 26 * dt); p.walk = q((this.t * 12) % 6.283, 1.047);
        if (Math.abs(dx) < 1) this.set('idle');
      } else if (this.state === 'dance') {
        p.eyes = 'happy'; this.flip = Math.sin(st * 6) > 0; if (this.hop <= 0 && st < 2) this.jump(100);
        if (Math.floor(st * 2) !== Math.floor((st - dt) * 2)) FX.notes(this.x, this.top(), 1);
        if (st > 2.2) this.set('idle');
      }
      if (this.dizzy > 0) p.eyes = 'dizzy';
      this.pose = p;
    };
    a.extra = function (fb) {
      const [gx, gy] = this.at(25.5, 24);
      FX.glow(fb, gx, gy, 7 + Math.sin(this.gemT * 3) * 2, hex('#6fd8ff'), 0.5 + Math.sin(this.gemT * 3) * 0.2);
      if (this.mode === 'bubble') {
        const cx = this.x, cy = this.y - 18, r = 23;
        for (let i = 0; i < 90; i++) { const an = i * 0.0698, px = Math.round(cx + Math.cos(an) * r), py = Math.round(cy + Math.sin(an) * r); fb.set(px, py, i % 9 < 7 ? FX.C.b : FX.C.w); }
        fb.set(cx - 12, cy - 15, FX.C.w); fb.set(cx - 13, cy - 14, FX.C.w); fb.set(cx - 14, cy - 12, FX.C.w);
      }
      if (this.state === 'idle' && this.sleepy && this.sayT <= 0) { const [nx, ny] = this.at(34, 15); snot(fb, nx, ny, this.t, 0.8); }
      if (this.sayT > 0) FX.say(fb, this.x + (this.flip ? -6 : 6), this.top() - 1);
    };
    return a;
  }

  /* --------------------------- Luvdisc arcs --------------------------- */
  // a Luvdisc that leaps from the sea along a parabola; lips follow the velocity
  function leaper(x0, x1, seaY, h, delay, o = {}) {
    const a = new Actor('luvdisc', x0, seaY, Object.assign({ layer: 'back', pivotY: 15, x0, x1, seaY, h, delay, dur: 1.3 }, o));
    a.update = function (dt) {
      this.base(dt);
      const k = (this.st - this.delay) / this.dur;
      if (k < 0 || k > 1) { this.hidden = true; if (k > 1) this.done = true; return; }
      if (this.hidden) { this.hidden = false; FX.drops(this.x0, this.seaY, 8, 0.8, this.layer); sfx('plop', this.x0, 0.5); }
      this.x = this.x0 + (this.x1 - this.x0) * k; this.y = this.seaY - 4 * this.h * k * (1 - k) + 15;
      const vx = this.x1 - this.x0, vy = -4 * this.h * (1 - 2 * k);
      this.flip = vx < 0; this.rot = q(this.flip ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx), 0.2);
      if (!this.kissed && k > 0.5) { this.kissed = true; FX.hearts(this.x, this.y - 18, 1, this.layer); }
      if (!this.splashed && k > 0.96) { this.splashed = true; FX.drops(this.x1, this.seaY, 8, 0.8, this.layer); sfx('plop', this.x1, 0.4); }
      this.pose = { eyes: k > 0.4 && k < 0.6 ? 'happy' : 'open', kiss: k > 0.4 && k < 0.6 ? 1 : 0, blush: 1 };
      this.clip = this.seaY + 1;
    };
    a.poke = function () { if (this.hidden) return false; FX.hearts(this.x, this.y - 14, 3, this.layer); sfx('kiss', this.x); return true; };
    return a;
  }

  return { Actor, hooks, snot, spheal, corphish, wingull, pelipper, chinchou, walrein, sealeo, dialga, leaper, R, chance, clamp, q };
})();
