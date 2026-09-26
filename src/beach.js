/* ------------------------------------------------------------------
   Beach — shared stage for every painting in the series: the same
   stretch of shore (lighthouse on the right headland) at a different
   hour. Bakes sky/sea/sand, then animates the swash every frame.
------------------------------------------------------------------- */
const Beach = (() => {
  const { hex, Buf, bayer4, bayer8, hash2, vnoise, fbm, rng } = PX;
  const { vgrad, glow, clamp, smooth, lerp, mixc } = Scenery;

  const H = (o) => {
    // recursively convert '#rrggbb' strings in palette objects to packed colours
    if (typeof o === 'string') return o[0] === '#' ? hex(o) : o;
    if (Array.isArray(o)) return o.map(H);
    if (o && typeof o === 'object') {
      const r = {};
      for (const k in o) r[k] = typeof o[k] === 'number' ? o[k] : H(o[k]);
      return r;
    }
    return o;
  };
  const stops = (arr) => arr.map(([t, c]) => [t, typeof c === 'string' ? hex(c) : c]);

  const SPRITES = {
    starfish: ['...d...', '..dld..', 'ddrlrdd', 'drlllrd', '.drlrd.', '.dr.rd.', 'dd...dd'],
    shell: ['.dddd.', 'dlrlrd', 'dlrlrd', '.drrd.', '..dd..'],
    pebble: ['.dd.', 'dlrd', 'drrd', '.dd.'],
    conch: ['..dd..', '.dlld.', 'dlrrld', 'drrrrd', '.drrd.', '..dd..'],
  };
  function stamp(buf, spr, x, y, cols) {
    for (let r = 0; r < spr.length; r++)
      for (let c = 0; c < spr[r].length; c++) {
        const ch = spr[r][c];
        if (ch === '.') continue;
        buf.set(x + c, y + r, cols[ch]);
      }
  }

  function create(cfg) {
    const W = cfg.W, Hh = cfg.H, hz = cfg.hz;
    const pal = cfg.pal;
    const seed = cfg.seed || 7;
    const bg = new Buf(W, Hh);

    // --- sky + sea gradients
    if (cfg.sun) Scenery.skyField(bg, 0, hz, stops(pal.sky), cfg.sun, cfg.skyBand ?? 0.3);
    else vgrad(bg, 0, hz, stops(pal.sky), cfg.skyBand ?? 0.34);
    vgrad(bg, hz, Hh, stops(pal.sea), cfg.seaBand ?? 0.4);
    if (pal.horizon) bg.hline(0, W - 1, hz, pal.horizon);

    // --- sand layers (baked once)
    const sandDry = new Buf(W, Hh), sandWet = new Buf(W, Hh);
    const sandTop = cfg.sandTop ?? hz + 20;
    for (let y = sandTop; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const persp = (y - hz) / (Hh - hz);
        const n = fbm(x * 0.04, y * (0.12 - persp * 0.05), seed, 3) + (bayer4(x, y) - 0.5) * 0.06;
        let t = n > 0.57 ? 3 : n > 0.43 ? 2 : 1;
        const hh = hash2(x, y, seed);
        if (hh > 0.972) t = 0;
        else if (hh > 0.95) t = Math.max(0, t - 1);
        else if (hh < 0.018) t = 3;
        const rp = Math.sin(x * 0.2 + y * (1.1 + persp * 0.5) + fbm(x * 0.03, y * 0.05, seed + 3) * 7);
        if (rp > 0.94 && t > 1) t -= 1;
        sandDry.d[y * W + x] = pal.sand[t];
        sandWet.d[y * W + x] = pal.sandWet[t];
      }
    // shells & starfish scattered on the dry sand (both layers so they show when wet)
    const props = cfg.props || [];
    for (const p of props) {
      const cols = { d: pal.prop[p.kind].d, l: pal.prop[p.kind].l, r: pal.prop[p.kind].r };
      stamp(sandDry, SPRITES[p.kind], p.x, p.y, cols);
      const wc = { d: pal.prop[p.kind].d, l: mixc(cols.l, pal.sandWet[1], 0.35), r: mixc(cols.r, pal.sandWet[1], 0.35) };
      stamp(sandWet, SPRITES[p.kind], p.x, p.y, wc);
    }

    // --- swash state
    const edge = new Float32Array(W), wet = new Float32Array(W), lace = new Float32Array(W);
    const mask = new Uint8Array(W * Hh);
    const wave = Object.assign({ period: 6.4, reach: 16, far: hz + 36, skew: 0.004, jitter: 1.4 }, cfg.wave || {});
    const shore = cfg.shore;
    const baseMin = (() => { let m = Infinity; for (let x = 0; x < W; x++) m = Math.min(m, shore(x)); return m; })();
    let waveInfo = new Array(W);
    let time = 0;
    for (let x = 0; x < W; x++) { edge[x] = shore(x); wet[x] = shore(x); }

    function phaseAt(t, x) {
      const u = (t - x * wave.skew) / wave.period;
      return { p: u - Math.floor(u), cyc: Math.floor(u) };
    }
    function update(t, dt) {
      time = t;
      for (let x = 0; x < W; x++) {
        const { p, cyc } = phaseAt(t, x);
        const base = shore(x);
        const big = 0.8 + 0.35 * hash2(cyc, 3, seed); // wave-to-wave variety
        const R = wave.reach * big * (1 + 0.18 * Math.sin(x * 0.021 + cyc * 1.7));
        let reach, br = null;
        if (p < 0.38) {
          const k = p / 0.38;
          reach = R * 0.0;
          br = lerp(wave.far, base - 2, k * k);
        } else if (p < 0.56) reach = R * Ease.outCubic((p - 0.38) / 0.18);
        else reach = R * (1 - Ease.inOut((p - 0.56) / 0.44));
        reach += Math.sin(x * 0.09 + t * 0.9) * wave.jitter * 0.5 + Math.sin(x * 0.031 - t * 0.4) * wave.jitter * 0.5;
        const e = base + Math.max(-1.5, reach);
        edge[x] = e;
        wet[x] = Math.max(wet[x] - dt * (wave.dry ?? 2.6), e);
        waveInfo[x] = { p, br, cyc, R };
      }
    }

    function causticAt(x, y, t) {
      const a = vnoise(x * 0.12 + t * 0.32, y * 0.34 - t * 0.22, seed);
      const b = vnoise(x * 0.1 - t * 0.27, y * 0.3 + t * 0.19, seed + 9);
      return Math.abs(a - b) < 0.034;
    }

    // Draw the shallows, swash, foam and sand. `fb` already holds bg.
    function drawShore(fb, t, opts = {}) {
      const glowFoam = opts.glowFoam || null;
      const yTop = Math.max(hz + 1, Math.floor(baseMin - 34));
      mask.fill(0, 0, yTop * W);
      for (let x = 0; x < W; x++) {
        const e = edge[x], wv = wet[x];
        const inf = waveInfo[x];
        for (let y = yTop; y < Hh; y++) {
          const i = y * W + x;
          if (y >= e) {
            mask[i] = 0;
            if (y < wv) {
              let c = sandWet.d[i];
              // sky sheen streaks on the freshly wet sand
              const dd = wv - y;
              if (dd > 1 && hash2(x >> 2, y, seed + 5) > 0.9 && pal.sheen) c = pal.sheen;
              fb.d[i] = c;
            } else fb.d[i] = sandDry.d[i];
            continue;
          }
          const depth = e - y;
          mask[i] = 1;
          if (depth > 34) continue;
          // fade from the open-sea colour into the shallow ramp
          if (depth > 22 && bayer8(x, y) < (depth - 22) / 12) continue;
          const f = depth / 32 + (bayer8(x, y) - 0.5) * 0.12;
          const sh = pal.shallow;
          let idx = f < 0.08 ? 4 : f < 0.2 ? 3 : f < 0.42 ? 2 : f < 0.72 ? 1 : 0;
          let c = sh[idx];
          if (depth < 6) c = mixc(sandWet.d[i] || sh[4], sh[Math.min(4, idx)], 0.58);
          if (depth > 2 && depth < 26 && pal.caustic && causticAt(x, y, t)) c = depth < 12 ? pal.caustic : mixc(pal.caustic, sh[1], 0.45);
          fb.d[i] = c;
        }
      }
      // incoming breaker lines
      for (let x = 0; x < W; x++) {
        const inf = waveInfo[x];
        if (inf.br === null) continue;
        const k = inf.p / 0.38;
        const y = Math.round(inf.br);
        const gap = hash2(x >> 1, inf.cyc, seed) < 0.12 + (1 - k) * 0.35;
        const th = k < 0.35 ? 1 : k < 0.75 ? 2 : 3;
        if (!gap) {
          for (let j = 0; j < th; j++) fb.set(x, y - j, j === th - 1 ? (glowFoam ? glowFoam[0] : pal.foam[0]) : glowFoam ? glowFoam[1] : pal.foam[1]);
        }
        // wave face under the crest
        for (let j = 1; j <= 1 + Math.round(k * 2); j++) {
          const ii = (y + j) * W + x;
          if (y + j < Hh && mask[ii]) fb.d[ii] = mixc(fb.d[ii], pal.face || pal.shallow[0], 0.45);
        }
      }
      // swash foam: leading edge + dissolving lace
      for (let x = 0; x < W; x++) {
        const inf = waveInfo[x];
        const e = edge[x];
        const ey = Math.floor(e);
        const rushing = inf.p >= 0.38 && inf.p < 0.62;
        const th = rushing ? 3 + Math.round(hash2(x, inf.cyc, seed + 1) * 2) : 1 + Math.round(hash2(x >> 1, inf.cyc, seed + 2) * 1.4);
        const F = glowFoam || pal.foam;
        for (let j = 1; j <= th; j++) {
          const y = ey - j + 1;
          if (y < 0 || y >= Hh) continue;
          if (j === th && hash2(x, y, seed + 3) < 0.4) continue;
          fb.d[y * W + x] = j === 1 ? F[0] : j < th ? F[0] : F[1];
        }
        if (ey + 1 < Hh && hash2(x, 1, seed) < 0.7) fb.set(x, ey + 1, F[2]);
        // lace: foam netting in the thin sheet behind the edge while it recedes
        if (inf.p > 0.5) {
          const fade = (inf.p - 0.5) / 0.5;
          for (let j = 2; j < 13; j++) {
            const y = ey - j;
            if (y < 0) continue;
            const n = vnoise(x * 0.35, (y - e) * 0.7 + inf.cyc * 13.7, seed + 4);
            const n2 = vnoise(x * 0.18 + 5, (y - e) * 0.36 + inf.cyc * 7.1, seed + 8);
            if (Math.abs(n - n2) < 0.07 - fade * 0.05 - j * 0.002) fb.d[y * W + x] = j < 6 ? F[1] : F[2];
          }
        }
        // wrack line: bubbly line left at the high-water mark
        const wy = Math.floor(wet[x]);
        if (wy > ey + 2 && wy < Hh && hash2(x, wy, seed + 6) < 0.34) fb.set(x, wy, F[2]);
      }
    }

    update(0, 0);
    const isWater = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && mask[y * W + x] === 1;
    return { bg, sandDry, sandWet, edge, wet, mask, update, drawShore, isWater, shore, waveInfo: () => waveInfo, stamp };
  }

  /* Light shafts: precomputed angle/falloff, animated band pattern (dithered lighten) */
  function makeRays(W, Hh, o) {
    const { x: ox, y: oy, a0, a1, reach, color, strength = 0.35, test } = o;
    const ang = new Float32Array(W * Hh), fall = new Float32Array(W * Hh);
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - ox, dy = y - oy;
        const a = Math.atan2(dy, dx);
        const d = Math.hypot(dx, dy);
        const i = y * W + x;
        ang[i] = (a - a0) / (a1 - a0);
        fall[i] = test && !test(x, y) ? 0 : Math.max(0, 1 - d / reach) * (a > a0 && a < a1 ? 1 : 0);
      }
    const LUT = new Float32Array(512);
    return function draw(fb, t) {
      for (let k = 0; k < 512; k++) {
        const u = k / 511;
        let v = 0;
        v += Math.max(0, Math.sin(u * 23 + t * 0.21)) ** 6;
        v += Math.max(0, Math.sin(u * 37 - t * 0.13 + 1.3)) ** 8 * 0.8;
        v += Math.max(0, Math.sin(u * 11 + t * 0.07 + 2.1)) ** 4 * 0.6;
        LUT[k] = v * Math.sin(Math.PI * u);
      }
      const d = fb.d;
      for (let i = 0; i < d.length; i++) {
        const f = fall[i];
        if (f <= 0) continue;
        const u = ang[i];
        if (u <= 0 || u >= 1) continue;
        const v = LUT[(u * 511) | 0] * f * strength;
        if (v <= 0.02) continue;
        const x = i % W, y = (i / W) | 0;
        if (bayer8(x, y) < v) d[i] = mixc(d[i], color, 0.22);
      }
    };
  }

  /* Corner vignette via a darkening map */
  function makeVignette(W, Hh, strength = 0.5, color = hex('#1a1030')) {
    const lvl = new Uint8Array(W * Hh);
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const u = (x / W - 0.5) * 2, v = (y / Hh - 0.5) * 2;
        const d = Math.pow(Math.max(0, Math.hypot(u * 0.85, v) - 0.72) / 0.6, 1.6) * strength;
        lvl[y * W + x] = bayer8(x, y) < d ? (d > 0.8 && bayer4(x, y) < d - 0.6 ? 2 : 1) : 0;
      }
    return (fb) => {
      const d = fb.d;
      for (let i = 0; i < d.length; i++) if (lvl[i]) d[i] = mixc(d[i], color, lvl[i] === 2 ? 0.3 : 0.16);
    };
  }

  return { create, makeRays, makeVignette, H, stops, SPRITES, stamp };
})();
