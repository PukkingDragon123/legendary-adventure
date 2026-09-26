/* ------------------------------------------------------------------
   Props — hand-shaped indexed painters for scenery objects: the dock,
   boats, beach things, corals and sea plants, the lighthouse, crates,
   lamps, signs... Each returns an ISpr with its anchor at the base.
------------------------------------------------------------------- */
const Props = (() => {
  const { clamp, lerp, rng, bayer4, vnoise, hash, TAU } = U;
  const { shade, outline, mask, blobMask, foliage } = Paint;
  const pick = (ramp, t, x, y) => { const n = ramp.length, v = clamp(t, 0, 0.999) * n; return ramp[clamp(Math.floor(v) + ((v % 1) > bayer4(x, y) ? 1 : 0), 0, n - 1)]; };

  /* ---------- the dock: one continuous structure, split into back and front halves ---------- */
  // o: { x0, x1, deck (y), posts: [x...], ground: fn(x), sea, lamps: [x], ladders: [x] }  (world coords)
  function dock(M, o) {
    const x0 = Math.floor(o.x0) - 6, x1 = Math.ceil(o.x1) + 6, w = x1 - x0;
    let ymax = o.deck; for (let x = x0; x <= x1; x += 4) ymax = Math.max(ymax, o.ground(x));
    const top = o.deck - 70, h = Math.ceil(ymax - top + 8);
    const back = new ISpr(w, h), front = new ISpr(w, h);
    const W = M.wood, WW = M.woodW, DK = o.deck - top; // deck row inside the sprite
    const r = rng(7);
    // deck: top surface (planks running across, seen from above) + front face
    const TOPH = 9, FACE = 5;
    for (let x = 0; x < w; x++) {
      const wx = x0 + x;
      if (wx < o.x0 || wx > o.x1) continue;
      const plank = Math.floor((wx - o.x0) / 7), seam = (wx - o.x0) % 7 === 0;
      const tone = hash(plank, 0, 3);
      for (let y = 0; y < TOPH; y++) {
        const u = y / TOPH;
        let t = 0.62 + tone * 0.22 - u * 0.25 + (vnoise(wx * 0.3, y * 0.9, plank) - 0.5) * 0.25;
        if (y === 0) t += 0.25;
        let c = pick(W.slice(1), t, wx, y);
        if (seam) c = W[1];
        if (hash(wx >> 1, y, 11) > 0.97) c = W[2]; // nail heads / knots
        back.set(x, DK - TOPH + y, c);
      }
      for (let y = 0; y < FACE; y++) back.set(x, DK + y, y === 0 ? W[5] : y === FACE - 1 ? W[0] : pick(W, 0.3 + (plank % 2) * 0.1 - y * 0.05, wx, y));
      back.set(x, DK + FACE, M.ink[0]);
    }
    // posts: back row (left of each pair, set back) and front row
    const post = (spr, px, yTop, thick, dark) => {
      const g = o.ground(x0 + px) + 3;
      for (let y = Math.round(yTop); y < Math.round(g - top); y++) {
        const wy = y + top, under = wy > o.sea;
        for (let k = -thick; k <= thick; k++) {
          const u = (k + thick) / (2 * thick);
          let t = 0.75 - u * 0.65 - (dark ? 0.15 : 0);
          let ramp = under ? WW : W;
          let c = pick(ramp, t, px + k, y);
          // algae + barnacles below the water line
          if (under && wy < o.sea + 26 && vnoise((px + k) * 0.5, y * 0.4, 5) > 0.45) c = M.algae[hash(px + k, y, 2) > 0.5 ? 1 : 0];
          if (under && hash(px + k, y, 9) > 0.95) c = M.pebble[3];
          if (Math.abs(k) === thick) c = M.ink[0];
          spr.set(px + k, y, c);
        }
      }
      // cap with rope wraps
      for (let k = -thick - 1; k <= thick + 1; k++) { spr.set(px + k, Math.round(yTop) - 1, M.ink[0]); spr.set(px + k, Math.round(yTop), W[5]); }
      for (let j = 0; j < 3; j++) for (let k = -thick; k <= thick; k++) spr.set(px + k, Math.round(yTop) + 5 + j * 2, M.rope[j === 1 ? 2 : 1]);
    };
    for (const px of o.posts) { post(back, px - x0 - 4, DK - TOPH - 10, 2, true); }
    for (const px of o.posts) post(front, px - x0 + 2, DK - 18, 3, false);
    // a stringer beam under the deck, between the front posts
    for (let i = 0; i < o.posts.length - 1; i++) {
      const a = o.posts[i] - x0 + 2, b = o.posts[i + 1] - x0 + 2;
      for (let k = 0; k <= b - a; k++) { front.set(a + k, DK + FACE + 3, W[2]); front.set(a + k, DK + FACE + 4, W[1]); front.set(a + k, DK + FACE + 5, W[0]); }
    }
    // chain rail between front post tops
    for (let i = 0; i < o.posts.length - 1; i++) {
      const a = o.posts[i] - x0 + 2, b = o.posts[i + 1] - x0 + 2, sag = 7;
      for (let k = 0; k <= b - a; k++) { const t = k / (b - a); const y = Math.round(DK - 15 + Math.sin(t * Math.PI) * sag); front.set(a + k, y, k % 3 === 0 ? M.metal[3] : M.metal[1]); }
    }
    // ladders
    for (const lx of o.ladders || []) {
      const px = lx - x0;
      for (let y = DK; y < o.sea - top + 30; y++) { front.set(px - 4, y, M.metal[2]); front.set(px + 4, y, M.metal[1]); if ((y - DK) % 5 === 0) for (let k = -3; k <= 3; k++) front.set(px + k, y, M.metal[3]); }
    }
    // lamp posts with lanterns
    const lamps = [];
    for (const lx of o.lamps || []) {
      const px = lx - x0;
      for (let y = DK - TOPH - 40; y < DK - TOPH + 2; y++) { back.set(px, y, M.metal[1]); back.set(px + 1, y, M.metal[2]); }
      for (let k = -4; k <= 4; k++) back.set(px + k, DK - TOPH - 40, M.metal[0]);
      for (let yy = 0; yy < 9; yy++) for (let k = -3; k <= 4; k++) back.set(px + k, DK - TOPH - 39 + yy, Math.abs(k) === 3 || yy === 0 || yy === 8 ? M.metal[0] : (yy < 3 ? M.lamp[1] : M.lamp[0]));
      lamps.push([lx, top + DK - TOPH - 35]);
    }
    // bollards & crates on the deck
    for (const bx of o.bollards || []) { const px = bx - x0; for (let y = 0; y < 6; y++) for (let k = -2; k <= 2; k++) back.set(px + k, DK - TOPH + 3 - y, Math.abs(k) === 2 ? M.ink[0] : M.metal[k < 0 ? 2 : 1]); for (let k = -3; k <= 3; k++) back.set(px + k, DK - TOPH - 3, M.metal[3]); }
    for (const cx of o.crates || []) { const px = cx - x0; for (let y = 0; y < 12; y++) for (let k = 0; k < 14; k++) { const e = k === 0 || k === 13 || y === 0 || y === 11; back.set(px + k, DK - TOPH + 2 - y, e ? M.ink[0] : (k === y || k === 13 - y) ? W[1] : pick(W, 0.55 + (y < 3 ? 0.3 : 0), k, y)); } }
    back.ax = -x0; back.ay = -top; front.ax = -x0; front.ay = -top;
    return { back, front, top, x0, lamps };
  }

  /* ---------- rowboat (side view, a little from above) ---------- */
  function boat(M, len, o = {}) {
    const h = Math.round(len * 0.32) + 6, s = new ISpr(len + 4, h + 4);
    const HULL = o.hull || M.boatR, IN = M.wood, RIM = M.boatW;
    const mid = 2 + len / 2;
    for (let x = 0; x < len; x++) {
      const u = (x / (len - 1)) * 2 - 1; // -1 stern .. 1 bow
      const topY = Math.round(4 + (u > 0.6 ? -(u - 0.6) * 10 : 0) - (u < -0.8 ? (-0.8 - u) * 6 : 0));
      const depth = Math.round((h - 6) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 2.6))));
      for (let y = topY; y <= topY + depth + 2; y++) {
        const v = (y - topY) / (depth + 2);
        let c;
        if (y <= topY + 1) c = RIM[y === topY ? 2 : 1];
        else if (y < topY + 4) c = IN[2 + ((x >> 3) % 2)];
        else c = pick(HULL, 0.85 - v * 0.7 - (u > 0.3 ? 0 : 0.05), x, y);
        if (y === topY + Math.round(depth * 0.55) && v > 0.2) c = RIM[1];
        s.set(x + 2, y + 1, c);
      }
    }
    // seats/thwarts seen from above
    for (const k of [0.35, 0.62]) { const x = Math.round(2 + len * k); for (let y = 5; y < 8; y++) for (let j = -2; j <= 2; j++) s.set(x + j, y, IN[4]); }
    if (o.orb) { const x = Math.round(2 + len * 0.5); for (let y = -1; y <= 1; y++) for (let j = -1; j <= 1; j++) s.set(x + j, 4 + y, M.orb[y + j < 0 ? 2 : 1]); }
    outline(s, M.ink[0]);
    s.ax = Math.round(mid); s.ay = Math.round(h * 0.55); // waterline about half way up the hull
    return s;
  }

  function umbrella(M, seed) {
    const w = 64, h = 60, s = new ISpr(w, h), cx = 32;
    const A = M.umbA, B = M.umbB;
    for (let y = 0; y < 18; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / 30, v = y / 18;
      if (Math.abs(dx) > Math.sqrt(Math.max(0, v)) * 1.02 + 0.02) continue;
      const scal = y > 15 && (Math.floor((x + 3) / 8) % 2 === 0);
      if (y > 16 && !scal) continue;
      const seg = Math.floor((Math.atan2(y + 6, x - cx) / Math.PI) * 8) % 2;
      const R = seg ? A : B;
      s.set(x, y + 2, pick(R, 0.9 - v * 0.5 - (x > cx ? 0.2 : 0), x, y));
    }
    for (let y = 18; y < h; y++) { s.set(cx, y, M.metal[2]); s.set(cx + 1, y, M.metal[1]); }
    outline(s, M.ink[0]);
    s.ax = cx; s.ay = h - 1;
    return s;
  }
  function towel(M) {
    const w = 46, h = 8, s = new ISpr(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sk = Math.round(y * 0.6);
      const stripe = Math.floor((x - sk) / 6) % 2;
      s.set(x, y, stripe ? M.tWhite[y < 2 ? 2 : 1] : M.tRed[y < 2 ? 2 : 1]);
    }
    for (let x = 0; x < w; x += 2) s.set(x, h - 1, M.tWhite[0]);
    outline(s, M.ink[0]); s.ax = w >> 1; s.ay = h;
    return s;
  }
  function sandcastle(M, hp = 1) {
    const w = 52, h = 42, s = new ISpr(w, h), SA = M.sand;
    const towers = [[10, 26, 9], [26, 36, 11], [42, 24, 9]];
    const m = mask(w, h, (x, y) => {
      if (y > h - 12 && x > 2 && x < w - 2) return true; // base wall
      for (const [cx, th, tw] of towers) { const top = h - th; if (Math.abs(x - cx) <= tw / 2 && y >= top) { if (y < top + 3 && (x - cx + 10) % 3 === 0) return false; return true; } }
      return false;
    });
    shade(s, m, SA, { depth: 3, noise: 0.25, seed: 3, amb: 0.35 });
    // windows + flag
    for (const [cx, th] of towers) { s.set(cx, h - th + 8, M.sandW[0]); s.set(cx, h - th + 9, M.sandW[0]); }
    for (let y = 0; y < 8; y++) s.set(26, h - 36 - y - 1, M.wood[1]);
    for (let y = 0; y < 3; y++) for (let x = 1; x < 6 - y; x++) s.set(26 + x, h - 44 + y + 1, M.tRed[1]);
    outline(s, M.ink[0]); s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function sign(M, lines = 2) {
    const w = 26, h = 30, s = new ISpr(w, h), W = M.wood;
    for (let y = 12; y < h; y++) { s.set(12, y, W[1]); s.set(13, y, W[2]); }
    for (let y = 2; y < 14; y++) for (let x = 1; x < w - 1; x++) s.set(x, y, y === 2 || y === 13 ? W[0] : pick(W, 0.7 - (y - 2) * 0.03, x, y));
    for (let k = 0; k < lines; k++) for (let x = 5; x < w - 5; x++) if (hash(x, k, 3) > 0.25) s.set(x, 6 + k * 3, W[0]);
    outline(s, M.ink[0]); s.ax = 13; s.ay = h - 1;
    return s;
  }
  function crate(M) { const s = new ISpr(14, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 14; x++) { const e = x === 0 || x === 13 || y === 0 || y === 11; s.set(x, y, e ? M.ink[0] : (x === y || x === 13 - y) ? M.wood[1] : pick(M.wood, 0.55 + (y < 3 ? 0.3 : 0), x, y)); } s.ax = 7; s.ay = 11; return s; }
  function bucket(M) { const s = new ISpr(10, 10); for (let y = 2; y < 10; y++) { const hw = 3 + Math.round(y * 0.15); for (let x = -hw; x <= hw; x++) s.set(5 + x, y, Math.abs(x) === hw ? M.ink[0] : pick(M.umbB, 0.8 - (x + hw) / (2 * hw) * 0.5, x, y)); } for (let x = 1; x < 9; x++) s.set(x, 1, M.metal[2]); s.ax = 5; s.ay = 9; return s; }
  function driftwood(M, len, seed) {
    const r = rng(seed), h = 8, s = new ISpr(len, h);
    const m = mask(len, h, (x, y) => { const u = x / len; const th = 2.5 + Math.sin(u * Math.PI) * 1.5; return Math.abs(y - h / 2 - Math.sin(u * 6) * 0.8) < th && u > 0.02 && u < 0.98; });
    shade(s, m, M.drift, { depth: 2, noise: 0.3, seed });
    outline(s, M.ink[0]); s.ax = len >> 1; s.ay = h - 1;
    return s;
  }
  function lighthouse(M) {
    const w = 34, h = 96, s = new ISpr(w, h), cx = 17;
    for (let y = 22; y < h; y++) {
      const t = (y - 22) / (h - 22), hw = Math.round(6 + t * 7);
      const band = Math.floor((y - 22) / 12) % 2;
      for (let x = -hw; x <= hw; x++) { const u = (x + hw) / (2 * hw); s.set(cx + x, y, Math.abs(x) === hw ? M.ink[0] : pick(band ? M.lhR : M.lhW, 0.85 - u * 0.7, x, y)); }
    }
    // gallery + lamp room
    for (let x = -10; x <= 10; x++) { s.set(cx + x, 21, M.ink[0]); s.set(cx + x, 20, M.metal[2]); }
    for (let y = 8; y < 20; y++) for (let x = -6; x <= 6; x++) s.set(cx + x, y, Math.abs(x) === 6 ? M.metal[0] : M.lhLight[y < 13 ? 1 : 0]);
    for (let y = 2; y < 8; y++) { const hw = Math.round((y - 2) * 1.4); for (let x = -hw; x <= hw; x++) s.set(cx + x, y, pick(M.lhR, 0.7 - (x + hw) / (2 * hw + 1) * 0.5, x, y)); }
    s.set(cx, 1, M.metal[3]);
    for (let y = 50; y < 58; y++) for (let x = -2; x <= 2; x++) s.set(cx + x, y, M.win[0]);
    outline(s, M.ink[0]); s.ax = cx; s.ay = h - 1;
    return s;
  }

  /* ---------- reef ---------- */
  function coral(M, kind, size, seed) {
    const r = rng(seed);
    const RAMP = { branch: M.coralP, fan: M.coralV, brain: M.coralY, tube: M.coralO, table: M.coralT, stag: M.coralP2 || M.coralP }[kind] || M.coralP;
    const w = Math.round(size * 1.3) + 6, h = Math.round(size) + 4;
    const s = new ISpr(w, h), cx = w / 2, by = h - 2;
    const m = new Uint8Array(w * h);
    const disk = (x, y, rr) => { for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) if (xx * xx + yy * yy <= rr * rr + 0.5) { const X = Math.round(x + xx), Y = Math.round(y + yy); if (X >= 0 && Y >= 0 && X < w && Y < h) m[Y * w + X] = 1; } };
    if (kind === 'branch' || kind === 'stag') {
      const grow = (x, y, a, len, th, d) => {
        for (let k = 0; k < len; k++) { disk(x, y, th); x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.25; if (d < 3 && r() < 0.06) grow(x, y, a + (r() < 0.5 ? -0.7 : 0.7), len * 0.6, Math.max(1, th - 0.5), d + 1); }
        disk(x, y, th + 0.6);
      };
      for (let k = 0; k < 4; k++) grow(cx + (r() - 0.5) * size * 0.3, by, -Math.PI / 2 + (r() - 0.5) * 1.1, size * (0.55 + r() * 0.3), kind === 'stag' ? 1 : 1.6, 0);
      shade(s, m, RAMP, { depth: 2, noise: 0.2, seed, amb: 0.3 });
      // polyp dots on tips
      for (let i = 0; i < w * h; i++) if (m[i] && hash(i, 0, seed) > 0.93) s.d[i] = RAMP[RAMP.length - 1];
    } else if (kind === 'fan') {
      for (let k = 0; k < 9; k++) { let x = cx, y = by, a = -Math.PI / 2 + (k / 8 - 0.5) * 1.8; for (let j = 0; j < size * 0.95; j++) { disk(x, y, 0.6); x += Math.cos(a); y += Math.sin(a); a += Math.sin(j * 0.3 + k) * 0.04; } }
      // lattice fill
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = x - cx, dy = by - y; const d = Math.hypot(dx, dy * 0.95); if (d < size * 0.92 && dy > 0 && Math.abs(Math.atan2(dx, dy)) < 0.95 && (x + y) % 3 !== 0) m[y * w + x] = 1; }
      shade(s, m, RAMP, { depth: 2, noise: 0.35, seed, amb: 0.35 });
    } else if (kind === 'brain') {
      const mm = blobMask(w, h, cx, by - size * 0.4, size * 0.62, size * 0.45, seed, 0.1);
      for (let i = 0; i < w * h; i++) m[i] = mm[i] && (Math.floor(i / w) < by + 1) ? 1 : 0;
      shade(s, m, RAMP, { depth: size * 0.3, noise: 0.15, seed, amb: 0.25 });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] && Math.sin(x * 0.9 + Math.sin(y * 0.8) * 2.2) > 0.75) s.d[y * w + x] = RAMP[1];
    } else if (kind === 'tube') {
      for (let k = 0; k < 5; k++) { const x = cx + (k - 2) * size * 0.18 + (r() - 0.5) * 3, hh = size * (0.4 + r() * 0.55), th = 2 + r() * 1.5; for (let y = 0; y < hh; y++) disk(x + Math.sin(y * 0.1 + k) * 1.2, by - y, th); }
      shade(s, m, RAMP, { depth: 2, noise: 0.2, seed, amb: 0.3 });
      for (let k = 0; k < 5; k++) { /* dark mouths */ }
    } else if (kind === 'table') {
      for (let y = 0; y < size * 0.55; y++) disk(cx, by - y, 2);
      const ty = by - size * 0.55;
      for (let x = -size * 0.6; x <= size * 0.6; x++) { const th = 2 + (1 - Math.abs(x) / (size * 0.6)) * 2; for (let y = -th; y <= 0; y++) { const X = Math.round(cx + x), Y = Math.round(ty + y + Math.abs(x) * 0.08); if (X >= 0 && Y >= 0 && X < w && Y < h) m[Y * w + X] = 1; } }
      shade(s, m, RAMP, { depth: 2, noise: 0.2, seed, amb: 0.3 });
    }
    outline(s, M.reefInk[0], M.reefInk[0]);
    s.ax = Math.round(cx); s.ay = by;
    return s.trim(1);
  }
  // swaying kelp / sea grass frames
  function kelp(M, len, seed, frames = 4) {
    const r = rng(seed), out = [];
    const blades = [{ dx: 0, L: len, ph: r() * 6 }, { dx: 3, L: len * (0.6 + r() * 0.3), ph: r() * 6 }, { dx: -3, L: len * (0.5 + r() * 0.3), ph: r() * 6 }];
    for (let f = 0; f < frames; f++) {
      const w = 34, s = new ISpr(w, len + 4), cx = w / 2;
      for (const b of blades) {
        for (let j = 0; j < b.L; j++) {
          const t = j / b.L;
          const x = cx + b.dx + Math.sin(t * 5 + b.ph + (f / frames) * TAU) * (2 + t * 5) * t;
          const y = len + 2 - j;
          const k = t < 0.2 ? 1 : 2 + (Math.sin(j * 0.7) > 0.6 ? 1 : 0);
          s.set(x, y, M.kelp[Math.min(M.kelp.length - 1, k)]);
          s.set(x + 1, y, M.kelp[Math.min(M.kelp.length - 1, k - 1)]);
          if (j % 9 === 4) { s.set(x + 2, y, M.kelp[2]); s.set(x + 3, y + 1, M.kelp[1]); } // little leaves
          if (j % 9 === 8) { s.set(x - 1, y, M.kelp[2]); s.set(x - 2, y + 1, M.kelp[1]); }
        }
      }
      s.ax = Math.round(cx); s.ay = len + 2;
      out.push(s);
    }
    return out;
  }
  function anemone(M, size, seed, frames = 3) {
    const out = [], r = rng(seed);
    const n = 9 + Math.round(size / 2);
    const tent = []; for (let k = 0; k < n; k++) tent.push({ a: -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.4, L: size * (0.6 + r() * 0.4), ph: r() * 6 });
    for (let f = 0; f < frames; f++) {
      const w = size * 2 + 6, h = size + 6, s = new ISpr(w, h), cx = w / 2, by = h - 2;
      for (let x = -size * 0.4; x <= size * 0.4; x++) for (let y = 0; y < 4; y++) s.set(cx + x, by - y, M.anem[1 + (y > 1 ? 1 : 0)]);
      for (const t of tent) {
        for (let j = 0; j < t.L; j++) {
          const q = j / t.L;
          const a = t.a + Math.sin(f * 2.1 + t.ph + q * 3) * 0.2 * q;
          const x = cx + Math.cos(a) * j * 0.8, y = by - 3 + Math.sin(a) * j;
          s.set(x, y, M.anem[q > 0.8 ? 3 : q > 0.4 ? 2 : 1]);
        }
      }
      outline(s, M.reefInk[0]);
      s.ax = Math.round(cx); s.ay = by;
      out.push(s);
    }
    return out;
  }
  function sponge(M, size, seed) {
    const w = size + 4, h = size + 4, s = new ISpr(w, h), r = rng(seed);
    const m = new Uint8Array(w * h);
    for (let k = 0; k < 3; k++) { const cx = 2 + size * (0.25 + k * 0.25), hh = size * (0.5 + r() * 0.5), rw = size * 0.13; for (let y = 0; y < hh; y++) for (let x = -rw; x <= rw; x++) { const X = Math.round(cx + x), Y = h - 2 - y; if (X >= 0 && Y >= 0 && X < w && Y < h) m[Y * w + X] = 1; } }
    shade(s, m, M.sponge, { depth: 2, noise: 0.4, seed, amb: 0.3 });
    for (let i = 0; i < w * h; i++) if (m[i] && hash(i, 1, seed) > 0.85) s.d[i] = M.sponge[0];
    outline(s, M.reefInk[0]); s.ax = w >> 1; s.ay = h - 2;
    return s;
  }
  function chest(M, open = false) {
    const w = 22, h = 18, s = new ISpr(w, h);
    for (let y = 7; y < h; y++) for (let x = 1; x < w - 1; x++) { const e = x === 1 || x === w - 2 || y === h - 1; s.set(x, y, e ? M.ink[0] : (x === 6 || x === 15) ? M.metal[2] : pick(M.wood, 0.6 - (y - 7) * 0.03, x, y)); }
    if (!open) for (let y = 1; y < 8; y++) for (let x = 1; x < w - 1; x++) { const dy = y - 7, dx = (x - w / 2) / (w / 2); if (dy < -Math.sqrt(1 - dx * dx) * 6) continue; const e = y === 7 || Math.abs(dy + Math.sqrt(1 - dx * dx) * 6) < 1; s.set(x, y, e ? M.ink[0] : (x === 6 || x === 15) ? M.metal[2] : pick(M.wood, 0.75, x, y)); }
    else { for (let x = 2; x < w - 2; x++) { s.set(x, 6, M.gold[1]); s.set(x, 5, M.gold[2]); } for (let y = 0; y < 5; y++) for (let x = 1; x < w - 1; x++) s.set(x, y, y === 0 ? M.ink[0] : pick(M.wood, 0.5, x, y)); }
    for (let y = 9; y < 12; y++) { s.set(10, y, M.gold[2]); s.set(11, y, M.gold[1]); }
    s.ax = w >> 1; s.ay = h - 1;
    return s;
  }
  function anchor(M) {
    const w = 26, h = 30, s = new ISpr(w, h), cx = 13;
    for (let y = 4; y < 26; y++) { s.set(cx, y, M.metal[1]); s.set(cx + 1, y, M.metal[2]); }
    for (let x = -6; x <= 6; x++) s.set(cx + x, 8, M.metal[2]);
    for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y - 2) > 1.2 && Math.hypot(x, y - 2) < 2.6) s.set(cx + x, y, M.metal[2]);
    for (let a = 0; a <= Math.PI; a += 0.05) { const x = Math.round(cx + Math.cos(a) * 11), y = Math.round(22 + Math.sin(a) * 6); s.set(x, y, M.metal[1]); s.set(x, y - 1, M.metal[2]); }
    outline(s, M.ink[0]); s.ax = cx; s.ay = h - 2;
    return s;
  }
  return { dock, boat, umbrella, towel, sandcastle, sign, crate, bucket, driftwood, lighthouse, coral, kelp, anemone, sponge, chest, anchor, pick };
})();
