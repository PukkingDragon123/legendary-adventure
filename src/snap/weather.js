/* ------------------------------------------------------------------
   Weather — rain (streaks, splashes, puddle rings, lightning), fog,
   snow, a meteor shower, and ambient life per area: fireflies,
   drifting leaves, pollen, bubbles, sparkles.
------------------------------------------------------------------- */
const Weather = (() => {
  const { clamp, rnd, mix, bayer4 } = U;
  const W = { rain: 0, fog: 0, snow: 0, meteors: 0, storm: 0, goal: { rain: 0, fog: 0, snow: 0 }, drops: [], flakes: [], amb: [], flash: 0, bolts: [], showers: [] };
  function set(o, instant = false) {
    Object.assign(W.goal, { rain: o.rain ?? 0, fog: o.fog ?? 0, snow: o.snow ?? 0 });
    W.storm = o.storm ?? 0; W.meteors = o.meteors ?? 0;
    if (instant) { W.rain = W.goal.rain; W.fog = W.goal.fog; W.snow = W.goal.snow; Stage.setWeather({ rain: W.rain, fog: W.fog }); }
  }
  function update(dt, t) {
    let ch = false;
    for (const k of ['rain', 'fog', 'snow']) {
      const g = W.goal[k];
      if (Math.abs(W[k] - g) > 0.001) { W[k] += clamp(g - W[k], -dt * 0.25, dt * 0.25); ch = true; }
    }
    if (ch) Stage.setWeather({ rain: Math.round(W.rain * 20) / 20, fog: Math.round(W.fog * 20) / 20 });
    const VW = Game.VW, VH = Game.VH;
    // rain streaks live in screen space
    const want = Math.round(W.rain * (Game.lowFx ? 90 : 170));
    while (W.drops.length < want) W.drops.push({ x: Math.random() * VW, y: Math.random() * VH, v: rnd(260, 380), l: rnd(3, 7) });
    if (W.drops.length > want) W.drops.length = want;
    const wind = (typeof Wind !== 'undefined' ? Wind.v : 0.4) * 60;
    for (const d of W.drops) {
      d.y += d.v * dt; d.x += wind * dt;
      const wx = d.x + Game.cam.x, wy = d.y + Game.cam.y;
      const s = WorldRender.surfaceAt(wx, t), g = World.groundAt(wx);
      const hitY = Math.min(s, g);
      if (wy >= hitY || d.y > VH) {
        if (wy >= hitY && Math.random() < 0.3) {
          if (s < g) FX.add({ type: 'ripple', x: wx, y: s + 1, r0: 0.5, r1: 3.5, flat: 0.35, life: 0.4, c: 0xffe8fbff, layer: 2 });
          else FX.add({ type: 'drop', x: wx, y: g - 1, vx: rnd(-20, 20), vy: -rnd(30, 60), g: 400, life: 0.3, c: 0xffd8ecff, size: 1, floor: g, layer: 2 });
        }
        d.y = -rnd(0, 40); d.x = Math.random() * (VW + 60) - 30;
      }
    }
    // snow
    const wantS = Math.round(W.snow * 140);
    while (W.flakes.length < wantS) W.flakes.push({ x: Math.random() * VW, y: Math.random() * VH, v: rnd(18, 40), ph: Math.random() * 6, s: Math.random() < 0.2 ? 2 : 1 });
    if (W.flakes.length > wantS) W.flakes.length = wantS;
    for (const f of W.flakes) { f.y += f.v * dt; f.x += (Math.sin(t * 1.3 + f.ph) * 12 + wind * 0.3) * dt; if (f.y > VH) { f.y = -4; f.x = Math.random() * VW; } if (f.x < -4) f.x += VW + 8; if (f.x > VW + 4) f.x -= VW + 8; }
    // lightning
    if (W.storm > 0 && W.rain > 0.6 && Math.random() < dt * 0.08 * W.storm) { W.flash = 1; W.bolts.push({ x: Math.random() * VW, t: 0.25, seed: Math.random() * 99 }); setTimeout(() => Game.sfx('rumble', null, 0.8), 400 + Math.random() * 900); }
    W.flash = Math.max(0, W.flash - dt * 3);
    for (const b of W.bolts) b.t -= dt;
    W.bolts = W.bolts.filter((b) => b.t > 0);
    // meteor shower
    if (W.meteors > 0 && Math.random() < dt * W.meteors * 1.2) W.showers.push({ x: rnd(0.1, 1.2) * VW, y: -10, vx: -rnd(120, 200), vy: rnd(90, 150), life: rnd(0.7, 1.4), t: 0, big: Math.random() < 0.15 });
    for (const m of W.showers) { m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; }
    W.showers = W.showers.filter((m) => m.t < m.life);
    // ambient life
    const A = Game.area;
    const amb = A && A.def.ambient ? A.def.ambient(Game.hour(), W) : null;
    if (amb) for (const a of amb) {
      if (Math.random() < dt * a.rate) {
        const x = Game.cam.x + Math.random() * VW, y = a.y ? a.y(x) : Game.cam.y + Math.random() * VH;
        W.amb.push(Object.assign({ x, y, t: 0, life: a.life || 6, ph: Math.random() * 6, vx: rnd(-6, 6), vy: rnd(-4, 4) }, a));
      }
    }
    for (const p of W.amb) { p.t += dt; p.x += (p.vx + (p.drift || 0) * wind * 0.2 + Math.sin(t * (p.wob || 1.3) + p.ph) * (p.sway || 8)) * dt; p.y += (p.vy + Math.cos(t * 0.9 + p.ph) * (p.bob || 5)) * dt; }
    W.amb = W.amb.filter((p) => p.t < p.life && p.x > Game.cam.x - 40 && p.x < Game.cam.x + VW + 40);
    if (W.amb.length > 140) W.amb.splice(0, W.amb.length - 140);
  }
  function draw(fb, cx, cy, t) {
    const d = fb.d, VW = fb.w, VH = fb.h;
    // ambient critters and motes
    for (const p of W.amb) {
      const x = Math.round(p.x - cx * (p.par ?? 1)), y = Math.round(p.y - cy * (p.par ?? 1));
      if (x < 1 || y < 1 || x >= VW - 1 || y >= VH - 1) continue;
      const k = Math.min(1, p.t / 0.6, (p.life - p.t) / 0.8);
      const i = y * VW + x;
      if (p.kind === 'firefly') {
        const on = 0.5 + 0.5 * Math.sin(t * 3 + p.ph);
        const a = on * k;
        if (a < 0.15) continue;
        d[i] = U.screen(d[i], p.c, a);
        const g = a * 0.45;
        d[i - 1] = U.screen(d[i - 1], p.c, g); d[i + 1] = U.screen(d[i + 1], p.c, g); d[i - VW] = U.screen(d[i - VW], p.c, g); d[i + VW] = U.screen(d[i + VW], p.c, g);
      } else if (p.kind === 'leaf') {
        const f = Math.sin(t * 5 + p.ph) > 0;
        d[i] = p.c; if (f) d[i + 1] = p.c2 || p.c; else d[i + VW] = p.c2 || p.c;
      } else if (p.kind === 'mote') { if (bayer4(x, y) < k * 0.8) d[i] = U.screen(d[i], p.c, 0.6); }
      else if (p.kind === 'bubble') { d[i] = U.screen(d[i], 0xffffffff, 0.6 * k); }
      else if (p.kind === 'sparkle') { const s = Math.sin(t * 6 + p.ph); if (s > 0.5) { d[i] = 0xffffffff; if (s > 0.85) { d[i - 1] = U.screen(d[i - 1], p.c, 0.7); d[i + 1] = U.screen(d[i + 1], p.c, 0.7); d[i - VW] = U.screen(d[i - VW], p.c, 0.7); d[i + VW] = U.screen(d[i + VW], p.c, 0.7); } } }
      else d[i] = p.c;
    }
    // meteors
    for (const m of W.showers) {
      const k = 1 - m.t / m.life, n = m.big ? 26 : 14;
      for (let j = 0; j < n; j++) {
        const x = Math.round(m.x - m.vx * j * 0.012), y = Math.round(m.y - m.vy * j * 0.012);
        if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
        const a = (1 - j / n) * k;
        d[y * VW + x] = U.screen(d[y * VW + x], j < 2 ? 0xffffffff : 0xffffe0a0, a);
        if (m.big && j < 6 && y + 1 < VH) d[(y + 1) * VW + x] = U.screen(d[(y + 1) * VW + x], 0xffc0e0ff, a * 0.6);
      }
    }
    // rain
    if (W.drops.length) {
      const c = Stage.S.hour === 'night' ? 0xffc0a890 : 0xfff0e2d8;
      const lean = (typeof Wind !== 'undefined' ? Wind.v : 0.4) * 0.2;
      for (const r of W.drops) {
        for (let j = 0; j < r.l; j++) {
          const x = Math.round(r.x - lean * j), y = Math.round(r.y - j);
          if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
          const i = y * VW + x;
          d[i] = mix(d[i], c, 0.35 - j * 0.03);
        }
      }
    }
    // snow
    for (const f of W.flakes) { const x = Math.round(f.x), y = Math.round(f.y); if (x >= 0 && y >= 0 && x < VW - 1 && y < VH - 1) { d[y * VW + x] = 0xffffffff; if (f.s > 1) { d[y * VW + x + 1] = 0xfff0f4ff; d[(y + 1) * VW + x] = 0xfff0f4ff; } } }
    // fog: soft horizontal bands drifting
    if (W.fog > 0.02) {
      const fc = Pal.LOOK[Stage.S.hour].hazeC;
      for (let y = 0; y < VH; y++) {
        const band = 0.5 + 0.5 * Math.sin((y + cy) * 0.035 + t * 0.2) * Math.sin((y + cy) * 0.011 - t * 0.13);
        const a = W.fog * (0.12 + band * 0.22) * (0.6 + 0.4 * (y / VH));
        if (a < 0.02) continue;
        const k = Math.round(a * 256);
        for (let x = 0; x < VW; x++) d[y * VW + x] = U.mixk(d[y * VW + x], fc, k);
      }
    }
    // lightning
    if (W.flash > 0) {
      for (const b of W.bolts) {
        let x = b.x, r = U.rng(b.seed * 1000);
        for (let y = 0; y < VH * 0.6; y++) { x += (r() - 0.5) * 4; const xi = Math.round(x); if (xi >= 0 && xi < VW) { d[y * VW + xi] = 0xffffffff; if (xi + 1 < VW) d[y * VW + xi + 1] = 0xfff8e0d0; } }
      }
      const k = Math.round(W.flash * 90);
      for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xfffff4ec, k);
    }
  }
  return { set, update, draw, get state() { return W; }, W };
})();
