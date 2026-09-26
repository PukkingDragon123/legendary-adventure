/* ------------------------------------------------------------------
   Deep — sea life: the Luvdisc school tracing a heart around the reef,
   Kyogre gliding through the trench, Wailord surfacing far out to
   spout, Wingull over the horizon and shooting stars at night.
------------------------------------------------------------------- */
const Deep = (() => {
  const { clamp, lerp, mixc } = Scenery;
  const { hex, bayer4, hash2 } = PX;
  const { Mon, wait, until, rnd, pick, chance, gy, sy } = Life;
  const TAU = Math.PI * 2;
  const SP = {
    Luvdisc: typeof Luvdisc !== 'undefined' ? Luvdisc : null,
    Kyogre: typeof Kyogre !== 'undefined' ? Kyogre : null,
    Wailord: typeof Wailord !== 'undefined' ? Wailord : null,
  };

  /* ================================================================
     LUVDISC school
  ================================================================ */
  const HEART = { cx: 2280, cy: 770, sx: 10.5, sy: 6.2 };
  function heartAt(u) {
    const s = Math.sin(u), c = Math.cos(u);
    const x = 16 * s * s * s;
    const y = -(13 * c - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u));
    return [HEART.cx + x * HEART.sx, HEART.cy + y * HEART.sy];
  }
  class LuvdiscMon extends Mon {
    constructor(o) {
      super(SP.Luvdisc, { kind: 'luvdisc', x: o.x, y: o.y, yaw: 0.35, z: 1.8, qPose: 0.25, qYaw: 0.08, qFields: { wiggle: 0.25, tilt: 0.1, kiss: 0.5, blush: 0.5 }, shadow: false });
      this.k = o.k; this.mode = 'dive'; this.vx = 0; this.vy = 0; this.kissT = 0; this.happyT = 0; this.scatter = 0;
    }
    headPt() { return this.at('top', 0, -2); }
    physics() {}
    animate(dt, t) {
      const sp2 = Math.hypot(this.vx, this.vy);
      this.phase += dt * (5 + sp2 * 0.05);
      const P = { wiggle: Math.sin(this.phase), kiss: 0, tilt: clamp(Math.atan2(-this.vy, Math.abs(this.vx) + 20) * 0.7, -0.45, 0.45), blush: 0, eyes: this.blink(t, dt) ? 'blink' : 'open' };
      if (this.kissT > 0) { this.kissT -= dt; P.kiss = 1; P.eyes = 'happy'; P.blush = 1; }
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.blush = 1; }
      Object.assign(P, this.o);
      this.pose = P;
      if (Math.abs(this.vx) > 6) this.turn(this.vx > 0 ? 0.35 : Math.PI - 0.35, dt, 3.5);
    }
    onPoke(wx, wy) { School.scatterFrom(wx, wy); this.kissT = 1.3; Game.sfx('kiss', this.x, 1); FX.floatIcon('heart', this.x + 20, this.y - 60); }
  }
  const School = {
    fish: [], u: 0, scatterT: 0, kissT: 6, cx: HEART.cx, cy: HEART.cy,
    init(G) {
      if (!SP.Luvdisc) return;
      for (let k = 0; k < 5; k++) {
        const [x, y] = heartAt(-k * 1.2566);
        const f = new LuvdiscMon({ x, y, k });
        f.phase = k * 1.3;
        this.fish.push(f); G.mons.push(f);
      }
      G.school = this;
    },
    scatterFrom(wx, wy) {
      this.scatterT = 2.6;
      for (const f of this.fish) {
        const dx = f.x - wx, dy = f.y - wy, d = Math.hypot(dx, dy) || 1;
        f.vx = (dx / d) * rnd(160, 230); f.vy = (dy / d) * rnd(120, 200);
        f.happyT = 0;
        if (chance(0.6)) FX.floatIcon('heart', f.x, f.y - 50);
      }
      Game.sfx('whoosh', wx, 0.6);
      FX.bubbles(wx, wy, 8, World.SEA);
    },
    update(dt, t) {
      if (!this.fish.length) return;
      this.u += dt * 0.27;
      this.scatterT = Math.max(0, this.scatterT - dt);
      const m = Game.mudkip;
      let sx = 0, sy2 = 0;
      for (const f of this.fish) {
        const [tx, ty] = heartAt(this.u - f.k * 1.2566);
        let gx = tx + Math.sin(t * 0.9 + f.k) * 6, gyy = ty + Math.cos(t * 1.1 + f.k * 2) * 5;
        // a curious one visits Mudkip when it dives close
        if (m && m.mode === 'dive' && f.k === 2 && Math.hypot(m.x - f.x, m.y - f.y) < 260 && !this.scatterT) {
          const c = m.at('eyeN');
          gx = c[0] + (f.x < m.x ? -46 : 46); gyy = c[1] + 6;
          if (Math.hypot(gx - f.x, gyy - f.y) < 10 && f.kissT <= 0 && !f.kissed) {
            f.kissT = 0.9; f.kissed = true; m.happyT = 1.6;
            FX.floatIcon('heart', (f.x + m.x) / 2, f.y - 40); FX.floatIcon('heart', m.x, m.y - 80);
            Game.sfx('kiss', f.x, 0.9);
          }
        } else if (f.k === 2) f.kissed = false;
        const k = this.scatterT > 0 ? 0.6 : 3;
        const ax = (gx - f.x) * k - f.vx * (this.scatterT > 0 ? 0.6 : 2.2);
        const ay = (gyy - f.y) * k - f.vy * (this.scatterT > 0 ? 0.6 : 2.2);
        f.vx += ax * dt; f.vy += ay * dt;
        const sp2 = Math.hypot(f.vx, f.vy), mx = this.scatterT > 0 ? 260 : 120;
        if (sp2 > mx) { f.vx *= mx / sp2; f.vy *= mx / sp2; }
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.y = clamp(f.y, World.SEA + 150, gy(f.x) - 12);
        sx += f.x; sy2 += f.y;
      }
      this.cx = sx / this.fish.length; this.cy = sy2 / this.fish.length;
      // now and then two neighbours share a kiss
      this.kissT -= dt;
      if (this.kissT <= 0) {
        this.kissT = rnd(6, 11);
        const a = this.fish[Math.floor(Math.random() * (this.fish.length - 1))];
        const b = this.fish[a.k + 1];
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 200) {
          a.kissT = b.kissT = 0.8;
          FX.floatIcon('heart', (a.x + b.x) / 2, (a.y + b.y) / 2 - 50);
          Game.sfx('kiss', a.x, 0.5);
        }
      }
      // shy of Kyogre
      if (Kyo.m && Kyo.m.visible && Math.abs(Kyo.m.x - this.cx) < 300 && this.scatterT <= 0 && Kyo.m.y - this.cy < 260) this.scatterFrom(Kyo.m.x, Kyo.m.y);
    },
  };

  /* ================================================================
     KYOGRE — glides through the deep now and then
  ================================================================ */
  class KyogreMon extends Mon {
    constructor() {
      super(SP.Kyogre, { kind: 'kyogre', x: 4200, y: 1010, yaw: Math.PI - 0.25, scale: 0.55, z: 0.5, qPose: 0.25, qYaw: 0.1, qFields: { tail: TAU / 8, fin: 0.25, glow: 0.5, mouth: 0.5 }, shadow: false, haze: 0.28 });
      this.layer = 'far'; this.visible = false; this.mode = 'dive'; this.glowT = 0; this.solid = false;
    }
    headPt() { return this.at('head'); }
    physics() {}
    animate(dt, t) {
      this.phase += dt * 1.6;
      const night = Game.hour() === 'night' || Game.hour() === 'dusk';
      const P = { tail: (Math.floor((this.phase % TAU) / (TAU / 8)) * TAU) / 8, fin: Math.sin(this.phase) * 0.7, mouth: 0, eyes: 'open', glow: night ? 1 : 0, headPitch: 0, roll: 0 };
      if (this.glowT > 0) { this.glowT -= dt; P.glow = 1; P.mouth = 1; P.eyes = 'angry'; }
      Object.assign(P, this.o);
      this.pose = P;
      this.hazeC = Game.pal().waterRow[Math.min(Game.pal().waterRow.length - 1, Math.max(0, Math.round(this.y - World.SEA)))].a;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(qsNum('kyogre', rnd(25, 40)));
      for (;;) {
        // swim across the trench, entering from one side
        const right = chance(0.5);
        this.x = right ? World.W + 420 : 2200;
        const tx = right ? 2200 : World.W + 420;
        this.yaw = right ? Math.PI - 0.25 : 0.25;
        this.visible = true;
        this.y = rnd(990, 1040);
        const y0 = this.y;
        Game.sfx('whale', this.x, 0.7);
        let e = 0;
        while ((right ? this.x > tx : this.x < tx) && e < 90) {
          const dt = yield; e += dt;
          this.x += (right ? -1 : 1) * 62 * dt;
          this.y = y0 + Math.sin(e * 0.5) * 16;
          if (Math.random() < dt * 3) { const m = this.at('mouth'); FX.bubbles(m[0], m[1], 2, World.SEA); }
          if (Math.random() < dt * 0.12) Game.sfx('whale', this.x, 0.5);
        }
        this.visible = false;
        yield* wait(rnd(45, 80));
      }
    }
    onPoke(wx, wy) {
      this.glowT = 1.6;
      Game.sfx('whale', this.x, 1); Game.sfx('rumble', this.x, 0.8);
      Game.shake(4);
      const m = this.at('mouth');
      FX.add({ type: 'ring', x: m[0], y: m[1], r0: 10, r1: 120, life: 1, c: hex('#ffffff'), layer: 3 });
      FX.bubbles(m[0], m[1], 20, World.SEA);
      const mk = Game.mudkip;
      if (mk && mk.mode === 'dive' && Math.abs(mk.x - this.x) < 600) { mk.emote('shock', 1); }
    }
  }
  const Kyo = {
    m: null,
    init(G) { if (!SP.Kyogre) return; this.m = new KyogreMon(); G.mons.push(this.m); },
  };
  function qsNum(k, d) { const v = new URLSearchParams(location.search).get(k); return v === null ? d : +v; }

  /* ================================================================
     WAILORD — far out at sea, rises and spouts (with a rainbow)
  ================================================================ */
  const Wail = {
    c: null, state: 'away', t: 0, bx: 900, rise: 0, spout: [], nextT: 0, bow: 0,
    init() {
      if (!SP.Wailord) return;
      this.c = new Critters.Critter(SP.Wailord, { kind: 'wailord', yaw: 0.28, scale: 0.085, qPose: 0.25, qFields: { tail: 0.34, fin: 0.34, blow: 0.5 }, haze: 0.18 });
      this.nextT = qsNum('wailord', rnd(8, 16));
    },
    update(dt, t) {
      if (!this.c) return;
      this.t += dt;
      const c = this.c;
      if (this.state === 'away') {
        if (this.t > this.nextT) {
          // surface somewhere the player can see it
          const strip = -Math.round(Game.cam.x * 0.35) + 760 + Math.round(Game.VW * 0.1);
          this.state = 'rise'; this.t = 0; this.bx = rnd(0.25, 0.75) * Game.VW - strip; c.yaw = chance(0.5) ? 0.28 : Math.PI - 0.28;
        }
      } else if (this.state === 'rise') {
        this.rise = Math.min(1, this.t / 4);
        if (this.t > 4) { this.state = 'blow'; this.t = 0; }
      } else if (this.state === 'blow') {
        if (this.t > 0.6 && this.t < 3.2) this.emit(dt, 1);
        if (this.t > 0.6 && !this.blew) { this.blew = true; Game.sfx('spout', Game.cam.x + Game.VW / 2, 0.35); }
        if (this.t > 5) { this.state = 'sink'; this.t = 0; this.blew = false; }
      } else if (this.state === 'sink') {
        this.rise = Math.max(0, 1 - this.t / 5);
        if (this.t > 5) { this.state = 'away'; this.t = 0; this.nextT = rnd(28, 48); }
      }
      const P = Game.pal();
      const ph = t * 0.8;
      c.pose = { tail: Math.sin(ph) * 0.8, fin: Math.sin(ph + 1) * 0.6, mouth: this.state === 'blow' ? 0.3 : 0, eyes: this.happy > 0 ? 'happy' : 'open', blow: this.state === 'blow' && this.t < 0.6 ? 1 : 0, roll: 0 };
      if (this.happy > 0) this.happy -= dt;
      c.hazeC = P.farRow[Math.min(P.farRow.length - 1, 30)].a;
      for (let i = this.spout.length - 1; i >= 0; i--) {
        const p = this.spout[i];
        p.age += dt; p.vy += 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.age > p.life) this.spout.splice(i, 1);
      }
      this.bow = Scenery.clamp(this.bow + (this.state === 'blow' && this.t > 1 ? dt : -dt * 0.5), 0, 1);
    },
    emit(dt, power) {
      if (!this.hole) return;
      const n = Math.round(60 * dt * power) + 1;
      for (let i = 0; i < n; i++) this.spout.push({ x: this.hole[0] + rnd(-1.5, 1.5), y: this.hole[1], vx: rnd(-9, 9), vy: -rnd(55, 85) * power, age: 0, life: rnd(1.1, 1.6) });
    },
    // drawn inside the backdrop pass (bx/byy = strip offset on screen)
    draw(fb, cx, cy, P, t, bx, byy) {
      if (!this.c || this.state === 'away') return;
      const c = this.c;
      c.sprite(P);
      const s = c.spr;
      if (!s) return;
      const water = World.HORIZON + 26 - cy; // screen y of Wailord's waterline
      const sx = bx + this.bx;
      const hide = (1 - this.rise) * (s.h + 6);
      const top = Math.round(water - s.h * 0.42 + hide);
      const X0 = Math.round(sx - s.w / 2), W = fb.w;
      for (let y = 0; y < s.h; y++) {
        const Y = top + y;
        if (Y < 0 || Y >= fb.h || Y >= water) continue;
        for (let x = 0; x < s.w; x++) {
          const col = s.d[y * s.w + x];
          if (!col) continue;
          const X = X0 + x;
          if (X < 0 || X >= W) continue;
          fb.d[Y * W + X] = col;
        }
      }
      this.box = [X0 + cx, top + cy, s.w, Math.max(0, water - top)];
      // foam where the body meets the sea
      for (let x = 0; x < s.w; x++) {
        let hit = false;
        for (let y = Math.max(0, water - top - 2); y < Math.min(s.h, water - top + 1); y++) if (y >= 0 && s.d[y * s.w + x]) hit = true;
        if (hit) { fb.set(X0 + x, water, P.foam[0]); if ((x + Math.floor(t * 6)) % 5 === 0) fb.set(X0 + x - 2, water, P.foam[1]); }
      }
      // blowhole position (anchor → screen)
      const a = s.anchors && s.anchors.blowhole;
      this.hole = a ? [X0 - s.x0 + a[0], top - s.y0 + a[1]] : [sx, top + 4];
      // rainbow in the spray (day only)
      if (this.bow > 0 && (P.key === 'noon' || P.key === 'afternoon' || P.key === 'dawn')) {
        const cols = ['#ff5a5a', '#ffae45', '#ffe45a', '#6ae06a', '#5ab8ff', '#9a6aff'].map(hex);
        const R0 = 34, hx = this.hole[0] + 18, hy = this.hole[1] + 30;
        for (let k = 0; k < cols.length; k++)
          for (let a2 = Math.PI * 1.05; a2 < Math.PI * 1.95; a2 += 0.012) {
            const r = R0 - k * 1.6;
            const X = Math.round(hx + Math.cos(a2) * r * 1.4), Y = Math.round(hy + Math.sin(a2) * r);
            if (X < 0 || Y < 0 || X >= W || Y >= fb.h || Y >= water) continue;
            if (bayer4(X, Y) > this.bow * 0.55) continue;
            fb.d[Y * W + X] = mixc(fb.d[Y * W + X], cols[k], 0.5);
          }
      }
      // spout droplets
      for (const p of this.spout) {
        const X = Math.round(p.x), Y = Math.round(p.y);
        if (Y >= water) continue;
        const k = p.age / p.life;
        if (bayer4(X, Y) < k * 0.8) continue;
        fb.set(X, Y, k < 0.5 ? P.foam[0] : P.foam[1]);
        if (k < 0.4) fb.set(X, Y + 1, P.foam[1]);
      }
    },
    poke(wx, wy) {
      if (!this.box || this.state === 'away') return false;
      const [x0, y0, w, h] = this.box;
      if (wx < x0 || wx > x0 + w || wy < y0 || wy > y0 + h) return false;
      this.happy = 2;
      if (this.state !== 'blow') { this.state = 'blow'; this.t = 0.5; this.rise = 1; }
      else this.t = Math.min(this.t, 1);
      for (let i = 0; i < 40; i++) this.emit(0.05, 1.4);
      Game.sfx('spout', wx, 0.8);
      return true;
    },
  };

  /* ================================================================
     WINGULL over the horizon, CHINCHOU lights in the deep at night
  ================================================================ */
  const Gulls = {
    list: [],
    init() { for (let i = 0; i < 5; i++) this.list.push({ x: rnd(0, 2400), y: rnd(250, 420), vx: rnd(14, 26) * (chance(0.5) ? 1 : -1), ph: rnd(0, 6), bob: rnd(0, 6) }); },
    update(dt) { for (const g of this.list) { g.x += g.vx * dt; g.ph += dt * 7; if (g.x > 2600) g.x = -200; if (g.x < -200) g.x = 2600; } },
    draw(fb, cx, cy, P, t) {
      if (P.key === 'night') return;
      const cw = hex('#ffffff'), cb = hex('#5a8fd8');
      for (const g of this.list) {
        const X = ((g.x - cx * 0.3) % 2600 + 2600) % 2600 - 300;
        const Y = g.y - cy * 0.9 + Math.sin(t * 0.7 + g.bob) * 4;
        if (X < -10 || X > fb.w + 10 || Y < -10 || Y > fb.h) continue;
        if (Y + cy > World.SEA - 6) continue;
        Scenery.gull(fb, X, Y, g.ph, cw, cb);
      }
    },
  };


  const Meteors = {
    list: [], nextT: 6,
    spawn(x, y) { this.list.push({ x: x ?? rnd(0.1, 0.9), y: y ?? rnd(40, 260), vx: rnd(-260, -160), vy: rnd(70, 120), age: 0, life: 0.9 }); },
    update(dt) {
      const h = Game.hour();
      if (h === 'night' || h === 'dusk') { this.nextT -= dt; if (this.nextT <= 0) { this.nextT = rnd(5, 12); this.spawn(); } }
      for (let i = this.list.length - 1; i >= 0; i--) { const m = this.list[i]; m.age += dt; if (m.age > m.life) this.list.splice(i, 1); }
    },
    draw(fb, cx, cy, P, t) {
      if (P.key !== 'night' && P.key !== 'dusk') return;
      const w = hex('#ffffff'), c2 = hex('#bfe0ff');
      for (const m of this.list) {
        const X0 = m.x <= 1 ? m.x * fb.w : m.x - cx, Y0 = m.y - cy * 0.9;
        const X = X0 + m.vx * m.age, Y = Y0 + m.vy * m.age;
        for (let j = 0; j < 22; j++) {
          const px = Math.round(X - (m.vx / 60) * j * 0.5), py = Math.round(Y - (m.vy / 60) * j * 0.5);
          if (py + cy > World.SEA - 8) continue;
          if (j > 6 && bayer4(px, py) < j / 22) continue;
          fb.set(px, py, j < 3 ? w : c2);
        }
      }
    },
  };
  const sys = {
    init(G) { School.init(G); Kyo.init(G); Wail.init(); Gulls.init(); },
    update(dt, t) { School.update(dt, t); Wail.update(dt, t); Gulls.update(dt); Meteors.update(dt); },
    drawSky(fb, cx, cy, P, t) { Gulls.draw(fb, cx, cy, P, t); Meteors.draw(fb, cx, cy, P, t); },
    drawBackdrop(fb, cx, cy, P, t, bx, byy) { Wail.draw(fb, cx, cy, P, t, bx, byy); },
    pokeSky(wx, wy) {
      if (Wail.poke(wx, wy)) return true;
      const h = Game.hour();
      if (h === 'night' || h === 'dusk') { Meteors.spawn(wx + 60, wy - 30 + Game.cy * 0.9 - Game.cy); Game.sfx('twinkle', wx, 0.8); FX.sparkles(wx, wy, 3, 10); return true; }
      return false;
    },
    School, Kyo, Wail,
  };
  Game.systems.push(sys);
  return sys;
})();
