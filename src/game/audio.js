/* ------------------------------------------------------------------
   Sound — everything is synthesised with WebAudio (no files):
   surf bed, day/night ambience, a gentle ukulele-ish loop, and all
   the cartoon sound effects. Starts only after a user gesture.
------------------------------------------------------------------- */
const Sound = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, bedBus = null, bedLP = null, noise = null;
  let on = false, hour = 'noon', under = 0, seqTimer = null, ambTimers = [];
  const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

  function init() {
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp).connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = synthOn ? 0.55 : 0.0001; musicBus.connect(master);
    bedLP = ac.createBiquadFilter(); bedLP.type = 'lowpass'; bedLP.frequency.value = 20000;
    bedBus = ac.createGain(); bedBus.gain.value = 0.8; bedBus.connect(bedLP).connect(master);
    const len = ac.sampleRate * 3;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const ch = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; ch[i] = last * 3.2; }
    white = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const wc = white.getChannelData(0);
    for (let i = 0; i < wc.length; i++) wc[i] = Math.random() * 2 - 1;
    startBed();
    startMusic();
    return true;
  }
  let white = null;
  const src = (buf = noise) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; };
  function env(g, t0, a, peak, rel) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + rel);
  }
  function out(pan) {
    if (!ac.createStereoPanner) return sfxBus;
    const p = ac.createStereoPanner(); p.pan.value = clampv(pan, -1, 1); p.connect(sfxBus); return p;
  }
  function tone(type, f0, f1, t0, dur, peak, dest, a = 0.008) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, a, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + a + dur + 0.05);
    return o;
  }
  function hiss(t0, dur, peak, type, freq, q, dest, f1 = null, buf = white) {
    const s = src(buf), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, 0.006, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0); s.stop(t0 + dur + 0.1);
  }
  function voice(t0, f0, f1, dur, formA, formB, peak, dest) {
    // two-formant cartoon voice (used for "yo" and creature cries)
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const mk = (fa, fb) => {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7;
      f.frequency.setValueAtTime(fa, t0); f.frequency.exponentialRampToValueAtTime(fb, t0 + dur * 0.7);
      return f;
    };
    const f1a = mk(formA[0], formB[0]), f2a = mk(formA[1], formB[1]);
    const mix = ac.createGain(); mix.gain.value = 1;
    o.connect(f1a).connect(mix); o.connect(f2a).connect(mix);
    env(g, t0, 0.03, peak, dur);
    mix.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  /* ---------- effects ---------- */
  const FXS = {
    pop(t, d, v) { tone('sine', 620, 1050, t, 0.06, 0.12 * v, d); },
    boing(t, d, v) { tone('sine', 330, 170, t, 0.18, 0.2 * v, d); tone('triangle', 660, 420, t, 0.08, 0.05 * v, d); },
    bonk(t, d, v) { tone('sine', 520, 380, t, 0.12, 0.28 * v, d); hiss(t, 0.05, 0.12 * v, 'bandpass', 1400, 2, d); tone('square', 1200, 900, t + 0.01, 0.04, 0.03 * v, d); },
    thud(t, d, v) { tone('sine', 150, 80, t, 0.14, 0.3 * v, d); hiss(t, 0.06, 0.08 * v, 'lowpass', 600, 0.7, d); },
    knock(t, d, v) { tone('sine', 240, 180, t, 0.1, 0.22 * v, d); hiss(t, 0.03, 0.08 * v, 'bandpass', 1800, 3, d); },
    clink(t, d, v) { tone('sine', 2300, 2250, t, 0.12, 0.12 * v, d); tone('sine', 3400, 3300, t, 0.08, 0.05 * v, d); },
    crack(t, d, v) { hiss(t, 0.09, 0.3 * v, 'highpass', 1500, 0.7, d); for (let i = 0; i < 4; i++) hiss(t + 0.03 + i * 0.025, 0.02, 0.15 * v, 'bandpass', 2500 + i * 400, 4, d); tone('sine', 300, 120, t, 0.12, 0.18 * v, d); },
    munch(t, d, v) { hiss(t, 0.05, 0.14 * v, 'bandpass', 1600, 2, d); hiss(t + 0.07, 0.04, 0.1 * v, 'bandpass', 1900, 2, d); },
    yum(t, d, v) { tone('triangle', 880, 880, t, 0.1, 0.08 * v, d); tone('triangle', 1318, 1318, t + 0.1, 0.18, 0.08 * v, d); },
    splash(t, d, v) { hiss(t, 0.45, 0.32 * v, 'lowpass', 2400, 0.6, d, 380, noise); hiss(t, 0.18, 0.12 * v, 'highpass', 2500, 0.5, d); },
    plop(t, d, v) { tone('sine', 700, 180, t, 0.12, 0.2 * v, d); hiss(t, 0.15, 0.06 * v, 'lowpass', 1200, 0.5, d); },
    rustle(t, d, v) { for (let i = 0; i < 5; i++) hiss(t + i * 0.05, 0.08, 0.05 * v, 'bandpass', 3000 + Math.random() * 1500, 1.5, d); },
    pat(t, d, v) { hiss(t, 0.07, 0.14 * v, 'lowpass', 500, 0.8, d, null, noise); },
    dust(t, d, v) { hiss(t, 0.18, 0.08 * v, 'bandpass', 900, 0.6, d, 500, noise); },
    twinkle(t, d, v) { [2093, 2637, 3136, 4186].forEach((f, i) => tone('sine', f, f, t + i * 0.06, 0.22, 0.05 * v, d)); },
    heart(t, d, v) { tone('sine', 1568, 1568, t, 0.12, 0.06 * v, d); tone('sine', 2093, 2093, t + 0.08, 0.2, 0.06 * v, d); },
    kiss(t, d, v) { tone('sine', 1700, 2600, t, 0.08, 0.1 * v, d); hiss(t, 0.04, 0.05 * v, 'highpass', 4000, 1, d); FXS.heart(t + 0.1, d, v * 0.8); },
    mud(t, d, v) { voice(t, 620, 820, 0.13, [500, 1400], [800, 1900], 0.3 * v, d); voice(t + 0.15, 780, 560, 0.16, [700, 1600], [450, 1100], 0.28 * v, d); },
    squeak(t, d, v) { voice(t, 900, 1300, 0.12, [700, 2200], [900, 2600], 0.3 * v, d); tone('sine', 1500, 2100, t, 0.1, 0.05 * v, d); },
    grr(t, d, v) { const o = tone('square', 110, 90, t, 0.35, 0.06 * v, d); },
    spheal(t, d, v) { voice(t, 900, 1150, 0.1, [600, 2000], [800, 2300], 0.26 * v, d); voice(t + 0.12, 1100, 850, 0.14, [800, 2300], [500, 1500], 0.24 * v, d); },
    clap(t, d, v) { hiss(t, 0.035, 0.22 * v, 'bandpass', 1800, 1.2, d); },
    bark(t, d, v) { for (let i = 0; i < 2; i++) voice(t + i * 0.2, 420, 300, 0.12, [600, 1200], [400, 900], 0.3 * v, d); },
    roar(t, d, v) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(130, t + 0.3); o.frequency.exponentialRampToValueAtTime(60, t + 1.3);
      f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
      env(g, t, 0.08, 0.35 * v, 1.3); o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + 1.5);
      hiss(t, 1.2, 0.12 * v, 'lowpass', 900, 0.8, d, 300, noise);
    },
    snip(t, d, v) { for (let i = 0; i < 2; i++) { hiss(t + i * 0.09, 0.02, 0.25 * v, 'highpass', 4000, 1, d); tone('square', 1800, 1200, t + i * 0.09, 0.02, 0.05 * v, d); } },
    crab(t, d, v) { voice(t, 300, 240, 0.18, [500, 1100], [400, 900], 0.22 * v, d); },
    squawk(t, d, v) { for (let i = 0; i < 2; i++) voice(t + i * 0.22, 760, 520, 0.16, [900, 1800], [700, 1500], 0.26 * v, d); },
    whoosh(t, d, v) { hiss(t, 0.5, 0.14 * v, 'bandpass', 400, 1.2, d, 2400, noise); },
    spout(t, d, v) { hiss(t, 1.2, 0.3 * v, 'bandpass', 700, 0.7, d, 2600, noise); tone('sine', 70, 50, t, 1.2, 0.2 * v, d); },
    whale(t, d, v) {
      const o = ac.createOscillator(), g = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.8); o.frequency.exponentialRampToValueAtTime(110, t + 2.2);
      vib.frequency.value = 5; vg.gain.value = 6; vib.connect(vg).connect(o.frequency);
      env(g, t, 0.4, 0.22 * v, 2); o.connect(g).connect(d); o.start(t); vib.start(t); o.stop(t + 2.6); vib.stop(t + 2.6);
    },
    rumble(t, d, v) { hiss(t, 1.6, 0.3 * v, 'lowpass', 180, 0.8, d, 90, noise); tone('sine', 55, 40, t, 1.5, 0.25 * v, d); },
    chest(t, d, v) { tone('sawtooth', 140, 190, t, 0.35, 0.04 * v, d); FXS.twinkle(t + 0.3, d, v); },
    rain(t, d, v) { hiss(t, 3, 0.07 * v, 'highpass', 3000, 0.3, d); },
    chime(t, d, v) { [1046, 1318, 1568, 2093, 2637].forEach((f, i) => { tone('triangle', f, f, t + i * 0.09, 0.9, 0.07 * v, d); tone('sine', f * 2, f * 2, t + i * 0.09, 0.5, 0.02 * v, d); }); },
    portal(t, d, v) {
      hiss(t, 2.2, 0.22 * v, 'bandpass', 180, 2, d, 3200, noise);
      tone('sine', 55, 82, t, 2.4, 0.22 * v, d, 0.4);
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone('sine', f, f * 1.01, t + 0.5 + i * 0.12, 0.8, 0.05 * v, d));
      FXS.twinkle(t + 1.3, d, v);
    },
    yo(t, d, v) {
      // "yo!" — /j/ sliding into /o/ with a cheeky pitch drop
      voice(t, 360, 300, 0.36, [280, 2300], [480, 820], 0.55 * v, d);
      tone('sine', 340, 290, t + 0.02, 0.3, 0.05 * v, d);
    },
    dialga(t, d, v) { voice(t, 300, 420, 0.25, [400, 1300], [600, 1700], 0.35 * v, d); voice(t + 0.24, 440, 260, 0.4, [600, 1600], [350, 900], 0.35 * v, d); },
    tick(t, d, v) { hiss(t, 0.015, 0.25 * v, 'highpass', 5000, 1, d); tone('sine', 3000, 3000, t, 0.02, 0.05 * v, d); },
    timewave(t, d, v) {
      for (let i = 0; i < 10; i++) FXS.tick(t + i * (0.16 - i * 0.012), d, v * (0.5 + i * 0.05));
      hiss(t + 0.9, 1.4, 0.3 * v, 'bandpass', 3000, 0.8, d, 200, noise);
      [261.6, 329.6, 392, 493.9, 523.3].forEach((f, i) => tone('triangle', f, f, t + 1 + i * 0.04, 1.6, 0.05 * v, d, 0.05));
      tone('sine', 65, 45, t + 0.9, 1.4, 0.3 * v, d);
    },
    freeze(t, d, v) { tone('sine', 1800, 300, t, 0.6, 0.08 * v, d); hiss(t, 0.5, 0.1 * v, 'highpass', 6000, 1, d); },
    bubble(t, d, v) { tone('sine', 400 + Math.random() * 500, 1200 + Math.random() * 600, t, 0.05, 0.07 * v, d); },
    gulp(t, d, v) { tone('sine', 300, 120, t, 0.15, 0.2 * v, d); },
  };

  function play(name, pan = 0, vol = 1) {
    if (!on || !ac || !FXS[name]) return;
    if (vol < 0.03) return;
    const t = ac.currentTime + 0.01;
    try { FXS[name](t, out(pan), vol); } catch (e) { /* ignore */ }
  }

  /* ---------- ambience ---------- */
  let bedNodes = null;
  function startBed() {
    const g = ac.createGain(); g.gain.value = 0.0001; g.connect(bedBus);
    g.gain.setTargetAtTime(1, ac.currentTime, 1);
    const s1 = src(), lp = ac.createBiquadFilter(), sg = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 760; lp.Q.value = 0.3; sg.gain.value = 0.26;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 1 / 6.6; lg.gain.value = 0.16;
    lfo.connect(lg).connect(sg.gain);
    s1.connect(lp).connect(sg).connect(g);
    const s2 = src(white), bp = ac.createBiquadFilter(), hg = ac.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5; hg.gain.value = 0.012;
    const lfo2 = ac.createOscillator(), lg2 = ac.createGain();
    lfo2.frequency.value = 1 / 6.6; lg2.gain.value = 0.01; lfo2.connect(lg2).connect(hg.gain);
    s2.connect(bp).connect(hg).connect(g);
    [s1, s2, lfo, lfo2].forEach((n) => n.start());
    bedNodes = { g };
    const sched = (fn, min, max) => {
      const go = () => { fn(); ambTimers.push(setTimeout(go, (min + Math.random() * (max - min)) * 1000)); };
      ambTimers.push(setTimeout(go, (min * 0.4 + Math.random() * min) * 1000));
    };
    sched(() => { if (on && under < 0.5 && (hour === 'noon' || hour === 'afternoon' || hour === 'dawn')) gull(); }, 7, 15);
    sched(() => { if (on && under < 0.5 && hour === 'night') cricket(); }, 1, 2.2);
    sched(() => { if (on && under < 0.5 && hour === 'dawn') bird(); }, 2.5, 6);
    sched(() => { if (on && under > 0.5) FXS.bubble(ac.currentTime, out(Math.random() * 1.6 - 0.8), 0.6); }, 0.4, 1.4);
  }
  function gull() {
    const t = ac.currentTime + 0.05, d = out(Math.random() * 1.4 - 0.7);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t0 = t + i * 0.26;
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1500, t0); o.frequency.exponentialRampToValueAtTime(950, t0 + 0.2);
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 3;
      env(g, t0, 0.02, 0.014, 0.2); o.connect(f).connect(g).connect(d); o.start(t0); o.stop(t0 + 0.3);
    }
  }
  function cricket() { const t = ac.currentTime, d = out(Math.random() * 1.6 - 0.8); for (let i = 0; i < 3; i++) tone('sine', 4700, 4650, t + i * 0.045, 0.03, 0.008, d); }
  function bird() { const t = ac.currentTime + 0.02, d = out(Math.random() * 1.4 - 0.7); for (let i = 0; i < 3; i++) tone('sine', 2600 + Math.random() * 900, 3600 + Math.random() * 600, t + i * 0.09, 0.07, 0.02, d); }

  /* ---------- music: a soft plucked loop per hour ---------- */
  const N = (s) => 440 * Math.pow(2, (s - 69) / 12);
  const SONGS = {
    dawn: { bpm: 76, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], mel: [76, 0, 74, 72, 0, 69, 0, 0, 72, 0, 71, 0, 67, 0, 0, 0] },
    noon: { bpm: 104, chords: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]], mel: [72, 74, 76, 0, 79, 0, 76, 74, 72, 0, 74, 76, 74, 0, 0, 0] },
    afternoon: { bpm: 96, chords: [[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]], mel: [77, 0, 76, 74, 72, 0, 74, 0, 76, 0, 72, 0, 69, 0, 0, 0] },
    dusk: { bpm: 84, chords: [[57, 60, 64], [52, 55, 59], [53, 57, 60], [55, 59, 62]], mel: [76, 0, 0, 74, 72, 0, 71, 0, 72, 0, 0, 69, 67, 0, 0, 0] },
    night: { bpm: 66, chords: [[48, 52, 55], [45, 48, 52], [53, 57, 60], [55, 59, 62]], mel: [76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 76, 0, 76, 0, 0, 0] },
  };
  let step = 0, nextT = 0;
  function pluck(f, t, v, dest, dur = 0.9) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(dest);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function startMusic() {
    nextT = ac.currentTime + 0.3;
    seqTimer = setInterval(() => {
      if (!ac) return;
      const S = SONGS[hour] || SONGS.noon;
      const spb = 60 / S.bpm / 2; // eighth notes
      while (nextT < ac.currentTime + 0.2) {
        if (on) {
          const bar = Math.floor(step / 8) % S.chords.length, i = step % 8;
          const ch = S.chords[bar];
          const mv = under > 0.5 ? 0.5 : 1;
          if (i === 0) pluck(N(ch[0] - 12), nextT, 0.05 * mv, musicBus, 1.6);
          if (i === 4) pluck(N(ch[0] - 5), nextT, 0.035 * mv, musicBus, 1.2);
          if (i % 2 === 1 || i === 2 || i === 6) pluck(N(ch[(i >> 1) % 3]), nextT, 0.022 * mv, musicBus, 0.5);
          const m = S.mel[step % 16];
          if (m && (Math.floor(step / 16) % 2 === 0 || hour === 'night')) pluck(N(m), nextT, 0.03 * mv, musicBus, 0.8);
        }
        step++; nextT += spb;
      }
    }, 40);
  }

  function set(v) {
    if (v && !init()) return false;
    on = v;
    if (master) master.gain.setTargetAtTime(v ? 0.9 : 0.0001, ac.currentTime, 0.25);
    if (v && ac.state === 'suspended') ac.resume();
    return on;
  }
  function setHour(h) { hour = h; }
  function setUnder(u) {
    if (!ac || Math.abs(u - under) < 0.02) return;
    under = u;
    bedLP.frequency.setTargetAtTime(u > 0.5 ? 380 : 20000, ac.currentTime, 0.3);
    bedBus.gain.setTargetAtTime(u > 0.5 ? 1.2 : 0.8, ac.currentTime, 0.3);
  }
  let synthOn = true;
  function synthMusic(v) { synthOn = v; if (musicBus && ac) musicBus.gain.setTargetAtTime(v ? 0.55 : 0.0001, ac.currentTime, 0.4); }
  return { init, set, play, setHour, setUnder, synthMusic, get on() { return on; }, get ready() { return !!ac; }, ctx: () => ac, sfxBus: () => sfxBus, master: () => master, noise: () => white };
})();
