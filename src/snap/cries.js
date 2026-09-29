/* ------------------------------------------------------------------
   Cries — every species gets its own synthesized cry: pitch from its
   size, syllables from its name, a formant "voice" and a pitch
   contour, so Spheal squeaks, Walrein bellows and Mudkip says
   "Mud-kip!". Plus soft footsteps on sand, grass and wood.
------------------------------------------------------------------- */
const Cries = (() => {
  let last = 0;
  const ctx = () => (Sound.on && Sound.ctx ? Sound.ctx() : null);
  function voice(ac, dest, t0, dur, f0, f1, form, vib) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter(), bp2 = ac.createBiquadFilter(), mix = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.35); o.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * 0.8), t0 + dur);
    o2.frequency.setValueAtTime(f0 * 1.005, t0); o2.frequency.linearRampToValueAtTime(f1 * 1.005, t0 + dur * 0.35); o2.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * 0.8), t0 + dur);
    if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.04; l.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
    bp.type = 'bandpass'; bp.frequency.value = form; bp.Q.value = 3; bp2.type = 'bandpass'; bp2.frequency.value = form * 2.3; bp2.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + 0.02); g.gain.setValueAtTime(1, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(bp); o2.connect(bp); o.connect(bp2); bp.connect(mix); bp2.connect(mix); mix.gain.value = 0.9; mix.connect(g).connect(dest);
    o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
  }
  function out(ac, pan, vol) { const g = ac.createGain(); g.gain.value = vol; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(Sound.sfxBus()); } else g.connect(Sound.sfxBus()); return g; }
  function play(kind, x = null, vol = 0.5, force = false) {
    const ac = ctx(); if (!ac) return;
    const now = ac.currentTime; if (!force && now - last < 0.35) return; last = now;
    let pan = 0, v = vol;
    if (x !== null && typeof Game !== 'undefined') { const d = (x - (Game.cam.x + Game.VW / 2)) / (Game.VW * 0.5); pan = Math.max(-0.9, Math.min(0.9, d * 0.7)); v = vol / (1 + Math.max(0, Math.abs(d) - 1) * 2); }
    if (v < 0.03) return;
    const d = DexData.S[kind] || {}, name = (d.name || kind || 'mon').toLowerCase();
    let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const size = d.h || 0.8, base = Math.max(90, Math.min(900, 520 / Math.pow(size, 0.55))) * (0.85 + (h % 100) / 330);
    const syl = Math.max(1, Math.min(3, (name.match(/[aeiouy]+/g) || ['a']).length));
    const dest = out(ac, pan, v * 0.18), t0 = now + 0.01;
    let t = t0;
    for (let i = 0; i < syl; i++) {
      const up = ((h >> (i * 3)) & 7) / 7, dur = (0.1 + ((h >> (i * 2 + 5)) & 3) * 0.04) * (size > 2 ? 1.8 : 1);
      const f0 = base * (1 + (i === syl - 1 ? 0.15 : -0.05) + up * 0.25), f1 = f0 * (1.15 + up * 0.4);
      voice(ac, dest, t, dur, f0, f1, 700 + (h % 900) + (size < 0.6 ? 600 : 0), size > 3 ? 5 : (h & 1) ? 7 : 0);
      t += dur * 0.85;
    }
  }
  // Mudkip: "Mud-kip!"
  function mudkip(x = null, vol = 0.6) {
    const ac = ctx(); if (!ac) return; const now = ac.currentTime + 0.01; last = now;
    const dest = out(ac, 0, vol * 0.2);
    voice(ac, dest, now, 0.13, 520, 470, 900, 0); voice(ac, dest, now + 0.14, 0.2, 700, 930, 1300, 6);
  }
  function step(surface, x) {
    const ac = ctx(); if (!ac) return;
    const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = Sound.noise();
    const f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'bandpass'; f.frequency.value = surface === 'wood' ? 900 : surface === 'grass' ? 2600 : 1600; f.Q.value = 1.2;
    const v = surface === 'wood' ? 0.05 : 0.03; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'wood' ? 0.05 : 0.08));
    s.connect(f).connect(g).connect(Sound.sfxBus()); s.start(t); s.stop(t + 0.1);
    if (surface === 'wood') { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 180; og.gain.setValueAtTime(0.04, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(og).connect(Sound.sfxBus()); o.start(t); o.stop(t + 0.08); }
  }
  return { play, mudkip, step };
})();
