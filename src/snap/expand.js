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
    const X0 = F.W, W1 = 4900, MILL = 3980;
    F.W = W1;
    // the meadow's rolling hill
    F.ground = F.ground.filter((p) => p[0] < X0).concat([[3300, 550], [3450, 546], [3620, 534], [3800, 516], [3980, 508], [4160, 518], [4340, 538], [4520, 548], [4700, 552], [4900, 552]]);
    function windmill(M, frame) {
      const w = 50, h = 78, s = new ISpr(w + 60, h + 54), cx = (w + 60) / 2, base = h + 50;
      // tapered stone tower with a door and window
      for (let y = 0; y < h; y++) { const hw = 9 + y * 0.12; for (let x = -hw; x <= hw; x++) s.set(cx + x, base - h + y, Props.pick(M.wallW, 0.8 - (x + hw) / (2 * hw) * 0.45 + (y % 9 === 0 ? -0.15 : 0), x, y)); }
      for (let y = base - 22; y < base; y++) for (let x = -5; x <= 5; x++) s.set(cx + x, y, x === -5 || x === 5 || y === base - 22 ? M.wood[1] : M.wood[3]);
      for (let y = base - 56; y < base - 46; y++) for (let x = -4; x <= 4; x++) s.set(cx + x, y, Math.abs(x) === 4 || y === base - 56 ? M.wood[0] : M.win[1]);
      // cap
      for (let y = 0; y < 14; y++) { const hw = 6 + y; for (let x = -hw; x <= hw; x++) s.set(cx + x, base - h - 14 + y, Props.pick(M.roofB, 0.8 - y / 16, x, y)); }
      // four sails, turning
      const a0 = frame * Math.PI / 8, hx = cx, hy = base - h - 4;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
        for (let j = 4; j < 40; j++) { const px = hx + dx * j, py = hy + dy * j; s.set(px, py, M.wood[1]); if (j > 10) for (let q = 1; q < 7; q++) s.set(px - dy * q, py + dx * q, (j + q) % 4 === 0 ? M.wood[2] : M.wallW[3]); }
      }
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) s.set(hx + x, hy + y, M.metal[2]);
      Paint.outline(s, M.ink[0]);
      s.ax = Math.round(cx); s.ay = base - 1;
      return s;
    }
    const b0 = F.build;
    F.build = (A) => {
      b0(A);
      const M = A.M, r = rng(7171), gy = (x) => World.groundAt(x);
      const put = (s, x, zd, o) => A.put(s, x, zd, o);
      // the windmill (sails turn: 4 frames)
      A.mill = put([0, 1, 2, 3].map((f) => windmill(M, f)), MILL, -6, { sink: 2, fps: 3 });
      A.glows.push({ x: MILL, y: gy(MILL) - 50, r: 18, c: hex('#ffd070'), a: 0.5 });
      // wildflower meadow
      for (let x = X0; x < W1 - 30; x += 6 + r() * 7) {
        const fl = [M.flower, M.flowerY, M.lotus, M.berry][(r() * 4) | 0];
        put(Paint.tuft(M, 10 + r() * 8, 10 + r() * 12, Math.floor(x * 7), { ramp: M.grass, flowers: [fl], density: 1.2 }), x, r() < 0.5 ? 3 : -3, { windFrames: true });
      }
      // orchard trees heavy with fruit, a picnic blanket and a signpost
      for (const x of [3440, 3610, 3780, 4240, 4400, 4580, 4760]) put(Paint.tree(M, 140 + r() * 40, Math.floor(x), { trunkRamp: M.bark, leafRamp: M.leaf, fruit: M.fruit, fruitN: 22, crownW: 140, crownH: 92 }), x, -4, { sink: 4, foot: 16 });
      { const s = new ISpr(40, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 40; x++) s.set(x, y, ((x >> 2) + (y >> 1)) % 2 ? M.capR[2] : M.stem[3]); Paint.outline(s, M.ink[0]); s.ax = 20; s.ay = 7; put(s, 4200, 3, { sink: 1 }); }
      { const s = new ISpr(20, 28); for (let y = 8; y < 28; y++) { s.set(9, y, M.wood[1]); s.set(10, y, M.wood[2]); } for (let y = 2; y < 10; y++) for (let x = 0; x < 20; x++) s.set(x, y, x === 0 || x === 19 || y === 2 || y === 9 ? M.wood[0] : M.wood[4]); Paint.outline(s, M.ink[0]); s.ax = 10; s.ay = 27; put(s, 3360, -2, { sink: 1 }); }
      A.addHot({ x0: 3346, x1: 3374, y0: gy(3360) - 28, y1: gy(3360), x: 3360, reach: 34, tap() { HUD.toast('Flower Meadow — "Rest your paws. The windmill has watched these fields for a hundred years."', { life: 3 }); } });
      A.addHot({ x0: MILL - 20, x1: MILL + 20, y0: gy(MILL) - 120, y1: gy(MILL), x: MILL, reach: 50, tap() { HUD.toast('The old windmill creaks round and round. From up here you can see all of Weather Woods.', { life: 3 }); if (Save.discover('forest.windmill')) Save.addPoints(150); } });
      // backdrop extension: rolling fields and far hills behind the meadow
      {
        const w = 1900, h = 90, s = new ISpr(w, h);
        Paint.ridge(s, M, { ramp: M.hill, base: h, amp: 50, seed: 61, freq: 0.006 });
        for (let x = 0; x < w; x += 30 + r() * 60) { const t = Paint.tree(M, 26 + r() * 18, Math.floor(x * 5), { trunkRamp: M.bark, leafRamp: M.leaf, crownW: 26, crownH: 18, trunkW: 2 }); s.paste(t, Math.round(x - t.ax), h - t.ay - 8 - Math.round(r() * 20)); }
        const L = A.layer(s, 0.3, { haze: 0.3, base: h - 1, x: X0 * 0.3 - 200 }); L.skirt = M.hill[2];
        A.layers.sort((a, b) => a.p - b.p);
      }
    };
    const sp0 = F.spawn;
    F.spawn = (A, G) => {
      sp0(A, G);
      if (typeof Eco === 'undefined') return;
      Eco.add(G, 'linoone', 3700, { minX: 3350, maxX: 4800 });
      for (const x of [3500, 3900, 4450]) Eco.add(G, 'budew', x, { range: 120 });
      Eco.add(G, 'nuzleaf', 4300, { range: 220 });
      Eco.add(G, 'swellow', 4000, { range: 700 });
    };
  }
  return { forestX0: 3300 };
})();
