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
  const B = { tab: 0, sel: 0, t: 0, scroll: 0, seen: {}, lure: 'oran' };
  const ITEMS = [
    { id: 'berry', lure: 'oran', name: 'Oran Berry', desc: 'Lure: most Pokémon like it. Pick berries from bushes with E.', use: 'Lure' },
    { id: 'pecha', lure: 'pecha', name: 'Pecha Berry', desc: 'Lure: sweet! Cute Pokémon come running.', use: 'Lure' },
    { id: 'razz', lure: 'razz', name: 'Razz Berry', desc: 'Lure: its smell draws in rare Pokémon from far away.', use: 'Lure' },
    { id: 'nanab', lure: 'nanab', name: 'Nanab Berry', desc: 'Lure: calms a Pokémon so it sits still for photos.', use: 'Lure' },
    { id: 'sitrus', lure: 'sitrus', name: 'Sitrus Berry', desc: 'Lure: makes a Pokémon happy and bouncy.', use: 'Lure' },
    { id: 'jam', name: 'Guitar Jam', desc: 'Rock out on the seaside stage! (G)', use: 'Play', always: true },
    { id: 'shell', name: 'Pretty Shell', desc: 'A pink seashell from the beach.', trade: 40 },
    { id: 'pearl', name: 'Pearl', desc: 'A glowing pearl from the seabed.', trade: 120 },
    { id: 'mushroom', name: 'Tiny Mushroom', desc: 'Smells earthy. Shroomish would approve.', trade: 60 },
    { id: 'gem', name: 'Shiny Gem', desc: 'A crystal that hums softly in the dark.', trade: 150 },
    { id: 'stardust', name: 'Star Piece', desc: 'A red-orange shard of a fallen star.', trade: 200 },
    { id: 'blueorb', name: 'Blue Orb', desc: 'It glows like the deep sea. Something sleeps at the bottom of Coral Cove...' },
    { id: 'redorb', name: 'Red Orb', desc: 'Warm as magma. It rose out of Mt. Chimney\'s crater.' },
    { id: 'icegem', name: 'Never-Melt Ice', desc: 'A shard of ice that never melts, from Shoal Cave.', trade: 180 },
  ];
  const TABS = ['Items', 'TMs', 'Memories'];
  function open() {
    if (Game.mode !== 'explore') return;
    Game.mode = 'bag'; Game.frozenFrame = false; B.t = 0; B.sel = 0;
    // items picked up since the last look wear a NEW tag while the bag is open
    const it = Save.data.items || {}; B.fresh0 = {}; for (const k in it) if (it[k] > 0 && !B.seen[k]) { B.fresh0[k] = 1; B.seen[k] = 1; }
    if (typeof Pad !== 'undefined') Pad.reset();
    Game.sfx('dexOpen', null, 0.6);
    Game.pushBack && Game.pushBack();
  }
  function close() { if (Game.mode !== 'bag') return; Game.mode = 'explore'; Game.sfx('dexClose', null, 0.6); }
  const fresh = () => { const it = Save.data.items || {}; return Object.keys(it).some((k) => it[k] > 0 && !B.seen[k]); };
  const listFor = (tab) => (tab === 0 ? ITEMS.filter((i) => Save.itemN(i.id) > 0 || i.id === 'berry' || i.always) : tab === 1 ? Moves.LIST : Memories.list());
  function act(tab, i) {
    const L = listFor(tab), it = L[i]; if (!it) return;
    if (tab === 0) {
      if (it.use === 'Play') { close(); setTimeout(() => Rhythm.open(0), 50); return; }
      if (it.use === 'Lure') { B.lure = it.lure; if (Save.itemN(it.id) <= 0) { Game.sfx('error'); HUD.toast('No ' + it.name + 's! Pick them from berry bushes with E.'); return; } close(); HUD.throwBerry(); return; }
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
  const BM = ['...g..', '..gg..', '.bbbb.', 'bblbbb', 'blbbbb', 'bbbbbb', '.bbbb.'];
  const IC = {
    pecha: { m: BM, c: { g: 0xff3aa84a, b: U.hex('#ff6a9a'), l: 0xffffffff } }, razz: { m: BM, c: { g: 0xff3aa84a, b: U.hex('#d82a48'), l: U.hex('#ff9aa8') } },
    nanab: { m: BM, c: { g: 0xff3aa84a, b: U.hex('#f0d040'), l: 0xffffffff } }, sitrus: { m: BM, c: { g: 0xff3aa84a, b: U.hex('#ffe030'), l: 0xffffffff } },
    berry: { m: ['...g..', '..gg..', '.bbbb.', 'bblbbb', 'blbbbb', 'bbbbbb', '.bbbb.'], c: { g: 0xff3aa84a, b: 0xffe07a3a, l: 0xffffc8a0 } },
    shell: { m: ['...a...', '..aba..', '.abcba.', 'abcdcba', 'bcdddcb', '.bbbbb.'], c: { a: 0xffeaf0ff, b: 0xffc0c8f8, c: 0xff9aa0e8, d: 0xff7a80c8 } },
    pearl: { m: ['.aaa.', 'awaab', 'aaabb', 'aabbb', '.bbb.'], c: { a: 0xfff8f0ff, w: 0xffffffff, b: 0xffd8c8e0 } },
    mushroom: { m: ['.rrrr.', 'rwrrwr', 'rrrrrr', '..ss..', '..ss..', '.ssss.'], c: { r: 0xff3a3ae0, w: 0xffffffff, s: 0xffd0e0f0 } },
    gem: { m: ['..a..', '.aab.', 'abbcc', '.bcc.', '..c..'], c: { a: 0xffffe0b0, b: 0xfff0a060, c: 0xffc06a30 } },
    stardust: { m: ['...a...', '..aba..', 'abbwbba', '.abbba.', '.ab.ba.', 'a.....a'], c: { a: 0xff2a8ae0, b: 0xff60c8ff, w: 0xffffffff } },
    blueorb: { m: ['.aaa.', 'awbba', 'abbbc', 'abbcc', '.ccc.'], c: { a: U.hex('#3a8aff'), w: 0xffffffff, b: U.hex('#1a5ad8'), c: U.hex('#0a2a8a') } },
    redorb: { m: ['.aaa.', 'awbba', 'abbbc', 'abbcc', '.ccc.'], c: { a: U.hex('#ff5a4a'), w: 0xffffffff, b: U.hex('#d82a2a'), c: U.hex('#7a0a14') } },
    icegem: { m: ['..a..', '.awa.', 'abbba', '.bcb.', '..c..'], c: { a: U.hex('#dff8ff'), w: 0xffffffff, b: U.hex('#8ad8f8'), c: U.hex('#3a9ad8') } },
  };
  function draw(fb, t) {
    const S = UI.skin(), C = UI.C, W = fb.w, H = fb.h, hx = U.hex;
    UI.dim(fb, Math.min(1, B.t / 0.15), 0.55);
    const k = UI.openK(B.t, 0.26);
    const pw = Math.min(W - 16, 390), ph = Math.min(H - 10, 250), x0 = Math.round((W - pw) / 2), y0 = Math.round((H - ph) / 2 + (1 - k) * 60);
    // the backpack: stitched leather body with a flap
    const leather = hx('#d86a2a'), leatherL = hx('#f08e4a'), leatherD = hx('#a04a1a'), flap = hx('#c05820'), stitch = hx('#ffb87a');
    UI.shadow(fb, x0, y0, pw, ph, 14, 4, 0.6);
    UI.rrect(fb, x0, y0, pw, ph, 14, C.ink); UI.rrect(fb, x0 + 2, y0 + 2, pw - 4, ph - 4, 12, leather);
    UI.hline(fb, x0 + 14, x0 + pw - 14, y0 + 3, leatherL); UI.hline(fb, x0 + 14, x0 + pw - 14, y0 + ph - 4, leatherD);
    for (let x = x0 + 12; x < x0 + pw - 12; x += 4) { UI.put(fb, x, y0 + 7, stitch); UI.put(fb, x, y0 + ph - 8, stitch); }
    for (let y = y0 + 12; y < y0 + ph - 12; y += 4) { UI.put(fb, x0 + 6, y, stitch); UI.put(fb, x0 + pw - 7, y, stitch); }
    UI.rrect(fb, x0 + 10, y0 + 9, pw - 20, 28, 8, C.ink); UI.rrect(fb, x0 + 11, y0 + 10, pw - 22, 26, 7, flap); UI.hline(fb, x0 + 18, x0 + pw - 18, y0 + 11, leatherL);
    HUD.icoBag(fb, x0 + 25, y0 + 23);
    Font.draw(fb, 'BAG', x0 + 36, y0 + 17, WHITE, { font: 'title', outline: C.ink });
    // buckle
    UI.rrect(fb, x0 + pw / 2 - 8, y0 + 32, 16, 10, 2, C.ink); UI.rect(fb, x0 + pw / 2 - 6, y0 + 34, 12, 6, hx('#ffd23a')); UI.put(fb, x0 + pw / 2 - 5, y0 + 35, WHITE);
    // close
    const cx = x0 + pw - 30, cy = y0 + 15;
    UI.closeBtn(fb, cx, cy, { hover: HUD.hoverId === 'bagx', down: HUD.pressed('bagx') });
    HUD.btn('bagx', cx - 3, cy - 3, 22, 20, close);
    // tabs
    let tx = x0 + 76;
    TABS.forEach((name, i) => {
      const w = Font.measure(name, 'small') + 16, on = B.tab === i, id = 'bagt' + i;
      if (tx + w > cx - 6) return;
      UI.button(fb, tx, y0 + 15, w, 14, { label: name, fill: on ? hx('#ffd23a') : hx('#8a3a12'), fg: on ? C.ink : WHITE, hover: HUD.hoverId === id, down: HUD.pressed(id) });
      HUD.btn(id, tx, y0 + 13, w, 18, () => { if (B.tab !== i) { B.tab = i; B.sel = 0; Game.sfx('page', null, 0.4); } });
      tx += w + 4;
    });
    // list pocket
    const lx = x0 + 12, ly = y0 + 45, lw = pw - 24, lh = ph - 56;
    UI.rrect(fb, lx, ly, lw, lh, 8, C.ink); UI.rrect(fb, lx + 1, ly + 1, lw - 2, lh - 2, 7, hx('#fbf6ea'));
    const L = listFor(B.tab), rowH = 19, descH = 24, maxRows = Math.max(1, Math.floor((lh - descH - 8) / rowH));
    B.sel = clamp(B.sel, 0, Math.max(0, L.length - 1));
    const first = clamp(B.sel - maxRows + 1, 0, Math.max(0, L.length - maxRows));
    for (let r = 0; r < Math.min(maxRows, L.length - first); r++) {
      const i = first + r, it = L[i], y = ly + 5 + r * rowH, sel = i === B.sel, rid = 'bagr' + i;
      if (sel) { UI.rrect(fb, lx + 4, y - 1, lw - 12, rowH - 1, 5, hx('#ffe9b0')); UI.rect(fb, lx + 4, y + 2, 2, rowH - 7, hx('#e07a2a')); }
      else if (HUD.hoverId === rid) UI.rrect(fb, lx + 4, y - 1, lw - 12, rowH - 1, 5, hx('#f4ecd8'));
      if (B.tab === 0) {
        const ic = IC[it.id]; if (ic) UI.pix(fb, ic.m, lx + 11, y + 2, ic.c, 2); else if (it.id === 'jam') Font.icon(fb, 'note', lx + 12, y + 4, 2);
        Font.draw(fb, it.name, lx + 30, y + 5, C.text, { font: 'small' });
        if (!it.always) Font.draw(fb, '×' + Save.itemN(it.id), lx + lw - 76, y + 5, C.dim, { font: 'small', align: 'right' });
        if (B.fresh0 && B.fresh0[it.id]) Font.icon(fb, 'new', lx + 30 + Font.measure(it.name, 'small') + 4, y + 2, 1);
      } else if (B.tab === 1) {
        const own = Moves.has(it.id);
        UI.disc(fb, lx + 16, y + 8, 7, C.ink); UI.disc(fb, lx + 16, y + 8, 6, own ? it.col : hx('#8a8ea0'));
        if (own) Moves.icon(fb, it.id, lx + 16, y + 8, 1); else Font.draw(fb, '?', lx + 16, y + 5, WHITE, { font: 'small', align: 'center' });
        if (it.tm) UI.chip(fb, lx + 28, y + 3, it.tm, { bg: own ? hx('#3a78e8') : hx('#9aa0b8'), h: 9, pad: 6, ol: null });
        Font.draw(fb, own ? it.name : '???', lx + (it.tm ? 62 : 30), y + 5, own ? C.text : hx('#8a8ea0'), { font: 'small' });
        if (Moves.current().id === it.id) UI.chip(fb, lx + lw - 12, y + 3, 'ON B', { align: 'right', bg: hx('#2ab870'), h: 9, pad: 8, ol: null });
        else if (!own) Font.draw(fb, 'not learned', lx + lw - 12, y + 5, hx('#a0a4b4'), { font: 'small', align: 'right' });
      } else {
        UI.rrect(fb, lx + 8, y + 1, 16, 14, 3, C.ink); UI.rrect(fb, lx + 9, y + 2, 14, 12, 2, it.seen ? hx('#c04a9a') : hx('#5a5e70'));
        Font.draw(fb, it.no, lx + 16, y + 5, WHITE, { font: 'small', align: 'center' });
        Font.draw(fb, it.seen ? it.title : '? ? ?', lx + 30, y + 5, it.seen ? C.text : hx('#8a8ea0'), { font: 'small' });
        if (it.seen) Font.draw(fb, it.who + '  >', lx + lw - 12, y + 5, hx('#a0306a'), { font: 'small', align: 'right' });
      }
      HUD.btn(rid, lx + 4, y - 1, lw - 12, rowH - 1, () => { if (B.tab === 0) { B.sel = i; Game.sfx('blip', null, 0.4); } else { B.sel = i; act(B.tab, i); } });
      // the action button sits on top of the row (buttons registered later win)
      if (B.tab === 0 && (it.use || it.trade)) {
        const lab = it.use || ('Trade +' + it.trade), bw = Math.min(62, Font.measure(lab, 'small') + 14), bx = lx + lw - 68, aid = 'baga' + i;
        UI.button(fb, bx, y + 1, bw, 14, { label: lab, fill: it.use ? hx('#2ab870') : hx('#3a78e8'), hover: HUD.hoverId === aid, down: HUD.pressed(aid) });
        HUD.btn(aid, bx - 1, y, bw + 2, 16, () => { B.sel = i; UI.pop(bx + bw / 2, y + 8, 10); act(0, i); });
      }
    }
    if (!L.length) Font.draw(fb, 'Empty!', lx + lw / 2, ly + 30, hx('#8a8ea0'), { font: 'body', align: 'center' });
    // scroll bar
    if (L.length > maxRows) {
      const th = Math.max(8, Math.round((maxRows * rowH) * maxRows / L.length)), tr = maxRows * rowH, ty = ly + 5 + Math.round((tr - th) * first / Math.max(1, L.length - maxRows));
      UI.rect(fb, lx + lw - 6, ly + 5, 2, tr, hx('#eadcc0')); UI.rect(fb, lx + lw - 6, ty, 2, th, hx('#c08a5a'));
    }
    // description strip
    const it = L[B.sel], dy = ly + lh - descH;
    UI.hline(fb, lx + 6, lx + lw - 7, dy - 2, hx('#e2d6bc'));
    const desc = !it ? '' : B.tab === 0 ? it.desc : B.tab === 1 ? (Moves.has(it.id) ? it.desc || '' : 'How to learn: ' + (it.how || '?')) : it.seen ? 'Replay this memory.' : 'Discover something legendary to unlock it.';
    Font.wrap(desc, 'small', lw - 20).slice(0, 2).forEach((l, i) => Font.draw(fb, l, lx + 10, dy + 3 + i * 9, hx('#4a4e62'), { font: 'small' }));
    // points
    const pts = '{coin}' + Save.data.points, pwid = Font.measure(pts, 'small') + 12;
    UI.chip(fb, x0 + pw - 18 - pwid, y0 + ph - 6, pts, { w: pwid, h: 10, bg: hx('#8a3a12') });
  }
  return Object.assign(B, { open, close, update, key, wheel, draw, fresh, ITEMS });
})();
