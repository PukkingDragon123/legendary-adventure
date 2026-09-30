/* ------------------------------------------------------------------
   Cards — "Mudkip Spire": a goofy card battle, played in the world as
   a little cutscene (letterbox bars, the camera frames Mudkip and the
   foe). Slay-the-Spire style:
    · 3 energy a turn, draw 5 cards; attack / block / status / silly
      cards (Belly Flop, Mud Sport, Splash — does nothing, with style)
      and TM cards for every move Mudkip has learned (Moves.has)
    · the foe shows its INTENT above its head (attack N, block, buff,
      debuff) so you can plan
    · win → pick 1 of 3 card rewards (rarer from stronger Pokémon);
      the deck persists in Save.data.cards and can be viewed (D)
    · lots of juice: squash & stretch lunges, bonks, impact frames,
      screen shake, damage numbers, dizzy stars
   Controls: 1-9 play a card, arrows + Space select/play, E end turn,
   D deck, Esc flee. Touch: tap a card to lift it, tap again to play.
   Cards.start(foe, {onEnd(win)}) — used by Territory.
   It borrows the Arcade cutscene hooks (update/drive/key/down/draw),
   so main.js, pad.js and hud.js need no changes.
------------------------------------------------------------------- */
const Cards = (() => {
  const { clamp, rnd, pick, lerp, hex } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const C = { live: false, g: null, bars: 0, btns: [], sel: -1, deckView: false, t: 0 };
  const mk = () => Game.mudkip;
  const nameOf = (m) => (m && DexData.S[m.dex] ? DexData.S[m.dex].name : 'Pokémon');
  const say = (m, text, life = 1.6) => { if (m && typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), text, { life, who: m }); };
  const sfx = (n, x, v = 1) => { try { Game.sfx(n, x, v); } catch (e) { /* no audio */ } };

  /* ---------- the cards ---------- */
  // kind: atk | blk | skill | silly ; r: 0 starter, 1 common, 2 uncommon, 3 rare
  const COL = { atk: '#e0503a', blk: '#3a7ae0', skill: '#3aa860', silly: '#a050d0' };
  const CARDS = {
    tackle: { name: 'Tackle', cost: 1, kind: 'atk', r: 0, dmg: 6, desc: 'Deal 6.', anim: 'bonk' },
    shield: { short: 'Shield', name: 'Mud Shield', cost: 1, kind: 'blk', r: 0, blk: 5, desc: 'Block 5.' },
    splash: { name: 'Splash', cost: 0, kind: 'silly', r: 0, style: 1, desc: 'Does nothing. With style.', anim: 'splash' },
    flop: { short: 'Flop', name: 'Belly Flop', cost: 2, kind: 'atk', r: 0, dmg: 13, self: 2, desc: 'Deal 13. Ow: take 2.', anim: 'flop' },
    mudsport: { short: 'Mud Sport', name: 'Mud Sport', cost: 1, kind: 'skill', r: 0, blk: 4, fx: { weak: 2 }, desc: 'Block 4. Foe Muddy 2.' },
    // TM cards (added while Mudkip knows the move)
    water: { name: 'Water Gun', cost: 1, kind: 'atk', r: 0, dmg: 5, fx: { soak: 1 }, desc: 'Deal 5. Soaked 1.', anim: 'shot', tm: 'water', shot: '#5ab4ff' },
    sing: { name: 'Sing', cost: 1, kind: 'skill', r: 0, fx: { drowsy: 1 }, desc: 'Foe may doze off.', anim: 'sing', tm: 'sing' },
    bubble: { name: 'Bubble', cost: 1, kind: 'atk', r: 0, dmg: 3, hits: 2, desc: 'Deal 3 twice.', anim: 'shot', tm: 'bubble', shot: '#bfe8ff' },
    growl: { name: 'Growl', cost: 0, kind: 'skill', r: 0, fx: { weak: 1 }, draw: 1, desc: 'Muddy 1. Draw 1.', anim: 'growl', tm: 'growl' },
    dig: { name: 'Dig', cost: 2, kind: 'blk', r: 0, blk: 9, buff: { str: 2 }, desc: 'Block 9. +2 Power.', anim: 'dig', tm: 'dig' },
    smash: { short: 'Smash', name: 'Rock Smash', cost: 2, kind: 'atk', r: 0, dmg: 9, pierce: true, fx: { vuln: 1 }, desc: 'Deal 9, breaks Block. Dazed 1.', anim: 'bonk', tm: 'smash' },
    ice: { name: 'Ice Beam', cost: 2, kind: 'atk', r: 0, dmg: 7, fx: { stun: 1 }, desc: 'Deal 7. Freeze: skip 1 turn.', anim: 'shot', tm: 'ice', shot: '#c8f4ff', exhaust: true },
    // rewards
    mudslap: { name: 'Mud-Slap', cost: 1, kind: 'atk', r: 1, dmg: 4, fx: { weak: 1 }, desc: 'Deal 4. Muddy 1.', anim: 'bonk' },
    doubleteam: { short: 'Dbl Team', name: 'Double Team', cost: 1, kind: 'blk', r: 1, blk: 5, draw: 1, desc: 'Block 5. Draw 1.' },
    snack: { short: 'Snack', name: 'Snack Break', cost: 1, kind: 'skill', r: 1, heal: 5, desc: 'Heal 5. Nom.', anim: 'snack', exhaust: true },
    pose: { short: 'Pose!', name: 'Dramatic Pose', cost: 0, kind: 'silly', r: 1, style: 3, draw: 1, desc: 'Style +3. Draw 1.', anim: 'splash' },
    cuteeyes: { name: 'Cute Eyes', cost: 0, kind: 'silly', r: 1, fx: { weak: 2 }, desc: 'Muddy 2. Aww.', anim: 'growl', exhaust: true },
    rollout: { name: 'Rollout', cost: 1, kind: 'atk', r: 2, dmg: 4, grow: 3, desc: 'Deal 4. +3 each use.', anim: 'roll' },
    mudbomb: { name: 'Mud Bomb', cost: 2, kind: 'atk', r: 2, dmg: 9, fx: { weak: 2 }, desc: 'Deal 9. Muddy 2.', anim: 'shot', shot: '#8a5a2a' },
    aquaring: { short: 'Aqua Ring', name: 'Aqua Ring', cost: 1, kind: 'skill', r: 2, buff: { regen: 3 }, desc: 'Heal 3 a turn, 3 turns.', exhaust: true },
    protect: { name: 'Protect', cost: 2, kind: 'blk', r: 2, blk: 14, desc: 'Block 14.' },
    mudshot: { name: 'Mud Shot', cost: 1, kind: 'atk', r: 2, dmg: 5, fx: { vuln: 1 }, desc: 'Deal 5. Dazed 1.', anim: 'shot', shot: '#a8743a' },
    surf: { name: 'Surf', cost: 2, kind: 'atk', r: 3, dmg: 16, desc: 'Deal 16. Cowabunga.', anim: 'flop' },
    hydro: { short: 'Hydro', name: 'Hydro Pump', cost: 3, kind: 'atk', r: 3, dmg: 26, desc: 'Deal 26!!', anim: 'shot', shot: '#3a8aff' },
    faint: { short: 'Faint', name: 'Fake Faint', cost: 1, kind: 'silly', r: 3, blk: 10, fx: { stun: 1 }, desc: 'Block 10. Foe is confused: skips a turn.', anim: 'faint', exhaust: true },
    tantrum: { short: 'Tantrum', name: 'Tiny Tantrum', cost: 1, kind: 'atk', r: 3, dmg: 2, hits: 5, desc: 'Deal 2, five times!', anim: 'bonk' },
  };
  const STARTER = ['tackle', 'tackle', 'tackle', 'shield', 'shield', 'shield', 'splash', 'flop', 'mudsport'];
  const TM_CARDS = ['water', 'sing', 'bubble', 'growl', 'dig', 'smash', 'ice'];
  const REWARD = Object.keys(CARDS).filter((k) => CARDS[k].r > 0);

  /* ---------- the foes (by species; anything else gets a generic profile) ---------- */
  // moves: a = attack v (hits n), b = block v, w = weaken you, v = daze you, s = strengthen self, d = dizzy (you draw 1 fewer)
  const FOES = {
    crawdaunt: { hp: 46, tier: 2, moves: [{ n: 'Crabhammer', a: 9 }, { n: 'Harden', b: 9, s: 1 }, { n: 'Double Snip', a: 4, h: 2 }, { n: 'Leer', v: 2 }], taunt: ['*SNAP* My beach, shrimp!', 'You want a pinch?'] },
    sharpedo: { hp: 44, tier: 3, moves: [{ n: 'Bite', a: 8 }, { n: 'Aqua Jet', a: 5, h: 2 }, { n: 'Scary Face', w: 2 }, { n: 'Crunch', a: 13 }], taunt: ['*CHOMP CHOMP*', 'Nice tail. Mine now.'] },
    walrein: { hp: 60, tier: 3, moves: [{ n: 'Body Slam', a: 11 }, { n: 'Blubber', b: 12 }, { n: 'Ice Fang', a: 7, d: 1 }, { n: 'Rest', b: 6, s: 2 }], taunt: ['*HUFF* This rock is taken.', 'BLORF.'] },
    vigoroth: { hp: 40, tier: 2, moves: [{ n: 'Fury Swipes', a: 2, h: 4 }, { n: 'Scratch', a: 6 }, { n: 'Hyper!', s: 2 }, { n: 'Slash', a: 9 }], taunt: ['VIGO VIGO VIGO!', 'Can\'t stop! Won\'t stop!'] },
    breloom: { hp: 42, tier: 2, moves: [{ n: 'Mach Punch', a: 7 }, { n: 'Spore', d: 1, w: 1 }, { n: 'Mega Drain', a: 5, b: 5 }, { n: 'Bulk Up', s: 2, b: 4 }], taunt: ['Hup! Hup! Put \'em up!', '*shadowboxes*'] },
    torkoal: { hp: 48, tier: 2, moves: [{ n: 'Smog', w: 2, a: 3 }, { n: 'Iron Defense', b: 12 }, { n: 'Flame Wheel', a: 9 }, { n: 'Smokescreen', d: 1, b: 4 }], taunt: ['*PUFF* Hot spring\'s full!', '*cough cough*'] },
    slaking: { hp: 70, tier: 3, moves: [{ n: 'Yawn', d: 1 }, { n: 'Slack Off', b: 10 }, { n: 'Giga Impact', a: 20 }, { n: 'Truant...', b: 2 }], taunt: ['...', '*yaaawn*'] },
    groudon: { hp: 90, tier: 3, moves: [{ n: 'Precipice', a: 14 }, { n: 'Bulk Up', s: 3, b: 8 }, { n: 'Stomp', a: 6, h: 2 }, { n: 'Glare', v: 2, w: 1 }], taunt: ['GRRRAAAH!'] },
  };
  function foeDef(m) {
    const d = FOES[m.dex]; if (d) return d;
    const S = DexData.S[m.dex] || {}, tier = S.legendary ? 3 : S.rare === 2 ? 3 : S.rare === 1 ? 2 : 1;
    return { hp: 26 + tier * 10, tier, moves: [{ n: 'Tackle', a: 4 + tier * 2 }, { n: 'Defense Curl', b: 5 + tier * 2 }, { n: 'Double Slap', a: 2 + tier, h: 2 }, { n: 'Tail Whip', v: 1 }], taunt: ['Hmph!'] };
  }

  /* ---------- deck persistence ---------- */
  function store() {
    const d = Save.data; if (!d.cards) d.cards = { deck: STARTER.slice(), wins: 0, losses: 0, tamed: {} };
    return d.cards;
  }
  function battleDeck() {
    const s = store(), deck = s.deck.slice();
    for (const id of TM_CARDS) if (typeof Moves !== 'undefined' && Moves.has(id)) deck.push(id);
    return deck;
  }
  const maxHP = () => 40 + Math.min(20, (store().wins || 0) * 2);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- battle state ---------- */
  const unit = (hp) => ({ hp, max: hp, blk: 0, st: { weak: 0, vuln: 0, stun: 0, str: 0, regen: 0, style: 0, soak: 0, drowsy: 0, dizzy: 0 }, off: { x: 0, y: 0, sx: 1, sy: 1, rot: 0 }, flash: 0, shownHp: hp });
  function start(foe, o = {}) {
    const M = mk();
    if (!M || !foe || !foe.alive || C.live || Game.mode !== 'explore') return false;
    if (typeof Arcade !== 'undefined' && Arcade.live) return false;
    const fd = foeDef(foe), side = foe.x >= M.x ? 1 : -1;
    const dx = Math.abs(foe.x - M.x), land = foe.mode === 'land';
    const fx = land && (dx > 110 || dx < 80) ? M.x + side * 92 : foe.x;
    const G = C.g = {
      foe, fd, side, o, t: 0, step: 'intro', turn: 0, energy: 0, maxE: 3,
      you: unit(maxHP()), them: unit(fd.hp), draw: shuffle(battleDeck()), hand: [], disc: [], exh: [], grow: {},
      mx: M.x, fx0: foe.x, fx, intent: null, mi: (Math.random() * fd.moves.length) | 0, seq: null, pops: [], impact: null, reward: null, over: 0, msg: '', log: '',
    };
    C.live = true; C.sel = -1; C.deckView = false; C.t = 0;
    if (typeof Arcade !== 'undefined') Arcade.live = true; // borrow the cutscene hooks (see bottom)
    if (typeof Pad !== 'undefined') Pad.reset && Pad.reset();
    M.stop && M.stop();
    foe.doTask(foeBrain(foe), 9); foe.arcade = true;
    if (typeof Music !== 'undefined' && Music.play) { try { Music.play('festival'); C.song = true; } catch (e) { /* */ } }
    sfx('chime', null, 0.7);
    say(foe, pick(fd.taunt), 2);
    foe.emote && foe.emote('anger', 1.4);
    G.seq = introSeq(G);
    return true;
  }
  function* foeBrain(m) {
    for (;;) {
      const dt = yield, M = mk(), G = C.g;
      if (M) m.turn(m.face(M.x > m.x ? 1 : -1, false), dt || 0.016, 8);
      const id = G && G.them.st.stun > 0 ? 'idle' : 'battle';
      m.setAct(DexData.S[m.dex] && DexData.S[m.dex].beh && DexData.S[m.dex].beh.battle ? id : 'idle', 0.3);
      if (G && G.them.hp <= 0) m.o.eyes = 'sleep';
    }
  }
  function* wait(T) { let e = 0; while (e < T) e += yield; }
  function* introSeq(G) {
    yield* wait(1.1);
    newTurn(G);
  }
  function pickIntent(G) {
    const mv = G.fd.moves; G.mi = (G.mi + (Math.random() < 0.7 ? 1 : 2)) % mv.length;
    G.intent = mv[G.mi];
  }
  function newTurn(G) {
    G.turn++; G.step = 'you'; G.energy = G.maxE; G.you.blk = 0;
    const Y = G.you;
    if (Y.st.regen > 0) { heal(G, 'you', 3); Y.st.regen--; }
    const n = 5 - (Y.st.dizzy > 0 ? 1 : 0); if (Y.st.dizzy > 0) Y.st.dizzy--;
    drawCards(G, n);
    pickIntent(G);
    C.sel = G.hand.length ? 0 : -1;
  }
  function drawCards(G, n) {
    for (let i = 0; i < n; i++) {
      if (!G.draw.length) { if (!G.disc.length) break; G.draw = shuffle(G.disc); G.disc = []; sfx('page', null, 0.5); }
      if (G.hand.length >= 9) break;
      G.hand.push({ id: G.draw.pop(), t: 0, lift: 0 });
    }
    sfx('blip', null, 0.4);
  }

  /* ---------- effects ---------- */
  const U2 = (G, who) => (who === 'you' ? G.you : G.them);
  const actor = (G, who) => (who === 'you' ? mk() : G.foe);
  function pop(G, who, txt, col, big) { const m = actor(G, who); if (!m) return; const h = m.headPt(); G.pops.push({ x: m.x + rnd(-6, 6), y: h[1] - 4, txt: String(txt), col, t: 0, big: !!big }); }
  function dealDamage(G, from, to, base, o = {}) {
    const A = U2(G, from), D = U2(G, to);
    let dmg = base + (A.st.str || 0);
    if (A.st.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (D.st.vuln > 0) dmg = Math.floor(dmg * 1.5);
    if (to === 'them' && D.st.soak > 0 && o.water) dmg += 2;
    dmg = Math.max(0, dmg);
    let through = dmg;
    if (o.pierce && D.blk > 0) { pop(G, to, 'CRACK!', hex('#ffd070')); D.blk = 0; }
    if (D.blk > 0) { const b = Math.min(D.blk, dmg); D.blk -= b; through = dmg - b; if (b) pop(G, to, 'blocked ' + b, hex('#9ac8ff')); }
    D.hp = Math.max(0, D.hp - through); D.flash = 0.25;
    if (through > 0) pop(G, to, '-' + through, through >= 10 ? hex('#ffe040') : WHITE, through >= 10);
    if (to === 'them' && D.st.drowsy > 0 && through > 0) D.st.drowsy = 0; // hits wake it up
    return through;
  }
  function heal(G, who, n) { const u = U2(G, who), v = Math.min(n, u.max - u.hp); u.hp += v; if (v) pop(G, who, '+' + v, hex('#6aff8a')); }
  function applyFx(G, to, fx) { const u = U2(G, to); for (const k in fx) { u.st[k] = (u.st[k] || 0) + fx[k]; } const lab = { weak: 'Muddy', vuln: 'Dazed', stun: 'Frozen!', soak: 'Soaked', drowsy: 'Drowsy', dizzy: 'Dizzy', str: 'Power up!' }; for (const k in fx) if (lab[k]) pop(G, to, lab[k], hex('#ffb0ff')); }
  function impact(G, who, word, big) {
    const m = actor(G, who); if (!m) return;
    const h = m.headPt();
    G.impact = { t: 0, x: m.x, y: (h[1] + m.y) / 2, word, big: !!big };
    Game.shake && Game.shake(big ? 5 : 2.5);
    G.hitstop = big ? 0.12 : 0.06;
    sfx(big ? 'thud' : 'bonk', m.x, 1);
  }

  /* ---------- playing a card ---------- */
  function canPlay(G, i) { const h = G.hand[i]; return !!(h && G.step === 'you' && !G.seq && CARDS[h.id].cost <= G.energy); }
  function play(i) {
    const G = C.g; if (!G || G.step !== 'you' || G.seq) return;
    const h = G.hand[i]; if (!h) return;
    const c = CARDS[h.id];
    if (c.cost > G.energy) { HUD.toast('Not enough energy!', { life: 1.2 }); sfx('error'); h.shake = 0.3; return; }
    G.energy -= c.cost;
    G.hand.splice(i, 1);
    (c.exhaust ? G.exh : G.disc).push(h.id);
    C.sel = clamp(i, 0, G.hand.length - 1); if (!G.hand.length) C.sel = -1;
    G.log = c.name;
    G.cardFly = { id: h.id, t: 0 };
    G.seq = cardSeq(G, h.id, c);
  }
  function* cardSeq(G, id, c) {
    const Y = G.you, T = G.them, M = mk(), F = G.foe, o = Y.off;
    const s = G.side;
    const hits = c.hits || 1;
    let dmg = c.dmg || 0;
    if (c.grow) { dmg += G.grow[id] || 0; G.grow[id] = (G.grow[id] || 0) + c.grow; }
    const water = ['water', 'bubble', 'hydro', 'surf', 'splash'].includes(id);
    const anim = c.anim || (c.blk ? 'guard' : 'hop');
    if (dmg) {
      for (let k = 0; k < hits; k++) {
        if (anim === 'shot') yield* shotAnim(G, c.shot || '#5ab4ff', k === hits - 1);
        else if (anim === 'flop') yield* flopAnim(G);
        else if (anim === 'roll') yield* rollAnim(G);
        else yield* lungeAnim(G, 'you', hits > 2 ? 0.6 : 1);
        const d = dealDamage(G, 'you', 'them', dmg, { pierce: c.pierce, water });
        impact(G, 'them', d >= 12 ? pick(['KA-BONK!', 'WHAM!!', 'SPLOOSH!']) : d > 0 ? pick(['bonk!', 'boop!', 'thwack!', 'pow!']) : 'tink', d >= 12);
        squash(T, 1.5, 0.55);
        yield* wait(0.1);
        yield* recoil(G, 'them');
        if (T.hp <= 0) break;
      }
      if (c.self) { Y.hp = Math.max(1, Y.hp - c.self); pop(G, 'you', 'ow -' + c.self, hex('#ffa0a0')); Y.st.dizzy = Math.max(Y.st.dizzy, 0); Y.dizzyT = 1.2; }
    } else if (anim === 'splash') {
      for (let k = 0; k < 3; k++) { o.y = 0; yield* hopAnim(o, 10, 0.26); sfx('splash', M.x, 0.5); FX.burst && FX.burst(M.x, M.y - 4, 6, hex('#bfe8ff'), hex('#5ab4ff')); }
      pop(G, 'you', pick(['...nothing happened', 'SO stylish', 'Magnificent. Useless.', 'The crowd goes mild']), hex('#e0b0ff'));
    } else if (anim === 'sing') {
      sfx('twinkle', M.x, 0.8); M.emote && M.emote('note', 1.2);
      yield* wait(0.5); F.emote && F.emote('swirl', 1.4);
    } else if (anim === 'growl') {
      o.sx = 1.3; o.sy = 0.8; sfx('roar', M.x, 0.6); Game.shake && Game.shake(1.5); M.emote && M.emote(id === 'cuteeyes' ? 'heart' : 'anger', 1);
      yield* wait(0.35); F.emote && F.emote('sweat', 1.2);
    } else if (anim === 'snack') {
      sfx('munch', M.x, 0.9); for (let k = 0; k < 3; k++) { o.sy = 0.85; o.sx = 1.15; yield* wait(0.12); o.sy = 1.08; o.sx = 0.94; yield* wait(0.12); }
      M.emote && M.emote('heart', 1);
    } else if (anim === 'dig') {
      sfx('dust', M.x, 0.8); for (let e = 0; e < 0.4;) { e += yield; o.y = e * 20; o.sy = 1 - e; } yield* wait(0.2); for (let e = 0; e < 0.25;) { e += yield; o.y = 8 - e * 32; o.sy = 1.2; } o.y = 0;
    } else if (anim === 'faint') {
      sfx('thud', M.x, 0.7); for (let e = 0; e < 0.3;) { e += yield; o.rot = -s * 1.5 * Math.min(1, e / 0.3); } M.emote && M.emote('sweat', 1); yield* wait(0.6); F.emote && F.emote('shock', 1); yield* wait(0.3); o.rot = 0; pop(G, 'you', 'just kidding!', hex('#ffe070'));
    } else yield* hopAnim(o, 6, 0.22);
    if (c.blk) { Y.blk += c.blk; pop(G, 'you', '+' + c.blk + ' block', hex('#9ac8ff')); sfx('clink', M.x, 0.7); G.shieldT = 0.6; }
    if (c.heal) heal(G, 'you', c.heal);
    if (c.buff) applyFx(G, 'you', c.buff);
    if (c.fx && T.hp > 0) applyFx(G, 'them', c.fx);
    if (c.style) { Y.st.style += c.style; pop(G, 'you', 'Style +' + c.style + ' (' + Y.st.style + ')', hex('#e0b0ff')); }
    if (c.draw) drawCards(G, c.draw);
    o.x = 0; o.y = 0; o.sx = 1; o.sy = 1; o.rot = 0;
    yield* wait(0.12);
    if (T.hp <= 0) { yield* winSeq(G); return; }
  }
  function squash(u, sx, sy) { u.off.sx = sx; u.off.sy = sy; }
  function* hopAnim(o, h, T) { for (let e = 0; e < T;) { e += yield; const k = Math.min(1, e / T); o.y = -Math.sin(k * Math.PI) * h; o.sy = k < 0.15 ? 0.8 : k > 0.85 ? 0.85 : 1.12; o.sx = 2 - o.sy; } o.y = 0; o.sx = o.sy = 1; }
  function* lungeAnim(G, who, sp = 1) {
    const u = U2(G, who), o = u.off, dir = (who === 'you' ? 1 : -1) * G.side;
    const gap = Math.max(10, Math.abs(G.fx - G.mx) - 30);
    for (let e = 0; e < 0.16 / sp;) { e += yield; const k = e / (0.16 / sp); o.x = -dir * 7 * k; o.sx = 1 + 0.3 * k; o.sy = 1 - 0.28 * k; } // wind up
    sfx('whoosh', null, 0.6);
    for (let e = 0; e < 0.09 / sp;) { e += yield; const k = Math.min(1, e / (0.09 / sp)); o.x = lerp(-dir * 7, dir * gap, U.ease.inCubic ? U.ease.inCubic(k) : k); o.sx = 1.45; o.sy = 0.72; o.y = -Math.sin(k * Math.PI) * 5; }
    o.sx = 0.75; o.sy = 1.3; o.y = 0;
  }
  function* recoil(G, who) {
    const other = who === 'you' ? G.them : G.you, u = U2(G, who), dir = (who === 'you' ? -1 : 1) * G.side;
    const o = other.off;
    for (let e = 0; e < 0.22;) { e += yield; const k = e / 0.22; o.x = lerp(o.x, 0, k); o.sx = lerp(o.sx, 1, k); o.sy = lerp(o.sy, 1, k); u.off.x = dir * 10 * Math.sin(k * Math.PI); u.off.rot = dir * 0.25 * Math.sin(k * Math.PI); }
    o.x = 0; o.sx = o.sy = 1; u.off.x = 0; u.off.rot = 0;
  }
  function* flopAnim(G) {
    const o = G.you.off, dir = G.side, gap = Math.max(10, Math.abs(G.fx - G.mx) - 26);
    for (let e = 0; e < 0.2;) { e += yield; const k = e / 0.2; o.sy = 1 - 0.35 * k; o.sx = 1 + 0.25 * k; } // crouch
    sfx('boing', null, 0.8);
    for (let e = 0; e < 0.5;) { e += yield; const k = Math.min(1, e / 0.5); o.x = gap * k; o.y = -Math.sin(k * Math.PI) * 34; o.rot = dir * k * 1.4; o.sx = 0.85; o.sy = 1.2; }
    o.sx = 1.7; o.sy = 0.45; o.y = 0; o.rot = dir * 1.4;
  }
  function* rollAnim(G) {
    const o = G.you.off, dir = G.side, gap = Math.max(10, Math.abs(G.fx - G.mx) - 26);
    sfx('whoosh', null, 0.6);
    for (let e = 0; e < 0.4;) { e += yield; const k = Math.min(1, e / 0.4); o.x = gap * k * k; o.rot = dir * k * 12.5; o.y = -Math.abs(Math.sin(k * 9)) * 3; }
    o.rot = 0;
  }
  function* shotAnim(G, col, last) {
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
    G.disc.push(...G.hand.map((h) => h.id)); G.hand = []; C.sel = -1;
    G.step = 'them';
    G.seq = foeSeq(G);
    sfx('select');
  }
  function* foeSeq(G) {
    const T = G.them, Y = G.you, F = G.foe, mv = G.intent || G.fd.moves[0], M = mk();
    yield* wait(0.35);
    T.blk = 0;
    if (T.st.stun > 0) { T.st.stun--; pop(G, 'them', 'Frozen solid!', hex('#c8f4ff')); sfx('freeze', F.x, 0.8); yield* wait(0.8); }
    else if (T.st.drowsy > 0 && Math.random() < 0.6) { T.st.drowsy = 0; pop(G, 'them', 'Zzz... dozed off!', hex('#e0b0ff')); F.emote && F.emote('swirl', 1.2); T.dizzyT = 1.4; yield* wait(1); }
    else {
      if (T.st.drowsy > 0) { T.st.drowsy = 0; pop(G, 'them', 'shook off Sing!', WHITE); }
      say(F, mv.n + '!', 1.1);
      yield* wait(0.3);
      if (mv.b) { T.blk += mv.b; pop(G, 'them', '+' + mv.b + ' block', hex('#9ac8ff')); sfx('clink', F.x, 0.7); squash(T, 1.2, 0.85); G.foeShieldT = 0.6; yield* wait(0.3); T.off.sx = T.off.sy = 1; }
      if (mv.s) { applyFx(G, 'them', { str: mv.s }); F.emote && F.emote('anger', 1); yield* hopAnim(T.off, 8, 0.3); }
      if (mv.a) {
        for (let k = 0; k < (mv.h || 1); k++) {
          yield* lungeAnim(G, 'them', (mv.h || 1) > 2 ? 0.7 : 1);
          const d = dealDamage(G, 'them', 'you', mv.a);
          impact(G, 'you', d >= 10 ? pick(['OOF!!', 'KA-POW!', 'YOWCH!']) : d > 0 ? pick(['bonk!', 'ow!', 'smack!']) : 'blocked!', d >= 10);
          squash(Y, 1.5, 0.55); if (d > 0) Y.dizzyT = Math.max(Y.dizzyT || 0, d >= 8 ? 1.3 : 0.6);
          yield* wait(0.1);
          yield* recoil(G, 'you');
          if (Y.hp <= 0) break;
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
    const F = G.foe, T = G.them;
    G.step = 'ko';
    T.dizzyT = 99;
    say(F, pick(['Uncle! UNCLE!', 'Owie... you win...', '*dizzy noises*']), 2.2);
    for (let e = 0; e < 0.5;) { e += yield; T.off.rot = -G.side * -1.2 * Math.min(1, e / 0.5); T.off.sy = 1 - 0.2 * Math.min(1, e / 0.5); }
    sfx('reward');
    M_happy();
    yield* wait(1.1);
    const s = store(); s.wins = (s.wins || 0) + 1; Save.save();
    G.reward = { opts: rollRewards(G.fd.tier), t: 0 };
    G.step = 'reward'; C.sel = 1;
  }
  function M_happy() { const M = mk(); if (M) { M.emote && M.emote('star', 1.4); if (M.happyT !== undefined) M.happyT = 1.2; } }
  function* loseSeq(G) {
    const Y = G.you, M = mk();
    G.step = 'ko';
    Y.dizzyT = 99;
    sfx('error');
    for (let e = 0; e < 0.5;) { e += yield; Y.off.rot = G.side * 1.45 * Math.min(1, e / 0.5); }
    say(G.foe, pick(['And STAY out!', 'Hmph. Too easy.', '*victory snip*']), 2.2);
    G.foe.emote && G.foe.emote('note', 1.4);
    const s = store(); s.losses = (s.losses || 0) + 1; Save.save();
    yield* wait(1.6);
    finish(false);
  }
  function rollRewards(tier) {
    const w = tier >= 3 ? [0, 0.3, 0.45, 0.25] : tier === 2 ? [0, 0.5, 0.38, 0.12] : [0, 0.72, 0.24, 0.04];
    const out = [];
    let guard = 0;
    while (out.length < 3 && guard++ < 200) {
      let r = Math.random(), q = 1; while (q < 3 && r > w[q]) { r -= w[q]; q++; }
      const pool = REWARD.filter((k) => CARDS[k].r === q && !out.includes(k));
      if (pool.length) out.push(pick(pool));
    }
    return out;
  }
  function takeReward(i) {
    const G = C.g; if (!G || G.step !== 'reward') return;
    const id = G.reward.opts[i];
    if (id) { store().deck.push(id); Save.save(); HUD.toast(CARDS[id].name + ' added to your deck!', { life: 2.4 }); sfx('reward'); }
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
    if (G.over) { close(); return; }
    HUD.toast('Mudkip ran away!', { life: 1.8 });
    G.fled = true; finish(false);
  }
  function close() {
    const G = C.g, M = mk();
    C.live = false; C.g = null; C.deckView = false;
    if (typeof Arcade !== 'undefined') Arcade.live = false;
    Game.camFocus = null;
    if (M) { M.rot = 0; M.jy = 0; M.tintK = 0; }
    if (G && G.foe) { const F = G.foe; F.arcade = false; if (F.task && F.task.prio >= 9) F.task.done = true; F.rot = 0; F.tintK = 0; }
    if (C.song && typeof Music !== 'undefined' && Game.area && Music.areaTrack) { C.song = false; try { Music.areaTrack(Game.area.def.music); } catch (e) { /* */ } }
    sfx('back');
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
    if (G.cardFly) { G.cardFly.t += dt; if (G.cardFly.t > 0.35) G.cardFly = null; }
    for (const h of G.hand) { h.t += dt; if (h.shake) h.shake = Math.max(0, h.shake - dt); }
    G.shieldT = Math.max(0, (G.shieldT || 0) - dt); G.foeShieldT = Math.max(0, (G.foeShieldT || 0) - dt);
    for (const u of [G.you, G.them]) {
      u.flash = Math.max(0, u.flash - dt); u.dizzyT = Math.max(0, (u.dizzyT || 0) - dt);
      u.shownHp = lerp(u.shownHp, u.hp, Math.min(1, dt * 5));
      if (!G.seq || G.step === 'you') { u.off.sx = lerp(u.off.sx, 1, Math.min(1, dt * 10)); u.off.sy = lerp(u.off.sy, 1, Math.min(1, dt * 10)); }
    }
    // pose the actors (after their own update, before drawing)
    const intro = clamp(G.t / 0.7, 0, 1);
    const fxBase = lerp(G.fx0, G.fx, U.ease && U.ease.outCubic ? U.ease.outCubic(intro) : intro);
    pose(M, G.you, G.mx, G.side);
    pose(F, G.them, fxBase, -G.side);
    if (G.over) { G.over += dt; if (G.over > 1.6) close(); }
    // camera frames both
    const midX = (G.mx + G.fx) / 2, top = Math.min(M.headPt()[1], F.headPt()[1]);
    const span = Math.abs(G.fx - G.mx) + 90;
    const zf = clamp(Game.VW / span * 0.5, 1.0, 1.3), feet = Math.max(M.y, F.y);
    Game.camFocus = { x: midX, y: feet - Game.VH / zf * 0.16, zoom: zf, speed: 4 };
  }
  function pose(m, u, bx, dir) {
    const o = u.off;
    m.x = bx + o.x * (dir);
    m.jOn = true;
    const br = Math.sin(C.t * 3 + (m.seed || 0)) * 0.03; m.jsx = o.sx * (1 - br * 0.7); m.jsy = o.sy * (1 + br); m.jy = o.y;
    m.rot = o.rot + (u.dizzyT > 0 && u.dizzyT < 50 ? Math.sin(C.t * 9) * 0.08 : 0);
    m.tint = WHITE; m.tintK = u.flash > 0 ? Math.min(1, u.flash * 4) : 0;
    if (m.turn && m.face) m.turn(m.face(dir, false), 0.05, 20);
    if (u.dizzyT > 0) m.o.eyes = 'sleep';
  }
  function drive(M) { M.idleT = 0; M.keyDir = 0; M.keyY = 0; M.running = false; M.sneak = false; M.jumpHeld = false; return true; }

  /* ---------- input ---------- */
  function key(k) {
    if (!C.live) return false;
    const G = C.g; if (!G) return true;
    if (C.deckView) { if (k === 'Escape' || k === 'd' || k === ' ' || k === 'Enter') C.deckView = false; return true; }
    if (k === 'Escape') { flee(); return true; }
    if (k === 'd' || k === 'Tab') { C.deckView = true; sfx('page'); return true; }
    if (G.step === 'reward') {
      if (/^[1-3]$/.test(k)) takeReward(+k - 1);
      else if (k === 'ArrowLeft' || k === 'a') C.sel = (C.sel + 3) % 4;
      else if (k === 'ArrowRight' || k === 's' || k === 'ArrowDown') C.sel = (C.sel + 1) % 4;
      else if (k === ' ' || k === 'Enter') takeReward(C.sel === 3 ? -1 : C.sel);
      else if (k === 'k') takeReward(-1);
      return true;
    }
    if (G.step !== 'you') return true;
    if (/^[1-9]$/.test(k)) { play(+k - 1); return true; }
    const n = G.hand.length;
    if (k === 'ArrowLeft' || k === 'a') C.sel = n ? (C.sel + n - 1) % n : -1;
    else if (k === 'ArrowRight') C.sel = n ? (C.sel + 1) % n : -1;
    else if (k === ' ' || k === 'Enter') { if (C.sel >= 0 && C.sel < n) play(C.sel); else endTurn(); }
    else if (k === 'e') endTurn();
    return true;
  }
  function down(ux, uy) {
    if (!C.live) return false;
    for (let i = C.btns.length - 1; i >= 0; i--) { const b = C.btns[i]; if (ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) { b.fn(); return true; } }
    if (C.deckView) C.deckView = false;
    else if (C.g && C.g.step === 'you') C.sel = -1;
    return true;
  }

  /* ---------- drawing ---------- */
  function drawWorld(fb, cx, cy, t, back) {
    if (!C.live || back) return;
    const G = C.g; if (!G) return;
    // the shot projectile
    const P = G.shot;
    if (P) {
      const x = lerp(P.x0, P.x1, P.t), y = lerp(P.y0, P.y1, P.t) - Math.sin(P.t * Math.PI) * 10;
      for (let k = 0; k < 6; k++) { const q = Math.max(0, P.t - k * 0.04), X = Math.round(lerp(P.x0, P.x1, q) - cx), Y = Math.round(lerp(P.y0, P.y1, q) - Math.sin(q * Math.PI) * 10 - cy); UI.disc(fb, X, Y, Math.max(1, 4 - k), k ? P.col : WHITE); }
      UI.disc(fb, Math.round(x - cx), Math.round(y - cy), 4, P.col); UI.disc(fb, Math.round(x - cx) - 1, Math.round(y - cy) - 1, 1, WHITE);
    }
  }
  const txt = (fb, s, x, y, c, o = {}) => Font.draw(fb, s, Math.round(x), Math.round(y), c, Object.assign({ font: 'small', outline: INK }, o));
  function bar(fb, x, y, w, u, isYou, t) {
    const h = 6;
    UI.rect(fb, x - 1, y - 1, w + 2, h + 2, INK);
    UI.rect(fb, x, y, w, h, 0xff30222a);
    const k = clamp(u.shownHp / u.max, 0, 1), k2 = clamp(u.hp / u.max, 0, 1);
    UI.rect(fb, x, y, Math.round(w * k), h, hex('#ffe0a0'));
    UI.rect(fb, x, y, Math.round(w * k2), h, k2 < 0.3 ? hex('#ff4a4a') : isYou ? hex('#5ad06a') : hex('#e85a3a'));
    UI.rect(fb, x, y, Math.round(w * k2), 1, 0x55ffffff);
    txt(fb, u.hp + '/' + u.max, x + w / 2, y - 1, WHITE, { align: 'center' });
    if (u.blk > 0) { const bx = x - 12; shieldIcon(fb, bx, y - 3, hex('#5a9aff')); txt(fb, String(u.blk), bx + 5, y - 1, WHITE, { align: 'center' }); }
    // statuses
    let sx = x;
    const S = u.st, list = [['weak', 'Mud', '#b08050'], ['vuln', 'Daze', '#ff8a5a'], ['stun', 'Ice', '#c8f4ff'], ['drowsy', 'Zz', '#e0b0ff'], ['str', 'Pow', '#ffd040'], ['regen', 'Aqua', '#5affd0'], ['dizzy', 'Diz', '#ffb0ff'], ['style', 'Sty', '#e0b0ff'], ['soak', 'Wet', '#5ab4ff']];
    for (const [k3, lab, col] of list) if (S[k3] > 0) { const s = lab + S[k3], w2 = Font.measure(s, 'small') + 4; UI.rect(fb, sx, y + h + 2, w2, 10, INK); UI.rect(fb, sx + 1, y + h + 3, w2 - 2, 8, U.mix(hex(col), INK, 0.45)); txt(fb, s, sx + 2, y + h + 3, hex(col)); sx += w2 + 1; }
  }
  function shieldIcon(fb, x, y, c) { UI.rect(fb, x, y, 10, 7, INK); UI.rect(fb, x + 1, y + 7, 8, 2, INK); UI.rect(fb, x + 3, y + 9, 4, 2, INK); UI.rect(fb, x + 1, y + 1, 8, 6, c); UI.rect(fb, x + 2, y + 7, 6, 1, c); UI.rect(fb, x + 4, y + 8, 2, 2, c); UI.rect(fb, x + 2, y + 2, 2, 3, 0x88ffffff); }
  function swordIcon(fb, x, y, c) { for (let i = 0; i < 8; i++) { UI.rect(fb, x + i, y + 8 - i - 1, 3, 3, INK); } for (let i = 0; i < 7; i++) UI.put(fb, x + 1 + i, y + 8 - i, c), UI.put(fb, x + 2 + i, y + 8 - i, c); UI.rect(fb, x, y + 6, 4, 2, hex('#a06a3a')); }
  function star(fb, x, y, c) { x = Math.round(x); y = Math.round(y); UI.put(fb, x, y, WHITE); UI.put(fb, x - 1, y, c); UI.put(fb, x + 1, y, c); UI.put(fb, x, y - 1, c); UI.put(fb, x, y + 1, c); UI.put(fb, x - 2, y, INK); UI.put(fb, x + 2, y, INK); UI.put(fb, x, y - 2, INK); UI.put(fb, x, y + 2, INK); }
  function intentBox(fb, G, x, y, t) {
    const mv = G.intent; if (!mv || G.step === 'ko' || G.step === 'reward' || G.step === 'done') return;
    const bob = Math.round(Math.sin(t * 4) * 1.5);
    let s = '', ic = null;
    if (mv.a) { const T = G.them, Y = G.you; let d = mv.a + (T.st.str || 0); if (T.st.weak > 0) d = Math.floor(d * 0.75); if (Y.st.vuln > 0) d = Math.floor(d * 1.5); s = d + (mv.h > 1 ? 'x' + mv.h : ''); ic = 'atk'; }
    else if (mv.b) { s = String(mv.b); ic = 'blk'; }
    else { s = mv.s ? 'buff' : '?!'; ic = mv.s ? 'buff' : 'deb'; }
    if (G.them.st.stun > 0) { s = 'frozen'; ic = 'z'; }
    const w = Font.measure(s, 'small') + 18, X = Math.round(x - w / 2), Y = y + bob;
    UI.panel(fb, X, Y, w, 13, { r: 4, ol: INK, fill: ic === 'atk' ? 0xff3030a0 : 0xff4a3a2a });
    if (ic === 'atk') swordIcon(fb, X + 3, Y + 2, hex('#e8e8f0'));
    else if (ic === 'blk') shieldIcon(fb, X + 3, Y + 2, hex('#5a9aff'));
    else if (ic === 'buff') txt(fb, '+', X + 5, Y + 3, hex('#ffd040'));
    else if (ic === 'z') txt(fb, '*', X + 5, Y + 3, hex('#c8f4ff'));
    else txt(fb, '!', X + 5, Y + 3, hex('#ff8aff'));
    txt(fb, s, X + 15, Y + 3, WHITE);
    txt(fb, mv.n, x, Y - 9, hex('#ffe8b0'), { align: 'center' });
  }
  function cardFace(fb, id, x, y, w, h, o = {}) {
    const c = CARDS[id], col = hex(COL[c.kind]);
    UI.rrect(fb, x + 1, y + 2, w, h, 5, 0x66000000);
    UI.panel(fb, x, y, w, h, { r: 5, ol: o.sel ? hex('#ffe070') : INK, fill: o.dim ? U.mix(col, 0xff404040, 0.55) : col });
    if (o.sel) UI.rrect(fb, x - 1, y - 1, w + 2, 1, 1, hex('#ffe070'));
    // art window
    const ax = x + 4, ay = y + 13, aw = w - 8, ah = Math.max(10, Math.round(h * 0.28));
    UI.rect(fb, ax, ay, aw, ah, U.tweak(col, 0, 1, -0.3)); UI.rect(fb, ax, ay, aw, 1, INK);
    cardArt(fb, id, c, ax + aw / 2, ay + ah / 2);
    // rarity gem
    if (c.r >= 2) UI.disc(fb, x + w - 6, y + 5, 2, c.r === 3 ? hex('#ffd040') : hex('#a0e0ff'));
    // name
    const nm = Font.measure(c.name, 'small') > w - 14 && c.short ? c.short : c.name;
    txt(fb, nm, x + w / 2 + (Font.measure(nm, 'small') > w - 22 ? 5 : 3), y + 3, WHITE, { align: 'center' });
    // cost orb
    UI.disc(fb, x + 5, y + 5, 5, INK); UI.disc(fb, x + 5, y + 5, 4, hex('#ffd24a')); txt(fb, String(c.cost), x + 5, y + 2, INK, { align: 'center'});
    // text
    const lines = Font.wrap ? Font.wrap(c.desc, 'small', w - 4) : [c.desc];
    const ty = ay + ah + 3;
    lines.slice(0, Math.floor((y + h - ty - 2) / 9)).forEach((l, i) => txt(fb, l, x + w / 2, ty + i * 9, WHITE, { align: 'center' }));
    if (c.tm) txt(fb, 'TM', x + w - 4, y + h - 9, hex('#ffe070'), { align: 'right'});
    if (c.exhaust) txt(fb, 'once', x + 3, y + h - 9, 0xffc0c0c0, {});
  }
  function cardArt(fb, id, c, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (c.kind === 'blk') { shieldIcon(fb, x - 5, y - 5, hex('#9ac8ff')); return; }
    if (c.anim === 'shot') { UI.disc(fb, x + 3, y, 3, c.shot ? hex(c.shot) : WHITE); UI.disc(fb, x - 3, y + 1, 2, c.shot ? hex(c.shot) : WHITE); UI.disc(fb, x - 7, y + 1, 1, WHITE); return; }
    if (c.kind === 'atk') { swordIcon(fb, x - 5, y - 5, hex('#f0f0f0')); if (c.hits > 1) txt(fb, 'x' + c.hits, x + 6, y - 3, WHITE); return; }
    if (c.kind === 'silly') { star(fb, x - 5, y - 1, hex('#ffd040')); star(fb, x + 4, y + 1, hex('#ff8aff')); star(fb, x, y - 3, hex('#8affff')); return; }
    UI.disc(fb, x, y, 4, hex('#c8ffb0')); UI.put(fb, x - 1, y - 1, WHITE);
  }
  function btn(fb, x, y, w, h, label, col, fn, o = {}) {
    UI.rrect(fb, x, y + 2, w, h, 5, 0xff0a0e1a);
    UI.panel(fb, x, y - (o.on ? 1 : 0), w, h, { r: 5, ol: o.on ? hex('#ffe070') : INK, fill: o.dim ? 0xff505060 : hex(col) });
    txt(fb, label, x + w / 2, y + Math.round(h / 2 - 3) - (o.on ? 1 : 0), WHITE, { align: 'center' });
    C.btns.push({ x: x - 2, y: y - 3, w: w + 4, h: h + 6, fn });
  }
  function drawUI(fb, t) {
    C.btns.length = 0;
    const W = fb.w, H = fb.h, bh = Math.round(Math.min(H * 0.1, 26) * (U.ease && U.ease.outCubic ? U.ease.outCubic(C.bars) : C.bars));
    if (bh > 0) { UI.rect(fb, 0, 0, W, bh, 0xff05060c); UI.rect(fb, 0, H - bh, W, bh, 0xff05060c); }
    const G = C.g; if (!C.live || !G) return;
    const M = mk(), F = G.foe;
    // impact frame: a white flash + burst lines
    if (G.impact && G.impact.t < 0.3) {
      const I = G.impact, [ix, iy] = Talk.toUI(I.x, I.y), k = I.t / 0.3;
      if (I.t < 0.06 && I.big) UI.rectA(fb, 0, 0, W, H, WHITE, 0.45);
      const R0 = 10 + k * 30, R1 = R0 + (I.big ? 26 : 14);
      for (let a = 0; a < 12; a++) { const an = a / 12 * 6.283 + (a % 2) * 0.2; UI.line(fb, Math.round(ix + Math.cos(an) * R0), Math.round(iy + Math.sin(an) * R0), Math.round(ix + Math.cos(an) * R1), Math.round(iy + Math.sin(an) * R1), a % 2 ? hex('#ffe070') : WHITE); }
      const sc = I.big ? 1 + (1 - k) * 0.6 : 1;
      Font.draw(fb, I.word, Math.round(ix), Math.round(iy - 22 - k * 8), I.big ? hex('#ffe040') : WHITE, { font: I.big ? 'title' : 'body', align: 'center', outline: INK, sc: sc > 1.2 ? 1 : undefined });
    }
    // HP bars & intent over heads
    const head = (m) => Talk.toUI(m.x, m.headPt()[1]);
    const bw = clamp(Math.round(W * 0.16), 56, 90);
    const [mx, my] = head(M), [fx, fy] = head(F);
    bar(fb, Math.round(mx - bw / 2), Math.round(clamp(my - 20, bh + 12, H - 40)), bw, G.you, true, t);
    const fyb = Math.round(clamp(fy - 20, bh + 34, H - 40));
    bar(fb, Math.round(fx - bw / 2), fyb, bw, G.them, false, t);
    intentBox(fb, G, fx, fyb - 17, t);
    // dizzy stars
    for (const [u, m] of [[G.you, M], [G.them, F]]) if (u.dizzyT > 0) { const [hx, hy] = head(m); for (let s = 0; s < 3; s++) { const an = t * 5 + s * 2.09; star(fb, hx + Math.cos(an) * 10, hy - 4 + Math.sin(an) * 3, [hex('#ffe040'), hex('#ff8aff'), hex('#8affff')][s]); } }
    // shield sparkle
    if (G.shieldT > 0) { const [hx, hy] = head(M); UI.ring && UI.ring(fb, Math.round(hx), Math.round(hy + 12), Math.round(14 + (0.6 - G.shieldT) * 10), hex('#9ac8ff')); }
    if (G.foeShieldT > 0) { const [hx, hy] = head(F); UI.ring && UI.ring(fb, Math.round(hx), Math.round(hy + 12), Math.round(14 + (0.6 - G.foeShieldT) * 10), hex('#9ac8ff')); }
    // damage numbers
    for (const p of G.pops) {
      const [ux, uy0] = Talk.toUI(p.x, p.y), uy = clamp(uy0, bh + 44, H - 50), k = p.t / 1.3, jump = p.t < 0.15 ? p.t / 0.15 : 1;
      const yy = uy - 8 - jump * 10 - k * 12;
      if (k > 0.8 && ((t * 20) | 0) % 2) continue;
      Font.draw(fb, p.txt, Math.round(ux), Math.round(yy), p.col, { font: p.big ? 'title' : 'body', align: 'center', outline: INK });
    }
    // title
    Font.draw(fb, (G.step === 'reward' ? 'Victory! ' : 'vs. wild ') + nameOf(F).toUpperCase(), W / 2, Math.max(3, Math.round(bh / 2 - 5)), hex('#ffe070'), { font: 'title', align: 'center', outline: INK });
    // flee / deck
    const lb = G.step === 'reward' ? 'Skip' : 'Flee (Esc)', lw = Font.measure(lb, 'small') + 12;
    btn(fb, 6, 4, lw, 14, lb, '#46505e', flee);
    const dl = 'Deck (D)', dw = Font.measure(dl, 'small') + 12;
    btn(fb, W - dw - 6, 4, dw, 14, dl, '#46505e', () => { C.deckView = !C.deckView; sfx('page'); });
    if (C.deckView) { drawDeck(fb, t); return; }
    if (G.step === 'reward') { drawReward(fb, t); return; }
    // hand
    const n = G.hand.length, cw = clamp(Math.round(Math.min(W * 0.13, H * 0.21)), 50, 72), ch = Math.round(cw * 1.36);
    const handW = Math.min(W - 150, n * (cw + 4)), step = n > 1 ? Math.min(cw + 4, (handW - cw) / (n - 1)) : 0;
    const x0 = Math.round(W / 2 - ((n - 1) * step + cw) / 2), yBase = H - Math.round(ch * 0.56);
    const order = G.hand.map((h, i) => i).filter((i) => i !== C.sel); if (C.sel >= 0 && C.sel < n) order.push(C.sel);
    for (const i of order) {
      const h = G.hand[i], sel = i === C.sel, ok = canPlay(G, i);
      const mid = (i - (n - 1) / 2), arc = Math.round(mid * mid * 1.2);
      const deal = clamp(h.t / 0.25, 0, 1);
      const x = Math.round(x0 + i * step + (h.shake ? Math.sin(h.shake * 60) * 3 : 0)), y = Math.round(yBase + arc - (sel ? Math.round(ch * 0.44) : 0) + (1 - deal) * 40);
      cardFace(fb, h.id, x, y, cw, ch, { sel, dim: !ok && G.step === 'you' });
      if (n <= 9) txt(fb, String(i + 1), x + cw / 2, y - 8, sel ? hex('#ffe070') : 0xffb0b8c8, { align: 'center' });
      C.btns.push({ x, y: y - 8, w: sel ? cw : Math.max(8, Math.round(step)), h: ch + 8, fn: () => { if (G.step !== 'you' || G.seq) return; if (C.sel === i) play(i); else { C.sel = i; sfx('blip', null, 0.4); } } });
      if (sel) C.btns[C.btns.length - 1].w = cw;
    }
    // fix hit order: selected card on top → it was pushed last, so reverse search finds it first (down() iterates backwards)
    // card flying to the foe
    if (G.cardFly) { const k = G.cardFly.t / 0.35, [tx, ty] = head(F), sx0 = W / 2, sy0 = H - ch; const x = lerp(sx0, tx, k), y = lerp(sy0, ty + 20, k) - Math.sin(k * Math.PI) * 30; if (k < 0.8) cardFace(fb, G.cardFly.id, Math.round(x - cw * (1 - k * 0.6) / 2), Math.round(y), Math.max(20, Math.round(cw * (1 - k * 0.6))), Math.max(26, Math.round(ch * (1 - k * 0.6))), {}); }
    // energy orb (left) and end turn (right)
    const ex = 34, ey = H - 34;
    UI.disc(fb, ex, ey, 17, INK); UI.disc(fb, ex, ey, 15, G.energy ? hex('#ff9a2a') : hex('#6a4a3a')); UI.disc(fb, ex - 4, ey - 5, 4, 0x66ffffff);
    Font.draw(fb, G.energy + '/' + G.maxE, ex, ey - 6, WHITE, { font: 'title', align: 'center', outline: INK });
    txt(fb, 'draw ' + G.draw.length + '  disc ' + G.disc.length, ex - 20, ey + 19, 0xffc0c8d8);
    const my2 = G.step === 'you' && !G.seq;
    const noMoves = my2 && !G.hand.some((h, i) => canPlay(G, i));
    const ew = 64, eh = 24;
    btn(fb, W - ew - 8, H - eh - 14, ew, eh, my2 ? 'End Turn (E)' : G.step === 'them' ? 'Foe turn...' : '...', my2 ? (noMoves ? '#3ab860' : '#2a8a4a') : '#46505e', endTurn, { dim: !my2, on: noMoves && ((t * 3) | 0) % 2 === 0 });
    if (G.step === 'you' && G.turn === 1 && !G.seq) txt(fb, Pad && Pad.touch ? 'Tap a card, tap again to play' : '1-9 or arrows + Space to play, E ends turn', W / 2, bh + 4, 0xffd8e0f0, { align: 'center' });
    if (G.over) {
      const w = 180, h = 40, x = Math.round(W / 2 - w / 2), y = Math.round(H * 0.3);
      UI.panel(fb, x, y, w, h, { r: 8, ol: INK, fill: G.win ? 0xff2a7a3a : 0xff3a2a6a });
      Font.draw(fb, G.win ? 'YOU WIN!' : G.fled ? 'GOT AWAY!' : 'MUDKIP FAINTED...', W / 2, y + 7, G.win ? hex('#ffe070') : WHITE, { font: 'title', align: 'center', outline: INK });
      txt(fb, G.msg || (G.win ? 'It calmed down.' : 'Try again with a better hand!'), W / 2, y + 26, WHITE, { align: 'center'});
    }
  }
  function drawReward(fb, t) {
    const G = C.g, W = fb.w, H = fb.h, R = G.reward;
    UI.rectA(fb, 0, 0, W, H, 0xff000000, 0.35);
    Font.draw(fb, 'Pick a card for your deck', W / 2, Math.round(H * 0.2), WHITE, { font: 'body', align: 'center', outline: INK });
    const cw = clamp(Math.round(W * 0.15), 60, 84), ch = Math.round(cw * 1.36), gap = 12, x0 = Math.round(W / 2 - (cw * 3 + gap * 2) / 2), y0 = Math.round(H * 0.2 + 16);
    R.opts.forEach((id, i) => {
      const sel = C.sel === i, x = x0 + i * (cw + gap), y = y0 - (sel ? 4 : 0) + Math.round(Math.sin(t * 3 + i) * 1.5);
      cardFace(fb, id, x, y, cw, ch, { sel });
      const r = CARDS[id].r; txt(fb, (i + 1) + '  ' + ['', 'common', 'uncommon', 'RARE'][r], x + cw / 2, y + ch + 4, r === 3 ? hex('#ffd040') : r === 2 ? hex('#a0e0ff') : 0xffc0c8d8, { align: 'center' });
      C.btns.push({ x, y, w: cw, h: ch + 12, fn: () => takeReward(i) });
    });
    const sw = 60; btn(fb, Math.round(W / 2 - sw / 2), y0 + ch + 18, sw, 16, 'Skip', '#46505e', () => takeReward(-1), { on: C.sel === 3 });
  }
  function drawDeck(fb, t) {
    const W = fb.w, H = fb.h, G = C.g;
    UI.rectA(fb, 0, 0, W, H, 0xff05060c, 0.8);
    const all = battleDeck().sort((a, b) => (CARDS[a].kind > CARDS[b].kind ? 1 : CARDS[a].kind < CARDS[b].kind ? -1 : a > b ? 1 : -1));
    Font.draw(fb, 'Your deck (' + all.length + ' cards)', W / 2, 24, WHITE, { font: 'body', align: 'center', outline: INK });
    const cols = Math.max(4, Math.floor((W - 20) / 62)), cw = Math.min(58, Math.floor((W - 20) / cols) - 4), ch = Math.round(cw * 1.36);
    const rows = Math.ceil(all.length / cols), sy = Math.min(ch + 4, Math.floor((H - 60) / Math.max(1, rows)));
    const x0 = Math.round(W / 2 - (cols * (cw + 4)) / 2);
    all.forEach((id, i) => cardFace(fb, id, x0 + (i % cols) * (cw + 4), 40 + Math.floor(i / cols) * sy, cw, ch, {}));
    txt(fb, G ? 'Tap or press D to close' : '', W / 2, H - 12, 0xffd8e0f0, { align: 'center' });
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
  U.on && U.on('area', () => { if (C.live) { C.live = false; C.g = null; if (typeof Arcade !== 'undefined') Arcade.live = false; } C.bars = 0; });
  return Object.assign(C, { CARDS, FOES, start, play, endTurn, takeReward, flee, close, update, key, down, drawUI, drawWorld, store, battleDeck, foeDef, canPlay });
})();
