/* ------------------------------------------------------------------
   Time Gallery — step through one of Dialga's portals into a galaxy
   where the cove's moments float as living paintings in gold frames.
   Poke a painting to fall back into the world at that time of day;
   poke empty space to go home. Also: the soft vignette that makes the
   world read like a framed picture.
------------------------------------------------------------------- */
const Gallery = (() => {
  const { hex, mix, hash2, fbm, bayer4 } = PX;
  const W0 = 384, H0 = 216;
  const PIECES = [
    { make: () => Paintings.dawn() }, { make: () => Paintings.noon() }, { make: () => Fun.party() }, { make: () => Fun.volley() }, { make: () => Paintings.surf() },
    { make: () => Fun.launch() }, { make: () => Fun.reef() }, { make: () => Fun.sky() }, { make: () => Paintings.dusk() }, { make: () => Paintings.night() },
  ];
  const SND = { boing: ['boing', 0.7], cry: ['mud', 0.9], jump: ['whoosh', 0.3], plip: ['plop', 0.5], splash: ['splash', 0.5], twinkle: ['twinkle', 0.6] };
  // run a scene step without letting it leave particles in the shared list
  const quiet = (fn) => { const n = FX.list.length; fn(); FX.list.length = n; };
  const S = { on: false, t: 0, in: 0, out: 0, target: null, flash: 0, rr: 0, bg: null, bgW: 0, bgH: 0, hover: -1 };
  const gold = [hex('#5a3a12'), hex('#a8701e'), hex('#e0a83a'), hex('#ffe08a'), hex('#fff6d0')];
  const glowC = hex('#8fdcff'), white = hex('#ffffff');

  function ensure() {
    for (const p of PIECES) {
      if (p.inst) continue;
      p.inst = p.make();
      quiet(() => { if (p.inst.warm) p.inst.warm(1.2); else p.inst.step(1 / 30); });
      p.buf = new PX.Buf(W0, H0);
      p.acc = 0;
      p.inst.draw(p.buf);
    }
  }
  function nebula(w, h) {
    const b = new PX.Buf(w, h);
    const c0 = hex('#05061a'), c1 = hex('#1a1050'), c2 = hex('#4a1e78'), c3 = hex('#b04a9a'), c4 = hex('#3a8ad8');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.006, y * 0.009, 3, 5), m = fbm(x * 0.012 + 40, y * 0.012, 7, 4);
      const band = Math.exp(-(((y - h * 0.5) - (x - w * 0.5) * 0.35) ** 2) / (h * h * 0.06));
      let c = mix(c0, c1, Math.min(1, n * 1.2));
      const k = Math.max(0, n * band * 1.6 - 0.3);
      c = mix(c, c2, Math.min(1, k * 1.4));
      if (m > 0.62) c = mix(c, c3, Math.min(0.6, (m - 0.62) * 3 * band));
      if (m < 0.3) c = mix(c, c4, Math.min(0.35, (0.3 - m) * 2 * band));
      // posterise with a dither so it stays pixel art
      const q = bayer4(x, y) * 0.06;
      if (hash2(x, y) > 0.994 - q) c = mix(c, white, 0.8);
      b.d[y * w + x] = c;
    }
    return b;
  }
  function layout(w, h) {
    const cols = 5, gap = Math.max(8, Math.round(w * 0.025));
    const fw = Math.min(W0, Math.floor((w - gap * (cols + 1)) / cols)), s = fw / W0, fh = Math.round(H0 * s);
    const rowY = [Math.round(h * 0.33 - fh / 2), Math.round(h * 0.68 - fh / 2)];
    const out = [];
    for (let i = 0; i < PIECES.length; i++) {
      const row = i < cols ? 0 : 1, col = i % cols, total = cols * fw + (cols - 1) * gap;
      out.push({ x: Math.round((w - total) / 2 + col * (fw + gap)), y: rowY[row], w: fw, h: fh, s });
    }
    return out;
  }
  /* ---- full-screen scene mode ---- */
  let layer = null, scv = null, sctx = null, simg = null, sbuf = null, cur = null, saved = null;
  function buildLayer() {
    layer = document.createElement('div');
    layer.id = 'scene-layer';
    layer.style.cssText = 'position:absolute;inset:0;z-index:4;display:none;place-items:center;background:#05061a;touch-action:none';
    scv = document.createElement('canvas'); scv.width = W0; scv.height = H0;
    scv.style.cssText = 'image-rendering:pixelated;width:min(100vw,calc(100vh*16/9));height:auto;aspect-ratio:16/9;cursor:pointer';
    const back = document.createElement('button');
    back.className = 'hb'; back.type = 'button'; back.setAttribute('aria-label', 'Back to the gallery');
    back.style.cssText = 'position:absolute;top:max(16px,env(safe-area-inset-top));left:max(16px,env(safe-area-inset-left))';
    back.innerHTML = '<svg viewBox="-1 -1 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="4" width="10" height="2" fill="#ffffff"/><rect x="1" y="3" width="2" height="4" fill="#ffffff"/><rect x="2" y="2" width="2" height="6" fill="#ffffff"/><rect x="3" y="1" width="2" height="8" fill="#ffffff"/><rect x="4" y="0" width="1" height="10" fill="#9ff3ff"/></svg>';
    back.addEventListener('click', (e) => { e.stopPropagation(); closeScene(); });
    layer.append(scv, back);
    document.getElementById('game').appendChild(layer);
    sctx = scv.getContext('2d'); simg = sctx.createImageData(W0, H0); sbuf = new PX.Buf(W0, H0); sbuf.d = new Uint32Array(simg.data.buffer);
    scv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!cur) return;
      const r = scv.getBoundingClientRect();
      cur.inst.tap(((e.clientX - r.left) / r.width) * W0, ((e.clientY - r.top) / r.height) * H0);
    });
  }
  function openScene(p) {
    if (!layer) buildLayer();
    cur = p; saved = FX.list.splice(0);
    layer.style.display = 'grid';
    Game.sfx('portal', null, 0.8); Game.sfx('chime', null, 0.5);
    S.sceneIn = 1;
  }
  function closeScene() {
    if (!cur) return;
    cur = null; layer.style.display = 'none';
    FX.list.length = 0; if (saved) FX.list.push(...saved); saved = null;
    Game.sfx('whoosh', null, 0.7);
    S.in = 0.6;
  }
  function enter() {
    ensure();
    S.on = true; S.t = 0; S.in = 1; S.out = 0; S.target = null;
    Game.gallery = true;
    document.getElementById('game').classList.add('in-gallery');
    Game.sfx('portal', null, 1); Game.sfx('chime', null, 0.7);
    Sound.setUnder(0);
  }
  function leave(hour) {
    if (S.out > 0) return;
    S.out = 0.9; S.target = hour;
    Game.sfx('timewave', null, 1); Game.sfx('whoosh', null, 0.7);
  }
  function update(dt) {
    S.t += dt;
    if (S.in > 0) S.in = Math.max(0, S.in - dt * 1.4);
    if (cur) {
      const evs = cur.inst.step(dt) || [];
      for (const e of evs) { const m = SND[e.name]; if (m) Game.sfx(m[0], null, m[1]); }
      FX.update(dt);
      cur.inst.draw(sbuf);
      if (S.sceneIn > 0) { S.sceneIn = Math.max(0, S.sceneIn - dt * 2); const k = S.sceneIn; if (k > 0) for (let i = 0; i < sbuf.d.length; i++) sbuf.d[i] = mix(sbuf.d[i], white, k * 0.9); }
      sctx.putImageData(simg, 0, 0);
      return;
    }
    for (const p of PIECES) p.acc += dt;
    for (let k = 0; k < 2; k++) {
      const p = PIECES[S.rr++ % PIECES.length];
      const a = Math.min(p.acc, 0.25); p.acc = 0;
      quiet(() => p.inst.step(a));
      p.inst.draw(p.buf);
    }
    if (S.out > 0) {
      S.out -= dt;
      if (S.out <= 0) {
        S.on = false; Game.gallery = false; S.flash = 1;
        document.getElementById('game').classList.remove('in-gallery');
        if (S.target) Game.setHour(Times.ORDER.indexOf(S.target));
        const d = typeof Magic !== 'undefined' && Magic.S.dialga;
        if (d) { d.say && d.say(); FX.sparkles(d.x, d.y - 60, 12, 40, white, glowC); }
      }
    }
  }
  function draw(fb) {
    if (cur) return;
    const w = fb.w, h = fb.h, t = S.t;
    if (!S.bg || S.bgW !== w || S.bgH !== h) { S.bg = nebula(w, h); S.bgW = w; S.bgH = h; }
    // drifting nebula + twinkling stars
    const dx = Math.round(t * 3) % w;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) fb.d[row + x] = S.bg.d[row + ((x + dx) % w)];
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash2(i, 1) * w), y = Math.floor(hash2(i, 2) * h), tw = Math.sin(t * (1 + hash2(i, 3) * 3) + i);
      if (tw > 0.2) { fb.set(x, y, white); if (tw > 0.85) { fb.set(x - 1, y, glowC); fb.set(x + 1, y, glowC); fb.set(x, y - 1, glowC); fb.set(x, y + 1, glowC); } }
    }
    // a slow clock ring behind everything — Dialga's time
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    for (let j = 0; j < 60; j++) {
      const a = j * 0.1047 + t * 0.05, big = j % 5 === 0, len = big ? 7 : 3;
      for (let k = 0; k < len; k++) {
        const x = Math.round(cx + Math.cos(a) * (R - k)), y = Math.round(cy + Math.sin(a) * (R - k));
        if (x >= 0 && y >= 0 && x < w && y < h) fb.d[y * w + x] = mix(fb.d[y * w + x], big ? glowC : white, big ? 0.7 : 0.35);
      }
    }
    const hand = (a, L, c) => { for (let k = 0; k < L; k++) { const x = Math.round(cx + Math.cos(a) * k), y = Math.round(cy + Math.sin(a) * k); if (x >= 0 && y >= 0 && x < w && y < h) fb.d[y * w + x] = mix(fb.d[y * w + x], c, 0.35); } };
    hand(t * 0.4 - 1.57, R * 0.8, glowC); hand(t * 0.033 - 1.57, R * 0.55, white);
    // floating framed paintings
    const L = layout(w, h);
    PIECES.forEach((p, i) => {
      const f = L[i], bob = Math.round(Math.sin(t * 0.9 + i * 1.3) * 3), X = f.x, Y = f.y + bob, hov = S.hover === i;
      p.rect = { x: X, y: Y, w: f.w, h: f.h };
      // soft glow halo
      for (let r = 10; r >= 1; r--) {
        const k = (hov ? 0.5 : 0.28) * (1 - r / 11);
        for (let x = X - 4 - r; x < X + f.w + 4 + r; x++) for (const y of [Y - 4 - r, Y + f.h + 3 + r]) if (x >= 0 && y >= 0 && x < w && y < h && bayer4(x, y) < k * 2) fb.d[y * w + x] = mix(fb.d[y * w + x], glowC, 0.3);
        for (let y = Y - 4 - r; y < Y + f.h + 4 + r; y++) for (const x of [X - 4 - r, X + f.w + 3 + r]) if (x >= 0 && y >= 0 && x < w && y < h && bayer4(x, y) < k * 2) fb.d[y * w + x] = mix(fb.d[y * w + x], glowC, 0.3);
      }
      // gilded frame
      for (let k = 0; k < 4; k++) {
        const c = gold[[1, 3, 2, 0][k]];
        for (let x = X - 4 + k; x < X + f.w + 4 - k; x++) { fb.set(x, Y - 4 + k, c); fb.set(x, Y + f.h + 3 - k, gold[[0, 1, 1, 0][k]]); }
        for (let y = Y - 4 + k; y < Y + f.h + 4 - k; y++) { fb.set(X - 4 + k, y, c); fb.set(X + f.w + 3 - k, y, gold[[0, 1, 1, 0][k]]); }
      }
      for (const [ox, oy] of [[-4, -4], [f.w + 1, -4], [-4, f.h + 1], [f.w + 1, f.h + 1]]) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) fb.set(X + ox + a, Y + oy + b, gold[a + b > 2 ? 2 : 4]);
      // the living painting, sampled down into the frame
      const s = f.s, src = p.buf.d;
      for (let y = 0; y < f.h; y++) {
        const sy = Math.min(H0 - 1, Math.floor(y / s)), py = Y + y;
        if (py < 0 || py >= h) continue;
        for (let x = 0; x < f.w; x++) {
          const px = X + x;
          if (px < 0 || px >= w) continue;
          fb.d[py * w + px] = src[sy * W0 + Math.min(W0 - 1, Math.floor(x / s))];
        }
      }
      // glass glint sweeping across
      const g = ((t * 0.25 + i * 0.19) % 1.6) * (f.w + f.h) - f.h;
      for (let y = 0; y < f.h; y++) for (let k = 0; k < 3; k++) { const x = Math.round(g + y * 0.6) + k; if (x >= 0 && x < f.w) { const i2 = (Y + y) * w + X + x; if (Y + y >= 0 && Y + y < h) fb.d[i2] = mix(fb.d[i2], white, 0.25); } }
    });
    // arrival / departure swirl: the world dissolves in from a ring of light
    const k = S.in > 0 ? S.in : S.out > 0 ? 1 - S.out / 0.9 : 0;
    if (k > 0) {
      const rr = (1 - k) * Math.hypot(w, h) * 0.6;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (S.in > 0 ? d > rr : d < Math.hypot(w, h) * 0.6 * k) fb.d[y * w + x] = S.in > 0 ? mix(fb.d[y * w + x], white, Math.min(1, (d - rr) / 30)) : mix(fb.d[y * w + x], white, 0.85);
        else if (Math.abs(d - rr) < 3) fb.d[y * w + x] = glowC;
      }
    }
  }
  function poke(x, y) {
    if (S.in > 0.3 || S.out > 0) return;
    for (let i = 0; i < PIECES.length; i++) {
      const r = PIECES[i].rect;
      if (r && x >= r.x - 4 && y >= r.y - 4 && x < r.x + r.w + 4 && y < r.y + r.h + 4) {
        S.hover = i; Game.sfx('twinkle', null, 0.8);
        openScene(PIECES[i]);
        return;
      }
    }
    leave(null);
  }
  // soft picture-frame vignette and the white flash after a warp
  let vig = null, vw = 0, vh = 0;
  function post(fb) {
    const w = fb.w, h = fb.h, d = fb.d;
    if (!vig || vw !== w || vh !== h) {
      vig = new Uint8Array(w * h); vw = w; vh = h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x / w - 0.5) * 2, v = (y / h - 0.5) * 2, r = Math.max(0, Math.hypot(u * 0.9, v) - 0.72);
        vig[y * w + x] = Math.round(Math.min(0.32, r * r * 0.9) * 255 + bayer4(x, y) * 6);
      }
    }
    for (let i = 0; i < d.length; i++) {
      const k = vig[i];
      if (k < 8) continue;
      const c = d[i], f = 255 - k;
      d[i] = (c & 0xff000000) | ((((c >>> 16) & 255) * f >> 8) << 16) | ((((c >>> 8) & 255) * f >> 8) << 8) | ((c & 255) * f >> 8);
    }
    if (S.flash > 0) {
      S.flash = Math.max(0, S.flash - 0.03);
      for (let i = 0; i < d.length; i++) d[i] = mix(d[i], white, S.flash * 0.8);
    }
  }
  return { S, enter, leave, update, draw, poke, post, openScene, closeScene, PIECES };
})();
