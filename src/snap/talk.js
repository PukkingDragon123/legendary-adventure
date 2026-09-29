/* ------------------------------------------------------------------
   Talk — Pokémon that talk. Speech bubbles over anyone's head (drawn
   crisp on the UI canvas), a dialogue box with a typewriter, a
   portrait and choices, species chatter when you tap a Pokémon, and
   side quests: givers wear a "!" until you talk to them, "?" while
   the job is under way and a star when it is ready to hand in.
   Rewards are TMs, outfits and research points; a few quests end in
   a Memory.
------------------------------------------------------------------- */
const Talk = (() => {
  const { clamp, rnd, pick } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const T = { bubbles: [], dlg: null, near: null, markT: 0 };

  /* ---------- quests ---------- */
  // progress kinds: flops (belly flops next to the giver), song (sing next to it), spots (find glittering
  // patches: dig or belly flop on them), pearl (touch a lost item), photo ({ sp, beh }), fetch (items)
  const QUESTS = [
    { id: 'q.mail1', area: 'beach', giver: 'mailman', title: 'Special Delivery', instant: true,
      intro: ['Pelipper! Special delivery for the new photographer!', 'Professor Birch sent you this: a map of all Hoenn!', '(You got the MAP! Press M or tap the map button.)'],
      done: ['Pelipper!'], reward: 'pts:100', onAccept: () => { Save.discover('mail.map'); Game.sfx('reward'); } },
    { id: 'q.mail2', area: 'beach', giver: 'mailman', title: 'Airmail to Weather Woods', after: 'q.mail1',
      intro: ['Want to see Weather Woods? I can fly you there!', 'But my wings are tired from all this mail...', 'Bring me 2 Pecha Berries for energy! (Pick them from berry bushes with E.)'],
      fetch: { item: 'pecha', n: 2 }, wait: ['Pecha Berries, please! {left} more. They grow on pink berry bushes.'],
      done: ['PELI-PELI! Energy!', 'Hop in my beak! Next stop: Weather Woods!'], reward: 'pts:300', unlock: 'forest' },
    { id: 'q.tropius', area: 'forest', giver: 'tropius', title: 'Fruit for a Flight',
      intro: ['Tro-pi! Tro-piiius!', '(Tropius flaps its huge leaf wings. It could carry you up to Treetop Town!)', '(It looks hungry. Bring it 3 Nanab Berries.)'],
      fetch: { item: 'nanab', n: 3 }, wait: ['(Tropius waits patiently. {left} more Nanab Berries.)'],
      done: ['TROPIIIUS!', '(It munches the berries, lowers its neck... climb aboard!)'], reward: 'pts:400', unlock: 'canopy' },
    { id: 'q.altaria', area: 'canopy', giver: 'altaria', title: 'Cloud Taxi',
      intro: ['{note} Alta~ria {note}', '(Altaria hums. Its fluffy wings could fly you to Starfall Cave!)', '(It would love 2 Razz Berries.)'],
      fetch: { item: 'razz', n: 2 }, wait: ['(Altaria sings softly. {left} more Razz Berries.)'],
      done: ['{note} Alta~ria! {note}', '(Sink into the fluffy wings... hold on tight!)'], reward: 'pts:500', unlock: 'falls' },
    { id: 'q.spheal', area: 'beach', giver: 'spheal', title: 'Hungry Spheal',
      intro: ['Spheal! Spheal spheal!', '(It pats its round tummy and stares at the berry bushes.)', '(It would love 3 berries. Shake bushes with Tackle, dig, or sniff around!)'],
      fetch: { item: 'berry', n: 3 }, wait: ['Spheal...? (Still hungry. It needs {left} more berries.)'],
      done: ['SPHEAL!!! (It gobbles all three and does a happy roll.)', '(It found a party hat on the beach. Now it is yours!)'], reward: 'hat.party' },
    { id: 'q.corphish', area: 'beach', giver: 'corphish', title: 'Belly Flop Champ',
      intro: ['*snip snip* Hey, you. Blue shrimp.', 'You call that a belly? Show me a REAL belly flop!', 'Three big ones, right next to me. Jump, then press Down!'],
      progress: 'flops', n: 3, wait: ['That was {have}! {left} more, shrimp!'],
      done: ['*SNIP!* OK, OK, you are tough.', 'Take this TM. It breaks rocks. Or heads. Probably rocks.'], reward: 'tm:smash' },
    { id: 'q.walrein', area: 'beach', giver: 'walrein', title: 'Grumpy Old Walrein',
      intro: ['...HMPH.', '(Walrein is far too grumpy to talk.)', '(Maybe a good photo of it roaring would cheer it up?)'],
      photo: { sp: 'walrein', beh: 'roar' }, wait: ['...HMPH. (No photo, no talk.)'],
      done: ['...!', '(Walrein looks at the photo for a long time. Is that... a smile?)', '(It breathes a tiny, frosty TM onto the sand.)'], reward: 'tm:ice' },
    { id: 'q.luvdisc', area: 'beach', giver: 'luvdisc', title: 'The Lost Pearl',
      intro: ['Luv... luv...', '(Luvdisc lost its favourite pearl somewhere in the coral reef.)', '(Look for something glinting on the seabed!)'],
      progress: 'pearl', n: 1, wait: ['(Luvdisc swims in sad little circles.)'],
      done: ['LUV! LUV! {heart}', '(It blows a heart of bubbles... and teaches you how!)'], reward: 'tm:bubble' },
    { id: 'q.zigzag', area: 'forest', giver: 'zigzagoon', title: 'Buried Treasure',
      intro: ['Sniff sniff! Zig! Zag!', '(Zigzagoon buried its three favourite treasures... and forgot where.)', '(Find the glittering patches of ground, then dig or belly flop on them!)'],
      progress: 'spots', n: 3, wait: ['Zig? (You found {have} of 3.)'],
      done: ['ZIGZAG!! (It spins in circles so fast it falls over.)', '(Zigzagoon teaches you its secret digging technique!)'], reward: 'tm:dig' },
    { id: 'q.ludicolo', area: 'forest', giver: 'ludicolo', title: 'Dance Party',
      intro: ['Lu-di-COLO! Lu-di-COLO!', 'Rain! Rhythm! RAIN RHYTHM!', '(Ludicolo wants music. Play a song right next to it!)'],
      progress: 'song', n: 1, wait: ['Lu-di...? (It is waiting for a song.)'],
      done: ['COLO-COLO-COLO!!! (It dances until the rain stops, then keeps going.)', '(It hands you a pair of rain boots. For dancing in puddles!)'], reward: 'shoes.boots' },
    { id: 'q.chatot', area: 'canopy', giver: 'chatot', title: 'Copycat',
      intro: ['SQUAWK! MUD-KIP! MUD-KIP!', '(Chatot copies every sound it hears. It wants a new one.)', '(Sing a song near Chatot!)'],
      progress: 'song', n: 1, wait: ['Mud-kip? MUD-KIP? (It is waiting for your song.)'],
      done: ['{note} La-la-MUD-KIP! {note}', '(It copied your song perfectly... and teaches you to shout like it!)'], reward: 'tm:growl' },
    { id: 'q.bagon', area: 'falls', giver: 'bagon', title: 'Dreams of Flying',
      intro: ['Bagon! One day I will FLY!', 'Until then I headbutt things. Very hard.', 'Take a photo of me smashing the boulder! Then everyone will know!'],
      photo: { sp: 'bagon', beh: 'headbutt' }, wait: ['Did you get it? The headbutt? It was a good one.'],
      done: ['Wow... I look so cool.', 'Here! My royal crown. (It is a very shiny rock... no, it IS a crown!)'], reward: 'hat.crown' },
    { id: 'q.slakoth', area: 'forest', giver: 'slakoth', title: 'Do Nothing',
      intro: ['...', '......', '(Slakoth wants you to nap next to it. Stand still for a while.)'],
      progress: 'nap', n: 1, wait: ['...zzz... (Stand still next to it and relax.)'],
      done: ['...yawn...', '(Slakoth gives you its favourite thing: a very slow propeller cap.)'], reward: 'hat.propeller' },
  ];
  const QD = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
  const st = () => Save.data.tq || (Save.data.tq = {});
  const qState = (id) => st()[id] || null;
  function giverQuest(m) {
    if (!m || !Game.areaId) return null;
    for (const q of QUESTS) if (q.area === Game.areaId && q.giver === m.kind && (!qState(q.id) || qState(q.id).s !== 'done') && (!q.after || (qState(q.after) && qState(q.after).s === 'done'))) { const gv = giverOf(q); if (gv === m) return q; }
    return null;
  }
  // one giver per quest: the first of that species in the area
  function giverOf(q) { if (q.area !== Game.areaId) return null; return Mons.all.find((m) => m.kind === q.giver && m.alive) || null; }
  function ready(q) {
    const s = qState(q.id); if (!s || s.s !== 'active') return false;
    if (q.instant) return true;
    if (q.fetch) return Save.itemN(q.fetch.item) >= q.fetch.n;
    if (q.photo) return !!s.ok;
    return (s.n || 0) >= (q.n || 1);
  }
  function accept(q) {
    st()[q.id] = { s: 'active', n: 0 }; Save.save();
    if (q.onAccept) q.onAccept();
    if (q.instant) { finish(q, giverOf(q)); return; }
    HUD.toast('New quest: ' + q.title, { life: 2.6, col: 0xff3ad0ff });
    Game.sfx('select');
    if (q.progress === 'spots' || q.progress === 'pearl') { if (typeof Harvest !== 'undefined') Harvest.questSpots(q, giverOf(q)); }
  }
  function progress(id, k = 1) {
    const q = QD[id], s = qState(id); if (!q || !s || s.s !== 'active') return;
    s.n = (s.n || 0) + k; Save.save();
    const left = Math.max(0, (q.n || 1) - s.n);
    const g = giverOf(q);
    if (left <= 0) { HUD.toast(q.title + ': go back and tell ' + (DexData.S[q.giver] ? DexData.S[q.giver].name : 'them') + '!', { life: 2.6, col: 0xffffd23a }); Game.sfx('sparkle'); }
    else if (g) bubble(() => g.headPt(), q.progress === 'flops' ? pick(['WHOA!', 'Ha! ' + s.n + '!', 'Again!']) : '(' + s.n + ' / ' + q.n + ')', { life: 1.6, who: g });
  }
  function finish(q, g) {
    const s = qState(q.id); s.s = 'done'; Save.save();
    if (q.fetch) for (let i = 0; i < q.fetch.n; i++) Save.useItem(q.fetch.item);
    let r = null;
    if (q.reward.startsWith('tm:')) Moves.unlock(q.reward.slice(3), 'A gift from ' + (DexData.S[q.giver] ? DexData.S[q.giver].name : 'a friend') + '!');
    else { r = Rewards.grant(q.reward); Quests.Q.pops.push({ t: 0, life: 4.2, text: 'Quest complete: ' + q.title, reward: r }); Quests.Q.unseenN++; SFX.reward(); if (typeof Style !== 'undefined') Style.markNew(q.reward); }
    Save.addPoints(300);
    if (q.unlock) { Save.unlock(q.unlock); Save.discover('mail.map'); const dest = q.unlock; setTimeout(() => { if (Game.mode === 'explore') { WorldMap.open(); setTimeout(() => WorldMap.travelTo(dest), 900); } }, 700); }
    if (g) { g.emote('heart', 1.6); FX.confetti(g.x, g.y - 20, 30); }
    Save.discover('quest.' + q.id.slice(2));
  }
  function questLines(q) {
    const s = qState(q.id), g = giverOf(q);
    const nm = DexData.S[q.giver] ? DexData.S[q.giver].name : q.giver;
    const fill = (l) => l.replace('{have}', s ? s.n || 0 : 0).replace('{left}', q.fetch ? Math.max(0, q.fetch.n - Save.itemN(q.fetch.item)) : Math.max(0, (q.n || 1) - (s ? s.n || 0 : 0)));
    if (!s && q.instant) return { lines: q.intro, done: () => accept(q) };
    if (!s) return { lines: q.intro.slice(0, -1).concat([{ text: q.intro[q.intro.length - 1], choices: ['Leave it to me!', 'Maybe later'] }]), done: (c) => { if (c === 0) accept(q); else bubble(() => g.headPt(), '...', { who: g }); } };
    if (ready(q)) return { lines: q.done, done: () => finish(q, g) };
    return { lines: q.wait.map(fill), done: () => {} };
  }

  /* ---------- chatter: what everyone says when you tap them ---------- */
  const CHAT = {
    spheal: ['Spheal!', 'Spheal? (It wants to roll somewhere.)', '*clap clap*', 'Sphe-e-e-al~'],
    sealeo: ['Sea-leo!', '(It balances a pebble on its nose. Show-off.)', 'Look at me! LOOK AT ME!'],
    walrein: ['HMPH.', '...go away.', '(It pretends to be asleep.)'],
    corphish: ['*snip snip*', 'Nice fin. Can I pinch it?', 'I am the KING of this beach.'],
    luvdisc: ['{heart}', 'Luv~', '(It blushes and swims away.)'],
    pelipper: ['Pelipper! (Got any mail?)', '(It checks its beak pouch for snacks.)'],
    wingull: ['Wiiing!', '(It eyes your hat.)', 'Gull! Gull!'],
    wailmer: ['Wai-wai!', '(It puffs up like a big blue balloon.)', 'Wanna bounce? BOUNCE?'],
    clamperl: ['...', '(Clamp.)'],
    staryu: ['Hyah!', '(Its core blinks in morse code.)'],
    corsola: ['Cor-so!', '(It hides its horns shyly.)'],
    zigzagoon: ['Zig! Zag! Zig!', 'Sniff sniff... you smell like MUD.', 'Found something! ...no, it was a rock.'],
    seedot: ['...', '(It is trying very hard to look like an acorn.)'],
    slakoth: ['...', '......', '(Slakoth blinks once. Very slowly.)'],
    plusle: ['Pla-pla! Go go go!', 'Cheer! Cheer! CHEER!'], minun: ['Mi-nun! You can do it!', 'Minus! Minus!'],
    shroomish: ['Shroo...', '(A puff of spores. Achoo!)'],
    ludicolo: ['Lu-di-COLO!', 'Dance! DANCE!', '(It is already dancing.)'],
    lotad: ['Lo-tad!', '(It floats. That is its whole plan.)'],
    kecleon: ['...', '(Where did it go?)'],
    castform: ['Cast! (It feels cloudy today.)'],
    chatot: ['MUD-KIP!', 'Squawk! Squawk!', 'Pretty bird! PRETTY BIRD!'],
    swablu: ['Swa-blu~', '(It tries to clean your fin with its wings.)'],
    altaria: ['{note} Alta~ria {note}'], taillow: ['TAILLOW! (It puffs out its chest.)'],
    bagon: ['I WILL FLY!', '*bonk* Ow. Worth it.', 'Headbutt! HEADBUTT!'],
    solrock: ['...', '(It spins slowly, warm as the sun.)'], lunatone: ['...', '(It glows softly, like the moon.)'],
    jirachi: ['Wish~', 'Zzz... (It is sleeping. For a thousand years?)'],
    trapinch: ['Chomp!', '(It opens its huge jaws. Please step back.)'],
    mailman: ['Pelipper! Mail for you! ...oh wait, no.', 'Rain or shine, the mail gets through!', '(It adjusts its little postman cap.)'],
    tropius: ['Tro-pi!', '(Bananas dangle from its neck. They smell great.)'],
  };
  const MUDKIP_REPLY = ['Mud!', 'Kip!', 'Mudkip!', 'Mud? Kip!'];
  function chatter(m) {
    const lines = CHAT[m.kind];
    const nm = DexData.S[m.dex] ? DexData.S[m.dex].name : m.kind;
    bubble(() => m.headPt(), lines ? pick(lines) : nm + '!', { life: 2.2, who: m });
    const mk = Game.mudkip;
    if (mk && Math.random() < 0.5) setTimeout(() => { if (Game.mudkip === mk) bubble(() => mk.headPt(), pick(MUDKIP_REPLY), { life: 1.4, who: mk }); }, 900);
  }
  // tap a Pokémon next to Mudkip: quest givers open the dialogue box, everyone else chats
  function tryTalk(m) {
    if (T.dlg || !(m instanceof Mons.Mon)) return false;
    const q = giverQuest(m);
    if (q) {
      const nm = DexData.S[q.giver] ? DexData.S[q.giver].name : q.giver;
      const L = questLines(q);
      open(L.lines, { who: m, name: nm, done: L.done, title: q.title });
      m.doTask && !m.busy(4) && m.doTask(faceMudkip(m), 3);
      return true;
    }
    chatter(m);
    return false;
  }
  function* faceMudkip(m) { const mk = Game.mudkip; for (let i = 0; i < 60 && T.dlg; i++) { const dt = yield; m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 6); } while (T.dlg) { yield; m.setAct(m.act.id, 0.3); } }

  /* ---------- events from the world ---------- */
  function event(kind, a) {
    if (!Game.areaId) return;
    for (const q of QUESTS) {
      const s = qState(q.id); if (!s || s.s !== 'active' || q.area !== Game.areaId) continue;
      const g = giverOf(q), mk = Game.mudkip;
      const near = g && mk && Math.hypot(g.x - mk.x, g.y - mk.y) < 130;
      if (kind === 'flop' && q.progress === 'flops' && near) progress(q.id);
      if (kind === 'song' && q.progress === 'song' && near) progress(q.id);
      if (kind === 'spot' && q.progress === 'spots' && a === q.id) progress(q.id);
      if (kind === 'pearl' && q.progress === 'pearl' && a === q.id) progress(q.id);
      if (kind === 'photo' && q.photo && a && a.species === q.photo.sp && (!q.photo.beh || a.beh === q.photo.beh)) { s.ok = 1; Save.save(); HUD.toast(q.title + ': show it to ' + (DexData.S[q.giver] ? DexData.S[q.giver].name : 'them') + '!', { life: 2.6, col: 0xffffd23a }); }
    }
    // naps: standing still next to Slakoth
    if (kind === 'still') for (const q of QUESTS) { const s = qState(q.id); if (s && s.s === 'active' && q.progress === 'nap' && q.area === Game.areaId) { const g = giverOf(q); if (g && Math.abs(g.x - Game.mudkip.x) < 90) progress(q.id); } }
  }
  if (U.on) U.on('photo', (res) => event('photo', res));

  /* ---------- speech bubbles ---------- */
  function bubble(at, text, o = {}) {
    if (o.who) T.bubbles = T.bubbles.filter((b) => b.who !== o.who);
    if (o.who && typeof Cries !== 'undefined') { if (o.who === Game.mudkip) Cries.mudkip(); else Cries.play(o.who.dex, o.who.x, 0.7, true); }
    T.bubbles.push({ at, text, t: 0, life: o.life ?? 2, who: o.who || null });
    if (T.bubbles.length > 6) T.bubbles.shift();
  }
  // world → UI canvas coordinates (follows the camera zoom and the director's zoom punches)
  function toUI(wx, wy) {
    let sx = wx - Game.cam.x, sy = wy - Game.cam.y;
    const zs = Game.mode === 'camera' ? Photo.zs : 1;
    if (zs !== 1) { sx = (sx - Game.VW / 2) * zs + Game.VW / 2; sy = (sy - Game.VH / 2) * zs + Game.VH / 2; }
    const zk = (Game.cine && Game.cine.zk) || 1;
    if (Math.abs(zk - 1) > 0.002) { sx = (sx - Game.VW * 0.5) * zk + Game.VW * 0.5; sy = (sy - Game.VH * 0.55) * zk + Game.VH * 0.55; }
    return [(sx * Game.zoom) / Game.US, (sy * Game.zoom) / Game.US];
  }
  function drawBubble(fb, x, y, text, k, pop) {
    const lines = Font.wrap(text, 'small', 96);
    const w = Math.max(...lines.map((l) => Font.measure(l, 'small'))) + 10, h = lines.length * 9 + 6;
    const bx = Math.round(clamp(x - w / 2, 2, fb.w - w - 2)), by = Math.round(y - h - 8 - pop);
    UI.rrect(fb, bx, by + 1, w, h, 4, 0x60000000 | 0x0a0e20);
    UI.rrect(fb, bx - 1, by - 1, w + 2, h + 2, 5, INK);
    UI.rrect(fb, bx, by, w, h, 4, WHITE);
    // tail
    const tx = Math.round(clamp(x, bx + 6, bx + w - 6));
    for (let i = 0; i < 4; i++) { const r = 3 - i; UI.hline(fb, tx - r, tx + r, by + h - 1 + i, WHITE); UI.put(fb, tx - r - 1, by + h - 1 + i, INK); UI.put(fb, tx + r + 1, by + h - 1 + i, INK); }
    UI.put(fb, tx, by + h + 3, INK);
    lines.forEach((l, i) => Font.draw(fb, l, bx + w / 2, by + 3 + i * 9, INK, { font: 'small', align: 'center' }));
  }
  function drawBubbles(fb, t) {
    for (const b of T.bubbles) {
      const [wx, wy] = b.at();
      const [x, y] = toUI(wx, wy);
      if (x < -60 || x > fb.w + 60 || y < -40 || y > fb.h + 60) continue;
      const pop = b.t < 0.15 ? Math.round((1 - b.t / 0.15) * 5) : 0;
      if (b.t > b.life - 0.12 && Math.floor(b.t * 30) % 2) continue;
      drawBubble(fb, x, y, b.text, 1, pop);
    }
    // quest markers over the givers
    if (Game.mode !== 'explore' || T.dlg) return;
    for (const q of QUESTS) {
      if (q.area !== Game.areaId) continue;
      const s = qState(q.id); if (s && s.s === 'done') continue;
      const g = giverOf(q); if (!g || !g.visible || g.hideK > 0.5 || T.bubbles.some((b) => b.who === g)) continue;
      const [hx, hy] = g.headPt();
      const [x, y] = toUI(hx, hy);
      if (x < -20 || x > fb.w + 20 || y < -20 || y > fb.h + 20) continue;
      const bob = Math.round(Math.sin(t * 4 + g.seed) * 2), rd = ready(q);
      const mark = !s ? '!' : rd ? '{star}' : '?';
      const col = !s ? 0xff3ad8ff : rd ? 0xff3ae0ff : 0xfff0f0f0;
      const X = Math.round(x), Y = Math.round(y) - 14 + bob;
      UI.disc(fb, X, Y + 1, 6, 0xff0a0e1a); UI.disc(fb, X, Y, 6, INK); UI.disc(fb, X, Y, 5, !s ? 0xff2ac8ff : rd ? 0xff30d8ff : 0xff4a5470);
      if (mark === '{star}') Font.icon(fb, 'star', X - 3, Y - 3, 1); else Font.draw(fb, mark, X, Y - 4, WHITE, { font: 'small', align: 'center' });
      // talk prompt when Mudkip is close
      const mk = Game.mudkip;
      if (mk && Math.hypot(mk.x - g.x, mk.y - g.y) < 80) Font.draw(fb, (typeof Pad !== 'undefined' && Pad.touch ? 'Tap' : 'R') + ': Talk', X, Y + 8, WHITE, { font: 'small', align: 'center', outline: INK });
      void col;
    }
  }

  /* ---------- dialogue box ---------- */
  function open(lines, o = {}) {
    if (o.who && typeof Cries !== 'undefined') Cries.play(o.who.dex, o.who.x, 0.8, true);
    T.dlg = { lines: lines.map((l) => (typeof l === 'string' ? { text: l } : l)), i: 0, ch: 0, t: 0, who: o.who || null, name: o.name || '', done: o.done || null, title: o.title || '', choice: 0, rects: [] };
    Game.sfx('blip');
    if (Game.mudkip) { Game.mudkip.stop(); Game.mudkip.keyDir = 0; }
  }
  function cur() { return T.dlg ? T.dlg.lines[T.dlg.i] : null; }
  function advance() {
    const D = T.dlg; if (!D) return;
    const L = cur();
    if (D.ch < L.text.length) { D.ch = L.text.length; return; }
    if (L.choices) { close(D.choice); return; }
    D.i++; D.ch = 0;
    if (D.i >= D.lines.length) close(0); else Game.sfx('page', null, 0.5);
  }
  function close(choice) { const D = T.dlg; T.dlg = null; Game.sfx('back', null, 0.6); if (D && D.done) D.done(choice); }
  function down(ux, uy) {
    const D = T.dlg; if (!D) return false;
    const L = cur();
    if (L && L.choices && D.ch >= L.text.length) { for (const r of D.rects) if (ux >= r.x && uy >= r.y && ux < r.x + r.w && uy < r.y + r.h) { D.choice = r.i; close(r.i); return true; } return true; }
    advance();
    return true;
  }
  function key(k, e) {
    if (!T.dlg) {
      // R talks to the nearest Pokémon
      if (k === 'r' && Game.mode === 'explore' && Game.mudkip) { const mk = Game.mudkip; let best = null, bd = 80; for (const m of Mons.all) { if (m === mk || !m.alive || !m.visible) continue; const d = Math.hypot(m.x - mk.x, m.y - mk.y); if (d < bd) { bd = d; best = m; } } if (best) { if (!tryTalk(best)) best.onPoke(mk); } return true; }
      return false;
    }
    const L = cur();
    if (L && L.choices && T.dlg.ch >= L.text.length) {
      if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowUp' || k === 'w') { T.dlg.choice = (T.dlg.choice + L.choices.length - 1) % L.choices.length; Game.sfx('blip', null, 0.5); return true; }
      if (k === 'ArrowRight' || k === 'd' || k === 'ArrowDown' || k === 's') { T.dlg.choice = (T.dlg.choice + 1) % L.choices.length; Game.sfx('blip', null, 0.5); return true; }
    }
    if (k === 'Escape') { close(L && L.choices ? 1 : 0); return true; }
    if (k === ' ' || k === 'Enter' || k === 'x' || k === 'e' || k === 'r' || k === 'j') { if (!e || !e.repeat) advance(); return true; }
    return true; // everything else is swallowed while talking
  }
  const busy = () => !!T.dlg;
  function update(dt) {
    for (const b of T.bubbles) b.t += dt;
    T.bubbles = T.bubbles.filter((b) => b.t < b.life);
    const D = T.dlg;
    if (D) {
      D.t += dt;
      const L = cur(), n0 = Math.floor(D.ch);
      D.ch = Math.min(L.text.length, D.ch + dt * 48);
      if (Math.floor(D.ch) !== n0 && Math.floor(D.ch) % 3 === 0 && L.text[Math.floor(D.ch)] !== ' ') Game.sfx('tick', null, 0.12);
    }
    // standing still near Slakoth counts as a nap
    const mk = Game.mudkip;
    if (mk && Game.mode === 'explore' && (mk.idleT || 0) > 6 && !T.napT) { T.napT = 1; event('still'); }
    if (mk && (mk.idleT || 0) < 1) T.napT = 0;
  }
  function drawDialog(fb, t) {
    const D = T.dlg; if (!D) return;
    const S = UI.skin(), L = cur();
    const k = Math.min(1, D.t / 0.18);
    const w = Math.min(fb.w - 16, 420), h = 62, x = Math.round((fb.w - w) / 2), y = Math.round(fb.h - h - 10 + (1 - U.ease.outBack(k)) * 40);
    UI.rrect(fb, x, y + 3, w, h, 8, 0xff0a0e1a);
    UI.body(fb, x, y, w, h, S, { r: 8 });
    UI.screen(fb, x + 54, y + 6, w - 60, h - 12, { fill: 0xfffbfaf4, rim: S.ink, glare: false });
    // portrait
    UI.rrect(fb, x + 6, y + 6, 44, 44, 6, S.ink); UI.rrect(fb, x + 7, y + 7, 42, 42, 5, 0xffbfe6ff);
    for (let yy = 0; yy < 14; yy++) UI.hline(fb, x + 8, x + 47, y + 34 + Math.min(yy, 14), U.hex('#a8d890'));
    const m = D.who;
    if (m) {
      const sp = m.spr2 ? m.spr2.s : m.spr;
      if (sp) {
        const scale = Math.min(1, 40 / Math.max(sp.w, sp.h));
        const pw = Math.max(1, Math.round(sp.w * scale)), ph = Math.max(1, Math.round(sp.h * scale));
        const bob = Math.round(Math.sin(t * 6) * (D.ch < L.text.length ? 1 : 0));
        const buf = { w: sp.w, h: sp.h, d: sp.d };
        UI.imgFit(fb, buf, x + 28 - Math.round(pw / 2), y + 48 - ph + bob, pw, ph);
      }
    }
    // name tag
    if (D.name) { const nw = Font.measure(D.name, 'small') + 10; UI.panel(fb, x + 54, y - 7, nw, 12, { r: 3, ol: S.ink, fill: S.accent }); Font.draw(fb, D.name, x + 59, y - 5, WHITE, { font: 'small' }); }
    if (D.title && D.i === 0) Font.draw(fb, D.title, x + w - 8, y - 5, 0xffffe890, { font: 'small', align: 'right', outline: INK });
    // text
    const shown = L.text.slice(0, Math.floor(D.ch));
    const lines = Font.wrap(shown, 'body', w - 72);
    lines.slice(0, 3).forEach((l, i) => Font.draw(fb, l, x + 60, y + 10 + i * 12, INK, { font: 'body' }));
    D.rects = [];
    if (D.ch >= L.text.length) {
      if (L.choices) {
        let cx = x + w - 8;
        for (let i = L.choices.length - 1; i >= 0; i--) {
          const lab = L.choices[i], bw = Font.measure(lab, 'small') + 14, sel = D.choice === i;
          cx -= bw;
          UI.panel(fb, cx, y + h - 20, bw, 14, { r: 4, ol: S.ink, fill: sel ? S.accent : S.btn });
          Font.draw(fb, lab, cx + bw / 2, y + h - 17, WHITE, { font: 'small', align: 'center' });
          D.rects.push({ x: cx, y: y + h - 22, w: bw, h: 18, i });
          cx -= 4;
        }
      } else if (Math.sin(t * 8) > -0.2) { const ax = x + w - 14, ay = y + h - 14; for (let j = 0; j < 4; j++) UI.hline(fb, ax - 3 + j, ax + 3 - j, ay + j, INK); }
    }
  }
  function reset() { T.bubbles.length = 0; T.dlg = null; }
  U.on && U.on('area', reset);
  return Object.assign(T, { QUESTS, bubble, drawBubbles, open, down, key, busy, update, drawDialog, tryTalk, event, progress, giverOf, ready, qState, chatter, toUI });
})();
