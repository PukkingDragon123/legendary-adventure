/* ------------------------------------------------------------------
   Quests — photo objectives (per species, from DexData) and Professor
   Birch's requests. Completing them grants rewards and "research
   stamps"; stamps unlock new areas on the world map.
------------------------------------------------------------------- */
const Quests = (() => {
  const { clamp } = U;
  // Professor Birch's requests: general goals that guide the player
  const BIRCH = [
    { id: 'b.first', t: 'Take your very first photo', hint: 'Tap SNAP, frame a Pokémon and press the shutter.', test: (d) => d.shots >= 1, reward: 'item:berry:3' },
    { id: 'b.three', t: 'Photograph 3 different Pokémon', hint: 'Spheal, Corphish, Walrein... who else lives at the cove?', test: (d) => Object.keys(d.seen).length >= 3, reward: 'pts:300' },
    { id: 'b.star3', t: 'Earn a ★★★ photo', hint: 'Rare behaviours earn more stars. Try making Pokémon react!', test: (d) => Object.values(d.photos).some((p) => p.s3 || p.s4), reward: 'skin.mudkip' },
    { id: 'b.gold', t: 'Earn a Gold medal photo', hint: 'Big, centred, facing you, in focus and doing something fun.', test: (d) => Object.values(d.photos).some((p) => ['s1', 's2', 's3', 's4'].some((k) => p[k] && p[k].medal >= 3)), reward: 'key.pokeball' },
    { id: 'b.under', t: 'Photograph a Pokémon underwater', hint: 'Mudkip is a great swimmer — dive in!', test: (d) => !!(d.seen.luvdisc || d.seen.corsola || d.seen.mantine || d.seen.remoraid), reward: 'shirt.stripe' },
    { id: 'b.secret', t: 'Find a hidden secret', hint: 'Scan suspicious rocks, boats and chests.', test: (d) => Object.keys(d.disc).length >= 2, reward: 'pts:500' },
    { id: 'b.star4', t: 'Earn a ★★★★ photo', hint: 'The rarest moments: attacks on the camera, breaches, transformations...', test: (d) => Object.values(d.photos).some((p) => p.s4), reward: 'pts:800' },
    { id: 'b.ten', t: 'Register 10 Pokémon', hint: 'New areas bring new Pokémon.', test: (d) => Object.keys(d.seen).length >= 10, reward: 'glasses.star' },
    { id: 'b.band', t: 'Gather Meloetta\'s band', hint: 'Photograph Chatot, Swablu, Altaria and Taillow in Treetop Town, and find Meloetta.', test: (d) => ['chatot', 'swablu', 'altaria', 'taillow', 'meloetta'].every((k) => d.seen[k]), reward: 'shirt.pop' },
    { id: 'b.twenty', t: 'Register 20 Pokémon', hint: 'Every area hides rare visitors.', test: (d) => Object.keys(d.seen).length >= 20, reward: 'skin.gold' },
  ];
  const Q = { pops: [], unseenN: 0, lastUnlockCheck: 0 };
  const stamps = () => Object.keys(Save.data.obj).length + BIRCH.filter((b) => Save.data.quests[b.id]).length;
  function complete(id, text, reward) {
    const r = Rewards.grant(reward);
    Q.pops.push({ t: 0, life: 4.2, text, reward: r });
    Q.unseenN++;
    SFX.reward();
    checkUnlocks();
  }
  function checkPhoto(res, rec) {
    const d = DexData.S[res.species];
    if (d) for (const o of d.obj) {
      if (Save.data.obj[o.id]) continue;
      let ok = false;
      if (o.beh) ok = res.beh === o.beh;
      if (o.medal) ok = res.medal >= o.medal;
      if (o.stars) ok = res.stars >= o.stars;
      if (ok) { Save.data.obj[o.id] = Date.now(); Save.save(); complete(o.id, d.name + ': ' + o.t, o.reward); }
    }
    checkBirch();
  }
  function checkBirch() {
    const D = Save.data;
    for (const b of BIRCH) if (!D.quests[b.id] && b.test(D)) { D.quests[b.id] = Date.now(); Save.save(); complete(b.id, 'Request: ' + b.t, b.reward); }
  }
  function checkUnlocks() {
    const n = stamps();
    for (const id in DexData.AREAS) {
      const a = DexData.AREAS[id];
      if (Save.unlocked(id)) continue;
      const ok = id === 'stage' ? Save.data.quests['b.band'] : n >= a.need;
      if (ok && Save.unlock(id)) {
        setTimeout(() => { HUD.toast('New area unlocked: ' + a.name + '!', { life: 4 }); SFX.unlock(); }, 1400);
        Q.pops.push({ t: -1.2, life: 4.2, text: 'New area: ' + a.name, sub: a.sub, unlock: id });
      }
    }
  }
  function tick(dt) {
    for (const p of Q.pops) p.t += dt;
    Q.pops = Q.pops.filter((p) => p.t < p.life);
    Q.lastUnlockCheck += dt;
    if (Q.lastUnlockCheck > 3) { Q.lastUnlockCheck = 0; checkUnlocks(); checkBirch(); }
    // light-touch tutorial
    const T = Save.data.tut;
    if (Game.mode === 'explore' && Game.rt > 3 && !T.walk) { T.walk = 1; HUD.toast(typeof Pad !== 'undefined' && Pad.touch ? 'Stick to move, A to jump (tap twice to flip!), B to use a move. Or just tap where to go.' : 'Arrow keys to move, Space to jump (twice to flip!). Or click where to go.', { life: 5 }); }
    if (Game.mode === 'explore' && Game.rt > 12 && !T.snap && Save.data.shots === 0) { T.snap = 1; HUD.toast('Tap SNAP (or press C) to open your camera. Hold the shutter to capture the perfect moment!', { life: 4.5 }); }
    if (Save.data.shots === 1 && !T.dex) { T.dex = 1; setTimeout(() => HUD.toast('Your photo is in the Pokédex (top right).', { life: 4 }), 2600); }
  }
  function onStart() { checkUnlocks(); }
  function unseen() { return Q.unseenN > 0; }
  function seen() { Q.unseenN = 0; }
  // request completed: a slim ribbon that slides in at the top-right (not a pop-up)
  function drawPop(fb, t) {
    const p = Q.pops[0];
    if (!p || p.t < 0) return;
    const S = UI.skin();
    const k = Math.min(1, p.t / 0.3, (p.life - p.t) / 0.4);
    if (k <= 0) return;
    const sub = p.reward ? 'Reward: ' + p.reward.label : p.sub ? p.sub + ' — open the map!' : '';
    const w = Math.max(Font.measure(p.text, 'body'), sub ? Font.measure(sub, 'small') : 0) + 26, h = sub ? 26 : 16;
    const x = Math.round(fb.w - 6 - w + (1 - k) * (w + 10)), y = 34;
    UI.rectA(fb, x, y, w, h, 0xff0a0e20, 0.5 * k);
    UI.rect(fb, x + w - 2, y, 2, h, S.accent);
    Font.draw(fb, (p.unlock ? '{spark} ' : '{check} ') + p.text, x + 6, y + 3, 0xffffffff, { font: 'body', shadow: 0xff0a0e20 });
    if (sub) Font.draw(fb, sub, x + 6, y + 16, 0xffffe08a, { font: 'small', shadow: 0xff0a0e20 });
  }
  return { BIRCH, stamps, checkPhoto, checkBirch, checkUnlocks, tick, onStart, unseen, seen, drawPop, Q };
})();
