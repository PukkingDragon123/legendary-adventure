/* ------------------------------------------------------------------
   Territory — grumpy Pokémon guard a patch of their area. Walk into a
   guard's zone and it storms over, bonks Mudkip back out and dares
   you to a card battle (Cards). Until you win, it swats the camera:
   photos with it as the subject are ruined. Beat it and it calms
   down for good (Save.data.cards.tamed), poses for photos, and the win
   pays out points, XP (when a Progress/Levels system exists) and a
   Pokédex secret.
   The zone is shown by little red pennant stakes (buoys at sea), a
   faint dotted line on the ground, angry emotes and a hint toast.
------------------------------------------------------------------- */
const Territory = (() => {
  const { clamp, rnd, pick, hex } = U;
  const INK = 0xff1b2240;
  // which species guard turf, per area (one guard per species per area: the first found)
  const GUARDS = {
    crawdaunt: { R: 110, line: 'This is MY beach, shrimp!' },
    sharpedo: { R: 130, line: '*CHOMP* These waters are mine!' },
    walrein: { R: 90, line: '*HUFF* Off my rock!' },
    vigoroth: { R: 120, line: 'VIGO! My turf! MY TURF!' },
    breloom: { R: 100, line: 'Hup! Nobody passes my clearing!' },
    torkoal: { R: 90, line: '*PUFF* Hot spring\'s taken!', area: 'volcano' },
  };
  const T = { list: [], hinted: {}, knock: null, cool: 0, pend: null, t: 0 };
  const mk = () => Game.mudkip;
  const nameOf = (m) => (DexData.S[m.dex] || {}).name || 'It';
  const keyOf = (m) => (Game.areaId || '?') + ':' + m.dex;
  const tamed = (m) => !!(typeof Cards !== 'undefined' && Cards.store().tamed[keyOf(m)]);
  const say = (m, text, life = 1.8) => { if (typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), text, { life, who: m }); };
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* */ } };
  const busyUI = () => (typeof Talk !== 'undefined' && Talk.busy()) || (typeof Arcade !== 'undefined' && Arcade.live) || Game.mode !== 'explore';

  function scan() {
    const seen = {};
    T.list = [];
    for (const m of Mons.all) {
      if (!m.alive || m === mk()) continue;
      const g = GUARDS[m.dex]; if (!g || (g.area && g.area !== Game.areaId) || seen[m.dex]) continue;
      if ((DexData.S[m.dex] || {}).legendary) continue;
      seen[m.dex] = 1;
      if (!m.terr) m.terr = { x: m.home ?? m.x, R: g.R, line: g.line, angryT: 0, sea: m.mode === 'swim' };
      T.list.push(m);
    }
  }
  const guardOf = (m) => !!(m && m.terr && T.list.includes(m));
  const inZone = (m, M) => Math.abs(M.x - m.terr.x) < m.terr.R && Math.abs(M.y - m.y) < 150;

  function update(dt) {
    T.t += dt; T.cool = Math.max(0, T.cool - dt);
    if (((T.t * 2) | 0) !== (((T.t - dt) * 2) | 0) || !T.list.length) scan();
    const M = mk(); if (!M) return;
    // knockback after a bonk
    if (T.knock) {
      const K = T.knock; K.t += dt; const k = K.t / 0.45;
      M.x += K.dir * 260 * dt * Math.max(0, 1 - k);
      M.rot = K.dir * -0.5 * Math.sin(Math.min(1, k) * Math.PI);
      if (k >= 1) { M.rot = 0; T.knock = null; if (K.then) K.then(); }
    }
    if (T.pend && !(typeof Cards !== 'undefined' && Cards.live)) { const p = T.pend; T.pend = null; p(); }
    if (typeof Cards !== 'undefined' && Cards.live) return;
    for (const m of T.list) {
      if (!m.alive) continue;
      const Z = m.terr, calm = tamed(m);
      Z.near = Math.abs(M.x - Z.x) < Z.R + 110;
      if (calm) continue;
      Z.angryT -= dt;
      if (Z.near && Z.angryT <= 0) { Z.angryT = rnd(2.6, 4); m.emote && m.emote('anger', 1.2); }
      if (Z.near && !T.hinted[keyOf(m)] && !busyUI()) {
        T.hinted[keyOf(m)] = 1;
        HUD.toast(nameOf(m) + ' is territorial! It ruins photos until you beat it in a card battle.', { life: 3.6, col: hex('#ff8a6a') });
      }
      if (!busyUI() && !T.knock && T.cool <= 0 && inZone(m, M) && M.mode !== 'fall') confront(m);
    }
  }
  // the guard storms over and bonks Mudkip back out, then dares you to a battle
  function confront(m) {
    const M = mk(), Z = m.terr, dir = M.x >= Z.x ? 1 : -1;
    T.cool = 6;
    say(m, Z.line, 2);
    m.emote && m.emote('anger', 1.4);
    sfx('grr', m.x, 0.9);
    const bonk = () => {
      sfx('bonk', M.x, 1); Game.shake && Game.shake(3);
      FX.emote && M.emote && M.emote('shock', 0.9);
      T.knock = { t: 0, dir, then: () => dare(m) };
    };
    if (m.mode === 'land' && m.walkTo) {
      m.doTask((function* () {
        m.setAct('battle', 0.5);
        yield* m.walkTo(M.x - dir * 18, (m.speed || 50) * 2.6, { turn: 14, stop: () => Math.abs(m.x - M.x) < 26 });
        bonk();
        let e = 0; while (e < 1.2) { const d = yield; e += d; m.setAct('battle', 0.6); }
        yield* m.walkTo(Z.x + rnd(-20, 20), (m.speed || 50), { turn: 8 });
      })(), 6);
    } else { sfx('splash', m.x, 0.8); setTimeout(bonk, 250); }
  }
  function dare(m) {
    if (!m.alive || busyUI() || typeof Talk === 'undefined') return;
    Talk.open([
      { text: nameOf(m) + ' blocks the way! It will not let you near, and it swats at your camera.' },
      { text: 'Challenge it to a card battle?', choices: ['Card battle!', 'Back off'] },
    ], { who: m, name: nameOf(m), done: (i) => { if (i === 0) battle(m); else T.cool = 5; } });
  }
  function battle(m) {
    if (typeof Cards === 'undefined') return false;
    return Cards.start(m, { arena: true, onEnd: (win, G) => ended(m, win, G) });
  }
  function xp(n, why, key) {
    try {
      if (typeof Progress !== 'undefined') { if (key && Progress.award) return Progress.award(key, n, why); if (Progress.gain) return Progress.gain(n, why); }
      if (typeof Levels !== 'undefined' && Levels.addXP) return Levels.addXP(n, why);
    } catch (e) { console.error(e); }
  }
  function ended(m, win, G) {
    if (!win) {
      if (G.fled) { T.cool = 5; return; }
      T.pend = () => { const M = mk(); if (!M) return; T.cool = 5; T.knock = { t: 0, dir: M.x >= m.terr.x ? 1 : -1 }; };
      G.msg = nameOf(m) + ' chased you off. Try again!';
      return;
    }
    const S = Cards.store(), k = keyOf(m);
    const first = !S.tamed[k];
    S.tamed[k] = Date.now(); Save.save();
    const tier = (G.fd && G.fd.tier) || 1;
    G.msg = nameOf(m) + ' calmed down. Photos OK!';
    if (first) {
      Save.addPoints(200 * tier);
      xp(40 * tier, 'Tamed ' + nameOf(m), 'tame.' + k);
      if (Save.discover('tame.' + m.dex)) HUD.toast('Pokédex note: ' + nameOf(m) + ' respects a strong Mudkip. +' + 200 * tier, { life: 3.4, col: hex('#ffe070') });
      try { if (Talk.event) Talk.event('tame', m.dex); } catch (e) { /* */ }
    }
    T.pend = () => {
      if (!m.alive) return;
      say(m, pick(['...fine. You can take my picture.', 'Respect, little mud fish.', 'OK OK! Snap away!']), 2.6);
      m.emote && m.emote('heart', 1.6);
      m.doTask((function* () { let e = 0; while (e < 3) { const d = yield; e += d; m.setAct('pose', 1); m.o.eyes = 'happy'; } })(), 5);
    };
  }
  // Photo hook: a picture whose subject is an angry guard is ruined
  function photo(res) {
    const m = res && res.mon;
    if (!guardOf(m) || tamed(m)) return res;
    m.emote && m.emote('anger', 1.2);
    say(m, pick(['NO PHOTOS!', '*swats the lens*', 'Get that camera outta here!']), 1.6);
    HUD.toast(nameOf(m) + ' swatted the camera! Beat it in a card battle to photograph it.', { life: 3, col: hex('#ff8a6a') });
    return { species: null, score: 0, stars: 0, medal: 0, ruined: m.dex, area: Game.areaId };
  }
  // zone markers in the world (drawn behind the Pokémon)
  function drawWorld(fb, cx, cy, t) {
    for (const m of T.list) {
      const Z = m.terr; if (!Z || !m.alive || tamed(m)) continue;
      if (Z.x + Z.R < cx - 20 || Z.x - Z.R > cx + fb.w + 20) continue;
      const a = Z.near ? 0.55 + Math.sin(t * 5) * 0.2 : 0.3;
      const red = hex('#ff4a3a');
      if (Z.sea && World.SEA < 1e8) {
        for (const s of [-1, 1]) { const X = Math.round(Z.x + s * Z.R - cx), Y = Math.round(World.SEA - cy + Math.sin(t * 2 + s) * 1.5); UI.disc(fb, X, Y - 2, 3, INK); UI.disc(fb, X, Y - 2, 2, ((t * 2) | 0) % 2 ? red : 0xffffffff); UI.rect(fb, X, Y - 9, 1, 5, INK); }
        continue;
      }
      for (let x = Math.round(Z.x - Z.R); x <= Z.x + Z.R; x += 6) {
        if (x < cx - 2 || x > cx + fb.w + 2) continue;
        const y = Math.round(World.groundAt(x) - cy + 1), X = Math.round(x - cx);
        if (y < 0 || y >= fb.h) continue;
        const i = y * fb.w + X; if (X >= 0 && X < fb.w) fb.d[i] = U.mix(fb.d[i], red, a);
        if (X + 1 >= 0 && X + 1 < fb.w) fb.d[i + 1] = U.mix(fb.d[i + 1], red, a * 0.7);
      }
      for (const s of [-1, 1]) {
        const x = Z.x + s * Z.R, X = Math.round(x - cx), G0 = Math.round(World.groundAt(x) - cy);
        UI.rect(fb, X, G0 - 14, 1, 14, hex('#6a4a2a'));
        const w = Math.round(Math.sin(t * 6 + s) * 1);
        for (let k = 0; k < 5; k++) UI.rect(fb, X + 1, G0 - 14 + k, Math.max(1, 5 - k + w), 1, k === 0 ? hex('#ff8a7a') : red);
      }
    }
  }
  U.on && U.on('area', () => { T.list = []; T.knock = null; T.pend = null; T.cool = 2; });
  return Object.assign(T, { GUARDS, update, photo, drawWorld, battle, tamed, guardOf, scan });
})();
