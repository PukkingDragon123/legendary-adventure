/* ------------------------------------------------------------------
   FX — cartoon particles, glows, shadows, Dialga's "yo" bubble and
   the two warps: a time ripple (clock wave) and a space portal.
------------------------------------------------------------------- */
const FX = (() => {
  const { hex, mix, bayer4, hash2, rgbOf, pack } = PX;
  const W = 384, H = 216;
  const C = {
    k: hex('#1b2240'), w: hex('#ffffff'), y: hex('#ffe45a'), r: hex('#ff4a5a'), b: hex('#8ad8ff'), bd: hex('#3a8ad0'),
    g: hex('#7ac850'), gd: hex('#3a7a2a'), pk: hex('#ff7aa8'), sand: hex('#f4e2b8'), cy: hex('#9ff3ff'), p: hex('#b08aff'), s: hex('#c8d4e4'),
  };
  const GL = {
    star: ['..x..', '.xxx.', 'xxwxx', '.xxx.', '..x..'],
    heart: ['.x.x.', 'xwxxx', 'xxxxx', '.xxx.', '..x..'],
    note: ['..xxx', '..x.x', '..x..', 'xxx..', 'xxx..'],
    anger: ['xx.xx', 'x...x', '.....', 'x...x', 'xx.xx'],
    sweat: ['.x.', 'xxx', 'xwx', '.x.'],
    fish: ['.xx.x', 'xwxxx', '.xx.x'],
    y: ['x..x', 'x..x', 'x..x', '.xxx', '...x', '.xx.'],
    o: ['....', '....', '.xx.', 'x..x', 'x..x', '.xx.'],
  };
  function glyph(fb, g, x, y, col, ol = C.k) {
    const m = GL[g] || g, X = Math.round(x) - (m[0].length >> 1), Y = Math.round(y) - (m.length >> 1);
    if (ol) for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c] !== '.') {
      fb.set(X + c - 1, Y + r, ol); fb.set(X + c + 1, Y + r, ol); fb.set(X + c, Y + r - 1, ol); fb.set(X + c, Y + r + 1, ol);
    }
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      const ch = m[r][c];
      if (ch !== '.') fb.set(X + c, Y + r, ch === 'w' ? C.w : col);
    }
  }
  const add = (c, a, k) => {
    const p = rgbOf(c), q = rgbOf(a);
    return pack(Math.min(255, p[0] + q[0] * k), Math.min(255, p[1] + q[1] * k), Math.min(255, p[2] + q[2] * k));
  };
  function glow(fb, x, y, r, col, k = 1) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px - x, py - y) / r;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * k;
      if (f > 0.04) { const i = py * W + px; fb.d[i] = add(fb.d[i], col, Math.min(1, f)); }
    }
  }
  function shadow(fb, x, y, rx, ry, k = 0.72) {
    for (let py = Math.floor(y - ry); py <= y + ry; py++) for (let px = Math.floor(x - rx); px <= x + rx; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const d = ((px + 0.5 - x) / rx) ** 2 + ((py + 0.5 - y) / ry) ** 2;
      if (d > 1 || (d > 0.55 && bayer4(px, py) < (d - 0.55) * 2.2)) continue;
      const i = py * W + px, p = rgbOf(fb.d[i]);
      fb.d[i] = pack(p[0] * k, p[1] * k * 1.02, p[2] * k * 1.1);
    }
  }
  // Dialga's speech bubble — the only words in the game
  function say(fb, x, y, k = 1) {
    x = Math.round(x); y = Math.round(y);
    const bw = 15, bh = 11, x0 = x - 7, y0 = y - bh - 4;
    for (let py = 0; py < bh; py++) for (let px = 0; px < bw; px++) {
      const corner = (px === 0 || px === bw - 1) && (py === 0 || py === bh - 1);
      if (corner) continue;
      const edge = px === 0 || py === 0 || px === bw - 1 || py === bh - 1;
      fb.set(x0 + px, y0 + py, edge ? C.k : C.w);
    }
    fb.set(x - 1, y0 + bh, C.w); fb.set(x, y0 + bh, C.w); fb.set(x - 2, y0 + bh, C.k); fb.set(x + 1, y0 + bh, C.k);
    fb.set(x - 1, y0 + bh + 1, C.w); fb.set(x - 2, y0 + bh + 1, C.k); fb.set(x, y0 + bh + 1, C.k); fb.set(x - 1, y0 + bh + 2, C.k);
    glyph(fb, 'y', x0 + 5, y0 + 5, C.k, 0); glyph(fb, 'o', x0 + 10, y0 + 5, C.k, 0);
  }

  /* ---------------------------- particles ---------------------------- */
  const list = [];
  function spawn(p) { list.push(Object.assign({ t: 0, life: 1, vx: 0, vy: 0, g: 0, drag: 0, layer: 'front' }, p)); }
  const R = (a, b) => a + Math.random() * (b - a);
  const api = {
    stars(x, y, n = 6, layer) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R(-0.3, 0.3), s = R(50, 90); spawn({ k: 'glyph', g: 'star', col: C.y, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 120, life: R(0.45, 0.7), layer }); } },
    hearts(x, y, n = 3, layer) { for (let i = 0; i < n; i++) spawn({ k: 'glyph', g: 'heart', col: C.pk, x: x + R(-8, 8), y: y + R(-4, 4), vx: R(-10, 10), vy: R(-38, -24), life: R(0.9, 1.4), wob: R(0, 6), layer }); },
    notes(x, y, n = 2, layer) { for (let i = 0; i < n; i++) spawn({ k: 'glyph', g: 'note', col: [C.y, C.pk, C.b][i % 3], x: x + R(-6, 6), y, vx: R(-14, 14), vy: R(-30, -20), life: 1.1, wob: R(0, 6), layer }); },
    anger(x, y, layer) { spawn({ k: 'glyph', g: 'anger', col: C.r, x, y, life: 0.9, pulse: 1, layer }); },
    sweat(x, y, layer) { spawn({ k: 'glyph', g: 'sweat', col: C.b, x, y, vx: 14, vy: -20, g: 90, life: 0.7, layer }); },
    fish(x, y, layer) { spawn({ k: 'glyph', g: 'fish', col: C.s, x, y, vx: R(-20, 20), vy: -60, g: 260, life: 1.2, layer }); },
    sparks(x, y, n = 6, col = C.w, spread = 14, layer) { for (let i = 0; i < n; i++) spawn({ k: 'spark', col, x: x + R(-spread, spread), y: y + R(-spread, spread) * 0.8, life: R(0.35, 0.7), layer }); },
    dust(x, y, n = 5, col = C.sand, layer) { for (let i = 0; i < n; i++) spawn({ k: 'dust', col, x: x + R(-6, 6), y: y - R(0, 3), vx: R(-26, 26), vy: R(-14, -2), drag: 3, life: R(0.4, 0.7), layer }); },
    drops(x, y, n = 8, p = 1, layer) { for (let i = 0; i < n; i++) spawn({ k: 'drop', col: i % 3 ? C.b : C.w, x: x + R(-4, 4), y, vx: R(-40, 40) * p, vy: R(-120, -50) * p, g: 330, life: R(0.5, 0.9), layer }); },
    leaves(x, y, n = 6, layer) { for (let i = 0; i < n; i++) spawn({ k: 'leaf', col: i % 2 ? C.g : C.gd, x: x + R(-20, 20), y: y + R(-8, 8), vx: R(-20, 20), vy: R(-10, 10), g: 30, drag: 1.2, life: R(1.2, 2), wob: R(0, 6), layer }); },
    ring(x, y, r0 = 2, r1 = 24, col = C.w, life = 0.5, layer) { spawn({ k: 'ring', col, x, y, r0, r1, life, layer }); },
    bubbles(x, y, n = 4, layer, top = 0) { for (let i = 0; i < n; i++) spawn({ k: 'bubble', x: x + R(-5, 5), y: y + R(-3, 3), vy: R(-30, -16), r: Math.random() < 0.3 ? 2 : 1, life: R(1.2, 2.6), wob: R(0, 6), top, layer }); },
    feathers(x, y, n = 4, layer) { for (let i = 0; i < n; i++) spawn({ k: 'leaf', col: C.w, x: x + R(-6, 6), y, vx: R(-24, 24), vy: R(-30, -5), g: 20, drag: 1.5, life: 1.6, wob: R(0, 6), layer }); },
    spout(x, y, layer) { for (let i = 0; i < 26; i++) spawn({ k: 'drop', col: i % 3 ? C.w : C.b, x: x + R(-2, 2), y, vx: R(-26, 26), vy: R(-150, -95), g: 150, life: R(1, 1.5), layer }); },
    spawn, list,
  };
  function step(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.life || (p.k === 'bubble' && p.y < p.top)) { list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
      p.x += p.vx * dt + (p.wob !== undefined ? Math.sin(p.t * 5 + p.wob) * 0.25 : 0);
      p.y += p.vy * dt;
    }
  }
  function draw(fb, layer = 'front') {
    for (const p of list) {
      if ((p.layer || 'front') !== layer) continue;
      const k = p.t / p.life, x = Math.round(p.x), y = Math.round(p.y);
      if (p.k === 'glyph') {
        if (k > 0.75 && bayer4(x, y) < (k - 0.75) * 4) continue;
        glyph(fb, p.g, x, y + (p.pulse ? Math.round(Math.sin(p.t * 18)) : 0), p.col);
      } else if (p.k === 'spark') {
        const s = k < 0.5 ? (k < 0.2 ? 1 : 2) : 1;
        fb.set(x, y, p.col);
        if (s > 1) { fb.set(x - 1, y, p.col); fb.set(x + 1, y, p.col); fb.set(x, y - 1, p.col); fb.set(x, y + 1, p.col); }
      } else if (p.k === 'dust') {
        const r = 1 + k * 3.5;
        for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a * a + b * b <= r * r && bayer4(x + a, y + b) > k) fb.set(x + a, y + b, p.col);
      } else if (p.k === 'drop') {
        fb.set(x, y, p.col); if (p.vy < 0) fb.set(x, y + 1, p.col);
      } else if (p.k === 'leaf') {
        const f = Math.sin(p.t * 8 + (p.wob || 0)) > 0;
        fb.set(x, y, p.col); fb.set(f ? x + 1 : x, f ? y : y + 1, p.col);
      } else if (p.k === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k), n = Math.ceil(r * 6.3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283, px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.9);
          if (bayer4(px, py) > k) fb.set(px, py, p.col);
        }
      } else if (p.k === 'bubble') {
        const r = p.r;
        if (r === 1) { fb.set(x, y - 1, C.b); fb.set(x - 1, y, C.b); fb.set(x + 1, y, C.b); fb.set(x, y + 1, C.b); fb.set(x, y, C.w); }
        else { for (let a = 0; a < 12; a++) fb.set(Math.round(x + Math.cos(a * 0.524) * 2), Math.round(y + Math.sin(a * 0.524) * 2), C.b); fb.set(x - 1, y - 1, C.w); }
      }
    }
  }

  /* ------------------------------ warps ------------------------------ */
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
  const WARP = { on: false };
  const cFrost = hex('#9fb8d8'), cRim = hex('#bff6ff'), cCy = hex('#6fe8ff'), cSpace0 = hex('#120a30'), cSpace1 = hex('#3a2a8e'), cArm = hex('#8a6aff'), cMag = hex('#d08aff');
  function startWarp(kind, cx, cy, snap) {
    Object.assign(WARP, { on: true, kind, t: 0, dur: kind === 'time' ? 1.9 : 2.3, cx, cy, A: snap });
  }
  function frost(c, f) {
    const p = rgbOf(c), l = (p[0] * 0.3 + p[1] * 0.55 + p[2] * 0.15);
    const q = rgbOf(cFrost);
    return pack(p[0] + (l * q[0] / 255 - p[0]) * f, p[1] + (l * q[1] / 255 - p[1]) * f, p[2] + (l * q[2] / 255 - p[2]) * f);
  }
  function compose(out, B) {
    const w = WARP, t = w.t, A = w.A.d, Bd = B.d, O = out.d, cx = w.cx, cy = w.cy;
    const Rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 14;
    if (w.kind === 'time') {
      const p = Math.min(1, Math.max(0, (t - 0.25) / 1.45)), r = easeIO(p) * Rmax, fz = Math.min(1, t * 2.5) * 0.7;
      const spin = t * 2.2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        let c;
        if (d < r - 7) {
          c = Bd[i];
          const g = 1 - (r - d) / 28;
          if (g > 0) c = mix(c, cCy, g * 0.45);
        } else if (d < r + 7) {
          const a = Math.atan2(dy, dx), off = Math.sin(a * 9 + t * 14) * 3;
          const sd = Math.max(0, d + off - 7), sx = Math.round(cx + dx / (d || 1) * sd), sy = Math.round(cy + dy / (d || 1) * sd);
          const src = sx >= 0 && sy >= 0 && sx < W && sy < H ? Bd[sy * W + sx] : Bd[i];
          const e = 1 - Math.abs(d - r) / 7;
          c = mix(src, cRim, e * 0.85);
          const tick = ((a + spin) / 6.283 * 12 % 1 + 1) % 1;
          if (tick < 0.07 && d > r - 2 && d < r + 5) c = C.w;
        } else {
          c = frost(A[i], fz);
          const hand = Math.abs(d - r - 12) < 1 && ((Math.atan2(dy, dx) + spin * 0.6) / 6.283 * 60 % 1 + 1) % 1 < 0.2;
          if (hand && p > 0) c = mix(c, cRim, 0.6);
        }
        O[i] = c;
      }
      if (t < 0.5) { const k = t / 0.5; for (let j = 0; j < 12; j++) { const a = j * 0.5236 + spin; for (let s = 0; s < 4; s++) out.set(Math.round(cx + Math.cos(a) * (10 + s + k * 8)), Math.round(cy + Math.sin(a) * (10 + s + k * 8)), cRim); } }
    } else {
      const p = t / w.dur;
      let rp;
      if (p < 0.3) rp = outBack(p / 0.3) * 30; else if (p < 0.48) rp = 30 + (p - 0.3) * 40; else rp = 37 + easeIO(Math.min(1, (p - 0.48) / 0.4)) * (Rmax - 37);
      const tw = Math.sin(Math.min(1, p / 0.5) * Math.PI * 0.5) * 5 * (p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.4));
      const inner = p >= 0.48, RT = Math.max(rp * 2.6, 60);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        let c;
        if (d < rp - 2) {
          if (inner) {
            const k2 = Math.max(0, 1 - (p - 0.48) / 0.42), aa = a + k2 * 4 * (1 - d / rp) ** 2;
            const sx = Math.round(cx + Math.cos(aa) * d), sy = Math.round(cy + Math.sin(aa) * d);
            c = sx >= 0 && sy >= 0 && sx < W && sy < H ? Bd[sy * W + sx] : Bd[i];
            if (k2 > 0) c = mix(c, cSpace1, k2 * 0.5 * (d / rp));
          } else {
            const q = d / rp;
            c = mix(cSpace0, cSpace1, q);
            const arm = Math.sin(a * 3 - d * 0.22 + t * 9);
            if (arm > 0.55) c = mix(c, cArm, (arm - 0.55) * 2);
            if (hash2(Math.floor((a + t * 1.4) * 14), Math.floor(d * 0.6 - t * 26)) > 0.965) c = C.w;
            const hA = t * 9, hB = t * 1.4;
            for (const [ha, hl] of [[hA, 0.8], [hB, 0.55]]) {
              const ux = Math.cos(ha), uy = Math.sin(ha), along = dx * ux + dy * uy, perp = Math.abs(-dx * uy + dy * ux);
              if (along > 0 && along < rp * hl && perp < 0.9) c = cRim;
            }
          }
        } else if (d < rp + 5) {
          const tooth = ((a + t * 1.6) / 6.283 * 18 % 1 + 1) % 1 < 0.5;
          c = d < rp + 1 ? C.w : tooth && d < rp + 4 ? cCy : mix(A[i], cMag, 0.7);
          if (inner && d < rp) c = cRim;
        } else {
          let src = A[i];
          if (d < RT && tw > 0) {
            const aa = a + tw * (1 - d / RT) ** 2;
            const sx = Math.round(cx + Math.cos(aa) * d), sy = Math.round(cy + Math.sin(aa) * d);
            if (sx >= 0 && sy >= 0 && sx < W && sy < H) src = A[sy * W + sx];
          }
          c = src;
          if (d < rp + 16) c = mix(c, cMag, (1 - (d - rp - 5) / 11) * 0.45);
        }
        O[i] = c;
      }
    }
  }
  // a small standalone portal disc (summoning) drawn over a frame
  function portal(fb, cx, cy, rp, t) {
    if (rp < 1) return;
    for (let y = Math.max(0, Math.floor(cy - rp - 16)); y < Math.min(H, cy + rp + 16); y++) for (let x = Math.max(0, Math.floor(cx - rp - 16)); x < Math.min(W, cx + rp + 16); x++) {
      const dx = x - cx, dy = (y - cy) * 1.15, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), i = y * W + x;
      if (d < rp - 2) {
        let c = mix(cSpace0, cSpace1, d / rp);
        const arm = Math.sin(a * 3 - d * 0.3 + t * 9);
        if (arm > 0.55) c = mix(c, cArm, (arm - 0.55) * 2);
        if (hash2(Math.floor((a + t * 1.4) * 12), Math.floor(d * 0.6 - t * 26)) > 0.96) c = C.w;
        fb.d[i] = c;
      } else if (d < rp + 3) {
        const tooth = ((a + t * 1.6) / 6.283 * 14 % 1 + 1) % 1 < 0.5;
        fb.d[i] = d < rp ? C.w : tooth ? cCy : mix(fb.d[i], cMag, 0.6);
      } else if (d < rp + 14) fb.d[i] = mix(fb.d[i], cMag, (1 - (d - rp - 3) / 11) * 0.4);
    }
  }
  function frozen(fb, k) { for (let i = 0; i < fb.d.length; i++) fb.d[i] = frost(fb.d[i], k); }

  return Object.assign(api, { C, glyph, glow, shadow, say, step, draw, WARP, startWarp, compose, portal, frozen, add });
})();
