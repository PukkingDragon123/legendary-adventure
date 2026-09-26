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
    const cands = S.rocks.filter((r) => r.kind !== 'shore');
    cands[Math.floor(Math.random() * cands.length)].hasOrb = true;
    // pier
    S.pier = Props.makePier();
    // corals on the reef, kelp on the slope
    const cr = rng(12);
    const coralSpots = [[2130, 'branch', 1.1], [2190, 'brain', 0.8], [2260, 'fan', 1.2], [2440, 'branch', 1.3], [2500, 'brain', 1], [2660, 'fan', 0.9], [1950, 'brain', 0.7], [2320, 'fan', 0.8], [2020, 'branch', 0.8]];
    for (const [x, kind, size] of coralSpots) {
      const spr = Props.makeCoral(kind, Math.floor(cr() * 999), size);
      const gy = World.groundAt(x);
      S.corals.push({ x, spr, x0: Math.round(x - spr.w / 2), y0: Math.round(gy - spr.h + 3) });
    }
    for (let x = 1520; x < 2120; x += 22 + Math.floor(cr() * 26)) S.kelp.push({ x, len: Math.min(60 + Math.floor(cr() * 110), World.groundAt(x) - World.SEA - 24), seed: x });
    for (let x = 2700; x < 3500; x += 60 + Math.floor(cr() * 80)) S.kelp.push({ x, len: 90 + Math.floor(cr() * 160), seed: x });
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
    for (const sh of S.shells) if (sh.x - cx > -8 && sh.x - cx < VW + 8) drawShell(fb, cx, cy, sh, P);
    // pier (posts in the water get tinted later by the water pass)
    if (inView(S.pier.x, S.pier.y, S.pier.s.w, S.pier.s.h)) Props.blit(fb, S.pier.s, S.pier.x - cx, S.pier.y - cy, pal, occ, 2);
    for (const k of S.kelp) if (k.x - cx > -30 && k.x - cx < VW + 30) Props.drawKelp(fb, cx, cy, k.x, World.groundAt(k.x) + 2, k.len, k.seed, t, pal, occ);
    for (const c of S.corals) if (inView(c.x0, c.y0, c.spr.w, c.spr.h)) Props.blit(fb, c.spr, c.x0 - cx, c.y0 - cy, pal, occ, 2);
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
      if (c.state === 'gone' || c.state === 'held') continue;
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
    for (const g of S.grass) if (g.x - cx > -30 && g.x - cx < fb.w + 30) Props.drawGrass(fb, cx, cy, g.x, World.groundAt(g.x) + 1, g.n, g.seed, t, P);
  }

  return { S, init, drawBack, drawItems, drawFront, drawCoconut };
})();
