/* ------------------------------------------------------------------
   SFX — synthesised sounds for the camera, the Pokédex and the UI,
   sharing the game's AudioContext (all created on demand after the
   first user gesture).
------------------------------------------------------------------- */
const SFX = (() => {
  const ok = () => Sound.on && Sound.ctx();
  function out(pan, vol) {
    const ac = Sound.ctx(), g = ac.createGain();
    g.gain.value = vol;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(Sound.sfxBus()); }
    else g.connect(Sound.sfxBus());
    return g;
  }
  function tone(dest, type, f0, f1, t0, dur, peak, a = 0.005) {
    const ac = Sound.ctx(), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dur);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + a + dur + 0.05);
  }
  function noise(dest, t0, dur, peak, type, freq, q = 1, f1 = null) {
    const ac = Sound.ctx(), s = ac.createBufferSource(); s.buffer = Sound.noise();
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  const now = () => Sound.ctx().currentTime + 0.01;
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const S = {
    shutter(pan = 0, v = 1) { const d = out(pan, v), t = now(); noise(d, t, 0.03, 0.5, 'highpass', 3000); tone(d, 'square', 1800, 900, t, 0.012, 0.12); noise(d, t + 0.07, 0.05, 0.4, 'bandpass', 2200, 2); tone(d, 'square', 1400, 700, t + 0.07, 0.015, 0.1); noise(d, t + 0.14, 0.22, 0.08, 'bandpass', 900, 3, 1600); },
    focus(pan = 0, v = 1) { const d = out(pan, v * 0.5), t = now(); tone(d, 'square', 2637, 2637, t, 0.04, 0.12); tone(d, 'square', 3136, 3136, t + 0.07, 0.05, 0.12); },
    zoom(pan = 0, v = 1) { const d = out(pan, v * 0.3), t = now(); tone(d, 'triangle', 520, 700, t, 0.05, 0.1); },
    blip(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); tone(d, 'square', 1320, 1320, t, 0.035, 0.14); },
    select(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); tone(d, 'square', 988, 988, t, 0.03, 0.12); tone(d, 'square', 1480, 1480, t + 0.045, 0.05, 0.12); },
    back(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); tone(d, 'square', 1175, 1175, t, 0.03, 0.12); tone(d, 'square', 784, 784, t + 0.045, 0.05, 0.12); },
    error(pan = 0, v = 1) { const d = out(pan, v * 0.4), t = now(); tone(d, 'sawtooth', 180, 160, t, 0.12, 0.15); tone(d, 'sawtooth', 180, 150, t + 0.15, 0.14, 0.15); },
    page(pan = 0, v = 1) { const d = out(pan, v * 0.5), t = now(); noise(d, t, 0.09, 0.12, 'bandpass', 1800, 1.5, 4200); tone(d, 'triangle', 660, 990, t + 0.02, 0.06, 0.08); },
    hinge(pan = 0, v = 1) { const d = out(pan, v * 0.6), t = now(); noise(d, t, 0.04, 0.4, 'bandpass', 1200, 3); tone(d, 'square', 300, 180, t, 0.05, 0.08); },
    dexOpen(pan = 0, v = 1) {
      const d = out(pan, v * 0.5), t = now();
      noise(d, t, 0.05, 0.4, 'bandpass', 1400, 3); tone(d, 'square', 280, 200, t, 0.05, 0.1);
      [72, 76, 79, 84, 88].forEach((n, i) => tone(d, 'square', N(n), N(n), t + 0.28 + i * 0.06, 0.07, 0.11));
      tone(d, 'triangle', N(96), N(96), t + 0.62, 0.3, 0.1);
    },
    dexClose(pan = 0, v = 1) { const d = out(pan, v * 0.5), t = now(); [84, 79, 76, 72].forEach((n, i) => tone(d, 'square', N(n), N(n), t + i * 0.05, 0.05, 0.1)); noise(d, t + 0.24, 0.05, 0.4, 'bandpass', 1100, 3); },
    boot(pan = 0, v = 1) { const d = out(pan, v * 0.4), t = now(); tone(d, 'square', N(60), N(84), t, 0.25, 0.09); tone(d, 'square', N(91), N(91), t + 0.3, 0.12, 0.1); },
    stamp(pan = 0, v = 1) { const d = out(pan, v * 0.7), t = now(); tone(d, 'sine', 160, 60, t, 0.14, 0.5); noise(d, t, 0.08, 0.3, 'lowpass', 900); },
    rank(pan = 0, v = 1, tier = 1) { const d = out(pan, v * 0.45), t = now(); const sc = [[72, 76, 79], [72, 76, 79, 84], [72, 76, 79, 84, 88], [72, 76, 79, 84, 88, 91, 96]][Math.max(0, Math.min(3, tier - 1))]; sc.forEach((n, i) => tone(d, 'square', N(n), N(n), t + i * 0.07, 0.1, 0.1)); },
    newEntry(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); [[76, 0], [79, 0.1], [84, 0.2], [83, 0.34], [84, 0.42], [88, 0.5]].forEach(([n, dt]) => { tone(d, 'square', N(n), N(n), t + dt, 0.1, 0.1); tone(d, 'triangle', N(n - 12), N(n - 12), t + dt, 0.12, 0.08); }); },
    reward(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => tone(d, i % 2 ? 'triangle' : 'square', N(n), N(n), t + i * 0.08, 0.1, 0.1)); noise(d, t + 0.6, 0.4, 0.06, 'highpass', 6000); },
    scan(pan = 0, v = 1) { const d = out(pan, v * 0.35), t = now(); tone(d, 'sine', 400, 2400, t, 0.5, 0.15); tone(d, 'square', 1200, 1200, t + 0.52, 0.04, 0.08); tone(d, 'square', 1600, 1600, t + 0.6, 0.06, 0.08); },
    lensSplash(pan = 0, v = 1) { const d = out(pan, v * 0.8), t = now(); noise(d, t, 0.3, 0.5, 'lowpass', 1800, 1, 500); tone(d, 'sine', 300, 90, t, 0.2, 0.3); },
    lensCrack(pan = 0, v = 1) { const d = out(pan, v * 0.7), t = now(); noise(d, t, 0.06, 0.6, 'highpass', 3000); noise(d, t + 0.04, 0.2, 0.3, 'bandpass', 5000, 4); tone(d, 'square', 2400, 800, t, 0.05, 0.1); },
    lensFrost(pan = 0, v = 1) { const d = out(pan, v * 0.6), t = now(); noise(d, t, 0.5, 0.2, 'highpass', 5000, 1, 9000); tone(d, 'sine', 2000, 3000, t, 0.4, 0.05); },
    staticBuzz(pan = 0, v = 1) { const d = out(pan, v * 0.5), t = now(); noise(d, t, 0.6, 0.3, 'bandpass', 3000, 0.7); tone(d, 'sawtooth', 60, 55, t, 0.5, 0.12); },
    scratch(pan = 0, v = 1) { const d = out(pan, v * 0.6), t = now(); noise(d, t, 0.18, 0.4, 'bandpass', 900, 2, 3000); noise(d, t + 0.2, 0.14, 0.3, 'bandpass', 2600, 2, 700); },
    sparkle(pan = 0, v = 1) { const d = out(pan, v * 0.35), t = now(); [96, 100, 103, 108].forEach((n, i) => tone(d, 'sine', N(n), N(n), t + i * 0.05, 0.12, 0.06)); },
    whistle(pan = 0, v = 1) { const d = out(pan, v * 0.4), t = now(); tone(d, 'sine', N(84), N(88), t, 0.12, 0.2); tone(d, 'sine', N(91), N(84), t + 0.16, 0.2, 0.2); },
    unlock(pan = 0, v = 1) { const d = out(pan, v * 0.45), t = now(); [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => { tone(d, 'square', N(n), N(n), t + i * 0.06, 0.12, 0.09); }); tone(d, 'triangle', N(72), N(72), t + 0.5, 0.6, 0.14); },
  };
  const api = {};
  for (const k in S) api[k] = (pan = 0, v = 1, x) => { if (ok()) try { S[k](pan, v, x); } catch (e) { /* ignore */ } };
  return api;
})();
