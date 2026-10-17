/* ------------------------------------------------------------------
   Social — Pokémon reacting to Mudkip and to each other.
   · belly flops startle everyone nearby (hops, shocks, grumbles),
     bumps and tackles knock Pokémon back, Growl turns every head
     toward the camera, Ice Beam frosts a Pokémon for a moment, Bubble
     makes them chase and pop bubbles, curious ones copy Mudkip's jumps
   · neighbours greet each other, chat, squabble and play
   · curious Pokémon wander up to the camera and peer into the lens
   · Wailmer is a giant bouncy ball: land on it and you bounce sky-high;
     swim into it and it swallows Mudkip, puffs up and spouts it out
     spinning into the sky
------------------------------------------------------------------- */
const Social = (() => {
  const { clamp, rnd, pick, lerp } = U;
  const { wait } = Mons;
  const S = { pairT: 3, camT: 12, wailCool: 0, bounceCool: 0 };
  const CRY = {
    spheal: 'Spheal!', sealeo: 'Sea-leo!', walrein: 'HMPH.', corphish: '*snip*', luvdisc: '{heart}', wingull: 'Gull!', pelipper: 'Peli!', wailmer: 'Wai!',
    zigzagoon: 'Zig!', plusle: 'Pla!', minun: 'Mi!', ludicolo: 'Colo!', lotad: 'Lo!', shroomish: 'Shroo', slakoth: '...', seedot: '...', surskit: 'Skit!',
    chatot: 'Squawk!', swablu: 'Swa~', altaria: '{note}', taillow: 'Tail!', bagon: 'Bagon!', solrock: '...', lunatone: '...', trapinch: 'Chomp', corsola: 'Cor!',
  };
  const cry = (m) => CRY[m.kind] || ((DexData.S[m.dex] ? DexData.S[m.dex].name : m.kind) + '!');
  const say = (m, text, life = 1.6) => { if (typeof Talk !== 'undefined') Talk.bubble(() => m.headPt(), text, { life, who: m }); };
  const free = (m, p = 2) => m.alive && m.visible && !m.sleeping && !m.busy(p) && !m.layer && m.hideK < 0.3;
  const onLand = (m) => m.mode === 'land' && (m.air || 0) <= 0;

  /* ---------- reactions to Mudkip ---------- */
  function startle(m, mk, d) {
    if (!m.alive || m.layer) return;
    if (m.sleeping) { m.wake(); return; }
    const k = clamp(1 - d / 120, 0.2, 1);
    if (onLand(m) && !m.busy(4)) { m.vair = 120 + 120 * k; m.air = Math.max(m.air, 0.5); }
    if (m.persona === 'shy' && !m.busy(4)) { m.doTask(m.flee(mk), 4); return; }
    if (m.persona === 'grumpy') { m.annoy += 0.3; m.emote('anger', 1); if (Math.random() < 0.4) say(m, pick(['Hey!', 'QUIET!', 'Grr...'])); return; }
    m.emote(Math.random() < 0.6 ? 'shock' : 'sweat', 0.9);
    if (m.mode === 'swim' && !m.busy(3)) { m.fx = m.x + Math.sign(m.x - mk.x || 1) * 60; }
    if (Math.random() < 0.25) say(m, pick(['Whoa!', cry(m), 'Earthquake?!']));
  }
  function bumped(m, mk, d, hard = false) {
    if (m.sleeping) m.wake();
    // species gags
    if (m.kind === 'spheal' && m.rollTo && !m.busy(4)) { m.doTask(bowled(m, d, hard ? 1 : 0.6), 4); return; }
    if (m.kind === 'corphish' && !m.busy(5)) { pinch(m, mk, d); return; }
    if (m.mode === 'land' || m.mode === 'rooted') {
      if (!m.rooted && m.mode === 'land') { m.x = clamp(m.x + d * (hard ? 14 : 8), 30, World.W - 30); if (!m.busy(4)) { m.vair = hard ? 180 : 130; m.air = Math.max(m.air, 0.5); } }
    } else if (m.mode === 'swim') m.x += d * 10;
    if (m.persona === 'grumpy') { m.annoy += hard ? 0.5 : 0.3; m.emote('anger', 1.2); say(m, pick(['OI!', 'Watch it!', 'Grrr!'])); if (m.annoy > 0.7 && m.attackCam && !m.busy(5)) m.doTask(m.attackCam(mk), 5); }
    else if (m.persona === 'shy') { m.emote('sweat', 1); if (!m.busy(4)) m.doTask(m.flee(mk), 4); }
    else { m.emote(hard ? 'swirl' : 'shock', 1); if (Math.random() < 0.5) say(m, pick(['Ow!', cry(m), 'Hey, fun!'])); }
    if (m.onPoke && hard && Math.random() < 0.3) m.onPoke(mk);
  }
  function growled(m, mk, d) {
    if (m.sleeping) { m.wake(); return; }
    if (m.persona === 'shy' && Math.random() < 0.6) { m.emote('sweat', 1); if (!m.busy(4)) m.doTask(m.flee(mk), 4); return; }
    if (m.persona === 'grumpy') { m.emote('anger', 1); m.annoy += 0.2; }
    else m.emote('shock', 0.9);
    if (!m.busy(4)) m.doTask(lookAtLens(m, 2.4), 3);
  }
  // everyone turns to the camera (a great photo!)
  function* lookAtLens(m, T) {
    let e = 0;
    while (e < T) { const dt = yield; e += dt; m.turn(Math.PI / 2, dt, 6); m.setAct(m.act.id === 'idle' ? 'notice' : m.act.id, 0.8); m.o.eyes = 'open'; }
  }
  function frozen(m, mk) {
    if (m.sleeping) m.wake();
    m.emote('sweat', 1.4);
    say(m, pick(['B-b-brr!', 'Cold!!', '*shiver*']));
    m.doTask(frost(m), 6);
  }
  function* frost(m) {
    let e = 0; const x0 = m.x;
    while (e < 2.4) { const dt = yield; e += dt; m.tint = 0xffffe8c0; m.tintK = 0.55 * Math.min(1, (2.4 - e) / 0.5 + 0.2); m.x = x0 + Math.sin(e * 60) * 0.6; m.setAct(m.act.id, 0.5); if (Math.random() < dt * 8) FX.add({ type: 'spark', x: m.x + rnd(-10, 10), y: m.y - rnd(4, 24), size: 1, life: 0.4, c: 0xffffffff, c2: U.hex('#bfefff'), layer: 3 }); }
    m.x = x0; m.tint = 0; m.tintK = 0;
    FX.poof(m.x, m.y - 10, 0xffffffff, U.hex('#cff4ff'), 8, 5);
    m.emote('anger', 0.8);
  }
  function bubbleFun(m, mk, tx, ty) {
    if (!free(m, 3)) return;
    if (m.persona === 'shy') return;
    m.emote(Math.random() < 0.5 ? 'heart' : 'note', 1);
    if (onLand(m) && m.walkTo) m.doTask(chaseBubbles(m, tx), 2);
  }
  function* chaseBubbles(m, tx) {
    yield* m.walkTo(clamp(tx + rnd(-20, 20), m.home - m.range, m.home + m.range), (m.speed || 50) * 1.3);
    for (let i = 0; i < 2; i++) yield* m.hop(190);
    m.setAct(m.act.id, 0.7);
  }
  function mudkipJumped(mk) {
    // curious and show-off Pokémon sometimes copy Mudkip's jump
    for (const m of Mons.all) {
      if (m === mk || !free(m, 2) || !onLand(m) || m.persona === 'shy' || m.persona === 'grumpy') continue;
      if (Math.hypot(m.x - mk.x, m.y - mk.y) > 110 || Math.random() > 0.3) continue;
      setTimeout(() => { if (m.alive && onLand(m) && !m.busy(3)) { m.vair = 170 + Math.random() * 60; m.air = Math.max(m.air, 0.5); m.emote('note', 0.7); } }, 150 + Math.random() * 250);
    }
  }
  function mudkipLanded(mk, v) {
    if (v < 420) return;
    for (const m of Mons.all) if (m !== mk && m.alive && !m.layer && Math.hypot(m.x - mk.x, m.y - mk.y) < 80 && Math.random() < 0.5) m.emote('shock', 0.7);
  }

  // Spheal bowling: it rolls away like a ball and knocks over any Spheal in the way
  function* bowled(m, d, k) {
    m.emote('shock', 0.8); say(m, pick(['Spheeeal!', 'Wheee!', 'Sphe-e-e!']));
    const x0 = m.x, tx = clamp(m.x + d * (90 + 120 * k), (m.minX ?? m.home - m.range) + 10, (m.maxX ?? m.home + m.range) - 10);
    const hit = new Set([m]);
    const sub = m.rollTo(tx, 170);
    for (let g = 0; g < 600; g++) {
      const dt = yield; if (sub.next(dt).done) break;
      for (const o of Mons.all) if (o.kind === 'spheal' && !hit.has(o) && Math.abs(o.x - m.x) < 14 && o.rollTo && !o.busy(4)) { hit.add(o); FX.bonk((o.x + m.x) / 2, m.y - 10, 7); Game.sfx('bonk', o.x, 0.7); o.doTask(bowled(o, d, k * 0.7), 4); }
    }
    m.emote('swirl', 1.2);
    if (Math.abs(m.x - x0) > 60) Save.discover('spheal.bowling');
    yield* wait(0.8);
    m.emote(pick(['note', 'heart']), 1);
  }
  // Corphish pinches Mudkip's tail
  function pinch(m, mk, d) {
    m.emote('anger', 0.6);
    FX.bonk(mk.x - d * 8, mk.y - 6, 6); Game.sfx('snip', m.x, 1); Game.sfx('crab', m.x, 0.6);
    if (mk.mode === 'land') { mk.vair = 340; mk.air = Math.max(mk.air, 0.5); mk.vx = -d * 120; mk.jumping = false; mk.flipped = true; mk.flipT = 0.5; mk.flipLen = 0.5; mk.flipSpins = 1; mk.flipDir = -d; }
    if (typeof Talk !== 'undefined') Talk.bubble(() => mk.headPt(), 'YOWCH!!', { life: 1.4, who: mk });
    setTimeout(() => say(m, pick(['Snip snip! Ha!', 'Gotcha!', '*snip*'])), 500);
    Save.discover('corphish.pinch');
  }
  // landing on a Pokémon's head: everyone is a little bit bouncy
  function stompCheck(mk, dt) {
    S.stompCool = Math.max(0, (S.stompCool || 0) - dt);
    if (!mk || S.stompCool > 0) return;
    const falling = (mk.mode === 'fall' && mk.vy > 60) || (mk.mode === 'land' && mk.air > 6 && mk.vair < -60);
    if (!falling) return;
    for (const m of Mons.all) {
      if (m === mk || !m.alive || !m.visible || !m.spr || m.layer || m.hideK > 0.5 || m.mode === 'swim' || m.mode === 'fly' || m.kind === 'wailmer') continue;
      const b = m.bounds(), w = (b.x1 - b.x0) * 0.36;
      if (Math.abs(mk.x - (b.x0 + b.x1) / 2) > w || mk.y < b.y0 - 3 || mk.y > b.y0 + 9) continue;
      S.stompCool = 0.45;
      const up = m.kind === 'walrein' ? 380 : 300;
      if (mk.mode === 'fall') mk.vy = -up; else { mk.vair = up; mk.air = Math.max(mk.air, 1); }
      mk.pound = false; mk.hang = 0; mk.jumping = false;
      Game.sfx('boing', m.x, 0.8); Game.hitStop(0.045); Game.kick(0, 0.9); Game.buzz(12); FX.add({ type: 'ring', x: mk.x, y: b.y0, r0: 3, r1: 14, flat: 0.35, life: 0.3, c: 0xffffffff, layer: 3 });
      if (m.sleeping) m.wake();
      if (m.kind === 'walrein') { m.emote('anger', 1.2); say(m, 'HRRAAH-CHOO!'); Game.sfx('freeze', m.x, 0.9); for (let i = 0; i < 18; i++) FX.add({ type: 'spark', x: m.x + (Math.random() - 0.5) * 30, y: b.y0 + (Math.random() - 0.5) * 10, size: 1 + (Math.random() * 2 | 0), life: 0.5, c: 0xffffffff, c2: U.hex('#bfefff'), layer: 3 }); mk.vx = (mk.x < m.x ? -1 : 1) * 160; mk.tint = 0xffffe8c0; mk.tintK = 0.5; setTimeout(() => { mk.tintK = 0; }, 1500); }
      else if (m.persona === 'grumpy') { m.annoy += 0.4; m.emote('anger', 1); say(m, pick(['GET OFF!', 'Hey!!'])); }
      else { m.emote(pick(['shock', 'swirl', 'note']), 1); if (Math.random() < 0.5) say(m, pick(['Oof!', cry(m), 'Hey, a hat!'])); if (m.mode === 'land' && !m.busy(4)) { m.o.squash = 0.2; } }
      Save.discover('stomp.' + m.kind);
      return;
    }
  }

  /* ---------- neighbours ---------- */
  const GREET = [
    ['note', 'note'], ['heart', 'heart'], ['bulb', 'sparkle'], ['anger', 'sweat'], ['note', 'star'], ['shock', 'swirl'],
  ];
  function pairUp() {
    const ms = Mons.all.filter((m) => m !== Game.mudkip && free(m, 1) && !m.rooted && (m.mode === 'land' || m.mode === 'swim') && m.visible);
    for (let tries = 0; tries < 6 && ms.length > 1; tries++) {
      const a = pick(ms);
      const near = ms.filter((b) => b !== a && Math.hypot(b.x - a.x, b.y - a.y) < 110 && b.mode === a.mode);
      if (!near.length) continue;
      const b = pick(near);
      a.doTask(exchange(a, b, true), 1); b.doTask(exchange(b, a, false), 1);
      return true;
    }
    return false;
  }
  function* exchange(m, other, first) {
    const g = pick(GREET);
    let e = 0;
    while (e < 0.6) { const dt = yield; e += dt; m.turn(m.face(other.x > m.x ? 1 : -1, false), dt, 6); }
    if (!first) yield* wait(0.7);
    m.emote(first ? g[0] : g[1], 1.1);
    if (Math.random() < 0.45) say(m, first ? cry(m) : pick([cry(m), '!', '?', cry(m) + '!']), 1.3);
    if (m.mode === 'land' && Math.random() < 0.5) yield* m.hop(150 + Math.random() * 60);
    // squabbles: a grumpy one might chase the other off
    if (first && m.persona === 'grumpy' && Math.random() < 0.4 && m.mode === 'land' && m.walkTo) { m.emote('anger', 1); yield* m.walkTo(clamp(other.x, m.home - m.range, m.home + m.range), (m.speed || 40) * 1.4); }
    m.setAct(m.act.id, 0.6);
    yield* wait(rnd(0.6, 1.4));
  }
  // curious Pokémon walk up to the camera and peer into the lens
  function camVisit() {
    const mk = Game.mudkip;
    const ms = Mons.all.filter((m) => m !== mk && free(m, 1) && onLand(m) && m.persona === 'curious' && Math.abs(m.x - (Game.cam.x + Game.VW / 2)) < Game.VW * 0.4 && !m.plat);
    if (!ms.length) return false;
    const m = pick(ms);
    m.doTask(peekLens(m), 2);
    return true;
  }
  function* peekLens(m) {
    const zd0 = m.zd || 0, band = (Game.area.band || 12) * 0.5;
    let e = 0;
    while (e < 0.5) { const dt = yield; e += dt; m.turn(Math.PI / 2, dt, 5); }
    // step toward the camera (the front of the ground strip)
    e = 0;
    while (e < 1) { const dt = yield; e += dt; m.zd = lerp(zd0, band, U.ease.inOut(e)); m.moving = 20; m.setAct(m.act.id, 0.4); }
    m.emote(pick(['sparkle', 'heart', 'bulb']), 1.2);
    e = 0;
    while (e < 2.4) { const dt = yield; e += dt; m.setAct('curious', 1); m.o.eyes = e % 1.1 < 0.1 ? 'blink' : 'open'; m.headTilt = Math.sin(e * 3) * 0.2; }
    e = 0;
    while (e < 1) { const dt = yield; e += dt; m.zd = lerp(band, zd0, U.ease.inOut(e)); m.moving = 20; }
    m.zd = zd0;
  }

  /* ---------- Wailmer: the giant bouncy ball ---------- */
  function wailmerCheck(mk, dt) {
    S.wailCool = Math.max(0, S.wailCool - dt); S.bounceCool = Math.max(0, S.bounceCool - dt);
    if (!mk || mk.mode === 'toy') return;
    for (const w of Mons.all) {
      if (w.kind !== 'wailmer' || !w.alive || !w.visible || !w.spr) continue;
      const [cx, cy] = w.center(), R = Math.max(10, w.width() * 0.42);
      // landing on top: BOING (a few times, then Wailmer gets bored and dives)
      if (mk.mode === 'fall' && mk.vy > 40 && S.bounceCool <= 0 && Math.abs(mk.x - cx) < R && mk.y > cy - R - 6 && mk.y < cy) {
        S.bounceN = (Game.t - (S.lastBounce || -9) < 3) ? (S.bounceN || 0) + 1 : 1; S.lastBounce = Game.t;
        if (S.bounceN > 4) { S.bounceCool = 3; w.y += 30; say(w, 'Enough! Hee hee!'); return; }
        S.bounceCool = 0.3;
        mk.vy = -470; mk.jumping = false; mk.flipped = false; mk.flipT = 0.5; mk.flipLen = 0.5; mk.flipDir = mk.dirX();
        if (!w.busy(6)) w.doTask((function* () { let e = 0; while (e < 0.45) { const dt = yield; e += dt; w.o.puff = 1 - e; w.o.eyes = 'happy'; w.o.mouth = 1; w.setAct('bounce', 1); } })(), 5);
        Game.sfx('boing', w.x, 1); Game.shake(1.2);
        FX.add({ type: 'ring', x: cx, y: cy - R, r0: 4, r1: 20, flat: 0.35, life: 0.35, c: 0xffffffff, layer: 3 });
        if (Math.random() < 0.5) say(w, pick(['Wai!', 'BOING!', 'Hee hee!']));
        Save.discover('wailmer.bounce');
        return;
      }
      // swimming into its mouth: gulp!
      if (mk.mode === 'swim' && S.wailCool <= 0 && !w.busy(6) && Math.hypot(mk.x - cx, (mk.y - 8) - cy) < R + 6) {
        S.wailCool = 14;
        w.doTask(gulp(w, mk), 7);
        return;
      }
    }
  }
  function* gulp(w, mk) {
    mk.wakeUp(); mk.target = null;
    let inside = true;
    mk.doTask((function* () {
      mk.mode = 'toy'; mk.visible = false; mk.rot = 0;
      while (inside) { yield; const [cx, cy] = w.center(); mk.x = cx; mk.y = cy + 6; }
    })(), 9);
    Game.sfx('gulp', w.x, 1);
    FX.bubbles(w.x, w.y - 10, 10, WorldRender.surfaceAt(w.x, Game.t));
    let e = 0;
    // "mmmf?" — puffed up with a Mudkip inside
    while (e < 1.8) { const dt = yield; e += dt; w.o.puff = 0.9 + Math.sin(e * 14) * 0.15; w.o.mouth = 0; w.o.eyes = e < 0.8 ? 'open' : 'happy'; w.setAct('bounce', 0.8); if (e > 0.5 && e - dt <= 0.5) { w.emote('shock', 1); say(w, 'Mmmf?!'); } }
    // swim up to the surface
    const s0 = WorldRender.surfaceAt(w.x, Game.t);
    e = 0; const y0 = w.y;
    while (e < 0.8) { const dt = yield; e += dt; w.y = lerp(y0, s0 + 6, U.ease.inOut(Math.min(1, e / 0.8))); w.o.puff = 1; w.o.mouth = 0; }
    // PFFFT — spout Mudkip into the sky, spinning
    inside = false;
    const [bx, by] = w.at('top');
    mk.visible = true; mk.mode = 'fall'; mk.task && (mk.task.done = true);
    mk.x = bx; mk.y = by - 6; mk.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(90, 130); mk.vy = -560; mk.jumping = false; mk.pound = false;
    S.bounceCool = 2.5;
    mk.flipT = 1.2; mk.flipLen = 1.2; mk.flipSpins = 3; mk.flipDir = Math.random() < 0.5 ? 1 : -1; mk.flipped = true; mk.dizzy = 2.2;
    Game.sfx('spout', w.x, 1); Game.sfx('whoosh', w.x, 0.8); Game.shake(2);
    for (let i = 0; i < 26; i++) FX.add({ type: 'drop', x: bx + rnd(-4, 4), y: by - 2, vx: rnd(-50, 50), vy: -rnd(120, 300), g: 380, life: 1.4, c: 0xffffffff, c2: U.hex('#bfefff'), size: 2, floor: s0 + 2, layer: 3 });
    e = 0;
    while (e < 1.6) { const dt = yield; e += dt; w.o.puff = Math.max(0.2, 1 - e); w.o.blow = Math.max(0, 1 - e / 1.2); w.o.eyes = 'happy'; w.o.mouth = 1; w.setAct('spout', 1); }
    say(w, pick(['Wai-wai-wai!', 'Hee hee hee!', 'Again? AGAIN?']), 2);
    w.emote('note', 1.2);
    setTimeout(() => { if (Game.mudkip === mk && typeof Talk !== 'undefined') Talk.bubble(() => mk.headPt(), pick(['...again!', 'Mud... kip...', '@_@']), { life: 1.8, who: mk }); }, 1800);
    Save.discover('wailmer.gulp');
  }

  /* ---------- personal space: nobody stands inside anybody else ---------- */
  const kin = (a, b) => a.parent === b || b.parent === a || (a.parent && a.parent === b.parent);
  // (road punks, champions, territorial bosses and legends keep their marks: their scripts rely on them)
  const special = (m) => m.terr || m.rooted || m.noSocial || m.punk || m.champ || String(m.kind).startsWith('punk-') || (DexData.S[m.dex] && DexData.S[m.dex].legendary);
  const walker = (m) => m.alive && m.visible && !m.layer && m.mode === 'land' && (m.air || 0) <= 0 && m.walkTo && !m.sleeping && m.hideK < 0.3 && m.spr && !special(m) && m.width() < 70;
  function* shuffle(m, tx) {
    yield* m.walkTo(tx, Math.max(28, (m.speed || 45) * 0.8), { min: m.minX, max: m.maxX });
    let e = 0; const T = rnd(0.3, 0.9);
    while (e < T) { const dt = yield; e += dt; }
  }
  // Pokémon standing on top of each other drift apart (the less busy one steps aside)
  const grounded = (m) => m !== Game.mudkip && m.alive && m.visible && !m.layer && m.mode === 'land' && m.hideK < 0.3;
  const canShuffle = (m) => walker(m) && !m.busy(1) && !m.moving;
  function spread() {
    // (big Pokémon and special ones hold their ground; the small one beside them moves)
    const L = Mons.all.filter(grounded).sort((a, b) => a.x - b.x);
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], dx = b.x - a.x, need = (a.width() + b.width()) * 0.3 + 4;
        if (dx > need) break;
        if (Math.abs((a.zd || 0) - (b.zd || 0)) > 6 || Math.abs(a.y - b.y) > 18 || kin(a, b)) continue;
        const ca = canShuffle(a), cb = canShuffle(b);
        const m = ca && cb ? (a.width() <= b.width() ? a : b) : ca ? a : cb ? b : null;
        if (!m || (m.sepT || 0) > Game.t) continue;
        m.sepT = Game.t + rnd(2.5, 4);
        const away = m === a ? -1 : 1, lo = m.minX ?? m.home - m.range * 1.5, hi = m.maxX ?? m.home + m.range * 1.5;
        let tx = m.x + away * (need - dx + rnd(8, 22));
        if (tx < lo || tx > hi || World.isWet(tx, 16)) tx = m.x - away * (need + rnd(8, 22)); // boxed in: go round the other side
        tx = clamp(tx, lo, hi);
        if (World.isWet(tx, 16) || Math.abs(World.groundAt(tx) - World.groundAt(m.x)) > 20) continue;
        m.doTask(shuffle(m, tx), 1);
      }
    }
  }
  // swimmers drift apart softly when they bunch up (no two Wailmer in the same spot)
  function waterSpace(dt) {
    const L = Mons.all.filter((m) => m !== Game.mudkip && m.alive && m.visible && !m.layer && m.mode === 'swim' && !special(m) && m.spr && !m.busy(5));
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, need = (a.width() + b.width()) * 0.32;
      if (Math.abs(dx) > need || Math.abs(dy) > need) continue;
      const d = Math.hypot(dx, dy); if (d >= need) continue;
      const k = (1 - d / need) * 26 * dt, ux = d > 0.01 ? dx / d : Math.random() - 0.5, uy = d > 0.01 ? dy / d : 0;
      const wa = b.width() / (a.width() + b.width()), wb = 1 - wa; // the smaller one gives way more
      a.x -= ux * k * wa * 2; a.y -= uy * k * wa; b.x += ux * k * wb * 2; b.y += uy * k * wb;
    }
  }
  // on arrival in an area: Pokémon that spawned on top of each other are nudged apart at once
  function settle() {
    const movable = (m) => !special(m) && !m.parent && m.width() < 70;
    const L = Mons.all.filter((m) => m !== Game.mudkip && m.alive && !m.layer && m.mode === 'land').sort((a, b) => a.x - b.x);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i], b = L[i + 1], need = (a.width() + b.width()) * 0.32 + 4, dx = b.x - a.x;
        if (dx >= need || Math.abs((a.zd || 0) - (b.zd || 0)) > 6 || kin(a, b) || Math.abs(World.groundAt(a.x) - World.groundAt(b.x)) > 18) continue;
        const ma = movable(a), mb = movable(b); if (!ma && !mb) continue;
        const push = (need - dx) / (ma && mb ? 2 : 1), bh = b.maxX ?? b.home + b.range * 1.5, al = a.minX ?? a.home - a.range * 1.5;
        if ((mb && World.isWet(b.x + push, 16)) || (ma && World.isWet(a.x - push, 16))) continue;
        if (mb) b.x = Math.min(bh, b.x + push);
        if (ma) a.x = Math.max(al, a.x - push);
      }
      L.sort((a, b) => a.x - b.x);
    }
  }
  U.on && U.on('area', () => { try { settle(); } catch (e) { console.error(e); } });
  // Mudkip walking right into a Pokémon: it reacts like a creature would — hops back, steps aside,
  // turns to look, or (grumpy ones) stands its ground and glares
  // (in this 2.5D lane "stepping aside" means stepping back in depth, so Mudkip passes in front)
  function* makeWay(m, mk, d, scared) {
    m.emote(scared ? 'shock' : pick(['shock', 'note', 'bulb']), 0.8);
    if (onLand(m)) { m.vair = scared ? 170 : 110; m.air = Math.max(m.air, 0.5); }
    const zd0 = m.wayZd ?? (m.zd || 0), back = zd0 - Math.max(4, (Game.area.band || 12) * 0.5);
    m.wayZd = zd0;
    const lo = m.minX ?? m.home - m.range * 1.5, hi = m.maxX ?? m.home + m.range * 1.5;
    let e = 0;
    const dry = !World.isWet(m.x + d * 14, 16);
    while (e < 0.35) { const dt = yield; e += dt; m.zd = lerp(zd0, back, U.ease.inOut(Math.min(1, e / 0.35))); if (dry) m.x = clamp(m.x + d * 30 * dt, lo, hi); m.moving = 30; m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 8); }
    // watch it go by
    e = 0;
    while (e < 3 && Math.abs(mk.x - m.x) < m.width() * 0.5 + 24) { const dt = yield; e += dt; m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 6); m.setAct(m.act.id === 'idle' ? 'notice' : m.act.id, 0.35); }
    e = 0; const T = rnd(0.4, 1);
    while (e < T) { const dt = yield; e += dt; m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 6); }
    // and back into its place in the lane
    e = 0;
    while (e < 0.45) { const dt = yield; e += dt; m.zd = lerp(back, zd0, U.ease.inOut(Math.min(1, e / 0.45))); m.moving = 20; }
    m.zd = zd0; m.wayZd = undefined;
  }
  function personalSpace(mk, dt) {
    // anyone interrupted while stepping aside drifts back to its place in the lane
    for (const m of Mons.all) if (m.wayZd !== undefined && !(m.task && m.task.way && !m.task.done)) { m.zd = U.approach(m.zd || 0, m.wayZd, dt * 12); if (m.zd === m.wayZd) m.wayZd = undefined; }
    if (!mk || mk.mode !== 'land' || !mk.moving || mk.air > 4 || mk.task && !mk.task.done) return;
    const dir = Math.sign(mk.vx || 0); if (!dir) return;
    for (const m of Mons.all) {
      if (m === mk || !walker(m) || m.busy(2) || (m.wayT || 0) > Game.t) continue;
      const dx = m.x - mk.x;
      if (dx * dir < -4 || Math.abs(dx) > m.width() * 0.32 + 8 || Math.abs((m.y - m.zd) - mk.y) > 14) continue;
      m.wayT = Game.t + rnd(3, 5);
      if (m.persona === 'shy') { m.doTask(m.flee(mk), 4); continue; }
      if (m.persona === 'grumpy') { m.emote('anger', 0.9); m.annoy += 0.12; m.doTask(glare(m, mk), 2); continue; }
      if (m.doTask(makeWay(m, mk, dir, Math.abs(mk.vx) > 120), 2)) m.task.way = true;
    }
  }
  function* glare(m, mk) { let e = 0; while (e < 1.4) { const dt = yield; e += dt; m.turn(m.face(mk.x > m.x ? 1 : -1, false), dt, 8); m.setAct(m.act.id, 0.4); } }
  // idle Pokémon glance over at Mudkip when it comes close (and now and then at the camera)
  function* glance(m, mk) {
    let e = 0; const T = rnd(1.2, 2.4), cam = Math.random() < 0.3;
    while (e < T && m.alive) {
      const dt = yield; e += dt;
      const side = mk.x > m.x ? 1 : -1;
      m.turn(cam ? Math.PI / 2 + side * -0.45 : m.face(side, m.mode !== 'land'), dt, 4);
      if (m.mode === 'swim' || m.mode === 'fly') { m.vx = (m.vx || 0) * Math.exp(-dt * 3); m.vy = (m.vy || 0) * Math.exp(-dt * 3); }
      m.setAct(m.act.id === 'idle' ? 'notice' : m.act.id, cam ? 0.55 : 0.3);
    }
  }
  function glances(mk) {
    if (!mk) return;
    for (const m of Mons.all) {
      if (m === mk || !m.alive || !m.visible || m.layer || m.sleeping || m.hideK > 0.3 || m.busy(1) || m.moving || special(m) || m.mode === 'perch' || m.mode === 'fly') continue;
      if ((m.glanceT || 0) > Game.t) continue;
      const d = Math.hypot(m.x - mk.x, (m.y - mk.y) * 1.3);
      if (d > 90 || d < 12) continue;
      m.glanceT = Game.t + rnd(7, 14);
      if (Math.random() < 0.6) m.doTask(glance(m, mk), 1);
    }
  }

  function update(dt, t) {
    if (Game.mode !== 'explore' && Game.mode !== 'camera') return;
    const mk = Game.mudkip;
    wailmerCheck(mk, dt);
    stompCheck(mk, dt);
    // (not while a minigame, card battle or conversation is running: those place everyone themselves)
    const scripted = (typeof Arcade !== 'undefined' && Arcade.live) || (typeof Cards !== 'undefined' && Cards.live) || (typeof Talk !== 'undefined' && Talk.busy());
    if (!scripted) {
      personalSpace(mk, dt);
      waterSpace(dt);
      S.spreadT = (S.spreadT || 0) - dt;
      if (S.spreadT <= 0) { S.spreadT = 0.5; spread(); glances(mk); }
    }
    S.pairT -= dt; S.camT -= dt;
    if (S.pairT <= 0) { S.pairT = pairUp() ? rnd(4, 8) : 2; }
    if (S.camT <= 0) { S.camT = camVisit() ? rnd(20, 35) : 6; }
  }
  return { update, startle, bumped, growled, frozen, bubbleFun, mudkipJumped, mudkipLanded, lookAtLens, S };
})();
