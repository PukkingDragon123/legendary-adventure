/* ------------------------------------------------------------------
   Bite — grumpy Pokémon have a cartoon temper. Get too close to one
   that is already cross and it puffs steam, glows red with a throbbing
   anger mark... then CHOMP! Mudkip rockets sky-high, spinning, and
   bawls its eyes out when it lands. Only a bite — no harm done.
------------------------------------------------------------------- */
const Bite = (() => {
  const { rnd } = U;
  const S = { cool: 0, cry: 0 };
  function* rage(m, mk) {
    let e = 0; Game.sfx('grr', m.x, 0.8); m.emote('anger', 1.2);
    if (typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), 'GRRRR!!', { life: 1, who: m });
    while (e < 0.7) {
      const dt = yield; e += dt;
      m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 10);
      m.tint = 0xff3a3aff; m.tintK = 0.25 + 0.25 * Math.sin(e * 30);
      m.rot = Math.sin(e * 50) * 0.05; m.o.mouth = 0.2; m.o.eyes = 'angry';
      if (Math.random() < dt * 14) { const [hx, hy] = m.headPt(); FX.add({ type: 'dust', x: hx + rnd(-6, 6), y: hy - 2, vx: rnd(-20, 20), vy: -rnd(20, 50), r: 2, life: 0.5, c: 0xffe8e8e8, c2: 0xffb0b0b0, layer: 3 }); }
      m.setAct('attack', 0.7);
    }
    m.rot = 0; m.tintK = 0;
    if (Math.abs(mk.x - m.x) > 60 || mk.mode === 'swim') { m.emote('anger', 0.8); return; }
    // CHOMP
    m.o.mouth = 1; m.setAct('attack', 1);
    Game.sfx('snip', m.x, 1); Game.sfx('bonk', m.x, 0.8); Game.shake(4);
    FX.add({ type: 'ring', x: mk.x, y: mk.y - 10, r0: 4, r1: 22, life: 0.35, c: 0xffffffff, layer: 4 });
    mk.task && (mk.task.done = true);
    mk.mode = 'fall'; mk.air = 0; mk.vair = 0; mk.plat = null; mk.y -= 4;
    mk.vx = (mk.x > m.x ? 1 : -1) * rnd(70, 110); mk.vy = -720; mk.jumping = false; mk.pound = false;
    mk.flipT = 1.4; mk.flipLen = 1.4; mk.flipSpins = 3; mk.flipDir = mk.x > m.x ? 1 : -1; mk.flipped = true; mk.dizzy = 2.5;
    if (typeof Talk !== 'undefined') Talk.bubble(() => mk.headPt(), 'YEEOWCH!!', { life: 1.2, who: mk });
    S.cry = 3.2; m.annoy = 0;
    let q = 0; while (q < 1.2) { const dt = yield; q += dt; m.o.eyes = 'happy'; m.o.mouth = 0.5; m.setAct('attack', 0.6); }
  }
  function update(dt) {
    const mk = Game.mudkip; if (!mk || Game.mode !== 'explore') return;
    S.cool -= dt;
    // crying after landing: big tears and sobs
    if (S.cry > 0) {
      S.cry -= dt;
      if (mk.mode === 'land' && mk.air <= 0) {
        mk.o && (mk.o.eyes = 'closed', mk.o.mouth = 1);
        if (Math.random() < dt * 18) { const [hx, hy] = mk.headPt(); const d = Math.random() < 0.5 ? -1 : 1; FX.add({ type: 'drop', x: hx + d * 5, y: hy + 6, vx: d * rnd(40, 80), vy: -rnd(40, 90), g: 420, life: 0.8, c: 0xffffe0a0, c2: 0xffffb060, size: 2, floor: World.groundAt(mk.x), layer: 4 }); }
        if (Math.floor(S.cry * 2) !== Math.floor((S.cry + dt) * 2)) { Game.sfx('squeak', mk.x, 0.4); if (S.cry > 2.4 && typeof Talk !== 'undefined') Talk.bubble(() => mk.headPt(), 'WAAAAH!', { life: 1.2, who: mk }); }
      }
    }
    if (S.cool > 0 || mk.mode !== 'land') return;
    for (const m of Mons.all) {
      if (m === mk || !m.alive || m.sleeping || m.mode !== 'land' || m.layer || !m.doTask || m.busy(4)) continue;
      if (!((m.annoy || 0) > (m.persona === 'grumpy' ? 0.35 : 0.7))) continue;
      if (Math.abs(m.x - mk.x) > 26 + m.width() * 0.3 || Math.abs(m.y - mk.y) > 30) continue;
      S.cool = 7; m.doTask(rage(m, mk), 5); break;
    }
  }
  return { update, S };
})();
