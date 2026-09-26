/* ------------------------------------------------------------------
   Critters — living things in the world. A Critter wraps a species
   model (Mudkip, Spheal, …): pose → cached, time-graded, cropped
   sprite; world placement; pixel-exact hit tests; anchors.
------------------------------------------------------------------- */
const Critters = (() => {
  const { clamp, lerp } = Scenery;

  /* ---- global sprite cache (LRU by bytes) ---- */
  const cache = new Map();
  let bytes = 0;
  const BUDGET = ((typeof navigator !== 'undefined' && navigator.deviceMemory) || 8) >= 4 ? 110 * 1024 * 1024 : 50 * 1024 * 1024;
  function cacheGet(k) {
    const s = cache.get(k);
    if (s) { cache.delete(k); cache.set(k, s); }
    return s;
  }
  function cachePut(k, s) {
    cache.set(k, s);
    bytes += s.bytes;
    while (bytes > BUDGET && cache.size > 1) {
      const [ok, ov] = cache.entries().next().value;
      cache.delete(ok);
      bytes -= ov.bytes;
    }
  }
  function dropTime(key) {
    for (const [k, v] of cache) if (v.time === key) { cache.delete(k); bytes -= v.bytes; }
  }

  /* ---- per-frame render budget: new poses wait if a frame is already busy ---- */
  const Budget = { left: 14, reset(ms = 14) { this.left = ms; }, warm: false };

  // crop a Creature render to its silhouette box (keeps blits and memory small)
  function crop(r, time) {
    const { buf } = r;
    const W = buf.w, H = buf.h, d = buf.d;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) if (d[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const out = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) out.set(d.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
    return { d: out, w, h, x0, y0, anchors: r.anchors, bytes: w * h * 4 + 200, time };
  }

  /* ---- render workers: creature sprites are ray-cast off the main thread ---- */
  const Pool = {
    workers: [], ready: false, queue: new Map(), pending: new Set(), names: new Map(),
    init(src) {
      try {
        if (!src || typeof Worker === 'undefined') return;
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
        for (let i = 0; i < n; i++) {
          const w = new Worker(url);
          w.busy = 0; w.ok = false;
          w.onmessage = (e) => this.onMsg(w, e.data);
          w.onerror = () => { w.dead = true; this.ready = this.workers.some((x) => x.ok && !x.dead); };
          this.workers.push(w);
        }
      } catch (e) { this.workers = []; }
    },
    onMsg(w, m) {
      if (m.ready) { w.ok = true; this.ready = true; this.pump(); return; }
      w.busy--;
      this.pending.delete(m.key);
      if (m.d) cachePut(m.key, { d: m.d, w: m.w, h: m.h, x0: m.x0, y0: m.y0, anchors: m.anchors, bytes: m.w * m.h * 4 + 200, time: m.time });
      this.pump();
    },
    request(id, job) {
      if (this.pending.has(job.key)) return;
      this.queue.set(id, job);
      this.pump();
    },
    pump() {
      for (const w of this.workers) {
        while (w.ok && !w.dead && w.busy < 2 && this.queue.size) {
          const [id, job] = this.queue.entries().next().value;
          this.queue.delete(id);
          if (cache.has(job.key) || this.pending.has(job.key)) continue;
          this.pending.add(job.key);
          w.busy++;
          w.postMessage(job);
        }
      }
    },
    nameOf(sp) {
      if (!this.names.size) {
        const reg = { Mudkip: typeof Mudkip !== 'undefined' ? Mudkip : null, Spheal: typeof Spheal !== 'undefined' ? Spheal : null, Sealeo: typeof Sealeo !== 'undefined' ? Sealeo : null, Walrein: typeof Walrein !== 'undefined' ? Walrein : null, Corphish: typeof Corphish !== 'undefined' ? Corphish : null, Luvdisc: typeof Luvdisc !== 'undefined' ? Luvdisc : null, Pelipper: typeof Pelipper !== 'undefined' ? Pelipper : null, Wailord: typeof Wailord !== 'undefined' ? Wailord : null, Kyogre: typeof Kyogre !== 'undefined' ? Kyogre : null, Dialga: typeof Dialga !== 'undefined' ? Dialga : null };
        for (const k in reg) if (reg[k]) this.names.set(reg[k], k);
      }
      return this.names.get(sp);
    },
  };

  const q = (v, s) => Math.round(v / s) * s;
  let uid = 0;

  class Critter {
    constructor(sp, o = {}) {
      this.sp = sp;
      this.id = o.id || 'c' + ++uid;
      this.kind = o.kind || 'critter';
      this.palId = o.palId || this.kind;
      this.basePal = o.pal || sp.PAL;
      this.x = o.x ?? 0; this.y = o.y ?? 0;
      this.vx = 0; this.vy = 0;
      this.yaw = o.yaw ?? 1.1; this.pitch = o.pitch ?? 0.16;
      this.scale = o.scale ?? 1;
      this.z = o.z ?? 1; // draw order (bigger = nearer)
      this.qy = o.qYaw ?? 0.04; this.qp = o.qPose ?? 0.04; this.qf = o.qFields || {};
      const m = sp.meta || { bw: 128, bh: 128, oy: 0.86 };
      this.SW = Math.ceil(m.bw * this.scale); this.SH = Math.ceil(m.bh * this.scale);
      this.OX = Math.floor(this.SW / 2); this.OY = Math.floor(this.SH * m.oy);
      this.pose = {};
      this.spr = null;
      this.haze = o.haze || 0; // blend toward a colour for far-away swimmers
      this.hazeC = o.hazeC || null;
      this.flip = false;
      this.visible = true;
      this.state = 'idle'; this.st = 0; // state + time in state
      this.blinkAt = 1 + Math.random() * 3; this.blinkT = 0;
      this.poked = 0; this.pokeT = -9;
      this.shadow = o.shadow ?? true;
      this.occV = o.occV ?? 2;
    }
    set(state) { this.state = state; this.st = 0; }
    blink(t, dt) {
      if (this.blinkT > 0) { this.blinkT -= dt; return true; }
      if (t > this.blinkAt) { this.blinkT = 0.13; this.blinkAt = t + 2 + Math.random() * 3; return true; }
      return false;
    }
    get dir() { return Math.cos(this.yaw) >= 0 ? 1 : -1; }
    // smooth turn toward a yaw (through the front, so turning shows the face)
    turn(target, dt, speed = 7) {
      const d = target - this.yaw;
      const step = speed * dt;
      this.yaw = Math.abs(d) <= step ? target : this.yaw + Math.sign(d) * step;
      return Math.abs(target - this.yaw) < 0.01;
    }
    face(dx, walk = true) { return dx >= 0 ? (walk ? 0.78 : 1.08) : Math.PI - (walk ? 0.78 : 1.08); }

    keyOf(P) {
      const pose = this.pose;
      let k = this.kind + '|' + this.palId + '|' + P.key + '|' + this.scale + '|' + q(this.yaw, this.qy).toFixed(3) + '|' + this.pitch + '|' + this.haze;
      for (const f in pose) {
        const v = pose[f];
        k += '|' + f + ':' + (typeof v === 'number' ? q(v, this.qf[f] || this.qp).toFixed(3) : v);
      }
      return k;
    }
    // quantised copy of the pose (so the model sees exactly what the key describes)
    qpose() {
      const o = {};
      for (const f in this.pose) { const v = this.pose[f]; o[f] = typeof v === 'number' ? q(v, this.qf[f] || this.qp) : v; }
      return o;
    }
    sprite(P, force = false) {
      const key = this.keyOf(P);
      let s = cacheGet(key);
      const useWorker = Pool.ready && !force && Pool.nameOf(this.sp);
      if (!s && (useWorker ? !Pool.pending.has(key) : force || Budget.left > 0 || !this.spr)) {
        const t0 = performance.now();
        const yaw = q(this.yaw, this.qy);
        const pose = this.qpose();
        pose.side = clamp(3 * Math.cos(yaw), -1, 1);
        const g = P.gradePal(this.basePal, this.palId);
        let pal = g.pal;
        if (this.haze && this.hazeC) {
          const hk = this.haze, hc = this.hazeC;
          const hkey = this.palId + '|haze|' + hk + '|' + hc;
          pal = P.palCache.get(hkey) || (P.palCache.set(hkey, Creature.grade(pal, (c, i) => PX.mix(c, hc, hk * (i === -2 ? 0.7 : 1)))), P.palCache.get(hkey));
        }
        const opt = { yaw, pitch: this.pitch, scale: this.scale, W: this.SW, H: this.SH, ox: this.OX, oy: this.OY, pal, light: g.light };
        if (useWorker) Pool.request(this.id, { key, sp: Pool.nameOf(this.sp), pose, opt, time: P.key });
        else {
          const r = this.sp.render(this.sp.build(pose), opt);
          s = crop(r, P.key);
          cachePut(key, s);
          Budget.left -= performance.now() - t0;
        }
      }
      if (s) this.spr = s;
      return this.spr;
    }
    // world position of the sprite's top-left
    ox() {
      const s = this.spr;
      if (!s) return Math.round(this.x) - this.OX;
      return this.flip ? Math.round(this.x) + this.OX - s.x0 - s.w + 1 : Math.round(this.x) - this.OX + s.x0;
    }
    oy() { return Math.round(this.y) - this.OY + (this.spr ? this.spr.y0 : 0); }
    draw(fb, cx, cy, occ) {
      const s = this.spr;
      if (!s || !this.visible) return;
      const X = this.ox() - cx, Y = this.oy() - cy;
      const W = fb.w, H = fb.h, d = fb.d;
      const x0 = Math.max(0, -X), x1 = Math.min(s.w, W - X), y0 = Math.max(0, -Y), y1 = Math.min(s.h, H - Y);
      if (x0 >= x1 || y0 >= y1) return;
      const occV = this.occV;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * s.w, trow = (Y + sy) * W + X;
        if (this.flip) {
          for (let sx = x0; sx < x1; sx++) { const c = s.d[row + s.w - 1 - sx]; if (c) { d[trow + sx] = c; if (occ) occ[trow + sx] = occV; } }
        } else {
          for (let sx = x0; sx < x1; sx++) { const c = s.d[row + sx]; if (c) { d[trow + sx] = c; if (occ) occ[trow + sx] = occV; } }
        }
      }
    }
    hit(wx, wy, pad = 0) {
      const s = this.spr;
      if (!s || !this.visible) return false;
      const lx = Math.round(wx) - this.ox(), ly = Math.round(wy) - this.oy();
      for (let dy = -pad; dy <= pad; dy++)
        for (let dx = -pad; dx <= pad; dx++) {
          let x = lx + dx;
          const y = ly + dy;
          if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
          if (this.flip) x = s.w - 1 - x;
          if (s.d[y * s.w + x]) return true;
        }
      return false;
    }
    // anchor in world space (falls back to the sprite top)
    at(name, fx = 0, fy = 0) {
      const s = this.spr;
      if (s && s.anchors && s.anchors[name]) {
        const a = s.anchors[name];
        const X = this.flip ? Math.round(this.x) + this.OX - a[0] : Math.round(this.x) - this.OX + a[0];
        return [X + fx, Math.round(this.y) - this.OY + a[1] + fy];
      }
      return [this.x + fx, this.top() + fy];
    }
    top() { return this.spr ? this.oy() : this.y - this.SH * 0.6; }
    bounds() { const s = this.spr; return s ? { x0: this.ox(), y0: this.oy(), x1: this.ox() + s.w, y1: this.oy() + s.h } : { x0: this.x, y0: this.y, x1: this.x, y1: this.y }; }
    center() { const b = this.bounds(); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    width() { return this.spr ? this.spr.w : this.SW * 0.6; }
  }

  /* ---- soft contact shadow on the sand ---- */
  function shadow(fb, cx, cy, x, y, rx, ry, k = 0.5) {
    const X = x - cx, Y = y - cy;
    const x0 = Math.floor(X - rx), x1 = Math.ceil(X + rx), y0 = Math.floor(Y - ry), y1 = Math.ceil(Y + ry);
    for (let yy = y0; yy <= y1; yy++) {
      if (yy < 0 || yy >= fb.h) continue;
      for (let xx = x0; xx <= x1; xx++) {
        if (xx < 0 || xx >= fb.w) continue;
        const u = (xx + 0.5 - X) / rx, v = (yy + 0.5 - Y) / ry;
        const dd = u * u + v * v;
        if (dd > 1) continue;
        if (PX.bayer4(xx, yy) >= (dd < 0.5 ? 1 : (1 - dd) * 2) * k) continue;
        const i = yy * fb.w + xx;
        fb.d[i] = Scenery.mixc(fb.d[i], shadowC, 0.32);
      }
    }
  }
  let shadowC = PX.hex('#2b3a6a');
  function setShadowColor(c) { shadowC = c; }

  /* ---- the beach ball: a real little physics toy ---- */
  class BeachBall {
    constructor(x, y) {
      this.kind = 'ball';
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.R = 11;
      this.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      this.w = 0; this.sq = 0; this.cache = new Map(); this.spr = null;
      this.holder = null; this.lastTouch = null; this.touchT = 0; this.floating = false; this.rest = 0;
      this.z = 1.5;
    }
    kick(vx, vy, who = null) {
      this.vx = vx; this.vy = vy; this.holder = null; this.lastTouch = who; this.touchT = 0; this.sq = 0.16;
      this.w = clamp(vx * 0.08, -14, 14);
    }
    step(dt, t) {
      this.touchT += dt;
      if (this.holder) {
        this.vx = this.vy = 0;
        if (this.holder.holdPt) { const p = this.holder.holdPt(this); this.x = p[0]; this.y = p[1]; }
        return;
      }
      const R = this.R;
      const surf = WorldRender.surfaceAt(this.x, t);
      const g = World.groundAt(this.x);
      const inWater = this.y + R * 0.2 > surf && g > surf + 2;
      this.floating = false;
      if (inWater) {
        // buoyant: bob on the surface, drift toward shore with the waves
        const target = surf - R * 0.55;
        this.vy += (target - this.y) * 40 * dt;
        this.vy *= Math.pow(0.02, dt);
        this.vx *= Math.pow(0.35, dt);
        this.vx += (World.shoreX - 40 - this.x > 0 ? 1 : -1) * 6 * dt;
        if (Math.abs(this.y - target) < 3) this.floating = true;
        if (this.y > surf + 4 && this.vy > 60 && Math.random() < 0.3) { FX.splashAt(this.x, surf, { power: 0.5, n: 8 }); }
      } else this.vy += 560 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      // ground contact
      const gy = World.groundAt(this.x);
      if (this.y + R > gy) {
        this.y = gy - R;
        if (this.vy > 70) {
          this.sq = 0.16;
          Game.sfx('boing', this.x, Math.min(1, this.vy / 400));
          FX.poof(this.x, gy, Game.pal().sand[3], Game.pal().sand[2], 3, 3);
        }
        this.vy = this.vy > 40 ? -this.vy * 0.62 : 0;
        const sl = World.slopeAt(this.x);
        this.vx += sl * 22 * dt * 10;
        this.vx *= Math.pow(0.4, dt);
        this.w = this.vx / R;
      }
      if (this.x < 20) { this.x = 20; this.vx = Math.abs(this.vx) * 0.6; }
      if (this.x > World.W - 20) { this.x = World.W - 20; this.vx = -Math.abs(this.vx) * 0.6; }
      // spin
      if (Math.abs(this.w) > 0.01) this.rot = M3.mul(Ball.axisAngle([0, 0, 1], -this.w * dt), this.rot);
      this.w *= Math.pow(0.6, dt);
      if (this.sq > 0) this.sq = Math.max(0, this.sq - dt);
      this.rest = Math.abs(this.vx) + Math.abs(this.vy) < 5 ? this.rest + dt : 0;
    }
    sprite(P) {
      const k = this.sq > 0 ? Math.sin((this.sq / 0.16) * Math.PI) * 0.18 : 0;
      const key = P.key + '|' + this.rot.map((v) => v.toFixed(1)).join(',') + '|' + k.toFixed(2);
      let s = this.cache.get(key);
      if (!s) {
        const g = P.ballPal || (P.ballPal = P.grader ? Ball.grade(P.grader) : null);
        s = Ball.render({ R: this.R, rot: this.rot, light: P.light, sx: 1 + k, sy: 1 - k, pal: g || undefined });
        this.cache.set(key, s);
        if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
      }
      this.spr = s;
      return s;
    }
    draw(fb, cx, cy, occ) {
      const s = this.spr;
      if (!s) return;
      const X = Math.round(this.x) - s.cx - cx, Y = Math.round(this.y) - s.cy - cy + (this.sq > 0 ? Math.round(Math.sin((this.sq / 0.16) * Math.PI) * 2) : 0);
      const W = fb.w, H = fb.h;
      for (let y = 0; y < s.buf.h; y++) {
        const ty = Y + y;
        if (ty < 0 || ty >= H) continue;
        for (let x = 0; x < s.buf.w; x++) {
          const tx = X + x;
          if (tx < 0 || tx >= W) continue;
          const c = s.buf.d[y * s.buf.w + x];
          if (!c) continue;
          fb.d[ty * W + tx] = c;
          if (occ) occ[ty * W + tx] = 2;
        }
      }
    }
    hit(wx, wy, pad = 3) { return Math.hypot(wx - this.x, wy - this.y) < this.R + pad; }
  }

  return { Critter, BeachBall, Budget, Pool, shadow, setShadowColor, dropTime, cacheStats: () => ({ n: cache.size, mb: (bytes / 1048576).toFixed(1), wk: Pool.ready ? Pool.workers.length : 0, q: Pool.queue.size }) };
})();
