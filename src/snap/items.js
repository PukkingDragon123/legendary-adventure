/* ------------------------------------------------------------------
   Items — things in the world Mudkip can throw or push: berries
   (hungry Pokémon come to eat them), fish, fruit and the beach ball.
------------------------------------------------------------------- */
const Items = (() => {
  const { clamp, rnd } = U;
  const list = [];
  const BERRY = [['.kk.', 'kbbk', 'kbwb', '.kk.'], ['.gg.', 'kppk', 'kpwp', '.kk.']];
  const COL = { k: U.hex('#1b2240'), b: U.hex('#3a7ce8'), w: U.hex('#bfe2ff'), g: U.hex('#3aa84a'), p: U.hex('#ff6a9a') };
  const FRUIT = ['.g.', 'yyy', 'yoy', '.y.'];
  const FCOL = { g: U.hex('#3a8a3a'), y: U.hex('#ffd84a'), o: U.hex('#e0a020') };
  function add(it) { list.push(Object.assign({ vx: 0, vy: 0, t: 0, state: 'fly', claim: null, kind: 'berry', r: 2 }, it)); return it; }
  function throwBerry(x0, y0, tx, ty, kind = 'oran') {
    const T = 0.6;
    const vx = (tx - x0) / T, vy = (ty - y0 - 0.5 * 500 * T * T) / T;
    const b = kind === 'berry' ? 'oran' : kind;
    return add({ kind: b === 'pecha' ? 'pecha' : 'berry', berry: b, x: x0, y: y0, vx, vy, spin: 0 });
  }
  const BCOL = { oran: '#3a7ce8', pecha: '#ff6a9a', razz: '#d82a48', nanab: '#f0d040', sitrus: '#ffe030' };
  function drop(x, y, kind = 'fruit') { return add({ kind, x, y, vx: rnd(-30, 30), vy: -rnd(40, 90) }); }
  function update(dt, t) {
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      it.t += dt;
      if (it.state === 'fly') {
        it.vy += 500 * dt; it.x += it.vx * dt; it.y += it.vy * dt;
        const p = World.platAt(it.x);
        const s = WorldRender.surfaceAt(it.x, t), g = World.groundAt(it.x);
        if (p && it.vy > 0 && it.y >= p.y - 2 && it.y < p.y + 8) { it.y = p.y - 2; it.state = 'rest'; it.plat = p; land(it); }
        else if (World.waterAt(it.x) !== null && it.y >= s) { it.state = 'float'; FX.splashAt(it.x, s, { power: 0.25, n: 5 }); Game.sfx('plop', it.x, 0.6); land(it); }
        else if (it.y >= g - 1) { it.y = g - 1; it.state = 'rest'; Game.sfx('pat', it.x, 0.5); land(it); }
      } else if (it.state === 'float') {
        const s = WorldRender.surfaceAt(it.x, t);
        it.y += (s - 1 - it.y) * Math.min(1, dt * 8); it.x += Math.sin(t + it.x) * dt * 2;
        if (it.t > 30) it.state = 'gone';
      } else if (it.state === 'rest') { if (it.t > 45) it.state = 'gone'; }
      if (it.state === 'gone' || it.eaten) list.splice(i, 1);
    }
  }
  // tell nearby Pokémon about food
  function land(it) {
    it.t = 0;
    const cands = Mons.all.filter((m) => m.alive && m !== Game.mudkip && m.onFood && Math.abs(m.x - it.x) < (m.smell ?? 320)).sort((a, b) => Math.abs(a.x - it.x) - Math.abs(b.x - it.x));
    for (const m of cands) if (m.onFood(it)) { it.claim = m; break; }
    if (Game.area && Game.area.def.onFood) Game.area.def.onFood(Game.area, it);
    if (!it.claim && it.state !== 'float') lure(it);
  }
  // a berry on the ground is a lure: somebody nearby comes over for a snack (the kind of berry decides who and how)
  function lure(it) {
    const b = it.berry || 'oran', R = b === 'razz' ? 520 : 280;
    if (b === 'razz') { Game.lureT = Math.max(Game.lureT || 0, 20); HUD.toast('The Razz Berry smells amazing... rare Pokémon may come!', { life: 2.4 }); }
    const cands = Mons.all.filter((m) => m.alive && m !== Game.mudkip && !m.layer && m.mode === 'land' && m.walkTo && !m.busy(2) && !m.sleeping && Math.abs(m.x - it.x) < R).sort((a, c) => Math.abs(a.x - it.x) - Math.abs(c.x - it.x));
    const m = cands[0]; if (!m) return;
    it.claim = m;
    m.doTask((function* () {
      m.emote(b === 'pecha' ? 'heart' : 'bulb', 1);
      yield* m.walkTo(it.x + (m.x < it.x ? -10 : 10), (m.speed || 45) * (b === 'pecha' ? 1.6 : 1.2));
      if (it.eaten) return;
      let e = 0;
      while (e < 1.2) { const dt = yield; e += dt; m.o.mouth = Math.sin(e * 16) > 0 ? 1 : 0.2; m.o.eyes = 'happy'; m.setAct(m.act.id, 0.8); }
      eat(it); Game.sfx('munch', it.x, 0.8); m.emote('heart', 1.4);
      // nanab: sits still, facing the camera (easy photo); sitrus: a happy hop dance
      if (b === 'nanab') { e = 0; while (e < 4) { const dt = yield; e += dt; m.turn(Math.PI / 2, dt, 4); m.setAct(m.act.id, 0.9); m.o.eyes = e % 2 < 0.15 ? 'blink' : 'happy'; } }
      else if (b === 'sitrus') { for (let i = 0; i < 3; i++) yield* m.hop(200); }
    })(), 3);
  }
  function eat(it) { it.eaten = true; FX.poof(it.x, it.y, 0xffffffff, COL.p, 2, 2); }
  function stamp(fb, m, cols, x, y) {
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) { const ch = m[r][c]; if (ch !== '.') fb.set(x + c, y + r, cols[ch]); }
  }
  function draw(fb, cx, cy, t) {
    for (const it of list) {
      const x = Math.round(it.x) - cx - 2, y = Math.round(it.y) - cy - 3;
      if (x < -8 || y < -8 || x > fb.w || y > fb.h) continue;
      if (it.kind === 'fruit') stamp(fb, FRUIT, FCOL, x, y);
      else { COL.b = U.hex(BCOL[it.berry] || BCOL.oran); stamp(fb, BERRY[0], COL, x, y); }
    }
  }
  function drawBack() {}
  function nearest(x, maxD, f = () => true) {
    let best = null, bd = maxD;
    for (const it of list) { if (!f(it)) continue; const d = Math.abs(it.x - x); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  return { list, add, throwBerry, drop, update, draw, drawBack, nearest, eat };
})();
