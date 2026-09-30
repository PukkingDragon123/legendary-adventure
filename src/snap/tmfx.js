/* ------------------------------------------------------------------
   TM FX — the extra TM moves (registered into Moves with Moves.add).
   None of these lie around in the world: each is taught by a host,
   trainer or challenge (see hosts.js and the Sunset Bar in bar.js).
     Flash         TM06  a burst of light: wakes and turns every nearby
                         Pokémon toward the camera, reveals camouflaged
                         ones, lights up the night (8 s cooldown)
     Rain Dance    TM07  summons rain for 30 s (40 s cooldown)
     Sunny Day     TM08  clears rain, fog and snow for 40 s: golden
                         rays (40 s cooldown)
     Quick Attack  TM09  a blink-fast dash with a speed trail: cross
                         gaps, bop Pokémon out of the way (3 s)
     Whirlpool     TM10  a spinning water vortex that pulls nearby
                         Pokémon in and spins them round (10 s)
------------------------------------------------------------------- */
const TMFX = (() => {
  if (typeof Moves === 'undefined' || !Moves.add) return {};
  const { rnd, hex, lerp, pick } = U;
  const near = (mk, R) => Mons.all.filter((m) => m !== mk && m.alive && m.visible && !m.layer && Math.hypot(m.x - mk.x, m.y - mk.y) < R);
  const T = { weatherT: 0, prev: null };

  // temporary weather: remembers the area's own weather and puts it back
  function weather(o, secs) {
    const W = Weather.W;
    if (!T.prev) T.prev = { rain: W.goal.rain, fog: W.goal.fog, snow: W.goal.snow, storm: W.storm, meteors: W.meteors, area: Game.areaId };
    Weather.set(Object.assign({ meteors: T.prev.meteors }, o));
    T.weatherT = secs;
  }
  function update(dt) {
    if (T.weatherT > 0) {
      T.weatherT -= dt;
      if (T.weatherT <= 0 && T.prev) { if (T.prev.area === Game.areaId) Weather.set(T.prev); T.prev = null; }
    }
  }
  const u0 = Moves.update; Moves.update = (dt) => { u0(dt); update(dt); };
  U.on && U.on('area', () => { T.weatherT = 0; T.prev = null; });

  Moves.add({ id: 'flash', name: 'Flash', col: hex('#fff07a'), tm: 'TM06', cool: 8, how: 'Win Hide & Seek with Marill on the Sunset Boardwalk.', desc: 'A burst of light! Pokémon wake up and look at you.',
    icon: ['...w...', 'w..w..w', '.w.w.w.', '..www..', '.w.w.w.', 'w..w..w', '...w...'],
    *run(mk) {
      let e = 0;
      while (e < 0.35) { const dt = yield; e += dt; mk.o.mouth = 0.4; mk.o.eyes = 'happy'; }
      const [hx, hy] = mk.headPt();
      Weather.W.flash = Math.max(Weather.W.flash, 0.85);
      Game.sfx('twinkle', mk.x, 1); Game.shake && Game.shake(1);
      FX.add({ type: 'ring', x: hx, y: hy, r0: 4, r1: 120, life: 0.5, c: 0xffffffff, layer: 4 });
      FX.add({ type: 'ring', x: hx, y: hy, r0: 2, r1: 70, life: 0.35, c: hex('#fff07a'), layer: 4 });
      FX.sparkles(hx, hy, 24, 60, 0xffffffff, hex('#fff07a'));
      for (const m of near(mk, 220)) {
        if (m.sleeping) { m.sleeping = false; }
        if (m.hidden && !m.arcade) m.hidden = false;
        m.emote('shock', 1);
        m.hear && m.hear('flash', mk.x, 0.4);
        if (m.doTask && !m.busy(3)) m.doTask((function* () { let t = 0; while (t < 1.6) { const dt = yield; t += dt; m.turn(m.face(mk.x > m.x ? 1 : -1, true), dt, 10); m.o.eyes = 'open'; } })(), 3);
      }
      while (e < 0.8) { const dt = yield; e += dt; mk.o.eyes = 'happy'; }
    } });

  Moves.add({ id: 'rain', name: 'Rain Dance', col: hex('#5a7ae8'), tm: 'TM07', cool: 40, how: 'Win Jump Rope with Spinda on the Sunset Boardwalk.', desc: 'Dance up a rain shower for 30 s. Water types love it!',
    icon: ['.wwww..', 'wwwwww.', 'wwwwwww', '.......', 'w.w.w..', '.w.w.w.', 'w.w.w..'],
    *run(mk) {
      let e = 0;
      while (e < 1.2) { const dt = yield; e += dt; mk.rot = Math.sin(e * 14) * 0.25; mk.o.eyes = 'happy'; mk.o.mouth = 0.6; if (Math.random() < dt * 12) FX.add({ type: 'drop', x: mk.x + rnd(-12, 12), y: mk.y - 30, vx: rnd(-20, 20), vy: -rnd(20, 60), g: 300, life: 0.6, c: 0xffffffff, c2: hex('#8ac8ff'), size: 1, floor: World.groundAt(mk.x), layer: 3 }); }
      mk.rot = 0;
      weather({ rain: 0.85, fog: 0.1, snow: 0, storm: 0 }, 30);
      Game.sfx('splash', mk.x, 0.8);
      HUD.toast('Rain Dance! It starts to pour...', { life: 2, col: hex('#5a7ae8') });
      for (const m of near(mk, 400)) { const ty = (DexData.S[m.dex] || {}).type || []; if (ty.includes('Water') || ty.includes('Grass')) m.emote('heart', 1.2); }
    } });

  Moves.add({ id: 'sunny', name: 'Sunny Day', col: hex('#ffa82a'), tm: 'TM08', cool: 40, how: 'Beat Nuzleaf at Type Battle in Weather Woods.', desc: 'Clears rain, fog and snow for 40 s. Golden light!',
    icon: ['w..w..w', '.w.w.w.', '..www..', 'wwwkwww', '..www..', '.w.w.w.', 'w..w..w'],
    *run(mk) {
      let e = 0;
      while (e < 0.9) { const dt = yield; e += dt; mk.o.headPitch = -0.2; mk.o.eyes = 'happy'; mk.o.mouth = 0.5; }
      weather({ rain: 0, fog: 0, snow: 0, storm: 0 }, 40);
      Game.sfx('chime', mk.x, 0.8);
      for (let i = 0; i < 16; i++) { const x = mk.x + rnd(-160, 160); for (let k = 0; k < 6; k++) FX.add({ type: 'spark', x: x + k * 3, y: mk.y - 140 + k * 22 + rnd(-4, 4), size: 1 + (k % 2), life: 0.5 + k * 0.08, c: 0xffffffff, c2: hex('#ffd24a'), layer: 4 }); }
      FX.sparkles(mk.x, mk.y - 30, 20, 50, 0xffffffff, hex('#ffd24a'));
      HUD.toast('Sunny Day! The clouds part.', { life: 2, col: hex('#ffa82a') });
      for (const m of near(mk, 400)) { const ty = (DexData.S[m.dex] || {}).type || []; if (ty.includes('Fire') || ty.includes('Grass')) m.emote('heart', 1.2); else if (m.sleeping && Math.random() < 0.5) m.sleeping = false; }
    } });

  Moves.add({ id: 'quick', name: 'Quick Attack', col: hex('#e8e8f8'), tm: 'TM09', cool: 3, how: 'Win Tag against Linoone on the Sunset Boardwalk.', desc: 'A blink-fast dash! Cross gaps and bop things.',
    icon: ['.......', 'ww..w..', '...www.', 'wwwwwww', '...www.', 'ww..w..', '.......'],
    *run(mk) {
      const d = mk.keyDir || mk.dirX();
      mk.turn(mk.face(d), 1, 99);
      Game.sfx('whoosh', mk.x, 0.9);
      let e = 0; const hitMons = new Set();
      if (mk.mode === 'land') { mk.vair = 150; mk.air = Math.max(mk.air, 1); }
      while (e < 0.26) {
        const dt = yield; e += dt;
        const sp = 560 * (1 - e / 0.4);
        if (mk.mode === 'swim') { mk.vx = d * 260; } else if (mk.mode === 'fall') { mk.vx = d * 300; } else { mk.x += d * sp * dt; }
        for (let k = 0; k < 3; k++) FX.add({ type: 'spark', x: mk.x - d * rnd(6, 26), y: mk.y - rnd(4, 18), size: 1, life: 0.25, c: 0xffffffff, c2: hex('#c8d8ff'), layer: 3 });
        for (const m of near(mk, 26)) if (!hitMons.has(m)) { hitMons.add(m); m.emote('swirl', 1); if (m.mode === 'land' && !m.busy(4)) { m.vair = 200; m.air = Math.max(m.air || 0, 0.5); } Game.sfx('bonk', m.x, 0.6); }
      }
      FX.add({ type: 'ring', x: mk.x + d * 8, y: mk.y - 10, r0: 2, r1: 14, life: 0.25, c: 0xffffffff, layer: 4 });
    } });

  Moves.add({ id: 'whirl', name: 'Whirlpool', col: hex('#2a6ac8'), tm: 'TM10', cool: 10, how: 'Win a shift behind the Sunset Bar with Lombre.', desc: 'A spinning vortex pulls nearby Pokémon in. Wheee!',
    icon: ['..www..', '.w...w.', 'w..w..w', 'w.w.w.w', 'w..ww.w', '.w....w', '..wwww.'],
    *run(mk, tx) {
      const d = mk.dirX(), cx = mk.x + d * 60;
      const wet = World.waterAt(cx) !== null;
      const cy = wet ? WorldRender.surfaceAt(cx, Game.t) + (mk.mode === 'swim' ? 20 : 0) : World.groundAt(cx) - 2;
      Game.sfx('splash', cx, 0.8);
      let e = 0; const caught = near({ x: cx, y: cy }, 110);
      for (const m of caught) m.emote('shock', 0.8);
      while (e < 1.6) {
        const dt = yield; e += dt;
        mk.o.mouth = e < 1.2 ? 0.8 : 0.2;
        for (let k = 0; k < 6; k++) { const a = e * 12 + k * 1.05, r = 26 - (e / 1.6) * 16 + (k % 2) * 6; FX.add({ type: 'spark', x: cx + Math.cos(a) * r, y: cy - 14 + Math.sin(a) * r * 0.45 - k * 3, size: 1 + (k % 2), life: 0.18, c: 0xffffffff, c2: hex('#5ab0ff'), layer: 3 }); }
        if (Math.random() < dt * 20) FX.add({ type: 'drop', x: cx + rnd(-20, 20), y: cy - rnd(4, 30), vx: rnd(-60, 60), vy: -rnd(40, 100), g: 380, life: 0.6, c: 0xffffffff, c2: hex('#8ac8ff'), size: 1, floor: cy + 2, layer: 3 });
        for (const m of caught) { if (!m.alive || m.arcade) continue; m.x = lerp(m.x, cx, Math.min(1, dt * 1.6)); m.rot = Math.sin(e * 16) * 0.5; if (m.o) m.o.eyes = 'happy'; }
      }
      for (const m of caught) { m.rot = 0; m.emote(pick(['swirl', 'note', 'heart']), 1.2); if (m.mode === 'land') { m.vair = 180; m.air = Math.max(m.air || 0, 0.5); } }
      FX.splashAt ? FX.splashAt(cx, cy, { power: 0.7, n: 12 }) : null;
    } });

  return Object.assign(T, { update, weather });
})();
