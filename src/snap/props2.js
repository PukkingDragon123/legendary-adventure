/* ------------------------------------------------------------------
   Props2 — painters for the inland areas: waterfalls (palette-cycled),
   rope bridges, the Weather Institute, mushrooms, lily pads, logs and
   stumps, the weather lever, crystals and cave rock, tree houses, and
   the concert stage gear.
------------------------------------------------------------------- */
const Props2 = (() => {
  const { clamp, lerp, rng, bayer4, vnoise, hash, fbm, TAU } = U;
  const { shade, outline, mask, blobMask, foliage } = Paint;
  const pick = Props.pick;

  // vertical waterfall ribbon using a cycling ramp (M.fall must be declared with cycle: true)
  function waterfall(M, w, h, seed, o = {}) {
    const s = new ISpr(w, h), F = M.fall, n = F.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w;
      const edge = Math.min(u, 1 - u) * w;
      const wob = Math.sin(y * 0.05 + seed) * (o.wob ?? 2);
      if (edge + wob < 0.5) continue;
      // streaks: each column its own phase so the cycling palette reads as falling water
      const ph = Math.floor(hash(x, 0, seed) * n + y * 0.5 + (x % 3) * 0.3) % n;
      let idx = F[ph];
      if (edge < 1.5) idx = M.foam ? M.foam[0] : F[n - 1];
      s.set(x, y, idx);
    }
    // foam pool at the bottom
    if (M.foam) for (let k = 0; k < w * 2; k++) { const x = hash(k, 1, seed) * w * 1.4 - w * 0.2, y = h - 1 - hash(k, 2, seed) * 6; s.set(x, y, M.foam[hash(k, 3, seed) > 0.5 ? 1 : 0]); }
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  // rope bridge between x0 and x1 at deck y (world coords) → { back, front }
  function ropeBridge(M, x0, x1, y, o = {}) {
    const w = Math.ceil(x1 - x0) + 12, sag = o.sag ?? 10, h = sag + 44;
    const back = new ISpr(w, h), front = new ISpr(w, h), top = y - 30;
    const deckY = (x) => Math.round(30 + Math.sin(((x - 6) / (w - 12)) * Math.PI) * sag);
    for (let x = 6; x < w - 6; x++) {
      const dy = deckY(x);
      const plank = Math.floor((x - 6) / 5), seam = (x - 6) % 5 === 0;
      for (let k = 0; k < 4; k++) back.set(x, dy + k, seam ? M.wood[0] : pick(M.wood, 0.75 - k * 0.12 + hash(plank, 0, 3) * 0.2, x, k));
      back.set(x, dy + 4, M.ink[0]);
      // back handrope + hangers
      const ry = Math.round(deckY(x) - 16 + Math.sin(((x - 6) / (w - 12)) * Math.PI) * 3);
      back.set(x, ry, M.rope[1]);
      if ((x - 6) % 10 === 0) for (let k = ry; k < dy; k++) back.set(x, k, M.rope[0]);
      const fy = ry + 2;
      front.set(x, fy, M.rope[2]); front.set(x, fy + 1, M.rope[1]);
      if ((x - 6) % 10 === 5) for (let k = fy; k < dy + 2; k++) front.set(x, k, M.rope[1]);
    }
    // posts at both ends
    for (const px of [4, w - 5]) for (let yy = 8; yy < h; yy++) for (let k = -2; k <= 2; k++) front.set(px + k, yy, Math.abs(k) === 2 ? M.ink[0] : pick(M.wood, 0.7 - (k + 2) * 0.12, k, yy));
    back.ax = -(x0 - 6); back.ay = -top; front.ax = -(x0 - 6); front.ay = -top;
    return { back, front, deckY: (wx) => top + deckY(wx - x0 + 6) };
  }
  // the Weather Institute (background building with a weather vane tower and a dish)
  function institute(M, seed) {
    const w = 200, h = 120, s = new ISpr(w, h);
    const base = h - 4;
    // main block
    for (let y = base - 46; y < base; y++) for (let x = 20; x < 150; x++) s.set(x, y, x === 20 || x === 149 ? M.ink[1] : pick(M.wallW, 0.85 - (x - 20) / 130 * 0.35 - (y > base - 8 ? 0.2 : 0), x, y));
    // blue roof
    for (let y = 0; y < 12; y++) for (let x = 16 - (12 - y) * 0 + y * 0; x < 154; x++) { const yy = base - 58 + y; s.set(x, yy, (x + y) % 6 === 0 ? M.roofB[0] : pick(M.roofB, 0.9 - y / 14, x, y)); }
    // windows (glow at night via the win ramp)
    for (let k = 0; k < 6; k++) { const wx = 30 + k * 20; for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) s.set(wx + x, base - 38 + y, x === 0 || y === 0 || x === 11 || y === 11 ? M.metal[1] : M.win[y < 5 ? 1 : 0]); }
    // door + sign
    for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) s.set(78 + x, base - 18 + y, x === 0 || x === 15 ? M.metal[0] : M.metal[2]);
    for (let x = 60; x < 112; x++) for (let y = 0; y < 6; y++) s.set(x, base - 52 + y + 4, y === 0 || y === 5 ? M.metal[0] : M.roofB[3]);
    // weather tower with an anemometer
    for (let y = base - 110; y < base - 46; y++) { s.set(170, y, M.metal[1]); s.set(171, y, M.metal[2]); if ((y - base) % 8 === 0) for (let k = -4; k <= 4; k++) s.set(170 + k + Math.round((base - y) * 0), y, M.metal[1]); }
    for (let y = base - 46; y < base; y++) for (let x = 160; x < 182; x++) s.set(x, y, x === 160 || x === 181 ? M.ink[1] : pick(M.wallW, 0.6, x, y));
    for (let k = -8; k <= 8; k++) s.set(170 + k, base - 110, M.metal[3]);
    for (const k of [-8, 8]) for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 4) s.set(170 + k + xx, base - 110 + yy, M.metal[2]);
    // satellite dish
    for (let a = 0; a < 40; a++) { const t = a / 39, x = Math.round(130 + t * 22), y = Math.round(base - 70 + Math.pow(t - 0.5, 2) * 30); for (let k = 0; k < 3; k++) s.set(x, y + k, M.metal[3 - k]); }
    for (let y = base - 66; y < base - 58; y++) s.set(141, y, M.metal[1]);
    outline(s, M.ink[0]);
    s.ax = 85; s.ay = base;
    return s;
  }
  function mushroom(M, size, seed, kind = 0) {
    const r = rng(seed), w = size * 2 + 4, h = size * 2 + 4, s = new ISpr(w, h);
    const CAP = kind ? M.capB : M.capR;
    const cx = w / 2, by = h - 2, stemH = size * 0.9, capR = size;
    for (let y = 0; y < stemH; y++) for (let x = -size * 0.28; x <= size * 0.28; x++) s.set(cx + x, by - y, pick(M.stem, 0.8 - (x + size * 0.28) / (size * 0.56) * 0.5, x, y));
    const cy = by - stemH;
    for (let y = -capR; y <= 2; y++) for (let x = -capR; x <= capR; x++) {
      const d = (x * x) / (capR * capR) + (y * y) / ((capR * 0.8) ** 2);
      if (d > 1 || y > 2) continue;
      const lit = 0.8 - (x + capR) / (2 * capR) * 0.4 - (y + capR) / (capR * 2) * 0.3;
      s.set(cx + x, cy + y, y > 0 ? CAP[0] : pick(CAP, lit, x, y));
    }
    // spots
    for (let k = 0; k < 4 + size / 3; k++) { const a = r() * Math.PI, rr = r() * capR * 0.7; const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy - Math.sin(a) * rr * 0.6 - 1); s.setIf(x, y, M.stem[3]); if (size > 5) s.setIf(x + 1, y, M.stem[2]); }
    outline(s, M.ink[0]);
    s.ax = Math.round(cx); s.ay = by;
    return s;
  }
  function lilypad(M, w, seed, flower = false) {
    const h = Math.max(3, Math.round(w * 0.3)), s = new ISpr(w + 2, h + 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x / w) * 2 - 1, v = (y / h) * 2 - 1;
      if (u * u + v * v > 1) continue;
      if (Math.abs(u - 0.5) < 0.12 && v < 0) continue; // the notch
      s.set(x + 1, y + 1, pick(M.pad, 0.75 - v * 0.3 + (hash(x, y, seed) - 0.5) * 0.2, x, y));
    }
    if (flower) { const fx = Math.round(w * 0.35), fy = 0; for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) s.set(fx + dx, fy + dy + 1, M.lotus[dy < 0 ? 2 : 1]); }
    outline(s, M.ink[0]);
    s.ax = (w >> 1) + 1; s.ay = h;
    return s;
  }
  function log(M, len, seed, hollow = true) {
    const h = 14, s = new ISpr(len + 2, h + 2);
    for (let x = 0; x < len; x++) for (let y = 0; y < h; y++) {
      const v = (y / h) * 2 - 1;
      s.set(x + 1, y + 1, pick(M.bark, 0.7 - v * 0.45 + (vnoise(x * 0.3, y * 0.5, seed) - 0.5) * 0.3, x, y));
      if (hash(x >> 2, y, seed) > 0.85) s.set(x + 1, y + 1, M.bark[0]);
    }
    // cut end with rings
    for (let y = 0; y < h; y++) for (let x = 0; x < 6; x++) { const d = Math.hypot(x - 2, y - h / 2); if (d < h / 2) s.set(len - 4 + x, y + 1, hollow && d < h / 2 - 3 ? M.ink[1] : Math.floor(d) % 2 ? M.wood[4] : M.wood[3]); }
    // moss
    for (let x = 0; x < len; x++) if (vnoise(x * 0.12, 0, seed) > 0.45) { s.set(x + 1, 1, M.moss[2]); if (vnoise(x * 0.3, 1, seed) > 0.5) s.set(x + 1, 2, M.moss[1]); }
    outline(s, M.ink[0]);
    s.ax = (len >> 1) + 1; s.ay = h + 1;
    return s;
  }
  function lever(M, on) {
    const s = new ISpr(20, 30);
    for (let y = 12; y < 30; y++) for (let x = 4; x < 16; x++) s.set(x, y, x === 4 || x === 15 || y === 12 ? M.ink[0] : pick(M.metal, 0.7 - (x - 4) / 12 * 0.4, x, y));
    for (let y = 16; y < 22; y++) for (let x = 7; x < 13; x++) s.set(x, y, M.win[y < 18 ? 1 : 0]);
    const ang = on ? -0.5 : 0.5;
    for (let k = 0; k < 12; k++) s.set(10 + Math.round(Math.sin(ang) * k), 12 - Math.round(Math.cos(ang) * k), M.metal[3]);
    const kx = 10 + Math.round(Math.sin(ang) * 12), ky = 12 - Math.round(Math.cos(ang) * 12);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) s.set(kx + x, ky + y, M.capR[2]);
    outline(s, M.ink[0]);
    s.ax = 10; s.ay = 29;
    return s;
  }
  function stump(M, w, h, seed) {
    const s = new ISpr(w + 8, h + 4);
    for (let y = 0; y < h; y++) { const flare = y > h - 5 ? (y - (h - 5)) * 1.2 : 0; for (let x = -w / 2 - flare; x <= w / 2 + flare; x++) s.set(w / 2 + 4 + x, y + 3, pick(M.bark, 0.75 - (x + w / 2) / w * 0.5, x, y)); }
    for (let x = -w / 2; x <= w / 2; x++) for (let y = 0; y < 4; y++) { const d = Math.abs(x) / (w / 2); s.set(w / 2 + 4 + x, y + 1, Math.floor(d * 4 + y) % 2 ? M.wood[4] : M.wood[3]); }
    outline(s, M.ink[0]);
    s.ax = (w >> 1) + 4; s.ay = h + 2;
    return s;
  }
  function reeds(M, h, seed) {
    const r = rng(seed), s = new ISpr(16, h + 2);
    for (let k = 0; k < 5; k++) { const x = 2 + r() * 12, L = h * (0.6 + r() * 0.4); for (let j = 0; j < L; j++) s.set(x + Math.sin(j * 0.1 + k) * 0.8, h + 1 - j, M.grass[j > L * 0.7 ? 3 : 2]); if (r() < 0.6) for (let j = 0; j < 4; j++) { s.set(x, h + 1 - L - j, M.bark[1]); s.set(x + 1, h + 1 - L - j, M.bark[2]); } }
    s.ax = 8; s.ay = h + 1;
    return s;
  }
  /* ---------- cave ---------- */
  function crystal(M, size, seed, ramp) {
    const r = rng(seed), w = size * 2 + 4, h = size * 2 + 4, s = new ISpr(w, h), C = ramp || M.crys;
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 1.3, L = size * (0.6 + r() * 0.8), th = size * (0.18 + r() * 0.12);
      const bx = w / 2 + (r() - 0.5) * size * 0.4, by = h - 2;
      for (let j = 0; j < L; j++) {
        const t = j / L, half = th * (t < 0.8 ? 1 : (1 - t) / 0.2);
        const cx = bx + Math.cos(a) * j, cy = by + Math.sin(a) * j;
        for (let q = -half; q <= half; q += 0.5) { const x = cx - Math.sin(a) * q, y = cy + Math.cos(a) * q; s.set(x, y, C[q < -half * 0.3 ? 3 : q < half * 0.4 ? 2 : 1]); }
      }
    }
    outline(s, C[0]);
    s.ax = w >> 1; s.ay = h - 2;
    return s;
  }
  function stalactite(M, w, h, seed, up = false) {
    const s = new ISpr(w + 2, h + 2);
    for (let y = 0; y < h; y++) { const t = y / h, half = (w / 2) * (1 - t) ** 1.3 + 0.4; for (let x = -half; x <= half; x++) s.set(w / 2 + 1 + x, up ? h - y : y, pick(M.rock, 0.7 - (x + half) / (2 * half + 0.1) * 0.5 - t * 0.1, x, y)); }
    outline(s, M.ink[0]);
    s.ax = (w >> 1) + 1; s.ay = up ? h : 0;
    return s;
  }
  function meteorite(M, size, seed) {
    const s = Paint.rock(M, size * 1.3, size, seed, { ramp: M.metr, cracks: 4 });
    // glowing seams
    for (let i = 0; i < s.w * s.h; i++) if (s.d[i] === M.metr[0] && hash(i, 0, seed) > 0.4) s.d[i] = M.glowV[0];
    return s;
  }
  /* ---------- canopy / stage ---------- */
  function treehouse(M, w, h, seed) {
    const s = new ISpr(w + 8, h + 20);
    const base = h + 10;
    for (let y = base - h; y < base; y++) for (let x = 4; x < w + 4; x++) s.set(x, y, (x - 4) % 6 === 0 ? M.wood[1] : pick(M.wood, 0.8 - (x - 4) / w * 0.35, x, y));
    for (let y = 0; y < 14; y++) { const hw = w / 2 + 4 - y * 0.2; for (let x = -hw; x <= hw; x++) s.set(w / 2 + 4 + x, base - h - 14 + y, (Math.abs(x) + y) % 4 === 0 ? M.leaf[0] : pick(M.leaf, 0.8 - y / 16, x, y)); }
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) s.set(w / 2 + x - 4, base - 14 + y, x === 0 || x === 8 || y === 0 ? M.wood[0] : M.ink[1]);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) s.set(10 + x, base - h + 6 + y, x === 0 || y === 0 || x === 7 || y === 6 ? M.wood[0] : M.win[y < 3 ? 1 : 0]);
    outline(s, M.ink[0]);
    s.ax = (w >> 1) + 4; s.ay = base;
    return s;
  }
  function speaker(M, w, h) {
    const s = new ISpr(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s.set(x, y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? M.ink[0] : pick(M.spk, 0.5 - (x / w) * 0.3, x, y));
    for (const [cy, r] of [[h * 0.3, w * 0.28], [h * 0.72, w * 0.36]]) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d <= r) s.set(w / 2 + x, cy + y, d > r - 1.5 ? M.metal[2] : d < r * 0.35 ? M.metal[1] : M.ink[1]); }
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  return { waterfall, ropeBridge, institute, mushroom, lilypad, log, lever, stump, reeds, crystal, stalactite, meteorite, treehouse, speaker };
})();
