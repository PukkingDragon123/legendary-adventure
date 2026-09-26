/* ------------------------------------------------------------------
   Cove — the loop, input, icon HUD and sound for Mudkip Cove.
   Find the Adamant Orb among the rocks, summon tiny Dialga, and let
   it warp you through time and space between the little scenes.
------------------------------------------------------------------- */
const Cove = (() => {
  const W = 384, H = 216;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const R = (a, b) => a + Math.random() * (b - a);
  const qs = new URLSearchParams(location.search);
  const G = Scenes.G;
  const cv = $('#cv');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), u32 = new Uint32Array(img.data.buffer);
  const fb = new PX.Buf(W, H), out = new PX.Buf(W, H), snap = new PX.Buf(W, H);
  let shown = fb;
  const scenes = {};
  const getScene = (id) => {
    if (scenes[id]) return scenes[id];
    const S = scenes[id] = Scenes.MAKERS[id]();
    if (S.paint.warm) S.paint.warm(0.6); else S.paint.step(1 / 30);
    return S;
  };
  let cur = null, started = false, frozen = 0, freezeAt = qs.has('freeze') ? +qs.get('freeze') : R(45, 70), tickT = 0, shakeA = 0, shakeT = 0, pending = null;

  /* ------------------------------ sound ------------------------------ */
  const SND = { boing: ['boing', 0.7], cry: ['mud', 0.9], jump: ['whoosh', 0.3], plip: ['plop', 0.5], splash: ['splash', 0.5], twinkle: ['twinkle', 0.6] };
  G.sfx = (name, x = W / 2, v = 1) => { if (started && Sound.ready && Sound.on) Sound.play(name, clamp((x / W) * 2 - 1, -1, 1) * 0.7, v); };
  G.shake = (a, d) => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, d); };
  Cast.hooks.sfx = G.sfx; Cast.hooks.shake = G.shake;

  /* ------------------------------ scenes ------------------------------ */
  function placeDialga(S) {
    const d = G.dia;
    Object.assign(d, { x: S.dia.x, home: S.dia.x, y: S.dia.y, home2: S.dia.y, mode: S.dia.mode || 'ground', sleepy: !!S.dia.sleepy, rot: 0, hop: 0, hv: 0, layer: S.dia.mode === 'bubble' ? 'back' : 'front' });
    d.shadow = d.mode === 'ground' ? 11 : 0; d.set('idle'); d.next = R(2, 4);
    if (!S.actors.includes(d)) S.actors.push(d);
  }
  function enter(id) {
    const S = getScene(id);
    if (cur && G.dia && cur !== S) cur.actors = cur.actors.filter((a) => a !== G.dia);
    cur = S;
    if (G.dia) placeDialga(S);
    Sound.setHour(S.hour); Sound.setUnder(S.under ? 1 : 0);
    HUD.update();
  }
  function travel(id) {
    if (!G.dia || pending || FX.WARP.on || frozen > 0 || !cur || id === cur.id) return;
    const d = G.dia;
    d.sleepy = false; d.set('idle'); d.roarT = 0.7; d.sayT = 0.9; d.jump(120);
    G.sfx('yo', d.x); G.sfx('dialga', d.x, 0.6);
    FX.sparks(d.x, d.top(), 8, FX.C.cy, 12, d.layer);
    pending = { id, t: 0.55 };
  }
  function warpNow() {
    const id = pending.id; pending = null;
    const next = getScene(id), kind = cur.time && next.time ? 'time' : 'space';
    const [gx, gy] = G.dia.at(25.5, 22);
    snap.d.set(shown.d);
    FX.startWarp(kind, kind === 'time' ? gx : clamp(gx, 60, W - 60), kind === 'time' ? gy : clamp(gy - 30, 50, H - 50), snap);
    G.sfx(kind === 'time' ? 'timewave' : 'portal', gx); G.sfx('whoosh', gx, 0.7);
    FX.list.length = 0;
    enter(id);
  }
  G.onDialga = () => { HUD.update(); G.sfx('chime'); save(); };

  /* ------------------------------ update ------------------------------ */
  function update(dt) {
    if (shakeT > 0) shakeT -= dt; else shakeA = 0;
    if (pending) { pending.t -= dt; if (pending.t <= 0) warpNow(); }
    if (FX.WARP.on) {
      FX.WARP.t += dt;
      if (FX.WARP.t >= FX.WARP.dur) { FX.WARP.on = false; const d = G.dia; d.sayT = 1.3; G.sfx('yo', d.x); FX.hearts(d.x, d.top() - 2, 2, d.layer); FX.sparks(d.x, d.top(), 8, FX.C.cy, 12, d.layer); }
    }
    if (frozen > 0) {
      frozen -= dt; tickT -= dt;
      if (tickT <= 0) { tickT = 0.5; G.sfx('tick', G.dia.x, 0.8); }
      G.dia.update(dt, cur);
      if (frozen <= 0) { const d = G.dia; FX.ring(d.x, d.top() + 16, 4, 60, FX.C.cy, 0.6, d.layer); G.sfx('whoosh', d.x); d.set('dance'); }
      return;
    }
    const evs = cur.paint.step(dt) || [];
    for (const e of evs) { const m = SND[e.name]; if (m) G.sfx(m[0], W / 2, m[1] * (e.soft || e.small ? 0.7 : 1)); }
    cur.step(dt);
    FX.step(dt);
    if (G.dia && !FX.WARP.on && cur.actors.includes(G.dia) && !G.dia.sleepy) {
      freezeAt -= dt;
      if (freezeAt < 0) { freezeAt = R(50, 80); frozen = 2.6; tickT = 0; G.dia.set('held'); G.dia.roarT = 0.5; G.sfx('freeze', G.dia.x); }
    }
  }

  /* ------------------------------ render ------------------------------ */
  function render() {
    Paintings.hook = (f, layer) => cur.layer(f, layer);
    cur.paint.draw(fb);
    Paintings.hook = null;
    if (frozen > 0) {
      FX.frozen(fb, Math.min(0.8, (2.6 - frozen) * 3));
      const d = G.dia;
      d.draw(fb, cur.tint);
      const cx = d.x, cy = d.top() + 16, t = 2.6 - frozen;
      for (let j = 0; j < 12; j++) { const a = j * 0.5236; for (let s = 0; s < 3; s++) fb.set(Math.round(cx + Math.cos(a) * (24 + s)), Math.round(cy + Math.sin(a) * (24 + s)), FX.C.cy); }
      const ha = Math.floor(t * 2) * 0.5236 - 1.571;
      for (let s = 0; s < 20; s++) fb.set(Math.round(cx + Math.cos(ha) * s), Math.round(cy + Math.sin(ha) * s), FX.C.w);
    }
    shown = fb;
    if (FX.WARP.on) { FX.compose(out, fb); shown = out; }
    u32.set(shown.d);
    ctx.putImageData(img, 0, 0);
    const s = shakeT > 0 ? shakeA * scale : 0;
    cv.style.transform = s ? `translate(${Math.round(R(-s, s))}px, ${Math.round(R(-s, s))}px)` : '';
  }

  /* ------------------------------ input ------------------------------ */
  function tap(e) {
    if (!started || pending || FX.WARP.on || frozen > 0) return;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const d = G.dia;
    if (d && cur.actors.includes(d) && d.state !== 'held' && d.hit(x, y)) {
      const i = Scenes.ORDER.indexOf(cur.id);
      travel(Scenes.ORDER[(i + 1) % Scenes.ORDER.length]);
      return;
    }
    if (cur.tap(x, y)) return;
    cur.paint.tap(x, y);
  }

  /* ------------------------------ HUD ------------------------------ */
  const ICONS = {
    son: ['....k.......', '...kk...k...', 'kkkwk....k..', 'kwwwk.k..k..', 'kwwwk..k.k..', 'kwwwk..k.k..', 'kwwwk.k..k..', 'kkkwk....k..', '...kk...k...', '....k.......'],
    soff: ['....k.......', '...kk.......', 'kkkwk.......', 'kwwwk.r...r.', 'kwwwk..r.r..', 'kwwwk...r...', 'kwwwk..r.r..', 'kkkwk.r...r.', '...kk.......', '....k.......'],
    full: ['wwww....wwww', 'w..........w', 'w..........w', 'w..........w', '............', '............', '............', '............', 'w..........w', 'w..........w', 'w..........w', 'wwww....wwww'],
    orb: ['.....k.....', '....kck....', '...kcwck...', '..kccwcck..', '.kbcccccbk.', 'kbbbccccbbk', '.kbbbcbbbk.', '..kbbbbbk..', '...kbbbk...', '....kbk....', '.....k.....'],
    orbGrey: ['.....g.....', '....g.g....', '...g...g...', '..g.....g..', '.g.......g.', 'g.........g', '.g.......g.', '..g.....g..', '...g...g...', '....g.g....', '.....g.....'],
    dawn: ['............', '.....y......', '..y..y..y...', '...y...y....', '....yyy.....', '..yyyyyyy...', '.yyyyyyyyy..', 'oooooooooooo', '.bbbbbbbbbb.', '..bbbbbbbb..'],
    noon: ['.....y.....', '..y..y..y..', '...y...y...', '....yyy....', 'yy.yyyyy.yy', '...yyyyy...', '....yyy....', '...y...y...', '..y..y..y..', '.....y.....'],
    dusk: ['............', '............', '....oooo....', '..oooooooo..', '.oooooooooo.', 'rrrrrrrrrrrr', '.pppppppppp.', '..pppppppp..', '............'],
    night: ['...cccc.....', '..ccc....w..', '.ccc.....w..', '.ccc...wwwww', '.ccc.....w..', '.cccc....w..', '..ccccc.....', '...cccccc...', '.....cc.....'],
    surf: ['............', '....bbbb....', '..bbwwwbb...', '.bww...wbb..', 'bw.......bb.', 'b..........b', '.bbbbbbbbbb.', 'cbcbcbcbcbcb', 'bbbbbbbbbbbb'],
    reef: ['........w...', '.........w..', '.pp.pp..w...', 'ppppppp.....', 'pwkpppppp...', 'pppppppppp..', '.ppppppp....', '..ppppp.....', '...ppp......', '....p.......'],
  };
  const ICOL = { k: '#1b2240', w: '#ffffff', b: '#56bcf0', o: '#f28a2a', r: '#ff5a6a', g: '#8f98b8', c: '#9ff3ff', y: '#ffd83a', p: '#ff7aa8' };
  function svgIcon(map) {
    const h = map.length, w = map[0].length;
    let r = '';
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const ch = map[y][x];
        if (ch === '.') { x++; continue; }
        let x2 = x;
        while (x2 < w && map[y][x2] === ch) x2++;
        r += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${ICOL[ch]}"/>`;
        x = x2;
      }
    }
    return `<svg viewBox="-1 -1 ${w + 2} ${h + 2}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }
  const LABEL = { noon: 'Noon', dusk: 'Golden hour', night: 'Night', dawn: 'Dawn', surf: 'Open sea', reef: 'Reef' };
  const HUD = {
    init() {
      const row = $('#scenes');
      for (const id of Scenes.ORDER) {
        const b = document.createElement('button');
        b.className = 'hb'; b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-label', LABEL[id]); b.innerHTML = svgIcon(ICONS[id]);
        b.addEventListener('click', (e) => { e.stopPropagation(); travel(id); });
        row.appendChild(b);
      }
      $('#b-orb').addEventListener('click', (e) => { e.stopPropagation(); if (G.orb === 'hidden' && cur.hint) cur.hint(); else if (G.orb === 'hidden') travelHome(); });
      $('#b-sound').addEventListener('click', (e) => { e.stopPropagation(); setSound(!Sound.on); });
      $('#b-full').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = $('#game');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      });
      $('#b-full').innerHTML = svgIcon(ICONS.full);
      if (!document.fullscreenEnabled) $('#b-full').hidden = true;
      this.update();
    },
    update() {
      const o = $('#b-orb');
      o.hidden = !!G.dia;
      o.innerHTML = svgIcon(G.orb === 'hidden' ? ICONS.orbGrey : ICONS.orb);
      o.classList.toggle('lit', G.orb !== 'hidden');
      o.setAttribute('aria-label', 'Adamant Orb');
      const row = $('#scenes');
      row.hidden = !G.dia;
      for (const b of row.children) b.setAttribute('aria-pressed', cur && b.dataset.id === cur.id ? 'true' : 'false');
      $('#b-sound').innerHTML = svgIcon(ICONS[Sound.on ? 'son' : 'soff']);
      $('#b-sound').setAttribute('aria-label', 'Sound');
      $('#b-sound').setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
    },
  };
  function travelHome() { /* the orb only lives on the home beach */ }
  let wantSound = true;
  try { wantSound = localStorage.getItem('mk-cove-sound') !== '0'; } catch (e) { /* storage optional */ }
  function setSound(v) {
    if (v && !Sound.ready) Sound.init();
    Sound.set(v);
    try { localStorage.setItem('mk-cove-sound', v ? '1' : '0'); } catch (e) { /* storage optional */ }
    HUD.update();
  }
  function save() { try { const hot = window.claude && window.claude.hot; if (hot && hot.snapshot) hot.snapshot(() => ({ orb: G.orb, scene: cur && cur.id, started })); } catch (e) { /* optional */ } }

  /* ------------------------------ layout ------------------------------ */
  let scale = 1;
  function layout() {
    const g = $('#game'), vw = g.clientWidth, vh = g.clientHeight;
    const s = Math.min(vw / W, vh / H), si = Math.floor(s);
    scale = si >= 2 && si >= s * 0.86 ? si : s;
    cv.style.width = Math.round(W * scale) + 'px'; cv.style.height = Math.round(H * scale) + 'px';
  }

  /* ------------------------------ start ------------------------------ */
  function drawStartArt() {
    try {
      const N = 33, c = document.createElement('canvas'); c.width = c.height = N;
      const x2 = c.getContext('2d');
      const put = (x, y, col) => { x2.fillStyle = col; x2.fillRect(x, y, 1, 1); };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2, dd = Math.hypot(dx, dy);
        if (dd > 16) continue;
        let col;
        if (dd > 14.2) col = '#1b2240';
        else if (Math.abs(dy) < 1.9) col = '#1b2240';
        else if (dy < 0) col = dx + dy < -13 ? '#ff9a9a' : dx - dy > 17 ? '#b8202e' : '#ee3b45';
        else col = dx - dy > 9 ? '#c9d3e3' : '#f4f7fb';
        if (dd < 6.6) col = dd > 5 ? '#1b2240' : dd > 3.4 ? '#f4f7fb' : dd > 2.4 ? '#c9d3e3' : '#ffffff';
        put(x, y, col);
      }
      put(9, 6, '#ffffff'); put(10, 6, '#ffffff'); put(8, 7, '#ffffff');
      const url = c.toDataURL();
      document.querySelectorAll('#b-start .pb-top, #b-start .pb-bot').forEach((el) => { el.style.backgroundImage = `url(${url})`; });
      const tc = document.createElement('canvas'); tc.width = tc.height = 20;
      const tx = tc.getContext('2d');
      const F = ['....kk......', '...kwwk.....', '...kwwk.....', '...kwwk.....', '...kwwkkk...', '...kwwkwwkk.', '.kkkwwkwwkwk', 'kwwkwwwwwkwk', 'kwwwwwwwwwwk', '.kwwwwwwwwwk', '..kwwwwwwwk.', '...kwwwwwk..', '...kkkkkkk..'];
      F.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { tx.fillStyle = ch === 'k' ? '#1b2240' : '#ffffff'; tx.fillRect(x + 4, y + 3, 1, 1); } }));
      const t = $('.tap'); if (t) t.style.backgroundImage = `url(${tc.toDataURL()})`;
      const fc = document.createElement('canvas'); fc.width = fc.height = 24;
      const fx = fc.getContext('2d');
      F.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { fx.fillStyle = ch === 'k' ? '#1b2240' : '#ffffff'; fx.fillRect(x * 2, y * 2, 2, 2); } }));
      cv.style.cursor = `url(${fc.toDataURL()}) 9 1, pointer`;
    } catch (e) { /* decorative */ }
  }
  function start() {
    if (started) return;
    started = true;
    const st = $('#start');
    st.classList.add('open');
    setTimeout(() => { st.hidden = true; }, 650);
    setSound(wantSound);
    G.sfx('pop'); G.sfx('chime', W / 2, 0.6);
    save();
    // build the other scenes quietly so warps never stall
    let i = 0;
    const pre = () => { const id = Scenes.ORDER[i++]; if (!id) return; getScene(id); setTimeout(pre, 900); };
    setTimeout(pre, 1500);
  }

  /* ------------------------------ boot ------------------------------ */
  function boot() {
    const hot = window.claude && window.claude.hot;
    const go = (d) => {
      layout();
      addEventListener('resize', layout);
      drawStartArt();
      HUD.init();
      const first = qs.get('scene') && Scenes.MAKERS[qs.get('scene')] ? qs.get('scene') : (d && d.scene) || 'noon';
      if (qs.has('orb') || (d && d.orb === 'used')) { G.orb = 'used'; G.dia = Cast.dialga(); }
      enter(first);
      $('#game').addEventListener('pointerdown', tap);
      $('#b-start').addEventListener('click', (e) => { e.stopPropagation(); start(); });
      if (qs.has('autostart') || (d && d.started)) start();
      try { $('#b-start').focus({ preventScroll: true }); } catch (e) { /* optional */ }
      let last = performance.now(), acc = 0;
      const perf = { ms: 0, render: 0 };
      const speed = +(qs.get('speed') || 1);
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        acc += dt * speed;
        let n = 0;
        while (acc > 0 && n < 8) { const h = Math.min(acc, 1 / 30); update(h); acc -= h; n++; }
        acc = Math.min(acc, 0.1);
        const r0 = performance.now(); render(); const r1 = performance.now();
        perf.ms = perf.ms * 0.95 + (r1 - now) * 0.05; perf.render = perf.render * 0.95 + (r1 - r0) * 0.05;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      window.__cove = { perf, G, scenes, get cur() { return cur; }, travel, getScene };
    };
    if (hot && hot.ready) { try { hot.ready((d) => go(d)); } catch (e) { go(null); } } else go(null);
  }
  return { boot };
})();
