/* ------------------------------------------------------------------
   Rotom — the Rotom Dex companion that flies around Mudkip, drawn as
   the 3D RotomDex model (src/species/rotomdex.js) rendered to pixel
   art and cached per pose / yaw, on the UI canvas (so it never shows
   up in photos and never gets an accessory). It banks, waves, spins,
   squashes when poked and shows expressive screen faces. It bobs, orbits, looks at Pokémon,
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
    chatT: 12, pokes: [], wet: 0, drips: [], sparks: [], sulk: 0, tgt: null, hop: 0, peeked: {}, cd: {}, seenN: -1, lv: null, rain: false, hide: 0, box: null, pointAt: null, pointT: 40, orbitT: 25, outT: 0, tilt: 0, vt: 0, lean: 0, sq: 0, vsq: 0, fid: null, fidT: 6, blinkD: 0.16 };
  // colours of the official Rotom Dex art
  const C = { b: hex('#e4524a'), l: hex('#f78a7e'), ll: hex('#ffc2b4'), d: hex('#b93a36'), dd: hex('#8a2226'), ink: hex('#4a1216'), btn: hex('#cc463f'),
    scr: hex('#f8fafc'), scrD: hex('#d3dde8'), face: hex('#76c6ee'), faceD: hex('#4c9fd8'), bridge: hex('#26262e'), bridgeL: hex('#4a4b56'), mouth: hex('#2a1030'), mouthO: hex('#1e2a44'),
    eyeO: hex('#1c2230'), iris: hex('#2f64d8'), irisD: hex('#1d3c96'), ring: hex('#dde5ee'), grey: hex('#b9c0cd'), greyD: hex('#7a808c'), gold: hex('#ffd23a'), leaf: hex('#4ab860'), leafD: hex('#2a7a3a') };
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
    R.nextBlink -= dt; if (R.nextBlink <= 0) { R.blinkD = rnd(0.13, 0.2); R.blinkT = R.blinkD; R.nextBlink = Math.random() < 0.22 ? 0.26 : rnd(2, 5.5); } R.blinkT -= dt;
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
    // lazy figure-8 drift so it never hovers dead still
    if (R.st === 'follow') { tx += Math.sin(t * 0.9) * 5; ty += Math.sin(t * 1.8) * 2; }
    if (R.fid) { const f = R.fid, u = 1 - f.t / f.d; if (f.k === 'peek') { tx += Math.sin(u * Math.PI) * 14 * f.s; ty += Math.sin(u * Math.PI) * 6; } if (f.k === 'loop') { const a = u * Math.PI * 2; tx += Math.sin(a) * 12 * f.s; ty -= (1 - Math.cos(a)) * 9; } }
    // springy follow: slightly under-damped (a little overshoot and settle); a far jump winds up first (anticipation)
    const k = R.st === 'duck' ? 7 : 4.2, z = R.st === 'duck' ? 0.8 : 0.58, far = Math.hypot(tx - R.x, ty - R.y);
    if (far > 46 && !R.wind && R.st !== 'duck') { R.wind = 0.14; R.vsq += 9; }
    if (R.wind > 0) { R.wind -= dt; if (R.wind <= 0) { R.wind = -0.6; R.vsq -= 16; } }
    else { if (R.wind < 0) R.wind = Math.min(0, R.wind + dt); R.vx += ((tx - R.x) * k * k - R.vx * 2 * z * k) * dt; R.vy += ((ty - R.y) * k * k - R.vy * 2 * z * k) * dt; }
    R.x += R.vx * dt; R.y += R.vy * dt;
    // banking / lean / squash on their own springs so they lag and wobble naturally
    const ax = R.vx - (R.pvx || 0); R.pvx = R.vx;
    const tt = clamp(R.vx / 220 + ax / Math.max(dt, 1e-3) / 4000, -0.5, 0.5);
    R.vt += ((tt - R.tilt) * 90 - R.vt * 9) * dt; R.tilt += R.vt * dt;
    R.lean += (clamp(-R.vy / 380, -0.25, 0.25) - R.lean) * Math.min(1, dt * 7);
    const sqT = clamp(-Math.hypot(R.vx, R.vy) / 420, -0.45, 0);
    R.vsq += ((sqT - R.sq) * 160 - R.vsq * 10) * dt; R.sq += R.vsq * dt;
    if (R.fid) { R.fid.t -= dt; if (R.fid.t <= 0 || R.st !== 'follow') R.fid = null; }
    if (Math.abs(R.x - mk.x) > 400 || Math.abs(R.y - mk.y) > 300) { R.x = tx; R.y = ty; R.vx = R.vy = 0; }
    R.hop = Math.max(0, R.hop - dt * 3);
    // eyes: the target, else the nearest Pokémon, else Mudkip
    if (!look) { let best = null, bd = 150; for (const m of Mons.all) { if (m === mk || !m.alive || !m.visible || !DexData.S[m.dex]) continue; const dd = Math.hypot(m.x - R.x, m.y - R.y); if (dd < bd) { bd = dd; best = m; } } look = best ? best.headPt() : [hx, hy]; }
    if (R.fid && R.fid.k === 'look') look = [R.x + R.fid.s * 60 * (R.fid.t > R.fid.d / 2 ? 1 : -1), R.y - 10];
    const lx = clamp((look[0] - R.x) / 40, -1, 1), ly = clamp((look[1] - R.y) / 40, -1, 1);
    R.lx += (lx - R.lx) * Math.min(1, dt * 11); R.ly += (ly - R.ly) * Math.min(1, dt * 11);
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
    R.fidT -= dt;
    if (R.fidT <= 0 && !R.fid) { R.fidT = rnd(5, 11); const k = pick(['spin', 'wave', 'peek', 'loop', 'wave', 'look']); R.fid = { k, t: 0, d: { spin: 0.9, wave: 1.6, peek: 1.8, loop: 1.4, look: 2 }[k], s: Math.random() < 0.5 ? -1 : 1 }; R.fid.t = R.fid.d; if (k === 'spin') R.spin = 13; if (k === 'loop') R.vsq += 6; }
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
      else if (id === 'growl') setTimeout(() => { R.vy -= 160; R.vsq -= 18; react('startle', 1.4, 'wow', pick(['EEK! Warn me first!', 'Bzzt! My speakers!', 'WAAH! So loud!'])); }, 200);
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
    R.hop = 1; R.vy -= 60; R.vsq += 14; burst(3); Game.sfx('blip');
    if (R.pokes.length >= 4) { R.pokes.length = 0; react('poke', 1.6, 'x', 'Bzzt! STOP poking! ...Fine. ' + hint()); R.spin = 18; return; }
    react('poke', 1.2, Math.random() < 0.5 ? 'happy' : 'wow');
    say(Math.random() < 0.5 ? pick(JOKES) : pick(['Hi hi! ', 'Bzzt? ', 'Zzt! ']) + hint(), 4.5);
  }

  /* ---------- drawing: the 3D Rotom Dex model (src/species/rotomdex.js) rendered to pixel art ----------
     Each distinct (pose, yaw, scale, time-of-day) combination is rendered once and cached; the pose is
     quantised so a handful of frames cover the bob, arm waves, banking, spins and every screen face. */
  const cache = new Map();
  const qz = (v, s) => Math.round(v / s) * s;
  function sprite(pose, yaw, sc) {
    const P = Game.P || Times.compile('noon');
    const key = (P.key || '') + '|' + sc + '|' + yaw.toFixed(2) + '|' + JSON.stringify(pose);
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); return e; }
    const g = P.gradePal(RotomDex.PAL, 'rotomdex');
    const W = Math.ceil(150 * sc), H = Math.ceil(130 * sc), ox = W >> 1, oy = Math.round(H * 0.72);
    const r = RotomDex.render(RotomDex.build(pose), { yaw, pitch: 0.12, scale: sc, W, H, ox, oy, pal: g.pal, light: g.light });
    const d = r.buf.d; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    const b = r.anchors.body;
    e = { buf: r.buf, bx: Math.round(b[0]), by: Math.round(b[1]), x0, y0, x1, y1, head: r.anchors.head };
    cache.set(key, e);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return e;
  }
  // the pose + face for this frame, from Rotom's state
  function poseNow(t) {
    const m = R.mood, st = R.st, act = R.stT > 0, talk = R.talkT > 0 && Math.sin(t * 16) > 0;
    const p = { armN: qz(Math.sin(t * 3.2) * 0.16, 0.08), armF: qz(Math.sin(t * 3.2 + 1.7) * 0.16, 0.08), eyes: 'open', smile: 'grin', mouth: talk ? 0.8 : 0, screen: '', lookX: qz(-R.lx, 0.5), lookY: qz(-R.ly, 0.5) };
    const wave = (f, a) => qz(Math.sin(t * f) * a, 0.1);
    if (m === 'happy') { p.eyes = 'happy'; p.mouth = talk ? 1 : 0.7; }
    else if (m === 'wow') { p.eyes = 'wow'; p.smile = 'o'; p.mouth = talk ? 0.8 : 0.3; }
    else if (m === 'sad') { p.eyes = 'sad'; p.smile = 'frown'; }
    else if (m === 'x') { p.eyes = 'x'; p.smile = 'wavy'; }
    if (st === 'cheer' && act) { p.armN = 1 + wave(10, 0.35); p.armF = 1 - wave(10, 0.35); p.screen = 'heart'; }
    else if (st === 'orbit' && act) { p.armN = 0.5 + wave(6, 0.3); p.armF = 0.5 - wave(6, 0.3); }
    else if (st === 'ouch' && act) { p.eyes = 'x'; p.smile = 'wavy'; p.screen = R.stT > 1.2 ? 'static' : '!'; p.armN = 1.3 + wave(22, 0.3); p.armF = 1.3 - wave(22, 0.3); }
    else if (st === 'soak' && act) { p.eyes = R.stT > 1.2 ? 'x' : 'dizzy'; p.smile = 'wavy'; p.screen = 'sweat'; p.armN = -0.5 + wave(14, 0.3); p.armF = -0.5 - wave(14, 0.3); }
    else if (st === 'startle' && act) { p.eyes = 'wow'; p.smile = 'o'; p.mouth = 0.8; p.screen = '!'; p.armN = p.armF = 0.9; }
    else if (st === 'peek' && act) { p.screen = '?'; p.armN = 0.3; p.armF = 0.3; }
    else if (st === 'point' && R.pointAt && act) { const right = (R.pointAt[0] - R.x) > 0; if (right) p.armF = 0.35 + wave(8, 0.1); else p.armN = 0.35 + wave(8, 0.1); p.eyes = 'happy'; }
    else if (st === 'poke' && act && m === 'x') { p.eyes = 'angry'; p.smile = 'frown'; p.screen = '!'; p.armN = p.armF = -0.3; }
    else if (st === 'poke' && act) { p.armN = 0.7 + wave(12, 0.3); p.armF = 0.2 - wave(12, 0.3); }
    else if (R.sulk > 0.5) { p.eyes = 'sad'; p.smile = 'frown'; p.armN = -0.6; p.armF = 0.25; }
    else if ((Game.mudkip && Game.mudkip.idleT || 0) > 14) { p.eyes = 'blink'; p.smile = 'flat'; p.screen = 'zzz'; p.armN = p.armF = -0.4; }
    const F = R.fid;
    if (F && F.k === 'wave' && p.eyes === 'open') { const w = 1.1 + wave(14, 0.4); if (F.s > 0) p.armN = w; else p.armF = w; p.eyes = 'happy'; p.mouth = 0.6; }
    if (F && F.k === 'peek' && p.eyes === 'open') { p.screen = '?'; p.armN = p.armF = 0.25; }
    if (F && F.k === 'loop' && p.eyes === 'open') { p.eyes = 'happy'; p.armN = p.armF = 0.9; }
    if (R.blinkT > 0 && p.eyes === 'open') { const u = 1 - R.blinkT / R.blinkD, c = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6; if (c > 0.75) p.eyes = 'blink'; else p.lid = qz(c, 0.33); }
    // banking into the flight direction, a squash when poked, a stretch when zipping up
    const sway = Math.sin(t * 1.7) * 0.07 + (F && F.k === 'peek' ? -F.s * 0.15 : 0);
    p.tilt = qz(clamp(R.tilt + sway, -0.55, 0.55), 0.06);
    p.lean = qz(clamp(R.lean, -0.25, 0.25), 0.08);
    p.squash = qz(clamp(R.hop > 0 ? Math.sin(R.hop * Math.PI) * 0.9 : R.sq, -0.6, 0.9), 0.12);
    p.glow = R.sparks.length ? 1 : 0;
    return p;
  }
  function draw(fb, t) {
    if (!visible() || R.hide) { R.box = null; return; }
    const [ux, uy] = Talk.toUI(R.x, R.y - R.hop * 4);
    const k = clamp(Game.zoom / Game.US, 1, 2.4), sc = qz(0.42 * k, 0.02);
    const X = Math.round(ux), Y = Math.round(uy + Math.sin(t * 3.2) * 1.2 * k);
    if (X < -80 || X > fb.w + 80 || Y < -80 || Y > fb.h + 80) { R.box = null; return; }
    const night = Game.hour() === 'night' || Game.hour() === 'dusk';
    if (night) { const g = 22 * k; for (let y = -g; y <= g; y++) for (let x = -g; x <= g; x++) { const d = Math.hypot(x, y) / g; if (d < 1) UI.blend(fb, X + x, Y + y, hex('#bff4ff'), 0.16 * (1 - d)); } }
    // yaw: front-on (π/2), turned toward where it flies / looks, plus spins
    const yaw0 = Math.PI / 2 + R.yaw + (R.spin > 0.5 ? (t * R.spin) % (Math.PI * 2) : 0);
    const yaw = qz(((yaw0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), Math.PI / 16);
    const shake = R.wet > 0.4 || (R.st === 'startle' && R.stT > 0) ? Math.round(Math.sin(t * 50)) : 0;
    const e = sprite(poseNow(t), yaw, sc);
    const bx = X + shake - e.bx, by = Y + (R.sulk > 0.5 ? 1 : 0) - e.by;
    const wet = R.wet > 0.2 ? { tint: hex('#5a6ad8'), tintK: R.wet * 0.3 } : {};
    UI.img(fb, e.buf, bx, by, 1, wet);
    R.box = { x: bx + e.x0, y: by + e.y0, w: e.x1 - e.x0 + 1, h: e.y1 - e.y0 + 1 };
    // leaf umbrella in the rain
    if (R.sulk > 0.5 && R.st !== 'ouch') {
      const ux2 = Math.round(bx + e.x1 - 4 * k), uy2 = Math.round(by + e.y0 + 10 * k), ur = Math.round(8 * k);
      UI.vline(fb, ux2, uy2 - Math.round(8 * k), uy2 + Math.round(4 * k), C.leafD);
      for (let y = 0; y <= Math.round(ur * 0.5); y++) { const hw = Math.round(ur * Math.sqrt(1 - (y / (ur * 0.5 + 0.5)) ** 2)); UI.hline(fb, ux2 - hw, ux2 + hw, uy2 - Math.round(8 * k) - y, y === 0 ? C.leafD : C.leaf); }
    }
    // electric sparks, drips
    for (const p of R.sparks) { const rn = U.rng(Math.floor(p.seed)); let x = X + Math.cos(p.a) * p.r * k * 1.1, y = Y + Math.sin(p.a) * p.r * k * 1.1; for (let q = 0; q < 3; q++) { const nx = x + (rn() - 0.5) * 6, ny = y + (rn() - 0.5) * 6; UI.line(fb, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), q % 2 ? C.gold : 0xffffffff); x = nx; y = ny; } }
    for (const p of R.drips) { const [dx, dy] = Talk.toUI(p.x, p.y); UI.put(fb, Math.round(dx), Math.round(dy), hex('#8ac8ff')); UI.put(fb, Math.round(dx), Math.round(dy) - 1, 0xffffffff); }
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
