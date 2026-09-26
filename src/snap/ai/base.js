/* ------------------------------------------------------------------
   AI — shared movement bases for Pokémon brains: walkers (ground and
   docks), swimmers (free 2D inside a water body) and flyers (glide,
   circle, perch). Species classes extend these and map their motion
   onto model pose parameters.
------------------------------------------------------------------- */
const AI = (() => {
  const { clamp, lerp, rnd, pick, chance, approach } = U;
  const { wait, until } = Mons;
  const TAU = Math.PI * 2;
  const mk = () => Game.mudkip;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hourIs = (...h) => h.includes(Game.hour());
  const surf = (x) => WorldRender.surfaceAt(x, Game.t);

  class Walker extends Mons.Mon {
    constructor(sp, o) { super(sp, o); this.speed = o.speed ?? 45; this.minX = o.minX ?? 30; this.maxX = o.maxX ?? World.W - 30; }
    *wander(d = 160) { yield* this.walkTo(clamp(this.x + rnd(-d, d), this.minX, this.maxX), this.speed); }
    *idle(T = rnd(1.5, 4), act = 'idle') { this.setAct(act); let e = 0; while (e < T) { const dt = yield; e += dt; } }
    *napUntil(cond, T = 30) {
      this.sleeping = true; this.setAct('sleep', 0.3);
      let e = 0, z = 0;
      while (e < T && !cond() && this.sleeping) { const dt = yield; e += dt; z -= dt; this.o.eyes = 'closed'; if (z <= 0) { z = 2.2; FX.add({ type: 'icon', icon: 'swirl', x: this.headPt()[0] + 6, y: this.headPt()[1] - 4, vx: 6, vy: -10, life: 1.6, layer: 3 }); } this.setAct('sleep', Math.sin(e * 1.3) > 0.8 ? 0.8 : 0.3); }
      this.sleeping = false;
    }
  }

  class Swimmer extends Mons.Mon {
    constructor(sp, o) {
      super(sp, Object.assign({ mode: 'swim' }, o));
      this.mode = 'swim'; this.speed = o.speed ?? 50;
      this.box = o.box || { x0: 1100, x1: 2400, y0: World.SEA + 30, y1: World.SEA + 200 };
      this.vx = 0; this.vy = 0; this.noShadow = true;
    }
    spot() { const b = this.box; for (let k = 0; k < 20; k++) { const x = rnd(b.x0, b.x1), y = rnd(b.y0, b.y1); if (y < World.groundAt(x) - 16 && y > surf(x) + 12) return [x, y]; } return [this.x, this.y]; }
    *cruise(T = rnd(3, 7), act = 'swim') {
      const [tx, ty] = this.spot();
      this.setAct(act);
      yield* this.swimTo(tx, ty, this.speed, T);
    }
    *swimTo(tx, ty, speed = this.speed, T = 8, o = {}) {
      let e = 0;
      while (e < T) {
        const dt = yield; e += dt;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < 6) break;
        const s = Math.min(speed, d * 2);
        this.vx = lerp(this.vx, (dx / d) * s, dt * 2.5); this.vy = lerp(this.vy, (dy / d) * s, dt * 2.5);
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = Math.hypot(this.vx, this.vy);
        if (Math.abs(this.vx) > 4) this.turn(this.face(Math.sign(this.vx), true), dt, o.turn ?? 4);
        if (o.stop && o.stop()) break;
      }
    }
    physics(dt, t) {
      if (this.mode !== 'swim') return;
      const s = surf(this.x), g = World.groundAt(this.x);
      this.y = clamp(this.y, s + (this.swimTop ?? 10), g - (this.swimBot ?? 8));
    }
  }

  class Flyer extends Mons.Mon {
    constructor(sp, o) { super(sp, Object.assign({ mode: 'fly' }, o)); this.mode = 'fly'; this.speed = o.speed ?? 80; this.vx = 0; this.vy = 0; this.noShadow = false; this.flap = 0; this.perchAt = null; }
    *flyTo(tx, ty, speed = this.speed, o = {}) {
      for (let g = 0; g < 2400; g++) {
        const dt = yield;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < (o.near ?? 5)) break;
        const s = Math.min(speed, d * 2.5);
        this.vx = lerp(this.vx, (dx / d) * s, dt * (o.agile ?? 2)); this.vy = lerp(this.vy, (dy / d) * s, dt * (o.agile ?? 2));
        this.x += this.vx * dt; this.y += this.vy * dt; this.moving = s;
        if (Math.abs(this.vx) > 5) this.turn(this.face(Math.sign(this.vx), true), dt, 4);
        if (o.act) this.setAct(o.act, o.peak ? o.peak(d) : 0);
        if (o.stop && o.stop()) break;
      }
    }
    *circle(cx, cy, R, T, act = 'fly') {
      let e = 0, a = Math.atan2(this.y - cy, this.x - cx);
      const dir = chance(0.5) ? 1 : -1;
      while (e < T) {
        const dt = yield; e += dt;
        a += dir * dt * (this.speed / Math.max(40, R));
        const tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R * 0.35;
        this.vx = (tx - this.x) / Math.max(dt, 0.016); this.vy = (ty - this.y) / Math.max(dt, 0.016);
        this.x = lerp(this.x, tx, dt * 3); this.y = lerp(this.y, ty, dt * 3); this.moving = this.speed;
        if (Math.abs(this.vx) > 5) this.turn(this.face(Math.sign(this.vx), true), dt, 4);
        this.setAct(act);
      }
    }
    physics(dt, t) {
      if (this.mode === 'perch' && this.perchAt) { this.x = this.perchAt[0]; this.y = this.perchAt[1]; }
      if (this.mode === 'fly') { const g = World.groundAt(this.x); if (this.y > g - 6) this.y = g - 6; }
    }
  }

  // small ice floe for Walrein's Ice Beam (a floating platform)
  const floes = [];
  function makeFloe(x) {
    const f = { x, w: 40 + rnd(0, 16), t: 0, life: 40, rider: null, vx: rnd(-6, 6) };
    floes.push(f);
    return f;
  }
  function updateFloes(dt, t) {
    for (let i = floes.length - 1; i >= 0; i--) {
      const f = floes[i];
      f.t += dt; f.x += (f.vx + (typeof Wind !== 'undefined' ? (Wind.v - 0.4) * 10 : 0)) * dt;
      f.y = surf(f.x);
      if (f.t > f.life) { FX.splashAt(f.x, f.y, { power: 0.3, n: 6 }); floes.splice(i, 1); }
    }
  }
  function drawFloes(fb, cx, cy, t) {
    for (const f of floes) {
      const k = Math.min(1, (f.life - f.t) / 6);
      const w = Math.round(f.w * (0.5 + 0.5 * k)), x0 = Math.round(f.x - w / 2 - cx), y0 = Math.round(f.y - 3 - cy);
      for (let y = 0; y < 7; y++) for (let x = 0; x < w; x++) {
        const X = x0 + x, Y = y0 + y;
        if (X < 0 || Y < 0 || X >= fb.w || Y >= fb.h) continue;
        const edge = y === 0 || x === 0 || x === w - 1 || y === 6;
        const c = edge ? 0xff6a4a3a : y < 2 ? 0xfffff8f0 : y < 4 ? 0xfff0e4d8 : 0xffe8c8a8;
        fb.d[Y * fb.w + X] = edge ? U.mix(c, 0xff8a5a3a, 0.2) : c;
      }
    }
  }
  return { Walker, Swimmer, Flyer, mk, dist, hourIs, surf, floes, makeFloe, updateFloes, drawFloes, TAU };
})();
