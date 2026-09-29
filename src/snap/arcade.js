/* ------------------------------------------------------------------
   Arcade — playground games with the local Pokémon (H):
    · Type Battle: rock-paper-scissors with Water > Fire > Grass > Water.
      Best of five, hearts, zappy attacks.
    · Jump Rope: two friends swing the rope faster and faster — jump
      (Space / tap) as it sweeps under Mudkip.
    · Hide & Seek: a Pokémon hides in one of the bushes. Watch for the
      rustle, then pick the bush. Five rounds.
    · Tag: catch the zippy runner before the timer ends (arrows / tap
      the side to run toward).
------------------------------------------------------------------- */
const Arcade = (() => {
  const { clamp, rnd, pick, lerp, hex } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const A = { on: false, g: null, t: 0, sel: 0, cast: {}, btns: [] };
  const GAMES = [
    { id: 'battle', name: 'Type Battle', desc: 'Water beats Fire, Fire beats Grass, Grass beats Water!', col: '#ff5a4a' },
    { id: 'rope', name: 'Jump Rope', desc: 'Jump just as the rope sweeps under you.', col: '#ffc83a' },
    { id: 'seek', name: 'Hide & Seek', desc: 'Watch the bushes. Who is hiding where?', col: '#4ac860' },
    { id: 'tag', name: 'Tag', desc: 'Catch the runner before time runs out!', col: '#4aa8ff' },
  ];
  const TYPES = [{ id: 'water', name: 'Water', col: '#3a9aff', beats: 'fire' }, { id: 'grass', name: 'Grass', col: '#4ad060', beats: 'water' }, { id: 'fire', name: 'Fire', col: '#ff7a2a', beats: 'grass' }];
  const FRIENDS = ['Zigzagoon', 'Spheal', 'Plusle', 'Minun', 'Wynaut', 'Seedot', 'Shroomish', 'Corphish', 'Swablu', 'Marshtomp'];
  const avail = () => FRIENDS.filter((n) => typeof window[n] !== 'undefined' || (() => { try { return !!(0, eval)(n); } catch (e) { return false; } })());
  /* ---------- sprites ---------- */
  function actor(key, spName, o = {}) {
    if (A.cast[key]) return A.cast[key];
    let S = null; try { S = (0, eval)(spName); } catch (e) { S = null; }
    if (!S) return null;
    const cr = new Critters.Critter(S, { kind: 'arc-' + key, scale: o.scale ?? 0.8, yaw: o.yaw ?? 1.1, pitch: 0.1, qPose: 0.01 }); cr.noHD = true;
    cr.pose = Object.assign(spName === 'Mudkip' ? Object.assign({ eyes: 'happy', mouth: 0.6 }, Save.look()) : { eyes: 'happy' }, o.pose || {});
    const e = { cr, P: Times.compile('noon') };
    return (A.cast[key] = e);
  }
  function blit(fb, e, cx, by, flip, o = {}) {
    if (!e) return; if (!e.cr.spr) e.cr.sprite(e.P);
    const s = e.cr.spr; if (!s) return;
    const sq = o.sq || 0, sw = Math.round(s.w * (1 + sq * 0.3)), sh = Math.round(s.h * (1 - sq * 0.3));
    const x0 = Math.round(cx - sw / 2), y0 = Math.round(by - sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const u = Math.floor(x * s.w / sw), v = Math.floor(y * s.h / sh);
      let c = s.d[v * s.w + (flip ? s.w - 1 - u : u)]; if (!c) continue;
      if (o.tint) c = U.mix(c, o.tint, o.tintK || 0.5);
      UI.put(fb, x0 + x, y0 + y, c);
    }
  }
  /* ---------- open / close ---------- */
  function open() { if (Game.mode !== 'explore') return; Object.assign(A, { on: true, g: null, t: 0, sel: 0 }); Game.mode = 'games'; Game.frozenFrame = false; if (typeof Pad !== 'undefined') Pad.reset(); Game.sfx('select'); }
  function close() { A.on = false; A.g = null; Game.mode = 'explore'; Game.sfx('back'); }
  function start(id) {
    const fr = avail(); const foe = pick(fr.length ? fr : ['Mudkip']);
    A.g = { id, t: 0, foe, over: 0, msg: '' };
    const G = A.g;
    if (id === 'battle') Object.assign(G, { hp: [3, 3], round: 0, phase: 'pick', pt: 0, mine: null, theirs: null, fx: [] });
    if (id === 'rope') Object.assign(G, { ang: 0, spd: 2.6, jumps: 0, air: 0, vy: 0, y: 0, fail: 0, best: Save.data.stats.rope || 0 });
    if (id === 'seek') Object.assign(G, { round: 0, found: 0, tries: 3, hide: 0, rustle: 0, rT: 1.2, pick: -1, show: 0, n: 6 });
    if (id === 'tag') Object.assign(G, { px: 60, rx: 220, rv: 0, time: 15, dir: 0, caught: 0 });
    Game.sfx('chime', null, 0.6);
  }
  function finish(win, msg, pts) {
    const G = A.g; G.over = 1; G.win = win; G.msg = msg;
    if (pts) { Save.addPoints(pts); HUD.toast(msg + ' +' + pts, { life: 2.6 }); }
    Game.sfx(win ? 'reward' : 'error');
    if (win) Save.discover('arcade.' + G.id);
  }
  /* ---------- input ---------- */
  function act(k) {
    const G = A.g;
    if (!G) {
      if (k === 'up') A.sel = (A.sel + GAMES.length - 1) % GAMES.length;
      else if (k === 'down') A.sel = (A.sel + 1) % GAMES.length;
      else if (k === 'ok') start(GAMES[A.sel].id);
      return;
    }
    if (G.over) { if (k === 'ok') { if (G.over > 0.6) A.g = null; } return; }
    if (G.id === 'battle' && G.phase === 'pick' && typeof k === 'number') battlePick(k);
    if (G.id === 'rope' && k === 'ok' && G.air <= 0) { G.vy = 150; G.air = 1; Game.sfx('boing', null, 0.5); }
    if (G.id === 'seek' && typeof k === 'number' && G.show <= 0) seekPick(k);
    if (G.id === 'tag') { if (k === 'left') G.dir = -1; if (k === 'right') G.dir = 1; if (k === 'stop') G.dir = 0; }
  }
  function key(k, e) {
    const type = e && e.type;
    if (k === 'Escape' && type !== 'keyup') { if (A.g) A.g = null; else close(); return; }
    if (A.g && A.g.id === 'tag' && type === 'keyup') { if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd') act('stop'); return; }
    if (type === 'keyup') return;
    if (k === 'ArrowUp' || k === 'w') act('up');
    else if (k === 'ArrowDown' || k === 's') act('down');
    else if (k === 'ArrowLeft' || k === 'a') act('left');
    else if (k === 'ArrowRight' || k === 'd') act('right');
    else if (k === ' ' || k === 'Enter') act('ok');
    else if (/^[1-6]$/.test(k)) act(+k - 1);
  }
  function down(ux, uy) {
    for (const b of A.btns) if (ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) { b.fn(); return; }
    const G = A.g;
    if (G && G.id === 'rope') act('ok');
    else if (G && G.id === 'tag') act(ux < Game.VW / 2 ? 'left' : 'right');
    else if (G && G.over) act('ok');
  }
  function up() { if (A.g && A.g.id === 'tag') act('stop'); }
  /* ---------- games ---------- */
  function battlePick(i) {
    const G = A.g; G.mine = TYPES[i]; G.theirs = pick(TYPES); G.phase = 'show'; G.pt = 0; Game.sfx('whoosh', null, 0.6);
  }
  function battleResolve() {
    const G = A.g, m = G.mine, th = G.theirs;
    if (m.beats === th.id) { G.hp[1]--; G.res = 'win'; Game.sfx('bonk', null, 0.8); }
    else if (th.beats === m.id) { G.hp[0]--; G.res = 'lose'; Game.sfx('crack', null, 0.6); }
    else { G.res = 'tie'; Game.sfx('clink', null, 0.6); }
    G.round++;
  }
  function seekPick(i) {
    const G = A.g; if (i >= G.n) return;
    G.pick = i;
    if (i === G.hide) { G.found++; G.show = 1.4; Game.sfx('twinkle'); }
    else { G.tries--; Game.sfx('rustle'); G.miss = i; G.missT = 0.6; if (G.tries <= 0) { G.show = 1.4; } }
  }
  function update(dt) {
    A.t += dt;
    const G = A.g; if (!G) return;
    G.t += dt;
    if (G.over) { G.over += dt; return; }
    if (G.id === 'battle') {
      G.pt += dt;
      if (G.phase === 'show' && G.pt > 0.9) { battleResolve(); G.phase = 'hit'; G.pt = 0; }
      else if (G.phase === 'hit' && G.pt > 1.1) {
        if (G.hp[1] <= 0) finish(true, 'You beat ' + G.foe + '!', 400);
        else if (G.hp[0] <= 0) finish(false, G.foe + ' wins! Try again.', 50);
        else { G.phase = 'pick'; G.pt = 0; }
      }
    } else if (G.id === 'rope') {
      G.ang += dt * G.spd;
      if (G.air > 0) { G.y += G.vy * dt; G.vy -= 520 * dt; if (G.y <= 0) { G.y = 0; G.air = 0; G.vy = 0; } }
      // the rope passes under Mudkip when the angle crosses the bottom
      const a = G.ang % (Math.PI * 2), pa = (G.ang - dt * G.spd) % (Math.PI * 2);
      if (pa < Math.PI / 2 && a >= Math.PI / 2 || (pa > a && Math.PI / 2 > pa)) {
        if (G.y > 6) { G.jumps++; G.spd = Math.min(8, G.spd + 0.18); Game.sfx('pop', null, 0.4); }
        else { const best = Math.max(G.best, G.jumps); Save.data.stats.rope = best; Save.save(); finish(G.jumps >= 10, G.jumps + ' jumps! (best ' + best + ')', G.jumps * 20); }
      }
    } else if (G.id === 'seek') {
      if (G.show > 0) { G.show -= dt; if (G.show <= 0) { G.round++; if (G.round >= 5) finish(G.found >= 3, 'Found ' + G.found + ' of 5!', G.found * 80); else { G.hide = (Math.random() * G.n) | 0; G.tries = 3; G.pick = -1; G.rT = 0.8; } } return; }
      G.rT -= dt; if (G.rT <= 0) { G.rT = rnd(1.4, 2.6); G.rustle = 0.5; G.rustleAt = Math.random() < 0.75 ? G.hide : (Math.random() * G.n) | 0; Game.sfx('rustle', null, 0.3); }
      G.rustle = Math.max(0, G.rustle - dt); if (G.missT) G.missT = Math.max(0, G.missT - dt);
    } else if (G.id === 'tag') {
      G.time -= dt;
      G.px = clamp(G.px + G.dir * 150 * dt, 20, 340);
      const d = G.rx - G.px;
      if (Math.abs(d) < 60) G.rv = lerp(G.rv, Math.sign(d || 1) * 170, dt * 4); else G.rv = lerp(G.rv, Math.sin(G.t * 1.7) * 70, dt * 2);
      G.rx += G.rv * dt; if (G.rx < 20 || G.rx > 340) { G.rx = clamp(G.rx, 20, 340); G.rv = -G.rv * 1.2; if (Math.abs(d) < 60 && Math.random() < 0.4) G.rx = G.rx < 180 ? 330 : 30; }
      if (Math.abs(G.rx - G.px) < 16) { Game.sfx('twinkle'); finish(true, 'Tag! You caught ' + G.foe + '!', Math.round(150 + G.time * 20)); }
      else if (G.time <= 0) finish(false, G.foe + ' got away!', 30);
    }
  }
  /* ---------- drawing ---------- */
  function bg(fb, top, bot) { const W = fb.w, H = fb.h; for (let y = 0; y < H; y++) { const c = U.mix(hex(top), hex(bot), y / H); fb.d.fill(c, y * W, y * W + W); } }
  function btn(fb, x, y, w, h, label, col, fn, sub) {
    UI.panel(fb, x, y, w, h, { r: 5, ol: INK, fill: hex(col) });
    Font.draw(fb, label, x + w / 2, y + (sub ? 4 : h / 2 - 3), WHITE, { font: 'small', align: 'center', outline: INK });
    if (sub) Font.draw(fb, sub, x + w / 2, y + 14, 0xffe8f0ff, { font: 'small', align: 'center' });
    A.btns.push({ x, y, w, h, fn });
  }
  function draw(fb, t) {
    A.btns.length = 0;
    const W = fb.w, H = fb.h, G = A.g;
    if (!G) return drawMenu(fb, t);
    const mk = actor('mk', 'Mudkip', { scale: 0.8, yaw: 0.9 }), foe = actor('foe-' + G.foe, G.foe, { scale: 0.8, yaw: Math.PI - 0.9 });
    if (G.id === 'battle') {
      bg(fb, '#5ab8ff', '#bfe8a8');
      UI.rect(fb, 0, Math.round(H * 0.62), W, H, hex('#7ac85a'));
      const hitK = G.phase === 'hit' ? Math.max(0, 1 - G.pt * 2) : 0;
      const mx = W * 0.28, fx = W * 0.72, gyy = H * 0.64;
      blit(fb, mk, mx + (G.res === 'lose' ? Math.sin(t * 60) * 3 * hitK : 0), gyy, false, { tint: G.res === 'lose' && hitK ? 0xff4a4aff : 0, tintK: hitK * 0.6, sq: Math.sin(t * 4) * 0.05 });
      blit(fb, foe, fx + (G.res === 'win' ? Math.sin(t * 60) * 3 * hitK : 0), gyy, true, { tint: G.res === 'win' && hitK ? 0xff4a4aff : 0, tintK: hitK * 0.6, sq: Math.sin(t * 4 + 1) * 0.05 });
      for (const [i, x] of [[0, mx], [1, fx]]) for (let h = 0; h < 3; h++) Font.draw(fb, '{heart}', x - 12 + h * 10, 14, h < G.hp[i] ? 0xff4a4aff : 0xff505060, { font: 'body' });
      Font.draw(fb, 'Mudkip', mx, 26, WHITE, { font: 'small', align: 'center', outline: INK }); Font.draw(fb, G.foe, fx, 26, WHITE, { font: 'small', align: 'center', outline: INK });
      if (G.phase !== 'pick' && G.mine) {
        // attacks fly across and collide in the middle
        const k = G.phase === 'show' ? clamp(G.pt / 0.9, 0, 1) : 1;
        for (const [ty, x0, x1] of [[G.mine, mx, W / 2], [G.theirs, fx, W / 2]]) { const x = lerp(x0, x1, k), y = gyy - 30 - Math.sin(k * Math.PI) * 20; UI.disc(fb, Math.round(x), Math.round(y), 7, hex(ty.col)); UI.disc(fb, Math.round(x), Math.round(y), 3, WHITE); }
        Font.draw(fb, G.mine.name + '  vs  ' + G.theirs.name, W / 2, 44, WHITE, { font: 'title', align: 'center', outline: INK });
        if (G.phase === 'hit') { Font.draw(fb, G.res === 'win' ? 'Super effective!' : G.res === 'lose' ? 'Ouch!' : 'Tie!', W / 2, 60, G.res === 'win' ? 0xff5aff7a : G.res === 'lose' ? 0xff5a5aff : WHITE, { font: 'title', align: 'center', outline: INK }); FX && 0; }
      } else if (!G.over) {
        Font.draw(fb, 'Pick your move! (1 2 3)', W / 2, 44, WHITE, { font: 'title', align: 'center', outline: INK });
        TYPES.forEach((ty, i) => btn(fb, Math.round(W / 2 - 105 + i * 72), H - 44, 66, 30, (i + 1) + ' ' + ty.name, ty.col, () => act(i), 'beats ' + ty.beats));
      }
    } else if (G.id === 'rope') {
      bg(fb, '#ffd8a0', '#ffb070');
      UI.rect(fb, 0, Math.round(H * 0.7), W, H, hex('#e8c078'));
      const gyy = H * 0.72, lx = W * 0.2, rx = W * 0.8;
      const f2 = actor('foe2', avail()[1] || G.foe, { scale: 0.7, yaw: 0.9 });
      blit(fb, foe, lx, gyy, false); blit(fb, f2, rx, gyy, true);
      // the rope: an arc whose height follows the swing angle (drawn behind when it is up)
      const a = G.ang, hgt = Math.cos(a) * 55, ry = gyy - 40;
      const drawRope = () => { for (let i = 0; i <= 60; i++) { const u = i / 60, x = lerp(lx + 10, rx - 10, u), y = ry + Math.sin(u * Math.PI) * hgt; UI.put(fb, Math.round(x), Math.round(y), hex('#e83a5a')); UI.put(fb, Math.round(x), Math.round(y) + 1, hex('#8a1a3a')); } };
      if (hgt < 0) drawRope();
      blit(fb, mk, W / 2, gyy - G.y, false, { sq: G.air ? -0.1 : 0.05 * Math.sin(t * 8) });
      if (hgt >= 0) drawRope();
      Font.draw(fb, String(G.jumps), W / 2, 20, WHITE, { font: 'title', align: 'center', outline: INK, sc: 2 });
      Font.draw(fb, 'Space / tap to jump!', W / 2, H - 14, WHITE, { font: 'small', align: 'center', outline: INK });
    } else if (G.id === 'seek') {
      bg(fb, '#7ac8ff', '#c8f0a8');
      UI.rect(fb, 0, Math.round(H * 0.66), W, H, hex('#5ab04a'));
      const gyy = H * 0.72;
      for (let i = 0; i < G.n; i++) {
        const x = Math.round(W * (0.12 + i * 0.152)), shake = G.rustle > 0 && G.rustleAt === i ? Math.sin(t * 50) * 2 : 0;
        if (G.show > 0 && i === G.hide) blit(fb, foe, x, gyy - 14 - Math.min(1, (1.4 - G.show) * 4) * 16, false);
        for (let y = -18; y <= 0; y++) for (let xx = -20; xx <= 20; xx++) { const q = (xx / 20) ** 2 + ((y + 9) / 11) ** 2; if (q < 1) UI.put(fb, x + xx + Math.round(shake * (1 - (y + 18) / 18)), gyy + y, q > 0.85 ? INK : U.mix(hex('#2a8a3a'), hex('#6ad05a'), clamp(-y / 18 - xx / 60, 0, 1))); }
        if (G.missT > 0 && G.miss === i) Font.draw(fb, 'nope!', x, gyy - 30, 0xff5a5aff, { font: 'small', align: 'center', outline: INK });
        A.btns.push({ x: x - 20, y: gyy - 24, w: 40, h: 30, fn: () => act(i) });
        Font.draw(fb, String(i + 1), x, gyy + 6, WHITE, { font: 'small', align: 'center', outline: INK });
      }
      blit(fb, mk, W / 2, H - 6, false, { sq: 0.04 * Math.sin(t * 5) });
      Font.draw(fb, 'Round ' + Math.min(5, G.round + 1) + '/5   found ' + G.found + '   tries ' + G.tries, W / 2, 16, WHITE, { font: 'small', align: 'center', outline: INK });
      Font.draw(fb, 'Who rustles? Pick a bush (1-6 / tap)', W / 2, 28, WHITE, { font: 'small', align: 'center', outline: INK });
    } else if (G.id === 'tag') {
      bg(fb, '#8ad8ff', '#fff0c0');
      UI.rect(fb, 0, Math.round(H * 0.7), W, H, hex('#e8d49a'));
      const sx = W / 380, gyy = H * 0.74;
      blit(fb, foe, G.rx * sx, gyy, G.rv < 0, { sq: Math.abs(Math.sin(t * 14)) * 0.08 });
      blit(fb, mk, G.px * sx, gyy, G.dir < 0, { sq: G.dir ? Math.abs(Math.sin(t * 16)) * 0.08 : 0 });
      Font.draw(fb, Math.max(0, G.time).toFixed(1) + 's', W / 2, 18, G.time < 5 ? 0xff5a5aff : WHITE, { font: 'title', align: 'center', outline: INK, sc: 2 });
      Font.draw(fb, 'Arrows / hold a side to run', W / 2, H - 14, WHITE, { font: 'small', align: 'center', outline: INK });
    }
    if (G.over) {
      UI.rectA(fb, 0, 0, W, H, 0xff0a0e20, 0.4);
      Font.draw(fb, G.win ? 'YOU WIN!' : 'GOOD TRY!', W / 2, H / 2 - 22, G.win ? 0xff3ad8ff : WHITE, { font: 'title', align: 'center', outline: INK, sc: 2 });
      Font.draw(fb, G.msg, W / 2, H / 2 + 6, WHITE, { font: 'body', align: 'center', outline: INK });
      if (G.over > 0.6) btn(fb, W / 2 - 40, H / 2 + 22, 80, 22, 'OK', '#2f7ae8', () => { A.g = null; });
    }
    btn(fb, 6, 6, 42, 18, 'Back', '#26303e', () => { if (A.g) A.g = null; else close(); });
  }
  function drawMenu(fb, t) {
    const W = fb.w, H = fb.h;
    bg(fb, '#3a2a7a', '#e86a8a');
    for (let i = 0; i < 40; i++) { const x = (U.hash(i, 1, 3) * W + t * 10 * (1 + i % 3)) % W, y = U.hash(i, 2, 3) * H; UI.put(fb, Math.round(x), Math.round(y), 0xffffffff); }
    Font.draw(fb, 'PLAYGROUND', W / 2, 16, 0xff3ad8ff, { font: 'title', align: 'center', outline: INK, sc: 2 });
    const bw = Math.min(260, W - 40), bh = 30;
    GAMES.forEach((g, i) => {
      const x = Math.round(W / 2 - bw / 2), y = 48 + i * (bh + 6) + (A.sel === i ? Math.round(Math.sin(t * 6)) : 0);
      btn(fb, x, y, bw, bh, (A.sel === i ? '> ' : '') + g.name, g.col, () => { A.sel = i; start(g.id); }, g.desc);
    });
    const mk = actor('mk', 'Mudkip', { scale: 0.8, yaw: 0.9 });
    blit(fb, mk, W - 40, H - 8, false, { sq: 0.05 * Math.sin(t * 6) });
    Font.draw(fb, 'Up/Down + Space, or tap', W / 2, H - 12, WHITE, { font: 'small', align: 'center', outline: INK });
  }
  return Object.assign(A, { open, close, key, down, up, update, draw });
})();
