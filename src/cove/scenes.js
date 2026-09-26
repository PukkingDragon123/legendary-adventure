/* ------------------------------------------------------------------
   Scenes — five paintings of the cove plus a new reef, each with its
   own little cast. Dialga is the only way between them: time warps
   hop between dawn, noon, dusk and night; space warps reach the open
   sea and the reef.
------------------------------------------------------------------- */
const Scenes = (() => {
  const { hex, mix, Buf, bayer4, fbm } = PX;
  const { R, chance, clamp, q } = Cast;
  const W = 384, H = 216;
  const G = { orb: 'hidden', dia: null, onDialga: () => {}, sfx: () => {}, shake: () => {} };
  const sfx = (n, x, v) => G.sfx(n, x, v);
  const tint = (key, mul, add, k = 1) => ({ key, fn: Paintings.tintFn(mul, add, k) });
  const outBack = (t) => { const c = 1.9; t = clamp(t, 0, 1); return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

  function base(o) {
    const S = Object.assign({ actors: [], t: 0, tint: null, extras: [] }, o);
    S.stepCast = (dt) => { S.t += dt; for (const a of S.actors) a.update(dt, S); };
    S.drawCast = (fb, layer) => {
      const list = S.actors.filter((a) => a.layer === layer && !a.hidden).sort((a, b) => a.y - b.y);
      for (const a of list) a.draw(fb, S.tint);
    };
    S.tapCast = (x, y) => {
      const rank = { front: 2, back: 1, far: 0 };
      const list = S.actors.filter((a) => !a.hidden && a.poke).sort((a, b) => (rank[b.layer] - rank[a.layer]) || (b.y - a.y));
      for (const a of list) if (a.hit(x, y) && a.poke(S)) return true;
      return false;
    };
    S.layer = (fb, name) => {
      for (const e of S.extras) if (e.layer === name) e.draw(fb);
      S.drawCast(fb, name);
      FX.draw(fb, name);
    };
    return S;
  }

  /* ============================ NOON (home) ============================ */
  function noon() {
    const S = base({ id: 'noon', hour: 'noon', time: true, dia: { x: 268, y: 213 } });
    S.paint = Paintings.noon();
    const GY = 212;
    const sph = Cast.spheal(126, GY, { minX: 84, maxX: 186 });
    const crab = Cast.corphish(186, 214, { minX: 150, maxX: 232 });
    S.actors.push(sph, crab, Cast.wingull(40, 26, 18), Cast.wingull(260, 44, -14));
    const nuts = [];
    const ground = () => GY - 3;
    crab.onCrack = (n) => {
      n.gone = true; sfx('crack', n.x); FX.stars(n.x, n.y - 4, 6); G.shake(1, 0.2);
      const h1 = { x: n.x - 2, y: n.y, vx: -46, vy: -150, st: 'air', half: true, claim: 1, age: 0, rot: 0 };
      const h2 = { x: n.x + 2, y: n.y, vx: 46, vy: -150, st: 'air', half: true, claim: 1, age: 0, rot: 0 };
      nuts.push(h1, h2);
      const near = Math.abs(h1.x - crab.x) < Math.abs(h2.x - crab.x) ? h1 : h2;
      crab.meal = near;
      const other = near === h1 ? h2 : h1;
      if (sph.state === 'idle' || sph.state === 'roll') { sph.target = other; setTimeout(() => { if (!other.gone && sph.state === 'idle') sph.set('go'); }, 600); }
    };
    // rocks along the right of the beach; one hides the Adamant Orb
    const rocks = [{ x: 300, y: 213, v: 0 }, { x: 334, y: 210, v: 1 }, { x: 363, y: 214, v: 2 }].map((r) => Object.assign(r, { wob: 0, pokes: 0, slide: 0 }));
    const orbRock = rocks[Math.floor(Math.random() * 3)];
    const orb = { x: 0, y: 0, vy: 0, t: 0 };
    S.orb = orb; S.rocks = rocks;
    let crownShake = 0, hintT = 0;
    S.summoning = null;
    const PORTAL = [292, 64];

    S.step = (dt) => {
      S.stepCast(dt);
      crownShake = Math.max(0, crownShake - dt);
      for (const r of rocks) { r.wob = Math.max(0, r.wob - dt); if (r === orbRock && G.orb !== 'hidden') r.slide += (17 - r.slide) * Math.min(1, dt * 6); }
      if (G.orb === 'hidden' && S.t > 30) { hintT += dt; if (hintT > 2.6) { hintT = 0; FX.sparks(orbRock.x + R(-6, 6), orbRock.y - 12, 2, FX.C.cy, 4); } }
      if (G.orb === 'out') { orb.t += dt; orb.vy += (orbRock.y - 34 - orb.y) * 6 * dt; orb.vy *= Math.exp(-dt * 2.5); orb.y += orb.vy * dt; if (chance(dt * 3)) FX.sparks(orb.x, orb.y, 1, FX.C.cy, 8); }
      // coconuts
      for (const n of nuts) {
        if (n.gone) continue;
        if (n.hop) n.hop = Math.max(0, n.hop - dt * 20);
        if (n.half) { n.age += dt; if (n.age > 16 && !n.eaten) n.gone = true; }
        if (n.st === 'air') {
          n.vy += 520 * dt; n.x += n.vx * dt; n.y += n.vy * dt; n.rot += n.vx * dt / 4;
          if (!n.half && n.vy > 0) for (const a of [sph, crab]) {
            const top = a.top();
            if (Math.abs(n.x - a.x) < 12 && n.y > top - 2 && n.y < top + 8) {
              n.vy = -150; n.vx = n.x < a.x ? -55 : 55; a.dizzy = 2; a.squish(0.3); a.target = null; a.set('idle');
              FX.stars(n.x, top, 5); sfx('bonk', n.x); FX.sweat(a.x + 10, top + 4);
            }
          }
          const gy = ground();
          if (n.y >= gy) { n.y = gy; if (n.vy > 90) { n.vy = -n.vy * 0.42; sfx('thud', n.x, 0.6); FX.dust(n.x, GY, 3); } else { n.vy = 0; n.st = 'ground'; } }
        } else {
          n.x += n.vx * dt; n.vx *= Math.exp(-dt * 2.4); n.rot += n.vx * dt / 4;
          if (Math.abs(n.vx) < 3) n.vx = 0;
          if (n.x < 30 || n.x > 282) { n.vx = -n.vx * 0.5; n.x = clamp(n.x, 30, 282); }
        }
      }
      for (let i = nuts.length - 1; i >= 0; i--) if (nuts[i].gone) nuts.splice(i, 1);
      const free = nuts.find((n) => !n.half && n.st === 'ground' && n.vx === 0 && !n.claim);
      if (free) {
        if (!free.plan) free.plan = chance(0.4) && sph.state === 'idle' ? 'sph' : 'crab';
        if (free.plan === 'sph' && sph.state === 'idle' && sph.dizzy <= 0) { sph.target = free; free.claim = sph; sph.set('go'); free.plan = 'crab'; }
        else if (free.plan === 'crab' && (crab.state === 'idle' || crab.state === 'scuttle') && crab.dizzy <= 0) { crab.target = free; free.claim = crab; crab.set('go'); }
      }
      for (const n of nuts) if (n.claim && n.claim.target !== n && n.claim !== 1 && !n.half) n.claim = null;
      // summoning Dialga out of a portal
      const s = S.summoning;
      if (s) {
        s.t += dt;
        const [px, py] = PORTAL;
        if (s.t < 1.2) { const k = Math.min(1, s.t / 1.1); orb.x += (px - orb.x) * Math.min(1, dt * 3.5); orb.y += (py - orb.y) * Math.min(1, dt * 3.5); if (chance(0.5)) FX.sparks(orb.x, orb.y, 1, FX.C.cy, 6); s.rp = k > 0.7 ? outBack((k - 0.7) / 0.3) * 6 : 0; }
        else if (s.t < 1.8) { s.rp = 6 + outBack((s.t - 1.2) / 0.5) * 12; if (G.orb === 'summon' && s.t > 1.4) { G.orb = 'used'; sfx('chime', px); FX.ring(px, py, 2, 20, FX.C.cy, 0.5, 'back'); } }
        if (s.t > 1.8 && !s.spawned) {
          s.spawned = true; const d = G.dia = Cast.dialga(); d.state = 'held'; d.x = px; d.y = py + 14; d.vy = -80; d.home = S.dia.x; d.layer = 'front';
          S.actors.push(d); sfx('dialga', px); FX.sparks(px, py, 10, FX.C.cy, 12, 'back');
        }
        const d = G.dia;
        if (s.spawned && !s.landed) {
          d.vy += 420 * dt; d.y += d.vy * dt; d.x += (S.dia.x - d.x) * Math.min(1, dt * 2.2); d.rot = Math.min(1, s.t - 1.8) * 6.283 * 2;
          if (d.y >= S.dia.y) { d.y = S.dia.y; d.rot = 0; s.landed = s.t; d.squish(0.3); FX.dust(d.x, d.y, 10); sfx('thud', d.x); G.shake(2, 0.3); }
        }
        if (s.landed && !s.said && s.t > s.landed + 0.45) { s.said = true; d.sayT = 1.8; sfx('yo', d.x); FX.hearts(d.x, d.top() - 4, 2); }
        if (s.t > 2.8) s.rp = Math.max(0, s.rp - dt * 40);
        if (s.said && s.t > s.landed + 2.3) {
          S.summoning = null; d.state = 'idle'; d.next = 2; d.set('dance');
          sph.set('clap'); crab.set('happy'); G.onDialga();
        }
      }
    };
    S.extras.push({
      layer: 'back', draw(fb) { const s = S.summoning; if (s && s.rp > 0) FX.portal(fb, PORTAL[0], PORTAL[1], s.rp, s.t); },
    }, {
      layer: 'front', draw(fb) {
        for (const r of rocks) {
          const wx = r.x + (r === orbRock ? r.slide : 0) + Math.round(Math.sin(r.wob * 50) * r.wob * 6);
          if (r === orbRock && r.slide > 1 && G.orb !== 'used') FX.shadow(fb, r.x - 2, r.y - 1, 7, 2);
          Pix.draw(fb, Pix.get('rock', { v: r.v }), wx, r.y);
          r.bx = wx;
        }
        for (const n of nuts) {
          if (n.gone) continue;
          FX.shadow(fb, n.x, GY, 4, 1.4);
          Pix.draw(fb, Pix.get('nut', { half: n.half ? 1 : 0 }), n.x, n.y - (n.hop || 0), { rot: n.half ? 0 : q(n.rot, 0.785) });
        }
        if (G.orb === 'out' || (G.orb === 'summon' && S.summoning && S.summoning.t < 1.4)) {
          const k = S.summoning ? Math.max(0.2, 1 - S.summoning.t / 1.4) : 1;
          FX.glow(fb, orb.x, orb.y, 16, hex('#9fe8ff'), 0.7 * k);
          Pix.draw(fb, Pix.get('orb'), orb.x, orb.y, { sx: k, sy: k });
        }
      },
    });
    S.tap = (x, y) => {
      if (S.summoning) return true;
      if (G.orb === 'out' && Math.hypot(x - orb.x, y - orb.y) < 14) { S.summoning = { t: 0, rp: 0 }; G.orb = 'summon'; sfx('portal', orb.x); FX.ring(orb.x, orb.y, 2, 22, FX.C.cy, 0.5); return true; }
      for (const n of nuts) {
        if (!n.gone && Math.hypot(x - n.x, y - n.y) < 8) {
          if (n.st === 'ground') { n.st = 'air'; n.vy = -R(150, 210); n.vx = R(-70, 70); n.claim = null; n.plan = null; sfx('knock', n.x, 0.6); FX.sparks(n.x, n.y, 3); }
          return true;
        }
      }
      if (S.tapCast(x, y)) return true;
      for (const r of rocks) {
        if (Pix.hit(Pix.get('rock', { v: r.v }), r.bx ?? r.x, r.y, false, x, y, 1)) {
          r.wob = 0.4; r.pokes++; sfx('knock', r.x); FX.dust(r.x, r.y - 2, 4, hex('#d8d0c8'));
          if (r === orbRock && G.orb === 'hidden' && r.pokes >= 2) {
            G.orb = 'out'; orb.x = r.x - 2; orb.y = r.y - 8; orb.vy = -140; sfx('chime', r.x); FX.sparks(r.x, r.y - 16, 12, FX.C.cy, 12); FX.ring(r.x, r.y - 14, 2, 20, FX.C.cy, 0.5);
          } else if (r !== orbRock && r.pokes % 3 === 0) FX.sparks(r.x, r.y - 14, 4, FX.C.w, 8);
          return true;
        }
      }
      if (x < 96 && y > 12 && y < 82) {
        crownShake = 0.5; FX.leaves(46, 44, 8); sfx('rustle', 46);
        if (nuts.filter((n) => !n.half).length < 3) nuts.push({ x: R(36, 58), y: 54, vx: R(8, 45), vy: 0, st: 'air', half: false, rot: 0 });
        return true;
      }
      return false;
    };
    S.hint = () => { FX.sparks(orbRock.x, orbRock.y - 12, 6, FX.C.cy, 8); FX.ring(orbRock.x, orbRock.y - 10, 2, 16, FX.C.cy, 0.5); };
    return S;
  }

  /* ================================ DAWN ================================ */
  function leapers(S, list, seaY, layer = 'back') {
    for (const a of list) { a.layer = layer; S.actors.push(a); }
  }
  function cleanup(S) { S.actors = S.actors.filter((a) => !a.done); }
  function dawn() {
    const S = base({ id: 'dawn', hour: 'dawn', time: true, dia: { x: 162, y: 213 }, tint: tint('dawn', '#ffe2ee', '#0a0414') });
    S.paint = Paintings.dawn();
    S.actors.push(Cast.corphish(86, 214, { minX: 50, maxX: 130 }), Cast.pelipper({ cruise: 44, seaY: 150, diveX: [80, 330] }), Cast.wingull(80, 30, 16), Cast.wingull(300, 50, -20));
    let lt = 4;
    S.step = (dt) => {
      S.stepCast(dt); cleanup(S);
      if ((lt -= dt) < 0) { lt = R(7, 12); const x = R(60, 150); leapers(S, [Cast.leaper(x, x + 64, 150, 36, 0), Cast.leaper(x + 64, x, 150, 36, 0)], 150); }
    };
    S.tap = (x, y) => {
      if (S.tapCast(x, y)) return true;
      if (y > 110 && y < 175 && lt > 1.5) { lt = 0.2; }
      return false;
    };
    return S;
  }

  /* ================================ DUSK ================================ */
  function dusk() {
    const S = base({ id: 'dusk', hour: 'dusk', time: true, dia: { x: 218, y: 213 }, tint: tint('dusk', '#ffdcbc', '#221004', 0.85) });
    S.paint = Paintings.dusk();
    const sph = Cast.spheal(110, 212, { minX: 100, maxX: 128 });
    const sea = Cast.sealeo(168, 213);
    const wal = Cast.walrein(340, 214);
    S.actors.push(sph, sea, wal);
    S.onRoar = () => { sea.drop(); sph.jump(170); FX.sweat(sph.x + 10, sph.top()); if (G.dia && G.dia.state === 'idle') { G.dia.jump(140); FX.sweat(G.dia.x + 8, G.dia.top()); } };
    S.step = (dt) => { S.stepCast(dt); };
    S.tap = (x, y) => {
      if (sea.hitBall(x, y)) { if (sea.state === 'balance') sea.toss(1.2); else if (sea.state === 'fetch') sea.toss(0.8); return true; }
      return S.tapCast(x, y);
    };
    return S;
  }

  /* ================================ NIGHT ================================ */
  function night() {
    const S = base({ id: 'night', hour: 'night', time: true, dia: { x: 256, y: 213, sleepy: true }, tint: tint('night', '#7888c4', '#02061a') });
    S.paint = Paintings.night();
    const ch1 = Cast.chinchou(282, 189, { inWater: true, clip: 181, glowK: 0.9 }), ch2 = Cast.chinchou(330, 187, { inWater: true, clip: 180, glowK: 0.9 });
    S.actors.push(Cast.spheal(116, 212, { sleepy: true, minX: 116, maxX: 116 }), ch1, ch2);
    const meteors = [];
    S.step = (dt) => {
      S.stepCast(dt);
      for (const m of meteors) { m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; }
      for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].t > 1.1) meteors.splice(i, 1);
    };
    S.extras.push({
      layer: 'back', draw(fb) {
        for (const m of meteors) {
          const k = m.t / 1.1;
          for (let j = 0; j < 22; j++) {
            const px = Math.round(m.x - m.vx * j * 0.012), py = Math.round(m.y - m.vy * j * 0.012);
            if (bayer4(px, py) < 1 - j / 22 - k * 0.5) fb.set(px, py, j < 3 ? FX.C.w : hex('#bfe4ff'));
          }
          FX.glow(fb, m.x, m.y, 5, hex('#dff0ff'), 0.8 * (1 - k));
        }
      },
    });
    S.tap = (x, y) => {
      if (S.tapCast(x, y)) return true;
      if (y < 92) { meteors.push({ x: x + 40, y: y - 20, vx: -170, vy: 75, t: 0 }); sfx('twinkle', x); FX.sparks(x, y, 3, FX.C.w, 6, 'back'); return true; }
      return false;
    };
    return S;
  }

  /* ================================ SURF ================================ */
  function surf() {
    const S = base({ id: 'surf', hour: 'noon', time: false, dia: { x: 62, y: 184, mode: 'bubble' } });
    S.paint = Paintings.surf();
    S.actors.push(Cast.pelipper({ cruise: 40, seaY: 128, diveX: [60, 330] }));
    // Wailord rising at mid distance; Kyogre's shadow gliding under the swell
    const WL = 102;
    const wail = { x: 118, sink: 40, st: 'under', t: 0, next: 3 };
    const ky = { x: 520, y: 176, on: false, next: 12, flash: 0 };
    let lt = 6;
    S.step = (dt) => {
      S.stepCast(dt); cleanup(S);
      wail.t += dt;
      if (wail.st === 'under' && wail.t > wail.next) { wail.st = 'rise'; wail.t = 0; sfx('whale', wail.x, 0.7); }
      else if (wail.st === 'rise') { wail.sink += (4 - wail.sink) * Math.min(1, dt * 1.4); if (wail.t > 2.4) { wail.st = 'blow'; wail.t = 0; } }
      else if (wail.st === 'blow') { if (wail.t < 0.1 && !wail.blew) { wail.blew = true; FX.spout(wail.x + 24, WL - 20, 'back'); sfx('spout', wail.x); } if (wail.t > 4) { wail.st = 'sink'; wail.t = 0; wail.blew = false; } }
      else if (wail.st === 'sink') { wail.sink += (42 - wail.sink) * Math.min(1, dt * 1.1); if (wail.t > 3) { wail.st = 'under'; wail.t = 0; wail.next = R(8, 16); } }
      if (!ky.on) { if ((ky.next -= dt) < 0) { ky.on = true; ky.x = 480; } }
      else { ky.x -= 30 * dt; ky.t = (ky.t || 0) + dt; if (ky.flash > 0) ky.flash -= dt; if (ky.x < -110) { ky.on = false; ky.next = R(20, 34); } }
      if ((lt -= dt) < 0) { lt = R(9, 15); const x0 = R(30, 90); const list = []; for (let i = 0; i < 5; i++) list.push(Cast.leaper(x0 + i * 26, x0 + i * 26 + 58, 150, 34, i * 0.22)); leapers(S, list, 150); }
    };
    const deep = hex('#0a2c66');
    S.extras.push({
      layer: 'back', draw(fb) {
        if (ky.on) {
          const k = 0.42 + Math.max(0, ky.flash) * 0.4;
          Pix.draw(fb, Pix.get('kyogre', { tail: q(Math.sin(ky.t * 2.4), 1), fin: q(Math.sin(ky.t * 1.2), 1), mouth: ky.flash > 0 ? 1 : 0 }), ky.x, ky.y, {
            flip: true, map: (c, x, y) => mix(fb.d[y * W + x], ky.flash > 0 ? c : mix(c, deep, 0.7), k),
          });
          if (ky.flash > 0) FX.glow(fb, ky.x - 35, ky.y - 8, 26, hex('#ff5a6a'), ky.flash);
        }
        if (wail.sink < 41) {
          Pix.draw(fb, Pix.get('wailord', { eyes: wail.st === 'blow' && wail.t < 1 ? 'happy' : 'open' }), wail.x, WL + 2 + Math.round(wail.sink), { clip: WL, map: S.tint ? null : null });
          for (let x = wail.x - 64; x < wail.x + 66; x++) if (bayer4(x, WL) < 0.6 + Math.sin(x * 0.4 + S.t * 3) * 0.3) { fb.set(x, WL, FX.C.w); if (bayer4(x, WL + 1) < 0.3) fb.set(x, WL + 1, FX.C.w); }
        }
      },
    });
    S.tap = (x, y) => {
      if (S.tapCast(x, y)) return true;
      if (wail.sink < 30 && Math.abs(x - wail.x) < 64 && y > WL - 36 && y < WL + 2) { FX.spout(wail.x + 24, WL - 20, 'back'); sfx('spout', wail.x); sfx('whale', wail.x, 0.6); FX.hearts(wail.x + 40, WL - 30, 2, 'back'); return true; }
      if (ky.on && Math.abs(x - ky.x) < 66 && Math.abs(y - ky.y) < 30) { ky.flash = 1.2; sfx('rumble', ky.x); G.shake(3, 1); FX.bubbles(ky.x - 50, ky.y - 20, 10, 'back', 110); return true; }
      if (y > 110) lt = Math.min(lt, 0.2);
      return false;
    };
    return S;
  }

  /* ================================ REEF ================================ */
  function reefPaint(S) {
    const bg = new Buf(W, H);
    const top = hex('#62cce2'), midc = hex('#2a8cbc'), bot = hex('#12407a');
    const water = new Uint32Array(H);
    for (let y = 0; y < H; y++) { const t = y / H; water[y] = t < 0.5 ? mix(top, midc, t * 2) : mix(midc, bot, (t - 0.5) * 2); }
    const band = (y, x) => { const t = y / H * 9, f = t - Math.floor(t); const i = Math.floor(t) + (bayer4(x, y) < f ? 1 : 0); return water[Math.min(H - 1, Math.round(i / 9 * H))]; };
    const floorY = (x) => 190 + Math.sin(x * 0.025) * 4 + Math.sin(x * 0.07 + 1) * 2;
    S.floorY = floorY;
    const r1 = hex('#1e5c86'), r2 = hex('#17506e'), sand = [hex('#a8905e'), hex('#c8ac74'), hex('#dcc48c'), hex('#efdcaa')];
    for (let x = 0; x < W; x++) {
      const h1 = 128 + fbm(x * 0.018, 3) * 44, h2 = 156 + fbm(x * 0.03 + 9, 3) * 34, fy = floorY(x);
      for (let y = 0; y < H; y++) {
        let c = band(y, x);
        if (y > h1) c = mix(c, r1, 0.45);
        if (y > h2) c = mix(c, r2, 0.6);
        if (y >= fy) {
          const d = y - fy, rip = Math.sin(x * 0.22 + y * 1.4) > 0.8;
          c = d < 1 ? sand[3] : rip ? sand[2] : d > 14 ? sand[0] : sand[1];
          if (d > 8 && bayer4(x, y) < 0.3) c = sand[0];
        }
        bg.d[y * W + x] = c;
      }
    }
    // rock and coral clusters, painted with the sprite painter
    const cluster = (w, h, draw) => {
      const pal = { rock: ['#16304a', '#2e5a74', '#3f7890', '#6aa2b4'], coral: ['#7a1a3a', '#e0507a', '#ff7aa0', '#ffc0d0'], coral2: ['#7a3a0a', '#e08a2a', '#ffae4a', '#ffe0a0'], fan: ['#3a1a6a', '#8a4ac8', '#a86ae0', '#d0a8ff'], moss: ['#1a4a30', '#2e8a4a', '#4ab860', '#8ae08a'] };
      const P = new Pix.Painter(w, h, Object.keys(pal)); draw(P);
      return P.toBuf(Object.values(pal).map((a) => a.map(hex)));
    };
    const left = cluster(96, 60, (P) => {
      P.blob([[40, 44, 36, 16], [22, 36, 16, 14], [62, 40, 18, 14]], 'rock');
      P.el(30, 30, 6, 2, 'moss', { inside: ['rock'], ol: false });
      for (let i = 0; i < 5; i++) P.line(20 + i * 3, 26, 14 + i * 5, 10 + (i % 2) * 4, 'coral', 2, 2);
      for (const [x, y] of [[14, 10], [19, 14], [24, 10], [29, 14], [34, 12]]) P.el(x, y, 2, 2, 'coral');
      P.el(62, 24, 6, 8, 'coral2'); P.el(72, 26, 4, 6, 'coral2'); P.el(62, 20, 3, 2, 'coral2', { tone: 1, ol: false }); P.el(72, 22, 2, 1.5, 'coral2', { tone: 1, ol: false });
      P.el(48, 22, 8, 10, 'fan', { ol: true });
    });
    const right = cluster(110, 70, (P) => {
      P.blob([[60, 52, 44, 16], [80, 38, 22, 18], [36, 44, 16, 12]], 'rock');
      P.el(80, 26, 8, 2.5, 'moss', { inside: ['rock'], ol: false });
      P.el(40, 30, 10, 12, 'fan'); P.el(90, 16, 6, 8, 'coral2'); P.el(99, 20, 4, 6, 'coral2');
      for (let i = 0; i < 4; i++) { P.line(62 + i * 4, 28, 58 + i * 6, 10 + (i % 2) * 5, 'coral', 2, 2); P.el(58 + i * 6, 10 + (i % 2) * 5, 2, 2, 'coral'); }
    });
    bg.blit(left, -6, 150); bg.blit(right, 280, 140);
    for (const [x, c] of [[120, '#ff9a4a'], [214, '#ffd05a'], [250, '#ff7aa0']]) { const y = Math.round(floorY(x)) + 6; FX.glyph(bg, ['.x.', 'xxx', 'x.x'], x, y, hex(c), hex('#6a3a2a')); }
    const kelp = [[26, 0], [70, 1.3], [238, 2.1], [262, 0.7], [372, 1.7]].map(([x, ph]) => ({ x, ph, n: 26 + Math.floor(ph * 6) }));
    const kelpC = [hex('#1a4a30'), hex('#2e8a4a'), hex('#4ab860')];
    const rayC = hex('#c8f4ff'), causC = hex('#fff6c8');
    let vt = 0;
    return {
      step(dt) {
        vt -= dt;
        if (vt < 0) { vt = R(0.6, 1.4); const vx = [52, 318, 150][Math.floor(Math.random() * 3)]; FX.bubbles(vx, floorY(vx) - 4, 2, 'back', 6); if (chance(0.2)) sfx('bubble', vx, 0.3); }
      },
      draw(fb) {
        const t = S.t;
        fb.copyFrom(bg);
        const d = fb.d;
        for (let y = 0; y < 160; y++) {
          const fall = 1 - y / 170;
          for (let x = 0; x < W; x++) {
            const u = x + y * 0.5, v = Math.sin(u * 0.08 + t * 0.35) * Math.sin(u * 0.021 - t * 0.12);
            if (v > 0.25 && bayer4(x, y) < (v - 0.25) * fall * 0.9) { const i = y * W + x; d[i] = mix(d[i], rayC, 0.28); }
          }
        }
        for (let x = 0; x < W; x++) {
          const w = Math.round(2 + Math.sin(x * 0.15 + t * 2) + Math.sin(x * 0.06 - t * 1.3));
          for (let y = 0; y < w; y++) d[y * W + x] = mix(d[y * W + x], rayC, 0.5);
          d[w * W + x] = hex('#e6fbff');
          const fy = Math.ceil(floorY(x));
          for (let y = fy; y < Math.min(H, fy + 16); y++) {
            const c = Math.sin(x * 0.35 + t * 2 + Math.sin(y * 0.6 + t)) * Math.sin(y * 0.9 - t * 1.4 + x * 0.05);
            if (c > 0.72) d[y * W + x] = mix(d[y * W + x], causC, 0.4);
          }
        }
        S.layer(fb, 'far');
        for (const k of kelp) {
          const fy = floorY(k.x);
          let px = k.x, py = fy;
          for (let i = 0; i < k.n; i++) {
            const nx = k.x + Math.sin(t * 1.1 + i * 0.22 + k.ph) * i * 0.35, ny = fy - i * 4;
            fb.line(Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), kelpC[1]);
            fb.set(Math.round(nx) + 1, Math.round(ny), kelpC[0]); fb.set(Math.round(nx) - 1, Math.round(ny), kelpC[2]);
            if (i % 3 === 1) { const s = i % 2 ? 1 : -1; fb.set(Math.round(nx) + s * 2, Math.round(ny) - 1, kelpC[2]); fb.set(Math.round(nx) + s * 3, Math.round(ny) - 2, kelpC[2]); fb.set(Math.round(nx) + s * 2, Math.round(ny), kelpC[0]); }
            px = nx; py = ny;
          }
        }
        S.layer(fb, 'back');
        S.drawMudkip(fb);
        S.layer(fb, 'front');
        for (let i = 0; i < 40; i++) { const x = ((i * 97 + t * (3 + (i % 4))) % W + W) % W, y = ((i * 53 + Math.sin(t * 0.5 + i) * 6) % 180 + 180) % 180; if (bayer4(i, 1) < 0.6) fb.set(Math.round(x), Math.round(y), hex('#bfe8f0')); }
      },
    };
  }

  function reef() {
    const S = base({ id: 'reef', hour: 'noon', time: false, under: true, dia: { x: 72, y: 124, mode: 'bubble' }, tint: tint('reef', '#c4ecf4', '#00101c', 0.6) });
    const paint = reefPaint(S);
    S.paint = { step: (dt) => { paint.step(dt); return []; }, draw: (fb) => paint.draw(fb), tap: () => null };
    // Mudkip swims lazy loops; a few fixed frames keep the 3D renderer cheap
    const mk = new MudkipActor({ x: 190, gy: 110, yaw: 1.15, pal: Paintings.gradeMudkip(Paintings.tintFn('#bfe6f0', '#00121e', 1)), light: { dir: [-0.3, 0.8, 0.5] }, scale: 1.0, bh: 130, oy: 0.72 });
    const M = { x: 190, y: 110, tx: 200, ty: 100, face: 1, turnT: 0, loop: 0, t: 0, blinkAt: 2, blinkT: 0 };
    S.mk = M;
    S.drawMudkip = (fb) => {
      const k = Math.floor(M.t * 7) % 6, sw = Math.sin(k * 1.047);
      const yaw = M.turnT > 0 ? 1.57 : M.face > 0 ? 1.15 : 1.99;
      mk.yaw = yaw; mk.x = M.x; mk.gy = M.y + (M.loop > 0 ? -Math.sin(M.loop / 0.8 * Math.PI) * 18 : 0); mk.h = 0;
      mk.sprite({ legF: sw * 0.6, legB: -sw * 0.6, tailWag: sw * 0.5, finSway: 0.1, mouth: M.happy > 0 ? 1 : 0.5, eyes: M.happy > 0 ? 'happy' : M.blinkT > 0 ? 'closed' : 'open' });
      mk.draw(fb);
    };
    // Luvdisc tracing a heart; now and then they swarm Mudkip for kisses
    const fish = [];
    for (let i = 0; i < 5; i++) {
      const f = new Cast.Actor('luvdisc', 250, 80, { layer: 'back', pivotY: 15, i, pad: 2 });
      f.update = function (dt) {
        this.base(dt);
        const sc = school, u = sc.u + this.i * 1.2566;
        let tx = 262 + 16 * Math.sin(u) ** 3 * 3.4, ty = 78 - (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) * 3.1;
        if (sc.mode === 'visit') { const a = this.i * 1.047 + this.t * 1.5; tx = M.x + Math.cos(a) * 26; ty = M.y - 22 + Math.sin(a) * 14; }
        if (sc.scatter > 0) { const dx = this.x - sc.sx, dy = this.y - sc.sy, dd = Math.hypot(dx, dy) || 1; tx = this.x + dx / dd * 60; ty = this.y + dy / dd * 40; }
        const vx = (tx - this.x) * Math.min(1, dt * 2.6), vy = (ty - this.y) * Math.min(1, dt * 2.6);
        this.x += vx; this.y = clamp(this.y + vy, 20, 180);
        if (Math.abs(vx) > 0.05) this.flip = vx < 0;
        this.rot = q(clamp((this.flip ? -1 : 1) * vy / (Math.abs(vx) + 0.6) * 0.5, -0.5, 0.5), 0.25);
        const kiss = sc.mode === 'visit' && Math.sin(this.t * 3 + this.i) > 0.8;
        if (kiss && !this.k0) { FX.hearts(this.x, this.y - 12, 1, 'back'); if (this.i === 0) sfx('kiss', this.x, 0.5); M.happy = 0.6; }
        this.k0 = kiss;
        this.pose = { eyes: kiss ? 'happy' : this.eyes(), kiss: kiss ? 1 : 0, blush: kiss ? 1 : 0 };
      };
      f.poke = function (S2) { FX.hearts(this.x, this.y - 12, 3, 'back'); sfx('kiss', this.x); school.scatter = 1.1; school.sx = this.x; school.sy = this.y + 5; return true; };
      f.x = 262; f.y = 60 + i * 6;
      fish.push(f);
    }
    const school = { u: 0, mode: 'heart', mt: 0, scatter: 0, sx: 0, sy: 0 };
    const ky = { x: -140, on: false, next: 7, t: 0, flash: 0 };
    const crab = Cast.corphish(150, 206, { minX: 118, maxX: 196 });
    S.actors.push(...fish, Cast.chinchou(96, 200, { glowK: 0.35 }), Cast.chinchou(312, 196, { glowK: 0.35 }), crab);
    S.step = (dt) => {
      S.stepCast(dt);
      school.u += dt * 0.4; school.mt += dt; if (school.scatter > 0) school.scatter -= dt;
      if (school.mode === 'heart' && school.mt > 16) { school.mode = 'visit'; school.mt = 0; }
      else if (school.mode === 'visit' && school.mt > 4.5) { school.mode = 'heart'; school.mt = 0; }
      M.t += dt; if (M.happy > 0) M.happy -= dt; if (M.turnT > 0) M.turnT -= dt; if (M.loop > 0) M.loop -= dt;
      if (M.blinkT > 0) M.blinkT -= dt; else if (M.t > M.blinkAt) { M.blinkT = 0.12; M.blinkAt = M.t + R(2, 5); }
      const dx = M.tx - M.x, dy = M.ty - M.y, d = Math.hypot(dx, dy);
      if (d < 6) { M.tx = R(110, 300); M.ty = R(60, 150); }
      else { M.x += dx / d * 22 * dt; M.y += dy / d * 16 * dt; const f = dx > 0 ? 1 : -1; if (f !== M.face && Math.abs(dx) > 8) { M.face = f; M.turnT = 0.14; } }
      if (chance(dt * 0.5)) { const [fx, fy] = mk.last ? mk.anchor('mouth') : [M.x, M.y - 30]; FX.bubbles(fx, fy, 1, 'front', 6); }
      if (crab.state === 'idle' && chance(dt * 0.3)) FX.bubbles(crab.x, crab.top() + 14, 2, 'front', 6);
      if (!ky.on) { if ((ky.next -= dt) < 0) { ky.on = true; ky.x = -110; ky.t = 0; } }
      else { ky.x += 26 * dt; ky.t += dt; if (ky.flash > 0) ky.flash -= dt; if (ky.x > 500) { ky.on = false; ky.next = R(26, 40); } }
    };
    const haze = hex('#3e9cc6');
    S.extras.push({
      layer: 'far', draw(fb) {
        if (!ky.on) return;
        const f = ky.flash > 0;
        Pix.draw(fb, Pix.get('kyogre', { tail: q(Math.sin(ky.t * 2.4), 1), fin: q(Math.sin(ky.t * 1.2), 1), mouth: f ? 1 : 0 }), ky.x, 70 + Math.sin(ky.t * 0.7) * 4, { map: (c) => (f ? c : mix(c, haze, 0.5)) });
        if (f) { FX.glow(fb, ky.x + 35, 70, 30, hex('#ff5a6a'), ky.flash * 0.8); }
      },
    });
    S.tap = (x, y) => {
      if (S.tapCast(x, y)) return true;
      const s = mk.last;
      if (s) {
        const [ox, oy] = mk.origin(), sx = Math.round(x - ox), sy = Math.round(y - oy);
        if (sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx]) { M.loop = 0.8; M.happy = 1.2; FX.hearts(M.x, M.y - 44, 2, 'front'); FX.bubbles(M.x, M.y - 20, 6, 'front', 6); sfx('mud', M.x); return true; }
      }
      if (ky.on && x > ky.x - 70 && x < ky.x + 70 && Math.abs(y - 70) < 34) { ky.flash = 1.4; sfx('rumble', ky.x); G.shake(3, 1); FX.bubbles(ky.x + 50, 70, 12, 'back', 6); school.scatter = 1.2; school.sx = ky.x; school.sy = 70; return true; }
      FX.bubbles(x, y, 4, 'front', 6); sfx('bubble', x, 0.6);
      return true;
    };
    return S;
  }

  const MAKERS = { noon, dawn, dusk, night, surf, reef };
  const ORDER = ['noon', 'dusk', 'night', 'dawn', 'surf', 'reef'];
  return { G, MAKERS, ORDER };
})();
