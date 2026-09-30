/* ------------------------------------------------------------------
   Cards — "Mudkip Spire": a goofy Slay-the-Spire style card battle
   against the territorial Pokémon, fought in a cinematic ARENA
   (arena.js: shatter transition, letterbox, spotlights, boss title
   card, a dedicated backdrop per area).
    · 3 energy a turn, draw 5. The starter deck is just Tackle and
      Block (plus one Splash, which does nothing — with style)
    · NEW cards come only from TMs: every TM move Mudkip learns out in
      the world (Moves.has) joins the deck as its card (Bubble, Dig,
      Ice Beam, Rain Dance...), so TMs work in battle and outside
    · win → pick one: upgrade a card (TM cards first), remove a card,
      an extra copy of a TM card, or an Oran Berry (+Max HP)
    · the foe shows its INTENT; statuses: Muddy (deals less), Dazed
      (takes more), Soaked (+1 per hit), Frozen (skips a turn)
    · juice: real card art (cardart.js), smooth hover/lift, cards fly
      from the draw pile and to the discard pile, the played card
      flies in to the centre then at its target; squash & stretch,
      impact frames, zoom-in dialogue lines with exaggerated boss
      faces (anger / smug / shock / dizzy), a flat-on-its-belly X-eyed
      Mudkip when it loses, a spinning boss faint when it wins
   Controls: 1-9 play a card, arrows + Space select/play, E end turn,
   D deck, Esc flee. Mouse: hover lifts a card, click plays it.
   Touch: tap a card to lift it, tap again to play.
   Cards.start(foe, { onEnd(win, G), arena }) — used by Territory.
   It borrows the Arcade cutscene hooks (update/drive/key/down/draw).
------------------------------------------------------------------- */
const Cards = (() => {
  const { clamp, rnd, pick, lerp, hex } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff, GOLD = '#ffd070', GRN = '#8aff8a';
  const C = { live: false, g: null, bars: 0, btns: [], sel: -1, hov: -1, deckView: false, t: 0, lastDraw: 0 };
  const mk = () => Game.mudkip;
  const nameOf = (m) => (m && DexData.S[m.dex] ? DexData.S[m.dex].name : 'Pokémon');
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* no audio */ } };
  const ease = (k) => (U.ease && U.ease.outCubic ? U.ease.outCubic(clamp(k, 0, 1)) : k);

  /* ---------- the cards ---------- */
  // kind: atk | skill | power | silly | item ; r: 0 starter, 1 common, 2 uncommon, 3 rare
  // up: the fields an upgrade changes (the card id gets a '+')
  const CARDS = {
    tackle: { name: 'Tackle', cost: 1, kind: 'atk', r: 0, dmg: 6, anim: 'bonk', art: 'tackle', up: { dmg: 9 } },
    block: { name: 'Block', cost: 1, kind: 'skill', r: 0, blk: 5, anim: 'guard', art: 'block', up: { blk: 8 } },
    splash: { name: 'Splash', cost: 0, kind: 'silly', r: 0, style: 1, anim: 'splash', art: 'splash', flav: 'Does nothing. With style.', up: { draw: 1, flav: 'Nothing happens. Draw 1.' } },
    // TM cards — one per TM move Mudkip has learned
    bubble: { tm: 'bubble', name: 'Bubble', cost: 1, kind: 'atk', r: 1, dmg: 3, hits: 2, fx: { soak: 1 }, anim: 'shot', shot: '#bfe8ff', art: 'bubble', up: { dmg: 4 } },
    growl: { tm: 'growl', name: 'Growl', cost: 0, kind: 'skill', r: 1, fx: { weak: 1 }, draw: 1, anim: 'growl', art: 'growl', up: { fx: { weak: 2 } } },
    dig: { tm: 'dig', name: 'Dig', cost: 2, kind: 'skill', r: 1, blk: 9, buff: { str: 1 }, anim: 'dig', art: 'dig', up: { blk: 12 } },
    smash: { tm: 'smash', short: 'R. Smash', name: 'Rock Smash', cost: 2, kind: 'atk', r: 2, dmg: 9, pierce: 1, fx: { vuln: 1 }, anim: 'bonk', art: 'smash', up: { dmg: 12 } },
    ice: { tm: 'ice', name: 'Ice Beam', cost: 2, kind: 'atk', r: 2, dmg: 7, fx: { stun: 1 }, exhaust: 1, anim: 'shot', shot: '#c8f4ff', art: 'ice', up: { dmg: 10 } },
    flash: { tm: 'flash', name: 'Flash', cost: 1, kind: 'skill', r: 2, fx: { vuln: 2 }, draw: 1, anim: 'flash', art: 'flash', up: { cost: 0 } },
    rain: { tm: 'rain', short: 'Rain', name: 'Rain Dance', cost: 1, kind: 'power', r: 2, power: { rain: 2 }, anim: 'power', art: 'rain', up: { power: { rain: 3 } } },
    sunny: { tm: 'sunny', short: 'Sunny', name: 'Sunny Day', cost: 1, kind: 'power', r: 3, power: { sun: 2 }, anim: 'power', art: 'sunny', up: { power: { sun: 3 } } },
    quick: { tm: 'quick', short: 'Quick', name: 'Quick Attack', cost: 0, kind: 'atk', r: 2, dmg: 4, draw: 1, anim: 'dash', art: 'quick', up: { dmg: 6 } },
    whirl: { tm: 'whirl', short: 'Whirl', name: 'Whirlpool', cost: 2, kind: 'atk', r: 3, dmg: 3, hits: 3, fx: { weak: 1 }, anim: 'whirl', art: 'whirl', up: { hits: 4 } },
    // reward-only
    oran: { name: 'Oran Berry', short: 'Oran', cost: 0, kind: 'item', r: 1, art: 'berry', flav: '+4 Max HP for good. Yum!' },
  };
  const STARTER = ['tackle', 'tackle', 'tackle', 'tackle', 'tackle', 'block', 'block', 'block', 'block', 'splash'];
  const KW = {
    weak: ['MUDDY', 'deals 25% less damage.'], vuln: ['DAZED', 'takes 50% more damage.'], soak: ['SOAKED', 'takes +1 from every hit.'],
    stun: ['FREEZE', 'the foe skips its next turn.'], str: ['POWER', '+1 damage per hit.'], blk: ['BLOCK', 'stops damage until your next turn.'],
    rain: ['RAIN', 'your attacks hit harder.'], sun: ['SUN', 'heal at the start of each turn.'], exhaust: ['ONCE', 'used up for this fight.'], pierce: ['BREAKS BLOCK', 'shatters the foe\'s Block first.'],
  };
  // a TM move added by another file (no card of its own yet): a generic TM attack
  function tmCard(id) {
    const d = typeof Moves !== 'undefined' && Moves.DEF ? Moves.DEF[id] : null;
    if (!d) return null;
    return (CARDS['tm:' + id] = { tm: id, name: d.name, cost: 1, kind: 'atk', r: 1, dmg: 7, anim: 'shot', shot: d.col ? '#' + (d.col & 0xffffff).toString(16).padStart(6, '0').replace(/(..)(..)(..)/, '$3$2$1') : '#ffffff', art: 'generic', up: { dmg: 10 } });
  }
  const tmLabel = (id) => { const d = typeof Moves !== 'undefined' && Moves.DEF ? Moves.DEF[id] : null; return d && d.tm ? d.tm : 'TM'; };
  const defCache = {};
  // card id ('tackle', 'bubble+') → full definition with its rules text
  function def(id) {
    if (defCache[id]) return defCache[id];
    const up = id.endsWith('+'), base = up ? id.slice(0, -1) : id;
    const b = CARDS[base] || (base.startsWith('tm:') ? CARDS[base] || tmCard(base.slice(3)) : null) || CARDS.tackle;
    const c = Object.assign({}, b, up && b.up ? b.up : {});
    if (up && b.up) { if (b.up.fx) c.fx = Object.assign({}, b.fx, b.up.fx); if (b.up.power) c.power = Object.assign({}, b.power, b.up.power); }
    c.id = id; c.base = base; c.key = id; c.up = up; c.upF = up && b.up ? b.up : {};
    c.name = b.name + (up ? '+' : ''); if (b.short) c.short = b.short + (up ? '+' : '');
    c.costUp = up && b.up && b.up.cost !== undefined;
    if (b.tm) c.tm = tmLabel(b.tm);
    c.desc = describe(c);
    return (defCache[id] = c);
  }
  function describe(c) {
    const N = (v, f) => (c.upF && c.upF[f] !== undefined ? '[' + GRN + ']' + v + '[]' : String(v));
    const K = (w) => '[' + GOLD + ']' + w + '[]';
    const p = [];
    if (c.dmg) p.push('Deal ' + N(c.dmg, 'dmg') + (c.hits > 1 ? ' x' + N(c.hits, 'hits') : '') + '.');
    if (c.pierce) p.push('Breaks ' + K('BLOCK') + '.');
    if (c.blk) p.push('Gain ' + N(c.blk, 'blk') + ' ' + K('BLOCK') + '.');
    if (c.fx) for (const k in c.fx) p.push(k === 'stun' ? K('FREEZE') + ' it.' : K(KW[k][0]) + ' ' + N(c.fx[k], 'fx') + '.');
    if (c.buff && c.buff.str) p.push('+' + c.buff.str + ' ' + K('POWER') + '.');
    if (c.heal) p.push('Heal ' + c.heal + '.');
    if (c.draw) p.push('Draw ' + N(c.draw, 'draw') + '.');
    if (c.power && c.power.rain) p.push(K('RAIN') + ': attacks +' + N(c.power.rain, 'power') + ' dmg.');
    if (c.power && c.power.sun) p.push(K('SUN') + ': heal ' + N(c.power.sun, 'power') + ' a turn.');
    if (c.flav) p.push(c.upF.flav ? '[' + GRN + ']' + c.flav + '[]' : c.flav);
    return p.join(' ');
  }
  const keywords = (c) => {
    const out = [];
    if (c.blk) out.push('blk'); if (c.pierce) out.push('pierce');
    if (c.fx) for (const k in c.fx) out.push(k);
    if (c.buff && c.buff.str) out.push('str');
    if (c.power) for (const k in c.power) out.push(k);
    if (c.exhaust) out.push('exhaust');
    return out.filter((k, i) => out.indexOf(k) === i && KW[k]);
  };

  /* ---------- the foes ---------- */
  // moves: a = attack v (hits h), b = block v, w = muddy you, v = daze you, s = +power self, d = dizzy (you draw 1 fewer)
  // eyes: the model's best eyes for each face (species differ)
  const FOES = {
    crawdaunt: { hp: 46, tier: 2, title: 'Rogue of the Beach', moves: [{ n: 'Crabhammer', a: 9 }, { n: 'Harden', b: 9, s: 1 }, { n: 'Double Snip', a: 4, h: 2 }, { n: 'Leer', v: 2 }],
      eyes: { anger: 'angry', smug: 'happy', shock: 'open', dizzy: 'dizzy', ko: 'dizzy' },
      lines: { intro: ['This is MY beach, shrimp!', 'You want a pinch?'], attack: ['CRABHAMMER TIME!', 'Pinch pinch PINCH!'], hurt: ['MY CLAWS!', 'Hey! That... OW!'], smug: ['Heh. Cute.', 'Was that a SPLASH?'], low: ['Wait! Time out!', 'N-not the face!'], win: ['And STAY out, shrimp!', '*victory snip*'], ko: ['I... will be... BACK...', 'Uncle! UNCLE!'] } },
    sharpedo: { hp: 44, tier: 3, title: 'Terror of the Deep', moves: [{ n: 'Bite', a: 8 }, { n: 'Aqua Jet', a: 5, h: 2 }, { n: 'Scary Face', w: 2 }, { n: 'Crunch', a: 13 }],
      eyes: { anger: 'angry', smug: 'closed', shock: 'open', dizzy: 'closed', ko: 'closed' },
      lines: { intro: ['*CHOMP CHOMP*', 'Nice tail. Mine now.'], attack: ['Dinner time!', 'CHOMP!!'], hurt: ['Not the fin!', 'OWCH!'], smug: ['*shark grin*', 'Adorable.'], low: ['Glub?! GLUB!', 'I need a dentist...'], win: ['Too easy. Sashimi!'], ko: ['...glub.', 'Mommy...'] } },
    walrein: { hp: 60, tier: 3, title: 'King of the Rock', moves: [{ n: 'Body Slam', a: 11 }, { n: 'Blubber', b: 12 }, { n: 'Ice Fang', a: 7, d: 1 }, { n: 'Rest', b: 6, s: 2 }],
      eyes: { anger: 'angry', smug: 'closed', shock: 'open', dizzy: 'closed', ko: 'closed' },
      lines: { intro: ['*HUFF* Off my rock!', 'BLORF.'], attack: ['BODY SLAM!', '*huff huff* SLAM!'], hurt: ['My blubber!', 'OOF!'], smug: ['*yawns*', 'Hrmph. Tiny.'], low: ['*sweats* ...blorf?', 'M-my rock...'], win: ['*HUFF* My rock.'], ko: ['*flop*', 'Nap... time...'] } },
    vigoroth: { hp: 40, tier: 2, title: 'The Restless Menace', moves: [{ n: 'Fury Swipes', a: 2, h: 4 }, { n: 'Scratch', a: 6 }, { n: 'Hyper!', s: 2 }, { n: 'Slash', a: 9 }],
      eyes: { anger: 'open', smug: 'happy', shock: 'open', dizzy: 'closed', ko: 'closed' },
      lines: { intro: ['VIGO VIGO VIGO!', 'Can\'t stop! Won\'t stop!'], attack: ['SWIPE SWIPE SWIPE!', 'HYAAAA!'], hurt: ['Stopped?! ME?!', 'VIGOW!'], smug: ['Too slow! Too slow!', 'Hahaha! Splash!'], low: ['Need... to... move...', 'Can\'t... stop...'], win: ['VIGO! Victory lap!'], ko: ['...finally... a nap...', 'Zzz...'] } },
    breloom: { hp: 42, tier: 2, title: 'Mushroom Kickboxer', moves: [{ n: 'Mach Punch', a: 7 }, { n: 'Spore', d: 1, w: 1 }, { n: 'Mega Drain', a: 5, b: 5 }, { n: 'Bulk Up', s: 2, b: 4 }],
      eyes: { anger: 'open', smug: 'happy', shock: 'open', dizzy: 'closed', ko: 'closed' },
      lines: { intro: ['Hup! Hup! Put \'em up!', '*shadowboxes*'], attack: ['MACH PUNCH!', 'One-two! ONE-TWO!'], hurt: ['A clean hit?!', 'Oof! Nice jab!'], smug: ['Nice form. NOT.', 'Ha! Weak!'], low: ['Ding ding! Round over?', '*wobbles*'], win: ['Champion! Hup!'], ko: ['*TKO*', 'Ref... count...'] } },
    torkoal: { hp: 48, tier: 2, title: 'Smog Grump', moves: [{ n: 'Smog', w: 2, a: 3 }, { n: 'Iron Defense', b: 12 }, { n: 'Flame Wheel', a: 9 }, { n: 'Smokescreen', d: 1, b: 4 }],
      eyes: { anger: 'open', smug: 'happy', shock: 'open', dizzy: 'closed', ko: 'closed' },
      lines: { intro: ['*PUFF* Hot spring\'s full!', '*cough cough*'], attack: ['*PUFF PUFF* BURN!', 'FLAME WHEEL!'], hurt: ['*cough* My shell!', 'Hot hot HOT!'], smug: ['*puffs a smug ring*', 'Pfft.'], low: ['*wheeze*', 'Out of coal...'], win: ['*content puff*'], ko: ['*sad little puff*', '...cough.'] } },
    slaking: { hp: 70, tier: 3, title: 'The Laziest King', moves: [{ n: 'Yawn', d: 1 }, { n: 'Slack Off', b: 10 }, { n: 'Giga Impact', a: 20 }, { n: 'Truant...', b: 2 }],
      eyes: { anger: 'open', smug: 'closed', shock: 'open', dizzy: 'closed', ko: 'closed' }, lines: { intro: ['...', '*yaaawn*'] } },
    groudon: { hp: 90, tier: 3, title: 'Lord of the Land', moves: [{ n: 'Precipice', a: 14 }, { n: 'Bulk Up', s: 3, b: 8 }, { n: 'Stomp', a: 6, h: 2 }, { n: 'Glare', v: 2, w: 1 }],
      eyes: { anger: 'open', smug: 'closed', shock: 'open', dizzy: 'closed', ko: 'closed' }, lines: { intro: ['GRRRAAAH!'] } },
  };
  const LINES = {
    intro: ['Hmph!', 'You again?!'], attack: ['Take THIS!', 'HIYAAA!'], hurt: ['OW OW OW!', 'That was LUCKY!'], smug: ['Heh. Cute.', 'Was that... a splash?'],
    low: ['Wait wait wait!', 'Time out! TIME OUT!'], win: ['And STAY out!', 'Too easy.'], ko: ['Uncle! UNCLE!', 'I... will be... back...'],
  };
  const KIP = { big: ['MUD-KIP!!', 'Kip kip KIP!', 'Muuudkip!'], hurt: ['Mud?!', 'Kiiip...', 'OW! Mud!'], power: ['Mudkip is pumped!', 'Kip! ♪', 'Mud mud mud!'] };
  function foeDef(m) {
    const d = FOES[m.dex]; if (d) return d;
    const S = DexData.S[m.dex] || {}, tier = S.legendary ? 3 : S.rare === 2 ? 3 : S.rare === 1 ? 2 : 1;
    return { hp: 26 + tier * 10, tier, title: 'Wild Challenger', eyes: {}, moves: [{ n: 'Tackle', a: 4 + tier * 2 }, { n: 'Defense Curl', b: 5 + tier * 2 }, { n: 'Double Slap', a: 2 + tier, h: 2 }, { n: 'Tail Whip', v: 1 }], lines: {} };
  }
  const lineOf = (G, k) => pick((G.fd.lines && G.fd.lines[k]) || LINES[k]);

  /* ---------- deck persistence ---------- */
  // Save.data.cards = { v: 2, deck: [card ids], tm: { move: { up, n } }, hp, wins, losses, tamed }
  function store() {
    const d = Save.data;
    if (!d.cards || !d.cards.v) { const o = d.cards || {}; d.cards = { v: 2, deck: STARTER.slice(), tm: {}, hp: 0, wins: o.wins || 0, losses: o.losses || 0, tamed: o.tamed || {} }; }
    const s = d.cards; if (!s.tm) s.tm = {}; if (!s.tamed) s.tamed = {}; if (!Array.isArray(s.deck)) s.deck = STARTER.slice();
    return s;
  }
  // every TM move Mudkip knows that has a card
  function tmMoves() {
    if (typeof Moves === 'undefined' || !Moves.LIST) return [];
    return Moves.LIST.filter((m) => m.tm && Moves.has(m.id) && (CARDS[m.id] || tmCard(m.id))).map((m) => (CARDS[m.id] && CARDS[m.id].tm ? m.id : 'tm:' + m.id));
  }
  function battleDeck() {
    const s = store(), deck = s.deck.slice();
    for (const id of tmMoves()) { const e = s.tm[id] || {}; for (let k = 0; k < 1 + (e.n || 0); k++) deck.push(e.up ? id + '+' : id); }
    return deck;
  }
  const maxHP = () => 40 + Math.min(20, (store().wins || 0) * 2) + (store().hp || 0);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- battle state ---------- */
  const unit = (hp) => ({ hp, max: hp, blk: 0, st: { weak: 0, vuln: 0, stun: 0, str: 0, soak: 0, dizzy: 0, style: 0, rain: 0, sun: 0 }, off: { x: 0, y: 0, sx: 1, sy: 1, rot: 0 }, flash: 0, shownHp: hp, face: null, dizzyT: 0 });
  function start(foe, o = {}) {
    const M = mk();
    if (!M || !foe || !foe.alive || C.live || Game.mode !== 'explore') return false;
    if (typeof Arcade !== 'undefined' && Arcade.live) return false;
    const fd = foeDef(foe), side = foe.x >= M.x ? 1 : -1;
    const dx = Math.abs(foe.x - M.x), land = foe.mode === 'land' && !foe.plat && Math.abs(foe.y - World.groundAt(foe.x)) < 6;
    const fx = land && (dx > 130 || dx < 96) ? M.x + side * 112 : foe.x;
    const G = C.g = {
      foe, fd, side, o, t: 0, step: 'intro', turn: 0, energy: 0, maxE: 3,
      you: unit(maxHP()), them: unit(fd.hp), draw: shuffle(battleDeck()), hand: [], disc: [], exh: [], fly: [], parts: [], bubbles: [],
      mx: M.x, fx0: foe.x, fx, intent: null, mi: (Math.random() * fd.moves.length) | 0, seq: null, pops: [], impact: null, reward: null, over: 0, msg: '',
      handK: 0, zoom: null, cam: null, lineTurn: -1, saidLow: false, dealt: 0, taken: 0, flashT: 0,
    };
    C.live = true; C.sel = -1; C.hov = -1; C.deckView = false; C.t = 0;
    if (typeof Arcade !== 'undefined') Arcade.live = true; // borrow the cutscene hooks (see bottom)
    if (typeof Pad !== 'undefined') Pad.reset && Pad.reset();
    M.stop && M.stop(); Game.pin = null;
    foe.doTask(foeBrain(foe), 9); foe.arcade = true;
    M.doTask(kipBrain(M), 9);
    C.arena = o.arena !== false && typeof Arena !== 'undefined';
    if (C.arena) Arena.begin(G);
    else { sfx('chime', null, 0.7); if (typeof Music !== 'undefined' && Music.play) { try { Music.play('festival'); } catch (e) { /* */ } } }
    C.song = true;
    G.seq = introSeq(G);
    return true;
  }
  // the foe: faces Mudkip, fights, and pulls the face the battle calls for
  function* foeBrain(m) {
    for (;;) {
      const dt = yield, M = mk(), G = C.g;
      if (M) m.turn(m.face(M.x > m.x ? 1 : -1, false), dt || 0.016, 8);
      const beh = DexData.S[m.dex] && DexData.S[m.dex].beh;
      m.setAct(beh && beh.battle && G && G.them.st.stun <= 0 ? 'battle' : 'idle', 0.3);
      if (!G) continue;
      const f = G.them.face, E = G.fd.eyes || {};
      const k = G.them.ko ? 'ko' : f ? f.kind : G.them.dizzyT > 0 ? 'dizzy' : null;
      if (k === 'anger') { m.o.eyes = E.anger || 'open'; m.o.mouth = 0.7 + Math.sin(G.t * 30) * 0.2; }
      else if (k === 'smug') { m.o.eyes = E.smug || 'happy'; m.o.mouth = 0.15; }
      else if (k === 'shock') { m.o.eyes = E.shock || 'open'; m.o.mouth = 1; }
      else if (k === 'dizzy' || k === 'ko') { m.o.eyes = E[k] || 'closed'; m.o.mouth = 0.5; }
      else if (k === 'laugh') { m.o.eyes = E.smug || 'happy'; m.o.mouth = 0.6 + Math.sin(G.t * 24) * 0.4; }
    }
  }
  // Mudkip: its faces, and flat on its belly with X eyes when it loses
  function* kipBrain(M) {
    for (;;) {
      yield; const G = C.g; if (!G) continue;
      const o = M.o, f = G.you.face;
      if (G.you.ko) { o.squash = 0.3; o.bodyDip = 3; o.legSplay = 1.1; o.eyes = 'x'; o.mouth = 0.9; o.headPitch = 0.22; o.tailWag = Math.sin(G.t * 23) * (Math.sin(G.t * 1.3) > 0.6 ? 0.4 : 0); o.finSway = -0.2; continue; }
      if (G.you.win) { o.eyes = 'happy'; o.mouth = 1; o.tailWag = Math.sin(G.t * 16) * 0.5; o.headPitch = -0.15; continue; }
      if (!f) { if (G.you.dizzyT > 0) { o.eyes = 'blink'; o.mouth = 0.3; } continue; }
      if (f.kind === 'shock') { o.eyes = 'open'; o.mouth = 1; o.squash = -0.06; }
      else if (f.kind === 'anger') { o.eyes = 'blink'; o.mouth = 0.8; o.headPitch = 0.2; }
      else if (f.kind === 'happy' || f.kind === 'smug') { o.eyes = 'happy'; o.mouth = 1; }
      else if (f.kind === 'hurt') { o.eyes = 'blink'; o.mouth = 0.9; o.squash = 0.08; }
    }
  }
  const setFace = (G, who, kind, life = 1.2) => { U2(G, who).face = { kind, t: 0, life }; };
  function* wait(T) { let e = 0; while (e < T) e += yield; }
  function* introSeq(G) {
    if (C.arena) yield* Arena.intro(G);
    else { G.handK = 0; yield* wait(0.8); bubble(G, 'them', lineOf(G, 'intro'), 1.8); setFace(G, 'them', 'anger', 1.4); yield* wait(0.6); }
    newTurn(G);
  }
  function pickIntent(G) {
    const mv = G.fd.moves; G.mi = (G.mi + (Math.random() < 0.7 ? 1 : 2)) % mv.length;
    G.intent = mv[G.mi];
  }
  function newTurn(G) {
    G.turn++; G.step = 'you'; G.energy = G.maxE; G.you.blk = 0;
    const Y = G.you;
    if (Y.st.sun > 0) heal(G, 'you', Y.st.sun);
    const n = 5 - (Y.st.dizzy > 0 ? 1 : 0); if (Y.st.dizzy > 0) Y.st.dizzy--;
    drawCards(G, n);
    pickIntent(G);
    C.sel = -1;
  }
  function drawCards(G, n) {
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!G.draw.length) {
        if (!G.disc.length) break;
        G.draw = shuffle(G.disc); G.disc = []; sfx('page', null, 0.5);
        pop(G, 'you', 'Reshuffle!', hex('#c8d8ff'));
      }
      if (G.hand.length >= 10) break;
      G.hand.push({ id: G.draw.pop(), t: 0, delay: k++ * 0.09, x: null, y: 0, w: 0, lift: 0, shake: 0 });
    }
    if (k) sfx('page', null, 0.35);
  }

  /* ---------- effects ---------- */
  const U2 = (G, who) => (who === 'you' ? G.you : G.them);
  const actor = (G, who) => (who === 'you' ? mk() : G.foe);
  function pop(G, who, txt, col, big) { const m = actor(G, who); if (!m) return; const h = m.headPt(); G.pops.push({ x: m.x + rnd(-8, 8), y: h[1] * 0.6 + m.y * 0.4 + rnd(-3, 3), txt: String(txt), col, t: 0, big: !!big }); }
  function bubble(G, who, text, life = 1.6, o = {}) { G.bubbles = G.bubbles.filter((b) => b.who !== who); G.bubbles.push({ who, text, t: 0, life, shout: !!o.shout }); const m = actor(G, who); if (m && typeof Cries !== 'undefined') { try { if (who === 'you') Cries.mudkip(); else Cries.play(m.dex, m.x, 0.8, true); } catch (e) { /* */ } } }
  function dealDamage(G, from, to, base, o = {}) {
    const A = U2(G, from), D = U2(G, to);
    let dmg = base + (A.st.str || 0) + (from === 'you' ? A.st.rain || 0 : 0);
    if (A.st.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (D.st.vuln > 0) dmg = Math.floor(dmg * 1.5);
    if (D.st.soak > 0) dmg += 1;
    dmg = Math.max(0, dmg);
    let through = dmg;
    if (o.pierce && D.blk > 0) { pop(G, to, 'CRACK!', hex('#ffd070')); D.blk = 0; }
    if (D.blk > 0) { const b = Math.min(D.blk, dmg); D.blk -= b; through = dmg - b; if (b) pop(G, to, 'blocked ' + b, hex('#9ac8ff')); }
    D.hp = Math.max(0, D.hp - through); D.flash = 0.25;
    if (through > 0) pop(G, to, '-' + through, through >= 10 ? hex('#ffe040') : WHITE, through >= 10);
    if (from === 'you') G.dealt += through; else G.taken += through;
    return through;
  }
  function heal(G, who, n) { const u = U2(G, who), v = Math.min(n, u.max - u.hp); u.hp += v; if (v) pop(G, who, '+' + v, hex('#6aff8a')); }
  function applyFx(G, to, fx) { const u = U2(G, to); for (const k in fx) u.st[k] = (u.st[k] || 0) + fx[k]; const lab = { weak: 'Muddy!', vuln: 'Dazed!', stun: 'Frozen!', soak: 'Soaked!', dizzy: 'Dizzy', str: 'Power up!' }; for (const k in fx) if (lab[k]) pop(G, to, lab[k], hex('#ffb0ff')); }
  function impact(G, who, word, big) {
    const m = actor(G, who); if (!m) return;
    const h = m.headPt();
    G.impact = { t: 0, x: m.x, y: (h[1] + m.y) / 2, word, big: !!big };
    Game.shake && Game.shake(big ? 5 : 2.5);
    G.hitstop = big ? 0.12 : 0.06;
    if (big && C.arena) G.kick = 0.22; // a tiny camera punch on big hits
    sfx(big ? 'thud' : 'bonk', m.x, 1);
  }
  // a camera punch-in on whoever is speaking, with a big comic bubble (the battle waits)
  function* line(G, who, text, face, T = 1.25, o = {}) {
    G.zoom = { who, t: 0, T, z: o.z || 1.9 };
    if (face) setFace(G, who, face, T + 0.2);
    bubble(G, who, text, T, { shout: o.shout !== false });
    sfx('zoom', null, 0.8);
    yield* wait(T);
    G.zoom = null;
    yield* wait(0.2);
  }
  const canLine = (G) => C.arena && G.lineTurn !== G.turn && G.them.hp > 0 && G.you.hp > 0;

  /* ---------- playing a card ---------- */
  function canPlay(G, i) { const h = G.hand[i]; return !!(h && G.step === 'you' && !G.seq && def(h.id).cost <= G.energy); }
  function play(i) {
    const G = C.g; if (!G || G.step !== 'you' || G.seq) return;
    const h = G.hand[i]; if (!h) return;
    const c = def(h.id);
    if (c.cost > G.energy) { HUD.toast('Not enough energy!', { life: 1.2 }); sfx('error'); h.shake = 0.35; return; }
    G.energy -= c.cost;
    G.hand.splice(i, 1);
    (c.exhaust ? G.exh : G.disc).push(h.id);
    C.sel = -1; C.hov = -1;
    G.fly.push({ id: h.id, kind: 'play', t: 0, x: h.x, y: h.y, w: h.w || 60, tgt: c.kind === 'atk' ? 'them' : c.kind === 'power' ? 'up' : 'you', exhaust: !!c.exhaust });
    sfx('whoosh', null, 0.5);
    G.seq = cardSeq(G, h.id, c);
  }
  function* cardSeq(G, id, c) {
    const Y = G.you, T = G.them, M = mk(), F = G.foe, o = Y.off;
    const s = G.side;
    const hits = c.hits || 1;
    yield* wait(0.32); // the card flies in first
    const anim = c.anim || 'hop';
    if (c.dmg) {
      let total = 0;
      for (let k = 0; k < hits; k++) {
        if (anim === 'shot') yield* shotAnim(G, c.shot || '#5ab4ff', k === hits - 1);
        else if (anim === 'whirl') yield* whirlAnim(G, k);
        else if (anim === 'dash') yield* lungeAnim(G, 'you', 2);
        else yield* lungeAnim(G, 'you', hits > 2 ? 0.6 : 1);
        const d = dealDamage(G, 'you', 'them', c.dmg, { pierce: c.pierce });
        total += d;
        impact(G, 'them', d >= 12 ? pick(['KA-BONK!', 'WHAM!!', 'SPLOOSH!']) : d > 0 ? pick(['bonk!', 'boop!', 'thwack!', 'pow!']) : 'tink', d >= 12);
        squash(T, 1.5, 0.55);
        if (d > 0) T.dizzyT = Math.max(T.dizzyT, d >= 9 ? 0.9 : 0.4);
        yield* wait(0.1);
        yield* recoil(G, 'them');
        if (T.hp <= 0) break;
      }
      if (T.hp > 0) {
        if (total === 0) { setFace(G, 'them', 'smug', 1.4); bubble(G, 'them', pick(['Heh.', '*yawn*', 'Tickles.']), 1.2); }
        else if (total >= 10) {
          setFace(G, 'them', 'shock', 1.2);
          if (canLine(G) && Math.random() < 0.6) { G.lineTurn = G.turn; yield* line(G, 'them', lineOf(G, 'hurt'), 'shock', 1.1); }
        } else setFace(G, 'them', 'anger', 0.8);
        if (!G.saidLow && T.hp < T.max * 0.3) { G.saidLow = true; if (C.arena) { G.lineTurn = G.turn; yield* line(G, 'them', lineOf(G, 'low'), 'shock', 1.3); } }
      }
    } else if (anim === 'splash') {
      for (let k = 0; k < 3; k++) { o.y = 0; yield* hopAnim(o, 10, 0.26); sfx('splash', M.x, 0.5); FX.burst && FX.burst(M.x, M.y - 4, 6, hex('#bfe8ff'), hex('#5ab4ff')); }
      pop(G, 'you', pick(['...nothing happened', 'SO stylish', 'Magnificent. Useless.', 'The crowd goes mild']), hex('#e0b0ff'));
      if (canLine(G) && (Y.st.style === 0 || Math.random() < 0.3)) { G.lineTurn = G.turn; yield* line(G, 'them', lineOf(G, 'smug'), 'smug', 1.2); }
      else { setFace(G, 'them', 'smug', 1.2); }
    } else if (anim === 'growl') {
      o.sx = 1.3; o.sy = 0.8; sfx('roar', M.x, 0.6); Game.shake && Game.shake(1.5); setFace(G, 'you', 'anger', 0.6);
      bubble(G, 'you', 'MUD-KIP!!', 0.9, { shout: true });
      yield* wait(0.35); setFace(G, 'them', 'shock', 0.8); F.emote && F.emote('sweat', 1.2);
    } else if (anim === 'flash') {
      G.flashT = 0.5; sfx('twinkle', M.x, 1); sfx('zap', M.x, 0.6); setFace(G, 'you', 'happy', 0.8);
      yield* wait(0.3); setFace(G, 'them', 'shock', 1.2); F.emote && F.emote('shock', 1);
    } else if (anim === 'power') {
      sfx('unlock', M.x, 0.7); setFace(G, 'you', 'happy', 1.2);
      for (let e = 0; e < 0.5;) { e += yield; o.y = -Math.sin(Math.min(1, e / 0.5) * Math.PI) * 10; o.sx = 1 - 0.12 * Math.sin(e * 20); o.sy = 1 + 0.12 * Math.sin(e * 20); }
      o.y = 0;
      if (canLine(G) && Math.random() < 0.5) { G.lineTurn = G.turn; yield* line(G, 'you', pick(KIP.power), 'happy', 1, { z: 1.7, shout: false }); }
    } else if (anim === 'dig') {
      sfx('dust', M.x, 0.8); for (let e = 0; e < 0.4;) { e += yield; o.y = e * 20; o.sy = 1 - e; } yield* wait(0.2); for (let e = 0; e < 0.25;) { e += yield; o.y = 8 - e * 32; o.sy = 1.2; } o.y = 0;
    } else if (anim === 'guard') {
      sfx('clink', M.x, 0.5); for (let e = 0; e < 0.22;) { e += yield; const k = e / 0.22; o.sy = 1 - 0.18 * k; o.sx = 1 + 0.14 * k; }
      yield* wait(0.08);
    } else yield* hopAnim(o, 6, 0.22);
    if (c.blk) { Y.blk += c.blk; pop(G, 'you', '+' + c.blk + ' block', hex('#9ac8ff')); sfx('clink', M.x, 0.7); G.shieldT = 0.6; }
    if (c.heal) heal(G, 'you', c.heal);
    if (c.buff) applyFx(G, 'you', c.buff);
    if (c.power) { for (const k in c.power) Y.st[k] = (Y.st[k] || 0) + c.power[k]; pop(G, 'you', c.power.rain ? 'It\'s raining!' : 'Sunshine!', hex(GOLD)); }
    if (c.fx && T.hp > 0) applyFx(G, 'them', c.fx);
    if (c.fx && c.fx.stun && T.hp > 0) setFace(G, 'them', 'shock', 1);
    if (c.style) { Y.st.style += c.style; pop(G, 'you', 'Style +' + c.style + ' (' + Y.st.style + ')', hex('#e0b0ff')); }
    if (c.draw) drawCards(G, c.draw);
    o.x = 0; o.y = 0; o.sx = 1; o.sy = 1; o.rot = 0;
    yield* wait(0.12);
    if (T.hp <= 0) { yield* winSeq(G); return; }
  }
  function squash(u, sx, sy) { u.off.sx = sx; u.off.sy = sy; }
  function* hopAnim(o, h, T) { for (let e = 0; e < T;) { e += yield; const k = Math.min(1, e / T); o.y = -Math.sin(k * Math.PI) * h; o.sy = k < 0.15 ? 0.8 : k > 0.85 ? 0.85 : 1.12; o.sx = 2 - o.sy; } o.y = 0; o.sx = o.sy = 1; }
  function* lungeAnim(G, who, sp = 1) {
    const u = U2(G, who), o = u.off;
    const gap = Math.max(10, Math.abs(G.fx - G.mx) - 34);
    for (let e = 0; e < 0.16 / sp;) { e += yield; const k = e / (0.16 / sp); o.x = -7 * k; o.sx = 1 + 0.3 * k; o.sy = 1 - 0.28 * k; } // wind up
    sfx('whoosh', null, 0.6);
    for (let e = 0; e < 0.09 / sp;) { e += yield; const k = Math.min(1, e / (0.09 / sp)); o.x = lerp(-7, gap, U.ease.inCubic ? U.ease.inCubic(k) : k); o.sx = 1.45; o.sy = 0.72; o.y = -Math.sin(k * Math.PI) * 5; }
    o.sx = 0.75; o.sy = 1.3; o.y = 0;
  }
  function* recoil(G, who) {
    const other = who === 'you' ? G.them : G.you, u = U2(G, who);
    const o = other.off;
    for (let e = 0; e < 0.22;) { e += yield; const k = e / 0.22; o.x = lerp(o.x, 0, k); o.sx = lerp(o.sx, 1, k); o.sy = lerp(o.sy, 1, k); u.off.x = -10 * Math.sin(k * Math.PI); u.off.rot = -0.25 * Math.sin(k * Math.PI); }
    o.x = 0; o.sx = o.sy = 1; u.off.x = 0; u.off.rot = 0;
  }
  function* whirlAnim(G, k) {
    const o = G.you.off, M = mk();
    if (k === 0) { sfx('whoosh', M.x, 0.7); for (let e = 0; e < 0.3;) { e += yield; o.rot = (e / 0.3) * Math.PI * 2; o.y = -Math.sin((e / 0.3) * Math.PI) * 6; } o.rot = 0; o.y = 0; }
    const F = G.foe, h = F.headPt();
    for (let n = 0; n < 8; n++) FX.add && FX.add({ type: 'spark', x: F.x + Math.cos(n * 0.8 + k) * 16, y: (h[1] + F.y) / 2 + Math.sin(n * 0.8 + k) * 8, size: 1 + (n % 2), life: 0.3, c: WHITE, c2: hex('#5ab0ff'), layer: 3 });
    sfx('splash', F.x, 0.5);
    yield* wait(0.12);
  }
  function* shotAnim(G, col) {
    const M = mk(), F = G.foe, o = G.you.off;
    o.sx = 1.2; o.sy = 0.85; yield* wait(0.08); o.sx = 0.85; o.sy = 1.15;
    sfx('spout', M.x, 0.7);
    const h0 = M.headPt(), h1 = F.headPt();
    const P = { x0: M.x + G.side * 8, y0: h0[1] + 6, x1: F.x, y1: (h1[1] + F.y) / 2, t: 0, col: hex(col) };
    G.shot = P;
    for (let e = 0; e < 0.28;) { e += yield; P.t = Math.min(1, e / 0.28); }
    G.shot = null; o.sx = o.sy = 1;
    if (FX.burst) FX.burst(P.x1, P.y1, 10, P.col, WHITE);
  }

  /* ---------- the foe's turn ---------- */
  function endTurn() {
    const G = C.g; if (!G || G.step !== 'you' || G.seq) return;
    G.hand.forEach((h, i) => G.fly.push({ id: h.id, kind: 'disc', t: -i * 0.05, x: h.x, y: h.y, w: h.w || 60 }));
    G.disc.push(...G.hand.map((h) => h.id)); G.hand = []; C.sel = -1; C.hov = -1;
    G.step = 'them';
    G.seq = foeSeq(G);
    sfx('select');
  }
  function* foeSeq(G) {
    const T = G.them, Y = G.you, F = G.foe, mv = G.intent || G.fd.moves[0];
    yield* wait(0.45);
    T.blk = 0;
    if (T.st.stun > 0) { T.st.stun--; pop(G, 'them', 'Frozen solid!', hex('#c8f4ff')); sfx('freeze', F.x, 0.8); setFace(G, 'them', 'shock', 1); yield* wait(0.9); }
    else {
      // a big attack gets a dramatic zoom-in first
      if (mv.a && mv.a * (mv.h || 1) >= 8 && canLine(G) && Math.random() < 0.55) { G.lineTurn = G.turn; yield* line(G, 'them', lineOf(G, 'attack'), 'anger', 1.15); }
      else bubble(G, 'them', mv.n + '!', 1.1);
      yield* wait(0.3);
      if (mv.b) { T.blk += mv.b; pop(G, 'them', '+' + mv.b + ' block', hex('#9ac8ff')); sfx('clink', F.x, 0.7); squash(T, 1.2, 0.85); G.foeShieldT = 0.6; yield* wait(0.3); T.off.sx = T.off.sy = 1; }
      if (mv.s) { applyFx(G, 'them', { str: mv.s }); setFace(G, 'them', 'anger', 1); yield* hopAnim(T.off, 8, 0.3); }
      if (mv.a) {
        let total = 0;
        for (let k = 0; k < (mv.h || 1); k++) {
          yield* lungeAnim(G, 'them', (mv.h || 1) > 2 ? 0.7 : 1);
          const d = dealDamage(G, 'them', 'you', mv.a);
          total += d;
          impact(G, 'you', d >= 10 ? pick(['OOF!!', 'KA-POW!', 'YOWCH!']) : d > 0 ? pick(['bonk!', 'ow!', 'smack!']) : 'blocked!', d >= 10);
          squash(Y, 1.5, 0.55); if (d > 0) { Y.dizzyT = Math.max(Y.dizzyT || 0, d >= 8 ? 1.3 : 0.6); setFace(G, 'you', 'hurt', 0.7); }
          yield* wait(0.1);
          yield* recoil(G, 'you');
          if (Y.hp <= 0) break;
        }
        if (Y.hp > 0) {
          if (total === 0) { setFace(G, 'them', 'anger', 1.2); bubble(G, 'them', pick(['GRRR!', 'Stop BLOCKING!', 'No fair!']), 1.2, { shout: true }); setFace(G, 'you', 'smug', 1); }
          else if (total >= 10) { setFace(G, 'them', 'laugh', 1.2); setFace(G, 'you', 'shock', 1); bubble(G, 'you', pick(KIP.hurt), 1); }
          else setFace(G, 'them', 'smug', 0.9);
        }
      }
      if (mv.w) applyFx(G, 'you', { weak: mv.w });
      if (mv.v) applyFx(G, 'you', { vuln: mv.v });
      if (mv.d) applyFx(G, 'you', { dizzy: mv.d });
    }
    // statuses wear off at the end of the round
    for (const u of [T, Y]) { if (u.st.weak > 0) u.st.weak--; if (u.st.vuln > 0) u.st.vuln--; if (u.st.soak > 0) u.st.soak--; }
    yield* wait(0.3);
    if (Y.hp <= 0) { yield* loseSeq(G); return; }
    newTurn(G);
  }

  /* ---------- the end ---------- */
  function* winSeq(G) {
    const F = G.foe, T = G.them, M = mk();
    G.step = 'ko'; G.intent = null;
    T.dizzyT = 0;
    // shock face zoom, a spin, and a flop onto its back
    if (C.arena) { G.zoom = { who: 'them', t: 0, T: 1.2, z: 2.1 }; }
    setFace(G, 'them', 'shock', 1);
    bubble(G, 'them', pick(['IMPOSSIBLE?!', 'B-but... HOW?!', 'NOOOO!']), 1, { shout: true });
    sfx('boing', F.x, 0.8);
    yield* wait(0.8);
    const dir = -G.side;
    for (let e = 0; e < 0.8;) { e += yield; const k = Math.min(1, e / 0.8); T.off.rot = dir * k * Math.PI * 4; T.off.y = -Math.sin(k * Math.PI) * 22; T.off.sx = 1 - 0.1 * Math.sin(k * 20); }
    T.ko = true; T.off.y = 0; T.off.rot = dir * -Math.PI / 2; T.off.sx = 1.1; T.off.sy = 0.9;
    sfx('thud', F.x, 1); Game.shake && Game.shake(6); G.kick = 0.35;
    G.koT = 0; T.dizzyT = 99; T.face = null;
    FX.burst && FX.burst(F.x, F.y - 4, 12, hex('#fff4d8'), WHITE);
    for (let e = 0; e < 0.25;) { e += yield; T.off.y = -Math.sin(Math.min(1, e / 0.25) * Math.PI) * 6; }
    T.off.y = 0;
    yield* wait(0.5);
    bubble(G, 'them', lineOf(G, 'ko'), 1.8);
    yield* wait(0.9);
    G.zoom = null;
    G.you.win = true; M && M.emote && M.emote('star', 1.4);
    sfx('reward');
    yield* wait(0.9);
    const s = store(); s.wins = (s.wins || 0) + 1; Save.save();
    G.reward = { opts: rollRewards(G), t: 0 };
    G.step = 'reward'; C.sel = 0;
  }
  function* loseSeq(G) {
    const Y = G.you, M = mk();
    G.step = 'ko'; G.intent = null;
    Y.ko = true; Y.dizzyT = 99; Y.face = null;
    sfx('thud', M.x, 1); Game.shake && Game.shake(4);
    for (let e = 0; e < 0.3;) { e += yield; const k = Math.min(1, e / 0.3); Y.off.y = -Math.sin(k * Math.PI) * 10; Y.off.sx = lerp(1, 1.35, k); Y.off.sy = lerp(1, 0.66, k); }
    Y.off.y = 0; sfx('mud', M.x, 0.9);
    if (C.arena) G.zoom = { who: 'you', t: 0, T: 1.6, z: 2.2 };
    yield* wait(1.2);
    G.zoom = null;
    if (C.arena) { yield* line(G, 'them', lineOf(G, 'win'), 'laugh', 1.4); }
    else { bubble(G, 'them', lineOf(G, 'win'), 1.6); setFace(G, 'them', 'laugh', 1.6); yield* wait(1.2); }
    const s = store(); s.losses = (s.losses || 0) + 1; Save.save();
    if (typeof Arena !== 'undefined' && Arena.sadTrombone) Arena.sadTrombone();
    G.step = 'lost'; G.lostT = 0; G.gag = pick(['Mudkip is a pancake now.', 'It\'s not fainted. It\'s resting its eyes.', 'Mudkip has become one with the floor.', 'Achievement unlocked: FLAT MUDKIP', 'Mudkip would like a do-over.', '10/10 belly flop. 0/10 battle.']);
  }
  // the reward choices: TM upgrades, removals, TM copies — no random new moves
  function rollRewards(G) {
    const s = store(), deck = battleDeck(), tms = tmMoves(), opts = [];
    const tmUp = tms.filter((id) => !(s.tm[id] && s.tm[id].up));
    if (tmUp.length) { const id = pick(tmUp); opts.push({ t: 'up', id, to: id + '+', lab: 'UPGRADE TM', tm: true }); }
    const st = ['tackle', 'block', 'splash'].filter((id) => s.deck.includes(id));
    if (st.length) { const id = pick(st.filter((i) => i !== 'splash').length && Math.random() < 0.85 ? st.filter((i) => i !== 'splash') : st); opts.push({ t: 'up', id, to: id + '+', lab: 'UPGRADE' }); }
    if (deck.length > 8) { const rm = s.deck.includes('splash') ? 'splash' : s.deck.includes('tackle') ? 'tackle' : s.deck.includes('block') ? 'block' : s.deck[0]; if (rm) opts.push({ t: 'rm', id: rm, lab: 'REMOVE' }); }
    const cp = tms.filter((id) => !((s.tm[id] || {}).n >= 1));
    if (cp.length) { const id = pick(cp); opts.push({ t: 'tm', id: (s.tm[id] || {}).up ? id + '+' : id, tmId: id, lab: 'TM COPY' }); }
    if (opts.length < 3) opts.push({ t: 'hp', id: 'oran', lab: 'MAX HP' });
    if (opts.length < 3 && s.deck.includes('block') && !opts.some((o) => o.id === 'block')) opts.push({ t: 'up', id: 'block', to: 'block+', lab: 'UPGRADE' });
    return opts.slice(0, 3);
  }
  function takeReward(i) {
    const G = C.g; if (!G || G.step !== 'reward') return;
    const R = G.reward.opts[i], s = store();
    if (R) {
      if (R.t === 'up') {
        if (R.tm) { (s.tm[R.id] = s.tm[R.id] || {}).up = 1; }
        else { const k = s.deck.indexOf(R.id); if (k >= 0) s.deck[k] = R.to; }
        HUD.toast(def(R.id).name + ' upgraded to ' + def(R.to).name + '!', { life: 2.4, col: hex(GRN) });
      } else if (R.t === 'rm') { const k = s.deck.indexOf(R.id); if (k >= 0) s.deck.splice(k, 1); HUD.toast(def(R.id).name + ' removed from your deck.', { life: 2.4 }); }
      else if (R.t === 'tm') { (s.tm[R.tmId] = s.tm[R.tmId] || {}).n = 1; HUD.toast('An extra ' + def(R.id).name + ' card joins your deck!', { life: 2.4 }); }
      else if (R.t === 'hp') { s.hp = (s.hp || 0) + 4; HUD.toast('Oran Berry! Max HP +4 (now ' + maxHP() + ').', { life: 2.4, col: hex('#6aff8a') }); }
      Save.save(); sfx('reward');
    }
    finish(true);
  }
  function finish(win) {
    const G = C.g; if (!G || G.over) return;
    G.over = 0.01; G.win = win; G.step = 'done';
    C.sel = -1;
    const cb = G.o && G.o.onEnd;
    try { if (cb) cb(win, G); } catch (e) { console.error(e); }
  }
  function flee() {
    const G = C.g; if (!G) { close(); return; }
    if (G.step === 'reward') { takeReward(-1); return; }
    if (G.step === 'lost') { finish(false); return; }
    if (G.over) return;
    if (G.step === 'intro') { if (C.arena) Arena.skip(G); return; }
    HUD.toast('Mudkip ran away!', { life: 1.8 });
    G.fled = true; finish(false);
  }
  function close() {
    const G = C.g, M = mk();
    C.live = false; C.g = null; C.deckView = false;
    if (typeof Arcade !== 'undefined') Arcade.live = false;
    Game.camFocus = null;
    if (typeof Arena !== 'undefined') Arena.stop();
    if (M) { M.rot = 0; M.jy = 0; M.tintK = 0; if (M.task && M.task.prio >= 9) M.task.done = true; }
    if (G && G.foe) { const F = G.foe; F.arcade = false; if (F.task && F.task.prio >= 9) F.task.done = true; F.rot = 0; F.tintK = 0; }
    if (C.song && typeof Music !== 'undefined' && Game.area && Music.areaTrack) { C.song = false; try { Music.areaTrack(Game.area.def.music); } catch (e) { /* */ } }
  }

  /* ---------- per-frame ---------- */
  function update(dt) {
    C.bars = clamp(C.bars + (C.live ? dt : -dt) * 3, 0, 1);
    if (!C.live) return;
    C.t += dt;
    const G = C.g, M = mk(), F = G && G.foe;
    if (!G || !M || !F || !F.alive || Game.mode !== 'explore') { close(); return; }
    G.t += dt;
    if (G.hitstop > 0) { G.hitstop -= dt; } else if (G.seq) { const r = G.seq.next(dt); if (r.done) G.seq = null; }
    if (G.impact) { G.impact.t += dt; if (G.impact.t > 0.45) G.impact = null; }
    for (let i = G.pops.length - 1; i >= 0; i--) { const p = G.pops[i]; p.t += dt; if (p.t > 1.3) G.pops.splice(i, 1); }
    for (let i = G.bubbles.length - 1; i >= 0; i--) { const b = G.bubbles[i]; b.t += dt; if (b.t > b.life) G.bubbles.splice(i, 1); }
    for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; if (p.t > p.life) G.parts.splice(i, 1); }
    for (let i = G.fly.length - 1; i >= 0; i--) { const f = G.fly[i]; f.t += dt; if (f.t > (f.kind === 'play' ? 0.62 : 0.4)) { if (f.kind === 'play') flyBurst(G, f); G.fly.splice(i, 1); } }
    for (const h of G.hand) { if (h.delay > 0) h.delay -= dt; else h.t += dt; if (h.shake) h.shake = Math.max(0, h.shake - dt); }
    G.shieldT = Math.max(0, (G.shieldT || 0) - dt); G.foeShieldT = Math.max(0, (G.foeShieldT || 0) - dt); G.flashT = Math.max(0, G.flashT - dt); G.kick = Math.max(0, (G.kick || 0) - dt);
    if (G.zoom) G.zoom.t += dt;
    if (G.reward) G.reward.t += dt;
    if (G.step === 'lost') G.lostT += dt;
    for (const u of [G.you, G.them]) {
      u.flash = Math.max(0, u.flash - dt); if (u.dizzyT < 50) u.dizzyT = Math.max(0, (u.dizzyT || 0) - dt);
      if (u.face) { u.face.t += dt; if (u.face.t > u.face.life) u.face = null; }
      u.shownHp = lerp(u.shownHp, u.hp, Math.min(1, dt * 5));
      if (!u.ko && (!G.seq || G.step === 'you')) { u.off.sx = lerp(u.off.sx, 1, Math.min(1, dt * 10)); u.off.sy = lerp(u.off.sy, 1, Math.min(1, dt * 10)); }
    }
    // the hand slides away during zoom-ins and cutscenes
    const showHand = (G.step === 'you' || G.step === 'them') && !G.zoom && !C.deckView;
    G.handK = clamp(G.handK + (showHand ? dt : -dt) * 4, 0, 1);
    // pose the actors (after their own update, before drawing)
    const intro = clamp(G.t / 0.7, 0, 1);
    const fxBase = lerp(G.fx0, G.fx, ease(intro));
    pose(M, G.you, G.mx, G.side, G);
    pose(F, G.them, fxBase, -G.side, G);
    if (C.arena) Arena.update(dt, G);
    if (G.over) { G.over += dt; if (!C.arena ? G.over > 1.2 : Arena.outDone(G)) close(); }
    // camera: frames both, punches in on a speaker, or follows the arena director
    camera(G, M, F, dt);
  }
  function camera(G, M, F, dt) {
    const midX = (G.mx + G.fx) / 2, feet = Math.max(M.y, F.y);
    const span = Math.abs(G.fx - G.mx) + 110;
    let zf = clamp(Game.VW / span * 0.62, 1.0, 1.35), x = midX, y = feet - Game.VH * 0.1, sp = 4;
    const Z = G.zoom;
    if (Z) {
      const m = Z.who === 'you' ? M : F, h = m.headPt();
      const k = ease(Math.min(1, Z.t / 0.22));
      x = lerp(midX, m.x, k); y = lerp(y, (h[1] + m.y) / 2 - 4, k); zf = lerp(zf, Z.z, k); sp = 10;
    }
    if (G.cam) { x = G.cam.x; y = G.cam.y; zf = G.cam.zoom; sp = G.cam.speed || 8; }
    if (G.kick > 0) zf *= 1 + Math.sin((G.kick / 0.35) * Math.PI) * 0.05;
    Game.camFocus = { x, y, zoom: zf, speed: sp };
    // drive the director's zoom ourselves: a snappy punch rather than the slow default drift
    if (Game.cine) { const c = Game.cine; C.zk = C.zk || c.zk || 1; C.zk += (zf - C.zk) * Math.min(1, dt * (Z || G.cam ? 9 : 4)); c.zk = C.zk; }
  }
  function pose(m, u, bx, dir, G) {
    const o = u.off, f = u.face;
    let jx = 0, jy = 0, jr = 0, sx = 1, sy = 1;
    if (f) {
      const k = f.t;
      if (f.kind === 'anger') { jx = Math.sin(k * 55) * 1.2; sy = 1.04 + Math.sin(k * 20) * 0.03; }
      else if (f.kind === 'shock') { jy = -Math.max(0, Math.sin(Math.min(1, k / 0.25) * Math.PI)) * 8; sy = k < 0.3 ? 1.22 : 1.05; sx = k < 0.3 ? 0.84 : 0.97; }
      else if (f.kind === 'smug') { jr = -dir * 0.12 * Math.min(1, k / 0.2); jy = Math.sin(k * 5) * 0.8; }
      else if (f.kind === 'laugh') { jy = -Math.abs(Math.sin(k * 16)) * 3; sy = 1 + Math.sin(k * 32) * 0.05; }
      else if (f.kind === 'hurt') { jx = Math.sin(k * 40) * (1 - Math.min(1, k)) * 2; }
    }
    m.x = bx + o.x * dir + jx;
    m.jOn = true;
    const br = u.ko ? 0 : Math.sin(C.t * 3 + (m.seed || 0)) * 0.03;
    m.jsx = o.sx * sx * (1 - br * 0.7); m.jsy = o.sy * sy * (1 + br); m.jy = o.y + jy;
    m.rot = o.rot + jr + (u.dizzyT > 0 && !u.ko ? Math.sin(C.t * 9) * 0.08 : 0);
    const angry = f && f.kind === 'anger';
    m.tint = angry ? hex('#ff3020') : WHITE;
    m.tintK = u.flash > 0 ? Math.min(1, u.flash * 4) : angry ? 0.18 + Math.sin(f.t * 18) * 0.1 : 0;
    if (m.turn && m.face) m.turn(m.face(dir, false), 0.05, 20);
  }
  function drive(M) { M.idleT = 0; M.keyDir = 0; M.keyY = 0; M.running = false; M.sneak = false; M.jumpHeld = false; return true; }

  /* ---------- input ---------- */
  function key(k) {
    if (!C.live) return false;
    const G = C.g; if (!G) return true;
    if (C.deckView) { if (k === 'Escape' || k === 'd' || k === ' ' || k === 'Enter' || k === 'Tab') C.deckView = false; return true; }
    if (G.step === 'intro') { if (k === ' ' || k === 'Enter' || k === 'Escape') flee(); return true; }
    if (G.step === 'lost') { if (G.lostT > 0.8 && (k === ' ' || k === 'Enter' || k === 'Escape')) finish(false); return true; }
    if (k === 'Escape') { flee(); return true; }
    if (k === 'd' || k === 'Tab') { if (G.step === 'you' || G.step === 'them') { C.deckView = true; sfx('page'); } return true; }
    if (G.step === 'reward') {
      const n = G.reward.opts.length;
      if (/^[1-9]$/.test(k) && +k <= n) takeReward(+k - 1);
      else if (k === 'ArrowLeft' || k === 'a') C.sel = (C.sel + n) % (n + 1);
      else if (k === 'ArrowRight' || k === 's' || k === 'ArrowDown') C.sel = (C.sel + 1) % (n + 1);
      else if (k === ' ' || k === 'Enter') takeReward(C.sel >= n ? -1 : C.sel);
      else if (k === 'k') takeReward(-1);
      return true;
    }
    if (G.step !== 'you') return true;
    if (/^[1-9]$/.test(k)) { play(+k - 1); return true; }
    const n = G.hand.length;
    if (k === 'ArrowLeft' || k === 'a') { C.sel = n ? (C.sel + n - 1) % n : -1; C.hov = -1; sfx('blip', null, 0.3); }
    else if (k === 'ArrowRight') { C.sel = n ? (C.sel + 1) % n : -1; C.hov = -1; sfx('blip', null, 0.3); }
    else if (k === ' ' || k === 'Enter') { if (C.sel >= 0 && C.sel < n) play(C.sel); else endTurn(); }
    else if (k === 'e') endTurn();
    return true;
  }
  function down(ux, uy) {
    if (!C.live) return false;
    for (let i = C.btns.length - 1; i >= 0; i--) { const b = C.btns[i]; if (ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) { b.fn(); return true; } }
    const G = C.g;
    if (C.deckView) C.deckView = false;
    else if (G && G.step === 'intro') flee();
    else if (G && G.step === 'lost' && G.lostT > 0.8) finish(false);
    else if (G && G.step === 'you') C.sel = -1;
    return true;
  }
  // mouse hover (desktop): lifts the card under the pointer
  function hover(ux, uy) {
    if (!C.live || !C.g || C.g.step !== 'you' || C.deckView) { C.hov = -1; return; }
    let hit = -1;
    for (let i = C.btns.length - 1; i >= 0; i--) { const b = C.btns[i]; if (b.card !== undefined && ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) { hit = b.card; break; } }
    if (hit !== C.hov && hit >= 0) sfx('blip', null, 0.2);
    C.hov = hit;
  }

  /* ---------- drawing ---------- */
  function drawWorld(fb, cx, cy, t, back) {
    if (!C.live) return;
    const G = C.g; if (!G) return;
    if (C.arena) { if (back) Arena.drawBack(fb, cx, cy, t, G); else Arena.drawFront(fb, cx, cy, t, G); }
    if (back) return;
    // the shot projectile
    const P = G.shot;
    if (P) {
      const x = lerp(P.x0, P.x1, P.t), y = lerp(P.y0, P.y1, P.t) - Math.sin(P.t * Math.PI) * 10;
      for (let k = 0; k < 6; k++) { const q = Math.max(0, P.t - k * 0.04), X = Math.round(lerp(P.x0, P.x1, q) - cx), Y = Math.round(lerp(P.y0, P.y1, q) - Math.sin(q * Math.PI) * 10 - cy); UI.disc(fb, X, Y, Math.max(1, 4 - k), k ? P.col : WHITE); }
      UI.disc(fb, Math.round(x - cx), Math.round(y - cy), 4, P.col); UI.disc(fb, Math.round(x - cx) - 1, Math.round(y - cy) - 1, 1, WHITE);
    }
  }
  const txt = (fb, s, x, y, c, o = {}) => Font.draw(fb, s, Math.round(x), Math.round(y), c, Object.assign({ font: 'small', outline: INK }, o));
  const head = (m) => Talk.toUI(m.x, m.headPt()[1]);
  const feetUI = (m) => Talk.toUI(m.x, m.y);
  function bar(fb, x, y, w, u, isYou) {
    const h = 7;
    UI.rrect(fb, x - 2, y - 2, w + 4, h + 4, 3, INK);
    UI.rect(fb, x, y, w, h, 0xff30222a);
    const k = clamp(u.shownHp / u.max, 0, 1), k2 = clamp(u.hp / u.max, 0, 1);
    UI.rect(fb, x, y, Math.round(w * k), h, hex('#ffe0a0'));
    UI.rect(fb, x, y, Math.round(w * k2), h, k2 < 0.3 ? hex('#ff4a4a') : isYou ? hex('#4ac860') : hex('#e04a3a'));
    UI.rect(fb, x, y, Math.round(w * k2), 2, 0x55ffffff);
    if (u.blk > 0) UI.rect(fb, x, y + h - 2, w, 2, hex('#6ab0ff'));
    txt(fb, u.hp + '/' + u.max, x + w / 2, y + 1, WHITE, { align: 'center' });
    if (u.blk > 0) { const bx = x - 14; shieldIcon(fb, bx, y - 3, hex('#5a9aff')); txt(fb, String(u.blk), bx + 5, y - 1, WHITE, { align: 'center' }); }
    // statuses
    let sx = x;
    const S = u.st, list = [['weak', 'MUD', '#c09060'], ['vuln', 'DAZE', '#ff8a5a'], ['stun', 'ICE', '#c8f4ff'], ['soak', 'WET', '#5ab4ff'], ['str', 'POW', '#ffd040'], ['rain', 'RAIN', '#8ac8ff'], ['sun', 'SUN', '#ffd040'], ['dizzy', 'DIZ', '#ffb0ff'], ['style', 'STY', '#e0b0ff']];
    for (const [k3, lab, col] of list) if (S[k3] > 0) { const s = lab + ' ' + S[k3], w2 = Font.measure(s, 'small') + 4; if (sx + w2 > x + w + 30) break; UI.rrect(fb, sx, y + h + 3, w2, 9, 2, INK); UI.rrect(fb, sx + 1, y + h + 4, w2 - 2, 7, 1, U.mix(hex(col), INK, 0.55)); txt(fb, s, sx + 2, y + h + 5, hex(col), { outline: undefined }); sx += w2 + 1; }
  }
  function shieldIcon(fb, x, y, c) { UI.rect(fb, x, y, 10, 7, INK); UI.rect(fb, x + 1, y + 7, 8, 2, INK); UI.rect(fb, x + 3, y + 9, 4, 2, INK); UI.rect(fb, x + 1, y + 1, 8, 6, c); UI.rect(fb, x + 2, y + 7, 6, 1, c); UI.rect(fb, x + 4, y + 8, 2, 2, c); UI.rect(fb, x + 2, y + 2, 2, 3, 0x88ffffff); }
  function swordIcon(fb, x, y, c) { for (let i = 0; i < 8; i++) { UI.rect(fb, x + i, y + 8 - i - 1, 3, 3, INK); } for (let i = 0; i < 7; i++) UI.put(fb, x + 1 + i, y + 8 - i, c), UI.put(fb, x + 2 + i, y + 8 - i, c); UI.rect(fb, x, y + 6, 4, 2, hex('#a06a3a')); }
  function star(fb, x, y, c) { x = Math.round(x); y = Math.round(y); UI.put(fb, x, y, WHITE); UI.put(fb, x - 1, y, c); UI.put(fb, x + 1, y, c); UI.put(fb, x, y - 1, c); UI.put(fb, x, y + 1, c); UI.put(fb, x - 2, y, INK); UI.put(fb, x + 2, y, INK); UI.put(fb, x, y - 2, INK); UI.put(fb, x, y + 2, INK); }
  function intentBox(fb, G, x, y, t) {
    const mv = G.intent; if (!mv || G.step === 'ko' || G.step === 'reward' || G.step === 'done' || G.step === 'lost' || G.step === 'intro') return;
    const bob = Math.round(Math.sin(t * 4) * 1.5);
    let s = '', ic = null;
    if (mv.a) { const T = G.them, Y = G.you; let d = mv.a + (T.st.str || 0); if (T.st.weak > 0) d = Math.floor(d * 0.75); if (Y.st.vuln > 0) d = Math.floor(d * 1.5); s = d + (mv.h > 1 ? 'x' + mv.h : ''); ic = 'atk'; }
    else if (mv.b) { s = String(mv.b); ic = 'blk'; }
    else { s = mv.s ? 'BUFF' : 'HEX'; ic = mv.s ? 'buff' : 'deb'; }
    if (G.them.st.stun > 0) { s = 'FROZEN'; ic = 'z'; }
    const w = Font.measure(s, 'small') + 19, X = Math.round(x - w / 2), Y = y + bob;
    const hot = ic === 'atk' && mv.a * (mv.h || 1) >= 9;
    UI.panel(fb, X, Y, w, 14, { r: 4, ol: hot && ((t * 4) | 0) % 2 ? hex('#ffe070') : INK, fill: ic === 'atk' ? hex('#a82a2a') : ic === 'blk' ? hex('#2a4a8a') : hex('#5a3a7a') });
    if (ic === 'atk') swordIcon(fb, X + 3, Y + 2, hex('#e8e8f0'));
    else if (ic === 'blk') shieldIcon(fb, X + 3, Y + 2, hex('#8ac0ff'));
    else if (ic === 'buff') txt(fb, '+', X + 6, Y + 4, hex('#ffd040'));
    else if (ic === 'z') txt(fb, '*', X + 6, Y + 4, hex('#c8f4ff'));
    else txt(fb, '!', X + 6, Y + 4, hex('#ff8aff'));
    txt(fb, s, X + 16, Y + 4, WHITE);
    txt(fb, mv.n, x, Y - 8, hex('#ffe8b0'), { align: 'center' });
  }
  function btn(fb, x, y, w, h, label, col, fn, o = {}) {
    UI.rrect(fb, x, y + 2, w, h, 5, 0xff0a0e1a);
    UI.panel(fb, x, y - (o.on ? 1 : 0), w, h, { r: 5, ol: o.on ? hex('#ffe070') : INK, fill: o.dim ? 0xff505060 : hex(col) });
    txt(fb, label, x + w / 2, y + Math.round(h / 2 - 2) - (o.on ? 1 : 0), WHITE, { align: 'center' });
    C.btns.push({ x: x - 2, y: y - 3, w: w + 4, h: h + 6, fn });
  }
  // sizes for this screen
  function dims(W, H) {
    const cw = clamp(Math.round(Math.min(W * 0.14, H * 0.3)), 54, 84), ch = Math.round(cw * 1.38);
    const bw = Math.round(cw * 1.3), bh = Math.round(bw * 1.38);
    return { cw, ch, bw, bh };
  }
  // one card at (x, y) with width w (the face is picked for crisp text when big)
  function drawCard(fb, id, x, y, w, D, o = {}) {
    const c = def(id), big = w > D.cw * 1.12;
    const fw = big ? D.bw : D.cw, fh = big ? D.bh : D.ch, h = Math.round(w * fh / fw);
    const face = CardArt.face(c, fw, fh);
    if (o.glow) { const gc = o.glow; UI.rrect(fb, Math.round(x) - 2, Math.round(y) - 2, Math.round(w) + 4, h + 4, 6, gc); }
    else UI.rrect(fb, Math.round(x) + 1, Math.round(y) + 3, Math.round(w), h, 5, 0x88000000);
    CardArt.blit(fb, face, x, y, w, h, o);
    return h;
  }
  function drawUI(fb, t) {
    C.btns.length = 0;
    const dtd = Math.min(0.05, Math.max(0, t - (C.lastDraw || t))); C.lastDraw = t;
    const W = fb.w, H = fb.h;
    const G = C.g;
    if (!C.live || !G) return;
    const M = mk(), F = G.foe, D = dims(W, H);
    const bh = C.arena ? Arena.barH(G, H) : Math.round(Math.min(H * 0.08, 22) * ease(C.bars));
    if (C.arena) Arena.drawUnder(fb, t, G);
    else if (bh > 0) { UI.rect(fb, 0, 0, W, bh, 0xff05060c); UI.rect(fb, 0, H - bh, W, bh, 0xff05060c); }
    const battle = G.step === 'you' || G.step === 'them' || G.step === 'ko';
    // impact frame: a white flash + burst lines
    if (G.impact && G.impact.t < 0.3) {
      const I = G.impact, [ix, iy] = Talk.toUI(I.x, I.y), k = I.t / 0.3;
      if (I.t < 0.06 && I.big) UI.rectA(fb, 0, 0, W, H, WHITE, 0.45);
      const R0 = 10 + k * 30, R1 = R0 + (I.big ? 26 : 14);
      for (let a = 0; a < 12; a++) { const an = a / 12 * 6.283 + (a % 2) * 0.2; UI.line(fb, Math.round(ix + Math.cos(an) * R0), Math.round(iy + Math.sin(an) * R0), Math.round(ix + Math.cos(an) * R1), Math.round(iy + Math.sin(an) * R1), a % 2 ? hex('#ffe070') : WHITE); }
      Font.draw(fb, I.word, Math.round(ix), Math.round(iy - 22 - k * 8), I.big ? hex('#ffe040') : WHITE, { font: I.big ? 'title' : 'body', align: 'center', outline: INK });
    }
    if (G.flashT > 0) UI.rectA(fb, 0, 0, W, H, WHITE, Math.min(0.85, G.flashT * 2));
    // HP bars under the feet, intent over the foe
    const bw = clamp(Math.round(W * 0.15), 56, 96);
    if (battle && !G.zoom) {
      const [mx, my] = feetUI(M), [fx, fy] = feetUI(F);
      const yb = (v) => Math.round(clamp(v + 5, bh + 30, H - 46));
      bar(fb, Math.round(mx - bw / 2), yb(my), bw, G.you, true);
      bar(fb, Math.round(fx - bw / 2), yb(fy), bw, G.them, false);
      const [hx, hy] = head(F);
      intentBox(fb, G, fx, Math.round(clamp(hy - 22, bh + 12, H - 80)), t);
    }
    // faces: anger veins, sweat, shock lines, smug sparkles, dizzy stars
    if (C.arena) Arena.drawFaces(fb, t, G, head);
    else for (const [u, m] of [[G.you, M], [G.them, F]]) if (u.dizzyT > 0) { const [hx, hy] = head(m); for (let s = 0; s < 3; s++) { const an = t * 5 + s * 2.09; star(fb, hx + Math.cos(an) * 10, hy - 4 + Math.sin(an) * 3, [hex('#ffe040'), hex('#ff8aff'), hex('#8affff')][s]); } }
    // shield sparkle
    if (G.shieldT > 0) { const [hx, hy] = head(M); UI.ring(fb, Math.round(hx), Math.round(hy + 12), Math.round(14 + (0.6 - G.shieldT) * 10), hex('#9ac8ff')); }
    if (G.foeShieldT > 0) { const [hx, hy] = head(F); UI.ring(fb, Math.round(hx), Math.round(hy + 12), Math.round(14 + (0.6 - G.foeShieldT) * 10), hex('#9ac8ff')); }
    // damage numbers
    for (const p of G.pops) {
      const [ux, uy0] = Talk.toUI(p.x, p.y), uy = clamp(uy0, bh + 44, H - 50), k = p.t / 1.3, jump = p.t < 0.15 ? p.t / 0.15 : 1;
      const yy = uy - 8 - jump * 10 - k * 12;
      if (k > 0.8 && ((t * 20) | 0) % 2) continue;
      Font.draw(fb, p.txt, Math.round(ux), Math.round(yy), p.col, { font: p.big ? 'title' : 'body', align: 'center', outline: INK });
    }
    drawBubbles(fb, t, G, M, F);
    // title + flee / deck buttons in the top bar
    if (battle) {
      const ty = Math.max(3, Math.round(bh / 2 - 4));
      Font.draw(fb, (G.step === 'reward' ? 'VICTORY! ' : (C.arena ? 'BOSS: ' : 'vs. ')) + nameOf(F).toUpperCase(), W / 2, ty, hex('#ffe070'), { font: 'body', align: 'center', outline: INK });
      if (G.step !== 'reward' && G.step !== 'ko') {
        const lb = 'FLEE', lw = Font.measure(lb, 'small') + 12; btn(fb, 5, Math.max(3, ty - 3), lw, 13, lb, '#46505e', flee);
        const dl = 'DECK ' + (G.draw.length + G.disc.length + G.hand.length), dw = Font.measure(dl, 'small') + 12;
        btn(fb, W - dw - 5, Math.max(3, ty - 3), dw, 13, dl, '#46505e', () => { C.deckView = !C.deckView; sfx('page'); });
      }
    }
    if (C.deckView) { drawDeck(fb, t); return; }
    if (G.step === 'reward') { drawReward(fb, t); if (C.arena) Arena.drawOver(fb, t, G); return; }
    if (G.step === 'lost') { if (C.arena) Arena.drawOver(fb, t, G); drawLost(fb, t, G); return; }
    drawHand(fb, t, G, D, dtd);
    if (C.arena) Arena.drawOver(fb, t, G);
    if (G.over && !C.arena) {
      const w = 180, h = 40, x = Math.round(W / 2 - w / 2), y = Math.round(H * 0.3);
      UI.panel(fb, x, y, w, h, { r: 8, ol: INK, fill: G.win ? 0xff2a7a3a : 0xff3a2a6a });
      Font.draw(fb, G.win ? 'YOU WIN!' : G.fled ? 'GOT AWAY!' : 'MUDKIP FAINTED...', W / 2, y + 7, G.win ? hex('#ffe070') : WHITE, { font: 'title', align: 'center', outline: INK });
      txt(fb, G.msg || '', W / 2, y + 26, WHITE, { align: 'center' });
    }
  }
  // comic speech bubbles (big shouty ones during zoom-ins)
  function drawBubbles(fb, t, G, M, F) {
    for (const b of G.bubbles) {
      const m = b.who === 'you' ? M : F, [x, y] = head(m);
      const zoomed = G.zoom && G.zoom.who === b.who;
      const font = zoomed ? 'body' : 'small', maxW = zoomed ? Math.round(fb.w * 0.36) : 96;
      const lines = Font.wrap(b.text, font, maxW), lh = zoomed ? 12 : 9;
      const w = Math.max(...lines.map((l) => Font.measure(l, font))) + (zoomed ? 16 : 10), h = lines.length * lh + (zoomed ? 9 : 6);
      const pop = b.t < 0.12 ? (1 - b.t / 0.12) : 0, sc = 1 + pop * 0.3;
      const side = b.who === 'you' ? -1 : 1;
      let bx = zoomed ? x + side * 26 - w / 2 : x - w / 2, by = y - h - (zoomed ? 18 : 10) - pop * 6;
      bx = Math.round(clamp(bx, 4, fb.w - w - 4)); by = Math.round(clamp(by, 16, fb.h - h - 30));
      if (b.t > b.life - 0.12 && Math.floor(b.t * 30) % 2) continue;
      const fill = WHITE;
      if (b.shout && zoomed) { // jagged shout bubble
        const cx = bx + w / 2, cy = by + h / 2, rx = w / 2 + 6, ry = h / 2 + 5;
        for (let yy = -ry - 3; yy <= ry + 3; yy++) for (let xx = -rx - 3; xx <= rx + 3; xx++) {
          const a = Math.atan2(yy / ry, xx / rx), d = Math.hypot(xx / rx, yy / ry), R = 1 + 0.14 * Math.abs(((a / Math.PI * 7 + 20) % 2) - 1) * 2 - 0.1;
          if (d <= R * sc) UI.put(fb, Math.round(cx + xx), Math.round(cy + yy), d > R * sc - 0.12 ? INK : fill);
        }
      } else {
        UI.rrect(fb, bx - 1, by - 1, w + 2, h + 2, 5, INK); UI.rrect(fb, bx, by, w, h, 4, fill);
      }
      const tx = Math.round(clamp(x, bx + 6, bx + w - 6));
      for (let i = 0; i < 5; i++) { const r = Math.max(0, 3 - Math.floor(i * 0.8)), ox = Math.round((tx - x) * -0.1 * i); UI.hline(fb, tx - r + ox, tx + r + ox, by + h - 1 + i, fill); UI.put(fb, tx - r - 1 + ox, by + h - 1 + i, INK); UI.put(fb, tx + r + 1 + ox, by + h - 1 + i, INK); }
      lines.forEach((l, i) => Font.draw(fb, l, bx + w / 2, by + (zoomed ? 5 : 3) + i * lh, INK, { font, align: 'center' }));
    }
  }
  function drawHand(fb, t, G, D, dt) {
    const W = fb.w, H = fb.h, n = G.hand.length, k = ease(G.handK);
    const off = Math.round((1 - k) * (D.ch + 20));
    const margin = 72, maxW = W - margin * 2;
    const step = n > 1 ? Math.min(D.cw + 3, (maxW - D.cw) / (n - 1)) : 0;
    const x0 = Math.round(W / 2 - ((n - 1) * step + D.cw) / 2), yRest = H - Math.round(D.ch * 0.58) + off;
    const lift = C.hov >= 0 && C.hov < n ? C.hov : C.sel >= 0 && C.sel < n ? C.sel : -1;
    const my = G.step === 'you' && !G.seq;
    const pileX = 18, pileY = H - 22, discX = W - 20, discY = H - 22;
    const sm = 1 - Math.exp(-dt * 16);
    // layout targets (neighbours of the lifted card make room)
    for (let i = 0; i < n; i++) {
      const h = G.hand[i], mid = i - (n - 1) / 2;
      let tx = x0 + i * step, ty = yRest + Math.round(mid * mid * 1.1), tw = D.cw;
      if (lift >= 0 && i !== lift) tx += Math.sign(i - lift) * Math.min(16, (D.bw - step) * 0.5 + 2);
      if (i === lift && my) { tw = D.bw; tx = clamp(tx + D.cw / 2 - D.bw / 2, 2, W - D.bw - 2); ty = H - D.bh - 4 + off; }
      if (h.x === null) { h.x = pileX - 6; h.y = pileY - 8; h.w = 12; }
      if (h.delay > 0) continue;
      h.x += (tx - h.x) * sm; h.y += (ty - h.y) * sm; h.w += (tw - h.w) * sm;
      h.lift = i === lift ? 1 : 0;
    }
    // the piles
    const pb = CardArt.back(14, 19);
    CardArt.blit(fb, pb, pileX - 7, pileY - 10 + off, 14, 19); txt(fb, String(G.draw.length), pileX + 11, pileY - 3 + off, WHITE);
    if (G.disc.length) { const f = CardArt.back(14, 19); CardArt.blit(fb, f, discX - 7, discY - 10 + off, 14, 19, { dim: 0.45 }); }
    else UI.rrect(fb, discX - 7, discY - 10 + off, 14, 19, 3, 0x66000000);
    txt(fb, String(G.disc.length), discX - 11, discY - 3 + off, 0xffc0c8d8, { align: 'right' });
    // hand: lifted card on top
    const order = G.hand.map((h, i) => i).filter((i) => i !== lift); if (lift >= 0) order.push(lift);
    for (const i of order) {
      const h = G.hand[i]; if (h.delay > 0) continue;
      const ok = canPlay(G, i), sel = i === lift;
      const flip = clamp(h.t / 0.22, 0, 1), sx = h.shake ? Math.sin(h.shake * 60) * 3 : 0;
      const w = h.w, hh = Math.round(w * 1.38);
      if (flip < 0.5) { const fw = w * (1 - flip * 2); CardArt.blit(fb, CardArt.back(D.cw, D.ch), h.x + (w - fw) / 2, h.y, fw, hh); continue; }
      const fw = w * Math.min(1, (flip - 0.5) * 2);
      const glow = sel && my ? (ok ? (((t * 3) | 0) % 2 ? hex('#8affff') : hex('#5ad8ff')) : hex('#ff6a5a')) : (ok && my && G.energy > 0 ? 0 : 0);
      drawCard(fb, h.id, h.x + (w - fw) / 2 + sx, h.y, fw, D, { dim: !ok && my ? 0.45 : 0, glow: glow || 0 });
      if (n <= 9 && !(Pad && Pad.touch) && sel) txt(fb, String(i + 1), h.x + w / 2, h.y - 8, hex('#ffe070'), { align: 'center' });
      // hit area: the visible strip of each card (the lifted one: whole card)
      const hw = sel ? w : Math.max(10, Math.round(step));
      C.btns.push({ x: Math.round(h.x), y: Math.round(h.y) - 4, w: Math.round(hw), h: hh + 8, card: i, fn: () => {
        if (G.step !== 'you' || G.seq) return;
        const touch = typeof Pad !== 'undefined' && Pad.touch;
        if (!touch || C.sel === i) play(i); else { C.sel = i; C.hov = -1; sfx('blip', null, 0.4); }
      } });
    }
    // keyword tips next to the lifted card
    if (lift >= 0 && my && G.hand[lift] && G.hand[lift].w > D.cw * 1.15) tips(fb, def(G.hand[lift].id), G.hand[lift].x, G.hand[lift].y, G.hand[lift].w);
    // cards in flight: played (to the centre, then at the target), discarded (to the pile)
    for (const f of G.fly) {
      if (f.t < 0) continue;
      if (f.kind === 'disc') {
        const q = ease(f.t / 0.4), w = lerp(f.w, 12, q);
        CardArt.blit(fb, CardArt.face(def(f.id), D.cw, D.ch), lerp(f.x, discX - 6, q), lerp(f.y, discY - 8, q) - Math.sin(q * Math.PI) * 16, w, w * 1.38, { alpha: 1 - q * 0.5, dim: q * 0.4 });
        continue;
      }
      const cxw = W / 2 - D.bw * 0.6, cyw = H * 0.42 - D.bh * 0.6;
      let x, y, w, a = 1, fl = 0;
      if (f.t < 0.2) { const q = ease(f.t / 0.2); x = lerp(f.x, cxw, q); y = lerp(f.y, cyw, q); w = lerp(f.w, D.bw * 1.2, q); }
      else if (f.t < 0.36) { x = cxw; y = cyw - (f.t - 0.2) * 12; w = D.bw * 1.2; fl = Math.max(0, 1 - (f.t - 0.2) * 12) * 0.5; }
      else {
        const q = U.ease.inCubic((f.t - 0.36) / 0.26), [tx, ty] = targetUI(G, f.tgt, W, H);
        x = lerp(cxw, tx, q); y = lerp(cyw, ty, q); w = lerp(D.bw * 1.2, 10, q); a = 1 - q * 0.3; fl = q * 0.7;
      }
      if (f.kind === 'play' && f.t > 0.36) for (let k = 1; k <= 3; k++) { const q = U.ease.inCubic(Math.max(0, (f.t - 0.36 - k * 0.025) / 0.26)), [tx, ty] = targetUI(G, f.tgt, W, H); UI.disc(fb, Math.round(lerp(cxw + D.bw * 0.6, tx + 5, q)), Math.round(lerp(cyw + D.bh * 0.6, ty + 7, q)), Math.max(1, 4 - k), k === 1 ? WHITE : hex('#8affff')); }
      drawCard(fb, f.id, x, y, w, D, { alpha: a, flash: fl });
    }
    // UI sparks
    for (const p of G.parts) { const k = p.t / p.life; if (k > 0.7 && ((t * 24) | 0) % 2) continue; UI.disc(fb, Math.round(p.x), Math.round(p.y), p.r * (1 - k * 0.6) | 0, p.c); }
    // energy orb (left) and end turn (right)
    const ex = 30, ey = H - 52 + off, e = G.energy;
    UI.disc(fb, ex, ey, 19, INK); UI.disc(fb, ex, ey, 17, e ? hex('#e8701a') : hex('#5a3a2a'));
    UI.disc(fb, ex - 2, ey - 2, 13, e ? hex('#ff9a2a') : hex('#6a4a3a')); UI.disc(fb, ex - 6, ey - 7, 4, 0x66ffffff);
    for (let k = 0; k < 8; k++) { const an = t * 1.5 + k * 0.785; if (e) UI.put(fb, Math.round(ex + Math.cos(an) * 18), Math.round(ey + Math.sin(an) * 18), hex('#ffd070')); }
    Font.draw(fb, e + '/' + G.maxE, ex, ey - 6, WHITE, { font: 'title', align: 'center', outline: INK });
    const noMoves = my && !G.hand.some((h, i) => canPlay(G, i));
    const ew = 66, eh = 22;
    btn(fb, W - ew - 6, H - 60 + off, ew, eh, my ? 'END TURN' : G.step === 'them' ? 'FOE TURN' : '...', my ? (noMoves ? '#3ab860' : '#2a8a4a') : '#46505e', endTurn, { dim: !my, on: noMoves && ((t * 3) | 0) % 2 === 0 });
    if (G.step === 'you' && G.turn === 1 && !G.seq && G.handK > 0.9) txt(fb, typeof Pad !== 'undefined' && Pad.touch ? 'TAP A CARD, TAP AGAIN TO PLAY' : 'CLICK A CARD TO PLAY  (1-9 / ARROWS + SPACE, E ENDS TURN)', W / 2, Math.round(H * 0.1) + 6, 0xffd8e0f0, { align: 'center' });
  }
  function targetUI(G, tgt, W, H) {
    if (tgt === 'up') return [W / 2 - 5, -20];
    const m = tgt === 'you' ? mk() : G.foe, [x, y] = head(m);
    return [x - 5, y + 6];
  }
  function flyBurst(G, f) {
    const W = Game.UW, H = Game.UH, [x, y] = targetUI(G, f.tgt, W, H), c = def(f.id);
    const col = hex(c.kind === 'atk' ? '#ff8a6a' : c.kind === 'power' ? '#ffd040' : c.kind === 'silly' ? '#e0a0ff' : '#8ad0ff');
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; G.parts.push({ x: x + 5, y: y + 7, vx: Math.cos(a) * rnd(40, 90), vy: Math.sin(a) * rnd(40, 90) - 20, g: 120, t: 0, life: rnd(0.3, 0.55), r: 2, c: k % 2 ? WHITE : col }); }
  }
  // keyword explanations beside a lifted card
  function tips(fb, c, x, y, w) {
    const ks = keywords(c); if (!ks.length) return;
    const W = fb.w, tw = 92;
    let tx = x + w + 4; if (tx + tw > W - 4) tx = x - tw - 4;
    let ty = y + 2;
    for (const k of ks) {
      const [nm, d] = KW[k], lines = Font.wrap(d, 'small', tw - 8), h = 12 + lines.length * 8;
      UI.rrect(fb, tx, ty, tw, h, 3, INK); UI.rrect(fb, tx + 1, ty + 1, tw - 2, h - 2, 2, hex('#2a2438'));
      txt(fb, nm, tx + 4, ty + 3, hex(GOLD), { outline: undefined });
      lines.forEach((l, i) => txt(fb, l, tx + 4, ty + 11 + i * 8, 0xffd8e0f0, { outline: undefined }));
      ty += h + 2;
    }
  }
  function drawReward(fb, t) {
    const G = C.g, W = fb.w, H = fb.h, R = G.reward, D = dims(W, H);
    const k = ease(R.t / 0.5);
    UI.rectA(fb, 0, 0, W, H, 0xff05060c, 0.55 * k);
    const ty = Math.round(H * 0.12);
    Font.draw(fb, 'VICTORY!', W / 2, ty - Math.round((1 - k) * 20), hex('#ffe070'), { font: 'title', align: 'center', outline: INK, sc: W >= 420 && H >= 250 ? 2 : 1 });
    Font.draw(fb, 'Choose a reward', W / 2, ty + (H >= 250 ? 26 : 16), WHITE, { font: 'small', align: 'center', outline: INK });
    const n = R.opts.length, cw = D.bw, ch = D.bh, gap = Math.max(10, Math.round(W * 0.04));
    const x0 = Math.round(W / 2 - (cw * n + gap * (n - 1)) / 2), y0 = ty + (H >= 250 ? 42 : 30);
    R.opts.forEach((o, i) => {
      const sel = C.sel === i, x = x0 + i * (cw + gap), y = y0 - (sel ? 4 : 0) + Math.round(Math.sin(t * 3 + i) * 1.5) + Math.round((1 - ease((R.t - i * 0.08) / 0.25)) * H);
      drawCard(fb, o.t === 'up' ? o.to : o.id, x, y, cw, D, { glow: sel ? hex('#ffe070') : 0, dim: 0 });
      // label ribbon
      const lab = o.lab, lw = Font.measure(lab, 'small') + 10, lx = Math.round(x + cw / 2 - lw / 2), ly = y - 12;
      const lc = o.t === 'rm' ? '#c83a3a' : o.t === 'hp' ? '#3a9a58' : o.t === 'tm' ? '#2a8ab8' : '#c8901a';
      UI.rrect(fb, lx, ly, lw, 10, 3, INK); UI.rrect(fb, lx + 1, ly + 1, lw - 2, 8, 2, hex(lc)); txt(fb, lab, x + cw / 2, ly + 2, WHITE, { align: 'center', outline: undefined });
      if (o.t === 'rm') { // a big red stamp
        const sx = x + cw / 2, sy = y + ch * 0.42;
        for (let d = -2; d <= 2; d++) { UI.line(fb, Math.round(sx - cw * 0.3), Math.round(sy - cw * 0.3) + d, Math.round(sx + cw * 0.3), Math.round(sy + cw * 0.3) + d, hex('#e83a3a')); UI.line(fb, Math.round(sx + cw * 0.3), Math.round(sy - cw * 0.3) + d, Math.round(sx - cw * 0.3), Math.round(sy + cw * 0.3) + d, hex('#e83a3a')); }
      }
      if (o.t === 'up') txt(fb, '> ' + (def(o.to).short || def(o.to).name), x + cw / 2, y + ch + 3, hex(GRN), { align: 'center' });
      else if (o.t === 'rm') txt(fb, 'Thin your deck', x + cw / 2, y + ch + 3, 0xffffc0c0, { align: 'center' });
      else if (o.t === 'tm') txt(fb, '+1 copy', x + cw / 2, y + ch + 3, hex('#8ad8ff'), { align: 'center' });
      else txt(fb, 'Max HP ' + maxHP() + ' > ' + (maxHP() + 4), x + cw / 2, y + ch + 3, hex('#8aff8a'), { align: 'center' });
      C.btns.push({ x, y: y - 12, w: cw, h: ch + 24, fn: () => takeReward(i) });
    });
    const sw = 56, sy = Math.min(H - 20, y0 + ch + 16);
    btn(fb, Math.round(W / 2 - sw / 2), sy, sw, 14, 'SKIP', '#46505e', () => takeReward(-1), { on: C.sel === n });
    if (!tmMoves().length) txt(fb, 'Learn TMs out in the world: each TM becomes a new card!', W / 2, Math.min(H - 4, sy + 18) - 2, hex(GOLD), { align: 'center' });
  }
  function drawLost(fb, t, G) {
    const W = fb.w, H = fb.h, k = ease(G.lostT / 0.6);
    UI.rectA(fb, 0, 0, W, H, hex('#1a0a18'), 0.5 * k);
    const wob = (i) => Math.round(Math.sin(t * 6 + i * 0.7) * 2);
    const title = 'MUDKIP FAINTED!', sc = W >= 420 && H >= 250 ? 2 : 1, tw = Font.measure(title, 'title', sc);
    let x = W / 2 - tw / 2; const y = Math.round(H * 0.16 - (1 - k) * 30);
    for (let i = 0; i < title.length; i++) { const ch = title[i]; Font.draw(fb, ch, Math.round(x), y + wob(i), hex(i % 2 ? '#ff8a8a' : '#ffd0d0'), { font: 'title', outline: INK, sc }); x += Font.measure(ch, 'title', sc); }
    const gy = y + (sc > 1 ? 30 : 18);
    Font.draw(fb, G.gag || '', W / 2, gy, WHITE, { font: 'body', align: 'center', outline: INK });
    txt(fb, 'Turns: ' + G.turn + '   Damage dealt: ' + G.dealt + '   ' + nameOf(G.foe) + ' HP left: ' + G.them.hp, W / 2, gy + 14, 0xffd8c0e0, { align: 'center' });
    // the chalk outline gag around the flat Mudkip
    const [mx, my] = feetUI(mk());
    if (G.lostT > 0.4) { for (let a = 0; a < 6.28; a += 0.08) { const r = 18 + Math.sin(a * 5) * 3; if (((a * 12) | 0) % 2) UI.put(fb, Math.round(mx + Math.cos(a) * r * 1.3), Math.round(my - 5 + Math.sin(a) * r * 0.45), 0xddffffff); } }
    if (G.lostT > 0.8) {
      const bw = 110, bx = Math.round(W / 2 - bw / 2), by = H - 40;
      btn(fb, bx, by, bw, 18, 'TRY AGAIN LATER', '#8a3a5a', () => finish(false), { on: ((t * 2) | 0) % 2 === 0 });
      txt(fb, 'Tip: ' + pick2(G, ['Block before big hits (check the intent!)', 'Learn TMs in the world for new cards', 'Upgraded cards have green numbers', 'Splash does nothing. You knew that.']), W / 2, by - 10, hex(GOLD), { align: 'center' });
    }
  }
  const pick2 = (G, a) => a[(G.turn + G.dealt) % a.length];
  function drawDeck(fb, t) {
    const W = fb.w, H = fb.h, G = C.g;
    UI.rectA(fb, 0, 0, W, H, 0xff05060c, 0.86);
    const all = battleDeck(), counts = {};
    for (const id of all) counts[id] = (counts[id] || 0) + 1;
    const ORD = { atk: 0, skill: 1, power: 2, silly: 3, item: 4 };
    const ids = Object.keys(counts).sort((a, b) => (ORD[def(a).kind] - ORD[def(b).kind]) || (def(a).cost - def(b).cost) || (a > b ? 1 : -1));
    Font.draw(fb, 'YOUR DECK  (' + all.length + ' cards)', W / 2, 20, WHITE, { font: 'body', align: 'center', outline: INK });
    const cols = Math.min(ids.length, Math.max(4, Math.floor((W - 16) / 60)));
    const rows = Math.ceil(ids.length / cols);
    const cw = clamp(Math.min(Math.floor((W - 16) / cols) - 6, Math.floor(((H - 60) / rows - 6) / 1.38)), 40, 76), ch = Math.round(cw * 1.38);
    const D = { cw, ch, bw: cw, bh: ch };
    const x0 = Math.round(W / 2 - (cols * (cw + 6) - 6) / 2), y0 = 34;
    ids.forEach((id, i) => {
      const x = x0 + (i % cols) * (cw + 6), y = y0 + Math.floor(i / cols) * (ch + 6);
      drawCard(fb, id, x, y, cw, D, {});
      if (counts[id] > 1) { UI.disc(fb, x + cw - 3, y + ch - 3, 7, INK); UI.disc(fb, x + cw - 3, y + ch - 3, 6, hex('#ffd24a')); Font.draw(fb, 'x' + counts[id], x + cw - 3, y + ch - 6, INK, { font: 'small', align: 'center' }); }
    });
    const hint = tmMoves().length ? 'TM cards come from moves you learn in the world' : 'Learn TMs in the world to unlock new cards!';
    txt(fb, hint + (G ? '  ·  tap or D to close' : ''), W / 2, H - 10, hex(GOLD), { align: 'center' });
    C.btns.push({ x: 0, y: 20, w: W, h: H - 20, fn: () => { C.deckView = false; } });
  }

  /* ---------- borrow the Arcade cutscene hooks ---------- */
  // Arcade's update/drive/key/down/draw are already wired into main.js, pad.js and hud.js;
  // while a card battle runs, Arcade.live is true and these wrappers route to Cards instead.
  if (typeof Arcade !== 'undefined') {
    const orig = { update: Arcade.update, drive: Arcade.drive, freeMove: Arcade.freeMove, key: Arcade.key, down: Arcade.down, drawWorld: Arcade.drawWorld, drawUI: Arcade.drawUI };
    const mine = () => C.live;
    Arcade.update = (dt) => { if (typeof Territory !== 'undefined') Territory.update(dt); if (mine()) update(dt); else { if (C.bars > 0) update(dt); orig.update(dt); } };
    Arcade.drive = (M, dt) => (mine() ? drive(M, dt) : orig.drive(M, dt));
    Arcade.freeMove = () => (mine() ? false : orig.freeMove());
    Arcade.key = (k, e) => (mine() ? key(k, e) : orig.key(k, e));
    Arcade.down = (x, y) => (mine() ? down(x, y) : orig.down(x, y));
    Arcade.drawWorld = (fb, cx, cy, t, back) => (mine() ? drawWorld(fb, cx, cy, t, back) : orig.drawWorld(fb, cx, cy, t, back));
    Arcade.drawUI = (fb, t) => (mine() ? drawUI(fb, t) : orig.drawUI(fb, t));
  }
  // mouse hover lifts cards (HUD.hover gets the pointer when no button is held)
  if (typeof HUD !== 'undefined' && HUD.hover) { const h0 = HUD.hover; HUD.hover = function (x, y) { if (C.live) { hover(x, y); return; } return h0.apply(this, arguments); }; }
  U.on && U.on('area', () => { if (C.live) close(); C.bars = 0; });
  return Object.assign(C, { CARDS, FOES, STARTER, def, describe, start, play, endTurn, takeReward, flee, close, update, key, down, hover, drawUI, drawWorld, store, battleDeck, tmMoves, foeDef, canPlay, maxHP, rollRewards });
})();
