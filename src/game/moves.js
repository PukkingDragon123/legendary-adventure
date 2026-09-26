/* ------------------------------------------------------------------
   Moves — Pokémon attacks as effects in the world: Walrein's Ice Beam
   (a crackling cyan beam that freezes a floe on the sea, which drifts
   on the waves and slowly melts) and sand that heaps into little
   piles where it lands, flattened again by the wind.
------------------------------------------------------------------- */
const Moves = (() => {
  const { hex, mix, bayer4, hash2 } = PX;
  const C = { ice: hex('#bff4ff'), ice2: hex('#7ad8f0'), ice3: hex('#3a9ac8'), w: hex('#ffffff') };
  const beams = [], floes = [];
  // Ice Beam from (x0, y0) toward the sea at x1
  function iceBeam(x0, y0, x1) {
    beams.push({ x0, y0, x1, t: 0, life: 0.9 });
    Game.sfx('freeze', x0, 1); Game.sfx('chime', x1, 0.4);
  }
  /* ---- sand piles: a height offset on top of the terrain, visual only ---- */
  const DX = 2, pile = new Float32Array(Math.ceil(World.W / DX) + 2);
  function addSand(x, amt = 0.35) { const i = Math.round(x / DX); for (let k = -2; k <= 2; k++) if (pile[i + k] !== undefined) pile[i + k] = Math.min(7, pile[i + k] + amt * (1 - Math.abs(k) / 3)); }
  function update(dt, t) {
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i]; b.t += dt;
      const sx = b.x1, sy = WorldRender.surfaceAt(sx, t);
      for (let k = 0; k < 3; k++) FX.add({ type: 'spark', x: sx + (Math.random() - 0.5) * 20, y: sy - Math.random() * 10, size: 2, life: 0.5, c: C.w, c2: C.ice2, layer: 3 });
      if (b.t > b.life) {
        beams.splice(i, 1);
        floes.push({ x: sx, w: 34 + Math.random() * 20, life: 14, age: 0, seed: Math.floor(Math.random() * 99) });
        Ripples.poke(sx, 60, 6); FX.splashAt(sx, sy, { power: 0.6, n: 10, c: C.ice, c2: C.ice2 }); Game.sfx('crack', sx, 0.8);
      }
    }
    for (let i = floes.length - 1; i >= 0; i--) { const f = floes[i]; f.age += dt; f.x += Wind.v * 6 * dt; if (f.age > f.life) { floes.splice(i, 1); FX.bubbles(f.x, World.SEA + 4, 6, World.SEA); } }
    // the wind slowly planes the piles flat again
    const k = dt * (0.02 + Wind.v * 0.06);
    for (let i = 0; i < pile.length; i++) if (pile[i] > 0) pile[i] = Math.max(0, pile[i] - k);
  }
  function drawFront(fb, cx, cy, P, t) {
    const W = fb.w, H = fb.h, d = fb.d;
    for (const b of beams) {
      const x1 = b.x1, y1 = WorldRender.surfaceAt(x1, t), n = Math.ceil(Math.hypot(x1 - b.x0, y1 - b.y0));
      const grow = Math.min(1, b.t / 0.2), len = n * grow;
      for (let s = 0; s < len; s++) {
        const u = s / n, x = b.x0 + (x1 - b.x0) * u - cx, y = b.y0 + (y1 - b.y0) * u - cy + Math.sin(s * 0.7 + b.t * 40) * 1.5;
        for (let w = -3; w <= 3; w++) {
          const X = Math.round(x), Y = Math.round(y + w);
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const a = Math.abs(w);
          d[Y * W + X] = a === 0 ? C.w : a === 1 ? C.ice : a === 2 ? mix(d[Y * W + X], C.ice2, 0.8) : (bayer4(X, Y) < 0.5 ? mix(d[Y * W + X], C.ice2, 0.4) : d[Y * W + X]);
        }
        if (s % 9 === 0) { const X = Math.round(x), Y = Math.round(y) - 4; for (const [ox, oy] of [[0, 0], [1, 1], [-1, 1], [0, 2]]) if (X + ox >= 0 && Y + oy >= 0 && X + ox < W && Y + oy < H) d[(Y + oy) * W + X + ox] = C.w; }
      }
      Post.glow(fb, b.x0 - cx, b.y0 - cy, 18, C.ice2, 0.6);
    }
    for (const f of floes) {
      const melt = 1 - f.age / f.life, w = Math.max(6, f.w * (0.4 + 0.6 * melt)), sy = WorldRender.surfaceAt(f.x, t);
      for (let x = -w / 2; x <= w / 2; x++) {
        const u = x / (w / 2), top = Math.round(sy - 4 - (1 - u * u) * 5 * melt - hash2(Math.round(x), f.seed, 1) * 2), bot = Math.round(sy + 3);
        const X = Math.round(f.x + x - cx);
        if (X < 0 || X >= W) continue;
        for (let y = top; y <= bot; y++) {
          const Y = y - cy;
          if (Y < 0 || Y >= H) continue;
          d[Y * W + X] = y === top ? C.w : y < top + 2 ? C.ice : y > sy ? mix(d[Y * W + X], C.ice3, 0.6) : C.ice2;
        }
      }
    }
    // sand piles: soft mounds with a lit crest
    const x0 = Math.max(0, Math.floor(cx / DX)), x1 = Math.min(pile.length - 1, Math.ceil((cx + W) / DX));
    for (let i = x0; i <= x1; i++) {
      const hgt = pile[i];
      if (hgt < 0.6) continue;
      const wx = i * DX, g = World.groundAt(wx);
      if (g > World.SEA) continue;
      for (let k = 0; k < DX; k++) {
        const X = wx + k - cx;
        if (X < 0 || X >= W) continue;
        const top = Math.round(g - hgt);
        for (let y = top; y < g; y++) { const Y = y - cy; if (Y >= 0 && Y < H) d[Y * W + X] = y === top ? P.sand[3] : P.sand[2]; }
      }
    }
  }
  const sys = { update, drawFront, iceBeam, addSand, floes };
  Game.systems.push(sys);
  return sys;
})();
