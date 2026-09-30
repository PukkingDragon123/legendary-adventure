/* ------------------------------------------------------------------
   Boardwalk — Coral Cove now runs on past the Fossil Cliffs onto the
   Sunset Boardwalk: a long plank walk along the sand with a tiki beach
   bar (Lombre mixes smoothies), a sumo ring where the Belly-Flop
   Champion (a Corphish in a topknot) takes on all comers, the Pelipper
   Post stand, a lifeguard tower, surfboards, umbrellas and string
   lights that glow at night. Then the sand drops into the deep blue.
    · Sumo: beat the champ for the Champion Belt + Sumo Mawashi
      (three wins: the Sumo Topknot).
    · Postal Helper: Pelipper needs letters delivered along the
      boardwalk. Reward: the postman's cap, uniform and satchel.
------------------------------------------------------------------- */
const Boardwalk = (() => {
  const { rng, hex, pick, clamp } = U;
  const B = Areas.beach;
  const X0 = 5640, X1 = 8160, BAR = 6260, RING = 7240, POST = 5900, TOWER = 7760;
  const S = { champ: null, barkeep: null, lights: [] };
  if (!B) return S;
  const gy = (x) => World.groundAt(x);

  /* ---------------- sprites ---------------- */
  const spr = (w, h) => new ISpr(w, h);
  function planks(M, w) {
    const h = 9, s = spr(w, h + 8);
    for (let x = 0; x < w; x++) {
      const k = Math.floor(x / 9), gap = x % 9 === 0;
      for (let y = 0; y < h; y++) s.set(x, y, gap ? M.wood[0] : y === 0 ? M.wood[5] : y === 1 ? M.wood[4] : y === h - 1 ? M.wood[1] : (k * 7 + y) % 11 === 0 ? M.wood[2] : M.wood[k % 2 ? 3 : 4]);
      if (x % 40 < 3) for (let y = h; y < h + 8; y++) s.set(x, y, x % 40 === 1 ? M.wood[2] : M.wood[1]);
    }
    Paint.outline(s, M.ink[0]); s.ax = w >> 1; s.ay = h + 6;
    return s;
  }
  function tikiBar(M) {
    const w = 132, h = 104, s = spr(w, h), base = h - 1;
    // bamboo posts
    for (const px of [10, 58, 74, 120]) for (let y = 30; y <= base; y++) for (let x = 0; x < 5; x++) s.set(px + x, y, y % 11 === 0 ? M.palmTrunk[0] : M.palmTrunk[x < 2 ? 3 : x < 4 ? 2 : 1]);
    // back wall shelf with bottles and a sign
    for (let y = 36; y < 70; y++) for (let x = 14; x < 120; x++) s.set(x, y, (x + y * 3) % 17 === 0 ? M.wood[1] : M.wood[y % 8 === 0 ? 1 : 2]);
    for (let x = 16; x < 118; x++) { s.set(x, 52, M.wood[4]); s.set(x, 53, M.wood[1]); }
    const bc = [M.coralT, M.coralP, M.coralY, M.umbA, M.coralO, M.flowerP];
    for (let i = 0; i < 14; i++) { const bx = 20 + i * 7, c = bc[i % bc.length], bh = 7 + (i % 3) * 2; for (let y = 0; y < bh; y++) for (let x = 0; x < 4; x++) s.set(bx + x, 51 - y, y > bh - 3 && (x === 0 || x === 3) ? 0 : c[x === 1 ? 3 : 1]); }
    // "SUNSET BAR" sign board with a sun
    for (let y = 38; y < 48; y++) for (let x = 42; x < 92; x++) s.set(x, y, y === 38 || y === 47 || x === 42 || x === 91 ? M.wood[0] : M.umbB[2]);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) s.set(67 + x, 43 + y, y > 1 ? M.coralO[2] : M.coralO[3]);
    for (let x = 46; x < 88; x += 3) if (Math.abs(x - 67) > 7) s.set(x, 43, M.coralO[1]);
    // the counter: bamboo front, a thick top
    for (let y = 70; y <= base; y++) for (let x = 6; x < 128; x++) s.set(x, y, y < 74 ? M.wood[y === 70 ? 5 : 4] : (x % 6 === 0 ? M.palmTrunk[0] : M.palmTrunk[x % 6 < 3 ? 3 : 2]));
    for (let x = 6; x < 128; x++) if (x % 6 !== 0) { s.set(x, 84, M.palmTrunk[0]); s.set(x, 96, M.palmTrunk[0]); }
    // coconut cups and a pineapple on the counter
    for (const [cx, c] of [[30, M.nut], [98, M.nut]]) for (let y = 0; y < 6; y++) for (let x = -3; x <= 3; x++) if (x * x + (y - 3) * (y - 3) < 11) s.set(cx + x, 64 + y, c[y < 2 ? 2 : 1]);
    for (const cx of [30, 98]) { s.set(cx + 2, 62, M.flowerP[1]); s.set(cx + 3, 61, M.flowerP[1]); s.set(cx + 1, 60, M.tWhite[2]); s.set(cx + 1, 61, M.tWhite[2]); s.set(cx + 1, 62, M.tWhite[2]); }
    for (let y = 0; y < 9; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) <= 3 - (y < 2 ? 1 : 0)) s.set(64 + x, 61 + y, (x + y) % 2 ? M.umbB[1] : M.umbB[2]);
    for (const dx of [-2, 0, 2]) for (let y = 0; y < 5; y++) s.set(64 + dx + (dx ? Math.sign(dx) * (y >> 1) : 0), 60 - y, M.grass[2]);
    // thatched roof, shaggy fringe
    for (let y = 0; y < 34; y++) {
      const hw = 22 + y * 1.35;
      for (let x = -hw; x <= hw; x++) {
        const X = Math.round(66 + x); if (X < 0 || X >= w) continue;
        const strand = (X * 5 + Math.floor(y / 3) * 3) % 7;
        s.set(X, y, strand === 0 ? M.rope[0] : y > 28 ? M.rope[1] : M.rope[strand < 3 ? 2 : 1]);
      }
    }
    for (let x = 0; x < w; x++) { const d = 34 + ((x * 7) % 5); for (let y = 30; y < d; y++) s.set(x, y, M.rope[(x + y) % 3 ? 1 : 0]); }
    // string of lanterns under the roof
    for (let x = 8; x < w - 8; x += 10) { const y = 36 + Math.round(Math.sin(x * 0.2) * 1.5); s.set(x, y, M.lamp.c ? M.flowerY[1] : M.flowerY[1]); s.set(x, y + 1, M.coralO[3]); }
    Paint.outline(s, M.ink[0]); s.ax = 66; s.ay = base;
    return s;
  }
  function stool(M) { const s = spr(14, 18); for (let x = 0; x < 14; x++) for (let y = 0; y < 4; y++) s.set(x, y, y === 0 ? M.coralP[3] : M.coralP[2]); for (const lx of [2, 11]) for (let y = 4; y < 18; y++) s.set(lx, y, M.palmTrunk[2]); for (let x = 2; x < 12; x++) s.set(x, 12, M.palmTrunk[1]); Paint.outline(s, M.ink[0]); s.ax = 7; s.ay = 17; return s; }
  function dohyo(M) {
    // a raised clay ring: sloped sides, a flat top with the straw bale circle, salt on the corners
    const w = 176, h = 30, s = spr(w, h), base = h - 1;
    for (let y = 8; y <= base; y++) {
      const inset = Math.round((base - y) * 0.9);
      for (let x = inset; x < w - inset; x++) s.set(x, y, y < 12 ? M.sand[y === 8 ? 5 : 4] : (x + y * 2) % 13 === 0 ? M.face[1] : M.face[y > base - 4 ? 1 : y % 6 === 0 ? 2 : 3]);
    }
    // the top face (seen a little from above)
    for (let y = 0; y < 9; y++) for (let x = 16; x < w - 16; x++) s.set(x, y, (x * 3 + y * 7) % 23 === 0 ? M.sand[2] : M.sand[4]);
    // tawara: the rope bale ring (an ellipse on the top face) with the two starting lines
    for (let a = 0; a < Math.PI * 2; a += 0.01) { const x = Math.round(w / 2 + Math.cos(a) * 62), y = Math.round(4 + Math.sin(a) * 3.4); s.set(x, y, M.rope[2]); s.set(x, y + 1, M.rope[0]); }
    for (const sx of [-10, 10]) for (let y = 3; y < 6; y++) s.set(w / 2 + sx, y, M.tWhite[2]);
    // straw steps
    for (let x = 0; x < 16; x++) for (let y = 20; y <= base; y++) if (x > (base - y) * 0.9 - 2) s.set(x + 70, y, M.rope[(x + y) % 3 ? 2 : 1]);
    Paint.outline(s, M.ink[0]); s.ax = w >> 1; s.ay = base;
    return s;
  }
  function pole(M, c, seed) {
    // a corner pole with a big tassel and a streamer (sways)
    return [0, 1, 2, 3].map((f) => {
      const s = spr(22, 92), base = 91;
      for (let y = 8; y <= base; y++) { s.set(10, y, M.wood[3]); s.set(11, y, M.wood[1]); }
      for (let y = 0; y < 12; y++) for (let x = -2 - (y >> 2); x <= 2 + (y >> 2); x++) s.set(10 + x + (f % 2 ? 1 : 0) * (y > 6 ? 1 : 0), 8 + y, c[y > 8 ? 0 : x < 0 ? 1 : 2]);
      for (let y = 0; y < 24; y++) { const X = 12 + Math.round(Math.sin(y * 0.3 + f * 1.6 + seed) * 2 + y * 0.25); s.set(X, 20 + y, c[1]); s.set(X + 1, 20 + y, c[2]); }
      Paint.outline(s, M.ink[0]); s.ax = 10; s.ay = base; return s;
    });
  }
  function banner(M) {
    // "CHAMPION" nobori flag: a tall standing banner (text as simple bold stripes)
    const s = spr(20, 96), base = 95;
    for (let y = 4; y <= base; y++) s.set(3, y, M.wood[1]);
    for (let y = 8; y < 70; y++) for (let x = 4; x < 18; x++) s.set(x, y, x === 17 || y === 69 ? M.coralV[0] : (y - 8) % 12 < 2 ? M.umbB[2] : M.coralV[2]);
    for (let y = 14; y < 64; y += 12) for (let x = 7; x < 15; x++) s.set(x, y + 4, M.tWhite[2]);
    for (let x = 3; x < 19; x++) s.set(x, 7, M.wood[0]);
    Paint.outline(s, M.ink[0]); s.ax = 3; s.ay = base; return s;
  }
  function postStand(M) {
    const s = spr(46, 56), base = 55;
    // a red Pelipper Post box on a post, a letter board beside it
    for (let y = 30; y <= base; y++) { s.set(12, y, M.wood[2]); s.set(13, y, M.wood[1]); }
    for (let y = 8; y < 32; y++) for (let x = 2; x < 24; x++) { const r = y < 12 ? Math.abs(x - 13) > 11 - (y - 8) * 2 : false; if (!r) s.set(x, y, x < 5 ? M.tRed[2] : x > 21 ? M.tRed[0] : M.tRed[1]); }
    for (let x = 6; x < 20; x++) { s.set(x, 18, M.ink[0]); s.set(x, 19, M.tRed[0]); }
    for (let y = 22; y < 28; y++) for (let x = 9; x < 17; x++) s.set(x, y, (x + y) % 2 ? M.umbB[2] : M.umbB[1]);
    for (let y = 16; y < 44; y++) for (let x = 28; x < 44; x++) s.set(x, y, x === 28 || x === 43 || y === 16 || y === 43 ? M.wood[0] : M.wood[4]);
    for (const [lx, ly] of [[30, 19], [37, 22], [31, 31], [38, 34]]) for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) s.set(lx + x, ly + y, (x === y || x === 5 - y) && y < 3 ? M.tRed[1] : M.tWhite[2]);
    for (const px of [30, 41]) for (let y = 44; y <= base; y++) s.set(px, y, M.wood[1]);
    Paint.outline(s, M.ink[0]); s.ax = 13; s.ay = base; return s;
  }
  function surfboard(M, c, seed) {
    const s = spr(12, 46), r = rng(seed);
    for (let y = 0; y < 46; y++) { const hw = Math.round(5 * Math.sin(Math.min(1, (y + 2) / 44) * Math.PI) + 0.4); for (let x = -hw; x <= hw; x++) s.set(6 + x, y, Math.abs(x) < 1 ? M.tWhite[2] : c[x < 0 ? 3 : 2]); }
    const st = 12 + Math.floor(r() * 10); for (let x = -4; x <= 4; x++) { s.set(6 + x, st, M.tWhite[2]); s.set(6 + x, st + 1, M.tWhite[1]); }
    Paint.outline(s, M.ink[0]); s.ax = 6; s.ay = 40; return s;
  }
  function tower(M) {
    // lifeguard tower: stilts, a hut with a red cross and a little flag
    const s = spr(52, 100), base = 99;
    for (const lx of [8, 42]) for (let y = 40; y <= base; y++) { s.set(lx, y, M.wood[3]); s.set(lx + 1, y, M.wood[1]); }
    for (let i = 0; i < 6; i++) { const y = 50 + i * 8; for (let x = 10; x < 42; x++) if (Math.abs((x - 10) / 32 - (i % 2 ? (y - 50) % 16 / 16 : 1 - (y - 50) % 16 / 16)) < 0.04) s.set(x, y, M.wood[2]); }
    for (let y = 18; y < 42; y++) for (let x = 4; x < 48; x++) s.set(x, y, y < 21 ? M.tRed[1] : x < 7 || x > 44 ? M.wood[2] : (x + 2) % 8 === 0 ? M.wood[2] : M.tWhite[1]);
    for (let y = 24; y < 36; y++) for (let x = 20; x < 32; x++) if (Math.abs(x - 25.5) < 1.6 || Math.abs(y - 29.5) < 1.6) s.set(x, y, M.tRed[1]);
    for (let y = 10; y < 19; y++) for (let x = 0; x < 52; x++) if (Math.abs(x - 26) < 26 - (18 - y) * 2.2) s.set(x, y, y < 12 ? M.tRed[2] : M.tRed[1]);
    for (let y = 0; y < 11; y++) s.set(26, y, M.metal[2]);
    for (let y = 0; y < 5; y++) for (let x = 27; x < 35 - y; x++) s.set(x, y, M.umbB[2]);
    for (let x = 4; x < 48; x++) s.set(x, 42, M.wood[4]);
    Paint.outline(s, M.ink[0]); s.ax = 26; s.ay = base; return s;
  }

  /* ---------------- build ---------------- */
  const b0 = B.build;
  B.build = (A) => {
    b0(A);
    const M = A.M, r = rng(9191);
    const put = (s, x, zd, o) => A.put(s, x, zd, o);
    // the plank walk runs the whole way
    for (let x = X0 + 40; x < X1 - 40; x += 96) put(planks(M, 96), x + 48, 3, { sink: 4, foot: 96 });
    // palms and grass along the back
    for (let x = X0 + 60; x < X1; x += 160 + r() * 140) put(Paint.palm(M, 110 + r() * 40, Math.floor(x), { lean: (r() - 0.5) * 0.5 }), x, -5, { windFrames: true, sink: 3 });
    for (let x = X0; x < X1; x += 14 + r() * 26) put(Paint.tuft(M, 10 + r() * 10, 10 + r() * 10, Math.floor(x * 3), { ramp: M.grass, flowers: r() < 0.3 ? [M.flowerP] : r() < 0.3 ? [M.flowerY] : null }), x, -4 + r() * 2, { windFrames: true });
    // the tiki bar, stools and a menu board
    A.bar = put(tikiBar(M), BAR, -3, { sink: 2 });
    for (const dx of [-40, -14, 14, 40]) put(stool(M), BAR + dx, 1, { sink: 1 });
    { const s = Props.sign(M, 3); put(s, BAR - 90, -1, { sink: 2 }); }
    // the sumo ring, poles with tassels (the four colours of the directions), a champion banner
    A.ring = put(dohyo(M), RING, -2, { sink: 3 });
    const TC = [M.umbA, M.tRed, M.tWhite, M.boatB];
    [-96, -80, 80, 96].forEach((dx, i) => put(pole(M, TC[i], i), RING + dx, dx < 0 ? -3 : -3, { fps: 3, phase: i, sink: 2 }));
    put(banner(M), RING - 120, -4, { sink: 2 }); put(banner(M), RING + 116, -4, { sink: 2, flip: true });
    // the Pelipper Post stand
    put(postStand(M), POST, -2, { sink: 2 });
    // beach life: umbrellas + towels, surfboards stuck in the sand, a sandcastle, the lifeguard tower
    for (const x of [6560, 6760, 7980]) { put(Props.umbrella(M, Math.floor(x)), x, -1, { sink: 2 }); put(Props.towel(M), x + 22, 2, { sink: 1 }); }
    [[6900, M.umbA], [6914, M.coralP], [6928, M.umbB]].forEach(([x, c], i) => put(surfboard(M, c, i + 5), x, -3, { sink: 6 }));
    put(Props.sandcastle(M), 6640, 1, { sink: 2 });
    put(tower(M), TOWER, -4, { sink: 2 });
    for (let x = X0 + 30; x < X1; x += 90 + r() * 90) put(Props.driftwood(M, 18 + r() * 16, Math.floor(x)), x, 2, { sink: 1 });
    // string lights between the palms glow at dusk and night
    S.lights.length = 0;
    for (let x = BAR - 60; x <= BAR + 60; x += 20) A.glows.push({ x, y: gy(x) - 66, r: 12, c: hex('#ffd070'), a: 0.5 });
    for (let x = RING - 90; x <= RING + 90; x += 30) A.glows.push({ x, y: gy(x) - 80, r: 10, c: hex(x % 60 ? '#ff9ac0' : '#9ad8ff'), a: 0.4 });
    A.glows.push({ x: TOWER, y: gy(TOWER) - 70, r: 20, c: hex('#fff0a0'), a: 0.35 });
    // taps
    A.addHot({ x0: BAR - 60, x1: BAR + 60, y0: gy(BAR) - 100, y1: gy(BAR), x: BAR, reach: 70, tap: () => barMenu() });
    A.addHot({ x0: RING - 80, x1: RING + 80, y0: gy(RING) - 40, y1: gy(RING), x: RING, reach: 90, tap: () => challenge() });
    A.addHot({ x0: POST - 14, x1: POST + 32, y0: gy(POST) - 56, y1: gy(POST), x: POST, reach: 44, tap: () => HUD.toast('Pelipper Post — Boardwalk Branch. "Neither rain nor Ice Beam stops the mail!"', { life: 3 }) });
    A.addHot({ x0: TOWER - 26, x1: TOWER + 26, y0: gy(TOWER) - 100, y1: gy(TOWER), x: TOWER, reach: 60, tap() { HUD.toast('The lifeguard tower. From up top you can see the deep blue drop-off... something huge sleeps down there.', { life: 3.2 }); if (Save.discover('beach.tower')) Save.addPoints(150); } });
    // a far backdrop: a sunset pier and a little town on the headland
    {
      const w = 1500, h = 80, s = spr(w, h);
      Paint.ridge(s, M, { ramp: M.hill, base: h, amp: 30, seed: 88, freq: 0.004 });
      for (let x = 60; x < w - 60; x += 40 + r() * 70) { const hh = 10 + Math.floor(r() * 12), ww = 12 + Math.floor(r() * 10), y0 = h - 22 - Math.floor(r() * 16); for (let y = 0; y < hh; y++) for (let xx = 0; xx < ww; xx++) s.set(x + xx, y0 + y, y < 3 ? M.roof[2] : M.wall[(xx + y) % 5 ? 2 : 1]); }
      const L = A.layer(s, 0.3, { haze: 0.3, base: h - 1, x: X0 * 0.3 - 100 }); L.skirt = M.hill[2];
      A.layers.sort((a, b) => a.p - b.p);
    }
  };

  /* ---------------- Pokémon ---------------- */
  const sp0 = B.spawn;
  B.spawn = (A, G) => {
    sp0(A, G);
    S.champ = S.barkeep = null;
    try {
      const C = BeachAI.classes.CorphishM;
      if (C && typeof Corphish !== 'undefined') {
        const m = new C(RING, { minX: RING - 46, maxX: RING + 46 });
        if (m.sp) { G.addMon(m); m.champ = true; m.acc3 = { hat: 'topknot' }; m.accK = 0.62; m.scale *= 1.15; S.champ = m; }
      }
    } catch (e) { console.error(e); }
    if (typeof Eco !== 'undefined') {
      const lb = Eco.add(G, 'lombre', BAR, { minX: BAR - 34, maxX: BAR + 34, range: 34 });
      if (lb) { lb.forceAwake = 1e9; lb.barkeep = true; lb.acc3 = { hat: 'straw' }; lb.accK = 0.8; lb.accSink = 0.42; S.barkeep = lb; }
      Eco.add(G, 'marill', 6700, { range: 200 }); Eco.add(G, 'azurill', 6760, { range: 160 });
      Eco.add(G, 'linoone', 7000, { minX: X0 + 100, maxX: X1 - 100 });
      Eco.add(G, 'swellow', 7400, { range: 600 });
      Eco.add(G, 'spinda', 7560, { range: 120 });
    }
  };

  /* ---------------- the bar ---------------- */
  const DRINKS = [
    { id: 'zip', name: 'Zippy Pecha Fizz', cost: 60, desc: 'Mudkip runs faster for a minute!', fn() { Game.mudkip.buffT = 60; } },
    { id: 'glow', name: 'Glow Colada', cost: 80, desc: 'Shiny things sparkle brighter (1 min).', fn() { S.glowT = 60; } },
    { id: 'lucky', name: 'Lucky Lemonade', cost: 120, desc: 'Next photo gets bonus points!', fn() { S.lucky = true; } },
  ];
  function barMenu() {
    const lb = S.barkeep, mk = Game.mudkip;
    if (!mk || Math.abs(mk.x - BAR) > 110) return;
    const who = lb && lb.alive ? lb : null;
    Talk.open([
      { text: 'Lom-bre! Welcome to the Sunset Bar! What can I get you? (You have ' + Save.data.points + ' pts)', choices: DRINKS.map((d) => d.name + ' ' + d.cost).concat(['Nothing']) },
    ], { who, name: 'Lombre the Bartender', done: (i) => {
      const d = DRINKS[i]; if (!d) return;
      if (Save.data.points < d.cost) { HUD.toast('Not enough research points! (' + d.cost + ' needed)', { life: 2 }); Game.sfx('error'); return; }
      Save.addPoints(-d.cost); d.fn(); Game.sfx('yum');
      HUD.toast(d.name + ': ' + d.desc, { life: 2.8, col: 0xff7ae0ff });
      FX.sparkles(mk.x, mk.y - 16, 14, 18, 0xffffffff, hex('#ff9ac0')); mk.emote && mk.emote('heart', 1.2);
      if (who) Talk.bubble(() => who.headPt(), pick(['Lom-bre! Enjoy!', 'Shaken, not stirred!', 'Hehe! On the house... no wait.']), { life: 1.8, who });
      if (Save.discover('bar.' + d.id)) Save.addPoints(30);
    } });
  }

  /* ---------------- the sumo ring ---------------- */
  function challenge(m) {
    const c = m || S.champ, mk = Game.mudkip;
    if (!c || !c.alive || !mk || typeof Arcade === 'undefined') { HUD.toast('The champion is out for a snack...', { life: 2 }); return; }
    if (Math.abs(mk.x - RING) > 150) return;
    const wins = Save.data.stats.sumo || 0;
    Talk.open([
      { text: wins ? 'Back for more, shrimp? I am still the champ... in my heart. (Wins: ' + wins + ')' : '*SNIP SNIP* I am the Belly-Flop Champion of Coral Cove!' },
      { text: 'Step into the ring and push me out. If you can!', choices: ['Hakkeyoi! (Fight)', 'Not today'] },
    ], { who: c, name: 'Champion Corphish', done: (i) => { if (i === 0) Arcade.challenge('sumo', c, { ring: RING }); } });
  }

  /* ---------------- mail: Postal Helper ---------------- */
  const TO = [{ k: 'barkeep', name: 'Lombre at the Sunset Bar' }, { k: 'champ', name: 'the Sumo Champion' }, { k: 'walrein', name: 'Walrein on the rocks' }];
  const isTo = (m, t) => (t.k === 'barkeep' ? m.barkeep : t.k === 'champ' ? m.champ : m.kind === t.k);
  Talk.QUESTS.push({ id: 'q.mail3', area: 'beach', giver: 'mailman', title: 'Postal Helper', after: 'q.mail2',
    intro: ['Pelipper! You again! Perfect timing!', 'The Boardwalk past the Fossil Cliffs just opened, and the letters are piling up!', 'Deliver these 3: Lombre at the Sunset Bar, the Sumo Champion, and grumpy old Walrein. Just walk up and talk to them!'],
    progress: 'mail', n: 3, wait: ['Pelipper! {left} letters left! Lombre, the Sumo Champion and Walrein.'],
    done: ['PELI-PELIII! All delivered! You are a natural!', 'Here: your very own Pelipper Post uniform. Welcome to the team!'], reward: 'hat.mail',
    onDone: () => { for (const id of ['shirt.postal', 'neck.mailbag']) { const r = Rewards.grant(id); if (r) { Quests.Q.pops.push({ t: 0, life: 4.2, text: 'Pelipper Post uniform', reward: r }); Quests.Q.unseenN++; Style.markNew(id); } } } });
  Talk.hooks.push((m) => {
    const s = Talk.qState('q.mail3');
    if (m.champ && !(s && s.s === 'active' && !(s.to || []).includes('champ'))) { challenge(m); return true; }
    if (m.barkeep && !(s && s.s === 'active' && !(s.to || []).includes('barkeep'))) { barMenu(); return true; }
    if (!s || s.s !== 'active') return false;
    const t = TO.find((q) => isTo(m, q)); if (!t) return false;
    s.to = s.to || []; if (s.to.includes(t.k)) return false;
    s.to.push(t.k);
    const nm = DexData.S[m.dex] ? DexData.S[m.dex].name : m.kind;
    const lines = { barkeep: ['Lom-bre? A letter for me? From my cousin Ludicolo!', '(Lombre reads it and does a little dance.)'], champ: ['*snip* Fan mail? For ME?', '(The champion hides it in his topknot, very carefully.)'], walrein: ['...HMPH.', '(Walrein reads the letter. Its whiskers twitch. Was that... a smile?)'] }[t.k];
    Talk.open(lines, { who: m, name: nm, title: 'Postal Helper' });
    Game.sfx('page'); FX.sparkles(m.x, m.y - 20, 8, 14);
    Talk.progress('q.mail3');
    return true;
  });

  /* ---------------- per frame ---------------- */
  function update(dt) {
    const mk = Game.mudkip; if (!mk || Game.areaId !== 'beach') return;
    if (mk.buffT > 0) { mk.buffT -= dt; if (Math.random() < dt * 8 && Math.abs(mk.vx || 0) > 40) FX.add({ type: 'spark', x: mk.x + (Math.random() - 0.5) * 10, y: mk.y - 6 - Math.random() * 10, size: 1, life: 0.3, c: 0xffff9ac0, c2: 0xffffffff, layer: 3 }); }
    if (S.glowT > 0) S.glowT -= dt;
  }
  // letters float over the Pokémon that still need their mail
  function drawUI(fb, t) {
    const s = Talk.qState && Talk.qState('q.mail3'); if (!s || s.s !== 'active' || Game.areaId !== 'beach' || Game.mode !== 'explore') return;
    for (const m of Mons.all) {
      if (!m.alive || !m.visible) continue;
      const q = TO.find((o) => isTo(m, o)); if (!q || (s.to || []).includes(q.k)) continue;
      let p; try { p = m.headPt(); } catch (e) { continue; }
      const [ux, uy] = Talk.toUI(p[0], p[1] - 14 + Math.sin(t * 4) * 2);
      const X = Math.round(ux) - 5, Y = Math.round(uy) - 4;
      UI.rect(fb, X - 1, Y - 1, 12, 9, 0xff1b2240); UI.rect(fb, X, Y, 10, 7, 0xfff4f8ff);
      for (let i = 0; i < 5; i++) { UI.put(fb, X + i, Y + Math.min(i, 3), 0xff3a3ad4); UI.put(fb, X + 9 - i, Y + Math.min(i, 3), 0xff3a3ad4); }
    }
  }
  Object.assign(S, { update, drawUI, barMenu, challenge, RING, BAR, X0, X1 });
  return S;
})();
