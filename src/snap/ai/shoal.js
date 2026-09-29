/* ------------------------------------------------------------------
   ShoalAI — who lives in Shoal Cave:
    · Spheal and a Sealeo lounging on the snowy shore (they love the cold)
    · Snorunt playing on the ice slide
    · Staryu and Starmie glittering in the tide pool at night
    · Latias and Latios racing over the frozen sea at dusk — now and then
      they fly together, wingtip to wingtip (the Eon duo!)
    · Regice, frozen deep in the chamber
------------------------------------------------------------------- */
const ShoalAI = (() => {
  const { rnd, clamp, lerp } = U;
  const S = { duoT: 20, duo: [] };
  function spawn(A, G, geo) {
    Object.assign(S, geo, { duoT: rnd(12, 22), duo: [] });
    const E = typeof Eco !== 'undefined' ? Eco : null; if (!E) return;
    E.herd(G, 'sphealS', 330, 640, 3, { range: 260 });
    E.add(G, 'sealeoS', 560, { range: 180 });
    [2140, 2420, 2700].forEach((x) => E.add(G, 'snorunt', x, { range: 220 }));
    const box = { x0: geo.POOL.x0 + 20, x1: geo.POOL.x1 - 20, y0: geo.POOL.level + 10, y1: geo.POOL.level + 56 };
    const h = Game.hour();
    if (h === 'night' || h === 'dusk') { E.add(G, 'starmie', 1300, { box, minX: box.x0, maxX: box.x1 }); E.add(G, 'staryuS', 1380, { box, minX: box.x0, maxX: box.x1 }); }
    const a = E.add(G, 'latias', 360, { y: 420, minX: 120, maxX: geo.MOUTH - 60, range: 400 });
    const b = E.add(G, 'latios', 560, { y: 400, minX: 120, maxX: geo.MOUTH - 60, range: 400 });
    S.duo = [a, b].filter(Boolean);
    if (typeof Legends !== 'undefined') Legends.spawnRegice(G, geo.REGI);
  }
  // the Eon duo: every so often the two fly a loop together over the shore
  function* duoFlight(m, other, lead) {
    let e = 0; const T = 7, cx = 420, cy = 430;
    m.mode = 'fly'; m.perched = false;
    while (e < T) {
      const dt = yield; e += dt;
      const a = e / T * Math.PI * 2 * (lead ? 1 : 1) + (lead ? 0 : -0.35);
      const tx = cx + Math.cos(a) * 260, ty = cy + Math.sin(a * 2) * 40 + (lead ? 0 : 14);
      const px = m.x, py = m.y;
      m.x = lerp(m.x, tx, Math.min(1, dt * 3)); m.y = lerp(m.y, ty, Math.min(1, dt * 3)); m.moving = 90;
      m.vx = (m.x - px) / Math.max(dt, 0.016); m.vy = (m.y - py) / Math.max(dt, 0.016);
      if (Math.abs(m.vx) > 5) m.turn(m.face(Math.sign(m.vx), true), dt, 5);
      const close = other && other.alive && Math.hypot(other.x - m.x, other.y - m.y) < 70;
      m.setAct(close ? 'pair' : 'fly', close ? 0.9 : 0.5);
      if (Math.random() < dt * 20) FX.add({ type: 'spark', x: m.x - Math.sign(m.vx || 1) * 16, y: m.y, size: 1, life: 0.5, c: 0xffffffff, c2: lead ? U.hex('#ffb0c8') : U.hex('#a8c8ff'), layer: 3 });
    }
  }
  function update(A, dt, t, G, AS) {
    const h = Game.hour();
    if (S.duo.length === 2 && (h === 'dusk' || h === 'night' || h === 'dawn' || Math.random() < 0.5)) {
      S.duoT -= dt;
      if (S.duoT <= 0) {
        S.duoT = rnd(26, 40);
        const [a, b] = S.duo;
        if (a.alive && b.alive && !a.busy(5) && !b.busy(5)) { a.doTask(duoFlight(a, b, true), 5); b.doTask(duoFlight(b, a, false), 5); Game.sfx('whoosh', 420, 0.6); }
      }
    }
  }
  function song(x) {}
  return { spawn, update, song, S };
})();
