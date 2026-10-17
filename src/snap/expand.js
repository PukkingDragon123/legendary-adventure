/* ------------------------------------------------------------------
   Expand — bigger maps. Weather Woods now runs on past the stump into
   the Flower Meadow: a rolling hill of wildflowers (they change with
   the seasons), a berry orchard, a creaking windmill on the hilltop
   with a view over the treetops, and a picnic spot. Coral Cove's dunes
   get a second tide pool path and Treetop Town a wider sky.
------------------------------------------------------------------- */
const Expand = (() => {
  const { rng, hex, clamp } = U;
  const F = Areas.forest;
  if (F) {
    const X0 = F.W, W1 = 5770, MILL = 4850;
    F.W = W1;
    // the meadow's rolling hill
    F.ground = F.ground.filter((p) => p[0] < X0).concat([[4170, 550], [4320, 546], [4490, 534], [4670, 516], [4850, 508], [5030, 518], [5210, 538], [5390, 548], [5570, 552], [5770, 552]]);
    // the windmill: a tapered brick tower with a balcony, shuttered windows with flower boxes, a shingled cap and
    // four lattice sails with canvas panels (frame = rotation step)
    function windmill(M, frame) {
      const w = 130, h = 150, s = new ISpr(w, h), cx = w / 2, base = h - 2, TH = 86;
      const hwAt = (y) => 15 - (y / TH) * 5; // half width, y from the base up
      for (let yy = 0; yy < TH; yy++) {
        const y = base - yy, hw = hwAt(yy), course = Math.floor(yy / 4), off = course % 2 ? 3 : 0;
        for (let x = -Math.round(hw); x <= Math.round(hw); x++) {
          const u = (x + hw) / (2 * hw); // 0 lit left .. 1 shaded right
          let lit = 0.92 - u * 0.62 - (yy % 4 === 0 ? 0.22 : 0) - (((x + 40 + off) % 6) === 0 ? 0.18 : 0) + (U.hash(Math.floor((x + 40 + off) / 6), course, 3) - 0.5) * 0.14;
          if (yy < 6) lit -= 0.12; // damp plinth
          s.set(cx + x, y, Props.pick(yy < 6 ? M.rock : M.wallW, lit, x, yy));
        }
      }
      // arched door with a stone step, two shuttered windows with flower boxes
      for (let y = base - 20; y < base; y++) for (let x = -5; x <= 5; x++) { const top = base - 20 + Math.round((x * x) / 9); if (y < top) continue; s.set(cx + x, y, Math.abs(x) === 5 || y === top ? M.wood[0] : (x === 0 ? M.wood[1] : M.wood[x < 0 ? 3 : 2])); }
      s.set(cx + 3, base - 10, M.metal[3]);
      for (let x = -7; x <= 7; x++) s.set(cx + x, base, M.rock[3]);
      for (const [wy, wx] of [[base - 44, 0], [base - 66, 0]]) {
        for (let y = wy; y < wy + 9; y++) for (let x = -3; x <= 3; x++) s.set(cx + wx + x, y, Math.abs(x) === 3 || y === wy ? M.wood[0] : x === 0 || y === wy + 4 ? M.wood[1] : M.win[y < wy + 4 ? 1 : 0]);
        for (let y = wy; y < wy + 9; y++) { s.set(cx + wx - 5, y, M.roofB[y % 3 ? 2 : 1]); s.set(cx + wx - 4, y, M.roofB[3]); s.set(cx + wx + 4, y, M.roofB[1]); s.set(cx + wx + 5, y, M.roofB[2]); }
        for (let x = -4; x <= 4; x++) { s.set(cx + wx + x, wy + 9, M.wood[2]); s.set(cx + wx + x, wy + 10, M.wood[1]); if (x % 2 === 0) s.set(cx + wx + x, wy + 8, [M.flower, M.flowerY, M.lotus][(x + 4) % 3][1]); }
      }
      // balcony ring under the cap
      const by = base - TH + 4;
      for (let x = -19; x <= 19; x++) { s.set(cx + x, by, M.wood[4]); s.set(cx + x, by + 1, M.wood[1]); if (x % 4 === 0) for (let y = by - 6; y < by; y++) s.set(cx + x, y, M.wood[2]); s.set(cx + x, by - 6, M.wood[3]); }
      for (let j = 0; j < 6; j++) { s.set(cx - 18 + j, by + 2 + j, M.wood[1]); s.set(cx + 18 - j, by + 2 + j, M.wood[1]); }
      // shingled onion cap with a finial
      const ct = base - TH - 18;
      for (let y = 0; y < 20; y++) { const hw = Math.round(12 * Math.sin(Math.min(1, (y + 3) / 16) * Math.PI * 0.62) + (y > 14 ? 1 : 0)); for (let x = -hw; x <= hw; x++) s.set(cx + x, ct + y, Props.pick(M.roofB, 0.92 - (x + hw) / (2 * hw + 1) * 0.55 - (y % 4 === 3 ? 0.25 : 0) + ((x + y) % 5 === 0 ? -0.1 : 0), x, y)); }
      for (let y = ct - 6; y < ct; y++) s.set(cx, y, M.metal[2]);
      s.set(cx - 1, ct - 4, M.metal[3]); s.set(cx + 1, ct - 4, M.metal[1]);
      // four lattice sails, turning
      const a0 = frame * Math.PI / 8, hx = cx, hy = ct + 10;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
        for (let j = 3; j < 50; j++) {
          const px = hx + dx * j, py = hy + dy * j;
          s.set(px, py, M.wood[1]); s.set(px + dy * 0.6, py - dx * 0.6, M.wood[2]);
          if (j > 9) for (let q = 1; q <= 8; q++) {
            const grid = j % 5 === 0 || q === 4 || q === 8;
            const sx = px - dy * q, sy = py + dx * q;
            s.set(sx, sy, grid ? M.wood[2] : (q < 4 ? M.wallW[3] : M.wallW[2]));
          }
        }
      }
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) s.set(hx + x, hy + y, x + y < 0 ? M.metal[3] : M.metal[1]);
      Paint.outline(s, M.ink[0]);
      s.ax = Math.round(cx); s.ay = base;
      return s;
    }
    // post-and-rail fence
    function fence(M, len, seed) {
      const s = new ISpr(len + 2, 18), r = rng(seed);
      for (let x = 0; x <= len; x += 14) for (let y = 2; y < 18; y++) { s.set(x, y, M.wood[3]); s.set(x + 1, y, M.wood[1]); }
      for (const ry of [5, 11]) for (let x = 0; x <= len; x++) { const sag = Math.round(Math.sin((x % 14) / 14 * Math.PI) * 0.6); s.set(x, ry + sag, M.wood[4]); s.set(x, ry + 1 + sag, M.wood[2]); }
      for (let k = 0; k < len / 10; k++) { const x = Math.floor(r() * len); for (let j = 0; j < 3 + r() * 6; j++) s.set(x + (j % 2), 17 - j, M.grass[2 + (j % 2)]); }
      Paint.outline(s, M.ink[0]);
      s.ax = 0; s.ay = 17;
      return s;
    }
    // a straw bee skep on a little stand
    function skep(M) {
      const s = new ISpr(20, 24);
      for (let y = 0; y < 15; y++) { const hw = Math.round(8 * Math.sin(Math.min(1, (y + 2) / 12) * Math.PI * 0.55)); for (let x = -hw; x <= hw; x++) s.set(10 + x, 2 + y, Props.pick(M.litter, 0.95 - (x + hw) / (2 * hw + 1) * 0.5 - (y % 3 === 2 ? 0.28 : 0), x, y)); }
      for (let y = 12; y < 16; y++) for (let x = 8; x < 12; x++) s.set(x, y, M.ink[1]);
      for (let x = 2; x < 18; x++) { s.set(x, 17, M.wood[4]); s.set(x, 18, M.wood[2]); }
      for (let y = 19; y < 24; y++) { s.set(4, y, M.wood[2]); s.set(15, y, M.wood[1]); }
      Paint.outline(s, M.ink[0]);
      s.ax = 10; s.ay = 23;
      return s;
    }
    // a round hay bale
    function bale(M, seed) {
      const s = new ISpr(26, 20), r = rng(seed);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { const q = ((x - 12) / 12) ** 2 + ((y - 9) / 9) ** 2; if (q > 1) continue; const swirl = Math.sin(Math.hypot(x - 7, y - 9) * 1.4) > 0.6; s.set(x + 1, y + 1, Props.pick(M.fruit, 0.85 - x / 24 * 0.5 - (swirl && x < 12 ? 0.3 : 0) + (r() - 0.5) * 0.2, x, y)); }
      Paint.outline(s, M.ink[0]);
      s.ax = 13; s.ay = 18;
      return s;
    }
    // a tall flower spike (lupin / foxglove) or a sunflower
    function tallFlower(M, kind, seed) {
      const r = rng(seed), H = 22 + Math.floor(r() * 12), s = new ISpr(14, H + 2), cx = 7;
      for (let y = 6; y < H; y++) { s.set(cx, y, M.grass[2]); if (y % 5 === 0) { s.set(cx - 1, y, M.grass[3]); s.set(cx - 2, y + 1, M.grass[2]); s.set(cx + 1, y + 2, M.grass[3]); s.set(cx + 2, y + 3, M.grass[2]); } }
      if (kind === 'sun') { for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const q = x * x + y * y; if (q > 18) continue; s.set(cx + x, 5 + y, q < 6 ? M.bark[(x + y) & 1 ? 1 : 2] : M.flowerY[q < 12 ? 1 : 2 - ((x + y) & 1)]); } }
      else { const F = kind === 'lupin' ? M.berry : M.lotus; for (let y = 0; y < 14; y++) { const hw = Math.max(0, 2 - Math.floor(y / 6)); for (let x = -hw - (y % 2); x <= hw; x++) s.set(cx + x, 1 + y, F[(x + y) % 3 === 0 ? 0 : x < 0 ? 2 : 1]); } }
      Paint.outline(s, M.ink[0]);
      s.ax = cx; s.ay = H;
      return s;
    }
    const b0 = F.build;
    F.build = (A) => {
      b0(A);
      const M = A.M, r = rng(7171), gy = (x) => World.groundAt(x);
      const put = (s, x, zd, o) => A.put(s, x, zd, o);
      // the windmill (sails turn: 8 steps make a quarter turn)
      A.mill = put([0, 1, 2, 3].map((f) => windmill(M, f)), MILL, -6, { sink: 2, fps: 3 });
      for (const wy of [44, 66]) A.glows.push({ x: MILL, y: gy(MILL) - wy + 2, r: 14, c: hex('#ffd070'), a: 0.5 });
      // wildflower meadow: low tufts, tall lupins and foxgloves, a stand of sunflowers
      for (let x = X0; x < W1 - 30; x += 6 + r() * 7) {
        const fl = [M.flower, M.flowerY, M.lotus, M.berry][(r() * 4) | 0];
        put(Paint.tuft(M, 10 + r() * 8, 10 + r() * 12, Math.floor(x * 7), { ramp: M.grass, flowers: [fl], density: 1.2 }), x, r() < 0.5 ? 3 : -3, { windFrames: true });
      }
      for (let x = X0 + 40; x < W1 - 40; x += 20 + r() * 50) { if (Math.abs(x - MILL) < 40) continue; const k = r(); put(tallFlower(M, k < 0.4 ? 'lupin' : k < 0.75 ? 'fox' : 'sun', Math.floor(x)), x, r() < 0.5 ? -4 : 2, { sink: 0, sway: 1.4 }); }
      for (let x = 4960; x < 5040; x += 9 + r() * 5) put(tallFlower(M, 'sun', Math.floor(x * 3)), x, -5, { sink: 0, sway: 1 });
      // orchard trees heavy with fruit, a picnic blanket and a signpost
      for (const x of [4310, 4480, 4650, 5110, 5270, 5450, 5630]) { const tr = Paint.tree(M, 140 + r() * 40, Math.floor(x), { trunkRamp: M.bark, leafRamp: M.leaf, fruit: M.fruit, fruitN: 22, crownW: 140, crownH: 92 }); Scenic.bark(tr, M.bark, { moss: M.moss, seed: x, mossK: 0.15 }); put(tr, x, -4, { sink: 4, foot: 16 }); }
      { const s = new ISpr(40, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 40; x++) s.set(x, y, ((x >> 2) + (y >> 1)) % 2 ? M.capR[2] : M.stem[3]); Paint.outline(s, M.ink[0]); s.ax = 20; s.ay = 7; put(s, 5070, 3, { sink: 1 }); }
      // a picnic basket and a jug on the blanket
      { const s = new ISpr(16, 12); for (let y = 4; y < 11; y++) for (let x = 1; x < 12; x++) s.set(x, y, (x + y) % 2 ? M.litter[3] : M.litter[2]); for (let x = 3; x < 10; x++) s.set(x, 2 + Math.round(Math.abs(x - 6.5) * 0.3), M.wood[2]); for (let y = 6; y < 11; y++) { s.set(13, y, M.wallW[3]); s.set(14, y, M.wallW[2]); } Paint.outline(s, M.ink[0]); s.ax = 8; s.ay = 10; put(s, 5076, 2, { sink: 1 }); }
      { const s = new ISpr(20, 28); for (let y = 8; y < 28; y++) { s.set(9, y, M.wood[1]); s.set(10, y, M.wood[2]); } for (let y = 2; y < 10; y++) for (let x = 0; x < 20; x++) s.set(x, y, x === 0 || x === 19 || y === 2 || y === 9 ? M.wood[0] : M.wood[4]); for (let x = 4; x < 16; x += 3) s.set(x, 5, M.wood[1]); for (let x = 5; x < 14; x += 4) s.set(x, 7, M.wood[1]); Paint.outline(s, M.ink[0]); s.ax = 10; s.ay = 27; put(s, 4230, -2, { sink: 1 }); }
      // fences along the hill path, beehives by the orchard, hay bales by the mill
      for (const [x, len] of [[4380, 90], [4560, 70], [5180, 84], [5480, 110]]) put(fence(M, len, x), x, -5, { sink: 1, foot: 4 });
      for (const x of [5195, 5222]) put(skep(M), x, -3, { sink: 1 });
      for (const [x, k] of [[4770, 0], [4796, 1], [4930, 2]]) put(bale(M, 80 + k), x, -3, { sink: 2 });
      A.addHot({ x0: 4216, x1: 4244, y0: gy(4230) - 28, y1: gy(4230), x: 4230, reach: 34, tap() { HUD.toast('Flower Meadow — "Rest your paws. The windmill has watched these fields for a hundred years."', { life: 3 }); } });
      A.addHot({ x0: MILL - 20, x1: MILL + 20, y0: gy(MILL) - 120, y1: gy(MILL), x: MILL, reach: 50, tap() { HUD.toast('The old windmill creaks round and round. From up here you can see all of Weather Woods.', { life: 3 }); if (Save.discover('forest.windmill')) Save.addPoints(150); } });
      // backdrop: a patchwork of fields (tulip stripes, wheat, lavender) over rolling hills, hedgerows, a red barn,
      // a farmhouse and far-off windmills
      {
        const w = 1100, h = 120, s = new ISpr(w, h), hill = new Float32Array(w);
        for (let x = 0; x < w; x++) hill[x] = 46 + Math.sin(x * 0.006 + 1) * 16 + Math.sin(x * 0.017) * 7 + (U.vnoise(x * 0.01, 2, 61) - 0.5) * 10;
        const FLD = [M.grass, M.moss, M.flowerY, M.grass, M.litter, M.moss, M.berry, M.grass, M.hill, M.lotus, M.grass, M.moss];
        for (let x = 0; x < w; x++) {
          const top = Math.round(hill[x]);
          for (let y = top; y < h; y++) {
            // parcels: columns that lean with the slope, rows that climb the hill; each its own crop
            const fy = y - top, ux = x + Math.sin(fy * 0.07 + x * 0.004) * 8 + fy * 0.6, uy = fy * 2.4 + x * 0.22 + Math.sin(x * 0.012) * 18;
            const col = Math.floor(ux / 64), row = Math.floor(uy / 20), field = FLD[Math.floor(U.hash(col, row, 61) * FLD.length)];
            const rowLine = (Math.floor(uy) % 3 === 0) && field !== M.grass;
            let c = Props.pick(field, 0.6 - fy / 130 + (rowLine ? -0.15 : 0) + (U.hash(x, y, 4) - 0.5) * 0.12, x, y);
            if (fy < 1) c = M.grass[4];
            const ex = ((ux % 64) + 64) % 64, ey = ((uy % 20) + 20) % 20;
            if (ex < 1.5 || ey < 1.1) c = M.leafD[ex < 1.5 && ey < 1.1 ? 1 : 2]; // hedgerows between the parcels
            s.set(x, y, c);
          }
        }
        // hedgerow bushes and lone trees
        for (let x = 0; x < w; x += 18 + r() * 40) { const t = Paint.tree(M, 22 + r() * 16, Math.floor(x * 5), { trunkRamp: M.bark, leafRamp: M.leaf, crownW: 22, crownH: 16, trunkW: 2 }); s.paste(t, Math.round(x - t.ax), Math.round(hill[Math.min(w - 1, Math.round(x))] + 6 + r() * 30 - t.ay)); }
        for (let x = 0; x < 300; x += 8 + r() * 12) { const t = Paint.tree(M, 80 + r() * 40 - x * 0.12, Math.floor(x * 9), { trunkRamp: M.bark, leafRamp: x < 200 ? M.leafD : M.leaf, crownW: 54, crownH: 44, trunkW: 3 }); s.paste(t, Math.round(x - t.ax), h - 2 - t.ay); }
        // a red barn and a farmhouse
        const house = (x, bw, bh, wall, roof) => { const y0 = Math.round(hill[x] + 18); for (let y = 0; y < bh; y++) for (let q = 0; q < bw; q++) s.set(x + q, y0 - y, Props.pick(wall, 0.8 - q / bw * 0.4, q, y)); for (let y = 0; y < bw / 2 + 2; y++) for (let q = -1 + y; q <= bw - y; q++) s.set(x + q, y0 - bh - bw / 2 + y + 1, Props.pick(roof, 0.85 - y / bw, q, y)); s.set(x + bw / 2, y0 - 3, M.wood[0]); s.set(x + bw / 2, y0 - 2, M.wood[0]); s.set(x + 3, y0 - bh + 3, M.win[1]); };
        house(670, 22, 12, M.capR, M.roofB); house(730, 14, 9, M.wallW, M.capR);
        // distant windmills
        for (const [x, sz] of [[430, 1], [950, 0.8]]) { const y0 = Math.round(hill[x] + 4), th = Math.round(16 * sz); for (let y = 0; y < th; y++) for (let q = -2; q <= 2; q++) s.set(x + q, y0 - y, M.wallW[q < 0 ? 3 : 1]); for (let j = -9; j <= 9; j++) { s.set(x + j, y0 - th + Math.round(j * 0.3), M.wood[1]); s.set(x + Math.round(j * 0.3), y0 - th - j, M.wood[1]); } }
        const L = A.layer(s, 0.3, { haze: 0.36, base: h - 1, x: 3450 * 0.3 }); L.skirt = M.grass[1];
        A.layers.sort((a, b) => a.p - b.p);
      }
    };
    const sp0 = F.spawn;
    F.spawn = (A, G) => {
      sp0(A, G);
      if (typeof Eco === 'undefined') return;
      Eco.add(G, 'linoone', 4570, { minX: 4220, maxX: 5670 });
      for (const x of [4370, 4770, 5320]) Eco.add(G, 'budew', x, { range: 120 });
      Eco.add(G, 'nuzleaf', 5170, { range: 220 });
      Eco.add(G, 'swellow', 4870, { range: 700 });
    };
  }
  return { forestX0: 4170 };
})();
