/* ------------------------------------------------------------------
   Museum app — hangs the paintings, opens the viewing room, brings
   each painting to life, and plays a synthesized seaside soundscape.
------------------------------------------------------------------- */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const PW = Paintings.W, PH = Paintings.H, T = 12;
  const FW = PW + T * 2, FH = PH + T * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };

  /* ---------------- works (clock order) ---------------- */
  const ORDER = ['dawn', 'noon', 'surf', 'dusk', 'night'];
  const WORKS = ORDER.filter((k) => Paintings[k]).map((key) => ({ key, make: Paintings[key] }));

  /* ---------------- pixel gold frame ---------------- */
  const GOLD = ['#241302', '#553309', '#86581a', '#b0802b', '#d3a441', '#ecc967', '#fbe6a2'].map(PX.hex);
  // profile rows from the outer edge inwards: [lit-side tone, shadow-side tone]
  const PROFILE = [[0, 0], [6, 3], [5, 3], [4, 2], [2, 4], [3, 4], [5, 4], [4, 3], [4, 3], [6, 3], [2, 1], [0, 0]];
  function makeFrame(iw, ih) {
    const W = iw + T * 2, H = ih + T * 2;
    const b = new PX.Buf(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dl = x, dr = W - 1 - x, dt = y, db = H - 1 - y;
        const d = Math.min(dl, dr, dt, db);
        if (d >= T) continue;
        const lit = d === dt || d === dl ? (d === dl && d === db ? x < H - y : true) : false;
        let tone = PROFILE[d][lit ? 0 : 1];
        const along = d === dt || d === db ? x : y;
        if (d === 6 && along % 3 === 0) tone = Math.max(1, tone - 2); // bead row
        if (d === 7 && (along + (lit ? 0 : 1)) % 7 === 0) tone = Math.min(6, tone + 1);
        b.d[y * W + x] = GOLD[tone];
      }
    // corner rosettes
    const ros = ['..ddd..', '.dlhld.', 'dlhmhld', 'dhmomhd', 'dlhmhld', '.dlhld.', '..ddd..'];
    const rc = { d: GOLD[1], l: GOLD[4], h: GOLD[6], m: GOLD[5], o: GOLD[2] };
    for (const [cx, cy] of [[2, 2], [W - 9, 2], [2, H - 9], [W - 9, H - 9]])
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const ch = ros[r][c]; if (ch !== '.') b.set(cx + c, cy + r, rc[ch]); }
    // top cartouche with a tiny gill-star
    const cart = ['..ddddddddd..', '.dhhhhhhhhhd.', 'dhmmmoommmmhd', 'dhmmoooommmhd', 'dhmmmoommmmhd', '.dllllllllld.', '..ddddddddd..'];
    const x0 = Math.floor(W / 2) - 6;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 13; c++) { const ch = cart[r][c]; if (ch !== '.') b.set(x0 + c, 2 + r, ch === 'o' ? PX.hex('#f28a2a') : rc[ch]); }
    // inner shadow cast by the frame onto the canvas edge is added per frame
    return b;
  }
  const FRAME = makeFrame(PW, PH);
  const innerShade = PX.cmap((c) => PX.mix(c, PX.hex('#0b0a14'), 0.28));

  // Canvas that shows a framed painting; returns a compose(fb) function
  function framedCanvas(cv) {
    cv.width = FW; cv.height = FH;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(FW, FH);
    const d32 = new Uint32Array(img.data.buffer);
    d32.set(FRAME.d);
    return {
      cv,
      compose(fb, post) {
        for (let y = 0; y < PH; y++) d32.set(fb.d.subarray(y * PW, y * PW + PW), (y + T) * FW + T);
        // 2px shadow under the top & left moulding
        for (let x = 0; x < PW; x++) { const i = T * FW + T + x; d32[i] = innerShade(d32[i]); }
        for (let y = 0; y < PH; y++) { const i = (T + y) * FW + T; d32[i] = innerShade(d32[i]); }
        if (post) post(d32);
        ctx.putImageData(img, 0, 0);
      },
    };
  }

  // Pick a CSS size that is an integer multiple of the art in *device* pixels. With `fill`, fall back
  // to filling the box when the best integer size would leave more than (1 - fill) of it empty.
  function fitInteger(cv, maxW, maxH, fill = 0) {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.floor(Math.min((maxW * dpr) / cv.width, (maxH * dpr) / cv.height));
    const s = Math.min(maxW / cv.width, maxH / cv.height);
    let w, h;
    if (k >= 1 && (cv.width * k) / dpr >= cv.width * s * fill) { w = (cv.width * k) / dpr; h = (cv.height * k) / dpr; }
    else { w = Math.floor(cv.width * s); h = Math.floor(cv.height * s); }
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    return { w, h };
  }

  /* ---------------- audio: synthesized seaside ---------------- */
  const Sound = (() => {
    let ac = null, master = null, bed = null, noise = null, on = false, kind = null, timers = [];
    function init() {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp).connect(ac.destination);
      // brown-ish noise buffer
      const len = ac.sampleRate * 3;
      noise = ac.createBuffer(1, len, ac.sampleRate);
      const ch = noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; ch[i] = last * 3.2; }
    }
    function noiseSrc() { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); return s; }
    function env(g, t0, a, peak, rel) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + rel);
    }
    function tone(type, f0, f1, t0, dur, peak, dest = master) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      env(g, t0, 0.008, peak, dur);
      o.connect(g).connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function burst(t0, dur, peak, type, freq, q = 0.8) {
      const s = noiseSrc(), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      env(g, t0, 0.01, peak, dur);
      s.connect(f).connect(g).connect(master);
      s.start(t0); s.stop(t0 + dur + 0.1);
    }
    function stopBed() {
      timers.forEach(clearTimeout); timers = [];
      if (bed) { const b = bed; b.out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4); setTimeout(() => b.nodes.forEach((n) => { try { n.stop(); } catch {} }), 1500); }
      bed = null;
    }
    function startBed(k, period = 6.6) {
      stopBed();
      kind = k;
      if (!ac) return;
      const out = ac.createGain();
      out.gain.value = 0.0001;
      out.gain.setTargetAtTime(1, ac.currentTime, 0.8);
      out.connect(master);
      const nodes = [];
      // surf: low rumble swelling with the swash period
      const s1 = noiseSrc(), lp = ac.createBiquadFilter(), sg = ac.createGain();
      lp.type = 'lowpass'; lp.frequency.value = k === 'surf' ? 900 : 620; lp.Q.value = 0.3;
      sg.gain.value = k === 'surf' ? 0.34 : 0.22;
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 1 / period; lg.gain.value = k === 'surf' ? 0.2 : 0.13;
      lfo.connect(lg).connect(sg.gain);
      s1.connect(lp).connect(sg).connect(out);
      // backwash hiss
      const s2 = noiseSrc(), hp = ac.createBiquadFilter(), hg = ac.createGain();
      hp.type = 'bandpass'; hp.frequency.value = 2600; hp.Q.value = 0.5; hg.gain.value = 0.025;
      const lfo2 = ac.createOscillator(), lg2 = ac.createGain();
      lfo2.frequency.value = 1 / period; lg2.gain.value = 0.02;
      lfo2.connect(lg2).connect(hg.gain);
      s2.connect(hp).connect(hg).connect(out);
      [s1, s2, lfo, lfo2].forEach((n) => n.start());
      nodes.push(s1, s2, lfo, lfo2);
      bed = { out, nodes };
      const sched = (fn, min, max) => {
        const go = () => { if (bed && bed.out === out) { fn(); timers.push(setTimeout(go, (min + Math.random() * (max - min)) * 1000)); } };
        timers.push(setTimeout(go, (min * 0.5 + Math.random() * min) * 1000));
      };
      if (k === 'noon' || k === 'dawn' || k === 'surf') sched(() => gull(out), 6, 13);
      if (k === 'dawn') sched(() => bird(out), 2.5, 6);
      if (k === 'night') { sched(() => cricket(out), 1.2, 2.6); sched(() => lullaby(out), 14, 18); }
      if (k === 'dusk') sched(() => chime(out), 7, 12);
    }
    function gull(dest) {
      const t = ac.currentTime + 0.05;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const t0 = t + i * 0.28;
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1500, t0);
        o.frequency.exponentialRampToValueAtTime(950, t0 + 0.22);
        f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 3;
        env(g, t0, 0.02, 0.018, 0.22);
        o.connect(f).connect(g).connect(dest);
        o.start(t0); o.stop(t0 + 0.3);
      }
    }
    function bird(dest) {
      const t = ac.currentTime + 0.02;
      for (let i = 0; i < 3; i++) tone('sine', 2600 + Math.random() * 900, 3600 + Math.random() * 600, t + i * 0.09, 0.07, 0.03, dest);
    }
    function cricket(dest) {
      const t = ac.currentTime;
      for (let i = 0; i < 3; i++) tone('sine', 4700, 4650, t + i * 0.045, 0.03, 0.012, dest);
    }
    function chime(dest) {
      const t = ac.currentTime;
      [880, 1318.5, 1760].forEach((f, i) => tone('sine', f, f, t + i * 0.18, 1.4, 0.03, dest));
    }
    function lullaby(dest) {
      const notes = [659.3, 587.3, 523.3, 587.3, 659.3, 659.3, 659.3, 0, 587.3, 587.3, 587.3, 0, 659.3, 784, 784];
      const t = ac.currentTime + 0.1;
      notes.forEach((f, i) => { if (f) tone('triangle', f, f, t + i * 0.42, 0.9, 0.035, dest); });
    }
    function play(ev) {
      if (!on || !ac) return;
      const t = ac.currentTime + 0.005;
      switch (ev.name) {
        case 'boing':
          tone('sine', ev.big ? 820 : 640, ev.big ? 300 : 320, t, ev.big ? 0.32 : 0.22, ev.soft ? 0.12 : 0.2);
          tone('sine', 150, 60, t, 0.09, 0.22);
          break;
        case 'splash':
          burst(t, ev.small ? 0.22 : 0.42, ev.small ? 0.18 : ev.big ? 0.5 : 0.36, 'bandpass', 1500, 0.7);
          burst(t + 0.02, 0.3, 0.12, 'highpass', 3500, 0.5);
          for (let i = 0; i < (ev.small ? 3 : 6); i++) tone('sine', 1300 + Math.random() * 1400, 700 + Math.random() * 500, t + 0.05 + Math.random() * 0.35, 0.05, 0.05);
          break;
        case 'plip': tone('sine', 900 + Math.random() * 500, 600, t, 0.05, 0.06); break;
        case 'jump': burst(t, 0.12, 0.05, 'highpass', 2200, 0.6); break;
        case 'cry': {
          const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(620, t);
          o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
          o.frequency.setValueAtTime(900, t + 0.16);
          o.frequency.exponentialRampToValueAtTime(1350, t + 0.3);
          f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 6;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.03, t + 0.13);
          g.gain.exponentialRampToValueAtTime(0.12, t + 0.17);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
          o.connect(f).connect(g).connect(master);
          o.start(t); o.stop(t + 0.4);
          break;
        }
        case 'twinkle': [1318.5, 1661.2, 1975.5].forEach((fq, i) => tone('sine', fq, fq, t + i * 0.06, 0.35, 0.05)); break;
        case 'snore': burst(t, 1.1, 0.04, 'lowpass', 400, 0.5); break;
        case 'wave': burst(t, 1.4, 0.12, 'lowpass', 900, 0.4); break;
      }
    }
    return {
      get on() { return on; },
      set(v, k, period) {
        if (v && !ac) init();
        on = v;
        if (!ac) return;
        if (ac.state === 'suspended') ac.resume();
        master.gain.setTargetAtTime(v ? 0.9 : 0.0001, ac.currentTime, 0.15);
        if (v && k) startBed(k, period);
        if (!v) stopBed();
      },
      scene(k, period) { if (on && ac) startBed(k, period); else kind = k; },
      stop() { if (ac) stopBed(); },
      play,
    };
  })();

  /* ---------------- gallery ---------------- */
  const icon = {
    enter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h10M8 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  };
  const lead = $('#lead'), series = $('#series'), strip = $('#strip');
  const items = WORKS.map((w, i) => {
    const rand = PX.rng(258);
    const saved = Math.random;
    Math.random = rand;
    let inst;
    try { inst = w.make(); } finally { Math.random = saved; }
    const meta = inst.meta;
    const fig = document.createElement('article');
    fig.className = 'work' + (meta.id === 'noon' ? ' lead' : '');
    fig.id = 'work-' + meta.id;
    fig.innerHTML = `
      <div class="art">
        <button class="frame-btn" type="button" aria-label="Open ${meta.title} in the viewing room">
          <canvas width="${FW}" height="${FH}" role="img" aria-label="${meta.alt}"></canvas>
          <span class="peek">Click to bring it to life</span>
        </button>
      </div>
      <div class="label">
        <span class="no">No. ${meta.no} · ${meta.time}</span>
        <h3>${meta.title}</h3>
        <span class="meta"><b>${meta.place}</b> · ${meta.medium}, ${meta.size}</span>
        <p>${meta.blurb}</p>
        <button class="enter" type="button">Step inside ${icon.enter}</button>
      </div>`;
    (meta.id === 'noon' ? lead : series).appendChild(fig);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-label="Open ${meta.title}"><canvas width="${PW}" height="${PH}"></canvas><span class="t">${meta.no} · ${meta.time}</span><span class="n">${meta.title}</span></button>`;
    strip.appendChild(li);
    const fc = framedCanvas($('canvas', fig));
    const item = { w, inst, meta, fig, fc, thumb: $('canvas', li), fb: new PX.Buf(PW, PH), ready: false, idx: i, rand };
    const open = (e) => openViewer(i, fc.cv, e);
    $('.frame-btn', fig).addEventListener('click', open);
    $('.enter', fig).addEventListener('click', (e) => openViewer(i, fc.cv, null, e.currentTarget));
    $('button', li).addEventListener('click', (e) => openViewer(i, item.thumb, null, e.currentTarget));
    return item;
  });

  // Posters: step each painting forward to its poster moment in small slices so the page never stalls
  function finishPoster(it) {
    it.inst.draw(it.fb);
    it.fc.compose(it.fb);
    it.fb.toCanvas(it.thumb);
    it.ready = true;
  }
  // Warm-up runs on a seeded random stream so every visitor sees the same poster moment
  function seeded(it, fn) {
    const saved = Math.random;
    Math.random = it.rand;
    try { fn(); } finally { Math.random = saved; }
  }
  function paintPoster(it) {
    if (it.ready) return;
    const target = it.meta.poster || 3;
    seeded(it, () => { while (it.warmT < target - 1e-6) { it.inst.step(1 / 30); it.warmT += 1 / 30; } });
    finishPoster(it);
  }
  function paintPosterSliced(it, done) {
    const target = it.meta.poster || 3;
    (function slice() {
      if (it.ready) return done();
      const t0 = performance.now();
      seeded(it, () => { while (it.warmT < target - 1e-6 && performance.now() - t0 < 10) { it.inst.step(1 / 30); it.warmT += 1 / 30; } });
      if (it.warmT < target - 1e-6) requestAnimationFrame(slice);
      else { finishPoster(it); done(); }
    })();
  }
  // placeholder: the still sky & sea of each painting while it warms up
  for (const it of items) {
    it.warmT = 0;
    seeded(it, () => { it.inst.step(1 / 30); });
    it.warmT = 1 / 30;
    it.inst.draw(it.fb); it.fc.compose(it.fb);
  }
  // paint the lead first, then the rest in clock order
  const queue = [...items].sort((a, b) => (a.meta.id === 'noon' ? -1 : b.meta.id === 'noon' ? 1 : a.idx - b.idx));
  (function next() {
    const it = queue.shift();
    if (it) paintPosterSliced(it, () => setTimeout(next, 16));
  })();

  function layoutGallery() {
    for (const it of items) {
      const box = it.fig.querySelector('.art');
      const maxW = box.clientWidth;
      const lead = it.meta.id === 'noon';
      fitInteger(it.fc.cv, maxW, lead ? 900 : 700, lead ? 0.7 : 0.88);
    }
  }
  new ResizeObserver(layoutGallery).observe(document.body);
  layoutGallery();

  // masthead mark: a tiny spinning-free beach ball
  (() => {
    const cv = $('#logo');
    if (!cv) return;
    const s = Ball.render({ R: 6, rot: M3.mul(M3.rz(0.5), M3.rx(0.6)), light: { dir: [-0.5, 0.7, 0.5] } });
    s.buf.toCanvas(cv);
  })();

  // palette notes from the renderer's actual ramps
  (() => {
    const box = $('#swatches');
    if (!box) return;
    const P = Mudkip.BASE_PAL, M = Mudkip.MAT;
    const rows = [['Body', M.BODY], ['Cheek gills', M.GILL], ['Tail fin', M.TAIL], ['Jaw', M.JAW]];
    box.innerHTML = rows.map(([name, m]) => {
      const hexes = P[m].r.map((c) => PX.toHex(c));
      return `<div class="ramp"><span>${name}<code>${hexes[2]}</code></span><span class="chips" role="img" aria-label="${name} ramp ${hexes.join(', ')}">${hexes.map((h) => `<i style="background:${h}"></i>`).join('')}</span></div>`;
    }).join('');
  })();

  /* ---------------- viewing room ---------------- */
  const viewer = $('#viewer'), stage = $('#v-stage'), vcv = $('#v-canvas');
  const vfc = framedCanvas(vcv);
  const loupe = $('#loupe'), lctx = loupe.getContext('2d');
  const btn = { prev: $('#v-prev'), next: $('#v-next'), play: $('#v-play'), sound: $('#v-sound'), loupe: $('#v-loupe'), close: $('#v-close') };
  const S = { open: false, idx: 0, playing: true, loupe: false, raf: 0, last: 0, reveal: null, poster: null, returnFocus: null, lastPointer: null };
  const vfb = new PX.Buf(PW, PH);

  function setPlayUI() {
    btn.play.setAttribute('aria-pressed', String(!S.playing));
    btn.play.innerHTML = S.playing
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/></svg>Pause'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>Play';
  }
  function setSoundUI() {
    btn.sound.setAttribute('aria-pressed', String(Sound.on));
    btn.sound.innerHTML = Sound.on
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 010 5M12.8 3.5a6 6 0 010 9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>Sound on'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.4"/></svg>Sound off';
  }
  function setLoupeUI() {
    btn.loupe.setAttribute('aria-pressed', String(S.loupe));
    if (!S.loupe) loupe.style.display = 'none';
  }

  function fillText(it) {
    $('#v-no').textContent = 'No. ' + it.meta.no;
    $('#v-title').textContent = it.meta.title;
    $('#v-time').textContent = it.meta.time + ' · ' + it.meta.place;
    $('#v-desc').innerHTML = `<b>${it.meta.medium}, ${it.meta.size}.</b> ${it.meta.blurb}`;
    $('#v-hint').textContent = it.meta.hint;
    $('#v-count').textContent = `${it.idx + 1} / ${items.length}`;
  }

  function layoutViewer() {
    const r = stage.getBoundingClientRect();
    return fitInteger(vcv, r.width, r.height, 0.75);
  }

  function openViewer(i, fromCanvas, ev, focusBack) {
    const it = items[i];
    paintPoster(it);
    S.idx = i;
    S.returnFocus = focusBack || document.activeElement;
    fillText(it);
    // snapshot the still painting for the reveal
    it.inst.draw(vfb);
    S.poster = vfb.d.slice();
    let cx = PW / 2, cy = PH / 2;
    if (ev && fromCanvas) {
      const rr = fromCanvas.getBoundingClientRect();
      cx = ((ev.clientX - rr.left) / rr.width) * FW - T;
      cy = ((ev.clientY - rr.top) / rr.height) * FH - T;
    }
    S.reveal = reduced ? null : { t: 0, cx, cy };
    vfc.compose(vfb);
    const wasOpen = S.open;
    viewer.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    const to = layoutViewer();
    if (!wasOpen) {
      requestAnimationFrame(() => viewer.classList.add('open'));
      // FLIP from the wall to the viewing room
      if (fromCanvas && !reduced) {
        const a = fromCanvas.getBoundingClientRect(), b = vcv.getBoundingClientRect();
        const isThumb = fromCanvas.width === PW;
        const s = isThumb ? a.width / (b.width * (PW / FW)) : a.width / b.width;
        const dx = isThumb ? a.left - (b.left + b.width * (T / FW) * s) : a.left - b.left;
        const dy = isThumb ? a.top - (b.top + b.height * (T / FH) * s) : a.top - b.top;
        vcv.style.transition = 'none';
        vcv.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          vcv.style.transition = 'transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1)';
          vcv.style.transform = 'none';
        }));
      }
      btn.close.focus({ preventScroll: true });
    }
    S.open = true;
    S.playing = true;
    setPlayUI();
    Sound.scene(it.meta.id, it.meta.period || 6.6);
    S.last = performance.now();
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(loop);
    try { history.replaceState(null, '', '#' + it.meta.id); } catch {}
  }

  function closeViewer() {
    if (!S.open) return;
    S.open = false;
    cancelAnimationFrame(S.raf);
    viewer.classList.remove('open');
    loupe.style.display = 'none';
    Sound.stop();
    const it = items[S.idx];
    // the wall painting keeps the moment you left it at
    it.fc.compose(it.fb.copyFrom(vfb));
    it.fb.toCanvas(it.thumb);
    setTimeout(() => { if (!S.open) { viewer.hidden = true; document.documentElement.style.overflow = ''; } }, reduced ? 0 : 350);
    if (S.returnFocus && S.returnFocus.focus) S.returnFocus.focus({ preventScroll: true });
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  }

  function go(d) {
    const n = (S.idx + d + items.length) % items.length;
    vcv.style.transition = 'none';
    vcv.style.transform = 'none';
    openViewer(n, null, null, S.returnFocus);
  }

  const sparkA = PX.hex('#fff6c8'), sparkB = PX.hex('#ffd26a');
  const still = PX.cmap((c) => {
    const [r, g, b] = PX.rgbOf(c);
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    return PX.pack(r * 0.55 + l * 0.35 + 18, g * 0.55 + l * 0.35 + 12, b * 0.55 + l * 0.35);
  });
  function loop(ts) {
    const it = items[S.idx];
    let dt = Math.min(0.05, (ts - S.last) / 1000);
    S.last = ts;
    if (S.playing) {
      const evs = it.inst.step(dt);
      if (evs) for (const e of evs) Sound.play(e);
      it.inst.draw(vfb);
    }
    let post = null;
    if (S.reveal) {
      S.reveal.t += dt;
      const k = Math.min(1, S.reveal.t / 1.25);
      const e = 1 - Math.pow(1 - k, 3);
      const maxR = Math.hypot(Math.max(S.reveal.cx, PW - S.reveal.cx), Math.max(S.reveal.cy, PH - S.reveal.cy)) + 4;
      const R = e * maxR;
      const P = S.poster, d = vfb.d, cx = S.reveal.cx, cy = S.reveal.cy;
      for (let y = 0; y < PH; y++)
        for (let x = 0; x < PW; x++) {
          const dd = Math.hypot(x - cx, (y - cy) * 1.15);
          const i = y * PW + x;
          if (dd > R + 1.5) d[i] = still(P[i]);
          else if (dd > R - 1.5 && PX.bayer4(x, y) < 0.6) d[i] = (x + y) & 2 ? sparkA : sparkB;
        }
      if (k >= 1) S.reveal = null;
    }
    vfc.compose(vfb, post);
    if (S.loupe && S.lastPointer) drawLoupe(S.lastPointer);
    S.raf = requestAnimationFrame(loop);
  }

  function artPoint(e) {
    const r = vcv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * FW - T, y: ((e.clientY - r.top) / r.height) * FH - T, r };
  }
  function drawLoupe(p) {
    const size = 168, mag = 28; // shows 28x28 art pixels
    const a = artPoint(p);
    if (a.x < -T || a.y < -T || a.x > PW + T || a.y > PH + T) { loupe.style.display = 'none'; return; }
    loupe.style.display = 'block';
    loupe.style.left = p.clientX - size - 14 + 'px';
    loupe.style.top = p.clientY - size - 14 + 'px';
    if (p.clientX - size - 14 < 4) loupe.style.left = p.clientX + 18 + 'px';
    if (p.clientY - size - 14 < 4) loupe.style.top = p.clientY + 18 + 'px';
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#07131a';
    lctx.fillRect(0, 0, size, size);
    lctx.drawImage(vcv, a.x + T - mag / 2, a.y + T - mag / 2, mag, mag, 0, 0, size, size);
  }

  // taps & swipes on the painting
  let down = null;
  vcv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; });
  vcv.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const moved = Math.hypot(dx, dy);
    if (down.type !== 'mouse' && moved > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { go(dx < 0 ? 1 : -1); down = null; return; }
    if (moved < 12) {
      const a = artPoint(e);
      if (a.x >= 0 && a.y >= 0 && a.x < PW && a.y < PH) {
        if (!Sound.on && store.get('mk-sound', false)) { Sound.set(true, items[S.idx].meta.id, items[S.idx].meta.period); setSoundUI(); }
        const it = items[S.idx];
        if (!S.playing) { S.playing = true; setPlayUI(); }
        it.inst.tap(a.x, a.y);
      }
    }
    down = null;
  });
  vcv.addEventListener('pointermove', (e) => { S.lastPointer = e; if (S.loupe) drawLoupe(e); });
  vcv.addEventListener('pointerleave', () => { S.lastPointer = null; loupe.style.display = 'none'; });

  btn.close.addEventListener('click', closeViewer);
  btn.prev.addEventListener('click', () => go(-1));
  btn.next.addEventListener('click', () => go(1));
  btn.play.addEventListener('click', () => { S.playing = !S.playing; setPlayUI(); });
  btn.sound.addEventListener('click', () => {
    const it = items[S.idx];
    Sound.set(!Sound.on, it.meta.id, it.meta.period);
    store.set('mk-sound', Sound.on);
    setSoundUI();
  });
  btn.loupe.addEventListener('click', () => { S.loupe = !S.loupe; setLoupeUI(); });
  window.addEventListener('keydown', (e) => {
    if (!S.open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if ((e.key === ' ' || e.code === 'Space') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); btn.play.click(); }
    else if (e.key === 'm' || e.key === 'M') btn.sound.click();
    else if (e.key === 'l' || e.key === 'L') btn.loupe.click();
    else if (e.key === 'Tab') {
      const f = [...viewer.querySelectorAll('button')].filter((b) => !b.disabled);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  window.addEventListener('resize', () => { if (S.open) layoutViewer(); });
  setPlayUI(); setSoundUI(); setLoupeUI();

  // deep link: #noon, #dawn ...
  const hash = location.hash.slice(1);
  const hi = items.findIndex((it) => it.meta.id === hash);
  if (hi >= 0) setTimeout(() => openViewer(hi, items[hi].fc.cv), 60);
})();
