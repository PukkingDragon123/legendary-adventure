/* ------------------------------------------------------------------
   Moves — Mudkip's TM moves and the radial move wheel.
   B (or X) uses the selected move; hold B (or press Q) to open the
   wheel (time slows while it is open), slide or tap to pick a move.
   Each move does something different in the world:
     Water Gun  sprays: wakes, waters, cleans, makes Solrock flare
     Tackle     a charging bump: shakes trees, bops Pokémon, knocks shells
     Sing       plays a song on the guitar
     Scan       the Pokédex scanner finds secrets
     Bubble     floating bubbles Pokémon love to chase and pop
     Growl      a big "Mud-KIP!": nearby Pokémon look your way (photo trick!)
     Dig        digs anywhere on sand or soil for buried treasure
     Rock Smash breaks cracked rocks and boulders
     Ice Beam   freezes the water into floes you can hop across
   New moves are learned by watching Pokémon do them (stay close for a
   moment), from quests, NPC trainers, hosted games and challenges
   (TM discs are no longer lying around in the world). More TMs are
   added by tmfx.js. Every move has a cooldown (shown as a dark sweep
   on the B button, the move chip and the wheel).
------------------------------------------------------------------- */
const Moves = (() => {
  const { clamp, lerp, rnd, hex } = U;
  const LIST = [
    { id: 'water', name: 'Water Gun', col: hex('#3a8ae8'), start: true, desc: 'Spray water. Wakes, waters and splashes.' },
    { id: 'tackle', name: 'Tackle', col: hex('#e0962a'), start: true, desc: 'Charge and bump! Shakes trees, bops Pokémon.' },
    { id: 'sing', name: 'Sing', col: hex('#e0529e'), start: true, desc: 'Play a song on the guitar.' },
    { id: 'scan', name: 'Scan', col: hex('#2eb07e'), start: true, desc: 'Scan with the Pokédex to find secrets.' },
    { id: 'bubble', name: 'Bubble', col: hex('#52c4ea'), tm: 'TM01', how: 'Watch Clamperl or Wailmer blow bubbles, or help Luvdisc find its lost pearl.', desc: 'Blow floating bubbles. Pokémon love to chase and pop them!', watch: { kinds: ['clamperl', 'wailmer', 'luvdisc', 'corphish'], acts: ['open', 'spout', 'pearl', 'bubble', 'kiss'] } },
    { id: 'growl', name: 'Growl', col: hex('#e8b02a'), tm: 'TM02', how: 'Cheer along with Plusle and Minun, or teach Chatot a song in Treetop Town.', desc: 'A big "Mud-KIP!": nearby Pokémon all look your way. Photo trick!', watch: { kinds: ['plusle', 'minun', 'chatot'], acts: ['cheer', 'duo', 'mimic'] } },
    { id: 'dig', name: 'Dig', col: hex('#a8683a'), tm: 'TM03', how: 'Watch a Zigzagoon dig, or find its buried treasure in Weather Woods.', desc: 'Dig anywhere on sand or soil. Buried treasure awaits!', watch: { kinds: ['zigzagoon', 'trapinch'], acts: ['find', 'sniff', 'chomp'] } },
    { id: 'smash', name: 'Rock Smash', col: hex('#c0543a'), tm: 'TM04', how: 'Watch Bagon headbutt a boulder, or out-flop Corphish on the beach.', desc: 'Break cracked rocks and boulders. Secrets hide inside!', watch: { kinds: ['bagon'], acts: ['headbutt'] } },
    { id: 'ice', name: 'Ice Beam', col: hex('#8adcf4'), tm: 'TM05', how: 'Watch Walrein use Ice Beam, or cheer grumpy Walrein up with a photo.', desc: 'Freeze the water into floes you can hop across.', watch: { kinds: ['walrein', 'sealeo'], acts: ['icebeam'] } },
  ];
  const DEF = Object.fromEntries(LIST.map((m) => [m.id, m]));
  // cooldowns (seconds) per move; moves added later carry their own `cool`
  const COOL = { water: 0.6, tackle: 1.2, sing: 3, scan: 0, bubble: 2, growl: 5, dig: 3, smash: 2.5, ice: 6 };
  for (const m of LIST) if (m.cool === undefined) m.cool = COOL[m.id] ?? 2;
  const cd = {};
  const coolLeft = (id) => Math.max(0, (cd[id] || 0) - Game.t);
  const coolK = (id) => { const d = DEF[id]; return d && d.cool ? Math.min(1, coolLeft(id) / d.cool) : 0; };
  // add a move from another file (tmfx.js): { id, name, col, tm, how, desc, cool, icon, run(mk, tx, ty) → generator }
  function add(d) { if (DEF[d.id]) return DEF[d.id]; if (d.cool === undefined) d.cool = 3; LIST.push(d); DEF[d.id] = d; if (d.icon) ICON[d.id] = d.icon; return d; }
  const M = { cur: 'water', wheel: null, pressing: false, pressT: 0, watchT: {}, learnFx: null };
  const tms = () => Save.data.tms || (Save.data.tms = {});
  const has = (id) => !!DEF[id] && (DEF[id].start || !!tms()[id]);
  const current = () => DEF[M.cur] || LIST[0];
  function unlock(id, how = '') {
    if (!DEF[id] || has(id)) return false;
    tms()[id] = Date.now(); Save.save();
    const d = DEF[id];
    M.cur = id;
    M.learnFx = { id, t: 0, how };
    Game.sfx('reward', null, 1); SFX.unlock && SFX.unlock();
    HUD.toast((d.tm ? d.tm + ' ' : '') + d.name + ' learned! ' + how + ' (hold B for the move wheel)', { life: 3.6, col: d.col });
    return true;
  }
  /* ---------- input ---------- */
  function press() { M.pressing = true; M.pressT = 0; }
  function release() {
    const held = M.pressT; M.pressing = false;
    if (M.wheel) { if (M.wheel.hover >= 0) select(M.wheel.hover); closeWheel(); return; }
    if (held < 0.3) use(M.cur);
  }
  // the wheel shows one page of moves at a time (3 pages)
  const PAGES = 3, per = () => Math.ceil(LIST.length / PAGES);
  const pageOf = (i) => Math.floor(Math.max(0, i) / per());
  const pageItems = (pg) => { const n = per(), a = []; for (let i = pg * n; i < Math.min(LIST.length, pg * n + n); i++) a.push(i); return a; };
  function flip(d) {
    const W = M.wheel; if (!W) return;
    const pg = (W.page + d + PAGES) % PAGES, it = pageItems(pg); if (!it.length) return;
    const j = W.hover - W.page * per();
    W.page = pg; W.flipT = 0; W.flipRT = performance.now(); W.flipD = d; W.hover = it[clamp(j, 0, it.length - 1)];
    W.arrowT = W.t; W.arrowD = d < 0 ? -1 : 1;
    Game.sfx('blip');
  }
  function openWheel() {
    if (M.wheel || Game.mode !== 'explore') return;
    const h = Math.max(0, LIST.findIndex((m) => m.id === M.cur));
    M.wheel = { t: 0, hover: h, page: pageOf(h), flipT: 1, flipD: 1, closing: 0, rt0: performance.now() };
    Game.sfx('blip');
  }
  // closing with a pick: a ring pops on the chosen slot and a few sparkles fly
  function closeWheel() {
    const W = M.wheel; if (!W) return;
    if (W.L && W.picked >= 0 && LIST[W.picked]) { const [sx, sy] = slotXY(W.L, W.picked); UI.pop(sx, sy, W.L.r + 4, LIST[W.picked].col); UI.burst(sx, sy, 7, { speed: 35, c: 0xffffffff }); }
    M.wheel = null; Game.sfx('select');
  }
  function toggleWheel() { if (M.wheel) closeWheel(); else openWheel(); }
  function select(i) {
    const m = LIST[i]; if (!m) return;
    if (!has(m.id)) { HUD.toast((m.tm ? m.tm + ' ' : '') + m.name + ' — not learned yet. ' + m.how, { life: 3.2 }); Game.sfx('error'); return; }
    M.cur = m.id;
    if (M.wheel) M.wheel.picked = i;
  }
  // pointer over the wheel (UI coords): pick the slot in that direction
  function wheelPoint(ux, uy) {
    const W = M.wheel; if (!W || !W.L) return;
    const dx = ux - W.L.cx, dy = uy - W.L.cy;
    if (Math.hypot(dx, dy) < W.L.R * 0.35) return;
    let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    const it = pageItems(W.page);
    W.hover = it[Math.round(a / (Math.PI * 2) * it.length) % it.length];
  }
  function wheelKey(k) {
    const W = M.wheel; if (!W) return false;
    const step = (d) => { const h = (W.hover + d + LIST.length) % LIST.length; if (pageOf(h) !== W.page) { W.flipT = 0; W.flipRT = performance.now(); W.flipD = d; W.page = pageOf(h); } W.hover = h; };
    if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowUp' || k === 'w') { step(-1); return true; }
    if (k === 'ArrowRight' || k === 'd' || k === 'ArrowDown' || k === 's') { step(1); return true; }
    if (k === 'q' || k === 'PageUp' || k === '[') { flip(-1); return true; }
    if (k === 'e' || k === 'PageDown' || k === ']' || k === 'Tab') { flip(1); return true; }
    if (k === 'Enter' || k === 'x' || k === ' ') { select(W.hover); closeWheel(); return true; }
    if (k === 'Escape' || k === 'b') { closeWheel(); return true; }
    return false;
  }
  function tapWheel(ux, uy) {
    const W = M.wheel; if (!W || !W.L) return false;
    const L = W.L;
    // page arrows and dots
    for (const d of [-1, 1]) { const ax = L.cx + d * L.ax; if (Math.abs(ux - ax) < 16 && Math.abs(uy - L.cy) < 22) { flip(d); return true; } }
    for (const i of pageItems(W.page)) { const [sx, sy] = slotXY(L, i); if (Math.hypot(ux - sx, uy - sy) < L.r + 4) { W.hover = i; select(i); closeWheel(); return true; } }
    const cd = L.card;
    if (cd && ux >= cd.x && uy >= cd.y && ux < cd.x + cd.w && uy < cd.y + cd.h) { // the info card: its page dots flip, the rest keeps the wheel open
      if (uy < cd.y + 16 && ux > cd.x + cd.w - 16 - PAGES * 8) { const p = clamp(Math.round((ux - (cd.x + cd.w - 12 - (PAGES - 1) * 8)) / 8), 0, PAGES - 1); if (p !== W.page) flip(p - W.page); }
      return true;
    }
    if (Math.hypot(ux - L.cx, uy - L.cy) < L.R * 0.52) return true; // the centre: keep it open
    closeWheel(); return true;
  }
  // a touch released on the wheel: a swipe flips the page, a tap picks
  function wheelUp(p, ux, uy) {
    const dx = ux - p.x0, dy = uy - p.y0;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.2) { flip(dx < 0 ? 1 : -1); return true; }
    return tapWheel(p.x0, p.y0);
  }
  /* ---------- per frame ---------- */
  function update(dt) {
    if (M.pressing) { M.pressT += dt; if (M.pressT > 0.3 && !M.wheel) openWheel(); }
    if (M.wheel) { M.wheel.t += dt; M.wheel.flipT = Math.min(1, (M.wheel.flipT || 0) + dt * 5 / 0.2); }
    if (M.learnFx) { M.learnFx.t += dt; if (M.learnFx.t > 3.2) M.learnFx = null; }
    // learn by watching: stay close while a Pokémon uses a move
    const mk = Game.mudkip; if (!mk || Game.mode !== 'explore') return;
    for (const d of LIST) {
      if (!d.watch || has(d.id)) continue;
      const src = Mons.all.find((m) => m !== mk && m.alive && d.watch.kinds.includes(m.kind) && d.watch.acts.includes(m.act.id) && Math.hypot(m.x - mk.x, m.y - mk.y) < 170);
      if (src) {
        M.watchT[d.id] = (M.watchT[d.id] || 0) + dt;
        if (M.watchT[d.id] > 0.6 && !mk.watching) { mk.watching = src; if (!M.hinted) M.hinted = {}; if (!M.hinted[d.id]) { M.hinted[d.id] = 1; HUD.toast('Mudkip is watching ' + (DexData.S[src.dex] ? DexData.S[src.dex].name : 'it') + ' very closely...', { life: 2.2, col: d.col }); } }
        if (M.watchT[d.id] > 2.4) { M.watchT[d.id] = 0; mk.watching = null; unlock(d.id, 'Mudkip copied ' + (DexData.S[src.dex] ? DexData.S[src.dex].name : 'it') + '!'); }
      } else if (M.watchT[d.id]) M.watchT[d.id] = Math.max(0, M.watchT[d.id] - dt * 0.5);
    }
    if (mk.watching && (!mk.watching.alive || Math.hypot(mk.watching.x - mk.x, mk.watching.y - mk.y) > 200)) mk.watching = null;
  }
  /* ---------- using moves ---------- */
  function aim(mk, reach = 110) {
    const d = Math.cos(mk.yaw) >= 0 ? 1 : -1;
    let best = null, bd = 1e9;
    for (const m of Mons.all) { if (m === mk || !m.alive || !m.visible) continue; const dx = (m.x - mk.x) * d; if (dx < 4 || dx > reach) continue; const q = dx + Math.abs(m.y - mk.y) * 1.5; if (q < bd) { bd = q; best = m; } }
    if (best) { const c = best.center ? best.center() : [best.x, best.y - 12]; return [c[0], c[1], best]; }
    return [mk.x + d * 70, mk.y - (mk.mode === 'swim' ? 4 : 14), null];
  }
  function use(id) {
    const mk = Game.mudkip; if (!mk || Game.mode !== 'explore') return;
    if (!has(id)) { HUD.toast(DEF[id].name + ' is not learned yet.'); return; }
    if (mk.busy(2) && !(mk.task && mk.task.idle)) return;
    if (coolLeft(id) > 0) { if ((M.coolMsgT || 0) < Game.t) { M.coolMsgT = Game.t + 0.8; HUD.toast(DEF[id].name + ' is recharging... ' + coolLeft(id).toFixed(1) + 's', { life: 1, col: DEF[id].col }); } Game.sfx('error', null, 0.3); return; }
    cd[id] = Game.t + (DEF[id].cool || 0);
    mk.wakeUp();
    const [tx, ty] = aim(mk);
    switch (id) {
      case 'water': mk.doTask(mk.waterGun(tx, ty), 2); break;
      case 'tackle': mk.doTask(mk.tackle(), 2); break;
      case 'sing': if (!mk.busy(1)) mk.doTask(mk.song(), 2); break;
      case 'scan': HUD.tool('scan'); break;
      case 'bubble': mk.doTask(mk.bubble(tx, ty), 2); break;
      case 'growl': mk.doTask(mk.growl(), 2); break;
      case 'dig': mk.doTask(mk.dig(), 2); break;
      case 'smash': mk.doTask(mk.rockSmash(), 2); break;
      case 'ice': mk.doTask(mk.iceBeam(tx, ty), 2); break;
      default: if (DEF[id].run) { const g = DEF[id].run(mk, tx, ty); if (g) mk.doTask(g, 2); }
    }
  }
  /* ---------- drawing ---------- */
  // tiny pixel icons (k = ink, w = white, others from the move colour)
  const ICON = {
    water: ['...w...', '..www..', '.wwwww.', 'wwwwwww', 'wwkwwww', '.wwwww.', '..www..'],
    tackle: ['w..w..w', '.w.w.w.', '..www..', 'wwwkwww', '..www..', '.w.w.w.', 'w..w..w'],
    sing: ['...kkk.', '...k.kk', '...k...', '...k...', '.kkk...', 'kkkk...', '.kk....'],
    scan: ['.kkk...', 'k.w.k..', 'kwww.k.', 'k.w.k..', '.kkkk..', '....kk.', '.....kk'],
    bubble: ['....ww.', '...w..w', '.ww.ww.', 'w..w...', 'w..w.ww', '.ww.w..', '....ww.'],
    growl: ['k.....k', '.k.w.k.', '..www..', 'kwwkwwk', '..www..', '.k.w.k.', 'k.....k'],
    dig: ['.....kk', '....kk.', '...kk..', 'wwkk...', 'wwww...', 'wwww...', '.ww....'],
    smash: ['..kkk..', '.kwwwk.', 'kwkwwwk', 'kww.kwk', 'kwkwwwk', '.kwkwk.', '..kkk..'],
    ice: ['...w...', '.w.w.w.', '..www..', 'wwwkwww', '..www..', '.w.w.w.', '...w...'],
  };
  function icon(fb, id, cx, cy, s = 1) {
    const m = ICON[id]; if (!m) return;
    const h = m.length, w = m[0].length, x0 = Math.round(cx - (w * s) / 2), y0 = Math.round(cy - (h * s) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = m[y][x]; if (ch === '.') continue;
      const c = ch === 'k' ? 0xff1b2240 : 0xffffffff;
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) UI.put(fb, x0 + x * s + i, y0 + y * s + j, c);
    }
  }
  function slotXY(L, i) {
    const pg = pageOf(i), it = pageItems(pg), j = it.indexOf(i), n = it.length || 1;
    const a = -Math.PI / 2 + (j / n) * Math.PI * 2 + (L.spin || 0);
    return [L.cx + Math.cos(a) * L.R, L.cy + Math.sin(a) * L.R];
  }
  // where everything goes: the ring on the left, an info card on the right (landscape);
  // the ring on top and the card underneath on tall screens
  function wheelLayout(W, H) {
    const side = W >= H * 1.4;
    const R = Math.round(side ? Math.min(H * 0.31, W * 0.19) : Math.min(W * 0.3, H * 0.22)), r = Math.max(10, Math.round(Math.min(W, H) * 0.058));
    const ax = R + r + 15, ring = ax + 11;
    if (side) {
      const cw = Math.min(176, Math.round(W * 0.37)), gap = 12, tot = ring * 2 + gap + cw, x0 = Math.max(4, Math.round((W - tot) / 2));
      const cx = x0 + ring, cy = Math.round(H / 2 + 3), ch = Math.min(H - 20, 132);
      return { side, R, r, ax, cx, cy, card: { x: x0 + ring * 2 + gap, y: Math.round(cy - ch / 2), w: cw, h: ch } };
    }
    const cx = Math.round(W / 2), cy = Math.round(H * 0.08 + R + r + 12), cy2 = cy + R + r + 18, ch = Math.min(120, H - cy2 - 8);
    return { side, R, r, ax, cx, cy, card: ch > 44 ? { x: 8, y: cy2, w: W - 16, h: ch } : null };
  }
  function drawWheel(fb, S, t) {
    const W = M.wheel; if (!W) return;
    // (the world runs in slow motion while the wheel is open: the wheel itself animates in real time)
    const now = performance.now(), wt = (now - (W.rt0 || now)) / 1000;
    const C = UI.C, k = U.ease.outBack(Math.min(1, wt / 0.22)), fade = Math.min(1, wt / 0.12);
    const Lo = wheelLayout(fb.w, fb.h), { cx, cy, r } = Lo, R = Math.round(Lo.R * k);
    const fk = W.flipRT ? Math.min(1, (now - W.flipRT) / 220) : 1, spin = (1 - U.ease.outCubic(fk)) * -W.flipD * 0.9;
    W.L = { cx, cy, R, r, spin, ax: Lo.ax, dy: Lo.card ? Lo.card.y + Lo.card.h - 9 : Math.min(fb.h - 6, cy + R + r + 14), card: Lo.card };
    UI.dim(fb, fade, 0.62);
    // the ring: a soft dark band with a dotted rim
    for (let y = -R - r; y <= R + r; y++) for (let x = -R - r; x <= R + r; x++) { const d = Math.hypot(x, y); if (d > R - r - 2 && d < R + r + 2) UI.blend(fb, cx + x, cy + y, C.navyD, 0.35 * fade); }
    for (let a = 0; a < 120; a++) { const an = (a / 120) * Math.PI * 2 + t * 0.15; if (a % 2) UI.put(fb, Math.round(cx + Math.cos(an) * R), Math.round(cy + Math.sin(an) * R), 0x70ffffff); }
    const hv = LIST[W.hover] || current(), hown = has(hv.id);
    // the centre: the hovered move's emblem, big
    const cr = Math.max(10, Math.round(R * 0.42));
    UI.disc(fb, cx, cy + 2, cr + 1, C.shadow); UI.disc(fb, cx, cy, cr + 1, C.ink);
    UI.disc(fb, cx, cy, cr, hown ? U.mix(hv.col, C.navyD, 0.55) : C.navyD);
    UI.ring(fb, cx, cy, cr - 2, hown ? hv.col : C.navyLL, 1);
    if (hown) { UI.disc(fb, cx, cy, Math.round(cr * 0.62), hv.col); icon(fb, hv.id, cx, cy, Math.max(1, Math.round(cr / 9))); }
    else Font.draw(fb, '?', cx, cy - 8, C.faint, { font: 'title', align: 'center', sc: cr > 20 ? 2 : 1 });
    // the slots (they pop out one after the other)
    pageItems(W.page).forEach((i, j) => {
      const m = LIST[i], kk = U.ease.outBack(Math.min(1, Math.max(0, (wt - j * 0.025) / 0.22)));
      const L2 = Object.assign({}, W.L, { R: Math.round(Lo.R * kk) }), [sx0, sy0] = slotXY(L2, i), sx = Math.round(sx0), sy = Math.round(sy0);
      const hov = W.hover === i, own = has(m.id), cur = M.cur === m.id, rr = Math.max(2, Math.round((hov ? r + 3 : r) * Math.min(1, kk + 0.2)));
      if (hov) { UI.ring(fb, sx, sy, rr + 3 + Math.round((Math.sin(t * 6) + 1) * 0.8), C.goldL, 1); }
      UI.disc(fb, sx, sy + 2, rr, C.shadow);
      UI.orb(fb, sx, sy, rr, own ? m.col : hex('#4a5068'), { ol: hov ? 0xffffffff : C.ink });
      if (own) icon(fb, m.id, sx, sy, Math.max(1, Math.round(rr / 7)));
      else { UI.disc(fb, sx, sy, Math.round(rr * 0.55), hex('#3a3f56')); Font.draw(fb, '?', sx, sy - 3, hex('#a8aec8'), { font: 'small', align: 'center' }); }
      if (cur) { UI.ring(fb, sx, sy, rr + 2, C.gold, 1); UI.chip(fb, sx + rr - 4, sy - rr - 6, 'B', { bg: C.gold, fg: C.ink, h: 8, pad: 5 }); }
      if (own && coolK(m.id) > 0) coolPie(fb, sx, sy, rr, coolK(m.id));
      if (m.tm) Font.draw(fb, m.tm, sx, sy + rr + 3, own ? 0xffffffff : hex('#9aa0b8'), { font: 'small', align: 'center', outline: C.ink });
    });
    // page arrows (tap / Q E / mouse wheel / swipe)
    for (const d of [-1, 1]) {
      const ax = cx + d * W.L.ax, bob = Math.round(Math.sin(now / 200) * 1.2) * d, pr = W.flipRT && W.arrowD === d && now - W.flipRT < 120 ? 1 : 0;
      UI.disc(fb, ax + bob, cy + 2, 9, C.shadow); UI.disc(fb, ax + bob, cy + pr, 9, C.ink); UI.disc(fb, ax + bob, cy + pr, 8, pr ? C.navyLL : C.navyL);
      UI.hline(fb, ax + bob - 4, ax + bob + 4, cy + pr - 7, C.navyLL);
      for (let y = -4; y <= 4; y++) { const w = 4 - Math.abs(y); for (let x = 0; x <= w; x++) UI.put(fb, ax + bob + d * (x - 1), cy + y + pr, 0xffffffff); }
      if (!(typeof Pad !== 'undefined' && Pad.touch)) Font.draw(fb, d < 0 ? 'Q' : 'E', ax + bob, cy + 12, hex('#c8d4f0'), { font: 'small', align: 'center', outline: C.ink });
    }
    // the info card
    const cd = Lo.card;
    if (cd) {
      const ox = Lo.side ? Math.round((1 - k) * 24) : 0, x = cd.x + ox, y = cd.y + (Lo.side ? 0 : Math.round((1 - k) * 16)), w = cd.w, h = cd.h;
      UI.plate(fb, x, y, w, h, { r: 5, fill: C.navy, a: 0.94 });
      UI.rect(fb, x + 3, y + 3, 3, h - 6, hown ? hv.col : C.navyLL);
      let yy = y + 6;
      Font.draw(fb, 'MOVE WHEEL', x + 11, yy, hex('#8f9cc8'), { font: 'small' });
      // page dots
      for (let p = 0; p < PAGES; p++) { const px = x + w - 12 - (PAGES - 1 - p) * 8; if (p === W.page) UI.disc(fb, px, yy + 2, 2, C.gold); else UI.disc(fb, px, yy + 2, 1, hex('#6a76a8')); }
      yy += 12;
      const nm = hown ? hv.name : '???', nf = Font.measure(nm, 'title') <= w - 18 ? 'title' : 'body';
      Font.draw(fb, nm, x + 11, yy, 0xffffffff, { font: nf, shadow: C.ink }); yy += nf === 'title' ? 17 : 14;
      // status chips: TM number, on B, cooldown
      let chx = x + 11;
      if (hv.tm) chx += UI.chip(fb, chx, yy, hv.tm, { bg: hown ? U.mix(hv.col, C.navy, 0.35) : C.navyL, h: 9, pad: 6 }) + 4;
      if (M.cur === hv.id) chx += UI.chip(fb, chx, yy, 'ON B', { bg: C.gold, fg: C.ink, h: 9, pad: 6 }) + 4;
      else if (!hown) chx += UI.chip(fb, chx, yy, 'NOT LEARNED', { bg: hex('#4a5068'), h: 9, pad: 6 }) + 4;
      if (hown && coolLeft(hv.id) > 0) UI.chip(fb, chx, yy, coolLeft(hv.id).toFixed(1) + 's', { bg: hex('#5a3a6a'), h: 9, pad: 6 });
      yy += 14;
      const txt = hown ? hv.desc || 'A move Mudkip learned on its journey.' : 'How to learn: ' + (hv.how || 'keep exploring!');
      const foot = y + h - 12, lines = Font.wrap(txt, 'small', w - 20), maxL = Math.max(1, Math.floor((foot - 3 - yy) / 9));
      lines.slice(0, maxL).forEach((l, j) => Font.draw(fb, j === maxL - 1 && lines.length > maxL ? l.replace(/.{0,2}$/, '..') : l, x + 11, yy + j * 9, hown ? hex('#d8e0f8') : hex('#aab2d0'), { font: 'small' }));
      UI.hline(fb, x + 8, x + w - 9, foot - 3, C.navyL);
      const ft = typeof Pad !== 'undefined' && Pad.touch ? ['tap a move  ·  swipe: page', 'tap  ·  swipe'] : ['Enter pick  ·  Q/E page  ·  Esc', 'Enter  ·  Q/E  ·  Esc'];
      Font.draw(fb, Font.measure(ft[0], 'small') <= w - 12 ? ft[0] : ft[1], x + w / 2, foot, hex('#7f8cb8'), { font: 'small', align: 'center' });
    }
  }
  // a dark pie that shrinks as the move recharges (k = 1 → just used)
  function coolPie(fb, cx, cy, r, k) {
    if (k <= 0) return;
    const end = -Math.PI / 2 + k * Math.PI * 2;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      let a = Math.atan2(y, x); if (a < -Math.PI / 2) a += Math.PI * 2;
      if (a <= end) UI.put(fb, cx + x, cy + y, U.mix(fb.d[(cy + y) * fb.w + cx + x] || 0xff000000, 0xff101420, 0.62) | 0xff000000);
    }
  }
  // the current move as a small chip (keyboard play: bottom right) with its cooldown
  function drawChip(fb, S, t) {
    if (typeof Pad !== 'undefined') return; // the pad's B button already shows the move and its cooldown
    const m = current(), r = 9, cx = fb.w - 16, cy = fb.h - 44;
    UI.disc(fb, cx, cy + 2, r, 0xff0a0e1a); UI.orb(fb, cx, cy, r, m.col, { ol: 0xff1b2240 });
    icon(fb, m.id, cx, cy, 1);
    const k = coolK(m.id); if (k > 0) { coolPie(fb, cx, cy, r, k); Font.draw(fb, coolLeft(m.id).toFixed(coolLeft(m.id) < 10 ? 1 : 0), cx, cy + r + 2, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 }); }
    else Font.draw(fb, 'X', cx + r - 2, cy - r - 4, 0xffffffff, { font: 'small', outline: 0xff1b2240 });
  }
  // the big "new move!" flourish: a TM disc pops in with rays, sparkles and its name
  function drawLearn(fb, S, t) {
    const L = M.learnFx; if (!L) return;
    const C = UI.C, d = DEF[L.id], k = L.t < 0.35 ? U.ease.outBack(L.t / 0.35) : L.t > 2.8 ? Math.max(0, 1 - (L.t - 2.8) / 0.4) : 1;
    const cx = Math.round(fb.w / 2), cy = Math.round(fb.h * 0.36), R = Math.round(18 * k);
    if (R < 2) return;
    if (!L.fired && L.t > 0.08) { L.fired = 1; UI.burst(cx, cy, 18, { speed: 75, c: C.goldL, life: 0.8 }); UI.pop(cx, cy, 30, 0xffffffff); }
    for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2 + L.t * 1.5, len = R + 8 + Math.sin(L.t * 6 + a) * 3; for (let j = R + 3; j < len; j++) UI.put(fb, Math.round(cx + Math.cos(an) * j), Math.round(cy + Math.sin(an) * j), a % 2 ? C.goldL : 0xffffffff); }
    // the TM disc (spins: the highlight runs around it)
    UI.disc(fb, cx, cy + 2, R, C.shadow); UI.disc(fb, cx, cy, R, C.ink); UI.disc(fb, cx, cy, R - 2, d.col); UI.disc(fb, cx, cy, Math.round(R * 0.35), C.ink); UI.disc(fb, cx, cy, Math.round(R * 0.22), hex('#e8ecf8'));
    const sp = L.t * 3; for (let a = sp; a < sp + 1; a += 0.05) UI.put(fb, Math.round(cx + Math.cos(a) * (R - 5)), Math.round(cy + Math.sin(a) * (R - 5)), 0xffffffff);
    if (k > 0.6) {
      UI.chip(fb, cx, cy - R - 15, 'NEW MOVE!', { bg: C.red, align: 'center', h: 10, pad: 10 });
      Font.draw(fb, (d.tm ? d.tm + '  ' : '') + d.name, cx, cy + R + 6, 0xffffffff, { font: 'title', align: 'center', outline: C.ink });
      if (d.desc) Font.draw(fb, d.desc, cx, cy + R + 24, hex('#d8e4ff'), { font: 'small', align: 'center', outline: C.ink });
    }
  }
  // (the old gallery game's sand piles: nothing to do here)
  function addSand() {}
  return Object.assign(M, { add, coolLeft, coolK, coolPie, drawChip, ICON, cd, LIST, DEF, has, current, unlock, press, release, openWheel, closeWheel, toggleWheel, select, wheelPoint, wheelKey, tapWheel, wheelUp, flip, PAGES, pageItems, update, use, icon, drawWheel, drawLearn, addSand });
})();
