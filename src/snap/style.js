/* ------------------------------------------------------------------
   Style — the wardrobe (V). The old noon beach painting comes back as
   a living dressing room: Mudkip keeps heading the beach ball in the
   shallows while you try on hats, shirts, shades, neckwear, shoes and
   silly extras. Tap the ball or Mudkip to play. Locked items show how
   to earn them; some can be bought with research points.
------------------------------------------------------------------- */
const Style = (() => {
  const { clamp } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const ST = { t: 0, tab: 0, sel: 0, pt: null, buf: null, fresh: {}, hover: -1, spin: 0 };
  const CATS = [
    { slot: 'hat', name: 'Hats', items: ['hat.party', 'hat.crown', 'hat.propeller', 'hat.bow', 'hat.chef', 'hat.headphones', 'hat.pirate', 'hat.straw', 'hat.bucket', 'hat.beanie', 'hat.sailor', 'hat.flower', 'hat.star', 'hat.lobster'] },
    { slot: 'shirt', name: 'Shirts', items: ['shirt.heart', 'shirt.stripe', 'shirt.hoodie', 'shirt.pop'] },
    { slot: 'glasses', name: 'Shades', items: ['glasses.round', 'glasses.star', 'glasses.rock'] },
    { slot: 'neck', name: 'Neck', items: ['neck.lei', 'neck.medal', 'neck.bow', 'neck.scarf', 'neck.camera'] },
    { slot: 'shoes', name: 'Shoes', items: ['shoes.sneakers', 'shoes.boots'] },
    { slot: 'fun', name: 'Fun', items: ['fun.stache', 'fun.floaties', 'fun.ring'] },
  ];
  // how to get what you do not have yet
  const HOW = { 'hat.headphones': 'Get an A rank in the Guitar Jam (G).', 'glasses.rock': 'Get an S rank in the Guitar Jam.',
    'hat.party': 'Help a hungry Spheal at the cove.', 'hat.crown': 'Photograph Bagon smashing the boulder.', 'hat.propeller': 'Nap next to Slakoth in the forest.',
    'shoes.boots': 'Throw Ludicolo a dance party.', 'shoes.sneakers': 'A memory from the edge of space.', 'fun.ring': 'A memory from the deep blue sea.',
  };
  const PRICE = { 'hat.pirate': 1500, 'neck.medal': 2500, 'hat.bow': 400, 'hat.chef': 700, 'neck.lei': 500, 'fun.floaties': 800, 'shoes.sneakers': 1200, 'fun.ring': 900, 'shirt.stripe': 700, 'neck.bow': 500, 'neck.scarf': 600 };
  function open() {
    if (Game.mode !== 'explore') return;
    Game.mode = 'style'; Game.frozenFrame = false; ST.t = 0;
    if (typeof Pad !== 'undefined') Pad.reset();
    if (!ST.pt && typeof Paintings !== 'undefined') {
      try { ST.pt = Paintings.noon(); ST.buf = new PX.Buf(Paintings.W, Paintings.H); ST.pt.warm(1.2); } catch (e) { console.error(e); ST.pt = null; }
    }
    dressActor();
    Game.sfx('hinge'); Game.sfx('chime', null, 0.4);
    Game.pushBack && Game.pushBack();
  }
  function close() { if (Game.mode !== 'style') return; Game.mode = 'explore'; Game.sfx('back'); if (Game.mudkip) Game.mudkip.setLook(Save.look()); }
  const actor = () => (ST.pt && ST.pt._dbg ? ST.pt._dbg().mk : null);
  function dressActor() {
    const mk = actor(); if (!mk) return;
    const L = Save.look(); delete L.neck; // no camera on the beach
    if (Save.data.equip.neck && Save.data.equip.neck !== 'neck.camera') L.neck = Save.data.equip.neck.split('.')[1];
    mk.extra = L; mk.budget = mk.budget || { n: 1 };
  }
  const owned = (id) => Save.has(id);
  function markNew(id) { if (id && id.includes('.')) { ST.fresh[id] = 1; } }
  const fresh = () => Object.keys(ST.fresh).length > 0;
  function toggle(id) {
    const c = Rewards.C[id]; if (!c) return;
    if (!owned(id)) {
      const pr = PRICE[id];
      if (pr && Save.data.points >= pr) { Save.data.points -= pr; Save.own(id); Game.sfx('reward'); HUD.toast('Bought: ' + c.name + '!', { life: 2 }); }
      else { Game.sfx('error'); HUD.toast((HOW[id] || 'Keep exploring to find it.') + (pr ? '  (or ' + pr + ' pts)' : ''), { life: 3 }); return; }
    }
    const slot = c.slot;
    const on = Save.data.equip[slot] === id;
    Save.equip(slot, on ? null : id);
    delete ST.fresh[id];
    Game.sfx(on ? 'back' : 'select');
    dressActor();
    const mk = actor(); if (mk) { mk.fin.kick(4); mk.tail.kick(4); }
    ST.spin = 0.5;
  }
  function randomize() {
    for (const c of CATS) { const own = c.items.filter(owned); const pick = own.length && Math.random() < 0.75 ? own[(Math.random() * own.length) | 0] : null; if (c.slot !== 'neck') Save.equip(c.slot, pick); }
    Game.sfx('sparkle'); dressActor(); ST.spin = 0.6;
  }
  function update(dt) {
    ST.t += dt; ST.spin = Math.max(0, ST.spin - dt);
    const mk = actor();
    if (mk) { mk.budget = mk.budget || { n: 1 }; mk.budget.n = 1; if (mk.extra && mk.extra.hat === 'propeller') mk.extra.prop = (Math.floor(ST.t * 10) % 3) * (Math.PI / 3); }
    if (ST.pt) {
      const snd = ST.pt.step(Math.min(dt, 1 / 20)) || [];
      for (const s of snd) Game.sfx({ splash: 'splash', boing: 'boing', jump: 'boing', plip: 'plop', cry: 'mud', twinkle: 'twinkle' }[s.name] || 'pop', null, s.big ? 0.8 : 0.4);
    }
  }
  function key(k) {
    const cat = CATS[ST.tab];
    if (k === 'Escape' || k === 'v') { close(); return; }
    if (k === 'ArrowLeft' || k === 'a') { ST.sel = (ST.sel + cat.items.length - 1) % cat.items.length; Game.sfx('blip', null, 0.4); return; }
    if (k === 'ArrowRight' || k === 'd') { ST.sel = (ST.sel + 1) % cat.items.length; Game.sfx('blip', null, 0.4); return; }
    if (k === 'ArrowUp' || k === 'w' || k === 'q') { ST.tab = (ST.tab + CATS.length - 1) % CATS.length; ST.sel = 0; Game.sfx('page', null, 0.4); return; }
    if (k === 'ArrowDown' || k === 's' || k === 'e' || k === 'Tab') { ST.tab = (ST.tab + 1) % CATS.length; ST.sel = 0; Game.sfx('page', null, 0.4); return; }
    if (k === ' ' || k === 'Enter' || k === 'x') toggle(cat.items[ST.sel]);
    if (k === 'r') randomize();
  }
  function wheel(dy) { const cat = CATS[ST.tab]; ST.sel = clamp(ST.sel + Math.sign(dy), 0, cat.items.length - 1); }
  // tiny swatch icons per item (colours of the real 3D item)
  const SW = {
    'hat.party': ['#ff78b0', '#ffe060'], 'hat.crown': ['#f0c038', '#e84a44'], 'hat.propeller': ['#e84a44', '#ffe060', '#3a70cc'], 'hat.straw': ['#e6c474', '#e84a44'], 'hat.bucket': ['#f4d272', '#86a1e4'],
    'hat.beanie': ['#86a1e4', '#ffffff'], 'hat.sailor': ['#ffffff', '#3150ae'], 'hat.flower': ['#f890b8', '#ffffff'], 'hat.star': ['#f0c038', '#f890b8'], 'hat.lobster': ['#e84a44', '#ffffff'],
    'shirt.heart': ['#f890b8', '#e84a44'], 'shirt.stripe': ['#ffffff', '#3150ae'], 'shirt.hoodie': ['#fb8f3c', '#ffffff'], 'shirt.pop': ['#c43cbc', '#f0c038'],
    'glasses.round': ['#262e40', '#58a0d8'], 'glasses.star': ['#f890b8', '#7c285c'], 'neck.bow': ['#e84a44', '#8e1c2c'], 'neck.scarf': ['#e84a44', '#ff7a62'], 'neck.camera': ['#e84a44', '#ffffff'],
    'shoes.sneakers': ['#e84a44', '#ffffff'], 'hat.bow': ['#e84a44', '#ff7a62'], 'hat.headphones': ['#262e40', '#c43cbc'], 'hat.pirate': ['#262e40', '#ffffff'], 'glasses.rock': ['#e84a44', '#7c285c'], 'neck.medal': ['#f0c038', '#3150ae'], 'hat.chef': ['#ffffff', '#c2cde0'], 'neck.lei': ['#f890b8', '#f4d272'], 'fun.floaties': ['#fb8f3c', '#f4d272'], 'shoes.boots': ['#f4d272', '#262e40'], 'fun.stache': ['#3a2a20', '#6a4a36'], 'fun.ring': ['#e84a44', '#ffffff'],
  };
  function swatch(fb, id, x, y, s, locked) {
    const cols = (SW[id] || ['#8a8ea0']).map(U.hex);
    if (locked) { UI.disc(fb, x, y, s, 0xff3a3e50); Font.draw(fb, '?', x, y - 4, 0xffa0a4b8, { font: 'small', align: 'center' }); return; }
    // a little picture of the item
    const [a, b, c] = cols;
    if (id.startsWith('hat.')) { UI.rrect(fb, x - s + 2, y - s + 3, s * 2 - 4, s, 3, a); UI.rect(fb, x - s, y + 2, s * 2, 2, b || a); if (c) UI.put(fb, x, y - s + 2, c); }
    else if (id.startsWith('shirt.')) { UI.rrect(fb, x - s + 2, y - s + 3, s * 2 - 4, s * 2 - 5, 2, a); UI.rect(fb, x - s, y - s + 3, 3, 4, a); UI.rect(fb, x + s - 3, y - s + 3, 3, 4, a); UI.disc(fb, x, y, 2, b); }
    else if (id.startsWith('glasses.')) { UI.disc(fb, x - 4, y, 3, a); UI.disc(fb, x + 4, y, 3, a); UI.disc(fb, x - 4, y, 2, b); UI.disc(fb, x + 4, y, 2, b); UI.hline(fb, x - 1, x + 1, y - 1, a); }
    else if (id.startsWith('neck.')) { UI.disc(fb, x - 4, y, 3, a); UI.disc(fb, x + 4, y, 3, a); UI.disc(fb, x, y, 2, b); }
    else if (id.startsWith('shoes.')) { UI.rrect(fb, x - 6, y - 3, 12, 6, 2, a); UI.rect(fb, x - 6, y + 2, 12, 2, b); }
    else if (id === 'fun.stache') { for (let i = -6; i <= 6; i++) { const yy = Math.round(Math.abs(i) * Math.abs(i) * 0.06); UI.rect(fb, x + i, y - yy, 1, 3, a); } }
    else if (id === 'fun.ring') { UI.ring(fb, x, y, s - 1, a, 3); for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; UI.disc(fb, Math.round(x + Math.cos(an) * (s - 2)), Math.round(y + Math.sin(an) * (s - 2)), 1, b); } }
  }
  function draw(fb, t) {
    const W = fb.w, H = fb.h, S = UI.skin();
    fb.d.fill(0xff182040);
    // the living beach, scaled to cover the screen (portrait: the top half)
    const portrait = H > W * 1.1;
    const sceneH = portrait ? Math.round(H * 0.56) : H;
    if (ST.pt) {
      ST.pt.draw(ST.buf);
      const sc = Math.max(1, Math.ceil(Math.max(W / ST.buf.w, sceneH / ST.buf.h)));
      const mk = actor(), fx = mk ? mk.x : ST.buf.w / 2;
      const panelW = portrait ? 0 : Math.min(230, Math.round(W * 0.42));
      // keep Mudkip in the middle of the free space
      let ox = Math.round((W - panelW) / 2 - fx * sc), oy = Math.round(sceneH / 2 - ST.buf.h * 0.62 * sc);
      ox = clamp(ox, W - ST.buf.w * sc, 0); oy = clamp(oy, sceneH - ST.buf.h * sc, 0);
      const src = ST.buf.d, bw = ST.buf.w;
      for (let y = 0; y < sceneH; y++) { const sy = Math.floor((y - oy) / sc); if (sy < 0 || sy >= ST.buf.h) continue; const row = y * W; for (let x = 0; x < W; x++) { const sx = Math.floor((x - ox) / sc); if (sx < 0 || sx >= bw) continue; fb.d[row + x] = src[sy * bw + sx] | 0xff000000; } }
      ST.view = { ox, oy, sc, h: sceneH };
      HUD.btn('stplay', 0, 0, W - panelW, sceneH, (ux, uy) => { if (!ST.view) return; const r = ST.pt.tap((ux - ST.view.ox) / ST.view.sc, (uy - ST.view.oy) / ST.view.sc); if (r === 'mudkip') Game.sfx('mud', null, 0.7); });
      if (ST.spin > 0) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + t * 4, r = 26 + (0.6 - ST.spin) * 40; const [px, py] = mk ? [ox + mk.x * sc, oy + (mk.gy - mk.h - 20) * sc] : [W / 2, H / 2]; UI.put(fb, Math.round(px + Math.cos(a) * r), Math.round(py + Math.sin(a) * r * 0.6), 0xfffff4a0); }
    }
    // title ribbon
    UI.panel(fb, 8, 8, 104, 18, { r: 5, ol: INK, fill: 0xffc04a9a }); Font.draw(fb, 'WARDROBE', 60, 12, WHITE, { font: 'small', align: 'center' });
    // the panel
    const pw = portrait ? W - 16 : Math.min(230, Math.round(W * 0.42)), px = portrait ? 8 : W - pw - 8, py = portrait ? sceneH + 4 : 34;
    const rowsN = Math.ceil(CATS[ST.tab].items.length / Math.max(1, Math.floor((pw - 12) / 40)));
    const ph = portrait ? H - sceneH - 12 : Math.min(H - 42, 32 + rowsN * 42 + 40);
    UI.rrect(fb, px, py + 3, pw, ph, 10, 0x800a0e1a);
    UI.rrect(fb, px, py, pw, ph, 10, INK); UI.rrect(fb, px + 1, py + 1, pw - 2, ph - 2, 9, 0xfff6f0e4); UI.rectA(fb, px + 4, py + 30, pw - 8, ph - 64, 0xfff6f0e4, 0.0);
    // category tabs (icons + names)
    const tw = Math.floor((pw - 12) / CATS.length);
    CATS.forEach((c, i) => {
      const x = px + 6 + i * tw, on = ST.tab === i;
      UI.panel(fb, x, py + 6 + (on ? 0 : 2), tw - 2, 18, { r: 4, ol: INK, fill: on ? 0xffffd23a : 0xff5a8ad8, hi: null, sh: null });
      Font.draw(fb, c.name, x + (tw - 2) / 2, py + 11 + (on ? 0 : 2), on ? INK : WHITE, { font: 'small', align: 'center' });
      if (c.items.some((id) => ST.fresh[id])) { UI.disc(fb, x + tw - 5, py + 7, 2, 0xff3a4aff); }
      HUD.btn('stc' + i, x, py + 4, tw - 2, 22, () => { ST.tab = i; ST.sel = 0; Game.sfx('page', null, 0.4); });
    });
    // item grid
    const cat = CATS[ST.tab], cell = 40, cols = Math.max(1, Math.floor((pw - 12) / cell));
    ST.sel = clamp(ST.sel, 0, cat.items.length - 1);
    cat.items.forEach((id, i) => {
      const c = Rewards.C[id]; if (!c) return;
      const x = px + 8 + (i % cols) * cell, y = py + 32 + Math.floor(i / cols) * (cell + 2);
      if (y + cell > py + ph - 34) return;
      const own = owned(id), eq = Save.data.equip[c.slot] === id, sel = ST.sel === i;
      UI.rrect(fb, x, y, cell - 4, cell - 4, 6, sel ? 0xffff9a3a : INK);
      UI.rrect(fb, x + 1, y + 1, cell - 6, cell - 6, 5, eq ? 0xffb8f0ff : own ? WHITE : 0xffd8d4cc);
      swatch(fb, id, x + (cell - 4) / 2, y + (cell - 4) / 2 - 2, 9, !own);
      if (eq) { UI.disc(fb, x + cell - 9, y + 5, 4, 0xff2ab870); Font.icon(fb, 'check', x + cell - 12, y + 2, 1); }
      if (ST.fresh[id]) Font.icon(fb, 'new', x + 1, y + 1, 1);
      if (!own && PRICE[id]) Font.draw(fb, PRICE[id] + '', x + (cell - 4) / 2, y + cell - 13, 0xff6a5a3a, { font: 'small', align: 'center' });
      HUD.btn('sti' + i, x, y, cell - 4, cell - 4, () => { ST.sel = i; toggle(id); });
    });
    // selected item info
    const id = cat.items[ST.sel], c = Rewards.C[id];
    if (c) {
      const own = owned(id), iy = py + ph - 30;
      UI.rect(fb, px + 8, iy - 3, pw - 16, 1, 0xffd8d0bc);
      Font.draw(fb, own ? c.name : '???', px + 10, iy, INK, { font: 'small' });
      Font.wrap(own ? c.desc : (HOW[id] || 'Keep exploring to find it.') + (PRICE[id] ? '  (' + PRICE[id] + ' pts)' : ''), 'small', pw - 20).slice(0, 2).forEach((l, i) => Font.draw(fb, l, px + 10, iy + 9 + i * 9, 0xff5a5e72, { font: 'small' }));
    }
    // buttons: random outfit, done
    const by = portrait ? py - 24 : H - 30;
    const b1x = portrait ? 8 : 8, b2x = portrait ? W - 64 : px - 62;
    const p1 = HUD.pressed('strnd') ? 1 : 0, p2 = HUD.pressed('stdone') ? 1 : 0;
    UI.panel(fb, b1x, by + p1, 58, 18, { r: 5, ol: INK, fill: 0xff8a4ac8 }); Font.draw(fb, 'Random!', b1x + 29, by + 5 + p1, WHITE, { font: 'small', align: 'center' });
    HUD.btn('strnd', b1x - 2, by - 2, 62, 22, randomize);
    UI.panel(fb, b2x, by + p2, 56, 18, { r: 5, ol: INK, fill: 0xff2ab870 }); Font.draw(fb, 'Done', b2x + 28, by + 5 + p2, WHITE, { font: 'small', align: 'center' });
    HUD.btn('stdone', b2x - 2, by - 2, 60, 22, close);
    Font.draw(fb, '{coin}' + Save.data.points, portrait ? W - 10 : px - 8, portrait ? 12 : 12, WHITE, { font: 'small', align: 'right', outline: INK });
  }
  return Object.assign(ST, { open, close, update, key, wheel, draw, markNew, fresh, CATS });
})();
