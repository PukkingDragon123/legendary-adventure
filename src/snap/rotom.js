/* ------------------------------------------------------------------
   Rotom — the Rotom Dex companion that flies around Mudkip, drawn as
   a small toon pixel sprite of the official Rotom Dex: a tilted red
   body with a spike antenna, a white screen showing Rotom's face (blue
   eyes on a dark bridge, light-blue face with a toothy grin) and two
   floating lightning-bolt arms ending in flat panels, crisp on the UI
   canvas. It bobs, orbits, looks at Pokémon,
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

  /* ---------- drawing: the official Rotom Dex, as a small toon pixel sprite ----------
     Designed in its own units (the body is ~31 x 28, centre 0,0, y down): a slightly tilted red body
     with a tall spike antenna at the top left and a pointed fin on the left, a white screen showing
     Rotom's face (blue eyes on a dark bridge, a light-blue face with a toothy grin and the little
     "magnifier" handle), a thumb and a tail tab, and two floating lightning-bolt arms ending in flat
     panels with round buttons. Rasterised straight to the UI canvas every frame (turntable squash
     when it spins). */
  const BODY = [[-11.6, -13.4], [-8.6, -30.5], [-1.8, -13.6], [12.8, -13.6], [16.3, -10.8], [16.3, 10.6], [13.6, 14.2], [-11.8, 14.2], [-14.6, 11], [-14.6, 7.6], [-22, -0.6], [-14.6, -8.2], [-14.6, -10.6]];
  const SCREEN = { x0: -12, y0: -3.2, x1: 11.4, y1: 12.2 };
  const ARM_R = { bolt: [[16, 3.2], [20.8, 1.4], [19.6, -2.2], [23.6, -3.4]], panel: [[21.2, -12.8], [30.2, -17.2], [35, -6.4], [26, 3.2]], btn: [28.2, -7, 2.7, 3.7], root: [16, 3.2] };
  const ARM_L = { bolt: [[-13.6, 12.4], [-18, 11.6], [-16.6, 15.2], [-20.4, 15.8]], panel: [[-33, 11.4], [-20, 12.2], [-16.4, 21.8], [-29.8, 23.6]], btn: [-25, 17.4, 3.8, 2.6], root: [-13.6, 12.4], grey: true };
  const TILT = -0.12;
  function segD(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0; return Math.hypot(px - ax - dx * t, py - ay - dy * t); }
  function inPoly(pts, x, y) { let ins = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) ins = !ins; } return ins; }
  // unit <-> pixel (tilt in the body's plane, then the turntable squash)
  const toPx = (T, x, y) => { const x1 = x * T.ct - y * T.st, y1 = x * T.st + y * T.ct; return [T.X + x1 * T.s * T.cs, T.Y + y1 * T.s]; };
  const toU = (T, px, py) => { const x1 = (px - T.X) / (T.s * T.cs), y1 = (py - T.Y) / T.s; return [x1 * T.ct + y1 * T.st, -x1 * T.st + y1 * T.ct]; };
  // rasterise one shape with a 1px ink outline; fill(ux, uy, lit, shade) picks each pixel's colour
  function shape(fb, T, bb, inside, fill, ink = C.ink) {
    const cs = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => toPx(T, x, y));
    const x0 = Math.floor(Math.min(...cs.map((c) => c[0]))) - 1, x1 = Math.ceil(Math.max(...cs.map((c) => c[0]))) + 1;
    const y0 = Math.floor(Math.min(...cs.map((c) => c[1]))) - 1, y1 = Math.ceil(Math.max(...cs.map((c) => c[1]))) + 1;
    const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w <= 0 || h <= 0 || w * h > 40000) return;
    const m = new Uint8Array(w * h), uu = new Float32Array(w * h * 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [ux, uy] = toU(T, x0 + i + 0.5, y0 + j + 0.5); if (inside(ux, uy)) { const p = j * w + i; m[p] = 1; uu[p * 2] = ux; uu[p * 2 + 1] = uy; } }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = j * w + i, up = j > 0 && m[p - w], dn = j < h - 1 && m[p + w], lf = i > 0 && m[p - 1], rt = i < w - 1 && m[p + 1];
      if (m[p]) { const c = fill(uu[p * 2], uu[p * 2 + 1], !up || !lf, !dn || !rt); if (c) UI.put(fb, x0 + i, y0 + j, c); }
      else if (ink && (up || dn || lf || rt)) UI.put(fb, x0 + i, y0 + j, ink);
    }
  }
  const redFill = (body, lt, dk) => (ux, uy, lit, shd) => (lit ? lt : shd ? dk : body);
  function oval(ux, uy, o) { return ((ux - o[0]) / o[2]) ** 2 + ((uy - o[1]) / o[3]) ** 2; }
  function arm(fb, T, A, off, rot, body, t) {
    // move the arm around its root: rotate by rot, then offset (the arms float free of the body)
    const [rx, ry] = A.root, cr = Math.cos(rot), sr = Math.sin(rot);
    const tf = ([x, y]) => { const dx = x - rx, dy = y - ry; return [rx + dx * cr - dy * sr + off[0], ry + dx * sr + dy * cr + off[1]]; };
    const bolt = A.bolt.map(tf), panel = A.panel.map(tf), [bx, by] = tf([A.btn[0], A.btn[1]]), bt = [bx, by, A.btn[2], A.btn[3]];
    const all = bolt.concat(panel), bb = [Math.min(...all.map((p) => p[0])) - 2, Math.min(...all.map((p) => p[1])) - 2, Math.max(...all.map((p) => p[0])) + 2, Math.max(...all.map((p) => p[1])) + 2];
    const inB = (x, y) => { for (let i = 0; i < 3; i++) if (segD(x, y, bolt[i][0], bolt[i][1], bolt[i + 1][0], bolt[i + 1][1]) <= 1.5) return true; return false; };
    shape(fb, T, bb, (x, y) => inB(x, y) || inPoly(panel, x, y), (x, y, lit, shd) => {
      const o = oval(x, y, bt);
      if (o <= 1) { if (o > 0.55) return C.d; if (A.grey && o < 0.26) return C.greyD; return C.btn; }
      if (o <= 1.45 && y > by) return lit ? C.l : C.ll;
      return lit ? C.l : shd ? C.d : body;
    });
  }
  function draw(fb, t) {
    if (!visible() || R.hide) { R.box = null; return; }
    const [ux, uy] = Talk.toUI(R.x, R.y - R.hop * 4);
    const k = clamp(Game.zoom / Game.US, 1, 2.4), H = Math.round(17 * k), s = H / 29;
    const X = Math.round(ux), Y = Math.round(uy);
    if (X < -60 || X > fb.w + 60 || Y < -60 || Y > fb.h + 60) { R.box = null; return; }
    R.box = { x: X - Math.round(20 * s), y: Y - Math.round(28 * s), w: Math.round(40 * s), h: Math.round(44 * s) };
    const night = Game.hour() === 'night' || Game.hour() === 'dusk';
    if (night) { const g = H * 1.3; for (let y = -g; y <= g; y++) for (let x = -g; x <= g; x++) { const d = Math.hypot(x, y) / g; if (d < 1) UI.blend(fb, X + x, Y + y, hex('#bff4ff'), 0.16 * (1 - d)); } }
    // turntable yaw (spins): the front squashes, past 90 degrees we see the back
    const yaw = R.yaw + (R.spin > 0.5 ? (t * R.spin) % (Math.PI * 2) : 0);
    const cy = Math.cos(yaw), front = cy > 0, shake = R.wet > 0.4 || (R.st === 'startle' && R.stT > 0) ? Math.round(Math.sin(t * 50)) : 0;
    const T = { X: X + shake, Y: Y + (R.sulk > 0.5 ? 1 : 0), s, cs: Math.sign(cy || 1) * Math.max(0.14, Math.abs(cy)), ct: Math.cos(TILT), st: Math.sin(TILT) };
    const body = R.wet > 0.2 ? mix(C.b, hex('#5a6ad8'), R.wet * 0.3) : C.b, lt = mix(body, C.ll, 0.55), dk = C.d;
    // the arms float around the body
    const bob = Math.sin(t * 3.2), bob2 = Math.cos(t * 3.2 + 1);
    let offR = [0.8 + bob * 0.5, bob * 1.1], offL = [-0.8 - bob2 * 0.5, bob2 * 1.1], rotR = 0, rotL = 0;
    const ouch = R.st === 'ouch' && R.stT < 1.2;
    if (R.st === 'cheer' || R.st === 'poke') { const wv = Math.sin(t * 9); rotR = -0.45 + wv * 0.2; offR = [1, -3 + wv]; rotL = 0.3 - wv * 0.2; offL = [-1, -13 - wv]; }
    else if (R.st === 'point' && R.pointAt) { const dir = Math.sign(R.pointAt[0] - R.x) || 1; if (dir * T.cs > 0) { offR = [4, -1]; rotR = 0.35; } else { offL = [-4, -2]; rotL = -0.35; } }
    else if (R.sulk > 0.5) { rotR = -0.5; offR = [0, -2]; }
    if (!ouch) { arm(fb, T, ARM_L, offL, rotL, body, t); arm(fb, T, ARM_R, offR, rotR, body, t); }
    // the tail tab
    shape(fb, T, [-3, 12, 4, 20.5], (x, y) => y > 12 && ((x - 0.5) / 3) ** 2 + ((y - 15.8) / 4.6) ** 2 <= 1, (x, y, lit, shd) => (shd ? C.dd : lit ? C.d : mix(C.d, body, 0.4)));
    // the body with its spike antenna and the fin
    const spark = R.sparks.length > 0;
    shape(fb, T, [-23, -31.5, 17.5, 15], (x, y) => inPoly(BODY, x, y), (x, y, lit, shd) => {
      if (y < -24 && spark) return C.gold;
      if (lit) return y < -14 && x > -10.4 && x < -7.4 ? C.ll : lt;
      if (shd) return dk;
      if (x > 11.6 && y < 9.5 && y > -10) return mix(body, dk, 0.35);   // the right side turns away from the light
      return body;
    });
    if (front) {
      // four little holes on the shell
      for (const [hx, hy] of [[11.2, -10.6], [12.2, -6.2], [-17.2, -2.2], [-16, 2.4]]) { const [px, py] = toPx(T, hx, hy); UI.put(fb, Math.round(px), Math.round(py), C.ink); if (s > 1.3) UI.put(fb, Math.round(px) + 1, Math.round(py), C.ink); }
      drawScreen(fb, T, t);
      // the thumb holding the screen
      if (!ouch) shape(fb, T, [7.5, 9, 15, 16.8], (x, y) => ((x - 11.2) / 3) ** 2 + ((y - 12.9) / 3.3) ** 2 <= 1, redFill(body, lt, dk));
    } else {
      // the back: a darker panel and two vents
      shape(fb, T, [-10, -9, 10, 10], (x, y) => x > -9 && x < 9.5 && y > -8 && y < 9, (x, y, lit, shd) => (lit ? C.dd : shd ? lt : C.d), 0);
      for (const hy of [-4, -1, 2]) { const [a1, b1] = toPx(T, -5, hy), [a2, b2] = toPx(T, 5, hy); UI.line(fb, Math.round(a1), Math.round(b1), Math.round(a2), Math.round(b2), C.dd); }
    }
    if (ouch) {
      // both panels pressed over its eyes
      arm(fb, T, ARM_L, [15, -17], 0.2, body, t); arm(fb, T, ARM_R, [-19, 3], -0.1, body, t);
    }
    // leaf umbrella in the rain
    if (R.sulk > 0.5 && !ouch) {
      const [hx, hy] = toPx(T, 27, -14); const ux2 = Math.round(hx), uy2 = Math.round(hy), ur = Math.round(13 * s);
      UI.vline(fb, ux2, uy2 - Math.round(12 * s), uy2, C.leafD);
      for (let y = 0; y <= Math.round(ur * 0.5); y++) { const hw = Math.round(ur * Math.sqrt(1 - (y / (ur * 0.5 + 0.5)) ** 2)); UI.hline(fb, ux2 - hw, ux2 + hw, uy2 - Math.round(12 * s) - y, y === 0 ? C.leafD : C.leaf); }
    }
    // electric sparks, drips
    for (const p of R.sparks) { const rn = U.rng(Math.floor(p.seed)); let x = X + Math.cos(p.a) * p.r * k * 0.8, y = Y + Math.sin(p.a) * p.r * k * 0.8; for (let q = 0; q < 3; q++) { const nx = x + (rn() - 0.5) * 6, ny = y + (rn() - 0.5) * 6; UI.line(fb, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), q % 2 ? C.gold : 0xffffffff); x = nx; y = ny; } }
    for (const p of R.drips) { const [dx, dy] = Talk.toUI(p.x, p.y); UI.put(fb, Math.round(dx), Math.round(dy), hex('#8ac8ff')); UI.put(fb, Math.round(dx), Math.round(dy) - 1, 0xffffffff); }
  }
  // the screen: white glass, Rotom's light-blue face with the magnifier handle, a grin, blue eyes on a dark bridge
  function drawScreen(fb, T, t) {
    const S = SCREEN, m = R.mood, blink = R.blinkT > 0;
    shape(fb, T, [S.x0 - 1, S.y0 - 1, S.x1 + 1, S.y1 + 1], (x, y) => x > S.x0 && x < S.x1 && y > S.y0 && y < S.y1 && !((x < S.x0 + 1.4 || x > S.x1 - 1.4) && (y < S.y0 + 1.4 || y > S.y1 - 1.4)), (x, y, lit, shd) => {
      const fx = x + 3.4, fy = y - 3, fr = Math.hypot(fx, fy);
      if (fr < 7.6) return fr > 6.5 ? C.faceD : C.face;
      if (segD(x, y, 3.8, 6.8, 10.2, 11) < 1.1) return C.face;               // the magnifier handle
      return shd ? C.scrD : C.scr;
    }, C.ink);
    // the dark bridge between the eyes (a half disc)
    shape(fb, T, [-7.8, -9, 2.6, -1], (x, y) => y < -2 && ((x + 2.6) / 4.5) ** 2 + ((y + 2) / 5.4) ** 2 <= 1, (x, y) => (y < -5.4 && x < -2.6 ? C.bridgeL : C.bridge), 0);
    // the grin
    const talk = R.talkT > 0 ? Math.abs(Math.sin(t * 16)) : 0, happy = m === 'happy';
    if (m === 'wow') shape(fb, T, [-5, 1.5, -1, 5.5], (x, y) => ((x + 3) / 1.6) ** 2 + ((y - 3.5) / 1.8) ** 2 <= 1, () => C.mouth, C.mouthO);
    else if (m === 'sad' || m === 'x') shape(fb, T, [-7, 2, 1, 6], (x, y) => y > 3.4 + ((x + 3) / 3.6) ** 2 * -1.2 && y < 4.6 + ((x + 3) / 3.6) ** 2 * -1.2 && Math.abs(x + 3) < 3.6, () => C.mouthO, 0);
    else {
      const w = happy ? 4.6 : 4, hgt = (happy ? 3.6 : 2.4) + talk * 1.6;
      shape(fb, T, [-8, 0, 2, 7.5], (x, y) => { const kx = (x + 3) / w; if (Math.abs(kx) > 1) return false; const top = 2.1 - kx * 0.5, bot = top + hgt * Math.sqrt(1 - kx * kx); return y >= top && y <= bot; }, (x, y) => {
        const kx = (x + 3) / w, top = 2.1 - kx * 0.5, bot = top + hgt * Math.sqrt(1 - kx * kx);
        if ((talk > 0.2 || happy) && y > top + 1.1 && y < bot - 0.9) return C.mouth;
        return Math.abs(((x + 3) % 1.9 + 1.9) % 1.9 - 0.95) < 0.22 && T.s > 0.9 ? C.scrD : 0xffffffff;
      }, C.mouthO);
    }
    // eyes: white rings, blue irises that follow what Rotom looks at
    for (const [ex, ey] of [[-8.8, -3.2], [3.6, -4]]) {
      if (blink || happy) {
        // closed / happy: a curved line (happy arcs up)
        if (happy) shape(fb, T, [ex - 5, ey - 4, ex + 5, ey + 4], (x, y) => { const kx = (x - ex) / 4.2; if (Math.abs(kx) > 1) return false; const c = ey + 1.6 - (1 - kx * kx) * 3; return Math.abs(y - c) < 1.15; }, () => 0xffffffff, C.eyeO);
        else shape(fb, T, [ex - 5, ey - 3, ex + 5, ey + 3], (x, y) => ((x - ex) / 4.4) ** 2 + ((y - ey - 0.6) / 1.3) ** 2 <= 1, (x, y) => (y > ey + 0.6 ? C.ring : 0xffffffff), C.eyeO);
        continue;
      }
      shape(fb, T, [ex - 5.5, ey - 5.5, ex + 5.5, ey + 5.5], (x, y) => ((x - ex) / 4.6) ** 2 + ((y - ey) / 4.8) ** 2 <= 1, (x, y) => {
        const dx = x - ex, dy = y - ey;
        if (m === 'x') return Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.8 && Math.abs(dx) < 2.6 ? C.eyeO : 0xffffffff;
        const ir = m === 'wow' ? 1.7 : 2.9, ix = ex + R.lx * 1.2, iy = ey + R.ly * 1.1 + (m === 'sad' ? 0.8 : 0), id = Math.hypot((x - ix) / ir, (y - iy) / (ir * 1.15));
        if (id <= 1) { if (Math.hypot(x - ix + 0.9, y - iy + 1) < 0.75) return 0xffffffff; return id > 0.72 ? C.irisD : C.iris; }
        if (m === 'sad' && dy < -2) return C.eyeO;
        return Math.hypot(dx, dy) > 3.8 ? C.ring : 0xffffffff;
      }, C.eyeO);
    }
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
