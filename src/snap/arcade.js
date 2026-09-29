/* ------------------------------------------------------------------
   Arcade — play games with the Pokémon right where you are, like a
   little cutscene: letterbox bars slide in, the camera frames Mudkip
   and its playmate, and the game happens in the living world (H, or
   the ball button). The nearest friendly Pokémon joins in.
    · Type Battle — rock-paper-scissors with moves: Water beats Fire,
      Fire beats Grass, Grass beats Water. Real attacks fly across the
      scene and clash in the middle. First to 3 hits wins. Every
      Pokémon has a favourite move... watch for the hint!
    · Jump Rope — two friends swing a rope around Mudkip, faster and
      faster; jump as it sweeps under your feet
    · Hide & Seek — Mudkip counts while its friend hides behind one of
      the bushes that pop up around you; watch for the rustle, walk
      over and search (E). Three rounds.
    · Tag — you're it! Chase your friend down... then run when it's
      their turn to chase you.
------------------------------------------------------------------- */
const Arcade = (() => {
  const { clamp, rnd, pick, lerp, hex } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const A = { live: false, phase: 'off', g: null, t: 0, bars: 0, btns: [], partner: null, partner2: null, sel: 0, keys: {}, fx: [], toast: null };
  const GAMES = [
    { id: 'battle', name: 'Type Battle', col: '#ff5a4a', ic: 'bolt' },
    { id: 'rope', name: 'Jump Rope', col: '#ffc83a', ic: 'rope' },
    { id: 'seek', name: 'Hide & Seek', col: '#4ac860', ic: 'bush' },
    { id: 'tag', name: 'Tag', col: '#4aa8ff', ic: 'run' },
  ];
  const TYPES = [
    { id: 'water', name: 'Water', col: '#3a9aff', c2: '#bfe8ff', beats: 'fire', sfx: 'splash' },
    { id: 'grass', name: 'Grass', col: '#4ad060', c2: '#c8ff9a', beats: 'water', sfx: 'rustle' },
    { id: 'fire', name: 'Fire', col: '#ff7a2a', c2: '#ffe070', beats: 'grass', sfx: 'steam' },
  ];
  const TI = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const mk = () => Game.mudkip;
  const gy = (x) => World.groundAt(x);
  const nameOf = (m) => (m && DexData.S[m.dex] ? DexData.S[m.dex].name : 'Friend');
  const favType = (m) => { const T = (DexData.S[m.dex] || {}).type || []; if (T.some((q) => q === 'Water' || q === 'Ice')) return 'water'; if (T.some((q) => q === 'Grass' || q === 'Bug')) return 'grass'; if (T.some((q) => q === 'Fire' || q === 'Dragon' || q === 'Ground' || q === 'Rock')) return 'fire'; return pick(['water', 'grass', 'fire']); };
  const say = (m, text, life = 1.6) => { if (m && typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), text, { life, who: m }); };
  const okMate = (m, near, far = 240) => m && m !== mk() && m.alive && m.visible && m.mode === 'land' && !m.layer && !m.sleeping && m.walkTo && m.kind !== 'mailman' && !(DexData.S[m.dex] || {}).legendary && Math.abs(m.x - near.x) < far && Math.abs(m.y - near.y) < 90;

  /* ---------- control of the playmates ---------- */
  // a playmate runs the game's own little generator at top priority (its normal brain waits)
  function ctl(m, gen) { if (!m || !m.alive) return; m.doTask(gen, 9); m.arcade = true; }
  function release(m) { if (!m) return; m.arcade = false; if (m.task && m.task.prio >= 9) m.task.done = true; m.hidden = false; m.tintK = 0; m.rot = 0; }
  function* idleFace(m, who, T = 1e9, act = 'play') { let e = 0; while (e < T) { const dt = yield; e += dt; if (who) m.turn(m.face(who.x > m.x ? 1 : -1, false), dt, 6); m.setAct(act, 0.6); m.o.eyes = 'happy'; } }
  function* walkThen(m, x, speed, after) { yield* m.walkTo(x, speed, { turn: 12 }); if (after) yield* after(); }

  /* ---------- open / leave ---------- */
  function open() {
    const M = mk(); if (!M || Game.mode !== 'explore' || A.live) return;
    if (M.mode !== 'land' && M.mode !== 'fall') { HUD.toast('Get out of the water to play!', { life: 2 }); Game.sfx('error'); return; }
    const cands = Mons.all.filter((m) => okMate(m, M)).sort((a, b) => Math.abs(a.x - M.x) - Math.abs(b.x - M.x));
    if (!cands.length) { HUD.toast('Nobody nearby wants to play... walk up to a Pokémon first!', { life: 2.4 }); Game.sfx('error'); return; }
    A.live = true; A.phase = 'menu'; A.g = null; A.t = 0; A.sel = 0; A.fx.length = 0;
    A.partner = cands[0];
    A.partner2 = Mons.all.filter((m) => m !== A.partner && okMate(m, M, 320))[0] || null;
    if (typeof Pad !== 'undefined') Pad.reset();
    M.stop && M.stop();
    const p = A.partner, side = p.x >= M.x ? 1 : -1;
    ctl(p, walkThen(p, clamp(M.x + side * 46, M.x - 200, M.x + 200), (p.speed || 50) * 1.3, function* () { say(p, pick(['Let\'s play!', 'Play with me!', 'Yay, games!']), 1.8); if (p.emote) p.emote('heart', 1.2); yield* idleFace(p, M); }));
    Game.sfx('select');
  }
  function leave() {
    if (!A.live) return;
    cleanup();
    A.live = false; A.phase = 'off'; A.g = null; Game.camFocus = null;
    release(A.partner); release(A.partner2); A.partner = A.partner2 = null;
    Game.sfx('back');
  }
  function cleanup() {
    const G = A.g, Ar = Game.area;
    if (G && G.bushes && Ar) { for (const b of G.bushes) { const i = Ar.props.indexOf(b.prop); if (i >= 0) Ar.props.splice(i, 1); } }
    if (A.partner) { A.partner.hidden = false; A.partner.tintK = 0; }
    const M = mk(); if (M) { M.tintK = 0; }
  }
  function toMenu() { cleanup(); A.g = null; A.phase = 'menu'; const p = A.partner, M = mk(); if (p && p.alive && M) ctl(p, walkThen(p, clamp(M.x + (p.x >= M.x ? 1 : -1) * 46, M.x - 200, M.x + 200), (p.speed || 50) * 1.2, function* () { yield* idleFace(p, M); })); }
  function start(id) {
    const M = mk(), p = A.partner; if (!M || !p || !p.alive) { leave(); return; }
    A.phase = 'play';
    const G = A.g = { id, t: 0, over: 0, msg: '', win: false };
    Game.sfx('chime', null, 0.6);
    if (id === 'battle') {
      const side = p.x >= M.x ? 1 : -1;
      Object.assign(G, { hp: [3, 3], round: 0, step: 'intro', st: 0, mine: null, theirs: null, res: '', fav: favType(p), side, cx: M.x + side * 40 });
      M.goTo({ x: G.cx - side * 42, kind: 'walk' });
      ctl(p, walkThen(p, G.cx + side * 42, (p.speed || 50) * 1.2, function* () { yield* idleFace(p, M, 1e9, 'battle'); }));
      say(p, pick(['Bring it on!', 'I won\'t lose!', 'Battle time!']), 1.8);
    } else if (id === 'rope') {
      const x0 = M.x;
      Object.assign(G, { ang: -Math.PI / 2, spd: 2.4, jumps: 0, step: 'intro', st: 0, x0, hold2: A.partner2 && A.partner2.alive ? A.partner2 : null, best: Save.data.stats.rope || 0, tripT: 0 });
      ctl(p, walkThen(p, x0 + 52, (p.speed || 50) * 1.3, function* () { yield* idleFace(p, M, 1e9, 'rope'); }));
      if (G.hold2) ctl(G.hold2, walkThen(G.hold2, x0 - 52, (G.hold2.speed || 50) * 1.3, function* () { yield* idleFace(G.hold2, M, 1e9, 'rope'); }));
      else G.stake = x0 - 52;
      say(p, 'Ready? Jump when the rope comes!', 2.2);
    } else if (id === 'seek') {
      Object.assign(G, { round: 0, found: 0, tries: 3, step: 'count', st: 0, bushes: [], hideIdx: 0, rT: 2, shake: -1, shakeT: 0 });
      makeBushes(G, M.x);
      seekRound(G);
    } else if (id === 'tag') {
      Object.assign(G, { step: 'you', time: 18, st: 0, zone: [M.x - 280, M.x + 280], caught: false, survived: false, tagT: 0 });
      ctl(p, tagRun(p, G));
      say(p, 'Catch me if you can!', 2);
    }
  }
  function finish(win, msg, pts) {
    const G = A.g; if (!G || G.over) return;
    G.over = 0.01; G.win = win; G.msg = msg;
    if (pts) Save.addPoints(pts);
    HUD.toast(msg + (pts ? '  +' + pts : ''), { life: 2.8 });
    Game.sfx(win ? 'reward' : 'error');
    if (win && Save.discover('arcade.' + G.id)) Save.addPoints(100);
    const p = A.partner;
    if (p && p.alive) { if (win) { say(p, pick(['You\'re so good!', 'Wow!', 'Again, again!']), 2); p.emote && p.emote('heart', 1.4); } else { say(p, pick(['Hehe, I win!', 'Yay!', 'Good game!']), 2); p.emote && p.emote('note', 1.4); } }
  }

  /* ---------- Type Battle ---------- */
  function battlePick(i) {
    const G = A.g; if (!G || G.step !== 'pick') return;
    G.mine = TYPES[i];
    // every Pokémon leans toward its favourite move (the hint says which)
    G.theirs = Math.random() < 0.5 ? TI[G.fav] : pick(TYPES);
    G.step = 'throw'; G.st = 0;
    const M = mk(), p = A.partner;
    const [mx, my] = M.at ? M.at('mouth') : [M.x, M.y - 12], [px, py] = p.at ? p.at('mouth') : [p.x, p.y - 12];
    A.fx.push({ k: 'shot', type: G.mine, x: mx, y: my, x0: mx, y0: my, tx: G.cx, ty: Math.min(my, py) - 6, t: 0, dur: 0.7 });
    A.fx.push({ k: 'shot', type: G.theirs, x: px, y: py, x0: px, y0: py, tx: G.cx, ty: Math.min(my, py) - 6, t: 0, dur: 0.7 });
    Game.sfx(G.mine.sfx, M.x, 0.6); Game.sfx('whoosh', G.cx, 0.6);
    if (M.say) M.say(G.mine.name + '!', 1);
    say(p, G.theirs.name + '!', 1);
  }
  function battleClash() {
    const G = A.g, M = mk(), p = A.partner;
    const cy = Math.min(M.y, p.y) - 18;
    FX.add({ type: 'ring', x: G.cx, y: cy, r0: 3, r1: 26, life: 0.4, c: WHITE, layer: 4 });
    FX.sparkles(G.cx, cy, 14, 24, WHITE, hex(G.mine.col));
    Game.shake(3);
    if (G.mine.beats === G.theirs.id) { G.res = 'win'; G.hp[1]--; hit(p, G.mine, -G.side); Game.sfx('bonk', p.x, 0.9); }
    else if (G.theirs.beats === G.mine.id) { G.res = 'lose'; G.hp[0]--; hit(M, G.theirs, G.side); Game.sfx('bonk', M.x, 0.9); }
    else { G.res = 'tie'; Game.sfx('clink', G.cx, 0.8); }
    G.round++;
  }
  // knock-back and a red flash on whoever took the hit, plus the element's burst
  function hit(m, ty, dirAway) {
    m.tint = 0xff4a4aff; m.tintK = 0.7; m.hitT = 0.5;
    const [hx, hy] = m.headPt();
    for (let i = 0; i < 14; i++) FX.add({ type: 'drop', x: hx + rnd(-6, 6), y: hy + rnd(-2, 6), vx: rnd(-60, 60), vy: -rnd(40, 120), g: 380, life: 0.7, c: hex(ty.col), c2: hex(ty.c2), size: 2, floor: gy(m.x), layer: 4 });
    if (m === mk()) { m.mode = 'fall'; m.vy = -200; m.vx = -dirAway * 70; m.jumping = false; if (m.say) m.say(pick(['Ow!', 'Oof!', 'Hey!']), 1); }
    else { m.vair = 170; m.air = Math.max(m.air, 0.5); m.emote && m.emote('sweat', 1); }
  }
  function updateBattle(G, dt) {
    G.st += dt;
    const M = mk(), p = A.partner;
    if (G.step === 'intro' && G.st > 1.3) { G.step = 'pick'; G.st = 0; A.hint = nameOf(p) + ' loves ' + TI[G.fav].name + ' moves...'; }
    if (G.step === 'throw' && G.st > 0.72) { battleClash(); G.step = 'hit'; G.st = 0; }
    if (G.step === 'hit' && G.st > 1.2) {
      if (G.hp[1] <= 0) { finish(true, 'You beat ' + nameOf(p) + '!', 400); p.dizzy = 1; }
      else if (G.hp[0] <= 0) { finish(false, nameOf(p) + ' wins this time!', 60); }
      else { G.step = 'pick'; G.st = 0; }
    }
    // keep both facing each other
    if (M && G.step !== 'intro' && !M.target) M.turn(M.face(p.x > M.x ? 1 : -1, false), dt, 8);
    Game.camFocus = { x: G.cx, y: Math.min(M.y, p.y) - 20, zoom: 1.35 };
  }

  /* ---------- Jump Rope ---------- */
  function ropeEnds(G) {
    const p = A.partner, q = G.hold2;
    const hand = (m, s) => { if (!m) return [G.stake, gy(G.stake) - 16]; const [bx, by] = m.at('body'); return [bx - s * 4, by]; };
    const a = hand(q, -1), b = hand(p, 1);
    return a[0] < b[0] ? [a, b] : [b, a];
  }
  function updateRope(G, dt) {
    G.st += dt;
    const M = mk();
    if (G.step === 'intro') { if (G.st > 1.6) { G.step = 'go'; G.st = 0; } Game.camFocus = { x: G.x0, y: gy(G.x0) - 26, zoom: 1.35 }; return; }
    if (G.step !== 'go') return;
    const prev = G.ang; G.ang += dt * G.spd;
    const lift = M ? gy(M.x) - M.y : 0;
    // the rope sweeps under the feet each time the angle passes the bottom (π/2 in screen space)
    const k0 = Math.floor((prev - Math.PI / 2) / (Math.PI * 2)), k1 = Math.floor((G.ang - Math.PI / 2) / (Math.PI * 2));
    if (k1 > k0) {
      if (lift > 5 || M.mode === 'fall') { G.jumps++; G.spd = Math.min(8.5, G.spd + 0.22 + G.jumps * 0.01); Game.sfx('pop', M.x, 0.5); if (G.jumps % 5 === 0) { FX.sparkles(M.x, M.y - 20, 10, 16, WHITE, hex('#ffe070')); say(A.partner, G.jumps + '!', 1); } }
      else {
        // tripped!
        G.step = 'trip'; G.st = 0; Game.sfx('thud', M.x, 0.9); Game.shake(2);
        M.mode = 'fall'; M.vy = -160; M.vx = 0; M.dizzy = 1.6; M.flipT = 0.6; M.flipLen = 0.6; M.flipSpins = 1; M.flipDir = 1; M.flipped = true;
        if (M.say) M.say('Whoa-!', 1.2);
        const best = Math.max(G.best, G.jumps); Save.data.stats.rope = best; Save.save();
        setTimeout(() => finish(G.jumps >= 10, G.jumps + ' jumps!' + (G.jumps >= best && G.jumps > 0 ? ' New record!' : ' (best ' + best + ')'), G.jumps * 25), 900);
      }
    }
    // swingers bob in rhythm
    for (const m of [A.partner, G.hold2]) if (m && m.alive) { m.o.eyes = 'happy'; m.rot = Math.sin(G.ang) * 0.06; }
    Game.camFocus = { x: G.x0, y: gy(G.x0) - 26, zoom: 1.35 };
  }
  function drawRope(fb, cx, cy, G, front) {
    const [[ax, ay], [bx, by]] = ropeEnds(G), W = fb.w, H = fb.h, occ = Game.occ ? Game.occ() : null;
    const s = Math.sin(G.ang), c = Math.cos(G.ang);
    const midX = (ax + bx) / 2, down = gy(midX) - (ay + by) / 2 - 1, up = 44;
    const isFront = s > 0; // rope near the viewer in the lower half of its swing
    if (isFront !== front) return;
    const col = front ? hex('#ff4a6a') : hex('#b8304a'), dk = front ? hex('#8a1a3a') : hex('#6a1a2a');
    let lx = null, ly = null;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48, x = lerp(ax, bx, u), y = lerp(ay, by, u) + Math.sin(u * Math.PI) * (s > 0 ? s * down : s * up) - Math.sin(u * Math.PI) * c * 3;
      const X = Math.round(x - cx), Y = Math.round(y - cy);
      if (lx !== null) UI.line(fb, lx, ly, X, Y, col);
      if (X >= 0 && Y + 1 >= 0 && X < W && Y + 1 < H) { const j = (Y + 1) * W + X; if (front || !occ || occ[j] !== 2) fb.d[j] = dk; }
      lx = X; ly = Y;
    }
  }
  function drawStake(fb, cx, cy, x) { const X = Math.round(x - cx), G0 = Math.round(gy(x) - cy); for (let y = G0 - 18; y < G0; y++) { UI.put(fb, X, y, hex('#6a4a2a')); UI.put(fb, X + 1, y, hex('#8a6a3a')); } UI.put(fb, X, G0 - 19, hex('#4a3018')); }

  /* ---------- Hide & Seek ---------- */
  function bushSpr() {
    const Ar = Game.area, M = Ar.M;
    const leafy = M.leaf || M.grass || M.palmLeaf || M.moss;
    if (leafy && !Ar.def.noSky) return Paint.bush(M, 30, 20, (Math.random() * 999) | 0, { ramp: leafy, dots: M.flower || M.berry || null, nd: 4 });
    return Paint.rock(M, 30, 20, (Math.random() * 999) | 0, { ramp: M.rock || M.floor || leafy });
  }
  function makeBushes(G, x0) {
    const Ar = Game.area, xs = [];
    for (let k = -2; k <= 2; k++) { let x = x0 + k * 62 + rnd(-8, 8); let tries = 0; while (World.isWet(x, 6) && tries++ < 8) x += 15; xs.push(x); }
    G.bushes = xs.map((x) => { const prop = Ar.put(bushSpr(), x, 3, { sink: 3, late: true }); return { x, prop, x0: prop.x }; });
  }
  function seekRound(G) {
    const M = mk(), p = A.partner;
    G.step = 'count'; G.st = 0; G.tries = 3; G.hideIdx = (Math.random() * G.bushes.length) | 0;
    if (M.say) M.say('1... 2... 3...', 2.6);
    const b = G.bushes[G.hideIdx];
    ctl(p, walkThen(p, b.x, Math.max(90, (p.speed || 50) * 2), function* () { p.hidden = true; let e = 0; while (e < 1e9) { const dt = yield; e += dt; p.setAct('hide', 0.4); } }));
  }
  function search(i) {
    const G = A.g, M = mk(); if (!G || G.step !== 'search') return;
    const b = G.bushes[i]; if (!b) return;
    shakeBush(G, i, 0.5); Game.sfx('rustle', b.x, 0.9);
    if (i === G.hideIdx) {
      G.found++; G.step = 'found'; G.st = 0;
      const p = A.partner; p.hidden = false; p.hideK = 0.5; p.x = b.x + (M.x < b.x ? 10 : -10);
      ctl(p, (function* () { yield* p.hop(260); say(p, pick(['You found me!', 'Aww, found!', 'Hehe!']), 1.6); p.emote && p.emote('heart', 1.2); yield* idleFace(p, M, 1.4); })());
      FX.sparkles(b.x, gy(b.x) - 16, 12, 20, WHITE, hex('#ffe070')); Game.sfx('twinkle', b.x);
    } else {
      G.tries--;
      FX.poof(b.x, gy(b.x) - 10, 0xffe0f0d0, 0xff6ab04a, 6, 4);
      if (Math.random() < 0.25) { HUD.toast('Nobody here... but you found a berry!', { life: 1.8 }); Save.addItem('berry', 1); }
      else if (M.say) M.say(pick(['Not here...', 'Hmm?', 'Empty!']), 1.2);
      if (G.tries <= 0) { G.step = 'reveal'; G.st = 0; const p = A.partner, hb = G.bushes[G.hideIdx]; p.hidden = false; say(p, 'Here I am!', 1.6); shakeBush(G, G.hideIdx, 0.8); ctl(p, (function* () { yield* p.hop(220); yield* idleFace(p, M, 1.4); })()); FX.poof(hb.x, gy(hb.x) - 10, 0xffe0f0d0, 0xff6ab04a, 6, 4); }
    }
  }
  function shakeBush(G, i, T) { G.shake = i; G.shakeT = T; }
  function nearestBush(G) { const M = mk(); let bi = -1, bd = 34; G.bushes.forEach((b, i) => { const d = Math.abs(b.x - M.x); if (d < bd) { bd = d; bi = i; } }); return bi; }
  function updateSeek(G, dt) {
    G.st += dt;
    const M = mk();
    if (G.shakeT > 0) { G.shakeT -= dt; const b = G.bushes[G.shake]; if (b) b.prop.x = b.x0 + Math.round(Math.sin(Game.t * 60) * 1.5); if (G.shakeT <= 0 && b) b.prop.x = b.x0; }
    if (G.step === 'count') { if (G.st > 2.6) { G.step = 'search'; G.st = 0; G.rT = 1.4; if (M.say) M.say('Ready or not!', 1.2); } }
    else if (G.step === 'search') {
      G.rT -= dt;
      if (G.rT <= 0) { G.rT = rnd(1.6, 3); const i = Math.random() < 0.72 ? G.hideIdx : (Math.random() * G.bushes.length) | 0; shakeBush(G, i, 0.35); Game.sfx('rustle', G.bushes[i].x, 0.35); const b = G.bushes[i]; FX.add({ type: 'leaf', x: b.x + rnd(-8, 8), y: gy(b.x) - 16, vx: rnd(-20, 20), vy: -20, g: 60, life: 1, c: hex('#5ab04a'), layer: 3 }); }
    } else if (G.step === 'found' || G.step === 'reveal') {
      if (G.st > 1.8) { G.round++; if (G.round >= 3) finish(G.found >= 2, 'Found ' + nameOf(A.partner) + ' ' + G.found + ' of 3 times!', G.found * 120); else seekRound(G); }
    }
    const xs = G.bushes.map((b) => b.x);
    Game.camFocus = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: gy(M.x) - 30, zoom: 1.15, speed: 1.8 };
  }

  /* ---------- Tag ---------- */
  function* tagRun(p, G) {
    let hopT = rnd(0.6, 1.4), jit = 0;
    for (;;) {
      const dt = yield;
      const M = mk(); if (!M) return;
      const it = G.step === 'you' ? 'flee' : G.step === 'them' ? 'chase' : 'idle';
      if (it === 'idle') { p.setAct('play', 0.5); p.o.eyes = 'happy'; continue; }
      const sp = clamp((p.speed || 50) * 2.2, 90, it === 'chase' ? 120 : 132);
      let dir = it === 'flee' ? Math.sign(p.x - M.x) || 1 : Math.sign(M.x - p.x) || 1;
      jit -= dt; if (it === 'flee' && jit <= 0 && Math.abs(p.x - M.x) > 90) { jit = rnd(0.6, 1.4); if (Math.random() < 0.3) dir = -dir; }
      // cornered: dodge past with a big leap
      if (it === 'flee' && (p.x < G.zone[0] + 10 || p.x > G.zone[1] - 10) && Math.abs(p.x - M.x) < 70) { dir = -dir; if (p.air <= 0) { p.vair = 300; p.air = 0.5; Game.sfx('boing', p.x, 0.6); } }
      const nx = clamp(p.x + dir * sp * dt, G.zone[0], G.zone[1]);
      if (!World.isWet(nx, 10)) { p.x = nx; p.moving = sp; }
      p.turn(p.face(dir), dt, 14);
      hopT -= dt; if (hopT <= 0 && p.air <= 0) { hopT = rnd(0.7, 1.6); p.vair = 170; p.air = 0.5; }
      p.setAct(it === 'flee' ? 'flee' : 'chase', 0.6); p.o.eyes = 'happy'; p.o.mouth = 0.6;
    }
  }
  function updateTag(G, dt) {
    const M = mk(), p = A.partner; if (!M || !p) return;
    G.st += dt;
    if (G.tagT > 0) { G.tagT -= dt; Game.camFocus = { x: (M.x + p.x) / 2, y: Math.min(M.y, p.y) - 20, zoom: 1.2 }; return; }
    G.time -= dt;
    const touch = Math.abs(M.x - p.x) < 16 && Math.abs(M.y - p.y) < 24;
    if (G.step === 'you') {
      if (touch) { G.caught = true; G.step = 'switch'; G.tagT = 1.6; Game.sfx('twinkle', p.x); FX.sparkles(p.x, p.y - 14, 10, 16, WHITE, hex('#8ad8ff')); say(p, 'Tag! Now I\'m it!', 1.6); setTimeout(() => { if (A.g === G) { G.step = 'them'; G.time = 12; } }, 1600); }
      else if (G.time <= 0) { G.step = 'switch'; G.tagT = 1.6; say(p, 'Too slow! My turn!', 1.6); setTimeout(() => { if (A.g === G) { G.step = 'them'; G.time = 12; } }, 1600); }
    } else if (G.step === 'them') {
      if (touch) { G.step = 'done'; Game.sfx('bonk', M.x, 0.7); say(p, 'Tagged you!', 1.4); finish(G.caught, G.caught ? 'You caught ' + nameOf(p) + ' but got tagged back!' : nameOf(p) + ' wins at tag!', G.caught ? 150 : 40); }
      else if (G.time <= 0) { G.step = 'done'; finish(true, G.caught ? 'Perfect tag! Caught and escaped!' : 'You escaped ' + nameOf(p) + '!', G.caught ? 450 : 200); }
    }
    // keep inside the playground
    if (M.x < G.zone[0]) M.x = G.zone[0]; if (M.x > G.zone[1]) M.x = G.zone[1];
    Game.camFocus = { x: (M.x + p.x) / 2, y: Math.min(M.y, p.y) - 20, zoom: Math.abs(M.x - p.x) > 180 ? 1 : 1.15, speed: 3 };
  }

  /* ---------- per-frame ---------- */
  function update(dt) {
    A.bars = clamp(A.bars + (A.live ? dt : -dt) * 3, 0, 1);
    A.jumpT = Math.max(0, (A.jumpT || 0) - dt);
    if (!A.live) return;
    A.t += dt;
    const M = mk(), p = A.partner;
    if (!M || !p || !p.alive || Game.mode !== 'explore') { leave(); return; }
    for (const m of [M, p, A.partner2]) if (m && m.hitT > 0) { m.hitT -= dt; m.tintK = Math.max(0, m.hitT * 1.4); }
    for (let i = A.fx.length - 1; i >= 0; i--) {
      const f = A.fx[i]; f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.x = lerp(f.x0, f.tx, k); f.y = lerp(f.y0, f.ty, k) - Math.sin(k * Math.PI) * 14;
      if (Math.random() < dt * 40) FX.add({ type: 'spark', x: f.x + rnd(-2, 2), y: f.y + rnd(-2, 2), size: 1, life: 0.35, c: hex(f.type.c2), c2: hex(f.type.col), layer: 3 });
      if (k >= 1) A.fx.splice(i, 1);
    }
    const G = A.g;
    if (A.phase === 'menu') { Game.camFocus = { x: (M.x + p.x) / 2, y: Math.min(M.y, p.y) - 18, zoom: 1.3 }; if (!M.target) M.turn(M.face(p.x > M.x ? 1 : -1, false), dt, 6); return; }
    if (!G) return;
    G.t += dt;
    if (G.over) { G.over += dt; if (G.over > 2.8) toMenu(); return; }
    if (G.id === 'battle') updateBattle(G, dt);
    else if (G.id === 'rope') updateRope(G, dt);
    else if (G.id === 'seek') updateSeek(G, dt);
    else if (G.id === 'tag') updateTag(G, dt);
  }
  // Mudkip's controls while playing: returns true when the game drives Mudkip (no free movement)
  function freeMove() { const G = A.g; return !!(A.live && G && !G.over && ((G.id === 'tag' && (G.step === 'you' || G.step === 'them')) || (G.id === 'seek' && G.step === 'search'))); }
  function drive(M, dt) {
    if (freeMove()) return false;
    M.idleT = 0;
    if (M.target) return true;
    M.keyDir = 0; M.keyY = 0; M.running = false; M.sneak = false; M.jumpHeld = (A.jumpT || 0) > 0;
    return true;
  }

  /* ---------- input ---------- */
  function act(k) {
    const G = A.g;
    if (A.phase === 'menu') {
      if (k === 'left' || k === 'up') A.sel = (A.sel + GAMES.length - 1) % GAMES.length;
      else if (k === 'right' || k === 'down') A.sel = (A.sel + 1) % GAMES.length;
      else if (k === 'ok') start(GAMES[A.sel].id);
      else if (typeof k === 'number' && k < GAMES.length) start(GAMES[k].id);
      return;
    }
    if (!G || G.over) { if (G && G.over > 0.8 && k === 'ok') toMenu(); return; }
    if (G.id === 'battle' && typeof k === 'number' && k < 3) battlePick(k);
    if (G.id === 'rope' && k === 'ok' && G.step === 'go') { const M = mk(); M.jumpPress(); A.jumpT = 0.2; }
    if (G.id === 'seek' && (k === 'ok' || k === 'search')) { const i = nearestBush(G); if (i >= 0) search(i); else HUD.toast('Walk up to a bush to search it!', { life: 1.4 }); }
  }
  const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'Shift', 'z'];
  // returns true when the key was used by the game (the normal handler must not see it)
  function key(k, e) {
    if (!A.live) return false;
    if (k === 'Escape' || k === 'h') { if (A.phase === 'play' && A.g && !A.g.over) { cleanup(); toMenu(); } else leave(); return true; }
    if (freeMove() && MOVE_KEYS.includes(k)) return false;
    if (freeMove() && k === ' ' && !(A.g.id === 'seek')) return false;
    if (/^[1-4]$/.test(k)) { act(+k - 1); return true; }
    if (k === 'ArrowLeft' || k === 'a') act('left'); else if (k === 'ArrowRight' || k === 'd') act('right');
    else if (k === 'ArrowUp' || k === 'w') act('up'); else if (k === 'ArrowDown' || k === 's') act('down');
    else if (k === ' ' || k === 'Enter' || k === 'e') act('ok');
    return true;
  }
  function down(ux, uy) {
    if (!A.live) return false;
    for (const b of A.btns) if (ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) { b.fn(); return true; }
    const G = A.g;
    if (G && G.id === 'rope' && !G.over) { act('ok'); return true; }
    if (freeMove()) return false; // the joystick / tap-to-walk still work
    return true;
  }

  /* ---------- drawing: in the world ---------- */
  function drawWorld(fb, cx, cy, t, back) {
    if (!A.live) return;
    const G = A.g;
    if (G && G.id === 'rope' && G.step !== 'intro') { if (back) { if (G.stake !== undefined) drawStake(fb, cx, cy, G.stake); drawRope(fb, cx, cy, G, false); } else drawRope(fb, cx, cy, G, true); }
    if (back) return;
    // flying attacks
    for (const f of A.fx) {
      const X = Math.round(f.x - cx), Y = Math.round(f.y - cy), c1 = hex(f.type.col), c2 = hex(f.type.c2), r = 4 + Math.round(Math.sin(t * 20) * 0.6);
      if (f.type.id === 'grass') { for (let a = 0; a < 3; a++) { const an = t * 14 + a * 2.1; for (let q = -3; q <= 3; q++) UI.put(fb, X + Math.round(Math.cos(an) * q), Y + Math.round(Math.sin(an) * q * 0.5), q > 1 ? c2 : c1); } continue; }
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const q = x * x + y * y; if (q > r * r) continue; const i = (Y + y) * fb.w + X + x; if (X + x < 0 || Y + y < 0 || X + x >= fb.w || Y + y >= fb.h) continue; fb.d[i] = q < r * r * 0.3 ? 0xffffffff : q < r * r * 0.65 ? c2 : c1; }
      if (f.type.id === 'fire') for (let k = 0; k < 3; k++) UI.put(fb, X - Math.round(Math.sign(f.tx - f.x0) * (r + 1 + k * 2)), Y + ((Math.random() * 3) | 0) - 1, k ? c1 : c2);
    }
  }
  /* ---------- drawing: UI (letterbox, cards, buttons) ---------- */
  function btn(fb, x, y, w, h, label, col, fn, sub, on) {
    UI.rrect(fb, x, y + 2, w, h, 5, 0xff0a0e1a);
    UI.panel(fb, x, y - (on ? 1 : 0), w, h, { r: 5, ol: INK, fill: on ? U.tweak(hex(col), 0, 1, 0.1) : hex(col) });
    Font.draw(fb, label, x + w / 2, y + (sub ? 3 : Math.round(h / 2 - 3)) - (on ? 1 : 0), WHITE, { font: 'small', align: 'center', outline: INK });
    if (sub) Font.draw(fb, sub, x + w / 2, y + 13 - (on ? 1 : 0), 0xffe8f0ff, { font: 'small', align: 'center', outline: INK });
    A.btns.push({ x, y, w, h, fn });
  }
  function gameIcon(fb, id, x, y) {
    const w = WHITE;
    if (id === 'battle') { const pts = [[2, 0], [0, 4], [3, 4], [1, 8], [5, 3], [2, 3], [4, 0]]; for (let i = 0; i < pts.length - 1; i++) UI.line(fb, x + pts[i][0], y + pts[i][1], x + pts[i + 1][0], y + pts[i + 1][1], w); }
    else if (id === 'rope') { for (let a = 0; a < Math.PI; a += 0.2) UI.put(fb, x + 4 + Math.round(Math.cos(a) * 4), y + 5 + Math.round(Math.sin(a) * 3), w); UI.rect(fb, x, y + 1, 1, 4, w); UI.rect(fb, x + 8, y + 1, 1, 4, w); }
    else if (id === 'seek') { UI.disc(fb, x + 4, y + 4, 4, 0xff3a9a4a); UI.put(fb, x + 3, y + 3, w); UI.put(fb, x + 5, y + 3, w); }
    else { UI.disc(fb, x + 3, y + 2, 2, w); UI.line(fb, x + 3, y + 4, x + 1, y + 8, w); UI.line(fb, x + 3, y + 5, x + 6, y + 7, w); }
  }
  function hearts(fb, m, n, max) {
    const [ux, uy] = Talk.toUI(m.x, m.headPt()[1] - 8);
    for (let h = 0; h < max; h++) Font.draw(fb, '{heart}', Math.round(ux - max * 5 + h * 10), Math.round(uy - 10), h < n ? 0xff4a4aff : 0xff505060, { font: 'body', outline: INK });
  }
  function drawUI(fb, t) {
    A.btns.length = 0;
    const W = fb.w, H = fb.h, bh = Math.round(H * 0.1 * U.ease.outCubic(A.bars));
    if (bh > 0) { UI.rect(fb, 0, 0, W, bh, 0xff05060c); UI.rect(fb, 0, H - bh, W, bh, 0xff05060c); }
    if (!A.live) return;
    const G = A.g, p = A.partner, M = mk();
    const title = (s, c = WHITE) => Font.draw(fb, s, W / 2, Math.max(4, Math.round(bh / 2 - 4)), c, { font: 'title', align: 'center', outline: INK });
    const foot = (s) => Font.draw(fb, s, W / 2, H - Math.max(10, Math.round(bh / 2 + 3)), 0xffd8e0f0, { font: 'small', align: 'center', outline: INK });
    // leave button
    const lb = 'Leave (Esc)', lw = Font.measure(lb, 'small') + 12;
    UI.panel(fb, 6, 4, lw, 14, { r: 4, ol: INK, fill: 0xff26303e }); Font.draw(fb, lb, 6 + lw / 2, 8, WHITE, { font: 'small', align: 'center' });
    A.btns.push({ x: 4, y: 2, w: lw + 4, h: 18, fn: () => { if (A.phase === 'play' && A.g && !A.g.over) toMenu(); else leave(); } });
    if (A.phase === 'menu') {
      title('Play with ' + nameOf(p) + '!', hex('#ffe070'));
      const bw = Math.min(88, Math.floor((W - 30) / 4)), gap = 5, tot = bw * 4 + gap * 3, x0 = Math.round(W / 2 - tot / 2), by = H - bh - 40;
      GAMES.forEach((g, i) => { const x = x0 + i * (bw + gap); btn(fb, x, by, bw, 30, (i + 1) + ' ' + g.name, g.col, () => { A.sel = i; start(g.id); }, null, A.sel === i); gameIcon(fb, g.id, x + bw / 2 - 4, by + 18); });
      foot('Pick a game: 1-4, arrows + Space, or tap');
      return;
    }
    if (!G) return;
    if (G.id === 'battle') {
      if (M && p) { hearts(fb, M, G.hp[0], 3); hearts(fb, p, G.hp[1], 3); }
      title('Type Battle   ' + (3 - G.hp[1]) + ' : ' + (3 - G.hp[0]));
      if (G.step === 'pick' && !G.over) {
        const bw = Math.min(96, Math.floor((W - 30) / 3)), gap = 6, x0 = Math.round(W / 2 - (bw * 3 + gap * 2) / 2), by = H - bh - 36;
        TYPES.forEach((ty, i) => btn(fb, x0 + i * (bw + gap), by, bw, 26, (i + 1) + ' ' + ty.name, ty.col, () => battlePick(i), 'beats ' + TI[ty.beats].name));
        if (A.hint) Font.draw(fb, A.hint, W / 2, by - 12, 0xffffe8a0, { font: 'small', align: 'center', outline: INK });
      }
      if (G.step === 'hit' && G.st < 1) { const txt = G.res === 'win' ? 'Super effective!' : G.res === 'lose' ? 'Ouch!' : 'It\'s a tie!'; const [ux, uy] = Talk.toUI(G.cx, Math.min(M.y, p.y) - 50); Font.draw(fb, txt, Math.round(ux), Math.round(uy - G.st * 10), G.res === 'win' ? 0xff5aff7a : G.res === 'lose' ? 0xff5a5aff : WHITE, { font: 'title', align: 'center', outline: INK }); }
      if (G.step === 'intro') foot('Water > Fire > Grass > Water');
      else foot('Pick a move: 1 2 3 or tap');
    } else if (G.id === 'rope') {
      title(G.step === 'intro' ? 'Jump Rope' : String(G.jumps), G.jumps >= 10 ? hex('#ffe070') : WHITE);
      foot(G.step === 'intro' ? 'Get ready...' : 'Space / tap to jump!   best ' + Math.max(G.best, G.jumps));
    } else if (G.id === 'seek') {
      title('Hide & Seek   round ' + Math.min(3, G.round + 1) + '/3   found ' + G.found);
      if (G.step === 'count') foot('Mudkip is counting... no peeking!');
      else if (G.step === 'search') {
        foot('Walk to a bush and press E / Space.  Tries: ' + G.tries);
        if (typeof Pad !== 'undefined' && Pad.touch) { const sw = 58, sx = W - sw - 10, sy = H - bh - 70; btn(fb, sx, sy, sw, 22, 'SEARCH', '#4ac860', () => act('search')); }
        const i = nearestBush(G); if (i >= 0) { const b = G.bushes[i], [ux, uy] = Talk.toUI(b.x, gy(b.x) - 30); Font.draw(fb, '?', Math.round(ux), Math.round(uy + Math.sin(t * 6) * 2), 0xffffe070, { font: 'title', align: 'center', outline: INK }); }
      }
    } else if (G.id === 'tag') {
      const T = Math.max(0, G.time);
      title(G.step === 'you' ? 'You\'re it! Catch ' + nameOf(p) + '!' : G.step === 'them' ? 'Run! ' + nameOf(p) + ' is it!' : 'Tag!', G.step === 'them' ? hex('#ff8a8a') : WHITE);
      if (G.step === 'you' || G.step === 'them') { const bw = Math.min(160, W - 40), bx = Math.round(W / 2 - bw / 2), byy = bh + 6, k = T / (G.step === 'you' ? 18 : 12); UI.rect(fb, bx - 1, byy - 1, bw + 2, 6, INK); UI.rect(fb, bx, byy, Math.round(bw * k), 4, k < 0.3 ? 0xff4a4aff : 0xff5aff9a); }
      foot('Arrows / joystick to run, Space to jump');
    }
    if (G.over) {
      const w = 170, h = 44, x = Math.round(W / 2 - w / 2), y = Math.round(H * 0.34);
      UI.panel(fb, x, y, w, h, { r: 8, ol: INK, fill: G.win ? 0xff2a7a3a : 0xff3a2a6a });
      Font.draw(fb, G.win ? 'YOU WIN!' : 'GOOD GAME!', W / 2, y + 7, G.win ? hex('#ffe070') : WHITE, { font: 'title', align: 'center', outline: INK });
      const lines = Font.wrap ? Font.wrap(G.msg, 'small', w - 12) : [G.msg];
      lines.slice(0, 2).forEach((l, i) => Font.draw(fb, l, W / 2, y + 24 + i * 9, WHITE, { font: 'small', align: 'center' }));
    }
  }
  U.on && U.on('area', () => { A.live = false; A.phase = 'off'; A.g = null; A.bars = 0; A.fx.length = 0; A.partner = A.partner2 = null; Game.camFocus = null; });
  return Object.assign(A, { open, leave, update, drive, freeMove, key, down, drawWorld, drawUI, GAMES });
})();
