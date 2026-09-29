/* ------------------------------------------------------------------
   Stage — the current area at runtime and its compositor.

   Depth model (no scaling, so nothing ever stretches): every background
   layer has a parallax p (0 = horizon, 1 = the lane). Its baseline sits
   on an imaginary ground plane between the horizon line and the lane's
   reference line (sea level / valley floor), so layers slide at
   consistent speeds and the view "tilts" naturally as the camera moves
   up and down. Foreground occluders use p > 1 and are depth-blurred.
------------------------------------------------------------------- */
const Stage = (() => {
  const { clamp, lerp, mix, mixk, bayer4, hash, vnoise, TAU } = U;
  const S = {
    A: null, hour: 'noon', w: { rain: 0, fog: 0 }, look: Pal.LOOK.noon,
    fade: null, fadeT: 1, occ: null, idb: null, idOn: false,
    skyRows: null, skyKey: '', clouds: [], stars: [], soft: null, softA: null,
  };

  /* ================= Area runtime ================= */
  class Area {
    constructor(def) {
      Object.assign(this, def);
      this.def = def;
      this.M = new Pal.Table(def.mats); this.M.noSeason = !!def.noSeason;
      this.layers = []; this.props = []; this.details = []; this.fore = []; this.glows = []; this.hot = []; this.scatter = [];
      this.t = 0;
      this.band = def.band ?? 12; // depth of the walkable ground strip (drawn as a top surface)
      this.ph = def.ph ?? 0.06;
    }
    gy(x) { return World.groundAt(x); }
    // place a prop on the ground: zd = depth inside the ground strip (-band/2 back .. +band/2 front)
    put(spr, x, zd = 0, o = {}) {
      const frames = Array.isArray(spr) ? spr : [spr];
      const s0 = frames[0];
      // settle on the terrain: sit on the highest ground point under the footprint, sink a little
      let g = -1e9;
      const half = Math.max(1, Math.round((o.foot ?? s0.w * 0.5) / 2));
      for (let dx = -half; dx <= half; dx += Math.max(1, half >> 2)) g = Math.max(g, -this.gy(x + dx));
      const gy = o.y ?? (-g + (o.sink ?? 1));
      const p = Object.assign({ frames, x, y: gy + zd, zd, flip: false, sway: 0, anim: 0 }, o);
      p.y = (o.y ?? (-g + (o.sink ?? 1))) + zd;
      this.props.push(p);
      return p;
    }
    // interactive hotspot (tap target)
    addHot(h) { this.hot.push(h); return h; }
    // background layer: spr painted in layer space, baseline row `base` sits on the ground plane at parallax p
    layer(spr, p, o = {}) {
      const L = Object.assign({ spr, p, x: 0, base: spr.h - 1, haze: o.haze ?? clamp((1 - p) * 0.8, 0, 0.85), yoff: 0, frames: null, under: false }, o);
      this.layers.push(L);
      return L;
    }
    // foreground occluder anchored at world (x, y) (bottom centre), nearer than the lane by factor p
    foreItem(spr, x, y, o = {}) { const f = Object.assign({ spr, x, y, p: 1.35 }, o); this.fore.push(f); return f; }
    // 2.5D scenery standing on the ground plane behind the lane at depth p (0 = horizon, 1 = lane):
    // it slides at its own parallax speed, so the world reads as a real receding space
    scatterAt(spr, wx, p, o = {}) { const frames = Array.isArray(spr) ? spr : [spr]; const it = Object.assign({ frames, spr: frames[0], wx, x: wx, p }, o); this.scatter.push(it); return it; }
  }

  /* ================= loading ================= */
  function load(def) {
    const A = new Area(def);
    World.load(A);
    if (typeof Ripples !== 'undefined') Ripples.init();
    const t0 = performance.now();
    def.build(A);
    A.props.sort((a, b) => a.zd - b.zd || a.y - b.y);
    A.scatter.sort((a, b) => a.p - b.p);
    A.buildMs = performance.now() - t0;
    S.A = A;
    S.pal = null; S.skyKey = '';
    makeClouds(A);
    makeStars(A);
    return A;
  }

  /* ================= palettes ================= */
  function setHour(h, instant = false) {
    if (S.pal && !instant) { S.fade = snapshotPals(); S.fadeT = 0; }
    S.hour = h; S.look = Pal.LOOK[h]; S.pal = null; S.skyKey = '';
  }
  function setWeather(w) { S.w.rain = w.rain ?? S.w.rain; S.w.fog = w.fog ?? S.w.fog; S.pal = null; S.skyKey = ''; }
  function snapshotPals() { const A = S.A; if (!A || !S.pal) return null; const o = new Map(); for (const [k, v] of S.pal) o.set(k, v.slice()); return o; }
  // compiled palette for a haze amount (cached per frame state), cross-faded during hour changes
  function palFor(haze) {
    const A = S.A;
    if (!S.pal) S.pal = new Map();
    const key = Math.round(haze * 50);
    let p = S.pal.get(key);
    if (!p) {
      const hz = A.hazeC ? A.hazeC(S.hour) : null;
      p = A.M.compile(S.hour, key / 50, S.w, hz).slice();
      S.pal.set(key, p);
    }
    return p;
  }
  function framePal(haze, t) {
    const base = palFor(haze);
    const A = S.A;
    let out = base;
    if (S.fade && S.fadeT < 1 && S.fade.has(Math.round(haze * 50))) {
      out = S.tmpPal || (S.tmpPal = new Uint32Array(256));
      Pal.blend(S.fade.get(Math.round(haze * 50)), base, S.fadeT, out);
    }
    if (A.M.cyc.length) {
      const c = (S.cycPal || (S.cycPal = new Map()));
      let o = c.get(haze); if (!o) { o = new Uint32Array(256); c.set(haze, o); }
      o.set(out); Pal.cycle(A.M, o, t, A.cycleRate || 7);
      out = o;
    }
    return out;
  }

  /* ================= sky ================= */
  function makeClouds(A) {
    S.clouds = [];
    if (A.noSky) return;
    const r = U.rng(A.seed || 7);
    const n = A.clouds ?? 7;
    for (let i = 0; i < n; i++) {
      const w = 60 + r() * 110, h = w * (0.38 + r() * 0.18);
      S.clouds.push({ spr: Paint.cloud(Math.round(w), Math.round(h), i * 31 + (A.seed || 0)), x: r() * 1400, y: 20 + r() * 120, p: 0.03 + r() * 0.1, sp: 0.4 + r() });
    }
    S.clouds.sort((a, b) => a.p - b.p);
  }
  function makeStars(A) {
    S.stars = [];
    const r = U.rng(99);
    for (let i = 0; i < 160; i++) S.stars.push({ x: r() * 2000, y: r() * 420, b: r(), tw: r() * 6 });
  }
  function horizonS(cy) { const A = S.A; return Math.round((A.h0 ?? 110) - (cy - (A.cy0 ?? 0)) * A.ph); }
  function planeS(cy) { return (S.A.refY ?? World.SEA) - cy; }
  function drawSky(fb, cx, cy, t) {
    const A = S.A, L = S.look, W = fb.w, H = fb.h, d = fb.d;
    const hz = horizonS(cy);
    const skyH = A.skyH || 320;
    const key = S.hour + '|' + S.w.rain.toFixed(2) + '|' + skyH + '|' + (A.noSeason ? '' : Pal.season);
    if (S.skyKey !== key) { S.skyRows = Pal.skyRows(S.hour, skyH, { sky: A.sky && A.sky[S.hour], rain: S.w.rain, tint: A.skyTint || (A.noSeason ? null : Pal.skyTint()) }); S.skyKey = key; }
    const rows = S.skyRows;
    const yEnd = Math.min(H, A.skyTo ? A.skyTo(hz, cy) : H);
    for (let y = 0; y < yEnd; y++) {
      const k = clamp(skyH - 1 - (hz - y), 0, skyH - 1);
      const R0 = rows[k], row = y * W;
      for (let x = 0; x < W; x++) d[row + x] = bayer4(x, y) < R0.f ? R0.b : R0.a;
    }
    // stars
    const st = L.stars * (1 - S.w.rain);
    if (st > 0) {
      for (const s of S.stars) {
        const x = Math.round(((s.x - cx * 0.02) % W + W) % W), y = Math.round(s.y - (cy - (A.cy0 ?? 0)) * 0.02);
        if (y < 0 || y >= hz - 8 || y >= H) continue;
        const b = s.b * st * (0.6 + 0.4 * Math.sin(t * 2 + s.tw));
        if (b < 0.35) continue;
        const i = y * W + x;
        d[i] = U.screen(d[i], 0xffffffff, Math.min(1, b));
        if (b > 0.85 && s.b > 0.93) { if (x > 0) d[i - 1] = U.screen(d[i - 1], 0xffffffff, 0.4); if (x < W - 1) d[i + 1] = U.screen(d[i + 1], 0xffffffff, 0.4); if (y > 0) d[i - W] = U.screen(d[i - W], 0xffffffff, 0.4); }
      }
    }
    // sun / moon with glow
    if (!A.noSun) {
      const sun = L.sun, sx = Math.round(sun.x * W - cx * 0.01), sy = Math.round(hz - (1 - sun.y) * (A.sunH || 170));
      const gcol = U.hex(sun.glow), rr = sun.r;
      const vis = 1 - S.w.rain * 0.8;
      for (let y = Math.max(0, sy - rr * 5); y < Math.min(H, sy + rr * 5); y++) for (let x = Math.max(0, sx - rr * 5); x < Math.min(W, sx + rr * 5); x++) {
        const dd = Math.hypot(x - sx, y - sy);
        const i = y * W + x;
        if (dd < rr) {
          const c = U.hex(sun.c[dd < rr * 0.55 ? 2 : dd < rr * 0.85 ? 1 : 0]);
          if (sun.kind === 'moon' && Math.hypot(x - sx - rr * 0.45, y - sy + rr * 0.1) < rr * 0.82) continue; // crescent
          d[i] = mix(d[i], c, vis);
        } else {
          const g = Math.max(0, 1 - (dd - rr) / (rr * 4)) ** 2 * 0.55 * vis;
          if (g > bayer4(x, y) * 0.5) d[i] = mix(d[i], gcol, g);
        }
      }
    }
    // clouds (4-shade sprites mapped to the hour's cloud colours)
    const cc = L.cloudC;
    const cpal = [0, cc[0], cc[1], cc[2], cc[3]];
    if (S.w.rain > 0) for (let k = 1; k < 5; k++) cpal[k] = mix(cpal[k], 0xff6a655e >>> 0, 0.55 * S.w.rain);
    for (const c of S.clouds) {
      const span = W + c.spr.w + 200;
      const x = Math.round((((c.x + (typeof Wind !== 'undefined' ? Wind.off : t * 0.5) * 6 * c.sp - cx * c.p) % span) + span) % span) - c.spr.w;
      const y = Math.round(c.y + hz - 200 - (cy - (A.cy0 ?? 0)) * c.p * 0.5);
      if (y > hz || y + c.spr.h < 0) continue;
      const s = c.spr, sd = s.d;
      for (let yy = 0; yy < s.h; yy++) {
        const ty = y + yy; if (ty < 0 || ty >= H || ty >= hz + 2) continue;
        for (let xx = 0; xx < s.w; xx++) { const v = sd[yy * s.w + xx]; if (!v) continue; const tx = x + xx; if (tx < 0 || tx >= W) continue; d[ty * W + tx] = cpal[v]; }
      }
    }
  }

  /* ================= background layers ================= */
  function layerY(L, cy) {
    const hz = horizonS(cy), pl = planeS(cy);
    return Math.round(hz + (pl - hz) * L.p) - L.base + (L.yoff || 0);
  }
  function drawLayer(fb, L, cx, cy, t) {
    const spr = L.frames ? L.frames[Math.floor(t * (L.fps || 3)) % L.frames.length] : L.spr;
    const pal = framePal(L.haze, t);
    const sx = Math.round(L.x - cx * L.p), sy = layerY(L, cy);
    if (L.tile) {
      const w = spr.w;
      let x0 = ((sx % w) + w) % w - w;
      for (let x = x0; x < fb.w; x += w) Paint.blit(fb, spr, x, sy, pal, { idb: S.idOn ? S.idb : null });
    } else Paint.blit(fb, spr, sx, sy, pal, { idb: S.idOn ? S.idb : null });
    if (L.draw) L.draw(fb, sx, sy, pal, t, cx, cy);
    // solid skirt below the layer so nothing behind ever peeks through
    if (L.skirt) {
      // only under the layer's own horizontal extent (a layer that ends mid-screen must not paint the rest)
      const y0 = Math.max(0, sy + spr.h), c = pal[L.skirt];
      const xa = L.tile ? 0 : Math.max(0, sx), xb = L.tile ? fb.w : Math.min(fb.w, sx + spr.w);
      if (xb > xa) for (let y = y0; y < fb.h; y++) fb.d.fill(c, y * fb.w + xa, y * fb.w + xb);
    }
  }
  function drawLayers(fb, cx, cy, t, filter) {
    // layers, the perspective floor and depth scenery, all in depth order
    const A = S.A, sc = A.scatter;
    let si = 0, floorDone = !A.floor;
    for (const L of A.layers) {
      if (filter && !filter(L)) continue;
      while (si < sc.length && sc[si].p < L.p) drawScatterItem(fb, sc[si++], cx, cy, t);
      if (!floorDone && A.floor.p0 < L.p) { drawFloor(fb, cx, cy, t); floorDone = true; }
      drawLayer(fb, L, cx, cy, t);
    }
    if (!floorDone) drawFloor(fb, cx, cy, t);
    while (si < sc.length) drawScatterItem(fb, sc[si++], cx, cy, t);
  }
  // for areas that draw their own backdrop order: the floor and all scenery from depth pFrom on
  function drawDepthFrom(fb, cx, cy, t, pFrom = 0) {
    const A = S.A;
    if (A.floor && A.floor.p0 >= pFrom - 0.001) drawFloor(fb, cx, cy, t);
    for (const it of A.scatter) if (it.p >= pFrom) drawScatterItem(fb, it, cx, cy, t);
  }

  /* ================= 2.5D: perspective ground plane + depth scenery ================= */
  // a world point (wx, depth p) projects to screen x = W/2 + (wx - cx - W/2) * p (one-point perspective
  // toward the screen centre) and to the ground-plane row hz + (planeS - hz) * p
  const NT = (() => { const N = 256, a = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = x / N * 16, v = y / N * 16; a[y * N + x] = Math.round(U.fbm(u, v, 41, 3) * 255); } return a; })();
  const noiseAt = (x, y) => NT[((y | 0) & 255) * 256 + ((x | 0) & 255)] / 255;
  function depthHaze(p) { const A = S.A; const p0 = A.depthP0 ?? 0.5; return Math.round(Math.min(0.85, Math.max(0, (A.depthHaze ?? 0.35) * (1 - p) / (1 - p0))) * 20) / 20; }
  function drawFloor(fb, cx, cy, t) {
    const A = S.A, F = A.floor; if (!F) return;
    const W = fb.w, H = fb.h, d = fb.d;
    const hz = horizonS(cy), pl = planeS(cy);
    if (pl - hz < 8) return;
    const y0 = Math.max(0, Math.ceil(hz + (pl - hz) * F.p0)), y1 = Math.min(H, Math.ceil(hz + (pl - hz) * (F.p1 ?? 1)) + (F.extra ?? 12));
    const base = cx + W / 2, D = F.D ?? 120;
    let lastH = -1, pal = null;
    for (let y = y0; y < y1; y++) {
      const p = Math.min(1.2, (y + 0.5 - hz) / (pl - hz));
      if (p <= 0.05) continue;
      const hzz = depthHaze(Math.min(1, p));
      if (hzz !== lastH) { pal = framePal(hzz, t); lastH = hzz; }
      const inv = 1 / p, wz = D * (inv - 1), row = y * W;
      const ctx = F.row ? F.row(wz, p, t) : null; // per-row work (shorelines, river edges) done once
      if (ctx === false) continue;
      let wx = base - (W / 2) * inv;
      for (let x = 0; x < W; x++, wx += inv) {
        const v = F.tex(wx, wz, p, t, ctx);
        if (v) d[row + x] = v < 256 ? pal[v] : v;
      }
    }
  }
  function drawScatterItem(fb, it, cx, cy, t) {
    if (it.hidden) return;
    const W = fb.w, hz = horizonS(cy), pl = planeS(cy);
    if (pl - hz < 8) return;
    const s = it.frames.length > 1 ? propFrame(it, t) : it.spr;
    const X = Math.round(W / 2 + (it.wx - cx - W / 2) * it.p - s.ax), Y = Math.round(hz + (pl - hz) * it.p - s.ay + (it.yoff || 0));
    if (X > W || X + s.w < 0 || Y > fb.h || Y + s.h < 0) return;
    const pal = framePal(depthHaze(it.p), t);
    if (it.sway) Paint.blitSway(fb, s, X, Y, pal, Math.sin(t * 1.3 + it.wx * 0.01) * it.sway * ((typeof Wind !== 'undefined' ? Wind.v : 0.4) + 0.3), { flip: it.flip });
    else Paint.blit(fb, s, X, Y, pal, { flip: it.flip });
    if (it.draw) it.draw(fb, X, Y, pal, t, cx, cy);
  }

  /* ================= lane: terrain + props ================= */
  function drawTerrain(fb, cx, cy, t) {
    const A = S.A, T = A.terr;
    if (!T) return;
    const pal = framePal(0, t), occ = S.occ, W = fb.w, H = fb.h, d = fb.d, td = T.d, tw = T.w, idb = S.idOn ? S.idb : null;
    const y0 = Math.max(0, T.y0 - cy), y1 = Math.min(H, T.y0 + T.h - cy);
    const x0 = Math.max(0, -cx), x1 = Math.min(W, tw - cx);
    for (let y = y0; y < y1; y++) {
      const trow = (y + cy - T.y0) * tw + cx, row = y * W;
      for (let x = x0; x < x1; x++) {
        const v = td[trow + x];
        if (!v) continue;
        d[row + x] = pal[v];
        if (occ) occ[row + x] = 1;
        if (idb) idb[row + x] = 0;
      }
    }
  }
  function propFrame(p, t) {
    if (p.frames.length === 1) return p.frames[0];
    if (p.windFrames) { const w = (typeof Wind !== 'undefined' ? Wind.v : 0.4); const ph = Math.sin(t * (1.6 + w * 2.5) + p.x * 0.05) * (0.4 + w); return p.frames[clamp(Math.round(1 + ph), 0, p.frames.length - 1)]; }
    return p.frames[Math.floor(t * (p.fps || 4) + (p.phase || 0)) % p.frames.length];
  }
  function drawProp(fb, p, cx, cy, t, pal) {
    if (p.hidden) return;
    const s = propFrame(p, t);
    let X = Math.round(p.x - s.ax - cx), Y = Math.round(p.y - s.ay - cy);
    if (p.shake > 0) X += Math.round(Math.sin(t * 60) * p.shake * 3);
    if (X > fb.w || Y > fb.h || X + s.w < 0 || Y + s.h < 0) return;
    const o = { flip: p.flip, occ: p.noOcc ? null : S.occ, occV: 1, idb: S.idOn && !p.noOcc ? S.idb : null, fade: p.fade };
    if (p.sway) Paint.blitSway(fb, s, X, Y, pal, Math.sin(t * 1.3 + p.x * 0.01) * p.sway * ((typeof Wind !== 'undefined' ? Wind.v : 0.4) + 0.3), o);
    else Paint.blit(fb, s, X, Y, pal, o);
    if (p.draw) p.draw(fb, X, Y, pal, t, cx, cy);
  }
  function drawProps(fb, cx, cy, t, front) {
    const A = S.A, pal = framePal(0, t);
    for (const p of A.props) if ((p.zd > 0) === front && !p.late) drawProp(fb, p, cx, cy, t, pal);
    // micro details (shells, pebbles, flowers...) are cheap one-palette stamps
    for (const q of A.details) {
      if ((q.zd > 0) !== front) continue;
      const s = q.frames ? propFrame(q, t) : q.s;
      const X = Math.round(q.x - s.ax - cx), Y = Math.round(q.y - s.ay - cy);
      if (X > fb.w || Y > fb.h || X + s.w < 0 || Y + s.h < 0 || q.gone) continue;
      Paint.blit(fb, s, X, Y, pal, { flip: q.flip, idb: front && S.idOn ? S.idb : null });
    }
  }
  function drawLate(fb, cx, cy, t) { const pal = framePal(0, t); for (const p of S.A.props) if (p.late) drawProp(fb, p, cx, cy, t, pal); }

  /* ================= water ================= */
  const CAUS = (() => {
    const N = 64, c = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = Math.abs(Math.sin(x * 0.35 + Math.sin(y * 0.22) * 2) + Math.sin(y * 0.31 + Math.sin(x * 0.19) * 2.3)) ;
      c[y * N + x] = v < 0.35 ? 255 : v < 0.6 ? 110 : 0;
    }
    return { N, c };
  })();
  function drawWater(fb, cx, cy, t) {
    const A = S.A;
    if (!A.water || !A.water.length) return;
    const W = fb.w, H = fb.h, d = fb.d, occ = S.occ;
    const wc = A.waterCols ? A.waterCols(S.hour, S.w) : null;
    if (!wc) return;
    const deep = wc.deep, mid = wc.mid, top = wc.top, foam = wc.foam, hi = wc.hi, maxD = wc.maxD || 700;
    const ray = wc.ray;
    for (let x = 0; x < W; x++) {
      const wx = x + cx;
      const lvl = World.waterAt(wx);
      if (lvl === null) continue;
      const s = WorldRender.surfaceAt(wx, t);
      const sy = Math.round(s - cy);
      const gy = World.groundAt(wx);
      // under the seabed the cross-section sinks into the dark of the deep (the camera never shows a cut-away)
      const yEnd = H;
      const ys = Math.max(0, sy);
      const bedY = gy + (A.band ?? 12) * 0.5 + 2, abyss = wc.abyss || (wc.abyss = mix(deep, 0xff000000, 0.45));
      // shallow water near the shore tints less, so the beach slides gently under the sea (no hard seam)
      const sk = clamp(0.3 + (gy - lvl) / 80, 0.3, 1);
      // light shafts (slanted, swaying)
      for (let y = ys; y < yEnd; y++) {
        const i = y * W + x;
        const dep = y + cy - s;
        if (dep < 0) continue;
        const o = occ ? occ[i] : 1;
        if (o) {
          const k = clamp(dep / maxD, 0, 1);
          // foreground things in water get tinted by depth; the seabed also picks up caustics near the top
          let c = mix(d[i], k < 0.5 ? mid : deep, (0.18 + k * 0.62) * sk);
          const under = y + cy - bedY;
          if (under > 0 && o === 1) c = mix(c, abyss, clamp(0.3 + under / 34, 0, 0.94));
          if (o === 1 && dep < 260 && under <= 0) {
            const cv = CAUS.c[((y + cy + Math.round(t * 9)) & 63) * 64 + ((wx + Math.round(Math.sin(t * 0.7 + y * 0.05) * 6)) & 63)];
            if (cv) c = U.screen(c, top, (cv / 255) * 0.32 * (1 - dep / 260));
          }
          d[i] = c;
        }
        if (ray && dep < 420) {
          const rr = Math.sin((wx + (y + cy) * 0.55) * 0.045 + t * 0.35) + Math.sin((wx + (y + cy) * 0.6) * 0.017 - t * 0.2) * 0.8;
          if (rr > 1.25) d[i] = U.screen(d[i], ray, 0.1 * (1 - dep / 420) * (rr - 1.25) * 3);
        }
      }
      // surface line + sparkle
      if (sy >= 0 && sy < H) {
        const vel = typeof Ripples !== 'undefined' ? Math.abs(Ripples.vel(wx)) : 0;
        d[sy * W + x] = vel > 18 ? foam : hi;
        if (sy + 1 < H) d[(sy + 1) * W + x] = mix(d[(sy + 1) * W + x], top, 0.55);
        if (sy + 2 < H && (hash(wx >> 2, Math.floor(t * 3), 5) > 0.93)) d[(sy + 2) * W + x] = hi;
        if (sy - 1 >= 0 && vel > 30) d[(sy - 1) * W + x] = foam;
      }
      // shore swash foam
      const depth0 = gy - lvl;
      if (depth0 < 22 && sy >= 0 && sy < H) {
        const k = 1 - depth0 / 22;
        for (let j = 0; j < 3; j++) { const yy = sy + j; if (yy < H && bayer4(x, yy) < k * (1 - j * 0.3)) d[yy * W + x] = foam; }
      }
    }
  }

  /* ================= foreground (depth-blurred) ================= */
  function drawFore(fb, cx, cy, t, blurR = 2) {
    const A = S.A;
    if (!A.fore.length) return;
    const W = fb.w, H = fb.h;
    if (!S.soft || S.soft.length !== W * H) { S.soft = new Uint32Array(W * H); S.softA = new Uint8Array(W * H); S.tmpA = new Uint8Array(W * H); S.tmpC = new Uint32Array(W * H); }
    const soft = S.soft, sa = S.softA;
    sa.fill(0);
    const pal = framePal(A.foreHaze ?? 0, t);
    const dark = A.foreDark ?? 0.35;
    let any = false, x0 = W, x1 = 0, y0 = H, y1 = 0;
    const cxm = cx + W / 2, cym = cy + H / 2;
    for (const f of A.fore) {
      const s = f.spr;
      // closer than the lane: displacement from the view centre scales by p
      const ax = W / 2 + (f.x - cxm) * f.p, ay = H / 2 + (f.y - cym) * f.p;
      const X = Math.round(ax - s.w / 2);
      let Y = Math.round(f.hang ? ay : ay - s.h);
      // foreground things are nearer than the lane: they always rise from below the frame
      // (or hang from above it), never float in the middle of the picture
      if (!f.hang) { if (Y > H + 10) continue; if (Y + s.h < H + 3) Y = H + 3 - s.h; }
      else if (Y > -3) Y = -3;
      if (X > W || X + s.w < 0 || Y > H || Y + s.h < 0) continue;
      const sway = f.sway ? Math.sin(t * 1.1 + f.x) * f.sway * ((typeof Wind !== 'undefined' ? Wind.v : 0.4) + 0.4) : 0;
      const tint = f.tint ?? A.foreTint ?? 0xff201a2a, dk = f.dark ?? dark;
      for (let yy = 0; yy < s.h; yy++) {
        const ty = Y + yy; if (ty < 0 || ty >= H) continue;
        const k = f.hang ? yy / s.h : 1 - yy / s.h;
        const off = Math.round(sway * k * k);
        for (let xx = 0; xx < s.w; xx++) {
          const v = s.d[yy * s.w + (f.flip ? s.w - 1 - xx : xx)]; if (!v) continue;
          const tx = X + xx + off; if (tx < 0 || tx >= W) continue;
          const i = ty * W + tx;
          soft[i] = mix(pal[v], tint, dk); sa[i] = 255;
          any = true; if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
        }
      }
    }
    if (!any) return;
    const r = Math.round(blurR);
    if (r > 0) boxBlurRGBA(soft, sa, W, H, r, Math.max(0, x0 - r), Math.min(W - 1, x1 + r), Math.max(0, y0 - r), Math.min(H - 1, y1 + r));
    const d = fb.d, idb = S.idOn ? S.idb : null;
    for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y1 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(W - 1, x1 + r); x++) {
      const i = y * W + x, a = sa[i];
      if (!a) continue;
      d[i] = a >= 250 ? soft[i] : mixk(d[i], soft[i], a);
      if (idb && a > 128) idb[i] = 0;
    }
  }
  // separable box blur over premultiplied-ish colour + alpha, in a rectangle
  function boxBlurRGBA(c, a, W, H, r, x0, x1, y0, y1) {
    const tc = S.tmpC, ta = S.tmpA, n = 2 * r + 1;
    for (let y = y0; y <= y1; y++) {
      let sr = 0, sg = 0, sb = 0, s_a = 0;
      const row = y * W;
      for (let k = -r; k <= r; k++) { const x = clamp(x0 + k, 0, W - 1), i = row + x, al = a[i]; s_a += al; if (al) { const v = c[i]; sr += (v & 255) * al; sg += ((v >>> 8) & 255) * al; sb += ((v >>> 16) & 255) * al; } }
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        ta[i] = (s_a / n) | 0;
        tc[i] = s_a ? (0xff000000 | (((sb / s_a) | 0) << 16) | (((sg / s_a) | 0) << 8) | ((sr / s_a) | 0)) >>> 0 : 0;
        const xo = clamp(x - r, 0, W - 1), xi = clamp(x + r + 1, 0, W - 1), io = row + xo, ii = row + xi;
        const ao = a[io], ai = a[ii];
        if (ao) { const v = c[io]; sr -= (v & 255) * ao; sg -= ((v >>> 8) & 255) * ao; sb -= ((v >>> 16) & 255) * ao; }
        if (ai) { const v = c[ii]; sr += (v & 255) * ai; sg += ((v >>> 8) & 255) * ai; sb += ((v >>> 16) & 255) * ai; }
        s_a += ai - ao;
      }
    }
    for (let x = x0; x <= x1; x++) {
      let sr = 0, sg = 0, sb = 0, s_a = 0;
      for (let k = -r; k <= r; k++) { const y = clamp(y0 + k, 0, H - 1), i = y * W + x, al = ta[i]; s_a += al; if (al) { const v = tc[i]; sr += (v & 255) * al; sg += ((v >>> 8) & 255) * al; sb += ((v >>> 16) & 255) * al; } }
      for (let y = y0; y <= y1; y++) {
        const i = y * W + x;
        a[i] = (s_a / n) | 0;
        c[i] = s_a ? (0xff000000 | (((sb / s_a) | 0) << 16) | (((sg / s_a) | 0) << 8) | ((sr / s_a) | 0)) >>> 0 : 0;
        const yo = clamp(y - r, 0, H - 1), yi = clamp(y + r + 1, 0, H - 1), io = yo * W + x, ii = yi * W + x;
        const ao = ta[io], ai = ta[ii];
        if (ao) { const v = tc[io]; sr -= (v & 255) * ao; sg -= ((v >>> 8) & 255) * ao; sb -= ((v >>> 16) & 255) * ao; }
        if (ai) { const v = tc[ii]; sr += (v & 255) * ai; sg += ((v >>> 8) & 255) * ai; sb += ((v >>> 16) & 255) * ai; }
        s_a += ai - ao;
      }
    }
  }
  // full-frame box blur (depth of field on everything drawn so far), rows y0..y1
  let bt = null;
  function blurFrame(fb, r, y0 = 0, y1 = fb.h - 1) {
    if (r <= 0) return;
    const W = fb.w, H = fb.h, d = fb.d;
    if (!bt || bt.length !== W * H) bt = new Uint32Array(W * H);
    const n = 2 * r + 1;
    y0 = clamp(y0 | 0, 0, H - 1); y1 = clamp(y1 | 0, 0, H - 1);
    for (let y = y0; y <= y1; y++) {
      const row = y * W;
      let sr = 0, sg = 0, sb = 0;
      for (let k = -r; k <= r; k++) { const v = d[row + clamp(k, 0, W - 1)]; sr += v & 255; sg += (v >>> 8) & 255; sb += (v >>> 16) & 255; }
      for (let x = 0; x < W; x++) {
        bt[row + x] = (0xff000000 | (((sb / n) | 0) << 16) | (((sg / n) | 0) << 8) | ((sr / n) | 0)) >>> 0;
        const vo = d[row + clamp(x - r, 0, W - 1)], vi = d[row + clamp(x + r + 1, 0, W - 1)];
        sr += (vi & 255) - (vo & 255); sg += ((vi >>> 8) & 255) - ((vo >>> 8) & 255); sb += ((vi >>> 16) & 255) - ((vo >>> 16) & 255);
      }
    }
    for (let x = 0; x < W; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let k = -r; k <= r; k++) { const v = bt[clamp(y0 + k, y0, y1) * W + x]; sr += v & 255; sg += (v >>> 8) & 255; sb += (v >>> 16) & 255; }
      for (let y = y0; y <= y1; y++) {
        d[y * W + x] = (0xff000000 | (((sb / n) | 0) << 16) | (((sg / n) | 0) << 8) | ((sr / n) | 0)) >>> 0;
        const vo = bt[clamp(y - r, y0, y1) * W + x], vi = bt[clamp(y + r + 1, y0, y1) * W + x];
        sr += (vi & 255) - (vo & 255); sg += ((vi >>> 8) & 255) - ((vo >>> 8) & 255); sb += ((vi >>> 16) & 255) - ((vo >>> 16) & 255);
      }
    }
  }

  /* ================= glow lights + post ================= */
  function drawGlows(fb, cx, cy, t) {
    const A = S.A, W = fb.w, H = fb.h, d = fb.d;
    const night = S.hour === 'night' ? 1 : S.hour === 'dusk' ? 0.6 : S.hour === 'dawn' ? 0.25 : 0;
    for (const g of A.glows) {
      const k = (g.always ? 1 : night) * (g.k ?? 1) * (g.flicker ? 0.85 + 0.15 * Math.sin(t * 13 + g.x) * Math.sin(t * 7.3) : 1);
      if (k <= 0.02) continue;
      const X = g.x - cx, Y = g.y - cy, R0 = g.r, RY = Math.ceil(R0 / (g.flat || 1));
      if (X + R0 < 0 || X - R0 > W || Y + RY < 0 || Y - RY > H) continue;
      for (let y = Math.max(0, Math.floor(Y - RY)); y < Math.min(H, Y + RY); y++) for (let x = Math.max(0, Math.floor(X - R0)); x < Math.min(W, X + R0); x++) {
        const dd = Math.hypot(x - X, (y - Y) * (g.flat || 1)) / R0;
        if (dd >= 1) continue;
        const a = (1 - dd) * (1 - dd) * k * (g.a ?? 0.5);
        const i = y * W + x;
        d[i] = U.screen(d[i], g.c, a);
      }
    }
  }
  // bright-pass bloom at quarter resolution + vignette
  let bw = 0, bh = 0, bb = null, bb2 = null;
  function bloom(fb, amt, th) {
    const W = fb.w, H = fb.h, d = fb.d;
    const w = (W >> 2) + 1, h = (H >> 2) + 1;
    if (w !== bw || h !== bh) { bw = w; bh = h; bb = new Float32Array(w * h * 3); bb2 = new Float32Array(w * h * 3); }
    bb.fill(0);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const v = d[y * W + x], r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
      const l = r * 0.3 + g * 0.59 + b * 0.11;
      if (l < th) continue;
      const k = (l - th) / (255 - th), j = ((y >> 2) * w + (x >> 2)) * 3;
      bb[j] += r * k; bb[j + 1] += g * k; bb[j + 2] += b * k;
    }
    // blur (two box passes)
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 3; for (let c = 0; c < 3; c++) bb2[j + c] = (bb[j + c] * 2 + (x > 0 ? bb[j - 3 + c] : 0) + (x < w - 1 ? bb[j + 3 + c] : 0)) * 0.25; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 3; for (let c = 0; c < 3; c++) bb[j + c] = (bb2[j + c] * 2 + (y > 0 ? bb2[j - w * 3 + c] : 0) + (y < h - 1 ? bb2[j + w * 3 + c] : 0)) * 0.25; }
    }
    const k = amt * 0.25;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = ((y >> 2) * w + (x >> 2)) * 3;
      const ar = bb[j] * k, ag = bb[j + 1] * k, ab = bb[j + 2] * k;
      if (ar + ag + ab < 3) continue;
      const i = y * W + x, v = d[i];
      d[i] = U.pack((v & 255) + ar, ((v >>> 8) & 255) + ag, ((v >>> 16) & 255) + ab);
    }
  }
  function vignette(fb, k = 0.28, col = 0xff140c1a) {
    const W = fb.w, H = fb.h, d = fb.d;
    for (let y = 0; y < H; y += 1) {
      const vy = (y / H - 0.5) * 2;
      for (let x = 0; x < W; x++) {
        const vx = (x / W - 0.5) * 2, r = vx * vx * 0.6 + vy * vy * 0.8;
        if (r < 0.55) continue;
        const a = Math.min(1, (r - 0.55) * k * 1.4);
        if (a > bayer4(x, y) * 0.3) d[y * W + x] = mix(d[y * W + x], col, a);
      }
    }
  }

  function update(dt, t) {
    if (S.fade && S.fadeT < 1) { S.fadeT += dt / 1.6; if (S.fadeT >= 1) S.fade = null; }
    const A = S.A;
    if (A) { A.t += dt; for (const p of A.props) if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 2); }
  }

  return { S, Area, load, setHour, setWeather, palFor, framePal, drawSky, drawLayers, drawLayer, layerY, drawDepthFrom, drawFloor, noiseAt, depthHaze, horizonS, planeS, drawTerrain, drawProps, drawProp, drawLate, drawWater, drawFore, blurFrame, drawGlows, bloom, vignette, update, get A() { return S.A; } };
})();
