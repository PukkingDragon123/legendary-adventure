/* ------------------------------------------------------------------
   Scenic — shared hand-painted detail passes for the inland areas.
    · build-time sprite passes (palette-indexed, so they cost nothing
      per frame): furrowed bark with moss and knots, hanging moss and
      vines under foliage, light "baked" onto rock around glowing
      crystals and lava (a lit copy of the ramp), rim light, hanging
      roots and buried stones in the lane's cross-section
    · cheap runtime passes: drifting ground mist, slanted light shafts
      with dust motes, twinkling glints, heat shimmer
    · extra ambient life kinds for Weather: bats, embers, ash, petals,
      snowflakes, glowing spores, moths, drips
------------------------------------------------------------------- */
const Scenic = (() => {
  const { clamp, lerp, hash, vnoise, bayer4, mix, mixk, rng } = U;
  const n1 = (x, y) => Terrain.n1(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n2 = (x, y) => Terrain.n2(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff), n3 = (x, y) => Terrain.n3(Math.floor(x) & 0xffff, Math.floor(y) & 0xffff);
  const pickR = (ramp, t, x, y) => Terrain.pickR(ramp, t, x, y);
  const setOf = (...ramps) => { const m = new Uint8Array(256); for (const r of ramps) if (r) for (const i of r) m[i] = 1; return m; };

  // a tinted, lifted copy of a ramp of '#rrggbb' strings (rock lit by a crystal, ash lit by lava...)
  function tint(ramp, c, k = 0.4, lift = 0.1) {
    const tc = U.hex(c), out = [];
    for (let i = 0; i < ramp.length; i++) {
      let v = U.mix(U.hex(ramp[i]), tc, Math.min(1, k * (0.7 + 0.5 * i / Math.max(1, ramp.length - 1))));
      v = U.screen(v, tc, lift * (0.5 + i / ramp.length));
      out.push('#' + [U.R(v), U.G(v), U.B(v)].map((q) => q.toString(16).padStart(2, '0')).join(''));
    }
    return out;
  }

  /* ================= build-time sprite passes ================= */
  // furrowed bark: every horizontal run of trunk pixels is re-lit as a cylinder (light from the left),
  // cut by wavy vertical furrows between bark plates, with knots, lichen and moss on the shady side
  // o: {moss: ramp, lichen: index, seed, furrow (plates across a trunk), minRun, dark}
  function bark(s, ramp, o = {}) {
    if (!s || !ramp) return s;
    Terrain.tiles && Terrain.tiles();
    const w = s.w, h = s.h, d = s.d, isB = setOf(ramp), seed = o.seed || 0, n = ramp.length;
    const minRun = o.minRun ?? 4, F = o.furrow ?? 0.32, moss = o.moss, dk = o.dark || 0, mk = o.mossK ?? 0.35;
    const out = d.slice();
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!isB[d[y * w + x]]) { x++; continue; }
        const x0 = x; while (x < w && isB[d[y * w + x]]) x++;
        const len = x - x0; if (len < minRun) continue;
        const cx = (x0 + x - 1) / 2, half = Math.max(1, len / 2);
        const plates = Math.max(2, Math.round(len * F));
        for (let xx = x0; xx < x; xx++) {
          const u = (xx - cx) / half; // -1 left (lit) .. 1 right (shade)
          const wob = (n1(xx * 0.7 + seed, y * 0.12) - 0.5) * 1.6;
          const ph = ((u + 1) * 0.5 * plates + wob) % 1;
          let lit = 0.78 - (u + 1) * 0.34 - dk;
          if (u > 0.72) lit -= 0.16;                 // core shadow on the far side
          if (u < -0.8) lit -= 0.1;                  // thin dark rim on the lit edge
          const fur = ph < 0.16 || ph > 0.94;
          if (fur) lit -= 0.3; else if (ph < 0.3) lit += 0.1; // plate edge catches the light
          lit += (n2(xx * 2 + seed, y * 0.9) - 0.5) * 0.18;
          let c = pickR(ramp, lit, xx, y);
          // knots: little dark ovals with a lit lower lip
          const kh = hash(Math.floor(xx / 7) + seed, Math.floor(y / 13), 71);
          if (kh > 0.965 && len > 10) { const kx = Math.floor(xx / 7) * 7 + 3.5, ky = Math.floor(y / 13) * 13 + 6.5, q = ((xx - kx) / 2.6) ** 2 + ((y - ky) / 3.4) ** 2; if (q < 1) c = q < 0.45 ? ramp[0] : ramp[Math.min(n - 1, 3)]; }
          // moss / lichen on the shady, damp side, thicker low on the trunk
          if (moss && u > 0.15 && n1(xx * 2.3 + seed * 3, y * 0.7) + (y / h) * mk > 1.02 && n2(xx * 1.3 + seed, y * 1.1) > 0.35) c = pickR(moss, 0.25 + (1 - u) * 0.45 + (n2(xx, y) - 0.5) * 0.3, xx, y);
          else if (o.lichen && hash(xx, y, seed + 5) > 0.992) c = o.lichen;
          out[y * w + xx] = c;
        }
      }
    }
    d.set(out);
    return s;
  }
  // strands of moss / vines hanging below foliage: from the lowest leaf pixels down
  // o: {n (strands), len, seed, leafSet (ramp(s) counted as foliage), tip ramp}
  function hangMoss(s, ramp, o = {}) {
    const w = s.w, h = s.h, d = s.d, isL = setOf(...(o.from || [])), r = rng(o.seed || 7);
    const n = o.n ?? Math.round(w / 12), L = o.len ?? 14;
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * w);
      // lowest foliage pixel in this column
      let y = -1; for (let yy = h - 1; yy >= 0; yy--) if (isL[d[yy * w + x]]) { y = yy; break; }
      if (y < 0) continue;
      const len = Math.round(L * (0.4 + r() * 0.9));
      let xx = x;
      for (let j = 1; j <= len && y + j < h; j++) {
        if (d[(y + j) * w + xx] && !isL[d[(y + j) * w + xx]]) break;
        const t = j / len;
        d[(y + j) * w + xx] = ramp[Math.min(ramp.length - 1, Math.floor((1 - t) * (ramp.length - 1) + (bayer4(xx, y + j) < 0.5 ? 0.5 : 0)))];
        if (o.leaves && j % 4 === 2 && xx + 1 < w && !d[(y + j) * w + xx + 1]) d[(y + j) * w + xx + 1] = ramp[ramp.length - 1];
        if (o.leaves && j % 4 === 0 && xx > 0 && !d[(y + j) * w + xx - 1]) d[(y + j) * w + xx - 1] = ramp[Math.max(0, ramp.length - 2)];
        if (r() < 0.12) xx = clamp(xx + (r() < 0.5 ? -1 : 1), 0, w - 1);
      }
    }
    return s;
  }
  // bake a pool of coloured light onto a sprite: pixels of `from` ramps within radius R of (x, y) are moved onto
  // the matching step of the lit ramp `to` (a tinted copy of the base ramp), dithered by distance
  function bakeLight(s, x, y, R, from, to, o = {}) {
    const w = s.w, h = s.h, d = s.d, map = new Int16Array(256).fill(-1);
    for (const f of from) for (let k = 0; k < f.length; k++) map[f[k]] = Math.round(k / Math.max(1, f.length - 1) * (to.length - 1));
    const flat = o.flat || 1, str = o.k ?? 1;
    for (let yy = Math.max(0, Math.floor(y - R / flat)); yy < Math.min(h, y + R / flat); yy++) for (let xx = Math.max(0, Math.floor(x - R)); xx < Math.min(w, x + R); xx++) {
      const i = yy * w + xx, m = map[d[i]]; if (m < 0) continue;
      const q = Math.hypot(xx - x, (yy - y) * flat) / R; if (q >= 1) continue;
      const a = (1 - q) * (1 - q) * str;
      if (a < bayer4(xx, yy) * 0.9) continue;
      d[i] = to[clamp(m + (a > 0.55 ? 1 : 0), 0, to.length - 1)];
    }
  }
  // lit rim along the top/left edges of everything drawn with `ramps` (sunlight or crystal light from above)
  function rim(s, ramps, idx, o = {}) {
    const w = s.w, h = s.h, d = s.d, is = setOf(...ramps), src = d.slice(), dx = o.dx ?? -1, dy = o.dy ?? -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!is[src[i]]) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || !src[Y * w + X]) { if (!o.chance || hash(x, y, 9) < o.chance) d[i] = idx; }
    }
  }
  // hanging roots from the top edge of the lane's cross-section and buried stones lower down
  function laneRoots(A, M, o = {}) {
    const T = A.terr; if (!T) return;
    const r = rng(o.seed || 5), W = T.w, rootR = o.ramp || M.bark;
    const gy = (x) => World.groundAt(x), front = T.bf;
    const ok = o.ok || (() => true);
    for (let x = 6; x < W - 6; x += o.step ?? 9) {
      if (!ok(x) || r() > (o.p ?? 0.55)) continue;
      // a root curls down out of the strip's front edge
      let xx = x + r() * 6, y = gy(xx) + front + 1;
      const L = 4 + r() * (o.len ?? 22), th = r() < 0.3 ? 2 : 1;
      let a = Math.PI / 2 + (r() - 0.5) * 0.6;
      for (let j = 0; j < L; j++) {
        const c = j < 2 ? rootR[3] : rootR[j % 4 === 0 ? 1 : 2];
        Terrain.put(A, xx, y, c); if (th > 1 && j < L * 0.6) Terrain.put(A, xx + 1, y, rootR[1]);
        if (j > 3 && r() < 0.08) { Terrain.put(A, xx - 1, y + 1, rootR[2]); Terrain.put(A, xx - 2, y + 2, rootR[1]); } // a rootlet
        xx += Math.cos(a) * 0.8; y += Math.sin(a) * 0.9; a += (r() - 0.5) * 0.35;
      }
    }
    // buried stones and pebbles with a lit top, sunk into the soil (darker the deeper they lie)
    const S = o.stones ?? Math.round(W / 26), rock = o.rock || M.rock;
    for (let k = 0; k < S; k++) {
      const x = r() * W; if (!ok(x)) continue;
      const dd = Math.pow(r(), 1.5), y = gy(x) + front + 6 + dd * (o.deep ?? 140);
      const rw = 1.5 + r() * (o.big ?? 5), rh = 1 + r() * rw * 0.6;
      for (let yy = -rh; yy <= rh; yy++) for (let q = -rw; q <= rw; q++) {
        const e = (q / rw) ** 2 + (yy / rh) ** 2; if (e > 1) continue;
        const lit = 0.62 - (yy / rh) * 0.3 - (q / rw) * 0.18 - (e > 0.65 ? 0.28 : 0) - dd * 0.25;
        Terrain.put(A, x + q, y + yy, pickR(rock, lit, Math.round(x + q), Math.round(y + yy)));
      }
    }
    // a fringe of grass / moss spilling over the front edge of the strip
    if (o.lip) for (let x = 0; x < W; x++) {
      if (!ok(x)) continue;
      const L = Math.floor(hash(x, 1, o.seed || 5) * hash(x >> 2, 2, o.seed || 5) * (o.lipLen ?? 5));
      const y0 = Math.round(gy(x) + front);
      for (let j = 0; j < L; j++) Terrain.put(A, x, y0 + j, o.lip[Math.max(0, o.lip.length - 2 - j)]);
    }
  }

  /* ================= runtime passes ================= */
  // fog noise tile (128 x 64), shared
  let FOG = null;
  function fogTile() {
    if (FOG) return FOG;
    Terrain.tiles && Terrain.tiles();
    FOG = new Float32Array(128 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) FOG[y * 128 + x] = (Terrain.n3(x * 2, y * 4) + Terrain.n2(x * 2, y * 4) * 0.5) / 1.5;
    return FOG;
  }
  // drifting mist hugging the ground: world rows y0..y1 (thickest at yPeak), colour c, strength k
  // o.ground(x): mist follows the lane height (pass World.groundAt); o.par (x parallax of the noise)
  function mist(fb, cx, cy, t, o) {
    const F = fogTile(), W = fb.w, H = fb.h, d = fb.d;
    const k = o.k ?? 0.4; if (k <= 0.01) return;
    const c = o.c, up = o.up ?? 40, down = o.down ?? 14, sp = o.speed ?? 4, step = o.step ?? 4;
    const gyAt = o.ground || null;
    // the band's base height is sampled every `step` columns
    const xa = o.x0 !== undefined ? Math.max(0, Math.floor(o.x0 - cx)) : 0, xb = o.x1 !== undefined ? Math.min(W, Math.ceil(o.x1 - cx)) : W;
    for (let x0 = xa; x0 < xb; x0 += step) {
      const base = gyAt ? gyAt(x0 + cx) : o.y;
      const ek = o.x0 !== undefined ? Math.min(1, (x0 + cx - o.x0) / (o.fade ?? 30), (o.x1 - x0 - cx) / (o.fade ?? 30)) : 1;
      if (ek <= 0) continue;
      const ya = Math.max(0, Math.floor(base - up - cy)), yb = Math.min(H, Math.ceil(base + down - cy));
      for (let y = ya; y < yb; y++) {
        const wy = y + cy, dv = wy - base, vf = dv < 0 ? 1 + dv / up : 1 - dv / down; // 0 at the band edges, 1 at the base
        if (vf <= 0) continue;
        const ny = ((wy >> 1) & 63) * 128, row = y * W;
        for (let x = x0; x < Math.min(xb, x0 + step); x++) {
          const nx = ((x + cx * (o.par ?? 1) + t * sp) >> 1) & 127, nx2 = ((x + cx * 0.85 - t * sp * 0.6) >> 2) & 127;
          const nv = F[ny + nx] * 0.6 + F[(((wy >> 2) + 23) & 63) * 128 + nx2] * 0.4;
          const a = vf * vf * k * ek * (nv * 1.5 - 0.25);
          if (a < 0.03) continue;
          d[row + x] = mixk(d[row + x], c, Math.min(220, (a * 256) | 0));
        }
      }
    }
  }
  // slanted light shafts (screen-space, anchored to the world by parallax), with dust motes floating in them
  // o: {c, k, slant, par, freq, motes, top, bottom}
  const shTab = { a: null };
  function shafts(fb, cx, cy, t, o) {
    const W = fb.w, H = fb.h, d = fb.d, k = o.k ?? 0.2; if (k <= 0.005) return;
    const slant = o.slant ?? 0.45, par = o.par ?? 0.6, f1 = o.freq ?? 0.021, th = o.th ?? 0.55;
    const o0 = slant < 0 ? Math.floor(H * slant) : 0, base = Math.floor(cx * par) + o0, n = W + Math.ceil(H * Math.abs(slant)) + 2;
    if (!shTab.a || shTab.a.length < n) shTab.a = new Float32Array(n + 64);
    const tab = shTab.a;
    for (let j = 0; j < n; j++) { const wx = base + j; const v = Math.sin(wx * f1 + (o.ph || 0)) * Math.sin(wx * f1 * 0.35 + 1.3) + Math.sin(t * 0.3 + wx * 0.002) * 0.2; tab[j] = v > th ? v - th : 0; }
    const y0 = Math.max(0, o.top ?? 0), y1 = Math.min(H, o.bottom ?? H), c = o.c;
    for (let y = y0; y < y1; y++) {
      const ky = k * (0.35 + 0.65 * (1 - (y - y0) / Math.max(1, y1 - y0))), off = Math.floor(y * slant) - o0, row = y * W;
      for (let x = Math.max(0, o.xMin || 0); x < W; x++) { const v = tab[x + off]; if (v > 0) { const a = v * ky; if (a > 0.004) d[row + x] = U.screen(d[row + x], c, a); } }
    }
    // dust motes drifting inside the beams
    const nm = o.motes ?? 40;
    for (let i = 0; i < nm; i++) {
      const h1 = hash(i, 3, 17), h2 = hash(i, 4, 17), h3 = hash(i, 5, 17);
      const y = Math.floor(y0 + ((h2 * (y1 - y0) + t * (3 + h3 * 5)) % (y1 - y0)));
      const x = Math.floor(((h1 * (W + 60) + Math.sin(t * 0.4 + i) * 6 - t * 2) % (W + 60) + W + 60) % (W + 60)) - 30;
      if (x < (o.xMin || 0) || x >= W || y < 0 || y >= H) continue;
      const v = tab[x + Math.floor(y * slant) - o0];
      if (v <= 0.02) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
      d[y * W + x] = U.screen(d[y * W + x], c, Math.min(0.9, v * 3 * tw * (o.moteK ?? 1)));
    }
  }
  // glints that twinkle (crystal tips, frost, wet stones): pts = [[wx, wy, phase, size]...], world-locked
  function twinkle(fb, cx, cy, t, pts, c, o = {}) {
    const W = fb.w, H = fb.h, d = fb.d, rate = o.rate ?? 1.3, k = o.k ?? 1;
    for (const p of pts) {
      const X = Math.round(p[0] - cx), Y = Math.round(p[1] - cy);
      if (X < 2 || Y < 2 || X >= W - 2 || Y >= H - 2) continue;
      const s = Math.sin(t * rate + p[2]); if (s < 0.55) continue;
      const a = (s - 0.55) / 0.45 * k, i = Y * W + X;
      d[i] = U.screen(d[i], 0xffffffff, a);
      const g = a * 0.55;
      d[i - 1] = U.screen(d[i - 1], c, g); d[i + 1] = U.screen(d[i + 1], c, g); d[i - W] = U.screen(d[i - W], c, g); d[i + W] = U.screen(d[i + W], c, g);
      if ((p[3] || 1) > 1 && a > 0.6) { d[i - 2] = U.screen(d[i - 2], c, g * 0.5); d[i + 2] = U.screen(d[i + 2], c, g * 0.5); d[i - 2 * W] = U.screen(d[i - 2 * W], c, g * 0.5); d[i + 2 * W] = U.screen(d[i + 2 * W], c, g * 0.5); }
    }
  }
  // heat shimmer: rows of a screen rectangle wobble sideways (stronger toward the hot bottom)
  let hrow = null;
  function heat(fb, x0, x1, y0, y1, t, amp = 1.4) {
    const W = fb.w, H = fb.h, d = fb.d;
    x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W, Math.ceil(x1)); y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 - x0 < 2 || y1 <= y0) return;
    if (!hrow || hrow.length < W) hrow = new Uint32Array(W);
    for (let y = y0; y < y1; y++) {
      const k = (y - y0) / Math.max(1, y1 - y0), off = Math.round(Math.sin(y * 0.55 + t * 7) * amp * k + Math.sin(y * 0.17 - t * 3.1) * amp * 0.5 * k);
      if (!off) continue;
      const row = y * W;
      for (let x = x0; x < x1; x++) hrow[x] = d[row + clamp(x + off, 0, W - 1)];
      for (let x = x0; x < x1; x++) d[row + x] = hrow[x];
    }
  }
  // a soft vertical gradient wash over screen rows (cave darkness at the top, warm lava light from below...)
  function wash(fb, y0, y1, c, a0, a1) {
    const W = fb.w, H = fb.h, d = fb.d;
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H, Math.ceil(y1));
    for (let y = ya; y < yb; y++) {
      const a = lerp(a0, a1, (y - y0) / Math.max(1, y1 - y0)); if (a <= 0.01) continue;
      const kk = Math.min(255, (a * 256) | 0), row = y * W;
      for (let x = 0; x < W; x++) d[row + x] = mixk(d[row + x], c, kk);
    }
  }

  /* ================= extra ambient life (drawn by Weather) ================= */
  const S = (d, i, c, a) => { d[i] = U.screen(d[i], c, a); };
  const amb = {
    // a bat: dark body with wings that beat up and down
    bat(d, i, x, y, W, H, p, t) {
      const up = Math.sin(t * 16 + p.ph) > 0, c = p.c;
      d[i] = c; d[i - 1] = c; d[i + 1] = c;
      if (x > 3 && x < W - 3 && y > 2 && y < H - 2) {
        if (up) { d[i - 2 - W] = c; d[i + 2 - W] = c; d[i - 3 - W] = c; d[i + 3 - W] = c; }
        else { d[i - 2 + W] = c; d[i + 2 + W] = c; d[i - 3] = c; d[i + 3] = c; }
        if (p.eye) d[i - W] = p.eye;
      }
    },
    // a glowing ember drifting up, flickering, with a faint trail
    ember(d, i, x, y, W, H, p, t, k) {
      const f = 0.65 + 0.35 * Math.sin(t * 13 + p.ph);
      S(d, i, p.c, Math.min(1, f * k)); S(d, i + W, p.c2 || p.c, 0.45 * k * f);
      if (p.big) { S(d, i - 1, p.c2 || p.c, 0.4 * k); S(d, i + 1, p.c2 || p.c, 0.4 * k); S(d, i - W, p.c, 0.35 * k); }
    },
    // a flake of ash or a snowflake, tumbling
    ash(d, i, x, y, W, H, p, t, k) { d[i] = mix(d[i], p.c, 0.85 * k); if (p.big) { d[i + 1] = mix(d[i + 1], p.c2 || p.c, 0.6 * k); if (Math.sin(t * 4 + p.ph) > 0) d[i + W] = mix(d[i + W], p.c2 || p.c, 0.5 * k); } },
    flake(d, i, x, y, W, H, p, t, k) { d[i] = mix(d[i], 0xffffffff, 0.9 * k); if (p.big) { const s = Math.sin(t * 3 + p.ph) > 0; d[i + (s ? 1 : W)] = mix(d[i + (s ? 1 : W)], p.c || 0xfff0f6ff, 0.7 * k); d[i - (s ? 1 : W)] = mix(d[i - (s ? 1 : W)], p.c || 0xfff0f6ff, 0.5 * k); } },
    // a petal turning in the breeze (two tones as it flips)
    petal(d, i, x, y, W, H, p, t, k) { const f = Math.sin(t * 6 + p.ph); d[i] = mix(d[i], f > 0 ? p.c : (p.c2 || p.c), 0.95 * k); if (Math.abs(f) > 0.5) d[i + 1] = mix(d[i + 1], p.c2 || p.c, 0.8 * k); },
    // glowing spores / glow-worm specks: soft pulsing light
    spore(d, i, x, y, W, H, p, t, k) { const on = (0.55 + 0.45 * Math.sin(t * 2.2 + p.ph)) * k; S(d, i, p.c, on); const g = on * 0.35; S(d, i - 1, p.c, g); S(d, i + 1, p.c, g); S(d, i - W, p.c, g); S(d, i + W, p.c, g); },
    // a moth fluttering (pale wings, quick flaps)
    moth(d, i, x, y, W, H, p, t, k) { const open = Math.sin(t * 24 + p.ph) > 0; d[i] = 0xff303040; if (open) { d[i - 1] = p.c; d[i + 1] = p.c; } else { d[i - W] = p.c; } },
    // a falling water drop (a short streak)
    drip(d, i, x, y, W, H, p, t, k) { S(d, i, p.c, 0.85 * k); S(d, i - W, p.c, 0.45 * k); },
  };

  return { tint, bark, hangMoss, bakeLight, rim, laneRoots, mist, shafts, twinkle, heat, wash, amb, fogTile, setOf };
})();
