/* ------------------------------------------------------------------
   Hosts — the playground games are activities run by specific
   Pokémon (there is no play-anywhere menu). Talk to a host (it wears a
   little ball marker) to start its challenge; the first win teaches a
   TM and gives a cosmetic, and registers a Pokédex achievement.
     Type Battle  Budew, Weather Woods       → TM08 Sunny Day + round glasses
     Jump Rope    Spinda (+Azurill), Boardwalk → TM07 Rain Dance + sneakers
     Hide & Seek  Marill, Boardwalk          → TM06 Flash + bucket hat
                  (hides behind the bar, the tower, stands, palms...)
     Tag          Linoone, Boardwalk         → TM09 Quick Attack + scarf
   (Sumo: Champion Corphish; Sunset Bar shift: Lombre — see
   boardwalk.js / bar.js.)
------------------------------------------------------------------- */
const Hosts = (() => {
  if (typeof Talk === 'undefined' || typeof Arcade === 'undefined') return {};
  const { pick } = U;
  const INK = 0xff1b2240;
  const LIST = [
    { game: 'battle', area: 'forest', kind: 'budew', title: 'Type Battle', tm: 'sunny', gift: 'glasses.round',
      intro: ['Bu-dew! You look like a Water type. I am a Grass type. Hmph!', 'Water beats Fire, Fire beats Grass, Grass beats Water. Three hits and you win.', 'Beat me and I will teach you how I call the sun to open my bud!'],
      again: 'Bu-DEW! Rematch? I have been practising my Grass moves...', win: 'Budew taught you to call the sun!' },
    { game: 'rope', area: 'beach', kind: 'spinda', helper: 'azurill', title: 'Jump Rope', tm: 'rain', gift: 'shoes.sneakers',
      intro: ['Spin-spin-spinda! Let\'s skip rope!', 'Azurill holds the other end. Jump each time it sweeps under you!', 'Ten jumps in a row and I\'ll teach you my rain dance!'],
      again: 'Spiiin~ More skipping? Try to beat your record!', win: 'Spinda taught you its wobbly Rain Dance!' },
    { game: 'seek', area: 'beach', kind: 'marill', title: 'Hide & Seek', tm: 'flash', gift: 'hat.bucket',
      intro: ['Ma-rill! Let\'s play hide and seek on the boardwalk!', 'I\'ll hide behind something big: the bar, the tower, a stand, a palm...', 'Watch for a rustle and search there. Find me twice and I\'ll show you a bright trick!'],
      again: 'Rill-rill! I know even better hiding spots now!', win: 'Marill taught you Flash!' },
    { game: 'tag', area: 'beach', kind: 'linoone', title: 'Tag', tm: 'quick', gift: 'neck.scarf',
      intro: ['Lin-OONE! I am the fastest thing on the boardwalk!', 'You\'re it first! Catch me, then run when I chase you.', 'Escape me and I\'ll teach you Quick Attack!'],
      again: 'Zoom zoom! Tag again?', win: 'Linoone taught you Quick Attack!' },
  ];
  const st = () => Save.data.stats.hosts || (Save.data.stats.hosts = {});
  const hostOf = (h) => (Game.areaId === h.area ? Mons.all.find((m) => m.kind === h.kind && m.alive && !m.champ && !m.barkeep) || null : null);
  function hostFor(m) {
    for (const h of LIST) if (h.area === Game.areaId && h.kind === m.kind && hostOf(h) === m) return h;
    return null;
  }
  // a quest giver of the same species gets priority
  function questBusy(m) { return Talk.QUESTS.some((q) => q.area === Game.areaId && q.giver === m.kind && !(Talk.qState(q.id) && Talk.qState(q.id).s === 'done')); }
  function talk(m, h) {
    const n = st()[h.game] || 0, M = Game.mudkip;
    const nm = DexData.S[m.dex] ? DexData.S[m.dex].name : h.kind;
    const lines = n ? [{ text: h.again }] : h.intro.map((text) => ({ text }));
    lines[lines.length - 1] = { text: lines[lines.length - 1].text, choices: ['Let\'s play ' + h.title + '!', 'Later'] };
    Talk.open(lines, { who: m, name: nm, title: h.title, done: (i) => {
      if (i !== 0) return;
      if (!M || (M.mode !== 'land' && M.mode !== 'fall')) { HUD.toast('Get out of the water to play!', { life: 2 }); return; }
      const o = { onEnd: (win) => won(h, win) };
      if (h.helper) o.partner2 = Mons.all.find((q) => q.kind === h.helper && q.alive && Math.abs(q.x - m.x) < 500) || null;
      if (!Arcade.challenge(h.game, m, o)) HUD.toast(nm + ' is busy right now...', { life: 2 });
    } });
  }
  function won(h, win) {
    if (!win) return;
    const s = st(), first = !s[h.game]; s[h.game] = (s[h.game] || 0) + 1; Save.save();
    Save.addPoints(first ? 300 : 80);
    if (!Moves.has(h.tm)) Moves.unlock(h.tm, h.win);
    if (first && h.gift && typeof Rewards !== 'undefined') {
      const r = Rewards.grant(h.gift);
      if (r && typeof Quests !== 'undefined') { Quests.Q.pops.push({ t: 0, life: 4.2, text: h.title + ' champion!', reward: r }); Quests.Q.unseenN++; }
      if (typeof Style !== 'undefined' && Style.markNew) Style.markNew(h.gift);
    }
    Save.discover('host.' + h.game);
  }
  Talk.hooks.push((m) => {
    if (typeof Arcade !== 'undefined' && Arcade.live) return false;
    const h = hostFor(m); if (!h || questBusy(m)) return false;
    talk(m, h); return true;
  });
  // a ball marker over each host (and a talk prompt when close)
  function drawUI(fb, t) {
    if (Game.mode !== 'explore' || Arcade.live || Talk.busy()) return;
    const M = Game.mudkip;
    for (const h of LIST) {
      const m = hostOf(h); if (!m || !m.visible || m.hideK > 0.5 || questBusy(m)) continue;
      const [hx, hy] = m.headPt(), [x, y] = Talk.toUI(hx, hy);
      if (x < -20 || x > fb.w + 20 || y < -20 || y > fb.h + 20) continue;
      const X = Math.round(x), Y = Math.round(y) - 14 + Math.round(Math.sin(t * 4 + (m.seed || 0)) * 2);
      UI.disc(fb, X, Y + 1, 6, 0xff0a0e1a); UI.disc(fb, X, Y, 6, INK); UI.disc(fb, X, Y, 5, 0xffffffff);
      for (let yy = -5; yy < 0; yy++) for (let xx = -5; xx <= 5; xx++) if (xx * xx + yy * yy <= 25) UI.put(fb, X + xx, Y + yy, 0xff4a4aff);
      UI.rect(fb, X - 5, Y, 11, 1, INK); UI.disc(fb, X, Y, 2, INK); UI.put(fb, X, Y, 0xffffffff);
      if (M && Math.hypot(M.x - m.x, M.y - m.y) < 80) Font.draw(fb, (typeof Pad !== 'undefined' && Pad.touch ? 'Tap' : 'R') + ': ' + h.title, X, Y + 8, 0xffffffff, { font: 'small', align: 'center', outline: INK });
    }
  }
  return { LIST, drawUI, hostOf, won };
})();
