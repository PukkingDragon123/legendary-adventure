/* ------------------------------------------------------------------
   Rotom — the Rotom Dex companion that flies around Mudkip. A small
   toon-shaded red device (lightning antenna, big eyes on a black
   bridge, cyan face with a toothy grin, floating hands, pointed tail)
   drawn crisp on the UI canvas. It bobs, orbits, looks at Pokémon,
   peeks at unregistered species (marking them "seen" in the Dex),
   points at the tracked quest, and chatters in speech bubbles.
   Poke it (tap / click, or O) for jokes and hints. Reactions: Flash
   ("OUCH! MY EYES!" + spin), Water Gun (soaked), Growl (startled),
   Rain Dance / rain (sulks under a leaf), Sunny Day, new Pokédex
   entries and level-ups (cheers). It zips out of frame in camera mode
   and hides inside the device while the Dex is open.
   Hooks in by wrapping Talk.update / drawBubbles / down / key.
------------------------------------------------------------------- */
const Rotom = (() => {
  const { clamp, lerp, hex, mix, pick, rnd } = U;
  const R = { x: 0, y: 0, vx: 0, vy: 0, on: false, st: 'follow', stT: 0, yaw: 0, spin: 0, lx: 0, ly: 0, mood: 'norm', moodT: 0, blinkT: 0, nextBlink: 2, talkT: 0,
    chatT: 12, pokes: [], wet: 0, drips: [], sparks: [], sulk: 0, tgt: null, hop: 0, peeked: {}, cd: {}, seenN: -1, lv: null, rain: false, hide: 0, box: null, pointAt: null, pointT: 40, orbitT: 25, outT: 0 };
  const C = { b: hex('#e03a3c'), l: hex('#ff7466'), ll: hex('#ffb6a6'), d: hex('#a41c2a'), dd: hex('#6c0f1e'), ink: hex('#2a0710'), scr: hex('#a7b3ef'), face: hex('#b2effe'), faceD: hex('#3692b8'), eye: hex('#0e0c1c'), mouth: hex('#2c0f30'), grey: hex('#b9c0cd'), greyD: hex('#737b90'), gold: hex('#ffd23a'), leaf: hex('#4ab860'), leafD: hex('#2a7a3a') };
  const cfg = () => Save.data.rotom || (Save.data.rotom = { off: false, chat: 1 });
  const nm = (k) => (DexData.S[k] ? DexData.S[k].name : k);

  /* ---------- voice ---------- */
  function voice(kind = 'chat', vol = 0.5) {
    if (!Sound.on || !Sound.ctx || !Sound.ctx()) return;
    try {
      const ac = Sound.ctx(), g = ac.createGain(); g.gain.value = vol * 0.12; g.connect(Sound.sfxBus());
      const t0 = ac.currentTime + 0.01;
      const tone = (f0, f1, t, d, type = 'square') => { const o = ac.createOscillator(), e = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + d); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(e).connect(g); o.start(t); o.stop(t + d + 0.02); };
      if (kind === 'ouch') { tone(1800, 300, t0, 0.35, 'sawtooth'); tone(900, 200, t0 + 0.05, 0.3); }
      else if (kind === 'happy') [880, 1175, 1480, 1760].forEach((f, i) => tone(f, f * 1.05, t0 + i * 0.06, 0.07));
      else if (kind === 'sad') { tone(700, 350, t0, 0.3, 'triangle'); }
      else { const n = 3 + ((Math.random() * 3) | 0); for (let i = 0; i < n; i++) { const f = 900 + Math.random() * 900; tone(f, f * (Math.random() < 0.5 ? 1.3 : 0.8), t0 + i * 0.065, 0.045); } }
    } catch (e) { /* audio */ }
  }

  /* ---------- lines ---------- */
  const JOKES = [
    'Why did the Magnemite get a job? For the current-cy! Bzzt!',
    'I\'d tell you an Electric-type joke... but it\'s too shocking!',
    'Why was Spheal top of the class? It was on a roll!',
    'What does Corphish call its friends with? A shell phone! Like me!',
    'Why did Kecleon cross the road? Nobody knows. Nobody saw it.',
    'I asked Slakoth for a joke. Still waiting... zzz.',
    'Why can\'t Wailord keep secrets? It always spouts off!',
    'My battery is at 100%... of cuteness! Bzzt!',
    'What\'s Mudkip\'s favourite music? Anything on the right wave-length!',
    'Knock knock! Who\'s there? Rotom. Rotom who? Rotom-ato! ...Bzzt, sorry.',
  ];
  function hint() {
    const A = Game.areaId, miss = DexData.ORDER.filter((k) => !Save.data.seen[k] && (DexData.S[k].area || []).includes(A));
    const r = Math.random();
    if (typeof Progress !== 'undefined' && Progress.tracked && r < 0.35) { const q = Progress.tracked(); if (q) return 'Quest "' + q.title + '": ' + Progress.objective(q) + '!'; }
    if (miss.length && r < 0.75) { const k = pick(miss), b = Object.values(DexData.S[k].beh)[0]; return 'Not everyone here is registered! Hint: ' + (b ? b.hint : 'keep exploring!'); }
    const sec = (typeof Dex !== 'undefined' && Dex.SECRETS || []).filter((s) => !Save.found(s[0]));
    if (sec.length && r < 0.9) return 'Secret hint: ' + pick(sec)[2];
    return pick(['Hold the shutter to catch the perfect moment!', 'Growl makes Pokémon look at the camera!', 'Rare behaviours give more stars!', 'Scan (4) finds hidden things!']);
  }
  const AREA = { beach: 'Smell that sea breeze! Rotom\'s sensors say... salty!', forest: 'It rains a LOT here. Rotom is not a fan.', canopy: 'So high up! Don\'t look down. Rotom already did.', falls: 'Crystals everywhere! Rotom\'s reflection is SO cute.', volcano: 'Hot hot hot! Rotom\'s circuits are sweating!', shoal: 'Brrr! The cold drains Rotom\'s battery!', stage: 'Music! Rotom knows 3,000 ringtones!' };

  function say(text, life) {
    if (!text || typeof Talk === 'undefined') return;
    Talk.bubbles = Talk.bubbles.filter((b) => !b.rotom);
    Talk.bubble(() => [R.x, R.y - 14], text, { life: life || clamp(1.8 + text.length / 18, 2, 5) });
    const b = Talk.bubbles[Talk.bubbles.length - 1]; if (b) b.rotom = true;
    R.talkT = Math.min(2, 0.4 + text.length / 30); R.chatT = [60, 30, 16][cfg().chat ?? 1] * rnd(0.8, 1.4);
    voice('chat', 0.4);
  }
  const react = (st, dur, m, line, mdur) => { R.st = st; R.stT = dur; R.mood = m; R.moodT = mdur || dur; if (line) say(line); };

  /* ---------- per frame ---------- */
  function visible() { return !cfg().off && Game.mudkip && Game.area && (Game.mode === 'explore' || Game.mode === 'camera') && !(typeof Arcade !== 'undefined' && Arcade.live); }
  function update(dt) {
    const mk = Game.mudkip; if (!mk || !Game.area) return;
    const t = Game.rt;
    if (!R.on) { R.on = true; R.x = mk.x - 30; R.y = mk.y - 50; }
    if (Game.mode === 'dex') { R.hide = 1; R.x = mk.x; R.y = mk.y - 40; return; }
    if (R.hide && Game.mode === 'explore') { R.hide = 0; R.x = mk.x - mk.dirX() * 20; R.y = mk.headPt()[1] - 16; R.hop = 1; burst(6); }
    R.stT -= dt; R.moodT -= dt; R.talkT -= dt; R.wet = Math.max(0, R.wet - dt * 0.25); R.spin *= Math.exp(-dt * 2);
    if (R.moodT <= 0) R.mood = R.sulk > 0.5 ? 'sad' : 'norm';
    R.nextBlink -= dt; if (R.nextBlink <= 0) { R.blinkT = 0.13; R.nextBlink = rnd(1.8, 4.5); } R.blinkT -= dt;
    events(dt, mk);
    const d = mk.dirX(), [hx, hy] = mk.headPt();
    let tx = mk.x - d * 22, ty = hy - 16 + Math.sin(t * 2.4) * 2.5, look = null;
    // underwater: wait at the surface
    const surf = World.waterAt(mk.x) !== null ? WorldRender.surfaceAt(mk.x, Game.t) : null;
    if (Game.mode === 'camera') { tx = Game.cam.x + Game.VW * 0.5; ty = Game.cam.y - 60; if (R.st !== 'duck') { R.st = 'duck'; if (!R.cd.duck || t - R.cd.duck > 40) { R.cd.duck = t; say('I\'ll stay out of your shot!', 1.2); } } }
    else {
      if (R.st === 'duck') R.st = 'follow';
      if (R.st === 'peek' && R.tgt && R.tgt.alive && R.stT > 0) { const [px, py] = R.tgt.headPt(); tx = px - Math.sign(px - mk.x || 1) * 16; ty = py - 12 + Math.sin(t * 5) * 1.5; look = [px, py]; }
      else if (R.st === 'point' && R.pointAt && R.stT > 0) { tx = mk.x + Math.sign(R.pointAt[0] - mk.x) * 34; ty = hy - 22; look = R.pointAt; }
      else if (R.st === 'orbit' && R.stT > 0) { const a = t * 3; tx = mk.x + Math.cos(a) * 28; ty = hy - 10 + Math.sin(a) * 14; }
      else if (R.st === 'startle' && R.stT > 0) { ty -= 22; }
      else if (R.stT <= 0 && ['peek', 'point', 'orbit', 'startle', 'ouch', 'soak', 'cheer', 'poke'].includes(R.st)) R.st = 'follow';
      if (R.sulk > 0.5) ty += 8;
      if (surf !== null && mk.inWater && hy > surf) { ty = Math.min(ty, surf - 14); if (!R.cd.sea || t - R.cd.sea > 90) { R.cd.sea = t; say('Rotom waits up here! Not waterproof!'); } }
      idle(dt, mk, t);
    }
    // spring follow
    const k = R.st === 'duck' ? 7 : 4.5;
    R.vx += ((tx - R.x) * k * k - R.vx * 2 * k) * dt; R.vy += ((ty - R.y) * k * k - R.vy * 2 * k) * dt;
    R.x += R.vx * dt; R.y += R.vy * dt;
    if (Math.abs(R.x - mk.x) > 400 || Math.abs(R.y - mk.y) > 300) { R.x = tx; R.y = ty; R.vx = R.vy = 0; }
    R.hop = Math.max(0, R.hop - dt * 3);
    // eyes: the target, else the nearest Pokémon, else Mudkip
    if (!look) { let best = null, bd = 150; for (const m of Mons.all) { if (m === mk || !m.alive || !m.visible || !DexData.S[m.dex]) continue; const dd = Math.hypot(m.x - R.x, m.y - R.y); if (dd < bd) { bd = dd; best = m; } } look = best ? best.headPt() : [hx, hy]; }
    const lx = clamp((look[0] - R.x) / 40, -1, 1), ly = clamp((look[1] - R.y) / 40, -1, 1);
    R.lx += (lx - R.lx) * Math.min(1, dt * 8); R.ly += (ly - R.ly) * Math.min(1, dt * 8);
    R.yaw += (clamp(R.vx / 120, -0.6, 0.6) + lx * 0.25 - R.yaw) * Math.min(1, dt * 6);
    for (const p of R.drips) { p.t += dt; p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } R.drips = R.drips.filter((p) => p.t < 0.7);
    for (const p of R.sparks) p.t += dt; R.sparks = R.sparks.filter((p) => p.t < p.life);
    if (R.wet > 0.2 && Math.random() < dt * 12) R.drips.push({ x: R.x + rnd(-6, 6), y: R.y + 6, vx: rnd(-8, 8), vy: 10, t: 0 });
    if (R.wet > 0.3 && Math.random() < dt * 4) burst(1);
  }
  function burst(n) { for (let i = 0; i < n; i++) R.sparks.push({ a: rnd(0, Math.PI * 2), r: rnd(8, 16), t: 0, life: rnd(0.15, 0.35), seed: Math.random() * 999 }); }
  function idle(dt, mk, t) {
    if (R.st !== 'follow' || Talk.dlg) return;
    // peek at unregistered species nearby (and mark them seen in the Dex)
    for (const m of Mons.all) {
      if (m === mk || !m.alive || !m.visible || m.hidden || (m.hideK || 0) > 0.5 || !DexData.S[m.dex] || String(m.kind).startsWith('bg-')) continue;
      if (Math.abs(m.x - Game.cam.x - Game.VW / 2) > Game.VW * 0.5 || Math.hypot(m.x - mk.x, m.y - mk.y) > 170) continue;
      const sp = Save.data.rspot || (Save.data.rspot = {});
      if (!sp[m.dex]) { sp[m.dex] = Date.now(); Save.save(); }
      if (!Save.data.seen[m.dex] && !R.peeked[m.dex]) { R.peeked[m.dex] = 1; R.tgt = m; react('peek', 3.5, 'wow', pick(['Who\'s THAT Pokémon?! Snap it!', 'Ooh! ' + nm(m.dex) + '! No data yet! Bzzt!', 'New Pokémon! Photo! Photo!'])); return; }
    }
    R.pointT -= dt; R.orbitT -= dt;
    if (R.pointT <= 0 && typeof Progress !== 'undefined' && Progress.tracked) {
      R.pointT = rnd(50, 80); const q = Progress.tracked();
      if (q && q.area === Game.areaId) { const g = Talk.giverOf(q), tg = q.photo ? Mons.all.find((m) => m.dex === q.photo.sp && m.alive) : g; if (tg && Math.abs(tg.x - mk.x) > 60) { R.pointAt = [tg.x, tg.y - 20]; react('point', 3.5, 'happy', 'Quest! ' + Progress.objective(q) + ' That way!'); return; } }
    }
    if (R.orbitT <= 0 && (mk.idleT || 0) > 1) { R.orbitT = rnd(25, 45); react('orbit', 2.6, 'happy'); return; }
    R.chatT -= dt;
    if (R.chatT <= 0) {
      const h = Game.hour(), r = Math.random();
      if ((mk.idleT || 0) > 12 && r < 0.3) say('Nap time? Rotom can hum a lullaby... bzz-bzz-bzzz...');
      else if (h === 'night' && r < 0.3) say('It\'s dark... good thing Rotom glows! Bzzt!');
      else if (r < 0.55 && AREA[Game.areaId]) say(AREA[Game.areaId]);
      else if (r < 0.8) say(hint());
      else say(pick(JOKES));
    }
  }
  function events(dt, mk) {
    const t = Game.rt;
    // moves (Moves.cd changes when a move is used)
    const cdv = Moves.cd || {};
    for (const id in cdv) {
      if (R.cd['m' + id] === cdv[id]) continue;
      const first = R.cd['m' + id] === undefined; R.cd['m' + id] = cdv[id]; if (first && !R.seeded) continue;
      if (Game.mode !== 'explore') continue;
      const ahead = (R.x - mk.x) * mk.dirX() > -4;
      if (id === 'flash') setTimeout(() => { react('ouch', 2.2, 'x', 'OUCH! MY EYES!!'); R.spin = 30; voice('ouch'); burst(8); }, 380);
      else if (id === 'water' && (ahead || Math.random() < 0.3) && (!R.cd.soak || t - R.cd.soak > 12)) { R.cd.soak = t; setTimeout(() => { R.wet = 1; react('soak', 2.2, 'x', pick(['Bzzt-zzt! NOT waterproof!', 'Pfff! Water and circuits DON\'T mix!', 'Hey! I just polished my screen!'])); voice('sad'); }, 250); }
      else if (id === 'growl') setTimeout(() => { R.vy -= 160; react('startle', 1.4, 'wow', pick(['EEK! Warn me first!', 'Bzzt! My speakers!', 'WAAH! So loud!'])); }, 200);
      else if (id === 'rain') say('Noooo, not RAIN DANCE! Rotom\'s circuits!');
      else if (id === 'sunny') { react('cheer', 1.6, 'happy', 'Sunshine! Rotom is solar-charging!'); R.spin = 14; }
      else if (id === 'scan') say(pick(['Scanning... bzzzzt!', 'Rotom radar, ON!']));
      else if (id === 'sing' && Math.random() < 0.5) say('♪ Bzzt-bzzt, bzzt-bzzt ♪');
      else if (id === 'quick' && Math.random() < 0.4) say('Wait for meee!');
    }
    R.seeded = true;
    // new Pokédex entries / level ups
    const n = Object.keys(Save.data.seen).length;
    if (R.seenN >= 0 && n > R.seenN) { const k = Object.keys(Save.data.seen).sort((a, b) => Save.data.seen[b] - Save.data.seen[a])[0]; setTimeout(() => { react('cheer', 2.4, 'happy', 'New Pokédex data! ' + nm(k) + ' registered! Bzzt-bzzt!'); R.spin = 22; voice('happy'); burst(10); }, 1800); }
    R.seenN = n;
    const lv = typeof Progress !== 'undefined' ? Progress.lvUp : null;
    if (lv && lv !== R.lv) setTimeout(() => { react('cheer', 2.4, 'happy', 'Level ' + lv.lv + '! You\'re amazing! Kiiih!'); R.spin = 22; voice('happy'); burst(10); }, 900);
    R.lv = lv;
    // rain → sulk
    const wet = Weather.W.rain > 0.35;
    R.sulk += ((wet ? 1 : 0) - R.sulk) * Math.min(1, dt * 1.5);
    if (wet && !R.rain && Game.mode === 'explore') say(pick(['Ugh, rain... Rotom hates rain.', 'Rain?! Rotom\'s getting the umbrella.']));
    R.rain = wet;
  }

  /* ---------- poke ---------- */
  function poke() {
    const t = Game.rt;
    R.pokes = R.pokes.filter((x) => t - x < 5); R.pokes.push(t);
    R.hop = 1; R.vy -= 60; burst(3); Game.sfx('blip');
    if (R.pokes.length >= 4) { R.pokes.length = 0; react('poke', 1.6, 'x', 'Bzzt! STOP poking! ...Fine. ' + hint()); R.spin = 18; return; }
    react('poke', 1.2, Math.random() < 0.5 ? 'happy' : 'wow');
    say(Math.random() < 0.5 ? pick(JOKES) : pick(['Hi hi! ', 'Bzzt? ', 'Zzt! ']) + hint(), 4.5);
  }

  /* ---------- drawing ---------- */
  function ell(fb, cx, cy, rx, ry, c) { for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.3)) ** 2))); UI.hline(fb, Math.round(cx - hw), Math.round(cx + hw), Math.round(cy + y), c); } }
  function draw(fb, t) {
    if (!visible() || R.hide) { R.box = null; return; }
    const [ux, uy] = Talk.toUI(R.x, R.y - R.hop * 4);
    const k = clamp(Game.zoom / Game.US, 1, 2.4), H = Math.round(15 * k), W = Math.round(H * 0.8);
    const X = Math.round(ux), Y = Math.round(uy);
    if (X < -40 || X > fb.w + 40 || Y < -50 || Y > fb.h + 50) { R.box = null; return; }
    R.box = { x: X - W, y: Y - H, w: W * 2, h: H * 2 };
    const night = Game.hour() === 'night' || Game.hour() === 'dusk';
    if (night) for (let y = -H * 1.4; y <= H * 1.4; y++) for (let x = -H * 1.4; x <= H * 1.4; x++) { const d = Math.hypot(x, y) / (H * 1.4); if (d < 1) UI.blend(fb, X + x, Y + y, hex('#bff4ff'), 0.18 * (1 - d)); }
    // turntable yaw (spins), front width shrinks, a side band shows
    const yaw = R.yaw + (R.spin > 0.5 ? (t * R.spin) % (Math.PI * 2) : 0);
    const cs = Math.cos(yaw), sn = Math.sin(yaw), front = cs > 0;
    const fw = Math.max(2, Math.round(W * Math.abs(cs))), sw = Math.round(H * 0.28 * Math.abs(sn)), tw = fw + sw;
    const x0 = X - (tw >> 1), y0 = Y - (H >> 1) + (R.sulk > 0.5 ? 1 : 0);
    const shake = R.wet > 0.4 || R.st === 'startle' && R.stT > 0 ? Math.round(Math.sin(t * 50)) : 0;
    const bx = x0 + shake, fx0 = bx + (sn > 0 ? sw : 0), sx0 = sn > 0 ? bx : bx + fw;
    const body = R.wet > 0.2 ? mix(C.b, hex('#5a6ad8'), R.wet * 0.3) : C.b;
    // antenna bolt
    const ax = fx0 + Math.round(fw * 0.38), at = y0 - Math.round(H * 0.45);
    const pts = [[ax, y0 + 1], [ax - Math.round(H * 0.14), y0 - Math.round(H * 0.2)], [ax + Math.round(H * 0.1), y0 - Math.round(H * 0.24)], [ax - 1, at]];
    const sparkT = R.sparks.length > 0;
    for (const pass of [0, 1]) for (let i = 0; i < 3; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) + 1; for (let s = 0; s <= n; s++) { const px = Math.round(lerp(a[0], b[0], s / n)), py = Math.round(lerp(a[1], b[1], s / n)), r = pass ? (i === 2 ? 0 : 1) : (i === 2 ? 1 : 2); for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (Math.abs(xx) + Math.abs(yy) <= r) UI.put(fb, px + xx, py + yy, pass ? (i === 2 && sparkT ? C.gold : xx < 0 ? C.l : body) : C.ink); } }
    // tail tip
    for (let j = 0; j <= Math.round(H * 0.28); j++) { const hw = Math.round((W * 0.2) * (1 - j / (H * 0.28))); UI.hline(fb, X - hw - 1 + shake, X + hw + 1 + shake, y0 + H - 2 + j, C.ink); if (hw > 0) UI.hline(fb, X - hw + shake, X + hw + shake, y0 + H - 2 + j, j < 2 ? body : C.d); }
    // body silhouette + shading
    UI.rrect(fb, bx - 1, y0 - 1, tw + 2, H + 2, Math.round(H * 0.3), C.ink);
    const r = Math.round(H * 0.28);
    for (let j = 0; j < H; j++) { let ins = 0; if (j < r) ins = r - Math.round(Math.sqrt(r * r - (r - j - 0.5) ** 2)); else if (j >= H - r) ins = r - Math.round(Math.sqrt(r * r - (j - (H - r) + 0.5) ** 2)); for (let i = ins; i < tw - ins; i++) { const inSide = sw && (i + bx >= sx0 && i + bx < sx0 + sw); let c = inSide ? (sn > 0 ? C.l : C.d) : body; if (!inSide) { if (j < 2) c = C.ll; else if (j > H - 3) c = C.d; else if (i === ins) c = C.l; } UI.put(fb, bx + i, y0 + j, c); } }
    if (front && fw > 6) face(fb, fx0, y0, fw, H, t);
    else if (!front) { for (let i = 0; i < 3; i++) UI.hline(fb, fx0 + 3, fx0 + fw - 4, y0 + Math.round(H * 0.3) + i * 3, C.dd); }
    // floating hands
    const hr = Math.max(2, Math.round(H * 0.12));
    const hand = (hx, hy) => { UI.disc(fb, hx, hy, hr + 1, C.ink); UI.disc(fb, hx, hy, hr, body); UI.put(fb, hx - 1, hy - 1, C.ll); };
    const wav = Math.round(Math.sin(t * 6) * 2);
    if (R.st === 'ouch' && R.stT < 1.2) { hand(fx0 + Math.round(fw * 0.3), y0 + Math.round(H * 0.28)); hand(fx0 + Math.round(fw * 0.7), y0 + Math.round(H * 0.28)); }
    else {
      let lhx = bx - hr - 2, lhy = Y + wav, rhx = bx + tw + hr + 1, rhy = Y - wav;
      if (R.st === 'point' && R.pointAt) { const dir = Math.sign(R.pointAt[0] - R.x) || 1; if (dir > 0) { rhx += 4; rhy = Y - 4; } else { lhx -= 4; lhy = Y - 4; } }
      if (R.st === 'cheer' || R.st === 'poke') { lhy = y0 - 1 + wav; rhy = y0 - 1 - wav; }
      hand(lhx, lhy); hand(rhx, rhy);
      // leaf umbrella in the rain
      if (R.sulk > 0.5) { UI.vline(fb, rhx, rhy - H, rhy - hr, C.leafD); const ur = Math.round(W * 0.75); for (let y = 0; y <= Math.round(ur * 0.5); y++) { const hw = Math.round(ur * Math.sqrt(1 - (y / (ur * 0.5 + 0.5)) ** 2)); UI.hline(fb, rhx - hw, rhx + hw, rhy - H - y, y === 0 ? C.leafD : C.leaf); } }
    }
    // electric sparks, drips
    for (const p of R.sparks) { const rn = U.rng(Math.floor(p.seed)); let x = X + Math.cos(p.a) * p.r * k * 0.7, y = Y + Math.sin(p.a) * p.r * k * 0.7; for (let s = 0; s < 3; s++) { const nx = x + (rn() - 0.5) * 6, ny = y + (rn() - 0.5) * 6; UI.line(fb, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), s % 2 ? C.gold : 0xffffffff); x = nx; y = ny; } }
    for (const p of R.drips) { const [dx, dy] = Talk.toUI(p.x, p.y); UI.put(fb, Math.round(dx), Math.round(dy), hex('#8ac8ff')); UI.put(fb, Math.round(dx), Math.round(dy) - 1, 0xffffffff); }
  }
  function face(fb, fx, y0, fw, H, t) {
    // screen, cyan face, eyes on a black bridge, grin
    const sx = fx + Math.round(fw * 0.12), sw = fw - Math.round(fw * 0.24), sy = y0 + Math.round(H * 0.12), sh = Math.round(H * 0.5);
    UI.rrect(fb, sx - 1, sy - 1, sw + 2, sh + 2, 2, C.ink); UI.rrect(fb, sx, sy, sw, sh, 1, C.scr);
    const cx = sx + (sw >> 1), rx = Math.round(sw * 0.42), ry = Math.round(sh * 0.62), ey = sy + Math.round(sh * 0.3);
    for (let y = 0; y <= ry; y++) { const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2))); UI.hline(fb, cx - hw, cx + hw, ey + y, y === ry || hw < 1 ? C.faceD : C.face); }
    const ex = Math.max(2, Math.round(sw * 0.24)), erx = Math.max(1, Math.round(sw * 0.15)), ery = Math.max(2, Math.round(sh * 0.22));
    UI.rect(fb, cx - ex, ey - (ery >> 1), ex * 2, ery, C.eye);
    const m = R.mood, blink = R.blinkT > 0;
    for (const sd of [-1, 1]) {
      const ecx = cx + sd * ex; ell(fb, ecx, ey, erx + 1, ery + 1, C.eye);
      if (blink || (m === 'happy')) { ell(fb, ecx, ey, erx, ery, 0xffffffff); ell(fb, ecx, ey + Math.max(1, ery >> 1) + 1, erx + 1, ery, C.eye); if (blink) UI.hline(fb, ecx - erx, ecx + erx, ey, hex('#3a3858')); continue; }
      ell(fb, ecx, ey, erx, ery, 0xffffffff);
      if (m === 'x') { for (let q = -erx; q <= erx; q++) { UI.put(fb, ecx + q, ey + q, C.eye); UI.put(fb, ecx + q, ey - q, C.eye); } continue; }
      const pr = m === 'wow' ? 0 : Math.max(0, erx - 1), px = ecx + Math.round(R.lx * Math.max(0, erx - pr - 0.4)), py = ey + Math.round(R.ly * Math.max(0, ery - 1));
      ell(fb, px, py, pr, Math.max(1, ery - 1), C.eye); UI.put(fb, px - (pr > 0 ? 1 : 0), py - 1, 0xffffffff);
      if (m === 'sad') UI.hline(fb, ecx - erx - 1, ecx + erx + 1, ey - ery, C.eye);
    }
    const my = ey + Math.round(ry * 0.62), mw = Math.max(2, Math.round(rx * 0.55)), open = R.talkT > 0 ? Math.abs(Math.sin(t * 16)) : m === 'happy' ? 1 : 0.5;
    if (m === 'sad') UI.hline(fb, cx - mw + 1, cx + mw - 1, my + 1, C.eye);
    else if (m === 'wow') UI.rect(fb, cx - 1, my, 2, 2, C.mouth);
    else { const mh = Math.max(1, Math.round((H / 12) * (0.6 + open))); for (let x = -mw; x <= mw; x++) { const yb = my + Math.round(mh * Math.sqrt(1 - (x / (mw + 0.5)) ** 2)); UI.vline(fb, cx + x, my, yb, C.mouth); if ((x + mw) % 2 === 0 && Math.abs(x) < mw) UI.put(fb, cx + x, my, 0xffffffff); } }
  }

  /* ---------- hooks ---------- */
  { const u0 = Talk.update; Talk.update = function (dt) { const r = u0.apply(this, arguments); try { update(dt); } catch (e) { console.error(e); } return r; }; }
  { const d0 = Talk.drawBubbles; Talk.drawBubbles = function (fb, t) { try { draw(fb, t); } catch (e) { console.error(e); } return d0.apply(this, arguments); }; }
  { const d0 = Talk.down; Talk.down = function (ux, uy) {
    const B = R.box;
    if (B && Game.mode === 'explore' && !Talk.dlg && ux >= B.x - 4 && uy >= B.y - 6 && ux < B.x + B.w + 4 && uy < B.y + B.h + 4 && !(HUD.btns || []).some((b) => ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) && !(typeof Pad !== 'undefined' && Pad.touch && ux < Game.UW * 0.42 && uy > Game.UH * 0.38)) { poke(); return true; }
    return d0.apply(this, arguments); }; }
  { const k0 = Talk.key; Talk.key = function (k, e) { if (k === 'o' && Game.mode === 'explore' && !Talk.dlg && visible()) { poke(); return true; } return k0.apply(this, arguments); }; }
  U.on && U.on('area', (id) => { R.on = false; R.peeked = {}; setTimeout(() => { if (visible() && Math.random() < 0.7) say(AREA[id] || 'New place! Research time! Bzzt!'); }, 2500); });
  U.on && U.on('photo', (res) => { if (res && res.species && res.medal >= 3 && Math.random() < 0.5) setTimeout(() => say(pick(['Great shot! Bzzt!', 'Wow, what a photo!'])), 2600); });

  return Object.assign(R, { voice, joke: () => pick(JOKES), hint, poke, say, update, draw });
})();
