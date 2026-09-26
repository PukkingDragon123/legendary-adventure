/* ------------------------------------------------------------------
   Space — rowboats moored along the dock, the Lustrous Orb hidden in
   one of them, and a tiny Palkia who tears spatial rifts: pop the orb
   out of its boat, poke it, and Palkia drops out of a shattered-glass
   rift. Poke Palkia and it opens a rift into the Time Gallery.
------------------------------------------------------------------- */
const Space = (() => {
  const { clamp, lerp } = Scenery;
  const { hex, mix, hash2, bayer4 } = PX;
  const { rnd, chance, gy, sy, wait } = Life;
  const TAU = Math.PI * 2;
  const S = { orb: 'hidden', boat: null, ox: 0, oy: 0, ovy: 0, palkia: null, rift: null, seq: null, glintT: 4, hintT: 0 };
  const C = { w: hex('#ffffff'), pink: hex('#ff8ac8'), pink2: hex('#ffc2e4'), lav: hex('#caa8ff'), mag: hex('#b03ab0'), deep: hex('#1a0a30'), k: hex('#2a1030') };
  const boats = [];
  const shadeOf = (h) => ({ dawn: 0.12, noon: 0, afternoon: 0.05, dusk: 0.22, night: 0.55 })[h] || 0;
  function init() {
    const P = World.PIER;
    boats.push({ x: P.x0 + 125, w: 74, hull: hex('#9a3a28'), band: hex('#f2ece0') }, { x: P.x0 + 305, w: 66, hull: hex('#7a2436'), band: hex('#f4f0ea') }, { x: P.x1 + 70, w: 80, hull: hex('#2e5a8e'), band: hex('#f2ece0') });
    for (const b of boats) Object.assign(b, { rock: 0, rv: 0, pokes: 0 });
    S.boat = boats[Math.floor(Math.random() * boats.length)];
  }
  function boatY(b, t) { return sy(b.x) - 10 + Math.sin(t * 1.3 + b.x) * 1.2; }
  function drawBoat(fb, cx, cy, b, t, P) {
    const k = shadeOf(Game.hour()), dim = (c) => mix(c, hex('#141a36'), k);
    const hull = dim(b.hull), hullD = dim(mix(b.hull, hex('#1a0a0a'), 0.45)), band = dim(b.band), inner = dim(hex('#3a2418')), ol = dim(hex('#1c1010'));
    const Y0 = boatY(b, t) - cy, hw = b.w / 2;
    for (let x = -hw; x <= hw; x++) {
      const u = x / hw, bow = u > 0.55 ? (u - 0.55) * 18 : 0, stern = u < -0.8 ? (-0.8 - u) * 8 : 0;
      const top = Math.round(Y0 - 7 - bow - stern + Math.sin(b.rock) * u * 6), bot = Math.round(Y0 + 7 - 7 * u * u + Math.sin(b.rock) * u * 6);
      const sx = Math.round(b.x - cx + x);
      if (sx < 0 || sx >= fb.w) continue;
      for (let y = top; y <= bot; y++) {
        if (y < 0 || y >= fb.h) continue;
        let c = y === top || y === bot || Math.abs(u) > 0.985 ? ol : y < top + 2 ? band : y < top + 4 ? inner : y > bot - 3 ? hullD : hull;
        if (y === top + 2 && Math.abs(u) < 0.75) c = inner;
        fb.d[y * fb.w + sx] = c;
      }
    }
    // oar resting across the boat
    const oy = Math.round(Y0 - 9), ox = Math.round(b.x - cx - hw * 0.4);
    for (let i = 0; i < 26; i++) { const x = ox + i, y = oy + Math.round(i * 0.25); if (x >= 0 && x < fb.w && y >= 0 && y < fb.h) fb.d[y * fb.w + x] = dim(hex('#8a6038')); }
  }
  // the pearl: pink-lavender, softly mottled like the official art
  function drawOrb(fb, cx, cy, x, y, t, k = 1) {
    const R = 7 * k, X = x - cx, Y = y - cy;
    for (let yy = Math.floor(Y - R - 1); yy <= Y + R + 1; yy++) for (let xx = Math.floor(X - R - 1); xx <= X + R + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= fb.w || yy >= fb.h) continue;
      const dx = (xx + 0.5 - X) / R, dy = (yy + 0.5 - Y) / R, d = dx * dx + dy * dy;
      if (d > 1.12) continue;
      let c;
      if (d > 0.92) c = C.k;
      else {
        const sw = Math.sin(dx * 4 + dy * 3 + t * 1.5) + Math.sin(dy * 5 - t);
        c = sw > 0.9 ? hex('#c8f0ff') : sw > 0 ? hex('#e8c8ec') : hex('#c89ad8');
        if (dx + dy > 0.7) c = mix(c, hex('#8a5aa8'), 0.4);
        if ((dx + 0.35) ** 2 + (dy + 0.4) ** 2 < 0.06) c = C.w;
      }
      fb.d[yy * fb.w + xx] = c;
    }
  }
  function glow(fb, x, y, r, col, a) {
    const cr = PX.rgbOf(col);
    for (let yy = Math.max(0, Math.floor(y - r)); yy < Math.min(fb.h, y + r); yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx < Math.min(fb.w, x + r); xx++) {
      const d = Math.hypot(xx - x, yy - y) / r;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * a;
      if (bayer4(xx, yy) > f * 2.5) continue;
      const i = yy * fb.w + xx, p = PX.rgbOf(fb.d[i]);
      fb.d[i] = PX.pack(Math.min(255, p[0] + cr[0] * f), Math.min(255, p[1] + cr[1] * f), Math.min(255, p[2] + cr[2] * f));
    }
  }
  /* ---- a spatial rift: jagged shattered-glass opening with radiating cracks ---- */
  function riftPoly(seed, r) {
    const pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + (hash2(i, seed, 1) - 0.5) * 0.5; const rr = r * (0.55 + hash2(i, seed, 2) * 0.55); pts.push([Math.cos(a) * rr * 0.8, Math.sin(a) * rr]); }
    return pts;
  }
  const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  function drawRift(fb, X, Y, r, t, seed = 3) {
    if (r < 1) return;
    const pts = riftPoly(seed, r);
    // cracks spread first
    for (let i = 0; i < 9; i++) {
      const [px, py] = pts[i], a = Math.atan2(py, px), L = r * (0.6 + hash2(i, seed, 5) * 0.9);
      let x = X + px, y = Y + py;
      for (let s = 0; s < L; s++) {
        x += Math.cos(a + Math.sin(s * 0.3 + i) * 0.4); y += Math.sin(a + Math.sin(s * 0.3 + i) * 0.4);
        const xx = Math.round(x), yy = Math.round(y);
        if (xx >= 0 && yy >= 0 && xx < fb.w && yy < fb.h) fb.d[yy * fb.w + xx] = s < L * 0.5 ? C.w : C.pink2;
      }
    }
    const x0 = Math.max(0, Math.floor(X - r)), x1 = Math.min(fb.w - 1, Math.ceil(X + r)), y0 = Math.max(0, Math.floor(Y - r)), y1 = Math.min(fb.h - 1, Math.ceil(Y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const lx = xx - X, ly = yy - Y;
      if (!inPoly(pts, lx, ly)) continue;
      const edge = !inPoly(pts, lx * 1.12, ly * 1.12);
      let c;
      if (edge) c = (xx + yy) % 2 ? C.w : C.pink;
      else {
        const a = Math.atan2(ly, lx), d = Math.hypot(lx, ly) / r;
        c = mix(C.deep, hex('#5a1e7a'), d);
        const arm = Math.sin(a * 2 - d * 6 + t * 3);
        if (arm > 0.5) c = mix(c, C.mag, (arm - 0.5) * 1.4);
        if (hash2(Math.floor(lx * 0.7 + t * 9), Math.floor(ly * 0.7), 3) > 0.97) c = C.w;
      }
      fb.d[yy * fb.w + xx] = c;
    }
    glow(fb, X, Y, r * 1.8, hex('#ff6ad0'), 0.35);
  }

  /* ---- Palkia ---- */
  class PalkiaMon extends Life.Mon {
    constructor(o) {
      super(typeof Palkia !== 'undefined' ? Palkia : Mudkip, { kind: 'palkia', x: o.x, y: o.y, yaw: 1.05, z: 2.55, scale: 0.72, qPose: 0.05, qFields: { walk: 0.52, gem: 0.25, mouth: 0.1 } });
      this.sq = new Spring(260, 12);
      this.cool = 0; this.hover = 0; this.roarT = 0; this.happyT = 0; this.blinkA = 1;
    }
    headPt() { return this.at('top', 0, -2); }
    physics(dt, t) {
      if (this.mode === 'emerge') {
        this.vy += 650 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        const g = gy(this.x);
        if (this.y >= g && this.vy > 0) { this.y = g; this.mode = 'land'; this.sq.kick(1); FX.poof(this.x, g, Game.P.sand[3], Game.P.sand[2], 8, 5); Game.sfx('thud', this.x, 0.8); Game.shake(2); }
        return;
      }
      const g = gy(this.x), s = sy(this.x), over = g > s + 4;
      this.hover = Life.approach(this.hover, over ? 1 : 0, dt * 2.5);
      if (this.air > 0 || this.vair !== 0) { this.vair -= 900 * dt; this.air += this.vair * dt; if (this.air <= 0) { this.air = 0; if (this.vair < -150) this.sq.kick(0.8); this.vair = 0; } }
      this.y = lerp(g, s - 48 + Math.sin(t * 2) * 3, this.hover) - this.air;
      if (this.hover > 0.2 && Math.random() < dt * 12) FX.sparkles(this.x + rnd(-20, 20), this.y + 4, 1, 6, C.w, C.pink);
      this.cool = Math.max(0, this.cool - dt);
    }
    animate(dt, t) {
      const P = {};
      if (this.moving) this.phase += dt * 9;
      this.gait = Life.approach(this.gait, this.moving ? 1 : 0, dt * 6);
      P.walk = this.gait > 0.05 ? this.phase % TAU : 0;
      P.hop = this.sq.step(dt) * 0.4 + (this.air > 0 ? -0.1 : 0);
      P.gem = 0.35 + Math.sin(t * 2.6) * 0.2;
      P.tailWag = Math.sin(t * 2) * 0.35;
      P.mouth = 0.15;
      P.eyes = this.blink(t, dt) ? 'blink' : 'open';
      if (this.happyT > 0) { this.happyT -= dt; P.eyes = 'happy'; P.mouth = 0.8; }
      if (this.roarT > 0) { this.roarT -= dt; P.roar = Math.min(1, Math.sin(Math.min(1, this.roarT / 0.9) * Math.PI) * 1.4); P.gem = 1; P.mouth = 1; }
      Object.assign(P, this.o);
      this.pose = P;
    }
    brain() { return this.life(); }
    *life() {
      yield* wait(0.8);
      for (;;) {
        const m = Game.mudkip, r = Math.random();
        if (m && Math.abs(m.x - this.x) > 180 && r < 0.55) yield* this.walkTo(clamp(m.x + (m.x < this.x ? 90 : -90), 120, 2300), 75);
        else if (r < 0.8) yield* this.blinkStep();
        else { this.vair = 220; this.air = 0.5; FX.sparkles(this.x, this.y - 40, 8, 40, C.w, C.pink); Game.sfx('twinkle', this.x, 0.5); yield* wait(0.8); }
        yield* wait(rnd(0.6, 1.6));
      }
    }
    // spatial hop: fold space, vanish in shards and pop out a little way off
    *blinkStep() {
      const to = clamp(this.x + (chance(0.5) ? -1 : 1) * rnd(60, 140), 140, 2300);
      shards(this.x, this.y - 30, 10); Game.sfx('whoosh', this.x, 0.5);
      this.visible = false;
      yield* wait(0.35);
      this.x = to; this.visible = true; this.sq.kick(0.8);
      shards(this.x, this.y - 30, 12); FX.sparkles(this.x, this.y - 30, 10, 30, C.w, C.pink); Game.sfx('chime', this.x, 0.4);
      yield* wait(0.4);
    }
    onPoke() {
      if (this.mode === 'emerge' || this.cool > 0 || S.rift) return;
      this.cool = 3;
      this.doTask((function* (p) {
        p.roarT = 0.9; Game.sfx('roar', p.x, 0.5); Game.sfx('dialga', p.x, 0.6);
        yield* wait(0.5);
        openRift(p);
        yield* wait(1);
      })(this), 4);
    }
    greet() { this.happyT = 1.2; FX.emote('heart', () => this.headPt()); }
  }
  function shards(x, y, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rnd(40, 120); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 120, size: 2, life: rnd(0.4, 0.8), c: C.w, c2: C.pink, layer: 3 }); }
  }
  function openRift(p) {
    const side = p.x < Game.cam.x + Game.VW / 2 ? 1 : -1;
    S.rift = { x: p.x + side * 100, y: p.y - 90, r: 0, t: 0, life: 9, gallery: true };
    Game.panTo(p.x + side * 50, p.y - 70);
    Game.sfx('crack', p.x, 1); Game.sfx('portal', p.x, 0.8); Game.shake(3);
    shards(S.rift.x, S.rift.y, 18);
  }

  /* ---- orb reveal + summon ---- */
  function reveal() {
    S.orb = 'pop'; S.ox = S.boat.x; S.oy = boatY(S.boat, Game.t) - 10; S.ovy = -200;
    Game.sfx('chime', S.ox, 1); FX.sparkles(S.ox, S.oy, 14, 30, C.w, C.pink);
    HUD();
  }
  function summon() {
    S.orb = 'summon';
    S.seq = new Life.Task((function* () {
      let e = 0;
      const y0 = S.oy, px = S.ox, py = S.oy - 70;
      Game.sfx('portal', px, 1);
      while (e < 0.8) { const dt = yield; e += dt; S.oy = lerp(y0, py, e / 0.8); if (Math.random() < 0.5) FX.sparkles(S.ox, S.oy, 1, 12, C.w, C.pink); }
      Game.sfx('crack', px, 1); Game.shake(4);
      S.rift = { x: px, y: py, r: 0, t: 0, life: 99, summon: true };
      e = 0;
      while (e < 0.7) { const dt = yield; e += dt; S.rift.r = Math.min(1, e / 0.5) * 38; }
      S.orb = 'used'; HUD();
      const g = gy(px);
      const p = new PalkiaMon({ x: px, y: py });
      p.mode = 'emerge'; p.vx = (Game.mudkip && Game.mudkip.x < px ? -60 : 60); p.vy = -120;
      Game.mons.push(p); S.palkia = p;
      shards(px, py, 24);
      yield* wait(1.4);
      e = 0;
      while (e < 0.5) { const dt = yield; e += dt; S.rift.r = 38 * (1 - e / 0.5); }
      S.rift = null;
      p.happyT = 1.5; FX.emote('heart', () => p.headPt());
      for (const m of Game.mons) if (m.kind === 'mudkip' || m.kind === 'mudkip-shiny') { m.happyT = 1.5; if (m.emote) m.emote('star'); }
    })(), 5);
  }
  function update(dt, t) {
    for (const b of boats) { b.rv += (-18 * b.rock - 1.5 * b.rv) * dt; b.rock += b.rv * dt; }
    if (S.orb === 'hidden') {
      S.glintT -= dt;
      if (S.glintT <= 0) { S.glintT = rnd(4, 7); FX.add({ type: 'spark', x: S.boat.x + rnd(-20, 20), y: boatY(S.boat, t) - 8, size: 2, life: 0.6, c: C.w, c2: C.pink, layer: 3 }); }
      if (S.hintT > 0) { S.hintT -= dt; if (Math.random() < dt * 8) FX.add({ type: 'spark', x: S.boat.x + rnd(-30, 30), y: boatY(S.boat, t) - rnd(4, 16), size: 2, life: 0.5, c: C.w, c2: C.pink, layer: 3 }); }
    }
    if (S.orb === 'pop' || S.orb === 'float') {
      const target = boatY(S.boat, t) - 42;
      S.ovy += (target - S.oy) * 8 * dt; S.ovy *= Math.exp(-dt * 2.5); S.oy += S.ovy * dt;
      if (S.orb === 'pop' && Math.abs(S.ovy) < 20) S.orb = 'float';
      if (Math.random() < dt * 6) FX.sparkles(S.ox, S.oy, 1, 16, C.w, C.pink);
    }
    if (S.seq) { S.seq.step(dt); if (S.seq.done) S.seq = null; }
    if (S.rift) {
      const r = S.rift; r.t += dt;
      if (r.gallery) {
        if (r.t < 0.5) r.r = (r.t / 0.5) * 34 + Math.sin(r.t * 30) * 2;
        else if (r.t > r.life) { r.r -= dt * 80; if (r.r <= 0) S.rift = null; }
        if (Math.random() < dt * 8) FX.add({ type: 'spark', x: r.x + rnd(-30, 30), y: r.y + rnd(-34, 34), size: 1, life: 0.5, c: C.w, c2: C.pink, layer: 3 });
      }
    }
  }
  function drawBack(fb, cx, cy, P, t) { for (const b of boats) if (b.x + b.w > cx && b.x - b.w < cx + fb.w) drawBoat(fb, cx, cy, b, t, P); }
  function drawFront(fb, cx, cy, P, t) {
    if (S.orb === 'pop' || S.orb === 'float' || S.orb === 'summon') { glow(fb, S.ox - cx, S.oy - cy, 22, hex('#ff8ad8'), 0.55); drawOrb(fb, cx, cy, S.ox, S.oy, t); }
    if (S.rift) drawRift(fb, S.rift.x - cx, S.rift.y - cy, S.rift.r, t, S.rift.summon ? 7 : 3);
  }
  function pokeFirst(wx, wy) {
    if ((S.orb === 'float' || S.orb === 'pop') && Math.hypot(wx - S.ox, wy - S.oy) < 14) { summon(); return true; }
    const r = S.rift;
    if (r && r.gallery && r.r > 20 && Math.hypot((wx - r.x) / 0.8, wy - r.y) < r.r) { r.life = 0; shards(r.x, r.y, 20); Gallery.enter(); return true; }
    for (const b of boats) {
      const by = boatY(b, Game.t);
      if (Math.abs(wx - b.x) < b.w / 2 + 2 && wy > by - 16 && wy < by + 8) {
        b.rv += (wx < b.x ? -1 : 1) * 4; Ripples.poke(b.x, 50, 6); FX.splashAt(b.x + (wx < b.x ? -b.w / 2 : b.w / 2), sy(b.x), { power: 0.35, n: 6 }); Game.sfx('knock', b.x, 0.8);
        if (b === S.boat && S.orb === 'hidden') { b.pokes++; FX.sparkles(b.x, by - 10, 4, 30, C.w, C.pink); if (b.pokes >= 2) reveal(); else Game.sfx('twinkle', b.x, 0.5); }
        return true;
      }
    }
    return false;
  }
  // HUD button: the pink orb (grey until found)
  const ORB_I = ['...kkk...', '.kkppkk..', 'kpwwppk..', 'kpwppppk.', 'kppppplk.', 'kppplllk.', '.kpllllk.', '..kkkkk..'];
  const ORB_G = ['...ggg...', '.gg...gg.', 'g.......g', 'g.......g', 'g.......g', 'g.......g', '.g.....g.', '..ggggg..'];
  function svg(map, cols) {
    let r = '';
    map.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${cols[ch]}"/>`; }));
    return `<svg viewBox="-1 -1 ${map[0].length + 2} ${map.length + 2}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }
  function HUD() {
    const b = document.getElementById('b-lorb');
    if (!b) return;
    b.innerHTML = svg(S.orb === 'hidden' ? ORB_G : ORB_I, { k: '#2a1030', p: '#e8b8ec', w: '#ffffff', l: '#b884d0', g: '#8f98b8' });
    b.classList.toggle('lit', S.orb !== 'hidden');
  }
  function button() {
    if (S.orb === 'hidden') { S.hintT = 2.5; Game.panTo(S.boat.x + rnd(-150, 150), boatY(S.boat, Game.t) - 60); Game.sfx('twinkle', null, 0.4); }
    else if (S.orb === 'float' || S.orb === 'pop') Game.panTo(S.ox, S.oy);
    else if (S.palkia) Game.panTo(S.palkia.x, S.palkia.y - 40);
  }
  const sys = {
    init() {
      init();
      const b = document.getElementById('b-lorb');
      if (b) { b.setAttribute('aria-label', 'Lustrous Orb'); b.addEventListener('click', (e) => { e.stopPropagation(); button(); }); }
      HUD();
    },
    update, drawBack, drawFront, pokeFirst, S, boats, drawRift, drawOrb, summon, reveal,
  };
  Game.systems.push(sys);
  return sys;
})();
