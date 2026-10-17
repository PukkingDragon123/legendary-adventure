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
    // one celebration at a time (the rest wait their turn), and only on the explore screen
    const p0 = Q.pops[0];
    if (p0 && Game.mode === 'explore' && !(HUD.banUp && HUD.banUp()) && !(typeof Moves !== 'undefined' && Moves.wheel) && !(typeof Progress !== 'undefined' && Progress.celebrating && Progress.celebrating())) p0.t += dt;
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
  // "QUEST COMPLETE!" / "NEW PLACE!": a note slides in under the top-right buttons with a burst of sparkles
  function drawPop(fb, t) {
    const p = Q.pops[0];
    if (!p || p.t < 0 || (typeof Progress !== 'undefined' && Progress.celebrating && Progress.celebrating())) return;
    const C = UI.C, hx = U.hex, kin = U.ease.outBack(Math.min(1, p.t / 0.35)), kout = Math.min(1, (p.life - p.t) / 0.4);
    if (kout <= 0) return;
    const head = p.unlock ? 'NEW PLACE!' : /^Quest complete: /.test(p.text) ? 'QUEST COMPLETE!' : p.reward ? 'REWARD!' : 'DONE!';
    const title = p.text.replace(/^Quest complete: /, '');
    const sub = p.reward ? 'Reward: ' + p.reward.label : p.sub ? p.sub + '  ·  open the map!' : '';
    const maxW = Math.min(fb.w - 12, 230), w = Math.min(maxW, Math.max(Font.measure(title, 'body') + 18, sub ? Font.measure(sub, 'small') + 18 : 0, Font.measure(head, 'small') + 30)), h = sub ? 32 : 22;
    const x = Math.round(fb.w - 6 - w + (1 - kin) * (w + 16) + (1 - kout) * 24), y = 40;
    if (!p.fired && p.t > 0.25) { p.fired = 1; UI.burst(x + w / 2, y + h / 2, 16, { speed: 65, c: C.goldL }); UI.pop(x + w / 2, y + h / 2, 20); }
    UI.plate(fb, x, y, w, h, { r: 4, fill: C.navy, a: 0.9 * kout });
    UI.rect(fb, x + 2, y + 2, 2, h - 4, p.unlock ? C.cyan : C.gold);
    UI.chip(fb, x + 8, y - 5, head, { bg: p.unlock ? hx('#2a86d8') : hx('#e8a020'), fg: p.unlock ? 0xffffffff : C.ink, h: 9, pad: 8 });
    Font.draw(fb, title, x + 9, y + 7, 0xffffffff, { font: 'body', shadow: C.ink, clip: { x0: x, y0: y, x1: x + w - 4, y1: y + h } });
    if (sub) Font.draw(fb, sub, x + 9, y + 21, hx('#ffe08a'), { font: 'small', shadow: C.ink, clip: { x0: x, y0: y, x1: x + w - 4, y1: y + h } });
    // a shine runs over it once
    const ph = (p.t - 0.35) / 0.7;
    if (ph > 0 && ph < 1) { const gx = x + Math.round(ph * (w + 20)) - 10; for (let yy = y + 1; yy < y + h - 1; yy++) { const xx = Math.round(gx - (yy - y) * 0.5); if (xx > x + 1 && xx < x + w - 2) { UI.blend(fb, xx, yy, 0xffffffff, 0.35); UI.blend(fb, xx + 1, yy, 0xffffffff, 0.2); } } }
  }
  return { BIRCH, stamps, checkPhoto, checkBirch, checkUnlocks, tick, onStart, unseen, seen, drawPop, Q };
})();
