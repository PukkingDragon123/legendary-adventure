/* ------------------------------------------------------------------
   Magic — the Adamant crystal hidden under a rock, the time–space
   portal, tiny Dialga, and the time-change wave (the new hour
   spreads out from Dialga while the old one stays frozen outside).
------------------------------------------------------------------- */
const Magic = (() => {
  const { clamp, lerp, mixc } = Scenery;
  const { hex, bayer4, bayer8, hash2 } = PX;
  const { rnd, pick, chance, gy, sy, wait, until } = Life;
  const TAU = Math.PI * 2;
  const S = { orb: 'hidden', rock: null, ox: 0, oy: 0, oyv: 0, ot: 0, glintT: 3, portal: null, dialga: null, shift: null, hintT: 0, seq: null, rockFrom: 0 };
  const C = {
    ink: hex('#1b2a4a'), w: hex('#ffffff'), c1: hex('#eaf8ff'), c2: hex('#bfe6ff'), c3: hex('#8cc6f2'), c4: hex('#5d97d6'), c5: hex('#3c69b0'),
    cyan: hex('#7ff6ff'), cyan2: hex('#35d4ff'), navy: hex('#0a0b2e'), indigo: hex('#2a1e72'), violet: hex('#6a3cc8'), pink: hex('#e07aff'), gold: hex('#ffe38a'),
  };

  /* ---- the Adamant crystal: faceted pale-blue gem ---- */
  const GEM = (() => {
    const W = 22, H = 20, g = new Uint32Array(W * H);
    const outline = [[3, 7], [7, 2], [13, 1], [18, 4], [20, 10], [17, 16], [11, 19], [5, 17], [1, 12]];
    const seeds = [[7, 6, 0], [13, 5, 1], [16, 10, 3], [10, 10, 1], [5, 12, 2], [12, 15, 3], [17, 14, 4], [4, 8, 0], [9, 3, 0]];
    const tones = [C.c1, C.c2, C.c3, C.c4, C.c5];
    const inside = (x, y) => Shape2D.inPoly(x, y, outline);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        let a = 1e9, b = 1e9, ka = 0;
        seeds.forEach(([sx, sy2, t], k) => { const d = (x - sx) ** 2 + (y - sy2) ** 2; if (d < a) { b = a; a = d; ka = k; } else if (d < b) b = d; });
        let c = tones[seeds[ka][2]];
        if (Math.sqrt(b) - Math.sqrt(a) < 0.7) c = seeds[ka][2] < 2 ? C.w : C.c3;
        g[y * W + x] = c;
      }
    // outline
    const o = g.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (o[y * W + x]) continue;
        if ((x > 0 && o[y * W + x - 1]) || (x < W - 1 && o[y * W + x + 1]) || (y > 0 && o[(y - 1) * W + x]) || (y < H - 1 && o[(y + 1) * W + x])) g[y * W + x] = C.ink;
      }
    g[4 * W + 8] = C.w; g[4 * W + 9] = C.w; g[5 * W + 8] = C.w;
    return { W, H, d: g };
  })();
  function drawGem(fb, cx, cy, x, y, t, fade = 0) {
    const X = Math.round(x - GEM.W / 2) - cx, Y = Math.round(y - GEM.H / 2) - cy;
    const sweep = ((t * 0.7) % 2.2) * 30 - 10;
    for (let yy = 0; yy < GEM.H; yy++)
      for (let xx = 0; xx < GEM.W; xx++) {
        let c = GEM.d[yy * GEM.W + xx];
        if (!c) continue;
        if (fade > 0 && bayer4(xx, yy) < fade) continue;
        if (c !== C.ink && Math.abs(xx + yy * 0.6 - sweep) < 1.5) c = C.w;
        fb.set(X + xx, Y + yy, c);
      }
  }

  /* ---- setup ---- */
  function init(G) {
    S.rock = Scene.S.rocks.find((r) => r.hasOrb);
    S.glintT = 2;
  }

  function rockPoked(r) {
    if (S.orb !== 'hidden') return;
    if (r === S.rock) {
      FX.sparkles(r.x0 + r.spr.w / 2, r.y0 + r.spr.h * 0.4, 3, r.spr.w * 0.6, C.w, C.cyan);
      if (r.pokes >= 2) reveal();
      else Game.sfx('twinkle', r.x, 0.5);
    }
  }

  function reveal() {
    const r = S.rock;
    S.orb = 'pop'; S.ot = 0;
    S.ox = r.x0 + r.spr.w / 2; S.oy = gy(S.ox) - 12; S.oyv = -240;
    S.rockFrom = r.x0; S.rockDir = r.x0 + r.spr.w / 2 < 900 ? -1 : 1;
    Game.sfx('chime', S.ox, 1);
    FX.sparkles(S.ox, S.oy - 10, 14, 50, C.w, C.cyan);
    FX.add({ type: 'ring', x: S.ox, y: S.oy - 10, r0: 4, r1: 46, life: 0.8, c: C.cyan, thick: true, c2: C.w, layer: 3 });
    Game.HUD.orb('found');
    const m = Game.mudkip;
    if (m && Math.abs(m.x - S.ox) < 500) { m.emote('shock', 1); m.happyT = 1.5; }
  }

  function summon() {
    if (S.orb !== 'float') return;
    S.orb = 'summon'; S.ot = 0;
    Game.sfx('portal', S.ox, 1);
    Game.lock = 0;
    const px = S.ox, py = S.oy - 64;
    S.portal = { x: px, y: py, r: 0, t: 0, open: true, parts: [] };
    S.seq = new Life.Task(summonSeq(px, py), 5);
  }
  function* summonSeq(px, py) {
    // the crystal rises and glows
    let e = 0;
    const y0 = S.oy;
    while (e < 0.7) { const dt = yield; e += dt; S.oy = lerp(y0, py + 4, Scenery.smooth(0, 1, e / 0.7)); if (Math.random() < dt * 30) FX.sparkles(S.ox, S.oy, 1, 20, C.w, C.cyan); }
    // portal tears open
    Game.shake(3);
    FX.add({ type: 'ring', x: px, y: py, r0: 2, r1: 70, life: 0.7, c: C.w, thick: true, c2: C.cyan, layer: 3 });
    e = 0;
    while (e < 0.8) { const dt = yield; e += dt; S.portal.r = Ease.outBack(Math.min(1, e / 0.8)); S.oy = py + Math.sin(e * 20) * 2; }
    S.orb = 'inside';
    // Dialga pops out
    const d = spawnDialga(px, py);
    d.mode = 'emerge'; d.visible = true;
    d.x = px; d.y = py + 30; d.vx = (Game.mudkip && Game.mudkip.x < px ? -1 : 1) * 70; d.vy = -260;
    d.yaw = d.vx < 0 ? Math.PI - 1.0 : 1.0;
    Game.sfx('dialga', px, 1);
    FX.confetti(px, py, 30);
    FX.sparkles(px, py, 16, 60, C.w, C.cyan);
    yield* until(() => d.mode === 'land', 3);
    Game.sfx('pat', d.x, 1);
    FX.poof(d.x, gy(d.x), Game.pal().sand[3], Game.pal().sand[2], 8, 5);
    yield* wait(0.3);
    // the portal closes with a flash
    e = 0;
    while (e < 0.45) { const dt = yield; e += dt; S.portal.r = 1 - Ease.inCubic(Math.min(1, e / 0.45)); }
    FX.add({ type: 'ring', x: px, y: py, r0: 4, r1: 40, life: 0.5, c: C.w, layer: 3 });
    FX.sparkles(px, py, 12, 30, C.w, C.cyan);
    S.portal = null;
    S.orb = 'used';
    Game.HUD.orb('dialga');
    yield* wait(0.2);
    d.say();
    // everybody's excited
    for (const m of Game.mons) if (m.kind === 'mudkip' || m.kind === 'mudkip-shiny') { if (Math.abs(m.x - d.x) < 700 && m.mode === 'land') m.doTask(celebrate(m, d), 2); }
  }
  function* celebrate(m, d) {
    m.emote('shock', 1);
    yield* wait(0.9);
    yield* m.walkTo(d.x + (m.x < d.x ? -60 : 60), 90);
    yield* m.dance(3.5);
  }

  /* ---- Dialga ---- */
  function spawnDialga(x, y) {
    if (S.dialga) return S.dialga;
    const d = new DialgaMon({ x, y });
    Game.mons.push(d);
    S.dialga = d;
    return d;
  }
  class DialgaMon extends Life.Mon {
    constructor(o) {
      super(typeof Dialga !== 'undefined' ? Dialga : Mudkip, { kind: 'dialga', x: o.x, y: o.y, yaw: 1.05, z: 2.6, qPose: 0.05, qFields: { walk: 0.52, gem: 0.25, mouth: 0.1 } });
      this.fake = typeof Dialga === 'undefined';
      this.sq = new Spring(260, 12);
      this.cool = 0; this.hover = 0; this.roarT = 0; this.happyT = 0;
    }
    headPt() { return this.at('top', 0, -2); }
    say() { FX.say(() => this.at('top', 2, 0), 2.4); Game.sfx('yo', this.x, 1); this.happyT = 1.6; }
    physics(dt, t) {
      if (this.mode === 'emerge') {
        this.vy += 700 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        const g = gy(this.x);
        if (this.y >= g && this.vy > 0) { this.y = g; this.mode = 'land'; this.sq.kick(1); }
        return;
      }
      const g = gy(this.x), s = sy(this.x);
      const overWater = g > s + 4;
      // hover over the sea on a little cloud of time sparkles
      const want = overWater ? 1 : 0;
      this.hover = Life.approach(this.hover, want, dt * 2.5);
      if (this.air > 0 || this.vair !== 0) {
        this.vair -= 900 * dt; this.air += this.vair * dt;
        if (this.air <= 0) { this.air = 0; if (this.vair < -150) this.sq.kick(0.8); this.vair = 0; }
      }
      const base = overWater ? s - 46 + Math.sin(t * 2.2) * 3 : g;
      this.y = lerp(g, base, this.hover) - this.air;
      if (this.hover > 0.2 && Math.random() < dt * 14) FX.sparkles(this.x + rnd(-20, 20), this.y + 4, 1, 6, C.w, C.cyan);
      this.cool = Math.max(0, this.cool - dt);
    }
    animate(dt, t) {
      const P = {};
      if (this.moving) this.phase += dt * 9;
      this.gait = Life.approach(this.gait, this.moving ? 1 : 0, dt * 6);
      P.walk = this.gait > 0.05 ? this.phase % TAU : 0;
      P.hop = this.sq.step(dt) * 0.4 + (this.air > 0 ? -0.1 : 0);
      P.gem = 0.35 + Math.sin(t * 3) * 0.15;
      P.tailWag = Math.sin(t * 2.4) * 0.3;
      P.headYaw = 0;
      P.mouth = 0.15;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 0.8; }
      if (this.roarT > 0) { this.roarT -= dt; P.roar = Math.min(1, Math.sin(Math.min(1, this.roarT / 0.9) * Math.PI) * 1.4); P.gem = 1; P.mouth = 1; }
      Object.assign(P, this.o);
      if (this.fake) this.pose = { mouth: P.mouth, eyes: P.eyes === 'happy' ? 'happy' : 'open', squash: P.hop };
      else this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* Life.wait(0.6);
      if (!this.stopAt) this.stopAt = Game.t + rnd(30, 45);
      for (;;) {
        if (Game.t > this.stopAt && !S.shift) { this.stopAt = Game.t + rnd(50, 80); yield* this.timeStop(); continue; }
        const m = Game.mudkip;
        const b = Game.ball;
        const r = Math.random();
        if (m && Math.abs(m.x - this.x) > 160 && r < 0.6) {
          const tx = m.x + (m.x < this.x ? 80 : -80);
          yield* this.walkTo(clamp(tx, 120, 2300), 70);
        } else if (b && !b.holder && Math.abs(b.x - this.x) < 300 && !Life.wet(b.x, 8) && r < 0.8) {
          yield* this.walkTo(b.x + (b.x < this.x ? 16 : -16), 80);
          if (Math.abs(b.x - this.x) < 40) { b.kick((b.x < this.x ? -1 : 1) * rnd(90, 150), -rnd(220, 300), this); Game.sfx('boing', b.x, 0.8); this.happyT = 0.6; }
        } else if (r < 0.9) {
          // a little time trick: hop and sparkle
          this.vair = 230; this.air = 0.5;
          FX.sparkles(this.x, this.y - 40, 8, 40, C.w, C.cyan);
          Game.sfx('twinkle', this.x, 0.5);
          yield* Life.wait(0.8);
        } else {
          yield* this.faceTo(chance(0.5) ? 1 : -1);
          yield* Life.wait(rnd(1, 2.5));
        }
        yield* Life.wait(rnd(0.3, 1.2));
      }
    }
    *timeStop() {
      let e = 0;
      while (e < 0.6) { const dt = yield; e += dt; this.o.roar = Math.min(1, e / 0.4); this.o.gem = 1; this.o.mouth = 0.8; }
      Game.frozen = 2.8; S.freezeT = 0; S.freezeAt = this.at('gem');
      Game.sfx('freeze', this.x, 1);
      Game.sfx('tick', this.x, 0.8);
    }
    onPoke() {
      if (this.mode === 'emerge' || S.shift || this.cool > 0) return;
      this.cool = 3;
      this.doTask((function* (d) {
        d.roarT = 0.9; Game.sfx('dialga', d.x, 1);
        yield* Life.wait(0.35);
        d.say();
        yield* Life.wait(0.35);
        timeShift(d);
        yield* Life.wait(2);
      })(this), 4);
    }
    onBonk() { this.happyT = 0; FX.emote('anger', () => this.headPt(), { life: 1.2 }); Game.sfx('grr', this.x, 0.6); }
    greet() { this.happyT = 1.2; FX.emote('note', () => this.headPt()); }
  }

  /* ---- time shift ---- */
  function timeShift(d) {
    const G = Game;
    const fb = G.fb();
    const gem = d.at('gem');
    const sx = gem[0] - G.cx, syy = gem[1] - G.cy;
    const snap = fb.d.slice();
    // frozen look for the old hour: a touch greyer and bluer
    const frozen = new Uint32Array(snap.length);
    const cache = new Map();
    for (let i = 0; i < snap.length; i++) {
      const c = snap[i];
      let f = cache.get(c);
      if (f === undefined) {
        const [r, g, b] = PX.rgbOf(c);
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
        f = PX.pack(cl(lerp(r, l, 0.4) * 0.9 + 4), cl(lerp(g, l, 0.4) * 0.94 + 8), cl(lerp(b, l, 0.4) * 0.96 + 26));
        cache.set(c, f);
      }
      frozen[i] = f;
    }
    const W = fb.w, H = fb.h;
    const maxR = Math.max(Math.hypot(sx, syy), Math.hypot(W - sx, syy), Math.hypot(sx, H - syy), Math.hypot(W - sx, H - syy)) + 24;
    S.shift = { t: 0, dur: 2.0, sx, sy: syy, frozen, maxR, W, H, cxAt: G.cx, cyAt: G.cy };
    G.lock = 2.1;
    G.setHour(G.hourIdx + 1);
    G.shake(3);
    G.sfx('timewave', d.x, 1);
    FX.add({ type: 'ring', x: gem[0], y: gem[1], r0: 2, r1: 30, life: 0.5, c: C.w, thick: true, c2: C.cyan, layer: 4 });
    // creatures react to the new hour
    for (const m of G.mons) if (m.newHour) m.newHour(G.hour());
    for (const m of G.mons) if ((m.kind === 'mudkip' || m.kind === 'mudkip-shiny') && m.mode === 'land' && !m.sleeping && G.hour() !== 'night' && Math.abs(m.x - d.x) < 600) m.doTask(m.dance(2.6), 2);
  }

  function postShift(fb) {
    const sh = S.shift;
    if (!sh) return;
    if (fb.w !== sh.W || fb.h !== sh.H) { S.shift = null; return; }
    const k = clamp(sh.t / sh.dur, 0, 1);
    const R = Ease.inOut(k) * sh.maxR;
    const band = 7;
    const d = fb.d, fr = sh.frozen, W = fb.w, H = fb.h;
    const cx = sh.sx, cy = sh.sy;
    const rIn = Math.max(0, R - band), rOut = R + band;
    const rIn2 = rIn * rIn, rOut2 = rOut * rOut;
    const src = d.slice(Math.max(0, Math.floor(cy - rOut - 8)) * W, Math.min(H, Math.ceil(cy + rOut + 8)) * W);
    const y0s = Math.max(0, Math.floor(cy - rOut - 8));
    const t = Game.t;
    for (let y = 0; y < H; y++) {
      const dy = y + 0.5 - cy, dy2 = dy * dy;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx;
        const dd = dx * dx + dy2;
        const i = row + x;
        if (dd > rOut2) {
          // outside the wave: the frozen old hour, with a clock-tooth fringe just beyond the front
          if (dd < (rOut + 5) * (rOut + 5)) {
            const a = Math.atan2(dy, dx);
            if (Math.sin(a * 36 + t * 2) > 0.45) { d[i] = C.cyan2; continue; }
          }
          d[i] = fr[i];
        } else if (dd >= rIn2) {
          // the wave front: displaced, glowing
          const dist = Math.sqrt(dd);
          const u = (dist - R) / band;
          const push = Math.sin(u * Math.PI) * 4;
          const sxp = Math.round(x - (dx / (dist || 1)) * push), syp = Math.round(y - (dy / (dist || 1)) * push) - y0s;
          let c = d[i];
          if (sxp >= 0 && sxp < W && syp >= 0 && syp * W < src.length) c = src[syp * W + sxp];
          const glow = 1 - Math.abs(u);
          c = mixc(c, glow > 0.75 ? C.w : C.cyan, glow * 0.7);
          d[i] = c;
        } else if (dd > (rIn - 50) * (rIn - 50)) {
          const dist = Math.sqrt(dd);
          const g = 1 - (rIn - dist) / 50;
          if (bayer4(x, y) < g * 0.5) d[i] = mixc(d[i], C.cyan, 0.18);
        }
      }
    }
    // giant clock ring ticks riding the front
    for (let k2 = 0; k2 < 60; k2++) {
      const a = (k2 / 60) * TAU - t * 0.6;
      const len = k2 % 5 === 0 ? 7 : 3;
      for (let j = 0; j < len; j++) {
        const rr = R + band + 2 + j;
        fb.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), k2 % 5 === 0 ? C.w : C.c2);
      }
    }
  }

  /* ---- portal drawing ---- */
  const tmp = { buf: new Uint32Array(0) };
  function drawPortal(fb, cx, cy, t) {
    const p = S.portal;
    if (!p || p.r <= 0.01) return;
    const X = p.x - cx, Y = p.y - cy;
    const RX = 34 * p.r, RY = 50 * p.r;
    const W = fb.w, H = fb.h, d = fb.d;
    // 1) vortex twirl on the scene around the portal
    const TR = 1.9;
    const x0 = Math.max(0, Math.floor(X - RX * TR)), x1 = Math.min(W - 1, Math.ceil(X + RX * TR));
    const y0 = Math.max(0, Math.floor(Y - RY * TR)), y1 = Math.min(H - 1, Math.ceil(Y + RY * TR));
    if (x1 <= x0 || y1 <= y0) return;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (tmp.buf.length < bw * bh) tmp.buf = new Uint32Array(bw * bh * 2);
    const B = tmp.buf;
    for (let y = 0; y < bh; y++) B.set(d.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + bw), y * bw);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - X) / RX, v = (y + 0.5 - Y) / RY;
        const r = Math.hypot(u, v);
        const i = y * W + x;
        if (r <= 1.0) {
          // 2) deep space swirl inside
          const a = Math.atan2(v, u);
          const sw = Math.sin(a * 3 + r * 9 - t * 5) * 0.5 + 0.5;
          const sw2 = Math.sin(a * 5 - r * 14 + t * 3.3) * 0.5 + 0.5;
          const q = sw * 0.6 + sw2 * 0.4 - r * 0.35;
          let c = q > 0.72 ? C.pink : q > 0.55 ? C.violet : q > 0.35 ? C.indigo : C.navy;
          if (r < 0.2) c = r < 0.1 ? C.w : C.cyan;
          else if (r < 0.32 && bayer4(x, y) < (0.32 - r) * 6) c = C.cyan;
          const sa = a + t * 1.2 + r * 3;
          const h = hash2(Math.floor(sa * 18), Math.floor(r * 22), 7);
          if (h > 0.93 && r > 0.25) c = h > 0.975 ? C.w : C.c2;
          if (r > 0.9) c = C.w;
          else if (r > 0.82) c = C.cyan;
          d[i] = c;
        } else if (r < TR) {
          const k = (TR - r) / (TR - 1);
          const ang = k * k * 2.2 * Math.sin(t * 0.8 + 1.3) + k * k * 0.8;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const ux = u * cs - v * sn, vy = u * sn + v * cs;
          const sxp = Math.round(X + ux * RX - 0.5) - x0, syp = Math.round(Y + vy * RY - 0.5) - y0;
          let c = sxp >= 0 && syp >= 0 && sxp < bw && syp < bh ? B[syp * bw + sxp] : d[i];
          if (r < 1.25) {
            // 3) gear teeth + glow on the rim
            const a = Math.atan2(v, u);
            const tooth = Math.sin(a * 14 - t * 2.4) > 0.3;
            if (r < 1.1 && tooth) c = C.cyan2;
            else c = mixc(c, C.cyan, (1.25 - r) * 2.2);
          } else if (bayer4(x, y) < k * 0.35) c = mixc(c, C.cyan, 0.25);
          d[i] = c;
        }
      }
    // 4) clock hands spinning inside
    const hand = (a, len, col) => { for (let j = 0; j < len; j++) fb.set(Math.round(X + Math.cos(a) * j * (RX / RY)), Math.round(Y + Math.sin(a) * j), col); };
    hand(t * 7, RY * 0.62, C.w);
    hand(t * 1.1, RY * 0.4, C.gold);
    // 5) streaks being pulled in
    if (Math.random() < 0.9) p.parts.push({ a: Math.random() * TAU, r: 2.3, s: rnd(0.9, 1.6) });
    for (let i = p.parts.length - 1; i >= 0; i--) {
      const q = p.parts[i];
      q.r -= 0.028 * q.s; q.a += 0.07 * q.s;
      if (q.r < 0.9) { p.parts.splice(i, 1); continue; }
      for (let j = 0; j < 4; j++) {
        const rr = q.r + j * 0.05, aa = q.a - j * 0.05;
        fb.set(Math.round(X + Math.cos(aa) * rr * RX), Math.round(Y + Math.sin(aa) * rr * RY), j === 0 ? C.w : C.cyan);
      }
    }
  }

  /* ---- hooks ---- */
  function update(dt, t) {
    if (S.orb === 'hidden' && S.rock) {
      S.glintT -= dt;
      if (S.glintT <= 0) {
        S.glintT = rnd(3.5, 6.5);
        const r = S.rock;
        FX.add({ type: 'spark', x: r.x0 + rnd(0.25, 0.75) * r.spr.w, y: r.y0 + rnd(0.1, 0.4) * r.spr.h, size: 2, life: 0.6, c: C.w, c2: C.cyan, layer: 3 });
      }
    }
    if (S.hintT > 0) {
      S.hintT -= dt;
      const r = S.rock;
      if (r && S.orb === 'hidden' && Math.random() < dt * 8) FX.add({ type: 'spark', x: r.x0 + rnd(0.2, 0.8) * r.spr.w, y: r.y0 + rnd(0, 0.5) * r.spr.h, size: 1 + (Math.random() * 2 | 0), life: 0.5, c: C.w, c2: C.cyan, layer: 3 });
    }
    if (S.orb === 'pop') {
      S.ot += dt;
      const r = S.rock;
      const k = Math.min(1, S.ot / 0.5);
      r.x0 = Math.round(S.rockFrom + S.rockDir * 30 * Ease.outCubic(k));
      S.oyv += 600 * dt; S.oy += S.oyv * dt;
      const floor = gy(S.ox) - 30;
      if (S.oy > floor && S.oyv > 0) { S.oy = floor; S.orb = 'float'; S.ot = 0; }
    } else if (S.orb === 'float') {
      S.ot += dt;
      S.oy = gy(S.ox) - 30 + Math.sin(S.ot * 2.4) * 3;
      if (Math.random() < dt * 5) FX.add({ type: 'spark', x: S.ox + rnd(-16, 16), y: S.oy + rnd(-14, 14), size: 1 + (Math.random() * 2 | 0), life: 0.5, c: C.w, c2: C.cyan, layer: 3 });
    }
    if (S.seq) { S.seq.step(dt); if (S.seq.done) S.seq = null; }
    if (S.portal) S.portal.t += dt;
    if (S.shift) { S.shift.t += dt; if (S.shift.t >= S.shift.dur) S.shift = null; }
  }
  function drawBack(fb, cx, cy, P, t, occ) { }
  function drawFront(fb, cx, cy, P, t) {
    if (S.orb === 'pop' || S.orb === 'float' || S.orb === 'summon') {
      // glow + shine rays behind the gem
      const X = S.ox - cx, Y = S.oy - cy;
      Scenery.glow(fb, X + 0.5, Y + 0.5, 30, P.key === 'night' ? C.cyan : C.c1, 0.5, null, null, 3, 0.25);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + t * 0.8;
        const len = 16 + Math.sin(t * 3 + k) * 5;
        for (let j = 12; j < len; j++) if ((j + k) % 2 === 0) fb.set(Math.round(X + Math.cos(a) * j), Math.round(Y + Math.sin(a) * j * 0.8), C.c1);
      }
      drawGem(fb, cx, cy, S.ox, S.oy, t);
    }
    drawPortal(fb, cx, cy, t);
    if (S.orb === 'inside' && S.portal) drawGem(fb, cx, cy, S.portal.x, S.portal.y, t, 0.5);
  }
  const frozenMap = new Map();
  function frozenCol(c) {
    let f = frozenMap.get(c);
    if (f === undefined) {
      const [r, g, b] = PX.rgbOf(c);
      const l = r * 0.3 + g * 0.59 + b * 0.11;
      const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
      f = PX.pack(cl(lerp(r, l, 0.65) * 0.85 + 6), cl(lerp(g, l, 0.65) * 0.9 + 12), cl(lerp(b, l, 0.65) * 0.95 + 36));
      frozenMap.set(c, f);
      if (frozenMap.size > 60000) frozenMap.clear();
    }
    return f;
  }
  function postFreeze(fb, cx, cy) {
    if (!(Game.frozen > 0)) return;
    const d = fb.d, W = fb.w, H = fb.h;
    const dg = S.dialga;
    for (let i = 0; i < d.length; i++) d[i] = frozenCol(d[i]);
    // Dialga stands outside of time: drawn again, in full colour, on top
    if (dg) dg.draw(fb, cx, cy, null);
    // a big ticking clock face around Dialga
    const at = S.freezeAt || (dg ? dg.at('gem') : [cx + W / 2, cy + H / 2]);
    const X = at[0] - cx, Y = at[1] - cy;
    const k = Math.min(1, (S.freezeT || 0) / 0.35);
    const R = 30 + k * 60;
    fb.ring(X + 0.5, Y + 0.5, R + 2, R + 2, C.cyan2);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const len = i % 5 === 0 ? 8 : 3;
      for (let j = 0; j < len; j++) {
        const px = Math.round(X + Math.cos(a) * (R - j)), py = Math.round(Y + Math.sin(a) * (R - j));
        fb.set(px, py, i % 5 === 0 ? C.w : C.c2);
        if (i % 5 === 0) fb.set(px + 1, py, C.w);
      }
    }
    const tick = Math.floor((S.freezeT || 0) * 2);
    const ha = -Math.PI / 2 + tick * (TAU / 12);
    for (let j = 0; j < R * 0.75; j++) fb.set(Math.round(X + Math.cos(ha) * j), Math.round(Y + Math.sin(ha) * j), C.cyan);
    for (let j = 0; j < R * 0.5; j++) fb.set(Math.round(X + Math.cos(-Math.PI / 2) * j), Math.round(Y + Math.sin(-Math.PI / 2) * j), C.w);
  }
  function updateFrozen(dt) {
    const before = S.freezeT || 0;
    S.freezeT = before + dt;
    if (Math.floor(S.freezeT * 2) !== Math.floor(before * 2)) Game.sfx('tick', S.dialga ? S.dialga.x : null, 0.7);
    if (Game.frozen - dt <= 0 && Game.frozen > 0) {
      // time snaps back
      Game.sfx('whoosh', S.dialga ? S.dialga.x : null, 0.9);
      if (S.freezeAt) FX.add({ type: 'ring', x: S.freezeAt[0], y: S.freezeAt[1], r0: 90, r1: 4, life: 0.35, c: C.w, thick: true, c2: C.cyan, layer: 4 });
      Game.shake(2);
    }
  }
  function post(fb, cx, cy) { postFreeze(fb, cx, cy); postShift(fb); }
  function pokeFirst(wx, wy) {
    if (Game.frozen > 0) { FX.sparkles(wx, wy, 2, 6, C.w, C.cyan); return true; }
    if ((S.orb === 'float' || S.orb === 'pop') && Math.hypot(wx - S.ox, wy - S.oy) < 16) { summon(); return true; }
    if (S.shift) return true;
    return false;
  }
  function orbButton() {
    if (S.orb === 'hidden' && S.rock) { S.hintT = 2.5; Game.panTo(S.rock.x0 + S.rock.spr.w / 2 + rnd(-120, 120), S.rock.y0 - 40); Game.sfx('twinkle', null, 0.4); }
    else if (S.orb === 'float' || S.orb === 'pop') Game.panTo(S.ox, S.oy);
    else if (S.dialga) Game.panTo(S.dialga.x, S.dialga.y - 40);
  }
  function clockButton() {
    if (S.dialga) { Game.panTo(S.dialga.x, S.dialga.y - 40); FX.emote('sparkle', () => S.dialga.headPt(), { life: 1 }); }
    else orbButton();
  }
  function drawMini(m, sx, sy2) {
    const blink = Math.sin(Game.t * 6) > 0;
    if ((S.orb === 'float' || S.orb === 'pop') && blink) { m.fillStyle = '#ffffff'; m.fillRect(Math.round(S.ox * sx) - 1, Math.round(S.oy * sy2) - 1, 3, 3); }
    if (S.dialga) { m.fillStyle = '#1b2240'; m.fillRect(Math.round(S.dialga.x * sx) - 2, Math.round((S.dialga.y - 30) * sy2) - 2, 5, 5); m.fillStyle = '#7ff6ff'; m.fillRect(Math.round(S.dialga.x * sx) - 1, Math.round((S.dialga.y - 30) * sy2) - 1, 3, 3); }
  }

  function restoreDialga() {
    if (S.dialga) return;
    const m = Game.mudkip;
    const x = m ? m.x + 90 : 600;
    const d = spawnDialga(x, gy(x));
    d.mode = 'land';
    S.orb = 'used';
    if (S.rock) S.rock.x0 += S.rock.x0 + S.rock.spr.w / 2 < 900 ? -30 : 30;
    Game.HUD.orb('dialga');
  }
  const sys = { init, update, updateFrozen, drawBack, drawFront, post, pokeFirst, rockPoked, orbButton, clockButton, drawMini, S, timeShift, spawnDialga, reveal, summon, restoreDialga };
  Game.systems.push(sys);
  return sys;
})();
