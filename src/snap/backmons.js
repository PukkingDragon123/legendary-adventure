/* ------------------------------------------------------------------
   BackMons — Pokémon living in the background, far behind the lane:
   Wingull, Pelipper and Swellow flocks gliding across the sky, Mantine
   leaping out of the far sea, Wailmer spouting on the horizon, Swablu
   drifting over the treetops. They sit at a parallax depth (slower
   than the lane), take the haze of the distance, and can be
   photographed like anyone else.
------------------------------------------------------------------- */
const BackMons = (() => {
  const { rnd, pick, clamp } = U;
  const spc = (name) => { try { return (0, eval)(name); } catch (e) { return null; } };
  class BackMon extends Mons.Mon {
    constructor(o) {
      super(o.S, { kind: 'bg-' + o.dex, dex: o.dex, x: o.wx, y: 200, yaw: o.dir > 0 ? 0.45 : Math.PI - 0.45, z: 0, scale: o.scale, qPose: 0.12, persona: 'calm', mode: 'bg' });
      Object.assign(this, { bgMode: o.mode, p: o.p, wx: o.wx, vdir: o.dir, alt: o.alt || 0, spd: o.spd || 20, poseFn: o.pose, jumpT: rnd(2, 8), jump: 0, jumpLen: o.jumpLen || 1.3, ph: Math.random() * 6, doesJump: !!o.jump, spout: 0, spoutT: rnd(4, 12), doesSpout: !!o.spout });
      this.layer = o.mode === 'sea' ? 'sea' : 'far'; this.bg = true; this.always = true; this.noHD = true; this.noShadow = true; this.noJuice = true; this.senseR = 0;
    }
    senses() {}
    physics() {}
    hear() {}
    brain() { const me = this; return (function* () { for (;;) { const dt = yield; me.tick(dt || 0.016); } })(); }
    tick(dt) {
      this.wx += this.vdir * this.spd * dt;
      // stay around the camera: loop round when far off either side (in layer space)
      const cx = Game.cam ? Game.cam.x : 0, VW = Game.VW || 400, sx = (this.wx - cx) * this.p;
      if (sx > VW + 120) this.wx -= (VW + 240) / this.p; else if (sx < -120) this.wx += (VW + 240) / this.p;
      if (this.doesJump) { this.jumpT -= dt; if (this.jumpT <= 0) { this.jump += dt / this.jumpLen; if (this.jump >= 1) { this.jump = 0; this.jumpT = rnd(4, 11); } } }
      if (this.doesSpout) { this.spoutT -= dt; if (this.spoutT <= 0) { this.spout = Math.min(1, this.spout + dt); if (this.spoutT < -3) { this.spoutT = rnd(6, 14); this.spout = 0; } } }
    }
    animate(dt, t) { this.pose = Object.assign({ eyes: 'open' }, this.poseFn(t + this.ph, this)); }
    screenPos(cx, cy, t) {
      const hz = Stage.horizonS(cy), sx = Math.round((this.wx - cx) * this.p);
      if (this.bgMode === 'sea') { const seaS = World.SEA - cy; return [sx, Math.round(hz + (seaS - hz) * this.p)]; }
      return [sx, Math.round(hz - this.alt + Math.sin(t * 0.8 + this.ph) * 3)];
    }
    draw(fb, cx, cy) {
      const s = this.spr; if (!s) return;
      const t = Game.t, [sx, sy] = this.screenPos(cx, cy, t);
      const j = this.jump > 0 ? Math.sin(this.jump * Math.PI) : 0, lift = Math.round(j * s.h * 1.3);
      const X = sx - Math.round(s.w / 2), Y = (this.bgMode === 'sea' ? sy - Math.round(s.h * 0.55) : sy - s.h) - lift;
      this.x = sx + cx; this.y = Y + s.h + cy;
      const W = fb.w, H = fb.h, d = fb.d, idb = Stage.S.idOn ? Stage.S.idb : null;
      const haze = Pal.LOOK[Stage.S.hour].hazeC, hk = clamp(0.5 - this.p * 0.6, 0.12, 0.45);
      for (let yy = 0; yy < s.h; yy++) {
        const ty = Y + yy; if (ty < 0 || ty >= H) continue;
        if (this.bgMode === 'sea' && ty > sy + 1) continue; // under the surface
        for (let xx = 0; xx < s.w; xx++) {
          const c = s.d[yy * s.w + (this.flip ? s.w - 1 - xx : xx)]; if (!c) continue;
          const tx = X + xx; if (tx < 0 || tx >= W) continue;
          d[ty * W + tx] = U.mix(c, haze, hk); if (idb && this.layer === 'far') idb[ty * W + tx] = this.pid || 0;
        }
      }
      if (this.bgMode === 'sea') {
        // a ring of foam where it breaks the surface, splashes when it leaps
        const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = c; };
        for (let k = -Math.round(s.w * 0.4); k <= Math.round(s.w * 0.4); k++) if ((k + Math.floor(t * 6)) % 3) put(sx + k, sy + 1, 0xfff4f8ff);
        if (j > 0 && (this.jump < 0.15 || this.jump > 0.85)) for (let k = 0; k < 10; k++) put(sx + Math.round(Math.sin(k * 2.7) * s.w * 0.5), sy - Math.round(Math.abs(Math.sin(k * 1.9)) * 6), 0xffffffff);
        if (this.spout > 0.05) for (let k = 0; k < 14 * this.spout; k++) put(sx + Math.round(Math.sin(k * 2.3) * k * 0.3), Y - Math.round(k * this.spout), U.screen(0xffe0e8f0, 0xffffffff, 0.5));
      }
    }
    hit(wx, wy) { const s = this.spr; if (!s) return false; return Math.abs(wx - this.x) < s.w / 2 && wy < this.y && wy > this.y - s.h; }
    bounds() { const s = this.spr; if (!s) return { x0: 0, y0: 0, x1: 0, y1: 0 }; return { x0: this.x - s.w / 2, y0: this.y - s.h, x1: this.x + s.w / 2, y1: this.y }; }
    center() { const b = this.bounds(); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    headPt() { return [this.x, this.y - (this.spr ? this.spr.h : 10)]; }
    at() { return this.headPt(); }
    facing() { return 0.3; }
  }
  // how each background Pokémon moves (pose from time)
  const KIND = {
    wingull: { sp: 'Wingull', mode: 'sky', scale: 0.12, spd: 26, pose: (t) => ({ flap: Math.sin(t * 5) * 0.6, spread: 1 }) },
    pelipper: { sp: 'Pelipper', mode: 'sky', scale: 0.09, spd: 18, pose: (t) => ({ flap: Math.sin(t * 3) * 0.7, spread: 1, feet: 0 }) },
    swellow: { sp: 'Swellow', mode: 'sky', scale: 0.09, spd: 40, pose: (t) => ({ perch: 0, flap: t * 9, spread: 0.9 }) },
    taillow: { sp: 'Taillow', mode: 'sky', scale: 0.12, spd: 34, pose: (t) => ({ flap: Math.sin(t * 8) * 0.8, spread: 1 }) },
    swablu: { sp: 'Swablu', mode: 'sky', scale: 0.13, spd: 12, pose: (t) => ({ flap: Math.sin(t * 3), bob: Math.sin(t) }) },
    altaria: { sp: 'Altaria', mode: 'sky', scale: 0.1, spd: 10, pose: (t) => ({ flap: Math.sin(t * 1.6) * 0.6 }) },
    tropius: { sp: 'Tropius', mode: 'sky', scale: 0.08, spd: 12, pose: (t) => ({ flap: Math.sin(t * 2) * 0.8 }) },
    mantine: { sp: 'Mantine', mode: 'sea', scale: 0.12, spd: 14, jump: true, pose: (t, m) => ({ flap: Math.sin(t * 2.5) * (m.jump > 0 ? 1 : 0.3), pitch: m.jump > 0 ? (0.5 - m.jump) * 1.2 : 0 }) },
    wailmer: { sp: 'Wailmer', mode: 'sea', scale: 0.11, spd: 8, spout: true, pose: (t, m) => ({ swim: t * 1.5, blow: m.spout }) },
    luvdisc: { sp: 'Luvdisc', mode: 'sea', scale: 0.1, spd: 20, jump: true, jumpLen: 0.9, pose: (t) => ({ wiggle: Math.sin(t * 8) }) },
  };
  function add(G, dex, wx, o = {}) {
    const K = KIND[dex], S = K && spc(K.sp); if (!S) return null;
    const m = new BackMon(Object.assign({ S, dex, wx, dir: o.dir ?? (Math.random() < 0.5 ? 1 : -1), p: o.p ?? (K.mode === 'sea' ? 0.22 : 0.4), alt: o.alt ?? rnd(18, 46), spd: K.spd * rnd(0.8, 1.2), scale: K.scale * (o.k || 1), mode: K.mode, pose: K.pose, jump: K.jump, jumpLen: K.jumpLen, spout: K.spout }, o));
    if (!m.sp) return null;
    G.addMon(m); return m;
  }
  // a little flock: a few birds in a loose V, all going the same way
  function flock(G, dex, wx, n, o = {}) { const dir = o.dir ?? (Math.random() < 0.5 ? 1 : -1), alt = o.alt ?? rnd(22, 46); for (let i = 0; i < n; i++) add(G, dex, wx - dir * i * 18, Object.assign({}, o, { dir, alt: alt - Math.abs(i - (n - 1) / 2) * 6 + rnd(-2, 2), k: rnd(0.9, 1.05) })); }
  const SPAWN = {
    beach(G) {
      flock(G, 'wingull', 600, 3); flock(G, 'wingull', 4200, 2, { p: 0.3 }); add(G, 'pelipper', 2400, { alt: 35 }); flock(G, 'swellow', 7000, 2);
      add(G, 'mantine', 1800); add(G, 'mantine', 5200, { p: 0.18 }); add(G, 'wailmer', 3200, { p: 0.16 }); add(G, 'wailmer', 8800, { p: 0.2 });
      add(G, 'luvdisc', 2600, { p: 0.28 }); add(G, 'luvdisc', 6400, { p: 0.26 });
    },
    forest(G) { flock(G, 'swellow', 900, 2, { p: 0.35, alt: 40 }); flock(G, 'taillow', 3000, 3, { p: 0.4 }); add(G, 'tropius', 4200, { p: 0.3, alt: 35 }); },
    canopy(G) { add(G, 'swablu', 800, { alt: 30 }); add(G, 'swablu', 2000, { alt: 45 }); add(G, 'altaria', 3000, { p: 0.3, alt: 50 }); flock(G, 'wingull', 1500, 2, { p: 0.3 }); },
    stage(G) { flock(G, 'swablu', 900, 3, { p: 0.35, alt: 40 }); },
    volcano(G) { add(G, 'swablu', 1200, { p: 0.3, alt: 55 }); add(G, 'altaria', 2600, { p: 0.25, alt: 60 }); },
  };
  for (const id of Object.keys(SPAWN)) {
    const A = Areas[id]; if (!A) continue;
    const s0 = A.spawn;
    A.spawn = (a, G) => { if (s0) s0(a, G); try { SPAWN[id](G); } catch (e) { console.error(e); } };
  }
  function drawSea(fb, cx, cy) { for (const m of Mons.all) if (m.bg && m.bgMode === 'sea' && m.alive && m.visible) m.draw(fb, cx, cy); }
  return { BackMon, add, flock, drawSea, KIND };
})();
