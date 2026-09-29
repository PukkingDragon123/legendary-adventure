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
   moment), by finding TM discs hidden in the world, or from quests.
------------------------------------------------------------------- */
const Moves = (() => {
  const { clamp, lerp, rnd, hex } = U;
  const LIST = [
    { id: 'water', name: 'Water Gun', col: hex('#3a8ae8'), start: true, desc: 'Spray water. Wakes, waters and splashes.' },
    { id: 'tackle', name: 'Tackle', col: hex('#e0962a'), start: true, desc: 'Charge and bump! Shakes trees, bops Pokémon.' },
    { id: 'sing', name: 'Sing', col: hex('#e0529e'), start: true, desc: 'Play a song on the guitar.' },
    { id: 'scan', name: 'Scan', col: hex('#2eb07e'), start: true, desc: 'Scan with the Pokédex to find secrets.' },
    { id: 'bubble', name: 'Bubble', col: hex('#52c4ea'), tm: 'TM01', how: 'Watch Clamperl or Wailmer blow bubbles, or find the disc on the seabed.', watch: { kinds: ['clamperl', 'wailmer', 'luvdisc', 'corphish'], acts: ['open', 'spout', 'pearl', 'bubble', 'kiss'] } },
    { id: 'growl', name: 'Growl', col: hex('#e8b02a'), tm: 'TM02', how: 'Cheer along with Plusle and Minun, or look in the Treetop lookout.', watch: { kinds: ['plusle', 'minun', 'chatot'], acts: ['cheer', 'duo', 'mimic'] } },
    { id: 'dig', name: 'Dig', col: hex('#a8683a'), tm: 'TM03', how: 'Watch a Zigzagoon dig up treasure, or check the hollow log.', watch: { kinds: ['zigzagoon', 'trapinch'], acts: ['find', 'sniff', 'chomp'] } },
    { id: 'smash', name: 'Rock Smash', col: hex('#c0543a'), tm: 'TM04', how: 'Watch Bagon headbutt a boulder, or look behind the cave waterfall.', watch: { kinds: ['bagon'], acts: ['headbutt'] } },
    { id: 'ice', name: 'Ice Beam', col: hex('#8adcf4'), tm: 'TM05', how: 'Watch Walrein use Ice Beam, or search the lighthouse islet.', watch: { kinds: ['walrein', 'sealeo'], acts: ['icebeam'] } },
  ];
  const DEF = Object.fromEntries(LIST.map((m) => [m.id, m]));
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
  function openWheel() {
    if (M.wheel || Game.mode !== 'explore') return;
    M.wheel = { t: 0, hover: LIST.findIndex((m) => m.id === M.cur), closing: 0 };
    Game.sfx('blip');
  }
  function closeWheel() { if (M.wheel) { M.wheel = null; Game.sfx('select'); } }
  function toggleWheel() { if (M.wheel) closeWheel(); else openWheel(); }
  function select(i) {
    const m = LIST[i]; if (!m) return;
    if (!has(m.id)) { HUD.toast((m.tm ? m.tm + ' ' : '') + m.name + ' — not learned yet. ' + m.how, { life: 3.2 }); Game.sfx('error'); return; }
    M.cur = m.id;
  }
  // pointer over the wheel (UI coords): pick the slot in that direction
  function wheelPoint(ux, uy) {
    const W = M.wheel; if (!W || !W.L) return;
    const dx = ux - W.L.cx, dy = uy - W.L.cy;
    if (Math.hypot(dx, dy) < W.L.R * 0.35) return;
    let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    W.hover = Math.round(a / (Math.PI * 2) * LIST.length) % LIST.length;
  }
  function wheelKey(k) {
    const W = M.wheel; if (!W) return false;
    if (k === 'ArrowLeft' || k === 'a') { W.hover = (W.hover + LIST.length - 1) % LIST.length; return true; }
    if (k === 'ArrowRight' || k === 'd') { W.hover = (W.hover + 1) % LIST.length; return true; }
    if (k === 'Enter' || k === 'x' || k === ' ' || k === 'e') { select(W.hover); closeWheel(); return true; }
    if (k === 'Escape' || k === 'q') { closeWheel(); return true; }
    return false;
  }
  function tapWheel(ux, uy) {
    const W = M.wheel; if (!W || !W.L) return false;
    for (let i = 0; i < LIST.length; i++) { const [sx, sy] = slotXY(W.L, i); if (Math.hypot(ux - sx, uy - sy) < W.L.r + 4) { select(i); closeWheel(); return true; } }
    closeWheel(); return true;
  }
  /* ---------- per frame ---------- */
  function update(dt) {
    if (M.pressing) { M.pressT += dt; if (M.pressT > 0.3 && !M.wheel) openWheel(); }
    if (M.wheel) M.wheel.t += dt;
    if (M.learnFx) { M.learnFx.t += dt; if (M.learnFx.t > 3.2) M.learnFx = null; }
    // learn by watching: stay close while a Pokémon uses a move
    const mk = Game.mudkip; if (!mk || Game.mode !== 'explore') return;
    for (const d of LIST) {
      if (!d.watch || has(d.id)) continue;
      const src = Mons.all.find((m) => m !== mk && m.alive && d.watch.kinds.includes(m.kind) && d.watch.acts.includes(m.act.id) && Math.hypot(m.x - mk.x, m.y - mk.y) < 170);
      if (src) {
        M.watchT[d.id] = (M.watchT[d.id] || 0) + dt;
        if (M.watchT[d.id] > 0.6 && !mk.watching) { mk.watching = src; }
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
  function slotXY(L, i) { const a = -Math.PI / 2 + (i / LIST.length) * Math.PI * 2; return [L.cx + Math.cos(a) * L.R, L.cy + Math.sin(a) * L.R]; }
  function drawWheel(fb, S, t) {
    const W = M.wheel; if (!W) return;
    const k = U.ease.outBack(Math.min(1, W.t / 0.22));
    const cx = Math.round(fb.w / 2), cy = Math.round(fb.h / 2), R = Math.round(Math.min(fb.w, fb.h) * 0.3 * k), r = Math.max(9, Math.round(Math.min(fb.w, fb.h) * 0.055));
    W.L = { cx, cy, R, r };
    UI.rectA(fb, 0, 0, fb.w, fb.h, 0xff0a0e20, 0.45 * Math.min(1, W.t / 0.15));
    // ring
    for (let a = 0; a < 200; a++) { const an = (a / 200) * Math.PI * 2; UI.put(fb, Math.round(cx + Math.cos(an) * R), Math.round(cy + Math.sin(an) * R), 0x80ffffff); }
    LIST.forEach((m, i) => {
      const [sx, sy] = slotXY(W.L, i), hov = W.hover === i, own = has(m.id), cur = M.cur === m.id;
      const rr = hov ? r + 3 : r;
      UI.disc(fb, Math.round(sx), Math.round(sy) + 2, rr, 0xff0a0e1a);
      UI.orb(fb, Math.round(sx), Math.round(sy), rr, own ? m.col : 0xff5a6078, { ol: hov ? 0xffffffff : 0xff1b2240 });
      if (own) icon(fb, m.id, sx, sy, Math.max(1, Math.round(rr / 7)));
      else { Font.draw(fb, '?', Math.round(sx), Math.round(sy) - 4, 0xffc8cce0, { font: 'title', align: 'center' }); }
      if (cur) UI.ring(fb, Math.round(sx), Math.round(sy), rr + 2, 0xffffe060, 1);
      if (m.tm) Font.draw(fb, m.tm, Math.round(sx), Math.round(sy + rr + 2), own ? 0xffffffff : 0xffa0a4b8, { font: 'small', align: 'center', outline: 0xff1b2240 });
    });
    // centre: the hovered move
    const m = LIST[W.hover] || current(), own = has(m.id);
    UI.disc(fb, cx, cy, Math.round(R * 0.52), 0xff141a30); UI.ring(fb, cx, cy, Math.round(R * 0.52), m.col, 2);
    Font.draw(fb, own ? m.name : '???', cx, cy - 12, 0xffffffff, { font: 'title', align: 'center' });
    const lines = Font.wrap(own ? m.desc || '' : 'Not learned yet', 'small', Math.round(R * 0.95));
    lines.slice(0, 3).forEach((l, j) => Font.draw(fb, l, cx, cy + 4 + j * 9, 0xffc8d4f0, { font: 'small', align: 'center' }));
    Font.draw(fb, 'MOVE WHEEL', cx, Math.max(4, cy - R - r - 14), 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
  }
  // the big "new move!" flourish
  function drawLearn(fb, S, t) {
    const L = M.learnFx; if (!L) return;
    const d = DEF[L.id], k = L.t < 0.35 ? U.ease.outBack(L.t / 0.35) : L.t > 2.8 ? Math.max(0, 1 - (L.t - 2.8) / 0.4) : 1;
    const cx = fb.w / 2, cy = Math.round(fb.h * 0.36), R = Math.round(18 * k);
    if (R < 2) return;
    for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2 + L.t * 1.5, len = R + 8 + Math.sin(L.t * 6 + a) * 3; for (let j = R + 2; j < len; j++) UI.put(fb, Math.round(cx + Math.cos(an) * j), Math.round(cy + Math.sin(an) * j), 0xffffe890); }
    // the TM disc
    UI.disc(fb, cx, cy, R, 0xff1b2240); UI.disc(fb, cx, cy, R - 2, d.col); UI.disc(fb, cx, cy, Math.round(R * 0.35), 0xff1b2240); UI.disc(fb, cx, cy, Math.round(R * 0.22), 0xffe8ecf8);
    for (let a = -2.2; a < -1.2; a += 0.05) UI.put(fb, Math.round(cx + Math.cos(a) * (R - 5)), Math.round(cy + Math.sin(a) * (R - 5)), 0xffffffff);
    Font.draw(fb, (d.tm ? d.tm + '  ' : '') + d.name, cx, cy + R + 6, 0xffffffff, { font: 'title', align: 'center', outline: 0xff1b2240 });
  }
  // (the old gallery game's sand piles: nothing to do here)
  function addSand() {}
  return Object.assign(M, { LIST, DEF, has, current, unlock, press, release, openWheel, closeWheel, toggleWheel, select, wheelPoint, wheelKey, tapWheel, update, use, icon, drawWheel, drawLearn, addSand });
})();
