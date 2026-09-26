/* ------------------------------------------------------------------
   FX — cartoon / anime effects in world space. No letters anywhere
   except Dialga's "yo" bubble.
------------------------------------------------------------------- */
const FX = (() => {
  const { hex, bayer4, hash2 } = PX;
  const C = {
    k: hex('#1a1c2c'), w: hex('#ffffff'), r: hex('#ff4a6a'), l: hex('#ffc2cf'), b: hex('#5ab8ff'), c: hex('#b8e8ff'),
    y: hex('#ffd83a'), o: hex('#ff9a2a'), g: hex('#8a8a9a'), p: hex('#c080ff'), a: hex('#e82a3a'), n: hex('#2a2c48'),
  };
  const ICON = {
    fish: ['..ww...', '.wwwwk.w', 'wwkwwwww', '.wwwwk.w', '..ww....'].map((r) => r.slice(0, 8)),
    heart: ['.rr.rr.', 'rlrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    note: ['...kk', '..kkk', '..k.k', '..k..', '.kk..', 'kkk..', '.k...'],
    sweat: ['.b..', '.bb.', 'bcbb', 'bcbb', 'bbbb', '.bb.'],
    anger: ['aa.aa', 'a...a', '.....', 'a...a', 'aa.aa'],
    swirl: ['.kkkk..', 'k....k.', 'k.kk..k', 'k.k.k.k', 'k..k..k', '.k...k.', '..kkk..'],
    bulb: ['..yyy..', '.yyyyy.', 'yywyyyy', 'yyyyyyy', '.yyyyy.', '..yyy..', '..ggg..', '..ggg..'],
    star: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'yy...yy'],
    drop: ['..b..', '.bcb.', 'bccbb', 'bcbbb', '.bbb.'],
    shock: ['y...y...y', '.y..y..y.', '..y.y.y..', '.........', 'yyy...yyy', '.........', '..y.y.y..', '.y..y..y.', 'y...y...y'],
    tear: ['.b.', 'bcb', 'bbb'],
    music2: ['..kkkk', '..k..k', '..k..k', '.kk.kk', 'kkkkkk', '.k..k.'],
    sparkle: ['...w...', '...w...', '..www..', 'wwwwwww', '..www..', '...w...', '...w...'],
  };
  const GLYPH = { y: ['k...k', 'k...k', '.k.k.', '..k..', '..k..', '.k...', 'k....'], o: ['.....', '.kkk.', 'k...k', 'k...k', 'k...k', 'k...k', '.kkk.'] };

  const list = [];
  const add = (p) => { list.push(Object.assign({ age: 0, life: 1, vx: 0, vy: 0, g: 0, layer: 1 }, p)); return p; };

  function stamp(fb, spr, x, y, cx, cy, fade = 0) {
    const w = spr[0].length;
    for (let r = 0; r < spr.length; r++)
      for (let c = 0; c < w; c++) {
        const ch = spr[r][c];
        if (ch === '.') continue;
        const X = Math.round(x) + c - cx, Y = Math.round(y) + r - cy;
        if (fade > 0 && bayer4(X, Y) < fade) continue;
        fb.set(X, Y, C[ch]);
      }
  }
  // emote bubble with a pictogram, following a getter for the anchor point
  function emote(icon, at, o = {}) {
    return add({ type: 'emote', icon, at, life: o.life ?? 1.6, layer: 3 });
  }
  function bubbleRect(fb, x, y, w, h, cx, cy, fade) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const corner = (xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1);
        if (corner) continue;
        const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1 || ((xx === 1 || xx === w - 2) && (yy === 1 || yy === h - 2) && false);
        const X = x + xx - cx, Y = y + yy - cy;
        if (fade > 0 && bayer4(X, Y) < fade) continue;
        fb.set(X, Y, edge ? C.k : C.w);
      }
    // tail
    for (let k = 0; k < 3; k++) { fb.set(x + 3 + k - cx, y + h + k - cy - 1, k === 2 ? C.k : C.w); fb.set(x + 2 + k - cx, y + h + k - cy - 1, C.k); fb.set(x + 4 + k - cx, y + h + k - cy - 1, C.k); }
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.delay) { p.delay -= dt; p.age -= dt; if (p.delay > 0) continue; p.delay = 0; }
      if (p.age >= p.life) { if (p.onDie) p.onDie(p); list.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.drag) { p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt); }
      if (p.type === 'grain') {
        p.vx += ((typeof Wind !== 'undefined' ? Wind.v : 0.4) * 60 - p.vx) * dt * 0.8;
        const g = World.groundAt(Math.max(0, Math.min(World.W, p.x)));
        if (p.y >= g - 1) { p.y = g - 1; p.vy = -Math.abs(p.vy) * 0.3; p.vx *= 0.6; if (Math.abs(p.vy) < 12) { p.vy = -Math.random() * 25 * (typeof Wind !== 'undefined' ? Wind.v : 0.4); if (typeof Moves !== 'undefined' && Math.random() < 0.35) { Moves.addSand(p.x, 0.25); list.splice(i, 1); continue; } } }
        if (g > World.SEA + 2 && p.y > World.SEA - 2) { list.splice(i, 1); continue; }
      }
      if (p.floor !== undefined && p.vy > 0 && p.y >= p.floor) { if (p.onFloor) p.onFloor(p); list.splice(i, 1); }
      else if (p.ceil !== undefined && p.y <= p.ceil) { if (p.onCeil) p.onCeil(p); list.splice(i, 1); }
    }
  }

  function draw(fb, cx, cy, layer, t) {
    for (const p of list) {
      if (p.layer !== layer || p.delay > 0) continue;
      const k = p.age / p.life;
      const x = Math.round(p.x) - cx, y = Math.round(p.y) - cy;
      if (p.type !== 'emote' && p.type !== 'say' && (x < -40 || y < -40 || x > fb.w + 40 || y > fb.h + 40)) continue;
      switch (p.type) {
        case 'drop': fb.set(x, y, p.c); if (p.size > 1) fb.set(x, y - Math.sign(p.vy || 1), p.c2 || p.c); break;
        case 'grain': if (k < 0.85 || bayer4(x, y) > (k - 0.85) * 6) { fb.set(x, y, p.c); if (p.vx > 30) fb.set(x - 1, y, p.c2 || p.c); } break;
        case 'bubble': {
          const r = p.r || 1.5;
          if (r < 1.2) { fb.set(x, y, p.c); break; }
          fb.ring(x + 0.5, y + 0.5, r, r, p.c);
          fb.set(x - 1, y - 1, C.w);
          break;
        }
        case 'ripple': {
          const rx = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k)), ry = rx * (p.flat || 0.3);
          fb.ring(x, y, rx, ry, p.c, (X, Y, a) => (k < 0.4 || bayer4(X, Y) > (k - 0.4) * 1.6) && (Math.sin(a) > -0.2 || (X + Y) % 2 === 0));
          break;
        }
        case 'spark': {
          const s = Math.round(Math.sin(k * Math.PI) * p.size);
          if (s <= 0) fb.set(x, y, p.c2 || p.c); else Scenery.star(fb, x, y, s, p.c, p.c2);
          break;
        }
        case 'burst': {
          // comic impact star: spiky polygon, white core, yellow rim, radial ticks
          const R = p.r * (0.6 + Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * 0.6);
          const spikes = p.spikes || 8;
          for (let yy = -R - 2; yy <= R + 2; yy++)
            for (let xx = -R - 2; xx <= R + 2; xx++) {
              const a = Math.atan2(yy, xx), d = Math.hypot(xx, yy);
              const rr = R * (0.62 + 0.38 * Math.abs(Math.cos((a * spikes) / 2)));
              if (d > rr) continue;
              if (k > 0.55 && bayer4(x + xx, y + yy) < (k - 0.55) * 2.2) continue;
              fb.set(x + xx, y + yy, d > rr - 1.5 ? C.o : d > rr * 0.55 ? C.y : C.w);
            }
          break;
        }
        case 'dust': {
          const r = p.r * (0.5 + k * 0.9);
          for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
            if (xx * xx + yy * yy > r * r) continue;
            if (bayer4(x + xx, y + yy) < k * 1.1) continue;
            fb.set(x + xx, y + yy, xx + yy < -r * 0.3 ? p.c2 || p.c : p.c);
          }
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sin(k * Math.PI / 2);
          fb.ring(x, y, r, r * (p.flat || 1), p.c, (X, Y) => bayer4(X, Y) > k * 0.9);
          if (p.thick) fb.ring(x, y, r - 1, (r - 1) * (p.flat || 1), p.c2 || p.c, (X, Y) => bayer4(X, Y) > k);
          break;
        }
        case 'icon': stamp(fb, ICON[p.icon], p.x - ICON[p.icon][0].length / 2, p.y, cx, cy, k > 0.6 ? (k - 0.6) * 2.4 : 0); break;
        case 'confetti': {
          const c = p.c;
          const flip = Math.sin(p.age * 12 + p.ph) > 0;
          fb.set(x, y, c); if (flip) fb.set(x + 1, y, c); else fb.set(x, y + 1, c);
          break;
        }
        case 'speed': {
          const len = p.len * (1 - k);
          for (let j = 0; j < len; j++) if (bayer4(x - j * p.dx, y) > k) fb.set(x - Math.round(j * p.dx), y - Math.round(j * p.dy), p.c);
          break;
        }
        case 'dizzy': {
          const o = p.at();
          for (let s = 0; s < 3; s++) {
            const a = p.age * 5 + (s * Math.PI * 2) / 3;
            const sx = Math.round(o[0] + Math.cos(a) * p.rx) - cx, sy = Math.round(o[1] + Math.sin(a) * p.rx * 0.35) - cy;
            if (Math.sin(a) < 0 && (s + Math.floor(p.age * 10)) % 2) continue;
            Scenery.star(fb, sx, sy, 1, C.y, C.o);
          }
          break;
        }
        case 'emote': {
          const o = p.at();
          const pop = k < 0.12 ? Math.round((1 - k / 0.12) * 4) : 0;
          const bx = Math.round(o[0]) + 4, by = Math.round(o[1]) - 16 - pop;
          const ic = ICON[p.icon];
          const w = Math.max(11, ic[0].length + 6), h = Math.max(10, ic.length + 5);
          const fade = k > 0.82 ? (k - 0.82) * 5 : 0;
          bubbleRect(fb, bx, by, w, h, cx, cy, fade);
          stamp(fb, ic, bx + Math.floor((w - ic[0].length) / 2), by + Math.floor((h - ic.length) / 2), cx, cy, fade);
          break;
        }
        case 'say': {
          // Dialga's speech bubble: the only words in the game
          const o = p.at();
          const pop = k < 0.1 ? Math.round((1 - k / 0.1) * 6) : 0;
          const wob = Math.round(Math.sin(p.age * 9) * (k < 0.3 ? 1 : 0));
          const bx = Math.round(o[0]) + 6, by = Math.round(o[1]) - 24 - pop + wob;
          const w = 21, h = 14;
          const fade = k > 0.85 ? (k - 0.85) * 6 : 0;
          bubbleRect(fb, bx, by, w, h, cx, cy, fade);
          stamp(fb, GLYPH.y, bx + 4, by + 3, cx, cy, fade);
          stamp(fb, GLYPH.o, bx + 11, by + 3, cx, cy, fade);
          break;
        }
        case 'fn': p.draw(fb, p, k, cx, cy, t); break;
      }
    }
  }

  /* ---- composite effects ---- */
  function splashAt(x, y, o = {}) {
    const power = o.power ?? 1, n = o.n ?? 16;
    if (typeof Ripples !== 'undefined' && typeof Game !== 'undefined' && !Game.gallery && Math.abs(y - World.SEA) < 40) Ripples.poke(x, 70 * power, 3 + Math.round(power * 3));
    const c = o.c ?? C.w, c2 = o.c2 ?? hex('#8fd6ee');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      add({ type: 'drop', x: x + Math.cos(a) * 5, y: y - 1, vx: Math.cos(a) * (30 + Math.random() * 50) * power, vy: -(70 + Math.random() * 110) * power, g: 430, life: 2, c, c2, size: Math.random() < 0.5 ? 2 : 1, floor: y + 2, layer: 2,
        onFloor: (p) => add({ type: 'ripple', x: p.x, y: y + 1, r0: 0.5, r1: 3, flat: 0.35, life: 0.4, c: o.ring ?? hex('#e8fbff'), layer: 2 }) });
    }
    for (let i = 0; i < 10 * power; i++) {
      const side = i % 2 ? 1 : -1, a = -Math.PI / 2 + side * (0.25 + Math.random() * 0.4);
      const sp = (120 + Math.random() * 90) * power;
      add({ type: 'drop', x: x + side * (4 + Math.random() * 6), y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 560, life: 2, c, c2, size: 2, floor: y + 2, layer: 2 });
    }
    add({ type: 'ripple', x, y: y + 1, r0: 6, r1: 30 * power, flat: 0.3, life: 1.1, c: o.ring ?? hex('#e8fbff'), layer: 2 });
    add({ type: 'ripple', x, y: y + 1, r0: 3, r1: 16 * power, flat: 0.3, life: 0.8, c: o.ring ?? hex('#e8fbff'), layer: 2 });
  }
  function bonk(x, y, r = 9) {
    add({ type: 'burst', x, y, r, life: 0.32, layer: 3 });
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; add({ type: 'speed', x: x + Math.cos(a) * r * 1.4, y: y + Math.sin(a) * r * 1.4, dx: -Math.cos(a), dy: -Math.sin(a), len: 6, life: 0.25, c: C.w, layer: 3 }); }
  }
  function poof(x, y, c, c2, n = 6, r = 5) {
    for (let i = 0; i < n; i++) add({ type: 'dust', x: x + (Math.random() - 0.5) * r * 3, y: y - Math.random() * r, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, r: r * (0.6 + Math.random() * 0.6), life: 0.5 + Math.random() * 0.3, c, c2, layer: 2 });
  }
  function sparkles(x, y, n = 6, spread = 24, c = C.w, c2 = C.y) {
    for (let i = 0; i < n; i++) add({ type: 'spark', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.8, size: 1 + Math.floor(Math.random() * 3), life: 0.45 + Math.random() * 0.4, c, c2, layer: 3 });
  }
  function floatIcon(icon, x, y, o = {}) { return add({ type: 'icon', icon, x, y, vx: (Math.random() - 0.5) * 10, vy: -18, life: o.life ?? 1.2, layer: 3 }); }
  function confetti(x, y, n = 40) {
    const cols = [C.r, C.y, C.b, C.p, C.o, hex('#6aff8a')];
    for (let i = 0; i < n; i++) add({ type: 'confetti', x, y, vx: (Math.random() - 0.5) * 220, vy: -120 - Math.random() * 160, g: 260, drag: 0.35, life: 2.2 + Math.random(), c: cols[i % cols.length], ph: Math.random() * 6, layer: 3 });
  }
  function bubbles(x, y, n = 5, ceil) {
    for (let i = 0; i < n; i++) add({ type: 'bubble', x: x + (Math.random() - 0.5) * 8, y: y - Math.random() * 6, vx: (Math.random() - 0.5) * 6, vy: -20 - Math.random() * 25, r: Math.random() < 0.4 ? 2.5 : 1, life: 4, c: hex('#e0faff'), ceil, layer: 2 });
  }
  function say(at, life = 2.6) { return add({ type: 'say', at, life, layer: 4 }); }

  return { list, add, update, draw, emote, splashAt, bonk, poof, sparkles, floatIcon, confetti, bubbles, say, ICON, C, stamp };
})();
