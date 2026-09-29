/* ------------------------------------------------------------------
   VolcanoAI — who lives on Mt. Chimney:
    · a herd of Numel grazing the ash fields (their humps puff embers)
    · Spinda wobbling about — every one has its own spot pattern
    · Torkoal soaking in the hot spring and puffing smoke rings on the rocks
    · Slugma oozing through the lava puddles of Jagged Pass
    · Wynaut bouncing after a proud Wobbuffet by the bathhouse
    · shy Latias hiding near the bathhouse roof (she has a favour to ask)
    · and Groudon, asleep in the magma crater
------------------------------------------------------------------- */
const VolcanoAI = (() => {
  const { rnd } = U;
  const S = {};
  function spawn(A, G, geo) {
    Object.assign(S, geo);
    const E = typeof Eco !== 'undefined' ? Eco : null; if (!E) return;
    E.herd(G, 'numel', 260, 1150, 4, { range: 460 });
    E.add(G, 'numel', 2090, { range: 60 });
    [460, 820, 1260].forEach((x, i) => { const m = E.add(G, 'spinda', x, { range: 220 }); if (m) m.spots = 3 + i * 7; });
    E.add(G, 'torkoal', 1890, { minX: geo.SPRING.x0 + 30, maxX: geo.SPRING.x1 - 30, range: 120 });
    E.add(G, 'torkoal', 3010, { range: 140 });
    E.add(G, 'slugma', 3190, { minX: geo.PUDDLE.x0 + 8, maxX: geo.PUDDLE.x1 - 8, range: 40 });
    E.add(G, 'slugma', 3220, { minX: geo.PUDDLE.x0 + 8, maxX: geo.PUDDLE.x1 - 8, range: 40 });
    E.add(G, 'slugma', 3820, { range: 60 });
    E.family(G, 'wobbuffet', 'wynaut', 2470, 2, { range: 160 });
    E.add(G, 'latias', 2600, { loco: 'hover', hover: 46, range: 140 });
    if (typeof Legends !== 'undefined') Legends.spawnGroudon(G, geo.LAVA);
  }
  function update(A, dt, t, G) {}
  function song(x) {}
  return { spawn, update, song, S };
})();
