/* ------------------------------------------------------------------
   Rhythm — Guitar Jam (G). Mudkip rocks out on a seaside stage: gems
   race down a four-lane highway; hit them on the line with D F J K
   (or the arrow keys / tap the lanes). Streaks raise the multiplier,
   gold star notes charge Star Power (Space) for a flaming x2. Every
   hit plays the melody over a synthesized band; the crowd of Pokémon
   bounces, spotlights sweep, fireworks go off. Grades S..D, rewards.
------------------------------------------------------------------- */
const Rhythm = (() => {
  const { clamp, rnd, lerp, hex } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff;
  const LANE_C = [hex('#4aff7a'), hex('#ff4a5a'), hex('#ffe04a'), hex('#4aa8ff')];
  const KEYS = [['d', 'ArrowLeft'], ['f', 'ArrowDown'], ['j', 'ArrowUp'], ['k', 'ArrowRight']];
  const SONGS = [
    { name: 'Coral Cove Rock', bpm: 124, root: 57, scale: [0, 3, 5, 7, 10, 12], seed: 3, bars: 26 },
    { name: 'Treetop Groove', bpm: 108, root: 60, scale: [0, 2, 4, 7, 9, 12], seed: 11, bars: 22 },
    { name: 'Starfall Shred', bpm: 140, root: 55, scale: [0, 3, 5, 6, 7, 10, 12], seed: 29, bars: 30 },
  ];
  const R = { on: false };
  const TRAVEL = 1.6; // seconds a note takes to reach the line
  let cast = null;
  function makeCast() {
    if (cast) return cast;
    const P = Times.compile('noon'); cast = [];
    for (const st of [-1, 1, 0]) { const c = new Critters.Critter(Mudkip, { kind: 'jam-mk' + st, scale: 0.9, yaw: 1.05, pitch: 0.12, qPose: 0.01 }); c.noHD = true; c.pose = Object.assign({}, Save.look(), { neck: null, hold: 'guitar', strum: st, eyes: st ? 'happy' : 'open', mouth: st ? 1 : 0.6, headRoll: st * 0.1 }); cast.push({ c, P }); }
    return cast;
  }
  function chart(song) {
    const rng = U.rng(song.seed), beat = 60 / song.bpm, notes = [];
    let t = 2.4, lane = 1;
    for (let bar = 0; bar < song.bars; bar++) {
      const dense = bar < 2 ? 0.35 : bar > song.bars - 4 ? 0.9 : 0.55 + 0.3 * Math.sin(bar * 0.7);
      for (let s = 0; s < 8; s++) {
        const tt = t + s * beat / 2;
        if (s % 2 === 1 && rng() > dense * 0.7) continue;
        if (s % 2 === 0 && rng() > dense + 0.2) continue;
        lane = clamp(lane + Math.round((rng() - 0.5) * 2.6), 0, 3);
        const deg = clamp(lane + Math.floor(rng() * 3), 0, song.scale.length - 1);
        const star = bar % 6 === 3 && rng() < 0.5;
        notes.push({ t: tt, lane, pitch: song.root + 12 + song.scale[deg], star, hit: 0 });
        if (bar > 4 && s === 0 && rng() < 0.25) { const l2 = (lane + 2) % 4; notes.push({ t: tt, lane: l2, pitch: song.root + 12 + song.scale[Math.max(0, deg - 2)], star, hit: 0 }); }
      }
      t += beat * 4;
    }
    return { notes, end: t + 2, beat };
  }
  function open(i = 0) {
    if (Game.mode !== 'explore') return;
    const song = SONGS[i % SONGS.length];
    Object.assign(R, { on: true, song, idx: i, t: -0.6, ...chart(song), score: 0, combo: 0, maxCombo: 0, mult: 1, hits: 0, perfect: 0, miss: 0, star: 0, starOn: 0, pops: [], parts: [], lanesDown: [0, 0, 0, 0], flash: [0, 0, 0, 0], done: null, nextBeat: 0, fire: [], crowd: makeCrowd(), shake: 0 });
    Game.mode = 'rhythm'; Game.frozenFrame = false;
    if (typeof Pad !== 'undefined') Pad.reset();
    makeCast();
    if (Music.stop) Music.stop();
    Game.sfx('chime', null, 0.7);
  }
  function makeCrowd() { const c = []; const kinds = ['spheal', 'wingull', 'zigzag', 'plusle', 'swablu', 'corphish']; for (let i = 0; i < 26; i++) c.push({ x: i / 25, kind: kinds[i % kinds.length], ph: Math.random() * 6, h: 0.8 + Math.random() * 0.5 }); return c; }
  function close() { R.on = false; Game.mode = 'explore'; Game.sfx('back'); }

  /* ---------- sound: a little band ---------- */
  const ac = () => (Sound.on && Sound.ctx ? Sound.ctx() : null);
  function voice(type, f, t0, dur, vol, f1) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(Sound.sfxBus()); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hiss(t0, dur, vol, freq) {
    const c = ac(); if (!c) return;
    const s = c.createBufferSource(); s.buffer = Sound.noise(); const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f).connect(g).connect(Sound.sfxBus()); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function band(beatI) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + 0.02, song = R.song, b = R.beat;
    const bar = Math.floor(beatI / 4), inBar = beatI % 4;
    voice('sine', 110, t0, 0.16, 0.5, 45); // kick
    if (inBar === 1 || inBar === 3) hiss(t0, 0.14, 0.25, 1500); // snare
    hiss(t0 + b / 2, 0.04, 0.08, 7000); hiss(t0, 0.04, 0.1, 7000); // hats
    const prog = [0, 5, 3, 7][bar % 4];
    voice('sawtooth', N(song.root - 12 + prog), t0, b * 0.9, 0.07);
    if (inBar === 0) for (const iv of [0, 7, 12]) voice('square', N(song.root + prog + iv), t0, b * 3.6, 0.02);
  }
  function pluck(pitch, good) {
    const c = ac(); if (!c) return; const t0 = c.currentTime;
    voice('square', N(pitch), t0, 0.22, good ? 0.08 : 0.05); voice('triangle', N(pitch + 12), t0, 0.3, 0.06); if (R.starOn > 0) voice('sawtooth', N(pitch + 7), t0, 0.25, 0.04);
  }

  /* ---------- input ---------- */
  function hitLane(l) {
    if (!R.on || R.done) return;
    R.lanesDown[l] = 0.12; R.flash[l] = Math.max(R.flash[l], 0.08);
    let best = null, bd = 0.14;
    for (const n of R.notes) { if (n.hit || n.lane !== l) continue; const d = Math.abs(n.t - R.t); if (d < bd) { bd = d; best = n; } if (n.t > R.t + 0.2) break; }
    if (!best) { R.combo = 0; R.mult = 1; pop(l, 'oops', 0xffa0a4b8); const c = ac(); if (c) voice('sawtooth', 90, c.currentTime, 0.12, 0.05); return; }
    const q = bd < 0.045 ? 'PERFECT!' : bd < 0.09 ? 'GREAT' : 'GOOD';
    best.hit = q === 'PERFECT!' ? 3 : q === 'GREAT' ? 2 : 1;
    R.hits++; if (best.hit === 3) R.perfect++;
    R.combo++; R.maxCombo = Math.max(R.maxCombo, R.combo); R.mult = Math.min(4, 1 + Math.floor(R.combo / 10));
    R.score += [0, 50, 80, 100][best.hit] * R.mult * (R.starOn > 0 ? 2 : 1);
    if (best.star) R.star = Math.min(1, R.star + 0.25);
    R.flash[l] = 0.25;
    pluck(best.pitch, best.hit >= 2);
    pop(l, q, best.hit === 3 ? 0xff5affff : best.hit === 2 ? 0xff5aff9a : 0xffffffff);
    burst(l, best.star ? 26 : 12, best.star ? 0xff3ad8ff : LANE_C[l]);
    if (R.combo % 25 === 0) { R.fire.push({ t: 0, x: Math.random() }); Game.sfx('sparkle', null, 0.6); }
  }
  function key(k, e) {
    if (R.done) { if (k === ' ' || k === 'Enter' || k === 'Escape') { if (k !== 'Escape' && R.done.t > 1) { open((R.idx + 1)); return; } close(); } return; }
    if (k === 'Escape') { finish(); return; }
    if (k === ' ') { if (R.star >= 0.5 && R.starOn <= 0) { R.starOn = 8 * R.star; R.star = 0; Game.sfx('evolve', null, 0.3); R.shake = 4; } return; }
    if (e && e.repeat) return;
    for (let l = 0; l < 4; l++) if (KEYS[l].includes(k)) hitLane(l);
  }
  function down(ux, uy, fb) {
    if (R.done) { if (R.done.t > 1) close(); return true; }
    const L = R.L; if (!L) return true;
    if (uy < L.hy - 60) { if (R.star >= 0.5 && R.starOn <= 0) key(' '); return true; }
    const l = clamp(Math.floor((ux - (L.cx - L.bw * 2)) / L.bw), 0, 3); hitLane(l);
    return true;
  }
  function pop(l, text, col) { R.pops.push({ l, text, col, t: 0 }); }
  function burst(l, n, col) { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 60 + Math.random() * 140; R.parts.push({ l, x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.5 + Math.random() * 0.4, col }); } }
  function finish() {
    const tot = R.notes.length || 1, acc = R.hits / tot;
    const grade = acc > 0.95 && R.perfect / tot > 0.6 ? 'S' : acc > 0.85 ? 'A' : acc > 0.7 ? 'B' : acc > 0.5 ? 'C' : 'D';
    R.done = { t: 0, acc, grade };
    const pts = Math.round(R.score / 20);
    Save.addPoints(pts);
    const best = (Save.data.jam || (Save.data.jam = {}));
    if (!best[R.song.name] || best[R.song.name] < R.score) best[R.song.name] = R.score;
    if ((grade === 'S' || grade === 'A') && !Save.has('hat.headphones')) { const r = Rewards.grant('hat.headphones'); if (r) { Quests.Q.pops.push({ t: 0, life: 4.2, text: 'Guitar Jam: ' + grade + ' rank!', reward: r }); Quests.Q.unseenN++; } }
    if (grade === 'S' && !Save.has('glasses.rock')) Rewards.grant('glasses.rock');
    Save.save();
    Game.sfx(grade === 'S' || grade === 'A' ? 'reward' : 'chime', null, 0.8);
  }
  function update(dt) {
    if (!R.on) return;
    if (R.done) { R.done.t += dt; return; }
    const prevT = R.t; R.t += dt;
    const bi = Math.floor(R.t / R.beat);
    if (R.t >= 0 && bi >= R.nextBeat) { R.nextBeat = bi + 1; band(bi); }
    for (const n of R.notes) { if (!n.hit && n.t < R.t - 0.15) { n.hit = -1; R.miss++; R.combo = 0; R.mult = 1; pop(n.lane, 'MISS', 0xff5a5aff); } if (n.t > R.t) break; }
    for (let l = 0; l < 4; l++) { R.lanesDown[l] = Math.max(0, R.lanesDown[l] - dt); R.flash[l] = Math.max(0, R.flash[l] - dt); }
    for (const p of R.pops) p.t += dt; R.pops = R.pops.filter((p) => p.t < 0.6);
    for (const p of R.parts) { p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } R.parts = R.parts.filter((p) => p.t < p.life);
    for (const f of R.fire) f.t += dt; R.fire = R.fire.filter((f) => f.t < 1.6);
    R.starOn = Math.max(0, R.starOn - dt); R.shake = Math.max(0, R.shake - dt * 8);
    if (cast) for (const e of cast) if (!e.c.spr) e.c.sprite(e.P);
    if (R.t > R.end) finish();
    void prevT;
  }

  /* ---------- drawing ---------- */
  function draw(fb, t) {
    if (!R.on) return;
    const W = fb.w, H = fb.h, d = fb.d;
    const beatK = R.t > 0 ? 1 - ((R.t / R.beat) % 1) : 0;
    // backdrop: night sky, sea, stage lights
    for (let y = 0; y < H; y++) { const k = y / H; const c = U.mix(hex('#0a0620'), hex('#3a1450'), k * 0.8 + beatK * 0.06); d.fill(c, y * W, y * W + W); }
    for (let i = 0; i < 60; i++) UI.blend(fb, (U.hash(i, 5, 1) * W) | 0, (U.hash(i, 5, 2) * H * 0.4) | 0, WHITE, 0.4 + 0.4 * Math.sin(t * 2 + i));
    // spotlights
    const cols = [hex('#ff4ad8'), hex('#4ad8ff'), hex('#ffe04a'), hex('#7aff9a')];
    for (let s = 0; s < 4; s++) {
      const bx = W * (0.15 + s * 0.23), ang = Math.sin(t * (0.7 + s * 0.2) + s) * 0.5;
      for (let y = 0; y < H * 0.8; y += 1) { const x = bx + Math.sin(ang) * y, w = 3 + y * 0.12; for (let xx = -w; xx <= w; xx += 1) UI.blend(fb, (x + xx) | 0, y, cols[s], 0.05 * (1 - y / (H * 0.8)) * (1 + beatK)); }
    }
    // fireworks
    for (const f of R.fire) { const fx = W * (0.15 + f.x * 0.7), fy = H * 0.2, r = f.t * 90; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; UI.blend(fb, (fx + Math.cos(a) * r) | 0, (fy + Math.sin(a) * r + f.t * f.t * 20) | 0, cols[i % 4], 1 - f.t / 1.6); } }
    // highway in perspective
    const cx = W / 2, hy = Math.round(H * 0.8), topY = Math.round(H * 0.12), bw = Math.min(56, Math.round(W * 0.09)), topW = bw * 0.28;
    R.L = { cx, hy, bw };
    for (let y = topY; y < H; y++) {
      const k = (y - topY) / (hy - topY), half = lerp(topW * 2, bw * 2, k);
      for (let x = Math.round(cx - half); x < cx + half; x++) {
        const lane = Math.floor(((x - (cx - half)) / (half * 2)) * 4), edge = Math.abs(((x - (cx - half)) / (half * 2)) * 4 - Math.round(((x - (cx - half)) / (half * 2)) * 4)) < 0.03;
        const stripe = Math.floor((k * 12 - R.t * 3) % 2 + 2) % 2 === 0;
        let c = edge ? 0xff8a7aa0 : U.mix(hex('#141024'), hex('#221a3a'), stripe ? 0.5 : 0);
        if (R.starOn > 0) c = U.mix(c, hex('#ff8a2a'), 0.2 + 0.15 * Math.sin(y * 0.3 + t * 20));
        if (R.flash[lane] > 0) c = U.mix(c, LANE_C[lane], R.flash[lane] * 1.5 * k);
        UI.put(fb, x, y, c);
      }
    }
    // notes
    const toScreen = (lane, dt) => { const k = clamp(1 - dt / TRAVEL, -0.2, 1.15), y = lerp(topY, hy, k * k * 0.6 + k * 0.4), half = lerp(topW * 2, bw * 2, (y - topY) / (hy - topY)); return [cx - half + (lane + 0.5) * (half / 2), y, (half / 2) / bw]; };
    for (const n of R.notes) {
      const dtn = n.t - R.t; if (dtn > TRAVEL) break; if (n.hit > 0 || dtn < -0.3) continue;
      const [x, y, s] = toScreen(n.lane, dtn), r = Math.max(2, Math.round(bw * 0.34 * s));
      const col = n.star ? hex('#ffe060') : LANE_C[n.lane];
      UI.disc(fb, Math.round(x), Math.round(y) + 2, r, 0xff05030a); UI.orb(fb, Math.round(x), Math.round(y), r, col, { ol: n.hit < 0 ? 0xff404040 : WHITE });
      if (n.star) Font.icon(fb, 'star', Math.round(x) - 3, Math.round(y) - 3, 1);
    }
    // strike buttons
    for (let l = 0; l < 4; l++) {
      const x = Math.round(cx - bw * 2 + (l + 0.5) * bw), r = Math.round(bw * 0.38), dn = R.lanesDown[l] > 0;
      UI.disc(fb, x, hy + 2, r + 2, 0xff05030a); UI.ring(fb, x, hy, r + 1, WHITE, 2); UI.disc(fb, x, hy, r - 2, dn ? LANE_C[l] : U.mix(LANE_C[l], 0xff000000, 0.6));
      Font.draw(fb, KEYS[l][0].toUpperCase(), x, hy + r + 5, WHITE, { font: 'small', align: 'center', outline: INK });
      if (R.flash[l] > 0.1) for (let j = 0; j < 16; j++) UI.blend(fb, x - 1 + (j % 3), hy - 10 - j * 3, LANE_C[l], R.flash[l] * 2);
    }
    for (const p of R.parts) { const x = Math.round(cx - bw * 2 + (p.l + 0.5) * bw + p.x), y = Math.round(hy + p.y); UI.put(fb, x, y, p.col); UI.put(fb, x + 1, y, p.col); }
    for (const p of R.pops) { const x = Math.round(cx - bw * 2 + (p.l + 0.5) * bw), y = Math.round(hy - 30 - p.t * 40); Font.draw(fb, p.text, x, y, p.col, { font: 'small', align: 'center', outline: INK }); }
    // Mudkip shredding on the left, the crowd bouncing below
    const strum = R.lanesDown.some((v) => v > 0) ? (Math.floor(t * 12) % 2 ? 0 : 1) : 2;
    const ms = cast && cast[strum] ? cast[strum].c.spr : null;
    if (ms) { const bob = Math.round(-beatK * 6), mx = Math.round(W * 0.16 - ms.w / 2), my = Math.round(H * 0.72 - ms.h + bob); for (let y = 0; y < ms.h; y++) for (let x = 0; x < ms.w; x++) { const c = ms.d[y * ms.w + x]; if (c) UI.put(fb, mx + x, my + y, R.starOn > 0 ? U.mix(c, hex('#ffb04a'), 0.25) : c); } }
    for (const c of R.crowd) { const x = Math.round(c.x * W), bump = Math.round(Math.abs(Math.sin(R.t * Math.PI / R.beat + c.ph)) * 6 * (R.combo > 5 ? 1.4 : 0.6)), y = H - 4 - bump, r = Math.round(9 * c.h); UI.disc(fb, x, y, r, 0xff0a0616); UI.disc(fb, x - r + 2, y - r + 1, 3, 0xff0a0616); UI.disc(fb, x + r - 2, y - r + 1, 3, 0xff0a0616); if (Math.sin(t * 3 + c.ph) > 0.6) { UI.put(fb, x - 3, y - 2, WHITE); UI.put(fb, x + 3, y - 2, WHITE); } }
    // HUD: song, score, combo, multiplier, star power
    Font.draw(fb, R.song.name, 10, 8, WHITE, { font: 'title', outline: INK });
    Font.draw(fb, String(R.score).padStart(7, '0'), W - 10, 8, hex('#ffe060'), { font: 'title', align: 'right', outline: INK });
    if (R.combo > 2) Font.draw(fb, R.combo + ' COMBO', W - 10, 26, WHITE, { font: 'body', align: 'right', outline: INK });
    UI.disc(fb, W - 26, 56, 13, INK); UI.ring(fb, W - 26, 56, 12, R.mult >= 4 ? hex('#ff4ad8') : R.mult >= 3 ? hex('#4aff7a') : R.mult >= 2 ? hex('#ffe04a') : WHITE, 3); Font.draw(fb, 'x' + R.mult * (R.starOn > 0 ? 2 : 1), W - 26, 51, WHITE, { font: 'small', align: 'center' });
    UI.rrect(fb, 10, 28, 90, 8, 3, INK); UI.rrect(fb, 11, 29, Math.round(88 * R.star), 6, 2, R.starOn > 0 ? hex('#ff8a2a') : hex('#4ad8ff'));
    Font.draw(fb, R.star >= 0.5 ? 'STAR POWER READY! (Space)' : R.starOn > 0 ? 'STAR POWER x2!' : 'star power', 10, 40, R.star >= 0.5 ? hex('#ffe060') : 0xffa0a4c8, { font: 'small', outline: INK });
    if (R.t < 0.8) Font.draw(fb, 'D F J K  or  arrows  ·  tap the lanes', W / 2, H * 0.45, WHITE, { font: 'title', align: 'center', outline: INK });
    if (R.shake > 0) { const src = d.slice(), s = Math.round(R.shake); for (let i = 0; i < d.length; i++) d[i] = src[Math.min(d.length - 1, i + s)]; }
    if (R.done) {
      const k = Math.min(1, R.done.t / 0.4), w = Math.min(W - 40, 300), h = 150, x = Math.round((W - w) / 2), y = Math.round(H / 2 - h / 2 + (1 - k) * 60);
      UI.rrect(fb, x, y + 4, w, h, 10, 0xff05030a); UI.rrect(fb, x, y, w, h, 10, WHITE); UI.rrect(fb, x + 2, y + 2, w - 4, h - 4, 8, hex('#221a3a'));
      Font.draw(fb, 'SONG COMPLETE', x + w / 2, y + 10, WHITE, { font: 'title', align: 'center' });
      const gc = { S: hex('#ffd23a'), A: hex('#5aff9a'), B: hex('#5ad0ff'), C: hex('#ff9ab8'), D: hex('#c0c4d0') }[R.done.grade];
      Font.draw(fb, R.done.grade, x + w - 46, y + 44, gc, { font: 'title', align: 'center', sc: 3 });
      [['Score', String(R.score)], ['Accuracy', Math.round(R.done.acc * 100) + '%'], ['Max combo', String(R.maxCombo)], ['Perfect', String(R.perfect)]].forEach(([a, b], i) => { Font.draw(fb, a, x + 16, y + 36 + i * 16, 0xffc8c0e8, { font: 'body' }); Font.draw(fb, b, x + 150, y + 36 + i * 16, WHITE, { font: 'body', align: 'right' }); });
      if (R.done.t > 1) Font.draw(fb, 'Space: next song   Esc: back', x + w / 2, y + h - 16, 0xffa0a4c8, { font: 'small', align: 'center' });
    }
  }
  return Object.assign(R, { open, close, update, draw, key, down, wheel() {}, SONGS });
})();
