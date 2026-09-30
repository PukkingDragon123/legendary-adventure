/* ------------------------------------------------------------------
   Sunset Bar shift — a drink-serving minigame behind Lombre's tiki bar
   (played in the world, like the sumo bout). Pokémon from the
   boardwalk walk up to the counter with an order in a bubble: a row of
   berry icons. Tap the berries in order (1 Pecha, 2 Oran, 3 Nanab),
   then SERVE (4 / Space). Right drink: happy dance, tip. Wrong drink:
   a spit-take. Too slow: they stomp off. Serve 5 of 8 to win.
   First win: TM10 Whirlpool + the flower lei. Best score is kept.
------------------------------------------------------------------- */
const BarGame = (() => {
  if (typeof Arcade === 'undefined' || typeof Boardwalk === 'undefined' || !Boardwalk.BAR) return {};
  const { rnd, pick, hex, clamp } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const ING = [
    { id: 'pecha', name: 'Pecha', col: '#ff7ab0', c2: '#ffd0e4' },
    { id: 'oran', name: 'Oran', col: '#3a8ae8', c2: '#bfe0ff' },
    { id: 'nanab', name: 'Nanab', col: '#ffd23a', c2: '#fff4b0' },
  ];
  const NAMES = { 'pecha': 'Pecha Fizz', 'oran': 'Oran Splash', 'nanab': 'Nanab Shake', 'pecha,oran': 'Sunset Punch', 'oran,nanab': 'Lagoon Smoothie', 'nanab,pecha': 'Tiki Twist' };
  const BAR = Boardwalk.BAR, N = 8, NEED = 5;
  const H = () => Arcade.H;
  const gy = (x) => World.groundAt(x);
  const mk = () => Game.mudkip;

  function pool(host) {
    const M = mk();
    return Mons.all.filter((m) => m !== host && m !== M && m.alive && m.visible && m.mode === 'land' && !m.layer && m.walkTo && !m.champ && m.kind !== 'mailman' && !(DexData.S[m.dex] || {}).legendary && Math.abs(m.x - BAR) < 1400);
  }
  function order(n) { const o = []; const len = n < 2 ? 1 : n < 5 ? 2 : 3; for (let i = 0; i < len; i++) o.push((Math.random() * 3) | 0); return o; }
  function drinkName(o) { return NAMES[o.map((i) => ING[i].id).join(',')] || (o.length >= 3 ? 'Sunset Supreme' : 'House Special'); }

  function start(G, M, host) {
    Object.assign(G, { step: 'intro', st: 0, n: 0, served: 0, tips: 0, cust: null, cup: [], pool: pool(host), used: 0, best: Save.data.stats.bar || 0 });
    M.goTo ? M.goTo({ x: BAR + 26, kind: 'walk' }) : (M.x = BAR + 26);
    H().ctl(host, H().walkThen(host, BAR + 58, 60, function* () { yield* H().idleFace(host, M, 1e9, 'play'); }));
    H().say(host, 'Lom-bre! Rush hour! Mix what they ask for!', 2.4);
  }
  function nextCustomer(G) {
    if (G.n >= N) return end(G);
    const P = G.pool.filter((m) => m.alive && !m.arcade);
    const m = P.length ? P[G.used++ % P.length] : null;
    G.n++;
    const o = order(G.n), pat = clamp(10 - G.n * 0.6, 5, 10) + o.length;
    G.cust = { m, o, pat, t: 0, state: 'walk', x: BAR - 30 };
    G.cup = [];
    if (m) { const sx = m.x < BAR ? -1 : 1; if (Math.abs(m.x - BAR) > 260) m.x = BAR + sx * 240; H().ctl(m, H().walkThen(m, BAR - 30, Math.max(80, (m.speed || 50) * 2), function* () { G.cust && G.cust.m === m && (G.cust.state = 'wait'); yield* H().idleFace(m, mk(), 1e9, 'play'); })); }
    else G.cust.state = 'wait';
  }
  function leaveCust(G, mood) {
    const c = G.cust; if (!c) return;
    const m = c.m; G.cust = null; G.gap = 1.1;
    if (!m) return;
    H().ctl(m, (function* () {
      if (mood === 'happy') { m.emote('heart', 1.4); yield* m.hop(240); yield* m.hop(200); }
      else if (mood === 'spit') { m.emote('swirl', 1.2); let e = 0; while (e < 0.9) { const dt = yield; e += dt; m.rot = Math.sin(e * 30) * 0.2; } m.rot = 0; }
      else { m.emote('anger', 1.2); }
      yield* m.walkTo(BAR - 30 - rnd(120, 220), Math.max(70, (m.speed || 50) * 1.6), { turn: 12 });
      H().release(m);
    })());
  }
  function add(G, i) {
    const c = G.cust; if (!c || c.state !== 'wait' || G.cup.length >= 3) return;
    G.cup.push(i); const M = mk(), I = ING[i];
    Game.sfx('pop', M.x, 0.6);
    FX.add({ type: 'drop', x: M.x - 4, y: M.y - 26, vx: rnd(-20, 20), vy: -rnd(40, 80), g: 380, life: 0.5, c: hex(I.c2), c2: hex(I.col), size: 2, floor: M.y - 14, layer: 4 });
    M.o && (M.o.mouth = 0.5);
  }
  function serve(G) {
    const c = G.cust; if (!c || c.state !== 'wait') return;
    if (!G.cup.length) { HUD.toast('Mix something first! 1 Pecha · 2 Oran · 3 Nanab', { life: 1.4 }); return; }
    const M = mk(), m = c.m, ok = G.cup.join() === c.o.join();
    const at = m ? m.headPt() : [BAR - 30, gy(BAR) - 30];
    Game.shake && Game.shake(1);
    if (ok) {
      G.served++; const tip = Math.round(20 + (1 - c.t / c.pat) * 40); G.tips += tip; Save.addPoints(tip);
      Game.sfx('yum', at[0], 0.9); FX.sparkles(at[0], at[1], 14, 20, WHITE, hex('#ffe070'));
      if (m) H().say(m, pick(['Delicious!', 'Sooo good!', 'Perfect!', 'Another one!', '*slurp* Ahhh~']), 1.6);
      if (typeof Talk !== 'undefined' && Arcade.partner) H().say(Arcade.partner, pick(['Lom-bre!', 'Nice pour!', 'Tip jar!']), 1.2);
      leaveCust(G, 'happy');
    } else {
      Game.sfx('splash', at[0], 0.8);
      for (let i = 0; i < 16; i++) FX.add({ type: 'drop', x: at[0], y: at[1] + 4, vx: (M.x > at[0] ? 1 : -1) * rnd(60, 160), vy: -rnd(20, 90), g: 380, life: 0.7, c: WHITE, c2: hex(ING[G.cup[0]].col), size: 2, floor: gy(at[0]), layer: 4 });
      if (m) H().say(m, pick(['BLEHH!', 'Pfffft!', 'That is NOT ' + drinkName(c.o) + '!', 'Is this... seaweed?']), 1.8);
      if (M.say) M.say(pick(['Oops!', 'Hehe...', 'Mud...']), 1);
      leaveCust(G, 'spit');
    }
    G.cup = [];
  }
  function end(G) {
    G.step = 'done'; const s = G.served, win = s >= NEED;
    const best = Math.max(G.best, s); Save.data.stats.bar = best; Save.save();
    H().finish(win, s + ' of ' + N + ' served! ' + (win ? 'Great shift!' : 'Lombre needs ' + NEED + '.') + (s > G.best ? ' New best!' : ''), s * 40);
  }
  function update(G, dt) {
    G.st += dt;
    const M = mk();
    Game.camFocus = { x: BAR - 4, y: gy(BAR) - 34, zoom: 1.4 };
    if (M && !M.target) M.turn(M.face(-1, false), dt, 8);
    if (G.step === 'intro') { if (G.st > 2) { G.step = 'go'; G.gap = 0.3; } return; }
    if (G.step !== 'go') return;
    if (!G.cust) { G.gap -= dt; if (G.gap <= 0) nextCustomer(G); return; }
    const c = G.cust;
    if (c.m && !c.m.alive) { G.cust = null; G.gap = 0.5; return; }
    if (c.state === 'walk') { c.wt = (c.wt || 0) + dt; if (c.wt > 5) c.state = 'wait'; return; }
    c.t += dt;
    if (c.t > c.pat) { if (c.m) H().say(c.m, pick(['Too slow!', 'Hmph!', 'I\'m going to the Pokémart!']), 1.6); Game.sfx('error', null, 0.5); leaveCust(G, 'angry'); G.cup = []; }
  }
  function act(G, k) {
    if (G.step !== 'go') return;
    if (typeof k === 'number' && k < 3) add(G, k);
    else if (k === 3 || k === 'ok') serve(G);
    else if (k === 'down' || k === 'left') G.cup = [];
  }
  function end2(G) { if (G.cust && G.cust.m) H().release(G.cust.m); }
  function berry(fb, x, y, i, r = 4) { const I = ING[i]; UI.disc(fb, x, y + 1, r + 1, INK); UI.disc(fb, x, y, r, hex(I.col)); UI.put(fb, x - 1, y - 1, hex(I.c2)); UI.put(fb, x - 2, y - 2, WHITE); UI.put(fb, x, y - r - 1, 0xff3a9a4a); }
  function drawUI(fb, t, G, K) {
    const W = fb.w, H0 = fb.h, M = mk();
    K.title(G.step === 'intro' ? 'Sunset Bar: Rush Hour!' : 'Sunset Bar   ' + G.served + ' served   ' + Math.min(G.n, N) + '/' + N, hex('#ffe070'));
    const c = G.cust;
    if (c && c.state === 'wait') {
      const at = c.m ? c.m.headPt() : [BAR - 30, gy(BAR) - 30], [ux, uy] = Talk.toUI(at[0], at[1] - 8);
      const w = c.o.length * 12 + 10, x = Math.round(ux - w / 2), y = Math.round(uy - 26);
      UI.rrect(fb, x - 1, y - 1, w + 2, 18, 5, INK); UI.rrect(fb, x, y, w, 16, 4, WHITE);
      c.o.forEach((i, j) => berry(fb, x + 9 + j * 12, y + 8, i));
      const k = 1 - c.t / c.pat; UI.rect(fb, x, y + 18, w, 3, INK); UI.rect(fb, x, y + 18, Math.round(w * k), 3, k < 0.3 ? 0xff4a4aff : 0xff5aff9a);
      Font.draw(fb, drinkName(c.o), Math.round(ux), y - 10, 0xffffe8a0, { font: 'small', align: 'center', outline: INK });
    }
    // the cup over Mudkip
    if (M && G.step === 'go') {
      const [ux, uy] = Talk.toUI(M.x, M.headPt()[1] - 6), x = Math.round(ux), y = Math.round(uy - 18);
      UI.rect(fb, x - 8, y - 6, 16, 14, INK); UI.rect(fb, x - 7, y - 5, 14, 12, 0xffe8f4ff);
      G.cup.forEach((i, j) => UI.rect(fb, x - 7, y + 3 - j * 4, 14, 4, hex(ING[i].col)));
    }
    if (G.step === 'go') {
      const bw = Math.min(64, Math.floor((W - 30) / 4)), gap = 5, x0 = Math.round(W / 2 - (bw * 4 + gap * 3) / 2), by = H0 - K.bh - 34;
      ING.forEach((I, i) => { K.btn(x0 + i * (bw + gap), by, bw, 24, (i + 1) + ' ' + I.name, I.col, () => add(G, i)); berry(fb, x0 + i * (bw + gap) + bw / 2, by + 17, i, 3); });
      K.btn(x0 + 3 * (bw + gap), by, bw, 24, '4 SERVE', '#4ac860', () => serve(G), 'or Space');
      K.foot('Match the order! 1-3 add berries · 4/Space serve · Down: pour out');
    } else if (G.step === 'intro') K.foot('Customers show their order as berries. Mix them in order, then serve!');
  }
  Arcade.EXT.bar = { start, update, act, drawUI, end: end2 };

  // Lombre's menu gains the job offer (boardwalk.js keeps the drinks menu itself)
  const bm = Boardwalk.barMenu;
  function barMenu() {
    const lb = Boardwalk.barkeep, M = mk();
    if (!M || Math.abs(M.x - BAR) > 110) return;
    const won = Save.data.stats.bar >= NEED;
    Talk.open([{ text: won ? 'Lom-bre! My star mixer! Another shift? (best: ' + (Save.data.stats.bar || 0) + ' served)' : 'Lom-bre! Rush hour is coming and I need a helper behind the bar!', choices: ['Work a shift!', 'Buy a drink', 'Bye'] }], { who: lb && lb.alive ? lb : null, name: 'Lombre the Bartender', done: (i) => {
      if (i === 1) setTimeout(bm, 50);
      else if (i === 0) { if (!lb || !lb.alive) { HUD.toast('Lombre is on a break...', { life: 2 }); return; } Arcade.challenge('bar', lb, { onEnd: reward }); }
    } });
  }
  function reward(win) {
    if (!win) return;
    const st = Save.data.stats, first = !st.barWon; st.barWon = 1; Save.save();
    if (first) Save.addPoints(200);
    if (!Moves.has('whirl')) Moves.unlock('whirl', 'Lombre taught you its whirlpool mixing trick!');
    if (first && typeof Rewards !== 'undefined') { const r = Rewards.grant('neck.lei'); if (r && typeof Quests !== 'undefined') { Quests.Q.pops.push({ t: 0, life: 4.2, text: 'Star Mixer!', reward: r }); Quests.Q.unseenN++; } }
  }
  Boardwalk.barMenu = barMenu;
  return { ING, start, reward };
})();
