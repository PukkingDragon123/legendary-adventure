/* ------------------------------------------------------------------
   Terrain — paints an area's lane into one palette-indexed buffer:
   a walkable top strip (seen slightly from above: sand ripples, grass,
   moss, planks) over a cross-section face (strata, pebbles, roots,
   seabed). Noise comes from pre-baked tiles so painting a whole area
   stays fast.
------------------------------------------------------------------- */
const Terrain = (() => {
  const { clamp, bayer4, hash, fbm } = U;
  const N = 256;
  function tile(seed, sc, oct) {
    const t = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // tileable: blend four offset samples
      const u = x / N, v = y / N;
      const a = fbm(x * sc, y * sc, seed, oct), b = fbm((x - N) * sc, y * sc, seed, oct), c = fbm(x * sc, (y - N) * sc, seed, oct), d = fbm((x - N) * sc, (y - N) * sc, seed, oct);
      t[y * N + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    // normalise to 0..1
    let lo = 1, hi = 0; for (const q of t) { if (q < lo) lo = q; if (q > hi) hi = q; }
    for (let i = 0; i < t.length; i++) t[i] = (t[i] - lo) / (hi - lo || 1);
    return t;
  }
  let T1 = null, T2 = null, T3 = null;
  function tiles() { if (!T1) { T1 = tile(3, 0.06, 4); T2 = tile(11, 0.2, 3); T3 = tile(29, 0.018, 3); } }
  const n1 = (x, y) => T1[((y & 255) << 8) | (x & 255)];
  const n2 = (x, y) => T2[((y & 255) << 8) | (x & 255)];
  const n3 = (x, y) => T3[((y & 255) << 8) | (x & 255)];
  const pickR = (ramp, t, x, y) => { const n = ramp.length, v = clamp(t, 0, 0.999) * n; return ramp[clamp(Math.floor(v) + ((v % 1) > bayer4(x, y) ? 1 : 0), 0, n - 1)]; };

  /**
   * paint(A, o): o.bb / o.bf = strip depth behind / in front of the walk line,
   * o.strip(x, y, u, e) → index for the top strip (u: 0 back edge .. 1 front edge, e: noise helpers)
   * o.face(x, y, dep, e) → index for the cross-section (dep = px below the strip's front edge)
   * o.bottom = deepest y to paint (default World.H)
   */
  function paint(A, o) {
    tiles();
    const W = World.W, bb = o.bb ?? Math.round(A.band * 0.6), bf = o.bf ?? A.band - bb;
    let ymin = 1e9;
    for (let x = 0; x <= W; x++) ymin = Math.min(ymin, World.groundAt(x) - bb - 6);
    const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.ceil(o.bottom ?? World.H);
    const w = W + 1, h = y1 - y0;
    const d = new Uint8Array(w * h);
    const e = { n1, n2, n3, pickR, hash };
    for (let x = 0; x < w; x++) {
      const g = World.groundAt(x);
      const top = Math.round(g - bb), front = Math.round(g + bf);
      for (let y = Math.max(y0, top); y < y1; y++) {
        const i = (y - y0) * w + x;
        if (y < front) d[i] = o.strip(x, y, (y - top) / Math.max(1, front - top), e) || 0;
        else d[i] = o.face(x, y, y - front, e) || 0;
      }
    }
    A.terr = { d, w, h, y0, bb, bf };
    return A.terr;
  }
  // index at world (x, y)
  function at(A, x, y) { const T = A.terr; if (!T) return 0; x = Math.round(x); y = Math.round(y) - T.y0; return x < 0 || y < 0 || x >= T.w || y >= T.h ? 0 : T.d[y * T.w + x]; }
  function put(A, x, y, v) { const T = A.terr; if (!T) return; x = Math.round(x); y = Math.round(y) - T.y0; if (x >= 0 && y >= 0 && x < T.w && y < T.h && T.d[y * T.w + x]) T.d[y * T.w + x] = v; }
  // stamp an indexed sprite into the terrain (embedded stones, roots, fossils)
  function stamp(A, s, x, y, onlyInside = true) {
    const T = A.terr;
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
      const v = s.d[yy * s.w + xx]; if (!v) continue;
      const X = Math.round(x - s.ax + xx), Y = Math.round(y - s.ay + yy) - T.y0;
      if (X < 0 || Y < 0 || X >= T.w || Y >= T.h) continue;
      if (onlyInside && !T.d[Y * T.w + X]) continue;
      T.d[Y * T.w + X] = v;
    }
  }
  return { paint, at, put, stamp, n1, n2, n3, pickR, tiles };
})();
