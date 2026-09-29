/* ------------------------------------------------------------------
   Bag — Mudkip's backpack (B). Three pockets:
   · Items: berries (throw one), shells, pearls, mushrooms, gems and
     star pieces (trade them to Professor Birch for research points)
   · TMs: every move, how to learn the ones still missing; tap one to
     make it the move on the B button
   · Memories: replay the cinematic scenes you have unlocked
------------------------------------------------------------------- */
const Bag = (() => {
  const { clamp } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const B = { tab: 0, sel: 0, t: 0, scroll: 0, seen: {} };
  const ITEMS = [
    { id: 'berry', name: 'Oran Berry', desc: 'A juicy blue berry. Pokémon love them. Throw one to make friends.', use: 'Throw' },
    { id: 'shell', name: 'Pretty Shell', desc: 'A pink seashell from the beach.', trade: 40 },
    { id: 'pearl', name: 'Pearl', desc: 'A glowing pearl from the seabed.', trade: 120 },
    { id: 'mushroom', name: 'Tiny Mushroom', desc: 'Smells earthy. Shroomish would approve.', trade: 60 },
    { id: 'gem', name: 'Shiny Gem', desc: 'A crystal that hums softly in the dark.', trade: 150 },
    { id: 'stardust', name: 'Star Piece', desc: 'A red-orange shard of a fallen star.', trade: 200 },
  ];
  const TABS = ['Items', 'TMs', 'Memories'];
  function open() {
    if (Game.mode !== 'explore') return;
    Game.mode = 'bag'; Game.frozenFrame = false; B.t = 0; B.sel = 0;
    if (typeof Pad !== 'undefined') Pad.reset();
    Game.sfx('dexOpen', null, 0.6);
    Game.pushBack && Game.pushBack();
  }
  function close() { if (Game.mode !== 'bag') return; Game.mode = 'explore'; Game.sfx('dexClose', null, 0.6); }
  const fresh = () => { const it = Save.data.items || {}; return Object.keys(it).some((k) => it[k] > 0 && !B.seen[k]); };
  const listFor = (tab) => (tab === 0 ? ITEMS.filter((i) => Save.itemN(i.id) > 0 || i.id === 'berry') : tab === 1 ? Moves.LIST : Memories.list());
  function act(tab, i) {
    const L = listFor(tab), it = L[i]; if (!it) return;
    if (tab === 0) {
      if (it.use === 'Throw') { if (Save.itemN('berry') <= 0) { Game.sfx('error'); HUD.toast('No berries! Shake bushes with Tackle, dig, or check tall grass.'); return; } close(); HUD.throwBerry(); return; }
      if (it.trade && Save.itemN(it.id) > 0) { Save.useItem(it.id); Save.addPoints(it.trade); Game.sfx('twinkle'); HUD.toast('Traded a ' + it.name + ' to Professor Birch: +' + it.trade, { life: 1.6 }); }
    } else if (tab === 1) {
      if (!Moves.has(it.id)) { Game.sfx('error'); HUD.toast(it.how || 'Not learned yet.', { life: 3 }); return; }
      Moves.select(Moves.LIST.indexOf(it)); Game.sfx('select'); HUD.toast(it.name + ' is on the B button.', { life: 1.6, col: it.col });
    } else if (tab === 2) {
      if (!it.seen) { Game.sfx('error'); HUD.toast('A memory you have not found yet...', { life: 2 }); return; }
      close(); setTimeout(() => Memories.play(it.id, true), 50);
    }
  }
  function update(dt) { B.t += dt; }
  function key(k) {
    const L = listFor(B.tab);
    if (k === 'Escape' || k === 'b' || k === 'i') { close(); return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'q') { B.tab = (B.tab + 2) % 3; B.sel = 0; Game.sfx('page', null, 0.4); return; }
    if (k === 'ArrowRight' || k === 'd' || k === 'e' || k === 'Tab') { B.tab = (B.tab + 1) % 3; B.sel = 0; Game.sfx('page', null, 0.4); return; }
    if (k === 'ArrowUp' || k === 'w') { B.sel = (B.sel + L.length - 1) % Math.max(1, L.length); Game.sfx('blip', null, 0.4); return; }
    if (k === 'ArrowDown' || k === 's') { B.sel = (B.sel + 1) % Math.max(1, L.length); Game.sfx('blip', null, 0.4); return; }
    if (k === ' ' || k === 'Enter' || k === 'x') act(B.tab, B.sel);
  }
  function wheel(dy) { const L = listFor(B.tab); B.sel = clamp(B.sel + Math.sign(dy), 0, Math.max(0, L.length - 1)); }
  // item icons (pixel maps)
  const IC = {
    berry: { m: ['...g..', '..gg..', '.bbbb.', 'bblbbb', 'blbbbb', 'bbbbbb', '.bbbb.'], c: { g: 0xff3aa84a, b: 0xffe07a3a, l: 0xffffc8a0 } },
    shell: { m: ['...a...', '..aba..', '.abcba.', 'abcdcba', 'bcdddcb', '.bbbbb.'], c: { a: 0xffeaf0ff, b: 0xffc0c8f8, c: 0xff9aa0e8, d: 0xff7a80c8 } },
    pearl: { m: ['.aaa.', 'awaab', 'aaabb', 'aabbb', '.bbb.'], c: { a: 0xfff8f0ff, w: 0xffffffff, b: 0xffd8c8e0 } },
    mushroom: { m: ['.rrrr.', 'rwrrwr', 'rrrrrr', '..ss..', '..ss..', '.ssss.'], c: { r: 0xff3a3ae0, w: 0xffffffff, s: 0xffd0e0f0 } },
    gem: { m: ['..a..', '.aab.', 'abbcc', '.bcc.', '..c..'], c: { a: 0xffffe0b0, b: 0xfff0a060, c: 0xffc06a30 } },
    stardust: { m: ['...a...', '..aba..', 'abbwbba', '.abbba.', '.ab.ba.', 'a.....a'], c: { a: 0xff2a8ae0, b: 0xff60c8ff, w: 0xffffffff } },
  };
  function draw(fb, t) {
    const S = UI.skin(), W = fb.w, H = fb.h;
    UI.rectA(fb, 0, 0, W, H, 0xff0a0e20, 0.55);
    const k = U.ease.outBack(Math.min(1, B.t / 0.25));
    const pw = Math.min(W - 20, 380), ph = Math.min(H - 20, 250), x0 = Math.round((W - pw) / 2), y0 = Math.round((H - ph) / 2 + (1 - k) * 60);
    // the backpack: stitched leather body, flap, straps
    const leather = 0xff2a6ad8, leatherL = 0xff4a8ef0, leatherD = 0xff1a4aa0, flap = 0xff2058c0;
    UI.rrect(fb, x0, y0 + 4, pw, ph, 14, 0xff0a0e1a);
    UI.rrect(fb, x0, y0, pw, ph, 14, INK); UI.rrect(fb, x0 + 2, y0 + 2, pw - 4, ph - 4, 12, leather);
    UI.hline(fb, x0 + 14, x0 + pw - 14, y0 + 3, leatherL); UI.hline(fb, x0 + 14, x0 + pw - 14, y0 + ph - 4, leatherD);
    for (let x = x0 + 12; x < x0 + pw - 12; x += 4) { UI.put(fb, x, y0 + 7, 0xff7ab8ff); UI.put(fb, x, y0 + ph - 8, 0xff7ab8ff); }
    for (let y = y0 + 12; y < y0 + ph - 12; y += 4) { UI.put(fb, x0 + 6, y, 0xff7ab8ff); UI.put(fb, x0 + pw - 7, y, 0xff7ab8ff); }
    UI.rrect(fb, x0 + 10, y0 + 10, pw - 20, 30, 8, INK); UI.rrect(fb, x0 + 11, y0 + 11, pw - 22, 28, 7, flap);
    Font.draw(fb, 'BAG', x0 + 20, y0 + 19, WHITE, { font: 'title' });
    // buckle + close
    UI.rrect(fb, x0 + pw / 2 - 8, y0 + 34, 16, 10, 2, INK); UI.rect(fb, x0 + pw / 2 - 6, y0 + 36, 12, 6, 0xff3ad2ff); UI.put(fb, x0 + pw / 2 - 5, y0 + 37, WHITE);
    const cx = x0 + pw - 26, cy = y0 + 14, cp = HUD.pressed('bagx') ? 1 : 0;
    UI.panel(fb, cx, cy + cp, 18, 18, { r: 4, ol: INK, fill: S.btn }); Font.icon(fb, 'cross', cx + 6, cy + 6 + cp, 1);
    HUD.btn('bagx', cx - 2, cy - 2, 22, 22, close);
    // tabs
    let tx = x0 + 60;
    TABS.forEach((name, i) => {
      const w = Font.measure(name, 'small') + 14, on = B.tab === i;
      UI.panel(fb, tx, y0 + 16 + (on ? 0 : 2), w, 14, { r: 4, ol: INK, fill: on ? 0xffffd23a : 0xff15336b, hi: null, sh: null });
      Font.draw(fb, name, tx + w / 2, y0 + 19 + (on ? 0 : 2), on ? INK : WHITE, { font: 'small', align: 'center' });
      HUD.btn('bagt' + i, tx, y0 + 14, w, 18, () => { B.tab = i; B.sel = 0; Game.sfx('page', null, 0.4); });
      tx += w + 4;
    });
    // list pocket
    const lx = x0 + 12, ly = y0 + 48, lw = pw - 24, lh = ph - 60;
    UI.rrect(fb, lx, ly, lw, lh, 8, INK); UI.rrect(fb, lx + 1, ly + 1, lw - 2, lh - 2, 7, 0xfff4efe2);
    const L = listFor(B.tab), rowH = 20, maxRows = Math.floor((lh - 34) / rowH);
    B.sel = clamp(B.sel, 0, Math.max(0, L.length - 1));
    const first = clamp(B.sel - maxRows + 1, 0, Math.max(0, L.length - maxRows));
    for (let r = 0; r < Math.min(maxRows, L.length - first); r++) {
      const i = first + r, it = L[i], y = ly + 6 + r * rowH, sel = i === B.sel;
      if (sel) UI.rrect(fb, lx + 4, y - 1, lw - 8, rowH - 1, 5, 0xffffe6a8);
      if (B.tab === 0) {
        const ic = IC[it.id]; if (ic) UI.pix(fb, ic.m, lx + 10, y + 2, ic.c, 2);
        Font.draw(fb, it.name, lx + 30, y + 5, INK, { font: 'small' });
        Font.draw(fb, '×' + Save.itemN(it.id), lx + lw - 70, y + 5, INK, { font: 'small', align: 'right' });
        B.seen[it.id] = 1;
      } else if (B.tab === 1) {
        const own = Moves.has(it.id);
        UI.disc(fb, lx + 16, y + 8, 7, INK); UI.disc(fb, lx + 16, y + 8, 6, own ? it.col : 0xff8a8ea0);
        if (own) Moves.icon(fb, it.id, lx + 16, y + 8, 1); else Font.draw(fb, '?', lx + 16, y + 5, WHITE, { font: 'small', align: 'center' });
        Font.draw(fb, (it.tm ? it.tm + '  ' : '      ') + (own ? it.name : '???'), lx + 30, y + 5, own ? INK : 0xff7a7e90, { font: 'small' });
        if (Moves.current().id === it.id) Font.draw(fb, 'ON B', lx + lw - 10, y + 5, 0xff2a8a4a, { font: 'small', align: 'right' });
        else if (!own) Font.draw(fb, 'not learned', lx + lw - 10, y + 5, 0xff9a9eb0, { font: 'small', align: 'right' });
      } else {
        UI.rrect(fb, lx + 8, y + 1, 16, 14, 3, INK); UI.rrect(fb, lx + 9, y + 2, 14, 12, 2, it.seen ? 0xffc04a9a : 0xff5a5e70);
        Font.draw(fb, it.no, lx + 16, y + 5, WHITE, { font: 'small', align: 'center' });
        Font.draw(fb, it.seen ? it.title : '? ? ?', lx + 30, y + 5, it.seen ? INK : 0xff7a7e90, { font: 'small' });
        if (it.seen) Font.draw(fb, it.who + '  >', lx + lw - 10, y + 5, 0xffa0306a, { font: 'small', align: 'right' });
      }
      HUD.btn('bagr' + i, lx + 4, y - 1, lw - 8, rowH - 1, () => { if (B.tab === 0) { B.sel = i; Game.sfx('blip', null, 0.4); } else { B.sel = i; act(B.tab, i); } });
      // the action button sits on top of the row (buttons registered later win)
      if (B.tab === 0 && (it.use || it.trade)) {
        const lab = it.use || ('Trade +' + it.trade), bw = Math.min(58, Font.measure(lab, 'small') + 10), bx = lx + lw - 64, pr = HUD.pressed('baga' + i) ? 1 : 0;
        UI.panel(fb, bx, y + 1 + pr, bw, 14, { r: 3, ol: INK, fill: it.use ? 0xff2ab870 : 0xff2a6ad8 }); Font.draw(fb, lab, bx + bw / 2, y + 4 + pr, WHITE, { font: 'small', align: 'center' });
        HUD.btn('baga' + i, bx - 1, y, bw + 2, 16, () => { B.sel = i; act(0, i); });
      }
    }
    if (!L.length) Font.draw(fb, 'Empty!', lx + lw / 2, ly + 30, 0xff8a8ea0, { font: 'body', align: 'center' });
    // description strip
    const it = L[B.sel];
    UI.rect(fb, lx + 6, ly + lh - 30, lw - 12, 1, 0xffd8d0bc);
    const desc = !it ? '' : B.tab === 0 ? it.desc : B.tab === 1 ? (Moves.has(it.id) ? it.desc || '' : 'How to learn: ' + (it.how || '?')) : it.seen ? 'Replay this memory.' : 'Discover something legendary to unlock it.';
    Font.wrap(desc, 'small', lw - 20).slice(0, 2).forEach((l, i) => Font.draw(fb, l, lx + 10, ly + lh - 25 + i * 9, 0xff4a4e62, { font: 'small' }));
    Font.draw(fb, '{coin}' + Save.data.points, x0 + pw - 40, y0 + ph - 1, WHITE, { font: 'small', align: 'right', outline: INK });
  }
  return Object.assign(B, { open, close, update, key, wheel, draw, fresh, ITEMS });
})();
