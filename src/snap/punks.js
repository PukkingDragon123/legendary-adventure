/* ------------------------------------------------------------------
   Punks — little road fights between the quest spots. Cocky local
   Pokémon in sunglasses stand on the path and dare Mudkip to a quick
   card battle (fought in place: no walk-in, no big arena).
     · block: stands on the path and bonks Mudkip back until beaten
     · photo: guards a photo spot and ruins nearby shots until beaten
     · test:  an optional "strength test" (a sparring partner / dummy)
   Every punk has a level (a visible tag); HP and damage scale with the
   gap to Mudkip's level (Cards.scaleFoe). First wins pay XP, points and
   sometimes a card upgrade; after you leave and come back they are back
   for rematches at a lower reward.
------------------------------------------------------------------- */
const Punks = (() => {
  const { rnd, pick, hex, clamp } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  // species look (Eco configs are made on the fly: kind 'punk-<dex>' so quests never mistake them for residents)
  const SPC = {
    corphish: ['Corphish', 0.42], zigzagoon: ['Zigzagoon', 0.5], wingull: ['Wingull', 0.5], seedot: ['Seedot', 0.46], nuzleaf: ['Nuzleaf', 0.4],
    shroomish: ['Shroomish', 0.46], taillow: ['Taillow', 0.46], swablu: ['Swablu', 0.48], snorunt: ['Snorunt', 0.38], trapinch: ['Trapinch', 0.44],
    anorith: ['Anorith', 0.42], nincada: ['Nincada', 0.4], numel: ['Numel', 0.4], slugma: ['Slugma', 0.34], wobbuffet: ['Wobbuffet', 0.46],
    spheal: ['Spheal', 0.34], wynaut: ['Wynaut', 0.36], spinda: ['Spinda', 0.4],
  };
  // the road: id, area, species, x, level, kind, name, lines
  const LIST = [
    // Coral Cove (Lv 3)
    // the very first fight: a show-off Spheal that zooms up and down the beach; catch it to battle (tutorial)
    { id: 'b.rolo', area: 'beach', dex: 'spheal', x: 790, lv: 1, kind: 'roam', R: 260, tut: true, name: 'Rolo', taunt: 'Yo yo YO! Nobody rolls faster than Rolo! Catch me if you can, slowpoke!', ko: 'Whoa... you caught me AND beat me? ...Respect, little dude.', win: 'Too slow! Rolo rolls on!', moves: [['Rollout', 3], ['Show Off', 0, 3], ['Belly Bump', 2, 2]] },
    { id: 'b.gus', area: 'beach', dex: 'wingull', x: 4120, lv: 2, kind: 'test', name: 'Gus the Gull', taunt: 'Oi, tiny! Test your strength? Loser buys the fish!', ko: 'Squawk! My sunglasses! ...OK, you are kinda strong.', win: 'Ha! Go splash in a puddle!', moves: [['Peck', 4], ['Wing Flap', 2, 2], ['Preen', 0, 5]] },
    { id: 'b.snips', area: 'beach', dex: 'corphish', x: 4330, lv: 2, kind: 'block', name: 'Snips', upg: 'tackle', taunt: 'Oi! Toll road, tiny. Pay up in a card battle or swim home!', ko: 'Snip... snip... I was just keeping the road warm for you!', win: 'Toll: one (1) Mudkip dignity.', moves: [['Vice Grip', 4], ['Harden', 0, 5], ['Bubble', 2, 2]] },
    { id: 'b.zag', area: 'beach', dex: 'zigzagoon', x: 5480, lv: 3, kind: 'photo', R: 420, name: 'Zag', taunt: 'This beach is OUR photo spot. No battle, no pictures!', ko: 'Fine, FINE! Snap the big blue guy, see if I care!', win: 'No pics for you! Zig-zag-zoom!', moves: [['Headbutt', 5], ['Sand Attack', 0, 0, { weak: 1 }], ['Zig Zag', 2, 3]] },
    { id: 'b.pinch', area: 'beach', dex: 'corphish', x: 7300, lv: 3, kind: 'block', name: 'Big Pinch', taunt: 'You want the boss? Gotta get through me, shrimp! Test your strength!', ko: 'The boss is gonna be SO mad at me...', win: 'Crawdaunt says hi. From far away.', moves: [['Crabby Jab', 5], ['Harden', 0, 6], ['Double Pinch', 3, 2]] },
    // Weather Woods (Lv 5)
    { id: 'f.nutty', area: 'forest', dex: 'seedot', x: 1240, lv: 4, kind: 'block', name: 'Nutty', taunt: 'Halt! This path belongs to the Acorn Gang! Test your strength?', ko: 'I have been... de-acorned...', win: 'Acorn Gang rules! Acorn Gang drools! ...wait.', moves: [['Bullet Seed', 2, 3], ['Harden', 0, 6], ['Headbutt', 6]] },
    { id: 'f.zoom', area: 'forest', dex: 'zigzagoon', x: 2060, lv: 5, kind: 'photo', R: 330, name: 'Zoomer', taunt: 'Kecleon is MY photo op. You want it? Beat me first, slowpoke!', ko: 'I zigged when I should have zagged!', win: 'Too slow! Zooooom!', moves: [['Tackle Rush', 6], ['Tail Whip', 0, 0, { vuln: 1 }], ['Zig Zag', 2, 3]] },
    { id: 'f.sensei', area: 'forest', dex: 'shroomish', x: 2620, lv: 5, kind: 'test', name: 'Sensei Shroom', upg: 'block', taunt: 'Hup! A sparring dojo! One round to test your strength, little student?', ko: 'Hup! The student surpasses the mushroom!', win: 'More training! Hup hup!', moves: [['Headbutt', 6], ['Stun Spore', 0, 0, { weak: 1 }], ['Mega Drain', 3, 0, null, 3]] },
    { id: 'f.leafy', area: 'forest', dex: 'nuzleaf', x: 3360, lv: 6, kind: 'block', name: 'Leafy', taunt: '*whistles* The east woods are Acorn Gang turf. You look... snackable.', ko: 'The Gang will hear about this! ...please do not tell them.', win: 'Stick to the pond, pond-boy!', moves: [['Razor Leaf', 3, 2], ['Fake Out', 5], ['Growth', 0, 6]] },
    // Treetop Town (Lv 7)
    { id: 'c.tail', area: 'canopy', dex: 'taillow', x: 720, lv: 6, kind: 'block', name: 'Tailz', taunt: 'Nobody crosses the treetops without paying the Taillow tax! Fight me!', ko: 'Swellow is gonna ground me for a week...', win: 'Tax paid! In full! Ha!', moves: [['Peck', 6], ['Quick Attack', 3, 2], ['Growl', 0, 0, { weak: 1 }]] },
    { id: 'c.fluff', area: 'canopy', dex: 'swablu', x: 1560, lv: 7, kind: 'photo', R: 330, name: 'Fluff', taunt: 'This is a CLOUDS ONLY photo zone. Unless you beat me. Which you won\'t.', ko: 'My fluff... it has been... ruffled!', win: 'Fluff wins! Fluff always wins!', moves: [['Peck', 6], ['Cotton Guard', 0, 8], ['Sing', 0, 0, { dizzy: 1 }]] },
    { id: 'c.frost', area: 'canopy', dex: 'snorunt', x: 2720, lv: 7, kind: 'test', name: 'Frosty', upg: 'tackle', taunt: 'Snowball fight? No, CARD fight! Test your strength, warm-blood!', ko: 'Brr... you are pretty cool. For a mud fish.', win: 'Ice cold! Like my shades!', moves: [['Powder Snow', 3, 2], ['Ice Shard', 6], ['Leer', 0, 0, { vuln: 1 }]] },
    // Starfall Cave (Lv 9)
    { id: 'a.pit', area: 'falls', dex: 'trapinch', x: 920, lv: 8, kind: 'block', name: 'Jaws', taunt: 'CHOMP! Nobody passes the pit! Unless they beat me. NOBODY!', ko: 'Chomp... chomp... chomp... (it chomps sadly)', win: 'CHOMP! Told you!', moves: [['Bite', 8], ['Sand Tomb', 3, 2], ['Dig In', 0, 9]] },
    { id: 'a.fossil', area: 'falls', dex: 'anorith', x: 2110, lv: 9, kind: 'photo', R: 380, name: 'Old Claws', taunt: 'Those Minior are MY stars, kid. Ancient rules: battle first, photos later.', ko: 'Hmph. In my day, Mudkip were smaller.', win: 'Back to the Stone Age with you!', moves: [['Metal Claw', 8], ['Harden', 0, 9], ['Fury Cutter', 3, 3]] },
    { id: 'a.buzz', area: 'falls', dex: 'nincada', x: 3120, lv: 9, kind: 'test', name: 'Buzz', upg: 'block', taunt: 'Bzzt! Training grounds! Test your strength or buzz off!', ko: 'Bzz... I need to shed my skin and start over...', win: 'Bzzt bzzt! Too slow!', moves: [['Scratch', 7], ['Harden', 0, 8], ['Fury Swipes', 2, 4]] },
    // Fiery Path (Lv 11)
    { id: 'v.dummy', area: 'volcano', dex: 'wobbuffet', x: 1180, lv: 10, kind: 'test', name: 'Training Dummy', upg: 'tackle', taunt: 'WOBBUFFET! (A sign on it says: "HIT ME. TEST YOUR STRENGTH.")', ko: 'Wooo... bbuffet. (The sign now says: "OK YOU PASS.")', win: 'WOBBUFFET! (It counters. It always counters.)', moves: [['Counter', 9], ['Mirror Coat', 0, 12], ['Safeguard', 0, 6], ['Destiny Bond', 5, 2]] },
    { id: 'v.hump', area: 'volcano', dex: 'numel', x: 1560, lv: 10, kind: 'block', name: 'Humpty', taunt: 'Nuuum. This path is hot, and so am I. Fight for it, water boy!', ko: 'Nuuum... I am just gonna lie down on some ash.', win: 'Too hot for you? Nuuum!', moves: [['Ember', 4, 2], ['Magnitude', 10], ['Defense Curl', 0, 9]] },
    { id: 'v.goo', area: 'volcano', dex: 'slugma', x: 2760, lv: 11, kind: 'photo', R: 320, name: 'Goo', taunt: 'This hot spring view is reserved for HOT Pokémon. You are damp. Battle me!', ko: 'I... am... melting... (more than usual)', win: 'Blorp! Stay soggy!', moves: [['Lava Plume', 10], ['Amnesia', 0, 10], ['Smog', 3, 0, { weak: 1 }]] },
    // Shoal Cave (Lv 13)
    { id: 'o.roll', area: 'shoal', dex: 'spheal', x: 1120, lv: 12, kind: 'block', name: 'Rolly', taunt: 'Roll roll ROLL! This ice is my bowling lane! You are the pin! Battle!', ko: 'I rolled... the wrong way...', win: 'STRIKE! Ha ha!', moves: [['Rollout', 4, 3], ['Ice Ball', 10], ['Defense Curl', 0, 10]] },
    { id: 'o.chill', area: 'shoal', dex: 'snorunt', x: 1900, lv: 13, kind: 'photo', R: 300, name: 'Chill', taunt: 'The Snorunt village is PRIVATE. No tourists. Unless you win.', ko: 'Fine. Take a photo. Make it a good one.', win: 'No tourists! Brrr!', moves: [['Ice Fang', 11], ['Leer', 0, 0, { vuln: 1 }], ['Icy Wind', 4, 2]] },
    { id: 'o.champ', area: 'shoal', dex: 'wynaut', x: 3080, lv: 13, kind: 'test', name: 'Wynaut Champ', upg: 'block', taunt: 'Wynaut? WHY NOT! The last strength test in Hoenn! You in?', ko: 'Wy... naut? Because you are TOO STRONG!', win: 'Why not try again? Wynaut!', moves: [['Splash Slam', 11], ['Counter', 0, 12], ['Encore', 0, 0, { dizzy: 1 }], ['Charm', 0, 0, { weak: 1 }]] },
  ];
  const BY = Object.fromEntries(LIST.map((p) => [p.id, p]));
  const S = { mons: [], knock: null, cool: 0, lv: 0, fresh: {}, t: 0 };
  const mk = () => Game.mudkip;
  const areaName = (a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a);
  const kipLv = () => (typeof Progress !== 'undefined' && Progress.level ? Progress.level() : 1);
  const say = (m, text, life = 2) => { try { Talk.bubble(() => m.headPt(), text, { life, who: m }); } catch (e) { /* */ } };
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* */ } };
  const busyUI = () => (typeof Talk !== 'undefined' && Talk.busy()) || (typeof Arcade !== 'undefined' && Arcade.live) || Game.mode !== 'explore';
  // Save.data.punks = { id: { w: wins } }
  function rec() { const d = Save.data; if (!d.punks) d.punks = {}; return d.punks; }
  const beaten = (id) => !!(rec()[id] && rec()[id].w);
  // a punk that is still a problem (blocking / guarding): never beaten
  const hostile = (p) => !beaten(p.id) && !(typeof Bosses !== 'undefined' && Bosses.ALL);
  function tally(area) { const l = LIST.filter((p) => p.area === area); return l.length ? { n: l.length, won: l.filter((p) => beaten(p.id)).length } : null; }

  /* ---------- the battle foe ---------- */
  // base numbers are for an even fight (same level as Mudkip); Cards.scaleFoe adjusts for the gap
  function foe(p, re) {
    const lv = p.lv + (re ? 1 : 0), k = 1 + (lv - 1) * 0.07;
    const moves = p.moves.map(([n, a, h, fx, b]) => {
      const m = { n };
      if (a > 0) { m.a = Math.round(a * k); if (h > 1) m.h = h; } else if (h > 0) m.b = Math.round(h * k);
      if (fx) { if (fx.weak) m.w = fx.weak; if (fx.vuln) m.v = fx.vuln; if (fx.dizzy) m.d = fx.dizzy; }
      if (b) m.b = Math.round(b * k);
      return m;
    });
    return { hp: Math.round(16 + lv * 2.4), tier: 1, title: 'Road Punk', eyes: {}, moves, lines: { intro: [p.taunt.split('!')[0] + '!'], ko: [p.ko], win: [p.win], low: ['Wait, wait! Time out!', 'This is NOT how it goes in my head!'], hurt: ['Ow! My shades!', 'Lucky shot!'], smug: ['Heh. Cute.', 'Is that all, tiny?'] } };
  }

  /* ---------- spawning ---------- */
  function cfgFor(dex) {
    const id = 'punk_' + dex, E = typeof Eco !== 'undefined' ? Eco : null; if (!E || !SPC[dex]) return null;
    if (!E.SP[id]) E.def(id, { sp: SPC[dex][0], dex, kind: 'punk-' + dex, scale: SPC[dex][1], speed: 40, persona: 'grumpy', active: 'any', pose: (m, st) => ({ walk: st.mv ? st.ph : 0 }) });
    return id;
  }
  function spawn() {
    S.mons = []; S.knock = null; S.cool = 1.5;
    const G = Game, area = G.areaId;
    for (const p of LIST) {
      if (p.area !== area) continue;
      const id = cfgFor(p.dex); if (!id) continue;
      let m = null; try { m = Eco.add(G, id, p.x, { range: 20, minX: p.x - 20, maxX: p.x + 20 }); } catch (e) { console.error(e); }
      if (!m) continue;
      m.punk = p; m.acc3 = { glasses: 'rock' }; m.x = p.x; m.y = World.groundAt(p.x); m.mode = 'land'; m.home = p.x;
      m.brain = () => (p.kind === 'roam' ? roamer(m) : brain(m));
      m.task = null;
      S.mons.push(m);
      S.fresh[p.id] = 0; // a new visit: beaten punks are back for rematches
    }
  }
  function* brain(m) {
    const p = m.punk; let e = 0, tauntT = 0;
    for (;;) {
      const dt = (yield) || 0.016; e += dt; tauntT -= dt;
      const M = mk(); if (!M) continue;
      // back to the post
      if (Math.abs(m.x - p.x) > 6) { m.x += Math.sign(p.x - m.x) * Math.min(Math.abs(p.x - m.x), 60 * dt); m.moving = 40; }
      m.y = World.groundAt(m.x);
      const d = Math.abs(M.x - m.x);
      if (d < 260) m.turn(m.face(M.x > m.x ? 1 : -1, false), dt, 6);
      const sulk = S.fresh[p.id] === 1; // just lost this visit
      m.setAct(sulk ? 'idle' : 'idle', 0.2);
      // swagger: a little bounce to the beat, head up
      if (!sulk) { m.o.headPitch = -0.12 + Math.sin(e * 5) * 0.05; m.rot = Math.sin(e * 2.5) * 0.04; }
      else { m.o.headPitch = 0.25; m.o.eyes = 'closed'; m.rot = 0; }
      if (!sulk && d < 170 && tauntT <= 0 && !busyUI()) {
        tauntT = rnd(7, 11);
        say(m, beaten(p.id) ? pick(['Rematch? I have been training!', 'You again? Let\'s go, champ!', 'Round two, tiny?']) : p.taunt.split('!')[0] + '!', 2.2);
        m.emote && m.emote(beaten(p.id) ? 'note' : 'anger', 1);
      }
    }
  }

  // a roaming show-off: zooms up and down its stretch of beach, bouncing and taunting; runs from Mudkip
  // until it gets cornered or tired, then a bump starts the dare
  function* roamer(m) {
    const p = m.punk, R = p.R || 300; let e = 0, tauntT = 1, dir = 1, hop = 0, tired = 0, pause = 0;
    m.roam = { v: 0, caught: false };
    for (;;) {
      const dt = (yield) || 0.016; e += dt; tauntT -= dt; pause -= dt;
      const M = mk(); if (!M) continue;
      const sulk = S.fresh[p.id] === 1, d = M.x - m.x, ad = Math.abs(d);
      if (sulk || busyUI()) {
        m.roam.v = 0; m.moving = 0; m.y = World.groundAt(m.x); m.rot = 0; m.hopY = 0;
        if (sulk) { m.o.headPitch = 0.25; m.o.eyes = 'closed'; } else m.turn(m.face(d > 0 ? 1 : -1, false), dt, 6);
        continue;
      }
      // pick where to zoom: back and forth across its stretch, away from Mudkip when it gets close
      const lo = p.x - R, hi = p.x + R;
      if (m.x > hi) dir = -1; else if (m.x < lo) dir = 1;
      let spd = 150;
      if (ad < 150 && tired < 3.5) { dir = d > 0 ? -1 : 1; spd = 175; tired += dt * (M.moving ? 1 : 0.4); }
      else tired = Math.max(0, tired - dt * 0.5);
      const cornered = (dir < 0 && m.x < lo + 8) || (dir > 0 && m.x > hi - 8);
      if (tired >= 3.5 || cornered && ad < 150) { spd = 0; if (tired >= 3.5 && tauntT <= 0) { tauntT = 3; say(m, pick(['*pant pant* OK OK, time out!', 'Huff... you are faster than you look!']), 1.6); m.emote && m.emote('sweat', 1); } }
      if (pause > 0) spd = 0;
      else if (spd && Math.random() < dt * 0.25 && ad > 220) { pause = rnd(0.8, 1.4); if (tauntT <= 0) { tauntT = rnd(4, 7); say(m, pick(['Yo! Over here, slowpoke!', 'Roll roll ROLL!', 'Can\'t catch Rolo!', 'Too cool for school!']), 1.6); m.emote && m.emote('note', 1); } }
      m.roam.v += ((spd ? dir * spd : 0) - m.roam.v) * Math.min(1, dt * 4);
      m.x = clamp(m.x + m.roam.v * dt, lo - 20, hi + 20);
      const fast = Math.abs(m.roam.v) > 30;
      m.moving = fast ? Math.abs(m.roam.v) : 0;
      // bouncy roll: hops while zooming, a spin-tilt, a cocky taunt dance when stopped
      hop += dt * (fast ? 11 : 6);
      const h = fast ? Math.abs(Math.sin(hop)) * 7 : Math.abs(Math.sin(hop)) * 3;
      m.y = World.groundAt(m.x); const was = m.hopY || 0; m.hopY = h; if (fast && was > 1.5 && h < 1.5) m.jq = -0.25; // squash on each landing
      if (fast) { m.turn(m.face(m.roam.v > 0 ? 1 : -1, false), dt, 10); m.rot = Math.sin(hop * 0.5) * 0.35 * Math.sign(m.roam.v); m.o.headPitch = -0.15; }
      else { m.turn(m.face(d > 0 ? 1 : -1, false), dt, 8); m.rot = Math.sin(e * 6) * 0.12; m.o.headPitch = -0.15 + Math.sin(e * 6) * 0.08; }
      m.setAct('idle', 0.2);
      if (fast && Math.random() < dt * 6) try { const gx = m.x - Math.sign(m.roam.v) * 8; FX.add({ type: 'dust', x: gx, y: World.groundAt(gx) - 2, vx: -Math.sign(m.roam.v) * rnd(10, 30), vy: -rnd(5, 20), r: rnd(2, 3), life: 0.5, c: 0xffe8dcc0, c2: 0xffc0b090, layer: 3 }); } catch (er) { /* */ }
      if (ad < 240 && tauntT <= 0) { tauntT = rnd(5, 8); say(m, beaten(p.id) ? pick(['Rematch? Catch me first!', 'Rolo is back, baby!']) : pick(['Catch me if you can!', 'Nyah nyah! Too slow!', 'You wanna battle? Gotta catch me first!']), 1.8); m.emote && m.emote(beaten(p.id) ? 'note' : 'anger', 1); }
    }
  }

  /* ---------- per frame: blocking the road ---------- */
  function update(dt) {
    S.t += dt; S.cool = Math.max(0, S.cool - dt);
    const M = mk(); if (!M) return;
    // level-up perks
    const lv = kipLv();
    if (S.lv && lv > S.lv && typeof Cards !== 'undefined' && Cards.PERK_LV) {
      const pk = Cards.PERK_LV.find((q) => q[0] === lv);
      setTimeout(() => HUD.toast('Lv ' + lv + ' battle perk: +3 max HP' + (pk ? ', ' + pk[1] : '') + '!', { life: 3.2, col: hex('#8aff8a') }), 4200);
    }
    S.lv = lv;
    if (S.knock) {
      const K = S.knock; K.t += dt; const k = K.t / 0.45;
      M.x += K.dir * 240 * dt * Math.max(0, 1 - k);
      M.rot = K.dir * -0.5 * Math.sin(Math.min(1, k) * Math.PI);
      if (k >= 1) { M.rot = 0; S.knock = null; if (K.then) K.then(); }
      return;
    }
    if (busyUI() || S.cool > 0 || M.mode === 'fall') return;
    for (const m of S.mons) {
      const p = m.punk;
      // caught the roamer: a bump, then the dare
      if (m.alive && p.kind === 'roam' && S.fresh[p.id] !== 1 && Math.abs(M.x - m.x) < 30 && Math.abs(M.y - m.y) < 60) {
        S.cool = 6; m.roam && (m.roam.v = 0);
        say(m, beaten(p.id) ? 'Ack! Caught again!' : 'WHOA! You actually caught me?!', 1.8);
        sfx('bonk', M.x, 0.8); M.emote && M.emote('shock', 0.7);
        setTimeout(() => dare(m), 500);
        return;
      }
      if (!m.alive || p.kind !== 'block' || !hostile(p)) continue;
      if (Math.abs(M.x - m.x) < 28 && Math.abs(M.y - m.y) < 60 && M.mode === 'land') {
        const dir = M.x >= m.x ? 1 : -1;
        S.cool = 6;
        say(m, pick(['Oi! Where do you think YOU\'RE going?', 'Nuh-uh! Toll road!', 'Not so fast, tiny!']), 1.8);
        sfx('bonk', M.x, 1); Game.shake && Game.shake(3); M.emote && M.emote('shock', 0.9);
        S.knock = { t: 0, dir, then: () => dare(m) };
        return;
      }
    }
  }

  /* ---------- the dare ---------- */
  function dare(m) {
    if (!m.alive || busyUI() || typeof Talk === 'undefined') return;
    const p = m.punk, re = beaten(p.id), lv = p.lv + (re ? 1 : 0), kl = kipLv();
    const lines = [{ text: re ? pick(['You again?! I have been doing push-ups. Rematch!', 'Rematch! This time I am wearing my LUCKY shades.']) : p.taunt }];
    if (!re) lines.push({ text: '(' + p.name + ' · Lv ' + lv + ' road punk. ' + (p.kind === 'roam' ? 'A show-off who zooms around the beach. Your first road fight!' : p.kind === 'block' ? 'It blocks the path until you win.' : p.kind === 'photo' ? 'It ruins photos around here until you win.' : 'An optional strength test.') + ')' });
    else lines.push({ text: '(Rematch: smaller rewards this time.)' });
    if (p.tut && !re) lines.push({ text: '(Card battle tip: tap a card to play it. Each card costs energy (the orbs). Attacks hit, Block cards shield you. Out of energy or cards? Press END TURN and the foe takes its turn. Bring its HP to 0 to win!)' });
    if (lv - kl >= 2) lines.push({ text: '(Careful: it is Lv ' + lv + ' and you are Lv ' + kl + '. It will hit hard!)' });
    lines.push({ text: 'Test your strength?', choices: ['Bring it!', 'Not now'] });
    Talk.open(lines, { who: m, name: p.name, title: 'Road Fight · Lv ' + lv, done: (i) => { if (i === 0) battle(m); else S.cool = 4; } });
  }
  function battle(m) {
    if (typeof Cards === 'undefined') return false;
    const p = m.punk, re = beaten(p.id);
    return Cards.start(m, { arena: false, walk: false, punk: true, lv: p.lv + (re ? 1 : 0), fd: foe(p, re), prize: (G) => prize(m, re), onEnd: (win, G) => ended(m, win, G) });
  }
  function xp(n, why, key) { try { if (typeof Progress === 'undefined') return; if (key) Progress.award(key, n, why); else Progress.gain(n, why); } catch (e) { console.error(e); } }
  function upgrade(id) {
    const s = Cards.store(), i = s.deck.indexOf(id); if (i < 0) return null;
    s.deck[i] = id + '+'; Save.save(); return Cards.def(id + '+').name;
  }
  function prize(m, re) {
    const p = m.punk, R = rec(), e = R[p.id] || (R[p.id] = { w: 0 });
    e.w++; Save.save();
    const out = { kind: 'punk', who: p.name, line: p.ko, rematch: re };
    if (!re) { out.xp = 40 + p.lv * 15; out.pts = 60 * p.lv; xp(out.xp, 'Road fight: ' + p.name, 'punk.' + p.id); if (p.upg) out.upg = upgrade(p.upg); }
    else { out.xp = 6 + p.lv * 3; out.pts = 15 * p.lv; xp(out.xp, 'Rematch: ' + p.name); }
    Save.addPoints(out.pts);
    return out;
  }
  function ended(m, win, G) {
    const p = m.punk;
    if (!win) {
      S.cool = 5;
      if (!G.fled && p.kind === 'block') { const M = mk(); if (M) S.knock = { t: 0, dir: M.x >= m.x ? 1 : -1 }; }
      G.msg = p.name + ' laughs you off. Level up and try again!';
      return;
    }
    S.fresh[p.id] = 1; S.cool = 3;
    G.msg = p.kind === 'roam' ? p.name + ' is out of breath. Nice first win!' : p.kind === 'block' ? p.name + ' steps aside. The road is open!' : p.kind === 'photo' ? p.name + ' sulks off. Photos OK here now!' : p.name + ' respects your strength!';
    setTimeout(() => { if (m.alive) { say(m, p.ko, 3); m.emote && m.emote('sweat', 1.4); } }, 900);
  }
  // tapping a punk
  function talk(m) {
    if (!m || !m.punk) return false;
    if (S.fresh[m.punk.id] === 1) { Talk.open([{ text: m.punk.ko }, { text: '(' + m.punk.name + ' is sulking. Come back later for a rematch.)' }], { who: m, name: m.punk.name }); return true; }
    dare(m); return true;
  }
  if (typeof Talk !== 'undefined' && Talk.hooks) Talk.hooks.unshift(talk);

  /* ---------- photos near a guarding punk are ruined ---------- */
  function photo(res) {
    if (!res || !res.species) return null;
    const M = mk(), tgt = res.mon || M; if (!tgt) return null;
    const m = S.mons.find((q) => q.alive && q.punk.kind === 'photo' && hostile(q.punk) && Math.abs(q.x - tgt.x) < (q.punk.R || 300));
    if (!m) return null;
    say(m, pick(['OI! No free photos!', '*photobombs you*', 'Battle first, pictures later!']), 1.8);
    m.emote && m.emote('anger', 1.2);
    HUD.toast(m.punk.name + ' photobombed your shot! Beat it in a road fight to take photos here.', { life: 3, col: hex('#ff8a6a') });
    return { species: null, score: 0, stars: 0, medal: 0, ruined: m.dex, area: Game.areaId };
  }
  if (typeof Territory !== 'undefined') {
    const p0 = Territory.photo; Territory.photo = (res) => photo(res) || p0(res);
    const d0 = Territory.drawWorld; Territory.drawWorld = (fb, cx, cy, t) => { d0(fb, cx, cy, t); try { drawWorld(fb, cx, cy, t); } catch (e) { console.error(e); } };
  }
  if (typeof Arcade !== 'undefined') { const u0 = Arcade.update; Arcade.update = (dt) => { u0(dt); try { update(dt); } catch (e) { console.error(e); } }; }

  /* ---------- in the world: shades, the level tag, a barrier on the road ---------- */
  function drawWorld(fb, cx, cy, t) {
    if (typeof Cards !== 'undefined' && Cards.live && Cards.g && S.mons.includes(Cards.g.foe) && Cards.g.them.ko) { /* KO'd: no tag */ }
    const kl = kipLv();
    for (const m of S.mons) {
      if (!m.alive) continue;
      const p = m.punk, X = Math.round(m.x - cx); if (X < -60 || X > fb.w + 60) continue;
      const sulk = S.fresh[p.id] === 1, lv = p.lv + (beaten(p.id) ? 1 : 0);
      if (Cards.live) continue;
      // a barrier on the road (block punks), or a "no photos" sign (photo punks)
      if (hostile(p) && p.kind === 'block') {
        for (const s of [-1, 1]) { const bx = Math.round(m.x + s * 22 - cx), gy = Math.round(World.groundAt(m.x + s * 22) - cy); UI.rect(fb, bx, gy - 10, 1, 10, INK); }
        const gy = Math.round(World.groundAt(m.x) - cy);
        for (let x = -22; x <= 22; x++) UI.put(fb, Math.round(m.x - cx + x), gy - 9 + (x % 2 ? 0 : 0), ((x + 22) >> 2) % 2 ? hex('#ffd23a') : INK);
      } else if (hostile(p) && p.kind === 'photo') {
        const sx = Math.round(m.x - cx - 22), gy = Math.round(World.groundAt(m.x - 22) - cy);
        UI.rect(fb, sx, gy - 14, 1, 14, hex('#6a4a2a'));
        UI.rrect(fb, sx - 6, gy - 22, 13, 9, 2, INK); UI.rrect(fb, sx - 5, gy - 21, 11, 7, 2, hex('#e83a3a'));
        Font.icon && Font.icon(fb, 'cam', sx - 3, gy - 20, 1);
      }
    }
  }
  // level tags over their heads (UI layer, above Rotom and the bubbles' pointer)
  function drawTags(fb) {
    if (Game.mode !== 'explore' || (typeof Cards !== 'undefined' && Cards.live)) return;
    const kl = kipLv();
    for (const m of S.mons) {
      if (!m.alive) continue;
      const p = m.punk, sulk = S.fresh[p.id] === 1, lv = p.lv + (beaten(p.id) ? 1 : 0);
      const top = m.headPt(), [X0, Y0] = Talk.toUI(m.x, Math.min(top[1], m.y - 18) - 10);
      const X = Math.round(X0), ty = Math.round(Y0) - 10; if (X < -40 || X > fb.w + 40 || ty < 0 || ty > fb.h) continue;
      const lab = 'Lv' + lv + ' ' + (p.kind === 'test' ? 'TEST' : p.kind === 'roam' && !beaten(p.id) ? 'CATCH ME' : 'PUNK'), w = Font.measure(lab, 'small') + 6;
      const col = sulk ? 0xff6a7088 : lv - kl >= 2 ? hex('#d02a2a') : lv > kl ? hex('#e8a020') : hex('#2a8a4a');
      UI.rrect(fb, X - w / 2 - 1, ty - 1, w + 2, 11, 3, INK);
      UI.rrect(fb, X - w / 2, ty, w, 9, 2, col);
      Font.draw(fb, lab, X, ty + 1, WHITE, { font: 'small', align: 'center' });
    }
  }
  if (typeof Talk !== 'undefined') { const b0 = Talk.drawBubbles; Talk.drawBubbles = function (fb, t) { try { drawTags(fb); } catch (e) { console.error(e); } return b0.call(this, fb, t); }; }
  U.on && U.on('area', () => { try { spawn(); } catch (e) { console.error(e); } });
  return { LIST, BY, S, tally, beaten, battle, dare, foe, spawn, get mons() { return S.mons; } };
})();
