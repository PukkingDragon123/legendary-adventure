/* ------------------------------------------------------------------
   Scene — owns the props and interactive items, draws them in order.
   Creatures and effects plug in through hooks set by the game.
------------------------------------------------------------------- */
const Scene = (() => {
  const { hash2, rng, hex, mix, bayer4 } = PX;
  const { clamp, lerp, mixc } = Scenery;
  const I = Props.I;

  const S = {
    palms: [], rocks: [], corals: [], kelp: [], shells: [], grass: [],
    pier: null, castle: null, umbrella: null, towel: null, chest: null,
    coconuts: [], chestOpen: false, castleHP: 1, castleT: 0,
  };

  function init() {
    // palms and their coconuts
    for (const p of World.PALMS) {
      const m = Props.makePalm({ h: p.h, lean: p.lean, seed: p.seed });
      const gy = World.groundAt(p.x);
      const pal = { ...p, m, gx: p.x, gy, x0: p.x - m.bx, y0: gy - m.by + 4, shake: 0 };
      S.palms.push(pal);
      m.nuts.slice(0, 4).forEach((n, k) => S.coconuts.push(makeCoconut(pal, n, k)));
    }
    // rocks: beach rocks (orb candidates), Walrein's rock, reef rocks
    const R = (r, kind) => {
      const spr = Props.makeRock(r.w, r.h, r.seed, { moss: kind !== 'reef', barnacles: kind !== 'beach' });
      const gy = World.groundAt(r.x);
      return { ...r, kind, spr, x0: Math.round(r.x - spr.w / 2), y0: Math.round(gy - spr.h + Math.min(10, r.h * 0.18)), shake: 0, hasOrb: false, pokes: 0 };
    };
    for (const r of World.BEACH_ROCKS) S.rocks.push(R(r, 'beach'));
    S.walreinRock = R(World.WALREIN_ROCK, 'shore');
    S.walreinRock.y0 = Math.round(World.SEA - S.walreinRock.spr.h + 60);
    S.rocks.push(S.walreinRock);
    for (const r of World.REEF_ROCKS) S.rocks.push(R(r, 'reef'));
    // the Adamant crystal hides under one of the rocks you can poke
    const cands = S.rocks.filter((r) => r.kind === 'beach');
    cands[Math.floor(Math.random() * cands.length)].hasOrb = true;
    // pier
    S.pier = Props.makePier();
    // a crowded coral reef: many kinds and colours, bigger heads where the water is deeper
    const cr = rng(12);
    const I = Props.I, pool = new Map();
    const kinds = [['branch', 3], ['brain', 2], ['fan', 2], ['tube', 2], ['anemone', 1.6], ['table', 1.2], ['sponge', 1.2], ['stag', 1.4]];
    const bases = [I.CORA, I.CORB, I.CORC, I.CORD, I.CORE, I.CORF, I.CORG, I.SPONGE, I.ANEM];
    const pickKind = () => { let tot = kinds.reduce((a, k) => a + k[1], 0), r = cr() * tot; for (const [k, w] of kinds) { r -= w; if (r <= 0) return k; } return 'branch'; };
    for (let x = 1470; x < 3070; x += 9 + Math.floor(cr() * 17)) {
      const gy = World.groundAt(x), deep = Math.min(1, (gy - World.SEA) / 260);
      if (gy < World.SEA + 40) continue;
      const kind = pickKind(), base = kind === 'sponge' ? I.SPONGE : kind === 'anemone' ? I.ANEM : bases[Math.floor(cr() * 7)];
      const size = +(0.35 + deep * 0.55 + cr() * 0.35).toFixed(1);
      const key = kind + base + size + (Math.floor(cr() * 3));
      let spr = pool.get(key);
      if (!spr) { spr = Props.makeCoral(kind, Math.floor(cr() * 9999), size, { base }); pool.set(key, spr); }
      S.corals.push({ x, spr, x0: Math.round(x - spr.w / 2 + (cr() - 0.5) * 6), y0: Math.round(gy - spr.h + 3 + cr() * 3) });
    }
    // sea grass and kelp on the sandy slope and between the heads
    for (let x = 1320; x < 3000; x += 18 + Math.floor(cr() * 30)) S.kelp.push({ x, len: Math.max(20, Math.min(40 + Math.floor(cr() * 120), World.groundAt(x) - World.SEA - 24)), seed: x });
    // the abyss: nothing but tall dark rock spires
    S.deepRocks = [];
    for (let x = 3180; x < 4600; x += 50 + Math.floor(cr() * 120)) {
      const h = 60 + Math.floor(cr() * 240), w = 40 + Math.floor(cr() * 70);
      const spr = Props.makeRock(w, h, 100 + x, { moss: false, barnacles: false, dark: true });
      const gy = World.groundAt(x);
      S.deepRocks.push({ x, spr, x0: Math.round(x - spr.w / 2), y0: Math.round(gy - spr.h + 12) });
    }
    for (let x = 30; x < 470; x += 26 + Math.floor(cr() * 30)) S.grass.push({ x, n: 6 + Math.floor(cr() * 8), seed: x });
    // decorations
    S.castle = { spr: Props.makeSandcastle(), x: 560 };
    S.castle.y0 = Math.round(World.groundAt(560) - S.castle.spr.h + 3);
    S.castleBroken = null;
    S.umbrella = { spr: Props.makeUmbrella(), x: 262 };
    S.umbrella.y0 = Math.round(World.groundAt(262) - S.umbrella.spr.h + 4);
    S.towel = { spr: Props.makeTowel(), x: 300 };
    S.towel.y0 = Math.round(World.groundAt(300) - 7);
    S.chestSpr = [Props.makeChest(false), Props.makeChest(true)];
    S.chest = { x: 2960, y0: Math.round(World.groundAt(2960) - 46) };
    // under the sand: palm roots, pebbles, shells, two fossils and a bottle
    S.buried = [];
    for (const p of S.palms) S.buried.push({ kind: 'roots', x: p.gx, seed: p.seed });
    for (let k = 0; k < 60; k++) {
      const x = 20 + cr() * 1250, g = World.groundAt(x);
      const d = 14 + Math.pow(cr(), 0.7) * 260;
      if (g + d > World.H - 10) continue;
      S.buried.push({ kind: cr() < 0.75 ? 'pebble' : 'shell', x, y: g + d, r: 2 + cr() * 4, seed: k });
    }
    S.buried.push({ kind: 'helix', x: 520, y: World.groundAt(520) + 120, seed: 1 });
    S.buried.push({ kind: 'dome', x: 930, y: World.groundAt(930) + 170, seed: 2 });
    S.buried.push({ kind: 'bottle', x: 240, y: World.groundAt(240) + 80, seed: 3 });
    for (let k = 0; k < 26; k++) {
      const x = 480 + cr() * 2400;
      S.shells.push({ x, kind: cr() < 0.3 ? 'star' : 'shell', flip: cr() < 0.5 });
    }
  }

  function makeCoconut(palm, n, k) {
    return {
      palm, slot: n, k, state: 'tree', x: palm.gx + n.dx, y: palm.gy + n.dy, vx: 0, vy: 0, rot: 0, w: 0,
      r: 7, cracked: false, halves: null, bites: 0, holder: null, regrow: 0, wobble: 0,
    };
  }

  /* ---- drawing helpers ---- */
  function drawCoconut(fb, cx, cy, c, P, t) {
    const nut = P.palm.nut;
    const x = Math.round(c.x) - cx, y = Math.round(c.y) - cy;
    const R = c.r;
    if (c.cracked) {
      // two halves lying open, white flesh inside
      for (const side of [-1, 1]) {
        const hx = x + side * (R + 2) + (c.halfOff || 0) * side;
        for (let yy = -R + 3; yy <= 1; yy++)
          for (let xx = -R; xx <= R; xx++) {
            const dd = xx * xx + (yy - 1) * (yy - 1) * 1.6;
            if (dd > R * R) continue;
            const inner = xx * xx + (yy - 1) * (yy - 1) * 1.6 < (R - 2.2) * (R - 2.2) && yy < 0;
            let col = inner ? (c.bites > 2 ? nut[1] : hex('#fbf6e6')) : yy > -1 ? nut[0] : xx * side < 0 ? nut[2] : nut[1];
            if (inner && yy < -R + 6 && c.bites < 3) col = hex('#e8f4f8');
            fb.set(hx + xx, y + yy, col);
          }
      }
      return;
    }
    const ang = c.rot;
    for (let yy = -R; yy <= R; yy++)
      for (let xx = -R; xx <= R; xx++) {
        const dd = xx * xx + yy * yy;
        if (dd > R * R + 1) continue;
        const u = xx / R, v = yy / R;
        const lit = -u * 0.5 - v * 0.8;
        let col = lit > 0.55 ? nut[2] : lit > -0.1 ? nut[1] : nut[0];
        // fibre streaks rotate with the nut
        const a = Math.atan2(yy, xx) + ang;
        if (Math.sin(a * 5) > 0.85 && dd < (R - 1) * (R - 1)) col = nut[0];
        if (dd > (R - 0.6) * (R - 0.6)) col = P.palm.outline;
        fb.set(x + xx, y + yy, col);
      }
    // three "eyes" of the coconut
    const a0 = ang;
    for (let k = 0; k < 3; k++) {
      const a = a0 + k * 0.5 - 0.5;
      fb.set(x + Math.round(Math.cos(a) * (R - 3)), y + Math.round(Math.sin(a) * (R - 3)), P.palm.outline);
    }
    fb.set(x - 2, y - 3, mix(nut[2], hex('#ffffff'), 0.4));
  }

  function drawShell(fb, cx, cy, sh, P) {
    const x = Math.round(sh.x) - cx, y = Math.round(World.groundAt(sh.x)) - cy - 2;
    const pal = Props.palette(P);
    if (sh.kind === 'star') {
      const pts = [[0, -3], [-1, -1], [1, -1], [-3, -1], [3, -1], [-1, 0], [0, 0], [1, 0], [-2, 1], [2, 1], [-2, 2], [2, 2]];
      for (const [dx, dy] of pts) fb.set(x + dx, y + dy, pal[I.STAR]);
    } else {
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 0], [0, 0], [1, 0], [0, 1]]) fb.set(x + dx * (sh.flip ? -1 : 1), y + dy, pal[I.SHELL]);
    }
  }

  // back layer: everything creatures stand in front of
  function drawBack(fb, cx, cy, P, t, occ) {
    const pal = Props.palette(P);
    const VW = fb.w, VH = fb.h;
    const inView = (x0, y0, w, h) => x0 - cx < VW && x0 + w - cx > 0 && y0 - cy < VH && y0 + h - cy > 0;
    drawBuried(fb, cx, cy, P, pal, t);
    for (const sh of S.shells) if (sh.x - cx > -8 && sh.x - cx < VW + 8) drawShell(fb, cx, cy, sh, P);
    // pier (posts in the water get tinted later by the water pass)
    if (inView(S.pier.x, S.pier.y, S.pier.s.w, S.pier.s.h)) Props.blit(fb, S.pier.s, S.pier.x - cx, S.pier.y - cy, pal, occ, 2);
    for (const k of S.kelp) if (k.x - cx > -30 && k.x - cx < VW + 30) Props.drawKelp(fb, cx, cy, k.x, World.groundAt(k.x) + 2, k.len, k.seed, t, pal, occ);
    for (const c of S.corals) if (inView(c.x0, c.y0, c.spr.w, c.spr.h)) Props.blit(fb, c.spr, c.x0 - cx, c.y0 - cy, pal, occ, 2);
    if (S.deepRocks) for (const r of S.deepRocks) if (inView(r.x0, r.y0, r.spr.w, r.spr.h)) Props.blit(fb, r.spr, r.x0 - cx, r.y0 - cy, pal, occ, 1);
    // umbrella, towel, castle, chest
    const wob = (o) => (o.wob ? Math.round(Math.sin(o.wob * 34) * o.wob * 4) : 0);
    if (inView(S.umbrella.x - 75, S.umbrella.y0, 150, 150)) Props.blit(fb, S.umbrella.spr, S.umbrella.x - 75 - cx + wob(S.umbrella), S.umbrella.y0 - cy, pal, occ, 2);
    if (inView(S.towel.x - 55, S.towel.y0, 110, 10)) Props.blit(fb, S.towel.spr, S.towel.x - 55 - cx, S.towel.y0 - cy, pal, occ, 2);
    if (S.castleHP > 0.5) { if (inView(S.castle.x - 38, S.castle.y0, 76, 74)) Props.blit(fb, S.castle.spr, S.castle.x - 38 - cx + wob(S.castle), S.castle.y0 - cy, pal, occ, 2); }
    else drawCastleRubble(fb, cx, cy, P, pal);
    const ch = S.chestSpr[S.chestOpen ? 1 : 0];
    if (inView(S.chest.x - 32, S.chest.y0, 64, 52)) Props.blit(fb, ch, S.chest.x - 32 - cx, S.chest.y0 - cy, pal, occ, 2);
    // palm trunks
    for (const p of S.palms) {
      const sx = p.x0 - cx + Math.round(Math.sin(p.shake * 40) * p.shake * 6);
      if (sx < VW && sx + p.m.W > 0) Props.blit(fb, p.m.trunk, sx, p.y0 - cy, pal, occ, 2);
    }
    // rocks
    for (const r of S.rocks) {
      if (!inView(r.x0 - 4, r.y0 - 4, r.spr.w + 8, r.spr.h + 8)) continue;
      const jig = r.shake > 0 ? Math.round(Math.sin(r.shake * 60) * 2) : 0;
      Props.blit(fb, r.spr, r.x0 - cx + jig, r.y0 - cy - (r.shake > 0.2 ? 1 : 0), pal, occ, 2);
    }
  }

  function drawBuried(fb, cx, cy, P, pal, t) {
    const VW = fb.w, VH = fb.h;
    for (const b of S.buried) {
      const X = Math.round(b.x) - cx;
      if (X < -140 || X > VW + 140) continue;
      if (b.kind === 'roots') {
        const g = World.groundAt(b.x);
        const r = rng(b.seed * 31);
        const root = (x, y, a, len, w, depth) => {
          for (let k = 0; k < len; k++) {
            x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.25;
            const Y = Math.round(y) - cy, XX = Math.round(x) - cx;
            if (Y < 0 || Y >= VH) continue;
            for (let j = 0; j < w; j++) fb.set(XX + j, Y, pal[I.TRUNK + (j === 0 ? 0 : 1)]);
          }
          if (depth > 0) for (let i = 0; i < 2; i++) root(x, y, a + (r() - 0.5) * 1.4, len * 0.6, Math.max(1, w - 1), depth - 1);
        };
        for (let i = 0; i < 5; i++) root(b.x + (i - 2) * 4, g + 4, Math.PI / 2 + (i - 2) * 0.45, 26 + r() * 30, 2, 2);
        continue;
      }
      const Y = Math.round(b.y) - cy;
      if (Y < -30 || Y > VH + 30) continue;
      if (b.kind === 'pebble') {
        fb.ellipse(X + 0.5, Y + 0.5, b.r + 0.6, b.r * 0.7 + 0.6, pal[I.ROL]);
        fb.ellipse(X + 0.5, Y + 0.5, b.r, b.r * 0.7, pal[I.ROCK + 2 + (b.seed % 2)]);
        fb.set(X - 1, Y - 1, pal[I.ROCK + 4]);
      } else if (b.kind === 'shell') {
        for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 0], [0, 0], [1, 0], [0, 1]]) fb.set(X + dx, Y + dy, pal[I.SHELL]);
        fb.set(X, Y - 1, pal[I.WHITE]);
      } else if (b.kind === 'helix' || b.kind === 'dome') {
        // fossils: a spiral shell and a domed shell, set in a pale stone
        fb.ellipse(X + 0.5, Y + 0.5, 15, 12, pal[I.SOL]);
        fb.ellipse(X + 0.5, Y + 0.5, 14, 11, pal[I.SAND + 1]);
        if (b.kind === 'helix') {
          for (let a = 0; a < 16; a += 0.05) {
            const rr = 1 + a * 0.62;
            fb.set(Math.round(X + Math.cos(a) * rr), Math.round(Y + Math.sin(a) * rr * 0.85), pal[a > 14 ? I.ROL : I.ROCK + 1]);
          }
        } else {
          fb.ellipse(X + 0.5, Y + 2.5, 9, 7, pal[I.ROCK + 1]);
          fb.ellipse(X + 0.5, Y + 3.5, 7, 5, pal[I.ROCK + 2]);
          for (let x = -8; x <= 8; x++) fb.set(X + x, Y + 5, pal[I.ROL]);
          fb.set(X - 3, Y + 3, pal[I.ROL]); fb.set(X + 3, Y + 3, pal[I.ROL]);
        }
        if (b.shine > 0) { b.shine -= 1 / 60; if ((Math.floor(t * 10) & 1) === 0) Scenery.star(fb, X + 8, Y - 8, 2, PX.hex('#ffffff'), PX.hex('#ffe066')); }
      } else if (b.kind === 'bottle') {
        for (let y = -10; y <= 8; y++) for (let x = -4; x <= 4; x++) {
          const neck = y < -4;
          if (neck && Math.abs(x) > 1) continue;
          if (!neck && x * x / 16 + (y - 2) * (y - 2) / 64 > 1.05) continue;
          fb.set(X + x, Y + y, Math.abs(x) >= (neck ? 1 : 3) ? pal[I.INK] : x < 0 ? pal[I.GLASS] : pal[I.WHITE]);
        }
        fb.set(X, Y - 11, pal[I.WOOD + 2]); fb.set(X, Y - 12, pal[I.WOOD + 3]);
        for (let y = 0; y < 5; y++) fb.set(X - 1 + (y & 1), Y + y, pal[I.SAND + 3]);
        if (b.shine > 0) { b.shine -= 1 / 60; if ((Math.floor(t * 10) & 1) === 0) Scenery.star(fb, X + 6, Y - 12, 2, PX.hex('#ffffff'), PX.hex('#9fe8ff')); }
      }
    }
  }
  function pokeBuried(wx, wy) {
    for (const b of S.buried) {
      if (b.kind !== 'helix' && b.kind !== 'dome' && b.kind !== 'bottle') continue;
      if (Math.hypot(wx - b.x, wy - b.y) < 16) { b.shine = 1.2; return b; }
    }
    return null;
  }

  function drawCastleRubble(fb, cx, cy, P, pal) {
    const gy = World.groundAt(S.castle.x);
    for (let x = -34; x <= 34; x++) {
      const h = Math.round((1 - Math.abs(x) / 34) * 12 * (1 - S.castleHP) + 2 + (hash2(x, 3, 3) * 3));
      for (let y = 0; y < h; y++) fb.set(S.castle.x + x - cx, Math.round(gy) - y - cy, pal[I.SAND + (y === h - 1 ? 3 : 2)]);
    }
  }

  // items layer (coconuts etc.) — drawn with creatures
  function drawItems(fb, cx, cy, P, t) {
    for (const c of S.coconuts) {
      if (c.state === 'gone' || c.state === 'held' || c.state === 'tree') continue;
      if (c.x - cx < -20 || c.x - cx > fb.w + 20 || c.y - cy < -20 || c.y - cy > fb.h + 20) continue;
      drawCoconut(fb, cx, cy, c, P, t);
    }
  }

  // front layer: palm crowns and dune grass
  function drawFront(fb, cx, cy, P, t) {
    const pal = Props.palette(P);
    for (const p of S.palms) {
      const f = Math.floor(t * 2.4 + p.seed) % p.m.frames.length;
      const fx = Math.round(p.gx + p.m.crownX - p.m.bx - p.m.ccx) - cx + Math.round(Math.sin(p.shake * 40) * p.shake * 10);
      const fy = Math.round(p.gy + p.m.crownY - p.m.by - p.m.ccy + 4) - cy;
      if (fx < fb.w && fx + 360 > 0 && fy < fb.h && fy + 250 > 0) Props.blit(fb, p.m.frames[f], fx, fy, pal);
    }
    // coconuts still on the palms hang in front of the fronds
    for (const c of S.coconuts) if (c.state === 'tree' && c.x - cx > -20 && c.x - cx < fb.w + 20 && c.y - cy > -20 && c.y - cy < fb.h + 20) drawCoconut(fb, cx, cy, c, P, t);
    for (const g of S.grass) if (g.x - cx > -30 && g.x - cx < fb.w + 30) Props.drawGrass(fb, cx, cy, g.x, World.groundAt(g.x) + 1, g.n, g.seed, t, P);
  }

  return { S, init, drawBack, drawItems, drawFront, drawCoconut, pokeBuried };
})();
