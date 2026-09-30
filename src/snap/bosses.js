/* ------------------------------------------------------------------
   Bosses — the spine of the adventure. Every area has a BOSS (one of
   its territorial Pokémon, see territory.js) that blocks the way on:
     · a local quest makes the boss notice you ("needs"); until then it
       is just a grumpy resident (no bonks, photos are fine)
     · then it challenges you to a card battle (a walk-in cinematic, the
       arena, then the TM celebration in cards.js)
     · the first win teaches its SIGNATURE TM (a brand-new move for the
       world and a new card for the deck); rematches pay points / XP
     · the carrier quest that flies you to the next area ("via": the
       quests with `unlock:`) only goes through once the boss is beaten:
       the dialogue, the quest log, the tracked arrow and the world map
       all say "Defeat X to continue"
   Other territorial Pokémon (RIVALS) wake up once their area's boss
   has fallen and teach a TM you may know already (then the card is
   mastered: upgraded, or an extra copy).
   ?unlock=all: every boss can be challenged and no carrier is gated.
------------------------------------------------------------------- */
const Bosses = (() => {
  const { hex, rnd, lerp, pick } = U;
  const ALL = new URLSearchParams(location.search).get('unlock') === 'all';
  // area → its boss. needs: the quest that makes it challenge you; via: the carrier quest it gates; opens: the next area
  const AREA = {
    beach: { dex: 'crawdaunt', tm: 'crabhammer', needs: 'q.corphish', via: 'q.mail2', opens: 'forest', carrier: 'Pelipper', where: 'at the far east end of Coral Cove',
      wait: ['*SNAP* A shrimp like you? Beat my little brother Corphish at belly flops first.', '(Crawdaunt ignores you. Help Corphish on the beach first: "Belly Flop Champ".)'],
      ready: 'You out-flopped Corphish?! Nobody embarrasses my family! BOSS BATTLE!',
      gate: ['Pelipper! (It glances nervously toward the east end of the cove.)', 'Crawdaunt snaps at anything that flies over its beach. I can\'t take off while it rules the cove!', 'Beat Crawdaunt in a card battle, then I\'ll fly you to Weather Woods!'] },
    forest: { dex: 'vigoroth', tm: 'fury', needs: 'q.parcel', via: 'q.tropius', opens: 'canopy', carrier: 'Tropius', where: 'on the west side of Weather Woods',
      wait: ['VIGO! VIGO! Hungry! Too hungry to fight!', '(Vigoroth zooms off. Azumarill by the pond has a care package for it: "Care Package".)'],
      ready: 'VIGO VIGO! Full belly! FULL POWER! FIGHT! FIGHT! FIGHT!',
      gate: ['Tro-pi... (Tropius flinches as Vigoroth zooms past for the hundredth time.)', '(It will not take off while that restless Vigoroth is on the loose.)', '(Beat Vigoroth in a card battle, then Tropius can carry you up to Treetop Town!)'] },
    canopy: { dex: 'swellow', tm: 'aerial', needs: 'q.snorunt', via: 'q.altaria', opens: 'falls', carrier: 'Altaria', where: 'in the skies over Treetop Town',
      wait: ['Swel-looow. (Swellow does not even look at you. It is far too cool for a Mudkip.)', '(Maybe the Snorunt in town know how to get its attention: "Snowball Stash".)'],
      ready: 'SWELLOW!! Who threw that snowball?! ...YOU?! These skies are MINE!',
      gate: ['Alta...? (Altaria hides in its fluffy wings.)', '(A bossy Swellow owns the skies over Treetop Town. Altaria is too scared to fly!)', '(Beat Swellow in a card battle, then Altaria can fly you to Starfall Cave!)'] },
    falls: { dex: 'bagon', tm: 'dragonrage', needs: 'q.bagon', via: 'q.flygon', opens: 'volcano', carrier: 'Flygon', where: 'by the big boulder in Starfall Cave',
      wait: ['Bagon! Take my picture first! Headbutting! Then we FIGHT!'],
      ready: 'I look SO cool in that photo. Now watch me be cool in a BATTLE!',
      gate: ['Flyyy-gon! (Flygon taps its head. It only carries true champions.)', '(Prove yourself: beat Bagon, the hard-headed boss of Starfall Cave.)', '(Then Flygon will fly you to Fiery Path!)'] },
    volcano: { dex: 'torkoal', tm: 'smoke', needs: 'q.slugma', via: 'q.latias', opens: 'shoal', carrier: 'Latias', where: 'by the hot spring on Fiery Path',
      wait: ['*puff...* (Torkoal is sulking. Someone took all its warm nap spots.)', '(Slugma knows where the warm vents are: "Warm Spots".)'],
      ready: '*PUFF PUFF* You found the warm vents?! Those are MY nap spots! BATTLE!',
      gate: ['(Latias peeks out from behind her wings.)', '...Torkoal is so grumpy. I am scared to fly through its smoke.', 'Could you beat Torkoal in a card battle first? Then we fly to Shoal Cave!'] },
    shoal: { dex: 'sealeo', tm: 'hail', needs: 'q.regice', via: null, opens: null, final: true, where: 'on the snowy shore of Shoal Cave',
      wait: ['Sea-leo! I am the STAR of Shoal Cave!', '(Sealeo only battles legends. Snorunt knows about something ancient in the ice: "Seven Dots".)'],
      ready: 'You found the ice giant?! Then the show must go on: the GRAND FINALE!' },
  };
  // territorial Pokémon that are not the boss: they get restless once the boss has fallen
  const RIVAL = {
    walrein: { area: 'beach', tm: 'ice', ready: '*HUFF* So YOU beat Crawdaunt. My rock. My rules. BATTLE!' },
    sharpedo: { area: 'beach', tm: 'whirl', ready: '*CHOMP* The new champion? Let\'s see how you taste!' },
    breloom: { area: 'forest', tm: 'quick', ready: 'Hup! Hup! You beat Vigoroth? Then step into MY ring!' },
  };
  const ORDER = ['beach', 'forest', 'canopy', 'falls', 'volcano', 'shoal'];
  const nm = (sp) => (DexData.S[sp] ? DexData.S[sp].name : sp);
  const areaName = (a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a);
  const tamedKey = (area, dex) => area + ':' + dex;
  const cardsOk = () => typeof Cards !== 'undefined';
  const beaten = (area) => { const B = AREA[area]; return !!(B && cardsOk() && Cards.store().tamed[tamedKey(area, B.dex)]); };
  const qd = (id) => Talk.QUESTS.find((q) => q.id === id);
  // a quest's objective is complete (handed in, or ready to hand in)
  function questDone(id) {
    const q = qd(id), s = Talk.qState(id); if (!q || !s) return false;
    if (s.s === 'done') return true;
    return s.s === 'active' && ownReady(q);
  }
  function ownReady(q) { const g = q.gate; q.gate = null; try { return Talk.ready(q); } finally { q.gate = g; } }
  // the boss / rival entry for a territorial Pokémon in an area
  function info(area, dex) {
    const B = AREA[area]; if (B && B.dex === dex) return Object.assign({ boss: true, area }, B);
    const R = RIVAL[dex]; if (R && R.area === area) return Object.assign({ rival: true, dex }, R, { after: area });
    return null;
  }
  // can this territorial Pokémon challenge you yet? (false = a calm resident for now)
  function awake(area, dex) {
    if (ALL) return true;
    const I = info(area, dex); if (!I) return true;
    if (I.boss) return !I.needs || questDone(I.needs);
    if (I.rival) return beaten(I.after);
    return true;
  }
  const tmOf = (area, dex) => { const I = info(area, dex); return I ? I.tm : null; };
  // what to do next once a boss is beaten
  function nextText(area) {
    const B = AREA[area]; if (!B) return '';
    if (B.final) return 'You beat every boss in Hoenn. Champion photographer!';
    if (!B.opens) return '';
    const q = B.via && qd(B.via), s = q && Talk.qState(q.id);
    if (Save.unlocked(B.opens) && !(s && s.s === 'active')) return areaName(B.opens) + ' is open: fly there with the map (M)!';
    return (B.carrier || 'A friend') + ' can now fly you to ' + areaName(B.opens) + '!';
  }

  /* ---------- the carrier quests wait for the boss ---------- */
  function gateFor(q, area) {
    const B = AREA[area];
    return () => {
      if (ALL || beaten(area)) return null;
      const boss = nm(B.dex), pre = B.needs && qd(B.needs), preDone = !B.needs || questDone(B.needs);
      const lines = B.gate.slice();
      if (!preDone && pre) lines.push('(' + boss + ' will not battle you yet. First help ' + nm(pre.giver) + ': "' + pre.title + '".)');
      if (!ownReady(q)) { const w = (q.wait || [])[0]; if (w) lines.push(w); }
      return {
        lines, boss: B.dex, area,
        obj: 'Defeat ' + boss + ' (' + areaName(area) + ') to continue' + (!preDone && pre ? ' · first: "' + pre.title + '"' : ''),
        // the tracked arrow points at the boss when it is here
        target: () => { if (Game.areaId !== area) return null; const m = Mons.all.find((x) => x.alive && x.dex === B.dex && x.terr); return m ? { x: m.x, y: m.y - 30, who: m, label: 'Boss: ' + boss } : null; },
      };
    };
  }
  function install() {
    // the boss's own jobs come after the quest that wakes it (Crawdaunt's photo job: "so you beat Corphish...")
    for (const area of ORDER) {
      const B = AREA[area]; if (!B.needs) continue;
      for (const q of Talk.QUESTS) if (q.area === area && q.giver === B.dex && q.id !== B.needs && !q.after) q.after = B.needs;
    }
    for (const area of ORDER) {
      const B = AREA[area]; if (!B.via) continue;
      const q = qd(B.via); if (!q || q.gate) continue;
      q.gate = gateFor(q, area);
      q.boss = area;
      // the intro mentions the boss too (inserted before the question line)
      const base = q.intro.slice();
      const extra = '(But ' + nm(B.dex) + ' rules ' + areaName(area) + '. Beat it in a card battle too!)';
      Object.defineProperty(q, 'intro', { configurable: true, get: () => (ALL || beaten(area) ? base : base.slice(0, -1).concat([extra, base[base.length - 1]])) });
    }
  }

  /* ---------- the world map: why a place is still locked ---------- */
  function lockNote(id) {
    if (ALL) return null;
    const area = ORDER.find((a) => AREA[a].opens === id); if (!area) return null;
    const B = AREA[area], pre = B.needs && qd(B.needs);
    if (!beaten(area)) return 'Defeat ' + nm(B.dex) + ' in ' + areaName(area) + ' to continue' + (pre && !questDone(B.needs) ? ' (first: "' + pre.title + '")' : '') + '.';
    const q = B.via && qd(B.via);
    return nm(B.dex) + ' is beaten! ' + (B.carrier || 'A friend') + ' can fly you here' + (q ? ' ("' + q.title + '")' : '') + '.';
  }
  if (typeof WorldMap !== 'undefined') {
    const w0 = WorldMap.draw;
    WorldMap.draw = function (fb, t) {
      const r = w0.apply(this, arguments);
      try { bossChip(fb, t); } catch (e) { console.error(e); }
      return r;
    };
  }
  // a little "BOSS" tab on the selected place's info card
  function bossChip(fb, t) {
    const M = WorldMap, id = M.sel; if (!id || M.travel || !AREA[id] || !Save.unlocked(id)) return;
    const k = M.closing ? 1 - M.closing / 0.4 : Math.min(1, M.anim * 1.6);
    const W = fb.w, H = fb.h, cw = Math.min(214, W - 16), ch = 80, cx = 8, cy = H - ch - 8 + Math.round((1 - k) * 90);
    const B = AREA[id], done = beaten(id) || ALL, pre = B.needs && qd(B.needs);
    let lab = done ? '{check} BOSS BEATEN: ' + nm(B.dex).toUpperCase() : 'BOSS: ' + nm(B.dex).toUpperCase() + (awake(id, B.dex) ? '  · ready to battle!' : pre ? '  · first: ' + pre.title : '');
    while (lab.length > 8 && Font.measure(lab, 'small') > cw - 12) lab = lab.slice(0, -1);
    const w = Math.min(cw, Font.measure(lab, 'small') + 10), x = cx + cw - w, y = cy - 11;
    UI.rrect(fb, x, y, w, 12, 3, 0xff1b2240);
    UI.rrect(fb, x + 1, y + 1, w - 2, 10, 2, done ? hex('#2a8a4a') : hex('#b82a2a'));
    Font.draw(fb, lab, x + 5, y + 3, 0xffffffff, { font: 'small', maxW: w - 8 });
  }

  /* ---------- the signature TMs (moves in the world; the cards live in cards.js) ---------- */
  const near = (mk, R) => Mons.all.filter((m) => m !== mk && m.alive && m.visible && !m.layer && Math.hypot(m.x - mk.x, m.y - mk.y) < R);
  const S = { smokeT: 0 };
  function moves() {
    if (typeof Moves === 'undefined' || !Moves.add) return;
    Moves.add({ id: 'crabhammer', name: 'Crabhammer', col: hex('#e8503a'), tm: 'TM11', cool: 4, how: 'Beat Crawdaunt, the boss of Coral Cove, in a card battle.', desc: 'Leap and SLAM! A shockwave bounces everyone nearby.',
      icon: ['kk...kk', 'kwk.kwk', 'kwwkwwk', '.kwwwk.', '..kwk..', '.wwwww.', 'w.w.w.w'],
      *run(mk) {
        let e = 0;
        while (e < 0.16) { const dt = yield; e += dt; mk.o.bodyDip = 2.2; mk.o.squash = 0.14; mk.o.headPitch = 0.3; }
        const land = mk.mode === 'land';
        if (land) { mk.vair = 230; mk.air = Math.max(mk.air, 1); }
        Game.sfx('whoosh', mk.x, 0.7);
        e = 0; while (e < 0.9 && (land ? mk.air > 0 : e < 0.3)) { const dt = yield; e += dt; mk.o.headPitch = -0.35; mk.o.legF = -0.9; mk.o.legB = 0.9; mk.o.eyes = 'blink'; }
        const d = mk.dirX(), x = mk.x + d * 12, y = mk.mode === 'swim' ? mk.y : World.groundAt(x);
        Game.sfx('thud', x, 1); Game.sfx('crack', x, 0.6); Game.shake && Game.shake(4);
        FX.add({ type: 'ring', x, y: y - 1, r0: 4, r1: 80, flat: 0.28, life: 0.5, c: 0xffffffff, thick: 1, c2: hex('#ffb08a'), layer: 3 });
        FX.bonk(x, y - 8, 11);
        FX.poof(x, y - 2, hex('#e8d8b8'), hex('#c8b890'), 10, 6);
        for (const m of near(mk, 130)) { m.emote('shock', 1); m.hear && m.hear('loud', x, 0.6); if (m.mode === 'land' && !m.busy(4)) { m.vair = 230; m.air = Math.max(m.air || 0, 0.5); } }
        e = 0; while (e < 0.25) { const dt = yield; e += dt; mk.o.squash = 0.2 * (1 - e / 0.25); mk.o.eyes = 'happy'; }
      } });
    Moves.add({ id: 'fury', name: 'Fury Swipes', col: hex('#f0e0c0'), tm: 'TM12', cool: 3, how: 'Beat Vigoroth, the boss of Weather Woods, in a card battle.', desc: 'Swipe swipe swipe swipe! Rattles everything in front of you.',
      icon: ['w...w..', '.w...w.', '..w...w', 'w...w..', '.w...w.', '..w...w', '.......'],
      *run(mk) {
        const d = mk.dirX();
        for (let k = 0; k < 4; k++) {
          let e = 0; while (e < 0.09) { const dt = yield; e += dt; mk.o.lean = 0.2; mk.o.headPitch = k % 2 ? 0.3 : -0.1; mk.o.legF = k % 2 ? -0.9 : 0.4; mk.o.mouth = 0.8; mk.o.eyes = 'blink'; }
          const x = mk.x + d * (18 + k * 3), y = mk.y - 10 - (k % 2) * 6;
          for (let j = 0; j < 3; j++) FX.add({ type: 'speed', x: x + j * 3 * d, y: y - 6 + j * 4, dx: -d * 0.7, dy: 0.7, len: 9, life: 0.18, c: 0xffffffff, layer: 3 });
          Game.sfx(k % 2 ? 'snip' : 'scratch', x, 0.6);
          for (const m of near(mk, 60)) if ((m.x - mk.x) * d > 0) { m.emote('swirl', 0.8); if (m.mode === 'land' && !m.busy(4) && k === 3) { m.vair = 150; m.air = Math.max(m.air || 0, 0.5); } }
        }
      } });
    Moves.add({ id: 'aerial', name: 'Aerial Ace', col: hex('#8ab0ff'), tm: 'TM13', cool: 2.5, how: 'Beat Swellow, the boss of Treetop Town, in a card battle.', desc: 'A swooping super-leap! Reach high ledges and branches.',
      icon: ['......w', '....ww.', '..ww...', 'ww.....', '..ww...', '....ww.', '......w'],
      *run(mk) {
        const d = mk.keyDir || mk.dirX();
        mk.turn(mk.face(d), 1, 99);
        Game.sfx('whoosh', mk.x, 1); Game.sfx('chirp', mk.x, 0.4);
        if (mk.mode === 'swim') { mk.vy = -280; mk.vx = d * 160; }
        else if (mk.mode === 'land') { mk.vair = 340; mk.air = Math.max(mk.air, 1); }
        else if (mk.mode === 'fall') { mk.vy = Math.min(mk.vy, -260); }
        if (mk.task) mk.task.keepV = true;
        let e = 0;
        while (e < 0.5) {
          const dt = yield; e += dt;
          if (mk.mode === 'land') mk.x += d * 190 * dt * (1 - e / 0.7); else if (mk.mode === 'fall') mk.vx = d * 170;
          mk.o.lean = 0.25; mk.o.headPitch = -0.2; mk.o.legF = -1; mk.o.legB = 1; mk.o.tailLift = 0.6; mk.o.eyes = 'blink';
          if (Math.random() < dt * 40) FX.add({ type: 'spark', x: mk.x - d * rnd(6, 20), y: mk.y - rnd(4, 20), size: 1, life: 0.3, c: 0xffffffff, c2: hex('#8ab0ff'), layer: 3 });
        }
        FX.add({ type: 'ring', x: mk.x, y: mk.y - 10, r0: 2, r1: 16, life: 0.25, c: 0xffffffff, layer: 4 });
      } });
    Moves.add({ id: 'dragonrage', name: 'Dragon Rage', col: hex('#9a6aff'), tm: 'TM14', cool: 6, how: 'Beat Bagon, the boss of Starfall Cave, in a card battle.', desc: 'A roaring burst of dragon fire! Startles everyone and lights up dark places.',
      icon: ['..w....', '.www...', 'wwkww..', '.wwwww.', '..wwwww', '...www.', '....w..'],
      *run(mk) {
        const d = mk.dirX();
        let e = 0;
        while (e < 0.25) { const dt = yield; e += dt; mk.o.headPitch = 0.25; mk.o.squash = 0.1; mk.o.eyes = 'blink'; }
        Game.sfx('roar', mk.x, 0.5); Game.sfx('whoosh', mk.x, 0.8);
        if (typeof Weather !== 'undefined' && Weather.W) Weather.W.flash = Math.max(Weather.W.flash || 0, 0.25);
        e = 0; const hit = new Set();
        while (e < 0.8) {
          const dt = yield; e += dt;
          mk.o.mouth = 1; mk.o.headPitch = -0.1; mk.o.eyes = 'blink';
          const [hx, hy] = mk.at ? mk.at('mouth') || mk.headPt() : mk.headPt();
          for (let k = 0; k < 4; k++) { const v = rnd(120, 200); FX.add({ type: 'spark', x: hx + d * 6, y: hy + rnd(-2, 2), vx: d * v, vy: rnd(-30, 30), size: 1 + (k % 2), life: rnd(0.25, 0.45), c: k % 2 ? 0xffffffff : hex('#c8a0ff'), c2: hex('#6a3aff'), layer: 3 }); }
          for (const m of near(mk, 120)) if ((m.x - mk.x) * d > 0 && !hit.has(m)) { hit.add(m); m.emote('shock', 1); m.hear && m.hear('loud', mk.x, 0.8); if (m.hidden && !m.arcade) m.hidden = false; }
        }
      } });
    Moves.add({ id: 'smoke', name: 'Smokescreen', col: hex('#8a8a9a'), tm: 'TM15', cool: 12, how: 'Beat Torkoal, the boss of Fiery Path, in a card battle.', desc: 'Vanish in a puff of smoke: Pokémon lose track of you for a while. Sneaky photos!',
      icon: ['.......', '..ww...', '.wwww..', 'wwwwww.', '.wwwwww', '..wwww.', '.......'],
      *run(mk) {
        Game.sfx('steam', mk.x, 0.8); Game.sfx('dust', mk.x, 0.8);
        for (let i = 0; i < 18; i++) FX.add({ type: 'dust', x: mk.x + rnd(-22, 22), y: mk.y - rnd(0, 26), vx: rnd(-20, 20), vy: -rnd(4, 18), r: rnd(4, 8), life: rnd(0.9, 1.6), c: hex('#b8b8c8'), c2: hex('#e8e8f0'), layer: 3 });
        S.smokeT = 10;
        for (const m of near(mk, 300)) { m.aware = 0; m.lastReact = Game.t; if (m.persona === 'shy' || m.emote) m.emote('swirl', 0.8); }
        HUD.toast('Smokescreen! Pokémon lose track of you for a while.', { life: 2.2, col: hex('#b8b8c8') });
        let e = 0; while (e < 0.6) { const dt = yield; e += dt; mk.o.eyes = 'happy'; mk.o.squash = 0.06; }
      } });
    Moves.add({ id: 'hail', name: 'Hail', col: hex('#bfeaff'), tm: 'TM16', cool: 40, how: 'Beat Sealeo, the boss of Shoal Cave, in a card battle.', desc: 'Call down a hailstorm for 30 s. Ice types love it!',
      icon: ['.wwww..', 'wwwwww.', 'wwwwwww', '.......', 'w..w..w', '.......', '.w..w..'],
      *run(mk) {
        let e = 0;
        while (e < 0.9) { const dt = yield; e += dt; mk.o.headPitch = -0.25; mk.o.eyes = 'happy'; mk.o.mouth = 0.6; mk.rot = Math.sin(e * 16) * 0.12; }
        mk.rot = 0;
        if (typeof TMFX !== 'undefined' && TMFX.weather) TMFX.weather({ rain: 0.15, fog: 0.15, snow: 1, storm: 0 }, 30);
        Game.sfx('icering', mk.x, 0.8);
        HUD.toast('Hail! Ice cold pellets rattle down...', { life: 2, col: hex('#bfeaff') });
        for (const m of near(mk, 400)) { const ty = (DexData.S[m.dex] || {}).type || []; if (ty.includes('Ice')) m.emote('heart', 1.2); else if (ty.includes('Fire')) m.emote('sweat', 1.2); }
      } });
  }
  moves();

  /* ---------- per frame ---------- */
  function update(dt) {
    if (S.smokeT > 0) { S.smokeT -= dt; const mk = Game.mudkip; if (mk) for (const m of Mons.all) if (m !== mk && m.alive && Math.abs(m.x - mk.x) < 260) m.aware = Math.min(m.aware, 0.3); }
  }
  if (typeof Moves !== 'undefined') { const u0 = Moves.update; Moves.update = (dt) => { u0(dt); try { update(dt); } catch (e) { console.error(e); } }; }
  install();
  U.on && U.on('area', () => { S.smokeT = 0; });
  return { AREA, RIVAL, ORDER, info, awake, beaten, questDone, tmOf, nextText, lockNote, install, ALL };
})();
