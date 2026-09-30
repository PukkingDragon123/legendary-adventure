/* ------------------------------------------------------------------
   Territory — grumpy Pokémon guard a patch of their area. Each area's
   BOSS (bosses.js) is one of them; the others are rivals.
    · asleep: until its quest is done (bosses.js "needs") a boss is just
      a grumpy resident: no bonks, no zone, photos are fine. Tap it and
      it tells you what it is waiting for.
    · awake: walk into its zone and it storms over, bonks Mudkip back
      out and dares you to a card battle (Cards, with the walk-in
      cinematic). Until you win, it swats the camera: photos with it as
      the subject are ruined. Tap it to challenge it right away.
    · beaten: it calms down for good (Save.data.cards.tamed), poses for
      photos, and the first win teaches its signature TM (the "TM
      learned!" celebration in cards.js). Tap it for a rematch: points
      and XP only.
   The zone is shown by little red pennant stakes (buoys at sea), a
   faint dotted line on the ground, angry emotes and a hint toast.
------------------------------------------------------------------- */
const Territory = (() => {
  const { rnd, pick, hex } = U;
  // which species guard turf, per area (one guard per species per area: the first found)
  const GUARDS = {
    crawdaunt: { R: 110, line: 'This is MY beach, shrimp!' },
    sharpedo: { R: 130, line: '*CHOMP* These waters are mine!' },
    walrein: { R: 90, line: '*HUFF* Off my rock!' },
    vigoroth: { R: 120, line: 'VIGO! My turf! MY TURF!' },
    breloom: { R: 100, line: 'Hup! Nobody passes my clearing!' },
    torkoal: { R: 90, line: '*PUFF* Hot spring\'s taken!', area: 'volcano' },
    swellow: { R: 140, line: 'SWELLOW! My sky! Get lost!', area: 'canopy' },
    bagon: { R: 90, line: 'Bagon! Bagon! Headbutt time!', area: 'falls' },
    sealeo: { R: 80, line: 'Sea-leo! This is MY stage!', area: 'shoal' },
  };
  const T = { list: [], hinted: {}, knock: null, cool: 0, pend: null, t: 0, was: {}, call: null };
  const mk = () => Game.mudkip;
  const nameOf = (m) => (DexData.S[m.dex] || {}).name || 'It';
  const keyOf = (m) => (Game.areaId || '?') + ':' + m.dex;
  const tamed = (m) => !!(typeof Cards !== 'undefined' && Cards.store().tamed[keyOf(m)]);
  const bossInfo = (m) => (typeof Bosses !== 'undefined' ? Bosses.info(Game.areaId, m.dex) : null);
  const awake = (m) => typeof Bosses === 'undefined' || Bosses.awake(Game.areaId, m.dex);
  // 'tamed' | 'awake' (challenges you) | 'asleep' (a calm resident until its quest is done)
  const stateOf = (m) => (tamed(m) ? 'tamed' : awake(m) ? 'awake' : 'asleep');
  const say = (m, text, life = 1.8) => { if (typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), text, { life, who: m }); };
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* */ } };
  const busyUI = () => (typeof Talk !== 'undefined' && Talk.busy()) || (typeof Arcade !== 'undefined' && Arcade.live) || Game.mode !== 'explore';
  const areaName = (a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a);
  const tmName = (id) => { const d = typeof Moves !== 'undefined' && Moves.DEF[id]; return d ? (d.tm ? d.tm + ' ' : '') + d.name : 'a TM'; };

  function scan() {
    const seen = {};
    T.list = [];
    for (const m of Mons.all) {
      if (!m.alive || m === mk()) continue;
      const g = GUARDS[m.dex]; if (!g || (g.area && g.area !== Game.areaId) || seen[m.dex]) continue;
      if ((DexData.S[m.dex] || {}).legendary || String(m.kind).startsWith('bg-') || m.layer) continue;
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
    // a boss that just woke up (its quest is done) comes over to challenge you
    if (T.call && !busyUI() && !T.knock) { T.call.t -= dt; if (T.call.t <= 0) { const m = T.call.m; T.call = null; if (m.alive && stateOf(m) === 'awake') challenge(m); } }
    for (const m of T.list) {
      if (!m.alive) continue;
      const Z = m.terr, st = stateOf(m), k = keyOf(m);
      Z.near = Math.abs(M.x - Z.x) < Z.R + 110;
      Z.state = st;
      const was = T.was[k]; T.was[k] = st;
      if (was === 'asleep' && st === 'awake') wake(m);
      if (st !== 'awake') continue;
      Z.angryT -= dt;
      if (Z.near && Z.angryT <= 0) { Z.angryT = rnd(2.6, 4); m.emote && m.emote('anger', 1.2); }
      if (Z.near && !T.hinted[k] && !busyUI()) {
        T.hinted[k] = 1;
        const I = bossInfo(m);
        HUD.toast(I && I.boss ? nameOf(m) + ' is the BOSS of ' + areaName(Game.areaId) + '! Beat it in a card battle to move on.' : nameOf(m) + ' is territorial! It ruins photos until you beat it in a card battle.', { life: 3.6, col: hex('#ff8a6a') });
      }
      if (!busyUI() && !T.knock && !T.call && T.cool <= 0 && inZone(m, M) && M.mode !== 'fall') confront(m);
    }
  }
  // its quest is done: announce it, and if it is close, it comes over right away
  function wake(m) {
    const I = bossInfo(m), M = mk();
    HUD.toast((I && I.boss ? 'BOSS CHALLENGE: ' : '') + nameOf(m) + ' wants a card battle!' + (I && I.where ? ' Find it ' + I.where + '.' : ''), { life: 4, col: hex('#ffb04a') });
    sfx('grr', m.x, 0.8); m.emote && m.emote('anger', 1.6);
    if (M && Math.abs(M.x - m.x) < 320) T.call = { m, t: 1.4 };
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
      M.emote && M.emote('shock', 0.9);
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
  // a freshly woken boss walks up (no bonk) with its challenge line
  function challenge(m) {
    const M = mk(), I = bossInfo(m);
    T.cool = 4;
    say(m, (I && I.ready) || m.terr.line, 2.4);
    m.emote && m.emote('anger', 1.4); sfx('grr', m.x, 0.9);
    if (m.mode === 'land' && m.walkTo && !m.busy(6)) {
      const dir = M.x >= m.x ? 1 : -1;
      m.doTask((function* () { yield* m.walkTo(M.x - dir * 40, (m.speed || 50) * 1.8, { turn: 12, stop: () => Math.abs(m.x - M.x) < 44 }); let e = 0; while (e < 0.4) { const d = yield; e += d; m.setAct('battle', 0.6); } dare(m); })(), 6);
    } else setTimeout(() => dare(m), 700);
  }
  function dare(m) {
    if (!m.alive || busyUI() || typeof Talk === 'undefined') return;
    const I = bossInfo(m), tm = I && I.tm;
    const known = tm && typeof Moves !== 'undefined' && Moves.has(tm);
    const lines = [];
    if (I && I.boss) {
      lines.push({ text: I.ready || m.terr.line });
      lines.push({ text: '(' + nameOf(m) + ' is the boss of ' + areaName(Game.areaId) + '. Win to ' + (I.opens ? 'open the way to ' + areaName(I.opens) : 'become the champion of Hoenn') + ' and learn its signature move, ' + tmName(tm) + '!)' });
    } else {
      lines.push({ text: nameOf(m) + ' blocks the way! It will not let you near, and it swats at your camera.' });
      if (tm) lines.push({ text: '(Win and it will teach you ' + (known ? 'the secret of ' : '') + tmName(tm) + '!)' });
    }
    lines.push({ text: 'Challenge it to a card battle?', choices: ['Card battle!', 'Back off'] });
    Talk.open(lines, { who: m, name: nameOf(m), title: I && I.boss ? 'BOSS BATTLE' : 'Territory', done: (i) => { if (i === 0) battle(m); else T.cool = 5; } });
  }
  function battle(m, o = {}) {
    if (typeof Cards === 'undefined') return false;
    return Cards.start(m, { arena: true, rematch: tamed(m), prize: (G) => prize(m, G), onEnd: (win, G) => ended(m, win, G), boss: bossInfo(m) });
  }
  function xp(n, why, key) {
    try {
      if (typeof Progress !== 'undefined') { if (key && Progress.award) return Progress.award(key, n, why); if (Progress.gain) return Progress.gain(n, why); }
      if (typeof Levels !== 'undefined' && Levels.addXP) return Levels.addXP(n, why);
    } catch (e) { console.error(e); }
  }
  // the win: first time → its signature TM (or mastering it), a rematch → points and XP
  function prize(m, G) {
    const S = Cards.store(), k = keyOf(m), tier = (G.fd && G.fd.tier) || 1, I = bossInfo(m);
    const first = !S.tamed[k];
    const out = { who: nameOf(m), boss: !!(I && I.boss), area: Game.areaId };
    if (!first) {
      out.kind = 'rematch'; out.pts = 60 * tier; out.xp = 10 * tier;
      Save.addPoints(out.pts); xp(out.xp, 'Rematch: ' + nameOf(m));
      return out;
    }
    S.tamed[k] = Date.now(); Save.save();
    out.pts = 200 * tier; out.xp = 40 * tier;
    Save.addPoints(out.pts); xp(out.xp, 'Beat ' + nameOf(m), 'tame.' + k);
    const tm = I && I.tm;
    if (tm && typeof Moves !== 'undefined' && Moves.DEF[tm]) {
      out.tm = tm; out.card = Cards.cardOf(tm);
      if (!Moves.has(tm)) {
        out.kind = 'tm';
        // learn it quietly: the celebration screen does the fanfare
        const t0 = HUD.toast; HUD.toast = () => {}; try { Moves.unlock(tm, nameOf(m) + ' taught you its signature move!'); } finally { HUD.toast = t0; }
        Moves.learnFx = null;
      } else {
        const e = S.tm[out.card] || (S.tm[out.card] = {});
        if (!e.up) { e.up = 1; out.kind = 'master'; } else if (!e.n) { e.n = 1; out.kind = 'copy'; } else out.kind = 'win';
        Save.save();
      }
    } else out.kind = 'win';
    if (I && I.boss && typeof Bosses !== 'undefined') out.next = Bosses.nextText(Game.areaId);
    return out;
  }
  function ended(m, win, G) {
    if (!win) {
      if (G.fled) { T.cool = 5; return; }
      T.pend = () => { const M = mk(); if (!M) return; T.cool = 5; T.knock = { t: 0, dir: M.x >= m.terr.x ? 1 : -1 }; };
      G.msg = nameOf(m) + ' chased you off. Try again!';
      return;
    }
    const P = G.prize || {};
    G.msg = nameOf(m) + ' calmed down. Photos OK!';
    if (P.kind !== 'rematch') {
      if (Save.discover('tame.' + m.dex)) setTimeout(() => HUD.toast('Pokédex note: ' + nameOf(m) + ' respects a strong Mudkip.', { life: 3, col: hex('#ffe070') }), 1800);
      try { if (Talk.event) Talk.event('tame', m.dex); } catch (e) { /* */ }
    }
    T.pend = () => {
      const M = mk();
      if (M && FX.confetti) FX.confetti(M.x, M.y - 24, 40);
      for (const c of G.crowd || []) if (c.alive && c.emote) c.emote(pick(['heart', 'note', 'star']), 1.4);
      if (P.next) setTimeout(() => HUD.toast(P.next, { life: 4.5, col: hex('#ffd23a') }), 900);
      if (!m.alive) return;
      say(m, pick(['...fine. You can take my picture.', 'Respect, little mud fish.', 'OK OK! Snap away!']), 2.6);
      m.emote && m.emote('heart', 1.6);
      m.doTask((function* () { let e = 0; while (e < 3) { const d = yield; e += d; m.setAct('pose', 1); m.o.eyes = 'happy'; } })(), 5);
    };
  }
  // tapping a guard: what it is waiting for, a direct challenge, or a rematch
  function talk(m) {
    if (!guardOf(m) || typeof Talk === 'undefined') return false;
    const st = stateOf(m), I = bossInfo(m);
    const hasJob = () => Talk.QUESTS.some((q) => q.area === Game.areaId && q.giver === m.kind && Talk.giverOf(q) === m && (typeof Progress === 'undefined' || ['avail', 'active', 'ready', 'lvl'].includes(Progress.status(q))));
    if (st === 'asleep') {
      if (hasJob()) return false; // its own quest comes first (Bagon wants its photo)
      const w = (I && I.wait) || ['...hmph.'];
      Talk.open(w.map((text) => ({ text })), { who: m, name: nameOf(m), title: I && I.boss ? 'Boss of ' + areaName(Game.areaId) : '' });
      return true;
    }
    if (st === 'awake') { dare(m); return true; }
    if (hasJob()) return false;
    Talk.open([{ text: nameOf(m) + ' wants a rematch! (No TM this time: just points and XP.)' }, { text: 'Rematch?', choices: ['Rematch!', 'Not now'] }], { who: m, name: nameOf(m), title: 'Rematch', done: (i) => { if (i === 0) battle(m); } });
    return true;
  }
  if (typeof Talk !== 'undefined' && Talk.hooks) Talk.hooks.push(talk);
  // Photo hook: a picture whose subject is an angry guard is ruined
  function photo(res) {
    const m = res && res.mon;
    if (!guardOf(m) || stateOf(m) !== 'awake') return res;
    m.emote && m.emote('anger', 1.2);
    say(m, pick(['NO PHOTOS!', '*swats the lens*', 'Get that camera outta here!']), 1.6);
    HUD.toast(nameOf(m) + ' swatted the camera! Beat it in a card battle to photograph it.', { life: 3, col: hex('#ff8a6a') });
    return { species: null, score: 0, stars: 0, medal: 0, ruined: m.dex, area: Game.areaId };
  }
  // zone markers in the world (drawn behind the Pokémon)
  function drawWorld(fb, cx, cy, t) {
    for (const m of T.list) {
      const Z = m.terr; if (!Z || !m.alive || Z.state !== 'awake') continue;
      if (Z.x + Z.R < cx - 20 || Z.x - Z.R > cx + fb.w + 20) continue;
      const a = Z.near ? 0.55 + Math.sin(t * 5) * 0.2 : 0.3;
      const red = hex('#ff4a3a');
      if (Z.sea && World.SEA < 1e8) {
        for (const s of [-1, 1]) { const X = Math.round(Z.x + s * Z.R - cx), Y = Math.round(World.SEA - cy + Math.sin(t * 2 + s) * 1.5); UI.disc(fb, X, Y - 2, 3, 0xff1b2240); UI.disc(fb, X, Y - 2, 2, ((t * 2) | 0) % 2 ? red : 0xffffffff); UI.rect(fb, X, Y - 9, 1, 5, 0xff1b2240); }
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
  U.on && U.on('area', () => { T.list = []; T.knock = null; T.pend = null; T.call = null; T.cool = 2; T.was = {}; });
  return Object.assign(T, { GUARDS, update, photo, drawWorld, battle, tamed, guardOf, scan, stateOf, dare, talk, prize });
})();
