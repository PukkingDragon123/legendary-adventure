/* ------------------------------------------------------------------
   Music — the player's songs (streamed MP3s next to the page), a
   magical spinning vinyl record in the UI with green & pink sparkles,
   glowing notes and the song's name, and Meloetta, who pops out of the
   record when you tap it, floats around the interface, dances, sings
   and dives back in. Beat energy comes from an analyser when the page
   is served over http(s), otherwise from the song's tempo.
------------------------------------------------------------------- */
const Music = (() => {
  const { clamp, lerp, rnd, mix, hex } = U;
  const TRACKS = {
    crossing: { file: 'music/crossing-the-sea.mp3', title: 'Crossing the Sea', from: 'Pokémon Ruby & Sapphire', bpm: 124, tint: '#5ad0ff' },
    lake: { file: 'music/lake-theme.mp3', title: 'Lake Theme', from: 'Pokémon Diamond & Pearl', bpm: 96, tint: '#7affc0' },
    space: { file: 'music/flight-to-space.mp3', title: 'Flight to Space', from: 'Pokémon Omega Ruby & Alpha Sapphire', bpm: 140, tint: '#c8a0ff' },
  };
  const ORDER = ['crossing', 'lake', 'space'];
  const M = {
    cur: null, want: null, el: null, vol: 0, target: 0.62, playing: false, failed: {}, unlocked: false,
    ang: 0, spin: 0, energy: 0, beat: 0, lastBeat: 0, notes: [], sparks: [], melo: null, hoverRec: false,
    ac: null, an: null, data: null, routed: false, marq: 0, showT: 0, rect: null,
  };
  function el() {
    if (M.el) return M.el;
    const a = new Audio();
    a.preload = 'none'; a.loop = false; // (no crossOrigin: file:// pages must still play it)
    a.addEventListener('ended', () => { a.currentTime = 0; if (M.want) a.play().catch(() => {}); });
    a.addEventListener('error', () => { if (M.cur) { M.failed[M.cur] = true; M.playing = false; Sound.synthMusic(true); } });
    a.addEventListener('playing', () => { M.playing = true; if (M.cur) M.failed[M.cur] = false; Sound.synthMusic(false); });
    M.el = a;
    return a;
  }
  // route through WebAudio for beat analysis when it is safe (same-origin http(s); file:// would silence it)
  function route() {
    if (M.routed || location.protocol === 'file:') return;
    const ac = Sound.ctx();
    if (!ac) return;
    try {
      const src = ac.createMediaElementSource(el());
      const an = ac.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.6;
      src.connect(an); an.connect(ac.destination);
      M.an = an; M.data = new Uint8Array(an.frequencyBinCount); M.routed = true;
    } catch (e) { M.routed = true; }
  }
  function unlock() {
    if (M.unlocked) return;
    M.unlocked = true;
    Sound.init();
    const a = el();
    if (M.want && Sound.on) { start(M.want); return; }
    // iOS: an element that has played once during a gesture can be started later without one
    try { a.muted = true; a.play().then(() => { if (!(Sound.on && M.want && M.playing)) a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); } catch (e) { a.muted = false; }
  }
  function start(id) {
    const T = TRACKS[id]; if (!T) return;
    const a = el();
    // beat visuals use the song's tempo rather than an analyser: routing <audio> through WebAudio can silence it in sandboxed or file:// pages
    if (M.loaded !== id) { M.loaded = id; a.src = T.file; M.showT = 5; M.marq = 0; }
    M.cur = id;
    if (Sound.on && M.unlocked) { a.volume = M.vol; a.play().catch(() => { M.playing = false; }); }
  }
  // an area asks for its song (cross-fades)
  function areaTrack(id) {
    M.want = id || null;
    if (!id) { M.target = 0; return; }
    if (M.cur === id && M.playing) return;
    if (M.cur && M.playing && M.cur !== id) { M.fadeTo = id; M.target = 0; return; }
    M.target = 0.62;
    if (M.unlocked && Sound.on) start(id);
    else M.cur = id;
  }
  function play(id) { M.want = id; M.fadeTo = null; M.target = 0.62; start(id); }
  function next() { const i = (ORDER.indexOf(M.cur) + 1) % ORDER.length; M.fadeTo = ORDER[i]; M.want = ORDER[i]; M.target = 0; if (!M.playing) play(ORDER[i]); Game.sfx('scratch'); }
  function onSound(v) { const a = el(); if (!v) a.pause(); else if (M.want) start(M.want); }
  function strum() {}
  function update(dt) {
    const a = M.el;
    // fades / cross-fades
    if (a) {
      const tgt = Sound.on ? M.target : 0;
      M.vol = clamp(M.vol + clamp(tgt - M.vol, -dt * 0.9, dt * 0.9), 0, 1);
      if (M.fadeTo && M.vol <= 0.01) { const id = M.fadeTo; M.fadeTo = null; M.target = 0.62; a.pause(); start(id); }
      // gentle fade near the end of a song, then it starts over
      if (a.duration && isFinite(a.duration) && a.duration - a.currentTime < 3 && M.playing) a.volume = M.vol * clamp((a.duration - a.currentTime) / 3, 0, 1);
      else try { a.volume = M.vol; } catch (e) { /* iOS ignores volume */ }
      M.playing = M.playing && !a.paused;
    }
    const T = TRACKS[M.cur];
    // beat energy
    let e = 0;
    if (M.an && M.playing) {
      M.an.getByteFrequencyData(M.data);
      let lo = 0; for (let i = 1; i < 8; i++) lo += M.data[i];
      e = lo / (7 * 255);
    } else if (M.playing && T) {
      const ph = ((a.currentTime * T.bpm) / 60) % 1;
      e = 0.35 + 0.5 * Math.pow(1 - ph, 3);
    }
    M.energy = lerp(M.energy, e, clamp(dt * 12, 0, 1));
    if (M.playing && M.energy > 0.55 && Game.rt - M.lastBeat > 0.25) { M.lastBeat = Game.rt; M.beat = 1; }
    M.beat = Math.max(0, M.beat - dt * 4);
    // record spin (33⅓ rpm ≈ 3.5 rad/s), coasts to a stop when paused
    M.spin = lerp(M.spin, M.playing ? 3.5 : 0, clamp(dt * 2, 0, 1));
    M.ang += M.spin * dt;
    M.showT = Math.max(0, M.showT - dt); M.marq += dt;
    // magic motes and notes around the record
    if (M.playing && M.rect) {
      const { x, y } = M.rect;
      if (Math.random() < dt * (3 + M.energy * 8)) M.notes.push({ x: x + rnd(-8, 8), y: y - 6, vx: rnd(-10, 10), vy: -rnd(14, 26), t: 0, life: rnd(1.4, 2.4), c: Math.random() < 0.5 ? hex('#ff7ac8') : hex('#6affb0'), k: Math.random() < 0.5 ? 'note' : 'note2', ph: Math.random() * 6 });
      if (Math.random() < dt * (10 + M.energy * 20)) { const a2 = Math.random() * 6.28, r = 20 + Math.random() * 8; M.sparks.push({ a: a2, r, t: 0, life: rnd(0.6, 1.2), c: Math.random() < 0.5 ? hex('#ff9ad8') : hex('#8affc8'), sp: rnd(1, 2.5) }); }
    }
    for (const n of M.notes) { n.t += dt; n.x += (n.vx + Math.sin(n.t * 3 + n.ph) * 10) * dt; n.y += n.vy * dt; }
    M.notes = M.notes.filter((n) => n.t < n.life);
    for (const s of M.sparks) { s.t += dt; s.a += s.sp * dt; }
    M.sparks = M.sparks.filter((s) => s.t < s.life);
    if (M.melo) Melo.update(dt);
  }

  /* ---------- the record + song label ---------- */
  const NOTE = ['..kk', '..kk', '..k.', '..k.', 'kkk.', 'kkk.'];
  const NOTE2 = ['.kkkk', '.k..k', '.k..k', 'kk.kk', 'kk.kk'];
  function drawUI(fb, t, mode) {
    const T = TRACKS[M.cur];
    if (!T || (!M.playing && M.spin < 0.05 && !M.melo)) { M.rect = null; if (M.melo) Melo.draw(fb, t); return; }
    const R = 15;
    const cx = mode === 'camera' ? 74 : fb.w - 24, cy = mode === 'camera' ? 36 : 54;
    M.rect = { x: cx, y: cy, r: R };
    const pulse = M.beat, E = M.energy;
    // aura: pink + green glow rings
    for (let y = -R - 12; y <= R + 12; y++) for (let x = -R - 12; x <= R + 12; x++) {
      const d = Math.hypot(x, y); if (d <= R || d > R + 12) continue;
      const a = Math.atan2(y, x);
      const k = (1 - (d - R) / 12) * (0.35 + 0.35 * E + 0.3 * pulse);
      const c = Math.sin(a * 2 + M.ang * 0.7) > 0 ? 0xffff7ac8 : 0xff6affb0;
      const i = (cy + y) * fb.w + (cx + x);
      if (cx + x < 0 || cy + y < 0 || cx + x >= fb.w || cy + y >= fb.h) continue;
      if (k > U.bayer4(x, y) * 0.9) fb.d[i] = fb.d[i] ? U.mix(fb.d[i], c, k * 0.6) : (((Math.round(k * 150)) << 24) | (c & 0xffffff)) >>> 0;
    }
    // orbiting sparkles
    for (const s of M.sparks) { const x = Math.round(cx + Math.cos(s.a) * s.r), y = Math.round(cy + Math.sin(s.a) * s.r * 0.9); const k = Math.sin((s.t / s.life) * Math.PI); UI.put(fb, x, y, U.mix(s.c, 0xffffffff, 0.4)); if (k > 0.6) { UI.put(fb, x + 1, y, s.c); UI.put(fb, x - 1, y, s.c); UI.put(fb, x, y + 1, s.c); UI.put(fb, x, y - 1, s.c); } }
    // vinyl: grooves, rotating shimmer, label with Meloetta's music-note mark
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y); if (d > R + 0.4) continue;
      let c;
      if (d > R - 0.6) c = 0xff05050a;
      else if (d < 6.2) {
        // label: split pink / green, rotating
        const a = Math.atan2(y, x) - M.ang;
        c = Math.cos(a) > 0 ? 0xffff6ab8 : 0xff4ae8a0;
        if (d < 1.3) c = 0xff101018;
        else if (d > 5.2) c = 0xfff8f0ff;
      } else {
        const g = Math.floor(d * 1.6) % 2;
        c = g ? 0xff1c1a26 : 0xff2a2836;
        // shimmer band sweeping around with the spin
        const a = Math.atan2(y, x) - M.ang * 1;
        const sh = Math.max(0, Math.cos(a * 2)) ** 6;
        if (sh > 0.25) c = U.mix(c, Math.cos(a) > 0 ? 0xffff9ad8 : 0xff9affd0, sh * 0.55);
        // fixed highlight (light from the upper left)
        if (x + y < -R * 0.7 && d > R * 0.55 && d < R * 0.85) c = U.mix(c, 0xffffffff, 0.35);
      }
      UI.put(fb, cx + x, cy + y, c);
    }
    // a tiny note printed on the label turns with the record
    { const a = M.ang, lx = cx + Math.round(Math.cos(a) * 2.5), ly = cy + Math.round(Math.sin(a) * 2.5); UI.put(fb, lx, ly, 0xff201830); UI.put(fb, lx, ly - 1, 0xff201830); }
    // tone arm
    UI.line(fb, cx + R + 4, cy - R - 2, cx + R - 2, cy - 2, 0xffd8dce8); UI.line(fb, cx + R + 5, cy - R - 2, cx + R - 1, cy - 2, 0xff8a90a0);
    UI.disc(fb, cx + R + 4, cy - R - 2, 2, 0xffb8bcc8); UI.rect(fb, cx + R - 4, cy - 3, 3, 3, 0xff5a6070);
    // glowing notes floating up
    for (const n of M.notes) {
      const k = 1 - n.t / n.life, m = n.k === 'note' ? NOTE : NOTE2;
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c] === 'k') {
        const x = Math.round(n.x) + c, y = Math.round(n.y) + r;
        if (k > U.bayer4(x, y) * 0.8) UI.put(fb, x, y, U.mix(n.c, 0xffffffff, 0.25 + 0.3 * Math.sin(n.t * 8)));
      }
    }
    // song label: title + game + little equaliser
    const title = T.title, sub = T.from;
    const tw = Math.max(Font.measure('{note} ' + title, 'body'), Font.measure(sub, 'small')) + 14;
    const show = M.showT > 0 || M.hoverRec || mode === 'explore';
    if (show) {
      const px = cx + R + 8, py = cy - 12, pw = Math.min(tw, fb.w - px - 90), ph = 24;
      UI.rectA(fb, px, py, pw, ph, 0xff120e22, 0.72);
      UI.hline(fb, px, px + pw - 1, py, 0xffff7ac8); UI.hline(fb, px, px + pw - 1, py + ph - 1, 0xff6affb0);
      const clip = { x0: px + 2, y0: py, x1: px + pw - 2, y1: py + ph };
      const over = Font.measure('{note} ' + title, 'body') - (pw - 12);
      const off = over > 0 ? Math.round(((Math.sin(M.marq * 0.5) + 1) / 2) * over) : 0;
      Font.draw(fb, '{note} ' + title, px + 5 - off, py + 6, 0xffffffff, { font: 'body', clip });
      Font.draw(fb, sub, px + 5, py + 16, 0xffb8c8e8, { font: 'small', clip });
      // equaliser bars
      for (let k = 0; k < 5; k++) {
        const h = M.an && M.data ? Math.round((M.data[2 + k * 5] / 255) * 9) : Math.round((0.3 + 0.7 * Math.abs(Math.sin(t * (3 + k) + k))) * E * 9);
        UI.rect(fb, px + pw - 14 + k * 2, py + ph - 3 - h, 1, h, k % 2 ? 0xff6affb0 : 0xffff7ac8);
      }
    }
    HUD.btn('vinyl', cx - R - 4, cy - R - 4, R * 2 + 8, R * 2 + 8, () => tapRecord());
    HUD.btn('vnext', cx + R + 8, cy - 12, show ? tw : 0, 24, () => next());
    if (M.melo) Melo.draw(fb, t);
  }
  function tapRecord() {
    if (M.melo || !M.rect) return;
    Game.sfx('scratch');
    if (typeof Meloetta === 'undefined') { for (let i = 0; i < 10; i++) M.notes.push({ x: M.rect.x + rnd(-10, 10), y: M.rect.y, vx: rnd(-30, 30), vy: -rnd(30, 60), t: 0, life: 2, c: i % 2 ? hex('#ff7ac8') : hex('#6affb0'), k: 'note', ph: i }); return; }
    M.melo = Melo.start(M.rect);
    if (Save.discover('meloetta.record')) setTimeout(() => HUD.toast('Meloetta lives inside the music!', { life: 3 }), 400);
  }

  /* ---------- Meloetta out of the record ---------- */
  const Melo = (() => {
    const cache = new Map();
    let st = null;
    function spriteFor(pose, yaw) {
      const key = JSON.stringify(pose) + '|' + yaw.toFixed(2);
      let s = cache.get(key);
      if (s) return s;
      const sp = Meloetta, sc = 0.34, m = sp.meta;
      const W = Math.ceil(m.bw * sc), H = Math.ceil(m.bh * sc);
      const P = Times.compile('noon');
      const r = sp.render(sp.build(Object.assign({ side: Math.cos(yaw) }, pose)), { yaw, pitch: 0.12, scale: sc, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: sp.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
      s = r.buf; s.ox = W >> 1; s.oy = Math.floor(H * m.oy);
      if (cache.size > 160) cache.delete(cache.keys().next().value);
      cache.set(key, s);
      return s;
    }
    function start(rect) {
      st = { t: 0, x: rect.x, y: rect.y, x0: rect.x, y0: rect.y, phase: 'rise', path: [], trail: [], sing: 0 };
      // a looping path around the interface
      const W = Game.UW, H = Game.UH;
      st.path = [[rect.x, rect.y - 30], [W * 0.3, H * 0.35], [W * 0.55, H * 0.22], [W * 0.78, H * 0.4], [W * 0.6, H * 0.62], [W * 0.35, H * 0.55], [rect.x + 10, rect.y - 40], [rect.x, rect.y]];
      SFX.sparkle(); voice(0);
      return st;
    }
    function bez(p, u) {
      // Catmull-Rom through the path points
      const n = p.length - 1, f = clamp(u, 0, 0.9999) * n, i = Math.floor(f), t = f - i;
      const P0 = p[Math.max(0, i - 1)], P1 = p[i], P2 = p[Math.min(n, i + 1)], P3 = p[Math.min(n, i + 2)];
      const q = (k) => 0.5 * (2 * P1[k] + (-P0[k] + P2[k]) * t + (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * t * t + (-P0[k] + 3 * P1[k] - 3 * P2[k] + P3[k]) * t * t * t);
      return [q(0), q(1)];
    }
    const DUR = 11;
    function update(dt) {
      if (!st) return;
      st.t += dt;
      const u = st.t / DUR;
      [st.x, st.y] = bez(st.path, U.ease.inOut(clamp(u, 0, 1)));
      st.trail.push([st.x, st.y, st.t]); if (st.trail.length > 26) st.trail.shift();
      // sing phrases at a few points of the flight
      for (const [k, at] of [[1, 2.2], [2, 5.0], [3, 7.8]]) if (st.t - dt < at && st.t >= at) voice(k);
      if (Math.random() < dt * 8) M.notes.push({ x: st.x + rnd(-6, 6), y: st.y - 20, vx: rnd(-20, 20), vy: -rnd(10, 30), t: 0, life: 1.6, c: Math.random() < 0.5 ? hex('#ff7ac8') : hex('#6affb0'), k: Math.random() < 0.5 ? 'note' : 'note2', ph: Math.random() * 6 });
      if (st.t >= DUR) { st = null; M.melo = null; SFX.sparkle(); for (let i = 0; i < 12; i++) M.sparks.push({ a: Math.random() * 6.28, r: 10 + Math.random() * 14, t: 0, life: 0.9, c: i % 2 ? hex('#ff9ad8') : hex('#8affc8'), sp: 3 }); }
    }
    function draw(fb, t) {
      if (!st) return;
      const u = st.t / DUR;
      // sparkle trail
      for (const [x, y, tt] of st.trail) { const k = 1 - (st.t - tt) / 0.6; if (k <= 0) continue; UI.put(fb, Math.round(x + Math.sin(tt * 20) * 3), Math.round(y - 14), U.mix(Math.sin(tt * 9) > 0 ? 0xffff9ad8 : 0xff8affc8, 0xffffffff, 1 - k)); }
      // dance: arms, pirouette spin, singing mouth
      const sing = [2.2, 5.0, 7.8].some((a) => st.t > a && st.t < a + 1.4);
      const spin = (st.t > 3.4 && st.t < 4.6) || (st.t > 8.8 && st.t < 9.8) ? (st.t * 9) % (Math.PI * 2) : 0;
      const pose = {
        armN: Math.round(Math.sin(st.t * 3) * 4) / 4, armF: Math.round(Math.sin(st.t * 3 + 2) * 4) / 4,
        hair: Math.round(Math.sin(st.t * 2.4) * 4) / 4, legs: Math.round((0.5 + 0.5 * Math.sin(st.t * 4)) * 4) / 4,
        mouth: sing ? 1 : 0.2, eyes: sing ? 'closed' : 'happy', tilt: Math.round(Math.sin(st.t * 1.7) * 3) / 6,
      };
      const yaw = spin ? Math.round((1.3 + spin) * 8) / 8 : Math.round((Math.PI / 2 + Math.sin(st.t * 0.9) * 0.6) * 8) / 8;
      if (st.t < 0.9) pose.legs = 0;
      const s = spriteFor(pose, yaw);
      // rise out of / sink into the record (clipped at the record's top edge)
      const grow = clamp(Math.min(st.t / 0.9, (DUR - st.t) / 0.8), 0, 1);
      const bob = Math.sin(st.t * 3) * 2;
      const x = Math.round(st.x - s.ox), y = Math.round(st.y - s.oy + bob);
      const cut = u < 0.1 || u > 0.92 ? Math.round(M.rect ? M.rect.y : 1e9) : 1e9;
      // soft glow behind her
      UI.disc(fb, Math.round(st.x), Math.round(st.y - s.h * 0.45), 1, 0xffffffff);
      for (let yy = 0; yy < s.h; yy++) {
        const ty = y + yy; if (ty > cut) continue;
        if (grow < 1 && yy < s.h * (1 - grow)) continue;
        for (let xx = 0; xx < s.w; xx++) { const c = s.d[yy * s.w + xx]; if (c) UI.put(fb, x + xx, ty, c); }
      }
      if (sing) Font.draw(fb, '{note}', Math.round(st.x + 10), Math.round(st.y - s.h - 4 + Math.sin(st.t * 6) * 2), 0xffffffff, { font: 'body' });
    }
    // Meloetta's voice: a little sung phrase (two-formant vowel with vibrato), pentatonic so it sits over any song
    function voice(k) {
      if (!Sound.on || !Sound.ctx()) return;
      const ac = Sound.ctx(), t0 = ac.currentTime + 0.05;
      const PH = [[76, 79, 84], [79, 81, 84, 88, 84], [84, 81, 79, 76, 79], [88, 84, 81, 79, 76, 72]][k] || [76];
      const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
      const out = ac.createGain(); out.gain.value = 0.12; out.connect(Sound.sfxBus());
      PH.forEach((n, i) => {
        const t = t0 + i * 0.22, d = 0.26;
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(N(n), t);
        const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.5; vg.gain.value = N(n) * 0.012; vib.connect(vg).connect(o.frequency);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        const mk = (f, q) => { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
        const f1 = mk(i % 2 ? 750 : 450, 6), f2 = mk(i % 2 ? 1200 : 900, 8), mixG = ac.createGain(); mixG.gain.value = 1.6;
        o.connect(f1).connect(mixG); o.connect(f2).connect(mixG); mixG.connect(g).connect(out);
        o.start(t); vib.start(t); o.stop(t + d + 0.05); vib.stop(t + d + 0.05);
      });
    }
    return { start, update, draw };
  })();

  return Object.assign(M, { TRACKS, ORDER, unlock, areaTrack, play, next, update, drawUI, onSound, strum, tapRecord });
})();
