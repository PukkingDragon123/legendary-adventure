/* ------------------------------------------------------------------
   WorldRender — sky, backdrop sea, terrain, water body and surface.
   Everything draws into a viewport-sized PX.Buf using integer camera
   coordinates (cx, cy) = world position of the top-left pixel.
------------------------------------------------------------------- */
const WorldRender = (() => {
  const { bayer4, bayer8, hash2, vnoise, fbm, rng } = PX;
  // integer Bayer tables (0..63 / 0..15) for the hot loops
  const BAYER8 = new Uint8Array(64), BAYER4 = new Uint8Array(16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) BAYER8[(y << 3) | x] = Math.round(bayer8(x, y) * 64 - 0.5);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) BAYER4[(y << 2) | x] = Math.round(bayer4(x, y) * 16 - 0.5);
  const { clamp, smooth, lerp, mixc } = Scenery;
  const { W, H, SEA, HORIZON, ground } = World;

  // ---- tiled textures (256x256) so per-pixel noise is a lookup ----
  // periodic value noise: lattice wraps every `per` cells, so the tile is seamless
  const pnoise = (x, y, per, seed) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (a) => ((a % per) + per) % per;
    const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
    const c = hash2(m(xi), m(yi + 1), seed), dd = hash2(m(xi + 1), m(yi + 1), seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
  };
  const pfbm = (x, y, per, seed, oct = 3) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += pnoise(x * f, y * f, per * f, seed + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
  const SANDTEX = new Uint8Array(65536), CUTTEX = new Uint8Array(65536), GRAIN = new Uint8Array(65536);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y << 8) | x;
      const n = pfbm(x / 16, y / 6.4, 16, 2) * 0.9 + (hash2(x, y, 7) - 0.5) * 0.22;
      SANDTEX[i] = n > 0.6 ? 3 : n > 0.42 ? 2 : 1;
      CUTTEX[i] = Math.sin((y / 256) * Math.PI * 2 * 9 + pfbm(x / 32, 0.5, 8, 3) * 6) > 0.55 ? 1 : 0;
      const h = hash2(x, y, 11);
      GRAIN[i] = h > 0.992 ? 3 : h > 0.985 ? 2 : h > 0.978 ? 1 : 0;
    }

  // ---- stars (sky space, parallax 0.04) ----
  const STARS = [];
  { const r = rng(91); for (let i = 0; i < 260; i++) STARS.push({ x: r() * 2400, y: r() * (SEA - 60), ph: r() * 6.28, sp: 0.6 + r() * 2, big: r() < 0.12, c: r() < 0.7 ? 0 : r() < 0.5 ? 1 : 2 }); }
  const STARC = [PX.hex('#ffffff'), PX.hex('#cfe0ff'), PX.hex('#fff0c8')];

  // ---- clouds (regenerated per hour) ----
  const CLOUDS = [
    { seed: 3, w: 150, h: 46, x: 200, y: 110, sp: 3, up: 3 }, { seed: 8, w: 92, h: 30, x: 700, y: 60, sp: 2.2, up: 1 },
    { seed: 14, w: 64, h: 20, x: 1150, y: 170, sp: 1.6, up: 1 }, { seed: 21, w: 120, h: 38, x: 1600, y: 90, sp: 2.6, up: 2 },
    { seed: 33, w: 80, h: 26, x: 2100, y: 200, sp: 1.2, up: 1 }, { seed: 41, w: 170, h: 50, x: 2600, y: 70, sp: 3.2, up: 3 },
    { seed: 47, w: 70, h: 22, x: 3100, y: 150, sp: 1.8, up: 1 }, { seed: 52, w: 110, h: 34, x: 3500, y: 250, sp: 1, up: 2 },
    { seed: 58, w: 90, h: 28, x: 400, y: 300, sp: 0.8, up: 1 }, { seed: 63, w: 130, h: 40, x: 1900, y: 330, sp: 0.7, up: 2 },
  ];
  const CLOUD_SPAN = 3800;
  const cloudBufs = {};
  function cloudsFor(P) {
    if (cloudBufs[P.key]) return cloudBufs[P.key];
    const pal = P.cloud;
    cloudBufs[P.key] = CLOUDS.map((c) => Scenery.makeCloud(c.seed, c.w, c.h, pal, { upper: c.up, L: P.cloudLit }));
    return cloudBufs[P.key];
  }
  // puffs of rain from poked clouds
  const rainClouds = new Map();

  // ---- backdrop features (parallax 0.35) ----
  const BX = 0.35;
  const headPal = {};
  function backdropBuf(P) {
    if (headPal[P.key]) return headPal[P.key];
    // headland with lighthouse + far islands, drawn once per hour into a strip
    const strip = new PX.Buf(1800, 110);
    const base = 100;
    const rp = P.rock;
    const hp = { rock: [rp[0], rp[1], rp[2]], grass: [P.grass[1], P.grass[2]], tower: [PX.mix(rp[3], PX.hex('#ffffff'), 0.4), PX.mix(rp[4], PX.hex('#ffffff'), 0.6), PX.hex('#ffffff')], stripe: [PX.hex('#96302b'), PX.hex('#d4443a'), PX.hex('#ee675a')], iron: rp[0], glass: PX.hex('#9fd9f2'), roof: PX.hex('#b3352e'), lampOn: [PX.hex('#ffe58a'), PX.hex('#fff8d2')] };
    if (P.key === 'dusk' || P.key === 'night') { hp.tower = [rp[2], rp[3], rp[4]]; hp.stripe = [PX.mix(PX.hex('#96302b'), rp[0], 0.5), PX.mix(PX.hex('#d4443a'), rp[1], 0.5), PX.mix(PX.hex('#ee675a'), rp[2], 0.5)]; }
    const lamp = Scenery.headland(strip, { x: 1240, y: base, w: 150, pal: hp, seed: 5, lampOn: P.key === 'night' || P.key === 'dusk' });
    // hazy city skylines on the far shores
    {
      const far = P.farC[1] || P.farC[0], lit = P.key === 'dusk' || P.key === 'night';
      const bc = [PX.mix(far, rp[1], 0.35), PX.mix(far, rp[2], 0.28), PX.mix(far, PX.hex('#ffffff'), 0.18)], win = PX.hex(lit ? '#ffe08a' : '#e8f4ff');
      for (const [x0, x1, hmax] of [[230, 470, 34], [1440, 1720, 44]]) {
        let x = x0, k = 0;
        while (x < x1) {
          const w = 6 + Math.floor(hash2(x, 1, 9) * 12), u = (x - x0) / (x1 - x0), hh = Math.round(6 + hash2(x, 2, 9) * hmax * Math.sin(u * Math.PI) + (hash2(x, 3, 9) > 0.85 ? 12 : 0));
          const c = bc[k++ % 2];
          for (let yy = base - hh; yy < base; yy++) for (let xx = x; xx < x + w; xx++) {
            let col = xx === x ? bc[2] : c;
            if (yy > base - hh + 2 && (xx - x) % 3 === 1 && (yy % 3 === 0) && hash2(xx, yy, 4) > (lit ? 0.45 : 0.8)) col = PX.mix(col, win, lit ? 0.9 : 0.35);
            strip.set(xx, yy, col);
          }
          if (hh > 30) for (let yy = base - hh - 6; yy < base - hh; yy++) strip.set(x + (w >> 1), yy, bc[0]);
          x += w + (hash2(x, 4, 9) > 0.7 ? 2 : 0);
        }
      }
    }
    // islands
    const isl = [PX.mix(P.farC[1] || P.farC[0], rp[2], 0.5), PX.mix(P.farC[1] || P.farC[0], rp[3], 0.35)];
    for (const [x0, w, h] of [[120, 90, 7], [520, 60, 5], [880, 130, 9], [1560, 70, 6]]) {
      for (let x = x0; x < x0 + w; x++) {
        const u = (x - x0) / w;
        const hh = Math.round(Math.sin(u * Math.PI) * h + fbm(x * 0.1, 0, x0, 2) * 2);
        for (let y = base - hh; y < base; y++) strip.set(x, y, y === base - hh ? isl[1] : isl[0]);
      }
      // tiny palms
      for (let k = 0; k < 3; k++) {
        const px = x0 + Math.round(w * (0.3 + k * 0.18));
        const top = base - Math.round(Math.sin((0.3 + k * 0.18) * Math.PI) * h) - 1;
        for (let j = 0; j < 5; j++) strip.set(px, top - j, isl[0]);
        for (const [dx, dy] of [[-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1], [-3, 1]]) strip.set(px + dx, top - 5 + dy, isl[0]);
      }
    }
    headPal[P.key] = { strip, lamp, base };
    return headPal[P.key];
  }

  /* ---------------- fast radial glow (sun halo) ---------------- */
  const glowMaps = new Map();
  function glowMap(r, levels, band) {
    const k = r + '|' + levels + '|' + band;
    let m = glowMaps.get(k);
    if (m) return m;
    const n = 2 * r + 1, q0 = new Int8Array(n * n).fill(-1), th = new Uint8Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (x - r) / r, dy = (y - r) / r;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        const f = (1 - d) * levels, q = Math.floor(f);
        q0[y * n + x] = q;
        th[y * n + x] = Math.round(smooth(0.5 - band / 2, 0.5 + band / 2, f - q) * 64);
      }
    m = { n, q0, th };
    glowMaps.set(k, m);
    return m;
  }
  function fastGlow(fb, X, Y, r, color, strength, maxRows, levels, band) {
    const m = glowMap(r, levels, band), n = m.n, W = fb.w, d = fb.d;
    const T = [];
    for (let q = 0; q <= levels + 1; q++) T.push(Math.round(Math.min(1, (q / levels) * strength) * 256));
    const y0 = Math.max(0, Y - r), y1 = Math.min(Math.min(fb.h, maxRows) - 1, Y + r);
    const x0 = Math.max(0, X - r), x1 = Math.min(W - 1, X + r);
    const cr = color & 0xff00ff, cg = color & 0x00ff00;
    for (let y = y0; y <= y1; y++) {
      const mrow = (y - Y + r) * n - X + r, brow = (y & 7) << 3, row = y * W;
      for (let x = x0; x <= x1; x++) {
        const j = mrow + x;
        let q = m.q0[j];
        if (q < 0) continue;
        if (BAYER8[brow | (x & 7)] < m.th[j]) q++;
        if (q <= 0) continue;
        const t8 = T[q], it = 256 - t8, a = d[row + x];
        d[row + x] = (0xff000000 | ((((a & 0xff00ff) * it + cr * t8) >>> 8) & 0xff00ff) | ((((a & 0x00ff00) * it + cg * t8) >>> 8) & 0x00ff00)) >>> 0;
      }
    }
  }

  /* ---------------- sky ---------------- */
  function drawSky(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    const rows = Math.min(VH, SEA - cy + 1);
    for (let sy = 0; sy < rows; sy++) {
      const wy = cy + sy;
      const s = P.skyRow[clamp(wy, 0, SEA)];
      const row = sy * VW;
      const fth = s.f * 64 - 0.5, brow = (wy & 7) << 3, A = s.a, B = s.b;
      for (let sx = 0; sx < VW; sx++) d[row + sx] = BAYER8[brow | ((cx + sx) & 7)] < fth ? B : A;
    }
    if (rows <= 0) return;
    // sun / moon + halo
    const S = P.sun;
    const sunX = Math.round(S.px * VW), sunY = Math.round(S.y - cy * 0.9 + 0);
    fastGlow(fb, sunX, sunY, S.halo, S.glow, 0.55, rows, 4, 0.2);
    if (P.stars) {
      for (const s of STARS) {
        const x = Math.round((((s.x - cx * 0.04) % 2400) + 2400) % 2400) - (2400 - VW) / 2;
        const y = Math.round(s.y - cy * 0.9);
        if (x < 0 || x >= VW || y < 0 || y >= rows) continue;
        const tw = Math.sin(t * s.sp + s.ph);
        if (tw < 0.8 - P.stars * 1.4) continue;
        if (s.big && tw > 0.6 && P.stars > 0.5) Scenery.star(fb, x, y, 2, STARC[s.c], PX.hex('#5a6aa8'));
        else fb.set(x, y, tw > 0.3 ? STARC[s.c] : PX.hex('#6a7ab8'));
      }
    }
    const R = S.r;
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const dd = Math.hypot(x + 0.5, y + 0.5) / R;
        if (dd > 1) continue;
        const X = sunX + x, Y = sunY + y;
        if (Y < 0 || Y >= rows || X < 0 || X >= VW) continue;
        let tn = dd > 0.84 ? 0 : dd > 0.5 ? 1 : 2;
        if (S.kind === 'moon') {
          tn = dd > 0.86 ? 0 : x + y * 0.6 < -R * 0.25 ? 2 : 1;
          for (const [kx, ky, kr] of [[-0.25, -0.2, 0.25], [0.3, 0.25, 0.2], [0.1, -0.45, 0.13], [-0.35, 0.4, 0.15]]) if (Math.hypot(x / R - kx, y / R - ky) < kr) tn = Math.max(0, tn - 1);
        }
        fb.d[Y * VW + X] = S.cols[tn];
      }
    // clouds
    const bufs = cloudsFor(P);
    CLOUDS.forEach((c, k) => {
      const b = bufs[k];
      const wx = (((c.x + Wind.off * 1.4 * c.sp - cx * 0.28) % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN - 200;
      const wy = c.y - cy * 0.9;
      if (wx > VW || wx + b.w < 0 || wy > rows || wy + b.h < 0) return;
      fb.blit(b, wx, wy, { test: (x, y) => cy + y < SEA - 4 });
      const rain = rainClouds.get(k);
      if (rain && t < rain) {
        for (let i = 0; i < 26; i++) {
          const rx = Math.round(wx + 8 + ((i * 37) % (b.w - 16)));
          const ry = Math.round(wy + b.h - 2 + ((t * 160 + i * 23) % 120));
          if (cy + ry < SEA) { fb.set(rx, ry, P.foam[1]); fb.set(rx, ry + 1, P.foam[2]); }
        }
      }
    });
  }
  function cloudAt(sx, sy, cx, cy, VW, t, P) {
    const bufs = cloudsFor(P);
    for (let k = 0; k < CLOUDS.length; k++) {
      const c = CLOUDS[k], b = bufs[k];
      const wx = (((c.x + Wind.off * 1.4 * c.sp - cx * 0.28) % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN - 200;
      const wy = c.y - cy * 0.9;
      const x = Math.round(sx - wx), y = Math.round(sy - wy);
      if (x >= 0 && y >= 0 && x < b.w && y < b.h && b.d[y * b.w + x]) return k;
    }
    return -1;
  }
  function rainOn(k, until) { rainClouds.set(k, until); }

  /* ---------------- backdrop: far sea band ---------------- */
  // camera tilt: the horizon (and everything on it) drifts at a slower parallax than the beach
  let TILT = 0;
  function setTilt(v) { TILT = Math.max(-40, Math.min(70, v)); }
  function drawBackdrop(fb, cx, cy, P, t, extras) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    const HZ = HORIZON + Math.round(TILT), band = (SEA - HORIZON) / (SEA - HZ);
    const y0 = Math.max(0, HZ - cy), y1 = Math.min(VH, SEA - cy + 6);
    for (let sy = y0; sy < y1; sy++) {
      const wy = cy + sy;
      const s = P.farRow[clamp(Math.round((wy - HZ) * band), 0, P.farRow.length - 1)];
      const row = sy * VW;
      const p = (wy - HZ) / (SEA - HZ);
      for (let sx = 0; sx < VW; sx++) {
        const ux = Math.floor(sx + cx * BX);
        let c = bayer8(ux, wy) < s.f ? s.b : s.a;
        const g = hash2(ux >> (p < 0.3 ? 0 : 1), wy, 3);
        if (g < 0.004 + p * 0.01) {
          const tw = Math.sin(t * (1.5 + g * 40) + g * 300);
          if (tw > 0.5) c = tw > 0.85 ? P.glint[0] : P.glint[1];
        }
        d[row + sx] = c;
      }
    }
    if (y1 <= y0) return;
    const bd = backdropBuf(P);
    const bx = -Math.round(cx * BX) + 900 - 1240 + Math.round(VW * 0.1);
    const byy = HZ - cy - bd.base + 1;
    fb.blit(bd.strip, bx + 1100, byy, { test: (x, y) => cy + y < SEA });
    if (extras) extras(fb, bx + 1100, byy, bd);
  }

  /* ---------------- terrain ---------------- */
  const SAND_CUT = 10;
  function drawTerrain(fb, cx, cy, P, t, occ, swash) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    const sd = P.sand, sw = P.sandWet, cut = P.cut, gr = P.grass;
    const shore = World.shoreX;
    for (let sx = 0; sx < VW; sx++) {
      const wx = cx + sx;
      if (wx < 0 || wx > W) continue;
      const g = ground[wx];
      const gTop = Math.ceil(g);
      const wetK = clamp((wx - (shore - 150 + swash.reach * 0.2)) / 150, 0, 1);
      const dune = wx < 470 ? smooth(470, 380, wx) : 0;
      let sy = Math.max(0, gTop - cy);
      for (; sy < VH; sy++) {
        const wy = cy + sy;
        const dep = wy - g;
        const i = sy * VW + sx;
        const ti = ((wy & 255) << 8) | (wx & 255);
        const gr8 = GRAIN[ti];
        let c;
        if (g > SEA + 2) {
          // sea floor: pale crust, then sediment darkening with depth
          const sb = P.seabed;
          if (dep < 1.5) c = sb[3];
          else if (dep < SAND_CUT) c = SANDTEX[ti] >= 2 ? sb[2] : bayer4(wx, wy) < 0.5 ? sb[2] : sb[1];
          else c = CUTTEX[ti] ? sb[0] : bayer4(wx, wy) < clamp((dep - SAND_CUT) / 60, 0, 1) ? sb[0] : sb[1];
          if (gr8 === 3) c = sb[3];
          d[i] = c;
          occ[i] = 1;
          continue;
        }
        if (dep < 1.5) c = dune > 0.3 && gr8 === 0 && ((wx * 7 + wy) % 5) / 5 < dune ? gr[2] : wetK > 0.5 ? sw[3] : sd[3];
        else if (dune > 0.3 && dep < 3.5 && ((wx * 3 + wy) % 4) / 4 < dune * 0.8) c = gr[1];
        else if (dep < SAND_CUT) {
          const tn = SANDTEX[ti];
          c = wetK > 0.35 && bayer4(wx, wy) < wetK ? sw[tn] : sd[tn];
          if (gr8 === 3) c = sd[0];
        } else {
          const deep = clamp((dep - SAND_CUT) / 90, 0, 1);
          c = CUTTEX[ti] ? cut[1] : bayer4(wx, wy) < deep ? cut[0] : sd[1];
          if (gr8 === 3) c = sd[3];
          else if (gr8 === 2) c = cut[0];
        }
        d[i] = c;
        occ[i] = 1;
      }
    }
  }

  /* ---------------- surface & swash ---------------- */
  const surf = new Float32Array(4096);
  function waves(wx, t) {
    return Math.sin(wx * 0.021 - t * 1.25) * 2.2 + Math.sin(wx * 0.049 + t * 1.9) * 1.3 + Math.sin(wx * 0.13 - t * 2.9) * 0.5;
  }
  function swashState(t) {
    const period = 6.6;
    const p = (t / period) % 1;
    const up = p < 0.28 ? Ease.outCubic(p / 0.28) : 1 - Ease.inOut((p - 0.28) / 0.72);
    return { p, reach: up * 90, front: World.shoreX - up * 90 };
  }
  function surfaceAt(wx, t) {
    return SEA + waves(wx, t) + Ripples.at(wx);
  }

  /* ---------------- water pass ---------------- */
  const RAY = new Float32Array(1024);
  let SILH = new Float32Array(0), WETCOL = new Uint8Array(0);
  function drawWater(fb, cx, cy, P, t, occ, swash) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    for (let sx = 0; sx < VW; sx++) surf[sx] = surfaceAt(cx + sx, t);
    let top = Infinity;
    for (let sx = 0; sx < VW; sx++) top = Math.min(top, surf[sx]);
    const sy0 = Math.max(0, Math.floor(top) - cy);
    if (sy0 >= VH) return;
    for (let k = 0; k < 1024; k++) {
      const u = k / 1024;
      let v = Math.max(0, Math.sin(u * 6.283 * 7 + t * 0.35)) ** 8 + Math.max(0, Math.sin(u * 6.283 * 11 - t * 0.22 + 1.7)) ** 10 * 0.8 + Math.max(0, Math.sin(u * 6.283 * 3 + t * 0.12)) ** 6 * 0.5;
      RAY[k] = v;
    }
    const rows = P.waterRow, rayC = P.rays, rayK = P.rayK;
    const bgFar = mixc(P.waterC[P.waterC.length - 1], P.waterC[Math.max(0, P.waterC.length - 2)], 0.5);
    const silh = SILH.length >= VW ? SILH : (SILH = new Float32Array(VW * 2));
    const wet = WETCOL.length >= VW ? WETCOL : (WETCOL = new Uint8Array(VW * 2));
    for (let sx = 0; sx < VW; sx++) {
      const wx = cx + sx;
      wet[sx] = ground[clamp(wx, 0, W)] > surf[sx] ? 1 : 0;
      silh[sx] = SEA + 330 + 110 * fbm((sx + cx * 0.55) * 0.009, 0, 5, 3) - 40 * Math.abs(Math.sin((sx + cx * 0.55) * 0.011));
    }
    // integer colour mix (t in 0..256): no lookups in the hot loop
    const mixi = (a, b, t8) => {
      const it = 256 - t8;
      const rb = (((a & 0xff00ff) * it + (b & 0xff00ff) * t8) >>> 8) & 0xff00ff;
      const g = (((a & 0x00ff00) * it + (b & 0x00ff00) * t8) >>> 8) & 0x00ff00;
      return (0xff000000 | rb | g) >>> 0;
    };
    const foamC = P.foam[1], causC = P.caustic;
    const B8 = BAYER8, B4 = BAYER4;
    const rayT = Math.round(0.28 * 256), foamT = Math.round(0.35 * 256), deepT = Math.round(0.22 * 256);
    for (let sy = sy0; sy < VH; sy++) {
      const wy = cy + sy;
      const dep = wy - SEA;
      const wr = rows[clamp(dep, 0, rows.length - 1)];
      const rowI = sy * VW;
      const fade = Math.max(0, 1 - dep / 560);
      const tintT = Math.round(clamp(0.16 + dep / 1000, 0.16, 0.52) * 0.8 * 256);
      const floorT = Math.round(clamp(0.06 + dep / 1700, 0, 1) * 256);
      // per-row colour set: plain water, deep-silhouette water, and their sunbeam versions
      const ca = wr.a, cb = wr.b;
      const da = mixi(ca, bgFar, deepT), db = mixi(cb, bgFar, deepT);
      const ra = mixi(ca, rayC, rayT), rb = mixi(cb, rayC, rayT), rda = mixi(da, rayC, rayT), rdb = mixi(db, rayC, rayT);
      const fth = wr.f * 64 - 0.5;
      const b8row = (wy & 7) << 3, b4row = (wy & 3) << 2;
      const rk = fade * rayK * 16;
      const u0 = (cx + dep * 0.42) * 0.9;
      const causRow = dep < 520;
      for (let sx = 0; sx < VW; sx++) {
        if (!wet[sx] || wy < surf[sx]) continue;
        const wx = cx + sx;
        const i = rowI + sx;
        const hiB = B8[b8row | (wx & 7)] < fth;
        const o = occ[i];
        let ray = false;
        if (rk > 0.28) {
          const v = RAY[(u0 + sx * 0.9) & 1023] * rk;
          ray = v > 0.64 && B4[b4row | (wx & 3)] + 0.5 < v;
        }
        let c;
        if (!o) {
          const deep = wy > silh[sx];
          c = ray ? (deep ? (hiB ? rdb : rda) : (hiB ? rb : ra)) : (deep ? (hiB ? db : da) : (hiB ? cb : ca));
        } else {
          const wc = hiB ? cb : ca;
          if (o === 1) {
            c = mixi(d[i], wc, floorT);
            if (causRow) {
              const gnd = ground[wx < 0 ? 0 : wx > W ? W : wx];
              if (wy - gnd < 7) {
                const a = vnoise(wx * 0.09 + t * 0.4, wy * 0.2 - t * 0.3, 4), b = vnoise(wx * 0.075 - t * 0.33, wy * 0.17 + t * 0.26, 9);
                if (Math.abs(a - b) < 0.035) c = mixi(c, causC, Math.round((0.45 * fade + 0.1) * 256));
              }
            }
          } else c = mixi(d[i], wc, tintT);
          if (ray) c = mixi(c, rayC, rayT);
        }
        if (wy - surf[sx] < 2.5) c = mixi(c, foamC, foamT);
        d[i] = c;
      }
    }
    // swash film running up the beach
    const front = Math.floor(swash.front);
    for (let wx = Math.max(cx, front - 2); wx < Math.min(cx + VW, World.shoreX + 4); wx++) {
      const sx = wx - cx;
      const g = ground[wx];
      const th = clamp((wx - front) / 20, 0, 2.4);
      for (let k = 0; k <= Math.ceil(th); k++) {
        const sy = Math.floor(g) - cy - k + 1;
        if (sy < 0 || sy >= VH) continue;
        const i = sy * VW + sx;
        d[i] = k >= Math.floor(th) ? P.foam[wx - front < 6 ? 0 : 1] : mixc(d[i], P.waterC[0], 0.5);
      }
    }
  }

  function drawSurface(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h;
    for (let sx = 0; sx < VW; sx++) {
      const wx = cx + sx;
      const g = ground[clamp(wx, 0, W)];
      const s = surf[sx];
      if (g <= s) continue;
      const sy = Math.floor(s) - cy;
      if (sy < 0 || sy >= VH) continue;
      const rv = Ripples.vel(wx), crest = waves(wx, t) < -2.4 || rv < -18;
      fb.set(sx, sy, P.foam[crest ? 0 : 1]);
      if (rv < -30 && hash2(wx, Math.floor(t * 8), 7) < 0.6) { fb.set(sx, sy - 1, P.foam[0]); if (rv < -55) fb.set(sx, sy - 2, P.foam[1]); }
      if (crest && hash2(wx >> 1, Math.floor(t * 4), 3) < 0.5) fb.set(sx, sy - 1, P.foam[0]);
      if (hash2(wx, Math.floor(t * 6), 5) < 0.06) fb.set(sx, sy + 1, P.foam[0]);
    }
  }

  return { setTilt, drawSky, drawBackdrop, drawTerrain, drawWater, drawSurface, surfaceAt, swashState, waves, cloudAt, rainOn, CLOUDS };
})();
