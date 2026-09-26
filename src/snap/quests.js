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
    if (Game.mode === 'explore' && Game.rt > 3 && !T.walk) { T.walk = 1; HUD.toast('Tap anywhere to walk or swim. Drag to look around.', { life: 4.5 }); }
    if (Game.mode === 'explore' && Game.rt > 12 && !T.snap && Save.data.shots === 0) { T.snap = 1; HUD.toast('Tap SNAP to open your camera!', { life: 4 }); }
    if (Save.data.shots === 1 && !T.dex) { T.dex = 1; setTimeout(() => HUD.toast('Your photo is in the Pokédex (top right).', { life: 4 }), 2600); }
  }
  function onStart() { checkUnlocks(); }
  function unseen() { return Q.unseenN > 0; }
  function seen() { Q.unseenN = 0; }
  function drawPop(fb, t) {
    const p = Q.pops[0];
    if (!p || p.t < 0) return;
    const S = UI.skin();
    const k = p.t < 0.3 ? U.ease.outBack(p.t / 0.3) : p.t > p.life - 0.4 ? (p.life - p.t) / 0.4 : 1;
    const w = Math.max(200, Font.measure(p.text, 'body') + 24), h = p.reward || p.sub ? 40 : 26;
    const x = Math.round(fb.w / 2 - w / 2), y = Math.round(fb.h - 70 - h + (1 - k) * 30);
    UI.body(fb, x, y, w, h, S, { r: 5 });
    UI.screen(fb, x + 4, y + 4, w - 8, h - 8, { fill: S.screen, rim: S.ink, glare: false });
    Font.draw(fb, (p.unlock ? '{spark} ' : '{check} ') + p.text, fb.w / 2, y + 10, S.screenText, { font: 'body', align: 'center' });
    if (p.reward) Font.draw(fb, 'Reward: ' + p.reward.label, fb.w / 2, y + 24, S.accent === 0xff2f7ae8 ? 0xff1f58c8 : U.tweak(S.accent, 0, 1, -0.2), { font: 'small', align: 'center' });
    else if (p.sub) Font.draw(fb, p.sub + ' — open the map!', fb.w / 2, y + 24, U.tweak(S.screenText, 0, 1, 0.2), { font: 'small', align: 'center' });
  }
  return { BIRCH, stamps, checkPhoto, checkBirch, checkUnlocks, tick, onStart, unseen, seen, drawPop, Q };
})();
